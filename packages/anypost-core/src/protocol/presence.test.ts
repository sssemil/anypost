import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createPresenceTracker,
  recordHeartbeat,
  getOnlineMembers,
  isOnline,
  recordTypingStart,
  getTypingMembers,
} from "./presence.js";

const HEARTBEAT_TIMEOUT_MS = 30_000;
const TYPING_TIMEOUT_MS = 5_000;

describe("Presence Tracker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should start with no online members", () => {
    const tracker = createPresenceTracker();

    expect(getOnlineMembers(tracker)).toHaveLength(0);
  });

  it("should mark a peer as online after heartbeat", () => {
    const tracker = createPresenceTracker();

    const updated = recordHeartbeat(tracker, "peer1");

    expect(getOnlineMembers(updated)).toHaveLength(1);
    expect(isOnline(updated, "peer1")).toBe(true);
  });

  it("should track multiple online peers", () => {
    let tracker = createPresenceTracker();

    tracker = recordHeartbeat(tracker, "peer1");
    tracker = recordHeartbeat(tracker, "peer2");
    tracker = recordHeartbeat(tracker, "peer3");

    expect(getOnlineMembers(tracker)).toHaveLength(3);
  });

  it("should timeout peer after 30 seconds without heartbeat", () => {
    vi.useFakeTimers();
    let tracker = createPresenceTracker();

    tracker = recordHeartbeat(tracker, "peer1");
    expect(isOnline(tracker, "peer1")).toBe(true);

    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS + 1);

    expect(isOnline(tracker, "peer1")).toBe(false);
    expect(getOnlineMembers(tracker)).toHaveLength(0);
  });

  it("should keep peer online if heartbeat refreshed within timeout", () => {
    vi.useFakeTimers();
    let tracker = createPresenceTracker();

    tracker = recordHeartbeat(tracker, "peer1");
    vi.advanceTimersByTime(20_000);
    tracker = recordHeartbeat(tracker, "peer1");
    vi.advanceTimersByTime(20_000);

    expect(isOnline(tracker, "peer1")).toBe(true);
  });

  it("should return false for unknown peer", () => {
    const tracker = createPresenceTracker();

    expect(isOnline(tracker, "unknown-peer")).toBe(false);
  });
});

describe("Typing Tracker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should track a typing peer", () => {
    const tracker = createPresenceTracker();

    const updated = recordTypingStart(tracker, "channel1", "peer1");

    expect(getTypingMembers(updated, "channel1")).toEqual(["peer1"]);
  });

  it("should track multiple typing peers in the same channel", () => {
    let tracker = createPresenceTracker();

    tracker = recordTypingStart(tracker, "channel1", "peer1");
    tracker = recordTypingStart(tracker, "channel1", "peer2");

    expect(getTypingMembers(tracker, "channel1")).toHaveLength(2);
  });

  it("should auto-expire typing after 5 seconds", () => {
    vi.useFakeTimers();
    let tracker = createPresenceTracker();

    tracker = recordTypingStart(tracker, "channel1", "peer1");
    expect(getTypingMembers(tracker, "channel1")).toHaveLength(1);

    vi.advanceTimersByTime(TYPING_TIMEOUT_MS + 1);

    expect(getTypingMembers(tracker, "channel1")).toHaveLength(0);
  });

  it("should return empty array for channel with no typing peers", () => {
    const tracker = createPresenceTracker();

    expect(getTypingMembers(tracker, "unknown-channel")).toEqual([]);
  });

  it("should isolate typing state between channels", () => {
    let tracker = createPresenceTracker();

    tracker = recordTypingStart(tracker, "channel1", "peer1");
    tracker = recordTypingStart(tracker, "channel2", "peer2");

    expect(getTypingMembers(tracker, "channel1")).toEqual(["peer1"]);
    expect(getTypingMembers(tracker, "channel2")).toEqual(["peer2"]);
  });
});
