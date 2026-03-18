import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let faceLandmarker: FaceLandmarker | null = null;
let isLoading = false;

export async function initFaceLandmarker(): Promise<FaceLandmarker> {
  if (faceLandmarker) return faceLandmarker;
  if (isLoading) {
    // Wait for existing init
    while (isLoading) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (faceLandmarker) return faceLandmarker;
  }

  isLoading = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    return faceLandmarker;
  } finally {
    isLoading = false;
  }
}

export function getFaceLandmarker(): FaceLandmarker | null {
  return faceLandmarker;
}

export function closeFaceLandmarker(): void {
  faceLandmarker?.close();
  faceLandmarker = null;
}
