import type { EncryptedMessage, MessageContent, WireMessage } from "./schemas.js";

const DEFAULT_PEER_ID = "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn";
const DEFAULT_GROUP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const DEFAULT_CHANNEL_ID = "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const DEFAULT_MESSAGE_ID = "c2ffbc99-9c0b-4ef8-bb6d-6bb9bd380a33";

export const createEncryptedMessage = (
  overrides?: Partial<EncryptedMessage>,
): EncryptedMessage => ({
  id: DEFAULT_MESSAGE_ID,
  groupId: DEFAULT_GROUP_ID,
  channelId: DEFAULT_CHANNEL_ID,
  senderPeerId: DEFAULT_PEER_ID,
  epoch: 0,
  ciphertext: new Uint8Array([1, 2, 3, 4]),
  timestamp: Date.now(),
  ...overrides,
});

export const createMessageContent = (
  overrides?: Partial<MessageContent>,
): MessageContent => ({
  type: "text",
  text: "Hello, world!",
  ...overrides,
});

export const createWireMessage = (
  overrides?: Partial<WireMessage>,
): WireMessage => ({
  type: "encrypted_message",
  payload: createEncryptedMessage(),
  ...overrides,
} as WireMessage);
