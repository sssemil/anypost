import { createLibp2p } from "libp2p";
import type { Libp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { webSockets } from "@libp2p/websockets";
import { circuitRelayServer } from "@libp2p/circuit-relay-v2";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { identify } from "@libp2p/identify";

type CreateRelayNodeOptions = {
  readonly listenAddresses?: readonly string[];
};

const DEFAULT_LISTEN_ADDRESSES = [
  "/ip4/0.0.0.0/tcp/0",
  "/ip4/0.0.0.0/tcp/0/ws",
] as const;

export const createRelayNode = async (
  options: CreateRelayNodeOptions = {},
): Promise<Libp2p> => {
  const { listenAddresses = DEFAULT_LISTEN_ADDRESSES } = options;

  return createLibp2p({
    addresses: {
      listen: [...listenAddresses],
    },
    transports: [tcp(), webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub(),
      relay: circuitRelayServer(),
    },
  });
};
