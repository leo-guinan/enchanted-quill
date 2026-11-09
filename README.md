# The Enchanted Quill

The quill from [Future Radio](https://story.markets) and the [Enchanted Notebook](https://enchantednotebook.com) writes a message one stroke at a time in Hershey Script, a single-stroke cursive. Nothing is a font: each line is ink, laid out before the pen moves so it never runs off the page.

This repo has the quill, a demo page where it says hello to whoever opens it, and a renderer that films it frame-exact as an MP4, with the sound of the nib only while it touches the paper.

```sh
npm install && npx playwright install chromium     # ffmpeg on PATH for video
node tools/build-demo.mjs                           # demo/index.html: one self-contained page
node tools/render.mjs --out hello.mp4               # 1920x1080: "Hello, reader. …"
node tools/render.mjs --format vertical --name Leo --out hello-leo.mp4                      # 1080x1920
node tools/render.mjs --message "Thank you for reading.\n— the quill" --out thanks.mp4       # any message
npm test
```

## Using the quill in your own page

```js
import { loadGlyphs, layoutScript, Writer, drawQuill } from "./quill/quill.js";
await loadGlyphs("quill/glyphs.json");
const lay = layoutScript("Hello, reader.", { width: 600, size: 1.2, lineH: 52 });
const writer = new Writer(inkCanvas, lay, { dur: 4, ink: "#2a1f16" });
requestAnimationFrame(function frame(now) {
  const { tip, touching, done } = writer.draw(now / 1000);       // ink written so far, and where the nib is
  if (tip && !done) drawQuill(quillCtx, tip, 0.55, { lifted: touching ? 0 : 6, glow: 1 });
  requestAnimationFrame(frame);
});
```

`demo/template.html` shows the whole thing: the quill moving between strokes, resting when it's done, re-laying out on resize, and a film mode with no clock of its own, which `tools/render.mjs` steps frame by frame. The page also takes `window.QUILL_CONFIG`: `{ message, name, ink, seconds, film, vertical }`.

## For agents

`.claude/skills/enchanted-quill/SKILL.md` is a skill for operating and extending the quill: rendering videos, publishing and embedding the page, adding formats, sounds and glyphs, and the rules that keep renders exact. Claude Code picks it up automatically in this repo.

## Layout

```
quill/      quill.js (layout, writer, quill drawing) and glyphs.json
demo/       template.html → index.html (built; don't edit)
tools/      build-demo.mjs, render.mjs
assets/     nib.mp3
test/       quill.test.mjs
```

See `NOTICE.md` for glyph, sound and font credits. This repo doesn't have a licence yet.
