"""AnimateDiff text-to-video. Works on small (4GB) GPUs via CPU offload and uses the full GPU on bigger cards.

Long videos are built from 2-second segments (16 generated frames each) joined with short crossfades.
An optional reference photo (IP-Adapter) keeps the character looking like the user's picture.
"""
import gc
import math
import os
import threading
import time

import imageio_ffmpeg
import numpy as np
import torch
from diffusers import AnimateDiffPipeline, DDIMScheduler, EulerDiscreteScheduler, MotionAdapter
from huggingface_hub import hf_hub_download
from PIL import Image
from safetensors.torch import load_file

BASE_MODEL = os.getenv("BASE_MODEL", "Lykon/dreamshaper-8")
MOTION_ADAPTER = os.getenv("MOTION_ADAPTER", "guoyww/animatediff-motion-adapter-v1-5-2")
LIGHTNING = ("ByteDance/AnimateDiff-Lightning", "animatediff_lightning_4step_diffusers.safetensors")
IP_ADAPTER = ("h94/IP-Adapter", "models", "ip-adapter-plus-face_sd15.safetensors")

CUDA = torch.cuda.is_available()
VRAM_GB = torch.cuda.get_device_properties(0).total_memory / 1e9 if CUDA else 0
LOW_VRAM = VRAM_GB < 10  # e.g. 4GB laptop GPU -> CPU offload + smaller frames
BASE_RES = 384 if LOW_VRAM else 512

FPS = 16
SEG_FRAMES = 16          # frames generated per segment (AnimateDiff's native window)
SEG_SECONDS = 2.0        # each segment is blended up to 2 s at FPS
CROSSFADE = 4            # frames blended between consecutive segments

_pipe = None
_engine = None
_ip_loaded = False
_lock = threading.Lock()


def _place(pipe):
    if not CUDA:
        return
    if LOW_VRAM:
        pipe.enable_model_cpu_offload()
    else:
        pipe.to("cuda")


def load_pipeline(engine: str = "lightning"):
    """engine: 'lightning' (4-step, fast) or 'classic' (25+ steps, slightly better detail)."""
    global _pipe, _engine, _ip_loaded
    if _pipe is not None and _engine == engine:
        return _pipe
    _pipe, _engine, _ip_loaded = None, None, False
    gc.collect()
    if CUDA:
        torch.cuda.empty_cache()
    dtype = torch.float16 if CUDA else torch.float32
    if engine == "lightning":
        adapter = MotionAdapter()
        adapter.load_state_dict(load_file(hf_hub_download(*LIGHTNING)))
        adapter = adapter.to(dtype)
    else:
        adapter = MotionAdapter.from_pretrained(MOTION_ADAPTER, torch_dtype=dtype)
    pipe = AnimateDiffPipeline.from_pretrained(BASE_MODEL, motion_adapter=adapter, torch_dtype=dtype,
                                               variant="fp16")
    if engine == "lightning":
        pipe.scheduler = EulerDiscreteScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing",
                                                            beta_schedule="linear")
    else:
        pipe.scheduler = DDIMScheduler.from_pretrained(
            BASE_MODEL, subfolder="scheduler", clip_sample=False,
            timestep_spacing="linspace", beta_schedule="linear", steps_offset=1)
    pipe.enable_vae_slicing()
    _place(pipe)
    _pipe, _engine = pipe, engine
    return pipe


def _ensure_ip_adapter(pipe):
    global _ip_loaded
    if not _ip_loaded:
        repo, sub, weight = IP_ADAPTER
        pipe.load_ip_adapter(repo, subfolder=sub, weight_name=weight)
        _place(pipe)  # re-register offload hooks so the image encoder is managed too
        _ip_loaded = True


