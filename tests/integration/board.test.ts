// tests/integration/board.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * One shape for two tables, and the four columns derived from state.
 *
 * Most of these are about placement: which column a record lands in given
 * its status, its triage state and whether somebody is assigned. The
 * remaining few are about who may look, and about the graph being counts
 * rather than rows.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const masterClient = createClient(url, anonKey, opts);
const adminClient = createClient(url, anonKey, opts);

const PASSWORD = "test-password-123";
const HOME = "Malanday";
const MALANDAY = "SRID=4326;POINT(121.0950 14.6560)";

let responderId: string;
let reporterId: string;

interface Row {
  kind: "sos" | "report";
  id: string;
  board_column: string;
  hazard_type: string | null;
  severity: number | null;
  responder_name: string | null;
  responder_unit: string | null;
}

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

async function newReport(row: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await admin
    .from("depth_reports")
    .insert({ reporter_id: reporterId, location: MALANDAY, hazard_type: "fire", severity: 2, ...row })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function newSignal(row: Record<string, unknown> = {}): Promise<string> {
  const reporter = await makeUser("sig");
  const { data, error } = await admin
    .from("sos_signals")
    .insert({ reporter_id: reporter.id, location: MALANDAY, photo_path: `${reporter.id}/x.jpg`, ...row })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function board(): Promise<Row[]> {
  const { data, error } = await masterClient.rpc("board_rows");
  if (error) throw error;
  return data as Row[];
}

async function placement(id: string): Promise<string | undefined> {
  return (await board()).find((r) => r.id === id)?.board_column;
}

beforeAll(async () => {
  // board_rows() caps each column at 200 rows and orders severity-first, so
  // on a shared local DB a fresh mild row can be starved out by hundreds of
  // stale severe rows left behind by earlier test runs. This cleanup only
  // ever touches rows owned by this project's test/seed accounts - the
  // @example.test convention used by makeUser() here and in scripts/unseed.ts
  // - and only once they are an hour old, so it never reaches into anyone
  // else's data or a run still in flight.
  const staleTestAccountIds: string[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email?.endsWith("@example.test")) staleTestAccountIds.push(u.id);
    }
    if (data.users.length !== 1000) break;
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  for (let i = 0; i < staleTestAccountIds.length; i += 200) {
    const chunk = staleTestAccountIds.slice(i, i + 200);

    const { error: reportsError } = await admin
      .from("depth_reports")
      .delete()
      .in("reporter_id", chunk)
      .lt("reported_at", oneHourAgo);
    if (reportsError) throw reportsError;

    const { error: signalsError } = await admin
      .from("sos_signals")
      .delete()
      .in("reporter_id", chunk)
      .lt("created_at", oneHourAgo);
    if (signalsError) throw signalsError;
  }

  const master = await makeUser("master");
  const a = await makeUser("admin");
  const resp = await makeUser("responder");
  const r = await makeUser("reporter");
  responderId = resp.id;
  reporterId = r.id;

  await admin.from("moderators").insert([
    { user_id: master.id, barangay: HOME, role: "master_admin" },
    { user_id: a.id, barangay: HOME, role: "admin" },
  ]);
  await admin
    .from("profiles")
    .update({ display_name: "Cora Dizon", responder_unit: "medical" })
    .eq("id", responderId);

  for (const [client, user] of [[masterClient, master], [adminClient, a]] as const) {
    const { error } = await client.auth.signInWithPassword({ email: user.email, password: PASSWORD });
    if (error) throw error;
  }
});

describe("who may look", () => {
  it("refuses an admin, with an error rather than an empty board", async () => {
    const { error } = await adminClient.rpc("board_rows");
    expect(error!.code).toBe("42501");
    const graph = await adminClient.rpc("board_graph");
    expect(graph.error!.code).toBe("42501");
  });

  it("refuses anon at the grant layer", async () => {
    const { error } = await createClient(url, anonKey, opts).rpc("board_rows");
    expect(error).not.toBeNull();
  });
});

describe("where an SOS lands", () => {
  it("pending -> needs_checking", async () => {
    const id = await newSignal();
    expect(await placement(id)).toBe("needs_checking");
  });

  it("confirmed -> needs_attention", async () => {
    const id = await newSignal();
    await masterClient.rpc("decide_sos", { signal_id: id, decision: "confirmed" });
    expect(await placement(id)).toBe("needs_attention");
  });

  it("dismissed -> not_true", async () => {
    const id = await newSignal();
    await masterClient.rpc("decide_sos", { signal_id: id, decision: "dismissed", reason: "duplicate" });
    expect(await placement(id)).toBe("not_true");
  });

  it("assigned -> assigned, carrying the responder's name and unit", async () => {
    const id = await newSignal();
    await masterClient.rpc("assign_responder", { p_incident_id: null, p_sos_id: id, p_responder_id: responderId });
    const row = (await board()).find((r) => r.id === id)!;
    expect(row.board_column).toBe("assigned");
    expect(row.responder_name).toBe("Cora Dizon");
    expect(row.responder_unit).toBe("medical");
  });

  it("resolved -> not on the board", async () => {
    const id = await newSignal();
    await admin.from("sos_signals").update({ status: "resolved" }).eq("id", id);
    expect(await placement(id)).toBeUndefined();
  });
});

describe("where a report lands", () => {
  it("new -> needs_checking, with its hazard and severity", async () => {
    const id = await newReport();
    const row = (await board()).find((r) => r.id === id)!;
    expect(row.board_column).toBe("needs_checking");
    expect(row.hazard_type).toBe("fire");
    expect(row.severity).toBe(2);
  });

  it("flagged is still needs_checking", async () => {
    const id = await newReport({ status: "flagged" });
    expect(await placement(id)).toBe("needs_checking");
  });

  it("confirmed -> needs_attention", async () => {
    const id = await newReport();
    await masterClient.rpc("decide_report", { p_report_id: id, p_decision: "confirm" });
    expect(await placement(id)).toBe("needs_attention");
  });

  it("hidden by a moderator -> not_true", async () => {
    const id = await newReport();
    await masterClient.rpc("decide_report", { p_report_id: id, p_decision: "hide", p_reason: "wrong_place" });
    expect(await placement(id)).toBe("not_true");
  });

  it("hidden by its own reporter -> not on the board", async () => {
    // Their choice about their own pin, not a judgement that it was false.
    const id = await newReport();
    await admin.from("depth_reports").update({ status: "hidden" }).eq("id", id);
    expect(await placement(id)).toBeUndefined();
  });

  it("assigned -> assigned, and falls back to needs_attention when closed", async () => {
    const id = await newReport();
    const { data: assignmentId } = await masterClient.rpc("assign_responder", {
      p_incident_id: id, p_sos_id: null, p_responder_id: responderId,
    });
    expect(await placement(id)).toBe("assigned");
    await masterClient.rpc("close_assignment", { p_assignment_id: assignmentId });
    expect(await placement(id)).toBe("needs_attention");
  });

  it("a medical report is on the board even though it is not on the map", async () => {
    const id = await newReport({ hazard_type: "medical", severity: 3 });
    expect(await placement(id)).toBe("needs_checking");
  });
});

describe("order within a column", () => {
  it("puts an SOS above a report, and a worse report above a milder one", async () => {
    const mild = await newReport({ severity: 1 });
    const bad = await newReport({ severity: 3 });
    const sos = await newSignal();
    const ids = (await board())
      .filter((r) => r.board_column === "needs_checking")
      .map((r) => r.id);
    expect(ids.indexOf(sos)).toBeLessThan(ids.indexOf(bad));
    expect(ids.indexOf(bad)).toBeLessThan(ids.indexOf(mild));
  });
});

describe("the 200-row cap", () => {
  it("caps a column at 200 rows", async () => {
    const rows = Array.from({ length: 205 }, () => ({
      reporter_id: reporterId,
      location: MALANDAY,
      hazard_type: "fire",
      severity: 1,
    }));
    const { error } = await admin.from("depth_reports").insert(rows);
    if (error) throw error;

    const needsChecking = (await board()).filter((r) => r.board_column === "needs_checking");
    expect(needsChecking.length).toBeLessThanOrEqual(200);
    expect(needsChecking.length).toBe(200);
  });
});

describe("the not_true window follows the decision", () => {
  it("a hidden report moves to not_true even when the report itself is old", async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const id = await newReport({ reported_at: threeDaysAgo });
    await masterClient.rpc("decide_report", { p_report_id: id, p_decision: "hide", p_reason: "wrong_place" });
    expect(await placement(id)).toBe("not_true");
  });

  it("an old dismissed signal whose decision is also old is not on the board", async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const id = await newSignal({ created_at: threeDaysAgo });

    // Set directly rather than through decide_sos(), which would stamp its own
    // signal_events row with now() and defeat the point of this test.
    const { error: updateError } = await admin
      .from("sos_signals")
      .update({ status: "dismissed" })
      .eq("id", id);
    if (updateError) throw updateError;

    const { error: eventError } = await admin
      .from("signal_events")
      .insert({ sos_id: id, event_type: "decision", created_at: threeDaysAgo });
    if (eventError) throw eventError;

    expect(await placement(id)).toBeUndefined();
  });
});

