"use client";

import { useEffect } from "react";
import { installLogger, log } from "@/lib/logger/logger";

/**
 * Installs the global logger as early as possible in the client tree.
 * Must be mounted at the root (layout.tsx) so all pages benefit.
 */
export function ClientLogger() {
  useEffect(() => {
    installLogger();
    log("client.mounted", {
      path: typeof location !== "undefined" ? location.pathname : null,
      search: typeof location !== "undefined" ? location.search : null,
      viewport:
        typeof window !== "undefined"
          ? { w: window.innerWidth, h: window.innerHeight }
          : null,
    });
  }, []);
  return null;
}
