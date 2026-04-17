"use client";

import { useState } from "react";
import { Button } from "../ui/Button";
import { Clock, Moon, User, Sun, AlertTriangle } from "lucide-react";
import { TelemetryOptIn } from "./TelemetryOptIn";
import { BaselineStatusBadge } from "./BaselineStatusBadge";
import type { UserContext } from "@/types";

interface ContextFormProps {
  onSubmit: (context: UserContext) => void;
}

export function ContextForm({ onSubmit }: ContextFormProps) {
  const [hoursAwake, setHoursAwake] = useState(8);
  const [age, setAge] = useState(25);
  const [lighting, setLighting] = useState<"bright" | "moderate" | "dim">("moderate");
  const [substance, setSubstance] = useState("");

  const now = new Date();
  const timeOfDay = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      timeOfDay,
      hoursSinceLastSleep: hoursAwake,
      age,
      ambientLighting: lighting,
      selfReportedSubstanceUse: substance || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-md mx-auto p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 mb-1">Contexte</h2>
          <p className="text-sm text-zinc-400">Ces informations améliorent la précision de l&apos;analyse.</p>
        </div>
        <BaselineStatusBadge />
      </div>

      <div className="space-y-4">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-2">
            <Clock className="w-4 h-4 text-violet-400" />
            Heure actuelle
          </label>
          <div className="px-4 py-2.5 bg-zinc-800 rounded-lg text-zinc-300 text-sm">{timeOfDay}</div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-2">
            <Moon className="w-4 h-4 text-violet-400" />
            Heures d'éveil
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={36}
              step={0.5}
              value={hoursAwake}
              onChange={(e) => setHoursAwake(parseFloat(e.target.value))}
              className="flex-1 accent-violet-500"
            />
            <span className="text-sm text-zinc-300 w-10 text-right">{hoursAwake}h</span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">Depuis combien de temps êtes-vous éveillé(e) ?</p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-2">
            <User className="w-4 h-4 text-violet-400" />
            Âge
          </label>
          <input
            type="number"
            min={10}
            max={100}
            value={age}
            onChange={(e) => setAge(parseInt(e.target.value) || 25)}
            className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-2">
            <Sun className="w-4 h-4 text-violet-400" />
            Éclairage ambiant
          </label>
          <select
            value={lighting}
            onChange={(e) => setLighting(e.target.value as "bright" | "moderate" | "dim")}
            className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="bright">Lumineux (extérieur / bureau éclairé)</option>
            <option value="moderate">Modéré (intérieur standard)</option>
            <option value="dim">Faible (soirée / pièce sombre)</option>
          </select>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Substance consommée (optionnel)
          </label>
          <input
            type="text"
            value={substance}
            onChange={(e) => setSubstance(e.target.value)}
            placeholder="ex: café, alcool, médicaments..."
            className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
      </div>

      <TelemetryOptIn />

      <Button type="submit" size="lg" className="w-full">
        Commencer la capture
      </Button>
    </form>
  );
}
