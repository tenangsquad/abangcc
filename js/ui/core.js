/* ==========================================================================
   4a. UI CORE — shared helpers, settings, toasts, popups
   --------------------------------------------------------------------------
   The UI is split across js/ui/*.js. They share one object, ABCC.UI:
     UI.s        the live game state (replaced on new game / retry)
     UI.gfx      the 3D scene (null when WebGL is unavailable)
   ========================================================================== */
(function (ns) {
  'use strict';

  const { CFG, clamp } = ns;
  const UI = (ns.UI = { s: null, gfx: null });

  UI.$ = (id) => document.getElementById(id);
  UI.safe = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  UI.pad2 = (n) => String(n).padStart(2, '0');
  UI.setText = (el, v) => {
    if (el && el.textContent !== v) el.textContent = v;
  };

  /** Phones and tablets get a lighter default; the player can change it in Tetapan. */
  function defaultQuality() {
    try {
      const coarse = window.matchMedia?.('(pointer: coarse)').matches;
      const small = Math.min(screen.width, screen.height) < 700;
      const mem = navigator.deviceMemory || 8;
      if (mem <= 2) return 'low';
      if (coarse || small) return 'medium';
    } catch {
      /* fall through */
    }
    return 'high';
  }

  /* ---------- settings (kept separate from the game save) ---------- */
  UI.settings = { sound: true, music: true, ambience: true, quality: defaultQuality(), reduceMotion: false, hints: true, qualityChosen: false };
  try {
    Object.assign(UI.settings, JSON.parse(localStorage.getItem(CFG.SETTINGS) || '{}'));
  } catch {
    /* defaults */
  }
  UI.saveSettings = () => {
    try {
      localStorage.setItem(CFG.SETTINGS, JSON.stringify(UI.settings));
    } catch {
      /* storage unavailable */
    }
  };
  UI.applySettings = () => {
    document.documentElement.classList.toggle('reduce-motion', UI.settings.reduceMotion);
    UI.$('soundBtn').textContent = UI.settings.sound ? '♫' : '♪';
    UI.$('soundBtn').classList.toggle('muted', !UI.settings.sound);
    UI.gfx?.setQuality(UI.settings.quality);
  };

  /**
   * "Disimpan 3 minit lalu": when the save on this device was last written (State.saveInfo). Every element with a data-saved
   * attribute shows it and is kept fresh by UI.refresh; before anything is saved it keeps its own default text.
   */
  UI.savedLabel = () => {
    const { at, failed } = ns.State.saveInfo();
    if (failed) return '⚠️ Tak dapat simpan: storan browser disekat';
    if (!at) return null;
    const secs = Math.max(0, (Date.now() - at) / 1000);
    if (secs < 20) return '💾 Disimpan baru sahaja';
    if (secs < 90) return '💾 Disimpan seminit lalu';
    if (secs < 3600) return `💾 Disimpan ${Math.round(secs / 60)} minit lalu`;
    const d = new Date(at);
    const time = `${UI.pad2(d.getHours())}:${UI.pad2(d.getMinutes())}`;
    return new Date().toDateString() === d.toDateString() ? `💾 Disimpan pukul ${time}` : `💾 Disimpan ${d.getDate()}/${d.getMonth() + 1} pukul ${time}`;
  };
  UI.refreshSaved = () => {
    const text = UI.savedLabel();
    for (const el of document.querySelectorAll('[data-saved]')) {
      if (text) UI.setText(el, text);
      el.classList.toggle('save-failed', text?.startsWith('⚠️') || false);
    }
  };

  /* ---------- transient feedback ---------- */
  UI.toast = (msg, tone = 'normal') => {
    const root = UI.$('toastRoot');
    while (root.children.length >= 3) root.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = `toast ${tone}`;
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => el.classList.add('leaving'), 2300);
    setTimeout(() => el.remove(), 2600);
  };

  UI.popupAt = (x, y, z, text, cls = '') => {
    if (!UI.gfx) return;
    const p = UI.gfx.worldToScreen(x, y, z);
    const el = document.createElement('div');
    el.className = `popup ${cls}`;
    el.textContent = text;
    el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    UI.$('popups').appendChild(el);
    setTimeout(() => el.remove(), 1400);
  };

  UI.confetti = () => {
    if (UI.settings.reduceMotion) return;
    const box = document.createElement('div');
    box.className = 'confetti';
    const colors = ['#ffcf3d', '#ff5d73', '#2fd6a3', '#4cc3ff', '#7b5cff', '#ff7ac6'];
    for (let i = 0; i < 70; i++) {
      const bit = document.createElement('i');
      bit.style.left = Math.random() * 100 + '%';
      bit.style.background = colors[i % colors.length];
      bit.style.setProperty('--dx', (Math.random() - 0.5) * 200 + 'px');
      bit.style.setProperty('--rot', Math.random() * 900 - 450 + 'deg');
      bit.style.animationDuration = 2.2 + Math.random() * 2 + 's';
      bit.style.animationDelay = Math.random() * 0.6 + 's';
      box.appendChild(bit);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 5200);
  };

  UI.clamp = clamp;
})(window.ABCC);
