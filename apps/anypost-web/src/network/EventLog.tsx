import { createSignal, For, Show, onCleanup } from "solid-js";
import type { NetworkEvent } from "anypost-core/protocol";

type EventLogProps = {
  readonly events: readonly NetworkEvent[];
  readonly onClear: () => void;
};

const eventColor = (type: NetworkEvent["type"]): string => {
  switch (type) {
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

export const EventLog = (props: EventLogProps) => {
  const [showLog, setShowLog] = createSignal(true);

  return (
    <div class="rounded-xl border border-tg-border bg-tg-chat p-4 mb-4">
      <div class="flex justify-between items-center mb-1">
        <strong class="text-sm text-tg-text">
          Events
          <span class="font-normal text-xs text-tg-text-dim ml-2">
            {props.events.length} entries
          </span>
        </strong>
        <div class="flex gap-2">
          <button
            onClick={props.onClear}
            class="text-xs text-tg-text-dim hover:text-tg-text cursor-pointer"
          >
            clear
          </button>
          <button
            onClick={() => setShowLog(!showLog())}
            class="text-xs text-tg-text-dim hover:text-tg-text cursor-pointer"
          >
            {showLog() ? "hide" : "show"}
          </button>
        </div>
      </div>
      <Show when={showLog()}>
        <div
          ref={(el) => {
            const observer = new MutationObserver(() => {
              el.scrollTop = el.scrollHeight;
            });
            observer.observe(el, { childList: true });
            onCleanup(() => observer.disconnect());
          }}
          class="font-mono h-[180px] overflow-y-auto bg-black/30 text-tg-text rounded-lg p-2 text-[11px] leading-relaxed"
        >
          <For each={props.events}>
            {(evt) => (
              <div class="whitespace-pre-wrap break-all">
                <span class="text-tg-text-dim/60">
                  {new Date(evt.timestamp).toLocaleTimeString()}{" "}
                </span>
                <span
                  class="px-1 rounded text-[10px]"
                  style={{
                    color: "#0e1621",
                    "background-color": eventColor(evt.type),
                  }}
                >
                  {evt.type}
                </span>{" "}
                <span class="text-tg-text">{evt.detail}</span>
              </div>
            )}
          </For>
          <Show when={props.events.length === 0}>
            <div class="text-tg-text-dim text-center py-5">
              Waiting for events...
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
