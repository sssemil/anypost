import { describe, it, expect } from "vitest";
import {
  createRelayCandidateState,
  addCandidate,
  removeCandidate,
  updateRtt,
  markReservationActive,
  markReservationLost,
  getReservedCount,
  getCandidatesByRtt,
  getCandidateAddresses,
  DEFAULT_MAX_CANDIDATES,
} from "./relay-candidate-state.js";

describe("Relay candidate state", () => {
  it("should create empty state with defaults", () => {
    const state = createRelayCandidateState();

    expect(state.candidates.size).toBe(0);
    expect(state.maxCandidates).toBe(DEFAULT_MAX_CANDIDATES);
  });

  it("should create state with custom maxCandidates", () => {
    const state = createRelayCandidateState({ maxCandidates: 5 });

    expect(state.maxCandidates).toBe(5);
  });

  it("should add a relay candidate with addresses", () => {
    const state = createRelayCandidateState();
    const addresses = ["/ip4/1.2.3.4/tcp/9090/ws"];

    const next = addCandidate(state, "peer-a", addresses, 1000);

    expect(next.candidates.size).toBe(1);
    const entry = next.candidates.get("peer-a");
    expect(entry).toBeDefined();
    expect(entry!.peerId).toBe("peer-a");
    expect(entry!.addresses).toEqual(addresses);
    expect(entry!.rttMs).toBeNull();
    expect(entry!.discoveredAt).toBe(1000);
    expect(entry!.hasReservation).toBe(false);
  });

  it("should deduplicate candidates by peerId", () => {
    const state = createRelayCandidateState();
    const first = addCandidate(state, "peer-a", ["/ws/addr1"], 1000);
    const second = addCandidate(first, "peer-a", ["/ws/addr2"], 2000);

    expect(second.candidates.size).toBe(1);
    expect(second.candidates.get("peer-a")!.addresses).toEqual(["/ws/addr2"]);
  });

  it("should remove a candidate", () => {
    const state = createRelayCandidateState();
    const withCandidate = addCandidate(state, "peer-a", ["/ws/addr1"], 1000);

    const next = removeCandidate(withCandidate, "peer-a");

    expect(next.candidates.size).toBe(0);
  });

  it("should return same state when removing unknown peerId", () => {
    const state = createRelayCandidateState();

    const next = removeCandidate(state, "nonexistent");

    expect(next).toBe(state);
  });

  it("should evict oldest non-reserved candidate when at max capacity", () => {
    const state = createRelayCandidateState({ maxCandidates: 2 });
    const s1 = addCandidate(state, "peer-old", ["/ws/old"], 100);
    const s2 = addCandidate(s1, "peer-mid", ["/ws/mid"], 200);

    const s3 = addCandidate(s2, "peer-new", ["/ws/new"], 300);

    expect(s3.candidates.size).toBe(2);
    expect(s3.candidates.has("peer-old")).toBe(false);
    expect(s3.candidates.has("peer-mid")).toBe(true);
    expect(s3.candidates.has("peer-new")).toBe(true);
  });

  it("should preserve reserved candidates during eviction", () => {
    const state = createRelayCandidateState({ maxCandidates: 2 });
    const s1 = addCandidate(state, "peer-reserved", ["/ws/r"], 100);
    const s2 = markReservationActive(s1, "peer-reserved");
    const s3 = addCandidate(s2, "peer-mid", ["/ws/mid"], 200);

    const s4 = addCandidate(s3, "peer-new", ["/ws/new"], 300);

    expect(s4.candidates.has("peer-reserved")).toBe(true);
    expect(s4.candidates.has("peer-mid")).toBe(false);
    expect(s4.candidates.has("peer-new")).toBe(true);
  });

  it("should update RTT for a candidate", () => {
    const state = createRelayCandidateState();
    const s1 = addCandidate(state, "peer-a", ["/ws/a"], 1000);

    const s2 = updateRtt(s1, "peer-a", 42);

    expect(s2.candidates.get("peer-a")!.rttMs).toBe(42);
  });

  it("should return same state when updating RTT for unknown peer", () => {
    const state = createRelayCandidateState();

    const next = updateRtt(state, "nonexistent", 42);

    expect(next).toBe(state);
  });

  it("should mark reservation active", () => {
    const state = createRelayCandidateState();
    const s1 = addCandidate(state, "peer-a", ["/ws/a"], 1000);

    const s2 = markReservationActive(s1, "peer-a");

    expect(s2.candidates.get("peer-a")!.hasReservation).toBe(true);
  });

  it("should return same state when marking reservation for unknown peer", () => {
    const state = createRelayCandidateState();

    const next = markReservationActive(state, "nonexistent");

    expect(next).toBe(state);
  });

  it("should mark reservation lost", () => {
    const state = createRelayCandidateState();
    const s1 = addCandidate(state, "peer-a", ["/ws/a"], 1000);
    const s2 = markReservationActive(s1, "peer-a");

    const s3 = markReservationLost(s2, "peer-a");

    expect(s3.candidates.get("peer-a")!.hasReservation).toBe(false);
  });

  it("should count reserved candidates", () => {
    const state = createRelayCandidateState();
    const s1 = addCandidate(state, "peer-a", ["/ws/a"], 1000);
    const s2 = addCandidate(s1, "peer-b", ["/ws/b"], 2000);
    const s3 = markReservationActive(s2, "peer-a");

    expect(getReservedCount(s3)).toBe(1);
  });

  it("should return candidates sorted by RTT, nulls last", () => {
    const state = createRelayCandidateState();
    const s1 = addCandidate(state, "peer-slow", ["/ws/slow"], 1000);
    const s2 = addCandidate(s1, "peer-fast", ["/ws/fast"], 2000);
    const s3 = addCandidate(s2, "peer-none", ["/ws/none"], 3000);
    const s4 = updateRtt(s3, "peer-slow", 200);
    const s5 = updateRtt(s4, "peer-fast", 30);

    const sorted = getCandidatesByRtt(s5);

    expect(sorted[0].peerId).toBe("peer-fast");
    expect(sorted[1].peerId).toBe("peer-slow");
    expect(sorted[2].peerId).toBe("peer-none");
  });

  it("should return all candidate addresses flattened", () => {
    const state = createRelayCandidateState();
    const s1 = addCandidate(state, "peer-a", ["/ws/a1", "/ws/a2"], 1000);
    const s2 = addCandidate(s1, "peer-b", ["/ws/b1"], 2000);

    const addresses = getCandidateAddresses(s2);

    expect(addresses).toEqual(["/ws/a1", "/ws/a2", "/ws/b1"]);
  });

  it("should preserve existing RTT when re-adding a candidate", () => {
    const state = createRelayCandidateState();
    const s1 = addCandidate(state, "peer-a", ["/ws/a"], 1000);
    const s2 = updateRtt(s1, "peer-a", 42);

    const s3 = addCandidate(s2, "peer-a", ["/ws/a-new"], 2000);

    expect(s3.candidates.get("peer-a")!.rttMs).toBe(42);
    expect(s3.candidates.get("peer-a")!.discoveredAt).toBe(1000);
  });
});
