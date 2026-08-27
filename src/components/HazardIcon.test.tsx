import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HazardIcon } from "./HazardIcon";
import { HAZARDS } from "@/lib/hazard/types";

describe("HazardIcon", () => {
  it("renders a glyph for every hazard", () => {
    for (const h of HAZARDS) {
      const { container } = render(<HazardIcon hazard={h} size="md" />);
      expect(container.querySelector("svg")).not.toBeNull();
    }
  });

  it("is hidden from screen readers when it has no title", () => {
    // The word is always beside it in the picker and on cards, so the glyph
    // is decoration there. Announcing "fire" twice is noise.
    const { container } = render(<HazardIcon hazard="fire" size="sm" />);
    expect(container.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("is announced when given a title, as on a map pin", () => {
    const { container } = render(<HazardIcon hazard="fire" size="sm" title="Sunog" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBeNull();
    expect(svg.querySelector("title")!.textContent).toBe("Sunog");
  });
});
