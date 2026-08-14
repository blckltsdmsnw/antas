import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * The `admin` role, and - just as important - the moderator confinement it must
 * not have loosened.
 *
 * 0020 replaced four copies of the barangay check with one predicate. That is
 * the right shape, but it also means a single mistake now widens every path at
 * once: the queue, the detail view, and the decision. Half of this file exists
 * to prove the ordinary moderator is still exactly as boxed in as before.
 *
 * What is being widened is not ordinary data. An SOS carries a distressed
 * person's exact location and their photograph, so "who can see this" is the
 * most consequential question in the schema.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const adminClient = createClient(url, anonKey, opts);
const modClient = createClient(url, anonKey, opts);
const nobodyClient = createClient(url, anonKey, opts);
const anon = createClient(url, anonKey, opts);

const PASSWORD = "test-password-123";

/** Two barangays that are genuinely different places, in different cities. */
const HOME = "Malanday";
const AWAY = "South Signal Village";

let adminId: string;
let modId: string;

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

/**
 * A signal in a chosen barangay, from a reporter of its own.
 *
 * A fresh reporter each time because of `sos_one_active_per_reporter`: one
 * person may have only one live signal. Dismissing the previous one would work
 * too, but it makes every test depend on the order the others ran in, and the
 * assertions here are about queue membership - exactly what stale rows corrupt.
 *
 * The barangay is set after insert rather than derived from the point: a
 * trigger assigns it by nearest centroid, and this file is about who may see a
 * signal, not about how it got its name.
 */
async function newSignal(barangay: string): Promise<string> {
  const reporter = await makeUser("sig");

  const { data, error } = await admin
    .from("sos_signals")
    .insert({
      reporter_id: reporter.id,
      location: "SRID=4326;POINT(121.0950 14.6560)",
      depth: "chest",
      photo_path: `${reporter.id}/x.jpg`,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: moveError } = await admin
    .from("sos_signals")
    .update({ barangay })
    .eq("id", data.id);
  if (moveError) throw moveError;

  return data.id as string;
}

beforeAll(async () => {
  const a = await makeUser("admin");
  const m = await makeUser("mod");
  const n = await makeUser("nobody");

  adminId = a.id;
  modId = m.id;

  await admin.from("moderators").insert([
    { user_id: adminId, barangay: HOME, role: "admin" },
    { user_id: modId, barangay: HOME, role: "moderator" },
  ]);

  for (const [client, user] of [
    [adminClient, a],
    [modClient, m],
    [nobodyClient, n],
  ] as const) {
    const { error } = await client.auth.signInWithPassword({
      email: user.email,
      password: PASSWORD,
    });
    if (error) throw error;
  }
});

describe("an admin sees past their own barangay", () => {
  it("returns a signal from a barangay they are not assigned to", async () => {
    const id = await newSignal(AWAY);

    const { data, error } = await adminClient.rpc("moderator_queue");
    expect(error).toBeNull();
    expect((data ?? []).map((row: { id: string }) => row.id)).toContain(id);
  });

  it("opens the detail of a signal outside their barangay", async () => {
    const id = await newSignal(AWAY);

    const { data, error } = await adminClient.rpc("sos_detail", {
      signal_id: id,
    });
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(1);
  });

  it("still records who looked, which is what makes the wider scope safe", async () => {
    // The audit entry is the whole justification for letting one account read
    // every barangay. If viewing stopped being recorded, admin would be
    // unaccountable access rather than merely wide access.
    const id = await newSignal(AWAY);
    await adminClient.rpc("sos_detail", { signal_id: id });

    const { data } = await admin
      .from("signal_events")
      .select("actor_id, event_type")
      .eq("sos_id", id)
      .eq("event_type", "viewed");

    expect(
      (data ?? []).map((event: { actor_id: string }) => event.actor_id),
    ).toContain(adminId);
  });

  it("can decide a signal outside their barangay", async () => {
    const id = await newSignal(AWAY);

    const { error } = await adminClient.rpc("decide_sos", {
      signal_id: id,
      decision: "confirmed",
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from("sos_signals")
      .select("status")
      .eq("id", id)
      .single();
    expect(data!.status).toBe("confirmed");
  });
});

describe("an ordinary moderator is still confined", () => {
  it("does not see a signal from another barangay in the queue", async () => {
    const id = await newSignal(AWAY);

    const { data, error } = await modClient.rpc("moderator_queue");
    expect(error).toBeNull();
    expect((data ?? []).map((row: { id: string }) => row.id)).not.toContain(id);
  });

  it("still sees signals from their own barangay", async () => {
    // Otherwise the test above passes for the wrong reason: a queue returning
    // nothing at all would satisfy it just as well.
    const id = await newSignal(HOME);

    const { data } = await modClient.rpc("moderator_queue");
    expect((data ?? []).map((row: { id: string }) => row.id)).toContain(id);
  });

  it("cannot open the detail of a signal from another barangay", async () => {
    const id = await newSignal(AWAY);

    const { data } = await modClient.rpc("sos_detail", { signal_id: id });
    expect(data ?? []).toEqual([]);
  });

  it("leaves no audit trail when probing a signal they may not see", async () => {
    // An unauthorised probe must not write a 'viewed' row, or the log fills up
    // with views that never happened.
    const id = await newSignal(AWAY);
    await modClient.rpc("sos_detail", { signal_id: id });

    const { data } = await admin
      .from("signal_events")
      .select("actor_id")
      .eq("sos_id", id)
      .eq("event_type", "viewed");

    expect(
      (data ?? []).map((event: { actor_id: string }) => event.actor_id),
    ).not.toContain(modId);
  });

  it("cannot decide a signal from another barangay", async () => {
    const id = await newSignal(AWAY);

    const { error } = await modClient.rpc("decide_sos", {
      signal_id: id,
      decision: "confirmed",
    });
    expect(error).not.toBeNull();

    const { data } = await admin
      .from("sos_signals")
      .select("status")
      .eq("id", id)
      .single();
    expect(data!.status).toBe("pending");
  });
});

describe("everybody else", () => {
  it("gives a signed-in non-moderator an empty queue", async () => {
    await newSignal(HOME);

    const { data, error } = await nobodyClient.rpc("moderator_queue");
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("refuses an anonymous caller outright", async () => {
    // Not an empty list. The grant layer must be what stops this, so a future
    // policy change can never quietly become the only thing holding.
    const { error } = await anon.rpc("moderator_queue");
    expect(error).not.toBeNull();
  });

  it("does not expose the scope predicate itself to callers", async () => {
    // `moderates` answers only about auth.uid(), so it leaks nothing even when
    // reachable - but the console never needs it, and an unused entry point is
    // one more thing that has to stay correct forever.
    const { error } = await modClient.rpc("moderates", { p_barangay: AWAY });
    expect(error).not.toBeNull();
  });
});
