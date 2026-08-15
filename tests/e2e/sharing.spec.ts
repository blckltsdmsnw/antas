import { test, expect } from "@playwright/test";

/**
 * What a shared link says about itself.
 *
 * This is the least-looked-at surface in the product and among the most widely
 * read: the preview reaches everybody the link is forwarded to, including
 * people who never open it. It sat wrong for a long time - claiming the app was
 * "for Marikina" long after the pilot area widened to Metro Manila - because
 * every other test in this suite reads the page body, and nothing read `<head>`.
 */

const meta = (html: string, property: string) =>
  html.match(
    new RegExp(`<meta[^>]+(?:property|name)="${property}"[^>]+content="([^"]*)"`),
  )?.[1] ?? null;

test.describe("the link preview", () => {
  test("says where Antas actually works", async ({ request }) => {
    const html = await (await request.get("/")).text();
    const description = meta(html, "og:description");

    expect(description).toBeTruthy();
    // The regression itself, named. A reader in Taguig who is told this is a
    // Marikina app decides it is not for them and never opens it.
    expect(description).not.toMatch(/\bfor Marikina\b/i);
    expect(description).toMatch(/Metro Manila/i);
  });

  test("does not let a stranger think it summons help", async ({ request }) => {
    // The preview is read before the guide and before /sos, both of which say
    // this outright. Somebody meeting the link in a group chat during a storm
    // should not have to open it to find that out.
    const html = await (await request.get("/")).text();
    const description = meta(html, "og:description") ?? "";

    expect(description).toMatch(/hindi.*rescue|does not send rescue/i);
    expect(description).not.toMatch(/rescue service|emergency service|911 hotline/i);
  });

  test("carries a card image that actually resolves", async ({ request }) => {
    const html = await (await request.get("/")).text();
    const image = meta(html, "og:image");

    expect(image).toBeTruthy();
    // Absolute, not relative. A crawler has no page context to resolve a path
    // against, so without `metadataBase` the card silently arrives with no
    // image and nothing anywhere reports an error.
    expect(image).toMatch(/^https?:\/\//);

    const response = await request.get(image!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    // Big enough to be a real card rather than a broken placeholder.
    expect((await response.body()).byteLength).toBeGreaterThan(5_000);
  });

  test("describes the card for people who cannot see it", async ({ request }) => {
    const html = await (await request.get("/")).text();
    expect(meta(html, "og:image:alt")).toBeTruthy();
  });

  test("asks to be shown as a large card", async ({ request }) => {
    const html = await (await request.get("/")).text();
    expect(meta(html, "twitter:card")).toBe("summary_large_image");
    expect(meta(html, "og:image:width")).toBe("1200");
    expect(meta(html, "og:image:height")).toBe("630");
  });

  test("previews in Filipino, because a crawler sends no cookie", async ({
    request,
  }) => {
    // A preview is generated per URL, not per reader - there is no recipient to
    // consult - so it gets the product's own language rather than whichever one
    // the sharer happened to be reading in.
    const html = await (await request.get("/")).text();

    expect(meta(html, "og:locale")).toBe("fil_PH");
    expect(meta(html, "og:description")).toMatch(/lalim ng tubig/i);
  });
});
