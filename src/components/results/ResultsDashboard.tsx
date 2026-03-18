"use client";

import { OverallSummary } from "./OverallSummary";
import { CategoryCard } from "./CategoryCard";
import { DisclaimerFooter } from "./DisclaimerFooter";
import { Button } from "../ui/Button";
import { RotateCcw } from "lucide-react";
import Link from "next/link";
import type { AnalysisResult } from "@/types";

interface ResultsDashboardProps {
  result: AnalysisResult;
}

const CATEGORY_ORDER = ["alcohol", "fatigue", "substances", "stress", "ocularHealth", "emotionalState"] as const;

export function ResultsDashboard({ result }: ResultsDashboardProps) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">Résultats de l&apos;analyse</h1>
        <Link href="/capture">
          <Button variant="secondary" size="sm">
            <RotateCcw className="w-4 h-4" />
            Nouvelle analyse
          </Button>
        </Link>
      </div>

      <OverallSummary result={result} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CATEGORY_ORDER.map((cat) => (
          <CategoryCard key={cat} category={cat} data={result.categories[cat]} />
        ))}
      </div>

      <DisclaimerFooter />
    </div>
  );
}
