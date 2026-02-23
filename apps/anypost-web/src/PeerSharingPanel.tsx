import { createSignal, Show, For } from "solid-js";
import type { NetworkStatus } from "anypost-core/protocol";
import { formatPeerIdForDisplay, isValidPeerId } from "anypost-core/protocol";
import {
  createPeerSharingState,
  setTargetPeerId,
  markCopied,
  clearCopied,
  transitionConnect,
  canConnect,
} from "./peer-sharing.js";

type PeerSharingPanelProps = {
  readonly ownPeerId: string;
  readonly networkStatus: NetworkStatus | null;
  readonly onConnect: (targetPeerId: string) => Promise<void>;
};

type ConnectionCheckState =
  | { readonly status: "idle" }
  | { readonly status: "invalid"; readonly peerId: string }
  | { readonly status: "not-connected"; readonly peerId: string }
  | {
      readonly status: "connected";
      readonly peerId: string;
      readonly connections: readonly {
        readonly addr: string;
        readonly direction: "inbound" | "outbound";
        readonly protocol: string;
        readonly transport: string;
      }[];
    };

const classifyTransport = (addr: string): string => {
  if (addr.includes("/webrtc/")) return "webrtc";
  if (addr.includes("/p2p-circuit/")) return "circuit-relay";
  if (addr.includes("/ws/") || addr.includes("/wss/")) return "websocket";
  if (addr.includes("/tcp/")) return "tcp";
  return "unknown";
};

export const PeerSharingPanel = (props: PeerSharingPanelProps) => {
  const [state, setState] = createSignal(createPeerSharingState(props.ownPeerId));
  const [checkPeerId, setCheckPeerId] = createSignal("");
  const [connectionCheck, setConnectionCheck] = createSignal<ConnectionCheckState>({ status: "idle" });

  const checkedPeerId = () =>
    connectionCheck().status === "idle" ? "" : connectionCheck().peerId;

  const checkedConnections = () =>
    connectionCheck().status === "connected"
      ? connectionCheck().connections
      : [];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.ownPeerId);
      setState(markCopied(state()));
      setTimeout(() => setState(clearCopied(state())), 2000);
    } catch {
      // Clipboard access may be denied
    }
  };

  const handleConnect = async () => {
    const current = state();
    if (!canConnect(current)) return;

    setState(transitionConnect(current, { type: "search-started" }));

    try {
      setState(transitionConnect(state(), { type: "peer-found" }));
      await props.onConnect(current.targetPeerId);
      setState(transitionConnect(state(), { type: "connected" }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      setState(transitionConnect(state(), { type: "failed", errorMessage: message }));
    }
  };

  const statusLabel = () => {
    switch (state().connectStatus) {
      case "idle": return "";
      case "searching": return "Searching...";
      case "connecting": return "Connecting...";
      case "connected": return "Connected!";
      case "failed": return state().errorMessage ?? "Failed";
    }
  };

  const statusColorClass = () => {
    switch (state().connectStatus) {
      case "connected": return "text-tg-success";
      case "failed": return "text-tg-danger";
      default: return "text-tg-warning";
    }
  };

  const handleCheckConnection = () => {
    const peerId = checkPeerId().trim();
    if (!isValidPeerId(peerId)) {
      setConnectionCheck({ status: "invalid", peerId });
      return;
    }

    const peers = props.networkStatus?.peers ?? [];
    const matches = peers.filter((peer) => peer.peerId === peerId);
    if (matches.length === 0) {
      setConnectionCheck({ status: "not-connected", peerId });
      return;
    }

    setConnectionCheck({
      status: "connected",
      peerId,
      connections: matches.map((peer) => ({
        addr: peer.addrs[0] ?? "unknown",
        direction: peer.direction,
        protocol: peer.protocol,
        transport: classifyTransport(peer.addrs[0] ?? ""),
      })),
    });
  };

  return (
    <div class="rounded-xl border border-tg-border bg-tg-chat p-4 mb-4">
      <strong class="text-sm text-tg-text block mb-2">
        Peer Sharing
      </strong>

      <div class="mb-3">
        <span class="text-xs text-tg-text-dim">Your Peer ID </span>
        <code class="font-mono text-xs text-tg-text break-all">
          {formatPeerIdForDisplay(props.ownPeerId)}
        </code>
        <button
          onClick={() => void handleCopy()}
          class="ml-2 px-2 py-0.5 rounded border border-tg-border text-xs text-tg-text-dim hover:text-tg-text cursor-pointer"
          classList={{
            "bg-tg-success/20": state().copied,
          }}
        >
          {state().copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <div class="mb-2">
        <label class="block mb-1 text-xs text-tg-text-dim">
          Connect to Peer ID
        </label>
        <input
          type="text"
          value={state().targetPeerId}
          onInput={(e) => setState(setTargetPeerId(state(), e.currentTarget.value))}
          placeholder="12D3KooW..."
          class="w-full px-2 py-1.5 rounded-lg bg-tg-sidebar border border-tg-border text-tg-text font-mono text-xs box-border placeholder:text-tg-text-dim"
        />
      </div>

      <div class="flex items-center gap-2">
        <button
          onClick={() => void handleConnect()}
          disabled={!canConnect(state())}
          class="px-3.5 py-1.5 rounded-lg bg-tg-accent text-white text-sm cursor-pointer disabled:opacity-40 hover:bg-tg-accent/80"
        >
          Find & Connect
        </button>
        <Show when={statusLabel()}>
          <span class={`text-xs ${statusColorClass()}`}>
            {statusLabel()}
          </span>
        </Show>
      </div>

      <div class="mt-4 pt-3 border-t border-tg-border">
        <label class="block mb-1 text-xs text-tg-text-dim">
          Check Connection To Peer ID
        </label>
        <div class="flex items-center gap-2">
          <input
            type="text"
            value={checkPeerId()}
            onInput={(e) => setCheckPeerId(e.currentTarget.value)}
            placeholder="12D3KooW..."
            class="flex-1 px-2 py-1.5 rounded-lg bg-tg-sidebar border border-tg-border text-tg-text font-mono text-xs box-border placeholder:text-tg-text-dim"
          />
          <button
            onClick={handleCheckConnection}
            disabled={checkPeerId().trim().length === 0}
            class="px-3 py-1.5 rounded-lg bg-tg-input text-tg-text text-xs cursor-pointer border border-tg-border disabled:opacity-40 hover:bg-tg-hover"
          >
            Check
          </button>
        </div>

        <Show when={connectionCheck().status !== "idle"}>
          <div class="mt-2 text-xs">
            <Show when={connectionCheck().status === "invalid"}>
              <p class="text-tg-danger">Invalid peer ID.</p>
            </Show>
            <Show when={connectionCheck().status === "not-connected"}>
              <p class="text-tg-warning">
                Not connected to <code class="font-mono">{checkedPeerId().slice(0, 20)}...</code>
              </p>
            </Show>
            <Show when={connectionCheck().status === "connected"}>
              <div class="space-y-1">
                <p class="text-tg-success">
                  Connected to <code class="font-mono">{checkedPeerId().slice(0, 20)}...</code>
                </p>
                <div class="space-y-1">
                  <For each={checkedConnections()}>
                    {(conn) => (
                      <div class="rounded border border-tg-border bg-tg-sidebar px-2 py-1">
                        <div class="text-tg-text-dim">
                          via <span class="text-tg-text">{conn.transport}</span> • {conn.direction} • mux: {conn.protocol}
                        </div>
                        <code class="block break-all text-[11px] text-tg-text">{conn.addr}</code>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
};
