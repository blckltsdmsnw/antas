import { describe, it, expect } from "vitest";
import {
  DEPTH_LEVELS,
  depthRank,
  isDeeperThan,
  depthRangeCm,
  depthLabel,
  isDepthLevel,
  type DepthLevel,
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

  const FIXTURES: {
    level: DepthLevel;
    range: { minCm: number; maxCm: number | null };
    label: { tl: string; en: string };
  }[] = [
    {
      level: "ankle",
      range: { minCm: 0, maxCm: 15 },
      label: { tl: "Hanggang bukong-bukong", en: "Ankle-deep" },
    },
    {
      level: "knee",
      range: { minCm: 16, maxCm: 50 },
      label: { tl: "Hanggang tuhod", en: "Knee-deep" },
    },
    {
      level: "waist",
      range: { minCm: 51, maxCm: 100 },
      label: { tl: "Hanggang baywang", en: "Waist-deep" },
    },
    {
      level: "chest",
      range: { minCm: 101, maxCm: 140 },
      label: { tl: "Hanggang dibdib", en: "Chest-deep" },
    },
    {
      level: "above_head",
      range: { minCm: 141, maxCm: null },
      label: { tl: "Lampas ulo", en: "Above the head" },
    },
  ];

  it.each(FIXTURES)(
    "has the expected range and label for $level",
    ({ level, range, label }) => {
      expect(depthRangeCm(level)).toEqual(range);
      expect(depthLabel(level)).toEqual(label);
      expect(depthLabel(level).tl.length).toBeGreaterThan(0);
      expect(depthLabel(level).en.length).toBeGreaterThan(0);
    },
  );

  it("tiles depth ranges without gaps or overlaps", () => {
    for (let i = 1; i < DEPTH_LEVELS.length; i++) {
      const previous = depthRangeCm(DEPTH_LEVELS[i - 1]);
      const current = depthRangeCm(DEPTH_LEVELS[i]);
      expect(previous.maxCm).not.toBeNull();
      expect(current.minCm).toBe((previous.maxCm as number) + 1);
    }

    DEPTH_LEVELS.forEach((level, index) => {
      const { maxCm } = depthRangeCm(level);
      if (index === DEPTH_LEVELS.length - 1) {
        expect(maxCm).toBeNull();
      } else {
        expect(maxCm).not.toBeNull();
      }
    });
  });

  it("recognises valid level strings", () => {
    expect(isDepthLevel("waist")).toBe(true);
    expect(isDepthLevel("shoulder")).toBe(false);
    expect(isDepthLevel("")).toBe(false);
  });
});