describe("the graph", () => {
  it("returns counts by hour and hazard, and a ranked barangay list", async () => {
    await newReport({ hazard_type: "earthquake", severity: 1 });
    const { data, error } = await masterClient.rpc("board_graph");
    expect(error).toBeNull();
    const graph = data as {
      hours: { hour: string; hazard: string | null; count: number }[];
      barangays: { barangay: string; count: number }[];
    };
    expect(graph.hours.some((h) => h.hazard === "earthquake" && h.count >= 1)).toBe(true);
    expect(graph.hours.every((h) => typeof h.hour === "string" && h.count > 0)).toBe(true);
    expect(graph.barangays[0].barangay).toBe(HOME);
    for (let i = 1; i < graph.barangays.length; i++) {
      expect(graph.barangays[i - 1].count).toBeGreaterThanOrEqual(graph.barangays[i].count);
    }
  });

  it("counts an SOS with no chip under a null hazard", async () => {
    await newSignal();
    const { data } = await masterClient.rpc("board_graph");
    const graph = data as { hours: { hazard: string | null; count: number }[] };
    expect(graph.hours.some((h) => h.hazard === null)).toBe(true);
  });

  it("the graph ranks at most ten barangays", async () => {
    const { data: bgys, error: bgyError } = await admin.from("barangays").select("name").limit(11);
    if (bgyError) throw bgyError;
    const names = (bgys ?? []).map((b) => b.name as string);
    expect(names.length).toBe(11);

    for (const name of names) {
      // The insert trigger derives barangay from location, so it has to be
      // set afterward to land each report under a distinct real barangay.
      const id = await newReport();
      const { error } = await admin.from("depth_reports").update({ barangay: name }).eq("id", id);
      if (error) throw error;
    }

    const { data } = await masterClient.rpc("board_graph");
    const graph = data as { barangays: { barangay: string; count: number }[] };
    expect(graph.barangays.length).toBeLessThanOrEqual(10);
  });

  it("the graph ignores anything older than 48 hours", async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await newReport({ hazard_type: "earthquake", reported_at: threeDaysAgo.toISOString() });

    const { data } = await masterClient.rpc("board_graph");
    const graph = data as { hours: { hour: string; hazard: string | null; count: number }[] };
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    expect(graph.hours.every((h) => new Date(h.hour).getTime() >= cutoff)).toBe(true);
  });
});
