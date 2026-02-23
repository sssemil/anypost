import type { WireMessage, EncryptedMessage, GroupId } from "../shared/schemas.js";

type MlsCommitPayload = Extract<WireMessage, { type: "mls_commit" }>["payload"];
type SyncRequestPayload = Extract<WireMessage, { type: "sync_request" }>["payload"];
type SyncResponsePayload = Extract<WireMessage, { type: "sync_response" }>["payload"];

type SignedActionPayload = {
  readonly signedBytes: Uint8Array;
  readonly signature: Uint8Array;
  readonly hash: Uint8Array;
};

type JoinRequestPayload = {
  readonly groupId: string;
  readonly requesterPublicKey: Uint8Array;
};

export type MessageHandler = {
  readonly onEncryptedMessage: (payload: EncryptedMessage) => void;
  readonly onMlsCommit: (payload: MlsCommitPayload) => void;
  readonly onSyncRequest: (payload: SyncRequestPayload) => void;
  readonly onSyncResponse: (payload: SyncResponsePayload) => void;
  readonly onSignedAction: (payload: SignedActionPayload) => void;
  readonly onJoinRequest: (payload: JoinRequestPayload) => void;
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
      case "sync_response":
        handlers.onSyncResponse(message.payload);
        break;
      case "signed_action":
        handlers.onSignedAction({
          signedBytes: message.signedBytes,
          signature: message.signature,
          hash: message.hash,
        });
        break;
      case "join_request":
        handlers.onJoinRequest({
          groupId: message.groupId,
          requesterPublicKey: message.requesterPublicKey,
        });
        break;
    }
  },
});

export const groupTopic = (groupId: GroupId): string =>
  `anypost/group/${groupId}`;

export const deviceDiscoveryTopic = (accountPublicKeyHex: string): string =>
  `anypost/account/${accountPublicKeyHex}/devices`;
