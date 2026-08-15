import { test, expect, type Page } from "@playwright/test";

/**
 * The language toggle, and the one failure that actually matters.
 *
 * A half-translated safety app is worse than a Filipino-only one: somebody
 * switches to English *because they cannot read Tagalog*, gets English
 * navigation, and then hits the SOS screen in Tagalog. It looks like a working
 * page, so nothing prompts them to go back.
 *
 * `dict.ts` makes a MISSING translation a compile error. What it cannot catch
 * is a string that was never routed through the dictionary at all - a literal
 * left inline in a component. That is what these tests are for: they drive the
 * real pages in English and fail on any Tagalog left on screen.
 */

/** Screens a person in a flood can reach. Every one of them is checked. */
const PAGES = ["/", "/gabay", "/report", "/ako", "/login", "/sos"] as const;

/**
 * Words that are unambiguously Tagalog and common enough that any untranslated
 * sentence will contain one.
 *
 * Deliberately function words rather than nouns: "Antas", "barangay" and
 * "Marikina" stay in the English interface on purpose - a barangay is a
 * barangay - so matching on those would fail on correct pages.
 */
const TAGALOG = /\b(ang|ng|mga|sa|kung|hindi|walang|nang|ito|iyong|mo)\b/i;

/**
 * Set by domain rather than by URL.
 *
 * The suite runs against 127.0.0.1, and browsers treat that as a different
 * origin from localhost - which `playwright.config.ts` already says out loud
 * about the OTP redirect. A cookie written for the wrong one is simply never
 * sent, and every assertion below then reads a Tagalog page and fails for a
 * reason that has nothing to do with the translation.
 */
async function setLang(page: Page, lang: "tl" | "en") {
  await page
    .context()
    .addCookies([
      { name: "antas.lang", value: lang, domain: "127.0.0.1", path: "/" },
    ]);
}

test.describe("the language toggle", () => {
  test("defaults to Filipino, with no cookie at all", async ({ page }) => {
    // Filipino-first is the product, not a default that happens to sort first.
    await page.goto("/gabay");
    await expect(page.locator("html")).toHaveAttribute("lang", "fil");
    await expect(page.locator('.tabbar [href="/gabay"]')).toContainText("Gabay");
  });

  test("switches the whole page, and stays switched", async ({ page }) => {
    await page.goto("/gabay");
    await page.locator('.lang-option:has-text("English")').click();

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator('.tabbar [href="/gabay"]')).toContainText("Guide");

    // Survives a navigation, which is the whole point of a cookie over state.
    await page.goto("/report");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("arrives already in English, without a flash", async ({ page }) => {
    // The failure this guards against is over before any in-page assertion
    // could see it, so the server's own HTML is the only place it is visible:
    // if the first byte says Tagalog, the client has to correct it, and that
    // correction is the flash. This codebase has shipped that twice already -
    // the go bag's "0 sa 4" and the map's data-map-theme.
    await setLang(page, "en");
    const html = await (await page.request.get("/gabay")).text();

    expect(html).toMatch(/<html[^>]+lang="en"/);
    expect(html).toContain("Are you ready?");
    expect(html).not.toContain("Handa ka ba?");
  });

  test("names each language in itself, never translated", async ({ page }) => {
    // Somebody stranded in a language they cannot read has to be able to find
    // the way out. "Ingles" is no help to a person who only reads English.
    for (const lang of ["tl", "en"] as const) {
      await setLang(page, lang);
      await page.goto("/gabay");
      await expect(page.locator(".lang-option").first()).toHaveText("Filipino");
      await expect(page.locator(".lang-option").last()).toHaveText("English");
    }
  });

  test("marks which language is current", async ({ page }) => {
    await setLang(page, "en");
    await page.goto("/gabay");
    await expect(
      page.locator('.lang-option:has-text("English")'),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.locator('.lang-option:has-text("Filipino")'),
    ).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("nothing is left half-translated", () => {
  for (const path of PAGES) {
    test(`${path} has no Tagalog left in English`, async ({ page }) => {
      await setLang(page, "en");
      await page.goto(path);

      // Wait for the shell, then let the opportunistic chrome paint - the
      // weather strip, the legend, the offline notice - since a literal hiding
      // in one of those is exactly what this is looking for.
      //
      // NOT `networkidle`: the map streams basemap tiles for as long as it is
      // open, so on `/` that never arrives and the test times out rather than
      // failing on anything real.
      await expect(page.locator(".tabbar")).toBeVisible();
      await page.waitForTimeout(1200);

      const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      const match = text.match(TAGALOG);
      const near = match
        ? text.slice(Math.max(0, match.index! - 60), match.index! + 60)
        : "";

      expect(match, `${path} still shows Tagalog: "${near}"`).toBeNull();
    });
  }
});

test.describe("the safety wording survives translation", () => {
  test("the guide still refuses to promise rescue, in English", async ({
    page,
  }) => {
    await setLang(page, "en");
    await page.goto("/gabay");
    const body = (await page.locator("main").innerText()).replace(/\s+/g, " ");

    // The same boundary guide.spec.ts asserts in Tagalog. A translation that
    // reads more naturally by dropping it would be the exact harm the safety
    // boundary exists to prevent.
    expect(body).toMatch(/does not send rescue/i);
    expect(body).toMatch(/nobody is watching/i);
    expect(body).not.toMatch(/we will send|help is on the way/i);
  });

  test("the SOS screen still says nobody receives it, in English", async ({
    page,
  }) => {
    await setLang(page, "en");
    await page.goto("/sos");
    const body = (await page.locator("main").innerText()).replace(/\s+/g, " ");

    expect(body).toMatch(/no real rescue service receives this/i);
    expect(body).toContain("911");
  });

  test("the guide still admits the local numbers are missing, in English", async ({
    page,
  }) => {
    await setLang(page, "en");
    await page.goto("/gabay");
    const body = await page.locator("main").innerText();

    const hasLocal =
      (await page.locator('[data-scope="local"] .contact').count()) > 0;
    if (!hasLocal) {
      // And says the ones above it are national, so nobody reads a national
      // operations centre as their barangay desk.
      expect(body).toMatch(/national/i);
      expect(body).toMatch(/no barangay or local DRRMO number/i);
    }
  });
});
