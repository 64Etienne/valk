"use client";

import { CheckCircle2, Info, AlertTriangle, XCircle } from "lucide-react";
import { computeVerdict } from "@/lib/analysis/verdict";
import type { AnalysisResult } from "@/types";

interface VerdictBannerProps {
  result: AnalysisResult;
}

const STYLE: Record<
  "normal" | "mild" | "moderate" | "marked",
  { bg: string; border: string; text: string; icon: typeof Info }
> = {
  normal: {
    bg: "bg-emerald-950/40",
    border: "border-emerald-500/50",
    text: "text-emerald-300",
    icon: CheckCircle2,
  },
  mild: {
    bg: "bg-sky-950/40",
    border: "border-sky-500/50",
    text: "text-sky-300",
    icon: Info,
  },
  moderate: {
    bg: "bg-amber-950/40",
    border: "border-amber-500/50",
    text: "text-amber-300",
    icon: AlertTriangle,
  },
  marked: {
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
  const showStrongDisclaimer =
    verdict.level === "moderate" || verdict.level === "marked";

  return (
    <div className={`rounded-2xl border-2 p-6 ${s.bg} ${s.border}`}>
      <div className="flex items-start gap-4">
        <Icon className={`w-12 h-12 flex-shrink-0 ${s.text}`} />
        <div className="flex-1">
          <h2 className={`text-2xl font-bold ${s.text}`}>{verdict.headline}</h2>
          <p className="text-zinc-300 text-sm mt-2">{verdict.detail}</p>
          {verdict.reducedConfidence && (
            <p className="text-zinc-400 text-xs mt-3 italic">
              ⚠ Qualité de capture faible — l&apos;interprétation est à prendre avec prudence.
            </p>
          )}
        </div>
      </div>
      {showStrongDisclaimer && (
        <div className="mt-5 pt-5 border-t border-zinc-700/50">
          <p className="text-zinc-300 text-xs leading-relaxed">
            <strong>Rappel important.</strong> Cet outil est expérimental. Ce n&apos;est
            ni un éthylotest, ni un test clinique, ni un substitut à l&apos;un ou à
            l&apos;autre. Il ne peut pas déterminer ta capacité à conduire. Si tu as
            consommé de l&apos;alcool, même un peu, <strong>ne conduis pas</strong> —
            quel que soit le résultat affiché ici.
          </p>
        </div>
      )}
    </div>
  );
}
