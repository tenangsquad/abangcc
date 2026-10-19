// Draws the loading-screen wallpaper (a 1600×900 SVG scene) and writes it into index.html between the
//   <!-- wallpaper:start --> … <!-- wallpaper:end -->   markers.      node tools/make-wallpaper.mjs
// The scene: a sunset over a Malaysian shophouse street, the KL skyline far away, the ABANG CC shop in the middle
// with its CRTs glowing, Abang waving out front. Everything is vector art in the game's own palette (ink outlines,
// candy colours), so there are no image files to ship.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INK = '#2a2150';
const BASE = 780; // street level (y)

const out = [];
const add = (s) => out.push(s);
const lines = (strokeW = 5) => `stroke="${INK}" stroke-width="${strokeW}" stroke-linejoin="round" stroke-linecap="round"`;

/* ---------- deterministic pseudo-random (so the picture never changes between builds) ---------- */
let seed = 2007;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

/* ---------- defs ---------- */
add(`<defs>
  <linearGradient id="wpSky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1c1250"/><stop offset=".38" stop-color="#52299c"/><stop offset=".62" stop-color="#c8479f"/>
    <stop offset=".8" stop-color="#ff7a59"/><stop offset="1" stop-color="#ffcf3d"/>
  </linearGradient>
  <linearGradient id="wpSun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2a8"/><stop offset=".55" stop-color="#ffcf3d"/><stop offset="1" stop-color="#ff8f3d"/></linearGradient>
  <linearGradient id="wpRoad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3596"/><stop offset="1" stop-color="#2b1d6b"/></linearGradient>
  <linearGradient id="wpScreen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8be0ff"/><stop offset="1" stop-color="#3a8cff"/></linearGradient>
  <radialGradient id="wpGlow"><stop offset="0" stop-color="#fff2a8" stop-opacity=".95"/><stop offset="1" stop-color="#ffcf3d" stop-opacity="0"/></radialGradient>
  <radialGradient id="wpGlowBlue"><stop offset="0" stop-color="#7fe6ff" stop-opacity=".75"/><stop offset="1" stop-color="#4cc3ff" stop-opacity="0"/></radialGradient>
  <radialGradient id="wpVignette" cx=".5" cy=".46" r=".78"><stop offset=".55" stop-color="#140a46" stop-opacity="0"/><stop offset="1" stop-color="#140a46" stop-opacity=".78"/></radialGradient>
  <filter id="wpNeon" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <pattern id="wpDots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.6" fill="#fff" opacity=".07"/></pattern>
</defs>`);

/* ---------- sky ---------- */
add(`<rect width="1600" height="900" fill="url(#wpSky)"/><rect width="1600" height="900" fill="url(#wpDots)"/>`);
add(`<g class="wp-stars" fill="#fff">`);
for (let i = 0; i < 70; i++) {
  const x = rnd() * 1600, y = rnd() * 330, r = 1.2 + rnd() * 2.2;
  add(`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" opacity="${(0.35 + rnd() * 0.65).toFixed(2)}" ${i % 5 === 0 ? 'class="wp-twinkle"' : ''}/>`);
}
add(`</g>`);

/* ---------- retro striped sun ---------- */
add(`<g><circle cx="800" cy="560" r="250" fill="url(#wpGlow)" opacity=".55"/><circle cx="800" cy="560" r="195" fill="url(#wpSun)" ${lines(6)}/>`);
// horizontal "cut" stripes in sky colours make the 80s/Y2K sun
[[500, 6], [525, 9], [553, 12], [583, 15]].forEach(([y, h]) => add(`<rect x="590" y="${y}" width="420" height="${h}" fill="#e0589f" opacity=".92"/>`));
add(`</g>`);

/* ---------- clouds ---------- */
const cloud = (x, y, s, o = 0.9) => add(`<g transform="translate(${x} ${y}) scale(${s})" opacity="${o}"><g ${lines(4)} fill="#fff4ff"><ellipse cx="0" cy="0" rx="70" ry="24"/><ellipse cx="-34" cy="-16" rx="34" ry="24"/><ellipse cx="14" cy="-26" rx="40" ry="30"/><ellipse cx="46" cy="-8" rx="28" ry="20"/></g><rect x="-66" y="2" width="136" height="20" fill="#fff4ff"/></g>`);
add(`<g class="wp-cloud-a">`); cloud(230, 270, 1.05); cloud(1330, 215, 0.85); add(`</g>`);
add(`<g class="wp-cloud-b">`); cloud(70, 150, 0.6, 0.8); cloud(1170, 330, 1.1); add(`</g>`);

