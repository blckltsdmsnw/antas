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
