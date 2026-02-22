export const DEFAULT_MESH_D = 6;
export const DEFAULT_MESH_D_LOW = 4;
export const DEFAULT_MESH_D_HIGH = 12;
export const DEFAULT_MESH_D_LAZY = 6;
export const FLOODSUB_PEER_THRESHOLD = 6;

type ScoreThresholds = {
  readonly gossipThreshold: number;
  readonly publishThreshold: number;
  readonly graylistThreshold: number;
};

type GossipSubParams = {
  readonly D: number;
  readonly Dlo: number;
  readonly Dhi: number;
  readonly Dlazy: number;
  readonly scoreThresholds: ScoreThresholds;
};

type CreateGossipSubParamsOptions = {
  readonly D?: number;
  readonly Dlo?: number;
  readonly Dhi?: number;
  readonly Dlazy?: number;
};

export const createOpaqueTopicName = async (
  purpose: string,
  id: string,
  salt: string,
): Promise<string> => {
  const data = new TextEncoder().encode(`${purpose}:${id}:${salt}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray, (b) => b.toString(16).padStart(2, "0")).join("");
};

export const shouldUseFloodSub = (peerCount: number): boolean =>
  peerCount < FLOODSUB_PEER_THRESHOLD;

const validatePositiveFinite = (name: string, value: number): void => {
  if (!Number.isFinite(value) || value < 1) {
    throw new RangeError(
      `${name} must be a positive finite integer, got ${value}`,
    );
  }
};

export const createGossipSubParams = (
  options?: CreateGossipSubParamsOptions,
): GossipSubParams => {
  const D = options?.D ?? DEFAULT_MESH_D;
  const Dlo = options?.Dlo ?? DEFAULT_MESH_D_LOW;
  const Dhi = options?.Dhi ?? DEFAULT_MESH_D_HIGH;
  const Dlazy = options?.Dlazy ?? DEFAULT_MESH_D_LAZY;

  validatePositiveFinite("D", D);
  validatePositiveFinite("Dlo", Dlo);
  validatePositiveFinite("Dhi", Dhi);
  validatePositiveFinite("Dlazy", Dlazy);

  if (Dlo > D) {
    throw new RangeError(`Dlo (${Dlo}) must be <= D (${D})`);
  }
  if (Dhi < D) {
    throw new RangeError(`Dhi (${Dhi}) must be >= D (${D})`);
  }

  return {
    D,
    Dlo,
    Dhi,
    Dlazy,
    scoreThresholds: {
      gossipThreshold: -100,
      publishThreshold: -1000,
      graylistThreshold: -10_000,
    },
  };
};