/* ---------- far skyline: KL towers ---------- */
add(`<g fill="#3b2587" opacity=".95">`);
const far = [[0, 120, 640], [110, 150, 600], [250, 90, 650], [470, 110, 620], [1030, 100, 630], [1130, 140, 590], [1250, 120, 640], [1420, 150, 610], [1500, 130, 650]];
far.forEach(([x, w, y]) => add(`<rect x="${x}" y="${y}" width="${w}" height="${BASE - y}" rx="4"/>`));
// twin towers (left of the shop)
const twin = (x) => {
  add(`<g transform="translate(${x} 0)">`);
  for (const dx of [0, 62]) {
    add(`<path d="M${dx} ${BASE} V500 L${dx + 8} 470 H${dx + 38} L${dx + 46} 500 V${BASE} Z"/>`);
    add(`<path d="M${dx + 8} 470 L${dx + 14} 430 H${dx + 32} L${dx + 38} 470 Z"/><rect x="${dx + 21}" y="372" width="4" height="60"/>`);
  }
  add(`<rect x="46" y="560" width="16" height="10"/></g>`);
};
twin(330);
// KL tower (right of the shop)
add(`<g transform="translate(1330 0)"><path d="M-12 ${BASE} L-5 420 H5 L12 ${BASE} Z"/><ellipse cx="0" cy="420" rx="30" ry="14"/><rect x="-18" y="402" width="36" height="26" rx="8"/><rect x="-2" y="320" width="4" height="86"/></g>`);
add(`</g>`);
// lit windows on the far buildings
add(`<g fill="#ffe27a" opacity=".55">`);
for (let i = 0; i < 46; i++) {
  const [x, w, y] = far[Math.floor(rnd() * far.length)];
  add(`<rect x="${(x + 12 + rnd() * (w - 30)).toFixed(0)}" y="${(y + 18 + rnd() * 90).toFixed(0)}" width="8" height="11" rx="2"/>`);
}
add(`</g>`);

