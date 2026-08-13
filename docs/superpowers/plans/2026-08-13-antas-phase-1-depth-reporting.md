# Antas Phase 1 — Depth Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working, deployable PWA where a signed-in user reports flood depth on a body-height scale and anyone can view those reports on a public map, including the historical "has this street ever flooded?" lookup.

**Architecture:** Next.js App Router front-end talking to Supabase (PostgreSQL + PostGIS) for storage and auth. All domain logic that carries risk — the depth scale and report validation — lives in pure, I/O-free modules under `src/lib` so it is unit-testable without a database. Spatial questions ("what was reported near this point?") are answered by an indexed PostGIS function rather than application code. Row-level security is written and tested in this phase, before there is any sensitive data to protect.

**Tech Stack:** Next.js (App Router) + TypeScript, Supabase (PostgreSQL 15 + PostGIS), MapLibre GL, Vitest + @testing-library/react, Playwright, Vercel.

**Source spec:** `docs/superpowers/specs/2026-08-13-antas-design.md`

**Out of scope for this phase** (Phases 2 and 3): SOS signals, trust/plausibility scoring, moderator console, audit log, reputation, offline queueing, and photo upload on depth reports. The `photo_path` column is created in Phase 1 so the schema is stable, but the upload interface arrives with the SOS camera work in Phase 2, where photo capture is mandatory rather than optional.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/depth/scale.ts` | The depth scale: levels, ordering, cm ranges, Filipino and English labels. Pure, zero I/O |
| `src/lib/reports/validate.ts` | Validation of an incoming report: bounds, depth level, GPS accuracy. Pure, zero I/O |
| `src/lib/reports/row.ts` | Converts validated input into a PostGIS-shaped database row. Pure, zero I/O |
| `src/lib/supabase/client.ts` | Browser Supabase client |
| `src/lib/supabase/server.ts` | Server-side Supabase client (cookie-aware) |
| `supabase/migrations/0001_init.sql` | Extensions, enum, `profiles`, `depth_reports`, indexes |
| `supabase/migrations/0002_rls.sql` | Row-level security policies |
| `supabase/migrations/0003_reports_near.sql` | `reports_near()` PostGIS lookup function |
| `src/app/page.tsx` | Public map page |
| `src/app/report/page.tsx` | Report submission page |
| `src/app/login/page.tsx` | Email OTP sign-in |
| `src/app/actions/submit-report.ts` | Server action: validate then insert a depth report |
| `src/components/DepthSlider.tsx` | The body-height scale control |
| `src/components/FloodMap.tsx` | MapLibre map rendering reports |
| `src/components/StreetHistory.tsx` | "Has this street ever flooded?" panel |
| `scripts/seed.ts` | Seeds the typhoon demo scenario |
| `public/manifest.json` | PWA manifest |

Files are split by responsibility, not by technical layer: everything about the depth scale lives in one file, so changing the scale means touching one place.

---

## Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `vitest.setup.ts`

- [ ] **Step 1: Verify prerequisites**

Run:
```bash
node --version
docker --version
```
Expected: Node 20 or higher, and Docker responding with a version.

If Docker is missing, install Docker Desktop before continuing — the local Supabase stack requires it. If Docker cannot be installed on this machine, create a free hosted project at supabase.com instead and use its connection details wherever this plan says "local Supabase."

- [ ] **Step 2: Create the Next.js app in place**

Run from `C:\xampp\htdocs\app`:
```bash
npx create-next-app@latest . --typescript --app --eslint --no-tailwind --src-dir --import-alias "@/*" --use-npm
```
Expected: files created. Answer "yes" if it asks to proceed in a non-empty directory — the `docs/` folder is already there.

- [ ] **Step 3: Install test and runtime dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr maplibre-gl
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @playwright/test tsx
```

- [ ] **Step 4: Configure Vitest**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

Create `vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

Add to the `scripts` block in `package.json`:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test"
```

- [ ] **Step 5: Verify the toolchain runs**

Run: `npm run test`
Expected: "No test files found" — this confirms Vitest is wired up before any test exists.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "chore: scaffold Next.js app with Vitest and Playwright"
```

---

## Task 2: Depth scale module

The depth scale is the product. It gets built first, in isolation, with no database.

**Files:**
- Create: `src/lib/depth/scale.ts`
- Test: `src/lib/depth/scale.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/depth/scale.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  DEPTH_LEVELS,
  depthRank,
  isDeeperThan,
  depthRangeCm,
  depthLabel,
  isDepthLevel,
} from "./scale";

