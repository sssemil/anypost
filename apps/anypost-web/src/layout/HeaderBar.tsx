import { createSignal, Show } from "solid-js";

type HeaderBarProps = {
  readonly peerId: string;
  readonly connectionStatus: "connecting" | "connected" | "disconnected";
  readonly displayName: string;
};

const statusColor = (status: HeaderBarProps["connectionStatus"]): string => {
  switch (status) {
    case "connected": return "#4caf50";
    case "connecting": return "#ff9800";
    case "disconnected": return "#f44336";
  }
};

const statusLabel = (status: HeaderBarProps["connectionStatus"]): string => {
  switch (status) {
    case "connected": return "Connected";
    case "connecting": return "Connecting...";
    case "disconnected": return "Disconnected";
  }
};

export const HeaderBar = (props: HeaderBarProps) => {
  const [copied, setCopied] = createSignal(false);

  const copyPeerId = () => {
    navigator.clipboard.writeText(props.peerId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div style={{
      display: "flex",
      "align-items": "center",
      gap: "12px",
      padding: "12px 16px",
      "border-bottom": "1px solid #e0e0e0",
      "background-color": "#fafafa",
    }}>
      <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
        <div style={{
          width: "10px",
          height: "10px",
          "border-radius": "50%",
          "background-color": statusColor(props.connectionStatus),
        }} />
        <span style={{ "font-size": "0.8em", color: "#666" }}>
          {statusLabel(props.connectionStatus)}
        </span>
      </div>

      <Show when={props.displayName}>
        <span style={{ "font-weight": "bold" }}>{props.displayName}</span>
      </Show>

      <Show when={props.peerId}>
        <div style={{
          display: "flex",
          "align-items": "center",
          gap: "6px",
          "margin-left": "auto",
          "font-family": "monospace",
          "font-size": "0.78em",
          color: "#555",
        }}>
          <span>{props.peerId.slice(0, 16)}...</span>
          <button
            onClick={copyPeerId}
            style={{
              background: "none",
              border: "1px solid #ccc",
              "border-radius": "4px",
              padding: "2px 8px",
              cursor: "pointer",
              "font-size": "0.9em",
              color: "#555",
            }}
          >
            {copied() ? "Copied!" : "Copy"}
          </button>
        </div>
      </Show>
    </div>
  );
};
