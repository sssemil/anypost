import { describe, it, expect } from "vitest";
import {
  createOpaqueTopicName,
  shouldUseFloodSub,
  createGossipSubParams,
  DEFAULT_MESH_D,
  DEFAULT_MESH_D_LOW,
  DEFAULT_MESH_D_HIGH,
  DEFAULT_MESH_D_LAZY,
  FLOODSUB_PEER_THRESHOLD,
} from "./gossipsub-config.js";

describe("Opaque topic names", () => {
  it("should produce a hex string for a group topic", async () => {
    const topic = await createOpaqueTopicName("group", "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "salt123");

    expect(topic).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should produce different topics for different group IDs", async () => {
    const topic1 = await createOpaqueTopicName("group", "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "salt");
    const topic2 = await createOpaqueTopicName("group", "b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22", "salt");

    expect(topic1).not.toBe(topic2);
  });

  it("should produce different topics for different salts", async () => {
    const topic1 = await createOpaqueTopicName("group", "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "salt1");
    const topic2 = await createOpaqueTopicName("group", "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "salt2");

    expect(topic1).not.toBe(topic2);
  });

  it("should produce different topics for different purposes", async () => {
    const groupTopic = await createOpaqueTopicName("group", "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "salt");
    const deviceTopic = await createOpaqueTopicName("device", "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "salt");

    expect(groupTopic).not.toBe(deviceTopic);
  });

  it("should be deterministic for same inputs", async () => {
    const topic1 = await createOpaqueTopicName("group", "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "salt");
    const topic2 = await createOpaqueTopicName("group", "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "salt");

    expect(topic1).toBe(topic2);
  });
});

describe("FloodSub fallback", () => {
  it("should use FloodSub when peer count is below threshold", () => {
    expect(shouldUseFloodSub(3)).toBe(true);
  });

  it("should not use FloodSub when peer count meets threshold", () => {
    expect(shouldUseFloodSub(FLOODSUB_PEER_THRESHOLD)).toBe(false);
  });

  it("should not use FloodSub when peer count exceeds threshold", () => {
    expect(shouldUseFloodSub(10)).toBe(false);
  });

  it("should use FloodSub for zero peers", () => {
    expect(shouldUseFloodSub(0)).toBe(true);
  });
});

describe("createGossipSubParams", () => {
  it("should return default mesh parameters", () => {
    const params = createGossipSubParams();

    expect(params.D).toBe(DEFAULT_MESH_D);
    expect(params.Dlo).toBe(DEFAULT_MESH_D_LOW);
    expect(params.Dhi).toBe(DEFAULT_MESH_D_HIGH);
    expect(params.Dlazy).toBe(DEFAULT_MESH_D_LAZY);
  });

  it("should accept custom mesh parameters", () => {
    const params = createGossipSubParams({ D: 8, Dlo: 5, Dhi: 14, Dlazy: 8 });

    expect(params.D).toBe(8);
    expect(params.Dlo).toBe(5);
    expect(params.Dhi).toBe(14);
    expect(params.Dlazy).toBe(8);
  });

  it("should include peer scoring penalties", () => {
    const params = createGossipSubParams();

    expect(params.scoreThresholds.gossipThreshold).toBeLessThan(0);
    expect(params.scoreThresholds.publishThreshold).toBeLessThan(0);
    expect(params.scoreThresholds.graylistThreshold).toBeLessThan(0);
  });

  it("should have publish threshold stricter than gossip threshold", () => {
    const params = createGossipSubParams();

    expect(params.scoreThresholds.publishThreshold).toBeLessThan(
      params.scoreThresholds.gossipThreshold,
    );
  });

  it("should have graylist threshold stricter than publish threshold", () => {
    const params = createGossipSubParams();

    expect(params.scoreThresholds.graylistThreshold).toBeLessThan(
      params.scoreThresholds.publishThreshold,
    );
  });
});

describe("createGossipSubParams input validation", () => {
  it("should reject Dlo greater than D", () => {
    expect(() => createGossipSubParams({ D: 4, Dlo: 8 })).toThrow(RangeError);
  });

  it("should reject Dhi less than D", () => {
    expect(() => createGossipSubParams({ D: 8, Dhi: 4 })).toThrow(RangeError);
  });

  it("should reject non-positive D", () => {
    expect(() => createGossipSubParams({ D: 0 })).toThrow(RangeError);
  });

  it("should reject NaN D", () => {
    expect(() => createGossipSubParams({ D: NaN })).toThrow(RangeError);
  });

  it("should reject Infinity Dhi", () => {
    expect(() => createGossipSubParams({ Dhi: Infinity })).toThrow(RangeError);
  });
});

describe("defaults", () => {
  it("should have D=6", () => {
    expect(DEFAULT_MESH_D).toBe(6);
  });

  it("should have Dlo=4", () => {
    expect(DEFAULT_MESH_D_LOW).toBe(4);
  });

  it("should have Dhi=12", () => {
    expect(DEFAULT_MESH_D_HIGH).toBe(12);
  });

  it("should have Dlazy=6", () => {
    expect(DEFAULT_MESH_D_LAZY).toBe(6);
  });

  it("should have FloodSub threshold of 6", () => {
    expect(FLOODSUB_PEER_THRESHOLD).toBe(6);
  });
});
