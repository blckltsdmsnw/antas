import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const anon = createClient(url, anonKey, opts);

let reporterId: string;

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `corro-${Date.now()}@example.test`,
    password: "test-password-123",
    email_confirm: true,
  });
  if (error) throw error;
  reporterId = data.user!.id;

  // Three recent reports beside the point, one far away.
  await admin.from("depth_reports").insert([
    { reporter_id: reporterId, location: "SRID=4326;POINT(121.1001 14.6501)", depth: "chest", source: "seed" },
    { reporter_id: reporterId, location: "SRID=4326;POINT(121.1002 14.6502)", depth: "waist", source: "seed" },
    { reporter_id: reporterId, location: "SRID=4326;POINT(121.1003 14.6503)", depth: "chest", source: "seed" },
    { reporter_id: reporterId, location: "SRID=4326;POINT(121.145 14.69)",    depth: "ankle", source: "seed" },
  ]);
});

describe("corroborating_reports", () => {
  it("counts recent nearby reports", async () => {
    const { data, error } = await admin.rpc("corroborating_reports", {
      lat: 14.65,
      lon: 121.1,
      radius_m: 300,
      within_minutes: 180,
    });

    expect(error).toBeNull();
    expect(data).toBeGreaterThanOrEqual(3);
  });

  it("excludes reports outside the radius", async () => {
    const near = await admin.rpc("corroborating_reports", {
      lat: 14.65, lon: 121.1, radius_m: 300, within_minutes: 180,
    });
    const tiny = await admin.rpc("corroborating_reports", {
      lat: 14.65, lon: 121.1, radius_m: 5, within_minutes: 180,
    });

    expect(tiny.data).toBeLessThan(near.data);
  });

  it("excludes reports outside the time window", async () => {
    const { data } = await admin.rpc("corroborating_reports", {
      lat: 14.65, lon: 121.1, radius_m: 300, within_minutes: 0,
    });

    expect(data).toBe(0);
  });
});

describe("sos_counts_by_barangay", () => {
  it("lets an anonymous visitor see counts but never a location", async () => {
    const { data, error } = await anon.rpc("sos_counts_by_barangay");

    expect(error).toBeNull();
    const rows = (data ?? []) as Record<string, unknown>[];
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(["active_count", "barangay"]);
    }
  });
});
