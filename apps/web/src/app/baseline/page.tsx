"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import {
  getBaselineStatus,
  clearBaseline,
  type BaselineStatus,
} from "@/lib/calibration/baseline";

const GuidedCapture = dynamic(
  () =>
    import("@/components/capture/GuidedCapture").then((m) => m.GuidedCapture),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    ),
  }
);

export default function BaselinePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <BaselinePageInner />
    </Suspense>
  );
}

function BaselinePageInner() {
  const params = useSearchParams();
  const justSaved = params?.get("saved") === "1";
  const [status, setStatus] = useState<BaselineStatus | null>(null);
  const [mode, setMode] = useState<"menu" | "recording">("menu");

  useEffect(() => {
    setStatus(getBaselineStatus());
  }, [justSaved]);

  if (mode === "recording") {
    return <GuidedCapture mode="baseline" />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-start justify-center p-6 pt-16">
      <div className="max-w-md w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">
            Ta baseline personnelle
          </h1>
          <p className="text-zinc-400 text-sm mt-2">
            Capture tes valeurs de référence{" "}
            <strong>à jeun, reposé, en bonne lumière</strong> (ex: un lundi
            matin). Les analyses suivantes seront comparées à cette baseline
            pour plus de précision.
          </p>
        </div>

        {justSaved && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-4 text-emerald-300 text-sm">
            ✓ Baseline enregistrée avec succès.
          </div>
        )}

        {status && status.state === "none" && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-zinc-400 text-sm">
            Aucune baseline enregistrée pour le moment.
          </div>
        )}

        {status && status.state !== "none" && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-2">
            <p className="text-zinc-300 text-sm">
              Baseline enregistrée le{" "}
              <strong className="text-zinc-100">
                {status.capturedAt.toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </strong>{" "}
              (il y a {Math.round(status.ageDays)} jours).
            </p>
            {status.state === "aging" && (
              <p className="text-amber-400 text-xs">
                ⚠ Baseline un peu ancienne — envisage de la renouveler.
              </p>
            )}
            {status.state === "stale" && (
              <p className="text-red-400 text-xs">
                ⚠ Baseline obsolète ({Math.round(status.ageDays)} jours) —
                recalibre avant utilisation.
              </p>
            )}
          </div>
        )}

        <div className="space-y-3">
          <Button onClick={() => setMode("recording")} size="lg" className="w-full">
            {status && status.state !== "none"
              ? "Recalibrer ma baseline"
              : "Enregistrer ma baseline"}
          </Button>
          {status && status.state !== "none" && (
            <Button
              onClick={() => {
                clearBaseline();
                setStatus(getBaselineStatus());
              }}
              variant="secondary"
              size="sm"
              className="w-full"
            >
              Supprimer ma baseline
            </Button>
          )}
          <Link href="/capture" className="block">
            <Button variant="secondary" size="sm" className="w-full">
              Retour à la capture normale
            </Button>
          </Link>
        </div>

        <p className="text-zinc-600 text-xs">
          Les données baseline sont stockées{" "}
          <strong>uniquement sur ton appareil</strong>. Rien n&apos;est envoyé
          à un serveur.
        </p>
      </div>
    </div>
  );
}
