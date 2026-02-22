import { createLibp2p } from "libp2p";
import type { Libp2p } from "libp2p";
import { webSockets } from "@libp2p/websockets";
import * as wsFilters from "@libp2p/websockets/filters";
import { webRTC } from "@libp2p/webrtc";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { identify } from "@libp2p/identify";
import { dcutr } from "@libp2p/dcutr";
import { bootstrap } from "@libp2p/bootstrap";

type CreateBrowserNodeOptions = {
  readonly bootstrapPeers?: readonly string[];
};

export const createBrowserNode = async (
  options: CreateBrowserNodeOptions = {},
): Promise<Libp2p> => {
  const { bootstrapPeers = [] } = options;

  const peerDiscovery =
    bootstrapPeers.length > 0
      ? [bootstrap({ list: [...bootstrapPeers] })]
      : [];

  return createLibp2p({
    addresses: {
      listen: ["/p2p-circuit", "/webrtc"],
    },
    transports: [
      webSockets({ filter: wsFilters.all }),
      webRTC({
        rtcConfiguration: {
          iceServers: [
            { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
          ],
        },
      }),
      circuitRelayTransport({ discoverRelays: 1 }),
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: {
      denyDialMultiaddr: async () => false,
    },
    peerDiscovery,
    services: {
      identify: identify(),
      pubsub: gossipsub({
        allowPublishToZeroTopicPeers: true,
        runOnLimitedConnection: true,
      }),
      dcutr: dcutr(),
    },
  });
};
