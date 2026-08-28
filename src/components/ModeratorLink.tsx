"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * Shows the console link to anyone `/console` would show something to:
 * moderators, admins, master admins, and a plain account holding an open
 * assignment - because the console is where their assigned incident is.
 *
 * Client-side on purpose: doing this check in the root layout would require
 * `cookies()`, which turns every page - including the statically prerendered
 * public map - into a server-rendered-on-demand route. A nav link is not worth
 * that.
 *
 * This is discoverability, not access control. Somebody who types /console
 * without either still sees nothing: `console_access()` answers only about
 * `auth.uid()`, inside the database.
 */
export function ModeratorLink() {
  const [hasConsole, setHasConsole] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user || cancelled) return;

      const { data } = await supabase.rpc("console_access");
      const row = ((data as { role: string | null; open_assignments: number }[]) ?? [])[0];
      if (!cancelled) setHasConsole(Boolean(row && (row.role !== null || row.open_assignments > 0)));
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!hasConsole) return null;

  return (
    <Link href="/console" className="nav-link">
      Console
    </Link>
  );
}
