import type { Copy } from "@/lib/i18n/strings";
import type { HazardType, Severity } from "./types";

const NAME_KEY: Readonly<Record<HazardType, keyof Copy["hazard"]>> = Object.freeze({
  flood: "hazardFlood",
  fire: "hazardFire",
  earthquake: "hazardEarthquake",
  accident: "hazardAccident",
  medical: "hazardMedical",
  other: "hazardOther",
});

/** "Sunog" / "Fire". */
export function hazardName(hazard: HazardType, copy: Copy["hazard"]): string {
  return copy[NAME_KEY[hazard]] as string;
}

/**
 * The severity word for a non-flood hazard.
 *
 * Throws for flood rather than returning something plausible: flood's words
 * are the body scale in `copy.map`, reached through `depthName`, and a caller
 * asking here has taken a wrong turn that must not be papered over with a
 * fire's word on a flood pin.
 */
export function severityWord(
  hazard: HazardType,
  severity: Severity,
  copy: Copy["hazard"],
): string {
  if (hazard === "flood") {
    throw new Error("flood severity is its depth; use depthName");
  }
  return copy[`${hazard}${severity}` as keyof Copy["hazard"]] as string;
}
