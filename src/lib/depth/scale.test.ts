import { describe, it, expect } from "vitest";
import {
  DEPTH_LEVELS,
  depthRank,
  isDeeperThan,
  depthRangeCm,
  depthLabel,
  isDepthLevel,
} from "./scale";

describe("depth scale", () => {
  it("orders levels from shallowest to deepest", () => {
    expect(DEPTH_LEVELS).toEqual([
      "ankle",
      "knee",
      "waist",
      "chest",
      "above_head",
    ]);
  });

  it("ranks deeper levels higher", () => {
    expect(depthRank("ankle")).toBe(0);
    expect(depthRank("above_head")).toBe(4);
  });

  it("compares two levels", () => {
    expect(isDeeperThan("chest", "knee")).toBe(true);
    expect(isDeeperThan("knee", "chest")).toBe(false);
    expect(isDeeperThan("knee", "knee")).toBe(false);
  });

  it("gives an approximate centimeter range for each level", () => {
    expect(depthRangeCm("ankle")).toEqual({ minCm: 0, maxCm: 15 });
    expect(depthRangeCm("waist")).toEqual({ minCm: 51, maxCm: 100 });
  });

  it("has no upper bound for above_head", () => {
    expect(depthRangeCm("above_head")).toEqual({ minCm: 141, maxCm: null });
  });

  it("provides Filipino and English labels", () => {
    expect(depthLabel("knee")).toEqual({
      tl: "Hanggang tuhod",
      en: "Knee-deep",
    });
  });

  it("recognises valid level strings", () => {
    expect(isDepthLevel("waist")).toBe(true);
    expect(isDepthLevel("shoulder")).toBe(false);
    expect(isDepthLevel("")).toBe(false);
  });
});
