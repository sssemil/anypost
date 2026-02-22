import * as Y from "yjs";
import {
  writeSyncStep1,
  writeSyncStep2,
  writeUpdate,
  readSyncMessage,
  messageYjsSyncStep1,
  messageYjsSyncStep2,
} from "y-protocols/sync.js";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

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

function syncDocs(src, dst) {
  // Step 1: dst sends state vector to src
  const enc1 = encoding.createEncoder();
  writeSyncStep1(enc1, dst);
  const step1Bytes = encoding.toUint8Array(enc1);

  // src reads step1, produces step2 (missing updates for dst)
  const dec1 = decoding.createDecoder(step1Bytes);
  const enc2 = encoding.createEncoder();
  const msgType = readSyncMessage(dec1, enc2, src, null);

  const step2Bytes = encoding.toUint8Array(enc2);
  if (step2Bytes.byteLength > 0) {
    // dst applies step2
    const dec2 = decoding.createDecoder(step2Bytes);
    readSyncMessage(dec2, encoding.createEncoder(), dst, null);
  }
}

console.log("=== Yjs Sync Protocol Validation ===\n");

// --- Test 1: Basic Y.Doc creation and Y.Array operations ---
console.log("1. Y.Doc basic operations");
{
  const doc = new Y.Doc();
  const messages = doc.getArray("messages");
  messages.push([{ id: "m1", text: "hello", ts: Date.now() }]);
  messages.push([{ id: "m2", text: "world", ts: Date.now() }]);

  assert(messages.length === 2, "Y.Array append works");
  assert(messages.get(0).text === "hello", "Y.Array stores objects correctly");
}

// --- Test 2: Two Y.Docs sync via Yjs sync protocol ---
console.log("\n2. Two-doc sync via sync protocol");
{
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  // Peer A adds messages
  docA.getArray("messages").push([{ id: "m1", text: "from A", ts: 1 }]);

  // Full bidirectional sync
  syncDocs(docA, docB); // A → B
  syncDocs(docB, docA); // B → A

  const msgsB = docB.getArray("messages");
  assert(msgsB.length === 1, "B receives A's message via sync protocol");
  assert(msgsB.get(0).text === "from A", "B gets correct message content");
}

// --- Test 3: Real-time update broadcast simulation ---
console.log("\n3. Real-time update broadcast (simulated GossipSub)");
{
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  // Simulate real-time: A's updates are broadcast to B
  docA.on("update", (update, origin) => {
    if (origin !== "remote") {
      Y.applyUpdate(docB, update, "remote");
    }
  });

  docB.on("update", (update, origin) => {
    if (origin !== "remote") {
      Y.applyUpdate(docA, update, "remote");
    }
  });

  // A adds a message
  const msgsA = docA.getArray("messages");
  msgsA.push([{ id: "m1", text: "real-time from A", ts: 1 }]);

  const msgsB = docB.getArray("messages");
  assert(msgsB.length === 1, "B receives real-time update from A");
  assert(msgsB.get(0).text === "real-time from A", "B gets correct real-time content");

  // B adds a message
  msgsB.push([{ id: "m2", text: "real-time from B", ts: 2 }]);
  assert(msgsA.length === 2, "A receives real-time update from B");
  assert(msgsA.get(1).text === "real-time from B", "A gets correct real-time content");
}

// --- Test 4: Concurrent edits merge correctly ---
console.log("\n4. Concurrent edits merge");
{
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  // Both add messages independently (offline)
  const msgsA = docA.getArray("messages");
  const msgsB = docB.getArray("messages");

  msgsA.push([{ id: "a1", text: "A offline 1", ts: 1 }]);
  msgsA.push([{ id: "a2", text: "A offline 2", ts: 2 }]);
  msgsB.push([{ id: "b1", text: "B offline 1", ts: 1 }]);
  msgsB.push([{ id: "b2", text: "B offline 2", ts: 2 }]);

  // Now sync: merge both docs
  const stateA = Y.encodeStateAsUpdate(docA);
  const stateB = Y.encodeStateAsUpdate(docB);

  Y.applyUpdate(docA, stateB);
  Y.applyUpdate(docB, stateA);

  assert(msgsA.length === 4, `A has all 4 messages (got ${msgsA.length})`);
  assert(msgsB.length === 4, `B has all 4 messages (got ${msgsB.length})`);

  // Both should have identical content
  const aTexts = msgsA.toArray().map((m) => m.text).sort();
  const bTexts = msgsB.toArray().map((m) => m.text).sort();
  assert(
    JSON.stringify(aTexts) === JSON.stringify(bTexts),
    "Both docs have identical content after merge"
  );
}

