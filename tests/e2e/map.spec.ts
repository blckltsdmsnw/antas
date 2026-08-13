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

test("sign-in page asks for an email address", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
});
