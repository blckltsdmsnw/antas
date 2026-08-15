import type { Lang } from "./lang";

/**
 * A phrase. Either a fixed string, or a function when the sentence has a number
 * or a name in the middle of it.
 *
 * Interpolation is a function rather than a `{count}` placeholder on purpose.
 * Placeholders let a translation quietly drop the value - "40 minuto na ang
 * nakalipas" becoming "minutes ago" - and on this product that sentence is how
 * somebody learns the pin under their thumb is two hours old. A function
 * signature makes the missing argument a compile error instead.
 */
export type Phrase = string | ((...args: never[]) => string);

/**
 * The English half of a dictionary, derived from the Tagalog half.
 *
 * Every key must be present and every function must take the same arguments.
 * There is deliberately no `Partial` and no fallback: a missing English string
 * is a type error at build time, never a Tagalog sentence shown to somebody who
 * switched to English because they could not read Tagalog.
 *
 * That matters most exactly where it is least visible. If the SOS screen or
 * `lib/sos/progress.ts` could fall back, an English reader in rising water
 * would get the one screen in this product whose wording is load-bearing in a
 * language they have told us they cannot read - and it would look like a
 * working page, not like a bug.
 */
export type Translated<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string;
};

export interface Dict<T> {
  tl: T;
  en: Translated<T>;
}

/**
 * Pairs a Tagalog dictionary with its English counterpart.
 *
 * Tagalog is the first argument because it is the source text: it is written
 * first, and the English is answerable to it.
 */
export function dict<T extends Record<string, Phrase>>(
  tl: T,
  en: Translated<T>,
): Dict<T> {
  return { tl, en };
}

/** Picks one language out of a dictionary. */
export function pick<T extends Record<string, Phrase>>(
  d: Dict<T>,
  lang: Lang,
): Translated<T> {
  // `tl` is the source shape, so it is structurally `Translated<T>` with
  // narrower literal types - safe to widen, and it keeps every consumer reading
  // one type regardless of which language is live.
  return (lang === "en" ? d.en : d.tl) as Translated<T>;
}
