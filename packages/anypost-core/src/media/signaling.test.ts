import { describe, it, expect } from "vitest";
import { encode } from "cbor-x";
import {
  SignalMessageSchema,
  encodeSignalMessage,
  decodeSignalMessage,
  MEDIA_SIGNAL_PROTOCOL,
} from "./signaling.js";
import type { SignalMessage } from "./signaling.js";

const createOfferMessage = (
  overrides?: Partial<Extract<SignalMessage, { type: "offer" }>>,
): SignalMessage => ({
  type: "offer",
  sdp: "v=0\r\no=- 123 456 IN IP4 0.0.0.0\r\n",
  ...overrides,
});

const createAnswerMessage = (
  overrides?: Partial<Extract<SignalMessage, { type: "answer" }>>,
): SignalMessage => ({
  type: "answer",
  sdp: "v=0\r\no=- 789 012 IN IP4 0.0.0.0\r\n",
  ...overrides,
});

const createIceCandidateMessage = (
  overrides?: Partial<Extract<SignalMessage, { type: "ice-candidate" }>>,
): SignalMessage => ({
  type: "ice-candidate",
  candidate: "candidate:842163049 1 udp 1677729535 192.168.0.1 3478 typ srflx",
  sdpMLineIndex: 0,
  sdpMid: "0",
  ...overrides,
});

const createHangupMessage = (): SignalMessage => ({
  type: "hangup",
});

describe("SDP Signaling", () => {
  describe("SignalMessageSchema", () => {
    it("should validate an SDP offer message", () => {
      const message = createOfferMessage();
      const result = SignalMessageSchema.safeParse(message);

      expect(result.success).toBe(true);
      if (result.success && result.data.type === "offer") {
        expect(result.data.sdp).toContain("v=0");
      }
    });

    it("should validate an SDP answer message", () => {
      const message = createAnswerMessage();
      const result = SignalMessageSchema.safeParse(message);

      expect(result.success).toBe(true);
      if (result.success && result.data.type === "answer") {
        expect(result.data.sdp).toContain("v=0");
      }
    });

    it("should validate an ICE candidate message", () => {
      const message = createIceCandidateMessage();
      const result = SignalMessageSchema.safeParse(message);

      expect(result.success).toBe(true);
      if (result.success && result.data.type === "ice-candidate") {
        expect(result.data.candidate).toContain("candidate:");
      }
    });

    it("should validate a hangup message", () => {
      const message = createHangupMessage();
      const result = SignalMessageSchema.safeParse(message);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("hangup");
      }
    });

    it("should reject messages with unknown type", () => {
      const message = { type: "unknown", sdp: "something" };
      const result = SignalMessageSchema.safeParse(message);

      expect(result.success).toBe(false);
    });

    it("should reject offer without sdp field", () => {
      const result = SignalMessageSchema.safeParse({ type: "offer" });

      expect(result.success).toBe(false);
    });

    it("should reject ice-candidate without candidate field", () => {
      const result = SignalMessageSchema.safeParse({
        type: "ice-candidate",
        sdpMLineIndex: 0,
        sdpMid: "0",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("encodeSignalMessage", () => {
    it("should produce a Uint8Array", () => {
      const message = createOfferMessage();
      const encoded = encodeSignalMessage(message);

      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBeGreaterThan(0);
    });
  });

  describe("decodeSignalMessage", () => {
    it("should reconstruct an offer message from encoded bytes", () => {
      const original = createOfferMessage();
      const encoded = encodeSignalMessage(original);
      const result = decodeSignalMessage(encoded);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("offer");
        expect(result.data).toEqual(original);
      }
    });

    it("should round-trip all signal message types", () => {
      const messages: readonly SignalMessage[] = [
        createOfferMessage(),
        createAnswerMessage(),
        createIceCandidateMessage(),
        createHangupMessage(),
      ];

      for (const original of messages) {
        const encoded = encodeSignalMessage(original);
        const result = decodeSignalMessage(encoded);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(original);
        }
      }
    });

    it("should return failure for malformed input", () => {
      const garbage = new Uint8Array([0xff, 0xfe, 0xfd]);
      const result = decodeSignalMessage(garbage);

      expect(result.success).toBe(false);
    });

    it("should return failure for valid CBOR with wrong shape", () => {
      const wrongShape = new Uint8Array(encode({ foo: "bar" }));
      const result = decodeSignalMessage(wrongShape);

      expect(result.success).toBe(false);
    });
  });

  describe("MEDIA_SIGNAL_PROTOCOL", () => {
    it("should be the correct protocol string", () => {
      expect(MEDIA_SIGNAL_PROTOCOL).toBe("/anypost/media-signal/1.0.0");
    });
  });
});
