import { depthRank, type DepthLevel } from "@/lib/depth/scale";
import type { Confidence, Reason, ScoreResult, ScoringSnapshot } from "./types";

const START = 50;

/**
 * Deep claims are the ones rainfall and elevation can meaningfully contradict.
 *
 * `null` means the sender was never asked - an SOS no longer collects a depth.
 * You cannot contradict a claim nobody made, so both penalties that depend on
 * this withdraw rather than treating silence as a shallow claim.
 *
 * That matters more than it looks. The governing rule is that the system never
 * refuses an SOS; docking someone's score for a form field they were
 * deliberately not shown would be the system penalising its own design
 * decision, and it would push exactly the people who asked for help fastest
 * toward the bottom of a moderator's queue.
 */
function isDeepClaim(depth: DepthLevel | null): boolean {
  return depth !== null && depthRank(depth) >= depthRank("waist");
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
