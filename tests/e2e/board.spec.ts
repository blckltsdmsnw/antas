import { test, expect } from "@playwright/test";

test("the board refuses a signed-out visitor in words, not an empty grid", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/console/board");
  // board_rows() is revoked from anon, so the RPC errors and the page must
  // say so rather than draw four empty columns or crash.
  await expect(page.getByText("Para lang sa master admin ang board na ito.")).toBeVisible();
  await expect(page.locator(".board-column")).toHaveCount(0);
});

test("the board still warns that nobody is dispatched", async ({ page }) => {
  await page.goto("/console/board");
  await expect(page.getByText("Demonstrasyon lamang.")).toBeVisible();
});
