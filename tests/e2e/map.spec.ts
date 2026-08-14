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
test("the legend cannot intercept a tap meant for the map", async ({ page }) => {
  await page.goto("/");
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

test("sign-in page asks for an email address", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
});
