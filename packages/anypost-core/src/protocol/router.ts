import type { WireMessage, EncryptedMessage, GroupId } from "../shared/schemas.js";

type MlsCommitPayload = Extract<WireMessage, { type: "mls_commit" }>["payload"];
type SyncRequestPayload = Extract<WireMessage, { type: "sync_request" }>["payload"];

export type MessageHandler = {
  readonly onEncryptedMessage: (payload: EncryptedMessage) => void;
  readonly onMlsCommit: (payload: MlsCommitPayload) => void;
  readonly onSyncRequest: (payload: SyncRequestPayload) => void;
};

type Router = {
  readonly handleMessage: (message: WireMessage) => void;
};

export const createRouter = (handlers: MessageHandler): Router => ({
  handleMessage: (message: WireMessage): void => {
    switch (message.type) {
      case "encrypted_message":
        handlers.onEncryptedMessage(message.payload);
        break;
      case "mls_commit":
        handlers.onMlsCommit(message.payload);
        break;
      case "sync_request":
        handlers.onSyncRequest(message.payload);
        break;
    }
  },
});

export const groupTopic = (groupId: GroupId): string =>
  `anypost/group/${groupId}`;
