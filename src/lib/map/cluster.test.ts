import { describe, it, expect } from "vitest";
import { clusterByProximity, CLUSTER_RADIUS_PX } from "./cluster";
import type { DepthLevel } from "@/lib/depth/scale";

function point(id: string, x: number, y: number, depth: DepthLevel = "knee") {
  return { id, x, y, depth };
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
});
