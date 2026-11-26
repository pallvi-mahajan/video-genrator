// Story reel: idea or script -> cast with fixed looks -> cinematic AI pictures per scene -> voices -> animated reel.
import { VOICES, chime, envelope, scheduleMusic, speakLines } from "./audio.js?v=14";
import { drawCharacter } from "./characters.js?v=14";
import { drawScene } from "./scenes.js?v=14";
import { writeLocalStory } from "./storywriter.js?v=14";

const $ = (id) => document.getElementById(id);
const IMG_API = "https://image.pollinations.ai/prompt/";
const TEXT_API = "https://text.pollinations.ai/";
const FREE_GAP_MS = 46_000; // free image service: 1 picture per 45 s per visitor
const FADE = 1.0;
const load3D = () => import("./three3d.js?v=14");

export const STYLES = {
  cinematic: "cinematic film still from a Disney Pixar 3D animated feature film, Pixar character design, adorable expressive faces, " +
    "big glossy eyes, soft subsurface skin, volumetric god rays, warm rim light, shallow depth of field, rich colour grading, " +
    "highly detailed, octane render, masterpiece",
  disney: "Disney animated movie still, magical storybook atmosphere, beautiful painterly lighting, vibrant colours, highly detailed",
  anime: "cinematic anime film still, Studio Ghibli inspired, beautiful detailed background, soft warm light",
  watercolor: "children's book watercolour illustration, soft pastel colours, whimsical, cute",
  clay: "claymation style, cute clay characters, soft studio lighting, colourful",
};
const STYLE_LABELS = { cinematic: "Cinematic 3D (Disney/Pixar-inspired)", disney: "Disney storybook", anime: "Anime / Ghibli",
  watercolor: "Watercolour storybook", clay: "Clay animation" };
const NEGATIVE = "no text, no watermark, no letters";
const FORMATS = { "9:16": [720, 1280, 576, 1024], "16:9": [1280, 720, 1024, 576], "1:1": [720, 720, 768, 768] };

export const PRESETS = {
  "Curly-haired girl": "Mia: a cheerful 6-year-old girl with big brown eyes, long curly dark-brown hair with a yellow flower clip, wearing a teal dress",
  "Brave boy": "Arjun: a brave 7-year-old boy with short black hair, big brown eyes, wearing a red hoodie and blue jeans",
  "Wise grandma": "Grandma Rose: a kind grandmother with grey hair in a bun, round glasses and a purple shawl",
  "Little bee": "Buzzy: a tiny round honeybee with big shiny eyes, a black graduation cap and soft yellow-black stripes",
  "Puppy": "Coco: a fluffy golden puppy with floppy ears, a red collar and big happy eyes",
  "Little star": "Twinkle: a tiny glowing golden five-pointed star with big blue eyes and a cute smiling face",
};

export const EXAMPLE = `# Lily and the Lost Little Star

Characters:
Lily: a little girl with long wavy chestnut hair, big brown eyes, a pink dress, white shoes and a purple backpack
Twinkle: a tiny glowing golden five-pointed star with big blue eyes and a cute smiling face

### Scene 1 - The Mysterious Light (0-10 seconds)
Visual prompt: Lily walks along a glowing path in an enchanted forest at twilight, colourful butterflies around her, a tiny golden light glows behind a magical mushroom.
Narration: "Once upon a time, in a magical forest, lived a little girl named Lily. One evening, she discovered something sparkling in the bushes!"
Dialogue:
Lily: "Oh! What is that beautiful light?"
Sound: Gentle magical music, soft sparkling sound.

### Scene 2 - Meeting Twinkle (10-20 seconds)
Visual prompt: Lily kneels and discovers Twinkle floating just above the ground, glowing weakly.
Dialogue:
Twinkle: "Hello! My name is Twinkle. I fell from the sky, and now I can't fly home!"
Lily: "Don't worry! I'll help you!"
Sound: Magical twinkling sound.

Ending text: "The End"`;

