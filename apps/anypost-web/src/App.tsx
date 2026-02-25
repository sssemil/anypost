import { createSignal, createEffect, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import {
  createMultiGroupChat,
  createMultiGroupState,
  createDefaultRuntimeAdapter,
  transitionMultiGroup,
  getActiveGroup,
  getActiveMessages,
  getGroupList,
  getSeenPeerIds,
  hasGroup,
  toHex,
  encodeGroupInvite,
  decodeGroupInvite,
  createInviteGrant,
  verifyAndDecodeAction,
  isValidPeerId,
  formatPeerIdForDisplay,
} from "anypost-core/protocol";
import type {
  MultiGroupChat,
  MultiGroupState,
  NetworkStatus,
  NetworkEvent,
  RelayPoolState,
  GroupDiscoveryState,
  RelayCandidateState,
  ActionChainGroupState,
  GroupInvite,
  PeerDiscoveryMetrics,
  ConnectionMetrics,
  RelayReservationState,
  JoinRetryEntry,
  JoinRetryState,
  SyncProgressState,
  JoinPolicy,
  DirectMessageRequestEvent,
  RelayContactBook,
  PinnedPeerWatchdogState,
  ChatMessageEvent,
  SignedAction,
  CallState,
  MediaSignalEvent,
} from "anypost-core/protocol";
import { getCandidatesByRtt } from "anypost-core/protocol";
import { SPEAKING_THRESHOLD, isSpeaking } from "anypost-core/media";
import type { SignalMessage } from "anypost-core/media";
import {
  generateAccountKey,
  exportAccountKey,
  importAccountKey,
} from "anypost-core/crypto";
import type { AccountKey } from "anypost-core/crypto";
import {
  createPersistedSettingsDocument,
  setDisplayName,
  getDisplayName,
} from "anypost-core/data";
import { openAccountStore } from "anypost-core/data";
import type { AccountStore, ContactsBook } from "anypost-core/data";
import {
  createInitialState,
  transition,
  type OnboardingState,
} from "./onboarding/onboarding-machine.js";
import { OnboardingScreen } from "./onboarding/OnboardingScreen.js";
import { DisplayNamePrompt } from "./onboarding/DisplayNamePrompt.js";
import { BackupBanner } from "./onboarding/BackupBanner.js";
import { decideAutoConnect } from "./auto-connect.js";
import { PeerSharingPanel } from "./PeerSharingPanel.js";
import { ChatLayout } from "./layout/ChatLayout.js";
import { HeaderBar } from "./layout/HeaderBar.js";
import { GroupSidebar } from "./sidebar/GroupSidebar.js";
import { MessageList } from "./chat/MessageList.js";
import { MessageInput } from "./chat/MessageInput.js";
import type { MessageInputControl } from "./chat/MessageInput.js";
import { NetworkPanel } from "./network/NetworkPanel.js";
import { EventLog } from "./network/EventLog.js";
import { GroupInfoPanel } from "./chat/GroupInfoPanel.js";
import { DirectMessageInfoPanel } from "./chat/DirectMessageInfoPanel.js";
import { encodeQuotedMessage, parseQuotedMessage } from "./chat/message-quote.js";
import { ContactsBookPage } from "./contacts/ContactsBookPage.js";
import { ProfilePage } from "./profile/ProfilePage.js";
import { AboutPage } from "./about/AboutPage.js";
import type {
  PendingJoinRequest,
  InviteCreateOptions,
  InviteCreateResult,
} from "./chat/GroupInfoPanel.js";
import {
  createMobileViewState,
  transitionMobileView,
} from "./layout/mobile-view-machine.js";
import {
  serializeGroups,
  deserializeGroups,
} from "./group-persistence.js";
import {
  serializeActionChains,
  deserializeActionChains,
} from "./action-chain-persistence.js";
import {
  deriveDirectMessageGroupId,
  loadDirectMessagePeers,
  saveDirectMessagePeers,
} from "./direct-messages.js";

const ENV_RELAY_MULTIADDR = import.meta.env.VITE_RELAY_MULTIADDR as string | undefined;
const ENV_TRANSPORT_PROFILE = import.meta.env.VITE_ANYPOST_TRANSPORTS as
  | "websocket"
  | "tcp"
  | "desktop"
  | "android"
  | undefined;
const GROUPS_STORAGE_KEY = "anypost:groups";
const ACTION_CHAINS_STORAGE_KEY = "anypost:action-chains";
const PUBKEY_PEERID_STORAGE_KEY = "anypost:pubkey-peerid";
const PENDING_JOINS_STORAGE_KEY = "anypost:pending-joins";
const RELAY_HINTS_STORAGE_KEY = "anypost:relay-hints";
const PENDING_DM_REQUESTS_STORAGE_KEY = "anypost:pending-dm-requests";
const OUTGOING_DM_REQUESTS_STORAGE_KEY = "anypost:outgoing-dm-requests";
const USE_PUBLIC_BOOTSTRAP_STORAGE_KEY = "anypost:use-public-bootstrap";
const MAX_EVENTS = 200;
const SYSTEM_SENDER_ID = "__system__";
const CONTACTS_LAST_SEEN_UPDATE_MS = 60_000;
const CONTACTS_SELF_NAME_HISTORY_LIMIT = 12;
const PROFILE_SYNC_REQUEST_COOLDOWN_MS = 15_000;
const OUTGOING_DM_RETRY_INTERVAL_MS = 5_000;
const OUTGOING_DM_RETRY_SWEEP_MS = 4_000;
const ACTION_MESSAGE_DEDUP_MS = 1_500;
const ACTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const READ_RECEIPT_AUTO_SEND_COOLDOWN_MS = 1_500;
const DEVTOOLS_RECORD_DURATION_MS = 3 * 60_000;
const DEVTOOLS_RECORD_SNAPSHOT_MS = 1_000;
const DEVTOOLS_RECORD_MAX_ENTRIES = 25_000;
const PROJECT_GITHUB_URL = "https://github.com/sssemil/anypost";
const DEFAULT_DIRECT_MESSAGE_GROUP_NAME = "Direct Message";
const WEBRTC_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];
const CALL_SPEAKING_SAMPLE_INTERVAL_MS = 180;
const CALL_SPEAKING_MIN_LEVEL = SPEAKING_THRESHOLD * 0.03;
const CALL_SPEAKING_RISE_ALPHA = 0.5;
const CALL_SPEAKING_FALL_ALPHA = 0.2;
const CALL_SPEAKING_UI_ACTIVE_LEVEL = 0.08;

type CallLinkQuality = "excellent" | "good" | "fair" | "poor" | "unknown";

const isWebSocketCompatibleBootstrapAddr = (addr: string): boolean =>
  addr.includes("/ws") || addr.includes("/wss") || addr.includes("/webrtc") || addr.includes("/p2p-circuit");

type DesktopRelayState = {
  readonly running: boolean;
  readonly peerId?: string;
  readonly listenAddrs: readonly string[];
  readonly lastError?: string;
};

type HostBridge = {
  readonly getRelayState?: () => Promise<DesktopRelayState>;
  readonly onRelayState?: (listener: (state: DesktopRelayState) => void) => () => void;
  readonly onDeepLink?: (listener: (url: string) => void) => () => void;
  readonly getPendingDeepLinks?: () => Promise<readonly string[]>;
  readonly requestAppPermissions?: () => Promise<{
    readonly notificationsGranted: boolean;
    readonly microphoneGranted?: boolean;
    readonly cameraGranted?: boolean;
  } | void> | {
    readonly notificationsGranted: boolean;
    readonly microphoneGranted?: boolean;
    readonly cameraGranted?: boolean;
  } | void;
  readonly getBackgroundNodeState?: () => Promise<{ readonly running: boolean }>;
  readonly startBackgroundNode?: () => Promise<{ readonly running: boolean } | void> | { readonly running: boolean } | void;
  readonly stopBackgroundNode?: () => Promise<{ readonly running: boolean } | void> | { readonly running: boolean } | void;
  readonly onBackgroundNodeState?: (listener: (state: { readonly running: boolean }) => void) => () => void;
  readonly notifyMessage?: (payload: {
    readonly title: string;
    readonly body: string;
    readonly groupId: string;
    readonly senderPeerId: string;
  }) => void | Promise<void>;
};

type CapacitorRelayStatePayload = {
  readonly running?: boolean;
  readonly peerId?: string;
  readonly listenAddrs?: readonly string[];
  readonly lastError?: string;
};

type CapacitorPendingDeepLinksPayload = {
  readonly urls?: readonly string[];
};

type CapacitorBackgroundNodeStatePayload = {
  readonly running?: boolean;
};

type CapacitorAppPermissionsPayload = {
  readonly notificationsGranted?: boolean;
  readonly microphoneGranted?: boolean;
  readonly cameraGranted?: boolean;
};

type CapacitorBridgeListenerHandle = {
  readonly remove: () => void | Promise<void>;
};

type CapacitorBridgePlugin = {
  readonly getRelayState?: () => Promise<CapacitorRelayStatePayload>;
  readonly getPendingDeepLinks?: () => Promise<CapacitorPendingDeepLinksPayload | readonly string[]>;
  readonly requestAppPermissions?: () => Promise<CapacitorAppPermissionsPayload | void>;
  readonly getBackgroundNodeState?: () => Promise<CapacitorBackgroundNodeStatePayload>;
  readonly startBackgroundNode?: () => Promise<CapacitorBackgroundNodeStatePayload | void>;
  readonly stopBackgroundNode?: () => Promise<CapacitorBackgroundNodeStatePayload | void>;
  readonly notifyMessage?: (payload: {
    readonly title: string;
    readonly body: string;
    readonly groupId: string;
    readonly senderPeerId: string;
  }) => Promise<void> | void;
  readonly addListener?: (
    eventName: string,
    listener: (payload: Record<string, unknown>) => void,
  ) => CapacitorBridgeListenerHandle | Promise<CapacitorBridgeListenerHandle>;
};

type CapacitorRuntime = {
  readonly Plugins?: {
    readonly AnypostBridge?: CapacitorBridgePlugin;
  };
};

declare global {
  interface Window {
    anypostDesktop?: HostBridge;
    anypostAndroid?: HostBridge;
    Capacitor?: CapacitorRuntime;
  }
}

const hexToBytes = (hex: string): Uint8Array<ArrayBuffer> => {
  const buf = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
};

const normalizeDirectMessageGroupName = (name: unknown): string => {
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed.length > 0 ? trimmed : DEFAULT_DIRECT_MESSAGE_GROUP_NAME;
};

type SerializedPendingJoin = {
  readonly publicKeyHex: string;
};

type PendingDirectMessageRequest = {
  readonly requestId: string;
  readonly senderPeerId: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly inviteCode: string;
  readonly sentAt: number;
};

type OutgoingDirectMessageRequest = {
  readonly requestKey: string;
  readonly targetPeerId: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly inviteCode: string;
  readonly createdAt: number;
  readonly lastAttemptAt: number | null;
  readonly attemptCount: number;
  readonly nextAttemptAt: number;
};

type MessageReadEntry = {
  readonly peerId: string;
  readonly label: string;
  readonly readAt: number;
};

type DiagnosticsRecorderStatus = "idle" | "recording" | "ready";
type DiagnosticsEntry = {
  readonly timestamp: number;
  readonly type: string;
  readonly payload: unknown;
};
type DiagnosticsRecordingArtifact = {
  readonly url: string;
  readonly filename: string;
  readonly sizeBytes: number;
  readonly generatedAt: number;
};
type DiagnosticsRecorderState = {
  readonly status: DiagnosticsRecorderStatus;
  readonly startedAt: number | null;
  readonly endsAt: number | null;
  readonly remainingMs: number;
  readonly entryCount: number;
  readonly artifact: DiagnosticsRecordingArtifact | null;
};

type IncomingCallPrompt = {
  readonly senderPeerId: string;
  readonly sentAt: number;
  readonly targeted: boolean;
};

type PeerConnectionEntry = {
  readonly pc: RTCPeerConnection;
  readonly remoteStream: MediaStream;
  readonly audioElement: HTMLAudioElement;
  makingOffer: boolean;
  readonly polite: boolean;
  speakingAudioContext: AudioContext | null;
  speakingAnalyser: AnalyserNode | null;
  speakingSource: MediaStreamAudioSourceNode | null;
  speakingData: Uint8Array | null;
  speakingTimer: ReturnType<typeof setInterval> | null;
};

type GroupCallMediaState = {
  localStream: MediaStream | null;
  readonly peers: Map<string, PeerConnectionEntry>;
  localSpeakingAudioContext: AudioContext | null;
  localSpeakingAnalyser: AnalyserNode | null;
  localSpeakingSource: MediaStreamAudioSourceNode | null;
  localSpeakingData: Uint8Array | null;
  localSpeakingTimer: ReturnType<typeof setInterval> | null;
};
type DiagnosticsConsoleMethod = "debug" | "info" | "log" | "warn" | "error";

const loadPublicKeyToPeerId = (): ReadonlyMap<string, string> => {
  try {
    const json = localStorage.getItem(PUBKEY_PEERID_STORAGE_KEY);
    if (!json) return new Map();
    const entries = JSON.parse(json) as Array<[string, string]>;
    return new Map(entries);
  } catch {
    return new Map();
  }
};

const savePublicKeyToPeerId = (map: ReadonlyMap<string, string>) => {
  localStorage.setItem(PUBKEY_PEERID_STORAGE_KEY, JSON.stringify([...map]));
};

const loadPendingJoins = (): ReadonlyMap<string, readonly PendingJoinRequest[]> => {
  try {
    const json = localStorage.getItem(PENDING_JOINS_STORAGE_KEY);
    if (!json) return new Map();
    const parsed = JSON.parse(json) as Record<string, readonly SerializedPendingJoin[]>;
    const result = new Map<string, readonly PendingJoinRequest[]>();
    for (const [groupId, entries] of Object.entries(parsed)) {
      result.set(
        groupId,
        entries.map((e) => ({
          publicKeyHex: e.publicKeyHex,
          publicKey: hexToBytes(e.publicKeyHex),
        })),
      );
    }
    return result;
  } catch {
    return new Map();
  }
};

const savePendingJoins = (map: ReadonlyMap<string, readonly PendingJoinRequest[]>) => {
  const result: Record<string, readonly SerializedPendingJoin[]> = {};
  for (const [groupId, entries] of map) {
    result[groupId] = entries.map((e) => ({ publicKeyHex: e.publicKeyHex }));
  }
  localStorage.setItem(PENDING_JOINS_STORAGE_KEY, JSON.stringify(result));
};

const loadPendingDirectMessageRequests = (): readonly PendingDirectMessageRequest[] => {
  try {
    const json = localStorage.getItem(PENDING_DM_REQUESTS_STORAGE_KEY);
    if (!json) return [];
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): PendingDirectMessageRequest[] => {
      if (typeof entry !== "object" || entry === null) return [];
      const value = entry as Record<string, unknown>;
      if (
        typeof value.requestId !== "string" ||
        typeof value.senderPeerId !== "string" ||
        typeof value.groupId !== "string" ||
        typeof value.inviteCode !== "string" ||
        value.inviteCode.trim().length === 0 ||
        typeof value.sentAt !== "number" ||
        !Number.isFinite(value.sentAt)
      ) {
        return [];
      }
      return [{
        requestId: value.requestId,
        senderPeerId: value.senderPeerId,
        groupId: value.groupId,
        groupName: normalizeDirectMessageGroupName(value.groupName),
        inviteCode: value.inviteCode.trim(),
        sentAt: Math.floor(value.sentAt),
      }];
    });
  } catch {
    return [];
  }
};

const savePendingDirectMessageRequests = (requests: readonly PendingDirectMessageRequest[]) => {
  localStorage.setItem(PENDING_DM_REQUESTS_STORAGE_KEY, JSON.stringify(requests));
};

const loadOutgoingDirectMessageRequests = (): readonly OutgoingDirectMessageRequest[] => {
  try {
    const json = localStorage.getItem(OUTGOING_DM_REQUESTS_STORAGE_KEY);
    if (!json) return [];
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): OutgoingDirectMessageRequest[] => {
      if (typeof entry !== "object" || entry === null) return [];
      const value = entry as Record<string, unknown>;
      if (
        typeof value.requestKey !== "string" ||
        typeof value.targetPeerId !== "string" ||
        typeof value.groupId !== "string" ||
        typeof value.inviteCode !== "string" ||
        value.inviteCode.trim().length === 0 ||
        typeof value.createdAt !== "number" ||
        !Number.isFinite(value.createdAt) ||
        (typeof value.lastAttemptAt !== "number" && value.lastAttemptAt !== null) ||
        typeof value.attemptCount !== "number" ||
        !Number.isFinite(value.attemptCount) ||
        typeof value.nextAttemptAt !== "number" ||
        !Number.isFinite(value.nextAttemptAt)
      ) {
        return [];
      }
      return [{
        requestKey: value.requestKey,
        targetPeerId: value.targetPeerId,
        groupId: value.groupId,
        groupName: normalizeDirectMessageGroupName(value.groupName),
        inviteCode: value.inviteCode.trim(),
        createdAt: Math.floor(value.createdAt),
        lastAttemptAt: value.lastAttemptAt === null ? null : Math.floor(value.lastAttemptAt),
        attemptCount: Math.max(0, Math.floor(value.attemptCount)),
        nextAttemptAt: Math.floor(value.nextAttemptAt),
      }];
    });
  } catch {
    return [];
  }
};

const saveOutgoingDirectMessageRequests = (requests: readonly OutgoingDirectMessageRequest[]) => {
  localStorage.setItem(OUTGOING_DM_REQUESTS_STORAGE_KEY, JSON.stringify(requests));
};

const loadUsePublicBootstrapNodes = (): boolean => {
  try {
    const raw = localStorage.getItem(USE_PUBLIC_BOOTSTRAP_STORAGE_KEY);
    if (raw === null) return true;
    return raw !== "0";
  } catch {
    return true;
  }
};

const saveUsePublicBootstrapNodes = (enabled: boolean) => {
  localStorage.setItem(USE_PUBLIC_BOOTSTRAP_STORAGE_KEY, enabled ? "1" : "0");
};

