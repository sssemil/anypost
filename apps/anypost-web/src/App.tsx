import { createSignal, createEffect, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import {
  createMultiGroupChat,
  createMultiGroupState,
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
} from "anypost-core/protocol";
import { getCandidatesByRtt } from "anypost-core/protocol";
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
import { NetworkPanel } from "./network/NetworkPanel.js";
import { EventLog } from "./network/EventLog.js";
import { GroupInfoPanel } from "./chat/GroupInfoPanel.js";
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
const GROUPS_STORAGE_KEY = "anypost:groups";
const ACTION_CHAINS_STORAGE_KEY = "anypost:action-chains";
const PUBKEY_PEERID_STORAGE_KEY = "anypost:pubkey-peerid";
const PENDING_JOINS_STORAGE_KEY = "anypost:pending-joins";
const RELAY_HINTS_STORAGE_KEY = "anypost:relay-hints";
const PENDING_DM_REQUESTS_STORAGE_KEY = "anypost:pending-dm-requests";
const OUTGOING_DM_REQUESTS_STORAGE_KEY = "anypost:outgoing-dm-requests";
const MAX_EVENTS = 200;
const SYSTEM_SENDER_ID = "__system__";
const CONTACTS_LAST_SEEN_UPDATE_MS = 60_000;
const CONTACTS_SELF_NAME_HISTORY_LIMIT = 12;
const PROFILE_SYNC_REQUEST_COOLDOWN_MS = 15_000;
const DM_SELF_JOIN_REQUEST_COOLDOWN_MS = 15_000;
const OUTGOING_DM_RETRY_INTERVAL_MS = 5_000;
const OUTGOING_DM_RETRY_SWEEP_MS = 4_000;
const PROJECT_GITHUB_URL = "https://github.com/sssemil/anypost";

const hexToBytes = (hex: string): Uint8Array<ArrayBuffer> => {
  const buf = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
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
    return parsed.filter((entry): entry is PendingDirectMessageRequest =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).requestId === "string" &&
      typeof (entry as Record<string, unknown>).senderPeerId === "string" &&
      typeof (entry as Record<string, unknown>).groupId === "string" &&
      typeof (entry as Record<string, unknown>).groupName === "string" &&
      typeof (entry as Record<string, unknown>).inviteCode === "string" &&
      typeof (entry as Record<string, unknown>).sentAt === "number");
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
    return parsed.filter((entry): entry is OutgoingDirectMessageRequest =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).requestKey === "string" &&
      typeof (entry as Record<string, unknown>).targetPeerId === "string" &&
      typeof (entry as Record<string, unknown>).groupId === "string" &&
      typeof (entry as Record<string, unknown>).groupName === "string" &&
      typeof (entry as Record<string, unknown>).inviteCode === "string" &&
      typeof (entry as Record<string, unknown>).createdAt === "number" &&
      (typeof (entry as Record<string, unknown>).lastAttemptAt === "number" ||
        (entry as Record<string, unknown>).lastAttemptAt === null) &&
      typeof (entry as Record<string, unknown>).attemptCount === "number" &&
      typeof (entry as Record<string, unknown>).nextAttemptAt === "number")
      .map((entry) => ({
        ...entry,
        attemptCount: Math.max(0, Math.floor(entry.attemptCount)),
      }));
  } catch {
    return [];
  }
};

