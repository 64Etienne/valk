"use client";

import { Car, AlertTriangle, XCircle } from "lucide-react";
import { computeVerdict } from "@/lib/analysis/verdict";
import type { AnalysisResult } from "@/types";

interface VerdictBannerProps {
  result: AnalysisResult;
}

const STYLE: Record<
  "green" | "yellow" | "red",
  { bg: string; border: string; text: string; icon: typeof Car }
> = {
  green: {
    bg: "bg-emerald-950/40",
    border: "border-emerald-500/50",
    text: "text-emerald-300",
    icon: Car,
  },
  yellow: {
    bg: "bg-amber-950/40",
    border: "border-amber-500/50",
    text: "text-amber-300",
    icon: AlertTriangle,
  },
  red: {
    bg: "bg-red-950/50",
    border: "border-red-500/60",
    text: "text-red-300",
    icon: XCircle,
  },
};

export function VerdictBanner({ result }: VerdictBannerProps) {
  const verdict = computeVerdict(result);
  const s = STYLE[verdict.level];
  const Icon = s.icon;

  return (
    <div className={`rounded-2xl border-2 p-6 ${s.bg} ${s.border}`}>
      <div className="flex items-start gap-4">
        <Icon className={`w-12 h-12 flex-shrink-0 ${s.text}`} />
        <div className="flex-1">
          <h2 className={`text-2xl font-bold ${s.text}`}>{verdict.headline}</h2>
          <p className="text-zinc-300 text-sm mt-2">{verdict.detail}</p>
          {verdict.reducedConfidence && (
            <p className="text-zinc-400 text-xs mt-3 italic">
              ⚠ Qualité de capture faible — ce verdict doit être interprété avec prudence.
            </p>
          )}
        </div>
      </div>
      {verdict.level === "red" && (
        <div className="mt-5 pt-5 border-t border-red-500/30">
          <p className="text-zinc-400 text-xs mb-2">
            Rappel : cet outil n&apos;est pas un éthylotest, n&apos;est pas un
            dispositif médical, et n&apos;a aucune valeur légale. Il ne
            remplace pas ton jugement ni celui d&apos;un professionnel.
          </p>
          <div className="flex gap-2 flex-wrap">
            <a
              href="https://m.uber.com/"
              target="_blank"
              rel="noopener"
              className="flex-1 text-center bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Appeler un Uber
            </a>
            <a
              href="tel:3117"
              className="flex-1 text-center bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Appeler un proche
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
