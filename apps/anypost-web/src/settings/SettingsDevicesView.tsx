import { createSignal, For, Show } from "solid-js";
import type { RegisteredDevice } from "anypost-core/data";
import { ConfirmDialog } from "../layout/ConfirmDialog.js";

type SettingsDevicesViewProps = {
  readonly peerId: string;
  readonly registeredDevices: readonly RegisteredDevice[];
  readonly onRemoveDevice: (devicePeerId: string) => void;
  readonly onBack: () => void;
};

const SUFFIX_LENGTH = 6;

const PeerIdCopyButton = (props: { readonly peerId: string }) => {
  const [copied, setCopied] = createSignal(false);

  const prefix = () => props.peerId.slice(0, -SUFFIX_LENGTH);
  const suffix = () => props.peerId.slice(-SUFFIX_LENGTH);

  const handleCopy = () => {
    navigator.clipboard.writeText(props.peerId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <button
      class="flex items-center gap-1.5 w-full text-left cursor-pointer group"
      onClick={handleCopy}
    >
      <span class="font-mono text-sm text-tg-text min-w-0 flex overflow-hidden">
        <span class="overflow-hidden text-ellipsis whitespace-nowrap shrink">{prefix()}</span>
        <span class="shrink-0">{suffix()}</span>
      </span>
      <span class="text-tg-accent text-[10px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {copied() ? "Copied!" : "Copy"}
      </span>
    </button>
  );
};

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
          <PeerIdCopyButton peerId={props.peerId} />
        </div>
      </div>

      <Show when={otherDevices().length > 0}>
        <div class="rounded-lg border border-tg-border bg-tg-hover overflow-hidden">
          <div class="px-3 py-2 text-[11px] text-tg-text-dim uppercase tracking-wide">Other devices</div>
          <For each={otherDevices()}>
            {(device) => (
              <div class="flex items-center justify-between px-3 py-2.5 border-t border-tg-border/50">
                <div class="min-w-0 flex-1">
                  <PeerIdCopyButton peerId={device.devicePeerId} />
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
