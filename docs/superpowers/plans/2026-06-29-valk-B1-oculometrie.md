# Valk B1 — Oculométrie (extraction du regard + visualisation) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extraire la position horizontale du regard d'une capture de poursuite (MediaPipe), l'aligner au stimulus via le time-map (A4), et la rendre visible (courbes `x(t)` + overlay vidéo + corrélation `r`).

**Architecture:** La vision est isolée en Python (`tools/vision/`, venv 3.12) ; Node (Next.js) orchestre, aligne dans le temps et stocke. `extract_gaze.py` sort les `gazeH` par frame en JSON ; `lib/analysis/gaze.ts` lance ce sous-processus (comme ffmpeg) et construit le signal aligné ; `POST /api/captures/[id]/analyze` (gaté, découplé de l'upload) persiste le signal + génère `overlay.mp4` ; `/debug` affiche un bouton « Analyser » + les courbes SVG + le lien overlay.

**Tech Stack:** Python 3.12 (venv `uv`), mediapipe 0.10.35 (API **Tasks** `FaceLandmarker`), opencv-contrib-python 4.13, numpy 2.5 ; Node/TypeScript (Next.js 16, `node:sqlite`, `execFile`), `@valk/shared` (`pursuitX`), vitest.

## Global Constraints

- **gazeH = iris relatif à la largeur du visage** : `(irisX − faceLeftX)/(faceRightX − faceLeftX)`, `irisX = (lm[468].x+lm[473].x)/2`, `faceLeftX = lm[234].x`, `faceRightX = lm[454].x`. **JAMAIS** l'iris-dans-l'œil (validé : `r≈0.08` vs `r≈0.70`).
- MediaPipe **API Tasks uniquement** (`from mediapipe.tasks.python import vision`) — `mp.solutions` absent en 0.10.35. Modèle `tools/vision/models/face_landmarker.task`.
- Sous-processus Python via **`execFile`** (jamais shell). Binaire : `process.env.VALK_VISION_PYTHON || "tools/vision/.venv/bin/python"`.
- Endpoints `runtime = "nodejs"`, gatés `VALK_DEBUG_KEY` (`checkDebugKey`/`unauthorized` existants). Fichiers servis avec **containment** au dossier media.
- Lissage du regard : moyenne glissante **centrée** w=7 (éviter le bug bord-de-convolution `mode="same"` ; utiliser un calcul centré explicite).
- Statuts analyse : `ok` | `gaze_unreliable` (visage < 60 %) | `sync_unverified` (time-map non vérifié) | `failed`.
- Branche `feat/valk-B1-oculometrie`. venv + modèles **gitignorés** (déjà fait). Tester en réel sur les clips iPhone déjà uploadés (`data/media/proto-*`).

## File Structure

- `tools/vision/requirements.txt` — deps épinglées.
- `tools/vision/setup.sh` — venv `uv` + install + download modèle.
- `tools/vision/extract_gaze.py` — extraction `gazeH` → JSON (responsabilité : vision pure).
- `tools/vision/draw_overlay.py` — dessine l'overlay vidéo.
- `tools/vision/test_extract_gaze.py` — test contrat (vidéo sans visage).
- `apps/web/src/lib/analysis/gaze.ts` — `runExtraction` (subprocess) + `buildSignal` (math d'alignement).
- `apps/web/src/lib/analysis/__tests__/gaze.test.ts` — tests math Node.
- `apps/web/src/lib/observability/db.ts` — *modifier* : colonne `analysis` + `setCaptureAnalysis`.
- `apps/web/src/app/api/captures/[id]/analyze/route.ts` — POST analyse.
- `apps/web/src/app/api/captures/[id]/overlay/route.ts` — GET overlay (gaté + containment).
- `apps/web/src/app/debug/AnalyzeButton.tsx` — bouton client.
- `apps/web/src/app/debug/GazeChart.tsx` — courbes SVG.
- `apps/web/src/app/debug/page.tsx` — *modifier* : câbler bouton + chart + lien overlay.

---

### Task 1: Setup `tools/vision` (venv + requirements + setup.sh)

**Files:**
- Create: `tools/vision/requirements.txt`, `tools/vision/setup.sh`
- (Le venv `tools/vision/.venv` et `tools/vision/models/` sont déjà montés et gitignorés.)

**Interfaces:**
- Produces: un venv exécutable à `tools/vision/.venv/bin/python` avec mediapipe/opencv/numpy ; le modèle `tools/vision/models/face_landmarker.task`.

- [ ] **Step 1: Écrire `tools/vision/requirements.txt`**

```
mediapipe==0.10.35
opencv-contrib-python==4.13.0.92
numpy==2.5.0
pytest==8.3.4
```

- [ ] **Step 2: Écrire `tools/vision/setup.sh`**

```bash
#!/usr/bin/env bash
# Monte le venv Python de vision (idempotent). Prérequis : uv installé.
set -euo pipefail
cd "$(dirname "$0")"
MODEL_URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"

uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -r requirements.txt

mkdir -p models
if [ ! -f models/face_landmarker.task ]; then
  curl -sL -o models/face_landmarker.task "$MODEL_URL"
fi
.venv/bin/python -c "import mediapipe, cv2, numpy; print('vision OK', mediapipe.__version__, cv2.__version__)"
```

- [ ] **Step 3: Rendre exécutable + lancer (idempotent sur le venv existant)**

Run: `chmod +x tools/vision/setup.sh && bash tools/vision/setup.sh`
Expected: dernière ligne `vision OK 0.10.35 4.13.0` (ou proche), pas d'erreur.

- [ ] **Step 4: Commit**

```bash
git add tools/vision/requirements.txt tools/vision/setup.sh
git commit -m "feat(vision): setup venv Python 3.12 + mediapipe (requirements + setup.sh)"
```

---

### Task 2: `extract_gaze.py` + test contrat

**Files:**
- Create: `tools/vision/extract_gaze.py`, `tools/vision/test_extract_gaze.py`

**Interfaces:**
- Produces (contrat stdout JSON) : `{ "fps": number, "width": int, "height": int, "frames": [{ "t": number_seconds, "ok": bool, "gazeH": number|null, "irisPx": [x,y]|null }] }`. Usage : `python extract_gaze.py <clip> [model]`.

- [ ] **Step 1: Écrire `tools/vision/extract_gaze.py`**

```python
#!/usr/bin/env python3
"""Extrait gazeH (iris relatif au visage) frame par frame -> JSON stdout."""
import sys, json
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

DEFAULT_MODEL = "tools/vision/models/face_landmarker.task"

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: extract_gaze.py <clip> [model]"})); sys.exit(2)
    clip = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_MODEL
    base = mp_python.BaseOptions(model_asset_path=model)
    opts = vision.FaceLandmarkerOptions(
        base_options=base, num_faces=1, running_mode=vision.RunningMode.VIDEO)
    lmkr = vision.FaceLandmarker.create_from_options(opts)

    cap = cv2.VideoCapture(clip)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frames = []
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        res = lmkr.detect_for_video(
            mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), int(idx * 1000 / fps))
        rec = {"t": idx / fps, "ok": False, "gazeH": None, "irisPx": None}
        if res.face_landmarks and len(res.face_landmarks[0]) >= 478:
            lm = res.face_landmarks[0]
            iris_x = (lm[468].x + lm[473].x) / 2.0
            fl, fr = lm[234].x, lm[454].x
            if (fr - fl) > 1e-6:
                rec["gazeH"] = (iris_x - fl) / (fr - fl)
                iris_y = (lm[468].y + lm[473].y) / 2.0
                rec["irisPx"] = [iris_x * width, iris_y * height]
                rec["ok"] = True
        frames.append(rec)
        idx += 1
    cap.release()
    print(json.dumps({"fps": fps, "width": width, "height": height, "frames": frames}))

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Écrire le test contrat `tools/vision/test_extract_gaze.py`**

```python
import subprocess, sys, json, os, tempfile

HERE = os.path.dirname(__file__)
PY = os.path.join(HERE, ".venv", "bin", "python")
SCRIPT = os.path.join(HERE, "extract_gaze.py")
MODEL = os.path.join(HERE, "models", "face_landmarker.task")

def test_no_face_returns_valid_json():
    # vidéo synthétique sans visage (noir) -> JSON valide, tous ok=false
    with tempfile.TemporaryDirectory() as d:
        clip = os.path.join(d, "blank.mp4")
        subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i",
                        "color=c=black:s=128x128:d=1:r=30", clip],
                       check=True, capture_output=True)
        out = subprocess.run([PY, SCRIPT, clip, MODEL], check=True, capture_output=True, text=True)
        data = json.loads(out.stdout)
        assert "frames" in data and len(data["frames"]) > 10
        assert all(f["ok"] is False for f in data["frames"])
        assert all(f["gazeH"] is None for f in data["frames"])
