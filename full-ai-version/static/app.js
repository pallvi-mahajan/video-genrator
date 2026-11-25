const $ = (id) => document.getElementById(id);
let photoData = "";
let maxSeconds = 300;

async function init() {
  const opts = await (await fetch("api/options")).json();
  const fill = (el, items, def) => {
    el.innerHTML = items.map((i) => `<option ${i === def ? "selected" : ""}>${i}</option>`).join("");
  };
  fill($("style"), opts.styles, "cartoon");
  fill($("camera"), opts.cameras, "static");
  fill($("quality"), opts.qualities, "fast");
  fill($("voice"), opts.voices, opts.voices[0]);
  maxSeconds = opts.max_seconds;
  $("minutes").max = Math.floor(maxSeconds / 60);
  $("gpu").textContent = `GPU: ${opts.gpu}`;
  updateEta();
  loadGallery();
}

const totalSeconds = () => Math.min(maxSeconds, Math.max(1, (+$("minutes").value || 0) * 60 + (+$("seconds").value || 0)));

function fmt(s) {
  s = Math.round(s);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function updateEta() {
  const s = totalSeconds();
  const direct = photoData && $("photo_mode").value === "direct";
  $("eta").textContent = direct
    ? `${fmt(s)} video. Animating your photo is quick.`
    : `${fmt(s)} video = ${Math.ceil(s / 2)} AI parts of 2 sec each. ` + (+$("time_limit_min").value
      ? `It will be ready within ${$("time_limit_min").value} min. If there isn't time for every part, some parts replay.`
      : "No time limit: every part is new, so long videos can take a long time.");
}

["minutes", "seconds", "photo_mode", "time_limit_min"].forEach((id) => $(id).addEventListener("input", updateEta));
$("chips").addEventListener("click", (e) => {
  const s = e.target.dataset.s;
  if (!s) return;
  $("minutes").value = Math.floor(s / 60);
  $("seconds").value = s % 60;
  updateEta();
});

$("photo").addEventListener("change", () => {
  const file = $("photo").files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    photoData = reader.result;
    $("photo_preview").src = photoData;
    ["photo_preview", "photo_opts", "photo_clear"].forEach((id) => $(id).classList.remove("hidden"));
    syncPhotoMode();
  };
  reader.readAsDataURL(file);
});

$("photo_clear").addEventListener("click", () => {
  photoData = "";
  $("photo").value = "";
  ["photo_preview", "photo_opts", "photo_clear"].forEach((id) => $(id).classList.add("hidden"));
  updateEta();
});

function syncPhotoMode() {
  $("strength_wrap").classList.toggle("hidden", $("photo_mode").value !== "ai");
  updateEta();
}
$("photo_mode").addEventListener("change", syncPhotoMode);
$("photo_strength").addEventListener("input", () => ($("strength_val").textContent = $("photo_strength").value));

async function loadGallery() {
  const items = await (await fetch("api/history")).json();
  $("gallery").innerHTML = items.length
    ? items.map((v) => `<figure><video src="${v.video.replace(/^\//, "")}" muted preload="metadata" onmouseover="this.play()" onmouseout="this.pause()" controls></video>
        <figcaption>${escapeHtml(v.request.prompt || "(photo)")}<br>${v.duration ? fmt(v.duration) + " · " : ""}made in ${fmt(v.elapsed)}</figcaption></figure>`).join("")
    : `<p class="small">No videos yet. Generate your first one!</p>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const direct = photoData && $("photo_mode").value === "direct";
  if (!direct && !$("prompt").value.trim() && !$("scenes").value.trim()) {
    alert("Please describe what the video should show.");
    return;
  }
  const body = {
    prompt: $("prompt").value, scenes: $("scenes").value, character: $("character").value, scene: $("scene").value,
    style: $("style").value, camera: $("camera").value, duration: totalSeconds(),
    quality: $("quality").value, seed: +$("seed").value, use_llm: $("use_llm").checked,
    dialogue: $("dialogue").value, voice: $("voice").value, voice_speed: +$("voice_speed").value,
    lipsync: $("lipsync").checked,
    photo_b64: photoData, photo_mode: $("photo_mode").value, photo_strength: +$("photo_strength").value,
    time_limit_min: +$("time_limit_min").value,
  };
  $("go").disabled = true;
  $("result").classList.add("hidden");
  $("status").classList.remove("hidden");
  $("stage").className = "stage";
  $("stage").textContent = "Uploading...";
  $("fill").style.width = "0%";

  const res = await fetch("api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    $("stage").className = "stage error";
    $("stage").textContent = "Error: " + (typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail));
    $("go").disabled = false;
    return;
  }
  poll(data.id);
});

async function poll(id) {
  const job = await (await fetch(`api/jobs/${id}`)).json();
  if (job.status === "done") {
    $("status").classList.add("hidden");
    $("result").classList.remove("hidden");
    const url = job.video.replace(/^\//, "");
    $("video").src = url;
    $("download").href = url;
    $("meta").innerHTML = (job.warning ? `<span class="warn">${escapeHtml(job.warning)}</span><br>` : "")
      + escapeHtml(`${fmt(job.duration)} video · made in ${fmt(job.elapsed)} · seed ${job.seed ?? "-"} · ${job.final_prompt}`);
    $("go").disabled = false;
    return loadGallery();
  }
  if (job.status === "error") {
    $("stage").className = "stage error";
    $("stage").textContent = "Error: " + job.error;
    $("go").disabled = false;
    return;
  }
  const pct = Math.round((job.progress || 0) * 100);
  const seg = job.segments > 1 ? ` (part ${job.segment} of ${job.segments})` : "";
  $("stage").textContent = job.status === "queued" ? "Waiting in queue..."
    : job.stage === "loading model" ? "Loading AI model..."
    : job.stage === "voice" ? "Creating character voice..."
    : job.stage === "lipsync" ? "Lip-syncing mouth to voice..."
    : job.stage === "saving" ? "Saving video..."
    : `Generating... ${pct}%${seg}`;
  $("fill").style.width = pct + "%";
  if (job.running_for) {
    const left = pct > 2 ? ` · about ${fmt((job.running_for / pct) * (100 - pct))} left` : "";
    $("timer").textContent = `Running for ${fmt(job.running_for)}${left}`;
  }
  setTimeout(() => poll(id), 2000);
}

init();
