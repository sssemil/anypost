import { createSignal, For, Show } from "solid-js";
import type { ContactsBook } from "anypost-core/data";

type ContactsBookPageProps = {
  readonly contactsBook: ContactsBook;
  readonly ownPeerId: string;
  readonly connectedPeerIds: ReadonlySet<string>;
  readonly latencyMap: ReadonlyMap<string, number>;
  readonly onSetNickname: (peerId: string, nickname: string | null) => void;
  readonly onStartDirectMessage?: ((peerId: string) => Promise<string | null> | string | null) | null;
};

const CONTACTS_PER_PAGE = 12;

const formatLastSeen = (timestamp: number, now = Date.now()): string => {
  const deltaMs = Math.max(0, now - timestamp);
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export const ContactsBookPage = (props: ContactsBookPageProps) => {
  const [search, setSearch] = createSignal("");
  const [page, setPage] = createSignal(0);
  const [nicknameDrafts, setNicknameDrafts] = createSignal<ReadonlyMap<string, string>>(new Map());
  const [directMessageErrorByPeerId, setDirectMessageErrorByPeerId] = createSignal<ReadonlyMap<string, string>>(new Map());
  const [startingDirectMessages, setStartingDirectMessages] = createSignal<ReadonlySet<string>>(new Set());

  const getNicknameDraft = (peerId: string, currentNickname: string | null): string =>
    nicknameDrafts().get(peerId) ?? (currentNickname ?? "");

  const setNicknameDraft = (peerId: string, value: string) => {
    setNicknameDrafts((prev) => {
      const next = new Map(prev);
      next.set(peerId, value);
      return next;
    });
  };

  const clearNicknameDraft = (peerId: string) => {
    setNicknameDrafts((prev) => {
      if (!prev.has(peerId)) return prev;
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  };

  const clearDirectMessageError = (peerId: string) => {
    setDirectMessageErrorByPeerId((prev) => {
      if (!prev.has(peerId)) return prev;
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  };

  const handleStartDirectMessage = async (peerId: string) => {
    if (!props.onStartDirectMessage) return;
    clearDirectMessageError(peerId);
    setStartingDirectMessages((prev) => {
      if (prev.has(peerId)) return prev;
      const next = new Set(prev);
      next.add(peerId);
      return next;
    });

    try {
      const result = await props.onStartDirectMessage(peerId);
      if (!result) return;
      setDirectMessageErrorByPeerId((prev) => {
        const next = new Map(prev);
        next.set(peerId, result);
        return next;
      });
    } catch {
      setDirectMessageErrorByPeerId((prev) => {
        const next = new Map(prev);
        next.set(peerId, "Failed to open direct chat");
        return next;
      });
    } finally {
      setStartingDirectMessages((prev) => {
        if (!prev.has(peerId)) return prev;
        const next = new Set(prev);
        next.delete(peerId);
        return next;
      });
    }
  };

  return (
    <div class="space-y-3">
      <Show
        when={props.contactsBook.size > 0}
        fallback={<div class="text-tg-text-dim text-sm">No contacts recorded yet.</div>}
      >
        <input
          type="text"
          value={search()}
          onInput={(e) => { setSearch(e.currentTarget.value); setPage(0); }}
          placeholder="Search by name, peer ID, or group ID..."
          class="w-full px-2.5 py-2 rounded-lg bg-tg-input border border-tg-border text-tg-text text-xs font-mono box-border placeholder:text-tg-text-dim"
        />

        {(() => {
          const query = search().trim().toLowerCase();
          const contacts = [...props.contactsBook.values()]
            .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
            .filter((contact) =>
              query.length === 0 ||
              (contact.nickname?.toLowerCase().includes(query) ?? false) ||
              (contact.selfName?.toLowerCase().includes(query) ?? false) ||
              contact.seenSelfNames.some((name) => name.toLowerCase().includes(query)) ||
              contact.peerId.toLowerCase().includes(query) ||
              contact.groupIds.some((groupId) => groupId.toLowerCase().includes(query))
            );

          const totalPages = Math.max(1, Math.ceil(contacts.length / CONTACTS_PER_PAGE));
          const currentPage = Math.min(page(), totalPages - 1);
          const paged = contacts.slice(
            currentPage * CONTACTS_PER_PAGE,
            (currentPage + 1) * CONTACTS_PER_PAGE,
          );

          return (
            <>
              <div class="space-y-2">
                <For each={paged}>
                  {(contact) => (
                    <div class="rounded border border-tg-border bg-tg-hover px-2.5 py-2 text-xs">
                      <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-2 min-w-0">
                          <span
                            class="inline-block w-2 h-2 rounded-full shrink-0"
                            classList={{
                              "bg-tg-success": props.connectedPeerIds.has(contact.peerId),
                              "bg-tg-text-dim": !props.connectedPeerIds.has(contact.peerId),
                            }}
                          />
                          <span class="font-semibold text-tg-text truncate">
                            {contact.nickname ?? contact.selfName ?? "(unknown name)"}
                          </span>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                          <Show when={props.onStartDirectMessage && contact.peerId !== props.ownPeerId}>
                            <button
                              class="border border-tg-border rounded px-2 py-0.5 text-[10px] text-tg-accent hover:text-tg-accent/80 cursor-pointer disabled:opacity-40"
                              disabled={startingDirectMessages().has(contact.peerId)}
                              onClick={() => void handleStartDirectMessage(contact.peerId)}
                            >
                              DM
                            </button>
                          </Show>
                          <span class="text-[10px] text-tg-text-dim">
                            {formatLastSeen(contact.lastSeenAt)}
                          </span>
                        </div>
                      </div>

                      <div class="mt-1 text-[10px] text-tg-text-dim">
                        Nickname: {contact.nickname ?? "(none)"}
                      </div>
                      <div class="mt-1 text-[10px] text-tg-text-dim">
                        Latest self-ID name: {contact.selfName ?? "(unknown)"}
                      </div>
                      <Show when={contact.seenSelfNames.length > 0}>
                        <div class="mt-1 text-[10px] text-tg-text-dim break-words">
                          Seen self-ID names: {contact.seenSelfNames.join(", ")}
                        </div>
                      </Show>

                      <div class="mt-1 font-mono text-[11px] text-tg-text-dim break-all">
                        {contact.peerId}
                      </div>

                      {(() => {
                        const draft = getNicknameDraft(contact.peerId, contact.nickname);
                        const trimmedDraft = draft.trim();
                        const normalizedCurrent = contact.nickname ?? "";
                        const canSave = trimmedDraft !== normalizedCurrent;
                        return (
                          <div class="mt-2 flex items-center gap-2">
                            <input
                              type="text"
                              value={draft}
                              onInput={(e) => setNicknameDraft(contact.peerId, e.currentTarget.value)}
                              placeholder="Set local nickname"
                              class="flex-1 min-w-0 px-2 py-1 rounded bg-tg-input border border-tg-border text-tg-text text-[11px] font-mono box-border placeholder:text-tg-text-dim"
                            />
                            <button
                              class="border border-tg-border rounded px-2 py-1 text-[11px] text-tg-text-dim cursor-pointer disabled:opacity-40"
                              disabled={!canSave}
                              onClick={() => {
                                props.onSetNickname(contact.peerId, trimmedDraft.length > 0 ? trimmedDraft : null);
                                clearNicknameDraft(contact.peerId);
                              }}
                            >
                              Save
                            </button>
                          </div>
                        );
                      })()}

                      <div class="mt-1 text-[10px] text-tg-text-dim flex items-center justify-between">
                        <span>{contact.groupIds.length} group{contact.groupIds.length === 1 ? "" : "s"}</span>
                        <Show when={props.latencyMap.has(contact.peerId)}>
                          <span>{Math.round(props.latencyMap.get(contact.peerId)!)}ms</span>
                        </Show>
                      </div>
                      <Show when={directMessageErrorByPeerId().has(contact.peerId)}>
                        <div class="mt-1 text-[10px] text-red-400">
                          {directMessageErrorByPeerId().get(contact.peerId)}
                        </div>
                      </Show>
                    </div>
                  )}
                </For>
              </div>

              <Show when={totalPages > 1}>
                <div class="flex justify-center items-center gap-2 pt-1">
                  <button
                    onClick={() => setPage(Math.max(0, currentPage - 1))}
                    disabled={currentPage === 0}
                    class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                  >
                    prev
                  </button>
                  <span class="text-tg-text-dim text-xs">
                    {currentPage + 1} / {totalPages}
                    {query && ` (${contacts.length} match${contacts.length !== 1 ? "es" : ""})`}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))}
                    disabled={currentPage >= totalPages - 1}
                    class="border border-tg-border rounded px-2 py-0.5 text-tg-text-dim text-xs cursor-pointer disabled:opacity-40"
                  >
                    next
                  </button>
                </div>
              </Show>

              <Show when={query.length > 0 && contacts.length === 0}>
                <div class="text-tg-text-dim text-xs text-center py-2">
                  No contacts matching "{search()}"
                </div>
              </Show>
            </>
          );
        })()}
      </Show>
    </div>
  );
};
