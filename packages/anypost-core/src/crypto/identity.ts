import { ed25519 } from "@noble/curves/ed25519.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { generateMnemonic, mnemonicToEntropy, entropyToMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

export type AccountKey = {
  readonly publicKey: Uint8Array;
  readonly privateKey: Uint8Array;
};

export type ExportedAccountKey = {
  readonly seedPhrase: string;
};

const ENTROPY_BITS = 256;

const keyFromSeed = (seed: Uint8Array): AccountKey => ({
  publicKey: ed25519.getPublicKey(seed),
  privateKey: seed,
});

export const generateAccountKey = (): AccountKey => {
  const seed = randomBytes(32);
  return keyFromSeed(seed);
};

export const accountKeyFromSeed = (seedPhrase: string): AccountKey => {
  const entropy = mnemonicToEntropy(seedPhrase, wordlist);
  return keyFromSeed(entropy);
};

export const exportAccountKey = (key: AccountKey): ExportedAccountKey => {
  const seedPhrase = entropyToMnemonic(key.privateKey, wordlist);
  return { seedPhrase };
};

export const importAccountKey = (seedPhrase: string): AccountKey => {
  if (!validateMnemonic(seedPhrase, wordlist)) {
    throw new Error("Invalid seed phrase");
  }
  return accountKeyFromSeed(seedPhrase);
};
