/* ==========================================================================
   2j. ACTIONS — selecting things, Abang's task queue, and the options table
   --------------------------------------------------------------------------
   A tap only ever SELECTS (customer, PC or event). What can be done with the selection
   comes from options() — one table the UI renders and the tests read. Choosing an option
   either happens at once or queues a task: Abang walks to the spot, works for a moment,
   and the outcome lands when he's done.
   ========================================================================== */
(function (ns) {
  'use strict';

  const { CFG, ROOM, FAULTS, EVENTS, RENTAL, byId, fmtMoney } = ns;
  const S = ns.S;
  const State = (ns.State = ns.State || {});

  /** Seconds Abang spends working once he arrives. */
  const TASK_WORK = { restart: 1, repair: 2.2, cool: 1.2, reset: 1.5, soft: 1.8, harsh: 1.5, warn: 1.2, calm: 1.8, eject: 2, close: 1.3, search: 2.2, replace: 1.2 };
  const PC_FIX_TASKS = ['restart', 'repair', 'cool', 'reset'];
  const ISSUE_TASKS = ['soft', 'harsh', 'warn', 'calm', 'eject', 'close', 'search', 'replace'];
  const PC_TASKS = [...PC_FIX_TASKS, ...ISSUE_TASKS];

  const pendingTasks = (s) => s.commands.length + (s.activeTask ? 1 : 0);

  /* ---------- the options table ---------- */

  /** Fix buttons for a faulted PC (or a worn-out free one). */
  function faultOptions(s, p) {
    const F = FAULTS[p.fault];
    const cost = State.repairCost(s);
    const out = [];
    for (const kind of F.fix) {
      if (kind === 'restart') out.push({ act: 'restart', label: '↻ Restart', sub: p.customerId ? 'Refund 25% pelanggan · tekan R' : 'Percuma · tekan R', css: 'mint' });
      else if (kind === 'cool') out.push({ act: 'cool', label: '❄️ Sejukkan', sub: 'Percuma · pelanggan boleh sambung', css: 'mint' });
      else if (kind === 'reset') out.push({ act: 'reset', label: '📡 Reset sambungan', sub: 'Percuma · pelanggan boleh sambung', css: 'mint' });
      else if (kind === 'repair') out.push({ act: 'repair', label: '🔧 Repair', sub: `${fmtMoney(cost)} · ${Math.round(State.repairTime(s))}s · PC tak boleh guna`, css: 'sky', disabled: s.cash < cost, cost });
    }
    return out;
  }

  /** Everything the pop-up menu can offer for a selection. */
  function options(s, target) {
    if (!target) return [];
    if (target.kind === 'event') {
      const ev = State.eventById(s, target.id);
      return ev ? State.eventOptions(s, ev) : [];
    }
    if (target.kind !== 'pc') return [];
    const p = byId(s.pcs, target.id);
    if (!p) return [];
    if (p.issue) return State.issueOptions(s, p);
    if (p.fault && p.status === 'fault') return faultOptions(s, p);
    if (p.lingerTime > 0) {
      return [
        { act: 'extend', label: '➕ Sambung 30 min', sub: `+${fmtMoney(S.priceFor(30, p, 'puzzle'))} terus`, css: 'mint' },
        { act: 'sendoff', label: '👋 Minta balik', sub: 'Kosongkan PC', css: 'paper' },
      ];
    }
    if (p.status === 'free' && p.health < 45) {
      const cost = State.repairCost(s);
      return [{ act: 'repair', label: '🔧 Service', sub: `${fmtMoney(cost)} · pulihkan keadaan PC`, css: 'sky', disabled: s.cash < cost, cost }];
    }
    return [];
  }

  /** The three duration buttons for the selected customer. */
  function durationOptions(s, customerId) {
    const c = byId(s.customers, customerId);
    if (!c) return [];
    return S.priceList(null, c.game).map((d) => ({ minutes: d.minutes, price: d.price, wanted: d.minutes === c.requestedMinutes, chosen: d.minutes === s.pendingDuration }));
  }

  /* ---------- selecting ---------- */

  /** Tap on a customer, PC or event. Taps never resolve anything by themselves. */
  function select(s, ent) {
    if (!ent || s.phase !== 'active') return S.fail('Shift belum bermula.');
    if (ent.kind === 'customer') {
      const c = byId(s.customers, ent.id);
      if (!c || !['waiting', 'arriving'].includes(c.status)) return S.fail('Pelanggan sudah beredar.');
      s.pendingCustomerId = c.id;
      s.pendingDuration = null;
      s.selected = { kind: 'customer', id: c.id };
      return S.ok(`${c.name} minta ${c.requestedMinutes} minit. Pilih tempoh pada menu.`);
    }
    if (ent.kind === 'event') {
      const ev = State.eventById(s, ent.id);
      if (!ev) return S.fail('Kejadian dah selesai.');
      s.selected = { kind: 'event', id: ev.id };
      return S.ok(EVENTS[ev.type].title);
    }
    if (ent.kind === 'pc') {
      const p = byId(s.pcs, ent.id);
      if (!p) return S.fail('PC tak tersedia.');
      if (s.pendingCustomerId && s.pendingDuration && p.status === 'free' && !p.fault && !p.issue) return State.assignToPC(s, p.id);
      s.selected = { kind: 'pc', id: p.id };
      if (p.fault) return S.ok(`PC ${p.id}: ${FAULTS[p.fault].label}. Pilih tindakan pada menu.`);
      if (p.issue) return S.ok(`PC ${p.id} perlukan tindakan. Pilih pada menu.`);
      if (s.pendingCustomerId && !s.pendingDuration) return S.fail('Pilih tempoh sewaan dahulu.');
      return S.ok(`PC ${p.id} dipilih.`);
    }
    return S.fail('Tak dikenali.');
  }

  /* ---------- Abang's task queue ---------- */

  function queueTask(s, kind, entityId, x, y, work, opts = {}) {
    if (pendingTasks(s) >= CFG.MAX_COMMANDS) return S.fail('Arahan penuh (maks. 3).');
    if ([s.activeTask, ...s.commands].some((t) => t && t.entityId === entityId && t.entityKind === (opts.entityKind || 'pc'))) return S.fail('Abang dah dalam perjalanan ke situ.');
    s.commands.push({ id: ++s.taskSequence, kind, entityId, entityKind: opts.entityKind || 'pc', opts: opts.opts || {}, x, y, work, remaining: null });
    return S.ok('Abang dalam perjalanan…');
  }

  /** Begin a PC action (fix or incident response). */
  function beginAction(s, kind, id) {
    if (s.phase !== 'active') return S.fail('Buka shift dulu.');
    const p = byId(s.pcs, id);
    if (!p) return S.fail('PC tidak dijumpai.');
    const opt = options(s, { kind: 'pc', id }).find((o) => o.act === kind);
    if (!opt) return S.fail('Tindakan itu tak sesuai untuk PC ini.');
    if (opt.disabled) return S.fail(opt.cost && s.cash < opt.cost ? 'Duit tak cukup.' : 'Tindakan tak boleh dibuat sekarang.');

    if (kind === 'ignore') return finishAction(s, { kind, entityId: id, entityKind: 'pc', opts: {} }, true);
    const spot = ROOM.staffSpotFor(p);
    return queueTask(s, kind, id, spot.x, spot.y, TASK_WORK[kind] ?? 1);
  }

  /** Begin an event choice (walk to the spot first, unless it is a phone call). */
  function beginEventAction(s, evId, choiceId) {
    if (s.phase !== 'active') return S.fail('Buka shift dulu.');
    const ev = State.eventById(s, evId);
    if (!ev) return S.fail('Kejadian dah selesai.');
    const ch = EVENTS[ev.type].choices.find((c) => c.id === choiceId);
    if (!ch) return S.fail('Pilihan tak sah.');
    if (ch.cost && s.cash < ch.cost) return S.fail('Duit tak cukup.');
    if (ch.remote) return State.resolveEvent(s, evId, choiceId);
    return queueTask(s, 'event', evId, ev.spot.x, ev.spot.y, ch.work ?? ch.walkWork ?? 1.1, { entityKind: 'event', opts: { choice: choiceId } });
  }

  /** The single entry point the UI uses for any button in the pop-up menu. */
  function perform(s, act, id, choice) {
    if (s.phase !== 'active') return S.fail('Buka shift dulu.');
    if (act === 'duration') return State.chooseRental(s, id, Number(choice));
    if (act === 'event') return beginEventAction(s, id, choice);
    if (act === 'extend' || act === 'sendoff') return State.lingerChoice(s, id, act);
    return beginAction(s, act, id);
  }

  /** Apply the effect of a finished task. */
  function finishAction(s, task, immediate = false) {
    let result;
    if (task.entityKind === 'event' || task.kind === 'event') {
      result = State.resolveEvent(s, task.entityId, task.opts?.choice);
    } else {
      const p = byId(s.pcs, task.entityId);
      if (!p) return S.fail('PC tak dijumpai.');
      if (PC_FIX_TASKS.includes(task.kind)) {
        const msg = State.applyFix(s, p, task.kind);
        result = msg ? S.ok(msg) : S.fail('Tak dapat dilakukan.');
      } else result = State.resolveIssue(s, p, task.kind);
    }
    if (!immediate) S.emit('outcome', { ok: result.ok, msg: result.msg });
    return result;
  }

  /* ---------- Abang himself ---------- */

  function updatePlayer(s, dt) {
    const player = s.player;
    if (!s.activeTask && s.commands.length) {
      s.activeTask = s.commands.shift();
      s.activeTask.remaining = null;
      player.destination = null;
      player._routeGoal = null;
      player.errand = null;
    }
    const task = s.activeTask;
    if (!task) {
      player.working = false;
      // Idle: maybe finish a little errand (setting up a customer's PC), then stroll back behind the counter.
      if (player.errand) {
        const e = player.errand;
        if (!e.arrived) {
          player.destination = player.destination || { x: e.x, y: e.y };
          S.updateMove(player, dt, CFG.ABANG_ERRAND_SPEED);
          if (!player.destination) e.arrived = true;
          return;
        }
        e.hold -= dt;
        const pc = s.pcs.find((q) => Math.hypot(q.x - e.x, q.y - e.y) < 1.2);
        if (pc) player.facing = (player.facing ?? 0) + ns.shortestAngle(player.facing ?? 0, Math.atan2(pc.x - player.x, pc.y - player.y)) * (1 - Math.exp(-8 * dt));
        player.working = e.hold > 0;
        if (e.hold <= 0) {
          player.errand = null;
          player.idleTime = 3.6;
        }
        return;
      }
      player.idleTime = (player.idleTime || 0) + dt;
      const atHome = Math.hypot(player.x - ROOM.home.x, player.y - ROOM.home.y) < 0.15;
      if (!atHome && !player.destination && player.idleTime > 3.5) player.destination = { x: ROOM.home.x, y: ROOM.home.y };
      // Behind the counter Abang looks out at the customers in line.
      if (atHome && !player.destination) player.facing = (player.facing ?? 0) + ns.shortestAngle(player.facing ?? 0, Math.PI / 2) * (1 - Math.exp(-6 * dt));
      S.updateMove(player, dt, CFG.ABANG_ERRAND_SPEED);
      return;
    }
    player.idleTime = 0;
    const speed = S.taskSpeedMult(s) * (s.cleanupSlow > 0 ? 0.6 : 1);
    if (task.remaining === null) {
      if (!player.destination) player.destination = { x: task.x, y: task.y };
      S.updateMove(player, dt, CFG.ABANG_SPEED * speed);
      if (player.destination) return;
      task.remaining = (task.work * CFG.ABANG_WORK_SCALE) / speed;
    }
    player.working = true;
    player.moveIntensity = Math.max(0, (player.moveIntensity || 0) - dt * 7);
    const look = task.entityKind === 'event' ? State.eventById(s, task.entityId)?.focus : byId(s.pcs, task.entityId);
    if (look) {
      const target = Math.atan2(look.x - player.x, look.y - player.y);
      const current = player.facing ?? target;
      player.facing = current + ns.shortestAngle(current, target) * (1 - Math.exp(-8 * dt));
    }
    task.remaining -= dt;
    if (task.remaining <= 0) {
      finishAction(s, task);
      s.activeTask = null;
      player.working = false;
    }
  }

  Object.assign(State, { options, durationOptions, select, beginAction, beginEventAction, perform, finishAction, updatePlayer, pendingCount: pendingTasks, PC_TASKS, TASK_WORK });
})(window.ABCC);
