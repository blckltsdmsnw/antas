/**
 * Films the authenticated side: a real SOS with the flood clip as the camera
 * feed, a depth report with a flood photograph, and a moderator working the
 * console. LOCAL STACK ONLY - localhost:3000 + `npx supabase start`. Never
 * point this at production: it submits a real SOS and decides it.
 *
 *   node video/capture-console.mjs               (from the app root)
 *   FLOOD_Y4M=... FLOOD_JPG=... node video/capture-console.mjs
 *
 * What capture.mjs deliberately refuses to film (sending an SOS would put a
 * fake emergency in the database) is exactly what this films - which is why
 * this script exists separately and hard-fails on any non-local URL.
 *
 * Writes scene-sos-flood.webm, scene-report-flood.webm, scene-console.webm
 * into video/public/captures/ alongside capture.mjs's scenes.
 */
import { chromium, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";
import {
  readFileSync,
  readdirSync,
  renameSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(import.meta.dirname, "public", "captures");
// 127.0.0.1 rather than localhost: the local GoTrue's site_url and redirect
// allow-list name 127.0.0.1:3000, and the PKCE cookie must be set on the same
// host the magic link redirects back to.
const BASE = "http://127.0.0.1:3000";
const MAIL = "http://127.0.0.1:54324";

const FLOOD_Y4M = process.env.FLOOD_Y4M;
const FLOOD_JPG = process.env.FLOOD_JPG;
const MOD_EMAIL = "modemo@example.test";
// New Lower Bicutan hotspot from scripts/seed.ts - where Elijah actually is.
const GEO = { latitude: 14.497, longitude: 121.053 };

const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => [
      line.slice(0, line.indexOf("=")).trim(),
      line.slice(line.indexOf("=") + 1).trim(),
    ]),
);

if (!env.NEXT_PUBLIC_SUPABASE_URL?.includes("127.0.0.1")) {
  console.error("refusing to run: .env.local does not point at local Supabase");
  process.exit(1);
}

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const PHONE = {
  ...devices["iPhone 13"],
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
};
const VIEWPORT = { width: 390, height: 844 };

const beat = (page, ms = 900) => page.waitForTimeout(ms);

const tap = async (page, locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await beat(page, 320);
  await page.mouse.down();
  await beat(page, 110);
  await page.mouse.up();
};

async function scene(browser, name, steps, opts = {}) {
  const context = await browser.newContext({
    ...PHONE,
    viewport: VIEWPORT,
    recordVideo: { dir: OUT, size: VIEWPORT },
    locale: "en-PH",
    timezoneId: "Asia/Manila",
    geolocation: opts.geolocation ?? GEO,
    permissions: ["geolocation", "camera"],
  });

  const page = await context.newPage();

  // Same daylight shift as capture.mjs: Date alone, never the timers.
  await page.addInitScript(() => {
    const Real = Date;
    const now = new Real();
    const target = new Real(now);
    target.setHours(10, 20, 0, 0);
    const delta = target.getTime() - now.getTime();
    // @ts-expect-error - replacing the global on purpose
    globalThis.Date = class extends Real {
      constructor(...args) {
        super(...(args.length ? args : [Real.now() + delta]));
      }
      static now() {
        return Real.now() + delta;
      }
    };
  });

  // Visible touch dot, same as capture.mjs.
  await page.addInitScript(() => {
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:fixed;z-index:2147483647;width:34px;height:34px;margin:-17px 0 0 -17px;" +
      "border-radius:50%;background:rgba(15,23,42,.28);border:2px solid rgba(255,255,255,.9);" +
      "pointer-events:none;opacity:0;transition:opacity .18s,transform .12s";
    addEventListener("DOMContentLoaded", () => document.body.append(dot));
    addEventListener("mousemove", (e) => {
      dot.style.left = `${e.clientX}px`;
      dot.style.top = `${e.clientY}px`;
      dot.style.opacity = "1";
    });
    addEventListener("mousedown", () => (dot.style.transform = "scale(.75)"));
    addEventListener("mouseup", () => (dot.style.transform = "scale(1)"));
  });

  process.stdout.write(`  filming ${name} ... `);
  let failed = false;
  try {
    await steps(page);
  } catch (error) {
    failed = true;
    process.stdout.write("FAILED\n");
    console.error(`    ${error.message.split("\n")[0]}`);
    console.error(`    page was at: ${page.url()}`);
  }
  await context.close();

  // A scene that opens a popup (the directions hand-off) writes one video per
  // page; name them scene-<name>.webm, scene-<name>-2.webm in creation order.
  const written = readdirSync(OUT)
    .filter((f) => f.endsWith(".webm") && !f.startsWith("scene-"))
    .map((f) => join(OUT, f))
    .sort((a, b) => statSync(a).birthtimeMs - statSync(b).birthtimeMs);
  if (written.length >= 1) {
    written.forEach((file, i) => {
      const suffix = i === 0 ? "" : `-${i + 1}`;
      renameSync(file, join(OUT, `scene-${name}${suffix}.webm`));
    });
    if (!failed) process.stdout.write("ok\n");
  } else {
    process.stdout.write("no video written\n");
  }
  return !failed;
}

