/* ==========================================================================
   2h. ASSISTANT — a hired helper who mops spills and replaces the fuse after a blackout
   --------------------------------------------------------------------------
   Unlocks on CFG.ASSISTANT.unlockDay. Hiring is one decision (a one-off fee, then a monthly wage that is paid with the
   rent) and cannot be undone. The assistant works on their own when idle ("auto"), or is sent to a spill / fuse box from
   its pop-up menu. They are slower than Abang, so Abang stays free for PCs and customers, and now and then they call in
   sick (MC): rolled when a new day begins, so the prep screen can announce it, never two days running.
   State lives in s.assistant (null until hired) and is saved with the run.
   ========================================================================== */
(function (ns) {
  'use strict';

  const { CFG, ROOM, EVENTS, ASSISTANT_MC } = ns;
  const S = ns.S;
  const State = (ns.State = ns.State || {});
  const A = CFG.ASSISTANT;

  /** What each kind of event is answered with. `choice` is the event choice the assistant carries out. */
  const JOB_CHOICE = { spill: 'mop', blackout: 'fuse' };

  const fresh = (day) => ({
    since: day, x: ROOM.assistantHome.x, y: ROOM.assistantHome.y, facing: Math.PI / 2,
    auto: true, mc: null, mcBlock: -1, mcDays: [], task: null, working: false, idle: 0, jobs: 0,
  });

  const present = (s) => !!s.assistant && !s.assistant.mc;
  const canHire = (s) => s.day >= A.unlockDay && !s.assistant;

  /** Hire from the prep screen. Final: there is no way to let them go. */
  function hire(s) {
    if (s.phase !== 'prep') return S.fail('Upah pembantu sebelum shift bermula.');
    if (s.assistant) return S.fail('Pembantu dah bekerja di sini.');
    if (s.day < A.unlockDay) return S.fail(`Pembantu boleh diupah mulai Hari ${A.unlockDay}.`);
    if (s.cash < A.hireFee) return S.fail('Duit tak cukup untuk upah pembantu.');
    S.record(s, 'hire', -A.hireFee, 'Upah pembantu');
    s.assistant = fresh(s.day);
    S.log(s, `🎀 ${A.name} mula bekerja. Gaji dibayar sebulan sekali bersama sewa.`);
    S.emit('assistantHired');
    return S.ok('Pembantu mula kerja! Gaji dibayar sebulan sekali.');
  }

  /** The sick days of one block of `mcBlock` days: one at random, now and then two, never next to each other, never before the day after hiring. */
  function planSickDays(s, block) {
    const first = Math.max(block * A.mcBlock + 1, s.assistant.since + 1);
    const last = (block + 1) * A.mcBlock;
    const days = [];
    const want = S.chance(s, A.mcExtraChance) ? 2 : 1;
    for (let tries = 0; tries < 12 && days.length < want && last >= first; tries++) {
      const d = first + Math.floor(S.random(s) * (last - first + 1));
      if (days.every((x) => Math.abs(x - d) > 1)) days.push(d);
    }
    return days.sort((x, y) => x - y);
  }

  /** As a new day begins: is the assistant on MC today? The sick days of each 10-day block are planned once, so a retried day repeats it. */
  function rollSickLeave(s) {
    const a = s.assistant;
    if (!a) return;
    const block = Math.floor((s.day - 1) / A.mcBlock);
    if (a.mcBlock !== block) {
      a.mcBlock = block;
      a.mcDays = planSickDays(s, block);
    }
    a.mc = a.mcDays.includes(s.day) ? { reason: S.choice(s, ASSISTANT_MC) } : null;
  }

  /** Back to the corner at the start of every shift. */
  function resetForShift(s) {
    const a = s.assistant;
    if (!a) return;
    Object.assign(a, { x: ROOM.assistantHome.x, y: ROOM.assistantHome.y, facing: Math.PI / 2, task: null, working: false, idle: 0, destination: null, _route: [], _routeGoal: null, vx: 0, vy: 0, moveIntensity: 0 });
    if (a.mc) {
      S.log(s, `🤒 ${A.name} MC hari ini: ${a.mc.reason}`);
      S.emit('assistantMc', { reason: a.mc.reason });
    }
  }

  const takenByAbang = (s, evId) => [s.activeTask, ...s.commands].some((t) => t && t.entityKind === 'event' && t.entityId === evId);

  /** The job the assistant would do for this event right now, or null when it is not theirs / not worth it / not affordable. */
  function jobFor(s, ev) {
    const choice = JOB_CHOICE[ev.type];
    const ch = choice && EVENTS[ev.type].choices.find((c) => c.id === choice);
    if (!ch) return null;
    if (ev.type === 'blackout' && s.powerOutage <= 6) return null; // walking over and working takes about that long: it would be over by the time they got there
    if (ch.cost && s.cash < ch.cost) return null;
    if (takenByAbang(s, ev.id)) return null;
    return { evId: ev.id, choice, kind: ev.type, work: ch.work ?? ch.walkWork ?? 1, remaining: null };
  }

  /** Where the assistant stands to work on an event (clear of the spot Abang uses). */
  function spotFor(ev) {
    return ev.kind === 'power' ? { x: ROOM.fuse.spot.x + 0.1, y: ROOM.fuse.spot.y + 0.55 } : { x: ev.focus.x + 0.8, y: ev.focus.y };
  }

  /** Auto mode: blackouts first, then the nearest spill. */
  function pickJob(s) {
    const a = s.assistant;
    let best = null;
    for (const ev of s.worldEvents || []) {
      const job = jobFor(s, ev);
      if (!job) continue;
      const spot = spotFor(ev);
      const score = (ev.type === 'blackout' ? 0 : 100) + Math.hypot(spot.x - a.x, spot.y - a.y);
      if (!best || score < best.score) best = { job, score };
    }
    return best ? best.job : null;
  }

  /** "Suruh Pembantu": send them to a spill or the fuse box. */
  function go(s, evId) {
    if (s.phase !== 'active') return S.fail('Buka shift dulu.');
    const a = s.assistant;
    if (!a) return S.fail('Belum ada pembantu.');
    if (a.mc) return S.fail(`${A.name} MC hari ni.`);
    if (a.task) return S.fail(`${A.name} tengah sibuk.`);
    const ev = State.eventById(s, evId);
    if (!ev) return S.fail('Kejadian dah selesai.');
    const job = jobFor(s, ev);
    if (!job) return S.fail(`${A.name} tak boleh uruskan itu sekarang.`);
    a.task = job;
    a.idle = 0;
    return S.ok(`${A.name} dalam perjalanan…`);
  }

  function setAuto(s, on) {
    if (!s.assistant) return S.fail('Belum ada pembantu.');
    s.assistant.auto = on === undefined ? !s.assistant.auto : !!on;
    return S.ok(s.assistant.auto ? `${A.name} uruskan sendiri.` : `${A.name} tunggu arahan.`);
  }

  /** The extra button on a spill / blackout pop-up: null when it does not apply. */
  function eventOption(s, ev) {
    if (!s.assistant || !JOB_CHOICE[ev.type]) return null;
    const a = s.assistant;
    const base = { act: 'asstgo', label: `🎀 Suruh ${A.name}`, css: 'sky' };
    if (a.mc) return { ...base, sub: '🤒 MC hari ini', css: 'paper', disabled: true };
    if (a.task) return { ...base, sub: 'Tengah sibuk', css: 'paper', disabled: true };
    if (!jobFor(s, ev)) return { ...base, sub: ev.type === 'blackout' ? 'Tak sempat, hampir pulih' : 'Tak boleh sekarang', css: 'paper', disabled: true };
    return { ...base, sub: ev.type === 'blackout' ? 'Fius RM8 · lebih perlahan dari Abang' : 'Percuma · Abang tak terganggu', disabled: false };
  }

  /** The pop-up menu when you tap the assistant themselves. */
  function menuOptions(s) {
    const a = s.assistant;
    if (!a) return [];
    return [
      { act: 'asstauto', label: a.auto ? '🤖 Auto: ON' : '🤖 Auto: OFF', sub: a.auto ? 'Uruskan air tumpah & blackout sendiri' : 'Hanya bila disuruh', css: a.auto ? 'mint' : 'paper' },
      { act: 'asstinfo', label: '❓ Apa boleh buat?', sub: 'Senarai kerja dan had', css: 'sky' },
    ];
  }

  /** One line about what they are doing, for the menu and the jobs panel. */
  function statusText(s) {
    const a = s.assistant;
    if (!a) return '';
    if (a.mc) return `🤒 MC hari ini: ${a.mc.reason}`;
    if (a.task) return `${a.task.kind === 'blackout' ? '⚡ Tukar fius' : '🧽 Lap air tumpah'} ${a.task.remaining === null ? '(menuju…)' : '(sedang buat)'}`;
    return a.auto ? '☕ Rehat, sedia bertugas' : '☕ Rehat, tunggu arahan';
  }

  /** Per-frame: pick a job, walk to it, work on it, finish it. */
  function update(s, dt) {
    const a = s.assistant;
    if (!a || a.mc || s.phase !== 'active') return;
    if (a.task) {
      const ev = State.eventById(s, a.task.evId);
      if (!ev || takenByAbang(s, ev.id) || (a.task.kind === 'blackout' && s.powerOutage <= 0)) {
        a.task = null; // it was taken care of (or timed out) by someone else
        a.working = false;
        a.destination = null;
        a._routeGoal = null;
      }
    }
    if (!a.task && a.auto) {
      const job = pickJob(s);
      if (job) a.task = job;
    }

    const task = a.task;
    if (!task) {
      a.working = false;
      a.idle = (a.idle || 0) + dt;
      const atHome = Math.hypot(a.x - ROOM.assistantHome.x, a.y - ROOM.assistantHome.y) < 0.15;
      if (!atHome && !a.destination && a.idle > 1.2) a.destination = { x: ROOM.assistantHome.x, y: ROOM.assistantHome.y };
      if (atHome && !a.destination) a.facing = (a.facing ?? 0) + ns.shortestAngle(a.facing ?? 0, Math.PI / 2) * (1 - Math.exp(-6 * dt));
      S.updateMove(a, dt, A.speed * 0.85);
      return;
    }

    a.idle = 0;
    const ev = State.eventById(s, task.evId);
    if (task.remaining === null) {
      if (!a.destination) a.destination = spotFor(ev);
      S.updateMove(a, dt, A.speed);
      if (a.destination) return;
      task.remaining = task.work * A.workScale;
    }
    a.working = true;
    a.moveIntensity = Math.max(0, (a.moveIntensity || 0) - dt * 7);
    const look = ev.focus;
    if (look) a.facing = (a.facing ?? 0) + ns.shortestAngle(a.facing ?? 0, Math.atan2(look.x - a.x, look.y - a.y)) * (1 - Math.exp(-8 * dt));
    task.remaining -= dt;
    if (task.remaining <= 0) {
      const r = State.resolveEvent(s, ev.id, task.choice, { by: 'assistant' });
      if (r.ok) {
        a.jobs++;
        s.shiftStats.assistantJobs++;
      }
      S.emit('assistantDone', { ok: r.ok, msg: r.msg });
      a.task = null;
      a.working = false;
    }
  }

  Object.assign(State, { hireAssistant: hire, canHireAssistant: canHire, assistantPresent: present, rollSickLeave, resetAssistantForShift: resetForShift, assistantGo: go, assistantAuto: setAuto, assistantEventOption: eventOption, assistantMenuOptions: menuOptions, assistantStatus: statusText, updateAssistant: update, assistantOnEvent: (s, evId) => s.assistant?.task?.evId === evId });
})(window.ABCC);
