"use client";

import { useEffect, useState } from "react";
import { useCopy } from "@/lib/i18n/context";

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
  /**
   * Stable, and deliberately not the title.
   *
   * What gets saved used to be the Tagalog title, so translating the checklist
   * would have emptied every packed bag the moment somebody switched language -
   * the page quietly forgetting what you packed, on the screen most likely to
   * be read with no signal. Ids never change; only the words do.
   */
  id: string;
  title: string;
  body: string;
}

/**
 * What those four items used to be saved as.
 *
 * Anybody who packed a bag before this change has Tagalog titles sitting in
 * their browser. Dropping them would be a silent loss for exactly the people
 * who had already done the thing this page asks of them, so they are
 * translated once on read. Safe to delete when no real device can still hold
 * them.
 */
const LEGACY_IDS: Readonly<Record<string, string>> = Object.freeze({
  "Tubig at pagkain": "water",
  "Flashlight at radyo": "light",
  "Gamot at first aid": "medicine",
  "Mahahalagang dokumento": "papers",
});

/**
 * Reads its own copy rather than being handed it.
 *
 * The first attempt passed the heading and a `progress(done, total)` function
 * down from the server component, and React refused outright: functions cannot
 * cross the server/client boundary. That is a real constraint on the whole
 * dictionary design, not a detail of this component - any interpolated phrase
 * has to be *called* on the server or *read* on the client, never passed
 * between them. Client components take the copy; server components take the
 * finished string.
 */
export function GoBagList() {
  const copy = useCopy();
  const [packed, setPacked] = useState<readonly string[]>([]);
  const [loaded, setLoaded] = useState(false);

  const items: readonly GoBagItem[] = [
    {
      id: "water",
      title: copy.guide.goBagWaterTitle,
      body: copy.guide.goBagWaterBody,
    },
    {
      id: "light",
      title: copy.guide.goBagLightTitle,
      body: copy.guide.goBagLightBody,
    },
    {
      id: "medicine",
      title: copy.guide.goBagMedicineTitle,
      body: copy.guide.goBagMedicineBody,
    },
    {
      id: "papers",
      title: copy.guide.goBagPapersTitle,
      body: copy.guide.goBagPapersBody,
    },
  ];

  // Read after mount, never during render: the server has no localStorage, and
  // seeding state from it would make the first client render disagree with the
  // HTML that was sent.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const stored = JSON.parse(saved) as string[];
        setPacked(stored.map((entry) => LEGACY_IDS[entry] ?? entry));
      }
    } catch {
      // A blocked or full localStorage is not a reason to hide the checklist.
      // The boxes simply stop remembering, which is a far smaller loss than the
      // page failing to render at all.
    }
    setLoaded(true);
  }, []);

  function toggle(id: string) {
    const next = packed.includes(id)
      ? packed.filter((item) => item !== id)
      : [...packed, id];

    setPacked(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // As above: the tick still holds for this visit.
    }
  }

  const done = items.filter((item) => packed.includes(item.id)).length;

  return (
    <section className="guide-section" aria-labelledby="go-bag">
      <h2 className="guide-heading" id="go-bag">
        {copy.guide.goBagHeading}
      </h2>

      {/* Only once the saved state is known. Rendering "0 sa 4" and then
          correcting it reads as the page forgetting what you packed. */}
      {loaded && (
        <p className="go-bag-count" aria-live="polite">
          {done === items.length
            ? copy.guide.goBagComplete
            : copy.guide.goBagProgress(done, items.length)}
        </p>
      )}

      <ul className="guide-list">
        {items.map((item) => {
          const checked = packed.includes(item.id);
          return (
            <li key={item.id}>
              {/* A real checkbox inside a label, so the whole row is the target
                  and a screen reader announces the state without being told. */}
              <label className="go-bag-item" data-checked={checked}>
                <input
                  type="checkbox"
                  className="go-bag-box"
                  checked={checked}
                  onChange={() => toggle(item.id)}
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
