export type RightPanel = "none" | "dev-tools" | "group-info" | "contacts" | "settings" | "about";

export type MobileViewState = {
  readonly currentView: "group-list" | "chat";
  readonly rightPanel: RightPanel;
};

export type MobileViewEvent =
  | { readonly type: "group-selected" }
  | { readonly type: "back-pressed" }
  | { readonly type: "dev-drawer-toggled" }
  | { readonly type: "dev-drawer-closed" }
  | { readonly type: "contacts-toggled" }
  | { readonly type: "contacts-closed" }
  | { readonly type: "settings-toggled" }
  | { readonly type: "settings-closed" }
  | { readonly type: "about-toggled" }
  | { readonly type: "about-closed" }
  | { readonly type: "group-info-toggled" }
  | { readonly type: "group-info-closed" };

export const createMobileViewState = (): MobileViewState => ({
  currentView: "group-list",
  rightPanel: "dev-tools",
});

const togglePanel = (current: RightPanel, target: RightPanel): RightPanel =>
  current === target ? "none" : target;

export const transitionMobileView = (
  state: MobileViewState,
  event: MobileViewEvent,
): MobileViewState => {
  switch (event.type) {
    case "group-selected":
      return { ...state, currentView: "chat" };
    case "back-pressed":
      return { ...state, currentView: "group-list", rightPanel: "none" };
    case "dev-drawer-toggled":
      return { ...state, rightPanel: togglePanel(state.rightPanel, "dev-tools") };
    case "dev-drawer-closed":
      return { ...state, rightPanel: "none" };
    case "contacts-toggled":
      return { ...state, rightPanel: togglePanel(state.rightPanel, "contacts") };
    case "contacts-closed":
      return { ...state, rightPanel: "none" };
    case "settings-toggled":
      return { ...state, rightPanel: togglePanel(state.rightPanel, "settings") };
    case "settings-closed":
      return { ...state, rightPanel: "none" };
    case "about-toggled":
      return { ...state, rightPanel: togglePanel(state.rightPanel, "about") };
    case "about-closed":
      return { ...state, rightPanel: "none" };
    case "group-info-toggled":
      return { ...state, rightPanel: togglePanel(state.rightPanel, "group-info") };
    case "group-info-closed":
      return { ...state, rightPanel: "none" };
  }
};
