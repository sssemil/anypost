import { createSignal, createEffect, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import {
  createMultiGroupChat,
  createMultiGroupState,
  transitionMultiGroup,
  getActiveGroup,
  getActiveMessages,
  getGroupList,
  getSeenPeerIds,
  getGroupMembers,
  toHex,
} from "anypost-core/protocol";
import type { MultiGroupChat, MultiGroupState, NetworkStatus, NetworkEvent, RelayPoolState, GroupDiscoveryState, ActionChainGroupState } from "anypost-core/protocol";
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
import { NetworkPanel } from "./network/NetworkPanel.js";
import { EventLog } from "./network/EventLog.js";
import { GroupInfoPanel } from "./chat/GroupInfoPanel.js";
import type { PendingJoinRequest } from "./chat/GroupInfoPanel.js";
import {
  createMobileViewState,
  transitionMobileView,
} from "./layout/mobile-view-machine.js";
import {
  serializeGroups,
  deserializeGroups,
} from "./group-persistence.js";

const ENV_RELAY_MULTIADDR = import.meta.env.VITE_RELAY_MULTIADDR as string | undefined;
const GROUPS_STORAGE_KEY = "anypost:groups";
const MAX_EVENTS = 200;

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
  const [relayPoolState, setRelayPoolState] = createSignal<RelayPoolState | null>(null);
  const [groupDiscoveryState, setGroupDiscoveryState] = createSignal<GroupDiscoveryState | null>(null);
  const [networkStatus, setNetworkStatus] = createSignal<NetworkStatus | null>(null);
  const [eventLog, setEventLog] = createSignal<readonly NetworkEvent[]>([]);
  const [latencyMap, setLatencyMap] = createSignal<ReadonlyMap<string, number>>(new Map());
  const [mobileView, setMobileView] = createSignal(createMobileViewState());
  const [actionChainState, setActionChainState] = createSignal<ActionChainGroupState | null>(null);
  const [pendingJoins, setPendingJoins] = createSignal<readonly PendingJoinRequest[]>([]);

  let chat: MultiGroupChat | undefined;
  let unsubscribeMessage: (() => void) | undefined;
  let unsubscribeEvents: (() => void) | undefined;
  let unsubscribeJoinRequests: (() => void) | undefined;
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

  const refreshActionChainState = () => {
    const activeId = groupState().activeGroupId;
    if (!activeId || !chat) {
      setActionChainState(null);
      return;
    }
    setActionChainState(chat.getActionChainState(activeId));
  };

  createEffect(() => {
    groupState().activeGroupId;
    refreshActionChainState();
    setPendingJoins([]);
  });

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
      return;
    }

    const actionChainSet = new Set(persisted.actionChainGroups);

    for (const groupId of persisted.joinedGroups) {
      if (actionChainSet.has(groupId)) {
        const groupName = persisted.groupNames[groupId] ?? "Unnamed Group";
        dispatchGroupEvent({ type: "group-created", groupId, groupName });
      } else {
        dispatchGroupEvent({ type: "group-joined", groupId });
      }
      chat?.joinGroup(groupId);

      const messages = persisted.messages[groupId];
      if (messages) {
        for (const msg of messages) {
          dispatchGroupEvent({ type: "message-received", groupId, message: msg });
        }
      }
    }

    if (persisted.activeGroupId) {
      dispatchGroupEvent({ type: "group-selected", groupId: persisted.activeGroupId });
    }
  };

  const startChat = async (accountKey: AccountKey) => {
    try {
      const bootstrapPeers = ENV_RELAY_MULTIADDR ? [ENV_RELAY_MULTIADDR] : [];

      chat = await createMultiGroupChat({
        accountKey,
        bootstrapPeers,
        onRelayPoolStateChange: setRelayPoolState,
        onGroupDiscoveryStateChange: setGroupDiscoveryState,
      });

      setChatStatus("connected");

      restorePersistedGroups();
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

      unsubscribeJoinRequests = chat.onJoinRequest((evt) => {
        if (evt.groupId === groupState().activeGroupId) {
          const pubKeyHex = toHex(new Uint8Array(evt.requesterPublicKey));
          setPendingJoins((prev) => {
            if (prev.some((p) => p.publicKeyHex === pubKeyHex)) return prev;
            return [...prev, { publicKeyHex: pubKeyHex, publicKey: new Uint8Array(evt.requesterPublicKey) }];
          });
        }
      });
    } catch {
      setChatStatus("disconnected");
    }
  };

  onCleanup(() => {
    unsubscribeMessage?.();
    unsubscribeEvents?.();
    unsubscribeJoinRequests?.();
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
    const currentChat = chat;
    if (!currentChat) return;

    currentChat.createGroup("New Group").then((groupId) => {
      dispatchGroupEvent({ type: "group-created", groupId, groupName: "New Group" });
      dispatchGroupEvent({ type: "group-selected", groupId });
      dispatchMobileView({ type: "group-selected" });
    }).catch(() => {});
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
    return state.members.get(hex)?.role === "admin";
  };

  const handleApproveJoin = (memberPublicKey: Uint8Array) => {
    const currentChat = chat;
    const activeId = groupState().activeGroupId;
    if (!currentChat || !activeId) return;

    currentChat.approveJoin(activeId, memberPublicKey).then(() => {
      const approvedHex = toHex(new Uint8Array(memberPublicKey));
      setPendingJoins((prev) => prev.filter((p) => p.publicKeyHex !== approvedHex));
      refreshActionChainState();
    }).catch(() => {});
  };

  const activeGroupMemberList = () => {
    const activeId = groupState().activeGroupId;
    if (!activeId) return [];
    const members = getGroupMembers(groupState(), activeId);
    return [...members.entries()].map(([peerId, displayName]) => ({
      peerId,
      displayName: displayName ?? undefined,
    }));
  };

  const activeGroupName = () => {
    const activeId = groupState().activeGroupId;
    if (!activeId) return undefined;
    return groupState().groups.get(activeId)?.groupName;
  };

  const sidebarGroups = () =>
    getGroupList(groupState()).map((g) => {
      const lastMsg = g.messages.length > 0 ? g.messages[g.messages.length - 1] : undefined;
      return {
        groupId: g.groupId,
        groupName: g.groupName,
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
        <Show when={chatStatus() === "connecting"}>
          <div class="flex items-center justify-center min-h-screen bg-tg-chat font-sans">
            <div class="text-center">
              <div class="w-8 h-8 border-2 border-tg-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p class="text-tg-text-dim text-sm">Connecting to network...</p>
            </div>
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
                activeGroupName={activeGroupName()}
                members={activeGroupMemberList()}
                showBackButton={mobileView().currentView === "chat"}
                onBackPress={() => dispatchMobileView({ type: "back-pressed" })}
                onDevDrawerToggle={() => dispatchMobileView({ type: "dev-drawer-toggled" })}
                onGroupInfoToggle={() => dispatchMobileView({ type: "group-info-toggled" })}
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
                  relayPoolState={relayPoolState()}
                  groupDiscoveryState={groupDiscoveryState()}
                  displayName={displayName()}
                  latencyMap={latencyMap()}
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
                groupName={activeGroupName() ?? "Unknown Group"}
                members={actionChainState()?.members ?? new Map()}
                pendingJoins={pendingJoins()}
                isAdmin={isCurrentUserAdmin()}
                ownPublicKeyHex={ownPublicKeyHex()}
                onApproveJoin={handleApproveJoin}
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
              }
            }}
          />
        </Show>
      </Match>
    </Switch>
  );
};
