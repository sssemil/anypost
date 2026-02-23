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
import type { Ping as PingService } from "@libp2p/ping";
import { bootstrap } from "@libp2p/bootstrap";
import { peerIdFromString } from "@libp2p/peer-id";
import { multiaddr } from "@multiformats/multiaddr";
import type { Multiaddr } from "@multiformats/multiaddr";
import { groupTopic } from "./router.js";
import { encodeWireMessage, decodeWireMessage } from "./codec.js";
import { buildCircuitRelayAddresses, extractRelayBaseAddress } from "./peer-id-sharing.js";
import { createProviderCid, ANYPOST_CHAT_NAMESPACE } from "./dht-config.js";
import { startRelayPoolManager } from "./relay-discovery.js";
import type { RelayPoolState } from "./relay-pool.js";
import { pubsubPeerDiscovery } from "@libp2p/pubsub-peer-discovery";
import { createGroupDiscoveryManager } from "./group-discovery.js";
import type { GroupDiscoveryManager } from "./group-discovery.js";
import type { GroupDiscoveryState } from "./group-discovery-state.js";
import { createEncryptedMessage } from "../shared/factories.js";
import type { WireMessage } from "../shared/schemas.js";
import { IPFS_BOOTSTRAP_WSS_PEERS } from "../libp2p/bootstrap-peers.js";
import type { ChatMessageEvent, PeerInfo, NetworkStatus, NetworkEvent } from "./plaintext-chat.js";
import type { AccountKey } from "../crypto/identity.js";
import { GENESIS_HASH, toHex } from "./action-chain.js";
import type { ActionChainGroupState, SignedActionEnvelope } from "./action-chain.js";
import { createSignedActionEnvelope, verifyAndDecodeAction } from "./action-signing.js";
import { createActionDagState, appendAction, getTips, topologicalOrder } from "./action-dag.js";
import type { ActionDagState } from "./action-dag.js";
import { createActionChainGroupState, deriveGroupState } from "./action-chain-state.js";

export type MultiGroupChatMessageEvent = ChatMessageEvent & {
  readonly groupId: string;
};

type MessageListener = (message: MultiGroupChatMessageEvent) => void;
type EventListener = (event: NetworkEvent) => void;

type JoinRequestEvent = {
  readonly groupId: string;
  readonly requesterPublicKey: Uint8Array;
  readonly senderPeerId: string;
};

type JoinRequestListener = (event: JoinRequestEvent) => void;

export type MultiGroupChat = {
  readonly peerId: string;
  readonly multiaddrs: readonly Multiaddr[];
  readonly joinGroup: (groupId: string) => void;
  readonly leaveGroup: (groupId: string) => void;
  readonly getJoinedGroups: () => readonly string[];
  readonly sendMessage: (groupId: string, text: string, displayName?: string) => Promise<void>;
  readonly createGroup: (name: string) => Promise<string>;
  readonly approveJoin: (groupId: string, memberPublicKey: Uint8Array) => Promise<void>;
  readonly requestJoin: (groupId: string) => Promise<void>;
  readonly getActionChainState: (groupId: string) => ActionChainGroupState | null;
  readonly onMessage: (listener: MessageListener) => () => void;
  readonly onJoinRequest: (listener: JoinRequestListener) => () => void;
  readonly onPeerChange: (listener: (count: number) => void) => () => void;
  readonly onEvent: (listener: EventListener) => () => void;
  readonly getNetworkStatus: () => NetworkStatus;
  readonly connectTo: (addr: Multiaddr) => Promise<void>;
  readonly connectToPeerId: (targetPeerId: string) => Promise<void>;
  readonly pingPeer: (targetPeerId: string) => Promise<number>;
  readonly addRelay: (addr: string) => void;
  readonly stop: () => Promise<void>;
};

type CreateMultiGroupChatOptions = {
  readonly accountKey: AccountKey;
  readonly listenAddresses?: readonly string[];
  readonly bootstrapPeers?: readonly string[];
  readonly useTransports?: "tcp" | "websocket";
  readonly onRelayPoolStateChange?: (state: RelayPoolState) => void;
  readonly onGroupDiscoveryStateChange?: (state: GroupDiscoveryState) => void;
};

const DEFAULT_CHANNEL_ID = "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22";

