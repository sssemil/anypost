import { describe, it, expect } from "vitest";
import {
  deviceMlsIdentity,
  addDeviceToGroups,
  removeDeviceFromGroups,
} from "./multi-device.js";
import {
  initMlsContext,
  createMlsKeyPackage,
  createMlsGroup,
  joinFromWelcome,
  encryptMessage,
  processReceivedMessage,
  getMemberCount,
} from "./mls-manager.js";
import type { MlsContext, MlsKeyPackageBundle } from "./mls-manager.js";
import { createStewardState, getStewardMembers } from "./steward.js";

const makeGroupId = (name: string): Uint8Array =>
  new TextEncoder().encode(name);

const setupContext = async (): Promise<MlsContext> => initMlsContext();

const setupKeyPackage = async (
  context: MlsContext,
  identity: Uint8Array,
): Promise<MlsKeyPackageBundle> =>
  createMlsKeyPackage({ context, identity });

const setupStewardGroup = async (
  context: MlsContext,
  groupName: string,
  devicePeerId: string,
) => {
  const identity = deviceMlsIdentity(devicePeerId);
  const kp = await setupKeyPackage(context, identity);
  const groupState = await createMlsGroup({
    context,
    groupId: makeGroupId(groupName),
    keyPackage: kp,
  });

  const stewardState = createStewardState({
    context,
    groupState,
    stewardIdentity: identity,
  });

  return { stewardState, identity };
};

