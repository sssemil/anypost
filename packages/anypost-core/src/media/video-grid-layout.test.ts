import { describe, it, expect } from "vitest";
import { getGridLayout } from "./video-grid-layout.js";

describe("Video Grid Layout", () => {
  it("should return 0 columns and 0 rows for 0 participants", () => {
    expect(getGridLayout(0)).toEqual({ columns: 0, rows: 0 });
  });

  it("should return full screen layout for 1 participant", () => {
    expect(getGridLayout(1)).toEqual({ columns: 1, rows: 1 });
  });

  it("should return side-by-side layout for 2 participants", () => {
    expect(getGridLayout(2)).toEqual({ columns: 2, rows: 1 });
  });

  it("should return 2x2 grid for 3 participants", () => {
    expect(getGridLayout(3)).toEqual({ columns: 2, rows: 2 });
  });

  it("should return 2x2 grid for 4 participants", () => {
    expect(getGridLayout(4)).toEqual({ columns: 2, rows: 2 });
  });

  it("should return 3x2 grid for 5 participants", () => {
    expect(getGridLayout(5)).toEqual({ columns: 3, rows: 2 });
  });

  it("should return 3x2 grid for 6 participants", () => {
    expect(getGridLayout(6)).toEqual({ columns: 3, rows: 2 });
  });

  it("should return 3x3 grid for 7 participants", () => {
    expect(getGridLayout(7)).toEqual({ columns: 3, rows: 3 });
  });

  it("should return 3x3 grid for 8 participants", () => {
    expect(getGridLayout(8)).toEqual({ columns: 3, rows: 3 });
  });

  it("should return 0x0 for negative participant count", () => {
    expect(getGridLayout(-1)).toEqual({ columns: 0, rows: 0 });
  });

  it("should return 0x0 for NaN participant count", () => {
    expect(getGridLayout(NaN)).toEqual({ columns: 0, rows: 0 });
  });

  it("should return 0x0 for Infinity participant count", () => {
    expect(getGridLayout(Infinity)).toEqual({ columns: 0, rows: 0 });
  });
});
