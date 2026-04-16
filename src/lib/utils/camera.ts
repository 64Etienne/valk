export interface CameraConstraints {
  width?: number;
  height?: number;
  facingMode?: "user" | "environment";
  frameRate?: number;
}

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export async function getCamera(
  constraints: CameraConstraints = {}
): Promise<MediaStream> {
  const {
    width = 1280,
    height = 720,
    facingMode = "user",
    frameRate = 30,
  } = constraints;

  try {
    // Aggressive: ideal HD + 30fps, min 720x540 + 24fps.
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: width, min: 720 },
        height: { ideal: height, min: 540 },
        frameRate: { ideal: frameRate, min: 24 },
      },
      audio: false,
    });
  } catch {
    // Fallback: minimal constraints (accept whatever the device provides)
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode } },
      audio: false,
    });
  }
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function getCameraResolution(
  stream: MediaStream
): { width: number; height: number } {
  const track = stream.getVideoTracks()[0];
  const settings = track?.getSettings();
  return { width: settings?.width ?? 0, height: settings?.height ?? 0 };
}
