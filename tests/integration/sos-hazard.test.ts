// tests/integration/sos-hazard.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/** The hazard on an SOS, read back where a moderator and the scorer need it. */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const modClient = createClient(url, anonKey, opts);

const PASSWORD = "test-password-123";
const HOME = "Malanday";
const MALANDAY = "SRID=4326;POINT(121.0950 14.6560)";
/** Well away from Malanday, so this file's corroboration counts are its own. */
const FORTUNE = "SRID=4326;POINT(121.1220 14.6720)";
const NEAR_FORTUNE = { lat: 14.672, lon: 121.122, radius_m: 300, within_minutes: 60 };

let reporterId: string;

async function makeUser(prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  return { id: data.user!.id, email };
}

async function newSignal(hazard: string | null): Promise<string> {
  const reporter = await makeUser("sig");
  const { data, error } = await admin
    .from("sos_signals")
    .insert({ reporter_id: reporter.id, location: MALANDAY, photo_path: `${reporter.id}/x.jpg`, hazard_type: hazard })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  const m = await makeUser("mod");
  const r = await makeUser("reporter");
  reporterId = r.id;
  await admin.from("moderators").insert({ user_id: m.id, barangay: HOME, role: "admin" });
  const { error } = await modClient.auth.signInWithPassword({ email: m.email, password: PASSWORD });
  if (error) throw error;
});

describe("the queue and the detail", () => {
  it("carry the hazard, and null when none was chosen", async () => {
    const fire = await newSignal("fire");
    const none = await newSignal(null);
    const { data } = await modClient.rpc("moderator_queue");
    const rows = data as { id: string; hazard_type: string | null }[];
    expect(rows.find((r) => r.id === fire)!.hazard_type).toBe("fire");
    expect(rows.find((r) => r.id === none)!.hazard_type).toBeNull();

    const { data: detail } = await modClient.rpc("sos_detail", { signal_id: fire });
    expect((detail as { hazard_type: string }[])[0].hazard_type).toBe("fire");
  });

  it("still promotes a pending signal to under_review on open", async () => {
    // 0025's behaviour must survive the recreate.
    const id = await newSignal("flood");
    await modClient.rpc("sos_detail", { signal_id: id });
    const { data } = await admin.from("sos_signals").select("status").eq("id", id).single();
    expect(data!.status).toBe("under_review");
  });
});

describe("corroborating_reports with a hazard", () => {
  /**
   * The counts below are absolute, so this file must leave the local database
   * exactly as it found it. Every row it inserts is deleted by id afterwards -
   * nothing is matched by age or by location, so no row this file did not
   * create can ever be caught by the cleanup.
   */
  let inserted: string[] = [];

  afterAll(async () => {
    if (inserted.length > 0) await admin.from("depth_reports").delete().in("id", inserted);
  });

  beforeAll(async () => {
    const { data, error } = await admin.from("depth_reports").insert([
      { reporter_id: reporterId, location: FORTUNE, hazard_type: "fire", severity: 2 },
      { reporter_id: reporterId, location: FORTUNE, hazard_type: "fire", severity: 3 },
      // hazard_type is spelled out even though the column defaults to 'flood':
      // a bulk insert unions the keys across the rows, so PostgREST would send
      // an explicit null here and the default would never fire.
      { reporter_id: reporterId, location: FORTUNE, hazard_type: "flood", depth: "knee" },
    ]).select("id");
    if (error) throw error;
    inserted = (data as { id: string }[]).map((r) => r.id);
  });

  it("counts only the same hazard when one is given", async () => {
    const { data } = await admin.rpc("corroborating_reports", { ...NEAR_FORTUNE, hazard: "fire" });
    expect(data).toBe(2);
  });

  it("counts everything when none is given - the old call shape still works", async () => {
    const { data, error } = await admin.rpc("corroborating_reports", NEAR_FORTUNE);
    expect(error).toBeNull();
    expect(data).toBe(3);
  });

  it("is closed to anon", async () => {
    const { error } = await createClient(url, anonKey, opts).rpc("corroborating_reports", NEAR_FORTUNE);
    expect(error).not.toBeNull();
  });
});
