import { createLibp2p } from "libp2p";
import type { PubSub } from "@libp2p/interface";
import { tcp } from "@libp2p/tcp";
import { webSockets } from "@libp2p/websockets";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { identify } from "@libp2p/identify";
import { dcutr } from "@libp2p/dcutr";
import { bootstrap } from "@libp2p/bootstrap";
import type { Multiaddr } from "@multiformats/multiaddr";
import { groupTopic } from "./router.js";
import { encodeWireMessage, decodeWireMessage } from "./codec.js";
import { createEncryptedMessage } from "../shared/factories.js";
import type { GroupId, WireMessage } from "../shared/schemas.js";

type ChatMessageEvent = {
  readonly senderPeerId: string;
  readonly text: string;
  readonly timestamp: number;
  readonly id: string;
};

type MessageListener = (message: ChatMessageEvent) => void;

export type PlaintextChat = {
  readonly peerId: string;
  readonly multiaddrs: readonly Multiaddr[];
  readonly connectTo: (addr: Multiaddr) => Promise<void>;
  readonly sendMessage: (text: string) => Promise<void>;
  readonly onMessage: (listener: MessageListener) => void;
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

  const transports =
    useTransports === "tcp"
      ? [tcp()]
      : [webSockets(), circuitRelayTransport()];

  const peerDiscovery =
    bootstrapPeers.length > 0
      ? [bootstrap({ list: [...bootstrapPeers] })]
      : [];

  const node = await createLibp2p({
    addresses: { listen: [...listenAddresses] },
    transports,
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery,
    services: {
      identify: identify(),
      pubsub: gossipsub({ allowPublishToZeroTopicPeers: true }),
      ...(useTransports === "websocket" ? { dcutr: dcutr() } : {}),
    },
  });

  const topic = groupTopic(groupId);
  const pubsub = node.services.pubsub as PubSub;
  const listeners: MessageListener[] = [];

  pubsub.subscribe(topic);
  pubsub.addEventListener("message", (event: CustomEvent) => {
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
      text: new TextDecoder().decode(payload.ciphertext),
      timestamp: payload.timestamp,
    };

    listeners.forEach((listener) => listener(chatMessage));
  });

  return {
    peerId: node.peerId.toString(),
    get multiaddrs() {
      return node.getMultiaddrs();
    },
    connectTo: async (addr: Multiaddr) => {
      await node.dial(addr);
    },
    sendMessage: async (text: string) => {
      const payload = createEncryptedMessage({
        id: crypto.randomUUID(),
        groupId,
        channelId: DEFAULT_CHANNEL_ID,
        senderPeerId: node.peerId.toString(),
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
    },
    stop: async () => {
      await node.stop();
    },
  };
};
