// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readdirSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";

function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, "tools/vision"))) return dir;
    const p = dirname(dir);
    if (p === dir) break;
    dir = p;
  }
  return process.cwd();
}
const ROOT = repoRoot();
const MEDIA = resolve(ROOT, "data/media");
const clipDir = existsSync(MEDIA)
  ? readdirSync(MEDIA).find(
      (d) =>
        d.startsWith("proto-") &&
        existsSync(join(MEDIA, d, "clip.mov")) &&
        existsSync(join(MEDIA, d, "sidecar.json")),
    )
  : undefined;

process.env.VALK_DB_PATH = join(mkdtempSync(join(tmpdir(), "valk-an-")), "db.sqlite");
process.env.VALK_DEBUG_KEY = "testkey";

// Nécessite un vrai clip uploadé (data/media/proto-*). Sinon skip (CI sans clip).
describe.skipIf(!clipDir)("/api/captures/[id]/analyze (clip réel)", () => {
  beforeAll(async () => {
    const { getStore } = await import("@/lib/observability/db");
    const { computeTimeMap } = await import("@/lib/observability/flash-detect");
    const dir = join(MEDIA, clipDir!);
    const clipPath = join(dir, "clip.mov");
    const sidecar = JSON.parse(readFileSync(join(dir, "sidecar.json"), "utf8"));
    const timeMap = await computeTimeMap(clipPath, sidecar);
    getStore().insertCapture({
      id: clipDir!,
      sessionId: "seed",
      createdAt: 1,
      clipPath,
      size: null,
      sidecar,
      timeMap,
      status: timeMap.status,
      analysis: null,
      calibration: null,
    });
  }, 60000);

  it("analyse un clip réel -> r > 0.4 et facePct élevé", async () => {
    const { POST } = await import("../route");
    const req = new Request(`http://localhost/api/captures/${clipDir}/analyze`, {
      method: "POST",
      headers: { "x-valk-debug-key": "testkey" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: clipDir! }) });
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.ok).toBe(true);
    expect(j.facePct).toBeGreaterThan(90);
    expect(Math.abs(j.r)).toBeGreaterThan(0.4);
  }, 60000);
});
