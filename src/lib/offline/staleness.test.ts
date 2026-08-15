import { describe, it, expect } from "vitest";
import { MAX_CACHE_AGE_HOURS, cacheAge, mayShowCached } from "./staleness";
import { offlineNotice } from "./notice";
import { copyFor } from "@/lib/i18n/strings";

/**
 * The safety decision in the offline work, so the cases that matter are the
 * refusals rather than the happy path.
 *
 * A cached map opening with no signal is useful. A six-hour-old pin drawn like
 * a live one is a claim about a street that has almost certainly changed, and
 * somebody may walk into it. Everything below exists so the cutoff and the
 * labelling cannot quietly stop working.
 */

const NOW = new Date("2026-08-15T12:00:00+08:00");

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

describe("cacheAge", () => {
  it("calls very recent data fresh", () => {
    expect(cacheAge(minutesAgo(3), NOW).verdict).toBe("fresh");
  });

  it("calls data ageing well before it refuses it", () => {
    // There is a long middle where the data is still worth showing and worth
    // being warned about. Jumping straight from fine to hidden would either
    // hide useful data or show old data unlabelled.
    expect(cacheAge(minutesAgo(45), NOW).verdict).toBe("ageing");
    expect(cacheAge(minutesAgo(60 * 5), NOW).verdict).toBe("ageing");
  });

  it("refuses data at exactly the cutoff, not merely past it", () => {
    // Boundaries are where this kind of rule fails. Six hours means six hours.
    expect(cacheAge(minutesAgo(MAX_CACHE_AGE_HOURS * 60), NOW).verdict).toBe(
      "too-old",
    );
    expect(cacheAge(minutesAgo(MAX_CACHE_AGE_HOURS * 60 - 1), NOW).verdict).toBe(
      "ageing",
    );
  });

  it("treats undated data as too old, never as fresh", () => {
    // THE ONE THAT MATTERS MOST. The cache cannot vouch for data it cannot
    // date, and defaulting the other way would put flood readings of unknown
    // age on screen as though they were current.
    expect(cacheAge(null, NOW).verdict).toBe("too-old");
    expect(cacheAge("not a date", NOW).verdict).toBe("too-old");
    expect(cacheAge("", NOW).verdict).toBe("too-old");
  });

  it("treats a clock running backwards as now rather than as ancient", () => {
    // A device whose clock is ahead would otherwise produce a negative age.
    // Clamping to zero at least keeps the warning honest.
    expect(cacheAge(minutesAgo(-90), NOW).minutes).toBe(0);
    expect(cacheAge(minutesAgo(-90), NOW).verdict).toBe("fresh");
  });
});

/**
 * Run against BOTH languages, not just the source text.
 *
 * These assertions used to read Tagalog out of `cacheAge().notice`. Once the
 * product carried English too, testing only the Tagalog would have left the
 * likelier failure untested: an English sentence that reads well and has
 * quietly lost the number, so an English reader is told the map is offline and
 * never told it is two hours stale.
 */
describe.each([
  ["tl", copyFor("tl").map],
  ["en", copyFor("en").map],
] as const)("what the reader is told (%s)", (_lang, copy) => {
  const noticeAt = (minutes: number) =>
    offlineNotice(cacheAge(minutesAgo(minutes), NOW), copy);

  it("always states the age, never merely that it is offline", () => {
    // "Offline mode" says the network is down. It does not say the pin under
    // their thumb is two hours old, and that is the fact deciding whether
    // somebody walks down a street.
    expect(noticeAt(35)).toMatch(/\b35\b/);
    expect(noticeAt(60 * 3 + 10)).toMatch(/\b3\b/);
  });

  it("says something for every verdict", () => {
    for (const at of [minutesAgo(1), minutesAgo(90), minutesAgo(60 * 9), null]) {
      expect(offlineNotice(cacheAge(at, NOW), copy).length).toBeGreaterThan(0);
    }
  });

  it("distinguishes 'too old' from 'we cannot date this'", () => {
    // Both refuse to draw anything, and they are still not the same sentence.
    const tooOld = offlineNotice(cacheAge(minutesAgo(60 * 8), NOW), copy);
    const undated = offlineNotice(cacheAge(null, NOW), copy);
    expect(tooOld).not.toBe(undated);
  });

  it("tells a refused reader the data may no longer be true", () => {
    // Not merely "unavailable". The reason matters: what we have describes a
    // street from hours ago, and the depth may have changed since.
    expect(noticeAt(60 * 8)).toBe(copy.cachedTooOld);
    expect(copy.cachedTooOld).toMatch(/iba na ang lalim|different depth/i);
  });

  it("never claims the data is current", () => {
    for (const minutes of [1, 120, 60 * 7]) {
      expect(noticeAt(minutes)).not.toMatch(
        /ngayong oras|live|kasalukuyan|up to date|current/i,
      );
    }
  });
});

describe("mayShowCached", () => {
  it("permits fresh and ageing data", () => {
    expect(mayShowCached(cacheAge(minutesAgo(2), NOW))).toBe(true);
    expect(mayShowCached(cacheAge(minutesAgo(240), NOW))).toBe(true);
  });

  it("refuses anything too old or undated", () => {
    expect(mayShowCached(cacheAge(minutesAgo(60 * 7), NOW))).toBe(false);
    expect(mayShowCached(cacheAge(null, NOW))).toBe(false);
  });
});
