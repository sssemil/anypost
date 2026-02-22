import type { CID } from "multiformats/cid";
import { createProviderCid, ANYPOST_RELAY_NAMESPACE } from "./dht-config.js";
import {
  type RelayPoolState,
  createRelayPoolState,
  addRelay,
  needsMoreRelays,
  markDiscoveryStarted,
  markDiscoveryCompleted,
} from "./relay-pool.js";
import { recordHealthCheckSuccess, recordHealthCheckFailure } from "./relay-health.js";

type PeerInfo = {
  readonly multiaddrs: ReadonlyArray<{ toString(): string }>;
};

type RelayDiscoveryDeps = {
  readonly contentRouting: {
    findProviders(cid: CID): AsyncIterable<PeerInfo>;
  };
  readonly onRelayDiscovered: (address: string) => void;
};

const isWebSocketAddress = (addr: string): boolean =>
  addr.includes("/ws/") || addr.includes("/wss/");

export const discoverRelays = async (deps: RelayDiscoveryDeps): Promise<void> => {
  const relayCid = await createProviderCid(ANYPOST_RELAY_NAMESPACE);

  for await (const provider of deps.contentRouting.findProviders(relayCid)) {
    for (const ma of provider.multiaddrs) {
      const addr = ma.toString();
      if (isWebSocketAddress(addr)) {
        deps.onRelayDiscovered(addr);
      }
    }
  }
};

type RelayPoolManagerOptions = {
  readonly node: {
    readonly contentRouting: {
      findProviders(cid: CID): AsyncIterable<PeerInfo>;
    };
    dial(addr: unknown): Promise<unknown>;
  };
  readonly initialState?: RelayPoolState;
  readonly onStateChange: (state: RelayPoolState) => void;
  readonly healthCheckIntervalMs?: number;
  readonly discoveryIntervalMs?: number;
};

const DEFAULT_DISCOVERY_INTERVAL_MS = 60_000;

export const startRelayPoolManager = (options: RelayPoolManagerOptions): { stop: () => void } => {
  const {
    node,
    initialState = createRelayPoolState(),
    onStateChange,
    healthCheckIntervalMs = 30_000,
    discoveryIntervalMs = DEFAULT_DISCOVERY_INTERVAL_MS,
  } = options;

  let state = initialState;
  let stopped = false;

  const updateState = (newState: RelayPoolState) => {
    state = newState;
    onStateChange(state);
  };

  const runDiscovery = async () => {
    if (stopped || state.discoveryInProgress || !needsMoreRelays(state)) return;

    updateState(markDiscoveryStarted(state));

    try {
      await discoverRelays({
        contentRouting: node.contentRouting,
        onRelayDiscovered: (address) => {
          updateState(addRelay(state, address));
        },
      });
    } catch {
      // Discovery failure is non-fatal
    } finally {
      updateState(markDiscoveryCompleted(state));
    }
  };

  const runHealthChecks = async () => {
    if (stopped) return;

    for (const relay of state.relays) {
      if (stopped) return;
      const start = Date.now();
      try {
        await node.dial(relay.address);
        const latency = Date.now() - start;
        updateState(recordHealthCheckSuccess(state, relay.address, latency));
      } catch {
        updateState(recordHealthCheckFailure(state, relay.address));
      }
    }
  };

  const discoveryInterval = setInterval(() => void runDiscovery(), discoveryIntervalMs);
  const healthCheckInterval = setInterval(() => void runHealthChecks(), healthCheckIntervalMs);

  void runDiscovery();

  return {
    stop: () => {
      stopped = true;
      clearInterval(discoveryInterval);
      clearInterval(healthCheckInterval);
    },
  };
};
