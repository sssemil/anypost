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
  stateVector: Uint8ArraySchema,
  senderPeerId: PeerIdSchema,
});

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
]);

export type WireMessage = z.infer<typeof WireMessageSchema>;
