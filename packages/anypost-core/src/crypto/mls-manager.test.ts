import { describe, it, expect } from "vitest";
import {
  initMlsContext,
  createMlsKeyPackage,
  createMlsGroup,
  addMember,
  joinFromWelcome,
  encryptMessage,
  processReceivedMessage,
  removeMember,
  updateKeys,
  getEpoch,
  getMemberCount,
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

  return { context, aliceState: addResult.newGroupState, bobState: bobGroup, aliceKp, bobKp };
};

describe("MLS Group Lifecycle", () => {
  it("createMlsGroup should return group state with epoch 0", async () => {
    const context = await setupContext();
    const aliceKp = await setupKeyPackage(context, "alice");

    const groupState = await createMlsGroup({
      context,
      groupId: makeGroupId("test-group"),
      keyPackage: aliceKp,
    });

    expect(getEpoch(groupState)).toBe(0n);
    expect(getMemberCount(groupState)).toBe(1);
  });

  it("generateKeyPackage should produce a valid key package", async () => {
    const context = await setupContext();
    const kp = await setupKeyPackage(context, "alice");

    expect(kp.publicPackage).toBeDefined();
    expect(kp.privatePackage).toBeDefined();
  });

  it("addMember should produce welcome message for new member", async () => {
    const context = await setupContext();
    const aliceKp = await setupKeyPackage(context, "alice");
    const bobKp = await setupKeyPackage(context, "bob");

    const aliceGroup = await createMlsGroup({
      context,
      groupId: makeGroupId("test-group"),
      keyPackage: aliceKp,
    });

    const result = await addMember({
      context,
      groupState: aliceGroup,
      newMemberKeyPackage: bobKp.publicPackage,
    });

    expect(result.welcome).toBeDefined();
  });

  it("addMember should produce commit message for existing members", async () => {
    const context = await setupContext();
    const aliceKp = await setupKeyPackage(context, "alice");
    const bobKp = await setupKeyPackage(context, "bob");

    const aliceGroup = await createMlsGroup({
      context,
      groupId: makeGroupId("test-group"),
      keyPackage: aliceKp,
    });

    const result = await addMember({
      context,
      groupState: aliceGroup,
      newMemberKeyPackage: bobKp.publicPackage,
    });

    expect(result.commit).toBeDefined();
  });

  it("addMember should increment epoch", async () => {
    const context = await setupContext();
    const aliceKp = await setupKeyPackage(context, "alice");
    const bobKp = await setupKeyPackage(context, "bob");

    const aliceGroup = await createMlsGroup({
      context,
      groupId: makeGroupId("test-group"),
      keyPackage: aliceKp,
    });

    expect(getEpoch(aliceGroup)).toBe(0n);

    const result = await addMember({
      context,
      groupState: aliceGroup,
      newMemberKeyPackage: bobKp.publicPackage,
    });

    expect(getEpoch(result.newGroupState)).toBe(1n);
  });

  it("joinFromWelcome should create group state matching the group", async () => {
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

    expect(getEpoch(bobGroup)).toBe(getEpoch(addResult.newGroupState));
    expect(getMemberCount(bobGroup)).toBe(2);
  });

  it("encryptMessage should produce ciphertext different from plaintext", async () => {
    const { context, aliceState } = await setupTwoMemberGroup();

    const plaintext = new TextEncoder().encode("hello group");
    const result = await encryptMessage({
      context,
      groupState: aliceState,
      plaintext,
    });

    expect(result.ciphertext).toBeDefined();
    expect(result.ciphertext).not.toEqual(plaintext);
  });

  it("group member should decrypt message encrypted by another member", async () => {
    const { context, aliceState, bobState } = await setupTwoMemberGroup();

    const plaintext = new TextEncoder().encode("secret message from alice");
    const encResult = await encryptMessage({
      context,
      groupState: aliceState,
      plaintext,
    });

    const decResult = await processReceivedMessage({
      context,
      groupState: bobState,
      message: encResult.ciphertext,
    });

    expect(decResult.kind).toBe("applicationMessage");
    if (decResult.kind === "applicationMessage") {
      expect(new Uint8Array(decResult.plaintext)).toEqual(plaintext);
    }
  });

  it("non-member should fail to decrypt group message", async () => {
    const { context, aliceState } = await setupTwoMemberGroup();

    const charlieKp = await setupKeyPackage(context, "charlie");
    const charlieGroup = await createMlsGroup({
      context,
      groupId: makeGroupId("charlies-group"),
      keyPackage: charlieKp,
    });

    const plaintext = new TextEncoder().encode("secret message");
    const encResult = await encryptMessage({
      context,
      groupState: aliceState,
      plaintext,
    });

    await expect(
      processReceivedMessage({
        context,
        groupState: charlieGroup,
        message: encResult.ciphertext,
      }),
    ).rejects.toThrow();
  });

  it("removeMember should produce commit revoking access", async () => {
    const { context, aliceState } = await setupTwoMemberGroup();

    const result = await removeMember({
      context,
      groupState: aliceState,
      memberIndex: 1,
    });

    expect(result.commit).toBeDefined();
    expect(getMemberCount(result.newGroupState)).toBe(1);
  });

  it("removed member should fail to decrypt messages after removal", async () => {
    const { context, aliceState, bobState } = await setupTwoMemberGroup();

    const removeResult = await removeMember({
      context,
      groupState: aliceState,
      memberIndex: 1,
    });

    const plaintext = new TextEncoder().encode("post-removal secret");
    const encResult = await encryptMessage({
      context,
      groupState: removeResult.newGroupState,
      plaintext,
    });

    await expect(
      processReceivedMessage({
        context,
        groupState: bobState,
        message: encResult.ciphertext,
      }),
    ).rejects.toThrow();
  });

  it("message encrypted before removal should still be decryptable by removed member", async () => {
    const { context, aliceState, bobState } = await setupTwoMemberGroup();

    const plaintext = new TextEncoder().encode("pre-removal message");
    const encResult = await encryptMessage({
      context,
      groupState: aliceState,
      plaintext,
    });

    await removeMember({
      context,
      groupState: encResult.newGroupState,
      memberIndex: 1,
    });

    const decResult = await processReceivedMessage({
      context,
      groupState: bobState,
      message: encResult.ciphertext,
    });

    expect(decResult.kind).toBe("applicationMessage");
    if (decResult.kind === "applicationMessage") {
      expect(new Uint8Array(decResult.plaintext)).toEqual(plaintext);
    }
  });

  it("key update should advance epoch", async () => {
    const { context, aliceState } = await setupTwoMemberGroup();

    const epochBefore = getEpoch(aliceState);
    const result = await updateKeys({
      context,
      groupState: aliceState,
    });

    expect(getEpoch(result.newGroupState)).toBe(epochBefore + 1n);
  });

  it("messages from old epoch should still decrypt with retained keys", async () => {
    const { context, aliceState, bobState } = await setupTwoMemberGroup();

    const plaintext = new TextEncoder().encode("old epoch message");
    const encResult = await encryptMessage({
      context,
      groupState: aliceState,
      plaintext,
    });

    const updateResult = await updateKeys({
      context,
      groupState: encResult.newGroupState,
    });

    const bobAfterUpdate = await processReceivedMessage({
      context,
      groupState: bobState,
      message: updateResult.commit,
    });

    if (bobAfterUpdate.kind !== "commit") {
      throw new Error("Expected commit processing");
    }

    const decResult = await processReceivedMessage({
      context,
      groupState: bobAfterUpdate.newGroupState,
      message: encResult.ciphertext,
    });

    expect(decResult.kind).toBe("applicationMessage");
    if (decResult.kind === "applicationMessage") {
      expect(new Uint8Array(decResult.plaintext)).toEqual(plaintext);
    }
  });
});
