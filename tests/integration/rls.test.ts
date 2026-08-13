import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, serviceKey);
const anon = createClient(url, anonKey);

let reporterId: string;

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `reporter-${Date.now()}@example.test`,
    password: "test-password-123",
    email_confirm: true,
  });
  if (error) throw error;
  reporterId = data.user!.id;

  const { error: insertError } = await admin.from("depth_reports").insert({
    reporter_id: reporterId,
    location: "SRID=4326;POINT(121.1 14.65)",
    depth: "knee",
    source: "seed",
  });
  if (insertError) throw insertError;
});

describe("depth_reports row-level security", () => {
  it("lets an anonymous visitor read active reports", async () => {
    const { data, error } = await anon.from("depth_reports").select("id, depth");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("hides reports that are not active", async () => {
    await admin.from("depth_reports").insert({
      reporter_id: reporterId,
      location: "SRID=4326;POINT(121.11 14.66)",
      depth: "chest",
      status: "hidden",
      source: "seed",
    });

    const { data } = await anon.from("depth_reports").select("id, status");
    expect(data!.every((row) => row.status === "active")).toBe(true);
  });

  it("refuses an insert from an anonymous visitor", async () => {
    const { error } = await anon.from("depth_reports").insert({
      reporter_id: reporterId,
      location: "SRID=4326;POINT(121.1 14.65)",
      depth: "waist",
    });
    expect(error).not.toBeNull();
  });

  it("refuses an anonymous visitor reading profiles", async () => {
    const { data } = await anon.from("profiles").select("id, display_name");
    expect(data).toEqual([]);
  });
});
