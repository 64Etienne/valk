import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let faceLandmarker: FaceLandmarker | null = null;
let isLoading = false;
let activeDelegate: "GPU" | "CPU" = "GPU";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const LANDMARKER_OPTIONS = {
  runningMode: "VIDEO" as const,
  numFaces: 1,
  outputFaceBlendshapes: false,
  outputFacialTransformationMatrixes: false,
  minFaceDetectionConfidence: 0.5,
  minFacePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

async function createLandmarker(
  vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  delegate: "GPU" | "CPU"
): Promise<FaceLandmarker> {
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    ...LANDMARKER_OPTIONS,
  });
}

export async function initFaceLandmarker(): Promise<FaceLandmarker> {
  if (faceLandmarker) return faceLandmarker;
  if (isLoading) {
    while (isLoading) await new Promise((r) => setTimeout(r, 100));
    if (faceLandmarker) return faceLandmarker;
  }

  isLoading = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);

    // Try GPU first, fall back to CPU (critical for iOS Safari)
    try {
      faceLandmarker = await createLandmarker(vision, "GPU");
      activeDelegate = "GPU";
    } catch {
      console.warn("GPU delegate failed, falling back to CPU");
      faceLandmarker = await createLandmarker(vision, "CPU");
      activeDelegate = "CPU";
    }

    return faceLandmarker;
  } finally {
    isLoading = false;
  }
}

export function getActiveDelegate(): "GPU" | "CPU" {
  return activeDelegate;
}

export function getFaceLandmarker(): FaceLandmarker | null {
  return faceLandmarker;
}

export function closeFaceLandmarker(): void {
  faceLandmarker?.close();
  faceLandmarker = null;
}
