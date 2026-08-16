/**
 * Films the real application.
 *
 *   npm --prefix video run capture
 *
 * Every frame of interface in the promo is the running product, not a mockup.
 * That is the whole point: a working deployment is the thing this project has
 * that a Stitch prototype does not, and generated footage of a fake app would
 * throw that advantage away while also being unable to show the real UI.
 *
 * Requires, in this order:
 *   1. `npx supabase start` and a seeded local database, or the map is empty
 *      and the search returns "Hindi makahanap ngayon."
 *   2. `npm run dev` on port 3000.
 *
 * Each scene gets its own browser context, because Playwright writes one video
 * per context. Scenes are deliberately over-long: it is far cheaper to trim in
 * Remotion than to re-run the capture.
 */
import { chromium, devices } from "playwright";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.ANTAS_URL ?? "http://localhost:3000";
const OUT = join(import.meta.dirname, "public", "captures");

/** A phone, because Antas is phone-first and a desktop capture would lie. */
const PHONE = {
  ...devices["iPhone 13"],
  // A real device pixel ratio keeps text crisp at 1080p; the default would
  // upscale into mush on a projector.
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
};

const VIEWPORT = { width: 390, height: 844 };

/** Slow, deliberate movement reads as intent; instant jumps read as a glitch. */
const beat = (page, ms = 900) => page.waitForTimeout(ms);

async function scene(browser, name, steps) {
  const context = await browser.newContext({
    ...PHONE,
    viewport: VIEWPORT,
    // Must equal the viewport. Playwright rasterises the page at CSS pixel size
    // and pads the rest of the requested frame with grey rather than scaling
    // up - asking for 3x here produced a small screen in the corner of a large
    // grey rectangle. The phone renders about 380px wide in a 1920 canvas, so
    // 390 CSS pixels is close enough to 1:1 that nothing is lost.
    recordVideo: { dir: OUT, size: VIEWPORT },
    locale: "en-PH",
    timezoneId: "Asia/Manila",
  });

  const page = await context.newPage();

  /**
   * Film in daylight.
   *
   * `mapThemeFor` follows the Manila clock: light 06:00-18:00, dark after. Film
   * at ten at night and you get the night basemap, where the depth ramp is
   * harder to read and which is not the product's primary identity - task pages
   * are light in every condition because floods happen in daylight.
   *
   * Only `Date` is shifted, by a constant. Playwright's clock API would fake
   * the timers too, which freezes requestAnimationFrame and would stop the map
   * animating and the hold ring filling - a still video of a moving product.
   * Shifting Date alone leaves every animation running and keeps report ages
   * correct relative to each other.
   */
  await page.addInitScript(() => {
    const Real = Date;
    const now = new Real();
    const target = new Real(now);
    target.setHours(10, 20, 0, 0); // mid-morning, well inside the light window
    const delta = target.getTime() - now.getTime();

    // @ts-expect-error - replacing the global on purpose
    globalThis.Date = class extends Real {
      constructor(...args) {
        super(...(args.length ? args : [Real.now() + delta]));
      }
      static now() {
        return Real.now() + delta;
      }
    };
  });

  // Playwright draws no pointer, so taps would be invisible. A dot makes the
  // interaction legible to someone watching the finished video.
  await page.addInitScript(() => {
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:fixed;z-index:2147483647;width:34px;height:34px;margin:-17px 0 0 -17px;" +
      "border-radius:50%;background:rgba(15,23,42,.28);border:2px solid rgba(255,255,255,.9);" +
      "pointer-events:none;opacity:0;transition:opacity .18s,transform .12s";
    addEventListener("DOMContentLoaded", () => document.body.append(dot));
    addEventListener("mousemove", (e) => {
      dot.style.left = `${e.clientX}px`;
      dot.style.top = `${e.clientY}px`;
      dot.style.opacity = "1";
    });
    addEventListener("mousedown", () => (dot.style.transform = "scale(.75)"));
    addEventListener("mouseup", () => (dot.style.transform = "scale(1)"));
  });

  process.stdout.write(`  filming ${name} ... `);
  try {
    await steps(page);
  } catch (error) {
    process.stdout.write("FAILED\n");
    console.error(`    ${error.message.split("\n")[0]}`);
  }
  await context.close(); // flushes the video file

  // Playwright names videos by a random id; rename to the scene.
  const written = readdirSync(OUT)
    .filter((f) => f.endsWith(".webm") && !f.startsWith("scene-"))
    .map((f) => join(OUT, f));
  if (written.length === 1) {
    renameSync(written[0], join(OUT, `scene-${name}.webm`));
    process.stdout.write("ok\n");
  } else {
    process.stdout.write("no video written\n");
  }
}

