import { describe, it, expect } from 'vitest';
import { fitLinearTimeMap, SHARED_SCHEMA_VERSION } from '../index';

describe('fitLinearTimeMap', () => {
  it('résout a et b à partir de deux ancres exactes', () => {
    const { a, b, anchors } = fitLinearTimeMap([
      { stim: 0, video: 100 },
      { stim: 1000, video: 1100 },
    ]);
    expect(a).toBeCloseTo(1, 6);
    expect(b).toBeCloseTo(100, 6);
    expect(anchors).toBe(2);
  });

  it('ajuste une pente (dérive fps) sur deux ancres', () => {
    const { a, b } = fitLinearTimeMap([
      { stim: 0, video: 0 },
      { stim: 1000, video: 1020 },
    ]);
    expect(a).toBeCloseTo(1.02, 6);
    expect(b).toBeCloseTo(0, 6);
  });

  it('moindres carrés sur 3+ ancres bruitées', () => {
    const { a, b } = fitLinearTimeMap([
      { stim: 0, video: 1 },
      { stim: 10, video: 11 },
      { stim: 20, video: 21 },
    ]);
    expect(a).toBeCloseTo(1, 6);
    expect(b).toBeCloseTo(1, 6);
  });

  it('lève si moins de 2 ancres', () => {
    expect(() => fitLinearTimeMap([{ stim: 0, video: 0 }])).toThrow();
  });

  it('expose la version de schéma', () => {
    expect(SHARED_SCHEMA_VERSION).toBe(1);
  });
});
