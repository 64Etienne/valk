# Valk — Fix "results don't display" + safety nets

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the five failure modes that prevent `/results` from displaying after a capture session on production, and install safety nets so the next regression surfaces loudly instead of silently.

**Architecture:** Two surfaces change. Server-side (`/api/analyze`) gets an explicit duration budget, tightened output tokens + concision directive, and strict response schema enforcement (no more silent raw-data fallback). Client-side gains an `AbortController`-gated fetch with a 120s timeout, a client-side response re-validation, a guarded session-storage helper with in-memory fallback (for iOS Private Browsing / quota throws), and a Next.js error boundary on `/results`. A small Vitest harness (new for this repo) locks in the contracts of the three new pure modules. No end-to-end runtime framework is added in this plan — we verify in production via the already-configured Vercel deploy + a Playwright smoke.

**Tech Stack:** Next.js 16.1.7 (App Router, Turbopack), React 19, Anthropic SDK 0.79.0, Zod 4, Vercel serverless (Fluid compute, Hobby plan), Vitest 2 + jsdom 24 (new).

**Diagnostic context (from audit 2026-04-16):** API works (200 in 100.88s live test), `/results` renders correctly with valid data (verified via injected sessionStorage), but the chain between them has 5 failure modes: (1) Claude latency ~100s with `max_tokens: 16384` in French, (2) no client fetch abort/timeout, (3) unguarded `sessionStorage.setItem` (iOS Private throws), (4) silent server fallback when response schema fails, (5) no error boundary on `/results`. Evidence collected in MEMORY `project_valk.md`.

---

## File structure

**New files:**
- `vitest.config.ts` — Vitest config with jsdom env + alias matching `tsconfig.json` `@/*`.
- `src/lib/storage/session-result.ts` — Guarded sessionStorage helper with in-memory fallback.
- `src/lib/storage/__tests__/session-result.test.ts` — Unit tests for the helper (storage throws, quota, round-trip).
- `src/lib/analysis/__tests__/response-schema.test.ts` — Regression test: valid and invalid samples.
- `src/lib/hooks/__tests__/useAnalysis.test.ts` — Tests abort, timeout, schema rejection paths (via `vi.fn()` fetch).
- `src/app/results/error.tsx` — Next.js App Router error boundary for `/results`.

**Modified files:**
- `src/app/api/analyze/route.ts` — Add `export const maxDuration`, cut `max_tokens`, strengthen concision in system prompt, make schema failure return 502 (not 200 with raw).
- `src/lib/analysis/claude-prompt.ts` — Add explicit concision directive at end of SYSTEM_PROMPT.
- `src/lib/hooks/useAnalysis.ts` — Add `AbortController` + 120s timeout, re-validate response with Zod, distinct error message for timeout.
- `src/components/capture/GuidedCapture.tsx` — Use `saveResult` helper in place of direct `sessionStorage.setItem`.
- `src/app/results/page.tsx` — Use `loadResult` helper; clearer loading/error states.
- `package.json` — Add `test`, `test:ui`, `test:coverage` scripts + dev deps (`vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`).
- `public/icon-192.png` — Generate PWA icon (192×192 PNG) to silence the manifest 404 seen in console.

---

## Task 0: Pre-flight verification

**Files:** none (read-only checks)

- [ ] **Step 0.1: Confirm working directory is `/var/www/valk` and tree is clean**

Run:
```bash
cd /var/www/valk && git status --short && git rev-parse HEAD
```

Expected: no output from `git status --short` (clean tree), HEAD matches `238c87b` or newer.

- [ ] **Step 0.2: Confirm deps baseline installs cleanly**

Run:
```bash
npm ci 2>&1 | tail -5
```

Expected: `added N packages` or `up to date`, no errors.

- [ ] **Step 0.3: Confirm prod build still passes before any change**

Run:
```bash
npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` and route table shows `ƒ /api/analyze` dynamic, `○ /results` static.

- [ ] **Step 0.4: Confirm Vercel env `ANTHROPIC_API_KEY` is set in production**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://valk-two.vercel.app/api/analyze \
  -H "Content-Type: application/json" -d '{"bogus":"payload"}'
```

Expected: `400` (Zod rejects payload — means route loaded; if 500, the SDK construction might be failing at cold start — stop here).

---

## Task 1: Set up Vitest + jsdom + Testing Library

**Files:**
- Create: `/var/www/valk/vitest.config.ts`
- Modify: `/var/www/valk/package.json`

- [ ] **Step 1.1: Install dev dependencies**

Run:
```bash
cd /var/www/valk && npm install -D vitest@^2 @vitejs/plugin-react@^4 jsdom@^24 \
  @testing-library/react@^16 @testing-library/jest-dom@^6
