import { z } from "zod";
import { GroupIdSchema, PeerIdSchema } from "../shared/schemas.js";

const Uint8ArraySchema = z.instanceof(Uint8Array);

const ActionIdSchema = z.string().uuid();

export const ActionRoleSchema = z.enum(["owner", "admin", "member"]);
const ApprovableRoleSchema = z.enum(["admin", "member"]);

export type ActionRole = z.infer<typeof ActionRoleSchema>;
export const JoinPolicySchema = z.enum(["manual", "auto_with_invite"]);
export type JoinPolicy = z.infer<typeof JoinPolicySchema>;

const DirectMessagePeerIdsSchema = z
  .tuple([PeerIdSchema, PeerIdSchema])
  .refine(([a, b]) => a.localeCompare(b) < 0, {
    message: "DM peer IDs must be unique and sorted ascending",
  });

export const ActionPayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("group-created"),
    groupName: z.string().min(1),
    joinPolicy: JoinPolicySchema.optional(),
  }),
  z.object({
    type: z.literal("dm-created"),
    peerIds: DirectMessagePeerIdsSchema,
  }),
  z.object({
    type: z.literal("join-request"),
    requesterPublicKey: Uint8ArraySchema,
  }),
  z.object({
    type: z.literal("member-approved"),
    memberPublicKey: Uint8ArraySchema,
    role: ApprovableRoleSchema,
    inviteTokenId: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal("member-left"),
  }),
  z.object({
    type: z.literal("member-removed"),
    memberPublicKey: Uint8ArraySchema,
  }),
  z.object({
    type: z.literal("role-changed"),
    memberPublicKey: Uint8ArraySchema,
    newRole: ActionRoleSchema,
  }),
  z.object({
    type: z.literal("group-renamed"),
    newName: z.string().min(1),
  }),
  z.object({
    type: z.literal("join-policy-changed"),
    joinPolicy: JoinPolicySchema,
  }),
  z.object({
    type: z.literal("message"),
    text: z.string().min(1),
  }),
  z.object({
    type: z.literal("message-edited"),
    targetActionId: ActionIdSchema,
    newText: z.string().min(1),
  }),
  z.object({
    type: z.literal("message-deleted"),
    targetActionId: ActionIdSchema,
  }),
  z.object({
    type: z.literal("read-receipt"),
    upToActionId: ActionIdSchema,
  }),
]);

export type ActionPayload = z.infer<typeof ActionPayloadSchema>;

export const SignableActionSchema = z.object({
  id: ActionIdSchema,
  groupId: GroupIdSchema,
  authorPublicKey: Uint8ArraySchema,
  timestamp: z.number(),
  parentHashes: z.array(Uint8ArraySchema),
  payload: ActionPayloadSchema,
});

export type SignableAction = z.infer<typeof SignableActionSchema>;

export const SignedActionEnvelopeSchema = z.object({
  signedBytes: Uint8ArraySchema,
  signature: Uint8ArraySchema,
  hash: Uint8ArraySchema,
});

export type SignedActionEnvelope = z.infer<typeof SignedActionEnvelopeSchema>;

export type SignedAction = SignableAction & {
  readonly signature: Uint8Array;
  readonly hash: Uint8Array;
};

export const GENESIS_HASH = new Uint8Array(32);

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export type GroupMember = {
  readonly publicKeyHex: string;
  readonly publicKey: Uint8Array;
  readonly role: ActionRole;
  readonly joinedAt: number;
};

export type ActionChainGroupState = {
  readonly groupId: string;
  readonly groupName: string;
  readonly isDirectMessage: boolean;
  readonly directMessagePeerIds: readonly [string, string] | null;
  readonly dmGenesisContributorPublicKeys: ReadonlySet<string>;
  readonly dmHandshakeComplete: boolean;
  readonly joinPolicy: JoinPolicy;
  readonly createdAt: number;
  readonly members: ReadonlyMap<string, GroupMember>;
  readonly pendingJoins: ReadonlyMap<string, Uint8Array>;
  readonly readReceipts: ReadonlyMap<string, string>;
};
