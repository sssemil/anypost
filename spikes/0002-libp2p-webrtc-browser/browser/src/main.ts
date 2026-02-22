import { createLibp2p } from "libp2p";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { webSockets } from "@libp2p/websockets";
import { webRTC } from "@libp2p/webrtc";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { dcutr } from "@libp2p/dcutr";
import { identify } from "@libp2p/identify";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { multiaddr } from "@multiformats/multiaddr";
import type { Libp2p } from "libp2p";

const TOPIC = "anypost-spike-test";

const logEl = document.getElementById("log")!;
const peerIdEl = document.getElementById("peer-id")!;
const statusEl = document.getElementById("status")!;
const connCountEl = document.getElementById("conn-count")!;
const addressesEl = document.getElementById("addresses")!;

function log(msg: string, cls: string = "") {
  const div = document.createElement("div");
  div.className = cls;
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
  console.log(msg);
}

function pass(msg: string) { log(`✓ ${msg}`, "pass"); }
function fail(msg: string) { log(`✗ ${msg}`, "fail"); }
function info(msg: string) { log(`ℹ ${msg}`, "info"); }

function setStatus(status: "connected" | "disconnected" | "connecting") {
  statusEl.textContent = status;
  statusEl.className = `status status-${status}`;
}

function updateUI(node: Libp2p) {
  const conns = node.getConnections();
  connCountEl.textContent = String(conns.length);
  addressesEl.textContent = node
    .getMultiaddrs()
    .map((ma) => ma.toString())
    .join("\n") || "(none)";

  if (conns.length > 0) {
    setStatus("connected");
  } else {
    setStatus("disconnected");
  }
}

async function main() {
  log("Creating libp2p node...");
  setStatus("connecting");

  const node = await createLibp2p({
    addresses: {
      listen: [
        "/p2p-circuit",
        "/webrtc",
      ],
    },
    transports: [
      webSockets(),
      webRTC({
        rtcConfiguration: {
          iceServers: [
            { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
          ],
        },
      }),
      circuitRelayTransport({
        discoverRelays: 1,
      }),
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: {
      denyDialMultiaddr: async () => false,
    },
    services: {
      identify: identify(),
      dcutr: dcutr(),
      pubsub: gossipsub({
        allowPublishToZeroTopicPeers: true,
        emitSelf: false,
        runOnLimitedConnection: true,
      }),
    },
  });

  peerIdEl.textContent = node.peerId.toString();
  pass(`Node started: ${node.peerId.toString()}`);
  setStatus("disconnected");

  // Subscribe to GossipSub topic
  node.services.pubsub.subscribe(TOPIC);
  info(`Subscribed to topic: ${TOPIC}`);

  // Listen for GossipSub messages
  node.services.pubsub.addEventListener("message", (evt) => {
    if (evt.detail.topic === TOPIC) {
      const text = new TextDecoder().decode(evt.detail.data);
      const from = evt.detail.from?.toString() ?? "unknown";
      pass(`[GossipSub] From ${from.slice(-8)}: ${text}`);
    }
  });

  // Connection events
  node.addEventListener("peer:connect", (evt) => {
    pass(`Peer connected: ${evt.detail.toString()}`);
    updateUI(node);
  });

  node.addEventListener("peer:disconnect", (evt) => {
    info(`Peer disconnected: ${evt.detail.toString()}`);
    updateUI(node);
  });

  node.addEventListener("self:peer:update", () => {
    info("Addresses updated");
    updateUI(node);
  });

  // UI: Connect to relay
  document.getElementById("btn-connect-relay")!.addEventListener("click", async () => {
    const addr = (document.getElementById("relay-addr") as HTMLInputElement).value.trim();
    if (!addr) {
      fail("Enter a relay multiaddr");
      return;
    }
    try {
      setStatus("connecting");
      info(`Dialing relay: ${addr}`);
      const conn = await node.dial(multiaddr(addr), {
        signal: AbortSignal.timeout(15_000),
      });
      pass(`Connected to relay: ${conn.remotePeer.toString()}`);
      updateUI(node);
    } catch (e) {
      fail(`Failed to connect to relay: ${e}`);
      setStatus("disconnected");
    }
  });

  // UI: Dial peer
  document.getElementById("btn-dial-peer")!.addEventListener("click", async () => {
    const addr = (document.getElementById("peer-addr") as HTMLInputElement).value.trim();
    if (!addr) {
      fail("Enter a peer multiaddr");
      return;
    }
    try {
      info(`Dialing peer: ${addr}`);
      const conn = await node.dial(multiaddr(addr), {
        signal: AbortSignal.timeout(30_000),
      });
      pass(`Connected to peer: ${conn.remotePeer.toString()} via ${conn.remoteAddr.toString()}`);
      updateUI(node);
    } catch (e) {
      fail(`Failed to dial peer: ${e}`);
    }
  });

  // UI: Send GossipSub message
  document.getElementById("btn-send")!.addEventListener("click", async () => {
    const input = document.getElementById("msg-input") as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;

    try {
      await node.services.pubsub.publish(TOPIC, new TextEncoder().encode(text));
      info(`[GossipSub] Sent: ${text}`);
      input.value = "";
    } catch (e) {
      fail(`Failed to send: ${e}`);
    }
  });

  // Enter key to send
  document.getElementById("msg-input")!.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      document.getElementById("btn-send")!.click();
    }
  });

  // Periodic UI update
  setInterval(() => updateUI(node), 2000);

  // Log connection details periodically
  setInterval(() => {
    const conns = node.getConnections();
    if (conns.length > 0) {
      conns.forEach((conn) => {
        const transport = conn.remoteAddr.toString().includes("/webrtc")
          ? "WebRTC"
          : conn.remoteAddr.toString().includes("/ws")
          ? "WebSocket"
          : conn.remoteAddr.toString().includes("/p2p-circuit")
          ? "Circuit Relay"
          : "unknown";
        info(
          `Connection: ${conn.remotePeer.toString().slice(-8)} via ${transport} (${conn.direction})`
        );
      });
    }
  }, 10000);
}

main().catch((e) => {
  fail(`Fatal: ${e}`);
  console.error(e);
});
