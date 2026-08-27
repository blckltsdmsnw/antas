
/**
 * The hazards Antas accepts, in the one order they are ever shown.
 *
 * Flood leads because it is what the product was built for and remains the
 * commonest report; `other` is last because it is the fallback. The order is
 * fixed rather than sorted so the picker, the legend and the graph agree
 * without coordinating.
 *
 * Must match the `hazard_type` enum in migration 0028.
 */
export const HAZARDS = [
  "flood",
  "fire",
  "earthquake",
  "accident",
  "medical",
  "other",
] as const;

export type HazardType = (typeof HAZARDS)[number];

/**
 * One rank for every hazard, so a fire can be ordered against a flood.
 *
 * Three steps, not five. Flood can be measured against a body precisely and
 * keeps its five levels; nothing else can, and inventing finer gradations for
 * a fire would be a false claim about how well it is known.
 */
export const SEVERITIES = [1, 2, 3] as const;

export type Severity = (typeof SEVERITIES)[number];

/**
 * What the public map may draw.
 *
 * Flood, fire and earthquake describe a place, and knowing a street is
 * impassable or a building is alight helps anyone nearby. Accident and medical
 * describe a person. Mirrors `public_hazard()` in 0028; the database is the
 * one that enforces it.
 */
export const PUBLIC_HAZARDS: readonly HazardType[] = ["flood", "fire", "earthquake"];

export function isHazardType(value: unknown): value is HazardType {
  return typeof value === "string" && (HAZARDS as readonly string[]).includes(value);
}

export function isSeverity(value: unknown): value is Severity {
  return typeof value === "number" && (SEVERITIES as readonly number[]).includes(value);
}

export function isPublicHazard(hazard: HazardType): boolean {
  return PUBLIC_HAZARDS.includes(hazard);
}
