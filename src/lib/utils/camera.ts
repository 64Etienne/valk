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
  const mobile = isMobile();
  const {
    width = mobile ? 640 : 1280,
    height = mobile ? 480 : 720,
    facingMode = "user",
    frameRate = mobile ? 24 : 30,
  } = constraints;

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: width },
        height: { ideal: height },
        frameRate: { ideal: frameRate },
      },
      audio: false,
    });
  } catch {
    // Fallback: minimal constraints
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
