# Character Video Studio - Docker image (Hugging Face Spaces, RunPod, any Docker host).
# Works on CPU (slow for AI video) and uses an NVIDIA GPU automatically if the host has one.
FROM python:3.12-slim

RUN useradd -m -u 1000 user
ENV HOME=/home/user PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    HF_HOME=/home/user/.cache/huggingface CVA_OUTPUTS=/home/user/outputs
WORKDIR /home/user/app

COPY requirements.txt .
RUN pip install torch==2.5.1 torchvision==0.20.1 && pip install -r requirements.txt && \
    pip install https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl

COPY --chown=user . .
USER user

EXPOSE 7860
# Models (~9 GB) download at start-up (fast inside Hugging Face's network); already-cached files are skipped.
CMD ["sh", "-c", "python download_models.py && HF_HUB_OFFLINE=1 exec uvicorn app.main:app --host 0.0.0.0 --port 7860"]
