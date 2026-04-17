"use client";

import { Card } from "../ui/Card";
import { loadBaseline } from "@/lib/calibration/baseline";
import { loadPayload } from "@/lib/storage/session-result";
import { computeBaselineDelta } from "@/lib/calibration/baseline-delta";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

function Arrow({ value, inverse = false }: { value: number; inverse?: boolean }) {
  if (Math.abs(value) < 0.05) return <Minus className="w-3 h-3 text-zinc-500" />;
  const isBad = inverse ? value > 0 : value < 0;
  return isBad ? (
    <TrendingUp className="w-3 h-3 text-red-400" />
  ) : (
    <TrendingDown className="w-3 h-3 text-emerald-400" />
  );
}

export function BaselineCompareBanner() {
  const baseline = loadBaseline();
  const payload = loadPayload();
  if (!baseline || !payload) return null;

  const delta = computeBaselineDelta(baseline, payload);

  return (
    <Card className="border-violet-500/30 bg-violet-950/20 space-y-3">
      <h3 className="text-sm font-semibold text-violet-300">
        Comparé à ta baseline personnelle
      </h3>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Arrow value={-delta.pupilDiameterDeltaMm} />
          <span className="text-zinc-300">Pupille</span>
          <span className="text-zinc-500">
            {delta.pupilDiameterDeltaMm > 0 ? "+" : ""}
            {delta.pupilDiameterDeltaMm.toFixed(2)} mm
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Arrow value={-delta.blinkRateDeltaPerMin} inverse />
          <span className="text-zinc-300">Clignements</span>
          <span className="text-zinc-500">
            {delta.blinkRateDeltaPerMin > 0 ? "+" : ""}
            {delta.blinkRateDeltaPerMin.toFixed(1)}/min
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Arrow value={delta.pursuitGainDelta} />
          <span className="text-zinc-300">Poursuite</span>
          <span className="text-zinc-500">
            {delta.pursuitGainDelta > 0 ? "+" : ""}
            {delta.pursuitGainDelta.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Arrow value={-delta.perclosDelta} inverse />
          <span className="text-zinc-300">PERCLOS</span>
          <span className="text-zinc-500">
            {delta.perclosDelta > 0 ? "+" : ""}
            {(delta.perclosDelta * 100).toFixed(1)} pp
          </span>
        </div>
        {delta.speechRateDeltaWpm !== null && (
          <div className="flex items-center gap-2">
            <Arrow value={delta.speechRateDeltaWpm} />
            <span className="text-zinc-300">Vitesse parole</span>
            <span className="text-zinc-500">
              {delta.speechRateDeltaWpm > 0 ? "+" : ""}
              {delta.speechRateDeltaWpm.toFixed(0)} wpm
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