const SCENES = {
  /**
   * A real SOS, with the sourced flood clip on the fake camera device. The
   * viewfinder shows moving water, the shutter captures a real frame, and the
   * signal genuinely lands in the queue - no compositing anywhere.
   */
  async "sos-flood"(page) {
    await page.goto(`${BASE}/sos`, { waitUntil: "domcontentloaded" });
    const hold = page.getByRole("button", { name: /Pindutin nang 3 segundo/ });
    await hold.waitFor({ timeout: 60_000 });
    await beat(page, 1300); // the "live photo required, never gallery" card

    await tap(page, page.getByRole("button", { name: "Buksan ang camera" }));
    await page.locator("video.capture-view").waitFor({ timeout: 15_000 });
    await beat(page, 2400); // the flood plays in the viewfinder

    await tap(page, page.locator("button.shutter"));
    await page
      .getByRole("button", { name: "Gamitin ang larawang ito" })
      .waitFor({ timeout: 10_000 });
    await beat(page, 1000);
    await tap(page, page.getByRole("button", { name: "Gamitin ang larawang ito" }));
    await beat(page, 900);

    const box = await hold.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await beat(page, 3400); // the ring fills all the way - this one sends
    await page.mouse.up();
    await beat(page, 2400); // "Naipadala na ang SOS mo"

    // The callback number: works with no account, which is the point worth
    // showing. The field sits below the confirmation.
    await page.mouse.wheel(0, 360);
    await beat(page, 600);
    const phone = page.getByPlaceholder("0917 123 4567");
    await tap(page, phone);
    await phone.type("09171234567", { delay: 70 });
    await beat(page, 500);
    await tap(page, page.getByRole("button", { name: "I-save ang numero ko" }));
    await beat(page, 2000);
  },

  /**
   * "Direksyon papunta rito": the one-tap Google Maps hand-off to the caller's
   * exact location. The popup is a second page, recorded as its own video.
   */
  async direksyon(page) {
    await injectSession(page, MOD_EMAIL);
    const { data: signals, error } = await admin
      .from("sos_signals")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    if (!signals?.[0]) throw new Error("no SOS signal to open");

    await page.goto(`${BASE}/console/${signals[0].id}`, {
      waitUntil: "domcontentloaded",
    });
    const directions = page.getByRole("link", {
      name: "Direksyon papunta rito",
    });
    await directions.waitFor({ timeout: 30_000 });
    await beat(page, 1600);

    const [popup] = await Promise.all([
      page.context().waitForEvent("page"),
      tap(page, directions),
    ]);
    await popup.waitForLoadState("domcontentloaded").catch(() => {});
    // Wait for an actual route (a "NN min" chip) before touching anything -
    // dismissing the interstitial too early has landed on "No routes found".
    await popup
      .getByText(/\d+\s*min/)
      .first()
      .waitFor({ timeout: 20_000 })
      .catch(() => {});
    await popup.waitForTimeout(1500);

    // Google covers the mobile web map with an app-install interstitial;
    // "Go back to web" clears it so the route itself is what gets filmed.
    await popup
      .getByText("Go back to web", { exact: false })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    await popup.waitForTimeout(4500);
  },

  /**
   * A depth report carrying a flood photograph, via the native-camera input.
   * Steps through depth levels on the way to Tuhod - the body diagram filling
   * is the page's best motion, and a form that only sits there reads as a
   * pause in the finished video.
   */
  async "report-flood"(page) {
    // Depth reports require an account (only SOS is anonymous); a signed-out
    // submit fails with "Mag-sign in muna bago mag-report."
    await injectSession(page, "resident@example.test");
    await page.goto(`${BASE}/report`, { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "I-report", exact: true })
      .waitFor({ timeout: 60_000 });
    await beat(page, 1100);

    for (const level of ["Baywang", "Tuhod"]) {
      const button = page.getByRole("button", { name: level, exact: true });
      if (await button.count()) await tap(page, button.first());
      await beat(page, 850);
    }

    // Tap the real button; the native hand-off happens off-screen (the OS
    // camera on a phone, the picker here) and the photo comes back. A raw
    // mouse tap on the label does not forward to the hidden input - use the
    // locator click, which does, and still moves the visible dot.
    const chooser = page.waitForEvent("filechooser");
    const openCamera = page.getByText("Kumuha ng larawan");
    await openCamera.scrollIntoViewIfNeeded();
    await beat(page, 500);
    await openCamera.click();
    await (await chooser).setFiles(FLOOD_JPG);
    await beat(page, 1700); // the photo lands on the card

    // The attached photo pushes the submit button below the fold, where a tap
    // lands on nothing at all - silently. Scroll it into view and clear of the
    // fixed bottom nav before tapping.
    const submit = page.getByRole("button", { name: "I-report", exact: true });
    await submit.scrollIntoViewIfNeeded();
    await beat(page, 800);
    const sb = await submit.boundingBox();
    if (sb && sb.y + sb.height / 2 > 720) {
      await page.mouse.wheel(0, 300);
      await beat(page, 600);
    }
    await tap(page, submit);
    // The upload takes a moment; the finished video must SHOW the report being
    // accepted, so wait for the app's own confirmation and hold on it.
    await page
      .getByText("Salamat. Naitala na ang report mo.")
      .waitFor({ timeout: 30_000 });
    await beat(page, 2600);
  },

  /**
   * The moderator's side, via the real magic-link flow: type the email, send,
   * follow the link the local mail catcher received, work the queue.
   */
  async console(page) {
    // A stale link from an earlier run would be found before the fresh mail
    // arrives; start the scene with an empty inbox.
    await fetch(`${MAIL}/api/v1/messages`, { method: "DELETE" }).catch(() => {});

    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    const email = page.locator("#email");
    await email.waitFor({ timeout: 60_000 });
    await beat(page, 1400);

    await tap(page, email);
    await email.type(MOD_EMAIL, { delay: 90 });
    await beat(page, 700);
    await tap(page, page.getByRole("button", { name: "Send sign-in link" }));
    await beat(page, 2200); // the check-your-email card

    // The link the filmed form sent is real, but the redirect chain hops hosts
    // and strands the session cookie; inject the session directly instead.
    await injectSession(page, MOD_EMAIL);

    await page.goto(`${BASE}/console`, { waitUntil: "domcontentloaded" });
    await page.getByText("Mga SOS").waitFor({ timeout: 60_000 });
    await beat(page, 2600); // the queue, with the flood signal on it

    const card = page.locator('a[href^="/console/"]').first();
    await card.waitFor({ timeout: 15_000 });
    await tap(page, card);
    await page
      .getByRole("button", { name: "Kumpirmahin" })
      .waitFor({ timeout: 30_000 });
    await beat(page, 2200); // the photo and assessment
    await page.mouse.wheel(0, 500);
    await beat(page, 2000);

    // The decision buttons sit at the page's end, underneath the fixed bottom
    // nav; tapping the raw center hits the nav's I-report tab instead. Scroll
    // the whole page out first so the button is clear of the overlay.
    await page.mouse.wheel(0, 2000);
    await beat(page, 900);
    const confirm = page.getByRole("button", { name: "Kumpirmahin" });
    const confirmBox = await confirm.boundingBox();
    if (confirmBox && confirmBox.y + confirmBox.height / 2 > 720) {
      await page.mouse.wheel(0, 400);
      await beat(page, 700);
    }
    await tap(page, confirm);
    await page.waitForURL(/\/console$/, { timeout: 30_000 });
    await beat(page, 2400); // back on the queue, signal decided
  },
};

