import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// supabase-js persists sessions to a storage key derived from the project URL,
// so multiple clients against the same project in one process share storage by
// default -- authed's signed-in session would otherwise bleed into anon's
// requests. None of these clients need a session to survive past this test run.
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, clientOptions);
const anon = createClient(url, anonKey, clientOptions);
const authed = createClient(url, anonKey, clientOptions);

const reporterPassword = "test-password-123";

let reporterId: string;
let otherUserId: string;

beforeAll(async () => {
  const reporterEmail = `reporter-${Date.now()}@example.test`;

  const { data, error } = await admin.auth.admin.createUser({
    email: reporterEmail,
    password: reporterPassword,
    email_confirm: true,
  });
  if (error) throw error;
  reporterId = data.user!.id;

  const { data: otherData, error: otherError } = await admin.auth.admin.createUser({
    email: `other-${Date.now()}@example.test`,
    password: "test-password-456",
    email_confirm: true,
  });
  if (otherError) throw otherError;
  otherUserId = otherData.user!.id;

  const { error: insertError } = await admin.from("depth_reports").insert({
    reporter_id: reporterId,
    location: "SRID=4326;POINT(121.1 14.65)",
    depth: "knee",
    source: "seed",
  });
  if (insertError) throw insertError;

  const { error: signInError } = await authed.auth.signInWithPassword({
    email: reporterEmail,
    password: reporterPassword,
  });
  if (signInError) throw signInError;
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
    // Denied at the grant layer (data null) or filtered to nothing by RLS (data []).
    // Either way, an anonymous visitor must never see a profile row.
    expect(data ?? []).toEqual([]);
  });

  it("does not let a signed-in user read another user's profile", async () => {
    const { data } = await authed.from("profiles").select("id");
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(reporterId);
  });

  it("does not let a signed-in user file a report in someone else's name", async () => {
    const { error } = await authed.from("depth_reports").insert({
      reporter_id: otherUserId,
      location: "SRID=4326;POINT(121.1 14.65)",
      depth: "waist",
    });
    expect(error).not.toBeNull();
  });
});
