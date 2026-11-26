import { CHARACTERS, drawCharacter } from "./characters.js?v=17";
import { SCENES, drawScene } from "./scenes.js?v=17";
import { MUSIC, VOICES, envelope, scheduleMusic, synthesize } from "./audio.js?v=17";

const $ = (id) => document.getElementById(id);
const MOTIONS = { talk: "Talk / idle", dance: "Dance", wave: "Wave hello", jump: "Jump", walk: "Walk" };
const CAMERAS = { static: "Static", "zoom in": "Slow zoom in", "zoom out": "Slow zoom out", "pan left": "Pan left", "pan right": "Pan right" };
const FORMATS = { "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [720, 720] };

// ---------------------------------------------------------------- prompt "agent" (keyword based, runs offline)
const RULES = {
  character: [[/robot|android|\bbot\b|machine|cyborg/, "robot"], [/\bcat\b|kitten|kitty|tiger|lion/, "cat"],
    [/girl|woman|lady|princess|queen|mom|mother|sister|teacher/, "girl"],
    [/boy|\bman\b|guy|kid|prince|king|dad|father|brother|student/, "boy"], [/alien|monster|martian|creature/, "alien"]],
  scene: [[/city|street|night|neon|town|road/, "city"], [/garden|flower|park|forest|field|farm/, "garden"],
    [/room|house|home|office|class|school|kitchen|bedroom/, "room"], [/space|planet|star|galaxy|moon|rocket/, "space"],
    [/beach|sea|ocean|island|summer/, "beach"], [/sky|cloud|sun|day/, "sky"]],
  motion: [[/danc|party|celebrat|groov/, "dance"], [/wav|hello|\bhi\b|bye|greet|welcome/, "wave"],
    [/jump|hop|bounc|excit/, "jump"], [/walk|run|stroll|travel|go /, "walk"], [/talk|speak|say|tell|explain|story/, "talk"]],
  music: [[/danc|party|happy|fun|celebrat|birthday/, "happy"], [/calm|relax|sleep|story|peace/, "calm"],
    [/epic|battle|hero|adventure|space/, "epic"]],
};
const COLORS = { red: "#e74c3c", blue: "#4f8cff", green: "#3fb37f", yellow: "#f1c40f", pink: "#e85d9a",
  purple: "#9b59b6", orange: "#f39c12", black: "#3a3a48", white: "#e8e8f0", gold: "#d4a017", silver: "#b9c2d0" };

function agent(prompt) {
  const text = prompt.toLowerCase();
  const pick = (rules, fallback) => (rules.find(([re]) => re.test(text)) || [, fallback])[1];
  const color = Object.entries(COLORS).find(([name]) => new RegExp(`\\b${name}\\b`).test(text));
  return {
    character: pick(RULES.character, "robot"),
    scene: pick(RULES.scene, "sky"),
    motion: pick(RULES.motion, "talk"),
    music: pick(RULES.music, "none"),
    color: color?.[1],
  };
}

// ---------------------------------------------------------------- UI setup
function fill(el, entries, extra = []) {
  el.innerHTML = [...extra, ...Object.entries(entries)].map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
}
fill($("character"), Object.fromEntries(Object.entries(CHARACTERS).map(([k, v]) => [k, v.label])),
  [["auto", "Auto (from description)"]]);
fill($("scene"), SCENES, [["auto", "Auto (from description)"], ["image", "My own background image"]]);
fill($("motion"), MOTIONS, [["auto", "Auto (from description)"]]);
fill($("camera"), CAMERAS);
fill($("voice"), VOICES);
fill($("music"), MUSIC, [["auto", "Auto (from description)"]]);

const state = {
  photoSrc: null, // the uploaded picture
  photo: null, // the picture actually drawn (background removed when chosen)
  mouth: { x: 0.5, y: 0.68, w: 0.16 },
  bgImage: null,
  voiceCache: { key: "", data: null },
  running: null,
};

function settings() {
  const a = agent($("prompt").value);
  const choose = (id, auto) => ($(id).value === "auto" ? auto : $(id).value);
  const character = state.photoSrc ? "photo" : choose("character", a.character);
  return {
    character,
    photoStyle: $("photo_style").value,
    mouthOn: $("mouth_on").checked,
    scene: choose("scene", a.scene),
    motion: choose("motion", a.motion),
    music: choose("music", a.music),
    color: $("color_auto").checked ? a.color || CHARACTERS[character]?.color || "#4f8cff" : $("color").value,
    camera: $("camera").value,
    size: FORMATS[$("format").value],
    length: Math.max(1, Math.min(600, (+$("minutes").value || 0) * 60 + (+$("seconds").value || 0))),
    subtitles: $("subtitles").checked,
  };
}

function updateAgentInfo() {
  const s = settings();
  const photo = s.character === "photo";
  const full = photo && s.photoStyle === "full";
  const ch = photo ? "your picture" : CHARACTERS[s.character]?.label;
  const sc = full ? "" : ` · ${s.scene === "image" ? "your background" : SCENES[s.scene]}`;
  const mv = full ? "" : ` · ${MOTIONS[s.motion] || ""}`;
  $("agent_info").textContent = `Agent picked: ${ch}${sc}${mv} · music: ${MUSIC[s.music]}`;
  $("photo_box").classList.toggle("hidden", !photo);
  $("cartoon_box").classList.toggle("hidden", photo);
  $("cutout_opts").classList.toggle("hidden", full);
  $("scene_box").querySelector("label").classList.toggle("hidden", full);
  $("motion_box").classList.toggle("hidden", full);
  ["mouth_hint", "mouth_w_box"].forEach((id) => $(id).classList.toggle("hidden", !s.mouthOn));
  $("bg_image_box").classList.toggle("hidden", full || $("scene").value !== "image");
  $("bg_color_box").classList.toggle("hidden", full || s.scene !== "plain");
  $("color").disabled = $("color_auto").checked;
  if (!state.running && !window.__cvRunning && !document.body.classList.contains("story-mode"))
    drawFrame($("stage").getContext("2d"), s, 0.6, null);
}
document.querySelectorAll("input, select, textarea").forEach((el) => el.addEventListener("input", updateAgentInfo));
$("chips").addEventListener("click", (e) => {
  const s = +e.target.dataset.s;
  if (!s) return;
  $("minutes").value = Math.floor(s / 60);
  $("seconds").value = s % 60;
});

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** Makes the plain background around the character transparent (flood fill from the picture's edges). */
function removeBackground(img, tol) {
  const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  const w = (c.width = Math.round(img.width * scale));
  const h = (c.height = Math.round(img.height * scale));
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h);
  const p = d.data;
  const bg = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  const t2 = tol * tol;
  const near = (i, r, g, b) => p[i * 4 + 3] < 20 ||
    (p[i * 4] - r) ** 2 + (p[i * 4 + 1] - g) ** 2 + (p[i * 4 + 2] - b) ** 2 < t2;
  const seeds = [];
  for (let i = 0; i < w; i++) seeds.push(i, (h - 1) * w + i);
  for (let j = 0; j < h; j++) seeds.push(j * w, j * w + w - 1);
  for (const s of seeds) {
    if (bg[s]) continue;
    const r = p[s * 4], g = p[s * 4 + 1], b = p[s * 4 + 2];
    let head = 0, tail = 0;
    bg[s] = 1;
    queue[tail++] = s;
    while (head < tail) {
      const i = queue[head++];
      const px = i % w;
      for (const n of [px > 0 ? i - 1 : -1, px < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (n < 0 || n >= w * h || bg[n] || !near(n, r, g, b)) continue;
        bg[n] = 1;
        queue[tail++] = n;
      }
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (bg[i]) p[i * 4 + 3] = 0;
    else if (bg[i - 1] || bg[i + 1] || bg[i - w] || bg[i + w]) p[i * 4 + 3] = Math.min(p[i * 4 + 3], 140); // soft edge
  }
  x.putImageData(d, 0, 0);
  return c;
}

function processPhoto() {
  const img = state.photoSrc;
  if (!img) return;
  state.photo = $("photo_style").value === "cutout" && $("remove_bg").checked ? removeBackground(img, +$("bg_tol").value) : img;
  drawPhotoSetup();
}

$("photo").addEventListener("change", async () => {
  if (!$("photo").files[0]) return;
  state.photoSrc = await loadImage($("photo").files[0]);
  processPhoto();
  updateAgentInfo();
});
["photo_style", "remove_bg", "bg_tol"].forEach((id) => $(id).addEventListener("change", () => {
  processPhoto();
  updateAgentInfo();
}));
$("photo_clear").addEventListener("click", () => {
  state.photoSrc = state.photo = null;
  $("photo").value = "";
  updateAgentInfo();
});
$("bg_image").addEventListener("change", async () => {
  if ($("bg_image").files[0]) state.bgImage = await loadImage($("bg_image").files[0]);
  updateAgentInfo();
});
$("mouth_w").addEventListener("input", () => {
  state.mouth.w = +$("mouth_w").value;
  drawPhotoSetup();
});

function drawPhotoSetup() {
  const c = $("photo_setup");
  const img = state.photo;
  if (!img) return;
  const s = Math.min(320 / img.width, 320 / img.height);
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const { x, y, w } = state.mouth;
  ctx.strokeStyle = "#ff3b6b";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x * c.width, y * c.height, (w * c.width) / 2, (w * c.width) / 6, 0, 0, Math.PI * 2);
  ctx.stroke();
}
$("photo_setup").addEventListener("click", (e) => {
  const r = e.target.getBoundingClientRect();
  state.mouth.x = (e.clientX - r.left) / r.width;
  state.mouth.y = (e.clientY - r.top) / r.height;
  drawPhotoSetup();
});

// ---------------------------------------------------------------- animation
function pose(motion, t, mouth, talking) {
  const p = { t, mouth, blink: (t + 0.7) % 3.7 < 0.14 ? 1 : 0, jump: 0, squash: 0, lean: 0, tilt: 0, x: 0,
    leftArm: -0.22, rightArm: 0.22, leftLeg: 0, rightLeg: 0 };
  const w = Math.PI * 2;
  switch (motion) {
    case "dance": {
      const b = Math.sin(t * w);
      p.jump = Math.abs(Math.sin(t * w)) * 0.05;
      p.lean = Math.sin(t * w * 0.5) * 0.14;
      p.tilt = -p.lean * 0.6;
      p.leftArm = -1.6 - b * 0.9;
      p.rightArm = 1.6 - b * 0.9;
      p.leftLeg = b * 0.25;
      p.rightLeg = b * 0.25;
      break;
    }
    case "wave":
      p.rightArm = 2.5 + Math.sin(t * 9) * 0.35;
      p.tilt = Math.sin(t * 1.5) * 0.06;
      p.lean = Math.sin(t * 1.2) * 0.03;
      break;
    case "jump": {
      const ph = (t % 1.6) / 1.6;
      const h = ph < 0.5 ? Math.sin((ph / 0.5) * Math.PI) : 0;
      p.jump = h * 0.22;
      p.squash = ph >= 0.5 && ph < 0.62 ? 0.08 * Math.sin(((ph - 0.5) / 0.12) * Math.PI) : 0;
      p.leftArm = -(0.25 + h * 2.3);
      p.rightArm = 0.25 + h * 2.3;
      p.leftLeg = -h * 0.3;
      p.rightLeg = h * 0.3;
      break;
    }
    case "walk": {
      const s = Math.sin(t * 6);
      p.x = Math.sin(t * 0.35) * 0.28;
      p.leftLeg = s * 0.45;
      p.rightLeg = -s * 0.45;
      p.leftArm = -0.2 - s * 0.4;
      p.rightArm = 0.2 - s * 0.4;
      p.jump = Math.abs(Math.cos(t * 6)) * 0.012;
      break;
    }
    default:
      p.lean = Math.sin(t * 1.3) * 0.03;
      p.tilt = Math.sin(t * 1.7) * 0.05;
      p.jump = (Math.sin(t * 2.2) + 1) * 0.004;
      if (talking) p.rightArm = 0.7 + Math.sin(t * 2.6) * 0.35;
  }
  return p;
}

function camera(ctx, mode, W, H, prog) {
  const z = { "zoom in": 1 + 0.18 * prog, "zoom out": 1.18 - 0.18 * prog }[mode] || (mode.startsWith("pan") ? 1.15 : 1);
  const pan = mode === "pan left" ? (0.5 - prog) : mode === "pan right" ? (prog - 0.5) : 0;
  ctx.translate(W / 2, H / 2);
  ctx.scale(z, z);
  ctx.translate(-W / 2 - pan * W * 0.12, -H / 2);
}

const strip = document.createElement("canvas");

/** Draws the user's picture at (dx, dy) with scale s, plus mouth movement for the current loudness `open`. */
function drawPicture(ctx, img, dx, dy, s, open, m) {
  ctx.drawImage(img, dx, dy, img.width * s, img.height * s);
  if (open > 0.04) { // "jaw drop": dark mouth + the chin area shifted down, with feathered edges
    const mw = m.w * img.width, drop = open * mw * 0.3;
    const mx = m.x * img.width, my = m.y * img.height;
    ctx.fillStyle = "rgba(45,12,16,0.92)";
    ctx.beginPath();
    ctx.ellipse(dx + mx * s, dy + (my + drop * 0.45) * s, mw * 0.38 * s, Math.max(1, drop * 0.6 * s), 0, 0, Math.PI * 2);
    ctx.fill();
    const sw = mw * 2.2, sh = mw * 1.5;
    strip.width = Math.max(1, Math.round(sw * s));
    strip.height = Math.max(1, Math.round(sh * s));
    const sc = strip.getContext("2d");
    sc.globalCompositeOperation = "source-over";
    sc.drawImage(img, mx - sw / 2, my, sw, sh, 0, 0, strip.width, strip.height);
    sc.globalCompositeOperation = "destination-in";
    const gx = sc.createLinearGradient(0, 0, strip.width, 0);
    gx.addColorStop(0, "rgba(0,0,0,0)");
    gx.addColorStop(0.3, "#000");
    gx.addColorStop(0.7, "#000");
    gx.addColorStop(1, "rgba(0,0,0,0)");
    sc.fillStyle = gx;
    sc.fillRect(0, 0, strip.width, strip.height);
    const gy = sc.createLinearGradient(0, 0, 0, strip.height);
    gy.addColorStop(0, "#000");
    gy.addColorStop(0.6, "#000");
    gy.addColorStop(1, "rgba(0,0,0,0)");
    sc.fillStyle = gy;
    sc.fillRect(0, 0, strip.width, strip.height);
    ctx.drawImage(strip, dx + (mx - sw / 2) * s, dy + (my + drop) * s);
  }
}

function drawFullPhoto(ctx, img, W, H, t, open, m) {
  const s = Math.max(W / img.width, H / img.height) * (1.03 + 0.012 * Math.sin(t * 0.9));
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(Math.sin(t * 0.7) * 0.01);
  ctx.translate(-W / 2, -H / 2);
  drawPicture(ctx, img, (W - img.width * s) / 2, (H - img.height * s) / 2, s, open, m);
  ctx.restore();
}

/** The user's picture as a character standing in the scene, moving with the chosen movement. */
function drawPictureCharacter(ctx, img, W, H, p, open, m) {
  const S = Math.min(H * 0.8, W * 0.9);
  const s = Math.min(S / img.height, (W * 0.8) / img.width);
  const dw = img.width * s, dh = img.height * s;
  ctx.save();
  ctx.translate(W / 2 + p.x * W, H * 0.95);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(0, 0, dw * 0.35 * (1 - p.jump), S * 0.03, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(0, -p.jump * S);
  const breathe = 0.008 * Math.sin(p.t * 2.2);
  ctx.scale(1 + p.squash - breathe * 0.5, 1 - p.squash + breathe);
  ctx.rotate(p.lean + p.tilt * 0.5);
  drawPicture(ctx, img, -dw / 2, -dh, s, open, m);
  ctx.restore();
}

function subtitle(ctx, text, W, H) {
  const size = Math.round(Math.min(W, H) * 0.045);
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    if (ctx.measureText(line + " " + w).width > W * 0.86 && line) {
      lines.push(line);
      line = w;
    } else line = line ? line + " " + w : w;
  }
  lines.push(line);
  lines.slice(-3).forEach((l, i, arr) => {
    const y = H - size * 1.1 * (arr.length - i) - H * 0.03;
    ctx.lineWidth = size * 0.18;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(l, W / 2, y);
    ctx.fillStyle = "#fff";
    ctx.fillText(l, W / 2, y);
  });
}

function drawFrame(ctx, s, t, audio, prog = 0) {
  const [W, H] = s.size;
  if (ctx.canvas.width !== W || ctx.canvas.height !== H) {
    ctx.canvas.width = W;
    ctx.canvas.height = H;
  }
  const env = audio?.env;
  const open = env ? env[Math.min(env.length - 1, Math.floor(t * 60))] || 0 : 0;
  ctx.save();
  camera(ctx, s.camera, W, H, prog);
  if (s.character === "photo" && state.photo) {
    const mouthOpen = s.mouthOn ? open : 0;
    if (s.photoStyle === "full") drawFullPhoto(ctx, state.photo, W, H, t, mouthOpen, state.mouth);
    else {
      drawScene(ctx, s.scene, W, H, t, { image: state.bgImage, color: $("bg_color").value });
      drawPictureCharacter(ctx, state.photo, W, H, pose(s.motion, t, mouthOpen, !!env), mouthOpen, state.mouth);
    }
  } else {
    drawScene(ctx, s.scene, W, H, t, { image: state.bgImage, color: $("bg_color").value });
    const p = pose(s.motion, t, open, !!env);
    const S = Math.min(H * 0.72, W * 0.85);
    ctx.save();
    ctx.translate(W / 2 + p.x * W, H * 0.93);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 0, S * 0.2 * (1 - p.jump), S * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
    drawCharacter(ctx, s.character, s.color, p, S);
    ctx.restore();
  }
  ctx.restore();
  if (s.subtitles && audio?.cues) {
    const cue = audio.cues.find((c) => t >= c.start && t <= c.end + 0.2);
    if (cue) subtitle(ctx, cue.text, W, H);
  }
}

// ---------------------------------------------------------------- audio preparation
function setStatus(msg, prog = null, error = false) {
  $("status").textContent = msg;
  $("status").classList.toggle("error", error);
  if (prog !== null) $("fill").style.width = `${Math.round(prog * 100)}%`;
}

async function prepareAudio(ac) {
  const file = $("audio_file").files[0];
  if (file) {
    setStatus("Reading your audio file...");
    const buffer = await ac.decodeAudioData(await file.arrayBuffer());
    return { buffer, env: envelope(buffer), cues: null };
  }
  const text = $("speech").value.trim();
  if (!text) return null;
  const key = `${text}|${$("voice").value}|${$("speed").value}`;
  if (state.voiceCache.key !== key) {
    const data = await synthesize(text, $("voice").value, +$("speed").value, (m) => setStatus(m));
    state.voiceCache = { key, data };
  }
  const { samples, rate, cues } = state.voiceCache.data;
  const buffer = ac.createBuffer(1, samples.length, rate);
  buffer.copyToChannel(samples, 0);
  return { buffer, env: envelope(buffer), cues };
}

function pickMime() {
  return ["video/mp4;codecs=avc1.42E01F,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus", "video/webm"].find((m) => window.MediaRecorder?.isTypeSupported(m)) || "";
}

// ---------------------------------------------------------------- run (preview or record)
async function run(record) {
  if (state.running || window.__cvRunning) return;
  const s = settings();
  if (s.character === "photo" && !state.photo) return setStatus("Please choose your photo first.", 0, true);
  if (record && !window.MediaRecorder) return setStatus("This browser can't record video. Please use Chrome or Edge.", 0, true);
  $("preview_btn").disabled = $("record_btn").disabled = true;
  $("stop_btn").disabled = false;
  $("result").classList.add("hidden");

  const ac = new AudioContext();
  let audio;
  try {
    audio = await prepareAudio(ac);
  } catch (err) {
    console.error(err);
    setStatus("Could not create the voice: " + err.message, 0, true);
    $("preview_btn").disabled = $("record_btn").disabled = false;
    $("stop_btn").disabled = true;
    ac.close();
    return;
  }
  const duration = Math.max(s.length, audio ? audio.buffer.duration + 0.3 : 0);

  const master = ac.createGain();
  master.connect(ac.destination);
  const dest = ac.createMediaStreamDestination();
  master.connect(dest);
  const t0 = ac.currentTime + 0.15;
  if (audio) {
    const src = ac.createBufferSource();
    src.buffer = audio.buffer;
    src.connect(master);
    src.start(t0);
  }
  if (s.music !== "none") {
    const mg = ac.createGain();
    mg.gain.value = audio ? 0.5 : 1;
    mg.connect(master);
    scheduleMusic(ac, mg, s.music, t0, duration);
  }

  const canvas = $("stage");
  const ctx = canvas.getContext("2d");
  drawFrame(ctx, s, 0, audio, 0);
  let recorder = null;
  const chunks = [];
  if (record) {
    const stream = canvas.captureStream(30);
    dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    recorder = new MediaRecorder(stream, { mimeType: pickMime(), videoBitsPerSecond: 5_000_000 });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.start(1000);
  }
  const fmt = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}`;
  const stop = () => {
    state.running = null;
    window.__cvRunning = false;
    ac.close();
    $("preview_btn").disabled = $("record_btn").disabled = false;
    $("stop_btn").disabled = true;
    if (!recorder) return setStatus("Preview finished.", 1);
    recorder.onstop = () => {
      const type = recorder.mimeType || "video/webm";
      const blob = new Blob(chunks, { type });
      const url = URL.createObjectURL(blob);
      const ext = type.includes("mp4") ? "mp4" : "webm";
      $("result_video").src = url;
      $("download").href = url;
      $("download").download = `character-video.${ext}`;
      $("download").textContent = `Download video (${ext.toUpperCase()}, ${(blob.size / 1e6).toFixed(1)} MB)`;
      $("result").classList.remove("hidden");
      setStatus("Done! Your video is ready below.", 1);
    };
    recorder.stop();
  };
  state.running = { stop };
  window.__cvRunning = true;
  const loop = () => {
    if (!state.running) return;
    const t = Math.max(0, ac.currentTime - t0);
    drawFrame(ctx, s, t, audio, Math.min(1, t / duration));
    setStatus(`${record ? "Recording" : "Preview"} ${fmt(t)} / ${fmt(duration)}` +
      (record ? " - keep this tab open and visible" : ""), t / duration);
    if (t >= duration) return stop();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

$("preview_btn").addEventListener("click", () => run(false));
$("record_btn").addEventListener("click", () => run(true));
$("stop_btn").addEventListener("click", () => state.running?.stop());
updateAgentInfo();
