import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * "Kumusta na?" at the database boundary.
 *
 * The component is the polite layer; these are the guarantees underneath it. Two
 * of them are the reason the feature is shaped this way at all:
 *
 *   - nobody can read WHO answered, only the counts, so answering does not
 *     publish where you were standing;
 *   - hiding your own report can change `status` and nothing else, so "remove"
 *     can never become "quietly rewrite the depth I claimed an hour ago".
 *
 * Both are enforced by grants rather than by the interface, and a grant is one
 * copy-pasted line away from being undone. That is what these tests are for.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Same reason as rls.test.ts: supabase-js keys session storage off the project
// URL, so two clients against one project would otherwise share a session.
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, clientOptions);
const anon = createClient(url, anonKey, clientOptions);
const authed = createClient(url, anonKey, clientOptions);
const stranger = createClient(url, anonKey, clientOptions);

let reporterId: string;
let strangerId: string;
let reportId: string;

async function makeUser(prefix: string, password: string) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return { id: data.user!.id, email, password };
}

/** A fresh report owned by the reporter, so no two tests share a mutable row. */
async function makeReport(depth = "knee") {
  const { data, error } = await admin
    .from("depth_reports")
    .insert({
      reporter_id: reporterId,
      location: "SRID=4326;POINT(121.1 14.65)",
      depth,
      source: "seed",
    })
    .select("id, depth, status")
    .single();
  if (error) throw error;
  return data!;
}

beforeAll(async () => {
  const reporter = await makeUser("updater", "test-password-123");
  reporterId = reporter.id;

  const other = await makeUser("stranger", "test-password-456");
  strangerId = other.id;

  const signIn = await authed.auth.signInWithPassword({
    email: reporter.email,
    password: reporter.password,
  });
  if (signIn.error) throw signIn.error;

  const signInOther = await stranger.auth.signInWithPassword({
    email: other.email,
    password: other.password,
  });
  if (signInOther.error) throw signInOther.error;

  reportId = (await makeReport()).id;
});

