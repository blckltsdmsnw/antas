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
 * national lines alone as though that were the complete answer.
 */

/**
 * One dialable line.
 *
 * `published` and `dial` are stored separately and never derived from each
 * other. Agencies publish trunk lines as prose - "8911-5061 to 65 local 100" -
 * and parsing that into something dialable means guessing at a range and an
 * extension. The reader sees exactly what the agency printed; the link dials
 * one specific number that a person checked.
 */
export interface EmergencyLine {
  /** Exactly as the agency publishes it, prose and all. */
  published: string;
  /** What `tel:` dials. One number. No ranges, no extensions, no spaces. */
  dial: string;
}

export interface EmergencyContact {
  /** Who answers. */
  name: string;
  /** What they do, in the reader's terms. */
  role: string;
  /**
   * How loudly this desk is drawn.
   *
   * `primary` is reserved for a number that dispatches rescue. Everything else
   * is `secondary`, however important it is institutionally.
   *
   * This exists because the page got it wrong once. Adding the NDRRMC's five
   * trunk lines gave that desk five large filled buttons against 911's one, so
   * the loudest thing on a safety screen became the number that coordinates
   * rather than the number that comes. The role text said as much in words, and
   * words lose: somebody scanning this page while water rises presses the
   * biggest blue thing. Emphasis is therefore data, not a side effect of how
   * many lines a desk happens to publish.
   */
  emphasis: "primary" | "secondary";
  /**
   * Every published line for this desk, best first. Trunk lines matter here:
   * during a disaster the first number is the one that is already busy.
   */
  lines: readonly EmergencyLine[];
  /** Where the numbers came from, so they can be re-checked later. */
  source: string;
}

/**
 * National, and stable.
 *
 * 911 stays first because it is the number that dispatches rescue. The NDRRMC
 * operations centre below it coordinates the national response - a real,
 * published, staffed line, but not a faster route to a boat than 911 is. The
 * role text says so, rather than letting a reader in rising water pick
 * whichever they reach first.
 */
export const NATIONAL_CONTACTS: readonly EmergencyContact[] = [
  {
    name: "Emergency 911",
    role: "Pambansang emergency hotline - pulis, bumbero, medikal, rescue. Ito ang tawagan kung may nanganganib ngayon.",
    emphasis: "primary",
    lines: [{ published: "911", dial: "911" }],
    source: "Philippine national emergency hotline",
  },
  {
    name: "NDRRMC Operations Center",
    role: "Pambansang tanggapan sa sakuna - nagko-koordina ng tugon at nagbibigay ng impormasyon. Hindi ito ang pinakamabilis na daan sa rescue; mas mabilis ang 911 at ang inyong barangay.",
    emphasis: "secondary",
    lines: [
      { published: "(02) 8911-5061 to 65 local 100", dial: "+63289115061" },
      { published: "(02) 8911-1406", dial: "+63289111406" },
      { published: "(02) 8912-2665", dial: "+63289122665" },
      { published: "(02) 8912-5668", dial: "+63289125668" },
      { published: "(02) 8911-1873", dial: "+63289111873" },
    ],
    source:
      "NDRRMC published hotline list, supplied by the project owner 2026-08-15. Re-check against the NDRRMC's own current publication before any real deployment - these were not independently verified here.",
  },
];

/**
 * Barangay and city disaster desks for the pilot areas.
 *
 * Still empty, and still on purpose. The NDRRMC numbers above are national and
 * do not fill this gap: a Marikina resident needs the Marikina DRRMO desk, and
 * a national operations centre cannot tell them which street is passable. These
 * must be copied from the LGU's current published list by someone who can
 * verify them; tracked in `docs/STATUS.md`. Until then the guide says so
 * plainly instead of implying the national lines are the whole list.
 */
export const LOCAL_CONTACTS: readonly EmergencyContact[] = [];
