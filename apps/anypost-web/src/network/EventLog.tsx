import { createSignal, For, Show, onCleanup } from "solid-js";
import type { NetworkEvent } from "anypost-core/protocol";

type EventLogProps = {
  readonly events: readonly NetworkEvent[];
  readonly onClear: () => void;
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

const eventColor = (type: NetworkEvent["type"]): string => {
  switch (type) {
    case "peer-connect": return "#4caf50";
    case "peer-disconnect": return "#f44336";
    case "dial-attempt": return "#ff9800";
    case "dial-success": return "#4caf50";
    case "dial-failure": return "#f44336";
    case "subscription-change": return "#9c27b0";
    case "pubsub-message": return "#2196f3";
    case "relay-reservation": return "#00bcd4";
    case "address-change": return "#607d8b";
    case "gossipsub-mesh": return "#795548";
    case "info": return "#888";
    default: return "#e0e0e0";
  }
};

export const EventLog = (props: EventLogProps) => {
  const [showLog, setShowLog] = createSignal(true);

  return (
    <div style={{ ...panelStyle, "margin-bottom": "12px" }}>
      <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "4px" }}>
        <strong style={{ "font-size": "0.9em" }}>
          Events
          <span style={{ "font-weight": "normal", ...dimText, "margin-left": "8px" }}>
            {props.events.length} entries
          </span>
        </strong>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={props.onClear}
            style={{ background: "none", border: "none", cursor: "pointer", ...dimText }}
          >
            clear
          </button>
          <button
            onClick={() => setShowLog(!showLog())}
            style={{ background: "none", border: "none", cursor: "pointer", ...dimText }}
          >
            {showLog() ? "hide" : "show"}
          </button>
        </div>
      </div>
      <Show when={showLog()}>
        <div
          ref={(el) => {
            const observer = new MutationObserver(() => {
              el.scrollTop = el.scrollHeight;
            });
            observer.observe(el, { childList: true });
            onCleanup(() => observer.disconnect());
          }}
          style={{
            ...mono,
            height: "180px",
            "overflow-y": "auto",
            "background-color": "#1a1a2e",
            color: "#e0e0e0",
            "border-radius": "4px",
            padding: "8px",
            "font-size": "0.75em",
            "line-height": "1.5",
          }}
        >
          <For each={props.events}>
            {(evt) => (
              <div style={{ "white-space": "pre-wrap", "word-break": "break-all" }}>
                <span style={{ color: "#666" }}>
                  {new Date(evt.timestamp).toLocaleTimeString()}{" "}
                </span>
                <span style={{
                  color: "#1a1a2e",
                  "background-color": eventColor(evt.type),
                  padding: "0 4px",
                  "border-radius": "2px",
                  "font-size": "0.9em",
                }}>
                  {evt.type}
                </span>{" "}
                <span>{evt.detail}</span>
              </div>
            )}
          </For>
          <Show when={props.events.length === 0}>
            <div style={{ color: "#666", "text-align": "center", padding: "20px 0" }}>
              Waiting for events...
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
