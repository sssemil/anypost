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

const CHANNEL_ID = "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22";

describe("Offline Sync Integration", () => {
  it("messages should persist after simulated page reload", async () => {
    const groupId = randomUUID();
    const first = await createPersistedGroupDocument(groupId);
    const store = await openMessageContentStore();

    const msgRef = createMessageRef();
    const msgContent = createMessageContent({ text: "Survives reload" });

    appendMessage(first.doc, CHANNEL_ID, msgRef);
    await store.put(msgRef.id, msgContent);
    await first.destroy();

    const second = await createPersistedGroupDocument(groupId);
    try {
      const messages = getChannelMessages(second.doc, CHANNEL_ID);
      expect(messages.length).toBe(1);
      expect(messages[0].id).toBe(msgRef.id);

      const content = await store.get(msgRef.id);
      expect(content).toEqual(msgContent);
    } finally {
      await second.destroy();
      store.close();
    }
  });

  it("offline peer should see missed messages after reconnecting", async () => {
    const groupId = randomUUID();
    const nodeA = await createTestNode();
    const nodeB = await createTestNode();
    const persistedA = await createPersistedGroupDocument(groupId);
    const persistedB = await createPersistedGroupDocument(groupId);

    try {
      await nodeA.dial(nodeB.getMultiaddrs()[0]);

      const providerA = createYjsSyncProvider({ node: nodeA, doc: persistedA.doc, groupId });
      const providerB = createYjsSyncProvider({ node: nodeB, doc: persistedB.doc, groupId });
      providerA.start();
      providerB.start();
      await wait(500);

      const msg1 = createMessageRef();
      appendMessage(persistedA.doc, CHANNEL_ID, msg1);
      await wait(500);
      expect(getChannelMessages(persistedB.doc, CHANNEL_ID).length).toBe(1);

      providerB.stop();
      await nodeB.hangUp(nodeA.peerId);

      const msg2 = createMessageRef();
      const msg3 = createMessageRef();
      appendMessage(persistedA.doc, CHANNEL_ID, msg2);
      appendMessage(persistedA.doc, CHANNEL_ID, msg3);

      await nodeB.dial(nodeA.getMultiaddrs()[0]);
      providerB.start();
      await wait(500);
      await providerB.syncWithPeer(nodeA.peerId);

      const messagesB = getChannelMessages(persistedB.doc, CHANNEL_ID);
      expect(messagesB.length).toBe(3);
      expect(messagesB[1].id).toBe(msg2.id);
      expect(messagesB[2].id).toBe(msg3.id);

      providerA.stop();
      providerB.stop();
    } finally {
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

    try {
      await nodeA.dial(nodeB.getMultiaddrs()[0]);

      const providerA = createYjsSyncProvider({ node: nodeA, doc: persistedA.doc, groupId });
      const providerB1 = createYjsSyncProvider({ node: nodeB, doc: persistedB1.doc, groupId });
      providerA.start();
      providerB1.start();
      await wait(500);

      const msgRef = createMessageRef();
      appendMessage(persistedA.doc, CHANNEL_ID, msgRef);
      await wait(500);

      expect(getChannelMessages(persistedB1.doc, CHANNEL_ID).length).toBe(1);

      providerB1.stop();
      await persistedB1.destroy();

      const persistedB2 = await createPersistedGroupDocument(groupId);
      try {
        const messages = getChannelMessages(persistedB2.doc, CHANNEL_ID);
        expect(messages.length).toBe(1);
        expect(messages[0].id).toBe(msgRef.id);
      } finally {
        await persistedB2.destroy();
      }

      providerA.stop();
    } finally {
      await persistedA.destroy();
      await nodeA.stop();
      await nodeB.stop();
    }
  });
});
