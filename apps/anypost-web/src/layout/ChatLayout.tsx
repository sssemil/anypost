import type { JSX } from "solid-js";
import { Match, Show, Switch } from "solid-js";
import type { RightPanel } from "./mobile-view-machine.js";

type SidePanelType = "dev-tools" | "contacts" | "settings" | "about";

type ChatLayoutProps = {
  readonly sidebar: JSX.Element;
  readonly header: JSX.Element;
  readonly messageList: JSX.Element;
  readonly messageInput: JSX.Element;
  readonly devDrawerContent: JSX.Element;
  readonly contactsContent: JSX.Element;
  readonly settingsContent: JSX.Element;
  readonly aboutContent: JSX.Element;
  readonly hasActiveGroup: boolean;
  readonly mobileView: "group-list" | "chat";
  readonly rightPanel: RightPanel;
  readonly onRightPanelClose: () => void;
  readonly messageInputInsetPx?: number;
};

const PANEL_TITLES: Record<SidePanelType, string> = {
  "dev-tools": "Developer Tools",
  "contacts": "Contacts",
  "settings": "Settings",
  "about": "About",
};

const isSidePanel = (panel: RightPanel): panel is SidePanelType =>
  panel !== "none" && panel !== "group-info";

export const ChatLayout = (props: ChatLayoutProps) => {
  return (
    <div class="flex flex-col h-dvh font-sans bg-tg-chat text-tg-text">
      {props.header}

      <div class="flex flex-1 min-h-0">
        <div
          class="w-full sm:w-80 sm:min-w-80 sm:!flex flex-col border-r border-tg-border"
          classList={{
            flex: props.mobileView === "group-list" && !isSidePanel(props.rightPanel),
            hidden: props.mobileView !== "group-list" || isSidePanel(props.rightPanel),
          }}
        >
          {props.sidebar}
        </div>

        <div
          class="flex-1 sm:!flex flex-col min-w-0"
          classList={{
            flex: props.mobileView === "chat" && !isSidePanel(props.rightPanel),
            hidden: props.mobileView !== "chat" || isSidePanel(props.rightPanel),
          }}
        >
          <Show
            when={props.hasActiveGroup}
            fallback={
              <div class="flex-1 flex items-center justify-center">
                <span class="text-tg-text-dim text-sm bg-tg-sidebar/60 px-4 py-2 rounded-full">
                  Select a chat to start messaging
                </span>
              </div>
            }
          >
            <div class="flex-1 min-h-0">
              {props.messageList}
            </div>

            <div
              class="px-3 pt-3 shrink-0"
              style={{
                "min-height": "calc(76px + env(safe-area-inset-bottom, 0px))",
                "padding-bottom": `max(calc(env(safe-area-inset-bottom, 0px) + ${Math.max(0, Math.round(props.messageInputInsetPx ?? 0))}px), 12px)`,
              }}
            >
              {props.messageInput}
            </div>
          </Show>
        </div>

        <Show when={isSidePanel(props.rightPanel)}>
          <div class="fixed inset-0 z-20 w-full flex flex-col bg-tg-sidebar sm:static sm:z-auto sm:w-[420px] sm:min-w-[420px] sm:border-l sm:border-tg-border">
            <div
              class="flex items-center justify-between px-4 py-3 border-b border-tg-border shrink-0"
              style={{ "padding-top": "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
            >
              <span class="font-semibold text-tg-text">
                {PANEL_TITLES[props.rightPanel as SidePanelType]}
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
                <Match when={props.rightPanel === "contacts"}>
                  {props.contactsContent}
                </Match>
                <Match when={props.rightPanel === "settings"}>
                  {props.settingsContent}
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
