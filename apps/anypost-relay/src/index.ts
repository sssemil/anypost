import "./polyfills.js";
import { createRelayNode } from "./create-relay-node.js";
import { createProviderCid, ANYPOST_RELAY_NAMESPACE } from "anypost-core/protocol";

const RELAY_READVERTISE_INTERVAL_MS = 12 * 60 * 60 * 1000;

const advertiseRelayProvider = async (node: { contentRouting: { provide(cid: unknown): Promise<void> } }) => {
  const relayCid = await createProviderCid(ANYPOST_RELAY_NAMESPACE);
  await node.contentRouting.provide(relayCid);
  console.log("[relay] Advertising as anypost relay provider");
};

const main = async () => {
  const node = await createRelayNode();

  console.log("Relay node started");
  console.log("PeerId:", node.peerId.toString());

  for (const ma of node.getMultiaddrs()) {
    console.log("Listening on:", ma.toString());
  }

  advertiseRelayProvider(node).catch((err: Error) => {
    console.error("[relay] Failed to advertise as provider:", err.message);
  });
  setInterval(() => {
    advertiseRelayProvider(node).catch((err: Error) => {
      console.error("[relay] Failed to re-advertise as provider:", err.message);
    });
  }, RELAY_READVERTISE_INTERVAL_MS);

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
