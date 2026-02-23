import { describe, it, expect } from "vitest";
import {
  createRelayReservationManager,
  DEFAULT_TARGET_ACTIVE_RELAYS,
} from "./relay-reservation-manager.js";

describe("relay reservation manager", () => {
  it("should request reservations up to target active count", () => {
    let nowMs = 0;
    const manager = createRelayReservationManager({ now: () => nowMs });

    expect(manager.getState().targetActive).toBe(DEFAULT_TARGET_ACTIVE_RELAYS);

    manager.ingestCandidate("relay-a", ["/dns4/a/tcp/443/wss/p2p/relay-a"]);
    manager.ingestCandidate("relay-b", ["/dns4/b/tcp/443/wss/p2p/relay-b"]);
    manager.ingestCandidate("relay-c", ["/dns4/c/tcp/443/wss/p2p/relay-c"]);
    manager.ingestCandidate("relay-d", ["/dns4/d/tcp/443/wss/p2p/relay-d"]);

    const requests = manager.getDialRequests();
    expect(requests).toHaveLength(3);
    expect(requests.every((r) => r.reason === "acquire")).toBe(true);

    for (const request of requests) {
      manager.markReservationObserved(request.peerId);
    }

    const activeCount = [...manager.getState().entries.values()].filter((e) => e.status === "active").length;
    expect(activeCount).toBe(3);
  });

  it("should trigger renewal after renew threshold", () => {
    let nowMs = 0;
    const manager = createRelayReservationManager({
      now: () => nowMs,
      targetActive: 1,
      reservationTtlMs: 1_000,
      renewAtFraction: 0.7,
    });

    manager.ingestCandidate("relay-a", ["/dns4/a/tcp/443/wss/p2p/relay-a"]);

    const acquire = manager.getDialRequests();
    expect(acquire).toHaveLength(1);
    expect(acquire[0].reason).toBe("acquire");
    manager.markReservationObserved("relay-a");

    nowMs = 699;
    expect(manager.getDialRequests()).toHaveLength(0);

    nowMs = 700;
    const renew = manager.getDialRequests();
    expect(renew).toHaveLength(1);
    expect(renew[0].reason).toBe("renew");
  });

  it("should rotate after repeated failures and stale attempts", () => {
    let nowMs = 0;
    const manager = createRelayReservationManager({
      now: () => nowMs,
      targetActive: 1,
      baseBackoffMs: 5,
      maxBackoffMs: 5,
      dialAttemptTimeoutMs: 10,
    });

    manager.ingestCandidate("relay-a", ["/dns4/a/tcp/443/wss/p2p/relay-a"]);

    const firstAcquire = manager.getDialRequests();
    expect(firstAcquire).toHaveLength(1);
    manager.markReservationObserved("relay-a");

    manager.markReservationLost("relay-a");

    nowMs = 6;
    const secondAcquire = manager.getDialRequests();
    expect(secondAcquire).toHaveLength(1);
    expect(secondAcquire[0].reason).toBe("acquire");

    nowMs = 30;
    expect(manager.getDialRequests()).toHaveLength(0);

    nowMs = 36;
    const rotateAttempt = manager.getDialRequests();
    expect(rotateAttempt).toHaveLength(1);
    expect(rotateAttempt[0].reason).toBe("rotate");

    expect(manager.getState().rotationCount).toBeGreaterThanOrEqual(1);
  });

  it("should persist best relay hints ordered by status and RTT", () => {
    let nowMs = 0;
    const manager = createRelayReservationManager({ now: () => nowMs, targetActive: 2 });

    manager.ingestCandidate("relay-a", ["/dns4/a/tcp/443/wss/p2p/relay-a"]);
    manager.ingestCandidate("relay-b", ["/dns4/b/tcp/443/wss/p2p/relay-b"]);
    manager.ingestCandidate("relay-c", ["/dns4/c/tcp/443/wss/p2p/relay-c"]);

    manager.updateRtt("relay-a", 100);
    manager.updateRtt("relay-b", 40);
    manager.updateRtt("relay-c", 20);

    const acquire = manager.getDialRequests();
    manager.markReservationObserved(acquire[0].peerId);
    manager.markReservationObserved(acquire[1].peerId);

    const hints = manager.getPersistableRelayHints(3);
    expect(hints).toHaveLength(3);
    expect(hints[0]).toContain("relay-");

    const firstPeer = hints[0].split("/p2p/")[1];
    const secondPeer = hints[1].split("/p2p/")[1];
    const activePeers = new Set(
      [...manager.getState().entries.values()].filter((e) => e.status === "active").map((e) => e.peerId),
    );

    expect(activePeers.has(firstPeer)).toBe(true);
    expect(activePeers.has(secondPeer)).toBe(true);
  });
});
