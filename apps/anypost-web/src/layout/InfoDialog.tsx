import type { JSX } from "solid-js";
import { Show } from "solid-js";

type InfoDialogProps = {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: JSX.Element;
};

export const InfoDialog = (props: InfoDialogProps) => {
  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-30 flex items-start justify-center">
        <div
          class="absolute inset-0 bg-black/50 hidden sm:block"
          onClick={() => props.onClose()}
        />

        <div class="fixed inset-0 flex flex-col bg-tg-sidebar sm:static sm:mt-[7vh] sm:w-full sm:max-w-lg sm:max-h-[85vh] sm:rounded-xl sm:border sm:border-tg-border sm:shadow-2xl sm:flex-col">
          <div
            class="flex items-center justify-between px-4 py-3 border-b border-tg-border shrink-0"
            style={{ "padding-top": "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
          >
            <span class="font-semibold text-tg-text">{props.title}</span>
            <button
              class="text-tg-text-dim hover:text-tg-text text-xl leading-none p-1 cursor-pointer"
              onClick={() => props.onClose()}
            >
              &times;
            </button>
          </div>
          <div class="flex-1 overflow-y-auto p-4">
            {props.children}
          </div>
        </div>
      </div>
    </Show>
  );
};
