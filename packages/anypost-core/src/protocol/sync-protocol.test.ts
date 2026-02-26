import { describe, it, expect } from "vitest";
import { generateAccountKey } from "../crypto/identity.js";
import type { SignedActionEnvelope } from "./action-chain.js";
import {
  encodeSyncRequestSigningPayload,
  encodeSyncResponseSigningPayload,
  signSyncRequest,
  verifySyncRequest,
  signSyncResponse,
  verifySyncResponse,
  getMissingEnvelopesForKnownHash,
  INCOMING_SYNC_REQUEST_MAX,
  OUTGOING_SYNC_REQUEST_MAX,
  FULL_SYNC_FALLBACK_COOLDOWN_MS,
} from "./sync-protocol.js";

const createTestPublicKey = (): Uint8Array =>
  new Uint8Array(generateAccountKey().publicKey);

const createTestEnvelope = (hashByte: number): SignedActionEnvelope => {
  const hash = new Uint8Array(32);
  hash[0] = hashByte;
  return {
    signedBytes: new Uint8Array([1, 2, 3]),
    signature: new Uint8Array(64),
    hash,
  };
};

describe("Sync protocol", () => {
  describe("encodeSyncRequestSigningPayload", () => {
    it("should return a Uint8Array", () => {
      const result = encodeSyncRequestSigningPayload({
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        senderPeerId: "12D3KooWTest",
        senderPublicKey: createTestPublicKey(),
        knownHeads: [],
      });

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should produce different output for different payloads", () => {
      const publicKey = createTestPublicKey();
      const result1 = encodeSyncRequestSigningPayload({
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        senderPeerId: "12D3KooWTest",
        senderPublicKey: publicKey,
        knownHeads: [],
      });
      const result2 = encodeSyncRequestSigningPayload({
        groupId: "b1ffcc00-0000-0000-0000-000000000000",
        senderPeerId: "12D3KooWTest",
        senderPublicKey: publicKey,
        knownHeads: [],
      });

      expect(result1).not.toEqual(result2);
    });
  });

  describe("encodeSyncResponseSigningPayload", () => {
    it("should return a Uint8Array", () => {
      const result = encodeSyncResponseSigningPayload({
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        senderPeerId: "12D3KooWTest",
        senderPublicKey: createTestPublicKey(),
        targetPeerId: "12D3KooWOther",
        theirHeads: [],
        envelopes: [],
      });

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("signSyncRequest + verifySyncRequest", () => {
    it("should produce a valid signature that verifies", () => {
      const accountKey = generateAccountKey();
      const payload = {
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        senderPeerId: "12D3KooWTest",
        senderPublicKey: new Uint8Array(accountKey.publicKey),
        knownHeads: [new Uint8Array(32).fill(1)],
      };

      const signature = signSyncRequest(payload, accountKey.privateKey);

      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBe(64);

      const valid = verifySyncRequest({ ...payload, signature });
      expect(valid).toBe(true);
    });

    it("should reject a tampered signature", () => {
      const accountKey = generateAccountKey();
      const payload = {
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        senderPeerId: "12D3KooWTest",
        senderPublicKey: new Uint8Array(accountKey.publicKey),
        knownHeads: [],
      };

      const signature = signSyncRequest(payload, accountKey.privateKey);
      const tampered = new Uint8Array(signature);
      tampered[0] ^= 0xff;

      const valid = verifySyncRequest({ ...payload, signature: tampered });
      expect(valid).toBe(false);
    });

    it("should reject when verified with a different public key", () => {
      const signerKey = generateAccountKey();
      const otherKey = generateAccountKey();
      const payload = {
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        senderPeerId: "12D3KooWTest",
        senderPublicKey: new Uint8Array(signerKey.publicKey),
        knownHeads: [],
      };

      const signature = signSyncRequest(payload, signerKey.privateKey);

      const valid = verifySyncRequest({
        ...payload,
        senderPublicKey: new Uint8Array(otherKey.publicKey),
        signature,
      });
      expect(valid).toBe(false);
    });
  });

  describe("signSyncResponse + verifySyncResponse", () => {
    it("should produce a valid signature that verifies", () => {
      const accountKey = generateAccountKey();
      const payload = {
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        senderPeerId: "12D3KooWTest",
        senderPublicKey: new Uint8Array(accountKey.publicKey),
        targetPeerId: "12D3KooWOther",
        theirHeads: [],
        envelopes: [],
      };

      const signature = signSyncResponse(payload, accountKey.privateKey);

      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBe(64);

      const valid = verifySyncResponse({ ...payload, signature });
      expect(valid).toBe(true);
    });

    it("should reject a tampered signature", () => {
      const accountKey = generateAccountKey();
      const payload = {
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        senderPeerId: "12D3KooWTest",
        senderPublicKey: new Uint8Array(accountKey.publicKey),
        targetPeerId: "12D3KooWOther",
        theirHeads: [],
        envelopes: [],
      };

      const signature = signSyncResponse(payload, accountKey.privateKey);
      const tampered = new Uint8Array(signature);
      tampered[0] ^= 0xff;

      const valid = verifySyncResponse({ ...payload, signature: tampered });
      expect(valid).toBe(false);
    });

    it("should reject when verified with a different public key", () => {
      const signerKey = generateAccountKey();
      const otherKey = generateAccountKey();
      const payload = {
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        senderPeerId: "12D3KooWTest",
        senderPublicKey: new Uint8Array(signerKey.publicKey),
        targetPeerId: "12D3KooWOther",
        theirHeads: [],
        envelopes: [],
      };

      const signature = signSyncResponse(payload, signerKey.privateKey);

      const valid = verifySyncResponse({
        ...payload,
        senderPublicKey: new Uint8Array(otherKey.publicKey),
        signature,
      });
      expect(valid).toBe(false);
    });

    it("should return false for a malformed signature length", () => {
      const accountKey = generateAccountKey();
      const payload = {
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        senderPeerId: "12D3KooWTest",
        senderPublicKey: new Uint8Array(accountKey.publicKey),
        targetPeerId: "12D3KooWOther",
        theirHeads: [],
        envelopes: [],
      };

      const valid = verifySyncResponse({ ...payload, signature: new Uint8Array(1) });
      expect(valid).toBe(false);
    });
  });

  describe("verifySyncRequest with malformed inputs", () => {
    it("should return false for a zero-length signature", () => {
      const accountKey = generateAccountKey();
      const payload = {
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        senderPeerId: "12D3KooWTest",
        senderPublicKey: new Uint8Array(accountKey.publicKey),
        knownHeads: [],
      };

      const valid = verifySyncRequest({ ...payload, signature: new Uint8Array(0) });
      expect(valid).toBe(false);
    });

    it("should return false for a public key of wrong length", () => {
      const accountKey = generateAccountKey();
      const signature = signSyncRequest({
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        senderPeerId: "12D3KooWTest",
        senderPublicKey: new Uint8Array(accountKey.publicKey),
        knownHeads: [],
      }, accountKey.privateKey);

      const valid = verifySyncRequest({
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        senderPeerId: "12D3KooWTest",
        senderPublicKey: new Uint8Array(5),
        knownHeads: [],
        signature,
      });
      expect(valid).toBe(false);
    });
  });

  describe("getMissingEnvelopesForKnownHash", () => {
    it("should return all envelopes when no known hash is provided", () => {
      const envelopes = [createTestEnvelope(1), createTestEnvelope(2), createTestEnvelope(3)];

      const result = getMissingEnvelopesForKnownHash(envelopes);

      expect(result).toEqual(envelopes);
    });

    it("should return empty array when envelopes are empty", () => {
      const result = getMissingEnvelopesForKnownHash([]);

      expect(result).toEqual([]);
    });

    it("should return all envelopes when known hash is empty Uint8Array", () => {
      const envelopes = [createTestEnvelope(1), createTestEnvelope(2)];

      const result = getMissingEnvelopesForKnownHash(envelopes, new Uint8Array(0));

      expect(result).toEqual(envelopes);
    });

    it("should return envelopes after the known hash", () => {
      const envelopes = [createTestEnvelope(1), createTestEnvelope(2), createTestEnvelope(3)];
      const knownHash = envelopes[0].hash;

      const result = getMissingEnvelopesForKnownHash(envelopes, knownHash);

      expect(result).toEqual([envelopes[1], envelopes[2]]);
    });

    it("should return empty array when known hash is the last envelope", () => {
      const envelopes = [createTestEnvelope(1), createTestEnvelope(2)];
      const knownHash = envelopes[1].hash;

      const result = getMissingEnvelopesForKnownHash(envelopes, knownHash);

      expect(result).toEqual([]);
    });

    it("should return all envelopes when known hash is not found", () => {
      const envelopes = [createTestEnvelope(1), createTestEnvelope(2)];
      const unknownHash = new Uint8Array(32);
      unknownHash[0] = 99;

      const result = getMissingEnvelopesForKnownHash(envelopes, unknownHash);

      expect(result).toEqual(envelopes);
    });
  });

  describe("exported constants", () => {
    it("should export sync rate limiting constants", () => {
      expect(INCOMING_SYNC_REQUEST_MAX).toBe(40);
      expect(OUTGOING_SYNC_REQUEST_MAX).toBe(60);
      expect(FULL_SYNC_FALLBACK_COOLDOWN_MS).toBe(30_000);
    });
  });
});