describe("depth scale", () => {
  it("orders levels from shallowest to deepest", () => {
    expect(DEPTH_LEVELS).toEqual([
      "ankle",
      "knee",
      "waist",
      "chest",
      "above_head",
    ]);
  });

  it("ranks deeper levels higher", () => {
    expect(depthRank("ankle")).toBe(0);
    expect(depthRank("above_head")).toBe(4);
  });

  it("compares two levels", () => {
    expect(isDeeperThan("chest", "knee")).toBe(true);
    expect(isDeeperThan("knee", "chest")).toBe(false);
    expect(isDeeperThan("knee", "knee")).toBe(false);
  });

  it("gives an approximate centimeter range for each level", () => {
    expect(depthRangeCm("ankle")).toEqual({ minCm: 0, maxCm: 15 });
    expect(depthRangeCm("waist")).toEqual({ minCm: 51, maxCm: 100 });
  });

  it("has no upper bound for above_head", () => {
    expect(depthRangeCm("above_head")).toEqual({ minCm: 141, maxCm: null });
  });

  it("provides Filipino and English labels", () => {
    expect(depthLabel("knee")).toEqual({
      tl: "Hanggang tuhod",
      en: "Knee-deep",
    });
  });

  it("recognises valid level strings", () => {
    expect(isDepthLevel("waist")).toBe(true);
    expect(isDepthLevel("shoulder")).toBe(false);
    expect(isDepthLevel("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/depth/scale.test.ts`
Expected: FAIL — "Failed to resolve import ./scale".

- [ ] **Step 3: Write the implementation**

Create `src/lib/depth/scale.ts`:
```ts
export const DEPTH_LEVELS = [
  "ankle",
  "knee",
  "waist",
  "chest",
  "above_head",
] as const;

export type DepthLevel = (typeof DEPTH_LEVELS)[number];

export interface DepthRange {
  minCm: number;
  maxCm: number | null;
}

const RANGES: Record<DepthLevel, DepthRange> = {
  ankle: { minCm: 0, maxCm: 15 },
  knee: { minCm: 16, maxCm: 50 },
  waist: { minCm: 51, maxCm: 100 },
  chest: { minCm: 101, maxCm: 140 },
  above_head: { minCm: 141, maxCm: null },
};

const LABELS: Record<DepthLevel, { tl: string; en: string }> = {
  ankle: { tl: "Hanggang bukong-bukong", en: "Ankle-deep" },
  knee: { tl: "Hanggang tuhod", en: "Knee-deep" },
  waist: { tl: "Hanggang baywang", en: "Waist-deep" },
  chest: { tl: "Hanggang dibdib", en: "Chest-deep" },
  above_head: { tl: "Lampas ulo", en: "Above the head" },
};

export function isDepthLevel(value: string): value is DepthLevel {
  return (DEPTH_LEVELS as readonly string[]).includes(value);
}

export function depthRank(level: DepthLevel): number {
  return DEPTH_LEVELS.indexOf(level);
}

export function isDeeperThan(a: DepthLevel, b: DepthLevel): boolean {
  return depthRank(a) > depthRank(b);
}

export function depthRangeCm(level: DepthLevel): DepthRange {
  return RANGES[level];
}

export function depthLabel(level: DepthLevel): { tl: string; en: string } {
  return LABELS[level];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/depth/scale.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/depth
git commit -m "feat: add depth scale domain module"
```

---

## Task 3: Report validation module

**Files:**
- Create: `src/lib/reports/validate.ts`
- Test: `src/lib/reports/validate.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/reports/validate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateReport, MARIKINA_BOUNDS } from "./validate";

const valid = {
  depth: "knee",
  lat: 14.65,
  lon: 121.1,
  gpsAccuracyM: 12,
};

describe("validateReport", () => {
  it("accepts a well-formed report", () => {
    const result = validateReport(valid);
    expect(result.ok).toBe(true);
  });

  it("rejects an unknown depth level", () => {
    const result = validateReport({ ...valid, depth: "shoulder" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("invalid_depth");
  });

  it("rejects coordinates outside the pilot area", () => {
    const result = validateReport({ ...valid, lat: 10.3, lon: 123.9 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("outside_pilot_area");
  });

  it("rejects a non-finite coordinate", () => {
    const result = validateReport({ ...valid, lat: Number.NaN });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("invalid_coordinates");
  });

  it("accepts a report with unknown GPS accuracy", () => {
    const result = validateReport({ ...valid, gpsAccuracyM: null });
    expect(result.ok).toBe(true);
  });

  it("flags poor GPS accuracy without rejecting the report", () => {
    const result = validateReport({ ...valid, gpsAccuracyM: 250 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings).toContain("low_gps_accuracy");
  });

  it("reports every problem at once rather than the first", () => {
    const result = validateReport({
      depth: "shoulder",
      lat: 10.3,
      lon: 123.9,
      gpsAccuracyM: 12,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toHaveLength(2);
  });

  it("exposes the pilot area bounds", () => {
    expect(MARIKINA_BOUNDS.minLat).toBeLessThan(MARIKINA_BOUNDS.maxLat);
    expect(MARIKINA_BOUNDS.minLon).toBeLessThan(MARIKINA_BOUNDS.maxLon);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/reports/validate.test.ts`
Expected: FAIL — "Failed to resolve import ./validate".

- [ ] **Step 3: Write the implementation**

Create `src/lib/reports/validate.ts`:
```ts
import { isDepthLevel, type DepthLevel } from "@/lib/depth/scale";

export const MARIKINA_BOUNDS = Object.freeze({
  minLat: 14.6,
  maxLat: 14.72,
  minLon: 121.05,
  maxLon: 121.15,
} as const);

/** GPS readings worse than this are accepted but flagged. */
export const LOW_GPS_ACCURACY_M = 100;

/** These codes are a contract: the server action and the report page both map them. */
export type ReportErrorCode =
  | "invalid_depth"
  | "invalid_coordinates"
  | "outside_pilot_area";

export type ReportWarningCode = "low_gps_accuracy";

export interface ReportInput {
  depth: string;
  lat: number;
  lon: number;
  gpsAccuracyM: number | null;
}

export type ValidationResult =
  | { ok: true; depth: DepthLevel; warnings: ReportWarningCode[] }
  | { ok: false; errors: ReportErrorCode[] };

export function validateReport(input: ReportInput): ValidationResult {
  const errors: ReportErrorCode[] = [];
  const warnings: ReportWarningCode[] = [];

  if (!isDepthLevel(input.depth)) {
    errors.push("invalid_depth");
  }

  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lon)) {
    errors.push("invalid_coordinates");
  } else if (
    input.lat < MARIKINA_BOUNDS.minLat ||
    input.lat > MARIKINA_BOUNDS.maxLat ||
    input.lon < MARIKINA_BOUNDS.minLon ||
    input.lon > MARIKINA_BOUNDS.maxLon
  ) {
    errors.push("outside_pilot_area");
  }

  if (input.gpsAccuracyM !== null && input.gpsAccuracyM > LOW_GPS_ACCURACY_M) {
    warnings.push("low_gps_accuracy");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, depth: input.depth as DepthLevel, warnings };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/reports/validate.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports
git commit -m "feat: add report validation module"
```

---

## Task 4: Database schema

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `.env.local`

- [ ] **Step 1: Initialise and start local Supabase**

```bash
npx supabase init
npx supabase start
```
Expected: a table of local service URLs and keys. Copy the `API URL`, `anon key`, and `service_role key`.

- [ ] **Step 2: Record the environment variables**

Create `.env.local`, filling in the values printed by the previous step:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start>
```

Confirm `.env.local` is listed in `.gitignore` — `create-next-app` adds `.env*` by default. If it is not, add it now. **The service role key must never be committed.**

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0001_init.sql`:
```sql
create extension if not exists postgis;

create type depth_level as enum ('ankle', 'knee', 'waist', 'chest', 'above_head');

create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text        not null,
  barangay     text,
  suspended_at timestamptz,
  created_at   timestamptz not null default now()
);

create table depth_reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid                   not null references profiles (id) on delete cascade,
  location       geography(Point, 4326) not null,
  depth          depth_level            not null,
  photo_path     text,
  gps_accuracy_m double precision,
  reported_at    timestamptz            not null default now(),
  source         text                   not null default 'user'
                   check (source in ('user', 'seed')),
  status         text                   not null default 'active'
                   check (status in ('active', 'flagged', 'hidden'))
);

create index depth_reports_location_idx    on depth_reports using gist (location);
create index depth_reports_reported_at_idx on depth_reports (reported_at desc);

-- Create a profile automatically whenever an auth user is created.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'Anonymous'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

- [ ] **Step 4: Apply and verify the migration**

```bash
npx supabase migration up
npx supabase db diff
```
Expected: `migration up` succeeds; `db diff` reports no schema differences, confirming the migration matches the running database.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat: add profiles and depth_reports schema with PostGIS"
```

---

## Task 5: Row-level security

Privacy claims need tests, not comments. This task writes the policies and proves they hold.

**Files:**
- Create: `tests/integration/rls.test.ts`, `supabase/migrations/0002_rls.sql`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/rls.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, serviceKey);
const anon = createClient(url, anonKey);

let reporterId: string;

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `reporter-${Date.now()}@example.test`,
    password: "test-password-123",
    email_confirm: true,
  });
  if (error) throw error;
  reporterId = data.user!.id;

  const { error: insertError } = await admin.from("depth_reports").insert({
    reporter_id: reporterId,
    location: "SRID=4326;POINT(121.1 14.65)",
    depth: "knee",
    source: "seed",
  });
  if (insertError) throw insertError;
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
    const { data } = await anon.from("profiles").select("id, display_name");
    // Denied at the grant layer (data null) or filtered to nothing by RLS (data []).
    // Either way, an anonymous visitor must never see a profile row.
    expect(data ?? []).toEqual([]);
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
});
```

The last two tests need a second user and a signed-in client. In `beforeAll`, create a
second user the same way, keep its id as `otherUserId`, and build `authed` with
`createClient(url, anonKey)` followed by `signInWithPassword` using the first user's
credentials. These two invariants — that one user cannot read another's profile, and cannot
file a report in another's name — are the most important guarantees in the system, so they
are asserted rather than assumed.

Modify `vitest.config.ts` so tests see the environment variables and the integration folder. Add this import at the top:
```ts
import { loadEnv } from "vite";
```
and replace the `test` block with:
```ts
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
    env: loadEnv("", process.cwd(), ""),
  },
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/rls.test.ts`
Expected: FAIL — the anonymous insert succeeds and the anonymous profile read returns rows, because row-level security is not enabled yet.

- [ ] **Step 3: Write the policies**

Create `supabase/migrations/0002_rls.sql`:
```sql
-- GRANT and RLS are two independent layers. GRANT decides whether a role may
-- attempt an operation at all; RLS decides which rows it sees once allowed.
-- Tables created by the migration role on this stack carry no select/insert/
-- update/delete grants for anon, authenticated, or service_role, so without
-- these the policies below are unreachable and every write fails.
grant select                         on depth_reports to anon, authenticated;
grant insert                         on depth_reports to authenticated;
grant select, insert, update, delete on depth_reports to service_role;

