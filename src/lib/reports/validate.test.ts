import { describe, it, expect } from "vitest";
import { validateReport, MARIKINA_BOUNDS } from "./validate";

const valid = {
  depth: "knee",
  lat: 14.65,
  lon: 121.1,
  gpsAccuracyM: 12,
};

describe("validateReport", () => {
  it("accepts a well-formed report", () => {
    const result = validateReport(valid);
    expect(result.ok).toBe(true);
  });

  it("rejects an unknown depth level", () => {
    const result = validateReport({ ...valid, depth: "shoulder" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("invalid_depth");
  });

  it("rejects coordinates outside the pilot area", () => {
    const result = validateReport({ ...valid, lat: 10.3, lon: 123.9 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("outside_pilot_area");
  });

  it("rejects a non-finite coordinate", () => {
    const result = validateReport({ ...valid, lat: Number.NaN });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("invalid_coordinates");
  });

  it("accepts a report with unknown GPS accuracy", () => {
    const result = validateReport({ ...valid, gpsAccuracyM: null });
    expect(result.ok).toBe(true);
  });

  it("flags poor GPS accuracy without rejecting the report", () => {
    const result = validateReport({ ...valid, gpsAccuracyM: 250 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings).toContain("low_gps_accuracy");
  });

  it("reports every problem at once rather than the first", () => {
    const result = validateReport({
      depth: "shoulder",
      lat: 10.3,
      lon: 123.9,
      gpsAccuracyM: 12,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toHaveLength(2);
  });

  it("exposes the pilot area bounds", () => {
    expect(MARIKINA_BOUNDS.minLat).toBeLessThan(MARIKINA_BOUNDS.maxLat);
    expect(MARIKINA_BOUNDS.minLon).toBeLessThan(MARIKINA_BOUNDS.maxLon);
  });

  it("accepts a point exactly on the pilot area boundary", () => {
    const result = validateReport({
      ...valid,
      lat: MARIKINA_BOUNDS.minLat,
      lon: MARIKINA_BOUNDS.minLon,
    });
    expect(result.ok).toBe(true);
  });

  it("does not warn when GPS accuracy is exactly at the threshold", () => {
    const result = validateReport({ ...valid, gpsAccuracyM: 100 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings).not.toContain("low_gps_accuracy");
  });

  it("rejects a report invalid on latitude alone", () => {
    const result = validateReport({ ...valid, lat: 14.9, lon: 121.1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("outside_pilot_area");
  });

  it("rejects a report invalid on longitude alone", () => {
    const result = validateReport({ ...valid, lat: 14.65, lon: 121.9 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("outside_pilot_area");
  });

  it("returns an empty warnings array for a fully valid report", () => {
    const result = validateReport(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings).toEqual([]);
  });
});
