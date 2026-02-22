import { describe, it, expect } from "vitest";
import {
  encryptContent,
  decryptContent,
  createMessageBuffer,
  bufferMessage,
  drainMessageBuffer,
} from "./encrypted-message-flow.js";
import {
  initMlsContext,
  createMlsKeyPackage,
  createMlsGroup,
  addMember,
  joinFromWelcome,
  updateKeys,
} from "./mls-manager.js";
import type { MlsContext, MlsKeyPackageBundle } from "./mls-manager.js";
import type { MessageContent } from "../shared/schemas.js";

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

const textContent = (text: string): MessageContent => ({
  type: "text",
  text,
});

describe("Encrypted message flow", () => {
  it("should encrypt MessageContent into MLS ciphertext", async () => {
    const { context, aliceState } = await setupTwoMemberGroup();
    const content = textContent("hello encrypted world");

    const result = await encryptContent({
      context,
      groupState: aliceState,
      content,
    });

    expect(result.ciphertext).toBeDefined();
    expect(result.newGroupState).toBeDefined();
  });

  it("should decrypt MLS ciphertext back to original MessageContent", async () => {
    const { context, aliceState, bobState } = await setupTwoMemberGroup();
    const content = textContent("secret message from alice");

    const encResult = await encryptContent({
      context,
      groupState: aliceState,
      content,
    });

    const decResult = await decryptContent({
      context,
      groupState: bobState,
      message: encResult.ciphertext,
    });

    expect(decResult.kind).toBe("message");
    if (decResult.kind === "message") {
      expect(decResult.content).toEqual(content);
    }
  });

  it("non-member should fail to decrypt encrypted content", async () => {
    const { context, aliceState } = await setupTwoMemberGroup();
    const content = textContent("members only");

    const charlieKp = await setupKeyPackage(context, "charlie");
    const charlieGroup = await createMlsGroup({
      context,
      groupId: makeGroupId("charlies-group"),
      keyPackage: charlieKp,
    });

    const encResult = await encryptContent({
      context,
      groupState: aliceState,
      content,
    });

    await expect(
      decryptContent({
        context,
        groupState: charlieGroup,
        message: encResult.ciphertext,
      }),
    ).rejects.toThrow();
  });

  it("should buffer message when decryption fails and decrypt when state advances", async () => {
    const { context, aliceState, bobState } = await setupTwoMemberGroup();

    const updateResult = await updateKeys({
      context,
      groupState: aliceState,
    });

    const aliceAfterUpdate = updateResult.newGroupState;
    const content = textContent("epoch 2 message");

    const encResult = await encryptContent({
      context,
      groupState: aliceAfterUpdate,
      content,
    });

    await expect(
      decryptContent({
        context,
        groupState: bobState,
        message: encResult.ciphertext,
      }),
    ).rejects.toThrow();

    let buffer = createMessageBuffer();
    buffer = bufferMessage(buffer, {
      id: "msg-1",
      message: encResult.ciphertext,
    });

    expect(buffer.messages).toHaveLength(1);

    const commitResult = await decryptContent({
      context,
      groupState: bobState,
      message: updateResult.commit,
    });

    expect(commitResult.kind).toBe("commit");
    if (commitResult.kind !== "commit") throw new Error("Expected commit");

    const drainResult = await drainMessageBuffer(buffer, {
      context,
      groupState: commitResult.newGroupState,
    });

    expect(drainResult.decrypted).toHaveLength(1);
    expect(drainResult.decrypted[0].id).toBe("msg-1");
    expect(drainResult.decrypted[0].content).toEqual(content);
    expect(drainResult.remaining.messages).toHaveLength(0);
  });
});
