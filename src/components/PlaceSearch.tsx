"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCopy } from "@/lib/i18n/context";

/**
 * Find your own barangay without panning the region.
 *
 * The map opens over the whole of Metro Manila, and the question this product
 * answers is "has MY street flooded". Making someone pinch their way across NCR
 * to reach their own street is the longest route to the shortest answer, and it
 * was the largest usability gap in the application.
 *
 * Backed by `search_places`, which reads the barangays table that already
 * exists to route SOS signals - so this introduces no second source of truth
 * about where places are.
 *
 * Deliberately not a full ARIA combobox: it is a text field and a list of
 * buttons, which thumbs and screen readers both already understand. Arrow keys
 * are wired because a physical keyboard is plausible on the desktop layout, and
 * Escape always gets out.
 */

export interface Place {
  name: string;
  city: string;
  lat: number;
  lon: number;
}

/** Matches the function's own floor - below two characters nearly every row
 *  matches and the list is noise rather than help. */
const MIN_QUERY = 2;

/** Long enough that typing a barangay name is one request, not eight. */
const DEBOUNCE_MS = 220;

interface PlaceSearchProps {
  onPick: (place: Place) => void;
}

export function PlaceSearch({ onPick }: PlaceSearchProps) {
  const copy = useCopy();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [failed, setFailed] = useState(false);

  const box = useRef<HTMLDivElement>(null);

  /**
   * The label written into the field by a selection.
   *
   * Choosing a result sets the field to "Malanday, Marikina", which changes
   * `query`, which re-runs the search below, which reopens the list the
   * selection had just closed - the dropdown sprang straight back up over the
   * map you had asked to be taken to. Remembering the one term we wrote
   * ourselves lets that single pass be skipped.
   */
  const chosen = useRef<string | null>(null);

  useEffect(() => {
    if (chosen.current === query) {
      chosen.current = null;
      return;
    }

    const term = query.trim();
    // Nothing to clear here: what shows is derived from the query below, so a
    // short term simply renders nothing. Resetting state in an effect body
    // would be a second source of truth for the same fact.
    if (term.length < MIN_QUERY) return;

    // Guards against an out-of-order response overwriting a newer one: a slow
    // request for "Mal" must not land after "Malanday" and replace it.
    let current = true;

    const timer = window.setTimeout(async () => {
      const { data, error } = await createClient().rpc("search_places", { q: term });
      if (!current) return;

      setFailed(Boolean(error));
      setResults(error ? [] : ((data ?? []) as Place[]));
      setActive(-1);
      setOpen(true);
    }, DEBOUNCE_MS);

    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  // A tap anywhere else is a dismissal. Without this the list stays open over
  // the map and swallows the next tap meant for a pin.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const choose = useCallback(
    (place: Place) => {
      const label = `${place.name}, ${place.city}`;
      chosen.current = label;
      onPick(place);
      setQuery(label);
      setOpen(false);
      setActive(-1);
    },
    [onPick],
  );

  const longEnough = query.trim().length >= MIN_QUERY;
  const showList = open && longEnough;
  // Derived rather than stored, so a half-typed query cannot leave the previous
  // term's results on screen while the next request is still in flight - and so
  // there is only one source of truth for "is there anything to show".
  const visible = longEnough ? results : [];

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || visible.length === 0) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + visible.length) % visible.length);
      return;
    }
    if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      choose(visible[active]);
    }
  }

  return (
    <div className="place-search" ref={box}>
      <label className="sr-only" htmlFor="place-search-input">
        {copy.map.searchLabel}
      </label>

      <div className="place-search-field">
        <svg
          className="place-search-icon"
          viewBox="0 0 20 20"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
          <path
            d="M13.5 13.5 L18 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>

        <input
          id="place-search-input"
          className="place-search-input"
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder={copy.map.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />

        {query.length > 0 && (
          <button
            type="button"
            className="place-search-clear"
            aria-label={copy.map.searchClear}
            onClick={() => {
              setQuery("");
              setResults([]);
              setOpen(false);
            }}
          >
            ×
          </button>
        )}
      </div>

      {showList && (
        <ul className="place-search-results">
          {failed ? (
            <li className="place-search-empty">{copy.map.searchFailed}</li>
          ) : visible.length === 0 ? (
            <li className="place-search-empty">{copy.map.searchEmpty}</li>
          ) : (
            visible.map((place, i) => (
              <li key={`${place.city}-${place.name}`}>
                <button
                  type="button"
                  className="place-search-result"
                  data-active={i === active}
                  onClick={() => choose(place)}
                >
                  <span className="place-search-name">{place.name}</span>
                  {/* The city always shows, because granularity is uneven: some
                      rows are a barangay and some are a whole city, and
                      "Pasig, Pasig" is how you tell which one you just got. */}
                  <span className="place-search-city">{place.city}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
