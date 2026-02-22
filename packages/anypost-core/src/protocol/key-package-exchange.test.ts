import { describe, it, expect } from "vitest";
import type { Libp2p } from "@libp2p/interface";
import { createLibp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { identify } from "@libp2p/identify";
import {
  createKeyPackageExchangeHandler,
  sendKeyPackage,
} from "./key-package-exchange.js";
import type { KeyPackageOffer } from "./key-package-exchange.js";
import { initMlsContext, createMlsKeyPackage } from "../crypto/mls-manager.js";
import type { KeyPackage } from "ts-mls";
import { createGroup, inviteMember } from "../group-management.js";
import { deviceMlsIdentity } from "../crypto/multi-device.js";
import { getMembers } from "../data/group-document.js";

const createTestNode = async (): Promise<Libp2p> =>
  createLibp2p({
    addresses: { listen: ["/ip4/127.0.0.1/tcp/0"] },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: { identify: identify() },
  });

const TEST_GROUP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

describe("Key-package exchange", () => {
  describe("createKeyPackageExchangeHandler", () => {
    it("should respond with welcome when steward processes key package", async () => {
      const stewardNode = await createTestNode();
      const inviteeNode = await createTestNode();

      try {
        const context = await initMlsContext();
        const stewardIdentity = deviceMlsIdentity("12D3KooWSteward");
        const stewardKp = await createMlsKeyPackage({ context, identity: stewardIdentity });

        const { stewardState, groupDoc } = await createGroup({
          context,
          groupId: TEST_GROUP_ID,
          groupName: "Test Group",
          creatorKeyPackage: stewardKp,
          creatorIdentity: stewardIdentity,
          creatorAccountPublicKey: "ed25519:steward-account",
          creatorPeerId: stewardNode.peerId.toString(),
        });

        let currentStewardState = stewardState;

        const handler = createKeyPackageExchangeHandler({
          node: stewardNode,
          onOffer: async (offer: KeyPackageOffer) => {
            // CBOR decoding returns untyped data — cast at trust boundary
            const result = await inviteMember({
              stewardState: currentStewardState,
              groupDoc,
              inviteeKeyPackage: offer.keyPackage as KeyPackage,
              inviteeIdentity: offer.identity,
              inviteeAccountPublicKey: offer.accountPublicKey,
              senderIdentity: stewardIdentity,
            });
            currentStewardState = result.newStewardState;
            return {
              type: "welcome" as const,
              welcome: result.welcome,
              commit: result.commit,
            };
          },
        });
        handler.start();

        await inviteeNode.dial(stewardNode.getMultiaddrs()[0]);

        const inviteeIdentity = deviceMlsIdentity("12D3KooWInvitee");
        const inviteeKp = await createMlsKeyPackage({ context, identity: inviteeIdentity });

        const response = await sendKeyPackage({
          node: inviteeNode,
          peerId: stewardNode.peerId,
          groupId: TEST_GROUP_ID,
          keyPackage: inviteeKp.publicPackage,
          identity: inviteeIdentity,
          accountPublicKey: "ed25519:invitee-account",
        });

        expect(response.type).toBe("welcome");
        if (response.type === "welcome") {
          expect(response.welcome).toBeDefined();
          expect(response.commit).toBeDefined();
        }

        const members = getMembers(groupDoc);
        expect(members).toHaveLength(2);

        handler.stop();
      } finally {
        await stewardNode.stop();
        await inviteeNode.stop();
      }
    });

    it("should respond with error when handler callback fails", async () => {
      const stewardNode = await createTestNode();
      const inviteeNode = await createTestNode();

      try {
        const handler = createKeyPackageExchangeHandler({
          node: stewardNode,
          onOffer: async () => {
            throw new Error("Group not found");
          },
        });
        handler.start();

        await inviteeNode.dial(stewardNode.getMultiaddrs()[0]);

        const context = await initMlsContext();
        const identity = deviceMlsIdentity("12D3KooWInvitee");
        const kp = await createMlsKeyPackage({ context, identity });

        const response = await sendKeyPackage({
          node: inviteeNode,
          peerId: stewardNode.peerId,
          groupId: TEST_GROUP_ID,
          keyPackage: kp.publicPackage,
          identity,
          accountPublicKey: "ed25519:invitee-account",
        });

        expect(response.type).toBe("error");
        if (response.type === "error") {
          expect(response.message).toContain("Group not found");
        }

        handler.stop();
      } finally {
        await stewardNode.stop();
        await inviteeNode.stop();
      }
    });
  });

  describe("sendKeyPackage", () => {
    it("should throw when not connected to peer", async () => {
      const node = await createTestNode();
      const otherNode = await createTestNode();

      try {
        const context = await initMlsContext();
        const identity = deviceMlsIdentity("12D3KooWInvitee");
        const kp = await createMlsKeyPackage({ context, identity });

        await expect(
          sendKeyPackage({
            node,
            peerId: otherNode.peerId,
            groupId: TEST_GROUP_ID,
            keyPackage: kp.publicPackage,
            identity,
            accountPublicKey: "ed25519:invitee-account",
          }),
        ).rejects.toThrow("Not connected to peer");
      } finally {
        await node.stop();
        await otherNode.stop();
      }
    });
  });
});
