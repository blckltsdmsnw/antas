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
