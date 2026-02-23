import { describe, it, expect } from "vitest";
import {
  serializeActionChains,
  deserializeActionChains,
} from "./action-chain-persistence.js";
import {
  createSignedActionEnvelope,
  GENESIS_HASH,
} from "anypost-core/protocol";
import { generateAccountKey } from "anypost-core/crypto";

const GROUP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

const createGenesisEnvelope = () => {
  const accountKey = generateAccountKey();
  return createSignedActionEnvelope({
    accountKey,
    groupId: GROUP_ID,
    parentHashes: [GENESIS_HASH],
    payload: { type: "group-created", groupName: "Test Group" },
  });
};

describe("Action chain persistence", () => {
  describe("serializeActionChains", () => {
    it("should serialize empty chains to valid JSON", () => {
      const json = serializeActionChains(new Map());
      const parsed = JSON.parse(json);

      expect(parsed).toEqual({});
    });

    it("should serialize a single group with one envelope", () => {
      const envelope = createGenesisEnvelope();
      const chains = new Map([[GROUP_ID, [envelope]]]);

      const json = serializeActionChains(chains);
      const parsed = JSON.parse(json);

      expect(parsed[GROUP_ID]).toHaveLength(1);
      expect(typeof parsed[GROUP_ID][0].signedBytes).toBe("string");
      expect(typeof parsed[GROUP_ID][0].signature).toBe("string");
      expect(typeof parsed[GROUP_ID][0].hash).toBe("string");
    });
  });

  describe("deserializeActionChains", () => {
    it("should round-trip through serialize/deserialize", () => {
      const envelope = createGenesisEnvelope();
      const chains = new Map([[GROUP_ID, [envelope]]]);

      const json = serializeActionChains(chains);
      const restored = deserializeActionChains(json);

      expect(restored.size).toBe(1);
      const envelopes = restored.get(GROUP_ID)!;
      expect(envelopes).toHaveLength(1);
      expect(envelopes[0].signedBytes).toEqual(envelope.signedBytes);
      expect(envelopes[0].signature).toEqual(envelope.signature);
      expect(envelopes[0].hash).toEqual(envelope.hash);
    });

    it("should handle multiple groups", () => {
      const groupB = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b22";
      const envelopeA = createGenesisEnvelope();
      const accountKey = generateAccountKey();
      const envelopeB = createSignedActionEnvelope({
        accountKey,
        groupId: groupB,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group B" },
      });

      const chains = new Map([
        [GROUP_ID, [envelopeA]],
        [groupB, [envelopeB]],
      ]);

      const json = serializeActionChains(chains);
      const restored = deserializeActionChains(json);

      expect(restored.size).toBe(2);
      expect(restored.get(GROUP_ID)!).toHaveLength(1);
      expect(restored.get(groupB)!).toHaveLength(1);
    });

    it("should return empty map for invalid JSON", () => {
      const restored = deserializeActionChains("not-json");

      expect(restored.size).toBe(0);
    });

    it("should return empty map for non-object JSON", () => {
      const restored = deserializeActionChains('"a string"');

      expect(restored.size).toBe(0);
    });

    it("should skip groups with invalid envelope data", () => {
      const json = JSON.stringify({
        [GROUP_ID]: [{ signedBytes: "not-hex", signature: "zz", hash: "xx" }],
      });
      const restored = deserializeActionChains(json);

      expect(restored.get(GROUP_ID)).toHaveLength(1);
    });

    it("should handle multiple envelopes per group", () => {
      const accountKey = generateAccountKey();
      const genesis = createSignedActionEnvelope({
        accountKey,
        groupId: GROUP_ID,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Test" },
      });

      const message = createSignedActionEnvelope({
        accountKey,
        groupId: GROUP_ID,
        parentHashes: [genesis.hash],
        payload: { type: "message", text: "Hello" },
      });

      const chains = new Map([[GROUP_ID, [genesis, message]]]);
      const json = serializeActionChains(chains);
      const restored = deserializeActionChains(json);

      expect(restored.get(GROUP_ID)!).toHaveLength(2);
      expect(restored.get(GROUP_ID)![0].signedBytes).toEqual(genesis.signedBytes);
      expect(restored.get(GROUP_ID)![1].signedBytes).toEqual(message.signedBytes);
    });
  });
});