-- Deliberately NOT granted to anon. profiles will hold verified phone numbers,
-- so anonymous access is denied at the grant layer as well as by RLS — two
-- independent barriers, so a future permissive policy cannot expose it alone.
grant select                         on profiles to authenticated;
grant update                         on profiles to authenticated;
grant select, insert, update, delete on profiles to service_role;

alter table profiles      enable row level security;
alter table depth_reports enable row level security;

-- Depth reports are public data: anyone may read active ones.
create policy "active depth reports are publicly readable"
  on depth_reports for select
  using (status = 'active');

-- Only a signed-in user may create a report, and only in their own name.
create policy "users insert their own depth reports"
  on depth_reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- A user may read and update only their own profile.
create policy "users read their own profile"
  on profiles for select
  to authenticated
  using (id = auth.uid());

create policy "users update their own profile"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
```

- [ ] **Step 4: Apply the migration and re-run the test**

```bash
npx supabase migration up
npx vitest run tests/integration/rls.test.ts
```
Expected: PASS — 6 tests.

If you have already applied `0002_rls.sql` and then edit it, `migration up` will not re-run
it. Use `npx supabase db reset` to rebuild from scratch — there is no data worth keeping in
Phase 1, and it also proves both migrations replay cleanly from zero.

- [ ] **Step 5: Commit**

```bash
git add supabase tests vitest.config.ts
git commit -m "feat: add row-level security policies with integration tests"
```

---

## Task 6: Supabase clients and authentication

Phase 1 uses **email OTP**. The spec calls for phone OTP as the identity-friction layer, but phone delivery belongs with the SOS flow in Phase 2, and spec section 12 already records email OTP as the documented fallback. Nothing else in the design depends on which channel delivers the code.

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/app/login/page.tsx`, `src/app/auth/confirm/route.ts`

