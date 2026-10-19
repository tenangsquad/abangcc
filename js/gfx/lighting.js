/* ==========================================================================
   3c. LIGHTING — the cybercafe's simulated day
   --------------------------------------------------------------------------
   The shift runs 12:00 PM → 12:00 AM. Keyframes below describe afternoon (bright,
   warm, crisp shadows), golden hour (long orange shadows, warm room), dusk and night
   (lamps, CRT glow and neon take over). Everything is cheap: a handful of uniforms,
   a planar sun shadow, a few additive light patches — no post-processing.
   ========================================================================== */
(function (ns) {
  'use strict';

  const { clamp, lerp } = ns;

  /* hour, then everything that changes through the day.
     sun/amb = toon light colours · shadow = [x, y(elevation), z, alpha] · patch = window light [r,g,b,alpha]
     lamps/neon = indoor light strength · sky = CSS gradient stops · glass = window pane colour */
  const KEYS = [
    { h: 12.0, sun: [1.06, 1.03, 0.96], amb: [0.66, 0.60, 0.82], night: 0.0, flat: [1.0, 1.0, 1.0], shadow: [-0.42, 1.0, -0.38, 0.30], patch: [1.0, 0.93, 0.62, 0.20], lamps: 0.0, neon: 0.55, glass: [0.56, 0.86, 1.0], sky: ['#b7e8ff', '#ffe9c9', '#ffd2b0'], cloud: 0.7 },
    { h: 15.0, sun: [1.10, 1.02, 0.92], amb: [0.66, 0.58, 0.80], night: 0.0, flat: [1.02, 0.99, 0.95], shadow: [-0.50, 1.0, -0.46, 0.33], patch: [1.0, 0.85, 0.50, 0.26], lamps: 0.0, neon: 0.55, glass: [0.62, 0.86, 0.96], sky: ['#a9e0ff', '#ffe2b8', '#ffc99a'], cloud: 0.7 },
    { h: 16.5, sun: [1.18, 0.98, 0.80], amb: [0.70, 0.56, 0.74], night: 0.0, flat: [1.06, 0.97, 0.88], shadow: [-0.55, 0.82, -0.48, 0.36], patch: [1.0, 0.72, 0.38, 0.32], lamps: 0.05, neon: 0.6, glass: [1.0, 0.85, 0.62], sky: ['#ffd9a0', '#ffc489', '#ff9f73'], cloud: 0.6 },
    { h: 18.0, sun: [1.26, 0.92, 0.68], amb: [0.74, 0.52, 0.66], night: 0.05, flat: [1.10, 0.93, 0.82], shadow: [-0.66, 0.72, -0.56, 0.38], patch: [1.0, 0.58, 0.28, 0.38], lamps: 0.2, neon: 0.7, glass: [1.0, 0.68, 0.44], sky: ['#ffb27a', '#ff8f6d', '#d6577d'], cloud: 0.5 },
    { h: 19.5, sun: [0.98, 0.74, 0.80], amb: [0.52, 0.46, 0.74], night: 0.35, flat: [0.90, 0.78, 0.84], shadow: [-0.70, 0.60, -0.60, 0.22], patch: [0.95, 0.45, 0.40, 0.20], lamps: 0.6, neon: 0.9, glass: [0.84, 0.47, 0.64], sky: ['#6d5aa8', '#b3567f', '#ff8a6d'], cloud: 0.3 },
    { h: 20.7, sun: [0.60, 0.62, 0.96], amb: [0.38, 0.40, 0.70], night: 0.75, flat: [0.68, 0.70, 0.92], shadow: [-0.5, 0.9, -0.5, 0.10], patch: [0.5, 0.6, 1.0, 0.08], lamps: 0.92, neon: 1.1, glass: [0.17, 0.23, 0.48], sky: ['#2b2a6b', '#46408b', '#7a4a9a'], cloud: 0.12 },
    { h: 24.0, sun: [0.52, 0.58, 1.0], amb: [0.32, 0.36, 0.66], night: 1.0, flat: [0.58, 0.63, 0.90], shadow: [-0.4, 1.0, -0.4, 0.08], patch: [0.45, 0.55, 1.0, 0.09], lamps: 1.0, neon: 1.25, glass: [0.09, 0.13, 0.31], sky: ['#171a52', '#2a2573', '#4c2f84'], cloud: 0.05 },
  ];

  const mixArr = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mixHex = (a, b, t) => {
    const A = hex(a), B = hex(b);
    return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join('');
  };
  const smooth = (t) => t * t * (3 - 2 * t);

  /** Lighting for `minutes` since midnight (the in-game clock). */
  function at(minutes) {
    const h = clamp(minutes / 60, 12, 24); // the shift is 12:00 PM → 12:00 AM
    let i = 0;
    while (i < KEYS.length - 2 && h >= KEYS[i + 1].h) i++;
    const A = KEYS[i], B = KEYS[i + 1];
    const t = smooth(clamp((h - A.h) / (B.h - A.h), 0, 1));
    return {
      hour: h,
      sun: mixArr(A.sun, B.sun, t),
      amb: mixArr(A.amb, B.amb, t),
      night: lerp(A.night, B.night, t),
      flat: mixArr(A.flat, B.flat, t),
      shadow: mixArr(A.shadow, B.shadow, t),
      patch: mixArr(A.patch, B.patch, t),
      lamps: lerp(A.lamps, B.lamps, t),
      neon: lerp(A.neon, B.neon, t),
      glass: mixArr(A.glass, B.glass, t),
      sky: A.sky.map((c, k) => mixHex(c, B.sky[k], t)),
      cloud: lerp(A.cloud, B.cloud, t),
    };
  }

  ns.Lighting = { at, KEYS };
})(window.ABCC);
