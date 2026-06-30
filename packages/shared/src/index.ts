export const SHARED_SCHEMA_VERSION = 1;
export { fitLinearTimeMap } from './time-map';
export {
  logLevelSchema,
  deviceContextSchema,
  logEntrySchema,
  logBatchSchema,
} from './observability';
export type { LogLevel, DeviceContext, LogEntry, LogBatch } from './observability';
export { LogBuffer, LogChannel } from './log-channel';
export type { SendFn, LogChannelOptions } from './log-channel';
export { parseSentryDsn, buildSentryEnvelope } from './sentry-envelope';
export type { SentryLevel, SentryEvent, ParsedDsn } from './sentry-envelope';
export {
  syncMarkerSchema,
  pursuitModelSchema,
  fixationModelSchema,
  stimulusModelSchema,
  sidecarSchema,
  pursuitX,
  SIDECAR_SCHEMA_VERSION,
} from './sidecar';
export type { SyncMarker, PursuitModel, FixationModel, StimulusModel, Sidecar } from './sidecar';
