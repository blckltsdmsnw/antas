import { test, expect } from "@playwright/test";

test("public map loads without signing in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Antas" })).toBeVisible();
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
