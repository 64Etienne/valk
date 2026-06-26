// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileP = promisify(execFile);
const root = mkdtempSync(join(tmpdir(), "valk-cap-"));
process.env.VALK_DB_PATH = join(root, "db.sqlite");
process.env.VALK_MEDIA_DIR = join(root, "media");
process.env.VALK_DEBUG_KEY = "testkey";

import { POST, GET } from "../route";

let clipBuf: Buffer;

beforeAll(async () => {
  const clip = join(root, "synth.mp4");
  await execFileP("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "color=c=black:s=128x128:d=8:r=30",
    "-vf", "drawbox=enable='between(t,1,1.2)+between(t,6,6.2)':color=white:t=fill", clip,
  ]);
  clipBuf = readFileSync(clip);
}, 60000);

afterAll(() => {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function sidecar() {
  return {
    schemaVersion: 1,
    sessionId: "s1",
    clock: { domain: "performance.now", t0Monotonic: 0, t0Wall: 1 },
    recording: { requestedQuality: "720p", mirror: false },
    syncMarkers: [
      { kind: "flash", edge: "start", scheduledMs: 1000, durationMs: 200 },
      { kind: "flash", edge: "end", scheduledMs: 6000, durationMs: 200 },
    ],
    stimuli: [
      {
        type: "smooth_pursuit_h",
        model: { type: "smooth_pursuit_h", center: 0.5, amplitude: 0.4, cycles: 1.5, startMs: 1500, durationMs: 6000 },
        samples: [],
      },
    ],
  };
}

describe("/api/captures", () => {
  it("POST clip+sidecar → stocke + time-map verified", async () => {
    const form = new FormData();
    form.append("clip", new File([new Uint8Array(clipBuf)], "clip.mov", { type: "video/quicktime" }));
    form.append("sidecar", JSON.stringify(sidecar()));
    form.append("sessionId", "s1");
    const res = await POST(new Request("http://localhost/api/captures", { method: "POST", body: form, headers: { "x-valk-debug-key": "testkey" } }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.captureId).toBeTruthy();
    expect(j.timeMap.status).toBe("verified");
    expect(j.timeMap.a).toBeCloseTo(1, 1);
  });

  it("GET liste gatée par la clé", async () => {
    const noKey = await GET(new Request("http://localhost/api/captures"));
    expect(noKey.status).toBe(401);
    const ok = await GET(new Request("http://localhost/api/captures?key=testkey"));
    const j = await ok.json();
    expect(j.captures.length).toBeGreaterThanOrEqual(1);
    expect(j.captures[0].timeMap.status).toBe("verified");
  });

  it("POST sans sidecar → 400", async () => {
    const form = new FormData();
    form.append("clip", new File([new Uint8Array(clipBuf)], "clip.mov", { type: "video/quicktime" }));
    const res = await POST(new Request("http://localhost/api/captures", { method: "POST", body: form, headers: { "x-valk-debug-key": "testkey" } }));
    expect(res.status).toBe(400);
  });

  it("POST sans clé → 401", async () => {
    const form = new FormData();
    form.append("clip", new File([new Uint8Array(clipBuf)], "clip.mov", { type: "video/quicktime" }));
    form.append("sidecar", JSON.stringify(sidecar()));
    const res = await POST(new Request("http://localhost/api/captures", { method: "POST", body: form }));
    expect(res.status).toBe(401);
  });
});
