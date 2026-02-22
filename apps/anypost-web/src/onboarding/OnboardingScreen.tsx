import { createSignal, Show } from "solid-js";
import { importAccountKey } from "anypost-core/crypto";

type OnboardingScreenProps = {
  readonly onCreateAccount: () => void;
  readonly onImportAccount: (seedPhrase: string) => void;
};

export const OnboardingScreen = (props: OnboardingScreenProps) => {
  const [showImport, setShowImport] = createSignal(false);
  const [seedPhrase, setSeedPhrase] = createSignal("");
  const [error, setError] = createSignal("");

  const handleImport = () => {
    const phrase = seedPhrase().trim();
    if (!phrase) {
      setError("Please enter a seed phrase");
      return;
    }
    try {
      importAccountKey(phrase);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid seed phrase");
      return;
    }
    props.onImportAccount(phrase);
  };

  return (
    <div class="max-w-md mx-auto mt-20 px-5 font-sans text-center">
      <h1 class="text-2xl font-bold text-tg-text mb-2">Welcome to Anypost</h1>
      <p class="text-tg-text-dim mb-8">
        Decentralized, encrypted messaging. No servers. No accounts.
      </p>

      <Show when={!showImport()} fallback={
        <div>
          <h2 class="text-lg font-semibold text-tg-text mb-4">Import Account</h2>
          <textarea
            value={seedPhrase()}
            onInput={(e) => {
              setSeedPhrase(e.currentTarget.value);
              setError("");
            }}
            placeholder="Enter your 24-word seed phrase..."
            rows={4}
            class="w-full p-3 rounded-xl bg-tg-chat border border-tg-border text-tg-text font-mono text-sm mb-3 resize-y placeholder:text-tg-text-dim"
          />
          <Show when={error()}>
            <p class="text-tg-danger text-sm mt-0 mb-3">{error()}</p>
          </Show>
          <div class="flex gap-2 justify-center">
            <button
              onClick={() => { setShowImport(false); setError(""); }}
              class="py-2.5 px-5 rounded-xl border border-tg-border text-tg-text cursor-pointer hover:bg-tg-hover"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={!seedPhrase().trim()}
              class="py-2.5 px-5 rounded-xl bg-tg-success text-white cursor-pointer disabled:opacity-40 hover:bg-tg-success/80"
            >
              Import
            </button>
          </div>
        </div>
      }>
        <div class="flex flex-col gap-3">
          <button
            onClick={props.onCreateAccount}
            class="py-3 px-6 rounded-xl bg-tg-accent text-white text-lg cursor-pointer hover:bg-tg-accent/80"
          >
            Create New Account
          </button>
          <button
            onClick={() => setShowImport(true)}
            class="py-3 px-6 rounded-xl border border-tg-border text-tg-text cursor-pointer hover:bg-tg-hover"
          >
            Import Existing Account
          </button>
        </div>
      </Show>
    </div>
  );
};
