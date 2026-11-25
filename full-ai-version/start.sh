#!/usr/bin/env bash
# Start Character Video Studio at http://localhost:7860 (run ./setup.sh once first)
cd "$(dirname "$0")"
export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
exec .venv/bin/uvicorn app.main:app --host "${HOST:-127.0.0.1}" --port "${PORT:-7860}"
