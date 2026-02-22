/**
 * Spike 0005: Integration Test — MLS + Yjs + Simulated Transport
 *
 * Validates the core message flow:
 * 1. Two peers form an MLS group
 * 2. Peer A encrypts a message via MLS
 * 3. Encrypted payload delivered via simulated GossipSub (in-memory)
 * 4. Message metadata stored in Yjs CRDT doc and synced
 * 5. Peer B decrypts using MLS epoch key
 * 6. End-to-end latency measured
 */

import {
  createGroup,
  joinGroup,
  createCommit,
  createApplicationMessage,
  processMessage,
  generateKeyPackage,
  getCiphersuiteImpl,
  getGroupMembers,
  unsafeTestingAuthenticationService,
  defaultProposalTypes,
  defaultCredentialTypes,
  encode,
  decode,
  clientStateEncoder,
  clientStateDecoder,
  mlsMessageEncoder,
  mlsMessageDecoder,
  zeroOutUint8Array,
} from "ts-mls";

import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { writeSyncStep1, readSyncMessage } from "y-protocols/sync";

const CIPHERSUITE = "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519";

function makeCredential(name) {
  return {
    credentialType: defaultCredentialTypes.basic,
    identity: new TextEncoder().encode(name),
  };
}

// Yjs sync helper (from spike 0003)
function syncDocs(src, dst) {
  const enc1 = encoding.createEncoder();
  writeSyncStep1(enc1, dst);
  const step1Bytes = encoding.toUint8Array(enc1);
  const dec1 = decoding.createDecoder(step1Bytes);
  const enc2 = encoding.createEncoder();
  readSyncMessage(dec1, enc2, src, null);
  const step2Bytes = encoding.toUint8Array(enc2);
  if (step2Bytes.byteLength > 0) {
    const dec2 = decoding.createDecoder(step2Bytes);
    readSyncMessage(dec2, encoding.createEncoder(), dst, null);
  }
}

// Simulated GossipSub — in-memory pub/sub
class SimulatedGossipSub {
  constructor() {
    this.subscribers = new Map(); // topic → Set<callback>
  }

