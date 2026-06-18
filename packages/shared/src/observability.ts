import { z } from 'zod';

/** Niveaux de log, du plus verbeux au plus grave. */
export const logLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error']);
export type LogLevel = z.infer<typeof logLevelSchema>;

/** Contexte device attaché à chaque batch (qui/quoi a produit les logs). */
export const deviceContextSchema = z.object({
  platform: z.string(),
  osVersion: z.string().optional(),
  model: z.string().optional(),
  appVersion: z.string().optional(),
  runtime: z.enum(['expoGo', 'devBuild', 'web', 'unknown']),
});
export type DeviceContext = z.infer<typeof deviceContextSchema>;

/** Une entrée de log structurée. `tsMonotonic` = horloge monotone (deltas) ; `tsWall` = horodatage humain. */
export const logEntrySchema = z.object({
  tsMonotonic: z.number(),
  tsWall: z.number(),
  level: logLevelSchema,
  category: z.string(),
  message: z.string(),
  data: z.unknown().optional(),
});
export type LogEntry = z.infer<typeof logEntrySchema>;

/** Lot d'entrées envoyé par le client au serveur (ingestion `/api/logs`). */
export const logBatchSchema = z.object({
  sessionId: z.string().min(1),
  device: deviceContextSchema,
  entries: z.array(logEntrySchema),
});
export type LogBatch = z.infer<typeof logBatchSchema>;
