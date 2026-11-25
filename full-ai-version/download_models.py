"""Download every model the app needs (one time, ~9 GB). After this the app runs fully offline."""
from huggingface_hub import hf_hub_download, snapshot_download

from app.audio import VOICES

SNAPSHOTS = [
    ("Lykon/dreamshaper-8", ["model_index.json", "scheduler/*", "text_encoder/*.json",
                             "text_encoder/model.fp16.safetensors", "tokenizer/*", "unet/*.json",
                             "unet/diffusion_pytorch_model.fp16.safetensors", "vae/*.json",
                             "vae/diffusion_pytorch_model.fp16.safetensors", "feature_extractor/*"]),
    ("guoyww/animatediff-motion-adapter-v1-5-2", ["*.json", "diffusion_pytorch_model.safetensors"]),
    ("h94/IP-Adapter", ["models/ip-adapter-plus-face_sd15.safetensors", "models/image_encoder/config.json",
                        "models/image_encoder/model.safetensors"]),
]
FILES = [
    ("ByteDance/AnimateDiff-Lightning", "animatediff_lightning_4step_diffusers.safetensors"),
    ("camenduru/Wav2Lip", "checkpoints/s3fd-619a316812.pth"),
    ("camenduru/Wav2Lip", "checkpoints/wav2lip_gan.pth"),
    ("hexgrad/Kokoro-82M", "config.json"),
    ("hexgrad/Kokoro-82M", "kokoro-v1_0.pth"),
    *[("hexgrad/Kokoro-82M", f"voices/{v}.pt") for v, _ in VOICES.values()],
]

if __name__ == "__main__":
    for repo, patterns in SNAPSHOTS:
        print(f"-> {repo}", flush=True)
        snapshot_download(repo, allow_patterns=patterns)
    for repo, name in FILES:
        print(f"-> {repo}/{name}", flush=True)
        hf_hub_download(repo, name)
    print("-> voice pronunciation data", flush=True)
    from kokoro import KPipeline  # first use also fetches the small spaCy English model

    for lang in sorted({lang for _, lang in VOICES.values()}):
        KPipeline(lang_code=lang, repo_id="hexgrad/Kokoro-82M", model=False)
    print("All models downloaded.")
