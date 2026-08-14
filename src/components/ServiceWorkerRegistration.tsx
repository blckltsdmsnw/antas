"use client";

import { useEffect } from "react";

/**
 * Registers the offline cache, and nothing else.
 *
 * Renders no markup: it exists so `layout.tsx` can stay a server component
 * while still arranging for the worker to be installed on every route.
 *
 * Registration is deferred until after load. A service worker installing while
 * the map is still fetching competes with it for the connection, and on the
 * cheap phone during a storm this product is built for, the first paint matters
 * far more than the second visit does.
 *
 * Failure is silent by design. No offline cache is a smaller loss than an error
 * on the page somebody opened while standing in water, and there is nothing
 * they could do about it either way.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // In development the worker would serve stale bundles between edits, which
    // reads as the application being broken rather than as caching working.
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
