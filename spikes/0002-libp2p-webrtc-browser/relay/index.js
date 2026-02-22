import "./polyfill.mjs";
import { createLibp2p } from "libp2p";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { webSockets } from "@libp2p/websockets";
import { circuitRelayServer } from "@libp2p/circuit-relay-v2";
import { identify } from "@libp2p/identify";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";

async function main() {
  const node = await createLibp2p({
    addresses: {
      listen: ["/ip4/127.0.0.1/tcp/9001/ws"],
    },
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      relay: circuitRelayServer({
        reservations: {
          maxReservations: 128,
        },
      }),
      pubsub: gossipsub({
        allowPublishToZeroTopicPeers: true,
      }),
    },
  });

  console.log(`Relay started: ${node.peerId.toString()}`);
  console.log("Listening on:");
  node.getMultiaddrs().forEach((ma) => console.log(`  ${ma.toString()}`));

  node.addEventListener("peer:connect", (evt) => {
    console.log(`Peer connected: ${evt.detail.toString()}`);
  });

  node.addEventListener("peer:disconnect", (evt) => {
    console.log(`Peer disconnected: ${evt.detail.toString()}`);
  });

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await node.stop();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
