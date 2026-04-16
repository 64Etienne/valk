import { DebugVideoRecorder, type DebugRecording } from "./media-recorder-wrapper";

export function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const debugParam = params.get("debug");
  if (!debugParam) return false;
  const expected = process.env.NEXT_PUBLIC_VALK_DEBUG_KEY;
  return !!expected && debugParam === expected;
}

export interface DebugBundle {
  sessionId: string;
  video: DebugRecording | null;
  landmarks: unknown;
  payload: unknown;
  result: unknown;
  timestamp: string;
  userAgent: string;
}

export function createDebugRecorder(): DebugVideoRecorder {
  return new DebugVideoRecorder();
}

export async function uploadDebugBundle(
  bundle: DebugBundle
): Promise<{ sessionId: string; ok: boolean }> {
  try {
    const form = new FormData();
    form.append("sessionId", bundle.sessionId);
    form.append(
      "metadata",
      new Blob(
        [
          JSON.stringify({
            landmarks: bundle.landmarks,
            payload: bundle.payload,
            result: bundle.result,
            timestamp: bundle.timestamp,
            userAgent: bundle.userAgent,
          }),
        ],
        { type: "application/json" }
      ),
      "metadata.json"
    );
    if (bundle.video) {
      form.append("video", bundle.video.videoBlob, "video.webm");
    }
    const key = process.env.NEXT_PUBLIC_VALK_DEBUG_KEY ?? "";
    const resp = await fetch(`/api/debug-upload?key=${encodeURIComponent(key)}`, {
      method: "POST",
      body: form,
    });
    return { sessionId: bundle.sessionId, ok: resp.ok };
  } catch (err) {
    console.warn("debug upload failed:", err);
    return { sessionId: bundle.sessionId, ok: false };
  }
}
