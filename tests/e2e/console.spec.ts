import { test, expect } from "@playwright/test";

test("the console warns that nobody is dispatched", async ({ page }) => {
  await page.goto("/console");
  await expect(page.getByText("Demonstrasyon lamang.")).toBeVisible();
});

test("a signed-out visitor sees no signals", async ({ page }) => {
  await page.goto("/console");
  // moderator_queue() is revoked from anon and scoped to the caller's barangay,
  // so a signed-out visitor gets nothing back. The empty state must render
  // rather than the page crashing or a signal leaking.
  await expect(
    page.getByText("Walang aktibong SOS sa barangay mo.", { exact: false }),
  ).toBeVisible();
});
