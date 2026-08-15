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

  test("every number on the page is actually dialable", async ({ page }) => {
    await page.goto("/gabay");

    // Agencies publish trunk lines as prose - "8911-5061 to 65 local 100". That
    // string is correct to SHOW and impossible to DIAL, so `published` and
    // `dial` are separate fields. This is the assertion that keeps them
    // separate: the day someone simplifies the component by feeding the
    // published label straight into the href, every alternate line on this page
    // silently stops working, and nothing else would notice.
    const hrefs = await page
      .locator(".contact-call")
      .evaluateAll((links) => links.map((l) => l.getAttribute("href") ?? ""));

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).toMatch(/^tel:\+?\d+$/);
    }
  });

  test("never lets the national numbers read as the whole answer", async ({
    page,
  }) => {
    await page.goto("/gabay");
    const body = await page.locator("main").innerText();

    // This used to assert the placeholder - "wala pang naidagdag" - back when an
    // empty local list was an open task. That item is closed: the national
    // numbers are what the product ships with.
    //
    // What survives is the property that actually mattered underneath it. A
    // list that looks complete is worse than one that says otherwise, because a
    // reader stops looking for their own barangay's number - and a national
    // operations centre cannot tell them which street is passable. So the page
    // must always say the numbers above are national, and always send them to
    // find their own.
    expect(body).toMatch(/[Pp]ambansa/);
    expect(body).toMatch(/numero ng sarili ninyong barangay/i);
  });
});

/**
 * The go bag is the only part of the guide with state, and all of it is local.
 *
 * That is the point worth protecting: packing has to survive a closed tab and a
 * dead connection, because the person re-reading this page may have neither an
 * account nor a signal.
 */
test.describe("the go bag", () => {
  test("remembers what you packed across a reload", async ({ page }) => {
    await page.goto("/gabay");
    await page.evaluate(() => localStorage.removeItem("antas:go-bag"));
    await page.reload();

    const items = page.locator(".go-bag-item");
    await expect(page.locator(".go-bag-count")).toContainText("0 sa");

    await items.first().click();
    await items.nth(2).click();
    await expect(page.locator(".go-bag-count")).toContainText("2 sa");

    await page.reload();
    // The assertion that matters. Without persistence this reads "0 sa 4" and
    // every tick is lost the moment the tab closes.
    await expect(page.locator(".go-bag-count")).toContainText("2 sa");
    await expect(page.locator('.go-bag-item[data-checked="true"]')).toHaveCount(2);
  });

  test("never ships a count in the HTML for the client to correct", async ({
    page,
    request,
  }) => {
    // The flash this guards against - "0 sa 4" painting before the saved state
    // is read - happens too early for any in-page assertion to catch; reading
    // the DOM twice after load passes whether or not the guard exists. The
    // server's own HTML is the one place the defect is actually visible: the
    // count belongs to state the server cannot know, so it must not be there.
    const html = await (await request.get("/gabay")).text();
    expect(html).toContain("go-bag-item");
    expect(html).not.toContain("go-bag-count");

    // And once the client has read localStorage, the real figure appears.
    await page.goto("/gabay");
    await page.evaluate(() =>
      localStorage.setItem("antas:go-bag", JSON.stringify(["Tubig at pagkain"])),
    );
    await page.reload();
    await expect(page.locator(".go-bag-count")).toContainText("1 sa");
  });

  test("stays readable when localStorage is unavailable", async ({ page }) => {
    // Private browsing and locked-down webviews both do this. Losing the ticks
    // is acceptable; losing the checklist is not - it is a safety page.
    await page.addInitScript(() => {
      const boom = () => {
        throw new Error("blocked");
      };
      Object.defineProperty(window, "localStorage", {
        get: () => ({ getItem: boom, setItem: boom, removeItem: boom }),
      });
    });
    await page.goto("/gabay");

    await expect(page.locator(".go-bag-item")).toHaveCount(4);
    await page.locator(".go-bag-item").first().click();
    await expect(page.locator(".go-bag-count")).toContainText("1 sa");
  });
});

/**
 * Navigation moved to the bottom because a phone held one-handed in the rain
 * reaches there. Tulong deliberately did not move with it.
 */
test.describe("navigation", () => {
  // Including /sos. Hiding the bar there left that page with no visible exit
  // once Tulong moved out of the header - stranding someone is worse than
  // distracting them, and leaving costs nothing: an SOS is only sent by the
  // live photo and the three-second hold.
  for (const path of ["/", "/gabay", "/report", "/ako", "/sos"]) {
    test(`the tab bar is reachable on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator(".tabbar")).toBeVisible();
    });
  }

  test("Tulong is reachable from every screen", async ({ page }) => {
    for (const path of ["/", "/gabay", "/report", "/ako"]) {
      await page.goto(path);
      const sos = page.locator('.tabbar [data-kind="sos"]');
      await expect(sos).toBeVisible();
      await expect(sos).toHaveAttribute("href", "/sos");
    }
  });

  test("Tulong is never styled as an ordinary destination", async ({ page }) => {
    await page.goto("/");
    // It sits in the bar because that is where a thumb reaches, but it must not
    // read as one more place to go. Its own colour, distinct from both the
    // resting tabs and the active one.
    const colours = await page.evaluate(() => {
      const pick = (sel: string) =>
        getComputedStyle(document.querySelector(sel)!).color;
      return {
        sos: pick('.tabbar [data-kind="sos"]'),
        active: pick('.tabbar [data-active="true"]'),
        resting: pick('.tabbar [href="/gabay"]'),
      };
    });
    expect(colours.sos).not.toBe(colours.resting);
    expect(colours.sos).not.toBe(colours.active);
  });

  test("SOS is a labelled destination, not a hidden gesture", async ({ page }) => {
    await page.goto("/");
    // Deliberately reachable by a plain tap on a labelled control. An emergency
    // path hidden behind a long-press on the report button cannot be discovered
    // by someone who needs it now, and under panic people do the routine thing.
    const sos = page.locator('.tabbar [data-kind="sos"]');
    await expect(sos).toContainText("Tulong");
    await sos.click();
    await expect(page).toHaveURL(/\/sos$/);
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
