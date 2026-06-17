"use client";

import { Card } from "../ui/Card";
import { ScoreGauge } from "./ScoreGauge";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ObservationList } from "./ObservationList";
import { ScientificBasis } from "./ScientificBasis";
import { Wine, Moon, Pill, Zap, Eye, Brain } from "lucide-react";
import type { CategoryScore } from "@/types";

const ICONS: Record<string, React.ElementType> = {
  alcohol: Wine,
  fatigue: Moon,
  substances: Pill,
  stress: Zap,
  ocularHealth: Eye,
  emotionalState: Brain,
};

const LABELS: Record<string, string> = {
  alcohol: "Alcoolémie",
  fatigue: "Fatigue",
  substances: "Substances",
  stress: "Stress",
  ocularHealth: "Santé oculaire",
  emotionalState: "État émotionnel",
};

interface CategoryCardProps {
  category: string;
  data: CategoryScore;
}

export function CategoryCard({ category, data }: CategoryCardProps) {
  const Icon = ICONS[category] || Eye;
  const label = LABELS[category] || category;

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-violet-400" />
          <h3 className="font-semibold text-zinc-100">{label}</h3>
        </div>
        <ConfidenceBadge confidence={data.confidence} />
      </div>

      <div className="flex items-center gap-4">
        <ScoreGauge score={data.score} size={100} />
        <div className="flex-1">
          <p className="text-sm font-medium text-zinc-300">{data.label}</p>
          <p className="text-xs text-zinc-500 mt-1">{data.confidenceExplanation}</p>
        </div>
      </div>

      <ObservationList observations={data.observations} />

      <ScientificBasis
        basis={data.scientificBasis}
        limitations={data.limitations}
        alternativeExplanations={data.alternativeExplanations}
      />
    </Card>
  );
}
