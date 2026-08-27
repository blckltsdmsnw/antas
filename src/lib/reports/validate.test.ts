import { describe, it, expect } from "vitest";
import { validateReport, PILOT_BOUNDS } from "./validate";

const valid = {
  hazard: "flood",
  severity: null,
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

  it("requires a hazard", () => {
    const r = validateReport({ ...valid, hazard: undefined });
    expect(!r.ok && r.errors).toContain("missing_hazard");
  });

  it("rejects a hazard it does not know", () => {
    const r = validateReport({ ...valid, hazard: "typhoon" });
    expect(!r.ok && r.errors).toContain("missing_hazard");
  });

  it("requires a depth for flood", () => {
    const r = validateReport({ ...valid, hazard: "flood", depth: "" });
    expect(!r.ok && r.errors).toContain("invalid_depth");
  });

  it("forbids a depth on anything but flood", () => {
    const r = validateReport({ ...valid, hazard: "fire", depth: "chest", severity: 2 });
    expect(!r.ok && r.errors).toContain("depth_not_allowed");
  });

  it("derives a flood's severity from its depth", () => {
    const r = validateReport({ ...valid, hazard: "flood", depth: "chest", severity: null });
    expect(r.ok && r.severity).toBe(3);
    expect(r.ok && r.depth).toBe("chest");
  });

  it("requires a severity for a non-flood hazard", () => {
    const r = validateReport({ ...valid, hazard: "fire", depth: "", severity: null });
    expect(!r.ok && r.errors).toContain("missing_severity");
  });

  it("accepts a fire with a severity and no depth", () => {
    const r = validateReport({ ...valid, hazard: "fire", depth: "", severity: 2 });
    expect(r.ok && r.severity).toBe(2);
    expect(r.ok && r.depth).toBeNull();
  });

  it("rejects coordinates outside the pilot area", () => {
    const result = validateReport({ ...valid, lat: 8.2, lon: 124.5 });
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
      hazard: "flood",
      severity: null,
      depth: "shoulder",
      lat: 8.2,
      lon: 124.5,
      gpsAccuracyM: 12,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toHaveLength(2);
  });

  it("accepts a report from Taguig", () => {
    // Ususan. The pilot area is Metro Manila, not Marikina alone.
    expect(validateReport({ ...valid, lat: 14.529, lon: 121.068 }).ok).toBe(true);
  });

  it("accepts a report from the City of Manila", () => {
    expect(validateReport({ ...valid, lat: 14.5995, lon: 120.9842 }).ok).toBe(true);
  });

  it("still refuses a report from outside Metro Manila", () => {
    // Cebu City - well outside the region.
    const result = validateReport({ ...valid, lat: 10.3157, lon: 123.8854 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("outside_pilot_area");
  });

  it("exposes the pilot area bounds", () => {
    expect(PILOT_BOUNDS.minLat).toBeLessThan(PILOT_BOUNDS.maxLat);
    expect(PILOT_BOUNDS.minLon).toBeLessThan(PILOT_BOUNDS.maxLon);
  });

  it("accepts a point exactly on the pilot area boundary", () => {
    const result = validateReport({
      ...valid,
      lat: PILOT_BOUNDS.minLat,
      lon: PILOT_BOUNDS.minLon,
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