// --- Test 5: Offline peer catch-up ---
console.log("\n5. Offline peer catch-up");
{
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  // Initial sync
  const initState = Y.encodeStateAsUpdate(docA);
  Y.applyUpdate(docB, initState);

  // A makes changes while B is "offline"
  const msgsA = docA.getArray("messages");
  msgsA.push([{ id: "m1", text: "while B offline 1", ts: 1 }]);
  msgsA.push([{ id: "m2", text: "while B offline 2", ts: 2 }]);
  msgsA.push([{ id: "m3", text: "while B offline 3", ts: 3 }]);

  // B comes back online — uses state vector for efficient catch-up
  const bStateVector = Y.encodeStateVector(docB);
  const missingUpdates = Y.encodeStateAsUpdate(docA, bStateVector);

  assert(
    missingUpdates.byteLength > 0,
    `Missing updates encoded (${missingUpdates.byteLength} bytes)`
  );

  // Apply only the missing updates
  Y.applyUpdate(docB, missingUpdates);

  const msgsB = docB.getArray("messages");
  assert(msgsB.length === 3, `B caught up on all 3 messages (got ${msgsB.length})`);
  assert(msgsB.get(2).text === "while B offline 3", "B has the latest message");
}

// --- Test 6: Y.Map for metadata ---
console.log("\n6. Y.Map for group metadata");
{
  const doc = new Y.Doc();
  const meta = doc.getMap("metadata");
  meta.set("name", "Test Group");
  meta.set("createdAt", Date.now());
  meta.set("memberCount", 5);

  assert(meta.get("name") === "Test Group", "Y.Map stores strings");
  assert(typeof meta.get("createdAt") === "number", "Y.Map stores numbers");

  // Nested Y.Map
  const settings = new Y.Map();
  settings.set("notificationLevel", "all");
  settings.set("muted", false);
  meta.set("settings", settings);

  assert(
    meta.get("settings").get("notificationLevel") === "all",
    "Nested Y.Map works"
  );
}

// --- Test 7: Y.Text for rich text / message editing ---
console.log("\n7. Y.Text for message editing");
{
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  const textA = docA.getText("msg-1");
  textA.insert(0, "Hello world");

  // Sync to B
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
  const textB = docB.getText("msg-1");
  assert(textB.toString() === "Hello world", "Y.Text syncs between docs");

  // Both edit concurrently
  textA.delete(5, 6); // "Hello"
  textA.insert(5, " Yjs"); // "Hello Yjs"
  textB.insert(0, "[edited] "); // "[edited] Hello world"

  // Merge
  Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

  assert(textA.toString() === textB.toString(), `Y.Text concurrent edits merge: "${textA.toString()}"`);
}

// --- Test 8: Memory measurement ---
console.log("\n8. Memory measurement with many messages");
{
  const doc = new Y.Doc();
  const msgs = doc.getArray("messages");
  const startMem = process.memoryUsage().heapUsed;

  // Add 1000 messages
  for (let i = 0; i < 1000; i++) {
    msgs.push([{ id: `m${i}`, text: `Message ${i} with some content padding`, ts: Date.now() }]);
  }

  const afterAddMem = process.memoryUsage().heapUsed;
  const addedKB = Math.round((afterAddMem - startMem) / 1024);

  assert(msgs.length === 1000, `1000 messages stored`);
  console.log(`  ℹ Memory: ~${addedKB}KB for 1000 messages`);

  // Measure encoded state size
  const encoded = Y.encodeStateAsUpdate(doc);
  const encodedKB = Math.round(encoded.byteLength / 1024);
  console.log(`  ℹ Encoded state: ${encodedKB}KB for 1000 messages`);

  // State vector size (for catch-up requests)
  const stateVector = Y.encodeStateVector(doc);
  console.log(`  ℹ State vector: ${stateVector.byteLength} bytes`);
}

