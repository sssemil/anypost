import { describe, it, expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  generateAccountKey,
  accountKeyFromSeed,
  exportAccountKey,
  importAccountKey,
  generateDeviceKey,
  createDeviceCertificate,
  verifyDeviceCertificate,
} from "./identity.js";

const TEST_SEED_1 =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";

const TEST_SEED_2 =
  "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo vote";

const TEST_DEVICE_PEER_ID =
  "12D3KooWBtg3aaRMjxwedh83aGiUkwSxDwUZkzuJcfaqUmo7R3pn";

describe("Account Key Generation", () => {
  it("generateAccountKey should produce a valid ed25519 signing keypair", () => {
    const key = generateAccountKey();

    expect(key.publicKey).toBeInstanceOf(Uint8Array);
    expect(key.privateKey).toBeInstanceOf(Uint8Array);
    expect(key.publicKey.length).toBe(32);
    expect(key.privateKey.length).toBe(32);

    const expectedPublicKey = ed25519.getPublicKey(key.privateKey);
    expect(key.publicKey).toEqual(expectedPublicKey);

    const message = new Uint8Array([1, 2, 3, 4]);
    const signature = ed25519.sign(message, key.privateKey);
    expect(ed25519.verify(signature, message, key.publicKey)).toBe(true);
  });

  it("generateAccountKey should produce different keys each call", () => {
    const key1 = generateAccountKey();
    const key2 = generateAccountKey();

    expect(key1.publicKey).not.toEqual(key2.publicKey);
    expect(key1.privateKey).not.toEqual(key2.privateKey);
  });

  it("accountKeyFromSeed should be deterministic (same seed = same key)", () => {
    const key1 = accountKeyFromSeed(TEST_SEED_1);
    const key2 = accountKeyFromSeed(TEST_SEED_1);

    expect(key1.publicKey).toEqual(key2.publicKey);
    expect(key1.privateKey).toEqual(key2.privateKey);
  });

  it("accountKeyFromSeed should produce different keys for different seeds", () => {
    const key1 = accountKeyFromSeed(TEST_SEED_1);
    const key2 = accountKeyFromSeed(TEST_SEED_2);

    expect(key1.publicKey).not.toEqual(key2.publicKey);
    expect(key1.privateKey).not.toEqual(key2.privateKey);
  });

  it("exportAccountKey should produce a valid 24-word seed phrase", () => {
    const key = generateAccountKey();
    const exported = exportAccountKey(key);

    expect(typeof exported.seedPhrase).toBe("string");
    const words = exported.seedPhrase.split(" ");
    expect(words.length).toBe(24);
  });

  it("importAccountKey should reconstruct the same keypair from seed phrase", () => {
    const original = generateAccountKey();
    const exported = exportAccountKey(original);
    const restored = importAccountKey(exported.seedPhrase);

    expect(restored.publicKey).toEqual(original.publicKey);
    expect(restored.privateKey).toEqual(original.privateKey);
  });

  it("seedPhraseToKey round-trip should preserve identity", () => {
    const key = accountKeyFromSeed(TEST_SEED_1);
    const exported = exportAccountKey(key);
    const restored = importAccountKey(exported.seedPhrase);

    expect(restored.publicKey).toEqual(key.publicKey);
    expect(restored.privateKey).toEqual(key.privateKey);
  });

  it("accountKeyFromSeed should reject invalid seed phrases", () => {
    expect(() => accountKeyFromSeed("not a valid seed phrase")).toThrow(
      "Invalid seed phrase"
    );
  });

  it("importAccountKey should reject invalid seed phrases", () => {
    expect(() => importAccountKey("not a valid seed phrase")).toThrow(
      "Invalid seed phrase"
    );
  });
});

describe("Device Key Generation", () => {
  it("generateDeviceKey should produce a unique keypair each call", () => {
    const key1 = generateDeviceKey();
    const key2 = generateDeviceKey();

    expect(key1.publicKey).toBeInstanceOf(Uint8Array);
    expect(key1.privateKey).toBeInstanceOf(Uint8Array);
    expect(key1.publicKey.length).toBe(32);
    expect(key1.privateKey.length).toBe(32);
    expect(key1.publicKey).not.toEqual(key2.publicKey);
    expect(key1.privateKey).not.toEqual(key2.privateKey);
  });
});

