export type MobileViewState = {
  readonly currentView: "group-list" | "chat";
  readonly isDevDrawerOpen: boolean;
};

export type MobileViewEvent =
  | { readonly type: "group-selected" }
  | { readonly type: "back-pressed" }
  | { readonly type: "dev-drawer-toggled" }
  | { readonly type: "dev-drawer-closed" };

export const createMobileViewState = (): MobileViewState => ({
  currentView: "group-list",
  isDevDrawerOpen: true,
});

export const transitionMobileView = (
  state: MobileViewState,
  event: MobileViewEvent,
): MobileViewState => {
  switch (event.type) {
    case "group-selected":
      return { ...state, currentView: "chat" };
    case "back-pressed":
      return { ...state, currentView: "group-list", isDevDrawerOpen: false };
    case "dev-drawer-toggled":
      return { ...state, isDevDrawerOpen: !state.isDevDrawerOpen };
    case "dev-drawer-closed":
      return { ...state, isDevDrawerOpen: false };
  }
};
