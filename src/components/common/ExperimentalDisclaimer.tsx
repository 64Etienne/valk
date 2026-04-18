"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

const DISMISS_KEY = "valk-disclaimer-dismissed";

/**
 * Persistent footer disclaimer, dismissible per-browser session.
 *
 * Per valk-v3 plan 02-product-repositioning, this must be visible on every
 * page. The user can dismiss it, but it re-appears on next app load.
 */
export function ExperimentalDisclaimer() {
  const [dismissed, setDismissed] = useState(true); // default hidden for SSR

  useEffect(() => {
    try {
      const v = sessionStorage.getItem(DISMISS_KEY);
      setDismissed(v === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* sessionStorage unavailable — honor the dismissal for the UI lifetime */
    }
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <div
      role="note"
      aria-label="Avertissement"
      className="fixed bottom-0 left-0 right-0 z-50 bg-amber-950/95 border-t border-amber-600/40 backdrop-blur-sm"
    >
      <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400 mt-0.5" />
        <p className="flex-1 text-[12px] leading-snug text-amber-100">
          <strong>Outil expérimental.</strong> Ce n&apos;est ni un éthylotest,
          ni un test clinique, ni un substitut à l&apos;un ou à l&apos;autre.
          Ne pas utiliser pour décider de conduire. Si tu as bu, ne conduis pas.
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fermer l'avertissement"
          className="flex-shrink-0 text-amber-300 hover:text-amber-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
