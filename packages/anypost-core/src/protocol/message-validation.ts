export const DEFAULT_MAX_MESSAGE_SIZE_BYTES = 65_536;

type ValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: string };

export const validateMessageSize = (
  data: Uint8Array,
  maxBytes: number = DEFAULT_MAX_MESSAGE_SIZE_BYTES,
): ValidationResult => {
  if (!Number.isFinite(maxBytes) || maxBytes < 0) {
    throw new RangeError(
      `maxBytes must be a non-negative finite number, got ${maxBytes}`,
    );
  }
  if (data.byteLength > maxBytes) {
    return {
      valid: false,
      reason: `Message size ${data.byteLength} exceeds limit of ${maxBytes} bytes`,
    };
  }
  return { valid: true };
};
