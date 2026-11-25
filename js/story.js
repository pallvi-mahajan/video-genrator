// Story reel: paste a story script (or a one-line idea) -> AI pictures per scene -> voices -> animated reel.
import { VOICES, chime, scheduleMusic, speakLines } from "./audio.js";

const $ = (id) => document.getElementById(id);
const IMG_API = "https://image.pollinations.ai/prompt/";
const TEXT_API = "https://text.pollinations.ai/";
const FREE_GAP_MS = 46_000; // free image service: 1 picture per 45 s per visitor
const FADE = 0.7;

export const STYLES = {
  pixar: "3D Pixar style animated movie still, adorable characters, big expressive eyes, highly detailed, vibrant colours, soft cinematic lighting",
  disney: "Disney animation style, magical storybook illustration, beautiful lighting, vibrant colours, highly detailed",
  anime: "anime style, Studio Ghibli inspired, beautiful detailed background, soft colours",
  watercolor: "children's book watercolour illustration, soft pastel colours, whimsical, cute",
  clay: "claymation style, cute clay characters, soft studio lighting, colourful",
};
const STYLE_LABELS = { pixar: "3D Pixar style", disney: "Disney storybook", anime: "Anime / Ghibli", watercolor: "Watercolour storybook", clay: "Clay animation" };
const FORMATS = { "9:16": [720, 1280, 576, 1024], "16:9": [1280, 720, 1024, 576], "1:1": [720, 720, 768, 768] };

export const EXAMPLE = `# Lily and the Lost Little Star

### Scene 1 - The Mysterious Light (0-10 seconds)
**Visual prompt:**
A beautiful enchanted forest at twilight. A little girl named Lily, with long wavy chestnut hair, big brown eyes, a pink dress, white shoes and a purple backpack, walks along a glowing forest path. Colourful butterflies fly around her.
**Narration:**
"Once upon a time, in a magical forest, lived a little girl named Lily. One evening, she discovered something sparkling in the bushes!"
**Dialogue:**
Lily: "Oh! What is that beautiful light?"
**Sound:** Gentle magical music, soft sparkling sound.

### Scene 2 - Meeting Twinkle (10-20 seconds)
**Visual prompt:**
Lily kneels and discovers a tiny golden five-pointed star named Twinkle with big blue eyes and a cute smiling face, floating just above the ground.
**Dialogue:**
Twinkle: "Hello! My name is Twinkle. I fell from the sky, and now I can't fly home!"
Lily: "Don't worry! I'll help you!"
**Sound:** Magical twinkling sound.

**Ending text:**
"The End"`;

