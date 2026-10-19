// Bundles index.html + css + js into ONE standalone file: dist/ABANG_CC_2007_ALPHA_12.html
//   node tools/build.mjs
// No dependencies. The result needs no server and no other files (it still asks Google Fonts for the
// display fonts when online; offline it falls back to system fonts).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');
let scripts = 0;

// <link rel="stylesheet" href="css/x.css">  →  <style>…</style>
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => `<style>\n${read(href)}\n</style>`);

// <script src="js/x.js"></script>  →  <script>…</script>   (order is preserved)
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const code = read(src);
  if (/<\/script/i.test(code)) throw new Error(`${src} contains "</script" — cannot inline`);
  scripts++;
  return `<script>\n/* ---- ${src} ---- */\n${code}\n</script>`;
});

const out = path.join(root, 'dist', 'ABANG_CC_2007_ALPHA_12.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
const kb = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`built ${path.relative(root, out)}  (${kb} KB, ${scripts} scripts inlined)`);
