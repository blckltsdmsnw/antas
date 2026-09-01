import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const modClient = createClient(url, anonKey, opts);
const outsiderClient = createClient(url, anonKey, opts);
const reporterClient = createClient(url, anonKey, opts);

let moderatorId: string;
let outsiderId: string;
let reporterId: string;

/** Malanday's centroid, from 0009. */
const MALANDAY = "SRID=4326;POINT(121.0950 14.6560)";

const PASSWORD = "test-password-123";

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

beforeAll(async () => {
  const m = await makeUser("reportmod");
  const o = await makeUser("reportoutsider");
  const r = await makeUser("reportreporter");
  moderatorId = m.id;
  outsiderId = o.id;
  reporterId = r.id;

  await admin.from("moderators").insert([
    { user_id: moderatorId, barangay: "Malanday" },
    { user_id: outsiderId, barangay: "Nangka" },
  ]);
  await admin
    .from("profiles")
    .update({ phone: "+639171234567" })
    .eq("id", reporterId);

  await modClient.auth.signInWithPassword({ email: m.email, password: PASSWORD });
  await outsiderClient.auth.signInWithPassword({
    email: o.email,
    password: PASSWORD,
  });
  await reporterClient.auth.signInWithPassword({ email: r.email, password: PASSWORD });
});

