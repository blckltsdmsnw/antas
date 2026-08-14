/**
 * Emergency numbers, kept as data so they can be corrected without touching a
 * page - and so it is obvious at a glance exactly which numbers this
 * application is telling people to call.
 *
 * ONLY VERIFIED NUMBERS BELONG HERE.
 *
 * A wrong number on this list is not a typo, it is a person dialling into
 * nothing during a flood. Nothing goes in from memory. `911` is the
 * Philippines' national emergency hotline and is stable and universally
 * published; local DRRMO desk numbers change, and are left to be added by
 * someone who has checked them against the LGU's own current publication.
 *
 * The empty local list is deliberate and is rendered honestly - the guide says
 * that local numbers have not been added yet, rather than quietly showing the
 * national line alone as though that were the complete answer.
 */

export interface EmergencyContact {
  /** What the reader dials. Kept exactly as published. */
  number: string;
  /** Who answers. */
  name: string;
  /** What they do, in the reader's terms. */
  role: string;
  /** Where the number came from, so it can be re-checked later. */
  source: string;
}

/**
 * National, and stable. Emergency 911 has been the Philippines' single
 * nationwide emergency hotline since 2016.
 */
export const NATIONAL_CONTACTS: readonly EmergencyContact[] = [
  {
    number: "911",
    name: "Emergency 911",
    role: "Pambansang emergency hotline - pulis, bumbero, medikal, rescue",
    source: "Philippine national emergency hotline",
  },
];

/**
 * Barangay and city disaster desks for the pilot areas.
 *
 * Empty on purpose. These must be copied from the LGU's current published list
 * by someone who can verify them; tracked in `docs/STATUS.md`. Until then the
 * guide says so plainly instead of implying the national line is the whole
 * list.
 */
export const LOCAL_CONTACTS: readonly EmergencyContact[] = [];
