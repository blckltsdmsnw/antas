import type { ReportInput } from "@/lib/reports/validate";
import type { DepthLevel } from "@/lib/depth/scale";

export interface ReportRow {
  reporter_id: string;
  location: string;
  depth: DepthLevel;
  gps_accuracy_m: number | null;
  source: "user";
}

export function buildReportRow(
  reporterId: string,
  input: ReportInput,
): ReportRow {
  return {
    reporter_id: reporterId,
    location: `SRID=4326;POINT(${input.lon} ${input.lat})`,
    depth: input.depth as DepthLevel,
    gps_accuracy_m: input.gpsAccuracyM,
    source: "user",
  };
}