// ---------------------------------------------------------------- script parsing ("agent")
const clean = (s) => s.replace(/\*\*|__|`/g, "").replace(/^[#>\-\s]+/, "").trim();
const unquote = (s) => s.trim().replace(/^["“”']+|["“”']+$/g, "").trim();

export function parseScript(text) {
  const out = { title: "", ending: "", scenes: [] };
  let scene = null;
  let field = null;
  const fieldOf = (l) => {
    const m = l.match(/^(visual prompt|visual|scene description|image|picture|narration|narrator|dialogue|dialog|sound|music|ending text|ending)\s*:\s*(.*)$/i);
    if (!m) return null;
    const k = m[1].toLowerCase();
    const f = k.startsWith("visual") || k === "scene description" || k === "image" || k === "picture" ? "visual"
      : k.startsWith("narrat") ? "narration" : k.startsWith("dialog") ? "dialogue" : k.startsWith("ending") ? "ending" : "sound";
    return [f, m[2]];
  };
  const add = (f, value) => {
    if (!value) return;
    if (f === "ending") return void (out.ending = unquote(value));
    if (!scene) return;
    if (f === "visual") scene.visual += (scene.visual ? " " : "") + value;
    else if (f === "sound") scene.sound += " " + value;
    else if (f === "narration") scene.lines.push({ speaker: "Narrator", text: unquote(value) });
    else {
      const m = value.match(/^([A-Z][\w' .-]{0,30}?)\s*(?:\([^)]*\))?\s*:\s*(.+)$/);
      if (m) scene.lines.push({ speaker: m[1].trim(), text: unquote(m[2]) });
      else if (scene.lines.length) scene.lines[scene.lines.length - 1].text += " " + unquote(value);
    }
  };
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    if (/^#\s/.test(raw.trim()) && !out.title && !scene) {
      out.title = clean(raw);
      continue;
    }
    const l = clean(raw);
    if (/^scene\s*\d+/i.test(l)) {
      const tm = l.match(/\((\d+)\s*[–-]\s*(\d+)\s*sec/i);
      scene = { heading: l, visual: "", lines: [], sound: "", minDur: tm ? +tm[2] - +tm[1] : 0 };
      out.scenes.push(scene);
      field = "visual";
      continue;
    }
    const f = fieldOf(l);
    if (f) {
      field = f[0];
      add(field, f[1].trim());
      continue;
    }
    if (field === "dialogue" && /^[A-Z][\w' .-]{0,30}?\s*(\([^)]*\))?\s*:/.test(l)) add("dialogue", l);
    else if (field) add(field, l);
  }
  out.scenes = out.scenes.filter((s) => s.visual || s.lines.length);
  return out.scenes.length ? out : null;
}

/** Turns a short idea into a scene script with the free text AI; falls back to a simple split. */
async function writeScript(idea, nScenes = 6) {
  const ask = `Write a short animated kids story script for this idea: "${idea}". Use exactly ${nScenes} scenes. ` +
    "Format each scene exactly like this:\n### Scene N - Title\nVisual prompt: (one detailed sentence describing the picture, " +
    "always re-describe each character's look)\nNarration: \"...\"\nDialogue:\nName: \"...\"\nSound: ...\n" +
    "Start with '# Story title' and end with 'Ending text: \"The End\"'. Keep every line short and child friendly.";
  try {
    const r = await fetch(TEXT_API + encodeURIComponent(ask) + "?seed=" + Math.floor(Math.random() * 1e6));
    if (r.ok) {
      const parsed = parseScript(await r.text());
      if (parsed) return parsed;
    }
  } catch (e) {
    console.warn("text AI failed", e);
  }
  const sentences = idea.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) || [idea];
  return { title: "", ending: "The End", scenes: sentences.map((s) => ({ heading: "", visual: s, lines: [{ speaker: "Narrator", text: s }], sound: "", minDur: 0 })) };
}

// ---------------------------------------------------------------- cast & voices
const FEMALE = ["af_bella", "af_nicole", "af_sarah", "bf_emma"];
const MALE = ["am_puck", "am_michael", "am_fenrir", "bm_george"];

function castOf(story) {
  const names = [...new Set(story.scenes.flatMap((s) => s.lines.map((l) => l.speaker)).filter((n) => n !== "Narrator"))];
  const allVisual = story.scenes.map((s) => s.visual).join(" ");
  let f = 0, m = 0;
  return names.map((name) => {
    const sentence = allVisual.match(new RegExp(`[^.]*\\b${name}\\b[^.]*\\.`, "i"))?.[0] || "";
    const male = /\b(boy|man|king|prince|father|dad|brother|he|his|grandpa|uncle)\b/i.test(sentence);
    const voice = male ? MALE[m++ % MALE.length] : FEMALE[f++ % FEMALE.length];
    return { name, look: sentence.trim(), voice, speed: 1.05 };
  });
}

function moodOf(sound) {
  const s = sound.toLowerCase();
  return /lullaby|magic|sparkl|twinkl|enchant|fairy/.test(s) ? "magical" : /cheer|adventure|happy|fun|joy|upbeat/.test(s) ? "happy"
    : /emotion|sad|soft|gentle|calm/.test(s) ? "calm" : /orchestr|epic|battle|dramatic/.test(s) ? "epic" : "";
}

// ---------------------------------------------------------------- free AI pictures
let lastImageAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadBlobImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

const BLOCKED = "Your internet connection (e.g. an office network) blocks the free AI picture service " +
  "(pollinations.ai). Try a home Wi-Fi or mobile hotspot, or upload your own pictures.";
let networkFails = 0;

async function aiPicture(prompt, w, h, seed, onWait) {
  const url = `${IMG_API}${encodeURIComponent(prompt.slice(0, 1400))}?width=${w}&height=${h}&seed=${seed}&nologo=true`;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (networkFails >= 3) throw new Error(BLOCKED);
    const wait = lastImageAt + FREE_GAP_MS - Date.now();
    for (let s = Math.ceil(wait / 1000); s > 0; s--) {
      onWait?.(s);
      await sleep(1000);
    }
    lastImageAt = Date.now();
    try {
      const r = await fetch(url);
      networkFails = 0;
      if (r.ok && (r.headers.get("content-type") || "").startsWith("image")) return loadBlobImage(await r.blob());
      const body = await r.text();
      const after = +(r.headers.get("retry-after") || body.match(/retry after (\d+)/i)?.[1] || 15);
      lastImageAt = Date.now() + after * 1000 - FREE_GAP_MS;
    } catch (e) {
      console.warn("picture failed, retrying", e);
      networkFails++;
      lastImageAt = Date.now() - FREE_GAP_MS + 5_000;
    }
  }
  throw new Error("The free picture service is busy. Try again in a few minutes, or upload your own picture for this scene.");
}

// ---------------------------------------------------------------- state + UI
const story = { data: null, cast: [], pictures: [], jobId: 0, busy: false };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function promptFor(i) {
  const s = story.data.scenes[i];
  const notes = story.cast.filter((c) => c.look && new RegExp(`\\b${c.name}\\b`, "i").test(s.visual) && !s.visual.includes(c.look))
    .map((c) => c.look).join(" ");
  return `${STYLES[$("st_style").value]}. ${s.visual} ${notes}`.trim();
}

function renderCast() {
  const opts = (sel) => Object.entries(VOICES).map(([v, l]) => `<option value="${v}" ${v === sel ? "selected" : ""}>${l}</option>`).join("");
  $("st_cast").innerHTML = story.cast.map((c, i) =>
    `<label>${esc(c.name)} <select data-cast="${i}">${opts(c.voice)}</select></label>`).join("") ||
    `<p class="hint">No speaking characters found. Only the narrator will speak.</p>`;
  $("st_cast").querySelectorAll("select").forEach((el) => el.addEventListener("change", () => {
    story.cast[+el.dataset.cast].voice = el.value;
  }));
}

function renderScenes() {
  $("st_scenes").innerHTML = story.data.scenes.map((s, i) => `
    <div class="scene-card" data-i="${i}">
      <div class="thumb" id="st_thumb_${i}"><span>Scene ${i + 1}</span></div>
      <div class="scene-body">
        <b>${esc(s.heading || `Scene ${i + 1}`)}</b>
        <textarea rows="3" data-visual="${i}">${esc(s.visual)}</textarea>
        <div class="lines">${s.lines.map((l) => `<div><b>${esc(l.speaker)}:</b> ${esc(l.text)}</div>`).join("") || "<i>(no speech)</i>"}</div>
        <div class="scene-actions">
          <button type="button" class="secondary small" data-regen="${i}">New picture</button>
          <label class="small-upload">Upload my picture<input type="file" accept="image/*" data-upload="${i}" /></label>
          <span class="hint" id="st_pstatus_${i}"></span>
        </div>
      </div>
    </div>`).join("");
  $("st_scenes").querySelectorAll("[data-visual]").forEach((el) => el.addEventListener("input", () => {
    story.data.scenes[+el.dataset.visual].visual = el.value;
  }));
  $("st_scenes").querySelectorAll("[data-regen]").forEach((el) => el.addEventListener("click", () => {
    story.pictures[+el.dataset.regen] = null;
    story.seedBump = (story.seedBump || 0) + 1;
    paintAll();
  }));
  $("st_scenes").querySelectorAll("[data-upload]").forEach((el) => el.addEventListener("change", async () => {
    const i = +el.dataset.upload;
    if (!el.files[0]) return;
    story.pictures[i] = await loadBlobImage(el.files[0]);
    showThumb(i);
  }));
}

function showThumb(i) {
  const img = story.pictures[i];
  const box = $(`st_thumb_${i}`);
  if (!box) return;
  box.innerHTML = img ? "" : `<span>Scene ${i + 1}</span>`;
  if (img) {
    box.appendChild(img.cloneNode());
    $(`st_pstatus_${i}`).textContent = "";
  }
  updateReady();
}

async function paintAll() {
  if ($("st_source").value !== "ai") return;
  const job = ++story.jobId;
  const [, , w, h] = FORMATS[$("st_format").value];
  const seed = (+$("st_seed").value || 7) + (story.seedBump || 0);
  for (let i = 0; i < story.data.scenes.length; i++) {
    if (story.pictures[i] || job !== story.jobId) continue;
    const st = $(`st_pstatus_${i}`);
    st.textContent = "Painting...";
    try {
      story.pictures[i] = await aiPicture(promptFor(i), w, h, seed, (s) => {
        st.textContent = `Waiting ${s}s (free service: 1 picture every 45 s)...`;
      });
      if (job !== story.jobId) return;
      st.textContent = "";
      showThumb(i);
    } catch (e) {
      st.textContent = e.message;
      if (e.message === BLOCKED) {
        $("st_ready").textContent = BLOCKED;
        return;
      }
    }
  }
  updateReady();
}

function updateReady() {
  const missing = story.data ? story.data.scenes.filter((_, i) => !story.pictures[i]).length : 1;
  $("st_preview").disabled = $("st_record").disabled = !story.data || missing > 0 || story.busy;
  $("st_ready").textContent = !story.data ? "" : missing ? `${missing} picture(s) still being made...` : "All pictures ready. Press Preview or Make video.";
}

async function prepare() {
  const text = $("st_script").value.trim();
  if (!text) return alert("Please paste a story script or type a story idea.");
  $("st_prepare").disabled = true;
  $("st_ready").textContent = "Reading your story...";
  story.data = parseScript(text) || (await writeScript(text, +$("st_count").value || 6));
  story.cast = castOf(story.data);
  story.pictures = story.data.scenes.map(() => null);
  story.seedBump = 0;
  $("st_title").value = story.data.title || "";
  $("st_end").value = story.data.ending || "";
  $("st_plan").classList.remove("hidden");
  renderCast();
  renderScenes();
  $("st_prepare").disabled = false;
  updateReady();
  if ($("st_source").value === "ai") paintAll();
  else $("st_ready").textContent = "Upload one picture for each scene below.";
}

// ---------------------------------------------------------------- rendering
function rnd(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
const r = rnd(9);
const SPARKS = Array.from({ length: 70 }, () => [r(), r(), r() * 2 + 1, r() * 6, r() * 0.5 + 0.3]);

function drawCover(ctx, img, W, H, move, p) {
  const base = Math.max(W / img.width, H / img.height);
  const z = { in: 1.05 + 0.15 * p, out: 1.2 - 0.15 * p }[move] || 1.14;
  const s = base * z;
  const dw = img.width * s, dh = img.height * s;
  const px = move === "left" ? 0.5 + 0.4 * (0.5 - p) : move === "right" ? 0.5 + 0.4 * (p - 0.5) : 0.5;
  const py = move === "up" ? 0.6 - 0.2 * p : 0.5;
  ctx.drawImage(img, (W - dw) * px, (H - dh) * py, dw, dh);
}

function sparkles(ctx, W, H, t) {
  for (const [x, y, sz, ph, sp] of SPARKS) {
    const yy = ((y - t * 0.03 * sp) % 1 + 1) % 1;
    const a = 0.25 + 0.75 * Math.abs(Math.sin(t * 2 + ph));
    ctx.globalAlpha = a * 0.8;
    ctx.fillStyle = "#fff3b0";
    ctx.beginPath();
    ctx.arc(x * W + Math.sin(t + ph) * 10, yy * H, sz * (W / 720), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function caption(ctx, cue, W, H) {
  const size = Math.round(Math.min(W, H) * 0.05);
  ctx.font = `700 ${size}px "Trebuchet MS", system-ui, sans-serif`;
  ctx.textAlign = "center";
  const words = cue.text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    if (ctx.measureText(line + " " + w).width > W * 0.84 && line) {
      lines.push(line);
      line = w;
    } else line = line ? line + " " + w : w;
  }
  lines.push(line);
  const shown = lines.slice(0, 3);
  const boxH = size * 1.25 * shown.length + size * (cue.speaker !== "Narrator" ? 1.6 : 0.8);
  const y0 = H * (H > W ? 0.8 : 0.84) - boxH / 2;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.roundRect(W * 0.05, y0, W * 0.9, boxH, size * 0.5);
  ctx.fill();
  let y = y0 + size * 1.1;
  if (cue.speaker !== "Narrator") {
    ctx.font = `800 ${Math.round(size * 0.8)}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.fillStyle = "#ffd65a";
    ctx.fillText(cue.speaker, W / 2, y);
    y += size * 1.05;
    ctx.font = `700 ${size}px "Trebuchet MS", system-ui, sans-serif`;
  }
  ctx.fillStyle = "#fff";
  for (const l of shown) {
    ctx.fillText(l, W / 2, y);
    y += size * 1.25;
  }
}