const tap = async (page, locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await beat(page, 320);
  await page.mouse.down();
  await beat(page, 110);
  await page.mouse.up();
};

const SCENES = {
  /** The map with water on it. The establishing shot of the product. */
  async map(page) {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.locator("#place-search-input").waitFor({ timeout: 60_000 });
    await beat(page, 3500); // let the splash finish and the pins settle
    await page.mouse.move(195, 500);
    await page.mouse.down();
    await page.mouse.move(195, 380, { steps: 30 });
    await page.mouse.up();
    await beat(page, 2200);
  },

  /** Search answers "take me to my street", which is the whole premise. */
  async search(page) {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    const input = page.locator("#place-search-input");
    await input.waitFor({ timeout: 60_000 });
    await beat(page, 2500);
    await tap(page, input);
    await input.type("Malanday", { delay: 150 });
    await beat(page, 1600);
    const first = page.locator(".place-search-result").first();
    if (await first.count()) await tap(page, first);
    await beat(page, 3200);
  },

  /** The depth gauge: the scale is a body, which is the core design idea. */
  async report(page) {
    await page.goto(`${BASE}/report`, { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "I-report", exact: true })
      .waitFor({ timeout: 60_000 });
    await beat(page, 1800);
    for (const level of ["Bukung-bukong", "Tuhod", "Baywang", "Dibdib"]) {
      const button = page.getByRole("button", { name: level, exact: true });
      if (await button.count()) {
        await tap(page, button.first());
        await beat(page, 1100);
      }
    }
    await beat(page, 1500);
  },

  /** Hotlines first. The guide is the page most likely read with no signal. */
  async gabay(page) {
    await page.goto(`${BASE}/gabay`, { waitUntil: "domcontentloaded" });
    await beat(page, 2600);
    await page.mouse.wheel(0, 420);
    await beat(page, 2400);
  },

  /**
   * The refusal. Tulong states on screen that no rescue service receives this,
   * and that sentence is the most distinctive thing in the product.
   *
   * The hold is pressed and RELEASED EARLY on purpose - nothing is sent, no
   * anonymous account is created, no signal reaches anybody's queue. Filming a
   * real SOS would put a fake emergency in the database.
   */
  async tulong(page) {
    await page.goto(`${BASE}/sos`, { waitUntil: "domcontentloaded" });
    const hold = page.getByRole("button", { name: /Pindutin nang 3 segundo/ });
    await hold.waitFor({ timeout: 60_000 });
    await beat(page, 2600);
    const box = await hold.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await beat(page, 1400); // the ring fills
    await page.mouse.up();
    await beat(page, 1600);
  },
};

const only = process.argv.slice(2);
const chosen = only.length
  ? Object.fromEntries(Object.entries(SCENES).filter(([n]) => only.includes(n)))
  : SCENES;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
console.log(`Filming ${Object.keys(chosen).length} scenes from ${BASE}`);
for (const [name, steps] of Object.entries(chosen)) {
  await scene(browser, name, steps);
}
await browser.close();
console.log(`\nWrote ${readdirSync(OUT).length} clips to video/public/captures/`);
