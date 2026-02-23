import type { JSX } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import {
  createSidebarState,
  transitionSidebar,
} from "./sidebar-machine.js";
import { decodeGroupInvite } from "anypost-core/protocol";
import type { GroupInvite } from "anypost-core/protocol";

type GroupItem = {
  readonly groupId: string;
  readonly groupName?: string;
  readonly unreadCount: number;
  readonly seenPeerCount: number;
  readonly lastMessage?: { readonly text: string; readonly timestamp: number };
};

type GroupSidebarProps = {
  readonly groups: readonly GroupItem[];
  readonly activeGroupId: string | null;
  readonly topBanners?: JSX.Element;
  readonly onSelectGroup: (groupId: string) => void;
  readonly onJoinViaInvite: (invite: GroupInvite) => Promise<string | null>;
  readonly onCreateGroup: (name: string) => Promise<string | null>;
  readonly onLeaveGroup: (groupId: string) => void;
};

const AVATAR_COLORS = [
  "bg-red-600", "bg-blue-600", "bg-green-600", "bg-purple-600",
  "bg-orange-600", "bg-teal-600", "bg-pink-600", "bg-indigo-600",
];

const avatarColor = (groupId: string): string => {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) {
    hash = ((hash << 5) - hash + groupId.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

export const GroupSidebar = (props: GroupSidebarProps) => {
  const [state, setState] = createSignal(createSidebarState());

  const dispatch = (event: Parameters<typeof transitionSidebar>[1]) => {
    setState((s) => transitionSidebar(s, event));
  };

  const handleJoinSubmit = async () => {
    if (state().isJoining) return;
    const input = state().joinInput.trim();
    if (!input) {
      dispatch({ type: "join-failed", error: "Paste an invite code" });
      return;
    }
    const result = decodeGroupInvite(input);
    if (!result.success) {
      dispatch({ type: "join-failed", error: "Invalid invite code" });
      return;
    }
    dispatch({ type: "join-started" });
    const error = await props.onJoinViaInvite(result.data);
    if (error) {
      dispatch({ type: "join-failed", error });
      return;
    }
    dispatch({ type: "join-succeeded" });
  };

  const handleJoinKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleJoinSubmit();
    }
    if (e.key === "Escape") {
      dispatch({ type: "join-form-closed" });
    }
  };

  const handleCreateSubmit = async () => {
    if (state().isCreating) return;
    const name = state().createInput.trim();
    if (!name) {
      dispatch({ type: "create-failed", error: "Enter a group name" });
      return;
    }
    dispatch({ type: "create-started" });
    const error = await props.onCreateGroup(name);
    if (error) {
      dispatch({ type: "create-failed", error });
      return;
    }
    dispatch({ type: "create-succeeded" });
  };

  const handleCreateKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleCreateSubmit();
    }
    if (e.key === "Escape") {
      dispatch({ type: "create-form-closed" });
    }
  };

  return (
    <div class="flex flex-col h-full bg-tg-sidebar">
      {props.topBanners}

      <div class="p-3 border-b border-tg-border flex gap-2">
        <button
          onClick={() => dispatch({ type: "join-form-opened" })}
          class="flex-1 py-1.5 px-3 rounded-lg border border-tg-border text-sm text-tg-text hover:bg-tg-hover cursor-pointer"
        >
          Join
        </button>
        <button
          onClick={() => dispatch({ type: "create-form-opened" })}
          class="flex-1 py-1.5 px-3 rounded-lg bg-tg-accent text-white text-sm hover:bg-tg-accent/80 cursor-pointer"
        >
          Create
        </button>
      </div>

      <Show when={state().isJoinFormOpen}>
        <div class="px-3 py-2.5 border-b border-tg-border bg-tg-chat">
          <input
            type="text"
            value={state().joinInput}
            onInput={(e) => dispatch({ type: "join-input-changed", value: e.currentTarget.value })}
            onKeyDown={handleJoinKeyDown}
            placeholder="Paste invite code..."
            autofocus
            disabled={state().isJoining}
            class="w-full px-2.5 py-1.5 rounded-lg bg-tg-sidebar border border-tg-border text-tg-text font-mono text-xs mb-2 box-border placeholder:text-tg-text-dim"
          />
          <Show when={state().joinError}>
            <div class="text-tg-danger text-xs mb-2">{state().joinError}</div>
          </Show>
          <div class="flex gap-2">
            <button
              onClick={() => void handleJoinSubmit()}
              disabled={!state().joinInput.trim() || state().isJoining}
              class="flex-1 py-1 px-2 rounded-lg bg-tg-success text-white text-xs cursor-pointer disabled:opacity-50"
            >
              {state().isJoining ? "Joining..." : "Join"}
            </button>
            <button
              onClick={() => dispatch({ type: "join-form-closed" })}
              disabled={state().isJoining}
              class="py-1 px-2 rounded-lg border border-tg-border text-tg-text text-xs cursor-pointer hover:bg-tg-hover"
            >
              Cancel
            </button>
          </div>
        </div>
      </Show>

      <Show when={state().isCreateFormOpen}>
        <div class="px-3 py-2.5 border-b border-tg-border bg-tg-chat">
          <input
            type="text"
            value={state().createInput}
            onInput={(e) => dispatch({ type: "create-input-changed", value: e.currentTarget.value })}
            onKeyDown={handleCreateKeyDown}
            placeholder="Group name..."
            autofocus
            disabled={state().isCreating}
            class="w-full px-2.5 py-1.5 rounded-lg bg-tg-sidebar border border-tg-border text-tg-text text-xs mb-2 box-border placeholder:text-tg-text-dim"
          />
          <Show when={state().createError}>
            <div class="text-tg-danger text-xs mb-2">{state().createError}</div>
          </Show>
          <div class="flex gap-2">
            <button
              onClick={() => void handleCreateSubmit()}
              disabled={!state().createInput.trim() || state().isCreating}
              class="flex-1 py-1 px-2 rounded-lg bg-tg-success text-white text-xs cursor-pointer disabled:opacity-50"
            >
              {state().isCreating ? "Creating..." : "Create"}
            </button>
            <button
              onClick={() => dispatch({ type: "create-form-closed" })}
              disabled={state().isCreating}
              class="py-1 px-2 rounded-lg border border-tg-border text-tg-text text-xs cursor-pointer hover:bg-tg-hover"
            >
              Cancel
            </button>
          </div>
        </div>
      </Show>

      <div class="flex-1 overflow-y-auto">
        <For each={props.groups} fallback={
          <div class="p-5 text-center text-tg-text-dim text-sm">
            No groups joined yet
          </div>
        }>
          {(group) => {
            const [hovered, setHovered] = createSignal(false);
            const isActive = () => props.activeGroupId === group.groupId;

            return (
              <div
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onClick={() => props.onSelectGroup(group.groupId)}
                class="flex items-center gap-3 px-3 py-2.5 cursor-pointer border-l-3"
                classList={{
                  "bg-tg-active border-tg-accent": isActive(),
                  "border-transparent hover:bg-tg-hover": !isActive(),
                }}
              >
                <div class={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0 ${avatarColor(group.groupId)}`}>
                  {(group.groupName ?? group.groupId).charAt(0).toUpperCase()}
                </div>

                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between">
                    <span class="flex items-center gap-1.5 min-w-0">
                      <span class="text-sm text-tg-text truncate" classList={{ "font-mono": !group.groupName }}>
                        {group.groupName ?? `${group.groupId.slice(0, 8)}...`}
                      </span>
                      <Show when={group.seenPeerCount > 0}>
                        <span class="text-[10px] text-tg-text-dim shrink-0">
                          {group.seenPeerCount} {group.seenPeerCount === 1 ? "peer" : "peers"}
                        </span>
                      </Show>
                    </span>
                    <Show when={group.lastMessage}>
                      <span class="text-[10px] text-tg-text-dim ml-2 shrink-0">
                        {formatTime(group.lastMessage!.timestamp)}
                      </span>
                    </Show>
                  </div>
                  <div class="flex items-center justify-between mt-0.5">
                    <span class="text-xs text-tg-text-dim truncate">
                      {group.lastMessage?.text ?? "No messages yet"}
                    </span>
                    <Show when={group.unreadCount > 0}>
                      <span class="min-w-[20px] h-5 rounded-full bg-tg-unread text-white text-[11px] flex items-center justify-center px-1.5 ml-2 shrink-0">
                        {group.unreadCount}
                      </span>
                    </Show>
                  </div>
                </div>

                <Show when={hovered()}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onLeaveGroup(group.groupId);
                    }}
                    class="text-tg-text-dim hover:text-tg-danger text-sm p-0.5 shrink-0"
                    title="Leave group"
                  >
                    &times;
                  </button>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
};
