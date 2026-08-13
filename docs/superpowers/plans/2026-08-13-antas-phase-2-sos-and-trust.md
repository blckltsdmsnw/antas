# Antas Phase 2A — SOS Signals and the Trust Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person in danger can send a distress signal that is expensive to fake, gets enriched with independent environmental data, and is scored into a human-readable explanation a moderator can act on.

**Architecture:** The scoring logic is a pure function — snapshot in, score and reason sentences out — with zero I/O, so the reasoning that carries the ethical weight is unit-testable without a database or a network. External weather and elevation sit behind an `EnvProvider` interface so tests inject a fake and a provider outage degrades toward caution rather than cascading. The one-active-signal rule is enforced by a partial unique index in Postgres, not by application code.

**Tech Stack:** Next.js 16, TypeScript, Supabase (PostgreSQL 17 + PostGIS + Storage), Open-Meteo, Vitest, Playwright.

**Source spec:** `docs/superpowers/specs/2026-08-13-antas-design.md` sections 5-7.

**Out of scope — Phase 2B:** the moderator console UI, confirm/dismiss actions, reputation write-back, suspension, the simulation banner in the console. This plan ends with signals scored and explained in the database, proven by tests.

---

## The governing principle

**The system never refuses an SOS.** If a fraud check can block submission, then the one time it is wrong, a person in danger is told their report looks suspicious. Scoring decides **order and prominence**, never admission. Every signal reaches a human.

This has three concrete consequences the implementer must not "optimise away":

1. `submitSos` returns success even when scoring cannot run.
2. A suspended account can still create a signal.
3. When environmental data is unavailable, the signal is scored **more** prominent, not less.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/sos/status.ts` | The status lifecycle and what "active" means. Pure, zero I/O |
| `src/lib/scoring/types.ts` | `ScoringSnapshot`, `Reason`, `ScoreResult` |
| `src/lib/scoring/score.ts` | Snapshot to score plus reason sentences. Pure, zero I/O |
| `src/lib/env/provider.ts` | `EnvProvider` interface and `EnvReading` |
| `src/lib/env/fake.ts` | Test double |
| `src/lib/env/open-meteo.ts` | Real adapter. Never throws - returns nulls on failure |
| `supabase/migrations/0005_sos.sql` | Tables, enums, indexes, one-active-signal constraint |
| `supabase/migrations/0006_sos_rls.sql` | Grants and policies |
| `supabase/migrations/0007_sos_functions.sql` | Corroboration count and public aggregate |
| `supabase/migrations/0008_sos_storage.sql` | Private photo bucket and its policies |
| `src/app/actions/submit-sos.ts` | Server action: create, enrich, score |
| `src/components/HoldToConfirm.tsx` | Three-second hold control |
| `src/components/LiveCamera.tsx` | `getUserMedia` capture; gallery disabled |
| `src/app/sos/page.tsx` | The distress flow |

---

## Task 1: The status lifecycle

**Files:**
- Create: `src/lib/sos/status.ts`
- Test: `src/lib/sos/status.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sos/status.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  SOS_STATUSES,
  ACTIVE_STATUSES,
  isActiveStatus,
  canTransition,
  isSosStatus,
} from "./status";