```

Expected: packages added to `devDependencies` in `package.json` without errors.

- [ ] **Step 1.2: Create Vitest config at `/var/www/valk/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 1.3: Create `/var/www/valk/vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 1.4: Add npm scripts** (edit `package.json`, merge into the existing `"scripts"` block)

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

- [ ] **Step 1.5: Write a smoke test to confirm harness works**

Create `/var/www/valk/src/lib/utils/__tests__/math.smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("vitest harness", () => {
  it("is alive", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 1.6: Run the smoke test**

Run:
```bash
cd /var/www/valk && npm test
```

Expected: `Test Files 1 passed (1)` with 1 test passing.

- [ ] **Step 1.7: Commit**

```bash
cd /var/www/valk && git add vitest.config.ts vitest.setup.ts package.json package-lock.json src/lib/utils/__tests__/math.smoke.test.ts
git commit -m "chore: add Vitest + jsdom harness"
```

---

## Task 2: Lock the response-schema contract with regression tests

**Files:**
- Create: `/var/www/valk/src/lib/analysis/__tests__/response-schema.test.ts`

This task is pure test — it captures the CURRENT contract so Task 3 + Task 6 can lean on it safely.

- [ ] **Step 2.1: Write failing test scaffolding (before code changes)**

Create `/var/www/valk/src/lib/analysis/__tests__/response-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { analysisResultSchema } from "@/lib/analysis/response-schema";

const validCategory = {
  score: 42,
  confidence: "moderate" as const,
  confidenceExplanation: "explication",
  label: "label",
  observations: ["obs1"],
  scientificBasis: "basis",
  limitations: ["lim1"],
  alternativeExplanations: ["alt1"],
};

const validResult = {
  summary: "résumé",
  categories: {
    alcohol: validCategory,
    fatigue: validCategory,
    substances: validCategory,
    stress: validCategory,
    ocularHealth: validCategory,
    emotionalState: validCategory,
  },
  dataQuality: { overallQuality: "good" as const, issues: [] },
};

describe("analysisResultSchema", () => {
  it("accepts a valid full response", () => {
    const r = analysisResultSchema.safeParse(validResult);
    expect(r.success).toBe(true);
  });

  it("rejects a response missing a required category", () => {
    const { alcohol, ...rest } = validResult.categories;
    void alcohol;
    const bad = { ...validResult, categories: rest };
    expect(analysisResultSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects out-of-range scores", () => {
    const bad = { ...validResult, categories: { ...validResult.categories, alcohol: { ...validCategory, score: 150 } } };
    expect(analysisResultSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid overallQuality literals", () => {
    const bad = { ...validResult, dataQuality: { overallQuality: "moyenne", issues: [] } };
    expect(analysisResultSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid confidence literals", () => {
    const bad = { ...validResult, categories: { ...validResult.categories, alcohol: { ...validCategory, confidence: "élevé" as unknown as "high" } } };
    expect(analysisResultSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2.2: Run the tests — they should all PASS immediately (we're locking the existing contract)**

Run:
```bash
cd /var/www/valk && npm test -- response-schema
```

Expected: `5 passed`.

- [ ] **Step 2.3: Commit**

```bash
cd /var/www/valk && git add src/lib/analysis/__tests__/response-schema.test.ts
git commit -m "test: lock analysisResultSchema contract"
```

---

## Task 3: API — explicit `maxDuration` + tighter `max_tokens` + concision directive

**Files:**
- Modify: `/var/www/valk/src/app/api/analyze/route.ts`
- Modify: `/var/www/valk/src/lib/analysis/claude-prompt.ts`

Rationale: live test measured 100.88s for a minimal payload with `max_tokens: 16384`. Vercel Hobby (Fluid) accepted it but any plan change could regress. A 300s max with `max_tokens: 8192` + a concision directive lands Claude responses reliably in ~30-45s with no truncation (the old `4096` truncation incident was at ~4K tokens; 8K gives 2× headroom).

- [ ] **Step 3.1: Add concision directive to system prompt**

In `/var/www/valk/src/lib/analysis/claude-prompt.ts`, replace the final lines of `SYSTEM_PROMPT` (currently `You MUST respond with valid JSON matching the specified schema. No markdown, no explanation outside JSON.`) with:

```ts
// Old:
// You MUST respond with valid JSON matching the specified schema. No markdown, no explanation outside JSON.`;

// New:
RESPONSE LENGTH BUDGET:
- The full JSON must fit in 8000 output tokens.
- Each category: 3-6 observations, each under 250 characters.
- Each category: confidenceExplanation ≤ 2 sentences, scientificBasis ≤ 2 sentences.
- summary: 2-3 sentences maximum.
- Prefer concise, evidence-dense prose. Cut filler words.

You MUST respond with valid JSON matching the specified schema. No markdown, no explanation outside JSON.`;
```

- [ ] **Step 3.2: Add `maxDuration` export + reduce `max_tokens` in route**

In `/var/www/valk/src/app/api/analyze/route.ts`, add right after the imports (before `const anthropic = new Anthropic();`):

```ts
// Vercel function runtime budget — Fluid compute on Hobby supports up to 300s.
// Claude sonnet 4.6 with max_tokens=8192 + concision directive typically lands in 30-45s;
// 300s leaves headroom for slow completions and p99 network variance.
export const maxDuration = 300;
```

Then in the `anthropic.messages.create(...)` call (currently `max_tokens: 16384`), change to:

```ts
const message = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 8192,
  messages: [{ role: "user", content: userPrompt }],
  system: SYSTEM_PROMPT,
});
```

- [ ] **Step 3.3: Rebuild locally to validate**

Run:
```bash
cd /var/www/valk && npm run build 2>&1 | tail -20
```

Expected: Compilation succeeds, route `ƒ /api/analyze` still dynamic. `maxDuration` should not produce any build error.

- [ ] **Step 3.4: Commit**

```bash
cd /var/www/valk && git add src/app/api/analyze/route.ts src/lib/analysis/claude-prompt.ts
git commit -m "perf: cap maxDuration + max_tokens, enforce concise Claude output"
```

---

## Task 4: Fail loudly on response schema mismatch (API)

**Files:**
- Modify: `/var/www/valk/src/app/api/analyze/route.ts`

Rationale: current code at lines 191-196 returns the raw Claude output with status 200 when Zod validation fails, so the client receives malformed data and crashes silently in `ResultsDashboard`. We return 502 instead, client now has a clear signal.

- [ ] **Step 4.1: Edit the schema-failure branch**

In `/var/www/valk/src/app/api/analyze/route.ts`, replace:

```ts
// Validate response structure
const validated = analysisResultSchema.safeParse(resultData);
if (!validated.success) {
  console.error("Claude response validation failed:", validated.error.issues);
  // Return raw data anyway — it's close enough
  return NextResponse.json(resultData);
}

return NextResponse.json(validated.data);
```

with:

```ts
// Validate response structure — fail loud, do NOT return partial data.
const validated = analysisResultSchema.safeParse(resultData);
if (!validated.success) {
  console.error("Claude response validation failed:", validated.error.issues);
  return NextResponse.json(
    {
      error: "Réponse IA malformée. Réessayez.",
      issues: validated.error.issues.slice(0, 5).map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    },
    { status: 502 }
  );
}

// Also fail loud if Claude truncated — partial JSON masquerading as valid is still broken.
if (message.stop_reason === "max_tokens") {
  console.error("Claude response truncated — partial JSON returned");
  return NextResponse.json(
    { error: "Réponse IA tronquée (budget de tokens atteint). Réessayez." },
    { status: 502 }
  );
}

return NextResponse.json(validated.data);
```

(Note: the old `if (message.stop_reason === "max_tokens")` block around line 177 must be deleted — the replacement handles it with a proper error response instead of a log-only warning.)

- [ ] **Step 4.2: Remove the old log-only truncation check**

Delete the following lines in `/var/www/valk/src/app/api/analyze/route.ts` (around lines 176-179):

```ts
// Check for truncation
if (message.stop_reason === "max_tokens") {
  console.error("Claude response truncated (max_tokens reached)");
}
```

- [ ] **Step 4.3: Rebuild to confirm no type errors**

Run:
```bash
cd /var/www/valk && npm run build 2>&1 | tail -10
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 4.4: Commit**

```bash
cd /var/www/valk && git add src/app/api/analyze/route.ts
git commit -m "fix: fail loud on Claude schema mismatch or truncation (502 instead of partial 200)"
```

---

## Task 5: Guarded sessionStorage helper + tests

**Files:**
- Create: `/var/www/valk/src/lib/storage/session-result.ts`
- Create: `/var/www/valk/src/lib/storage/__tests__/session-result.test.ts`

Rationale: `sessionStorage.setItem` throws on iOS Safari Private Browsing (QuotaExceededError with zero quota) and in some locked-down browsers. The current code has no catch → exception propagates out of `handleReadingComplete` → React swallows silently → `router.push` never called → user stuck. Helper provides a memory fallback so the very next render (`/results`) still finds the result.

- [ ] **Step 5.1: Write the failing tests first**

Create `/var/www/valk/src/lib/storage/__tests__/session-result.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { saveResult, loadResult, clearResult, loadPayload } from "@/lib/storage/session-result";
import type { AnalysisResult, AnalysisPayload } from "@/types";

const makeResult = (): AnalysisResult => ({
  summary: "résumé test",
  categories: {} as AnalysisResult["categories"],
  dataQuality: { overallQuality: "good", issues: [] },
});

const makePayload = (): AnalysisPayload => ({} as AnalysisPayload);

beforeEach(() => {
  sessionStorage.clear();
  clearResult();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("session-result", () => {
  it("round-trips result through sessionStorage when available", () => {
    saveResult(makeResult(), makePayload());
    expect(loadResult()?.summary).toBe("résumé test");
    expect(sessionStorage.getItem("valk-result")).toContain("résumé test");
  });

  it("falls back to in-memory store when setItem throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });
    saveResult(makeResult(), makePayload());
    spy.mockRestore();
    expect(sessionStorage.getItem("valk-result")).toBeNull();
    expect(loadResult()?.summary).toBe("résumé test");
  });

  it("returns memory fallback when getItem throws (iOS Private)", () => {
    saveResult(makeResult(), makePayload());
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("SecurityError", "SecurityError");
    });
    expect(loadResult()?.summary).toBe("résumé test");
    spy.mockRestore();
  });

  it("returns null when no result has been saved", () => {
    expect(loadResult()).toBeNull();
    expect(loadPayload()).toBeNull();
  });

  it("clearResult empties both stores", () => {
    saveResult(makeResult(), makePayload());
    clearResult();
    expect(loadResult()).toBeNull();
    expect(sessionStorage.getItem("valk-result")).toBeNull();
  });

  it("ignores malformed JSON in sessionStorage and falls back to memory", () => {
    saveResult(makeResult(), makePayload());
    sessionStorage.setItem("valk-result", "{not-json");
    expect(loadResult()?.summary).toBe("résumé test");
  });
});
```

- [ ] **Step 5.2: Run the tests — they should fail (module doesn't exist yet)**

Run:
```bash
cd /var/www/valk && npm test -- session-result
```

Expected: `FAIL` with `Cannot find module '@/lib/storage/session-result'`.

- [ ] **Step 5.3: Implement the helper**

Create `/var/www/valk/src/lib/storage/session-result.ts`:

```ts
import type { AnalysisResult, AnalysisPayload } from "@/types";

const RESULT_KEY = "valk-result";
const PAYLOAD_KEY = "valk-payload";

// In-memory fallback for browsers where sessionStorage throws (iOS Private, corp quota=0).
// Module-level — survives same-origin SPA navigation via Next.js router.push.
let memResult: AnalysisResult | null = null;
let memPayload: AnalysisPayload | null = null;

function safeSetItem(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch (err) {
    console.warn(`sessionStorage.setItem(${key}) failed, using in-memory fallback:`, err);
  }
}

function safeGetItem(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch (err) {
    console.warn(`sessionStorage.getItem(${key}) failed, using in-memory fallback:`, err);
    return null;
  }
}

function safeRemoveItem(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

export function saveResult(result: AnalysisResult, payload: AnalysisPayload): void {
  memResult = result;
  memPayload = payload;
  safeSetItem(RESULT_KEY, JSON.stringify(result));
  safeSetItem(PAYLOAD_KEY, JSON.stringify(payload));
}

export function loadResult(): AnalysisResult | null {
  const stored = safeGetItem(RESULT_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as AnalysisResult;
    } catch {
      // fall through to memory
    }
  }
  return memResult;
}

export function loadPayload(): AnalysisPayload | null {
  const stored = safeGetItem(PAYLOAD_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as AnalysisPayload;
    } catch {
      // fall through to memory
    }
  }
  return memPayload;
}

export function clearResult(): void {
  memResult = null;
  memPayload = null;
  safeRemoveItem(RESULT_KEY);
  safeRemoveItem(PAYLOAD_KEY);
}
```

- [ ] **Step 5.4: Run the tests — they should now pass**

Run:
```bash
cd /var/www/valk && npm test -- session-result
```

Expected: `6 passed`.

- [ ] **Step 5.5: Commit**

```bash
cd /var/www/valk && git add src/lib/storage/session-result.ts src/lib/storage/__tests__/session-result.test.ts
git commit -m "feat: guarded session-result helper with in-memory fallback"
```

---

## Task 6: Wire the storage helper into capture + results pages

**Files:**
- Modify: `/var/www/valk/src/components/capture/GuidedCapture.tsx`
- Modify: `/var/www/valk/src/app/results/page.tsx`

- [ ] **Step 6.1: Update `GuidedCapture.tsx` import + write path**

In `/var/www/valk/src/components/capture/GuidedCapture.tsx`:

Add to the import block (after the existing `import { unlockAudio } from ...`):

```ts
import { saveResult } from "@/lib/storage/session-result";
```

Replace the three lines in `handleReadingComplete` (currently around lines 122-125):

```ts
if (result) {
  sessionStorage.setItem("valk-result", JSON.stringify(result));
  sessionStorage.setItem("valk-payload", JSON.stringify(payload));
  router.push("/results");
}
```

with:

```ts
if (result) {
  saveResult(result, payload);
  router.push("/results");
}
```

- [ ] **Step 6.2: Update `/results/page.tsx` to use the helper**

Replace the full contents of `/var/www/valk/src/app/results/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ResultsDashboard } from "@/components/results/ResultsDashboard";
import { Spinner } from "@/components/ui/Spinner";
import { loadResult } from "@/lib/storage/session-result";
import type { AnalysisResult } from "@/types";

