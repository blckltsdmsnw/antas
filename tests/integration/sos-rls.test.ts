import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Every client keeps its own in-memory session. supabase-js derives its storage
// key from the project URL, so without this they share one slot in jsdom and a
// sign-in silently authenticates the "anonymous" client too.
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const anon = createClient(url, anonKey, opts);
const victim = createClient(url, anonKey, opts);
const stranger = createClient(url, anonKey, opts);

let victimId: string;
let strangerId: string;
let signalId: string;

async function makeUser(prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "test-password-123",
    email_confirm: true,
  });
  if (error) throw error;
  return { id: data.user!.id, email };
}

beforeAll(async () => {
  const v = await makeUser("victim");
  const s = await makeUser("stranger");
  victimId = v.id;
  strangerId = s.id;

  await victim.auth.signInWithPassword({
    email: v.email,
    password: "test-password-123",
  });
  await stranger.auth.signInWithPassword({
    email: s.email,
    password: "test-password-123",
  });

  const { data, error } = await admin
    .from("sos_signals")
    .insert({
      reporter_id: victimId,
      location: "SRID=4326;POINT(121.1 14.65)",
      depth: "chest",
      photo_path: "sos/test.jpg",
      barangay: "Malanday",
    })
    .select("id")
    .single();
  if (error) throw error;
  signalId = data.id;
});

describe("sos_signals row-level security", () => {
  it("hides distress signals from anonymous visitors entirely", async () => {
    const { data } = await anon.from("sos_signals").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("does not let a signed-in stranger read someone else's signal", async () => {
    const { data } = await stranger.from("sos_signals").select("id");
    expect((data ?? []).map((r) => r.id)).not.toContain(signalId);
  });

  it("lets the reporter see their own signal", async () => {
    const { data } = await victim.from("sos_signals").select("id");
    expect((data ?? []).map((r) => r.id)).toContain(signalId);
  });

  it("does not let a user file a signal in someone else's name", async () => {
    const { error } = await stranger.from("sos_signals").insert({
      reporter_id: victimId,
      location: "SRID=4326;POINT(121.1 14.65)",
      depth: "waist",
      photo_path: "sos/forged.jpg",
    });
    expect(error).not.toBeNull();
  });

  it("refuses a second active signal from the same reporter", async () => {
    const { error } = await admin.from("sos_signals").insert({
      reporter_id: victimId,
      location: "SRID=4326;POINT(121.1 14.65)",
      depth: "waist",
      photo_path: "sos/second.jpg",
    });
    expect(error?.code).toBe("23505");
  });

  it("hides the audit log and environmental snapshots from everyone but service role", async () => {
    const events = await anon.from("signal_events").select("id");
    const snapshots = await stranger.from("env_snapshots").select("sos_id");
    expect(events.data ?? []).toEqual([]);
    expect(snapshots.data ?? []).toEqual([]);
  });

  it("still allows a suspended reporter to send a signal", async () => {
    // Suspension lowers priority and forces review; it never silences.
    await admin
      .from("profiles")
      .update({ suspended_at: new Date().toISOString() })
      .eq("id", strangerId);

    const { error } = await stranger.from("sos_signals").insert({
      reporter_id: strangerId,
      location: "SRID=4326;POINT(121.1 14.65)",
      depth: "chest",
      photo_path: "sos/suspended.jpg",
    });
    expect(error).toBeNull();
  });
});
