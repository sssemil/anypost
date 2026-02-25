export type MessageQuote = {
  readonly messageId?: string;
  readonly senderPeerId?: string;
  readonly senderLabel: string;
  readonly text: string;
};

export type ParsedQuotedMessage = {
  readonly body: string;
  readonly quote: MessageQuote | null;
};

const QUOTE_WIRE_PREFIX = "[anypost-reply-v1:";
const QUOTE_WIRE_SUFFIX = "]";

const encodeBase64Utf8 = (value: string): string | null => {
  if (typeof btoa !== "function") return null;
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const decodeBase64Utf8 = (value: string): string | null => {
  if (typeof atob !== "function") return null;
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};

const compactQuoteText = (text: string): string =>
  text.replace(/\s+/g, " ").trim().slice(0, 220);

export const encodeQuotedMessage = (
  body: string,
  quote: MessageQuote,
): string => {
  const payload = {
    m: quote.messageId ?? undefined,
    p: quote.senderPeerId ?? undefined,
    l: quote.senderLabel.trim(),
    t: compactQuoteText(quote.text) || "...",
  };
  const encodedPayload = encodeBase64Utf8(JSON.stringify(payload));
  if (!encodedPayload) {
    return `↪ ${payload.l}: ${payload.t}\n${body}`;
  }
  return `${QUOTE_WIRE_PREFIX}${encodedPayload}${QUOTE_WIRE_SUFFIX}\n${body}`;
};

const parseLegacyQuotedMessage = (text: string): ParsedQuotedMessage | null => {
  const newlineIndex = text.indexOf("\n");
  if (newlineIndex <= 0) return null;
  const firstLine = text.slice(0, newlineIndex).trim();
  if (!firstLine.startsWith("↪ ")) return null;
  const details = firstLine.slice(2);
  const splitIndex = details.indexOf(": ");
  if (splitIndex <= 0) return null;
  const senderLabel = details.slice(0, splitIndex).trim();
  const quoteText = details.slice(splitIndex + 2).trim();
  if (!senderLabel || !quoteText) return null;
  return {
    body: text.slice(newlineIndex + 1),
    quote: {
      senderLabel,
      text: quoteText,
    },
  };
};

export const parseQuotedMessage = (text: string): ParsedQuotedMessage => {
  if (text.startsWith(QUOTE_WIRE_PREFIX)) {
    const newlineIndex = text.indexOf("\n");
    const header = newlineIndex >= 0 ? text.slice(0, newlineIndex) : text;
    const body = newlineIndex >= 0 ? text.slice(newlineIndex + 1) : "";
    const headerMatch = /^\[anypost-reply-v1:([A-Za-z0-9+/=]+)\]$/.exec(header);
    if (headerMatch) {
      const decoded = decodeBase64Utf8(headerMatch[1]);
      if (decoded) {
        try {
          const payload = JSON.parse(decoded) as {
            readonly m?: unknown;
            readonly p?: unknown;
            readonly l?: unknown;
            readonly t?: unknown;
          };
          const senderLabel = typeof payload.l === "string" ? payload.l.trim() : "";
          const quoteText = typeof payload.t === "string" ? payload.t.trim() : "";
          if (senderLabel.length > 0 && quoteText.length > 0) {
            return {
              body,
              quote: {
                messageId: typeof payload.m === "string" ? payload.m : undefined,
                senderPeerId: typeof payload.p === "string" ? payload.p : undefined,
                senderLabel,
                text: quoteText,
              },
            };
          }
        } catch {
          // Fall through to non-quoted rendering.
        }
      }
    }
  }

  const legacy = parseLegacyQuotedMessage(text);
  if (legacy) return legacy;

  return {
    body: text,
    quote: null,
  };
};