```

- [ ] **Step 3: Lancer le test contrat**

Run: `tools/vision/.venv/bin/python -m pytest tools/vision/test_extract_gaze.py -v`
Expected: PASS (1 test).

- [ ] **Step 4: Vérifier sur le clip RÉEL (pas à l'aveugle)**

Run:
```bash
CLIP=$(ls data/media/proto-*/clip.mov | head -1)
tools/vision/.venv/bin/python tools/vision/extract_gaze.py "$CLIP" tools/vision/models/face_landmarker.task 2>/dev/null \
 | tools/vision/.venv/bin/python -c "import sys,json; d=json.load(sys.stdin); n=len(d['frames']); ok=sum(f['ok'] for f in d['frames']); print(f'frames={n} face={100*ok//n}%')"
```
Expected: `frames=~218 face=100%`.

- [ ] **Step 5: Commit**

```bash
git add tools/vision/extract_gaze.py tools/vision/test_extract_gaze.py
git commit -m "feat(vision): extract_gaze.py (iris-relatif-au-visage -> JSON) + test contrat"
```

---

### Task 3: `buildSignal` (math d'alignement Node) + tests unitaires

**Files:**
- Create: `apps/web/src/lib/analysis/gaze.ts` (d'abord `buildSignal` + types + helpers purs)
- Create: `apps/web/src/lib/analysis/__tests__/gaze.test.ts`

**Interfaces:**
- Consumes: `pursuitX`, `Sidecar` (`@valk/shared`) ; `TimeMap` (`../observability/flash-detect`, champs `a,b,status`).
- Produces:
  - `interface GazeFrame { t: number; ok: boolean; gazeH: number | null; irisPx?: [number, number] | null }`
  - `interface Extraction { fps: number; width: number; height: number; frames: GazeFrame[] }`
  - `interface GazePoint { t: number; stimulusX: number; gazeX: number }`
  - `interface GazeSignal { points: GazePoint[]; r: number; facePct: number; signFlipped: boolean; status: "ok" | "gaze_unreliable" | "sync_unverified" | "failed" }`
  - `buildSignal(extraction: Extraction, sidecar: Sidecar, timeMap: TimeMap): GazeSignal`

- [ ] **Step 1: Écrire les tests `apps/web/src/lib/analysis/__tests__/gaze.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildSignal, type Extraction } from "../gaze";
import { pursuitX, type Sidecar } from "@valk/shared";
import type { TimeMap } from "../../observability/flash-detect";

