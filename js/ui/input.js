/* ==========================================================================
   4g. INPUT — one stable set of handlers for the 3D scene, panels, keyboard and camera
   --------------------------------------------------------------------------
   Every handler is attached once to a container that never gets replaced, and dispatches
   by data-attributes (event delegation). Panels re-render freely without ever orphaning a
   click. One deliberate click/tap = one action: the 3D scene is read through the ray caster
   on pointer-up, so overlapping objects and re-rendered DOM can't double or swallow a tap.
   ========================================================================== */
(function (ns) {
  'use strict';

  const UI = ns.UI;
  const { $ } = UI;
  const State = ns.State;
  const canvas = $('game3D');

  /** Select something in the world and show what that did. */
  UI.select = function select(ent) {
    const s = UI.s;
    if (!ent || s.phase !== 'active') return;
    UI.menuDismissed = null; // tapping something always (re)opens its menu
    const seating = !!(s.pendingCustomerId && s.pendingDuration && ent.kind === 'pc'); // this tap seats a customer, it is not a request for info
    const r = State.select(s, ent);
    if (r && !r.ok && r.msg) UI.toast(r.msg, 'bad'); // successes are shown by the pop-up menu itself
    UI.Sound.play(r?.ok === false ? 'bad' : 'tap');
    UI.menuTapped = seating || window.matchMedia('(max-width: 860px)').matches ? null : `${ent.kind}:${ent.id}`; // a plain info card for a PC with nothing to fix: desktop only, never after seating
    State.save(s);
    UI.refresh(true);
  };

  /** A button in the pop-up menu: duration, fix, confrontation option or event choice. */
  UI.performFromEl = function performFromEl(el) {
    const s = UI.s;
    if (s.phase !== 'active' || el.disabled) return;
    const act = el.dataset.act, id = Number(el.dataset.id), choice = el.dataset.choice;
    if (act === 'asstinfo') return UI.openOverlay('assistant'); // "Apa boleh buat?" is a page, not an action
    const r = State.perform(s, act, id, choice);
    if (r.msg && (!r.ok || act !== 'duration')) UI.toast(r.msg, r.ok ? 'good' : 'bad');
    if (r.ok) {
      UI.Sound.play(act === 'duration' ? 'tap' : 'click');
      if (s.selected) UI.menuDismissed = `${s.selected.kind}:${s.selected.id}`; // the choice is made: close the menu (the PC to tap next stays clear)
      State.save(s);
    } else UI.Sound.play('bad');
    UI.refresh(true);
  };

  /** "Auto-duduk": seat the customer for the ★ length on the nearest free PC, in one go. */
  UI.quickSeat = function quickSeat(customerId) {
    const s = UI.s;
    if (s.phase !== 'active') return;
    const r = State.quickSeat(s, customerId);
    UI.toast(r.msg, r.ok ? 'good' : 'bad');
    UI.Sound.play(r.ok ? 'tap' : 'bad');
    if (r.ok) UI.menuDismissed = s.selected ? `${s.selected.kind}:${s.selected.id}` : null;
    State.save(s);
    UI.refresh(true);
  };

  /** A tap on a customer (in the room or in the queue list). A second tap on the same one within 0.4 s auto-seats them. */
  let lastCustomerTap = { id: null, t: 0 };
  UI.tapCustomer = function tapCustomer(id) {
    const now = performance.now();
    if (lastCustomerTap.id === id && now - lastCustomerTap.t < 400) {
      lastCustomerTap = { id: null, t: 0 };
      UI.quickSeat(id);
      return;
    }
    lastCustomerTap = { id, t: now };
    UI.select({ kind: 'customer', id });
  };

  UI.chooseDuration = function chooseDuration(minutes) {
    const s = UI.s;
    if (!s.pendingCustomerId || s.phase !== 'active') return;
    const r = State.perform(s, 'duration', s.pendingCustomerId, minutes);
    if (r.ok && s.selected) UI.menuDismissed = `${s.selected.kind}:${s.selected.id}`;
    UI.toast(r.msg, r.ok ? 'good' : 'bad');
    UI.Sound.play('tap');
    UI.refresh(true);
  };

  UI.togglePause = function togglePause() {
    const s = UI.s;
    UI.Sound.unlock();
    if (s.phase === 'active') {
      s.phase = 'paused';
      State.save(s);
      UI.syncModal(true);
    } else if (s.phase === 'paused' && !UI.getOverlay()) {
      s.phase = 'active';
      UI.syncModal(true);
    }
  };

  function nextCustomer() {
    const s = UI.s;
    const waiting = State.inQueue(s).filter((c) => c.status === 'waiting').sort((a, b) => a.id - b.id);
    if (!waiting.length) return;
    const idx = waiting.findIndex((c) => c.id === s.pendingCustomerId);
    UI.select({ kind: 'customer', id: waiting[(idx + 1) % waiting.length].id });
  }

  /* ---------------------------------------------------------------- 3D scene */
  const pointers = new Map();
  let pinchStart = null;
  const posOf = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  let hoverKey = '';
  let hoverRaf = 0;

  canvas.addEventListener('pointerdown', (e) => {
    UI.Sound.unlock();
    if (!UI.gfx) return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    const p = posOf(e);
    pointers.set(e.pointerId, { ...p, sx: p.x, sy: p.y, moved: false, type: e.pointerType });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), z: UI.gfx.getZoom() };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!UI.gfx) return;
    const p = posOf(e);
    const rec = pointers.get(e.pointerId);
    if (rec) {
      const dx = p.x - rec.x, dy = p.y - rec.y;
      if (Math.hypot(p.x - rec.sx, p.y - rec.sy) > 9) rec.moved = true;
      rec.x = p.x;
      rec.y = p.y;
      if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        UI.gfx.setZoom(pinchStart.z * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinchStart.d)));
        rec.moved = true;
      } else if (rec.moved && pointers.size === 1) UI.gfx.panBy(dx, dy);
      return;
    }
    if (e.pointerType === 'touch') return;
    // hover feedback (mouse only), at most once per frame
    cancelAnimationFrame(hoverRaf);
    hoverRaf = requestAnimationFrame(() => {
      const hit = UI.s.phase === 'active' ? UI.gfx.pick(UI.s, p.x, p.y, {}) : null;
      const key = hit ? `${hit.kind}:${hit.id}` : '';
      if (key !== hoverKey) {
        hoverKey = key;
        UI.gfx.setHover(hit);
        canvas.classList.toggle('hovering', !!hit);
      }
    });
  });
  const endPointer = (e, cancelled) => {
    const rec = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (!rec || cancelled || rec.moved || !UI.gfx) return;
    if (UI.s.phase !== 'active') return;
    const hit = UI.gfx.pick(UI.s, rec.x, rec.y, { touch: rec.type !== 'mouse' });
    if (hit?.kind === 'customer') UI.tapCustomer(hit.id);
    else if (hit) UI.select(hit);
  };
  canvas.addEventListener('pointerup', (e) => endPointer(e, false));
  canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
  canvas.addEventListener('pointerleave', () => {
    hoverKey = '';
    UI.gfx?.setHover(null);
  });
  canvas.addEventListener('wheel', (e) => {
    if (!UI.gfx) return;
    e.preventDefault();
    UI.gfx.zoomBy(Math.exp(-e.deltaY * 0.0011));
  }, { passive: false });

  $('zoomCtl').addEventListener('click', (e) => {
    const b = e.target.closest('[data-zoom]');
    if (!b || !UI.gfx) return;
    UI.Sound.play('click');
    if (b.dataset.zoom === 'in') UI.gfx.zoomBy(1.18);
    else if (b.dataset.zoom === 'out') UI.gfx.zoomBy(1 / 1.18);
    else UI.gfx.resetCamera();
  });

  /* ------------------------------------------------------------------ panels */
  $('worldMenu').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) {
      UI.menuDismissed = UI.s.selected ? `${UI.s.selected.kind}:${UI.s.selected.id}` : null;
      UI.renderWorldMenu(true);
      return;
    }
    const el = e.target.closest('[data-act]');
    if (el) UI.performFromEl(el);
  });
  $('queueList').addEventListener('click', (e) => {
    const el = e.target.closest('[data-customer]');
    if (el) UI.tapCustomer(Number(el.dataset.customer));
  });
  $('crisisList').addEventListener('click', (e) => {
    const card = e.target.closest('[data-kind]');
    if (card) UI.select({ kind: card.dataset.kind, id: Number(card.dataset.id) });
  });
  $('crisisList').addEventListener('pointerover', (e) => {
    const card = e.target.closest('[data-kind]');
    UI.gfx?.setHover(card ? { kind: card.dataset.kind, id: Number(card.dataset.id) } : null);
  });
  $('crisisList').addEventListener('pointerleave', () => UI.gfx?.setHover(null));
  $('jobList').addEventListener('click', (e) => {
    const s = UI.s;
    const up = e.target.closest('[data-job-up]'), del = e.target.closest('[data-job-cancel]');
    if (!up && !del) return;
    const r = up ? State.moveTaskUp(s, Number(up.dataset.jobUp)) : State.cancelTask(s, Number(del.dataset.jobCancel));
    UI.toast(r.msg, r.ok ? 'good' : 'bad');
    UI.Sound.play(r.ok ? 'click' : 'bad');
    State.save(s);
    UI.refresh(true);
  });
  $('jobList').addEventListener('pointerover', (e) => {
    const row = e.target.closest('[data-kind]');
    UI.gfx?.setHover(row ? { kind: row.dataset.kind, id: Number(row.dataset.id) } : null);
  });
  $('jobList').addEventListener('pointerleave', () => UI.gfx?.setHover(null));
  $('fallbackBoard').addEventListener('click', (e) => {
    const card = e.target.closest('[data-kind]');
    if (card) UI.select({ kind: card.dataset.kind, id: Number(card.dataset.id) });
  });

  $('pauseBtn').addEventListener('click', UI.togglePause);
  $('soundBtn').addEventListener('click', () => {
    UI.settings.sound = !UI.settings.sound;
    UI.saveSettings();
    UI.applySettings();
    UI.toast(UI.settings.sound ? 'Bunyi ON 🔊' : 'Bunyi OFF 🔇');
    UI.Sound.play('click');
  });
  $('helpBtn').addEventListener('click', () => UI.openOverlay('help'));
  $('settingsBtn').addEventListener('click', () => UI.openOverlay('settings'));

  document.addEventListener('visibilitychange', () => {
    const s = UI.s;
    if (document.hidden && s.phase === 'active') {
      s.phase = 'paused';
      State.save(s);
      UI.syncModal(true);
    }
  });
  window.addEventListener('beforeunload', () => State.save(UI.s));

  /* ---------------------------------------------------------------- keyboard */
  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea')) return;
    const s = UI.s;
    const active = s.phase === 'active';
    if (e.key === 'Escape' || e.key === ' ') {
      if (active || (s.phase === 'paused' && !UI.getOverlay())) {
        e.preventDefault();
        UI.togglePause();
      }
    } else if (active && !e.repeat) {
      if (['1', '2', '3'].includes(e.key)) UI.chooseDuration(Number(e.key) * 30);
      else if (e.key === 'n' || e.key === 'N') nextCustomer();
      else if ((e.key === 'a' || e.key === 'A') && s.pendingCustomerId) UI.quickSeat(s.pendingCustomerId);
      else if (e.key === 'r' || e.key === 'R') {
        const opt = State.options(s, s.selected).find((o) => o.act === 'restart');
        if (opt && s.selected?.kind === 'pc') UI.performFromEl({ dataset: { act: 'restart', id: String(s.selected.id) }, disabled: opt.disabled });
      } else if (e.key === '+' || e.key === '=') UI.gfx?.zoomBy(1.18);
      else if (e.key === '-') UI.gfx?.zoomBy(1 / 1.18);
    }
  });
})(window.ABCC);
