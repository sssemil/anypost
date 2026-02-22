import { encode, decode } from "cbor-x";
import { WireMessageSchema } from "../shared/schemas.js";
import type { WireMessage } from "../shared/schemas.js";
import { Result } from "../shared/result.js";

export const encodeWireMessage = (message: WireMessage): Uint8Array =>
  new Uint8Array(encode(message));

export const decodeWireMessage = (
  bytes: Uint8Array,
): Result<WireMessage, Error> => {
  try {
    const raw: unknown = decode(bytes);
    const parsed = WireMessageSchema.parse(raw);
    return Result.success(parsed);
  } catch (error) {
    return Result.failure(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
};
