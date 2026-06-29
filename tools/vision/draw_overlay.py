#!/usr/bin/env python3
"""Dessine iris détecté + repère stimulus par frame -> overlay.mp4.
Le stimulus par instant vient de signal.json (points: [{t, stimulusX}])."""
import sys, json
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

clip, signal_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
model = sys.argv[4] if len(sys.argv) > 4 else "tools/vision/models/face_landmarker.task"
signal = json.load(open(signal_path))
# stimulus indexé par temps arrondi (ms) pour lookup rapide
stim_by_ms = {round(p["t"] * 1000): p["stimulusX"] for p in signal.get("points", [])}

base = mp_python.BaseOptions(model_asset_path=model)
opts = vision.FaceLandmarkerOptions(base_options=base, num_faces=1, running_mode=vision.RunningMode.VIDEO)
lmkr = vision.FaceLandmarker.create_from_options(opts)

cap = cv2.VideoCapture(clip)
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
writer = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (W, H))
idx = 0
while True:
    ok, frame = cap.read()
    if not ok:
        break
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    res = lmkr.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), int(idx * 1000 / fps))
    if res.face_landmarks and len(res.face_landmarks[0]) >= 478:
        lm = res.face_landmarks[0]
        ix = int((lm[468].x + lm[473].x) / 2 * W)
        iy = int((lm[468].y + lm[473].y) / 2 * H)
        cv2.circle(frame, (ix, iy), 6, (0, 255, 255), -1)  # iris (jaune)
    sx = stim_by_ms.get(round(idx * 1000 / fps))
    if sx is not None:
        bx = int(sx * W)
        cv2.line(frame, (bx, H - 24), (bx, H - 4), (255, 0, 255), 4)  # repère stimulus (magenta) en bas
    writer.write(frame)
    idx += 1
cap.release()
writer.release()
print(json.dumps({"ok": True, "frames": idx}))
