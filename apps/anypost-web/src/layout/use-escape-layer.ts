import { createEffect, onCleanup } from "solid-js";
import { pushEntry, removeEntry, topEntry } from "./escape-stack.js";
import type { EscapeEntry } from "./escape-stack.js";

let entries: readonly EscapeEntry[] = [];
let listenerAttached = false;

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key !== "Escape") return;
  const top = topEntry(entries);
  if (!top) return;
  event.preventDefault();
  top.handler();
};

const ensureListener = () => {
  if (listenerAttached) return;
  window.addEventListener("keydown", handleKeyDown);
  listenerAttached = true;
};

export const useEscapeLayer = (
  id: string,
  handler: () => void,
  active: () => boolean,
): void => {
  ensureListener();

  createEffect(() => {
    if (active()) {
      entries = pushEntry(entries, { id, handler });
    } else {
      entries = removeEntry(entries, id);
    }
  });

  onCleanup(() => {
    entries = removeEntry(entries, id);
  });
};
