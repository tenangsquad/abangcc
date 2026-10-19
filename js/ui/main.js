/* ==========================================================================
   4h. MAIN — boot, effects, refresh and the game loop (+ debug hooks for tests)
   ========================================================================== */
(function (ns) {
  'use strict';

  const { CFG, FAULTS, EVENTS, byId, fmtMoney } = ns;
  const UI = ns.UI;
  const { $, safe } = UI;
  const State = ns.State;

  /* ---------- game instance + renderer ---------- */
  const canvas = $('game3D');
  UI.gfx = ns.Gfx.create(canvas);
  if (!UI.gfx) $('noWebgl').hidden = false;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    UI.gfx = null;
    $('noWebgl').hidden = false;
  });

  UI.s = State.getSaved() || State.create();
  if (UI.s.phase === 'prep' && UI.s.day >= 2 && !UI.s.perkDraft?.length && !UI.s.perkChoiceMade) State.draftPerks(UI.s);
  if (UI.s.phase === 'prep' && UI.s.day === 1) UI.s.dayGoal = State.calcRevenueGoal(UI.s, UI.s.day);

  /* ---------- simulation events → popups, particles and sounds ---------- */
  let lastBell = 0;
  function handleFx() {
    const s = UI.s;
    const gfx = UI.gfx;
    for (const fx of State.drainFx()) {
      const pc = fx.pcId ? byId(s.pcs, fx.pcId) : null;
      switch (fx.type) {
        case 'rental':
          if (pc) {
            UI.popupAt(pc.x, 2.4, pc.y - 0.2, '+' + fmtMoney(fx.amount), 'gold');
            gfx?.burst('coin', pc.x, 1.7, pc.y, 8);
          }
          UI.Sound.play('coin');
          break;
        case 'startup':
          UI.Sound.play('crt');
          break;
        case 'arrival':
          if (performance.now() - lastBell > 900) {
            lastBell = performance.now();
            UI.Sound.play('bell');
          }
          break;
        case 'fault':
          if (pc) {
            UI.popupAt(pc.x, 2.4, pc.y - 0.2, `${FAULTS[fx.kind || 'glitch'].icon} ${FAULTS[fx.kind || 'glitch'].short}!`, 'bad');
            gfx?.burst(fx.kind === 'overheat' ? 'steam' : 'smoke', pc.x, 1.9, pc.y - 0.2, 6);
          }
          UI.Sound.play('error');
          break;
        case 'fixed':
          if (pc) gfx?.burst('star', pc.x, 1.6, pc.y, 10);
          UI.Sound.play('good');
          break;
        case 'incident':
          if (pc) UI.popupAt(pc.x, 2.5, pc.y - 0.2, UI.PC_ISSUE_ICON[fx.type] || '❗', 'bad');
          UI.Sound.play(fx.type === 'fight' ? 'angry' : 'alert');
          break;
        case 'clutch':
          if (pc) {
            UI.popupAt(pc.x, 2.4, pc.y - 0.2, `⚡ CLUTCH x${fx.combo}`, 'gold');
            gfx?.burst('star', pc.x, 1.8, pc.y, 12);
          }
          UI.Sound.play('good');
          break;
        case 'event': {
          const type = fx.type;
          UI.Sound.play(type === 'blackout' ? 'powerdown' : type === 'spill' ? 'splash' : type === 'raid' ? 'siren' : 'alert');
          UI.toast(`${EVENTS[type].emoji} ${EVENTS[type].title}!`, 'normal');
          break;
        }
        case 'eventDone':
          UI.Sound.play('click');
          break;
        case 'powerBack':
          UI.Sound.play('powerup');
          break;
        case 'officer':
          UI.Sound.play('siren');
          break;
        case 'outcome':
          UI.toast(fx.msg, fx.ok ? 'good' : 'bad');
          if (!fx.ok) UI.Sound.play('angry');
          break;
        case 'peak':
          UI.Sound.play('peak');
          break;
        case 'walkout':
          UI.Sound.play('bad');
          break;
        case 'perk':
          UI.Sound.play('perk');
          break;
        case 'dayWon':
          UI.confetti();
          UI.Sound.play('win');
          break;
        case 'dayLost':
          UI.Sound.play('lose');
          break;
      }
    }
  }

  /* ---------- panels + HUD refresh (cheap: ~4×/s and after every action) ---------- */
  UI.refresh = function refresh(force = false) {
    UI.renderWorldMenu(force);
    UI.renderTaskCount();
    UI.renderQueue();
    UI.renderCrises();
    UI.tickDesk();
    UI.refreshHud();
    const h = UI.hint();
    const bubble = $('hintBubble');
    bubble.hidden = !h;
    if (h) {
      const html = `<span class="step">${safe(h[0])}</span><span>${safe(h[1])}</span>`;
      if (bubble.dataset.html !== html) {
        bubble.dataset.html = html;
        bubble.innerHTML = html;
      }
    }
  };

  /* ---------- main loop ---------- */
  let last = 0;
  let refreshTimer = 0;
  let saveTimer = 0;
  let slowFor = 0;
  let emaMs = 16;
  const QUALITY_STEPS = ['high', 'medium', 'low'];

  /** If the device can't keep up and the player never chose a quality, step it down once in a while. */
  function adaptQuality(frameMs) {
    emaMs = emaMs * 0.95 + frameMs * 0.05;
    if (UI.settings.qualityChosen || !UI.gfx || UI.s.phase !== 'active') return;
    slowFor = emaMs > 30 ? slowFor + frameMs / 1000 : Math.max(0, slowFor - frameMs / 2000);
    if (slowFor > 4) {
      slowFor = 0;
      const i = QUALITY_STEPS.indexOf(UI.settings.quality);
      if (i >= 0 && i < QUALITY_STEPS.length - 1) {
        UI.settings.quality = QUALITY_STEPS[i + 1];
        UI.saveSettings();
        UI.applySettings();
        UI.toast(`Prestasi rendah dikesan — kualiti grafik ditukar ke ${UI.settings.quality === 'medium' ? 'Sederhana' : 'Rendah'}.`);
      }
    }
  }

  function frame(now) {
    const s = UI.s;
    const rawMs = last ? now - last : 16;
    const dt = last ? Math.min(0.07, rawMs / 1000) : 0;
    last = now;
    if (s.phase === 'active' && !UI.frozen) State.update(s, dt); // tests freeze time and step it by hand
    handleFx();

    if (UI.gfx) {
      const waiting = State.inQueue(s).some((c) => c.status === 'waiting');
      const drawn = UI.gfx.render(s, now, {
        pendingReady: s.phase === 'active' && !!s.pendingCustomerId && !!s.pendingDuration,
        hintCustomers: UI.settings.hints && s.phase === 'active' && !s.pendingCustomerId && waiting,
      });
      if (drawn) UI.updateLabels();
    } else UI.updateFallbackBoard();

    if (s.phase === 'active') {
      UI.Sound.ambient(dt, s.pcs.filter((p) => p.status === 'busy' && !p.issue && !(p.lingerTime > 0)).length);
      adaptQuality(rawMs);
    }

    refreshTimer += dt;
    saveTimer += dt;
    if (refreshTimer > 0.25) {
      refreshTimer = 0;
      UI.refresh();
      UI.syncModal();
    }
    if (saveTimer > 10) {
      saveTimer = 0;
      if (s.phase !== 'menu') State.save(s);
    }
    requestAnimationFrame(frame);
  }

  UI.applySettings();
  UI.syncModal(true);
  UI.refresh(true);
  requestAnimationFrame(frame);
  ns.Loader.done(); // the splash screen may fade out now (it still stays its minimum time)

  /* ---------- hooks for automated tests / manual debugging in the console ---------- */
  ns.debug = {
    state: () => UI.s,
    gfx: () => UI.gfx,
    ui: () => UI,
    advance(seconds) {
      if (UI.s.phase !== 'active') return;
      for (let rest = seconds; rest > 0; rest -= 0.06) State.update(UI.s, Math.min(0.06, rest));
      UI.refresh(true);
      UI.syncModal(true);
    },
    start() {
      if (UI.s.phase === 'prep' || UI.s.phase === 'menu' || UI.s.phase === 'onboarding') {
        UI.s.phase = 'prep';
        State.startShift(UI.s);
        UI.syncModal(true);
        UI.refresh(true);
      }
    },
    set(fn) {
      fn(UI.s);
      UI.refresh(true);
    },
    select: (ent) => UI.select(ent),
    tapPC: (id) => UI.select({ kind: 'pc', id }),
    tapCustomer: (id) => UI.select({ kind: 'customer', id }),
    chooseMinutes: (n) => UI.chooseDuration(n),
    perform: (act, id, choice) => { const r = State.perform(UI.s, act, id, choice); UI.refresh(true); return r; },
    forceOfficer: () => { State.startOfficer(UI.s); UI.refresh(true); },
    startEvent: (id) => { const ev = State.startEvent(UI.s, id); UI.refresh(true); return ev; },
    freeze: (on = true) => { UI.frozen = !!on; },
    focus: (x, z, zoom) => UI.gfx?.setFocus(x, z, zoom),
    /** Page coordinates (CSS px) of a world thing — what a player would click. */
    pagePoint(kind, id) {
      const p = ns.debug.screenOf(kind, id);
      if (!p) return null;
      const r = canvas.getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    },
    setTime: (min) => UI.gfx?.setDebugTime(min),
    /** Screen position of a world thing, for click-through tests. */
    screenOf(kind, id) {
      const a = UI.gfx.anchors();
      if (kind === 'pc') { const p = a.pcs.find((q) => q.id === id); return p && { x: p.mx, y: p.my }; }
      if (kind === 'customer') { const p = a.people.find((q) => q.kind === 'customer' && q.id === id); return p && { x: p.bx, y: p.by }; }
      if (kind === 'event') {
        const ev = State.eventById(UI.s, id);
        const person = ev && a.people.find((q) => ev.npcIds.includes(q.id));
        if (person) return { x: person.bx, y: person.by };
        const e = a.events.find((q) => q.id === id);
        return e && { x: e.gx, y: e.gy };
      }
      return null;
    },
    openHelp: () => UI.openOverlay('help'),
    openSettings: () => UI.openOverlay('settings'),
  };
})(window.ABCC);
