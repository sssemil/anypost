import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { formatPeerIdForDisplay } from "anypost-core/protocol";
import type { ChatMessageEvent } from "anypost-core/protocol";
import { parseQuotedMessage } from "./message-quote.js";

type MessageReadEntry = {
  readonly peerId: string;
  readonly label: string;
  readonly readAt: number;
};

type MessageListProps = {
  readonly messages: readonly ChatMessageEvent[];
  readonly ownPeerId: string;
  readonly resolveSenderLabel?: (senderPeerId: string, senderDisplayName?: string) => string;
  readonly readByMessageId?: ReadonlyMap<string, readonly MessageReadEntry[]>;
  readonly editedAtByMessageId?: ReadonlyMap<string, number>;
  readonly isDirectMessage?: boolean;
  readonly onReplyMessage?: (message: ChatMessageEvent) => void;
  readonly onEditMessage?: (message: ChatMessageEvent) => void;
  readonly onDeleteMessage?: (message: ChatMessageEvent) => void;
};

const SYSTEM_SENDER_ID = "__system__";
const SEEN_PANEL_HOVER_CLOSE_MS = 100;

const formatTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const formatSeenTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const isSameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return isSameDay
    ? `today at ${time}`
    : `${date.toLocaleDateString()} ${time}`;
};

