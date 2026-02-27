import { createSignal, createMemo, createEffect, For, Show, onCleanup } from "solid-js";
import { useEscapeLayer } from "../layout/use-escape-layer.js";
import { ConfirmDialog } from "../layout/ConfirmDialog.js";
import QRCode from "qrcode";
import {
  toHex,
  verifyAndDecodeAction,
  decodeGroupInvite,
} from "anypost-core/protocol";
import type {
  ActionPayload,
  ActionRole,
  GroupMember,
  SignedActionEnvelope,
  ConnectionMetrics,
  PeerDiscoveryMetrics,
  JoinRetryEntry,
  JoinPolicy,
  SyncPeerProgress,
} from "anypost-core/protocol";
import type { ContactsBook } from "anypost-core/data";

export type PendingJoinRequest = {
  readonly publicKeyHex: string;
  readonly publicKey: Uint8Array;
};

export type InviteCreateOptions =
  | {
      readonly kind: "targeted-peer";
      readonly targetPeerId: string;
      readonly includeRelay?: boolean;
    }
  | {
      readonly kind: "open";
      readonly expiresInMinutes?: number;
      readonly maxJoiners?: number;
      readonly includeRelay?: boolean;
    };

export type InviteCreateResult = {
  readonly error: string | null;
  readonly code: string | null;
};

type GroupInfoPanelProps = {
  readonly groupId: string | null;
  readonly groupName: string;
  readonly members: ReadonlyMap<string, GroupMember>;
  readonly actionEnvelopes: readonly SignedActionEnvelope[];
  readonly connectionMetrics: ConnectionMetrics | null;
  readonly activeGroupDiscoveryMetrics: PeerDiscoveryMetrics | null;
  readonly joinRetryEntry: JoinRetryEntry | null;
  readonly syncProgressByPeer: ReadonlyMap<string, SyncPeerProgress>;
  readonly pendingJoins: readonly PendingJoinRequest[];
  readonly joinPolicy: JoinPolicy;
  readonly isAdmin: boolean;
  readonly ownRole: ActionRole | null;
  readonly ownPublicKeyHex: string;
  readonly ownDisplayName: string;
  readonly publicKeyToPeerId: ReadonlyMap<string, string>;
  readonly contactsBook?: ContactsBook;
  readonly connectedPeerIds: ReadonlySet<string>;
  readonly latencyMap: ReadonlyMap<string, number>;
  readonly onStartDirectMessage?: ((peerId: string) => Promise<string | null> | string | null) | null;
  readonly onApproveJoin: (memberPublicKey: Uint8Array) => void;
  readonly onRemoveMember: (memberPublicKey: Uint8Array) => void;
  readonly onChangeMemberRole: ((memberPublicKey: Uint8Array, newRole: ActionRole) => Promise<string | null>) | null;
  readonly onAddByPeerId: (peerId: string) => string | null;
  readonly onRetryJoinNow: () => void;
  readonly onCancelJoinRetry: () => void;
  readonly onCreateInvite: ((options: InviteCreateOptions) => InviteCreateResult) | null;
  readonly directMessagePeerId?: string | null;
  readonly directMessagePeerLabel?: string | null;
  readonly directMessageBlocked?: boolean;
  readonly onSetDirectMessageBlocked?: ((peerId: string, blocked: boolean) => void) | null;
  readonly onSetJoinPolicy: ((joinPolicy: JoinPolicy) => Promise<string | null>) | null;
  readonly onRenameGroup: ((newName: string) => Promise<string | null>) | null;
  readonly onLeaveGroup: () => void;
};

const AVATAR_COLORS = [
  "bg-red-600", "bg-blue-600", "bg-green-600", "bg-purple-600",
  "bg-orange-600", "bg-teal-600", "bg-pink-600", "bg-indigo-600",
];

const avatarColor = (id: string): string => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const truncatePeerId = (peerId: string): string =>
  peerId.length > 20 ? `${peerId.slice(0, 12)}...${peerId.slice(-6)}` : peerId;

const truncateHex = (hex: string): string =>
  hex.length > 16 ? `${hex.slice(0, 8)}...${hex.slice(-8)}` : hex;

const ratio = (num: number, den: number): string =>
  den <= 0 ? "0%" : `${Math.round((num / den) * 100)}%`;

const formatMs = (ms: number | null): string =>
  ms === null ? "--" : `${Math.round(ms)}ms`;

const formatDuration = (ms: number): string => {
  if (ms <= 0) return "now";
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes === 0 ? `${hours}h` : `${hours}h ${remMinutes}m`;
};

const ENVELOPES_PER_PAGE = 10;
const SYNC_ACTIVE_MS = 30_000;
const SYNC_STALE_MS = 5 * 60_000;
const SYNC_PREVIEW_COUNT = 6;

const formatRelativeTime = (timestampMs: number | null, nowMs: number): string => {
  if (timestampMs === null) return "--";
  const deltaMs = Math.max(0, nowMs - timestampMs);
  if (deltaMs < 3_000) return "just now";
  const deltaSeconds = Math.floor(deltaMs / 1_000);
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
};

const syncActivityAtMs = (progress: SyncPeerProgress): number =>
  Math.max(
    progress.lastRequestedAtMs ?? 0,
    progress.lastServedAtMs ?? 0,
    progress.lastReceivedAtMs ?? 0,
  );

const summarizePayload = (payload: ActionPayload): string => {
  switch (payload.type) {
    case "group-created":
      return `Group created: "${payload.groupName}" (${payload.joinPolicy ?? "manual"})`;
    case "dm-created":
      return `DM created for ${payload.peerIds[0]} and ${payload.peerIds[1]}`;
    case "join-request":
      return `Join request from ${truncateHex(toHex(payload.requesterPublicKey))}`;
    case "member-approved":
      return `Member approved (${payload.role}): ${truncateHex(toHex(payload.memberPublicKey))}`;
    case "member-left":
      return "Member left";
    case "member-removed":
      return `Member removed: ${truncateHex(toHex(payload.memberPublicKey))}`;
    case "role-changed":
      return `Role changed to ${payload.newRole}: ${truncateHex(toHex(payload.memberPublicKey))}`;
    case "group-renamed":
      return `Group renamed to "${payload.newName}"`;
    case "join-policy-changed":
      return `Join policy changed: ${payload.joinPolicy}`;
    case "message":
      return `Message: ${payload.text.slice(0, 80)}${payload.text.length > 80 ? "..." : ""}`;
    case "message-edited":
      return `Message edited: ${toHex(payload.targetHash).slice(0, 8)}...`;
    case "message-deleted":
      return `Message deleted: ${toHex(payload.targetHash).slice(0, 8)}...`;
    case "read-receipt":
      return `Read receipt up to ${toHex(payload.upToHash).slice(0, 8)}...`;
    case "merge":
      return "Merge";
  }
};

const RoleBadge = (props: { readonly role: "owner" | "admin" | "member" }) => (
  <span
    class="text-[10px] font-medium px-1.5 py-0.5 rounded"
    classList={{
      "bg-amber-400/20 text-amber-300": props.role === "owner",
      "bg-tg-accent/20 text-tg-accent": props.role === "admin",
      "bg-tg-text-dim/20 text-tg-text-dim": props.role === "member",
    }}
  >
    {props.role === "owner" ? "Owner" : props.role === "admin" ? "Admin" : "Member"}
  </span>
);

