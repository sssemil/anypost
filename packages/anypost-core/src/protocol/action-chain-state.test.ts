import { describe, it, expect } from "vitest";
import { generateAccountKey } from "../crypto/identity.js";
import { GENESIS_HASH, toHex } from "./action-chain.js";
import type { SignedAction, ActionPayload, SignedActionEnvelope } from "./action-chain.js";
import {
  createSignedActionEnvelope,
  verifyAndDecodeAction,
} from "./action-signing.js";
import {
  createActionChainGroupState,
  applyAction,
  deriveGroupState,
  processBulkSignedActions,
  validateMergePreConditions,
  validateParentHashCount,
} from "./action-chain-state.js";
import { createActionDagState, appendAction, topologicalOrder } from "./action-dag.js";
import type { AccountKey } from "../crypto/identity.js";

const DEFAULT_GROUP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

const pubKey = (key: AccountKey): Uint8Array<ArrayBuffer> => {
  const buf = new ArrayBuffer(key.publicKey.byteLength);
  const view = new Uint8Array(buf);
  view.set(key.publicKey);
  return view;
};

const makeEnvelope = (options: {
  readonly accountKey: AccountKey;
  readonly parentHashes: readonly Uint8Array[];
  readonly payload: ActionPayload;
  readonly timestamp?: number;
}): SignedActionEnvelope =>
  createSignedActionEnvelope({
    accountKey: options.accountKey,
    groupId: DEFAULT_GROUP_ID,
    parentHashes: options.parentHashes,
    payload: options.payload,
    timestamp: options.timestamp ?? Date.now(),
  });

const makeAction = (options: {
  readonly accountKey: AccountKey;
  readonly parentHashes: readonly Uint8Array[];
  readonly payload: ActionPayload;
  readonly timestamp?: number;
}): SignedAction => {
  const envelope = makeEnvelope(options);
  const result = verifyAndDecodeAction(envelope);
  if (!result.success) throw new Error("Failed to create test action");
  return result.data;
};

