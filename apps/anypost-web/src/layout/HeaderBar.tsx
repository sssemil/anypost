import { createSignal, Show } from "solid-js";
import { formatPeerIdShort } from "anypost-core/protocol";

type MemberInfo = {
  readonly peerId: string;
  readonly displayName?: string;
};

type HeaderBarProps = {
  readonly peerId: string;
  readonly connectionStatus: "connecting" | "connected" | "disconnected";
  readonly displayName: string;
  readonly activeGroupId: string | null;
  readonly members: readonly MemberInfo[];
  readonly showBackButton: boolean;
  readonly onBackPress: () => void;
  readonly onDevDrawerToggle: () => void;
};

const statusDotColor = (status: HeaderBarProps["connectionStatus"]): string => {
  switch (status) {
    case "connected": return "bg-tg-success";
    case "connecting": return "bg-tg-warning";
    case "disconnected": return "bg-tg-danger";
  }
};

const statusLabel = (status: HeaderBarProps["connectionStatus"]): string => {
  switch (status) {
    case "connected": return "Connected";
    case "connecting": return "Connecting...";
    case "disconnected": return "Disconnected";
  }
};

export const HeaderBar = (props: HeaderBarProps) => {
  const [copied, setCopied] = createSignal(false);

  const copyPeerId = () => {
    navigator.clipboard.writeText(props.peerId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const truncatedGroupId = () => {
    const id = props.activeGroupId;
    if (!id) return "No group";
    return `${id.slice(0, 8)}...`;
  };

  return (
    <div class="flex items-center gap-3 px-4 py-3 bg-tg-header border-b border-tg-border">
      <Show when={props.showBackButton}>
        <button
          class="sm:hidden text-tg-accent text-lg p-1 -ml-1"
          onClick={() => props.onBackPress()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </Show>

      <div class="flex flex-col flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="font-semibold text-tg-text truncate">
            {props.displayName || truncatedGroupId()}
          </span>
        </div>
        <div class="flex items-center gap-1.5">
          <div class={`w-2 h-2 rounded-full ${statusDotColor(props.connectionStatus)}`} />
          <span class="text-xs text-tg-text-dim">
            {statusLabel(props.connectionStatus)}
          </span>
          <Show when={props.members.length > 0}>
            <span class="text-xs text-tg-text-dim ml-1">
              · {props.members.length} {props.members.length === 1 ? "member" : "members"}
            </span>
          </Show>
          <Show when={props.activeGroupId}>
            <span class="text-xs text-tg-text-dim ml-1 font-mono truncate hidden sm:inline">
              {props.activeGroupId}
            </span>
          </Show>
        </div>
        <Show when={props.members.length > 0}>
          <div class="text-[11px] text-tg-text-dim truncate">
            {props.members.map((m) =>
              m.displayName ?? formatPeerIdShort(m.peerId)
            ).join(", ")}
          </div>
        </Show>
      </div>

      <Show when={props.peerId}>
        <button
          onClick={copyPeerId}
          class="flex items-center gap-1.5 text-xs border border-tg-border rounded-lg px-2.5 py-1 hidden sm:flex hover:bg-tg-hover cursor-pointer"
        >
          <span class="text-tg-text-dim">Your ID</span>
          <span class="font-mono text-tg-text">{props.peerId.slice(0, 12)}...</span>
          <span class="text-tg-accent text-[10px]">{copied() ? "Copied!" : "Copy"}</span>
        </button>
      </Show>

      <button
        class="text-tg-text-dim hover:text-tg-text p-1"
        onClick={() => props.onDevDrawerToggle()}
        title="Developer Tools"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
          <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      </button>
    </div>
  );
};
