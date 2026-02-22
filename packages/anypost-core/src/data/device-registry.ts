import * as Y from "yjs";
import { z } from "zod";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { DeviceCertificate } from "../shared/schemas.js";

const RegisteredDeviceSchema = z.object({
  devicePeerId: z.string().min(1),
  accountPublicKey: z.instanceof(Uint8Array),
  timestamp: z.number(),
  signature: z.instanceof(Uint8Array),
  lastSeen: z.number(),
});

export type RegisteredDevice = Readonly<z.infer<typeof RegisteredDeviceSchema>>;

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

  doc.transact(() => {
    const devicesMap = doc.getMap("devices");
    if (devicesMap.has(certificate.devicePeerId)) return;

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
  return Array.from(devicesMap.values())
    .filter((value): value is Y.Map<unknown> => value instanceof Y.Map)
    .map((deviceMap) => {
      const raw = Object.fromEntries(deviceMap.entries());
      return RegisteredDeviceSchema.safeParse(raw);
    })
    .filter((result) => result.success)
    .map((result) => result.data);
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
