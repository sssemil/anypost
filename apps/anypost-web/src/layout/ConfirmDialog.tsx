import { Show } from "solid-js";
import { useEscapeLayer } from "./use-escape-layer.js";

type ConfirmDialogProps = {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly confirmVariant?: "danger" | "warning" | "default";
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
};

const confirmButtonClass = (variant: "danger" | "warning" | "default"): string => {
  switch (variant) {
    case "danger":
      return "bg-tg-danger text-white hover:bg-tg-danger/80";
    case "warning":
      return "bg-amber-500 text-white hover:bg-amber-500/80";
    case "default":
      return "bg-tg-accent text-white hover:bg-tg-accent/80";
  }
};

export const ConfirmDialog = (props: ConfirmDialogProps) => {
  useEscapeLayer("confirm-dialog", () => props.onCancel(), () => props.open);

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
        <div class="w-full max-w-sm rounded-lg border border-tg-border bg-tg-sidebar p-4 space-y-4">
          <h4 class="text-sm font-semibold text-tg-text">{props.title}</h4>
          <p class="text-xs text-tg-text-dim">{props.description}</p>
          <div class="flex gap-2 justify-end">
            <button
              class="px-3 py-1.5 rounded-lg border border-tg-border text-xs text-tg-text hover:bg-tg-hover cursor-pointer"
              onClick={() => props.onCancel()}
            >
              Cancel
            </button>
            <button
              class={`px-3 py-1.5 rounded-lg text-xs cursor-pointer ${confirmButtonClass(props.confirmVariant ?? "danger")}`}
              onClick={() => props.onConfirm()}
            >
              {props.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};
