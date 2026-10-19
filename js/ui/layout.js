/* ==========================================================================
   4b. LAYOUT — one game, three looks: "desktop" (classic), "float" and "phone"
   --------------------------------------------------------------------------
   "phone" and "float" share one idea: the 3D scene fills the whole screen and the panels sit in its four corners
   (cash + clock top-left, target + buttons top-right, waiting queue bottom-left, shop status + tasks bottom-right).
   "phone" is for touch phones held sideways; "float" is the same thing on a PC with bigger panels (Tetapan →
   Susun atur → Terapung). "desktop" is the classic top bar + sidebar. Nothing else changes: same game, same save.
   • Picked at start: a touch screen whose short side is ≤ 600 px → "phone" (always); otherwise the saved Susun atur
     setting ("float" or the classic "desktop"). Force one with ?layout=phone|float|desktop (handy for testing on a PC).
   • "phone" / "float" move the existing panel elements into four corner docks (same nodes, so every id and
     listener keeps working); "desktop" puts them straight back where index.html has them.
   • Held upright, a phone shows a "turn your phone" card and the shift is paused. Android Chrome is also
     asked for fullscreen + landscape on the first tap (iPhone Safari cannot lock orientation, so it relies on the card).
   ========================================================================== */
(function (ns) {
  'use strict';

  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const DOCKS = {
    tl: () => [$('worldPhase'), $('cashPill'), document.querySelector('.hud-pill.clock')],
    tr: () => [$('worldCountdown'), $('goalPill'), document.querySelector('.top-actions')],
    bl: () => [$('crisisPanel'), document.querySelector('.card.queue')],
    br: () => [$('jobsPanel'), document.querySelector('.card.vitals')],
  };
  const homes = new Map(); // element → comment node left where it lived on the desktop layout

  /** Is this a touch phone? (Touch screen, short side ≤ 600 px.) */
  function isPhone() {
    try {
      return matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 600;
    } catch (e) {
      return false;
    }
  }
  /** The player's saved Susun atur choice ('classic' | 'float'). Read straight from the settings, as the UI isn't up yet. */
  function savedPref() {
    try {
      return JSON.parse(localStorage.getItem('abangcc2007_settings') || '{}').layout === 'float' ? 'float' : 'classic';
    } catch (e) {
      return 'classic';
    }
  }
  /** Which layout to use for a saved preference on this device. */
  const resolve = (pref) => (isPhone() ? 'phone' : pref === 'float' ? 'float' : 'desktop');
  function detect() {
    const m = /[?&]layout=(phone|float|desktop)\b/.exec(location.search);
    return m ? m[1] : resolve(savedPref());
  }

  function toDocks() {
    const vp = $('viewport');
    if (!vp || vp.querySelector('.dock')) return;
    for (const [name, list] of Object.entries(DOCKS)) {
      const dock = document.createElement('div');
      dock.className = `dock dock-${name}`;
      for (const el of list()) {
        if (!el) continue;
        const mark = document.createComment(el.id || el.className);
        el.replaceWith(mark);
        homes.set(el, mark);
        dock.appendChild(el);
      }
      vp.appendChild(dock);
    }
  }

  function toDesktop() {
    for (const [el, mark] of homes) mark.replaceWith(el);
    homes.clear();
    document.querySelectorAll('.dock').forEach((d) => d.remove());
  }

  function apply(name) {
    if (root.dataset.layout === name) return name;
    root.dataset.layout = name;
    if (name === 'desktop') toDesktop();
    else toDocks();
    return name;
  }
  /** Settings → Susun atur: 'classic' | 'float'. A phone always keeps its own layout. */
  const set = (pref) => apply(resolve(pref));

  const layout = apply(detect());
  if (layout === 'phone') {
    // Android Chrome: fullscreen + landscape lock, which needs a user gesture. Everything else just ignores this.
    const lock = () => {
      document.removeEventListener('pointerup', lock);
      try {
        const el = root;
        const full = !document.fullscreenElement && el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
        Promise.resolve(full).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
      } catch (e) {
        /* not supported — the rotate card covers it */
      }
    };
    document.addEventListener('pointerup', lock);

    // Held upright: the card covers the screen, so also pause the shift until the phone is turned.
    const upright = matchMedia('(orientation: portrait)');
    const pauseIfUpright = () => {
      const UI = ns.UI;
      if (!upright.matches || !UI?.s || UI.s.phase !== 'active') return;
      UI.togglePause();
    };
    upright.addEventListener?.('change', pauseIfUpright);
  }

  ns.Layout = { current: () => root.dataset.layout, apply, set, detect, isPhone };
})((window.ABCC = window.ABCC || {}));
