/**
 * Which language the interface is in.
 *
 * Filipino-first, and that is not a default that happens to be first in an
 * array - it is the product. Antas is read in Marikina and Taguig, and the
 * English is here for the people who find Tagalog harder, not the other way
 * round. So `tl` is what an unset cookie means, everywhere, forever.
 */
export type Lang = "tl" | "en";

export const LANGS: readonly Lang[] = ["tl", "en"];

export const DEFAULT_LANG: Lang = "tl";

/**
 * Carried in a cookie rather than `localStorage`.
 *
 * The server has to know the language before it renders a single word, or the
 * page arrives in Tagalog and is corrected to English a frame later. This
 * codebase has shipped that exact flash twice already - the go bag's "0 sa 4"
 * and the map stamping `data-map-theme="light"` before consulting the clock -
 * and both times the fix was to stop sending a value the client has to
 * overwrite. `localStorage` cannot be read on the server, so it could only ever
 * produce the third instance.
 */
export const LANG_COOKIE = "antas.lang";

/** A year. The choice is a preference, not a session. */
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Narrows anything - a cookie value, a form field - to a language we ship.
 *
 * Anything unrecognised becomes Tagalog rather than throwing. A malformed
 * cookie must never be able to take down a page somebody is opening in a flood.
 */
export function toLang(value: string | undefined | null): Lang {
  return LANGS.includes(value as Lang) ? (value as Lang) : DEFAULT_LANG;
}

/**
 * What goes in the `lang` attribute of `<html>`.
 *
 * `fil` rather than `tl`: the interface is Filipino, the standardised national
 * language, and that is the tag screen readers and translation tools expect for
 * this text. The cookie keeps the shorter `tl` because it is an internal key.
 */
export function htmlLang(lang: Lang): string {
  return lang === "en" ? "en" : "fil";
}
