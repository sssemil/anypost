import * as Y from "yjs";
import {
  GroupMetadataSchema,
  MemberSchema,
  ChannelSchema,
  MessageRefSchema,
} from "../shared/schemas.js";
import type {
  GroupId,
  GroupMetadata,
  Member,
  Channel,
  MessageRef,
  AccountPublicKey,
  ChannelId,
} from "../shared/schemas.js";

export const createGroupDocument = (groupId: GroupId): Y.Doc =>
  new Y.Doc({ guid: groupId });

export const setGroupMetadata = (doc: Y.Doc, metadata: GroupMetadata): void => {
  doc.transact(() => {
    const metadataMap = doc.getMap("metadata");
    for (const [key, value] of Object.entries(metadata)) {
      metadataMap.set(key, value);
    }
  });
};

export const getGroupMetadata = (doc: Y.Doc): GroupMetadata | null => {
  const metadataMap = doc.getMap("metadata");
  if (metadataMap.size === 0) return null;

  const raw = Object.fromEntries(metadataMap.entries());
  const result = GroupMetadataSchema.safeParse(raw);
  return result.success ? result.data : null;
};

export const addMember = (doc: Y.Doc, member: Member): void => {
  const membersMap = doc.getMap("members");
  membersMap.set(member.accountPublicKey, { ...member });
};

export const removeMember = (
  doc: Y.Doc,
  accountPublicKey: AccountPublicKey,
): void => {
  const membersMap = doc.getMap("members");
  membersMap.delete(accountPublicKey);
};

export const getMembers = (doc: Y.Doc): readonly Member[] =>
  Array.from(doc.getMap("members").values())
    .map((value) => MemberSchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data);

export const addChannel = (doc: Y.Doc, channel: Channel): void => {
  const channelsArray = doc.getArray<Channel>("channels");
  channelsArray.push([{ ...channel }]);
};

export const getChannels = (doc: Y.Doc): readonly Channel[] =>
  doc
    .getArray("channels")
    .toArray()
    .map((value) => ChannelSchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data);

export const createChannelInGroup = (
  doc: Y.Doc,
  options: { readonly name: string; readonly type: "text" | "voice" },
): Channel => {
  const channels = getChannels(doc);
  const sortOrder = channels.length === 0
    ? 0
    : Math.max(...channels.map((c) => c.sortOrder)) + 1;
  const channel = ChannelSchema.parse({
    id: crypto.randomUUID(),
    name: options.name,
    type: options.type,
    sortOrder,
  });
  addChannel(doc, channel);
  return channel;
};

export const deleteChannel = (doc: Y.Doc, channelId: ChannelId): void => {
  doc.transact(() => {
    const channelsArray = doc.getArray<Channel>("channels");
    const index = channelsArray.toArray().findIndex((ch) => ch.id === channelId);
    if (index !== -1) {
      channelsArray.delete(index, 1);
    }

    const messagesArray = doc.getArray(`messages:${channelId}`);
    if (messagesArray.length > 0) {
      messagesArray.delete(0, messagesArray.length);
    }
  });
};

export const appendMessage = (
  doc: Y.Doc,
  channelId: ChannelId,
  message: MessageRef,
): void => {
  const messagesArray = doc.getArray<MessageRef>(`messages:${channelId}`);
  messagesArray.push([{ ...message }]);
};

export const getChannelMessages = (
  doc: Y.Doc,
  channelId: ChannelId,
): readonly MessageRef[] =>
  doc
    .getArray(`messages:${channelId}`)
    .toArray()
    .map((value) => MessageRefSchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data);

export const storePendingWelcome = (
  doc: Y.Doc,
  accountPublicKey: AccountPublicKey,
  welcomeData: Uint8Array,
): void => {
  const welcomesMap = doc.getMap("pendingWelcomes");
  welcomesMap.set(accountPublicKey, welcomeData);
};

export const getPendingWelcome = (
  doc: Y.Doc,
  accountPublicKey: AccountPublicKey,
): Uint8Array | null => {
  const welcomesMap = doc.getMap("pendingWelcomes");
  const data = welcomesMap.get(accountPublicKey);
  if (!(data instanceof Uint8Array)) return null;
  return data;
};

export const removePendingWelcome = (
  doc: Y.Doc,
  accountPublicKey: AccountPublicKey,
): void => {
  const welcomesMap = doc.getMap("pendingWelcomes");
  welcomesMap.delete(accountPublicKey);
};
