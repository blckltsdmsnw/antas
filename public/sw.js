/**
 * Antas offline cache.
 *
 * No signal is the condition this application is most likely to be opened in,
 * so opening to a blank page is a real failure rather than a missing nicety.
 * This keeps the shell and the guide usable with nothing at all.
 *
 * THREE RULES, and the third is the one that matters:
 *
 * 1. The app shell and `/gabay` are cached and served cache-first. The guide is
 *    static advice and hotline numbers - it cannot go stale in any way that
 *    hurts somebody, and it is the page most worth having offline.
 *
 * 2. Everything else is network-first, falling back to the cache. A live answer
 *    is always preferred; the cache exists for when there is none.
 *
 * 3. FLOOD DATA IS NOT CACHED HERE AT ALL, and cannot be. `reports_near` is a
 *    Supabase RPC, which is a POST, and the Cache API refuses to store a
 *    non-GET request. An earlier draft of this file had a whole branch for
 *    stamping report responses with their age; it could never once have run.
 *
 *    So the page keeps its own last-good snapshot and decides whether it is
 *    recent enough to draw, refusing past six hours - see
 *    src/lib/offline/staleness.ts, where that decision lives and is tested.
 *    That is the better place for it regardless: the rule is about whether
 *    flood readings are still true, which is a question about the data and not
 *    about the transport.
 */

const VERSION = "antas-v1";
const SHELL = `${VERSION}-shell`;

/**
 * Pre-cached on install.
 *
 * Deliberately short. `/gabay` earns its place because it is useful with no
 * data at all; the map does not, because a map with no reports is a basemap and
 * the tiles are not ours to bundle.
 */
const PRECACHE = ["/", "/gabay", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      // A failed pre-cache must not block activation: a missing entry means one
      // page is unavailable offline, while a stuck worker means all of them are.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function keep(request, response) {
  const cache = await caches.open(SHELL);
  await cache.put(request, response);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache authentication or stored photographs. A stale session is a
  // confusing failure, and a distressed person's photograph should not sit in a
  // cache on a shared device any longer than the page that showed it.
  if (url.pathname.includes("/auth/") || url.pathname.includes("/storage/")) {
    return;
  }

  const shellRequest =
    request.mode === "navigate" && PRECACHE.includes(url.pathname);

  if (shellRequest) {
    // Cache-first for the shell: it is the difference between the application
    // opening and not opening at all. The network copy still refreshes it.
    event.respondWith(
      caches.match(request).then((hit) => {
        const live = fetch(request)
          .then((response) => {
            if (response.ok) void keep(request, response.clone());
            return response;
          })
          .catch(() => hit);
        return hit ?? live;
      }),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Only pages and the app's own assets. Third-party map tiles are
        // deliberately left alone: caching a city of them would fill a phone's
        // storage to save a basemap the user can still read without.
        if (response.ok && url.origin === self.location.origin) {
          void keep(request, response.clone());
        }
        return response;
      })
      .catch(async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        throw new Error("offline and nothing cached");
      }),
  );
});
