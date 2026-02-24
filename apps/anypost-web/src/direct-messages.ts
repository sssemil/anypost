const DM_PEERS_STORAGE_KEY = "anypost:dm-peers";
const DM_NAMESPACE = "anypost:dm:v1";

const toHex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

const canonicalPair = (a: string, b: string): readonly [string, string] =>
  a.localeCompare(b) <= 0 ? [a, b] : [b, a];

export const deriveDirectMessageGroupId = async (
  ownPeerId: string,
  otherPeerId: string,
): Promise<string> => {
  const [a, b] = canonicalPair(ownPeerId, otherPeerId);
  const input = new TextEncoder().encode(`${DM_NAMESPACE}:${a}:${b}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  const bytes = new Uint8Array(digest.slice(0, 16));

  // Format as RFC4122 UUID v4-style layout using deterministic bytes.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = toHex(bytes);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
};

export const loadDirectMessagePeers = (): ReadonlyMap<string, string> => {
  try {
    const json = localStorage.getItem(DM_PEERS_STORAGE_KEY);
    if (!json) return new Map();
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return new Map();
    const entries = parsed.filter((entry): entry is [string, string] =>
      Array.isArray(entry) &&
      entry.length === 2 &&
      typeof entry[0] === "string" &&
      typeof entry[1] === "string");
    return new Map(entries);
  } catch {
    return new Map();
  }
};

export const saveDirectMessagePeers = (dmPeers: ReadonlyMap<string, string>) => {
  localStorage.setItem(DM_PEERS_STORAGE_KEY, JSON.stringify([...dmPeers.entries()]));
};
