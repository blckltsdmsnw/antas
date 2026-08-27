import type { Copy } from "@/lib/i18n/strings";
import type { DepthLevel } from "@/lib/depth/scale";

/**
 * Road passability, in the vocabulary the MMDA (Metropolitan Manila
 * Development Authority) already publishes.
 *
 * Antas measures depth against a body; MMDA's Flood Gauge System measures the
 * same water against a vehicle and sorts it into three categories, verbatim:
 *
 *   PATV  - Passable to All Types of Vehicles       8-10 in  (20.3-25.4 cm)
 *           "gutter deep" (8"), "half-knee deep" (10")
 *   NPLV  - Not Passable to Light Vehicles           13-19 in (33-48.3 cm)
 *           "half tire deep" (13"), "knee deep" (19")
 *   NPATV - Not Passable to All Types of Vehicles    26 in and above (66+ cm)
 *           "tire deep" (26"), "waist deep" (37"), "chest deep" (45")
 *
 * These numbers are not invented here - they are MMDA's own inch readings,
 * converted to centimetres and left otherwise untouched.
 *
 * Antas's five body levels do not land on these boundaries exactly, so each
 * level is placed by where its band sits against them:
 *
 *   ankle (0-15cm)        entirely below the 20.3cm PATV floor       -> PATV
 *   knee (16-50cm)        crosses the 25.4cm PATV ceiling and the
 *                         48.3cm NPLV ceiling                        -> NPLV
 *   waist (51-100cm)      crosses the 48.3cm NPLV ceiling and the
 *                         66cm NPATV floor                           -> NPATV
 *   chest (101-140cm)     entirely above the 66cm NPATV floor        -> NPATV
 *   above_head (141cm+)   entirely above the 66cm NPATV floor        -> NPATV
 *
 * STRADDLE RULE: where a band spans more than one MMDA category, this module
 * reports the worse one. That is the same rule `severityOfDepth` and
 * `worstSeverity` already apply to depth itself, and for the same reason: a
 * reassuring answer that turns out wrong is the exact failure this product
 * exists to prevent. So `knee` reads NPLV rather than PATV, and `waist` reads
 * NPATV rather than NPLV.
 */
export type Passability = "PATV" | "NPLV" | "NPATV";

const BY_DEPTH: Readonly<Record<DepthLevel, Passability>> = Object.freeze({
  ankle: "PATV",
  knee: "NPLV",
  waist: "NPATV",
  chest: "NPATV",
  above_head: "NPATV",
});

export function passabilityOfDepth(depth: DepthLevel): Passability {
  return BY_DEPTH[depth];
}

const LABEL_KEY: Readonly<Record<Passability, keyof Copy["map"]>> = Object.freeze({
  PATV: "passPATV",
  NPLV: "passNPLV",
  NPATV: "passNPATV",
});

/** "Madaanan ng lahat ng sasakyan" / "Passable to all vehicles", etc. */
export function passabilityLabel(p: Passability, copy: Copy["map"]): string {
  return copy[LABEL_KEY[p]] as string;
}
