/* ==========================================================================
   4b. LAYOUT — one game, two layouts ("desktop" and "phone")
   --------------------------------------------------------------------------
   The phone layout is for touch phones held sideways: the 3D scene fills the whole screen and the
   panels sit in its four corners (cash + clock top-left, target + buttons top-right, waiting queue
   bottom-left, shop status + tasks bottom-right). Nothing else changes: same game, same save.
   • Picked once at start: a touch screen whose short side is ≤ 600 px → "phone", anything else → "desktop".
     Force one with ?layout=phone or ?layout=desktop (handy for testing on a PC).
   • "phone" moves the existing panel elements into four corner docks (same nodes, so every id and
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

  /** Which layout this device should use. */
  function detect() {
    const m = /[?&]layout=(phone|desktop)\b/.exec(location.search);
    if (m) return m[1];
    try {
      const touch = matchMedia('(pointer: coarse)').matches;
      return touch && Math.min(screen.width, screen.height) <= 600 ? 'phone' : 'desktop';
    } catch (e) {
      return 'desktop';
    }
  }

  function toPhone() {
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
    if (name === 'phone') toPhone();
    else toDesktop();
    return name;
  }

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

  ns.Layout = { current: () => root.dataset.layout, apply, detect };
})((window.ABCC = window.ABCC || {}));
