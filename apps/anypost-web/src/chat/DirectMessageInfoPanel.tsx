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

  const copyGroupId = () => {
    if (!props.groupId) return;
    navigator.clipboard.writeText(props.groupId).then(() => {
      setCopiedGroupId(true);
      setTimeout(() => setCopiedGroupId(false), 2000);
    }).catch(() => {});
  };

  return (
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-semibold text-tg-text">
          {props.peerLabel ?? (props.peerId ? truncatePeerId(props.peerId) : "Direct Message")}
        </h3>
      </div>

      <Show when={props.groupId}>
        <button
          class="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded hover:bg-tg-hover cursor-pointer"
          onClick={copyGroupId}
        >
          <span class="text-xs text-tg-text-dim shrink-0">DM ID</span>
          <span class="font-mono text-xs text-tg-text truncate">{props.groupId}</span>
          <span class="text-tg-accent text-[10px] shrink-0 ml-auto">
            {copiedGroupId() ? "Copied!" : "Copy"}
          </span>
        </button>
      </Show>

      <div class="rounded border border-tg-border bg-tg-hover px-2 py-2 space-y-2">
        <h4 class="text-xs font-medium text-tg-text-dim uppercase tracking-wider">
          Direct Peer
        </h4>
        <div class="text-xs text-tg-text">
          <span class="text-tg-text-dim">Peer:</span>{" "}
          <span class="font-mono">{props.peerLabel ?? (props.peerId ? truncatePeerId(props.peerId) : "--")}</span>
        </div>
        <Show when={props.peerPresenceLabel}>
          <div
            class="text-[11px]"
            classList={{
              "text-tg-success": props.peerPresenceTone === "online",
              "text-amber-300": props.peerPresenceTone === "pending",
              "text-tg-text-dim": !props.peerPresenceTone || props.peerPresenceTone === "offline",
            }}
          >
            {props.peerPresenceLabel}
          </div>
        </Show>
        <Show when={props.peerId}>
          <button
            class="text-xs px-2.5 py-1 rounded border cursor-pointer"
            classList={{
              "border-red-500/40 text-red-400 hover:text-red-300": !props.blocked,
              "border-tg-success/40 text-tg-success hover:text-tg-success/80": props.blocked,
            }}
            onClick={() => props.onSetBlocked(props.peerId!, !props.blocked)}
          >
            {props.blocked ? "Unblock peer" : "Block peer"}
          </button>
        </Show>
      </div>

      <div class="rounded border border-tg-border bg-tg-hover px-2 py-2 space-y-1 text-[11px]">
        <div class="flex justify-between gap-2">
          <span class="text-tg-text-dim">Handshake</span>
          <span class={props.handshakeComplete ? "text-tg-success" : "text-amber-300"}>
            {props.handshakeComplete ? "Complete" : "Waiting"}
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
