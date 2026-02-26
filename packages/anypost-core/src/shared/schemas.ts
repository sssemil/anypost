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
  requestId: z.string().uuid().optional(),
  targetPeerId: PeerIdSchema.optional(),
  knownHeads: z.array(Uint8ArraySchema),
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
  requestId: z.string().uuid().optional(),
  targetPeerId: PeerIdSchema,
  theirHeads: z.array(Uint8ArraySchema),
  envelopes: z.array(SignedActionEnvelopeWireSchema),
});

const HeadsAnnouncePayloadSchema = z.object({
  groupId: GroupIdSchema,
  heads: z.array(Uint8ArraySchema).max(64),
  approxDagSize: z.number().int().nonnegative().optional(),
  sentAt: z.number(),
  senderPeerId: PeerIdSchema,
  senderPublicKey: Uint8ArraySchema,
  signature: Uint8ArraySchema,
});

const DirectMessageRequestPayloadSchema = z.object({
  requestId: z.string().uuid(),
  senderPeerId: PeerIdSchema,
  senderPublicKey: Uint8ArraySchema,
  targetPeerId: PeerIdSchema,
  groupId: GroupIdSchema,
  groupName: z.string().min(1),
  inviteCode: z.string().min(1),
  sentAt: z.number(),
  signature: Uint8ArraySchema,
});

const ProfileRequestPayloadSchema = z.object({
  requestId: z.string().uuid(),
  senderPeerId: PeerIdSchema,
  senderPublicKey: Uint8ArraySchema,
  targetPeerId: PeerIdSchema,
  sentAt: z.number(),
  signature: Uint8ArraySchema,
});

const ProfileAnnouncePayloadSchema = z.object({
  senderPeerId: PeerIdSchema,
  senderPublicKey: Uint8ArraySchema,
  targetPeerId: PeerIdSchema.optional(),
  displayName: z.string().min(1).max(100),
  sentAt: z.number(),
  signature: Uint8ArraySchema,
});

const CallControlActionSchema = z.enum([
  "call-started",
  "call-ring",
  "call-accept",
  "call-decline",
  "call-join",
  "call-leave",
  "call-heartbeat",
  "call-end",
  "call-nudge",
]);

const CallControlPayloadSchema = z.object({
  action: CallControlActionSchema,
  groupId: GroupIdSchema,
  senderPeerId: PeerIdSchema,
  senderPublicKey: Uint8ArraySchema,
  targetPeerId: PeerIdSchema.optional(),
  muted: z.boolean().optional(),
  sentAt: z.number(),
  signature: Uint8ArraySchema,
});

export type CallControlAction = z.infer<typeof CallControlActionSchema>;
export type CallControlPayload = z.infer<typeof CallControlPayloadSchema>;

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

const DirectJoinRequestPayloadSchema = z.object({
  groupId: GroupIdSchema,
  senderPeerId: PeerIdSchema,
  requesterPublicKey: Uint8ArraySchema,
  targetPeerId: PeerIdSchema,
  signature: Uint8ArraySchema,
  inviteGrant: InviteGrantProofSchema.optional(),
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
    protocolVersion: z.literal(2),
    payload: SyncRequestPayloadSchema,
  }),
  z.object({
    type: z.literal("sync_response"),
    protocolVersion: z.literal(2),
    payload: SyncResponsePayloadSchema,
  }),
  z.object({
    type: z.literal("dm_request"),
    payload: DirectMessageRequestPayloadSchema,
  }),
  z.object({
    type: z.literal("join_request_direct"),
    protocolVersion: z.literal(2),
    payload: DirectJoinRequestPayloadSchema,
  }),
  z.object({
    type: z.literal("profile_request"),
    payload: ProfileRequestPayloadSchema,
  }),
  z.object({
    type: z.literal("profile_announce"),
    payload: ProfileAnnouncePayloadSchema,
  }),
  z.object({
    type: z.literal("call_control"),
    payload: CallControlPayloadSchema,
  }),
  z.object({
    type: z.literal("signed_action"),
    protocolVersion: z.literal(2),
    signedBytes: Uint8ArraySchema,
    signature: Uint8ArraySchema,
    hash: Uint8ArraySchema,
  }),
  z.object({
    type: z.literal("join_request"),
    protocolVersion: z.literal(2),
    groupId: GroupIdSchema,
    senderPeerId: PeerIdSchema,
    requesterPublicKey: Uint8ArraySchema,
    signature: Uint8ArraySchema,
    inviteGrant: InviteGrantProofSchema.optional(),
  }),
  z.object({
    type: z.literal("heads_announce"),
    protocolVersion: z.literal(2),
    payload: HeadsAnnouncePayloadSchema,
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
