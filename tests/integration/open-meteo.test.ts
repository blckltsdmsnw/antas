// @vitest-environment node

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
