import { createSignal, Show } from "solid-js";

type BackupBannerProps = {
  readonly seedPhrase: string;
  readonly onBackupConfirmed: () => void;
};

export const BackupBanner = (props: BackupBannerProps) => {
  const [showSeedPhrase, setShowSeedPhrase] = createSignal(false);
  const [confirmed, setConfirmed] = createSignal(false);

  const handleConfirmBackup = () => {
    props.onBackupConfirmed();
  };

  return (
    <div style={{
      background: "#FFF3CD",
      border: "1px solid #FFECB5",
      "border-radius": "8px",
      padding: "12px 16px",
      "margin-bottom": "16px",
      "font-family": "system-ui",
    }}>
      <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between" }}>
        <strong style={{ color: "#856404" }}>
          Back up your account
        </strong>
        <button
          onClick={() => setShowSeedPhrase(!showSeedPhrase())}
          style={{ padding: "6px 12px", "border-radius": "4px", cursor: "pointer", border: "1px solid #856404", background: "transparent", color: "#856404" }}
        >
          {showSeedPhrase() ? "Hide" : "Show Seed Phrase"}
        </button>
      </div>

      <p style={{ color: "#856404", "font-size": "0.9em", "margin-bottom": "8px" }}>
        Save your seed phrase to recover your account on another device. Without it, your identity is lost if this device fails.
      </p>

      <Show when={showSeedPhrase()}>
        <div style={{
          background: "white",
          border: "1px solid #ddd",
          "border-radius": "4px",
          padding: "12px",
          "margin-bottom": "12px",
          "font-family": "monospace",
          "word-break": "break-word",
          "user-select": "all",
        }}>
          {props.seedPhrase}
        </div>

        <label style={{ display: "flex", "align-items": "center", gap: "8px", "margin-bottom": "8px", cursor: "pointer", color: "#856404" }}>
          <input
            type="checkbox"
            checked={confirmed()}
            onChange={(e) => setConfirmed(e.currentTarget.checked)}
          />
          I have saved my seed phrase in a safe place
        </label>

        <button
          onClick={handleConfirmBackup}
          disabled={!confirmed()}
          style={{
            padding: "8px 16px",
            "border-radius": "4px",
            cursor: confirmed() ? "pointer" : "default",
            "background-color": confirmed() ? "#28A745" : "#ccc",
            color: "white",
            border: "none",
          }}
        >
          Confirm Backup
        </button>
      </Show>
    </div>
  );
};
