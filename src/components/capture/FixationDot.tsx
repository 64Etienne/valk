"use client";

/**
 * Phase_1 fixation target.
 *
 * Placed high on the screen on purpose — iPhone camera is at the TOP of the
 * device in portrait orientation, so a top-anchored stimulus keeps the user's
 * gaze roughly axis-aligned with the lens. Looking at a centre-screen point
 * forces the eyes to roll down ~20° which partially occludes the upper iris
 * under the eyelid, degrading EAR / pupil / blink detection. Keep this
 * synchronised with PursuitDot's vertical position so the gaze path during
 * baseline and pursuit sits in the same range.
 */
export function FixationDot() {
  return (
    <div className="absolute inset-x-0 top-0 z-10 pointer-events-none flex justify-center pt-[14vh]">
      <div className="relative">
        <div className="w-4 h-4 rounded-full bg-violet-500 shadow-lg shadow-violet-500/50" />
        <div className="absolute inset-0 w-4 h-4 rounded-full bg-violet-500 animate-ping opacity-30" />
      </div>
    </div>
  );
}
