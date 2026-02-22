import { createSignal, For, onCleanup, onMount } from "solid-js";
import { createPlaintextChat } from "anypost-core/protocol";
import type { PlaintextChat } from "anypost-core/protocol";

type ChatMessage = {
  readonly id: string;
  readonly senderPeerId: string;
  readonly text: string;
  readonly timestamp: number;
};

const DEFAULT_GROUP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

export const App = () => {
  const [messages, setMessages] = createSignal<readonly ChatMessage[]>([]);
  const [inputText, setInputText] = createSignal("");
  const [status, setStatus] = createSignal<"connecting" | "connected" | "disconnected">("connecting");
  const [peerId, setPeerId] = createSignal("");

  let chat: PlaintextChat | undefined;

  onMount(async () => {
    try {
      chat = await createPlaintextChat({
        groupId: DEFAULT_GROUP_ID,
        bootstrapPeers: [],
      });

      setPeerId(chat.peerId);
      setStatus("connected");

      chat.onMessage((msg) => {
        setMessages((prev) => [...prev, msg]);
      });
    } catch {
      setStatus("disconnected");
    }
  });

  onCleanup(async () => {
    if (chat) {
      await chat.stop();
    }
  });

  const sendMessage = async () => {
    const text = inputText().trim();
    if (!text || !chat) return;

    await chat.sendMessage(text);

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        senderPeerId: chat!.peerId,
        text,
        timestamp: Date.now(),
      },
    ]);

    setInputText("");
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={{ "max-width": "600px", margin: "0 auto", padding: "20px", "font-family": "system-ui" }}>
      <h1>Anypost</h1>
      <p>
        Status: <strong>{status()}</strong>
        {peerId() && <> | PeerId: <code>{peerId().slice(0, 16)}...</code></>}
      </p>

      <div style={{
        border: "1px solid #ccc",
        "border-radius": "8px",
        height: "400px",
        "overflow-y": "auto",
        padding: "12px",
        "margin-bottom": "12px",
      }}>
        <For each={messages()}>
          {(msg) => (
            <div style={{ "margin-bottom": "8px" }}>
              <strong>{msg.senderPeerId.slice(0, 12)}...</strong>{" "}
              <span style={{ color: "#666", "font-size": "0.8em" }}>
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
              <div>{msg.text}</div>
            </div>
          )}
        </For>
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <input
          type="text"
          value={inputText()}
          onInput={(e) => setInputText(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={status() !== "connected"}
          style={{ flex: 1, padding: "8px", "border-radius": "4px", border: "1px solid #ccc" }}
        />
        <button
          onClick={sendMessage}
          disabled={status() !== "connected" || !inputText().trim()}
          style={{ padding: "8px 16px", "border-radius": "4px", cursor: "pointer" }}
        >
          Send
        </button>
      </div>
    </div>
  );
};
