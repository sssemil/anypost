import { For, Show, createEffect } from "solid-js";
import { formatSenderDisplay } from "anypost-core/protocol";
import type { ChatMessageEvent } from "anypost-core/protocol";

type MessageListProps = {
  readonly messages: readonly ChatMessageEvent[];
  readonly ownPeerId: string;
};

const SYSTEM_SENDER_ID = "__system__";

const formatTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const MessageList = (props: MessageListProps) => {
  let containerRef: HTMLDivElement | undefined;

  createEffect(() => {
    const _msgs = props.messages;
    if (containerRef) {
      containerRef.scrollTop = containerRef.scrollHeight;
    }
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
              class="flex mb-2"
              classList={{
                "justify-end": isMe(),
                "justify-start": !isMe(),
              }}
            >
              <div
                class="max-w-[75%] sm:max-w-[60%] px-3 py-2 rounded-2xl"
                classList={{
                  "bg-tg-bubble-own rounded-br-sm": isMe(),
                  "bg-tg-bubble-other rounded-bl-sm": !isMe(),
                }}
              >
                <Show when={!isMe()}>
                  <div class="text-tg-accent text-xs font-medium mb-0.5">
                    {formatSenderDisplay(msg.senderDisplayName, msg.senderPeerId)}
                  </div>
                </Show>
                <div class="text-tg-text text-sm break-words">
                  {msg.text}
                  <span class="text-[10px] text-tg-text-dim ml-2 float-right mt-1">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );
};
