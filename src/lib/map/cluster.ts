import { depthRank, type DepthLevel } from "@/lib/depth/scale";
import type { HazardType, Severity } from "@/lib/hazard/types";
import { worstSeverity } from "@/lib/hazard/severity";

/**
 * Screen-space clustering for map pins.
 *
 * Works in pixels rather than degrees on purpose: whether two pins collide is a
 * question about the screen, not about the world. Two reports 200m apart
 * overlap completely at city zoom and are comfortably separate at street zoom,
 * and a threshold in metres cannot express that.
 */

export interface Clusterable {
  id: string;
  x: number;
  y: number;
  hazard: HazardType;
  severity: Severity;
  depth: DepthLevel | null;
}

export interface Cluster<T extends Clusterable = Clusterable> {
  /** Stable across re-renders so markers are not torn down every frame. */
  key: string;
  x: number;
  y: number;
  /** The worst member's severity - never an average. See `worstSeverity`. */
  severity: Severity;
  /** The hazard of the member carrying that worst severity. The deterministic
   *  sort makes the tie stable when more than one member ties for it. */
  hazard: HazardType;
  /** The deepest member's level - never an average - but ONLY when every
   *  member is a flood report. See `deepestOf`. A mixed cluster carries no
   *  depth at all: a water stain under a fire would be a lie. */
  depth: DepthLevel | null;
  members: T[];
}

/**
 * Slightly under the 48px touch target: pins closer together than this cannot
 * be reliably tapped apart, which is exactly when they should merge.
 */
export const CLUSTER_RADIUS_PX = 44;

/**
 * Groups pins that are too close to tap individually.
 *
 * Greedy single-pass assignment. With a few hundred pins on screen this is
 * comfortably fast, and it has the property that matters more than optimality:
 * it is deterministic. The input is sorted first, so panning the map - which
 * changes the order rows come back in - cannot reshuffle the grouping and make
 * clusters appear to jump between pins.
 */
export function clusterByProximity<T extends Clusterable>(
  items: T[],
  radiusPx: number = CLUSTER_RADIUS_PX,
): Cluster<T>[] {
  const ordered = [...items].sort((a, b) =>
    a.x === b.x ? (a.y === b.y ? a.id.localeCompare(b.id) : a.y - b.y) : a.x - b.x,
  );

  const clusters: { x: number; y: number; members: T[] }[] = [];

  for (const item of ordered) {
    // Measured against the cluster's running centre, so a chain of pins each
    // just inside the radius cannot smear into one enormous blob.
    const home = clusters.find(
      (cluster) => Math.hypot(cluster.x - item.x, cluster.y - item.y) <= radiusPx,
    );

    if (home) {
      home.members.push(item);
      home.x = mean(home.members.map((member) => member.x));
      home.y = mean(home.members.map((member) => member.y));
    } else {
      clusters.push({ x: item.x, y: item.y, members: [item] });
    }
  }

  return clusters.map((cluster) => {
    const severity = worstSeverity(cluster.members.map((member) => member.severity));
    // First member at the worst severity, in the deterministic sorted order
    // `cluster.members` already carries - so a tie always resolves the same way.
    const worst = cluster.members.find((member) => member.severity === severity)!;
    const allFlood = cluster.members.every((member) => member.hazard === "flood");

    return {
      key: cluster.members
        .map((member) => member.id)
        .sort()
        .join(","),
      x: cluster.x,
      y: cluster.y,
      severity,
      hazard: worst.hazard,
      depth: allFlood ? deepestOf(cluster.members) : null,
      members: cluster.members,
    };
  });
}

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * The worst case wins.
 *
 * Averaging would be actively dangerous: eleven ankle-deep reports and one
 * above-head report would render pale blue, and the map would tell someone a
 * street is passable at the exact moment it is not. Same rule the street
 * history uses for "Pinakamalalim".
 *
 * Only ever called once every member is known to be flood, so each member's
 * depth is guaranteed non-null - the cast below is that guarantee, not an
 * assumption.
 */
function deepestOf(members: readonly Clusterable[]): DepthLevel {
  return members.reduce<DepthLevel>(
    (worst, member) =>
      member.depth !== null && depthRank(member.depth) > depthRank(worst)
        ? member.depth
        : worst,
    members[0].depth as DepthLevel,
  );
}
