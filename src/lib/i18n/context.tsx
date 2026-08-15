"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LANG, type Lang } from "./lang";
import { copyFor, type Copy } from "./strings";

/**
 * The language, handed down from the server.
 *
 * Client components cannot read the cookie before their first paint without
 * causing exactly the flash this design exists to avoid, so they do not read it
 * at all. The server resolves the language once in the root layout and passes
 * it in as a prop; everything below reads it from context.
 *
 * The default is Filipino rather than a throw. A client component rendered
 * outside the provider - a test harness, a stray tree - should show the
 * product's own language, not crash. That is a real fallback and it is the only
 * one in this system: what must never fall back is an individual *string*,
 * because a missing English sentence inside an otherwise English screen is
 * silent. A whole subtree in the wrong language is not.
 */
const LanguageContext = createContext<Lang>(DEFAULT_LANG);

export function LanguageProvider({
  lang,
  children,
}: {
  lang: Lang;
  children: React.ReactNode;
}) {
  return (
    <LanguageContext.Provider value={lang}>{children}</LanguageContext.Provider>
  );
}

/** The live language, for the rare component that needs the code itself. */
export function useLang(): Lang {
  return useContext(LanguageContext);
}

/**
 * Every string in the product, already in the right language.
 *
 * Components read `copy.sos.sending` rather than a `t("sos.sending")` lookup:
 * a dotted key is a string the compiler cannot check, and a typo in one would
 * surface as blank text on a screen somebody is reading in an emergency.
 */
export function useCopy(): Copy {
  const lang = useContext(LanguageContext);

  // Memoised because the identity matters, not just the value. `FloodMap` reads
  // copy inside the effect that rebuilds every marker, so a fresh object each
  // render would put that effect in a loop - tearing down and re-adding every
  // pin on the map continuously. Stable per language, which is what the
  // dependency arrays downstream are entitled to assume.
  return useMemo(() => copyFor(lang), [lang]);
}
