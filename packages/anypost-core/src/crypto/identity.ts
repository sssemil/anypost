import { ed25519 } from "@noble/curves/ed25519.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { mnemonicToEntropy, entropyToMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { encode } from "cbor-x";
import { publicKeyFromRaw } from "@libp2p/crypto/keys";
import { peerIdFromPublicKey } from "@libp2p/peer-id";
import type { DeviceCertificate } from "../shared/schemas.js";
import { fromHex } from "../protocol/action-chain.js";

export type AccountKey = {
  readonly publicKey: Uint8Array;
  readonly privateKey: Uint8Array;
};

export type ExportedAccountKey = {
  readonly seedPhrase: string;
};

const keyFromSeed = (seed: Uint8Array): AccountKey => ({
  publicKey: ed25519.getPublicKey(seed),
  privateKey: seed,
});

export const generateAccountKey = (): AccountKey => {
  const seed = randomBytes(32);
  return keyFromSeed(seed);
};

export const generateDeviceKey = (): AccountKey => {
  const seed = randomBytes(32);
  return keyFromSeed(seed);
};

export const accountKeyFromSeed = (seedPhrase: string): AccountKey => {
  if (!validateMnemonic(seedPhrase, wordlist)) {
    throw new Error("Invalid seed phrase");
  }
  const entropy = mnemonicToEntropy(seedPhrase, wordlist);
  return keyFromSeed(entropy);
};

export const exportAccountKey = (key: AccountKey): ExportedAccountKey => {
  const seedPhrase = entropyToMnemonic(key.privateKey, wordlist);
  return { seedPhrase };
};

export const importAccountKey = (seedPhrase: string): AccountKey =>
  accountKeyFromSeed(seedPhrase);

export const accountIdFromPublicKeyHex = (publicKeyHex: string): string => {
  const rawBytes = fromHex(publicKeyHex);
  const libp2pPublicKey = publicKeyFromRaw(rawBytes);
  return peerIdFromPublicKey(libp2pPublicKey).toString();
};

const DEFAULT_CERTIFICATE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

const encodeCertificatePayload = (
  devicePeerId: string,
  accountPublicKey: Uint8Array,
  timestamp: number,
): Uint8Array =>
  new Uint8Array(encode({ devicePeerId, accountPublicKey, timestamp }));

type CreateDeviceCertificateOptions = {
  readonly accountKey: AccountKey;
  readonly devicePeerId: string;
  readonly timestamp?: number;
};

export const createDeviceCertificate = (
  options: CreateDeviceCertificateOptions,
): DeviceCertificate => {
  const timestamp = options.timestamp ?? Date.now();
  const payload = encodeCertificatePayload(
    options.devicePeerId,
    options.accountKey.publicKey,
    timestamp,
  );
  const signature = ed25519.sign(payload, options.accountKey.privateKey);

  return {
    devicePeerId: options.devicePeerId,
    accountPublicKey: new Uint8Array(options.accountKey.publicKey),
    timestamp,
    signature: new Uint8Array(signature),
  };
};

type VerifyDeviceCertificateOptions = {
  readonly certificate: DeviceCertificate;
  readonly now?: number;
  readonly maxAge?: number;
};

export const verifyDeviceCertificate = (
  options: VerifyDeviceCertificateOptions,
): boolean => {
  const { certificate } = options;
  const now = options.now ?? Date.now();
  const maxAge = options.maxAge ?? DEFAULT_CERTIFICATE_MAX_AGE_MS;

  if (certificate.timestamp > now + CLOCK_SKEW_TOLERANCE_MS) {
    return false;
  }

  if (now - certificate.timestamp > maxAge) {
    return false;
  }

  const payload = encodeCertificatePayload(
    certificate.devicePeerId,
    certificate.accountPublicKey,
    certificate.timestamp,
  );

  try {
    return ed25519.verify(certificate.signature, payload, certificate.accountPublicKey);
  } catch {
    return false;
  }
};
