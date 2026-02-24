import { describe, it, expect, afterEach } from "vitest";
import { createMultiGroupChat } from "./multi-group-chat.js";
import type {
  MultiGroupChat,
  MultiGroupChatMessageEvent,
  JoinRequestEvent,
  DirectMessageRequestEvent,
  SyncProgressState,
} from "./multi-group-chat.js";
import type { NetworkEvent } from "./plaintext-chat.js";
import type { RelayPoolState } from "./relay-pool.js";
import type { GroupInvite } from "./group-invite.js";
import { encodeGroupInvite } from "./group-invite.js";
import { createInviteGrant } from "./invite-grant.js";
import { generateAccountKey } from "../crypto/identity.js";
import type { AccountKey } from "../crypto/identity.js";
import { toHex } from "./action-chain.js";

const waitFor = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const waitUntil = async (condition: () => boolean, timeout = 5000): Promise<void> => {
  const start = Date.now();
  while (!condition() && Date.now() - start < timeout) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!condition()) throw new Error(`waitUntil timed out after ${timeout}ms`);
};

type TestNode = {
  readonly chat: MultiGroupChat;
  readonly accountKey: AccountKey;
  readonly peerId: string;
  readonly events: NetworkEvent[];
  readonly messages: MultiGroupChatMessageEvent[];
  readonly joinRequests: JoinRequestEvent[];
  readonly directMessageRequests: DirectMessageRequestEvent[];
  readonly approvedGroupIds: string[];
  publicKeyToPeerId: ReadonlyMap<string, string>;
};

