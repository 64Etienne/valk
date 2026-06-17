"use client";

import { Card } from "../ui/Card";
import { Spinner } from "../ui/Spinner";

export function CategoryCardSkeleton({ label }: { label: string }) {
  return (
    <Card className="space-y-3 opacity-60">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-zinc-400">{label}</h3>
        <Spinner size="sm" />
      </div>
      <div className="h-24 bg-zinc-900/50 rounded animate-pulse" />
    </Card>
  );
}
