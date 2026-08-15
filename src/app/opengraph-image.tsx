import { ImageResponse } from "next/og";
import { AntasMark } from "@/components/AntasMark";
import { copyFor } from "@/lib/i18n/strings";
import { DEFAULT_LANG } from "@/lib/i18n/lang";

/**
 * The card a chat app shows when somebody pastes the link.
 *
 * Filipino, always. A preview is generated per URL rather than per reader - a
 * crawler sends no cookie, and there is no "recipient" to consult - so baking
 * the product's own language is the only honest choice. Reading the language
 * cookie here would also make the image dynamic, and it is prerendered at build
 * time precisely so it is already sitting there when a link is pasted.
 *
 * The mark is the real `AntasMark` component rather than a copy. Rendering
 * `icon.svg` through an `<img>` data URI was the first attempt and the
 * rasteriser refused it outright - so this draws the same shapes the app draws,
 * which is the better answer anyway: a hand-copied skyline would drift from the
 * mark the first time either was touched.
 */

export const alt = copyFor(DEFAULT_LANG).shell.ogAlt;

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  const copy = copyFor(DEFAULT_LANG).shell;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 72,
          // The pale ground the mark already sits on, so the card reads as one
          // object rather than an icon pasted onto a slide.
          background: "#cbedfe",
          padding: "0 100px",
        }}
      >
        {/* Side by side rather than stacked. A column left half the card empty,
            and chat apps crop these hard - the text has to survive being shown
            at a fraction of 1200px. */}
        <AntasMark size={260} />

        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* Only one weight is available - @vercel/og ships a single regular
              face, and satori cannot read the .woff2 that next/font caches. So
              size and tracking carry the hierarchy here, not weight. Setting
              fontWeight would look deliberate and do nothing. */}
          <div
            style={{
              display: "flex",
              fontSize: 112,
              color: "#0f172a",
              letterSpacing: "-0.04em",
              lineHeight: 1,
            }}
          >
            Antas
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 46,
              color: "#0f172a",
              opacity: 0.75,
              marginTop: 20,
            }}
          >
            {copy.ogTagline}
          </div>

          {/* The boundary, on the card itself. Somebody meeting this in a group
              chat during a storm should not have to open it to learn that it
              reports water and does not summon anybody. */}
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "#0f172a",
              opacity: 0.6,
              marginTop: 40,
            }}
          >
            Metro Manila · hindi nagpapadala ng rescue
          </div>
        </div>
      </div>
    ),
    size,
  );
}
