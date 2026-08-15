import { describe, expect, test } from "vitest";
import { dict, pick } from "./dict";
import { toLang, htmlLang, DEFAULT_LANG } from "./lang";

/**
 * The guarantee being tested is mostly a compile-time one - a missing English
 * string must not build - which no runtime assertion can observe. What is
 * testable at runtime is that picking a language returns that language and
 * never silently the other, and that a malformed cookie lands on Tagalog rather
 * than throwing on a page somebody is opening in a flood.
 */

const sample = dict(
  {
    heading: "Handa ka ba?",
    age: (minutes: number) => `${minutes} minuto na ang nakalipas`,
  },
  {
    heading: "Are you ready?",
    age: (minutes: number) => `${minutes} minutes ago`,
  },
);

describe("picking a language", () => {
  test("returns the language asked for", () => {
    expect(pick(sample, "tl").heading).toBe("Handa ka ba?");
    expect(pick(sample, "en").heading).toBe("Are you ready?");
  });

  test("carries the number through an interpolated sentence", () => {
    // The failure this guards against is a translation that drops the value and
    // reads "minutes ago" - which on the map is how somebody would fail to
    // learn the pin under their thumb is two hours old.
    expect(pick(sample, "tl").age(40)).toContain("40");
    expect(pick(sample, "en").age(40)).toContain("40");
  });
});

describe("reading the cookie", () => {
  test("accepts the two languages we ship", () => {
    expect(toLang("tl")).toBe("tl");
    expect(toLang("en")).toBe("en");
  });

  test("falls back to Filipino for anything else", () => {
    // Including nothing at all: an unset cookie is the common case, and this is
    // where Filipino-first is actually enforced.
    for (const value of [undefined, null, "", "fil", "es", "TL", "../../etc"]) {
      expect(toLang(value)).toBe(DEFAULT_LANG);
    }
    expect(DEFAULT_LANG).toBe("tl");
  });

  test("tags the document with fil, not tl", () => {
    // `tl` is our internal key; `fil` is what a screen reader expects for this
    // text, and the two must not be confused with each other.
    expect(htmlLang("tl")).toBe("fil");
    expect(htmlLang("en")).toBe("en");
  });
});