function bigText(ctx, text, W, H, alpha, y = 0.18) {
  if (!text || alpha <= 0) return;
  const size = Math.round(Math.min(W, H) * 0.085);
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.font = `900 ${size}px "Trebuchet MS", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = "rgba(60,20,90,0.9)";
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    if (ctx.measureText(line + " " + w).width > W * 0.88 && line) {
      lines.push(line);
      line = w;
    } else line = line ? line + " " + w : w;
  }
  lines.push(line);
  lines.forEach((l, i) => {
    const yy = H * y + i * size * 1.1;
    ctx.strokeText(l, W / 2, yy);
    ctx.fillStyle = "#fff6c9";
    ctx.fillText(l, W / 2, yy);
  });
  ctx.globalAlpha = 1;
}

const MOVES = ["in", "right", "out", "left", "up"];

function drawStory(ctx, tl, t, W, H) {
  const idx = tl.scenes.findIndex((s) => t < s.start + s.dur);
  const sc = tl.scenes[idx === -1 ? tl.scenes.length - 1 : idx];
  const local = (sc_, tt) => Math.min(1, Math.max(0, (tt - sc_.start) / sc_.dur));
  drawCover(ctx, sc.img, W, H, sc.move, local(sc, t));
  const next = tl.scenes[tl.scenes.indexOf(sc) + 1];
  const fadeIn = next ? (t - (sc.start + sc.dur - FADE)) / FADE : 0;
  if (next && fadeIn > 0) {
    ctx.globalAlpha = Math.min(1, fadeIn);
    drawCover(ctx, next.img, W, H, next.move, 0);
    ctx.globalAlpha = 1;
  }
  if (tl.sparkles) sparkles(ctx, W, H, t);
  const cue = tl.cues.find((c) => t >= c.start && t <= c.end + 0.15);
  if (cue && tl.captions) caption(ctx, cue, W, H);
  if (t < 3.2) bigText(ctx, tl.title, W, H, t < 2.5 ? Math.min(1, t * 2) : (3.2 - t) / 0.7);
  if (t > tl.total - 3) bigText(ctx, tl.ending, W, H, (t - (tl.total - 3)) * 1.5, 0.42);
}

async function buildTimeline(ac) {
  const voiceOf = (speaker) => {
    if (speaker === "Narrator") return { voice: $("st_narrator").value, speed: 0.95 };
    const c = story.cast.find((x) => x.name === speaker);
    return { voice: c?.voice || "af_bella", speed: c?.speed || 1.05 };
  };
  const key = JSON.stringify([story.data.scenes.map((s) => s.lines), story.cast.map((c) => c.voice), $("st_narrator").value]);
  if (story.audioKey !== key) {
    story.audio = [];
    for (let i = 0; i < story.data.scenes.length; i++) {
      const lines = story.data.scenes[i].lines;
      story.audio[i] = lines.length ? await speakLines(lines, voiceOf, (m) => setStatus(`Scene ${i + 1}: ${m}`)) : null;
    }
    story.audioKey = key;
  }
  const [W, H] = FORMATS[$("st_format").value];
  const scenes = [];
  const cues = [];
  let start = 0;
  const minScene = +$("st_min").value || 4;
  story.data.scenes.forEach((s, i) => {
    const a = story.audio[i];
    const speech = a ? a.samples.length / a.rate : 0;
    const dur = Math.max(minScene, speech + 0.6, $("st_use_timing").checked ? s.minDur : 0) + (i === story.data.scenes.length - 1 ? 2.5 : 0);
    let buffer = null;
    if (a) {
      buffer = ac.createBuffer(1, a.samples.length, a.rate);
      buffer.copyToChannel(a.samples, 0);
      a.cues.forEach((c) => cues.push({ ...c, start: c.start + start, end: c.end + start }));
    }
    scenes.push({ img: story.pictures[i], start, dur, buffer, mood: moodOf(s.sound), sparkle: /sparkl|twinkl|chime|magic/i.test(s.sound + s.visual), move: MOVES[i % MOVES.length] });
    start += dur;
  });
  return { W, H, scenes, cues, total: start, title: $("st_title").value.trim(), ending: $("st_end").value.trim(),
    captions: $("st_captions").checked, sparkles: $("st_sparkles").checked };
}

function setStatus(msg, prog = null, error = false) {
  $("status").textContent = msg;
  $("status").classList.toggle("error", error);
  if (prog !== null) $("fill").style.width = `${Math.round(prog * 100)}%`;
}

function pickMime() {
  return ["video/mp4;codecs=avc1.42E01F,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus", "video/webm"].find((m) => window.MediaRecorder?.isTypeSupported(m)) || "";
}

async function play(record) {
  if (story.busy || window.__cvRunning) return;
  story.busy = window.__cvRunning = true;
  updateReady();
  $("result").classList.add("hidden");
  const ac = new AudioContext();
  let tl;
  try {
    tl = await buildTimeline(ac);
  } catch (e) {
    console.error(e);
    setStatus("Could not create the voices: " + e.message, 0, true);
    story.busy = window.__cvRunning = false;
    updateReady();
    ac.close();
    return;
  }
  const canvas = $("stage");
  canvas.width = tl.W;
  canvas.height = tl.H;
  const ctx = canvas.getContext("2d");
  const master = ac.createGain();
  const dest = ac.createMediaStreamDestination();
  master.connect(ac.destination);
  master.connect(dest);
  const t0 = ac.currentTime + 0.2;
  const musicGain = ac.createGain();
  musicGain.gain.value = 0.55;
  musicGain.connect(master);
  const globalMood = $("st_music").value;
  for (const s of tl.scenes) {
    if (s.buffer) {
      const src = ac.createBufferSource();
      src.buffer = s.buffer;
      src.connect(master);
      src.start(t0 + s.start);
    }
    const mood = globalMood === "auto" ? s.mood || "magical" : globalMood;
    if (mood !== "none") scheduleMusic(ac, musicGain, mood, t0 + s.start, s.dur);
    if (s.sparkle && $("st_sfx").checked) chime(ac, master, t0 + s.start + 0.3);
  }
  let recorder = null;
  const chunks = [];
  if (record) {
    const stream = canvas.captureStream(30);
    dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    recorder = new MediaRecorder(stream, { mimeType: pickMime(), videoBitsPerSecond: 6_000_000 });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.start(1000);
  }
  const fmt = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}`;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    story.busy = window.__cvRunning = false;
    $("stop_btn").onclick = null;
    ac.close();
    updateReady();
    if (!recorder) return setStatus("Preview finished.", 1);
    recorder.onstop = () => {
      const type = recorder.mimeType || "video/webm";
      const blob = new Blob(chunks, { type });
      const url = URL.createObjectURL(blob);
      const ext = type.includes("mp4") ? "mp4" : "webm";
      const name = (tl.title || "story").replace(/[^\w -]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "story";
      $("result_video").src = url;
      $("download").href = url;
      $("download").download = `${name}.${ext}`;
      $("download").textContent = `Download video (${ext.toUpperCase()}, ${(blob.size / 1e6).toFixed(1)} MB)`;
      $("result").classList.remove("hidden");
      setStatus("Done! Your story video is ready below.", 1);
    };
    recorder.stop();
  };
  $("stop_btn").disabled = false;
  $("stop_btn").onclick = stop;
  const loop = () => {
    if (stopped) return;
    const t = Math.max(0, ac.currentTime - t0);
    drawStory(ctx, tl, Math.min(t, tl.total - 0.01), tl.W, tl.H);
    setStatus(`${record ? "Recording" : "Preview"} ${fmt(t)} / ${fmt(tl.total)}` + (record ? " - keep this tab open and visible" : ""), t / tl.total);
    if (t >= tl.total) return stop();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- wiring
export function initStory() {
  $("st_style").innerHTML = Object.entries(STYLE_LABELS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
  $("st_narrator").innerHTML = Object.entries(VOICES).map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
  $("st_narrator").value = "af_heart";
  $("st_example").addEventListener("click", () => ($("st_script").value = EXAMPLE));
  $("st_prepare").addEventListener("click", prepare);
  $("st_preview").addEventListener("click", () => play(false));
  $("st_record").addEventListener("click", () => play(true));
  $("st_style").addEventListener("change", () => {
    if (!story.data || $("st_source").value !== "ai") return;
    story.pictures = story.data.scenes.map(() => null);
    story.data.scenes.forEach((_, i) => showThumb(i));
    paintAll();
  });
  $("st_narrator").addEventListener("change", renderCast);
  updateReady();
  const c = $("stage");
  [c.width, c.height] = [720, 1280];
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 1280);
  g.addColorStop(0, "#2a1f5c");
  g.addColorStop(1, "#0f1117");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 720, 1280);
  sparkles(ctx, 720, 1280, 1);
  bigText(ctx, "Your story reel appears here", 720, 1280, 1, 0.45);
}
