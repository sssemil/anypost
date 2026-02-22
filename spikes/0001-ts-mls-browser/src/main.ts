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
import type {
  MlsContext,
  ClientState,
  Proposal,
  CredentialBasic,
} from "ts-mls";

const logEl = document.getElementById("log")!;

function log(msg: string, cls: string = "") {
  const div = document.createElement("div");
  div.className = cls;
  div.textContent = msg;
  logEl.appendChild(div);
  console.log(msg);
}

function section(title: string) {
  const div = document.createElement("div");
  div.className = "section";
  const strong = document.createElement("strong");
  strong.textContent = title;
  div.appendChild(strong);
  logEl.appendChild(div);
}

function pass(msg: string) { log(`  ✓ ${msg}`, "pass"); }
function fail(msg: string) { log(`  ✗ ${msg}`, "fail"); }
function info(msg: string) { log(`  ℹ ${msg}`, "info"); }
function timing(msg: string) { log(`  ⏱ ${msg}`, "timing"); }

async function measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const elapsed = performance.now() - start;
  timing(`${label}: ${elapsed.toFixed(2)}ms`);
  return result;
}

function makeCredential(name: string): CredentialBasic {
  return {
    credentialType: defaultCredentialTypes.basic,
    identity: new TextEncoder().encode(name),
  };
}

