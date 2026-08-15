import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PageSkeleton } from "./PageSkeleton";

/**
 * The skeleton has one property the rest of the product depends on, and it is
 * not visual: it must contain **no words**.
 *
 * A `loading.tsx` that reads the language cookie cannot be prerendered, and an
 * un-prerendered fallback cannot be prefetched - which is the entire reason the
 * fallback exists. So the moment somebody "improves" this by adding
 * "Loading...", they either break prefetching or ship one language's word to
 * both. Neither failure is visible by looking at the page.
 *
 * The e2e suite cannot cover it: in production the route is prefetched and the
 * fallback is skipped, so there is nothing on screen to assert against.
 */
describe("PageSkeleton", () => {
  it("renders no text at all", () => {
    const { container } = render(<PageSkeleton blocks={4} />);
    expect(container.textContent?.trim()).toBe("");
  });

  it("is hidden from assistive technology", () => {
    // The bars are decoration. Announcing them would either say nothing useful
    // or say it in a language this file had to guess. The real page announces
    // itself when it arrives, which is the honest moment to speak.
    const { container } = render(<PageSkeleton />);
    expect(container.querySelector("main")).toHaveAttribute("aria-hidden", "true");
  });

  it("stands in the same box as a real task page", () => {
    // Same container class, so the fallback and the page replacing it occupy
    // the same column with the same padding. A skeleton that does not match the
    // thing it stands in for trades one kind of roughness for another.
    const { container } = render(<PageSkeleton />);
    expect(container.querySelector("main")).toHaveClass("task-page");
  });

  it("draws the number of blocks asked for", () => {
    const { container } = render(<PageSkeleton blocks={2} />);
    expect(container.querySelectorAll(".skeleton-block")).toHaveLength(2);
  });

  it("can drop the lede for pages whose title stands alone", () => {
    const { container } = render(<PageSkeleton blocks={1} lede={false} />);
    expect(container.querySelectorAll(".skeleton-lede")).toHaveLength(0);
    // The title band stays - every page has one.
    expect(container.querySelector(".skeleton-title")).toBeInTheDocument();
  });
});
