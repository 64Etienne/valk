let audioCtx: AudioContext | null = null;

function getContext(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    audioCtx = new AudioCtxClass();
  }
  return audioCtx;
}

/**
 * Call during a user gesture (button click) to unlock audio on iOS/Android.
 * Plays a silent buffer to activate the audio session, bypassing silent mode.
 */
export function unlockAudio(): void {
  try {
    const ctx = getContext();
    if (ctx.state === "suspended") ctx.resume();
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // Audio not available
  }
}

/**
 * Play a beep tone. Call unlockAudio() first during a user gesture.
 */
export function playBeep(
  frequency: number = 880,
  durationMs: number = 100,
  gain: number = 0.3
): void {
  try {
    const ctx = getContext();
    if (ctx.state === "suspended") ctx.resume();

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.frequency.value = frequency;
    gainNode.gain.value = gain;
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch {
    // Audio not available
  }
}

/**
 * Trigger device vibration (Android — iOS Safari doesn't support it).
 */
export function vibrate(pattern: number | number[]): void {
  try {
    navigator?.vibrate?.(pattern);
  } catch {
    // Vibration not available
  }
}
