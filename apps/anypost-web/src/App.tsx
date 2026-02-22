import { createSignal, createEffect, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import {
  createMultiGroupChat,
  createMultiGroupState,
  transitionMultiGroup,
  getActiveGroup,
  getActiveMessages,
  getGroupList,
  getSeenPeerIds,
} from "anypost-core/protocol";
import type { MultiGroupChat, MultiGroupState, NetworkStatus, NetworkEvent } from "anypost-core/protocol";
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
import { ConnectPanel } from "./connect/ConnectPanel.js";
import { NetworkPanel } from "./network/NetworkPanel.js";
import { EventLog } from "./network/EventLog.js";
import {
  createMobileViewState,
  transitionMobileView,
} from "./layout/mobile-view-machine.js";
import {
  serializeGroups,
  deserializeGroups,
} from "./group-persistence.js";

const DEFAULT_GROUP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const ENV_RELAY_MULTIADDR = import.meta.env.VITE_RELAY_MULTIADDR as string | undefined;
const RELAY_STORAGE_KEY = "anypost:relay-multiaddr";
const GROUPS_STORAGE_KEY = "anypost:groups";
const MAX_EVENTS = 200;

const loadRelayAddress = (): string =>
  ENV_RELAY_MULTIADDR ?? localStorage.getItem(RELAY_STORAGE_KEY) ?? "";

const saveRelayAddress = (addr: string): void => {
  localStorage.setItem(RELAY_STORAGE_KEY, addr);
};

const loadPersistedGroups = () => {
  const json = localStorage.getItem(GROUPS_STORAGE_KEY);
  return json ? deserializeGroups(json) : null;
};

const savePersistedGroups = (state: MultiGroupState) => {
  localStorage.setItem(GROUPS_STORAGE_KEY, serializeGroups(state));
};

export const App = () => {
  const [onboardingState, setOnboardingState] = createSignal<OnboardingState>(createInitialState());
  const [seedPhrase, setSeedPhrase] = createSignal("");

  const [groupState, setGroupState] = createSignal<MultiGroupState>(createMultiGroupState());
  const [chatStatus, setChatStatus] = createSignal<"connecting" | "connected" | "disconnected">("connecting");
  const [displayName, setDisplayNameState] = createSignal("");
  const [relayAddr, setRelayAddr] = createSignal(loadRelayAddress());
  const [networkStatus, setNetworkStatus] = createSignal<NetworkStatus | null>(null);
  const [eventLog, setEventLog] = createSignal<readonly NetworkEvent[]>([]);
  const [bootstrapAddrs, setBootstrapAddrs] = createSignal<readonly string[]>([]);
  const [latencyMap, setLatencyMap] = createSignal<ReadonlyMap<string, number>>(new Map());
  const [mobileView, setMobileView] = createSignal(createMobileViewState());

  let chat: MultiGroupChat | undefined;
  let unsubscribeMessage: (() => void) | undefined;
  let unsubscribeEvents: (() => void) | undefined;
  let statusInterval: ReturnType<typeof setInterval> | undefined;
  let pingInterval: ReturnType<typeof setInterval> | undefined;

  const dispatchMobileView = (event: Parameters<typeof transitionMobileView>[1]) => {
    setMobileView((s) => transitionMobileView(s, event));
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

  const dispatchGroupEvent = (event: Parameters<typeof transitionMultiGroup>[1]) => {
    setGroupState((s) => {
      const next = transitionMultiGroup(s, event);
      savePersistedGroups(next);
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
      dispatchGroupEvent({ type: "group-joined", groupId: DEFAULT_GROUP_ID });
      return;
    }

    for (const groupId of persisted.joinedGroups) {
      dispatchGroupEvent({ type: "group-joined", groupId });
      chat?.joinGroup(groupId);
    }

    if (persisted.activeGroupId) {
      dispatchGroupEvent({ type: "group-selected", groupId: persisted.activeGroupId });
    }
  };

  const startChat = async (_accountKey: AccountKey) => {
    try {
      const addr = relayAddr().trim();
      if (addr) saveRelayAddress(addr);
      const bootstrapPeers = addr ? [addr] : [];
      setBootstrapAddrs(bootstrapPeers);

      chat = await createMultiGroupChat({
        bootstrapPeers,
      });

      setChatStatus("connected");

      restorePersistedGroups();

      const currentJoined = chat.getJoinedGroups();
      if (currentJoined.length === 0) {
        chat.joinGroup(DEFAULT_GROUP_ID);
      }

      refreshNetworkStatus();

      chat.onPeerChange(() => {
        refreshNetworkStatus();
      });

      statusInterval = setInterval(refreshNetworkStatus, 3000);

      void runPingSweep();
      pingInterval = setInterval(() => void runPingSweep(), PING_SWEEP_INTERVAL);

      unsubscribeEvents = chat.onEvent((evt) => {
        setEventLog((prev) => [...prev.slice(-(MAX_EVENTS - 1)), evt]);
      });

      unsubscribeMessage = chat.onMessage((msg) => {
        dispatchGroupEvent({
          type: "message-received",
          groupId: msg.groupId,
          message: msg,
        });
      });
    } catch {
      setChatStatus("disconnected");
    }
  };

  onCleanup(() => {
    unsubscribeMessage?.();
    unsubscribeEvents?.();
    if (statusInterval) clearInterval(statusInterval);
    if (pingInterval) clearInterval(pingInterval);
    chat?.stop();
  });

  let autoConnectFired = false;

  createEffect(() => {
    const shouldConnect = decideAutoConnect({
      onboardingStatus: onboardingState().status,
      chatStatus: chatStatus(),
      relayAddress: relayAddr(),
    });

    if (shouldConnect && !autoConnectFired) {
      autoConnectFired = true;
      const key = getCurrentAccountKey();
      if (key) void startChat(key);
    }
  });

  const handleSendMessage = (text: string) => {
    const currentChat = chat;
    const activeGroup = getActiveGroup(groupState());
    if (!currentChat || !activeGroup) return;

    const groupId = activeGroup.groupId;

    const name = displayName() || undefined;
    currentChat.sendMessage(groupId, text, name).then(() => {
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

  const handleJoinGroup = (groupId: string) => {
    chat?.joinGroup(groupId);
    dispatchGroupEvent({ type: "group-joined", groupId });
  };

  const handleCreateGroup = () => {
    const groupId = crypto.randomUUID();
    chat?.joinGroup(groupId);
    dispatchGroupEvent({ type: "group-joined", groupId });
    dispatchGroupEvent({ type: "group-selected", groupId });
    dispatchMobileView({ type: "group-selected" });
  };

  const handleLeaveGroup = (groupId: string) => {
    chat?.leaveGroup(groupId);
    dispatchGroupEvent({ type: "group-left", groupId });
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

  const showConnectPanel = () =>
    chatStatus() === "disconnected" || (chatStatus() === "connecting" && !relayAddr().trim());

  const sidebarGroups = () =>
    getGroupList(groupState()).map((g) => {
      const lastMsg = g.messages.length > 0 ? g.messages[g.messages.length - 1] : undefined;
      return {
        groupId: g.groupId,
        unreadCount: g.unreadCount,
        seenPeerCount: getSeenPeerIds(groupState(), g.groupId).size,
        lastMessage: lastMsg
          ? { text: lastMsg.text, timestamp: lastMsg.timestamp }
          : undefined,
      };
    });

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
        <Show when={showConnectPanel()}>
          <div class="max-w-lg mx-auto mt-10 px-5 font-sans">
            <h1 class="text-2xl font-bold text-tg-text mb-4">Anypost</h1>
            <ConnectPanel
              relayAddr={relayAddr()}
              onRelayAddrChange={setRelayAddr}
              onConnect={() => {
                const key = getCurrentAccountKey();
                if (key) void startChat(key);
              }}
              disabled={!relayAddr().trim()}
            />
          </div>
        </Show>

        <Show when={chatStatus() === "connected" && chat}>
          <ChatLayout
            header={
              <HeaderBar
                peerId={chat!.peerId}
                connectionStatus={chatStatus()}
                displayName={displayName()}
                activeGroupId={groupState().activeGroupId}
                showBackButton={mobileView().currentView === "chat"}
                onBackPress={() => dispatchMobileView({ type: "back-pressed" })}
                onDevDrawerToggle={() => dispatchMobileView({ type: "dev-drawer-toggled" })}
              />
            }
            sidebar={
              <GroupSidebar
                groups={sidebarGroups()}
                activeGroupId={groupState().activeGroupId}
                topBanners={
                  <>
                    <div class="bg-tg-accent/10 border-b border-tg-accent/20 px-3 py-2">
                      <p class="text-tg-accent text-[11px] leading-tight">
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
                onJoinGroup={handleJoinGroup}
                onCreateGroup={handleCreateGroup}
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
                disabled={chatStatus() !== "connected" || getActiveGroup(groupState()) === null}
              />
            }
            devDrawerContent={
              <>
                <PeerSharingPanel
                  ownPeerId={chat!.peerId}
                  onConnect={(targetPeerId) => chat!.connectToPeerId(targetPeerId)}
                />
                <NetworkPanel
                  networkStatus={networkStatus()}
                  bootstrapAddrs={bootstrapAddrs()}
                  displayName={displayName()}
                  latencyMap={latencyMap()}
                />
                <EventLog
                  events={eventLog()}
                  onClear={() => setEventLog([])}
                />
              </>
            }
            mobileView={mobileView().currentView}
            isDevDrawerOpen={mobileView().isDevDrawerOpen}
            onDevDrawerClose={() => dispatchMobileView({ type: "dev-drawer-closed" })}
          />
        </Show>
      </Match>
    </Switch>
  );
};