describe("report_updates privacy", () => {
  it("never hands the rows to an anonymous visitor", async () => {
    await admin.from("report_updates").insert({
      report_id: reportId,
      reporter_id: reporterId,
      state: "same",
    });

    const { error } = await anon.from("report_updates").select("reporter_id");

    // The grant layer must be the one refusing this - 42501,
    // insufficient_privilege - not row-level security, which would instead
    // return an empty array with no error. A migration that restored
    // `grant select on report_updates` would make the summary function
    // pointless while leaving every other test green, so this pins the
    // specific mechanism rather than the outcome.
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("does not hand them to a signed-in visitor either", async () => {
    // Being signed in is not a reason to learn who else answered. The table is
    // withheld from `authenticated` on exactly the same grounds.
    const { error } = await stranger.from("report_updates").select("reporter_id");
    expect(error?.code).toBe("42501");
  });

  it("still lets anyone read the counts through the summary", async () => {
    // The point of withholding the column: an anonymous visitor is precisely
    // the person who needs to know the water has gone.
    const { data, error } = await anon.rpc("report_update_summary", {
      report_id: reportId,
    });

    expect(error).toBeNull();
    expect(data).toEqual([expect.objectContaining({ state: "same", votes: 1 })]);
  });
});

describe("answering kumusta na", () => {
  it("lets a signed-in user answer somebody else's report", async () => {
    const report = await makeReport("waist");

    const { error } = await stranger.rpc("submit_report_update", {
      p_report_id: report.id,
      p_state: "gone",
    });

    expect(error).toBeNull();
  });

  it("attributes the answer to the caller, with no name to forge", async () => {
    // The function takes no reporter_id at all - it writes auth.uid(). This is
    // what makes impersonation impossible rather than merely rejected.
    const report = await makeReport();

    await stranger.rpc("submit_report_update", {
      p_report_id: report.id,
      p_state: "gone",
    });

    const { data } = await admin
      .from("report_updates")
      .select("reporter_id")
      .eq("report_id", report.id)
      .single();

    expect(data!.reporter_id).toBe(strangerId);
    expect(data!.reporter_id).not.toBe(reporterId);
  });

  it("replaces an answer rather than stacking a second one", async () => {
    const report = await makeReport("waist");

    for (const state of ["same", "deeper"]) {
      const { error } = await stranger.rpc("submit_report_update", {
        p_report_id: report.id,
        p_state: state,
      });
      expect(error).toBeNull();
    }

    const { data } = await anon.rpc("report_update_summary", {
      report_id: report.id,
    });

    // One row, one vote. Without the unique constraint this is exactly how one
    // person manufactures a consensus with themselves.
    expect(data).toEqual([
      expect.objectContaining({ state: "deeper", votes: 1 }),
    ]);
  });

  it("refuses an answer from an anonymous visitor", async () => {
    const report = await makeReport();

    const { error } = await anon.rpc("submit_report_update", {
      p_report_id: report.id,
      p_state: "gone",
    });

    // A definer function runs as its owner, so the EXECUTE grant is the only
    // thing standing here. If this ever returns null, anonymous visitors can
    // vote - repeatedly, from a fresh session each time.
    expect(error).not.toBeNull();
  });

  it("refuses a state the enum does not allow", async () => {
    const report = await makeReport();

    const { error } = await stranger.rpc("submit_report_update", {
      p_report_id: report.id,
      p_state: "shallower",
    });

    expect(error).not.toBeNull();
  });

  it("does not let one user overwrite another user's answer", async () => {
    const report = await makeReport();

    await admin.from("report_updates").insert({
      report_id: report.id,
      reporter_id: reporterId,
      state: "deeper",
    });

    // The stranger answering the same report adds their own row; it must not
    // land on somebody else's, which is what the (report_id, reporter_id) key
    // is doing.
    await stranger.rpc("submit_report_update", {
      p_report_id: report.id,
      p_state: "gone",
    });

    const { data } = await admin
      .from("report_updates")
      .select("state")
      .eq("report_id", report.id)
      .eq("reporter_id", reporterId)
      .single();

    expect(data!.state).toBe("deeper");
  });
});

describe("hiding your own report", () => {
  it("lets the reporter take their own report off the map", async () => {
    const report = await makeReport();

    const { error } = await authed
      .from("depth_reports")
      .update({ status: "hidden" })
      .eq("id", report.id);
    expect(error).toBeNull();

    const { data } = await admin
      .from("depth_reports")
      .select("status")
      .eq("id", report.id)
      .single();
    expect(data!.status).toBe("hidden");
  });

  it("keeps a hidden report off the map even for the person who filed it", async () => {
    // 0018 gave reporters a SELECT policy on their own rows - the hide cannot
    // work without one, because PostgreSQL checks SELECT policies against the
    // NEW row of an UPDATE. This is the risk that policy carries: it must not
    // become a private door that puts a withdrawn report back on the map for
    // its author. `reports_near` filters on status in its own body, and this is
    // what holds that filter in place.
    const report = await makeReport();

    await authed
      .from("depth_reports")
      .update({ status: "hidden" })
      .eq("id", report.id);

    // First prove the row IS reachable by its author, or the assertion below
    // passes for the wrong reason and stops testing anything at all.
    const { data: own } = await authed
      .from("depth_reports")
      .select("id, status")
      .eq("id", report.id);
    expect(own).toHaveLength(1);
    expect(own![0].status).toBe("hidden");

    const { data, error } = await authed.rpc("reports_near", {
      lat: 14.65,
      lon: 121.1,
      radius_m: 2000,
    });

    expect(error).toBeNull();
    expect((data ?? []).map((row: { id: string }) => row.id)).not.toContain(
      report.id,
    );
  });

  it("does not let that policy expose anybody else's hidden report", async () => {
    // The other edge of the same policy. "Your own" has to mean exactly that,
    // or 0018 has quietly published every withdrawn report to every signed-in
    // account - the opposite of what withdrawing one is for.
    const report = await makeReport();
    await admin
      .from("depth_reports")
      .update({ status: "hidden" })
      .eq("id", report.id);

    const { data } = await stranger
      .from("depth_reports")
      .select("id")
      .eq("id", report.id);

    expect(data ?? []).toEqual([]);
  });

  it("does not let anyone hide a report that is not theirs", async () => {
    const report = await makeReport();

    await stranger
      .from("depth_reports")
      .update({ status: "hidden" })
      .eq("id", report.id);

    const { data } = await admin
      .from("depth_reports")
      .select("status")
      .eq("id", report.id)
      .single();
    expect(data!.status).toBe("active");
  });

  it("does not let the reporter change the depth they claimed", async () => {
    // THE REASON THE GRANT IS COLUMN-SCOPED. A table-wide `grant update` would
    // let somebody file "ankle", watch it get scored, and rewrite it after the
    // fact - and the accuracy score exists precisely to make that claim cost
    // something.
    const report = await makeReport("knee");

    await authed
      .from("depth_reports")
      .update({ depth: "above_head" })
      .eq("id", report.id);

    const { data } = await admin
      .from("depth_reports")
      .select("depth")
      .eq("id", report.id)
      .single();
    expect(data!.depth).toBe("knee");
  });

  it("does not let the reporter give their report any other status", async () => {
    // The policy's WITH CHECK pins the value, not just the column: "remove" is
    // the only edit being permitted, so restoring a flagged report to `active`
    // must be refused even though it touches the very same column.
    const report = await makeReport();
    await admin
      .from("depth_reports")
      .update({ status: "flagged" })
      .eq("id", report.id);

    await authed
      .from("depth_reports")
      .update({ status: "active" })
      .eq("id", report.id);

    const { data } = await admin
      .from("depth_reports")
      .select("status")
      .eq("id", report.id)
      .single();
    expect(data!.status).toBe("flagged");
  });
});

