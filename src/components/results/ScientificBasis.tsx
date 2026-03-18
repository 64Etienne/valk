"use client";

import { Accordion } from "../ui/Accordion";

interface ScientificBasisProps {
  basis: string;
  limitations: string[];
  alternativeExplanations: string[];
}

export function ScientificBasis({ basis, limitations, alternativeExplanations }: ScientificBasisProps) {
  return (
    <div className="space-y-2">
      <Accordion title="Base scientifique">
        <p className="mb-3">{basis}</p>
        {limitations.length > 0 && (
          <div className="mb-3">
            <p className="text-zinc-300 font-medium text-xs mb-1">Limitations :</p>
            <ul className="list-disc list-inside space-y-1">
              {limitations.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </div>
        )}
        {alternativeExplanations.length > 0 && (
          <div>
            <p className="text-zinc-300 font-medium text-xs mb-1">Explications alternatives :</p>
            <ul className="list-disc list-inside space-y-1">
              {alternativeExplanations.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        )}
      </Accordion>
    </div>
  );
}
