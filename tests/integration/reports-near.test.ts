import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// The near point sits inside every street-level and city-wide radius used in
// these tests. The far point is ~5km away -- well outside them.
const NEAR_POINT = { lat: 14.65, lon: 121.1 };
const FAR_POINT = { lat: 14.69, lon: 121.145 };

let nearReportId: string;
let farReportId: string;

beforeAll(async () => {
  const { data: user, error: userError } = await admin.auth.admin.createUser({
    email: `reports-near-${Date.now()}@example.test`,
    password: "test-password-789",
    email_confirm: true,
  });
  if (userError) throw userError;
  const reporterId = user.user!.id;

  const { data: nearReport, error: nearError } = await admin
    .from("depth_reports")
    .insert({
      reporter_id: reporterId,
      location: `SRID=4326;POINT(${NEAR_POINT.lon} ${NEAR_POINT.lat})`,
      depth: "chest",
      source: "seed",
    })
    .select("id")
    .single();
  if (nearError) throw nearError;
  nearReportId = nearReport!.id;

  const { data: farReport, error: farError } = await admin
    .from("depth_reports")
    .insert({
      reporter_id: reporterId,
      location: `SRID=4326;POINT(${FAR_POINT.lon} ${FAR_POINT.lat})`,
      depth: "ankle",
      source: "seed",
    })
    .select("id")
    .single();
  if (farError) throw farError;
  farReportId = farReport!.id;
});

describe("reports_near", () => {
  it("returns the nearby report for a 300m query centred on the near point", async () => {
    const { data, error } = await admin.rpc("reports_near", {
      lat: NEAR_POINT.lat,
      lon: NEAR_POINT.lon,
      radius_m: 300,
    });
    expect(error).toBeNull();
    const ids = data!.map((row: { id: string }) => row.id);
    expect(ids).toContain(nearReportId);
  });

  it("excludes the report ~5km away from a 300m query", async () => {
    const { data, error } = await admin.rpc("reports_near", {
      lat: NEAR_POINT.lat,
      lon: NEAR_POINT.lon,
      radius_m: 300,
    });
    expect(error).toBeNull();
    const ids = data!.map((row: { id: string }) => row.id);
    expect(ids).not.toContain(farReportId);
  });

  it("orders a 10km query by ascending distance_m", async () => {
    const { data, error } = await admin.rpc("reports_near", {
      lat: NEAR_POINT.lat,
      lon: NEAR_POINT.lon,
      radius_m: 10_000,
    });
    expect(error).toBeNull();
    const distances = data!.map((row: { distance_m: number }) => row.distance_m);
    const sorted = [...distances].sort((a, b) => a - b);
    expect(distances).toEqual(sorted);

    // Both fixture rows must be present within this wider radius.
    const ids = data!.map((row: { id: string }) => row.id);
    expect(ids).toContain(nearReportId);
    expect(ids).toContain(farReportId);
  });

  it("returns lat and lon as plain numbers matching the inserted point", async () => {
    const { data, error } = await admin.rpc("reports_near", {
      lat: NEAR_POINT.lat,
      lon: NEAR_POINT.lon,
      radius_m: 300,
    });
    expect(error).toBeNull();
    const row = data!.find((r: { id: string }) => r.id === nearReportId);
    expect(row).toBeDefined();
    expect(typeof row.lat).toBe("number");
    expect(typeof row.lon).toBe("number");
    expect(row.lat).toBeCloseTo(NEAR_POINT.lat, 4);
    expect(row.lon).toBeCloseTo(NEAR_POINT.lon, 4);
    // nearReportId was inserted with depth "chest" and no hazard_type; 0028's
    // trigger and default fill both in.
    expect(row.hazard_type).toBe("flood");
    expect(row.severity).toBe(3);
  });
});
