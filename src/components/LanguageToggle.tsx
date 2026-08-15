"use client";

import { useRouter } from "next/navigation";
import { useCopy, useLang } from "@/lib/i18n/context";
import {
  LANGS,
  LANG_COOKIE,
  LANG_COOKIE_MAX_AGE,
  type Lang,
} from "@/lib/i18n/lang";

/**
 * Filipino / English.
 *
 * A SEGMENTED CONTROL SHOWING BOTH, not a button that toggles. A single button
 * has to be labelled either with the language you are in or the one you would
 * get, and both readings are common - so half of everyone presses it expecting
 * the opposite of what happens. With both visible and one marked current there
 * is nothing left to infer.
 *
 * Each language names ITSELF and is never translated. Somebody stranded in a
 * language they cannot read has to be able to find the way out, and "Ingles" is
 * no help to a person who only reads English. See `shell.ts`.
 *
 * The choice is written to a cookie rather than `localStorage` so the SERVER can
 * read it and render the right words on the first pass. `router.refresh()` then
 * re-renders the server components in place - no reload, no scroll jump, and
 * nothing torn down, which matters on `/sos`, where a reload would discard a
 * photo somebody has already taken.
 */
export function LanguageToggle() {
  const lang = useLang();
  const copy = useCopy();
  const router = useRouter();

  function choose(next: Lang) {
    if (next === lang) return;

    // Lax rather than Strict: somebody following a link into Antas should
    // arrive in the language they chose, and this is a display preference with
    // nothing to protect.
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${LANG_COOKIE_MAX_AGE}; samesite=lax`;
    router.refresh();
  }

  const label = (value: Lang) =>
    value === "en" ? copy.shell.langEnglish : copy.shell.langFilipino;

  return (
    <div className="lang" role="group" aria-label={copy.shell.langLabel}>
      {LANGS.map((value) => (
        <button
          key={value}
          type="button"
          className="lang-option"
          data-active={value === lang}
          // `aria-pressed` rather than `aria-current`: this is a pair of
          // toggles, not navigation, so a screen reader should say which one is
          // on, not which page you are on.
          aria-pressed={value === lang}
          onClick={() => choose(value)}
        >
          {label(value)}
        </button>
      ))}
    </div>
  );
}
