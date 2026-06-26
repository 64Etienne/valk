import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { LogBatch, LogEntry, DeviceContext, Sidecar } from "@valk/shared";
import type { TimeMap } from "./flash-detect";

// Typage minimal maison de node:sqlite (évite de dépendre de @types/node récents).
interface SqliteStatement {
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): Record<string, unknown>[];
  get(...params: unknown[]): Record<string, unknown> | undefined;
}
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}
type DatabaseSyncCtor = new (path: string) => SqliteDb;

// `node:sqlite` (intégré Node 24) chargé PARESSEUSEMENT via process.getBuiltinModule :
// appel runtime non analysé par Vite/Turbopack → aucune erreur de bundling, et le
// module n'est sollicité qu'à l'ouverture effective d'une base (pas à l'import).
function loadDatabaseSync(): DatabaseSyncCtor {
  const proc = process as unknown as {
    getBuiltinModule(id: string): { DatabaseSync: DatabaseSyncCtor };
  };
  return proc.getBuiltinModule("node:sqlite").DatabaseSync;
}

export interface SessionSummary {
  sessionId: string;
  device: DeviceContext;
  firstSeen: number;
  lastSeen: number;
  logCount: number;
}

export interface StoredLog extends LogEntry {
  id: number;
}

export interface CaptureRecord {
  id: string;
  sessionId: string;
  createdAt: number;
  clipPath: string;
  size: number | null;
  sidecar: Sidecar;
  timeMap: TimeMap | null;
  status: string;
}

export interface CaptureSummary {
  id: string;
  sessionId: string;
  createdAt: number;
  size: number | null;
  timeMap: TimeMap | null;
  status: string;
}

export interface ObservabilityStore {
  insertLogs(batch: LogBatch): void;
  listSessions(): SessionSummary[];
  getSessionLogs(sid: string): StoredLog[];
  insertCapture(rec: CaptureRecord): void;
  listCaptures(): CaptureSummary[];
  getCapture(id: string): CaptureRecord | null;
}

function migrate(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      device     TEXT NOT NULL,
      first_seen INTEGER NOT NULL,
      last_seen  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS logs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   TEXT NOT NULL,
      ts_monotonic REAL NOT NULL,
      ts_wall      INTEGER NOT NULL,
      level        TEXT NOT NULL,
      category     TEXT NOT NULL,
      message      TEXT NOT NULL,
      data         TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_logs_session ON logs(session_id, id);
    CREATE TABLE IF NOT EXISTS captures (
      id         TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      clip_path  TEXT NOT NULL,
      size       INTEGER,
      sidecar    TEXT NOT NULL,
      time_map   TEXT,
      status     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_captures_created ON captures(created_at DESC);
  `);
}

/**
 * Crée un store d'observabilité adossé à une SQLite locale via `node:sqlite`
 * (intégré à Node 24, aucune dépendance ni compilation native).
 * `path` = ":memory:" pour les tests, sinon un fichier (le dossier est créé au besoin).
 */
export function createSqliteStore(path: string): ObservabilityStore {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const DatabaseSync = loadDatabaseSync();
  const db = new DatabaseSync(path);
  migrate(db);

  const upsertSession = db.prepare(`
    INSERT INTO sessions (session_id, device, first_seen, last_seen)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      last_seen = MAX(sessions.last_seen, excluded.last_seen),
      device    = excluded.device
  `);
  const insertLog = db.prepare(`
    INSERT INTO logs (session_id, ts_monotonic, ts_wall, level, category, message, data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const selSessions = db.prepare(`
    SELECT s.session_id, s.device, s.first_seen, s.last_seen, COUNT(l.id) AS log_count
    FROM sessions s LEFT JOIN logs l ON l.session_id = s.session_id
    GROUP BY s.session_id
    ORDER BY s.last_seen DESC
  `);
  const selLogs = db.prepare(
    `SELECT * FROM logs WHERE session_id = ? ORDER BY id ASC`,
  );
  const insCapture = db.prepare(`
    INSERT INTO captures (id, session_id, created_at, clip_path, size, sidecar, time_map, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const selCaptures = db.prepare(
    `SELECT id, session_id, created_at, size, time_map, status FROM captures ORDER BY created_at DESC`,
  );
  const selCapture = db.prepare(`SELECT * FROM captures WHERE id = ?`);

  return {
    insertLogs(batch) {
      const walls = batch.entries.map((e) => e.tsWall);
      const first = walls.length ? Math.min(...walls) : Date.now();
      const last = walls.length ? Math.max(...walls) : first;
      upsertSession.run(batch.sessionId, JSON.stringify(batch.device), first, last);
      for (const e of batch.entries) {
        insertLog.run(
          batch.sessionId,
          e.tsMonotonic,
          e.tsWall,
          e.level,
          e.category,
          e.message,
          e.data !== undefined ? JSON.stringify(e.data) : null,
        );
      }
    },
    listSessions() {
      return (selSessions.all() as Record<string, unknown>[]).map((r) => ({
        sessionId: r.session_id as string,
        device: JSON.parse(r.device as string) as DeviceContext,
        firstSeen: r.first_seen as number,
        lastSeen: r.last_seen as number,
        logCount: r.log_count as number,
      }));
    },
    getSessionLogs(sid) {
      return (selLogs.all(sid) as Record<string, unknown>[]).map((r) => ({
        id: r.id as number,
        tsMonotonic: r.ts_monotonic as number,
        tsWall: r.ts_wall as number,
        level: r.level as StoredLog["level"],
        category: r.category as string,
        message: r.message as string,
        data: r.data != null ? JSON.parse(r.data as string) : undefined,
      }));
    },
    insertCapture(rec) {
      insCapture.run(
        rec.id,
        rec.sessionId,
        rec.createdAt,
        rec.clipPath,
        rec.size,
        JSON.stringify(rec.sidecar),
        rec.timeMap ? JSON.stringify(rec.timeMap) : null,
        rec.status,
      );
    },
    listCaptures() {
      return (selCaptures.all() as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        sessionId: r.session_id as string,
        createdAt: r.created_at as number,
        size: (r.size as number | null) ?? null,
        timeMap: r.time_map != null ? (JSON.parse(r.time_map as string) as TimeMap) : null,
        status: r.status as string,
      }));
    },
    getCapture(id) {
      const r = selCapture.get(id) as Record<string, unknown> | undefined;
      if (!r) return null;
      return {
        id: r.id as string,
        sessionId: r.session_id as string,
        createdAt: r.created_at as number,
        clipPath: r.clip_path as string,
        size: (r.size as number | null) ?? null,
        sidecar: JSON.parse(r.sidecar as string) as Sidecar,
        timeMap: r.time_map != null ? (JSON.parse(r.time_map as string) as TimeMap) : null,
        status: r.status as string,
      };
    },
  };
}

let singleton: ObservabilityStore | null = null;

/** Store singleton sur `data/valk.sqlite` (override via VALK_DB_PATH). */
export function getStore(): ObservabilityStore {
  if (!singleton) {
    singleton = createSqliteStore(process.env.VALK_DB_PATH || "data/valk.sqlite");
  }
  return singleton;
}