const model = { type: "smooth_pursuit_h", center: 0.5, amplitude: 0.4, cycles: 1.5, startMs: 1000, durationMs: 6000 } as const;
const sidecar = {
  schemaVersion: 1, sessionId: "s",
  clock: { domain: "performance.now", t0Monotonic: 0, t0Wall: 1 },
  recording: { requestedQuality: "720p", mirror: false },
  syncMarkers: [
    { kind: "flash", edge: "start", scheduledMs: 1000, durationMs: 200 },
    { kind: "flash", edge: "end", scheduledMs: 7000, durationMs: 200 },
  ],
  stimuli: [{ type: "smooth_pursuit_h", model, samples: [] }],
} as unknown as Sidecar;
// time-map identité : video_ms = 1*stim_ms + 0
const timeMap: TimeMap = { a: 1, b: 0, anchors: 2, status: "verified" };

// 7s @ 30fps ; gazeH = stimulus exact (poursuite parfaite) sur la fenêtre, sinon centre
function frames(transform: (x: number) => number): Extraction {
  const fr = [];
  for (let i = 0; i < 210; i++) {
    const t = i / 30;
    const x = pursuitX(model, t * 1000); // stim_ms = t*1000 (timeMap identité)
    fr.push({ t, ok: true, gazeH: transform(x), irisPx: [x * 100, 50] as [number, number] });
  }
  return { fps: 30, width: 100, height: 100, frames: fr };
}

