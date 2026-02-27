import { createSignal, Match, Switch } from "solid-js";
import type { NotificationPreferenceKey, NotificationPreferences, RegisteredDevice } from "anypost-core/data";
import { createSettingsViewState, transitionSettingsView } from "./settings-view-machine.js";
import { SettingsMainView } from "./SettingsMainView.js";
import { SettingsDevicesView } from "./SettingsDevicesView.js";

type SettingsPageProps = {
  readonly accountId: string;
  readonly peerId: string;
  readonly displayName: string;
  readonly isBackedUp: boolean;
  readonly notificationPreferences: NotificationPreferences;
  readonly registeredDevices: readonly RegisteredDevice[];
  readonly onSaveDisplayName: (name: string) => Promise<string | null>;
  readonly onNotificationPreferenceChange: (key: NotificationPreferenceKey, value: boolean) => void;
  readonly onRemoveDevice: (devicePeerId: string) => void;
};

export const SettingsPage = (props: SettingsPageProps) => {
  const [viewState, setViewState] = createSignal(createSettingsViewState());

  const dispatch = (event: Parameters<typeof transitionSettingsView>[1]) => {
    setViewState((s) => transitionSettingsView(s, event));
  };

  const deviceCount = () => props.registeredDevices.length;

  return (
    <Switch>
      <Match when={viewState().currentView === "main"}>
        <SettingsMainView
          accountId={props.accountId}
          displayName={props.displayName}
          isBackedUp={props.isBackedUp}
          notificationPreferences={props.notificationPreferences}
          deviceCount={deviceCount()}
          onSaveDisplayName={props.onSaveDisplayName}
          onNotificationPreferenceChange={props.onNotificationPreferenceChange}
          onDevicesOpen={() => dispatch({ type: "devices-opened" })}
        />
      </Match>
      <Match when={viewState().currentView === "devices"}>
        <SettingsDevicesView
          peerId={props.peerId}
          registeredDevices={props.registeredDevices}
          onRemoveDevice={props.onRemoveDevice}
          onBack={() => dispatch({ type: "back-pressed" })}
        />
      </Match>
    </Switch>
  );
};
