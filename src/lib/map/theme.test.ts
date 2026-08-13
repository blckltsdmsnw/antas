import { describe, it, expect } from "vitest";
import { mapThemeFor, DAY_START_HOUR, DAY_END_HOUR } from "./theme";

/** An instant at a given Manila wall-clock hour. */
function atHour(hour: number, minute = 0): Date {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return new Date(`2026-08-14T${hh}:${mm}:00+08:00`);
}

describe("mapThemeFor", () => {
  describe("with no stated preference", () => {
    it("is light through the day", () => {
      expect(mapThemeFor(atHour(DAY_START_HOUR), null)).toBe("light");
      expect(mapThemeFor(atHour(12), null)).toBe("light");
      expect(mapThemeFor(atHour(DAY_END_HOUR, 0), null)).toBe("light");
    });

    it("turns dark after the evening boundary", () => {
      expect(mapThemeFor(atHour(DAY_END_HOUR, 1), null)).toBe("dark");
      expect(mapThemeFor(atHour(22), null)).toBe("dark");
    });

    it("stays dark through the small hours", () => {
      expect(mapThemeFor(atHour(0, 30), null)).toBe("dark");
      expect(mapThemeFor(atHour(DAY_START_HOUR - 1, 59), null)).toBe("dark");
    });
  });

  describe("with a stated preference", () => {
    it("respects a choice of dark during the day", () => {
      // Someone who set their phone to dark meant it, and the clock does not
      // get to overrule them at noon.
      expect(mapThemeFor(atHour(12), true)).toBe("dark");
    });

    it("respects a choice of light at night", () => {
      expect(mapThemeFor(atHour(23), false)).toBe("light");
    });
  });

  it("reads the hour in Manila, not in the host timezone", () => {
    // 03:00 UTC is 11:00 in Manila - daytime. A phone left on another region's
    // clock must not darken the map over the Philippines at midday.
    expect(mapThemeFor(new Date("2026-08-14T03:00:00Z"), null)).toBe("light");

    // 13:00 UTC is 21:00 in Manila - night.
    expect(mapThemeFor(new Date("2026-08-14T13:00:00Z"), null)).toBe("dark");
  });
});
