"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getBaselineStatus,
  type BaselineStatus,
} from "@/lib/calibration/baseline";

export function BaselineStatusBadge() {
  const [status, setStatus] = useState<BaselineStatus | null>(null);
  useEffect(() => setStatus(getBaselineStatus()), []);
  if (!status) return null;

  return (
    <Link
      href="/baseline"
      className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border border-zinc-800 bg-zinc-900/50 transition-colors hover:border-zinc-700"
    >
      {status.state === "none" ? (
        <span className="text-zinc-400">
          Pas de baseline — <span className="text-violet-400 underline">calibrer</span>
        </span>
      ) : status.state === "fresh" ? (
        <span className="text-emerald-400">✓ Baseline à jour</span>
      ) : status.state === "aging" ? (
        <span className="text-amber-400">⚠ Baseline un peu vieille</span>
      ) : (
        <span className="text-red-400">⚠ Baseline obsolète — recalibrer</span>
      )}
    </Link>
  );
}
