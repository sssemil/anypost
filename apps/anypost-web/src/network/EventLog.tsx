import { createEffect, createSignal, For, Show } from "solid-js";
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
  const EVENTS_PER_PAGE = 40;
  const [showLog, setShowLog] = createSignal(true);
  const [eventPage, setEventPage] = createSignal(0);

  createEffect(() => {
    const totalPages = Math.max(1, Math.ceil(props.events.length / EVENTS_PER_PAGE));
    setEventPage((prev) => Math.min(prev, totalPages - 1));
  });

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
        {(() => {
          const totalPages = Math.max(1, Math.ceil(props.events.length / EVENTS_PER_PAGE));
          const page = Math.min(eventPage(), totalPages - 1);
          const paged = props.events.slice(page * EVENTS_PER_PAGE, (page + 1) * EVENTS_PER_PAGE);
          return (
            <>
              <div class="font-mono h-[180px] overflow-y-auto bg-black/30 text-tg-text rounded-lg p-2 text-[11px] leading-relaxed">
                <For each={paged}>
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
              <Show when={totalPages > 1}>
                <div class="flex justify-center items-center gap-2 mt-2">
                  <button
                    onClick={() => setEventPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                  >
                    prev
                  </button>
                  <span class="text-tg-text-dim text-xs">{page + 1} / {totalPages}</span>
                  <button
                    onClick={() => setEventPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                  >
                    next
                  </button>
                </div>
              </Show>
            </>
          );
        })()}
      </Show>
    </div>
  );
};
