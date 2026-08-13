import { describe, it, expect } from "vitest";
import { buildReportRow } from "./row";

describe("buildReportRow", () => {
  it("converts validated input into a PostGIS row", () => {
    const row = buildReportRow("user-123", {
      depth: "waist",
      lat: 14.65,
      lon: 121.1,
      gpsAccuracyM: 9,
    });

    expect(row).toEqual({
      reporter_id: "user-123",
      location: "SRID=4326;POINT(121.1 14.65)",
      depth: "waist",
      gps_accuracy_m: 9,
      source: "user",
    });
  });

  it("puts longitude before latitude in the point literal", () => {
    const row = buildReportRow("user-123", {
      depth: "knee",
      lat: 14.7,
      lon: 121.06,
      gpsAccuracyM: null,
    });

    expect(row.location).toBe("SRID=4326;POINT(121.06 14.7)");
  });
});
