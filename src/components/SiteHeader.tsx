"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AntasMark } from "@/components/AntasMark";
import { ModeratorLink } from "@/components/ModeratorLink";
import { LanguageToggle } from "@/components/LanguageToggle";

/**
 * The header, everywhere except the map.
 *
 * The map page used to stack three bands of chrome before any map appeared -
 * header, then search, then the weather chip and the legend. On a phone that is
 * roughly a fifth of the screen spent before the product starts.
 *
 * So the header is dropped there and the search field becomes the top element,
 * which is honest: search is the primary way into the map. The wordmark was
 * decoration on that page anyway - the app icon, the splash and the tab bar all
 * already say what this is, and its link points at `/`, which is where you
 * already were.
 *
 * NOT MADE TRANSPARENT, which was the other option on the table. Over a basemap
 * a transparent bar needs a scrim or a shadow to stay legible, so it costs the
 * same 56px and only makes them harder to read.
 *
 * It stays on the task pages, where nothing competes for the space and where a
 * way back to the map is worth having.
 */

/** Routes that own the full viewport and provide their own way around. */
const BARE = ["/"];

export function SiteHeader() {
  const pathname = usePathname();

  if (BARE.includes(pathname)) return null;

  return (
    <header className="site-header">
      <Link href="/" className="wordmark">
        <AntasMark size={24} />
        {/* Plain. The word used to carry the same waterline as the mark, which
            put the identical idea twice in one lockup. The mark carries the
            concept; the word only has to say the name. */}
        Antas
      </Link>
      <nav className="site-nav">
        {/* The language control lives here and only here. The map deliberately
            has no header, so it is not reachable from that one screen - which
            is right: this is a preference set once, not something reached for
            while looking at water. It is one tab away from anywhere. */}
        <LanguageToggle />
        <ModeratorLink />
      </nav>
    </header>
  );
}
