import { describe, it, expect } from "vitest";
import { freshnessOf, freshnessOpacity, FRESHNESS_HOURS } from "./freshness";

const NOW = new Date("2026-08-14T15:40:00+08:00");

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString();
}

describe("freshnessOf", () => {
  it("calls the last hour live", () => {
    expect(freshnessOf(hoursAgo(0), NOW)).toBe("live");
    expect(freshnessOf(hoursAgo(0.9), NOW)).toBe("live");
  });

  it("steps down through the day", () => {
    expect(freshnessOf(hoursAgo(3), NOW)).toBe("recent");
    expect(freshnessOf(hoursAgo(12), NOW)).toBe("old");
  });

  it("calls anything past a day stale", () => {
    // Floodwater recedes in hours. A day-old report describes a street that has
    // almost certainly changed, and the map should stop implying otherwise.
    expect(freshnessOf(hoursAgo(30), NOW)).toBe("stale");
    expect(freshnessOf(hoursAgo(24 * 7), NOW)).toBe("stale");
  });

  it("treats a clock running ahead as live rather than as an error", () => {
    expect(freshnessOf(hoursAgo(-2), NOW)).toBe("live");
  });

  it("puts each boundary in the older tier", () => {
    expect(freshnessOf(hoursAgo(FRESHNESS_HOURS.live), NOW)).toBe("recent");
    expect(freshnessOf(hoursAgo(FRESHNESS_HOURS.recent), NOW)).toBe("old");
    expect(freshnessOf(hoursAgo(FRESHNESS_HOURS.old), NOW)).toBe("stale");
  });
});

describe("freshnessOpacity", () => {
  it("shows a live report at full strength", () => {
    expect(freshnessOpacity("live")).toBe(1);
  });

  it("fades monotonically with age", () => {
    const values = (["live", "recent", "old", "stale"] as const).map(
      freshnessOpacity,
    );
    const sorted = [...values].sort((a, b) => b - a);
    expect(values).toEqual(sorted);
  });

  it("never fades a pin to invisible", () => {
    // A stale report is still a report - it must stay visible and clickable,
    // just visibly older.
    expect(freshnessOpacity("stale")).toBeGreaterThan(0.3);
  });
});
