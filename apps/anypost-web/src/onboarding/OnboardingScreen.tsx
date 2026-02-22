import { createSignal, Show } from "solid-js";

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
      props.onImportAccount(phrase);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    }
  };

  return (
    <div style={{ "max-width": "400px", margin: "80px auto", padding: "20px", "font-family": "system-ui", "text-align": "center" }}>
      <h1>Welcome to Anypost</h1>
      <p style={{ color: "#666", "margin-bottom": "32px" }}>
        Decentralized, encrypted messaging. No servers. No accounts.
      </p>

      <Show when={!showImport()} fallback={
        <div>
          <h2>Import Account</h2>
          <textarea
            value={seedPhrase()}
            onInput={(e) => {
              setSeedPhrase(e.currentTarget.value);
              setError("");
            }}
            placeholder="Enter your 24-word seed phrase..."
            rows={4}
            style={{ width: "100%", padding: "8px", "border-radius": "4px", border: "1px solid #ccc", "margin-bottom": "12px", "font-family": "monospace", resize: "vertical" }}
          />
          <Show when={error()}>
            <p style={{ color: "red", "margin-top": "0" }}>{error()}</p>
          </Show>
          <div style={{ display: "flex", gap: "8px", "justify-content": "center" }}>
            <button
              onClick={() => { setShowImport(false); setError(""); }}
              style={{ padding: "10px 20px", "border-radius": "4px", cursor: "pointer" }}
            >
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={!seedPhrase().trim()}
              style={{ padding: "10px 20px", "border-radius": "4px", cursor: "pointer", "background-color": "#4CAF50", color: "white", border: "none" }}
            >
              Import
            </button>
          </div>
        </div>
      }>
        <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
          <button
            onClick={props.onCreateAccount}
            style={{ padding: "12px 24px", "border-radius": "4px", cursor: "pointer", "background-color": "#2196F3", color: "white", border: "none", "font-size": "1.1em" }}
          >
            Create New Account
          </button>
          <button
            onClick={() => setShowImport(true)}
            style={{ padding: "12px 24px", "border-radius": "4px", cursor: "pointer", border: "1px solid #ccc", background: "white" }}
          >
            Import Existing Account
          </button>
        </div>
      </Show>
    </div>
  );
};