// ---------------------------------------------------------------- script parsing ("agent")
const clean = (s) => s.replace(/\*\*|__|`/g, "").replace(/^[#>\-\s*]+/, "").trim();
const unquote = (s) => s.trim().replace(/^["“”']+|["“”']+$/g, "").trim();
const NAME_LINE = /^([A-Z][\w' .-]{0,30}?)\s*(?:\([^)]*\))?\s*:\s*(.+)$/;

export function parseScript(text) {
  const out = { title: "", ending: "", characters: [], scenes: [] };
  let scene = null;
  let field = null;
  const fieldOf = (l) => {
    const m = l.match(/^(visual prompt|visual|scene description|image|picture|narration|narrator|dialogue|dialog|sound|music|ending text|ending|main characters|characters|cast)\s*:\s*(.*)$/i);
    if (!m) return null;
    const k = m[1].toLowerCase();
    const f = /^(visual|scene description|image|picture)/.test(k) ? "visual" : k.startsWith("narrat") ? "narration"
      : k.startsWith("dialog") ? "dialogue" : k.startsWith("ending") ? "ending" : /characters|cast/.test(k) ? "characters" : "sound";
    return [f, m[2]];
  };
  const add = (f, value) => {
    if (!value) return;
    if (f === "ending") return void (out.ending = unquote(value));
    if (f === "characters") {
      const m = value.match(NAME_LINE);
      if (m) out.characters.push({ name: m[1].trim(), look: unquote(m[2]) });
      return;
    }
    if (!scene) return;
    if (f === "visual") scene.visual += (scene.visual ? " " : "") + value;
    else if (f === "sound") scene.sound += " " + value;
    else if (f === "narration") scene.lines.push({ speaker: "Narrator", text: unquote(value) });
    else {
      const m = value.match(NAME_LINE);
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
    if ((field === "dialogue" || field === "characters") && NAME_LINE.test(l)) add(field, l);
    else if (field) add(field, l);
  }
  out.scenes = out.scenes.filter((s) => s.visual || s.lines.length);
  return out.scenes.length ? out : null;
}

function parseCastText(text) {
  return text.split(/\r?\n/).map((l) => l.trim().match(NAME_LINE)).filter(Boolean)
    .map((m) => ({ name: m[1].trim(), look: unquote(m[2]) }));
}

/** Turns a short idea into a cinematic scene script with the free text AI; falls back to a simple split. */
async function writeScript(idea, nScenes, chars) {
  const castLine = chars.length ? `Use these main characters (keep their names and looks): ${chars.map((c) => `${c.name} = ${c.look}`).join("; ")}. ` : "";
  const ask = `Write a cinematic Disney/Pixar-style animated kids story with a gentle moral for this idea: "${idea}". ${castLine}` +
    `Use exactly ${nScenes} scenes. Output ONLY this format:\n# Story title\nCharacters:\nName: detailed look (age, hair, eyes, clothes)\n` +
    "### Scene N - Title\nVisual prompt: one vivid cinematic sentence (setting, action, emotion, lighting)\nNarration: \"...\"\n" +
    "Dialogue:\nName: \"...\"\nSound: ...\n...and finally: Ending text: \"The End\". Keep lines short and child friendly.";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch(TEXT_API + encodeURIComponent(ask) + "?seed=" + Math.floor(Math.random() * 1e6), { signal: ctrl.signal });
    clearTimeout(timer);
    if (r.ok) {
      const parsed = parseScript(await r.text());
      if (parsed && parsed.scenes.length >= Math.min(3, nScenes) && parsed.scenes.every((sc) => sc.lines.length)) return parsed;
    }
  } catch (e) {
    console.warn("text AI not reachable, using the built-in story writer", e);
  }
  return writeLocalStory(idea, nScenes, chars);
}

// ---------------------------------------------------------------- cast & voices
const FEMALE = ["af_bella", "af_nicole", "af_sarah", "bf_emma"];
const MALE = ["am_puck", "am_michael", "am_fenrir", "bm_george"];
const isMale = (t) => /\b(boy|man|king|prince|father|dad|brother|grandpa|grandfather|uncle|he|his|mr)\b/i.test(t);

function buildCast(data, userChars) {
  const byName = new Map();
  for (const c of [...data.characters, ...userChars]) byName.set(c.name.toLowerCase(), { ...byName.get(c.name.toLowerCase()), ...c });
  const speakers = data.scenes.flatMap((s) => s.lines.map((l) => l.speaker)).filter((n) => n !== "Narrator");
  const allVisual = data.scenes.map((s) => s.visual).join(" ");
  for (const name of speakers) if (!byName.has(name.toLowerCase())) {
    const sentence = allVisual.match(new RegExp(`[^.]*\\b${name}\\b[^.]*\\.`, "i"))?.[0] || "";
    byName.set(name.toLowerCase(), { name, look: sentence.trim() });
  }
  let f = 0, m = 0;
  return [...byName.values()].map((c) => ({
    ...c, speed: 1.05, voice: c.voice || (isMale(c.look) ? MALE[m++ % MALE.length] : FEMALE[f++ % FEMALE.length]),
  }));
}

function moodOf(sound) {
  const s = sound.toLowerCase();
  return /lullaby|magic|sparkl|twinkl|enchant|fairy/.test(s) ? "magical" : /cheer|adventure|happy|fun|joy|upbeat/.test(s) ? "happy"
    : /emotion|sad|soft|gentle|calm/.test(s) ? "calm" : /orchestr|epic|battle|dramatic/.test(s) ? "epic" : "";
}

