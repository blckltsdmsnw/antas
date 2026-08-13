# Antas Phase 2B — The Moderator Console

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A barangay moderator sees distress signals for their own area the moment they arrive, ordered by priority, explained in sentences rather than scores — and can confirm or dismiss each one, with every decision recorded and fed back into the reporter's history.

**Architecture:** The whole decision — status change, audit entry, reputation update, and possible suspension — happens inside a single Postgres function, so it either all lands or none of it does. Four round trips from the application would leave a signal confirmed with no audit trail the moment one call failed. The console reads through security-definer functions rather than direct table access, because moderators need `env_snapshots` and `signal_events`, which they hold no grant on.

**Tech Stack:** Next.js 16, TypeScript, Supabase (PostgreSQL 17 + PostGIS + Realtime + Storage), Vitest, Playwright.

**Source spec:** `docs/superpowers/specs/2026-08-13-antas-design.md` sections 7-8.

---

## The two principles this phase must not break

**1. A low score is an argument, not a verdict.** The console never shows a bare number alone. It shows the reason sentences, and the moderator can overrule them in either direction. Opaque scores make people either obey blindly or ignore entirely; explanations make them think.

**2. Antas does not dispatch real responders.** A persistent banner says so on every console screen. This is a simulated barangay operations environment running on demonstration data. Nothing in this phase may send an SMS, a push notification, an email, or any other message that reaches a person outside the application.

---

## Explicitly out of scope, and why

**Outbound notification to a real person.** Not a technical limitation. The moment this app can make a real phone buzz, either it reaches somebody who agreed to be on call — which requires an actual arrangement with an actual barangay, covering who watches it, at what hours, and who is accountable when a signal is missed — or it reaches nobody, and the app has told a frightened person that help is coming when it is not. The spec forbids the second case; the first is an institutional commitment rather than a feature.

Realtime updates **inside the console** are in scope, and are the honest version of "notify the rescuers".

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/sos/decision.ts` | Dismiss reasons, which count toward suspension, the threshold. Pure, zero I/O |
| `supabase/migrations/0010_moderation.sql` | `moderator_queue()`, `sos_detail()`, `decide_sos()`, realtime publication |
| `scripts/make-moderator.ts` | Grants a user the moderator role for a barangay |
| `src/app/actions/decide-sos.ts` | Server action wrapping the decision RPC |
| `src/app/console/page.tsx` | The queue, live |
| `src/app/console/[id]/page.tsx` | One signal in full: reasons, photo, decision |
| `src/components/SimulationBanner.tsx` | The "this dispatches nobody" notice |
| `src/components/SignalCard.tsx` | One row in the queue |
| `src/components/ReasonList.tsx` | Renders reason sentences by kind |

---

## Task 1: The decision rules

**Files:**
- Create: `src/lib/sos/decision.ts`
- Test: `src/lib/sos/decision.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sos/decision.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  DISMISS_REASONS,
  SUSPENSION_THRESHOLD,
  countsTowardSuspension,
  shouldSuspend,
  isDismissReason,
  dismissReasonLabel,
} from "./decision";

describe("dismiss reasons", () => {
  it("lists every reason", () => {
    expect(DISMISS_REASONS).toEqual([
      "false_report",
      "duplicate",
      "resolved_already",
      "insufficient_info",
    ]);
  });

  it("counts only a fabricated report toward suspension", () => {
    expect(countsTowardSuspension("false_report")).toBe(true);
    expect(countsTowardSuspension("duplicate")).toBe(false);
    expect(countsTowardSuspension("resolved_already")).toBe(false);
    expect(countsTowardSuspension("insufficient_info")).toBe(false);
  });

  it("suspends at the third false report, not before", () => {
    expect(SUSPENSION_THRESHOLD).toBe(3);
    expect(shouldSuspend(2)).toBe(false);
    expect(shouldSuspend(3)).toBe(true);
    expect(shouldSuspend(4)).toBe(true);
  });

  it("recognises valid reason strings", () => {
    expect(isDismissReason("duplicate")).toBe(true);
    expect(isDismissReason("spam")).toBe(false);
  });

  it("gives every reason a Filipino label", () => {
    for (const reason of DISMISS_REASONS) {
      expect(dismissReasonLabel(reason).length).toBeGreaterThan(0);
    }
    expect(dismissReasonLabel("duplicate")).toBe("Doble - naiulat na ito");
  });
});
```

- [ ] **Step 2: Run them, verify they fail**

Run: `npx vitest run src/lib/sos/decision.test.ts`
Expected: FAIL — "Failed to resolve import ./decision".

- [ ] **Step 3: Write the implementation**

Create `src/lib/sos/decision.ts`:
```ts
export const DISMISS_REASONS = [
  "false_report",
  "duplicate",
  "resolved_already",
  "insufficient_info",
] as const;

