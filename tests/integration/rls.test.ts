import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// supabase-js persists sessions to a storage key derived from the project URL,
// so multiple clients against the same project in one process share storage by
// default -- authed's signed-in session would otherwise bleed into anon's
// requests. None of these clients need a session to survive past this test run.
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, clientOptions);
const anon = createClient(url, anonKey, clientOptions);
const authed = createClient(url, anonKey, clientOptions);

const reporterPassword = "test-password-123";

let reporterId: string;
let otherUserId: string;

beforeAll(async () => {
  const reporterEmail = `reporter-${Date.now()}@example.test`;

  const { data, error } = await admin.auth.admin.createUser({
    email: reporterEmail,
    password: reporterPassword,
    email_confirm: true,
  });
  if (error) throw error;
  reporterId = data.user!.id;

  const { data: otherData, error: otherError } = await admin.auth.admin.createUser({
    email: `other-${Date.now()}@example.test`,
    password: "test-password-456",
    email_confirm: true,
  });
  if (otherError) throw otherError;
  otherUserId = otherData.user!.id;

  const { error: insertError } = await admin.from("depth_reports").insert({
    reporter_id: reporterId,
    location: "SRID=4326;POINT(121.1 14.65)",
    depth: "knee",
    source: "seed",
  });
  if (insertError) throw insertError;

  const { error: signInError } = await authed.auth.signInWithPassword({
    email: reporterEmail,
    password: reporterPassword,
  });
  if (signInError) throw signInError;
});

describe("depth_reports row-level security", () => {
  it("lets an anonymous visitor read active reports", async () => {
    const { data, error } = await anon.from("depth_reports").select("id, depth");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("hides reports that are not active", async () => {
    await admin.from("depth_reports").insert({
      reporter_id: reporterId,
      location: "SRID=4326;POINT(121.11 14.66)",
      depth: "chest",
      status: "hidden",
      source: "seed",
    });

    const { data } = await anon.from("depth_reports").select("id, status");
    expect(data!.every((row) => row.status === "active")).toBe(true);
  });

  it("refuses an insert from an anonymous visitor", async () => {
    const { error } = await anon.from("depth_reports").insert({
      reporter_id: reporterId,
      location: "SRID=4326;POINT(121.1 14.65)",
      depth: "waist",
    });
    expect(error).not.toBeNull();
  });

  it("refuses an anonymous visitor reading profiles", async () => {
    const { data, error } = await anon.from("profiles").select("id, display_name");
    // No profile data must ever come back to an anonymous visitor, full stop.
    expect(data ?? []).toEqual([]);
    // But we also have two independent barriers -- no grant to anon, and RLS --
    // and want to know specifically that the grant layer is the one denying this.
    // A grant-layer denial surfaces as Postgres error 42501 (insufficient_privilege);
    // an RLS-only denial would instead return { data: [], error: null }. Pinning to
    // 42501 means a regression that restores `grant select on profiles to anon`
    // (the exact defect fixed by 0002_rls.sql) turns this test red even though RLS
    // alone would still filter the rows to an empty array.
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("does not expose spatial_ref_sys through the REST API", async () => {
    // PostGIS's spatial_ref_sys is a writable catalog table with no RLS of its own.
    // It must be installed in the `extensions` schema, which PostgREST does not
    // serve, rather than in `public`. This proves that boundary is holding: a 200
    // here would mean the table is reachable again (and, un-migrated, writable) at
    // the REST API with only the anon key.
    const { status } = await anon.from("spatial_ref_sys").select("srid").limit(1);
    expect(status).not.toBe(200);
  });

  it("does not let a signed-in user read another user's profile", async () => {
    const { data } = await authed.from("profiles").select("id");
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(reporterId);
  });

  it("does not let a signed-in user file a report in someone else's name", async () => {
    const { error } = await authed.from("depth_reports").insert({
      reporter_id: otherUserId,
      location: "SRID=4326;POINT(121.1 14.65)",
      depth: "waist",
    });
    expect(error).not.toBeNull();
  });

  it("lets a signed-in user update their own profile", async () => {
    const newDisplayName = `Updated Name ${Date.now()}`;

    const { error } = await authed
      .from("profiles")
      .update({ display_name: newDisplayName })
      .eq("id", reporterId);
    expect(error).toBeNull();

    const { data, error: readError } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", reporterId)
      .single();
    expect(readError).toBeNull();
    expect(data!.display_name).toBe(newDisplayName);
  });

  it("does not let a signed-in user update another user's profile", async () => {
    // The update may return no error at all -- the USING clause simply matches
    // zero rows, so PostgREST reports success with nothing changed. The only
    // reliable proof is reading the target row back and confirming it is untouched.
    const { data: before } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", otherUserId)
      .single();

    await authed.from("profiles").update({ display_name: "hacked" }).eq("id", otherUserId);

    const { data: after, error: readError } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", otherUserId)
      .single();
    expect(readError).toBeNull();
    expect(after!.display_name).toBe(before!.display_name);
    expect(after!.display_name).not.toBe("hacked");
  });
});

describe("depth_reports cannot be edited or deleted", () => {
  // These were once denied twice over -- no grant, and no policy. 0018 changed
  // half of that: hiding your own report needs an UPDATE path, so `authenticated`
  // now holds `update (status)` on depth_reports plus a policy pinning the new
  // value to 'hidden'.
  //
  // That the grant is COLUMN-SCOPED is what keeps these tests meaningful. Depth
  // is a different column, so it must still be refused, and a future migration
  // that widens the grant to the whole table (`grant update on depth_reports to
  // authenticated`) fails here rather than silently letting reporters rewrite a
  // claim after it has been scored. See report-updates.test.ts for the other
  // half: that 'hidden' is the only value the one permitted column may take.
  it("does not let a signed-in user update a depth report", async () => {
    // Each test inserts and targets its own row (by id) rather than sharing rows
    // with other tests, so the assertion doesn't depend on query ordering being
    // stable across two separate reads.
    const { data: inserted, error: insertError } = await admin
      .from("depth_reports")
      .insert({
        reporter_id: reporterId,
        location: "SRID=4326;POINT(121.12 14.67)",
        depth: "knee",
        source: "seed",
      })
      .select("id, depth")
      .single();
    expect(insertError).toBeNull();

    await authed.from("depth_reports").update({ depth: "above_head" }).eq("id", inserted!.id);

    const { data: after, error: afterError } = await admin
      .from("depth_reports")
      .select("depth")
      .eq("id", inserted!.id)
      .single();
    expect(afterError).toBeNull();
    expect(after!.depth).toBe(inserted!.depth);
  });

  it("does not let a signed-in user delete a depth report", async () => {
    const { data: inserted, error: insertError } = await admin
      .from("depth_reports")
      .insert({
        reporter_id: reporterId,
        location: "SRID=4326;POINT(121.13 14.68)",
        depth: "chest",
        source: "seed",
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();

    await authed.from("depth_reports").delete().eq("id", inserted!.id);

    const { data: after, error: afterError } = await admin
      .from("depth_reports")
      .select("id")
      .eq("id", inserted!.id)
      .single();
    expect(afterError).toBeNull();
    expect(after).not.toBeNull();
  });
});
