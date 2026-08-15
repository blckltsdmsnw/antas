import type { SosStatus } from "./status";
import type { Copy } from "@/lib/i18n/strings";

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
  /** Which string in `copy.sos` is the heading of the update. */
  headlineKey: keyof Copy["sos"];
  /** Which string says what it means, in the sender's terms. */
  detailKey: keyof Copy["sos"];
  /** Whether the signal is still open, which decides the surrounding copy. */
  open: boolean;
}

/**
 * Keys, not sentences.
 *
 * The wording moved to `strings/sos.ts` when the product gained English, and it
 * had to move as a whole: a fallback here would mean an English reader in
 * rising water getting the one screen whose wording is load-bearing in a
 * language they have told us they cannot read - and it would look like a
 * working page rather than a bug. `dict.ts` makes a missing translation a
 * compile error instead.
 *
 * What stays here is the part that is not language: which statuses are still
 * open, and which are worth announcing.
 */
const PROGRESS: Readonly<Record<SosStatus, SignalProgress>> = Object.freeze({
  pending: {
    headlineKey: "pendingHeadline",
    detailKey: "pendingDetail",
    open: true,
  },
  under_review: {
    headlineKey: "reviewHeadline",
    detailKey: "reviewDetail",
    open: true,
  },
  confirmed: {
    headlineKey: "confirmedHeadline",
    detailKey: "confirmedDetail",
    open: true,
  },
  dismissed: {
    headlineKey: "dismissedHeadline",
    detailKey: "dismissedDetail",
    open: false,
  },
  resolved: {
    headlineKey: "resolvedHeadline",
    detailKey: "resolvedDetail",
    open: false,
  },
});

export function progressFor(status: SosStatus): SignalProgress {
  return PROGRESS[status];
}

/** The two sentences the sender actually reads. */
export function progressText(
  status: SosStatus,
  copy: Copy["sos"],
): { headline: string; detail: string; open: boolean } {
  const { headlineKey, detailKey, open } = PROGRESS[status];
  return {
    headline: copy[headlineKey] as string,
    detail: copy[detailKey] as string,
    open,
  };
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
