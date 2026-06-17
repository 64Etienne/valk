import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  triggerOpenEyesSignal,
  __resetSignalForTests,
} from "@/lib/audio/signal";

beforeEach(() => {
  __resetSignalForTests();
  vi.stubGlobal("speechSynthesis", { speak: vi.fn(), cancel: vi.fn() });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    vi.fn().mockImplementation((text) => ({ text, lang: "", rate: 1, volume: 1 }))
  );
  Object.assign(navigator, { vibrate: vi.fn(() => true) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("signal.triggerOpenEyesSignal", () => {
  it("fires speech synthesis with a French 'ouvrez' phrase", () => {
    triggerOpenEyesSignal();
    expect(speechSynthesis.speak).toHaveBeenCalledOnce();
    const utterance = (speechSynthesis.speak as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(utterance.text).toMatch(/ouvrez/i);
    expect(utterance.lang).toBe("fr-FR");
  });

  it("fires vibration pattern (array of numbers)", () => {
    triggerOpenEyesSignal();
    expect(navigator.vibrate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(Number)])
    );
  });

  it("is idempotent if triggered twice within 500ms", () => {
    triggerOpenEyesSignal();
    triggerOpenEyesSignal();
    expect(speechSynthesis.speak).toHaveBeenCalledTimes(1);
  });
});
