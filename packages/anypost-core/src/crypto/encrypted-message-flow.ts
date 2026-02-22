import { encode, decode } from "cbor-x";
import { encryptMessage, processReceivedMessage } from "./mls-manager.js";
import type { MlsContext, MlsGroupState } from "./mls-manager.js";
import type { MlsFramedMessage } from "ts-mls";
import { MessageContentSchema } from "../shared/schemas.js";
import type { MessageContent } from "../shared/schemas.js";

type EncryptContentOptions = {
  readonly context: MlsContext;
  readonly groupState: MlsGroupState;
  readonly content: MessageContent;
};

type EncryptContentResult = {
  readonly newGroupState: MlsGroupState;
  readonly ciphertext: MlsFramedMessage;
};

export const encryptContent = async (
  options: EncryptContentOptions,
): Promise<EncryptContentResult> => {
  const contentBytes = new Uint8Array(encode(options.content));
  const result = await encryptMessage({
    context: options.context,
    groupState: options.groupState,
    plaintext: contentBytes,
  });

  return {
    newGroupState: result.newGroupState,
    ciphertext: result.ciphertext,
  };
};

type DecryptContentOptions = {
  readonly context: MlsContext;
  readonly groupState: MlsGroupState;
  readonly message: MlsFramedMessage;
};

type DecryptContentResult =
  | {
      readonly kind: "message";
      readonly newGroupState: MlsGroupState;
      readonly content: MessageContent;
    }
  | { readonly kind: "commit"; readonly newGroupState: MlsGroupState };

export const decryptContent = async (
  options: DecryptContentOptions,
): Promise<DecryptContentResult> => {
  const result = await processReceivedMessage({
    context: options.context,
    groupState: options.groupState,
    message: options.message,
  });

  if (result.kind === "commit") {
    return { kind: "commit", newGroupState: result.newGroupState };
  }

  const raw: unknown = decode(result.plaintext);
  const content = MessageContentSchema.parse(raw);

  return { kind: "message", newGroupState: result.newGroupState, content };
};

export type BufferedMessage = {
  readonly id: string;
  readonly message: MlsFramedMessage;
};

export type MessageBuffer = {
  readonly messages: readonly BufferedMessage[];
};

export const createMessageBuffer = (): MessageBuffer => ({
  messages: [],
});

export const bufferMessage = (
  buffer: MessageBuffer,
  message: BufferedMessage,
): MessageBuffer => ({
  messages: [...buffer.messages, message],
});

type DrainBufferOptions = {
  readonly context: MlsContext;
  readonly groupState: MlsGroupState;
};

type DrainBufferResult = {
  readonly decrypted: readonly {
    readonly id: string;
    readonly content: MessageContent;
  }[];
  readonly remaining: MessageBuffer;
  readonly newGroupState: MlsGroupState;
};

export const drainMessageBuffer = async (
  buffer: MessageBuffer,
  options: DrainBufferOptions,
): Promise<DrainBufferResult> => {
  const decrypted: { readonly id: string; readonly content: MessageContent }[] =
    [];
  const remaining: BufferedMessage[] = [];
  let currentState = options.groupState;

  for (const buffered of buffer.messages) {
    try {
      const result = await decryptContent({
        context: options.context,
        groupState: currentState,
        message: buffered.message,
      });

      currentState = result.newGroupState;
      if (result.kind === "message") {
        decrypted.push({ id: buffered.id, content: result.content });
      }
    } catch {
      remaining.push(buffered);
    }
  }

  return {
    decrypted,
    remaining: { messages: remaining },
    newGroupState: currentState,
  };
};
