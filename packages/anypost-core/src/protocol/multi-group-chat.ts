import { createLibp2p } from "libp2p";
import { privateKeyFromRaw, generateKeyPair } from "@libp2p/crypto/keys";
import { ed25519 } from "@noble/curves/ed25519.js";
import { encode } from "cbor-x";
import type { PubSub } from "@libp2p/interface";
import { tcp } from "@libp2p/tcp";
import { webSockets } from "@libp2p/websockets";
import * as wsFilters from "@libp2p/websockets/filters";
import { webRTC } from "@libp2p/webrtc";
import { circuitRelayTransport, RELAY_V2_HOP_CODEC } from "@libp2p/circuit-relay-v2";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { identify } from "@libp2p/identify";
import { dcutr } from "@libp2p/dcutr";
import { kadDHT } from "@libp2p/kad-dht";
import { ping } from "@libp2p/ping";
import type { Ping as PingService } from "@libp2p/ping";
import { bootstrap } from "@libp2p/bootstrap";
import { peerIdFromString } from "@libp2p/peer-id";
import { multiaddr } from "@multiformats/multiaddr";
import type { Multiaddr } from "@multiformats/multiaddr";
import { groupTopic } from "./router.js";
import { encodeWireMessage, decodeWireMessage } from "./codec.js";
import { buildCircuitRelayAddresses, extractRelayBaseAddress } from "./peer-id-sharing.js";
import { createProviderCid, ANYPOST_CHAT_NAMESPACE } from "./dht-config.js";
import { startRelayPoolManager } from "./relay-discovery.js";
import type { RelayPoolState } from "./relay-pool.js";
import { pubsubPeerDiscovery } from "@libp2p/pubsub-peer-discovery";
import { createGroupDiscoveryManager } from "./group-discovery.js";
import type { GroupDiscoveryManager } from "./group-discovery.js";
import type { GroupDiscoveryState } from "./group-discovery-state.js";
import type { WireMessage } from "../shared/schemas.js";
import { IPFS_BOOTSTRAP_WSS_PEERS } from "../libp2p/bootstrap-peers.js";
import type { ChatMessageEvent, PeerInfo, NetworkStatus, NetworkEvent } from "./plaintext-chat.js";
import type { AccountKey } from "../crypto/identity.js";
import { GENESIS_HASH, toHex } from "./action-chain.js";
import type { ActionChainGroupState, SignedActionEnvelope, SignedAction, JoinPolicy, ActionRole } from "./action-chain.js";
import { createSignedActionEnvelope, verifyAndDecodeAction } from "./action-signing.js";
import { createActionDagState, appendAction, getTips, topologicalOrder } from "./action-dag.js";
import type { ActionDagState } from "./action-dag.js";
import { createActionChainGroupState, deriveGroupState } from "./action-chain-state.js";
import type { GroupInvite } from "./group-invite.js";
import {
  validateInviteGrantForJoin,
  type InviteGrantProof,
} from "./invite-grant.js";
import {
  createRelayCandidateState,
  addCandidate,
  removeCandidate,
  updateRtt,
  markReservationActive,
  markReservationLost,
} from "./relay-candidate-state.js";
import type { RelayCandidateState } from "./relay-candidate-state.js";
import {
  createRelayReservationManager,
  type RelayReservationState,
} from "./relay-reservation-manager.js";
import {
  createJoinRetryState,
  enqueueJoinRetry,
  recordJoinRetryAttempt,
  removeJoinRetry,
  dueJoinRetries,
  markJoinRetryCancelled,
} from "./join-retry-queue.js";
import type { JoinRetryState } from "./join-retry-queue.js";

export type MultiGroupChatMessageEvent = ChatMessageEvent & {
  readonly groupId: string;
};

type MessageListener = (message: MultiGroupChatMessageEvent) => void;
type EventListener = (event: NetworkEvent) => void;

export type JoinRequestEvent = {
  readonly groupId: string;
  readonly requesterPublicKey: Uint8Array;
  readonly senderPeerId: string;
  readonly inviteTokenId?: string;
  readonly inviteValidationError?: string;
  readonly autoApproved: boolean;
  readonly alreadyMember: boolean;
};

type JoinRequestListener = (event: JoinRequestEvent) => void;

export type DirectMessageRequestEvent = {
  readonly requestId: string;
  readonly senderPeerId: string;
  readonly senderPublicKey: Uint8Array;
  readonly targetPeerId: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly inviteCode: string;
  readonly sentAt: number;
};

type DirectMessageRequestListener = (event: DirectMessageRequestEvent) => void;

export type DiscoveryProfile = "balanced" | "aggressive";

export type PeerDiscoveryMetrics = {
  readonly groupId: string;
  readonly searchRound: number;
  readonly providersFound: number;
  readonly newDialableAddresses: number;
  readonly dialAttempts: number;
  readonly dialSuccesses: number;
  readonly timeToFirstPeerMs: number | null;
};

export type ConnectionMetrics = {
  readonly startedAtMs: number;
  readonly timeToFirstPeerMs: number | null;
  readonly reservationAttempts: number;
  readonly reservationSuccesses: number;
  readonly reservationFailures: number;
  readonly renewAttempts: number;
  readonly renewSuccesses: number;
  readonly renewFailures: number;
  readonly activeReservations: number;
  readonly rotationCount: number;
  readonly relayedPeerConnections: number;
  readonly directPeerConnections: number;
  readonly directUpgradeAttempts: number;
  readonly directUpgradeSuccesses: number;
  readonly syncRequestsSent: number;
  readonly syncResponsesAccepted: number;
  readonly syncResponsesRejected: number;
};

export type SyncPeerProgress = {
  readonly lastRequestedAtMs: number | null;
  readonly lastRequestKnownHashHex: string | null;
  readonly lastServedAtMs: number | null;
  readonly lastServedKnownHashHex: string | null;
  readonly lastServedHeadHashHex: string | null;
  readonly lastServedEnvelopeCount: number;
  readonly lastReceivedAtMs: number | null;
  readonly lastReceivedHashHex: string | null;
  readonly lastReceivedEnvelopeCount: number;
};

export type SyncProgressState = ReadonlyMap<string, ReadonlyMap<string, SyncPeerProgress>>;

export type {
  JoinRetryState,
  JoinRetryEntry,
} from "./join-retry-queue.js";

export type MultiGroupChat = {
  readonly peerId: string;
  readonly multiaddrs: readonly Multiaddr[];
  readonly getPeerPrivateKey: () => Uint8Array;
  readonly joinGroup: (groupId: string) => void;
  readonly leaveGroup: (groupId: string) => Promise<void>;
  readonly getJoinedGroups: () => readonly string[];
  readonly sendMessage: (groupId: string, text: string, displayName?: string) => Promise<void>;
  readonly createGroup: (name: string) => Promise<{ groupId: string; genesisEnvelope: SignedActionEnvelope }>;
  readonly createGroupWithId: (groupId: string, name: string) => Promise<{ groupId: string; genesisEnvelope: SignedActionEnvelope }>;
  readonly joinViaInvite: (invite: GroupInvite) => Promise<{ groupId: string }>;
  readonly sendDirectMessageRequest: (request: {
    readonly targetPeerId: string;
    readonly groupId: string;
    readonly groupName: string;
    readonly inviteCode: string;
  }) => Promise<void>;
  readonly renameGroup: (groupId: string, newName: string) => Promise<void>;
  readonly approveJoin: (
    groupId: string,
    memberPublicKey: Uint8Array,
    options?: { readonly inviteTokenId?: string },
  ) => Promise<void>;
  readonly setJoinPolicy: (groupId: string, joinPolicy: JoinPolicy) => Promise<void>;
  readonly changeMemberRole: (
    groupId: string,
    memberPublicKey: Uint8Array,
    newRole: ActionRole,
  ) => Promise<void>;
  readonly removeMember: (groupId: string, memberPublicKey: Uint8Array) => Promise<void>;
  readonly requestJoin: (groupId: string) => Promise<void>;
  readonly getActionChainState: (groupId: string) => ActionChainGroupState | null;
  readonly getActionChainEnvelopes: (groupId: string) => readonly SignedActionEnvelope[];
  readonly getAllActionChainEnvelopes: () => ReadonlyMap<string, readonly SignedActionEnvelope[]>;
  readonly loadActionChain: (groupId: string, envelopes: readonly SignedActionEnvelope[]) => void;
  readonly getPublicKeyToPeerId: () => ReadonlyMap<string, string>;
  readonly getJoinRetryState: () => JoinRetryState;
  readonly getSyncProgressState: () => SyncProgressState;
  readonly onMessage: (listener: MessageListener) => () => void;
  readonly onJoinRequest: (listener: JoinRequestListener) => () => void;
  readonly onDirectMessageRequest: (listener: DirectMessageRequestListener) => () => void;
  readonly onPeerChange: (listener: (count: number) => void) => () => void;
  readonly onEvent: (listener: EventListener) => () => void;
  readonly getNetworkStatus: () => NetworkStatus;
  readonly connectTo: (addr: Multiaddr) => Promise<void>;
  readonly connectToPeerId: (targetPeerId: string) => Promise<void>;
  readonly pingPeer: (targetPeerId: string) => Promise<number>;
  readonly retryJoinNow: (groupId: string) => Promise<void>;
  readonly cancelJoinRetry: (groupId: string) => void;
  readonly addRelay: (addr: string) => void;
  readonly stop: () => Promise<void>;
};

type CreateMultiGroupChatOptions = {
  readonly accountKey: AccountKey;
  readonly peerPrivateKey?: Uint8Array;
  readonly initialPublicKeyToPeerId?: ReadonlyMap<string, string>;
  readonly initialPeerPathCache?: ReadonlyMap<string, readonly string[]>;
  readonly initialJoinRetryState?: JoinRetryState;
  readonly initialSyncProgressState?: SyncProgressState;
  readonly listenAddresses?: readonly string[];
  readonly bootstrapPeers?: readonly string[];
  readonly useTransports?: "tcp" | "websocket";
  readonly onRelayPoolStateChange?: (state: RelayPoolState) => void;
  readonly onGroupDiscoveryStateChange?: (state: GroupDiscoveryState) => void;
  readonly onRelayCandidateStateChange?: (state: RelayCandidateState) => void;
  readonly onPublicKeyToPeerIdChange?: (map: ReadonlyMap<string, string>) => void;
  readonly onPeerPathCacheChange?: (cache: ReadonlyMap<string, readonly string[]>) => void;
  readonly initialRelayHints?: readonly string[];
  readonly discoveryProfile?: DiscoveryProfile;
  readonly onPeerDiscoveryMetricsChange?: (metrics: PeerDiscoveryMetrics) => void;
  readonly onConnectionMetricsChange?: (metrics: ConnectionMetrics) => void;
  readonly onRelayReservationStateChange?: (state: RelayReservationState) => void;
  readonly onJoinRetryStateChange?: (state: JoinRetryState) => void;
  readonly onSyncProgressStateChange?: (state: SyncProgressState) => void;
  readonly syncReconcileIntervalMs?: number;
  readonly syncReconcileStaleMs?: number;
  readonly onApprovalReceived?: (groupId: string) => void;
  readonly getDisplayName?: () => string | undefined;
  readonly onProfileAnnounce?: (peerId: string, displayName: string) => void;
};

const MAX_CACHED_PEER_PATHS_PER_PEER = 4;
const MAX_CACHED_PEER_PATH_PEERS = 200;
const DIAL_CANDIDATE_LIMIT = 3;
const DIAL_CANDIDATE_CONCURRENCY = 2;
const DIAL_BACKOFF_BASE_MS = 1_000;
const DIAL_BACKOFF_MAX_MS = 30_000;
const AGGRESSIVE_DISCOVERY_SEARCH_SCHEDULE_MS = [0, 1_500, 4_000, 9_000] as const;
const BALANCED_DISCOVERY_SEARCH_SCHEDULE_MS = [0, 5_000] as const;
const DIRECT_UPGRADE_WINDOW_MS = 60_000;
const JOIN_RETRY_TICK_INTERVAL_MS = 2_000;
const MAX_SYNC_ENVELOPES_PER_RESPONSE = 256;
const INCOMING_JOIN_REQUEST_WINDOW_MS = 30_000;
const INCOMING_JOIN_REQUEST_MAX = 8;
const INCOMING_SYNC_REQUEST_WINDOW_MS = 10_000;
const INCOMING_SYNC_REQUEST_MAX = 40;
const OUTGOING_JOIN_REQUEST_WINDOW_MS = 30_000;
const OUTGOING_JOIN_REQUEST_MAX = 10;
const OUTGOING_SYNC_REQUEST_WINDOW_MS = 10_000;
const OUTGOING_SYNC_REQUEST_MAX = 60;
const OUTGOING_APPROVAL_WINDOW_MS = 30_000;
const OUTGOING_APPROVAL_MAX = 10;
const SYNC_REQUEST_TRACK_TTL_MS = 60_000;
const MAX_SYNC_REQUEST_TRACKED = 4_096;
const MAX_SYNC_PROGRESS_PEERS_PER_GROUP = 128;
const SYNC_PROGRESS_STALE_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_SYNC_RECONCILE_INTERVAL_MS = 20_000;
const DEFAULT_SYNC_RECONCILE_STALE_MS = 45_000;
const DIRECT_MESSAGE_REQUEST_TOPIC = "anypost/system/dm-requests/v1";
const PROFILE_SYNC_TOPIC = "anypost/system/profile/v1";