/** Create the local account if it does not exist yet. */
async function ensureUser(email) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (!error) return created.user.id;
  const { data: list } = await admin.auth.admin.listUsers();
  const user = list.users.find((u) => u.email === email);
  if (!user) throw error;
  return user.id;
}

/** A real session, minted server-side. */
async function mintSession(email) {
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError) throw linkError;
  const anon = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, flowType: "implicit" } },
  );
  const { data, error } = await anon.auth.verifyOtp({
    type: "email",
    token_hash: link.properties.hashed_token,
  });
  if (error) throw error;
  return data.session;
}

/**
 * Sign the page's browser in by handing it the session in the cookie format
 * @supabase/ssr reads ("base64-" + base64url JSON, chunked at 3180,
 * sb-<ref>-auth-token).
 */
async function injectSession(page, email) {
  await ensureUser(email);
  const session = await mintSession(email);
  const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const value =
    "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const CHUNK = 3180;
  const cookies = [];
  if (value.length <= CHUNK) {
    cookies.push({ name: `sb-${ref}-auth-token`, value, url: BASE });
  } else {
    for (let i = 0; i * CHUNK < value.length; i++) {
      cookies.push({
        name: `sb-${ref}-auth-token.${i}`,
        value: value.slice(i * CHUNK, (i + 1) * CHUNK),
        url: BASE,
      });
    }
  }
  await page.context().addCookies(cookies);
}

