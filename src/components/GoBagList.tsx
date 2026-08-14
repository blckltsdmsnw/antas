"use client";

import { useEffect, useState } from "react";

/**
 * The go bag, as something you tick off rather than something you read.
 *
 * This is the one idea worth taking verbatim from the mockups. A list of things
 * to pack is advice; a list you can mark off is a task you are part-way
 * through - and it gives the page a reason to be opened twice.
 *
 * STORED LOCALLY, not on an account. Packing a bag is not something the
 * database needs to know, it works while signed out, and - the part that
 * matters for this product - it survives with no signal, which is exactly the
 * condition this page is most likely to be read in.
 */

const STORAGE_KEY = "antas:go-bag";

export interface GoBagItem {
  title: string;
  body: string;
}

interface GoBagListProps {
  items: readonly GoBagItem[];
}

export function GoBagList({ items }: GoBagListProps) {
  const [packed, setPacked] = useState<readonly string[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Read after mount, never during render: the server has no localStorage, and
  // seeding state from it would make the first client render disagree with the
  // HTML that was sent.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setPacked(JSON.parse(saved) as string[]);
    } catch {
      // A blocked or full localStorage is not a reason to hide the checklist.
      // The boxes simply stop remembering, which is a far smaller loss than the
      // page failing to render at all.
    }
    setLoaded(true);
  }, []);

  function toggle(title: string) {
    const next = packed.includes(title)
      ? packed.filter((item) => item !== title)
      : [...packed, title];

    setPacked(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // As above: the tick still holds for this visit.
    }
  }

  const done = items.filter((item) => packed.includes(item.title)).length;

  return (
    <section className="guide-section" aria-labelledby="go-bag">
      <h2 className="guide-heading" id="go-bag">
        Go bag - ihanda bago pa mangyari
      </h2>

      {/* Only once the saved state is known. Rendering "0 sa 4" and then
          correcting it reads as the page forgetting what you packed. */}
      {loaded && (
        <p className="go-bag-count" aria-live="polite">
          {done === items.length
            ? "Kumpleto ang go bag mo."
            : `${done} sa ${items.length} nakahanda.`}
        </p>
      )}

      <ul className="guide-list">
        {items.map((item) => {
          const checked = packed.includes(item.title);
          return (
            <li key={item.title}>
              {/* A real checkbox inside a label, so the whole row is the target
                  and a screen reader announces the state without being told. */}
              <label className="go-bag-item" data-checked={checked}>
                <input
                  type="checkbox"
                  className="go-bag-box"
                  checked={checked}
                  onChange={() => toggle(item.title)}
                />
                <span>
                  <span className="guide-item-title">{item.title}</span>
                  <span className="guide-item-body">{item.body}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
