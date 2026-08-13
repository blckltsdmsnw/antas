import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const modClient = createClient(url, anonKey, opts);
const outsiderClient = createClient(url, anonKey, opts);

let moderatorId: string;
let outsiderId: string;
let reporterId: string;

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

/** Creates a signal in Malanday, clearing any previous active one first. */
async function newSignal(): Promise<string> {
  await admin
    .from("sos_signals")
    .update({ status: "dismissed" })
    .eq("reporter_id", reporterId)
    .in("status", ["pending", "under_review", "confirmed"]);

  const { data, error } = await admin
    .from("sos_signals")
    .insert({
      reporter_id: reporterId,
      location: "SRID=4326;POINT(121.0950 14.6560)",
      depth: "chest",
      photo_path: `${reporterId}/x.jpg`,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  const m = await makeUser("moderator");
  const o = await makeUser("outsider");
  const r = await makeUser("reporter");
  moderatorId = m.id;
  outsiderId = o.id;
  reporterId = r.id;

  await admin.from("moderators").insert([
    { user_id: moderatorId, barangay: "Malanday" },
    { user_id: outsiderId, barangay: "Nangka" },
  ]);
  await admin.from("reputation").insert({ user_id: reporterId });

  await modClient.auth.signInWithPassword({ email: m.email, password: "test-password-123" });
  await outsiderClient.auth.signInWithPassword({ email: o.email, password: "test-password-123" });
});

describe("moderator_queue", () => {
  it("returns signals from the moderator's own barangay", async () => {
    const id = await newSignal();
    const { data, error } = await modClient.rpc("moderator_queue");

    expect(error).toBeNull();
    expect((data ?? []).map((r: { id: string }) => r.id)).toContain(id);
  });

  it("does not leak signals from another barangay", async () => {
    const id = await newSignal();
    const { data } = await outsiderClient.rpc("moderator_queue");

    expect((data ?? []).map((r: { id: string }) => r.id)).not.toContain(id);
  });

  it("returns nothing at all to a signed-in non-moderator", async () => {
    const plain = createClient(url, anonKey, opts);
    const u = await makeUser("plain");
    await plain.auth.signInWithPassword({ email: u.email, password: "test-password-123" });

    const { data } = await plain.rpc("moderator_queue");
    expect(data ?? []).toEqual([]);
  });
});

describe("decide_sos", () => {
  it("confirms a signal and writes an audit entry", async () => {
    const id = await newSignal();
    const { error } = await modClient.rpc("decide_sos", {
      signal_id: id,
      decision: "confirmed",
      reason: null,
    });
    expect(error).toBeNull();

    const { data: signal } = await admin
      .from("sos_signals")
      .select("status")
      .eq("id", id)
      .single();
    expect(signal!.status).toBe("confirmed");

    const { data: events } = await admin
      .from("signal_events")
      .select("event_type, actor_id")
      .eq("sos_id", id);
    expect(events!.length).toBeGreaterThan(0);
    expect(events![0].actor_id).toBe(moderatorId);
  });

  it("refuses a moderator from another barangay", async () => {
    const id = await newSignal();
    const { error } = await outsiderClient.rpc("decide_sos", {
      signal_id: id,
      decision: "confirmed",
      reason: null,
    });
    expect(error).not.toBeNull();
  });

  it("requires a reason when dismissing", async () => {
    const id = await newSignal();
    const { error } = await modClient.rpc("decide_sos", {
      signal_id: id,
      decision: "dismissed",
      reason: null,
    });
    expect(error).not.toBeNull();
  });

  it("counts a false report against the reporter but a duplicate does not", async () => {
    const before = await admin
      .from("reputation")
      .select("false_report_count")
      .eq("user_id", reporterId)
      .single();

    const dup = await newSignal();
    await modClient.rpc("decide_sos", {
      signal_id: dup,
      decision: "dismissed",
      reason: "duplicate",
    });

    const afterDup = await admin
      .from("reputation")
      .select("false_report_count")
      .eq("user_id", reporterId)
      .single();
    expect(afterDup.data!.false_report_count).toBe(before.data!.false_report_count);

    const fake = await newSignal();
    await modClient.rpc("decide_sos", {
      signal_id: fake,
      decision: "dismissed",
      reason: "false_report",
    });

    const afterFake = await admin
      .from("reputation")
      .select("false_report_count")
      .eq("user_id", reporterId)
      .single();
    expect(afterFake.data!.false_report_count).toBe(
      before.data!.false_report_count + 1,
    );
  });

  it("suspends the reporter on the third false report", async () => {
    await admin
      .from("reputation")
      .update({ false_report_count: 2 })
      .eq("user_id", reporterId);
    await admin
      .from("profiles")
      .update({ suspended_at: null })
      .eq("id", reporterId);

    const id = await newSignal();
    await modClient.rpc("decide_sos", {
      signal_id: id,
      decision: "dismissed",
      reason: "false_report",
    });

    const { data: profile } = await admin
      .from("profiles")
      .select("suspended_at")
      .eq("id", reporterId)
      .single();
    expect(profile!.suspended_at).not.toBeNull();
  });

  it("records every detail view in the audit log", async () => {
    const id = await newSignal();

    const before = await admin
      .from("signal_events")
      .select("id", { count: "exact", head: true })
      .eq("sos_id", id)
      .eq("event_type", "viewed");

    await modClient.rpc("sos_detail", { signal_id: id });

    const after = await admin
      .from("signal_events")
      .select("id", { count: "exact", head: true })
      .eq("sos_id", id)
      .eq("event_type", "viewed");

    expect(after.count!).toBe(before.count! + 1);
  });

  it("leaves no audit trail when a stranger probes a signal", async () => {
    const id = await newSignal();

    await outsiderClient.rpc("sos_detail", { signal_id: id });

    const { count } = await admin
      .from("signal_events")
      .select("id", { count: "exact", head: true })
      .eq("sos_id", id)
      .eq("event_type", "viewed");

    expect(count).toBe(0);
  });

  it("still lets a suspended reporter send a new signal", async () => {
    // Clear whatever earlier tests left active. The one-active-signal index is
    // doing its job; this test is about suspension, not that rule, and letting
    // the two collide would make a real guarantee fail for an unrelated reason.
    await admin
      .from("sos_signals")
      .update({ status: "dismissed" })
      .eq("reporter_id", reporterId)
      .in("status", ["pending", "under_review", "confirmed"]);

    // Suspension lowers priority and forces review. It never silences.
    const { error } = await admin.from("sos_signals").insert({
      reporter_id: reporterId,
      location: "SRID=4326;POINT(121.0950 14.6560)",
      depth: "waist",
      photo_path: `${reporterId}/after-suspension.jpg`,
    });
    expect(error).toBeNull();
  });
});
