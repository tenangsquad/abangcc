/* ==========================================================================
   4a. LOADER — the splash screen shown while the game boots
   --------------------------------------------------------------------------
   The markup (wallpaper + bar) is plain HTML in index.html so it paints before any script runs.
   This file only drives the bar and removes the screen. It stays up for at least MIN_MS so the
   wallpaper is actually seen (≈1.7 s), then fades out once main.js calls Loader.done().
   Skip it with ?noloader in the address, or { "noLoader": true } in the saved settings (tests do this).
   ========================================================================== */
(function (ns) {
  'use strict';

  const MIN_MS = 1700; // the loader is on screen at least this long
  const FADE_MS = 450;
  const GIVE_UP_MS = 7000; // if the game never reports ready (a script error), don't trap the player behind the splash

  const el = document.getElementById('loader');
  const noop = { done() {}, active: false };
  if (!el) return (ns.Loader = noop);

  let skip = /[?&]noloader\b/.test(location.search);
  try {
    skip = skip || !!JSON.parse(localStorage.getItem('abangcc2007_settings') || '{}').noLoader;
  } catch (e) {
    /* storage can be blocked — then we simply show the loader */
  }
  if (skip) {
    el.remove();
    return (ns.Loader = noop);
  }

  const TIPS = [
    'Pilih tempoh sewaan yang betul — salah pilih, bayaran separuh!',
    'PC hang masa ada pelanggan? Restart = refund 25%.',
    'Sewa & bil dibayar sebulan sekali, bukan setiap hari.',
    'Tap PC yang bermasalah — Abang akan berjalan ke sana.',
    'Pelanggan tak sabar? Layan yang paling hampir pergi dulu.',
    'Peak hour: ramai datang, sabar cepat habis.',
    'Dari Hari 2, pilih satu perk. Setiap perk ada kelemahan!',
  ];
  const STAGES = [[0, 'Menyusun PC & CRT…'], [0.4, 'Menyalakan lampu neon…'], [0.75, 'Abang pakai topi…'], [0.97, 'Kedai dibuka!']];

  const $ = (id) => document.getElementById(id);
  const fill = $('ldFill');
  const pct = $('ldPct');
  const label = $('ldLabel');
  $('ldTip').textContent = '💡 ' + TIPS[Math.floor(Math.random() * TIPS.length)];

  let t0 = 0; // set on the first painted frame: the browser cannot paint while the game scripts are still running, so the clock must not start before that
  let ready = false;
  let shown = 0; // what the bar currently displays (0–1)
  let finished = false;

  function finish() {
    if (finished) return;
    finished = true;
    ns.Loader.active = false;
    ns.Loader.visibleMs = Math.round(performance.now() - (t0 || performance.now())); // how long the splash was really on screen (tests read this)
    el.classList.add('ld-out');
    setTimeout(() => el.remove(), FADE_MS);
  }

  let last = 0;
  let rushAt = 0; // when the bar was told to fill up
  function frame(now) {
    if (finished) return;
    if (!t0) last = t0 = now;
    const t = now - t0;
    const dt = now - last;
    last = now;
    // creep towards 90% while loading, then rush to 100% once the game is ready and the minimum time is up
    const rush = ready && t >= MIN_MS;
    if (rush && !rushAt) rushAt = now;
    const target = rush ? 1 : Math.min(0.9, (t / MIN_MS) * 0.9);
    shown += (target - shown) * (1 - Math.exp(-dt / 90)); // time-based, so a slow device doesn't stretch the loader
    if (rush && (shown > 0.995 || now - rushAt > 350)) shown = 1;
    fill.style.width = (shown * 100).toFixed(1) + '%';
    pct.textContent = Math.round(shown * 100) + '%';
    label.textContent = STAGES.filter(([from]) => shown >= from).pop()[1];
    if (shown >= 1) return finish();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  setTimeout(() => {
    ready = true;
    setTimeout(finish, 600);
  }, GIVE_UP_MS);

  ns.Loader = {
    active: true,
    /** Called by main.js when the game is fully set up. */
    done() {
      ready = true;
    },
  };
})((window.ABCC = window.ABCC || {}));