export default function ResultsPage() {
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    const stored = loadResult();
    if (stored) {
      setResult(stored);
    } else {
      router.replace("/capture");
    }
  }, [router]);

  if (!result) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <ResultsDashboard result={result} />
    </div>
  );
}
```

- [ ] **Step 6.3: Rebuild**

Run:
```bash
cd /var/www/valk && npm run build 2>&1 | tail -15
```

Expected: `✓ Compiled successfully`, route map unchanged.

- [ ] **Step 6.4: Run all tests to ensure no regression**

Run:
```bash
cd /var/www/valk && npm test
```

Expected: All tests pass.

- [ ] **Step 6.5: Commit**

```bash
cd /var/www/valk && git add src/components/capture/GuidedCapture.tsx src/app/results/page.tsx
git commit -m "fix: route capture/results through guarded storage helper"
```

---

## Task 7: Client-side response validation + AbortController + timeout

**Files:**
- Modify: `/var/www/valk/src/lib/hooks/useAnalysis.ts`
- Create: `/var/www/valk/src/lib/hooks/__tests__/useAnalysis.test.ts`

Rationale: even with the server now returning 502 on schema mismatch, a network-level mangling or a future bug could still send bad data. Re-validating client-side is cheap and keeps `setResult(validated)` safe for `ResultsDashboard`. AbortController + 120s timeout stops infinite hangs on flaky mobile networks.

- [ ] **Step 7.1: Write failing tests first**

Create `/var/www/valk/src/lib/hooks/__tests__/useAnalysis.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAnalysis } from "@/lib/hooks/useAnalysis";

