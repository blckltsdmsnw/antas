import { test, expect } from "@playwright/test";

test("public map loads without signing in", async ({ page }) => {
  await page.goto("/");
  // The map page has no header - search is its top element, so that is what a
  // visitor actually sees first. The wordmark used to be asserted here; it now
  // exists only on the task pages, and asserting it on the map was asserting
  // chrome rather than that the product had loaded.
  await expect(page.locator(".place-search-input")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".tabbar")).toBeVisible();
});

test("the map page spends no height on a header", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();

  // Three bands of chrome stacked before any map appeared - header, search,
  // then the weather chip and the legend. The header earned its space least:
  // the app icon, the splash and the tab bar already say what this is, and its
  // link pointed at the page you were already on.
  await expect(page.locator(".site-header")).toHaveCount(0);

  const top = await page.evaluate(() =>
    Math.round(document.querySelector(".map-shell")!.getBoundingClientRect().top),
  );
  expect(top).toBe(0);
});

test("the task pages keep their header", async ({ page }) => {
  for (const path of ["/gabay", "/report", "/ako"]) {
    await page.goto(path);
    // Nothing competes for the space there, and a way back to the map is worth
    // having when the page is not itself the map.
    await expect(page.locator(".site-header")).toBeVisible();
    await expect(page.getByRole("link", { name: /Antas/ })).toBeVisible();
  }
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

  // And the legend paints ABOVE the pins, which is the reverse of what this
  // asserted at first.
  //
  // The original argument was that a pin must paint over the legend, or the tap
  // that now gets through is aimed at something invisible. Half of it was
  // wrong: the legend is pointer-transparent - proved one assertion above - so
  // a pin beneath it is occluded rather than unreachable. Meanwhile a pin drawn
  // across the key made the key unreadable, and there are hundreds of pins to
  // one legend, so that damage is constant while the hidden pin is one pan away.
  const layers = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      pin: Number(root.getPropertyValue("--z-pin")),
      chrome: Number(root.getPropertyValue("--z-map-chrome")),
    };
  });
  expect(layers.chrome).toBeGreaterThan(layers.pin);
});

/**
 * Every page has to end above the tab bar.
 *
 * `.console-page` carried a flat 48px of bottom padding while the bar is 60px
 * plus the home-indicator inset, so its last control sat underneath it. On the
 * signal detail that control is "I-dismiss" - half of what a moderator is there
 * to do, unreachable on a phone, and invisible to every test because none of
 * them ever measured a page against the bar.
 */
test("no page hides its last control under the tab bar", async ({ page }) => {
  for (const path of ["/gabay", "/report", "/ako", "/console"]) {
    await page.goto(path);
    await expect(page.locator(".tabbar")).toBeVisible();

    const clear = await page.evaluate(() => {
      const main = document.querySelector("main");
      const bar = document.querySelector(".tabbar");
      if (!main || !bar) return null;

      // The page's own bottom padding must reach past the height of the bar, so
      // content laid out at the very end of it still lands above.
      const style = getComputedStyle(main);
      return (
        Math.round(parseFloat(style.paddingBottom)) >=
        Math.round(bar.getBoundingClientRect().height)
      );
    });

    expect(clear, `${path} must pad past the tab bar`).toBe(true);
  }
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

      // The status bar has to follow the basemap, or an installed app shows a
      // white band above a night map. It cannot be declared statically, since
      // the theme follows the Manila clock rather than a media query.
      const themeColour = await page.getAttribute('meta[name="theme-color"]', "content");
      expect(themeColour).toBe(expected === "dark" ? "#253044" : "#ffffff");

      // The night tint colours the greyscale dark basemap, and must never sit
      // over the day one - Voyager already has its own colour, and blending a
      // second hue on top would fight it.
      const tint = await page.evaluate(
        () => getComputedStyle(document.querySelector(".map-tint")!).display,
      );
      expect(tint).toBe(expected === "dark" ? "block" : "none");
    });
  }
}

/**
 * A failed load and a genuinely dry city render identically unless something
 * says otherwise - and on a flood map, the silent version reads as "no flooding
 * reported here". That is the most dangerous sentence this application can
 * imply, so the distinction is asserted rather than trusted.
 */
test("a failed load says so instead of showing an empty map", async ({ page }) => {
  await page.route("**/rpc/reports_near*", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"message":"boom"}',
    }),
  );

  await page.goto("/");

  const banner = page.locator(".map-error");
  await expect(banner).toBeVisible({ timeout: 10000 });

  const text = (await banner.innerText()).replace(/\s+/g, " ");
  expect(text).toContain("Hindi ma-load");
  // The half that matters: an outage is not an all-clear.
  expect(text).toContain("walang baha");
  await expect(page.locator(".map-error-retry")).toBeVisible();
});

/**
 * The map opens over the whole of Metro Manila, and the question is "has MY
 * street flooded". Search is how that question stops beginning with a pinch.
 */
test("searching a place closes the list and keeps the choice", async ({ page }) => {
  await page.route("**/rpc/search_places*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { name: "Malanday", city: "Marikina", lat: 14.656, lon: 121.095 },
        { name: "Tumana", city: "Marikina", lat: 14.662, lon: 121.088 },
      ]),
    }),
  );

  await page.goto("/");
  await expect(page.locator(".splash")).toBeHidden({ timeout: 6000 });

  await page.fill(".place-search-input", "Mala");
  await expect(page.locator(".place-search-result")).toHaveCount(2);

  await page.locator(".place-search-result").first().click();
  await expect(page.locator(".place-search-input")).toHaveValue("Malanday, Marikina");

  // It must STAY closed, which is the whole assertion.
  //
  // Choosing writes the label into the field, which re-triggers the search and
  // springs the list back open over the map you had just asked to be taken to.
  // That reopen lands only after the debounce, so checking immediately catches
  // the closed frame and passes against the bug - this test did exactly that
  // until it was made to wait.
  await page.waitForTimeout(900);
  await expect(page.locator(".place-search-result")).toHaveCount(0);
});

test("sign-in page asks for an email address", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
});
