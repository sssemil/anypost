import { describe, expect, it } from "vitest";
import { createDefaultRuntimeAdapter, isBrowserRuntimeProfile } from "./runtime-adapter.js";

describe("createDefaultRuntimeAdapter", () => {
  it("treats android as relay-capable browser runtime", () => {
    const adapter = createDefaultRuntimeAdapter("android");
    const peers = adapter.resolveBootstrapPeers([]);

    expect(adapter.profile).toBe("android");
    expect(adapter.relayCapable).toBe(true);
    expect(adapter.targetActiveRelays).toBe(5);
    expect(peers.some((addr) => addr.includes("/wss/"))).toBe(true);
    expect(peers.some((addr) => addr.includes("/dnsaddr/bootstrap.libp2p.io"))).toBe(false);
  });

  it("includes both wss and tcp bootstrap peers for desktop profile", () => {
    const adapter = createDefaultRuntimeAdapter("desktop");
    const peers = adapter.resolveBootstrapPeers([]);

    expect(adapter.relayCapable).toBe(true);
    expect(adapter.targetActiveRelays).toBe(6);
    expect(peers.some((addr) => addr.includes("/wss/"))).toBe(true);
    expect(peers.some((addr) => addr.includes("/dnsaddr/bootstrap.libp2p.io"))).toBe(true);
  });

  it("deduplicates bootstrap peers while preserving first occurrence", () => {
    const adapter = createDefaultRuntimeAdapter("websocket");
    const first = "/dns4/example.com/tcp/443/wss/p2p/12D3KooWExample";
    const peers = adapter.resolveBootstrapPeers([first, first, ""]);

    expect(peers.filter((value) => value === first)).toHaveLength(1);
  });
});

describe("isBrowserRuntimeProfile", () => {
  it("matches websocket and android only", () => {
    expect(isBrowserRuntimeProfile("websocket")).toBe(true);
    expect(isBrowserRuntimeProfile("android")).toBe(true);
    expect(isBrowserRuntimeProfile("desktop")).toBe(false);
    expect(isBrowserRuntimeProfile("tcp")).toBe(false);
  });
});