/* ---------- shophouses ---------- */
function awning(x, w, y, c1, c2, n = 6) {
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    const x0 = x + i * sw;
    add(`<path d="M${x0} ${y} h${sw} l${sw * 0.12 + 1.5} 30 h${-sw - 3} Z" fill="${i % 2 ? c2 : c1}" ${lines(3.5)}/>`);
  }
}
function ruko(x, w, h, body, shade, { aw = ['#fff7ea', '#ff5d73'], door = true, sign = '' } = {}) {
  const y = BASE - h;
  add(`<g>`);
  add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${body}" ${lines()}/>`);
  add(`<rect x="${x - 8}" y="${y - 20}" width="${w + 16}" height="26" rx="9" fill="${shade}" ${lines()}/>`);
  // upper windows
  for (let i = 0; i < 2; i++) {
    const wx = x + w * (0.13 + i * 0.47), ww = w * 0.34, wy = y + 34, wh = h * 0.27;
    add(`<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="7" fill="#ffe27a" ${lines(4)}/><path d="M${wx + ww / 2} ${wy} v${wh} M${wx} ${wy + wh / 2} h${ww}" ${lines(3)} fill="none"/>`);
    add(`<rect x="${wx - 6}" y="${wy + wh}" width="${ww + 12}" height="9" rx="4" fill="${shade}" ${lines(3.5)}/>`);
  }
  if (sign) add(`<rect x="${x + w * 0.18}" y="${y + h * 0.42}" width="${w * 0.64}" height="22" rx="7" fill="#2a2150"/><text x="${x + w / 2}" y="${y + h * 0.42 + 16}" text-anchor="middle" font-family="Fredoka, Arial Rounded MT Bold, sans-serif" font-weight="700" font-size="14" fill="#7fe6c6">${sign}</text>`);
  const ay = BASE - h * 0.4;
  awning(x - 4, w + 8, ay, aw[0], aw[1]);
  if (door) {
    add(`<rect x="${x + w * 0.58}" y="${ay + 36}" width="${w * 0.26}" height="${BASE - ay - 36}" rx="6" fill="#2a2150" ${lines(4)}/>`);
    add(`<rect x="${x + w * 0.12}" y="${ay + 44}" width="${w * 0.36}" height="${BASE - ay - 70}" rx="6" fill="#ffe27a" ${lines(4)}/>`);
  }
  add(`</g>`);
}
ruko(-60, 230, 250, '#ff7a59', '#d4543b', { sign: 'MAMAK 24J' });
ruko(195, 210, 300, '#4cc3ff', '#2f93d6', { aw: ['#fff7ea', '#7b5cff'], sign: 'KEDAI RUNCIT' });
ruko(430, 140, 215, '#ff7ac6', '#d453a2', { door: false, aw: ['#fff7ea', '#2fd6a3'] });
// the ABANG CC shop (centre)
{
  const x = 600, w = 400, h = 340, y = BASE - h;
  add(`<g>`);
  add(`<ellipse cx="800" cy="${BASE - 60}" rx="300" ry="120" fill="url(#wpGlowBlue)" opacity=".5"/>`);
  add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#ffcf3d" ${lines(6)}/>`);
  add(`<rect x="${x - 12}" y="${y - 24}" width="${w + 24}" height="32" rx="12" fill="#ff8f3d" ${lines(6)}/>`);
  // rooftop neon board
  add(`<rect x="680" y="${y - 24 - 14}" width="12" height="40" fill="${INK}"/><rect x="908" y="${y - 24 - 14}" width="12" height="40" fill="${INK}"/>`);
  add(`<g class="wp-neon"><rect x="640" y="${y - 130}" width="320" height="102" rx="20" fill="${INK}" ${lines(6)}/>`);
  add(`<rect x="652" y="${y - 118}" width="296" height="78" rx="14" fill="none" stroke="#2fd6a3" stroke-width="4" filter="url(#wpNeon)"/>`);
  add(`<text x="800" y="${y - 76}" text-anchor="middle" font-family="Fredoka, Arial Rounded MT Bold, sans-serif" font-weight="700" font-size="46" fill="#7fffd4" filter="url(#wpNeon)" letter-spacing="2">CYBER CAFÉ</text>`);
  add(`<text x="800" y="${y - 50}" text-anchor="middle" font-family="Fredoka, Arial Rounded MT Bold, sans-serif" font-weight="600" font-size="19" fill="#ffcf3d" filter="url(#wpNeon)" letter-spacing="6">INTERNET · GAME · 24 JAM</text></g>`);
  // second floor: three curtained windows + price banner
  for (let i = 0; i < 3; i++) {
    const wx = x + 28 + i * 124;
    add(`<rect x="${wx}" y="${y + 36}" width="92" height="88" rx="10" fill="#8be0ff" ${lines(5)}/><path d="M${wx + 46} ${y + 36} v88 M${wx} ${y + 80} h92" ${lines(3.5)} fill="none"/>`);
    add(`<path d="M${wx + 4} ${y + 40} q14 20 0 40 v-40 Z M${wx + 88} ${y + 40} q-14 20 0 40 v-40 Z" fill="#ff5d73" ${lines(3)}/>`);
  }
  add(`<g transform="rotate(-2 800 ${y + 150})"><rect x="${x + 22}" y="${y + 138}" width="250" height="40" rx="12" fill="#ff5d73" ${lines(5)}/><text x="${x + 147}" y="${y + 166}" text-anchor="middle" font-family="Fredoka, Arial Rounded MT Bold, sans-serif" font-weight="700" font-size="24" fill="#fff8ea">RM1 / 30 MINIT!</text></g>`);
  // awning
  awning(x - 8, w + 16, y + 196, '#fff7ea', '#2fd6a3', 10);
  // ground floor: display window with CRTs, glass door, poster window
  add(`<rect x="${x + 22}" y="${y + 236}" width="190" height="${BASE - y - 236}" rx="8" fill="#2f2570" ${lines(5)}/>`);
  add(`<rect x="${x + 28}" y="${y + 244}" width="178" height="${BASE - y - 252}" rx="6" fill="url(#wpGlowBlue)" opacity=".9"/>`);
  const crt = (cx, cy, s) => {
    add(`<g transform="translate(${cx} ${cy}) scale(${s})"><rect x="-34" y="-30" width="68" height="56" rx="12" fill="#efe6cf" ${lines(4)}/><rect x="-26" y="-23" width="52" height="38" rx="9" fill="url(#wpScreen)" ${lines(3)}/>`);
    add(`<path d="M-12 -8 q12 14 24 0" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><circle cx="-10" cy="-12" r="2.6" fill="#fff"/><circle cx="10" cy="-12" r="2.6" fill="#fff"/>`);
    add(`<rect x="-14" y="26" width="28" height="9" rx="3" fill="#d9ceb2" ${lines(3)}/><rect x="-28" y="35" width="56" height="9" rx="4" fill="#efe6cf" ${lines(3)}/></g>`);
  };
  crt(x + 78, y + 296, 1.0); crt(x + 156, y + 296, 1.0);
  add(`<rect x="${x + 32}" y="${y + 335}" width="170" height="10" rx="3" fill="#ffb361" ${lines(3)}/>`);
  // door
  add(`<rect x="${x + 238}" y="${y + 232}" width="96" height="${BASE - y - 232}" rx="10" fill="#8be0ff" ${lines(6)}/><path d="M${x + 286} ${y + 232} v${BASE - y - 232}" ${lines(4)} fill="none"/>`);
  add(`<rect x="${x + 258}" y="${y + 250}" width="56" height="26" rx="8" fill="#ff5d73" ${lines(4)}/><text x="${x + 286}" y="${y + 269}" text-anchor="middle" font-family="Fredoka, Arial Rounded MT Bold, sans-serif" font-weight="700" font-size="15" fill="#fff8ea">BUKA</text>`);
  // poster window
  add(`<rect x="${x + 352}" y="${y + 236}" width="38" height="${BASE - y - 236}" rx="6" fill="#7b5cff" ${lines(5)}/><circle cx="${x + 371}" cy="${y + 290}" r="11" fill="#ffcf3d" ${lines(3)}/>`);
  add(`</g>`);
}
ruko(1030, 150, 230, '#2fd6a3', '#17a37c', { aw: ['#fff7ea', '#ff8f3d'], sign: 'SALON' });
ruko(1205, 230, 290, '#a78bff', '#7b5cff', { aw: ['#fff7ea', '#ffcf3d'], sign: 'KEDAI KOPI' });
ruko(1460, 200, 250, '#ffb361', '#e08a2c', { aw: ['#fff7ea', '#4cc3ff'], sign: 'FOTOSTAT' });

