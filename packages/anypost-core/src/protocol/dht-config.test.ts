import { describe, it, expect } from "vitest";
import {
  ANYPOST_RELAY_NAMESPACE,
  ANYPOST_CHAT_NAMESPACE,
  ANYPOST_GROUP_NAMESPACE_PREFIX,
  DEFAULT_TARGET_RELAY_POOL_SIZE,
  createProviderCid,
  createGroupProviderNamespace,
  createBrowserDhtConfig,
  createRelayDhtConfig,
} from "./dht-config.js";

describe("DHT config constants", () => {
  it("should define the relay namespace", () => {
    expect(ANYPOST_RELAY_NAMESPACE).toBe("anypost-relay");
  });

  it("should define the chat namespace", () => {
    expect(ANYPOST_CHAT_NAMESPACE).toBe("anypost/chat/1.0.0");
  });

  it("should define a target relay pool size of 4", () => {
    expect(DEFAULT_TARGET_RELAY_POOL_SIZE).toBe(4);
  });

  it("should define the group namespace prefix", () => {
    expect(ANYPOST_GROUP_NAMESPACE_PREFIX).toBe("anypost/group/");
  });
});

describe("createProviderCid", () => {
  it("should return a CID v1 with raw codec", async () => {
    const cid = await createProviderCid("test-namespace");

    expect(cid.version).toBe(1);
    expect(cid.code).toBe(0x55);
  });

  it("should be deterministic — same namespace produces same CID", async () => {
    const cid1 = await createProviderCid("anypost-relay");
    const cid2 = await createProviderCid("anypost-relay");

    expect(cid1.toString()).toBe(cid2.toString());
  });

  it("should produce different CIDs for different namespaces", async () => {
    const relayCid = await createProviderCid(ANYPOST_RELAY_NAMESPACE);
    const chatCid = await createProviderCid(ANYPOST_CHAT_NAMESPACE);

    expect(relayCid.toString()).not.toBe(chatCid.toString());
  });

  it("should produce a CID with SHA-256 multihash", async () => {
    const cid = await createProviderCid("test");

    expect(cid.multihash.code).toBe(0x12);
    expect(cid.multihash.digest.length).toBe(32);
  });
});

describe("createGroupProviderNamespace", () => {
  it("should concatenate the group prefix with the group ID", () => {
    const namespace = createGroupProviderNamespace("abc-123");

    expect(namespace).toBe("anypost/group/abc-123");
  });

  it("should produce different namespaces for different group IDs", () => {
    const ns1 = createGroupProviderNamespace("group-1");
    const ns2 = createGroupProviderNamespace("group-2");

    expect(ns1).not.toBe(ns2);
  });

  it("should produce different CIDs for different groups when used with createProviderCid", async () => {
    const ns1 = createGroupProviderNamespace("group-1");
    const ns2 = createGroupProviderNamespace("group-2");

    const cid1 = await createProviderCid(ns1);
    const cid2 = await createProviderCid(ns2);

    expect(cid1.toString()).not.toBe(cid2.toString());
  });
});

describe("createBrowserDhtConfig", () => {
  it("should set clientMode to true", () => {
    const config = createBrowserDhtConfig();

    expect(config.clientMode).toBe(true);
  });
});

describe("createRelayDhtConfig", () => {
  it("should set clientMode to false", () => {
    const config = createRelayDhtConfig();

    expect(config.clientMode).toBe(false);
  });
});
