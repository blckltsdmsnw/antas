import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

/**
 * The photograph's fingerprint, and what the database will accept as one.
 *
 * The scoring rule is unit-tested; this covers the half only a real database
 * can answer - that the column rejects anything which is not a digest, that a
 * sender cannot write their own, and that counting earlier signals carrying the
 * same image actually finds them.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);

/** Two different one-pixel JPEGs, so "same bytes" is a real question. */
const PHOTO_A = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);
const PHOTO_B = Buffer.concat([PHOTO_A, Buffer.from([0x00])]);

const hashOf = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

async function makeUser(prefix: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: "test-password-123",
    email_confirm: true,
  });
  if (error) throw error;
  return { id: data.user!.id, email: data.user!.email! };
}

/** A signal from its own reporter, so the one-active index never bites. */
async function newSignal(fingerprint: string | null) {
  const author = await makeUser("fp-reporter");
  const { data, error } = await admin
    .from("sos_signals")
    .insert({
      reporter_id: author.id,
      location: "SRID=4326;POINT(121.0950 14.6560)",
      depth: "chest",
      photo_path: `${author.id}/x.jpg`,
      photo_sha256: fingerprint,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

beforeAll(async () => {
  await makeUser("fp-owner");
});

describe("what the column will accept", () => {
  it("takes a lowercase 64-character hex digest", async () => {
    const id = await newSignal(hashOf(PHOTO_A));
    expect(id).toBeTruthy();
  });

  it("takes nothing at all, for a signal never fingerprinted", async () => {
    // Signals sent before 0026 have no hash, and that has to stay legal - the
    // scorer reads the absence as silence rather than as suspicion.
    const id = await newSignal(null);
    expect(id).toBeTruthy();
  });

  it("refuses anything that is not a digest", async () => {
    // The constraint is the second barrier. A truncated or uppercase value
    // would silently never match anything, so reuse would quietly stop being
    // detected with nothing to show that it had.
    for (const bad of [
      "not-a-hash",
      hashOf(PHOTO_A).toUpperCase(),
      hashOf(PHOTO_A).slice(0, 40),
      `${hashOf(PHOTO_A)}00`,
    ]) {
      await expect(newSignal(bad)).rejects.toBeTruthy();
    }
  });
});

describe("finding a photo that was sent before", () => {
  it("counts earlier signals carrying the same bytes", async () => {
    const digest = hashOf(PHOTO_A);
    const first = await newSignal(digest);
    const second = await newSignal(digest);

    // Exactly the query the enrichment runs: same hash, not this row.
    const { count } = await admin
      .from("sos_signals")
      .select("id", { count: "exact", head: true })
      .eq("photo_sha256", digest)
      .neq("id", second);

    expect(count).toBeGreaterThanOrEqual(1);
    expect(first).not.toBe(second);
  });

  it("does not match a different photograph", async () => {
    // One byte apart. If this matched, every signal would look reused.
    const onlyOne = await newSignal(hashOf(PHOTO_B));

    const { count } = await admin
      .from("sos_signals")
      .select("id", { count: "exact", head: true })
      .eq("photo_sha256", hashOf(PHOTO_B))
      .neq("id", onlyOne);

    expect(count).toBe(0);
  });
});

describe("who may write a fingerprint", () => {
  it("does not let a sender set or change their own", async () => {
    // `authenticated` holds no UPDATE on sos_signals at all, so the fingerprint
    // is the server's word about the image and never the sender's.
    const sender = createClient(url, anonKey, opts);
    const owner = await makeUser("fp-writer");
    await sender.auth.signInWithPassword({
      email: owner.email,
      password: "test-password-123",
    });

    const { data: signal } = await sender
      .from("sos_signals")
      .insert({
        reporter_id: owner.id,
        location: "SRID=4326;POINT(121.0950 14.6560)",
        depth: "chest",
        photo_path: `${owner.id}/x.jpg`,
      })
      .select("id")
      .single();

    await sender
      .from("sos_signals")
      .update({ photo_sha256: hashOf(PHOTO_B) })
      .eq("id", signal!.id);

    const { data: after } = await admin
      .from("sos_signals")
      .select("photo_sha256")
      .eq("id", signal!.id)
      .single();

    expect(after!.photo_sha256).toBeNull();
  });
});
