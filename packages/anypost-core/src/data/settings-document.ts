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
  UserProfileSchema.shape.displayName.parse(displayName);
  doc.transact(() => {
    const profileMap = doc.getMap("profile");
    profileMap.set("displayName", displayName);
  });
};

export const getDisplayName = (doc: Y.Doc): string | null => {
  const profileMap = doc.getMap("profile");
  if (profileMap.size === 0) return null;

  const raw = Object.fromEntries(profileMap.entries());
  const result = UserProfileSchema.safeParse(raw);
  return result.success ? result.data.displayName : null;
};

type NotificationPreferenceKey = "messages" | "mentions" | "sounds";

type NotificationPreferences = {
  readonly messages: boolean;
  readonly mentions: boolean;
  readonly sounds: boolean;
};

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  messages: true,
  mentions: true,
  sounds: true,
};

export const setNotificationPreference = (
  doc: Y.Doc,
  key: NotificationPreferenceKey,
  value: boolean,
): void => {
  doc.transact(() => {
    const notificationsMap = doc.getMap("notifications");
    notificationsMap.set(key, value);
  });
};

const readBooleanPref = (
  notificationsMap: Y.Map<unknown>,
  key: NotificationPreferenceKey,
): boolean => {
  const raw = notificationsMap.get(key);
  return typeof raw === "boolean" ? raw : DEFAULT_NOTIFICATION_PREFERENCES[key];
};

export const getNotificationPreferences = (
  doc: Y.Doc,
): NotificationPreferences => {
  const notificationsMap = doc.getMap("notifications");
  return {
    messages: readBooleanPref(notificationsMap, "messages"),
    mentions: readBooleanPref(notificationsMap, "mentions"),
    sounds: readBooleanPref(notificationsMap, "sounds"),
  };
};

export const formatUserDisplay = (
  displayName: string,
  accountPublicKey: Uint8Array,
): string => {
  const hex = bytesToHex(accountPublicKey);
  const suffix = hex.slice(-8);
  return `${displayName} (..${suffix})`;
};