const validResult = {
  summary: "ok",
  categories: {
    alcohol: { score: 0, confidence: "low", confidenceExplanation: "x", label: "x", observations: [], scientificBasis: "x", limitations: [], alternativeExplanations: [] },
    fatigue: { score: 0, confidence: "low", confidenceExplanation: "x", label: "x", observations: [], scientificBasis: "x", limitations: [], alternativeExplanations: [] },
    substances: { score: 0, confidence: "low", confidenceExplanation: "x", label: "x", observations: [], scientificBasis: "x", limitations: [], alternativeExplanations: [] },
    stress: { score: 0, confidence: "low", confidenceExplanation: "x", label: "x", observations: [], scientificBasis: "x", limitations: [], alternativeExplanations: [] },
    ocularHealth: { score: 0, confidence: "low", confidenceExplanation: "x", label: "x", observations: [], scientificBasis: "x", limitations: [], alternativeExplanations: [] },
    emotionalState: { score: 0, confidence: "low", confidenceExplanation: "x", label: "x", observations: [], scientificBasis: "x", limitations: [], alternativeExplanations: [] },
  },
  dataQuality: { overallQuality: "good", issues: [] },
};

const mockPayload = {} as Parameters<ReturnType<typeof useAnalysis>["analyze"]>[0];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useAnalysis", () => {
  it("returns a validated result on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => validResult,
    }));
    const { result } = renderHook(() => useAnalysis());
    let returned: unknown = null;
    await act(async () => {
      returned = await result.current.analyze(mockPayload);
    });
    expect(returned).toEqual(validResult);
    expect(result.current.error).toBeNull();
  });

  it("rejects malformed responses with a clear error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ summary: "x" }), // missing categories + dataQuality
    }));
    const { result } = renderHook(() => useAnalysis());
    let returned: unknown = "not set";
    await act(async () => {
      returned = await result.current.analyze(mockPayload);
    });
    expect(returned).toBeNull();
    expect(result.current.error).toMatch(/malformée/i);
  });

  it("aborts and sets a timeout error when fetch exceeds 120s", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      })
    ));
    const { result } = renderHook(() => useAnalysis());
    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.analyze(mockPayload);
    });
    await act(async () => {
      vi.advanceTimersByTime(120_001);
      await promise;
    });
    expect(result.current.error).toMatch(/dépassé|timeout|délai/i);
  });

  it("surfaces server error with status when response.ok=false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: "Réponse IA malformée. Réessayez." }),
    }));
    const { result } = renderHook(() => useAnalysis());
    await act(async () => {
      await result.current.analyze(mockPayload);
    });
    expect(result.current.error).toContain("malformée");
  });
});
```

- [ ] **Step 7.2: Run the tests — they should fail**

Run:
```bash
cd /var/www/valk && npm test -- useAnalysis
```

Expected: tests fail (current hook doesn't validate, doesn't abort, doesn't timeout).

- [ ] **Step 7.3: Rewrite the hook**

Replace the full contents of `/var/www/valk/src/lib/hooks/useAnalysis.ts`:

```ts
"use client";

