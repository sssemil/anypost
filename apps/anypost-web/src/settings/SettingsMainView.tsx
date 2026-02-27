import { createEffect, createSignal, For, Show } from "solid-js";
import type { NotificationPreferenceKey, NotificationPreferences } from "anypost-core/data";

type SettingsMainViewProps = {
  readonly accountId: string;
  readonly displayName: string;
  readonly isBackedUp: boolean;
  readonly notificationPreferences: NotificationPreferences;
  readonly deviceCount: number;
  readonly onSaveDisplayName: (name: string) => Promise<string | null>;
  readonly onNotificationPreferenceChange: (key: NotificationPreferenceKey, value: boolean) => void;
  readonly onDevicesOpen: () => void;
};

const NOTIFICATION_TOGGLES: readonly {
  readonly key: NotificationPreferenceKey;
  readonly label: string;
}[] = [
  { key: "messages", label: "Messages" },
  { key: "mentions", label: "Mentions" },
  { key: "sounds", label: "Sounds" },
];

const truncateAccountId = (id: string): string =>
  id.length > 16 ? `${id.slice(0, 8)}...${id.slice(-8)}` : id;

export const SettingsMainView = (props: SettingsMainViewProps) => {
  const [nameInput, setNameInput] = createSignal(props.displayName);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");
  const [saved, setSaved] = createSignal(false);
  const [copiedId, setCopiedId] = createSignal(false);

  createEffect(() => {
    setNameInput(props.displayName);
    setError("");
  });

  const initials = () => {
    const name = props.displayName.trim();
    if (name.length === 0) return "?";
    const parts = name.split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const handleSave = () => {
    const trimmed = nameInput().trim();
    if (trimmed.length === 0) {
      setError("Name cannot be empty");
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    props.onSaveDisplayName(trimmed).then((result) => {
      if (result) {
        setError(result);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    }).catch(() => {
      setError("Failed to save");
    }).finally(() => {
      setSaving(false);
    });
  };

  const copyAccountId = () => {
    navigator.clipboard.writeText(props.accountId).then(() => {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }).catch(() => {});
  };

  return (
    <div class="space-y-4">
      <div class="flex items-center gap-4 px-1 py-2">
        <div class="w-16 h-16 rounded-full bg-tg-accent/20 border border-tg-accent/40 flex items-center justify-center text-tg-accent text-xl font-semibold shrink-0">
          {initials()}
        </div>
        <div class="flex-1 min-w-0 space-y-1">
          <div class="font-semibold text-tg-text text-[15px] truncate">{props.displayName}</div>
          <button
            class="flex items-center gap-1.5 text-xs text-tg-text-dim hover:text-tg-text cursor-pointer"
            onClick={copyAccountId}
          >
            <span class="font-mono truncate">{truncateAccountId(props.accountId)}</span>
            <span class="text-tg-accent text-[10px] shrink-0">{copiedId() ? "Copied!" : "Copy"}</span>
          </button>
        </div>
      </div>

      <div class="rounded-lg border border-tg-border bg-tg-hover overflow-hidden">
        <div class="px-3 py-2 text-[11px] text-tg-text-dim uppercase tracking-wide">Display name</div>
        <div class="px-3 pb-3 space-y-2">
          <input
            type="text"
            value={nameInput()}
            onInput={(e) => {
              setNameInput(e.currentTarget.value);
              setError("");
            }}
            placeholder="Your name"
            class="w-full px-2.5 py-2 rounded-lg bg-tg-input border border-tg-border text-tg-text text-sm box-border placeholder:text-tg-text-dim"
          />
          <div class="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving()}
              class="px-3 py-1.5 rounded-lg bg-tg-accent text-white text-xs cursor-pointer disabled:opacity-40 hover:bg-tg-accent/80"
            >
              {saving() ? "Saving..." : "Save"}
            </button>
            <Show when={saved()}>
              <span class="text-xs text-tg-success">Saved</span>
            </Show>
          </div>
          <Show when={error()}>
            <div class="text-xs text-tg-danger">{error()}</div>
          </Show>
        </div>
      </div>

      <div class="rounded-lg border border-tg-border bg-tg-hover overflow-hidden">
        <div class="px-3 py-2 text-[11px] text-tg-text-dim uppercase tracking-wide">Account</div>
        <div class="flex items-center justify-between px-3 py-2.5">
          <span class="text-sm text-tg-text">Seed phrase backup</span>
          <span
            class="text-xs px-2 py-0.5 rounded-full"
            classList={{
              "bg-tg-success/20 text-tg-success": props.isBackedUp,
              "bg-amber-500/20 text-amber-400": !props.isBackedUp,
            }}
          >
            {props.isBackedUp ? "Backed up" : "Not backed up"}
          </span>
        </div>
      </div>

      <div class="rounded-lg border border-tg-border bg-tg-hover overflow-hidden">
        <div class="px-3 py-2 text-[11px] text-tg-text-dim uppercase tracking-wide">Notifications</div>
        <For each={NOTIFICATION_TOGGLES}>
          {(toggle) => (
            <div class="flex items-center justify-between px-3 py-2.5 border-t border-tg-border/50">
              <span class="text-sm text-tg-text">{toggle.label}</span>
              <button
                class="relative w-11 h-6 rounded-full cursor-pointer transition-colors shrink-0"
                classList={{
                  "bg-tg-accent": props.notificationPreferences[toggle.key],
                  "bg-tg-border": !props.notificationPreferences[toggle.key],
                }}
                onClick={() => props.onNotificationPreferenceChange(toggle.key, !props.notificationPreferences[toggle.key])}
              >
                <span
                  class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                  classList={{
                    "translate-x-5": props.notificationPreferences[toggle.key],
                  }}
                />
              </button>
            </div>
          )}
        </For>
      </div>

      <div class="rounded-lg border border-tg-border bg-tg-hover overflow-hidden">
        <button
          class="w-full flex items-center justify-between px-3 py-2.5 text-sm text-tg-text hover:bg-tg-sidebar cursor-pointer"
          onClick={() => props.onDevicesOpen()}
        >
          <span>Devices</span>
          <span class="flex items-center gap-1 text-tg-text-dim">
            <span class="text-xs">{props.deviceCount}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
};
