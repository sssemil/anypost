import { describe, it, expect } from "vitest";
import type { NetworkStatus, PeerInfo } from "anypost-core/protocol";
import {
  classifyTransport,
  classifyNodeType,
  buildTopologyGraph,
  type GraphNode,
  type GraphEdge,
  type TopologyGraph,
} from "./topology-graph.js";

const createPeerInfo = (overrides?: Partial<PeerInfo>): PeerInfo => ({
  peerId: "12D3KooWTestPeer1234567890",
  addrs: ["/ip4/127.0.0.1/tcp/9090/ws/p2p/12D3KooWRelay"],
  direction: "outbound",
  protocol: "yamux",
  ...overrides,
});

const createNetworkStatus = (overrides?: Partial<NetworkStatus>): NetworkStatus => ({
  peerId: "12D3KooWSelf1234567890",
  multiaddrs: ["/ip4/127.0.0.1/tcp/4001/ws"],
  topic: "test-topic-hash",
  peers: [],
  subscriberCount: 0,
  ...overrides,
});

describe("classifyTransport", () => {
  it("should classify webrtc addresses", () => {
    expect(classifyTransport("/ip4/1.2.3.4/tcp/9090/ws/p2p/12D/p2p-circuit/webrtc/p2p/12D3")).toBe("webrtc");
  });

  it("should classify circuit-relay addresses", () => {
    expect(classifyTransport("/ip4/1.2.3.4/tcp/9090/ws/p2p/12D/p2p-circuit/p2p/12D3")).toBe("circuit-relay");
  });

  it("should classify websocket addresses", () => {
    expect(classifyTransport("/ip4/127.0.0.1/tcp/9090/ws/p2p/12D3KooWRelay")).toBe("websocket");
  });

  it("should classify wss addresses as websocket", () => {
    expect(classifyTransport("/dns4/relay.example.com/tcp/443/wss/p2p/12D3KooW")).toBe("websocket");
  });

  it("should return unknown for unrecognized addresses", () => {
    expect(classifyTransport("/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW")).toBe("unknown");
  });
});

describe("classifyNodeType", () => {
  it("should classify self node", () => {
    expect(classifyNodeType("12D3KooWSelf", "12D3KooWSelf", [])).toBe("self");
  });

  it("should classify bootstrap node by known address", () => {
    const bootstrapAddrs = ["/dnsaddr/bootstrap.libp2p.io/p2p/QmPeer"];
    expect(classifyNodeType("QmPeer", "12D3Self", bootstrapAddrs)).toBe("bootstrap");
  });

  it("should classify relay node by circuit-relay in address", () => {
    const addr = "/ip4/1.2.3.4/tcp/9090/ws/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWSelf";
    expect(classifyNodeType("12D3KooWRelay", "12D3KooWSelf", [addr])).toBe("relay");
  });

  it("should classify regular peer", () => {
    expect(classifyNodeType("12D3KooWPeer", "12D3KooWSelf", [])).toBe("peer");
  });
});

describe("buildTopologyGraph", () => {
  it("should create a self node with no peers", () => {
    const status = createNetworkStatus();
    const graph = buildTopologyGraph(status, []);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toEqual<GraphNode>({
      id: "12D3KooWSelf1234567890",
      label: "12D3KooWSelf1234...",
      nodeType: "self",
    });
    expect(graph.edges).toHaveLength(0);
  });

  it("should add peer nodes and edges from network status", () => {
    const peer = createPeerInfo({
      peerId: "12D3KooWPeerABC",
      addrs: ["/ip4/1.2.3.4/tcp/9090/ws/p2p/12D3KooWPeerABC"],
    });
    const status = createNetworkStatus({ peers: [peer] });
    const graph = buildTopologyGraph(status, []);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toEqual<GraphEdge>({
      source: "12D3KooWSelf1234567890",
      target: "12D3KooWPeerABC",
      transport: "websocket",
      direction: "outbound",
    });
  });

  it("should classify transport from peer address", () => {
    const peer = createPeerInfo({
      peerId: "12D3KooWPeer",
      addrs: ["/ip4/1.2.3.4/tcp/9090/ws/p2p/12D3Relay/p2p-circuit/webrtc/p2p/12D3KooWPeer"],
    });
    const status = createNetworkStatus({ peers: [peer] });
    const graph = buildTopologyGraph(status, []);

    expect(graph.edges[0].transport).toBe("webrtc");
  });

  it("should identify relay nodes from circuit-relay addresses in self multiaddrs", () => {
    const relayPeerId = "12D3KooWRelayNode";
    const peer = createPeerInfo({
      peerId: relayPeerId,
      addrs: [`/ip4/1.2.3.4/tcp/9090/ws/p2p/${relayPeerId}`],
    });
    const status = createNetworkStatus({
      peers: [peer],
      multiaddrs: [`/ip4/1.2.3.4/tcp/9090/ws/p2p/${relayPeerId}/p2p-circuit/p2p/12D3KooWSelf`],
    });
    const graph = buildTopologyGraph(status, []);

    const relayNode = graph.nodes.find((n) => n.id === relayPeerId);
    expect(relayNode?.nodeType).toBe("relay");
  });

  it("should identify bootstrap nodes from bootstrap peer list", () => {
    const bootstrapPeerId = "QmBootstrapPeer";
    const peer = createPeerInfo({
      peerId: bootstrapPeerId,
      addrs: ["/dnsaddr/bootstrap.libp2p.io/p2p/QmBootstrapPeer"],
    });
    const bootstrapAddrs = [`/dnsaddr/bootstrap.libp2p.io/p2p/${bootstrapPeerId}`];
    const status = createNetworkStatus({ peers: [peer] });
    const graph = buildTopologyGraph(status, bootstrapAddrs);

    const bsNode = graph.nodes.find((n) => n.id === bootstrapPeerId);
    expect(bsNode?.nodeType).toBe("bootstrap");
  });

  it("should deduplicate peers with the same peerId", () => {
    const peers = [
      createPeerInfo({ peerId: "12D3Same", addrs: ["/ip4/1.2.3.4/tcp/9090/ws/p2p/12D3Same"] }),
      createPeerInfo({ peerId: "12D3Same", addrs: ["/ip4/5.6.7.8/tcp/9090/ws/p2p/12D3Same"] }),
    ];
    const status = createNetworkStatus({ peers });
    const graph = buildTopologyGraph(status, []);

    const peerNodes = graph.nodes.filter((n) => n.id === "12D3Same");
    expect(peerNodes).toHaveLength(1);
  });
});
