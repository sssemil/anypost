import "./polyfill.mjs";
import { createLibp2p } from "libp2p";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { webSockets } from "@libp2p/websockets";
import { circuitRelayServer, circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { identify } from "@libp2p/identify";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";

// Enable debug logging via environment variable pattern
process.env.DEBUG = "libp2p:gossipsub*";

const relay = await createLibp2p({
  addresses: { listen: ["/ip4/127.0.0.1/tcp/0/ws"] },
  transports: [webSockets()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: { identify: identify(), relay: circuitRelayServer({ reservations: { maxReservations: 128 } }) },
});

const relayAddr = relay.getMultiaddrs()[0];
const circuitAddr = relayAddr.toString() + "/p2p-circuit";
const gsOpts = { allowPublishToZeroTopicPeers: true, emitSelf: false, runOnLimitedConnection: true };

const a = await createLibp2p({
  addresses: { listen: [circuitAddr] },
  transports: [webSockets(), circuitRelayTransport()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: { identify: identify(), pubsub: gossipsub(gsOpts) },
});

const b = await createLibp2p({
  addresses: { listen: [circuitAddr] },
  transports: [webSockets(), circuitRelayTransport()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: { identify: identify(), pubsub: gossipsub(gsOpts) },
});

a.services.pubsub.subscribe("test");
b.services.pubsub.subscribe("test");

const aAddr = a.getMultiaddrs().find((ma) => ma.toString().includes("/p2p-circuit"));
await b.dial(aAddr, { signal: AbortSignal.timeout(15000) });
console.log("Connected");

await new Promise((r) => setTimeout(r, 5000));

console.log("A GS peers:", a.services.pubsub.getPeers().length);
console.log("B GS peers:", b.services.pubsub.getPeers().length);
console.log("A streamsOutbound:", a.services.pubsub.streamsOutbound?.size);
console.log("B streamsOutbound:", b.services.pubsub.streamsOutbound?.size);
console.log("A mesh:", a.services.pubsub.getMeshPeers("test").length);

await a.stop();
await b.stop();
await relay.stop();
process.exit(0);