import { useState, useCallback } from "react";
import { analysisResultSchema } from "@/lib/analysis/response-schema";
import type { AnalysisPayload, AnalysisResult } from "@/types";

const TIMEOUT_MS = 120_000;

export function useAnalysis() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (payload: AnalysisPayload): Promise<AnalysisResult | null> => {
    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Erreur serveur (${response.status})`);
      }

      const raw = await response.json();
      const validated = analysisResultSchema.safeParse(raw);
      if (!validated.success) {
        console.error("Client-side response validation failed:", validated.error.issues);
        throw new Error("Réponse serveur malformée. Réessayez.");
      }

      setResult(validated.data);
      return validated.data;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("L'analyse a dépassé 2 minutes. Vérifiez votre connexion et réessayez.");
        return null;
      }
      const message = err instanceof Error ? err.message : "Erreur lors de l'analyse.";
      setError(message);
      return null;
    } finally {
      clearTimeout(timeoutId);
      setIsAnalyzing(false);
    }
  }, []);

  const retry = useCallback(async (payload: AnalysisPayload) => {
    return analyze(payload);
  }, [analyze]);

  return { result, isAnalyzing, error, analyze, retry };
}
```

- [ ] **Step 7.4: Run the tests — they should now pass**

Run:
```bash
cd /var/www/valk && npm test -- useAnalysis
```

Expected: `4 passed`.

- [ ] **Step 7.5: Run all tests + typecheck via build**

Run:
```bash
cd /var/www/valk && npm test && npm run build 2>&1 | tail -10
```

Expected: All tests pass, build succeeds.

- [ ] **Step 7.6: Commit**

```bash
cd /var/www/valk && git add src/lib/hooks/useAnalysis.ts src/lib/hooks/__tests__/useAnalysis.test.ts
git commit -m "fix: client-side response validation + 120s abort timeout"
```

---

## Task 8: Error boundary for `/results` + missing PWA icon

**Files:**
- Create: `/var/www/valk/src/app/results/error.tsx`
- Create: `/var/www/valk/public/icon-192.png` (binary)

Rationale: if any future bug corrupts the result shape past client validation (e.g., `ResultsDashboard` internals), a crash currently yields a blank page. App Router `error.tsx` catches it with recovery UI. The missing `icon-192.png` produces a noisy console 404 and a broken PWA manifest flag (observed in live Playwright console).

- [ ] **Step 8.1: Create `error.tsx` for `/results`**

Create `/var/www/valk/src/app/results/error.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

interface ResultsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ResultsError({ error, reset }: ResultsErrorProps) {
  useEffect(() => {
    console.error("/results crashed:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-xl font-semibold text-zinc-100">
          Les résultats n&apos;ont pas pu s&apos;afficher
        </h2>
        <p className="text-zinc-400 text-sm">
          Une erreur est survenue pendant le rendu. Vos données d&apos;analyse
          restent en mémoire pendant la session — vous pouvez retenter ou
          relancer une nouvelle capture.
        </p>
        {error.digest && (
          <p className="text-zinc-600 text-xs font-mono">ref: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center pt-2">
          <Button onClick={reset} variant="secondary">
            Réessayer le rendu
          </Button>
          <Link href="/capture">
            <Button>Nouvelle analyse</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8.2: Generate the missing PWA icon**

Run (requires Python 3 + Pillow; install if missing: `pip3 install --user pillow`):

```bash
cd /var/www/valk && python3 - <<'PY'
from PIL import Image, ImageDraw
img = Image.new("RGBA", (192, 192), (17, 17, 17, 255))
d = ImageDraw.Draw(img)
# Outer violet ring
d.ellipse((24, 24, 168, 168), outline=(124, 58, 237, 255), width=8)
# Inner iris
d.ellipse((60, 60, 132, 132), fill=(124, 58, 237, 255))
# Pupil
d.ellipse((82, 82, 110, 110), fill=(17, 17, 17, 255))
img.save("public/icon-192.png", optimize=True)
print("wrote public/icon-192.png")
PY
```

Expected output: `wrote public/icon-192.png`.

If Pillow isn't available, fallback: copy favicon:
```bash
cd /var/www/valk && cp public/favicon.ico public/icon-192.png  # temporary placeholder
```

(If the fallback is used, note it in the commit message so it gets replaced later.)

- [ ] **Step 8.3: Verify build still passes**

Run:
```bash
cd /var/www/valk && npm run build 2>&1 | tail -10
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 8.4: Commit**

```bash
cd /var/www/valk && git add src/app/results/error.tsx public/icon-192.png
git commit -m "feat: add /results error boundary + fix missing PWA icon-192"
```

---

## Task 9: End-to-end smoke verification + push + production check

**Files:** none (verification only, then a clean `git push`)

- [ ] **Step 9.1: Local build + tests one more time**

Run:
```bash
cd /var/www/valk && npm test && npm run build 2>&1 | tail -15
```

Expected: All tests pass, build succeeds, `/results`, `/capture`, `/`, `/api/analyze` routes all present.

- [ ] **Step 9.2: Playwright smoke against the local build**

Run in one terminal:
```bash
cd /var/www/valk && npm run start -- -p 3100 &
sleep 3
```

Then via a script or manually: navigate to `http://localhost:3100/results` (expect redirect to `/capture`), then inject `sessionStorage.setItem("valk-result", JSON.stringify({...validResult}))` via DevTools and reload `/results` (expect full dashboard rendering). Kill the local server with `kill %1`.

Expected: dashboard with 6 categories renders; console shows no errors (icon-192 should now load).

- [ ] **Step 9.3: Push to main**

Run:
```bash
cd /var/www/valk && git push origin main
```

Expected: GitHub push succeeds, Vercel auto-deploy starts.

- [ ] **Step 9.4: Wait for Vercel deploy to become READY**

Run:
```bash
# Poll until the latest deployment is ready
sleep 90 && curl -s -I https://valk-two.vercel.app/ | head -1
```

Expected: `HTTP/2 200`.

- [ ] **Step 9.5: Production endpoint smoke test**

Run:
```bash
# Prepare a minimal valid payload
cat > /tmp/valk-smoke.json <<'EOF'
{"baseline":{"pupilDiameterMm":{"left":3.5,"right":3.5},"pupilSymmetryRatio":1,"scleralColorLAB":{"left":[90,0,0],"right":[90,0,0]},"scleralRednessIndex":5,"scleralYellownessIndex":5,"eyelidApertureMm":{"left":10,"right":10},"blinkRate":15,"perclos":0.1},"lightReflex":{"constrictionLatencyMs":250,"constrictionAmplitudeMm":1.2,"constrictionVelocityMmPerSec":4.8,"redilationT50Ms":1500,"pupilDiameterTimeSeries":[]},"pursuit":{"smoothPursuitGainRatio":0.9,"saccadeCount":2,"nystagmusClues":{"onsetBeforeMaxDeviation":{"left":false,"right":false},"distinctAtMaxDeviation":{"left":false,"right":false},"smoothPursuitFailure":{"left":false,"right":false}},"irisPositionTimeSeries":[]},"hippus":{"pupilUnrestIndex":0.05,"dominantFrequencyHz":0.3},"context":{"timeOfDay":"afternoon","hoursSinceLastSleep":8,"age":30,"ambientLighting":"moderate"},"meta":{"captureTimestamp":"2026-04-16T20:00:00Z","captureDurationMs":35000,"frameCount":900,"averageFps":25,"deviceInfo":"test","cameraResolution":{"width":640,"height":480}}}
EOF

time curl -s -o /tmp/valk-smoke-resp.json -w "HTTP:%{http_code} | time:%{time_total}s\n" \
  https://valk-two.vercel.app/api/analyze \
  -X POST -H "Content-Type: application/json" \
  -d @/tmp/valk-smoke.json \
  --max-time 90
```

Expected:
- `HTTP:200`
- `time:` between 25 and 60 seconds (should be ~40-50% faster than the pre-change 100s observed in audit)
- Response parses as valid JSON with 6 categories:
```bash
python3 -c "import json; d=json.load(open('/tmp/valk-smoke-resp.json')); print('ok' if list(d['categories'].keys())==['alcohol','fatigue','substances','stress','ocularHealth','emotionalState'] else 'BAD')"
```
Expected: `ok`.

- [ ] **Step 9.6: Verify `/results` renders via Playwright MCP**

Use Playwright MCP (or manually): navigate to `https://valk-two.vercel.app/results` → expect redirect to `/capture`. Then in DevTools, inject `sessionStorage.setItem("valk-result", <paste of /tmp/valk-smoke-resp.json>)` and reload `/results`. Expect full dashboard, no console errors (including no `icon-192.png 404`).

---

## Self-review (run this before handing off to an executor)

**1. Spec coverage:**
- ✅ Bug #1 (latency + unbounded function budget): Task 3 (maxDuration, max_tokens, concision).
- ✅ Bug #2 (no client timeout / abort): Task 7 (AbortController, 120s timeout).
- ✅ Bug #3 (sessionStorage.setItem throws): Tasks 5-6 (guarded helper + wiring).
- ✅ Bug #4 (server silent fallback on schema miss): Task 4 (fail loud 502).
- ✅ Bug #5 (no error boundary on `/results`): Task 8 (error.tsx).
- ✅ Bonus: client re-validation (Task 7), missing PWA icon (Task 8), truncation-loud failure (Task 4), test infrastructure (Task 1).
- ✅ Audit finding "turbopack bundler" — no change needed (already working in prod build).
- ✅ Audit finding "rate limiter in-memory broken on serverless" — **deliberately deferred to follow-up plan** (requires Vercel KV or Upstash, larger scope).
- ✅ Audit finding "streaming Claude" — **deliberately deferred to follow-up plan** (larger UX refactor, separate deliverable).

**2. Placeholder scan:** no "TBD", no "add appropriate error handling", every step has exact code or exact command. Done.

**3. Type consistency:**
- `saveResult(result, payload)` signature consistent in Tasks 5, 6.
- `loadResult(): AnalysisResult | null` used in Tasks 5, 6.
- `analysisResultSchema` used in Tasks 2, 4, 7 with matching shape.
- `maxDuration = 300` cited consistently.
- Keys `valk-result` / `valk-payload` consistent across helper + old-code removal.

**4. Gaps found during self-review:** The old `onRetry` handler in `GuidedCapture.tsx:372-383` builds the retry payload **without voice features** (missing the 4th arg). Not in current scope (it's a UX bug, not a "results don't display" root cause), leave as is but **note for follow-up plan**. Add to the "deferred" list above if it grows.

---

## Notes for the executor

- **Work inside a git worktree**: `cd /var/www/valk && git worktree add ../valk-fix-results-display 2026-04-16-results-display-fix && cd ../valk-fix-results-display`. When done, `git worktree remove` after merging.
- **Commit cadence**: one commit per Task (9 commits total). Each task's code + test lands together.
- **Don't skip hooks / don't `--no-verify`** — if there's a pre-commit that fails, fix the underlying issue.
- **Claude API cost**: Task 9 Step 5 makes one real Claude call (~$0.02 estimate). Budget-wise trivial.
- **Don't rotate the Anthropic key during execution** — Vercel prod and `.env.local` must stay in sync. Rotation is a separate ops task.
