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
// A separate account for the board: ensureModerator() scopes MOD_EMAIL back to
// a plain moderator for the console scene, which would take the board away.
const MASTER_EMAIL = "master@example.test";
const RESPONDER_EMAIL = "rescuer@example.test";
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
const DESKTOP = { width: 1280, height: 800 };

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

/**
 * A tap that cannot land on the wrong thing.
 *
 * The bottom nav is fixed, and anything near the foot of the page sits under
 * it - the camera shutter, a board card's move button, a submit. A coordinate
 * tap there hits the I-report tab and the scene films the wrong screen without
 * failing. The element click scrolls, hit-tests, and throws if it is covered.
 */
const press = async (page, locator) => {
  // `scrollIntoViewIfNeeded` is satisfied by a partly visible element, which
  // is exactly the state a button half-under the nav is already in - so it
  // scrolls nothing and the click lands on the nav's own I-report link. That
  // link points at the page we are already on, so Next.js does nothing, no
  // error is raised, and the scene films a screen that never advanced.
  // scrollIntoView({block:"center"}) does not help either: the element is
  // already inside the scrollport, just underneath an overlay.
  //
  // Wheel until the target sits clear of the nav, the way the console scene
  // has always done it, then click.
  await locator.scrollIntoViewIfNeeded();
  const clearOf = page.viewportSize().height - 130;
  for (let i = 0; i < 6; i++) {
    const box = await locator.boundingBox();
    if (process.env.DEBUG_PRESS) {
      console.error(
        `      press: box=${JSON.stringify(box)} clearOf=${clearOf} scrollY=${await page.evaluate(() => window.scrollY)}`,
      );
    }
    if (!box || box.y + box.height / 2 <= clearOf) break;
    await page.mouse.wheel(0, 220);
    await beat(page, 260);
  }
  await beat(page, 500);
  await locator.click();
};

