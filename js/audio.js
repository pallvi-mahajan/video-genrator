// Voice (Kokoro TTS running in the browser), mouth-movement envelope and simple background music.

const KOKORO_URL = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const GAP = 0.25; // seconds of silence between sentences

export const VOICES = {
  af_heart: "Female - warm (US)",
  af_bella: "Female - bright (US)",
  af_nicole: "Female - soft (US)",
  af_sarah: "Female - calm (US)",
  am_michael: "Male - deep (US)",
  am_fenrir: "Male - strong (US)",
  am_puck: "Male - playful (US)",
  bf_emma: "Female (British)",
  bm_george: "Male (British)",
  bm_fable: "Male - storyteller (British)",
};

let ttsPromise = null;
let worker = null;
let workerProgress = null;
const pending = new Map();
let nextId = 1;

/** Voice model in a background Web Worker (page stays responsive). Same API as KokoroTTS: generate(text, {voice, speed}). */
function workerTTS(onProgress) {
  workerProgress = onProgress;
  if (!worker) {
    worker = new Worker(new URL("./ttsworker.js?v=14", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      if (data.progress !== undefined) return workerProgress?.(data.progress);
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      data.error ? p.reject(new Error(data.error)) : p.resolve(data);
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || "voice worker failed"));
      pending.clear();
    };
  }
  const call = (msg) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...msg, id });
  });
  return call({ warmup: true }).then(() => ({
    generate: (text, { voice, speed }) => call({ text, voice, speed }).then((d) => ({ audio: d.audio, sampling_rate: d.rate })),
  }));
}

export function loadTTS(onProgress) {
  ttsPromise ??= workerTTS(onProgress).catch((err) => {
    console.warn("voice worker unavailable, using the page thread", err);
    worker?.terminate();
    worker = null;
    return mainThreadTTS(onProgress);
  }).catch((err) => {
    ttsPromise = null;
    throw err;
  });
  return ttsPromise;
}

function mainThreadTTS(onProgress) {
  return import(KOKORO_URL).then(({ KokoroTTS }) =>
    KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: "q8",
      device: "wasm",
      progress_callback: (e) => e.status === "progress" && e.file?.endsWith(".onnx") && onProgress?.(e.progress / 100),
    }),
  );
}

export function splitSentences(text) {
  const parts = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]*/g) || [];
  const out = [];
  for (let p of parts.map((s) => s.trim()).filter(Boolean)) {
    while (p.length > 220) { // very long sentences: break at a comma or space
      let cut = p.lastIndexOf(",", 220);
      if (cut < 80) cut = p.lastIndexOf(" ", 220);
      if (cut < 1) cut = 220;
      out.push(p.slice(0, cut + 1).trim());
      p = p.slice(cut + 1).trim();
    }
    if (p) out.push(p);
  }
  return out;
}

/** Returns { samples: Float32Array, rate, cues: [{start, end, text}] } */
export async function synthesize(text, voice, speed, onProgress) {
  const tts = await loadTTS((p) => onProgress?.(`Downloading voice model (one time, ~90 MB)... ${Math.round(p * 100)}%`));
  const sentences = splitSentences(text);
  const chunks = [];
  const cues = [];
  let rate = 24000;
  let time = GAP;
  for (let i = 0; i < sentences.length; i++) {
    onProgress?.(`Creating voice... sentence ${i + 1} of ${sentences.length}`);
    const audio = await tts.generate(sentences[i], { voice, speed });
    rate = audio.sampling_rate;
    const dur = audio.audio.length / rate;
    cues.push({ start: time, end: time + dur, text: sentences[i] });
    chunks.push(audio.audio);
    time += dur + GAP;
  }
  const gap = Math.round(GAP * rate);
  const total = chunks.reduce((n, c) => n + c.length + gap, gap);
  const samples = new Float32Array(total);
  let off = gap;
  for (const c of chunks) {
    samples.set(c, off);
    off += c.length + gap;
  }
  return { samples, rate, cues };
}

