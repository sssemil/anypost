import { sha256 } from "multiformats/hashes/sha2";
import { CID } from "multiformats/cid";
import * as raw from "multiformats/codecs/raw";

export const ANYPOST_RELAY_NAMESPACE = "anypost-relay";
export const ANYPOST_CHAT_NAMESPACE = "anypost/chat/1.0.0";
export const DEFAULT_TARGET_RELAY_POOL_SIZE = 4;

export const createProviderCid = async (namespace: string): Promise<CID> => {
  const bytes = new TextEncoder().encode(namespace);
  const hash = await sha256.digest(bytes);
  return CID.createV1(raw.code, hash);
};

type DhtConfig = {
  readonly clientMode: boolean;
};

export const createBrowserDhtConfig = (): DhtConfig => ({
  clientMode: true,
});

export const createRelayDhtConfig = (): DhtConfig => ({
  clientMode: false,
});
