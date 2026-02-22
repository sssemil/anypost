import { createSignal, Show } from "solid-js";
import { formatPeerIdForDisplay } from "anypost-core/protocol";
import {
  createPeerSharingState,
  setTargetPeerId,
  markCopied,
  clearCopied,
  transitionConnect,
  canConnect,
} from "./peer-sharing.js";

type PeerSharingPanelProps = {
  readonly ownPeerId: string;
  readonly onConnect: (targetPeerId: string) => Promise<void>;
};

const mono = { "font-family": "monospace", "font-size": "0.82em" } as const;
const dimText = { color: "#888", "font-size": "0.8em" } as const;
const panelStyle = {
  border: "1px solid #ddd",
  "border-radius": "8px",
  padding: "12px",
  "margin-bottom": "12px",
  "background-color": "#f9f9f9",
} as const;

export const PeerSharingPanel = (props: PeerSharingPanelProps) => {
  const [state, setState] = createSignal(createPeerSharingState(props.ownPeerId));

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.ownPeerId);
      setState(markCopied(state()));
      setTimeout(() => setState(clearCopied(state())), 2000);
    } catch {
      // Clipboard access may be denied
    }
  };

  const handleConnect = async () => {
    const current = state();
    if (!canConnect(current)) return;

    setState(transitionConnect(current, { type: "search-started" }));

    try {
      setState(transitionConnect(state(), { type: "peer-found" }));
      await props.onConnect(current.targetPeerId);
      setState(transitionConnect(state(), { type: "connected" }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      setState(transitionConnect(state(), { type: "failed", errorMessage: message }));
    }
  };

  const statusLabel = () => {
    switch (state().connectStatus) {
      case "idle": return "";
      case "searching": return "Searching...";
      case "connecting": return "Connecting...";
      case "connected": return "Connected!";
      case "failed": return state().errorMessage ?? "Failed";
    }
  };

  const statusColor = () => {
    switch (state().connectStatus) {
      case "connected": return "#4caf50";
      case "failed": return "#f44336";
      default: return "#ff9800";
    }
  };

  return (
    <div style={panelStyle}>
      <strong style={{ "font-size": "0.9em", display: "block", "margin-bottom": "8px" }}>
        Peer Sharing
      </strong>

      {/* Own Peer ID */}
      <div style={{ "margin-bottom": "10px" }}>
        <span style={dimText}>Your Peer ID </span>
        <code style={{ ...mono, "word-break": "break-all" }}>
          {formatPeerIdForDisplay(props.ownPeerId)}
        </code>
        <button
          onClick={() => void handleCopy()}
          style={{
            "margin-left": "8px",
            padding: "2px 8px",
            "border-radius": "4px",
            border: "1px solid #ccc",
            "background-color": state().copied ? "#e8f5e9" : "#fff",
            cursor: "pointer",
            "font-size": "0.8em",
          }}
        >
          {state().copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* Target Peer ID input */}
      <div style={{ "margin-bottom": "8px" }}>
        <label style={{ display: "block", "margin-bottom": "4px", ...dimText }}>
          Connect to Peer ID
        </label>
        <input
          type="text"
          value={state().targetPeerId}
          onInput={(e) => setState(setTargetPeerId(state(), e.currentTarget.value))}
          placeholder="12D3KooW..."
          style={{
            width: "100%",
            padding: "6px 8px",
            "border-radius": "4px",
            border: "1px solid #ccc",
            ...mono,
            "box-sizing": "border-box",
          }}
        />
      </div>

      {/* Connect button + status */}
      <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
        <button
          onClick={() => void handleConnect()}
          disabled={!canConnect(state())}
          style={{
            padding: "6px 14px",
            "border-radius": "4px",
            cursor: canConnect(state()) ? "pointer" : "default",
            "background-color": canConnect(state()) ? "#2196F3" : "#ccc",
            color: "white",
            border: "none",
            "font-size": "0.85em",
          }}
        >
          Find & Connect
        </button>
        <Show when={statusLabel()}>
          <span style={{ "font-size": "0.8em", color: statusColor() }}>
            {statusLabel()}
          </span>
        </Show>
      </div>
    </div>
  );
};