describe("MultiGroupChat", () => {
  const instances: MultiGroupChat[] = [];

  afterEach(async () => {
    await Promise.all(instances.map((c) => c.stop()));
    instances.length = 0;
  });

  const createTestNode = async (
    accountKey?: AccountKey,
    peerPrivateKey?: Uint8Array,
    overrides: Partial<Parameters<typeof createMultiGroupChat>[0]> = {},
  ): Promise<TestNode> => {
    const key = accountKey ?? generateAccountKey();

    const events: NetworkEvent[] = [];
    const messages: MultiGroupChatMessageEvent[] = [];
    const joinRequests: JoinRequestEvent[] = [];
    const directMessageRequests: DirectMessageRequestEvent[] = [];
    const approvedGroupIds: string[] = [];
    let publicKeyToPeerId: ReadonlyMap<string, string> = new Map();

    const chat = await createMultiGroupChat({
      accountKey: key,
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
      peerPrivateKey,
      onPublicKeyToPeerIdChange: (map) => {
        publicKeyToPeerId = map;
      },
      onApprovalReceived: (groupId) => {
        approvedGroupIds.push(groupId);
      },
      ...overrides,
    });

    chat.onEvent((evt) => events.push(evt));
    chat.onMessage((msg) => messages.push(msg));
    chat.onJoinRequest((evt) => joinRequests.push(evt));
    chat.onDirectMessageRequest((evt) => directMessageRequests.push(evt));

    instances.push(chat);

    return {
      chat,
      accountKey: key,
      peerId: chat.peerId,
      events,
      messages,
      joinRequests,
      directMessageRequests,
      approvedGroupIds,
      get publicKeyToPeerId() {
        return publicKeyToPeerId;
      },
    };
  };

  const createTestNodeWithPeerKey = async (
    peerPrivateKey: Uint8Array,
    accountKey?: AccountKey,
    overrides: Partial<Parameters<typeof createMultiGroupChat>[0]> = {},
  ): Promise<TestNode> =>
    createTestNode(accountKey, peerPrivateKey, overrides);

  const buildInvite = (
    admin: TestNode,
    genesisEnvelope: GroupInvite["genesisEnvelope"],
    inviteGrant?: GroupInvite["inviteGrant"],
  ): GroupInvite => ({
    genesisEnvelope,
    relayAddr: admin.chat.multiaddrs[0]?.toString(),
    adminPeerId: admin.peerId,
    inviteGrant,
  });

  const waitForJoinRequestFrom = async (
    admin: TestNode,
    groupId: string,
    senderPeerId: string,
    timeoutMs = 7_000,
  ): Promise<JoinRequestEvent> => {
    await waitUntil(
      () =>
        admin.joinRequests.some(
          (evt) => evt.groupId === groupId && evt.senderPeerId === senderPeerId,
        ),
      timeoutMs,
    );
    return admin.joinRequests.find(
      (evt) => evt.groupId === groupId && evt.senderPeerId === senderPeerId,
    )!;
  };

  it("should start and return a peer ID", async () => {
    const { chat } = await createTestNode();

    expect(chat.peerId).toMatch(/^12D3KooW/);
  });

  it("should have no joined groups initially", async () => {
    const { chat } = await createTestNode();

    expect(chat.getJoinedGroups()).toEqual([]);
  });

  it("should track joined groups", async () => {
    const { chat } = await createTestNode();

    const groupA = crypto.randomUUID();
    const groupB = crypto.randomUUID();
    chat.joinGroup(groupA);
    chat.joinGroup(groupB);

    expect(chat.getJoinedGroups()).toEqual([groupA, groupB]);
  });

  it("should remove group on leave", async () => {
    const { chat } = await createTestNode();

    const groupA = crypto.randomUUID();
    chat.joinGroup(groupA);
    await chat.leaveGroup(groupA);

    expect(chat.getJoinedGroups()).toEqual([]);
  });

  it("should exchange messages on the same group", async () => {
    const node1 = await createTestNode();
    const node2 = await createTestNode();

    const groupA = crypto.randomUUID();
    node1.chat.joinGroup(groupA);
    node2.chat.joinGroup(groupA);

    await node1.chat.connectTo(node2.chat.multiaddrs[0]);
    await waitFor(500);

    await node1.chat.sendMessage(groupA, "Hello from chat1!");
    await waitFor(500);

    expect(node2.messages.length).toBe(1);
    expect(node2.messages[0].text).toBe("Hello from chat1!");
    expect(node2.messages[0].groupId).toBe(groupA);
  });

  it("should route messages to correct group", async () => {
    const node1 = await createTestNode();
    const node2 = await createTestNode();

    const groupA = crypto.randomUUID();
    const groupB = crypto.randomUUID();
    node1.chat.joinGroup(groupA);
    node1.chat.joinGroup(groupB);
    node2.chat.joinGroup(groupA);
    node2.chat.joinGroup(groupB);

    await node1.chat.connectTo(node2.chat.multiaddrs[0]);
    await waitFor(500);

    await node1.chat.sendMessage(groupA, "Message for A");
    await node1.chat.sendMessage(groupB, "Message for B");
    await waitFor(500);

    expect(node2.messages.length).toBe(2);

    const groupAMsg = node2.messages.find((m) => m.groupId === groupA);
    const groupBMsg = node2.messages.find((m) => m.groupId === groupB);
    expect(groupAMsg?.text).toBe("Message for A");
    expect(groupBMsg?.text).toBe("Message for B");
  });

  it("should not receive messages after leaving a group", async () => {
    const node1 = await createTestNode();
    const node2 = await createTestNode();

    const groupA = crypto.randomUUID();
    node1.chat.joinGroup(groupA);
    node2.chat.joinGroup(groupA);

    await node1.chat.connectTo(node2.chat.multiaddrs[0]);
    await waitFor(500);

    await node2.chat.leaveGroup(groupA);
    await waitFor(200);

    await node1.chat.sendMessage(groupA, "Should not arrive");
    await waitFor(500);

    expect(node2.messages.length).toBe(0);
  });

  it("should stop cleanly", async () => {
    const { chat } = await createTestNode();

    await chat.stop();
  });

  it("should accept onRelayPoolStateChange option without error", async () => {
    const states: RelayPoolState[] = [];
    const chat = await createMultiGroupChat({
      accountKey: generateAccountKey(),
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
      onRelayPoolStateChange: (state) => states.push(state),
    });
    instances.push(chat);

    expect(chat.peerId).toMatch(/^12D3KooW/);
  });

  it("should expose addRelay method", async () => {
    const { chat } = await createTestNode();

    expect(() =>
      chat.addRelay("/ip4/1.2.3.4/tcp/9090/ws/p2p/12D3KooWTest"),
    ).not.toThrow();
  });

  it("should stop cleanly with onRelayPoolStateChange configured", async () => {
    const chat = await createMultiGroupChat({
      accountKey: generateAccountKey(),
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
      onRelayPoolStateChange: () => {},
    });

    await chat.stop();
  });

  it("should store envelopes accessible via getActionChainEnvelopes after createGroup", async () => {
    const { chat } = await createTestNode();

    const { groupId } = await chat.createGroup("Test Group");

    const envelopes = chat.getActionChainEnvelopes(groupId);
    expect(envelopes.length).toBe(1);
    expect(envelopes[0].hash).toBeInstanceOf(Uint8Array);
  });

  it("should rename a group via action chain", async () => {
    const { chat } = await createTestNode();
    const { groupId } = await chat.createGroup("Old Name");

    await chat.renameGroup(groupId, "New Name");

    const state = chat.getActionChainState(groupId);
    expect(state).not.toBeNull();
    expect(state!.groupName).toBe("New Name");
  });

  it("should reject renaming group to empty string", async () => {
    const { chat } = await createTestNode();
    const { groupId } = await chat.createGroup("Old Name");

    await expect(chat.renameGroup(groupId, "   ")).rejects.toThrow("Group name cannot be empty");
  });

  it("should return empty array for unknown group envelopes", async () => {
    const { chat } = await createTestNode();

    expect(chat.getActionChainEnvelopes("nonexistent-group")).toEqual([]);
  });

  it("should return all groups' envelopes via getAllActionChainEnvelopes", async () => {
    const { chat } = await createTestNode();

    const { groupId: id1 } = await chat.createGroup("Group 1");
    const { groupId: id2 } = await chat.createGroup("Group 2");

    const allEnvelopes = chat.getAllActionChainEnvelopes();
    expect(allEnvelopes.size).toBe(2);
    expect(allEnvelopes.get(id1)?.length).toBe(1);
    expect(allEnvelopes.get(id2)?.length).toBe(1);
  });

  it("should clear action chain envelopes when leaving a group", async () => {
    const { chat } = await createTestNode();

    const { groupId } = await chat.createGroup("Test Group");
    expect(chat.getActionChainEnvelopes(groupId).length).toBe(1);

    await chat.leaveGroup(groupId);
    expect(chat.getActionChainEnvelopes(groupId)).toEqual([]);
  });

  it("should accept onRelayCandidateStateChange option without error", async () => {
    const chat = await createMultiGroupChat({
      accountKey: generateAccountKey(),
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
      onRelayCandidateStateChange: () => {},
    });
    instances.push(chat);

    expect(chat.peerId).toMatch(/^12D3KooW/);
  });

  it("should accept onPeerPathCacheChange option without error", async () => {
    const chat = await createMultiGroupChat({
      accountKey: generateAccountKey(),
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
      onPeerPathCacheChange: () => {},
    });
    instances.push(chat);

    expect(chat.peerId).toMatch(/^12D3KooW/);
  });

  it("should accept discoveryProfile and onPeerDiscoveryMetricsChange options without error", async () => {
    const chat = await createMultiGroupChat({
      accountKey: generateAccountKey(),
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
      discoveryProfile: "aggressive",
      onPeerDiscoveryMetricsChange: () => {},
    });
    instances.push(chat);

    expect(chat.peerId).toMatch(/^12D3KooW/);
  });

  it("should accept initialJoinRetryState and onJoinRetryStateChange options without error", async () => {
    const states: ReadonlyMap<string, unknown>[] = [];
    const chat = await createMultiGroupChat({
      accountKey: generateAccountKey(),
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
      initialJoinRetryState: new Map([
        ["group-a", {
          groupId: "group-a",
          createdAt: 1_000,
          lastAttemptAt: 1_500,
          nextAttemptAt: 6_500,
          attemptCount: 1,
          status: "active",
        }],
      ]),
      onJoinRetryStateChange: (state) => states.push(state as ReadonlyMap<string, unknown>),
    });
    instances.push(chat);

    expect(chat.peerId).toMatch(/^12D3KooW/);
    expect(states.length).toBeGreaterThan(0);
    expect(chat.getJoinRetryState().has("group-a")).toBe(true);
  });

  it("should accept initialSyncProgressState and onSyncProgressStateChange options without error", async () => {
    const states: SyncProgressState[] = [];
    const now = Date.now();
    const chat = await createMultiGroupChat({
      accountKey: generateAccountKey(),
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
      initialSyncProgressState: new Map([
        ["group-a", new Map([
          ["12D3KooWPeerA", {
            lastRequestedAtMs: now,
            lastRequestKnownHashHex: "aa",
            lastServedAtMs: now,
            lastServedKnownHashHex: "bb",
            lastServedHeadHashHex: "cc",
            lastServedEnvelopeCount: 2,
            lastReceivedAtMs: now,
            lastReceivedHashHex: "dd",
            lastReceivedEnvelopeCount: 4,
          }],
        ])],
      ]),
      onSyncProgressStateChange: (state) => states.push(state),
    });
    instances.push(chat);

    expect(chat.peerId).toMatch(/^12D3KooW/);
    expect(states.length).toBeGreaterThan(0);
    expect(chat.getSyncProgressState().get("group-a")?.get("12D3KooWPeerA")?.lastReceivedEnvelopeCount)
      .toBe(4);
  });

  it("should prune stale sync progress entries on startup", async () => {
    const staleAt = Date.now() - (3 * 24 * 60 * 60 * 1_000);
    const freshAt = Date.now();
    const chat = await createMultiGroupChat({
      accountKey: generateAccountKey(),
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
      initialSyncProgressState: new Map([
        ["group-a", new Map([
          ["peer-stale", {
            lastRequestedAtMs: staleAt,
            lastRequestKnownHashHex: "aa",
            lastServedAtMs: staleAt,
            lastServedKnownHashHex: "bb",
            lastServedHeadHashHex: "cc",
            lastServedEnvelopeCount: 1,
            lastReceivedAtMs: staleAt,
            lastReceivedHashHex: "dd",
            lastReceivedEnvelopeCount: 1,
          }],
          ["peer-fresh", {
            lastRequestedAtMs: freshAt,
            lastRequestKnownHashHex: "aa",
            lastServedAtMs: null,
            lastServedKnownHashHex: null,
            lastServedHeadHashHex: null,
            lastServedEnvelopeCount: 0,
            lastReceivedAtMs: null,
            lastReceivedHashHex: null,
            lastReceivedEnvelopeCount: 0,
          }],
        ])],
      ]),
    });
    instances.push(chat);

    const groupState = chat.getSyncProgressState().get("group-a");
    expect(groupState?.has("peer-stale")).toBe(false);
    expect(groupState?.has("peer-fresh")).toBe(true);
  });

  it("should cap initial sync progress peers per group", async () => {
    const now = Date.now();
    const peerState = new Map<string, {
      lastRequestedAtMs: number;
      lastRequestKnownHashHex: string | null;
      lastServedAtMs: number | null;
      lastServedKnownHashHex: string | null;
      lastServedHeadHashHex: string | null;
      lastServedEnvelopeCount: number;
      lastReceivedAtMs: number | null;
      lastReceivedHashHex: string | null;
      lastReceivedEnvelopeCount: number;
    }>();
    for (let idx = 0; idx < 160; idx += 1) {
      peerState.set(`peer-${idx}`, {
        lastRequestedAtMs: now - idx,
        lastRequestKnownHashHex: null,
        lastServedAtMs: null,
        lastServedKnownHashHex: null,
        lastServedHeadHashHex: null,
        lastServedEnvelopeCount: 0,
        lastReceivedAtMs: null,
        lastReceivedHashHex: null,
        lastReceivedEnvelopeCount: 0,
      });
    }

    const chat = await createMultiGroupChat({
      accountKey: generateAccountKey(),
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
      initialSyncProgressState: new Map([["group-a", peerState]]),
    });
    instances.push(chat);

    const groupState = chat.getSyncProgressState().get("group-a");
    expect(groupState).toBeDefined();
    expect(groupState!.size).toBeLessThanOrEqual(128);
    expect(groupState!.has("peer-0")).toBe(true);
  });

  it("should expose retryJoinNow and cancelJoinRetry methods", async () => {
    const { chat } = await createTestNode();
    const groupId = crypto.randomUUID();
    chat.joinGroup(groupId);

    await chat.retryJoinNow(groupId);
    expect(chat.getJoinRetryState().has(groupId)).toBe(true);

    chat.cancelJoinRetry(groupId);
    expect(chat.getJoinRetryState().get(groupId)?.status).toBe("cancelled");
  });

  it("should rate-limit excessive join requests from a single peer", async () => {
    const admin = await createTestNode();
    const joiner = await createTestNode();
    const { groupId } = await admin.chat.createGroup("Join Rate Limit");

    joiner.chat.joinGroup(groupId);
    await joiner.chat.connectTo(admin.chat.multiaddrs[0]);
    await waitFor(400);

    for (let i = 0; i < 12; i++) {
      await joiner.chat.requestJoin(groupId);
    }
    await waitFor(400);

    expect(
      admin.events.some((evt) => evt.detail.includes("Rate-limited join request")),
    ).toBe(true);
  });

  it("should run periodic sync reconcile for stale groups", async () => {
    const owner = await createTestNode(undefined, undefined, {
      syncReconcileIntervalMs: 1_000,
      syncReconcileStaleMs: 0,
    });
    const joiner = await createTestNode(undefined, undefined, {
      syncReconcileIntervalMs: 1_000,
      syncReconcileStaleMs: 0,
    });
    const { groupId } = await owner.chat.createGroup("Reconcile Tick");
    joiner.chat.joinGroup(groupId);

    await joiner.chat.connectTo(owner.chat.multiaddrs[0]);
    await waitFor(1_250);

    expect(
      owner.events.some(
        (evt) => evt.type === "sync" && evt.detail.includes("Periodic sync reconcile"),
      ),
    ).toBe(true);
  });

  it("should emit connection metrics and relay reservation state callbacks", async () => {
    const metrics: Array<{
      timeToFirstPeerMs: number | null;
      reservationAttempts: number;
      syncRequestsSent: number;
      syncResponsesAccepted: number;
      syncResponsesRejected: number;
    }> = [];
    const reservationStates: Array<{ entries: number; targetActive: number }> = [];

    const chat = await createMultiGroupChat({
      accountKey: generateAccountKey(),
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
      initialRelayHints: ["/dns4/relay.example.com/tcp/443/wss/p2p/12D3KooWRelayHint111111111111111111111"],
      onConnectionMetricsChange: (next) => {
        metrics.push({
          timeToFirstPeerMs: next.timeToFirstPeerMs,
          reservationAttempts: next.reservationAttempts,
          syncRequestsSent: next.syncRequestsSent,
          syncResponsesAccepted: next.syncResponsesAccepted,
          syncResponsesRejected: next.syncResponsesRejected,
        });
      },
      onRelayReservationStateChange: (next) => {
        reservationStates.push({
          entries: next.entries.size,
          targetActive: next.targetActive,
        });
      },
    });
    instances.push(chat);

    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics[0].reservationAttempts).toBe(0);
    expect(metrics[0].syncRequestsSent).toBe(0);
    expect(metrics[0].syncResponsesAccepted).toBe(0);
    expect(metrics[0].syncResponsesRejected).toBe(0);
    expect(reservationStates.length).toBeGreaterThan(0);
    expect(reservationStates[reservationStates.length - 1].entries).toBeGreaterThan(0);
    expect(reservationStates[reservationStates.length - 1].targetActive).toBe(3);
  });

  it("should prune cached paths for non-pinned peers once membership context is available", async () => {
    const admin = await createTestNode();
    const { groupId, genesisEnvelope } = await admin.chat.createGroup("Pinned Cache");

    const adminPublicKeyHex = toHex(new Uint8Array(admin.accountKey.publicKey));
    let latestPeerPathCache: ReadonlyMap<string, readonly string[]> = new Map();
    const joiner = await createTestNode(undefined, undefined, {
      initialPublicKeyToPeerId: new Map([[adminPublicKeyHex, admin.peerId]]),
      initialPeerPathCache: new Map([
        [admin.peerId, [admin.chat.multiaddrs[0].toString()]],
        ["12D3KooWNotPinnedPeer11111111111111111111111", ["/ip4/127.0.0.1/tcp/9999/p2p/12D3KooWNotPinnedPeer11111111111111111111111"]],
      ]),
      onPeerPathCacheChange: (cache) => {
        latestPeerPathCache = cache;
      },
    });

    joiner.chat.joinGroup(groupId);
    joiner.chat.loadActionChain(groupId, [genesisEnvelope]);

    await waitUntil(() => latestPeerPathCache.size > 0);

    expect(latestPeerPathCache.has(admin.peerId)).toBe(true);
    expect(latestPeerPathCache.has("12D3KooWNotPinnedPeer11111111111111111111111")).toBe(false);
  });

  it("should try cached paths first and promote successful cached path for pinned peers", async () => {
    const admin = await createTestNode();
    const { groupId, genesisEnvelope } = await admin.chat.createGroup("Cached Path Priority");
    const adminPublicKeyHex = toHex(new Uint8Array(admin.accountKey.publicKey));
    const validPath = admin.chat.multiaddrs[0].toString();
    const invalidPath = `/ip4/127.0.0.1/tcp/1/p2p/${admin.peerId}`;

    let latestPeerPathCache: ReadonlyMap<string, readonly string[]> = new Map();
    const joiner = await createTestNode(undefined, undefined, {
      initialPublicKeyToPeerId: new Map([[adminPublicKeyHex, admin.peerId]]),
      initialPeerPathCache: new Map([[admin.peerId, [invalidPath, validPath]]]),
      onPeerPathCacheChange: (cache) => {
        latestPeerPathCache = cache;
      },
    });

    joiner.chat.joinGroup(groupId);
    joiner.chat.loadActionChain(groupId, [genesisEnvelope]);
    await joiner.chat.connectToPeerId(admin.peerId);

    const dialAttempts = joiner.events.filter((e) => e.type === "dial-attempt");
    expect(dialAttempts.length).toBeGreaterThan(0);
    expect(dialAttempts[0].detail).toContain("Trying cached path");

    await waitUntil(
      () => (latestPeerPathCache.get(admin.peerId)?.length ?? 0) > 0,
    );
    const cachedPaths = latestPeerPathCache.get(admin.peerId) ?? [];
    expect(cachedPaths).toContain(validPath);
  });

  it("should rebuild action chain state from loaded envelopes", async () => {
    const node1 = await createTestNode();

    const { groupId } = await node1.chat.createGroup("Persisted Group");
    const envelopes = node1.chat.getActionChainEnvelopes(groupId);

    const node2 = await createTestNode(node1.accountKey);

    node2.chat.joinGroup(groupId);
    node2.chat.loadActionChain(groupId, envelopes);

    const state = node2.chat.getActionChainState(groupId);
    expect(state).not.toBeNull();
    expect(state!.groupName).toBe("Persisted Group");
  });

  it("should return deterministic envelope order regardless of load order", async () => {
    const node1 = await createTestNode();
    const { groupId } = await node1.chat.createGroup("Deterministic Order");
    await node1.chat.sendMessage(groupId, "m1");
    await node1.chat.sendMessage(groupId, "m2");
    await node1.chat.sendMessage(groupId, "m3");

    const canonical = node1.chat.getActionChainEnvelopes(groupId);
    const canonicalHashes = canonical.map((envelope) => toHex(envelope.hash));
    expect(canonicalHashes.length).toBeGreaterThanOrEqual(4);

    const node2 = await createTestNode(node1.accountKey);
    node2.chat.joinGroup(groupId);
    node2.chat.loadActionChain(groupId, [...canonical].reverse());

    const loadedHashes = node2.chat
      .getActionChainEnvelopes(groupId)
      .map((envelope) => toHex(envelope.hash));
    expect(loadedHashes).toEqual(canonicalHashes);
  });

  it("should complete full invite → join → approve flow between two nodes", async () => {
    const admin = await createTestNode();
    const joiner = await createTestNode();

    const { groupId, genesisEnvelope } = await admin.chat.createGroup("Invite Test");

    await joiner.chat.connectTo(admin.chat.multiaddrs[0]);
    await waitFor(500);

    const joinRequestReceived = new Promise<JoinRequestEvent>((resolve) => {
      admin.chat.onJoinRequest((evt) => resolve(evt));
    });

    const invite: GroupInvite = {
      genesisEnvelope,
      relayAddr: admin.chat.multiaddrs[0].toString(),
      adminPeerId: admin.peerId,
    };
    await joiner.chat.joinViaInvite(invite);
    await waitFor(500);

    const joinRequest = await joinRequestReceived;
    expect(joinRequest.groupId).toBe(groupId);

    await admin.chat.approveJoin(groupId, joinRequest.requesterPublicKey);
    await waitFor(500);

    const adminState = admin.chat.getActionChainState(groupId);
    const joinerState = joiner.chat.getActionChainState(groupId);

    expect(adminState).not.toBeNull();
    expect(joinerState).not.toBeNull();
    expect(adminState!.members.size).toBe(2);
    expect(joinerState!.members.size).toBe(2);

    const adminEnvelopes = admin.chat.getActionChainEnvelopes(groupId);
    const joinerEnvelopes = joiner.chat.getActionChainEnvelopes(groupId);
    expect(adminEnvelopes.length).toBe(2);
    expect(joinerEnvelopes.length).toBe(2);

    expect(joiner.approvedGroupIds).toContain(groupId);

    const adminKeyHex = toHex(new Uint8Array(admin.accountKey.publicKey));
    expect(joiner.publicKeyToPeerId.get(adminKeyHex)).toBe(admin.peerId);
  });

  it("should deliver direct-message requests to the target peer", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();

    await alice.chat.connectTo(bob.chat.multiaddrs[0]);
    await waitFor(400);

    const groupId = crypto.randomUUID();
    const { genesisEnvelope } = await alice.chat.createDirectMessageGroupWithId(groupId, [
      alice.peerId,
      bob.peerId,
    ]);
    const inviteCode = encodeGroupInvite({
      genesisEnvelope,
      adminPeerId: alice.peerId,
      relayAddr: alice.chat.multiaddrs[0].toString(),
    });

    await alice.chat.sendDirectMessageRequest({
      targetPeerId: bob.peerId,
      groupId,
      groupName: "DM with Bob",
      inviteCode,
    });

    await waitUntil(() => bob.directMessageRequests.length >= 1);
    const request = bob.directMessageRequests[0];
    expect(request.targetPeerId).toBe(bob.peerId);
    expect(request.senderPeerId).toBe(alice.peerId);
    expect(request.groupId).toBe(groupId);
    expect(request.inviteCode).toBe(inviteCode);
  });

  it("should auto-approve DM joins without manual approval", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();

    await alice.chat.connectTo(bob.chat.multiaddrs[0]);
    await waitFor(400);

    const groupId = crypto.randomUUID();
    const { genesisEnvelope } = await alice.chat.createDirectMessageGroupWithId(groupId, [
      alice.peerId,
      bob.peerId,
    ]);

    const invite = buildInvite(alice, genesisEnvelope);
    await bob.chat.joinViaInvite(invite);

    await waitUntil(() => {
      const aliceState = alice.chat.getActionChainState(groupId);
      const bobState = bob.chat.getActionChainState(groupId);
      const bobKeyHex = toHex(new Uint8Array(bob.accountKey.publicKey));
      return !!aliceState && !!bobState &&
        aliceState.members.has(bobKeyHex) &&
        bobState.members.has(bobKeyHex);
    }, 10_000);

    await bob.chat.sendMessage(groupId, "hello-dm");
    await waitUntil(
      () => alice.messages.some((message) => message.groupId === groupId && message.text === "hello-dm"),
      7_000,
    );
  });

  it("should converge membership after concurrent same-group creation", { timeout: 15_000 }, async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    const groupId = crypto.randomUUID();

    await alice.chat.createDirectMessageGroupWithId(groupId, [alice.peerId, bob.peerId]);
    await bob.chat.createDirectMessageGroupWithId(groupId, [bob.peerId, alice.peerId]);

    await alice.chat.connectTo(bob.chat.multiaddrs[0]);
    await waitFor(400);

    await alice.chat.requestJoin(groupId);
    await bob.chat.requestJoin(groupId);

    let aliceApprovedIdx = 0;
    let bobApprovedIdx = 0;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 12_000) {
      while (aliceApprovedIdx < alice.joinRequests.length) {
        const req = alice.joinRequests[aliceApprovedIdx++];
        await alice.chat.approveJoin(groupId, req.requesterPublicKey).catch(() => {});
      }
      while (bobApprovedIdx < bob.joinRequests.length) {
        const req = bob.joinRequests[bobApprovedIdx++];
        await bob.chat.approveJoin(groupId, req.requesterPublicKey).catch(() => {});
      }

      const aliceState = alice.chat.getActionChainState(groupId);
      const bobState = bob.chat.getActionChainState(groupId);
      if (aliceState?.members.size === 2 && bobState?.members.size === 2) break;
      await waitFor(200);
    }

    expect(alice.chat.getActionChainState(groupId)?.members.size).toBe(2);
    expect(bob.chat.getActionChainState(groupId)?.members.size).toBe(2);
  });

  it("should reject joinViaInvite when invite targets a different peer ID", async () => {
    const admin = await createTestNode();
    const joiner = await createTestNode();

    const { groupId, genesisEnvelope } = await admin.chat.createGroup("Targeted Invite Test");
    const invite: GroupInvite = {
      genesisEnvelope,
      relayAddr: admin.chat.multiaddrs[0].toString(),
      adminPeerId: admin.peerId,
      inviteGrant: createInviteGrant({
        accountKey: admin.accountKey,
        groupId,
        policy: {
          kind: "targeted-peer",
          targetPeerId: "12D3KooWAnotherPeer",
        },
      }),
    };

    await expect(joiner.chat.joinViaInvite(invite)).rejects.toThrow("Invite rejected for this peer");
  });

  it("should not surface member messages to a pending non-member", async () => {
    const admin = await createTestNode();
    const joiner = await createTestNode();

    const { groupId, genesisEnvelope } = await admin.chat.createGroup("Pending Visibility");
    await joiner.chat.connectTo(admin.chat.multiaddrs[0]);
    await waitFor(400);

    const invite: GroupInvite = {
      genesisEnvelope,
      relayAddr: admin.chat.multiaddrs[0].toString(),
      adminPeerId: admin.peerId,
    };
    await joiner.chat.joinViaInvite(invite);
    await waitFor(400);

    await admin.chat.sendMessage(groupId, "members-only");
    await waitFor(600);

    expect(joiner.messages.some((message) => message.text === "members-only")).toBe(false);
  });

  it("should auto-approve a valid targeted invite join request", async () => {
    const admin = await createTestNode();
    const joiner = await createTestNode();

    const { groupId, genesisEnvelope } = await admin.chat.createGroup("Auto Approve Invite Test");
    await admin.chat.setJoinPolicy(groupId, "auto_with_invite");
    await joiner.chat.connectTo(admin.chat.multiaddrs[0]);
    await waitFor(500);

    const invite: GroupInvite = {
      genesisEnvelope,
      relayAddr: admin.chat.multiaddrs[0].toString(),
      adminPeerId: admin.peerId,
      inviteGrant: createInviteGrant({
        accountKey: admin.accountKey,
        groupId,
        policy: {
          kind: "targeted-peer",
          targetPeerId: joiner.peerId,
        },
      }),
    };

    await joiner.chat.joinViaInvite(invite);

    await waitUntil(() => {
      const joinerState = joiner.chat.getActionChainState(groupId);
      if (!joinerState) return false;
      const joinerKeyHex = toHex(new Uint8Array(joiner.accountKey.publicKey));
      return joinerState.members.has(joinerKeyHex);
    });

    const joinerState = joiner.chat.getActionChainState(groupId);
    expect(joinerState).not.toBeNull();
    expect(joinerState!.members.size).toBe(2);
  });

  it("should keep default join policy as manual on group creation", async () => {
    const admin = await createTestNode();
    const { groupId } = await admin.chat.createGroup("Policy Default");
    const state = admin.chat.getActionChainState(groupId);
    expect(state).not.toBeNull();
    expect(state!.joinPolicy).toBe("manual");
  });

  it("should stop join retries when approval is received", async () => {
    const admin = await createTestNode();
    const joiner = await createTestNode();

    const { groupId, genesisEnvelope } = await admin.chat.createGroup("Retry Stop Test");

    await joiner.chat.connectTo(admin.chat.multiaddrs[0]);
    await waitFor(500);

    const joinRequestReceived = new Promise<JoinRequestEvent>((resolve) => {
      admin.chat.onJoinRequest((evt) => resolve(evt));
    });

    const invite: GroupInvite = {
      genesisEnvelope,
      relayAddr: admin.chat.multiaddrs[0].toString(),
      adminPeerId: admin.peerId,
    };
    await joiner.chat.joinViaInvite(invite);

    await waitUntil(() => joiner.chat.getJoinRetryState().has(groupId));

    const joinRequest = await joinRequestReceived;
    await admin.chat.approveJoin(groupId, joinRequest.requesterPublicKey);

    await waitUntil(() => !joiner.chat.getJoinRetryState().has(groupId));
  });

  it("should remove a member from the group when admin calls removeMember", async () => {
    const admin = await createTestNode();
    const joiner = await createTestNode();

    const { groupId, genesisEnvelope } = await admin.chat.createGroup("Remove Test");

    await joiner.chat.connectTo(admin.chat.multiaddrs[0]);
    await waitFor(500);

    const joinRequestReceived = new Promise<JoinRequestEvent>((resolve) => {
      admin.chat.onJoinRequest((evt) => resolve(evt));
    });

    const invite: GroupInvite = {
      genesisEnvelope,
      relayAddr: admin.chat.multiaddrs[0].toString(),
      adminPeerId: admin.peerId,
    };
    await joiner.chat.joinViaInvite(invite);
    await waitFor(500);

    const joinRequest = await joinRequestReceived;
    await admin.chat.approveJoin(groupId, joinRequest.requesterPublicKey);
    await waitFor(500);

    expect(admin.chat.getActionChainState(groupId)!.members.size).toBe(2);

    await admin.chat.removeMember(groupId, joinRequest.requesterPublicKey);
    await waitFor(500);

    const adminState = admin.chat.getActionChainState(groupId);
    expect(adminState!.members.size).toBe(1);

    const joinerState = joiner.chat.getActionChainState(groupId);
    expect(joinerState!.members.size).toBe(1);
  });

  it("should allow owner to change roles including ownership transfer", async () => {
    const owner = await createTestNode();
    const joiner = await createTestNode();

    const { groupId, genesisEnvelope } = await owner.chat.createGroup("Role Change Test");
    await joiner.chat.connectTo(owner.chat.multiaddrs[0]);
    await waitFor(500);

    const joinRequestReceived = new Promise<JoinRequestEvent>((resolve) => {
      owner.chat.onJoinRequest((evt) => resolve(evt));
    });
    const invite: GroupInvite = {
      genesisEnvelope,
      relayAddr: owner.chat.multiaddrs[0].toString(),
      adminPeerId: owner.peerId,
    };
    await joiner.chat.joinViaInvite(invite);
    const joinRequest = await joinRequestReceived;
    await owner.chat.approveJoin(groupId, joinRequest.requesterPublicKey);
    await waitUntil(() => owner.chat.getActionChainState(groupId)!.members.size === 2);

    await owner.chat.changeMemberRole(groupId, joinRequest.requesterPublicKey, "admin");
    await waitUntil(() =>
      owner.chat.getActionChainState(groupId)!.members.get(toHex(joiner.accountKey.publicKey))?.role === "admin");

    await owner.chat.changeMemberRole(groupId, joinRequest.requesterPublicKey, "owner");
    await waitUntil(() =>
      owner.chat.getActionChainState(groupId)!.members.get(toHex(joiner.accountKey.publicKey))?.role === "owner");
  });

  it("should publish member-left so other members see a clean leave", async () => {
    const admin = await createTestNode();
    const joiner = await createTestNode();

    const { groupId, genesisEnvelope } = await admin.chat.createGroup("Leave Test");
    await joiner.chat.connectTo(admin.chat.multiaddrs[0]);
    await waitFor(500);

    const joinRequestReceived = new Promise<JoinRequestEvent>((resolve) => {
      admin.chat.onJoinRequest((evt) => resolve(evt));
    });
    const invite: GroupInvite = {
      genesisEnvelope,
      relayAddr: admin.chat.multiaddrs[0].toString(),
      adminPeerId: admin.peerId,
    };
    await joiner.chat.joinViaInvite(invite);
    const joinRequest = await joinRequestReceived;
    await admin.chat.approveJoin(groupId, joinRequest.requesterPublicKey);
    await waitUntil(() => admin.chat.getActionChainState(groupId)!.members.size === 2);

    await joiner.chat.leaveGroup(groupId);
    await waitUntil(() => admin.chat.getActionChainState(groupId)!.members.size === 1);

    const adminState = admin.chat.getActionChainState(groupId);
    expect(adminState).not.toBeNull();
    expect(adminState!.members.size).toBe(1);
  });

  it("should converge messages across multiple approved group members", async () => {
    const owner = await createTestNode();
    const alice = await createTestNode();
    const bob = await createTestNode();

    const { groupId, genesisEnvelope } = await owner.chat.createGroup("Multi Member Converge");
    const invite = buildInvite(owner, genesisEnvelope);

    await alice.chat.connectTo(owner.chat.multiaddrs[0]);
    await waitFor(400);
    await alice.chat.joinViaInvite(invite);
    const aliceJoin = await waitForJoinRequestFrom(owner, groupId, alice.peerId);
    await owner.chat.approveJoin(groupId, aliceJoin.requesterPublicKey);
    await waitUntil(() => owner.chat.getActionChainState(groupId)!.members.size === 2);

    await bob.chat.connectTo(owner.chat.multiaddrs[0]);
    await waitFor(400);
    await bob.chat.joinViaInvite(invite);
    const bobJoin = await waitForJoinRequestFrom(owner, groupId, bob.peerId);
    await owner.chat.approveJoin(groupId, bobJoin.requesterPublicKey);
    await waitUntil(() => owner.chat.getActionChainState(groupId)!.members.size === 3);
    await waitUntil(() => alice.chat.getActionChainState(groupId)!.members.size === 3);
    await waitUntil(() => bob.chat.getActionChainState(groupId)!.members.size === 3);

    await owner.chat.sendMessage(groupId, "owner-msg");
    await alice.chat.sendMessage(groupId, "alice-msg");
    await bob.chat.sendMessage(groupId, "bob-msg");

    await waitUntil(() =>
      owner.messages.some((m) => m.groupId === groupId && m.text === "alice-msg") &&
      owner.messages.some((m) => m.groupId === groupId && m.text === "bob-msg"));
    await waitUntil(() =>
      alice.messages.some((m) => m.groupId === groupId && m.text === "owner-msg") &&
      alice.messages.some((m) => m.groupId === groupId && m.text === "bob-msg"));
    await waitUntil(() =>
      bob.messages.some((m) => m.groupId === groupId && m.text === "owner-msg") &&
      bob.messages.some((m) => m.groupId === groupId && m.text === "alice-msg"));

    const ownerHashes = owner.chat
      .getActionChainEnvelopes(groupId)
      .map((envelope) => toHex(envelope.hash));
    const aliceHashes = alice.chat
      .getActionChainEnvelopes(groupId)
      .map((envelope) => toHex(envelope.hash));
    const bobHashes = bob.chat
      .getActionChainEnvelopes(groupId)
      .map((envelope) => toHex(envelope.hash));

    expect(aliceHashes).toEqual(ownerHashes);
    expect(bobHashes).toEqual(ownerHashes);
  });

  it("should allow delegated admin to approve joins while owner is offline", { timeout: 20_000 }, async () => {
    const owner = await createTestNode();
    const delegate = await createTestNode();
    const joiner = await createTestNode();

    const { groupId, genesisEnvelope } = await owner.chat.createGroup("Delegated Approval");
    const invite = buildInvite(owner, genesisEnvelope);

    await delegate.chat.connectTo(owner.chat.multiaddrs[0]);
    await waitFor(400);
    await delegate.chat.joinViaInvite(invite);
    const delegateJoin = await waitForJoinRequestFrom(owner, groupId, delegate.peerId);
    await owner.chat.approveJoin(groupId, delegateJoin.requesterPublicKey);
    await waitUntil(() => owner.chat.getActionChainState(groupId)!.members.size === 2);

    await owner.chat.changeMemberRole(groupId, delegateJoin.requesterPublicKey, "admin");
    await waitUntil(
      () =>
        delegate.chat.getActionChainState(groupId)?.members.get(toHex(delegate.accountKey.publicKey))?.role === "admin",
    );

    await owner.chat.stop();
    instances.splice(instances.indexOf(owner.chat), 1);

    await joiner.chat.connectTo(delegate.chat.multiaddrs[0]);
    await waitFor(400);
    const delegatedInvite: GroupInvite = {
      genesisEnvelope,
      relayAddr: delegate.chat.multiaddrs[0]?.toString(),
      adminPeerId: owner.peerId,
    };
    await joiner.chat.joinViaInvite(delegatedInvite);
    const joinerRequest = await waitForJoinRequestFrom(delegate, groupId, joiner.peerId);
    await delegate.chat.approveJoin(groupId, joinerRequest.requesterPublicKey);

    const joinerHex = toHex(new Uint8Array(joiner.accountKey.publicKey));
    await waitUntil(
      () => delegate.chat.getActionChainState(groupId)?.members.has(joinerHex) ?? false,
      10_000,
    );
  });

  it("should transfer ownership to earliest remaining member when owner leaves", { timeout: 20_000 }, async () => {
    const owner = await createTestNode();
    const firstJoiner = await createTestNode();
    const secondJoiner = await createTestNode();

    const { groupId, genesisEnvelope } = await owner.chat.createGroup("Ownership Handoff");
    const invite = buildInvite(owner, genesisEnvelope);

    await firstJoiner.chat.connectTo(owner.chat.multiaddrs[0]);
    await waitFor(400);
    await firstJoiner.chat.joinViaInvite(invite);
    const firstReq = await waitForJoinRequestFrom(owner, groupId, firstJoiner.peerId);
    await owner.chat.approveJoin(groupId, firstReq.requesterPublicKey);

    await secondJoiner.chat.connectTo(owner.chat.multiaddrs[0]);
    await waitFor(400);
    await secondJoiner.chat.joinViaInvite(invite);
    const secondReq = await waitForJoinRequestFrom(owner, groupId, secondJoiner.peerId);
    await owner.chat.approveJoin(groupId, secondReq.requesterPublicKey);
    await waitUntil(() => owner.chat.getActionChainState(groupId)!.members.size === 3);
    await waitUntil(() => firstJoiner.chat.getActionChainState(groupId)!.members.size === 3);
    await waitUntil(() => secondJoiner.chat.getActionChainState(groupId)!.members.size === 3);

    await owner.chat.leaveGroup(groupId);

    await waitUntil(
      () =>
        firstJoiner.chat.getActionChainState(groupId)?.members.get(toHex(firstJoiner.accountKey.publicKey))?.role === "owner",
      12_000,
    );

    const secondKey = new Uint8Array(secondJoiner.accountKey.publicKey);
    await secondJoiner.chat.connectTo(firstJoiner.chat.multiaddrs[0]);
    await waitFor(300);
    await firstJoiner.chat.changeMemberRole(groupId, secondKey, "admin");
    await waitUntil(
      () =>
        secondJoiner.chat.getActionChainState(groupId)?.members.get(toHex(secondKey))?.role === "admin",
      10_000,
    );
  });

  it("should sync delegated role changes after member reconnects from offline state", { timeout: 15_000 }, async () => {
    const owner = await createTestNode();
    const memberAccountKey = generateAccountKey();
    const memberOnline = await createTestNode(memberAccountKey);

    const { groupId, genesisEnvelope } = await owner.chat.createGroup("Offline Delegation Sync");
    const invite = buildInvite(owner, genesisEnvelope);

    await memberOnline.chat.connectTo(owner.chat.multiaddrs[0]);
    await waitFor(400);
    await memberOnline.chat.joinViaInvite(invite);
    const joinReq = await waitForJoinRequestFrom(owner, groupId, memberOnline.peerId);
    await owner.chat.approveJoin(groupId, joinReq.requesterPublicKey);
    await waitUntil(() => memberOnline.chat.getActionChainState(groupId)!.members.size === 2);

    const memberPeerKey = memberOnline.chat.getPeerPrivateKey();
    const cachedEnvelopes = memberOnline.chat.getActionChainEnvelopes(groupId);
    await memberOnline.chat.stop();
    instances.splice(instances.indexOf(memberOnline.chat), 1);

    await owner.chat.changeMemberRole(groupId, joinReq.requesterPublicKey, "admin");
    await owner.chat.sendMessage(groupId, "while-offline");

    const memberReconnected = await createTestNodeWithPeerKey(memberPeerKey, memberAccountKey);
    memberReconnected.chat.joinGroup(groupId);
    memberReconnected.chat.loadActionChain(groupId, cachedEnvelopes);
    await memberReconnected.chat.connectTo(owner.chat.multiaddrs[0]);

    await waitUntil(
      () =>
        memberReconnected.chat.getActionChainState(groupId)?.members.get(toHex(memberAccountKey.publicKey))?.role === "admin",
      10_000,
    );
    await waitUntil(
      () =>
        memberReconnected.messages.some(
          (msg) => msg.groupId === groupId && msg.text === "while-offline",
        ),
      10_000,
    );
  });

  it("should produce a stable peer ID when given the same peerPrivateKey", async () => {
    const node1 = await createTestNode();
    const peerPrivateKey = node1.chat.getPeerPrivateKey();
    const firstPeerId = node1.peerId;
    await node1.chat.stop();
    instances.splice(instances.indexOf(node1.chat), 1);

    const node2 = await createTestNodeWithPeerKey(peerPrivateKey);

    expect(node2.peerId).toBe(firstPeerId);
  });

  it("should expose raw peer private key bytes", async () => {
    const { chat } = await createTestNode();

    const rawKey = chat.getPeerPrivateKey();

    expect(rawKey).toBeInstanceOf(Uint8Array);
    expect(rawKey.length).toBe(64);
  });

  it("should seed publicKeyToPeerId from initial map", async () => {
    const initialMap = new Map<string, string>([
      ["aabbcc", "12D3KooWFake1"],
      ["ddeeff", "12D3KooWFake2"],
    ]);

    let publicKeyToPeerId: ReadonlyMap<string, string> = new Map();

    const chat = await createMultiGroupChat({
      accountKey: generateAccountKey(),
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
      initialPublicKeyToPeerId: initialMap,
      onPublicKeyToPeerIdChange: (map) => {
        publicKeyToPeerId = map;
      },
    });
    instances.push(chat);

    expect(publicKeyToPeerId.get("aabbcc")).toBe("12D3KooWFake1");
    expect(publicKeyToPeerId.get("ddeeff")).toBe("12D3KooWFake2");
  });

  it("should attempt to dial admin peer after joinViaInvite", async () => {
    const admin = await createTestNode();
    const joiner = await createTestNode();

    const { genesisEnvelope } = await admin.chat.createGroup("Dial Test");

    const invite: GroupInvite = {
      genesisEnvelope,
      relayAddr: admin.chat.multiaddrs[0].toString(),
      adminPeerId: admin.peerId,
    };
    await joiner.chat.joinViaInvite(invite);
    await waitFor(500);

    const dialAttempts = joiner.events.filter((e) => e.type === "dial-attempt");
    expect(dialAttempts.length).toBeGreaterThanOrEqual(1);
    expect(dialAttempts.some((e) => e.detail.includes(admin.peerId.slice(0, 16)))).toBe(true);
  });

  it("should sync missed action chain envelopes when a group member reconnects", { timeout: 20_000 }, async () => {
    const admin = await createTestNode();
    const joinerAccountKey = generateAccountKey();
    const joiner1 = await createTestNode(joinerAccountKey);

    const { groupId, genesisEnvelope } = await admin.chat.createGroup("Sync Test");

    await joiner1.chat.connectTo(admin.chat.multiaddrs[0]);
    await waitFor(500);

    const joinRequestReceived = new Promise<JoinRequestEvent>((resolve) => {
      admin.chat.onJoinRequest((evt) => resolve(evt));
    });

    const invite: GroupInvite = {
      genesisEnvelope,
      relayAddr: admin.chat.multiaddrs[0].toString(),
      adminPeerId: admin.peerId,
    };
    await joiner1.chat.joinViaInvite(invite);
    const joinRequest = await joinRequestReceived;
    await admin.chat.approveJoin(groupId, joinRequest.requesterPublicKey);
    await waitUntil(() => joiner1.chat.getActionChainEnvelopes(groupId).length >= 2, 10_000);

    const joinerPeerKey = joiner1.chat.getPeerPrivateKey();
    const savedGenesis = joiner1.chat.getActionChainEnvelopes(groupId)[0];

    await joiner1.chat.stop();
    instances.splice(instances.indexOf(joiner1.chat), 1);

    const joiner2 = await createTestNodeWithPeerKey(joinerPeerKey, joinerAccountKey);
    joiner2.chat.joinGroup(groupId);
    joiner2.chat.loadActionChain(groupId, [savedGenesis]);
    expect(joiner2.chat.getActionChainEnvelopes(groupId).length).toBe(1);

    await joiner2.chat.connectTo(admin.chat.multiaddrs[0]);
    await waitUntil(() => joiner2.chat.getActionChainEnvelopes(groupId).length >= 2, 10_000);

    expect(joiner2.chat.getActionChainState(groupId)!.members.size).toBe(2);
  });

  it("should catch up on missed messages when a peer reconnects", { timeout: 15_000 }, async () => {
    const alice = await createTestNode();
    const bobAccountKey = generateAccountKey();
    const bob1 = await createTestNode(bobAccountKey);

    const { groupId, genesisEnvelope } = await alice.chat.createGroup("Catchup Test");

    await bob1.chat.connectTo(alice.chat.multiaddrs[0]);
    await waitFor(500);

    const joinRequestReceived = new Promise<JoinRequestEvent>((resolve) => {
      alice.chat.onJoinRequest((evt) => resolve(evt));
    });
    const invite: GroupInvite = {
      genesisEnvelope,
      relayAddr: alice.chat.multiaddrs[0].toString(),
      adminPeerId: alice.peerId,
    };
    await bob1.chat.joinViaInvite(invite);
    const joinRequest = await joinRequestReceived;
    await alice.chat.approveJoin(groupId, joinRequest.requesterPublicKey);
    await waitUntil(() => bob1.chat.getActionChainEnvelopes(groupId).length >= 2);

    const bobPeerKey = bob1.chat.getPeerPrivateKey();
    const bobEnvelopes = bob1.chat.getActionChainEnvelopes(groupId);

    await bob1.chat.stop();
    instances.splice(instances.indexOf(bob1.chat), 1);

    for (let i = 0; i < 10; i++) {
      await alice.chat.sendMessage(groupId, `missed-${i}`);
    }

    await waitFor(7000);

    const bob2 = await createTestNodeWithPeerKey(bobPeerKey, bobAccountKey);
    bob2.chat.joinGroup(groupId);
    bob2.chat.loadActionChain(groupId, bobEnvelopes);

    await bob2.chat.connectTo(alice.chat.multiaddrs[0]);
    await waitUntil(() => bob2.messages.length >= 10);

    for (let i = 0; i < 10; i++) {
      expect(bob2.messages.some((m) => m.text === `missed-${i}`)).toBe(true);
    }

    const syncState = bob2.chat.getSyncProgressState();
    const byPeer = syncState.get(groupId);
    expect(byPeer?.get(alice.peerId)?.lastRequestedAtMs).not.toBeNull();
    expect(byPeer?.get(alice.peerId)?.lastReceivedEnvelopeCount).toBeGreaterThan(0);
  });

  it("should paginate sync responses when missed history exceeds one page", { timeout: 45_000 }, async () => {
    const alice = await createTestNode();
    const bobAccountKey = generateAccountKey();
    const bob1 = await createTestNode(bobAccountKey);

    const { groupId, genesisEnvelope } = await alice.chat.createGroup("Paged Catchup");
    await bob1.chat.connectTo(alice.chat.multiaddrs[0]);
    await waitFor(500);

    const joinRequestReceived = new Promise<JoinRequestEvent>((resolve) => {
      alice.chat.onJoinRequest((evt) => resolve(evt));
    });
    const invite: GroupInvite = {
      genesisEnvelope,
      relayAddr: alice.chat.multiaddrs[0].toString(),
      adminPeerId: alice.peerId,
    };
    await bob1.chat.joinViaInvite(invite);
    const joinRequest = await joinRequestReceived;
    await alice.chat.approveJoin(groupId, joinRequest.requesterPublicKey);
    await waitUntil(() => bob1.chat.getActionChainEnvelopes(groupId).length >= 2);

    const bobPeerKey = bob1.chat.getPeerPrivateKey();
    const bobEnvelopes = bob1.chat.getActionChainEnvelopes(groupId);

    await bob1.chat.stop();
    instances.splice(instances.indexOf(bob1.chat), 1);

    const missedCount = 280;
    for (let i = 0; i < missedCount; i++) {
      await alice.chat.sendMessage(groupId, `paged-${i}`);
    }

    const bob2 = await createTestNodeWithPeerKey(bobPeerKey, bobAccountKey);
    bob2.chat.joinGroup(groupId);
    bob2.chat.loadActionChain(groupId, bobEnvelopes);
    await bob2.chat.connectTo(alice.chat.multiaddrs[0]);

    await waitUntil(() => bob2.messages.length >= missedCount, 30_000);
    expect(bob2.messages.some((m) => m.text === "paged-0")).toBe(true);
    expect(bob2.messages.some((m) => m.text === `paged-${missedCount - 1}`)).toBe(true);
  });

  it("should map admin publicKey to peerId immediately on joinViaInvite", async () => {
    const admin = await createTestNode();
    const joiner = await createTestNode();

    const { genesisEnvelope } = await admin.chat.createGroup("PeerId Test");

    await joiner.chat.connectTo(admin.chat.multiaddrs[0]);
    await waitFor(500);

    const invite: GroupInvite = {
      genesisEnvelope,
      relayAddr: admin.chat.multiaddrs[0].toString(),
      adminPeerId: admin.peerId,
    };
    await joiner.chat.joinViaInvite(invite);

    const adminKeyHex = toHex(new Uint8Array(admin.accountKey.publicKey));
    expect(joiner.publicKeyToPeerId.get(adminKeyHex)).toBe(admin.peerId);
  });
});
