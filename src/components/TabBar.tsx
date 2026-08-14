"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Primary navigation, at the bottom.
 *
 * A phone held one-handed in the rain reaches the bottom of the screen and not
 * the top. The header keeps the wordmark and Tulong; everything you navigate to
 * lives down here, under a thumb.
 *
 * TULONG IS DELIBERATELY NOT A TAB. Generated designs either buried SOS in a
 * tab bar or dropped it from navigation altogether, and both are wrong: a tab
 * is one of four equal things, and this is not equal to the others. It stays a
 * standing red chip in the header, present on every screen, because someone in
 * a flood should not have to hunt for it - and because a tab bar can be covered
 * by a sheet or pushed off by a keyboard.
 */

interface Tab {
  href: string;
  label: string;
  /** Paths this tab owns beyond its own href, so a related page keeps it lit. */
  also?: readonly string[];
}

const TABS: readonly Tab[] = [
  { href: "/", label: "Mapa" },
  { href: "/gabay", label: "Gabay" },
  { href: "/report", label: "Mag-report" },
  { href: "/ako", label: "Ako", also: ["/login", "/console"] },
];

/** Routes that own the whole screen and must not compete with navigation. */
const HIDDEN_ON = ["/sos"];

function isActive(pathname: string, tab: Tab): boolean {
  if (tab.href === "/") return pathname === "/";
  if (pathname === tab.href || pathname.startsWith(`${tab.href}/`)) return true;
  return (tab.also ?? []).some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function TabBar() {
  const pathname = usePathname();

  // The SOS screen is a single task under duress. Offering four ways to leave
  // it, at the moment concentration matters most, is the wrong trade.
  if (
    HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  ) {
    return null;
  }

  return (
    <nav className="tabbar" aria-label="Pangunahing nabigasyon">
      {TABS.map((tab) => {
        const active = isActive(pathname, tab);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="tab"
            data-active={active}
            // `aria-current` is what a screen reader announces; the colour
            // change is only for eyes, and one of those is not enough.
            aria-current={active ? "page" : undefined}
          >
            <TabIcon href={tab.href} />
            <span className="tab-label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Line icons at a single weight, drawn rather than pulled from a set - four
 * shapes is not worth a dependency, and a set would arrive with its own stroke
 * weight and corner radius to argue with.
 */
function TabIcon({ href }: { href: string }) {
  const common = {
    className: "tab-icon",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: "false" as const,
  };

  if (href === "/") {
    // A pin, echoing the mark.
    return (
      <svg {...common}>
        <path d="M12 21c4-5 6.5-8.2 6.5-11a6.5 6.5 0 1 0-13 0C5.5 12.8 8 16 12 21Z" />
        <circle cx="12" cy="10" r="2.4" />
      </svg>
    );
  }

  if (href === "/gabay") {
    // An open book.
    return (
      <svg {...common}>
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4Z" />
        <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6Z" />
      </svg>
    );
  }

  if (href === "/report") {
    // A rising level with a plus: filing a reading, not writing a note.
    return (
      <svg {...common}>
        <path d="M3 16c2.5-2 4.5-2 7 0s4.5 2 7 0" />
        <path d="M3 20c2.5-2 4.5-2 7 0s4.5 2 7 0" />
        <path d="M17 3v7M13.5 6.5h7" />
      </svg>
    );
  }

  // A person.
  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </svg>
  );
}
