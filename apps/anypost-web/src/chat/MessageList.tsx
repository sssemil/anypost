import { For } from "solid-js";
import { formatSenderDisplay } from "anypost-core/protocol";
import type { ChatMessageEvent } from "anypost-core/protocol";

type MessageListProps = {
  readonly messages: readonly ChatMessageEvent[];
  readonly ownPeerId: string;
};

const dimText = { color: "#888", "font-size": "0.8em" } as const;

export const MessageList = (props: MessageListProps) => {
  return (
    <div style={{
      border: "1px solid #ccc",
      "border-radius": "8px",
      height: "100%",
      "overflow-y": "auto",
      padding: "12px",
    }}>
      <For each={props.messages} fallback={
        <div style={{ ...dimText, "text-align": "center", padding: "40px 0" }}>
          No messages yet. Send something!
        </div>
      }>
        {(msg) => {
          const isMe = () => props.ownPeerId === msg.senderPeerId;
          return (
            <div style={{ "margin-bottom": "8px" }}>
              <strong style={{ color: isMe() ? "#1565c0" : "#333" }}>
                {isMe() ? "You" : formatSenderDisplay(msg.senderDisplayName, msg.senderPeerId)}
              </strong>{" "}
              <span style={dimText}>
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
              <div>{msg.text}</div>
            </div>
          );
        }}
      </For>
    </div>
  );
};
