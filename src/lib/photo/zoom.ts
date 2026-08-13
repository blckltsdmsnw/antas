/**
 * Zoom and pan arithmetic for the full-screen photo viewer.
 *
 * Kept out of the component because gesture handling is where this kind of code
 * usually goes wrong, and pointer events are miserable to drive in a test. The
 * component is left holding only the event plumbing.
 */

/** Fitted to the screen. Below this the image floats with gaps around it. */
export const MIN_SCALE = 1;

/**
 * Past roughly 4x a phone photo is showing its own compression rather than the
 * water, so more zoom stops adding information.
 */
export const MAX_SCALE = 4;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Straight-line distance between two pointers, for pinch tracking. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * New scale after a pinch, relative to where the gesture started.
 *
 * Both distances come from the same gesture, so the ratio is what matters
 * rather than either absolute value.
 */
export function pinchScale(
  startScale: number,
  startDistance: number,
  currentDistance: number,
): number {
  // Two pointers on the same pixel is rare but not impossible, and dividing by
  // it yields Infinity - which renders as a blank screen, not as a big image.
  if (startDistance <= 0) return clampScale(startScale);
  return clampScale((startScale * currentDistance) / startDistance);
}

/**
 * Keeps the image covering the viewport, so panning can never drag empty space
 * into view.
 *
 * The slack in each axis is however much the scaled image overflows, halved,
 * because the image is centred rather than anchored top-left.
 */
export function clampOffset(offset: Point, scale: number, viewport: Size): Point {
  const slackX = Math.max(0, (viewport.width * scale - viewport.width) / 2);
  const slackY = Math.max(0, (viewport.height * scale - viewport.height) / 2);

  return {
    x: noNegativeZero(Math.min(slackX, Math.max(-slackX, offset.x))),
    y: noNegativeZero(Math.min(slackY, Math.max(-slackY, offset.y))),
  };
}

/**
 * Clamping a negative drag against zero slack yields -0, which is arithmetically
 * equal to 0 but stringifies into a transform as "-0px". Harmless to render,
 * confusing to read in devtools.
 */
function noNegativeZero(value: number): number {
  return value === 0 ? 0 : value;
}
