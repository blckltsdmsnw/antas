import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const modClient = createClient(url, anonKey, opts);
const outsiderClient = createClient(url, anonKey, opts);

let moderatorId: string;
let outsiderId: string;
let reporterId: string;

/** Malanday's centroid, from 0009. */
const MALANDAY = "SRID=4326;POINT(121.0950 14.6560)";
/** Nangka's, far enough that nearest_barangay resolves the other desk. */
const NANGKA = "SRID=4326;POINT(121.1080 14.6800)";

const PASSWORD = "test-password-123";

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

async function newReport(
  location = MALANDAY,
  depth = "chest",
  reportedAt: Date = new Date(),
): Promise<string> {
  const { data, error } = await admin
    .from("depth_reports")
    .insert({
      reporter_id: reporterId,
      location,
      depth,
      photo_path: `${reporterId}/x.jpg`,
      reported_at: reportedAt.toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

beforeAll(async () => {
  const m = await makeUser("reportmod");
  const o = await makeUser("reportoutsider");
  const r = await makeUser("reportreporter");
  moderatorId = m.id;
  outsiderId = o.id;
  reporterId = r.id;

  await admin.from("moderators").insert([
    { user_id: moderatorId, barangay: "Malanday" },
    { user_id: outsiderId, barangay: "Nangka" },
  ]);
  await admin
    .from("profiles")
    .update({ phone: "+639171234567" })
    .eq("id", reporterId);

  await modClient.auth.signInWithPassword({ email: m.email, password: PASSWORD });
  await outsiderClient.auth.signInWithPassword({
    email: o.email,
    password: PASSWORD,
  });
});

describe("the barangay trigger", () => {
  it("stamps a barangay on a report nobody supplied one for", async () => {
    // Reports carried no barangay at all before 0027, so a queue matching on it
    // would have found nothing forever with no error - the exact failure 0009
    // fixed for signals, and which this migration inherits the fix from.
    const id = await newReport();
    const { data } = await admin
      .from("depth_reports")
      .select("barangay")
      .eq("id", id)
      .single();
    expect(data!.barangay).toBe("Malanday");
  });
});

describe("report_queue", () => {
  it("returns reports from the moderator's own barangay", async () => {
    const id = await newReport();
    const { data } = await modClient.rpc("report_queue");
    expect((data as { id: string }[]).map((row) => row.id)).toContain(id);
  });

  it("hides them from a moderator of another barangay", async () => {
    const id = await newReport();
    const { data } = await outsiderClient.rpc("report_queue");
    expect((data as { id: string }[]).map((row) => row.id)).not.toContain(id);
  });

  it("is closed to anon", async () => {
    const stranger = createClient(url, anonKey, opts);
    const { error } = await stranger.rpc("report_queue");
    expect(error).not.toBeNull();
  });

  it("drops a report once it has been hidden", async () => {
    const id = await newReport();
    await modClient.rpc("decide_report", {
      p_report_id: id,
      p_decision: "hide",
      p_reason: "stale",
    });
    const { data } = await modClient.rpc("report_queue");
    expect((data as { id: string }[]).map((row) => row.id)).not.toContain(id);
  });

  it("counts the freshness answers under a report", async () => {
    const id = await newReport();
    // Thrown rather than ignored. The first version of this test wrote an
    // invalid enum value, the insert failed, and the assertion read a count of
    // zero as a wrong answer from the queue rather than as a row that was
    // never written - which is the same silent-failure shape 0018 warns about.
    const { error } = await admin
      .from("report_updates")
      .insert({ report_id: id, reporter_id: reporterId, state: "deeper" });
    if (error) throw error;

    const { data } = await modClient.rpc("report_queue");
    const row = (data as { id: string; answers: number }[]).find(
      (r) => r.id === id,
    );
    expect(row!.answers).toBe(1);
  });
});

describe("report_priority", () => {
  it("calls a fresh chest-deep reading urgent", async () => {
    const id = await newReport(MALANDAY, "chest", hoursAgo(1));
    const { data } = await modClient.rpc("report_queue");
    const row = (data as { id: string; priority: string }[]).find(
      (r) => r.id === id,
    );
    expect(row!.priority).toBe("urgent");
  });

  it("demotes the same reading once it is past six hours", async () => {
    // MAX_CACHE_AGE_HOURS. Past it the map refuses to draw a cached pin at all,
    // and the queue stops treating the reading as a thing to act on.
    const id = await newReport(MALANDAY, "chest", hoursAgo(7));
    const { data } = await modClient.rpc("report_queue");
    const row = (data as { id: string; priority: string }[]).find(
      (r) => r.id === id,
    );
    expect(row!.priority).toBe("watch");
  });

  it("leaves shallow water routine however fresh it is", async () => {
    const id = await newReport(MALANDAY, "ankle", hoursAgo(0));
    const { data } = await modClient.rpc("report_queue");
    const row = (data as { id: string; priority: string }[]).find(
      (r) => r.id === id,
    );
    expect(row!.priority).toBe("routine");
  });

  it("puts a contested report above a deeper uncontested one", async () => {
    const contested = await newReport(MALANDAY, "ankle", hoursAgo(0));
    await newReport(MALANDAY, "above_head", hoursAgo(0));
    await admin
      .from("depth_reports")
      .update({ status: "flagged" })
      .eq("id", contested);

    const { data } = await modClient.rpc("report_queue");
    const ids = (data as { id: string }[]).map((row) => row.id);
    // A flagged reading is waiting on a person; an urgent one is waiting on the
    // water. The person's decision is what a queue is for.
    expect(ids[0]).toBe(contested);
  });
});

describe("report_detail", () => {
  it("hands the reporter's number to the moderator who may act", async () => {
    const id = await newReport();
    const { data } = await modClient.rpc("report_detail", { p_report_id: id });
    expect((data as { reporter_phone: string }[])[0].reporter_phone).toBe(
      "+639171234567",
    );
  });

  it("gives an outsider nothing at all", async () => {
    const id = await newReport();
    const { data } = await outsiderClient.rpc("report_detail", {
      p_report_id: id,
    });
    expect(data).toEqual([]);
  });

  it("records who opened it", async () => {
    const id = await newReport();
    await modClient.rpc("report_detail", { p_report_id: id });

    const { data } = await admin
      .from("report_events")
      .select("actor_id, event_type")
      .eq("report_id", id);
    expect(data).toContainEqual({
      actor_id: moderatorId,
      event_type: "viewed",
    });
  });

  it("leaves no trail when somebody who may not see it probes", async () => {
    // An unauthorised probe must not write an audit row: a log recording views
    // that never happened is worse than none, because it looks complete.
    const id = await newReport();
    await outsiderClient.rpc("report_detail", { p_report_id: id });

    const { data } = await admin
      .from("report_events")
      .select("actor_id")
      .eq("report_id", id);
    expect(
      (data as { actor_id: string }[]).map((r) => r.actor_id),
    ).not.toContain(outsiderId);
  });
});

describe("decide_report", () => {
  it("takes a report off the map", async () => {
    const id = await newReport();
    const { error } = await modClient.rpc("decide_report", {
      p_report_id: id,
      p_decision: "hide",
      p_reason: "wrong_place",
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from("depth_reports")
      .select("status")
      .eq("id", id)
      .single();
    expect(data!.status).toBe("hidden");
  });

  it("refuses to hide without a reason", async () => {
    const id = await newReport();
    const { error } = await modClient.rpc("decide_report", {
      p_report_id: id,
      p_decision: "hide",
      p_reason: null,
    });
    expect(error).not.toBeNull();
  });

  it("refuses a moderator from another barangay", async () => {
    const id = await newReport();
    const { error } = await outsiderClient.rpc("decide_report", {
      p_report_id: id,
      p_decision: "hide",
      p_reason: "not_true",
    });
    expect(error).not.toBeNull();
  });

  it("restores a contested report when it is kept", async () => {
    const id = await newReport();
    await admin.from("depth_reports").update({ status: "flagged" }).eq("id", id);

    await modClient.rpc("decide_report", { p_report_id: id, p_decision: "keep" });

    const { data } = await admin
      .from("depth_reports")
      .select("status")
      .eq("id", id)
      .single();
    expect(data!.status).toBe("active");
  });

  it("never touches the reporter's standing", async () => {
    // The difference from decide_sos, and the reason the two decisions do not
    // share a vocabulary: hiding a stale or misplaced depth reading says
    // nothing bad about whoever filed it, and accruing strikes for it would
    // suspend honest reporters for reporting.
    await admin
      .from("reputation")
      .upsert({ user_id: reporterId, false_report_count: 0 });

    const id = await newReport();
    await modClient.rpc("decide_report", {
      p_report_id: id,
      p_decision: "hide",
      p_reason: "not_true",
    });

    const { data } = await admin
      .from("reputation")
      .select("false_report_count")
      .eq("user_id", reporterId)
      .single();
    expect(data!.false_report_count).toBe(0);
  });

  it("records the decision and its reason", async () => {
    const id = await newReport();
    await modClient.rpc("decide_report", {
      p_report_id: id,
      p_decision: "hide",
      p_reason: "duplicate",
    });

    const { data } = await admin
      .from("report_events")
      .select("event_type, payload")
      .eq("report_id", id)
      .eq("event_type", "decision")
      .single();
    expect((data!.payload as { reason: string }).reason).toBe("duplicate");
  });
});

describe("what a resident can still not do", () => {
  it("cannot read the audit log", async () => {
    const { error } = await modClient.from("report_events").select("id").limit(1);
    expect(error).not.toBeNull();
  });

  it("cannot see a hidden report on the public map", async () => {
    const id = await newReport(NANGKA);
    await admin.from("depth_reports").update({ status: "hidden" }).eq("id", id);

    const stranger = createClient(url, anonKey, opts);
    const { data } = await stranger
      .from("depth_reports")
      .select("id")
      .eq("id", id);
    expect(data).toEqual([]);
  });
});
