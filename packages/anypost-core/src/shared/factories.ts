import type {
  EncryptedMessage,
  MessageContent,
  WireMessage,
  GroupMetadata,
  Member,
  Channel,
  MessageRef,
  UserProfile,
} from "./schemas.js";
import {
  EncryptedMessageSchema,
  MessageContentSchema,
  WireMessageSchema,
  GroupMetadataSchema,
  MemberSchema,
  ChannelSchema,
  MessageRefSchema,
  UserProfileSchema,
} from "./schemas.js";

const DEFAULT_PEER_ID = "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn";
const DEFAULT_GROUP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const DEFAULT_CHANNEL_ID = "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const DEFAULT_MESSAGE_ID = "c2ffbc99-9c0b-4ef8-bb6d-6bb9bd380a33";
const DEFAULT_TIMESTAMP = 1700000000000;

export const createEncryptedMessage = (
  overrides?: Partial<EncryptedMessage>,
): EncryptedMessage =>
  EncryptedMessageSchema.parse({
    id: DEFAULT_MESSAGE_ID,
    groupId: DEFAULT_GROUP_ID,
    channelId: DEFAULT_CHANNEL_ID,
    senderPeerId: DEFAULT_PEER_ID,
    epoch: 0,
    ciphertext: new Uint8Array([1, 2, 3, 4]),
    timestamp: DEFAULT_TIMESTAMP,
    ...overrides,
  });

export const createMessageContent = (
  overrides?: Partial<MessageContent>,
): MessageContent =>
  MessageContentSchema.parse({
    type: "text",
    text: "Hello, world!",
    ...overrides,
  });

export const createWireMessage = (
  overrides?: Partial<WireMessage>,
): WireMessage =>
  WireMessageSchema.parse({
    type: "encrypted_message",
    payload: createEncryptedMessage(),
    ...overrides,
  });

const DEFAULT_ACCOUNT_KEY = "ed25519:testkey123";

export const createGroupMetadata = (
  overrides?: Partial<GroupMetadata>,
): GroupMetadata =>
  GroupMetadataSchema.parse({
    name: "Test Group",
    description: "A test group",
    createdAt: DEFAULT_TIMESTAMP,
    stewardPeerId: DEFAULT_PEER_ID,
    ...overrides,
  });

export const createMember = (
  overrides?: Partial<Member>,
): Member =>
  MemberSchema.parse({
    accountPublicKey: DEFAULT_ACCOUNT_KEY,
    role: "member",
    joinedAt: DEFAULT_TIMESTAMP,
    ...overrides,
  });

export const createChannel = (
  overrides?: Partial<Channel>,
): Channel =>
  ChannelSchema.parse({
    id: DEFAULT_CHANNEL_ID,
    name: "general",
    type: "text",
    sortOrder: 0,
    ...overrides,
  });

export const createMessageRef = (
  overrides?: Partial<MessageRef>,
): MessageRef =>
  MessageRefSchema.parse({
    id: DEFAULT_MESSAGE_ID,
    senderPeerId: DEFAULT_PEER_ID,
    timestamp: DEFAULT_TIMESTAMP,
    ...overrides,
  });

export const createUserProfile = (
  overrides?: Partial<UserProfile>,
): UserProfile =>
  UserProfileSchema.parse({
    displayName: "Test User",
    ...overrides,
  });
