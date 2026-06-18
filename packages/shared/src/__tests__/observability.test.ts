import { describe, it, expect } from 'vitest';
import { logBatchSchema, logEntrySchema, deviceContextSchema } from '../index';

const validBatch = {
  sessionId: 'sess-123',
  device: { platform: 'ios', osVersion: '26.5', model: 'iPhone', appVersion: '1.0.0', runtime: 'expoGo' },
  entries: [
    { tsMonotonic: 12.5, tsWall: 1_700_000_000_000, level: 'info', category: 'app', message: 'start' },
    { tsMonotonic: 30.0, tsWall: 1_700_000_000_050, level: 'warn', category: 'net', message: 'slow', data: { ms: 800 } },
  ],
};

describe('observability schemas', () => {
  it('accepte un batch valide', () => {
    const parsed = logBatchSchema.parse(validBatch);
    expect(parsed.sessionId).toBe('sess-123');
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.device.runtime).toBe('expoGo');
  });

  it('rejette un niveau invalide', () => {
    const bad = { ...validBatch, entries: [{ ...validBatch.entries[0], level: 'critical' }] };
    expect(() => logBatchSchema.parse(bad)).toThrow();
  });

  it('rejette entries absent', () => {
    const { entries: _omit, ...noEntries } = validBatch;
    expect(() => logBatchSchema.parse(noEntries)).toThrow();
  });

  it('rejette un sessionId vide', () => {
    expect(() => logBatchSchema.parse({ ...validBatch, sessionId: '' })).toThrow();
  });

  it('deviceContext : runtime hors enum rejeté', () => {
    expect(() => deviceContextSchema.parse({ platform: 'ios', runtime: 'nope' })).toThrow();
  });

  it('logEntry : data est optionnel', () => {
    const parsed = logEntrySchema.parse({ tsMonotonic: 1, tsWall: 2, level: 'trace', category: 'x', message: 'y' });
    expect(parsed.data).toBeUndefined();
  });
});
