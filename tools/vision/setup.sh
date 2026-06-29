#!/usr/bin/env bash
# Monte le venv Python de vision (idempotent). Prérequis : uv installé.
set -euo pipefail
cd "$(dirname "$0")"
MODEL_URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"

[ -d .venv ] || uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -r requirements.txt

mkdir -p models
if [ ! -f models/face_landmarker.task ]; then
  curl -sL -o models/face_landmarker.task "$MODEL_URL"
fi
.venv/bin/python -c "import mediapipe, cv2, numpy; print('vision OK', mediapipe.__version__, cv2.__version__)"
