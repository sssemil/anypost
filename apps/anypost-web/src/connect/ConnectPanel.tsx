type ConnectPanelProps = {
  readonly relayAddr: string;
  readonly onRelayAddrChange: (addr: string) => void;
  readonly onConnect: () => void;
  readonly disabled: boolean;
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

export const ConnectPanel = (props: ConnectPanelProps) => {
  return (
    <div style={panelStyle}>
      <label style={{ display: "block", "margin-bottom": "6px", "font-weight": "bold", "font-size": "0.9em" }}>
        Relay address
      </label>
      <input
        type="text"
        value={props.relayAddr}
        onInput={(e) => props.onRelayAddrChange(e.currentTarget.value)}
        placeholder="/ip4/127.0.0.1/tcp/9090/ws/p2p/12D3KooW..."
        style={{ width: "100%", padding: "8px", "border-radius": "4px", border: "1px solid #ccc", ...mono, "box-sizing": "border-box", "margin-bottom": "8px" }}
      />
      <p style={{ margin: "0 0 8px", ...dimText }}>
        Paste the <code>/ws/</code> multiaddr from the relay terminal.
      </p>
      <button
        onClick={props.onConnect}
        disabled={props.disabled}
        style={{ padding: "10px 20px", "border-radius": "4px", cursor: "pointer", "background-color": "#2196F3", color: "white", border: "none" }}
      >
        Connect
      </button>
    </div>
  );
};