const formatLastSeen = (timestampMs: number): string => {
  const delta = Date.now() - timestampMs;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
};

export const GroupInfoPanel = (props: GroupInfoPanelProps) => {
  const memberEntries = () => [...props.members.values()];
  const [copiedGroupId, setCopiedGroupId] = createSignal(false);
  const [copiedInvite, setCopiedInvite] = createSignal(false);
  const [addPeerIdInput, setAddPeerIdInput] = createSignal("");
  const [addPeerIdError, setAddPeerIdError] = createSignal("");
  const [renameInput, setRenameInput] = createSignal("");
  const [renameError, setRenameError] = createSignal("");
  const [renaming, setRenaming] = createSignal(false);
  const [inviteMode, setInviteMode] = createSignal<"targeted-peer" | "open">("open");
  const [inviteIncludeRelay, setInviteIncludeRelay] = createSignal(false);
  const [inviteTargetPeerId, setInviteTargetPeerId] = createSignal("");
  const [inviteExpiresMinutesInput, setInviteExpiresMinutesInput] = createSignal("");
  const [inviteMaxJoinersInput, setInviteMaxJoinersInput] = createSignal("");
  const [inviteError, setInviteError] = createSignal("");
  const [inviteCode, setInviteCode] = createSignal("");
  const [inviteQrDataUrl, setInviteQrDataUrl] = createSignal("");
  const [showInviteQr, setShowInviteQr] = createSignal(false);
  const [joinPolicyError, setJoinPolicyError] = createSignal("");
  const [roleActionError, setRoleActionError] = createSignal("");
  const [roleActionTargetHex, setRoleActionTargetHex] = createSignal<string | null>(null);
  const [memberDirectMessageError, setMemberDirectMessageError] = createSignal("");
  const [memberDirectMessagePendingPeerId, setMemberDirectMessagePendingPeerId] = createSignal<string | null>(null);
  const [envelopePage, setEnvelopePage] = createSignal(0);
  const [syncExpanded, setSyncExpanded] = createSignal(false);
  const [syncAppPeersOnly, setSyncAppPeersOnly] = createSignal(true);
  const [nowMs, setNowMs] = createSignal(Date.now());
  const [addMembersOpen, setAddMembersOpen] = createSignal(false);
  const [contactSearchInput, setContactSearchInput] = createSignal("");
  const [leaveConfirmOpen, setLeaveConfirmOpen] = createSignal(false);
  const [pendingConfirm, setPendingConfirm] = createSignal<
    | { readonly type: "promote" | "demote" | "transfer-owner" | "remove"; readonly member: GroupMember; readonly label: string }
    | { readonly type: "block-dm-peer"; readonly peerId: string; readonly label: string }
    | null
  >(null);

  useEscapeLayer("group-info-add-members", () => {
    setAddMembersOpen(false);
    setContactSearchInput("");
    setAddPeerIdError("");
  }, addMembersOpen);

  const nowInterval = setInterval(() => setNowMs(Date.now()), 1000);
  onCleanup(() => clearInterval(nowInterval));

  createEffect(() => {
    props.groupId;
    setEnvelopePage(0);
    setSyncExpanded(false);
    setSyncAppPeersOnly(true);
    setInviteCode("");
    setInviteQrDataUrl("");
    setShowInviteQr(false);
    setAddMembersOpen(false);
    setContactSearchInput("");
    setLeaveConfirmOpen(false);
    setPendingConfirm(null);
  });

  createEffect(() => {
    setRenameInput(props.groupName);
    setRenameError("");
  });

  createEffect(() => {
    const code = inviteCode();
    if (!code) {
      setInviteQrDataUrl("");
      return;
    }
    void QRCode.toDataURL(code, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 220,
    }).then((dataUrl) => {
      if (inviteCode() === code) setInviteQrDataUrl(dataUrl);
    }).catch(() => {
      if (inviteCode() === code) setInviteQrDataUrl("");
    });
  });

  const envelopeList = createMemo(() => [...props.actionEnvelopes].reverse());
  const envelopePageCount = createMemo(() =>
    Math.max(1, Math.ceil(envelopeList().length / ENVELOPES_PER_PAGE)));
  const currentEnvelopePage = createMemo(() =>
    Math.min(envelopePage(), envelopePageCount() - 1));

  createEffect(() => {
    const maxPage = envelopePageCount() - 1;
    if (envelopePage() > maxPage) setEnvelopePage(maxPage);
  });

  const envelopeRows = createMemo(() => {
    const start = currentEnvelopePage() * ENVELOPES_PER_PAGE;
    const pageSlice = envelopeList().slice(start, start + ENVELOPES_PER_PAGE);
    return pageSlice.map((envelope) => {
      const hashHex = toHex(envelope.hash);
      const result = verifyAndDecodeAction(envelope);
      if (!result.success) {
        return {
          hashHex,
          actionType: "invalid",
          summary: `Invalid envelope: ${result.error.message}`,
          timestampLabel: "Unknown time",
          authorLabel: "Unknown author",
          signatureLength: envelope.signature.length,
          signedBytesLength: envelope.signedBytes.length,
          valid: false as const,
        };
      }

      const action = result.data;
      return {
        hashHex,
        actionType: action.payload.type,
        summary: summarizePayload(action.payload),
        timestampLabel: new Date(action.timestamp).toLocaleString(),
        authorLabel: truncateHex(toHex(action.authorPublicKey)),
        signatureLength: envelope.signature.length,
        signedBytesLength: envelope.signedBytes.length,
        valid: true as const,
      };
    });
  });

  const syncRows = createMemo(() => {
    const now = nowMs();
    const rows = [...props.syncProgressByPeer.entries()].map(([peerId, progress]) => {
      const activityAtMs = syncActivityAtMs(progress);
      const contact = props.contactsBook?.get(peerId);
      const peerLabel = contact?.nickname?.trim()
        || contact?.selfName?.trim()
        || truncatePeerId(peerId);
      const envelopeHint = progress.lastReceivedAtMs !== null
        ? `recv ${progress.lastReceivedEnvelopeCount}`
        : progress.lastServedAtMs !== null
          ? `served ${progress.lastServedEnvelopeCount}`
          : progress.lastRequestedAtMs !== null
            ? "req"
            : "--";
      const ageMs = activityAtMs > 0 ? now - activityAtMs : Number.POSITIVE_INFINITY;
      const status = ageMs <= SYNC_ACTIVE_MS
        ? "active"
        : ageMs <= SYNC_STALE_MS
          ? "stale"
          : "idle";
      return {
        peerId,
        peerLabel,
        connected: props.connectedPeerIds.has(peerId),
        progress,
        activityAtMs,
        lastSyncLabel: activityAtMs > 0 ? formatRelativeTime(activityAtMs, now) : "--",
        envelopeHint,
        status,
      };
    });

    rows.sort((a, b) => {
      if (b.activityAtMs !== a.activityAtMs) return b.activityAtMs - a.activityAtMs;
      return a.peerId.localeCompare(b.peerId);
    });
    return rows;
  });

  const appPeerIds = createMemo(() => {
    const ids = new Set<string>();
    for (const member of props.members.values()) {
      const peerId = props.publicKeyToPeerId.get(member.publicKeyHex);
      if (peerId) ids.add(peerId);
    }
    if (props.directMessagePeerId) ids.add(props.directMessagePeerId);
    return ids;
  });

  const visibleSyncRows = createMemo(() => {
    if (!syncAppPeersOnly()) return syncRows();
    const peers = appPeerIds();
    return syncRows().filter((row) => peers.has(row.peerId));
  });

  const inviteDetails = createMemo(() => {
    const code = inviteCode().trim();
    if (!code) return null;
    const decoded = decodeGroupInvite(code);
    if (!decoded.success) {
      return {
        error: decoded.error.message,
      } as const;
    }
    const invite = decoded.data;
    const genesis = verifyAndDecodeAction(invite.genesisEnvelope);
    const claims = invite.inviteGrant?.claims;

    return {
      adminPeerId: invite.adminPeerId,
      relayAddr: invite.relayAddr ?? null,
      tokenKind: claims?.kind ?? null,
      tokenId: claims?.tokenId ?? null,
      targetPeerId: claims?.kind === "targeted-peer" ? claims.targetPeerId : null,
      expiresAt: claims?.kind === "open" ? claims.expiresAt ?? null : null,
      maxJoiners: claims?.kind === "open" ? claims.maxJoiners ?? null : null,
      genesis: genesis.success
        ? {
            groupId: genesis.data.groupId,
            actionId: genesis.data.id,
            timestamp: genesis.data.timestamp,
            payloadType: genesis.data.payload.type,
            groupName: genesis.data.payload.type === "group-created"
              ? genesis.data.payload.groupName
              : null,
            dmPeerIds: genesis.data.payload.type === "dm-created"
              ? genesis.data.payload.peerIds
              : null,
            parentHashCount: genesis.data.parentHashes.length,
            authorPublicKeyHex: toHex(genesis.data.authorPublicKey),
          }
        : {
            error: genesis.error.message,
          },
      envelopeHashHex: toHex(invite.genesisEnvelope.hash),
      signedBytesLength: invite.genesisEnvelope.signedBytes.length,
      signatureLength: invite.genesisEnvelope.signature.length,
    } as const;
  });

  const memberPublicKeyHexSet = createMemo(() => {
    const set = new Set<string>();
    for (const member of props.members.values()) {
      const peerId = props.publicKeyToPeerId.get(member.publicKeyHex);
      if (peerId) set.add(peerId);
    }
    return set;
  });

  const filteredContacts = createMemo(() => {
    if (!props.contactsBook) return [];
    const search = contactSearchInput().trim().toLowerCase();
    const existingPeerIds = memberPublicKeyHexSet();
    const results: {
      readonly peerId: string;
      readonly displayName: string;
      readonly lastSeenLabel: string;
    }[] = [];

    for (const [peerId, entry] of props.contactsBook) {
      if (existingPeerIds.has(peerId)) continue;

      const displayName = entry.nickname?.trim()
        || entry.selfName?.trim()
        || truncatePeerId(peerId);

      if (search && !displayName.toLowerCase().includes(search) && !peerId.toLowerCase().includes(search)) {
        continue;
      }

      results.push({
        peerId,
        displayName,
        lastSeenLabel: formatLastSeen(entry.lastSeenAt),
      });
    }

    return results;
  });

  const copyGroupId = () => {
    if (!props.groupId) return;
    navigator.clipboard.writeText(props.groupId).then(() => {
      setCopiedGroupId(true);
      setTimeout(() => setCopiedGroupId(false), 2000);
    }).catch(() => {});
  };

  const handleCopyInvite = () => {
    if (!props.onCreateInvite) return;
    setInviteError("");

    let result: InviteCreateResult = { error: null, code: null };
    if (inviteMode() === "targeted-peer") {
      const target = inviteTargetPeerId().trim();
      if (!target) {
        setInviteError("Target peer ID is required");
        return;
      }
      result = props.onCreateInvite({
        kind: "targeted-peer",
        targetPeerId: target,
        includeRelay: inviteIncludeRelay(),
      });
    } else {
      const rawExpiry = inviteExpiresMinutesInput().trim();
      const rawMaxJoiners = inviteMaxJoinersInput().trim();
      const expiresInMinutes = rawExpiry.length > 0 ? Number(rawExpiry) : undefined;
      const maxJoiners = rawMaxJoiners.length > 0 ? Number(rawMaxJoiners) : undefined;
      if (expiresInMinutes !== undefined && (!Number.isFinite(expiresInMinutes) || expiresInMinutes <= 0)) {
        setInviteError("Expiry must be a positive number of minutes");
        return;
      }
      if (maxJoiners !== undefined && (!Number.isInteger(maxJoiners) || maxJoiners <= 0)) {
        setInviteError("Max joiners must be a positive integer");
        return;
      }
      result = props.onCreateInvite({
        kind: "open",
        expiresInMinutes,
        maxJoiners,
        includeRelay: inviteIncludeRelay(),
      });
    }

    if (result.error) {
      setInviteError(result.error);
      return;
    }
    if (!result.code) {
      setInviteError("Failed to build invite");
      return;
    }

    setInviteCode(result.code);
    navigator.clipboard.writeText(result.code).catch(() => {});
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  const handleAddByPeerId = () => {
    const peerId = addPeerIdInput().trim();
    if (!peerId) return;

    setAddPeerIdError("");
    const error = props.onAddByPeerId(peerId);
    if (error) {
      setAddPeerIdError(error);
      return;
    }
    setAddPeerIdInput("");
  };

  const handleSetJoinPolicy = (joinPolicy: JoinPolicy) => {
    if (!props.onSetJoinPolicy) return;
    setJoinPolicyError("");
    props.onSetJoinPolicy(joinPolicy).then((error) => {
      if (error) setJoinPolicyError(error);
    }).catch(() => setJoinPolicyError("Failed to update join policy"));
  };

  const handleRenameGroup = () => {
    if (!props.onRenameGroup) return;
    const nextName = renameInput().trim();
    if (nextName.length === 0) {
      setRenameError("Group name cannot be empty");
      return;
    }
    setRenameError("");
    setRenaming(true);
    props.onRenameGroup(nextName).then((error) => {
      if (error) setRenameError(error);
    }).catch(() => setRenameError("Failed to rename group")).finally(() => {
      setRenaming(false);
    });
  };

  const handleChangeMemberRole = (member: GroupMember, newRole: ActionRole) => {
    if (!props.onChangeMemberRole) return;
    setRoleActionError("");
    setRoleActionTargetHex(member.publicKeyHex);
    props.onChangeMemberRole(member.publicKey, newRole).then((error) => {
      if (error) setRoleActionError(error);
    }).catch(() => setRoleActionError("Failed to update member role")).finally(() => {
      setRoleActionTargetHex(null);
    });
  };

  const handleStartDirectMessage = (peerId: string) => {
    if (!props.onStartDirectMessage) return;
    setMemberDirectMessageError("");
    setMemberDirectMessagePendingPeerId(peerId);
    Promise.resolve(props.onStartDirectMessage(peerId)).then((error) => {
      if (error) setMemberDirectMessageError(error);
    }).catch(() => {
      setMemberDirectMessageError("Failed to open direct chat");
    }).finally(() => {
      setMemberDirectMessagePendingPeerId(null);
    });
  };

  const handleAddContact = (peerId: string) => {
    setAddPeerIdError("");
    const error = props.onAddByPeerId(peerId);
    if (error) {
      setAddPeerIdError(error);
      return;
    }
  };

  return (
    <Show when={!addMembersOpen()} fallback={
      <div class="space-y-3">
        <div class="flex items-center gap-2 pb-2 border-b border-tg-border">
          <button
            class="text-tg-accent text-sm p-1 cursor-pointer"
            onClick={() => {
              setAddMembersOpen(false);
              setContactSearchInput("");
              setAddPeerIdError("");
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h3 class="text-sm font-semibold text-tg-text flex-1">Add Members</h3>
          <span class="text-xs text-tg-text-dim">{props.members.size} members</span>
        </div>

        <input
          type="text"
          value={contactSearchInput()}
          onInput={(e) => setContactSearchInput(e.currentTarget.value)}
          placeholder="Search contacts..."
          autofocus
          class="w-full px-2.5 py-2 rounded-lg bg-tg-sidebar border border-tg-border text-tg-text text-xs placeholder:text-tg-text-dim"
        />

        <Show when={props.onCreateInvite !== null}>
          <button
            class="flex items-center gap-2 w-full text-left py-2 px-2 rounded hover:bg-tg-hover cursor-pointer"
            onClick={handleCopyInvite}
          >
            <div class="w-8 h-8 rounded-full bg-tg-accent/20 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-4 h-4 text-tg-accent">
                <path d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101" />
                <path d="M10.172 13.828a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm text-tg-accent">Invite via Link</div>
              <div class="text-[10px] text-tg-text-dim">Create and copy invite code</div>
            </div>
          </button>
        </Show>

        <Show when={filteredContacts().length > 0}>
          <div class="text-[10px] text-tg-text-dim uppercase tracking-wider px-2">
            Contacts
          </div>
          <div class="space-y-0.5">
            <For each={filteredContacts()}>
              {(contact) => (
                <button
                  class="flex items-center gap-2.5 w-full text-left py-2 px-2 rounded hover:bg-tg-hover cursor-pointer"
                  onClick={() => handleAddContact(contact.peerId)}
                >
                  <div class={`w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-xs shrink-0 ${avatarColor(contact.peerId)}`}>
                    {contact.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm text-tg-text truncate">{contact.displayName}</div>
                    <div class="text-[10px] text-tg-text-dim">last seen {contact.lastSeenLabel}</div>
                  </div>
                </button>
              )}
            </For>
          </div>
        </Show>

        <Show when={filteredContacts().length === 0 && contactSearchInput().trim()}>
          <p class="text-xs text-tg-text-dim px-2 py-3 text-center">No contacts found</p>
        </Show>

        <div class="border-t border-tg-border pt-3">
          <div class="text-[10px] text-tg-text-dim uppercase tracking-wider px-2 mb-2">
            Add by Peer ID
          </div>
          <div class="flex gap-2">
            <input
              type="text"
              class="flex-1 bg-tg-input text-tg-text text-xs font-mono px-2.5 py-1.5 rounded border border-tg-border focus:border-tg-accent focus:outline-none"
              placeholder="12D3KooW..."
              value={addPeerIdInput()}
              onInput={(e) => {
                setAddPeerIdInput(e.currentTarget.value);
                setAddPeerIdError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddByPeerId();
              }}
            />
            <button
              class="text-xs bg-tg-accent text-white px-3 py-1.5 rounded hover:bg-tg-accent/80 cursor-pointer disabled:opacity-50"
              disabled={!addPeerIdInput().trim()}
              onClick={handleAddByPeerId}
            >
              Add
            </button>
          </div>
          <Show when={addPeerIdError()}>
            <p class="text-[10px] text-red-400 mt-1 px-2">{addPeerIdError()}</p>
          </Show>
        </div>
      </div>
    }>
      <div class="space-y-4">
        <div class="flex flex-col items-center pt-2 pb-1">
          <div class={`w-16 h-16 rounded-full flex items-center justify-center text-white font-semibold text-xl ${avatarColor(props.groupId ?? props.groupName)}`}>
            {props.groupName.charAt(0).toUpperCase()}
          </div>
          <h3 class="text-lg font-semibold text-tg-text mt-3 text-center">
            {props.groupName}
          </h3>
          <span class="text-xs text-tg-text-dim mt-0.5">
            {props.members.size} {props.members.size === 1 ? "member" : "members"}
          </span>
        </div>

        <Show when={props.groupId}>
          <button
            class="flex items-center gap-2 w-full text-left py-2 px-2 rounded hover:bg-tg-hover cursor-pointer"
            onClick={copyGroupId}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-4 h-4 text-tg-text-dim shrink-0">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="3" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a3 3 0 0 1 0 5.75" />
            </svg>
            <div class="flex-1 min-w-0">
              <div class="text-[10px] text-tg-text-dim">Group ID</div>
              <div class="font-mono text-xs text-tg-text truncate">{props.groupId}</div>
            </div>
            <span class="text-tg-accent text-[10px] shrink-0">
              {copiedGroupId() ? "Copied!" : "Copy"}
            </span>
          </button>
        </Show>

        <Show when={props.isAdmin && props.onCreateInvite !== null}>
          <div class="border-t border-tg-border pt-3">
            <div class="rounded border border-tg-border bg-tg-hover px-2 py-2 space-y-2">
              <h4 class="text-xs font-medium text-tg-text-dim uppercase tracking-wider">
                Create Invite
              </h4>
              <div class="flex gap-2 text-xs">
                <label class="flex items-center gap-1 text-tg-text">
                  <input
                    type="radio"
                    checked={inviteMode() === "open"}
                    onChange={() => setInviteMode("open")}
                  />
                  Any Peer
                </label>
                <label class="flex items-center gap-1 text-tg-text">
                  <input
                    type="radio"
                    checked={inviteMode() === "targeted-peer"}
                    onChange={() => setInviteMode("targeted-peer")}
                  />
                  Specific Peer
                </label>
              </div>
              <label class="flex items-center gap-1.5 text-[11px] text-tg-text-dim">
                <input
                  type="checkbox"
                  checked={inviteIncludeRelay()}
                  onChange={(e) => setInviteIncludeRelay(e.currentTarget.checked)}
                />
                Include relay address in invite
              </label>
              <Show when={inviteMode() === "targeted-peer"}>
                <input
                  type="text"
                  class="w-full bg-tg-input text-tg-text text-xs font-mono px-2.5 py-1.5 rounded border border-tg-border focus:border-tg-accent focus:outline-none"
                  placeholder="12D3KooW..."
                  value={inviteTargetPeerId()}
                  onInput={(e) => {
                    setInviteTargetPeerId(e.currentTarget.value);
                    setInviteError("");
                  }}
                />
              </Show>
              <Show when={inviteMode() === "open"}>
                <div class="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min="1"
                    class="w-full bg-tg-input text-tg-text text-xs px-2.5 py-1.5 rounded border border-tg-border focus:border-tg-accent focus:outline-none"
                    placeholder="Expiry (min)"
                    value={inviteExpiresMinutesInput()}
                    onInput={(e) => {
                      setInviteExpiresMinutesInput(e.currentTarget.value);
                      setInviteError("");
                    }}
                  />
                  <input
                    type="number"
                    min="1"
                    class="w-full bg-tg-input text-tg-text text-xs px-2.5 py-1.5 rounded border border-tg-border focus:border-tg-accent focus:outline-none"
                    placeholder="Max joiners"
                    value={inviteMaxJoinersInput()}
                    onInput={(e) => {
                      setInviteMaxJoinersInput(e.currentTarget.value);
                      setInviteError("");
                    }}
                  />
                </div>
              </Show>
              <button
                class="w-full py-2 px-3 rounded-lg bg-tg-accent text-white text-sm hover:bg-tg-accent/80 cursor-pointer"
                onClick={handleCopyInvite}
              >
                {copiedInvite() ? "Invite copied!" : "Copy Invite Code"}
              </button>
              <Show when={inviteCode()}>
                <button
                  class="w-full py-1.5 px-3 rounded-lg border border-tg-border text-xs text-tg-text hover:bg-tg-hover cursor-pointer"
                  onClick={() => setShowInviteQr((v) => !v)}
                >
                  {showInviteQr() ? "Hide Invite QR" : "Show Invite QR"}
                </button>
              </Show>
              <Show when={inviteError()}>
                <p class="text-[10px] text-red-400">{inviteError()}</p>
              </Show>
              <Show when={showInviteQr() && inviteCode()}>
                <div class="rounded border border-tg-border bg-tg-chat p-2">
                  <Show
                    when={inviteQrDataUrl()}
                    fallback={<div class="text-[10px] text-tg-text-dim">Generating QR...</div>}
                  >
                    <img src={inviteQrDataUrl()} alt="Invite QR" class="mx-auto w-52 h-52 rounded bg-white p-2" />
                  </Show>
                  <p class="text-[10px] text-tg-text-dim mt-2 break-all">
                    {inviteCode()}
                  </p>
                </div>
              </Show>
              <Show when={inviteDetails()}>
                {(details) => (
                  <details class="rounded border border-tg-border bg-tg-chat p-2">
                    <summary class="text-[10px] text-tg-text-dim cursor-pointer">Invite Contents</summary>
                    <div class="mt-1 space-y-1">
                      <Show when={"error" in details()}>
                        <p class="text-[10px] text-red-400">
                          Failed to decode invite: {details().error}
                        </p>
                      </Show>
                      <Show when={!("error" in details())}>
                        <div class="text-[10px] text-tg-text-dim space-y-1">
                          <div>Admin: <span class="font-mono text-tg-text break-all">{details().adminPeerId}</span></div>
                          <div>
                            Relay:{" "}
                            <span class="font-mono text-tg-text break-all">
                              {details().relayAddr ?? "(none)"}
                            </span>
                          </div>
                          <div>Token kind: <span class="text-tg-text">{details().tokenKind ?? "(none)"}</span></div>
                          <Show when={details().tokenId}>
                            <div>Token ID: <span class="font-mono text-tg-text break-all">{details().tokenId}</span></div>
                          </Show>
                          <Show when={details().targetPeerId}>
                            <div>Target peer: <span class="font-mono text-tg-text break-all">{details().targetPeerId}</span></div>
                          </Show>
                          <Show when={details().expiresAt !== null}>
                            <div>
                              Expires at:{" "}
                              <span class="text-tg-text">
                                {details().expiresAt ? new Date(details().expiresAt).toLocaleString() : "(none)"}
                              </span>
                            </div>
                          </Show>
                          <Show when={details().maxJoiners !== null}>
                            <div>Max joiners: <span class="text-tg-text">{details().maxJoiners ?? "(none)"}</span></div>
                          </Show>
                          <Show when={!("error" in details().genesis)}>
                            <div>Group ID: <span class="font-mono text-tg-text break-all">{details().genesis.groupId}</span></div>
                            <div>Genesis action: <span class="font-mono text-tg-text break-all">{details().genesis.actionId}</span></div>
                            <Show when={details().genesis.groupName}>
                              <div>Group name: <span class="text-tg-text">{details().genesis.groupName}</span></div>
                            </Show>
                            <Show when={details().genesis.dmPeerIds}>
                              <div>
                                DM peers:{" "}
                                <span class="font-mono text-tg-text break-all">
                                  {details().genesis.dmPeerIds?.join(" , ")}
                                </span>
                              </div>
                            </Show>
                            <div>Envelope hash: <span class="font-mono text-tg-text break-all">{details().envelopeHashHex}</span></div>
                            <div>Envelope bytes: <span class="text-tg-text">{details().signedBytesLength}</span></div>
                            <div>Signature bytes: <span class="text-tg-text">{details().signatureLength}</span></div>
                          </Show>
                        </div>
                      </Show>
                    </div>
                  </details>
                )}
              </Show>
            </div>
          </div>
        </Show>

        <Show when={props.isAdmin && !!props.onRenameGroup}>
          <div class="rounded border border-tg-border bg-tg-hover px-2 py-2 space-y-2">
            <h4 class="text-xs font-medium text-tg-text-dim uppercase tracking-wider">
              Rename Group
            </h4>
            <div class="flex gap-2">
              <input
                type="text"
                class="flex-1 bg-tg-input text-tg-text text-xs px-2.5 py-1.5 rounded border border-tg-border focus:border-tg-accent focus:outline-none"
                value={renameInput()}
                onInput={(e) => {
                  setRenameInput(e.currentTarget.value);
                  setRenameError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameGroup();
                }}
              />
              <button
                class="text-xs bg-tg-accent text-white px-3 py-1.5 rounded hover:bg-tg-accent/80 cursor-pointer disabled:opacity-50"
                disabled={renaming() || renameInput().trim().length === 0 || renameInput().trim() === props.groupName.trim()}
                onClick={handleRenameGroup}
              >
                Rename
              </button>
            </div>
            <Show when={renameError()}>
              <p class="text-[10px] text-red-400">{renameError()}</p>
            </Show>
          </div>
        </Show>

        <Show when={props.isAdmin}>
          <div class="rounded border border-tg-border bg-tg-hover px-2 py-2 space-y-2">
            <h4 class="text-xs font-medium text-tg-text-dim uppercase tracking-wider">
              Join Policy
            </h4>
            <div class="flex gap-2">
              <button
                class="text-xs px-2.5 py-1 rounded border cursor-pointer"
                classList={{
                  "border-tg-accent text-tg-accent": props.joinPolicy === "manual",
                  "border-tg-border text-tg-text-dim hover:text-tg-text": props.joinPolicy !== "manual",
                }}
                onClick={() => handleSetJoinPolicy("manual")}
              >
                Manual Approval
              </button>
              <button
                class="text-xs px-2.5 py-1 rounded border cursor-pointer"
                classList={{
                  "border-tg-accent text-tg-accent": props.joinPolicy === "auto_with_invite",
                  "border-tg-border text-tg-text-dim hover:text-tg-text": props.joinPolicy !== "auto_with_invite",
                }}
                onClick={() => handleSetJoinPolicy("auto_with_invite")}
              >
                Auto w/ Invite
              </button>
            </div>
            <p class="text-[10px] text-tg-text-dim">
              Auto mode approves valid invite-token joins when an admin device is online.
            </p>
            <Show when={joinPolicyError()}>
              <p class="text-[10px] text-red-400">{joinPolicyError()}</p>
            </Show>
          </div>
        </Show>

        <div class="border-t border-tg-border pt-3">
          <div class="flex items-center justify-between mb-2 px-1">
            <h4 class="text-[10px] font-medium text-tg-text-dim uppercase tracking-wider">
              Members ({props.members.size})
            </h4>
            <Show when={props.isAdmin}>
              <button
                class="w-6 h-6 rounded-full bg-tg-accent/20 flex items-center justify-center text-tg-accent hover:bg-tg-accent/30 cursor-pointer"
                onClick={() => setAddMembersOpen(true)}
                title="Add members"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </Show>
          </div>
          <div class="space-y-0.5">
            <For each={memberEntries()}>
              {(member) => {
                const isOwn = () => member.publicKeyHex === props.ownPublicKeyHex;
                const peerId = () => props.publicKeyToPeerId.get(member.publicKeyHex);
                const memberLabel = () => {
                  if (isOwn() && props.ownDisplayName) return props.ownDisplayName;
                  const pid = peerId();
                  if (pid) {
                    const contact = props.contactsBook?.get(pid);
                    if (contact?.nickname?.trim()) return contact.nickname.trim();
                    if (contact?.selfName?.trim()) return contact.selfName.trim();
                    return truncatePeerId(pid);
                  }
                  return truncateHex(member.publicKeyHex);
                };
                const isConnected = () => {
                  const pid = peerId();
                  return pid ? props.connectedPeerIds.has(pid) : false;
                };
                const latency = () => {
                  const pid = peerId();
                  return pid ? props.latencyMap.get(pid) : undefined;
                };
                const canManageRoles = () => props.ownRole === "owner" && !isOwn();
                const canPromoteToAdmin = () => canManageRoles() && member.role === "member";
                const canDemoteToMember = () => canManageRoles() && member.role === "admin";
                const canTransferOwner = () => canManageRoles() && member.role !== "owner";
                const canRemove = () =>
                  props.ownRole === "owner"
                    ? !isOwn()
                    : props.ownRole === "admin"
                      ? !isOwn() && member.role === "member"
                      : false;
                const roleActionPending = () => roleActionTargetHex() === member.publicKeyHex;
                const canStartDirectMessage = () => !!peerId() && !isOwn() && !!props.onStartDirectMessage;
                const memberAvatarId = () => peerId() ?? member.publicKeyHex;

                return (
                  <div class="flex items-center gap-2.5 py-1.5 px-2 rounded hover:bg-tg-hover">
                    <div class="relative shrink-0">
                      <div class={`w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-xs ${avatarColor(memberAvatarId())}`}>
                        {memberLabel().charAt(0).toUpperCase()}
                      </div>
                      <Show when={!isOwn()}>
                        <span
                          class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-tg-sidebar"
                          classList={{
                            "bg-green-500": isConnected(),
                            "bg-gray-500": !isConnected(),
                          }}
                        />
                      </Show>
                    </div>

                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-1.5">
                        <span class="text-sm text-tg-text truncate">
                          {memberLabel()}
                        </span>
                        <Show when={isOwn()}>
                          <span class="text-[10px] text-tg-accent font-medium">(You)</span>
                        </Show>
                        <RoleBadge role={member.role} />
                      </div>
                      <Show when={!isOwn() && latency() !== undefined}>
                        <span class="text-[10px] text-tg-text-dim">{latency()}ms</span>
                      </Show>
                    </div>

                    <div class="flex items-center gap-1 shrink-0">
                      <Show when={canStartDirectMessage()}>
                        <button
                          class="text-[10px] text-tg-accent hover:text-tg-accent/80 px-1.5 py-0.5 rounded hover:bg-tg-accent/10 cursor-pointer disabled:opacity-50"
                          disabled={memberDirectMessagePendingPeerId() === peerId()}
                          onClick={() => {
                            const pid = peerId();
                            if (pid) handleStartDirectMessage(pid);
                          }}
                        >
                          DM
                        </button>
                      </Show>
                      <Show when={canPromoteToAdmin()}>
                        <button
                          class="text-[10px] text-tg-accent hover:text-tg-accent/80 px-1.5 py-0.5 rounded hover:bg-tg-accent/10 cursor-pointer disabled:opacity-50"
                          disabled={roleActionPending()}
                          onClick={() => setPendingConfirm({ type: "promote", member, label: memberLabel() })}
                        >
                          Promote
                        </button>
                      </Show>
                      <Show when={canDemoteToMember()}>
                        <button
                          class="text-[10px] text-tg-text-dim hover:text-tg-text px-1.5 py-0.5 rounded hover:bg-tg-text-dim/10 cursor-pointer disabled:opacity-50"
                          disabled={roleActionPending()}
                          onClick={() => setPendingConfirm({ type: "demote", member, label: memberLabel() })}
                        >
                          Demote
                        </button>
                      </Show>
                      <Show when={canTransferOwner()}>
                        <button
                          class="text-[10px] text-amber-300 hover:text-amber-200 px-1.5 py-0.5 rounded hover:bg-amber-400/10 cursor-pointer disabled:opacity-50"
                          disabled={roleActionPending()}
                          onClick={() => setPendingConfirm({ type: "transfer-owner", member, label: memberLabel() })}
                        >
                          Make Owner
                        </button>
                      </Show>
                      <Show when={canRemove()}>
                        <button
                          class="text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-400/10 cursor-pointer"
                          onClick={() => setPendingConfirm({ type: "remove", member, label: memberLabel() })}
                        >
                          Remove
                        </button>
                      </Show>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
          <Show when={roleActionError()}>
            <p class="text-[10px] text-red-400 mt-1 px-2">{roleActionError()}</p>
          </Show>
          <Show when={memberDirectMessageError()}>
            <p class="text-[10px] text-red-400 mt-1 px-2">{memberDirectMessageError()}</p>
          </Show>
        </div>

        <Show when={props.isAdmin && props.pendingJoins.length > 0}>
          <div class="border-t border-tg-border pt-3">
            <h4 class="text-[10px] font-medium text-tg-text-dim uppercase tracking-wider mb-2 px-1">
              Pending Requests ({props.pendingJoins.length})
            </h4>
            <div class="space-y-0.5">
              <For each={props.pendingJoins}>
                {(request) => {
                  const requestLabel = () => {
                    const peerId = props.publicKeyToPeerId.get(request.publicKeyHex);
                    if (peerId) return truncatePeerId(peerId);
                    return truncateHex(request.publicKeyHex);
                  };

                  return (
                    <div class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-tg-hover">
                      <span class="font-mono text-sm text-tg-text truncate">
                        {requestLabel()}
                      </span>
                      <button
                        class="text-xs bg-tg-accent text-white px-2.5 py-1 rounded hover:bg-tg-accent/80 cursor-pointer"
                        onClick={() => props.onApproveJoin(request.publicKey)}
                      >
                        Approve
                      </button>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>

        <Show when={props.directMessagePeerId}>
          <div class="border-t border-tg-border pt-3">
            <div class="rounded border border-tg-border bg-tg-hover px-2 py-2 space-y-2">
              <h4 class="text-xs font-medium text-tg-text-dim uppercase tracking-wider">
                Direct Chat
              </h4>
              <div class="text-xs text-tg-text">
                Peer: <span class="font-mono">{props.directMessagePeerLabel ?? truncatePeerId(props.directMessagePeerId!)}</span>
              </div>
              <Show when={props.onSetDirectMessageBlocked}>
                <button
                  class="text-xs px-2.5 py-1 rounded border cursor-pointer"
                  classList={{
                    "border-red-500/40 text-red-400 hover:text-red-300": !props.directMessageBlocked,
                    "border-tg-success/40 text-tg-success hover:text-tg-success/80": !!props.directMessageBlocked,
                  }}
                  onClick={() => {
                    if (props.directMessageBlocked) {
                      props.onSetDirectMessageBlocked?.(props.directMessagePeerId!, false);
                    } else {
                      setPendingConfirm({
                        type: "block-dm-peer",
                        peerId: props.directMessagePeerId!,
                        label: props.directMessagePeerLabel ?? truncatePeerId(props.directMessagePeerId!),
                      });
                    }
                  }}
                >
                  {props.directMessageBlocked ? "Unblock peer" : "Block peer"}
                </button>
              </Show>
            </div>
          </div>
        </Show>

        <Show when={props.members.size === 0}>
          <p class="text-sm text-tg-text-dim px-2">
            No action chain for this group. Member info is limited.
          </p>
        </Show>

        <div class="border-t border-tg-border pt-2">
          <button
            class="w-full text-left py-2.5 px-2 rounded hover:bg-tg-hover cursor-pointer"
            onClick={() => setLeaveConfirmOpen(true)}
          >
            <span class="text-tg-danger text-sm">Leave group</span>
          </button>
        </div>

        <ConfirmDialog
          open={leaveConfirmOpen()}
          title="Leave group"
          description="You will be removed from this group and lose access to its messages."
          confirmLabel="Leave group"
          confirmVariant="danger"
          onConfirm={() => {
            setLeaveConfirmOpen(false);
            props.onLeaveGroup();
          }}
          onCancel={() => setLeaveConfirmOpen(false)}
        />

        <ConfirmDialog
          open={pendingConfirm() !== null}
          title={(() => {
            const p = pendingConfirm();
            if (!p) return "";
            switch (p.type) {
              case "promote": return "Promote to admin";
              case "demote": return "Demote to member";
              case "transfer-owner": return "Transfer ownership";
              case "remove": return "Remove member";
              case "block-dm-peer": return "Block peer";
            }
          })()}
          description={(() => {
            const p = pendingConfirm();
            if (!p) return "";
            switch (p.type) {
              case "promote": return `${p.label} will be able to approve members and manage the group.`;
              case "demote": return `${p.label} will lose admin privileges.`;
              case "transfer-owner": return `${p.label} will become the group owner. You will be demoted to admin.`;
              case "remove": return `${p.label} will be removed from the group.`;
              case "block-dm-peer": return `${p.label} will be blocked from sending you direct messages.`;
            }
          })()}
          confirmLabel={(() => {
            const p = pendingConfirm();
            if (!p) return "";
            switch (p.type) {
              case "promote": return "Promote";
              case "demote": return "Demote";
              case "transfer-owner": return "Transfer";
              case "remove": return "Remove";
              case "block-dm-peer": return "Block";
            }
          })()}
          confirmVariant={(() => {
            const p = pendingConfirm();
            if (!p) return "danger" as const;
            switch (p.type) {
              case "promote": return "default" as const;
              case "demote": return "warning" as const;
              case "transfer-owner": return "warning" as const;
              case "remove": return "danger" as const;
              case "block-dm-peer": return "danger" as const;
            }
          })()}
          onConfirm={() => {
            const p = pendingConfirm();
            setPendingConfirm(null);
            if (!p) return;
            switch (p.type) {
              case "promote": handleChangeMemberRole(p.member, "admin"); break;
              case "demote": handleChangeMemberRole(p.member, "member"); break;
              case "transfer-owner": handleChangeMemberRole(p.member, "owner"); break;
              case "remove": props.onRemoveMember(p.member.publicKey); break;
              case "block-dm-peer": props.onSetDirectMessageBlocked?.(p.peerId, true); break;
            }
          }}
          onCancel={() => setPendingConfirm(null)}
        />

        <details class="border-t border-tg-border pt-2">
          <summary class="text-xs text-tg-text-dim cursor-pointer px-2 py-1.5 hover:bg-tg-hover rounded">
            Developer Info
          </summary>
          <div class="mt-3 space-y-4">
            <Show when={props.connectionMetrics}>
              {(metrics) => (
                <div>
                  <h4 class="text-xs font-medium text-tg-text-dim uppercase tracking-wider mb-2">
                    Connection Health
                  </h4>
                  <div class="rounded border border-tg-border bg-tg-hover px-2 py-2 space-y-1 text-[10px]">
                    <div class="flex justify-between gap-2">
                      <span class="text-tg-text-dim">TTFP</span>
                      <span class="text-tg-text">{formatMs(metrics().timeToFirstPeerMs)}</span>
                    </div>
                    <div class="flex justify-between gap-2">
                      <span class="text-tg-text-dim">Reservation success</span>
                      <span class="text-tg-text">{ratio(metrics().reservationSuccesses, metrics().reservationAttempts)}</span>
                    </div>
                    <div class="flex justify-between gap-2">
                      <span class="text-tg-text-dim">Direct-upgrade success</span>
                      <span class="text-tg-text">{ratio(metrics().directUpgradeSuccesses, metrics().directUpgradeAttempts)}</span>
                    </div>
                    <div class="flex justify-between gap-2">
                      <span class="text-tg-text-dim">Sync requests sent</span>
                      <span class="text-tg-text">{metrics().syncRequestsSent}</span>
                    </div>
                    <div class="flex justify-between gap-2">
                      <span class="text-tg-text-dim">Sync responses accepted</span>
                      <span class="text-tg-text">{metrics().syncResponsesAccepted}</span>
                    </div>
                    <div class="flex justify-between gap-2">
                      <span class="text-tg-text-dim">Sync responses rejected</span>
                      <span class="text-tg-text">{metrics().syncResponsesRejected}</span>
                    </div>
                    <div class="flex justify-between gap-2">
                      <span class="text-tg-text-dim">Active reservations</span>
                      <span class="text-tg-text">{metrics().activeReservations}</span>
                    </div>
                  </div>
                </div>
              )}
            </Show>

            <div>
              <div class="flex items-center justify-between gap-2 mb-2">
                <h4 class="text-xs font-medium text-tg-text-dim uppercase tracking-wider">
                  Node Sync Progress ({visibleSyncRows().length}
                  <Show when={syncAppPeersOnly()}>
                    {` / ${syncRows().length}`}
                  </Show>
                  )
                </h4>
                <label class="inline-flex items-center gap-1 text-[10px] text-tg-text-dim cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={syncAppPeersOnly()}
                    onChange={(event) => {
                      setSyncAppPeersOnly(event.currentTarget.checked);
                      setSyncExpanded(false);
                    }}
                    class="accent-tg-accent cursor-pointer"
                  />
                  App peers only
                </label>
              </div>
              <Show
                when={visibleSyncRows().length > 0}
                fallback={<p class="text-sm text-tg-text-dim">No per-node sync activity yet for this group.</p>}
              >
                <div class="rounded border border-tg-border bg-tg-hover divide-y divide-tg-border">
                  <For
                    each={syncExpanded()
                      ? visibleSyncRows()
                      : visibleSyncRows().slice(0, SYNC_PREVIEW_COUNT)}
                  >
                    {(row) => (
                      <div class="px-2 py-1.5">
                        <div class="flex items-center justify-between gap-2">
                          <div class="flex items-center gap-2 min-w-0">
                            <span
                              class="w-1.5 h-1.5 rounded-full shrink-0"
                              classList={{
                                "bg-green-500": row.connected,
                                "bg-gray-500": !row.connected,
                              }}
                            />
                            <span class="text-[11px] text-tg-text truncate">{row.peerLabel}</span>
                            <span class="font-mono text-[10px] text-tg-text-dim shrink-0">
                              {truncatePeerId(row.peerId)}
                            </span>
                          </div>
                          <div class="flex items-center gap-1.5 shrink-0">
                            <span class="text-[10px] text-tg-text-dim">{row.lastSyncLabel}</span>
                            <span class="text-[10px] text-tg-text">{row.envelopeHint}</span>
                            <span
                              class="text-[9px] uppercase px-1 py-0.5 rounded"
                              classList={{
                                "text-tg-success bg-tg-success/10": row.status === "active",
                                "text-tg-warning bg-tg-warning/10": row.status === "stale",
                                "text-tg-text-dim bg-tg-text-dim/10": row.status === "idle",
                              }}
                            >
                              {row.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
                <Show when={visibleSyncRows().length > SYNC_PREVIEW_COUNT}>
                  <button
                    type="button"
                    class="mt-1 text-[10px] text-tg-accent hover:text-tg-accent/80"
                    onClick={() => setSyncExpanded((value) => !value)}
                  >
                    {syncExpanded()
                      ? `Show less`
                      : `Show ${visibleSyncRows().length - SYNC_PREVIEW_COUNT} more`}
                  </button>
                </Show>
              </Show>
            </div>

            <Show when={props.activeGroupDiscoveryMetrics}>
              {(metrics) => (
                <div>
                  <h4 class="text-xs font-medium text-tg-text-dim uppercase tracking-wider mb-2">
                    Active Group Discovery
                  </h4>
                  <div class="rounded border border-tg-border bg-tg-hover px-2 py-2 space-y-1 text-[10px]">
                    <div class="flex justify-between gap-2">
                      <span class="text-tg-text-dim">Search rounds</span>
                      <span class="text-tg-text">{metrics().searchRound}</span>
                    </div>
                    <div class="flex justify-between gap-2">
                      <span class="text-tg-text-dim">Providers found</span>
                      <span class="text-tg-text">{metrics().providersFound}</span>
                    </div>
                    <div class="flex justify-between gap-2">
                      <span class="text-tg-text-dim">Dial success</span>
                      <span class="text-tg-text">{ratio(metrics().dialSuccesses, metrics().dialAttempts)}</span>
                    </div>
                    <div class="flex justify-between gap-2">
                      <span class="text-tg-text-dim">Group TTFP</span>
                      <span class="text-tg-text">{formatMs(metrics().timeToFirstPeerMs)}</span>
                    </div>
                  </div>
                </div>
              )}
            </Show>

            <Show when={props.joinRetryEntry}>
              {(entry) => (
                <div>
                  <h4 class="text-xs font-medium text-tg-text-dim uppercase tracking-wider mb-2">
                    Join Approval Retry
                  </h4>
                  <div class="rounded border border-tg-border bg-tg-hover px-2 py-2 space-y-1 text-[10px]">
                    <div class="flex justify-between gap-2">
                      <span class="text-tg-text-dim">Status</span>
                      <span
                        class="uppercase"
                        classList={{
                          "text-tg-success": entry().status === "active",
                          "text-tg-warning": entry().status === "paused",
                          "text-tg-text-dim": entry().status === "cancelled",
                        }}
                      >
                        {entry().status}
                      </span>
                    </div>
                    <div class="flex justify-between gap-2">
                      <span class="text-tg-text-dim">Attempts</span>
                      <span class="text-tg-text">{entry().attemptCount}</span>
                    </div>
                    <div class="flex justify-between gap-2">
                      <span class="text-tg-text-dim">Last attempt</span>
                      <span class="text-tg-text">
                        {(() => {
                          const lastAttemptAt = entry().lastAttemptAt;
                          return lastAttemptAt === null ? "--" : new Date(lastAttemptAt).toLocaleTimeString();
                        })()}
                      </span>
                    </div>
                    <div class="flex justify-between gap-2">
                      <span class="text-tg-text-dim">Next retry</span>
                      <span class="text-tg-text">
                        {entry().status === "active"
                          ? formatDuration(entry().nextAttemptAt - nowMs())
                          : "stopped"}
                      </span>
                    </div>
                    <div class="flex gap-2 pt-1">
                      <button
                        class="text-[10px] bg-tg-accent text-white px-2.5 py-1 rounded hover:bg-tg-accent/80 cursor-pointer"
                        onClick={props.onRetryJoinNow}
                      >
                        Retry now
                      </button>
                      <button
                        class="text-[10px] bg-tg-border text-tg-text px-2.5 py-1 rounded hover:bg-tg-hover cursor-pointer"
                        onClick={props.onCancelJoinRetry}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </Show>

            <div>
              <h4 class="text-xs font-medium text-tg-text-dim uppercase tracking-wider mb-2">
                Event Envelopes ({props.actionEnvelopes.length})
              </h4>
              <Show
                when={props.actionEnvelopes.length > 0}
                fallback={<p class="text-sm text-tg-text-dim">No envelopes yet.</p>}
              >
                <div class="space-y-2">
                  <For each={envelopeRows()}>
                    {(row) => (
                      <div class="rounded border border-tg-border bg-tg-hover px-2 py-2">
                        <div class="flex items-center justify-between gap-2">
                          <span
                            class="text-[10px] uppercase tracking-wide"
                            classList={{
                              "text-tg-accent": row.valid,
                              "text-red-400": !row.valid,
                            }}
                          >
                            {row.actionType}
                          </span>
                          <code class="text-[10px] text-tg-text">
                            {truncateHex(row.hashHex)}
                          </code>
                        </div>
                        <p class="text-xs text-tg-text mt-1">{row.summary}</p>
                        <p class="text-[10px] text-tg-text-dim mt-1">
                          {row.timestampLabel} • Author {row.authorLabel}
                        </p>
                        <details class="mt-1">
                          <summary class="text-[10px] text-tg-text-dim cursor-pointer">Raw envelope</summary>
                          <div class="mt-1 space-y-1">
                            <p class="text-[10px] text-tg-text-dim">
                              Signature bytes: {row.signatureLength} • Signed bytes: {row.signedBytesLength}
                            </p>
                            <code class="block break-all text-[10px] text-tg-text">{row.hashHex}</code>
                          </div>
                        </details>
                      </div>
                    )}
                  </For>
                </div>

                <Show when={envelopePageCount() > 1}>
                  <div class="flex items-center justify-between mt-2">
                    <span class="text-[10px] text-tg-text-dim">
                      Page {currentEnvelopePage() + 1} of {envelopePageCount()}
                    </span>
                    <div class="flex gap-2">
                      <button
                        class="text-[10px] px-2 py-1 rounded border border-tg-border text-tg-text-dim hover:text-tg-text cursor-pointer disabled:opacity-50"
                        disabled={currentEnvelopePage() === 0}
                        onClick={() => setEnvelopePage((p) => Math.max(0, p - 1))}
                      >
                        Prev
                      </button>
                      <button
                        class="text-[10px] px-2 py-1 rounded border border-tg-border text-tg-text-dim hover:text-tg-text cursor-pointer disabled:opacity-50"
                        disabled={currentEnvelopePage() >= envelopePageCount() - 1}
                        onClick={() => setEnvelopePage((p) => Math.min(envelopePageCount() - 1, p + 1))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </Show>
              </Show>
            </div>
          </div>
        </details>
      </div>
    </Show>
  );
};
