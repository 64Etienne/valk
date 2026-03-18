"use client";

import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import type { AnalysisResult } from "@/types";

interface OverallSummaryProps {
  result: AnalysisResult;
}

const qualityVariant = { good: "success", fair: "warning", poor: "danger" } as const;
const qualityLabel = { good: "Bonne", fair: "Moyenne", poor: "Faible" } as const;

export function OverallSummary({ result }: OverallSummaryProps) {
  return (
    <Card className="border-violet-500/30 bg-violet-950/20">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-zinc-100">Résumé</h2>
        <Badge variant={qualityVariant[result.dataQuality.overallQuality]}>
          Qualité: {qualityLabel[result.dataQuality.overallQuality]}
        </Badge>
      </div>
      <p className="text-zinc-300 text-sm leading-relaxed">{result.summary}</p>
      {result.dataQuality.issues.length > 0 && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 mb-1">Problèmes de qualité :</p>
          <ul className="space-y-1">
            {result.dataQuality.issues.map((issue, i) => (
              <li key={i} className="text-xs text-amber-400">{issue}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
