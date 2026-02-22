import { describe, it, expect, afterEach } from "vitest";
import type { Libp2p, PubSub } from "@libp2p/interface";
import { createLibp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { identify } from "@libp2p/identify";
import { encodeWireMessage, decodeWireMessage } from "./codec.js";
import { groupTopic } from "./router.js";
import { createEncryptedMessage } from "../shared/factories.js";
import type { WireMessage } from "../shared/schemas.js";

const createTestNode = async (): Promise<Libp2p> =>
  createLibp2p({
    addresses: { listen: ["/ip4/127.0.0.1/tcp/0"] },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub({ allowPublishToZeroTopicPeers: true }),
    },
  });

const getPubSub = (node: Libp2p): PubSub =>
  node.services.pubsub as PubSub;

const waitForSubscription = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("GossipSub integration", () => {
  const nodes: Libp2p[] = [];

  afterEach(async () => {
    await Promise.all(nodes.map((n) => n.stop()));
    nodes.length = 0;
  });

  it("two nodes should exchange plaintext messages via GossipSub", async () => {
    const node1 = await createTestNode();
    const node2 = await createTestNode();
    nodes.push(node1, node2);

    const node2Addrs = node2.getMultiaddrs();
    await node1.dial(node2Addrs[0]);

    const topic = groupTopic("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
    const received: WireMessage[] = [];

    const pubsub1 = getPubSub(node1);
    const pubsub2 = getPubSub(node2);

    pubsub2.subscribe(topic);
    pubsub2.addEventListener("message", (event: CustomEvent) => {
      const detail = event.detail as { topic: string; data: Uint8Array };
      if (detail.topic === topic) {
        const result = decodeWireMessage(detail.data);
        if (result.success) {
          received.push(result.data);
        }
      }
    });

    pubsub1.subscribe(topic);
    await waitForSubscription(500);

    const message = createEncryptedMessage();
    const wireMessage: WireMessage = {
      type: "encrypted_message",
      payload: message,
    };
    const encoded = encodeWireMessage(wireMessage);

    await pubsub1.publish(topic, encoded);
    await waitForSubscription(500);

    expect(received.length).toBe(1);
    expect(received[0].type).toBe("encrypted_message");
    if (received[0].type === "encrypted_message") {
      expect(received[0].payload.id).toBe(message.id);
    }
  });
});