  subscribe(topic, callback) {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
    }
    this.subscribers.get(topic).add(callback);
  }

  publish(topic, data, excludePeerId) {
    const subs = this.subscribers.get(topic);
    if (!subs) return;
    for (const cb of subs) {
      if (cb._peerId !== excludePeerId) {
        cb(data);
      }
    }
  }
}

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}`);
    failed++;
  }
}

async function run() {
  console.log("=== Spike 0005: MLS + Yjs Integration Test ===\n");

  // ─── Setup: MLS Context ───
  const impl = await getCiphersuiteImpl(CIPHERSUITE);
  const context = {
    cipherSuite: impl,
    authService: unsafeTestingAuthenticationService,
  };

  // ─── Setup: Generate Key Packages ───
  const aliceKP = await generateKeyPackage({ credential: makeCredential("alice"), cipherSuite: impl });
  const bobKP = await generateKeyPackage({ credential: makeCredential("bob"), cipherSuite: impl });

  // ─── Setup: Simulated Transport ───
  const gossipsub = new SimulatedGossipSub();
  const GROUP_TOPIC = "anypost.group.test-group-1";
  const YJS_TOPIC = "anypost.yjs.test-group-1";

  // ─── Setup: Yjs Documents (one per peer) ───
  const aliceDoc = new Y.Doc({ guid: "test-group-1" });
  const bobDoc = new Y.Doc({ guid: "test-group-1" });

  // ─────────────────────────────────────────────
  // TEST 1: MLS Group Formation
  // ─────────────────────────────────────────────
  console.log("1. MLS Group Formation");

  const groupId = new TextEncoder().encode("test-group-1");

  let aliceState = await createGroup({
    context,
    groupId,
    keyPackage: aliceKP.publicPackage,
    privateKeyPackage: aliceKP.privatePackage,
  });

  assert(getGroupMembers(aliceState).length === 1, "Alice creates group with 1 member");

  const addBobCommit = await createCommit({
    context,
    state: aliceState,
    extraProposals: [{
      proposalType: defaultProposalTypes.add,
      add: { keyPackage: bobKP.publicPackage },
    }],
    ratchetTreeExtension: true,
  });
  aliceState = addBobCommit.newState;
  addBobCommit.consumed.forEach(zeroOutUint8Array);

  let bobState = await joinGroup({
    context,
    welcome: addBobCommit.welcome.welcome,
    keyPackage: bobKP.publicPackage,
    privateKeys: bobKP.privatePackage,
  });

  assert(getGroupMembers(aliceState).length === 2, "Group has 2 members after Bob joins");
  assert(getGroupMembers(bobState).length === 2, "Bob sees 2 members in group");

  // ─────────────────────────────────────────────
  // TEST 2: MLS Encrypt → GossipSub Deliver → MLS Decrypt
  // ─────────────────────────────────────────────
  console.log("\n2. MLS Encrypt → Simulated GossipSub → MLS Decrypt");

  const plaintext = "Hello from Alice! This is encrypted.";
  const startTime = performance.now();

  // Alice encrypts
  const encryptResult = await createApplicationMessage({
    context,
    state: aliceState,
    message: new TextEncoder().encode(plaintext),
  });
  aliceState = encryptResult.newState;
  encryptResult.consumed.forEach(zeroOutUint8Array);

  const mlsMessage = encryptResult.message;

  // Serialize MLS message to bytes for wire transport
  const encryptedBytes = encode(mlsMessageEncoder, mlsMessage);
  assert(encryptedBytes instanceof Uint8Array, "Serialized MLS message is Uint8Array");
  assert(encryptedBytes.byteLength > 0, `Serialized MLS message: ${encryptedBytes.byteLength} bytes`);

  // Verify wire bytes differ from plaintext
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const isDifferent = encryptedBytes.byteLength !== plaintextBytes.byteLength ||
    encryptedBytes.some((b, i) => b !== plaintextBytes[i]);
  assert(isDifferent, "Wire bytes differ from plaintext");

  // Simulated GossipSub delivery
  let bobReceivedEncrypted = null;
  const bobHandler = (data) => { bobReceivedEncrypted = data; };
  bobHandler._peerId = "bob";
  gossipsub.subscribe(GROUP_TOPIC, bobHandler);
  gossipsub.publish(GROUP_TOPIC, encryptedBytes, "alice");

  assert(bobReceivedEncrypted !== null, "Bob received encrypted message via simulated GossipSub");
  assert(
    bobReceivedEncrypted.byteLength === encryptedBytes.byteLength,
    "Received message matches sent message size"
  );

  // Bob deserializes wire bytes back to MLS message, then decrypts
  const bobMlsMessage = decode(mlsMessageDecoder, bobReceivedEncrypted);
  assert(bobMlsMessage !== null, "Bob deserialized MLS message from wire bytes");

  const decryptResult = await processMessage({
    context,
    state: bobState,
    message: bobMlsMessage,
  });

  assert(decryptResult.kind === "applicationMessage", "Bob decrypts as application message");
  const decryptedText = new TextDecoder().decode(decryptResult.message);
  assert(decryptedText === plaintext, `Decrypted text matches: "${decryptedText}"`);
  bobState = decryptResult.newState;

  const e2eLatency = performance.now() - startTime;

  // ─────────────────────────────────────────────
  // TEST 3: Yjs CRDT Metadata Storage
  // ─────────────────────────────────────────────
  console.log("\n3. Yjs CRDT Metadata Storage");

  // Alice stores message metadata in her Yjs doc
  const aliceMessages = aliceDoc.getArray("messages:general");
  const messageId = crypto.randomUUID();
  const messageMetadata = {
    id: messageId,
    sender: "alice",
    channel: "general",
    timestamp: Date.now(),
    encryptedPayloadSize: encryptedBytes.byteLength,
    mlsEpoch: 1,
  };
  aliceMessages.push([messageMetadata]);

  assert(aliceMessages.length === 1, "Alice's doc has 1 message");
  assert(aliceMessages.get(0).id === messageId, "Message ID stored correctly");
  assert(aliceMessages.get(0).sender === "alice", "Sender stored correctly");

  // ─────────────────────────────────────────────
  // TEST 4: Yjs CRDT Sync Between Peers
  // ─────────────────────────────────────────────
  console.log("\n4. Yjs CRDT Sync Between Peers");

  // Sync Alice's doc to Bob's doc (simulating sync provider)
  syncDocs(aliceDoc, bobDoc);

  const bobMessages = bobDoc.getArray("messages:general");
  assert(bobMessages.length === 1, "Bob's doc has 1 message after sync");
  assert(bobMessages.get(0).id === messageId, "Bob sees same message ID");
  assert(bobMessages.get(0).sender === "alice", "Bob sees correct sender");

  // ─────────────────────────────────────────────
  // TEST 5: Real-Time Yjs Update Broadcasting
  // ─────────────────────────────────────────────
  console.log("\n5. Real-Time Yjs Update Broadcasting via Simulated GossipSub");

  // Wire up real-time Yjs sync via simulated GossipSub
  const aliceYjsHandler = (update) => {
    // Alice receives Yjs updates from Bob
    Y.applyUpdate(aliceDoc, update, "remote");
  };
  aliceYjsHandler._peerId = "alice";

  const bobYjsHandler = (update) => {
    // Bob receives Yjs updates from Alice
    Y.applyUpdate(bobDoc, update, "remote");
  };
  bobYjsHandler._peerId = "bob";

  gossipsub.subscribe(YJS_TOPIC, aliceYjsHandler);
  gossipsub.subscribe(YJS_TOPIC, bobYjsHandler);

  // Alice broadcasts Yjs updates via GossipSub
  aliceDoc.on("update", (update, origin) => {
    if (origin !== "remote") {
      gossipsub.publish(YJS_TOPIC, update, "alice");
    }
  });

  // Bob broadcasts Yjs updates via GossipSub
  bobDoc.on("update", (update, origin) => {
    if (origin !== "remote") {
      gossipsub.publish(YJS_TOPIC, update, "bob");
    }
  });

  // Alice sends a second message — should auto-sync to Bob
  const msg2Plaintext = "Second message from Alice";
  const msg2EncResult = await createApplicationMessage({
    context,
    state: aliceState,
    message: new TextEncoder().encode(msg2Plaintext),
  });
  aliceState = msg2EncResult.newState;
  msg2EncResult.consumed.forEach(zeroOutUint8Array);

  // Serialize for wire transport
  const msg2WireBytes = encode(mlsMessageEncoder, msg2EncResult.message);

  // Store metadata in Alice's Yjs doc (auto-broadcasts via GossipSub)
  const msg2Meta = {
    id: crypto.randomUUID(),
    sender: "alice",
    channel: "general",
    timestamp: Date.now(),
    encryptedPayloadSize: msg2WireBytes.byteLength,
    mlsEpoch: 1,
  };
  aliceMessages.push([msg2Meta]);

  // Check Bob received the update in real-time
  assert(bobMessages.length === 2, "Bob received second message metadata in real-time via Yjs GossipSub");
  assert(bobMessages.get(1).id === msg2Meta.id, "Bob's second message ID matches");

  // Deliver encrypted payload via GossipSub and decrypt
  gossipsub.publish(GROUP_TOPIC, msg2WireBytes, "alice");
  assert(bobReceivedEncrypted !== null, "Bob received second encrypted payload");

  const msg2MlsMessage = decode(mlsMessageDecoder, bobReceivedEncrypted);
  const msg2Decrypt = await processMessage({
    context,
    state: bobState,
    message: msg2MlsMessage,
  });
  assert(msg2Decrypt.kind === "applicationMessage", "Bob decrypts second message");
  const msg2Decrypted = new TextDecoder().decode(msg2Decrypt.message);
  assert(msg2Decrypted === msg2Plaintext, `Second message matches: "${msg2Decrypted}"`);
  bobState = msg2Decrypt.newState;

  // ─────────────────────────────────────────────
  // TEST 6: Bob Sends a Message (Bidirectional)
  // ─────────────────────────────────────────────
  console.log("\n6. Bidirectional — Bob Sends Message");

  const bobPlaintext = "Reply from Bob!";
  const bobEncResult = await createApplicationMessage({
    context,
    state: bobState,
    message: new TextEncoder().encode(bobPlaintext),
  });
  bobState = bobEncResult.newState;
  bobEncResult.consumed.forEach(zeroOutUint8Array);

  // Serialize Bob's message for wire transport
  const bobWireBytes = encode(mlsMessageEncoder, bobEncResult.message);

  // Bob stores metadata (auto-syncs to Alice via Yjs GossipSub)
  bobMessages.push([{
    id: crypto.randomUUID(),
    sender: "bob",
    channel: "general",
    timestamp: Date.now(),
    encryptedPayloadSize: bobWireBytes.byteLength,
    mlsEpoch: 1,
  }]);

  assert(aliceMessages.length === 3, "Alice received Bob's message metadata via Yjs real-time sync");
  assert(aliceMessages.get(2).sender === "bob", "Alice sees Bob as sender");

  // Alice receives and decrypts Bob's encrypted payload
  let aliceReceivedEncrypted = null;
  const aliceEncHandler = (data) => { aliceReceivedEncrypted = data; };
  aliceEncHandler._peerId = "alice";
  gossipsub.subscribe(GROUP_TOPIC, aliceEncHandler);
  gossipsub.publish(GROUP_TOPIC, bobWireBytes, "bob");

  assert(aliceReceivedEncrypted !== null, "Alice received Bob's encrypted payload");

  const aliceMlsMessage = decode(mlsMessageDecoder, aliceReceivedEncrypted);
  const aliceDecryptResult = await processMessage({
    context,
    state: aliceState,
    message: aliceMlsMessage,
  });
  assert(aliceDecryptResult.kind === "applicationMessage", "Alice decrypts Bob's message");
  const aliceDecrypted = new TextDecoder().decode(aliceDecryptResult.message);
  assert(aliceDecrypted === bobPlaintext, `Alice decrypted Bob's message: "${aliceDecrypted}"`);
  aliceState = aliceDecryptResult.newState;

  // ─────────────────────────────────────────────
  // TEST 7: Concurrent Yjs Edits Merge Correctly
  // ─────────────────────────────────────────────
  console.log("\n7. Concurrent Yjs Edits Merge");

  // Temporarily disconnect real-time sync to simulate offline
  aliceDoc.off("update");
  bobDoc.off("update");

  const aliceOfflineDoc = new Y.Doc({ guid: "offline-test" });
  const bobOfflineDoc = new Y.Doc({ guid: "offline-test" });

  const aliceOfflineMsgs = aliceOfflineDoc.getArray("messages:general");
  const bobOfflineMsgs = bobOfflineDoc.getArray("messages:general");

  // Both add messages while "offline"
  aliceOfflineMsgs.push([{ id: "a1", sender: "alice", text: "Offline msg 1" }]);
  aliceOfflineMsgs.push([{ id: "a2", sender: "alice", text: "Offline msg 2" }]);
  bobOfflineMsgs.push([{ id: "b1", sender: "bob", text: "Bob offline 1" }]);

  // Reconnect — sync both ways
  syncDocs(aliceOfflineDoc, bobOfflineDoc);
  syncDocs(bobOfflineDoc, aliceOfflineDoc);

  assert(aliceOfflineMsgs.length === 3, "Alice has all 3 messages after merge");
  assert(bobOfflineMsgs.length === 3, "Bob has all 3 messages after merge");

  // Verify deterministic order (same on both peers)
  const aliceOrder = aliceOfflineMsgs.toArray().map(m => m.id).join(",");
  const bobOrder = bobOfflineMsgs.toArray().map(m => m.id).join(",");
  assert(aliceOrder === bobOrder, "Both peers have same message order after CRDT merge");

  // ─────────────────────────────────────────────
  // TEST 8: Non-Member Cannot Decrypt
  // ─────────────────────────────────────────────
  console.log("\n8. Non-Member Cannot Decrypt");

  // Eve has no MLS state — she intercepts the encrypted payload
  const eveKP = await generateKeyPackage({ credential: makeCredential("eve"), cipherSuite: impl });
  // Eve creates her own unrelated group
  const eveState = await createGroup({
    context,
    groupId: new TextEncoder().encode("eve-group"),
    keyPackage: eveKP.publicPackage,
    privateKeyPackage: eveKP.privatePackage,
  });

  try {
    // Eve deserializes the wire bytes and tries to decrypt
    const eveMlsMsg = decode(mlsMessageDecoder, encryptedBytes);
    await processMessage({
      context,
      state: eveState,
      message: eveMlsMsg, // Alice's encrypted message from test 2
    });
    assert(false, "Eve should NOT be able to decrypt");
  } catch {
    assert(true, "Eve correctly cannot decrypt (not a group member)");
  }

  // ─────────────────────────────────────────────
  // TEST 9: MLS State Serialization + Yjs Persistence
  // ─────────────────────────────────────────────
  console.log("\n9. MLS State Serialization + Yjs Persistence Simulation");

  // Serialize MLS state
  const serializedMLS = encode(clientStateEncoder, aliceState);
  assert(serializedMLS.byteLength > 0, `MLS state serialized: ${serializedMLS.byteLength} bytes`);

  const deserializedMLS = decode(clientStateDecoder, serializedMLS);
  assert(deserializedMLS !== null, "MLS state deserialized successfully");

  // Verify deserialized state can still decrypt
  const testMsg = await createApplicationMessage({
    context,
    state: deserializedMLS,
    message: new TextEncoder().encode("Post-restore message"),
  });
  const bobTestDecrypt = await processMessage({
    context,
    state: bobState,
    message: testMsg.message,
  });
  assert(bobTestDecrypt.kind === "applicationMessage", "Deserialized state can still encrypt/decrypt");
  const restored = new TextDecoder().decode(bobTestDecrypt.message);
  assert(restored === "Post-restore message", `Post-restore decrypt: "${restored}"`);

  // Simulate Yjs persistence (serialize → new doc → restore)
  const aliceStateVector = Y.encodeStateAsUpdate(aliceDoc);
  const restoredDoc = new Y.Doc({ guid: "test-group-1" });
  Y.applyUpdate(restoredDoc, aliceStateVector);
  const restoredMessages = restoredDoc.getArray("messages:general");
  assert(restoredMessages.length === aliceMessages.length, "Yjs doc restored all messages from state");

  // ─────────────────────────────────────────────
  // TEST 10: Performance Benchmark
  // ─────────────────────────────────────────────
  console.log("\n10. Performance Benchmark");

  // Fresh MLS group for clean benchmark
  const benchAliceKP = await generateKeyPackage({ credential: makeCredential("bench-a"), cipherSuite: impl });
  const benchBobKP = await generateKeyPackage({ credential: makeCredential("bench-b"), cipherSuite: impl });

  let benchAlice = await createGroup({
    context,
    groupId: new TextEncoder().encode("bench-group"),
    keyPackage: benchAliceKP.publicPackage,
    privateKeyPackage: benchAliceKP.privatePackage,
  });

  const benchCommit = await createCommit({
    context,
    state: benchAlice,
    extraProposals: [{ proposalType: defaultProposalTypes.add, add: { keyPackage: benchBobKP.publicPackage } }],
    ratchetTreeExtension: true,
  });
  benchAlice = benchCommit.newState;
  benchCommit.consumed.forEach(zeroOutUint8Array);

  let benchBob = await joinGroup({
    context,
    welcome: benchCommit.welcome.welcome,
    keyPackage: benchBobKP.publicPackage,
    privateKeys: benchBobKP.privatePackage,
  });

  const benchDoc = new Y.Doc({ guid: "bench-group" });
  const benchMessages = benchDoc.getArray("messages:general");

  const ITERATIONS = 50;
  const e2eTimes = [];
  const encTimes = [];
  const decTimes = [];
  const crdtTimes = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const msg = `Benchmark message ${i}`;
    const fullStart = performance.now();

    // Encrypt + serialize
    const eStart = performance.now();
    const eResult = await createApplicationMessage({
      context,
      state: benchAlice,
      message: new TextEncoder().encode(msg),
    });
    const eWire = encode(mlsMessageEncoder, eResult.message);
    encTimes.push(performance.now() - eStart);
    benchAlice = eResult.newState;
    eResult.consumed.forEach(zeroOutUint8Array);

    // CRDT insert
    const cStart = performance.now();
    benchMessages.push([{
      id: `bench-${i}`,
      sender: "alice",
      channel: "general",
      timestamp: Date.now(),
      size: eWire.byteLength,
    }]);
    crdtTimes.push(performance.now() - cStart);

    // Deserialize + decrypt
    const dStart = performance.now();
    const dMsg = decode(mlsMessageDecoder, eWire);
    const dResult = await processMessage({
      context,
      state: benchBob,
      message: dMsg,
    });
    decTimes.push(performance.now() - dStart);
    if (dResult.kind === "applicationMessage") benchBob = dResult.newState;

    e2eTimes.push(performance.now() - fullStart);
  }

  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const p95 = arr => [...arr].sort((a, b) => a - b)[Math.floor(arr.length * 0.95)];
  const max = arr => Math.max(...arr);

  console.log(`  MLS Encrypt  — avg: ${avg(encTimes).toFixed(2)}ms, p95: ${p95(encTimes).toFixed(2)}ms, max: ${max(encTimes).toFixed(2)}ms`);
  console.log(`  MLS Decrypt  — avg: ${avg(decTimes).toFixed(2)}ms, p95: ${p95(decTimes).toFixed(2)}ms, max: ${max(decTimes).toFixed(2)}ms`);
  console.log(`  CRDT Insert  — avg: ${avg(crdtTimes).toFixed(2)}ms, p95: ${p95(crdtTimes).toFixed(2)}ms, max: ${max(crdtTimes).toFixed(2)}ms`);
  console.log(`  E2E Pipeline — avg: ${avg(e2eTimes).toFixed(2)}ms, p95: ${p95(e2eTimes).toFixed(2)}ms, max: ${max(e2eTimes).toFixed(2)}ms`);
  console.log(`  First msg E2E latency (test 2): ${e2eLatency.toFixed(2)}ms`);

  const under10ms = e2eTimes.filter(t => t < 10).length;
  console.log(`  Under 10ms: ${under10ms}/${ITERATIONS} (${((under10ms/ITERATIONS)*100).toFixed(0)}%)`);
  assert(avg(e2eTimes) < 50, `E2E avg under 50ms: ${avg(e2eTimes).toFixed(2)}ms`);

  // Wire format sizes
  console.log(`\n  Wire Format Sizes:`);
  const lastEnc = await createApplicationMessage({
    context,
    state: benchAlice,
    message: new TextEncoder().encode("Hello"),
  });
  const lastWire = encode(mlsMessageEncoder, lastEnc.message);
  console.log(`  Encrypted "Hello" wire payload: ${lastWire.byteLength} bytes`);
  console.log(`  Yjs state (${benchMessages.length} messages): ${Y.encodeStateAsUpdate(benchDoc).byteLength} bytes`);
  console.log(`  MLS state: ${encode(clientStateEncoder, benchAlice).byteLength} bytes`);

  // ─── Summary ───
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
  console.log(`${"=".repeat(50)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(e => {
  console.error("FATAL:", e);
  process.exit(1);
});