export const createMultiGroupChat = async (
  options: CreateMultiGroupChatOptions,
): Promise<MultiGroupChat> => {
  const {
    accountKey,
    listenAddresses = [],
    bootstrapPeers: initialBootstrapPeers = [],
    useTransports = "websocket",
    onRelayPoolStateChange,
    onGroupDiscoveryStateChange,
  } = options;

  const relayPeers = [...initialBootstrapPeers];

  const isBrowser = useTransports === "websocket";

  const allBootstrapPeers = isBrowser
    ? [...relayPeers, ...IPFS_BOOTSTRAP_WSS_PEERS]
    : [...relayPeers];

  const pubsubDiscovery = isBrowser
    ? [
        pubsubPeerDiscovery({
          interval: 10_000,
          topics: ["_peer-discovery._p2p._pubsub", "anypost/_peer-discovery"],
          listenOnly: false,
        }),
      ]
    : [];

  const peerDiscovery =
    allBootstrapPeers.length > 0
      ? [bootstrap({ list: allBootstrapPeers }), ...pubsubDiscovery]
      : [...pubsubDiscovery];

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

  const pubsub = node.services.pubsub as PubSub;
  const topicToGroupId = new Map<string, string>();
  const joinedGroups: string[] = [];
  const messageListeners: MessageListener[] = [];
  const joinRequestListeners: JoinRequestListener[] = [];
  const peerChangeListeners: Array<(count: number) => void> = [];
  const eventListeners: EventListener[] = [];

  const actionDags = new Map<string, ActionDagState>();
  const actionChainStates = new Map<string, ActionChainGroupState>();

  const getOrCreateDag = (groupId: string): ActionDagState => {
    const existing = actionDags.get(groupId);
    if (existing) return existing;
    const dag = createActionDagState();
    actionDags.set(groupId, dag);
    return dag;
  };

  const publishEnvelope = async (groupId: string, envelope: SignedActionEnvelope) => {
    const topic = groupTopic(groupId);
    const wireMessage: WireMessage = {
      type: "signed_action",
      signedBytes: envelope.signedBytes,
      signature: envelope.signature,
      hash: envelope.hash,
    };
    await pubsub.publish(topic, encodeWireMessage(wireMessage));
  };

  const processSignedAction = (groupId: string, envelope: SignedActionEnvelope): boolean => {
    const result = verifyAndDecodeAction(envelope);
    if (!result.success) {
      emit("info", `Rejected action in ${groupId.slice(0, 8)}...: ${result.error.message}`);
      return false;
    }

    const action = result.data;
    const dag = getOrCreateDag(groupId);
    const newDag = appendAction(dag, action);
    if (newDag === dag) return false;

    actionDags.set(groupId, newDag);

    const ordered = topologicalOrder(newDag);
    const derived = deriveGroupState(groupId, ordered);
    if (derived.success) {
      actionChainStates.set(groupId, derived.data);
    }

    return true;
  };

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

    for (const circuitAddr of circuitAddrs) {
      const baseAddr = extractRelayBaseAddress(circuitAddr);
      if (baseAddr && !relayPeers.includes(baseAddr)) {
        relayPeers.push(baseAddr);
        emit("relay-harvest", `Auto-harvested relay: ${baseAddr.slice(0, 50)}...`);
      }
    }

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

  const dialedPeers = new Set<string>();

  const attemptDirectConnect = (remotePeerId: string) => {
    if (remotePeerId === node.peerId.toString()) return;
    if (dialedPeers.has(remotePeerId)) return;
    if (node.getPeers().some((p) => p.toString() === remotePeerId)) return;

    dialedPeers.add(remotePeerId);

    for (const bp of relayPeers) {
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
    const matchedGroupId = topicToGroupId.get(detail.topic);
    if (matchedGroupId === undefined) return;

    const result = decodeWireMessage(detail.data);
    if (!result.success) return;

    const wireMessage = result.data;

    if (wireMessage.type === "signed_action") {
      const accepted = processSignedAction(matchedGroupId, {
        signedBytes: wireMessage.signedBytes,
        signature: wireMessage.signature,
        hash: wireMessage.hash,
      });
      if (accepted) {
        emit("pubsub-message", `Signed action accepted in group ${matchedGroupId.slice(0, 8)}...`);
      }
      return;
    }

    if (wireMessage.type === "join_request") {
      emit("pubsub-message", `Join request for group ${matchedGroupId.slice(0, 8)}...`);
      joinRequestListeners.forEach((listener) =>
        listener({
          groupId: matchedGroupId,
          requesterPublicKey: wireMessage.requesterPublicKey,
          senderPeerId: "unknown",
        }),
      );
      return;
    }

    if (wireMessage.type !== "encrypted_message") return;

    const payload = wireMessage.payload;
    const chatMessage: MultiGroupChatMessageEvent = {
      id: payload.id,
      senderPeerId: payload.senderPeerId,
      senderDisplayName: payload.senderDisplayName,
      text: new TextDecoder().decode(payload.ciphertext),
      timestamp: payload.timestamp,
      groupId: matchedGroupId,
    };

    emit("pubsub-message", `Message from ${peerId({ toString: () => payload.senderPeerId })}... in group ${matchedGroupId.slice(0, 8)}...`);
    attemptDirectConnect(payload.senderPeerId);

    messageListeners.forEach((listener) => listener(chatMessage));
  };

  pubsub.addEventListener("message", handlePubsubMessage);

  if (isBrowser) {
    createProviderCid(ANYPOST_CHAT_NAMESPACE).then((chatCid) => {
      node.contentRouting.provide(chatCid).catch(() => {});
    }).catch(() => {});
  }

  const relayPoolManager = isBrowser && onRelayPoolStateChange
    ? startRelayPoolManager({
        node: {
          contentRouting: node.contentRouting,
          dial: (addr) => node.dial(multiaddr(addr as string)),
        },
        onStateChange: (poolState) => {
          for (const relay of poolState.relays) {
            if (!relayPeers.includes(relay.address)) {
              relayPeers.push(relay.address);
            }
          }
          onRelayPoolStateChange(poolState);
        },
      })
    : null;

  const groupDiscoveryManager: GroupDiscoveryManager | null = isBrowser
    ? createGroupDiscoveryManager({
        contentRouting: node.contentRouting,
        getConnectedPeerIds: () => node.getPeers().map((p) => p.toString()),
        onStateChange: (discoveryState) => {
          onGroupDiscoveryStateChange?.(discoveryState);
        },
        onPeerDiscovered: (_groupId, peerId, _addrs) => {
          attemptDirectConnect(peerId);
        },
      })
    : null;

  return {
    peerId: node.peerId.toString(),
    get multiaddrs() {
      return node.getMultiaddrs();
    },
    joinGroup: (groupId: string) => {
      if (joinedGroups.includes(groupId)) return;
      const topic = groupTopic(groupId);
      topicToGroupId.set(topic, groupId);
      joinedGroups.push(groupId);
      pubsub.subscribe(topic);
      groupDiscoveryManager?.joinGroup(groupId);
      emit("info", `Joined group ${groupId.slice(0, 8)}... (topic: ${topic})`);
    },
    leaveGroup: (groupId: string) => {
      const idx = joinedGroups.indexOf(groupId);
      if (idx === -1) return;
      const topic = groupTopic(groupId);
      pubsub.unsubscribe(topic);
      topicToGroupId.delete(topic);
      joinedGroups.splice(idx, 1);
      groupDiscoveryManager?.leaveGroup(groupId);
      emit("info", `Left group ${groupId.slice(0, 8)}...`);
    },
    getJoinedGroups: () => [...joinedGroups],
    sendMessage: async (groupId: string, text: string, displayName?: string) => {
      const topic = groupTopic(groupId);
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
    createGroup: async (name: string): Promise<string> => {
      const groupId = crypto.randomUUID();
      const topic = groupTopic(groupId);

      if (!joinedGroups.includes(groupId)) {
        topicToGroupId.set(topic, groupId);
        joinedGroups.push(groupId);
        pubsub.subscribe(topic);
        groupDiscoveryManager?.joinGroup(groupId);
      }

      actionChainStates.set(groupId, createActionChainGroupState(groupId));

      const envelope = createSignedActionEnvelope({
        accountKey,
        groupId,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: name },
      });

      processSignedAction(groupId, envelope);
      await publishEnvelope(groupId, envelope);

      emit("info", `Created group "${name}" (${groupId.slice(0, 8)}...)`);
      return groupId;
    },
    approveJoin: async (groupId: string, memberPublicKey: Uint8Array): Promise<void> => {
      const dag = actionDags.get(groupId);
      if (!dag) throw new Error("No action chain for this group");

      const tips = getTips(dag);
      const parentHashes = tips.length > 0 ? tips : [GENESIS_HASH];

      const envelope = createSignedActionEnvelope({
        accountKey,
        groupId,
        parentHashes,
        payload: {
          type: "member-approved",
          memberPublicKey: new Uint8Array(memberPublicKey),
          role: "member",
        },
      });

      processSignedAction(groupId, envelope);
      await publishEnvelope(groupId, envelope);

      emit("info", `Approved member ${toHex(memberPublicKey).slice(0, 16)}... in group ${groupId.slice(0, 8)}...`);
    },
    requestJoin: async (groupId: string): Promise<void> => {
      const topic = groupTopic(groupId);
      const wireMessage: WireMessage = {
        type: "join_request",
        groupId,
        requesterPublicKey: new Uint8Array(accountKey.publicKey),
      };
      await pubsub.publish(topic, encodeWireMessage(wireMessage));
      emit("info", `Sent join request to group ${groupId.slice(0, 8)}...`);
    },
    getActionChainState: (groupId: string): ActionChainGroupState | null =>
      actionChainStates.get(groupId) ?? null,
    onMessage: (listener: MessageListener) => {
      messageListeners.push(listener);
      return () => {
        const index = messageListeners.indexOf(listener);
        if (index !== -1) messageListeners.splice(index, 1);
      };
    },
    onJoinRequest: (listener: JoinRequestListener) => {
      joinRequestListeners.push(listener);
      return () => {
        const index = joinRequestListeners.indexOf(listener);
        if (index !== -1) joinRequestListeners.splice(index, 1);
      };
    },
    onPeerChange: (listener: (count: number) => void) => {
      peerChangeListeners.push(listener);
      return () => {
        const index = peerChangeListeners.indexOf(listener);
        if (index !== -1) peerChangeListeners.splice(index, 1);
      };
    },
    onEvent: (listener: EventListener) => {
      eventListeners.push(listener);
      return () => {
        const index = eventListeners.indexOf(listener);
        if (index !== -1) eventListeners.splice(index, 1);
      };
    },
    getNetworkStatus: () => {
      const connections = node.getConnections();
      const peers: PeerInfo[] = connections.map((conn) => ({
        peerId: conn.remotePeer.toString(),
        addrs: [conn.remoteAddr.toString()],
        direction: conn.direction,
        protocol: conn.multiplexer ?? "unknown",
      }));
      const allTopics = [...topicToGroupId.keys()];
      const totalSubscribers = allTopics.reduce(
        (sum, t) => sum + pubsub.getSubscribers(t).length,
        0,
      );
      return {
        peerId: node.peerId.toString(),
        multiaddrs: node.getMultiaddrs().map((ma) => ma.toString()),
        topic: allTopics.join(", "),
        peers,
        subscriberCount: totalSubscribers,
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

      const relayAddresses = relayPeers.length > 0
        ? relayPeers
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
    pingPeer: async (targetPeerId: string) => {
      const remotePeer = peerIdFromString(targetPeerId);
      const services = node.services as Record<string, unknown>;
      const pingService = services.ping as PingService | undefined;
      if (!pingService) throw new Error("Ping service not available");
      return pingService.ping(remotePeer);
    },
    addRelay: (addr: string) => {
      if (!relayPeers.includes(addr)) {
        relayPeers.push(addr);
        emit("info", `Relay added: ${addr.slice(0, 40)}...`);
      }
    },
    stop: async () => {
      relayPoolManager?.stop();
      groupDiscoveryManager?.stop();
      pubsub.removeEventListener("message", handlePubsubMessage);
      for (const topic of topicToGroupId.keys()) {
        pubsub.unsubscribe(topic);
      }
      topicToGroupId.clear();
      joinedGroups.length = 0;
      messageListeners.length = 0;
      joinRequestListeners.length = 0;
      peerChangeListeners.length = 0;
      eventListeners.length = 0;
      actionDags.clear();
      actionChainStates.clear();
      await node.stop();
    },
  };
};
