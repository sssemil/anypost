import { describe, it, expect } from "vitest";
import {
  createRetentionConfig,
  createEpochTracker,
  recordEpoch,
  getExpiredEpochs,
  pruneTracker,
  pruneGroupState,
} from "./epoch-key-retention.js";
import {
  initMlsContext,
  createMlsKeyPackage,
  createMlsGroup,
  addMember,
  joinFromWelcome,
  encryptMessage,
  processReceivedMessage,
  updateKeys,
  getEpoch,
} from "./mls-manager.js";
import type { MlsContext, MlsKeyPackageBundle } from "./mls-manager.js";

const makeIdentity = (name: string): Uint8Array =>
  new TextEncoder().encode(name);

const makeGroupId = (name: string): Uint8Array =>
  new TextEncoder().encode(name);

const setupContext = async (): Promise<MlsContext> => initMlsContext();

const setupKeyPackage = async (
  context: MlsContext,
  name: string,
): Promise<MlsKeyPackageBundle> =>
  createMlsKeyPackage({ context, identity: makeIdentity(name) });

const setupTwoMemberGroup = async () => {
  const context = await setupContext();
  const aliceKp = await setupKeyPackage(context, "alice");
  const bobKp = await setupKeyPackage(context, "bob");

  const aliceGroup = await createMlsGroup({
    context,
    groupId: makeGroupId("test-group"),
    keyPackage: aliceKp,
  });

  const addResult = await addMember({
    context,
    groupState: aliceGroup,
    newMemberKeyPackage: bobKp.publicPackage,
  });

  const bobGroup = await joinFromWelcome({
    context,
    welcome: addResult.welcome,
    keyPackage: bobKp,
  });

  return { context, aliceState: addResult.newGroupState, bobState: bobGroup };
};

const DAYS_MS = 24 * 60 * 60 * 1000;

