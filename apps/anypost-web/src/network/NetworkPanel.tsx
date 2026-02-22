import { createSignal, For, Show } from "solid-js";
import type { NetworkStatus } from "anypost-core/protocol";
import { TopologyGraph } from "./TopologyGraph.js";

type NetworkPanelProps = {
  readonly networkStatus: NetworkStatus | null;
  readonly bootstrapAddrs: readonly string[];
  readonly displayName: string;
  readonly latencyMap: ReadonlyMap<string, number>;
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

const PEERS_PER_PAGE = 10;

export const NetworkPanel = (props: NetworkPanelProps) => {
  const [showPanel, setShowPanel] = createSignal(true);
  const [peerSearch, setPeerSearch] = createSignal("");
  const [peerPage, setPeerPage] = createSignal(0);

  return (
    <div style={{ ...panelStyle, "margin-bottom": "12px" }}>
      <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "8px" }}>
        <strong style={{ "font-size": "0.9em" }}>
          Network
          {props.networkStatus && (
            <span style={{ "font-weight": "normal", ...dimText, "margin-left": "8px" }}>
              {props.networkStatus.peers.length} peer{props.networkStatus.peers.length !== 1 ? "s" : ""}
              {" / "}
              {props.networkStatus.subscriberCount} subscriber{props.networkStatus.subscriberCount !== 1 ? "s" : ""}
            </span>
          )}
        </strong>
        <button
          onClick={() => setShowPanel(!showPanel())}
          style={{ background: "none", border: "none", cursor: "pointer", ...dimText }}
        >
          {showPanel() ? "hide" : "show"}
        </button>
      </div>

      <Show when={showPanel() && props.networkStatus}>
        {(status) => (
          <div style={{ ...mono }}>
            <div style={{ "margin-bottom": "10px", "padding-bottom": "10px", "border-bottom": "1px solid #e0e0e0" }}>
              <TopologyGraph
                networkStatus={status()}
                bootstrapAddrs={props.bootstrapAddrs}
                latencyMap={props.latencyMap}
              />
            </div>

            <div style={{ "margin-bottom": "10px", "padding-bottom": "10px", "border-bottom": "1px solid #e0e0e0" }}>
              <div style={{ "margin-bottom": "4px" }}>
                <span style={dimText}>PeerId </span>
                <code>{status().peerId}</code>
              </div>
              <div style={{ "margin-bottom": "4px" }}>
                <span style={dimText}>Topic </span>
                <code>{status().topic}</code>
              </div>
              {props.displayName && (
                <div>
                  <span style={dimText}>Name </span>
                  {props.displayName}
                </div>
              )}
              <Show when={status().multiaddrs.length > 0}>
                <details style={{ "margin-top": "4px" }}>
                  <summary style={{ cursor: "pointer", ...dimText }}>
                    My addresses ({status().multiaddrs.length})
                  </summary>
                  <For each={status().multiaddrs}>
                    {(addr) => (
                      <div style={{ "padding-left": "12px", "word-break": "break-all", "margin-top": "2px" }}>
                        {addr}
                      </div>
                    )}
                  </For>
                </details>
              </Show>
            </div>

            <details style={{ "margin-top": "4px" }}>
              <summary style={{ cursor: "pointer", ...dimText }}>
                Connected peers ({status().peers.length})
              </summary>
              <Show
                when={status().peers.length > 0}
                fallback={
                  <div style={{ ...dimText, "text-align": "center", padding: "8px" }}>
                    No peers connected. Waiting for connections...
                  </div>
                }
              >
                <div style={{ "margin-top": "6px", "margin-bottom": "6px" }}>
                  <input
                    type="text"
                    value={peerSearch()}
                    onInput={(e) => { setPeerSearch(e.currentTarget.value); setPeerPage(0); }}
                    placeholder="Search by peer ID or address..."
                    style={{ width: "100%", padding: "6px 8px", "border-radius": "4px", border: "1px solid #ddd", ...mono, "font-size": "0.85em", "box-sizing": "border-box" }}
                  />
                </div>
                {(() => {
                  const query = peerSearch().toLowerCase();
                  const filtered = query
                    ? status().peers.filter((p) =>
                        p.peerId.toLowerCase().includes(query) ||
                        p.addrs.some((a) => a.toLowerCase().includes(query))
                      )
                    : status().peers;
                  const totalPages = Math.max(1, Math.ceil(filtered.length / PEERS_PER_PAGE));
                  const page = Math.min(peerPage(), totalPages - 1);
                  const paged = filtered.slice(page * PEERS_PER_PAGE, (page + 1) * PEERS_PER_PAGE);
                  return (
                    <>
                      <For each={paged}>
                        {(peer) => (
                          <div style={{
                            padding: "8px",
                            "margin-bottom": "6px",
                            "background-color": "#fff",
                            "border-radius": "6px",
                            border: "1px solid #e8e8e8",
                          }}>
                            <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>
                              <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
                                <code style={{ "font-weight": "bold" }}>{peer.peerId.slice(0, 20)}...</code>
                                {(() => {
                                  const latency = props.latencyMap.get(peer.peerId);
                                  if (latency === undefined) return null;
                                  const bg = latency < 50 ? "#e8f5e9" : latency < 200 ? "#fff8e1" : "#fbe9e7";
                                  const fg = latency < 50 ? "#2e7d32" : latency < 200 ? "#f57f17" : "#c62828";
                                  return (
                                    <span style={{
                                      padding: "1px 6px",
                                      "border-radius": "8px",
                                      "font-size": "0.7em",
                                      "background-color": bg,
                                      color: fg,
                                    }}>
                                      {Math.round(latency)}ms
                                    </span>
                                  );
                                })()}
                              </div>
                              <span style={{
                                padding: "2px 8px",
                                "border-radius": "10px",
                                "font-size": "0.75em",
                                "background-color": peer.direction === "outbound" ? "#e3f2fd" : "#f3e5f5",
                                color: peer.direction === "outbound" ? "#1565c0" : "#7b1fa2",
                              }}>
                                {peer.direction}
                              </span>
                            </div>
                            <For each={peer.addrs}>
                              {(addr) => (
                                <div style={{ ...dimText, "word-break": "break-all", "margin-top": "4px" }}>
                                  {addr}
                                </div>
                              )}
                            </For>
                            <div style={{ ...dimText, "margin-top": "2px" }}>
                              muxer: {peer.protocol}
                            </div>
                          </div>
                        )}
                      </For>
                      <Show when={totalPages > 1}>
                        <div style={{ display: "flex", "justify-content": "center", "align-items": "center", gap: "8px", "margin-top": "8px" }}>
                          <button
                            onClick={() => setPeerPage(Math.max(0, page - 1))}
                            disabled={page === 0}
                            style={{ background: "none", border: "1px solid #ddd", "border-radius": "4px", padding: "2px 8px", cursor: page === 0 ? "default" : "pointer", ...dimText }}
                          >
                            prev
                          </button>
                          <span style={dimText}>
                            {page + 1} / {totalPages}
                            {query && ` (${filtered.length} match${filtered.length !== 1 ? "es" : ""})`}
                          </span>
                          <button
                            onClick={() => setPeerPage(Math.min(totalPages - 1, page + 1))}
                            disabled={page >= totalPages - 1}
                            style={{ background: "none", border: "1px solid #ddd", "border-radius": "4px", padding: "2px 8px", cursor: page >= totalPages - 1 ? "default" : "pointer", ...dimText }}
                          >
                            next
                          </button>
                        </div>
                      </Show>
                      <Show when={query && filtered.length === 0}>
                        <div style={{ ...dimText, "text-align": "center", padding: "8px" }}>
                          No peers matching "{peerSearch()}"
                        </div>
                      </Show>
                    </>
                  );
                })()}
              </Show>
            </details>
          </div>
        )}
      </Show>
    </div>
  );
};
