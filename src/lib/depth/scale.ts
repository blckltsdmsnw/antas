export const DEPTH_LEVELS = [
  "ankle",
  "knee",
  "waist",
  "chest",
  "above_head",
] as const;

export type DepthLevel = (typeof DEPTH_LEVELS)[number];

export interface DepthRange {
  minCm: number;
  maxCm: number | null;
}

const RANGES: Readonly<Record<DepthLevel, DepthRange>> = Object.freeze({
  ankle: Object.freeze({ minCm: 0, maxCm: 15 }),
  knee: Object.freeze({ minCm: 16, maxCm: 50 }),
  waist: Object.freeze({ minCm: 51, maxCm: 100 }),
  chest: Object.freeze({ minCm: 101, maxCm: 140 }),
  above_head: Object.freeze({ minCm: 141, maxCm: null }),
});

const LABELS: Readonly<Record<DepthLevel, { tl: string; en: string }>> =
  Object.freeze({
    ankle: Object.freeze({ tl: "Hanggang bukong-bukong", en: "Ankle-deep" }),
    knee: Object.freeze({ tl: "Hanggang tuhod", en: "Knee-deep" }),
    waist: Object.freeze({ tl: "Hanggang baywang", en: "Waist-deep" }),
    chest: Object.freeze({ tl: "Hanggang dibdib", en: "Chest-deep" }),
    above_head: Object.freeze({ tl: "Lampas ulo", en: "Above the head" }),
  });

export function isDepthLevel(value: string): value is DepthLevel {
  return (DEPTH_LEVELS as readonly string[]).includes(value);
}

export function depthRank(level: DepthLevel): number {
  return DEPTH_LEVELS.indexOf(level);
}

export function isDeeperThan(a: DepthLevel, b: DepthLevel): boolean {
  return depthRank(a) > depthRank(b);
}

export function depthRangeCm(level: DepthLevel): Readonly<DepthRange> {
  return RANGES[level];
}

export function depthLabel(
  level: DepthLevel,
): Readonly<{ tl: string; en: string }> {
  return LABELS[level];
}
