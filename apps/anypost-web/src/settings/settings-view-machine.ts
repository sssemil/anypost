export type SettingsView = "main" | "devices";

export type SettingsViewState = {
  readonly currentView: SettingsView;
};

export type SettingsViewEvent =
  | { readonly type: "devices-opened" }
  | { readonly type: "back-pressed" };

export const createSettingsViewState = (): SettingsViewState => ({
  currentView: "main",
});

export const transitionSettingsView = (
  state: SettingsViewState,
  event: SettingsViewEvent,
): SettingsViewState => {
  switch (event.type) {
    case "devices-opened":
      return { ...state, currentView: "devices" };
    case "back-pressed":
      return { ...state, currentView: "main" };
  }
};
