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

export function checkResolution(
  width: number,
  height: number
): PreflightIssue | null {
  if (width < 640 || height < 480) {
    return {
      code: "resolution_low",
      severity: "fail",
      message: `Résolution ${width}×${height} insuffisante — minimum 640×480. Change d'appareil ou libère la caméra.`,
    };
  }
  if (width < 1280 || height < 720) {
    return {
      code: "resolution_low",
      severity: "warn",
      message: `Résolution ${width}×${height} — précision réduite. HD recommandé pour plus de fiabilité.`,
    };
  }
  return null;
}

export function checkFPS(measuredFPS: number): PreflightIssue | null {
  if (measuredFPS < 18) {
    return {
      code: "fps_low",
      severity: "fail",
      message: `FPS ${measuredFPS.toFixed(0)} Hz trop bas — capture inutilisable. Améliore l'éclairage, ferme d'autres apps.`,
    };
  }
  if (measuredFPS < 25) {
    return {
      code: "fps_low",
      severity: "warn",
      message: `FPS ${measuredFPS.toFixed(0)} Hz — détection fine des saccades dégradée. Essaie dans un endroit mieux éclairé.`,
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
