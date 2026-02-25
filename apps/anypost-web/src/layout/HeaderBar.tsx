import { createSignal, Show } from "solid-js";

type HeaderBarProps = {
  readonly peerId: string;
  readonly connectionStatus: "connecting" | "connected" | "disconnected";
  readonly activeGroupId: string | null;
  readonly activeGroupName?: string;
  readonly activeGroupIsDirectMessage?: boolean;
  readonly activeDirectMessageConnected?: boolean;
  readonly activeDirectMessageStatusLabel?: string;
  readonly activeDirectMessageStatusTone?: "online" | "offline" | "pending";
  readonly memberCount: number;
  readonly showBackButton: boolean;
  readonly onBackPress: () => void;
  readonly onProfileToggle: () => void;
  readonly onDevDrawerToggle: () => void;
  readonly onAboutToggle: () => void;
  readonly onContactsToggle: () => void;
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
  const [menuOpen, setMenuOpen] = createSignal(false);

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
    if (props.activeGroupIsDirectMessage) {
      return props.activeDirectMessageStatusLabel
        ?? (props.activeDirectMessageConnected ? "online" : "offline");
    }
    if (props.memberCount > 0) {
      return `${props.memberCount} ${props.memberCount === 1 ? "member" : "members"}`;
    }
    return statusLabel(props.connectionStatus);
  };

  return (
    <div class="relative flex items-center gap-3 px-4 py-2.5 bg-tg-header border-b border-tg-border">
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
        <span class="flex items-center gap-2 min-w-0">
          <Show when={props.activeGroupIsDirectMessage}>
            <span
              class="inline-block w-2 h-2 rounded-full shrink-0"
              classList={{
                "bg-tg-success": props.activeDirectMessageStatusTone === "online",
                "bg-amber-400": props.activeDirectMessageStatusTone === "pending",
                "bg-gray-500": !props.activeDirectMessageStatusTone || props.activeDirectMessageStatusTone === "offline",
              }}
            />
          </Show>
          <span class="font-semibold text-tg-text truncate text-[15px] leading-tight">
            {groupDisplayName()}
          </span>
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
        onClick={() => setMenuOpen((v) => !v)}
        title="Menu"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>
      <Show when={menuOpen()}>
        <div class="absolute right-3 top-12 z-30 w-40 rounded-lg border border-tg-border bg-tg-sidebar shadow-lg overflow-hidden">
          <button
            class="w-full text-left px-3 py-2 text-xs text-tg-text hover:bg-tg-hover cursor-pointer"
            onClick={() => {
              setMenuOpen(false);
              props.onProfileToggle();
            }}
          >
            Profile
          </button>
          <button
            class="w-full text-left px-3 py-2 text-xs text-tg-text hover:bg-tg-hover cursor-pointer"
            onClick={() => {
              setMenuOpen(false);
              props.onContactsToggle();
            }}
          >
            Contacts
          </button>
          <button
            class="w-full text-left px-3 py-2 text-xs text-tg-text hover:bg-tg-hover cursor-pointer"
            onClick={() => {
              setMenuOpen(false);
              props.onDevDrawerToggle();
            }}
          >
            Developer Tools
          </button>
          <button
            class="w-full text-left px-3 py-2 text-xs text-tg-text hover:bg-tg-hover cursor-pointer border-t border-tg-border"
            onClick={() => {
              setMenuOpen(false);
              props.onAboutToggle();
            }}
          >
            About
          </button>
        </div>
      </Show>
    </div>
  );
};