describe("Multi-device MLS leaf nodes", () => {
  describe("deviceMlsIdentity", () => {
    it("should produce a Uint8Array from a device peer ID", () => {
      const identity = deviceMlsIdentity("12D3KooWDevice1");

      expect(identity).toBeInstanceOf(Uint8Array);
      expect(identity.length).toBeGreaterThan(0);
    });

    it("should produce consistent identity for the same peer ID", () => {
      const id1 = deviceMlsIdentity("12D3KooWDevice1");
      const id2 = deviceMlsIdentity("12D3KooWDevice1");

      expect(id1).toEqual(id2);
    });

    it("should produce different identities for different peer IDs", () => {
      const id1 = deviceMlsIdentity("12D3KooWDevice1");
      const id2 = deviceMlsIdentity("12D3KooWDevice2");

      expect(id1).not.toEqual(id2);
    });
  });

  describe("adding a device to groups", () => {
    it("should add a new device as a leaf node in a group", async () => {
      const context = await setupContext();
      const { stewardState, identity } = await setupStewardGroup(
        context,
        "group-1",
        "12D3KooWDevice1",
      );

      const newDeviceIdentity = deviceMlsIdentity("12D3KooWDevice2");
      const newDeviceKp = await setupKeyPackage(context, newDeviceIdentity);

      const result = await addDeviceToGroups({
        groups: [
          {
            stewardState,
            newDeviceKeyPackage: newDeviceKp.publicPackage,
          },
        ],
        newDeviceIdentity,
        senderIdentity: identity,
      });

      expect(result.results).toHaveLength(1);
      expect(
        getMemberCount(result.results[0].newStewardState.groupState),
      ).toBe(2);

      const members = getStewardMembers(result.results[0].newStewardState);
      const identities = members.map((m) => m.identity);
      expect(identities).toContainEqual(newDeviceIdentity);
    });

    it("should add a device to multiple groups at once", async () => {
      const context = await setupContext();
      const device1PeerId = "12D3KooWDevice1";
      const group1 = await setupStewardGroup(context, "group-1", device1PeerId);
      const group2 = await setupStewardGroup(context, "group-2", device1PeerId);

      const newDeviceIdentity = deviceMlsIdentity("12D3KooWDevice2");
      const kp1 = await setupKeyPackage(context, newDeviceIdentity);
      const kp2 = await setupKeyPackage(context, newDeviceIdentity);

      const result = await addDeviceToGroups({
        groups: [
          {
            stewardState: group1.stewardState,
            newDeviceKeyPackage: kp1.publicPackage,
          },
          {
            stewardState: group2.stewardState,
            newDeviceKeyPackage: kp2.publicPackage,
          },
        ],
        newDeviceIdentity,
        senderIdentity: group1.identity,
      });

      expect(result.results).toHaveLength(2);
      expect(
        getMemberCount(result.results[0].newStewardState.groupState),
      ).toBe(2);
      expect(
        getMemberCount(result.results[1].newStewardState.groupState),
      ).toBe(2);
    });

    it("should return empty results when adding to zero groups", async () => {
      const result = await addDeviceToGroups({
        groups: [],
        newDeviceIdentity: deviceMlsIdentity("12D3KooWDevice2"),
        senderIdentity: deviceMlsIdentity("12D3KooWDevice1"),
      });

      expect(result.results).toHaveLength(0);
    });

    it("should reject adding a device that is already a group member", async () => {
      const context = await setupContext();
      const { stewardState, identity } = await setupStewardGroup(
        context,
        "group-1",
        "12D3KooWDevice1",
      );

      const device2Identity = deviceMlsIdentity("12D3KooWDevice2");
      const device2Kp = await setupKeyPackage(context, device2Identity);

      const addResult = await addDeviceToGroups({
        groups: [
          {
            stewardState,
            newDeviceKeyPackage: device2Kp.publicPackage,
          },
        ],
        newDeviceIdentity: device2Identity,
        senderIdentity: identity,
      });

      const device2KpAgain = await setupKeyPackage(context, device2Identity);

      await expect(
        addDeviceToGroups({
          groups: [
            {
              stewardState: addResult.results[0].newStewardState,
              newDeviceKeyPackage: device2KpAgain.publicPackage,
            },
          ],
          newDeviceIdentity: device2Identity,
          senderIdentity: identity,
        }),
      ).rejects.toThrow("already a group member");
    });
  });

  describe("multi-device encrypt and decrypt", () => {
    it("both devices should encrypt and decrypt group messages", async () => {
      const context = await setupContext();
      const device1PeerId = "12D3KooWDevice1";
      const device2PeerId = "12D3KooWDevice2";
      const device1Identity = deviceMlsIdentity(device1PeerId);
      const device2Identity = deviceMlsIdentity(device2PeerId);

      const device1Kp = await setupKeyPackage(context, device1Identity);
      const device2Kp = await setupKeyPackage(context, device2Identity);

      const device1Group = await createMlsGroup({
        context,
        groupId: makeGroupId("shared-group"),
        keyPackage: device1Kp,
      });

      const stewardState = createStewardState({
        context,
        groupState: device1Group,
        stewardIdentity: device1Identity,
      });

      const addResult = await addDeviceToGroups({
        groups: [
          {
            stewardState,
            newDeviceKeyPackage: device2Kp.publicPackage,
          },
        ],
        newDeviceIdentity: device2Identity,
        senderIdentity: device1Identity,
      });

      const device2Group = await joinFromWelcome({
        context,
        welcome: addResult.results[0].welcome,
        keyPackage: device2Kp,
      });

      const device1State = addResult.results[0].newStewardState.groupState;

      const plaintext1 = new TextEncoder().encode("hello from device 1");
      const enc1 = await encryptMessage({
        context,
        groupState: device1State,
        plaintext: plaintext1,
      });

      const dec1 = await processReceivedMessage({
        context,
        groupState: device2Group,
        message: enc1.ciphertext,
      });

      expect(dec1.kind).toBe("applicationMessage");
      if (dec1.kind === "applicationMessage") {
        expect(dec1.plaintext).toEqual(plaintext1);
      }

      const plaintext2 = new TextEncoder().encode("hello from device 2");
      const enc2 = await encryptMessage({
        context,
        groupState: dec1.newGroupState,
        plaintext: plaintext2,
      });

      const dec2 = await processReceivedMessage({
        context,
        groupState: enc1.newGroupState,
        message: enc2.ciphertext,
      });

      expect(dec2.kind).toBe("applicationMessage");
      if (dec2.kind === "applicationMessage") {
        expect(dec2.plaintext).toEqual(plaintext2);
      }
    });
  });

  describe("removing a device from groups", () => {
    it("should remove a device from a group", async () => {
      const context = await setupContext();
      const { stewardState, identity } = await setupStewardGroup(
        context,
        "group-1",
        "12D3KooWDevice1",
      );

      const device2Identity = deviceMlsIdentity("12D3KooWDevice2");
      const device2Kp = await setupKeyPackage(context, device2Identity);

      const addResult = await addDeviceToGroups({
        groups: [
          {
            stewardState,
            newDeviceKeyPackage: device2Kp.publicPackage,
          },
        ],
        newDeviceIdentity: device2Identity,
        senderIdentity: identity,
      });

      const removeResult = await removeDeviceFromGroups({
        groups: [addResult.results[0].newStewardState],
        deviceIdentity: device2Identity,
        senderIdentity: identity,
      });

      expect(removeResult.results).toHaveLength(1);
      expect(
        getMemberCount(removeResult.results[0].newStewardState.groupState),
      ).toBe(1);

      const members = getStewardMembers(
        removeResult.results[0].newStewardState,
      );
      const identities = members.map((m) => m.identity);
      expect(identities).not.toContainEqual(device2Identity);
    });

    it("should remove a device from multiple groups", async () => {
      const context = await setupContext();
      const device1PeerId = "12D3KooWDevice1";
      const device2Identity = deviceMlsIdentity("12D3KooWDevice2");

      const group1 = await setupStewardGroup(context, "group-1", device1PeerId);
      const group2 = await setupStewardGroup(context, "group-2", device1PeerId);

      const kp1 = await setupKeyPackage(context, device2Identity);
      const kp2 = await setupKeyPackage(context, device2Identity);

      const addResult = await addDeviceToGroups({
        groups: [
          {
            stewardState: group1.stewardState,
            newDeviceKeyPackage: kp1.publicPackage,
          },
          {
            stewardState: group2.stewardState,
            newDeviceKeyPackage: kp2.publicPackage,
          },
        ],
        newDeviceIdentity: device2Identity,
        senderIdentity: group1.identity,
      });

      const removeResult = await removeDeviceFromGroups({
        groups: addResult.results.map((r) => r.newStewardState),
        deviceIdentity: device2Identity,
        senderIdentity: group1.identity,
      });

      expect(removeResult.results).toHaveLength(2);
      expect(
        getMemberCount(removeResult.results[0].newStewardState.groupState),
      ).toBe(1);
      expect(
        getMemberCount(removeResult.results[1].newStewardState.groupState),
      ).toBe(1);
    });

    it("should return empty results when removing from zero groups", async () => {
      const result = await removeDeviceFromGroups({
        groups: [],
        deviceIdentity: deviceMlsIdentity("12D3KooWDevice2"),
        senderIdentity: deviceMlsIdentity("12D3KooWDevice1"),
      });

      expect(result.results).toHaveLength(0);
    });

    it("removed device should fail to decrypt new messages", async () => {
      const context = await setupContext();
      const device1Identity = deviceMlsIdentity("12D3KooWDevice1");
      const device2Identity = deviceMlsIdentity("12D3KooWDevice2");

      const device1Kp = await setupKeyPackage(context, device1Identity);
      const device2Kp = await setupKeyPackage(context, device2Identity);

      const device1Group = await createMlsGroup({
        context,
        groupId: makeGroupId("test-group"),
        keyPackage: device1Kp,
      });

      const stewardState = createStewardState({
        context,
        groupState: device1Group,
        stewardIdentity: device1Identity,
      });

      const addResult = await addDeviceToGroups({
        groups: [
          {
            stewardState,
            newDeviceKeyPackage: device2Kp.publicPackage,
          },
        ],
        newDeviceIdentity: device2Identity,
        senderIdentity: device1Identity,
      });

      const device2Group = await joinFromWelcome({
        context,
        welcome: addResult.results[0].welcome,
        keyPackage: device2Kp,
      });

      const removeResult = await removeDeviceFromGroups({
        groups: [addResult.results[0].newStewardState],
        deviceIdentity: device2Identity,
        senderIdentity: device1Identity,
      });

      const plaintext = new TextEncoder().encode("secret after removal");
      const encResult = await encryptMessage({
        context,
        groupState: removeResult.results[0].newStewardState.groupState,
        plaintext,
      });

      await expect(
        processReceivedMessage({
          context,
          groupState: device2Group,
          message: encResult.ciphertext,
        }),
      ).rejects.toThrow();
    });
  });
});
