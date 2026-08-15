"use client";

import { useCopy } from "@/lib/i18n/context";

/**
 * Present on every console screen, not once at sign-in. Somebody who leaves
 * this open on a desk must not be able to forget what it is.
 */
export function SimulationBanner() {
  const copy = useCopy();

  return (
    <p className="sim-banner" role="note">
      <strong>{copy.screens.demoOnly}</strong> {copy.screens.demoBanner}
    </p>
  );
}
