import { createSignal, createEffect, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { createPlaintextChat } from "anypost-core/protocol";
import type { PlaintextChat, ChatMessageEvent, NetworkStatus, NetworkEvent } from "anypost-core/protocol";
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
import { TopologyGraph } from "./network/TopologyGraph.js";
import { PeerSharingPanel } from "./PeerSharingPanel.js";

const DEFAULT_GROUP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const ENV_RELAY_MULTIADDR = import.meta.env.VITE_RELAY_MULTIADDR as string | undefined;
const STORAGE_KEY = "anypost:relay-multiaddr";

const loadRelayAddress = (): string =>
  ENV_RELAY_MULTIADDR ?? localStorage.getItem(STORAGE_KEY) ?? "";

const saveRelayAddress = (addr: string): void => {
  localStorage.setItem(STORAGE_KEY, addr);
};

const mono = { "font-family": "monospace", "font-size": "0.82em" } as const;
const dimText = { color: "#888", "font-size": "0.8em" } as const;
const panelStyle = {
  border: "1px solid #ddd",
  "border-radius": "8px",
  padding: "12px",
  "margin-bottom": "12px",
  "background-color": "#f9f9f9",
} as const;

export const App = () => {
  const [onboardingState, setOnboardingState] = createSignal<OnboardingState>(createInitialState());
  const [seedPhrase, setSeedPhrase] = createSignal("");

  const [messages, setMessages] = createSignal<readonly ChatMessageEvent[]>([]);
  const [inputText, setInputText] = createSignal("");
  const [chatStatus, setChatStatus] = createSignal<"connecting" | "connected" | "disconnected">("connecting");
  const [displayName, setDisplayNameState] = createSignal("");
  const [relayAddr, setRelayAddr] = createSignal(loadRelayAddress());
  const [networkStatus, setNetworkStatus] = createSignal<NetworkStatus | null>(null);
  const [showNetworkPanel, setShowNetworkPanel] = createSignal(true);
  const [eventLog, setEventLog] = createSignal<readonly NetworkEvent[]>([]);
  const [showEventLog, setShowEventLog] = createSignal(true);
  const [bootstrapAddrs, setBootstrapAddrs] = createSignal<readonly string[]>([]);
  const [peerSearch, setPeerSearch] = createSignal("");
  const [peerPage, setPeerPage] = createSignal(0);

  const PEERS_PER_PAGE = 10;
  const MAX_EVENTS = 200;

  let chat: PlaintextChat | undefined;
  let unsubscribe: (() => void) | undefined;
  let unsubscribeEvents: (() => void) | undefined;
  let statusInterval: ReturnType<typeof setInterval> | undefined;

  const refreshNetworkStatus = () => {
    if (chat) setNetworkStatus(chat.getNetworkStatus());
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

  const startChat = async (_accountKey: AccountKey) => {
    try {
      const addr = relayAddr().trim();
      if (addr) saveRelayAddress(addr);
      const bootstrapPeers = addr ? [addr] : [];
      setBootstrapAddrs(bootstrapPeers);
      chat = await createPlaintextChat({
        groupId: DEFAULT_GROUP_ID,
        bootstrapPeers,
      });

      setChatStatus("connected");
      refreshNetworkStatus();

      chat.onPeerChange(() => {
        refreshNetworkStatus();
      });

      statusInterval = setInterval(refreshNetworkStatus, 3000);

      unsubscribeEvents = chat.onEvent((evt) => {
        setEventLog((prev) => [...prev.slice(-(MAX_EVENTS - 1)), evt]);
      });

      unsubscribe = chat.onMessage((msg) => {
        setMessages((prev) => [...prev, msg]);
      });
    } catch {
      setChatStatus("disconnected");
    }
  };

  onCleanup(() => {
    unsubscribe?.();
    unsubscribeEvents?.();
    if (statusInterval) clearInterval(statusInterval);
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

  const sendMessage = async () => {
    const text = inputText().trim();
    const currentChat = chat;
    if (!text || !currentChat) return;

    try {
      await currentChat.sendMessage(text);

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          senderPeerId: currentChat.peerId,
          text,
          timestamp: Date.now(),
        },
      ]);

      setInputText("");
    } catch {
      setChatStatus("disconnected");
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
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

  return (
    <Switch>
      <Match when={onboardingState().status === "checking"}>
        <div style={{ "text-align": "center", padding: "80px", "font-family": "system-ui" }}>
          <p>Loading...</p>
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
        <div style={{ "max-width": "700px", margin: "0 auto", padding: "20px", "font-family": "system-ui" }}>
          <h1 style={{ "margin-bottom": "8px" }}>Anypost</h1>

          <Show when={backupPending()}>
            <BackupBanner
              seedPhrase={seedPhrase()}
              onBackupConfirmed={() => void handleBackupConfirmed()}
            />
          </Show>

          {/* Connect panel — shown when no relay or disconnected */}
          <Show when={chatStatus() === "disconnected" || (chatStatus() === "connecting" && !relayAddr().trim())}>
            <div style={panelStyle}>
              <label style={{ display: "block", "margin-bottom": "6px", "font-weight": "bold", "font-size": "0.9em" }}>
                Relay address
              </label>
              <input
                type="text"
                value={relayAddr()}
                onInput={(e) => setRelayAddr(e.currentTarget.value)}
                placeholder="/ip4/127.0.0.1/tcp/9090/ws/p2p/12D3KooW..."
                style={{ width: "100%", padding: "8px", "border-radius": "4px", border: "1px solid #ccc", ...mono, "box-sizing": "border-box", "margin-bottom": "8px" }}
              />
              <p style={{ margin: "0 0 8px", ...dimText }}>
                Paste the <code>/ws/</code> multiaddr from the relay terminal.
              </p>
              <button
                onClick={() => {
                  const key = getCurrentAccountKey();
                  if (key) void startChat(key);
                }}
                disabled={!relayAddr().trim()}
                style={{ padding: "10px 20px", "border-radius": "4px", cursor: "pointer", "background-color": "#2196F3", color: "white", border: "none" }}
              >
                Connect
              </button>
            </div>
          </Show>

          {/* Messages */}
          <div style={{
            border: "1px solid #ccc",
            "border-radius": "8px",
            height: "350px",
            "overflow-y": "auto",
            padding: "12px",
            "margin-bottom": "12px",
          }}>
            <For each={messages()} fallback={
              <div style={{ ...dimText, "text-align": "center", padding: "40px 0" }}>
                No messages yet. Send something!
              </div>
            }>
              {(msg) => {
                const isMe = () => chat?.peerId === msg.senderPeerId;
                return (
                  <div style={{ "margin-bottom": "8px" }}>
                    <strong style={{ color: isMe() ? "#1565c0" : "#333" }}>
                      {isMe() ? "You" : `${msg.senderPeerId.slice(0, 12)}...`}
                    </strong>{" "}
                    <span style={dimText}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                    <div>{msg.text}</div>
                  </div>
                );
              }}
            </For>
          </div>

          {/* Input */}
          <div style={{ display: "flex", gap: "8px", "margin-bottom": "16px" }}>
            <input
              type="text"
              value={inputText()}
              onInput={(e) => setInputText(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              disabled={chatStatus() !== "connected"}
              style={{ flex: 1, padding: "8px", "border-radius": "4px", border: "1px solid #ccc" }}
            />
            <button
              onClick={() => void sendMessage()}
              disabled={chatStatus() !== "connected" || !inputText().trim()}
              style={{ padding: "8px 16px", "border-radius": "4px", cursor: "pointer" }}
            >
              Send
            </button>
          </div>

          {/* Peer sharing panel */}
          <Show when={chatStatus() === "connected" ? chat : undefined}>
            {(currentChat) => (
              <PeerSharingPanel
                ownPeerId={currentChat().peerId}
                onConnect={(targetPeerId) => currentChat().connectToPeerId(targetPeerId)}
              />
            )}
          </Show>

          {/* Network status panel */}
          <Show when={chatStatus() === "connected"}>
            <div style={{ ...panelStyle, "margin-bottom": "12px" }}>
              <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "8px" }}>
                <strong style={{ "font-size": "0.9em" }}>
                  Network
                  {networkStatus() && (
                    <span style={{ "font-weight": "normal", ...dimText, "margin-left": "8px" }}>
                      {networkStatus()!.peers.length} peer{networkStatus()!.peers.length !== 1 ? "s" : ""}
                      {" / "}
                      {networkStatus()!.subscriberCount} subscriber{networkStatus()!.subscriberCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </strong>
                <button
                  onClick={() => setShowNetworkPanel(!showNetworkPanel())}
                  style={{ background: "none", border: "none", cursor: "pointer", ...dimText }}
                >
                  {showNetworkPanel() ? "hide" : "show"}
                </button>
              </div>

              <Show when={showNetworkPanel() && networkStatus()}>
                {(status) => (
                  <div style={{ ...mono }}>
                    {/* Topology graph */}
                    <div style={{ "margin-bottom": "10px", "padding-bottom": "10px", "border-bottom": "1px solid #e0e0e0" }}>
                      <TopologyGraph
                        networkStatus={status()}
                        bootstrapAddrs={bootstrapAddrs()}
                      />
                    </div>

                    {/* Self info */}
                    <div style={{ "margin-bottom": "10px", "padding-bottom": "10px", "border-bottom": "1px solid #e0e0e0" }}>
                      <div style={{ "margin-bottom": "4px" }}>
                        <span style={dimText}>PeerId </span>
                        <code>{status().peerId}</code>
                      </div>
                      <div style={{ "margin-bottom": "4px" }}>
                        <span style={dimText}>Topic </span>
                        <code>{status().topic}</code>
                      </div>
                      {displayName() && (
                        <div>
                          <span style={dimText}>Name </span>
                          {displayName()}
                        </div>
                      )}
                      <Show when={status().multiaddrs.length > 0}>
                        <details style={{ "margin-top": "4px" }}>
                          <summary style={{ cursor: "pointer", ...dimText }}>
                            My addresses ({status().multiaddrs.length})
                          </summary>
                          <For each={status().multiaddrs}>
                            {(addr) => (
                              <div style={{ "padding-left": "12px", "word-break": "break-all", "margin-top": "2px" }}>
                                {addr}
                              </div>
                            )}
                          </For>
                        </details>
                      </Show>
                    </div>

                    {/* Connected peers */}
                    <details style={{ "margin-top": "4px" }}>
                      <summary style={{ cursor: "pointer", ...dimText }}>
                        Connected peers ({status().peers.length})
                      </summary>
                      <Show
                        when={status().peers.length > 0}
                        fallback={
                          <div style={{ ...dimText, "text-align": "center", padding: "8px" }}>
                            No peers connected. Waiting for connections...
                          </div>
                        }
                      >
                        <div style={{ "margin-top": "6px", "margin-bottom": "6px" }}>
                          <input
                            type="text"
                            value={peerSearch()}
                            onInput={(e) => { setPeerSearch(e.currentTarget.value); setPeerPage(0); }}
                            placeholder="Search by peer ID or address..."
                            style={{ width: "100%", padding: "6px 8px", "border-radius": "4px", border: "1px solid #ddd", ...mono, "font-size": "0.85em", "box-sizing": "border-box" }}
                          />
                        </div>
                        {(() => {
                          const query = peerSearch().toLowerCase();
                          const filtered = query
                            ? status().peers.filter((p) =>
                                p.peerId.toLowerCase().includes(query) ||
                                p.addrs.some((a) => a.toLowerCase().includes(query))
                              )
                            : status().peers;
                          const totalPages = Math.max(1, Math.ceil(filtered.length / PEERS_PER_PAGE));
                          const page = Math.min(peerPage(), totalPages - 1);
                          const paged = filtered.slice(page * PEERS_PER_PAGE, (page + 1) * PEERS_PER_PAGE);
                          return (
                            <>
                              <For each={paged}>
                                {(peer) => (
                                  <div style={{
                                    padding: "8px",
                                    "margin-bottom": "6px",
                                    "background-color": "#fff",
                                    "border-radius": "6px",
                                    border: "1px solid #e8e8e8",
                                  }}>
                                    <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>
                                      <code style={{ "font-weight": "bold" }}>{peer.peerId.slice(0, 20)}...</code>
                                      <span style={{
                                        padding: "2px 8px",
                                        "border-radius": "10px",
                                        "font-size": "0.75em",
                                        "background-color": peer.direction === "outbound" ? "#e3f2fd" : "#f3e5f5",
                                        color: peer.direction === "outbound" ? "#1565c0" : "#7b1fa2",
                                      }}>
                                        {peer.direction}
                                      </span>
                                    </div>
                                    <For each={peer.addrs}>
                                      {(addr) => (
                                        <div style={{ ...dimText, "word-break": "break-all", "margin-top": "4px" }}>
                                          {addr}
                                        </div>
                                      )}
                                    </For>
                                    <div style={{ ...dimText, "margin-top": "2px" }}>
                                      muxer: {peer.protocol}
                                    </div>
                                  </div>
                                )}
                              </For>
                              <Show when={totalPages > 1}>
                                <div style={{ display: "flex", "justify-content": "center", "align-items": "center", gap: "8px", "margin-top": "8px" }}>
                                  <button
                                    onClick={() => setPeerPage(Math.max(0, page - 1))}
                                    disabled={page === 0}
                                    style={{ background: "none", border: "1px solid #ddd", "border-radius": "4px", padding: "2px 8px", cursor: page === 0 ? "default" : "pointer", ...dimText }}
                                  >
                                    prev
                                  </button>
                                  <span style={dimText}>
                                    {page + 1} / {totalPages}
                                    {query && ` (${filtered.length} match${filtered.length !== 1 ? "es" : ""})`}
                                  </span>
                                  <button
                                    onClick={() => setPeerPage(Math.min(totalPages - 1, page + 1))}
                                    disabled={page >= totalPages - 1}
                                    style={{ background: "none", border: "1px solid #ddd", "border-radius": "4px", padding: "2px 8px", cursor: page >= totalPages - 1 ? "default" : "pointer", ...dimText }}
                                  >
                                    next
                                  </button>
                                </div>
                              </Show>
                              <Show when={query && filtered.length === 0}>
                                <div style={{ ...dimText, "text-align": "center", padding: "8px" }}>
                                  No peers matching "{peerSearch()}"
                                </div>
                              </Show>
                            </>
                          );
                        })()}
                      </Show>
                    </details>
                  </div>
                )}
              </Show>
            </div>
          </Show>

          {/* Event log */}
          <Show when={chatStatus() === "connected"}>
            <div style={{ ...panelStyle, "margin-bottom": "12px" }}>
              <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "4px" }}>
                <strong style={{ "font-size": "0.9em" }}>
                  Events
                  <span style={{ "font-weight": "normal", ...dimText, "margin-left": "8px" }}>
                    {eventLog().length} entries
                  </span>
                </strong>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => setEventLog([])}
                    style={{ background: "none", border: "none", cursor: "pointer", ...dimText }}
                  >
                    clear
                  </button>
                  <button
                    onClick={() => setShowEventLog(!showEventLog())}
                    style={{ background: "none", border: "none", cursor: "pointer", ...dimText }}
                  >
                    {showEventLog() ? "hide" : "show"}
                  </button>
                </div>
              </div>
              <Show when={showEventLog()}>
                <div
                  ref={(el) => {
                    const observer = new MutationObserver(() => {
                      el.scrollTop = el.scrollHeight;
                    });
                    observer.observe(el, { childList: true });
                    onCleanup(() => observer.disconnect());
                  }}
                  style={{
                    ...mono,
                    height: "180px",
                    "overflow-y": "auto",
                    "background-color": "#1a1a2e",
                    color: "#e0e0e0",
                    "border-radius": "4px",
                    padding: "8px",
                    "font-size": "0.75em",
                    "line-height": "1.5",
                  }}
                >
                  <For each={eventLog()}>
                    {(evt) => {
                      const color = (): string => {
                        switch (evt.type) {
                          case "peer-connect": return "#4caf50";
                          case "peer-disconnect": return "#f44336";
                          case "dial-attempt": return "#ff9800";
                          case "dial-success": return "#4caf50";
                          case "dial-failure": return "#f44336";
                          case "subscription-change": return "#9c27b0";
                          case "pubsub-message": return "#2196f3";
                          case "relay-reservation": return "#00bcd4";
                          case "address-change": return "#607d8b";
                          case "gossipsub-mesh": return "#795548";
                          case "info": return "#888";
                          default: return "#e0e0e0";
                        }
                      };
                      return (
                        <div style={{ "white-space": "pre-wrap", "word-break": "break-all" }}>
                          <span style={{ color: "#666" }}>
                            {new Date(evt.timestamp).toLocaleTimeString()}{" "}
                          </span>
                          <span style={{
                            color: "#1a1a2e",
                            "background-color": color(),
                            padding: "0 4px",
                            "border-radius": "2px",
                            "font-size": "0.9em",
                          }}>
                            {evt.type}
                          </span>{" "}
                          <span>{evt.detail}</span>
                        </div>
                      );
                    }}
                  </For>
                  <Show when={eventLog().length === 0}>
                    <div style={{ color: "#666", "text-align": "center", padding: "20px 0" }}>
                      Waiting for events...
                    </div>
                  </Show>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </Match>
    </Switch>
  );
};
