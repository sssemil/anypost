import type { JSX } from "solid-js";
import { Match, Show, Switch } from "solid-js";
import type { RightPanel } from "./mobile-view-machine.js";

type ChatLayoutProps = {
  readonly sidebar: JSX.Element;
  readonly header: JSX.Element;
  readonly messageList: JSX.Element;
  readonly messageInput: JSX.Element;
  readonly devDrawerContent: JSX.Element;
  readonly groupInfoContent: JSX.Element;
  readonly contactsContent: JSX.Element;
  readonly profileContent: JSX.Element;
  readonly aboutContent: JSX.Element;
  readonly mobileView: "group-list" | "chat";
  readonly rightPanel: RightPanel;
  readonly onRightPanelClose: () => void;
};

const PANEL_TITLES: Record<Exclude<RightPanel, "none">, string> = {
  "dev-tools": "Developer Tools",
  "group-info": "Group Info",
  "contacts": "Contacts",
  "profile": "Profile",
  "about": "About",
};

export const ChatLayout = (props: ChatLayoutProps) => {
  return (
    <div class="flex flex-col h-dvh font-sans bg-tg-chat text-tg-text">
      {props.header}

      <div class="flex flex-1 min-h-0">
        <div
          class="w-full sm:w-80 sm:min-w-80 sm:!flex flex-col border-r border-tg-border"
          classList={{
            flex: props.mobileView === "group-list" && props.rightPanel === "none",
            hidden: props.mobileView !== "group-list" || props.rightPanel !== "none",
          }}
        >
          {props.sidebar}
        </div>

        <div
          class="flex-1 sm:!flex flex-col min-w-0"
          classList={{
            flex: props.mobileView === "chat" && props.rightPanel === "none",
            hidden: props.mobileView !== "chat" || props.rightPanel !== "none",
          }}
        >
          <div class="flex-1 min-h-0">
            {props.messageList}
          </div>

          <div class="p-3">
            {props.messageInput}
          </div>
        </div>

        <Show when={props.rightPanel !== "none"}>
          <div class="fixed inset-0 z-20 w-full flex flex-col bg-tg-sidebar sm:static sm:z-auto sm:w-[420px] sm:min-w-[420px] sm:border-l sm:border-tg-border">
            <div class="flex items-center justify-between px-4 py-3 border-b border-tg-border shrink-0">
              <span class="font-semibold text-tg-text">
                {PANEL_TITLES[props.rightPanel as Exclude<RightPanel, "none">]}
              </span>
              <button
                class="text-tg-text-dim hover:text-tg-text text-xl leading-none p-1 cursor-pointer"
                onClick={() => props.onRightPanelClose()}
              >
                &times;
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-4">
              <Switch>
                <Match when={props.rightPanel === "dev-tools"}>
                  {props.devDrawerContent}
                </Match>
                <Match when={props.rightPanel === "group-info"}>
                  {props.groupInfoContent}
                </Match>
                <Match when={props.rightPanel === "contacts"}>
                  {props.contactsContent}
                </Match>
                <Match when={props.rightPanel === "profile"}>
                  {props.profileContent}
                </Match>
                <Match when={props.rightPanel === "about"}>
                  {props.aboutContent}
                </Match>
              </Switch>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};
