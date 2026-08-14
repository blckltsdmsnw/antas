import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * The reporter's phone number: reachable by whoever may act on their SOS, and
 * by nobody else.
 *
 * This is the most identifying thing the schema now holds. `profiles` is scoped
 * to `id = auth.uid()` and denied to anon at the grant layer, so the only path
 * to somebody else's number is `sos_detail` - which already refuses callers who
 * may not see the signal. These tests exist because that is one `select` away
 * from ceasing to be true, and the failure would be silent.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const anon = createClient(url, anonKey, opts);
const modClient = createClient(url, anonKey, opts);
const outsiderClient = createClient(url, anonKey, opts);
const reporterClient = createClient(url, anonKey, opts);

const PASSWORD = "test-password-123";
const HOME = "Malanday";
const AWAY = "South Signal Village";
const NUMBER = "+639171234567";

let reporterId: string;
let signalId: string;

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
  const reporter = await makeUser("phone-reporter");
  const mod = await makeUser("phone-mod");
  const outsider = await makeUser("phone-outsider");
  reporterId = reporter.id;

  await admin.from("profiles").update({ phone: NUMBER }).eq("id", reporterId);

  await admin.from("moderators").insert([
    { user_id: mod.id, barangay: HOME, role: "moderator" },
    { user_id: outsider.id, barangay: AWAY, role: "moderator" },
  ]);

  const { data: signal, error } = await admin
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
  signalId = signal!.id;

  await admin.from("sos_signals").update({ barangay: HOME }).eq("id", signalId);

  for (const [client, user] of [
    [modClient, mod],
    [outsiderClient, outsider],
    [reporterClient, reporter],
  ] as const) {
    const { error: signInError } = await client.auth.signInWithPassword({
      email: user.email,
      password: PASSWORD,
    });
    if (signInError) throw signInError;
  }
});

describe("who can read a reporter's number", () => {
  it("hands it to a moderator for that signal's barangay", async () => {
    const { data, error } = await modClient.rpc("sos_detail", {
      signal_id: signalId,
    });

    expect(error).toBeNull();
    expect((data ?? [])[0]?.reporter_phone).toBe(NUMBER);
  });

  it("does not hand it to a moderator of a different barangay", async () => {
    // The same barrier that hides the signal hides the number with it, so
    // there is no separate check to forget.
    const { data } = await outsiderClient.rpc("sos_detail", {
      signal_id: signalId,
    });
    expect(data ?? []).toEqual([]);
  });

  it("refuses an anonymous caller at the grant layer", async () => {
    const { error } = await anon.rpc("sos_detail", { signal_id: signalId });
    expect(error).not.toBeNull();
  });

  it("never exposes it through the profiles table", async () => {
    // The direct route. A moderator reading `profiles` must get their own row
    // and nothing else, or the definer function is decoration.
    const { data } = await modClient.from("profiles").select("id, phone");

    expect((data ?? []).length).toBeLessThanOrEqual(1);
    expect((data ?? []).map((row: { id: string }) => row.id)).not.toContain(
      reporterId,
    );
  });

  it("never exposes it to an anonymous reader of profiles", async () => {
    const { data, error } = await anon.from("profiles").select("phone");

    expect(data ?? []).toEqual([]);
    // Denied by the grant, not merely filtered by row-level security.
    expect(error?.code).toBe("42501");
  });

  it("lets the reporter read and change their own", async () => {
    const { data } = await reporterClient
      .from("profiles")
      .select("phone")
      .eq("id", reporterId)
      .single();
    expect(data!.phone).toBe(NUMBER);

    const { error } = await reporterClient
      .from("profiles")
      .update({ phone: "+639998887777" })
      .eq("id", reporterId);
    expect(error).toBeNull();
  });
});

describe("what may be stored in the column", () => {
  it("refuses a number that is not E.164", async () => {
    // The application normalises before writing; this is the second barrier,
    // because a number stored in a shape that will not dial is discovered by
    // somebody failing to reach a person in a flood.
    for (const bad of ["09171234567", "+63 917 123 4567", "12345", "wala"]) {
      const { error } = await admin
        .from("profiles")
        .update({ phone: bad })
        .eq("id", reporterId);
      expect(error).not.toBeNull();
    }
  });

  it("allows no number at all", async () => {
    // Optional on purpose. A required phone number on a flood map is a reason
    // not to report at all.
    const { error } = await admin
      .from("profiles")
      .update({ phone: null })
      .eq("id", reporterId);
    expect(error).toBeNull();
  });

  it("returns null rather than failing when the reporter gave none", async () => {
    await admin.from("profiles").update({ phone: null }).eq("id", reporterId);

    const { data, error } = await modClient.rpc("sos_detail", {
      signal_id: signalId,
    });

    expect(error).toBeNull();
    expect((data ?? [])[0]?.reporter_phone).toBeNull();
    // ...and the rest of the signal still arrives, so a missing number never
    // costs a moderator the signal itself.
    expect((data ?? [])[0]?.barangay).toBe(HOME);
  });
});
