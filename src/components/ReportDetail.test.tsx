import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReportDetail } from "./ReportDetail";
import type { MapReport } from "./FloodMap";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const baseReport: MapReport = {
  id: "1",
  lat: 14.65,
  lon: 121.1,
  hazard: "flood",
  severity: 2,
  depth: "waist",
  photoPath: null,
  reportedAt: "2026-08-01T00:00:00Z",
};

describe("ReportDetail passability", () => {
  it("shows the MMDA passability verdict, its source, and the walking caution for a flood report", () => {
    render(<ReportDetail report={baseReport} onClose={vi.fn()} />);

    // waist maps to NPATV: "Hindi madaanan ng anumang sasakyan"
    expect(screen.getByText("Hindi madaanan ng anumang sasakyan")).toBeInTheDocument();
    expect(screen.getByText(/MMDA Flood Gauge System/i)).toBeInTheDocument();
    expect(
      screen.getByText("Hindi ito gabay sa naglalakad. Delikado ang umaagos na tubig kahit mababa."),
    ).toBeInTheDocument();
  });

  it("renders no passability verdict for a non-flood hazard", () => {
    const fireReport: MapReport = {
      ...baseReport,
      hazard: "fire",
      depth: null,
    };

    render(<ReportDetail report={fireReport} onClose={vi.fn()} />);

    expect(screen.queryByText(/MMDA Flood Gauge System/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText("Hindi ito gabay sa naglalakad. Delikado ang umaagos na tubig kahit mababa."),
    ).not.toBeInTheDocument();
  });
});
