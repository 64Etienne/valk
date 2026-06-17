"use client";

import { useEffect, useRef } from "react";

interface WakeLockSentinel {
  release(): Promise<void>;
  addEventListener(event: "release", handler: () => void): void;
}

interface WakeLockAPI {
  request(type: "screen"): Promise<WakeLockSentinel>;
}

/**
 * Robust screen wake lock.
 * Re-acquires on visibilitychange → visible because browsers
 * automatically release the lock when the tab goes hidden.
 */
export function useWakeLock(enabled: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const nav = navigator as Navigator & { wakeLock?: WakeLockAPI };
    if (!nav.wakeLock) return;

    let cancelled = false;

    const acquire = async () => {
      try {
        const sentinel = await nav.wakeLock!.request("screen");
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        sentinel.addEventListener("release", () => {
          sentinelRef.current = null;
        });
      } catch (err) {
        console.warn("wakeLock.request failed:", err);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !sentinelRef.current) {
        acquire();
      }
    };

    acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
    };
  }, [enabled]);
}
