"use client";

import { useEffect } from "react";

/**
 * Service worker registration with aggressive update checks.
 *
 * Problem this solves: returning users whose browsers cached a buggy SW
 * (e.g. an older version that cached stale HTML pointing to 404 chunks)
 * must be auto-upgraded to the new SW without requiring a manual hard-reload.
 *
 * Strategy:
 *   1. Register /sw.js on mount.
 *   2. Force an update check on every page load.
 *   3. When a new SW takes control (controllerchange), reload the page once
 *      so the user gets fresh HTML + fresh chunk references under the new SW.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let reloadedOnce = false;
    const onControllerChange = () => {
      if (reloadedOnce) return;
      reloadedOnce = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        reg.update().catch(() => {});
      })
      .catch((err) => console.warn("SW registration failed:", err));

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
    };
  }, []);

  return null;
}