- [ ] **Step 1: Write the browser client**

Create `src/lib/supabase/client.ts`:
```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 2: Write the server client**

Create `src/lib/supabase/server.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component; session refresh happens elsewhere.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 3: Write the login page**

Create `src/app/login/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/confirm` },
    });

    if (signInError) {
      setError("Hindi naipadala ang link. Subukan ulit.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return <p>Check your email for the sign-in link.</p>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button type="submit">Send sign-in link</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Write the confirmation route**

Create `src/app/auth/confirm/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login`);
  }
  return NextResponse.redirect(`${origin}/report`);
}
```

- [ ] **Step 5: Verify sign-in works end to end**

```bash
npm run dev
```
Open `http://localhost:3000/login`, submit any email address, then open the local mail catcher at `http://127.0.0.1:54324` and click the link in the captured message.
Expected: redirected to `/report`. Then run `npx supabase db shell` and `select id, display_name from profiles;` — one new row confirms the `handle_new_user` trigger fired.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase src/app/login src/app/auth
git commit -m "feat: add Supabase clients and email OTP sign-in"
```

---

## Task 7: Submit a depth report

**Files:**
- Create: `src/lib/reports/row.ts`, `src/app/actions/submit-report.ts`
- Test: `src/lib/reports/row.test.ts`

A Next.js file marked `"use server"` may only export async functions. `buildReportRow` is
synchronous and needs to be unit-testable without invoking a server action, so it lives in
`src/lib/reports/row.ts` and the action imports it. Putting it in the action file would fail
the build.

- [ ] **Step 1: Write the failing test**

Create `src/lib/reports/row.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildReportRow } from "./row";

describe("buildReportRow", () => {
  it("converts validated input into a PostGIS row", () => {
    const row = buildReportRow("user-123", {
      depth: "waist",
      lat: 14.65,
      lon: 121.1,
      gpsAccuracyM: 9,
    });

    expect(row).toEqual({
      reporter_id: "user-123",
      location: "SRID=4326;POINT(121.1 14.65)",
      depth: "waist",
      gps_accuracy_m: 9,
      source: "user",
    });
  });

  it("puts longitude before latitude in the point literal", () => {
    const row = buildReportRow("user-123", {
      depth: "knee",
      lat: 14.7,
      lon: 121.06,
      gpsAccuracyM: null,
    });

    expect(row.location).toBe("SRID=4326;POINT(121.06 14.7)");
  });
});
```

The longitude-before-latitude test exists because reversing the two is the most common PostGIS mistake, and it fails silently by placing every report in the wrong part of the world.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/reports/row.test.ts`
Expected: FAIL — "Failed to resolve import ./row".

- [ ] **Step 3: Write the row builder**

Create `src/lib/reports/row.ts`:
```ts
import type { ReportInput } from "@/lib/reports/validate";
import type { DepthLevel } from "@/lib/depth/scale";

export interface ReportRow {
  reporter_id: string;
  location: string;
  depth: DepthLevel;
  gps_accuracy_m: number | null;
  source: "user";
}

export function buildReportRow(
  reporterId: string,
  input: ReportInput,
): ReportRow {
  return {
    reporter_id: reporterId,
    location: `SRID=4326;POINT(${input.lon} ${input.lat})`,
    depth: input.depth as DepthLevel,
    gps_accuracy_m: input.gpsAccuracyM,
    source: "user",
  };
}
```

- [ ] **Step 4: Write the server action**

