import base64
import json
import math
import os
import queue
import secrets
import threading
import time
import traceback
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel, Field

from . import agent, audio, generator, photo

ROOT = Path(__file__).resolve().parent.parent
OUTPUTS = Path(os.getenv("CVA_OUTPUTS", ROOT / "outputs")).resolve()
UPLOADS = OUTPUTS / "uploads"
UPLOADS.mkdir(parents=True, exist_ok=True)
HISTORY = OUTPUTS / "history.json"
MAX_SECONDS = int(os.getenv("CVA_MAX_SECONDS", "300"))

app = FastAPI(title="Offline Character Video Agent")

# Optional password protection (set CVA_USER / CVA_PASSWORD, e.g. as Hugging Face Space secrets).
AUTH_USER, AUTH_PASSWORD = os.getenv("CVA_USER") or "admin", os.getenv("CVA_PASSWORD", "")
if AUTH_PASSWORD:
    @app.middleware("http")
    async def basic_auth(request: Request, call_next):
        try:
            scheme, _, token = request.headers.get("authorization", "").partition(" ")
            user, _, pw = base64.b64decode(token).decode().partition(":")
            ok = scheme.lower() == "basic" and secrets.compare_digest(user, AUTH_USER) and \
                secrets.compare_digest(pw, AUTH_PASSWORD)
        except Exception:
            ok = False
        if not ok:
            return Response("Login required", 401, {"WWW-Authenticate": 'Basic realm="Character Video Studio"'})
        return await call_next(request)

jobs: dict[str, dict] = {}
job_queue: "queue.Queue[str]" = queue.Queue()


class VideoRequest(BaseModel):
    prompt: str = Field("", max_length=1000)
    scenes: str = Field("", max_length=5000)  # optional storyboard: one scene per line
    character: str = ""
    scene: str = ""
    style: str = "cartoon"
    camera: str = "static"
    duration: float = Field(4.0, ge=1, le=MAX_SECONDS)
    quality: str = "fast"
    seed: int = -1
    use_llm: bool = False
    dialogue: str = Field("", max_length=5000)
    voice: str = next(iter(audio.VOICES))
    voice_speed: float = Field(1.0, ge=0.5, le=2.0)
    lipsync: bool = False
    photo_b64: str = Field("", max_length=15_000_000)  # data URL from the browser; stored to disk on submit
    photo_file: str = ""
    photo_mode: str = "ai"  # "ai": new AI animation that looks like the photo | "direct": animate the photo itself
    photo_strength: float = Field(0.7, ge=0.0, le=1.0)
    time_limit_min: float = Field(10, ge=0, le=600)  # 0 = no limit; otherwise finish within this many minutes


R = generator.BASE_RES
QUALITY = {  # engine, steps, guidance, width, height
    "fast": ("lightning", 4, 1.0, R, R),
    "standard": ("classic", 25, 7.5, R, R),
    "high (slow)": ("classic", 30, 7.5, 512, 512),
}


def load_history() -> list:
    return json.loads(HISTORY.read_text()) if HISTORY.exists() else []


