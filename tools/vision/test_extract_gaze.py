import subprocess, json, os, tempfile

HERE = os.path.dirname(__file__)
PY = os.path.join(HERE, ".venv", "bin", "python")
SCRIPT = os.path.join(HERE, "extract_gaze.py")
MODEL = os.path.join(HERE, "models", "face_landmarker.task")


def test_no_face_returns_valid_json():
    # vidéo synthétique sans visage (noir) -> JSON valide, tous ok=false
    with tempfile.TemporaryDirectory() as d:
        clip = os.path.join(d, "blank.mp4")
        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=black:s=128x128:d=1:r=30", clip],
            check=True, capture_output=True)
        out = subprocess.run([PY, SCRIPT, clip, MODEL], check=True, capture_output=True, text=True)
        data = json.loads(out.stdout)
        assert "frames" in data and len(data["frames"]) > 10
        assert all(f["ok"] is False for f in data["frames"])
        assert all(f["gazeH"] is None for f in data["frames"])
