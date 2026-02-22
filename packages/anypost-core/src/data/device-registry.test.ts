import { describe, it, expect } from "vitest";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  createDeviceRegistryDocument,
  addDeviceToRegistry,
  removeDeviceFromRegistry,
  getRegisteredDevices,
  isDeviceRegistered,
  updateDeviceLastSeen,
} from "./device-registry.js";
import {
  generateAccountKey,
  createDeviceCertificate,
} from "../crypto/identity.js";
import type { DeviceCertificate } from "../shared/schemas.js";

const makeCertificate = (
  overrides?: Partial<{
    devicePeerId: string;
    timestamp: number;
  }>,
): { certificate: DeviceCertificate; accountPublicKey: Uint8Array } => {
  const accountKey = generateAccountKey();
  const certificate = createDeviceCertificate({
    accountKey,
    devicePeerId: overrides?.devicePeerId ?? "12D3KooWDevice1",
    timestamp: overrides?.timestamp,
  });
  return { certificate, accountPublicKey: accountKey.publicKey };
};

describe("Device registry", () => {
  describe("document creation", () => {
    it("should create a Yjs doc with account-derived guid", () => {
      const accountKey = generateAccountKey();
      const doc = createDeviceRegistryDocument(accountKey.publicKey);

      expect(doc.guid).toBe(
        `device-registry:${bytesToHex(accountKey.publicKey)}`,
      );
    });
  });

  describe("adding devices", () => {
    it("should add a device with its certificate", () => {
      const { certificate, accountPublicKey } = makeCertificate();
      const doc = createDeviceRegistryDocument(accountPublicKey);

      addDeviceToRegistry({ doc, certificate });

      const devices = getRegisteredDevices(doc);
      expect(devices).toHaveLength(1);
      expect(devices[0].devicePeerId).toBe(certificate.devicePeerId);
    });

    it("should store the certificate data in the registry", () => {
      const { certificate, accountPublicKey } = makeCertificate();
      const doc = createDeviceRegistryDocument(accountPublicKey);

      addDeviceToRegistry({ doc, certificate });

      const devices = getRegisteredDevices(doc);
      expect(devices[0].accountPublicKey).toEqual(certificate.accountPublicKey);
      expect(devices[0].signature).toEqual(certificate.signature);
      expect(devices[0].timestamp).toBe(certificate.timestamp);
    });

    it("should record last-seen time when adding", () => {
      const { certificate, accountPublicKey } = makeCertificate();
      const doc = createDeviceRegistryDocument(accountPublicKey);
      const now = Date.now();

      addDeviceToRegistry({ doc, certificate, now });

      const devices = getRegisteredDevices(doc);
      expect(devices[0].lastSeen).toBe(now);
    });

    it("should not duplicate when adding the same device twice", () => {
      const { certificate, accountPublicKey } = makeCertificate();
      const doc = createDeviceRegistryDocument(accountPublicKey);

      addDeviceToRegistry({ doc, certificate });
      addDeviceToRegistry({ doc, certificate });

      const devices = getRegisteredDevices(doc);
      expect(devices).toHaveLength(1);
    });

    it("should support multiple devices for the same account", () => {
      const accountKey = generateAccountKey();
      const doc = createDeviceRegistryDocument(accountKey.publicKey);

      const cert1 = createDeviceCertificate({
        accountKey,
        devicePeerId: "12D3KooWDevice1",
      });
      const cert2 = createDeviceCertificate({
        accountKey,
        devicePeerId: "12D3KooWDevice2",
      });

      addDeviceToRegistry({ doc, certificate: cert1 });
      addDeviceToRegistry({ doc, certificate: cert2 });

      const devices = getRegisteredDevices(doc);
      expect(devices).toHaveLength(2);
    });
  });

  describe("removing devices", () => {
    it("should remove a device by peer ID", () => {
      const { certificate, accountPublicKey } = makeCertificate();
      const doc = createDeviceRegistryDocument(accountPublicKey);

      addDeviceToRegistry({ doc, certificate });
      removeDeviceFromRegistry({ doc, devicePeerId: certificate.devicePeerId });

      const devices = getRegisteredDevices(doc);
      expect(devices).toHaveLength(0);
    });

    it("should not throw when removing a non-existent device", () => {
      const accountKey = generateAccountKey();
      const doc = createDeviceRegistryDocument(accountKey.publicKey);

      expect(() =>
        removeDeviceFromRegistry({ doc, devicePeerId: "non-existent" }),
      ).not.toThrow();
    });
  });

  describe("querying devices", () => {
    it("should return empty array for fresh registry", () => {
      const accountKey = generateAccountKey();
      const doc = createDeviceRegistryDocument(accountKey.publicKey);

      expect(getRegisteredDevices(doc)).toHaveLength(0);
    });

    it("should check if a device is registered", () => {
      const { certificate, accountPublicKey } = makeCertificate();
      const doc = createDeviceRegistryDocument(accountPublicKey);

      expect(isDeviceRegistered(doc, certificate.devicePeerId)).toBe(false);

      addDeviceToRegistry({ doc, certificate });

      expect(isDeviceRegistered(doc, certificate.devicePeerId)).toBe(true);
    });
  });

  describe("last-seen updates", () => {
    it("should update last-seen for an existing device", () => {
      const { certificate, accountPublicKey } = makeCertificate();
      const doc = createDeviceRegistryDocument(accountPublicKey);
      const initialTime = 1000;
      const laterTime = 2000;

      addDeviceToRegistry({ doc, certificate, now: initialTime });
      updateDeviceLastSeen({ doc, devicePeerId: certificate.devicePeerId, now: laterTime });

      const devices = getRegisteredDevices(doc);
      expect(devices[0].lastSeen).toBe(laterTime);
    });

    it("should not throw when updating last-seen for non-existent device", () => {
      const accountKey = generateAccountKey();
      const doc = createDeviceRegistryDocument(accountKey.publicKey);

      expect(() =>
        updateDeviceLastSeen({ doc, devicePeerId: "non-existent", now: Date.now() }),
      ).not.toThrow();
    });
  });

  describe("CRDT merge", () => {
    it("should merge device registries from two docs", () => {
      const accountKey = generateAccountKey();
      const doc1 = createDeviceRegistryDocument(accountKey.publicKey);
      const doc2 = createDeviceRegistryDocument(accountKey.publicKey);

      const cert1 = createDeviceCertificate({
        accountKey,
        devicePeerId: "12D3KooWDevice1",
      });
      const cert2 = createDeviceCertificate({
        accountKey,
        devicePeerId: "12D3KooWDevice2",
      });

      addDeviceToRegistry({ doc: doc1, certificate: cert1 });
      addDeviceToRegistry({ doc: doc2, certificate: cert2 });

      const update1 = Y.encodeStateAsUpdate(doc1);
      const update2 = Y.encodeStateAsUpdate(doc2);
      Y.applyUpdate(doc1, update2);
      Y.applyUpdate(doc2, update1);

      expect(getRegisteredDevices(doc1)).toHaveLength(2);
      expect(getRegisteredDevices(doc2)).toHaveLength(2);
    });
  });
});

import * as Y from "yjs";
