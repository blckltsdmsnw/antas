// tests/integration/master-admin.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * The third role, and the two things it must not have changed: a moderator
 * is still confined to one barangay, and an admin is still not a master
 * admin. The board and the roster exist for exactly one role.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const masterClient = createClient(url, anonKey, opts);
const adminClient = createClient(url, anonKey, opts);
const modClient = createClient(url, anonKey, opts);
const nobodyClient = createClient(url, anonKey, opts);

const PASSWORD = "test-password-123";
const HOME = "Malanday";
const AWAY = "South Signal Village";
const MALANDAY = "SRID=4326;POINT(121.0950 14.6560)";

let reporterId: string;

async function makeUser(prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return { id: data.user!.id, email };
}

async function newReport(barangay = HOME): Promise<string> {
  const { data, error } = await admin
    .from("depth_reports")
    .insert({ reporter_id: reporterId, location: MALANDAY, depth: "chest" })
    .select("id")
    .single();
  if (error) throw error;
  const { error: moveError } = await admin
    .from("depth_reports")
    .update({ barangay })
    .eq("id", data.id);
  if (moveError) throw moveError;
  return data.id;
}

beforeAll(async () => {
  const master = await makeUser("master");
  const a = await makeUser("admin");
  const m = await makeUser("mod");
  const n = await makeUser("nobody");
  const r = await makeUser("reporter");
  reporterId = r.id;

  const { error } = await admin.from("moderators").insert([
    { user_id: master.id, barangay: HOME, role: "master_admin" },
    { user_id: a.id, barangay: HOME, role: "admin" },
    { user_id: m.id, barangay: HOME, role: "moderator" },
  ]);
  if (error) throw error;

  for (const [client, user] of [
    [masterClient, master],
    [adminClient, a],
    [modClient, m],
    [nobodyClient, n],
  ] as const) {
    const { error: signInError } = await client.auth.signInWithPassword({
      email: user.email,
      password: PASSWORD,
    });
    if (signInError) throw signInError;
  }
});

describe("the master_admin role", () => {
  it("is accepted by the moderators check constraint", async () => {
    // The insert in beforeAll is the test; if 0032 did not widen the
    // constraint, beforeAll threw and nothing below runs.
    const { data } = await masterClient.rpc("is_master_admin");
    expect(data).toBe(true);
  });

  it("is not what an admin has", async () => {
    const { data } = await adminClient.rpc("is_master_admin");
    expect(data).toBe(false);
  });

  it("sees every barangay's queue, like an admin", async () => {
    const id = await newReport(AWAY);
    const { data } = await masterClient.rpc("report_queue");
    expect((data as { id: string }[]).map((r) => r.id)).toContain(id);
  });

  it("leaves an ordinary moderator exactly as confined as before", async () => {
    const id = await newReport(AWAY);
    const { data } = await modClient.rpc("report_queue");
    expect((data as { id: string }[]).map((r) => r.id)).not.toContain(id);
  });

  it("is reported by console_access, along with an assignment count", async () => {
    const { data } = await masterClient.rpc("console_access");
    expect(data).toEqual([{ role: "master_admin", open_assignments: 0 }]);
  });

  it("console_access says neither for a plain user", async () => {
    const { data } = await nobodyClient.rpc("console_access");
    expect(data).toEqual([{ role: null, open_assignments: 0 }]);
  });
});

describe("triage state", () => {
  it("starts at needs_checking and is carried by the queue", async () => {
    const id = await newReport();
    const { data } = await modClient.rpc("report_queue");
    const row = (data as { id: string; triage_state: string }[]).find((r) => r.id === id);
    expect(row!.triage_state).toBe("needs_checking");
  });

  it("moves to needs_attention when a moderator confirms", async () => {
    const id = await newReport();
    const { error } = await modClient.rpc("decide_report", {
      p_report_id: id,
      p_decision: "confirm",
    });
    expect(error).toBeNull();
    const { data } = await admin
      .from("depth_reports")
      .select("triage_state, status")
      .eq("id", id)
      .single();
    expect(data).toEqual({ triage_state: "needs_attention", status: "active" });
  });

  it("moves to not_true when hidden, whatever the reason", async () => {
    // The column names the board's column, not the reason. A stale report
    // lands in "Hindi totoo" because that is the column the board has for
    // "a person decided this should come off the map".
    const id = await newReport();
    await modClient.rpc("decide_report", {
      p_report_id: id,
      p_decision: "hide",
      p_reason: "stale",
    });
    const { data } = await admin
      .from("depth_reports")
      .select("triage_state, status")
      .eq("id", id)
      .single();
    expect(data).toEqual({ triage_state: "not_true", status: "hidden" });
  });

  it("refuses confirm from a moderator of another barangay", async () => {
    const id = await newReport(AWAY);
    const { error } = await modClient.rpc("decide_report", {
      p_report_id: id,
      p_decision: "confirm",
    });
    expect(error).not.toBeNull();
  });
});

describe("the roster", () => {
  it("is empty of anyone without a unit, and lists those with one", async () => {
    const responder = await makeUser("roster");
    await admin
      .from("profiles")
      .update({
        display_name: "Ana Reyes",
        responder_unit: "bfp",
        responder_barangay: HOME,
        phone: "+639171234567",
      })
      .eq("id", responder.id);

    const { data, error } = await masterClient.rpc("responder_roster");
    expect(error).toBeNull();
    const rows = data as { user_id: string; name: string; unit: string; phone: string }[];
    expect(rows.find((r) => r.user_id === responder.id)).toEqual({
      user_id: responder.id,
      name: "Ana Reyes",
      unit: "bfp",
      barangay: HOME,
      phone: "+639171234567",
    });
    expect(rows.find((r) => r.user_id === reporterId)).toBeUndefined();
  });

  it("is withheld from an admin", async () => {
    // A list of every responder's phone number is the one thing the wider
    // scope must not hand out by accident.
    const { data } = await adminClient.rpc("responder_roster");
    expect(data).toEqual([]);
  });

  it("is closed to anon at the grant layer", async () => {
    const stranger = createClient(url, anonKey, opts);
    const { error } = await stranger.rpc("responder_roster");
    expect(error).not.toBeNull();
  });
});
