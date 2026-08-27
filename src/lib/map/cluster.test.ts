import { describe, it, expect } from "vitest";
import { clusterByProximity, CLUSTER_RADIUS_PX } from "./cluster";
import type { DepthLevel } from "@/lib/depth/scale";
import { severityOfDepth } from "@/lib/hazard/severity";

// Severity is derived from depth, exactly as `set_report_severity()` (0028)
// and severity.ts do for real reports. A fixture that hardcoded severity
// independent of depth would let a cluster's worst-severity selection and its
// depth silently disagree about which member is "worst" - the same class of
// bug this file exists to catch.
function point(id: string, x: number, y: number, depth: DepthLevel = "knee") {
  return { id, x, y, depth, hazard: "flood" as const, severity: severityOfDepth(depth) };
}

describe("clusterByProximity", () => {
  it("leaves well-separated pins alone", () => {
    const clusters = clusterByProximity(
      [point("a", 0, 0), point("b", 500, 500)],
      CLUSTER_RADIUS_PX,
    );

    expect(clusters).toHaveLength(2);
    expect(clusters.every((c) => c.members.length === 1)).toBe(true);
  });

  it("merges pins that sit on top of each other", () => {
    const clusters = clusterByProximity(
      [point("a", 100, 100), point("b", 105, 103), point("c", 110, 98)],
      CLUSTER_RADIUS_PX,
    );

    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toHaveLength(3);
  });

  it("takes the depth of its deepest member, never an average", () => {
    // The rule that matters. Eleven ankle-deep reports and one above-head one
    // must not average into a pale blue dot saying the street is fine.
    const clusters = clusterByProximity(
      [
        point("a", 100, 100, "ankle"),
        point("b", 104, 102, "above_head"),
        point("c", 108, 99, "ankle"),
      ],
      CLUSTER_RADIUS_PX,
    );

    expect(clusters).toHaveLength(1);
    expect(clusters[0].depth).toBe("above_head");
  });

  it("positions a cluster at the centre of its members", () => {
    const clusters = clusterByProximity(
      [point("a", 100, 200), point("b", 120, 220)],
      CLUSTER_RADIUS_PX,
    );

    expect(clusters[0].x).toBe(110);
    expect(clusters[0].y).toBe(210);
  });

  it("does not merge across the radius boundary", () => {
    const clusters = clusterByProximity(
      [point("a", 0, 0), point("b", CLUSTER_RADIUS_PX + 1, 0)],
      CLUSTER_RADIUS_PX,
    );

    expect(clusters).toHaveLength(2);
  });

  it("keeps a single member's own identity", () => {
    // A lone pin must still be openable, and the detail card needs its id.
    const clusters = clusterByProximity([point("solo", 10, 10)], CLUSTER_RADIUS_PX);

    expect(clusters[0].members[0].id).toBe("solo");
    expect(clusters[0].members).toHaveLength(1);
  });

  it("produces the same grouping whatever order the pins arrive in", () => {
    // Reports arrive ordered by distance from the map centre, which changes as
    // the user pans. Clusters visibly reshuffling on every pan would look like
    // a bug even though the data never changed.
    const pins = [
      point("a", 100, 100),
      point("b", 108, 104),
      point("c", 400, 400),
      point("d", 405, 396),
    ];
    const forward = clusterByProximity(pins, CLUSTER_RADIUS_PX);
    const reversed = clusterByProximity([...pins].reverse(), CLUSTER_RADIUS_PX);

    const shape = (cs: ReturnType<typeof clusterByProximity>) =>
      cs
        .map((c) =>
          c.members
            .map((m) => m.id)
            .sort()
            .join("+"),
        )
        .sort()
        .join(" | ");

    expect(shape(reversed)).toBe(shape(forward));
  });

  it("returns nothing for no pins", () => {
    expect(clusterByProximity([], CLUSTER_RADIUS_PX)).toEqual([]);
  });

  it("gives every cluster a key that survives a re-render", () => {
    const clusters = clusterByProximity(
      [point("a", 100, 100), point("b", 104, 102)],
      CLUSTER_RADIUS_PX,
    );

    expect(clusters[0].key).toBeTruthy();
    expect(typeof clusters[0].key).toBe("string");
  });

  it("takes the cluster's worst severity, never an average", () => {
    const [cluster] = clusterByProximity([
      { id: "a", key: "a", x: 0, y: 0, severity: 1, hazard: "flood", depth: "ankle" },
      { id: "b", key: "b", x: 2, y: 2, severity: 3, hazard: "fire", depth: null },
    ]);
    expect(cluster.severity).toBe(3);
  });

  it("labels a mixed cluster by its worst member's hazard", () => {
    const [cluster] = clusterByProximity([
      { id: "a", key: "a", x: 0, y: 0, severity: 1, hazard: "flood", depth: "ankle" },
      { id: "b", key: "b", x: 2, y: 2, severity: 3, hazard: "fire", depth: null },
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

  it("has no depth once the worst member is not flood", () => {
    const [cluster] = clusterByProximity([
      { id: "a", key: "a", x: 0, y: 0, severity: 1, hazard: "flood", depth: "ankle" },
      { id: "b", key: "b", x: 2, y: 2, severity: 3, hazard: "fire", depth: null },
    ]);
    expect(cluster.depth).toBeNull();
  });

  it("picks the deeper flood when two members tie at the worst severity", () => {
    // chest and above_head are both severity 3 - the tie the naive
    // `find(m => m.severity === severity)` resolves by sort order, not depth.
    // "a" sorts before "b", so a buggy pick would report "chest" and hide the
    // above-head reading behind a shallower, reassuring number.
    const clusters = clusterByProximity(
      [point("a", 100, 100, "chest"), point("b", 104, 102, "above_head")],
      CLUSTER_RADIUS_PX,
    );

    expect(clusters).toHaveLength(1);
    expect(clusters[0].depth).toBe("above_head");
  });

  it("picks the deeper flood at the shallow end of a severity tie too", () => {
    // ankle and knee are both severity 1 - same failure mode, other end of
    // the scale.
    const clusters = clusterByProximity(
      [point("a", 100, 100, "ankle"), point("b", 104, 102, "knee")],
      CLUSTER_RADIUS_PX,
    );

    expect(clusters).toHaveLength(1);
    expect(clusters[0].depth).toBe("knee");
  });

  it("keeps hazard, severity and depth describing the same worst member, even when that member is flood in a mixed cluster", () => {
    // The case three separate checks missed: a chest-deep flood (severity 3)
    // clustered with a smoky fire (severity 1). The worst member is the flood
    // report, so the cluster must describe THAT one report consistently -
    // never "flood" hazard paired with a null depth, which sends every reader
    // (FloodMap's aria-label, StreetHistory) into severityWord("flood", ...),
    // which throws by design.
    const [cluster] = clusterByProximity([
      { id: "a", key: "a", x: 0, y: 0, severity: 3, hazard: "flood", depth: "chest" },
      { id: "b", key: "b", x: 2, y: 2, severity: 1, hazard: "fire", depth: null },
    ]);
    expect(cluster.hazard).toBe("flood");
    expect(cluster.severity).toBe(3);
    expect(cluster.depth).toBe("chest");
  });
});
