# Multi-hazard Antas, Plan A — hazard model and report flow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Antas accepts reports for fire, earthquake, accident, medical and
other hazards alongside flood, each with its own severity words, draws them on
the map, and shows them to moderators — leaving a working, deployable app.

**Architecture:** One enum and two columns are added to `depth_reports` and
`sos_signals`; **no table is renamed**. A shared 1–3 severity rank lets any
hazard be ordered against any other, while flood keeps its five-step body
scale as its own detail. Severity is derived from depth by a database trigger
for flood, so every existing writer — seed script, scripts, tests, the
previous deployed build — keeps working through the migration. The report page
gains one step: pick the hazard, then the input that suits it.

**Tech Stack:** Next.js App Router, TypeScript, Supabase/PostgreSQL with
PostGIS, MapLibre GL, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-27-antas-multi-hazard-design.md`

## Revision note

This plan was rewritten after an independent review of its first draft. The
draft renamed `depth_reports` to `incidents`, added `severity not null` with
no default, introduced a `triage_state` column nothing read, and left a
`[paste function body]` placeholder inside a production migration. Each of
those is a way this project has already been burned. The review's findings
and the resulting decisions:

- **No rename.** `depth_reports` is named by 15 SQL functions and 13 code,
  script and test files. With the service worker serving the previous build
  for one load per device, a rename would make every resident's report fail
  with `insert_failed` for one load each, on a production site with a real
  third-party user. The name is a lie worth living with; it is corrected in
  comments and in the paper, not in the schema. Revisit only after turnover,
  alone, as its own migration.
- **Severity by trigger**, matching how `0027` fills `barangay`. Old callers
  that send only `depth` keep working; SQL and TypeScript cannot drift.
- **`triage_state` deferred to Plan B**, which builds its reader. A column
  nothing reads is the inert mechanism this project has a memory file about.
- **The migration is written in full**, with every `drop`, re-`create`, and
  re-`grant`. `create or replace` cannot change a `returns table` shape, and
  dropping a function drops its grants — 0013 documents that trap.
- **The console shows hazards in this plan**, not later. A moderator
  receiving a fire as a row with a blank depth is not "deployable".

## Global Constraints

- **Both languages or the build fails.** Every string in
  `src/lib/i18n/strings/` exists in the Tagalog half and the English half.
  No `Partial`, no fallback.
- **The Tagalog severity wording is a gate, not a caveat.** Task 3 does not
  merge until the owner has corrected the words. Under this project's own
  rule — half-translated is worse — provisional wording that ships is a bug.
- **The resident UI gains exactly one tap.** No new kind of screen reaches a
  resident. `/report` must not grow longer.
- **`/sos` gains nothing.** Its hazard chips are Plan B.
- **Security is a Postgres predicate**, never application code.
- **Six hours is `MAX_CACHE_AGE_HOURS`** (`src/lib/offline/staleness.ts`).
- **No new npm dependencies.**
- **Migrate before deploying.** Apply 0028 to a target before code that
  reads `hazard_type` reaches it.
- **Hazard order is fixed everywhere:** `flood, fire, earthquake, accident,
  medical, other`.
- **Severity is 1, 2, 3** — 3 is worst.

---

## File Structure

**Create:**
- `src/lib/hazard/types.ts`, `types.test.ts` — vocabularies and guards
- `src/lib/hazard/severity.ts`, `severity.test.ts` — depth→rank, worst-of
- `src/lib/hazard/name.ts` — hazard name and severity word lookups
- `src/lib/i18n/strings/hazard.ts` — the strings
- `src/components/HazardIcon.tsx`, `HazardIcon.test.tsx`
- `src/components/HazardPicker.tsx`, `HazardPicker.test.tsx`
- `supabase/migrations/0028_hazards.sql`
- `tests/integration/hazards.test.ts`

**Modify:**
- `src/lib/i18n/strings/index.ts` — register `hazard`
- `src/lib/i18n/strings/screens.ts` — three error strings, a done-screen line
- `src/lib/reports/validate.ts` — `ReportInput` carries hazard and severity
- `src/lib/reports/row.ts` — emit the new columns
- `src/app/report/page.tsx` — two steps on one route; error keys; done screen
- `src/lib/map/cluster.ts`, `cluster.test.ts` — cluster by worst severity
- `src/components/FloodMap.tsx` — `MapReport` gains hazard/severity; pin glyph
- `src/components/MapLegend.tsx` — hazard key
- `src/components/ReportDetail.tsx`, `StreetHistory.tsx` — nullable depth
- `src/components/ReportCard.tsx` — hazard on the console row
- `src/lib/offline/snapshot.ts` — storage key bump
- `scripts/seed.ts` — send `hazard_type: 'flood'` explicitly
- `tests/integration/reports-near.test.ts` — the new return columns

---

### Task 1: The hazard and severity vocabularies

**Files:**
- Create: `src/lib/hazard/types.ts`
- Test: `src/lib/hazard/types.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `HAZARDS: readonly HazardType[]`, `type HazardType`,
  `SEVERITIES: readonly Severity[]`, `type Severity = 1 | 2 | 3`,
  `isHazardType(v: unknown): v is HazardType`,
  `isSeverity(v: unknown): v is Severity`,
  `PUBLIC_HAZARDS: readonly HazardType[]`, `isPublicHazard(h: HazardType)`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/hazard/types.test.ts
import { describe, it, expect } from "vitest";
import {
  HAZARDS, SEVERITIES, PUBLIC_HAZARDS,
  isHazardType, isSeverity, isPublicHazard,
} from "./types";

