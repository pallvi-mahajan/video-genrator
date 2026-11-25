"""Offline character voice (Kokoro TTS), optional Wav2Lip lip-sync, and audio/video muxing."""
import subprocess
import sys
import threading
from pathlib import Path

import cv2
import imageio_ffmpeg
import librosa
import numpy as np
import soundfile as sf
import torch
from huggingface_hub import hf_hub_download

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "third_party" / "Wav2Lip"))

TTS_SR = 24000
VOICES = {  # label -> (kokoro voice id, kokoro language code)
    "Female - warm (US)": ("af_heart", "a"),
    "Female - bright (US)": ("af_bella", "a"),
    "Female - soft (US)": ("af_nicole", "a"),
    "Male - deep (US)": ("am_michael", "a"),
    "Male - casual (US)": ("am_adam", "a"),
    "Female (British)": ("bf_emma", "b"),
    "Male (British)": ("bm_george", "b"),
}

_tts: dict[str, object] = {}
_lip = {}
_lock = threading.Lock()
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def tts(text: str, voice: str, out_wav: str, speed: float = 1.0) -> float:
    """Synthesize `text` to a wav file; returns duration in seconds."""
    from kokoro import KPipeline

    voice_id, lang = VOICES.get(voice, next(iter(VOICES.values())))
    with _lock:
        if lang not in _tts:
            shared = next(iter(_tts.values())).model if _tts else True  # reuse loaded weights across accents
            _tts[lang] = KPipeline(lang_code=lang, repo_id="hexgrad/Kokoro-82M", model=shared, device="cpu")
        chunks = [r.audio.numpy() for r in _tts[lang](text, voice=voice_id, speed=speed) if r.audio is not None]
    if not chunks:
        raise ValueError("Could not synthesize the dialogue text.")
    pad = np.zeros(int(0.25 * TTS_SR), dtype=np.float32)
    wav = np.concatenate([pad, *chunks, pad])
    sf.write(out_wav, wav, TTS_SR)
    return len(wav) / TTS_SR


def loop_to_length(frames: list, n: int) -> list:
    """Ping-pong loop the clip so it lasts `n` frames (keeps motion smooth with no jump cut)."""
    if len(frames) >= n:
        return frames[:n]
    cycle = frames + frames[-2:0:-1]
    return [cycle[i % len(cycle)] for i in range(n)]


# ---------------------------------------------------------------- lip-sync (Wav2Lip)

def _mel_chunks(wav_path: str, fps: float) -> list:
    wav = librosa.load(wav_path, sr=16000)[0]
    wav = wav + 1e-6 * np.random.randn(len(wav)).astype(np.float32)  # TTS silence would give NaN mels
    wav = np.append(wav[0], wav[1:] - 0.97 * wav[:-1])
    spec = np.abs(librosa.stft(y=wav, n_fft=800, hop_length=200, win_length=800))
    basis = librosa.filters.mel(sr=16000, n_fft=800, n_mels=80, fmin=55, fmax=7600)
    s = 20 * np.log10(np.maximum(1e-5, basis @ spec)) - 20
    mel = np.clip(8 * ((s + 100) / 100) - 4, -4, 4)
    chunks, step, i = [], 80.0 / fps, 0
    while True:
        start = int(i * step)
        if start + 16 > mel.shape[1]:
            chunks.append(mel[:, mel.shape[1] - 16:])
            return chunks
        chunks.append(mel[:, start:start + 16])
        i += 1


def _load_lipsync():
    if not _lip:
        from face_detection.detection.sfd.sfd_detector import SFDDetector
        from models import Wav2Lip

        det_path = hf_hub_download("camenduru/Wav2Lip", "checkpoints/s3fd-619a316812.pth")
        w2l_path = hf_hub_download("camenduru/Wav2Lip", "checkpoints/wav2lip_gan.pth")
        _lip["det"] = SFDDetector(device=DEVICE, path_to_detector=det_path)
        model = Wav2Lip()
        state = torch.load(w2l_path, map_location="cpu", weights_only=True)["state_dict"]
        model.load_state_dict({k.replace("module.", ""): v for k, v in state.items()})
        _lip["model"] = model.to(DEVICE).eval()
    return _lip["det"], _lip["model"]


def _detect_faces(det, frames_bgr: list) -> list:
    boxes = []
    for i in range(0, len(frames_bgr), 8):
        batch = np.array(frames_bgr[i:i + 8])
        for scale in (1, 2):  # retry upscaled - helps small / stylized faces
            imgs = batch if scale == 1 else np.array([cv2.resize(f, None, fx=2, fy=2) for f in batch])
            found = det.detect_from_batch(imgs[..., ::-1].copy())
            res = [np.clip(f[0][:4], 0, None) / scale if len(f) else None for f in found]
            if any(r is not None for r in res):
                break
        boxes.extend(res)
    return boxes


def lipsync(frames_rgb: list, wav_path: str, fps: float) -> tuple[list, float]:
    """Returns (frames, fraction of frames where a face was found). Frames are uint8 RGB."""
    mels = _mel_chunks(wav_path, fps)
    frames = loop_to_length(frames_rgb, max(len(mels), len(frames_rgb)))
    tail = frames[len(mels):]  # video longer than speech: keep the rest unchanged
    bgr = [cv2.cvtColor(f, cv2.COLOR_RGB2BGR) for f in frames[:len(mels)]]
    with _lock:
        det, model = _load_lipsync()
        uniq = loop_to_length(list(range(len(frames_rgb))), len(mels))
        src_boxes = _detect_faces(det, [cv2.cvtColor(f, cv2.COLOR_RGB2BGR) for f in frames_rgb])
        boxes = [src_boxes[j] for j in uniq]
        found = [b for b in boxes if b is not None]
        if not found:
            return frames, 0.0
        # fill missing detections with nearest neighbour, then temporally smooth
        last = found[0]
        filled = []
        for b in boxes:
            last = b if b is not None else last
            filled.append(last)
        arr = np.array(filled, dtype=np.float32)
        arr = np.array([arr[max(0, i - 2):i + 3].mean(0) for i in range(len(arr))])
        h, w = bgr[0].shape[:2]
        coords = []
        for x1, y1, x2, y2 in arr:
            pad = int(0.1 * (y2 - y1))
            coords.append((int(max(0, y1)), int(min(h, y2 + pad)), int(max(0, x1)), int(min(w, x2))))

        out = []
        for i in range(0, len(bgr), 64):
            faces = np.array([cv2.resize(bgr[j][y1:y2, x1:x2], (96, 96))
                              for j, (y1, y2, x1, x2) in enumerate(coords[i:i + 64], start=i)])
            masked = faces.copy()
            masked[:, 48:] = 0
            img = torch.from_numpy(np.concatenate([masked, faces], 3) / 255.0).float().permute(0, 3, 1, 2)
            mel = torch.from_numpy(np.array(mels[i:i + 64])).float().unsqueeze(1)
            with torch.no_grad():
                pred = model(mel.to(DEVICE), img.to(DEVICE)).cpu().numpy().transpose(0, 2, 3, 1) * 255
            for k, p in enumerate(pred):
                y1, y2, x1, x2 = coords[i + k]
                f = bgr[i + k].copy()
                f[y1:y2, x1:x2] = cv2.resize(p.astype(np.uint8), (x2 - x1, y2 - y1))
                out.append(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))
        if DEVICE == "cuda":
            torch.cuda.empty_cache()
    return out + tail, len([b for b in src_boxes if b is not None]) / len(src_boxes)


def mux(video_path: str, wav_path: str, out_path: str):
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-i", video_path, "-i", wav_path,
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", out_path], check=True)
