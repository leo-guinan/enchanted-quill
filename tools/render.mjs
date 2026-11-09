#!/usr/bin/env node
// Render the quill writing a message to an MP4, frame-exact: the demo page runs in film mode with no clock of its
// own, and this script steps it one frame at a time. The nib sound plays only while the pen touches the paper.
//
//   node tools/render.mjs [--message "Hello, {name}.\nSecond line"] [--name Leo] [--format landscape|vertical]
//                         [--out quill.mp4] [--fps 30] [--seconds 8] [--hold 2.8] [--ink "#2a1f16"] [--no-sound]
//
// Needs Playwright's Chromium (npx playwright install chromium) and ffmpeg on PATH.
// landscape: 1920x1080. vertical: 1080x1920. In --message, \n starts a new line and {name} is the reader's name.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const format = opt("format", "landscape");
if (!["landscape", "vertical"].includes(format)) throw new Error("--format is landscape or vertical");
const out = resolve(opt("out", `quill-${format}.mp4`)), fps = Number(opt("fps", 30)), hold = Number(opt("hold", 2.8)), sound = !args.includes("--no-sound");
const config = { film: true, vertical: format === "vertical" };
if (opt("message")) config.message = opt("message").replace(/\\n/g, "\n");
if (opt("name")) config.name = opt("name");
if (opt("ink")) config.ink = opt("ink");
if (opt("seconds")) config.seconds = Number(opt("seconds"));

execFileSync(process.execPath, [join(ROOT, "tools/build-demo.mjs")], { stdio: "ignore" });
const tmp = mkdtempSync(join(tmpdir(), "quill-"));
try {
  const page = readFileSync(join(ROOT, "demo/index.html"), "utf8");
  writeFileSync(join(tmp, "film.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script>window.QUILL_CONFIG=${JSON.stringify(config)}</script>${page}</body></html>`);
  const browser = await chromium.launch();
  const viewport = format === "vertical" ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
  const p = await browser.newPage({ viewport, deviceScaleFactor: 1.5 });
  const errors = []; p.on("pageerror", e => errors.push(String(e)));
  await p.goto("file://" + join(tmp, "film.html"));
  await p.waitForFunction(() => window.__ready, null, { timeout: 20000 });
  await p.waitForTimeout(300);
  const touch = []; let n = 0, doneAt = null;
  for (;;) {
    const r = await p.evaluate(ms => window.__step(ms), n * 1000 / fps);
    touch.push(r.touching ? 1 : 0);
    await p.screenshot({ path: join(tmp, `f${String(n).padStart(5, "0")}.png`) });
    if (r.done && doneAt === null) doneAt = n;
    n++;
    if ((doneAt !== null && n - doneAt > fps * hold) || n > fps * 120) break;
  }
  await browser.close();
  if (errors.length) throw new Error("the page reported errors: " + errors.join("; "));
  const dur = n / fps, fadeOut = Math.max(0, dur - 0.6);

  // the nib: the recorded scratch, gated open while the pen touches (12 ms ramps), over a whisper of room tone
  const SR = 48000, len = Math.ceil(dur * SR);
  const audio = new Float32Array(len * 2);
  if (sound) {
    const raw = execFileSync("ffmpeg", ["-v", "error", "-i", join(ROOT, "assets/nib.mp3"), "-f", "f32le", "-ac", "1", "-ar", String(SR), "-"], { maxBuffer: 1 << 28 });
    const nib = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    let rms = 0; for (const v of nib) rms += v * v; rms = Math.sqrt(rms / nib.length) || 1;
    const gate = new Float32Array(len); for (let i = 0; i < touch.length; i++) if (touch[i]) gate.fill(1, Math.floor(i * SR / fps), Math.min(len, Math.floor((i + 1) * SR / fps)));
    const k = Math.round(0.012 * SR); let acc = 0; const smooth = new Float32Array(len);
    for (let i = 0; i < len; i++) { acc += gate[i] - (i >= k ? gate[i - k] : 0); smooth[i] = acc / k; }
    const level = 10 ** (-26 / 20) / rms; let seed = 7; const noise = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5);
    for (let i = 0; i < len; i++) { const v = nib[i % nib.length] * smooth[i] * level + noise() * 0.0015; audio[2 * i] = v * 0.98; audio[2 * i + 1] = v; }
  }
  writeFileSync(join(tmp, "audio.f32"), Buffer.from(audio.buffer));
  execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(fps), "-i", join(tmp, "f%05d.png"), "-f", "f32le", "-ar", String(SR), "-ac", "2", "-i", join(tmp, "audio.f32"),
    "-filter_complex", `[0:v]fade=t=in:st=0:d=0.5,fade=t=out:st=${fadeOut}:d=0.6,format=yuv420p[v];[1:a]afade=t=in:d=0.3,afade=t=out:st=${fadeOut}:d=0.6${sound ? ",loudnorm=I=-23:TP=-2:LRA=7" : ""}[a]`,
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out]);
  const touching = touch.reduce((a, b) => a + b, 0) / fps;
  console.log(`${out}: ${dur.toFixed(1)} s, ${format}, ${n} frames; the nib touches the paper for ${touching.toFixed(1)} s`);
} finally { rmSync(tmp, { recursive: true, force: true }); }
