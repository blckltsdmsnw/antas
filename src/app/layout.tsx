import type { Metadata } from "next";
import { Archivo, Public_Sans } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { TabBar } from "@/components/TabBar";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { LanguageProvider } from "@/lib/i18n/context";
import { getLang } from "@/lib/i18n/server";
import { htmlLang } from "@/lib/i18n/lang";
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

/**
 * Async, because the language is resolved here and nowhere else.
 *
 * Reading the cookie in the root layout is what lets the very first byte of
 * HTML already be in the right language, and it is why every route below is
 * server-rendered rather than prerendered. That cost is deliberate: the
 * alternative is sending Tagalog and correcting it on the client a frame later,
 * which is the flash this codebase has shipped twice before - and on `/sos` and
 * `/gabay` the words are the product, so being briefly wrong is worse than
 * being rendered per request.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();

  return (
    <html
      // `fil` for Filipino, `en` for English - what a screen reader needs to
      // pick a voice. It was hardcoded to `fil` while only one language existed.
      lang={htmlLang(lang)}
      className={`${archivo.variable} ${publicSans.variable}`}
    >
      <body>
        {/* Handed down as a prop rather than read from the cookie again below:
            client components cannot see the cookie before their first paint,
            and reading it there is precisely how the flash gets reintroduced. */}
        <LanguageProvider lang={lang}>
          {/* Absent on the map, where search is the top element instead - see
              SiteHeader. Tulong is no longer here either: it moved to the tab
              bar when navigation did, to sit where a thumb reaches. */}
          <SiteHeader />
          {children}
          <TabBar />
          {/* Renders nothing. It installs the offline cache after load, because
              no signal is the condition this application is most likely to be
              opened in. */}
          <ServiceWorkerRegistration />
        </LanguageProvider>
      </body>
    </html>
  );
}
