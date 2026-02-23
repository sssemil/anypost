import { createSignal, createMemo, createEffect, For, Show } from "solid-js";
import {
  toHex,
  verifyAndDecodeAction,
} from "anypost-core/protocol";
import type {
  ActionPayload,
  GroupMember,
  SignedActionEnvelope,
  ConnectionMetrics,
  PeerDiscoveryMetrics,
} from "anypost-core/protocol";

export type PendingJoinRequest = {
  readonly publicKeyHex: string;
  readonly publicKey: Uint8Array;
};

type GroupInfoPanelProps = {
  readonly groupId: string | null;
  readonly groupName: string;
  readonly members: ReadonlyMap<string, GroupMember>;
  readonly actionEnvelopes: readonly SignedActionEnvelope[];
  readonly connectionMetrics: ConnectionMetrics | null;
  readonly activeGroupDiscoveryMetrics: PeerDiscoveryMetrics | null;
  readonly pendingJoins: readonly PendingJoinRequest[];
  readonly isAdmin: boolean;
  readonly ownPublicKeyHex: string;
  readonly ownDisplayName: string;
  readonly publicKeyToPeerId: ReadonlyMap<string, string>;
  readonly connectedPeerIds: ReadonlySet<string>;
  readonly latencyMap: ReadonlyMap<string, number>;
  readonly onApproveJoin: (memberPublicKey: Uint8Array) => void;
  readonly onRemoveMember: (memberPublicKey: Uint8Array) => void;
  readonly onAddByPeerId: (peerId: string) => string | null;
  readonly onCreateInvite: (() => void) | null;
};

const truncatePeerId = (peerId: string): string =>
  peerId.length > 20 ? `${peerId.slice(0, 12)}...${peerId.slice(-6)}` : peerId;

const truncateHex = (hex: string): string =>
  hex.length > 16 ? `${hex.slice(0, 8)}...${hex.slice(-8)}` : hex;

const ratio = (num: number, den: number): string =>
  den <= 0 ? "0%" : `${Math.round((num / den) * 100)}%`;

const formatMs = (ms: number | null): string =>
  ms === null ? "--" : `${Math.round(ms)}ms`;

const ENVELOPES_PER_PAGE = 10;

const summarizePayload = (payload: ActionPayload): string => {
  switch (payload.type) {
    case "group-created":
      return `Group created: "${payload.groupName}"`;
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
    case "message":
      return `Message: ${payload.text.slice(0, 80)}${payload.text.length > 80 ? "..." : ""}`;
    case "read-receipt":
      return `Read receipt up to ${payload.upToActionId.slice(0, 8)}...`;
  }
};

const RoleBadge = (props: { readonly role: "admin" | "member" }) => (
  <span
    class="text-[10px] font-medium px-1.5 py-0.5 rounded"
    classList={{
      "bg-tg-accent/20 text-tg-accent": props.role === "admin",
      "bg-tg-text-dim/20 text-tg-text-dim": props.role === "member",
    }}
  >
    {props.role === "admin" ? "Admin" : "Member"}
  </span>
);

export const GroupInfoPanel = (props: GroupInfoPanelProps) => {
  const memberEntries = () => [...props.members.values()];
  const [copiedGroupId, setCopiedGroupId] = createSignal(false);
  const [copiedInvite, setCopiedInvite] = createSignal(false);
  const [addPeerIdInput, setAddPeerIdInput] = createSignal("");
  const [addPeerIdError, setAddPeerIdError] = createSignal("");
  const [envelopePage, setEnvelopePage] = createSignal(0);

  createEffect(() => {
    props.groupId;
    setEnvelopePage(0);
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

  const copyGroupId = () => {
    if (!props.groupId) return;
    navigator.clipboard.writeText(props.groupId).then(() => {
      setCopiedGroupId(true);
      setTimeout(() => setCopiedGroupId(false), 2000);
    }).catch(() => {});
  };

  const handleCopyInvite = () => {
    props.onCreateInvite?.();
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

  return (
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-semibold text-tg-text">{props.groupName}</h3>
      </div>

      <Show when={props.groupId}>
        <button
          class="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded hover:bg-tg-hover cursor-pointer"
          onClick={copyGroupId}
        >
          <span class="text-xs text-tg-text-dim shrink-0">Group ID</span>
          <span class="font-mono text-xs text-tg-text truncate">{props.groupId}</span>
          <span class="text-tg-accent text-[10px] shrink-0 ml-auto">
            {copiedGroupId() ? "Copied!" : "Copy"}
          </span>
        </button>
      </Show>

      <Show when={props.onCreateInvite !== null}>
        <button
          class="w-full py-2 px-3 rounded-lg bg-tg-accent text-white text-sm hover:bg-tg-accent/80 cursor-pointer"
          onClick={handleCopyInvite}
        >
          {copiedInvite() ? "Invite copied!" : "Copy Invite Code"}
        </button>
      </Show>

      <div>
        <h4 class="text-xs font-medium text-tg-text-dim uppercase tracking-wider mb-2">
          Members ({props.members.size})
        </h4>
        <div class="space-y-1">
          <For each={memberEntries()}>
            {(member) => {
              const isOwn = () => member.publicKeyHex === props.ownPublicKeyHex;
              const peerId = () => props.publicKeyToPeerId.get(member.publicKeyHex);
              const memberLabel = () => {
                if (isOwn() && props.ownDisplayName) return props.ownDisplayName;
                const pid = peerId();
                if (pid) return truncatePeerId(pid);
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
              const canRemove = () => props.isAdmin && !isOwn() && member.role !== "admin";

              return (
                <div class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-tg-hover">
                  <div class="flex items-center gap-2 min-w-0">
                    <Show when={!isOwn()}>
                      <span
                        class="w-2 h-2 rounded-full shrink-0"
                        classList={{
                          "bg-green-500": isConnected(),
                          "bg-gray-500": !isConnected(),
                        }}
                      />
                    </Show>
                    <span
                      class="text-sm text-tg-text truncate"
                      classList={{ "font-mono": !isOwn() || !props.ownDisplayName }}
                    >
                      {memberLabel()}
                    </span>
                    <Show when={isOwn()}>
                      <span class="text-[10px] text-tg-accent font-medium">(You)</span>
                    </Show>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <Show when={!isOwn() && latency() !== undefined}>
                      <span class="text-[10px] text-tg-text-dim">{latency()}ms</span>
                    </Show>
                    <RoleBadge role={member.role} />
                    <Show when={canRemove()}>
                      <button
                        class="text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-400/10 cursor-pointer"
                        onClick={() => props.onRemoveMember(member.publicKey)}
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
      </div>

      <Show when={props.isAdmin && props.pendingJoins.length > 0}>
        <div>
          <h4 class="text-xs font-medium text-tg-text-dim uppercase tracking-wider mb-2">
            Pending Requests ({props.pendingJoins.length})
          </h4>
          <div class="space-y-1">
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

      <Show when={props.isAdmin}>
        <div>
          <h4 class="text-xs font-medium text-tg-text-dim uppercase tracking-wider mb-2">
            Add Member by Peer ID
          </h4>
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
            <p class="text-[10px] text-red-400 mt-1">{addPeerIdError()}</p>
          </Show>
        </div>
      </Show>

      <Show when={props.members.size === 0}>
        <p class="text-sm text-tg-text-dim">
          No action chain for this group. Member info is limited.
        </p>
      </Show>

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
                <span class="text-tg-text-dim">Active reservations</span>
                <span class="text-tg-text">{metrics().activeReservations}</span>
              </div>
            </div>
          </div>
        )}
      </Show>

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
  );
};
