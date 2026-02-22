import { describe, it, expect, afterEach } from "vitest";
import type { Libp2p } from "libp2p";
import { createRelayNode } from "./create-relay-node.js";

describe("createRelayNode", () => {
  let node: Libp2p | undefined;

  afterEach(async () => {
    if (node) {
      await node.stop();
      node = undefined;
    }
  });

  it("should return a started libp2p node", async () => {
    node = await createRelayNode();

    expect(node).toBeDefined();
    expect(node.peerId).toBeDefined();
    expect(node.status).toBe("started");
  });

  it("should listen on configured addresses", async () => {
    node = await createRelayNode({
      listenAddresses: ["/ip4/127.0.0.1/tcp/0/ws"],
    });

    const multiaddrs = node.getMultiaddrs();
    expect(multiaddrs.length).toBeGreaterThan(0);
  });

  it("should enable circuit relay server", async () => {
    node = await createRelayNode();

    expect(node.services.relay).toBeDefined();
  });

  it("should enable GossipSub service", async () => {
    node = await createRelayNode();

    expect(node.services.pubsub).toBeDefined();
  });

  it("should enable identify service", async () => {
    node = await createRelayNode();

    expect(node.services.identify).toBeDefined();
  });

  it("should use default listen addresses when none provided", async () => {
    node = await createRelayNode();

    expect(node.status).toBe("started");
  });

  it("should accept custom listen addresses", async () => {
    node = await createRelayNode({
      listenAddresses: [
        "/ip4/127.0.0.1/tcp/0",
        "/ip4/127.0.0.1/tcp/0/ws",
      ],
    });

    expect(node.status).toBe("started");
    const multiaddrs = node.getMultiaddrs();
    expect(multiaddrs.length).toBeGreaterThanOrEqual(2);
  });
});
