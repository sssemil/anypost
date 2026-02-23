import { createSignal, For, Show } from "solid-js";
import type { NetworkStatus, RelayPoolState, GroupDiscoveryState } from "anypost-core/protocol";
import { TopologyGraph } from "./TopologyGraph.js";

type NetworkPanelProps = {
  readonly networkStatus: NetworkStatus | null;
  readonly relayPoolState: RelayPoolState | null;
  readonly groupDiscoveryState: GroupDiscoveryState | null;
  readonly displayName: string;
  readonly latencyMap: ReadonlyMap<string, number>;
  readonly onAddRelay?: (addr: string) => void;
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

const relayStatusDot = (status: string) => {
  const color = status === "healthy"
    ? "bg-tg-success"
    : status === "degraded"
      ? "bg-tg-warning"
      : status === "unhealthy"
        ? "bg-tg-danger"
        : "bg-tg-text-dim";
  return <span class={`inline-block w-2 h-2 rounded-full ${color}`} />;
};

export const NetworkPanel = (props: NetworkPanelProps) => {
  const [showPanel, setShowPanel] = createSignal(true);
  const [peerSearch, setPeerSearch] = createSignal("");
  const [peerPage, setPeerPage] = createSignal(0);
  const [manualRelay, setManualRelay] = createSignal("");

  const relayAddresses = () => {
    const pool = props.relayPoolState;
    if (!pool) return [];
    return pool.relays.map((r) => r.address);
  };

  const handleAddRelay = () => {
    const addr = manualRelay().trim();
    if (addr && props.onAddRelay) {
      props.onAddRelay(addr);
      setManualRelay("");
    }
  };

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
                bootstrapAddrs={relayAddresses()}
                latencyMap={props.latencyMap}
              />
            </div>

            <Show when={props.relayPoolState}>
              {(pool) => (
                <div class="mb-3 pb-3 border-b border-tg-border">
                  <div class="flex items-center gap-2 mb-1.5">
                    <span class="text-tg-text-dim">Relay Pool</span>
                    <span class="text-tg-text">
                      {pool().relays.length} relay{pool().relays.length !== 1 ? "s" : ""}
                    </span>
                    <Show when={pool().discoveryInProgress}>
                      <span class="text-tg-accent text-[10px]">discovering...</span>
                    </Show>
                  </div>
                  <For each={pool().relays}>
                    {(relay) => (
                      <div class="flex items-center gap-2 py-0.5">
                        {relayStatusDot(relay.status)}
                        <code class="text-tg-text break-all flex-1">{relay.address}</code>
                        <Show when={relay.latencyMs !== null}>
                          {latencyBadge(relay.latencyMs!)}
                        </Show>
                      </div>
                    )}
                  </For>
                  <Show when={props.onAddRelay}>
                    <div class="flex gap-2 mt-2">
                      <input
                        type="text"
                        value={manualRelay()}
                        onInput={(e) => setManualRelay(e.currentTarget.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddRelay(); }}
                        placeholder="/ip4/.../tcp/.../ws/p2p/12D3KooW..."
                        class="flex-1 px-2 py-1.5 rounded-lg bg-tg-sidebar border border-tg-border text-tg-text font-mono text-xs box-border placeholder:text-tg-text-dim"
                      />
                      <button
                        onClick={handleAddRelay}
                        disabled={!manualRelay().trim()}
                        class="px-3 py-1.5 rounded-lg bg-tg-accent text-white text-xs cursor-pointer disabled:opacity-40 hover:bg-tg-accent/80"
                      >
                        Add
                      </button>
                    </div>
                  </Show>
                </div>
              )}
            </Show>

            <Show when={props.groupDiscoveryState}>
              {(discovery) => (
                <Show when={discovery().groups.size > 0}>
                  <div class="mb-3 pb-3 border-b border-tg-border">
                    <div class="flex items-center gap-2 mb-1.5">
                      <span class="text-tg-text-dim">Group Discovery</span>
                      <span class="text-tg-text">
                        {discovery().groups.size} group{discovery().groups.size !== 1 ? "s" : ""}
                      </span>
                      <span class="text-tg-text-dim text-[10px]">
                        {[...discovery().groups.values()].reduce((sum, g) => sum + g.peers.length, 0)} peers found
                      </span>
                    </div>
                    <For each={[...discovery().groups.values()]}>
                      {(group) => (
                        <div class="p-2 mb-1.5 bg-tg-sidebar rounded-lg border border-tg-border">
                          <div class="flex items-center justify-between mb-1">
                            <code class="font-bold text-tg-text">{group.groupId.slice(0, 8)}...</code>
                            <div class="flex items-center gap-2">
                              <Show when={group.isAdvertising}>
                                <span class="px-1.5 rounded-full text-[10px] bg-tg-success/20 text-tg-success">
                                  advertising
                                </span>
                              </Show>
                              <Show
                                when={group.isSearching}
                                fallback={
                                  <span class="px-1.5 rounded-full text-[10px] bg-tg-text-dim/20 text-tg-text-dim">
                                    idle
                                  </span>
                                }
                              >
                                <span class="px-1.5 rounded-full text-[10px] bg-tg-accent/20 text-tg-accent">
                                  searching...
                                </span>
                              </Show>
                            </div>
                          </div>
                          <div class="text-tg-text-dim mb-1">
                            Searches: {group.searchCount}
                            <Show when={group.lastSearchAt !== null}>
                              {" "}(last: {Math.round((Date.now() - group.lastSearchAt!) / 1000)}s ago)
                            </Show>
                          </div>
                          <Show
                            when={group.peers.length > 0}
                            fallback={
                              <div class="text-tg-text-dim text-[10px]">No peers discovered yet</div>
                            }
                          >
                            <div class="text-tg-text-dim text-[10px] mb-0.5">
                              Peers ({group.peers.length}):
                            </div>
                            <For each={group.peers}>
                              {(peer) => (
                                <div class="pl-2 text-tg-text break-all text-[10px]">
                                  {peer.peerId.slice(0, 20)}...
                                  <Show when={peer.addrs.length > 0}>
                                    <span class="text-tg-text-dim ml-1">{peer.addrs[0]}</span>
                                  </Show>
                                </div>
                              )}
                            </For>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              )}
            </Show>

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
