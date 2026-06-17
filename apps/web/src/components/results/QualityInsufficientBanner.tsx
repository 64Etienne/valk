"use client";

import Link from "next/link";
import { AlertCircle, RefreshCcw } from "lucide-react";
import { Button } from "../ui/Button";
import type { QualityIssue } from "@/lib/hooks/useAnalysisStream";

interface QualityInsufficientBannerProps {
  issues: QualityIssue[];
}

/**
 * Phase 1.2 (valk-v3): rendered when the server refused to score because
 * of hard quality gates (low FPS, failed voice capture, unstable face
 * tracking). Shows the user exactly why we're not giving them a score
 * and provides actionable next steps.
 */
export function QualityInsufficientBanner({
  issues,
}: QualityInsufficientBannerProps) {
  return (
    <div className="max-w-lg mx-auto space-y-6 p-6">
      <div className="rounded-2xl border-2 border-amber-500/60 bg-amber-950/40 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-8 h-8 flex-shrink-0 text-amber-400" />
          <div>
            <h1 className="text-xl font-bold text-amber-200">
              Capture insuffisante pour un résultat fiable
            </h1>
            <p className="text-sm text-amber-100/80 mt-1">
              Plutôt que de t&apos;afficher un score potentiellement faux, on
              t&apos;explique ce qui n&apos;a pas fonctionné. Un seul gros
              problème suffit à rendre l&apos;analyse non interprétable.
            </p>
          </div>
        </div>

        <ul className="space-y-3 pt-2">
          {issues.map((iss, i) => (
            <li
              key={`${iss.gate}-${i}`}
              className="rounded-lg bg-zinc-950/60 border border-zinc-800 p-4"
            >
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-sm font-medium text-amber-300">
                  {labelForGate(iss.gate)}
                </span>
                <span className="text-xs text-zinc-400 font-mono">
                  {iss.measuredValue} / {iss.threshold}
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                {iss.humanReason}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-100">
          Comment améliorer la prochaine capture
        </h2>
        <ul className="text-xs text-zinc-400 space-y-1.5 list-disc pl-4">
          <li>Va dans un endroit bien éclairé (lumière du jour idéalement)</li>
          <li>
            Tiens l&apos;iPhone à 25-30 cm de ton visage, appareil posé contre
            un support si possible
          </li>
          <li>Pendant la lecture : pièce raisonnablement calme, voix posée</li>
          <li>Évite les contre-jours (fenêtre derrière toi)</li>
          <li>Mets la luminosité de l&apos;écran au maximum</li>
        </ul>
      </div>

      <div className="flex gap-2">
        <Link href="/capture" className="flex-1">
          <Button size="lg" className="w-full">
            <RefreshCcw className="w-4 h-4" />
            Refaire une capture
          </Button>
        </Link>
      </div>

      <p className="text-xs text-zinc-500 text-center leading-relaxed">
        Cette refuse-to-score protection évite de te donner un verdict
        inventé. C&apos;est volontaire.
      </p>
    </div>
  );
}

function labelForGate(gate: string): string {
  switch (gate) {
    case "fps_below_minimum":
      return "Cadence de capture trop faible";
    case "voiced_ratio_below_minimum":
      return "Capture vocale défaillante";
    case "face_tracking_unstable":
      return "Tracking du visage instable";
    case "pupil_asymmetry_suggests_landmarking_error":
      return "Détection pupillaire incohérente";
    case "blink_rate_sample_below_minimum":
      return "Échantillon de clignements trop court";
    default:
      return gate;
  }
}