/** Speaks script lines ({speaker, text}) with a voice per speaker. Returns { samples, rate, cues } like synthesize(). */
export async function speakLines(lines, voiceFor, onProgress) {
  const tts = await loadTTS((p) => onProgress?.(`Downloading voice model (one time, ~90 MB)... ${Math.round(p * 100)}%`));
  const parts = [];
  for (const line of lines) for (const text of splitSentences(line.text)) parts.push({ ...line, text });
  const chunks = [];
  const cues = [];
  let rate = 24000;
  let time = 0.3;
  for (let i = 0; i < parts.length; i++) {
    onProgress?.(`Creating voices... line ${i + 1} of ${parts.length}`);
    const { voice, speed } = voiceFor(parts[i].speaker);
    const audio = await tts.generate(parts[i].text, { voice, speed });
    rate = audio.sampling_rate;
    const dur = audio.audio.length / rate;
    cues.push({ start: time, end: time + dur, text: parts[i].text, speaker: parts[i].speaker });
    chunks.push([time, audio.audio]);
    time += dur + (parts[i + 1]?.speaker === parts[i].speaker ? 0.2 : 0.45);
  }
  const samples = new Float32Array(Math.ceil((time + 0.3) * rate));
  for (const [start, data] of chunks) samples.set(data, Math.round(start * rate));
  return { samples, rate, cues };
}

/** A short "magic sparkle" sound effect at time t. */
export function chime(ctx, out, t) {
  [88, 91, 95, 100, 103].forEach((n, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 440 * 2 ** ((n - 69) / 12);
    const s = t + i * 0.07;
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(0.05, s + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.6);
    o.connect(g).connect(out);
    o.start(s);
    o.stop(s + 0.65);
  });
}

/** Mouth openness (0..1) sampled `fps` times per second, from the loudness of the audio. */
export function envelope(buffer, fps = 60) {
  const data = buffer.getChannelData(0);
  const win = Math.floor(buffer.sampleRate / fps);
  const n = Math.ceil(data.length / win);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const end = Math.min(data.length, (i + 1) * win);
    for (let j = i * win; j < end; j++) sum += data[j] * data[j];
    env[i] = Math.sqrt(sum / Math.max(1, end - i * win));
  }
  const sorted = Array.from(env).filter((v) => v > 0.005).sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.9)] || 1;
  let prev = 0;
  for (let i = 0; i < n; i++) { // normalise + smooth so the mouth doesn't flicker
    const v = Math.min(1, Math.max(0, (env[i] / ref - 0.12) / 0.88));
    prev = v > prev ? prev * 0.35 + v * 0.65 : prev * 0.7 + v * 0.3;
    env[i] = prev;
  }
  return env;
}

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);
const MOODS = {
  happy: { chords: [[60, 64, 67], [67, 71, 74], [69, 72, 76], [65, 69, 72]], beat: 0.5, wave: "triangle" },
  calm: { chords: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]], beat: 1.0, wave: "sine" },
  epic: { chords: [[50, 57, 62], [46, 53, 58], [48, 55, 60], [45, 52, 57]], beat: 0.5, wave: "sawtooth" },
  magical: { chords: [[65, 69, 72], [62, 65, 69], [67, 71, 74], [64, 67, 72]], beat: 0.75, wave: "sine" },
};
export const MUSIC = { none: "None", happy: "Happy", calm: "Calm", magical: "Magical", epic: "Epic" };

/** Schedules simple chord + arpeggio music from `start` for `duration` seconds into `out`. */
export function scheduleMusic(ctx, out, mood, start, duration) {
  const m = MOODS[mood];
  if (!m) return;
  const bar = m.beat * 4;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = mood === "epic" ? 1400 : 2200;
  filter.connect(out);
  const note = (freq, t, len, vol, type) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(filter);
    o.start(t);
    o.stop(t + len + 0.05);
  };
  for (let b = 0; b * bar < duration; b++) {
    const t0 = start + b * bar;
    const chord = m.chords[b % m.chords.length];
    chord.forEach((n) => note(NOTE(n), t0, bar, 0.035, m.wave));
    note(NOTE(chord[0] - 24), t0, bar * 0.9, 0.06, "sine");
    for (let k = 0; k < 8 && t0 + k * m.beat * 0.5 < start + duration; k++)
      note(NOTE(chord[k % 3] + 12), t0 + k * m.beat * 0.5, m.beat * 0.45, 0.025, "sine");
  }
}
