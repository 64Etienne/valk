"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "../ui/Button";

interface BaselineRequiredModalProps {
  onContinueWithoutBaseline: () => void;
}

/**
 * Phase 1.3 (valk-v3): blocking modal shown when the user opens /capture
 * in analyze mode without a stored personal baseline. Presents the two
 * honest options:
 *   - Calibrer (3 min) → primary, redirects to /baseline
 *   - Continuer sans baseline → secondary, keeps the user moving but
 *     they see reduced-confidence results (enforced server-side via
 *     quality gates in Phase 1.2).
 */
export function BaselineRequiredModal({
  onContinueWithoutBaseline,
}: BaselineRequiredModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/90 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl p-6 space-y-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-zinc-100">
              Aucune baseline personnelle enregistrée
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              Sans référence sobre de tes mesures habituelles, l&apos;analyse
              se rabat sur des normes populationnelles — sa précision est
              significativement réduite.
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 p-4 space-y-2">
          <p className="text-xs text-zinc-300 font-medium">
            Pourquoi calibrer ?
          </p>
          <ul className="text-xs text-zinc-400 space-y-1 list-disc pl-4">
            <li>
              La variance inter-individuelle des indicateurs oculomoteurs et
              vocaux est très large (blink rate 5-35/min, pursuit gain 0,65-1,05
              en normal).
            </li>
            <li>
              Les études qui atteignent de bonnes précisions (Suffoletto 2023
              98%, Tyson 2021) utilisent toutes une référence <em>within-subject</em>.
            </li>
            <li>
              Calibration = 3 min à faire une fois, à jeun, reposé, en bonne
              lumière. Stockée uniquement sur ton appareil.
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <Link href="/baseline" className="w-full">
            <Button size="lg" className="w-full">
              Calibrer maintenant (3 min)
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="md"
            className="w-full text-zinc-400"
            onClick={onContinueWithoutBaseline}
          >
            Continuer sans baseline (précision réduite)
          </Button>
        </div>
      </div>
    </div>
  );
}