// ---------------------------------------------------------------- pictures (free AI, own upload, or drawn backup)
let lastImageAt = 0;
let networkFails = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BLOCKED = "This internet connection blocks the free AI picture service (pollinations.ai), for example an office network. " +
  "Using real-time 3D animated scenes instead. For AI pictures, use a home Wi-Fi or mobile network, or upload your own.";

function loadBlobImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

async function aiPicture(prompt, w, h, seed, onWait) {
  const url = `${IMG_API}${encodeURIComponent(prompt.slice(0, 1500))}?width=${w}&height=${h}&seed=${seed}&nologo=true&enhance=true`;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (networkFails >= 3) throw new Error(BLOCKED);
    const wait = lastImageAt + FREE_GAP_MS - Date.now();
    for (let s = Math.ceil(wait / 1000); s > 0; s--) {
      if (story.cancelled) throw new Error("Stopped.");
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
      lastImageAt = Date.now() - FREE_GAP_MS + 4_000;
    }
  }
  throw new Error("The free picture service is busy. Try again in a few minutes, or upload your own picture.");
}

/** Drawn backup picture (used when AI pictures are not reachable). */
function backupPicture(scene, cast, W, H, i) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  const v = `${scene.visual} ${scene.sound}`.toLowerCase();
  const bg = /space|planet|galaxy|rocket/.test(v) ? "space" : /night|star|moon|twilight/.test(v) ? "city"
    : /forest|garden|flower|park|tree|meadow/.test(v) ? "garden" : /room|home|house|school|class|kitchen/.test(v) ? "room"
    : /beach|sea|ocean|sand|shore/.test(v) ? "beach" : "sky";
  drawScene(ctx, bg === "city" && !/city|street/.test(v) ? "space" : bg, W, H, i * 3.1);
  const present = cast.filter((p) => new RegExp(`\\b${p.name}\\b`, "i").test(v + scene.lines.map((l) => l.speaker).join(" "))).slice(0, 2);
  const colors = ["#e85d9a", "#4f8cff", "#f4a340", "#3fb37f"];
  present.forEach((p, k) => {
    const look = p.look.toLowerCase();
    const type = /robot/.test(look) ? "robot"
      : /\b(cat|kitten|dog|puppy|bunny|rabbit|bear|fox|lion|tiger|mouse|squirrel)\b/.test(look) ? "cat"
      : /\b(alien|monster|star|bee|creature|dragon|fairy|bird|owl)\b/.test(look) ? "alien" : isMale(look) ? "boy" : "girl";
    const S = Math.min(H * 0.55, W * 0.6);
    ctx.save();
    ctx.translate(W * (present.length === 1 ? 0.5 : 0.3 + k * 0.4), H * 0.92);
    drawCharacter(ctx, type, colors[k % colors.length], { t: i, mouth: 0, blink: 0, jump: 0, squash: 0, lean: 0, tilt: 0,
      leftArm: -0.3, rightArm: k ? 2.4 : 0.3, leftLeg: 0, rightLeg: 0 }, S);
    ctx.restore();
  });
  return c;
}

// ---------------------------------------------------------------- state + UI
const story = { data: null, cast: [], pictures: [], jobId: 0, busy: false, scriptKey: "", backup: false };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function shotFor(i, n, scene) {
  const speakers = [...new Set(scene.lines.map((l) => l.speaker).filter((s) => s !== "Narrator"))];
  if (i === 0) return "wide establishing shot";
  if (i === n - 1) return "wide cinematic shot, emotional ending";
  if (speakers.length === 1) return `medium close-up shot of ${speakers[0]}`;
  if (speakers.length > 1) return "medium two-shot, characters facing each other";
  return ["medium shot", "low angle shot", "over-the-shoulder shot"][i % 3];
}

function promptFor(i) {
  const s = story.data.scenes[i];
  const text = s.visual + " " + s.lines.map((l) => l.speaker).join(" ");
  const present = story.cast.filter((c) => c.look && new RegExp(`\\b${c.name}\\b`, "i").test(text));
  const castDesc = present.map((c) => `${c.name} is ${c.look}`).join(". ");
  return `${STYLES[$("st_style").value]}, ${shotFor(i, story.data.scenes.length, s)}. ${s.visual} ${castDesc ? castDesc + "." : ""} ${NEGATIVE}`.trim();
}