Create `src/app/actions/submit-report.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  validateReport,
  type ReportInput,
  type ReportErrorCode,
  type ReportWarningCode,
} from "@/lib/reports/validate";
import { buildReportRow } from "@/lib/reports/row";

/** Validation codes plus the two failures only the action can detect. */
export type SubmitErrorCode =
  | ReportErrorCode
  | "not_signed_in"
  | "insert_failed";

export type SubmitResult =
  | { ok: true; warnings: ReportWarningCode[] }
  | { ok: false; errors: SubmitErrorCode[] };

export async function submitReport(input: ReportInput): Promise<SubmitResult> {
  const validation = validateReport(input);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, errors: ["not_signed_in"] };
  }

  const { error } = await supabase
    .from("depth_reports")
    .insert(buildReportRow(userData.user.id, input));

  if (error) {
    return { ok: false, errors: ["insert_failed"] };
  }

  revalidatePath("/");
  return { ok: true, warnings: validation.warnings };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/reports/row.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/actions src/lib/reports
git commit -m "feat: add depth report submission action"
```

---

## Task 8: Depth slider component

**Files:**
- Create: `src/components/DepthSlider.tsx`
- Test: `src/components/DepthSlider.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/DepthSlider.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DepthSlider } from "./DepthSlider";

describe("DepthSlider", () => {
  it("shows the Filipino label for the selected level", () => {
    render(<DepthSlider value="knee" onChange={() => {}} />);
    expect(screen.getByText("Hanggang tuhod")).toBeInTheDocument();
  });

  it("shows the English label alongside it", () => {
    render(<DepthSlider value="knee" onChange={() => {}} />);
    expect(screen.getByText("Knee-deep")).toBeInTheDocument();
  });

  it("reports the new level when the slider moves", async () => {
    const onChange = vi.fn();
    render(<DepthSlider value="ankle" onChange={onChange} />);

    const slider = screen.getByRole("slider");
    await userEvent.click(slider);
    await userEvent.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenCalledWith("knee");
  });

  it("exposes the level name to assistive technology", () => {
    render(<DepthSlider value="chest" onChange={() => {}} />);
    expect(screen.getByRole("slider")).toHaveAttribute(
      "aria-valuetext",
      "Hanggang dibdib",
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/DepthSlider.test.tsx`
Expected: FAIL — cannot resolve `./DepthSlider`.

- [ ] **Step 3: Write the component**

Create `src/components/DepthSlider.tsx`:
```tsx
"use client";

import {
  DEPTH_LEVELS,
  depthLabel,
  depthRank,
  type DepthLevel,
} from "@/lib/depth/scale";

interface DepthSliderProps {
  value: DepthLevel;
  onChange: (level: DepthLevel) => void;
}

export function DepthSlider({ value, onChange }: DepthSliderProps) {
  const label = depthLabel(value);

  return (
    <div>
      <input
        type="range"
        min={0}
        max={DEPTH_LEVELS.length - 1}
        step={1}
        value={depthRank(value)}
        aria-label="Gaano kalalim ang tubig?"
        aria-valuetext={label.tl}
        onChange={(e) => onChange(DEPTH_LEVELS[Number(e.target.value)])}
      />
      <p>{label.tl}</p>
      <p>{label.en}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/DepthSlider.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/DepthSlider.tsx src/components/DepthSlider.test.tsx
git commit -m "feat: add body-height depth slider"
```

---

## Task 9: Report page

**Files:**
- Create: `src/app/report/page.tsx`

- [ ] **Step 1: Write the page**

Create `src/app/report/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { DepthSlider } from "@/components/DepthSlider";
import { submitReport, type SubmitErrorCode } from "@/app/actions/submit-report";
import type { DepthLevel } from "@/lib/depth/scale";

/** Everything the page can display, including the one failure it detects itself. */
type PageErrorCode = SubmitErrorCode | "no_location";

const ERROR_MESSAGES: Record<PageErrorCode, string> = {
  invalid_depth: "Pumili ng lalim ng tubig.",
  invalid_coordinates: "Hindi mabasa ang lokasyon mo.",
  outside_pilot_area: "Sa ngayon, Marikina lang ang saklaw ng Antas.",
  not_signed_in: "Mag-sign in muna bago mag-report.",
  insert_failed: "May problema sa pag-save. Subukan ulit.",
  no_location: "Buksan ang location para makapag-report.",
};

export default function ReportPage() {
  const [depth, setDepth] = useState<DepthLevel>("knee");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [errors, setErrors] = useState<PageErrorCode[]>([]);

  async function handleSubmit() {
    setStatus("sending");
    setErrors([]);

    const position = await new Promise<GeolocationPosition | null>((resolve) =>
      navigator.geolocation.getCurrentPosition(
        resolve,
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10_000 },
      ),
    );

    if (!position) {
      setErrors(["no_location"]);
      setStatus("idle");
      return;
    }

    const result = await submitReport({
      depth,
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      gpsAccuracyM: position.coords.accuracy ?? null,
    });

    if (!result.ok) {
      setErrors(result.errors);
      setStatus("idle");
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return <p>Salamat. Naitala na ang report mo.</p>;
  }

  return (
    <main>
      <h1>Gaano kalalim ang tubig?</h1>
      <DepthSlider value={depth} onChange={setDepth} />
      <button onClick={handleSubmit} disabled={status === "sending"}>
        {status === "sending" ? "Ipinapadala..." : "I-report"}
      </button>
      {errors.map((code) => (
        <p key={code} role="alert">
          {ERROR_MESSAGES[code]}
        </p>
      ))}
    </main>
  );
}
```

- [ ] **Step 2: Verify manually**

