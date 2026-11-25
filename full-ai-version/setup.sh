#!/usr/bin/env bash
# One-time setup on a new Linux / WSL / Google Colab machine with an NVIDIA GPU.
# Creates .venv, installs everything, downloads all models (~9 GB). Then run ./start.sh
set -euo pipefail
cd "$(dirname "$0")"

export UV_HTTP_TIMEOUT=600 UV_NATIVE_TLS=1 HF_HUB_DOWNLOAD_TIMEOUT=120
command -v uv >/dev/null || { python3 -m pip install -q uv || curl -LsSf https://astral.sh/uv/install.sh | sh; }
export PATH="$HOME/.local/bin:$PATH"

[ -d .venv ] || uv venv -q --python 3.12 .venv
uv pip install -q --python .venv/bin/python torch==2.5.1 torchvision==0.20.1
uv pip install -q --python .venv/bin/python -r requirements.txt
.venv/bin/python -c "import torch; print('torch', torch.__version__, '| GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'none (CPU mode, very slow)')"
.venv/bin/python download_models.py
echo "Setup complete. Start the app with: ./start.sh"
