import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Standing, at the boundary where all of its logic actually lives.
 *
 * `reporter_standing` is SQL, so a unit test could only ever check the label
 * mapping around it. Everything that could be wrong - the time window, the
 * threshold, the one-verdict-per-report rule, and the promise that nothing
 * identifying comes back - is inside the function.
 *
 * The last of those is the point of the feature. This shipped INSTEAD of
 * reporter names, so a test that lets an id or a count escape is not a failing
 * detail; it is the feature quietly turning into the thing it replaced.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, clientOptions);
const anon = createClient(url, anonKey, clientOptions);

/** Voters, so an author's own answers never build their own standing. */
let voters: string[] = [];

async function makeUser(prefix: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: "test-password-123",
    email_confirm: true,
  });
  if (error) throw error;
  return data.user!.id;
}

async function makeReport(
  reporterId: string,
  { minutesAgo = 10, source = "user" } = {},
) {
  const { data, error } = await admin
    .from("depth_reports")
    .insert({
      reporter_id: reporterId,
      location: "SRID=4326;POINT(121.1 14.65)",
      depth: "knee",
      source,
      reported_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    })
    .select("id, reported_at")
    .single();
  if (error) throw error;
  return data!;
}

/** An answer at a chosen delay after the report, which is what decides weight. */
async function answer(
  report: { id: string; reported_at: string },
  voterIndex: number,
  state: string,
  minutesAfter: number,
) {
  const at = new Date(
    new Date(report.reported_at).getTime() + minutesAfter * 60_000,
  ).toISOString();

  const { error } = await admin.from("report_updates").insert({
    report_id: report.id,
    reporter_id: voters[voterIndex],
    state,
    created_at: at,
  });
  if (error) throw error;
}

/** A reporter whose reports were every one of them answered the same way. */
async function reporterWith(
  count: number,
  state: string,
  minutesAfter: number,
): Promise<string> {
  const author = await makeUser("standing");
  let last = "";
  for (let index = 0; index < count; index += 1) {
    const report = await makeReport(author, { minutesAgo: 120 });
    await answer(report, index % voters.length, state, minutesAfter);
    last = report.id;
  }
  return last;
}

async function standingOf(reportId: string): Promise<string> {
  const { data, error } = await anon.rpc("reporter_standing", {
    p_report_id: reportId,
  });
  if (error) throw error;
  return data as string;
}

beforeAll(async () => {
  voters = [
    await makeUser("voter-a"),
    await makeUser("voter-b"),
    await makeUser("voter-c"),
  ];
});

describe("reporter_standing", () => {
  it("gives standing to someone whose readings kept holding up", async () => {
    const reportId = await reporterWith(3, "same", 10);
    expect(await standingOf(reportId)).toBe("reliable");
  });

  it("counts a rise as the reading holding, not as an error", async () => {
    // "Mas mataas na" ten minutes later means the water rose. The reporter
    // described what was there; docking them for the weather would punish the
    // people reporting the fastest-moving water.
    const reportId = await reporterWith(3, "deeper", 10);
    expect(await standingOf(reportId)).toBe("reliable");
  });

  it("withholds standing when the readings were contradicted", async () => {
    const reportId = await reporterWith(3, "gone", 10);
    expect(await standingOf(reportId)).toBe("none");
  });

  it("ignores answers that arrive after the water could have receded", async () => {
    // Four hours later "wala na" describes the weather, not a bad report. If
    // this window were not enforced, every accurate report would eventually be
    // marked wrong simply because floods end.
    const contradicted = await reporterWith(4, "gone", 240);
    expect(await standingOf(contradicted)).toBe("none");

    // ...and those late answers must not count in the reporter's favour
    // either. They are silence, not evidence.
    const held = await reporterWith(4, "same", 240);
    expect(await standingOf(held)).toBe("none");
  });

  it("says nothing about a reporter with too little history", async () => {
    // Two lucky reports must not badge somebody permanently.
    const reportId = await reporterWith(2, "same", 10);
    expect(await standingOf(reportId)).toBe("none");
  });

  it("never returns anything but the two values it promises", async () => {
    // The whole privacy claim in one assertion. Counts or ids leaking out here
    // would let anyone group reports by author and, from there, work out where
    // somebody lives.
    const reportId = await reporterWith(3, "same", 10);
    const value = await standingOf(reportId);

    expect(["reliable", "none"]).toContain(value);
    expect(typeof value).toBe("string");
    expect(value).not.toMatch(/\d/);
  });

  it("cannot be built out of a single heavily answered report", async () => {
    // One verdict per report. Otherwise three friends answering one report
    // would manufacture a standing no track record supports.
    const author = await makeUser("standing-one");
    const report = await makeReport(author, { minutesAgo: 120 });
    await answer(report, 0, "same", 5);
    await answer(report, 1, "same", 6);
    await answer(report, 2, "same", 7);

    expect(await standingOf(report.id)).toBe("none");
  });

  it("does not build standing out of seeded demo rows", async () => {
    const author = await makeUser("standing-seed");
    let last = "";
    for (let index = 0; index < 4; index += 1) {
      const report = await makeReport(author, { minutesAgo: 120, source: "seed" });
      await answer(report, index % voters.length, "same", 10);
      last = report.id;
    }

    expect(await standingOf(last)).toBe("none");
  });

  it("says 'none' for a report that does not exist", async () => {
    // Must not throw at an anonymous caller, and must not imply anything.
    expect(await standingOf("00000000-0000-0000-0000-000000000000")).toBe("none");
  });
});
