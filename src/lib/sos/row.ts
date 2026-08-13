import type { DepthLevel } from "@/lib/depth/scale";

export interface SosInput {
  depth: string;
  lat: number;
  lon: number;
  gpsAccuracyM: number | null;
  photoPath: string;
  note: string | null;
}

export interface SosRow {
  reporter_id: string;
  location: string;
  depth: DepthLevel;
  gps_accuracy_m: number | null;
  photo_path: string;
  note: string | null;
}

export function buildSosRow(reporterId: string, input: SosInput): SosRow {
  return {
    reporter_id: reporterId,
    location: `SRID=4326;POINT(${input.lon} ${input.lat})`,
    depth: input.depth as DepthLevel,
    gps_accuracy_m: input.gpsAccuracyM,
    photo_path: input.photoPath,
    note: input.note,
  };
}
