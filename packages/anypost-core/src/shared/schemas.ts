import { z } from "zod";

export const PeerIdSchema = z.string().min(1);

export const GroupIdSchema = z.string().uuid();

export const ChannelIdSchema = z.string().uuid();

export const MessageIdSchema = z.string().uuid();

export const AccountPublicKeySchema = z.string().min(1);

export type PeerId = z.infer<typeof PeerIdSchema>;
export type GroupId = z.infer<typeof GroupIdSchema>;
export type ChannelId = z.infer<typeof ChannelIdSchema>;
export type MessageId = z.infer<typeof MessageIdSchema>;
export type AccountPublicKey = z.infer<typeof AccountPublicKeySchema>;

const Uint8ArraySchema = z.instanceof(Uint8Array);

export const EncryptedMessageSchema = z.object({
  id: MessageIdSchema,
  groupId: GroupIdSchema,
  channelId: ChannelIdSchema,
  senderPeerId: PeerIdSchema,
  senderDisplayName: z.string().min(1).max(100).optional(),
  epoch: z.number().int().nonnegative(),
  ciphertext: Uint8ArraySchema,
  timestamp: z.number(),
});

export type EncryptedMessage = z.infer<typeof EncryptedMessageSchema>;

const AttachmentSchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().nonnegative(),
  data: Uint8ArraySchema,
});

export const MessageContentSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1),
  attachments: z.array(AttachmentSchema).optional(),
});

export type MessageContent = z.infer<typeof MessageContentSchema>;

const MlsCommitPayloadSchema = z.object({
  groupId: GroupIdSchema,
  epoch: z.number().int().nonnegative(),
  commitData: Uint8ArraySchema,
  senderPeerId: PeerIdSchema,
});

const SyncRequestPayloadSchema = z.object({
  groupId: GroupIdSchema,
  senderPeerId: PeerIdSchema,
  senderPublicKey: Uint8ArraySchema,
  signature: Uint8ArraySchema,
  targetPeerId: PeerIdSchema.optional(),
  // Legacy field kept for backward compatibility with old peers.
  stateVector: Uint8ArraySchema.optional(),
  // Cursor hash for action-chain sync.
  knownHash: Uint8ArraySchema.optional(),
});

const SignedActionEnvelopeWireSchema = z.object({
  signedBytes: Uint8ArraySchema,
  signature: Uint8ArraySchema,
  hash: Uint8ArraySchema,
});

const SyncResponsePayloadSchema = z.object({
  groupId: GroupIdSchema,
  senderPeerId: PeerIdSchema,
  senderPublicKey: Uint8ArraySchema,
  signature: Uint8ArraySchema,
  targetPeerId: PeerIdSchema,
  requestKnownHash: Uint8ArraySchema.optional(),
  headHash: Uint8ArraySchema.optional(),
  nextCursorHash: Uint8ArraySchema.optional(),
  envelopes: z.array(SignedActionEnvelopeWireSchema),
});

const InviteGrantClaimsSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("targeted-peer"),
    tokenId: z.string().uuid(),
    groupId: GroupIdSchema,
    issuedAt: z.number(),
    targetPeerId: PeerIdSchema,
  }),
  z.object({
    kind: z.literal("open"),
    tokenId: z.string().uuid(),
    groupId: GroupIdSchema,
    issuedAt: z.number(),
    expiresAt: z.number().optional(),
    maxJoiners: z.number().int().positive().optional(),
  }),
]);

const InviteGrantProofSchema = z.object({
  claims: InviteGrantClaimsSchema,
  issuerPublicKey: Uint8ArraySchema,
  signature: Uint8ArraySchema,
});

export type InviteGrantClaimsWire = z.infer<typeof InviteGrantClaimsSchema>;
export type InviteGrantProofWire = z.infer<typeof InviteGrantProofSchema>;

export const WireMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("encrypted_message"),
    payload: EncryptedMessageSchema,
  }),
  z.object({
    type: z.literal("mls_commit"),
    payload: MlsCommitPayloadSchema,
  }),
  z.object({
    type: z.literal("sync_request"),
    payload: SyncRequestPayloadSchema,
  }),
  z.object({
    type: z.literal("sync_response"),
    payload: SyncResponsePayloadSchema,
  }),
  z.object({
    type: z.literal("signed_action"),
    signedBytes: Uint8ArraySchema,
    signature: Uint8ArraySchema,
    hash: Uint8ArraySchema,
  }),
  z.object({
    type: z.literal("join_request"),
    groupId: GroupIdSchema,
    requesterPublicKey: Uint8ArraySchema,
    inviteGrant: InviteGrantProofSchema.optional(),
  }),
]);

export type WireMessage = z.infer<typeof WireMessageSchema>;

export const ChannelTypeSchema = z.enum(["text", "voice"]);

export const ChannelSchema = z.object({
  id: ChannelIdSchema,
  name: z.string().min(1),
  type: ChannelTypeSchema,
  sortOrder: z.number().int().nonnegative(),
});

export type Channel = z.infer<typeof ChannelSchema>;

export const MemberRoleSchema = z.enum(["owner", "admin", "member"]);

export const MemberSchema = z.object({
  accountPublicKey: AccountPublicKeySchema,
  role: MemberRoleSchema,
  joinedAt: z.number(),
});

export type Member = z.infer<typeof MemberSchema>;

export const GroupMetadataSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  createdAt: z.number(),
  stewardPeerId: PeerIdSchema,
  isDM: z.boolean().optional(),
});

export type GroupMetadata = z.infer<typeof GroupMetadataSchema>;

export const MessageRefSchema = z.object({
  id: MessageIdSchema,
  senderPeerId: PeerIdSchema,
  timestamp: z.number(),
});

export type MessageRef = z.infer<typeof MessageRefSchema>;

export const UserProfileSchema = z.object({
  displayName: z.string().min(1).max(100),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

export const NotificationPreferenceKeySchema = z.enum([
  "messages",
  "mentions",
  "sounds",
]);

export type NotificationPreferenceKey = z.infer<
  typeof NotificationPreferenceKeySchema
>;

export const NotificationPreferencesSchema = z.object({
  messages: z.boolean(),
  mentions: z.boolean(),
  sounds: z.boolean(),
});

export type NotificationPreferences = z.infer<
  typeof NotificationPreferencesSchema
>;

export const DeviceCertificateSchema = z.object({
  devicePeerId: PeerIdSchema,
  accountPublicKey: Uint8ArraySchema,
  timestamp: z.number(),
  signature: Uint8ArraySchema,
});

export type DeviceCertificate = z.infer<typeof DeviceCertificateSchema>;
