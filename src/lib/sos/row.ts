import type { HazardType } from "@/lib/hazard/types";

/**
 * An SOS carries no depth, and *may* carry a hazard.
 *
 * The hazard is chosen from an optional row of chips above the hold: six
 * words, nothing preselected, nothing required. `null` records that none was
 * chosen and is never a guess - the console shows "not specified" rather
 * than inventing one.
 *
 * It used to. The form asked the sender to set a five-level gauge before it
 * would send - a question for somebody on a kerb deciding whether a street is
 * passable, not for somebody in the water asking to be reached.
 *
 * The column still exists and is nullable, because signals sent before this
 * carry a depth their senders really did choose. New ones simply do not write
 * it: `null` records that nobody was asked, which the scorer reads differently
 * from a shallow claim.
 */
export interface SosInput {
  lat: number;
  lon: number;
  gpsAccuracyM: number | null;
  photoPath: string;
  note: string | null;
  hazard: HazardType | null;
}

export interface SosRow {
  reporter_id: string;
  location: string;
  gps_accuracy_m: number | null;
  photo_path: string;
  note: string | null;
  hazard_type: HazardType | null;
}

export function buildSosRow(reporterId: string, input: SosInput): SosRow {
  return {
    reporter_id: reporterId,
    location: `SRID=4326;POINT(${input.lon} ${input.lat})`,
    gps_accuracy_m: input.gpsAccuracyM,
    photo_path: input.photoPath,
    note: input.note,
    hazard_type: input.hazard,
  };
}
