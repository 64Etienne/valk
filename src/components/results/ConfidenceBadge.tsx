"use client";

import { Badge } from "../ui/Badge";
import { getConfidenceBadgeVariant, getConfidenceLabel } from "@/lib/analysis/types";

interface ConfidenceBadgeProps {
  confidence: "low" | "moderate" | "high";
}

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  return (
    <Badge variant={getConfidenceBadgeVariant(confidence)}>
      Confiance: {getConfidenceLabel(confidence)}
    </Badge>
  );
}
