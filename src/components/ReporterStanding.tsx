"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Whether this reporter's past readings held up. Never who they are.
 *
 * This shipped INSTEAD of showing reporter names. The question a name looked
 * like it answered - "can I trust this depth?" - is not one a stranger's name
 * can answer, and putting a name beside a location and a timestamp turns every
 * report into a public record that a named person was standing somewhere during
 * a disaster, when their house may be empty. A track record answers the real
 * question and names nobody.
 *
 * ONLY EVER SHOWN WHEN EARNED. There is no "often wrong" counterpart and there
 * will not be one: a public negative mark computed from a handful of taps, on
 * an application nobody moderates and with no way to appeal, is a punishment
 * mechanism. Absence here means "not established" - which is also every new
 * reporter, and is not a judgement about anybody.
 */

interface ReporterStandingProps {
  reportId: string;
}

export function ReporterStanding({ reportId }: ReporterStandingProps) {
  const [standing, setStanding] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setStanding(null);

    void createClient()
      .rpc("reporter_standing", { p_report_id: reportId })
      .then(({ data, error }) => {
        // A failed read shows nothing, which is the same as unearned standing.
        // This is the one place in the application where swallowing a failure
        // is right: the fallback is the more cautious reading rather than the
        // flattering one, so a broken call can never award credibility.
        if (current && !error) setStanding(data as string | null);
      });

    return () => {
      current = false;
    };
  }, [reportId]);

  if (standing !== "reliable") return null;

  return (
    <p className="standing">
      <span className="standing-mark" aria-hidden="true" />
      Madalas tumutugma ang mga naunang report ng nag-report nito
    </p>
  );
}
