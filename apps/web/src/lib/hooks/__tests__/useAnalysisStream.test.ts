import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAnalysisStream } from "@/lib/hooks/useAnalysisStream";
import { encodeSSE } from "@/lib/streaming/sse";

const makeReadableStream = (frames: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < frames.length) {
        controller.enqueue(encoder.encode(frames[i++]));
      } else {
        controller.close();
      }
    },
  });
};

const baseCategory = {
  score: 10,
  confidence: "low" as const,
  confidenceExplanation: "x",
  label: "x",
  observations: [],
  scientificBasis: "x",
  limitations: [],
  alternativeExplanations: [],
};

const validFinal = {
  summary: "ok",
  categories: {
    alcohol: baseCategory,
    fatigue: baseCategory,
    substances: baseCategory,
  },
  dataQuality: { overallQuality: "good" as const, issues: [] },
};

afterEach(() => vi.restoreAllMocks());

describe("useAnalysisStream", () => {
  it("accumulates partial then final", async () => {
    const frames = [
      encodeSSE("start", { ts: 1 }),
      encodeSSE("partial", {
        summary: "début",
        categories: { alcohol: baseCategory },
      }),
      encodeSSE("final", validFinal),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: makeReadableStream(frames),
      })
    );

    const { result } = renderHook(() => useAnalysisStream());
    await act(async () => {
      await result.current.analyze({} as never);
    });

    await waitFor(() => expect(result.current.phase).toBe("done"));
    expect(result.current.final).toEqual(validFinal);
  });

  it("surfaces server error events", async () => {
    const frames = [
      encodeSSE("start", { ts: 1 }),
      encodeSSE("error", { error: "Réponse IA malformée. Réessayez." }),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: makeReadableStream(frames),
      })
    );

    const { result } = renderHook(() => useAnalysisStream());
    await act(async () => {
      await result.current.analyze({} as never);
    });

    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(result.current.error).toContain("malformée");
  });
});
