import { describe, it, expect } from "vitest";
import {
  isValidPeerId,
  formatPeerIdShort,
  formatPeerIdForDisplay,
  buildCircuitRelayAddresses,
} from "./peer-id-sharing.js";

const VALID_ED25519_PEER_ID =
  "12D3KooWRm656Bq1E2FByEgTDpHXBqS7UJFCyLxR3pnR3pnQ";
const VALID_RSA_PEER_ID =
  "QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb";

describe("isValidPeerId", () => {
  it("should accept a valid Ed25519 peer ID starting with 12D3KooW", () => {
    expect(isValidPeerId(VALID_ED25519_PEER_ID)).toBe(true);
  });

  it("should accept a valid RSA peer ID starting with Qm", () => {
    expect(isValidPeerId(VALID_RSA_PEER_ID)).toBe(true);
  });

  it("should reject an empty string", () => {
    expect(isValidPeerId("")).toBe(false);
  });

  it("should reject a string that is too short", () => {
    expect(isValidPeerId("12D3KooW")).toBe(false);
  });

  it("should reject a string with wrong prefix", () => {
    expect(isValidPeerId("INVALID_abcdefghijklmnopqrstuvwxyz")).toBe(false);
  });

  it("should reject whitespace-only input", () => {
    expect(isValidPeerId("   ")).toBe(false);
  });
});

describe("formatPeerIdShort", () => {
  it("should return first 16 characters followed by ellipsis", () => {
    expect(formatPeerIdShort(VALID_ED25519_PEER_ID)).toBe(
      "12D3KooWRm656Bq1...",
    );
  });

  it("should return full peer ID if shorter than 16 characters", () => {
    expect(formatPeerIdShort("short")).toBe("short");
  });
});

describe("formatPeerIdForDisplay", () => {
  it("should show prefix and last 4 characters separated by ellipsis", () => {
    expect(formatPeerIdForDisplay(VALID_ED25519_PEER_ID)).toBe(
      "12D3KooW...3pnQ",
    );
  });

  it("should return full peer ID if 16 chars or shorter", () => {
    expect(formatPeerIdForDisplay("short")).toBe("short");
  });
});

describe("buildCircuitRelayAddresses", () => {
  it("should build circuit relay address for each relay", () => {
    const result = buildCircuitRelayAddresses({
      targetPeerId: "12D3KooWTarget",
      relayAddresses: [
        "/ip4/1.2.3.4/tcp/9090/ws/p2p/12D3KooWRelay1",
        "/ip4/5.6.7.8/tcp/9090/ws/p2p/12D3KooWRelay2",
      ],
    });

    expect(result).toEqual([
      "/ip4/1.2.3.4/tcp/9090/ws/p2p/12D3KooWRelay1/p2p-circuit/p2p/12D3KooWTarget",
      "/ip4/5.6.7.8/tcp/9090/ws/p2p/12D3KooWRelay2/p2p-circuit/p2p/12D3KooWTarget",
    ]);
  });

  it("should return empty array when no relay addresses provided", () => {
    const result = buildCircuitRelayAddresses({
      targetPeerId: "12D3KooWTarget",
      relayAddresses: [],
    });

    expect(result).toEqual([]);
  });
});
