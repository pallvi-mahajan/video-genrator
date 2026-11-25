---
title: Character Video Studio
emoji: 🎬
colorFrom: purple
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# Character Video Studio

Type a prompt (or upload your own picture) and get a character video, from a few seconds up to 5 minutes,
with an optional voice and lip-sync. Free and open source: no account, credits or API keys.

Run it on **your own PC** (fully offline after setup) or on **free Google Colab** (Google's T4 GPU, faster).

## Features
- Text to video: prompt + character + scene + style (cartoon / anime / realistic / fantasy / pixel) + camera move
- Any length (1 s - 5 min): long videos are built from 2-second AI parts joined with crossfades.
  Optional **storyboard**: one scene per line, used in order.
- **Your own picture**
  - *Animate my photo*: your exact photo with gentle camera motion; add a voice + lip-sync for a talking photo. Fast at any length.
  - *AI character that looks like my photo*: new AI animation guided by your face (IP-Adapter Plus Face).
- **Voice**: 7 offline voices (Kokoro TTS). **Lip-sync**: Wav2Lip.
- Gallery of all your videos, MP4 download.

## Option 0 - Permanent public website (Hugging Face Space, needs a paid PRO plan)
Hugging Face only lets PRO accounts (paid) create Docker Spaces, even on the free CPU hardware.
1. Create an account at https://huggingface.co and subscribe to PRO.
2. Go to https://huggingface.co/new-space. Name it (e.g. `character-video-studio`), pick SDK **Docker** with the
   **Blank** template and hardware **CPU basic** (or a GPU), then click **Create Space**.
3. In the Space, open **Settings > Variables and secrets > New secret** and add `CVA_USER` (your login name) and
   `CVA_PASSWORD` (your password).
4. Create a token at https://huggingface.co/settings/tokens (type **Write**).
5. Push the code (when git asks, enter your HF username, and the token as the password):
   ```bash
   cd character-video-agent
   git push https://huggingface.co/spaces/<your-username>/character-video-studio main --force
   ```
   The `--force` replaces the starter README that Hugging Face creates.
6. Wait for the build (about 10-20 min the first time), then open `https://<your-username>-character-video-studio.hf.space`.

The free CPU tier has no GPU, so AI video parts are very slow there (use "Animate my photo", voice and lip-sync, or a short
length). For fast AI video, choose a GPU in **Settings > Space hardware** (paid). The code uses the GPU automatically.
The free tier also sleeps after about 48 h without visits and wakes on the next visit (start-up re-downloads the models, ~5 min).
Videos are deleted whenever the Space restarts, so download the ones you want to keep.

## Option A - Google Colab (free GPU, use from any computer with your Google account)
1. Open https://colab.research.google.com, choose **File > Upload notebook** and pick
   `colab/Character_Video_Studio.ipynb` (it's inside the zip).
2. **Runtime > Change runtime type > T4 GPU**.
3. Run cell 1. It shows a **Choose Files** button: pick `character-video-agent.zip`. Google Drive is not needed.
   Optional: set `GITHUB_URL`, or tick `USE_GOOGLE_DRIVE` to load the zip from Drive and save videos there.
4. Run cells 2 and 3, then click the link to open the app.

Free Colab limits: sessions end after a few hours or when the tab sits idle, and GPU time per day is limited.
Rerun the cells to start again. Models download again each session unless you tick `KEEP_MODELS_ON_DRIVE` (uses ~9 GB of Drive).

## Option B - your own PC (Linux or Windows WSL2, NVIDIA GPU with 4 GB or more)
```bash
unzip character-video-agent.zip && cd character-video-agent
bash setup.sh      # one time: installs everything + downloads ~9 GB of models
./start.sh         # then open http://localhost:7860
```
After setup it runs fully offline.

## Long videos and time limit
**Finish within** (5/10/20/30 min or no limit) caps how long a video takes to make. The app times the first
part, makes as many new 2-second parts as fit, then fills the rest of the length by replaying them forward/backward
with crossfades. With **No limit**, every part is new.

## Speed (rough estimates, not measured)
| | RTX 2050 4 GB (384 px) | Colab T4 16 GB (512 px) |
|---|---|---|
| "fast" (4-step Lightning), per 2-sec part | ~30 s | ~5-10 s |
| "standard" (25 steps), per 2-sec part | ~2.5 min | ~30 s |
| 2-min video, "fast" (60 parts) | ~30 min | ~5-10 min |
| Animate my photo, any length | under a minute | seconds |
| Voice / lip-sync | +10 s / +20 s per 5 s of speech | faster |

## Code layout
- `app/agent.py` - prompt agent (rule-based; optional local Ollama rewrite)
- `app/generator.py` - AnimateDiff (DreamShaper-8 base; Lightning 4-step or classic motion adapter), segments, IP-Adapter
- `app/photo.py` - photo upload + still-photo animation
- `app/audio.py` - Kokoro TTS, Wav2Lip lip-sync, ffmpeg mux
- `app/main.py` - FastAPI server and job queue. `CVA_OUTPUTS` sets the output folder, `CVA_MAX_SECONDS` the max length.
- `static/` - web UI
- `colab/` - Colab notebook (regenerate with `python tools/make_notebook.py`)
- `download_models.py`, `setup.sh`, `start.sh`

## Licenses
Model licenses: AnimateDiff and IP-Adapter are Apache-2.0, DreamShaper is CreativeML OpenRAIL-M, Kokoro is Apache-2.0.
**Wav2Lip (lip-sync) is for non-commercial / research use only.** For commercial work, turn off lip-sync.
