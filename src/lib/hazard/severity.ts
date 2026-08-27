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
