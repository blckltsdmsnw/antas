import type { Copy } from "@/lib/i18n/strings";

/**
 * Who can be put on an incident. Must match `responder_unit` in 0032.
 *
 * Five, and `other` is last as the fallback. BFP first because a fire is the
 * hazard most likely to need somebody who is not the barangay.
 */
export const RESPONDER_UNITS = [
  "bfp",
  "barangay_rescue",
  "medical",
  "police",
  "other",
] as const;

export type ResponderUnit = (typeof RESPONDER_UNITS)[number];

const LABEL_KEY: Readonly<Record<ResponderUnit, keyof Copy["board"]>> = Object.freeze({
  bfp: "unitBfp",
  barangay_rescue: "unitBarangayRescue",
  medical: "unitMedical",
  police: "unitPolice",
  other: "unitOther",
});

export function isResponderUnit(value: unknown): value is ResponderUnit {
  return typeof value === "string" && (RESPONDER_UNITS as readonly string[]).includes(value);
}

export function unitLabel(unit: ResponderUnit, copy: Copy["board"]): string {
  return copy[LABEL_KEY[unit]] as string;
}
