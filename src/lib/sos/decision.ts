import type { Copy } from "@/lib/i18n/strings";

export const DISMISS_REASONS = [
  "false_report",
  "duplicate",
  "resolved_already",
  "insufficient_info",
] as const;

export type DismissReason = (typeof DISMISS_REASONS)[number];

/** Three fabricated reports suspend an account. Disclosed at onboarding:
 *  visible accountability deters better than hidden accountability. */
export const SUSPENSION_THRESHOLD = 3;

const LABEL_KEY: Record<DismissReason, keyof Copy["screens"]> = {
  false_report: "dismissFalse",
  duplicate: "dismissDuplicate",
  resolved_already: "dismissResolved",
  insufficient_info: "dismissInsufficient",
};

export function isDismissReason(value: string): value is DismissReason {
  return (DISMISS_REASONS as readonly string[]).includes(value);
}

/**
 * Only fabrication counts. Dismissing a duplicate, or a signal where help
 * already arrived, says nothing bad about the reporter - penalising those
 * would punish people for reporting a real flood somebody else reported first.
 */
export function countsTowardSuspension(reason: DismissReason): boolean {
  return reason === "false_report";
}

export function shouldSuspend(falseReportCount: number): boolean {
  return falseReportCount >= SUSPENSION_THRESHOLD;
}

export function dismissReasonLabel(
  reason: DismissReason,
  copy: Copy["screens"],
): string {
  return copy[LABEL_KEY[reason]] as string;
}
