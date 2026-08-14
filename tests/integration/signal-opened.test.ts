import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Opening a signal moves it to `under_review`, and the sender can see that.
 *
 * The state has existed in the enum since 0005 and in `canTransition` since the
 * same phase, and nothing ever performed the transition - every signal sat at
 * 'pending' until it was confirmed or dismissed. It is worth performing because
 * it is the only thing the sender can honestly be told: they cannot read
 * `signal_events` (correctly - who looked is not their business), so the status
 * is how "a person read this" reaches them.
 *
 * The middle cases are the boundary. An unauthorised probe must not be able to
 * change a signal's state, and reopening must not walk back a decision.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const PASSWORD = "test-password-123";
const HOME = "Malanday";
const AWAY = "Ususan";

let modClient: SupabaseClient;
let outsiderClient: SupabaseClient;
let reporter: { id: string; email: string };
let reporterClient: SupabaseClient;

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

async function signedIn(user: { email: string }): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, opts);
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: PASSWORD,
  });
  if (error) throw error;
  return client;
}

/** A fresh signal from its own reporter, so the one-active index never bites. */
async function newSignal(barangay = HOME) {
  const author = await makeUser("opened-reporter");
  const { data, error } = await admin
    .from("sos_signals")
    .insert({
      reporter_id: author.id,
      location: "SRID=4326;POINT(121.0950 14.6560)",
      depth: "chest",
      photo_path: `${author.id}/x.jpg`,
    })
    .select("id")
    .single();
  if (error) throw error;

  await admin.from("sos_signals").update({ barangay }).eq("id", data!.id);
  return { id: data!.id as string, author };
}

async function statusOf(id: string) {
  const { data } = await admin
    .from("sos_signals")
    .select("status")
    .eq("id", id)
    .single();
  return data!.status as string;
}

beforeAll(async () => {
  const mod = await makeUser("opened-mod");
  const outsider = await makeUser("opened-outsider");
  reporter = await makeUser("opened-watcher");

  await admin.from("moderators").insert([
    { user_id: mod.id, barangay: HOME, role: "moderator" },
    { user_id: outsider.id, barangay: AWAY, role: "moderator" },
  ]);

  modClient = await signedIn(mod);
  outsiderClient = await signedIn(outsider);
  reporterClient = await signedIn(reporter);
});

describe("opening a signal", () => {
  it("moves it from pending to under_review", async () => {
    const signal = await newSignal();
    expect(await statusOf(signal.id)).toBe("pending");

    await modClient.rpc("sos_detail", { signal_id: signal.id });

    expect(await statusOf(signal.id)).toBe("under_review");
  });

  it("does not change it when somebody who may not see it probes", async () => {
    // The scope check is repeated on the update for exactly this. An
    // unauthorised probe already gets no data and leaves no audit row; it must
    // not be able to move the signal either.
    const signal = await newSignal();

    await outsiderClient.rpc("sos_detail", { signal_id: signal.id });

    expect(await statusOf(signal.id)).toBe("pending");
  });

  it("does not walk back a decision when reopened", async () => {
    // A moderator rereading a dismissed signal must not resurrect it. Only
    // 'pending' is promoted.
    const signal = await newSignal();
    await admin
      .from("sos_signals")
      .update({ status: "dismissed" })
      .eq("id", signal.id);

    await modClient.rpc("sos_detail", { signal_id: signal.id });

    expect(await statusOf(signal.id)).toBe("dismissed");
  });

  it("leaves a confirmed signal confirmed", async () => {
    const signal = await newSignal();
    await admin
      .from("sos_signals")
      .update({ status: "confirmed" })
      .eq("id", signal.id);

    await modClient.rpc("sos_detail", { signal_id: signal.id });

    expect(await statusOf(signal.id)).toBe("confirmed");
  });
});

describe("what the sender can see of it", () => {
  it("lets them read the status of their own signal", async () => {
    // The whole point: this is how "somebody opened it" reaches them, since
    // signal_events is not theirs to read.
    const { data: signal, error } = await reporterClient
      .from("sos_signals")
      .insert({
        reporter_id: reporter.id,
        location: "SRID=4326;POINT(121.0950 14.6560)",
        depth: "chest",
        photo_path: `${reporter.id}/x.jpg`,
      })
      .select("id")
      .single();
    expect(error).toBeNull();

    await admin
      .from("sos_signals")
      .update({ barangay: HOME })
      .eq("id", signal!.id);
    await modClient.rpc("sos_detail", { signal_id: signal!.id });

    const { data: seen } = await reporterClient
      .from("sos_signals")
      .select("status")
      .eq("id", signal!.id)
      .single();

    expect(seen!.status).toBe("under_review");
  });

  it("still keeps the audit trail out of their reach", async () => {
    // They learn that somebody looked. They do not learn who, and that
    // distinction is the reason the status carries the news at all.
    const { data, error } = await reporterClient
      .from("signal_events")
      .select("actor_id");

    expect(data ?? []).toEqual([]);
    expect(error?.code).toBe("42501");
  });
});
