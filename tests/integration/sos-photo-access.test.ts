import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Who can open an SOS photograph.
 *
 * 0008 made the bucket private and wrote two policies, both scoped to the
 * uploader's own folder, on the stated understanding that the console would
 * fetch through a signed URL. The console does - and the policy letting anybody
 * but the sender read the object was never written, so no moderator ever saw
 * one. It failed as "Object not found", which is how storage reports a policy
 * denial, and the console rendered the image only when a URL came back, so the
 * card simply appeared without one.
 *
 * Nothing in the suite touched storage, which is why it survived this long.
 * That gap is as much what this file closes as the policy itself.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const anon = createClient(url, anonKey, opts);

const PASSWORD = "test-password-123";
const HOME = "Malanday";
const AWAY = "Ususan";

/** A one-pixel JPEG: a real object, so a denial cannot be read as a 404. */
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

let photoPath: string;
let reporterClient: SupabaseClient;
let modClient: SupabaseClient;
let outsiderClient: SupabaseClient;
let strangerClient: SupabaseClient;

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

async function canOpen(client: SupabaseClient) {
  const { data, error } = await client.storage
    .from("sos-photos")
    .createSignedUrl(photoPath, 60);
  return !error && Boolean(data?.signedUrl);
}

beforeAll(async () => {
  const reporter = await makeUser("photo-reporter");
  const mod = await makeUser("photo-mod");
  const outsider = await makeUser("photo-outsider");
  const stranger = await makeUser("photo-stranger");

  await admin.from("moderators").insert([
    { user_id: mod.id, barangay: HOME, role: "moderator" },
    { user_id: outsider.id, barangay: AWAY, role: "moderator" },
  ]);

  reporterClient = await signedIn(reporter);
  modClient = await signedIn(mod);
  outsiderClient = await signedIn(outsider);
  strangerClient = await signedIn(stranger);

  photoPath = `${reporter.id}/x.jpg`;
  const upload = await reporterClient.storage
    .from("sos-photos")
    .upload(photoPath, JPEG, { contentType: "image/jpeg", upsert: true });
  if (upload.error) throw upload.error;

  const { data: signal, error } = await admin
    .from("sos_signals")
    .insert({
      reporter_id: reporter.id,
      location: "SRID=4326;POINT(121.0950 14.6560)",
      depth: "chest",
      photo_path: photoPath,
    })
    .select("id")
    .single();
  if (error) throw error;

  await admin.from("sos_signals").update({ barangay: HOME }).eq("id", signal!.id);
});

describe("opening an SOS photograph", () => {
  it("lets a moderator for that barangay open it", async () => {
    // The whole point of the console. Judging a stranger's emergency without
    // the only unfakeable evidence in it is not moderation.
    expect(await canOpen(modClient)).toBe(true);
  });

  it("still lets the sender open their own", async () => {
    // 0008's policy must survive: permissive policies are OR-ed, and nobody
    // should lose access to their own photograph.
    expect(await canOpen(reporterClient)).toBe(true);
  });

  it("does not let a moderator of another barangay open it", async () => {
    expect(await canOpen(outsiderClient)).toBe(false);
  });

  it("does not let an ordinary signed-in user open it", async () => {
    expect(await canOpen(strangerClient)).toBe(false);
  });

  it("does not let an anonymous visitor open it", async () => {
    expect(await canOpen(anon)).toBe(false);
  });

  it("does not serve the object from a public URL", async () => {
    // The bucket is private for a reason: this is a photograph of somebody in
    // distress. A guessable URL would make every policy above decorative.
    const { data } = anon.storage.from("sos-photos").getPublicUrl(photoPath);
    const response = await fetch(data.publicUrl);
    expect(response.ok).toBe(false);
  });
});
