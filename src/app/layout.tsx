import type { Metadata } from "next";
import Link from "next/link";
import { Archivo, Public_Sans } from "next/font/google";
import { ModeratorLink } from "@/components/ModeratorLink";
import { AntasMark } from "@/components/AntasMark";
import { TabBar } from "@/components/TabBar";
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
  /**
   * White, not the accent blue it used to be. This paints the browser and
   * Android status bar, and every task page in this product is light in all
   * conditions - a blue band above a white header only ever matched nothing.
   * The map page overrides it live when the night basemap turns on, since the
   * theme follows the Manila clock rather than any media query.
   */
  themeColor: "#ffffff",
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
            {/* Plain. The word used to carry the same waterline as the mark,
                which put the identical idea twice in one lockup. The mark
                carries the concept; the word only has to say the name. */}
            Antas
          </Link>
          <nav className="site-nav">
            {/* Everything you navigate to moved to the tab bar. Tulong did not:
                a tab is one of four equal things and this is not equal to the
                others. The accidental-press risk lives in the submit - a live
                photo and a three-second hold - not in reaching the page, so it
                stays a standing chip on every screen. Someone in a flood should
                not have to hunt for this. */}
            <Link href="/sos" className="nav-link nav-link-sos">
              Tulong
            </Link>
            <ModeratorLink />
          </nav>
        </header>
        {children}
        <TabBar />
      </body>
    </html>
  );
}
