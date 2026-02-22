import { z } from "zod";
import { encode, decode } from "cbor-x";
import { Result } from "../shared/result.js";

export const MEDIA_SIGNAL_PROTOCOL = "/anypost/media-signal/1.0.0";

export const SignalMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("offer"),
    sdp: z.string().min(1),
  }),
  z.object({
    type: z.literal("answer"),
    sdp: z.string().min(1),
  }),
  z.object({
    type: z.literal("ice-candidate"),
    candidate: z.string().min(1),
    sdpMLineIndex: z.number().int().nonnegative(),
    sdpMid: z.string(),
  }),
  z.object({
    type: z.literal("hangup"),
  }),
]);

export type SignalMessage = z.infer<typeof SignalMessageSchema>;

export const encodeSignalMessage = (message: SignalMessage): Uint8Array =>
  new Uint8Array(encode(message));

export const decodeSignalMessage = (
  bytes: Uint8Array,
): Result<SignalMessage, Error> => {
  try {
    const raw: unknown = decode(bytes);
    const parsed = SignalMessageSchema.parse(raw);
    return Result.success(parsed);
  } catch (error) {
    return Result.failure(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
};
