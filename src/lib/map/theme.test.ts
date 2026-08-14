import { describe, it, expect } from "vitest";
import { mapThemeFor, DAY_START_HOUR, DAY_END_HOUR } from "./theme";

/** An instant at a given Manila wall-clock hour. */
function atHour(hour: number, minute = 0): Date {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return new Date(`2026-08-14T${hh}:${mm}:00+08:00`);
}

describe("mapThemeFor", () => {
  it("is light through the day", () => {
    expect(mapThemeFor(atHour(DAY_START_HOUR))).toBe("light");
    expect(mapThemeFor(atHour(12))).toBe("light");
    expect(mapThemeFor(atHour(DAY_END_HOUR, 0))).toBe("light");
  });

  it("turns dark after the evening boundary", () => {
    expect(mapThemeFor(atHour(DAY_END_HOUR, 1))).toBe("dark");
    expect(mapThemeFor(atHour(22))).toBe("dark");
  });

  it("stays dark through the small hours", () => {
    expect(mapThemeFor(atHour(0, 30))).toBe("dark");
    expect(mapThemeFor(atHour(DAY_START_HOUR - 1, 59))).toBe("dark");
  });

  it("is dark at 4am, whatever the device is set to", () => {
    // The original bug: at 04:15 the map was bright, because a device
    // reporting "light" was read as a deliberate choice and the clock was
    // never consulted.
    expect(mapThemeFor(atHour(4, 15))).toBe("dark");
  });

  it("is light at 1:41pm, whatever the device is set to", () => {
    // The mirror of the 4am bug, and the reason the preference was dropped
    // entirely: a phone left in dark mode - which is most phones - was
    // darkening the map in full daylight, the exact condition the design
    // keeps every other surface light for.
    expect(mapThemeFor(atHour(13, 41))).toBe("light");
  });

  it("reads the hour in Manila, not in the host timezone", () => {
    // 03:00 UTC is 11:00 in Manila - daytime. A phone left on another region's
    // clock must not darken the map over the Philippines at midday.
    expect(mapThemeFor(new Date("2026-08-14T03:00:00Z"))).toBe("light");

    // 13:00 UTC is 21:00 in Manila - night.
    expect(mapThemeFor(new Date("2026-08-14T13:00:00Z"))).toBe("dark");
  });
});
