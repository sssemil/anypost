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
import type {
  WireMessage,
  CallControlAction,
  CallControlPayload,
} from "../shared/schemas.js";
import type { ChatMessageEvent, PeerInfo, NetworkStatus, NetworkEvent } from "./plaintext-chat.js";
import type { AccountKey } from "../crypto/identity.js";
import { GENESIS_HASH, toHex } from "./action-chain.js";
import type { ActionChainGroupState, SignedActionEnvelope, SignedAction, JoinPolicy, ActionRole } from "./action-chain.js";
import { createSignedActionEnvelope, verifyAndDecodeAction } from "./action-signing.js";
import { createActionDagState, appendAction, getTips, topologicalOrder } from "./action-dag.js";
import type { ActionDagState } from "./action-dag.js";
import { createActionChainGroupState, deriveGroupState } from "./action-chain-state.js";
import { decodeGroupInvite, encodeGroupInvite } from "./group-invite.js";
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
import {
  createDefaultRuntimeAdapter,
  isBrowserRuntimeProfile,
  type MultiGroupRuntimeAdapter,
  type MultiGroupTransportProfile,
} from "./runtime-adapter.js";
import {
  signSyncRequest,
  verifySyncRequest,
  signSyncResponse,
  verifySyncResponse,
  getMissingEnvelopesForKnownHash,
  INCOMING_SYNC_REQUEST_MAX,
  OUTGOING_SYNC_REQUEST_MAX,
  FULL_SYNC_FALLBACK_COOLDOWN_MS,
} from "./sync-protocol.js";
import {
  MEDIA_SIGNAL_PROTOCOL,
  encodeMediaSignalEnvelope,
  decodeMediaSignalEnvelope,
} from "../media/signaling.js";
import type { SignalMessage } from "../media/signaling.js";

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

export type DirectMessageHandshakeState = {
  readonly complete: boolean;
  readonly contributorPublicKeyHexes: readonly string[];
  readonly missingPeerIds: readonly string[];
};

export type CallParticipantState = {
  readonly peerId: string;
  readonly joinedAt: number;
  readonly lastHeartbeatAt: number;
  readonly muted: boolean;
};

export type CallState = {
  readonly groupId: string;
  readonly startedAt: number;
  readonly ringingPeerIds: readonly string[];
  readonly participants: ReadonlyMap<string, CallParticipantState>;
};

export type CallEvent = {
  readonly action: CallControlAction;
  readonly groupId: string;
  readonly senderPeerId: string;
  readonly targetPeerId?: string;
  readonly muted?: boolean;
  readonly sentAt: number;
  readonly source: "local" | "remote";
};

type CallEventListener = (event: CallEvent) => void;

export type MediaSignalEvent = {
  readonly groupId: string;
  readonly senderPeerId: string;
  readonly message: SignalMessage;
};

type MediaSignalListener = (event: MediaSignalEvent) => void;

export type RelayContactSource =
  | "bootstrap"
  | "invite"
  | "candidate"
  | "manual"
  | "harvest"
  | "reservation"
  | "unknown";

export type RelayContactBookEntry = {
  readonly peerId: string;
  readonly addresses: readonly string[];
  readonly sources: readonly RelayContactSource[];
  readonly firstSeenAtMs: number;
  readonly lastSeenAtMs: number;
  readonly lastAttemptAtMs: number | null;
  readonly lastSuccessAtMs: number | null;
  readonly lastFailureAtMs: number | null;
  readonly successCount: number;
  readonly failureCount: number;
  readonly consecutiveFailures: number;
  readonly averageRttMs: number | null;
  readonly quarantinedUntilMs: number | null;
  readonly score: number;
};

export type RelayContactBook = ReadonlyMap<string, RelayContactBookEntry>;

export type PinnedPeerWatchdogStatus = "connected" | "degraded" | "recovering";

export type PinnedPeerWatchdogEntry = {
  readonly peerId: string;
  readonly status: PinnedPeerWatchdogStatus;
  readonly lastStatusChangeAtMs: number;
  readonly consecutiveFailures: number;
  readonly lastSuccessfulPingAtMs: number | null;
  readonly lastReconnectAttemptAtMs: number | null;
};

