import type { Metadata } from "next";
import Link from "next/link";
import { Archivo, Public_Sans } from "next/font/google";
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
            Antas
            <span className="wordmark-gloss">antas ng tubig</span>
          </Link>
          <nav className="site-nav">
            <Link href="/report" className="nav-link">
              Mag-report
            </Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
