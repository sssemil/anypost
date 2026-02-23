import { createLibp2p } from "libp2p";
import type { PubSub } from "@libp2p/interface";
import { tcp } from "@libp2p/tcp";
import { webSockets } from "@libp2p/websockets";
import * as wsFilters from "@libp2p/websockets/filters";
import { webRTC } from "@libp2p/webrtc";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { identify } from "@libp2p/identify";
import { dcutr } from "@libp2p/dcutr";
import { kadDHT } from "@libp2p/kad-dht";
import { ping } from "@libp2p/ping";
import { bootstrap } from "@libp2p/bootstrap";
import { peerIdFromString } from "@libp2p/peer-id";
import { multiaddr } from "@multiformats/multiaddr";
import type { Multiaddr } from "@multiformats/multiaddr";
import { groupTopic } from "./router.js";
import { encodeWireMessage, decodeWireMessage } from "./codec.js";
import { buildCircuitRelayAddresses } from "./peer-id-sharing.js";
import { createProviderCid, ANYPOST_CHAT_NAMESPACE } from "./dht-config.js";
import { createEncryptedMessage } from "../shared/factories.js";
import type { GroupId, WireMessage } from "../shared/schemas.js";
import { IPFS_BOOTSTRAP_WSS_PEERS } from "../libp2p/bootstrap-peers.js";

export type ChatMessageEvent = {
  readonly senderPeerId: string;
  readonly senderDisplayName?: string;
  readonly text: string;
  readonly timestamp: number;
  readonly id: string;
};

type MessageListener = (message: ChatMessageEvent) => void;

export type PeerInfo = {
  readonly peerId: string;
  readonly addrs: readonly string[];
  readonly direction: "inbound" | "outbound";
  readonly protocol: string;
};

export type NetworkStatus = {
  readonly peerId: string;
  readonly multiaddrs: readonly string[];
  readonly topic: string;
  readonly peers: readonly PeerInfo[];
  readonly subscriberCount: number;
};

export type NetworkEvent = {
  readonly timestamp: number;
  readonly type: "peer-connect" | "peer-disconnect" | "subscription-change"
    | "pubsub-message" | "dial-attempt" | "dial-success" | "dial-failure"
    | "relay-reservation" | "relay-harvest" | "relay-candidate" | "address-change" | "gossipsub-mesh" | "sync" | "info";
  readonly detail: string;
};

type EventListener = (event: NetworkEvent) => void;

export type PlaintextChat = {
  readonly peerId: string;
  readonly multiaddrs: readonly Multiaddr[];
  readonly peerCount: () => number;
  readonly getNetworkStatus: () => NetworkStatus;
  readonly connectTo: (addr: Multiaddr) => Promise<void>;
  readonly connectToPeerId: (targetPeerId: string) => Promise<void>;
  readonly sendMessage: (text: string, displayName?: string) => Promise<void>;
  readonly onMessage: (listener: MessageListener) => () => void;
  readonly onPeerChange: (listener: (count: number) => void) => () => void;
  readonly onEvent: (listener: EventListener) => () => void;
  readonly stop: () => Promise<void>;
};

type CreatePlaintextChatOptions = {
  readonly groupId: GroupId;
  readonly listenAddresses?: readonly string[];
  readonly bootstrapPeers?: readonly string[];
  readonly useTransports?: "tcp" | "websocket";
};

const DEFAULT_CHANNEL_ID = "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22";

