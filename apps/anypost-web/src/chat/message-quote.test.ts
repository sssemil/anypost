import { describe, expect, it } from "vitest";
import { encodeQuotedMessage, parseQuotedMessage } from "./message-quote.js";

describe("message quote helpers", () => {
  it("round-trips encoded quote payloads", () => {
    const encoded = encodeQuotedMessage("reply body", {
      messageId: "4ea0b88a-0e87-4f5d-bc0e-bf6a6d5ec830",
      senderPeerId: "12D3KooWexample",
      senderLabel: "Emil",
      text: "original hello",
    });
    const parsed = parseQuotedMessage(encoded);
    expect(parsed.body).toBe("reply body");
    expect(parsed.quote).toEqual({
      messageId: "4ea0b88a-0e87-4f5d-bc0e-bf6a6d5ec830",
      senderPeerId: "12D3KooWexample",
      senderLabel: "Emil",
      text: "original hello",
    });
  });

  it("parses legacy reply-prefixed text", () => {
    const parsed = parseQuotedMessage("↪ Emil: original hello\nreply body");
    expect(parsed.body).toBe("reply body");
    expect(parsed.quote).toEqual({
      senderLabel: "Emil",
      text: "original hello",
    });
  });

  it("returns plain messages without quote metadata", () => {
    const parsed = parseQuotedMessage("just a normal message");
    expect(parsed.body).toBe("just a normal message");
    expect(parsed.quote).toBeNull();
  });
});
