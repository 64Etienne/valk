"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "valk-telemetry-consent";

export function useTelemetryConsent(): [boolean, (v: boolean) => void] {
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setConsent(true);
    } catch {
      /* ignore */
    }
  }, []);
  const update = (v: boolean) => {
    setConsent(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };
  return [consent, update];
}

export function TelemetryOptIn() {
  const [consent, setConsent] = useTelemetryConsent();
  return (
    <label className="flex items-start gap-2 text-xs text-zinc-400 cursor-pointer">
      <input
        type="checkbox"
        checked={consent}
        onChange={(e) => setConsent(e.target.checked)}
        className="mt-0.5 accent-violet-500"
      />
      <span>
        Partager mes mesures anonymes pour améliorer l&apos;app. Aucune image ni
        audio, aucun identifiant personnel. Modifiable à tout moment.
      </span>
    </label>
  );
}
