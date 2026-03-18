export interface CameraConstraints {
  width?: number;
  height?: number;
  facingMode?: "user" | "environment";
  frameRate?: number;
}

export async function getCamera(constraints: CameraConstraints = {}): Promise<MediaStream> {
  const {
    width = 1280,
    height = 720,
    facingMode = "user",
    frameRate = 30,
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
  } catch (err) {
    // Fallback: less strict constraints
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode } },
      audio: false,
    });
  }
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function getCameraResolution(stream: MediaStream): { width: number; height: number } {
  const track = stream.getVideoTracks()[0];
  const settings = track?.getSettings();
  return { width: settings?.width ?? 0, height: settings?.height ?? 0 };
}
