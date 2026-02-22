import "./polyfills.js";
import { createRelayNode } from "./create-relay-node.js";

const main = async () => {
  const node = await createRelayNode();

  console.log("Relay node started");
  console.log("PeerId:", node.peerId.toString());

  for (const ma of node.getMultiaddrs()) {
    console.log("Listening on:", ma.toString());
  }

  const shutdown = async () => {
    console.log("\nShutting down...");
    await node.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
};

main().catch((err) => {
  console.error("Failed to start relay node:", err);
  process.exit(1);
});
