import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { setGlyphs, layoutScript, Writer } from "../quill/quill.js";

const ROOT = new URL("../", import.meta.url).pathname;
setGlyphs(JSON.parse(readFileSync(join(ROOT, "quill/glyphs.json"), "utf8")));
const MSG = "Hello, reader.\nI started writing this the moment you arrived, so the ink is still wet.\n— the quill";

test("layout wraps to the width it is given and never writes past it", () => {
  for (const width of [240, 400, 700]) {
    const lay = layoutScript(MSG, { width, size: 1, lineH: 44, paraGap: 0, x0: 2, y0: 40 });
    const xs = lay.strokes.flatMap(s => s.pts.map(p => p[0]));
    assert.ok(Math.min(...xs) >= 0 && Math.max(...xs) <= width, `width ${width}: ${Math.min(...xs)}..${Math.max(...xs)}`);
  }
  const narrow = layoutScript(MSG, { width: 240, size: 1, lineH: 44 }), wide = layoutScript(MSG, { width: 700, size: 1, lineH: 44 });
  assert.ok(narrow.height > wide.height, "a narrower sheet takes more lines");
});

test("every letter, digit and common punctuation mark has a glyph", () => {
  const g = JSON.parse(readFileSync(join(ROOT, "quill/glyphs.json"), "utf8"));
  const missing = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:!?'\"-()"].filter(c => !g[c]);
  assert.deepEqual(missing, []);
});

test("the writer spends the time it is given: pauses where the pen lifts, steady while it writes", () => {
  const lay = layoutScript(MSG, { width: 500, size: 1, lineH: 44 });
  const w = new Writer({ width: 500, clientWidth: 500 }, lay, { dur: 8 });
  assert.ok(Math.abs(w.total - 8) < 0.05, String(w.total));
  assert.ok(w.segs.every((s, i) => s.b >= s.a && (i === 0 || s.a >= w.segs[i - 1].b)), "strokes are written in order, one at a time");
});

test("the demo builds into one self-contained page", () => {
  execFileSync(process.execPath, [join(ROOT, "tools/build-demo.mjs")]);
  const html = readFileSync(join(ROOT, "demo/index.html"), "utf8");
  assert.ok(!/__QUILL__|__GLYPHS__/.test(html));
  assert.match(html, /<title>The Quill Says Hello<\/title>/);
  assert.ok(!/<script[^>]+src=/.test(html), "no external scripts");
  assert.ok(html.length < 100_000);
});

async function open(config, viewport) {
  const browser = await chromium.launch(), page = await browser.newPage({ viewport }), errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  const html = readFileSync(join(ROOT, "demo/index.html"), "utf8");
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${config ? `<script>window.QUILL_CONFIG=${JSON.stringify(config)}</script>` : ""}${html}</body></html>`);
  return { browser, page, errors };
}

test("in film mode the page writes the note to the end, one stepped frame at a time", async () => {
  const { browser, page, errors } = await open({ film: true, name: "Leo" }, { width: 1280, height: 720 });
  try {
    await page.waitForFunction(() => window.__ready, null, { timeout: 15000 });
    assert.match(await page.textContent("#said"), /^Hello, Leo\. I started writing/);
    let touched = 0, done = false, n = 0;
    for (; n < 30 * 20 && !done; n++) { const r = await page.evaluate(ms => window.__step(ms), n * 1000 / 30); touched += r.touching ? 1 : 0; done = r.done; }
    assert.ok(done, "the note finishes"); assert.ok(touched > 30 && touched < n, `the nib touches for ${touched} of ${n} frames, and lifts`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("on a phone the page fits, and a typed name is written instead of 'reader'", async () => {
  const { browser, page, errors } = await open(null, { width: 390, height: 844 });
  try {
    await page.waitForFunction(() => document.querySelector("#said").textContent.length > 0, null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    await page.fill("#name", "Ada <script>"); await page.click("#again");
    assert.match(await page.textContent("#said"), /^Hello, Ada script\./, "unsupported characters are dropped from names");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
test("render.mjs makes an MP4 of the right shape", { skip: !hasFfmpeg && "ffmpeg is not on PATH" }, () => {
  const out = join(mkdtempSync(join(tmpdir(), "quill-test-")), "t.mp4");
  execFileSync(process.execPath, [join(ROOT, "tools/render.mjs"), "--message", "Hi.", "--seconds", "1", "--fps", "12", "--hold", "0.3", "--format", "vertical", "--out", out], { stdio: "pipe" });
  assert.ok(existsSync(out));
  const dims = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", out], { encoding: "utf8" }).trim();
  assert.equal(dims, "1080,1920");
});
