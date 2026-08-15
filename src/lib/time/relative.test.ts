import { describe, it, expect } from "vitest";
import { clockTime, relativeTime, timestampLabel } from "./relative";
import { copyFor } from "@/lib/i18n/strings";

const tl = copyFor("tl").screens;
const en = copyFor("en").screens;

/** Fixed reference point so these never depend on when the suite runs. */
const NOW = new Date("2026-08-14T15:40:00+08:00");

function minutesBefore(n: number): string {
  return new Date(NOW.getTime() - n * 60_000).toISOString();
}

function hoursBefore(n: number): string {
  return minutesBefore(n * 60);
}

describe("relativeTime", () => {
  it("treats the last minute as right now", () => {
    expect(relativeTime(minutesBefore(0), tl, NOW)).toBe("ngayon lang");
    expect(relativeTime(minutesBefore(0.5), tl, NOW)).toBe("ngayon lang");
  });

  it("counts minutes within the hour", () => {
    expect(relativeTime(minutesBefore(1), tl, NOW)).toBe("1 minuto");
    expect(relativeTime(minutesBefore(45), tl, NOW)).toBe("45 minuto");
  });

  it("counts hours within the day", () => {
    expect(relativeTime(hoursBefore(2), tl, NOW)).toBe("2 oras");
    expect(relativeTime(hoursBefore(23), tl, NOW)).toBe("23 oras");
  });

  it("names yesterday rather than counting to it", () => {
    expect(relativeTime(hoursBefore(25), tl, NOW)).toBe("kahapon");
  });

  it("counts days beyond that", () => {
    expect(relativeTime(hoursBefore(24 * 3), tl, NOW)).toBe("3 araw");
  });

  it("falls back to a date once the count stops helping", () => {
    // Past a week, "12 araw" is harder to place than the date itself.
    expect(relativeTime("2026-07-30T09:00:00+08:00", tl, NOW)).toBe("Hul 30");
  });

  it("never invents a future", () => {
    // Clock skew between a phone and the server is normal and must not render
    // as "-3 minuto".
    const ahead = new Date(NOW.getTime() + 5 * 60_000).toISOString();
    expect(relativeTime(ahead, tl, NOW)).toBe("ngayon lang");
  });
});

describe("clockTime", () => {
  it("reads as a wall clock in Philippine time", () => {
    expect(clockTime("2026-08-14T15:40:00+08:00")).toBe("3:40 PM");
  });

  it("uses Manila time regardless of the device timezone", () => {
    // Same instant, written in UTC. A phone set to another timezone must still
    // show the hour the water was actually that deep.
    expect(clockTime("2026-08-14T07:40:00Z")).toBe("3:40 PM");
  });

  it("keeps midnight and noon unambiguous", () => {
    expect(clockTime("2026-08-14T00:05:00+08:00")).toBe("12:05 AM");
    expect(clockTime("2026-08-14T12:00:00+08:00")).toBe("12:00 PM");
  });
});

describe("timestampLabel", () => {
  it("pairs how long ago with the actual time", () => {
    expect(timestampLabel(hoursBefore(2), tl, NOW)).toBe("2 oras · 1:40 PM");

    // English gets the same shape with its own units. The separator and the
    // wall clock are language-independent - a Manila time is a Manila time.
    expect(timestampLabel(hoursBefore(2), en, NOW)).toBe("2 hr · 1:40 PM");
  });

  it("drops the wall clock for something that just happened, in both languages", () => {
    // "ngayon lang · 3:40 PM" spends half a line telling you the current time.
    // This only works because `timestampLabel` compares against the dictionary
    // rather than a hardcoded "ngayon lang" - with a literal, the English path
    // would never match and every fresh report would grow a redundant clock.
    expect(timestampLabel(minutesBefore(0), tl, NOW)).toBe("ngayon lang");
    expect(timestampLabel(minutesBefore(0), en, NOW)).toBe("just now");
  });

  it("drops the redundant clock reading for something just taken", () => {
    expect(timestampLabel(minutesBefore(0), tl, NOW)).toBe("ngayon lang");
  });
});