async function scene(browser, name, steps, opts = {}) {
  // The board refuses to render on a phone and says so, which is correct
  // behaviour and useless footage - film it at desk width instead.
  const size = opts.desktop ? DESKTOP : VIEWPORT;
  const context = await browser.newContext({
    ...(opts.desktop ? {} : PHONE),
    viewport: size,
    recordVideo: { dir: OUT, size },
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
    // A still of the moment it gave up: a missed tap lands somewhere, and the
    // URL alone does not say where.
    await page
      .screenshot({ path: join(OUT, `scene-${name}-FAILED.png`), fullPage: true })
      .then(() => console.error(`    screenshot: scene-${name}-FAILED.png`))
      .catch(() => {});
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

    await press(page, page.locator("button.shutter"));
    const useIt = page.getByRole("button", { name: "Gamitin ang larawang ito" });
    await useIt.waitFor({ timeout: 10_000 });
    await beat(page, 1000);
    await press(page, useIt);
    await beat(page, 900);

    // The six optional chips, above the hold. Tapping one is worth filming and
    // tapping none is a real answer too - a chip-less signal is corroborated by
    // any active report nearby rather than by floods only.
    const chip = page.getByRole("radio", { name: "Baha", exact: true });
    if (await chip.count()) {
      await chip.first().scrollIntoViewIfNeeded();
      await beat(page, 1200); // all six readable
      await tap(page, chip.first());
      await beat(page, 900);
    }

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

    // /report opens on the hazard picker now, not on the depth gauge. There is
    // no submit button on this screen at all, so the old wait for "I-report"
    // timed out here rather than at the end.
    await page.getByRole("button", { name: "Baha", exact: true }).waitFor({ timeout: 60_000 });
    await beat(page, 1800); // all six hazards readable before anything is tapped
    await tap(page, page.getByRole("button", { name: "Baha", exact: true }));
    await page
      .getByRole("button", { name: "I-report", exact: true })
      .waitFor({ timeout: 30_000 });
    await beat(page, 1100);

    for (const level of ["Baywang", "Tuhod"]) {
      const button = page.getByRole("button", { name: level, exact: true });
      if (await button.count()) await tap(page, button.first());
      await beat(page, 850);
    }

    // The in-page viewfinder, not a file picker. This was `source="native"`
    // and a filechooser until Mr. Peralta asked that reports be captured with
    // the built-in camera; the flow is now the same three taps as /sos, and
    // the fake-camera y4m feeds it.
    const openCamera = page.getByRole("button", { name: "Kumuha ng larawan" });
    await press(page, openCamera);
    await page.locator("video.capture-view").waitFor({ timeout: 15_000 });
    await beat(page, 2200); // the flood plays in the viewfinder
    await press(page, page.locator("button.shutter"));
    const usePhoto = page.getByRole("button", { name: "Gamitin ang larawang ito" });
    await usePhoto.waitFor({ timeout: 10_000 });
    await beat(page, 900);
    await press(page, usePhoto);
    await beat(page, 1700); // the photo lands on the card

    // The attached photo pushes the submit button below the fold, under the
    // fixed nav; press() wheels it clear before clicking.
    await press(page, page.getByRole("button", { name: "I-report", exact: true }));
    // The upload takes a moment; the finished video must SHOW the report being
    // accepted, so wait for the app's own confirmation and hold on it.
    await page
      .getByText("Salamat. Naitala na ang report mo.")
      .waitFor({ timeout: 30_000 });
    await beat(page, 2600);
  },

  /**
   * Ako -> Responder: a signed-in person says they are one, and becomes
   * assignable on the board. Films the half of the workflow the master admin
   * never sees, and has to run before `board` or the roster is empty.
   */
  async responder(page) {
    await injectSession(page, RESPONDER_EMAIL);
    await page.goto(`${BASE}/ako`, { waitUntil: "domcontentloaded" });

    // /ako carries several cards and more than one "I-save"; scope everything
    // to the responder card rather than to the page.
    const card = page
      .locator("section.phone-card")
      .filter({ has: page.getByRole("heading", { name: "Responder" }) });
    await card.waitFor({ timeout: 60_000 });
    await card.scrollIntoViewIfNeeded();
    await beat(page, 2200); // the note: only the master admin sees name and number

    const name = card.getByRole("textbox").first();
    await tap(page, name);
    await name.type("Ka Ramon", { delay: 90 });
    await beat(page, 700);

    await card.locator("select").first().selectOption({ label: "Barangay rescue" });
    await beat(page, 900);

    // The fixed bottom nav sits over anything near the page end: a raw tap on
    // the save button lands on the I-report tab instead and navigates away.
    // Centre it in the viewport first, then tap.
    const save = card.getByRole("button", { name: "I-save" });
    await save.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await beat(page, 500);
    await tap(page, save);
    await card.getByText("Naka-save.").waitFor({ timeout: 30_000 });
    await beat(page, 2200);
  },

  /**
   * The master admin's board: four columns, reports and signals together, a
   * card moved by its own button rather than by drag (a synthesised drag films
   * as a card that teleports, and the button is the accessible path anyway).
   * Desktop viewport - the board says so on a phone and means it.
   */
  async board(page) {
    await injectSession(page, MASTER_EMAIL);
    await page.goto(`${BASE}/console/board`, { waitUntil: "domcontentloaded" });

    await page.getByText("Kailangang suriin").first().waitFor({ timeout: 60_000 });
    await beat(page, 2600); // the four columns, and the graph above them

    // Incidents per hour and the barangay ranking, both drawn by hand in SVG.
    const graph = page.getByText("Nakaraang 48 oras");
    if (await graph.count()) {
      await graph.first().scrollIntoViewIfNeeded();
      await beat(page, 2400);
    }

    // The bottom nav is fixed and still present at desk width, so a card near
    // the foot of a column sits underneath it. A coordinate tap there lands on
    // the Mapa tab and the scene silently films the map instead - use the
    // element click, which scrolls, hit-tests, and fails loudly if covered.
    // Move one card: needs checking -> needs attention.
    const toAttention = page.getByRole("button", { name: /Kailangan ng atensyon/ });
    if (await toAttention.count()) {
      await press(page, toAttention.first());
      await beat(page, 2200); // the card lands in its new column
    }

    // Then assign it: the panel asks who, the roster answers with the
    // responder registered in the scene before this one.
    const toAssigned = page.getByRole("button", { name: /May nakatalaga/ });
    if (await toAssigned.count()) {
      await press(page, toAssigned.first());
      await page.getByText("Sino ang itatalaga?").waitFor({ timeout: 15_000 });
      await beat(page, 1600);
      // By name, not by position: this is the responder the scene before this
      // one filmed registering, so the two halves read as one story.
      const named = page.getByRole("radio", { name: /Ka Ramon/ });
      const who = (await named.count()) ? named.first() : page.getByRole("radio").first();
      if (await who.count()) {
        await press(page, who);
        await beat(page, 800);
      }
      const assign = page.getByRole("button", { name: "Italaga" });
      if (await assign.count()) {
        await press(page, assign.first());
        await beat(page, 2600); // the card now names its responder
      }
    }
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

/**
 * The board's own account, granted master_admin directly. Kept apart from
 * MOD_EMAIL because ensureModerator() narrows that one back to `moderator`
 * for the console scene, and a plain moderator is refused the board.
 */
async function ensureMaster() {
  const userId = await ensureUser(MASTER_EMAIL);
  const { error } = await admin
    .from("moderators")
    .upsert(
      { user_id: userId, barangay: "South Signal Village", role: "master_admin" },
      { onConflict: "user_id" },
    );
  if (error) throw error;
  console.log(`  ${MASTER_EMAIL} is the master admin`);
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
// Before the board: the roster has to have somebody in it to assign.
if (wants("responder")) await scene(browser, "responder", SCENES.responder);
if (wants("board")) {
  await ensureMaster();
  await scene(browser, "board", SCENES.board, { desktop: true });
}
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
