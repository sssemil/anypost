import { describe, it, expect } from "vitest";
import { generateAccountKey } from "../crypto/identity.js";
import { GENESIS_HASH, toHex } from "./action-chain.js";
import type { SignedAction } from "./action-chain.js";
import { createSignedActionEnvelope, verifyAndDecodeAction } from "./action-signing.js";
import {
  createActionDagState,
  appendAction,
  topologicalOrder,
  getTips,
} from "./action-dag.js";

const DEFAULT_GROUP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

const createTestAction = (options: {
  readonly parentHashes: readonly Uint8Array[];
  readonly text?: string;
  readonly timestamp?: number;
}): SignedAction => {
  const accountKey = generateAccountKey();
  const envelope = createSignedActionEnvelope({
    accountKey,
    groupId: DEFAULT_GROUP_ID,
    parentHashes: options.parentHashes,
    payload: { type: "message", text: options.text ?? "test" },
    timestamp: options.timestamp ?? Date.now(),
  });
  const result = verifyAndDecodeAction(envelope);
  if (!result.success) throw new Error("Failed to create test action");
  return result.data;
};

describe("Action DAG", () => {
  describe("createActionDagState", () => {
    it("should create an empty DAG with no actions and no tips", () => {
      const state = createActionDagState();

      expect(state.actions.size).toBe(0);
      expect(state.tipHashes.size).toBe(0);
    });
  });

  describe("appendAction", () => {
    it("should add an action to the DAG", () => {
      const action = createTestAction({ parentHashes: [GENESIS_HASH] });
      const state = createActionDagState();

      const newState = appendAction(state, action);

      expect(newState.actions.size).toBe(1);
      expect(newState.actions.has(toHex(action.hash))).toBe(true);
    });

    it("should track the new action as a tip", () => {
      const action = createTestAction({ parentHashes: [GENESIS_HASH] });
      const state = createActionDagState();

      const newState = appendAction(state, action);

      expect(newState.tipHashes.size).toBe(1);
      expect(newState.tipHashes.has(toHex(action.hash))).toBe(true);
    });

    it("should remove parent from tips when child is added", () => {
      const parent = createTestAction({
        parentHashes: [GENESIS_HASH],
        timestamp: 1000,
      });
      const state1 = appendAction(createActionDagState(), parent);

      const child = createTestAction({
        parentHashes: [parent.hash],
        timestamp: 2000,
      });
      const state2 = appendAction(state1, child);

      expect(state2.tipHashes.has(toHex(parent.hash))).toBe(false);
      expect(state2.tipHashes.has(toHex(child.hash))).toBe(true);
      expect(state2.tipHashes.size).toBe(1);
    });

    it("should handle concurrent actions with the same parent", () => {
      const parent = createTestAction({
        parentHashes: [GENESIS_HASH],
        timestamp: 1000,
      });
      const state1 = appendAction(createActionDagState(), parent);

      const child1 = createTestAction({
        parentHashes: [parent.hash],
        text: "concurrent-1",
        timestamp: 2000,
      });
      const child2 = createTestAction({
        parentHashes: [parent.hash],
        text: "concurrent-2",
        timestamp: 2000,
      });

      const state2 = appendAction(state1, child1);
      const state3 = appendAction(state2, child2);

      expect(state3.actions.size).toBe(3);
      expect(state3.tipHashes.size).toBe(2);
      expect(state3.tipHashes.has(toHex(child1.hash))).toBe(true);
      expect(state3.tipHashes.has(toHex(child2.hash))).toBe(true);
    });

    it("should not add duplicate actions", () => {
      const action = createTestAction({ parentHashes: [GENESIS_HASH] });
      const state1 = appendAction(createActionDagState(), action);
      const state2 = appendAction(state1, action);

      expect(state2).toBe(state1);
    });

    it("should not mutate the original state", () => {
      const action = createTestAction({ parentHashes: [GENESIS_HASH] });
      const state = createActionDagState();

      appendAction(state, action);

      expect(state.actions.size).toBe(0);
      expect(state.tipHashes.size).toBe(0);
    });
  });

  describe("getTips", () => {
    it("should return empty array for empty DAG", () => {
      const tips = getTips(createActionDagState());
      expect(tips).toEqual([]);
    });

    it("should return tip hashes as Uint8Array values", () => {
      const action = createTestAction({ parentHashes: [GENESIS_HASH] });
      const state = appendAction(createActionDagState(), action);

      const tips = getTips(state);

      expect(tips).toHaveLength(1);
      expect(tips[0]).toEqual(action.hash);
    });
  });

  describe("topologicalOrder", () => {
    it("should return empty array for empty DAG", () => {
      const order = topologicalOrder(createActionDagState());
      expect(order).toEqual([]);
    });

    it("should return single action for single-action DAG", () => {
      const action = createTestAction({ parentHashes: [GENESIS_HASH] });
      const state = appendAction(createActionDagState(), action);

      const order = topologicalOrder(state);

      expect(order).toHaveLength(1);
      expect(order[0].hash).toEqual(action.hash);
    });

    it("should return parent before child", () => {
      const parent = createTestAction({
        parentHashes: [GENESIS_HASH],
        timestamp: 1000,
      });
      const child = createTestAction({
        parentHashes: [parent.hash],
        timestamp: 2000,
      });

      let state = createActionDagState();
      state = appendAction(state, parent);
      state = appendAction(state, child);

      const order = topologicalOrder(state);

      expect(order).toHaveLength(2);
      expect(order[0].hash).toEqual(parent.hash);
      expect(order[1].hash).toEqual(child.hash);
    });

    it("should produce deterministic order for concurrent actions", () => {
      const parent = createTestAction({
        parentHashes: [GENESIS_HASH],
        timestamp: 1000,
      });
      const child1 = createTestAction({
        parentHashes: [parent.hash],
        text: "a",
        timestamp: 2000,
      });
      const child2 = createTestAction({
        parentHashes: [parent.hash],
        text: "b",
        timestamp: 2000,
      });

      let stateA = createActionDagState();
      stateA = appendAction(stateA, parent);
      stateA = appendAction(stateA, child1);
      stateA = appendAction(stateA, child2);

      let stateB = createActionDagState();
      stateB = appendAction(stateB, parent);
      stateB = appendAction(stateB, child2);
      stateB = appendAction(stateB, child1);

      const orderA = topologicalOrder(stateA);
      const orderB = topologicalOrder(stateB);

      expect(orderA.map((a) => toHex(a.hash))).toEqual(
        orderB.map((a) => toHex(a.hash)),
      );
    });

    it("should sort concurrent actions by timestamp then hash", () => {
      const parent = createTestAction({
        parentHashes: [GENESIS_HASH],
        timestamp: 1000,
      });

      const earlier = createTestAction({
        parentHashes: [parent.hash],
        text: "earlier",
        timestamp: 2000,
      });
      const later = createTestAction({
        parentHashes: [parent.hash],
        text: "later",
        timestamp: 3000,
      });

      let state = createActionDagState();
      state = appendAction(state, parent);
      state = appendAction(state, later);
      state = appendAction(state, earlier);

      const order = topologicalOrder(state);

      expect(order[0].hash).toEqual(parent.hash);
      expect(order[1].hash).toEqual(earlier.hash);
      expect(order[2].hash).toEqual(later.hash);
    });

    it("should handle a merge action that references two parents", () => {
      const root = createTestAction({
        parentHashes: [GENESIS_HASH],
        timestamp: 1000,
      });
      const branch1 = createTestAction({
        parentHashes: [root.hash],
        text: "branch1",
        timestamp: 2000,
      });
      const branch2 = createTestAction({
        parentHashes: [root.hash],
        text: "branch2",
        timestamp: 2000,
      });
      const merge = createTestAction({
        parentHashes: [branch1.hash, branch2.hash],
        text: "merge",
        timestamp: 3000,
      });

      let state = createActionDagState();
      state = appendAction(state, root);
      state = appendAction(state, branch1);
      state = appendAction(state, branch2);
      state = appendAction(state, merge);

      const order = topologicalOrder(state);

      expect(order).toHaveLength(4);
      expect(order[0].hash).toEqual(root.hash);

      const mergeIdx = order.findIndex(
        (a) => toHex(a.hash) === toHex(merge.hash),
      );
      const branch1Idx = order.findIndex(
        (a) => toHex(a.hash) === toHex(branch1.hash),
      );
      const branch2Idx = order.findIndex(
        (a) => toHex(a.hash) === toHex(branch2.hash),
      );

      expect(mergeIdx).toBeGreaterThan(branch1Idx);
      expect(mergeIdx).toBeGreaterThan(branch2Idx);
    });
  });
});
