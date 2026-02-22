import { describe, it, expect } from "vitest";
import {
  isSpeaking,
  SPEAKING_THRESHOLD,
} from "./speaking-detection.js";

describe("Speaking Detection", () => {
  it("should detect silence when audio level is zero", () => {
    expect(isSpeaking(0)).toBe(false);
  });

  it("should detect silence below the threshold", () => {
    expect(isSpeaking(SPEAKING_THRESHOLD - 0.001)).toBe(false);
  });

  it("should detect speaking at the threshold", () => {
    expect(isSpeaking(SPEAKING_THRESHOLD)).toBe(true);
  });

  it("should detect speaking above the threshold", () => {
    expect(isSpeaking(0.5)).toBe(true);
  });

  it("should detect speaking at maximum level", () => {
    expect(isSpeaking(1.0)).toBe(true);
  });
});
