export const SOS_STATUSES = [
  "pending",
  "under_review",
  "confirmed",
  "dismissed",
  "resolved",
] as const;

export type SosStatus = (typeof SOS_STATUSES)[number];

/**
 * A signal in one of these states blocks its author from creating another.
 * `dismissed` and `resolved` do not block - someone whose signal was dismissed
 * last week can be in real danger today.
 */
export const ACTIVE_STATUSES = [
  "pending",
  "under_review",
  "confirmed",
] as const satisfies readonly SosStatus[];

const TRANSITIONS: Record<SosStatus, readonly SosStatus[]> = {
  pending: ["under_review", "confirmed", "dismissed"],
  under_review: ["confirmed", "dismissed"],
  // Only a confirmed signal can resolve; resolving something never confirmed
  // would record help arriving for a signal nobody verified.
  confirmed: ["resolved"],
  dismissed: [],
  resolved: [],
};

export function isSosStatus(value: string): value is SosStatus {
  return (SOS_STATUSES as readonly string[]).includes(value);
}

export function isActiveStatus(status: SosStatus): boolean {
  return (ACTIVE_STATUSES as readonly SosStatus[]).includes(status);
}

export function canTransition(from: SosStatus, to: SosStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
