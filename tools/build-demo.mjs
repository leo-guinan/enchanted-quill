// Build demo/index.html: the template with the quill module and its glyphs inlined, so the page stands alone
// (publish it as-is, open it from disk, or hand it to tools/render.mjs).
//   node tools/build-demo.mjs
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("../", import.meta.url);
const tpl = readFileSync(new URL("demo/template.html", root), "utf8");
const quill = readFileSync(new URL("quill/quill.js", root), "utf8").replace(/^export /gm, "");
const glyphs = JSON.stringify(JSON.parse(readFileSync(new URL("quill/glyphs.json", root), "utf8"))).replace(/<\//g, "<\\/");
for (const p of ["__QUILL__", "__GLYPHS__"]) if (tpl.split(p).length !== 2) throw new Error(`template needs exactly one ${p}`);
const html = tpl.replace("__QUILL__", () => quill).replace("__GLYPHS__", () => glyphs);
writeFileSync(new URL("demo/index.html", root), html);
console.log(`demo/index.html (${(html.length / 1024).toFixed(1)} KB)`);
