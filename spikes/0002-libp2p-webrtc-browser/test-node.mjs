import "./polyfill.mjs";
import { createLibp2p } from "libp2p";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { webSockets } from "@libp2p/websockets";
import { circuitRelayServer, circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { identify } from "@libp2p/identify";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { multiaddr } from "@multiformats/multiaddr";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log("=== libp2p Node.js Validation (Node-to-Node via Relay) ===\n");

  // 1. Create relay node first
  console.log("1. Starting relay node...");
  const relay = await createLibp2p({
    addresses: { listen: ["/ip4/127.0.0.1/tcp/0/ws"] },
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      relay: circuitRelayServer({ reservations: { maxReservations: 128 } }),
      pubsub: gossipsub({ allowPublishToZeroTopicPeers: true, runOnLimitedConnection: true }),
    },
  });

  const relayAddr = relay.getMultiaddrs()[0];
  const relayCircuitAddr = `${relayAddr.toString()}/p2p-circuit`;
  console.log(`   ✓ Relay started: ${relay.peerId.toString()}`);
  console.log(`   Address: ${relayAddr.toString()}`);

  // 2. Create peers with relay circuit addresses
  console.log("\n2. Starting peers...");
  const gsOpts = { allowPublishToZeroTopicPeers: true, emitSelf: false, runOnLimitedConnection: true };

  const peerA = await createLibp2p({
    addresses: { listen: [relayCircuitAddr] },
    transports: [webSockets(), circuitRelayTransport()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub(gsOpts),
    },
  });
  console.log(`   ✓ Peer A: ${peerA.peerId.toString()}`);

  const peerB = await createLibp2p({
    addresses: { listen: [relayCircuitAddr] },
    transports: [webSockets(), circuitRelayTransport()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub(gsOpts),
    },
  });
  console.log(`   ✓ Peer B: ${peerB.peerId.toString()}`);

  // 3. Connect peers through relay
  console.log("\n3. Connecting Peer B to Peer A through relay...");
  const peerACircuitAddr = peerA.getMultiaddrs().find(a => a.toString().includes("/p2p-circuit"));
  console.log(`   Peer A circuit addr: ${peerACircuitAddr?.toString()}`);

  const conn = await peerB.dial(peerACircuitAddr, { signal: AbortSignal.timeout(15_000) });
  console.log(`   ✓ B connected to A (${conn.direction})`);
  console.log(`   Peer A connections: ${peerA.getConnections().length}`);
  console.log(`   Peer B connections: ${peerB.getConnections().length}`);

  // Wait for identify exchange to complete
  await sleep(2000);

  // 4. Subscribe AFTER connection is established
  console.log("\n4. Subscribing to GossipSub topic...");
  const TOPIC = "spike-test";

  const receivedByA = [];
  const receivedByB = [];

  peerA.services.pubsub.addEventListener("message", (evt) => {
    if (evt.detail.topic === TOPIC) {
      receivedByA.push(new TextDecoder().decode(evt.detail.data));
    }
  });

  peerB.services.pubsub.addEventListener("message", (evt) => {
    if (evt.detail.topic === TOPIC) {
      receivedByB.push(new TextDecoder().decode(evt.detail.data));
    }
  });

  peerA.services.pubsub.subscribe(TOPIC);
  peerB.services.pubsub.subscribe(TOPIC);
  console.log(`   ✓ Both peers subscribed to "${TOPIC}"`);

  // Wait for mesh formation (heartbeat interval is 1s, need several)
  console.log("   Waiting for mesh formation...");
  for (let i = 0; i < 10; i++) {
    await sleep(1000);
    const meshA = peerA.services.pubsub.getMeshPeers(TOPIC);
    const meshB = peerB.services.pubsub.getMeshPeers(TOPIC);
    if (meshA.length > 0 || meshB.length > 0) {
      console.log(`   ✓ Mesh formed after ${i + 1}s (A: ${meshA.length} mesh peers, B: ${meshB.length} mesh peers)`);
      break;
    }
    if (i === 9) {
      console.log(`   ✗ Mesh not formed after 10s`);
      // Debug info
      console.log(`   GS peers A: ${peerA.services.pubsub.getPeers().length}`);
      console.log(`   GS peers B: ${peerB.services.pubsub.getPeers().length}`);
      console.log(`   Topics A: ${peerA.services.pubsub.getTopics()}`);
      console.log(`   Topics B: ${peerB.services.pubsub.getTopics()}`);
      const subsA = peerA.services.pubsub.getSubscribers(TOPIC);
      const subsB = peerB.services.pubsub.getSubscribers(TOPIC);
      console.log(`   Subscribers seen by A: ${subsA.length} (${subsA.map(p => p.toString().slice(-8))})`);
      console.log(`   Subscribers seen by B: ${subsB.length} (${subsB.map(p => p.toString().slice(-8))})`);
    }
  }

  // 5. Test messaging
  console.log("\n5. Testing GossipSub messaging...");

  // B sends to A
  await peerB.services.pubsub.publish(TOPIC, new TextEncoder().encode("Hello from B"));
  await sleep(2000);

  if (receivedByA.length > 0) {
    console.log(`   ✓ Peer A received: "${receivedByA[0]}"`);
  } else {
    console.log(`   ✗ Peer A did not receive message`);
  }

  // A sends to B
  await peerA.services.pubsub.publish(TOPIC, new TextEncoder().encode("Hello from A"));
  await sleep(2000);

  if (receivedByB.length > 0) {
    console.log(`   ✓ Peer B received: "${receivedByB[0]}"`);
  } else {
    console.log(`   ✗ Peer B did not receive message`);
  }

  // 6. Connection lifecycle
  console.log("\n6. Testing disconnect/reconnect...");
  console.log(`   Peer A connections: ${peerA.getConnections().length}`);
  console.log(`   Peer B connections: ${peerB.getConnections().length}`);

  const relayConns = peerA.getConnections(relay.peerId);
  if (relayConns.length > 0) {
    await relayConns[0].close();
    console.log("   ✓ Peer A disconnected from relay");
    await sleep(1000);
    console.log(`   Peer A connections after disconnect: ${peerA.getConnections().length}`);

    await peerA.dial(relayAddr, { signal: AbortSignal.timeout(10_000) });
    await sleep(2000);
    console.log(`   ✓ Peer A reconnected (connections: ${peerA.getConnections().length})`);
  }

  // 7. Cleanup
  console.log("\n7. Cleanup...");
  await peerA.stop();
  await peerB.stop();
  await relay.stop();
  console.log("   ✓ All nodes stopped");

  console.log("\n=== Validation complete ===");
}

run().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
