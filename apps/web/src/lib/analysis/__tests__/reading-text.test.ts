import { describe, it, expect } from "vitest";
import {
  CALIBRATION_TEXT,
  TWISTER_POOL,
  pickReadingText,
  wordCount,
} from "@/lib/analysis/reading-text";

describe("reading-text", () => {
  it("CALIBRATION_TEXT is 45-70 words of phonetically balanced French", () => {
    const count = wordCount(CALIBRATION_TEXT);
    expect(count).toBeGreaterThanOrEqual(45);
    expect(count).toBeLessThanOrEqual(70);
  });

  it("TWISTER_POOL has at least 8 entries", () => {
    expect(TWISTER_POOL.length).toBeGreaterThanOrEqual(8);
  });

  it("each TWISTER_POOL entry is between 6 and 20 words", () => {
    for (const tw of TWISTER_POOL) {
      const c = wordCount(tw);
      expect(c).toBeGreaterThanOrEqual(6);
      expect(c).toBeLessThanOrEqual(20);
    }
  });

  it("pickReadingText returns a paragraph starting with CALIBRATION_TEXT and containing one twister", () => {
    const { lines, totalWords, twisterIndex } = pickReadingText();
    expect(lines[0]).toBe(CALIBRATION_TEXT);
    expect(TWISTER_POOL).toContain(lines[1]);
    expect(twisterIndex).toBeGreaterThanOrEqual(0);
    expect(twisterIndex).toBeLessThan(TWISTER_POOL.length);
    expect(totalWords).toBeGreaterThanOrEqual(50);
  });

  it("pickReadingText varies the twister across 30 calls (anti-gaming)", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 30; i++) seen.add(pickReadingText().twisterIndex);
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});
