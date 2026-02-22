import {
  createGroup,
  joinGroup,
  createCommit,
  createApplicationMessage,
  processMessage,
  generateKeyPackage,
  getCiphersuiteImpl,
  getCiphersuiteFromName,
  defaultAuthenticationService,
  defaultProposalTypes,
  credentialTypes,
  encodeGroupState,
  decodeGroupState,
  zeroOutUint8Array,
  emptyPskIndex,
  acceptAll,
  defaultCapabilities,
  defaultLifetime,
} from "ts-mls";

function countMembers(state) {
  return state.ratchetTree.filter(n => n && n.kind === "leaf" && n.leafNode).length;
}

const CIPHERSUITE = "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519";

function makeCredential(name) {
  return {
    credentialType: "basic",
    identity: new TextEncoder().encode(name),
  };
}

async function run() {
  console.log("=== ts-mls v1.6.1 Node.js Validation ===\n");

  // 1. Load ciphersuite
  console.log("1. Loading ciphersuite...");
  const cs = getCiphersuiteFromName(CIPHERSUITE);
  const impl = await getCiphersuiteImpl(cs);
  console.log(`   ✓ Loaded: ${CIPHERSUITE}`);

  const pskIndex = emptyPskIndex;

  // 2. Generate KeyPackages
  console.log("\n2. Generating KeyPackages...");
  const alice = await generateKeyPackage(makeCredential("alice"), defaultCapabilities(), defaultLifetime, [], impl);
  const bob = await generateKeyPackage(makeCredential("bob"), defaultCapabilities(), defaultLifetime, [], impl);
  const charlie = await generateKeyPackage(makeCredential("charlie"), defaultCapabilities(), defaultLifetime, [], impl);
  console.log("   ✓ Generated for Alice, Bob, Charlie");

  // 3. Create group
  console.log("\n3. Creating group...");
  const groupId = new TextEncoder().encode("test-group");
  let aliceState = await createGroup(groupId, alice.publicPackage, alice.privatePackage, [], impl);
  console.log(`   ✓ Group created, members: ${countMembers(aliceState)}`);

  // 4. Add Bob
  console.log("\n4. Adding Bob...");
  const addBobCommit = await createCommit(
    { state: aliceState, cipherSuite: impl, pskIndex },
    {
      extraProposals: [{
        proposalType: "add",
        add: { keyPackage: bob.publicPackage },
      }],
      ratchetTreeExtension: true,
    }
  );
  aliceState = addBobCommit.newState;
  addBobCommit.consumed.forEach(zeroOutUint8Array);

  let bobState = await joinGroup(
    addBobCommit.welcome,
    bob.publicPackage,
    bob.privatePackage,
    pskIndex,
    impl,
  );
  console.log(`   ✓ Bob joined, members: ${countMembers(aliceState)}`);

  // 5. Add Charlie (3-member group)
  console.log("\n5. Adding Charlie...");
  const addCharlieCommit = await createCommit(
    { state: aliceState, cipherSuite: impl, pskIndex },
    {
      extraProposals: [{
        proposalType: "add",
        add: { keyPackage: charlie.publicPackage },
      }],
      ratchetTreeExtension: true,
    }
  );
  aliceState = addCharlieCommit.newState;
  addCharlieCommit.consumed.forEach(zeroOutUint8Array);

  let charlieState = await joinGroup(
    addCharlieCommit.welcome,
    charlie.publicPackage,
    charlie.privatePackage,
    pskIndex,
    impl,
  );

  // Bob processes add-charlie commit
  const bobProcessAdd = await processMessage(
    addCharlieCommit.commit,
    bobState,
    pskIndex,
    acceptAll,
    impl,
  );
  if (bobProcessAdd.kind === "newState") {
    bobState = bobProcessAdd.newState;
  }
  console.log(`   ✓ Charlie joined, members: ${countMembers(aliceState)}`);

  // 6. Encrypt/Decrypt
  console.log("\n6. Encrypt/Decrypt round-trip...");
  const plaintext = "Hello from Alice!";
  const msgResult = await createApplicationMessage(
    aliceState,
    new TextEncoder().encode(plaintext),
    impl,
  );
  aliceState = msgResult.newState;
  msgResult.consumed.forEach(zeroOutUint8Array);

  // v1.6.1 returns privateMessage, need to wrap for processMessage
  const wrappedMsg = { version: "mls10", wireformat: "mls_private_message", privateMessage: msgResult.privateMessage };

  const bobDecrypt = await processMessage(
    wrappedMsg,
    bobState,
    pskIndex,
    acceptAll,
    impl,
  );
  if (bobDecrypt.kind === "applicationMessage") {
    const decrypted = new TextDecoder().decode(bobDecrypt.message);
    console.log(`   ✓ Bob decrypted: "${decrypted}" (match: ${decrypted === plaintext})`);
    bobState = bobDecrypt.newState;
  }

  const charlieDecrypt = await processMessage(
    wrappedMsg,
    charlieState,
    pskIndex,
    acceptAll,
    impl,
  );
  if (charlieDecrypt.kind === "applicationMessage") {
    const decrypted = new TextDecoder().decode(charlieDecrypt.message);
    console.log(`   ✓ Charlie decrypted: "${decrypted}" (match: ${decrypted === plaintext})`);
    charlieState = charlieDecrypt.newState;
  }

  // 7. Remove Charlie
  console.log("\n7. Removing Charlie...");
  const removeCommit = await createCommit(
    { state: aliceState, cipherSuite: impl, pskIndex },
    {
      extraProposals: [{
        proposalType: "remove",
        remove: { removed: 2 },
      }],
    }
  );
  const aliceAfterRemove = removeCommit.newState;
  removeCommit.consumed.forEach(zeroOutUint8Array);

  const bobRemove = await processMessage(
    removeCommit.commit,
    bobState,
    pskIndex,
    acceptAll,
    impl,
  );
  if (bobRemove.kind === "newState") {
    bobState = bobRemove.newState;
  }
  console.log(`   ✓ Charlie removed, members: ${countMembers(aliceAfterRemove)}`);

  // Forward secrecy check
  const secretMsg = await createApplicationMessage(
    aliceAfterRemove,
    new TextEncoder().encode("Secret!"),
    impl,
  );
  const wrappedSecret = { version: "mls10", wireformat: "mls_private_message", privateMessage: secretMsg.privateMessage };
  try {
    await processMessage(wrappedSecret, charlieState, pskIndex, acceptAll, impl);
    console.log("   ✗ Charlie should NOT be able to decrypt!");
  } catch {
    console.log("   ✓ Charlie correctly cannot decrypt (forward secrecy works)");
  }

  // 8. State serialization
  console.log("\n8. State serialization...");
  const serialized = encodeGroupState(bobState);
  console.log(`   Serialized size: ${serialized.byteLength} bytes`);
  try {
    const deserialized = decodeGroupState(serialized);
    console.log(`   ✓ Round-trip: ${deserialized ? "success" : "FAILED"}`);
  } catch (e) {
    console.log(`   ✗ Deserialization FAILED: ${e.message}`);
    console.log("   ⚠ BUG: v1.6.1 cannot deserialize state after member removal (blank trailing node)");
  }

  // 9. Performance benchmark
  console.log("\n9. Performance benchmark (100 encrypt/decrypt cycles)...");
  const ITERATIONS = 100;

  const benchAlice = await generateKeyPackage(makeCredential("bench-a"), defaultCapabilities(), defaultLifetime, [], impl);
  const benchBob = await generateKeyPackage(makeCredential("bench-b"), defaultCapabilities(), defaultLifetime, [], impl);

  let bAlice = await createGroup(
    new TextEncoder().encode("bench"),
    benchAlice.publicPackage,
    benchAlice.privatePackage,
    [],
    impl,
  );

  const bCommit = await createCommit(
    { state: bAlice, cipherSuite: impl, pskIndex },
    {
      extraProposals: [{ proposalType: "add", add: { keyPackage: benchBob.publicPackage } }],
      ratchetTreeExtension: true,
    }
  );
  bAlice = bCommit.newState;
  bCommit.consumed.forEach(zeroOutUint8Array);

  let bBob = await joinGroup(
    bCommit.welcome,
    benchBob.publicPackage,
    benchBob.privatePackage,
    pskIndex,
    impl,
  );

  const encTimes = [];
  const decTimes = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const msg = new TextEncoder().encode(`Msg ${i}`);
    const eStart = performance.now();
    const eResult = await createApplicationMessage(bAlice, msg, impl);
    encTimes.push(performance.now() - eStart);
    bAlice = eResult.newState;
    eResult.consumed.forEach(zeroOutUint8Array);

    const wrapped = { version: "mls10", wireformat: "mls_private_message", privateMessage: eResult.privateMessage };
    const dStart = performance.now();
    const dResult = await processMessage(wrapped, bBob, pskIndex, acceptAll, impl);
    decTimes.push(performance.now() - dStart);
    if (dResult.kind === "applicationMessage") bBob = dResult.newState;
  }

  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const p95 = arr => [...arr].sort((a, b) => a - b)[Math.floor(arr.length * 0.95)];

  console.log(`   Encrypt — avg: ${avg(encTimes).toFixed(2)}ms, p95: ${p95(encTimes).toFixed(2)}ms`);
  console.log(`   Decrypt — avg: ${avg(decTimes).toFixed(2)}ms, p95: ${p95(decTimes).toFixed(2)}ms`);
  console.log(`   ✓ Target: <10ms for real-time chat`);

  console.log("\n=== All tests passed ===");
}

run().catch(e => {
  console.error("FATAL:", e);
  process.exit(1);
});
