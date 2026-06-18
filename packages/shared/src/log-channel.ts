import type { LogBatch, LogEntry, LogLevel, DeviceContext } from "./observability";

const DEFAULT_MAX_BUFFER = 500;
const DEFAULT_FLUSH_THRESHOLD = 20;

/** Tampon borné d'entrées de log (garde les plus récentes si débordement). */
export class LogBuffer {
  private pending: LogEntry[] = [];
  constructor(private max = DEFAULT_MAX_BUFFER) {}
  add(e: LogEntry): void {
    this.pending.push(e);
    if (this.pending.length > this.max) this.pending = this.pending.slice(-this.max);
  }
  /** Ré-enfile en tête (après un échec d'envoi) sans dépasser la capacité. */
  prepend(entries: LogEntry[]): void {
    this.pending = [...entries, ...this.pending].slice(-this.max);
  }
  drain(): LogEntry[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }
  size(): number {
    return this.pending.length;
  }
  snapshot(): LogEntry[] {
    return [...this.pending];
  }
}

/** Envoie un lot ; renvoie true si accepté par le serveur. */
export type SendFn = (batch: LogBatch) => Promise<boolean>;

export interface LogChannelOptions {
  sessionId: string;
  device: DeviceContext;
  send: SendFn;
  flushThreshold?: number;
  maxBuffer?: number;
  now?: () => number; // horloge monotone (ms)
  wallNow?: () => number; // epoch (ms)
}

/**
 * Cœur du logger, agnostique de la plateforme : bufferise les entrées, flush au
 * seuil ou sur demande, et **ré-enfile en cas d'échec réseau** (aucun log perdu
 * tant que la session vit). L'envoi (fetch) et le contexte device sont injectés.
 */
export class LogChannel {
  private buf: LogBuffer;
  private flushing = false;

  constructor(private opts: LogChannelOptions) {
    this.buf = new LogBuffer(opts.maxBuffer);
  }

  log(level: LogLevel, category: string, message: string, data?: unknown): void {
    const now = this.opts.now ? this.opts.now() : 0;
    const wall = this.opts.wallNow ? this.opts.wallNow() : 0;
    this.buf.add({ tsMonotonic: now, tsWall: wall, level, category, message, data });
    if (this.buf.size() >= (this.opts.flushThreshold ?? DEFAULT_FLUSH_THRESHOLD)) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.flushing || this.buf.size() === 0) return;
    this.flushing = true;
    const entries = this.buf.drain();
    try {
      const ok = await this.opts.send({
        sessionId: this.opts.sessionId,
        device: this.opts.device,
        entries,
      });
      if (!ok) this.buf.prepend(entries);
    } catch {
      this.buf.prepend(entries);
    } finally {
      this.flushing = false;
    }
  }

  /** Ré-injecte des entrées persistées d'une session précédente (offline buffer). */
  restore(entries: LogEntry[]): void {
    if (entries.length) this.buf.prepend(entries);
  }

  size(): number {
    return this.buf.size();
  }

  pendingSnapshot(): LogEntry[] {
    return this.buf.snapshot();
  }
}
