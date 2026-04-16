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
    console.warn(
      `sessionStorage.setItem(${key}) failed, using in-memory fallback:`,
      err
    );
  }
}

function safeGetItem(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch (err) {
    console.warn(
      `sessionStorage.getItem(${key}) failed, using in-memory fallback:`,
      err
    );
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

export function saveResult(
  result: AnalysisResult,
  payload: AnalysisPayload
): void {
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
