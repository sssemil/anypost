import { createSignal, Show } from "solid-js";

type HeaderBarProps = {
  readonly peerId: string;
  readonly connectionStatus: "connecting" | "connected" | "disconnected";
  readonly activeGroupId: string | null;
  readonly activeGroupName?: string;
  readonly memberCount: number;
  readonly showBackButton: boolean;
  readonly onBackPress: () => void;
  readonly onDevDrawerToggle: () => void;
  readonly onGroupInfoToggle: () => void;
};

const statusLabel = (status: HeaderBarProps["connectionStatus"]): string => {
  switch (status) {
    case "connected": return "connected";
    case "connecting": return "connecting...";
    case "disconnected": return "disconnected";
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

  const groupDisplayName = () => {
    if (props.activeGroupName) return props.activeGroupName;
    const id = props.activeGroupId;
    if (!id) return "Anypost";
    return `${id.slice(0, 8)}...`;
  };

  const subtitle = () => {
    if (!props.activeGroupId) return statusLabel(props.connectionStatus);
    if (props.memberCount > 0) {
      return `${props.memberCount} ${props.memberCount === 1 ? "member" : "members"}`;
    }
    return statusLabel(props.connectionStatus);
  };

  return (
    <div class="flex items-center gap-3 px-4 py-2.5 bg-tg-header border-b border-tg-border">
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

      <button
        class="flex flex-col flex-1 min-w-0 text-left hover:bg-tg-hover rounded-lg px-2 py-1 -mx-2 -my-1 cursor-pointer"
        onClick={() => props.onGroupInfoToggle()}
      >
        <span class="font-semibold text-tg-text truncate text-[15px] leading-tight">
          {groupDisplayName()}
        </span>
        <span class="text-xs text-tg-text-dim leading-tight">
          {subtitle()}
        </span>
      </button>

      <Show when={props.peerId}>
        <button
          onClick={copyPeerId}
          class="flex items-center gap-1.5 text-xs border border-tg-border rounded-lg px-2.5 py-1 hidden sm:flex hover:bg-tg-hover cursor-pointer shrink-0"
        >
          <span class="text-tg-text-dim">Your ID</span>
          <span class="font-mono text-tg-text">{props.peerId.slice(0, 12)}...</span>
          <span class="text-tg-accent text-[10px]">{copied() ? "Copied!" : "Copy"}</span>
        </button>
      </Show>

      <button
        class="text-tg-text-dim hover:text-tg-text p-1 shrink-0"
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
