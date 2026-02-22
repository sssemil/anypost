import { createHash } from "node:crypto";

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

export const createOpaqueTopicName = (
  purpose: string,
  id: string,
  salt: string,
): string =>
  createHash("sha256").update(`${purpose}:${id}:${salt}`).digest("hex");

export const shouldUseFloodSub = (peerCount: number): boolean =>
  peerCount < FLOODSUB_PEER_THRESHOLD;

export const createGossipSubParams = (
  options?: CreateGossipSubParamsOptions,
): GossipSubParams => ({
  D: options?.D ?? DEFAULT_MESH_D,
  Dlo: options?.Dlo ?? DEFAULT_MESH_D_LOW,
  Dhi: options?.Dhi ?? DEFAULT_MESH_D_HIGH,
  Dlazy: options?.Dlazy ?? DEFAULT_MESH_D_LAZY,
  scoreThresholds: {
    gossipThreshold: -100,
    publishThreshold: -1000,
    graylistThreshold: -10_000,
  },
});
