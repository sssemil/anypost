import { createLibp2p } from "libp2p";
import { circuitRelayServer } from "@libp2p/circuit-relay-v2";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { identify } from "@libp2p/identify";
import { webSockets } from "@libp2p/websockets";
import { tcp } from "@libp2p/tcp";
import { describe, expect, it } from "vitest";
import { generateAccountKey } from "../crypto/identity.js";
import { createMultiGroupChat } from "./multi-group-chat.js";
import type { MultiGroupChat } from "./multi-group-chat.js";
import { encodeGroupInvite } from "./group-invite.js";
import {
  IPFS_BOOTSTRAP_TCP_PEERS,
  IPFS_BOOTSTRAP_WSS_PEERS,
} from "../libp2p/bootstrap-peers.js";

const ENABLE_LIVE_IPFS_BOOTSTRAP =
  process.env.ANYPOST_RUN_LIVE_IPFS_BOOTSTRAP === "1";
const CONNECT_TIMEOUT_MS = Number(
  process.env.ANYPOST_IPFS_BOOTSTRAP_CONNECT_TIMEOUT_MS ?? "180000",
);
const POLL_INTERVAL_MS = 250;
const TRANSPORTS_ENV = process.env.ANYPOST_IPFS_BOOTSTRAP_TRANSPORTS
  ?? "websocket,desktop";
const LOCAL_RELAY_MODES_ENV = process.env.ANYPOST_IPFS_BOOTSTRAP_LOCAL_RELAY_MODES
  ?? "off,on";
const RELAY_HINT_MODES_ENV = process.env.ANYPOST_IPFS_BOOTSTRAP_RELAY_HINT_MODES
  ?? "off,on";
const REQUIRE_ALL_SCENARIOS =
  process.env.ANYPOST_IPFS_BOOTSTRAP_REQUIRE_ALL === "1";

type TransportMode = "websocket" | "desktop";
type ToggleMode = "off" | "on";

type Scenario = {
  readonly transport: TransportMode;
  readonly localRelay: ToggleMode;
  readonly relayHint: ToggleMode;
};

type StageTimings = {
  readonly relayStartMs: number;
  readonly nodesStartMs: number;
  readonly groupSetupMs: number;
  readonly joinViaInviteMs: number;
  readonly bobDiscoveryMs: number;
  readonly aliceDiscoveryAfterBobMs: number;
  readonly joinToMutualConnectivityMs: number;
  readonly totalMs: number;
};

type ScenarioResult = {
  readonly scenario: Scenario;
  readonly success: boolean;
  readonly groupId?: string;
  readonly inviteBytes?: number;
  readonly relayAddressUsed?: string;
  readonly relayHintSource?: "none" | "local-relay" | "public-bootstrap";
  readonly timings: StageTimings;
  readonly error?: string;
};

const parseModes = <T extends string>(
  raw: string,
  allowed: readonly T[],
): T[] => {
  const picked = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is T => allowed.includes(value as T));
  if (picked.length > 0) return [...new Set(picked)];
  return [...allowed];
};

const transportModes = parseModes<TransportMode>(
  TRANSPORTS_ENV,
  ["websocket", "desktop"],
);
const localRelayModes = parseModes<ToggleMode>(
  LOCAL_RELAY_MODES_ENV,
  ["off", "on"],
);
const relayHintModes = parseModes<ToggleMode>(
  RELAY_HINT_MODES_ENV,
  ["off", "on"],
);

const scenarios: Scenario[] = transportModes.flatMap((transport) =>
  localRelayModes.flatMap((localRelay) =>
    relayHintModes.map((relayHint) => ({ transport, localRelay, relayHint })),
  ),
);

const TEST_TIMEOUT_MS =
  scenarios.length * (CONNECT_TIMEOUT_MS + 60_000) + 60_000;

const elapsedMs = (startedAt: number): number => Date.now() - startedAt;

