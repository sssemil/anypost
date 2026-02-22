import "../0002-libp2p-webrtc-browser/polyfill.mjs";
import * as Y from "yjs";
import {
  writeSyncStep1,
  readSyncMessage,
  writeUpdate,
} from "y-protocols/sync.js";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { createLibp2p } from "libp2p";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { webSockets } from "@libp2p/websockets";
import {
  circuitRelayServer,
  circuitRelayTransport,
} from "@libp2p/circuit-relay-v2";
import { identify } from "@libp2p/identify";
import { pipe } from "it-pipe";
import { lpStream } from "it-length-prefixed-stream";

const SYNC_PROTOCOL = "/anypost/yjs-sync/1.0.0";

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.log(`  ✗ ${msg}`);
    failed++;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

console.log("=== Yjs Sync Over libp2p Direct Streams ===\n");

// --- Setup: Create relay + 2 peers ---
console.log("1. Setting up relay and peers...");

const relay = await createLibp2p({
  addresses: { listen: ["/ip4/127.0.0.1/tcp/0/ws"] },
  transports: [webSockets()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: {
    identify: identify(),
    relay: circuitRelayServer({ reservations: { maxReservations: 128 } }),
  },
});

const relayAddr = relay.getMultiaddrs()[0];
const circuitAddr = `${relayAddr.toString()}/p2p-circuit`;

assert(true, `Relay started: ${relay.peerId.toString().slice(-8)}`);

// Create peer A with a Yjs doc
const docA = new Y.Doc();
const peerA = await createLibp2p({
  addresses: { listen: [circuitAddr] },
  transports: [webSockets(), circuitRelayTransport()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: { identify: identify() },
});

// Create peer B with a Yjs doc
const docB = new Y.Doc();
const peerB = await createLibp2p({
  addresses: { listen: [circuitAddr] },
  transports: [webSockets(), circuitRelayTransport()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: { identify: identify() },
});

assert(true, `Peer A: ${peerA.peerId.toString().slice(-8)}`);
assert(true, `Peer B: ${peerB.peerId.toString().slice(-8)}`);

// --- Test 2: Register sync protocol handler on Peer A ---
console.log("\n2. Registering Yjs sync protocol handler...");

peerA.handle(SYNC_PROTOCOL, async ({ stream, connection }) => {
  const lp = lpStream(stream);
  try {
    // Read incoming sync messages and respond
    while (true) {
      const msg = await lp.read();
      if (!msg) break;

      const decoder = decoding.createDecoder(msg.subarray());
      const encoder = encoding.createEncoder();
      const msgType = readSyncMessage(decoder, encoder, docA, connection.remotePeer.toString());

      const reply = encoding.toUint8Array(encoder);
      if (reply.byteLength > 0) {
        await lp.write(reply);
      }
    }
  } catch (e) {
    if (!e.message?.includes("abort") && !e.message?.includes("reset")) {
      console.log(`  ℹ Handler ended: ${e.message}`);
    }
  }
}, { runOnLimitedConnection: true });

assert(true, `Registered ${SYNC_PROTOCOL} on Peer A`);

// --- Test 3: Connect peers through relay ---
console.log("\n3. Connecting peers through relay...");
await sleep(1000);

const peerAAddr = peerA.getMultiaddrs().find((ma) => ma.toString().includes("/p2p-circuit"));
assert(!!peerAAddr, `Peer A has circuit address`);

const conn = await peerB.dial(peerAAddr, {
  signal: AbortSignal.timeout(15_000),
});
assert(true, `Peer B connected to Peer A`);

await sleep(2000); // Wait for identify exchange

// --- Test 4: Peer A adds data, Peer B syncs via custom stream ---
console.log("\n4. Testing Yjs sync over libp2p stream...");

// A adds data
docA.getArray("messages").push([
  { id: "m1", text: "Hello from A", ts: 1 },
  { id: "m2", text: "Second from A", ts: 2 },
]);
docA.getMap("metadata").set("groupName", "Test Group");

assert(docA.getArray("messages").length === 2, "Peer A has 2 messages");
assert(docB.getArray("messages").length === 0, "Peer B has 0 messages (not synced yet)");

// B opens a sync stream to A
const syncStream = await conn.newStream(SYNC_PROTOCOL, {
  runOnLimitedConnection: true,
  signal: AbortSignal.timeout(10_000),
});
assert(true, "Opened sync stream to Peer A");

const lp = lpStream(syncStream);

// Step 1: B sends state vector to A
const enc1 = encoding.createEncoder();
writeSyncStep1(enc1, docB);
await lp.write(encoding.toUint8Array(enc1));

// Read A's response (step 2: missing updates)
const response = await lp.read();
assert(response.byteLength > 0, `Received sync response (${response.byteLength} bytes)`);

// Apply A's response to B's doc
const dec = decoding.createDecoder(response.subarray());
readSyncMessage(dec, encoding.createEncoder(), docB, "remote");

assert(
  docB.getArray("messages").length === 2,
  `Peer B synced: ${docB.getArray("messages").length} messages`
);
assert(
  docB.getArray("messages").get(0).text === "Hello from A",
  "Peer B has correct message content"
);
assert(
  docB.getMap("metadata").get("groupName") === "Test Group",
  "Peer B has correct metadata"
);

// Close the sync stream
await syncStream.close();

// --- Test 5: Real-time update forwarding via update stream ---
console.log("\n5. Testing real-time update forwarding...");

// Register an update handler on B that receives pushed updates
const receivedUpdates = [];

peerB.handle("/anypost/yjs-update/1.0.0", async ({ stream }) => {
  const lp2 = lpStream(stream);
  try {
    while (true) {
      const msg = await lp2.read();
      if (!msg) break;
      receivedUpdates.push(msg.subarray());
      Y.applyUpdate(docB, msg.subarray(), "remote");
    }
  } catch {
    // stream closed
  }
}, { runOnLimitedConnection: true });

// A opens an update stream to B and pushes updates
const peerBAddr = peerB.getMultiaddrs().find((ma) => ma.toString().includes("/p2p-circuit"));

// Connect A → B if not already
try {
  await peerA.dial(peerBAddr, { signal: AbortSignal.timeout(10_000) });
} catch {
  // Already connected
}
await sleep(1000);

const updateConns = peerA.getConnections(peerB.peerId);
if (updateConns.length > 0) {
  const updateStream = await updateConns[0].newStream("/anypost/yjs-update/1.0.0", {
    runOnLimitedConnection: true,
    signal: AbortSignal.timeout(10_000),
  });
  const lpUpdate = lpStream(updateStream);

  // A adds a new message
  const capturedUpdate = [];
  const handler = (update) => capturedUpdate.push(update);
  docA.on("update", handler);

  docA.getArray("messages").push([{ id: "m3", text: "Pushed update from A", ts: 3 }]);
  docA.off("update", handler);

  // Forward captured update to B via the stream
  for (const update of capturedUpdate) {
    await lpUpdate.write(update);
  }

  await sleep(500);

  assert(receivedUpdates.length > 0, `B received ${receivedUpdates.length} pushed update(s)`);
  assert(
    docB.getArray("messages").length === 3,
    `B has ${docB.getArray("messages").length} messages after push`
  );
  assert(
    docB.getArray("messages").get(2).text === "Pushed update from A",
    "B has pushed message content"
  );

  await updateStream.close();
} else {
  console.log("  ✗ No connection from A to B for update stream");
  failed++;
}

// --- Test 6: Measure stream overhead ---
console.log("\n6. Stream overhead measurement");
{
  const testDoc = new Y.Doc();
  const msgs = testDoc.getArray("messages");

  // Measure update size for typical chat message
  const updates = [];
  testDoc.on("update", (u) => updates.push(u));

  msgs.push([{
    id: crypto.randomUUID(),
    text: "This is a typical chat message with some content",
    ts: Date.now(),
    senderId: "12D3KooWExamplePeerId",
  }]);

  console.log(`  ℹ Single message update: ${updates[0].byteLength} bytes`);
  console.log(`  ℹ State vector for catch-up request: ${Y.encodeStateVector(testDoc).byteLength} bytes`);

  // Full state for 100 messages
  for (let i = 0; i < 99; i++) {
    msgs.push([{
      id: crypto.randomUUID(),
      text: `Message ${i + 2}: typical content with ${Math.random().toString(36)}`,
      ts: Date.now(),
      senderId: "12D3KooWExamplePeerId",
    }]);
  }

  const fullState = Y.encodeStateAsUpdate(testDoc);
  console.log(`  ℹ Full state (100 messages): ${Math.round(fullState.byteLength / 1024)}KB`);
  assert(true, "Stream overhead measurements captured");
}

// --- Cleanup ---
console.log("\n7. Cleanup...");
await peerA.stop();
await peerB.stop();
await relay.stop();
assert(true, "All nodes stopped");

// --- Summary ---
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
process.exit(0);
