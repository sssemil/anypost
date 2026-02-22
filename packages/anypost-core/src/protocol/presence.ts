import type { PeerId, ChannelId } from "../shared/schemas.js";

const HEARTBEAT_TIMEOUT_MS = 30_000;
const TYPING_TIMEOUT_MS = 5_000;

type PresenceTracker = {
  readonly heartbeats: ReadonlyMap<PeerId, number>;
  readonly typing: ReadonlyMap<ChannelId, ReadonlyMap<PeerId, number>>;
};

export const createPresenceTracker = (): PresenceTracker => ({
  heartbeats: new Map(),
  typing: new Map(),
});

export const recordHeartbeat = (
  tracker: PresenceTracker,
  peerId: PeerId,
): PresenceTracker => ({
  ...tracker,
  heartbeats: new Map([...tracker.heartbeats, [peerId, Date.now()]]),
});

export const isOnline = (tracker: PresenceTracker, peerId: PeerId): boolean => {
  const lastSeen = tracker.heartbeats.get(peerId);
  if (lastSeen === undefined) return false;
  return Date.now() - lastSeen <= HEARTBEAT_TIMEOUT_MS;
};

export const getOnlineMembers = (tracker: PresenceTracker): readonly PeerId[] =>
  [...tracker.heartbeats.keys()].filter((peerId) => isOnline(tracker, peerId));

export const recordTypingStart = (
  tracker: PresenceTracker,
  channelId: ChannelId,
  peerId: PeerId,
): PresenceTracker => {
  const channelTyping = tracker.typing.get(channelId) ?? new Map();
  return {
    ...tracker,
    typing: new Map([
      ...tracker.typing,
      [channelId, new Map([...channelTyping, [peerId, Date.now()]])],
    ]),
  };
};

export const getTypingMembers = (
  tracker: PresenceTracker,
  channelId: ChannelId,
): readonly PeerId[] => {
  const channelTyping = tracker.typing.get(channelId);
  if (!channelTyping) return [];
  const now = Date.now();
  return [...channelTyping.entries()]
    .filter(([, timestamp]) => now - timestamp <= TYPING_TIMEOUT_MS)
    .map(([peerId]) => peerId);
};