const formatEditedTime = (timestamp: number): string =>
  `edited ${new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

export const MessageList = (props: MessageListProps) => {
  let containerRef: HTMLDivElement | undefined;
  let contextMenuRef: HTMLDivElement | undefined;
  let seenPanelRef: HTMLDivElement | undefined;
  const messageElementById = new Map<string, HTMLDivElement>();
  let flashResetTimer: ReturnType<typeof setTimeout> | undefined;
  let seenPanelCloseTimer: ReturnType<typeof setTimeout> | undefined;
  const [flashedMessageId, setFlashedMessageId] = createSignal<string | null>(null);
  const [contextMenu, setContextMenu] = createSignal<{
    readonly message: ChatMessageEvent;
    readonly x: number;
    readonly y: number;
  } | null>(null);
  const [seenPanel, setSeenPanel] = createSignal<{
    readonly messageId: string;
    readonly x: number;
    readonly y: number;
  } | null>(null);

  createEffect(() => {
    props.messages;
    if (containerRef) {
      containerRef.scrollTop = containerRef.scrollHeight;
    }
    const validIds = new Set(props.messages.map((message) => message.id));
    for (const id of [...messageElementById.keys()]) {
      if (!validIds.has(id)) messageElementById.delete(id);
    }
  });

  createEffect(() => {
    const menu = contextMenu();
    const panel = seenPanel();
    if (!menu && !panel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setContextMenu(null);
      setSeenPanel(null);
    };
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  createEffect(() => {
    const menu = contextMenu();
    const panel = seenPanel();
    if (!menu && !panel) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (contextMenuRef?.contains(target) || seenPanelRef?.contains(target)) return;
      setContextMenu(null);
      setSeenPanel(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    onCleanup(() => window.removeEventListener("pointerdown", onPointerDown));
  });

  const getReaders = (messageId: string): readonly MessageReadEntry[] =>
    props.readByMessageId?.get(messageId) ?? [];
  const getEditedAt = (messageId: string): number | null =>
    props.editedAtByMessageId?.get(messageId) ?? null;

  const handleCopyText = (message: ChatMessageEvent) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    const visibleText = parseQuotedMessage(message.text).body;
    void navigator.clipboard.writeText(visibleText).catch(() => {});
  };

  const flashMessage = (messageId: string) => {
    if (flashResetTimer) clearTimeout(flashResetTimer);
    setFlashedMessageId(messageId);
    flashResetTimer = setTimeout(() => {
      setFlashedMessageId((current) => (current === messageId ? null : current));
    }, 1200);
  };

  const clearSeenPanelCloseTimer = () => {
    if (!seenPanelCloseTimer) return;
    clearTimeout(seenPanelCloseTimer);
    seenPanelCloseTimer = undefined;
  };

  const scheduleSeenPanelClose = () => {
    clearSeenPanelCloseTimer();
    seenPanelCloseTimer = setTimeout(() => {
      setSeenPanel(null);
    }, SEEN_PANEL_HOVER_CLOSE_MS);
  };

  const openSeenPanel = (messageId: string, x: number, y: number) => {
    clearSeenPanelCloseTimer();
    setSeenPanel({ messageId, x, y });
  };

  const focusQuotedMessage = (quotedMessageId?: string) => {
    if (!quotedMessageId) return;
    const target = messageElementById.get(quotedMessageId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    flashMessage(quotedMessageId);
  };

  onCleanup(() => {
    if (flashResetTimer) clearTimeout(flashResetTimer);
    clearSeenPanelCloseTimer();
  });

  return (
    <div
      ref={containerRef}
      class="h-full overflow-y-auto px-4 py-3"
    >
      <For each={props.messages} fallback={
        <div class="text-tg-text-dim text-sm text-center py-10">
          No messages yet. Send something!
        </div>
      }>
        {(msg) => {
          const isSystem = () => msg.senderPeerId === SYSTEM_SENDER_ID;
          const isMe = () => props.ownPeerId === msg.senderPeerId;
          const parsed = parseQuotedMessage(msg.text);
          const editedAt = getEditedAt(msg.id);
          if (isSystem()) {
            return (
              <div class="flex justify-center my-2">
                <div class="text-[11px] text-tg-text-dim bg-tg-hover border border-tg-border rounded-full px-2.5 py-1">
                  {msg.text} · {formatTime(msg.timestamp)}
                </div>
              </div>
            );
          }
          return (
            <div
              ref={(el) => {
                messageElementById.set(msg.id, el);
              }}
              class="flex mb-2"
              classList={{
                "justify-end": isMe(),
                "justify-start": !isMe(),
                "animate-pulse": flashedMessageId() === msg.id,
              }}
            >
              <div
                class="max-w-[75%] sm:max-w-[60%] px-3 py-2 rounded-2xl"
                classList={{
                  "bg-tg-bubble-own rounded-br-sm": isMe(),
                  "bg-tg-bubble-other rounded-bl-sm": !isMe(),
                  "ring-2 ring-tg-accent/70": flashedMessageId() === msg.id,
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  clearSeenPanelCloseTimer();
                  setContextMenu(null);
                  setSeenPanel(null);
                  queueMicrotask(() => {
                    setContextMenu({
                      message: msg,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  });
                }}
              >
                <Show when={!isMe()}>
                  <div class="text-tg-accent text-xs font-medium mb-0.5">
                    {props.resolveSenderLabel
                      ? props.resolveSenderLabel(msg.senderPeerId, msg.senderDisplayName)
                      : (msg.senderDisplayName?.trim() || formatPeerIdForDisplay(msg.senderPeerId))}
                  </div>
                </Show>
                <div class="text-tg-text text-sm break-words">
                  <Show when={parsed.quote}>
                    {(quote) => (
                      <button
                        type="button"
                        disabled={!quote().messageId}
                        class="mb-1.5 block w-full text-left rounded-lg bg-tg-hover border-l-2 border-tg-accent px-2 py-1 disabled:cursor-default"
                        classList={{
                          "cursor-pointer hover:bg-tg-hover/80": !!quote().messageId,
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          focusQuotedMessage(quote().messageId);
                        }}
                      >
                        <div class="text-[11px] text-tg-accent leading-tight truncate">
                          {quote().senderLabel}
                        </div>
                        <div class="text-[11px] text-tg-text-dim leading-tight truncate">
                          {quote().text}
                        </div>
                      </button>
                    )}
                  </Show>
                  {parsed.body}
                  <span class="text-[10px] text-tg-text-dim ml-2 float-right mt-1">
                    {editedAt !== null ? formatEditedTime(editedAt) : formatTime(msg.timestamp)}
                  </span>
                </div>
              </div>
            </div>
          );
        }}
      </For>
      <Show when={contextMenu() || seenPanel()}>
        <div
          class="fixed inset-0 z-40"
          onClick={() => {
            setContextMenu(null);
            setSeenPanel(null);
          }}
        />
      </Show>
      <Show when={contextMenu()}>
        {(menu) => {
          const message = menu().message;
          const isOwn = message.senderPeerId === props.ownPeerId;
          const readers = getReaders(message.id);
          const editedAt = getEditedAt(message.id);
          const latestReadAt = readers.length > 0
            ? readers[0]!.readAt
            : null;
          return (
            <div
              ref={contextMenuRef}
              class="fixed z-50 min-w-[140px] rounded-lg border border-tg-border bg-tg-sidebar shadow-lg py-1"
              classList={{
                "w-40": true,
              }}
              style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                class="w-full text-left px-3 py-2 text-sm text-tg-text hover:bg-tg-hover"
                onClick={() => {
                  props.onReplyMessage?.(message);
                  setContextMenu(null);
                }}
              >
                Reply
              </button>
              <Show when={isOwn}>
                <button
                  type="button"
                  class="w-full text-left px-3 py-2 text-sm text-tg-text hover:bg-tg-hover"
                  onClick={() => {
                    props.onEditMessage?.(message);
                    setContextMenu(null);
                  }}
                >
                  Edit
                </button>
              </Show>
              <button
                type="button"
                class="w-full text-left px-3 py-2 text-sm text-tg-text hover:bg-tg-hover"
                onClick={() => {
                  handleCopyText(message);
                  setContextMenu(null);
                }}
              >
                Copy Text
              </button>
              <Show when={isOwn}>
                <button
                  type="button"
                  class="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-tg-hover"
                  onClick={() => {
                    props.onDeleteMessage?.(message);
                    setContextMenu(null);
                  }}
                >
                  Delete
                </button>
              </Show>
              <Show when={!props.isDirectMessage}>
                <button
                  type="button"
                  class="w-full text-left px-3 py-2 text-sm text-tg-text hover:bg-tg-hover disabled:text-tg-text-dim disabled:hover:bg-transparent"
                  disabled={readers.length === 0}
                  onMouseEnter={() => {
                    if (readers.length === 0) return;
                    openSeenPanel(message.id, menu().x + 12, menu().y + 12);
                  }}
                  onMouseLeave={() => {
                    if (readers.length === 0) return;
                    scheduleSeenPanelClose();
                  }}
                  onClick={() => {
                    if (readers.length === 0) return;
                    openSeenPanel(message.id, menu().x + 12, menu().y + 12);
                  }}
                >
                  Seen ({readers.length})
                </button>
              </Show>
              <Show when={editedAt !== null}>
                <div class="mt-1 border-t border-tg-border px-3 py-2 text-sm text-tg-text-dim">
                  ✎ {formatSeenTime(editedAt!)}
                </div>
              </Show>
              <Show when={props.isDirectMessage && isOwn && latestReadAt !== null}>
                <div class="mt-1 border-t border-tg-border px-3 py-2 text-sm text-tg-text-dim">
                  ✓ {formatSeenTime(latestReadAt!)}
                </div>
              </Show>
            </div>
          );
        }}
      </Show>
      <Show when={seenPanel()}>
        {(panel) => {
          const readers = getReaders(panel().messageId);
          return (
            <div
              ref={seenPanelRef}
              class="fixed z-50 w-[250px] max-w-[85vw] rounded-xl border border-tg-border bg-tg-sidebar shadow-lg"
              style={{ left: `${panel().x}px`, top: `${panel().y}px` }}
              onClick={(event) => event.stopPropagation()}
              onMouseEnter={clearSeenPanelCloseTimer}
              onMouseLeave={scheduleSeenPanelClose}
            >
              <div class="px-3 py-2 border-b border-tg-border text-xs text-tg-text-dim">
                {readers.length} seen
              </div>
              <Show when={readers.length > 0} fallback={
                <div class="px-3 py-2 text-sm text-tg-text-dim">No read receipts yet.</div>
              }>
                <For each={readers}>
                  {(entry) => (
                    <div class="px-3 py-2 border-b border-tg-border/60 last:border-b-0">
                      <div class="text-sm text-tg-text truncate">{entry.label}</div>
                      <div class="text-xs text-tg-text-dim">✓✓ {formatSeenTime(entry.readAt)}</div>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          );
        }}
      </Show>
    </div>
  );
};
