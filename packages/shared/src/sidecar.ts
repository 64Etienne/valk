import { z } from "zod";

/** Marqueur de synchro in-band (flash plein écran) capté dans la vidéo. */
export const syncMarkerSchema = z.object({
  kind: z.literal("flash"),
  edge: z.enum(["start", "end"]),
  scheduledMs: z.number(),
  durationMs: z.number(),
});
export type SyncMarker = z.infer<typeof syncMarkerSchema>;

/** Modèle analytique d'un stimulus de poursuite horizontale (le serveur reconstruit la position). */
export const stimulusModelSchema = z.object({
  type: z.literal("smooth_pursuit_h"),
  center: z.number(),
  amplitude: z.number(),
  cycles: z.number(),
  startMs: z.number(),
  durationMs: z.number(),
});
export type StimulusModel = z.infer<typeof stimulusModelSchema>;

/** Sidecar joint au clip : marqueurs de synchro + modèle de stimulus, sur une horloge monotone unique. */
export const sidecarSchema = z.object({
  schemaVersion: z.number(),
  sessionId: z.string(),
  clock: z.object({
    domain: z.literal("performance.now"),
    t0Monotonic: z.number(),
    t0Wall: z.number(),
  }),
  recording: z.object({
    requestedQuality: z.string(),
    mirror: z.boolean(),
  }),
  syncMarkers: z.array(syncMarkerSchema),
  stimuli: z.array(
    z.object({
      type: z.string(),
      model: stimulusModelSchema,
      samples: z.array(z.object({ tMs: z.number(), x: z.number() })),
    }),
  ),
});
export type Sidecar = z.infer<typeof sidecarSchema>;

export const SIDECAR_SCHEMA_VERSION = 1;

/**
 * Position horizontale (0..1) du point de poursuite à l'instant `tMs`
 * (même horloge que `model.startMs`). Pur — réutilisé device ET serveur.
 */
export function pursuitX(model: StimulusModel, tMs: number): number {
  const elapsed = tMs - model.startMs;
  const progress = Math.max(0, Math.min(1, elapsed / model.durationMs));
  return model.center + model.amplitude * Math.sin(2 * Math.PI * model.cycles * progress);
}
