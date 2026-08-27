import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

    render(<StreetHistory point={null} onSelect={vi.fn()} />);

    expect(
      screen.getByText("Pindutin ang mapa para makita ang kasaysayan."),
    ).toBeInTheDocument();
    expect(mockedCreateClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("shows the empty-history message when there are no nearby reports", async () => {
    mockRpc([]);

    render(<StreetHistory point={{ lat: 14.65, lon: 121.1 }} onSelect={vi.fn()} />);

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
        hazard_type: "flood",
        severity: 3,
        depth: "chest",
        reported_at: "2026-08-01T00:00:00Z",
        lat: 14.65,
        lon: 121.1,
        distance_m: 10,
      },
      {
        id: "2",
        hazard_type: "flood",
        severity: 3,
        depth: "above_head",
        reported_at: "2026-08-02T00:00:00Z",
        lat: 14.65,
        lon: 121.1,
        distance_m: 20,
      },
      {
        id: "3",
        hazard_type: "flood",
        severity: 1,
        depth: "ankle",
        reported_at: "2026-08-03T00:00:00Z",
        lat: 14.65,
        lon: 121.1,
        distance_m: 30,
      },
    ]);

    render(<StreetHistory point={{ lat: 14.65, lon: 121.1 }} onSelect={vi.fn()} />);

    expect(
      await screen.findByRole("heading", { name: "3 report sa lugar na ito" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Pinakamalalim: Lampas ulo"),
    ).toBeInTheDocument();
  });

  it("reads the deepest report by its own depth even when a fire on the same street outranks nothing", async () => {
    // Regression: a chest-deep flood (severity 3) clustered on a street with a
    // smoky fire (severity 1). The flood is the worst report, so `worst` here
    // is a flood row, and rendering it must go through `depthName`, never
    // `severityWord("flood", ...)` - which throws by design. See cluster.ts.
    mockRpc([
      {
        id: "1",
        hazard_type: "flood",
        severity: 3,
        depth: "chest",
        reported_at: "2026-08-01T00:00:00Z",
        photo_path: null,
        lat: 14.65,
        lon: 121.1,
        distance_m: 10,
      },
      {
        id: "2",
        hazard_type: "fire",
        severity: 1,
        depth: null,
        reported_at: "2026-08-02T00:00:00Z",
        photo_path: null,
        lat: 14.65,
        lon: 121.1,
        distance_m: 20,
      },
    ]);

    render(<StreetHistory point={{ lat: 14.65, lon: 121.1 }} onSelect={vi.fn()} />);

    expect(await screen.findByText("Pinakamalalim: Hanggang dibdib")).toBeInTheDocument();
  });

  it("opens a report when its row is pressed, passing the photo through", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    mockRpc([
      {
        id: "42",
        hazard_type: "flood",
        severity: 2,
        depth: "waist",
        reported_at: "2026-08-01T00:00:00Z",
        photo_path: "user-1/1755100000000.jpg",
        lat: 14.65,
        lon: 121.1,
        distance_m: 10,
      },
    ]);

    render(<StreetHistory point={{ lat: 14.65, lon: 121.1 }} onSelect={onSelect} />);
    await user.click(await screen.findByRole("button", { name: /Hanggang baywang/ }));

    // The row hands over a MapReport, camelCased - the detail card and the map
    // markers share that shape, so a row and a pin open the identical card.
    expect(onSelect).toHaveBeenCalledWith({
      id: "42",
      hazard: "flood",
      severity: 2,
      depth: "waist",
      lat: 14.65,
      lon: 121.1,
      photoPath: "user-1/1755100000000.jpg",
      reportedAt: "2026-08-01T00:00:00Z",
    });
  });

  it("calls the RPC with the given lat/lon and a 150 m radius", async () => {
    const rpc = mockRpc([]);

    render(<StreetHistory point={{ lat: 14.63, lon: 121.09 }} onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith("reports_near", {
        lat: 14.63,
        lon: 121.09,
        radius_m: 150,
      });
    });
  });
});
