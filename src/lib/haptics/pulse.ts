/**
 * The phone in the hand, for the one control that calls for help.
 *
 * The three-second hold on `/sos` is the only place in this product where
 * somebody has to keep doing something and wait. They may also be looking at
 * the water rather than at the screen, in the rain, at night, with the phone
 * held at an angle where the progress ring is not readable. A buzz reaches them
 * there; a ring does not.
 *
 * Two rules shape everything below.
 *
 * **It is never the only channel.** iOS Safari has never shipped the Vibration
 * API and shows no sign of doing so, so on a large share of the phones this is
 * built for nothing here happens at all. Every function is therefore a silent
 * no-op when unsupported, and the caller must be correct with no vibration
 * whatsoever. The progress ring is the primary channel and stays that way.
 *
 * **It never confirms something that did not happen.** A buzz on this screen is
 * read as news. `design.md` §12 refuses notifications that imply rescue is
 * coming, for the reason that a person in rising water who believes help is on
 * the way waits instead of climbing - and a confirming buzz for an SOS that
 * failed to send is the same harm in a different channel. So the second pulse
 * belongs to the moment the signal is actually written, not to the moment the
 * hold completes, and there is deliberately no pulse on any failure path.
 */

/**
 * "I have your press."
 *
 * One short beat at the start of the hold. It asserts nothing beyond the press
 * itself, which is the most that is true at that instant.
 */
export const PULSE_BEGUN = 20;

/**
 * "It went out."
 *
 * Buzz, gap, buzz - fired only once the signal exists in the database. Two
 * beats rather than one long one so it cannot be mistaken for a second press
 * registering, and so the difference survives being felt through a pocket.
 */
export const PULSE_SENT: readonly number[] = [40, 80, 40];

/** A single duration in milliseconds, or an on/off pattern. */
type Pattern = number | readonly number[];

/**
 * Ask the device to vibrate. Returns whether it actually did.
 *
 * Failure is swallowed on purpose, and this is the one place in the codebase
 * where that is the right call: there is no user-facing consequence to a phone
 * that cannot buzz, and the alternative - an exception thrown from inside
 * `handleConfirm` - would abort an SOS submission over a decoration. The return
 * value exists so tests can tell "declined" from "never asked".
 *
 * Browsers also reject vibration on a document the user has never touched, and
 * some throw rather than returning false. Both calls here happen after a press,
 * so that path should be unreachable; it is handled anyway because the cost of
 * being wrong about it is a failed SOS.
 */
export function vibrate(pattern: Pattern): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.vibrate !== "function") return false;

  try {
    return navigator.vibrate(
      typeof pattern === "number" ? pattern : [...pattern],
    );
  } catch {
    return false;
  }
}
