type PendingMessageStatus = "sending" | "failed";

type PendingMessage = {
  readonly id: string;
  readonly text: string;
  readonly status: PendingMessageStatus;
  readonly error?: string;
};

type Outbox = {
  readonly messages: readonly PendingMessage[];
};

export const createOutbox = (): Outbox => ({
  messages: [],
});

export const createPendingMessage = (
  outbox: Outbox,
  options: { readonly id: string; readonly text: string },
): Outbox => ({
  messages: [
    ...outbox.messages,
    { id: options.id, text: options.text, status: "sending" },
  ],
});

export const confirmMessage = (outbox: Outbox, messageId: string): Outbox => ({
  messages: outbox.messages.filter((m) => m.id !== messageId),
});

export const failMessage = (
  outbox: Outbox,
  messageId: string,
  error: string,
): Outbox => ({
  messages: outbox.messages.map((m) =>
    m.id === messageId ? { ...m, status: "failed" as const, error } : m,
  ),
});

export const getPendingMessages = (outbox: Outbox): readonly PendingMessage[] =>
  outbox.messages;