Run `npm run dev`, sign in, open `http://localhost:3000/report`, allow location, and submit.
Expected: "Salamat. Naitala na ang report mo." If your real location is outside Marikina you will correctly see the `outside_pilot_area` message — use the browser devtools Sensors panel to override location to lat `14.65`, lon `121.10`.

- [ ] **Step 3: Commit**

```bash
git add src/app/report
git commit -m "feat: add depth report submission page"
```

---

## Task 10: Street history lookup

**Files:**
- Create: `tests/integration/reports-near.test.ts`, `supabase/migrations/0003_reports_near.sql`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/reports-near.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `near-${Date.now()}@example.test`,
    password: "test-password-123",
    email_confirm: true,
  });
  if (error) throw error;
  const reporterId = data.user!.id;

  await admin.from("depth_reports").insert([
    {
      reporter_id: reporterId,
      location: "SRID=4326;POINT(121.1 14.65)",
      depth: "chest",
      source: "seed",
    },
    {
      reporter_id: reporterId,
      // Roughly 5 km away — well outside any street-level radius.
      location: "SRID=4326;POINT(121.145 14.69)",
      depth: "ankle",
      source: "seed",
    },
  ]);
});

describe("reports_near", () => {
  it("returns reports inside the radius", async () => {
    const { data, error } = await admin.rpc("reports_near", {
      lat: 14.65,
      lon: 121.1,
      radius_m: 300,
    });

    expect(error).toBeNull();
    expect(data!.some((r: { depth: string }) => r.depth === "chest")).toBe(true);
  });

  it("excludes reports outside the radius", async () => {
    const { data } = await admin.rpc("reports_near", {
      lat: 14.65,
      lon: 121.1,
      radius_m: 300,
    });

    expect(data!.some((r: { depth: string }) => r.depth === "ankle")).toBe(false);
  });

  it("orders results by distance", async () => {
    const { data } = await admin.rpc("reports_near", {
      lat: 14.65,
      lon: 121.1,
      radius_m: 10000,
    });

    const distances = data!.map((r: { distance_m: number }) => r.distance_m);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it("returns plain latitude and longitude columns", async () => {
    const { data } = await admin.rpc("reports_near", {
      lat: 14.65,
      lon: 121.1,
      radius_m: 300,
    });

    const nearest = data![0] as { lat: number; lon: number };
    expect(nearest.lat).toBeCloseTo(14.65, 4);
    expect(nearest.lon).toBeCloseTo(121.1, 4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/reports-near.test.ts`
Expected: FAIL — Postgres reports that function `reports_near` does not exist.

- [ ] **Step 3: Write the function**

Create `supabase/migrations/0003_reports_near.sql`:
```sql
create or replace function reports_near(
  lat      double precision,
  lon      double precision,
  radius_m double precision
)
returns table (
  id          uuid,
  depth       depth_level,
  reported_at timestamptz,
  lat         double precision,
  lon         double precision,
  distance_m  double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    r.id,
    r.depth,
    r.reported_at,
    st_y(r.location::geometry) as lat,
    st_x(r.location::geometry) as lon,
    st_distance(r.location, st_point(lon, lat)::geography) as distance_m
  from depth_reports r
  where r.status = 'active'
    and st_dwithin(r.location, st_point(lon, lat)::geography, radius_m)
  order by distance_m;
$$;
```

Two decisions here:

`security invoker` means the function respects the caller's row-level security instead of
bypassing it.

Returning `lat` and `lon` as plain numbers means the browser never has to decode a PostGIS
geography value. Selecting a `geography` column directly through PostgREST returns a WKB hex
string, not coordinates — so every map read in this plan goes through this function.

- [ ] **Step 4: Apply the migration and re-run the test**

```bash
npx supabase migration up
npx vitest run tests/integration/reports-near.test.ts
```
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase tests/integration/reports-near.test.ts
git commit -m "feat: add reports_near spatial lookup function"
```

---

## Task 11: Public map

**Files:**
- Create: `src/components/FloodMap.tsx`, `src/components/StreetHistory.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write the map component**

Create `src/components/FloodMap.tsx`:
```tsx
"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { depthRank, type DepthLevel } from "@/lib/depth/scale";

export interface MapReport {
  id: string;
  lat: number;
  lon: number;
  depth: DepthLevel;
}

/** Shallow to deep. Index matches depthRank(). */
const DEPTH_COLORS = ["#7dd3fc", "#38bdf8", "#0284c7", "#1e40af", "#581c87"];

interface FloodMapProps {
  reports: MapReport[];
  onPick: (lat: number, lon: number) => void;
}

export function FloodMap({ reports, onPick }: FloodMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!container.current || map.current) return;

    map.current = new maplibregl.Map({
      container: container.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [121.1, 14.65],
      zoom: 13,
    });

    map.current.on("click", (e) => onPick(e.lngLat.lat, e.lngLat.lng));
  }, [onPick]);

  useEffect(() => {
    if (!map.current) return;

    const markers = reports.map((report) =>
      new maplibregl.Marker({ color: DEPTH_COLORS[depthRank(report.depth)] })
        .setLngLat([report.lon, report.lat])
        .addTo(map.current!),
    );

    return () => markers.forEach((marker) => marker.remove());
  }, [reports]);

  return <div ref={container} style={{ height: "70vh", width: "100%" }} />;
}
```

- [ ] **Step 2: Write the street history panel**

Create `src/components/StreetHistory.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { depthLabel, depthRank, type DepthLevel } from "@/lib/depth/scale";

interface NearbyReport {
  id: string;
  depth: DepthLevel;
  reported_at: string;
  lat: number;
  lon: number;
  distance_m: number;
}

interface StreetHistoryProps {
  point: { lat: number; lon: number } | null;
}

const STREET_RADIUS_M = 150;

export function StreetHistory({ point }: StreetHistoryProps) {
  const [reports, setReports] = useState<NearbyReport[] | null>(null);

  useEffect(() => {
    if (!point) {
      setReports(null);
      return;
    }

    createClient()
      .rpc("reports_near", {
        lat: point.lat,
        lon: point.lon,
        radius_m: STREET_RADIUS_M,
      })
      .then(({ data }) => setReports((data as NearbyReport[]) ?? []));
  }, [point]);

  if (!point) return <p>Pindutin ang mapa para makita ang kasaysayan.</p>;
  if (reports === null) return <p>Naghahanap...</p>;
  if (reports.length === 0) {
    return <p>Walang naitalang baha sa lugar na ito.</p>;
  }

  const deepest = reports.reduce((worst, report) =>
    depthRank(report.depth) > depthRank(worst.depth) ? report : worst,
  );

  return (
    <section>
      <h2>{reports.length} report sa lugar na ito</h2>
      <p>Pinakamalalim: {depthLabel(deepest.depth).tl}</p>
      <ul>
        {reports.map((report) => (
          <li key={report.id}>
            {depthLabel(report.depth).tl} —{" "}
            {new Date(report.reported_at).toLocaleDateString("en-PH")}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Wire up the home page**

Replace the contents of `src/app/page.tsx` with:
```tsx
"use client";

import { useEffect, useState } from "react";
import { FloodMap, type MapReport } from "@/components/FloodMap";
import { StreetHistory } from "@/components/StreetHistory";
import { createClient } from "@/lib/supabase/client";
import type { DepthLevel } from "@/lib/depth/scale";

/** Wide enough to cover the whole pilot area from its centre. */
const CITY_CENTRE = { lat: 14.65, lon: 121.1 };
const CITY_RADIUS_M = 10_000;

interface NearbyRow {
  id: string;
  depth: DepthLevel;
  lat: number;
  lon: number;
}

export default function HomePage() {
  const [reports, setReports] = useState<MapReport[]>([]);
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    createClient()
      .rpc("reports_near", {
        lat: CITY_CENTRE.lat,
        lon: CITY_CENTRE.lon,
        radius_m: CITY_RADIUS_M,
      })
      .then(({ data }) => {
        const rows = (data ?? []) as NearbyRow[];
        setReports(
          rows.map((row) => ({
            id: row.id,
            depth: row.depth,
            lat: row.lat,
            lon: row.lon,
          })),
        );
      });
  }, []);

  return (
    <main>
      <h1>Antas</h1>
      <FloodMap reports={reports} onPick={(lat, lon) => setPoint({ lat, lon })} />
      <StreetHistory point={point} />
    </main>
  );
}
```

- [ ] **Step 4: Verify manually**

Run `npm run dev` and open `http://localhost:3000`.
Expected: the map renders centred on Marikina, and clicking anywhere replaces the "Pindutin ang mapa" prompt with a result. The result will read "Walang naitalang baha" until Task 12 seeds data.

- [ ] **Step 5: Commit**

```bash
git add src/components/FloodMap.tsx src/components/StreetHistory.tsx src/app/page.tsx
git commit -m "feat: add public flood map with street history lookup"
```

---

## Task 12: Seed the typhoon scenario

**Files:**
- Create: `scripts/seed.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the seed script**

Create `scripts/seed.ts`:
```ts
import { createClient } from "@supabase/supabase-js";
import { DEPTH_LEVELS } from "../src/lib/depth/scale";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** Low-lying areas flood deeper; these anchor points shape the scenario. */
const HOTSPOTS = [
  { lat: 14.6507, lon: 121.1029, severity: 4 },
  { lat: 14.6412, lon: 121.0968, severity: 3 },
  { lat: 14.6688, lon: 121.1104, severity: 2 },
  { lat: 14.6301, lon: 121.0885, severity: 1 },
];

const REPORTS_PER_HOTSPOT = 25;
const SCATTER_DEGREES = 0.004;
const MAX_HOURS_AGO = 72;

async function main() {
  const { data, error } = await admin.auth.admin.createUser({
    email: `seed-${Date.now()}@example.test`,
    password: "seed-password-123",
    email_confirm: true,
  });
  if (error) throw error;
  const reporterId = data.user!.id;

  const rows = HOTSPOTS.flatMap((hotspot) =>
    Array.from({ length: REPORTS_PER_HOTSPOT }, () => {
      const jitter = () => (Math.random() - 0.5) * SCATTER_DEGREES;
      const level = Math.max(
        0,
        Math.min(
          DEPTH_LEVELS.length - 1,
          hotspot.severity + Math.round((Math.random() - 0.5) * 2),
        ),
      );
      const hoursAgo = Math.floor(Math.random() * MAX_HOURS_AGO);

      return {
        reporter_id: reporterId,
        location: `SRID=4326;POINT(${hotspot.lon + jitter()} ${hotspot.lat + jitter()})`,
        depth: DEPTH_LEVELS[level],
        source: "seed" as const,
        reported_at: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
      };
    }),
  );

  const { error: insertError } = await admin.from("depth_reports").insert(rows);
  if (insertError) throw insertError;

  console.log(`Seeded ${rows.length} depth reports.`);
}

main();
```

- [ ] **Step 2: Add the script command**

Add to the `scripts` block in `package.json`:
```json
"seed": "tsx --env-file=.env.local scripts/seed.ts"
```

- [ ] **Step 3: Run the seed**

Run: `npm run seed`
Expected: `Seeded 100 depth reports.`

- [ ] **Step 4: Verify on the map**

Run `npm run dev` and open `http://localhost:3000`.
Expected: roughly 100 coloured markers clustered around four hotspots. Clicking near a hotspot shows a populated history panel including a "Pinakamalalim:" line.

- [ ] **Step 5: Commit**

```bash
git add scripts package.json
git commit -m "feat: add typhoon scenario seed script"
```

---

## Task 13: End-to-end tests and PWA manifest

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/map.spec.ts`, `public/manifest.json`, `public/icon-192.png`, `public/icon-512.png`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Configure Playwright**

Create `playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
});
```

- [ ] **Step 2: Write the end-to-end tests**

Create `tests/e2e/map.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("public map loads without signing in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Antas" })).toBeVisible();
});

test("clicking the map shows street history", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText("Pindutin ang mapa para makita ang kasaysayan."),
  ).toBeVisible();

  await page.locator("canvas").click({ position: { x: 300, y: 200 } });

  await expect(
    page.getByText("Pindutin ang mapa para makita ang kasaysayan."),
  ).toBeHidden();
});

test("sign-in page asks for an email address", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
});
```

- [ ] **Step 3: Run them**

```bash
npx playwright install chromium
npm run test:e2e
```
Expected: 3 tests PASS.

- [ ] **Step 4: Add the PWA manifest**

Create `public/manifest.json`:
```json
{
  "name": "Antas",
  "short_name": "Antas",
  "description": "Antas ng tubig - crowdsourced flood depth reporting for Marikina.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#0284c7",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Create `public/icon-192.png` and `public/icon-512.png` — solid `#0284c7` squares with a white "A" are sufficient for this phase.

Replace the `metadata` export in `src/app/layout.tsx` with:
```ts
export const metadata = {
  title: "Antas",
  description: "Antas ng tubig - crowdsourced flood depth reporting for Marikina.",
  manifest: "/manifest.json",
};
```

- [ ] **Step 5: Run the full suite**

```bash
npm run test
npm run test:e2e
```
Expected: all Vitest tests PASS (29 across unit and integration), all 3 Playwright tests PASS.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts tests/e2e public/manifest.json public/icon-192.png public/icon-512.png src/app/layout.tsx
git commit -m "feat: add PWA manifest and end-to-end tests"
```

---

## Task 14: Deploy

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create a hosted Supabase project**

At supabase.com, create a free project. In its SQL editor, run the contents of `supabase/migrations/0001_init.sql`, then `0002_rls.sql`, then `0003_reports_near.sql`, in that order.

- [ ] **Step 2: Write the README**

Create `README.md`:
```markdown
# Antas

Crowdsourced flood-depth reporting for Marikina City, recording water level the way
Filipinos describe it - *hanggang tuhod, hanggang baywang, hanggang dibdib* - rather than
in centimetres.

## Status

Phase 1: depth reporting and the public map. Distress signalling, trust scoring, and the
moderator console are designed but not yet built - see
`docs/superpowers/specs/2026-08-13-antas-design.md`.

**This application does not dispatch emergency responders.** It is a portfolio project
running on seeded demonstration data.

## Local development

    npm install
    npx supabase start
    npx supabase migration up
    npm run seed
    npm run dev

## Tests

    npm run test      # unit and integration
    npm run test:e2e  # Playwright

## Stack

Next.js (App Router), Supabase (PostgreSQL + PostGIS), MapLibre GL, Vitest, Playwright.
```

- [ ] **Step 3: Deploy to Vercel**

```bash
npx vercel
```
In the Vercel dashboard set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the hosted project's values. Do **not** set `SUPABASE_SERVICE_ROLE_KEY` in Vercel — only the local seed script needs it.

- [ ] **Step 4: Verify the deployment**

Open the Vercel URL.
Expected: the map loads. To populate it, temporarily point `.env.local` at the hosted project, run `npm run seed`, then restore the local values and reload the deployed page.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add README and deployment notes"
```

---

## Phase 1 completion criteria

- [ ] A signed-in user can submit a depth report from a phone
- [ ] Anyone can view reports on the public map without signing in
- [ ] Clicking any point shows what was previously reported nearby
- [ ] Row-level security is enforced and proven by passing tests
- [ ] The full test suite passes
- [ ] The app is deployed at a public URL and installable to a phone home screen

## Next phases

**Phase 2 — SOS and trust pipeline:** `sos_signals` and `env_snapshots` tables, live camera capture, hold-to-confirm, the Open-Meteo adapter behind a fakeable interface, and `lib/scoring` as pure functions covering the four test cases named in spec section 11.

**Phase 3 — Moderator console:** barangay-scoped queue, reason-sentence presentation, confirm/dismiss with reason codes, the append-only audit log, reputation feedback, and the simulation banner.
