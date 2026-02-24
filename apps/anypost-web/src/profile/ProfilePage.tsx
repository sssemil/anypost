import { createEffect, createSignal, Show } from "solid-js";

type ProfilePageProps = {
  readonly peerId: string;
  readonly displayName: string;
  readonly onSaveDisplayName: (name: string) => Promise<string | null>;
};

export const ProfilePage = (props: ProfilePageProps) => {
  const [nameInput, setNameInput] = createSignal(props.displayName);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");
  const [saved, setSaved] = createSignal(false);

  createEffect(() => {
    setNameInput(props.displayName);
    setError("");
  });

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
      setError("Failed to save profile");
    }).finally(() => {
      setSaving(false);
    });
  };

  return (
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-semibold text-tg-text">Profile</h3>
      </div>

      <div class="rounded border border-tg-border bg-tg-hover px-3 py-3">
        <div class="text-xs text-tg-text-dim mb-2">Profile picture</div>
        <div class="w-16 h-16 rounded-full bg-tg-input border border-tg-border flex items-center justify-center text-tg-text-dim text-[10px]">
          future
        </div>
        <div class="text-[10px] text-tg-text-dim mt-2">Avatar upload coming soon</div>
      </div>

      <div class="rounded border border-tg-border bg-tg-hover px-3 py-3 space-y-2">
        <div class="text-xs text-tg-text-dim">Display name</div>
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
            {saving() ? "Saving..." : "Save name"}
          </button>
          <Show when={saved()}>
            <span class="text-xs text-tg-success">Saved</span>
          </Show>
        </div>
        <Show when={error()}>
          <div class="text-xs text-tg-danger">{error()}</div>
        </Show>
      </div>

      <div class="rounded border border-tg-border bg-tg-hover px-3 py-3">
        <div class="text-xs text-tg-text-dim mb-1">Peer ID</div>
        <code class="text-[11px] text-tg-text break-all">{props.peerId}</code>
      </div>
    </div>
  );
};
