import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Suspension, which until 0023 suspended nothing.
 *
 * `decide_sos` had written `profiles.suspended_at` since 0010 and nothing ever
 * read it, so a moderator dismissing three fabricated signals believed they had
 * stopped somebody and had in fact set a timestamp. The suspended person could
 * also clear it themselves, because the UPDATE grant covered the whole table.
 *
 * The third case here is the one worth reading twice: an SOS from a suspended
 * account must still go through. The rule this system is built on is that it
 * never refuses a call for help, and somebody who fabricated three floods last
 * year can still be in one today.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const suspended = createClient(url, anonKey, opts);
const ordinary = createClient(url, anonKey, opts);

const PASSWORD = "test-password-123";

let suspendedId: string;
let ordinaryId: string;

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

function report(client: typeof ordinary, reporterId: string) {
  return client.from("depth_reports").insert({
    reporter_id: reporterId,
    location: "SRID=4326;POINT(121.0950 14.6560)",
    depth: "knee",
  });
}

beforeAll(async () => {
  const bad = await makeUser("suspended");
  const good = await makeUser("ordinary");
  suspendedId = bad.id;
  ordinaryId = good.id;

  await admin
    .from("profiles")
    .update({ suspended_at: new Date().toISOString() })
    .eq("id", suspendedId);

  for (const [client, user] of [
    [suspended, bad],
    [ordinary, good],
  ] as const) {
    const { error } = await client.auth.signInWithPassword({
      email: user.email,
      password: PASSWORD,
    });
    if (error) throw error;
  }
});

describe("a suspended reporter", () => {
  it("cannot file a depth report", async () => {
    const { error } = await report(suspended, suspendedId);
    expect(error).not.toBeNull();
  });

  it("cannot clear their own suspension", async () => {
    // The grant used to cover every column of the row, so this took one
    // request. Verified against a real database before 0023 was written.
    await suspended
      .from("profiles")
      .update({ suspended_at: null })
      .eq("id", suspendedId);

    const { data } = await admin
      .from("profiles")
      .select("suspended_at")
      .eq("id", suspendedId)
      .single();

    expect(data!.suspended_at).not.toBeNull();
  });

  it("can still send an SOS", async () => {
    // THE ONE THAT MATTERS. The system never refuses a call for help - somebody
    // who fabricated three floods last year can still be in one today, and a
    // check here would be the product deciding, from its own moderation
    // history, that a person's emergency does not count. Doubt is expressed by
    // scoring the signal lower, never by dropping it.
    const { error } = await suspended.from("sos_signals").insert({
      reporter_id: suspendedId,
      location: "SRID=4326;POINT(121.0950 14.6560)",
      depth: "chest",
      photo_path: `${suspendedId}/x.jpg`,
    });

    expect(error).toBeNull();
  });

  it("can still correct their own contact details", async () => {
    // Suspension withdraws the ability to contribute, not the ability to be
    // reached - the phone number matters most in the emergency they can still
    // report.
    const { error } = await suspended
      .from("profiles")
      .update({ phone: "+639171234567", display_name: "Pangalan" })
      .eq("id", suspendedId);

    expect(error).toBeNull();
  });
});

describe("an ordinary reporter", () => {
  it("can still file depth reports", async () => {
    // Otherwise the first test passes for the wrong reason: a policy refusing
    // everybody would satisfy it just as well.
    const { error } = await report(ordinary, ordinaryId);
    expect(error).toBeNull();
  });

  it("cannot suspend themselves either, in either direction", async () => {
    // The column is simply not writable by users any more, so nobody can forge
    // a suspension onto their own row or lift one from it.
    await ordinary
      .from("profiles")
      .update({ suspended_at: new Date().toISOString() })
      .eq("id", ordinaryId);

    const { data } = await admin
      .from("profiles")
      .select("suspended_at")
      .eq("id", ordinaryId)
      .single();

    expect(data!.suspended_at).toBeNull();
  });
});
