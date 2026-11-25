# Character Video Maker

**Website: https://pallvi-mahajan.github.io/video-genrator/**

Make talking character videos for free, right in your browser: no login, no credits, no server, no GPU needed.

- Characters: robot, cat, girl, boy, alien (any colour), or **upload your own picture** (photo, drawing, cartoon, pet).
  Show it as a talking photo, or as a character standing in a scene that dances, waves, jumps and walks
  (plain backgrounds are removed automatically). Click the mouth so it moves when talking.
- Describe the video in plain words ("a happy robot dancing in the city at night") and the built-in agent
  picks the character, background, movement and music
- Backgrounds: sky, city at night, garden, room, space, beach, plain colour, or your own image
- Movements: talk, dance, wave, jump, walk. Camera: zoom / pan
- **Voice**: 10 natural AI voices (Kokoro-82M runs inside the browser), or upload your own audio
- Mouth moves with the voice, subtitles, background music
- Any length (seconds to 10 minutes), 16:9 / 9:16 / 1:1, download as MP4 (or WebM on some browsers)

Works best in **Chrome or Edge** on a computer. Recording is real time: a 3-minute video takes 3 minutes, and
the tab must stay open and visible.

## Files
- `index.html`, `style.css`, `js/` - the website (plain HTML/JS, hosted free on GitHub Pages)
- `full-ai-version/` - the full AI text-to-video app (AnimateDiff + Wav2Lip lip-sync). It needs an NVIDIA GPU,
  so it runs on your own PC or free Google Colab, not on GitHub Pages. See `full-ai-version/README.md`.

## Run the website locally
```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
