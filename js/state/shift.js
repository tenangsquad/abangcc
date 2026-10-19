/* ==========================================================================
   2k. SHIFT FLOW — new game, start/end of a day, retry, the master tick
   ========================================================================== */
(function (ns) {
  'use strict';

  const { CFG, ROOM, DIRECTOR, byId, clamp, fmtMoney } = ns;
  const S = ns.S;
  const State = (ns.State = ns.State || {});

  const newStats = () => ({ served: 0, complaints: 0, repairs: 0, incidents: 0, inspections: 0, walkouts: 0, walkoutLost: 0, wrongDuration: 0, wrongLost: 0, falseAccusations: 0, pcDownSec: 0, idleWhileWaiting: 0, blackoutSec: 0 });

  function create(seed) {
    return {
      version: CFG.VERSION,
      seed: seed || (Date.now() >>> 0) ^ 2007,
      phase: 'menu', // menu | onboarding | prep | active | paused | result
      day: 1,
      elapsed: 0,
      cash: CFG.START_CASH,
      rep: 55,
      professionalism: 75,
      compliance: 75,
      risk: 20,
      preset: 'biasa',
      customerSequence: 0,
      ledgerSequence: 0,
      taskSequence: 0,
      eventSeq: 0,
      pcs: Array.from({ length: 3 }, (_, i) => S.makePc(i)),
      customers: [],
      player: { x: ROOM.home.x, y: ROOM.home.y },
      commands: [],
      activeTask: null,
      logs: [],
      perks: [],
      perkCooldowns: {},
      perkDraft: [],
      perkChoiceMade: false,
      perkHistory: [],
      selected: { kind: 'pc', id: 1 },
      pendingCustomerId: null,
      pendingDuration: null,
      shiftLedger: [],
      once: {},
      incidentCount: 0,
      eventTypes: [],
      eventCooldown: 0,
      spawnCooldown: 4,
      inspectionDoneDay: false,
      inspectionsCampaign: 0,
      repeatOffences: 0,
      violationLog: [],
      loanUsed: false,
      reports: [],
      shiftStats: newStats(),
      lastReport: null,
      introStep: 0,
      beatIndex: 0,
      beatPlan: [],
      worldEvents: [],
      activeIssues: [],
      officer: null,
      inspectionIncoming: 0,
      inspectionScheduled: 999,
      combo: 0,
      bestCombo: 0,
      heroSaved: 0,
      peakRush: 0,
      dayGoal: ns.DIRECTOR.goal.start * 100,
      shiftStartCash: ns.CFG.START_CASH,
      dayFailed: false,
      dayCheckpoint: null,
      peakWindows: [],
      peakActive: false,
      peakIndex: -1,
      networkRush: 0,
      snackMessTimer: 0,
      powerOutage: 0,
      powerFlicker: 0,
      specialAt: [],
      specialSeen: [],
      specialHandled: 0,
      cleanupSlow: 0,
      queueBoost: 0,
    };
  }

  /** Rush-hour windows (seconds into the shift) for this day. */
  function makePeakWindows(s) {
    const windows = [];
    for (const p of DIRECTOR.peaks) {
      if (s.day < p.fromDay) continue;
      const start = Math.floor(S.between(s, p.start));
      const len = Math.floor(S.between(s, p.len));
      windows.push({ start, end: p.endCap ? Math.min(p.endCap, start + len) : start + len, label: p.label });
    }
    return windows;
  }

  function snapshotDay(s) {
    const snap = S.clone(s);
    snap.dayCheckpoint = null;
    return JSON.stringify(snap);
  }

  function startShift(s) {
    if (s.phase !== 'prep') return false;
    // anything the player left unbought goes on its short cooldown before the day begins
    if (!s.perkChoiceMade && s.perkDraft?.length) State.settleCooldowns(s, null);
    Object.assign(s, {
      phase: 'active',
      elapsed: 0,
      eventCooldown: DIRECTOR.trouble.firstAt + 3,
      spawnCooldown: 0.45,
      beatIndex: 0,
      inspectionIncoming: 0,
      combo: 0,
      bestCombo: 0,
      heroSaved: 0,
      peakRush: 0,
      incidentCount: 0,
      eventTypes: [],
      shiftLedger: [],
      shiftStartCash: s.cash,
      once: {},
      violationLog: [],
      inspectionDoneDay: false,
      shiftStats: newStats(),
      customers: [],
      activeTask: null,
      commands: [],
      activeIssues: [],
      worldEvents: [],
      peakActive: false,
      peakIndex: -1,
      dayFailed: false,
      pendingCustomerId: null,
      pendingDuration: null,
      officer: null,
      powerOutage: 0,
      powerFlicker: 0,
      cleanupSlow: 0,
      networkRush: 0,
      specialHandled: 0,
      specialSeen: [],
      queueBoost: 0,
    });
    s.beatPlan = State.makeBeatPlan(s);
    s.peakWindows = makePeakWindows(s);
    s.dayGoal = S.goalFor(s, s.day);
    s.inspectionScheduled = State.scheduleInspection(s);
    s.specialAt = State.makeSpecialSlots(s);

    for (const p of s.pcs) {
      Object.assign(p, { customerId: null, issue: null, screenAngle: 0, occupiedSeconds: 0, rentalSeconds: 0, lingerTime: 0 });
      if (p.status !== 'job') p.status = p.fault ? 'fault' : 'free';
    }
    s.player = { x: ROOM.home.x, y: ROOM.home.y };
    S.log(s, `Hari ${s.day} bermula. Target hasil hari ini: ${fmtMoney(s.dayGoal)}.`);
    s.dayCheckpoint = '';
    s.dayCheckpoint = snapshotDay(s);
    S.emit('shiftStart');
    return true;
  }

  /** The "why did we miss it" lines on a failed shift report, biggest loss first. */
  function explainShortfall(s, b) {
    const st = s.shiftStats;
    const lines = [];
    const refundByKind = {};
    for (const e of s.shiftLedger) if (e.cat === 'refund') refundByKind[e.kind] = (refundByKind[e.kind] || 0) - e.amount;
    if (-b.refunds > 0) lines.push({ cost: -b.refunds, icon: '↩️', text: `Refund RM${(-b.refunds / 100).toFixed(2)} (restart, salah tuduh, PC rosak) mengurangkan jualan.` });
    if (st.walkouts > 0) lines.push({ cost: st.walkoutLost || st.walkouts * 150, icon: '🚶', text: `${st.walkouts} pelanggan balik sebelum sempat main — kira-kira ${fmtMoney(st.walkoutLost || st.walkouts * 150)} jualan hilang.` });
    if (st.wrongDuration > 0) lines.push({ cost: st.wrongLost, icon: '⏱️', text: `${st.wrongDuration} kali tempoh sewaan salah — ${fmtMoney(st.wrongLost)} hilang.` });
    if (st.falseAccusations > 0) lines.push({ cost: 300 * st.falseAccusations, icon: '😬', text: `${st.falseAccusations} salah tuduh — pelanggan keluar dan reputasi jatuh.` });
    if (st.pcDownSec > 20) lines.push({ cost: st.pcDownSec * 8, icon: '🔧', text: `PC rosak/diselenggara sejumlah ${Math.round(st.pcDownSec)} saat-PC — kapasiti terbuang.` });
    if (st.idleWhileWaiting > 12) lines.push({ cost: st.idleWhileWaiting * 10, icon: '🖥️', text: `PC kosong ${Math.round(st.idleWhileWaiting)} saat-PC ketika pelanggan menunggu. Assign lebih cepat!` });
    if (st.blackoutSec > 3) lines.push({ cost: st.blackoutSec * 20, icon: '⚡', text: `Blackout ${Math.round(st.blackoutSec)} saat menghentikan semua sewaan.` });
    if (st.served === 0) lines.push({ cost: 9999, icon: '🧾', text: 'Tiada pelanggan dilayan langsung.' });
    return lines.sort((a, b2) => b2.cost - a.cost).slice(0, 3).map(({ icon, text }) => ({ icon, text }));
  }

  function endShift(s) {
    if (s.phase !== 'active') return;
    for (const c of s.customers.filter((c) => c.pcId && c.status !== 'gone')) State.releaseCustomer(s, c, null, 0);
    s.customers = [];
    s.commands = [];
    s.activeTask = null;
    s.worldEvents = [];
    for (const p of s.pcs) {
      p.screenAngle = 0;
      if (p.status === 'job') {
        p.job = null;
        p.status = 'free';
      }
      if (p.status === 'reserved' || p.status === 'busy') p.status = p.fault ? 'fault' : 'free';
      p.issue = null;
      p.customerId = null;
      p.lingerTime = 0;
    }
    s.activeIssues = [];
    s.officer = null;
    s.powerOutage = 0;

    // judge the day on sales BEFORE the bills go out — expenses are never "sales"
    const b = S.breakdown(s);
    const goal = S.goalFor(s, s.day);
    const income = b.net;
    const goalMet = income >= goal;

    // Rent + utilities only fall due once a month; perk upkeep is only booked if the shop owns perks that cost something.
    const billDay = S.isBillDay(s);
    const bills = billDay ? S.monthlyBills(s) : null;
    if (bills) {
      S.record(s, 'rent', -bills.rent, 'Sewa tapak (bulanan)');
      S.record(s, 'electric', -bills.electric, 'Bil elektrik (bulanan)');
      S.record(s, 'internet', -bills.internet, 'Bil internet (bulanan)');
      S.log(s, `🧾 Hujung bulan: sewa & bil ${fmtMoney(bills.total)} dibayar.`);
    }
    const upkeep = S.perkUpkeep(s);
    if (upkeep) S.record(s, 'upkeep', -upkeep, 'Penyelenggaraan perk');
    const paid = S.breakdown(s);
    const expense = paid.expenses; // belanja: everything actually spent this shift

    // risk drifts with how the shop was run
    S.bump(s, 'risk', s.violationLog.length * 4 - (s.violationLog.length === 0 && s.compliance >= 70 ? 3 : 0) - (s.professionalism >= 70 ? 2 : 0));

    const after = S.breakdown(s);
    const report = {
      day: s.day,
      goal,
      goalMet,
      income, // qualifying sales minus refunds — what the target is judged on
      rental: after.rental,
      other: after.other,
      refunds: after.refunds,
      expense, // belanja (0 when nothing was spent)
      bills, // monthly rent + utilities, or null when no bill was due today
      billsPaid: paid.bills,
      net: income - paid.bills - expense,
      shortfall: Math.max(0, goal - income),
      reasons: goalMet ? [] : explainShortfall(s, b),
      endingCash: s.cash,
      combo: s.bestCombo,
      heroSaved: s.heroSaved,
      served: s.shiftStats.served,
      incidents: s.shiftStats.incidents,
      repairs: s.shiftStats.repairs,
      inspections: s.shiftStats.inspections,
      rep: s.rep,
      professionalism: s.professionalism,
      compliance: s.compliance,
      violations: s.violationLog.length,
      specialEvents: s.specialHandled || 0,
      // 1–3 stars: 1 = goal missed, 2 = goal met, 3 = goal beaten by 40% with a healthy reputation.
      stars: !goalMet ? 1 : income >= goal * 1.4 && s.rep >= 55 ? 3 : 2,
    };
    s.lastReport = report;
    s.reports.push(report);
    s.dayFailed = !goalMet;
    s.phase = 'result';
    S.log(s, goalMet ? `Shift hari ${s.day} tamat. Target hasil capai!` : `Shift hari ${s.day} tamat. Target hasil TAK CAPAI.`);
    S.emit(goalMet ? 'dayWon' : 'dayLost');
  }

  function proceed(s) {
    if (s.phase !== 'result' || s.dayFailed) return;
    s.day++;
    s.phase = 'prep';
    s.elapsed = 0;
    s.customerSequence = 0;
    s.customers = [];
    s.player = { x: ROOM.home.x, y: ROOM.home.y };
    for (const p of s.pcs) {
      // a night's rest reboots everything except real hardware damage
      if (p.fault && p.fault !== 'hardware') {
        p.fault = null;
        p.faultAge = 0;
        if (p.status === 'fault') p.status = 'free';
      }
      if (!p.fault && p.status === 'fault') p.status = 'free';
    }
    s.selected = { kind: 'pc', id: 1 };
    s.dayGoal = S.goalFor(s, s.day);
    State.draftPerks(s);
    S.log(s, `Hari ${s.day}: ${CFG.PREP_MESSAGE[(s.day - 1) % CFG.PREP_MESSAGE.length] || 'KEDAI BUKA LAGI'}`);
  }

  /** Restore the start-of-day checkpoint (same day, same perks, same progress) after a failed shift. */
  function retryDay(s) {
    if (!s.dayCheckpoint) return s;
    const next = JSON.parse(s.dayCheckpoint);
    next.phase = 'prep';
    next.elapsed = 0;
    next.dayFailed = false;
    next.dayCheckpoint = null;
    next.logs = [...(next.logs || [])];
    S.log(next, `↻ Hari ${next.day} diulang. Susun strategi sebelum buka semula.`);
    return next;
  }

  /* ---------- master tick ---------- */

  function update(s, dt) {
    if (s.phase !== 'active') return;
    dt = clamp(dt, 0, 0.08);
    s.elapsed += dt;
    s.spawnCooldown -= dt;
    s.eventCooldown -= dt;
    if (s.networkRush > 0) s.networkRush -= dt;
    if (s.powerFlicker > 0) s.powerFlicker -= dt;
    if (s.powerOutage > 0) {
      s.shiftStats.blackoutSec += dt;
      s.powerOutage = Math.max(0, s.powerOutage - dt);
      if (s.powerOutage === 0) {
        s.powerFlicker = 2;
        S.bump(s, 'rep', 1);
        S.log(s, '💡 Elektrik pulih! Komputer kembali menyala.');
        S.emit('powerBack');
      }
    }
    if (s.cleanupSlow > 0) s.cleanupSlow = Math.max(0, s.cleanupSlow - dt);
    if (s.peakRush > 0) s.peakRush -= dt;

    // Rush hour windows
    const peakIndex = (s.peakWindows || []).findIndex((w) => s.elapsed >= w.start && s.elapsed < w.end);
    const nowPeak = peakIndex >= 0;
    if (nowPeak !== s.peakActive) {
      s.peakActive = nowPeak;
      s.peakIndex = peakIndex;
      if (nowPeak) {
        S.log(s, `🔥 PEAK HOUR: ${peakLabel(s)}! Customer datang ramai dan makin cepat panas.`);
        S.emit('peak');
      } else {
        S.log(s, '😮‍💨 Peak hour reda sekejap.');
      }
    }

    // a customer who has since walked out can't stay selected
    if (s.pendingCustomerId && !State.inQueue(s).some((c) => c.id === s.pendingCustomerId)) {
      s.pendingCustomerId = null;
      s.pendingDuration = null;
    }

    // Arrivals
    if (s.spawnCooldown <= 0) {
      State.spawn(s);
      s.spawnCooldown = S.spawnInterval(s);
    }

    // Random trouble
    if (s.eventCooldown <= 0 && s.elapsed > DIRECTOR.trouble.firstAt) {
      State.triggerTrouble(s);
      s.eventCooldown = S.troubleInterval(s);
    }
    if (S.hasPerk(s, 'snack') && s.snackMessTimer > 0) {
      s.snackMessTimer -= dt;
      if (s.snackMessTimer <= 0) {
        S.record(s, 'snack_loss', -50, 'Kedai kotor / snack missing');
        S.bump(s, 'rep', -1);
        S.log(s, '🥤 Mesin snack buat hal — kedai jadi kotor sedikit.');
      }
    }

    State.updatePlayer(s, dt);
    State.updatePeople(s, dt);
    State.updatePcs(s, dt);
    State.expireIssues(s, dt);
    State.updateEvents(s, dt);
    State.runScriptedBeat(s);
    State.runSpecialDirector(s);

    // Late-game complaints can summon an inspector.
    const I = DIRECTOR.inspection;
    const complaintLikely = s.day >= I.summonFromDay && s.risk > I.summonRisk && !s.inspectionDoneDay && !s.officer && s.shiftStats.inspections < 2 && s.elapsed > 63 && s.elapsed < 102;
    if (complaintLikely && S.random(s) < dt * I.summonChance) {
      s.inspectionScheduled = Math.min(s.inspectionScheduled, s.elapsed + 3);
      S.log(s, '👮 Ada aduan tentang CC. Pegawai mungkin akan masuk.');
    }
    if (!s.inspectionDoneDay && !s.officer && s.elapsed >= s.inspectionScheduled && s.elapsed < I.latest) State.startOfficer(s);
    State.updateOfficer(s, dt);

    // accounting for the "why did we miss it" report
    for (const p of s.pcs) {
      if (p.status === 'fault' || p.status === 'job') s.shiftStats.pcDownSec += dt;
      else if (p.status === 'free' && State.inQueue(s).some((c) => c.status === 'waiting')) s.shiftStats.idleWhileWaiting += dt;
    }

    if (s.elapsed >= CFG.SHIFT) {
      s.elapsed = CFG.SHIFT;
      endShift(s);
    }
  }

  const peakLabel = (s) => (s.peakWindows?.[s.peakIndex] || {}).label || 'RUSH';

  Object.assign(State, { create, startShift, endShift, proceed, retryDay, update, peakLabel, snapshotDay });
})(window.ABCC);
