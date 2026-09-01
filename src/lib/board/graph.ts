import { HAZARDS, type HazardType } from "@/lib/hazard/types";

/** What `board_graph()` returns, parsed. */
export interface HourBucket {
  hour: string;
  hazard: HazardType | null;
  count: number;
}

export interface BarangayBucket {
  barangay: string;
  count: number;
}

export interface BoardGraph {
  hours: HourBucket[];
  barangays: BarangayBucket[];
}

/** One bar: an hour, its stacked segments in a fixed order, and the total. */
export interface HourColumn {
  hour: Date;
  total: number;
  segments: { hazard: HazardType | null; count: number }[];
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Colour by hazard, ON THE CHART ONLY.
 *
 * Everywhere else in Antas the icon says what and colour says how bad. A
 * stacked bar cannot carry an icon per segment, so this is the one place a
 * hue means a hazard. Validated with the dataviz skill's checker against the
 * app's white surface: lightness band, chroma floor, adjacent-pair CVD
 * separation, normal-vision floor and contrast all pass for these six in
 * HAZARDS order. Do not reorder HAZARDS without re-running it.
 */
export const HAZARD_CHART_HEX: Readonly<Record<HazardType, string>> = Object.freeze({
  flood: "#0284c7",
  fire: "#ea580c",
  earthquake: "#7c3aed",
  accident: "#ca8a04",
  medical: "#db2777",
  other: "#16a34a",
});

/** An SOS whose sender chose no chip. Deliberately grey: it means "unknown". */
export const UNSPECIFIED_HEX = "#64748b";

export function chartColour(hazard: HazardType | null): string {
  return hazard === null ? UNSPECIFIED_HEX : HAZARD_CHART_HEX[hazard];
}

/** HAZARDS order, then the unspecified bucket last. */
const STACK_ORDER: readonly (HazardType | null)[] = [...HAZARDS, null];

function floorToHour(date: Date): Date {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
}

/**
 * Buckets into a full row of columns, one per hour, gaps filled with zero.
 *
 * The database returns only the hours that had something in them; a chart
 * that draws only those would compress a quiet night into nothing and make
 * two incidents a day apart look adjacent. Every hour is drawn, and an
 * empty one is drawn empty.
 */
export function hourColumns(
  buckets: readonly HourBucket[],
  now: Date = new Date(),
  hours = 48,
): HourColumn[] {
  const end = floorToHour(now).getTime();
  const start = end - (hours - 1) * HOUR_MS;

  const byHour = new Map<number, Map<HazardType | null, number>>();
  for (const b of buckets) {
    const t = floorToHour(new Date(b.hour)).getTime();
    if (Number.isNaN(t) || t < start || t > end) continue;
    const row = byHour.get(t) ?? new Map<HazardType | null, number>();
    row.set(b.hazard, (row.get(b.hazard) ?? 0) + b.count);
    byHour.set(t, row);
  }

  return Array.from({ length: hours }, (_, i) => {
    const t = start + i * HOUR_MS;
    const row = byHour.get(t);
    const segments = STACK_ORDER.flatMap((hazard) => {
      const count = row?.get(hazard) ?? 0;
      return count > 0 ? [{ hazard, count }] : [];
    });
    return {
      hour: new Date(t),
      total: segments.reduce((n, s) => n + s.count, 0),
      segments,
    };
  });
}
