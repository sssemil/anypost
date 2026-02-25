import { IPFS_BOOTSTRAP_TCP_PEERS, IPFS_BOOTSTRAP_WSS_PEERS } from "../libp2p/bootstrap-peers.js";

export type MultiGroupTransportProfile = "tcp" | "websocket" | "desktop" | "android";

export type MultiGroupRuntimeAdapter = {
  readonly profile: MultiGroupTransportProfile;
  readonly relayCapable: boolean;
  readonly targetActiveRelays: number;
  readonly resolveBootstrapPeers: (initialBootstrapPeers: readonly string[]) => readonly string[];
};

const RELAY_TARGET_ACTIVE_WEB = 5;
const RELAY_TARGET_ACTIVE_DESKTOP = 6;

const uniquePeers = (peers: readonly string[]): readonly string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of peers) {
    const peer = value.trim();
    if (peer.length === 0 || seen.has(peer)) continue;
    seen.add(peer);
    result.push(peer);
  }
  return result;
};

const resolveWithDefaults = (
  initialBootstrapPeers: readonly string[],
  defaults: readonly string[],
): readonly string[] => uniquePeers([...initialBootstrapPeers, ...defaults]);

export const createDefaultRuntimeAdapter = (
  profile: MultiGroupTransportProfile = "websocket",
): MultiGroupRuntimeAdapter => {
  if (profile === "desktop") {
    return {
      profile,
      relayCapable: true,
      targetActiveRelays: RELAY_TARGET_ACTIVE_DESKTOP,
      resolveBootstrapPeers: (initialBootstrapPeers) =>
        resolveWithDefaults(initialBootstrapPeers, [
          ...IPFS_BOOTSTRAP_WSS_PEERS,
          ...IPFS_BOOTSTRAP_TCP_PEERS,
        ]),
    };
  }

  if (profile === "websocket" || profile === "android") {
    return {
      profile,
      relayCapable: true,
      targetActiveRelays: RELAY_TARGET_ACTIVE_WEB,
      resolveBootstrapPeers: (initialBootstrapPeers) =>
        resolveWithDefaults(initialBootstrapPeers, IPFS_BOOTSTRAP_WSS_PEERS),
    };
  }

  return {
    profile: "tcp",
    relayCapable: false,
    targetActiveRelays: RELAY_TARGET_ACTIVE_WEB,
    resolveBootstrapPeers: (initialBootstrapPeers) =>
      resolveWithDefaults(initialBootstrapPeers, IPFS_BOOTSTRAP_TCP_PEERS),
  };
};

export const isBrowserRuntimeProfile = (profile: MultiGroupTransportProfile): boolean =>
  profile === "websocket" || profile === "android";
