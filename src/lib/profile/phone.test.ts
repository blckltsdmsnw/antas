import { describe, it, expect } from "vitest";
import { formatPhone, isE164, isValidPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("accepts the three forms people actually write", () => {
    expect(normalizePhone("09171234567")).toBe("+639171234567");
    expect(normalizePhone("639171234567")).toBe("+639171234567");
    expect(normalizePhone("+639171234567")).toBe("+639171234567");
  });

  it("ignores the punctuation people put in phone numbers", () => {
    // Refusing a correct number over a dash would be refusing it at the one
    // moment it matters.
    for (const written of [
      "0917 123 4567",
      "0917-123-4567",
      "+63 917 123 4567",
      "(0917) 123-4567",
      "0917.123.4567",
    ]) {
      expect(normalizePhone(written)).toBe("+639171234567");
    }
  });

  it("accepts a bare mobile number with no prefix at all", () => {
    expect(normalizePhone("9171234567")).toBe("+639171234567");
  });

  it("refuses a landline", () => {
    // Not an oversight. This number is for reaching somebody who may be
    // standing in water; a landline rings in the house they have left.
    expect(normalizePhone("028123456")).toBeNull();
    expect(normalizePhone("+6328123456")).toBeNull();
  });

  it("refuses numbers of the wrong length", () => {
    expect(normalizePhone("0917123456")).toBeNull();
    expect(normalizePhone("091712345678")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });

  it("refuses anything that is not a number", () => {
    expect(normalizePhone("wala po")).toBeNull();
    expect(normalizePhone("0917ABC4567")).toBeNull();
  });

  it("refuses another country's number", () => {
    // +1 and +44 must normalise to nothing rather than being stored and later
    // dialled with a +63 in front of them.
    expect(normalizePhone("+14155550123")).toBeNull();
    expect(normalizePhone("+447700900123")).toBeNull();
  });
});

describe("isValidPhone", () => {
  it("agrees with normalizePhone", () => {
    expect(isValidPhone("0917 123 4567")).toBe(true);
    expect(isValidPhone("028123456")).toBe(false);
  });
});

describe("isE164", () => {
  it("passes only fully normalised numbers", () => {
    // Guards what came back out of the database, which may predate this module.
    expect(isE164("+639171234567")).toBe(true);
    expect(isE164("09171234567")).toBe(false);
    expect(isE164("+63 917 123 4567")).toBe(false);
  });
});

describe("formatPhone", () => {
  it("shows the local form a person would read aloud", () => {
    expect(formatPhone("+639171234567")).toBe("0917 123 4567");
  });

  it("returns anything unrecognised untouched rather than mangling it", () => {
    // A stored value that is not E.164 is a data problem, and silently
    // reformatting it would hide that from the moderator looking at it.
    expect(formatPhone("028123456")).toBe("028123456");
    expect(formatPhone("")).toBe("");
  });

  it("round-trips with normalizePhone", () => {
    const stored = normalizePhone("0917 123 4567")!;
    expect(normalizePhone(formatPhone(stored))).toBe(stored);
  });
});
