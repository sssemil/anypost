// Polyfill for Node 20 (Promise.withResolvers is Node 22+)
if (typeof Promise.withResolvers !== "function") {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

// Polyfill for Node 20 (global WebSocket is Node 22+)
if (typeof globalThis.WebSocket === "undefined") {
  const { WebSocket } = await import("ws");
  globalThis.WebSocket = WebSocket;
}

// Polyfill: multiaddr v13 removed .tuples() but gossipsub v14 still calls it.
// Patch the Multiaddr prototype to add .tuples() using getComponents().
const { multiaddr } = await import("@multiformats/multiaddr");
const testMa = multiaddr("/ip4/127.0.0.1");
const proto = Object.getPrototypeOf(testMa);
if (typeof proto.tuples !== "function") {
  proto.tuples = function () {
    return this.getComponents().map((c) => {
      if (c.value != null && (c.code === 4 || c.code === 41)) {
        // IP4 or IP6 — convert string to bytes for gossipsub's score tracking
        if (c.code === 4) {
          const parts = c.value.split(".").map(Number);
          return [c.code, Uint8Array.from(parts)];
        }
        // IP6 — just return the code; gossipsub only uses ip4/ip6 for scoring
        return [c.code, new Uint8Array(16)];
      }
      return c.value != null ? [c.code, new TextEncoder().encode(c.value)] : [c.code];
    });
  };
}
