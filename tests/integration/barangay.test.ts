import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Each client keeps its own in-memory session; supabase-js otherwise shares one
// storage slot derived from the project URL.
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const anon = createClient(url, anonKey, opts);

let reporterId: string;

/** Inserts a signal, returns the barangay the database assigned, then clears
 *  it so the one-active-signal index does not block the next case. */
async function makeSignal(lon: number, lat: number): Promise<string | null> {
  const { data, error } = await admin
    .from("sos_signals")
    .insert({
      reporter_id: reporterId,
      location: `SRID=4326;POINT(${lon} ${lat})`,
      depth: "chest",
      photo_path: `${reporterId}/test.jpg`,
    })
    .select("barangay")
    .single();
  if (error) throw error;

  await admin
    .from("sos_signals")
    .update({ status: "dismissed" })
    .eq("reporter_id", reporterId)
    .in("status", ["pending", "under_review", "confirmed"]);

  return data.barangay;
}

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `barangay-${Date.now()}@example.test`,
    password: "test-password-123",
    email_confirm: true,
  });
  if (error) throw error;
  reporterId = data.user!.id;
});

describe("barangay assignment", () => {
  it("assigns a barangay automatically on insert", async () => {
    const barangay = await makeSignal(121.095, 14.656);
    expect(barangay).not.toBeNull();
  });

  it("picks the nearest barangay to the point", async () => {
    // Directly on Malanday's centroid.
    expect(await makeSignal(121.095, 14.656)).toBe("Malanday");

    // Directly on Nangka's, well to the north.
    expect(await makeSignal(121.108, 14.68)).toBe("Nangka");
  });

  it("leaves an explicitly supplied barangay alone", async () => {
    const { data, error } = await admin
      .from("sos_signals")
      .insert({
        reporter_id: reporterId,
        location: "SRID=4326;POINT(121.095 14.656)",
        depth: "waist",
        photo_path: `${reporterId}/explicit.jpg`,
        barangay: "Fortune",
      })
      .select("barangay")
      .single();
    if (error) throw error;

    expect(data.barangay).toBe("Fortune");

    await admin
      .from("sos_signals")
      .update({ status: "dismissed" })
      .eq("reporter_id", reporterId)
      .in("status", ["pending", "under_review", "confirmed"]);
  });

  it("exposes barangay names as public reference data", async () => {
    const { data, error } = await anon.from("barangays").select("name");

    expect(error).toBeNull();
    expect((data ?? []).length).toBe(16);
  });

  it("never leaves a signal without a barangay", async () => {
    const { count } = await admin
      .from("sos_signals")
      .select("id", { count: "exact", head: true })
      .is("barangay", null);

    expect(count).toBe(0);
  });
});
