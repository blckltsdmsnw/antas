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
      photo_path: null,
      source: "user",
    });
  });

  it("carries a photo path through, and normalises its absence to null", () => {
    const withPhoto = buildReportRow("user-123", {
      depth: "waist",
      lat: 14.65,
      lon: 121.1,
      gpsAccuracyM: 9,
      photoPath: "user-123/1755100000000.jpg",
    });
    expect(withPhoto.photo_path).toBe("user-123/1755100000000.jpg");

    // undefined would be dropped from the insert entirely rather than stored
    // as NULL, so an omitted photo has to become an explicit null here.
    const without = buildReportRow("user-123", {
      depth: "waist",
      lat: 14.65,
      lon: 121.1,
      gpsAccuracyM: 9,
    });
    expect(without.photo_path).toBeNull();
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