def run_job(job: dict):
    req = VideoRequest(**job["request"])
    job_id, fps = job["id"], generator.FPS
    talking = bool(req.dialogue.strip())
    ref = Image.open(UPLOADS / req.photo_file).convert("RGB") if req.photo_file else None
    out = OUTPUTS / f"{job_id}.mp4"

    duration, wav = req.duration, None
    if talking:  # voice first: a long speech makes the video at least as long as the speech
        job["stage"] = "voice"
        wav = OUTPUTS / f"{job_id}.wav"
        duration = max(duration, audio.tts(req.dialogue, req.voice, str(wav), req.voice_speed))
    job["duration"] = round(duration, 1)

    def prog(p, seg=1, total=1):
        job.update(stage="generating", progress=round(p, 3), segment=seg, segments=total)

    if ref is not None and req.photo_mode == "direct":
        job["final_prompt"] = "(your photo, animated directly)"
        frames = photo.animate_still(ref, duration, fps, req.camera)
        job["seed"] = None
    else:
        lines = [s.strip() for s in req.scenes.splitlines() if s.strip()] or [req.prompt.strip()]
        built = [agent.build_prompt(line, req.character, req.scene, req.style, req.camera, req.use_llm,
                                    face_focus=talking and req.lipsync) for line in lines]
        prompts, neg = [p for p, _ in built], built[0][1]
        job["final_prompt"] = prompts[0] + (f"  (+{len(prompts) - 1} more scenes)" if len(prompts) > 1 else "")
        engine, steps, guidance, w, h = QUALITY.get(req.quality, QUALITY["fast"])
        if generator._pipe is None or generator._engine != engine:
            job["stage"] = "loading model"
        deadline = None
        if req.time_limit_min:  # keep time back for lip-sync + saving, which grow with video length
            reserve = 15 + duration * ((0.6 if req.lipsync else 0.05) * (1 if generator.LOW_VRAM else 0.4))
            deadline = job["started"] + req.time_limit_min * 60 - reserve
        frames, job["seed"], unique = generator.generate(prompts, neg, duration, engine, steps, guidance, w, h,
                                                         req.seed, ref, req.photo_strength, progress=prog,
                                                         deadline=deadline)
        total = max(1, math.ceil(duration / generator.SEG_SECONDS))
        if unique < total:
            job["warning"] = (f"To finish within {req.time_limit_min:g} min, {unique} of {total} parts were newly "
                              "made and the rest replays them. Raise 'Finish within' for more variety.")

    if wav is not None:
        if req.lipsync:
            job["stage"] = "lipsync"
            frames, face_ratio = audio.lipsync(frames, str(wav), fps)
            if face_ratio == 0:
                job["warning"] = (job.get("warning", "") +
                                  " No face detected, so lip-sync was skipped (voice still added).").strip()
        job["stage"] = "saving"
        silent = OUTPUTS / f"{job_id}_silent.mp4"
        generator.save(frames, str(silent), fps)
        audio.mux(str(silent), str(wav), str(out))
        silent.unlink()
        wav.unlink()
    else:
        job["stage"] = "saving"
        generator.save(frames, str(out), fps)


def worker():
    while True:
        job_id = job_queue.get()
        job = jobs[job_id]
        job.update(status="running", started=time.time())
        try:
            run_job(job)
            job.update(status="done", progress=1.0, video=f"/videos/{job_id}.mp4",
                       elapsed=round(time.time() - job["started"], 1))
            hist = load_history()
            hist.insert(0, {k: job.get(k) for k in ("id", "video", "final_prompt", "seed", "request", "elapsed",
                                                    "duration")})
            HISTORY.write_text(json.dumps(hist[:500], indent=2))
        except Exception as e:
            traceback.print_exc()
            msg = str(e)
            if "out of memory" in msg.lower():
                msg = "GPU out of memory - try Quality 'fast'."
            job.update(status="error", error=msg)
        finally:
            job_queue.task_done()


threading.Thread(target=worker, daemon=True).start()


@app.post("/api/generate")
def create(req: VideoRequest):
    if not (req.prompt.strip() or req.scenes.strip() or (req.photo_b64 and req.photo_mode == "direct")):
        raise HTTPException(400, "Please describe the video (prompt or scenes).")
    job_id = uuid.uuid4().hex[:12]
    req.photo_file = ""  # only ever set from a fresh upload below
    if req.photo_b64:
        try:
            photo.decode_upload(req.photo_b64).save(UPLOADS / f"{job_id}.png")
        except Exception:
            raise HTTPException(400, "Could not read the uploaded picture.")
        req.photo_file, req.photo_b64 = f"{job_id}.png", ""
    jobs[job_id] = {"id": job_id, "status": "queued", "progress": 0.0, "stage": "queued",
                    "request": req.model_dump(), "created": time.time()}
    job_queue.put(job_id)
    return {"id": job_id, "position": job_queue.qsize()}


@app.get("/api/jobs/{job_id}")
def status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "job not found")
    job = jobs[job_id]
    return {**job, "running_for": round(time.time() - job["started"]) if job.get("started") else 0}


@app.get("/api/history")
def history():
    return load_history()


@app.get("/api/options")
def options():
    return {"styles": list(agent.STYLES), "cameras": list(agent.CAMERA), "qualities": list(QUALITY),
            "voices": list(audio.VOICES), "max_seconds": MAX_SECONDS,
            "gpu": f"{generator.VRAM_GB:.0f} GB" if generator.CUDA else "CPU only"}


def _file(folder: Path, name: str, media: str):
    path = (folder / name).resolve()
    if path.parent != folder or not path.exists():
        raise HTTPException(404)
    return FileResponse(path, media_type=media)


@app.get("/videos/{name}")
def video(name: str):
    return _file(OUTPUTS, name, "video/mp4")


@app.get("/uploads/{name}")
def upload(name: str):
    return _file(UPLOADS, name, "image/png")


app.mount("/", StaticFiles(directory=ROOT / "static", html=True), name="static")