const saveOutgoingDirectMessageRequests = (requests: readonly OutgoingDirectMessageRequest[]) => {
  localStorage.setItem(OUTGOING_DM_REQUESTS_STORAGE_KEY, JSON.stringify(requests));
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
  const [displayName, setDisplayNameState] = createSignal("");
  const [relayPoolState, setRelayPoolState] = createSignal<RelayPoolState | null>(null);
  const [groupDiscoveryState, setGroupDiscoveryState] = createSignal<GroupDiscoveryState | null>(null);
  const [relayCandidateState, setRelayCandidateState] = createSignal<RelayCandidateState | null>(null);
  const [relayReservationState, setRelayReservationState] = createSignal<RelayReservationState | null>(null);
  const [networkStatus, setNetworkStatus] = createSignal<NetworkStatus | null>(null);
  const [eventLog, setEventLog] = createSignal<readonly NetworkEvent[]>([]);
  const [latencyMap, setLatencyMap] = createSignal<ReadonlyMap<string, number>>(new Map());
  const [connectionMetrics, setConnectionMetrics] = createSignal<ConnectionMetrics | null>(null);
  const [peerDiscoveryMetricsByGroup, setPeerDiscoveryMetricsByGroup] = createSignal<ReadonlyMap<string, PeerDiscoveryMetrics>>(new Map());
  const [joinRetryState, setJoinRetryState] = createSignal<JoinRetryState>(new Map());
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

  let chat: MultiGroupChat | undefined;
  let unsubscribeMessage: (() => void) | undefined;
  let unsubscribeEvents: (() => void) | undefined;
  let unsubscribeJoinRequests: (() => void) | undefined;
  let unsubscribeDirectMessageRequests: (() => void) | undefined;
  let statusInterval: ReturnType<typeof setInterval> | undefined;
  let pingInterval: ReturnType<typeof setInterval> | undefined;
  let outgoingDmRetrySweepInFlight = false;
  const profileSyncLastRequestAtByPeer = new Map<string, number>();
  const dmSelfJoinLastRequestAtByGroup = new Map<string, number>();

  const dispatchMobileView = (event: Parameters<typeof transitionMobileView>[1]) => {
    setMobileView((s) => transitionMobileView(s, event));
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

  const syncMessagesFromActionChain = (groupId: string) => {
    const currentChat = chat;
    if (!currentChat) return;
    const chainState = currentChat.getActionChainState(groupId);
    const envelopes = currentChat.getActionChainEnvelopes(groupId);
    if (envelopes.length === 0) return;

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

    for (const envelope of envelopes) {
      const decoded = verifyAndDecodeAction(envelope);
      if (!decoded.success) continue;
      const action = decoded.data;
      if (action.payload.type === "member-approved") {
        const indicatorId = `join:${action.id}`;
        if (existingIds.has(indicatorId)) continue;
        const joinedLabel = memberLabelFromPublicKey(action.payload.memberPublicKey);
        dispatchGroupEvent({
          type: "message-received",
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
          type: "message-received",
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
          type: "message-received",
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

  createEffect(() => {
    const activeId = groupState().activeGroupId;
    refreshActionChainState();
    if (activeId) syncMessagesFromActionChain(activeId);
  });

  const dispatchGroupEvent = (event: Parameters<typeof transitionMultiGroup>[1]) => {
    setGroupState((s) => {
      const next = transitionMultiGroup(s, event);
      savePersistedGroups(next, chat);
      return next;
    });
  };

  onMount(async () => {
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
    } catch {
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
    } catch {
      // noop
    }
  };

  const handleDisplayNameSet = async (name: string) => {
    const state = onboardingState();
    if (state.status !== "display-name-prompt") return;

    try {
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
    } catch {
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
      return null;
    } catch (error) {
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
    } catch {
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
          dispatchGroupEvent({ type: "message-received", groupId, message: msg });
        }
      }
      syncMessagesFromActionChain(groupId);
    }

    if (persisted.activeGroupId) {
      dispatchGroupEvent({ type: "group-selected", groupId: persisted.activeGroupId });
    }

    refreshActionChainState();
  };

  const startChat = async (accountKey: AccountKey) => {
    try {
      const bootstrapPeers = ENV_RELAY_MULTIADDR ? [ENV_RELAY_MULTIADDR] : [];
      const initialRelayHints = loadRelayHints();
      type PeerPathCacheStoreCompat = {
        readonly getPeerPathCache?: () => Promise<ReadonlyMap<string, readonly string[]>>;
        readonly savePeerPathCache?: (cache: ReadonlyMap<string, readonly string[]>) => Promise<void>;
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
        initialJoinRetryState,
        initialSyncProgressState,
        initialRelayHints,
        bootstrapPeers,
        discoveryProfile: "aggressive",
        onRelayPoolStateChange: setRelayPoolState,
        onGroupDiscoveryStateChange: setGroupDiscoveryState,
        onRelayCandidateStateChange: setRelayCandidateState,
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
          persistPeerPathCache(cache);
        },
        onJoinRetryStateChange: (state) => {
          setJoinRetryState(state);
          persistJoinRetryState(state);
        },
        onSyncProgressStateChange: (state) => {
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

      setChatStatus("connected");

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
          for (const peer of current.peers) {
            maybeRequestProfileSync(peer.peerId);
          }
        }
      });

      statusInterval = setInterval(() => {
        refreshNetworkStatus();
        const current = chat?.getNetworkStatus();
        if (current) {
          for (const peer of current.peers) {
            maybeRequestProfileSync(peer.peerId);
          }
        }
        const activeId = groupState().activeGroupId;
        if (activeId) syncMessagesFromActionChain(activeId);
      }, 3000);

      void runPingSweep();
      pingInterval = setInterval(() => void runPingSweep(), PING_SWEEP_INTERVAL);

      unsubscribeEvents = chat.onEvent((evt) => {
        setEventLog((prev) => [...prev.slice(-(MAX_EVENTS - 1)), evt]);
      });

      unsubscribeMessage = chat.onMessage((msg) => {
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
      });

      unsubscribeJoinRequests = chat.onJoinRequest((evt) => {
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
        if (blockedPeerIds().has(evt.senderPeerId)) return;
        upsertContact(evt.senderPeerId, { groupId: evt.groupId });
        maybeRequestProfileSync(evt.senderPeerId);
        setDirectMessagePeerForGroup(evt.groupId, evt.senderPeerId);
        upsertPendingDirectMessageRequest(evt);
      });
    } catch {
      setChatStatus("disconnected");
    }
  };

  onCleanup(() => {
    unsubscribeMessage?.();
    unsubscribeEvents?.();
    unsubscribeJoinRequests?.();
    unsubscribeDirectMessageRequests?.();
    if (statusInterval) clearInterval(statusInterval);
    if (pingInterval) clearInterval(pingInterval);
    chat?.stop();
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

  const handleSendMessage = (text: string) => {
    const currentChat = chat;
    const activeGroup = getActiveGroup(groupState());
    if (!currentChat || !activeGroup) return;

    const groupId = activeGroup.groupId;

    const name = displayName() || undefined;
    currentChat.sendMessage(groupId, text, name).then(() => {
      upsertContact(currentChat.peerId, {
        selfName: name ?? null,
        groupId,
      });
      dispatchGroupEvent({
        type: "message-sent",
        groupId,
        message: {
          id: crypto.randomUUID(),
          senderPeerId: currentChat.peerId,
          senderDisplayName: name,
          text,
          timestamp: Date.now(),
        },
      });
    }).catch(() => {
      setChatStatus("disconnected");
    });
  };

  const handleJoinViaInvite = async (invite: GroupInvite): Promise<string | null> => {
    const currentChat = chat;
    if (!currentChat) return "Not connected";

    try {
      const { groupId } = await currentChat.joinViaInvite(invite);
      const chainState = currentChat.getActionChainState(groupId);
      const groupName = chainState?.isDirectMessage
        ? "Direct Message"
        : (chainState?.groupName || "Unnamed Group");
      dispatchGroupEvent({ type: "group-joined", groupId, groupName, hasActionChain: true });
      dispatchGroupEvent({ type: "group-selected", groupId });
      refreshActionChainState();
      syncMessagesFromActionChain(groupId);
      dispatchMobileView({ type: "group-selected" });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Join failed";
    }
  };

  const handleCreateGroup = async (name: string): Promise<string | null> => {
    const currentChat = chat;
    if (!currentChat) return "Not connected";
    const trimmed = name.trim();
    if (trimmed.length === 0) return "Group name cannot be empty";

    try {
      const { groupId } = await currentChat.createGroup(trimmed);
      const groupName = currentChat.getActionChainState(groupId)?.groupName ?? trimmed;
      dispatchGroupEvent({ type: "group-created", groupId, groupName });
      dispatchGroupEvent({ type: "group-selected", groupId });
      refreshActionChainState();
      dispatchMobileView({ type: "group-selected" });
      dispatchMobileView({ type: "group-info-toggled" });
      return null;
    } catch (error) {
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
      // DM genesis starts with one local owner; consider remote joined only when
      // chain membership actually grows beyond that.
      return chainState.members.size >= 2;
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
            groupName: request.groupName,
            inviteCode: request.inviteCode,
            nextAttemptAt: immediateRetry ? now : existing.nextAttemptAt,
          }
        : {
            requestKey,
            targetPeerId: request.targetPeerId,
            groupId: request.groupId,
            groupName: request.groupName,
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
        const ownKeyHex = ownPublicKeyHex();
        const ownMembershipMissing = !!state && !!ownKeyHex && !state.members.has(ownKeyHex);
        if (ownMembershipMissing) {
          const lastRequestedAt = dmSelfJoinLastRequestAtByGroup.get(entry.groupId) ?? 0;
          if (now - lastRequestedAt >= DM_SELF_JOIN_REQUEST_COOLDOWN_MS) {
            dmSelfJoinLastRequestAtByGroup.set(entry.groupId, now);
            void currentChat.requestJoin(entry.groupId).catch(() => {});
          }
        }
        if (targetPeerHasJoinedGroup(entry.groupId, entry.targetPeerId)) {
          continue;
        }
        if (blockedPeerIds().has(entry.targetPeerId)) {
          continue;
        }
        if (entry.nextAttemptAt > now) {
          nextQueue.push(entry);
          continue;
        }

        try {
          void currentChat.connectToPeerId(entry.targetPeerId).catch(() => {});
          await currentChat.sendDirectMessageRequest({
            targetPeerId: entry.targetPeerId,
            groupId: entry.groupId,
            groupName: entry.groupName,
            inviteCode: entry.inviteCode,
          });
        } catch {
          // Retry on fixed cadence whether publish succeeded or failed.
        }

        const nextAttemptCount = entry.attemptCount + 1;
        nextQueue.push({
          ...entry,
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
    void currentChat.requestProfile(target).catch(() => {});
  };

  const handleStartDirectMessage = async (targetPeerId: string): Promise<string | null> => {
    const currentChat = chat;
    if (!currentChat) return "Not connected";
    const trimmedTarget = targetPeerId.trim();
    if (!isValidPeerId(trimmedTarget)) return "Invalid peer ID";
    if (trimmedTarget === currentChat.peerId) return "Cannot DM yourself";
    maybeRequestProfileSync(trimmedTarget);

    try {
      const dmGroupId = await deriveDirectMessageGroupId(currentChat.peerId, trimmedTarget);
      setDirectMessagePeerForGroup(dmGroupId, trimmedTarget);
      upsertContact(trimmedTarget, { groupId: dmGroupId });

      const existingGroup = groupState().groups.get(dmGroupId);
      let chainState = currentChat.getActionChainState(dmGroupId);
      if (!chainState || chainState.createdAt <= 0) {
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

      const dmState = currentChat.getActionChainState(dmGroupId);
      const ownRoleInDm = ownPublicKeyHex()
        ? dmState?.members.get(ownPublicKeyHex())?.role
        : undefined;
      if (
        dmState &&
        dmState.joinPolicy !== "auto_with_invite" &&
        (ownRoleInDm === "owner" || ownRoleInDm === "admin")
      ) {
        try {
          await currentChat.setJoinPolicy(dmGroupId, "auto_with_invite");
        } catch {
          // Best-effort for legacy groups created before DM auto-invite policy.
        }
      }

      const targetPublicKeyHex = [...publicKeyToPeerIdMap().entries()]
        .find(([, peerId]) => peerId === trimmedTarget)?.[0];
      if (targetPublicKeyHex) {
        try {
          await currentChat.approveJoin(dmGroupId, hexToBytes(targetPublicKeyHex));
        } catch {
          // ignore; peer may already be approved or local node may not be admin
        }
      } else {
        const latestState = currentChat.getActionChainState(dmGroupId);
        const isLocalMember = latestState?.members.has(ownPublicKeyHex()) ?? false;
        if (!isLocalMember) {
          void currentChat.requestJoin(dmGroupId).catch(() => {});
        }
      }

      const invite = buildInviteCodeForGroup(dmGroupId, {
        kind: "targeted-peer",
        targetPeerId: trimmedTarget,
      });
      if (!invite.error && invite.code) {
        upsertOutgoingDirectMessageRequest({
          targetPeerId: trimmedTarget,
          groupId: dmGroupId,
          groupName: currentChat.getActionChainState(dmGroupId)?.groupName ?? "Direct Message",
          inviteCode: invite.code,
        });
        void runOutgoingDirectMessageRequestSweep();
      }

      void currentChat.connectToPeerId(trimmedTarget).catch(() => {});
      return null;
    } catch (error) {
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
      if (prev.some((request) => request.requestId === event.requestId)) return prev;
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
    const request = pendingDirectMessageRequests().find((entry) => entry.requestId === requestId);
    if (!request) return "DM request not found";

    const decoded = decodeGroupInvite(request.inviteCode);
    if (!decoded.success) return "Invalid DM invite";

    const error = await handleJoinViaInvite(decoded.data);
    if (!error) {
      setDirectMessagePeerForGroup(request.groupId, request.senderPeerId);
      removeOutgoingDirectMessageRequests((entry) =>
        entry.groupId === request.groupId && entry.targetPeerId === request.senderPeerId);
      removePendingDirectMessageRequest(requestId);
    }
    return error;
  };

  const handleDeclineDirectMessageRequest = (requestId: string) => {
    const request = pendingDirectMessageRequests().find((entry) => entry.requestId === requestId);
    if (!request) return;
    setPeerBlocked(request.senderPeerId, true);
    removePendingDirectMessageRequest(requestId);
  };

  const handleLeaveGroup = (groupId: string) => {
    chat?.leaveGroup(groupId).catch(() => {}).finally(() => {
      dispatchGroupEvent({ type: "group-left", groupId });
    });
  };

  const handleSelectGroup = (groupId: string) => {
    dispatchGroupEvent({ type: "group-selected", groupId });
    dispatchMobileView({ type: "group-selected" });
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
    chat?.addRelay(addr);
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
    if (result.code) {
      navigator.clipboard.writeText(result.code).catch(() => {});
    }
    return result;
  };

  const handleRetryJoinNow = () => {
    const currentChat = chat;
    const activeId = groupState().activeGroupId;
    if (!currentChat || !activeId) return;
    currentChat.retryJoinNow(activeId).catch(() => {});
  };

  const handleCancelJoinRetry = () => {
    const currentChat = chat;
    const activeId = groupState().activeGroupId;
    if (!currentChat || !activeId) return;
    currentChat.cancelJoinRetry(activeId);
  };

  const handleApproveJoin = (memberPublicKey: Uint8Array) => {
    const currentChat = chat;
    const activeId = groupState().activeGroupId;
    if (!currentChat || !activeId) return;

    currentChat.approveJoin(activeId, memberPublicKey).then(() => {
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
    }).catch(() => {});
  };

  const handleRemoveMember = (memberPublicKey: Uint8Array) => {
    const currentChat = chat;
    const activeId = groupState().activeGroupId;
    if (!currentChat || !activeId) return;

    currentChat.removeMember(activeId, memberPublicKey).then(() => {
      refreshActionChainState();
    }).catch(() => {});
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
      refreshActionChainState();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Failed to change role";
    }
  };

  const handleSetJoinPolicy = async (joinPolicy: JoinPolicy): Promise<string | null> => {
    const currentChat = chat;
    const activeId = groupState().activeGroupId;
    if (!currentChat || !activeId) return "No active group";
    try {
      await currentChat.setJoinPolicy(activeId, joinPolicy);
      refreshActionChainState();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Failed to update join policy";
    }
  };

  const handleRenameGroup = async (newName: string): Promise<string | null> => {
    const currentChat = chat;
    const activeId = groupState().activeGroupId;
    if (!currentChat || !activeId) return "No active group";
    try {
      await currentChat.renameGroup(activeId, newName);
      refreshActionChainState();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Failed to rename group";
    }
  };

  const handleAddByPeerId = (targetPeerId: string): string | null => {
    const currentChat = chat;
    const activeId = groupState().activeGroupId;
    if (!currentChat || !activeId) return "No active group";

    const pubKeyMap = publicKeyToPeerIdMap();
    let matchedPublicKeyHex: string | null = null;
    for (const [pubKeyHex, peerId] of pubKeyMap) {
      if (peerId === targetPeerId) {
        matchedPublicKeyHex = pubKeyHex;
        break;
      }
    }

    if (!matchedPublicKeyHex) return "Peer not found. They must join the network first so their identity can be discovered.";

    const pubKeyBytes = hexToBytes(matchedPublicKeyHex);
    currentChat.approveJoin(activeId, pubKeyBytes).then(() => {
      refreshActionChainState();
      syncMessagesFromActionChain(activeId);
    }).catch(() => {});

    return null;
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

  const setPeerBlocked = (peerId: string, blocked: boolean) => {
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
      const chainName = chat?.getActionChainState(g.groupId)?.groupName;
      const dmPeerId = directMessagePeerIdForGroup(g.groupId);
      const dmLabel = dmPeerId
        ? contactsBook().get(dmPeerId)?.nickname
          ?? contactsBook().get(dmPeerId)?.selfName
          ?? `${dmPeerId.slice(0, 12)}...`
        : null;
      const isDm = dmPeerId !== null;
      return {
        groupId: g.groupId,
        groupName: dmLabel ?? (chainName ?? g.groupName),
        isDirectMessage: isDm,
        directMessageConnected: isDm ? connectedPeerIds().has(dmPeerId!) : false,
        unreadCount: g.unreadCount,
        seenPeerCount: visiblePeerCount,
        lastMessage: lastMsg
          ? { text: lastMsg.text, timestamp: lastMsg.timestamp }
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
          onSubmit={(name) => void handleDisplayNameSet(name)}
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
              <p class="text-tg-text-dim text-xs">Reload the page to retry.</p>
            </div>
          </div>
        </Show>

        <Show when={chatStatus() === "connected" && chat}>
          <ChatLayout
            header={
              <HeaderBar
                peerId={chat!.peerId}
                connectionStatus={chatStatus()}
                activeGroupId={groupState().activeGroupId}
                activeGroupName={activeGroupName()}
                activeDirectMessageConnected={
                  (() => {
                    const activeDmPeer = activeDirectMessagePeerId();
                    return !!activeDmPeer && connectedPeerIds().has(activeDmPeer);
                  })()
                }
                memberCount={actionChainState()?.members.size ?? 0}
                showBackButton={mobileView().currentView === "chat"}
                onBackPress={() => dispatchMobileView({ type: "back-pressed" })}
                onProfileToggle={() => dispatchMobileView({ type: "profile-toggled" })}
                onDevDrawerToggle={() => dispatchMobileView({ type: "dev-drawer-toggled" })}
                onAboutToggle={() => dispatchMobileView({ type: "about-toggled" })}
                onContactsToggle={() => dispatchMobileView({ type: "contacts-toggled" })}
                onGroupInfoToggle={() => dispatchMobileView({ type: "group-info-toggled" })}
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
              <MessageList
                messages={getActiveMessages(groupState())}
                ownPeerId={chat!.peerId}
              />
            }
            messageInput={
              <MessageInput
                onSend={handleSendMessage}
                disabled={
                  chatStatus() !== "connected" ||
                  getActiveGroup(groupState()) === null ||
                  (getActiveGroup(groupState())?.hasActionChain === true && !actionChainState()?.members.has(ownPublicKeyHex())) ||
                  isDirectMessageBlocked(activeDirectMessagePeerId())
                }
                placeholder={
                  isDirectMessageBlocked(activeDirectMessagePeerId())
                    ? "You blocked this peer"
                    : getActiveGroup(groupState())?.hasActionChain === true && !actionChainState()?.members.has(ownPublicKeyHex())
                      ? "Waiting for approval..."
                      : undefined
                }
              />
            }
            devDrawerContent={
              <>
                <PeerSharingPanel
                  ownPeerId={chat!.peerId}
                  networkStatus={networkStatus()}
                  onConnect={(targetPeerId) => chat!.connectToPeerId(targetPeerId)}
                />
                <NetworkPanel
                  networkStatus={networkStatus()}
                  relayPoolState={relayPoolState()}
                  groupDiscoveryState={groupDiscoveryState()}
                  relayCandidateState={relayCandidateState()}
                  relayReservationState={relayReservationState()}
                  connectionMetrics={connectionMetrics()}
                  displayName={displayName()}
                  latencyMap={latencyMap()}
                  contactsBook={contactsBook()}
                  pinnedPeerIds={pinnedPeerIds()}
                  onAddRelay={handleAddRelay}
                />
                <EventLog
                  events={eventLog()}
                  onClear={() => setEventLog([])}
                />
              </>
            }
            groupInfoContent={
              <GroupInfoPanel
                groupId={groupState().activeGroupId}
                groupName={activeGroupName() ?? "Unknown Group"}
                members={actionChainState()?.members ?? new Map()}
                actionEnvelopes={chat?.getActionChainEnvelopes(groupState().activeGroupId ?? "") ?? []}
                connectionMetrics={connectionMetrics()}
                activeGroupDiscoveryMetrics={activeGroupDiscoveryMetrics()}
                joinRetryEntry={activeJoinRetryEntry()}
                pendingJoins={pendingJoinsMap().get(groupState().activeGroupId ?? "") ?? []}
                joinPolicy={actionChainState()?.joinPolicy ?? "manual"}
                isAdmin={isCurrentUserAdmin()}
                ownRole={ownRole()}
                ownPublicKeyHex={ownPublicKeyHex()}
                ownDisplayName={displayName()}
                publicKeyToPeerId={publicKeyToPeerIdMap()}
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
