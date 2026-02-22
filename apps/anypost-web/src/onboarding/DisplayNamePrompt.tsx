import { createSignal, Show } from "solid-js";

type DisplayNamePromptProps = {
  readonly onSubmit: (displayName: string) => void;
};

export const DisplayNamePrompt = (props: DisplayNamePromptProps) => {
  const [name, setName] = createSignal("");
  const [error, setError] = createSignal("");

  const handleSubmit = () => {
    const trimmed = name().trim();
    if (!trimmed) {
      setError("Display name is required");
      return;
    }
    if (trimmed.length > 100) {
      setError("Display name must be 100 characters or less");
      return;
    }
    props.onSubmit(trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div style={{ "max-width": "400px", margin: "80px auto", padding: "20px", "font-family": "system-ui", "text-align": "center" }}>
      <h1>Choose a Display Name</h1>
      <p style={{ color: "#666", "margin-bottom": "24px" }}>
        This is how others will see you. You can change it later.
      </p>

      <input
        type="text"
        value={name()}
        onInput={(e) => {
          setName(e.currentTarget.value);
          setError("");
        }}
        onKeyDown={handleKeyDown}
        placeholder="Enter your display name..."
        maxLength={100}
        style={{ width: "100%", padding: "10px", "border-radius": "4px", border: "1px solid #ccc", "margin-bottom": "12px", "font-size": "1.1em", "box-sizing": "border-box" }}
      />

      <Show when={error()}>
        <p style={{ color: "red", "margin-top": "0" }}>{error()}</p>
      </Show>

      <button
        onClick={handleSubmit}
        disabled={!name().trim()}
        style={{ padding: "12px 24px", "border-radius": "4px", cursor: "pointer", "background-color": "#2196F3", color: "white", border: "none", "font-size": "1.1em", width: "100%" }}
      >
        Continue
      </button>
    </div>
  );
};
