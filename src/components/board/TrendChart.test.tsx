import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrendChart } from "./TrendChart";

describe("TrendChart", () => {
  it("says so when there is nothing to draw", () => {
    render(<TrendChart graph={{ hours: [], barangays: [] }} />);
    expect(screen.getByText("Walang insidente sa nakaraang 48 oras.")).toBeInTheDocument();
  });

  it("draws one bar per hour with a segment per hazard, and a legend naming each hue", () => {
    const hour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    render(
      <TrendChart
        graph={{
          hours: [
            { hour, hazard: "flood", count: 2 },
            { hour, hazard: "fire", count: 1 },
          ],
          barangays: [],
        }}
      />,
    );
    expect(screen.getAllByTestId("trend-segment")).toHaveLength(2);
    expect(screen.getByText("Baha")).toBeInTheDocument();
    expect(screen.getByText("Sunog")).toBeInTheDocument();
  });

  it("offers the same numbers as a table", async () => {
    const hour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    render(<TrendChart graph={{ hours: [{ hour, hazard: "flood", count: 2 }], barangays: [] }} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ipakita bilang talahanayan" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
  });
});
