"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * Shows the console link only to actual moderators.
 *
 * Client-side on purpose: doing this check in the root layout would require
 * `cookies()`, which turns every page - including the statically prerendered
 * public map - into a server-rendered-on-demand route. A nav link is not worth
 * that.
 *
 * This is discoverability, not access control. A non-moderator who types
 * /console still sees nothing: `moderator_queue()` is scoped by `auth.uid()`
 * inside the database and revoked from anon entirely.
 */
export function ModeratorLink() {
  const [isModerator, setIsModerator] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user || cancelled) return;

      // RLS lets a user read only their own moderators row.
      const { data } = await supabase
        .from("moderators")
        .select("barangay")
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (!cancelled) setIsModerator(Boolean(data));
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isModerator) return null;

  return (
    <Link href="/console" className="nav-link">
      Console
    </Link>
  );
}
