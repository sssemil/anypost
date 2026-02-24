import { createSignal, For, Show } from "solid-js";
import type { ContactsBook } from "anypost-core/data";
import type {
  NetworkStatus,
  RelayPoolState,
  GroupDiscoveryState,
  RelayCandidateState,
  ConnectionMetrics,
  RelayReservationState,
} from "anypost-core/protocol";
import { getCandidatesByRtt, getReservedCount } from "anypost-core/protocol";
import { TopologyGraph } from "./TopologyGraph.js";

type NetworkPanelProps = {
  readonly networkStatus: NetworkStatus | null;
  readonly relayPoolState: RelayPoolState | null;
  readonly groupDiscoveryState: GroupDiscoveryState | null;
  readonly relayCandidateState: RelayCandidateState | null;
  readonly relayReservationState: RelayReservationState | null;
  readonly connectionMetrics: ConnectionMetrics | null;
  readonly displayName: string;
  readonly latencyMap: ReadonlyMap<string, number>;
  readonly contactsBook: ContactsBook;
  readonly pinnedPeerIds: readonly string[];
  readonly onAddRelay?: (addr: string) => void;
};

const PEERS_PER_PAGE = 10;
const CONTACTS_PER_PAGE = 10;
const RELAYS_PER_PAGE = 8;
const RELAY_CANDIDATES_PER_PAGE = 12;
const RESERVATIONS_PER_PAGE = 12;
const GROUP_DISCOVERY_GROUPS_PER_PAGE = 6;
const GROUP_DISCOVERY_PEERS_PER_PAGE = 8;
const ADDRESSES_PER_PAGE = 8;
const PINNED_PEERS_PER_PAGE = 10;

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