describe("Action chain state", () => {
  describe("createActionChainGroupState", () => {
    it("should create an empty group state", () => {
      const state = createActionChainGroupState(DEFAULT_GROUP_ID);

      expect(state.groupId).toBe(DEFAULT_GROUP_ID);
      expect(state.groupName).toBe("");
      expect(state.isDirectMessage).toBe(false);
      expect(state.directMessagePeerIds).toBeNull();
      expect(state.dmGenesisContributorPublicKeys.size).toBe(0);
      expect(state.dmHandshakeComplete).toBe(false);
      expect(state.joinPolicy).toBe("manual");
      expect(state.members.size).toBe(0);
      expect(state.pendingJoins.size).toBe(0);
      expect(state.readReceipts.size).toBe(0);
      expect(state.lastMergeTimestampByAuthor.size).toBe(0);
    });
  });

  describe("applyAction — group-created", () => {
    it("should make the author the owner on group creation", () => {
      const creator = generateAccountKey();
      const action = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "My Group" },
        timestamp: 1000,
      });

      const result = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        action,
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.groupName).toBe("My Group");
      expect(result.data.members.size).toBe(1);

      const member = result.data.members.get(toHex(creator.publicKey));
      expect(member).toBeDefined();
      expect(member!.role).toBe("owner");
      expect(member!.joinedAt).toBe(1000);
    });

    it("should reject group-created if state already has members", () => {
      const creator = generateAccountKey();
      const genesisAction = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "First" },
      });

      const result1 = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesisAction,
      );
      if (!result1.success) throw new Error("Setup failed");

      const secondGenesis = makeAction({
        accountKey: creator,
        parentHashes: [genesisAction.hash],
        payload: { type: "group-created", groupName: "Second" },
      });

      const result2 = applyAction(result1.data, secondGenesis);

      expect(result2.success).toBe(false);
    });
  });

  describe("applyAction — dm-created", () => {
    it("should mark the group as direct-message and store sorted peers", () => {
      const creator = generateAccountKey();
      const action = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: {
          type: "dm-created",
          peerIds: ["12D3KooWAlicePeer", "12D3KooWBobPeer"],
        },
        timestamp: 1000,
      });

      const result = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        action,
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.isDirectMessage).toBe(true);
      expect(result.data.directMessagePeerIds).toEqual([
        "12D3KooWAlicePeer",
        "12D3KooWBobPeer",
      ]);
      expect(result.data.groupName).toBe("");
      expect(result.data.joinPolicy).toBe("manual");
      expect(result.data.dmGenesisContributorPublicKeys.size).toBe(1);
      expect(result.data.dmHandshakeComplete).toBe(false);
      expect(result.data.members.size).toBe(1);
      expect(result.data.members.get(toHex(creator.publicKey))?.role).toBe("owner");
    });

    it("should complete DM handshake after second dm-created genesis by another author", () => {
      const first = generateAccountKey();
      const second = generateAccountKey();
      const firstGenesis = makeAction({
        accountKey: first,
        parentHashes: [GENESIS_HASH],
        payload: {
          type: "dm-created",
          peerIds: ["12D3KooWAlicePeer", "12D3KooWBobPeer"],
        },
        timestamp: 1_000,
      });
      const secondGenesis = makeAction({
        accountKey: second,
        parentHashes: [GENESIS_HASH],
        payload: {
          type: "dm-created",
          peerIds: ["12D3KooWAlicePeer", "12D3KooWBobPeer"],
        },
        timestamp: 1_200,
      });

      const firstState = applyAction(createActionChainGroupState(DEFAULT_GROUP_ID), firstGenesis);
      if (!firstState.success) throw new Error("Setup failed");
      const secondState = applyAction(firstState.data, secondGenesis);

      expect(secondState.success).toBe(true);
      if (!secondState.success) return;
      expect(secondState.data.dmGenesisContributorPublicKeys.size).toBe(2);
      expect(secondState.data.dmHandshakeComplete).toBe(true);
      expect(secondState.data.members.size).toBe(2);
    });
  });

  describe("applyAction — join-request", () => {
    it("should reject join-request for direct messages", () => {
      const creator = generateAccountKey();
      const joiner = generateAccountKey();
      const dmGenesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: {
          type: "dm-created",
          peerIds: ["12D3KooWAlicePeer", "12D3KooWBobPeer"],
        },
      });
      const state = applyAction(createActionChainGroupState(DEFAULT_GROUP_ID), dmGenesis);
      if (!state.success) throw new Error("Setup failed");
      const joinReq = makeAction({
        accountKey: joiner,
        parentHashes: [dmGenesis.hash],
        payload: {
          type: "join-request",
          requesterPublicKey: pubKey(joiner),
        },
      });
      const result = applyAction(state.data, joinReq);
      expect(result.success).toBe(false);
    });

    it("should add requester to pending joins", () => {
      const creator = generateAccountKey();
      const joiner = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      const state1 = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state1.success) throw new Error("Setup failed");

      const joinReq = makeAction({
        accountKey: joiner,
        parentHashes: [genesis.hash],
        payload: {
          type: "join-request",
          requesterPublicKey: pubKey(joiner),
        },
      });

      const result = applyAction(state1.data, joinReq);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.pendingJoins.has(toHex(joiner.publicKey))).toBe(true);
    });

    it("should reject join-request from existing member", () => {
      const creator = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      const state1 = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state1.success) throw new Error("Setup failed");

      const joinReq = makeAction({
        accountKey: creator,
        parentHashes: [genesis.hash],
        payload: {
          type: "join-request",
          requesterPublicKey: pubKey(creator),
        },
      });

      const result = applyAction(state1.data, joinReq);

      expect(result.success).toBe(false);
    });
  });

  describe("applyAction — member-approved", () => {
    it("should allow admin to approve a pending join", () => {
      const creator = generateAccountKey();
      const joiner = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      let state = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state.success) throw new Error("Setup failed");

      const joinReq = makeAction({
        accountKey: joiner,
        parentHashes: [genesis.hash],
        payload: {
          type: "join-request",
          requesterPublicKey: pubKey(joiner),
        },
      });
      state = applyAction(state.data, joinReq);
      if (!state.success) throw new Error("Setup failed");

      const approval = makeAction({
        accountKey: creator,
        parentHashes: [joinReq.hash],
        payload: {
          type: "member-approved",
          memberPublicKey: pubKey(joiner),
          role: "member",
        },
        timestamp: 2000,
      });

      const result = applyAction(state.data, approval);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const member = result.data.members.get(toHex(joiner.publicKey));
      expect(member).toBeDefined();
      expect(member!.role).toBe("member");
      expect(result.data.pendingJoins.has(toHex(joiner.publicKey))).toBe(false);
    });

    it("should allow admin to approve member directly without join-request", () => {
      const creator = generateAccountKey();
      const newMember = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      const state1 = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state1.success) throw new Error("Setup failed");

      const approval = makeAction({
        accountKey: creator,
        parentHashes: [genesis.hash],
        payload: {
          type: "member-approved",
          memberPublicKey: pubKey(newMember),
          role: "member",
        },
        timestamp: 2000,
      });

      const result = applyAction(state1.data, approval);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const member = result.data.members.get(toHex(newMember.publicKey));
      expect(member).toBeDefined();
      expect(member!.role).toBe("member");
      expect(member!.joinedAt).toBe(2000);
      expect(result.data.pendingJoins.size).toBe(0);
    });

    it("should reject approval from non-admin", () => {
      const creator = generateAccountKey();
      const member1 = generateAccountKey();
      const joiner = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      let state = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state.success) throw new Error("Setup failed");

      const joinReq1 = makeAction({
        accountKey: member1,
        parentHashes: [genesis.hash],
        payload: {
          type: "join-request",
          requesterPublicKey: pubKey(member1),
        },
      });
      state = applyAction(state.data, joinReq1);
      if (!state.success) throw new Error("Setup failed");

      const approve1 = makeAction({
        accountKey: creator,
        parentHashes: [joinReq1.hash],
        payload: {
          type: "member-approved",
          memberPublicKey: pubKey(member1),
          role: "member",
        },
      });
      state = applyAction(state.data, approve1);
      if (!state.success) throw new Error("Setup failed");

      const joinReq2 = makeAction({
        accountKey: joiner,
        parentHashes: [approve1.hash],
        payload: {
          type: "join-request",
          requesterPublicKey: pubKey(joiner),
        },
      });
      state = applyAction(state.data, joinReq2);
      if (!state.success) throw new Error("Setup failed");

      const badApproval = makeAction({
        accountKey: member1,
        parentHashes: [joinReq2.hash],
        payload: {
          type: "member-approved",
          memberPublicKey: pubKey(joiner),
          role: "member",
        },
      });

      const result = applyAction(state.data, badApproval);

      expect(result.success).toBe(false);
    });
  });

  describe("applyAction — message", () => {
    it("should reject DM messages before handshake completion", () => {
      const creator = generateAccountKey();
      const dmGenesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: {
          type: "dm-created",
          peerIds: ["12D3KooWAlicePeer", "12D3KooWBobPeer"],
        },
      });
      const state = applyAction(createActionChainGroupState(DEFAULT_GROUP_ID), dmGenesis);
      if (!state.success) throw new Error("Setup failed");
      const msg = makeAction({
        accountKey: creator,
        parentHashes: [dmGenesis.hash],
        payload: { type: "message", text: "hello" },
      });

      const result = applyAction(state.data, msg);
      expect(result.success).toBe(false);
    });

    it("should accept message from a member", () => {
      const creator = generateAccountKey();
      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      const state1 = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state1.success) throw new Error("Setup failed");

      const msg = makeAction({
        accountKey: creator,
        parentHashes: [genesis.hash],
        payload: { type: "message", text: "Hello" },
      });

      const result = applyAction(state1.data, msg);

      expect(result.success).toBe(true);
    });

    it("should reject message from non-member", () => {
      const creator = generateAccountKey();
      const outsider = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      const state1 = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state1.success) throw new Error("Setup failed");

      const msg = makeAction({
        accountKey: outsider,
        parentHashes: [genesis.hash],
        payload: { type: "message", text: "Unauthorized" },
      });

      const result = applyAction(state1.data, msg);

      expect(result.success).toBe(false);
    });
  });

  describe("applyAction — member-left", () => {
    it("should remove the author from members", () => {
      const creator = generateAccountKey();
      const joiner = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      let state = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state.success) throw new Error("Setup failed");

      const joinReq = makeAction({
        accountKey: joiner,
        parentHashes: [genesis.hash],
        payload: {
          type: "join-request",
          requesterPublicKey: pubKey(joiner),
        },
      });
      state = applyAction(state.data, joinReq);
      if (!state.success) throw new Error("Setup failed");

      const approve = makeAction({
        accountKey: creator,
        parentHashes: [joinReq.hash],
        payload: {
          type: "member-approved",
          memberPublicKey: pubKey(joiner),
          role: "member",
        },
      });
      state = applyAction(state.data, approve);
      if (!state.success) throw new Error("Setup failed");

      const leave = makeAction({
        accountKey: joiner,
        parentHashes: [approve.hash],
        payload: { type: "member-left" },
      });

      const result = applyAction(state.data, leave);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.members.has(toHex(joiner.publicKey))).toBe(false);
    });

    it("should reject member-left from non-member", () => {
      const creator = generateAccountKey();
      const outsider = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      const state1 = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state1.success) throw new Error("Setup failed");

      const leave = makeAction({
        accountKey: outsider,
        parentHashes: [genesis.hash],
        payload: { type: "member-left" },
      });

      const result = applyAction(state1.data, leave);

      expect(result.success).toBe(false);
    });

    it("should transfer owner role to earliest joined remaining member when owner leaves", () => {
      const creator = generateAccountKey();
      const memberA = generateAccountKey();
      const memberB = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
        timestamp: 1000,
      });
      let state = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state.success) throw new Error("Setup failed");

      const joinReqA = makeAction({
        accountKey: memberA,
        parentHashes: [genesis.hash],
        payload: {
          type: "join-request",
          requesterPublicKey: pubKey(memberA),
        },
        timestamp: 2000,
      });
      state = applyAction(state.data, joinReqA);
      if (!state.success) throw new Error("Setup failed");

      const approveA = makeAction({
        accountKey: creator,
        parentHashes: [joinReqA.hash],
        payload: {
          type: "member-approved",
          memberPublicKey: pubKey(memberA),
          role: "member",
        },
        timestamp: 3000,
      });
      state = applyAction(state.data, approveA);
      if (!state.success) throw new Error("Setup failed");

      const joinReqB = makeAction({
        accountKey: memberB,
        parentHashes: [approveA.hash],
        payload: {
          type: "join-request",
          requesterPublicKey: pubKey(memberB),
        },
        timestamp: 4000,
      });
      state = applyAction(state.data, joinReqB);
      if (!state.success) throw new Error("Setup failed");

      const approveB = makeAction({
        accountKey: creator,
        parentHashes: [joinReqB.hash],
        payload: {
          type: "member-approved",
          memberPublicKey: pubKey(memberB),
          role: "member",
        },
        timestamp: 5000,
      });
      state = applyAction(state.data, approveB);
      if (!state.success) throw new Error("Setup failed");

      const leave = makeAction({
        accountKey: creator,
        parentHashes: [approveB.hash],
        payload: { type: "member-left" },
        timestamp: 6000,
      });
      const result = applyAction(state.data, leave);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.members.has(toHex(creator.publicKey))).toBe(false);
      expect(result.data.members.get(toHex(memberA.publicKey))?.role).toBe("owner");
      expect(result.data.members.get(toHex(memberB.publicKey))?.role).toBe("member");
    });
  });

  describe("applyAction — member-removed", () => {
    it("should allow admin to remove a member", () => {
      const creator = generateAccountKey();
      const joiner = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      let state = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state.success) throw new Error("Setup failed");

      const joinReq = makeAction({
        accountKey: joiner,
        parentHashes: [genesis.hash],
        payload: {
          type: "join-request",
          requesterPublicKey: pubKey(joiner),
        },
      });
      state = applyAction(state.data, joinReq);
      if (!state.success) throw new Error("Setup failed");

      const approve = makeAction({
        accountKey: creator,
        parentHashes: [joinReq.hash],
        payload: {
          type: "member-approved",
          memberPublicKey: pubKey(joiner),
          role: "member",
        },
      });
      state = applyAction(state.data, approve);
      if (!state.success) throw new Error("Setup failed");

      const remove = makeAction({
        accountKey: creator,
        parentHashes: [approve.hash],
        payload: {
          type: "member-removed",
          memberPublicKey: pubKey(joiner),
        },
      });

      const result = applyAction(state.data, remove);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.members.has(toHex(joiner.publicKey))).toBe(false);
    });

    it("should reject member removal by non-admin", () => {
      const creator = generateAccountKey();
      const member1 = generateAccountKey();
      const member2 = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      let state = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state.success) throw new Error("Setup failed");

      for (const m of [member1, member2]) {
        const joinReq = makeAction({
          accountKey: m,
          parentHashes: [genesis.hash],
          payload: {
            type: "join-request",
            requesterPublicKey: pubKey(m),
          },
        });
        state = applyAction(state.data, joinReq);
        if (!state.success) throw new Error("Setup failed");

        const approve = makeAction({
          accountKey: creator,
          parentHashes: [joinReq.hash],
          payload: {
            type: "member-approved",
            memberPublicKey: pubKey(m),
            role: "member",
          },
        });
        state = applyAction(state.data, approve);
        if (!state.success) throw new Error("Setup failed");
      }

      const remove = makeAction({
        accountKey: member1,
        parentHashes: [genesis.hash],
        payload: {
          type: "member-removed",
          memberPublicKey: pubKey(member2),
        },
      });

      const result = applyAction(state.data, remove);

      expect(result.success).toBe(false);
    });
  });

  describe("applyAction — role-changed", () => {
    it("should allow admin to promote a member", () => {
      const creator = generateAccountKey();
      const joiner = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      let state = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state.success) throw new Error("Setup failed");

      const joinReq = makeAction({
        accountKey: joiner,
        parentHashes: [genesis.hash],
        payload: {
          type: "join-request",
          requesterPublicKey: pubKey(joiner),
        },
      });
      state = applyAction(state.data, joinReq);
      if (!state.success) throw new Error("Setup failed");

      const approve = makeAction({
        accountKey: creator,
        parentHashes: [joinReq.hash],
        payload: {
          type: "member-approved",
          memberPublicKey: pubKey(joiner),
          role: "member",
        },
      });
      state = applyAction(state.data, approve);
      if (!state.success) throw new Error("Setup failed");

      const roleChange = makeAction({
        accountKey: creator,
        parentHashes: [approve.hash],
        payload: {
          type: "role-changed",
          memberPublicKey: pubKey(joiner),
          newRole: "admin",
        },
      });

      const result = applyAction(state.data, roleChange);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const member = result.data.members.get(toHex(joiner.publicKey));
      expect(member!.role).toBe("admin");
    });

    it("should reject role change by non-admin", () => {
      const creator = generateAccountKey();
      const member1 = generateAccountKey();
      const member2 = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      let state = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state.success) throw new Error("Setup failed");

      for (const m of [member1, member2]) {
        const approval = makeAction({
          accountKey: creator,
          parentHashes: [genesis.hash],
          payload: {
            type: "member-approved",
            memberPublicKey: pubKey(m),
            role: "member",
          },
        });
        state = applyAction(state.data, approval);
        if (!state.success) throw new Error("Setup failed");
      }

      const roleChange = makeAction({
        accountKey: member1,
        parentHashes: [genesis.hash],
        payload: {
          type: "role-changed",
          memberPublicKey: pubKey(member2),
          newRole: "admin",
        },
      });

      const result = applyAction(state.data, roleChange);

      expect(result.success).toBe(false);
    });

    it("should reject role change by admin who is not owner", () => {
      const creator = generateAccountKey();
      const admin = generateAccountKey();
      const member = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      let state = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state.success) throw new Error("Setup failed");

      const approveAdmin = makeAction({
        accountKey: creator,
        parentHashes: [genesis.hash],
        payload: {
          type: "member-approved",
          memberPublicKey: pubKey(admin),
          role: "admin",
        },
      });
      state = applyAction(state.data, approveAdmin);
      if (!state.success) throw new Error("Setup failed");

      const approveMember = makeAction({
        accountKey: creator,
        parentHashes: [approveAdmin.hash],
        payload: {
          type: "member-approved",
          memberPublicKey: pubKey(member),
          role: "member",
        },
      });
      state = applyAction(state.data, approveMember);
      if (!state.success) throw new Error("Setup failed");

      const unauthorizedRoleChange = makeAction({
        accountKey: admin,
        parentHashes: [approveMember.hash],
        payload: {
          type: "role-changed",
          memberPublicKey: pubKey(member),
          newRole: "admin",
        },
      });
      const result = applyAction(state.data, unauthorizedRoleChange);

      expect(result.success).toBe(false);
    });

    it("should transfer ownership and demote previous owner to admin", () => {
      const creator = generateAccountKey();
      const member = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      let state = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state.success) throw new Error("Setup failed");

      const approveMember = makeAction({
        accountKey: creator,
        parentHashes: [genesis.hash],
        payload: {
          type: "member-approved",
          memberPublicKey: pubKey(member),
          role: "member",
        },
      });
      state = applyAction(state.data, approveMember);
      if (!state.success) throw new Error("Setup failed");

      const transferOwnership = makeAction({
        accountKey: creator,
        parentHashes: [approveMember.hash],
        payload: {
          type: "role-changed",
          memberPublicKey: pubKey(member),
          newRole: "owner",
        },
      });
      const result = applyAction(state.data, transferOwnership);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.members.get(toHex(member.publicKey))?.role).toBe("owner");
      expect(result.data.members.get(toHex(creator.publicKey))?.role).toBe("admin");
    });

    it("should allow promoted admin to approve new members", () => {
      const creator = generateAccountKey();
      const promotee = generateAccountKey();
      const thirdMember = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      let state = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state.success) throw new Error("Setup failed");

      const approvePromotee = makeAction({
        accountKey: creator,
        parentHashes: [genesis.hash],
        payload: {
          type: "member-approved",
          memberPublicKey: pubKey(promotee),
          role: "member",
        },
      });
      state = applyAction(state.data, approvePromotee);
      if (!state.success) throw new Error("Setup failed");

      const promote = makeAction({
        accountKey: creator,
        parentHashes: [approvePromotee.hash],
        payload: {
          type: "role-changed",
          memberPublicKey: pubKey(promotee),
          newRole: "admin",
        },
      });
      state = applyAction(state.data, promote);
      if (!state.success) throw new Error("Setup failed");

      const approveThird = makeAction({
        accountKey: promotee,
        parentHashes: [promote.hash],
        payload: {
          type: "member-approved",
          memberPublicKey: pubKey(thirdMember),
          role: "member",
        },
        timestamp: 5000,
      });

      const result = applyAction(state.data, approveThird);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.members.size).toBe(3);
      const third = result.data.members.get(toHex(thirdMember.publicKey));
      expect(third).toBeDefined();
      expect(third!.role).toBe("member");
      expect(third!.joinedAt).toBe(5000);
    });

    it("should reject role change on own account", () => {
      const creator = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      const state1 = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state1.success) throw new Error("Setup failed");

      const roleChange = makeAction({
        accountKey: creator,
        parentHashes: [genesis.hash],
        payload: {
          type: "role-changed",
          memberPublicKey: pubKey(creator),
          newRole: "member",
        },
      });

      const result = applyAction(state1.data, roleChange);

      expect(result.success).toBe(false);
    });
  });

  describe("applyAction — group-renamed", () => {
    it("should allow admin to rename the group", () => {
      const creator = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Original" },
      });
      const state1 = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state1.success) throw new Error("Setup failed");

      const rename = makeAction({
        accountKey: creator,
        parentHashes: [genesis.hash],
        payload: { type: "group-renamed", newName: "Renamed" },
      });

      const result = applyAction(state1.data, rename);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.groupName).toBe("Renamed");
    });

    it("should reject rename from non-admin", () => {
      const creator = generateAccountKey();
      const joiner = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      let state = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state.success) throw new Error("Setup failed");

      const joinReq = makeAction({
        accountKey: joiner,
        parentHashes: [genesis.hash],
        payload: {
          type: "join-request",
          requesterPublicKey: pubKey(joiner),
        },
      });
      state = applyAction(state.data, joinReq);
      if (!state.success) throw new Error("Setup failed");

      const approve = makeAction({
        accountKey: creator,
        parentHashes: [joinReq.hash],
        payload: {
          type: "member-approved",
          memberPublicKey: pubKey(joiner),
          role: "member",
        },
      });
      state = applyAction(state.data, approve);
      if (!state.success) throw new Error("Setup failed");

      const rename = makeAction({
        accountKey: joiner,
        parentHashes: [approve.hash],
        payload: { type: "group-renamed", newName: "Unauthorized Rename" },
      });

      const result = applyAction(state.data, rename);

      expect(result.success).toBe(false);
    });
  });

  describe("applyAction — read-receipt", () => {
    it("should record read receipt for a member using hash", () => {
      const creator = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      const state1 = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state1.success) throw new Error("Setup failed");

      const msg = makeAction({
        accountKey: creator,
        parentHashes: [genesis.hash],
        payload: { type: "message", text: "Hello" },
      });
      const state2 = applyAction(state1.data, msg);
      if (!state2.success) throw new Error("Setup failed");

      const receipt = makeAction({
        accountKey: creator,
        parentHashes: [msg.hash],
        payload: { type: "read-receipt", upToHash: new Uint8Array(msg.hash) },
      });

      const result = applyAction(state2.data, receipt);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(
        result.data.readReceipts.get(toHex(creator.publicKey)),
      ).toBe(toHex(msg.hash));
    });

    it("should reject read receipt from non-member", () => {
      const creator = generateAccountKey();
      const outsider = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      const state1 = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state1.success) throw new Error("Setup failed");

      const msg = makeAction({
        accountKey: creator,
        parentHashes: [genesis.hash],
        payload: { type: "message", text: "Hello" },
      });
      const state2 = applyAction(state1.data, msg);
      if (!state2.success) throw new Error("Setup failed");

      const receipt = makeAction({
        accountKey: outsider,
        parentHashes: [msg.hash],
        payload: { type: "read-receipt", upToHash: new Uint8Array(msg.hash) },
      });

      const result = applyAction(state2.data, receipt);

      expect(result.success).toBe(false);
    });
  });

  describe("applyAction — merge", () => {
    it("should record merge timestamp for a member", () => {
      const creator = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
        timestamp: 1000,
      });
      const state1 = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state1.success) throw new Error("Setup failed");

      const merge = makeAction({
        accountKey: creator,
        parentHashes: [genesis.hash],
        payload: { type: "merge" },
        timestamp: 2000,
      });

      const result = applyAction(state1.data, merge);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(
        result.data.lastMergeTimestampByAuthor.get(toHex(creator.publicKey)),
      ).toBe(2000);
    });

    it("should reject merge from non-member", () => {
      const creator = generateAccountKey();
      const outsider = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
      });
      const state1 = applyAction(
        createActionChainGroupState(DEFAULT_GROUP_ID),
        genesis,
      );
      if (!state1.success) throw new Error("Setup failed");

      const merge = makeAction({
        accountKey: outsider,
        parentHashes: [genesis.hash],
        payload: { type: "merge" },
      });

      const result = applyAction(state1.data, merge);

      expect(result.success).toBe(false);
    });
  });

  describe("deriveGroupState", () => {
    it("should replay a full action log to derive state", () => {
      const creator = generateAccountKey();
      const joiner = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Derived Group" },
        timestamp: 1000,
      });

      const joinReq = makeAction({
        accountKey: joiner,
        parentHashes: [genesis.hash],
        payload: {
          type: "join-request",
          requesterPublicKey: pubKey(joiner),
        },
        timestamp: 2000,
      });

      const approve = makeAction({
        accountKey: creator,
        parentHashes: [joinReq.hash],
        payload: {
          type: "member-approved",
          memberPublicKey: pubKey(joiner),
          role: "member",
        },
        timestamp: 3000,
      });

      const msg = makeAction({
        accountKey: joiner,
        parentHashes: [approve.hash],
        payload: { type: "message", text: "I'm in!" },
        timestamp: 4000,
      });

      let dag = createActionDagState();
      dag = appendAction(dag, genesis);
      dag = appendAction(dag, joinReq);
      dag = appendAction(dag, approve);
      dag = appendAction(dag, msg);

      const actions = topologicalOrder(dag);
      const result = deriveGroupState(DEFAULT_GROUP_ID, actions);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.groupName).toBe("Derived Group");
      expect(result.data.members.size).toBe(2);
      expect(result.data.members.has(toHex(creator.publicKey))).toBe(true);
      expect(result.data.members.has(toHex(joiner.publicKey))).toBe(true);
      expect(result.data.createdAt).toBe(1000);
    });

    it("should skip invalid actions during derivation", () => {
      const creator = generateAccountKey();
      const outsider = generateAccountKey();

      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
        timestamp: 1000,
      });

      const unauthorizedMsg = makeAction({
        accountKey: outsider,
        parentHashes: [genesis.hash],
        payload: { type: "message", text: "Sneaky" },
        timestamp: 2000,
      });

      const validMsg = makeAction({
        accountKey: creator,
        parentHashes: [genesis.hash],
        payload: { type: "message", text: "Legit" },
        timestamp: 3000,
      });

      let dag = createActionDagState();
      dag = appendAction(dag, genesis);
      dag = appendAction(dag, unauthorizedMsg);
      dag = appendAction(dag, validMsg);

      const actions = topologicalOrder(dag);
      const result = deriveGroupState(DEFAULT_GROUP_ID, actions);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.members.size).toBe(1);
    });
  });

  describe("processBulkSignedActions", () => {
    it("should return unchanged state for empty batch", () => {
      const dag = createActionDagState();
      const groupState = createActionChainGroupState(DEFAULT_GROUP_ID);

      const result = processBulkSignedActions([], dag, groupState);

      expect(result.dag).toBe(dag);
      expect(result.groupState).toBe(groupState);
      expect(result.accepted).toEqual([]);
    });

    it("should process a single valid envelope", () => {
      const creator = generateAccountKey();
      const envelope = makeEnvelope({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Bulk Test" },
        timestamp: 1000,
      });

      const result = processBulkSignedActions(
        [envelope],
        createActionDagState(),
        createActionChainGroupState(DEFAULT_GROUP_ID),
      );

      expect(result.accepted).toHaveLength(1);
      expect(result.dag.actions.size).toBe(1);
      expect(result.groupState.groupName).toBe("Bulk Test");
      expect(result.groupState.members.size).toBe(1);
    });

    it("should skip duplicate envelopes", () => {
      const creator = generateAccountKey();
      const envelope = makeEnvelope({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Dup Test" },
        timestamp: 1000,
      });

      const result = processBulkSignedActions(
        [envelope, envelope],
        createActionDagState(),
        createActionChainGroupState(DEFAULT_GROUP_ID),
      );

      expect(result.accepted).toHaveLength(1);
      expect(result.dag.actions.size).toBe(1);
    });

    it("should skip envelopes with invalid signatures", () => {
      const creator = generateAccountKey();
      const validEnvelope = makeEnvelope({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Valid" },
        timestamp: 1000,
      });

      const invalidEnvelope: SignedActionEnvelope = {
        signedBytes: new Uint8Array([1, 2, 3]),
        signature: new Uint8Array(64),
        hash: new Uint8Array(32),
      };

      const result = processBulkSignedActions(
        [invalidEnvelope, validEnvelope],
        createActionDagState(),
        createActionChainGroupState(DEFAULT_GROUP_ID),
      );

      expect(result.accepted).toHaveLength(1);
      expect(result.groupState.groupName).toBe("Valid");
    });

    it("should produce same final state as sequential processing", () => {
      const creator = generateAccountKey();
      const joiner = generateAccountKey();

      const genesisEnv = makeEnvelope({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Sequential Test" },
        timestamp: 1000,
      });
      const genesis = verifyAndDecodeAction(genesisEnv);
      if (!genesis.success) throw new Error("Setup failed");

      const joinReqEnv = makeEnvelope({
        accountKey: joiner,
        parentHashes: [genesis.data.hash],
        payload: {
          type: "join-request",
          requesterPublicKey: pubKey(joiner),
        },
        timestamp: 2000,
      });
      const joinReq = verifyAndDecodeAction(joinReqEnv);
      if (!joinReq.success) throw new Error("Setup failed");

      const approveEnv = makeEnvelope({
        accountKey: creator,
        parentHashes: [joinReq.data.hash],
        payload: {
          type: "member-approved",
          memberPublicKey: pubKey(joiner),
          role: "member",
        },
        timestamp: 3000,
      });
      const approve = verifyAndDecodeAction(approveEnv);
      if (!approve.success) throw new Error("Setup failed");

      const msgEnv = makeEnvelope({
        accountKey: joiner,
        parentHashes: [approve.data.hash],
        payload: { type: "message", text: "Hello from bulk" },
        timestamp: 4000,
      });

      const envelopes = [genesisEnv, joinReqEnv, approveEnv, msgEnv];

      let seqDag = createActionDagState();
      for (const env of envelopes) {
        const decoded = verifyAndDecodeAction(env);
        if (!decoded.success) continue;
        seqDag = appendAction(seqDag, decoded.data);
      }
      const seqOrdered = topologicalOrder(seqDag);
      const seqState = deriveGroupState(DEFAULT_GROUP_ID, seqOrdered);
      if (!seqState.success) throw new Error("Sequential derivation failed");

      const bulkResult = processBulkSignedActions(
        envelopes,
        createActionDagState(),
        createActionChainGroupState(DEFAULT_GROUP_ID),
      );

      expect(bulkResult.dag.actions.size).toBe(seqDag.actions.size);
      expect(bulkResult.groupState.groupName).toBe(seqState.data.groupName);
      expect(bulkResult.groupState.members.size).toBe(seqState.data.members.size);
      expect(bulkResult.accepted).toHaveLength(4);

      for (const [hex] of seqDag.actions) {
        expect(bulkResult.dag.actions.has(hex)).toBe(true);
      }
    });
  });

  describe("validateMergePreConditions", () => {
    it("should reject merge referencing fewer than 2 current tips", () => {
      const creator = generateAccountKey();
      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
        timestamp: 1000,
      });

      let dag = createActionDagState();
      dag = appendAction(dag, genesis);

      const merge = makeAction({
        accountKey: creator,
        parentHashes: [genesis.hash],
        payload: { type: "merge" },
        timestamp: 2000,
      });

      const groupState = createActionChainGroupState(DEFAULT_GROUP_ID);
      const withMember = applyAction(groupState, genesis);
      if (!withMember.success) throw new Error("Setup failed");

      const result = validateMergePreConditions(merge, dag, withMember.data);

      expect(result.success).toBe(false);
    });

    it("should reject merge when rate limit is violated", () => {
      const creator = generateAccountKey();
      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
        timestamp: 1000,
      });

      const branch1 = makeAction({
        accountKey: creator,
        parentHashes: [genesis.hash],
        payload: { type: "message", text: "a" },
        timestamp: 2000,
      });
      const branch2 = makeAction({
        accountKey: creator,
        parentHashes: [genesis.hash],
        payload: { type: "message", text: "b" },
        timestamp: 2000,
      });

      let dag = createActionDagState();
      dag = appendAction(dag, genesis);
      dag = appendAction(dag, branch1);
      dag = appendAction(dag, branch2);

      const merge = makeAction({
        accountKey: creator,
        parentHashes: [branch1.hash, branch2.hash],
        payload: { type: "merge" },
        timestamp: 2030_000,
      });

      let groupState = createActionChainGroupState(DEFAULT_GROUP_ID);
      const s1 = applyAction(groupState, genesis);
      if (!s1.success) throw new Error("Setup failed");
      groupState = s1.data;

      const lastMergeTimestampByAuthor = new Map(groupState.lastMergeTimestampByAuthor);
      lastMergeTimestampByAuthor.set(toHex(creator.publicKey), 2000_000);
      groupState = { ...groupState, lastMergeTimestampByAuthor };

      const result = validateMergePreConditions(merge, dag, groupState);

      expect(result.success).toBe(false);
    });

    it("should accept merge referencing 2+ current tips within rate limit", () => {
      const creator = generateAccountKey();
      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
        timestamp: 1000,
      });

      const branch1 = makeAction({
        accountKey: creator,
        parentHashes: [genesis.hash],
        payload: { type: "message", text: "a" },
        timestamp: 2000,
      });
      const branch2 = makeAction({
        accountKey: creator,
        parentHashes: [genesis.hash],
        payload: { type: "message", text: "b" },
        timestamp: 2000,
      });

      let dag = createActionDagState();
      dag = appendAction(dag, genesis);
      dag = appendAction(dag, branch1);
      dag = appendAction(dag, branch2);

      const merge = makeAction({
        accountKey: creator,
        parentHashes: [branch1.hash, branch2.hash],
        payload: { type: "merge" },
        timestamp: 100_000,
      });

      let groupState = createActionChainGroupState(DEFAULT_GROUP_ID);
      const s1 = applyAction(groupState, genesis);
      if (!s1.success) throw new Error("Setup failed");

      const result = validateMergePreConditions(merge, dag, s1.data);

      expect(result.success).toBe(true);
    });

    it("should accept first merge from author with no rate limit history", () => {
      const creator = generateAccountKey();
      const genesis = makeAction({
        accountKey: creator,
        parentHashes: [GENESIS_HASH],
        payload: { type: "group-created", groupName: "Group" },
        timestamp: 1000,
      });

      const branch1 = makeAction({
        accountKey: creator,
        parentHashes: [genesis.hash],
        payload: { type: "message", text: "a" },
        timestamp: 2000,
      });
      const branch2 = makeAction({
        accountKey: creator,
        parentHashes: [genesis.hash],
        payload: { type: "message", text: "b" },
        timestamp: 2000,
      });

      let dag = createActionDagState();
      dag = appendAction(dag, genesis);
      dag = appendAction(dag, branch1);
      dag = appendAction(dag, branch2);

      const merge = makeAction({
        accountKey: creator,
        parentHashes: [branch1.hash, branch2.hash],
        payload: { type: "merge" },
        timestamp: 3000,
      });

      const s1 = applyAction(createActionChainGroupState(DEFAULT_GROUP_ID), genesis);
      if (!s1.success) throw new Error("Setup failed");

      const result = validateMergePreConditions(merge, dag, s1.data);

      expect(result.success).toBe(true);
    });
  });

  describe("validateParentHashCount", () => {
    it("should reject action with more than 4 parent hashes", () => {
      const fakeAction: SignedAction = {
        protocolVersion: 2,
        id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        groupId: DEFAULT_GROUP_ID,
        authorPublicKey: new Uint8Array(new ArrayBuffer(32)),
        timestamp: Date.now(),
        parentHashes: [
          new Uint8Array(32),
          new Uint8Array(32),
          new Uint8Array(32),
          new Uint8Array(32),
          new Uint8Array(32),
        ],
        payload: { type: "message", text: "test" },
        signature: new Uint8Array(new ArrayBuffer(64)),
        hash: new Uint8Array(new ArrayBuffer(32)),
      };

      const result = validateParentHashCount(fakeAction);

      expect(result.success).toBe(false);
    });

    it("should accept action with 4 or fewer parent hashes", () => {
      const action = makeAction({
        accountKey: generateAccountKey(),
        parentHashes: [GENESIS_HASH],
        payload: { type: "message", text: "test" },
      });

      const result = validateParentHashCount(action);

      expect(result.success).toBe(true);
    });
  });
});
