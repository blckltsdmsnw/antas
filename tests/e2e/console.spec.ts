import { test, expect } from "@playwright/test";

test("the console warns that nobody is dispatched", async ({ page }) => {
  await page.goto("/console");
  await expect(page.getByText("Demonstrasyon lamang.")).toBeVisible();
});

test("a signed-out visitor is told the console needs a sign-in", async ({ page }) => {
  await page.goto("/console");
  // Task 3 replaced the empty-queue line on this branch: the console now knows
  // who is asking, and a visitor who is nobody is asked to sign in rather than
  // shown an empty barangay that is not theirs.
  await expect(page.getByRole("link", { name: "Mag-sign in" })).toBeVisible();
});
