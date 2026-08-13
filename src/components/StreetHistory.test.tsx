import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { StreetHistory } from "./StreetHistory";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

function mockRpc(data: unknown) {
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  mockedCreateClient.mockReturnValue({
    rpc,
  } as unknown as ReturnType<typeof createClient>);
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StreetHistory", () => {
  it("shows the prompt and makes no query when point is null", () => {
    const rpc = mockRpc([]);

    render(<StreetHistory point={null} />);

    expect(
      screen.getByText("Pindutin ang mapa para makita ang kasaysayan."),
    ).toBeInTheDocument();
    expect(mockedCreateClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("shows the empty-history message when there are no nearby reports", async () => {
    mockRpc([]);

    render(<StreetHistory point={{ lat: 14.65, lon: 121.1 }} />);

    expect(
      await screen.findByText("Walang naitalang baha sa lugar na ito."),
    ).toBeInTheDocument();
  });

  it("renders the count heading and shows the deepest report by rank, not alphabetically", async () => {
    // "above_head" must alphabetically sort before "chest", so a naive
    // string comparison would incorrectly pick "chest" as the deepest.
    mockRpc([
      {
        id: "1",
        depth: "chest",
        reported_at: "2026-08-01T00:00:00Z",
        lat: 14.65,
        lon: 121.1,
        distance_m: 10,
      },
      {
        id: "2",
        depth: "above_head",
        reported_at: "2026-08-02T00:00:00Z",
        lat: 14.65,
        lon: 121.1,
        distance_m: 20,
      },
      {
        id: "3",
        depth: "ankle",
        reported_at: "2026-08-03T00:00:00Z",
        lat: 14.65,
        lon: 121.1,
        distance_m: 30,
      },
    ]);

    render(<StreetHistory point={{ lat: 14.65, lon: 121.1 }} />);

    expect(
      await screen.findByRole("heading", { name: "3 report sa lugar na ito" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Pinakamalalim: Lampas ulo"),
    ).toBeInTheDocument();
  });

  it("calls the RPC with the given lat/lon and a 150 m radius", async () => {
    const rpc = mockRpc([]);

    render(<StreetHistory point={{ lat: 14.63, lon: 121.09 }} />);

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith("reports_near", {
        lat: 14.63,
        lon: 121.09,
        radius_m: 150,
      });
    });
  });
});
