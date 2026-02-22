import { describe, it, expect } from "vitest";
import { createInviteLink, parseInviteLink } from "./invite-link.js";

describe("Invite link", () => {
  describe("createInviteLink", () => {
    it("should generate a link with group ID and inviter address", () => {
      const link = createInviteLink({
        baseUrl: "https://anypost.app",
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        inviterAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWTest"],
      });

      expect(link).toContain("https://anypost.app#/invite?");
      expect(link).toContain("groupId=a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
      expect(link).toContain("addr=");
    });

    it("should include multiple inviter addresses", () => {
      const link = createInviteLink({
        baseUrl: "https://anypost.app",
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        inviterAddrs: [
          "/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWTest",
          "/dns4/relay.example.com/tcp/443/wss/p2p/12D3KooWRelay",
        ],
      });

      const parsed = parseInviteLink(link);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.inviterAddrs).toHaveLength(2);
      }
    });

    it("should include pre-shared secret when provided", () => {
      const link = createInviteLink({
        baseUrl: "https://anypost.app",
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        inviterAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWTest"],
        psk: "my-secret-key-123",
      });

      expect(link).toContain("psk=");
    });

    it("should encode payload in URL fragment for privacy", () => {
      const link = createInviteLink({
        baseUrl: "https://anypost.app",
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        inviterAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWTest"],
      });

      const url = new URL(link);
      expect(url.search).toBe("");
      expect(url.hash).toContain("/invite?");
    });
  });

  describe("parseInviteLink", () => {
    it("should parse a valid invite link", () => {
      const result = parseInviteLink(
        "https://anypost.app#/invite?groupId=a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11&addr=%2Fip4%2F127.0.0.1%2Ftcp%2F4001%2Fp2p%2F12D3KooWTest",
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.groupId).toBe(
          "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        );
        expect(result.data.inviterAddrs).toEqual([
          "/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWTest",
        ]);
        expect(result.data.psk).toBeUndefined();
      }
    });

    it("should parse a link with pre-shared secret", () => {
      const link = createInviteLink({
        baseUrl: "https://anypost.app",
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        inviterAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWTest"],
        psk: "secret-key-456",
      });

      const result = parseInviteLink(link);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.psk).toBe("secret-key-456");
      }
    });

    it("should return error for invalid link without invite fragment", () => {
      const result = parseInviteLink("https://anypost.app/some-page");

      expect(result.success).toBe(false);
    });

    it("should return error for link missing group ID", () => {
      const result = parseInviteLink(
        "https://anypost.app#/invite?addr=%2Fip4%2F127.0.0.1",
      );

      expect(result.success).toBe(false);
    });

    it("should return error for link missing addresses", () => {
      const result = parseInviteLink(
        "https://anypost.app#/invite?groupId=a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      );

      expect(result.success).toBe(false);
    });

    it("should round-trip with createInviteLink", () => {
      const original = {
        baseUrl: "https://anypost.app",
        groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        inviterAddrs: [
          "/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWTest",
          "/dns4/relay.example.com/tcp/443/wss/p2p/12D3KooWRelay",
        ],
        psk: "round-trip-secret",
      };

      const link = createInviteLink(original);
      const result = parseInviteLink(link);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.groupId).toBe(original.groupId);
        expect(result.data.inviterAddrs).toEqual(original.inviterAddrs);
        expect(result.data.psk).toBe(original.psk);
      }
    });
  });
});
