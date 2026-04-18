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
      // pointer-events-none on the wrapper so the disclaimer never blocks
      // clicks on buttons/inputs positioned underneath it (e.g. the
      // "Commencer la capture" CTA at the bottom of the context form).
      // Only the close button re-enables pointer events.
      className="fixed bottom-0 left-0 right-0 z-50 bg-amber-950/95 border-t border-amber-600/40 backdrop-blur-sm pointer-events-none"
    >
      <div className="max-w-3xl mx-auto px-4 py-2 flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-400 mt-0.5" />
        <p className="flex-1 text-[11px] leading-snug text-amber-100">
          <strong>Outil expérimental.</strong> Ni éthylotest, ni test clinique.
          Ne pas utiliser pour décider de conduire. Si tu as bu, ne conduis pas.
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fermer l'avertissement"
          className="flex-shrink-0 text-amber-300 hover:text-amber-100 transition-colors pointer-events-auto"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
