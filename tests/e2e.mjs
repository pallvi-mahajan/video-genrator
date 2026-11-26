// End-to-end test of the Story reel, run on GitHub Actions (a normal internet connection, so AI pictures are reachable).
// Uses step-by-step mode: checks scene 1, approves it, checks scene 2, approves it, then records the video.
import { createServer } from "http";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { extname, join, normalize } from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const OUT = join(ROOT, "test-output");
mkdirSync(OUT, { recursive: true });
const log = (...a) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${a.join(" ")}`;
  console.log(line);
  appendFileSync(join(OUT, "log.txt"), line + "\n");
};

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = createServer((req, res) => {
  const path = normalize(join(ROOT, decodeURIComponent(req.url.split("?")[0]) === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0])));
  try {
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(readFileSync(path));
  } catch {
    res.writeHead(404).end();
  }
}).listen(8080);

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
page.on("console", (m) => m.type() === "error" && log("console error:", m.text().slice(0, 300)));
page.on("pageerror", (e) => log("PAGE ERROR:", e.message));
await page.goto("http://localhost:8080/", { waitUntil: "load" });

const idea = process.env.IDEA?.trim();
if (idea) {
  await page.fill("#st_script", idea);
  await page.click("[data-preset='Curly-haired girl']");
} else {
  await page.click("summary");
  await page.click("#st_example");
}
await page.check("#st_step");
const status = () => page.locator("#status").textContent();
const scenes = idea ? 3 : 2;
if (idea) await page.fill("#st_count", "3");

await page.click("#st_generate");
for (let i = 0; i < scenes; i++) {
  log(`waiting for scene ${i + 1}...`);
  await page.locator(`[data-ok="${i}"]:not(.hidden)`).waitFor({ timeout: 300_000 });
  const prompt = await page.locator(`#st_pstatus_${i}`).textContent();
  log(`scene ${i + 1} ready:`, prompt, "|", (await status()).slice(0, 160));
  await page.locator("#stage").screenshot({ path: join(OUT, `scene-${i + 1}.png`) });
  await page.click(`[data-ok="${i}"]`);
}
await page.screenshot({ path: join(OUT, "page.png"), fullPage: true });
log("all scenes approved; button says:", await page.locator("#st_generate").textContent());

const download = page.waitForEvent("download", { timeout: 600_000 });
await page.click("#st_generate");
let last = "";
const shots = new Set();
const timer = setInterval(async () => {
  try {
    const s = await status();
    if (s.slice(0, 20) !== last.slice(0, 20)) log(s.slice(0, 160));
    last = s;
    const m = s.match(/Recording 0:(\d\d)/);
    if (m && +m[1] % 4 === 1 && !shots.has(m[1])) {
      shots.add(m[1]);
      await page.locator("#stage").screenshot({ path: join(OUT, `frame-${m[1]}.png`) });
    }
  } catch {}
}, 500);
const file = await download;
clearInterval(timer);
await file.saveAs(join(OUT, file.suggestedFilename()));
log("video saved:", file.suggestedFilename());
writeFileSync(join(OUT, "result.txt"), "ok\n");
await browser.close();
server.close();
