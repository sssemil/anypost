import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import type { Libp2p, PubSub } from "@libp2p/interface";
import { createLibp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { identify } from "@libp2p/identify";
import { createYjsSyncProvider } from "./yjs-sync-provider.js";
import type { YjsSyncProvider } from "./yjs-sync-provider.js";

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

const TEST_GROUP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

describe("Yjs Sync Provider", () => {
  it("should apply received GossipSub updates to local doc", async () => {
    const nodeA = await createTestNode();
    const nodeB = await createTestNode();
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    try {
      await nodeA.dial(nodeB.getMultiaddrs()[0]);

      const providerA = createYjsSyncProvider({ node: nodeA, doc: docA, groupId: TEST_GROUP_ID });
      const providerB = createYjsSyncProvider({ node: nodeB, doc: docB, groupId: TEST_GROUP_ID });
      providerA.start();
      providerB.start();

      await wait(500);

      docA.getArray("messages").push([{ id: "m1", text: "Hello" }]);

      await wait(500);

      expect(docB.getArray("messages").length).toBe(1);
      expect(docB.getArray("messages").get(0)).toEqual({ id: "m1", text: "Hello" });

      providerA.stop();
      providerB.stop();
    } finally {
      docA.destroy();
      docB.destroy();
      await nodeA.stop();
      await nodeB.stop();
    }
  });

  it("should sync existing state when peer requests catch-up", async () => {
    const nodeA = await createTestNode();
    const nodeB = await createTestNode();
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    try {
      docA.getArray("messages").push([
        { id: "m1", text: "Before connect" },
        { id: "m2", text: "Also before" },
      ]);

      await nodeA.dial(nodeB.getMultiaddrs()[0]);

      const providerA = createYjsSyncProvider({ node: nodeA, doc: docA, groupId: TEST_GROUP_ID });
      const providerB = createYjsSyncProvider({ node: nodeB, doc: docB, groupId: TEST_GROUP_ID });
      providerA.start();
      providerB.start();

      await wait(500);

      await providerB.syncWithPeer(nodeA.peerId);

      expect(docB.getArray("messages").length).toBe(2);
      expect(docB.getArray("messages").get(0)).toEqual({ id: "m1", text: "Before connect" });
    } finally {
      docA.destroy();
      docB.destroy();
      await nodeA.stop();
      await nodeB.stop();
    }
  });

  it("should send missing updates when peer sends state vector", async () => {
    const nodeA = await createTestNode();
    const nodeB = await createTestNode();
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    try {
      docA.getArray("messages").push([{ id: "m1", text: "First" }]);

      const sharedUpdate = Y.encodeStateAsUpdate(docA);
      Y.applyUpdate(docB, sharedUpdate);

      docA.getArray("messages").push([{ id: "m2", text: "Second (only on A)" }]);

      await nodeA.dial(nodeB.getMultiaddrs()[0]);

      const providerA = createYjsSyncProvider({ node: nodeA, doc: docA, groupId: TEST_GROUP_ID });
      const providerB = createYjsSyncProvider({ node: nodeB, doc: docB, groupId: TEST_GROUP_ID });
      providerA.start();
      providerB.start();

      await wait(500);

      await providerB.syncWithPeer(nodeA.peerId);

      expect(docB.getArray("messages").length).toBe(2);
      expect(docB.getArray("messages").get(1)).toEqual({ id: "m2", text: "Second (only on A)" });
    } finally {
      docA.destroy();
      docB.destroy();
      await nodeA.stop();
      await nodeB.stop();
    }
  });

  it("should handle concurrent updates from multiple peers", async () => {
    const nodeA = await createTestNode();
    const nodeB = await createTestNode();
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    try {
      await nodeA.dial(nodeB.getMultiaddrs()[0]);

      const providerA = createYjsSyncProvider({ node: nodeA, doc: docA, groupId: TEST_GROUP_ID });
      const providerB = createYjsSyncProvider({ node: nodeB, doc: docB, groupId: TEST_GROUP_ID });
      providerA.start();
      providerB.start();

      await wait(500);

      docA.getArray("messages").push([{ id: "fromA", text: "From A" }]);
      docB.getArray("messages").push([{ id: "fromB", text: "From B" }]);

      await wait(500);

      expect(docA.getArray("messages").length).toBe(2);
      expect(docB.getArray("messages").length).toBe(2);

      const idsA = docA.getArray("messages").toArray().map((m: { id: string }) => m.id).sort();
      const idsB = docB.getArray("messages").toArray().map((m: { id: string }) => m.id).sort();
      expect(idsA).toEqual(idsB);

      providerA.stop();
      providerB.stop();
    } finally {
      docA.destroy();
      docB.destroy();
      await nodeA.stop();
      await nodeB.stop();
    }
  });

  it("offline peer should catch up after reconnect", async () => {
    const nodeA = await createTestNode();
    const nodeB = await createTestNode();
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    try {
      await nodeA.dial(nodeB.getMultiaddrs()[0]);

      const providerA = createYjsSyncProvider({ node: nodeA, doc: docA, groupId: TEST_GROUP_ID });
      const providerB = createYjsSyncProvider({ node: nodeB, doc: docB, groupId: TEST_GROUP_ID });
      providerA.start();
      providerB.start();

      await wait(500);

      docA.getArray("messages").push([{ id: "m1", text: "Before disconnect" }]);
      await wait(500);
      expect(docB.getArray("messages").length).toBe(1);

      providerB.stop();
      await nodeB.hangUp(nodeA.peerId);

      docA.getArray("messages").push([{ id: "m2", text: "While offline" }]);
      docA.getArray("messages").push([{ id: "m3", text: "Also offline" }]);

      await nodeB.dial(nodeA.getMultiaddrs()[0]);
      providerB.start();
      await wait(500);

      await providerB.syncWithPeer(nodeA.peerId);

      expect(docB.getArray("messages").length).toBe(3);
      expect(docB.getArray("messages").get(1)).toEqual({ id: "m2", text: "While offline" });
      expect(docB.getArray("messages").get(2)).toEqual({ id: "m3", text: "Also offline" });

      providerA.stop();
      providerB.stop();
    } finally {
      docA.destroy();
      docB.destroy();
      await nodeA.stop();
      await nodeB.stop();
    }
  });
});
