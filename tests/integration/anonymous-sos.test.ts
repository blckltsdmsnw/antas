import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Sending an SOS without an account.
 *
 * Sign-in here is a magic link - type an email, wait for it, open the mail app,
 * click, come back. On every other screen that is minor friction. On /sos it is
 * minutes, needing signal and a working inbox, from somebody standing in rising
 * water, so the product was refusing a call for help over paperwork at the
 * exact moment it exists to avoid doing that.
 *
 * The fix is an anonymous SESSION rather than an unauthenticated write, and
 * these tests exist to prove that distinction held: the row still has a real
 * reporter, every policy still applies, and nothing else was loosened to make
 * it work.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);

/** A fresh client each time: an anonymous session belongs to one device. */
function newVisitor() {
  return createClient(url, anonKey, opts);
}

async function sendSos(client: ReturnType<typeof newVisitor>, userId: string) {
  return client
    .from("sos_signals")
    .insert({
      reporter_id: userId,
      location: "SRID=4326;POINT(121.0950 14.6560)",
      depth: "chest",
      photo_path: `${userId}/x.jpg`,
    })
    .select("id, reporter_id")
    .single();
}

describe("an SOS from somebody with no account", () => {
  it("can be sent at all", async () => {
    const visitor = newVisitor();
    const { data: session, error: authError } =
      await visitor.auth.signInAnonymously();

    expect(authError).toBeNull();
    expect(session.user).not.toBeNull();

    const { data, error } = await sendSos(visitor, session.user!.id);
    expect(error).toBeNull();
    expect(data!.id).toBeTruthy();
  });

  it("still records a real reporter, not a null one", async () => {
    // The whole reason this is an anonymous session and not an unauthenticated
    // write. reporter_id is not-null and referenced by profiles, reputation and
    // the one-active-signal index; a null there would have meant loosening all
    // of them just to remove a sign-in prompt.
    const visitor = newVisitor();
    const { data: session } = await visitor.auth.signInAnonymously();
    const { data } = await sendSos(visitor, session.user!.id);

    expect(data!.reporter_id).toBe(session.user!.id);

    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", session.user!.id)
      .maybeSingle();
    expect(profile).not.toBeNull();
  });

  it("is still bound by the one-active-signal rule", async () => {
    // An anonymous account is not a way around the abuse controls everybody
    // else is subject to.
    const visitor = newVisitor();
    const { data: session } = await visitor.auth.signInAnonymously();

    const first = await sendSos(visitor, session.user!.id);
    expect(first.error).toBeNull();

    const second = await sendSos(visitor, session.user!.id);
    expect(second.error).not.toBeNull();
  });

  it("still cannot file in somebody else's name", async () => {
    const other = await admin.auth.admin.createUser({
      email: `anon-other-${Date.now()}@example.test`,
      email_confirm: true,
    });

    const visitor = newVisitor();
    await visitor.auth.signInAnonymously();

    const { error } = await sendSos(visitor, other.data.user!.id);
    expect(error).not.toBeNull();
  });

  it("still cannot read anybody else's signals", async () => {
    // Anonymous does not mean unprivileged-but-nosy. A distressed person's
    // location and photograph stay exactly as private as they were.
    const visitor = newVisitor();
    const { data: session } = await visitor.auth.signInAnonymously();
    await sendSos(visitor, session.user!.id);

    const other = newVisitor();
    await other.auth.signInAnonymously();

    const { data } = await other.from("sos_signals").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("still cannot reach the moderator queue", async () => {
    const visitor = newVisitor();
    await visitor.auth.signInAnonymously();

    const { data, error } = await visitor.rpc("moderator_queue");
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("can leave a number that reaches the moderator", async () => {
    // The loop this closes: an anonymous sender has no email, so without a
    // number there is no way to reach them at all, and the console's call
    // button would read "walang numero" on almost every signal. The prompt
    // appears only after the signal is sent - nothing may delay that.
    const visitor = newVisitor();
    const { data: session } = await visitor.auth.signInAnonymously();
    const { data: signal } = await sendSos(visitor, session.user!.id);

    const { error: saveError } = await visitor
      .from("profiles")
      .update({ phone: "+639171234567" })
      .eq("id", session.user!.id);
    expect(saveError).toBeNull();

    // Now read it the way the console does.
    const mod = await admin.auth.admin.createUser({
      email: `anon-mod-${Date.now()}@example.test`,
      password: "test-password-123",
      email_confirm: true,
    });
    const { data: row } = await admin
      .from("sos_signals")
      .select("barangay")
      .eq("id", signal!.id)
      .single();
    await admin.from("moderators").insert({
      user_id: mod.data.user!.id,
      barangay: row!.barangay,
      role: "moderator",
    });

    const modClient = createClient(url, anonKey, opts);
    await modClient.auth.signInWithPassword({
      email: mod.data.user!.email!,
      password: "test-password-123",
    });

    const { data: detail } = await modClient.rpc("sos_detail", {
      signal_id: signal!.id,
    });
    expect((detail ?? [])[0]?.reporter_phone).toBe("+639171234567");
  });

  it("is marked anonymous, so a moderator could tell if it ever mattered", async () => {
    const visitor = newVisitor();
    const { data: session } = await visitor.auth.signInAnonymously();

    const { data: user } = await admin.auth.admin.getUserById(session.user!.id);
    expect(user.user!.is_anonymous).toBe(true);
  });
});