export type DismissReason = (typeof DISMISS_REASONS)[number];

/** Three fabricated reports suspend an account. Disclosed at onboarding:
 *  visible accountability deters better than hidden accountability. */
export const SUSPENSION_THRESHOLD = 3;

const LABELS: Record<DismissReason, string> = {
  false_report: "Hindi totoo",
  duplicate: "Doble - naiulat na ito",
  resolved_already: "Naayos na",
  insufficient_info: "Kulang ang impormasyon",
};

export function isDismissReason(value: string): value is DismissReason {
  return (DISMISS_REASONS as readonly string[]).includes(value);
}

/**
 * Only fabrication counts. Dismissing a duplicate, or a signal where help
 * already arrived, says nothing bad about the reporter - penalising those
 * would punish people for reporting a real flood somebody else reported first.
 */
export function countsTowardSuspension(reason: DismissReason): boolean {
  return reason === "false_report";
}

export function shouldSuspend(falseReportCount: number): boolean {
  return falseReportCount >= SUSPENSION_THRESHOLD;
}

export function dismissReasonLabel(reason: DismissReason): string {
  return LABELS[reason];
}
```

- [ ] **Step 4: Run them, verify they pass**

Run: `npx vitest run src/lib/sos/decision.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sos/decision.ts src/lib/sos/decision.test.ts
git commit -m "feat: add SOS decision rules"
```

---

## Task 2: Moderation functions and realtime

The decision is one transaction. Four separate round trips from the application
would let a signal be confirmed with no audit entry the instant one call failed,
and an audit trail with holes in it is worse than none — it looks complete.

**Files:**
- Create: `tests/integration/moderation.test.ts`, `supabase/migrations/0010_moderation.sql`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/moderation.test.ts`:
```ts
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

async function makeUser(prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "test-password-123",
    email_confirm: true,
  });
  if (error) throw error;
  return { id: data.user!.id, email };
}

/** Creates a signal in Malanday, clearing any previous active one first. */
async function newSignal(): Promise<string> {
  await admin
    .from("sos_signals")
    .update({ status: "dismissed" })
    .eq("reporter_id", reporterId)
    .in("status", ["pending", "under_review", "confirmed"]);

  const { data, error } = await admin
    .from("sos_signals")
    .insert({
      reporter_id: reporterId,
      location: "SRID=4326;POINT(121.0950 14.6560)",
      depth: "chest",
      photo_path: `${reporterId}/x.jpg`,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  const m = await makeUser("moderator");
  const o = await makeUser("outsider");
  const r = await makeUser("reporter");
  moderatorId = m.id;
  outsiderId = o.id;
  reporterId = r.id;

  await admin.from("moderators").insert([
    { user_id: moderatorId, barangay: "Malanday" },
    { user_id: outsiderId, barangay: "Nangka" },
  ]);
  await admin.from("reputation").insert({ user_id: reporterId });

  await modClient.auth.signInWithPassword({ email: m.email, password: "test-password-123" });
  await outsiderClient.auth.signInWithPassword({ email: o.email, password: "test-password-123" });
});

describe("moderator_queue", () => {
  it("returns signals from the moderator's own barangay", async () => {
    const id = await newSignal();
    const { data, error } = await modClient.rpc("moderator_queue");

    expect(error).toBeNull();
    expect((data ?? []).map((r: { id: string }) => r.id)).toContain(id);
  });

  it("does not leak signals from another barangay", async () => {
    const id = await newSignal();
    const { data } = await outsiderClient.rpc("moderator_queue");

    expect((data ?? []).map((r: { id: string }) => r.id)).not.toContain(id);
  });

  it("returns nothing at all to a signed-in non-moderator", async () => {
    const plain = createClient(url, anonKey, opts);
    const u = await makeUser("plain");
    await plain.auth.signInWithPassword({ email: u.email, password: "test-password-123" });

    const { data } = await plain.rpc("moderator_queue");
    expect(data ?? []).toEqual([]);
  });
});

describe("decide_sos", () => {
  it("confirms a signal and writes an audit entry", async () => {
    const id = await newSignal();
    const { error } = await modClient.rpc("decide_sos", {
      signal_id: id,
      decision: "confirmed",
      reason: null,
    });
    expect(error).toBeNull();

    const { data: signal } = await admin
      .from("sos_signals")
      .select("status")
      .eq("id", id)
      .single();
    expect(signal!.status).toBe("confirmed");

    const { data: events } = await admin
      .from("signal_events")
      .select("event_type, actor_id")
      .eq("sos_id", id);
    expect(events!.length).toBeGreaterThan(0);
    expect(events![0].actor_id).toBe(moderatorId);
  });

  it("refuses a moderator from another barangay", async () => {
    const id = await newSignal();
    const { error } = await outsiderClient.rpc("decide_sos", {
      signal_id: id,
      decision: "confirmed",
      reason: null,
    });
    expect(error).not.toBeNull();
  });

  it("requires a reason when dismissing", async () => {
    const id = await newSignal();
    const { error } = await modClient.rpc("decide_sos", {
      signal_id: id,
      decision: "dismissed",
      reason: null,
    });
    expect(error).not.toBeNull();
  });

  it("counts a false report against the reporter but a duplicate does not", async () => {
    const before = await admin
      .from("reputation")
      .select("false_report_count")
      .eq("user_id", reporterId)
      .single();

    const dup = await newSignal();
    await modClient.rpc("decide_sos", {
      signal_id: dup,
      decision: "dismissed",
      reason: "duplicate",
    });

    const afterDup = await admin
      .from("reputation")
      .select("false_report_count")
      .eq("user_id", reporterId)
      .single();
    expect(afterDup.data!.false_report_count).toBe(before.data!.false_report_count);

    const fake = await newSignal();
    await modClient.rpc("decide_sos", {
      signal_id: fake,
      decision: "dismissed",
      reason: "false_report",
    });

    const afterFake = await admin
      .from("reputation")
      .select("false_report_count")
      .eq("user_id", reporterId)
      .single();
    expect(afterFake.data!.false_report_count).toBe(
      before.data!.false_report_count + 1,
    );
  });

  it("suspends the reporter on the third false report", async () => {
    await admin
      .from("reputation")
      .update({ false_report_count: 2 })
      .eq("user_id", reporterId);
    await admin
      .from("profiles")
      .update({ suspended_at: null })
      .eq("id", reporterId);

    const id = await newSignal();
    await modClient.rpc("decide_sos", {
      signal_id: id,
      decision: "dismissed",
      reason: "false_report",
    });

    const { data: profile } = await admin
      .from("profiles")
      .select("suspended_at")
      .eq("id", reporterId)
      .single();
    expect(profile!.suspended_at).not.toBeNull();
  });

  it("records every detail view in the audit log", async () => {
    const id = await newSignal();

    const before = await admin
      .from("signal_events")
      .select("id", { count: "exact", head: true })
      .eq("sos_id", id)
      .eq("event_type", "viewed");

    await modClient.rpc("sos_detail", { signal_id: id });

    const after = await admin
      .from("signal_events")
      .select("id", { count: "exact", head: true })
      .eq("sos_id", id)
      .eq("event_type", "viewed");

    expect(after.count!).toBe(before.count! + 1);
  });

  it("leaves no audit trail when a stranger probes a signal", async () => {
    const id = await newSignal();

    await outsiderClient.rpc("sos_detail", { signal_id: id });

    const { count } = await admin
      .from("signal_events")
      .select("id", { count: "exact", head: true })
      .eq("sos_id", id)
      .eq("event_type", "viewed");

    expect(count).toBe(0);
  });

  it("still lets a suspended reporter send a new signal", async () => {
    // Suspension lowers priority and forces review. It never silences.
    const { error } = await admin.from("sos_signals").insert({
      reporter_id: reporterId,
      location: "SRID=4326;POINT(121.0950 14.6560)",
      depth: "waist",
      photo_path: `${reporterId}/after-suspension.jpg`,
    });
    expect(error).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/integration/moderation.test.ts`
