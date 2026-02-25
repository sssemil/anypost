import { Show, createEffect, onCleanup, onMount } from "solid-js";

export type MessageInputControl = {
  readonly focus: () => void;
  readonly blur: () => void;
  readonly isFocused: () => boolean;
};

type MessageInputProps = {
  readonly onSend: (text: string) => void;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly disabled: boolean;
  readonly placeholder?: string;
  readonly modeLabel?: string | null;
  readonly modePreview?: string | null;
  readonly onCancelMode?: (() => void) | null;
  readonly onControlReady?: ((control: MessageInputControl | null) => void) | null;
};

export const MessageInput = (props: MessageInputProps) => {
  let textareaRef: HTMLTextAreaElement | undefined;
  const MIN_TEXTAREA_HEIGHT_PX = 40;

  const focusComposer = () => {
    if (!textareaRef || props.disabled) return;
    textareaRef.focus();
    const len = textareaRef.value.length;
    textareaRef.setSelectionRange(len, len);
  };

  const blurComposer = () => {
    textareaRef?.blur();
  };

  const composerIsFocused = () =>
    !!textareaRef && document.activeElement === textareaRef;

  const resetHeight = () => {
    if (textareaRef) {
      textareaRef.style.height = "auto";
      textareaRef.style.height = `${Math.max(textareaRef.scrollHeight, MIN_TEXTAREA_HEIGHT_PX)}px`;
    }
  };

  createEffect(() => {
    props.value;
    queueMicrotask(() => resetHeight());
  });

  const send = () => {
    const text = props.value.trim();
    if (!text) return;
    props.onSend(text);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  onMount(() => {
    props.onControlReady?.({
      focus: focusComposer,
      blur: blurComposer,
      isFocused: composerIsFocused,
    });
  });

  onCleanup(() => {
    props.onControlReady?.(null);
  });

  return (
    <div class="space-y-2">
      <Show when={props.modeLabel && props.modeLabel!.trim().length > 0}>
        <div class="rounded-lg border border-tg-border bg-tg-hover px-3 py-2 flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-[11px] uppercase tracking-wide text-tg-accent">{props.modeLabel}</p>
            <Show when={props.modePreview && props.modePreview!.trim().length > 0}>
              <p class="text-xs text-tg-text-dim truncate">{props.modePreview}</p>
            </Show>
          </div>
          <Show when={props.onCancelMode}>
            <button
              type="button"
              class="text-[11px] text-tg-text-dim hover:text-tg-text cursor-pointer"
              onClick={() => props.onCancelMode?.()}
            >
              cancel
            </button>
          </Show>
        </div>
      </Show>
      <div class="flex items-end gap-2">
      <textarea
        ref={textareaRef}
        rows={1}
        value={props.value}
        onInput={(e) => {
          props.onValueChange(e.currentTarget.value);
          resetHeight();
        }}
        onKeyDown={handleKeyDown}
        placeholder={props.placeholder ?? "Type a message..."}
        disabled={props.disabled}
        class="flex-1 py-2.5 px-4 rounded-2xl bg-tg-input border border-tg-border text-tg-text text-sm leading-5 resize-none max-h-32 min-h-10 placeholder:text-tg-text-dim focus:outline-none focus:border-tg-accent"
      />
      <button
        onClick={send}
        disabled={props.disabled || !props.value.trim()}
        class="w-10 h-10 rounded-full bg-tg-accent text-white flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-40 hover:bg-tg-accent/80"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
      </div>
    </div>
  );
};
