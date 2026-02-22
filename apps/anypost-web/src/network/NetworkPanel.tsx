import { createSignal, For, Show } from "solid-js";
import type { NetworkStatus } from "anypost-core/protocol";
import { TopologyGraph } from "./TopologyGraph.js";

type NetworkPanelProps = {
  readonly networkStatus: NetworkStatus | null;
  readonly bootstrapAddrs: readonly string[];
  readonly displayName: string;
  readonly latencyMap: ReadonlyMap<string, number>;
};

const PEERS_PER_PAGE = 10;

const latencyBadge = (ms: number) => {
  const classes = ms < 50
    ? "bg-tg-success/20 text-tg-success"
    : ms < 200
      ? "bg-tg-warning/20 text-tg-warning"
      : "bg-tg-danger/20 text-tg-danger";
  return (
    <span class={`px-1.5 rounded-full text-[10px] ${classes}`}>
      {Math.round(ms)}ms
    </span>
  );
};

export const NetworkPanel = (props: NetworkPanelProps) => {
  const [showPanel, setShowPanel] = createSignal(true);
  const [peerSearch, setPeerSearch] = createSignal("");
  const [peerPage, setPeerPage] = createSignal(0);

  return (
    <div class="rounded-xl border border-tg-border bg-tg-chat p-4 mb-4">
      <div class="flex justify-between items-center mb-2">
        <strong class="text-sm text-tg-text">
          Network
          {props.networkStatus && (
            <span class="font-normal text-xs text-tg-text-dim ml-2">
              {props.networkStatus.peers.length} peer{props.networkStatus.peers.length !== 1 ? "s" : ""}
              {" / "}
              {props.networkStatus.subscriberCount} subscriber{props.networkStatus.subscriberCount !== 1 ? "s" : ""}
            </span>
          )}
        </strong>
        <button
          onClick={() => setShowPanel(!showPanel())}
          class="text-xs text-tg-text-dim hover:text-tg-text cursor-pointer"
        >
          {showPanel() ? "hide" : "show"}
        </button>
      </div>

      <Show when={showPanel() && props.networkStatus}>
        {(status) => (
          <div class="font-mono text-xs">
            <div class="mb-3 pb-3 border-b border-tg-border">
              <TopologyGraph
                networkStatus={status()}
                bootstrapAddrs={props.bootstrapAddrs}
                latencyMap={props.latencyMap}
              />
            </div>

            <div class="mb-3 pb-3 border-b border-tg-border">
              <div class="mb-1">
                <span class="text-tg-text-dim">PeerId </span>
                <code class="text-tg-text">{status().peerId}</code>
              </div>
              <div class="mb-1">
                <span class="text-tg-text-dim">Topic </span>
                <code class="text-tg-text">{status().topic}</code>
              </div>
              {props.displayName && (
                <div>
                  <span class="text-tg-text-dim">Name </span>
                  <span class="text-tg-text">{props.displayName}</span>
                </div>
              )}
              <Show when={status().multiaddrs.length > 0}>
                <details class="mt-1">
                  <summary class="cursor-pointer text-tg-text-dim">
                    My addresses ({status().multiaddrs.length})
                  </summary>
                  <For each={status().multiaddrs}>
                    {(addr) => (
                      <div class="pl-3 break-all mt-0.5 text-tg-text">
                        {addr}
                      </div>
                    )}
                  </For>
                </details>
              </Show>
            </div>

            <details class="mt-1">
              <summary class="cursor-pointer text-tg-text-dim">
                Connected peers ({status().peers.length})
              </summary>
              <Show
                when={status().peers.length > 0}
                fallback={
                  <div class="text-tg-text-dim text-center py-2">
                    No peers connected. Waiting for connections...
                  </div>
                }
              >
                <div class="my-1.5">
                  <input
                    type="text"
                    value={peerSearch()}
                    onInput={(e) => { setPeerSearch(e.currentTarget.value); setPeerPage(0); }}
                    placeholder="Search by peer ID or address..."
                    class="w-full px-2 py-1.5 rounded-lg bg-tg-sidebar border border-tg-border text-tg-text font-mono text-xs box-border placeholder:text-tg-text-dim"
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
                          <div class="p-2 mb-1.5 bg-tg-sidebar rounded-lg border border-tg-border">
                            <div class="flex justify-between items-center">
                              <div class="flex items-center gap-1.5">
                                <code class="font-bold text-tg-text">{peer.peerId.slice(0, 20)}...</code>
                                {(() => {
                                  const latency = props.latencyMap.get(peer.peerId);
                                  if (latency === undefined) return null;
                                  return latencyBadge(latency);
                                })()}
                              </div>
                              <span class={`px-2 py-0.5 rounded-full text-[10px] ${
                                peer.direction === "outbound"
                                  ? "bg-tg-accent/20 text-tg-accent"
                                  : "bg-purple-500/20 text-purple-400"
                              }`}>
                                {peer.direction}
                              </span>
                            </div>
                            <For each={peer.addrs}>
                              {(addr) => (
                                <div class="text-tg-text-dim break-all mt-1">
                                  {addr}
                                </div>
                              )}
                            </For>
                            <div class="text-tg-text-dim mt-0.5">
                              muxer: {peer.protocol}
                            </div>
                          </div>
                        )}
                      </For>
                      <Show when={totalPages > 1}>
                        <div class="flex justify-center items-center gap-2 mt-2">
                          <button
                            onClick={() => setPeerPage(Math.max(0, page - 1))}
                            disabled={page === 0}
                            class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                          >
                            prev
                          </button>
                          <span class="text-tg-text-dim text-xs">
                            {page + 1} / {totalPages}
                            {query && ` (${filtered.length} match${filtered.length !== 1 ? "es" : ""})`}
                          </span>
                          <button
                            onClick={() => setPeerPage(Math.min(totalPages - 1, page + 1))}
                            disabled={page >= totalPages - 1}
                            class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                          >
                            next
                          </button>
                        </div>
                      </Show>
                      <Show when={query && filtered.length === 0}>
                        <div class="text-tg-text-dim text-center py-2">
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
