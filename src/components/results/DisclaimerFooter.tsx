"use client";

import { AlertTriangle } from "lucide-react";

export function DisclaimerFooter() {
  return (
    <div className="border border-amber-500/30 bg-amber-500/5 rounded-xl p-4 mt-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-400 leading-relaxed">
          <p className="font-medium text-amber-400 mb-1">Avertissement important</p>
          <p>
            Valk est un outil éducatif et informatif. Ce n&apos;est PAS un dispositif médical, PAS un
            éthylotest, PAS un outil de diagnostic. Les résultats ne doivent PAS être utilisés pour
            des décisions médicales, légales ou de sécurité. Ne conduisez jamais si vous suspectez
            une altération de vos capacités, quel que soit le résultat affiché.
          </p>
        </div>
      </div>
    </div>
  );
}