function renderCast() {
  const opts = (sel) => Object.entries(VOICES).map(([v, l]) => `<option value="${v}" ${v === sel ? "selected" : ""}>${l}</option>`).join("");
  $("st_cast").innerHTML = story.cast.map((c, i) => `
    <div class="cast-row">
      <b>${esc(c.name)}</b>
      <input data-look="${i}" value="${esc(c.look)}" placeholder="How ${esc(c.name)} looks (kept the same in every scene)" />
      <select data-cast="${i}">${opts(c.voice)}</select>
    </div>`).join("") || `<p class="hint">No characters found. Only the narrator will speak.</p>`;
  $("st_cast").querySelectorAll("select").forEach((el) => el.addEventListener("change", () => {
    story.cast[+el.dataset.cast].voice = el.value;
  }));
  $("st_cast").querySelectorAll("[data-look]").forEach((el) => el.addEventListener("change", () => {
    story.cast[+el.dataset.look].look = el.value;
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
          <button type="button" class="small hidden" data-ok="${i}">Looks good, make next scene</button>
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
    const i = +el.dataset.regen;
    story.pictures[i] = null;
    story.approved[i] = false;
    story.seedBump = (story.seedBump || 0) + 1;
    showThumb(i);
    paintAll();
  }));
  $("st_scenes").querySelectorAll("[data-ok]").forEach((el) => el.addEventListener("click", () => {
    story.approved[+el.dataset.ok] = true;
    showThumb(+el.dataset.ok);
    paintAll();
  }));
  $("st_scenes").querySelectorAll("[data-upload]").forEach((el) => el.addEventListener("change", async () => {
    const i = +el.dataset.upload;
    if (!el.files[0]) return;
    story.pictures[i] = await loadBlobImage(el.files[0]);
    showThumb(i);
    showOnStage(i);
  }));
  $("st_scenes").querySelectorAll(".thumb").forEach((el, i) => el.addEventListener("click", () => showOnStage(i)));
}

const stepMode = () => $("st_step").checked;

/** Shows a scene's picture large in the preview area (for checking it). */
function showOnStage(i) {
  const img = story.pictures[i];
  if (!img || story.busy) return;
  const [W, H] = FORMATS[$("st_format").value];
  const c = $("stage");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  drawCover(ctx, img, W, H, "in", 0.3);
  if ($("st_cinematic").checked) cinematic(ctx, W, H, 0, W > H);
  bigText(ctx, `Scene ${i + 1}`, W, H, 0.9, 0.1, 0.6);
}

function spec3D(i) {
  const s = story.data.scenes[i];
  return { text: `${s.visual} ${s.sound} ${s.lines.map((l) => l.text).join(" ")}`, visual: s.visual, index: i, count: story.data.scenes.length,
    speakers: [...new Set(s.lines.map((l) => l.speaker).filter((n) => n !== "Narrator"))] };
}

/** A preview frame of the real-time 3D scene (used as the scene's thumbnail). */
async function picture3D(i) {
  const [W, H] = FORMATS[$("st_format").value];
  try {
    await new Promise((r) => setTimeout(r, 50)); // let the page breathe between scenes (keeps it responsive)
    const { buildScene3D } = await load3D();
    const sc = buildScene3D(spec3D(i), story.cast, W, H);
    const snap = sc.snapshot();
    sc.dispose();
    snap.is3D = true;
    return snap;
  } catch (e) {
    console.error("3D failed", e);
    setStatus("3D could not start in this browser (" + e.message + "). Using simple drawings. Try Chrome or Edge, and enable hardware acceleration.", null, true);
    return backupPicture(story.data.scenes[i], story.cast, W, H, i);
  }
}

function showThumb(i) {
  const img = story.pictures[i];
  const box = $(`st_thumb_${i}`);
  if (!box) return;
  box.innerHTML = img ? "" : `<span>Scene ${i + 1}</span>`;
  if (img) {
    const el = img instanceof HTMLCanvasElement ? new Image() : img.cloneNode();
    if (img instanceof HTMLCanvasElement) el.src = img.toDataURL("image/jpeg", 0.7);
    box.appendChild(el);
    $(`st_pstatus_${i}`).textContent = (img.is3D ? "Real-time 3D scene. " : img instanceof HTMLCanvasElement ? "drawn backup picture. " : "") +
      (stepMode() && !story.approved[i] ? "Check this scene in the preview." : stepMode() ? "Approved" : "");
  }
  const ok = document.querySelector(`[data-ok="${i}"]`);
  if (ok) {
    const last = i === story.data.scenes.length - 1;
    ok.textContent = last ? "Looks good, all scenes done" : "Looks good, make next scene";
    ok.classList.toggle("hidden", !img || !stepMode() || !!story.approved[i]);
  }
  updateReady();
}

