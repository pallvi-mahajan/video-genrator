// Runs the Kokoro voice model in a background thread so the page never freezes while voices are created.
import { KokoroTTS } from "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";

let tts = null;

self.onmessage = async ({ data }) => {
  try {
    if (!tts) {
      tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: "q8",
        device: "wasm",
        progress_callback: (e) => e.status === "progress" && e.file?.endsWith(".onnx") && self.postMessage({ progress: e.progress / 100 }),
      });
    }
    if (data.warmup) return self.postMessage({ id: data.id, ready: true });
    const out = await tts.generate(data.text, { voice: data.voice, speed: data.speed });
    const audio = out.audio;
    self.postMessage({ id: data.id, audio, rate: out.sampling_rate }, [audio.buffer]);
  } catch (e) {
    self.postMessage({ id: data.id, error: String(e?.message || e) });
  }
};
