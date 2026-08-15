import type { DepthLevel } from "@/lib/depth/scale";

/**
 * How the depth scale is *shown*. Kept out of `scale.ts`, which stays a pure
 * domain module with no opinion about colour or layout.
 *
 * Two colour maps exist on purpose: MapLibre draws markers on a canvas and
 * cannot resolve CSS custom properties, so it needs literal hex. Everything
 * rendered as DOM uses the variables, so the palette has one source of truth
 * in the stylesheet.
 */
export const DEPTH_HEX: Record<DepthLevel, string> = {
  ankle: "#7dd3fc",
  knee: "#38bdf8",
  waist: "#0284c7",
  chest: "#1e40af",
  above_head: "#581c87",
};

export const DEPTH_VAR: Record<DepthLevel, string> = {
  ankle: "var(--depth-ankle)",
  knee: "var(--depth-knee)",
  waist: "var(--depth-waist)",
  chest: "var(--depth-chest)",
  above_head: "var(--depth-above-head)",
};

/**
 * The words used to live here too - short labels for legends, and the
 * centimetre range as a phrase. They moved to `lib/depth/name.ts` when the
 * product gained a second language, because this module is about colour and
 * should keep having no opinion about language.
 */