const loadRelayHints = (): readonly string[] => {
  try {
    const json = localStorage.getItem(RELAY_HINTS_STORAGE_KEY);
    if (!json) return [];
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
};

const saveRelayHints = (hints: readonly string[]) => {
  localStorage.setItem(RELAY_HINTS_STORAGE_KEY, JSON.stringify([...hints]));
};

const relayHintStatusScore = (status: string): number => {
  if (status === "active") return 4;
  if (status === "renewing") return 3;
  if (status === "reserving") return 2;
  if (status === "idle") return 1;
  return 0;
};

const pickRelayHintsFromState = (
  state: RelayReservationState,
  maxHints = 6,
): readonly string[] =>
  [...state.entries.values()]
    .filter((entry) => entry.addresses.length > 0)
    .sort((a, b) => {
      const statusDelta = relayHintStatusScore(b.status) - relayHintStatusScore(a.status);
      if (statusDelta !== 0) return statusDelta;
      if (a.rttMs === null && b.rttMs === null) return a.peerId.localeCompare(b.peerId);
      if (a.rttMs === null) return 1;
      if (b.rttMs === null) return -1;
      return a.rttMs - b.rttMs;
    })
    .slice(0, maxHints)
    .map((entry) => entry.addresses[0]);

const loadPersistedGroups = () => {
  const json = localStorage.getItem(GROUPS_STORAGE_KEY);
  return json ? deserializeGroups(json) : null;
};

const savePersistedGroups = (state: MultiGroupState, chatInstance?: MultiGroupChat) => {
  localStorage.setItem(GROUPS_STORAGE_KEY, serializeGroups(state));
  if (chatInstance) {
    const envelopes = chatInstance.getAllActionChainEnvelopes();
    localStorage.setItem(ACTION_CHAINS_STORAGE_KEY, serializeActionChains(envelopes));
  }
};

export const App = () => {
  const [onboardingState, setOnboardingState] = createSignal<OnboardingState>(createInitialState());
  const [seedPhrase, setSeedPhrase] = createSignal("");

  const [groupState, setGroupState] = createSignal<MultiGroupState>(createMultiGroupState());
  const [chatStatus, setChatStatus] = createSignal<"connecting" | "connected" | "disconnected">("connecting");
  const [chatError, setChatError] = createSignal<string | null>(null);
  const [desktopRelayState, setDesktopRelayState] = createSignal<DesktopRelayState | null>(null);
  const [displayName, setDisplayNameState] = createSignal("");
  const [relayPoolState, setRelayPoolState] = createSignal<RelayPoolState | null>(null);
  const [groupDiscoveryState, setGroupDiscoveryState] = createSignal<GroupDiscoveryState | null>(null);
  const [relayCandidateState, setRelayCandidateState] = createSignal<RelayCandidateState | null>(null);
  const [relayReservationState, setRelayReservationState] = createSignal<RelayReservationState | null>(null);
  const [relayContactBook, setRelayContactBook] = createSignal<RelayContactBook>(new Map());
  const [networkStatus, setNetworkStatus] = createSignal<NetworkStatus | null>(null);
  const [eventLog, setEventLog] = createSignal<readonly NetworkEvent[]>([]);
  const [latencyMap, setLatencyMap] = createSignal<ReadonlyMap<string, number>>(new Map());
  const [connectionMetrics, setConnectionMetrics] = createSignal<ConnectionMetrics | null>(null);
  const [connectionReasonCounts, setConnectionReasonCounts] = createSignal<ReadonlyMap<string, number>>(new Map());
  const [peerDiscoveryMetricsByGroup, setPeerDiscoveryMetricsByGroup] = createSignal<ReadonlyMap<string, PeerDiscoveryMetrics>>(new Map());
  const [joinRetryState, setJoinRetryState] = createSignal<JoinRetryState>(new Map());
  const [syncProgressState, setSyncProgressState] = createSignal<SyncProgressState>(new Map());
  const [peerPathCache, setPeerPathCache] = createSignal<ReadonlyMap<string, readonly string[]>>(new Map());
  const [pinnedPeerWatchdogState, setPinnedPeerWatchdogState] = createSignal<PinnedPeerWatchdogState>(new Map());
  const [mobileView, setMobileView] = createSignal(createMobileViewState());
  const [actionChainState, setActionChainState] = createSignal<ActionChainGroupState | null>(null);
  const [pendingJoinsMap, setPendingJoinsMap] = createSignal<ReadonlyMap<string, readonly PendingJoinRequest[]>>(new Map());
  const [publicKeyToPeerIdMap, setPublicKeyToPeerIdMap] = createSignal<ReadonlyMap<string, string>>(new Map());
  const [contactsBook, setContactsBook] = createSignal<ContactsBook>(new Map());
  const [blockedPeerIds, setBlockedPeerIds] = createSignal<ReadonlySet<string>>(new Set());
  const [directMessagePeersByGroup, setDirectMessagePeersByGroup] = createSignal<ReadonlyMap<string, string>>(loadDirectMessagePeers());
  const [pendingDirectMessageRequests, setPendingDirectMessageRequests] = createSignal<readonly PendingDirectMessageRequest[]>(
    loadPendingDirectMessageRequests(),
  );
  const [outgoingDirectMessageRequests, setOutgoingDirectMessageRequests] = createSignal<readonly OutgoingDirectMessageRequest[]>(
    loadOutgoingDirectMessageRequests(),
  );
  const [callStatesByGroup, setCallStatesByGroup] = createSignal<ReadonlyMap<string, CallState>>(new Map());
  const [incomingCallsByGroup, setIncomingCallsByGroup] = createSignal<ReadonlyMap<string, IncomingCallPrompt>>(new Map());
  const [callMutedByGroup, setCallMutedByGroup] = createSignal<ReadonlyMap<string, boolean>>(new Map());
  const [callSpeakingByGroup, setCallSpeakingByGroup] = createSignal<ReadonlyMap<string, ReadonlyMap<string, number>>>(new Map());
  const [callAudioOutputBlockedByGroup, setCallAudioOutputBlockedByGroup] = createSignal<ReadonlyMap<string, boolean>>(new Map());
  const [callLocallyMutedPeersByGroup, setCallLocallyMutedPeersByGroup] = createSignal<ReadonlyMap<string, ReadonlySet<string>>>(new Map());
  const [callErrorByGroup, setCallErrorByGroup] = createSignal<ReadonlyMap<string, string>>(new Map());
  const [callClockMs, setCallClockMs] = createSignal(Date.now());
  const [pendingDesktopInviteCodes, setPendingDesktopInviteCodes] = createSignal<readonly string[]>([]);
  const [messageDraft, setMessageDraft] = createSignal("");
  const [usePublicBootstrapNodes, setUsePublicBootstrapNodes] = createSignal(loadUsePublicBootstrapNodes());
  const [keyboardInsetPx, setKeyboardInsetPx] = createSignal(0);
  const [backgroundNodeRunning, setBackgroundNodeRunning] = createSignal(false);
  const [backgroundNodeBusy, setBackgroundNodeBusy] = createSignal(false);
  const [replyTargetMessage, setReplyTargetMessage] = createSignal<ChatMessageEvent | null>(null);
  const [editTargetMessage, setEditTargetMessage] = createSignal<ChatMessageEvent | null>(null);
  const [profileSyncDebugTick, setProfileSyncDebugTick] = createSignal(0);
  const [diagnosticsRecorder, setDiagnosticsRecorder] = createSignal<DiagnosticsRecorderState>({
    status: "idle",
    startedAt: null,
    endsAt: null,
    remainingMs: 0,
    entryCount: 0,
    artifact: null,
  });

  let chat: MultiGroupChat | undefined;
  let unsubscribeMessage: (() => void) | undefined;
  let unsubscribeEvents: (() => void) | undefined;
  let unsubscribeJoinRequests: (() => void) | undefined;
  let unsubscribeDirectMessageRequests: (() => void) | undefined;
  let unsubscribeCallEvents: (() => void) | undefined;
  let unsubscribeMediaSignals: (() => void) | undefined;
  let statusInterval: ReturnType<typeof setInterval> | undefined;
  let pingInterval: ReturnType<typeof setInterval> | undefined;
  let callClockInterval: ReturnType<typeof setInterval> | undefined;
  let outgoingDmRetrySweepInFlight = false;
  const profileSyncLastRequestAtByPeer = new Map<string, number>();
  const readReceiptLastSentByGroup = new Map<string, string>();
  const readReceiptLastAttemptAtByGroup = new Map<string, number>();
  let diagnosticsSnapshotInterval: ReturnType<typeof setInterval> | undefined;
  let diagnosticsProgressInterval: ReturnType<typeof setInterval> | undefined;
  let diagnosticsStopTimeout: ReturnType<typeof setTimeout> | undefined;
  let diagnosticsEntries: DiagnosticsEntry[] = [];
  let diagnosticsConsoleRestore: (() => void) | undefined;
  let diagnosticsErrorRestore: (() => void) | undefined;
  let diagnosticsRejectionRestore: (() => void) | undefined;
  const groupCallMedia = new Map<string, GroupCallMediaState>();
  const callSessionByGroup = new Map<string, { readonly startedAt: number }>();
  let messageInputControl: MessageInputControl | null = null;

  let cachedCapacitorBridge: HostBridge | null | undefined;

  const normalizeRelayState = (payload: CapacitorRelayStatePayload): DesktopRelayState => ({
    running: payload.running === true,
    peerId: typeof payload.peerId === "string" ? payload.peerId : undefined,
    listenAddrs: Array.isArray(payload.listenAddrs)
      ? payload.listenAddrs.filter((value): value is string => typeof value === "string")
      : [],
    lastError: typeof payload.lastError === "string" ? payload.lastError : undefined,
  });

  const normalizePendingDeepLinks = (payload: unknown): readonly string[] => {
    if (Array.isArray(payload)) {
      return payload.filter((value): value is string => typeof value === "string");
    }
    if (typeof payload === "object" && payload !== null && "urls" in payload) {
      const urls = (payload as { readonly urls?: unknown }).urls;
      if (Array.isArray(urls)) {
        return urls.filter((value): value is string => typeof value === "string");
      }
    }
    return [];
  };

  const normalizeBackgroundNodeState = (
    payload: CapacitorBackgroundNodeStatePayload | null | undefined,
  ): { readonly running: boolean } => ({
    running: payload?.running === true,
  });

  const loadCapacitorBridge = (): HostBridge | null => {
    if (cachedCapacitorBridge) return cachedCapacitorBridge;
    if (typeof window === "undefined") {
      return null;
    }
    const plugin = window.Capacitor?.Plugins?.AnypostBridge;
    if (!plugin) {
      return null;
    }

    cachedCapacitorBridge = {
      getRelayState: plugin.getRelayState
        ? async () => normalizeRelayState(await plugin.getRelayState!())
        : undefined,
      onRelayState: plugin.addListener
        ? (listener) => {
            let handle: CapacitorBridgeListenerHandle | null = null;
            Promise.resolve(plugin.addListener!("relayState", (payload) => {
              listener(
                normalizeRelayState({
                  running: payload.running === true,
                  peerId: typeof payload.peerId === "string" ? payload.peerId : undefined,
                  listenAddrs: Array.isArray(payload.listenAddrs)
                    ? payload.listenAddrs.filter((value): value is string => typeof value === "string")
                    : [],
                  lastError: typeof payload.lastError === "string" ? payload.lastError : undefined,
                }),
              );
            })).then((value) => {
              handle = value;
            }).catch(() => {});
            return () => {
              void handle?.remove();
            };
          }
        : undefined,
      onDeepLink: plugin.addListener
        ? (listener) => {
            let handle: CapacitorBridgeListenerHandle | null = null;
            Promise.resolve(plugin.addListener!("deepLink", (payload) => {
              const url = payload.url;
              if (typeof url === "string" && url.length > 0) listener(url);
            })).then((value) => {
              handle = value;
            }).catch(() => {});
            return () => {
              void handle?.remove();
            };
          }
        : undefined,
      getPendingDeepLinks: plugin.getPendingDeepLinks
        ? async () => normalizePendingDeepLinks(await plugin.getPendingDeepLinks!())
        : undefined,
      requestAppPermissions: plugin.requestAppPermissions
        ? async () => {
            const payload = await plugin.requestAppPermissions!();
            return {
              notificationsGranted: payload?.notificationsGranted === true,
              microphoneGranted: payload?.microphoneGranted === true,
              cameraGranted: payload?.cameraGranted === true,
            };
          }
        : undefined,
      getBackgroundNodeState: plugin.getBackgroundNodeState
        ? async () => normalizeBackgroundNodeState(await plugin.getBackgroundNodeState!())
        : undefined,
      startBackgroundNode: plugin.startBackgroundNode
        ? async () => {
            const payload = await plugin.startBackgroundNode!();
            if (!payload || typeof payload !== "object") return { running: true };
            return normalizeBackgroundNodeState(payload);
          }
        : undefined,
      stopBackgroundNode: plugin.stopBackgroundNode
        ? async () => {
            const payload = await plugin.stopBackgroundNode!();
            if (!payload || typeof payload !== "object") return { running: false };
            return normalizeBackgroundNodeState(payload);
          }
        : undefined,
      onBackgroundNodeState: plugin.addListener
        ? (listener) => {
            let handle: CapacitorBridgeListenerHandle | null = null;
            Promise.resolve(plugin.addListener!("backgroundNodeState", (payload) => {
              listener(normalizeBackgroundNodeState({
                running: payload.running === true,
              }));
            })).then((value) => {
              handle = value;
            }).catch(() => {});
            return () => {
              void handle?.remove();
            };
          }
        : undefined,
      notifyMessage: plugin.notifyMessage
        ? (payload) => plugin.notifyMessage!(payload)
        : undefined,
    };

    return cachedCapacitorBridge;
  };

  const hasDesktopBridge = (): boolean =>
    typeof window !== "undefined" && window.anypostDesktop !== undefined;

  const hasAndroidBridge = (): boolean => {
    if (typeof window === "undefined") return false;
    if (window.anypostAndroid !== undefined || loadCapacitorBridge() !== null) return true;
    return /Android/i.test(window.navigator.userAgent);
  };

  const hostBridge = (): HostBridge | null => {
    if (typeof window === "undefined") return null;
    return window.anypostDesktop ?? window.anypostAndroid ?? loadCapacitorBridge();
  };

  const setMessageInputControl = (control: MessageInputControl | null) => {
    messageInputControl = control;
  };

  const focusComposerFromMenu = () => {
    messageInputControl?.focus();
  };

  const toggleComposerKeyboardFromMenu = () => {
    if (!messageInputControl) return;
    if (messageInputControl.isFocused()) {
      messageInputControl.blur();
      return;
    }
    messageInputControl.focus();
  };

  const setBackgroundNodeRunningState = (running: boolean) => {
    setBackgroundNodeRunning(running);
    appendDiagnosticsEntry("background-node-state", { running });
  };

  const toggleBackgroundNodeMode = async () => {
    const bridge = hostBridge();
    if (!bridge || !bridge.startBackgroundNode || !bridge.stopBackgroundNode || backgroundNodeBusy()) {
      return;
    }
    setBackgroundNodeBusy(true);
    try {
      const nextRunning = !backgroundNodeRunning();
      const payload = nextRunning
        ? await bridge.startBackgroundNode()
        : await bridge.stopBackgroundNode();
      if (payload && typeof payload === "object" && "running" in payload) {
        const running = (payload as { readonly running?: unknown }).running === true;
        setBackgroundNodeRunningState(running);
      } else {
        setBackgroundNodeRunningState(nextRunning);
      }
    } catch {
      appendDiagnosticsEntry("background-node-toggle-failed", {
        attemptedRunning: !backgroundNodeRunning(),
      });
    } finally {
      setBackgroundNodeBusy(false);
    }
  };

  const dispatchMobileView = (event: Parameters<typeof transitionMobileView>[1]) => {
    setMobileView((s) => {
      const next = transitionMobileView(s, event);
      appendDiagnosticsEntry("mobile-view-event", {
        event,
        from: s,
        to: next,
      });
      return next;
    });
  };

  const persistContactsBook = (contacts: ContactsBook) => {
    void (async () => {
      const store = await openAccountStore();
      try {
        await store.saveContactsBook(contacts);
      } finally {
        store.close();
      }
    })();
  };

  const persistBlockedPeerIds = (blocked: ReadonlySet<string>) => {
    void (async () => {
      const store = await openAccountStore();
      try {
        await store.saveBlockedPeerIds(blocked);
      } finally {
        store.close();
      }
    })();
  };

  const persistDirectMessagePeersByGroup = (dmPeers: ReadonlyMap<string, string>) => {
    saveDirectMessagePeers(dmPeers);
  };

  const persistPendingDirectMessageRequests = (
    requests: readonly PendingDirectMessageRequest[],
  ) => {
    savePendingDirectMessageRequests(requests);
  };

  const persistOutgoingDirectMessageRequests = (
    requests: readonly OutgoingDirectMessageRequest[],
  ) => {
    saveOutgoingDirectMessageRequests(requests);
  };

  const setBootstrapPreference = (enabled: boolean) => {
    setUsePublicBootstrapNodes(enabled);
    saveUsePublicBootstrapNodes(enabled);
    appendDiagnosticsEntry("bootstrap-preference-updated", {
      usePublicBootstrapNodes: enabled,
    });
  };

  const createRecordingFilename = (atMs: number): string => {
    const date = new Date(atMs);
    const pad = (value: number) => value.toString().padStart(2, "0");
    return `anypost-devtools-recording-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.json`;
  };

  const formatDiagnosticsCountdown = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const formatDiagnosticsBytes = (sizeBytes: number | null): string => {
    if (sizeBytes === null) return "--";
    if (sizeBytes < 1024) return `${sizeBytes} B`;
    if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
    return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const diagnosticsValue = (value: unknown, depth = 0): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "bigint") return value.toString();
    if (depth >= 3) return "[max-depth]";
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack ?? null,
      };
    }
    if (value instanceof Uint8Array) {
      return `Uint8Array(${value.length})`;
    }
    if (Array.isArray(value)) {
      return value.slice(0, 40).map((entry) => diagnosticsValue(entry, depth + 1));
    }
    if (value instanceof Map) {
      return {
        type: "Map",
        size: value.size,
        entries: [...value.entries()].slice(0, 40).map(([k, v]) => [diagnosticsValue(k, depth + 1), diagnosticsValue(v, depth + 1)]),
      };
    }
    if (value instanceof Set) {
      return {
        type: "Set",
        size: value.size,
        values: [...value.values()].slice(0, 40).map((entry) => diagnosticsValue(entry, depth + 1)),
      };
    }
    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>).slice(0, 60);
      const out: Record<string, unknown> = {};
      for (const [key, nested] of entries) {
        out[key] = diagnosticsValue(nested, depth + 1);
      }
      return out;
    }
    return String(value);
  };

  const uninstallDiagnosticsRuntimeCapture = () => {
    diagnosticsConsoleRestore?.();
    diagnosticsErrorRestore?.();
    diagnosticsRejectionRestore?.();
    diagnosticsConsoleRestore = undefined;
    diagnosticsErrorRestore = undefined;
    diagnosticsRejectionRestore = undefined;
  };

  const installDiagnosticsRuntimeCapture = () => {
    uninstallDiagnosticsRuntimeCapture();
    if (typeof window === "undefined") return;

    const methods: readonly DiagnosticsConsoleMethod[] = ["debug", "info", "log", "warn", "error"];
    const originalConsole = new Map<DiagnosticsConsoleMethod, (...args: unknown[]) => void>();
    for (const method of methods) {
      const fn = console[method].bind(console);
      originalConsole.set(method, fn);
      console[method] = (...args: unknown[]) => {
        appendDiagnosticsEntry("console", {
          level: method,
          args: args.map((arg) => diagnosticsValue(arg)),
        });
        fn(...args);
      };
    }
    diagnosticsConsoleRestore = () => {
      for (const method of methods) {
        const original = originalConsole.get(method);
        if (original) {
          console[method] = original;
        }
      }
    };

    const onError = (event: ErrorEvent) => {
      appendDiagnosticsEntry("window-error", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: diagnosticsValue(event.error),
      });
    };
    window.addEventListener("error", onError);
    diagnosticsErrorRestore = () => window.removeEventListener("error", onError);

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      appendDiagnosticsEntry("window-unhandled-rejection", {
        reason: diagnosticsValue(event.reason),
      });
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    diagnosticsRejectionRestore = () => window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };

  const clearDiagnosticsTimers = () => {
    if (diagnosticsSnapshotInterval) clearInterval(diagnosticsSnapshotInterval);
    if (diagnosticsProgressInterval) clearInterval(diagnosticsProgressInterval);
    if (diagnosticsStopTimeout) clearTimeout(diagnosticsStopTimeout);
    diagnosticsSnapshotInterval = undefined;
    diagnosticsProgressInterval = undefined;
    diagnosticsStopTimeout = undefined;
  };

  const appendDiagnosticsEntry = (type: string, payload: unknown) => {
    if (diagnosticsRecorder().status !== "recording") return;
    diagnosticsEntries.push({
      timestamp: Date.now(),
      type,
      payload,
    });
    if (diagnosticsEntries.length > DEVTOOLS_RECORD_MAX_ENTRIES) {
      diagnosticsEntries = diagnosticsEntries.slice(diagnosticsEntries.length - DEVTOOLS_RECORD_MAX_ENTRIES);
    }
  };

  const buildDiagnosticsSnapshot = () => {
    const status = chat?.getNetworkStatus();
    const groups = [...groupState().groups.values()];
    const activeGroupId = groupState().activeGroupId;
    const activeChain = activeGroupId ? chat?.getActionChainState(activeGroupId) : null;
    const relayPool = relayPoolState();
    const relayCandidates = relayCandidateState();
    const discovery = groupDiscoveryState();
    const connectedPeerIds = new Set((status?.peers ?? []).map((peer) => peer.peerId));
    return {
      capturedAt: Date.now(),
      onboardingStatus: onboardingState().status,
      chatStatus: chatStatus(),
      mobileView: mobileView(),
      activeGroupId,
      activeGroupName: activeGroupName() ?? null,
      groups: groups.map((group) => ({
        groupId: group.groupId,
        groupName: group.groupName,
        hasActionChain: group.hasActionChain,
        messageCount: group.messages.length,
        latestMessageTimestamp: group.messages.length > 0
          ? group.messages[group.messages.length - 1]?.timestamp ?? null
          : null,
      })),
      network: {
        subscriberCount: status?.subscriberCount ?? 0,
        peers: (status?.peers ?? []).map((peer) => ({
          peerId: peer.peerId,
          direction: peer.direction,
          protocol: peer.protocol,
          addrs: peer.addrs,
          latencyMs: latencyMap().get(peer.peerId) ?? null,
        })),
      },
      relayPool: relayPool
        ? {
            discoveryInProgress: relayPool.discoveryInProgress,
            relays: relayPool.relays.map((relay) => ({
              peerId: relay.peerId,
              status: relay.status,
              address: relay.address,
              latencyMs: relay.latencyMs,
              hasReservation: relay.hasReservation,
            })),
          }
        : null,
      relayCandidates: relayCandidates
        ? {
            reservedCount: getCandidatesByRtt(relayCandidates).filter((candidate) => candidate.hasReservation).length,
            candidates: getCandidatesByRtt(relayCandidates).map((candidate) => ({
              peerId: candidate.peerId,
              addresses: candidate.addresses,
              rttMs: candidate.rttMs,
              hasReservation: candidate.hasReservation,
            })),
          }
        : null,
      relayContacts: [...relayContactBook().values()].map((entry) => ({
        peerId: entry.peerId,
        addresses: entry.addresses,
        sources: entry.sources,
        successCount: entry.successCount,
        failureCount: entry.failureCount,
        consecutiveFailures: entry.consecutiveFailures,
        averageRttMs: entry.averageRttMs,
        quarantinedUntilMs: entry.quarantinedUntilMs,
        score: entry.score,
      })),
      peerPathCache: [...peerPathCache().entries()].map(([peerId, paths]) => ({
        peerId,
        paths,
      })),
      pinnedWatchdog: [...pinnedPeerWatchdogState().values()].map((entry) => ({
        peerId: entry.peerId,
        status: entry.status,
        consecutiveFailures: entry.consecutiveFailures,
        lastSuccessfulPingAtMs: entry.lastSuccessfulPingAtMs,
        lastReconnectAttemptAtMs: entry.lastReconnectAttemptAtMs,
      })),
      connectionReasonCounts: [...connectionReasonCounts().entries()],
      desktopRelay: desktopRelayState()
        ? {
            running: desktopRelayState()!.running,
            peerId: desktopRelayState()!.peerId ?? null,
            listenAddrs: [...desktopRelayState()!.listenAddrs],
            lastError: desktopRelayState()!.lastError ?? null,
          }
        : null,
      groupDiscovery: discovery
        ? {
            searchRounds: [...discovery.groups.values()].reduce((sum, entry) => sum + entry.searchCount, 0),
            groups: [...discovery.groups.values()].map((entry) => ({
              groupId: entry.groupId,
              providerCount: entry.peers.length,
              peerCount: entry.peers.length,
              peers: (entry.peers ?? []).map((peer) => ({
                peerId: peer.peerId,
                addrs: peer.addrs,
                connected: connectedPeerIds.has(peer.peerId),
              })),
            })),
          }
        : null,
      actionChain: activeChain
        ? {
            groupId: activeChain.groupId,
            groupName: activeChain.groupName,
            isDirectMessage: activeChain.isDirectMessage,
            joinPolicy: activeChain.joinPolicy,
            createdAt: activeChain.createdAt,
            members: [...activeChain.members.values()].map((member) => ({
              publicKeyHex: member.publicKeyHex,
              role: member.role,
              joinedAt: member.joinedAt,
            })),
          }
        : null,
      pendingJoins: [...pendingJoinsMap().entries()].map(([groupId, pending]) => ({
        groupId,
        count: pending.length,
        publicKeyHexes: pending.map((entry) => entry.publicKeyHex),
      })),
      pendingDmRequests: pendingDirectMessageRequests().map((entry) => ({
        requestId: entry.requestId,
        senderPeerId: entry.senderPeerId,
        groupId: entry.groupId,
        groupName: entry.groupName,
        sentAt: entry.sentAt,
      })),
      pendingDmRequestCount: pendingDirectMessageRequests().length,
      outgoingDmRequests: outgoingDirectMessageRequests().map((entry) => ({
        requestKey: entry.requestKey,
        groupId: entry.groupId,
        targetPeerId: entry.targetPeerId,
        attemptCount: entry.attemptCount,
        lastAttemptAt: entry.lastAttemptAt,
        nextAttemptAt: entry.nextAttemptAt,
        blocked: blockedPeerIds().has(entry.targetPeerId),
        targetJoined: targetPeerHasJoinedGroup(entry.groupId, entry.targetPeerId),
      })),
      contacts: [...contactsBook().values()].map((contact) => ({
        peerId: contact.peerId,
        nickname: contact.nickname,
        selfName: contact.selfName,
        seenSelfNames: contact.seenSelfNames,
        lastSeenAt: contact.lastSeenAt,
        groupIds: contact.groupIds,
        connected: connectedPeerIds.has(contact.peerId),
      })),
      blockedPeerIds: [...blockedPeerIds()],
      directMessagePeersByGroup: [...directMessagePeersByGroup().entries()],
      publicKeyToPeerId: [...publicKeyToPeerIdMap().entries()],
      pendingJoinRetryGroups: [...joinRetryState().entries()].map(([groupId, entry]) => ({
        groupId,
        status: entry.status,
        attemptCount: entry.attemptCount,
        createdAt: entry.createdAt,
        lastAttemptAt: entry.lastAttemptAt,
        nextAttemptAt: entry.nextAttemptAt,
      })),
      profileSyncLastRequestAtByPeer: [...profileSyncLastRequestAtByPeer.entries()],
      connectionMetrics: connectionMetrics(),
      recentNetworkEvents: eventLog().slice(-60).map((event) => diagnosticsValue(event)),
      relayReservationSummary: relayReservationState()
        ? [...relayReservationState()!.entries.values()].map((entry) => ({
            peerId: entry.peerId,
            status: entry.status,
            rttMs: entry.rttMs,
            addresses: entry.addresses,
            reservationExpiresAtMs: entry.reservationExpiresAtMs,
            nextAttemptAtMs: entry.nextAttemptAtMs,
          }))
        : [],
    };
  };

  const finishDiagnosticsRecording = (reason: "timeout" | "manual") => {
    if (diagnosticsRecorder().status !== "recording") return;
    clearDiagnosticsTimers();
    appendDiagnosticsEntry("recording-finished", { reason });
    uninstallDiagnosticsRuntimeCapture();

    const startedAt = diagnosticsRecorder().startedAt ?? Date.now();
    const endedAt = Date.now();
    const payload = {
      schemaVersion: 1,
      appVersion: (() => {
        const fromEnv = import.meta.env.VITE_APP_VERSION as string | undefined;
        return fromEnv && fromEnv.trim().length > 0 ? fromEnv.trim() : "dev";
      })(),
      startedAt,
      endedAt,
      durationMs: Math.max(0, endedAt - startedAt),
      reason,
      entryCount: diagnosticsEntries.length,
      entries: diagnosticsEntries,
    };

    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: "application/json" });
    const nextUrl = URL.createObjectURL(blob);
    const priorArtifact = diagnosticsRecorder().artifact;
    if (priorArtifact?.url) {
      URL.revokeObjectURL(priorArtifact.url);
    }

    setDiagnosticsRecorder({
      status: "ready",
      startedAt,
      endsAt: endedAt,
      remainingMs: 0,
      entryCount: diagnosticsEntries.length,
      artifact: {
        url: nextUrl,
        filename: createRecordingFilename(startedAt),
        sizeBytes: blob.size,
        generatedAt: endedAt,
      },
    });
  };

  const startDiagnosticsRecording = () => {
    if (diagnosticsRecorder().status === "recording") return;

    clearDiagnosticsTimers();
    uninstallDiagnosticsRuntimeCapture();
    const priorArtifact = diagnosticsRecorder().artifact;
    if (priorArtifact?.url) {
      URL.revokeObjectURL(priorArtifact.url);
    }

    diagnosticsEntries = [];
    const startedAt = Date.now();
    const endsAt = startedAt + DEVTOOLS_RECORD_DURATION_MS;
    setDiagnosticsRecorder({
      status: "recording",
      startedAt,
      endsAt,
      remainingMs: DEVTOOLS_RECORD_DURATION_MS,
      entryCount: 0,
      artifact: null,
    });
    installDiagnosticsRuntimeCapture();

    appendDiagnosticsEntry("recording-started", {
      durationMs: DEVTOOLS_RECORD_DURATION_MS,
      snapshotIntervalMs: DEVTOOLS_RECORD_SNAPSHOT_MS,
    });

    appendDiagnosticsEntry("snapshot", buildDiagnosticsSnapshot());

    diagnosticsSnapshotInterval = setInterval(() => {
      appendDiagnosticsEntry("snapshot", buildDiagnosticsSnapshot());
    }, DEVTOOLS_RECORD_SNAPSHOT_MS);

    diagnosticsProgressInterval = setInterval(() => {
      setDiagnosticsRecorder((prev) => {
        if (prev.status !== "recording") return prev;
        return {
          ...prev,
          remainingMs: Math.max(0, (prev.endsAt ?? Date.now()) - Date.now()),
          entryCount: diagnosticsEntries.length,
        };
      });
    }, 250);

    diagnosticsStopTimeout = setTimeout(() => {
      finishDiagnosticsRecording("timeout");
    }, DEVTOOLS_RECORD_DURATION_MS);
  };

  const downloadDiagnosticsRecording = () => {
    const artifact = diagnosticsRecorder().artifact;
    if (!artifact) return;
    const anchor = document.createElement("a");
    anchor.href = artifact.url;
    anchor.download = artifact.filename;
    anchor.click();
  };

  const upsertContact = (
    peerId: string,
    options?: {
      readonly selfName?: string | null;
      readonly groupId?: string;
      readonly lastSeenAt?: number;
    },
  ) => {
    if (!peerId || peerId === SYSTEM_SENDER_ID) return;

    const normalizedName = options?.selfName?.trim();
    const incomingName = normalizedName && normalizedName.length > 0 ? normalizedName : null;
    const incomingLastSeenAt = options?.lastSeenAt ?? Date.now();
    const incomingGroupId = options?.groupId;

    setContactsBook((prev) => {
      const existing = prev.get(peerId);
      const nextName = incomingName ?? existing?.selfName ?? null;
      const existingSeenSelfNames = existing?.seenSelfNames ?? (existing?.selfName ? [existing.selfName] : []);
      const nextSeenSelfNames = incomingName
        ? [incomingName, ...existingSeenSelfNames.filter((name) => name !== incomingName)]
            .slice(0, CONTACTS_SELF_NAME_HISTORY_LIMIT)
        : existingSeenSelfNames;

      const baseGroupIds = existing?.groupIds ?? [];
      const nextGroupIds = incomingGroupId && !baseGroupIds.includes(incomingGroupId)
        ? [...baseGroupIds, incomingGroupId]
        : baseGroupIds;

      const nextLastSeenAt = existing
        ? Math.max(
            existing.lastSeenAt,
            incomingLastSeenAt >= existing.lastSeenAt + CONTACTS_LAST_SEEN_UPDATE_MS
              ? incomingLastSeenAt
              : existing.lastSeenAt,
          )
        : incomingLastSeenAt;

      if (
        existing &&
        existing.selfName === nextName &&
        existing.seenSelfNames.length === nextSeenSelfNames.length &&
        existing.seenSelfNames.every((name, idx) => name === nextSeenSelfNames[idx]) &&
        existing.lastSeenAt === nextLastSeenAt &&
        existing.groupIds.length === nextGroupIds.length &&
        existing.groupIds.every((groupId, idx) => groupId === nextGroupIds[idx])
      ) {
        return prev;
      }

      const next = new Map(prev);
      next.set(peerId, {
        peerId,
        nickname: existing?.nickname ?? null,
        selfName: nextName,
        seenSelfNames: nextSeenSelfNames,
        lastSeenAt: nextLastSeenAt,
        groupIds: nextGroupIds,
      });
      persistContactsBook(next);
      return next;
    });
  };

  const handleSetContactNickname = (peerId: string, nickname: string | null) => {
    if (!peerId || peerId === SYSTEM_SENDER_ID) return;
    const trimmed = nickname?.trim() ?? "";
    const normalizedNickname = trimmed.length > 0 ? trimmed : null;

    setContactsBook((prev) => {
      const existing = prev.get(peerId);
      if (!existing || existing.nickname === normalizedNickname) return prev;
      const next = new Map(prev);
      next.set(peerId, { ...existing, nickname: normalizedNickname });
      persistContactsBook(next);
      return next;
    });
  };

  const refreshNetworkStatus = () => {
    if (chat) setNetworkStatus(chat.getNetworkStatus());
  };

  const PING_SWEEP_INTERVAL = 15_000;

  const runPingSweep = async () => {
    const currentChat = chat;
    if (!currentChat) return;

    const status = currentChat.getNetworkStatus();
    const results = new Map<string, number>();

    for (const peer of status.peers) {
      if (results.has(peer.peerId)) continue;
      try {
        const rtt = await currentChat.pingPeer(peer.peerId);
        results.set(peer.peerId, rtt);
      } catch {
        // Ping failed — omit this peer from the map
      }
    }

    setLatencyMap(results);
  };

  const refreshActionChainState = () => {
    const activeId = groupState().activeGroupId;
    if (!activeId || !chat) {
      setActionChainState(null);
      return;
    }
    setActionChainState(chat.getActionChainState(activeId));
  };

  const syncMessagesFromActionChain = (
    groupId: string,
    options?: { readonly historical?: boolean },
  ) => {
    const currentChat = chat;
    if (!currentChat) return;
    const historical = options?.historical ?? false;
    const eventType = historical ? "message-sent" : "message-received";
    const chainState = currentChat.getActionChainState(groupId);
    const envelopes = currentChat.getActionChainEnvelopes(groupId);
    if (envelopes.length === 0) return;
    const ownKeyHex = ownPublicKeyHex();
    const canHydrateMessages = chainState
      ? (chainState.isDirectMessage
        ? chainState.dmHandshakeComplete
        : chainState.members.has(ownKeyHex))
      : false;

    if (chainState) {
      for (const member of chainState.members.values()) {
        const memberPeerId = publicKeyToPeerIdMap().get(member.publicKeyHex);
        if (memberPeerId) {
          upsertContact(memberPeerId, { groupId });
        }
      }
    }

    const existingIds = new Set(
      (groupState().groups.get(groupId)?.messages ?? []).map((m) => m.id),
    );
    const pubKeyMap = publicKeyToPeerIdMap();
    const memberLabelFromPublicKey = (publicKey: Uint8Array): string => {
      const memberHex = toHex(publicKey);
      const memberPeerId = pubKeyMap.get(memberHex);
      if (memberPeerId) {
        const contact = contactsBook().get(memberPeerId);
        const knownName = contact?.nickname ?? contact?.selfName;
        if (knownName) return knownName;
        return `${memberPeerId.slice(0, 12)}...${memberPeerId.slice(-6)}`;
      }
      return `${memberHex.slice(0, 8)}...${memberHex.slice(-8)}`;
    };
    const resolveAuthorPeerId = (publicKey: Uint8Array): string => {
      const memberHex = toHex(publicKey);
      if (memberHex === ownKeyHex && currentChat) return currentChat.peerId;
      return pubKeyMap.get(memberHex) ?? `pk:${memberHex}`;
    };
    const canonicalMessagesById = new Map<string, {
      readonly id: string;
      readonly senderPeerId: string;
      readonly authorPublicKeyHex: string;
      readonly senderDisplayName: string | undefined;
      text: string;
      readonly timestamp: number;
      deleted: boolean;
    }>();
    const latestEditByTargetId = new Map<string, {
      readonly newText: string;
      readonly editorPublicKeyHex: string;
      readonly editedAt: number;
    }>();
    const latestDeleteByTargetId = new Map<string, {
      readonly deleterPublicKeyHex: string;
      readonly deletedAt: number;
    }>();
    const decodedActions: SignedAction[] = [];
    for (const envelope of envelopes) {
      const decoded = verifyAndDecodeAction(envelope);
      if (!decoded.success) continue;
      decodedActions.push(decoded.data);
    }
    decodedActions
      .sort((left, right) => {
        if (left.timestamp !== right.timestamp) return left.timestamp - right.timestamp;
        return left.id.localeCompare(right.id);
      });

    for (const action of decodedActions) {
      if (action.payload.type === "message") {
        if (!canHydrateMessages) continue;
        const senderPeerId = resolveAuthorPeerId(action.authorPublicKey);
        const authorPublicKeyHex = toHex(action.authorPublicKey);
        const senderDisplayName = memberLabelFromPublicKey(action.authorPublicKey);
        canonicalMessagesById.set(action.id, {
          id: action.id,
          senderPeerId,
          authorPublicKeyHex,
          senderDisplayName,
          text: action.payload.text,
          timestamp: action.timestamp,
          deleted: false,
        });
        continue;
      }
      if (action.payload.type === "message-edited") {
        if (!canHydrateMessages) continue;
        const editorPublicKeyHex = toHex(action.authorPublicKey);
        const previous = latestEditByTargetId.get(action.payload.targetActionId);
        if (!previous || action.timestamp > previous.editedAt) {
          latestEditByTargetId.set(action.payload.targetActionId, {
            newText: action.payload.newText,
            editorPublicKeyHex,
            editedAt: action.timestamp,
          });
        }
        continue;
      }
      if (action.payload.type === "message-deleted") {
        if (!canHydrateMessages) continue;
        const deleterPublicKeyHex = toHex(action.authorPublicKey);
        const previous = latestDeleteByTargetId.get(action.payload.targetActionId);
        if (!previous || action.timestamp > previous.deletedAt) {
          latestDeleteByTargetId.set(action.payload.targetActionId, {
            deleterPublicKeyHex,
            deletedAt: action.timestamp,
          });
        }
        continue;
      }
      if (action.payload.type === "member-approved") {
        const indicatorId = `join:${action.id}`;
        if (existingIds.has(indicatorId)) continue;
        const joinedLabel = memberLabelFromPublicKey(action.payload.memberPublicKey);
        dispatchGroupEvent({
          type: eventType,
          groupId,
          message: {
            id: indicatorId,
            senderPeerId: SYSTEM_SENDER_ID,
            senderDisplayName: "system",
            text: `${joinedLabel} joined the group`,
            timestamp: action.timestamp,
          },
        });
        existingIds.add(indicatorId);
        continue;
      }

      if (action.payload.type === "member-left") {
        const indicatorId = `left:${action.id}`;
        if (existingIds.has(indicatorId)) continue;
        const leftLabel = memberLabelFromPublicKey(action.authorPublicKey);
        dispatchGroupEvent({
          type: eventType,
          groupId,
          message: {
            id: indicatorId,
            senderPeerId: SYSTEM_SENDER_ID,
            senderDisplayName: "system",
            text: `${leftLabel} left the group`,
            timestamp: action.timestamp,
          },
        });
        existingIds.add(indicatorId);
        continue;
      }

      if (action.payload.type === "member-removed") {
        const indicatorId = `kicked:${action.id}`;
        if (existingIds.has(indicatorId)) continue;
        const kickedLabel = memberLabelFromPublicKey(action.payload.memberPublicKey);
        dispatchGroupEvent({
          type: eventType,
          groupId,
          message: {
            id: indicatorId,
            senderPeerId: SYSTEM_SENDER_ID,
            senderDisplayName: "system",
            text: `${kickedLabel} was kicked from the group`,
            timestamp: action.timestamp,
          },
        });
        existingIds.add(indicatorId);
      }
    }

    for (const [targetActionId, edit] of latestEditByTargetId.entries()) {
      const target = canonicalMessagesById.get(targetActionId);
      if (!target) continue;
      if (target.authorPublicKeyHex !== edit.editorPublicKeyHex) continue;
      target.text = edit.newText;
    }
    for (const [targetActionId, deleted] of latestDeleteByTargetId.entries()) {
      const target = canonicalMessagesById.get(targetActionId);
      if (!target) continue;
      if (target.authorPublicKeyHex !== deleted.deleterPublicKeyHex) continue;
      target.deleted = true;
    }

    const canonicalActionMessages = [...canonicalMessagesById.values()]
      .filter((message) => !message.deleted)
      .sort((left, right) => {
        if (left.timestamp !== right.timestamp) return left.timestamp - right.timestamp;
        return left.id.localeCompare(right.id);
      });

    for (const actionMessage of canonicalActionMessages) {
      if (existingIds.has(actionMessage.id)) continue;
      const hasEquivalentOptimistic = (groupState().groups.get(groupId)?.messages ?? []).some((message) =>
        message.id !== actionMessage.id
        && message.senderPeerId === actionMessage.senderPeerId
        && message.text === actionMessage.text
        && Math.abs(message.timestamp - actionMessage.timestamp) <= ACTION_MESSAGE_DEDUP_MS);
      if (hasEquivalentOptimistic) continue;
      dispatchGroupEvent({
        type: eventType,
        groupId,
        message: {
          id: actionMessage.id,
          senderPeerId: actionMessage.senderPeerId,
          senderDisplayName: actionMessage.senderDisplayName,
          text: actionMessage.text,
          timestamp: actionMessage.timestamp,
        },
      });
      existingIds.add(actionMessage.id);
    }
    if (canHydrateMessages) {
      const canonicalById = new Map(
        canonicalActionMessages.map((message) => [message.id, message] as const),
      );
      const canonicalIds = new Set(canonicalActionMessages.map((message) => message.id));
      setGroupState((state) => {
        const group = state.groups.get(groupId);
        if (!group || group.messages.length === 0) return state;
        let changed = false;
        const nextMessages = group.messages
          .filter((message) => {
            if (message.senderPeerId === SYSTEM_SENDER_ID) return true;
            if (canonicalIds.has(message.id)) return true;
            if (ACTION_ID_PATTERN.test(message.id)) {
              changed = true;
              return false;
            }
            const isOptimisticDuplicate = canonicalActionMessages.some((canonical) =>
              canonical.senderPeerId === message.senderPeerId
              && canonical.text === message.text
              && Math.abs(canonical.timestamp - message.timestamp) <= ACTION_MESSAGE_DEDUP_MS);
            if (isOptimisticDuplicate) changed = true;
            return !isOptimisticDuplicate;
          })
          .map((message) => {
            const canonical = canonicalById.get(message.id);
            if (!canonical) return message;
            if (
              message.senderPeerId === canonical.senderPeerId
              && message.senderDisplayName === canonical.senderDisplayName
              && message.text === canonical.text
              && message.timestamp === canonical.timestamp
            ) {
              return message;
            }
            changed = true;
            return {
              ...message,
              senderPeerId: canonical.senderPeerId,
              senderDisplayName: canonical.senderDisplayName,
              text: canonical.text,
              timestamp: canonical.timestamp,
            };
          });
        if (!changed) return state;
        const groups = new Map(state.groups);
        groups.set(groupId, {
          ...group,
          messages: nextMessages,
        });
        const nextState: MultiGroupState = { ...state, groups };
        savePersistedGroups(nextState, chat);
        return nextState;
      });
    }
  };

  const activeGroupDiscoveryMetrics = () => {
    const activeId = groupState().activeGroupId;
    if (!activeId) return null;
    return peerDiscoveryMetricsByGroup().get(activeId) ?? null;
  };

  const activeJoinRetryEntry = (): JoinRetryEntry | null => {
    const activeId = groupState().activeGroupId;
    if (!activeId) return null;
    return joinRetryState().get(activeId) ?? null;
  };

  const activeSyncProgressByPeer = () => {
    const activeId = groupState().activeGroupId;
    if (!activeId) return new Map();
    return syncProgressState().get(activeId) ?? new Map();
  };

  createEffect(() => {
    const activeId = groupState().activeGroupId;
    refreshActionChainState();
    if (activeId) syncMessagesFromActionChain(activeId);
  });

  createEffect(() => {
    chatStatus();
    const activeGroup = getActiveGroup(groupState());
    const lastMessageId = activeGroup?.messages[activeGroup.messages.length - 1]?.id ?? null;
    const receiptCount = actionChainState()?.readReceipts.size ?? 0;
    lastMessageId;
    receiptCount;
    maybeSendReadReceiptForActiveGroup();
  });

  createEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const onPotentialRead = () => {
      maybeSendReadReceiptForActiveGroup();
    };
    window.addEventListener("focus", onPotentialRead);
    document.addEventListener("visibilitychange", onPotentialRead);
    onCleanup(() => {
      window.removeEventListener("focus", onPotentialRead);
      document.removeEventListener("visibilitychange", onPotentialRead);
    });
  });

  const dispatchGroupEvent = (event: Parameters<typeof transitionMultiGroup>[1]) => {
    setGroupState((s) => {
      const next = transitionMultiGroup(s, event);
      appendDiagnosticsEntry("group-state-event", {
        event,
        prevActiveGroupId: s.activeGroupId,
        nextActiveGroupId: next.activeGroupId,
        prevGroupCount: s.groups.size,
        nextGroupCount: next.groups.size,
      });
      savePersistedGroups(next, chat);
      return next;
    });
  };

  const setCallErrorForGroup = (groupId: string, error: string | null) => {
    setCallErrorByGroup((prev) => {
      const next = new Map(prev);
      if (error && error.trim().length > 0) {
        next.set(groupId, error);
      } else {
        next.delete(groupId);
      }
      return next;
    });
  };

  const refreshCallStateForGroup = (groupId: string) => {
    const currentChat = chat;
    setCallStatesByGroup((prev) => {
      const next = new Map(prev);
      const state = currentChat?.getCallState(groupId) ?? null;
      if (state) next.set(groupId, state);
      else next.delete(groupId);
      return next;
    });
    if (currentChat) {
      const state = currentChat.getCallState(groupId);
      if (state?.participants.has(currentChat.peerId)) {
        setCallErrorForGroup(groupId, null);
      }
    }
  };

  const formatCallDurationCompact = (durationMs: number): string => {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const formatCallDurationSummary = (durationMs: number): string => {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const appendCallTimelineEvent = (
    groupId: string,
    id: string,
    text: string,
    timestamp: number,
    source: "local" | "remote",
  ) => {
    const group = groupState().groups.get(groupId);
    if (!group) return;
    if (group.messages.some((message) => message.id === id)) return;
    dispatchGroupEvent({
      type: source === "local" ? "message-sent" : "message-received",
      groupId,
      message: {
        id,
        senderPeerId: SYSTEM_SENDER_ID,
        senderDisplayName: "system",
        text,
        timestamp,
      },
    });
  };

  const resolveCallParticipantLabel = (peerId: string): string => {
    const currentChat = chat;
    if (currentChat && peerId === currentChat.peerId) return "You";
    return directMessagePeerLabel(peerId)
      ?? contactsBook().get(peerId)?.nickname
      ?? contactsBook().get(peerId)?.selfName
      ?? `${peerId.slice(0, 12)}...`;
  };

  const getOrCreateCallMediaState = (groupId: string): GroupCallMediaState => {
    const existing = groupCallMedia.get(groupId);
    if (existing) return existing;
    const created: GroupCallMediaState = {
      localStream: null,
      peers: new Map(),
      localSpeakingAudioContext: null,
      localSpeakingAnalyser: null,
      localSpeakingSource: null,
      localSpeakingData: null,
      localSpeakingTimer: null,
    };
    groupCallMedia.set(groupId, created);
    return created;
  };

  const setParticipantSpeakingLevel = (groupId: string, peerId: string, level: number) => {
    const bounded = Number.isFinite(level)
      ? Math.max(0, Math.min(1, level))
      : 0;
    setCallSpeakingByGroup((prev) => {
      const next = new Map(prev);
      const perGroup = new Map(next.get(groupId) ?? []);
      const previousLevel = perGroup.get(peerId) ?? 0;
      const alpha = bounded >= previousLevel ? CALL_SPEAKING_RISE_ALPHA : CALL_SPEAKING_FALL_ALPHA;
      const smoothed = previousLevel + (bounded - previousLevel) * alpha;
      if (smoothed <= CALL_SPEAKING_MIN_LEVEL) perGroup.delete(peerId);
      else perGroup.set(peerId, smoothed);
      if (perGroup.size === 0) next.delete(groupId);
      else next.set(groupId, perGroup);
      return next;
    });
  };

  const clearSpeakingForGroup = (groupId: string) => {
    setCallSpeakingByGroup((prev) => {
      const next = new Map(prev);
      next.delete(groupId);
      return next;
    });
  };

  const setCallAudioOutputBlocked = (groupId: string, blocked: boolean) => {
    setCallAudioOutputBlockedByGroup((prev) => {
      const next = new Map(prev);
      if (blocked) next.set(groupId, true);
      else next.delete(groupId);
      return next;
    });
  };

  const isParticipantLocallyMuted = (groupId: string, peerId: string): boolean =>
    callLocallyMutedPeersByGroup().get(groupId)?.has(peerId) ?? false;

  const setParticipantLocallyMuted = (groupId: string, peerId: string, muted: boolean) => {
    setCallLocallyMutedPeersByGroup((prev) => {
      const next = new Map(prev);
      const perGroup = new Set(next.get(groupId) ?? []);
      if (muted) perGroup.add(peerId);
      else perGroup.delete(peerId);
      if (perGroup.size === 0) next.delete(groupId);
      else next.set(groupId, perGroup);
      return next;
    });
    const audioEl = groupCallMedia.get(groupId)?.peers.get(peerId)?.audioElement;
    if (audioEl) {
      audioEl.muted = muted;
    }
  };

  const readAnalyserLevel = (analyser: AnalyserNode, scratch: Uint8Array<ArrayBuffer>): number => {
    analyser.getByteTimeDomainData(scratch);
    let sum = 0;
    for (let idx = 0; idx < scratch.length; idx += 1) {
      const centered = (scratch[idx] - 128) / 128;
      sum += centered * centered;
    }
    return Math.sqrt(sum / scratch.length);
  };

  const normalizeSpeakingIndicatorLevel = (level: number): number => {
    if (!Number.isFinite(level) || level <= 0) return 0;
    const floor = SPEAKING_THRESHOLD * 0.08;
    const ceiling = SPEAKING_THRESHOLD * 1.4;
    const normalized = (level - floor) / Math.max(0.0001, ceiling - floor);
    return Math.max(0, Math.min(1, normalized));
  };

  const classifyCallLinkQuality = (pingMs: number | null): CallLinkQuality => {
    if (pingMs === null || !Number.isFinite(pingMs)) return "unknown";
    if (pingMs < 80) return "excellent";
    if (pingMs < 140) return "good";
    if (pingMs < 220) return "fair";
    return "poor";
  };

  const destroyPeerConnection = (
    groupId: string,
    peerId: string,
    entry: PeerConnectionEntry,
  ) => {
    if (entry.speakingTimer) {
      clearInterval(entry.speakingTimer);
      entry.speakingTimer = null;
    }
    try {
      entry.speakingSource?.disconnect();
    } catch {
      // noop
    }
    entry.speakingSource = null;
    try {
      entry.speakingAnalyser?.disconnect();
    } catch {
      // noop
    }
    entry.speakingAnalyser = null;
    entry.speakingData = null;
    if (entry.speakingAudioContext) {
      void entry.speakingAudioContext.close().catch(() => {});
    }
    entry.speakingAudioContext = null;
    setParticipantSpeakingLevel(groupId, peerId, 0);
    try {
      entry.pc.onicecandidate = null;
      entry.pc.ontrack = null;
      entry.pc.onnegotiationneeded = null;
      entry.pc.onconnectionstatechange = null;
      entry.pc.close();
    } catch {
      // noop
    }
    try {
      entry.audioElement.pause();
      entry.audioElement.srcObject = null;
      entry.audioElement.remove();
    } catch {
      // noop
    }
  };

  const teardownCallMediaForGroup = (groupId: string) => {
    const mediaState = groupCallMedia.get(groupId);
    if (!mediaState) return;
    for (const [peerId, entry] of mediaState.peers.entries()) {
      destroyPeerConnection(groupId, peerId, entry);
    }
    mediaState.peers.clear();
    if (mediaState.localSpeakingTimer) {
      clearInterval(mediaState.localSpeakingTimer);
      mediaState.localSpeakingTimer = null;
    }
    try {
      mediaState.localSpeakingSource?.disconnect();
    } catch {
      // noop
    }
    mediaState.localSpeakingSource = null;
    try {
      mediaState.localSpeakingAnalyser?.disconnect();
    } catch {
      // noop
    }
    mediaState.localSpeakingAnalyser = null;
    mediaState.localSpeakingData = null;
    if (mediaState.localSpeakingAudioContext) {
      void mediaState.localSpeakingAudioContext.close().catch(() => {});
    }
    mediaState.localSpeakingAudioContext = null;
    if (mediaState.localStream) {
      for (const track of mediaState.localStream.getTracks()) {
        track.stop();
      }
      mediaState.localStream = null;
    }
    groupCallMedia.delete(groupId);
    clearSpeakingForGroup(groupId);
    setCallAudioOutputBlocked(groupId, false);
    setCallLocallyMutedPeersByGroup((prev) => {
      const next = new Map(prev);
      next.delete(groupId);
      return next;
    });
  };

  const teardownAllCallMedia = () => {
    for (const groupId of [...groupCallMedia.keys()]) {
      teardownCallMediaForGroup(groupId);
    }
  };

  const setGroupMuted = (groupId: string, muted: boolean) => {
    setCallMutedByGroup((prev) => {
      const next = new Map(prev);
      next.set(groupId, muted);
      return next;
    });
  };

  const ensureLocalSpeakingDetection = (
    groupId: string,
    stream: MediaStream,
  ) => {
    const currentChat = chat;
    if (!currentChat) return;
    const mediaState = getOrCreateCallMediaState(groupId);
    if (mediaState.localSpeakingTimer) return;
    if (typeof AudioContext === "undefined") return;
    try {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const scratch = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      mediaState.localSpeakingAudioContext = audioContext;
      mediaState.localSpeakingSource = source;
      mediaState.localSpeakingAnalyser = analyser;
      mediaState.localSpeakingData = scratch;
      mediaState.localSpeakingTimer = setInterval(() => {
        const level = readAnalyserLevel(analyser, scratch);
        if (audioContext.state === "suspended") {
          void audioContext.resume().catch(() => {});
        }
        setParticipantSpeakingLevel(groupId, currentChat.peerId, level);
      }, CALL_SPEAKING_SAMPLE_INTERVAL_MS);
    } catch {
      // noop
    }
  };

  const ensureRemoteSpeakingDetection = (
    groupId: string,
    peerId: string,
    entry: PeerConnectionEntry,
  ) => {
    if (entry.speakingTimer) return;
    if (typeof AudioContext === "undefined") return;
    try {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(entry.remoteStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const scratch = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      entry.speakingAudioContext = audioContext;
      entry.speakingSource = source;
      entry.speakingAnalyser = analyser;
      entry.speakingData = scratch;
      entry.speakingTimer = setInterval(() => {
        const level = readAnalyserLevel(analyser, scratch);
        if (audioContext.state === "suspended") {
          void audioContext.resume().catch(() => {});
        }
        setParticipantSpeakingLevel(groupId, peerId, level);
      }, CALL_SPEAKING_SAMPLE_INTERVAL_MS);
    } catch {
      // noop
    }
  };

  const ensureLocalCallStream = async (groupId: string): Promise<MediaStream> => {
    const mediaState = getOrCreateCallMediaState(groupId);
    if (mediaState.localStream) {
      ensureLocalSpeakingDetection(groupId, mediaState.localStream);
      return mediaState.localStream;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Media devices are unavailable in this runtime");
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (error) {
      appendDiagnosticsEntry("call-getusermedia-failed", {
        groupId,
        name: error instanceof DOMException ? error.name : error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    const muted = callMutedByGroup().get(groupId) ?? false;
    for (const track of stream.getAudioTracks()) {
      track.enabled = !muted;
    }
    mediaState.localStream = stream;
    ensureLocalSpeakingDetection(groupId, stream);
    setCallErrorForGroup(groupId, null);
    return stream;
  };

  const attachLocalTracks = (pc: RTCPeerConnection, stream: MediaStream) => {
    for (const track of stream.getTracks()) {
      const alreadyAdded = pc.getSenders().some((sender) => sender.track?.id === track.id);
      if (!alreadyAdded) {
        pc.addTrack(track, stream);
      }
    }
  };

  const maybeSendOffer = async (
    groupId: string,
    remotePeerId: string,
    entry: PeerConnectionEntry,
  ) => {
    const currentChat = chat;
    if (!currentChat) return;
    if (currentChat.peerId.localeCompare(remotePeerId) >= 0) return;
    if (entry.pc.signalingState !== "stable") return;
    entry.makingOffer = true;
    try {
      const offer = await entry.pc.createOffer();
      await entry.pc.setLocalDescription(offer);
      const local = entry.pc.localDescription;
      if (!local?.sdp) return;
      await currentChat.sendMediaSignal(groupId, remotePeerId, {
        type: "offer",
        sdp: local.sdp,
      });
    } catch {
      // noop
    } finally {
      entry.makingOffer = false;
    }
  };

  const ensurePeerConnection = async (
    groupId: string,
    remotePeerId: string,
  ): Promise<PeerConnectionEntry> => {
    const mediaState = getOrCreateCallMediaState(groupId);
    const existing = mediaState.peers.get(remotePeerId);
    if (existing) return existing;

    const currentChat = chat;
    if (!currentChat) throw new Error("Chat not initialized");
    const localStream = await ensureLocalCallStream(groupId);
    const pc = new RTCPeerConnection({ iceServers: WEBRTC_ICE_SERVERS });
    const remoteStream = new MediaStream();
    const audioElement = document.createElement("audio");
    audioElement.autoplay = true;
    audioElement.preload = "auto";
    audioElement.setAttribute("playsinline", "true");
    audioElement.style.display = "none";
    audioElement.muted = isParticipantLocallyMuted(groupId, remotePeerId);
    audioElement.srcObject = remoteStream;
    document.body.appendChild(audioElement);

    const entry: PeerConnectionEntry = {
      pc,
      remoteStream,
      audioElement,
      makingOffer: false,
      polite: currentChat.peerId.localeCompare(remotePeerId) > 0,
      speakingAudioContext: null,
      speakingAnalyser: null,
      speakingSource: null,
      speakingData: null,
      speakingTimer: null,
    };
    mediaState.peers.set(remotePeerId, entry);

    attachLocalTracks(pc, localStream);
    pc.ontrack = (event) => {
      const incomingTracks = event.streams[0]?.getTracks();
      const tracksToAdd = incomingTracks && incomingTracks.length > 0
        ? incomingTracks
        : [event.track];
      for (const track of tracksToAdd) {
        const exists = remoteStream.getTracks().some((existing) => existing.id === track.id);
        if (!exists) remoteStream.addTrack(track);
      }
      void audioElement.play().then(() => {
        setCallAudioOutputBlocked(groupId, false);
      }).catch((error) => {
        appendDiagnosticsEntry("call-audio-play-failed", {
          groupId,
          peerId: remotePeerId,
          name: error instanceof DOMException ? error.name : error instanceof Error ? error.name : "unknown",
          message: error instanceof Error ? error.message : String(error),
        });
        setCallAudioOutputBlocked(groupId, true);
      });
      ensureRemoteSpeakingDetection(groupId, remotePeerId, entry);
    };
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const candidate = event.candidate;
      void currentChat.sendMediaSignal(groupId, remotePeerId, {
        type: "ice-candidate",
        candidate: candidate.candidate,
        sdpMLineIndex: candidate.sdpMLineIndex ?? null,
        sdpMid: candidate.sdpMid ?? null,
      }).catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        const current = groupCallMedia.get(groupId)?.peers.get(remotePeerId);
        if (!current) return;
        destroyPeerConnection(groupId, remotePeerId, current);
        groupCallMedia.get(groupId)?.peers.delete(remotePeerId);
      }
    };

    await maybeSendOffer(groupId, remotePeerId, entry);
    return entry;
  };

  const reconcileCallMediaForGroup = async (groupId: string) => {
    const currentChat = chat;
    if (!currentChat) return;
    const state = currentChat.getCallState(groupId);
    if (!state || !state.participants.has(currentChat.peerId)) {
      teardownCallMediaForGroup(groupId);
      return;
    }
    try {
      const localStream = await ensureLocalCallStream(groupId);
      const muted = callMutedByGroup().get(groupId) ?? false;
      for (const track of localStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCallErrorForGroup(groupId, message);
      return;
    }

    const remotePeerIds = [...state.participants.keys()].filter((peerId) => peerId !== currentChat.peerId);
    const mediaState = getOrCreateCallMediaState(groupId);
    for (const peerId of remotePeerIds) {
      await ensurePeerConnection(groupId, peerId);
    }
    for (const [peerId, entry] of [...mediaState.peers.entries()]) {
      if (remotePeerIds.includes(peerId)) continue;
      destroyPeerConnection(groupId, peerId, entry);
      mediaState.peers.delete(peerId);
    }
  };

  const handleMediaSignal = async (event: MediaSignalEvent) => {
    const currentChat = chat;
    if (!currentChat) return;
    if (event.senderPeerId === currentChat.peerId) return;
    const mediaState = getOrCreateCallMediaState(event.groupId);
    const entry = await ensurePeerConnection(event.groupId, event.senderPeerId);
    const pc = entry.pc;
    const message: SignalMessage = event.message;

    try {
      if (message.type === "offer") {
        const offerCollision = entry.makingOffer || pc.signalingState !== "stable";
        if (offerCollision && !entry.polite) return;
        await pc.setRemoteDescription({ type: "offer", sdp: message.sdp });
        const stream = await ensureLocalCallStream(event.groupId);
        attachLocalTracks(pc, stream);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const local = pc.localDescription;
        if (!local?.sdp) return;
        await currentChat.sendMediaSignal(event.groupId, event.senderPeerId, {
          type: "answer",
          sdp: local.sdp,
        });
        return;
      }

      if (message.type === "answer") {
        if (pc.signalingState !== "have-local-offer") return;
        await pc.setRemoteDescription({ type: "answer", sdp: message.sdp });
        return;
      }

      if (message.type === "ice-candidate") {
        await pc.addIceCandidate({
          candidate: message.candidate,
          sdpMLineIndex: message.sdpMLineIndex,
          sdpMid: message.sdpMid,
        });
        return;
      }

      if (message.type === "hangup") {
        const existing = mediaState.peers.get(event.senderPeerId);
        if (!existing) return;
        destroyPeerConnection(event.groupId, event.senderPeerId, existing);
        mediaState.peers.delete(event.senderPeerId);
      }
    } catch {
      // noop
    }
  };

  onMount(async () => {
    callClockInterval = setInterval(() => {
      setCallClockMs(Date.now());
    }, 1_000);
    try {
      const store = await openAccountStore();
      try {
        const existingKey = await store.getAccountKey();
        if (existingKey) {
          const backedUp = await store.isBackedUp();
          const exported = exportAccountKey(existingKey);
          setSeedPhrase(exported.seedPhrase);

          const persistedSettings = await createPersistedSettingsDocument(existingKey.publicKey);
          const name = getDisplayName(persistedSettings.doc);
          if (name) setDisplayNameState(name);
          await persistedSettings.destroy();

          setOnboardingState(
            transition(onboardingState(), {
              type: "key-found",
              accountKey: existingKey,
              backedUp,
            }),
          );
        } else {
          setOnboardingState(
            transition(onboardingState(), { type: "no-key-found" }),
          );
        }
      } finally {
        store.close();
      }
    } catch {
      setOnboardingState(
        transition(onboardingState(), { type: "no-key-found" }),
      );
    }
  });

  const handleCreateAccount = async () => {
    try {
      const accountKey = generateAccountKey();
      const exported = exportAccountKey(accountKey);
      setSeedPhrase(exported.seedPhrase);

      const store = await openAccountStore();
      try {
        await store.saveAccountKey(accountKey);
      } finally {
        store.close();
      }

      setOnboardingState(
        transition(onboardingState(), {
          type: "key-generated",
          accountKey,
        }),
      );
      appendDiagnosticsEntry("account-created", {
        publicKeyHex: toHex(new Uint8Array(accountKey.publicKey)),
      });
    } catch {
      appendDiagnosticsEntry("account-create-failed", {});
      // noop
    }
  };

  const handleImportAccount = async (phrase: string) => {
    try {
      const accountKey = importAccountKey(phrase);
      setSeedPhrase(phrase);

      const store = await openAccountStore();
      try {
        await store.saveAccountKey(accountKey);
      } finally {
        store.close();
      }

      setOnboardingState(
        transition(onboardingState(), {
          type: "key-imported",
          accountKey,
        }),
      );
      appendDiagnosticsEntry("account-imported", {
        publicKeyHex: toHex(new Uint8Array(accountKey.publicKey)),
      });
    } catch {
      appendDiagnosticsEntry("account-import-failed", {});
      // noop
    }
  };

  const handleDisplayNameSet = async (
    name: string,
    options?: { readonly usePublicBootstrapNodes?: boolean },
  ) => {
    const state = onboardingState();
    if (state.status !== "display-name-prompt") return;

    try {
      if (typeof options?.usePublicBootstrapNodes === "boolean") {
        setBootstrapPreference(options.usePublicBootstrapNodes);
      }
      const persistedSettings = await createPersistedSettingsDocument(state.accountKey.publicKey);
      try {
        setDisplayName(persistedSettings.doc, name);
        setDisplayNameState(name);
        if (chat) {
          upsertContact(chat.peerId, { selfName: name });
        }
      } finally {
        await persistedSettings.destroy();
      }

      setOnboardingState(
        transition(onboardingState(), {
          type: "display-name-set",
          displayName: name,
        }),
      );
      appendDiagnosticsEntry("onboarding-display-name-set", {
        displayName: name,
      });
    } catch {
      appendDiagnosticsEntry("onboarding-display-name-set-failed", {
        displayName: name,
      });
      // noop
    }
  };

  const handleProfileDisplayNameSave = async (name: string): Promise<string | null> => {
    const key = getCurrentAccountKey();
    if (!key) return "No account key loaded";
    const trimmed = name.trim();
    if (trimmed.length === 0) return "Name cannot be empty";

    try {
      const persistedSettings = await createPersistedSettingsDocument(key.publicKey);
      try {
        setDisplayName(persistedSettings.doc, trimmed);
        setDisplayNameState(trimmed);
        if (chat) {
          upsertContact(chat.peerId, { selfName: trimmed });
        }
      } finally {
        await persistedSettings.destroy();
      }
      appendDiagnosticsEntry("profile-name-updated", {
        displayName: trimmed,
      });
      return null;
    } catch (error) {
      appendDiagnosticsEntry("profile-name-update-failed", {
        displayName: trimmed,
        error: error instanceof Error ? error.message : String(error),
      });
      return error instanceof Error ? error.message : "Failed to save profile";
    }
  };

  const handleBackupConfirmed = async () => {
    try {
      const store = await openAccountStore();
      try {
        await store.setBackedUp(true);
      } finally {
        store.close();
      }

      setOnboardingState(
        transition(onboardingState(), { type: "backup-completed" }),
      );
      appendDiagnosticsEntry("backup-confirmed", {});
    } catch {
      appendDiagnosticsEntry("backup-confirm-failed", {});
      // noop
    }
  };

  const restorePersistedGroups = () => {
    const persisted = loadPersistedGroups();
    if (!persisted || persisted.joinedGroups.length === 0) {
      return;
    }

    const actionChainSet = new Set(persisted.actionChainGroups);

    for (const groupId of persisted.joinedGroups) {
      chat?.joinGroup(groupId);
    }

    const chainsJson = localStorage.getItem(ACTION_CHAINS_STORAGE_KEY);
    if (chainsJson && chat) {
      const chains = deserializeActionChains(chainsJson);
      for (const [groupId, envelopes] of chains) {
        chat.loadActionChain(groupId, envelopes);
      }
    }

    for (const groupId of persisted.joinedGroups) {
      if (actionChainSet.has(groupId)) {
        const groupName = persisted.groupNames[groupId] ?? "Unnamed Group";
        dispatchGroupEvent({ type: "group-created", groupId, groupName });
      } else {
        dispatchGroupEvent({ type: "group-joined", groupId });
      }

      const messages = persisted.messages[groupId];
      if (messages) {
        for (const msg of messages) {
          dispatchGroupEvent({ type: "message-sent", groupId, message: msg });
        }
      }
      syncMessagesFromActionChain(groupId, { historical: true });
    }

    if (persisted.activeGroupId) {
      dispatchGroupEvent({ type: "group-selected", groupId: persisted.activeGroupId });
    }

    refreshActionChainState();
  };

  const startChat = async (accountKey: AccountKey) => {
    try {
      setChatError(null);
      const bridge = hostBridge();
      const selectedTransportProfile = ENV_TRANSPORT_PROFILE
        ?? (hasDesktopBridge() ? "desktop" : hasAndroidBridge() ? "android" : "websocket");
      const runtimeAdapter = usePublicBootstrapNodes()
        ? createDefaultRuntimeAdapter(selectedTransportProfile)
        : {
            ...createDefaultRuntimeAdapter(selectedTransportProfile),
            resolveBootstrapPeers: (initialBootstrapPeers: readonly string[]) => {
              const unique = new Set<string>();
              const result: string[] = [];
              for (const addr of initialBootstrapPeers) {
                const trimmed = addr.trim();
                if (trimmed.length === 0 || unique.has(trimmed)) continue;
                unique.add(trimmed);
                result.push(trimmed);
              }
              return result;
            },
          };
      const bootstrapPeers = ENV_RELAY_MULTIADDR ? [ENV_RELAY_MULTIADDR] : [];
      if (bridge?.getRelayState) {
        const relayState = await bridge.getRelayState().catch(() => null);
        if (relayState?.running) {
          setDesktopRelayState(relayState);
          for (const addr of relayState.listenAddrs) {
            if (
              (selectedTransportProfile === "websocket" || selectedTransportProfile === "android")
              && !isWebSocketCompatibleBootstrapAddr(addr)
            ) {
              continue;
            }
            if (!bootstrapPeers.includes(addr)) bootstrapPeers.push(addr);
          }
        }
      }
      const initialRelayHints = loadRelayHints();
      type PeerPathCacheStoreCompat = {
        readonly getPeerPathCache?: () => Promise<ReadonlyMap<string, readonly string[]>>;
        readonly savePeerPathCache?: (cache: ReadonlyMap<string, readonly string[]>) => Promise<void>;
        readonly getRelayContactBook?: () => Promise<RelayContactBook>;
        readonly saveRelayContactBook?: (book: RelayContactBook) => Promise<void>;
        readonly getJoinRetryState?: () => Promise<JoinRetryState>;
        readonly saveJoinRetryState?: (state: JoinRetryState) => Promise<void>;
        readonly getSyncProgressState?: () => Promise<SyncProgressState>;
        readonly saveSyncProgressState?: (state: SyncProgressState) => Promise<void>;
        readonly getContactsBook?: () => Promise<ContactsBook>;
        readonly getBlockedPeerIds?: () => Promise<ReadonlySet<string>>;
      };

      const store = await openAccountStore();
      let peerPrivateKey: Uint8Array | undefined;
      let initialPeerPathCache: ReadonlyMap<string, readonly string[]> = new Map();
      let initialRelayContactBook: RelayContactBook = new Map();
      let initialJoinRetryState: JoinRetryState = new Map();
      let initialSyncProgressState: SyncProgressState = new Map();
      let initialContactsBook: ContactsBook = new Map();
      let initialBlockedPeerIds: ReadonlySet<string> = new Set();
      try {
        const savedKey = await store.getPeerPrivateKey();
        if (savedKey) peerPrivateKey = savedKey;
        const compatStore = store as AccountStore & PeerPathCacheStoreCompat;
        if (typeof compatStore.getPeerPathCache === "function") {
          initialPeerPathCache = await compatStore.getPeerPathCache();
        }
        if (typeof compatStore.getRelayContactBook === "function") {
          initialRelayContactBook = await compatStore.getRelayContactBook();
        }
        if (typeof compatStore.getJoinRetryState === "function") {
          initialJoinRetryState = await compatStore.getJoinRetryState();
        }
        if (typeof compatStore.getSyncProgressState === "function") {
          initialSyncProgressState = await compatStore.getSyncProgressState();
        }
        if (typeof compatStore.getContactsBook === "function") {
          initialContactsBook = await compatStore.getContactsBook();
        }
        if (typeof compatStore.getBlockedPeerIds === "function") {
          initialBlockedPeerIds = await compatStore.getBlockedPeerIds();
        }
      } finally {
        store.close();
      }

      setContactsBook(initialContactsBook);
      setBlockedPeerIds(initialBlockedPeerIds);
      setSyncProgressState(initialSyncProgressState);
      setPeerPathCache(initialPeerPathCache);
      setRelayContactBook(initialRelayContactBook);

      const initialPublicKeyToPeerId = loadPublicKeyToPeerId();
      const initialPendingJoins = loadPendingJoins();

      const persistPeerPathCache = (cache: ReadonlyMap<string, readonly string[]>) => {
        void (async () => {
          const pathStore = await openAccountStore();
          try {
            const compatStore = pathStore as AccountStore & PeerPathCacheStoreCompat;
            if (typeof compatStore.savePeerPathCache === "function") {
              await compatStore.savePeerPathCache(cache);
            }
          } finally {
            pathStore.close();
          }
        })();
      };

      const persistRelayContactBook = (book: RelayContactBook) => {
        void (async () => {
          const relayStore = await openAccountStore();
          try {
            const compatStore = relayStore as AccountStore & PeerPathCacheStoreCompat;
            if (typeof compatStore.saveRelayContactBook === "function") {
              await compatStore.saveRelayContactBook(book);
            }
          } finally {
            relayStore.close();
          }
        })();
      };

      const persistJoinRetryState = (state: JoinRetryState) => {
        void (async () => {
          const stateStore = await openAccountStore();
          try {
            const compatStore = stateStore as AccountStore & PeerPathCacheStoreCompat;
            if (typeof compatStore.saveJoinRetryState === "function") {
              await compatStore.saveJoinRetryState(state);
            }
          } finally {
            stateStore.close();
          }
        })();
      };

      const persistSyncProgressState = (state: SyncProgressState) => {
        void (async () => {
          const stateStore = await openAccountStore();
          try {
            const compatStore = stateStore as AccountStore & PeerPathCacheStoreCompat;
            if (typeof compatStore.saveSyncProgressState === "function") {
              await compatStore.saveSyncProgressState(state);
            }
          } finally {
            stateStore.close();
          }
        })();
      };

      chat = await createMultiGroupChat({
        accountKey,
        peerPrivateKey,
        initialPublicKeyToPeerId,
        initialPeerPathCache,
        initialRelayContactBook,
        initialJoinRetryState,
        initialSyncProgressState,
        initialRelayHints,
        bootstrapPeers,
        useTransports: selectedTransportProfile,
        runtimeAdapter,
        discoveryProfile: "aggressive",
        onRelayPoolStateChange: setRelayPoolState,
        onGroupDiscoveryStateChange: setGroupDiscoveryState,
        onRelayCandidateStateChange: setRelayCandidateState,
        onRelayContactBookChange: (book) => {
          setRelayContactBook(book);
          persistRelayContactBook(book);
        },
        onPinnedPeerWatchdogStateChange: setPinnedPeerWatchdogState,
        onRelayReservationStateChange: (state) => {
          setRelayReservationState(state);
          saveRelayHints(pickRelayHintsFromState(state));
        },
        onConnectionMetricsChange: setConnectionMetrics,
        onPeerDiscoveryMetricsChange: (metrics) => {
          setPeerDiscoveryMetricsByGroup((prev) => {
            const next = new Map(prev);
            next.set(metrics.groupId, metrics);
            return next;
          });
        },
        onPublicKeyToPeerIdChange: (map) => {
          setPublicKeyToPeerIdMap(map);
          savePublicKeyToPeerId(map);
          for (const peerId of map.values()) {
            upsertContact(peerId);
          }
        },
        onPeerPathCacheChange: (cache) => {
          setPeerPathCache(cache);
          persistPeerPathCache(cache);
        },
        onJoinRetryStateChange: (state) => {
          setJoinRetryState(state);
          persistJoinRetryState(state);
        },
        onSyncProgressStateChange: (state) => {
          setSyncProgressState(state);
          persistSyncProgressState(state);
        },
        onApprovalReceived: (groupId) => {
          dispatchGroupEvent({ type: "approval-received", groupId });
          refreshActionChainState();
          syncMessagesFromActionChain(groupId);
        },
        getDisplayName: () => displayName() || undefined,
        onProfileAnnounce: (peerId, announcedName) => {
          upsertContact(peerId, { selfName: announcedName });
        },
      });

      setPeerPathCache(chat.getPeerPathCache());
      setRelayContactBook(chat.getRelayContactBook());
      setPinnedPeerWatchdogState(chat.getPinnedPeerWatchdogState());
      setConnectionReasonCounts(chat.getConnectionReasonCounts());

      setChatStatus("connected");
      setChatError(null);

      if (!peerPrivateKey) {
        const saveStore = await openAccountStore();
        try {
          await saveStore.savePeerPrivateKey(chat.getPeerPrivateKey());
        } finally {
          saveStore.close();
        }
      }

      if (initialPendingJoins.size > 0) {
        setPendingJoinsMap(initialPendingJoins);
      }

      upsertContact(chat.peerId, { selfName: displayName() || null });

      restorePersistedGroups();
      refreshNetworkStatus();

      chat.onPeerChange(() => {
        refreshNetworkStatus();
        const current = chat?.getNetworkStatus();
        if (current) {
          appendDiagnosticsEntry("peer-change", {
            connectedPeerIds: current.peers.map((peer) => peer.peerId),
            subscriberCount: current.subscriberCount,
          });
        }
      });

      statusInterval = setInterval(() => {
        refreshNetworkStatus();
        if (chat) {
          setConnectionReasonCounts(chat.getConnectionReasonCounts());
          setPinnedPeerWatchdogState(chat.getPinnedPeerWatchdogState());
        }
        const activeId = groupState().activeGroupId;
        if (activeId) syncMessagesFromActionChain(activeId);
      }, 3000);

      void runPingSweep();
      pingInterval = setInterval(() => void runPingSweep(), PING_SWEEP_INTERVAL);

      unsubscribeEvents = chat.onEvent((evt) => {
        setEventLog((prev) => [...prev.slice(-(MAX_EVENTS - 1)), evt]);
        appendDiagnosticsEntry("network-event", evt);
      });

      unsubscribeMessage = chat.onMessage((msg) => {
        appendDiagnosticsEntry("group-message", {
          groupId: msg.groupId,
          senderPeerId: msg.senderPeerId,
          senderDisplayName: msg.senderDisplayName,
          timestamp: msg.timestamp,
          textPreview: msg.text.slice(0, 160),
        });
        const liveChat = chat;
        if (liveChat) {
          void deriveDirectMessageGroupId(liveChat.peerId, msg.senderPeerId).then((dmGroupId) => {
            if (dmGroupId === msg.groupId) {
              setDirectMessagePeerForGroup(msg.groupId, msg.senderPeerId);
            }
          }).catch(() => {});
        }
        const dmPeerId = directMessagePeersByGroup().get(msg.groupId);
        if (dmPeerId && blockedPeerIds().has(msg.senderPeerId)) {
          return;
        }
        if (dmPeerId && dmPeerId === msg.senderPeerId) {
        }
        maybeRequestProfileSync(msg.senderPeerId);
        removeOutgoingDirectMessageRequests((entry) =>
          entry.groupId === msg.groupId && entry.targetPeerId === msg.senderPeerId);
        upsertContact(msg.senderPeerId, {
          selfName: msg.senderDisplayName,
          groupId: msg.groupId,
          lastSeenAt: msg.timestamp,
        });
        if (!hasGroup(groupState(), msg.groupId)) {
          const chainState = chat?.getActionChainState(msg.groupId);
          dispatchGroupEvent({
            type: "group-joined",
            groupId: msg.groupId,
            groupName: chainState?.groupName,
            hasActionChain: true,
          });
        }
        dispatchGroupEvent({
          type: "message-received",
          groupId: msg.groupId,
          message: msg,
        });

        const bridge = hostBridge();
        if (bridge?.notifyMessage && msg.senderPeerId !== liveChat?.peerId) {
            const focused = typeof document !== "undefined" && !document.hidden && document.hasFocus();
            if (!focused && msg.groupId !== groupState().activeGroupId) {
              const groupName = groupState().groups.get(msg.groupId)?.groupName ?? "Anypost";
              void bridge.notifyMessage({
                title: msg.senderDisplayName || "New message",
                body: `${groupName}: ${parseQuotedMessage(msg.text).body}`,
                groupId: msg.groupId,
                senderPeerId: msg.senderPeerId,
              });
            }
        }
      });

      unsubscribeJoinRequests = chat.onJoinRequest((evt) => {
        appendDiagnosticsEntry("join-request", {
          groupId: evt.groupId,
          senderPeerId: evt.senderPeerId,
          autoApproved: evt.autoApproved,
          alreadyMember: evt.alreadyMember,
          inviteTokenId: evt.inviteTokenId ?? null,
          inviteValidationError: evt.inviteValidationError ?? null,
        });
        upsertContact(evt.senderPeerId, { groupId: evt.groupId });
        if (evt.autoApproved || evt.alreadyMember) return;
        const pubKeyHex = toHex(new Uint8Array(evt.requesterPublicKey));
        setPendingJoinsMap((prev) => {
          const existing = prev.get(evt.groupId) ?? [];
          if (existing.some((p) => p.publicKeyHex === pubKeyHex)) return prev;
          const updated = new Map(prev);
          updated.set(evt.groupId, [...existing, { publicKeyHex: pubKeyHex, publicKey: new Uint8Array(evt.requesterPublicKey) }]);
          savePendingJoins(updated);
          return updated;
        });
      });

      unsubscribeDirectMessageRequests = chat.onDirectMessageRequest((evt) => {
        appendDiagnosticsEntry("dm-request-inbound", {
          requestId: evt.requestId,
          senderPeerId: evt.senderPeerId,
          targetPeerId: evt.targetPeerId,
          groupId: evt.groupId,
          groupName: evt.groupName,
          sentAt: evt.sentAt,
        });
        if (blockedPeerIds().has(evt.senderPeerId)) return;
        upsertContact(evt.senderPeerId, { groupId: evt.groupId });
        maybeRequestProfileSync(evt.senderPeerId);
        setDirectMessagePeerForGroup(evt.groupId, evt.senderPeerId);

        const reciprocalToOutgoing = outgoingDirectMessageRequests().some((entry) =>
          entry.groupId === evt.groupId && entry.targetPeerId === evt.senderPeerId);
        if (reciprocalToOutgoing && chat) {
          void (async () => {
            const currentChat = chat;
            if (!currentChat) return;
            const decoded = decodeGroupInvite(evt.inviteCode);
            if (!decoded.success) {
              appendDiagnosticsEntry("dm-request-reciprocal-invalid-invite", {
                requestId: evt.requestId,
                senderPeerId: evt.senderPeerId,
                groupId: evt.groupId,
              });
              return;
            }
            try {
              const { groupId } = await currentChat.joinViaInvite(decoded.data);
              const chainState = currentChat.getActionChainState(groupId);
              if (!hasGroup(groupState(), groupId)) {
                dispatchGroupEvent({
                  type: "group-joined",
                  groupId,
                  groupName: chainState?.groupName || "Direct Message",
                  hasActionChain: true,
                });
              }
              refreshActionChainState();
              syncMessagesFromActionChain(groupId);
            } catch (error) {
              appendDiagnosticsEntry("dm-request-reciprocal-join-failed", {
                requestId: evt.requestId,
                senderPeerId: evt.senderPeerId,
                groupId: evt.groupId,
                error: error instanceof Error ? error.message : String(error),
              });
              return;
            }
            removeOutgoingDirectMessageRequests((entry) =>
              entry.groupId === evt.groupId && entry.targetPeerId === evt.senderPeerId);
            appendDiagnosticsEntry("dm-request-reciprocal-accepted", {
              requestId: evt.requestId,
              senderPeerId: evt.senderPeerId,
              groupId: evt.groupId,
            });
          })();
          return;
        }

        upsertPendingDirectMessageRequest(evt);
      });

      unsubscribeCallEvents = chat.onCallEvent((evt) => {
        appendDiagnosticsEntry("call-event", evt);
        const previousState = callStatesByGroup().get(evt.groupId) ?? null;
        const previousParticipantCount = previousState?.participants.size ?? 0;
        refreshCallStateForGroup(evt.groupId);
        const currentCallState = chat?.getCallState(evt.groupId) ?? null;
        const currentParticipantCount = currentCallState?.participants.size ?? 0;
        if (currentCallState) {
          const tracked = callSessionByGroup.get(evt.groupId);
          if (!tracked || tracked.startedAt !== currentCallState.startedAt) {
            callSessionByGroup.set(evt.groupId, {
              startedAt: currentCallState.startedAt,
            });
          }
        }

        if (previousParticipantCount === 0 && currentParticipantCount > 0) {
          const startedAt = currentCallState?.startedAt ?? evt.sentAt;
          callSessionByGroup.set(evt.groupId, { startedAt });
          appendCallTimelineEvent(
            evt.groupId,
            `call-started:${evt.groupId}:${startedAt}`,
            `${resolveCallParticipantLabel(evt.senderPeerId)} started a call`,
            startedAt,
            evt.source,
          );
        }

        if (previousParticipantCount > 0 && currentParticipantCount === 0) {
          const trackedSession = callSessionByGroup.get(evt.groupId);
          const startedAt = trackedSession?.startedAt
            ?? previousState?.startedAt
            ?? evt.sentAt;
          const durationMs = Math.max(0, evt.sentAt - startedAt);
          appendCallTimelineEvent(
            evt.groupId,
            `call-ended:${evt.groupId}:${startedAt}`,
            `Call ended after ${formatCallDurationSummary(durationMs)}`,
            evt.sentAt,
            evt.source,
          );
          callSessionByGroup.delete(evt.groupId);
        }

        if (!currentCallState) {
          callSessionByGroup.delete(evt.groupId);
        }

        if (
          evt.source === "remote" &&
          evt.action === "call-ring" &&
          (evt.targetPeerId === chat?.peerId || evt.targetPeerId === undefined)
        ) {
          setIncomingCallsByGroup((prev) => {
            const next = new Map(prev);
            next.set(evt.groupId, {
              senderPeerId: evt.senderPeerId,
              sentAt: evt.sentAt,
              targeted: evt.targetPeerId === chat?.peerId,
            });
            return next;
          });
        }
        if (evt.action === "call-end" || evt.action === "call-decline") {
          setIncomingCallsByGroup((prev) => {
            const next = new Map(prev);
            next.delete(evt.groupId);
            return next;
          });
        }
        if (evt.action === "call-join" && evt.senderPeerId === chat?.peerId) {
          setIncomingCallsByGroup((prev) => {
            const next = new Map(prev);
            next.delete(evt.groupId);
            return next;
          });
        }
        void reconcileCallMediaForGroup(evt.groupId);
      });

      unsubscribeMediaSignals = chat.onMediaSignal((evt) => {
        appendDiagnosticsEntry("call-media-signal", {
          groupId: evt.groupId,
          senderPeerId: evt.senderPeerId,
          type: evt.message.type,
        });
        void handleMediaSignal(evt);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendDiagnosticsEntry("start-chat-failed", {
        error: message,
      });
      console.error("[anypost-web] startChat failed", error);
      setChatError(message);
      setChatStatus("disconnected");
    }
  };

  onCleanup(() => {
    unsubscribeMessage?.();
    unsubscribeEvents?.();
    unsubscribeJoinRequests?.();
    unsubscribeDirectMessageRequests?.();
    unsubscribeCallEvents?.();
    unsubscribeMediaSignals?.();
    if (statusInterval) clearInterval(statusInterval);
    if (pingInterval) clearInterval(pingInterval);
    if (callClockInterval) clearInterval(callClockInterval);
    clearDiagnosticsTimers();
    uninstallDiagnosticsRuntimeCapture();
    const artifact = diagnosticsRecorder().artifact;
    if (artifact?.url) {
      URL.revokeObjectURL(artifact.url);
    }
    teardownAllCallMedia();
    chat?.stop();
  });

  onMount(() => {
    if (typeof window === "undefined") return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const syncKeyboardInset = () => {
      const inset = Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop));
      setKeyboardInsetPx(inset > 50 ? Math.round(inset) : 0);
    };
    syncKeyboardInset();
    viewport.addEventListener("resize", syncKeyboardInset);
    viewport.addEventListener("scroll", syncKeyboardInset);
    onCleanup(() => {
      viewport.removeEventListener("resize", syncKeyboardInset);
      viewport.removeEventListener("scroll", syncKeyboardInset);
      setKeyboardInsetPx(0);
    });
  });

  let autoConnectFired = false;

  createEffect(() => {
    const shouldConnect = decideAutoConnect({
      onboardingStatus: onboardingState().status,
      chatStatus: chatStatus(),
    });

    if (shouldConnect && !autoConnectFired) {
      autoConnectFired = true;
      const key = getCurrentAccountKey();
      if (key) void startChat(key);
    }
  });

  createEffect(() => {
    if (chatStatus() !== "connected" || !chat) return;
    void runOutgoingDirectMessageRequestSweep();
    const interval = setInterval(() => {
      void runOutgoingDirectMessageRequestSweep();
    }, OUTGOING_DM_RETRY_SWEEP_MS);
    onCleanup(() => clearInterval(interval));
  });

  createEffect(() => {
    groupState().activeGroupId;
    setReplyTargetMessage(null);
    setEditTargetMessage(null);
    setMessageDraft("");
  });

  createEffect(() => {
    const activeId = groupState().activeGroupId;
    if (!activeId || !chat) return;
    refreshCallStateForGroup(activeId);
    void reconcileCallMediaForGroup(activeId);
  });

  createEffect(() => {
    const mutedByGroup = callMutedByGroup();
    for (const [groupId, mediaState] of groupCallMedia.entries()) {
      const muted = mutedByGroup.get(groupId) ?? false;
      for (const track of mediaState.localStream?.getAudioTracks() ?? []) {
        track.enabled = !muted;
      }
    }
  });

  createEffect(() => {
    const joined = new Set(groupState().joinOrder);
    for (const groupId of [...groupCallMedia.keys()]) {
      if (joined.has(groupId)) continue;
      teardownCallMediaForGroup(groupId);
      setIncomingCallsByGroup((prev) => {
        const next = new Map(prev);
        next.delete(groupId);
        return next;
      });
    }
  });

  const handleSendMessage = (text: string) => {
    const currentChat = chat;
    const activeGroup = getActiveGroup(groupState());
    if (!currentChat || !activeGroup) return;
    const trimmedText = text.trim();
    if (trimmedText.length === 0) return;

    const groupId = activeGroup.groupId;
    const editTarget = editTargetMessage();
    const replyTarget = replyTargetMessage();
    appendDiagnosticsEntry("message-send-requested", {
      groupId,
      mode: editTarget ? "edit" : (replyTarget ? "reply" : "send"),
      textPreview: trimmedText.slice(0, 160),
    });

    const name = displayName() || undefined;
    if (editTarget) {
      if (editTarget.senderPeerId !== currentChat.peerId) return;
      const existing = parseQuotedMessage(editTarget.text);
      const editedText = existing.quote
        ? encodeQuotedMessage(trimmedText, existing.quote)
        : trimmedText;
      currentChat.editMessage(groupId, editTarget.id, editedText).then(() => {
        appendDiagnosticsEntry("message-edit-succeeded", { groupId, targetActionId: editTarget.id });
        setEditTargetMessage(null);
        setMessageDraft("");
        syncMessagesFromActionChain(groupId);
      }).catch((error) => {
        appendDiagnosticsEntry("message-edit-failed", {
          groupId,
          targetActionId: editTarget.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      return;
    }

    const outgoingText = (() => {
      if (!replyTarget) return trimmedText;
      const sender = resolveMessageSenderLabel(replyTarget.senderPeerId, replyTarget.senderDisplayName);
      const preview = parseQuotedMessage(replyTarget.text).body;
      return encodeQuotedMessage(trimmedText, {
        messageId: replyTarget.id,
        senderPeerId: replyTarget.senderPeerId,
        senderLabel: sender,
        text: preview,
      });
    })();

    currentChat.sendMessage(groupId, outgoingText, name).then(() => {
      appendDiagnosticsEntry("message-send-succeeded", { groupId, repliedToActionId: replyTarget?.id ?? null });
      upsertContact(currentChat.peerId, {
        selfName: name ?? null,
        groupId,
      });
      setReplyTargetMessage(null);
      setMessageDraft("");
      syncMessagesFromActionChain(groupId);
    }).catch((error) => {
      appendDiagnosticsEntry("message-send-failed", {
        groupId,
        error: error instanceof Error ? error.message : String(error),
      });
      setChatError(error instanceof Error ? error.message : String(error));
      setChatStatus("disconnected");
    });
  };

  const handleReplyMessage = (message: ChatMessageEvent) => {
    setEditTargetMessage(null);
    setReplyTargetMessage(message);
  };

  const handleEditMessage = (message: ChatMessageEvent) => {
    const currentChat = chat;
    if (!currentChat) return;
    if (message.senderPeerId !== currentChat.peerId) return;
    setReplyTargetMessage(null);
    setEditTargetMessage(message);
    setMessageDraft(parseQuotedMessage(message.text).body);
  };

  const handleDeleteMessage = (message: ChatMessageEvent) => {
    const currentChat = chat;
    const activeGroup = getActiveGroup(groupState());
    if (!currentChat || !activeGroup) return;
    if (message.senderPeerId !== currentChat.peerId) return;
    const groupId = activeGroup.groupId;
    appendDiagnosticsEntry("message-delete-requested", {
      groupId,
      targetActionId: message.id,
    });
    currentChat.deleteMessage(groupId, message.id).then(() => {
      appendDiagnosticsEntry("message-delete-succeeded", {
        groupId,
        targetActionId: message.id,
      });
      if (editTargetMessage()?.id === message.id) {
        setEditTargetMessage(null);
        setMessageDraft("");
      }
      syncMessagesFromActionChain(groupId);
    }).catch((error) => {
      appendDiagnosticsEntry("message-delete-failed", {
        groupId,
        targetActionId: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };

  const handleJoinViaInvite = async (invite: GroupInvite): Promise<string | null> => {
    const currentChat = chat;
    if (!currentChat) return "Not connected";

    appendDiagnosticsEntry("join-via-invite-requested", {
      groupId: invite.groupId,
    });
    try {
      const { groupId } = await currentChat.joinViaInvite(invite);
      const chainState = currentChat.getActionChainState(groupId);
      const groupName = chainState?.isDirectMessage
        ? "Direct Message"
        : (chainState?.groupName || "Unnamed Group");
      appendDiagnosticsEntry("join-via-invite-succeeded", {
        groupId,
        isDirectMessage: chainState?.isDirectMessage ?? false,
      });
      dispatchGroupEvent({ type: "group-joined", groupId, groupName, hasActionChain: true });
      dispatchGroupEvent({ type: "group-selected", groupId });
      refreshActionChainState();
      syncMessagesFromActionChain(groupId);
      dispatchMobileView({ type: "group-selected" });
      return null;
    } catch (error) {
      appendDiagnosticsEntry("join-via-invite-failed", {
        groupId: invite.groupId,
        error: error instanceof Error ? error.message : String(error),
      });
      return error instanceof Error ? error.message : "Join failed";
    }
  };

  const handleDesktopDeepLink = async (url: string) => {
    appendDiagnosticsEntry("desktop-deep-link-received", { url });
    try {
      const parsed = new URL(url);
      const inviteCode = parsed.searchParams.get("code")?.trim() ?? "";
      if (inviteCode.length === 0) return;
      if (!chat || chatStatus() !== "connected") {
        setPendingDesktopInviteCodes((prev) => [...prev, inviteCode]);
        appendDiagnosticsEntry("desktop-deep-link-queued", {
          inviteCodeLength: inviteCode.length,
          reason: "chat-not-connected",
        });
        return;
      }
      const decoded = decodeGroupInvite(inviteCode);
      if (!decoded.success) {
        appendDiagnosticsEntry("desktop-deep-link-invalid-invite", {
          url,
          error: decoded.error.message,
        });
        return;
      }
      const error = await handleJoinViaInvite(decoded.data);
      appendDiagnosticsEntry("desktop-deep-link-join-result", {
        url,
        success: error === null,
        error,
      });
    } catch (error) {
      appendDiagnosticsEntry("desktop-deep-link-parse-failed", {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  createEffect(() => {
    if (chatStatus() !== "connected" || !chat) return;
    const pending = pendingDesktopInviteCodes();
    if (pending.length === 0) return;

    const inviteCode = pending[0];
    const decoded = decodeGroupInvite(inviteCode);
    if (!decoded.success) {
      appendDiagnosticsEntry("desktop-deep-link-queued-invalid", {
        inviteCodeLength: inviteCode.length,
        error: decoded.error.message,
      });
      setPendingDesktopInviteCodes((prev) => prev.slice(1));
      return;
    }

    void handleJoinViaInvite(decoded.data).finally(() => {
      setPendingDesktopInviteCodes((prev) => prev.slice(1));
    });
  });

  onMount(() => {
    const bridge = hostBridge();
    if (!bridge) return;
    if (bridge.requestAppPermissions) {
      void bridge.requestAppPermissions().then((result) => {
        appendDiagnosticsEntry("app-permissions-requested", {
          notificationsGranted: result?.notificationsGranted === true,
          microphoneGranted: result?.microphoneGranted === true,
          cameraGranted: result?.cameraGranted === true,
        });
      }).catch(() => {
        appendDiagnosticsEntry("app-permissions-request-failed", {});
      });
    }
    const offRelayState = bridge.onRelayState?.((state) => setDesktopRelayState(state)) ?? (() => {});
    const offDeepLink = bridge.onDeepLink?.((url) => {
      void handleDesktopDeepLink(url);
    }) ?? (() => {});
    const offBackgroundNodeState = bridge.onBackgroundNodeState?.((state) => {
      setBackgroundNodeRunningState(state.running);
    }) ?? (() => {});
    if (bridge.getRelayState) {
      void bridge.getRelayState().then(setDesktopRelayState).catch(() => {});
    }
    if (bridge.getPendingDeepLinks) {
      void bridge.getPendingDeepLinks().then((urls) => {
        for (const url of urls) {
          void handleDesktopDeepLink(url);
        }
      }).catch(() => {});
    }
    if (bridge.getBackgroundNodeState) {
      void bridge.getBackgroundNodeState().then((state) => {
        setBackgroundNodeRunningState(state.running);
      }).catch(() => {});
    }
    onCleanup(() => {
      offRelayState();
      offDeepLink();
      offBackgroundNodeState();
    });
  });

  const handleCreateGroup = async (name: string): Promise<string | null> => {
    const currentChat = chat;
    if (!currentChat) return "Not connected";
    const trimmed = name.trim();
    if (trimmed.length === 0) return "Group name cannot be empty";

    try {
      const { groupId } = await currentChat.createGroup(trimmed);
      const groupName = currentChat.getActionChainState(groupId)?.groupName ?? trimmed;
      appendDiagnosticsEntry("group-create-succeeded", { groupId, groupName });
      dispatchGroupEvent({ type: "group-created", groupId, groupName });
      dispatchGroupEvent({ type: "group-selected", groupId });
      refreshActionChainState();
      dispatchMobileView({ type: "group-selected" });
      dispatchMobileView({ type: "group-info-toggled" });
      return null;
    } catch (error) {
      appendDiagnosticsEntry("group-create-failed", {
        groupName: trimmed,
        error: error instanceof Error ? error.message : String(error),
      });
      return error instanceof Error ? error.message : "Failed to create group";
    }
  };

  const setDirectMessagePeerForGroup = (groupId: string, peerId: string) => {
    setDirectMessagePeersByGroup((prev) => {
      if (prev.get(groupId) === peerId) return prev;
      const next = new Map(prev);
      next.set(groupId, peerId);
      persistDirectMessagePeersByGroup(next);
      return next;
    });
  };

  const targetPeerHasJoinedGroup = (groupId: string, targetPeerId: string): boolean => {
    const chainState = chat?.getActionChainState(groupId);
    if (!chainState) return false;
    if (chainState.isDirectMessage) {
      return chainState.dmHandshakeComplete;
    }
    const map = publicKeyToPeerIdMap();
    for (const member of chainState.members.values()) {
      if (map.get(member.publicKeyHex) === targetPeerId) return true;
    }
    return false;
  };

  const buildOutgoingDmRequestKey = (groupId: string, targetPeerId: string): string =>
    `${groupId}:${targetPeerId}`;

  const upsertOutgoingDirectMessageRequest = (
    request: {
      readonly targetPeerId: string;
      readonly groupId: string;
      readonly groupName: string;
      readonly inviteCode: string;
    },
    options?: {
      readonly bumpForImmediateRetry?: boolean;
    },
  ) => {
    const now = Date.now();
    const requestKey = buildOutgoingDmRequestKey(request.groupId, request.targetPeerId);
    const immediateRetry = options?.bumpForImmediateRetry ?? true;

    setOutgoingDirectMessageRequests((prev) => {
      const existing = prev.find((entry) => entry.requestKey === requestKey);
      const nextEntry: OutgoingDirectMessageRequest = existing
        ? {
            ...existing,
            groupName: normalizeDirectMessageGroupName(request.groupName),
            inviteCode: request.inviteCode,
            nextAttemptAt: immediateRetry ? now : existing.nextAttemptAt,
          }
        : {
            requestKey,
            targetPeerId: request.targetPeerId,
            groupId: request.groupId,
            groupName: normalizeDirectMessageGroupName(request.groupName),
            inviteCode: request.inviteCode,
            createdAt: now,
            lastAttemptAt: null,
            attemptCount: 0,
            nextAttemptAt: now,
          };
      const next = [nextEntry, ...prev.filter((entry) => entry.requestKey !== requestKey)];
      persistOutgoingDirectMessageRequests(next);
      return next;
    });
  };

  const removeOutgoingDirectMessageRequests = (predicate: (entry: OutgoingDirectMessageRequest) => boolean) => {
    setOutgoingDirectMessageRequests((prev) => {
      const next = prev.filter((entry) => !predicate(entry));
      if (next.length === prev.length) return prev;
      persistOutgoingDirectMessageRequests(next);
      return next;
    });
  };

  const runOutgoingDirectMessageRequestSweep = async () => {
    const currentChat = chat;
    if (!currentChat || outgoingDmRetrySweepInFlight) return;
    const snapshot = outgoingDirectMessageRequests();
    if (snapshot.length === 0) return;

    outgoingDmRetrySweepInFlight = true;
    try {
      const now = Date.now();
      const nextQueue: OutgoingDirectMessageRequest[] = [];

      for (const entry of snapshot) {
        const state = currentChat.getActionChainState(entry.groupId);
        const normalizedGroupName = normalizeDirectMessageGroupName(
          entry.groupName.length > 0 ? entry.groupName : state?.groupName,
        );
        const normalizedInviteCode = entry.inviteCode.trim();
        if (normalizedInviteCode.length === 0) {
          appendDiagnosticsEntry("dm-request-resolved", {
            requestKey: entry.requestKey,
            groupId: entry.groupId,
            targetPeerId: entry.targetPeerId,
            reason: "invalid-invite",
          });
          continue;
        }

        const baseEntry = entry.groupName === normalizedGroupName && entry.inviteCode === normalizedInviteCode
          ? entry
          : {
              ...entry,
              groupName: normalizedGroupName,
              inviteCode: normalizedInviteCode,
            };

        if (targetPeerHasJoinedGroup(entry.groupId, entry.targetPeerId)) {
          appendDiagnosticsEntry("dm-request-resolved", {
            requestKey: entry.requestKey,
            groupId: entry.groupId,
            targetPeerId: entry.targetPeerId,
            reason: "target-joined",
          });
          continue;
        }
        if (blockedPeerIds().has(entry.targetPeerId)) {
          appendDiagnosticsEntry("dm-request-resolved", {
            requestKey: entry.requestKey,
            groupId: entry.groupId,
            targetPeerId: entry.targetPeerId,
            reason: "blocked",
          });
          continue;
        }
        if (entry.nextAttemptAt > now) {
          nextQueue.push(baseEntry);
          continue;
        }

        appendDiagnosticsEntry("dm-request-attempt", {
          requestKey: entry.requestKey,
          groupId: entry.groupId,
          targetPeerId: entry.targetPeerId,
          attemptCount: entry.attemptCount + 1,
        });
        try {
          void currentChat.connectToPeerId(entry.targetPeerId).catch(() => {});
          void currentChat.requestProfile(entry.targetPeerId).catch(() => {});
          await currentChat.sendDirectMessageRequest({
            targetPeerId: entry.targetPeerId,
            groupId: entry.groupId,
            groupName: normalizedGroupName,
            inviteCode: normalizedInviteCode,
          });
          appendDiagnosticsEntry("dm-request-published", {
            requestKey: entry.requestKey,
            groupId: entry.groupId,
            targetPeerId: entry.targetPeerId,
            groupName: normalizedGroupName,
          });
        } catch (error) {
          appendDiagnosticsEntry("dm-request-publish-failed", {
            requestKey: entry.requestKey,
            groupId: entry.groupId,
            targetPeerId: entry.targetPeerId,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        const nextAttemptCount = entry.attemptCount + 1;
        nextQueue.push({
          ...baseEntry,
          attemptCount: nextAttemptCount,
          lastAttemptAt: now,
          nextAttemptAt: now + OUTGOING_DM_RETRY_INTERVAL_MS,
        });
      }

      const unchanged = snapshot.length === nextQueue.length &&
        snapshot.every((entry, idx) => {
          const next = nextQueue[idx];
          return !!next &&
            entry.requestKey === next.requestKey &&
            entry.attemptCount === next.attemptCount &&
            entry.lastAttemptAt === next.lastAttemptAt &&
            entry.nextAttemptAt === next.nextAttemptAt &&
            entry.groupName === next.groupName &&
            entry.inviteCode === next.inviteCode;
        });
      if (unchanged) return;
      persistOutgoingDirectMessageRequests(nextQueue);
      setOutgoingDirectMessageRequests(nextQueue);
    } finally {
      outgoingDmRetrySweepInFlight = false;
    }
  };

  const maybeRequestProfileSync = (peerId: string) => {
    const currentChat = chat;
    if (!currentChat) return;
    const target = peerId.trim();
    if (target.length === 0 || target === currentChat.peerId) return;

    const now = Date.now();
    const lastRequestedAt = profileSyncLastRequestAtByPeer.get(target) ?? 0;
    if (now - lastRequestedAt < PROFILE_SYNC_REQUEST_COOLDOWN_MS) return;

    profileSyncLastRequestAtByPeer.set(target, now);
    setProfileSyncDebugTick((value) => value + 1);
    appendDiagnosticsEntry("profile-request", {
      peerId: target,
      cooldownMs: PROFILE_SYNC_REQUEST_COOLDOWN_MS,
    });
    void currentChat.requestProfile(target).catch((error) => {
      appendDiagnosticsEntry("profile-request-failed", {
        peerId: target,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };

  createEffect(() => {
    if (chatStatus() !== "connected") return;
    const activeGroupId = groupState().activeGroupId;
    if (!activeGroupId) return;
    const dmPeerId = directMessagePeersByGroup().get(activeGroupId);
    if (!dmPeerId) return;
    maybeRequestProfileSync(dmPeerId);
  });

  const handleStartDirectMessage = async (targetPeerId: string): Promise<string | null> => {
    const currentChat = chat;
    if (!currentChat) return "Not connected";
    const trimmedTarget = targetPeerId.trim();
    if (!isValidPeerId(trimmedTarget)) return "Invalid peer ID";
    if (trimmedTarget === currentChat.peerId) return "Cannot DM yourself";
    appendDiagnosticsEntry("dm-start-requested", { targetPeerId: trimmedTarget });
    maybeRequestProfileSync(trimmedTarget);

    try {
      const dmGroupId = await deriveDirectMessageGroupId(currentChat.peerId, trimmedTarget);
      setDirectMessagePeerForGroup(dmGroupId, trimmedTarget);
      upsertContact(trimmedTarget, { groupId: dmGroupId });

      const existingGroup = groupState().groups.get(dmGroupId);
      let chainState = currentChat.getActionChainState(dmGroupId);
      const ownKeyHex = ownPublicKeyHex();
      const localDmGenesisMissing = !!chainState?.isDirectMessage &&
        !!ownKeyHex &&
        !chainState.dmGenesisContributorPublicKeys.has(ownKeyHex);
      if (!chainState || chainState.createdAt <= 0 || localDmGenesisMissing) {
        await currentChat.createDirectMessageGroupWithId(dmGroupId, [currentChat.peerId, trimmedTarget]);
        chainState = currentChat.getActionChainState(dmGroupId);
        if (existingGroup) {
          dispatchGroupEvent({
            type: "group-joined",
            groupId: dmGroupId,
            groupName: "Direct Message",
            hasActionChain: true,
          });
        } else {
          dispatchGroupEvent({ type: "group-created", groupId: dmGroupId, groupName: "Direct Message" });
        }
      } else {
        currentChat.joinGroup(dmGroupId);
        if (!existingGroup) {
          dispatchGroupEvent({
            type: "group-joined",
            groupId: dmGroupId,
            groupName: chainState.groupName || "Direct Message",
            hasActionChain: true,
          });
        }
      }

      dispatchGroupEvent({ type: "group-selected", groupId: dmGroupId });
      dispatchMobileView({ type: "group-selected" });

      const invite = buildInviteCodeForGroup(dmGroupId, {
        kind: "targeted-peer",
        targetPeerId: trimmedTarget,
      });
      if (!invite.error && invite.code) {
        upsertOutgoingDirectMessageRequest({
          targetPeerId: trimmedTarget,
          groupId: dmGroupId,
          groupName: normalizeDirectMessageGroupName(currentChat.getActionChainState(dmGroupId)?.groupName),
          inviteCode: invite.code,
        });
        appendDiagnosticsEntry("dm-request-queued", {
          groupId: dmGroupId,
          targetPeerId: trimmedTarget,
          inviteLength: invite.code.length,
        });
        void runOutgoingDirectMessageRequestSweep();
      }

      void currentChat.connectToPeerId(trimmedTarget).catch(() => {});
      appendDiagnosticsEntry("dm-start-succeeded", {
        groupId: dmGroupId,
        targetPeerId: trimmedTarget,
      });
      return null;
    } catch (error) {
      appendDiagnosticsEntry("dm-start-failed", {
        targetPeerId: trimmedTarget,
        error: error instanceof Error ? error.message : String(error),
      });
      return error instanceof Error ? error.message : "Failed to start direct chat";
    }
  };

  const handleStartDirectMessageFromContacts = async (targetPeerId: string): Promise<string | null> => {
    const error = await handleStartDirectMessage(targetPeerId);
    if (!error) {
      dispatchMobileView({ type: "contacts-closed" });
    }
    return error;
  };

  const handleStartDirectMessageFromGroupInfo = async (targetPeerId: string): Promise<string | null> => {
    const error = await handleStartDirectMessage(targetPeerId);
    if (!error) {
      dispatchMobileView({ type: "group-info-closed" });
    }
    return error;
  };

  const upsertPendingDirectMessageRequest = (event: DirectMessageRequestEvent) => {
    setPendingDirectMessageRequests((prev) => {
      if (prev.some((request) => request.requestId === event.requestId)) {
        appendDiagnosticsEntry("dm-request-inbound-duplicate", {
          requestId: event.requestId,
          senderPeerId: event.senderPeerId,
          groupId: event.groupId,
        });
        return prev;
      }
      const collapsed = prev.filter((request) =>
        !(request.senderPeerId === event.senderPeerId && request.groupId === event.groupId));
      const next = [
        {
          requestId: event.requestId,
          senderPeerId: event.senderPeerId,
          groupId: event.groupId,
          groupName: event.groupName,
          inviteCode: event.inviteCode,
          sentAt: event.sentAt,
        },
        ...collapsed,
      ].slice(0, 100);
      appendDiagnosticsEntry("dm-request-inbound-queued", {
        requestId: event.requestId,
        senderPeerId: event.senderPeerId,
        groupId: event.groupId,
        queueSize: next.length,
      });
      persistPendingDirectMessageRequests(next);
      return next;
    });
  };

  const removePendingDirectMessageRequest = (requestId: string) => {
    setPendingDirectMessageRequests((prev) => {
      const next = prev.filter((request) => request.requestId !== requestId);
      if (next.length === prev.length) return prev;
      persistPendingDirectMessageRequests(next);
      return next;
    });
  };

  const handleAcceptDirectMessageRequest = async (requestId: string): Promise<string | null> => {
    const currentChat = chat;
    if (!currentChat) return "Not connected";
    const request = pendingDirectMessageRequests().find((entry) => entry.requestId === requestId);
    if (!request) return "DM request not found";
    appendDiagnosticsEntry("dm-request-accept-requested", {
      requestId,
      senderPeerId: request.senderPeerId,
      groupId: request.groupId,
    });

    try {
      const result = await currentChat.acceptDirectMessageRequest(requestId);
      const groupId = result.groupId;
      const chainState = currentChat.getActionChainState(groupId);
      const existingGroup = groupState().groups.get(groupId);
      if (!existingGroup) {
        dispatchGroupEvent({
          type: "group-joined",
          groupId,
          groupName: chainState?.groupName || "Direct Message",
          hasActionChain: true,
        });
      }
      dispatchGroupEvent({ type: "group-selected", groupId });
      dispatchMobileView({ type: "group-selected" });
      refreshActionChainState();
      syncMessagesFromActionChain(groupId);

      setDirectMessagePeerForGroup(groupId, request.senderPeerId);
      removeOutgoingDirectMessageRequests((entry) =>
        entry.groupId === groupId && entry.targetPeerId === request.senderPeerId);
      removePendingDirectMessageRequest(requestId);
      appendDiagnosticsEntry("dm-request-accepted", {
        requestId,
        senderPeerId: request.senderPeerId,
        groupId,
      });
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to accept DM request";
      appendDiagnosticsEntry("dm-request-accept-failed", {
        requestId,
        senderPeerId: request.senderPeerId,
        groupId: request.groupId,
        error: message,
      });
      return message;
    }
  };

  const handleDeclineDirectMessageRequest = (requestId: string) => {
    const request = pendingDirectMessageRequests().find((entry) => entry.requestId === requestId);
    if (!request) return;
    appendDiagnosticsEntry("dm-request-declined", {
      requestId,
      senderPeerId: request.senderPeerId,
      groupId: request.groupId,
    });
    setPeerBlocked(request.senderPeerId, true);
    removePendingDirectMessageRequest(requestId);
  };

  const handleLeaveGroup = (groupId: string) => {
    appendDiagnosticsEntry("group-leave-requested", { groupId });
    chat?.leaveGroup(groupId).catch(() => {}).finally(() => {
      appendDiagnosticsEntry("group-leave-finished", { groupId });
      dispatchGroupEvent({ type: "group-left", groupId });
    });
  };

  const handleSelectGroup = (groupId: string) => {
    appendDiagnosticsEntry("group-select-requested", { groupId });
    dispatchGroupEvent({ type: "group-selected", groupId });
    dispatchMobileView({ type: "group-selected" });
  };

  const handleJoinOrStartCall = async (): Promise<void> => {
    const currentChat = chat;
    const activeGroupId = groupState().activeGroupId;
    if (!currentChat || !activeGroupId) return;
    const currentState = currentChat.getCallState(activeGroupId);
    setCallErrorForGroup(activeGroupId, null);
    try {
      if (currentState) {
        await currentChat.joinCall(activeGroupId);
      } else {
        await currentChat.startCall(activeGroupId);
      }
      refreshCallStateForGroup(activeGroupId);
      await reconcileCallMediaForGroup(activeGroupId);
      setCallErrorForGroup(activeGroupId, null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to join call";
      setCallErrorForGroup(activeGroupId, message);
      appendDiagnosticsEntry("call-join-failed", {
        groupId: activeGroupId,
        error: message,
      });
    }
  };

  const handleRingOrNudgeCall = async (): Promise<void> => {
    const currentChat = chat;
    const activeGroupId = groupState().activeGroupId;
    if (!currentChat || !activeGroupId) return;
    const targetPeerId = directMessagePeersByGroup().get(activeGroupId);
    try {
      await currentChat.ringCall(
        activeGroupId,
        targetPeerId ? { targetPeerId } : undefined,
      );
      refreshCallStateForGroup(activeGroupId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to ring";
      setCallErrorForGroup(activeGroupId, message);
      appendDiagnosticsEntry("call-ring-failed", {
        groupId: activeGroupId,
        targetPeerId: targetPeerId ?? null,
        error: message,
      });
    }
  };

  const handleLeaveCall = async (): Promise<void> => {
    const currentChat = chat;
    const activeGroupId = groupState().activeGroupId;
    if (!currentChat || !activeGroupId) return;
    const currentState = currentChat.getCallState(activeGroupId);
    if (!currentState) return;
    const muted = callMutedByGroup().get(activeGroupId) ?? false;
    try {
      const remotePeerIds = [...currentState.participants.keys()].filter((peerId) => peerId !== currentChat.peerId);
      await Promise.allSettled(
        remotePeerIds.map((peerId) =>
          currentChat.sendMediaSignal(activeGroupId, peerId, { type: "hangup" })),
      );
      await currentChat.leaveCall(activeGroupId, { muted });
    } catch {
      // noop
    } finally {
      teardownCallMediaForGroup(activeGroupId);
      refreshCallStateForGroup(activeGroupId);
    }
  };

  const handleToggleCallMute = () => {
    const activeGroupId = groupState().activeGroupId;
    if (!activeGroupId) return;
    const nextMuted = !(callMutedByGroup().get(activeGroupId) ?? false);
    setGroupMuted(activeGroupId, nextMuted);
  };

  const handleAcceptIncomingCall = async () => {
    const currentChat = chat;
    const activeGroupId = groupState().activeGroupId;
    if (!currentChat || !activeGroupId) return;
    const prompt = incomingCallsByGroup().get(activeGroupId);
    if (!prompt) return;
    setCallErrorForGroup(activeGroupId, null);
    try {
      await currentChat.acceptCall(activeGroupId, { targetPeerId: prompt.senderPeerId });
      await currentChat.joinCall(activeGroupId);
      setIncomingCallsByGroup((prev) => {
        const next = new Map(prev);
        next.delete(activeGroupId);
        return next;
      });
      refreshCallStateForGroup(activeGroupId);
      await reconcileCallMediaForGroup(activeGroupId);
      setCallErrorForGroup(activeGroupId, null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to accept call";
      setCallErrorForGroup(activeGroupId, message);
    }
  };

  const handleDeclineIncomingCall = async () => {
    const currentChat = chat;
    const activeGroupId = groupState().activeGroupId;
    if (!currentChat || !activeGroupId) return;
    const prompt = incomingCallsByGroup().get(activeGroupId);
    if (!prompt) return;
    await currentChat.declineCall(activeGroupId, { targetPeerId: prompt.senderPeerId }).catch(() => {});
    setIncomingCallsByGroup((prev) => {
      const next = new Map(prev);
      next.delete(activeGroupId);
      return next;
    });
  };

  const getCurrentAccountKey = (): AccountKey | null => {
    const state = onboardingState();
    if (state.status === "ready" || state.status === "display-name-prompt") {
      return state.accountKey;
    }
    return null;
  };

  const backupPending = () => {
    const state = onboardingState();
    return state.status === "ready" && state.backupPending;
  };

  const handleAddRelay = (addr: string) => {
    appendDiagnosticsEntry("relay-add-requested", { addr });
    chat?.addRelay(addr);
  };

  const handleClearRelayContactBook = () => {
    appendDiagnosticsEntry("relay-contact-book-clear-requested", {});
    chat?.clearRelayContactBook();
    saveRelayHints([]);
    setRelayContactBook(new Map());
  };

  const handleClearPeerPathCache = () => {
    appendDiagnosticsEntry("peer-path-cache-clear-requested", {});
    chat?.clearPeerPathCache();
    setPeerPathCache(new Map());
  };

  const handleClearConnectionReasons = () => {
    appendDiagnosticsEntry("connection-reasons-clear-requested", {});
    chat?.clearConnectionReasonCounts();
    setConnectionReasonCounts(new Map());
  };

  const ownPublicKeyHex = () => {
    const key = getCurrentAccountKey();
    return key ? toHex(new Uint8Array(key.publicKey)) : "";
  };

  const isCurrentUserAdmin = () => {
    const state = actionChainState();
    if (!state) return false;
    const hex = ownPublicKeyHex();
    const role = state.members.get(hex)?.role;
    return role === "admin" || role === "owner";
  };

  const ownRole = () => {
    const state = actionChainState();
    if (!state) return null;
    const hex = ownPublicKeyHex();
    return state.members.get(hex)?.role ?? null;
  };

  const getBestRelayAddress = (): string | null => {
    const pool = relayPoolState();
    if (pool?.relays?.[0]?.address) return pool.relays[0].address;

    const candidates = relayCandidateState();
    if (candidates) {
      const sorted = getCandidatesByRtt(candidates);
      for (const candidate of sorted) {
        if (candidate.addresses.length > 0) {
          return `${candidate.addresses[0]}/p2p/${candidate.peerId}`;
        }
      }
    }

    if (ENV_RELAY_MULTIADDR) return ENV_RELAY_MULTIADDR;

    const desktopRelay = desktopRelayState();
    if (desktopRelay?.running && desktopRelay.listenAddrs.length > 0) {
      return desktopRelay.listenAddrs[0];
    }

    return null;
  };

  const buildInviteCodeForGroup = (groupId: string, options: InviteCreateOptions): InviteCreateResult => {
    const currentChat = chat;
    if (!currentChat) return { error: "No active group", code: null };
    const envelopes = currentChat.getActionChainEnvelopes(groupId);
    if (!envelopes || envelopes.length === 0) return { error: "Group has no genesis action", code: null };

    const includeRelay = options.includeRelay ?? false;
    const relayAddr = includeRelay ? getBestRelayAddress() : null;
    if (includeRelay && !relayAddr) return { error: "No relay address available to include", code: null };
    const accountKey = getCurrentAccountKey();
    if (!accountKey) return { error: "No account key available", code: null };

    const policy = options.kind === "targeted-peer"
      ? {
          kind: "targeted-peer" as const,
          targetPeerId: options.targetPeerId.trim(),
        }
      : {
          kind: "open" as const,
          expiresAt: options.expiresInMinutes !== undefined
            ? Date.now() + Math.round(options.expiresInMinutes * 60_000)
            : undefined,
          maxJoiners: options.maxJoiners,
        };

    if (policy.kind === "targeted-peer" && policy.targetPeerId.length === 0) {
      return { error: "Target peer ID is required", code: null };
    }

    const inviteGrant = createInviteGrant({
      accountKey,
      groupId,
      policy,
    });

    const code = encodeGroupInvite({
      genesisEnvelope: envelopes[0],
      relayAddr: relayAddr ?? undefined,
      adminPeerId: currentChat.peerId,
      inviteGrant,
    });
    return { error: null, code };
  };

  const handleCreateInvite = (options: InviteCreateOptions): InviteCreateResult => {
    const activeId = groupState().activeGroupId;
    if (!activeId) return { error: "No active group", code: null };
    const result = buildInviteCodeForGroup(activeId, options);
    appendDiagnosticsEntry("invite-create-attempt", {
      groupId: activeId,
      options,
      success: !!result.code,
      error: result.error,
      inviteLength: result.code?.length ?? 0,
    });
    if (result.code) {
      navigator.clipboard.writeText(result.code).catch(() => {});
    }
    return result;
  };

  const handleRetryJoinNow = () => {
    const currentChat = chat;
    const activeId = groupState().activeGroupId;
    if (!currentChat || !activeId) return;
    appendDiagnosticsEntry("join-retry-now-requested", { groupId: activeId });
    currentChat.retryJoinNow(activeId).catch(() => {});
  };

  const handleCancelJoinRetry = () => {
    const currentChat = chat;
    const activeId = groupState().activeGroupId;
    if (!currentChat || !activeId) return;
    appendDiagnosticsEntry("join-retry-cancel-requested", { groupId: activeId });
    currentChat.cancelJoinRetry(activeId);
  };

  const handleApproveJoin = (memberPublicKey: Uint8Array) => {
    const currentChat = chat;
    const activeId = groupState().activeGroupId;
    if (!currentChat || !activeId) return;
    appendDiagnosticsEntry("member-approve-requested", {
      groupId: activeId,
      memberPublicKeyHex: toHex(new Uint8Array(memberPublicKey)),
    });

    currentChat.approveJoin(activeId, memberPublicKey).then(() => {
      appendDiagnosticsEntry("member-approved", {
        groupId: activeId,
        memberPublicKeyHex: toHex(new Uint8Array(memberPublicKey)),
      });
      const approvedHex = toHex(new Uint8Array(memberPublicKey));
      setPendingJoinsMap((prev) => {
        const existing = prev.get(activeId) ?? [];
        const filtered = existing.filter((p) => p.publicKeyHex !== approvedHex);
        const updated = new Map(prev);
        updated.set(activeId, filtered);
        savePendingJoins(updated);
        return updated;
      });
      refreshActionChainState();
      syncMessagesFromActionChain(activeId);
    }).catch((error) => {
      appendDiagnosticsEntry("member-approve-failed", {
        groupId: activeId,
        memberPublicKeyHex: toHex(new Uint8Array(memberPublicKey)),
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };

  const handleRemoveMember = (memberPublicKey: Uint8Array) => {
    const currentChat = chat;
    const activeId = groupState().activeGroupId;
    if (!currentChat || !activeId) return;
    appendDiagnosticsEntry("member-remove-requested", {
      groupId: activeId,
      memberPublicKeyHex: toHex(new Uint8Array(memberPublicKey)),
    });

    currentChat.removeMember(activeId, memberPublicKey).then(() => {
      appendDiagnosticsEntry("member-removed", {
        groupId: activeId,
        memberPublicKeyHex: toHex(new Uint8Array(memberPublicKey)),
      });
      refreshActionChainState();
    }).catch((error) => {
      appendDiagnosticsEntry("member-remove-failed", {
        groupId: activeId,
        memberPublicKeyHex: toHex(new Uint8Array(memberPublicKey)),
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };

  const handleChangeMemberRole = async (
    memberPublicKey: Uint8Array,
    newRole: "owner" | "admin" | "member",
  ): Promise<string | null> => {
    const currentChat = chat;
    const activeId = groupState().activeGroupId;
    if (!currentChat || !activeId) return "No active group";
    try {
      await currentChat.changeMemberRole(activeId, memberPublicKey, newRole);
      appendDiagnosticsEntry("member-role-changed", {
        groupId: activeId,
        memberPublicKeyHex: toHex(new Uint8Array(memberPublicKey)),
        role: newRole,
      });
      refreshActionChainState();
      return null;
    } catch (error) {
      appendDiagnosticsEntry("member-role-change-failed", {
        groupId: activeId,
        memberPublicKeyHex: toHex(new Uint8Array(memberPublicKey)),
        role: newRole,
        error: error instanceof Error ? error.message : String(error),
      });
      return error instanceof Error ? error.message : "Failed to change role";
    }
  };

  const handleSetJoinPolicy = async (joinPolicy: JoinPolicy): Promise<string | null> => {
    const currentChat = chat;
    const activeId = groupState().activeGroupId;
    if (!currentChat || !activeId) return "No active group";
    try {
      await currentChat.setJoinPolicy(activeId, joinPolicy);
      appendDiagnosticsEntry("join-policy-updated", {
        groupId: activeId,
        joinPolicy,
      });
      refreshActionChainState();
      return null;
    } catch (error) {
      appendDiagnosticsEntry("join-policy-update-failed", {
        groupId: activeId,
        joinPolicy,
        error: error instanceof Error ? error.message : String(error),
      });
      return error instanceof Error ? error.message : "Failed to update join policy";
    }
  };

  const handleRenameGroup = async (newName: string): Promise<string | null> => {
    const currentChat = chat;
    const activeId = groupState().activeGroupId;
    if (!currentChat || !activeId) return "No active group";
    try {
      await currentChat.renameGroup(activeId, newName);
      appendDiagnosticsEntry("group-renamed", {
        groupId: activeId,
        newName,
      });
      refreshActionChainState();
      return null;
    } catch (error) {
      appendDiagnosticsEntry("group-rename-failed", {
        groupId: activeId,
        newName,
        error: error instanceof Error ? error.message : String(error),
      });
      return error instanceof Error ? error.message : "Failed to rename group";
    }
  };

  const handleAddByPeerId = (targetPeerId: string): string | null => {
    const currentChat = chat;
    const activeId = groupState().activeGroupId;
    if (!currentChat || !activeId) return "No active group";
    appendDiagnosticsEntry("member-add-by-peer-requested", {
      groupId: activeId,
      targetPeerId,
    });

    const pubKeyMap = publicKeyToPeerIdMap();
    let matchedPublicKeyHex: string | null = null;
    for (const [pubKeyHex, peerId] of pubKeyMap) {
      if (peerId === targetPeerId) {
        matchedPublicKeyHex = pubKeyHex;
        break;
      }
    }

    if (!matchedPublicKeyHex) {
      appendDiagnosticsEntry("member-add-by-peer-missing-public-key", {
        groupId: activeId,
        targetPeerId,
      });
      return "Peer not found. They must join the network first so their identity can be discovered.";
    }

    const pubKeyBytes = hexToBytes(matchedPublicKeyHex);
    currentChat.approveJoin(activeId, pubKeyBytes).then(() => {
      appendDiagnosticsEntry("member-add-by-peer-approved", {
        groupId: activeId,
        targetPeerId,
        memberPublicKeyHex: matchedPublicKeyHex,
      });
      refreshActionChainState();
      syncMessagesFromActionChain(activeId);
    }).catch((error) => {
      appendDiagnosticsEntry("member-add-by-peer-failed", {
        groupId: activeId,
        targetPeerId,
        memberPublicKeyHex: matchedPublicKeyHex,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return null;
  };

  const activeCallState = (): CallState | null => {
    const activeId = groupState().activeGroupId;
    if (!activeId) return null;
    const cached = callStatesByGroup().get(activeId);
    if (cached) return cached;
    return chat?.getCallState(activeId) ?? null;
  };

  const activeIncomingCallPrompt = (): IncomingCallPrompt | null => {
    const activeId = groupState().activeGroupId;
    if (!activeId) return null;
    return incomingCallsByGroup().get(activeId) ?? null;
  };

  const activeCallInProgress = (): boolean => {
    const currentChat = chat;
    const state = activeCallState();
    if (!currentChat || !state) return false;
    return state.participants.has(currentChat.peerId);
  };

  const activeCallParticipantCount = (): number =>
    activeCallState()?.participants.size ?? 0;

  const activeCallDurationLabel = (): string | null => {
    const state = activeCallState();
    if (!state) return null;
    const now = callClockMs();
    return formatCallDurationCompact(Math.max(0, now - state.startedAt));
  };

  const activeCallMuted = (): boolean => {
    const activeId = groupState().activeGroupId;
    if (!activeId) return false;
    return callMutedByGroup().get(activeId) ?? false;
  };

  const activeCallError = (): string | null => {
    const activeId = groupState().activeGroupId;
    if (!activeId) return null;
    return callErrorByGroup().get(activeId) ?? null;
  };

  const toggleParticipantOutputMute = (peerId: string) => {
    const activeId = groupState().activeGroupId;
    if (!activeId) return;
    const nextMuted = !isParticipantLocallyMuted(activeId, peerId);
    setParticipantLocallyMuted(activeId, peerId, nextMuted);
  };

  const activeCallAudioOutputBlocked = (): boolean => {
    const activeId = groupState().activeGroupId;
    if (!activeId) return false;
    return callAudioOutputBlockedByGroup().get(activeId) === true;
  };

  const handleResumeCallAudio = async (): Promise<void> => {
    const activeId = groupState().activeGroupId;
    if (!activeId) return;
    const mediaState = groupCallMedia.get(activeId);
    if (!mediaState) return;
    const resumes: Promise<unknown>[] = [];
    if (mediaState.localSpeakingAudioContext) {
      resumes.push(mediaState.localSpeakingAudioContext.resume().catch(() => {}));
    }
    for (const entry of mediaState.peers.values()) {
      if (entry.speakingAudioContext) {
        resumes.push(entry.speakingAudioContext.resume().catch(() => {}));
      }
      resumes.push(entry.audioElement.play().catch(() => {}));
    }
    await Promise.allSettled(resumes);
    setCallAudioOutputBlocked(activeId, false);
    appendDiagnosticsEntry("call-audio-resume-attempted", {
      groupId: activeId,
      peers: mediaState.peers.size,
    });
  };

  const activeCallParticipants = () => {
    const activeId = groupState().activeGroupId;
    const currentChat = chat;
    const state = activeCallState();
    if (!activeId || !currentChat || !state) return [];
    const speakingByPeer = callSpeakingByGroup().get(activeId) ?? new Map<string, number>();
    const latencies = latencyMap();
    return [...state.participants.values()]
      .sort((left, right) => {
        const leftIsSelf = left.peerId === currentChat.peerId;
        const rightIsSelf = right.peerId === currentChat.peerId;
        if (leftIsSelf && !rightIsSelf) return -1;
        if (!leftIsSelf && rightIsSelf) return 1;
        if (left.joinedAt !== right.joinedAt) return left.joinedAt - right.joinedAt;
        return left.peerId.localeCompare(right.peerId);
      })
      .map((participant) => {
        const isSelf = participant.peerId === currentChat.peerId;
        const speakingLevelRaw = speakingByPeer.get(participant.peerId) ?? 0;
        const pingMs = isSelf ? null : (latencies.get(participant.peerId) ?? null);
        const quality = classifyCallLinkQuality(pingMs);
        const label = isSelf
          ? "You"
          : directMessagePeerLabel(participant.peerId)
            ?? contactsBook().get(participant.peerId)?.nickname
            ?? contactsBook().get(participant.peerId)?.selfName
            ?? `${participant.peerId.slice(0, 12)}...`;
        return {
          peerId: participant.peerId,
          label,
          isSelf,
          speakingLevel: normalizeSpeakingIndicatorLevel(speakingLevelRaw),
          speaking: normalizeSpeakingIndicatorLevel(speakingLevelRaw) >= CALL_SPEAKING_UI_ACTIVE_LEVEL || isSpeaking(speakingLevelRaw),
          micMuted: isSelf ? activeCallMuted() : participant.muted,
          pingMs,
          quality,
          outputMuted: !isSelf && isParticipantLocallyMuted(activeId, participant.peerId),
        };
      });
  };

  const activeGroupName = () => {
    const activeId = groupState().activeGroupId;
    if (!activeId) return undefined;
    const dmPeerId = directMessagePeerIdForGroup(activeId);
    if (dmPeerId) {
      return contactsBook().get(dmPeerId)?.nickname
        ?? contactsBook().get(dmPeerId)?.selfName
        ?? `${dmPeerId.slice(0, 12)}...`;
    }
    return chat?.getActionChainState(activeId)?.groupName
      ?? groupState().groups.get(activeId)?.groupName;
  };

  const connectedPeerIds = (): ReadonlySet<string> => {
    const status = networkStatus();
    if (!status) return new Set();
    return new Set(status.peers.map((p) => p.peerId));
  };

  const directMessagePeerIdForGroup = (groupId: string): string | null =>
    directMessagePeersByGroup().get(groupId) ?? null;

  const activeDirectMessagePeerId = (): string | null => {
    const activeId = groupState().activeGroupId;
    if (!activeId) return null;
    return directMessagePeerIdForGroup(activeId);
  };

  const isDirectMessageBlocked = (peerId: string | null): boolean =>
    !!peerId && blockedPeerIds().has(peerId);

  const directMessagePeerLabel = (peerId: string | null): string | null => {
    if (!peerId) return null;
    const contact = contactsBook().get(peerId);
    return contact?.nickname ?? contact?.selfName ?? `${peerId.slice(0, 12)}...`;
  };

  const resolveMessageSenderLabel = (
    senderPeerId: string,
    senderDisplayName?: string,
  ): string => {
    const contact = contactsBook().get(senderPeerId);
    const nickname = contact?.nickname?.trim();
    if (nickname && nickname.length > 0) return nickname;
    const selfName = contact?.selfName?.trim();
    if (selfName && selfName.length > 0) return selfName;
    const inlineName = senderDisplayName?.trim();
    if (inlineName && inlineName.length > 0) return inlineName;
    return formatPeerIdForDisplay(senderPeerId);
  };

  const visibleMessageText = (text: string): string => parseQuotedMessage(text).body;

  const latestReadableMessageIdForActiveGroup = (): string | null => {
    const activeGroup = getActiveGroup(groupState());
    const currentChat = chat;
    if (!activeGroup || !currentChat) return null;
    for (let index = activeGroup.messages.length - 1; index >= 0; index -= 1) {
      const message = activeGroup.messages[index];
      if (message.senderPeerId === SYSTEM_SENDER_ID) continue;
      if (message.senderPeerId === currentChat.peerId) continue;
      return message.id;
    }
    return null;
  };

  const maybeSendReadReceiptForActiveGroup = () => {
    const currentChat = chat;
    if (!currentChat || chatStatus() !== "connected") return;
    if (typeof document !== "undefined") {
      if (document.hidden) return;
      if (typeof document.hasFocus === "function" && !document.hasFocus()) return;
    }
    const activeGroupId = groupState().activeGroupId;
    if (!activeGroupId) return;
    const chainState = currentChat.getActionChainState(activeGroupId);
    if (!chainState) return;
    if (chainState.isDirectMessage && !chainState.dmHandshakeComplete) return;
    const targetActionId = latestReadableMessageIdForActiveGroup();
    if (!targetActionId) return;
    const ownKeyHex = ownPublicKeyHex();
    if (!ownKeyHex) return;
    if (chainState.readReceipts.get(ownKeyHex) === targetActionId) {
      readReceiptLastSentByGroup.set(activeGroupId, targetActionId);
      return;
    }
    if (readReceiptLastSentByGroup.get(activeGroupId) === targetActionId) return;
    const now = Date.now();
    const lastAttemptAt = readReceiptLastAttemptAtByGroup.get(activeGroupId) ?? 0;
    if (now - lastAttemptAt < READ_RECEIPT_AUTO_SEND_COOLDOWN_MS) return;
    readReceiptLastAttemptAtByGroup.set(activeGroupId, now);
    appendDiagnosticsEntry("read-receipt-send-requested", {
      groupId: activeGroupId,
      upToActionId: targetActionId,
    });
    void currentChat.sendReadReceipt(activeGroupId, targetActionId).then(() => {
      readReceiptLastSentByGroup.set(activeGroupId, targetActionId);
      appendDiagnosticsEntry("read-receipt-send-succeeded", {
        groupId: activeGroupId,
        upToActionId: targetActionId,
      });
    }).catch((error) => {
      appendDiagnosticsEntry("read-receipt-send-failed", {
        groupId: activeGroupId,
        upToActionId: targetActionId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };

  const activeMessageReadersByMessageId = (): ReadonlyMap<string, readonly MessageReadEntry[]> => {
    const activeGroupId = groupState().activeGroupId;
    const currentChat = chat;
    if (!activeGroupId || !currentChat) return new Map();
    const allMessages = getActiveMessages(groupState())
      .filter((message) => message.senderPeerId !== SYSTEM_SENDER_ID);
    if (allMessages.length === 0) return new Map();
    const messageIndexById = new Map<string, number>();
    allMessages.forEach((message, index) => messageIndexById.set(message.id, index));
    const latestReadByAuthor = new Map<string, { readonly upToActionId: string; readonly readAt: number }>();
    for (const envelope of currentChat.getActionChainEnvelopes(activeGroupId)) {
      const decoded = verifyAndDecodeAction(envelope);
      if (!decoded.success) continue;
      const action = decoded.data;
      if (action.payload.type !== "read-receipt") continue;
      const authorHex = toHex(action.authorPublicKey);
      const previous = latestReadByAuthor.get(authorHex);
      if (!previous || action.timestamp > previous.readAt) {
        latestReadByAuthor.set(authorHex, {
          upToActionId: action.payload.upToActionId,
          readAt: action.timestamp,
        });
      }
    }
    const ownKeyHex = ownPublicKeyHex();
    const readersByMessageId = new Map<string, MessageReadEntry[]>();
    for (const [authorHex, receipt] of latestReadByAuthor.entries()) {
      if (authorHex === ownKeyHex) continue;
      const upToIndex = messageIndexById.get(receipt.upToActionId);
      if (upToIndex === undefined) continue;
      const mappedPeerId = publicKeyToPeerIdMap().get(authorHex);
      const readerPeerId = mappedPeerId ?? `pk:${authorHex.slice(0, 10)}...`;
      const contact = mappedPeerId ? contactsBook().get(mappedPeerId) : null;
      const label = contact?.nickname?.trim()
        || contact?.selfName?.trim()
        || (mappedPeerId ? formatPeerIdForDisplay(mappedPeerId) : readerPeerId);
      for (let index = 0; index <= upToIndex; index += 1) {
        const messageId = allMessages[index].id;
        const rows = readersByMessageId.get(messageId) ?? [];
        rows.push({
          peerId: readerPeerId,
          label,
          readAt: receipt.readAt,
        });
        readersByMessageId.set(messageId, rows);
      }
    }
    for (const rows of readersByMessageId.values()) {
      rows.sort((left, right) => {
        if (right.readAt !== left.readAt) return right.readAt - left.readAt;
        return left.label.localeCompare(right.label);
      });
    }
    return readersByMessageId;
  };

  const activeEditedAtByMessageId = (): ReadonlyMap<string, number> => {
    const activeGroupId = groupState().activeGroupId;
    const currentChat = chat;
    if (!activeGroupId || !currentChat) return new Map();
    const messageAuthorById = new Map<string, string>();
    const latestEditedAtByMessageId = new Map<string, { readonly editorHex: string; readonly editedAt: number }>();
    for (const envelope of currentChat.getActionChainEnvelopes(activeGroupId)) {
      const decoded = verifyAndDecodeAction(envelope);
      if (!decoded.success) continue;
      const action = decoded.data;
      const authorHex = toHex(action.authorPublicKey);
      if (action.payload.type === "message") {
        messageAuthorById.set(action.id, authorHex);
        continue;
      }
      if (action.payload.type !== "message-edited") continue;
      const targetActionId = action.payload.targetActionId;
      const previous = latestEditedAtByMessageId.get(targetActionId);
      if (!previous || action.timestamp > previous.editedAt) {
        latestEditedAtByMessageId.set(targetActionId, {
          editorHex: authorHex,
          editedAt: action.timestamp,
        });
      }
    }

    const editedAtByMessageId = new Map<string, number>();
    for (const [messageId, edit] of latestEditedAtByMessageId.entries()) {
      const authorHex = messageAuthorById.get(messageId);
      if (!authorHex || authorHex !== edit.editorHex) continue;
      editedAtByMessageId.set(messageId, edit.editedAt);
    }
    return editedAtByMessageId;
  };

  const formatRelativeLastSeen = (timestampMs: number, nowMs = Date.now()): string => {
    const deltaMs = Math.max(0, nowMs - timestampMs);
    const deltaSeconds = Math.floor(deltaMs / 1000);
    if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
    const deltaMinutes = Math.floor(deltaSeconds / 60);
    if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
    const deltaHours = Math.floor(deltaMinutes / 60);
    if (deltaHours < 24) return `${deltaHours}h ago`;
    const deltaDays = Math.floor(deltaHours / 24);
    return `${deltaDays}d ago`;
  };

  const directMessagePresenceForGroup = (
    groupId: string,
    dmPeerId: string | null,
  ): { label: string; tone: "online" | "offline" | "pending" } | null => {
    if (!dmPeerId) return null;
    const chain = chat?.getActionChainState(groupId);
    if (chain?.isDirectMessage && !chain.dmHandshakeComplete) {
      return { label: "pending", tone: "pending" };
    }
    if (connectedPeerIds().has(dmPeerId)) {
      return { label: "online", tone: "online" };
    }
    const lastSeenAt = contactsBook().get(dmPeerId)?.lastSeenAt;
    if (typeof lastSeenAt === "number" && Number.isFinite(lastSeenAt) && lastSeenAt > 0) {
      return { label: `last seen ${formatRelativeLastSeen(lastSeenAt)}`, tone: "offline" };
    }
    return { label: "offline", tone: "offline" };
  };

  const activeDirectMessagePresence = (): { label: string; tone: "online" | "offline" | "pending" } | null => {
    const activeId = groupState().activeGroupId;
    if (!activeId) return null;
    return directMessagePresenceForGroup(activeId, activeDirectMessagePeerId());
  };

  const setPeerBlocked = (peerId: string, blocked: boolean) => {
    appendDiagnosticsEntry("peer-block-updated", {
      peerId,
      blocked,
    });
    setBlockedPeerIds((prev) => {
      const next = new Set(prev);
      if (blocked) next.add(peerId);
      else next.delete(peerId);
      persistBlockedPeerIds(next);
      return next;
    });
  };

  const pinnedPeerIds = (): readonly string[] => {
    // Recompute when group/network snapshots change so membership updates propagate.
    groupState();
    networkStatus();
    const currentChat = chat;
    if (!currentChat) return [];
    const peerIdMap = publicKeyToPeerIdMap();
    const pinned = new Set<string>();
    for (const groupId of currentChat.getJoinedGroups()) {
      const chainState = currentChat.getActionChainState(groupId);
      if (!chainState) continue;
      for (const member of chainState.members.values()) {
        const memberPeerId = peerIdMap.get(member.publicKeyHex);
        if (memberPeerId && memberPeerId !== currentChat.peerId) {
          pinned.add(memberPeerId);
        }
      }
    }
    return [...pinned].sort((a, b) => a.localeCompare(b));
  };

  const sidebarGroups = () =>
    getGroupList(groupState()).map((g) => {
      const lastMsg = g.messages.length > 0 ? g.messages[g.messages.length - 1] : undefined;
      const visiblePeerCount = [...getSeenPeerIds(groupState(), g.groupId)]
        .filter((peerId) => peerId !== SYSTEM_SENDER_ID)
        .length;
      const chainState = chat?.getActionChainState(g.groupId);
      const chainName = chainState?.groupName;
      const dmPeerId = directMessagePeerIdForGroup(g.groupId);
      const dmLabel = dmPeerId
        ? contactsBook().get(dmPeerId)?.nickname
          ?? contactsBook().get(dmPeerId)?.selfName
          ?? `${dmPeerId.slice(0, 12)}...`
        : null;
      const isDm = (chainState?.isDirectMessage ?? false) || dmPeerId !== null;
      const dmPresence = isDm ? directMessagePresenceForGroup(g.groupId, dmPeerId) : null;
      return {
        groupId: g.groupId,
        groupName: dmLabel ?? (chainName ?? g.groupName),
        isDirectMessage: isDm,
        directMessageConnected: isDm && !!dmPeerId ? connectedPeerIds().has(dmPeerId) : false,
        directMessageStatusLabel: dmPresence?.label,
        directMessageStatusTone: dmPresence?.tone,
        unreadCount: g.unreadCount,
        seenPeerCount: visiblePeerCount,
        lastMessage: lastMsg
          ? { text: visibleMessageText(lastMsg.text), timestamp: lastMsg.timestamp }
          : undefined,
      };
    });

  const pendingDirectMessageRequestRows = () =>
    pendingDirectMessageRequests().map((request) => {
      const contact = contactsBook().get(request.senderPeerId);
      const senderLabel = contact?.nickname
        ?? contact?.selfName
        ?? `${request.senderPeerId.slice(0, 12)}...${request.senderPeerId.slice(-4)}`;
      return {
        requestId: request.requestId,
        senderLabel,
        groupName: request.groupName,
        sentAt: request.sentAt,
      };
    });

  const dmOutgoingDebugRows = () => {
    const _tick = profileSyncDebugTick();
    _tick;
    return outgoingDirectMessageRequests().map((entry) => ({
      requestKey: entry.requestKey,
      groupId: entry.groupId,
      targetPeerId: entry.targetPeerId,
      connected: connectedPeerIds().has(entry.targetPeerId),
      blocked: blockedPeerIds().has(entry.targetPeerId),
      targetJoined: targetPeerHasJoinedGroup(entry.groupId, entry.targetPeerId),
      attemptCount: entry.attemptCount,
      lastAttemptAt: entry.lastAttemptAt,
      nextAttemptAt: entry.nextAttemptAt,
    }));
  };

  const pendingDmDebugRows = () =>
    pendingDirectMessageRequests().map((request) => {
      const contact = contactsBook().get(request.senderPeerId);
      return {
        requestId: request.requestId,
        senderPeerId: request.senderPeerId,
        senderLabel: contact?.nickname
          ?? contact?.selfName
          ?? `${request.senderPeerId.slice(0, 12)}...${request.senderPeerId.slice(-4)}`,
        groupId: request.groupId,
        sentAt: request.sentAt,
      };
    });

  const profileSyncDebugRows = () => {
    const _tick = profileSyncDebugTick();
    _tick;
    const connected = connectedPeerIds();
    const peerIds = new Set<string>([
      ...connected,
      ...profileSyncLastRequestAtByPeer.keys(),
    ]);
    return [...peerIds]
      .sort((a, b) => a.localeCompare(b))
      .map((peerId) => ({
        peerId,
        connected: connected.has(peerId),
        lastRequestedAt: profileSyncLastRequestAtByPeer.get(peerId) ?? null,
      }));
  };

  const appVersion = () => {
    const fromEnv = import.meta.env.VITE_APP_VERSION as string | undefined;
    return fromEnv && fromEnv.trim().length > 0 ? fromEnv.trim() : "dev";
  };

  return (
    <Switch>
      <Match when={onboardingState().status === "checking"}>
        <div class="text-center py-20 font-sans bg-tg-chat min-h-screen">
          <p class="text-tg-text-dim">Loading...</p>
        </div>
      </Match>

      <Match when={onboardingState().status === "no-account"}>
        <OnboardingScreen
          onCreateAccount={() => void handleCreateAccount()}
          onImportAccount={(phrase) => void handleImportAccount(phrase)}
        />
      </Match>

      <Match when={onboardingState().status === "display-name-prompt"}>
        <DisplayNamePrompt
          defaultUsePublicBootstrapNodes={usePublicBootstrapNodes()}
          onSubmit={(name, options) => void handleDisplayNameSet(name, options)}
        />
      </Match>

      <Match when={onboardingState().status === "ready"}>
        <Show when={chatStatus() === "connecting"}>
          <div class="flex items-center justify-center min-h-screen bg-tg-chat font-sans">
            <div class="text-center">
              <div class="w-8 h-8 border-2 border-tg-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p class="text-tg-text-dim text-sm">Connecting to network...</p>
            </div>
          </div>
        </Show>

        <Show when={chatStatus() === "disconnected"}>
          <div class="flex items-center justify-center min-h-screen bg-tg-chat font-sans">
            <div class="text-center space-y-3 px-6">
              <p class="text-tg-text text-sm">Failed to connect to network.</p>
              <p class="text-tg-text-dim text-xs break-all">{chatError() || "Reload the page to retry."}</p>
            </div>
          </div>
        </Show>

        <Show when={chatStatus() === "connected" && chat}>
          <ChatLayout
            messageInputInsetPx={(hasAndroidBridge() ? 14 : 8) + keyboardInsetPx()}
            header={
              <HeaderBar
                peerId={chat!.peerId}
                connectionStatus={chatStatus()}
                activeGroupId={groupState().activeGroupId}
                activeGroupName={activeGroupName()}
                activeGroupIsDirectMessage={!!activeDirectMessagePeerId() || (actionChainState()?.isDirectMessage ?? false)}
                activeDirectMessageConnected={
                  (() => {
                    const activeDmPeer = activeDirectMessagePeerId();
                    return !!activeDmPeer && connectedPeerIds().has(activeDmPeer);
                  })()
                }
                activeDirectMessageStatusLabel={activeDirectMessagePresence()?.label}
                activeDirectMessageStatusTone={activeDirectMessagePresence()?.tone}
                memberCount={actionChainState()?.members.size ?? 0}
                callInProgress={activeCallInProgress()}
                callParticipantCount={activeCallParticipantCount()}
                callMuted={activeCallMuted()}
                callError={activeCallError()}
                incomingCallPrompt={activeIncomingCallPrompt() ? {
                  senderLabel: directMessagePeerLabel(activeIncomingCallPrompt()!.senderPeerId),
                  targeted: activeIncomingCallPrompt()!.targeted,
                } : null}
                canJoinCall={
                  !!groupState().activeGroupId &&
                  (
                    activeCallInProgress() ||
                    (activeCallParticipantCount() < 8)
                  )
                }
                canRingCall={!!groupState().activeGroupId}
                ringButtonLabel={actionChainState()?.isDirectMessage ? "Ring" : "Nudge"}
                onJoinCall={() => void handleJoinOrStartCall()}
                onRingCall={() => void handleRingOrNudgeCall()}
                onLeaveCall={() => void handleLeaveCall()}
                onToggleMute={() => handleToggleCallMute()}
                onAcceptIncomingCall={() => void handleAcceptIncomingCall()}
                onDeclineIncomingCall={() => void handleDeclineIncomingCall()}
                showBackButton={mobileView().currentView === "chat"}
                onBackPress={() => dispatchMobileView({ type: "back-pressed" })}
                onProfileToggle={() => dispatchMobileView({ type: "profile-toggled" })}
                onDevDrawerToggle={() => dispatchMobileView({ type: "dev-drawer-toggled" })}
                onAboutToggle={() => dispatchMobileView({ type: "about-toggled" })}
                onContactsToggle={() => dispatchMobileView({ type: "contacts-toggled" })}
                onGroupInfoToggle={() => dispatchMobileView({ type: "group-info-toggled" })}
                onFocusComposer={focusComposerFromMenu}
                onToggleComposerKeyboard={toggleComposerKeyboardFromMenu}
              />
            }
            sidebar={
              <GroupSidebar
                groups={sidebarGroups()}
                activeGroupId={groupState().activeGroupId}
                topBanners={
                  <>
                    <div class="bg-red-500/15 border-b border-red-500/30 px-3 py-2">
                      <p class="text-red-400 text-[11px] leading-tight">
                        Beta software. Messages are <strong>not encrypted</strong> and may be lost.
                      </p>
                    </div>
                    <Show when={backupPending()}>
                      <BackupBanner
                        seedPhrase={seedPhrase()}
                        onBackupConfirmed={() => void handleBackupConfirmed()}
                      />
                    </Show>
                  </>
                }
                onSelectGroup={handleSelectGroup}
                onJoinViaInvite={handleJoinViaInvite}
                onCreateGroup={handleCreateGroup}
                onStartDirectMessage={handleStartDirectMessage}
                pendingDirectMessageRequests={pendingDirectMessageRequestRows()}
                onAcceptDirectMessageRequest={handleAcceptDirectMessageRequest}
                onDeclineDirectMessageRequest={handleDeclineDirectMessageRequest}
                onLeaveGroup={handleLeaveGroup}
              />
            }
            messageList={
              <div class="h-full flex flex-col min-h-0">
                <Show when={activeCallState()}>
                  <div class="border-b border-tg-border bg-tg-header/60 px-3 py-2">
                    <div class="flex items-center justify-between mb-1">
                      <div class="text-[10px] uppercase tracking-wider text-tg-text-dim">
                        Call Participants
                      </div>
                      <div class="flex items-center gap-2">
                        <Show when={activeCallAudioOutputBlocked()}>
                          <button
                            class="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-tg-border text-tg-text hover:bg-tg-hover cursor-pointer"
                            onClick={() => void handleResumeCallAudio()}
                          >
                            Enable Audio
                          </button>
                        </Show>
                        <Show when={activeCallDurationLabel()}>
                          {(duration) => (
                            <div class="text-[10px] uppercase tracking-wider text-tg-success">
                              Live {duration()}
                            </div>
                          )}
                        </Show>
                      </div>
                    </div>
                    <div class="flex gap-2 overflow-x-auto pb-1">
                      <For each={activeCallParticipants()}>
                        {(participant) => (
                          <div
                            class="min-w-[170px] max-w-[220px] rounded-lg border border-tg-border bg-tg-sidebar px-2.5 py-2 transition-[box-shadow,border-color] duration-150"
                            style={{
                              "box-shadow": participant.speakingLevel > 0
                                ? `0 0 ${8 + Math.round(participant.speakingLevel * 14)}px rgba(34, 197, 94, ${(participant.speakingLevel * 0.38).toFixed(3)})`
                                : "none",
                              "border-color": participant.speakingLevel > 0
                                ? `rgba(34, 197, 94, ${(0.18 + participant.speakingLevel * 0.45).toFixed(3)})`
                                : "",
                            }}
                          >
                            <div class="flex items-center justify-between gap-2">
                              <div class="text-xs text-tg-text truncate">
                                {participant.label}
                              </div>
                              <div
                                class="flex items-end gap-[2px] h-3 shrink-0"
                                title={participant.speaking ? "Speaking" : "Quiet"}
                                aria-label={participant.speaking ? "Speaking" : "Quiet"}
                              >
                                <For each={[0, 1, 2]}>
                                  {(barIndex) => {
                                    const barLevel = Math.max(0, Math.min(1, participant.speakingLevel * 1.5 - (barIndex * 0.24)));
                                    return (
                                      <span
                                        class="inline-block w-1 rounded-full bg-tg-success transition-all duration-150"
                                        style={{
                                          height: `${3 + Math.round(barLevel * 9)}px`,
                                          opacity: `${0.3 + (barLevel * 0.7)}`,
                                        }}
                                      />
                                    );
                                  }}
                                </For>
                              </div>
                            </div>
                            <div class="text-[10px] text-tg-text-dim mt-1">
                              {participant.micMuted
                                ? "Mic muted"
                                : participant.speaking
                                  ? "Speaking"
                                  : "Mic live"}
                            </div>
                            <div class="text-[10px] text-tg-text-dim mt-1 flex items-center gap-1.5">
                              <span
                                class="inline-block w-1.5 h-1.5 rounded-full"
                                classList={{
                                  "bg-tg-success": participant.quality === "excellent" || participant.quality === "good",
                                  "bg-tg-warning": participant.quality === "fair",
                                  "bg-tg-danger": participant.quality === "poor",
                                  "bg-tg-text-dim": participant.quality === "unknown",
                                }}
                              />
                              <span>
                                {participant.pingMs === null
                                  ? "Ping --"
                                  : `Ping ${Math.round(participant.pingMs)}ms`}
                              </span>
                              <span class="uppercase tracking-wide">{participant.quality}</span>
                            </div>
                            <Show when={!participant.isSelf}>
                              <button
                                class="mt-1.5 text-[10px] px-2 py-1 rounded border border-tg-border text-tg-text hover:bg-tg-hover cursor-pointer"
                                onClick={() => toggleParticipantOutputMute(participant.peerId)}
                              >
                                {participant.outputMuted ? "Unmute output" : "Mute output"}
                              </button>
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
                <div class="flex-1 min-h-0">
                  <MessageList
                    messages={getActiveMessages(groupState())}
                    ownPeerId={chat!.peerId}
                    resolveSenderLabel={resolveMessageSenderLabel}
                    readByMessageId={activeMessageReadersByMessageId()}
                    editedAtByMessageId={activeEditedAtByMessageId()}
                    isDirectMessage={actionChainState()?.isDirectMessage ?? false}
                    onReplyMessage={handleReplyMessage}
                    onEditMessage={handleEditMessage}
                    onDeleteMessage={handleDeleteMessage}
                  />
                </div>
              </div>
            }
            messageInput={
              <MessageInput
                onSend={handleSendMessage}
                value={messageDraft()}
                onValueChange={setMessageDraft}
                disabled={
                  chatStatus() !== "connected" ||
                  getActiveGroup(groupState()) === null ||
                  (getActiveGroup(groupState())?.hasActionChain === true && !actionChainState()?.members.has(ownPublicKeyHex())) ||
                  ((actionChainState()?.isDirectMessage ?? false) && !(actionChainState()?.dmHandshakeComplete ?? false)) ||
                  isDirectMessageBlocked(activeDirectMessagePeerId())
                }
                modeLabel={(() => {
                  const editTarget = editTargetMessage();
                  if (editTarget) return "Editing message";
                  const replyTarget = replyTargetMessage();
                  if (!replyTarget) return null;
                  return `Replying to ${resolveMessageSenderLabel(
                    replyTarget.senderPeerId,
                    replyTarget.senderDisplayName,
                  )}`;
                })()}
                modePreview={(() => {
                  const editTarget = editTargetMessage();
                  if (editTarget) return visibleMessageText(editTarget.text);
                  const replyTarget = replyTargetMessage();
                  if (replyTarget) return visibleMessageText(replyTarget.text);
                  return null;
                })()}
                onCancelMode={
                  editTargetMessage() || replyTargetMessage()
                    ? () => {
                        setEditTargetMessage(null);
                        setReplyTargetMessage(null);
                      }
                    : null
                }
                placeholder={
                  isDirectMessageBlocked(activeDirectMessagePeerId())
                    ? "You blocked this peer"
                    : (actionChainState()?.isDirectMessage ?? false) && !(actionChainState()?.dmHandshakeComplete ?? false)
                      ? "Waiting for DM acceptance handshake..."
                    : getActiveGroup(groupState())?.hasActionChain === true && !actionChainState()?.members.has(ownPublicKeyHex())
                      ? "Waiting for approval..."
                      : undefined
                }
                onControlReady={setMessageInputControl}
              />
            }
            devDrawerContent={
              <>
                <PeerSharingPanel
                  ownPeerId={chat!.peerId}
                  networkStatus={networkStatus()}
                  onConnect={(targetPeerId) => chat!.connectToPeerId(targetPeerId)}
                />
                <div class="rounded-xl border border-tg-border bg-tg-chat p-4 mb-4">
                  <div class="flex items-center justify-between gap-2 mb-1.5">
                    <strong class="text-sm text-tg-text">Diagnostics Recorder</strong>
                    <button
                      onClick={startDiagnosticsRecording}
                      disabled={diagnosticsRecorder().status === "recording"}
                      class="border border-tg-border rounded px-2 py-0.5 text-tg-text text-xs cursor-pointer disabled:opacity-40"
                    >
                      {diagnosticsRecorder().status === "recording" ? "Recording..." : "Record 3m"}
                    </button>
                  </div>
                  <p class="text-[10px] text-tg-text-dim mb-2">
                    Captures app-wide activity: network, group/DM flows, UI transitions, profile sync, errors, and console output.
                  </p>
                  <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-tg-text font-mono">
                    <span class="text-tg-text-dim">Status</span>
                    <span class="capitalize">{diagnosticsRecorder().status}</span>
                    <span class="text-tg-text-dim">Remaining</span>
                    <span>
                      {diagnosticsRecorder().status === "recording"
                        ? formatDiagnosticsCountdown(diagnosticsRecorder().remainingMs)
                        : "--"}
                    </span>
                    <span class="text-tg-text-dim">Entries</span>
                    <span>{diagnosticsRecorder().entryCount}</span>
                    <span class="text-tg-text-dim">Last file</span>
                    <span>{diagnosticsRecorder().artifact?.filename ?? "--"}</span>
                    <span class="text-tg-text-dim">File size</span>
                    <span>{formatDiagnosticsBytes(diagnosticsRecorder().artifact?.sizeBytes ?? null)}</span>
                  </div>
                  <Show when={diagnosticsRecorder().status === "ready" && diagnosticsRecorder().artifact}>
                    <button
                      onClick={downloadDiagnosticsRecording}
                      class="mt-2 w-full border border-tg-border rounded px-2 py-1 text-tg-text text-xs cursor-pointer"
                    >
                      Download Recording
                    </button>
                  </Show>
                </div>
                <div class="rounded-xl border border-tg-border bg-tg-chat p-4 mb-4">
                  <div class="flex items-center justify-between gap-2 mb-1.5">
                    <strong class="text-sm text-tg-text">Bootstrap Nodes</strong>
                    <label class="inline-flex items-center gap-2 text-xs text-tg-text cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={usePublicBootstrapNodes()}
                        onChange={(event) => setBootstrapPreference(event.currentTarget.checked)}
                        class="accent-tg-accent"
                      />
                      <span>{usePublicBootstrapNodes() ? "Public on" : "Public off"}</span>
                    </label>
                  </div>
                  <p class="text-[10px] text-tg-text-dim mb-1">
                    Use IPFS public bootstrap nodes in addition to your configured relay addresses.
                  </p>
                  <p class="text-[10px] text-tg-text-dim">
                    Changing this affects new networking sessions. Reconnect to fully apply.
                  </p>
                </div>
                <Show when={hasAndroidBridge()}>
                  <div class="rounded-xl border border-tg-border bg-tg-chat p-4 mb-4">
                    <div class="flex items-center justify-between gap-2 mb-1.5">
                      <strong class="text-sm text-tg-text">Background Node Mode</strong>
                      <button
                        onClick={() => void toggleBackgroundNodeMode()}
                        disabled={backgroundNodeBusy()}
                        class="border border-tg-border rounded px-2 py-0.5 text-tg-text text-xs cursor-pointer disabled:opacity-40"
                      >
                        {backgroundNodeBusy()
                          ? "Applying..."
                          : backgroundNodeRunning()
                            ? "Stop"
                            : "Start"}
                      </button>
                    </div>
                    <p class="text-[10px] text-tg-text-dim mb-2">
                      Keeps Anypost networking active in the background with a persistent Android notification.
                    </p>
                    <div class="text-[10px] font-mono text-tg-text">
                      State: {backgroundNodeRunning() ? "running" : "stopped"}
                    </div>
                  </div>
                </Show>
                <NetworkPanel
                  networkStatus={networkStatus()}
                  relayPoolState={relayPoolState()}
                  groupDiscoveryState={groupDiscoveryState()}
                  relayCandidateState={relayCandidateState()}
                  relayReservationState={relayReservationState()}
                  relayContactBook={relayContactBook()}
                  peerPathCache={peerPathCache()}
                  pinnedPeerWatchdogState={pinnedPeerWatchdogState()}
                  connectionReasonCounts={connectionReasonCounts()}
                  connectionMetrics={connectionMetrics()}
                  displayName={displayName()}
                  latencyMap={latencyMap()}
                  contactsBook={contactsBook()}
                  pinnedPeerIds={pinnedPeerIds()}
                  dmOutgoingDebug={dmOutgoingDebugRows()}
                  pendingDmDebug={pendingDmDebugRows()}
                  profileSyncDebug={profileSyncDebugRows()}
                  onAddRelay={handleAddRelay}
                  onClearRelayContactBook={handleClearRelayContactBook}
                  onClearPeerPathCache={handleClearPeerPathCache}
                  onClearConnectionReasons={handleClearConnectionReasons}
                />
                <EventLog
                  events={eventLog()}
                  onClear={() => setEventLog([])}
                />
              </>
            }
            groupInfoContent={
              <Show
                when={actionChainState()?.isDirectMessage}
                fallback={
                  <GroupInfoPanel
                    groupId={groupState().activeGroupId}
                    groupName={activeGroupName() ?? "Unknown Group"}
                    members={actionChainState()?.members ?? new Map()}
                    actionEnvelopes={chat?.getActionChainEnvelopes(groupState().activeGroupId ?? "") ?? []}
                    connectionMetrics={connectionMetrics()}
                    activeGroupDiscoveryMetrics={activeGroupDiscoveryMetrics()}
                    joinRetryEntry={activeJoinRetryEntry()}
                    syncProgressByPeer={activeSyncProgressByPeer()}
                    pendingJoins={pendingJoinsMap().get(groupState().activeGroupId ?? "") ?? []}
                    joinPolicy={actionChainState()?.joinPolicy ?? "manual"}
                    isAdmin={isCurrentUserAdmin()}
                    ownRole={ownRole()}
                    ownPublicKeyHex={ownPublicKeyHex()}
                    ownDisplayName={displayName()}
                    publicKeyToPeerId={publicKeyToPeerIdMap()}
                    contactsBook={contactsBook()}
                    connectedPeerIds={connectedPeerIds()}
                    latencyMap={latencyMap()}
                    directMessagePeerId={activeDirectMessagePeerId()}
                    directMessagePeerLabel={directMessagePeerLabel(activeDirectMessagePeerId())}
                    directMessageBlocked={isDirectMessageBlocked(activeDirectMessagePeerId())}
                    onSetDirectMessageBlocked={(peerId, blocked) => setPeerBlocked(peerId, blocked)}
                    onStartDirectMessage={handleStartDirectMessageFromGroupInfo}
                    onApproveJoin={handleApproveJoin}
                    onRemoveMember={handleRemoveMember}
                    onChangeMemberRole={isCurrentUserAdmin() ? handleChangeMemberRole : null}
                    onAddByPeerId={handleAddByPeerId}
                    onRetryJoinNow={handleRetryJoinNow}
                    onCancelJoinRetry={handleCancelJoinRetry}
                    onCreateInvite={
                      (chat?.getActionChainEnvelopes(groupState().activeGroupId ?? "")?.length ?? 0) > 0
                        ? handleCreateInvite
                        : null
                    }
                    onSetJoinPolicy={isCurrentUserAdmin() ? handleSetJoinPolicy : null}
                    onRenameGroup={
                      isCurrentUserAdmin() && !(actionChainState()?.isDirectMessage ?? false)
                        ? handleRenameGroup
                        : null
                    }
                  />
                }
              >
                <DirectMessageInfoPanel
                  groupId={groupState().activeGroupId}
                  peerId={activeDirectMessagePeerId()}
                  peerLabel={directMessagePeerLabel(activeDirectMessagePeerId())}
                  peerPresenceLabel={activeDirectMessagePresence()?.label}
                  peerPresenceTone={activeDirectMessagePresence()?.tone}
                  blocked={isDirectMessageBlocked(activeDirectMessagePeerId())}
                  handshakeComplete={actionChainState()?.dmHandshakeComplete ?? false}
                  missingPeerIds={chat?.getDirectMessageHandshakeState(groupState().activeGroupId ?? "")?.missingPeerIds ?? []}
                  actionEnvelopes={chat?.getActionChainEnvelopes(groupState().activeGroupId ?? "") ?? []}
                  onSetBlocked={(peerId, blocked) => setPeerBlocked(peerId, blocked)}
                />
              </Show>
            }
            contactsContent={
              <ContactsBookPage
                contactsBook={contactsBook()}
                ownPeerId={chat!.peerId}
                connectedPeerIds={connectedPeerIds()}
                latencyMap={latencyMap()}
                onSetNickname={handleSetContactNickname}
                onStartDirectMessage={handleStartDirectMessageFromContacts}
              />
            }
            profileContent={
              <ProfilePage
                peerId={chat!.peerId}
                displayName={displayName()}
                onSaveDisplayName={handleProfileDisplayNameSave}
              />
            }
            aboutContent={
              <AboutPage
                githubUrl={PROJECT_GITHUB_URL}
                appVersion={appVersion()}
              />
            }
            mobileView={mobileView().currentView}
            rightPanel={mobileView().rightPanel}
            onRightPanelClose={() => {
              const panel = mobileView().rightPanel;
              if (panel === "dev-tools") {
                dispatchMobileView({ type: "dev-drawer-closed" });
              } else if (panel === "group-info") {
                dispatchMobileView({ type: "group-info-closed" });
              } else if (panel === "contacts") {
                dispatchMobileView({ type: "contacts-closed" });
              } else if (panel === "profile") {
                dispatchMobileView({ type: "profile-closed" });
              } else if (panel === "about") {
                dispatchMobileView({ type: "about-closed" });
              }
            }}
          />
        </Show>
      </Match>
    </Switch>
  );
};
