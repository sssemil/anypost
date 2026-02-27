import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import {
  toHex,
  verifyAndDecodeAction,
} from "anypost-core/protocol";
import type {
  ActionPayload,
  SignedActionEnvelope,
} from "anypost-core/protocol";

type DirectMessageInfoPanelProps = {
  readonly groupId: string | null;
  readonly peerId: string | null;
  readonly peerLabel: string | null;
  readonly peerPresenceLabel?: string;
  readonly peerPresenceTone?: "online" | "offline" | "pending";
  readonly blocked: boolean;
  readonly handshakeComplete: boolean;
  readonly missingPeerIds: readonly string[];
  readonly actionEnvelopes: readonly SignedActionEnvelope[];
  readonly onSetBlocked: (peerId: string, blocked: boolean) => void;
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

const ENVELOPES_PER_PAGE = 10;

const summarizePayload = (payload: ActionPayload): string => {
  switch (payload.type) {
    case "group-created":
      return `Group created: "${payload.groupName}" (${payload.joinPolicy ?? "manual"})`;
    case "dm-created":
      return `DM created for ${truncatePeerId(payload.peerIds[0])} and ${truncatePeerId(payload.peerIds[1])}`;
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

export const DirectMessageInfoPanel = (props: DirectMessageInfoPanelProps) => {
  const [copiedPeerId, setCopiedPeerId] = createSignal(false);
  const [copiedGroupId, setCopiedGroupId] = createSignal(false);
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
    return envelopeList()
      .slice(start, start + ENVELOPES_PER_PAGE)
      .map((envelope) => {
        const hashHex = toHex(envelope.hash);
        const decoded = verifyAndDecodeAction(envelope);
        if (!decoded.success) {
          return {
            hashHex,
            actionType: "invalid",
            summary: `Invalid envelope: ${decoded.error.message}`,
            timestampLabel: "Unknown time",
            authorLabel: "Unknown author",
            signatureLength: envelope.signature.length,
            signedBytesLength: envelope.signedBytes.length,
            valid: false as const,
          };
        }
        const action = decoded.data;
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

  const displayName = () =>
    props.peerLabel ?? (props.peerId ? truncatePeerId(props.peerId) : "Direct Message");

  const avatarLetter = () => displayName().charAt(0).toUpperCase();
  const avatarBg = () => avatarColor(props.peerId ?? props.groupId ?? "dm");

  const copyPeerId = () => {
    if (!props.peerId) return;
    navigator.clipboard.writeText(props.peerId).then(() => {
      setCopiedPeerId(true);
      setTimeout(() => setCopiedPeerId(false), 2000);
    }).catch(() => {});
  };

  const copyGroupId = () => {
    if (!props.groupId) return;
    navigator.clipboard.writeText(props.groupId).then(() => {
      setCopiedGroupId(true);
      setTimeout(() => setCopiedGroupId(false), 2000);
    }).catch(() => {});
  };

  return (
    <div class="space-y-4">
      <div class="flex flex-col items-center pt-2 pb-1">
        <div class={`w-16 h-16 rounded-full flex items-center justify-center text-white font-semibold text-xl ${avatarBg()}`}>
          {avatarLetter()}
        </div>
        <h3 class="text-lg font-semibold text-tg-text mt-3 text-center">
          {displayName()}
        </h3>
        <div class="flex items-center gap-1.5 mt-1">
          <span
            class="inline-block w-2 h-2 rounded-full"
            classList={{
              "bg-tg-success": props.peerPresenceTone === "online",
              "bg-amber-400": props.peerPresenceTone === "pending",
              "bg-gray-500": !props.peerPresenceTone || props.peerPresenceTone === "offline",
            }}
          />
          <span
            class="text-xs"
            classList={{
              "text-tg-success": props.peerPresenceTone === "online",
              "text-amber-300": props.peerPresenceTone === "pending",
              "text-tg-text-dim": !props.peerPresenceTone || props.peerPresenceTone === "offline",
            }}
          >
            {props.peerPresenceLabel ?? "offline"}
          </span>
        </div>
      </div>

      <div class="space-y-0.5">
        <Show when={props.peerId}>
          <button
            class="flex items-center gap-2 w-full text-left py-2 px-2 rounded hover:bg-tg-hover cursor-pointer"
            onClick={copyPeerId}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-4 h-4 text-tg-text-dim shrink-0">
              <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7Z" />
            </svg>
            <div class="flex-1 min-w-0">
              <div class="text-[10px] text-tg-text-dim">Peer ID</div>
              <div class="font-mono text-xs text-tg-text truncate">{props.peerId}</div>
            </div>
            <span class="text-tg-accent text-[10px] shrink-0">
              {copiedPeerId() ? "Copied!" : "Copy"}
            </span>
          </button>
        </Show>

        <Show when={props.groupId}>
          <button
            class="flex items-center gap-2 w-full text-left py-2 px-2 rounded hover:bg-tg-hover cursor-pointer"
            onClick={copyGroupId}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-4 h-4 text-tg-text-dim shrink-0">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
            </svg>
            <div class="flex-1 min-w-0">
              <div class="text-[10px] text-tg-text-dim">DM ID</div>
              <div class="font-mono text-xs text-tg-text truncate">{props.groupId}</div>
            </div>
            <span class="text-tg-accent text-[10px] shrink-0">
              {copiedGroupId() ? "Copied!" : "Copy"}
            </span>
          </button>
        </Show>
      </div>

      <div class="px-2 space-y-1.5 text-[11px]">
        <div class="flex items-center justify-between gap-2">
          <span class="text-tg-text-dim">Handshake</span>
          <span class="flex items-center gap-1.5">
            <Show when={props.handshakeComplete} fallback={
              <span class="text-amber-300">Waiting...</span>
            }>
              <span class="text-tg-success">Complete</span>
            </Show>
          </span>
        </div>
        <Show when={!props.handshakeComplete && props.missingPeerIds.length > 0}>
          <div class="text-tg-text-dim">
            Missing genesis from:
          </div>
          <div class="space-y-0.5">
            <For each={props.missingPeerIds}>
              {(peerId) => (
                <div class="font-mono text-tg-text text-[10px]">{truncatePeerId(peerId)}</div>
              )}
            </For>
          </div>
        </Show>
      </div>

      <Show when={props.peerId}>
        <div class="border-t border-tg-border pt-2">
          <button
            class="w-full text-left py-2.5 px-2 rounded hover:bg-tg-hover cursor-pointer"
            onClick={() => props.onSetBlocked(props.peerId!, !props.blocked)}
          >
            <span class={props.blocked ? "text-tg-success text-sm" : "text-tg-danger text-sm"}>
              {props.blocked ? "Unblock user" : "Block user"}
            </span>
          </button>
        </div>
      </Show>

      <details class="border-t border-tg-border pt-2">
        <summary class="text-xs text-tg-text-dim cursor-pointer px-2 py-1.5 hover:bg-tg-hover rounded">
          Developer Info ({props.actionEnvelopes.length} envelopes)
        </summary>
        <div class="mt-2 space-y-2">
          <Show
            when={props.actionEnvelopes.length > 0}
            fallback={<p class="text-sm text-tg-text-dim px-2">No envelopes yet.</p>}
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
      </details>
    </div>
  );
};
