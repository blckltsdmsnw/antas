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
 * API, so on every iPhone nothing here happens at all - confirmed on a real
 * device on 2026-08-16, where the hold worked and stayed silent. Every function
 * is therefore a silent no-op when unsupported, and the caller must be correct
 * with no vibration whatsoever. The progress ring is the primary channel and
 * stays that way.
 *
 * Do not go looking for the workaround; it has already been looked for. Safari
 * 17.4 added `<input type="checkbox" switch>`, which plays a haptic when
 * toggled, and libraries drove that from JavaScript by clicking a hidden one.
 * **Apple closed it in iOS 26.5.** It would not be worth restoring even if it
 * still worked: it emits one fixed system haptic, so "press registered" and
 * "signal sent" would feel identical - and the whole point of the second buzz
 * is that it cannot be mistaken for the first.
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
 * One beat at the start of the hold. It asserts nothing beyond the press
 * itself, which is the most that is true at that instant.
 *
 * Fifty milliseconds, raised from twenty after testing on a real Android phone,
 * where twenty was felt as barely anything. A duration is a request, not a
 * guarantee: the motor has to spin up and stop again, so the shortest durations
 * arrive weak or get clamped, and how weak depends entirely on the hardware. A
 * pulse nobody notices is the same as no pulse.
 */
export const PULSE_BEGUN = 50;

/**
 * "It went out."
 *
 * Buzz, gap, buzz - fired only once the signal exists in the database. Two
 * beats rather than one long one so it cannot be mistaken for a second press
 * registering, and so the difference survives being felt through a pocket.
 *
 * Longer beats than the opening tick, deliberately, and not merely for
 * strength: the two must stay tellable apart by feel alone at a moment when
 * nobody is going to be studying the screen. One short tap, two firm beats.
 */
export const PULSE_SENT: readonly number[] = [80, 90, 80];

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
