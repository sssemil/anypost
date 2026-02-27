import { createSignal, For, Show } from "solid-js";
import type { RegisteredDevice } from "anypost-core/data";
import { ConfirmDialog } from "../layout/ConfirmDialog.js";

type SettingsDevicesViewProps = {
  readonly peerId: string;
  readonly registeredDevices: readonly RegisteredDevice[];
  readonly onRemoveDevice: (devicePeerId: string) => void;
  readonly onBack: () => void;
};

const truncatePeerId = (id: string): string =>
  id.length > 16 ? `${id.slice(0, 8)}...${id.slice(-8)}` : id;

export const SettingsDevicesView = (props: SettingsDevicesViewProps) => {
  const [removingDeviceId, setRemovingDeviceId] = createSignal<string | null>(null);

  const otherDevices = () =>
    props.registeredDevices.filter((d) => d.devicePeerId !== props.peerId);

  const handleConfirmRemove = () => {
    const id = removingDeviceId();
    if (id) {
      props.onRemoveDevice(id);
      setRemovingDeviceId(null);
    }
  };

  return (
    <div class="space-y-4">
      <div class="flex items-center gap-2 -mx-1">
        <button
          class="text-tg-accent p-1 cursor-pointer hover:bg-tg-hover rounded"
          onClick={() => props.onBack()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span class="font-semibold text-tg-text text-[15px]">Devices</span>
      </div>

      <div class="rounded-lg border border-tg-border bg-tg-hover overflow-hidden">
        <div class="px-3 py-2 text-[11px] text-tg-text-dim uppercase tracking-wide">This device</div>
        <div class="px-3 py-2.5 border-t border-tg-border/50">
          <span class="font-mono text-sm text-tg-text">{truncatePeerId(props.peerId)}</span>
        </div>
      </div>

      <Show when={otherDevices().length > 0}>
        <div class="rounded-lg border border-tg-border bg-tg-hover overflow-hidden">
          <div class="px-3 py-2 text-[11px] text-tg-text-dim uppercase tracking-wide">Other devices</div>
          <For each={otherDevices()}>
            {(device) => (
              <div class="flex items-center justify-between px-3 py-2.5 border-t border-tg-border/50">
                <div class="min-w-0">
                  <div class="font-mono text-sm text-tg-text truncate">{truncatePeerId(device.devicePeerId)}</div>
                  <div class="text-[11px] text-tg-text-dim">
                    Last seen {new Date(device.lastSeen).toLocaleDateString()}
                  </div>
                </div>
                <button
                  class="text-xs text-tg-danger hover:text-tg-danger/80 cursor-pointer shrink-0 ml-2"
                  onClick={() => setRemovingDeviceId(device.devicePeerId)}
                >
                  Remove
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={otherDevices().length === 0}>
        <div class="text-center text-sm text-tg-text-dim py-4">
          No other devices registered
        </div>
      </Show>

      <ConfirmDialog
        open={removingDeviceId() !== null}
        title="Remove device"
        description="This device will be deregistered from your account. It will need to be re-paired to rejoin."
        confirmLabel="Remove"
        confirmVariant="danger"
        onConfirm={handleConfirmRemove}
        onCancel={() => setRemovingDeviceId(null)}
      />
    </div>
  );
};