describe("Epoch key retention", () => {
  describe("retention config", () => {
    it("should use defaults of 30 days and 100 epochs", () => {
      const config = createRetentionConfig();

      expect(config.maxAgeDays).toBe(30);
      expect(config.maxEpochCount).toBe(100);
    });

    it("should accept custom configuration", () => {
      const config = createRetentionConfig({
        maxAgeDays: 7,
        maxEpochCount: 50,
      });

      expect(config.maxAgeDays).toBe(7);
      expect(config.maxEpochCount).toBe(50);
    });

    it("should reject zero maxAgeDays", () => {
      expect(() => createRetentionConfig({ maxAgeDays: 0 })).toThrow(RangeError);
    });

    it("should reject negative maxEpochCount", () => {
      expect(() => createRetentionConfig({ maxEpochCount: -1 })).toThrow(RangeError);
    });

    it("should reject non-finite maxAgeDays", () => {
      expect(() => createRetentionConfig({ maxAgeDays: Infinity })).toThrow(RangeError);
    });
  });

  describe("epoch tracking", () => {
    it("should create empty tracker for a group", () => {
      const tracker = createEpochTracker("group-1");

      expect(tracker.groupId).toBe("group-1");
      expect(tracker.epochs).toHaveLength(0);
    });

    it("should record epoch with timestamp", () => {
      const tracker = createEpochTracker("group-1");
      const now = Date.now();
      const updated = recordEpoch(tracker, 1n, now);

      expect(updated.epochs).toHaveLength(1);
      expect(updated.epochs[0].epoch).toBe(1n);
      expect(updated.epochs[0].recordedAt).toBe(now);
    });

    it("should preserve existing epochs when recording new one", () => {
      const now = Date.now();
      const t1 = recordEpoch(createEpochTracker("g"), 1n, now);
      const t2 = recordEpoch(t1, 2n, now + 1000);

      expect(t2.epochs).toHaveLength(2);
      expect(t2.epochs[0].epoch).toBe(1n);
      expect(t2.epochs[1].epoch).toBe(2n);
    });

    it("should not add duplicate epochs", () => {
      const now = Date.now();
      const t1 = recordEpoch(createEpochTracker("g"), 1n, now);
      const t2 = recordEpoch(t1, 1n, now + 5000);

      expect(t2.epochs).toHaveLength(1);
      expect(t2.epochs[0].recordedAt).toBe(now);
    });
  });

  describe("expiration", () => {
    it("should return no expired epochs for a fresh tracker", () => {
      const tracker = createEpochTracker("g");
      const config = createRetentionConfig();

      const expired = getExpiredEpochs(tracker, config);

      expect(expired).toHaveLength(0);
    });

    it("should expire epochs older than max age", () => {
      const now = Date.now();
      const config = createRetentionConfig({ maxAgeDays: 7, maxEpochCount: 1000 });
      let tracker = createEpochTracker("g");
      tracker = recordEpoch(tracker, 1n, now - 8 * DAYS_MS);
      tracker = recordEpoch(tracker, 2n, now - 3 * DAYS_MS);
      tracker = recordEpoch(tracker, 3n, now);

      const expired = getExpiredEpochs(tracker, config, now);

      expect(expired).toEqual([1n]);
    });

    it("should expire epochs beyond max epoch count", () => {
      const now = Date.now();
      const config = createRetentionConfig({ maxAgeDays: 365, maxEpochCount: 2 });
      let tracker = createEpochTracker("g");
      tracker = recordEpoch(tracker, 1n, now);
      tracker = recordEpoch(tracker, 2n, now);
      tracker = recordEpoch(tracker, 3n, now);

      const expired = getExpiredEpochs(tracker, config, now);

      expect(expired).toEqual([1n]);
    });

    it("should expire when either time or count limit is exceeded", () => {
      const now = Date.now();
      const config = createRetentionConfig({ maxAgeDays: 7, maxEpochCount: 3 });
      let tracker = createEpochTracker("g");
      tracker = recordEpoch(tracker, 1n, now - 8 * DAYS_MS);
      tracker = recordEpoch(tracker, 2n, now - 1 * DAYS_MS);
      tracker = recordEpoch(tracker, 3n, now);
      tracker = recordEpoch(tracker, 4n, now);
      tracker = recordEpoch(tracker, 5n, now);

      const expired = getExpiredEpochs(tracker, config, now);

      expect(expired).toContain(1n);
      expect(expired).toContain(2n);
      expect(expired).not.toContain(3n);
    });

    it("should retain epochs within both limits", () => {
      const now = Date.now();
      const config = createRetentionConfig({ maxAgeDays: 30, maxEpochCount: 10 });
      let tracker = createEpochTracker("g");
      tracker = recordEpoch(tracker, 1n, now - 5 * DAYS_MS);
      tracker = recordEpoch(tracker, 2n, now - 1 * DAYS_MS);
      tracker = recordEpoch(tracker, 3n, now);

      const expired = getExpiredEpochs(tracker, config, now);

      expect(expired).toHaveLength(0);
    });
  });

  describe("pruning tracker", () => {
    it("should remove expired epoch records", () => {
      const now = Date.now();
      const config = createRetentionConfig({ maxAgeDays: 7, maxEpochCount: 1000 });
      let tracker = createEpochTracker("g");
      tracker = recordEpoch(tracker, 1n, now - 10 * DAYS_MS);
      tracker = recordEpoch(tracker, 2n, now - 8 * DAYS_MS);
      tracker = recordEpoch(tracker, 3n, now);

      const pruned = pruneTracker(tracker, config, now);

      expect(pruned.epochs).toHaveLength(1);
      expect(pruned.epochs[0].epoch).toBe(3n);
    });
  });

  describe("pruning group state", () => {
    it("should remove historical receiver data for expired epochs", async () => {
      const { context, aliceState, bobState } = await setupTwoMemberGroup();

      const update1 = await updateKeys({ context, groupState: aliceState });
      const update2 = await updateKeys({ context, groupState: update1.newGroupState });

      const bob1 = await processReceivedMessage({
        context,
        groupState: bobState,
        message: update1.commit,
      });
      const bob2 = await processReceivedMessage({
        context,
        groupState: bob1.newGroupState,
        message: update2.commit,
      });

      const bobEpoch = getEpoch(bob2.newGroupState);
      expect(bobEpoch).toBe(3n);

      expect(
        bob2.newGroupState.clientState.historicalReceiverData.has(1n),
      ).toBe(true);

      const pruned = pruneGroupState({
        groupState: bob2.newGroupState,
        expiredEpochs: [1n],
      });

      expect(
        pruned.clientState.historicalReceiverData.has(1n),
      ).toBe(false);
      expect(
        pruned.clientState.historicalReceiverData.has(2n),
      ).toBe(true);
    });

    it("messages from retained epochs should still be decryptable after pruning", async () => {
      const { context, aliceState, bobState } = await setupTwoMemberGroup();

      const enc = await encryptMessage({
        context,
        groupState: aliceState,
        plaintext: new TextEncoder().encode("epoch 1 message"),
      });

      const update1 = await updateKeys({
        context,
        groupState: enc.newGroupState,
      });
      const update2 = await updateKeys({
        context,
        groupState: update1.newGroupState,
      });

      const bob1 = await processReceivedMessage({
        context,
        groupState: bobState,
        message: update1.commit,
      });
      const bob2 = await processReceivedMessage({
        context,
        groupState: bob1.newGroupState,
        message: update2.commit,
      });

      const pruned = pruneGroupState({
        groupState: bob2.newGroupState,
        expiredEpochs: [2n],
      });

      const result = await processReceivedMessage({
        context,
        groupState: pruned,
        message: enc.ciphertext,
      });

      expect(result.kind).toBe("applicationMessage");
      if (result.kind === "applicationMessage") {
        expect(new Uint8Array(result.plaintext)).toEqual(
          new TextEncoder().encode("epoch 1 message"),
        );
      }
    });

    it("should zero key material in pruned epoch receiver data", async () => {
      const { context, aliceState, bobState } = await setupTwoMemberGroup();

      const update1 = await updateKeys({ context, groupState: aliceState });
      const bob1 = await processReceivedMessage({
        context,
        groupState: bobState,
        message: update1.commit,
      });

      const epochData = bob1.newGroupState.clientState.historicalReceiverData.get(1n);
      expect(epochData).toBeDefined();

      const pskBefore = new Uint8Array(epochData!.resumptionPsk);
      const senderSecretBefore = new Uint8Array(epochData!.senderDataSecret);
      expect(pskBefore.some((b) => b !== 0)).toBe(true);
      expect(senderSecretBefore.some((b) => b !== 0)).toBe(true);

      pruneGroupState({
        groupState: bob1.newGroupState,
        expiredEpochs: [1n],
      });

      expect(epochData!.resumptionPsk.every((b) => b === 0)).toBe(true);
      expect(epochData!.senderDataSecret.every((b) => b === 0)).toBe(true);
    });

    it("messages from pruned epochs should not be decryptable (forward secrecy)", async () => {
      const { context, aliceState, bobState } = await setupTwoMemberGroup();

      const enc = await encryptMessage({
        context,
        groupState: aliceState,
        plaintext: new TextEncoder().encode("old epoch secret"),
      });

      const update1 = await updateKeys({
        context,
        groupState: enc.newGroupState,
      });
      const update2 = await updateKeys({
        context,
        groupState: update1.newGroupState,
      });

      const bob1 = await processReceivedMessage({
        context,
        groupState: bobState,
        message: update1.commit,
      });
      const bob2 = await processReceivedMessage({
        context,
        groupState: bob1.newGroupState,
        message: update2.commit,
      });

      const pruned = pruneGroupState({
        groupState: bob2.newGroupState,
        expiredEpochs: [1n],
      });

      await expect(
        processReceivedMessage({
          context,
          groupState: pruned,
          message: enc.ciphertext,
        }),
      ).rejects.toThrow();
    });
  });
});
