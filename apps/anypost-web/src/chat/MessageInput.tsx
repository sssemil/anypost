import { createSignal } from "solid-js";

type MessageInputProps = {
  readonly onSend: (text: string) => void;
  readonly disabled: boolean;
  readonly placeholder?: string;
};

export const MessageInput = (props: MessageInputProps) => {
  const [inputText, setInputText] = createSignal("");
  let textareaRef: HTMLTextAreaElement | undefined;

  const resetHeight = () => {
    if (textareaRef) {
      textareaRef.style.height = "auto";
      textareaRef.style.height = `${textareaRef.scrollHeight}px`;
    }
  };

  const send = () => {
    const text = inputText().trim();
    if (!text) return;
    props.onSend(text);
    setInputText("");
    if (textareaRef) {
      textareaRef.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div class="flex items-end gap-2">
      <textarea
        ref={textareaRef}
        rows={1}
        value={inputText()}
        onInput={(e) => {
          setInputText(e.currentTarget.value);
          resetHeight();
        }}
        onKeyDown={handleKeyDown}
        placeholder={props.placeholder ?? "Type a message..."}
        disabled={props.disabled}
        class="flex-1 py-2.5 px-4 rounded-2xl bg-tg-input border border-tg-border text-tg-text text-sm resize-none max-h-32 placeholder:text-tg-text-dim focus:outline-none focus:border-tg-accent"
      />
      <button
        onClick={send}
        disabled={props.disabled || !inputText().trim()}
        class="w-10 h-10 rounded-full bg-tg-accent text-white flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-40 hover:bg-tg-accent/80"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </div>
  );
};