const waitForCondition = async (
  condition: () => boolean,
  timeoutMs: number,
): Promise<void> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`);
};

const withPeerId = (address: string, peerId: string): string =>
  address.includes("/p2p/") ? address : `${address}/p2p/${peerId}`;

const startLocalRelay = async (): Promise<{
  relayAddress: string;
  peerId: string;
  stop: () => Promise<void>;
}> => {
  const node = await createLibp2p({
    addresses: {
      listen: ["/ip4/127.0.0.1/tcp/0", "/ip4/127.0.0.1/tcp/0/ws"],
    },
    transports: [tcp(), webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      relay: circuitRelayServer({
        reservations: { maxReservations: 128 },
      }),
    },
  });

  const peerId = node.peerId.toString();
  const relayAddressRaw = node
    .getMultiaddrs()
    .map((ma) => ma.toString())
    .find((address) => address.includes("/ws"))
    ?? node.getMultiaddrs()[0]?.toString();
  if (!relayAddressRaw) {
    await node.stop();
    throw new Error("Local relay did not expose any dialable address");
  }

  return {
    relayAddress: withPeerId(relayAddressRaw, peerId),
    peerId,
    stop: async () => {
      await node.stop();
    },
  };
};

const pickPublicRelayHint = (transport: TransportMode): string =>
  transport === "desktop" ? IPFS_BOOTSTRAP_TCP_PEERS[0] : IPFS_BOOTSTRAP_WSS_PEERS[0];

const runScenario = async (scenario: Scenario): Promise<ScenarioResult> => {
  let localRelay:
    | {
      relayAddress: string;
      peerId: string;
      stop: () => Promise<void>;
    }
    | null = null;
  const chats: MultiGroupChat[] = [];

  const scenarioStartedAt = Date.now();
  let relayStartMs = 0;
  let nodesStartMs = 0;
  let groupSetupMs = 0;
  let joinViaInviteMs = 0;
  let bobDiscoveryMs = 0;
  let aliceDiscoveryAfterBobMs = 0;
  let joinToMutualConnectivityMs = 0;
  let relayAddressUsed: string | undefined;
  let relayHintSource: "none" | "local-relay" | "public-bootstrap" = "none";

  try {
    if (scenario.localRelay === "on") {
      const relayStartAt = Date.now();
      localRelay = await startLocalRelay();
      relayStartMs = elapsedMs(relayStartAt);
    }

    const bootstrapPeers = localRelay
      ? [localRelay.relayAddress]
      : [];

    const relayHint = scenario.relayHint === "on"
      ? (localRelay?.relayAddress ?? pickPublicRelayHint(scenario.transport))
      : undefined;
    relayAddressUsed = relayHint;
    relayHintSource = relayHint
      ? (localRelay ? "local-relay" : "public-bootstrap")
      : "none";

    const nodesStartAt = Date.now();
    const [alice, bob] = await Promise.all([
      createMultiGroupChat({
        accountKey: generateAccountKey(),
        useTransports: scenario.transport,
        discoveryProfile: "aggressive",
        bootstrapPeers,
      }),
      createMultiGroupChat({
        accountKey: generateAccountKey(),
        useTransports: scenario.transport,
        discoveryProfile: "aggressive",
        bootstrapPeers,
      }),
    ]);
    chats.push(alice, bob);
    nodesStartMs = elapsedMs(nodesStartAt);

    const groupSetupAt = Date.now();
    const groupName =
      `bootstrap-measure-${scenario.transport}-${scenario.localRelay}-${scenario.relayHint}-${Date.now().toString(36)}`;
    const { groupId, genesisEnvelope } = await alice.createGroup(groupName);
    const inviteCode = encodeGroupInvite({
      genesisEnvelope,
      adminPeerId: alice.peerId,
      relayAddr: relayHint,
    });
    groupSetupMs = elapsedMs(groupSetupAt);

    const joinStartedAt = Date.now();
    const joinViaInviteStartAt = Date.now();
    await bob.joinViaInvite({
      genesisEnvelope,
      adminPeerId: alice.peerId,
      relayAddr: relayHint,
    });
    joinViaInviteMs = elapsedMs(joinViaInviteStartAt);

    const bobDiscoveryStartAt = Date.now();
    await waitForCondition(() => {
      const bobPeers = bob.getNetworkStatus().peers.map((peer) => peer.peerId);
      return bobPeers.includes(alice.peerId);
    }, CONNECT_TIMEOUT_MS);
    bobDiscoveryMs = elapsedMs(bobDiscoveryStartAt);

    const mutualConnectivityStartAt = Date.now();
    await waitForCondition(() => {
      const alicePeers = alice.getNetworkStatus().peers.map((peer) => peer.peerId);
      return alicePeers.includes(bob.peerId);
    }, CONNECT_TIMEOUT_MS);
    aliceDiscoveryAfterBobMs = elapsedMs(mutualConnectivityStartAt);
    joinToMutualConnectivityMs = elapsedMs(joinStartedAt);

    const totalMs = elapsedMs(scenarioStartedAt);

    return {
      scenario,
      success: true,
      groupId,
      inviteBytes: inviteCode.length,
      relayAddressUsed,
      relayHintSource,
      timings: {
        relayStartMs,
        nodesStartMs,
        groupSetupMs,
        joinViaInviteMs,
        bobDiscoveryMs,
        aliceDiscoveryAfterBobMs,
        joinToMutualConnectivityMs,
        totalMs,
      },
    };
  } catch (error) {
    return {
      scenario,
      success: false,
      relayAddressUsed,
      relayHintSource,
      timings: {
        relayStartMs,
        nodesStartMs,
        groupSetupMs,
        joinViaInviteMs,
        bobDiscoveryMs,
        aliceDiscoveryAfterBobMs,
        joinToMutualConnectivityMs,
        totalMs: elapsedMs(scenarioStartedAt),
      },
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await Promise.allSettled(chats.map((chat) => chat.stop()));
    if (localRelay) {
      await localRelay.stop().catch(() => {});
    }
  }
};

describe("IPFS bootstrap discovery (live integration)", () => {
  it.runIf(ENABLE_LIVE_IPFS_BOOTSTRAP)(
    "measures bootstrap connectivity across relay and transport matrix",
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      const results: ScenarioResult[] = [];
      for (const scenario of scenarios) {
        console.info(
          `[ipfs-bootstrap-connect] scenario-start transport=${scenario.transport} localRelay=${scenario.localRelay} relayHint=${scenario.relayHint}`,
        );
        const result = await runScenario(scenario);
        results.push(result);
        const payload = {
          transport: result.scenario.transport,
          localRelay: result.scenario.localRelay,
          relayHint: result.scenario.relayHint,
          success: result.success,
          groupId: result.groupId,
          inviteBytes: result.inviteBytes,
          relayHintSource: result.relayHintSource,
          relayAddressUsed: result.relayAddressUsed,
          timingsMs: result.timings,
          error: result.error,
        };
        console.info(`[ipfs-bootstrap-connect] scenario-result ${JSON.stringify(payload)}`);
      }

      const failures = results.filter((result) => !result.success);
      const successes = results.filter((result) => result.success);
      console.info(
        `[ipfs-bootstrap-connect] summary total=${results.length} success=${successes.length} failure=${failures.length} strict=${REQUIRE_ALL_SCENARIOS ? "on" : "off"}`,
      );
      expect(results.length).toBe(scenarios.length);
      if (REQUIRE_ALL_SCENARIOS) {
        expect(failures).toEqual([]);
      }
    },
  );
});
