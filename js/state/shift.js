/* ==========================================================================
   2k. SHIFT FLOW — new game, start/end of a day, retry, the master tick
   ========================================================================== */
(function (ns) {
  'use strict';

  const { CFG, ROOM, DIRECTOR, TIERS, byId, clamp, clock, fmtMoney } = ns;
  const S = ns.S;
  const State = (ns.State = ns.State || {});

  const newStats = () => ({ served: 0, complaints: 0, repairs: 0, incidents: 0, inspections: 0, walkouts: 0, queueWalkouts: 0, walkoutLost: 0, wrongDuration: 0, wrongLost: 0, falseAccusations: 0, pcDownSec: 0, idleWhileWaiting: 0, blackoutSec: 0, assistantJobs: 0,
    // for the end-of-day recap
    hourly: Array(12).fill(0), pcFaults: {}, walkByType: {}, servedByType: {}, bestSale: null, closeCall: null, tips: 0, generatorRuns: 0, tierMoves: [] });

  function create(seed, preset) {
    return {
      version: CFG.VERSION,
      seed: seed || (Date.now() >>> 0) ^ 2007,
      phase: 'menu', // menu | onboarding | prep | active | paused | result
      day: 1,
      elapsed: 0,
      cash: CFG.START_CASH,
      rep: 55,
      repTier: 'biasa',
      assistant: null, // the hired helper (see js/state/assistant.js), null until hired
      professionalism: 75,
      compliance: 75,
      risk: 20,
      preset: ns.DIRECTOR.presets[preset] ? preset : 'biasa', // chosen once at New Game and locked to this save
      tierStreak: 0, // days in a row the reputation has stood at the next tier's mark (see settleTier)
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
      repAtStart: s.rep, // the day's reputation gain is measured from here (see the settlement in endShift)
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
    State.resetAssistantForShift(s);
    S.log(s, `Hari ${s.day} bermula. Target hasil hari ini: ${fmtMoney(s.dayGoal)}.`);
    s.dayCheckpoint = '';
    s.dayCheckpoint = snapshotDay(s);
    S.emit('shiftStart');
    return true;
  }

  /** Everything that cost the shop money, biggest first, each with a one-line fix. Feeds the report's headline and its "why" list. */
  function leakLines(s, b) {
    const st = s.shiftStats;
    const lines = [];
    const refunded = -b.refunds;
    const queueWalk = st.queueWalkouts || 0;
    const faultWalk = Math.max(0, (st.walkouts || 0) - queueWalk);
    const walkCost = (n) => (st.walkouts ? (st.walkoutLost || st.walkouts * 150) * (n / st.walkouts) : 0);
    if (refunded > 0) lines.push({ cost: refunded, icon: '↩️', text: `Refund RM${(refunded / 100).toFixed(2)} (restart, salah tuduh, PC rosak) mengurangkan jualan.`, head: `Refund ${fmtMoney(refunded)} makan jualan`, tip: 'Kalau PC panas atau internet putus, guna Sejukkan / Reset (percuma, tiada refund).' });
    if (queueWalk > 0) lines.push({ cost: walkCost(queueWalk) || queueWalk * 150, icon: '🚶', text: `${queueWalk} pelanggan balik sebelum sempat main — kira-kira ${fmtMoney(walkCost(queueWalk) || queueWalk * 150)} jualan hilang.`, head: `${queueWalk} pelanggan balik marah sebab beratur terlalu lama`, tip: 'Layan yang bar kesabarannya paling merah dulu. Tap dua kali pelanggan = auto-duduk, lebih pantas.' });
    if (faultWalk > 0) lines.push({ cost: walkCost(faultWalk) || faultWalk * 150, icon: '🖥️', text: `${faultWalk} pelanggan balik sebab PC mereka rosak.`, head: `${faultWalk} pelanggan balik sebab PC rosak`, tip: 'Baiki PC yang ada pelanggan dahulu. Rak Spare Parts mempercepatkan repair.' });
    if (st.wrongDuration > 0) lines.push({ cost: st.wrongLost, icon: '⏱️', text: `${st.wrongDuration} kali tempoh sewaan salah — ${fmtMoney(st.wrongLost)} hilang.`, head: `${st.wrongDuration} kali tempoh sewaan salah (−${fmtMoney(st.wrongLost)})`, tip: 'Pilih tempoh bertanda ★, atau guna auto-duduk yang sentiasa pilih ★.' });
    if (st.falseAccusations > 0) lines.push({ cost: 300 * st.falseAccusations, icon: '😬', text: `${st.falseAccusations} salah tuduh — pelanggan keluar dan reputasi jatuh.`, head: `${st.falseAccusations} pelanggan dituduh salah`, tip: 'Bila tak pasti, pilih Tegur baik-baik. CCTV memberi petunjuk (tak 100% tepat).' });
    if (st.pcDownSec > 20) lines.push({ cost: st.pcDownSec * 8, icon: '🔧', text: `PC rosak/diselenggara sejumlah ${Math.round(st.pcDownSec)} saat-PC — kapasiti terbuang.`, head: `PC tak dapat digunakan ${Math.round(st.pcDownSec)} saat-PC`, tip: 'Baiki PC rosak cepat. Repair makan masa, jadi beri arahan awal.' });
    if (st.idleWhileWaiting > 12) lines.push({ cost: st.idleWhileWaiting * 10, icon: '🖥️', text: `PC kosong ${Math.round(st.idleWhileWaiting)} saat-PC ketika pelanggan menunggu. Assign lebih cepat!`, head: `PC kosong ${Math.round(st.idleWhileWaiting)} saat-PC ketika orang menunggu`, tip: 'Assign terus. Tap dua kali pelanggan untuk auto-duduk.' });
    if (st.blackoutSec > 3) lines.push({ cost: st.blackoutSec * 20, icon: '⚡', text: `Blackout ${Math.round(st.blackoutSec)} saat menghentikan semua sewaan.`, head: `Blackout ${Math.round(st.blackoutSec)} saat`, tip: 'Terus ke kotak fius bila lampu padam. RM8 itu murah berbanding jualan yang hilang.' });
    if (st.served === 0) lines.push({ cost: 9999, icon: '🧾', text: 'Tiada pelanggan dilayan langsung.', head: 'Tiada pelanggan dilayan', tip: 'Tap pelanggan di queue, pilih minit, kemudian tap PC kosong.' });
    return lines.sort((a, b2) => b2.cost - a.cost);
  }

  /** The "why did we miss it" lines on a failed shift report, biggest loss first. */
  function explainShortfall(s, b) {
    return leakLines(s, b).slice(0, 3).map(({ icon, text }) => ({ icon, text }));
  }

  /** One line for the top of every shift report: the main thing that went wrong (or, on a good day, what still leaked) and how to fix it. */
  function shiftHeadline(s, b, goalMet) {
    const top = leakLines(s, b)[0];
    if (top) return { kind: goalMet ? 'win' : 'fail', icon: top.icon, text: top.head, tip: top.tip };
    return goalMet
      ? { kind: 'win', icon: '🌟', text: 'Hari yang bersih — tiada kebocoran besar.', tip: 'Beli perk baru untuk sasaran yang makin tinggi.' }
      : { kind: 'fail', icon: '📉', text: 'Kedai kurang ramai hari ini.', tip: 'Tiada kesilapan besar. Poster Promosi atau lebih banyak PC menarik dan melayan lebih ramai pelanggan.' };
  }

  /**
   * "Sorotan hari": a handful of fun facts about the shift that just ended, most interesting first (at most 5).
   * Pure read of s.shiftStats, so it can be rebuilt for any report.
   */
  function buildRecap(s) {
    const st = s.shiftStats;
    const who = (id) => byId(ns.TYPES, id) || { name: 'Pelanggan', emoji: '🙂' };
    const top = (counts) => Object.entries(counts || {}).sort((a, b) => b[1] - a[1])[0];
    const items = [];

    for (const m of st.tierMoves || []) {
      const t = byId(TIERS, m.id);
      items.push(m.up ? { icon: t.emoji, title: `Naik taraf: ${t.name}`, text: t.perks } : { icon: '📉', title: `Taraf turun: ${t.name}`, text: 'Reputasi jatuh. Layan pelanggan dengan baik untuk naik semula.' });
    }
    if (st.generatorRuns > 0) items.push({ icon: '🔌', title: 'Generator selamatkan hari', text: `Hidup ${st.generatorRuns}× — blackout cuma ${CFG.GENERATOR.outage} saat setiap kali.` });
    else if (st.blackoutSec > 3) items.push({ icon: '⚡', title: 'Gelap-gelita', text: `${Math.round(st.blackoutSec)} saat tanpa elektrik. Generator boleh elak ini.` });

    const total = (st.hourly || []).reduce((a, v) => a + v, 0);
    if (total > 0) {
      const best = st.hourly.indexOf(Math.max(...st.hourly));
      items.push({ icon: '🕐', title: 'Waktu paling untung', text: `${clock(CFG.DAY_START_MINUTES + best * 60)} – ${clock(CFG.DAY_START_MINUTES + (best + 1) * 60)}: ${fmtMoney(st.hourly[best])} masuk dalam sejam itu.` });
    }
    if (st.closeCall) items.push({ icon: '😅', title: 'Hampir terlepas!', text: `${who(st.closeCall.type).name} dilayan bila kesabaran tinggal ${Math.max(1, Math.round(st.closeCall.left * 100))}%.` });
    const angry = top(st.walkByType);
    if (angry) items.push({ icon: '😤', title: `${who(angry[0]).name} paling cepat marah`, text: `${angry[1]} orang keluar dengan muka masam.` });
    const [worstPc, worstN] = top(st.pcFaults) || [];
    if (worstN >= 2) items.push({ icon: '🔧', title: `PC ${worstPc} paling manja`, text: `Rosak ${worstN} kali hari ini.` });
    if (st.bestSale) items.push({ icon: '💰', title: 'Sewa terbesar', text: `${fmtMoney(st.bestSale.price)} daripada ${who(st.bestSale.type).name} (${st.bestSale.minutes} minit).` });
    if (st.tips > 0) items.push({ icon: '☕', title: 'Duit kopi', text: `${fmtMoney(st.tips)} daripada pelanggan yang puas hati.` });
    const asst = s.assistant;
    if (asst?.mc) items.push({ icon: '🤒', title: `${CFG.ASSISTANT.name} MC`, text: `${asst.mc.reason}. Abang buat semua sendiri hari ini.` });
    else if (asst && st.assistantJobs > 0) items.push({ icon: '🎀', title: `${CFG.ASSISTANT.name} berguna`, text: `${st.assistantJobs} kerja siap tanpa Abang angkat tangan.` });
    if (s.bestCombo >= 3) items.push({ icon: '⚡', title: 'Combo terbaik', text: `x${s.bestCombo} berturut-turut.` });
    const loyal = top(st.servedByType);
    if (loyal && loyal[1] >= 2) items.push({ icon: '🤝', title: `${who(loyal[0]).name} paling ramai`, text: `${loyal[1]} kali duduk PC hari ini.` });
    return items.slice(0, 5);
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
      if (bills.assistant) S.record(s, 'wage', -bills.assistant, 'Gaji pembantu (bulanan)');
      S.log(s, `🧾 Hujung bulan: sewa & bil ${fmtMoney(bills.total)} dibayar.`);
    }
    const upkeep = S.perkUpkeep(s);
    if (upkeep) S.record(s, 'upkeep', -upkeep, 'Penyelenggaraan perk');
    const paid = S.breakdown(s);
    const expense = paid.expenses; // belanja: everything actually spent this shift

    // risk drifts with how the shop was run
    S.bump(s, 'risk', s.violationLog.length * 4 - (s.violationLog.length === 0 && s.compliance >= 70 ? 3 : 0) - (s.professionalism >= 70 ? 2 : 0) + S.tierOf(s).riskDrift); // Port Lepak draws the officer's eye

    // Reputation settles once a day. The score has been moving all shift; now a day that met the target pays a bonus on what it gained
    // (CFG.REP_STAR_BOOST per star), and only then may the tier move, one step at most. During the shift the tier never changed.
    const stars = !goalMet ? 1 : income >= goal * 1.4 && s.rep >= 55 ? 3 : 2; // 1 = goal missed, 2 = goal met, 3 = goal beaten by 40% with a healthy reputation
    const repStart = s.repAtStart ?? s.rep;
    const repGain = s.rep - repStart;
    const starBonus = goalMet && repGain > 0 ? Math.round(repGain * CFG.REP_STAR_BOOST * stars) : 0;
    if (starBonus) S.bump(s, 'rep', starBonus);
    const tierBefore = s.repTier;
    S.settleTier(s, goalMet);
    const nextTier = TIERS[S.tierIndex(s) + 1] || null;

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
      headline: shiftHeadline(s, b, goalMet),
      endingCash: s.cash,
      combo: s.bestCombo,
      heroSaved: s.heroSaved,
      served: s.shiftStats.served,
      incidents: s.shiftStats.incidents,
      repairs: s.shiftStats.repairs,
      inspections: s.shiftStats.inspections,
      rep: s.rep,
      repStart,
      starBonus, // reputation points the stars added on top of the day's own gain
      tierBefore,
      tierStreak: s.tierStreak || 0, // days in a row at the next tier's mark, counting today
      tierDays: nextTier ? nextTier.days : 0, // days in a row that tier asks for
      professionalism: s.professionalism,
      compliance: s.compliance,
      violations: s.violationLog.length,
      specialEvents: s.specialHandled || 0,
      tier: s.repTier,
      recap: buildRecap(s),
      stars,
    };
    report.unlocked = goalMet && ns.Meta ? ns.Meta.recordDay(s.day, report.stars).map((h) => h.id) : []; // cosmetic hats kept across runs
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
    State.rollSickLeave(s);
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
    State.updateAssistant(s, dt);
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

  Object.assign(State, { create, startShift, endShift, proceed, retryDay, update, peakLabel, snapshotDay, buildRecap });
})(window.ABCC);
