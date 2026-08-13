import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReasonList } from "./ReasonList";

describe("ReasonList", () => {
  it("renders every reason sentence", () => {
    render(
      <ReasonList
        reasons={[
          { kind: "supporting", text: "82mm rainfall recorded in 24h." },
          { kind: "concerning", text: "No other reports within 500m." },
        ]}
      />,
    );

    expect(screen.getByText("82mm rainfall recorded in 24h.")).toBeInTheDocument();
    expect(screen.getByText("No other reports within 500m.")).toBeInTheDocument();
  });

  it("marks each reason with its kind for assistive technology", () => {
    render(
      <ReasonList reasons={[{ kind: "concerning", text: "No rainfall recorded in 24h." }]} />,
    );

    expect(screen.getByRole("listitem")).toHaveAttribute("data-kind", "concerning");
  });

  it("says so plainly when there is nothing to show", () => {
    render(<ReasonList reasons={[]} />);
    expect(screen.getByText("Wala pang pagsusuri.")).toBeInTheDocument();
  });
});
