export interface PreflightIssue {
  code:
    | "resolution_low"
    | "fps_low"
    | "lighting_asymmetric"
    | "lighting_dim"
    | "voice_weak";
  severity: "warn" | "fail";
  message: string;
}

/**
 * Resolution check — orientation-independent.
 *
 * Mobile portrait (iPhone front camera) naturally returns e.g. 480×640 or
 * 720×1280 (short side first). We must check against the short/long
 * dimensions rather than hard-coding width/height.
 *
 * Also: resolution is never a reason to HARD-FAIL. A bad resolution reduces
 * precision but doesn't make capture "impossible" — the user can still get
 * meaningful signal for pursuit/blink/HGN even at 480p. Downgraded to warn.
 */
export function checkResolution(
  width: number,
  height: number
): PreflightIssue | null {
  const short = Math.min(width, height);
  const long = Math.max(width, height);

  if (short === 0 || long === 0) {
    return {
      code: "resolution_low",
      severity: "fail",
      message: "La caméra ne fournit pas de flux vidéo. Recharge la page.",
    };
  }

  if (short < 360 || long < 480) {
    return {
      code: "resolution_low",
      severity: "warn",
      message: `Résolution ${width}×${height} très basse — précision fortement réduite, mais on peut continuer.`,
    };
  }
  if (short < 480 || long < 640) {
    return {
      code: "resolution_low",
      severity: "warn",
      message: `Résolution ${width}×${height} basse — précision réduite.`,
    };
  }
  if (short < 720 || long < 1280) {
    return {
      code: "resolution_low",
      severity: "warn",
      message: `Résolution ${width}×${height} — HD recommandé pour plus de fiabilité.`,
    };
  }
  return null;
}

export function checkFPS(measuredFPS: number): PreflightIssue | null {
  if (measuredFPS < 12) {
    return {
      code: "fps_low",
      severity: "fail",
      message: `FPS ${measuredFPS.toFixed(0)} Hz très bas — capture peu fiable. Ferme d'autres apps, améliore l'éclairage.`,
    };
  }
  if (measuredFPS < 20) {
    return {
      code: "fps_low",
      severity: "warn",
      message: `FPS ${measuredFPS.toFixed(0)} Hz faible — détection des saccades dégradée.`,
    };
  }
  if (measuredFPS < 25) {
    return {
      code: "fps_low",
      severity: "warn",
      message: `FPS ${measuredFPS.toFixed(0)} Hz — essaie un éclairage plus vif pour améliorer la fluidité.`,
    };
  }
  return null;
}

export function checkLightingSymmetry(
  leftLstar: number,
  rightLstar: number
): PreflightIssue | null {
  const diff = Math.abs(leftLstar - rightLstar);
  const avg = (leftLstar + rightLstar) / 2;
  if (avg < 20) {
    return {
      code: "lighting_dim",
      severity: "warn",
      message:
        "Éclairage insuffisant — colorimétrie sclérale peu fiable. Rapproche-toi d'une source lumineuse.",
    };
  }
  if (diff > 15) {
    return {
      code: "lighting_asymmetric",
      severity: "warn",
      message: `Éclairage asymétrique (Δ${diff.toFixed(0)}) — tourne-toi pour que la lumière vienne de face.`,
    };
  }
  return null;
}

export function checkVoiceRMS(rmsDB: number): PreflightIssue | null {
  if (rmsDB < -50) {
    return {
      code: "voice_weak",
      severity: "fail",
      message: `Micro trop faible (${rmsDB.toFixed(0)} dB) — rapproche le téléphone de ta bouche (15-25 cm).`,
    };
  }
  if (rmsDB < -42) {
    return {
      code: "voice_weak",
      severity: "warn",
      message: `Micro marginal (${rmsDB.toFixed(0)} dB) — essaie de parler plus fort ou rapproche l'appareil.`,
    };
  }
  return null;
}