export const createPlaintextChat = async (
  options: CreatePlaintextChatOptions,
): Promise<PlaintextChat> => {
  const {
    groupId,
    listenAddresses = [],
    bootstrapPeers = [],
    useTransports = "websocket",
  } = options;

  const isBrowser = useTransports === "websocket";

  const allBootstrapPeers = isBrowser
    ? [...bootstrapPeers, ...IPFS_BOOTSTRAP_WSS_PEERS]
    : [...bootstrapPeers];

  const peerDiscovery =
    allBootstrapPeers.length > 0
      ? [bootstrap({ list: allBootstrapPeers })]
      : [];

  const node = isBrowser
    ? await createLibp2p({
        addresses: { listen: [...listenAddresses, "/p2p-circuit", "/webrtc"] },
        transports: [
          webSockets({ filter: wsFilters.all }),
          webRTC({
            rtcConfiguration: {
              iceServers: [
                { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
              ],
            },
          }),
          circuitRelayTransport(),
        ],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        connectionGater: { denyDialMultiaddr: async () => false },
        peerDiscovery,
        services: {
          identify: identify(),
          pubsub: gossipsub({
            allowPublishToZeroTopicPeers: true,
            runOnLimitedConnection: true,
          }),
          dcutr: dcutr(),
          ping: ping(),
          dht: kadDHT({ clientMode: true }),
        },
      })
    : await createLibp2p({
        addresses: { listen: [...listenAddresses] },
        transports: [tcp()],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        peerDiscovery,
        services: {
          identify: identify(),
          pubsub: gossipsub({
            allowPublishToZeroTopicPeers: true,
            runOnLimitedConnection: true,
          }),
        },
      });

  const topic = groupTopic(groupId);
  const pubsub = node.services.pubsub as PubSub;
  const listeners: MessageListener[] = [];
  const peerChangeListeners: Array<(count: number) => void> = [];
  const eventListeners: EventListener[] = [];

  const emit = (type: NetworkEvent["type"], detail: string) => {
    const event: NetworkEvent = { timestamp: Date.now(), type, detail };
    eventListeners.forEach((l) => l(event));
  };

  const peerId = (id: { toString(): string }) => id.toString().slice(0, 16);

  const transportLabel = (addr: string): string => {
    if (addr.includes("/webrtc/")) return "webrtc";
    if (addr.includes("/p2p-circuit/")) return "circuit-relay";
    if (addr.includes("/ws/")) return "websocket";
    return "unknown";
  };

  const notifyPeerChange = () => {
    const count = node.getPeers().length;
    peerChangeListeners.forEach((l) => l(count));
  };

  node.addEventListener("peer:connect", (evt: CustomEvent) => {
    const id = evt.detail as { toString(): string };
    const conn = node.getConnections().find(
      (c) => c.remotePeer.toString() === id.toString(),
    );
    const addr = conn?.remoteAddr.toString() ?? "unknown";
    const transport = transportLabel(addr);
    emit("peer-connect", `${peerId(id)}... connected via ${transport} (${addr})`);
    notifyPeerChange();
  });

  node.addEventListener("peer:disconnect", (evt: CustomEvent) => {
    const id = evt.detail as { toString(): string };
    emit("peer-disconnect", `${peerId(id)}... disconnected`);
    notifyPeerChange();
  });

  node.addEventListener("self:peer:update", () => {
    const addrs = node.getMultiaddrs().map((ma) => ma.toString());
    const circuitAddrs = addrs.filter((a) => a.includes("/p2p-circuit/"));
    const webrtcAddrs = addrs.filter((a) => a.includes("/webrtc"));
    if (circuitAddrs.length > 0) {
      emit("relay-reservation", `Got ${circuitAddrs.length} circuit relay address(es)`);
    }
    if (webrtcAddrs.length > 0) {
      emit("address-change", `Listening on ${webrtcAddrs.length} WebRTC address(es)`);
    }
    emit("address-change", `Total addresses: ${addrs.length}`);
  });

  pubsub.addEventListener("subscription-change", (evt: CustomEvent) => {
    const detail = evt.detail as {
      peerId: { toString(): string };
      subscriptions: ReadonlyArray<{ topic: string; subscribe: boolean }>;
    };
    for (const sub of detail.subscriptions) {
      const action = sub.subscribe ? "subscribed to" : "unsubscribed from";
      emit("subscription-change", `${peerId(detail.peerId)}... ${action} ${sub.topic.slice(0, 24)}...`);
    }
  });

  emit("info", `Node started: ${node.peerId.toString()}`);
  emit("info", `Topic: ${topic}`);

  const dialedPeers = new Set<string>();

  const attemptDirectConnect = (remotePeerId: string) => {
    if (remotePeerId === node.peerId.toString()) return;
    if (dialedPeers.has(remotePeerId)) return;
    if (node.getPeers().some((p) => p.toString() === remotePeerId)) return;

    dialedPeers.add(remotePeerId);

    for (const bp of bootstrapPeers) {
      const circuitAddr = multiaddr(`${bp}/p2p-circuit/p2p/${remotePeerId}`);
      emit("dial-attempt", `Dialing ${peerId({ toString: () => remotePeerId })}... via circuit relay`);
      node.dial(circuitAddr).then(() => {
        emit("dial-success", `Direct connection to ${peerId({ toString: () => remotePeerId })}... established`);
      }).catch((err: Error) => {
        emit("dial-failure", `Failed to dial ${peerId({ toString: () => remotePeerId })}...: ${err.message}`);
        dialedPeers.delete(remotePeerId);
      });
    }
  };

  const handlePubsubMessage = (event: CustomEvent) => {
    const detail = event.detail as { topic: string; data: Uint8Array };
    if (detail.topic !== topic) return;

    const result = decodeWireMessage(detail.data);
    if (!result.success) return;

    const wireMessage = result.data;
    if (wireMessage.type !== "encrypted_message") return;

    const payload = wireMessage.payload;
    const chatMessage: ChatMessageEvent = {
      id: payload.id,
      senderPeerId: payload.senderPeerId,
      senderDisplayName: payload.senderDisplayName,
      text: new TextDecoder().decode(payload.ciphertext),
      timestamp: payload.timestamp,
    };

    emit("pubsub-message", `Message from ${peerId({ toString: () => payload.senderPeerId })}... (${new TextDecoder().decode(payload.ciphertext).slice(0, 40)})`);
    attemptDirectConnect(payload.senderPeerId);

    listeners.forEach((listener) => listener(chatMessage));
  };

  pubsub.subscribe(topic);
  pubsub.addEventListener("message", handlePubsubMessage);

  if (isBrowser) {
    createProviderCid(ANYPOST_CHAT_NAMESPACE).then((chatCid) => {
      node.contentRouting.provide(chatCid).catch(() => {});
    }).catch(() => {});
  }

  return {
    peerId: node.peerId.toString(),
    get multiaddrs() {
      return node.getMultiaddrs();
    },
    peerCount: () => node.getPeers().length,
    getNetworkStatus: () => {
      const connections = node.getConnections();
      const peers: PeerInfo[] = connections.map((conn) => ({
        peerId: conn.remotePeer.toString(),
        addrs: [conn.remoteAddr.toString()],
        direction: conn.direction,
        protocol: conn.multiplexer ?? "unknown",
      }));
      const subscribers = pubsub.getSubscribers(topic);
      return {
        peerId: node.peerId.toString(),
        multiaddrs: node.getMultiaddrs().map((ma) => ma.toString()),
        topic,
        peers,
        subscriberCount: subscribers.length,
      };
    },
    connectTo: async (addr: Multiaddr) => {
      await node.dial(addr);
    },
    connectToPeerId: async (targetPeerId: string) => {
      const remotePeer = peerIdFromString(targetPeerId);

      try {
        emit("dial-attempt", `Looking up peer ${targetPeerId.slice(0, 16)}... on DHT`);
        const peerInfo = await node.peerRouting.findPeer(remotePeer);
        if (peerInfo.multiaddrs.length > 0) {
          emit("info", `Found ${peerInfo.multiaddrs.length} address(es) via DHT for ${targetPeerId.slice(0, 16)}...`);
          await node.dial(remotePeer);
          emit("dial-success", `Connected to ${targetPeerId.slice(0, 16)}... via DHT`);
          return;
        }
      } catch {
        emit("info", `DHT lookup failed for ${targetPeerId.slice(0, 16)}..., trying circuit relay`);
      }

      const relayAddresses = bootstrapPeers.length > 0
        ? bootstrapPeers
        : node.getMultiaddrs()
            .map((ma) => ma.toString())
            .filter((a) => a.includes("/p2p/") && !a.includes("/p2p-circuit/"));

      const circuitAddrs = buildCircuitRelayAddresses({
        targetPeerId,
        relayAddresses,
      });

      for (const addr of circuitAddrs) {
        try {
          emit("dial-attempt", `Trying circuit relay: ${addr.slice(0, 60)}...`);
          await node.dial(multiaddr(addr));
          emit("dial-success", `Connected to ${targetPeerId.slice(0, 16)}... via circuit relay`);
          return;
        } catch {
          emit("dial-failure", `Circuit relay failed: ${addr.slice(0, 60)}...`);
        }
      }

      throw new Error(`Could not connect to peer ${targetPeerId}`);
    },
    sendMessage: async (text: string, displayName?: string) => {
      const payload = createEncryptedMessage({
        id: crypto.randomUUID(),
        groupId,
        channelId: DEFAULT_CHANNEL_ID,
        senderPeerId: node.peerId.toString(),
        senderDisplayName: displayName,
        epoch: 0,
        ciphertext: new TextEncoder().encode(text),
        timestamp: Date.now(),
      });

      const wireMessage: WireMessage = {
        type: "encrypted_message",
        payload,
      };

      await pubsub.publish(topic, encodeWireMessage(wireMessage));
    },
    onMessage: (listener: MessageListener) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      };
    },
    onPeerChange: (listener: (count: number) => void) => {
      peerChangeListeners.push(listener);
      return () => {
        const index = peerChangeListeners.indexOf(listener);
        if (index !== -1) {
          peerChangeListeners.splice(index, 1);
        }
      };
    },
    onEvent: (listener: EventListener) => {
      eventListeners.push(listener);
      return () => {
        const index = eventListeners.indexOf(listener);
        if (index !== -1) {
          eventListeners.splice(index, 1);
        }
      };
    },
    stop: async () => {
      pubsub.removeEventListener("message", handlePubsubMessage);
      pubsub.unsubscribe(topic);
      listeners.length = 0;
      peerChangeListeners.length = 0;
      eventListeners.length = 0;
      await node.stop();
    },
  };
};