export const createMultiGroupChat = async (
  options: CreateMultiGroupChatOptions,
): Promise<MultiGroupChat> => {
  const {
    accountKey,
    peerPrivateKey: rawPeerPrivateKey,
    initialPublicKeyToPeerId,
    initialPeerPathCache,
    initialJoinRetryState,
    initialSyncProgressState,
    listenAddresses = [],
    bootstrapPeers: initialBootstrapPeers = [],
    useTransports = "websocket",
    onRelayPoolStateChange,
    onGroupDiscoveryStateChange,
    onRelayCandidateStateChange,
    onPublicKeyToPeerIdChange,
    onPeerPathCacheChange,
    initialRelayHints = [],
    discoveryProfile = "balanced",
    onPeerDiscoveryMetricsChange,
    onConnectionMetricsChange,
    onRelayReservationStateChange,
    onJoinRetryStateChange,
    onSyncProgressStateChange,
    syncReconcileIntervalMs = DEFAULT_SYNC_RECONCILE_INTERVAL_MS,
    syncReconcileStaleMs = DEFAULT_SYNC_RECONCILE_STALE_MS,
    onApprovalReceived,
    getDisplayName,
    onProfileAnnounce,
  } = options;

  const privateKey = rawPeerPrivateKey
    ? privateKeyFromRaw(new Uint8Array(rawPeerPrivateKey))
    : await generateKeyPair("Ed25519");

  const relayPeers = [...initialBootstrapPeers];

  const isBrowser = useTransports === "websocket";

  const allBootstrapPeers = isBrowser
    ? [...relayPeers, ...IPFS_BOOTSTRAP_WSS_PEERS]
    : [...relayPeers];

  const pubsubDiscovery = isBrowser
    ? [
        pubsubPeerDiscovery({
          interval: 10_000,
          topics: ["_peer-discovery._p2p._pubsub", "anypost/_peer-discovery"],
          listenOnly: false,
        }),
      ]
    : [];

  const peerDiscovery =
    allBootstrapPeers.length > 0
      ? [bootstrap({ list: allBootstrapPeers }), ...pubsubDiscovery]
      : [...pubsubDiscovery];

  const node = isBrowser
    ? await createLibp2p({
        privateKey,
        addresses: { listen: [...listenAddresses, "/p2p-circuit", "/webrtc"] },
        transports: [
          webSockets({ filter: wsFilters.all }),
          webRTC({
            rtcConfiguration: {
              iceServers: [
                { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
              ],
            },
          }),
          circuitRelayTransport(),
        ],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        connectionGater: { denyDialMultiaddr: async () => false },
        peerDiscovery,
        services: {
          identify: identify(),
          pubsub: gossipsub({
            allowPublishToZeroTopicPeers: true,
            runOnLimitedConnection: true,
          }),
          dcutr: dcutr(),
          ping: ping(),
          dht: kadDHT({ clientMode: true }),
        },
      })
    : await createLibp2p({
        privateKey,
        addresses: { listen: [...listenAddresses] },
        transports: [tcp()],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        peerDiscovery,
        services: {
          identify: identify(),
          pubsub: gossipsub({
            allowPublishToZeroTopicPeers: true,
            runOnLimitedConnection: true,
          }),
        },
      });

  const pubsub = node.services.pubsub as PubSub;
  const topicToGroupId = new Map<string, string>();
  const joinedGroups: string[] = [];
  const messageListeners: MessageListener[] = [];
  const joinRequestListeners: JoinRequestListener[] = [];
  const directMessageRequestListeners: DirectMessageRequestListener[] = [];
  const peerChangeListeners: Array<(count: number) => void> = [];
  const eventListeners: EventListener[] = [];

  const actionDags = new Map<string, ActionDagState>();
  const actionChainStates = new Map<string, ActionChainGroupState>();
  const actionEnvelopes = new Map<string, SignedActionEnvelope[]>();
  const publicKeyToPeerId = new Map<string, string>(initialPublicKeyToPeerId ?? []);
  const peerPathCache = new Map<string, string[]>();
  const peerDiscoveryHints = new Map<string, string[]>();
  const joinInviteGrantByGroup = new Map<string, InviteGrantProof>();
  const pendingJoinInviteGrantsByGroup = new Map<string, Map<string, InviteGrantProof>>();

  type MutablePeerDiscoveryMetrics = {
    groupId: string;
    startedAtMs: number;
    searchRound: number;
    providersFound: number;
    newDialableAddresses: number;
    dialAttempts: number;
    dialSuccesses: number;
    timeToFirstPeerMs: number | null;
  };
  const peerDiscoveryMetrics = new Map<string, MutablePeerDiscoveryMetrics>();
  let joinRetryState = createJoinRetryState(initialJoinRetryState);
  const syncProgressByGroup = new Map<string, Map<string, SyncPeerProgress>>();
  type RateWindow = {
    windowStartMs: number;
    count: number;
  };
  const incomingJoinRequestRate = new Map<string, RateWindow>();
  const incomingSyncRequestRate = new Map<string, RateWindow>();
  const outgoingJoinRequestRate = new Map<string, RateWindow>();
  const outgoingSyncRequestRate = new Map<string, RateWindow>();
  const outgoingApprovalRate = new Map<string, RateWindow>();
  const pendingSyncRequests = new Map<string, number>();
  const seenSyncResponses = new Map<string, number>();

  const isRateLimited = (
    bucket: Map<string, RateWindow>,
    key: string,
    maxEvents: number,
    windowMs: number,
  ): boolean => {
    const now = Date.now();
    const current = bucket.get(key);
    if (!current || now - current.windowStartMs >= windowMs) {
      bucket.set(key, { windowStartMs: now, count: 1 });
      return false;
    }

    const nextCount = current.count + 1;
    bucket.set(key, { windowStartMs: current.windowStartMs, count: nextCount });
    return nextCount > maxEvents;
  };

  const createSyncRequestKey = (groupId: string, peerId: string, requestId: string): string =>
    `${groupId}:${peerId}:${requestId}`;

  const pruneTimedMap = (bucket: Map<string, number>, ttlMs: number, maxEntries: number) => {
    const now = Date.now();
    for (const [key, atMs] of bucket.entries()) {
      if (now - atMs > ttlMs) {
        bucket.delete(key);
      }
    }

    if (bucket.size <= maxEntries) return;
    const oldestEntries = [...bucket.entries()].sort((a, b) => a[1] - b[1]);
    for (let idx = 0; idx < oldestEntries.length - maxEntries; idx += 1) {
      bucket.delete(oldestEntries[idx][0]);
    }
  };

  const cloneSyncProgressState = (): SyncProgressState =>
    new Map(
      [...syncProgressByGroup.entries()].map(([groupId, peerMap]) => [
        groupId,
        new Map(peerMap),
      ]),
    );

  const emitSyncProgressState = () => {
    onSyncProgressStateChange?.(cloneSyncProgressState());
  };

  const defaultSyncPeerProgress = (): SyncPeerProgress => ({
    lastRequestedAtMs: null,
    lastRequestKnownHashHex: null,
    lastServedAtMs: null,
    lastServedKnownHashHex: null,
    lastServedHeadHashHex: null,
    lastServedEnvelopeCount: 0,
    lastReceivedAtMs: null,
    lastReceivedHashHex: null,
    lastReceivedEnvelopeCount: 0,
  });

  const syncProgressActivityAtMs = (progress: SyncPeerProgress): number =>
    Math.max(
      progress.lastRequestedAtMs ?? 0,
      progress.lastServedAtMs ?? 0,
      progress.lastReceivedAtMs ?? 0,
    );

  const pruneSyncProgressForGroup = (groupId: string) => {
    const byPeer = syncProgressByGroup.get(groupId);
    if (!byPeer) return;
    const now = Date.now();

    for (const [peerId, progress] of [...byPeer.entries()]) {
      const lastActivityAt = syncProgressActivityAtMs(progress);
      if (lastActivityAt > 0 && now - lastActivityAt > SYNC_PROGRESS_STALE_MS) {
        byPeer.delete(peerId);
      }
    }

    if (byPeer.size > MAX_SYNC_PROGRESS_PEERS_PER_GROUP) {
      const entriesByFreshness = [...byPeer.entries()]
        .sort((a, b) => syncProgressActivityAtMs(b[1]) - syncProgressActivityAtMs(a[1]));
      const keep = new Set(entriesByFreshness
        .slice(0, MAX_SYNC_PROGRESS_PEERS_PER_GROUP)
        .map(([peerId]) => peerId));
      for (const peerId of byPeer.keys()) {
        if (!keep.has(peerId)) {
          byPeer.delete(peerId);
        }
      }
    }

    if (byPeer.size === 0) {
      syncProgressByGroup.delete(groupId);
    } else {
      syncProgressByGroup.set(groupId, byPeer);
    }
  };

  const patchSyncProgress = (
    groupId: string,
    peerId: string,
    patch: Partial<SyncPeerProgress>,
  ) => {
    const byPeer = syncProgressByGroup.get(groupId) ?? new Map<string, SyncPeerProgress>();
    const current = byPeer.get(peerId) ?? defaultSyncPeerProgress();
    byPeer.set(peerId, { ...current, ...patch });
    syncProgressByGroup.set(groupId, byPeer);
    pruneSyncProgressForGroup(groupId);
    emitSyncProgressState();
  };

  for (const [groupId, peerMap] of initialSyncProgressState ?? []) {
    const byPeer = new Map<string, SyncPeerProgress>();
    for (const [peerId, progress] of peerMap) {
      byPeer.set(peerId, {
        lastRequestedAtMs: progress.lastRequestedAtMs ?? null,
        lastRequestKnownHashHex: progress.lastRequestKnownHashHex ?? null,
        lastServedAtMs: progress.lastServedAtMs ?? null,
        lastServedKnownHashHex: progress.lastServedKnownHashHex ?? null,
        lastServedHeadHashHex: progress.lastServedHeadHashHex ?? null,
        lastServedEnvelopeCount: progress.lastServedEnvelopeCount ?? 0,
        lastReceivedAtMs: progress.lastReceivedAtMs ?? null,
        lastReceivedHashHex: progress.lastReceivedHashHex ?? null,
        lastReceivedEnvelopeCount: progress.lastReceivedEnvelopeCount ?? 0,
      });
    }
    if (byPeer.size > 0) {
      syncProgressByGroup.set(groupId, byPeer);
      pruneSyncProgressForGroup(groupId);
    }
  }

  const getInviteGrantApprovalCount = (groupId: string, tokenId: string): number => {
    const dag = actionDags.get(groupId);
    if (!dag) return 0;
    let count = 0;
    for (const action of topologicalOrder(dag)) {
      if (action.payload.type !== "member-approved") continue;
      if (action.payload.inviteTokenId === tokenId) {
        count += 1;
      }
    }
    return count;
  };

  const getOrCreatePeerDiscoveryMetrics = (groupId: string): MutablePeerDiscoveryMetrics => {
    const existing = peerDiscoveryMetrics.get(groupId);
    if (existing) return existing;
    const created: MutablePeerDiscoveryMetrics = {
      groupId,
      startedAtMs: Date.now(),
      searchRound: 0,
      providersFound: 0,
      newDialableAddresses: 0,
      dialAttempts: 0,
      dialSuccesses: 0,
      timeToFirstPeerMs: null,
    };
    peerDiscoveryMetrics.set(groupId, created);
    return created;
  };

  const emitPeerDiscoveryMetrics = (groupId: string) => {
    const metrics = peerDiscoveryMetrics.get(groupId);
    if (!metrics) return;
    onPeerDiscoveryMetricsChange?.({
      groupId: metrics.groupId,
      searchRound: metrics.searchRound,
      providersFound: metrics.providersFound,
      newDialableAddresses: metrics.newDialableAddresses,
      dialAttempts: metrics.dialAttempts,
      dialSuccesses: metrics.dialSuccesses,
      timeToFirstPeerMs: metrics.timeToFirstPeerMs,
    });
  };

  const emitJoinRetryState = () => {
    onJoinRetryStateChange?.(createJoinRetryState(joinRetryState));
  };

  const connectionMetrics: {
    startedAtMs: number;
    timeToFirstPeerMs: number | null;
    reservationAttempts: number;
    reservationSuccesses: number;
    reservationFailures: number;
    renewAttempts: number;
    renewSuccesses: number;
    renewFailures: number;
    activeReservations: number;
    rotationCount: number;
    relayedPeerConnections: number;
    directPeerConnections: number;
    directUpgradeAttempts: number;
    directUpgradeSuccesses: number;
    syncRequestsSent: number;
    syncResponsesAccepted: number;
    syncResponsesRejected: number;
  } = {
    startedAtMs: Date.now(),
    timeToFirstPeerMs: null,
    reservationAttempts: 0,
    reservationSuccesses: 0,
    reservationFailures: 0,
    renewAttempts: 0,
    renewSuccesses: 0,
    renewFailures: 0,
    activeReservations: 0,
    rotationCount: 0,
    relayedPeerConnections: 0,
    directPeerConnections: 0,
    directUpgradeAttempts: 0,
    directUpgradeSuccesses: 0,
    syncRequestsSent: 0,
    syncResponsesAccepted: 0,
    syncResponsesRejected: 0,
  };

  const emitConnectionMetrics = () => {
    onConnectionMetricsChange?.({
      startedAtMs: connectionMetrics.startedAtMs,
      timeToFirstPeerMs: connectionMetrics.timeToFirstPeerMs,
      reservationAttempts: connectionMetrics.reservationAttempts,
      reservationSuccesses: connectionMetrics.reservationSuccesses,
      reservationFailures: connectionMetrics.reservationFailures,
      renewAttempts: connectionMetrics.renewAttempts,
      renewSuccesses: connectionMetrics.renewSuccesses,
      renewFailures: connectionMetrics.renewFailures,
      activeReservations: connectionMetrics.activeReservations,
      rotationCount: connectionMetrics.rotationCount,
      relayedPeerConnections: connectionMetrics.relayedPeerConnections,
      directPeerConnections: connectionMetrics.directPeerConnections,
      directUpgradeAttempts: connectionMetrics.directUpgradeAttempts,
      directUpgradeSuccesses: connectionMetrics.directUpgradeSuccesses,
      syncRequestsSent: connectionMetrics.syncRequestsSent,
      syncResponsesAccepted: connectionMetrics.syncResponsesAccepted,
      syncResponsesRejected: connectionMetrics.syncResponsesRejected,
    });
  };

  const pendingDirectUpgradeByPeer = new Map<string, number>();

  const normalizePathList = (paths: readonly string[]): string[] => {
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const rawPath of paths) {
      const path = rawPath.trim();
      if (path.length === 0 || seen.has(path)) continue;
      seen.add(path);
      deduped.push(path);
      if (deduped.length >= MAX_CACHED_PEER_PATHS_PER_PEER) break;
    }
    return deduped;
  };

  const clonePeerPathCache = (): ReadonlyMap<string, readonly string[]> =>
    new Map([...peerPathCache.entries()].map(([peerId, paths]) => [peerId, [...paths]]));

  const notifyPeerPathCacheChange = () => {
    onPeerPathCacheChange?.(clonePeerPathCache());
  };

  for (const [peerId, paths] of initialPeerPathCache ?? []) {
    const normalized = normalizePathList(paths);
    if (normalized.length > 0) {
      peerPathCache.set(peerId, normalized);
      if (peerPathCache.size >= MAX_CACHED_PEER_PATH_PEERS) break;
    }
  }

  const getPinnedPeerIds = (): ReadonlySet<string> => {
    const pinned = new Set<string>();
    for (const groupId of joinedGroups) {
      const chainState = actionChainStates.get(groupId);
      if (!chainState) continue;
      for (const member of chainState.members.values()) {
        const peerId = publicKeyToPeerId.get(member.publicKeyHex);
        if (peerId && peerId !== node.peerId.toString()) {
          pinned.add(peerId);
        }
      }
    }
    return pinned;
  };

  const hasCompleteMembershipContext = (): boolean => {
    if (joinedGroups.length === 0) return false;
    for (const groupId of joinedGroups) {
      if (!actionChainStates.has(groupId)) return false;
    }
    return true;
  };

  const reconcilePeerPathCache = (force = false) => {
    if (!force && !hasCompleteMembershipContext()) return;

    const pinned = getPinnedPeerIds();
    let changed = false;

    for (const peerId of [...peerPathCache.keys()]) {
      if (pinned.has(peerId)) continue;
      peerPathCache.delete(peerId);
      changed = true;
    }

    while (peerPathCache.size > MAX_CACHED_PEER_PATH_PEERS) {
      const oldestPeerId = peerPathCache.keys().next().value as string | undefined;
      if (!oldestPeerId) break;
      peerPathCache.delete(oldestPeerId);
      changed = true;
    }

    if (changed) {
      notifyPeerPathCacheChange();
    }
  };

  const recordSuccessfulPeerPath = (peerId: string, path: string) => {
    const normalizedPath = path.trim();
    if (normalizedPath.length === 0) return;
    if (!getPinnedPeerIds().has(peerId)) return;

    const current = peerPathCache.get(peerId) ?? [];
    const next = normalizePathList([normalizedPath, ...current]);
    if (next.length === 0) return;

    const unchanged =
      current.length === next.length &&
      current.every((value, idx) => value === next[idx]);

    if (unchanged) return;

    peerPathCache.delete(peerId);
    peerPathCache.set(peerId, next);

    while (peerPathCache.size > MAX_CACHED_PEER_PATH_PEERS) {
      const oldestPeerId = peerPathCache.keys().next().value as string | undefined;
      if (!oldestPeerId) break;
      peerPathCache.delete(oldestPeerId);
    }

    notifyPeerPathCacheChange();
  };

  const forgetPeerPath = (peerId: string, path: string) => {
    const existing = peerPathCache.get(peerId);
    if (!existing) return;

    const filtered = existing.filter((cachedPath) => cachedPath !== path);
    if (filtered.length === existing.length) return;

    if (filtered.length === 0) {
      peerPathCache.delete(peerId);
    } else {
      peerPathCache.set(peerId, filtered);
    }

    notifyPeerPathCacheChange();
  };

  const KEEP_ALIVE_TAG = "keep-alive-group-member";

  const tagGroupMemberKeepAlive = (memberPeerId: string) => {
    if (memberPeerId === node.peerId.toString()) return;
    try {
      const remote = peerIdFromString(memberPeerId);
      node.peerStore.merge(remote, {
        tags: { [KEEP_ALIVE_TAG]: { value: 100 } },
      }).catch(() => {});
    } catch {
      // Invalid peer ID — skip tagging
    }
  };

  const notifyPublicKeyToPeerIdChange = () => {
    onPublicKeyToPeerIdChange?.(new Map(publicKeyToPeerId));
    for (const memberPeerId of publicKeyToPeerId.values()) {
      tagGroupMemberKeepAlive(memberPeerId);
    }
    reconcilePeerPathCache();
  };

  publicKeyToPeerId.set(toHex(new Uint8Array(accountKey.publicKey)), node.peerId.toString());
  notifyPublicKeyToPeerIdChange();

  let relayCandidateState = createRelayCandidateState();
  const relayReservationManager = createRelayReservationManager({
    targetActive: 3,
    onStateChange: (reservationState) => {
      connectionMetrics.activeReservations = [...reservationState.entries.values()]
        .filter((entry) => entry.status === "active" || entry.status === "renewing")
        .length;
      connectionMetrics.rotationCount = reservationState.rotationCount;
      emitConnectionMetrics();
      onRelayReservationStateChange?.(reservationState);
    },
  });

  const updateRelayCandidateState = (next: RelayCandidateState) => {
    relayCandidateState = next;
    onRelayCandidateStateChange?.(relayCandidateState);
  };

  for (const relayHint of initialRelayHints) {
    relayReservationManager.ingestRelayAddress(relayHint);
  }
  for (const relayAddr of relayPeers) {
    relayReservationManager.ingestRelayAddress(relayAddr);
  }
  emitConnectionMetrics();
  emitJoinRetryState();
  emitSyncProgressState();

  const getOrCreateDag = (groupId: string): ActionDagState => {
    const existing = actionDags.get(groupId);
    if (existing) return existing;
    const dag = createActionDagState();
    actionDags.set(groupId, dag);
    return dag;
  };

  const ownPublicKeyHex = toHex(new Uint8Array(accountKey.publicKey));
  const ownPeerId = node.peerId.toString();

  const publishEnvelope = async (groupId: string, envelope: SignedActionEnvelope) => {
    const topic = groupTopic(groupId);
    const wireMessage: WireMessage = {
      type: "signed_action",
      signedBytes: envelope.signedBytes,
      signature: envelope.signature,
      hash: envelope.hash,
    };
    await pubsub.publish(topic, encodeWireMessage(wireMessage));
  };

  const getOrderedEnvelopes = (groupId: string): readonly SignedActionEnvelope[] => {
    const dag = actionDags.get(groupId);
    if (!dag) return actionEnvelopes.get(groupId) ?? [];

    const byHash = new Map<string, SignedActionEnvelope>();
    for (const envelope of actionEnvelopes.get(groupId) ?? []) {
      byHash.set(toHex(envelope.hash), envelope);
    }

    const ordered: SignedActionEnvelope[] = [];
    for (const action of topologicalOrder(dag)) {
      const envelope = byHash.get(toHex(action.hash));
      if (envelope) ordered.push(envelope);
    }
    return ordered;
  };

  const getLatestKnownHash = (groupId: string): Uint8Array | undefined => {
    const ordered = getOrderedEnvelopes(groupId);
    const latest = ordered[ordered.length - 1];
    return latest ? Uint8Array.from(latest.hash) : undefined;
  };

  const getMissingEnvelopesForKnownHash = (
    groupId: string,
    knownHash?: Uint8Array,
  ): readonly SignedActionEnvelope[] => {
    const ordered = getOrderedEnvelopes(groupId);
    if (ordered.length === 0) return [];
    if (!knownHash || knownHash.length === 0) return ordered;

    const knownHashHex = toHex(knownHash);
    const idx = ordered.findIndex((envelope) => toHex(envelope.hash) === knownHashHex);
    if (idx === -1) return ordered;
    return ordered.slice(idx + 1);
  };

  const isOwnMemberOfGroup = (groupId: string): boolean => {
    const state = actionChainStates.get(groupId);
    if (!state) return false;
    return state.members.has(ownPublicKeyHex);
  };

  const isOwnAdminOfGroup = (groupId: string): boolean => {
    const state = actionChainStates.get(groupId);
    if (!state) return false;
    const role = state.members.get(ownPublicKeyHex)?.role;
    return role === "admin" || role === "owner";
  };

  const isPeerMemberOfGroup = (groupId: string, peerIdValue: string): boolean => {
    const state = actionChainStates.get(groupId);
    if (!state) return true;
    for (const member of state.members.values()) {
      if (publicKeyToPeerId.get(member.publicKeyHex) === peerIdValue) {
        return true;
      }
    }
    return false;
  };

  const isMembershipEnforcedGroup = (groupId: string): boolean =>
    (actionChainStates.get(groupId)?.createdAt ?? 0) > 0;

  const canLocalPeerConsumeGroupUpdates = (groupId: string): boolean =>
    !isMembershipEnforcedGroup(groupId) || isOwnMemberOfGroup(groupId);

  const encodeSyncRequestSigningPayload = (
    payload: {
      readonly groupId: string;
      readonly senderPeerId: string;
      readonly senderPublicKey: Uint8Array;
      readonly requestId?: string;
      readonly targetPeerId?: string;
      readonly knownHash?: Uint8Array;
    },
  ): Uint8Array =>
    new Uint8Array(
      encode({
        type: "sync_request",
        groupId: payload.groupId,
        senderPeerId: payload.senderPeerId,
        senderPublicKey: payload.senderPublicKey,
        requestId: payload.requestId,
        targetPeerId: payload.targetPeerId,
        knownHash: payload.knownHash,
      }),
    );

  const encodeSyncResponseSigningPayload = (
    payload: {
      readonly groupId: string;
      readonly senderPeerId: string;
      readonly senderPublicKey: Uint8Array;
      readonly requestId?: string;
      readonly targetPeerId: string;
      readonly requestKnownHash?: Uint8Array;
      readonly headHash?: Uint8Array;
      readonly nextCursorHash?: Uint8Array;
      readonly envelopes: ReadonlyArray<{
        readonly signedBytes: Uint8Array;
        readonly signature: Uint8Array;
        readonly hash: Uint8Array;
      }>;
    },
  ): Uint8Array =>
    new Uint8Array(
      encode({
        type: "sync_response",
        groupId: payload.groupId,
        senderPeerId: payload.senderPeerId,
        senderPublicKey: payload.senderPublicKey,
        requestId: payload.requestId,
        targetPeerId: payload.targetPeerId,
        requestKnownHash: payload.requestKnownHash,
        headHash: payload.headHash,
        nextCursorHash: payload.nextCursorHash,
        envelopes: payload.envelopes,
      }),
    );

  const signSyncRequest = (
    payload: {
      readonly groupId: string;
      readonly senderPeerId: string;
      readonly senderPublicKey: Uint8Array;
      readonly requestId?: string;
      readonly targetPeerId?: string;
      readonly knownHash?: Uint8Array;
    },
  ): Uint8Array =>
    new Uint8Array([...ed25519.sign(
      encodeSyncRequestSigningPayload(payload),
      accountKey.privateKey,
    )]);

  const verifySyncRequest = (
    payload: {
      readonly groupId: string;
      readonly senderPeerId: string;
      readonly senderPublicKey: Uint8Array;
      readonly requestId?: string;
      readonly targetPeerId?: string;
      readonly knownHash?: Uint8Array;
      readonly signature: Uint8Array;
    },
  ): boolean =>
    ed25519.verify(
      payload.signature,
      encodeSyncRequestSigningPayload(payload),
      payload.senderPublicKey,
    );

  const signSyncResponse = (
    payload: {
      readonly groupId: string;
      readonly senderPeerId: string;
      readonly senderPublicKey: Uint8Array;
      readonly requestId?: string;
      readonly targetPeerId: string;
      readonly requestKnownHash?: Uint8Array;
      readonly headHash?: Uint8Array;
      readonly nextCursorHash?: Uint8Array;
      readonly envelopes: ReadonlyArray<{
        readonly signedBytes: Uint8Array;
        readonly signature: Uint8Array;
        readonly hash: Uint8Array;
      }>;
    },
  ): Uint8Array =>
    new Uint8Array([...ed25519.sign(
      encodeSyncResponseSigningPayload(payload),
      accountKey.privateKey,
    )]);

  const verifySyncResponse = (
    payload: {
      readonly groupId: string;
      readonly senderPeerId: string;
      readonly senderPublicKey: Uint8Array;
      readonly requestId?: string;
      readonly targetPeerId: string;
      readonly requestKnownHash?: Uint8Array;
      readonly headHash?: Uint8Array;
      readonly nextCursorHash?: Uint8Array;
      readonly envelopes: ReadonlyArray<{
        readonly signedBytes: Uint8Array;
        readonly signature: Uint8Array;
        readonly hash: Uint8Array;
      }>;
      readonly signature: Uint8Array;
    },
  ): boolean =>
    ed25519.verify(
      payload.signature,
      encodeSyncResponseSigningPayload(payload),
      payload.senderPublicKey,
    );

  const encodeJoinRequestSigningPayload = (
    payload: {
      readonly groupId: string;
      readonly senderPeerId: string;
      readonly requesterPublicKey: Uint8Array;
      readonly inviteGrant?: InviteGrantProof;
    },
  ): Uint8Array =>
    new Uint8Array(
      encode({
        type: "join_request",
        groupId: payload.groupId,
        senderPeerId: payload.senderPeerId,
        requesterPublicKey: payload.requesterPublicKey,
        inviteGrant: payload.inviteGrant,
      }),
    );

  const signJoinRequest = (
    payload: {
      readonly groupId: string;
      readonly senderPeerId: string;
      readonly requesterPublicKey: Uint8Array;
      readonly inviteGrant?: InviteGrantProof;
    },
  ): Uint8Array =>
    new Uint8Array([...ed25519.sign(
      encodeJoinRequestSigningPayload(payload),
      accountKey.privateKey,
    )]);

  const verifyJoinRequest = (
    payload: {
      readonly groupId: string;
      readonly senderPeerId: string;
      readonly requesterPublicKey: Uint8Array;
      readonly signature: Uint8Array;
      readonly inviteGrant?: InviteGrantProof;
    },
  ): boolean =>
    ed25519.verify(
      payload.signature,
      encodeJoinRequestSigningPayload(payload),
      payload.requesterPublicKey,
    );

  const encodeDirectMessageRequestSigningPayload = (
    payload: {
      readonly requestId: string;
      readonly senderPeerId: string;
      readonly senderPublicKey: Uint8Array;
      readonly targetPeerId: string;
      readonly groupId: string;
      readonly groupName: string;
      readonly inviteCode: string;
      readonly sentAt: number;
    },
  ): Uint8Array =>
    new Uint8Array(
      encode({
        type: "dm_request",
        requestId: payload.requestId,
        senderPeerId: payload.senderPeerId,
        senderPublicKey: payload.senderPublicKey,
        targetPeerId: payload.targetPeerId,
        groupId: payload.groupId,
        groupName: payload.groupName,
        inviteCode: payload.inviteCode,
        sentAt: payload.sentAt,
      }),
    );

  const signDirectMessageRequest = (
    payload: {
      readonly requestId: string;
      readonly senderPeerId: string;
      readonly senderPublicKey: Uint8Array;
      readonly targetPeerId: string;
      readonly groupId: string;
      readonly groupName: string;
      readonly inviteCode: string;
      readonly sentAt: number;
    },
  ): Uint8Array =>
    new Uint8Array([...ed25519.sign(
      encodeDirectMessageRequestSigningPayload(payload),
      accountKey.privateKey,
    )]);

  const verifyDirectMessageRequest = (
    payload: {
      readonly requestId: string;
      readonly senderPeerId: string;
      readonly senderPublicKey: Uint8Array;
      readonly targetPeerId: string;
      readonly groupId: string;
      readonly groupName: string;
      readonly inviteCode: string;
      readonly sentAt: number;
      readonly signature: Uint8Array;
    },
  ): boolean =>
    ed25519.verify(
      payload.signature,
      encodeDirectMessageRequestSigningPayload(payload),
      payload.senderPublicKey,
    );

  const encodeProfileRequestSigningPayload = (
    payload: {
      readonly requestId: string;
      readonly senderPeerId: string;
      readonly senderPublicKey: Uint8Array;
      readonly targetPeerId: string;
      readonly sentAt: number;
    },
  ): Uint8Array =>
    new Uint8Array(
      encode({
        type: "profile_request",
        requestId: payload.requestId,
        senderPeerId: payload.senderPeerId,
        senderPublicKey: payload.senderPublicKey,
        targetPeerId: payload.targetPeerId,
        sentAt: payload.sentAt,
      }),
    );

  const signProfileRequest = (
    payload: {
      readonly requestId: string;
      readonly senderPeerId: string;
      readonly senderPublicKey: Uint8Array;
      readonly targetPeerId: string;
      readonly sentAt: number;
    },
  ): Uint8Array =>
    new Uint8Array([...ed25519.sign(
      encodeProfileRequestSigningPayload(payload),
      accountKey.privateKey,
    )]);

  const verifyProfileRequest = (
    payload: {
      readonly requestId: string;
      readonly senderPeerId: string;
      readonly senderPublicKey: Uint8Array;
      readonly targetPeerId: string;
      readonly sentAt: number;
      readonly signature: Uint8Array;
    },
  ): boolean =>
    ed25519.verify(
      payload.signature,
      encodeProfileRequestSigningPayload(payload),
      payload.senderPublicKey,
    );

  const encodeProfileAnnounceSigningPayload = (
    payload: {
      readonly senderPeerId: string;
      readonly senderPublicKey: Uint8Array;
      readonly targetPeerId?: string;
      readonly displayName: string;
      readonly sentAt: number;
    },
  ): Uint8Array =>
    new Uint8Array(
      encode({
        type: "profile_announce",
        senderPeerId: payload.senderPeerId,
        senderPublicKey: payload.senderPublicKey,
        targetPeerId: payload.targetPeerId,
        displayName: payload.displayName,
        sentAt: payload.sentAt,
      }),
    );

  const signProfileAnnounce = (
    payload: {
      readonly senderPeerId: string;
      readonly senderPublicKey: Uint8Array;
      readonly targetPeerId?: string;
      readonly displayName: string;
      readonly sentAt: number;
    },
  ): Uint8Array =>
    new Uint8Array([...ed25519.sign(
      encodeProfileAnnounceSigningPayload(payload),
      accountKey.privateKey,
    )]);

  const verifyProfileAnnounce = (
    payload: {
      readonly senderPeerId: string;
      readonly senderPublicKey: Uint8Array;
      readonly targetPeerId?: string;
      readonly displayName: string;
      readonly sentAt: number;
      readonly signature: Uint8Array;
    },
  ): boolean =>
    ed25519.verify(
      payload.signature,
      encodeProfileAnnounceSigningPayload(payload),
      payload.senderPublicKey,
    );

  const currentDisplayName = (): string | null => {
    const name = getDisplayName?.()?.trim();
    return name && name.length > 0 ? name : null;
  };

  const publishProfileAnnounce = async (targetPeerId?: string): Promise<void> => {
    const displayName = currentDisplayName();
    if (!displayName) return;
    const senderPublicKey = new Uint8Array(accountKey.publicKey);
    const sentAt = Date.now();
    const signature = signProfileAnnounce({
      senderPeerId: ownPeerId,
      senderPublicKey,
      targetPeerId,
      displayName,
      sentAt,
    });
    const wireMessage: WireMessage = {
      type: "profile_announce",
      payload: {
        senderPeerId: ownPeerId,
        senderPublicKey,
        targetPeerId,
        displayName,
        sentAt,
        signature: new Uint8Array(Array.from(signature)),
      },
    };
    await pubsub.publish(PROFILE_SYNC_TOPIC, encodeWireMessage(wireMessage));
  };

  const publishProfileRequest = async (targetPeerId: string): Promise<void> => {
    const senderPublicKey = new Uint8Array(accountKey.publicKey);
    const requestId = crypto.randomUUID();
    const sentAt = Date.now();
    const signature = signProfileRequest({
      requestId,
      senderPeerId: ownPeerId,
      senderPublicKey,
      targetPeerId,
      sentAt,
    });
    const wireMessage: WireMessage = {
      type: "profile_request",
      payload: {
        requestId,
        senderPeerId: ownPeerId,
        senderPublicKey,
        targetPeerId,
        sentAt,
        signature: new Uint8Array(Array.from(signature)),
      },
    };
    await pubsub.publish(PROFILE_SYNC_TOPIC, encodeWireMessage(wireMessage));
  };

  const publishSyncRequest = async (
    groupId: string,
    targetPeerId?: string,
    knownHashOverride?: Uint8Array,
  ): Promise<void> => {
    const rateKey = `${groupId}:${targetPeerId ?? "*"}`;
    if (isRateLimited(
      outgoingSyncRequestRate,
      rateKey,
      OUTGOING_SYNC_REQUEST_MAX,
      OUTGOING_SYNC_REQUEST_WINDOW_MS,
    )) {
      emit("sync", `Rate-limited outgoing sync_request for ${groupId.slice(0, 8)}...`);
      return;
    }

    const topic = groupTopic(groupId);
    const knownHash = knownHashOverride ? Uint8Array.from(knownHashOverride) : getLatestKnownHash(groupId);
    const requestId = targetPeerId ? crypto.randomUUID() : undefined;
    const senderPublicKey = new Uint8Array(accountKey.publicKey);
    const signature = signSyncRequest({
      groupId,
      senderPeerId: ownPeerId,
      senderPublicKey,
      requestId,
      targetPeerId,
      knownHash,
    });
    const wireMessage: WireMessage = {
      type: "sync_request",
      payload: {
        groupId,
        senderPeerId: ownPeerId,
        senderPublicKey,
        signature: new Uint8Array(Array.from(signature)),
        requestId,
        targetPeerId,
        knownHash: knownHash ? Uint8Array.from(knownHash) : undefined,
      },
    };
    await pubsub.publish(topic, encodeWireMessage(wireMessage));
    connectionMetrics.syncRequestsSent += 1;
    emitConnectionMetrics();
    if (targetPeerId && requestId) {
      pruneTimedMap(pendingSyncRequests, SYNC_REQUEST_TRACK_TTL_MS, MAX_SYNC_REQUEST_TRACKED);
      pendingSyncRequests.set(
        createSyncRequestKey(groupId, targetPeerId, requestId),
        Date.now(),
      );
      patchSyncProgress(groupId, targetPeerId, {
        lastRequestedAtMs: Date.now(),
        lastRequestKnownHashHex: knownHash ? toHex(knownHash) : null,
      });
    }
    emit(
      "sync",
      `Requested sync for group ${groupId.slice(0, 8)}...${targetPeerId ? ` from ${targetPeerId.slice(0, 12)}...` : ""}`,
    );
  };

  const publishSyncResponse = async (
    groupId: string,
    targetPeerId: string,
    requestKnownHash?: Uint8Array,
    requestId?: string,
  ): Promise<void> => {
    const missing = getMissingEnvelopesForKnownHash(groupId, requestKnownHash);
    const responseEnvelopes = missing.slice(0, MAX_SYNC_ENVELOPES_PER_RESPONSE);
    const headHash = getLatestKnownHash(groupId);
    const nextCursorHash = missing.length > responseEnvelopes.length && responseEnvelopes.length > 0
      ? Uint8Array.from(responseEnvelopes[responseEnvelopes.length - 1].hash)
      : undefined;
    const senderPublicKey = new Uint8Array(accountKey.publicKey);
    const signature = signSyncResponse({
      groupId,
      senderPeerId: ownPeerId,
      senderPublicKey,
      requestId,
      targetPeerId,
      requestKnownHash,
      headHash,
      nextCursorHash,
      envelopes: responseEnvelopes,
    });
    const wireMessage: WireMessage = {
      type: "sync_response",
      payload: {
        groupId,
        senderPeerId: ownPeerId,
        senderPublicKey,
        signature: new Uint8Array(Array.from(signature)),
        requestId,
        targetPeerId,
        requestKnownHash: requestKnownHash
          ? Uint8Array.from(requestKnownHash)
          : undefined,
        headHash: headHash ? Uint8Array.from(headHash) : undefined,
        nextCursorHash: nextCursorHash ? Uint8Array.from(nextCursorHash) : undefined,
        envelopes: responseEnvelopes.map((envelope) => ({
          signedBytes: new Uint8Array(envelope.signedBytes),
          signature: new Uint8Array(envelope.signature),
          hash: new Uint8Array(envelope.hash),
        })),
      },
    };
    await pubsub.publish(groupTopic(groupId), encodeWireMessage(wireMessage));
    patchSyncProgress(groupId, targetPeerId, {
      lastServedAtMs: Date.now(),
      lastServedKnownHashHex: requestKnownHash ? toHex(requestKnownHash) : null,
      lastServedHeadHashHex: headHash ? toHex(headHash) : null,
      lastServedEnvelopeCount: responseEnvelopes.length,
    });
    emit(
      "sync",
      `Sent ${responseEnvelopes.length} sync envelope(s) to ${targetPeerId.slice(0, 12)}... for group ${groupId.slice(0, 8)}...`,
    );
  };

  const requestSyncFromPeer = (
    groupId: string,
    targetPeerId: string,
    knownHashOverride?: Uint8Array,
  ) => {
    if (targetPeerId === ownPeerId) return;
    if (isMembershipEnforcedGroup(groupId)) {
      if (!isOwnMemberOfGroup(groupId)) return;
    }
    void publishSyncRequest(groupId, targetPeerId, knownHashOverride).catch(() => {});
  };

  const requestSyncFromConnectedPeers = (groupId: string) => {
    for (const remote of node.getPeers().map((p) => p.toString())) {
      requestSyncFromPeer(groupId, remote);
    }
  };

  const publishJoinRequest = async (
    groupId: string,
    inviteGrant?: InviteGrantProof,
  ): Promise<void> => {
    if (isRateLimited(
      outgoingJoinRequestRate,
      groupId,
      OUTGOING_JOIN_REQUEST_MAX,
      OUTGOING_JOIN_REQUEST_WINDOW_MS,
    )) {
      emit("info", `Rate-limited outgoing join request for ${groupId.slice(0, 8)}...`);
      return;
    }

    const topic = groupTopic(groupId);
    const requesterPublicKey = new Uint8Array(accountKey.publicKey);
    const signature = signJoinRequest({
      groupId,
      senderPeerId: ownPeerId,
      requesterPublicKey,
      inviteGrant,
    });
    const wireMessage: WireMessage = {
      type: "join_request",
      groupId,
      senderPeerId: ownPeerId,
      requesterPublicKey,
      signature: new Uint8Array(signature),
      inviteGrant,
    };
    await pubsub.publish(topic, encodeWireMessage(wireMessage));
    emit("info", `Sent join request to group ${groupId.slice(0, 8)}...`);
  };

  const processSignedAction = (groupId: string, envelope: SignedActionEnvelope, senderPeerId?: string): SignedAction | null => {
    const result = verifyAndDecodeAction(envelope);
    if (!result.success) {
      emit("info", `Rejected action in ${groupId.slice(0, 8)}...: ${result.error.message}`);
      return null;
    }

    const action = result.data;
    if (action.payload.type === "member-approved") {
      const approvedHex = toHex(action.payload.memberPublicKey);
      pendingJoinInviteGrantsByGroup.get(groupId)?.delete(approvedHex);
    }

    if (senderPeerId) {
      const authorHex = toHex(action.authorPublicKey);
      publicKeyToPeerId.set(authorHex, senderPeerId);
      notifyPublicKeyToPeerIdChange();
    }

    if (action.groupId !== groupId) {
      emit("info", `Rejected cross-group action in ${groupId.slice(0, 8)}...`);
      return null;
    }

    const dag = getOrCreateDag(groupId);
    const newDag = appendAction(dag, action);
    if (newDag === dag) return null;

    actionDags.set(groupId, newDag);

    const existing = actionEnvelopes.get(groupId) ?? [];
    actionEnvelopes.set(groupId, [...existing, envelope]);

    const previousState = actionChainStates.get(groupId);

    const ordered = topologicalOrder(newDag);
    const derived = deriveGroupState(groupId, ordered);
    if (derived.success) {
      actionChainStates.set(groupId, derived.data);
      reconcilePeerPathCache();

      const wasMember = previousState?.members.has(ownPublicKeyHex) ?? false;
      const isMember = derived.data.members.has(ownPublicKeyHex);
      if (!wasMember && isMember) {
        if (joinRetryState.has(groupId)) {
          joinRetryState = removeJoinRetry(joinRetryState, groupId);
          emitJoinRetryState();
          emit("info", `Approval received; stopped join retries for ${groupId.slice(0, 8)}...`);
        }
        onApprovalReceived?.(groupId);
        requestSyncFromConnectedPeers(groupId);
      }
    }

    if (senderPeerId) {
      patchSyncProgress(groupId, senderPeerId, {
        lastReceivedAtMs: Date.now(),
        lastReceivedHashHex: toHex(action.hash),
        lastReceivedEnvelopeCount: 1,
      });
    }

    return action;
  };

  const emit = (type: NetworkEvent["type"], detail: string) => {
    const event: NetworkEvent = { timestamp: Date.now(), type, detail };
    eventListeners.forEach((l) => l(event));
  };

  const peerId = (id: { toString(): string }) => id.toString().slice(0, 16);

  const transportLabel = (addr: string): string => {
    if (addr.includes("/webrtc/")) return "webrtc";
    if (addr.includes("/p2p-circuit/")) return "circuit-relay";
    if (addr.includes("/ws/")) return "websocket";
    return "unknown";
  };

  const notifyPeerChange = () => {
    const count = node.getPeers().length;
    peerChangeListeners.forEach((l) => l(count));
  };

  const isWebSocketAddress = (addr: string): boolean =>
    addr.includes("/ws/") || addr.includes("/wss/");

  const extractRelayPeerId = (circuitAddr: string): string | null => {
    const base = extractRelayBaseAddress(circuitAddr);
    if (!base) return null;
    const peerPrefix = "/p2p/";
    const idx = base.lastIndexOf(peerPrefix);
    if (idx === -1) return null;
    return base.slice(idx + peerPrefix.length);
  };

  if (isBrowser) {
    node.addEventListener("peer:identify", (evt: CustomEvent) => {
      const detail = evt.detail as {
        peerId: { toString(): string };
        protocols: string[];
        listenAddrs: Array<{ toString(): string }>;
      };

      const hasHop = detail.protocols.includes(RELAY_V2_HOP_CODEC);
      if (!hasHop) return;

      const remotePeerId = detail.peerId.toString();
      const wsAddresses = detail.listenAddrs
        .map((ma) => ma.toString())
        .filter(isWebSocketAddress);

      updateRelayCandidateState(
        addCandidate(relayCandidateState, remotePeerId, wsAddresses, Date.now()),
      );
      relayReservationManager.ingestCandidate(remotePeerId, wsAddresses);

      for (const addr of wsAddresses) {
        const fullAddr = `${addr}/p2p/${remotePeerId}`;
        if (!relayPeers.includes(fullAddr)) {
          relayPeers.push(fullAddr);
        }
      }

      emit("relay-candidate", `Relay candidate: ${peerId(detail.peerId)}... (${wsAddresses.length} WS addr)`);

      const services = node.services as Record<string, unknown>;
      const pingService = services.ping as PingService | undefined;
      if (pingService) {
        const remote = peerIdFromString(remotePeerId);
        pingService.ping(remote).then((rttMs) => {
          updateRelayCandidateState(
            updateRtt(relayCandidateState, remotePeerId, rttMs),
          );
          relayReservationManager.updateRtt(remotePeerId, rttMs);
        }).catch(() => {});
      }
    });
  }

  node.addEventListener("peer:connect", (evt: CustomEvent) => {
    const id = evt.detail as { toString(): string };
    const remotePeerId = id.toString();
    const conn = node.getConnections().find(
      (c) => c.remotePeer.toString() === remotePeerId,
    );
    const addr = conn?.remoteAddr.toString() ?? "unknown";
    const transport = transportLabel(addr);
    emit("peer-connect", `${peerId(id)}... connected via ${transport} (${addr})`);
    notifyPeerChange();

    if (connectionMetrics.timeToFirstPeerMs === null) {
      connectionMetrics.timeToFirstPeerMs = Date.now() - connectionMetrics.startedAtMs;
    }

    const now = Date.now();
    const pendingUpgradeStart = pendingDirectUpgradeByPeer.get(remotePeerId);
    if (transport === "circuit-relay") {
      connectionMetrics.relayedPeerConnections += 1;
      if (!pendingUpgradeStart) {
        pendingDirectUpgradeByPeer.set(remotePeerId, now);
        connectionMetrics.directUpgradeAttempts += 1;
      } else if (now - pendingUpgradeStart > DIRECT_UPGRADE_WINDOW_MS) {
        pendingDirectUpgradeByPeer.set(remotePeerId, now);
      }
    } else {
      connectionMetrics.directPeerConnections += 1;
      if (pendingUpgradeStart && now - pendingUpgradeStart <= DIRECT_UPGRADE_WINDOW_MS) {
        connectionMetrics.directUpgradeSuccesses += 1;
        pendingDirectUpgradeByPeer.delete(remotePeerId);
      }
    }
    emitConnectionMetrics();

    const isMember = [...publicKeyToPeerId.values()].includes(remotePeerId);
    if (isMember) {
      tagGroupMemberKeepAlive(remotePeerId);
    }

    void publishProfileRequest(remotePeerId).catch(() => {});

    for (const groupId of joinedGroups) {
      requestSyncFromPeer(groupId, remotePeerId);
    }
  });

  node.addEventListener("peer:disconnect", (evt: CustomEvent) => {
    const id = evt.detail as { toString(): string };
    const disconnectedId = id.toString();
    emit("peer-disconnect", `${peerId(id)}... disconnected`);

    dialedPeers.delete(disconnectedId);

    if (relayCandidateState.candidates.has(disconnectedId)) {
      const withLost = markReservationLost(relayCandidateState, disconnectedId);
      updateRelayCandidateState(removeCandidate(withLost, disconnectedId));
    }
    relayReservationManager.markReservationLost(disconnectedId);
    pendingDirectUpgradeByPeer.delete(disconnectedId);

    notifyPeerChange();
  });

  node.addEventListener("self:peer:update", () => {
    const addrs = node.getMultiaddrs().map((ma) => ma.toString());
    const circuitAddrs = addrs.filter((a) => a.includes("/p2p-circuit/"));
    const webrtcAddrs = addrs.filter((a) => a.includes("/webrtc"));
    const observedRelayIds: string[] = [];

    for (const circuitAddr of circuitAddrs) {
      const baseAddr = extractRelayBaseAddress(circuitAddr);
      if (baseAddr && !relayPeers.includes(baseAddr)) {
        relayPeers.push(baseAddr);
        emit("relay-harvest", `Auto-harvested relay: ${baseAddr.slice(0, 50)}...`);
      }
      if (baseAddr) {
        relayReservationManager.ingestRelayAddress(baseAddr);
      }

      const relayId = extractRelayPeerId(circuitAddr);
      if (relayId && relayCandidateState.candidates.has(relayId)) {
        updateRelayCandidateState(
          markReservationActive(relayCandidateState, relayId),
        );
      }
      if (relayId) {
        const priorStatus = relayReservationManager.getState().entries.get(relayId)?.status;
        relayReservationManager.markReservationObserved(relayId);
        observedRelayIds.push(relayId);
        if (priorStatus === "reserving") {
          connectionMetrics.reservationSuccesses += 1;
          emitConnectionMetrics();
        } else if (priorStatus === "renewing") {
          connectionMetrics.renewSuccesses += 1;
          emitConnectionMetrics();
        }
      }
    }

    relayReservationManager.syncObservedReservations(observedRelayIds);

    if (circuitAddrs.length > 0) {
      emit("relay-reservation", `Got ${circuitAddrs.length} circuit relay address(es)`);
    }
    if (webrtcAddrs.length > 0) {
      emit("address-change", `Listening on ${webrtcAddrs.length} WebRTC address(es)`);
    }
    emit("address-change", `Total addresses: ${addrs.length}`);
  });

  pubsub.addEventListener("subscription-change", (evt: CustomEvent) => {
    const detail = evt.detail as {
      peerId: { toString(): string };
      subscriptions: ReadonlyArray<{ topic: string; subscribe: boolean }>;
    };
    const remotePeerId = detail.peerId.toString();

    for (const sub of detail.subscriptions) {
      const action = sub.subscribe ? "subscribed to" : "unsubscribed from";
      emit("subscription-change", `${peerId(detail.peerId)}... ${action} ${sub.topic.slice(0, 24)}...`);
    }

    for (const sub of detail.subscriptions) {
      if (!sub.subscribe) continue;
      const groupId = topicToGroupId.get(sub.topic);
      if (!groupId) continue;
      if (!isPeerMemberOfGroup(groupId, remotePeerId)) continue;
      publishSyncResponse(groupId, remotePeerId).catch(() => {});
    }
  });

  emit("info", `Node started: ${node.peerId.toString()}`);

  const dialedPeers = new Set<string>();
  const inFlightPeerDials = new Map<string, Promise<void>>();
  const dialFailureBackoff = new Map<string, { failures: number; nextAllowedAt: number }>();

  type DialSource = "cached path" | "discovered address" | "circuit relay";
  type DialCandidate = {
    addr: string;
    source: DialSource;
    score: number;
  };

  const normalizeDialAddress = (
    targetPeerId: string,
    address: string,
  ): string | null => {
    const trimmed = address.trim();
    if (trimmed.length === 0) return null;
    const withPeerId = trimmed.includes("/p2p/")
      ? trimmed
      : `${trimmed}/p2p/${targetPeerId}`;
    try {
      multiaddr(withPeerId);
      return withPeerId;
    } catch {
      return null;
    }
  };

  const mergeDiscoveryHints = (peerId: string, addrs: readonly string[]): readonly string[] => {
    const existing = peerDiscoveryHints.get(peerId) ?? [];
    const merged = [...addrs, ...existing];
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const addr of merged) {
      if (seen.has(addr)) continue;
      seen.add(addr);
      deduped.push(addr);
      if (deduped.length >= MAX_CACHED_PEER_PATHS_PER_PEER * 2) break;
    }
    peerDiscoveryHints.set(peerId, deduped);
    return deduped;
  };

  const harvestRelayBasesFromAddresses = (addrs: readonly string[]) => {
    for (const addr of addrs) {
      const base = extractRelayBaseAddress(addr);
      if (!base) continue;
      if (!relayPeers.includes(base)) {
        relayPeers.push(base);
      }
      relayReservationManager.ingestRelayAddress(base);
    }
  };

  const nextDialDelayMs = (failures: number): number => {
    const uncapped = DIAL_BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1);
    const capped = Math.min(uncapped, DIAL_BACKOFF_MAX_MS);
    const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(capped * 0.2)));
    return capped + jitter;
  };

  const shouldSkipDialCandidate = (addr: string): boolean => {
    const state = dialFailureBackoff.get(addr);
    return state !== undefined && Date.now() < state.nextAllowedAt;
  };

  const recordDialFailure = (addr: string) => {
    const existing = dialFailureBackoff.get(addr);
    const failures = (existing?.failures ?? 0) + 1;
    dialFailureBackoff.set(addr, {
      failures,
      nextAllowedAt: Date.now() + nextDialDelayMs(failures),
    });
  };

  const clearDialFailure = (addr: string) => {
    dialFailureBackoff.delete(addr);
  };

  const scoreDialCandidate = (source: DialSource, addr: string): number => {
    const sourceScore = source === "cached path"
      ? 100
      : source === "discovered address"
        ? 80
        : 50;
    const transportScore = addr.includes("/webrtc/")
      ? 15
      : (addr.includes("/ws/") || addr.includes("/wss/"))
        ? 10
        : addr.includes("/p2p-circuit/")
          ? -5
          : 0;
    return sourceScore + transportScore;
  };

  const buildDialCandidates = (
    targetPeerId: string,
    preferredAddrs: readonly string[],
  ): readonly DialCandidate[] => {
    const candidates = new Map<string, DialCandidate>();

    const pushCandidate = (source: DialSource, rawAddr: string) => {
      const normalized = normalizeDialAddress(targetPeerId, rawAddr);
      if (!normalized) return;
      const score = scoreDialCandidate(source, normalized);
      const existing = candidates.get(normalized);
      if (!existing || score > existing.score) {
        candidates.set(normalized, { addr: normalized, source, score });
      }
    };

    for (const addr of peerPathCache.get(targetPeerId) ?? []) {
      pushCandidate("cached path", addr);
    }
    for (const addr of preferredAddrs) {
      pushCandidate("discovered address", addr);
    }

    return [...candidates.values()]
      .filter((candidate) => !shouldSkipDialCandidate(candidate.addr))
      .sort((a, b) => b.score - a.score)
      .slice(0, DIAL_CANDIDATE_LIMIT);
  };

  const recordDialAttemptMetric = (groupId?: string) => {
    if (!groupId) return;
    const metrics = getOrCreatePeerDiscoveryMetrics(groupId);
    metrics.dialAttempts += 1;
    emitPeerDiscoveryMetrics(groupId);
  };

  const recordDialSuccessMetric = (groupId?: string) => {
    if (!groupId) return;
    const metrics = getOrCreatePeerDiscoveryMetrics(groupId);
    metrics.dialSuccesses += 1;
    if (metrics.timeToFirstPeerMs === null) {
      metrics.timeToFirstPeerMs = Date.now() - metrics.startedAtMs;
    }
    emitPeerDiscoveryMetrics(groupId);
  };

  const tryDialAddress = async (
    remotePeerId: string,
    candidate: DialCandidate,
    metricGroupId?: string,
  ): Promise<boolean> => {
    recordDialAttemptMetric(metricGroupId);
    try {
      emit("dial-attempt", `Trying ${candidate.source}: ${candidate.addr.slice(0, 80)}...`);
      await node.dial(multiaddr(candidate.addr));
      clearDialFailure(candidate.addr);
      emit("dial-success", `Connected to ${remotePeerId.slice(0, 16)}... via ${candidate.source}`);
      recordSuccessfulPeerPath(remotePeerId, candidate.addr);
      recordDialSuccessMetric(metricGroupId);
      return true;
    } catch {
      emit("dial-failure", `${candidate.source} failed: ${candidate.addr.slice(0, 80)}...`);
      recordDialFailure(candidate.addr);
      if (candidate.source === "cached path") {
        forgetPeerPath(remotePeerId, candidate.addr);
      }
      return false;
    }
  };

  const dialCandidateSet = async (
    remotePeerId: string,
    candidates: readonly DialCandidate[],
    metricGroupId?: string,
  ): Promise<boolean> => {
    if (candidates.length === 0) return false;

    let index = 0;
    let connected = false;
    const workerCount = Math.min(DIAL_CANDIDATE_CONCURRENCY, candidates.length);

    const worker = async () => {
      while (!connected) {
        const current = index;
        index += 1;
        if (current >= candidates.length) return;

        const ok = await tryDialAddress(remotePeerId, candidates[current], metricGroupId);
        if (ok) {
          connected = true;
          return;
        }
      }
    };

    await Promise.all([...Array(workerCount)].map(() => worker()));
    return connected;
  };

  const tryConnectToPeerId = async (
    targetPeerId: string,
    options: {
      readonly preferredAddrs?: readonly string[];
      readonly metricGroupId?: string;
    } = {},
  ): Promise<void> => {
    const existingDial = inFlightPeerDials.get(targetPeerId);
    if (existingDial) {
      await existingDial;
      return;
    }

    const dialPromise = (async () => {
      const ownPeerId = node.peerId.toString();
      if (targetPeerId === ownPeerId) return;
      if (node.getPeers().some((p) => p.toString() === targetPeerId)) return;

      const normalizedPreferred = (options.preferredAddrs ?? [])
        .map((addr) => normalizeDialAddress(targetPeerId, addr))
        .filter((addr): addr is string => addr !== null);
      harvestRelayBasesFromAddresses(normalizedPreferred);
      const discoveryHints = mergeDiscoveryHints(targetPeerId, normalizedPreferred);
      const initialCandidates = buildDialCandidates(targetPeerId, discoveryHints);
      if (await dialCandidateSet(targetPeerId, initialCandidates, options.metricGroupId)) {
        return;
      }

      const remotePeer = peerIdFromString(targetPeerId);

      try {
        emit("dial-attempt", `Looking up peer ${targetPeerId.slice(0, 16)}... on DHT`);
        recordDialAttemptMetric(options.metricGroupId);
        const peerInfo = await node.peerRouting.findPeer(remotePeer);
        if (peerInfo.multiaddrs.length > 0) {
          emit("info", `Found ${peerInfo.multiaddrs.length} address(es) via DHT for ${targetPeerId.slice(0, 16)}...`);
          await node.dial(remotePeer);

          const activeConn = node.getConnections().find(
            (conn) => conn.remotePeer.toString() === targetPeerId,
          );
          if (activeConn) {
            recordSuccessfulPeerPath(targetPeerId, activeConn.remoteAddr.toString());
          }

          recordDialSuccessMetric(options.metricGroupId);
          emit("dial-success", `Connected to ${targetPeerId.slice(0, 16)}... via DHT`);
          return;
        }
      } catch {
        emit("info", `DHT lookup failed for ${targetPeerId.slice(0, 16)}..., trying circuit relay`);
      }

      const relayAddressesRaw = relayPeers.length > 0
        ? [
            ...relayReservationManager.getPersistableRelayHints(6),
            ...relayPeers,
          ]
        : node.getMultiaddrs()
            .map((ma) => ma.toString())
            .filter((addr) => addr.includes("/p2p/") && !addr.includes("/p2p-circuit/"));
      const relayAddresses = [...new Set(relayAddressesRaw)];

      const circuitAddrs = buildCircuitRelayAddresses({
        targetPeerId,
        relayAddresses,
      });
      const relayCandidates = circuitAddrs
        .map((addr) => normalizeDialAddress(targetPeerId, addr))
        .filter((addr): addr is string => addr !== null)
        .map((addr): DialCandidate => ({
          addr,
          source: "circuit relay",
          score: scoreDialCandidate("circuit relay", addr),
        }))
        .filter((candidate) => !shouldSkipDialCandidate(candidate.addr))
        .sort((a, b) => b.score - a.score)
        .slice(0, DIAL_CANDIDATE_LIMIT);
      if (await dialCandidateSet(targetPeerId, relayCandidates, options.metricGroupId)) {
        return;
      }

      throw new Error(`Could not connect to peer ${targetPeerId}`);
    })();

    inFlightPeerDials.set(targetPeerId, dialPromise);
    try {
      await dialPromise;
    } finally {
      inFlightPeerDials.delete(targetPeerId);
    }
  };

  const attemptDirectConnect = (
    remotePeerId: string,
    preferredAddrs: readonly string[] = [],
    metricGroupId?: string,
  ) => {
    if (remotePeerId === node.peerId.toString()) return;
    if (dialedPeers.has(remotePeerId)) return;
    if (node.getPeers().some((p) => p.toString() === remotePeerId)) return;

    dialedPeers.add(remotePeerId);
    tryConnectToPeerId(remotePeerId, { preferredAddrs, metricGroupId }).catch(() => {
      dialedPeers.delete(remotePeerId);
    });
  };

  const emitActionMessage = (
    groupId: string,
    action: SignedAction,
    senderPeerIdFallback: string,
  ) => {
    if (action.payload.type !== "message") return;
    if (!canLocalPeerConsumeGroupUpdates(groupId)) return;

    const authorHex = toHex(action.authorPublicKey);
    const chatMessage: MultiGroupChatMessageEvent = {
      id: action.id,
      senderPeerId: publicKeyToPeerId.get(authorHex) ?? senderPeerIdFallback,
      senderDisplayName: undefined,
      text: action.payload.text,
      timestamp: action.timestamp,
      groupId,
    };
    messageListeners.forEach((listener) => listener(chatMessage));
  };

  const handlePubsubMessage = (event: CustomEvent) => {
    const detail = event.detail as { topic: string; data: Uint8Array; from?: { toString(): string } };
    const senderPeerId = detail.from?.toString() ?? "unknown";

    const result = decodeWireMessage(detail.data);
    if (!result.success) return;

    const wireMessage = result.data;
    if (wireMessage.type === "dm_request") {
      const payload = wireMessage.payload;
      if (detail.topic !== DIRECT_MESSAGE_REQUEST_TOPIC) return;
      if (payload.targetPeerId !== ownPeerId) return;
      if (senderPeerId === "unknown") return;
      if (payload.senderPeerId !== senderPeerId) return;
      if (!verifyDirectMessageRequest(payload)) return;

      const senderPublicKeyHex = toHex(payload.senderPublicKey);
      publicKeyToPeerId.set(senderPublicKeyHex, payload.senderPeerId);
      notifyPublicKeyToPeerIdChange();

      const eventPayload: DirectMessageRequestEvent = {
        requestId: payload.requestId,
        senderPeerId: payload.senderPeerId,
        senderPublicKey: new Uint8Array(payload.senderPublicKey),
        targetPeerId: payload.targetPeerId,
        groupId: payload.groupId,
        groupName: payload.groupName,
        inviteCode: payload.inviteCode,
        sentAt: payload.sentAt,
      };
      directMessageRequestListeners.forEach((listener) => listener(eventPayload));
      emit("info", `DM request from ${payload.senderPeerId.slice(0, 12)}...`);
      return;
    }

    if (wireMessage.type === "profile_request") {
      const payload = wireMessage.payload;
      if (detail.topic !== PROFILE_SYNC_TOPIC) return;
      if (payload.targetPeerId !== ownPeerId) return;
      if (senderPeerId === "unknown") return;
      if (payload.senderPeerId !== senderPeerId) return;
      if (!verifyProfileRequest(payload)) return;

      const senderPublicKeyHex = toHex(payload.senderPublicKey);
      publicKeyToPeerId.set(senderPublicKeyHex, payload.senderPeerId);
      notifyPublicKeyToPeerIdChange();

      void publishProfileAnnounce(payload.senderPeerId).catch(() => {});
      return;
    }

    if (wireMessage.type === "profile_announce") {
      const payload = wireMessage.payload;
      if (detail.topic !== PROFILE_SYNC_TOPIC) return;
      if (payload.targetPeerId && payload.targetPeerId !== ownPeerId) return;
      if (senderPeerId === "unknown") return;
      if (payload.senderPeerId !== senderPeerId) return;
      if (!verifyProfileAnnounce(payload)) return;

      const senderPublicKeyHex = toHex(payload.senderPublicKey);
      publicKeyToPeerId.set(senderPublicKeyHex, payload.senderPeerId);
      notifyPublicKeyToPeerIdChange();
      onProfileAnnounce?.(payload.senderPeerId, payload.displayName);
      return;
    }

    const matchedGroupId = topicToGroupId.get(detail.topic);
    if (matchedGroupId === undefined) return;

    if (wireMessage.type === "sync_request") {
      const payload = wireMessage.payload;
      if (senderPeerId === "unknown") return;
      if (payload.senderPeerId !== senderPeerId) return;
      if (payload.targetPeerId && payload.targetPeerId !== ownPeerId) return;
      if (isRateLimited(
        incomingSyncRequestRate,
        `${matchedGroupId}:${senderPeerId}`,
        INCOMING_SYNC_REQUEST_MAX,
        INCOMING_SYNC_REQUEST_WINDOW_MS,
      )) {
        emit(
          "sync",
          `Rate-limited sync request from ${senderPeerId.slice(0, 12)}...`,
        );
        return;
      }
      if (!verifySyncRequest(payload)) {
        emit(
          "sync",
          `Rejected sync request with invalid signature from ${senderPeerId.slice(0, 12)}...`,
        );
        return;
      }

      const senderPublicKeyHex = toHex(payload.senderPublicKey);
      publicKeyToPeerId.set(senderPublicKeyHex, senderPeerId);
      notifyPublicKeyToPeerIdChange();

      if (isMembershipEnforcedGroup(matchedGroupId)) {
        if (!isOwnMemberOfGroup(matchedGroupId)) return;
        if (!actionChainStates.get(matchedGroupId)?.members.has(senderPublicKeyHex)) {
          emit(
            "sync",
            `Rejected sync request from unknown member key ${senderPublicKeyHex.slice(0, 12)}... for group ${matchedGroupId.slice(0, 8)}...`,
          );
          return;
        }
      }

      publishSyncResponse(
        matchedGroupId,
        senderPeerId,
        payload.knownHash,
        payload.requestId,
      ).catch(() => {});
      return;
    }

    if (wireMessage.type === "sync_response") {
      const payload = wireMessage.payload;
      if (payload.targetPeerId !== ownPeerId) return;
      if (senderPeerId === "unknown") return;
      if (payload.senderPeerId !== senderPeerId) return;
      if (!verifySyncResponse(payload)) {
        connectionMetrics.syncResponsesRejected += 1;
        emitConnectionMetrics();
        emit(
          "sync",
          `Rejected sync response with invalid signature from ${senderPeerId.slice(0, 12)}...`,
        );
        return;
      }

      if (payload.requestId) {
        pruneTimedMap(pendingSyncRequests, SYNC_REQUEST_TRACK_TTL_MS, MAX_SYNC_REQUEST_TRACKED);
        pruneTimedMap(seenSyncResponses, SYNC_REQUEST_TRACK_TTL_MS, MAX_SYNC_REQUEST_TRACKED);
        const requestKey = createSyncRequestKey(matchedGroupId, senderPeerId, payload.requestId);
        if (seenSyncResponses.has(requestKey)) {
          connectionMetrics.syncResponsesRejected += 1;
          emitConnectionMetrics();
          return;
        }
        if (!pendingSyncRequests.has(requestKey)) {
          connectionMetrics.syncResponsesRejected += 1;
          emitConnectionMetrics();
          emit(
            "sync",
            `Rejected unsolicited sync response ${payload.requestId.slice(0, 8)} from ${senderPeerId.slice(0, 12)}...`,
          );
          return;
        }
        pendingSyncRequests.delete(requestKey);
        seenSyncResponses.set(requestKey, Date.now());
      }

      const senderPublicKeyHex = toHex(payload.senderPublicKey);
      publicKeyToPeerId.set(senderPublicKeyHex, senderPeerId);
      notifyPublicKeyToPeerIdChange();
      if (isMembershipEnforcedGroup(matchedGroupId) && !actionChainStates.get(matchedGroupId)?.members.has(senderPublicKeyHex)) {
        connectionMetrics.syncResponsesRejected += 1;
        emitConnectionMetrics();
        emit(
          "sync",
          `Rejected sync response from unknown member key ${senderPublicKeyHex.slice(0, 12)}... for group ${matchedGroupId.slice(0, 8)}...`,
        );
        return;
      }

      let accepted = 0;
      let lastAcceptedHashHex: string | null = null;
      for (const envelope of payload.envelopes) {
        const action = processSignedAction(
          matchedGroupId,
          {
            signedBytes: envelope.signedBytes,
            signature: envelope.signature,
            hash: envelope.hash,
          },
          senderPeerId,
        );
        if (!action) continue;
        accepted += 1;
        lastAcceptedHashHex = toHex(action.hash);
        emitActionMessage(matchedGroupId, action, senderPeerId);
      }

      patchSyncProgress(matchedGroupId, senderPeerId, {
        lastReceivedAtMs: Date.now(),
        lastReceivedHashHex: lastAcceptedHashHex,
        lastReceivedEnvelopeCount: payload.envelopes.length,
      });
      connectionMetrics.syncResponsesAccepted += 1;
      emitConnectionMetrics();

      emit(
        "sync",
        `Applied ${accepted}/${payload.envelopes.length} sync envelope(s) from ${senderPeerId.slice(0, 12)}... for group ${matchedGroupId.slice(0, 8)}...`,
      );

      if (payload.nextCursorHash) {
        requestSyncFromPeer(matchedGroupId, senderPeerId, payload.nextCursorHash);
        return;
      }

      if (payload.headHash) {
        const localHead = getLatestKnownHash(matchedGroupId);
        const localHeadHex = localHead ? toHex(localHead) : null;
        const remoteHeadHex = toHex(payload.headHash);
        if (localHeadHex !== remoteHeadHex) {
          requestSyncFromPeer(matchedGroupId, senderPeerId);
        }
      }
      return;
    }

    if (wireMessage.type === "signed_action") {
      const action = processSignedAction(
        matchedGroupId,
        { signedBytes: wireMessage.signedBytes, signature: wireMessage.signature, hash: wireMessage.hash },
        senderPeerId !== "unknown" ? senderPeerId : undefined,
      );
      if (action) {
        emit("pubsub-message", `Signed action accepted in group ${matchedGroupId.slice(0, 8)}...`);
        emitActionMessage(matchedGroupId, action, senderPeerId);
      }
      return;
    }

    if (wireMessage.type === "join_request") {
      if (senderPeerId === "unknown") return;
      if (wireMessage.senderPeerId !== senderPeerId) return;
      if (!verifyJoinRequest(wireMessage)) {
        emit(
          "info",
          `Rejected join request with invalid signature from ${senderPeerId.slice(0, 12)}...`,
        );
        return;
      }

      if (isRateLimited(
        incomingJoinRequestRate,
        `${matchedGroupId}:${senderPeerId}`,
        INCOMING_JOIN_REQUEST_MAX,
        INCOMING_JOIN_REQUEST_WINDOW_MS,
      )) {
        emit(
          "info",
          `Rate-limited join request from ${senderPeerId.slice(0, 12)}...`,
        );
        return;
      }

      const requesterHex = toHex(wireMessage.requesterPublicKey);
      publicKeyToPeerId.set(requesterHex, senderPeerId);
      notifyPublicKeyToPeerIdChange();

      const requesterAlreadyMember = actionChainStates.get(matchedGroupId)?.members.has(requesterHex) ?? false;
      let inviteTokenId: string | undefined;
      let inviteValidationError: string | undefined;
      let autoApproved = false;

      if (wireMessage.inviteGrant) {
        const approvedCount = wireMessage.inviteGrant.claims.kind === "open" &&
            wireMessage.inviteGrant.claims.maxJoiners !== undefined
          ? getInviteGrantApprovalCount(matchedGroupId, wireMessage.inviteGrant.claims.tokenId)
          : undefined;
        const grantValidation = validateInviteGrantForJoin(wireMessage.inviteGrant, {
          groupId: matchedGroupId,
          requesterPeerId: senderPeerId,
          approvedCount,
          now: Date.now(),
        });
        if (grantValidation.success) {
          inviteTokenId = grantValidation.data.tokenId;
          const pendingForGroup = pendingJoinInviteGrantsByGroup.get(matchedGroupId) ?? new Map();
          pendingForGroup.set(requesterHex, wireMessage.inviteGrant);
          pendingJoinInviteGrantsByGroup.set(matchedGroupId, pendingForGroup);
        } else {
          inviteValidationError = grantValidation.error.message;
        }
      }

      const currentJoinPolicy = actionChainStates.get(matchedGroupId)?.joinPolicy ?? "manual";
      if (
        isOwnAdminOfGroup(matchedGroupId) &&
        currentJoinPolicy === "auto_with_invite" &&
        inviteTokenId !== undefined &&
        !actionChainStates.get(matchedGroupId)?.members.has(requesterHex)
      ) {
        autoApproved = true;
        performApproveJoin(matchedGroupId, wireMessage.requesterPublicKey, { inviteTokenId }).catch(() => {
          autoApproved = false;
        });
      }

      if (isOwnAdminOfGroup(matchedGroupId) && requesterAlreadyMember) {
        publishSyncResponse(matchedGroupId, senderPeerId).catch(() => {});
        emit("sync", `Triggered targeted sync for already-approved member ${requesterHex.slice(0, 12)}...`);
      }

      emit("pubsub-message", `Join request for group ${matchedGroupId.slice(0, 8)}...`);
      joinRequestListeners.forEach((listener) =>
        listener({
          groupId: matchedGroupId,
          requesterPublicKey: wireMessage.requesterPublicKey,
          senderPeerId,
          inviteTokenId,
          inviteValidationError,
          autoApproved,
          alreadyMember: requesterAlreadyMember,
        }),
      );
      return;
    }

    if (wireMessage.type !== "encrypted_message") return;

    if (!canLocalPeerConsumeGroupUpdates(matchedGroupId)) return;
    if (isMembershipEnforcedGroup(matchedGroupId) && senderPeerId !== "unknown" && !isPeerMemberOfGroup(matchedGroupId, senderPeerId)) {
      return;
    }

    const payload = wireMessage.payload;
    const chatMessage: MultiGroupChatMessageEvent = {
      id: payload.id,
      senderPeerId: payload.senderPeerId,
      senderDisplayName: payload.senderDisplayName,
      text: new TextDecoder().decode(payload.ciphertext),
      timestamp: payload.timestamp,
      groupId: matchedGroupId,
    };

    emit("pubsub-message", `Message from ${peerId({ toString: () => payload.senderPeerId })}... in group ${matchedGroupId.slice(0, 8)}...`);
    attemptDirectConnect(payload.senderPeerId);

    messageListeners.forEach((listener) => listener(chatMessage));
  };

  pubsub.addEventListener("message", handlePubsubMessage);
  pubsub.subscribe(DIRECT_MESSAGE_REQUEST_TOPIC);
  pubsub.subscribe(PROFILE_SYNC_TOPIC);
  void publishProfileAnnounce().catch(() => {});

  if (isBrowser) {
    createProviderCid(ANYPOST_CHAT_NAMESPACE).then((chatCid) => {
      node.contentRouting.provide(chatCid).catch(() => {});
    }).catch(() => {});
  }

  const relayPoolManager = isBrowser && onRelayPoolStateChange
    ? startRelayPoolManager({
        node: {
          contentRouting: node.contentRouting,
          dial: (addr) => node.dial(multiaddr(addr as string)),
        },
        onStateChange: (poolState) => {
          for (const relay of poolState.relays) {
            if (!relayPeers.includes(relay.address)) {
              relayPeers.push(relay.address);
            }
            relayReservationManager.ingestRelayAddress(relay.address);
          }
          onRelayPoolStateChange(poolState);
        },
      })
    : null;

  const groupDiscoveryManager: GroupDiscoveryManager | null = isBrowser
    ? createGroupDiscoveryManager({
        contentRouting: node.contentRouting,
        getConnectedPeerIds: () => node.getPeers().map((p) => p.toString()),
        searchScheduleMs:
          discoveryProfile === "aggressive"
            ? AGGRESSIVE_DISCOVERY_SEARCH_SCHEDULE_MS
            : BALANCED_DISCOVERY_SEARCH_SCHEDULE_MS,
        onStateChange: (discoveryState) => {
          onGroupDiscoveryStateChange?.(discoveryState);
        },
        onSearchCompleted: (groupId, searchRound, providersFound) => {
          const metrics = getOrCreatePeerDiscoveryMetrics(groupId);
          metrics.searchRound = searchRound;
          metrics.providersFound = providersFound;
          emitPeerDiscoveryMetrics(groupId);
        },
        onPeerDiscovered: (groupId, peerId, addrs) => {
          const metrics = getOrCreatePeerDiscoveryMetrics(groupId);
          metrics.newDialableAddresses += addrs.length;
          emitPeerDiscoveryMetrics(groupId);
          attemptDirectConnect(peerId, addrs, groupId);
        },
      })
    : null;

  const RESERVATION_TICK_INTERVAL_MS = 5_000;
  const runRelayReservationTick = async () => {
    const now = Date.now();
    for (const [peerId, startedAt] of [...pendingDirectUpgradeByPeer.entries()]) {
      if (now - startedAt > DIRECT_UPGRADE_WINDOW_MS) {
        pendingDirectUpgradeByPeer.delete(peerId);
      }
    }

    const requests = relayReservationManager.getDialRequests();
    for (const request of requests) {
      if (request.reason === "renew") {
        connectionMetrics.renewAttempts += 1;
      } else {
        connectionMetrics.reservationAttempts += 1;
      }
      emitConnectionMetrics();

      try {
        emit("dial-attempt", `Reservation ${request.reason}: ${request.address.slice(0, 80)}...`);
        await node.dial(multiaddr(request.address));
      } catch {
        relayReservationManager.markReservationLost(request.peerId);
        if (request.reason === "renew") {
          connectionMetrics.renewFailures += 1;
        } else {
          connectionMetrics.reservationFailures += 1;
        }
        emitConnectionMetrics();
        emit("dial-failure", `Reservation ${request.reason} failed: ${request.address.slice(0, 80)}...`);
      }
    }
  };

  const relayReservationInterval = isBrowser
    ? setInterval(() => {
        void runRelayReservationTick();
      }, RESERVATION_TICK_INTERVAL_MS)
    : null;
  if (isBrowser) {
    void runRelayReservationTick();
  }

  const runJoinRetryAttempt = async (groupId: string) => {
    try {
      await publishJoinRequest(groupId, joinInviteGrantByGroup.get(groupId));
    } catch {
      emit("info", `Join request retry failed for ${groupId.slice(0, 8)}...`);
    } finally {
      joinRetryState = recordJoinRetryAttempt(joinRetryState, groupId, Date.now());
      emitJoinRetryState();
    }
  };

  const runJoinRetryTick = async () => {
    const now = Date.now();
    const due = dueJoinRetries(joinRetryState, now);
    for (const entry of due) {
      if (!joinedGroups.includes(entry.groupId)) {
        continue;
      }
      if (isOwnMemberOfGroup(entry.groupId)) {
        joinRetryState = removeJoinRetry(joinRetryState, entry.groupId);
        emitJoinRetryState();
        continue;
      }
      emit("info", `Retrying join request for ${entry.groupId.slice(0, 8)}...`);
      await runJoinRetryAttempt(entry.groupId);
    }
  };

  const joinRetryInterval = setInterval(() => {
    void runJoinRetryTick();
  }, JOIN_RETRY_TICK_INTERVAL_MS);
  void runJoinRetryTick();

  const latestSyncReceiveAtMs = (groupId: string): number | null => {
    const byPeer = syncProgressByGroup.get(groupId);
    if (!byPeer || byPeer.size === 0) return null;

    let latest = 0;
    for (const progress of byPeer.values()) {
      latest = Math.max(latest, progress.lastReceivedAtMs ?? 0);
    }
    return latest > 0 ? latest : null;
  };

  const runSyncReconcileTick = () => {
    const connectedPeers = node.getPeers();
    if (connectedPeers.length === 0) return;

    const now = Date.now();
    for (const groupId of joinedGroups) {
      if (isMembershipEnforcedGroup(groupId) && !isOwnMemberOfGroup(groupId)) continue;
      const latestReceivedAt = latestSyncReceiveAtMs(groupId);
      const stale = latestReceivedAt === null || now - latestReceivedAt >= syncReconcileStaleMs;
      if (!stale) continue;
      requestSyncFromConnectedPeers(groupId);
      emit("sync", `Periodic sync reconcile for group ${groupId.slice(0, 8)}...`);
    }
  };

  const syncReconcileInterval = setInterval(() => {
    runSyncReconcileTick();
  }, Math.max(1_000, syncReconcileIntervalMs));
  runSyncReconcileTick();

  const performApproveJoin = async (
    groupId: string,
    memberPublicKey: Uint8Array,
    options?: { readonly inviteTokenId?: string },
  ): Promise<void> => {
    const dag = actionDags.get(groupId);
    if (!dag) throw new Error("No action chain for this group");

    const tips = getTips(dag);
    const parentHashes = tips.length > 0 ? tips : [GENESIS_HASH];
    const memberPublicKeyHex = toHex(memberPublicKey);
    if (isRateLimited(
      outgoingApprovalRate,
      `${groupId}:${memberPublicKeyHex}`,
      OUTGOING_APPROVAL_MAX,
      OUTGOING_APPROVAL_WINDOW_MS,
    )) {
      throw new Error("Approval rate limit exceeded");
    }
    let inviteTokenId = options?.inviteTokenId;

    if (!inviteTokenId) {
      const pendingForGroup = pendingJoinInviteGrantsByGroup.get(groupId);
      const grant = pendingForGroup?.get(memberPublicKeyHex);
      if (grant) {
        const requesterPeerId = publicKeyToPeerId.get(memberPublicKeyHex) ?? "";
        const approvedCount = grant.claims.kind === "open" &&
            grant.claims.maxJoiners !== undefined
          ? getInviteGrantApprovalCount(groupId, grant.claims.tokenId)
          : undefined;
        const grantValidation = validateInviteGrantForJoin(grant, {
          groupId,
          requesterPeerId,
          approvedCount,
          now: Date.now(),
        });
        if (!grantValidation.success) {
          throw new Error(`Invite grant rejected: ${grantValidation.error.message}`);
        }
        inviteTokenId = grantValidation.data.tokenId;
      }
    }

    const envelope = createSignedActionEnvelope({
      accountKey,
      groupId,
      parentHashes,
      payload: {
        type: "member-approved",
        memberPublicKey: new Uint8Array(memberPublicKey),
        role: "member",
        inviteTokenId,
      },
    });

    processSignedAction(groupId, envelope);
    await publishEnvelope(groupId, envelope);
    pendingJoinInviteGrantsByGroup.get(groupId)?.delete(memberPublicKeyHex);

    emit("info", `Approved member ${toHex(memberPublicKey).slice(0, 16)}... in group ${groupId.slice(0, 8)}...`);
  };

  const performLocalLeaveCleanup = (groupId: string) => {
    const idx = joinedGroups.indexOf(groupId);
    if (idx === -1) return;
    const topic = groupTopic(groupId);
    pubsub.unsubscribe(topic);
    topicToGroupId.delete(topic);
    joinedGroups.splice(idx, 1);
    actionDags.delete(groupId);
    actionChainStates.delete(groupId);
    actionEnvelopes.delete(groupId);
    syncProgressByGroup.delete(groupId);
    emitSyncProgressState();
    peerDiscoveryMetrics.delete(groupId);
    joinInviteGrantByGroup.delete(groupId);
    pendingJoinInviteGrantsByGroup.delete(groupId);
    for (const bucket of [
      incomingJoinRequestRate,
      incomingSyncRequestRate,
      outgoingSyncRequestRate,
      outgoingApprovalRate,
    ]) {
      for (const key of [...bucket.keys()]) {
        if (key.startsWith(`${groupId}:`)) bucket.delete(key);
      }
    }
    outgoingJoinRequestRate.delete(groupId);
    for (const bucket of [pendingSyncRequests, seenSyncResponses]) {
      for (const key of [...bucket.keys()]) {
        if (key.startsWith(`${groupId}:`)) bucket.delete(key);
      }
    }
    joinRetryState = removeJoinRetry(joinRetryState, groupId);
    emitJoinRetryState();
    groupDiscoveryManager?.leaveGroup(groupId);
    reconcilePeerPathCache(true);
    emit("info", `Left group ${groupId.slice(0, 8)}...`);
  };

  const MEMBER_RECONNECT_INTERVAL = 30_000;

  const reconnectDisconnectedMembers = () => {
    const ownId = node.peerId.toString();
    const connectedIds = new Set(node.getPeers().map((p) => p.toString()));
    const pinnedPeerIds = getPinnedPeerIds();
    for (const memberPeerId of pinnedPeerIds) {
      if (memberPeerId === ownId) continue;
      tagGroupMemberKeepAlive(memberPeerId);
      if (connectedIds.has(memberPeerId)) continue;
      attemptDirectConnect(memberPeerId);
    }
  };

  const memberReconnectInterval = isBrowser
    ? setInterval(reconnectDisconnectedMembers, MEMBER_RECONNECT_INTERVAL)
    : null;

  const createGroupWithResolvedId = async (
    groupId: string,
    name: string,
  ): Promise<{ groupId: string; genesisEnvelope: SignedActionEnvelope }> => {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) throw new Error("Group name cannot be empty");
    if (groupId.trim().length === 0) throw new Error("Group ID cannot be empty");

    const topic = groupTopic(groupId);

    if (!joinedGroups.includes(groupId)) {
      topicToGroupId.set(topic, groupId);
      joinedGroups.push(groupId);
      getOrCreatePeerDiscoveryMetrics(groupId);
      pubsub.subscribe(topic);
      groupDiscoveryManager?.joinGroup(groupId);
    }

    actionChainStates.set(groupId, createActionChainGroupState(groupId));
    reconcilePeerPathCache();

    const envelope = createSignedActionEnvelope({
      accountKey,
      groupId,
      parentHashes: [GENESIS_HASH],
      payload: { type: "group-created", groupName: trimmedName, joinPolicy: "manual" },
    });

    processSignedAction(groupId, envelope);
    await publishEnvelope(groupId, envelope);

    emit("info", `Created group \"${trimmedName}\" (${groupId.slice(0, 8)}...)`);
    return { groupId, genesisEnvelope: envelope };
  };

  return {
    peerId: node.peerId.toString(),
    getPeerPrivateKey: () => new Uint8Array(privateKey.raw),
    get multiaddrs() {
      return node.getMultiaddrs();
    },
    joinGroup: (groupId: string) => {
      if (joinedGroups.includes(groupId)) return;
      const topic = groupTopic(groupId);
      topicToGroupId.set(topic, groupId);
      joinedGroups.push(groupId);
      getOrCreatePeerDiscoveryMetrics(groupId);
      pubsub.subscribe(topic);
      groupDiscoveryManager?.joinGroup(groupId);
      reconcilePeerPathCache();
      emit("info", `Joined group ${groupId.slice(0, 8)}... (topic: ${topic})`);
      requestSyncFromConnectedPeers(groupId);
    },
    leaveGroup: async (groupId: string) => {
      if (!joinedGroups.includes(groupId)) return;

      const dag = actionDags.get(groupId);
      if (dag) {
        const tips = getTips(dag);
        const parentHashes = tips.length > 0 ? tips : [GENESIS_HASH];
        const leaveEnvelope = createSignedActionEnvelope({
          accountKey,
          groupId,
          parentHashes,
          payload: { type: "member-left" },
        });
        processSignedAction(groupId, leaveEnvelope);
        try {
          await publishEnvelope(groupId, leaveEnvelope);
          await new Promise((resolve) => setTimeout(resolve, 200));
          emit("info", `Published leave action for ${groupId.slice(0, 8)}...`);
        } catch {
          emit("info", `Failed to publish leave action for ${groupId.slice(0, 8)}..., leaving locally`);
        }
      }

      performLocalLeaveCleanup(groupId);
    },
    getJoinedGroups: () => [...joinedGroups],
    sendMessage: async (groupId: string, text: string, _displayName?: string) => {
      if (isMembershipEnforcedGroup(groupId) && !isOwnMemberOfGroup(groupId)) {
        throw new Error("Not a member of this group");
      }
      const dag = getOrCreateDag(groupId);
      const tips = getTips(dag);
      const parentHashes = tips.length > 0 ? tips : [GENESIS_HASH];

      const envelope = createSignedActionEnvelope({
        accountKey,
        groupId,
        parentHashes,
        payload: { type: "message", text },
      });

      processSignedAction(groupId, envelope);
      await publishEnvelope(groupId, envelope);
    },
    createGroup: async (name: string): Promise<{ groupId: string; genesisEnvelope: SignedActionEnvelope }> => {
      const groupId = crypto.randomUUID();
      return await createGroupWithResolvedId(groupId, name);
    },
    createGroupWithId: async (groupId: string, name: string): Promise<{ groupId: string; genesisEnvelope: SignedActionEnvelope }> => {
      return await createGroupWithResolvedId(groupId, name);
    },
    joinViaInvite: async (invite: GroupInvite): Promise<{ groupId: string }> => {
      const verifyResult = verifyAndDecodeAction(invite.genesisEnvelope);
      if (!verifyResult.success) {
        throw new Error(`Invalid invite: ${verifyResult.error.message}`);
      }

      const groupId = verifyResult.data.groupId;
      if (invite.inviteGrant) {
        const localGrantValidation = validateInviteGrantForJoin(invite.inviteGrant, {
          groupId,
          requesterPeerId: node.peerId.toString(),
          now: Date.now(),
        });
        if (!localGrantValidation.success) {
          throw new Error(`Invite rejected for this peer: ${localGrantValidation.error.message}`);
        }
        joinInviteGrantByGroup.set(groupId, invite.inviteGrant);
      } else {
        joinInviteGrantByGroup.delete(groupId);
      }

      if (!relayPeers.includes(invite.relayAddr)) {
        relayPeers.push(invite.relayAddr);
        emit("info", `Relay added from invite: ${invite.relayAddr.slice(0, 40)}...`);
      }
      relayReservationManager.ingestRelayAddress(invite.relayAddr);

      processSignedAction(groupId, invite.genesisEnvelope);

      const authorHex = toHex(verifyResult.data.authorPublicKey);
      publicKeyToPeerId.set(authorHex, invite.adminPeerId);
      notifyPublicKeyToPeerIdChange();

      if (!joinedGroups.includes(groupId)) {
        const topic = groupTopic(groupId);
        topicToGroupId.set(topic, groupId);
        joinedGroups.push(groupId);
        getOrCreatePeerDiscoveryMetrics(groupId);
        pubsub.subscribe(topic);
        groupDiscoveryManager?.joinGroup(groupId);
        reconcilePeerPathCache();
        emit("info", `Joined group ${groupId.slice(0, 8)}... via invite`);
      }

      const isConnectedToAdmin = node.getPeers().some((p) => p.toString() === invite.adminPeerId);
      if (!isConnectedToAdmin) {
        void tryConnectToPeerId(invite.adminPeerId).catch(() => {});
      }

      joinRetryState = enqueueJoinRetry(joinRetryState, groupId, Date.now());
      emitJoinRetryState();
      void runJoinRetryAttempt(groupId);
      requestSyncFromConnectedPeers(groupId);

      return { groupId };
    },
    sendDirectMessageRequest: async (request): Promise<void> => {
      const targetPeerId = request.targetPeerId.trim();
      if (targetPeerId.length === 0) throw new Error("Target peer ID is required");
      if (request.groupId.trim().length === 0) throw new Error("Group ID is required");
      if (request.groupName.trim().length === 0) throw new Error("Group name is required");
      if (request.inviteCode.trim().length === 0) throw new Error("Invite code is required");
      const senderPublicKey = new Uint8Array(accountKey.publicKey);
      const requestId = crypto.randomUUID();
      const sentAt = Date.now();
      const signature = signDirectMessageRequest({
        requestId,
        senderPeerId: ownPeerId,
        senderPublicKey,
        targetPeerId,
        groupId: request.groupId,
        groupName: request.groupName,
        inviteCode: request.inviteCode,
        sentAt,
      });
      const wireMessage: WireMessage = {
        type: "dm_request",
        payload: {
          requestId,
          senderPeerId: ownPeerId,
          senderPublicKey,
          targetPeerId,
          groupId: request.groupId,
          groupName: request.groupName,
          inviteCode: request.inviteCode,
          sentAt,
          signature: new Uint8Array(Array.from(signature)),
        },
      };
      await pubsub.publish(DIRECT_MESSAGE_REQUEST_TOPIC, encodeWireMessage(wireMessage));
      emit("info", `Sent DM request to ${targetPeerId.slice(0, 12)}...`);
    },
    renameGroup: async (groupId: string, newName: string): Promise<void> => {
      const trimmed = newName.trim();
      if (trimmed.length === 0) throw new Error("Group name cannot be empty");
      const dag = actionDags.get(groupId);
      if (!dag) throw new Error("No action chain for this group");

      const tips = getTips(dag);
      const parentHashes = tips.length > 0 ? tips : [GENESIS_HASH];
      const envelope = createSignedActionEnvelope({
        accountKey,
        groupId,
        parentHashes,
        payload: {
          type: "group-renamed",
          newName: trimmed,
        },
      });
      processSignedAction(groupId, envelope);
      await publishEnvelope(groupId, envelope);
      emit("info", `Renamed group ${groupId.slice(0, 8)}... to "${trimmed}"`);
    },
    approveJoin: async (
      groupId: string,
      memberPublicKey: Uint8Array,
      options?: { readonly inviteTokenId?: string },
    ): Promise<void> =>
      performApproveJoin(groupId, memberPublicKey, options),
    setJoinPolicy: async (groupId: string, joinPolicy: JoinPolicy): Promise<void> => {
      const dag = actionDags.get(groupId);
      if (!dag) throw new Error("No action chain for this group");

      const tips = getTips(dag);
      const parentHashes = tips.length > 0 ? tips : [GENESIS_HASH];
      const envelope = createSignedActionEnvelope({
        accountKey,
        groupId,
        parentHashes,
        payload: {
          type: "join-policy-changed",
          joinPolicy,
        },
      });
      processSignedAction(groupId, envelope);
      await publishEnvelope(groupId, envelope);
      emit("info", `Join policy set to ${joinPolicy} for group ${groupId.slice(0, 8)}...`);
    },
    changeMemberRole: async (
      groupId: string,
      memberPublicKey: Uint8Array,
      newRole: ActionRole,
    ): Promise<void> => {
      const dag = actionDags.get(groupId);
      if (!dag) throw new Error("No action chain for this group");
      if (newRole === "owner" && toHex(memberPublicKey) === ownPublicKeyHex) {
        throw new Error("Cannot transfer ownership to yourself");
      }

      const tips = getTips(dag);
      const parentHashes = tips.length > 0 ? tips : [GENESIS_HASH];
      const envelope = createSignedActionEnvelope({
        accountKey,
        groupId,
        parentHashes,
        payload: {
          type: "role-changed",
          memberPublicKey: new Uint8Array(memberPublicKey),
          newRole,
        },
      });
      const action = processSignedAction(groupId, envelope);
      if (!action) {
        throw new Error("Role change rejected by local policy");
      }
      await publishEnvelope(groupId, envelope);
      emit(
        "info",
        `Changed member role to ${newRole} in group ${groupId.slice(0, 8)}...`,
      );
    },
    removeMember: async (groupId: string, memberPublicKey: Uint8Array): Promise<void> => {
      const dag = actionDags.get(groupId);
      if (!dag) throw new Error("No action chain for this group");

      const tips = getTips(dag);
      const parentHashes = tips.length > 0 ? tips : [GENESIS_HASH];

      const envelope = createSignedActionEnvelope({
        accountKey,
        groupId,
        parentHashes,
        payload: {
          type: "member-removed",
          memberPublicKey: new Uint8Array(memberPublicKey),
        },
      });

      processSignedAction(groupId, envelope);
      await publishEnvelope(groupId, envelope);

      emit("info", `Removed member ${toHex(memberPublicKey).slice(0, 16)}... from group ${groupId.slice(0, 8)}...`);
    },
    requestJoin: async (groupId: string): Promise<void> => {
      joinRetryState = enqueueJoinRetry(joinRetryState, groupId, Date.now());
      emitJoinRetryState();
      await runJoinRetryAttempt(groupId);
    },
    getActionChainState: (groupId: string): ActionChainGroupState | null =>
      actionChainStates.get(groupId) ?? null,
    getActionChainEnvelopes: (groupId: string): readonly SignedActionEnvelope[] =>
      getOrderedEnvelopes(groupId),
    getAllActionChainEnvelopes: (): ReadonlyMap<string, readonly SignedActionEnvelope[]> =>
      new Map([...actionEnvelopes.keys()].map((groupId) => [groupId, getOrderedEnvelopes(groupId)])),
    loadActionChain: (groupId: string, envelopes: readonly SignedActionEnvelope[]) => {
      for (const envelope of envelopes) {
        processSignedAction(groupId, envelope);
      }
      requestSyncFromConnectedPeers(groupId);
    },
    getPublicKeyToPeerId: (): ReadonlyMap<string, string> => new Map(publicKeyToPeerId),
    getJoinRetryState: (): JoinRetryState => createJoinRetryState(joinRetryState),
    getSyncProgressState: (): SyncProgressState =>
      cloneSyncProgressState(),
    onMessage: (listener: MessageListener) => {
      messageListeners.push(listener);
      return () => {
        const index = messageListeners.indexOf(listener);
        if (index !== -1) messageListeners.splice(index, 1);
      };
    },
    onJoinRequest: (listener: JoinRequestListener) => {
      joinRequestListeners.push(listener);
      return () => {
        const index = joinRequestListeners.indexOf(listener);
        if (index !== -1) joinRequestListeners.splice(index, 1);
      };
    },
    onDirectMessageRequest: (listener: DirectMessageRequestListener) => {
      directMessageRequestListeners.push(listener);
      return () => {
        const index = directMessageRequestListeners.indexOf(listener);
        if (index !== -1) directMessageRequestListeners.splice(index, 1);
      };
    },
    onPeerChange: (listener: (count: number) => void) => {
      peerChangeListeners.push(listener);
      return () => {
        const index = peerChangeListeners.indexOf(listener);
        if (index !== -1) peerChangeListeners.splice(index, 1);
      };
    },
    onEvent: (listener: EventListener) => {
      eventListeners.push(listener);
      return () => {
        const index = eventListeners.indexOf(listener);
        if (index !== -1) eventListeners.splice(index, 1);
      };
    },
    getNetworkStatus: () => {
      const connections = node.getConnections();
      const peers: PeerInfo[] = connections.map((conn) => ({
        peerId: conn.remotePeer.toString(),
        addrs: [conn.remoteAddr.toString()],
        direction: conn.direction,
        protocol: conn.multiplexer ?? "unknown",
      }));
      const allTopics = [...topicToGroupId.keys()];
      const totalSubscribers = allTopics.reduce(
        (sum, t) => sum + pubsub.getSubscribers(t).length,
        0,
      );
      return {
        peerId: node.peerId.toString(),
        multiaddrs: node.getMultiaddrs().map((ma) => ma.toString()),
        topic: allTopics.join(", "),
        peers,
        subscriberCount: totalSubscribers,
      };
    },
    connectTo: async (addr: Multiaddr) => {
      await node.dial(addr);
    },
    connectToPeerId: async (targetPeerId: string) => {
      await tryConnectToPeerId(targetPeerId);
    },
    pingPeer: async (targetPeerId: string) => {
      const remotePeer = peerIdFromString(targetPeerId);
      const services = node.services as Record<string, unknown>;
      const pingService = services.ping as PingService | undefined;
      if (!pingService) throw new Error("Ping service not available");
      return pingService.ping(remotePeer);
    },
    retryJoinNow: async (groupId: string) => {
      joinRetryState = enqueueJoinRetry(joinRetryState, groupId, Date.now());
      emitJoinRetryState();
      await runJoinRetryAttempt(groupId);
    },
    cancelJoinRetry: (groupId: string) => {
      joinRetryState = markJoinRetryCancelled(joinRetryState, groupId);
      emitJoinRetryState();
      emit("info", `Join retry cancelled for ${groupId.slice(0, 8)}...`);
    },
    addRelay: (addr: string) => {
      if (!relayPeers.includes(addr)) {
        relayPeers.push(addr);
        emit("info", `Relay added: ${addr.slice(0, 40)}...`);
      }
      relayReservationManager.ingestRelayAddress(addr);
    },
    stop: async () => {
      if (memberReconnectInterval) clearInterval(memberReconnectInterval);
      if (relayReservationInterval) clearInterval(relayReservationInterval);
      if (joinRetryInterval) clearInterval(joinRetryInterval);
      clearInterval(syncReconcileInterval);
      inFlightPeerDials.clear();
      pendingDirectUpgradeByPeer.clear();
      joinRetryState = createJoinRetryState();
      joinInviteGrantByGroup.clear();
      pendingJoinInviteGrantsByGroup.clear();
      relayPoolManager?.stop();
      groupDiscoveryManager?.stop();
      pubsub.removeEventListener("message", handlePubsubMessage);
      for (const topic of topicToGroupId.keys()) {
        pubsub.unsubscribe(topic);
      }
      pubsub.unsubscribe(DIRECT_MESSAGE_REQUEST_TOPIC);
      pubsub.unsubscribe(PROFILE_SYNC_TOPIC);
      topicToGroupId.clear();
      joinedGroups.length = 0;
      messageListeners.length = 0;
      joinRequestListeners.length = 0;
      directMessageRequestListeners.length = 0;
      peerChangeListeners.length = 0;
      eventListeners.length = 0;
      actionDags.clear();
      actionChainStates.clear();
      actionEnvelopes.clear();
      syncProgressByGroup.clear();
      emitSyncProgressState();
      incomingJoinRequestRate.clear();
      incomingSyncRequestRate.clear();
      outgoingJoinRequestRate.clear();
      outgoingSyncRequestRate.clear();
      outgoingApprovalRate.clear();
      pendingSyncRequests.clear();
      seenSyncResponses.clear();
      await node.stop();
    },
  };
};
