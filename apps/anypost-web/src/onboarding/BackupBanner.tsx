import { createSignal, Show } from "solid-js";

type BackupBannerProps = {
  readonly seedPhrase: string;
  readonly onBackupConfirmed: () => void;
};

export const BackupBanner = (props: BackupBannerProps) => {
  const [showSeedPhrase, setShowSeedPhrase] = createSignal(false);
  const [confirmed, setConfirmed] = createSignal(false);

  return (
    <div class="bg-tg-warning/15 border-b border-tg-warning/30 px-3 py-2.5">
      <div class="flex items-center justify-between mb-1">
        <strong class="text-tg-warning text-xs">Back up your account</strong>
        <button
          onClick={() => setShowSeedPhrase(!showSeedPhrase())}
          class="text-[10px] text-tg-warning/80 hover:text-tg-warning cursor-pointer underline"
        >
          {showSeedPhrase() ? "Hide" : "Show"}
        </button>
      </div>

      <p class="text-tg-warning/70 text-[11px] leading-tight">
        Save your seed phrase or lose access if this device fails.
      </p>

      <Show when={showSeedPhrase()}>
        <div class="bg-tg-chat border border-tg-border rounded-lg p-2 mt-2 mb-2 font-mono text-[11px] text-tg-text break-words select-all leading-relaxed">
          {props.seedPhrase}
        </div>

        <label class="flex items-center gap-1.5 mb-2 cursor-pointer text-tg-warning text-[11px]">
          <input
            type="checkbox"
            checked={confirmed()}
            onChange={(e) => setConfirmed(e.currentTarget.checked)}
            class="accent-tg-success"
          />
          I've saved my seed phrase
        </label>

        <button
          onClick={props.onBackupConfirmed}
          disabled={!confirmed()}
          class="w-full py-1.5 rounded-lg bg-tg-success text-white text-xs cursor-pointer disabled:opacity-40 hover:bg-tg-success/80"
        >
          Confirm Backup
        </button>
      </Show>
    </div>
  );
};
