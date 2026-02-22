import * as Y from "yjs";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { DeviceCertificate } from "../shared/schemas.js";

export type RegisteredDevice = {
  readonly devicePeerId: string;
  readonly accountPublicKey: Uint8Array;
  readonly timestamp: number;
  readonly signature: Uint8Array;
  readonly lastSeen: number;
};

export const createDeviceRegistryDocument = (
  accountPublicKey: Uint8Array,
): Y.Doc =>
  new Y.Doc({ guid: `device-registry:${bytesToHex(accountPublicKey)}` });

type AddDeviceOptions = {
  readonly doc: Y.Doc;
  readonly certificate: DeviceCertificate;
  readonly now?: number;
};

export const addDeviceToRegistry = (options: AddDeviceOptions): void => {
  const { doc, certificate } = options;
  const now = options.now ?? Date.now();
  const devicesMap = doc.getMap("devices");

  if (devicesMap.has(certificate.devicePeerId)) return;

  doc.transact(() => {
    const deviceData = new Y.Map();
    deviceData.set("devicePeerId", certificate.devicePeerId);
    deviceData.set("accountPublicKey", new Uint8Array(certificate.accountPublicKey));
    deviceData.set("timestamp", certificate.timestamp);
    deviceData.set("signature", new Uint8Array(certificate.signature));
    deviceData.set("lastSeen", now);
    devicesMap.set(certificate.devicePeerId, deviceData);
  });
};

type RemoveDeviceOptions = {
  readonly doc: Y.Doc;
  readonly devicePeerId: string;
};

export const removeDeviceFromRegistry = (options: RemoveDeviceOptions): void => {
  const devicesMap = options.doc.getMap("devices");
  devicesMap.delete(options.devicePeerId);
};

export const getRegisteredDevices = (doc: Y.Doc): readonly RegisteredDevice[] => {
  const devicesMap = doc.getMap("devices");
  const devices: RegisteredDevice[] = [];

  devicesMap.forEach((value) => {
    if (!(value instanceof Y.Map)) return;
    devices.push({
      devicePeerId: value.get("devicePeerId") as string,
      accountPublicKey: value.get("accountPublicKey") as Uint8Array,
      timestamp: value.get("timestamp") as number,
      signature: value.get("signature") as Uint8Array,
      lastSeen: value.get("lastSeen") as number,
    });
  });

  return devices;
};

export const isDeviceRegistered = (doc: Y.Doc, devicePeerId: string): boolean => {
  const devicesMap = doc.getMap("devices");
  return devicesMap.has(devicePeerId);
};

type UpdateLastSeenOptions = {
  readonly doc: Y.Doc;
  readonly devicePeerId: string;
  readonly now?: number;
};

export const updateDeviceLastSeen = (options: UpdateLastSeenOptions): void => {
  const devicesMap = options.doc.getMap("devices");
  const device = devicesMap.get(options.devicePeerId);
  if (!(device instanceof Y.Map)) return;

  const now = options.now ?? Date.now();
  device.set("lastSeen", now);
};
