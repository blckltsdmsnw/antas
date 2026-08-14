import type { SosStatus } from "./status";

/**
 * What the SENDER is told about their own signal.
 *
 * Separate from `status.ts`, which is machine logic, and from `decision.ts`,
 * which is moderator-facing. This is the one place in the product that speaks
 * to a person who may still be standing in water, so the wording is the
 * dangerous part, and it lives somewhere it can be read and tested on its own.
 *
 * THE RULE EVERY LINE HERE OBEYS: report what happened, never what will happen.
 * "Binuksan na ito ng barangay" is a fact about a person having read something.
 * "May paparating na tulong" would be a promise this system cannot keep, and it
 * is the exact sentence that makes somebody wait instead of climbing. Antas
 * dispatches nobody, and no line here may imply otherwise.
 */

export interface SignalProgress {
  /** Short line, shown as the heading of the update. */
  headline: string;
  /** What it means, in the sender's terms. */
  detail: string;
  /** Whether the signal is still open, which decides the surrounding copy. */
  open: boolean;
}

const PROGRESS: Readonly<Record<SosStatus, SignalProgress>> = Object.freeze({
  pending: {
    headline: "Naipadala na, hindi pa nabubuksan",
    // Said plainly rather than dressed up as "processing". Nobody is watching a
    // queue here, and implying somebody is would be the whole problem.
    detail:
      "Nasa listahan na ito ng barangay. Wala pang nakakabukas nito ngayon.",
    open: true,
  },
  under_review: {
    headline: "Binuksan na ito ng barangay",
    // The strongest thing that can honestly be said, and deliberately about
    // reading rather than responding.
    detail:
      "May nagbukas ng report mo. Hindi ito nangangahulugang may paparating na tulong.",
    open: true,
  },
  confirmed: {
    headline: "Kinumpirma ng barangay",
    // "Credible", not "help is coming". A moderator judging a signal real is a
    // statement about the signal, never a dispatch.
    detail:
      "Tinasa nilang totoo ang report mo. Hindi pa rin ito nangangahulugang may susundo sa iyo.",
    open: true,
  },
  dismissed: {
    headline: "Hindi itinuloy ang report na ito",
    detail:
      "Sinuri ito ng barangay at hindi itinuloy. Kung nasa panganib ka pa rin, tumawag sa 911.",
    open: false,
  },
  resolved: {
    headline: "Markado nang tapos",
    detail: "Isinara na ito ng barangay.",
    open: false,
  },
});

export function progressFor(status: SosStatus): SignalProgress {
  return PROGRESS[status];
}

/**
 * Whether this status is worth interrupting somebody with.
 *
 * `pending` is the state every signal starts in, so announcing it says nothing
 * - the sender already watched it send. Everything else represents a person
 * having actually done something.
 */
export function isNews(status: SosStatus): boolean {
  return status !== "pending";
}
