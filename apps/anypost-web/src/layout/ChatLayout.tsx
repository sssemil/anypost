import type { JSX } from "solid-js";
import { Show } from "solid-js";

type ChatLayoutProps = {
  readonly sidebar: JSX.Element;
  readonly header: JSX.Element;
  readonly messageList: JSX.Element;
  readonly messageInput: JSX.Element;
  readonly devDrawerContent: JSX.Element;
  readonly mobileView: "group-list" | "chat";
  readonly isDevDrawerOpen: boolean;
  readonly onDevDrawerClose: () => void;
};

export const ChatLayout = (props: ChatLayoutProps) => {
  return (
    <div class="flex flex-col h-dvh font-sans bg-tg-chat text-tg-text">
      {props.header}

      <div class="flex flex-1 min-h-0">
        <div
          class="w-full sm:w-80 sm:min-w-80 sm:!flex flex-col border-r border-tg-border"
          classList={{
            flex: props.mobileView === "group-list",
            hidden: props.mobileView !== "group-list",
          }}
        >
          {props.sidebar}
        </div>

        <div
          class="flex-1 sm:!flex flex-col min-w-0"
          classList={{
            flex: props.mobileView === "chat",
            hidden: props.mobileView !== "chat",
          }}
        >
          <div class="flex-1 min-h-0">
            {props.messageList}
          </div>

          <div class="p-3">
            {props.messageInput}
          </div>
        </div>

        <Show when={props.isDevDrawerOpen}>
          <div class="w-full sm:w-[420px] sm:min-w-[420px] flex flex-col border-l border-tg-border bg-tg-sidebar">
            <div class="flex items-center justify-between px-4 py-3 border-b border-tg-border shrink-0">
              <span class="font-semibold text-tg-text">Developer Tools</span>
              <button
                class="text-tg-text-dim hover:text-tg-text text-xl leading-none p-1 cursor-pointer"
                onClick={() => props.onDevDrawerClose()}
              >
                &times;
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-4">
              {props.devDrawerContent}
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};
