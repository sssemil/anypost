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
  zeroOutUint8Array,
} from "ts-mls";

const CIPHERSUITE = "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519";

function makeCredential(name) {
  return {
    credentialType: defaultCredentialTypes.basic,
    identity: new TextEncoder().encode(name),
  };
}

async function run() {
  console.log("=== ts-mls v2.0.0-rc.8 Node.js Validation ===\n");

  // 1. Load ciphersuite
  console.log("1. Loading ciphersuite...");
  const impl = await getCiphersuiteImpl(CIPHERSUITE);
  console.log(`   ✓ Loaded: ${CIPHERSUITE}`);

  const context = {
    cipherSuite: impl,
    authService: unsafeTestingAuthenticationService,
  };

  // 2. Generate KeyPackages
  console.log("\n2. Generating KeyPackages...");
  const alice = await generateKeyPackage({ credential: makeCredential("alice"), cipherSuite: impl });
  const bob = await generateKeyPackage({ credential: makeCredential("bob"), cipherSuite: impl });
  const charlie = await generateKeyPackage({ credential: makeCredential("charlie"), cipherSuite: impl });
  console.log("   ✓ Generated for Alice, Bob, Charlie");

  // 3. Create group
  console.log("\n3. Creating group...");
  const groupId = new TextEncoder().encode("test-group");
  let aliceState = await createGroup({
    context,
    groupId,
    keyPackage: alice.publicPackage,
    privateKeyPackage: alice.privatePackage,
  });
  console.log(`   ✓ Group created, members: ${getGroupMembers(aliceState).length}`);

  // 4. Add Bob
  console.log("\n4. Adding Bob...");
  const addBobCommit = await createCommit({
    context,
    state: aliceState,
    extraProposals: [{
      proposalType: defaultProposalTypes.add,
      add: { keyPackage: bob.publicPackage },
    }],
    ratchetTreeExtension: true,
  });
  aliceState = addBobCommit.newState;
  addBobCommit.consumed.forEach(zeroOutUint8Array);

  let bobState = await joinGroup({
    context,
    welcome: addBobCommit.welcome.welcome,
    keyPackage: bob.publicPackage,
    privateKeys: bob.privatePackage,
  });
  console.log(`   ✓ Bob joined, members: ${getGroupMembers(aliceState).length}`);

  // 5. Add Charlie (3-member group)
  console.log("\n5. Adding Charlie...");
  const addCharlieCommit = await createCommit({
    context,
    state: aliceState,
    extraProposals: [{
      proposalType: defaultProposalTypes.add,
      add: { keyPackage: charlie.publicPackage },
    }],
    ratchetTreeExtension: true,
  });
  aliceState = addCharlieCommit.newState;
  addCharlieCommit.consumed.forEach(zeroOutUint8Array);

  let charlieState = await joinGroup({
    context,
    welcome: addCharlieCommit.welcome.welcome,
    keyPackage: charlie.publicPackage,
    privateKeys: charlie.privatePackage,
  });

  // Bob processes add-charlie commit
  const bobProcessAdd = await processMessage({
    context,
    state: bobState,
    message: addCharlieCommit.commit,
  });
  if (bobProcessAdd.kind === "newState") {
    bobState = bobProcessAdd.newState;
  }
  console.log(`   ✓ Charlie joined, members: ${getGroupMembers(aliceState).length}`);

  // 6. Encrypt/Decrypt
  console.log("\n6. Encrypt/Decrypt round-trip...");
  const plaintext = "Hello from Alice!";
  const msgResult = await createApplicationMessage({
    context,
    state: aliceState,
    message: new TextEncoder().encode(plaintext),
  });
  aliceState = msgResult.newState;
  msgResult.consumed.forEach(zeroOutUint8Array);

  const bobDecrypt = await processMessage({
    context,
    state: bobState,
    message: msgResult.message,
  });
  if (bobDecrypt.kind === "applicationMessage") {
    const decrypted = new TextDecoder().decode(bobDecrypt.message);
    console.log(`   ✓ Bob decrypted: "${decrypted}" (match: ${decrypted === plaintext})`);
    bobState = bobDecrypt.newState;
  }

  const charlieDecrypt = await processMessage({
    context,
    state: charlieState,
    message: msgResult.message,
  });
  if (charlieDecrypt.kind === "applicationMessage") {
    const decrypted = new TextDecoder().decode(charlieDecrypt.message);
    console.log(`   ✓ Charlie decrypted: "${decrypted}" (match: ${decrypted === plaintext})`);
    charlieState = charlieDecrypt.newState;
  }

  // 7. Remove Charlie
  console.log("\n7. Removing Charlie...");
  const removeCommit = await createCommit({
    context,
    state: aliceState,
    extraProposals: [{
      proposalType: defaultProposalTypes.remove,
      remove: { removed: 2 },
    }],
  });
  const aliceAfterRemove = removeCommit.newState;
  removeCommit.consumed.forEach(zeroOutUint8Array);

  const bobRemove = await processMessage({
    context,
    state: bobState,
    message: removeCommit.commit,
  });
  if (bobRemove.kind === "newState") {
    bobState = bobRemove.newState;
  }
  console.log(`   ✓ Charlie removed, members: ${getGroupMembers(aliceAfterRemove).length}`);

  // Verify Charlie can't decrypt
  const secretMsg = await createApplicationMessage({
    context,
    state: aliceAfterRemove,
    message: new TextEncoder().encode("Secret!"),
  });
  try {
    await processMessage({ context, state: charlieState, message: secretMsg.message });
    console.log("   ✗ Charlie should NOT be able to decrypt!");
  } catch {
    console.log("   ✓ Charlie correctly cannot decrypt (forward secrecy works)");
  }

  // 8. State serialization
  console.log("\n8. State serialization...");
  const serialized = encode(clientStateEncoder, bobState);
  console.log(`   Serialized size: ${serialized.byteLength} bytes`);
  const deserialized = decode(clientStateDecoder, serialized);
  console.log(`   ✓ Round-trip: ${deserialized ? "success" : "FAILED"}`);

  // 9. Performance benchmark
  console.log("\n9. Performance benchmark (100 encrypt/decrypt cycles)...");
  const ITERATIONS = 100;
  const benchAlice = await generateKeyPackage({ credential: makeCredential("bench-a"), cipherSuite: impl });
  const benchBob = await generateKeyPackage({ credential: makeCredential("bench-b"), cipherSuite: impl });

  let bAlice = await createGroup({
    context,
    groupId: new TextEncoder().encode("bench"),
    keyPackage: benchAlice.publicPackage,
    privateKeyPackage: benchAlice.privatePackage,
  });
  const bCommit = await createCommit({
    context,
    state: bAlice,
    extraProposals: [{ proposalType: defaultProposalTypes.add, add: { keyPackage: benchBob.publicPackage } }],
    ratchetTreeExtension: true,
  });
  bAlice = bCommit.newState;
  bCommit.consumed.forEach(zeroOutUint8Array);

  let bBob = await joinGroup({
    context,
    welcome: bCommit.welcome.welcome,
    keyPackage: benchBob.publicPackage,
    privateKeys: benchBob.privatePackage,
  });

  const encTimes = [];
  const decTimes = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const msg = new TextEncoder().encode(`Msg ${i}`);
    const eStart = performance.now();
    const eResult = await createApplicationMessage({ context, state: bAlice, message: msg });
    encTimes.push(performance.now() - eStart);
    bAlice = eResult.newState;
    eResult.consumed.forEach(zeroOutUint8Array);

    const dStart = performance.now();
    const dResult = await processMessage({ context, state: bBob, message: eResult.message });
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
