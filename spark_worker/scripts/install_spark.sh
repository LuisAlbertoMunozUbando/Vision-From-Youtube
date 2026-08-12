#!/usr/bin/env bash
set -euo pipefail

ROOT="${HOME}/slideextractor"
cd "$ROOT"

# Reconstruct the extractor from repository-safe source parts.
cat spark_worker/_parts/extractor.part01 \
    spark_worker/_parts/extractor.part02 \
    spark_worker/_parts/extractor.part03 \
    spark_worker/_parts/extractor.part04 \
    > spark_worker/extractor.py
chmod +x spark_worker/extractor.py

sudo apt-get update
sudo apt-get install -y ffmpeg python3-venv python3-pip curl

python3 -m venv --system-site-packages .venv
source .venv/bin/activate
python -m pip install --upgrade pip wheel
pip install -r spark_worker/requirements.txt

python - <<'PY'
import torch
print("torch:", torch.__version__)
print("cuda available:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("device:", torch.cuda.get_device_name(0))
PY

ffmpeg -hide_banner -hwaccels || true
yt-dlp --version
python -m py_compile spark_worker/app.py spark_worker/extractor.py

echo
echo "Spark software installation complete."
echo "Next: configure spark_worker/.env and start the systemd service."
