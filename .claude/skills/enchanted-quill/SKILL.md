---
name: enchanted-quill
description: Make the enchanted quill (from Future Radio and the Enchanted Notebook) write a message in Hershey Script, as a live page or a frame-exact MP4 (landscape or vertical), and extend it with new messages, inks, framings, timings or sounds. Use when asked to make the quill write something, render or re-render a quill video, publish or embed the quill page, or change how the quill writes.
---

# The enchanted quill

The quill writes text one stroke at a time in Hershey Script, a single-stroke cursive. Nothing is a font: each line is ink, laid out before the pen moves so it never runs off the page. One module draws it; one page shows it; one script films it.

```
quill/quill.js       setGlyphs/loadGlyphs, layoutScript, Writer, drawQuill (no dependencies)
quill/glyphs.json    the Hershey Script glyphs
demo/template.html   the page: a notebook sheet on a desk, the quill, "Who's reading?" and "write it again"
demo/index.html      built from the template with the quill and glyphs inlined (never edit by hand)
tools/build-demo.mjs builds demo/index.html
tools/render.mjs     frame-exact MP4 from the page in film mode, with the nib sound
assets/nib.mp3       the quill's nib on paper
test/quill.test.mjs  layout, timing, page, phone width, film mode, render
```

Setup, once: `npm install && npx playwright install chromium` (ffmpeg must be on PATH for video).

## Operate it

**A video of the quill writing something.**

```sh
node tools/render.mjs --message "Hello, {name}.\nSecond line." --name Leo --format vertical --out hello-leo.mp4
```

- `--format landscape` gives 1920×1080; `vertical` gives 1080×1920 with larger lettering.
- `\n` starts a new line, and long lines wrap to the sheet. `{name}` becomes `--name`; the default is "reader".
- `--seconds` sets the writing time. The default is about 0.42 s a word, with a minimum of 5 s.
- `--hold` is how long the finished note stays up (2.8 s), and `--fps` defaults to 30.
- `--ink` takes a CSS colour, and `--no-sound` drops the nib.
- The script prints the length and how long the nib touched the paper.
- Before sending a video, pull two or three stills with ffmpeg and look at them: mid-stroke, and finished.

**The page.** Run `node tools/build-demo.mjs`, then publish or serve `demo/index.html`. It's a body-only page (title, styles, markup, scripts) made for an artifact host that supplies the document skeleton. To open it locally, wrap it in `<!doctype html><html><head><meta charset="utf-8"></head><body>…</body></html>`, as the tests and `render.mjs` do. The page needs no network beyond Google Fonts. It honours reduced motion by showing the finished note at once.

**Embedding with a different message.** Set `window.QUILL_CONFIG` before the page's script runs. It takes the same options as the renderer:

```js
{ message, name, ink, seconds, film, vertical }
```

## Extend it

Change behaviour in one place and keep every use working. Add an option rather than forking the code per message or per video.

- **New default message, wording or framing:** `demo/template.html` (the `CFG` defaults, the header and footer copy, and the film CSS under `body.film`). Rebuild, then run the tests.
- **How the hand writes:** `quill/quill.js`.
  - `layoutScript` sets size, line height and wrapping.
  - `Writer` sets timing: pauses where the pen lifts, a constant speed while it writes, and `ink`, `width` and `paper` (the halo behind the ink).
  - `drawQuill` sets the quill's look.
- **A new format** (square, 4:5): add a viewport and a `body.film.<format>` CSS block. Wire it through `--format` in `tools/render.mjs`, and add a test like the vertical one.
- **Sound:** the nib is gated by the page's own `touching` flag each frame, so it can't drift from the strokes. A new sound (a page turn at the start, ambience) goes into the audio buffer in `render.mjs`, timed from frame numbers.
- **More characters:** the glyph set is Latin letters, digits and common punctuation. Typed names drop anything else. `glyphOf` maps curly quotes and dashes. A missing character draws as `?`, so add glyphs to `quill/glyphs.json` (single-stroke polylines on the Hershey grid, baseline near y=22, with an advance width `w`) rather than mapping to something that looks wrong.

## Rules that keep it honest

- **Frame-exact video comes from stepping, not recording.** In film mode the page has no clock; `render.mjs` calls `window.__step(ms)` for every frame. Keep any new animation a pure function of that clock and its own state, so a re-render is identical.
- **Lay out before writing.** The text is measured and wrapped first, so the quill never runs off the sheet. A test checks that no stroke goes past the width at three widths; keep it passing.
- **The quill writes what it is given.** It doesn't decide the words. In the Enchanted Notebook, answers come from a grounded source and the quill only writes them. Keep that split when you wire it to anything that generates text.
- **Credit the glyphs.** The Hershey fonts are public domain; the glyph data came via the hersheytext project (MIT). Keep `NOTICE.md` with any copy of `quill/glyphs.json`.

Run `npm test` after every change. It checks layout bounds, glyph coverage, timing, the self-contained build, film mode to the end, phone width and name cleaning, and a real render, which is skipped without ffmpeg.
