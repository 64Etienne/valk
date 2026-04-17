"use client";

import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Clock, Moon, User, Sun, AlertTriangle } from "lucide-react";
import { TelemetryOptIn } from "./TelemetryOptIn";
import { BaselineStatusBadge } from "./BaselineStatusBadge";
import type { UserContext } from "@/types";

interface ContextFormProps {
  onSubmit: (context: UserContext) => void;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function defaultWakeTime(): string {
  // Default heuristic: 8h before now, rounded to nearest 15 min, clamped between 05:00 and 12:00
  const now = new Date();
  const guess = new Date(now.getTime() - 8 * 3600_000);
  let h = guess.getHours();
  let m = Math.round(guess.getMinutes() / 15) * 15;
  if (m === 60) {
    m = 0;
    h = (h + 1) % 24;
  }
  if (h < 5) h = 7;
  if (h > 12 && now.getHours() >= 10) h = 7;
  return `${pad2(h)}:${pad2(m)}`;
}

function computeHoursSinceWake(wakeTime: string, now: Date = new Date()): number {
  const [hh, mm] = wakeTime.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return 0;
  const wake = new Date(now);
  wake.setHours(hh, mm, 0, 0);
  let diffMs = now.getTime() - wake.getTime();
  // If wake is in the future (e.g. user says "j'ai réveillé à 23h" and it's 1h du matin),
  // assume wake was yesterday.
  if (diffMs < 0) diffMs += 24 * 3600_000;
  return Math.round((diffMs / 3600_000) * 10) / 10;
}

export function ContextForm({ onSubmit }: ContextFormProps) {
  const [wakeTime, setWakeTime] = useState<string>(defaultWakeTime);
  const [age, setAge] = useState(25);
  const [lighting, setLighting] = useState<"bright" | "moderate" | "dim">("moderate");
  const [substance, setSubstance] = useState("");

  const now = new Date();
  const timeOfDay = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const hoursAwake = useMemo(() => computeHoursSinceWake(wakeTime, now), [wakeTime, now]);

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
            Heure de réveil aujourd&apos;hui
          </label>
          <div className="flex items-center gap-3">
            <input
              type="time"
              value={wakeTime}
              step={900}
              onChange={(e) => setWakeTime(e.target.value || "07:00")}
              className="flex-1 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <span className="text-xs text-zinc-500 w-28 text-right">
              → {hoursAwake} h éveil
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            À quelle heure t&apos;es-tu réveillé(e) ce matin ?
          </p>
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
