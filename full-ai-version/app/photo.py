"""User photo helpers: decode uploads and animate a still photo with gentle camera motion."""
import base64
import io
import math

import cv2
import numpy as np
from PIL import Image, ImageOps

MAX_SIDE = 512


def decode_upload(data_url: str) -> Image.Image:
    raw = base64.b64decode(data_url.split(",", 1)[-1])
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    img.thumbnail((2048, 2048))
    return img


def fit(img: Image.Image, max_side: int = MAX_SIDE) -> np.ndarray:
    """Resize keeping aspect ratio, with even dimensions (required by the h264 encoder)."""
    scale = max_side / max(img.size)
    w, h = (int(img.width * scale) // 2 * 2, int(img.height * scale) // 2 * 2)
    return np.asarray(img.resize((w, h), Image.LANCZOS))


def animate_still(img: Image.Image, duration: float, fps: int, camera: str = "static") -> list:
    """Slow 'Ken Burns' zoom/pan plus a subtle breathing sway so a single photo feels alive."""
    base = fit(img, MAX_SIDE * 2)  # work at 2x, crop down -> sharp zoom
    H, W = base.shape[:2]
    out_w, out_h = W // 4 * 2, H // 4 * 2
    n = max(1, int(duration * fps))
    frames = []
    for i in range(n):
        t = i / max(1, n - 1)
        wave = math.sin(2 * math.pi * i / (fps * 6))  # 6 s breathing cycle
        zoom = {"zoom in": 1.0 + 0.15 * t, "zoom out": 1.15 - 0.15 * t}.get(camera, 1.04 + 0.03 * wave)
        pan = {"pan left": 0.5 - 0.4 * (t - 0.5), "pan right": 0.5 + 0.4 * (t - 0.5)}.get(camera, 0.5)
        cw, ch = W / zoom, H / zoom
        x = (W - cw) * pan
        y = (H - ch) * (0.5 + 0.02 * wave)
        crop = base[int(y):int(y + ch), int(x):int(x + cw)]
        frames.append(cv2.resize(crop, (out_w, out_h), interpolation=cv2.INTER_AREA))
    return frames