describe("buildSignal", () => {
  it("poursuite parfaite -> r proche de 1", () => {
    const s = buildSignal(frames((x) => x), sidecar, timeMap);
    expect(s.status).toBe("ok");
    expect(s.r).toBeGreaterThan(0.95);
    expect(s.signFlipped).toBe(false);
    expect(s.points.length).toBeGreaterThan(150); // fenêtre stimulus ~6s
  });

  it("signe inversé (miroir) -> détecté et r positif", () => {
    const s = buildSignal(frames((x) => 1 - x), sidecar, timeMap);
    expect(s.signFlipped).toBe(true);
    expect(s.r).toBeGreaterThan(0.95);
  });

  it("visage absent en majorité -> gaze_unreliable", () => {
    const e = frames((x) => x);
    e.frames.forEach((f, i) => { if (i % 3 !== 0) { f.ok = false; f.gazeH = null; } });
    const s = buildSignal(e, sidecar, timeMap);
    expect(s.facePct).toBeLessThan(60);
    expect(s.status).toBe("gaze_unreliable");
  });

  it("time-map non vérifié -> status sync_unverified mais calcule quand même", () => {
    const s = buildSignal(frames((x) => x), sidecar, { a: 1, b: 0, anchors: 0, status: "sync_unverified" });
    expect(s.status).toBe("sync_unverified");
    expect(s.points.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Lancer — vérifier l'échec**

Run: `npx --no-install vitest run src/lib/analysis/__tests__/gaze.test.ts --root apps/web`
Expected: FAIL (`buildSignal` introuvable).

- [ ] **Step 3: Écrire `apps/web/src/lib/analysis/gaze.ts` (partie pure)**

```ts
import { pursuitX, type Sidecar } from "@valk/shared";
import type { TimeMap } from "../observability/flash-detect";

export interface GazeFrame { t: number; ok: boolean; gazeH: number | null; irisPx?: [number, number] | null }
export interface Extraction { fps: number; width: number; height: number; frames: GazeFrame[] }
export interface GazePoint { t: number; stimulusX: number; gazeX: number }
export interface GazeSignal {
  points: GazePoint[];
  r: number;
  facePct: number;
  signFlipped: boolean;
  status: "ok" | "gaze_unreliable" | "sync_unverified" | "failed";
}

const FACE_MIN_PCT = 60;

/** Moyenne glissante CENTRÉE (bords rétrécis, pas de zéro-padding). */
function centeredMA(xs: number[], w: number): number[] {
  const h = Math.floor(w / 2);
  return xs.map((_, i) => {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(xs.length - 1, i + h); j++) { s += xs[j]; n++; }
    return s / n;
  });
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 0;
  const ma = a.reduce((p, c) => p + c, 0) / n;
  const mb = b.reduce((p, c) => p + c, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  const den = Math.sqrt(da * db);
  return den < 1e-12 ? 0 : num / den;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
}
/** Normalise sur la plage robuste p5–p95 vers ~[0,1]. */
function robustNorm(xs: number[]): number[] {
  const s = xs.slice().sort((u, v) => u - v);
  const lo = percentile(s, 0.05), hi = percentile(s, 0.95);
  const d = hi - lo || 1e-9;
  return xs.map((x) => (x - lo) / d);
}

export function buildSignal(extraction: Extraction, sidecar: Sidecar, timeMap: TimeMap): GazeSignal {
  const { frames } = extraction;
  const facePct = (100 * frames.filter((f) => f.ok).length) / Math.max(1, frames.length);
  const model = sidecar.stimuli[0].model;
  const { a, b } = timeMap;

  // frames OK dans la fenêtre du stimulus
  const sel: { t: number; gaze: number; stim: number }[] = [];
  for (const f of frames) {
    if (!f.ok || f.gazeH == null) continue;
    const stimMs = (f.t * 1000 - b) / a;
    if (stimMs >= model.startMs && stimMs <= model.startMs + model.durationMs) {
      sel.push({ t: f.t, gaze: f.gazeH, stim: pursuitX(model, stimMs) });
    }
  }

  if (sel.length < 5) {
    return { points: [], r: 0, facePct, signFlipped: false, status: "failed" };
  }

  const gazeSmooth = centeredMA(sel.map((p) => p.gaze), 7);
  const gazeN = robustNorm(gazeSmooth);
  const stimN = robustNorm(sel.map((p) => p.stim));

  let r = pearson(gazeN, stimN);
  let signFlipped = false;
  let gazeOut = gazeN;
  if (r < 0) { signFlipped = true; gazeOut = gazeN.map((x) => 1 - x); r = -r; }

  const points: GazePoint[] = sel.map((p, i) => ({ t: p.t, stimulusX: stimN[i], gazeX: gazeOut[i] }));

  let status: GazeSignal["status"] = "ok";
  if (timeMap.status !== "verified") status = "sync_unverified";
  else if (facePct < FACE_MIN_PCT) status = "gaze_unreliable";

  return { points, r, facePct, signFlipped, status };
}
```

- [ ] **Step 4: Lancer — vérifier le succès**

Run: `npx --no-install vitest run src/lib/analysis/__tests__/gaze.test.ts --root apps/web`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/analysis/gaze.ts apps/web/src/lib/analysis/__tests__/gaze.test.ts
git commit -m "feat(analysis): buildSignal (alignement regard<->stimulus, lissage, signe, r)"
```

---

### Task 4: `runExtraction` (subprocess Python) + validation clip réel

**Files:**
- Modify: `apps/web/src/lib/analysis/gaze.ts` (ajouter `runExtraction`)

**Interfaces:**
- Produces: `runExtraction(clipPath: string): Promise<Extraction>` — lance le venv python + `extract_gaze.py`, parse le JSON.

- [ ] **Step 1: Ajouter `runExtraction` en tête de `gaze.ts`**

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileP = promisify(execFile);

const VISION_PY = () => process.env.VALK_VISION_PYTHON || "tools/vision/.venv/bin/python";
const EXTRACT = "tools/vision/extract_gaze.py";
const MODEL = "tools/vision/models/face_landmarker.task";

export async function runExtraction(clipPath: string): Promise<Extraction> {
  const { stdout } = await execFileP(VISION_PY(), [EXTRACT, clipPath, MODEL], {
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
  });
  return JSON.parse(stdout) as Extraction;
}
```

- [ ] **Step 2: Vérifier sur le clip RÉEL via un script ad hoc**

Run:
```bash
CLIP=$(ls data/media/proto-*/clip.mov | head -1)
node --input-type=module -e "
import('./apps/web/src/lib/analysis/gaze.ts').catch(()=>{});" 2>/dev/null || true
# Vérif directe via tsx si dispo, sinon via le test d'intégration de la Task 6.
echo "Validation déléguée au test d'intégration Task 6 (endpoint analyze sur clip réel)."
```
Expected: pas d'erreur ; la validation réelle de `runExtraction` est couverte par le test d'intégration de la Task 6 (qui appelle l'endpoint sur le clip réel).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/analysis/gaze.ts
git commit -m "feat(analysis): runExtraction (subprocess venv python -> Extraction)"
```

---

### Task 5: Colonne `analysis` (stockage)

**Files:**
- Modify: `apps/web/src/lib/observability/db.ts`

**Interfaces:**
- Consumes: `GazeSignal` (`../analysis/gaze`).
- Produces: `setCaptureAnalysis(id: string, analysis: GazeSignal): void` sur `ObservabilityStore` ; `CaptureRecord.analysis: GazeSignal | null`.

- [ ] **Step 1: Migration — ajouter la colonne dans `migrate()`**

Dans le `db.exec(...)` de `migrate`, après la création de `captures`, ajouter (SQLite ignore l'erreur si la colonne existe via un try/catch séparé) :

```ts
// après le CREATE TABLE captures (...)
try {
  db.exec(`ALTER TABLE captures ADD COLUMN analysis TEXT`);
} catch {
  /* colonne déjà présente */
}
```

- [ ] **Step 2: Type + import**

En tête : `import type { GazeSignal } from "../analysis/gaze";`
Dans `CaptureRecord`, ajouter : `analysis: GazeSignal | null;`
Dans `CaptureSummary`, ajouter : `analysis: GazeSignal | null;`
Dans l'interface `ObservabilityStore`, ajouter : `setCaptureAnalysis(id: string, analysis: GazeSignal): void;`

- [ ] **Step 3: Statements + méthodes**

Ajouter un statement préparé : `const updAnalysis = db.prepare("UPDATE captures SET analysis = ? WHERE id = ?");`
Dans `getCapture` et `listCaptures`, mapper la colonne : `analysis: r.analysis != null ? JSON.parse(r.analysis as string) as GazeSignal : null` (et inclure `analysis` dans le SELECT de `selCaptures`).
Ajouter la méthode :

```ts
    setCaptureAnalysis(id, analysis) {
      updAnalysis.run(JSON.stringify(analysis), id);
    },
```

- [ ] **Step 4: Test — étendre `db.test.ts`**

```ts
it("setCaptureAnalysis met à jour et relit l'analyse", () => {
  const store = createSqliteStore(":memory:");
  store.insertCapture({
    id: "c1", sessionId: "s1", createdAt: 1, clipPath: "/x/clip.mov",
    size: 10, sidecar: {} as never, timeMap: null, status: "verified", analysis: null,
  });
  store.setCaptureAnalysis("c1", { points: [], r: 0.7, facePct: 100, signFlipped: true, status: "ok" });
  expect(store.getCapture("c1")?.analysis?.r).toBeCloseTo(0.7);
  expect(store.listCaptures()[0].analysis?.status).toBe("ok");
});
```
(Adapter l'`insertCapture` existant : ajouter `analysis: null` à l'objet de test précédent s'il existe.)

- [ ] **Step 5: Lancer les tests db**

Run: `npx --no-install vitest run src/lib/observability/__tests__/db.test.ts --root apps/web`
Expected: PASS (dont le nouveau test).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/observability/db.ts apps/web/src/lib/observability/__tests__/db.test.ts
git commit -m "feat(db): colonne captures.analysis + setCaptureAnalysis"
```

---

### Task 6: `POST /api/captures/[id]/analyze` (+ test d'intégration clip réel)

**Files:**
- Create: `apps/web/src/app/api/captures/[id]/analyze/route.ts`
- Create: `apps/web/src/app/api/captures/[id]/analyze/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getStore`, `runExtraction`, `buildSignal`, `checkDebugKey`/`unauthorized`. La génération overlay arrive en Task 7 (ici : best-effort, ignorée si absente).
- Produces: `POST` → `{ ok, status, r, facePct, signFlipped }`.

- [ ] **Step 1: Écrire la route `analyze/route.ts`**

```ts
import { getStore } from "@/lib/observability/db";
import { runExtraction, buildSignal } from "@/lib/analysis/gaze";
import { checkDebugKey, unauthorized } from "@/lib/observability/auth";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkDebugKey(request)) return unauthorized();
  const { id } = await params;
  const cap = getStore().getCapture(id);
  if (!cap) return Response.json({ ok: false, error: "not found" }, { status: 404 });
  try {
    const extraction = await runExtraction(cap.clipPath);
    const timeMap = cap.timeMap ?? { a: 1, b: 0, anchors: 0, status: "sync_unverified" as const };
    const signal = buildSignal(extraction, cap.sidecar, timeMap);
    getStore().setCaptureAnalysis(id, signal);
    return Response.json({
      ok: true, status: signal.status, r: signal.r,
      facePct: signal.facePct, signFlipped: signal.signFlipped,
    });
  } catch (e) {
    console.error("VALK analyze failed:", e);
    getStore().setCaptureAnalysis(id, { points: [], r: 0, facePct: 0, signFlipped: false, status: "failed" });
    return Response.json({ ok: false, error: "analyse échouée" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Écrire le test d'intégration (clip réel) `analyze/__tests__/route.test.ts`**

```ts
// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Utilise un vrai clip déjà uploadé si présent ; sinon skip (CI sans clip).
const MEDIA = "data/media";
const dir = existsSync(MEDIA) ? readdirSync(MEDIA).find((d) => d.startsWith("proto-")) : undefined;

describe.skipIf(!dir)("/api/captures/[id]/analyze (clip réel)", () => {
  beforeAll(() => { process.env.VALK_DEBUG_KEY = "testkey"; });
  it("analyse un clip réel -> r > 0.4 et points non vides", async () => {
    process.env.VALK_DB_PATH = process.env.VALK_DB_PATH || "data/valk.sqlite";
    process.env.VALK_MEDIA_DIR = process.env.VALK_MEDIA_DIR || "data/media";
    const { POST } = await import("../route");
    const id = dir!;
    const req = new Request(`http://localhost/api/captures/${id}/analyze`, {
      method: "POST", headers: { "x-valk-debug-key": "testkey" },
    });
    const res = await POST(req, { params: Promise.resolve({ id }) });
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.ok).toBe(true);
    expect(j.facePct).toBeGreaterThan(90);
    expect(Math.abs(j.r)).toBeGreaterThan(0.4);
  }, 60000);
});
```
NB : ce test suppose que la capture `proto-*` existe en base (`getStore().getCapture(id)`). Si la base de test ne la contient pas, transformer en : insérer d'abord la capture depuis le sidecar sur disque. (À l'exécution, valider d'abord que `getCapture(dir)` ≠ null ; sinon, l'agent ajoute un `insertCapture` de seed lisant `data/media/<id>/sidecar.json`.)

- [ ] **Step 3: Lancer le test d'intégration**

Run: `npx --no-install vitest run "src/app/api/captures/[id]/analyze/__tests__/route.test.ts" --root apps/web`
Expected: PASS — `facePct>90`, `|r|>0.4` (≈0.70 attendu).

- [ ] **Step 4: Build web**

Run: `npm run build -w @valk/web`
Expected: build OK, route `/api/captures/[id]/analyze` listée.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/api/captures/[id]/analyze"
git commit -m "feat(api): POST /api/captures/[id]/analyze (extraction + signal + stockage)"
```

---

### Task 7: `draw_overlay.py` + `GET /api/captures/[id]/overlay`

**Files:**
- Create: `tools/vision/draw_overlay.py`
- Create: `apps/web/src/app/api/captures/[id]/overlay/route.ts`
- Modify: `apps/web/src/app/api/captures/[id]/analyze/route.ts` (générer l'overlay après le signal, best-effort)

**Interfaces:**
- Consumes: `signal.json` (le `GazeSignal` sérialisé) écrit par la route analyze.
- Produces: `tools/vision/draw_overlay.py <clip> <signal.json> <out.mp4>` ; `GET overlay` sert `data/media/<id>/overlay.mp4`.

- [ ] **Step 1: Écrire `tools/vision/draw_overlay.py`**

```python
#!/usr/bin/env python3
"""Dessine iris détecté + repère stimulus par frame -> overlay.mp4.
Réutilise extract_gaze pour les irisPx ; le stimulus vient de signal.json (points: [{t, stimulusX}])."""
import sys, json
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

clip, signal_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
model = sys.argv[4] if len(sys.argv) > 4 else "tools/vision/models/face_landmarker.task"
signal = json.load(open(signal_path))
# index stimulus par temps arrondi (ms) pour lookup rapide
stim_by_ms = {round(p["t"] * 1000): p["stimulusX"] for p in signal.get("points", [])}

base = mp_python.BaseOptions(model_asset_path=model)
opts = vision.FaceLandmarkerOptions(base_options=base, num_faces=1, running_mode=vision.RunningMode.VIDEO)
lmkr = vision.FaceLandmarker.create_from_options(opts)

cap = cv2.VideoCapture(clip)
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
writer = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (W, H))
idx = 0
while True:
    ok, frame = cap.read()
    if not ok:
        break
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    res = lmkr.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), int(idx * 1000 / fps))
    if res.face_landmarks and len(res.face_landmarks[0]) >= 478:
        lm = res.face_landmarks[0]
        ix = int((lm[468].x + lm[473].x) / 2 * W); iy = int((lm[468].y + lm[473].y) / 2 * H)
        cv2.circle(frame, (ix, iy), 6, (0, 255, 255), -1)  # iris (jaune)
    sx = stim_by_ms.get(round(idx * 1000 / fps))
    if sx is not None:
        bx = int(sx * W)
        cv2.line(frame, (bx, H - 24), (bx, H - 4), (255, 0, 255), 4)  # repère stimulus (magenta) en bas
    writer.write(frame)
    idx += 1
cap.release(); writer.release()
print(json.dumps({"ok": True, "frames": idx}))
```

- [ ] **Step 2: Brancher la génération overlay dans `analyze/route.ts`**

Après `setCaptureAnalysis(id, signal);`, ajouter (best-effort, non bloquant) :

```ts
// overlay best-effort
try {
  const { writeFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const dir = dirname(cap.clipPath);
  const sigPath = join(dir, "signal.json");
  writeFileSync(sigPath, JSON.stringify(signal));
  await promisify(execFile)(
    process.env.VALK_VISION_PYTHON || "tools/vision/.venv/bin/python",
    ["tools/vision/draw_overlay.py", cap.clipPath, sigPath, join(dir, "overlay.mp4"), "tools/vision/models/face_landmarker.task"],
    { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
  );
} catch (e) {
  console.error("VALK overlay failed (non bloquant):", e);
}
```

- [ ] **Step 3: Écrire `overlay/route.ts` (calqué sur `clip/route.ts`)**

```ts
import { readFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { getStore } from "@/lib/observability/db";
import { checkDebugKey, unauthorized } from "@/lib/observability/auth";

export const runtime = "nodejs";
const mediaRoot = (): string => process.env.VALK_MEDIA_DIR || "data/media";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkDebugKey(request)) return unauthorized();
  const { id } = await params;
  const cap = getStore().getCapture(id);
  if (!cap) return Response.json({ error: "not found" }, { status: 404 });
  const path = resolve(join(dirname(cap.clipPath), "overlay.mp4"));
  const root = resolve(mediaRoot());
  if (path !== root && !path.startsWith(root + "/")) {
    return Response.json({ error: "hors périmètre" }, { status: 403 });
  }
  let buf: Buffer;
  try {
    buf = readFileSync(path);
  } catch {
    return Response.json({ error: "overlay absent" }, { status: 404 });
  }
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": "video/mp4", "cache-control": "no-store" },
  });
}
```

- [ ] **Step 4: Vérifier l'overlay sur le clip réel + build**

Run:
```bash
DIR=$(ls -d data/media/proto-*/ | head -1)
tools/vision/.venv/bin/python tools/vision/draw_overlay.py "${DIR}clip.mov" <(echo '{"points":[{"t":1.0,"stimulusX":0.5}]}') "${DIR}overlay.mp4" 2>/dev/null
ffprobe -v error -show_entries format=duration -of csv=p=0 "${DIR}overlay.mp4" && echo "overlay OK"
npm run build -w @valk/web
```
Expected: durée affichée + `overlay OK` ; build OK.

- [ ] **Step 5: Commit**

```bash
git add tools/vision/draw_overlay.py "apps/web/src/app/api/captures/[id]/overlay" "apps/web/src/app/api/captures/[id]/analyze/route.ts"
git commit -m "feat(vision/api): overlay vidéo (draw_overlay.py + GET overlay + génération dans analyze)"
```

---

### Task 8: `/debug` — bouton Analyser + courbes SVG + lien overlay

**Files:**
- Create: `apps/web/src/app/debug/AnalyzeButton.tsx`
- Create: `apps/web/src/app/debug/GazeChart.tsx`
- Modify: `apps/web/src/app/debug/page.tsx`

**Interfaces:**
- Consumes: `CaptureSummary.analysis` (`GazeSignal | null`).

- [ ] **Step 1: Écrire `AnalyzeButton.tsx` (client)**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AnalyzeButton({ id, keyParam }: { id: string; keyParam: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch(`/api/captures/${encodeURIComponent(id)}/analyze?key=${keyParam}`, { method: "POST" });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="rounded-lg bg-violet-500/20 px-3 py-1 text-xs font-semibold text-violet-200 ring-1 ring-violet-500/30 hover:bg-violet-500/30 disabled:opacity-50"
    >
      {busy ? "Analyse…" : "Analyser"}
    </button>
  );
}
```

- [ ] **Step 2: Écrire `GazeChart.tsx` (SVG serveur)**

```tsx
import type { GazeSignal } from "@/lib/analysis/gaze";

export function GazeChart({ signal }: { signal: GazeSignal }) {
  const { points } = signal;
  if (!points.length) return <p className="text-xs text-zinc-500">Aucun point.</p>;
  const W = 320, H = 120, pad = 4;
  const t0 = points[0].t, t1 = points[points.length - 1].t || t0 + 1;
  const xs = (t: number) => pad + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * pad);
  const ys = (v: number) => pad + (1 - Math.max(0, Math.min(1, v))) * (H - 2 * pad);
  const line = (key: "stimulusX" | "gazeX") =>
    points.map((p, i) => `${i ? "L" : "M"}${xs(p.t).toFixed(1)},${ys(p[key]).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-black/30 ring-1 ring-white/10">
      <path d={line("stimulusX")} fill="none" stroke="#a78bfa" strokeWidth="1.5" />
      <path d={line("gazeX")} fill="none" stroke="#2dd4bf" strokeWidth="1.5" />
    </svg>
  );
}
```

- [ ] **Step 3: Câbler dans `page.tsx` (carte capture)**

Importer `AnalyzeButton`, `GazeChart` et `type GazeSignal`. Dans la carte capture (après le lien `▶ clip`), ajouter :

```tsx
<div className="mt-2 flex items-center gap-3">
  <AnalyzeButton id={c.id} keyParam={keyParam} />
  {c.analysis && (
    <span className="text-xs text-zinc-400">
      sync {c.analysis.status} · r={c.analysis.r.toFixed(2)} · visage {c.analysis.facePct.toFixed(0)}%
      {c.analysis.signFlipped ? " · signe auto-aligné" : ""}
    </span>
  )}
</div>
{c.analysis && c.analysis.points.length > 0 && (
  <div className="mt-2">
    <GazeChart signal={c.analysis} />
    <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-500">
      <span><span style={{ color: "#a78bfa" }}>■</span> stimulus</span>
      <span><span style={{ color: "#2dd4bf" }}>■</span> regard</span>
      <a className="text-violet-300 hover:underline" href={`/api/captures/${encodeURIComponent(c.id)}/overlay?key=${keyParam}`}>▶ overlay</a>
    </div>
  </div>
)}
```

- [ ] **Step 4: Build web**

Run: `npm run build -w @valk/web`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/debug
git commit -m "feat(debug): bouton Analyser + courbes SVG regard/stimulus + lien overlay"
```

---

### Task 9: Validation end-to-end réelle

**Files:** (aucun — vérification)

- [ ] **Step 1: Suite web complète**

Run: `npm test -w @valk/web`
Expected: tous verts (dont gaze, analyze, db).

- [ ] **Step 2: Pipeline complet sur le serveur local**

Lancer le serveur (`VALK_DEBUG_KEY=valknight VALK_DB_PATH=data/valk.sqlite VALK_MEDIA_DIR=data/media npm run start -w @valk/web -- -p 3939`). Puis :
```bash
ID=$(ls data/media/proto-*/ -d | head -1 | xargs basename)
curl -s -X POST -H "x-valk-debug-key: valknight" "http://localhost:3939/api/captures/$ID/analyze" | cat
```
Expected: `{"ok":true,"status":"ok","r":0.6–0.8,"facePct":~100,"signFlipped":true}`.

- [ ] **Step 3: Vérifier l'overlay servi**

Run: `curl -s -o /dev/null -w "%{http_code} %{size_download}\n" -H "x-valk-debug-key: valknight" "http://localhost:3939/api/captures/$ID/overlay"`
Expected: `200` + taille > 0.

- [ ] **Step 4: Visuel `/debug`**

Ouvrir `/debug?key=valknight`, cliquer « Analyser » sur une capture, vérifier : courbes regard/stimulus qui se suivent, `r` affiché, lien overlay lisant la vidéo annotée. (Présenter une capture d'écran à l'utilisateur.)

- [ ] **Step 5: Commit final + merge**

```bash
git add -A && git commit -m "test(B1): validation e2e oculométrie sur clip réel" || true
git checkout main && git merge --ff-only feat/valk-B1-oculometrie
```

---

## Self-Review

**Couverture du spec :**
- Extraction Python (Tasks API, gazeH iris-relatif-au-visage) → Task 2. ✓
- Alignement (time-map inverse + `pursuitX`) + lissage + signe + `r` → Task 3 (`buildSignal`). ✓
- Subprocess Node → Task 4. ✓
- Stockage (`analysis`) → Task 5. ✓
- Endpoint analyze (gaté, découplé, sync_unverified non bloquant) → Task 6. ✓
- Overlay (draw_overlay + GET + containment) → Task 7. ✓
- `/debug` (bouton + courbes SVG + lien overlay) → Task 8. ✓
- Tests : math synthétique (T3), contrat sans visage (T2), extraction clip réel (T6), overlay (T7), e2e (T9). ✓
- Erreurs : venv absent → execFile rejette → 500 « analyse échouée » (T6) ; visage<60% → `gaze_unreliable` (T3) ; time-map non vérifié → `sync_unverified` non bloquant (T3/T6) ; overlay best-effort (T7). ✓
- Sécurité : `execFile`, endpoints gatés, containment overlay (T6/T7). ✓

**Cohérence des types :** `Extraction`/`GazeFrame`/`GazeSignal`/`GazePoint` définis en T3, consommés en T4/T5/T6/T8 sous les mêmes noms. `TimeMap` (champs `a,b,anchors,status`) repris de `flash-detect`. `setCaptureAnalysis(id, GazeSignal)` cohérent T5↔T6.

**Placeholders :** aucun (code complet par étape). Réserve explicite : T6 Step 2 prévoit le seed de la capture si absente de la base de test — instruction actionnable, pas un TODO vague.