describe("hazard vocabulary", () => {
  it("lists the six hazards in the order the picker shows them", () => {
    expect([...HAZARDS]).toEqual([
      "flood", "fire", "earthquake", "accident", "medical", "other",
    ]);
  });

  it("rejects what it does not know, whatever the type", () => {
    // The guard sits on a server-action boundary and is handed unknown.
    expect(isHazardType("typhoon")).toBe(false);
    expect(isHazardType("")).toBe(false);
    expect(isHazardType(null)).toBe(false);
    expect(isHazardType(3)).toBe(false);
  });

  it("accepts every hazard it offers", () => {
    for (const h of HAZARDS) expect(isHazardType(h)).toBe(true);
  });

  it("has exactly three severities, worst last", () => {
    expect([...SEVERITIES]).toEqual([1, 2, 3]);
  });

  it("rejects a severity outside the range or of the wrong type", () => {
    expect(isSeverity(0)).toBe(false);
    expect(isSeverity(4)).toBe(false);
    expect(isSeverity(2.5)).toBe(false);
    expect(isSeverity("2")).toBe(false);
    expect(isSeverity(null)).toBe(false);
  });

  it("keeps a person's emergency off the public map", () => {
    // Flood, fire and earthquake describe a place. Accident and medical
    // describe a person, and pinning one to an address exposes somebody at
    // their worst moment to their whole neighbourhood.
    expect([...PUBLIC_HAZARDS]).toEqual(["flood", "fire", "earthquake"]);
    expect(isPublicHazard("medical")).toBe(false);
    expect(isPublicHazard("accident")).toBe(false);
    expect(isPublicHazard("other")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/hazard/types.test.ts`
Expected: FAIL — cannot find module `./types`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/hazard/types.ts

/**
 * The hazards Antas accepts, in the one order they are ever shown.
 *
 * Flood leads because it is what the product was built for and remains the
 * commonest report; `other` is last because it is the fallback. The order is
 * fixed rather than sorted so the picker, the legend and the graph agree
 * without coordinating.
 *
 * Must match the `hazard_type` enum in migration 0028.
 */
export const HAZARDS = [
  "flood",
  "fire",
  "earthquake",
  "accident",
  "medical",
  "other",
] as const;

export type HazardType = (typeof HAZARDS)[number];

/**
 * One rank for every hazard, so a fire can be ordered against a flood.
 *
 * Three steps, not five. Flood can be measured against a body precisely and
 * keeps its five levels; nothing else can, and inventing finer gradations for
 * a fire would be a false claim about how well it is known.
 */
export const SEVERITIES = [1, 2, 3] as const;

export type Severity = (typeof SEVERITIES)[number];

/**
 * What the public map may draw.
 *
 * Flood, fire and earthquake describe a place, and knowing a street is
 * impassable or a building is alight helps anyone nearby. Accident and medical
 * describe a person. Mirrors `public_hazard()` in 0028; the database is the
 * one that enforces it.
 */
export const PUBLIC_HAZARDS: readonly HazardType[] = ["flood", "fire", "earthquake"];

export function isHazardType(value: unknown): value is HazardType {
  return typeof value === "string" && (HAZARDS as readonly string[]).includes(value);
}

export function isSeverity(value: unknown): value is Severity {
  return typeof value === "number" && (SEVERITIES as readonly number[]).includes(value);
}

export function isPublicHazard(hazard: HazardType): boolean {
  return PUBLIC_HAZARDS.includes(hazard);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/hazard/types.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/hazard/types.ts src/lib/hazard/types.test.ts
git commit -m "feat: the hazard and severity vocabularies"
```

---

### Task 2: Depth-to-severity mapping

**Files:**
- Create: `src/lib/hazard/severity.ts`
- Test: `src/lib/hazard/severity.test.ts`

**Interfaces:**
- Consumes: `Severity` from `./types`; `DepthLevel` from `@/lib/depth/scale`
- Produces: `severityOfDepth(depth: DepthLevel): Severity`,
  `worstSeverity(values: readonly Severity[]): Severity`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/hazard/severity.test.ts
import { describe, it, expect } from "vitest";
import { severityOfDepth, worstSeverity } from "./severity";

describe("severityOfDepth", () => {
  it("maps the five body levels onto three ranks", () => {
    expect(severityOfDepth("ankle")).toBe(1);
    expect(severityOfDepth("knee")).toBe(1);
    expect(severityOfDepth("waist")).toBe(2);
    expect(severityOfDepth("chest")).toBe(3);
    expect(severityOfDepth("above_head")).toBe(3);
  });

  it("keeps today's priority behaviour for flood", () => {
    // report_priority() called a report urgent at chest or deeper. Those are
    // exactly the depths that map to 3, so the bands are preserved rather
    // than re-tuned when the function switches from depth to severity.
    expect(severityOfDepth("chest")).toBe(3);
    expect(severityOfDepth("waist")).toBeLessThan(3);
  });
});

describe("worstSeverity", () => {
  it("takes the worst member, never an average", () => {
    expect(worstSeverity([1, 1, 1, 3])).toBe(3);
    expect(worstSeverity([1, 2])).toBe(2);
  });

  it("returns 1 for an empty list", () => {
    expect(worstSeverity([])).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/hazard/severity.test.ts`
Expected: FAIL — cannot find module `./severity`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/hazard/severity.ts
import type { DepthLevel } from "@/lib/depth/scale";
import type { Severity } from "./types";

/**
 * Flood's five body levels onto the shared three-step rank.
 *
 * Ankle and knee are water you walk through; waist is water you struggle in;
 * chest and above head are water you do not survive misjudging. That is the
 * grouping, and it is why the boundary sits where it does rather than evenly.
 *
 * The database derives the same mapping in `set_report_severity()` (0028) so
 * that callers sending only a depth keep working. THE TWO MUST MATCH; the
 * integration test in Task 5 pins them against each other.
 */
const BY_DEPTH: Readonly<Record<DepthLevel, Severity>> = Object.freeze({
  ankle: 1,
  knee: 1,
  waist: 2,
  chest: 3,
  above_head: 3,
});

export function severityOfDepth(depth: DepthLevel): Severity {
  return BY_DEPTH[depth];
}

/**
 * The worst of a set, never an average.
 *
 * `cluster.ts` already refuses to average depths: eleven ankle-deep reports
 * must not hide one above-head report behind a reassuring colour. The same
 * holds once a cluster can contain a fire.
 *
 * An empty list returns 1 rather than throwing. An empty cluster is not drawn,
 * and a caller that manages to ask should get the least alarming answer rather
 * than a crash on the map.
 */
export function worstSeverity(values: readonly Severity[]): Severity {
  return values.reduce<Severity>((worst, v) => (v > worst ? v : worst), 1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/hazard/severity.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/hazard/severity.ts src/lib/hazard/severity.test.ts
git commit -m "feat: map flood's body scale onto the shared severity rank"
```

---

### Task 3: Hazard strings, in both languages — GATED ON OWNER WORDING

**Files:**
- Create: `src/lib/i18n/strings/hazard.ts`
- Create: `src/lib/hazard/name.ts`
- Modify: `src/lib/i18n/strings/index.ts`
- Modify: `src/lib/i18n/strings/screens.ts`
- Test: `src/lib/hazard/name.test.ts`

**Interfaces:**
- Consumes: `dict` from `@/lib/i18n/dict`; `HAZARDS`, `HazardType`, `Severity`
- Produces: `copy.hazard.*`; `hazardName(h, copy.hazard)`,
  `severityWord(h, s, copy.hazard)`; three new `copy.screens` error strings
  and `copy.screens.reportDoneNotOnMap`

**GATE SATISFIED 2026-08-27.** The owner reviewed the Tagalog severity words
and corrected them: *naipit* rather than *nakulong* for trapped, and
*Kailangan ng tanod* confirmed. "Iba pa" level 2 was additionally changed from
"May nasaktan" — which duplicated Aksidente level 2 verbatim — to
"Kailangan ng tulong". The words below are final. Implement them exactly.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/hazard/name.test.ts
import { describe, it, expect } from "vitest";
import { copyFor } from "@/lib/i18n/strings";
import { HAZARDS, SEVERITIES } from "./types";
import { hazardName, severityWord } from "./name";

const tl = copyFor("tl").hazard;
const en = copyFor("en").hazard;

describe("hazard strings", () => {
  it("names every hazard in both languages", () => {
    for (const h of HAZARDS) {
      expect(hazardName(h, tl)).toBeTruthy();
      expect(hazardName(h, en)).toBeTruthy();
    }
  });

  it("gives every non-flood hazard three severity words in both languages", () => {
    for (const h of HAZARDS) {
      if (h === "flood") continue;
      for (const s of SEVERITIES) {
        expect(severityWord(h, s, tl)).toBeTruthy();
        expect(severityWord(h, s, en)).toBeTruthy();
      }
    }
  });

  it("uses the body scale for flood rather than a severity word", () => {
    // Flood's words live in copy.map as depthAnkle..depthAboveHead. Asking
    // this lookup for a flood severity is a caller mistake, and the answer
    // must not silently be a fire's word.
    expect(() => severityWord("flood", 2, tl)).toThrow();
  });

  it("keeps the three words distinct within a hazard, in both languages", () => {
    for (const h of HAZARDS) {
      if (h === "flood") continue;
      for (const c of [tl, en]) {
        const words = new Set(SEVERITIES.map((s) => severityWord(h, s, c)));
        expect(words.size).toBe(3);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/hazard/name.test.ts`
Expected: FAIL — cannot find module `./name`

- [ ] **Step 3: Write the strings**

```typescript
// src/lib/i18n/strings/hazard.ts
import { dict } from "../dict";

/**
 * What is happening, and how bad it is.
 *
 * Flood has no severity words here: it keeps the five body levels in `map.ts`,
 * which are the product's own measurement and predate this file. Every other
 * hazard gets three.
 *
 * Every word answers one question - what would a barangay tanod want to know
 * from somebody standing there? - so each is something a person can SEE, not a
 * judgement they are asked to make. "Nakakabahala" asks for an opinion;
 * "May nakulong" reports a fact.
 *
 * Read under pressure. Short, concrete, no jargon.
 */
export const hazard = dict(
  {
    pickPrompt: "Ano ang nangyayari?",
    back: "Bumalik",
    severityPrompt: "Ano ang nakikita mo?",

    hazardFlood: "Baha",
    hazardFire: "Sunog",
    hazardEarthquake: "Lindol",
    hazardAccident: "Aksidente",
    hazardMedical: "Medikal",
    hazardOther: "Iba pa",

    // -- Owner-corrected 2026-08-27. "naipit" is the word a person uses for
    // trapped, not "nakulong". "Iba pa" escalates tanod -> tulong ->
    // nanganganib; its level 2 previously duplicated Aksidente level 2 word
    // for word, which would have made two different reports read identically
    // in the console. -----------------------------------------------------
    fire1: "May usok, walang apoy",
    fire2: "May apoy sa isang bahay",
    fire3: "Kumakalat sa ibang bahay",

    earthquake1: "Walang nasira",
    earthquake2: "May nasirang gusali",
    earthquake3: "May gumuho o naipit",

    accident1: "Walang nasaktan",
    accident2: "May nasaktan",
    accident3: "May naipit o malubha",

    medical1: "May sakit, gising",
    medical2: "Hindi makatayo",
    medical3: "Walang malay",

    other1: "Kailangan ng tanod",
    other2: "Kailangan ng tulong",
    other3: "May nanganganib na tao",


    // NOT "call 911". The owner reports that 911 does not connect in practice
    // here, so that advice spends the minutes that matter on a call that will
    // not land. The barangay is the real dispatcher for a medical emergency -
    // it can send someone, or a vehicle, to bring the patient to a hospital.
    // No number: the app does not know sixteen barangay hotlines, and a
    // resident already knows how to reach their own.
    tellBarangay: "Ipaalam din sa barangay ninyo.",
  },
  {
    pickPrompt: "What is happening?",
    back: "Back",
    severityPrompt: "What can you see?",

    hazardFlood: "Flood",
    hazardFire: "Fire",
    hazardEarthquake: "Earthquake",
    hazardAccident: "Accident",
    hazardMedical: "Medical",
    hazardOther: "Other",

    fire1: "Smoke, no flames",
    fire2: "Flames in one house",
    fire3: "Spreading to other houses",

    earthquake1: "Nothing damaged",
    earthquake2: "A building is damaged",
    earthquake3: "Collapse, or someone trapped",

    accident1: "Nobody hurt",
    accident2: "Somebody hurt",
    accident3: "Somebody trapped, or serious",

    medical1: "Ill, but awake",
    medical2: "Cannot stand",
    medical3: "Unconscious",

    other1: "Needs a tanod",
    other2: "Help is needed",
    other3: "Somebody is in danger",

    tellBarangay: "Tell your barangay too.",
  },
);
```

```typescript
// src/lib/hazard/name.ts
import type { Copy } from "@/lib/i18n/strings";
import type { HazardType, Severity } from "./types";

const NAME_KEY: Readonly<Record<HazardType, keyof Copy["hazard"]>> = Object.freeze({
  flood: "hazardFlood",
  fire: "hazardFire",
  earthquake: "hazardEarthquake",
  accident: "hazardAccident",
  medical: "hazardMedical",
  other: "hazardOther",
});

/** "Sunog" / "Fire". */
export function hazardName(hazard: HazardType, copy: Copy["hazard"]): string {
  return copy[NAME_KEY[hazard]] as string;
}

/**
 * The severity word for a non-flood hazard.
 *
 * Throws for flood rather than returning something plausible: flood's words
 * are the body scale in `copy.map`, reached through `depthName`, and a caller
 * asking here has taken a wrong turn that must not be papered over with a
 * fire's word on a flood pin.
 */
export function severityWord(
  hazard: HazardType,
  severity: Severity,
  copy: Copy["hazard"],
): string {
  if (hazard === "flood") {
    throw new Error("flood severity is its depth; use depthName");
  }
  return copy[`${hazard}${severity}` as keyof Copy["hazard"]] as string;
}
```

In `src/lib/i18n/strings/index.ts`: import `hazard`, add it to `DICTS`, add
`hazard: pick(hazard, lang),` to `copyFor`'s return. Follow the five namespaces
already there.

In `src/lib/i18n/strings/screens.ts`, add to **both halves**, beside the
existing `errInvalidDepth`:

| key | tl | en |
|---|---|---|
| `errMissingHazard` | "Pumili kung ano ang nangyayari." | "Choose what is happening." |
| `errMissingSeverity` | "Pumili kung ano ang nakikita mo." | "Choose what you can see." |
| `errDepthNotAllowed` | "Lalim ng tubig ay para lang sa baha." | "Water depth is only for a flood." |
| `reportDoneNotOnMap` | "Naipadala sa barangay. Hindi ito ilalagay sa mapa." | "Sent to the barangay. It will not be drawn on the map." |

**Also in this task, and change it in both halves:** `demoBanner` currently
ends *"Sa totoong emergency, tumawag sa 911."* / *"In a real emergency, call
911."* The owner reports 911 does not connect in practice, which makes that
sentence actively harmful on the one screen where it matters. Replace the
second sentence only — the first ("no real rescue service receives these
signals") stays, because it is still true:

| half | new text |
|---|---|
| tl | "Walang tunay na rescue service na nakakatanggap ng mga signal na ito. Sa totoong emergency, direktang tawagan ang inyong barangay." |
| en | "No real rescue service receives these signals. In a real emergency, contact your barangay directly." |

- [ ] **Step 4: Run test and typecheck**

Run: `npx vitest run src/lib/hazard/name.test.ts && npx tsc --noEmit`
Expected: PASS, and a clean typecheck — the proof that both halves are complete.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/strings/hazard.ts src/lib/i18n/strings/screens.ts src/lib/i18n/strings/index.ts src/lib/hazard/name.ts src/lib/hazard/name.test.ts
git commit -m "feat: hazard names and severity words, both languages, owner-corrected"
```

---

### Task 4: Migration 0028 — written in full

**Files:**
- Create: `supabase/migrations/0028_hazards.sql`

**Interfaces:**
- Consumes: `depth_level`, `moderates(text)`, `report_updates`, `profiles`,
  `reputation`
- Produces: enum `hazard_type`; columns `depth_reports.hazard_type`,
  `depth_reports.severity`, `sos_signals.hazard_type`; trigger
  `set_report_severity`; function `public_hazard(hazard_type)`; recreated
  `report_priority(smallint, timestamptz)`, `report_queue()`,
  `report_detail(uuid)`, `reports_near(...)`, `corroborating_reports(...)`

- [ ] **Step 1: Confirm the functions this must recreate**

Run: `grep -ln "depth_reports" supabase/migrations/*.sql`

Every function whose **return shape changes** must be dropped and recreated
(Postgres refuses `create or replace` on a changed `returns table`). Every
function whose body merely names `depth_reports` and whose shape is unchanged
keeps working — the table is not renamed. That is the whole point of not
renaming. So the set is exactly: `report_priority` (new signature),
`report_queue`, `report_detail`, `reports_near` (new columns), and
`corroborating_reports` (new hazard filter). `decide_report`, `my_reports`,
`reporter_standing`, `is_suspended`, `submit_report_update`,
`set_report_barangay`, `sos_counts_by_barangay` and `handle_new_user` are
**untouched**.

- [ ] **Step 2: Write the migration**

```sql
-- supabase/migrations/0028_hazards.sql
--
-- Antas past flood.
--
-- 0001 built a table for one hazard and named it for the measurement that
-- hazard admits: depth_reports, with a not-null depth on every row. This
-- migration widens it without renaming it and without rewriting a single
-- existing row.
--
-- NOT RENAMED, deliberately. The table is named by fifteen functions and
-- thirteen files, and the service worker serves the previous build for one
-- load per device after a deploy - so a rename would make every resident's
-- report fail for one load each, on a production site with a real
-- third-party user. A misleading name is a smaller harm than that. It can be
-- renamed later, alone, after turnover; do not fold that into anything else.

create type hazard_type as enum (
  'flood', 'fire', 'earthquake', 'accident', 'medical', 'other'
);

-- 1. Columns -----------------------------------------------------------------

alter table depth_reports add column hazard_type hazard_type not null default 'flood';
alter table depth_reports add column severity    smallint;

-- Backfill from depth. The mapping is the one in lib/hazard/severity.ts and
-- must stay identical to it: ankle and knee are water you walk through, waist
-- is water you struggle in, chest and above are water you do not survive
-- misjudging.
update depth_reports
   set severity = case depth
                    when 'ankle'      then 1
                    when 'knee'       then 1
                    when 'waist'      then 2
                    when 'chest'      then 3
                    when 'above_head' then 3
                  end;

-- 2. Severity by trigger, so old writers keep working --------------------------
--
-- Every existing caller - the previous deployed build, scripts/seed.ts, seven
-- integration test files - inserts a depth and no severity. If severity were
-- simply NOT NULL, all of them would fail the moment this applied. Deriving it
-- here is the same argument 0027 makes for barangay: a value assigned by
-- trigger holds for every writer, and an application-level assignment is one
-- forgotten call site away from a failed insert.
create or replace function set_report_severity()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.hazard_type = 'flood' and new.depth is not null then
    -- Always derived for flood. A caller that sends a severity disagreeing
    -- with its own depth is overruled; the depth is the measurement.
    new.severity := case new.depth
                      when 'ankle'      then 1
                      when 'knee'       then 1
                      when 'waist'      then 2
                      when 'chest'      then 3
                      when 'above_head' then 3
                    end;
  end if;
  return new;
end;
$fn$;

create trigger depth_reports_set_severity
  before insert or update of depth, hazard_type, severity on depth_reports
  for each row execute function set_report_severity();

alter table depth_reports alter column severity set not null;
alter table depth_reports add constraint depth_reports_severity_range
  check (severity between 1 and 3);

-- 3. Depth is flood's own detail now -------------------------------------------
--
-- Permitted when and only when the hazard is flood: a fire cannot carry a body
-- measurement, and a flood report cannot lose one.
alter table depth_reports alter column depth drop not null;
alter table depth_reports add constraint depth_only_for_flood
  check (
    (hazard_type =  'flood' and depth is not null) or
    (hazard_type <> 'flood' and depth is null)
  );

create index depth_reports_hazard_idx on depth_reports (hazard_type);

-- 4. sos_signals ----------------------------------------------------------------
--
-- Nullable, and no severity. Plan B offers a hazard on the SOS screen as an
-- optional chip that must never block the hold, so "unspecified" is the honest
-- value for a signal sent by somebody with no seconds to spare. An SOS is an
-- emergency by definition and goes on ranking by trust score.
alter table sos_signals add column hazard_type hazard_type;

-- 5. What the public map may draw ----------------------------------------------
--
-- Flood, fire and earthquake describe a place. Accident and medical describe a
-- person, and pinning one to an address exposes somebody at their worst moment
-- to their whole neighbourhood. They still reach the console in full.
create function public_hazard(h hazard_type)
returns boolean
language sql
immutable
set search_path = public
as $fn$
  select h in ('flood', 'fire', 'earthquake');
$fn$;

-- GRANTED, not merely revoked. `reports_near` is SECURITY INVOKER - correctly,
-- it has been since 0013 - so the call to public_hazard() inside it runs with
-- the CALLER's privileges. Revoking from public without granting to anyone
-- makes reports_near uncallable by every role including anon, and
-- src/app/page.tsx:117 is the public map. The first draft of this migration
-- did exactly that.
--
-- report_priority above is revoked-only and safe, because it is called only
-- from SECURITY DEFINER functions, which run as the owner and bypass the grant
-- check. That is the distinction: an invoker-mode caller needs the grant.
revoke execute on function public_hazard(hazard_type) from public;
grant  execute on function public_hazard(hazard_type) to anon, authenticated, service_role;

-- 6. report_priority moves from depth to severity --------------------------------
--
-- Identical outcome for flood: chest and above_head are exactly the depths
-- that map to 3, so today's bands are preserved rather than re-tuned. Six
-- hours is still MAX_CACHE_AGE_HOURS from lib/offline/staleness.ts.
drop function if exists report_priority(depth_level, timestamptz);

create function report_priority(
  p_severity    smallint,
  p_reported_at timestamptz
)
returns text
language sql
stable
set search_path = public
as $fn$
  select case
    when p_severity = 3 and p_reported_at > now() - interval '6 hours' then 'urgent'
    when p_severity = 2 and p_reported_at > now() - interval '6 hours' then 'watch'
    when p_severity = 3                                                then 'watch'
    else 'routine'
  end;
$fn$;

revoke execute on function report_priority(smallint, timestamptz) from public;

-- 7. report_queue and report_detail gain the hazard -----------------------------
--
-- Return shapes change, so both are dropped and recreated. Dropping a function
-- drops its grants - 0013 learned this - so they are restated at the end.
drop function if exists report_queue();

create function report_queue()
returns table (
  id             uuid,
  barangay       text,
  hazard_type    hazard_type,
  severity       smallint,
  depth          depth_level,
  status         text,
  priority       text,
  reported_at    timestamptz,
  has_photo      boolean,
  gps_accuracy_m double precision,
  answers        integer
)
language sql
stable
security definer
set search_path = public
as $fn$
  select r.id, r.barangay, r.hazard_type, r.severity, r.depth, r.status,
         report_priority(r.severity, r.reported_at),
         r.reported_at,
         r.photo_path is not null,
         r.gps_accuracy_m,
         (select count(*)::integer from report_updates u where u.report_id = r.id)
    from depth_reports r
   where r.status in ('active', 'flagged')
     and moderates(r.barangay)
   order by (r.status = 'flagged') desc,
            case report_priority(r.severity, r.reported_at)
              when 'urgent' then 0
              when 'watch'  then 1
              else 2
            end,
            r.reported_at desc;
$fn$;

drop function if exists report_detail(uuid);

create function report_detail(p_report_id uuid)
returns table (
  id                 uuid,
  barangay           text,
  hazard_type        hazard_type,
  severity           smallint,
  depth              depth_level,
  status             text,
  priority           text,
  reported_at        timestamptz,
  photo_path         text,
  gps_accuracy_m     double precision,
  lat                double precision,
  lon                double precision,
  answers            integer,
  reporter_phone     text,
  reporter_confirmed integer,
  reporter_false     integer
)
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
begin
  insert into report_events (report_id, actor_id, event_type, payload)
  select r.id, auth.uid(), 'viewed', '{}'::jsonb
    from depth_reports r
   where r.id = report_detail.p_report_id
     and moderates(r.barangay);

  return query
  select r.id, r.barangay, r.hazard_type, r.severity, r.depth, r.status,
         report_priority(r.severity, r.reported_at),
         r.reported_at, r.photo_path, r.gps_accuracy_m,
         st_y(r.location::geometry), st_x(r.location::geometry),
         (select count(*)::integer from report_updates u where u.report_id = r.id),
         p.phone,
         coalesce(rep.confirmed_count, 0),
         coalesce(rep.false_report_count, 0)
    from depth_reports r
    left join profiles   p   on p.id       = r.reporter_id
    left join reputation rep on rep.user_id = r.reporter_id
   where r.id = report_detail.p_report_id
     and moderates(r.barangay);
end;
$fn$;

revoke execute on function report_queue()      from public;
revoke execute on function report_detail(uuid) from public;
grant  execute on function report_queue()      to authenticated;
grant  execute on function report_detail(uuid) to authenticated;

-- 8. reports_near: the hazard, and the public filter ---------------------------
--
-- Live definition is 0013's, which added photo_path - NOT 0003's. Reproduced
-- from 0013 with three changes: hazard_type and severity in the shape, and the
-- public_hazard filter.
drop function if exists reports_near(double precision, double precision, double precision);

create function reports_near(
  lat      double precision,
  lon      double precision,
  radius_m double precision
)
returns table (
  id          uuid,
  hazard_type hazard_type,
  severity    smallint,
  depth       depth_level,
  reported_at timestamptz,
  photo_path  text,
  lat         double precision,
  lon         double precision,
  distance_m  double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $fn$
  select
    r.id,
    r.hazard_type,
    r.severity,
    r.depth,
    r.reported_at,
    r.photo_path,
    st_y(r.location::geometry) as lat,
    st_x(r.location::geometry) as lon,
    st_distance(r.location, st_point(reports_near.lon, reports_near.lat)::geography) as distance_m
  from depth_reports r
  where r.status = 'active'
    and public_hazard(r.hazard_type)
    and st_dwithin(r.location, st_point(reports_near.lon, reports_near.lat)::geography, reports_near.radius_m)
  order by distance_m;
$fn$;

-- service_role named explicitly, for the reason 0013 records.
revoke all on function reports_near(double precision, double precision, double precision) from public;
grant execute on function reports_near(double precision, double precision, double precision) to anon, authenticated, service_role;

-- 9. corroborating_reports: like corroborates like ------------------------------
--
-- The trust score's corroboration group counted any active nearby report.
-- After this migration a fire report would corroborate a flood SOS, which is
-- not corroboration. SOS carries no hazard until Plan B, so for now an SOS is
-- corroborated by flood reports only - the assumption every SOS made before
-- today. Same shape, so create or replace suffices and grants survive.
create or replace function corroborating_reports(
  lat            double precision,
  lon            double precision,
  radius_m       double precision,
  within_minutes integer
)
returns integer
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  select count(*)::integer
    from depth_reports r
   where r.status = 'active'
     and r.hazard_type = 'flood'
     and r.reported_at >= now() - make_interval(mins => within_minutes)
     and st_dwithin(
           r.location,
           st_point(corroborating_reports.lon, corroborating_reports.lat)::geography,
           corroborating_reports.radius_m
         );
$fn$;
```

- [ ] **Step 3: Apply it locally**

Run: `npx supabase migration up --local`
Expected: `Applying migration 0028_hazards.sql...` then `Migrations applied`

- [ ] **Step 4: Prove nothing was left broken**

```bash
docker exec supabase_db_app psql -U postgres -d postgres -tAc "
  select count(*) from depth_reports where severity is null;
  select count(*) from depth_reports d
   where d.hazard_type = 'flood'
     and d.severity <> case d.depth when 'ankle' then 1 when 'knee' then 1
                                    when 'waist' then 2 else 3 end;
  select proname from pg_proc
   where prosrc ilike '%depth_reports%' and pronamespace = 'public'::regnamespace
   order by 1;"
```

Expected: `0`, `0`, and a list that still includes `my_reports`,
`reporter_standing`, `is_suspended` — those must be present and, because the
table was not renamed, still valid.

Then CALL every function this migration creates or recreates, **as the roles
that will actually call them** — not as superuser, and not by inspecting
`pg_proc` metadata. Checking shapes and `prosecdef` flags is what let a missing
grant through the first time: the function existed, had the right signature,
and was uncallable.

```bash
docker exec supabase_db_app psql -U postgres -d postgres -c "
  set role anon;
  select count(*) from reports_near(14.65, 121.10, 5000);
  reset role;
  set role authenticated;
  select count(*) from reports_near(14.65, 121.10, 5000);
  reset role;
  select report_priority(3::smallint, now());
  select public_hazard('flood');
  select corroborating_reports(14.65, 121.10, 500, 60);"
```

Expected: five results, no errors. A `permission denied` here is the bug this
step exists to catch.

Then the functions this migration deliberately does NOT touch, whose bodies
name `depth_reports` and are re-parsed at call time:

```bash
docker exec supabase_db_app psql -U postgres -d postgres -tAc "
  select count(*) from my_reports();
  select * from reporter_standing(gen_random_uuid());
  select is_suspended();"
```

Expected: three results, no errors. (`my_reports` returns 0 rows without a
session; that is fine — an error would not be.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0028_hazards.sql
git commit -m "feat: hazards and severity in the schema, with the table left as it is"
```

---

### Task 5: Integration tests, and every writer that sends only a depth

**Files:**
- Create: `tests/integration/hazards.test.ts`
- Modify: `tests/integration/reports-near.test.ts` — assert on the new columns
- Modify: `scripts/seed.ts` — add `hazard_type: "flood"` to each inserted row

**Interfaces:**
- Consumes: everything in 0028
- Produces: nothing

- [ ] **Step 1: Write the new tests**

Copy the fixture block from `tests/integration/report-moderation.test.ts` —
`url`, `anonKey`, `serviceKey`, `opts`, the three clients, `makeUser`,
`MALANDAY`, `PASSWORD`, `beforeAll` — verbatim. Add:

```typescript
async function newIncident(row: {
  hazard_type: string;
  depth: string | null;
  severity?: number;
}): Promise<string> {
  const { data, error } = await admin
    .from("depth_reports")
    .insert({ reporter_id: reporterId, location: MALANDAY, ...row })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

const NEAR_MALANDAY = { lat: 14.656, lon: 121.095, radius_m: 2000 };

describe("severity is derived for flood", () => {
  it("fills severity from depth when a writer sends only a depth", async () => {
    // The previous deployed build, the seed script and seven test files all
    // insert this shape. If it stops working, the migration broke production.
    const id = await newIncident({ hazard_type: "flood", depth: "chest" });
    const { data } = await admin.from("depth_reports").select("severity").eq("id", id).single();
    expect(data!.severity).toBe(3);
  });

  it("overrules a severity that disagrees with the depth", async () => {
    const id = await newIncident({ hazard_type: "flood", depth: "ankle", severity: 3 });
    const { data } = await admin.from("depth_reports").select("severity").eq("id", id).single();
    expect(data!.severity).toBe(1);
  });

  it("agrees with lib/hazard/severity.ts on every level", async () => {
    // The TypeScript mapping and the SQL mapping must never drift.
    const { severityOfDepth } = await import("@/lib/hazard/severity");
    for (const depth of ["ankle", "knee", "waist", "chest", "above_head"] as const) {
      const id = await newIncident({ hazard_type: "flood", depth });
      const { data } = await admin.from("depth_reports").select("severity").eq("id", id).single();
      expect(data!.severity).toBe(severityOfDepth(depth));
    }
  });
});

describe("the hazard constraints", () => {
  it("refuses a depth on a fire", async () => {
    await expect(newIncident({ hazard_type: "fire", depth: "chest", severity: 2 }))
      .rejects.toBeTruthy();
  });

  it("refuses a flood with no depth", async () => {
    await expect(newIncident({ hazard_type: "flood", depth: null, severity: 1 }))
      .rejects.toBeTruthy();
  });

  it("refuses a fire with no severity", async () => {
    await expect(newIncident({ hazard_type: "fire", depth: null }))
      .rejects.toBeTruthy();
  });

  it("refuses a severity outside 1..3", async () => {
    await expect(newIncident({ hazard_type: "fire", depth: null, severity: 4 }))
      .rejects.toBeTruthy();
  });
});

describe("priority across hazards", () => {
  it("calls a fresh severity-3 fire urgent, like a chest-deep flood", async () => {
    const fire = await newIncident({ hazard_type: "fire", depth: null, severity: 3 });
    const { data } = await modClient.rpc("report_queue");
    const row = (data as { id: string; priority: string }[]).find((r) => r.id === fire);
    expect(row!.priority).toBe("urgent");
  });

  it("carries the hazard to the queue", async () => {
    const fire = await newIncident({ hazard_type: "fire", depth: null, severity: 2 });
    const { data } = await modClient.rpc("report_queue");
    const row = (data as { id: string; hazard_type: string }[]).find((r) => r.id === fire);
    expect(row!.hazard_type).toBe("fire");
  });
});

describe("the public map", () => {
  it("keeps a medical emergency off it", async () => {
    const id = await newIncident({ hazard_type: "medical", depth: null, severity: 3 });
    const stranger = createClient(url, anonKey, opts);
    const { data } = await stranger.rpc("reports_near", NEAR_MALANDAY);
    expect((data as { id: string }[]).map((r) => r.id)).not.toContain(id);
  });

  it("keeps an accident off it", async () => {
    const id = await newIncident({ hazard_type: "accident", depth: null, severity: 2 });
    const stranger = createClient(url, anonKey, opts);
    const { data } = await stranger.rpc("reports_near", NEAR_MALANDAY);
    expect((data as { id: string }[]).map((r) => r.id)).not.toContain(id);
  });

  it("shows a fire on it, with its hazard and severity", async () => {
    const id = await newIncident({ hazard_type: "fire", depth: null, severity: 2 });
    const stranger = createClient(url, anonKey, opts);
    const { data } = await stranger.rpc("reports_near", NEAR_MALANDAY);
    const row = (data as { id: string; hazard_type: string; severity: number }[])
      .find((r) => r.id === id);
    expect(row).toMatchObject({ hazard_type: "fire", severity: 2 });
  });
});

describe("the functions this migration did not touch still work", () => {
  // Bodies that name depth_reports are re-parsed at call time. Calling each
  // once is the difference between finding a break here and finding it on a
  // resident's phone.
  it("my_reports", async () => {
    const { error } = await modClient.rpc("my_reports");
    expect(error).toBeNull();
  });
  it("reporter_standing", async () => {
    // Takes a REPORT id (0019:32), not a reporter id.
    const id = await newIncident({ hazard_type: "flood", depth: "knee" });
    const { error } = await modClient.rpc("reporter_standing", { p_report_id: id });
    expect(error).toBeNull();
  });
  it("corroborating_reports counts floods only", async () => {
    await newIncident({ hazard_type: "fire", depth: null, severity: 3 });
    const { data, error } = await admin.rpc("corroborating_reports", {
      ...NEAR_MALANDAY, within_minutes: 60,
    });
    expect(error).toBeNull();
    // Whatever the count is, adding a fire must not have raised it.
    await newIncident({ hazard_type: "fire", depth: null, severity: 3 });
    const { data: after } = await admin.rpc("corroborating_reports", {
      ...NEAR_MALANDAY, within_minutes: 60,
    });
    expect(after).toBe(data);
  });
});
```

`reporter_standing(p_report_id uuid)` is 0019:32's real signature; it takes
a report, not a reporter.

- [ ] **Step 2: Update `reports-near.test.ts` and `seed.ts`**

`reports-near.test.ts`: where it asserts the returned row shape, add
`hazard_type: "flood"` and `severity` to the expectation.

`scripts/seed.ts:132,171`: add `hazard_type: "flood"` to each row object. The
trigger fills severity; the explicit hazard is for the reader, not the
database.

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: every file passes.

- [ ] **Step 4: Commit**

```bash
git add tests/ scripts/seed.ts
git commit -m "test: the hazard constraints, and that a person's emergency stays off the public map"
```

---

### Task 6: HazardIcon

**Files:**
- Create: `src/components/HazardIcon.tsx`
- Test: `src/components/HazardIcon.test.tsx`

**Interfaces:**
- Consumes: `HazardType`
- Produces: `<HazardIcon hazard size="sm"|"md"|"lg" title? />`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/HazardIcon.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HazardIcon } from "./HazardIcon";
import { HAZARDS } from "@/lib/hazard/types";

describe("HazardIcon", () => {
  it("renders a glyph for every hazard", () => {
    for (const h of HAZARDS) {
      const { container } = render(<HazardIcon hazard={h} size="md" />);
      expect(container.querySelector("svg")).not.toBeNull();
    }
  });

  it("is hidden from screen readers when it has no title", () => {
    // The word is always beside it in the picker and on cards, so the glyph
    // is decoration there. Announcing "fire" twice is noise.
    const { container } = render(<HazardIcon hazard="fire" size="sm" />);
    expect(container.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("is announced when given a title, as on a map pin", () => {
    const { container } = render(<HazardIcon hazard="fire" size="sm" title="Sunog" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBeNull();
    expect(svg.querySelector("title")!.textContent).toBe("Sunog");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/HazardIcon.test.tsx`
Expected: FAIL — cannot find module `./HazardIcon`

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/HazardIcon.tsx
import type { HazardType } from "@/lib/hazard/types";

/**
 * One glyph per hazard, deliberately conventional.
 *
 * A wave, a flame, a cracked ground line, a car, a cross, an exclamation.
 * This UI was approved as usable by people who are not comfortable with apps,
 * and that audience recognises the obvious symbol, not the elegant one.
 *
 * `currentColor` throughout, so the caller decides colour: the icon says
 * WHAT, and colour is reserved for HOW BAD.
 */
const PATHS: Readonly<Record<HazardType, string>> = Object.freeze({
  flood:      "M2 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0 2 2 2 2v2H2v-4zm0-6c2-2 4-2 6 0s4 2 6 0 4-2 6 0v2c-2 2-4 2-6 0s-4-2-6 0-4 2-6 0v-2z",
  fire:       "M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-2-6 1-10z",
  earthquake: "M2 12h4l2-6 3 12 3-9 2 5 2-2h4",
  accident:   "M5 11l1.5-4h11L19 11h1v6h-2v-2H6v2H4v-6h1zm2 0h10l-1-3H8l-1 3zm0 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm10 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  medical:    "M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7V3z",
  other:      "M11 3h2v11h-2V3zm0 14h2v3h-2v-3z",
});

const SIZE_PX = { sm: 16, md: 24, lg: 40 } as const;

interface HazardIconProps {
  hazard: HazardType;
  size: keyof typeof SIZE_PX;
  /** Announced to screen readers. Omit where the word is already beside it. */
  title?: string;
}

export function HazardIcon({ hazard, size, title }: HazardIconProps) {
  const px = SIZE_PX[size];
  const strokeOnly = hazard === "earthquake";
  return (
    <svg
      className="hazard-icon"
      data-hazard={hazard}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill={strokeOnly ? "none" : "currentColor"}
      stroke={strokeOnly ? "currentColor" : "none"}
      strokeWidth={strokeOnly ? 2 : undefined}
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[hazard]} />
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/HazardIcon.test.tsx`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/components/HazardIcon.tsx src/components/HazardIcon.test.tsx
git commit -m "feat: one glyph per hazard, at three sizes"
```

---

### Task 7: HazardPicker — step one of the report

**Files:**
- Create: `src/components/HazardPicker.tsx`
- Modify: `src/app/globals.css` — append `.hazard-*` rules
- Test: `src/components/HazardPicker.test.tsx`

**Interfaces:**
- Consumes: `HAZARDS`, `HazardType`, `HazardIcon`, `hazardName`, `copy.hazard`
- Produces: `<HazardPicker onPick={(h: HazardType) => void} />`

- [ ] **Step 1: Write the failing test**

`src/components/PhotoCapture.test.tsx` renders components bare — no provider
wrapper — so `useCopy()` must resolve a default (Tagalog) outside a provider.
Match that: render bare, and the Tagalog button name `/sunog/i` is what the
test finds.

```tsx
// src/components/HazardPicker.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HazardPicker } from "./HazardPicker";

describe("HazardPicker", () => {
  it("offers all six hazards as buttons", () => {
    render(<HazardPicker onPick={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(6);
  });

  it("reports the hazard that was tapped", async () => {
    const onPick = vi.fn();
    render(<HazardPicker onPick={onPick} />);
    await userEvent.click(screen.getByRole("button", { name: /sunog/i }));
    expect(onPick).toHaveBeenCalledWith("fire");
  });

  it("preselects nothing", () => {
    // A default hazard would be a guess put in somebody's mouth. The first
    // tap must be a choice.
    const onPick = vi.fn();
    render(<HazardPicker onPick={onPick} />);
    expect(onPick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/HazardPicker.test.tsx`
Expected: FAIL — cannot find module `./HazardPicker`

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/HazardPicker.tsx
"use client";

import { HAZARDS, type HazardType } from "@/lib/hazard/types";
import { hazardName } from "@/lib/hazard/name";
import { HazardIcon } from "./HazardIcon";
import { useCopy } from "@/lib/i18n/context";

/**
 * The first tap of a report: what is happening.
 *
 * Six large targets, icon above word, no scrolling. Nothing is preselected,
 * because a default hazard would be a guess put in somebody's mouth.
 */
export function HazardPicker({ onPick }: { onPick: (h: HazardType) => void }) {
  const copy = useCopy();
  return (
    <div className="hazard-picker">
      <h2 className="task-title">{copy.hazard.pickPrompt}</h2>
      <div className="hazard-grid">
        {HAZARDS.map((h) => (
          <button
            key={h}
            type="button"
            className="hazard-choice"
            data-hazard={h}
            onClick={() => onPick(h)}
          >
            <HazardIcon hazard={h} size="lg" />
            <span>{hazardName(h, copy.hazard)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

Append to `globals.css`:

```css
/* Six targets, two columns, none smaller than a thumb. */
.hazard-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 16px;
}

.hazard-choice {
  appearance: none;
  background: var(--ground);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  min-height: 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font: inherit;
  font-weight: 600;
  font-size: 16px;
  color: var(--ink);
  cursor: pointer;
}

.hazard-choice:hover { border-color: var(--ink-muted); }

/* Three severity words, stacked, as tall as the depth slider's rows. */
.severity-choice {
  width: 100%;
  min-height: 56px;
  margin-top: 8px;
  text-align: left;
}

.severity-choice[aria-pressed="true"] {
  border-color: var(--ink);
  background: var(--raised);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/HazardPicker.test.tsx`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/components/HazardPicker.tsx src/components/HazardPicker.test.tsx src/app/globals.css
git commit -m "feat: the report begins by asking what is happening"
```

---

### Task 8: The two-step report flow

**Files:**
- Modify: `src/lib/reports/validate.ts:23` (`ReportInput`), `:56`
  (`LocationErrorCode`), `:93` (`validateReport`)
- Modify: `src/lib/reports/row.ts`
- Modify: `src/app/report/page.tsx:30` (`ERROR_KEY`), `:50` (state), the
  render, and the done screen at `:152`
- Test: the existing test beside `validate.ts` (its fixture is named `valid`)

**Interfaces:**
- Consumes: `HazardPicker`, `severityOfDepth`, `isHazardType`, `isSeverity`,
  `isPublicHazard`, `severityWord`, `copy.hazard`, `copy.screens.err*`
- Produces: `ReportInput` gains `hazard: unknown; severity: unknown` (raw, as
  the boundary demands); `ValidationResult` success carries
  `hazard: HazardType; severity: Severity; depth: DepthLevel | null`;
  `ValidatedReportInput` and `ReportRow` gain the same

- [ ] **Step 1: Write the failing tests**

In the test beside `validate.ts`, extend the `valid` fixture with
`hazard: "flood", severity: null`, then add:

```typescript
it("requires a hazard", () => {
  const r = validateReport({ ...valid, hazard: undefined });
  expect(!r.ok && r.errors).toContain("missing_hazard");
});

it("rejects a hazard it does not know", () => {
  const r = validateReport({ ...valid, hazard: "typhoon" });
  expect(!r.ok && r.errors).toContain("missing_hazard");
});

it("requires a depth for flood", () => {
  const r = validateReport({ ...valid, hazard: "flood", depth: "" });
  expect(!r.ok && r.errors).toContain("invalid_depth");
});

it("forbids a depth on anything but flood", () => {
  const r = validateReport({ ...valid, hazard: "fire", depth: "chest", severity: 2 });
  expect(!r.ok && r.errors).toContain("depth_not_allowed");
});

it("derives a flood's severity from its depth", () => {
  const r = validateReport({ ...valid, hazard: "flood", depth: "chest", severity: null });
  expect(r.ok && r.severity).toBe(3);
  expect(r.ok && r.depth).toBe("chest");
});

it("requires a severity for a non-flood hazard", () => {
  const r = validateReport({ ...valid, hazard: "fire", depth: "", severity: null });
  expect(!r.ok && r.errors).toContain("missing_severity");
});

it("accepts a fire with a severity and no depth", () => {
  const r = validateReport({ ...valid, hazard: "fire", depth: "", severity: 2 });
  expect(r.ok && r.severity).toBe(2);
  expect(r.ok && r.depth).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/reports/`
Expected: FAIL — `hazard` is not a property of `ReportInput`

- [ ] **Step 3: Write minimal implementation**

`validate.ts`:

```typescript
export interface ReportInput {
  /** Raw, as it arrives at the server action. Narrowed by isHazardType. */
  hazard: unknown;
  /** Raw. Ignored for flood, required otherwise. Narrowed by isSeverity. */
  severity: unknown;
  /** Empty string when the hazard is not flood. */
  depth: string;
  lat: number;
  lon: number;
  gpsAccuracyM: number | null;
  photoPath?: string | null;
}

export type ReportErrorCode =
  | "missing_hazard"
  | "invalid_depth"
  | "depth_not_allowed"
  | "missing_severity"
  | "invalid_coordinates"
  | "outside_pilot_area";

export type ValidationResult =
  | {
      ok: true;
      hazard: HazardType;
      severity: Severity;
      depth: DepthLevel | null;
      warnings: ReportWarningCode[];
    }
  | { ok: false; errors: ReportErrorCode[] };

/** The three hazard codes join invalid_depth in what an SOS can never see. */
export type LocationErrorCode = Exclude<
  ReportErrorCode,
  "invalid_depth" | "missing_hazard" | "depth_not_allowed" | "missing_severity"
>;
```

and in `validateReport`:

```typescript
export function validateReport(input: ReportInput): ValidationResult {
  const errors: ReportErrorCode[] = [];

  if (!isHazardType(input.hazard)) {
    errors.push("missing_hazard");
  }
  const hazard = isHazardType(input.hazard) ? input.hazard : null;

  let depth: DepthLevel | null = null;
  let severity: Severity | null = null;

  if (hazard === "flood") {
    if (!isDepthLevel(input.depth)) errors.push("invalid_depth");
    else {
      depth = input.depth;
      severity = severityOfDepth(depth);
    }
  } else if (hazard !== null) {
    if (input.depth !== "") errors.push("depth_not_allowed");
    if (!isSeverity(input.severity)) errors.push("missing_severity");
    else severity = input.severity;
  }

  const location = validateLocation(input);
  if (!location.ok) errors.push(...location.errors);

  if (errors.length > 0 || hazard === null || severity === null) {
    return { ok: false, errors };
  }

  return { ok: true, hazard, severity, depth, warnings: location.warnings };
}
```

`row.ts`: `ValidatedReportInput` gains `hazard: HazardType; severity: Severity;
depth: DepthLevel | null`; `ReportRow` gains `hazard_type: HazardType;
severity: Severity; depth: DepthLevel | null`; `buildReportRow` copies them.

`submit-report.ts`: pass `hazard: validation.hazard, severity:
validation.severity, depth: validation.depth` into `buildReportRow`.

`report/page.tsx`:

```tsx
const [hazard, setHazard] = useState<HazardType | null>(null);
const [depth, setDepth] = useState<DepthLevel>("knee");
const [severity, setSeverity] = useState<Severity | null>(null);
```

`ERROR_KEY` gains `missing_hazard: "errMissingHazard"`,
`missing_severity: "errMissingSeverity"`, `depth_not_allowed:
"errDepthNotAllowed"`.

Render:
- `hazard === null` → `<HazardPicker onPick={setHazard} />` and nothing else.
- otherwise, a `btn-quiet` back control reading `copy.hazard.back` that sets
  `hazard` to null and `severity` to null, then:
  - `hazard === "flood"` → the existing `DepthSlider`, unchanged.
  - else → `copy.hazard.severityPrompt` as a heading, then for each
    `s of SEVERITIES` a `<button className="btn severity-choice"
    aria-pressed={severity === s} onClick={() => setSeverity(s)}>` reading
    `severityWord(hazard, s, copy.hazard)`.
  - `hazard === "medical" || hazard === "accident"` → `copy.hazard.tellBarangay`
    in a `notice`, above the submit button. Shown for every severity, not only
    the worst: the barangay is the pathway for these two whatever the level,
    and a person deciding whether this is "bad enough" is exactly who should
    be told to call anyway.
- Photo capture and submit stay exactly where they are.

**Send is disabled until the report is complete**: `hazard !== null && (hazard
=== "flood" || severity !== null)`. Without this a resident who taps Sunog then
Send waits up to ten seconds for a GPS fix and only then learns they missed a
step. The check runs before locating, not after.

Submit passes `hazard`, `severity`, and `depth: hazard === "flood" ? depth : ""`.

Done screen: after `reportDoneTitle`, when `!isPublicHazard(hazard)`, render
`copy.screens.reportDoneNotOnMap` in place of `reportDoneBody`. A person who
filed an accident will otherwise go looking for a pin that is deliberately not
there.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all pass

- [ ] **Step 5: Look at it**

Start the app; open `/report` in both languages. File one flood and one fire.
Confirm: the page is never longer than today; Send is disabled until a choice
is made; a medical severity-3 shows the 911 line; both rows land in
`depth_reports` with the right `hazard_type`, `severity` and `depth`; the fire's
done screen says it will not be drawn.

- [ ] **Step 6: Commit**

```bash
git add src/lib/reports/ src/app/actions/submit-report.ts src/app/report/page.tsx
git commit -m "feat: the report asks what happened, then what it looks like"
```

---

### Task 9: The map draws hazards, and nothing dereferences a null depth

**Files:**
- Modify: `src/lib/map/cluster.ts`, `cluster.test.ts`
- Modify: `src/components/FloodMap.tsx:22-29` (`MapReport`), pin rendering,
  `areaElement`
- Modify: `src/app/page.tsx` — map `reports_near` rows onto `MapReport`
- Modify: `src/components/MapLegend.tsx`
- Modify: `src/components/ReportDetail.tsx`, `StreetHistory.tsx`
- Modify: `src/lib/offline/snapshot.ts:19` — `KEY`

**Interfaces:**
- Consumes: `worstSeverity`, `Severity`, `HazardType`, `HazardIcon`,
  `hazardName`, `severityWord`, `depthName`
- Produces: `MapReport` and `Clusterable` gain `hazard: HazardType; severity:
  Severity` and `depth` becomes `DepthLevel | null`; `Cluster<T>` carries
  `severity`, `hazard`, and `depth: DepthLevel | null`

- [ ] **Step 1: Write the failing tests**

Extend `src/lib/map/cluster.test.ts`:

```typescript
it("takes the cluster's worst severity, never an average", () => {
  const [cluster] = clusterByProximity([
    { id: "a", key: "a", x: 0, y: 0, severity: 1, hazard: "flood", depth: "ankle" },
    { id: "b", key: "b", x: 2, y: 2, severity: 3, hazard: "fire",  depth: null },
  ]);
  expect(cluster.severity).toBe(3);
});

it("labels a mixed cluster by its worst member's hazard", () => {
  const [cluster] = clusterByProximity([
    { id: "a", key: "a", x: 0, y: 0, severity: 1, hazard: "flood", depth: "ankle" },
    { id: "b", key: "b", x: 2, y: 2, severity: 3, hazard: "fire",  depth: null },
  ]);
  expect(cluster.hazard).toBe("fire");
});

it("keeps the exact depth when every member is flood", () => {
  const [cluster] = clusterByProximity([
    { id: "a", key: "a", x: 0, y: 0, severity: 1, hazard: "flood", depth: "ankle" },
    { id: "b", key: "b", x: 2, y: 2, severity: 3, hazard: "flood", depth: "chest" },
  ]);
  expect(cluster.depth).toBe("chest");
});

it("has no depth once a non-flood member joins", () => {
  const [cluster] = clusterByProximity([
    { id: "a", key: "a", x: 0, y: 0, severity: 3, hazard: "flood", depth: "chest" },
    { id: "b", key: "b", x: 2, y: 2, severity: 1, hazard: "fire",  depth: null },
  ]);
  expect(cluster.depth).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/map/cluster.test.ts`
Expected: FAIL — `severity` is not a property of `Clusterable`

- [ ] **Step 3: Write minimal implementation**

`cluster.ts`: `Clusterable` gains `severity: Severity; hazard: HazardType;
depth: DepthLevel | null`. `Cluster<T>` carries `severity` (via
`worstSeverity`), `hazard` (of the first member at that worst severity — the
deterministic sort makes the tie stable), and `depth` (via the existing
`deepestOf` **only when every member's hazard is flood**, else null). Keep the
comment explaining why averaging is refused; only its subject widens.

`FloodMap.tsx`:
- `MapReport` gains `hazard: HazardType; severity: Severity` and `depth`
  becomes `DepthLevel | null`.
- Pin colour: `cluster.depth !== null ? DEPTH_HEX[cluster.depth] :
  SEVERITY_HEX[cluster.severity]` where
  `SEVERITY_HEX = { 1: DEPTH_HEX.ankle, 2: DEPTH_HEX.waist, 3: DEPTH_HEX.above_head }`.
- Inside the pin element, render `<HazardIcon hazard={cluster.hazard}
  size="sm" title={hazardName(cluster.hazard, copy.hazard)} />`.
- `areaElement` (the "water was like this around here" stain) renders **only
  when `cluster.depth !== null`**. A stain under a fire says water.

`src/app/page.tsx`: where `reports_near` rows become `MapReport`, copy
`hazard_type` → `hazard` and `severity`, and pass `depth` through as nullable.

`ReportDetail.tsx` and `StreetHistory.tsx`: wherever `report.depth` is
dereferenced, branch — flood shows `depthName` and the depth meter exactly as
today; any other hazard shows `hazardName` and `severityWord` and **no depth
meter**. `StreetHistory`'s "Pinakamalalim" heading applies only when the
street's reports are all flood; otherwise it reads the worst severity word.

`MapLegend.tsx`: keep the depth ramp; beneath it, six rows of `HazardIcon` at
`sm` plus `hazardName`, in `HAZARDS` order; and one line in both languages —
`copy.map.legendDarkerWorse`: "Mas madilim, mas malala." / "Darker is worse." —
added to `map.ts` in both halves.

`snapshot.ts:19`: `KEY = "antas:last-reports:v2"`. A cached array from before
this change has no `hazard` or `severity`, and the file's own rule is that
anything unreadable is too old. Bumping the key discards it cleanly rather
than handing `HazardIcon` an undefined.

- [ ] **Step 4: Run tests, typecheck, build, and look**

Run: `npm test && npx tsc --noEmit && npm run build`
Start the app; open the map in both languages with at least one flood, one
fire and one medical seeded. Confirm: a fire pin carries a flame and a
severity colour; a flood pin keeps its depth colour and its stain; no medical
pin exists; a mixed cluster shows the flame; tapping a fire pin opens a detail
with no depth meter; the legend reads correctly.

- [ ] **Step 5: Commit**

```bash
git add src/lib/map/ src/components/FloodMap.tsx src/components/MapLegend.tsx src/components/ReportDetail.tsx src/components/StreetHistory.tsx src/app/page.tsx src/lib/offline/snapshot.ts src/lib/i18n/strings/map.ts
git commit -m "feat: the map draws what the hazard is and how bad it is"
```

---

### Task 10: The console shows the hazard

**Files:**
- Modify: `src/components/ReportCard.tsx:23-33` (`QueueReport`) and the head
  and body renders
- Modify: `src/app/console/page.tsx` — no change needed to the subscription;
  the table was not renamed

**Interfaces:**
- Consumes: `report_queue()` and `report_detail()` now returning
  `hazard_type` and `severity`; `HazardIcon`, `hazardName`, `severityWord`
- Produces: nothing

- [ ] **Step 1: Update the types**

`QueueReport` gains `hazard_type: HazardType; severity: Severity` and `depth`
becomes `DepthLevel | null`. `ReportDetailRow` inherits it.

- [ ] **Step 2: Render it**

In the card head, before the depth word: `<HazardIcon hazard={report.hazard_type}
size="sm" />` (no title — the word follows). The bold word becomes
`report.hazard_type === "flood" ? depthName(report.depth!, copy.map) :
`${hazardName(report.hazard_type, copy.hazard)} · ${severityWord(report.hazard_type, report.severity, copy.hazard)}``.
A moderator reads "Sunog · May apoy sa isang bahay", never "2".

- [ ] **Step 3: Look at it**

Run: `npx tsc --noEmit`, then open `/console` → Mga report with a fire in the
queue, in both languages. Confirm the flame and the words.

- [ ] **Step 4: Commit**

```bash
git add src/components/ReportCard.tsx
git commit -m "feat: the console shows what kind of report it is"
```

---

### Task 11: /ako survives a non-flood report

**Added after Task 9 found it.** The plan's file list never included `/ako`,
and the screen is broken for anyone who files a fire: `my_reports()`
(`0015_my_reports.sql:19-28`) returns `depth` with **no `hazard_type`**, and
after 0028 a non-flood report's depth is NULL. `ako/page.tsx` types it
`depth: DepthLevel` and paints `DEPTH_VAR[report.depth]` at :232 and
`depthName` at :239 — a colourless swatch and an empty label.

**Files:**
- Create: `supabase/migrations/0029_my_reports_hazard.sql`
- Modify: `src/app/ako/page.tsx`
- Test: `tests/integration/hazards.test.ts` (extend)

**Interfaces:**
- Consumes: `hazard_type`, `severity` on `depth_reports` (0028); `hazardName`,
  `severityWord`, `HazardIcon`, `SEVERITY_VAR`
- Produces: `my_reports()` returning `hazard_type` and `severity`

- [ ] **Step 1: Read 0015 in full**, then write `0029_my_reports_hazard.sql`.
`my_reports()` changes return shape, so it must be **dropped and recreated** —
`create or replace` cannot change a `returns table`. **Dropping a function
drops its grants**; restate them exactly as 0015 had them. This is the trap
0013 documents and the one that cost a fix round in 0028.

The new shape adds `hazard_type hazard_type` and `severity smallint` beside the
existing columns. Nothing else about the function changes — same barangay
scope, same ordering, same security mode.

- [ ] **Step 2: Apply and prove it**

```bash
npx supabase migration up --local
docker exec supabase_db_app psql -U postgres -d postgres -c "
  set role authenticated; select * from my_reports() limit 1;"
```

Calling it as `authenticated` is the point — a missing grant looks exactly like
a working function until somebody who is not superuser calls it.

- [ ] **Step 3: Branch the client.** In `src/app/ako/page.tsx`, `MyReport`
gains `hazard_type: HazardType` and `severity: Severity`, and `depth` becomes
`DepthLevel | null`. Flood renders exactly as it does today — same swatch,
same `depthName`. Every other hazard renders `HazardIcon` plus
`hazardName` and `severityWord`, with the swatch colour from `SEVERITY_VAR`.
Follow the branching shape `src/components/ReportDetail.tsx` already uses so
the two screens agree.

- [ ] **Step 4: Test it.** Extend `tests/integration/hazards.test.ts` with a
case asserting `my_reports()` returns the hazard and severity for a non-flood
report owned by the caller.

- [ ] **Step 5: Look at it.** Open `/ako` in both languages with a flood and a
fire filed by the same account. The fire must show its hazard and severity
word, no depth, and a coloured swatch.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0029_my_reports_hazard.sql src/app/ako/page.tsx tests/
git commit -m "fix: /ako shows a fire as a fire"
```

---

## Definition of done for Plan A

- `npm test` green, `npx tsc --noEmit` clean, `npm run build` succeeds
- The report flow works end to end for flood and for at least one other
  hazard, in both languages, **driven in a real browser**
- A medical or accident report is absent from the public map for an anonymous
  visitor, confirmed against the database
- The console shows a fire as a fire
- Migration 0028 applied to the target **before** the code is deployed, and
  `public/sw.js` `VERSION` bumped so the new build reaches people on their
  next load rather than the one after
- The paper's §2.2 feature list and the new "Antas means level" paragraph
  updated in `docs/paper/build-docx.mjs` and the `.docx` rebuilt

## What Plan A deliberately leaves undone

The master admin role, `triage_state`, the board, assignment-based access,
the responder roster, the SOS hazard chips, and the graph. Those are Plans B
and C. Nothing in Plan A depends on them; the app is complete and deployable
when Plan A lands, and it satisfies the fifth recommendation on its own.
