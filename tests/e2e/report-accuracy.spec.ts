import { test, expect, type Page } from "@playwright/test";

/**
 * A browser with no GPS returns an IP- or Wi-Fi-derived fix and reports the
 * uncertainty honestly in `coords.accuracy`. The app used to ignore that field,
 * so a guess uncertain by 100km was drawn as an ordinary pin - which is how a
 * report from Taguig ended up shown in Muntinlupa.
 *
 * Overriding `navigator.geolocation` rather than using Playwright's
 * `setGeolocation`, because the context helper always supplies a perfect fix
 * and the whole point here is an imperfect one.
 */
async function stubFix(page: Page, accuracy: number): Promise<void> {
  await page.addInitScript((accuracyM) => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({
            coords: {
              latitude: 14.42,
              longitude: 121.04,
              accuracy: accuracyM,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
              toJSON() {
                return this;
              },
            },
            timestamp: Date.now(),
            toJSON() {
              return this;
            },
          } as GeolocationPosition),
      },
    });
  }, accuracy);
}

test("a wildly imprecise fix is never placed on the map silently", async ({
  page,
}) => {
  await stubFix(page, 100_000);
  await page.goto("/report");

  await page.getByRole("button", { name: "I-report" }).click();

  await expect(
    page.getByRole("heading", { name: "Malabo ang lokasyon mo" }),
  ).toBeVisible();
  // The number matters more than the warning: "malabo" is vague, "100 km" is not.
  await expect(page.getByText(/100 km/)).toBeVisible();
});

test("cancelling returns to the depth form with nothing submitted", async ({
  page,
}) => {
  await stubFix(page, 100_000);
  await page.goto("/report");

  await page.getByRole("button", { name: "I-report" }).click();
  await page.getByRole("button", { name: "Kanselahin" }).click();

  await expect(
    page.getByRole("heading", { name: "Gaano kalalim ang tubig?" }),
  ).toBeVisible();
  await expect(page.getByRole("slider")).toBeVisible();
});

test("a good fix goes straight through without an extra tap", async ({
  page,
}) => {
  await stubFix(page, 12);
  await page.goto("/report");

  await page.getByRole("button", { name: "I-report" }).click();

  // Not signed in, so this stops at the sign-in prompt - which is itself the
  // proof that it skipped the confirmation screen and reached the server.
  await expect(page.getByText("Mag-sign in muna bago mag-report.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Malabo ang lokasyon mo" }),
  ).toBeHidden();
});
