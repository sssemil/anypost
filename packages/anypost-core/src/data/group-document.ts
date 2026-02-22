import * as Y from "yjs";
import { GroupMetadataSchema } from "../shared/schemas.js";
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
  const metadataMap = doc.getMap("metadata");
  metadataMap.set("name", metadata.name);
  metadataMap.set("description", metadata.description);
  metadataMap.set("createdAt", metadata.createdAt);
  metadataMap.set("stewardPeerId", metadata.stewardPeerId);
};

export const getGroupMetadata = (doc: Y.Doc): GroupMetadata | null => {
  const metadataMap = doc.getMap("metadata");
  if (metadataMap.size === 0) return null;

  const raw = {
    name: metadataMap.get("name"),
    description: metadataMap.get("description"),
    createdAt: metadataMap.get("createdAt"),
    stewardPeerId: metadataMap.get("stewardPeerId"),
  };

  const result = GroupMetadataSchema.safeParse(raw);
  return result.success ? result.data : null;
};

export const addMember = (doc: Y.Doc, member: Member): void => {
  const membersMap = doc.getMap("members");
  membersMap.set(member.accountPublicKey, {
    accountPublicKey: member.accountPublicKey,
    role: member.role,
    joinedAt: member.joinedAt,
  });
};

export const removeMember = (
  doc: Y.Doc,
  accountPublicKey: AccountPublicKey,
): void => {
  const membersMap = doc.getMap("members");
  membersMap.delete(accountPublicKey);
};

export const getMembers = (doc: Y.Doc): readonly Member[] => {
  const membersMap = doc.getMap("members");
  const members: Member[] = [];
  membersMap.forEach((value) => {
    members.push(value as Member);
  });
  return members;
};

export const addChannel = (doc: Y.Doc, channel: Channel): void => {
  const channelsArray = doc.getArray<Channel>("channels");
  channelsArray.push([{ ...channel }]);
};

export const getChannels = (doc: Y.Doc): readonly Channel[] => {
  const channelsArray = doc.getArray<Channel>("channels");
  return channelsArray.toArray();
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
): readonly MessageRef[] => {
  const messagesArray = doc.getArray<MessageRef>(`messages:${channelId}`);
  return messagesArray.toArray();
};
