import { describe, it, expect } from "vitest";
import {
  initMlsContext,
  createMlsKeyPackage,
  createMlsGroup,
  getEpoch,
  getMemberCount,
} from "./mls-manager.js";
import type { MlsContext, MlsKeyPackageBundle } from "./mls-manager.js";
import {
  createStewardState,
  processStewardProposal,
  getStewardMembers,
  createProposalQueue,
  enqueueProposal,
  drainProposalQueue,
} from "./steward.js";

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

const setupSteward = async () => {
  const context = await setupContext();
  const stewardKp = await setupKeyPackage(context, "steward");
  const groupState = await createMlsGroup({
    context,
    groupId: makeGroupId("test-group"),
    keyPackage: stewardKp,
  });

  const state = createStewardState({
    context,
    groupState,
    stewardIdentity: makeIdentity("steward"),
  });

  return { context, state, stewardKp };
};

describe("Steward Commit Ordering", () => {
  it("steward should apply commits in received order", async () => {
    const { context, state } = await setupSteward();
    const bobKp = await setupKeyPackage(context, "bob");
    const charlieKp = await setupKeyPackage(context, "charlie");

    const result1 = await processStewardProposal({
      state,
      proposal: {
        kind: "add",
        keyPackage: bobKp.publicPackage,
        identity: makeIdentity("bob"),
      },
      senderIdentity: makeIdentity("steward"),
    });

    expect(getEpoch(result1.newState.groupState)).toBe(1n);

    const result2 = await processStewardProposal({
      state: result1.newState,
      proposal: {
        kind: "add",
        keyPackage: charlieKp.publicPackage,
        identity: makeIdentity("charlie"),
      },
      senderIdentity: makeIdentity("steward"),
    });

    expect(getEpoch(result2.newState.groupState)).toBe(2n);
  });

  it("steward should reject commits from non-members", async () => {
    const { context, state } = await setupSteward();
    const bobKp = await setupKeyPackage(context, "bob");

    await expect(
      processStewardProposal({
        state,
        proposal: {
          kind: "add",
          keyPackage: bobKp.publicPackage,
          identity: makeIdentity("bob"),
        },
        senderIdentity: makeIdentity("unknown"),
      }),
    ).rejects.toThrow("not a group member");
  });

  it("concurrent add-member requests should be serialized by steward", async () => {
    const { context, state } = await setupSteward();
    const bobKp = await setupKeyPackage(context, "bob");
    const charlieKp = await setupKeyPackage(context, "charlie");

    const result1 = await processStewardProposal({
      state,
      proposal: {
        kind: "add",
        keyPackage: bobKp.publicPackage,
        identity: makeIdentity("bob"),
      },
      senderIdentity: makeIdentity("steward"),
    });

    const result2 = await processStewardProposal({
      state: result1.newState,
      proposal: {
        kind: "add",
        keyPackage: charlieKp.publicPackage,
        identity: makeIdentity("charlie"),
      },
      senderIdentity: makeIdentity("steward"),
    });

    expect(getMemberCount(result2.newState.groupState)).toBe(3);
    expect(getEpoch(result2.newState.groupState)).toBe(2n);
  });

  it("steward should broadcast commit to all group members", async () => {
    const { context, state } = await setupSteward();
    const bobKp = await setupKeyPackage(context, "bob");

    const result = await processStewardProposal({
      state,
      proposal: {
        kind: "add",
        keyPackage: bobKp.publicPackage,
        identity: makeIdentity("bob"),
      },
      senderIdentity: makeIdentity("steward"),
    });

    expect(result.commitBroadcast).toBeDefined();
    expect(result.commitBroadcast.commit).toBeDefined();

    const members = getStewardMembers(result.newState);
    expect(members).toHaveLength(2);
  });

  it("steward should send welcome only to the new member", async () => {
    const { context, state } = await setupSteward();
    const bobKp = await setupKeyPackage(context, "bob");

    const result = await processStewardProposal({
      state,
      proposal: {
        kind: "add",
        keyPackage: bobKp.publicPackage,
        identity: makeIdentity("bob"),
      },
      senderIdentity: makeIdentity("steward"),
    });

    expect(result.welcomeMessage).toBeDefined();
    expect(result.welcomeMessage?.recipientIdentity).toEqual(
      makeIdentity("bob"),
    );
  });

  it("non-steward peer should queue commits for steward", () => {
    const queue = createProposalQueue();

    const queue1 = enqueueProposal(queue, {
      kind: "update",
    });

    const queue2 = enqueueProposal(queue1, {
      kind: "remove",
      identity: makeIdentity("bob"),
    });

    const { proposals, emptyQueue } = drainProposalQueue(queue2);

    expect(proposals).toHaveLength(2);
    expect(proposals[0].kind).toBe("update");
    expect(proposals[1].kind).toBe("remove");
    expect(drainProposalQueue(emptyQueue).proposals).toHaveLength(0);
  });

  it("update proposal should advance epoch without changing membership", async () => {
    const { state } = await setupSteward();

    const result = await processStewardProposal({
      state,
      proposal: { kind: "update" },
      senderIdentity: makeIdentity("steward"),
    });

    expect(getEpoch(result.newState.groupState)).toBe(1n);
    expect(getStewardMembers(result.newState)).toHaveLength(1);
    expect(result.welcomeMessage).toBeUndefined();
    expect(result.commitBroadcast.commit).toBeDefined();
  });

  it("should reject adding a member who is already in the group", async () => {
    const { context, state } = await setupSteward();
    const bobKp = await setupKeyPackage(context, "bob");

    const addResult = await processStewardProposal({
      state,
      proposal: {
        kind: "add",
        keyPackage: bobKp.publicPackage,
        identity: makeIdentity("bob"),
      },
      senderIdentity: makeIdentity("steward"),
    });

    const bobKp2 = await setupKeyPackage(context, "bob");

    await expect(
      processStewardProposal({
        state: addResult.newState,
        proposal: {
          kind: "add",
          keyPackage: bobKp2.publicPackage,
          identity: makeIdentity("bob"),
        },
        senderIdentity: makeIdentity("steward"),
      }),
    ).rejects.toThrow("already a group member");
  });

  it("should correctly track member index after remove and re-add", async () => {
    const { context, state } = await setupSteward();
    const bobKp = await setupKeyPackage(context, "bob");
    const charlieKp = await setupKeyPackage(context, "charlie");

    const addBob = await processStewardProposal({
      state,
      proposal: {
        kind: "add",
        keyPackage: bobKp.publicPackage,
        identity: makeIdentity("bob"),
      },
      senderIdentity: makeIdentity("steward"),
    });

    const addCharlie = await processStewardProposal({
      state: addBob.newState,
      proposal: {
        kind: "add",
        keyPackage: charlieKp.publicPackage,
        identity: makeIdentity("charlie"),
      },
      senderIdentity: makeIdentity("steward"),
    });

    const removeBob = await processStewardProposal({
      state: addCharlie.newState,
      proposal: {
        kind: "remove",
        identity: makeIdentity("bob"),
      },
      senderIdentity: makeIdentity("steward"),
    });

    const daveKp = await setupKeyPackage(context, "dave");
    const addDave = await processStewardProposal({
      state: removeBob.newState,
      proposal: {
        kind: "add",
        keyPackage: daveKp.publicPackage,
        identity: makeIdentity("dave"),
      },
      senderIdentity: makeIdentity("steward"),
    });

    expect(getMemberCount(addDave.newState.groupState)).toBe(3);

    const removeDave = await processStewardProposal({
      state: addDave.newState,
      proposal: {
        kind: "remove",
        identity: makeIdentity("dave"),
      },
      senderIdentity: makeIdentity("steward"),
    });

    expect(getMemberCount(removeDave.newState.groupState)).toBe(2);
    expect(getStewardMembers(removeDave.newState)).toHaveLength(2);

    const remainingMembers = getStewardMembers(removeDave.newState);
    const remainingIdentities = remainingMembers.map((m) => m.identity);
    expect(remainingIdentities).toContainEqual(makeIdentity("steward"));
    expect(remainingIdentities).toContainEqual(makeIdentity("charlie"));

    const removeCharlie = await processStewardProposal({
      state: removeDave.newState,
      proposal: {
        kind: "remove",
        identity: makeIdentity("charlie"),
      },
      senderIdentity: makeIdentity("steward"),
    });

    expect(getMemberCount(removeCharlie.newState.groupState)).toBe(1);
    expect(getStewardMembers(removeCharlie.newState)).toHaveLength(1);
  });

  it("remove proposal should not produce a welcome message", async () => {
    const { context, state } = await setupSteward();
    const bobKp = await setupKeyPackage(context, "bob");

    const addResult = await processStewardProposal({
      state,
      proposal: {
        kind: "add",
        keyPackage: bobKp.publicPackage,
        identity: makeIdentity("bob"),
      },
      senderIdentity: makeIdentity("steward"),
    });

    const removeResult = await processStewardProposal({
      state: addResult.newState,
      proposal: {
        kind: "remove",
        identity: makeIdentity("bob"),
      },
      senderIdentity: makeIdentity("steward"),
    });

    expect(removeResult.welcomeMessage).toBeUndefined();
    expect(removeResult.commitBroadcast.commit).toBeDefined();
    expect(getMemberCount(removeResult.newState.groupState)).toBe(1);
  });
});
