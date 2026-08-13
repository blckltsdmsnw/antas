/**
 * How precise a GPS fix has to be before we place it on the map without asking.
 *
 * A browser without GPS falls back to IP or Wi-Fi lookup and can return a fix
 * accurate to tens of kilometres. It reports that honestly in
 * `position.coords.accuracy` - and we were ignoring it. A 100km-uncertain guess
 * rendered as an ordinary pin puts "chest-deep" on a street that is dry, and
 * the next person reading the history has no way to tell.
 *
 * 500m is the line: anything worse cannot meaningfully mean "this street",
 * which is the only claim this app makes.
 */
export const CONFIRM_ACCURACY_M = 500;

/** Unknown accuracy also needs confirming - the absence of a number is not a good one. */
export function needsLocationConfirmation(accuracyM: number | null): boolean {
  return accuracyM === null || accuracyM > CONFIRM_ACCURACY_M;
}

/** Plain language, because "±100000m" means nothing to someone in a flood. */
export function formatAccuracy(accuracyM: number | null): string {
  if (accuracyM === null) return "hindi alam";
  if (accuracyM < 1000) return `${Math.round(accuracyM)} m`;
  const km = accuracyM / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}