Expected: FAIL — `PGRST202`, neither function exists.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0010_moderation.sql`:
```sql
-- Moderators hold no grant on env_snapshots or signal_events, and should not:
-- those tables are the server's working memory. The console reads through
-- these definer functions instead, which enforce barangay scope themselves.

create or replace function moderator_queue()
returns table (
  id           uuid,
  barangay     text,
  depth        depth_level,
  status       sos_status,
  trust_score  integer,
  confidence   text,
  reasons      jsonb,
  note         text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $fn$
  select s.id, s.barangay, s.depth, s.status, s.trust_score, s.confidence,
         s.reasons, s.note, s.created_at
    from sos_signals s
   where s.status in ('pending', 'under_review', 'confirmed')
     and exists (
           select 1 from moderators m
            where m.user_id = auth.uid()
              and m.barangay = s.barangay
         )
   -- Unscored signals first: a signal we could not assess is not a signal we
   -- may bury. `nulls first` is deliberate.
   order by s.trust_score desc nulls first, s.created_at asc;
$fn$;

-- One signal in full, including the environmental snapshot the score was based
-- on. Same barangay check.
--
-- VOLATILE, not STABLE, because it writes: the spec requires that every detail
-- view is recorded. Opening a distressed person's exact location and photograph
-- is itself an act worth auditing - "who looked at this, and when" is a
-- question that must have an answer. A read-only version of this function
-- would be cheaper and would quietly discard that accountability.
create or replace function sos_detail(signal_id uuid)
returns table (
  id                      uuid,
  barangay                text,
  depth                   depth_level,
  status                  sos_status,
  trust_score             integer,
  confidence              text,
  reasons                 jsonb,
  note                    text,
  photo_path              text,
  gps_accuracy_m          double precision,
  created_at              timestamptz,
  lat                     double precision,
  lon                     double precision,
  rainfall_24h_mm         double precision,
  elevation_m             double precision,
  surrounding_elevation_m double precision,
  corroborating_reports   integer,
  provider_ok             boolean
)
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
begin
  -- Record the view before returning anything. If the caller is not a
  -- moderator for this barangay the insert matches nothing and the select
  -- returns nothing, so an unauthorised probe leaves no misleading trail.
  insert into signal_events (sos_id, actor_id, event_type, payload)
  select s.id, auth.uid(), 'viewed', '{}'::jsonb
    from sos_signals s
   where s.id = sos_detail.signal_id
     and exists (
           select 1 from moderators m
            where m.user_id = auth.uid()
              and m.barangay = s.barangay
         );

  return query
  select s.id, s.barangay, s.depth, s.status, s.trust_score, s.confidence,
         s.reasons, s.note, s.photo_path, s.gps_accuracy_m, s.created_at,
         st_y(s.location::geometry), st_x(s.location::geometry),
         e.rainfall_24h_mm, e.elevation_m, e.surrounding_elevation_m,
         e.corroborating_reports, e.provider_ok
    from sos_signals s
    left join env_snapshots e on e.sos_id = s.id
   where s.id = sos_detail.signal_id
     and exists (
           select 1 from moderators m
            where m.user_id = auth.uid()
              and m.barangay = s.barangay
         );
end;
$fn$;

-- The whole decision in one transaction: status, audit entry, reputation, and
-- suspension. Split across four round trips, a failure after the first would
-- leave a confirmed signal with no audit trail - and an audit trail with holes
-- is worse than none, because it looks complete.
create or replace function decide_sos(
  signal_id uuid,
  decision  text,
  reason    dismiss_reason default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_reporter    uuid;
  v_barangay    text;
  v_status      sos_status;
  v_false_count integer;
begin
  if decision not in ('confirmed', 'dismissed') then
    raise exception 'decision must be confirmed or dismissed, got %', decision;
  end if;

  if decision = 'dismissed' and reason is null then
    raise exception 'dismissing requires a reason code';
  end if;

  select s.reporter_id, s.barangay, s.status
    into v_reporter, v_barangay, v_status
    from sos_signals s
   where s.id = decide_sos.signal_id
   for update;

  if v_reporter is null then
    raise exception 'signal not found';
  end if;

  if not exists (
    select 1 from moderators m
     where m.user_id = auth.uid() and m.barangay = v_barangay
  ) then
    raise exception 'not a moderator for barangay %', v_barangay;
  end if;

  if v_status in ('dismissed', 'resolved') then
    raise exception 'signal is already %', v_status;
  end if;

  update sos_signals
     set status       = decision::sos_status,
         dismissed_as = case when decision = 'dismissed' then reason else null end
   where id = decide_sos.signal_id;

  insert into signal_events (sos_id, actor_id, event_type, payload)
  values (
    decide_sos.signal_id,
    auth.uid(),
    'decision',
    jsonb_build_object('decision', decision, 'reason', reason, 'from_status', v_status)
  );

  insert into reputation (user_id) values (v_reporter)
  on conflict (user_id) do nothing;

  if decision = 'confirmed' then
    update reputation
       set confirmed_count = confirmed_count + 1, updated_at = now()
     where user_id = v_reporter;

  -- Only fabrication counts. Dismissing a duplicate says nothing bad about the
  -- reporter; penalising it would punish people for reporting a real flood
  -- somebody else reported first.
  elsif reason = 'false_report' then
    update reputation
       set false_report_count = false_report_count + 1, updated_at = now()
     where user_id = v_reporter
   returning false_report_count into v_false_count;

    if v_false_count >= 3 then
      update profiles set suspended_at = now()
       where id = v_reporter and suspended_at is null;

      insert into signal_events (sos_id, actor_id, event_type, payload)
      values (
        decide_sos.signal_id,
        auth.uid(),
        'suspension',
        jsonb_build_object('reporter_id', v_reporter, 'false_report_count', v_false_count)
      );
    end if;
  end if;
end;
$fn$;

revoke execute on function moderator_queue() from anon;
revoke execute on function sos_detail(uuid) from anon;
revoke execute on function decide_sos(uuid, text, dismiss_reason) from anon;

-- Realtime: a moderator should see a signal arrive without refreshing. This is
-- the honest version of "notify the rescuers" - it reaches the console, and
-- nothing outside the application.
alter publication supabase_realtime add table sos_signals;
```

- [ ] **Step 4: Apply and re-run**

```bash
npx supabase migration up
npx vitest run tests/integration/moderation.test.ts
```
Expected: PASS — 11 tests.

**Do not weaken a check to make a test pass.** If the barangay guard or the suspension threshold disagrees with a test, work out which is wrong and report it.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0010_moderation.sql tests/integration/moderation.test.ts
git commit -m "feat: add moderation functions with transactional decisions"
```

---

## Task 3: Granting the moderator role

Right now the only way to become a moderator is inserting a row by hand. That is
fine for a demonstration and wrong to leave undefined.

**Files:**
- Create: `scripts/make-moderator.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the script**

Create `scripts/make-moderator.ts`:
```ts
import { createClient } from "@supabase/supabase-js";

/**
 * Grants an existing user the moderator role for one barangay.
 *
 *   npm run make-moderator -- someone@example.com Malanday
 *
 * Deliberately a script and not a UI: in a real deployment a moderator is a
 * vetted person at a barangay desk, not someone who signed up. Self-service
 * would be the wrong shape entirely.
 */
const [email, barangay] = process.argv.slice(2);

if (!email || !barangay) {
  console.error("usage: npm run make-moderator -- <email> <barangay>");
  process.exit(1);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function main() {
  const { data: known, error: barangayError } = await admin
    .from("barangays")
    .select("name")
    .eq("name", barangay)
    .maybeSingle();
  if (barangayError) throw barangayError;
  if (!known) {
    const { data: all } = await admin.from("barangays").select("name");
    throw new Error(
      `unknown barangay "${barangay}". Known: ${(all ?? []).map((b) => b.name).join(", ")}`,
    );
  }

  const { data: list, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw listError;
  const user = list.users.find((u) => u.email === email);
  if (!user) {
    throw new Error(`no user with email ${email} - they must sign in once first`);
  }

  const { error } = await admin
    .from("moderators")
    .upsert({ user_id: user.id, barangay }, { onConflict: "user_id" });
  if (error) throw error;

  console.log(`${email} is now a moderator for ${barangay}.`);
}

main().catch((error: unknown) => {
  console.error(
    "make-moderator failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
```

- [ ] **Step 2: Add the script command**

Add to the `scripts` block in `package.json`:
```json
"make-moderator": "tsx --env-file=.env.local scripts/make-moderator.ts"
```

- [ ] **Step 3: Verify both failure paths and the success path**

```bash
npm run make-moderator -- nobody@example.test Malanday
```
Expected: fails with "no user with email ... - they must sign in once first".

```bash
npm run make-moderator -- nobody@example.test Atlantis
```
Expected: fails listing the 16 known barangays.

Then create a confirmed user with the service key, run it again with that email
and `Malanday`, and confirm the row exists:
```bash
docker exec supabase_db_app psql -U postgres -d postgres -c "select user_id, barangay from moderators;"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/make-moderator.ts package.json
git commit -m "feat: add a defined way to grant the moderator role"
```

---

## Task 4: The simulation banner and reason list

**Files:**
- Create: `src/components/ReasonList.tsx`, `src/components/ReasonList.test.tsx`, `src/components/SimulationBanner.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write the failing test**

Create `src/components/ReasonList.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReasonList } from "./ReasonList";

describe("ReasonList", () => {
  it("renders every reason sentence", () => {
    render(
      <ReasonList
        reasons={[
          { kind: "supporting", text: "82mm rainfall recorded in 24h." },
          { kind: "concerning", text: "No other reports within 500m." },
        ]}
      />,
    );

    expect(screen.getByText("82mm rainfall recorded in 24h.")).toBeInTheDocument();
    expect(screen.getByText("No other reports within 500m.")).toBeInTheDocument();
  });

  it("marks each reason with its kind for assistive technology", () => {
    render(
      <ReasonList reasons={[{ kind: "concerning", text: "No rainfall recorded in 24h." }]} />,
    );

    expect(screen.getByRole("listitem")).toHaveAttribute("data-kind", "concerning");
  });

  it("says so plainly when there is nothing to show", () => {
    render(<ReasonList reasons={[]} />);
    expect(screen.getByText("Wala pang pagsusuri.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/components/ReasonList.test.tsx`
Expected: FAIL — cannot resolve `./ReasonList`.

- [ ] **Step 3: Write the components**

Create `src/components/ReasonList.tsx`:
```tsx
import type { Reason } from "@/lib/scoring/types";

const KIND_MARK: Record<Reason["kind"], string> = {
  supporting: "+",
  concerning: "!",
  unknown: "?",
};

/**
 * The console never shows a bare number alone. A moderator can act on a
 * sentence in seconds and can argue with it; a score of 34 tells them only to
 * obey or ignore.
 */
export function ReasonList({ reasons }: { reasons: Reason[] }) {
  if (reasons.length === 0) {
    return <p className="reason-empty">Wala pang pagsusuri.</p>;
  }

  return (
    <ul className="reason-list">
      {reasons.map((reason) => (
        <li key={reason.text} className="reason" data-kind={reason.kind}>
          <span className="reason-mark" aria-hidden="true">
            {KIND_MARK[reason.kind]}
          </span>
          {reason.text}
        </li>
      ))}
    </ul>
  );
}
```

Create `src/components/SimulationBanner.tsx`:
```tsx
/**
 * Present on every console screen, not once at sign-in. Somebody who leaves
 * this open on a desk must not be able to forget what it is.
 */
export function SimulationBanner() {
  return (
    <p className="sim-banner" role="note">
      <strong>Demonstrasyon lamang.</strong> Walang tunay na rescue service na
      nakakatanggap ng mga signal na ito. Sa totoong emergency, tumawag sa 911.
    </p>
  );
}
```

- [ ] **Step 4: Add styling**

Append to the END of `src/app/globals.css`:
```css
/* Console */
.sim-banner {
  margin: 0;
  padding: 10px 16px;
  background: #fef3c7;
  border-bottom: 1px solid #fcd34d;
  color: #78350f;
  font-size: 14px;
  line-height: 1.4;
}

.console-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 20px 16px 48px;
}

.reason-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.reason {
  display: flex;
  gap: 10px;
  align-items: baseline;
  font-size: 15px;
  line-height: 1.45;
}

.reason-mark {
  flex: none;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
}

.reason[data-kind="supporting"] .reason-mark { background: var(--success-tint); color: var(--success); }
.reason[data-kind="concerning"] .reason-mark { background: var(--danger-tint); color: var(--danger); }
.reason[data-kind="unknown"]    .reason-mark { background: var(--raised);      color: var(--ink-muted); }

.reason-empty {
  color: var(--ink-muted);
  font-size: 15px;
}

.signal-card {
  display: block;
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: 14px 16px;
  margin-bottom: 12px;
  text-decoration: none;
  color: inherit;
  background: var(--ground);
}

.signal-card:hover { background: var(--raised); }

.signal-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 6px;
}

.signal-band {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 999px;
}

.signal-band[data-band="high"]   { background: var(--danger-tint); color: var(--danger); }
.signal-band[data-band="medium"] { background: #fef3c7;            color: #78350f; }
.signal-band[data-band="low"]    { background: var(--raised);      color: var(--ink-muted); }
.signal-band[data-band="none"]   { background: var(--raised);      color: var(--ink-muted); }

.signal-meta {
  color: var(--ink-muted);
  font-size: 14px;
}
```

- [ ] **Step 5: Run it, verify it passes**

Run: `npx vitest run src/components/ReasonList.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/ReasonList.tsx src/components/ReasonList.test.tsx src/components/SimulationBanner.tsx src/app/globals.css
git commit -m "feat: add reason list and simulation banner"
```

---

## Task 5: The decision server action

**Files:**
- Create: `src/app/actions/decide-sos.ts`

- [ ] **Step 1: Write the action**

Create `src/app/actions/decide-sos.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDismissReason, type DismissReason } from "@/lib/sos/decision";

export type DecideResult = { ok: true } | { ok: false; message: string };

/**
 * Thin wrapper. Every rule - barangay scope, valid transition, reason
 * required, reputation, suspension - lives in the `decide_sos` Postgres
 * function so the whole decision is one transaction. Re-implementing any of it
 * here would create a second source of truth that drifts.
 */
export async function decideSos(
  signalId: string,
  decision: "confirmed" | "dismissed",
  reason: string | null,
): Promise<DecideResult> {
  if (decision === "dismissed" && (reason === null || !isDismissReason(reason))) {
    return { ok: false, message: "Pumili ng dahilan bago i-dismiss." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_sos", {
    signal_id: signalId,
    decision,
    reason: (reason as DismissReason | null) ?? null,
  });

  if (error) {
    // TODO: replace with real telemetry once a logger exists.
    console.error("decide_sos failed", {
      signalId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "Hindi naitala ang desisyon. Subukan ulit." };
  }

  revalidatePath("/console");
  return { ok: true };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: clean. This file exports only async functions and types, which is what
`"use server"` requires — the same constraint that forced `buildSosRow` out of
`submit-sos.ts` in Phase 2A.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/decide-sos.ts
git commit -m "feat: add decision server action"
```

---

## Task 6: The queue

**Files:**
- Create: `src/components/SignalCard.tsx`, `src/app/console/page.tsx`

- [ ] **Step 1: Write the card**

Create `src/components/SignalCard.tsx`:
```tsx
import Link from "next/link";
import { depthLabel, type DepthLevel } from "@/lib/depth/scale";

export interface QueueSignal {
  id: string;
  barangay: string | null;
  depth: DepthLevel;
  status: string;
  trust_score: number | null;
  confidence: string | null;
  created_at: string;
}

function minutesAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "ngayon lang";
  if (mins < 60) return `${mins} min ang nakalipas`;
  return `${Math.round(mins / 60)} oras ang nakalipas`;
}

export function SignalCard({ signal }: { signal: QueueSignal }) {
  // An unscored signal is not a low-priority signal - we simply do not know.
  const band = signal.confidence ?? "none";

  return (
    <Link href={`/console/${signal.id}`} className="signal-card">
      <span className="signal-head">
        <span className="signal-band" data-band={band}>
          {signal.confidence ?? "hindi pa nasusuri"}
        </span>
        <strong>{depthLabel(signal.depth).tl}</strong>
      </span>
      <span className="signal-meta">
        {signal.barangay ?? "walang barangay"} · {minutesAgo(signal.created_at)}
        {signal.trust_score !== null ? ` · ${signal.trust_score}/100` : ""}
      </span>
    </Link>
  );
}
```

- [ ] **Step 2: Write the queue page**

Create `src/app/console/page.tsx`:
```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SimulationBanner } from "@/components/SimulationBanner";
import { SignalCard, type QueueSignal } from "@/components/SignalCard";

export default function ConsolePage() {
  const [signals, setSignals] = useState<QueueSignal[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await createClient().rpc("moderator_queue");
    setSignals((data as QueueSignal[]) ?? []);
  }, []);

  useEffect(() => {
    void load();

    // A signal should appear the moment it is sent, without a refresh. This is
    // the honest version of "notify the rescuers": it reaches this screen, and
    // nothing outside the application.
    const channel = createClient()
      .channel("sos-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sos_signals" },
        () => void load(),
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [load]);

  return (
    <>
      <SimulationBanner />
      <main className="console-page">
        <h1 className="task-title">Mga SOS</h1>

        {signals === null && <p className="task-lede">Naglo-load...</p>}

        {signals !== null && signals.length === 0 && (
          <p className="task-lede">
            Walang aktibong SOS sa barangay mo. Kung wala kang nakikita at
            inaasahan mong mayroon, tiyakin na moderator ka ng tamang barangay.
          </p>
        )}

        {signals?.map((signal) => (
          <SignalCard key={signal.id} signal={signal} />
        ))}
      </main>
    </>
  );
}
```

The empty state names the most likely cause rather than leaving a moderator
staring at nothing — being assigned to a different barangay is otherwise a
silent failure.

- [ ] **Step 3: Verify**

```bash
npm run test
npx tsc --noEmit
npx next build
```
Expected: all pass, `/console` in the route table.

- [ ] **Step 4: Commit**

```bash
git add src/app/console/page.tsx src/components/SignalCard.tsx
git commit -m "feat: add live moderator queue"
```

---

## Task 7: The detail view and decision

**Files:**
- Create: `src/app/console/[id]/page.tsx`

- [ ] **Step 1: Write the page**

Create `src/app/console/[id]/page.tsx`:
```tsx
"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SimulationBanner } from "@/components/SimulationBanner";
import { ReasonList } from "@/components/ReasonList";
import { decideSos } from "@/app/actions/decide-sos";
import { DISMISS_REASONS, dismissReasonLabel } from "@/lib/sos/decision";
import { depthLabel, type DepthLevel } from "@/lib/depth/scale";
import type { Reason } from "@/lib/scoring/types";

interface Detail {
  id: string;
  barangay: string | null;
  depth: DepthLevel;
  status: string;
  trust_score: number | null;
  confidence: string | null;
  reasons: Reason[];
  note: string | null;
  photo_path: string;
  gps_accuracy_m: number | null;
  created_at: string;
  lat: number;
  lon: number;
  rainfall_24h_mm: number | null;
  elevation_m: number | null;
  surrounding_elevation_m: number | null;
  corroborating_reports: number | null;
  provider_ok: boolean | null;
}

export default function SignalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.rpc("sos_detail", { signal_id: id });
    const row = ((data as Detail[]) ?? [])[0] ?? null;
    setDetail(row);

    if (row) {
      // The bucket is private; a distressed person's photograph must never sit
      // behind a guessable public URL.
      const { data: signed } = await supabase.storage
        .from("sos-photos")
        .createSignedUrl(row.photo_path, 300);
      setPhotoUrl(signed?.signedUrl ?? null);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(decision: "confirmed" | "dismissed") {
    setBusy(true);
    setError(null);
    const result = await decideSos(id, decision, decision === "dismissed" ? reason : null);
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push("/console");
  }

  if (!detail) {
    return (
      <>
        <SimulationBanner />
        <main className="console-page">
          <p className="task-lede">Naglo-load, o wala ka sa barangay na ito.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <SimulationBanner />
      <main className="console-page">
        <h1 className="task-title">{depthLabel(detail.depth).tl}</h1>
        <p className="task-lede">
          {detail.barangay} · {new Date(detail.created_at).toLocaleString("en-PH")}
          {detail.trust_score !== null
            ? ` · ${detail.confidence} (${detail.trust_score}/100)`
            : " · hindi pa nasusuri"}
        </p>

        <h2 className="sheet-count">Pagsusuri</h2>
        <ReasonList reasons={detail.reasons ?? []} />

        {detail.note && (
          <p className="notice" style={{ marginTop: 20 }}>
            &ldquo;{detail.note}&rdquo;
          </p>
        )}

        {photoUrl && (
          <img
            src={photoUrl}
            alt="Larawan ng tubig mula sa nag-report"
            style={{ width: "100%", borderRadius: 12, marginTop: 20 }}
          />
        )}

        <h2 className="sheet-count" style={{ marginTop: 28 }}>Desisyon</h2>

        <button className="btn" onClick={() => decide("confirmed")} disabled={busy}>
          Kumpirmahin
        </button>

        <label className="field" style={{ marginTop: 20 }}>
          <span className="field-label">Dahilan ng pag-dismiss</span>
          <select
            className="field-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="">Pumili...</option>
            {DISMISS_REASONS.map((r) => (
              <option key={r} value={r}>
                {dismissReasonLabel(r)}
              </option>
            ))}
          </select>
        </label>

        <button
          className="btn"
          style={{ background: "var(--danger)" }}
          onClick={() => decide("dismissed")}
          disabled={busy || reason === ""}
        >
          I-dismiss
        </button>

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
      </main>
    </>
  );
}
```

The dismiss button stays disabled until a reason is chosen — the reason is not
optional, because "dismissed as a duplicate" and "dismissed as fabricated" must
not damage a reporter's record the same way.

- [ ] **Step 2: Verify**

```bash
npm run test
npx tsc --noEmit
npx next build
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/console/[id]/page.tsx"
git commit -m "feat: add signal detail view with decision"
```

---

## Task 8: End-to-end verification

**Files:**
- Create: `tests/e2e/console.spec.ts`

- [ ] **Step 1: Write the test**

Create `tests/e2e/console.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("the console warns that nobody is dispatched", async ({ page }) => {
  await page.goto("/console");
  await expect(page.getByText("Demonstrasyon lamang.")).toBeVisible();
});

test("a signed-out visitor sees no signals", async ({ page }) => {
  await page.goto("/console");
  // moderator_queue() returns nothing without a moderator row, so the empty
  // state must render rather than a crash or a leaked signal.
  await expect(page.getByText("Walang aktibong SOS sa barangay mo.")).toBeVisible();
});
```

- [ ] **Step 2: Run it**

```bash
npm run test:e2e
```
Expected: 5 passing (3 existing plus these 2).

- [ ] **Step 3: Verify a full decision manually and quote the result**

Create a moderator, send a signal, decide it, then confirm the audit trail:

```bash
docker exec supabase_db_app psql -U postgres -d postgres -c "select e.event_type, e.payload, s.status, s.dismissed_as from signal_events e join sos_signals s on s.id = e.sos_id order by e.created_at desc limit 3;"
```

Expected: a `decision` event whose payload records the decision, the reason and
the previous status, and a signal whose status matches.

Then verify reputation moved:
```bash
docker exec supabase_db_app psql -U postgres -d postgres -c "select user_id, confirmed_count, false_report_count from reputation order by updated_at desc limit 3;"
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/console.spec.ts
git commit -m "test: add console end-to-end coverage"
```

---

## Phase 2B completion criteria

- [ ] A moderator sees only their own barangay's signals, proven by test
- [ ] Every detail view is recorded in the audit log; an unauthorised probe records nothing
- [ ] A signal appears in the queue without a refresh when it is sent
- [ ] The queue shows reason sentences and a confidence band, never a bare number alone
- [ ] Unscored signals sort to the top, not the bottom
- [ ] Dismissing requires a reason code
- [ ] Only `false_report` damages a reporter's record; three suspends them
- [ ] A suspended reporter can still send a new signal
- [ ] Every decision writes an append-only audit entry naming the actor
- [ ] The simulation banner is present on every console screen
- [ ] Nothing sends a message outside the application

## Next

Phase 3 candidates, none started: household vulnerability profiles so a signal
arrives already triaged, flood-aware routing, SMS fallback for when the data
network fails, and evacuation centre capacity.
