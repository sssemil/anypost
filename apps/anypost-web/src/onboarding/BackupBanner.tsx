import { createSignal, Show } from "solid-js";

type BackupBannerProps = {
  readonly seedPhrase: string;
  readonly onBackupConfirmed: () => void;
};

export const BackupBanner = (props: BackupBannerProps) => {
  const [showSeedPhrase, setShowSeedPhrase] = createSignal(false);
  const [confirmed, setConfirmed] = createSignal(false);

  return (
    <div class="bg-tg-warning/15 border border-tg-warning/30 rounded-xl px-4 py-3 mb-4 font-sans">
      <div class="flex items-center justify-between">
        <strong class="text-tg-warning">
          Back up your account
        </strong>
        <button
          onClick={() => setShowSeedPhrase(!showSeedPhrase())}
          class="py-1.5 px-3 rounded-lg border border-tg-warning/50 text-tg-warning text-sm cursor-pointer hover:bg-tg-warning/10"
        >
          {showSeedPhrase() ? "Hide" : "Show Seed Phrase"}
        </button>
      </div>

      <p class="text-tg-warning/80 text-sm mb-2">
        Save your seed phrase to recover your account on another device. Without it, your identity is lost if this device fails.
      </p>

      <Show when={showSeedPhrase()}>
        <div class="bg-tg-chat border border-tg-border rounded-lg p-3 mb-3 font-mono text-sm text-tg-text break-words select-all">
          {props.seedPhrase}
        </div>

        <label class="flex items-center gap-2 mb-2 cursor-pointer text-tg-warning text-sm">
          <input
            type="checkbox"
            checked={confirmed()}
            onChange={(e) => setConfirmed(e.currentTarget.checked)}
            class="accent-tg-success"
          />
          I have saved my seed phrase in a safe place
        </label>

        <button
          onClick={props.onBackupConfirmed}
          disabled={!confirmed()}
          class="py-2 px-4 rounded-xl bg-tg-success text-white cursor-pointer disabled:opacity-40 hover:bg-tg-success/80"
        >
          Confirm Backup
        </button>
      </Show>
    </div>
  );
};
