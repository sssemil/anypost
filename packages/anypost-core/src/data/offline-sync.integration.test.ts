import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import { randomUUID } from "node:crypto";
import type { Libp2p } from "@libp2p/interface";
import { createLibp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { identify } from "@libp2p/identify";
import { createPersistedGroupDocument, openMessageContentStore } from "./persistence.js";
import { appendMessage, getChannelMessages } from "./group-document.js";
import { createYjsSyncProvider } from "./yjs-sync-provider.js";
import { createMessageRef, createMessageContent } from "../shared/factories.js";

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

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const TEST_CHANNEL_ID = "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22";

describe("Offline Sync Integration", () => {
  it("messages should persist after simulated page reload", async () => {
    const groupId = randomUUID();
    const first = await createPersistedGroupDocument(groupId);
    const store = await openMessageContentStore();

    try {
      const msgRef = createMessageRef({ id: randomUUID() });
      const msgContent = createMessageContent({ text: "Survives reload" });

      appendMessage(first.doc, TEST_CHANNEL_ID, msgRef);
      await store.put(msgRef.id, msgContent);
      await first.destroy();

      const second = await createPersistedGroupDocument(groupId);
      try {
        const messages = getChannelMessages(second.doc, TEST_CHANNEL_ID);
        expect(messages.length).toBe(1);
        expect(messages[0].id).toBe(msgRef.id);

        const content = await store.get(msgRef.id);
        expect(content).toEqual(msgContent);
      } finally {
        await second.destroy();
      }
    } finally {
      store.close();
    }
  });

  it("offline peer should see missed messages after reconnecting", async () => {
    const groupId = randomUUID();
    const nodeA = await createTestNode();
    const nodeB = await createTestNode();
    const persistedA = await createPersistedGroupDocument(groupId);
    const persistedB = await createPersistedGroupDocument(groupId);
    let providerA: ReturnType<typeof createYjsSyncProvider> | undefined;
    let providerB: ReturnType<typeof createYjsSyncProvider> | undefined;

    try {
      await nodeA.dial(nodeB.getMultiaddrs()[0]);

      providerA = createYjsSyncProvider({ node: nodeA, doc: persistedA.doc, groupId });
      providerB = createYjsSyncProvider({ node: nodeB, doc: persistedB.doc, groupId });
      providerA.start();
      providerB.start();
      await wait(500);

      const msg1 = createMessageRef({ id: randomUUID() });
      appendMessage(persistedA.doc, TEST_CHANNEL_ID, msg1);
      await wait(500);
      expect(getChannelMessages(persistedB.doc, TEST_CHANNEL_ID).length).toBe(1);

      providerB.stop();
      await nodeB.hangUp(nodeA.peerId);

      const msg2 = createMessageRef({ id: randomUUID() });
      const msg3 = createMessageRef({ id: randomUUID() });
      appendMessage(persistedA.doc, TEST_CHANNEL_ID, msg2);
      appendMessage(persistedA.doc, TEST_CHANNEL_ID, msg3);

      await nodeB.dial(nodeA.getMultiaddrs()[0]);
      providerB.start();
      await wait(500);
      await providerB.syncWithPeer(nodeA.peerId);

      const messagesB = getChannelMessages(persistedB.doc, TEST_CHANNEL_ID);
      expect(messagesB.length).toBe(3);
      expect(messagesB[0].id).toBe(msg1.id);
      expect(messagesB[1].id).toBe(msg2.id);
      expect(messagesB[2].id).toBe(msg3.id);
    } finally {
      providerA?.stop();
      providerB?.stop();
      await persistedA.destroy();
      await persistedB.destroy();
      await nodeA.stop();
      await nodeB.stop();
    }
  });

  it("synced messages should survive page reload on receiving peer", async () => {
    const groupId = randomUUID();
    const nodeA = await createTestNode();
    const nodeB = await createTestNode();
    const persistedA = await createPersistedGroupDocument(groupId);
    const persistedB1 = await createPersistedGroupDocument(groupId);
    let providerA: ReturnType<typeof createYjsSyncProvider> | undefined;
    let providerB1: ReturnType<typeof createYjsSyncProvider> | undefined;

    try {
      await nodeA.dial(nodeB.getMultiaddrs()[0]);

      providerA = createYjsSyncProvider({ node: nodeA, doc: persistedA.doc, groupId });
      providerB1 = createYjsSyncProvider({ node: nodeB, doc: persistedB1.doc, groupId });
      providerA.start();
      providerB1.start();
      await wait(500);

      const msgRef = createMessageRef({ id: randomUUID() });
      appendMessage(persistedA.doc, TEST_CHANNEL_ID, msgRef);
      await wait(500);

      expect(getChannelMessages(persistedB1.doc, TEST_CHANNEL_ID).length).toBe(1);

      providerB1.stop();
      await persistedB1.destroy();

      const persistedB2 = await createPersistedGroupDocument(groupId);
      try {
        const messages = getChannelMessages(persistedB2.doc, TEST_CHANNEL_ID);
        expect(messages.length).toBe(1);
        expect(messages[0].id).toBe(msgRef.id);
      } finally {
        await persistedB2.destroy();
      }
    } finally {
      providerA?.stop();
      await persistedA.destroy();
      await nodeA.stop();
      await nodeB.stop();
    }
  });
});
