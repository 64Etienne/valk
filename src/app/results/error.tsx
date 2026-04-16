"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

interface ResultsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ResultsError({ error, reset }: ResultsErrorProps) {
  useEffect(() => {
    console.error("/results crashed:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-xl font-semibold text-zinc-100">
          Les résultats n&apos;ont pas pu s&apos;afficher
        </h2>
        <p className="text-zinc-400 text-sm">
          Une erreur est survenue pendant le rendu. Vos données d&apos;analyse
          restent en mémoire pendant la session — vous pouvez retenter ou
          relancer une nouvelle capture.
        </p>
        {error.digest && (
          <p className="text-zinc-600 text-xs font-mono">ref: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center pt-2">
          <Button onClick={reset} variant="secondary">
            Réessayer le rendu
          </Button>
          <Link href="/capture">
            <Button>Nouvelle analyse</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