// --- Test 9: Update encoding for wire format ---
console.log("\n9. Update encoding for GossipSub wire format");
{
  const doc = new Y.Doc();
  const updates = [];

  // Capture individual updates as they would be broadcast
  doc.on("update", (update) => {
    updates.push(update);
  });

  const msgs = doc.getArray("messages");
  msgs.push([{ id: "m1", text: "first", ts: 1 }]);
  msgs.push([{ id: "m2", text: "second", ts: 2 }]);

  assert(updates.length === 2, `Captured ${updates.length} individual updates`);
  assert(updates[0] instanceof Uint8Array, "Updates are Uint8Array (suitable for GossipSub)");
  console.log(`  ℹ Update sizes: ${updates.map((u) => u.byteLength + "B").join(", ")}`);

  // Verify individual updates can be applied to another doc
  const docB = new Y.Doc();
  for (const update of updates) {
    Y.applyUpdate(docB, update);
  }
  const msgsB = docB.getArray("messages");
  assert(msgsB.length === 2, "Individual updates applied correctly to new doc");
}

// --- Test 10: Simulated multi-peer sync (3 peers) ---
console.log("\n10. Three-peer sync simulation");
{
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const docC = new Y.Doc();

  // All-to-all real-time sync (simulating GossipSub fan-out)
  const docs = [docA, docB, docC];
  for (const src of docs) {
    src.on("update", (update, origin) => {
      if (origin !== "remote") {
        for (const dst of docs) {
          if (dst !== src) {
            Y.applyUpdate(dst, update, "remote");
          }
        }
      }
    });
  }

  // Each peer adds a message
  docA.getArray("messages").push([{ id: "a1", text: "from A", ts: 1 }]);
  docB.getArray("messages").push([{ id: "b1", text: "from B", ts: 2 }]);
  docC.getArray("messages").push([{ id: "c1", text: "from C", ts: 3 }]);

  // All should have 3 messages
  assert(docA.getArray("messages").length === 3, "A has 3 messages");
  assert(docB.getArray("messages").length === 3, "B has 3 messages");
  assert(docC.getArray("messages").length === 3, "C has 3 messages");

  // All should have identical content
  const aTexts = docA.getArray("messages").toArray().map((m) => m.text).sort();
  const bTexts = docB.getArray("messages").toArray().map((m) => m.text).sort();
  const cTexts = docC.getArray("messages").toArray().map((m) => m.text).sort();
  assert(
    JSON.stringify(aTexts) === JSON.stringify(bTexts) &&
    JSON.stringify(bTexts) === JSON.stringify(cTexts),
    "All three docs are identical"
  );
}

// --- Test 11: Full sync protocol round-trip via y-protocols ---
console.log("\n11. Full sync protocol round-trip (y-protocols)");
{
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  // A has data
  docA.getArray("messages").push([
    { id: "m1", text: "message 1", ts: 1 },
    { id: "m2", text: "message 2", ts: 2 },
  ]);
  docA.getMap("metadata").set("name", "Test Group");

  // Full bidirectional sync
  syncDocs(docA, docB);
  syncDocs(docB, docA);

  assert(
    docB.getArray("messages").length === 2,
    "Full sync: B got messages"
  );
  assert(
    docB.getMap("metadata").get("name") === "Test Group",
    "Full sync: B got metadata"
  );
}

// --- Test 12: Incremental catch-up via sync protocol ---
console.log("\n12. Incremental catch-up via sync protocol");
{
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  // Initial sync
  syncDocs(docA, docB);
  syncDocs(docB, docA);

  // A adds messages "while B is offline"
  docA.getArray("messages").push([{ id: "m1", text: "offline 1", ts: 1 }]);
  docA.getArray("messages").push([{ id: "m2", text: "offline 2", ts: 2 }]);

  // B reconnects — sync protocol automatically handles catch-up
  syncDocs(docA, docB);

  assert(
    docB.getArray("messages").length === 2,
    "Sync protocol catch-up: B got 2 messages"
  );
}

// --- Test 13: Idempotent update application ---
console.log("\n13. Idempotent update application (duplicate tolerance)");
{
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  docA.getArray("messages").push([{ id: "m1", text: "hello", ts: 1 }]);

  const update = Y.encodeStateAsUpdate(docA);

  // Apply same update multiple times
  Y.applyUpdate(docB, update);
  Y.applyUpdate(docB, update);
  Y.applyUpdate(docB, update);

  assert(
    docB.getArray("messages").length === 1,
    "Duplicate updates are idempotent (still 1 message)"
  );
}

// --- Summary ---
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