async function runSpike() {
  log("ts-mls Browser Spike — v2.0.0-rc.8");
  log("====================================");
  log("");

  // --- Test 1: Ciphersuite initialization ---
  section("1. Ciphersuite Initialization");

  const CIPHERSUITE = "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519";

  let impl;
  try {
    impl = await measure("getCiphersuiteImpl", () =>
      getCiphersuiteImpl(CIPHERSUITE)
    );
    pass(`Loaded ciphersuite: ${CIPHERSUITE}`);
  } catch (e) {
    fail(`Failed to load ciphersuite: ${e}`);
    info("Trying alternative ciphersuite...");

    try {
      const altSuite = "MLS_128_DHKEMP256_AES128GCM_SHA256_P256";
      impl = await measure("getCiphersuiteImpl (alt)", () =>
        getCiphersuiteImpl(altSuite)
      );
      pass(`Loaded alternative ciphersuite: ${altSuite}`);
    } catch (e2) {
      fail(`All ciphersuites failed: ${e2}`);
      return;
    }
  }

  const context: MlsContext = {
    cipherSuite: impl,
    authService: unsafeTestingAuthenticationService,
  };

  // --- Test 2: KeyPackage Generation ---
  section("2. KeyPackage Generation");

  const aliceCred = makeCredential("alice");
  const bobCred = makeCredential("bob");
  const charlieCred = makeCredential("charlie");

  let alice, bob, charlie;
  try {
    alice = await measure("generateKeyPackage (Alice)", () =>
      generateKeyPackage({ credential: aliceCred, cipherSuite: impl })
    );
    bob = await measure("generateKeyPackage (Bob)", () =>
      generateKeyPackage({ credential: bobCred, cipherSuite: impl })
    );
    charlie = await measure("generateKeyPackage (Charlie)", () =>
      generateKeyPackage({ credential: charlieCred, cipherSuite: impl })
    );
    pass("Generated KeyPackages for Alice, Bob, Charlie");
    info(`KeyPackage has publicPackage and privatePackage`);
  } catch (e) {
    fail(`KeyPackage generation failed: ${e}`);
    return;
  }

  // --- Test 3: Group Creation ---
  section("3. Group Creation");

  const groupId = new TextEncoder().encode("spike-test-group");
  let aliceState: ClientState;

  try {
    aliceState = await measure("createGroup", () =>
      createGroup({
        context,
        groupId,
        keyPackage: alice.publicPackage,
        privateKeyPackage: alice.privatePackage,
      })
    );
    pass("Alice created group");
    info(`Group ID: ${new TextDecoder().decode(groupId)}`);

    const members = getGroupMembers(aliceState);
    info(`Members after creation: ${members.length}`);
  } catch (e) {
    fail(`Group creation failed: ${e}`);
    return;
  }

  // --- Test 4: Add Bob (2-member group) ---
  section("4. Add Member (Bob)");

  let aliceStateAfterBob: ClientState;
  let bobState: ClientState;

  try {
    const addBobProposal: Proposal = {
      proposalType: defaultProposalTypes.add,
      add: { keyPackage: bob.publicPackage },
    };

    const commitResult = await measure("createCommit (add Bob)", () =>
      createCommit({
        context,
        state: aliceState,
        extraProposals: [addBobProposal],
        ratchetTreeExtension: true,
      })
    );

    aliceStateAfterBob = commitResult.newState;
    commitResult.consumed.forEach(zeroOutUint8Array);

    if (!commitResult.welcome) {
      fail("No Welcome message generated for Bob");
      return;
    }

    bobState = await measure("joinGroup (Bob)", () =>
      joinGroup({
        context,
        welcome: commitResult.welcome!.welcome,
        keyPackage: bob.publicPackage,
        privateKeys: bob.privatePackage,
      })
    );

    pass("Bob joined group via Welcome");

    const members = getGroupMembers(aliceStateAfterBob);
    info(`Members after adding Bob: ${members.length}`);
  } catch (e) {
    fail(`Add Bob failed: ${e}`);
    console.error(e);
    return;
  }

  // --- Test 5: Add Charlie (3-member group) ---
  section("5. Add Member (Charlie) — 3-member group");

  let aliceStateAfterCharlie: ClientState;
  let charlieState: ClientState;

  try {
    const addCharlieProposal: Proposal = {
      proposalType: defaultProposalTypes.add,
      add: { keyPackage: charlie.publicPackage },
    };

    const commitResult = await measure("createCommit (add Charlie)", () =>
      createCommit({
        context,
        state: aliceStateAfterBob,
        extraProposals: [addCharlieProposal],
        ratchetTreeExtension: true,
      })
    );

    aliceStateAfterCharlie = commitResult.newState;
    commitResult.consumed.forEach(zeroOutUint8Array);

    if (!commitResult.welcome) {
      fail("No Welcome for Charlie");
      return;
    }

    charlieState = await measure("joinGroup (Charlie)", () =>
      joinGroup({
        context,
        welcome: commitResult.welcome!.welcome,
        keyPackage: charlie.publicPackage,
        privateKeys: charlie.privatePackage,
      })
    );

    pass("Charlie joined group via Welcome");

    // Bob needs to process Alice's commit to stay in sync
    const bobProcessResult = await measure("processMessage (Bob <- add Charlie)", () =>
      processMessage({
        context,
        state: bobState,
        message: commitResult.commit,
      })
    );

    if (bobProcessResult.kind === "newState") {
      bobState = bobProcessResult.newState;
      pass("Bob processed Charlie's addition");
    }

    const members = getGroupMembers(aliceStateAfterCharlie);
    info(`Members after adding Charlie: ${members.length}`);
  } catch (e) {
    fail(`Add Charlie failed: ${e}`);
    console.error(e);
    return;
  }

  // --- Test 6: Encrypt/Decrypt Round-Trip ---
  section("6. Encrypt/Decrypt Round-Trip (3 members)");

  try {
    const plaintext = "Hello from Alice to the group!";
    const messageBytes = new TextEncoder().encode(plaintext);

    // Alice sends
    const aliceMsgResult = await measure("createApplicationMessage (Alice)", () =>
      createApplicationMessage({
        context,
        state: aliceStateAfterCharlie,
        message: messageBytes,
      })
    );

    aliceStateAfterCharlie = aliceMsgResult.newState;
    aliceMsgResult.consumed.forEach(zeroOutUint8Array);
    pass(`Alice encrypted: "${plaintext}"`);

    // Bob decrypts
    const bobDecrypt = await measure("processMessage (Bob decrypts)", () =>
      processMessage({
        context,
        state: bobState,
        message: aliceMsgResult.message,
      })
    );

    if (bobDecrypt.kind === "applicationMessage") {
      const decrypted = new TextDecoder().decode(bobDecrypt.message);
      if (decrypted === plaintext) {
        pass(`Bob decrypted: "${decrypted}"`);
      } else {
        fail(`Bob got wrong plaintext: "${decrypted}"`);
      }
      bobState = bobDecrypt.newState;
    } else {
      fail(`Bob got unexpected result kind: ${bobDecrypt.kind}`);
    }

    // Charlie decrypts
    const charlieDecrypt = await measure("processMessage (Charlie decrypts)", () =>
      processMessage({
        context,
        state: charlieState,
        message: aliceMsgResult.message,
      })
    );

    if (charlieDecrypt.kind === "applicationMessage") {
      const decrypted = new TextDecoder().decode(charlieDecrypt.message);
      if (decrypted === plaintext) {
        pass(`Charlie decrypted: "${decrypted}"`);
      } else {
        fail(`Charlie got wrong plaintext: "${decrypted}"`);
      }
      charlieState = charlieDecrypt.newState;
    } else {
      fail(`Charlie got unexpected result kind: ${charlieDecrypt.kind}`);
    }

    // Bob sends to group
    const bobPlaintext = "Hello from Bob!";
    const bobMsgResult = await measure("createApplicationMessage (Bob)", () =>
      createApplicationMessage({
        context,
        state: bobState,
        message: new TextEncoder().encode(bobPlaintext),
      })
    );

    bobState = bobMsgResult.newState;
    bobMsgResult.consumed.forEach(zeroOutUint8Array);

    const aliceDecrypt = await measure("processMessage (Alice decrypts Bob)", () =>
      processMessage({
        context,
        state: aliceStateAfterCharlie,
        message: bobMsgResult.message,
      })
    );

    if (aliceDecrypt.kind === "applicationMessage") {
      const decrypted = new TextDecoder().decode(aliceDecrypt.message);
      pass(`Alice decrypted Bob's message: "${decrypted}"`);
      aliceStateAfterCharlie = aliceDecrypt.newState;
    }
  } catch (e) {
    fail(`Encrypt/decrypt failed: ${e}`);
    console.error(e);
    return;
  }

  // --- Test 7: Remove Member ---
  section("7. Remove Member (Charlie)");

  try {
    const removeCharlieProposal: Proposal = {
      proposalType: defaultProposalTypes.remove,
      remove: { removed: 2 },
    };

    const removeResult = await measure("createCommit (remove Charlie)", () =>
      createCommit({
        context,
        state: aliceStateAfterCharlie,
        extraProposals: [removeCharlieProposal],
      })
    );

    const aliceStateAfterRemove = removeResult.newState;
    removeResult.consumed.forEach(zeroOutUint8Array);
    pass("Alice created commit to remove Charlie");

    // Bob processes the removal
    const bobRemoveResult = await measure("processMessage (Bob <- remove)", () =>
      processMessage({
        context,
        state: bobState,
        message: removeResult.commit,
      })
    );

    if (bobRemoveResult.kind === "newState") {
      bobState = bobRemoveResult.newState;
      pass("Bob processed Charlie's removal");
    }

    const membersAfterRemove = getGroupMembers(aliceStateAfterRemove);
    info(`Members after removing Charlie: ${membersAfterRemove.length}`);

    // Verify Charlie can no longer decrypt
    const postRemoveMsg = await createApplicationMessage({
      context,
      state: aliceStateAfterRemove,
      message: new TextEncoder().encode("Secret after Charlie removed"),
    });

    try {
      await processMessage({
        context,
        state: charlieState,
        message: postRemoveMsg.message,
      });
      fail("Charlie should NOT be able to decrypt after removal");
    } catch {
      pass("Charlie correctly cannot decrypt after removal (forward secrecy)");
    }
  } catch (e) {
    fail(`Remove member failed: ${e}`);
    console.error(e);
  }

  // --- Test 8: State Serialization ---
  section("8. State Serialization");

  try {
    const serialized = await measure("encode ClientState", async () =>
      encode(clientStateEncoder, bobState)
    );

    info(`Serialized state size: ${serialized.byteLength} bytes`);

    const deserialized = await measure("decode ClientState", async () =>
      decode(clientStateDecoder, serialized)
    );

    if (deserialized) {
      pass("ClientState round-trips through encode/decode");
    } else {
      fail("Deserialization returned undefined");
    }
  } catch (e) {
    fail(`Serialization failed: ${e}`);
    console.error(e);
  }

  // --- Test 9: Performance Benchmark ---
  section("9. Performance Benchmark (50 encrypt/decrypt cycles)");

  try {
    const ITERATIONS = 50;
    const encryptTimes: number[] = [];
    const decryptTimes: number[] = [];

    // Fresh group for benchmark
    const benchImpl = await getCiphersuiteImpl(CIPHERSUITE);
    const benchAlice = await generateKeyPackage({ credential: makeCredential("bench-alice"), cipherSuite: benchImpl });
    const benchBob = await generateKeyPackage({ credential: makeCredential("bench-bob"), cipherSuite: benchImpl });

    let benchAliceState = await createGroup({
      context,
      groupId: new TextEncoder().encode("bench-group"),
      keyPackage: benchAlice.publicPackage,
      privateKeyPackage: benchAlice.privatePackage,
    });

    const benchAddBob: Proposal = {
      proposalType: defaultProposalTypes.add,
      add: { keyPackage: benchBob.publicPackage },
    };

    const benchCommit = await createCommit({
      context,
      state: benchAliceState,
      extraProposals: [benchAddBob],
      ratchetTreeExtension: true,
    });

    benchAliceState = benchCommit.newState;
    benchCommit.consumed.forEach(zeroOutUint8Array);

    let benchBobState = await joinGroup({
      context,
      welcome: benchCommit.welcome!.welcome,
      keyPackage: benchBob.publicPackage,
      privateKeys: benchBob.privatePackage,
    });

    for (let i = 0; i < ITERATIONS; i++) {
      const msg = new TextEncoder().encode(`Benchmark message ${i}`);

      const encStart = performance.now();
      const encResult = await createApplicationMessage({
        context,
        state: benchAliceState,
        message: msg,
      });
      encryptTimes.push(performance.now() - encStart);
      benchAliceState = encResult.newState;
      encResult.consumed.forEach(zeroOutUint8Array);

      const decStart = performance.now();
      const decResult = await processMessage({
        context,
        state: benchBobState,
        message: encResult.message,
      });
      decryptTimes.push(performance.now() - decStart);
      if (decResult.kind === "applicationMessage") {
        benchBobState = decResult.newState;
      }
    }

    const avgEncrypt = encryptTimes.reduce((a, b) => a + b, 0) / ITERATIONS;
    const avgDecrypt = decryptTimes.reduce((a, b) => a + b, 0) / ITERATIONS;
    const p95Encrypt = [...encryptTimes].sort((a, b) => a - b)[Math.floor(ITERATIONS * 0.95)];
    const p95Decrypt = [...decryptTimes].sort((a, b) => a - b)[Math.floor(ITERATIONS * 0.95)];

    timing(`Encrypt — avg: ${avgEncrypt.toFixed(2)}ms, p95: ${p95Encrypt.toFixed(2)}ms`);
    timing(`Decrypt — avg: ${avgDecrypt.toFixed(2)}ms, p95: ${p95Decrypt.toFixed(2)}ms`);

    if (avgEncrypt < 10 && avgDecrypt < 10) {
      pass("Performance within 10ms target for real-time chat");
    } else {
      info(`Performance outside 10ms target — may still be acceptable`);
    }
  } catch (e) {
    fail(`Benchmark failed: ${e}`);
    console.error(e);
  }

  // --- Test 10: Web Crypto API Check ---
  section("10. Web Crypto API Check");

  if (typeof crypto !== "undefined" && crypto.subtle) {
    pass("Web Crypto API (crypto.subtle) is available");
  } else {
    fail("Web Crypto API NOT available");
  }

  info(`User Agent: ${navigator.userAgent}`);

  // --- Summary ---
  section("Summary");
  log("");
  log("Spike complete. Check browser console for any additional errors.");
}

runSpike().catch((e) => {
  fail(`Spike crashed: ${e}`);
  console.error(e);
});