/* ---------- power lines + poles ---------- */
add(`<g fill="none" ${lines(3)} opacity=".9">`);
add(`<path d="M-20 300 Q 380 360 780 300 T 1620 310"/><path d="M-20 326 Q 380 384 780 326 T 1620 338"/><path d="M-20 350 Q 380 404 780 352 T 1620 362"/>`);
add(`</g>`);
for (const px of [150, 1500]) add(`<g><rect x="${px - 7}" y="290" width="14" height="${BASE - 290}" fill="#2a2150"/><rect x="${px - 44}" y="298" width="88" height="10" rx="4" fill="#2a2150"/><rect x="${px - 30}" y="330" width="60" height="9" rx="4" fill="#2a2150"/></g>`);

/* ---------- street ---------- */
add(`<rect x="0" y="${BASE}" width="1600" height="30" fill="#9b7bff" ${lines(5)}/>`);
add(`<rect x="0" y="${BASE + 30}" width="1600" height="90" fill="url(#wpRoad)"/>`);
add(`<path d="M0 ${BASE + 30} H1600" ${lines(5)}/>`);
for (let i = 0; i < 16; i++) add(`<path d="M${i * 100 + 8} ${BASE + 6} v18" stroke="${INK}" stroke-width="3" opacity=".35"/>`);
add(`<g fill="#ffcf3d" opacity=".9">`);
for (let i = 0; i < 12; i++) add(`<rect x="${i * 140 - 20}" y="${BASE + 92}" width="78" height="9" rx="4"/>`);
add(`</g>`);
// lamp posts
for (const lx of [545, 1085]) {
  add(`<g><ellipse cx="${lx}" cy="${BASE - 205}" rx="70" ry="64" fill="url(#wpGlow)" opacity=".7"/><rect x="${lx - 5}" y="${BASE - 200}" width="10" height="204" rx="4" fill="${INK}"/>`);
  add(`<path d="M${lx - 5} ${BASE - 198} q0 -22 24 -22" fill="none" ${lines(8)}/><circle cx="${lx + 22}" cy="${BASE - 168}" r="14" fill="#fff2a8" ${lines(4)}/></g>`);
}

