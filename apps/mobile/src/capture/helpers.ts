import Constants from "expo-constants";
import * as Brightness from "expo-brightness";
import { File } from "expo-file-system";
import type { Sidecar } from "@valk/shared";
import { logger } from "../observability/logger";

/** Écrit le sidecar JSON à côté du clip. Renvoie son URI. */
export function saveSidecar(clipUri: string, sidecar: Sidecar): string {
  const uri = `${clipUri}.sidecar.json`;
  const f = new File(uri);
  try {
    f.create();
  } catch {
    /* existe déjà */
  }
  f.write(JSON.stringify(sidecar));
  return uri;
}

export async function brightnessMax(prev: { current: number | null }): Promise<void> {
  prev.current = await Brightness.getBrightnessAsync().catch(() => null);
  await Brightness.setBrightnessAsync(1).catch(() => {});
}
export async function restoreBrightness(prev: { current: number | null }): Promise<void> {
  if (prev.current != null) {
    await Brightness.setBrightnessAsync(prev.current).catch(() => {});
    prev.current = null;
  }
}

/** Upload multipart du clip + sidecar vers /api/captures (gaté). */
export async function uploadCapture(
  clipUri: string,
  sidecar: Sidecar,
): Promise<{ ok: boolean; captureId?: string; detail?: string }> {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string; debugKey?: string } | undefined;
  const base = extra?.apiBaseUrl ?? "";
  if (!base) return { ok: false, detail: "serveur non configuré" };
  const form = new FormData();
  form.append("clip", { uri: clipUri, name: "clip.mov", type: "video/quicktime" } as unknown as Blob);
  form.append("sidecar", JSON.stringify(sidecar));
  form.append("sessionId", sidecar.sessionId);
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/captures`, {
      method: "POST",
      body: form,
      headers: {
        "ngrok-skip-browser-warning": "true",
        ...(extra?.debugKey ? { "x-valk-debug-key": extra.debugKey } : {}),
      },
    });
    const j = (await res.json()) as { ok?: boolean; captureId?: string; timeMap?: { status?: string } };
    if (!res.ok || !j.ok) throw new Error(`HTTP ${res.status}`);
    logger.info("capture", "upload.done", { captureId: j.captureId, sync: j.timeMap?.status });
    return { ok: true, captureId: j.captureId, detail: `Envoyé · sync ${j.timeMap?.status ?? "?"}` };
  } catch (e) {
    logger.captureException(e, { where: "uploadCapture" });
    return { ok: false, detail: "échec de l'envoi" };
  }
}
