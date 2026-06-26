// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractLuma, detectFlashes, computeTimeMap } from "../flash-detect";
import type { Sidecar } from "@valk/shared";

const execFileP = promisify(execFile);
let dir = "";
let clip = "";

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "valk-flash-"));
  clip = join(dir, "synth.mp4");
  // 8s noir 30fps + flash blanc plein cadre à t=1s et t=6s (0.2s chacun)
  await execFileP("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "color=c=black:s=128x128:d=8:r=30",
    "-vf", "drawbox=enable='between(t,1,1.2)+between(t,6,6.2)':color=white:t=fill",
    clip,
  ]);
}, 60000);

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("flash-detect", () => {
  it("extrait la luminance par frame", async () => {
    const luma = await extractLuma(clip);
    expect(luma.length).toBeGreaterThan(200);
  });

  it("détecte 2 flashs aux bons instants", async () => {
    const flashes = detectFlashes(await extractLuma(clip));
    expect(flashes).toHaveLength(2);
    expect(flashes[0]).toBeCloseTo(1, 1);
    expect(flashes[1]).toBeCloseTo(6, 1);
  });

  it("computeTimeMap fitte sur les 2 ancres", async () => {
    const sidecar = {
      syncMarkers: [
        { kind: "flash", edge: "start", scheduledMs: 1000, durationMs: 200 },
        { kind: "flash", edge: "end", scheduledMs: 6000, durationMs: 200 },
      ],
    } as unknown as Sidecar;
    const tm = await computeTimeMap(clip, sidecar);
    expect(tm.status).toBe("verified");
    expect(tm.anchors).toBe(2);
    expect(tm.a).toBeCloseTo(1, 1); // stim 1000→vid 1000, stim 6000→vid 6000 ⇒ a≈1
    expect(tm.b).toBeCloseTo(0, 0);
  });

  it("sync_unverified si pas assez de flashs", async () => {
    const flat = Array.from({ length: 100 }, (_, i) => ({ t: i / 30, y: 50 }));
    expect(detectFlashes(flat)).toHaveLength(0);
  });
});
