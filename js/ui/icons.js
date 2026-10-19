/* ==========================================================================
   4c. ICONS — the small cartoon icon set for the menu and buttons
   --------------------------------------------------------------------------
   Drawn as inline SVG so they look the same on every phone and PC (emoji and ▶ / ? glyphs do not: each system
   draws them differently). Same look as the rest of the game: fat ink outline, flat bright fill.
   UI.icon('play') → an <svg> string.   Names: play · resume · restart · guide · collection · settings · home
   ========================================================================== */
(function (ns) {
  'use strict';

  const UI = ns.UI;
  const INK = '#2a2150';
  const C = { yellow: '#ffcf3d', mint: '#2fd6a3', sky: '#4cc3ff', coral: '#ff5d73', violet: '#7b5cff', paper: '#fff8ea', white: '#ffffff' };

  /** A fat outline pass (so overlapping shapes share one clean outline), then the colour pass on top. */
  const icon = (outline, fills, extra = '') =>
    `<g fill="${INK}" stroke="${INK}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">${outline}</g>${fills}${extra}`;

  const teeth = (fill) => [0, 45, 90, 135].map((a) => `<rect x="21" y="4.5" width="6" height="39" rx="2.5" transform="rotate(${a} 24 24)"${fill ? ` fill="${fill}"` : ''}/>`).join('');

  const SHAPES = {
    // ▶
    play: icon('<path d="M16 9 L39 24 L16 39 Z"/>', `<path d="M16 9 L39 24 L16 39 Z" fill="${C.yellow}"/>`, `<path d="M20 15 L30 22" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>`),
    // ▶▶ (pick up where you left off)
    resume: icon('<path d="M6 12 L22 24 L6 36 Z"/><path d="M24 12 L42 24 L24 36 Z"/>', `<path d="M6 12 L22 24 L6 36 Z" fill="${C.yellow}"/><path d="M24 12 L42 24 L24 36 Z" fill="${C.yellow}"/>`),
    // ↻
    restart: icon('<path d="M37 24 A13 13 0 1 1 30 12.5" fill="none" stroke-width="9"/><path d="M38 17 L33 5.5 L25.5 18 Z"/>',
      `<path d="M37 24 A13 13 0 1 1 30 12.5" fill="none" stroke="${C.coral}" stroke-width="4.5" stroke-linecap="round"/><path d="M38 17 L33 5.5 L25.5 18 Z" fill="${C.coral}"/>`),
    // open book
    guide: icon('<path d="M24 13 C19 9 11 9 5 12 L5 38 C11 35 19 35 24 39 Z"/><path d="M24 13 C29 9 37 9 43 12 L43 38 C37 35 29 35 24 39 Z"/>',
      `<path d="M24 13 C19 9 11 9 5 12 L5 38 C11 35 19 35 24 39 Z" fill="${C.white}"/><path d="M24 13 C29 9 37 9 43 12 L43 38 C37 35 29 35 24 39 Z" fill="#d9f2ff"/>`,
      `<path d="M10 19 C13 18 17 18 20 20 M10 26 C13 25 17 25 20 27 M28 20 C31 18 35 18 38 19 M28 27 C31 25 35 25 38 26" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path d="M24 13 L24 39" stroke="${INK}" stroke-width="2.6"/>`),
    // top hat
    collection: icon('<rect x="5" y="33" width="38" height="8" rx="4"/><rect x="12" y="7" width="24" height="29" rx="5"/>',
      `<rect x="5" y="33" width="38" height="8" rx="4" fill="${C.violet}"/><rect x="12" y="7" width="24" height="29" rx="5" fill="${C.violet}"/><rect x="12" y="26" width="24" height="7" fill="${C.coral}"/>`,
      `<circle cx="24" cy="29.5" r="2.6" fill="${C.yellow}" stroke="${INK}" stroke-width="1.6"/><path d="M17 12 C17 16 17 20 17.5 23" stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".55"/>`),
    // gear
    settings: icon(`<circle cx="24" cy="24" r="12"/>${teeth()}`, `<circle cx="24" cy="24" r="12" fill="${C.yellow}"/>${teeth(C.yellow)}`,
      `<circle cx="24" cy="24" r="12" fill="${C.yellow}"/><circle cx="24" cy="24" r="5" fill="${C.paper}" stroke="${INK}" stroke-width="3"/>`),
    // house (back to the main menu)
    home: icon('<path d="M24 5 L43 22 L37 22 L37 41 L11 41 L11 22 L5 22 Z"/>', `<path d="M24 5 L43 22 L37 22 L37 41 L11 41 L11 22 L5 22 Z" fill="${C.yellow}"/><path d="M24 5 L43 22 L5 22 Z" fill="${C.coral}"/>`,
      `<rect x="20" y="29" width="8" height="12" rx="2" fill="${C.sky}" stroke="${INK}" stroke-width="2.4"/>`),
  };

  /** UI.icon('guide', 44) → '<svg …>…</svg>'. The optional third argument swaps the icon's coral for another colour (for use on a coral button). */
  UI.icon = (name, px = 44, tint) => `<svg class="ico-svg ico-${name}" viewBox="0 0 48 48" width="${px}" height="${px}" aria-hidden="true" focusable="false">${tint ? (SHAPES[name] || '').split(C.coral).join(tint) : SHAPES[name] || ''}</svg>`;
})(window.ABCC);
