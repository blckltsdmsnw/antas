import type { Copy } from "@/lib/i18n/strings";
import { depthRangeCm, type DepthLevel } from "./scale";

/**
 * The depth scale, in words.
 *
 * `scale.ts` has carried a `{tl, en}` pair since the beginning, and every
 * caller read `.tl` - so the English was already written and never once shown.
 * These three functions are what actually connect it to the interface.
 *
 * They live here rather than in `presentation.ts` because that module is about
 * colour, and it should go on having no opinion about language.
 */

const FULL: Readonly<Record<DepthLevel, keyof Copy["map"]>> = Object.freeze({
  ankle: "depthAnkleFull",
  knee: "depthKneeFull",
  waist: "depthWaistFull",
  chest: "depthChestFull",
  above_head: "depthAboveHeadFull",
});

const SHORT: Readonly<Record<DepthLevel, keyof Copy["map"]>> = Object.freeze({
  ankle: "depthAnkle",
  knee: "depthKnee",
  waist: "depthWaist",
  chest: "depthChest",
  above_head: "depthAboveHead",
});

/** "Hanggang tuhod" / "Knee-deep". The reading itself. */
export function depthName(level: DepthLevel, copy: Copy["map"]): string {
  return copy[FULL[level]] as string;
}

/**
 * "Tuhod" / "Knee", for legends and tick labels.
 *
 * Deliberately not the full form: where both appear on one screen, repeating
 * "Hanggang tuhod" twice is noise.
 */
export function depthShortName(level: DepthLevel, copy: Copy["map"]): string {
  return copy[SHORT[level]] as string;
}

/**
 * The centimetre range as a phrase. Informative, never the input - the slider
 * is the input, and a number is not how anyone judges water they are standing
 * in. The deepest level is open-ended, so it reads "pataas" rather than
 * inventing a ceiling.
 */
export function depthRangeText(level: DepthLevel, copy: Copy["map"]): string {
  const { minCm, maxCm } = depthRangeCm(level);
  return maxCm === null ? copy.depthRangeUp(minCm) : copy.depthRange(minCm, maxCm);
}
