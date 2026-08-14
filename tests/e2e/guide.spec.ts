import { test, expect } from "@playwright/test";

/**
 * The guide is the one screen that must never lie about what Antas can do.
 *
 * It is read by someone preparing for, or standing in, a flood - the moment its
 * words carry the most authority of anywhere in the product. Generated drafts
 * of this screen told the reader to press Antas's own SOS button to be rescued.
 * Our SOS reaches nobody. That sentence must never reach production, so it is
 * asserted against rather than merely reviewed.
 */
test.describe("the preparedness guide", () => {
  test("never tells anyone Antas will rescue them", async ({ page }) => {
    await page.goto("/gabay");
    const body = (await page.locator("main").innerText()).replace(/\s+/g, " ");

    expect(body).not.toMatch(/SOS button sa Antas/i);
    expect(body).not.toMatch(/gamitin ang SOS[^.]*rescue/i);

    // And says the boundary out loud rather than leaving it to be inferred.
    expect(body).toContain("hindi nagpapadala ng rescue");
  });

  test("offers a number that actually dials", async ({ page }) => {
    await page.goto("/gabay");
    // The point of the screen: we cannot send help, so hand over the people who
    // can. A guide with no dialable number is only advice.
    await expect(page.locator(".contact-call").first()).toHaveAttribute(
      "href",
      "tel:911",
    );
  });

  test("admits when local numbers are missing", async ({ page }) => {
    await page.goto("/gabay");
    const body = await page.locator("main").innerText();

    // A short list that looks complete is worse than an incomplete one that
    // says so - someone would stop looking for their own barangay's number.
    const hasLocal = (await page.locator(".contact").count()) > 1;
    if (!hasLocal) expect(body).toContain("Wala pang naidagdag");
  });
});

/**
 * Navigation moved to the bottom because a phone held one-handed in the rain
 * reaches there. Tulong deliberately did not move with it.
 */
test.describe("navigation", () => {
  for (const path of ["/", "/gabay", "/report", "/ako"]) {
    test(`the tab bar is reachable on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator(".tabbar")).toBeVisible();
    });
  }

  test("the tab bar stays out of the way on /sos", async ({ page }) => {
    await page.goto("/sos");
    // One task, under duress. Offering four ways to leave it at the moment
    // concentration matters most is the wrong trade.
    await expect(page.locator(".tabbar")).toHaveCount(0);
  });

  test("Tulong is on every screen, and is not a tab", async ({ page }) => {
    for (const path of ["/", "/gabay", "/report", "/ako"]) {
      await page.goto(path);
      await expect(page.locator(".nav-link-sos")).toBeVisible();
      // A tab is one of four equal things; this is not equal to the others.
      await expect(page.locator(".tabbar .nav-link-sos")).toHaveCount(0);
    }
  });

  test("the map stops above the tab bar rather than running under it", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(".tabbar")).toBeVisible();

    const gap = await page.evaluate(() => {
      const bar = document.querySelector(".tabbar")!.getBoundingClientRect();
      const shell = document.querySelector(".map-shell")!.getBoundingClientRect();
      return Math.round(shell.bottom - bar.top);
    });

    // A sheet rising from the bottom of the map would otherwise sit underneath
    // the bar, where it can be neither read nor dismissed.
    expect(gap).toBeLessThanOrEqual(1);
  });
});
