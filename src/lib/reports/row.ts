import type { DepthLevel } from "@/lib/depth/scale";
import type { HazardType, Severity } from "@/lib/hazard/types";

/** Input that has already passed validateReport — depth is a known level, not a string. */
export interface ValidatedReportInput {
  hazard: HazardType;
  severity: Severity;
  depth: DepthLevel | null;
  lat: number;
  lon: number;
  gpsAccuracyM: number | null;
  /** Optional here, unlike SOS: most reports are a slider drag in the rain. */
  photoPath?: string | null;
}

export interface ReportRow {
  reporter_id: string;
  location: string;
  hazard_type: HazardType;
  severity: Severity;
  depth: DepthLevel | null;
  gps_accuracy_m: number | null;
  photo_path: string | null;
  source: "user";
}

export function buildReportRow(
  reporterId: string,
  input: ValidatedReportInput,
): ReportRow {
  return {
    reporter_id: reporterId,
    location: `SRID=4326;POINT(${input.lon} ${input.lat})`,
    hazard_type: input.hazard,
    severity: input.severity,
    depth: input.depth,
    gps_accuracy_m: input.gpsAccuracyM,
    // Normalised to null so an absent photo and an omitted field are the same
    // row - the column is nullable and `undefined` would be dropped silently.
    photo_path: input.photoPath ?? null,
    source: "user",
  };
}
