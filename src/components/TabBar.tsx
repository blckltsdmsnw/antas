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
 * I-REPORT IS A RAISED CENTRE ACTION, not a peer tab. Filing a report is the
 * one thing this application asks people to do, and it was previously the third
 * of four identical items.
 *
 * TULONG MOVED HERE, and that reverses an earlier decision worth explaining. It
 * was a chip in the header, on the argument that a tab is one of several equal
 * things and an emergency control is not equal. That held while navigation was
 * in the header. Once navigation moved to the bottom, the most reachable place
 * on a one-handed phone was down here - so the emergency control belongs where
 * the thumb already is, styled red and unlike its neighbours so it is plainly
 * not a peer. Reaching /sos is harmless in any case: the real guard is the live
 * photo and the three-second hold on submit.
 *
 * WHAT IS NOT HERE: an "Abiso" tab. Generated designs put notifications in this
 * bar, and a tab named Abiso promises alerts nobody is sending. On a
 * crowdsourced map a flood with no reporter produces no alert, so the tab would
 * lead to an empty page forever while implying someone is watching.
 *
 * AND SOS IS NOT A LONG-PRESS ON I-REPORT. Hiding the emergency path inside a
 * gesture on the routine one fails twice: it cannot be discovered by someone
 * who needs it now, and under panic people do the routine thing. The
 * three-second hold stays where it belongs - confirming the SOS, not finding
 * it.
 */

interface Tab {
  href: string;
  label: string;
  /** Paths this tab owns beyond its own href, so a related page keeps it lit. */
  also?: readonly string[];
  /** The raised centre action, or the emergency control. Neither is a peer. */
  kind?: "action" | "sos";
}

const TABS: readonly Tab[] = [
  { href: "/", label: "Mapa" },
  { href: "/gabay", label: "Gabay" },
  { href: "/report", label: "I-report", kind: "action" },
  { href: "/ako", label: "Ako", also: ["/login", "/console"] },
  { href: "/sos", label: "Tulong", kind: "sos" },
];

function isActive(pathname: string, tab: Tab): boolean {
  if (tab.href === "/") return pathname === "/";
  if (pathname === tab.href || pathname.startsWith(`${tab.href}/`)) return true;
  return (tab.also ?? []).some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function TabBar() {
  const pathname = usePathname();

  // Shown on every screen, including /sos.
  //
  // It was hidden there, on the reasoning that a single task under duress
  // should not offer four ways to leave. That was defensible while Tulong sat
  // in the header - but with Tulong moved down here, hiding the bar on /sos
  // left that page with no visible exit except the wordmark. Stranding someone
  // is worse than distracting them, and there is nothing to lose by leaving:
  // an SOS is only sent by the live photo and the three-second hold.
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
            data-kind={tab.kind}
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
    // A plain plus. The raised disc already says "this is the action"; a
    // detailed glyph inside it competes with the shape carrying that meaning.
    return (
      <svg {...common} strokeWidth={2.4}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }

  if (href === "/sos") {
    // A life ring. Not a cross, which reads as medical, and not a siren, which
    // would promise a response nobody is sending.
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.6" />
        <circle cx="12" cy="12" r="3.4" />
        <path d="M5.9 5.9l3.7 3.7M14.4 14.4l3.7 3.7M18.1 5.9l-3.7 3.7M9.6 14.4l-3.7 3.7" />
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
