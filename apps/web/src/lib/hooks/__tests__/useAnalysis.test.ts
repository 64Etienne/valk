import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAnalysis } from "@/lib/hooks/useAnalysis";

const baseCategory = {
  score: 0,
  confidence: "low" as const,
  confidenceExplanation: "x",
  label: "x",
  observations: [],
  scientificBasis: "x",
  limitations: [],
  alternativeExplanations: [],
};

const validResult = {
  summary: "ok",
  categories: {
    alcohol: baseCategory,
    fatigue: baseCategory,
    substances: baseCategory,
  },
  dataQuality: { overallQuality: "good" as const, issues: [] },
};

const mockPayload = {} as Parameters<
  ReturnType<typeof useAnalysis>["analyze"]
>[0];

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useAnalysis", () => {
  it("returns a validated result on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => validResult,
      })
    );
    const { result } = renderHook(() => useAnalysis());
    let returned: unknown = null;
    await act(async () => {
      returned = await result.current.analyze(mockPayload);
    });
    expect(returned).toEqual(validResult);
    expect(result.current.error).toBeNull();
  });

  it("rejects malformed responses with a clear error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ summary: "x" }),
      })
    );
    const { result } = renderHook(() => useAnalysis());
    let returned: unknown = "not set";
    await act(async () => {
      returned = await result.current.analyze(mockPayload);
    });
    expect(returned).toBeNull();
    expect(result.current.error).toMatch(/malformée/i);
  });

  it("aborts and sets a timeout error when fetch exceeds 120s", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url, init) =>
          new Promise((_, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          })
      )
    );
    const { result } = renderHook(() => useAnalysis());
    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.analyze(mockPayload);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_001);
      await promise;
    });
    expect(result.current.error).toMatch(/dépassé|timeout|délai/i);
  });

  it("surfaces server error with status when response.ok=false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ error: "Réponse IA malformée. Réessayez." }),
      })
    );
    const { result } = renderHook(() => useAnalysis());
    await act(async () => {
      await result.current.analyze(mockPayload);
    });
    expect(result.current.error).toContain("malformée");
  });
});
