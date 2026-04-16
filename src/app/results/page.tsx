"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ResultsDashboard } from "@/components/results/ResultsDashboard";
import { Spinner } from "@/components/ui/Spinner";
import { loadResult } from "@/lib/storage/session-result";
import type { AnalysisResult } from "@/types";

export default function ResultsPage() {
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    const stored = loadResult();
    if (stored) {
      setResult(stored);
    } else {
      router.replace("/capture");
    }
  }, [router]);

  if (!result) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <ResultsDashboard result={result} />
    </div>
  );
}
