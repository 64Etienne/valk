"use client";

import { useState, useEffect } from "react";
import { Spinner } from "../ui/Spinner";

const PHRASES = [
  "Analyse de la dilatation pupillaire...",
  "Calcul du réflexe photomoteur...",
  "Évaluation de la fatigue oculaire...",
  "Mesure de la coordination visuelle...",
  "Analyse vocale et articulatoire...",
  "Estimation de l'alcoolémie...",
  "Synthèse des résultats...",
];

interface AnalyzingOverlayProps {
  phase: "extracting" | "analyzing";
  error?: string | null;
  onRetry?: () => void;
}

export function AnalyzingOverlay({
  phase,
  error,
  onRetry,
}: AnalyzingOverlayProps) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (phase !== "analyzing") return;

    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setPhraseIndex((i) => (i + 1) % PHRASES.length);
        setVisible(true);
      }, 300);
    }, 2500);

    return () => clearInterval(interval);
  }, [phase]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-zinc-950/95">
      <Spinner size="lg" />

      <p
        className={`text-zinc-300 mt-4 text-lg transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        {phase === "extracting"
          ? "Extraction des données..."
          : PHRASES[phraseIndex]}
      </p>

      {phase === "analyzing" && (
        <p className="text-zinc-600 text-xs mt-2">
          Peut prendre jusqu&apos;à 3 minutes
        </p>
      )}

      {error && (
        <div className="mt-4 text-center">
          <p className="text-red-400 text-sm">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 text-violet-400 text-sm underline hover:text-violet-300 transition-colors"
            >
              Réessayer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
