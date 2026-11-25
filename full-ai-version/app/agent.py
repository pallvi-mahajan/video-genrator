"""Offline prompt agent: turns a simple user request into a rich diffusion prompt.

Rule-based, so it needs no internet, API key or LLM. If a local Ollama server is
running, it is used optionally to rewrite the prompt for better results.
"""
import json
import urllib.request

STYLES = {
    "cartoon": ("3d cartoon character, pixar style, vibrant colors, soft lighting, cute, highly detailed",
                "realistic, photo, ugly, deformed"),
    "anime": ("anime style, studio ghibli, cel shading, vivid colors, beautiful detailed anime character",
              "photo, realistic, 3d render, ugly, deformed"),
    "realistic": ("photorealistic, cinematic, 35mm film, highly detailed skin, natural lighting, 8k",
                  "cartoon, anime, drawing, painting, deformed, ugly"),
    "fantasy": ("epic fantasy art, magical atmosphere, glowing particles, detailed character, dramatic lighting",
                "modern, photo, ugly, deformed"),
    "pixel": ("pixel art, 16-bit retro game character, crisp pixels, vibrant palette",
              "blurry, photo, realistic, smooth"),
}

CAMERA = {
    "static": "",
    "zoom in": "slow camera zoom in",
    "zoom out": "slow camera zoom out",
    "pan left": "camera panning left",
    "pan right": "camera panning right",
}

BASE_NEGATIVE = ("bad quality, worse quality, low resolution, blurry, watermark, text, "
                 "extra limbs, extra fingers, bad anatomy, disfigured, flickering")


def _ollama_rewrite(prompt: str) -> str | None:
    try:
        body = json.dumps({
            "model": "llama3.2",
            "stream": False,
            "prompt": ("Rewrite this as one short Stable Diffusion prompt (comma separated tags, "
                       f"max 60 words, no explanation): {prompt}"),
        }).encode()
        req = urllib.request.Request("http://127.0.0.1:11434/api/generate", body,
                                     {"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            text = json.loads(r.read())["response"].strip().strip('"')
            return text or None
    except Exception:
        return None


def build_prompt(prompt: str, character: str = "", scene: str = "", style: str = "cartoon",
                 camera: str = "static", use_llm: bool = False, face_focus: bool = False) -> tuple[str, str]:
    style_pos, style_neg = STYLES.get(style, STYLES["cartoon"])
    core = ", ".join(p.strip() for p in (character, prompt, scene) if p and p.strip())
    if use_llm:
        core = _ollama_rewrite(core) or core
    # lip-sync needs a clearly visible, front-facing face
    face = "close-up portrait, facing the camera, face clearly visible, talking" if face_focus else ""
    parts = ["masterpiece, best quality", core, face, style_pos, CAMERA.get(camera, "")]
    return ", ".join(p for p in parts if p), f"{BASE_NEGATIVE}, {style_neg}"
