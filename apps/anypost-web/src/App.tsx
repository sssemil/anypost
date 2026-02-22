import { createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { createPlaintextChat } from "anypost-core/protocol";
import type { PlaintextChat, ChatMessageEvent } from "anypost-core/protocol";
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

const DEFAULT_GROUP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

export const App = () => {
  const [onboardingState, setOnboardingState] = createSignal<OnboardingState>(createInitialState());
  const [seedPhrase, setSeedPhrase] = createSignal("");

  const [messages, setMessages] = createSignal<readonly ChatMessageEvent[]>([]);
  const [inputText, setInputText] = createSignal("");
  const [chatStatus, setChatStatus] = createSignal<"connecting" | "connected" | "disconnected">("connecting");
  const [peerId, setPeerId] = createSignal("");
  const [displayName, setDisplayNameState] = createSignal("");

  let chat: PlaintextChat | undefined;
  let unsubscribe: (() => void) | undefined;

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
      // Key generation is in-memory and cannot fail.
      // IndexedDB storage failures leave the user on the onboarding screen,
      // which is the correct recovery: they can retry.
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
      // IndexedDB storage failure. The user remains on the onboarding screen.
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
      // IndexedDB persistence failure. The user remains on the display name prompt.
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
      // IndexedDB failure. The banner remains visible so the user can retry.
    }
  };

  const startChat = async (_accountKey: AccountKey) => {
    try {
      chat = await createPlaintextChat({
        groupId: DEFAULT_GROUP_ID,
        bootstrapPeers: [],
      });

      setPeerId(chat.peerId);
      setChatStatus("connected");

      unsubscribe = chat.onMessage((msg) => {
        setMessages((prev) => [...prev, msg]);
      });
    } catch {
      setChatStatus("disconnected");
    }
  };

  onCleanup(() => {
    unsubscribe?.();
    chat?.stop();
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
        <div style={{ "max-width": "600px", margin: "0 auto", padding: "20px", "font-family": "system-ui" }}>
          <h1>Anypost</h1>

          <Show when={backupPending()}>
            <BackupBanner
              seedPhrase={seedPhrase()}
              onBackupConfirmed={() => void handleBackupConfirmed()}
            />
          </Show>

          <p>
            Status: <strong>{chatStatus()}</strong>
            {peerId() && <> | PeerId: <code>{peerId().slice(0, 16)}...</code></>}
            {displayName() && <> | {displayName()}</>}
          </p>

          <Show when={chatStatus() === "connecting"}>
            <div style={{ "text-align": "center", padding: "20px" }}>
              <button
                onClick={() => {
                  const key = getCurrentAccountKey();
                  if (key) void startChat(key);
                }}
                style={{ padding: "12px 24px", "border-radius": "4px", cursor: "pointer", "background-color": "#2196F3", color: "white", border: "none" }}
              >
                Connect to Chat
              </button>
            </div>
          </Show>

          <div style={{
            border: "1px solid #ccc",
            "border-radius": "8px",
            height: "400px",
            "overflow-y": "auto",
            padding: "12px",
            "margin-bottom": "12px",
          }}>
            <For each={messages()}>
              {(msg) => (
                <div style={{ "margin-bottom": "8px" }}>
                  <strong>{msg.senderPeerId.slice(0, 12)}...</strong>{" "}
                  <span style={{ color: "#666", "font-size": "0.8em" }}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                  <div>{msg.text}</div>
                </div>
              )}
            </For>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
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
        </div>
      </Match>
    </Switch>
  );
};
