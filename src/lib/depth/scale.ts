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

const RANGES: Record<DepthLevel, DepthRange> = {
  ankle: { minCm: 0, maxCm: 15 },
  knee: { minCm: 16, maxCm: 50 },
  waist: { minCm: 51, maxCm: 100 },
  chest: { minCm: 101, maxCm: 140 },
  above_head: { minCm: 141, maxCm: null },
};

const LABELS: Record<DepthLevel, { tl: string; en: string }> = {
  ankle: { tl: "Hanggang bukong-bukong", en: "Ankle-deep" },
  knee: { tl: "Hanggang tuhod", en: "Knee-deep" },
  waist: { tl: "Hanggang baywang", en: "Waist-deep" },
  chest: { tl: "Hanggang dibdib", en: "Chest-deep" },
  above_head: { tl: "Lampas ulo", en: "Above the head" },
};

export function isDepthLevel(value: string): value is DepthLevel {
  return (DEPTH_LEVELS as readonly string[]).includes(value);
}

export function depthRank(level: DepthLevel): number {
  return DEPTH_LEVELS.indexOf(level);
}

export function isDeeperThan(a: DepthLevel, b: DepthLevel): boolean {
  return depthRank(a) > depthRank(b);
}

export function depthRangeCm(level: DepthLevel): DepthRange {
  return RANGES[level];
}

export function depthLabel(level: DepthLevel): { tl: string; en: string } {
  return LABELS[level];
}
