import { createSignal } from "solid-js";

type MessageInputProps = {
  readonly onSend: (text: string) => void;
  readonly disabled: boolean;
};

export const MessageInput = (props: MessageInputProps) => {
  const [inputText, setInputText] = createSignal("");

  const send = () => {
    const text = inputText().trim();
    if (!text) return;
    props.onSend(text);
    setInputText("");
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div style={{ display: "flex", gap: "8px" }}>
      <input
        type="text"
        value={inputText()}
        onInput={(e) => setInputText(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        disabled={props.disabled}
        style={{ flex: 1, padding: "8px", "border-radius": "4px", border: "1px solid #ccc" }}
      />
      <button
        onClick={send}
        disabled={props.disabled || !inputText().trim()}
        style={{ padding: "8px 16px", "border-radius": "4px", cursor: "pointer" }}
      >
        Send
      </button>
    </div>
  );
};
