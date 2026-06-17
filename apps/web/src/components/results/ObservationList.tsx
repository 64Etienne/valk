"use client";

import { AlertCircle } from "lucide-react";

interface ObservationListProps {
  observations: string[];
}

export function ObservationList({ observations }: ObservationListProps) {
  if (observations.length === 0) return null;
  return (
    <ul className="space-y-2">
      {observations.map((obs, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
          <AlertCircle className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
          {obs}
        </li>
      ))}
    </ul>
  );
}
