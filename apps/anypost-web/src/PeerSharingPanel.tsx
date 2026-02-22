import { createSignal, Show } from "solid-js";
import { formatPeerIdForDisplay } from "anypost-core/protocol";
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
  readonly onConnect: (targetPeerId: string) => Promise<void>;
};

export const PeerSharingPanel = (props: PeerSharingPanelProps) => {
  const [state, setState] = createSignal(createPeerSharingState(props.ownPeerId));

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
    </div>
  );
};
