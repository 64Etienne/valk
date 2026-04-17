"use client";

import { CategoryCard } from "./CategoryCard";
import { CategoryCardSkeleton } from "./CategoryCardSkeleton";
import { OverallSummary } from "./OverallSummary";
import { VerdictBanner } from "./VerdictBanner";
import { BaselineCompareBanner } from "./BaselineCompareBanner";
import { DisclaimerFooter } from "./DisclaimerFooter";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { RotateCcw } from "lucide-react";
import Link from "next/link";
import type { AnalysisResult, CategoryScore } from "@/types";

const CATEGORY_ORDER = ["alcohol", "fatigue", "substances"] as const;
const CATEGORY_LABELS: Record<(typeof CATEGORY_ORDER)[number], string> = {
  alcohol: "Alcoolémie",
  fatigue: "Fatigue",
  substances: "Substances",
};

interface ProgressiveResultsProps {
  partial: Partial<AnalysisResult> | null;
  final: AnalysisResult | null;
  phase: "idle" | "streaming" | "done" | "error";
  error: string | null;
}

/**
 * Verify that a partial category is SAFE TO RENDER — all fields that child
 * components call `.length` or iterate over must be populated AS ARRAYS.
 * Otherwise the partial JSON parser will hand us `{score: 42, observations: [...]}`
 * without `limitations`/`alternativeExplanations` and CategoryCard's children
 * crash with "Cannot read properties of undefined (reading 'length')".
 */
function isCategoryRenderable(
  data: Partial<CategoryScore> | undefined
): data is CategoryScore {
  if (!data) return false;
  if (typeof data.score !== "number") return false;
  if (!data.confidence) return false;
  if (typeof data.label !== "string") return false;
  if (typeof data.scientificBasis !== "string") return false;
  if (typeof data.confidenceExplanation !== "string") return false;
  if (!Array.isArray(data.observations)) return false;
  if (!Array.isArray(data.limitations)) return false;
  if (!Array.isArray(data.alternativeExplanations)) return false;
  return true;
}

export function ProgressiveResults({
  partial,
  final,
  phase,
  error,
}: ProgressiveResultsProps) {
  const display = final ?? partial;

  if (phase === "error") {
    return (
      <div className="max-w-md mx-auto px-4 py-10 text-center space-y-4">
        <h1 className="text-xl font-bold text-red-400">
          L&apos;analyse a échoué
        </h1>
        <p className="text-zinc-400 text-sm">{error ?? "Erreur inconnue."}</p>
        <Link href="/capture">
          <Button>Réessayer</Button>
        </Link>
      </div>
    );
  }

  if (!display) {
    return (
      <div className="max-w-md mx-auto px-4 py-10 text-center space-y-3">
        <Spinner size="lg" />
        <p className="text-zinc-400 text-sm">Connexion au modèle…</p>
      </div>
    );
  }

  const hasAllCategoriesComplete =
    final !== null &&
    CATEGORY_ORDER.every((c) => isCategoryRenderable(final.categories?.[c]));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">
          {phase === "streaming" ? "Analyse en cours…" : "Résultats de l'analyse"}
        </h1>
        {phase === "done" && (
          <Link href="/capture">
            <Button variant="secondary" size="sm">
              <RotateCcw className="w-4 h-4" />
              Nouvelle analyse
            </Button>
          </Link>
        )}
      </div>

      {hasAllCategoriesComplete && final && <VerdictBanner result={final} />}

      {phase === "done" && <BaselineCompareBanner />}

      {display.summary && final && <OverallSummary result={final} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CATEGORY_ORDER.map((cat) => {
          const data = display.categories?.[cat] as
            | Partial<CategoryScore>
            | undefined;
          return isCategoryRenderable(data) ? (
            <CategoryCard key={cat} category={cat} data={data} />
          ) : (
            <CategoryCardSkeleton key={cat} label={CATEGORY_LABELS[cat]} />
          );
        })}
      </div>

      {phase === "streaming" && (
        <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm pt-4">
          <Spinner size="sm" />
          <span>Synthèse en cours…</span>
        </div>
      )}

      {phase === "done" && <DisclaimerFooter />}
    </div>
  );
}
