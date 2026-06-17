import { playBeep, vibrate } from "./audio-context";

let lastFiredAt = 0;
const DEDUP_WINDOW_MS = 500;

/**
 * Trigger a multi-channel "open your eyes NOW" signal.
 * Intended to be called at the transition phase_2_close → phase_2_flash.
 * Channels:
 *   1. Beep (Web Audio) — muted by iOS silent switch
 *   2. Speech synthesis "ouvrez les yeux" — often survives iOS silent
 *   3. Vibration — Android only
 *   4. Visual flash is the caller's responsibility (white overlay)
 */
export function triggerOpenEyesSignal(): void {
  const now =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - lastFiredAt < DEDUP_WINDOW_MS) return;
  lastFiredAt = now;

  // 1. Loud audio beep
  playBeep(1400, 500, 1.0);

  // 2. Speech synthesis
  try {
    if (typeof speechSynthesis !== "undefined") {
      const utterance = new SpeechSynthesisUtterance("Ouvrez les yeux");
      utterance.lang = "fr-FR";
      utterance.rate = 1.2;
      utterance.volume = 1.0;
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    }
  } catch {
    /* noop */
  }

  // 3. Vibration (Android)
  vibrate([300, 100, 300, 100, 500]);
}

export function __resetSignalForTests(): void {
  lastFiredAt = 0;
}