const reservationDot = (hasReservation: boolean) => {
  const color = hasReservation ? "bg-tg-success" : "bg-tg-text-dim";
  return <span class={`inline-block w-2 h-2 rounded-full ${color}`} />;
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

const ratio = (num: number, den: number): string =>
  den <= 0 ? "0%" : `${Math.round((num / den) * 100)}%`;

const formatMs = (ms: number | null): string =>
  ms === null ? "--" : `${Math.round(ms)}ms`;

const formatLastSeen = (timestamp: number, now = Date.now()): string => {
  const deltaMs = Math.max(0, now - timestamp);
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export const NetworkPanel = (props: NetworkPanelProps) => {
  const [showPanel, setShowPanel] = createSignal(true);
  const [relayPoolPage, setRelayPoolPage] = createSignal(0);
  const [relayCandidatePage, setRelayCandidatePage] = createSignal(0);
  const [reservationPage, setReservationPage] = createSignal(0);
  const [groupDiscoveryPage, setGroupDiscoveryPage] = createSignal(0);
  const [groupPeerPages, setGroupPeerPages] = createSignal<ReadonlyMap<string, number>>(new Map());
  const [addressesPage, setAddressesPage] = createSignal(0);
  const [pinnedPeerPage, setPinnedPeerPage] = createSignal(0);
  const [peerSearch, setPeerSearch] = createSignal("");
  const [peerPage, setPeerPage] = createSignal(0);
  const [contactsSearch, setContactsSearch] = createSignal("");
  const [contactsPage, setContactsPage] = createSignal(0);
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

  const getGroupPeerPage = (groupId: string): number => groupPeerPages().get(groupId) ?? 0;
  const setGroupPeerPage = (groupId: string, page: number) => {
    setGroupPeerPages((prev) => {
      const next = new Map(prev);
      next.set(groupId, page);
      return next;
    });
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
                  {(() => {
                    const relays = pool().relays;
                    const totalPages = Math.max(1, Math.ceil(relays.length / RELAYS_PER_PAGE));
                    const page = Math.min(relayPoolPage(), totalPages - 1);
                    const paged = relays.slice(page * RELAYS_PER_PAGE, (page + 1) * RELAYS_PER_PAGE);
                    return (
                      <>
                        <For each={paged}>
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
                        <Show when={totalPages > 1}>
                          <div class="flex justify-center items-center gap-2 mt-2">
                            <button
                              onClick={() => setRelayPoolPage(Math.max(0, page - 1))}
                              disabled={page === 0}
                              class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                            >
                              prev
                            </button>
                            <span class="text-tg-text-dim text-xs">{page + 1} / {totalPages}</span>
                            <button
                              onClick={() => setRelayPoolPage(Math.min(totalPages - 1, page + 1))}
                              disabled={page >= totalPages - 1}
                              class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                            >
                              next
                            </button>
                          </div>
                        </Show>
                      </>
                    );
                  })()}
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

            <Show when={props.relayCandidateState}>
              {(candidateState) => (
                <Show when={candidateState().candidates.size > 0}>
                  <div class="mb-3 pb-3 border-b border-tg-border">
                    <div class="flex items-center gap-2 mb-1.5">
                      <span class="text-tg-text-dim">Relay Candidates</span>
                      <span class="text-tg-text">
                        {getReservedCount(candidateState())} reserved / {candidateState().candidates.size} candidate{candidateState().candidates.size !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {(() => {
                      const candidates = getCandidatesByRtt(candidateState()) as readonly {
                        readonly peerId: string;
                        readonly addresses: readonly string[];
                        readonly rttMs: number | null;
                        readonly hasReservation: boolean;
                      }[];
                      const totalPages = Math.max(1, Math.ceil(candidates.length / RELAY_CANDIDATES_PER_PAGE));
                      const page = Math.min(relayCandidatePage(), totalPages - 1);
                      const paged = candidates.slice(
                        page * RELAY_CANDIDATES_PER_PAGE,
                        (page + 1) * RELAY_CANDIDATES_PER_PAGE,
                      );
                      return (
                        <>
                          <For each={paged}>
                            {(candidate) => (
                              <div class="flex items-center gap-2 py-0.5">
                                {reservationDot(candidate.hasReservation)}
                                <code class="text-tg-text flex-1">{candidate.peerId.slice(0, 20)}...</code>
                                <Show when={candidate.rttMs !== null}>
                                  {latencyBadge(candidate.rttMs!)}
                                </Show>
                              </div>
                            )}
                          </For>
                          <Show when={totalPages > 1}>
                            <div class="flex justify-center items-center gap-2 mt-2">
                              <button
                                onClick={() => setRelayCandidatePage(Math.max(0, page - 1))}
                                disabled={page === 0}
                                class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                              >
                                prev
                              </button>
                              <span class="text-tg-text-dim text-xs">{page + 1} / {totalPages}</span>
                              <button
                                onClick={() => setRelayCandidatePage(Math.min(totalPages - 1, page + 1))}
                                disabled={page >= totalPages - 1}
                                class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                              >
                                next
                              </button>
                            </div>
                          </Show>
                        </>
                      );
                    })()}
                  </div>
                </Show>
              )}
            </Show>

            <Show when={props.connectionMetrics}>
              {(metrics) => (
                <div class="mb-3 pb-3 border-b border-tg-border">
                  <div class="flex items-center gap-2 mb-1.5">
                    <span class="text-tg-text-dim">Connection Metrics</span>
                  </div>
                  <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-tg-text">
                    <span class="text-tg-text-dim">TTFP</span>
                    <span>{formatMs(metrics().timeToFirstPeerMs)}</span>
                    <span class="text-tg-text-dim">Reservation success</span>
                    <span>{ratio(metrics().reservationSuccesses, metrics().reservationAttempts)}</span>
                    <span class="text-tg-text-dim">Renew success</span>
                    <span>{ratio(metrics().renewSuccesses, metrics().renewAttempts)}</span>
                    <span class="text-tg-text-dim">Direct-upgrade success</span>
                    <span>{ratio(metrics().directUpgradeSuccesses, metrics().directUpgradeAttempts)}</span>
                    <span class="text-tg-text-dim">Sync requests sent</span>
                    <span>{metrics().syncRequestsSent}</span>
                    <span class="text-tg-text-dim">Sync accepted</span>
                    <span>{metrics().syncResponsesAccepted}</span>
                    <span class="text-tg-text-dim">Sync rejected</span>
                    <span>{metrics().syncResponsesRejected}</span>
                    <span class="text-tg-text-dim">Active reservations</span>
                    <span>{metrics().activeReservations}</span>
                    <span class="text-tg-text-dim">Rotations</span>
                    <span>{metrics().rotationCount}</span>
                  </div>
                </div>
              )}
            </Show>

            <Show when={props.relayReservationState}>
              {(reservationState) => (
                <Show when={reservationState().entries.size > 0}>
                  <div class="mb-3 pb-3 border-b border-tg-border">
                    <div class="flex items-center gap-2 mb-1.5">
                      <span class="text-tg-text-dim">Reservation Manager</span>
                      <span class="text-tg-text">
                        {reservationState().entries.size} relay{reservationState().entries.size !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {(() => {
                      const entries = [...reservationState().entries.values()];
                      const totalPages = Math.max(1, Math.ceil(entries.length / RESERVATIONS_PER_PAGE));
                      const page = Math.min(reservationPage(), totalPages - 1);
                      const paged = entries.slice(page * RESERVATIONS_PER_PAGE, (page + 1) * RESERVATIONS_PER_PAGE);
                      return (
                        <>
                          <For each={paged}>
                            {(entry) => (
                              <div class="flex items-center gap-2 py-0.5">
                                <span
                                  class="inline-block w-2 h-2 rounded-full"
                                  classList={{
                                    "bg-tg-success": entry.status === "active",
                                    "bg-tg-warning": entry.status === "renewing" || entry.status === "reserving",
                                    "bg-tg-danger": entry.status === "backoff",
                                    "bg-tg-text-dim": entry.status === "idle" || entry.status === "evicted",
                                  }}
                                />
                                <code class="text-tg-text flex-1">{entry.peerId.slice(0, 20)}...</code>
                                <span class="text-[10px] text-tg-text-dim uppercase">{entry.status}</span>
                              </div>
                            )}
                          </For>
                          <Show when={totalPages > 1}>
                            <div class="flex justify-center items-center gap-2 mt-2">
                              <button
                                onClick={() => setReservationPage(Math.max(0, page - 1))}
                                disabled={page === 0}
                                class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                              >
                                prev
                              </button>
                              <span class="text-tg-text-dim text-xs">{page + 1} / {totalPages}</span>
                              <button
                                onClick={() => setReservationPage(Math.min(totalPages - 1, page + 1))}
                                disabled={page >= totalPages - 1}
                                class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                              >
                                next
                              </button>
                            </div>
                          </Show>
                        </>
                      );
                    })()}
                  </div>
                </Show>
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
                    {(() => {
                      const groups = [...discovery().groups.values()].sort((a, b) => a.groupId.localeCompare(b.groupId));
                      const totalPages = Math.max(1, Math.ceil(groups.length / GROUP_DISCOVERY_GROUPS_PER_PAGE));
                      const page = Math.min(groupDiscoveryPage(), totalPages - 1);
                      const pagedGroups = groups.slice(
                        page * GROUP_DISCOVERY_GROUPS_PER_PAGE,
                        (page + 1) * GROUP_DISCOVERY_GROUPS_PER_PAGE,
                      );
                      return (
                        <>
                          <For each={pagedGroups}>
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
                                  {(() => {
                                    const totalPeerPages = Math.max(1, Math.ceil(group.peers.length / GROUP_DISCOVERY_PEERS_PER_PAGE));
                                    const peerPage = Math.min(getGroupPeerPage(group.groupId), totalPeerPages - 1);
                                    const pagedPeers = group.peers.slice(
                                      peerPage * GROUP_DISCOVERY_PEERS_PER_PAGE,
                                      (peerPage + 1) * GROUP_DISCOVERY_PEERS_PER_PAGE,
                                    );
                                    return (
                                      <>
                                        <div class="text-tg-text-dim text-[10px] mb-0.5">
                                          Peers ({group.peers.length}):
                                        </div>
                                        <For each={pagedPeers}>
                                          {(peer) => (
                                            <div class="pl-2 text-tg-text break-all text-[10px]">
                                              {peer.peerId.slice(0, 20)}...
                                              <Show when={peer.addrs.length > 0}>
                                                <span class="text-tg-text-dim ml-1">{peer.addrs[0]}</span>
                                              </Show>
                                            </div>
                                          )}
                                        </For>
                                        <Show when={totalPeerPages > 1}>
                                          <div class="flex justify-center items-center gap-2 mt-2">
                                            <button
                                              onClick={() => setGroupPeerPage(group.groupId, Math.max(0, peerPage - 1))}
                                              disabled={peerPage === 0}
                                              class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                                            >
                                              prev
                                            </button>
                                            <span class="text-tg-text-dim text-xs">{peerPage + 1} / {totalPeerPages}</span>
                                            <button
                                              onClick={() => setGroupPeerPage(group.groupId, Math.min(totalPeerPages - 1, peerPage + 1))}
                                              disabled={peerPage >= totalPeerPages - 1}
                                              class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                                            >
                                              next
                                            </button>
                                          </div>
                                        </Show>
                                      </>
                                    );
                                  })()}
                                </Show>
                              </div>
                            )}
                          </For>
                          <Show when={totalPages > 1}>
                            <div class="flex justify-center items-center gap-2 mt-2">
                              <button
                                onClick={() => setGroupDiscoveryPage(Math.max(0, page - 1))}
                                disabled={page === 0}
                                class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                              >
                                prev
                              </button>
                              <span class="text-tg-text-dim text-xs">{page + 1} / {totalPages}</span>
                              <button
                                onClick={() => setGroupDiscoveryPage(Math.min(totalPages - 1, page + 1))}
                                disabled={page >= totalPages - 1}
                                class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                              >
                                next
                              </button>
                            </div>
                          </Show>
                        </>
                      );
                    })()}
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
                  {(() => {
                    const totalPages = Math.max(1, Math.ceil(status().multiaddrs.length / ADDRESSES_PER_PAGE));
                    const page = Math.min(addressesPage(), totalPages - 1);
                    const paged = status().multiaddrs.slice(page * ADDRESSES_PER_PAGE, (page + 1) * ADDRESSES_PER_PAGE);
                    return (
                      <>
                        <For each={paged}>
                          {(addr) => (
                            <div class="pl-3 break-all mt-0.5 text-tg-text">
                              {addr}
                            </div>
                          )}
                        </For>
                        <Show when={totalPages > 1}>
                          <div class="flex justify-center items-center gap-2 mt-2">
                            <button
                              onClick={() => setAddressesPage(Math.max(0, page - 1))}
                              disabled={page === 0}
                              class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                            >
                              prev
                            </button>
                            <span class="text-tg-text-dim text-xs">{page + 1} / {totalPages}</span>
                            <button
                              onClick={() => setAddressesPage(Math.min(totalPages - 1, page + 1))}
                              disabled={page >= totalPages - 1}
                              class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                            >
                              next
                            </button>
                          </div>
                        </Show>
                      </>
                    );
                  })()}
                </details>
              </Show>
            </div>

            <details class="mt-1">
              <summary class="cursor-pointer text-tg-text-dim">
                Pinned Peer IDs ({props.pinnedPeerIds.length})
              </summary>
              <Show
                when={props.pinnedPeerIds.length > 0}
                fallback={
                  <div class="text-tg-text-dim text-center py-2">
                    No pinned peers yet.
                  </div>
                }
              >
                {(() => {
                  const totalPages = Math.max(1, Math.ceil(props.pinnedPeerIds.length / PINNED_PEERS_PER_PAGE));
                  const page = Math.min(pinnedPeerPage(), totalPages - 1);
                  const paged = props.pinnedPeerIds.slice(
                    page * PINNED_PEERS_PER_PAGE,
                    (page + 1) * PINNED_PEERS_PER_PAGE,
                  );
                  const connectedPeerIds = new Set(status().peers.map((peer) => peer.peerId));
                  return (
                    <>
                      <For each={paged}>
                        {(peerId) => {
                          const contact = props.contactsBook.get(peerId);
                          const label = contact?.nickname ?? contact?.selfName ?? `${peerId.slice(0, 12)}...`;
                          return (
                            <div class="p-2 mb-1.5 bg-tg-sidebar rounded-lg border border-tg-border">
                              <div class="flex items-center gap-1.5 min-w-0">
                                <span
                                  class="inline-block w-2 h-2 rounded-full shrink-0"
                                  classList={{
                                    "bg-tg-success": connectedPeerIds.has(peerId),
                                    "bg-tg-text-dim": !connectedPeerIds.has(peerId),
                                  }}
                                />
                                <span class="text-tg-text font-semibold truncate">{label}</span>
                              </div>
                              <code class="block mt-1 text-tg-text-dim break-all">{peerId}</code>
                            </div>
                          );
                        }}
                      </For>
                      <Show when={totalPages > 1}>
                        <div class="flex justify-center items-center gap-2 mt-2">
                          <button
                            onClick={() => setPinnedPeerPage(Math.max(0, page - 1))}
                            disabled={page === 0}
                            class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                          >
                            prev
                          </button>
                          <span class="text-tg-text-dim text-xs">{page + 1} / {totalPages}</span>
                          <button
                            onClick={() => setPinnedPeerPage(Math.min(totalPages - 1, page + 1))}
                            disabled={page >= totalPages - 1}
                            class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                          >
                            next
                          </button>
                        </div>
                      </Show>
                    </>
                  );
                })()}
              </Show>
            </details>

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
                        (props.contactsBook.get(p.peerId)?.nickname?.toLowerCase().includes(query) ?? false) ||
                        (props.contactsBook.get(p.peerId)?.selfName?.toLowerCase().includes(query) ?? false) ||
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
                                {(() => {
                                  const contact = props.contactsBook.get(peer.peerId);
                                  const contactName = contact?.nickname ?? contact?.selfName;
                                  if (!contactName) {
                                    return <code class="font-bold text-tg-text">{peer.peerId.slice(0, 20)}...</code>;
                                  }
                                  return (
                                    <>
                                      <span class="font-semibold text-tg-text">{contactName}</span>
                                      <code class="text-tg-text-dim">{peer.peerId.slice(0, 12)}...</code>
                                    </>
                                  );
                                })()}
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

            <details class="mt-2">
              <summary class="cursor-pointer text-tg-text-dim">
                Contacts Book ({props.contactsBook.size})
              </summary>
              <Show
                when={props.contactsBook.size > 0}
                fallback={
                  <div class="text-tg-text-dim text-center py-2">
                    No contacts recorded yet.
                  </div>
                }
              >
                <div class="my-1.5">
                  <input
                    type="text"
                    value={contactsSearch()}
                    onInput={(e) => { setContactsSearch(e.currentTarget.value); setContactsPage(0); }}
                    placeholder="Search by name, peer ID, or group ID..."
                    class="w-full px-2 py-1.5 rounded-lg bg-tg-sidebar border border-tg-border text-tg-text font-mono text-xs box-border placeholder:text-tg-text-dim"
                  />
                </div>
                {(() => {
                  const query = contactsSearch().trim().toLowerCase();
                  const connectedPeerIds = new Set(status().peers.map((peer) => peer.peerId));
                  const contacts = [...props.contactsBook.values()]
                    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
                    .filter((contact) =>
                      query.length === 0 ||
                      (contact.nickname?.toLowerCase().includes(query) ?? false) ||
                      (contact.selfName?.toLowerCase().includes(query) ?? false) ||
                      contact.seenSelfNames.some((name) => name.toLowerCase().includes(query)) ||
                      contact.peerId.toLowerCase().includes(query) ||
                      contact.groupIds.some((groupId) => groupId.toLowerCase().includes(query))
                    );
                  const totalPages = Math.max(1, Math.ceil(contacts.length / CONTACTS_PER_PAGE));
                  const page = Math.min(contactsPage(), totalPages - 1);
                  const paged = contacts.slice(page * CONTACTS_PER_PAGE, (page + 1) * CONTACTS_PER_PAGE);
                  return (
                    <>
                      <For each={paged}>
                        {(contact) => (
                          <div class="p-2 mb-1.5 bg-tg-sidebar rounded-lg border border-tg-border">
                            <div class="flex items-center justify-between gap-2">
                              <div class="flex items-center gap-1.5 min-w-0">
                                <span
                                  class="inline-block w-2 h-2 rounded-full shrink-0"
                                  classList={{
                                    "bg-tg-success": connectedPeerIds.has(contact.peerId),
                                    "bg-tg-text-dim": !connectedPeerIds.has(contact.peerId),
                                  }}
                                />
                                <span class="text-tg-text font-semibold truncate">
                                  {contact.nickname ?? contact.selfName ?? "(unknown name)"}
                                </span>
                              </div>
                              <span class="text-[10px] text-tg-text-dim shrink-0">
                                {formatLastSeen(contact.lastSeenAt)}
                              </span>
                            </div>
                            <div class="text-tg-text-dim break-all mt-1">
                              {contact.peerId}
                            </div>
                            <div class="text-tg-text-dim mt-0.5">
                              Groups: {contact.groupIds.length}
                            </div>
                          </div>
                        )}
                      </For>
                      <Show when={totalPages > 1}>
                        <div class="flex justify-center items-center gap-2 mt-2">
                          <button
                            onClick={() => setContactsPage(Math.max(0, page - 1))}
                            disabled={page === 0}
                            class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                          >
                            prev
                          </button>
                          <span class="text-tg-text-dim text-xs">
                            {page + 1} / {totalPages}
                            {query && ` (${contacts.length} match${contacts.length !== 1 ? "es" : ""})`}
                          </span>
                          <button
                            onClick={() => setContactsPage(Math.min(totalPages - 1, page + 1))}
                            disabled={page >= totalPages - 1}
                            class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                          >
                            next
                          </button>
                        </div>
                      </Show>
                      <Show when={query.length > 0 && contacts.length === 0}>
                        <div class="text-tg-text-dim text-center py-2">
                          No contacts matching "{contactsSearch()}"
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
