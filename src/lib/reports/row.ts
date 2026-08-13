import type { DepthLevel } from "@/lib/depth/scale";

/** Input that has already passed validateReport — depth is a known level, not a string. */
export interface ValidatedReportInput {
  depth: DepthLevel;
  lat: number;
  lon: number;
  gpsAccuracyM: number | null;
}

export interface ReportRow {
  reporter_id: string;
  location: string;
  depth: DepthLevel;
  gps_accuracy_m: number | null;
  source: "user";
}

export function buildReportRow(
  reporterId: string,
  input: ValidatedReportInput,
): ReportRow {
  return {
    reporter_id: reporterId,
    location: `SRID=4326;POINT(${input.lon} ${input.lat})`,
    depth: input.depth,
    gps_accuracy_m: input.gpsAccuracyM,
    source: "user",
  };
}
