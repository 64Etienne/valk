export const SHARED_SCHEMA_VERSION = 1;
export { fitLinearTimeMap } from './time-map';
export {
  logLevelSchema,
  deviceContextSchema,
  logEntrySchema,
  logBatchSchema,
} from './observability';
export type { LogLevel, DeviceContext, LogEntry, LogBatch } from './observability';
