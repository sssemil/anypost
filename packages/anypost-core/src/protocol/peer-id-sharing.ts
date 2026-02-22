const PEER_ID_MIN_LENGTH = 20;
const SHORT_FORMAT_LENGTH = 16;
const DISPLAY_SUFFIX_LENGTH = 4;
const ED25519_PREFIX = "12D3KooW";
const RSA_PREFIX = "Qm";

export const isValidPeerId = (input: string): boolean => {
  const trimmed = input.trim();
  if (trimmed.length <= PEER_ID_MIN_LENGTH) return false;
  return trimmed.startsWith(ED25519_PREFIX) || trimmed.startsWith(RSA_PREFIX);
};

export const formatPeerIdShort = (peerId: string): string =>
  peerId.length > SHORT_FORMAT_LENGTH
    ? `${peerId.slice(0, SHORT_FORMAT_LENGTH)}...`
    : peerId;

export const formatPeerIdForDisplay = (peerId: string): string =>
  peerId.length > SHORT_FORMAT_LENGTH
    ? `${ED25519_PREFIX}...${peerId.slice(-DISPLAY_SUFFIX_LENGTH)}`
    : peerId;

type BuildCircuitRelayAddressesRequest = {
  readonly targetPeerId: string;
  readonly relayAddresses: readonly string[];
};

export const buildCircuitRelayAddresses = (
  request: BuildCircuitRelayAddressesRequest,
): readonly string[] =>
  request.relayAddresses.map(
    (relayAddr) =>
      `${relayAddr}/p2p-circuit/p2p/${request.targetPeerId}`,
  );