async function ensureModerator() {
  // The SOS just filmed knows its own barangay; scope the moderator to exactly
  // that one so the queue match is guaranteed and nothing wider is shown.
  const { data: signals, error } = await admin
    .from("sos_signals")
    .select("id, barangay, status, created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const signal = signals?.[0];
  if (!signal) throw new Error("no SOS signal in the local database");

  let barangay = signal.barangay;
  if (!barangay) {
    // Local lookup failed to name it; give the row the barangay the fake
    // geolocation sits in so the scoped queue can match.
    barangay = "New Lower Bicutan";
    await admin.from("sos_signals").update({ barangay }).eq("id", signal.id);
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({ email: MOD_EMAIL, email_confirm: true });
  let userId = created?.user?.id;
  if (createError) {
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === MOD_EMAIL)?.id;
    if (!userId) throw createError;
  }

  const { error: modError } = await admin
    .from("moderators")
    .upsert({ user_id: userId, barangay, role: "moderator" }, { onConflict: "user_id" });
  if (modError) throw modError;
  console.log(`  moderator ${MOD_EMAIL} scoped to ${barangay}`);
}

const only = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    ...(FLOOD_Y4M ? [`--use-file-for-fake-video-capture=${FLOOD_Y4M}`] : []),
  ],
});

console.log(`Filming the authenticated side from ${BASE}`);
const wants = (name) => only.length === 0 || only.includes(name);

if (wants("sos-flood")) await scene(browser, "sos-flood", SCENES["sos-flood"]);
if (wants("report-flood"))
  await scene(browser, "report-flood", SCENES["report-flood"]);
if (wants("console")) {
  await ensureModerator();
  await scene(browser, "console", SCENES.console);
}
if (wants("direksyon")) {
  await ensureModerator();
  // The moderator starts a couple of kilometres from the caller; with the
  // same point at both ends Google Maps answers "No routes found".
  await scene(browser, "direksyon", SCENES.direksyon, {
    geolocation: { latitude: 14.513, longitude: 121.043 },
  });
}

await browser.close();
console.log("done");