describe("sos status", () => {
  it("lists every status", () => {
    expect(SOS_STATUSES).toEqual([
      "pending",
      "under_review",
      "confirmed",
      "dismissed",
      "resolved",
    ]);
  });

  it("treats pending, under_review and confirmed as active", () => {
    expect(ACTIVE_STATUSES).toEqual(["pending", "under_review", "confirmed"]);
  });

  it("does not treat dismissed or resolved as active", () => {
    expect(isActiveStatus("dismissed")).toBe(false);
    expect(isActiveStatus("resolved")).toBe(false);
  });

  it("allows the normal review path", () => {
    expect(canTransition("pending", "under_review")).toBe(true);
    expect(canTransition("under_review", "confirmed")).toBe(true);
    expect(canTransition("under_review", "dismissed")).toBe(true);
  });

  it("only lets a confirmed signal resolve", () => {
    expect(canTransition("confirmed", "resolved")).toBe(true);
    expect(canTransition("pending", "resolved")).toBe(false);
  });

  it("treats dismissed as terminal", () => {
    expect(canTransition("dismissed", "confirmed")).toBe(false);
    expect(canTransition("dismissed", "resolved")).toBe(false);
  });

  it("never allows a transition to itself", () => {
    expect(canTransition("pending", "pending")).toBe(false);
  });

  it("recognises valid status strings", () => {
    expect(isSosStatus("confirmed")).toBe(true);
    expect(isSosStatus("escalated")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/sos/status.test.ts`
Expected: FAIL - "Failed to resolve import ./status".

- [ ] **Step 3: Write the implementation**

Create `src/lib/sos/status.ts`:
```ts
export const SOS_STATUSES = [
  "pending",
  "under_review",
  "confirmed",
  "dismissed",
  "resolved",
] as const;

export type SosStatus = (typeof SOS_STATUSES)[number];

/**
 * A signal in one of these states blocks its author from creating another.
 * `dismissed` and `resolved` do not block - someone whose signal was dismissed
 * last week can be in real danger today.
 */
export const ACTIVE_STATUSES = [
  "pending",
  "under_review",
  "confirmed",
] as const satisfies readonly SosStatus[];

const TRANSITIONS: Record<SosStatus, readonly SosStatus[]> = {
  pending: ["under_review", "confirmed", "dismissed"],
  under_review: ["confirmed", "dismissed"],
  // Only a confirmed signal can resolve; resolving something never confirmed
  // would record help arriving for a signal nobody verified.
  confirmed: ["resolved"],
  dismissed: [],
  resolved: [],
};

export function isSosStatus(value: string): value is SosStatus {
  return (SOS_STATUSES as readonly string[]).includes(value);
}

export function isActiveStatus(status: SosStatus): boolean {
  return (ACTIVE_STATUSES as readonly SosStatus[]).includes(status);
}

export function canTransition(from: SosStatus, to: SosStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/sos/status.test.ts`
Expected: PASS - 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sos
git commit -m "feat: add SOS status lifecycle module"
```

---

## Task 2: Scoring types

**Files:**
- Create: `src/lib/scoring/types.ts`

- [ ] **Step 1: Write the types**

Create `src/lib/scoring/types.ts`:
```ts
import type { DepthLevel } from "@/lib/depth/scale";

/**
 * Everything the scorer is allowed to know. Assembled by the caller from the
 * database and the environment provider, so the scorer itself stays pure.
 *
 * `null` on an environmental field means "we could not find out", which is
 * different from zero and must never be treated as evidence against a signal.
 */
export interface ScoringSnapshot {
  claimedDepth: DepthLevel;
  gpsAccuracyM: number | null;
  hasLivePhoto: boolean;
  accountAgeMinutes: number;
  reporterConfirmedCount: number;
  reporterFalseReportCount: number;
  corroboratingReports: number;
  rainfall24hMm: number | null;
  elevationM: number | null;
  surroundingElevationM: number | null;
}

export type ReasonKind = "supporting" | "concerning" | "unknown";

/** A sentence a moderator can read, not a number they must interpret. */
export interface Reason {
  kind: ReasonKind;
  text: string;
}

export type Confidence = "high" | "medium" | "low";

export interface ScoreResult {
  score: number;
  confidence: Confidence;
  reasons: Reason[];
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: clean, no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scoring/types.ts
git commit -m "feat: add scoring types"
```

---

## Task 3: The scoring function

This is the most important module in Phase 2. It is pure - no database, no network, no clock - so every rule is testable in isolation.

**Files:**
- Create: `src/lib/scoring/score.ts`
- Test: `src/lib/scoring/score.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/scoring/score.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { scoreSignal } from "./score";
import type { ScoringSnapshot } from "./types";

/** A plausible mid-range signal. Individual tests override one field. */
const baseline: ScoringSnapshot = {
  claimedDepth: "chest",
  gpsAccuracyM: 8,
  hasLivePhoto: true,
  accountAgeMinutes: 60 * 24 * 30,
  reporterConfirmedCount: 0,
  reporterFalseReportCount: 0,
  corroboratingReports: 0,
  rainfall24hMm: 40,
  elevationM: 12,
  surroundingElevationM: 13,
};

describe("scoreSignal", () => {
  it("scores a corroborated, plausible signal as high confidence", () => {
    const result = scoreSignal({
      ...baseline,
      corroboratingReports: 4,
      reporterConfirmedCount: 3,
      rainfall24hMm: 82,
    });

    expect(result.confidence).toBe("high");
    expect(result.reasons.some((r) => r.kind === "supporting")).toBe(true);
  });

  it("flags a deep claim on high ground with no rainfall", () => {
    const result = scoreSignal({
      ...baseline,
      claimedDepth: "above_head",
      rainfall24hMm: 0,
      elevationM: 55,
      surroundingElevationM: 15,
      corroboratingReports: 0,
    });

    expect(result.confidence).toBe("low");
    expect(
      result.reasons.some(
        (r) => r.kind === "concerning" && /above surrounding terrain/.test(r.text),
      ),
    ).toBe(true);
    expect(
      result.reasons.some(
        (r) => r.kind === "concerning" && /No rainfall/.test(r.text),
      ),
    ).toBe(true);
  });

  it("notes a brand-new account without silencing it", () => {
    const result = scoreSignal({ ...baseline, accountAgeMinutes: 6 });

    expect(
      result.reasons.some((r) => /Account created 6 minutes ago/.test(r.text)),
    ).toBe(true);
    // Never zero: a new account is a caveat, not a disqualification.
    expect(result.score).toBeGreaterThan(0);
  });

  it("degrades toward caution when environmental data is missing", () => {
    const withData = scoreSignal(baseline);
    const withoutData = scoreSignal({
      ...baseline,
      rainfall24hMm: null,
      elevationM: null,
      surroundingElevationM: null,
    });

    // Missing data must never push a signal DOWN the queue.
    expect(withoutData.confidence).not.toBe("low");
    expect(
      withoutData.reasons.some(
        (r) => r.kind === "unknown" && /unavailable/.test(r.text),
      ),
    ).toBe(true);
    expect(withoutData.score).toBeGreaterThanOrEqual(
      Math.min(withData.score, 40),
    );
  });

  it("counts corroboration as support", () => {
    const alone = scoreSignal({ ...baseline, corroboratingReports: 0 });
    const backed = scoreSignal({ ...baseline, corroboratingReports: 5 });

    expect(backed.score).toBeGreaterThan(alone.score);
    expect(
      backed.reasons.some((r) => /Corroborated by 5 nearby/.test(r.text)),
    ).toBe(true);
  });

  it("weighs a history of false reports against a signal", () => {
    const clean = scoreSignal(baseline);
    const liar = scoreSignal({ ...baseline, reporterFalseReportCount: 3 });

    expect(liar.score).toBeLessThan(clean.score);
    expect(liar.score).toBeGreaterThan(0);
  });

  it("treats a missing photo as weaker evidence", () => {
    const withPhoto = scoreSignal(baseline);
    const without = scoreSignal({ ...baseline, hasLivePhoto: false });

    expect(without.score).toBeLessThan(withPhoto.score);
  });

  it("always clamps between 0 and 100", () => {
    const best = scoreSignal({
      ...baseline,
      corroboratingReports: 50,
      reporterConfirmedCount: 50,
      rainfall24hMm: 500,
    });
    const worst = scoreSignal({
      ...baseline,
      reporterFalseReportCount: 50,
      hasLivePhoto: false,
      gpsAccuracyM: 5000,
      accountAgeMinutes: 0,
      rainfall24hMm: 0,
      elevationM: 90,
      surroundingElevationM: 10,
    });

    expect(best.score).toBeLessThanOrEqual(100);
    expect(worst.score).toBeGreaterThanOrEqual(0);
  });

  it("always produces at least one reason", () => {
    expect(scoreSignal(baseline).reasons.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/scoring/score.test.ts`
Expected: FAIL - "Failed to resolve import ./score".

- [ ] **Step 3: Write the implementation**

Create `src/lib/scoring/score.ts`:
```ts
import { depthRank, type DepthLevel } from "@/lib/depth/scale";
import type { Confidence, Reason, ScoreResult, ScoringSnapshot } from "./types";

const START = 50;

/** Deep claims are the ones rainfall and elevation can meaningfully contradict. */
function isDeepClaim(depth: DepthLevel): boolean {
  return depthRank(depth) >= depthRank("waist");
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function scoreSignal(snapshot: ScoringSnapshot): ScoreResult {
  const reasons: Reason[] = [];
  let score = START;
  let environmentUnknown = false;

  // --- Corroboration -------------------------------------------------------
  if (snapshot.corroboratingReports > 0) {
    score += Math.min(snapshot.corroboratingReports * 6, 24);
    reasons.push({
      kind: "supporting",
      text: `Corroborated by ${snapshot.corroboratingReports} nearby depth report${
        snapshot.corroboratingReports === 1 ? "" : "s"
      } in the last hour.`,
    });
  } else {
    score -= 10;
    reasons.push({
      kind: "concerning",
      text: "No other reports within 500m.",
    });
  }

  // --- Rainfall ------------------------------------------------------------
  if (snapshot.rainfall24hMm === null) {
    environmentUnknown = true;
  } else if (snapshot.rainfall24hMm >= 20) {
    score += 15;
    reasons.push({
      kind: "supporting",
      text: `${Math.round(snapshot.rainfall24hMm)}mm rainfall recorded in 24h.`,
    });
  } else if (snapshot.rainfall24hMm >= 5) {
    score += 8;
    reasons.push({
      kind: "supporting",
      text: `${Math.round(snapshot.rainfall24hMm)}mm rainfall recorded in 24h.`,
    });
  } else if (isDeepClaim(snapshot.claimedDepth)) {
    score -= 15;
    reasons.push({
      kind: "concerning",
      text: "No rainfall recorded in 24h.",
    });
  }

  // --- Elevation relative to surroundings ----------------------------------
  if (snapshot.elevationM === null || snapshot.surroundingElevationM === null) {
    environmentUnknown = true;
  } else {
    const relative = snapshot.elevationM - snapshot.surroundingElevationM;
    if (relative >= 10 && isDeepClaim(snapshot.claimedDepth)) {
      score -= 20;
      reasons.push({
        kind: "concerning",
        text: `This location sits ${Math.round(relative)}m above surrounding terrain.`,
      });
    } else if (relative <= -1) {
      score += 10;
      reasons.push({
        kind: "supporting",
        text: `This location sits ${Math.abs(Math.round(relative))}m below surrounding terrain, where water collects.`,
      });
    }
  }

  if (environmentUnknown) {
    reasons.push({
      kind: "unknown",
      text: "Environmental data unavailable - treat with caution.",
    });
  }

  // --- Reporter history ----------------------------------------------------
  if (snapshot.reporterConfirmedCount > 0) {
    score += Math.min(snapshot.reporterConfirmedCount * 5, 15);
    reasons.push({
      kind: "supporting",
      text: `Reporter has ${snapshot.reporterConfirmedCount} previously confirmed report${
        snapshot.reporterConfirmedCount === 1 ? "" : "s"
      }.`,
    });
  }
  if (snapshot.reporterFalseReportCount > 0) {
    score -= snapshot.reporterFalseReportCount * 12;
    reasons.push({
      kind: "concerning",
      text: `Reporter has ${snapshot.reporterFalseReportCount} report${
        snapshot.reporterFalseReportCount === 1 ? "" : "s"
      } dismissed as false.`,
    });
  }

  // --- Evidence quality ----------------------------------------------------
  if (snapshot.hasLivePhoto) {
    score += 10;
  } else {
    score -= 10;
    reasons.push({ kind: "concerning", text: "No live photo attached." });
  }

  if (snapshot.gpsAccuracyM === null) {
    score -= 3;
  } else if (snapshot.gpsAccuracyM <= 25) {
    score += 8;
    if (snapshot.hasLivePhoto) {
      reasons.push({
        kind: "supporting",
        text: `Live photo attached, GPS accurate to ${Math.round(snapshot.gpsAccuracyM)}m.`,
      });
    }
  } else if (snapshot.gpsAccuracyM > 100) {
    score -= 5;
    reasons.push({
      kind: "concerning",
      text: `GPS accurate only to ${Math.round(snapshot.gpsAccuracyM)}m.`,
    });
  }

  // --- Behaviour -----------------------------------------------------------
  if (snapshot.accountAgeMinutes < 10) {
    score -= 12;
    reasons.push({
      kind: "concerning",
      text: `Account created ${Math.max(0, Math.round(snapshot.accountAgeMinutes))} minutes ago.`,
    });
  }

  const finalScore = clamp(score);

  let confidence: Confidence =
    finalScore >= 65 ? "high" : finalScore >= 35 ? "medium" : "low";

  // Degrade toward caution: when we could not check the environment, the
  // signal must not sink to the bottom of the queue on our ignorance.
  if (environmentUnknown && confidence === "low") {
    confidence = "medium";
  }

  return { score: finalScore, confidence, reasons };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/scoring/score.test.ts`
Expected: PASS - 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scoring
git commit -m "feat: add pure SOS trust scoring with reason sentences"
```

---

## Task 4: Environment provider interface and fake

**Files:**
- Create: `src/lib/env/provider.ts`, `src/lib/env/fake.ts`
- Test: `src/lib/env/fake.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/env/fake.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { fakeEnvProvider, unavailableEnvProvider } from "./fake";

describe("fake env provider", () => {
  it("returns the reading it was constructed with", async () => {
    const provider = fakeEnvProvider({
      rainfall24hMm: 82,
      elevationM: 12,
      surroundingElevationM: 14,
    });

    await expect(provider.read(14.65, 121.1)).resolves.toEqual({
      rainfall24hMm: 82,
      elevationM: 12,
      surroundingElevationM: 14,
    });
  });

  it("models an unavailable provider as nulls, never a throw", async () => {
    await expect(unavailableEnvProvider.read(14.65, 121.1)).resolves.toEqual({
      rainfall24hMm: null,
      elevationM: null,
      surroundingElevationM: null,
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/env/fake.test.ts`
Expected: FAIL - "Failed to resolve import ./fake".

- [ ] **Step 3: Write the interface**

Create `src/lib/env/provider.ts`:
```ts
/**
 * `null` means "could not find out". It is never zero, and never evidence
 * against a signal - see the scorer's handling of `environmentUnknown`.
 */
export interface EnvReading {
  rainfall24hMm: number | null;
  elevationM: number | null;
  surroundingElevationM: number | null;
}

export interface EnvProvider {
  read(lat: number, lon: number): Promise<EnvReading>;
}

export const UNAVAILABLE_READING: EnvReading = {
  rainfall24hMm: null,
  elevationM: null,
  surroundingElevationM: null,
};
```

- [ ] **Step 4: Write the fake**

Create `src/lib/env/fake.ts`:
```ts
import {
  UNAVAILABLE_READING,
  type EnvProvider,
  type EnvReading,
} from "./provider";

export function fakeEnvProvider(reading: EnvReading): EnvProvider {
  return { read: async () => reading };
}

export const unavailableEnvProvider: EnvProvider = {
  read: async () => UNAVAILABLE_READING,
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/env/fake.test.ts`
Expected: PASS - 2 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/env
git commit -m "feat: add environment provider interface and test double"
```

---

## Task 5: Open-Meteo adapter

**Files:**
- Create: `src/lib/env/open-meteo.ts`
- Test: `tests/integration/open-meteo.test.ts`

The endpoints below were verified by hand against the live API before this plan
was written:

- `GET https://api.open-meteo.com/v1/elevation?latitude=a,b,c&longitude=x,y,z`
  returns `{"elevation":[12.0, 13.0, 14.0]}` — **multiple coordinates in one
  request**, which is how the surrounding-terrain average is obtained cheaply.
- `GET https://api.open-meteo.com/v1/forecast?latitude=&longitude=&hourly=precipitation&past_days=1&forecast_days=1&timezone=UTC`
  returns `hourly.time[]` (ISO 8601) and `hourly.precipitation[]` in mm.

Note the forecast response *also* carries a top-level `elevation`, but that is the
weather model's grid-cell elevation, not ground truth. Use the elevation endpoint.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/open-meteo.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { openMeteoProvider } from "@/lib/env/open-meteo";

// Marikina city centre.
const LAT = 14.65;
const LON = 121.1;

describe("openMeteoProvider", () => {
  it("returns a reading for a real point", async () => {
    const reading = await openMeteoProvider.read(LAT, LON);

    expect(reading.elevationM).toBeTypeOf("number");
    expect(reading.surroundingElevationM).toBeTypeOf("number");
    // Marikina sits in a river valley a few metres above sea level.
    expect(reading.elevationM!).toBeGreaterThan(0);
    expect(reading.elevationM!).toBeLessThan(200);
  }, 30_000);

  it("returns rainfall as a non-negative number or null", async () => {
    const reading = await openMeteoProvider.read(LAT, LON);

    if (reading.rainfall24hMm !== null) {
      expect(reading.rainfall24hMm).toBeGreaterThanOrEqual(0);
    }
  }, 30_000);

  it("never throws on an unreachable host - it degrades to nulls", async () => {
    const broken = openMeteoProvider.withBaseUrl(
      "https://open-meteo.invalid.example",
    );

    await expect(broken.read(LAT, LON)).resolves.toEqual({
      rainfall24hMm: null,
      elevationM: null,
      surroundingElevationM: null,
    });
  }, 30_000);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/integration/open-meteo.test.ts`
Expected: FAIL - cannot resolve `@/lib/env/open-meteo`.

- [ ] **Step 3: Write the adapter**

Create `src/lib/env/open-meteo.ts`:
```ts
import {
  UNAVAILABLE_READING,
  type EnvProvider,
  type EnvReading,
} from "./provider";

const DEFAULT_BASE = "https://api.open-meteo.com";
const TIMEOUT_MS = 8_000;

/** Roughly 1 km at Philippine latitudes. */
const RING_OFFSET_DEG = 0.009;

interface OpenMeteoProvider extends EnvProvider {
  withBaseUrl(baseUrl: string): OpenMeteoProvider;
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    // Deliberately swallowed: an unreachable provider must degrade to "we do
    // not know", never take down a distress submission.
    return null;
  }
}

/** Sums the precipitation samples falling inside the last 24 hours. */
function sumLast24h(times: string[], values: (number | null)[]): number | null {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const now = Date.now();
  let total = 0;
  let counted = 0;

  times.forEach((iso, i) => {
    const t = new Date(`${iso}Z`).getTime();
    if (Number.isNaN(t) || t < cutoff || t > now) return;
    const v = values[i];
    if (typeof v === "number") {
      total += v;
      counted += 1;
    }
  });

  return counted === 0 ? null : Number(total.toFixed(1));
}

function build(baseUrl: string): OpenMeteoProvider {
  return {
    withBaseUrl: (next: string) => build(next),

    async read(lat: number, lon: number): Promise<EnvReading> {
      // Centre first, then a four-point ring, in ONE request.
      const lats = [
        lat,
        lat + RING_OFFSET_DEG,
        lat - RING_OFFSET_DEG,
        lat,
        lat,
      ];
      const lons = [
        lon,
        lon,
        lon,
        lon + RING_OFFSET_DEG,
        lon - RING_OFFSET_DEG,
      ];

      const [elevationJson, forecastJson] = await Promise.all([
        getJson(
          `${baseUrl}/v1/elevation?latitude=${lats.join(",")}&longitude=${lons.join(",")}`,
        ),
        getJson(
          `${baseUrl}/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&hourly=precipitation&past_days=1&forecast_days=1&timezone=UTC`,
        ),
      ]);

      if (elevationJson === null && forecastJson === null) {
        return UNAVAILABLE_READING;
      }

      let elevationM: number | null = null;
      let surroundingElevationM: number | null = null;

      const elevations = (elevationJson as { elevation?: unknown })?.elevation;
      if (Array.isArray(elevations) && elevations.length === lats.length) {
        const numbers = elevations.filter(
          (v): v is number => typeof v === "number",
        );
        if (numbers.length === lats.length) {
          elevationM = numbers[0];
          const ring = numbers.slice(1);
          surroundingElevationM =
            Math.round((ring.reduce((a, b) => a + b, 0) / ring.length) * 10) / 10;
        }
      }

      let rainfall24hMm: number | null = null;
      const hourly = (
        forecastJson as {
          hourly?: { time?: unknown; precipitation?: unknown };
        }
      )?.hourly;
      if (Array.isArray(hourly?.time) && Array.isArray(hourly?.precipitation)) {
        rainfall24hMm = sumLast24h(
          hourly.time as string[],
          hourly.precipitation as (number | null)[],
        );
      }

      return { rainfall24hMm, elevationM, surroundingElevationM };
    },
  };
}

export const openMeteoProvider = build(DEFAULT_BASE);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/open-meteo.test.ts`
Expected: PASS - 3 tests. This calls the live API; if it fails on network, report it rather than mocking the test into passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/env/open-meteo.ts tests/integration/open-meteo.test.ts
git commit -m "feat: add Open-Meteo adapter that degrades to nulls on failure"
```

---

## Task 6: SOS schema

**Files:**
- Create: `supabase/migrations/0005_sos.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0005_sos.sql`:
```sql
create type sos_status as enum (
  'pending', 'under_review', 'confirmed', 'dismissed', 'resolved'
);

create type dismiss_reason as enum (
  'false_report', 'duplicate', 'resolved_already', 'insufficient_info'
);

create table sos_signals (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid                   not null references profiles (id) on delete cascade,
  location       geography(Point, 4326) not null,
  depth          depth_level            not null,
  photo_path     text                   not null,
  note           text,
  gps_accuracy_m double precision,
  status         sos_status             not null default 'pending',
  barangay       text,
  trust_score    integer,
  confidence     text check (confidence in ('high', 'medium', 'low')),
  reasons        jsonb                  not null default '[]'::jsonb,
  dismissed_as   dismiss_reason,
  created_at     timestamptz            not null default now(),
  resolved_at    timestamptz
);

-- The one-active-signal rule, enforced by the database rather than by
-- application code. 'dismissed' and 'resolved' are excluded deliberately:
-- someone whose signal was dismissed last week can be in danger today.
create unique index sos_one_active_per_reporter
  on sos_signals (reporter_id)
  where status in ('pending', 'under_review', 'confirmed');

create index sos_signals_location_idx on sos_signals using gist (location);
create index sos_signals_triage_idx
  on sos_signals (status, trust_score desc nulls first, created_at);

-- Environmental facts as they were AT SUBMISSION. Checking the weather days
-- later reveals nothing about conditions when the signal was sent.
create table env_snapshots (
  sos_id                  uuid primary key references sos_signals (id) on delete cascade,
  rainfall_24h_mm         double precision,
  elevation_m             double precision,
  surrounding_elevation_m double precision,
  corroborating_reports   integer     not null default 0,
  provider_ok             boolean     not null,
  fetched_at              timestamptz not null default now()
);

-- Append-only. Nothing is ever deleted, only transitioned; accountability
-- requires the trail to survive the decision.
create table signal_events (
  id         bigint generated always as identity primary key,
  sos_id     uuid        not null references sos_signals (id) on delete cascade,
  actor_id   uuid                 references profiles (id),
  event_type text        not null,
  payload    jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index signal_events_sos_idx on signal_events (sos_id, created_at);

create table reputation (
  user_id            uuid primary key references profiles (id) on delete cascade,
  confirmed_count    integer     not null default 0,
  false_report_count integer     not null default 0,
  updated_at         timestamptz not null default now()
);

create table moderators (
  user_id    uuid primary key references profiles (id) on delete cascade,
  barangay   text        not null,
  role       text        not null default 'moderator'
               check (role in ('moderator', 'admin')),
  created_at timestamptz not null default now()
);

create index moderators_barangay_idx on moderators (barangay);
```

- [ ] **Step 2: Apply and verify**

```bash
npx supabase migration up
npx supabase db diff
```
Expected: applied cleanly; `db diff` reports no schema changes.

- [ ] **Step 3: Prove the one-active-signal constraint actually bites**

```bash
docker exec supabase_db_app psql -U postgres -d postgres -c "select indexdef from pg_indexes where indexname = 'sos_one_active_per_reporter';"
```
Expected: a `CREATE UNIQUE INDEX ... WHERE (status = ANY (...))` definition listing exactly `pending`, `under_review`, `confirmed`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_sos.sql
git commit -m "feat: add SOS signal schema with one-active-signal constraint"
```

---

## Task 7: SOS row-level security

Privacy claims need tests. This is the table that will hold a distressed
person's location and photograph.

**Files:**
- Create: `tests/integration/sos-rls.test.ts`, `supabase/migrations/0006_sos_rls.sql`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/sos-rls.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Every client keeps its own in-memory session. supabase-js derives its storage
// key from the project URL, so without this they share one slot in jsdom and a
// sign-in silently authenticates the "anonymous" client too.
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const anon = createClient(url, anonKey, opts);
const victim = createClient(url, anonKey, opts);
const stranger = createClient(url, anonKey, opts);

let victimId: string;
let strangerId: string;
let signalId: string;

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

beforeAll(async () => {
  const v = await makeUser("victim");
  const s = await makeUser("stranger");
  victimId = v.id;
  strangerId = s.id;

  await victim.auth.signInWithPassword({
    email: v.email,
    password: "test-password-123",
  });
  await stranger.auth.signInWithPassword({
    email: s.email,
    password: "test-password-123",
  });

  const { data, error } = await admin
    .from("sos_signals")
    .insert({
      reporter_id: victimId,
      location: "SRID=4326;POINT(121.1 14.65)",
      depth: "chest",
      photo_path: "sos/test.jpg",
      barangay: "Malanday",
    })
    .select("id")
    .single();
  if (error) throw error;
  signalId = data.id;
});

describe("sos_signals row-level security", () => {
  it("hides distress signals from anonymous visitors entirely", async () => {
    const { data } = await anon.from("sos_signals").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("does not let a signed-in stranger read someone else's signal", async () => {
    const { data } = await stranger.from("sos_signals").select("id");
    expect((data ?? []).map((r) => r.id)).not.toContain(signalId);
  });

  it("lets the reporter see their own signal", async () => {
    const { data } = await victim.from("sos_signals").select("id");
    expect((data ?? []).map((r) => r.id)).toContain(signalId);
  });

  it("does not let a user file a signal in someone else's name", async () => {
    const { error } = await stranger.from("sos_signals").insert({
      reporter_id: victimId,
      location: "SRID=4326;POINT(121.1 14.65)",
      depth: "waist",
      photo_path: "sos/forged.jpg",
    });
    expect(error).not.toBeNull();
  });

  it("refuses a second active signal from the same reporter", async () => {
    const { error } = await admin.from("sos_signals").insert({
      reporter_id: victimId,
      location: "SRID=4326;POINT(121.1 14.65)",
      depth: "waist",
      photo_path: "sos/second.jpg",
    });
    expect(error?.code).toBe("23505");
  });

  it("hides the audit log and environmental snapshots from everyone but service role", async () => {
    const events = await anon.from("signal_events").select("id");
    const snapshots = await stranger.from("env_snapshots").select("sos_id");
    expect(events.data ?? []).toEqual([]);
    expect(snapshots.data ?? []).toEqual([]);
  });

  it("still allows a suspended reporter to send a signal", async () => {
    // Suspension lowers priority and forces review; it never silences.
    await admin
      .from("profiles")
      .update({ suspended_at: new Date().toISOString() })
      .eq("id", strangerId);

    const { error } = await stranger.from("sos_signals").insert({
      reporter_id: strangerId,
      location: "SRID=4326;POINT(121.1 14.65)",
      depth: "chest",
      photo_path: "sos/suspended.jpg",
    });
    expect(error).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/integration/sos-rls.test.ts`
Expected: FAIL - with no policies and no grants, several assertions fail.

- [ ] **Step 3: Write the policies**

Create `supabase/migrations/0006_sos_rls.sql`:
```sql
-- Start from zero rather than inheriting any default ACL, which can hand out
-- TRUNCATE and TRIGGER. RLS does not govern TRUNCATE.
revoke all on sos_signals   from anon, authenticated;
revoke all on env_snapshots from anon, authenticated;
revoke all on signal_events from anon, authenticated;
revoke all on reputation    from anon, authenticated;
revoke all on moderators    from anon, authenticated;

-- A distressed person's location and photograph are never public. anon holds
-- nothing on any of these tables: denied at the grant layer as well as by RLS.
grant select, insert on sos_signals to authenticated;
grant select         on moderators  to authenticated;

grant select, insert, update, delete on sos_signals   to service_role;
grant select, insert, update, delete on env_snapshots to service_role;
grant select, insert, update, delete on signal_events to service_role;
grant select, insert, update, delete on reputation    to service_role;
grant select, insert, update, delete on moderators    to service_role;

alter table sos_signals   enable row level security;
alter table env_snapshots enable row level security;
alter table signal_events enable row level security;
alter table reputation    enable row level security;
alter table moderators    enable row level security;

-- A reporter may read their own signals, and file only in their own name.
create policy "reporters read their own signals"
  on sos_signals for select
  to authenticated
  using (reporter_id = auth.uid());

create policy "reporters create signals in their own name"
  on sos_signals for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- A moderator may read signals in their own barangay only.
create policy "moderators read their barangay"
  on sos_signals for select
  to authenticated
  using (
    exists (
      select 1
        from moderators m
       where m.user_id = auth.uid()
         and m.barangay = sos_signals.barangay
    )
  );

create policy "moderators read their own row"
  on moderators for select
  to authenticated
  using (user_id = auth.uid());

-- env_snapshots, signal_events and reputation get NO policy for authenticated.
-- They are service-role only in this phase; the console reads them through a
-- security-definer function in Phase 2B, so no policy is the correct posture.
```

- [ ] **Step 4: Apply and re-run**

```bash
npx supabase migration up
npx vitest run tests/integration/sos-rls.test.ts
```
Expected: PASS - 7 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_sos_rls.sql tests/integration/sos-rls.test.ts
git commit -m "feat: add SOS row-level security with privacy tests"
```

---

## Task 8: Corroboration and public aggregate functions

**Files:**
- Create: `tests/integration/sos-functions.test.ts`, `supabase/migrations/0007_sos_functions.sql`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/sos-functions.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, serviceKey, opts);
const anon = createClient(url, anonKey, opts);

let reporterId: string;

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `corro-${Date.now()}@example.test`,
    password: "test-password-123",
    email_confirm: true,
  });
  if (error) throw error;
  reporterId = data.user!.id;

  // Three recent reports beside the point, one far away.
  await admin.from("depth_reports").insert([
    { reporter_id: reporterId, location: "SRID=4326;POINT(121.1001 14.6501)", depth: "chest", source: "seed" },
    { reporter_id: reporterId, location: "SRID=4326;POINT(121.1002 14.6502)", depth: "waist", source: "seed" },
    { reporter_id: reporterId, location: "SRID=4326;POINT(121.1003 14.6503)", depth: "chest", source: "seed" },
    { reporter_id: reporterId, location: "SRID=4326;POINT(121.145 14.69)",    depth: "ankle", source: "seed" },
  ]);
});

describe("corroborating_reports", () => {
  it("counts recent nearby reports", async () => {
    const { data, error } = await admin.rpc("corroborating_reports", {
      lat: 14.65,
      lon: 121.1,
      radius_m: 300,
      within_minutes: 180,
    });

    expect(error).toBeNull();
    expect(data).toBeGreaterThanOrEqual(3);
  });

  it("excludes reports outside the radius", async () => {
    const near = await admin.rpc("corroborating_reports", {
      lat: 14.65, lon: 121.1, radius_m: 300, within_minutes: 180,
    });
    const tiny = await admin.rpc("corroborating_reports", {
      lat: 14.65, lon: 121.1, radius_m: 5, within_minutes: 180,
    });

    expect(tiny.data).toBeLessThan(near.data);
  });

  it("excludes reports outside the time window", async () => {
    const { data } = await admin.rpc("corroborating_reports", {
      lat: 14.65, lon: 121.1, radius_m: 300, within_minutes: 0,
    });

    expect(data).toBe(0);
  });
});

describe("sos_counts_by_barangay", () => {
  it("lets an anonymous visitor see counts but never a location", async () => {
    const { data, error } = await anon.rpc("sos_counts_by_barangay");

    expect(error).toBeNull();
    const rows = (data ?? []) as Record<string, unknown>[];
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(["active_count", "barangay"]);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/integration/sos-functions.test.ts`
Expected: FAIL - `PGRST202`, the functions do not exist.

- [ ] **Step 3: Write the functions**

Create `supabase/migrations/0007_sos_functions.sql`:
```sql
-- How many independent depth reports back up a claim at this point, recently.
-- security definer because the caller is the server action, and the count must
-- not vary with who is asking.
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
     and r.reported_at >= now() - make_interval(mins => within_minutes)
     and st_dwithin(
           r.location,
           st_point(corroborating_reports.lon, corroborating_reports.lat)::geography,
           corroborating_reports.radius_m
         );
$fn$;

-- The ONLY public view of distress activity: a count per barangay. No pins,
-- no photos, no identities. Publicly pinning a distressed person's exact
-- location endangers them - looting and harassment follow disasters.
create or replace function sos_counts_by_barangay()
returns table (barangay text, active_count bigint)
language sql
stable
security definer
set search_path = public
as $fn$
  select s.barangay, count(*) as active_count
    from sos_signals s
   where s.status in ('pending', 'under_review', 'confirmed')
     and s.barangay is not null
   group by s.barangay;
$fn$;

revoke execute on function corroborating_reports(double precision, double precision, double precision, integer) from anon;
```

- [ ] **Step 4: Apply and re-run**

```bash
npx supabase migration up
npx vitest run tests/integration/sos-functions.test.ts
```
Expected: PASS - 4 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0007_sos_functions.sql tests/integration/sos-functions.test.ts
git commit -m "feat: add corroboration count and public SOS aggregate"
```

---

## Task 9: Photo storage bucket

**Files:**
- Create: `supabase/migrations/0008_sos_storage.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0008_sos_storage.sql`:
```sql
-- Private bucket. A distressed person's photograph must never be served from
-- a public URL; the console fetches it through a signed URL in Phase 2B.
insert into storage.buckets (id, name, public)
values ('sos-photos', 'sos-photos', false)
on conflict (id) do nothing;

-- A signed-in user may upload only into their own folder, keyed by user id.
create policy "users upload their own sos photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'sos-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users read their own sos photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'sos-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: Apply and verify the bucket is private**

```bash
npx supabase migration up
docker exec supabase_db_app psql -U postgres -d postgres -c "select id, public from storage.buckets where id = 'sos-photos';"
```
Expected: one row, `public = f`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0008_sos_storage.sql
git commit -m "feat: add private storage bucket for SOS photos"
```

---

## Task 10: The submit-SOS server action

**Files:**
- Create: `src/app/actions/submit-sos.ts`
- Test: `src/app/actions/build-sos-row.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/actions/build-sos-row.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildSosRow } from "./submit-sos";

describe("buildSosRow", () => {
  it("builds a PostGIS row with longitude before latitude", () => {
    const row = buildSosRow("user-1", {
      depth: "chest",
      lat: 14.65,
      lon: 121.1,
      gpsAccuracyM: 9,
      photoPath: "user-1/abc.jpg",
      note: "nasa bubong kami",
    });

    expect(row).toEqual({
      reporter_id: "user-1",
      location: "SRID=4326;POINT(121.1 14.65)",
      depth: "chest",
      gps_accuracy_m: 9,
      photo_path: "user-1/abc.jpg",
      note: "nasa bubong kami",
    });
  });

  it("keeps a null note null rather than an empty string", () => {
    const row = buildSosRow("user-1", {
      depth: "waist",
      lat: 14.65,
      lon: 121.1,
      gpsAccuracyM: null,
      photoPath: "user-1/abc.jpg",
      note: null,
    });

    expect(row.note).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/actions/build-sos-row.test.ts`
Expected: FAIL - cannot resolve `./submit-sos`.

- [ ] **Step 3: Write the action**

Create `src/app/actions/submit-sos.ts`:
```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { validateReport, type ReportErrorCode } from "@/lib/reports/validate";
import { scoreSignal } from "@/lib/scoring/score";
import { openMeteoProvider } from "@/lib/env/open-meteo";
import type { DepthLevel } from "@/lib/depth/scale";

export interface SosInput {
  depth: string;
  lat: number;
  lon: number;
  gpsAccuracyM: number | null;
  photoPath: string;
  note: string | null;
}

export type SosErrorCode =
  | ReportErrorCode
  | "not_signed_in"
  | "already_active"
  | "insert_failed";

export type SosResult =
  | { ok: true; signalId: string }
  | { ok: false; errors: SosErrorCode[] };

interface SosRow {
  reporter_id: string;
  location: string;
  depth: DepthLevel;
  gps_accuracy_m: number | null;
  photo_path: string;
  note: string | null;
}

export function buildSosRow(reporterId: string, input: SosInput): SosRow {
  return {
    reporter_id: reporterId,
    location: `SRID=4326;POINT(${input.lon} ${input.lat})`,
    depth: input.depth as DepthLevel,
    gps_accuracy_m: input.gpsAccuracyM,
    photo_path: input.photoPath,
    note: input.note,
  };
}

export async function submitSos(input: SosInput): Promise<SosResult> {
  const validation = validateReport({
    depth: input.depth,
    lat: input.lat,
    lon: input.lon,
    gpsAccuracyM: input.gpsAccuracyM,
  });
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, errors: ["not_signed_in"] };
  }

  const { data: inserted, error } = await supabase
    .from("sos_signals")
    .insert(buildSosRow(userData.user.id, input))
    .select("id")
    .single();

  if (error) {
    // 23505 is the partial unique index: this account already has an active
    // signal. That is a distinct, actionable situation, not a generic failure.
    if (error.code === "23505") {
      return { ok: false, errors: ["already_active"] };
    }
    // TODO: replace with real telemetry once a logger exists.
    console.error("sos insert failed", {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
    return { ok: false, errors: ["insert_failed"] };
  }

  // Enrichment and scoring are deliberately AFTER the signal exists. The
  // signal must survive even if every enrichment step fails - the system
  // never refuses an SOS.
  void enrichAndScore(inserted.id, input, userData.user.created_at);

  return { ok: true, signalId: inserted.id };
}

function minutesSince(iso: string | undefined): number {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, (Date.now() - created) / 60_000);
}

async function enrichAndScore(
  signalId: string,
  input: SosInput,
  accountCreatedAt: string | undefined,
): Promise<void> {
  try {
    const supabase = await createClient();

    const [reading, corroboration] = await Promise.all([
      openMeteoProvider.read(input.lat, input.lon),
      supabase.rpc("corroborating_reports", {
        lat: input.lat,
        lon: input.lon,
        radius_m: 500,
        within_minutes: 60,
      }),
    ]);

    const corroboratingReports =
      typeof corroboration.data === "number" ? corroboration.data : 0;

    const providerOk =
      reading.rainfall24hMm !== null || reading.elevationM !== null;

    const result = scoreSignal({
      claimedDepth: input.depth as DepthLevel,
      gpsAccuracyM: input.gpsAccuracyM,
      hasLivePhoto: input.photoPath.length > 0,
      accountAgeMinutes: minutesSince(accountCreatedAt),
      reporterConfirmedCount: 0,
      reporterFalseReportCount: 0,
      corroboratingReports,
      rainfall24hMm: reading.rainfall24hMm,
      elevationM: reading.elevationM,
      surroundingElevationM: reading.surroundingElevationM,
    });

    // Snapshot the environment AS IT WAS. Re-checking the weather days later
    // reveals nothing about conditions when the signal was sent, and a
    // moderator reviewing an old signal needs what was true at the time.
    await supabase.from("env_snapshots").upsert({
      sos_id: signalId,
      rainfall_24h_mm: reading.rainfall24hMm,
      elevation_m: reading.elevationM,
      surrounding_elevation_m: reading.surroundingElevationM,
      corroborating_reports: corroboratingReports,
      provider_ok: providerOk,
    });

    await supabase
      .from("sos_signals")
      .update({
        trust_score: result.score,
        confidence: result.confidence,
        reasons: result.reasons,
      })
      .eq("id", signalId);
  } catch (error) {
    // Never rethrow: a scoring failure must not surface to a person in danger.
    // TODO: replace with real telemetry once a logger exists.
    console.error("sos enrichment failed", { signalId, error });
  }
}
```

**Note for the implementer:** `reporterConfirmedCount` and
`reporterFalseReportCount` are hardcoded to zero because reputation is written
by the moderator console in Phase 2B. Do not invent a reputation lookup here -
the table exists but nothing populates it yet, and reading zeros from it would
be indistinguishable from a genuinely clean record.

`accountAgeMinutes` is **not** hardcoded: it comes from the real
`user.created_at`, because the brand-new-account rule is one of the few
behavioural signals available in Phase 2A and stubbing it would silently
disable a scoring component while appearing to work.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/actions/build-sos-row.test.ts`
Expected: PASS - 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/submit-sos.ts src/app/actions/build-sos-row.test.ts
git commit -m "feat: add SOS submission action with enrichment and scoring"
```

---

## Task 11: Hold-to-confirm control

**Files:**
- Create: `src/components/HoldToConfirm.tsx`
- Test: `src/components/HoldToConfirm.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/HoldToConfirm.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { HoldToConfirm } from "./HoldToConfirm";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("HoldToConfirm", () => {
  it("does not fire on a quick tap", () => {
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Humingi ng tulong" onConfirm={onConfirm} />);

    const button = screen.getByRole("button");
    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.pointerUp(button);

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("fires only after the full hold", () => {
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Humingi ng tulong" onConfirm={onConfirm} />);

    fireEvent.pointerDown(screen.getByRole("button"));
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels when the finger lifts early", () => {
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Humingi ng tulong" onConfirm={onConfirm} />);

    const button = screen.getByRole("button");
    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.pointerUp(button);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("exposes progress to assistive technology", () => {
    render(<HoldToConfirm label="Humingi ng tulong" onConfirm={() => {}} />);
    const button = screen.getByRole("button");

    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(Number(button.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/HoldToConfirm.test.tsx`
Expected: FAIL - cannot resolve `./HoldToConfirm`.

- [ ] **Step 3: Write the component**

Create `src/components/HoldToConfirm.tsx`:
```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const HOLD_MS = 3000;
const TICK_MS = 50;

interface HoldToConfirmProps {
  label: string;
  onConfirm: () => void;
}

/**
 * Three seconds of deliberate pressure. The fire-alarm problem is a cheap
 * action with a visible consequence; this makes the consequential action
 * expensive without making it slow enough to matter in an emergency.
 */
export function HoldToConfirm({ label, onConfirm }: HoldToConfirmProps) {
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fired = useRef(false);

  const stop = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
    if (!fired.current) setProgress(0);
  }, []);

  useEffect(() => stop, [stop]);

  function start() {
    if (timer.current !== null || fired.current) return;
    const startedAt = Date.now();

    timer.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const next = Math.min(elapsed / HOLD_MS, 1);
      setProgress(next);

      if (next >= 1) {
        fired.current = true;
        stop();
        onConfirm();
      }
    }, TICK_MS);
  }

  return (
    <button
      type="button"
      className="hold"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      style={{ "--hold-progress": `${progress * 100}%` } as React.CSSProperties}
    >
      <span className="hold-fill" aria-hidden="true" />
      <span className="hold-label">{label}</span>
    </button>
  );
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/components/HoldToConfirm.test.tsx`
Expected: PASS - 4 tests.

If fake timers do not drive the interval reliably under jsdom, keep the
assertions and change the mechanism - do **not** shorten `HOLD_MS` to make a
test pass. Report whatever you changed.

- [ ] **Step 5: Add styling**

Append to `src/app/globals.css`:
```css
/* Hold-to-confirm: the fill is the affordance, so it must be unmistakable. */
.hold {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 72px;
  border: 2px solid var(--danger);
  border-radius: var(--radius-control);
  background: var(--ground);
  color: var(--danger);
  font-family: var(--font-body), sans-serif;
  font-size: 19px;
  font-weight: 600;
  overflow: hidden;
  cursor: pointer;
  touch-action: none;
  user-select: none;
}

.hold-fill {
  position: absolute;
  inset: 0;
  width: var(--hold-progress, 0%);
  background: var(--danger);
  transition: width 60ms linear;
}

.hold-label {
  position: relative;
  z-index: 1;
  mix-blend-mode: difference;
  color: #fff;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/HoldToConfirm.tsx src/components/HoldToConfirm.test.tsx src/app/globals.css
git commit -m "feat: add hold-to-confirm control"
```

---

## Task 12: Live camera capture

**Files:**
- Create: `src/components/LiveCamera.tsx`

Gallery upload is deliberately impossible: a prankster in a dry bedroom must
have to produce a photograph of actual floodwater. `capture="environment"` on a
file input is not enough on desktop, so this uses `getUserMedia` directly and
falls back to a camera-only file input where the media API is unavailable.

- [ ] **Step 1: Write the component**

Create `src/components/LiveCamera.tsx`:
```tsx
"use client";

import { useEffect, useRef, useState } from "react";

interface LiveCameraProps {
  onCapture: (file: File) => void;
}

export function LiveCamera({ onCapture }: LiveCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function open() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch {
        setDenied(true);
      }
    }

    void open();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], "sos.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.85,
    );
  }

  if (denied) {
    return (
      <div>
        <p className="alert" role="alert">
          Kailangan ng camera para makapagpadala ng SOS. Buksan ang camera
          permission, o kumuha ng larawan gamit ang camera ng telepono.
        </p>
        <input
          className="field-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onCapture(file);
          }}
        />
      </div>
    );
  }

  return (
    <div className="camera">
      <video ref={videoRef} className="camera-view" playsInline muted />
      <button
        type="button"
        className="btn"
        onClick={capture}
        disabled={!ready}
        style={{ marginTop: 12 }}
      >
        {ready ? "Kumuha ng larawan" : "Binubuksan ang camera..."}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add styling**

Append to `src/app/globals.css`:
```css
.camera-view {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  background: var(--ink);
  border-radius: var(--radius-card);
}
```

- [ ] **Step 3: Verify it compiles and the suite still passes**

```bash
npx tsc --noEmit
npm run test
```
Expected: clean typecheck; every existing test still passes.

No unit test for this component: `getUserMedia` and `canvas.toBlob` are not
meaningfully available in jsdom, so a test would assert against mocks of the
browser rather than the behaviour. It is covered manually in Task 13.

- [ ] **Step 4: Commit**

```bash
git add src/components/LiveCamera.tsx src/app/globals.css
git commit -m "feat: add live camera capture with camera-only fallback"
```

---

## Task 13: The SOS page

**Files:**
- Create: `src/app/sos/page.tsx`

- [ ] **Step 1: Write the page**

Create `src/app/sos/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { DepthSlider } from "@/components/DepthSlider";
import { HoldToConfirm } from "@/components/HoldToConfirm";
import { LiveCamera } from "@/components/LiveCamera";
import { createClient } from "@/lib/supabase/client";
import { submitSos, type SosErrorCode } from "@/app/actions/submit-sos";
import type { DepthLevel } from "@/lib/depth/scale";

type PageErrorCode = SosErrorCode | "no_location" | "upload_failed";

const ERROR_MESSAGES: Record<PageErrorCode, string> = {
  invalid_depth: "Pumili ng lalim ng tubig.",
  invalid_coordinates: "Hindi mabasa ang lokasyon mo.",
  outside_pilot_area: "Sa ngayon, Marikina lang ang saklaw ng Antas.",
  not_signed_in: "Mag-sign in muna bago humingi ng tulong.",
  already_active: "May aktibo ka nang SOS. Hinihintay pa itong suriin.",
  insert_failed: "May problema sa pagpapadala. Subukan ulit.",
  upload_failed: "Hindi naipadala ang larawan. Subukan ulit.",
  no_location: "Buksan ang location para makapagpadala ng SOS.",
};

export default function SosPage() {
  const [depth, setDepth] = useState<DepthLevel>("chest");
  const [photo, setPhoto] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [errors, setErrors] = useState<PageErrorCode[]>([]);

  async function handleConfirm() {
    if (!photo) return;
    setStatus("sending");
    setErrors([]);

    const position = await new Promise<GeolocationPosition | null>((resolve) =>
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
        enableHighAccuracy: true,
        timeout: 10_000,
      }),
    );

    if (!position) {
      setErrors(["no_location"]);
      setStatus("idle");
      return;
    }

    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setErrors(["not_signed_in"]);
      setStatus("idle");
      return;
    }

    const path = `${userData.user.id}/${Date.now()}.jpg`;
    const upload = await supabase.storage
      .from("sos-photos")
      .upload(path, photo, { contentType: "image/jpeg" });

    if (upload.error) {
      setErrors(["upload_failed"]);
      setStatus("idle");
      return;
    }

    const result = await submitSos({
      depth,
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      gpsAccuracyM: position.coords.accuracy ?? null,
      photoPath: path,
      note: note.trim() === "" ? null : note.trim(),
    });

    if (!result.ok) {
      setErrors(result.errors);
      setStatus("idle");
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <main className="task-page">
        <div className="done">
          <h1 className="done-title">Naipadala na ang SOS mo.</h1>
          <p className="done-body">
            Susuriin ito ng barangay. Manatiling ligtas at kung kaya, pumunta sa
            mas mataas na lugar.
          </p>
        </div>
        <p className="notice" style={{ marginTop: 24 }}>
          Demonstrasyon lamang ito. Walang tunay na rescue service na
          nakakatanggap nito. Sa totoong emergency, tumawag sa 911.
        </p>
      </main>
    );
  }

  return (
    <main className="task-page">
      <h1 className="task-title">Humingi ng tulong</h1>

      <p className="notice">
        Demonstrasyon lamang ito. Walang tunay na rescue service na nakakatanggap
        nito. Sa totoong emergency, tumawag sa 911.
      </p>

      <p className="task-lede">
        Kailangan ng larawan ng tubig ngayon. Hindi puwedeng galing sa gallery.
      </p>

      {photo ? (
        <p className="notice">May larawan na. Handa nang ipadala.</p>
      ) : (
        <LiveCamera onCapture={setPhoto} />
      )}

      <div style={{ marginTop: 28 }}>
        <DepthSlider value={depth} onChange={setDepth} />
      </div>

      <label className="field" style={{ marginTop: 24 }}>
        <span className="field-label">Dagdag na detalye (opsyonal)</span>
        <input
          className="field-input"
          type="text"
          value={note}
          maxLength={140}
          placeholder="Halimbawa: tatlo kami, may matanda"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <div style={{ marginTop: 8 }}>
        <HoldToConfirm
          label={
            status === "sending"
              ? "Ipinapadala..."
              : "Pindutin nang 3 segundo para humingi ng tulong"
          }
          onConfirm={handleConfirm}
        />
      </div>

      {!photo && (
        <p className="task-lede" style={{ marginTop: 12 }}>
          Kumuha muna ng larawan bago magpadala.
        </p>
      )}

      {errors.map((code) => (
        <p key={code} className="alert" role="alert">
          {ERROR_MESSAGES[code]}
        </p>
      ))}

      {errors.includes("not_signed_in") && (
        <p style={{ marginTop: 16 }}>
          <Link href="/login" className="btn">
            Mag-sign in
          </Link>
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify the whole suite and the build**

```bash
npm run test
npx tsc --noEmit
npx next build
```
Expected: all tests pass, typecheck clean, build succeeds with `/sos` in the route table.

- [ ] **Step 3: Verify the environmental snapshot was written**

After sending one signal, confirm enrichment actually persisted rather than
only updating the score:

```bash
docker exec supabase_db_app psql -U postgres -d postgres -c "select e.rainfall_24h_mm, e.elevation_m, e.surrounding_elevation_m, e.corroborating_reports, e.provider_ok from env_snapshots e join sos_signals s on s.id = e.sos_id order by s.created_at desc limit 1;"
```

Expected: one row with a real elevation for Marikina (roughly 5-30 m) and
`provider_ok = t`. If `provider_ok = f`, Open-Meteo was unreachable — the signal
should still exist and still be scored, with the confidence band no lower than
`medium`. Report which case you saw.

- [ ] **Step 4: Verify manually**

Run `npm run dev`, sign in, and open `http://127.0.0.1:3000/sos` - use
`127.0.0.1`, never `localhost`, or the session will not be present.

Check each of these and report what you observe:
- The simulation notice appears **before** the form, not after it
- The camera prompts for permission; denying it shows the camera-only fallback
- Holding the button for less than three seconds does nothing
- A full hold with a photo produces the confirmation screen
- Attempting a **second** SOS shows "May aktibo ka nang SOS"
- `select trust_score, confidence, reasons from sos_signals order by created_at desc limit 1;`
  shows a score, a confidence band, and reason sentences within a few seconds

- [ ] **Step 5: Commit**

```bash
git add src/app/sos
git commit -m "feat: add SOS distress flow"
```

---

## Phase 2A completion criteria

- [ ] A signed-in user can send a distress signal with a live photo, after a deliberate three-second hold
- [ ] A second active signal from the same account is refused by the database, not by application code
- [ ] Signals are invisible to anonymous visitors and to signed-in strangers, proven by tests
- [ ] Every signal receives a trust score, a confidence band, and human-readable reason sentences
- [ ] Missing environmental data raises priority rather than lowering it
- [ ] The public map can show per-barangay counts without exposing a single location
- [ ] The full test suite passes

## Next

**Phase 2B - the moderator console:** barangay-scoped triage queue ordered by
priority, detail view rendering the reason sentences, confirm and dismiss with
reason codes, the append-only audit log, reputation write-back, the three-strike
suspension rule, and the persistent simulation banner.
