import { test, expect } from "@playwright/test";

test("public map loads without signing in", async ({ page }) => {
  await page.goto("/");
  // The brand lives in the header; the map page's h1 is screen-reader only, so
  // assert on what a sighted visitor actually sees plus the map itself.
  await expect(page.getByRole("link", { name: /Antas/ })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
});

test("clicking the map shows street history", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText("Pindutin ang mapa para makita ang kasaysayan."),
  ).toBeVisible();

  // The map renders into a WebGL <canvas> via MapLibre. Wait for it to be
  // attached and have a stable layout (Playwright's actionability checks:
  // visible + not still animating/resizing) before clicking, rather than
  // sleeping a fixed amount of time.
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await canvas.click({ position: { x: 300, y: 200 } });

  await expect(
    page.getByText("Pindutin ang mapa para makita ang kasaysayan."),
  ).toBeHidden();
});

/**
 * The legend used to sit on top of the pins with `pointer-events: auto`, so a
 * cluster that happened to land in the top-right corner was both invisible and
 * untappable - the tap landed on the legend and did nothing at all.
 *
 * Asserted without any report data on purpose: this is a property of the
 * chrome, and needing a seeded database is what kept it untested.
 */
/**
 * The splash covers the whole application, so the one property that matters is
 * that it always leaves. A load screen that can strand someone behind it is
 * worse than no load screen at all - this is the page people open while
 * standing in water.
 */
test("the splash always clears and hands the map back", async ({ page }) => {
  await page.goto("/");

  // Generous: MAX_MS is 2600ms, plus the surge and the fade.
  await expect(page.locator(".splash")).toBeHidden({ timeout: 6000 });

  const hit = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return el ? `${el.tagName}.${el.className}` : "";
  });
  expect(hit).not.toContain("splash");
});

test("the legend cannot intercept a tap meant for the map", async ({ page }) => {
  await page.goto("/");
  // The splash sits above everything by design, so hit-testing before it goes
  // measures the splash rather than the legend.
  await expect(page.locator(".splash")).toBeHidden({ timeout: 6000 });

  const legend = page.locator(".legend");
  await expect(legend).toBeVisible();

  const box = await legend.boundingBox();
  if (!box) throw new Error("legend has no bounding box");

  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.className ?? "",
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  expect(hit).not.toContain("legend");

  // And a pin must paint above it, or the tap that now gets through is aimed at
  // something the user cannot see.
  const layers = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      pin: Number(root.getPropertyValue("--z-pin")),
      chrome: Number(root.getPropertyValue("--z-map-chrome")),
    };
  });
  expect(layers.pin).toBeGreaterThan(layers.chrome);
});

/**
 * The basemap follows the Manila clock and nothing else.
 *
 * Both theme bugs so far lived in the browser adapter, not in `mapThemeFor` -
 * the pure function was correct and unit-tested through each of them. So this
 * drives the real page with a faked clock and a faked device preference, which
 * is the only combination that would have caught either one.
 */
for (const [when, expected] of [
  ["2026-08-14T04:15:00+08:00", "dark"], // the map used to be bright at 4am
  ["2026-08-14T13:41:00+08:00", "light"], // and dark at lunchtime on a dark phone
  ["2026-08-14T19:30:00+08:00", "dark"],
] as const) {
  for (const colorScheme of ["light", "dark"] as const) {
    const clock = when.slice(11, 16);
    test(`basemap is ${expected} at ${clock} Manila on a ${colorScheme} device`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.clock.setFixedTime(new Date(when));
      await page.goto("/");
      await expect(page.locator("canvas")).toBeVisible();

      // Read twice, half a second apart, and require both to be `expected`.
      // `toHaveAttribute` alone retries until the first match, so it happily
      // passed against the transient "light" the page used to stamp before the
      // clock was consulted - a green test for a map that was visibly wrong.
      const read = () =>
        page.evaluate(() => document.documentElement.dataset.mapTheme);
      const first = await read();
      await page.waitForTimeout(500);
      const settled = await read();

      expect({ first, settled }).toEqual({ first: expected, settled: expected });
    });
  }
}

test("sign-in page asks for an email address", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
});
