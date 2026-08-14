import type { Metadata } from "next";
import { Archivo, Public_Sans } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { TabBar } from "@/components/TabBar";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
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
        {/* Absent on the map, where search is the top element instead - see
            SiteHeader. Tulong is no longer here either: it moved to the tab bar
            when navigation did, to sit where a thumb reaches. */}
        <SiteHeader />
        {children}
        <TabBar />
        {/* Renders nothing. It installs the offline cache after load, because
            no signal is the condition this application is most likely to be
            opened in. */}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
