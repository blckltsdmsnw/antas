import { pick, type Dict, type Translated } from "../dict";
import type { Lang } from "../lang";
import { shell } from "./shell";
import { guide } from "./guide";
import { sos } from "./sos";
import { map } from "./map";
import { screens } from "./screens";

/**
 * Every string in the product, in one place.
 *
 * Grouped by surface rather than by kind, because that is how they are read and
 * reviewed: whoever checks the SOS wording should see all of it together and
 * nothing else. `sos.ts` and `guide.ts` in particular are meant to be read
 * end-to-end by a person, not grepped.
 */
const DICTS = { shell, guide, sos, map, screens } as const;

type Dicts = typeof DICTS;

/**
 * The shape components consume - the Tagalog dictionaries' keys, with plain
 * `string` values rather than literal types, so the same code reads either
 * language.
 */
export type Copy = {
  [K in keyof Dicts]: Dicts[K] extends Dict<infer T> ? Translated<T> : never;
};

/**
 * Built fresh per call rather than memoised into two frozen objects.
 *
 * There are five namespaces and the work is five property reads; caching it
 * would trade nothing for a module-level mutable that has to be reasoned about
 * during server rendering, where two requests in different languages can be in
 * flight at once.
 */
export function copyFor(lang: Lang): Copy {
  return {
    shell: pick(shell, lang),
    guide: pick(guide, lang),
    sos: pick(sos, lang),
    map: pick(map, lang),
    screens: pick(screens, lang),
  };
}
