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
 * "Still counting. Keep your thumb down."
 *
 * Six beats over the three-second hold, accelerating: 900ms apart at the start,
 * 160ms apart by the end. Read as `[on, off, on, off, ...]`.
 *
 * **This replaced a single beat at the press, and the single beat was wrong.**
 * It was chosen on the reasoning that two distinct events - *begun* and *sent* -
 * carry more than a continuous buzz saying merely "something is happening". True
 * as far as it went, and it missed the actual question the person holding the
 * button has, which is not "did it start" but "is it still going". One tick
 * followed by three seconds of silence answers the first and abandons them on
 * the second: Elijah's words for it were "just one vibrate then nothing after".
 *
 * A ramp is not the continuous buzz that was refused either. It says *how far
 * along*, which is the thing the progress ring says to anybody who can see the
 * ring - and the whole reason this exists is that they may be looking at the
 * water instead. Speeding up is legible without counting.
 *
 * The last beat ends at 2820ms, 180ms clear of the three-second mark. That
 * margin is not slack: firing the SOS calls `stop()`, which cancels any
 * remaining vibration, so a ramp running too close to the end would have its
 * final beat clipped by its own success on a phone having a slow moment.
 * `pulse.test.ts` pins the headroom. Nothing marks the completion itself -
 * that instant is "submitting", not "sent".
 *
 * Beat durations are 80-120ms, not the 20ms this shipped with first and not the
 * 50ms that followed. A duration is a request, not a guarantee - the motor has
 * to spin up and stop again, so short durations arrive weak or get clamped, by
 * an amount that depends entirely on the hardware. Both earlier values were
 * reported as barely there on a real phone.
 */
export const PULSE_HOLD: readonly number[] = [
  80, 700, 80, 620, 90, 460, 100, 300, 110, 160, 120,
];

/**
 * Clearance the ramp must leave before the hold fires.
 *
 * Firing calls `stop()`, which cancels whatever is still playing. Without a
 * margin the ramp's own last beat is the thing that gets cancelled - and it
 * would only show up on a phone under load, which is not where anybody wants to
 * discover it.
 */
export const RAMP_HEADROOM_MS = 100;

/**
 * "It went out."
 *
 * Two firm beats, fired only once the signal exists in the database. Each is
 * longer than any beat in the ramp above, so it cannot be mistaken for the hold
 * still counting - which matters more here than anywhere else, because this is
 * the one pattern that carries news.
 */
export const PULSE_SENT: readonly number[] = [150, 100, 150];

/** How long a pattern takes end to end, including its silences. */
export function patternDurationMs(pattern: readonly number[]): number {
  return pattern.reduce((total, span) => total + span, 0);
}

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
/**
 * Stop anything still playing.
 *
 * Load-bearing now that the hold requests a three-second pattern up front. A
 * person who lifts their thumb at one second has cancelled the SOS, and a phone
 * that carries on ticking in their hand for two more seconds is telling them
 * the opposite - the same lie as a confirming buzz for a signal that never
 * sent, just earlier in the sequence.
 */
export function stopPulse(): void {
  vibrate(0);
}

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
