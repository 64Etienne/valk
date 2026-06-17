import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  saveResult,
  loadResult,
  clearResult,
  loadPayload,
} from "@/lib/storage/session-result";
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
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("QuotaExceededError", "QuotaExceededError");
      });
    saveResult(makeResult(), makePayload());
    spy.mockRestore();
    expect(sessionStorage.getItem("valk-result")).toBeNull();
    expect(loadResult()?.summary).toBe("résumé test");
  });

  it("returns memory fallback when getItem throws (iOS Private)", () => {
    saveResult(makeResult(), makePayload());
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
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
