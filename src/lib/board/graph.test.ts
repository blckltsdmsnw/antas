import { describe, it, expect } from "vitest";
import { hourColumns, chartColour, HAZARD_CHART_HEX, UNSPECIFIED_HEX } from "./graph";
import { HAZARDS } from "@/lib/hazard/types";

const NOW = new Date("2026-08-28T10:30:00Z");

describe("hourColumns", () => {
  it("returns one column per hour for the window, ending at the current hour", () => {
    const cols = hourColumns([], NOW, 48);
    expect(cols).toHaveLength(48);
    expect(cols[47].hour.toISOString()).toBe("2026-08-28T10:00:00.000Z");
    expect(cols[0].hour.toISOString()).toBe("2026-08-26T11:00:00.000Z");
    expect(cols.every((c) => c.total === 0 && c.segments.length === 0)).toBe(true);
  });

  it("places a bucket in its hour and stacks hazards in HAZARDS order, unspecified last", () => {
    const cols = hourColumns(
      [
        { hour: "2026-08-28T10:00:00+00:00", hazard: null, count: 1 },
        { hour: "2026-08-28T10:00:00+00:00", hazard: "fire", count: 2 },
        { hour: "2026-08-28T10:00:00+00:00", hazard: "flood", count: 3 },
      ],
      NOW,
      48,
    );
    const last = cols[47];
    expect(last.total).toBe(6);
    expect(last.segments.map((s) => s.hazard)).toEqual(["flood", "fire", null]);
  });

  it("drops a bucket outside the window rather than throwing", () => {
    const cols = hourColumns([{ hour: "2026-08-20T10:00:00+00:00", hazard: "flood", count: 9 }], NOW, 48);
    expect(cols.reduce((n, c) => n + c.total, 0)).toBe(0);
  });
});

describe("chart colours", () => {
  it("gives every hazard its own hue and the unspecified case a neutral", () => {
    const hexes = HAZARDS.map((h) => HAZARD_CHART_HEX[h]);
    expect(new Set(hexes).size).toBe(HAZARDS.length);
    expect(chartColour(null)).toBe(UNSPECIFIED_HEX);
    expect(chartColour("fire")).toBe(HAZARD_CHART_HEX.fire);
  });
});