def interpolate(frames, target: int) -> list:
    """Blend neighbouring frames to stretch the clip to `target` frames (cheap, no extra model)."""
    arr = np.stack([np.asarray(f, dtype=np.float32) for f in frames])
    pos = np.linspace(0, len(arr) - 1, target)
    lo = np.floor(pos).astype(int)
    hi = np.minimum(lo + 1, len(arr) - 1)
    w = (pos - lo)[:, None, None, None]
    return list(((1 - w) * arr[lo] + w * arr[hi]).round().astype(np.uint8))


def join(clips: list[list]) -> list:
    """Concatenate clips with a short crossfade so segment cuts are not jarring."""
    out = list(clips[0])
    for clip in clips[1:]:
        n = min(CROSSFADE, len(out), len(clip))
        for k in range(n):
            a = (k + 1) / (n + 1)
            out[-n + k] = ((1 - a) * out[-n + k].astype(np.float32) + a * clip[k].astype(np.float32)).astype(np.uint8)
        out.extend(clip[n:])
    return out


def save(frames: list, out_path: str, fps: int = FPS):
    """Stream uint8 frames to an mp4 (constant memory, fine for multi-minute videos)."""
    h, w = frames[0].shape[:2]
    writer = imageio_ffmpeg.write_frames(out_path, (w, h), fps=fps, codec="libx264", quality=8,
                                         macro_block_size=1, output_params=["-pix_fmt", "yuv420p"])
    writer.send(None)
    for f in frames:
        writer.send(np.ascontiguousarray(f))
    writer.close()


def generate(prompts: list[str], negative: str, duration: float, engine: str = "lightning", steps: int = 4,
             guidance: float = 1.0, width: int = BASE_RES, height: int = BASE_RES, seed: int = -1,
             ref_image: Image.Image | None = None, ref_strength: float = 0.7,
             progress=None, deadline: float | None = None) -> tuple[list, int, int]:
    """Returns (uint8 RGB frames at FPS, seed, number of unique parts generated).

    `prompts` cycle across segments (a simple storyboard). If `deadline` (a time.time() value) is given,
    generation stops when the next part would not finish in time; the remaining length is then filled by
    replaying the generated parts forward/backward (ping-pong) so the video still has the requested length.
    """
    pipe = load_pipeline(engine)
    if seed < 0:
        seed = int(torch.randint(0, 2**31 - 1, (1,)).item())
    segments = max(1, math.ceil(duration / SEG_SECONDS))
    seg_len = int(SEG_SECONDS * FPS)
    planned = segments
    gen_time = 0.0

    extra = {}
    if ref_image is not None or _ip_loaded:
        _ensure_ip_adapter(pipe)
        pipe.set_ip_adapter_scale(ref_strength if ref_image is not None else 0.0)
        extra["ip_adapter_image"] = ref_image if ref_image is not None else Image.new("RGB", (224, 224))

    clips = []
    for i in range(segments):
        if deadline and i > 0:
            avg = gen_time / i
            planned = min(segments, i + max(0, int((deadline - time.time()) / avg)))
            if i >= planned:
                break

        def cb(_pipe, step, _t, kwargs, i=i):
            if progress:
                progress(min(1.0, (i + (step + 1) / steps) / planned), i + 1, planned)
            return kwargs

        t0 = time.time()
        with _lock:
            result = pipe(prompt=prompts[i % len(prompts)], negative_prompt=negative, num_frames=SEG_FRAMES,
                          num_inference_steps=steps, guidance_scale=guidance, width=width, height=height,
                          generator=torch.Generator("cpu").manual_seed(seed + i), callback_on_step_end=cb,
                          output_type="np", **extra)
        clips.append(interpolate((result.frames[0] * 255).round().astype(np.uint8), seg_len))
        del result
        if CUDA:
            torch.cuda.empty_cache()
        gen_time += time.time() - t0

    unique = len(clips)
    for j in range(unique, segments):  # time budget hit: ping-pong replay of the parts we have
        lap, pos = divmod(j, unique)
        clips.append(clips[pos] if lap % 2 == 0 else clips[unique - 1 - pos][::-1])
    return join(clips)[: max(1, int(duration * FPS))], seed, unique
