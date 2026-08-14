/**
 * Philippine mobile numbers, stored one way and shown another.
 *
 * A number reaches a person in a flood only if it is dialable exactly as
 * stored, so everything is normalised to E.164 (+639XXXXXXXXX) on the way in.
 * People type it every other way - 0917, +63 917, 63 917, with spaces, dashes
 * or brackets - and rejecting those would be refusing a correct number over
 * punctuation, at the one moment it matters.
 *
 * MOBILE ONLY, deliberately. Landlines exist, but this number is for reaching
 * somebody who may be standing in water, and a landline reaches a house they
 * have probably left. Refusing one with a clear message beats storing a number
 * that rings in an empty room.
 */

/** E.164 for the Philippines: +63, then a 10-digit mobile starting with 9. */
const E164 = /^\+639\d{9}$/;

/**
 * Strip everything a person might reasonably type around the digits, then read
 * the three forms in use here: 09XXXXXXXXX, 639XXXXXXXXX, +639XXXXXXXXX.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s()\-.]/g, "").replace(/^\+/, "");

  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`;

  return null;
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

/** True only of an already-normalised number, for guarding what was stored. */
export function isE164(value: string): boolean {
  return E164.test(value);
}

/**
 * Back into the shape people read: 0917 123 4567.
 *
 * The local form rather than the E.164 one, because a moderator reads this
 * aloud or copies it onto paper, and `+639171234567` is where transcription
 * errors come from. The `tel:` link still carries the stored E.164 value, so
 * what gets dialled is never what was reformatted for display.
 */
export function formatPhone(value: string): string {
  if (!isE164(value)) return value;

  const local = `0${value.slice(3)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}
