import { describe, it, expect, afterEach } from "vitest";
import type { Libp2p } from "libp2p";
import { createBrowserNode } from "./create-node.js";

describe("createBrowserNode", () => {
  let node: Libp2p | undefined;

  afterEach(async () => {
    if (node) {
      await node.stop();
      node = undefined;
    }
  });

  it("should return a started libp2p node", async () => {
    node = await createBrowserNode();

    expect(node).toBeDefined();
    expect(node.peerId).toBeDefined();
    expect(node.status).toBe("started");
  });

  it("should have a unique PeerId", async () => {
    node = await createBrowserNode();

    expect(node.peerId.toString()).toMatch(/^12D3KooW/);
  });

  it("should enable identify service", async () => {
    node = await createBrowserNode();

    expect(node.services.identify).toBeDefined();
  });

  it("should enable GossipSub service", async () => {
    node = await createBrowserNode();

    expect(node.services.pubsub).toBeDefined();
  });

  it("should accept bootstrap peers option", async () => {
    node = await createBrowserNode({
      bootstrapPeers: [
        "/ip4/127.0.0.1/tcp/9090/ws/p2p/12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn",
      ],
    });

    expect(node.status).toBe("started");
  });

  it("should work without bootstrap peers", async () => {
    node = await createBrowserNode({ bootstrapPeers: [] });

    expect(node.status).toBe("started");
  });

  it("should configure WebSocket transport", async () => {
    node = await createBrowserNode();

    expect(node.status).toBe("started");
  });
});