async function newIncident(row: {
  hazard_type: string;
  depth: string | null;
  severity?: number;
}): Promise<string> {
  const { data, error } = await admin
    .from("depth_reports")
    .insert({ reporter_id: reporterId, location: MALANDAY, ...row })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

const NEAR_MALANDAY = { lat: 14.656, lon: 121.095, radius_m: 2000 };

describe("severity is derived for flood", () => {
  it("fills severity from depth when a writer sends only a depth", async () => {
    // The previous deployed build, the seed script and seven test files all
    // insert this shape. If it stops working, the migration broke production.
    const id = await newIncident({ hazard_type: "flood", depth: "chest" });
    const { data } = await admin.from("depth_reports").select("severity").eq("id", id).single();
    expect(data!.severity).toBe(3);
  });

  it("overrules a severity that disagrees with the depth", async () => {
    const id = await newIncident({ hazard_type: "flood", depth: "ankle", severity: 3 });
    const { data } = await admin.from("depth_reports").select("severity").eq("id", id).single();
    expect(data!.severity).toBe(1);
  });

  it("agrees with lib/hazard/severity.ts on every level", async () => {
    // The TypeScript mapping and the SQL mapping must never drift.
    const { severityOfDepth } = await import("@/lib/hazard/severity");
    for (const depth of ["ankle", "knee", "waist", "chest", "above_head"] as const) {
      const id = await newIncident({ hazard_type: "flood", depth });
      const { data } = await admin.from("depth_reports").select("severity").eq("id", id).single();
      expect(data!.severity).toBe(severityOfDepth(depth));
    }
  });

  it("defaults hazard_type to flood, and derives severity from depth, when a writer sends neither", async () => {
    // newIncident always passes hazard_type, so it never exercises the
    // column's `default 'flood'`. buildReportRow sets hazard_type now, but a
    // seed script or an older, not-yet-redeployed writer might not - this is
    // the column default and the depth-to-severity trigger cooperating for a
    // writer that knows nothing about hazards at all.
    const { data, error } = await admin
      .from("depth_reports")
      .insert({ reporter_id: reporterId, location: MALANDAY, depth: "chest" })
      .select("hazard_type, severity")
      .single();
    if (error) throw error;
    expect(data!.hazard_type).toBe("flood");
    expect(data!.severity).toBe(3);
  });
});

describe("the hazard constraints", () => {
  it("refuses a depth on a fire", async () => {
    await expect(newIncident({ hazard_type: "fire", depth: "chest", severity: 2 }))
      .rejects.toBeTruthy();
  });

  it("refuses a flood with no depth", async () => {
    await expect(newIncident({ hazard_type: "flood", depth: null, severity: 1 }))
      .rejects.toBeTruthy();
  });

  it("refuses a fire with no severity", async () => {
    await expect(newIncident({ hazard_type: "fire", depth: null }))
      .rejects.toBeTruthy();
  });

  it("refuses a severity outside 1..3", async () => {
    await expect(newIncident({ hazard_type: "fire", depth: null, severity: 4 }))
      .rejects.toBeTruthy();
  });
});

describe("priority across hazards", () => {
  it("calls a fresh severity-3 fire urgent, like a chest-deep flood", async () => {
    const fire = await newIncident({ hazard_type: "fire", depth: null, severity: 3 });
    const { data } = await modClient.rpc("report_queue");
    const row = (data as { id: string; priority: string }[]).find((r) => r.id === fire);
    expect(row!.priority).toBe("urgent");
  });

  it("carries the hazard to the queue", async () => {
    const fire = await newIncident({ hazard_type: "fire", depth: null, severity: 2 });
    const { data } = await modClient.rpc("report_queue");
    const row = (data as { id: string; hazard_type: string }[]).find((r) => r.id === fire);
    expect(row!.hazard_type).toBe("fire");
  });
});

describe("the public map", () => {
  it("keeps a medical emergency off it", async () => {
    const id = await newIncident({ hazard_type: "medical", depth: null, severity: 3 });
    const stranger = createClient(url, anonKey, opts);
    const { data } = await stranger.rpc("reports_near", NEAR_MALANDAY);
    expect((data as { id: string }[]).map((r) => r.id)).not.toContain(id);
  });

  it("keeps an accident off it", async () => {
    const id = await newIncident({ hazard_type: "accident", depth: null, severity: 2 });
    const stranger = createClient(url, anonKey, opts);
    const { data } = await stranger.rpc("reports_near", NEAR_MALANDAY);
    expect((data as { id: string }[]).map((r) => r.id)).not.toContain(id);
  });

  it("shows a fire on it, with its hazard and severity", async () => {
    const id = await newIncident({ hazard_type: "fire", depth: null, severity: 2 });
    const stranger = createClient(url, anonKey, opts);
    const { data } = await stranger.rpc("reports_near", NEAR_MALANDAY);
    const row = (data as { id: string; hazard_type: string; severity: number }[])
      .find((r) => r.id === id);
    expect(row).toMatchObject({ hazard_type: "fire", severity: 2 });
  });
});

describe("depth_reports, read directly rather than through reports_near (0031)", () => {
  // The RPC's public_hazard() filter was a courtesy sitting beside the real
  // door, not a lock on it: anon holds SELECT on depth_reports itself (0002),
  // so anyone with the anon key - shipped in every client bundle - could
  // issue a direct PostgREST table read and receive medical and accident
  // reports with exact coordinates. This exercises that exact path, not the
  // RPC, so it fails if the table's own RLS policy ever loses its
  // public_hazard() guard again.
  it("keeps medical and accident rows out of a direct anonymous table read, while flood rows stay in", async () => {
    const medicalId = await newIncident({ hazard_type: "medical", depth: null, severity: 3 });
    const accidentId = await newIncident({ hazard_type: "accident", depth: null, severity: 2 });
    const floodId = await newIncident({ hazard_type: "flood", depth: "chest" });

    const stranger = createClient(url, anonKey, opts);
    const { data, error } = await stranger
      .from("depth_reports")
      .select("id, hazard_type")
      .in("id", [medicalId, accidentId, floodId]);

    expect(error).toBeNull();
    const ids = (data as { id: string; hazard_type: string }[]).map((r) => r.id);
    expect(ids).not.toContain(medicalId);
    expect(ids).not.toContain(accidentId);
    expect(ids).toContain(floodId);
  });

  it("still lets a moderator read a medical or accident row directly, for realtime", async () => {
    const medicalId = await newIncident({ hazard_type: "medical", depth: null, severity: 3 });

    const { data, error } = await modClient
      .from("depth_reports")
      .select("id, hazard_type")
      .eq("id", medicalId);

    expect(error).toBeNull();
    expect((data as { id: string }[]).map((r) => r.id)).toContain(medicalId);
  });
});

describe("my_reports (0029)", () => {
  it("returns the hazard and severity for a non-flood report owned by the caller, with depth null", async () => {
    const id = await newIncident({ hazard_type: "fire", depth: null, severity: 2 });
    const { data, error } = await reporterClient.rpc("my_reports");
    expect(error).toBeNull();
    const row = (
      data as { id: string; hazard_type: string; severity: number; depth: string | null }[]
    ).find((r) => r.id === id);
    expect(row).toMatchObject({ hazard_type: "fire", severity: 2, depth: null });
  });
});

describe("the functions this migration did not touch still work", () => {
  // Bodies that name depth_reports are re-parsed at call time. Calling each
  // once is the difference between finding a break here and finding it on a
  // resident's phone.
  it("my_reports", async () => {
    const { error } = await modClient.rpc("my_reports");
    expect(error).toBeNull();
  });
  it("reporter_standing", async () => {
    // Takes a REPORT id (0019:32), not a reporter id.
    const id = await newIncident({ hazard_type: "flood", depth: "knee" });
    const { error } = await modClient.rpc("reporter_standing", { p_report_id: id });
    expect(error).toBeNull();
  });
  it("corroborating_reports counts floods only", async () => {
    // Every other integration test file also writes flood reports near
    // MALANDAY, and corroborating_reports counts globally within its radius
    // and time window rather than scoped to this test's own rows. Under
    // vitest's default file-level parallelism that made a before/after count
    // at MALANDAY race against whichever other file happened to insert a
    // flood report at the same moment (observed: 211 -> 212 with no fire
    // involved). A point no other fixture in this suite comes near removes
    // the race without slowing the suite down.
    const ISOLATED = { lat: 14.35, lon: 120.92, radius_m: 2000 };
    async function isolatedFire(): Promise<string> {
      const { data, error } = await admin
        .from("depth_reports")
        .insert({
          reporter_id: reporterId,
          location: `SRID=4326;POINT(${ISOLATED.lon} ${ISOLATED.lat})`,
          hazard_type: "fire",
          depth: null,
          severity: 3,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    }

    await isolatedFire();
    const { data, error } = await admin.rpc("corroborating_reports", {
      ...ISOLATED, within_minutes: 60, hazard: "flood",
    });
    expect(error).toBeNull();
    // Asked for floods, a fire must not have raised it.
    await isolatedFire();
    const { data: after } = await admin.rpc("corroborating_reports", {
      ...ISOLATED, within_minutes: 60, hazard: "flood",
    });
    expect(after).toBe(data);

    // 0034 moved the flood filter from the function body to a parameter.
    // Asked for nothing, the count is of everything active nearby - an SOS
    // whose sender chose no chip is corroborated by whatever is happening on
    // that street, fires included. This assertion is the old body's rule
    // restated where it now lives, not a weakened one.
    const { data: anyHazard } = await admin.rpc("corroborating_reports", {
      ...ISOLATED, within_minutes: 60,
    });
    expect(anyHazard as number).toBeGreaterThan(after as number);
  });
});