/* ---------- Abang, waving ---------- */
add(`<g transform="translate(900 ${BASE + 4}) scale(1.25)">`);
add(`<ellipse cx="0" cy="2" rx="46" ry="9" fill="${INK}" opacity=".35"/>`);
add(`<rect x="-19" y="-52" width="15" height="40" rx="7" fill="#3b3566" ${lines(4)}/><rect x="4" y="-52" width="15" height="40" rx="7" fill="#3b3566" ${lines(4)}/>`);
add(`<ellipse cx="-14" cy="-8" rx="15" ry="8" fill="#fff8ea" ${lines(4)}/><ellipse cx="14" cy="-8" rx="15" ry="8" fill="#fff8ea" ${lines(4)}/>`);
add(`<path d="M-26 -62 h52 v14 q0 8 -8 8 h-36 q-8 0 -8 -8 Z" fill="#3b3566" ${lines(4)}/>`);
add(`<rect x="-27" y="-112" width="54" height="62" rx="20" fill="#2fd6a3" ${lines(5)}/>`);
add(`<text x="0" y="-76" text-anchor="middle" font-family="Fredoka, Arial Rounded MT Bold, sans-serif" font-weight="700" font-size="17" fill="#fff8ea">CC</text>`);
add(`<g transform="translate(-27 -100) rotate(18)"><rect x="-9" y="0" width="14" height="42" rx="7" fill="#2fd6a3" ${lines(4)}/><circle cx="-2" cy="44" r="9" fill="#ffd2a3" ${lines(4)}/></g>`);
add(`<g class="wp-wave" style="transform-origin:27px -100px"><g transform="translate(27 -100) rotate(-150)"><rect x="-5" y="0" width="14" height="44" rx="7" fill="#2fd6a3" ${lines(4)}/><circle cx="2" cy="47" r="10" fill="#ffd2a3" ${lines(4)}/></g></g>`);
add(`<circle cx="0" cy="-146" r="38" fill="#ffd2a3" ${lines(5)}/>`);
add(`<ellipse cx="-14" cy="-134" rx="7" ry="4.5" fill="#ff8fa3" opacity=".7"/><ellipse cx="14" cy="-134" rx="7" ry="4.5" fill="#ff8fa3" opacity=".7"/>`);
add(`<circle cx="-12" cy="-148" r="5.2" fill="${INK}"/><circle cx="12" cy="-148" r="5.2" fill="${INK}"/><circle cx="-10.4" cy="-150" r="1.8" fill="#fff"/><circle cx="13.6" cy="-150" r="1.8" fill="#fff"/>`);
add(`<path d="M-9 -133 q9 11 18 0" fill="#ff5d73" ${lines(3.5)}/>`);
add(`<path d="M-40 -158 q0 -34 40 -34 q40 0 40 34 Z" fill="#ffcf3d" ${lines(5)}/><path d="M12 -160 q36 -2 46 12 q-26 6 -46 -2 Z" fill="#f0a800" ${lines(5)}/><circle cx="0" cy="-192" r="5" fill="#f0a800" ${lines(3)}/>`);
add(`</g>`);

/* ---------- floating coins ---------- */
const coin = (x, y, s, cls) => add(`<g class="${cls}"><g transform="translate(${x} ${y}) scale(${s})"><circle r="26" fill="#ffcf3d" ${lines(5)}/><circle r="17" fill="none" stroke="#f0a800" stroke-width="3"/><text y="7" text-anchor="middle" font-family="Fredoka, Arial Rounded MT Bold, sans-serif" font-weight="700" font-size="19" fill="#b97800">RM</text></g></g>`);
coin(520, 560, 1, 'wp-bob-a'); coin(1130, 520, 0.8, 'wp-bob-b'); coin(300, 470, 0.65, 'wp-bob-b'); coin(1290, 600, 0.6, 'wp-bob-a');
// sparkles
const spark = (x, y, s) => add(`<path transform="translate(${x} ${y}) scale(${s})" d="M0 -16 Q2 -2 16 0 Q2 2 0 16 Q-2 2 -16 0 Q-2 -2 0 -16 Z" fill="#fff8ea" class="wp-twinkle"/>`);
spark(470, 400, 1); spark(1180, 430, 0.8); spark(700, 300, 0.7); spark(1400, 500, 0.9); spark(250, 560, 0.6);

add(`<rect width="1600" height="900" fill="url(#wpVignette)"/>`);

const svg = `<svg class="ld-art" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">\n${out.join('\n')}\n</svg>`;

const file = path.join(root, 'index.html');
let html = fs.readFileSync(file, 'utf8');
const re = /<!-- wallpaper:start[^>]*-->[\s\S]*?<!-- wallpaper:end -->/;
if (!re.test(html)) throw new Error('index.html has no wallpaper markers');
html = html.replace(re, () => `<!-- wallpaper:start (generated by tools/make-wallpaper.mjs — edit that file, not this block) -->\n${svg}\n<!-- wallpaper:end -->`);
fs.writeFileSync(file, html);
console.log(`wallpaper written to index.html (${(svg.length / 1024).toFixed(0)} KB of SVG)`);
