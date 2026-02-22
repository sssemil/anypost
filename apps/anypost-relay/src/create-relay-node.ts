import { createLibp2p } from "libp2p";
import type { Libp2p } from "libp2p";
import type { PubSub } from "@libp2p/interface";
import { tcp } from "@libp2p/tcp";
import { webSockets } from "@libp2p/websockets";
import { circuitRelayServer } from "@libp2p/circuit-relay-v2";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { identify } from "@libp2p/identify";
import { kadDHT } from "@libp2p/kad-dht";
import { ping } from "@libp2p/ping";
import { bootstrap } from "@libp2p/bootstrap";
import { IPFS_BOOTSTRAP_TCP_PEERS } from "anypost-core/libp2p";
import {
  generateKeyPair,
  privateKeyFromProtobuf,
  privateKeyToProtobuf,
} from "@libp2p/crypto/keys";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

type CreateRelayNodeOptions = {
  readonly listenAddresses?: readonly string[];
  readonly keyPath?: string;
};

const DEFAULT_TCP_PORT = process.env.RELAY_TCP_PORT ?? "9001";
const DEFAULT_WS_PORT = process.env.RELAY_WS_PORT ?? "9090";
const DEFAULT_KEY_PATH = join("data", "relay-identity.key");

const DEFAULT_LISTEN_ADDRESSES = [
  `/ip4/0.0.0.0/tcp/${DEFAULT_TCP_PORT}`,
  `/ip4/0.0.0.0/tcp/${DEFAULT_WS_PORT}/ws`,
] as const;

const loadOrCreateKey = async (keyPath: string) => {
  try {
    const buf = await readFile(keyPath);
    return privateKeyFromProtobuf(buf);
  } catch {
    const key = await generateKeyPair("Ed25519");
    await mkdir(dirname(keyPath), { recursive: true });
    await writeFile(keyPath, privateKeyToProtobuf(key));
    return key;
  }
};

export const createRelayNode = async (
  options: CreateRelayNodeOptions = {},
): Promise<Libp2p> => {
  const {
    listenAddresses = DEFAULT_LISTEN_ADDRESSES,
    keyPath = DEFAULT_KEY_PATH,
  } = options;

  const privateKey = await loadOrCreateKey(keyPath);

  const node = await createLibp2p({
    privateKey,
    addresses: {
      listen: [...listenAddresses],
    },
    transports: [tcp(), webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery: [
      bootstrap({ list: [...IPFS_BOOTSTRAP_TCP_PEERS] }),
    ],
    services: {
      identify: identify(),
      pubsub: gossipsub({ canRelayMessage: true }),
      relay: circuitRelayServer({
        reservations: { maxReservations: 128 },
      }),
      ping: ping(),
      dht: kadDHT({ clientMode: false }),
    },
  });

  const pubsub = node.services.pubsub as PubSub;

  pubsub.addEventListener("subscription-change", (event: CustomEvent) => {
    const detail = event.detail as {
      peerId: { toString(): string };
      subscriptions: ReadonlyArray<{ topic: string; subscribe: boolean }>;
    };
    const peer = detail.peerId.toString().slice(0, 16);
    for (const { topic, subscribe } of detail.subscriptions) {
      if (subscribe) {
        if (!pubsub.getTopics().includes(topic)) {
          pubsub.subscribe(topic);
          console.log(`[relay] Auto-subscribed to topic: ${topic.slice(0, 32)}...`);
        }
        console.log(`[relay] Peer ${peer}... subscribed to topic`);
      } else {
        console.log(`[relay] Peer ${peer}... unsubscribed from topic`);
      }
    }
  });

  node.addEventListener("peer:connect", (event: CustomEvent) => {
    const peerId = event.detail as { toString(): string };
    console.log(`[relay] Peer connected: ${peerId.toString().slice(0, 20)}...`);
  });

  node.addEventListener("peer:disconnect", (event: CustomEvent) => {
    const peerId = event.detail as { toString(): string };
    console.log(`[relay] Peer disconnected: ${peerId.toString().slice(0, 20)}...`);
  });

  return node;
};
