#!/usr/bin/env python3
"""Extrait gazeH (iris relatif au visage) frame par frame -> JSON stdout."""
import sys, json
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

DEFAULT_MODEL = "tools/vision/models/face_landmarker.task"


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: extract_gaze.py <clip> [model]"}))
        sys.exit(2)
    clip = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_MODEL
    base = mp_python.BaseOptions(model_asset_path=model)
    opts = vision.FaceLandmarkerOptions(
        base_options=base, num_faces=1, running_mode=vision.RunningMode.VIDEO)
    lmkr = vision.FaceLandmarker.create_from_options(opts)

    cap = cv2.VideoCapture(clip)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frames = []
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        res = lmkr.detect_for_video(
            mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), int(idx * 1000 / fps))
        rec = {"t": idx / fps, "ok": False, "gazeH": None, "irisPx": None}
        if res.face_landmarks and len(res.face_landmarks[0]) >= 478:
            lm = res.face_landmarks[0]
            iris_x = (lm[468].x + lm[473].x) / 2.0
            fl, fr = lm[234].x, lm[454].x
            if (fr - fl) > 1e-6:
                rec["gazeH"] = (iris_x - fl) / (fr - fl)
                iris_y = (lm[468].y + lm[473].y) / 2.0
                rec["irisPx"] = [iris_x * width, iris_y * height]
                rec["ok"] = True
        frames.append(rec)
        idx += 1
    cap.release()
    print(json.dumps({"fps": fps, "width": width, "height": height, "frames": frames}))


if __name__ == "__main__":
    main()