describe("Device Certificates", () => {
  it("createDeviceCertificate should sign with account key", () => {
    const accountKey = generateAccountKey();

    const cert = createDeviceCertificate({
      accountKey,
      devicePeerId: TEST_DEVICE_PEER_ID,
    });

    expect(cert.signature).toBeInstanceOf(Uint8Array);
    expect(cert.signature.length).toBe(64);
  });

  it("createDeviceCertificate should include device PeerId and account public key", () => {
    const accountKey = generateAccountKey();

    const cert = createDeviceCertificate({
      accountKey,
      devicePeerId: TEST_DEVICE_PEER_ID,
    });

    expect(cert.devicePeerId).toBe(TEST_DEVICE_PEER_ID);
    expect(cert.accountPublicKey).toEqual(accountKey.publicKey);
    expect(cert.timestamp).toBeTypeOf("number");
  });

  it("verifyDeviceCertificate should accept valid certificate", () => {
    const accountKey = generateAccountKey();

    const cert = createDeviceCertificate({
      accountKey,
      devicePeerId: TEST_DEVICE_PEER_ID,
    });

    expect(verifyDeviceCertificate({ certificate: cert })).toBe(true);
  });

  it("verifyDeviceCertificate should reject certificate signed by wrong key", () => {
    const accountKey = generateAccountKey();
    const wrongKey = generateAccountKey();

    const cert = createDeviceCertificate({
      accountKey,
      devicePeerId: TEST_DEVICE_PEER_ID,
    });

    const forgedCert = {
      ...cert,
      accountPublicKey: new Uint8Array(wrongKey.publicKey),
    };

    expect(verifyDeviceCertificate({ certificate: forgedCert })).toBe(false);
  });

  it("verifyDeviceCertificate should reject expired certificate", () => {
    const accountKey = generateAccountKey();
    const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;

    const cert = createDeviceCertificate({
      accountKey,
      devicePeerId: TEST_DEVICE_PEER_ID,
      timestamp: twoYearsAgo,
    });

    expect(verifyDeviceCertificate({ certificate: cert })).toBe(false);
  });

  it("verifyDeviceCertificate should reject tampered certificate", () => {
    const accountKey = generateAccountKey();

    const cert = createDeviceCertificate({
      accountKey,
      devicePeerId: TEST_DEVICE_PEER_ID,
    });

    const tamperedCert = {
      ...cert,
      devicePeerId: "12D3KooWDifferentPeerId987654321",
    };

    expect(verifyDeviceCertificate({ certificate: tamperedCert })).toBe(false);
  });

  it("verifyDeviceCertificate should reject certificate with future timestamp", () => {
    const accountKey = generateAccountKey();
    const tenMinutesFromNow = Date.now() + 10 * 60 * 1000;

    const cert = createDeviceCertificate({
      accountKey,
      devicePeerId: TEST_DEVICE_PEER_ID,
      timestamp: tenMinutesFromNow,
    });

    expect(verifyDeviceCertificate({ certificate: cert })).toBe(false);
  });

  it("verifyDeviceCertificate should return false for malformed signature", () => {
    const accountKey = generateAccountKey();

    const cert = createDeviceCertificate({
      accountKey,
      devicePeerId: TEST_DEVICE_PEER_ID,
    });

    const malformedCert = {
      ...cert,
      signature: new Uint8Array(10),
    };

    expect(verifyDeviceCertificate({ certificate: malformedCert })).toBe(false);
  });

  it("verifyDeviceCertificate should return false for malformed public key", () => {
    const accountKey = generateAccountKey();

    const cert = createDeviceCertificate({
      accountKey,
      devicePeerId: TEST_DEVICE_PEER_ID,
    });

    const malformedCert = {
      ...cert,
      accountPublicKey: new Uint8Array(10),
    };

    expect(verifyDeviceCertificate({ certificate: malformedCert })).toBe(false);
  });
});
