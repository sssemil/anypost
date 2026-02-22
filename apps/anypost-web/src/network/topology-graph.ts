import type { NetworkStatus } from "anypost-core/protocol";

export type NodeType = "self" | "relay" | "peer" | "bootstrap";
export type TransportType = "webrtc" | "circuit-relay" | "websocket" | "unknown";

export type GraphNode = {
  readonly id: string;
  readonly label: string;
  readonly nodeType: NodeType;
};

export type GraphEdge = {
  readonly source: string;
  readonly target: string;
  readonly transport: TransportType;
  readonly direction: "inbound" | "outbound";
  readonly latencyMs: number | null;
};

export type TopologyGraph = {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
};

const SHORT_ID_LENGTH = 16;

const MIN_LATENCY = 10;
const MAX_LATENCY = 2000;
const MIN_DISTANCE = 60;
const MAX_DISTANCE = 250;
const DEFAULT_DISTANCE = 100;

export const latencyToDistance = (ms: number | null): number => {
  if (ms === null) return DEFAULT_DISTANCE;
  const clamped = Math.max(MIN_LATENCY, Math.min(MAX_LATENCY, ms));
  const logMin = Math.log(MIN_LATENCY);
  const logMax = Math.log(MAX_LATENCY);
  const ratio = (Math.log(clamped) - logMin) / (logMax - logMin);
  return Math.round(MIN_DISTANCE + ratio * (MAX_DISTANCE - MIN_DISTANCE));
};

export const classifyTransport = (addr: string): TransportType => {
  if (addr.includes("/webrtc")) return "webrtc";
  if (addr.includes("/p2p-circuit/")) return "circuit-relay";
  if (addr.includes("/ws/") || addr.includes("/wss/") || addr.endsWith("/ws") || addr.endsWith("/wss")) return "websocket";
  return "unknown";
};

const extractRelayPeerIds = (multiaddrs: readonly string[]): ReadonlySet<string> => {
  const relayIds = new Set<string>();
  for (const addr of multiaddrs) {
    if (!addr.includes("/p2p-circuit/")) continue;
    const circuitIndex = addr.indexOf("/p2p-circuit/");
    const beforeCircuit = addr.slice(0, circuitIndex);
    const peerMatch = beforeCircuit.match(/\/p2p\/([^/]+)$/);
    if (peerMatch) relayIds.add(peerMatch[1]);
  }
  return relayIds;
};

const extractBootstrapPeerIds = (bootstrapAddrs: readonly string[]): ReadonlySet<string> => {
  const ids = new Set<string>();
  for (const addr of bootstrapAddrs) {
    const match = addr.match(/\/p2p\/([^/]+)$/);
    if (match) ids.add(match[1]);
  }
  return ids;
};

export const classifyNodeType = (
  peerId: string,
  selfPeerId: string,
  contextAddrs: readonly string[],
): NodeType => {
  if (peerId === selfPeerId) return "self";

  const bootstrapIds = extractBootstrapPeerIds(
    contextAddrs.filter((a) => a.includes("bootstrap.libp2p.io")),
  );
  if (bootstrapIds.has(peerId)) return "bootstrap";

  const relayIds = extractRelayPeerIds(
    contextAddrs.filter((a) => a.includes("/p2p-circuit/")),
  );
  if (relayIds.has(peerId)) return "relay";

  return "peer";
};

export const buildTopologyGraph = (
  status: NetworkStatus,
  bootstrapAddrs: readonly string[],
  latencyMap?: ReadonlyMap<string, number>,
): TopologyGraph => {
  const selfNode: GraphNode = {
    id: status.peerId,
    label: `${status.peerId.slice(0, SHORT_ID_LENGTH)}...`,
    nodeType: "self",
  };

  const relayPeerIds = extractRelayPeerIds(status.multiaddrs);
  const bootstrapPeerIds = extractBootstrapPeerIds(bootstrapAddrs);

  const seenPeerIds = new Set<string>();
  const peerNodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const peer of status.peers) {
    if (seenPeerIds.has(peer.peerId)) continue;
    seenPeerIds.add(peer.peerId);

    const nodeType = relayPeerIds.has(peer.peerId)
      ? "relay" as const
      : bootstrapPeerIds.has(peer.peerId)
        ? "bootstrap" as const
        : "peer" as const;

    peerNodes.push({
      id: peer.peerId,
      label: `${peer.peerId.slice(0, SHORT_ID_LENGTH)}...`,
      nodeType,
    });

    const primaryAddr = peer.addrs[0] ?? "";
    edges.push({
      source: status.peerId,
      target: peer.peerId,
      transport: classifyTransport(primaryAddr),
      direction: peer.direction,
      latencyMs: latencyMap?.get(peer.peerId) ?? null,
    });
  }

  return {
    nodes: [selfNode, ...peerNodes],
    edges,
  };
};
