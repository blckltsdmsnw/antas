import { describe, it, expect } from "vitest";
import { buildSosRow } from "@/lib/sos/row";

describe("buildSosRow", () => {
  it("builds a PostGIS row with longitude before latitude", () => {
    const row = buildSosRow("user-1", {
      lat: 14.65,
      lon: 121.1,
      gpsAccuracyM: 9,
      photoPath: "user-1/abc.jpg",
      note: "nasa bubong kami",
    });

    expect(row).toEqual({
      reporter_id: "user-1",
      location: "SRID=4326;POINT(121.1 14.65)",
      gps_accuracy_m: 9,
      photo_path: "user-1/abc.jpg",
      note: "nasa bubong kami",
    });
  });

  it("keeps a null note null rather than an empty string", () => {
    const row = buildSosRow("user-1", {
      lat: 14.65,
      lon: 121.1,
      gpsAccuracyM: null,
      photoPath: "user-1/abc.jpg",
      note: null,
    });

    expect(row.note).toBeNull();
  });

  it("writes no depth at all", () => {
    const row = buildSosRow("user-1", {
      lat: 14.65,
      lon: 121.1,
      gpsAccuracyM: 9,
      photoPath: "user-1/abc.jpg",
      note: null,
    });

    // Absent, not defaulted. Writing a level nobody chose would put a claim
    // about the water into a record the moderator reads as the sender's own
    // words - and the sender was deliberately never asked for one.
    expect(row).not.toHaveProperty("depth");
  });
});
