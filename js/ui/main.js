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

  UI.gfx?.setHat(ns.Meta.equipped());

  // The game always opens on the main menu page. A stored session is kept under `resumeTo`: "Sambung Main" puts the player back there.
  UI.s = State.getSaved() || State.create();
  if (UI.s.phase !== 'menu') {
    UI.s.resumeTo = UI.s.phase;
    UI.s.phase = 'menu';
  }

  // browsers only allow audio after a tap/key: any of these unlocks it (iOS wants touchend)
  for (const type of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(type, () => UI.Sound.unlock(), { passive: true });

  /* ---------- simulation events → popups, particles and sounds ---------- */
  let lastBell = 0;
  let lastWarn = 0;
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
          UI.Sound.play(type === 'blackout' ? (s.perks.includes('generator') ? 'alert' : 'powerdown') : type === 'spill' ? 'splash' : type === 'raid' ? 'siren' : 'alert');
          UI.toast(`${EVENTS[type].emoji} ${EVENTS[type].title}!`, 'normal');
          break;
        }
        case 'eventDone':
          UI.Sound.play('click');
          break;
        case 'powerBack':
          UI.Sound.play('powerup');
          break;
        case 'assistantHired':
          UI.Sound.play('perk');
          UI.toast(`🎀 ${CFG.ASSISTANT.name} mula kerja!`, 'good');
          break;
        case 'assistantDone': {
          const a = s.assistant;
          if (a) UI.popupAt(a.x, 2.3, a.y, fx.ok ? '🎀 Siap!' : '😅', 'gold');
          UI.toast(fx.msg, fx.ok ? 'good' : 'bad');
          UI.Sound.play(fx.ok ? 'good' : 'bad');
          break;
        }
        case 'assistantMc':
          UI.toast(`🤒 ${CFG.ASSISTANT.name} MC hari ini: ${fx.reason}`, 'bad');
          UI.Sound.play('warn');
          break;
        case 'generator':
          UI.Sound.play('generator');
          UI.toast('🔌 Generator hidup sendiri! Sewaan terus jalan.', 'good');
          break;
        case 'tip':
          if (pc) UI.popupAt(pc.x, 2.6, pc.y - 0.2, '☕ +' + fmtMoney(fx.amount), 'gold');
          UI.Sound.play('coin');
          break;
        case 'tier': {
          const t = ns.TIERS.find((x) => x.id === fx.id);
          UI.toast(`${t.emoji} ${fx.up ? 'Naik taraf' : 'Taraf turun'}: ${t.name}`, fx.up ? 'good' : 'bad');
          if (fx.up) UI.confetti();
          UI.Sound.play(fx.up ? 'tier' : 'bad');
          break;
        }
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
        case 'patienceLow':
          if (performance.now() - lastWarn > 1500) {
            lastWarn = performance.now();
            UI.Sound.play('warn');
          }
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
    UI.renderJobs();
    UI.renderQueue();
    UI.renderCrises();
    UI.tickDesk();
    UI.refreshHud();
    UI.refreshSaved();
    const s = UI.s;
    // today's target reached: one fanfare per shift
    if (s.phase === 'active') {
      if (!UI.goalHit && State.shiftTakings(s) >= State.calcRevenueGoal(s, s.day)) {
        UI.goalHit = true;
        UI.Sound.play('goal');
        UI.toast('🎯 Target hari ini dicapai! Teruskan untuk lebih banyak bintang.', 'good');
      }
    } else if (s.phase !== 'paused') UI.goalHit = false;
    // music follows the shift: bright by day, moody at night, busier in peak hour; plays on the main menu page; silent in other dialogs and on pause
    UI.Sound.music(s.phase === 'active' ? { night: ns.dayPart(CFG.DAY_START_MINUTES + s.elapsed * CFG.GAME_MINUTE_RATE).id === 'night', peak: !!s.peakActive } : s.phase === 'menu' ? { night: false, peak: false } : null); // the main menu has the daytime tune too
    // the café itself: PC hum, fans, the street outside — only while a shift is running
    UI.Sound.ambience(s.phase === 'active' ? {
      busy: s.pcs.filter((p) => p.status === 'busy').length,
      cool: State.coolLevel(s),
      part: ns.dayPart(CFG.DAY_START_MINUTES + s.elapsed * CFG.GAME_MINUTE_RATE).id,
      power: s.powerOutage <= 0,
      generator: s.powerOutage > 0 && s.perks.includes('generator'),
    } : null);
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

  /* ---------- performance overlay + report (for testing on real phones) ---------- */
  const perfEl = $('perfHud');
  const perf = { frames: 0, ms: 0, slow: 0, worst: 0, winFrames: 0, winMs: 0, winWorst: 0, fps: 0, shown: 0, sample: 0, started: 0 };
  const showPerf = () => /[?&]fps\b/.test(location.search) || !!UI.settings.showFps;
  function perfReport() {
    const g = UI.gfx?.stats?.() || {};
    const avg = perf.ms ? (perf.frames / perf.ms) * 1000 : 0;
    return [
      'ABANG CC 2007 — laporan prestasi',
      `Peranti: ${navigator.userAgent}`,
      `Skrin: ${innerWidth}x${innerHeight} @${devicePixelRatio}x · ${screen.width}x${screen.height}`,
      `GPU: ${UI.gfx?.gpuInfo?.() || 'tiada WebGL'}`,
      `Kualiti: ${UI.settings.quality}${UI.settings.qualityChosen ? ' (dipilih)' : ' (auto)'}`,
      `Purata FPS: ${avg.toFixed(1)} dalam ${(perf.ms / 1000).toFixed(0)} s (${perf.frames} frame)`,
      `Frame lambat (>33 ms): ${perf.slow} (${perf.frames ? ((perf.slow / perf.frames) * 100).toFixed(1) : 0}%) · terburuk ${perf.worst.toFixed(0)} ms`,
      `Bina scene (JS): ${(g.buildMs || 0).toFixed(1)} ms · instance: ${g.instances || '?'} · draw call: ${g.draws ?? g.drawCalls ?? '?'}`,
    ].join('\n');
  }
  UI.perfReport = perfReport;
  perfEl.addEventListener('click', () => {
    const text = perfReport();
    if (navigator.clipboard && location.protocol !== 'file:') navigator.clipboard.writeText(text).then(() => UI.toast('Laporan prestasi disalin!', 'good')).catch(() => UI.toast(text));
    else UI.toast('Salin dari konsol: ABCC.UI.perfReport()');
    console.log(text);
  });
  function perfFrame(now, rawMs) {
    if (!showPerf()) { if (!perfEl.hidden) perfEl.hidden = true; return; }
    if (rawMs > 0 && rawMs < 1000) { // ignore the first frame and tab-switch gaps
      perf.frames++; perf.ms += rawMs; perf.winFrames++; perf.winMs += rawMs;
      perf.winWorst = Math.max(perf.winWorst, rawMs); perf.worst = Math.max(perf.worst, rawMs);
      if (rawMs > 33.4) perf.slow++;
    }
    if (now - perf.shown > 500) {
      perf.shown = now;
      perf.fps = perf.winMs ? (perf.winFrames / perf.winMs) * 1000 : 0;
      const g = UI.gfx?.stats?.() || {};
      perfEl.hidden = false;
      perfEl.className = `perf-hud ${perf.fps < 25 ? 'bad' : perf.fps < 50 ? 'slow' : ''}`;
      perfEl.textContent = `FPS ${perf.fps.toFixed(0)} · terburuk ${perf.winWorst.toFixed(0)} ms · bina ${(g.buildMs || 0).toFixed(1)} ms · ${UI.settings.quality} · ${innerWidth}×${innerHeight}@${devicePixelRatio}`;
      perf.winFrames = 0; perf.winMs = 0; perf.winWorst = 0;
    }
  }

  function frame(now) {
    const s = UI.s;
    const rawMs = last ? now - last : 16;
    perfFrame(now, last ? rawMs : 0);
    const dt = last ? Math.min(0.07, rawMs / 1000) : 0;
    last = now;
    if (s.phase === 'active' && !UI.frozen) State.update(s, dt); // tests freeze time and step it by hand
    const atHome = s.phase === 'menu';
    const view = atHome && !UI.frozen ? UI.homeScene.step(s, dt) : s; // behind the main menu the café shows a live demo shop (js/ui/homescene.js)
    handleFx();

    if (UI.gfx) {
      const waiting = State.inQueue(s).some((c) => c.status === 'waiting');
      const drawn = UI.gfx.render(view, now, {
        pendingReady: s.phase === 'active' && !!s.pendingCustomerId && !!s.pendingDuration,
        hintCustomers: UI.settings.hints && s.phase === 'active' && !s.pendingCustomerId && waiting,
      });
      if (drawn && !atHome) UI.updateLabels(); // the labels belong to the real shop, and are hidden on the menu page anyway
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
      if (kind === 'assistant') { const p = a.people.find((q) => q.kind === 'assistant'); return p && { x: p.bx, y: p.by }; }
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
