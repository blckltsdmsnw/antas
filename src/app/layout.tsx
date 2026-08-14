import type { Metadata } from "next";
import Link from "next/link";
import { Archivo, Public_Sans } from "next/font/google";
import { ModeratorLink } from "@/components/ModeratorLink";
import { AntasMark } from "@/components/AntasMark";
import "./globals.css";

/** Headings. A grotesque with signage DNA — it should read like something
 *  stencilled on infrastructure, not like a startup landing page. */
const archivo = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

/** Interface text. Public Sans is the typeface of a public-service design
 *  system, which is exactly the register this app is trying to occupy. */
const publicSans = Public_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Antas",
  description: "Antas ng tubig - crowdsourced flood depth reporting for Marikina.",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#0284c7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fil"
      className={`${archivo.variable} ${publicSans.variable}`}
    >
      <body>
        <header className="site-header">
          <Link href="/" className="wordmark">
            <AntasMark size={24} />
            {/* The word carries the same waterline as the mark. The duplicate is
                the real text clipped to below the line and recoloured, so the
                letterforms stay live text - selectable, resizable, and readable
                by assistive tech, which an image of a word would not be. */}
            <span className="wordmark-word">
              Antas
              <span className="wordmark-flood" aria-hidden="true">
                Antas
              </span>
            </span>
          </Link>
          <nav className="site-nav">
            <Link href="/report" className="nav-link">
              Mag-report
            </Link>
            {/* Prominent by design. The accidental-press risk lives in the
                submit - which needs a live photo and a three-second hold -
                not in navigating to the page. Someone in a flood should not
                have to hunt for this. */}
            <Link href="/sos" className="nav-link nav-link-sos">
              Tulong
            </Link>
            <ModeratorLink />
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
