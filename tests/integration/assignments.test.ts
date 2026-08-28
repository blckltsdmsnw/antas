// tests/integration/assignments.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Access by assignment, not by role.
 *
 * The spec's rule: a user may read an incident if they moderate its barangay
 * OR they hold an open assignment on it. Half of this file is the second
 * clause working; the other half is it not widening by accident - one row,
 * not the barangay, and nothing once the assignment is closed.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const masterClient = createClient(url, anonKey, opts);
const adminClient = createClient(url, anonKey, opts);
const responderClient = createClient(url, anonKey, opts);
const bystanderClient = createClient(url, anonKey, opts);

const PASSWORD = "test-password-123";
const HOME = "Malanday";
const MALANDAY = "SRID=4326;POINT(121.0950 14.6560)";

let masterId: string;
let responderId: string;
let bystanderId: string;
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

/** A medical report: the kind the public policy withholds, so a responder
 *  reading it proves the assignment policy and not the public one. */
async function newMedical(): Promise<string> {
  const { data, error } = await admin
    .from("depth_reports")
    .insert({
      reporter_id: reporterId,
      location: MALANDAY,
      hazard_type: "medical",
      severity: 3,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function newSignal(): Promise<string> {
  const reporter = await makeUser("sig");
  await admin.from("profiles").update({ phone: "+639170000001" }).eq("id", reporter.id);
  const { data, error } = await admin
    .from("sos_signals")
    .insert({
      reporter_id: reporter.id,
      location: MALANDAY,
      photo_path: `${reporter.id}/x.jpg`,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function assign(target: { incident?: string; sos?: string }, to = responderId) {
  const { data, error } = await masterClient.rpc("assign_responder", {
    p_incident_id: target.incident ?? null,
    p_sos_id: target.sos ?? null,
    p_responder_id: to,
  });
  if (error) throw error;
  return data as string;
}

beforeAll(async () => {
  const master = await makeUser("master");
  const a = await makeUser("admin");
  const resp = await makeUser("responder");
  const by = await makeUser("bystander");
  const r = await makeUser("reporter");
  masterId = master.id;
  responderId = resp.id;
  bystanderId = by.id;
  reporterId = r.id;

  await admin.from("moderators").insert([
    { user_id: masterId, barangay: HOME, role: "master_admin" },
    { user_id: a.id, barangay: HOME, role: "admin" },
  ]);
  await admin
    .from("profiles")
    .update({ display_name: "Ben Cruz", responder_unit: "barangay_rescue", responder_barangay: HOME })
    .eq("id", responderId);
  await admin.from("profiles").update({ phone: "+639171234567" }).eq("id", reporterId);

  for (const [client, user] of [
    [masterClient, master],
    [adminClient, a],
    [responderClient, resp],
    [bystanderClient, by],
  ] as const) {
    const { error } = await client.auth.signInWithPassword({
      email: user.email,
      password: PASSWORD,
    });
    if (error) throw error;
  }
});

describe("assign_responder", () => {
  it("is master admin only", async () => {
    const id = await newMedical();
    const { error } = await adminClient.rpc("assign_responder", {
      p_incident_id: id,
      p_sos_id: null,
      p_responder_id: responderId,
    });
    expect(error).not.toBeNull();
  });

  it("refuses somebody with no unit", async () => {
    const id = await newMedical();
    const { error } = await masterClient.rpc("assign_responder", {
      p_incident_id: id,
      p_sos_id: null,
      p_responder_id: bystanderId,
    });
    expect(error).not.toBeNull();
  });

  it("refuses both or neither target", async () => {
    const id = await newMedical();
    const sos = await newSignal();
    const both = await masterClient.rpc("assign_responder", {
      p_incident_id: id,
      p_sos_id: sos,
      p_responder_id: responderId,
    });
    expect(both.error).not.toBeNull();
    const neither = await masterClient.rpc("assign_responder", {
      p_incident_id: null,
      p_sos_id: null,
      p_responder_id: responderId,
    });
    expect(neither.error).not.toBeNull();
  });

  it("confirms a report on the way to assignment", async () => {
    const id = await newMedical();
    await assign({ incident: id });
    const { data } = await admin
      .from("depth_reports")
      .select("triage_state")
      .eq("id", id)
      .single();
    expect(data!.triage_state).toBe("needs_attention");
  });

  it("leaves an SOS's status alone", async () => {
    // Confirming an SOS raises the reporter's confirmed_count; that is a
    // judgement about a person and stays an explicit act.
    const sos = await newSignal();
    await assign({ sos });
    const { data } = await admin.from("sos_signals").select("status").eq("id", sos).single();
    expect(data!.status).toBe("pending");
  });

  it("refuses a dismissed signal", async () => {
    const sos = await newSignal();
    await masterClient.rpc("decide_sos", {
      signal_id: sos,
      decision: "dismissed",
      reason: "duplicate",
    });
    const { error } = await masterClient.rpc("assign_responder", {
      p_incident_id: null,
      p_sos_id: sos,
      p_responder_id: responderId,
    });
    expect(error).not.toBeNull();
  });

  it("records the assignment beside the record", async () => {
    const id = await newMedical();
    const assignmentId = await assign({ incident: id });
    const { data } = await admin
      .from("report_events")
      .select("actor_id, event_type, payload")
      .eq("report_id", id)
      .eq("event_type", "assigned")
      .single();
    expect(data!.actor_id).toBe(masterId);
    expect((data!.payload as { assignment_id: string }).assignment_id).toBe(assignmentId);
  });

  it("refuses the same person twice on one record", async () => {
    const id = await newMedical();
    await assign({ incident: id });
    const { error } = await masterClient.rpc("assign_responder", {
      p_incident_id: id,
      p_sos_id: null,
      p_responder_id: responderId,
    });
    expect(error).not.toBeNull();
  });
});

describe("what an assignment grants", () => {
  it("makes that one report readable to the responder, and no other", async () => {
    const mine = await newMedical();
    const other = await newMedical();
    await assign({ incident: mine });

    const { data } = await responderClient
      .from("depth_reports")
      .select("id")
      .in("id", [mine, other]);
    expect((data ?? []).map((r) => r.id)).toEqual([mine]);
  });

  it("makes that one signal readable to the responder", async () => {
    const sos = await newSignal();
    await assign({ sos });
    const { data } = await responderClient.from("sos_signals").select("id").eq("id", sos);
    expect((data ?? []).map((r) => r.id)).toEqual([sos]);
  });

  it("lists it in my_assignments with what identifies it and no phone", async () => {
    const id = await newMedical();
    const assignmentId = await assign({ incident: id });
    const { data } = await responderClient.rpc("my_assignments");
    const row = (data as Record<string, unknown>[]).find((r) => r.assignment_id === assignmentId);
    expect(row).toMatchObject({
      kind: "report",
      target_id: id,
      hazard_type: "medical",
      severity: 3,
      barangay: HOME,
    });
    expect(row).not.toHaveProperty("reporter_phone");
  });

  it("hands the number over through assignment_detail, and records it", async () => {
    const id = await newMedical();
    const assignmentId = await assign({ incident: id });
    const { data } = await responderClient.rpc("assignment_detail", {
      p_assignment_id: assignmentId,
    });
    expect((data as { reporter_phone: string }[])[0].reporter_phone).toBe("+639171234567");

    const { data: events } = await admin
      .from("report_events")
      .select("actor_id, event_type, payload")
      .eq("report_id", id)
      .eq("event_type", "viewed");
    expect(events).toContainEqual({
      actor_id: responderId,
      event_type: "viewed",
      payload: { via: "assignment", assignment_id: assignmentId },
    });
  });

  it("gives a bystander nothing and no trail", async () => {
    const id = await newMedical();
    const assignmentId = await assign({ incident: id });
    const { data } = await bystanderClient.rpc("assignment_detail", {
      p_assignment_id: assignmentId,
    });
    expect(data).toEqual([]);
    const { data: events } = await admin
      .from("report_events")
      .select("actor_id")
      .eq("report_id", id);
    expect((events ?? []).map((e) => e.actor_id)).not.toContain(bystanderId);
  });

  it("lets the responder open the SOS photo, by policy", async () => {
    // can_view_sos_photo is what the storage policy asks; the object itself
    // need not exist for the predicate to answer.
    const sos = await newSignal();
    const { data: row } = await admin.from("sos_signals").select("photo_path").eq("id", sos).single();
    const before = await responderClient.rpc("can_view_sos_photo", { p_path: row!.photo_path });
    expect(before.data).toBe(false);
    await assign({ sos });
    const after = await responderClient.rpc("can_view_sos_photo", { p_path: row!.photo_path });
    expect(after.data).toBe(true);
  });

  it("counts in console_access", async () => {
    const { data } = await responderClient.rpc("console_access");
    const row = (data as { role: string | null; open_assignments: number }[])[0];
    expect(row.role).toBeNull();
    expect(row.open_assignments).toBeGreaterThan(0);
  });
});

describe("when the assignment ends", () => {
  it("the responder can close it themselves, and access ends", async () => {
    const id = await newMedical();
    const assignmentId = await assign({ incident: id });
    const { error } = await responderClient.rpc("close_assignment", {
      p_assignment_id: assignmentId,
    });
    expect(error).toBeNull();
    const { data } = await responderClient.from("depth_reports").select("id").eq("id", id);
    expect(data).toEqual([]);
  });

  it("a bystander cannot close it", async () => {
    const id = await newMedical();
    const assignmentId = await assign({ incident: id });
    const { error } = await bystanderClient.rpc("close_assignment", {
      p_assignment_id: assignmentId,
    });
    expect(error).not.toBeNull();
  });

  it("hiding the report closes it", async () => {
    const id = await newMedical();
    const assignmentId = await assign({ incident: id });
    await masterClient.rpc("decide_report", {
      p_report_id: id,
      p_decision: "hide",
      p_reason: "not_true",
    });
    const { data } = await admin
      .from("assignments")
      .select("closed_at")
      .eq("id", assignmentId)
      .single();
    expect(data!.closed_at).not.toBeNull();
  });

  it("dismissing the signal closes it", async () => {
    const sos = await newSignal();
    const assignmentId = await assign({ sos });
    await masterClient.rpc("decide_sos", {
      signal_id: sos,
      decision: "dismissed",
      reason: "insufficient_info",
    });
    const { data } = await admin
      .from("assignments")
      .select("closed_at")
      .eq("id", assignmentId)
      .single();
    expect(data!.closed_at).not.toBeNull();
  });

  it("closing writes an audit row", async () => {
    const sos = await newSignal();
    const assignmentId = await assign({ sos });
    await masterClient.rpc("close_assignment", { p_assignment_id: assignmentId });
    const { data } = await admin
      .from("signal_events")
      .select("event_type")
      .eq("sos_id", sos);
    expect((data ?? []).map((e) => e.event_type)).toContain("assignment_closed");
  });
});

describe("the table itself", () => {
  it("is unreachable to a signed-in user", async () => {
    const { error } = await responderClient.from("assignments").select("id").limit(1);
    expect(error).not.toBeNull();
  });
});