/** Makes all missing pictures. Resolves when every scene has a picture (AI, uploaded, or drawn backup). */
async function paintAll() {
  const job = ++story.jobId;
  const [W, H, w, h] = FORMATS[$("st_format").value];
  const seed = (+$("st_seed").value || 7) + (story.seedBump || 0);
  for (let i = 0; i < story.data.scenes.length; i++) {
    if (job !== story.jobId) return false;
    if (stepMode() && i > 0 && !story.approved[i - 1]) break; // wait until the previous scene is approved
    if (story.pictures[i]) continue;
    const st = $(`st_pstatus_${i}`);
    if ($("st_source").value === "upload") {
      st.textContent = "Please upload a picture";
      continue;
    }
    if (story.backup || $("st_source").value === "3d") {
      st.textContent = "Building 3D scene...";
      story.pictures[i] = await picture3D(i);
      if (job !== story.jobId) return false;
      showThumb(i);
      if (stepMode()) {
        showOnStage(i);
        setStatus(`Scene ${i + 1} is ready. Check it in the preview, then press "Looks good" (or "New picture") in the scene list.`);
        break;
      }
      continue;
    }
    st.textContent = "Painting...";
    try {
      story.pictures[i] = await aiPicture(promptFor(i), w, h, seed, (s) => {
        st.textContent = `Waiting ${s}s (free service: 1 picture every 45 s)...`;
      });
    } catch (e) {
      if (story.cancelled) return false;
      if (e.message === BLOCKED) story.backup = true;
      setStatus(e.message, null, e.message !== BLOCKED);
      story.pictures[i] = e.message === BLOCKED ? await picture3D(i) : backupPicture(story.data.scenes[i], story.cast, W, H, i);
    }
    if (job !== story.jobId) return false;
    showThumb(i);
    if (stepMode()) {
      showOnStage(i);
      setStatus(`Scene ${i + 1} is ready. Check it in the preview, then press "Looks good" (or "New picture") in the scene list.`);
      $(`st_thumb_${i}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      break;
    }
  }
  return story.data.scenes.every((_, i) => story.pictures[i] && (!stepMode() || story.approved[i]));
}

function updateReady() {
  const n = story.data?.scenes.length || 0;
  const missing = story.data ? story.data.scenes.filter((_, i) => !story.pictures[i]).length : 1;
  const unapproved = stepMode() && story.data ? story.data.scenes.filter((_, i) => !story.approved[i]).length : 0;
  $("st_preview").disabled = $("st_record").disabled = $("st_thumb").disabled = !story.data || missing > 0 || story.busy;
  $("st_generate").disabled = story.busy;
  $("st_generate").textContent = stepMode() && story.data && !unapproved ? "Make the video" : "Generate video";
  $("st_ready").textContent = !story.data ? "" : unapproved ? `${n - unapproved} of ${n} scenes approved.`
    : missing ? `${missing} picture(s) still being made...` : "All pictures ready.";
}

async function prepare() {
  const text = $("st_script").value.trim();
  if (!text) {
    alert("Please type a story idea or paste a script.");
    return false;
  }
  $("st_prepare").disabled = true;
  setStatus("Writing the story and choosing the characters...", 0.02);
  const userChars = parseCastText($("st_chars").value);
  story.data = parseScript(text) || (await writeScript(text, +$("st_count").value || 6, userChars));
  story.cast = buildCast(story.data, userChars);
  story.pictures = story.data.scenes.map(() => null);
  story.approved = story.data.scenes.map(() => false);
  story.seedBump = 0;
  story.audioKey = "";
  story.scriptKey = text + "|" + $("st_chars").value;
  $("st_title").value = story.data.title || text.split(/[.!?\n]/)[0].slice(0, 60);
  $("st_end").value = story.data.ending || "The End";
  $("st_plan").classList.remove("hidden");
  renderCast();
  renderScenes();
  $("st_prepare").disabled = false;
  updateReady();
  setStatus(`Story ready: ${story.data.scenes.length} scenes, characters: ${story.cast.map((c) => c.name).join(", ") || "narrator only"}.`, 0.05);
  return true;
}

// ---------------------------------------------------------------- rendering
function rnd(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
const r = rnd(9);
const SPARKS = Array.from({ length: 70 }, () => [r(), r(), r() * 2 + 1, r() * 6, r() * 0.5 + 0.3]);
const grain = document.createElement("canvas");
grain.width = grain.height = 256;
{
  const g = grain.getContext("2d");
  const d = g.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.random() * 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 18;
  }
  g.putImageData(d, 0, 0);
}

function drawCover(ctx, img, W, H, move, p) {
  const e = p * p * (3 - 2 * p); // ease in-out: smoother, more cinematic camera
  const base = Math.max(W / img.width, H / img.height);
  const z = { in: 1.04 + 0.14 * e, out: 1.18 - 0.14 * e, push: 1.08 + 0.22 * e }[move] || 1.14;
  const s = base * z;
  const dw = img.width * s, dh = img.height * s;
  const px = move === "left" ? 0.5 + 0.45 * (0.5 - e) : move === "right" ? 0.5 + 0.45 * (e - 0.5) : 0.5;
  const py = move === "up" ? 0.65 - 0.3 * e : move === "push" ? 0.42 : 0.5;
  ctx.drawImage(img, (W - dw) * px, (H - dh) * py, dw, dh);
}

function sparkles(ctx, W, H, t) {
  for (const [x, y, sz, ph, sp] of SPARKS) {
    const yy = ((y - t * 0.03 * sp) % 1 + 1) % 1;
    ctx.globalAlpha = (0.25 + 0.75 * Math.abs(Math.sin(t * 2 + ph))) * 0.8;
    ctx.fillStyle = "#fff3b0";
    ctx.beginPath();
    ctx.arc(x * W + Math.sin(t + ph) * 10, yy * H, sz * (W / 720), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function cinematic(ctx, W, H, t, bars) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter"; // soft moving light rays
  const lx = W * (0.15 + 0.1 * Math.sin(t * 0.15));
  const rays = ctx.createRadialGradient(lx, -H * 0.1, 0, lx, -H * 0.1, H * 0.9);
  rays.addColorStop(0, "rgba(255,220,160,0.22)");
  rays.addColorStop(1, "rgba(255,220,160,0)");
  ctx.fillStyle = rays;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,20,0.5)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = ctx.createPattern(grain, "repeat");
  ctx.translate((t * 937) % 256, (t * 611) % 256);
  ctx.fillRect(-256, -256, W + 512, H + 512);
  ctx.restore();
  if (bars) { // 2.39:1 widescreen bars for landscape videos
    const bh = (H - W / 2.39) / 2;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, bh);
    ctx.fillRect(0, H - bh, W, bh);
  }
}

function wrap(ctx, text, maxW) {
  const lines = [];
  let line = "";
  for (const w of text.split(" ")) {
    if (ctx.measureText(line + " " + w).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = line ? line + " " + w : w;
  }
  lines.push(line);
  return lines;
}

function caption(ctx, cue, W, H) {
  const size = Math.round(Math.min(W, H) * 0.048);
  const font = (wt, sz) => `${wt} ${sz}px "Trebuchet MS", system-ui, sans-serif`;
  ctx.font = font(700, size);
  ctx.textAlign = "center";
  const shown = wrap(ctx, cue.text, W * 0.82).slice(0, 3);
  const named = cue.speaker !== "Narrator";
  const boxH = size * 1.25 * shown.length + size * (named ? 1.6 : 0.8);
  const y0 = H * (H > W ? 0.8 : 0.8) - boxH / 2;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.roundRect(W * 0.06, y0, W * 0.88, boxH, size * 0.5);
  ctx.fill();
  let y = y0 + size * 1.1;
  if (named) {
    ctx.font = font(800, Math.round(size * 0.8));
    ctx.fillStyle = "#ffd65a";
    ctx.fillText(cue.speaker, W / 2, y);
    y += size * 1.05;
    ctx.font = font(700, size);
  }
  ctx.fillStyle = cue.speaker === "Narrator" ? "#f4f1ff" : "#fff";
  for (const l of shown) {
    ctx.fillText(l, W / 2, y);
    y += size * 1.25;
  }
}

function bigText(ctx, text, W, H, alpha, y = 0.18, scale = 1) {
  if (!text || alpha <= 0) return;
  const size = Math.round(Math.min(W, H) * 0.09 * scale);
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.font = `900 ${size}px "Trebuchet MS", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  const lines = wrap(ctx, text, W * 0.88);
  lines.forEach((l, i) => {
    const yy = H * y + i * size * 1.1;
    const g = ctx.createLinearGradient(0, yy - size, 0, yy);
    g.addColorStop(0, "#fff9d6");
    g.addColorStop(1, "#ffc93c");
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = size * 0.4;
    ctx.lineWidth = size * 0.18;
    ctx.strokeStyle = "#3b1a6b";
    ctx.strokeText(l, W / 2, yy);
    ctx.shadowBlur = 0;
    ctx.fillStyle = g;
    ctx.fillText(l, W / 2, yy);
  });
  ctx.restore();
}

const MOVES = ["in", "right", "push", "left", "out", "up"];

function visual(ctx, tl, s, t, p) {
  if (!s.three) return drawCover(ctx, s.img, tl.W, tl.H, s.move, p);
  const cue = tl.cues.find((c) => t >= c.start && t <= c.end);
  const speaker = cue && cue.scene === s ? cue.speaker : null;
  const open = s.env ? s.env[Math.max(0, Math.floor((t - s.start - s.lead) * 60))] || 0 : 0;
  s.three.render(ctx, t, t - s.start, Math.min(1, (t - s.start) / s.dur), speaker, open);
}

function drawStory(ctx, tl, t, W, H) {
  const idx = tl.scenes.findIndex((s) => t < s.start + s.dur);
  const sc = tl.scenes[idx === -1 ? tl.scenes.length - 1 : idx];
  const local = (s, tt) => Math.min(1, Math.max(0, (tt - s.start) / (s.dur + FADE)));
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  visual(ctx, tl, sc, t, local(sc, t));
  const next = tl.scenes[tl.scenes.indexOf(sc) + 1];
  const fadeIn = next ? (t - (sc.start + sc.dur - FADE)) / FADE : 0;
  if (next && fadeIn > 0) {
    ctx.globalAlpha = Math.min(1, fadeIn);
    visual(ctx, tl, next, t, local(next, t));
    ctx.globalAlpha = 1;
  }
  if (tl.sparkles && (sc.sparkle || !tl.cinematic)) sparkles(ctx, W, H, t);
  if (tl.cinematic) cinematic(ctx, W, H, t, W > H);
  const cue = tl.cues.find((c) => t >= c.start && t <= c.end + 0.15);
  if (cue && tl.captions) caption(ctx, cue, W, H);
  if (t < 3.5) bigText(ctx, tl.title, W, H, t < 2.6 ? Math.min(1, t * 1.5) : (3.5 - t) / 0.9, W > H ? 0.3 : 0.2);
  if (t > tl.total - 3) bigText(ctx, tl.ending, W, H, (t - (tl.total - 3)) * 1.5, 0.45, 1.1);
  const fade = Math.max(0, 1 - t / 0.8, (t - (tl.total - 0.8)) / 0.8); // fade from / to black
  if (fade > 0) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fade)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

async function buildTimeline(ac) {
  const voiceOf = (speaker) => {
    if (speaker === "Narrator") return { voice: $("st_narrator").value, speed: 0.95 };
    const c = story.cast.find((x) => x.name === speaker);
    return { voice: c?.voice || "af_bella", speed: c?.speed || 1.05 };
  };
  const key = JSON.stringify([story.data.scenes.map((s) => s.lines), story.cast.map((c) => c.voice), $("st_narrator").value]);
  story.voiceError = "";
  if (story.audioKey !== key) {
    story.audio = [];
    for (let i = 0; i < story.data.scenes.length; i++) {
      const lines = story.data.scenes[i].lines;
      if (story.cancelled) throw new Error("Stopped.");
      try {
        story.audio[i] = lines.length ? await speakLines(lines, voiceOf, (m) => setStatus(`Scene ${i + 1}: ${m}`)) : null;
      } catch (e) {
        console.error("voice failed", e);
        story.voiceError = "The voice model could not be downloaded on this connection, so this video has music and subtitles but no voice.";
        story.audio = story.data.scenes.map(() => null);
        break;
      }
    }
    if (!story.voiceError) story.audioKey = key;
  }
  const [W, H] = FORMATS[$("st_format").value];
  const scenes = [];
  const cues = [];
  let start = 0;
  const minScene = +$("st_min").value || 4;
  const three3d = story.pictures.some((p) => p?.is3D) ? await load3D() : null;
  for (const [i, s] of story.data.scenes.entries()) {
    let a = story.audio[i];
    if (!a && s.lines.length) { // no voice available: still time the subtitles (~2.6 words per second)
      let tt = 0.3;
      const fake = s.lines.map((l) => {
        const d = Math.max(1.5, l.text.split(/\s+/).length / 2.6);
        const c = { start: tt, end: tt + d, text: l.text, speaker: l.speaker };
        tt += d + 0.4;
        return c;
      });
      a = { cues: fake, silent: tt };
    }
    const speech = a ? (a.silent ?? a.samples.length / a.rate) : 0;
    const last = i === story.data.scenes.length - 1;
    const lead = i === 0 ? 2.2 : 0; // let the title breathe before the first line
    const dur = Math.max(minScene, speech + 0.8, $("st_use_timing").checked ? s.minDur : 0) + lead + (last ? 3 : 0);
    let buffer = null;
    if (a) {
      if (a.samples) {
        buffer = ac.createBuffer(1, a.samples.length, a.rate);
        buffer.copyToChannel(a.samples, 0);
      }
      a.cues.forEach((c) => cues.push({ ...c, start: c.start + start + lead, end: c.end + start + lead, sceneIndex: i }));
    }
    if (three3d) {
      setStatus(`Preparing 3D scene ${i + 1} of ${story.data.scenes.length}...`);
      await new Promise((r) => setTimeout(r, 30));
    }
    const three = story.pictures[i]?.is3D ? three3d.buildScene3D(spec3D(i), story.cast, W, H) : null;
    scenes.push({ img: story.pictures[i], three, env: three && buffer ? envelope(buffer) : null, start, lead, dur, buffer, mood: moodOf(s.sound),
      sparkle: /sparkl|twinkl|chime|magic|glow|star/i.test(s.sound + s.visual), move: MOVES[i % MOVES.length] });
    start += dur;
  }
  for (const c of cues) c.scene = scenes[c.sceneIndex];
  return { W, H, scenes, cues, total: start, title: $("st_title").value.trim(), ending: $("st_end").value.trim(),
    captions: $("st_captions").checked, sparkles: $("st_sparkles").checked, cinematic: $("st_cinematic").checked };
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

/** Plays (and optionally records) the reel. Resolves when finished. */
function play(record, autoDownload = false) {
  return new Promise(async (resolve) => {
    if (story.busy || window.__cvRunning) return resolve(false);
    story.busy = window.__cvRunning = true;
    updateReady();
    $("result").classList.add("hidden");
    const ac = new AudioContext();
    let tl;
    try {
      tl = await buildTimeline(ac);
    } catch (e) {
      console.error(e);
      setStatus(story.cancelled ? "Stopped." : "Could not create the voices: " + e.message, 0, !story.cancelled);
      story.busy = window.__cvRunning = false;
      updateReady();
      ac.close();
      return resolve(false);
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
    musicGain.gain.value = 0.5;
    musicGain.connect(master);
    const globalMood = $("st_music").value;
    for (const s of tl.scenes) {
      if (s.buffer) {
        const src = ac.createBufferSource();
        src.buffer = s.buffer;
        src.connect(master);
        src.start(t0 + s.start + s.lead);
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
      recorder = new MediaRecorder(stream, { mimeType: pickMime(), videoBitsPerSecond: 8_000_000 });
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
      $("stop_btn").disabled = true;
      tl.scenes.forEach((s) => s.three?.dispose());
      ac.close();
      updateReady();
      if (!recorder) {
        setStatus("Preview finished.", 1);
        return resolve(true);
      }
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
        setStatus("Done! Your story video is ready below" + (autoDownload ? " and has been downloaded." : ".") +
          (story.voiceError ? " " + story.voiceError : ""), 1, !!story.voiceError);
        if (autoDownload) $("download").click();
        resolve(true);
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
  });
}

/** One click: story -> characters -> pictures -> voices -> recorded video (downloaded automatically). */
async function generateAll() {
  if (story.busy) return;
  const text = $("st_script").value.trim();
  if (!story.data || story.scriptKey !== text + "|" + $("st_chars").value) {
    if (!(await prepare())) return;
  }
  $("st_generate").disabled = true;
  story.cancelled = false;
  $("stop_btn").disabled = false;
  $("stop_btn").onclick = () => {
    story.cancelled = true;
    story.jobId++;
    setStatus("Stopped.", 0);
  };
  setStatus("Making the pictures for every scene...", 0.1);
  const ok = await paintAll();
  if (story.cancelled || !ok) {
    $("st_generate").disabled = false;
    $("stop_btn").disabled = true;
    if (!story.cancelled && !stepMode()) setStatus("Some scenes still need a picture. Upload them in the scene list, then press Generate video again.", null, true);
    return;
  }
  await play(true, true);
  $("st_generate").disabled = false;
  $("stop_btn").disabled = true;
}

function thumbnail() {
  const c = document.createElement("canvas");
  c.width = 1280;
  c.height = 720;
  const ctx = c.getContext("2d");
  const img = story.pictures.find(Boolean);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 1280, 720);
  if (img) drawCover(ctx, img, 1280, 720, "in", 0.5);
  cinematic(ctx, 1280, 720, 0, false);
  bigText(ctx, $("st_title").value || "My Story", 1280, 720, 1, 0.2, 1.5);
  const a = document.createElement("a");
  a.href = c.toDataURL("image/jpeg", 0.92);
  a.download = "thumbnail.jpg";
  a.click();
}

// ---------------------------------------------------------------- wiring
export function initStory() {
  $("st_style").innerHTML = Object.entries(STYLE_LABELS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
  $("st_narrator").innerHTML = Object.entries(VOICES).map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
  $("st_narrator").value = "af_heart";
  $("st_presets").innerHTML = Object.keys(PRESETS).map((k) => `<button type="button" data-preset="${esc(k)}">${esc(k)}</button>`).join("");
  $("st_presets").addEventListener("click", (e) => {
    const k = e.target.dataset.preset;
    if (!k) return;
    const box = $("st_chars");
    box.value = (box.value.trim() ? box.value.trim() + "\n" : "") + PRESETS[k];
  });
  $("st_example").addEventListener("click", () => ($("st_script").value = EXAMPLE));
  $("st_prepare").addEventListener("click", async () => {
    if (await prepare()) paintAll();
  });
  $("st_generate").addEventListener("click", generateAll);
  $("st_preview").addEventListener("click", () => play(false));
  $("st_record").addEventListener("click", () => play(true));
  $("st_thumb").addEventListener("click", thumbnail);
  $("st_style").addEventListener("change", () => {
    if (!story.data) return;
    story.pictures = story.data.scenes.map(() => null);
    story.data.scenes.forEach((_, i) => showThumb(i));
  });
  $("st_narrator").addEventListener("change", renderCast);
  $("st_step").addEventListener("change", () => story.data?.scenes.forEach((_, i) => showThumb(i)));
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
  bigText(ctx, "Your story reel appears here", 720, 1280, 1, 0.45, 0.8);
}