export type PinnedPeerWatchdogState = ReadonlyMap<string, PinnedPeerWatchdogEntry>;

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
  readonly editMessage: (groupId: string, targetActionId: string, newText: string) => Promise<void>;
  readonly deleteMessage: (groupId: string, targetActionId: string) => Promise<void>;
  readonly sendReadReceipt: (groupId: string, upToActionId: string) => Promise<void>;
  readonly createGroup: (name: string) => Promise<{ groupId: string; genesisEnvelope: SignedActionEnvelope }>;
  readonly createGroupWithId: (groupId: string, name: string) => Promise<{ groupId: string; genesisEnvelope: SignedActionEnvelope }>;
  readonly createDirectMessageGroupWithId: (
    groupId: string,
    peerIds: readonly [string, string],
  ) => Promise<{ groupId: string; genesisEnvelope: SignedActionEnvelope }>;
  readonly joinViaInvite: (invite: GroupInvite) => Promise<{ groupId: string }>;
  readonly acceptDirectMessageRequest: (requestId: string) => Promise<{ groupId: string }>;
  readonly sendDirectMessageRequest: (request: {
    readonly targetPeerId: string;
    readonly groupId: string;
    readonly groupName: string;
    readonly inviteCode: string;
  }) => Promise<void>;
  readonly startCall: (groupId: string) => Promise<void>;
  readonly ringCall: (
    groupId: string,
    options?: { readonly targetPeerId?: string },
  ) => Promise<void>;
  readonly acceptCall: (
    groupId: string,
    options?: { readonly targetPeerId?: string },
  ) => Promise<void>;
  readonly declineCall: (
    groupId: string,
    options?: { readonly targetPeerId?: string },
  ) => Promise<void>;
  readonly joinCall: (groupId: string) => Promise<void>;
  readonly leaveCall: (groupId: string, options?: { readonly muted?: boolean }) => Promise<void>;
  readonly endCall: (groupId: string) => Promise<void>;
  readonly getCallState: (groupId: string) => CallState | null;
  readonly sendMediaSignal: (
    groupId: string,
    targetPeerId: string,
    message: SignalMessage,
  ) => Promise<void>;
  readonly getDirectMessageHandshakeState: (groupId: string) => DirectMessageHandshakeState | null;
  readonly getRelayContactBook: () => RelayContactBook;
  readonly clearRelayContactBook: () => void;
  readonly getPinnedPeerWatchdogState: () => PinnedPeerWatchdogState;
  readonly getPeerPathCache: () => ReadonlyMap<string, readonly string[]>;
  readonly clearPeerPathCache: () => void;
  readonly getConnectionReasonCounts: () => ReadonlyMap<string, number>;
  readonly clearConnectionReasonCounts: () => void;
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
  readonly onCallEvent: (listener: CallEventListener) => () => void;
  readonly onMediaSignal: (listener: MediaSignalListener) => () => void;
  readonly onPeerChange: (listener: (count: number) => void) => () => void;
  readonly onEvent: (listener: EventListener) => () => void;
  readonly getNetworkStatus: () => NetworkStatus;
  readonly connectTo: (addr: Multiaddr) => Promise<void>;
  readonly connectToPeerId: (targetPeerId: string) => Promise<void>;
  readonly requestProfile: (targetPeerId: string) => Promise<void>;
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
  readonly useTransports?: MultiGroupTransportProfile;
  readonly runtimeAdapter?: MultiGroupRuntimeAdapter;
  readonly onRelayPoolStateChange?: (state: RelayPoolState) => void;
  readonly onGroupDiscoveryStateChange?: (state: GroupDiscoveryState) => void;
  readonly onRelayCandidateStateChange?: (state: RelayCandidateState) => void;
  readonly onRelayContactBookChange?: (state: RelayContactBook) => void;
  readonly onPinnedPeerWatchdogStateChange?: (state: PinnedPeerWatchdogState) => void;
  readonly onPublicKeyToPeerIdChange?: (map: ReadonlyMap<string, string>) => void;
  readonly onPeerPathCacheChange?: (cache: ReadonlyMap<string, readonly string[]>) => void;
  readonly initialRelayHints?: readonly string[];
  readonly initialRelayContactBook?: RelayContactBook;
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
const CACHED_PATH_EVICT_FAILURE_THRESHOLD = 3;
const CACHED_PATH_FAILURE_TRACK_TTL_MS = 10 * 60_000;
const DIAL_CANDIDATE_LIMIT = 3;
const DIAL_CANDIDATE_CONCURRENCY = 2;
const PINNED_DIAL_CANDIDATE_LIMIT = 8;
const PINNED_DIAL_CANDIDATE_CONCURRENCY = 3;
const DIAL_BACKOFF_BASE_MS = 1_000;
const DIAL_BACKOFF_MAX_MS = 30_000;
const RELAY_RESERVATION_TICK_INTERVAL_MS = 2_000;
const RELAY_RESERVATION_DIAL_CONCURRENCY = 3;
const RELAY_RESERVATION_DIAL_TIMEOUT_MS = 4_000;
const RELAY_RESERVATION_BACKOFF_BASE_MS = 750;
const RELAY_RESERVATION_BACKOFF_MAX_MS = 15_000;
const RELAY_RESERVATION_DIAL_ATTEMPT_TIMEOUT_MS = 3_500;
const MEMBER_RECONNECT_FAST_INTERVAL_MS = 5_000;
const MEMBER_RECONNECT_IDLE_INTERVAL_MS = 30_000;
const PINNED_RECONNECT_BURST_SCHEDULE_MS = [0, 1_000, 2_000, 4_000, 8_000, 15_000] as const;
const PINNED_KEEPALIVE_PING_INTERVAL_MS = 15_000;
const PINNED_KEEPALIVE_FAILURE_THRESHOLD = 2;
const RELAY_QUARANTINE_BASE_MS = 2 * 60_000;
const RELAY_QUARANTINE_MAX_MS = 30 * 60_000;
const MAX_CONNECTION_REASON_CODES = 200;
const AGGRESSIVE_DISCOVERY_SEARCH_SCHEDULE_MS = [0, 1_500, 4_000, 9_000] as const;
const BALANCED_DISCOVERY_SEARCH_SCHEDULE_MS = [0, 5_000] as const;
const DIRECT_UPGRADE_WINDOW_MS = 60_000;
const JOIN_RETRY_TICK_INTERVAL_MS = 2_000;
const MAX_SYNC_ENVELOPES_PER_RESPONSE = 256;
const INCOMING_JOIN_REQUEST_WINDOW_MS = 30_000;
const INCOMING_JOIN_REQUEST_MAX = 8;
const INCOMING_SYNC_REQUEST_WINDOW_MS = 10_000;
const OUTGOING_JOIN_REQUEST_WINDOW_MS = 30_000;
const OUTGOING_JOIN_REQUEST_MAX = 10;
const OUTGOING_SYNC_REQUEST_WINDOW_MS = 10_000;
const OUTGOING_APPROVAL_WINDOW_MS = 30_000;
const OUTGOING_APPROVAL_MAX = 10;
const SYNC_REQUEST_TRACK_TTL_MS = 60_000;
const MAX_SYNC_REQUEST_TRACKED = 4_096;
const MAX_SYNC_PROGRESS_PEERS_PER_GROUP = 128;
const SYNC_PROGRESS_STALE_MS = 24 * 60 * 60 * 1_000;
const MAX_CALL_PARTICIPANTS = 8;
const CALL_HEARTBEAT_INTERVAL_MS = 2_500;
const CALL_PARTICIPANT_STALE_MS = 12_000;
const DEFAULT_SYNC_RECONCILE_INTERVAL_MS = 20_000;
const DEFAULT_SYNC_RECONCILE_STALE_MS = 45_000;
const DIRECT_MESSAGE_REQUEST_TOPIC = "anypost/system/dm-requests/v1";
const DIRECT_JOIN_REQUEST_TOPIC = "anypost/system/join-requests/v1";
const PROFILE_SYNC_TOPIC = "anypost/system/profile/v1";
const DIRECT_SIGNED_ACTION_PROTOCOL = "/anypost/direct-signed-action/1.0.0";
const DIRECT_DM_REQUEST_PROTOCOL = "/anypost/direct-dm-request/1.0.0";
const DIRECT_JOIN_REQUEST_PROTOCOL = "/anypost/direct-join-request/1.0.0";
const DIRECT_CALL_CONTROL_PROTOCOL = "/anypost/direct-call-control/1.0.0";

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
    runtimeAdapter: providedRuntimeAdapter,
    onRelayPoolStateChange,
    onGroupDiscoveryStateChange,
    onRelayCandidateStateChange,
    onRelayContactBookChange,
    onPinnedPeerWatchdogStateChange,
    onPublicKeyToPeerIdChange,
    onPeerPathCacheChange,
    initialRelayHints = [],
    initialRelayContactBook,
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
  const runtimeAdapter = providedRuntimeAdapter
    ?? createDefaultRuntimeAdapter(useTransports);
  const runtimeProfile = runtimeAdapter.profile;
  const isWebRuntime = isBrowserRuntimeProfile(runtimeProfile);
  const isDesktopRuntime = runtimeProfile === "desktop";
  const isRelayCapableRuntime = runtimeAdapter.relayCapable;
  const allBootstrapPeers = [...runtimeAdapter.resolveBootstrapPeers(relayPeers)];

  const pubsubDiscovery = isRelayCapableRuntime
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

  const node = isWebRuntime
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
            floodPublish: true,
          }),
          dcutr: dcutr(),
          ping: ping(),
          dht: kadDHT({ clientMode: true }),
        },
      })
    : isDesktopRuntime
      ? await createLibp2p({
          privateKey,
          addresses: {
            listen: [
              ...listenAddresses,
              "/ip4/0.0.0.0/tcp/0",
              "/ip4/0.0.0.0/tcp/0/ws",
              "/p2p-circuit",
              "/webrtc",
            ],
          },
          transports: [
            tcp(),
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
              floodPublish: true,
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
            floodPublish: true,
          }),
        },
      });

  const pubsub = node.services.pubsub as PubSub;
  const topicToGroupId = new Map<string, string>();
  const joinedGroups: string[] = [];
  const messageListeners: MessageListener[] = [];
  const joinRequestListeners: JoinRequestListener[] = [];
  const directMessageRequestListeners: DirectMessageRequestListener[] = [];
  const callEventListeners: CallEventListener[] = [];
  const mediaSignalListeners: MediaSignalListener[] = [];
  const pendingDirectMessageRequestsById = new Map<string, DirectMessageRequestEvent>();
  const peerChangeListeners: Array<(count: number) => void> = [];
  const eventListeners: EventListener[] = [];
  let stopped = false;

  const actionDags = new Map<string, ActionDagState>();
  const actionChainStates = new Map<string, ActionChainGroupState>();
  const actionEnvelopes = new Map<string, SignedActionEnvelope[]>();
  const publicKeyToPeerId = new Map<string, string>(initialPublicKeyToPeerId ?? []);
  const peerPathCache = new Map<string, string[]>();
  const peerDiscoveryHints = new Map<string, string[]>();
  const joinInviteGrantByGroup = new Map<string, InviteGrantProof>();
  const pendingJoinInviteGrantsByGroup = new Map<string, Map<string, InviteGrantProof>>();
  type MutableCallState = {
    groupId: string;
    startedAt: number;
    ringingPeerIds: Set<string>;
    participants: Map<string, CallParticipantState>;
  };
  const activeCallsByGroup = new Map<string, MutableCallState>();

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
  const fullSyncFallbackByGroupPeer = new Map<string, number>();

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
  const connectionReasonCounts = new Map<string, number>();
  const cachedPathFailureCounts = new Map<string, { failures: number; lastFailureAtMs: number }>();

  type MutableRelayContactBookEntry = {
    peerId: string;
    addresses: string[];
    sources: Set<RelayContactSource>;
    firstSeenAtMs: number;
    lastSeenAtMs: number;
    lastAttemptAtMs: number | null;
    lastSuccessAtMs: number | null;
    lastFailureAtMs: number | null;
    successCount: number;
    failureCount: number;
    consecutiveFailures: number;
    averageRttMs: number | null;
    quarantinedUntilMs: number | null;
  };
  const relayContactBook = new Map<string, MutableRelayContactBookEntry>();
  const pinnedPeerWatchdogState = new Map<string, PinnedPeerWatchdogEntry>();

  const recordReason = (code: string) => {
    const nextCount = (connectionReasonCounts.get(code) ?? 0) + 1;
    connectionReasonCounts.set(code, nextCount);
    if (connectionReasonCounts.size > MAX_CONNECTION_REASON_CODES) {
      const oldest = connectionReasonCounts.keys().next().value as string | undefined;
      if (oldest) connectionReasonCounts.delete(oldest);
    }
  };

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

  const hasOfflinePinnedPeers = (): boolean => {
    const ownId = node.peerId.toString();
    const connectedIds = new Set(node.getPeers().map((p) => p.toString()));
    for (const memberPeerId of getPinnedPeerIds()) {
      if (memberPeerId === ownId) continue;
      if (!connectedIds.has(memberPeerId)) return true;
    }
    return false;
  };

  const relayPeerIdFromAddress = (address: string): string | null => {
    const trimmed = address.trim();
    if (trimmed.length === 0) return null;
    const marker = "/p2p/";
    const idx = trimmed.lastIndexOf(marker);
    if (idx === -1) return null;
    const peerId = trimmed.slice(idx + marker.length).split("/")[0];
    return peerId.length > 0 ? peerId : null;
  };

  const mergeRelayAddresses = (current: readonly string[], incoming: readonly string[]): string[] => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const raw of [...incoming, ...current]) {
      const addr = raw.trim();
      if (addr.length === 0 || seen.has(addr)) continue;
      seen.add(addr);
      merged.push(addr);
      if (merged.length >= 12) break;
    }
    return merged;
  };

  const relayContactScore = (entry: MutableRelayContactBookEntry): number => {
    const successRate = entry.successCount + entry.failureCount > 0
      ? entry.successCount / (entry.successCount + entry.failureCount)
      : 0.5;
    const rttScore = entry.averageRttMs === null
      ? 0
      : Math.max(0, 1 - Math.min(entry.averageRttMs, 1500) / 1500);
    const quarantinePenalty = entry.quarantinedUntilMs !== null && entry.quarantinedUntilMs > Date.now()
      ? 0.25
      : 1;
    return Number((successRate * 0.7 + rttScore * 0.3).toFixed(4)) * quarantinePenalty;
  };

  const cloneRelayContactBook = (): RelayContactBook => {
    const snapshot = new Map<string, RelayContactBookEntry>();
    for (const [peerId, entry] of relayContactBook.entries()) {
      snapshot.set(peerId, {
        peerId,
        addresses: [...entry.addresses],
        sources: [...entry.sources],
        firstSeenAtMs: entry.firstSeenAtMs,
        lastSeenAtMs: entry.lastSeenAtMs,
        lastAttemptAtMs: entry.lastAttemptAtMs,
        lastSuccessAtMs: entry.lastSuccessAtMs,
        lastFailureAtMs: entry.lastFailureAtMs,
        successCount: entry.successCount,
        failureCount: entry.failureCount,
        consecutiveFailures: entry.consecutiveFailures,
        averageRttMs: entry.averageRttMs,
        quarantinedUntilMs: entry.quarantinedUntilMs,
        score: relayContactScore(entry),
      });
    }
    return snapshot;
  };

  const emitRelayContactBook = () => {
    onRelayContactBookChange?.(cloneRelayContactBook());
  };

  const createRelayContactEntry = (
    peerId: string,
    source: RelayContactSource,
    address?: string,
  ): MutableRelayContactBookEntry => {
    const now = Date.now();
    return {
      peerId,
      addresses: address ? [address] : [],
      sources: new Set<RelayContactSource>([source]),
      firstSeenAtMs: now,
      lastSeenAtMs: now,
      lastAttemptAtMs: null,
      lastSuccessAtMs: null,
      lastFailureAtMs: null,
      successCount: 0,
      failureCount: 0,
      consecutiveFailures: 0,
      averageRttMs: null,
      quarantinedUntilMs: null,
    };
  };

  const ensureRelayContact = (
    relayPeerId: string,
    source: RelayContactSource,
    address?: string,
  ): MutableRelayContactBookEntry => {
    const existing = relayContactBook.get(relayPeerId);
    const now = Date.now();
    if (existing) {
      existing.lastSeenAtMs = now;
      existing.sources.add(source);
      if (address) {
        existing.addresses = mergeRelayAddresses(existing.addresses, [address]);
      }
      return existing;
    }
    const created = createRelayContactEntry(relayPeerId, source, address);
    relayContactBook.set(relayPeerId, created);
    return created;
  };

  const ingestRelayContact = (
    address: string,
    source: RelayContactSource,
  ) => {
    const relayPeerId = relayPeerIdFromAddress(address);
    if (!relayPeerId) return;
    ensureRelayContact(relayPeerId, source, address);
    emitRelayContactBook();
  };

  const updateRelayContactRtt = (relayPeerId: string, rttMs: number) => {
    if (!Number.isFinite(rttMs) || rttMs <= 0) return;
    const entry = ensureRelayContact(relayPeerId, "candidate");
    const current = entry.averageRttMs;
    entry.averageRttMs = current === null
      ? rttMs
      : Math.round(current * 0.7 + rttMs * 0.3);
    emitRelayContactBook();
  };

  const markRelayContactAttempt = (relayPeerId: string, address?: string) => {
    const entry = relayContactBook.get(relayPeerId)
      ?? (address ? ensureRelayContact(relayPeerId, "reservation", address) : null);
    if (!entry) return;
    entry.lastAttemptAtMs = Date.now();
    emitRelayContactBook();
  };

  const markRelayContactSuccess = (relayPeerId: string, address?: string) => {
    const entry = relayContactBook.get(relayPeerId)
      ?? (address ? ensureRelayContact(relayPeerId, "reservation", address) : null);
    if (!entry) return;
    const now = Date.now();
    entry.lastSeenAtMs = now;
    entry.lastSuccessAtMs = now;
    entry.successCount += 1;
    entry.consecutiveFailures = 0;
    entry.quarantinedUntilMs = null;
    emitRelayContactBook();
  };

  const markRelayContactFailure = (relayPeerId: string, address?: string) => {
    const entry = relayContactBook.get(relayPeerId)
      ?? (address ? ensureRelayContact(relayPeerId, "reservation", address) : null);
    if (!entry) return;
    const now = Date.now();
    entry.lastSeenAtMs = now;
    entry.lastFailureAtMs = now;
    entry.failureCount += 1;
    entry.consecutiveFailures += 1;
    if (entry.consecutiveFailures >= 2) {
      const quarantineMs = Math.min(
        RELAY_QUARANTINE_BASE_MS * 2 ** Math.max(0, entry.consecutiveFailures - 2),
        RELAY_QUARANTINE_MAX_MS,
      );
      entry.quarantinedUntilMs = now + quarantineMs;
    }
    emitRelayContactBook();
  };

  const rankRelayAddressesForDial = (addresses: readonly string[]): readonly string[] => {
    const now = Date.now();
    const scored = addresses.map((address, index) => {
      const relayPeerId = relayPeerIdFromAddress(address);
      const entry = relayPeerId ? relayContactBook.get(relayPeerId) : undefined;
      const quarantined = entry?.quarantinedUntilMs !== null &&
        entry?.quarantinedUntilMs !== undefined &&
        entry.quarantinedUntilMs > now;
      const score = entry ? relayContactScore(entry) : 0.4;
      return {
        address,
        index,
        quarantined,
        score,
      };
    });
    const nonQuarantined = scored.filter((item) => !item.quarantined);
    const fallback = nonQuarantined.length > 0 ? nonQuarantined : scored;
    return fallback
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((item) => item.address);
  };

  const emitPinnedPeerWatchdogState = () => {
    onPinnedPeerWatchdogStateChange?.(new Map(pinnedPeerWatchdogState));
  };

  const setPinnedPeerWatchdog = (
    peerId: string,
    patch: Partial<PinnedPeerWatchdogEntry>,
  ) => {
    const existing = pinnedPeerWatchdogState.get(peerId);
    const next: PinnedPeerWatchdogEntry = {
      peerId,
      status: patch.status ?? existing?.status ?? "recovering",
      lastStatusChangeAtMs:
        patch.lastStatusChangeAtMs
        ?? (patch.status && patch.status !== existing?.status ? Date.now() : existing?.lastStatusChangeAtMs ?? Date.now()),
      consecutiveFailures: patch.consecutiveFailures ?? existing?.consecutiveFailures ?? 0,
      lastSuccessfulPingAtMs: patch.lastSuccessfulPingAtMs ?? existing?.lastSuccessfulPingAtMs ?? null,
      lastReconnectAttemptAtMs: patch.lastReconnectAttemptAtMs ?? existing?.lastReconnectAttemptAtMs ?? null,
    };
    pinnedPeerWatchdogState.set(peerId, next);
    emitPinnedPeerWatchdogState();
  };

  const reconcilePinnedPeerWatchdog = () => {
    const pinned = getPinnedPeerIds();
    let changed = false;
    for (const peerId of [...pinnedPeerWatchdogState.keys()]) {
      if (pinned.has(peerId)) continue;
      pinnedPeerWatchdogState.delete(peerId);
      changed = true;
    }
    for (const peerId of pinned) {
      if (pinnedPeerWatchdogState.has(peerId)) continue;
      pinnedPeerWatchdogState.set(peerId, {
        peerId,
        status: node.getPeers().some((peer) => peer.toString() === peerId) ? "connected" : "recovering",
        lastStatusChangeAtMs: Date.now(),
        consecutiveFailures: 0,
        lastSuccessfulPingAtMs: null,
        lastReconnectAttemptAtMs: null,
      });
      changed = true;
    }
    if (changed) emitPinnedPeerWatchdogState();
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
    clearCachedPathFailure(peerId, normalizedPath);

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
    const normalizedPath = path.trim();
    if (normalizedPath.length === 0) return;
    const existing = peerPathCache.get(peerId);
    if (!existing) return;

    const filtered = existing.filter((cachedPath) => cachedPath !== normalizedPath);
    if (filtered.length === existing.length) return;

    if (filtered.length === 0) {
      peerPathCache.delete(peerId);
    } else {
      peerPathCache.set(peerId, filtered);
    }

    clearCachedPathFailure(peerId, normalizedPath);
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
    reconcilePinnedPeerWatchdog();
  };

  publicKeyToPeerId.set(toHex(new Uint8Array(accountKey.publicKey)), node.peerId.toString());
  notifyPublicKeyToPeerIdChange();

  let relayCandidateState = createRelayCandidateState();
  const relayTargetActive = runtimeAdapter.targetActiveRelays;
  const relayReservationManager = createRelayReservationManager({
    targetActive: relayTargetActive,
    baseBackoffMs: RELAY_RESERVATION_BACKOFF_BASE_MS,
    maxBackoffMs: RELAY_RESERVATION_BACKOFF_MAX_MS,
    dialAttemptTimeoutMs: RELAY_RESERVATION_DIAL_ATTEMPT_TIMEOUT_MS,
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

  for (const [peerId, entry] of initialRelayContactBook ?? []) {
    const normalizedPeerId = peerId.trim();
    if (normalizedPeerId.length === 0) continue;
    relayContactBook.set(normalizedPeerId, {
      peerId: normalizedPeerId,
      addresses: mergeRelayAddresses([], entry.addresses),
      sources: new Set(entry.sources.length > 0 ? entry.sources : ["unknown"]),
      firstSeenAtMs: entry.firstSeenAtMs,
      lastSeenAtMs: entry.lastSeenAtMs,
      lastAttemptAtMs: entry.lastAttemptAtMs,
      lastSuccessAtMs: entry.lastSuccessAtMs,
      lastFailureAtMs: entry.lastFailureAtMs,
      successCount: entry.successCount,
      failureCount: entry.failureCount,
      consecutiveFailures: entry.consecutiveFailures,
      averageRttMs: entry.averageRttMs,
      quarantinedUntilMs: entry.quarantinedUntilMs,
    });
  }

  for (const relayHint of initialRelayHints) {
    relayReservationManager.ingestRelayAddress(relayHint);
    ingestRelayContact(relayHint, "bootstrap");
  }
  for (const relayAddr of relayPeers) {
    relayReservationManager.ingestRelayAddress(relayAddr);
    ingestRelayContact(relayAddr, "bootstrap");
  }
  emitRelayContactBook();
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

  const findHashByActionId = (groupId: string, actionId: string): Uint8Array | undefined => {
    const dag = actionDags.get(groupId);
    if (!dag) return undefined;
    for (const action of dag.actions.values()) {
      if (action.id === actionId) return action.hash;
    }
    return undefined;
  };

  const ownPublicKeyHex = toHex(new Uint8Array(accountKey.publicKey));
  const ownPeerId = node.peerId.toString();

  const collectRecentEnvelopeAuthorPeerIds = (
    groupId: string,
    limit = 50,
  ): readonly string[] => {
    const ordered = getOrderedEnvelopes(groupId);
    if (ordered.length === 0) return [];
    const start = Math.max(0, ordered.length - limit);
    const recent = ordered.slice(start);
    const seen = new Set<string>();
    const peers: string[] = [];
    for (let i = recent.length - 1; i >= 0; i -= 1) {
      const decoded = verifyAndDecodeAction(recent[i]);
      if (!decoded.success) continue;
      const authorHex = toHex(decoded.data.authorPublicKey);
      const peerId = publicKeyToPeerId.get(authorHex);
      if (!peerId || peerId === ownPeerId) continue;
      if (seen.has(peerId)) continue;
      seen.add(peerId);
      peers.push(peerId);
    }
    return peers;
  };

  const collectFastPathTargets = (groupId: string): readonly string[] => {
    const connected = new Set(node.getPeers().map((peer) => peer.toString()));
    const targets = new Set<string>();
    const state = actionChainStates.get(groupId);

    if (state) {
      for (const member of state.members.values()) {
        const peerId = publicKeyToPeerId.get(member.publicKeyHex);
        if (!peerId || peerId === ownPeerId || !connected.has(peerId)) continue;
        targets.add(peerId);
      }

      if (state.isDirectMessage && state.directMessagePeerIds) {
        for (const peerId of state.directMessagePeerIds) {
          if (peerId === ownPeerId || !connected.has(peerId)) continue;
          targets.add(peerId);
        }
      }
    }

    for (const peerId of collectRecentEnvelopeAuthorPeerIds(groupId, 50)) {
      if (peerId === ownPeerId || !connected.has(peerId)) continue;
      targets.add(peerId);
    }

    return [...targets].slice(0, 24);
  };

  const publishEnvelope = async (groupId: string, envelope: SignedActionEnvelope) => {
    const topic = groupTopic(groupId);
    const wireMessage: WireMessage = {
      type: "signed_action",
      protocolVersion: 2,
      signedBytes: envelope.signedBytes,
      signature: envelope.signature,
      hash: envelope.hash,
    };
    const fastPathTargets = collectFastPathTargets(groupId);
    if (fastPathTargets.length > 0) {
      emit("sync", `Fast-path signed_action to ${fastPathTargets.length} peer(s) for ${groupId.slice(0, 8)}...`);
      for (const peerId of fastPathTargets) {
        void sendWireMessageDirect(
          peerId,
          DIRECT_SIGNED_ACTION_PROTOCOL,
          wireMessage,
        ).catch(() => {});
      }
    }
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

  const dagHeadHash = (groupId: string): Uint8Array | undefined => {
    const dag = actionDags.get(groupId);
    if (!dag) return undefined;
    const ordered = topologicalOrder(dag);
    const last = ordered[ordered.length - 1];
    return last ? Uint8Array.from(last.hash) : undefined;
  };

  const sameDirectMessagePair = (
    left: readonly [string, string],
    right: readonly [string, string],
  ): boolean =>
    left[0] === right[0] && left[1] === right[1];

  const findDirectMessageGenesisEnvelopeByAuthor = (
    groupId: string,
    authorPublicKeyHex: string,
    peerIds?: readonly [string, string],
  ): SignedActionEnvelope | null => {
    for (const envelope of getOrderedEnvelopes(groupId)) {
      const decoded = verifyAndDecodeAction(envelope);
      if (!decoded.success) continue;
      if (decoded.data.payload.type !== "dm-created") continue;
      if (toHex(decoded.data.authorPublicKey) !== authorPublicKeyHex) continue;
      if (peerIds && !sameDirectMessagePair(decoded.data.payload.peerIds, peerIds)) continue;
      return envelope;
    }
    return null;
  };

  const getDirectMessageHandshakeStateForGroup = (groupId: string): DirectMessageHandshakeState | null => {
    const state = actionChainStates.get(groupId);
    if (!state || !state.isDirectMessage || !state.directMessagePeerIds) return null;
    const contributorPublicKeyHexes = [...state.dmGenesisContributorPublicKeys];
    const contributorPeerIds = new Set<string>();
    for (const contributorHex of contributorPublicKeyHexes) {
      if (contributorHex === ownPublicKeyHex) {
        contributorPeerIds.add(ownPeerId);
        continue;
      }
      const mapped = publicKeyToPeerId.get(contributorHex);
      if (mapped) contributorPeerIds.add(mapped);
    }
    const missingPeerIds = state.directMessagePeerIds.filter((peerId) => !contributorPeerIds.has(peerId));
    return {
      complete: state.dmHandshakeComplete,
      contributorPublicKeyHexes,
      missingPeerIds,
    };
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

  const resolveGroupOwnerPeerId = (groupId: string): string | null => {
    const state = actionChainStates.get(groupId);
    if (!state) return null;
    const owner = [...state.members.values()]
      .filter((member) => member.role === "owner")
      .sort((a, b) => a.joinedAt - b.joinedAt || a.publicKeyHex.localeCompare(b.publicKeyHex))[0];
    if (!owner) return null;
    return publicKeyToPeerId.get(owner.publicKeyHex) ?? null;
  };

  const collectSharedGroupTopicsForPeer = (targetPeerId: string): readonly string[] => {
    const topics: string[] = [];
    for (const [groupId, state] of actionChainStates.entries()) {
      const ownIsMember = state.members.has(ownPublicKeyHex);
      if (!ownIsMember) {
        const retry = joinRetryState.get(groupId);
        if (retry?.status !== "active") continue;
      }
      const targetIsMember = [...state.members.values()].some((member) =>
        publicKeyToPeerId.get(member.publicKeyHex) === targetPeerId);
      if (!targetIsMember) continue;
      topics.push(groupTopic(groupId));
      if (topics.length >= 6) break;
    }
    return topics;
  };

  const isPeerMemberOfGroup = (groupId: string, peerIdValue: string): boolean => {
    const state = actionChainStates.get(groupId);
    if (!state) return true;
    if (state.isDirectMessage && state.directMessagePeerIds?.includes(peerIdValue)) {
      return true;
    }
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

  const encodeDirectJoinRequestSigningPayload = (
    payload: {
      readonly groupId: string;
      readonly senderPeerId: string;
      readonly requesterPublicKey: Uint8Array;
      readonly targetPeerId: string;
      readonly inviteGrant?: InviteGrantProof;
    },
  ): Uint8Array =>
    new Uint8Array(
      encode({
        type: "join_request_direct",
        groupId: payload.groupId,
        senderPeerId: payload.senderPeerId,
        requesterPublicKey: payload.requesterPublicKey,
        targetPeerId: payload.targetPeerId,
        inviteGrant: payload.inviteGrant,
      }),
    );

  const signDirectJoinRequest = (
    payload: {
      readonly groupId: string;
      readonly senderPeerId: string;
      readonly requesterPublicKey: Uint8Array;
      readonly targetPeerId: string;
      readonly inviteGrant?: InviteGrantProof;
    },
  ): Uint8Array =>
    new Uint8Array([...ed25519.sign(
      encodeDirectJoinRequestSigningPayload(payload),
      accountKey.privateKey,
    )]);

  const verifyDirectJoinRequest = (
    payload: {
      readonly groupId: string;
      readonly senderPeerId: string;
      readonly requesterPublicKey: Uint8Array;
      readonly targetPeerId: string;
      readonly signature: Uint8Array;
      readonly inviteGrant?: InviteGrantProof;
    },
  ): boolean =>
    ed25519.verify(
      payload.signature,
      encodeDirectJoinRequestSigningPayload(payload),
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

  const encodeCallControlSigningPayload = (
    payload: {
      readonly action: CallControlAction;
      readonly groupId: string;
      readonly senderPeerId: string;
      readonly senderPublicKey: Uint8Array;
      readonly targetPeerId?: string;
      readonly muted?: boolean;
      readonly sentAt: number;
    },
  ): Uint8Array =>
    new Uint8Array(
      encode({
        type: "call_control",
        action: payload.action,
        groupId: payload.groupId,
        senderPeerId: payload.senderPeerId,
        senderPublicKey: payload.senderPublicKey,
        targetPeerId: payload.targetPeerId,
        muted: payload.muted,
        sentAt: payload.sentAt,
      }),
    );

  const signCallControl = (
    payload: {
      readonly action: CallControlAction;
      readonly groupId: string;
      readonly senderPeerId: string;
      readonly senderPublicKey: Uint8Array;
      readonly targetPeerId?: string;
      readonly muted?: boolean;
      readonly sentAt: number;
    },
  ): Uint8Array =>
    new Uint8Array([...ed25519.sign(
      encodeCallControlSigningPayload(payload),
      accountKey.privateKey,
    )]);

  const verifyCallControl = (payload: CallControlPayload): boolean =>
    ed25519.verify(
      payload.signature,
    encodeCallControlSigningPayload({
        action: payload.action,
        groupId: payload.groupId,
        senderPeerId: payload.senderPeerId,
        senderPublicKey: payload.senderPublicKey,
        targetPeerId: payload.targetPeerId,
        muted: payload.muted,
        sentAt: payload.sentAt,
      }),
      payload.senderPublicKey,
    );

  const cloneCallState = (state: MutableCallState): CallState => ({
    groupId: state.groupId,
    startedAt: state.startedAt,
    ringingPeerIds: [...state.ringingPeerIds],
    participants: new Map(state.participants),
  });

  const emitCallEvent = (event: CallEvent) => {
    callEventListeners.forEach((listener) => listener(event));
  };

  const dropCallForGroup = (groupId: string) => {
    activeCallsByGroup.delete(groupId);
  };

  const canSenderControlCall = (
    groupId: string,
    senderPeerId: string,
  ): boolean => {
    if (!isMembershipEnforcedGroup(groupId)) return true;
    return isPeerMemberOfGroup(groupId, senderPeerId);
  };

  const applyCallControlPayload = (
    payload: {
      readonly action: CallControlAction;
      readonly groupId: string;
      readonly senderPeerId: string;
      readonly targetPeerId?: string;
      readonly muted?: boolean;
      readonly sentAt: number;
    },
    source: "local" | "remote",
  ) => {
    let shouldEmitEvent = true;
    if (!canSenderControlCall(payload.groupId, payload.senderPeerId)) {
      emit(
        "info",
        `Rejected call control from non-member ${payload.senderPeerId.slice(0, 12)}... in ${payload.groupId.slice(0, 8)}...`,
      );
      return;
    }

    const dmPeers = actionChainStates.get(payload.groupId)?.directMessagePeerIds;
    if (dmPeers && !dmPeers.includes(payload.senderPeerId)) {
      emit(
        "info",
        `Rejected call control from non-DM peer ${payload.senderPeerId.slice(0, 12)}...`,
      );
      return;
    }

    if (
      payload.targetPeerId &&
      payload.targetPeerId !== ownPeerId &&
      payload.action !== "call-ring" &&
      payload.action !== "call-nudge"
    ) {
      return;
    }

    const existing = activeCallsByGroup.get(payload.groupId);
    const state: MutableCallState = existing ?? {
      groupId: payload.groupId,
      startedAt: payload.sentAt,
      ringingPeerIds: new Set<string>(),
      participants: new Map<string, CallParticipantState>(),
    };
    activeCallsByGroup.set(payload.groupId, state);

    switch (payload.action) {
      case "call-started":
        state.startedAt = payload.sentAt;
        if (!state.participants.has(payload.senderPeerId)) {
          state.participants.set(payload.senderPeerId, {
            peerId: payload.senderPeerId,
            joinedAt: payload.sentAt,
            lastHeartbeatAt: payload.sentAt,
            muted: payload.muted ?? false,
          });
        }
        break;
      case "call-ring":
      case "call-nudge":
        if (payload.targetPeerId) state.ringingPeerIds.add(payload.targetPeerId);
        break;
      case "call-accept":
      case "call-decline":
        if (payload.targetPeerId) state.ringingPeerIds.delete(payload.targetPeerId);
        break;
      case "call-join": {
        if (
          !state.participants.has(payload.senderPeerId) &&
          state.participants.size >= MAX_CALL_PARTICIPANTS
        ) {
          emit(
            "info",
            `Rejected call join in ${payload.groupId.slice(0, 8)}...: room full`,
          );
          return;
        }
        state.ringingPeerIds.delete(payload.senderPeerId);
        const existingParticipant = state.participants.get(payload.senderPeerId);
        state.participants.set(payload.senderPeerId, {
          peerId: payload.senderPeerId,
          joinedAt: existingParticipant?.joinedAt ?? payload.sentAt,
          lastHeartbeatAt: payload.sentAt,
          muted: payload.muted ?? existingParticipant?.muted ?? false,
        });
        break;
      }
      case "call-heartbeat": {
        const existingParticipant = state.participants.get(payload.senderPeerId);
        if (
          !existingParticipant &&
          state.participants.size >= MAX_CALL_PARTICIPANTS
        ) {
          emit(
            "info",
            `Rejected call heartbeat in ${payload.groupId.slice(0, 8)}...: room full`,
          );
          return;
        }
        state.ringingPeerIds.delete(payload.senderPeerId);
        const nextMuted = payload.muted ?? existingParticipant?.muted ?? false;
        state.participants.set(payload.senderPeerId, {
          peerId: payload.senderPeerId,
          joinedAt: existingParticipant?.joinedAt ?? payload.sentAt,
          lastHeartbeatAt: payload.sentAt,
          muted: nextMuted,
        });
        shouldEmitEvent = !existingParticipant || nextMuted !== existingParticipant.muted;
        break;
      }
      case "call-leave":
        state.participants.delete(payload.senderPeerId);
        if (state.participants.size === 0) dropCallForGroup(payload.groupId);
        break;
      case "call-end":
        dropCallForGroup(payload.groupId);
        break;
    }

    if (!shouldEmitEvent) return;

    emitCallEvent({
      action: payload.action,
      groupId: payload.groupId,
      senderPeerId: payload.senderPeerId,
      targetPeerId: payload.targetPeerId,
      muted: payload.muted,
      sentAt: payload.sentAt,
      source,
    });
  };

  const publishCallControl = async (
    input: {
      readonly groupId: string;
      readonly action: CallControlAction;
      readonly targetPeerId?: string;
      readonly muted?: boolean;
    },
  ): Promise<void> => {
    const topic = groupTopic(input.groupId);
    if (!topicToGroupId.has(topic)) {
      throw new Error(`Not joined to group ${input.groupId}`);
    }
    const senderPublicKey = new Uint8Array(accountKey.publicKey);
    const sentAt = Date.now();
    const signature = signCallControl({
      action: input.action,
      groupId: input.groupId,
      senderPeerId: ownPeerId,
      senderPublicKey,
      targetPeerId: input.targetPeerId,
      muted: input.muted,
      sentAt,
    });
    const wireMessage: WireMessage = {
      type: "call_control",
      payload: {
        action: input.action,
        groupId: input.groupId,
        senderPeerId: ownPeerId,
        senderPublicKey,
        targetPeerId: input.targetPeerId,
        muted: input.muted,
        sentAt,
        signature: new Uint8Array(signature),
      },
    };

    applyCallControlPayload(
      {
        action: wireMessage.payload.action,
        groupId: wireMessage.payload.groupId,
        senderPeerId: wireMessage.payload.senderPeerId,
        targetPeerId: wireMessage.payload.targetPeerId,
        muted: wireMessage.payload.muted,
        sentAt: wireMessage.payload.sentAt,
      },
      "local",
    );

    await pubsub.publish(topic, encodeWireMessage(wireMessage));
    const directTargets = new Set<string>();
    if (input.targetPeerId && input.targetPeerId !== ownPeerId) {
      directTargets.add(input.targetPeerId);
    }
    const dmPeers = actionChainStates.get(input.groupId)?.directMessagePeerIds;
    if (!input.targetPeerId && dmPeers) {
      for (const peerId of dmPeers) {
        if (peerId !== ownPeerId) directTargets.add(peerId);
      }
    }
    for (const peerId of directTargets) {
      void sendWireMessageDirect(
        peerId,
        DIRECT_CALL_CONTROL_PROTOCOL,
        wireMessage,
      ).catch(() => {});
    }
  };

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
    const knownHead = knownHashOverride ? Uint8Array.from(knownHashOverride) : dagHeadHash(groupId);
    const knownHeads = knownHead && knownHead.length > 0 ? [knownHead] : [];
    const requestId = targetPeerId ? crypto.randomUUID() : undefined;
    const senderPublicKey = new Uint8Array(accountKey.publicKey);
    const signature = signSyncRequest({
      groupId,
      senderPeerId: ownPeerId,
      senderPublicKey,
      requestId,
      targetPeerId,
      knownHeads,
    }, accountKey.privateKey);
    const wireMessage: WireMessage = {
      type: "sync_request",
      protocolVersion: 2,
      payload: {
        groupId,
        senderPeerId: ownPeerId,
        senderPublicKey,
        signature: new Uint8Array(Array.from(signature)),
        requestId,
        targetPeerId,
        knownHeads: knownHeads.map((h) => Uint8Array.from(h)),
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
        lastRequestKnownHashHex: knownHeads.length > 0 ? toHex(knownHeads[0]) : null,
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
    theirHeads: readonly Uint8Array[],
    requestId?: string,
  ): Promise<void> => {
    const knownHash = theirHeads.length > 0 ? theirHeads[0] : undefined;
    const missing = getMissingEnvelopesForKnownHash(getOrderedEnvelopes(groupId), knownHash);
    const responseEnvelopes = missing.slice(0, MAX_SYNC_ENVELOPES_PER_RESPONSE);
    const senderPublicKey = new Uint8Array(accountKey.publicKey);
    const signature = signSyncResponse({
      groupId,
      senderPeerId: ownPeerId,
      senderPublicKey,
      requestId,
      targetPeerId,
      theirHeads: [...theirHeads],
      envelopes: responseEnvelopes,
    }, accountKey.privateKey);
    const wireMessage: WireMessage = {
      type: "sync_response",
      protocolVersion: 2,
      payload: {
        groupId,
        senderPeerId: ownPeerId,
        senderPublicKey,
        signature: new Uint8Array(Array.from(signature)),
        requestId,
        targetPeerId,
        theirHeads: theirHeads.map((h) => Uint8Array.from(h)),
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
      lastServedKnownHashHex: knownHash ? toHex(knownHash) : null,
      lastServedHeadHashHex: null,
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
      const retry = joinRetryState.get(groupId);
      const joinRetryActive = retry?.status === "active";
      if (!isOwnMemberOfGroup(groupId) && !joinRetryActive) return;
    }
    void publishSyncRequest(groupId, targetPeerId, knownHashOverride).catch(() => {});
  };

  const collectSyncTargets = (groupId: string): readonly string[] => {
    const connected = new Set(node.getPeers().map((peer) => peer.toString()));
    const targets = new Set<string>();

    const state = actionChainStates.get(groupId);
    if (!state) {
      return [];
    }

    if (isMembershipEnforcedGroup(groupId)) {
      for (const member of state.members.values()) {
        const peerId = publicKeyToPeerId.get(member.publicKeyHex);
        if (!peerId) continue;
        if (!connected.has(peerId)) continue;
        if (peerId === ownPeerId) continue;
        targets.add(peerId);
      }

      if (!isOwnMemberOfGroup(groupId)) {
        const retry = joinRetryState.get(groupId);
        if (retry?.status === "active") {
          const ownerPeerId = resolveGroupOwnerPeerId(groupId);
          if (ownerPeerId && connected.has(ownerPeerId) && ownerPeerId !== ownPeerId) {
            targets.add(ownerPeerId);
          }
        }
      }

      return [...targets];
    }

    for (const peerId of connected) {
      if (peerId === ownPeerId) continue;
      targets.add(peerId);
    }
    return [...targets];
  };

  const requestSyncFromConnectedPeers = (groupId: string) => {
    for (const remote of collectSyncTargets(groupId)) {
      requestSyncFromPeer(groupId, remote);
    }
  };

  const sendWireMessageDirect = async (
    targetPeerId: string,
    protocol: string,
    wireMessage: WireMessage,
  ): Promise<boolean> => {
    try {
      const stream = await node.dialProtocol(peerIdFromString(targetPeerId), protocol);
      const payload = encodeWireMessage(wireMessage);
      await stream.sink((async function* () {
        yield payload;
      })());
      try {
        await stream.close();
      } catch {}
      return true;
    } catch {
      return false;
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
      protocolVersion: 2,
      groupId,
      senderPeerId: ownPeerId,
      requesterPublicKey,
      signature: new Uint8Array(signature),
      inviteGrant,
    };
    await pubsub.publish(topic, encodeWireMessage(wireMessage));

    const ownerPeerId = resolveGroupOwnerPeerId(groupId);
    if (ownerPeerId && ownerPeerId !== ownPeerId) {
      const directSignature = signDirectJoinRequest({
        groupId,
        senderPeerId: ownPeerId,
        requesterPublicKey,
        targetPeerId: ownerPeerId,
        inviteGrant,
      });
      const directWireMessage: WireMessage = {
        type: "join_request_direct",
        protocolVersion: 2,
        payload: {
          groupId,
          senderPeerId: ownPeerId,
          requesterPublicKey,
          targetPeerId: ownerPeerId,
          signature: new Uint8Array(directSignature),
          inviteGrant,
        },
      };
      try {
        await pubsub.publish(DIRECT_JOIN_REQUEST_TOPIC, encodeWireMessage(directWireMessage));
      } catch {
        emit("info", `Failed direct join request publish for ${groupId.slice(0, 8)}...`);
      }
      void sendWireMessageDirect(
        ownerPeerId,
        DIRECT_JOIN_REQUEST_PROTOCOL,
        directWireMessage,
      ).catch(() => {});
    }

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
      reconcilePinnedPeerWatchdog();

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

  if (isRelayCapableRuntime) {
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
        ingestRelayContact(fullAddr, "candidate");
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
          updateRelayContactRtt(remotePeerId, rttMs);
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
      clearPinnedReconnectBurst(remotePeerId);
      pinnedKeepAliveFailures.delete(remotePeerId);
      if (getPinnedPeerIds().has(remotePeerId)) {
        setPinnedPeerWatchdog(remotePeerId, {
          status: "connected",
          consecutiveFailures: 0,
          lastSuccessfulPingAtMs: Date.now(),
        });
      }
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
    markRelayContactFailure(disconnectedId);
    pendingDirectUpgradeByPeer.delete(disconnectedId);
    pinnedKeepAliveFailures.delete(disconnectedId);
    if (getPinnedPeerIds().has(disconnectedId)) {
      setPinnedPeerWatchdog(disconnectedId, {
        status: "recovering",
        lastReconnectAttemptAtMs: Date.now(),
      });
      schedulePinnedReconnectBurst(disconnectedId, "disconnect");
    }

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
        ingestRelayContact(baseAddr, "harvest");
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
        markRelayContactSuccess(relayId);
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
      publishSyncResponse(groupId, remotePeerId, []).catch(() => {});
    }
  });

  emit("info", `Node started: ${node.peerId.toString()}`);

  const dialedPeers = new Set<string>();
  const inFlightPeerDials = new Map<string, Promise<void>>();
  const dialFailureBackoff = new Map<string, { failures: number; nextAllowedAt: number }>();
  const pinnedReconnectBurstTimers = new Map<string, Set<ReturnType<typeof setTimeout>>>();
  const pinnedKeepAliveFailures = new Map<string, number>();

  type DialSource = "cached path" | "discovered address" | "circuit relay";
  type DialCandidate = {
    addr: string;
    source: DialSource;
    score: number;
  };
  type DialBehavior = {
    candidateLimit: number;
    concurrency: number;
  };

  const resolveDialBehavior = (prioritizePinned: boolean): DialBehavior => ({
    candidateLimit: prioritizePinned ? PINNED_DIAL_CANDIDATE_LIMIT : DIAL_CANDIDATE_LIMIT,
    concurrency: prioritizePinned ? PINNED_DIAL_CANDIDATE_CONCURRENCY : DIAL_CANDIDATE_CONCURRENCY,
  });

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
      ingestRelayContact(base, "harvest");
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

  const cachedPathFailureKey = (peerId: string, path: string): string => `${peerId}::${path}`;

  const pruneCachedPathFailureState = () => {
    if (cachedPathFailureCounts.size === 0) return;
    const cutoff = Date.now() - CACHED_PATH_FAILURE_TRACK_TTL_MS;
    for (const [key, state] of cachedPathFailureCounts.entries()) {
      if (state.lastFailureAtMs < cutoff) {
        cachedPathFailureCounts.delete(key);
      }
    }
  };

  const clearCachedPathFailure = (peerId: string, path: string) => {
    cachedPathFailureCounts.delete(cachedPathFailureKey(peerId, path));
  };

  const recordCachedPathFailure = (peerId: string, path: string): number => {
    pruneCachedPathFailureState();
    const key = cachedPathFailureKey(peerId, path);
    const existing = cachedPathFailureCounts.get(key);
    const next = {
      failures: (existing?.failures ?? 0) + 1,
      lastFailureAtMs: Date.now(),
    };
    cachedPathFailureCounts.set(key, next);
    return next.failures;
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
    behavior: DialBehavior,
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
      .slice(0, behavior.candidateLimit);
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
      if (candidate.source === "circuit relay") {
        const relayPeerId = relayPeerIdFromAddress(candidate.addr);
        if (relayPeerId) markRelayContactSuccess(relayPeerId, candidate.addr);
      }
      recordSuccessfulPeerPath(remotePeerId, candidate.addr);
      recordDialSuccessMetric(metricGroupId);
      return true;
    } catch {
      recordReason(`dial_failure:${candidate.source}`);
      emit("dial-failure", `${candidate.source} failed: ${candidate.addr.slice(0, 80)}...`);
      recordDialFailure(candidate.addr);
      if (candidate.source === "circuit relay") {
        const relayPeerId = relayPeerIdFromAddress(candidate.addr);
        if (relayPeerId) markRelayContactFailure(relayPeerId, candidate.addr);
      }
      if (candidate.source === "cached path") {
        const failures = recordCachedPathFailure(remotePeerId, candidate.addr);
        if (failures >= CACHED_PATH_EVICT_FAILURE_THRESHOLD) {
          forgetPeerPath(remotePeerId, candidate.addr);
        }
      }
      return false;
    }
  };

  const dialCandidateSet = async (
    remotePeerId: string,
    candidates: readonly DialCandidate[],
    behavior: DialBehavior,
    metricGroupId?: string,
  ): Promise<boolean> => {
    if (candidates.length === 0) return false;

    let index = 0;
    let connected = false;
    const workerCount = Math.min(behavior.concurrency, candidates.length);

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
      readonly prioritizePinned?: boolean;
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
      const prioritizePinned = options.prioritizePinned ?? getPinnedPeerIds().has(targetPeerId);
      const dialBehavior = resolveDialBehavior(prioritizePinned);

      const normalizedPreferred = (options.preferredAddrs ?? [])
        .map((addr) => normalizeDialAddress(targetPeerId, addr))
        .filter((addr): addr is string => addr !== null);
      harvestRelayBasesFromAddresses(normalizedPreferred);
      const discoveryHints = mergeDiscoveryHints(targetPeerId, normalizedPreferred);
      const initialCandidates = buildDialCandidates(targetPeerId, discoveryHints, dialBehavior);
      if (await dialCandidateSet(targetPeerId, initialCandidates, dialBehavior, options.metricGroupId)) {
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
        recordReason("dht_find_peer_failed");
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
      const relayAddresses = rankRelayAddressesForDial([...new Set(relayAddressesRaw)]);

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
        .slice(0, dialBehavior.candidateLimit);
      if (await dialCandidateSet(targetPeerId, relayCandidates, dialBehavior, options.metricGroupId)) {
        return;
      }

      recordReason("connect_to_peer_failed");
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
    prioritizePinned?: boolean,
  ) => {
    if (remotePeerId === node.peerId.toString()) return;
    if (dialedPeers.has(remotePeerId)) return;
    if (node.getPeers().some((p) => p.toString() === remotePeerId)) return;

    dialedPeers.add(remotePeerId);
    tryConnectToPeerId(remotePeerId, {
      preferredAddrs,
      metricGroupId,
      prioritizePinned: prioritizePinned ?? getPinnedPeerIds().has(remotePeerId),
    }).catch(() => {
      dialedPeers.delete(remotePeerId);
    });
  };

  const clearPinnedReconnectBurst = (peerId: string) => {
    const timers = pinnedReconnectBurstTimers.get(peerId);
    if (!timers) return;
    for (const timer of timers) clearTimeout(timer);
    pinnedReconnectBurstTimers.delete(peerId);
  };

  const schedulePinnedReconnectBurst = (peerId: string, reason: string) => {
    if (!isRelayCapableRuntime) return;
    if (peerId === ownPeerId) return;
    if (!getPinnedPeerIds().has(peerId)) return;

    clearPinnedReconnectBurst(peerId);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    pinnedReconnectBurstTimers.set(peerId, timers);
    setPinnedPeerWatchdog(peerId, {
      status: "recovering",
      lastReconnectAttemptAtMs: Date.now(),
    });
    emit("info", `Pinned reconnect burst (${reason}) for ${peerId.slice(0, 12)}...`);

    for (const delayMs of PINNED_RECONNECT_BURST_SCHEDULE_MS) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (stopped) return;
        if (!getPinnedPeerIds().has(peerId)) return;
        if (node.getPeers().some((peer) => peer.toString() === peerId)) return;
        setPinnedPeerWatchdog(peerId, {
          status: "recovering",
          lastReconnectAttemptAtMs: Date.now(),
        });
        attemptDirectConnect(peerId, [], undefined, true);
      }, delayMs);
      timers.add(timer);
    }
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

  const resolveSignedSenderPeerId = (
    claimedPeerId: string,
    senderPublicKey: Uint8Array,
    contextLabel: string,
  ): string | null => {
    const trimmedPeerId = claimedPeerId.trim();
    if (trimmedPeerId.length === 0) {
      emit("info", `Rejected ${contextLabel}: empty sender peer ID claim`);
      return null;
    }

    const senderPublicKeyHex = toHex(senderPublicKey);
    const knownPeerId = publicKeyToPeerId.get(senderPublicKeyHex);
    if (knownPeerId && knownPeerId !== trimmedPeerId) {
      emit(
        "info",
        `Rejected ${contextLabel}: sender key already mapped to ${knownPeerId.slice(0, 12)}...`,
      );
      return null;
    }

    publicKeyToPeerId.set(senderPublicKeyHex, trimmedPeerId);
    notifyPublicKeyToPeerIdChange();
    if (getPinnedPeerIds().has(trimmedPeerId) && !node.getPeers().some((peer) => peer.toString() === trimmedPeerId)) {
      setPinnedPeerWatchdog(trimmedPeerId, {
        status: "recovering",
        lastReconnectAttemptAtMs: Date.now(),
      });
      schedulePinnedReconnectBurst(trimmedPeerId, "identity-map");
    }
    return trimmedPeerId;
  };

  const processIncomingJoinRequest = (
    payload: {
      readonly groupId: string;
      readonly senderPeerId: string;
      readonly requesterPublicKey: Uint8Array;
      readonly inviteGrant?: InviteGrantProof;
    },
    contextLabel: string,
  ) => {
    if (!actionChainStates.has(payload.groupId)) return;

    const senderPeerId = resolveSignedSenderPeerId(
      payload.senderPeerId,
      payload.requesterPublicKey,
      contextLabel,
    );
    if (!senderPeerId) return;

    if (isRateLimited(
      incomingJoinRequestRate,
      `${payload.groupId}:${senderPeerId}`,
      INCOMING_JOIN_REQUEST_MAX,
      INCOMING_JOIN_REQUEST_WINDOW_MS,
    )) {
      emit(
        "info",
        `Rate-limited join request from ${senderPeerId.slice(0, 12)}...`,
      );
      return;
    }

    const groupState = actionChainStates.get(payload.groupId);
    const requesterHex = toHex(payload.requesterPublicKey);
    const requesterAlreadyMember = groupState?.members.has(requesterHex) ?? false;
    let inviteTokenId: string | undefined;
    let inviteValidationError: string | undefined;
    let autoApproved = false;

    if (payload.inviteGrant) {
      const approvedCount = payload.inviteGrant.claims.kind === "open" &&
          payload.inviteGrant.claims.maxJoiners !== undefined
        ? getInviteGrantApprovalCount(payload.groupId, payload.inviteGrant.claims.tokenId)
        : undefined;
      const grantValidation = validateInviteGrantForJoin(payload.inviteGrant, {
        groupId: payload.groupId,
        requesterPeerId: senderPeerId,
        approvedCount,
        now: Date.now(),
      });
      if (grantValidation.success) {
        inviteTokenId = grantValidation.data.tokenId;
        const pendingForGroup = pendingJoinInviteGrantsByGroup.get(payload.groupId) ?? new Map();
        pendingForGroup.set(requesterHex, payload.inviteGrant);
        pendingJoinInviteGrantsByGroup.set(payload.groupId, pendingForGroup);
      } else {
        inviteValidationError = grantValidation.error.message;
      }
    }

    const currentJoinPolicy = groupState?.joinPolicy ?? "manual";
    const shouldAutoApproveByInvite =
      currentJoinPolicy === "auto_with_invite" && inviteTokenId !== undefined;
    if (
      isOwnAdminOfGroup(payload.groupId) &&
      !requesterAlreadyMember &&
      shouldAutoApproveByInvite
    ) {
      autoApproved = true;
      performApproveJoin(
        payload.groupId,
        payload.requesterPublicKey,
        shouldAutoApproveByInvite ? { inviteTokenId } : undefined,
      ).catch(() => {
        autoApproved = false;
      });
    }

    if (isOwnAdminOfGroup(payload.groupId) && requesterAlreadyMember) {
      publishSyncResponse(payload.groupId, senderPeerId, []).catch(() => {});
      emit("sync", `Triggered targeted sync for already-approved member ${requesterHex.slice(0, 12)}...`);
    }

    emit("pubsub-message", `Join request for group ${payload.groupId.slice(0, 8)}...`);
    joinRequestListeners.forEach((listener) =>
      listener({
        groupId: payload.groupId,
        requesterPublicKey: payload.requesterPublicKey,
        senderPeerId,
        inviteTokenId,
        inviteValidationError,
        autoApproved,
        alreadyMember: requesterAlreadyMember,
      }),
    );
  };

  const handlePubsubMessage = (event: CustomEvent) => {
    const detail = event.detail as { topic: string; data: Uint8Array; from?: { toString(): string } };
    const transportSenderPeerId = detail.from?.toString() ?? "unknown";

    const result = decodeWireMessage(detail.data);
    if (!result.success) return;

    const wireMessage = result.data;
    if (wireMessage.type === "dm_request") {
      const payload = wireMessage.payload;
      const matchedGroupId = topicToGroupId.get(detail.topic);
      if (
        detail.topic !== DIRECT_MESSAGE_REQUEST_TOPIC &&
        detail.topic !== DIRECT_JOIN_REQUEST_TOPIC &&
        matchedGroupId === undefined
      ) return;
      if (payload.targetPeerId !== ownPeerId) return;
      if (!verifyDirectMessageRequest(payload)) {
        emit(
          "info",
          `Rejected DM request with invalid signature from ${transportSenderPeerId.slice(0, 12)}...`,
        );
        return;
      }

      const senderPeerId = resolveSignedSenderPeerId(
        payload.senderPeerId,
        payload.senderPublicKey,
        "DM request",
      );
      if (!senderPeerId) return;

      const eventPayload: DirectMessageRequestEvent = {
        requestId: payload.requestId,
        senderPeerId,
        senderPublicKey: new Uint8Array(payload.senderPublicKey),
        targetPeerId: payload.targetPeerId,
        groupId: payload.groupId,
        groupName: payload.groupName,
        inviteCode: payload.inviteCode,
        sentAt: payload.sentAt,
      };
      for (const [pendingId, pending] of pendingDirectMessageRequestsById.entries()) {
        if (
          pending.requestId !== payload.requestId &&
          pending.senderPeerId === eventPayload.senderPeerId &&
          pending.groupId === eventPayload.groupId
        ) {
          pendingDirectMessageRequestsById.delete(pendingId);
        }
      }
      pendingDirectMessageRequestsById.set(payload.requestId, eventPayload);
      directMessageRequestListeners.forEach((listener) => listener(eventPayload));
      emit("info", `DM request from ${senderPeerId.slice(0, 12)}...`);
      return;
    }

    if (wireMessage.type === "profile_request") {
      const payload = wireMessage.payload;
      if (detail.topic !== PROFILE_SYNC_TOPIC) return;
      if (payload.targetPeerId !== ownPeerId) return;
      if (!verifyProfileRequest(payload)) return;

      const senderPeerId = resolveSignedSenderPeerId(
        payload.senderPeerId,
        payload.senderPublicKey,
        "profile request",
      );
      if (!senderPeerId) return;

      void publishProfileAnnounce(senderPeerId).catch(() => {});
      return;
    }

    if (wireMessage.type === "profile_announce") {
      const payload = wireMessage.payload;
      if (detail.topic !== PROFILE_SYNC_TOPIC) return;
      if (payload.targetPeerId && payload.targetPeerId !== ownPeerId) return;
      if (!verifyProfileAnnounce(payload)) return;

      const senderPeerId = resolveSignedSenderPeerId(
        payload.senderPeerId,
        payload.senderPublicKey,
        "profile announce",
      );
      if (!senderPeerId) return;

      onProfileAnnounce?.(senderPeerId, payload.displayName);
      return;
    }

    if (wireMessage.type === "join_request_direct") {
      const payload = wireMessage.payload;
      if (detail.topic !== DIRECT_JOIN_REQUEST_TOPIC) return;
      if (payload.targetPeerId !== ownPeerId) return;
      if (!verifyDirectJoinRequest(payload)) {
        emit(
          "info",
          `Rejected direct join request with invalid signature from ${transportSenderPeerId.slice(0, 12)}...`,
        );
        return;
      }
      processIncomingJoinRequest({
        groupId: payload.groupId,
        senderPeerId: payload.senderPeerId,
        requesterPublicKey: payload.requesterPublicKey,
        inviteGrant: payload.inviteGrant,
      }, "direct join request");
      return;
    }

    const matchedGroupId = topicToGroupId.get(detail.topic);
    if (matchedGroupId === undefined) return;

    if (wireMessage.type === "call_control") {
      const payload = wireMessage.payload;
      if (payload.groupId !== matchedGroupId) return;
      if (!verifyCallControl(payload)) {
        emit(
          "info",
          `Rejected call control with invalid signature from ${transportSenderPeerId.slice(0, 12)}...`,
        );
        return;
      }

      const senderPeerId = resolveSignedSenderPeerId(
        payload.senderPeerId,
        payload.senderPublicKey,
        "call control",
      );
      if (!senderPeerId) return;

      applyCallControlPayload(
        {
          action: payload.action,
          groupId: payload.groupId,
          senderPeerId,
          targetPeerId: payload.targetPeerId,
          muted: payload.muted,
          sentAt: payload.sentAt,
        },
        "remote",
      );
      return;
    }

    if (wireMessage.type === "sync_request") {
      const payload = wireMessage.payload;
      if (payload.targetPeerId && payload.targetPeerId !== ownPeerId) return;
      if (!verifySyncRequest(payload)) {
        emit(
          "sync",
          `Rejected sync request with invalid signature from ${transportSenderPeerId.slice(0, 12)}...`,
        );
        return;
      }

      const senderPeerId = resolveSignedSenderPeerId(
        payload.senderPeerId,
        payload.senderPublicKey,
        "sync request",
      );
      if (!senderPeerId) return;
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

      const senderPublicKeyHex = toHex(payload.senderPublicKey);

      if (isMembershipEnforcedGroup(matchedGroupId)) {
        if (!isOwnMemberOfGroup(matchedGroupId)) return;
        if (!actionChainStates.get(matchedGroupId)?.members.has(senderPublicKeyHex)) {
          if (isOwnAdminOfGroup(matchedGroupId)) {
            processIncomingJoinRequest({
              groupId: matchedGroupId,
              senderPeerId,
              requesterPublicKey: payload.senderPublicKey,
            }, "sync request fallback");
          }
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
        payload.knownHeads,
        payload.requestId,
      ).catch(() => {});
      return;
    }

    if (wireMessage.type === "sync_response") {
      const payload = wireMessage.payload;
      if (payload.targetPeerId !== ownPeerId) return;
      if (!verifySyncResponse(payload)) {
        connectionMetrics.syncResponsesRejected += 1;
        emitConnectionMetrics();
        emit(
          "sync",
          `Rejected sync response with invalid signature from ${transportSenderPeerId.slice(0, 12)}...`,
        );
        return;
      }

      const senderPeerId = resolveSignedSenderPeerId(
        payload.senderPeerId,
        payload.senderPublicKey,
        "sync response",
      );
      if (!senderPeerId) {
        connectionMetrics.syncResponsesRejected += 1;
        emitConnectionMetrics();
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
      const groupState = actionChainStates.get(matchedGroupId);
      const allowDirectMessageHandshakeSender =
        !!groupState &&
        groupState.isDirectMessage &&
        !groupState.dmHandshakeComplete &&
        !!groupState.directMessagePeerIds &&
        groupState.directMessagePeerIds.includes(senderPeerId);
      if (
        isMembershipEnforcedGroup(matchedGroupId) &&
        !groupState?.members.has(senderPublicKeyHex) &&
        !allowDirectMessageHandshakeSender
      ) {
        if (isOwnAdminOfGroup(matchedGroupId)) {
          processIncomingJoinRequest({
            groupId: matchedGroupId,
            senderPeerId,
            requesterPublicKey: payload.senderPublicKey,
          }, "sync response fallback");
        }
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

      if (accepted > 0 && payload.envelopes.length >= MAX_SYNC_ENVELOPES_PER_RESPONSE) {
        requestSyncFromPeer(matchedGroupId, senderPeerId);
        return;
      }

      if (accepted > 0 && payload.theirHeads.length > 0) {
        const localHead = dagHeadHash(matchedGroupId);
        const localHeadHex = localHead ? toHex(localHead) : null;
        const theirHeadHex = toHex(payload.theirHeads[0]);
        if (localHeadHex !== theirHeadHex) {
          const fallbackKey = `${matchedGroupId}:${senderPeerId}`;
          const now = Date.now();
          const last = fullSyncFallbackByGroupPeer.get(fallbackKey) ?? 0;
          if (now - last >= FULL_SYNC_FALLBACK_COOLDOWN_MS) {
            fullSyncFallbackByGroupPeer.set(fallbackKey, now);
            requestSyncFromPeer(matchedGroupId, senderPeerId, new Uint8Array(0));
            emit(
              "sync",
              `Requested full sync fallback from ${senderPeerId.slice(0, 12)}... for group ${matchedGroupId.slice(0, 8)}...`,
            );
          }
        }
      }
      return;
    }

    if (wireMessage.type === "signed_action") {
      const action = processSignedAction(
        matchedGroupId,
        { signedBytes: wireMessage.signedBytes, signature: wireMessage.signature, hash: wireMessage.hash },
        transportSenderPeerId !== "unknown" ? transportSenderPeerId : undefined,
      );
      if (action) {
        emit("pubsub-message", `Signed action accepted in group ${matchedGroupId.slice(0, 8)}...`);
        emitActionMessage(matchedGroupId, action, transportSenderPeerId);
      }
      return;
    }

    if (wireMessage.type === "join_request") {
      if (!verifyJoinRequest(wireMessage)) {
        emit(
          "info",
          `Rejected join request with invalid signature from ${transportSenderPeerId.slice(0, 12)}...`,
        );
        return;
      }
      processIncomingJoinRequest({
        groupId: matchedGroupId,
        senderPeerId: wireMessage.senderPeerId,
        requesterPublicKey: wireMessage.requesterPublicKey,
        inviteGrant: wireMessage.inviteGrant,
      }, "join request");
      return;
    }

    if (wireMessage.type !== "encrypted_message") return;

    if (!canLocalPeerConsumeGroupUpdates(matchedGroupId)) return;
    if (isMembershipEnforcedGroup(matchedGroupId) && transportSenderPeerId !== "unknown" && !isPeerMemberOfGroup(matchedGroupId, transportSenderPeerId)) {
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

  const readDirectSignalPayload = async (stream: { source: AsyncIterable<unknown> }): Promise<Uint8Array> => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of stream.source) {
      const bytes = chunk instanceof Uint8Array
        ? chunk
        : typeof chunk === "object" && chunk !== null && "subarray" in chunk
          ? (chunk as { subarray(start?: number, end?: number): Uint8Array }).subarray()
          : new Uint8Array(0);
      if (bytes.length === 0) continue;
      chunks.push(bytes);
      total += bytes.length;
    }
    if (chunks.length === 0) return new Uint8Array(0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const bytes of chunks) {
      merged.set(bytes, offset);
      offset += bytes.length;
    }
    return merged;
  };

  const dispatchDirectSignal = (topic: string, data: Uint8Array, remotePeerId: string) => {
    handlePubsubMessage({
      detail: {
        topic,
        data,
        from: { toString: () => remotePeerId },
      },
    } as CustomEvent);
  };

  pubsub.addEventListener("message", handlePubsubMessage);
  pubsub.subscribe(DIRECT_MESSAGE_REQUEST_TOPIC);
  pubsub.subscribe(DIRECT_JOIN_REQUEST_TOPIC);
  pubsub.subscribe(PROFILE_SYNC_TOPIC);

  node.handle(DIRECT_DM_REQUEST_PROTOCOL, ({ stream, connection }) => {
    void readDirectSignalPayload(stream as { source: AsyncIterable<unknown> }).then((data) => {
      if (data.length === 0) return;
      dispatchDirectSignal(
        DIRECT_MESSAGE_REQUEST_TOPIC,
        data,
        connection.remotePeer.toString(),
      );
    }).catch(() => {});
  });

  node.handle(DIRECT_JOIN_REQUEST_PROTOCOL, ({ stream, connection }) => {
    void readDirectSignalPayload(stream as { source: AsyncIterable<unknown> }).then((data) => {
      if (data.length === 0) return;
      dispatchDirectSignal(
        DIRECT_JOIN_REQUEST_TOPIC,
        data,
        connection.remotePeer.toString(),
      );
    }).catch(() => {});
  });

  node.handle(DIRECT_CALL_CONTROL_PROTOCOL, ({ stream, connection }) => {
    void readDirectSignalPayload(stream as { source: AsyncIterable<unknown> }).then((data) => {
      if (data.length === 0) return;
      const decoded = decodeWireMessage(data);
      if (!decoded.success || decoded.data.type !== "call_control") return;
      dispatchDirectSignal(
        groupTopic(decoded.data.payload.groupId),
        data,
        connection.remotePeer.toString(),
      );
    }).catch(() => {});
  });

  node.handle(DIRECT_SIGNED_ACTION_PROTOCOL, ({ stream, connection }) => {
    void readDirectSignalPayload(stream as { source: AsyncIterable<unknown> }).then((data) => {
      if (data.length === 0) return;
      const decoded = decodeWireMessage(data);
      if (!decoded.success || decoded.data.type !== "signed_action") return;
      const envelope: SignedActionEnvelope = {
        signedBytes: decoded.data.signedBytes,
        signature: decoded.data.signature,
        hash: decoded.data.hash,
      };
      const verified = verifyAndDecodeAction(envelope);
      if (!verified.success) return;
      dispatchDirectSignal(
        groupTopic(verified.data.groupId),
        data,
        connection.remotePeer.toString(),
      );
    }).catch(() => {});
  });

  node.handle(MEDIA_SIGNAL_PROTOCOL, ({ stream, connection }) => {
    void readDirectSignalPayload(stream as { source: AsyncIterable<unknown> }).then((data) => {
      if (data.length === 0) return;
      const decoded = decodeMediaSignalEnvelope(data);
      if (!decoded.success) return;
      if (!joinedGroups.includes(decoded.data.groupId)) return;
      const senderPeerId = connection.remotePeer.toString();
      if (!canSenderControlCall(decoded.data.groupId, senderPeerId)) return;
      mediaSignalListeners.forEach((listener) =>
        listener({
          groupId: decoded.data.groupId,
          senderPeerId,
          message: decoded.data.message,
        }));
    }).catch(() => {});
  });

  void publishProfileAnnounce().catch(() => {});

  if (isRelayCapableRuntime) {
    createProviderCid(ANYPOST_CHAT_NAMESPACE).then((chatCid) => {
      node.contentRouting.provide(chatCid).catch(() => {});
    }).catch(() => {});
  }

  const relayPoolManager = isRelayCapableRuntime
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
            ingestRelayContact(relay.address, "candidate");
          }
          onRelayPoolStateChange?.(poolState);
        },
      })
    : null;

  const groupDiscoveryManager: GroupDiscoveryManager | null = isRelayCapableRuntime
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

  const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, timeoutLabel: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(timeoutLabel));
      }, timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const runRelayReservationTick = async () => {
    const now = Date.now();
    for (const [peerId, startedAt] of [...pendingDirectUpgradeByPeer.entries()]) {
      if (now - startedAt > DIRECT_UPGRADE_WINDOW_MS) {
        pendingDirectUpgradeByPeer.delete(peerId);
      }
    }

    const requests = relayReservationManager.getDialRequests();
    if (requests.length === 0) return;

    let cursor = 0;
    const workerCount = Math.min(
      hasOfflinePinnedPeers() ? RELAY_RESERVATION_DIAL_CONCURRENCY + 1 : RELAY_RESERVATION_DIAL_CONCURRENCY,
      requests.length,
    );
    const worker = async () => {
      while (true) {
        const idx = cursor;
        cursor += 1;
        if (idx >= requests.length) return;
        const request = requests[idx];

        if (request.reason === "renew") {
          connectionMetrics.renewAttempts += 1;
        } else {
          connectionMetrics.reservationAttempts += 1;
        }
        markRelayContactAttempt(request.peerId, request.address);
        emitConnectionMetrics();

        try {
          emit("dial-attempt", `Reservation ${request.reason}: ${request.address.slice(0, 80)}...`);
          await withTimeout(
            node.dial(multiaddr(request.address)),
            RELAY_RESERVATION_DIAL_TIMEOUT_MS,
            "Reservation dial timeout",
          );
        } catch {
          recordReason(`relay_reservation_dial_failed:${request.reason}`);
          relayReservationManager.markReservationLost(request.peerId);
          markRelayContactFailure(request.peerId, request.address);
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

    await Promise.all([...Array(workerCount)].map(() => worker()));
  };

  let relayReservationTickInFlight = false;
  const triggerRelayReservationTick = () => {
    if (relayReservationTickInFlight) return;
    relayReservationTickInFlight = true;
    void runRelayReservationTick().finally(() => {
      relayReservationTickInFlight = false;
    });
  };

  const relayReservationInterval = isRelayCapableRuntime
    ? setInterval(() => {
        triggerRelayReservationTick();
      }, RELAY_RESERVATION_TICK_INTERVAL_MS)
    : null;
  if (isRelayCapableRuntime) {
    triggerRelayReservationTick();
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

  const pruneStaleCallParticipants = (now: number) => {
    for (const [groupId, state] of [...activeCallsByGroup.entries()]) {
      for (const [peerId, participant] of [...state.participants.entries()]) {
        if (peerId === ownPeerId) continue;
        if (now - participant.lastHeartbeatAt <= CALL_PARTICIPANT_STALE_MS) continue;
        state.participants.delete(peerId);
        emitCallEvent({
          action: "call-leave",
          groupId,
          senderPeerId: peerId,
          muted: participant.muted,
          sentAt: now,
          source: "remote",
        });
      }
      if (state.participants.size === 0) {
        dropCallForGroup(groupId);
      }
    }
  };

  const runCallMaintenanceTick = async () => {
    const now = Date.now();
    pruneStaleCallParticipants(now);
    for (const [groupId, state] of [...activeCallsByGroup.entries()]) {
      const localParticipant = state.participants.get(ownPeerId);
      if (!localParticipant) continue;
      try {
        await publishCallControl({
          groupId,
          action: "call-heartbeat",
          muted: localParticipant.muted,
        });
      } catch {
        // Ignore heartbeat publish failures; next tick will retry.
      }
    }
  };

  const callMaintenanceInterval = setInterval(() => {
    void runCallMaintenanceTick();
  }, CALL_HEARTBEAT_INTERVAL_MS);
  void runCallMaintenanceTick();

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
    const approvedPeerId = publicKeyToPeerId.get(memberPublicKeyHex);
    if (approvedPeerId) {
      // Push fresh state directly to the newly approved peer so they do not
      // depend on waiting for another join-retry round-trip.
      void publishSyncResponse(groupId, approvedPeerId, []).catch(() => {});
    }
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
    dropCallForGroup(groupId);
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

  const reconnectDisconnectedMembers = () => {
    const ownId = node.peerId.toString();
    const connectedIds = new Set(node.getPeers().map((p) => p.toString()));
    const pinnedPeerIds = getPinnedPeerIds();
    reconcilePinnedPeerWatchdog();
    for (const memberPeerId of pinnedPeerIds) {
      if (memberPeerId === ownId) continue;
      tagGroupMemberKeepAlive(memberPeerId);
      if (connectedIds.has(memberPeerId)) {
        setPinnedPeerWatchdog(memberPeerId, {
          status: "connected",
          consecutiveFailures: 0,
        });
        continue;
      }
      setPinnedPeerWatchdog(memberPeerId, {
        status: "recovering",
        lastReconnectAttemptAtMs: Date.now(),
      });
      attemptDirectConnect(memberPeerId, [], undefined, true);
    }
  };

  const runPinnedKeepAliveTick = async () => {
    if (!isRelayCapableRuntime) return;
    const services = node.services as Record<string, unknown>;
    const pingService = services.ping as PingService | undefined;
    if (!pingService) return;

    const ownId = node.peerId.toString();
    const connectedIds = new Set(node.getPeers().map((p) => p.toString()));
    for (const memberPeerId of getPinnedPeerIds()) {
      if (memberPeerId === ownId) continue;
      if (!connectedIds.has(memberPeerId)) {
        const failures = (pinnedKeepAliveFailures.get(memberPeerId) ?? 0) + 1;
        pinnedKeepAliveFailures.set(memberPeerId, failures);
        void publishProfileRequest(memberPeerId).catch(() => {});
        setPinnedPeerWatchdog(memberPeerId, {
          status: failures >= PINNED_KEEPALIVE_FAILURE_THRESHOLD ? "recovering" : "degraded",
          consecutiveFailures: failures,
          lastReconnectAttemptAtMs: failures >= PINNED_KEEPALIVE_FAILURE_THRESHOLD ? Date.now() : undefined,
        });
        if (failures >= PINNED_KEEPALIVE_FAILURE_THRESHOLD) {
          recordReason("pinned_peer_offline");
          schedulePinnedReconnectBurst(memberPeerId, "keepalive-offline");
        }
        continue;
      }

      try {
        await pingService.ping(peerIdFromString(memberPeerId));
        pinnedKeepAliveFailures.delete(memberPeerId);
        setPinnedPeerWatchdog(memberPeerId, {
          status: "connected",
          consecutiveFailures: 0,
          lastSuccessfulPingAtMs: Date.now(),
        });
      } catch {
        const failures = (pinnedKeepAliveFailures.get(memberPeerId) ?? 0) + 1;
        pinnedKeepAliveFailures.set(memberPeerId, failures);
        setPinnedPeerWatchdog(memberPeerId, {
          status: failures >= PINNED_KEEPALIVE_FAILURE_THRESHOLD ? "recovering" : "degraded",
          consecutiveFailures: failures,
          lastReconnectAttemptAtMs: failures >= PINNED_KEEPALIVE_FAILURE_THRESHOLD ? Date.now() : undefined,
        });
        if (failures >= PINNED_KEEPALIVE_FAILURE_THRESHOLD) {
          recordReason("pinned_peer_ping_failed");
          schedulePinnedReconnectBurst(memberPeerId, "keepalive-failed");
          attemptDirectConnect(memberPeerId, [], undefined, true);
        }
      }
    }
  };

  let memberReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleMemberReconnectTick = () => {
    if (!isRelayCapableRuntime || stopped) return;
    const intervalMs = hasOfflinePinnedPeers()
      ? MEMBER_RECONNECT_FAST_INTERVAL_MS
      : MEMBER_RECONNECT_IDLE_INTERVAL_MS;
    if (memberReconnectTimer) clearTimeout(memberReconnectTimer);
    memberReconnectTimer = setTimeout(() => {
      memberReconnectTimer = null;
      reconnectDisconnectedMembers();
      scheduleMemberReconnectTick();
    }, intervalMs);
  };
  if (isRelayCapableRuntime) {
    reconnectDisconnectedMembers();
    scheduleMemberReconnectTick();
  }

  const pinnedKeepAliveInterval = isRelayCapableRuntime
    ? setInterval(() => {
        void runPinnedKeepAliveTick();
      }, PINNED_KEEPALIVE_PING_INTERVAL_MS)
    : null;
  if (isRelayCapableRuntime) {
    void runPinnedKeepAliveTick();
  }

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

  const normalizeDirectMessagePeerIds = (
    peerIds: readonly [string, string],
  ): [string, string] => {
    const a = peerIds[0].trim();
    const b = peerIds[1].trim();
    if (a.length === 0 || b.length === 0) {
      throw new Error("DM peer IDs cannot be empty");
    }
    if (a === b) {
      throw new Error("DM peer IDs must be unique");
    }
    return a.localeCompare(b) < 0 ? [a, b] : [b, a];
  };

  const createDirectMessageGroupWithResolvedId = async (
    groupId: string,
    peerIds: readonly [string, string],
  ): Promise<{ groupId: string; genesisEnvelope: SignedActionEnvelope }> => {
    if (groupId.trim().length === 0) throw new Error("Group ID cannot be empty");

    const normalizedPeerIds = normalizeDirectMessagePeerIds(peerIds);
    if (!normalizedPeerIds.includes(ownPeerId)) {
      throw new Error("Local peer must be one of the DM peers");
    }

    const topic = groupTopic(groupId);

    if (!joinedGroups.includes(groupId)) {
      topicToGroupId.set(topic, groupId);
      joinedGroups.push(groupId);
      getOrCreatePeerDiscoveryMetrics(groupId);
      pubsub.subscribe(topic);
      groupDiscoveryManager?.joinGroup(groupId);
    }

    if (!actionChainStates.has(groupId)) {
      actionChainStates.set(groupId, createActionChainGroupState(groupId));
    }
    reconcilePeerPathCache();

    const existingState = actionChainStates.get(groupId);
    if (existingState && !existingState.isDirectMessage && existingState.createdAt > 0) {
      throw new Error("Group ID already used for a non-DM group");
    }
    const existingLocalGenesis = findDirectMessageGenesisEnvelopeByAuthor(
      groupId,
      ownPublicKeyHex,
      normalizedPeerIds,
    );
    if (existingLocalGenesis) {
      return { groupId, genesisEnvelope: existingLocalGenesis };
    }

    const envelope = createSignedActionEnvelope({
      accountKey,
      groupId,
      parentHashes: [GENESIS_HASH],
      payload: { type: "dm-created", peerIds: normalizedPeerIds },
    });

    const action = processSignedAction(groupId, envelope);
    if (!action) {
      throw new Error("DM genesis rejected by local policy");
    }
    await publishEnvelope(groupId, envelope);

    emit(
      "info",
      `Created DM group (${groupId.slice(0, 8)}...) for ${normalizedPeerIds[0].slice(0, 12)}... and ${normalizedPeerIds[1].slice(0, 12)}...`,
    );
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

      const action = processSignedAction(groupId, envelope);
      if (!action) {
        throw new Error("Message rejected by local policy");
      }
      await publishEnvelope(groupId, envelope);
    },
    editMessage: async (groupId: string, targetActionId: string, newText: string) => {
      const trimmedTargetActionId = targetActionId.trim();
      const trimmedNewText = newText.trim();
      if (trimmedTargetActionId.length === 0) throw new Error("Target action ID is required");
      if (trimmedNewText.length === 0) throw new Error("Edited message cannot be empty");
      if (isMembershipEnforcedGroup(groupId) && !isOwnMemberOfGroup(groupId)) {
        throw new Error("Not a member of this group");
      }
      const targetHash = findHashByActionId(groupId, trimmedTargetActionId);
      if (!targetHash) throw new Error("Target action not found in DAG");
      const dag = getOrCreateDag(groupId);
      const tips = getTips(dag);
      const parentHashes = tips.length > 0 ? tips : [GENESIS_HASH];
      const envelope = createSignedActionEnvelope({
        accountKey,
        groupId,
        parentHashes,
        payload: {
          type: "message-edited",
          targetHash: new Uint8Array(targetHash),
          newText: trimmedNewText,
        },
      });
      const action = processSignedAction(groupId, envelope);
      if (!action) throw new Error("Message edit rejected by local policy");
      await publishEnvelope(groupId, envelope);
    },
    deleteMessage: async (groupId: string, targetActionId: string) => {
      const trimmedTargetActionId = targetActionId.trim();
      if (trimmedTargetActionId.length === 0) throw new Error("Target action ID is required");
      if (isMembershipEnforcedGroup(groupId) && !isOwnMemberOfGroup(groupId)) {
        throw new Error("Not a member of this group");
      }
      const targetHash = findHashByActionId(groupId, trimmedTargetActionId);
      if (!targetHash) throw new Error("Target action not found in DAG");
      const dag = getOrCreateDag(groupId);
      const tips = getTips(dag);
      const parentHashes = tips.length > 0 ? tips : [GENESIS_HASH];
      const envelope = createSignedActionEnvelope({
        accountKey,
        groupId,
        parentHashes,
        payload: {
          type: "message-deleted",
          targetHash: new Uint8Array(targetHash),
        },
      });
      const action = processSignedAction(groupId, envelope);
      if (!action) throw new Error("Message delete rejected by local policy");
      await publishEnvelope(groupId, envelope);
    },
    sendReadReceipt: async (groupId: string, upToActionId: string) => {
      const trimmedUpToActionId = upToActionId.trim();
      if (trimmedUpToActionId.length === 0) {
        throw new Error("Read receipt action ID is required");
      }
      if (isMembershipEnforcedGroup(groupId) && !isOwnMemberOfGroup(groupId)) {
        throw new Error("Not a member of this group");
      }
      const upToHash = findHashByActionId(groupId, trimmedUpToActionId);
      if (!upToHash) throw new Error("Target action not found in DAG");
      const upToHashHex = toHex(upToHash);
      const chainState = actionChainStates.get(groupId);
      if (chainState?.readReceipts.get(ownPublicKeyHex) === upToHashHex) {
        return;
      }
      const dag = getOrCreateDag(groupId);
      const tips = getTips(dag);
      const parentHashes = tips.length > 0 ? tips : [GENESIS_HASH];
      const envelope = createSignedActionEnvelope({
        accountKey,
        groupId,
        parentHashes,
        payload: {
          type: "read-receipt",
          upToHash: new Uint8Array(upToHash),
        },
      });
      const action = processSignedAction(groupId, envelope);
      if (!action) {
        throw new Error("Read receipt rejected by local policy");
      }
      await publishEnvelope(groupId, envelope);
    },
    createGroup: async (name: string): Promise<{ groupId: string; genesisEnvelope: SignedActionEnvelope }> => {
      const groupId = crypto.randomUUID();
      return await createGroupWithResolvedId(groupId, name);
    },
    createGroupWithId: async (groupId: string, name: string): Promise<{ groupId: string; genesisEnvelope: SignedActionEnvelope }> => {
      return await createGroupWithResolvedId(groupId, name);
    },
    createDirectMessageGroupWithId: async (
      groupId: string,
      peerIds: readonly [string, string],
    ): Promise<{ groupId: string; genesisEnvelope: SignedActionEnvelope }> => {
      return await createDirectMessageGroupWithResolvedId(groupId, peerIds);
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

      const inviteRelayAddr = invite.relayAddr?.trim();
      if (inviteRelayAddr) {
        if (!relayPeers.includes(inviteRelayAddr)) {
          relayPeers.push(inviteRelayAddr);
          emit("info", `Relay added from invite: ${inviteRelayAddr.slice(0, 40)}...`);
        }
        relayReservationManager.ingestRelayAddress(inviteRelayAddr);
        ingestRelayContact(inviteRelayAddr, "invite");
      }

      const acceptedAction = processSignedAction(groupId, invite.genesisEnvelope);
      if (!acceptedAction) {
        throw new Error("Invite genesis rejected by local policy");
      }

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

      if (verifyResult.data.payload.type !== "dm-created") {
        joinRetryState = enqueueJoinRetry(joinRetryState, groupId, Date.now());
        emitJoinRetryState();
        void runJoinRetryAttempt(groupId);
      }
      requestSyncFromConnectedPeers(groupId);

      return { groupId };
    },
    acceptDirectMessageRequest: async (requestId: string): Promise<{ groupId: string }> => {
      const request = pendingDirectMessageRequestsById.get(requestId);
      if (!request) throw new Error("DM request not found");

      const decodedInvite = decodeGroupInvite(request.inviteCode.trim());
      if (!decodedInvite.success) {
        throw new Error(`Invalid DM invite: ${decodedInvite.error.message}`);
      }
      const verified = verifyAndDecodeAction(decodedInvite.data.genesisEnvelope);
      if (!verified.success) {
        throw new Error(`Invalid DM genesis envelope: ${verified.error.message}`);
      }
      if (verified.data.payload.type !== "dm-created") {
        throw new Error("DM request must contain a dm-created genesis invite");
      }
      if (verified.data.groupId !== request.groupId) {
        throw new Error("DM request group mismatch");
      }

      const groupId = request.groupId;
      const peerIds = verified.data.payload.peerIds;
      const remoteInvite = decodedInvite.data;
      const relayAddr = remoteInvite.relayAddr?.trim();
      if (relayAddr) {
        if (!relayPeers.includes(relayAddr)) {
          relayPeers.push(relayAddr);
        }
        relayReservationManager.ingestRelayAddress(relayAddr);
        ingestRelayContact(relayAddr, "invite");
      }
      const acceptedAction = processSignedAction(groupId, remoteInvite.genesisEnvelope);
      if (!acceptedAction) {
        throw new Error("DM invite genesis rejected by local policy");
      }
      publicKeyToPeerId.set(toHex(verified.data.authorPublicKey), remoteInvite.adminPeerId);
      notifyPublicKeyToPeerIdChange();

      if (!joinedGroups.includes(groupId)) {
        const topic = groupTopic(groupId);
        topicToGroupId.set(topic, groupId);
        joinedGroups.push(groupId);
        getOrCreatePeerDiscoveryMetrics(groupId);
        pubsub.subscribe(topic);
        groupDiscoveryManager?.joinGroup(groupId);
        reconcilePeerPathCache();
      }

      const connectedToRemote = node.getPeers().some((p) => p.toString() === request.senderPeerId);
      if (!connectedToRemote) {
        void tryConnectToPeerId(request.senderPeerId).catch(() => {});
      }
      requestSyncFromConnectedPeers(groupId);

      const localGenesis = findDirectMessageGenesisEnvelopeByAuthor(groupId, ownPublicKeyHex, peerIds)
        ?? (await createDirectMessageGroupWithResolvedId(groupId, peerIds)).genesisEnvelope;

      const reciprocalInviteCode = encodeGroupInvite({
        genesisEnvelope: localGenesis,
        adminPeerId: ownPeerId,
      });
      const senderPublicKey = new Uint8Array(accountKey.publicKey);
      const reciprocalRequestId = crypto.randomUUID();
      const sentAt = Date.now();
      const signature = signDirectMessageRequest({
        requestId: reciprocalRequestId,
        senderPeerId: ownPeerId,
        senderPublicKey,
        targetPeerId: request.senderPeerId,
        groupId,
        groupName: request.groupName,
        inviteCode: reciprocalInviteCode,
        sentAt,
      });
      const reciprocalWireMessage: WireMessage = {
        type: "dm_request",
        payload: {
          requestId: reciprocalRequestId,
          senderPeerId: ownPeerId,
          senderPublicKey,
          targetPeerId: request.senderPeerId,
          groupId,
          groupName: request.groupName,
          inviteCode: reciprocalInviteCode,
          sentAt,
          signature: new Uint8Array(Array.from(signature)),
        },
      };
      const encoded = encodeWireMessage(reciprocalWireMessage);
      const topics = new Set<string>([
        DIRECT_MESSAGE_REQUEST_TOPIC,
        DIRECT_JOIN_REQUEST_TOPIC,
        ...collectSharedGroupTopicsForPeer(request.senderPeerId),
      ]);
      const publishResults = await Promise.allSettled(
        [...topics].map((topic) => pubsub.publish(topic, new Uint8Array(encoded))),
      );
      if (publishResults.every((result) => result.status === "rejected")) {
        throw new Error("Failed to publish reciprocal DM request");
      }
      void sendWireMessageDirect(
        request.senderPeerId,
        DIRECT_DM_REQUEST_PROTOCOL,
        reciprocalWireMessage,
      ).catch(() => {});

      pendingDirectMessageRequestsById.delete(requestId);
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
      const encoded = encodeWireMessage(wireMessage);
      const topics = new Set<string>([
        DIRECT_MESSAGE_REQUEST_TOPIC,
        DIRECT_JOIN_REQUEST_TOPIC,
        ...collectSharedGroupTopicsForPeer(targetPeerId),
      ]);
      const results = await Promise.allSettled(
        [...topics].map((topic) => pubsub.publish(topic, new Uint8Array(encoded))),
      );
      if (results.every((result) => result.status === "rejected")) {
        throw new Error("Failed to publish DM request on signaling topics");
      }
      void sendWireMessageDirect(
        targetPeerId,
        DIRECT_DM_REQUEST_PROTOCOL,
        wireMessage,
      ).catch(() => {});
      emit("info", `Sent DM request to ${targetPeerId.slice(0, 12)}...`);
    },
    startCall: async (groupId: string): Promise<void> => {
      if (isMembershipEnforcedGroup(groupId) && !isOwnMemberOfGroup(groupId)) {
        throw new Error("Not a member of this group");
      }
      await publishCallControl({
        groupId,
        action: "call-started",
      });
      await publishCallControl({
        groupId,
        action: "call-join",
      });
    },
    ringCall: async (
      groupId: string,
      options?: { readonly targetPeerId?: string },
    ): Promise<void> => {
      if (isMembershipEnforcedGroup(groupId) && !isOwnMemberOfGroup(groupId)) {
        throw new Error("Not a member of this group");
      }
      const active = activeCallsByGroup.get(groupId);
      if (!active) {
        await publishCallControl({
          groupId,
          action: "call-started",
        });
        await publishCallControl({
          groupId,
          action: "call-join",
        });
      }
      await publishCallControl({
        groupId,
        action: "call-ring",
        targetPeerId: options?.targetPeerId?.trim() || undefined,
      });
    },
    acceptCall: async (
      groupId: string,
      options?: { readonly targetPeerId?: string },
    ): Promise<void> => {
      await publishCallControl({
        groupId,
        action: "call-accept",
        targetPeerId: options?.targetPeerId?.trim() || undefined,
      });
    },
    declineCall: async (
      groupId: string,
      options?: { readonly targetPeerId?: string },
    ): Promise<void> => {
      await publishCallControl({
        groupId,
        action: "call-decline",
        targetPeerId: options?.targetPeerId?.trim() || undefined,
      });
    },
    joinCall: async (groupId: string): Promise<void> => {
      if (isMembershipEnforcedGroup(groupId) && !isOwnMemberOfGroup(groupId)) {
        throw new Error("Not a member of this group");
      }
      const active = activeCallsByGroup.get(groupId);
      if (active && !active.participants.has(ownPeerId) && active.participants.size >= MAX_CALL_PARTICIPANTS) {
        throw new Error("Call is full");
      }
      await publishCallControl({
        groupId,
        action: "call-join",
      });
    },
    leaveCall: async (
      groupId: string,
      options?: { readonly muted?: boolean },
    ): Promise<void> => {
      await publishCallControl({
        groupId,
        action: "call-leave",
        muted: options?.muted,
      });
    },
    endCall: async (groupId: string): Promise<void> => {
      await publishCallControl({
        groupId,
        action: "call-end",
      });
    },
    getCallState: (groupId: string): CallState | null => {
      const state = activeCallsByGroup.get(groupId);
      return state ? cloneCallState(state) : null;
    },
    sendMediaSignal: async (
      groupId: string,
      targetPeerId: string,
      message: SignalMessage,
    ): Promise<void> => {
      const trimmedTarget = targetPeerId.trim();
      if (trimmedTarget.length === 0) throw new Error("Target peer ID is required");
      if (trimmedTarget === ownPeerId) return;
      const stream = await node.dialProtocol(peerIdFromString(trimmedTarget), MEDIA_SIGNAL_PROTOCOL);
      const payload = encodeMediaSignalEnvelope({
        groupId,
        message,
      });
      await stream.sink((async function* () {
        yield payload;
      })());
      try {
        await stream.close();
      } catch {}
    },
    renameGroup: async (groupId: string, newName: string): Promise<void> => {
      const trimmed = newName.trim();
      if (trimmed.length === 0) throw new Error("Group name cannot be empty");
      if (actionChainStates.get(groupId)?.isDirectMessage) {
        throw new Error("Direct messages cannot be renamed");
      }
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
    ): Promise<void> => {
      if (actionChainStates.get(groupId)?.isDirectMessage) {
        throw new Error("Direct messages do not support member approval");
      }
      return performApproveJoin(groupId, memberPublicKey, options);
    },
    setJoinPolicy: async (groupId: string, joinPolicy: JoinPolicy): Promise<void> => {
      if (actionChainStates.get(groupId)?.isDirectMessage) {
        throw new Error("Direct messages do not support join policy");
      }
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
      if (actionChainStates.get(groupId)?.isDirectMessage) {
        throw new Error("Direct messages do not support role changes");
      }
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
      if (actionChainStates.get(groupId)?.isDirectMessage) {
        throw new Error("Direct messages do not support member removal");
      }
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
      const state = actionChainStates.get(groupId);
      if (state?.isDirectMessage) {
        throw new Error("Direct messages do not support join requests");
      }
      joinRetryState = enqueueJoinRetry(joinRetryState, groupId, Date.now());
      emitJoinRetryState();
      await runJoinRetryAttempt(groupId);
    },
    getActionChainState: (groupId: string): ActionChainGroupState | null =>
      actionChainStates.get(groupId) ?? null,
    getDirectMessageHandshakeState: (groupId: string): DirectMessageHandshakeState | null =>
      getDirectMessageHandshakeStateForGroup(groupId),
    getRelayContactBook: (): RelayContactBook =>
      cloneRelayContactBook(),
    clearRelayContactBook: () => {
      relayContactBook.clear();
      emitRelayContactBook();
    },
    getPinnedPeerWatchdogState: (): PinnedPeerWatchdogState =>
      new Map(pinnedPeerWatchdogState),
    getPeerPathCache: (): ReadonlyMap<string, readonly string[]> =>
      clonePeerPathCache(),
    clearPeerPathCache: () => {
      peerPathCache.clear();
      notifyPeerPathCacheChange();
    },
    getConnectionReasonCounts: (): ReadonlyMap<string, number> =>
      new Map(connectionReasonCounts),
    clearConnectionReasonCounts: () => {
      connectionReasonCounts.clear();
    },
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
    onCallEvent: (listener: CallEventListener) => {
      callEventListeners.push(listener);
      return () => {
        const index = callEventListeners.indexOf(listener);
        if (index !== -1) callEventListeners.splice(index, 1);
      };
    },
    onMediaSignal: (listener: MediaSignalListener) => {
      mediaSignalListeners.push(listener);
      return () => {
        const index = mediaSignalListeners.indexOf(listener);
        if (index !== -1) mediaSignalListeners.splice(index, 1);
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
    requestProfile: async (targetPeerId: string) => {
      const trimmed = targetPeerId.trim();
      if (trimmed.length === 0) return;
      if (trimmed === ownPeerId) return;
      await publishProfileRequest(trimmed);
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
      ingestRelayContact(addr, "manual");
    },
    stop: async () => {
      if (stopped) return;
      stopped = true;
      if (memberReconnectTimer) clearTimeout(memberReconnectTimer);
      memberReconnectTimer = null;
      if (relayReservationInterval) clearInterval(relayReservationInterval);
      if (pinnedKeepAliveInterval) clearInterval(pinnedKeepAliveInterval);
      if (joinRetryInterval) clearInterval(joinRetryInterval);
      if (callMaintenanceInterval) clearInterval(callMaintenanceInterval);
      clearInterval(syncReconcileInterval);
      for (const timers of pinnedReconnectBurstTimers.values()) {
        for (const timer of timers) clearTimeout(timer);
      }
      pinnedReconnectBurstTimers.clear();
      pinnedKeepAliveFailures.clear();
      relayContactBook.clear();
      pinnedPeerWatchdogState.clear();
      connectionReasonCounts.clear();
      inFlightPeerDials.clear();
      pendingDirectUpgradeByPeer.clear();
      joinRetryState = createJoinRetryState();
      joinInviteGrantByGroup.clear();
      pendingJoinInviteGrantsByGroup.clear();
      relayPoolManager?.stop();
      groupDiscoveryManager?.stop();
      try {
        pubsub.removeEventListener("message", handlePubsubMessage);
      } catch {}
      for (const topic of topicToGroupId.keys()) {
        try {
          pubsub.unsubscribe(topic);
        } catch {}
      }
      try {
        pubsub.unsubscribe(DIRECT_MESSAGE_REQUEST_TOPIC);
      } catch {}
      try {
        pubsub.unsubscribe(DIRECT_JOIN_REQUEST_TOPIC);
      } catch {}
      try {
        pubsub.unsubscribe(PROFILE_SYNC_TOPIC);
      } catch {}
      topicToGroupId.clear();
      joinedGroups.length = 0;
      messageListeners.length = 0;
      joinRequestListeners.length = 0;
      directMessageRequestListeners.length = 0;
      callEventListeners.length = 0;
      mediaSignalListeners.length = 0;
      peerChangeListeners.length = 0;
      eventListeners.length = 0;
      activeCallsByGroup.clear();
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
      fullSyncFallbackByGroupPeer.clear();
      try {
        await node.stop();
      } catch {}
    },
  };
};
