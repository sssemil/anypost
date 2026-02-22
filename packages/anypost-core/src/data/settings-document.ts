import * as Y from "yjs";
import { bytesToHex } from "@noble/hashes/utils.js";
import { UserProfileSchema } from "../shared/schemas.js";

export const createSettingsDocument = (
  accountPublicKey: Uint8Array,
): Y.Doc =>
  new Y.Doc({ guid: `settings:${bytesToHex(accountPublicKey)}` });

export const setDisplayName = (
  doc: Y.Doc,
  displayName: string,
): void => {
  const profileMap = doc.getMap("profile");
  profileMap.set("displayName", displayName);
};

export const getDisplayName = (doc: Y.Doc): string | null => {
  const profileMap = doc.getMap("profile");
  if (profileMap.size === 0) return null;

  const raw = Object.fromEntries(profileMap.entries());
  const result = UserProfileSchema.safeParse(raw);
  return result.success ? result.data.displayName : null;
};

export const formatUserDisplay = (
  displayName: string,
  accountPublicKey: Uint8Array,
): string => {
  const hex = bytesToHex(accountPublicKey);
  const suffix = hex.slice(-8);
  return `${displayName} (..${suffix})`;
};
