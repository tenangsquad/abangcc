/* ==========================================================================
   2g. INCIDENTS — trouble that sits on a PC (suspicious, loud video, fight, restricted, missing mouse)
   --------------------------------------------------------------------------
   The player taps the PC, Abang's Desk offers the options, Abang walks over and
   the outcome lands when he arrives. Guilt is decided when the incident starts
   and is NEVER shown before the player commits (CCTV only gives an imperfect hint).
   ========================================================================== */
(function (ns) {
  'use strict';

  const { ISSUES, ROOM, TYPES, byId, fmtMoney } = ns;
  const S = ns.S;
  const State = (ns.State = ns.State || {});

  /** Soft = gentle and safe, harsh = bold and risky. Outcome table lives in resolveIssue(). */
  const ISSUE_ACTIONS = {
    suspicious: ['soft', 'harsh'],
    loudvideo: ['warn', 'ignore'],
    fight: ['calm', 'eject'],
    restricted: ['close', 'eject'],
    nomouse: ['search', 'replace'],
  };

  const eventOf = (s, pcId) => (s.activeIssues || []).find((e) => e.pcId === pcId || e.partnerPcId === pcId);
  const biasOf = (c, type) => byId(TYPES, c.type)?.bias?.[type] ?? 1;

  /** Pick the busy PC an incident of this type lands on, weighted by who is sitting there. */
  function pickTarget(s, type, candidates) {
    return S.weighted(s, candidates, (p) => biasOf(byId(s.customers, p.customerId) || {}, type));
  }

  /** Two seated customers who can plausibly start a fight: same row, closest first. */
  function fightPartner(s, p) {
    const others = s.pcs.filter((q) => q !== p && q.status === 'busy' && !q.issue && q.customerId);
    if (!others.length) return null;
    others.sort((a, b) => (a.y === p.y ? 0 : 1) - (b.y === p.y ? 0 : 1) || Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    return others[0];
  }

  function makeIncident(s, type, p, forcedGuilty = null) {
    if (!p || p.issue || p.status !== 'busy') return false;
    const def = ISSUES[type];
    const c = byId(s.customers, p.customerId);
    const ev = { type, pcId: p.id, time: def.time, total: def.time };
    let partner = null;

    if (type === 'fight') {
      partner = fightPartner(s, p);
      if (!partner) return false;
      ev.partnerPcId = partner.id;
    }
    if (type === 'suspicious') {
      ev.time += S.mod(s, 'suspiciousTime');
      ev.total = ev.time;
      const guiltyChance = Math.max(0.05, 0.58 + S.mod(s, 'guilty'));
      ev.guilty = forcedGuilty === null ? S.chance(s, guiltyChance) : !!forcedGuilty;
      if (S.mod(s, 'cctvHint')) ev.cctvHint = ev.guilty ? S.chance(s, 0.75) : S.chance(s, 0.2); // imperfect on purpose
      p.screenAngle = 1;
      S.log(s, `👀 PC ${p.id} tiba-tiba PUSING MONITOR! Nampak suspicious… tapi belum pasti.`);
    } else if (type === 'loudvideo') {
      S.log(s, `🔊 PC ${p.id} pasang VIDEO KUAT GILA! Pelanggan lain dah pandang.`);
    } else if (type === 'fight') {
      S.log(s, `💢 PC ${p.id} dan PC ${partner.id} mula bertekak!`);
    } else if (type === 'restricted') {
      ev.guilty = true;
      S.log(s, `🔞 PC ${p.id}: ada pelanggaran kandungan.`);
    } else if (type === 'nomouse') {
      ev.searched = false;
      S.log(s, `🖱️ Mouse PC ${p.id} lesap! Pelanggan tak boleh guna.`);
    }

    p.issue = type;
    if (c) c.issue = type;
    if (partner) {
      partner.issue = 'fight';
      const c2 = byId(s.customers, partner.customerId);
      if (c2) c2.issue = 'fight';
      stagePair(s, p, partner);
    }
    s.activeIssues = s.activeIssues || [];
    s.activeIssues.push(ev);
    s.incidentCount++;
    s.shiftStats.incidents++;
    S.emit('incident', { pcId: p.id, type });
    return true;
  }

  /** Two arguing customers stand up and walk out to meet in the aisle. */
  function stagePair(s, a, b) {
    const ca = byId(s.customers, a.customerId), cb = byId(s.customers, b.customerId);
    if (!ca || !cb) return;
    const aisleY = Math.abs(a.y - ROOM.aisleBack) < Math.abs(a.y - ROOM.aisleFront) ? ROOM.aisleBack : ROOM.aisleFront;
    const mx = (a.x + b.x) / 2;
    const left = a.x <= b.x ? [ca, cb] : [cb, ca];
    left[0].destination = { x: mx - 0.42, y: aisleY };
    left[1].destination = { x: mx + 0.42, y: aisleY };
    ca.argueWith = cb.id;
    cb.argueWith = ca.id;
    ca.status = cb.status = 'arguing';
  }

  /** After a fight is settled the pair return to their seats (or one of them leaves). */
  function unstagePair(s, ev, stayers) {
    for (const pcId of [ev.pcId, ev.partnerPcId]) {
      const p = byId(s.pcs, pcId);
      const c = p && byId(s.customers, p.customerId);
      if (!p || !c) continue;
      c.argueWith = null;
      c.issue = null;
      if (stayers.includes(c.id)) {
        c.status = 'walkToPc';
        c.destination = ROOM.seatFor(p);
      }
      p.issue = null;
    }
  }

  /** Bookkeeping when a time-limited crisis is dealt with in time: combo + clutch bonus. */
  function registerCrisisSolved(s, ev) {
    const timeLeft = ev?.time ?? 0;
    if (timeLeft > 0) {
      s.combo++;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      s.heroSaved++;
      if (timeLeft >= 7) {
        S.record(s, 'hero', 300, 'Bonus tindakan pantas');
        S.log(s, `⚡ CLUTCH SAVE! +RM3, COMBO x${s.combo}`);
        S.emit('clutch', { pcId: ev.pcId, combo: s.combo });
      }
    }
  }

  const dropEvent = (s, ev) => {
    s.activeIssues = (s.activeIssues || []).filter((x) => x !== ev);
  };

  /** Which choices Abang's Desk offers for a PC issue (with costs/disabled flags). */
  function issueOptions(s, p) {
    const ev = eventOf(s, p.id);
    if (!ev) return [];
    const O = (act, label, sub, extra = {}) => ({ act, label, sub, ...extra });
    switch (ev.type) {
      case 'suspicious':
        return [
          O('soft', '🙂 Tegur baik-baik', 'Selamat · amaran sahaja', { css: 'mint' }),
          O('harsh', '😠 Tuduh & halau', 'Berani · silap = refund 50%', { css: 'coral' }),
        ];
      case 'loudvideo':
        return [
          O('warn', '🔉 Minta perlahankan', 'Abang pergi tegur', { css: 'mint' }),
          O('ignore', '🙉 Biarkan seketika', 'Masih ada masa… tapi risiko', { disabled: !!ev.ignored }),
        ];
      case 'fight':
        return [
          O('calm', '🤝 Leraikan', 'Mereka sambung main', { css: 'mint' }),
          O('eject', '🚪 Halau pencetus', 'Pencetus dihalau, refund baki', { css: 'coral' }),
        ];
      case 'restricted':
        return [
          O('close', '🛡️ Tutup laman', 'Amaran sahaja', { css: 'mint' }),
          O('eject', '🚪 Halau pelanggan', 'Terus keluar, tiada refund', { css: 'coral' }),
        ];
      case 'nomouse':
        return [
          O('search', '🔍 Cari mouse', ev.searched ? 'Dah cari — tak jumpa' : 'Percuma · 68% jumpa', { css: 'mint', disabled: !!ev.searched }),
          O('replace', '🛒 Beli mouse baru', 'RM5 · terus selesai', { css: 'sky', disabled: s.cash < 500, cost: 500 }),
        ];
    }
    return [];
  }

  /** The outcome of a chosen action on a PC issue. Called when Abang arrives (or at once for 'ignore'). */
  function resolveIssue(s, p, action) {
    const ev = eventOf(s, p.id);
    if (!ev) return S.fail('Masalah dah selesai.');
    const c = byId(s.customers, p.customerId);
    const guilty = !!ev.guilty;
    const done = () => {
      p.issue = null;
      p.screenAngle = 0;
      if (c) c.issue = null;
      dropEvent(s, ev);
    };

    switch (ev.type) {
      case 'suspicious': {
        if (guilty) {
          registerCrisisSolved(s, ev);
          if (action === 'soft') {
            done();
            S.bump(s, 'compliance', 2);
            S.bump(s, 'risk', -3);
            S.bump(s, 'professionalism', 2);
            S.log(s, `🛡️ PC ${p.id}: dia terbukti buka laman tak sesuai. Diberi amaran dan menutupnya.`);
            return S.ok('BETUL! Amaran diberi. Kedai kembali selamat.');
          }
          const name = c?.name;
          done();
          if (c) State.releaseCustomer(s, c, `🚪 ${name} dihalau dari PC ${p.id} kerana laman tak sesuai.`, 0);
          S.bump(s, 'compliance', 4);
          S.bump(s, 'risk', -6);
          S.bump(s, 'professionalism', 1);
          S.bump(s, 'rep', 1);
          return S.ok('BETUL! Pelanggan dihalau. Kedai lebih patuh.');
        }
        // innocent: a false accusation — single penalty, customer upset and leaves
        const harsh = action === 'harsh';
        const refund = Math.round((p.charged || 0) * (harsh ? 0.5 : 0.25));
        const name = c?.name;
        done();
        if (c) {
          if (refund > 0) S.recordOnce(s, `accuse:${c.id}`, 'accusation_refund', -refund, 'Refund salah tuduh');
          State.releaseCustomer(s, c, `😡 ${name} keluar kerana salah tuduh!`, 0);
        }
        S.bump(s, 'rep', harsh ? -7 : -2);
        S.bump(s, 'professionalism', harsh ? -9 : -3);
        s.shiftStats.complaints++;
        s.shiftStats.falseAccusations++;
        s.combo = 0;
        S.log(s, `❌ FALSE ALARM pada PC ${p.id}! ${harsh ? 'Dia marah besar' : 'Dia tersinggung'} — refund ${fmtMoney(refund)}. Reputasi ${harsh ? -7 : -2}, Professionalism ${harsh ? -9 : -3}.`);
        return S.fail('SALAH TUDUH! Pelanggan keluar & revenue dipotong.');
      }
      case 'loudvideo': {
        if (action === 'ignore') {
          ev.ignored = true;
          ev.time = Math.min(ev.time, 7);
          S.log(s, `🙉 PC ${p.id}: video masih kuat. Kalau terus dibiarkan, pelanggan lain akan merungut.`);
          return S.ok('Dibiarkan buat masa ni — complaint mungkin naik.');
        }
        registerCrisisSolved(s, ev);
        done();
        S.bump(s, 'rep', 2);
        S.bump(s, 'professionalism', 2);
        S.log(s, `🔉 PC ${p.id} perlahan video. Customer lain boleh fokus balik. PROF +2.`);
        return S.ok('Volume video telah diperlahankan.');
      }
      case 'fight': {
        // the instigator is whoever sits at the PC the fight started on; the other is the second PC's customer
        const a = byId(s.customers, byId(s.pcs, ev.pcId)?.customerId);
        const b = byId(s.customers, byId(s.pcs, ev.partnerPcId)?.customerId);
        const ids = [a?.id, b?.id].filter(Boolean);
        registerCrisisSolved(s, ev);
        dropEvent(s, ev);
        if (action === 'calm') {
          unstagePair(s, ev, ids);
          S.bump(s, 'risk', -3);
          S.bump(s, 'rep', 2);
          S.bump(s, 'professionalism', 1);
          S.log(s, `🤝 Abang berjaya tenangkan PC ${ev.pcId} & PC ${ev.partnerPcId}. "JANGAN GADUH!"`);
          return S.ok('Pergaduhan dilerai!');
        }
        const out = a; // the one who started it (customer at the first PC)
        unstagePair(s, ev, ids.filter((id) => id !== out?.id));
        if (out) State.releaseCustomer(s, out, `🚪 ${out.name} dihalau kerana bergaduh.`, 1);
        S.bump(s, 'risk', -5);
        S.bump(s, 'rep', 1);
        return S.ok('Pencetus dihalau.');
      }
      case 'restricted': {
        registerCrisisSolved(s, ev);
        if (action === 'close') {
          done();
          S.bump(s, 'risk', -5);
          S.bump(s, 'compliance', 2);
          S.bump(s, 'professionalism', 2);
          S.log(s, `🛡️ PC ${p.id}: laman terlarang ditutup. Kedai kembali selamat.`);
          return S.ok('Laman ditutup.');
        }
        const name = c?.name;
        done();
        if (c) State.releaseCustomer(s, c, `🚪 ${name} dihalau dari PC ${p.id}.`, 0);
        S.bump(s, 'risk', -5);
        S.bump(s, 'compliance', 3);
        return S.ok('Pelanggan dihalau.');
      }
      case 'nomouse': {
        if (action === 'search') {
          if (ev.searched) return S.fail('Dah cari tadi — tak jumpa.');
          if (S.chance(s, 0.68)) {
            registerCrisisSolved(s, ev);
            done();
            S.bump(s, 'rep', 3);
            S.log(s, `🖱️ Mouse PC ${p.id} jumpa di bawah kerusi! Customer rasa lega.`);
            return S.ok('Mouse dijumpai!');
          }
          ev.searched = true;
          S.log(s, `🔍 Tak jumpa mouse PC ${p.id}. Perlu beli yang baru.`);
          return S.fail('Tak jumpa. Beli mouse baru.');
        }
        if (s.cash < 500) return S.fail('Duit tak cukup.');
        registerCrisisSolved(s, ev);
        done();
        S.record(s, 'mouse', -500, 'Mouse baharu');
        S.bump(s, 'rep', 2);
        S.log(s, `🛒 Mouse baharu dipasang di PC ${p.id}, customer sambung main.`);
        return S.ok('Mouse baharu dipasang.');
      }
    }
    return S.fail('Tindakan tak sah.');
  }

  /** Time out unresolved incidents and apply their penalties. */
  function expireIssues(s, dt) {
    if (!s.activeIssues) s.activeIssues = [];
    for (const ev of [...s.activeIssues]) {
      ev.time -= dt;
      const pc = byId(s.pcs, ev.pcId);
      if (!pc || !pc.issue) {
        dropEvent(s, ev);
        continue;
      }
      if (ev.time > 0) continue;

      dropEvent(s, ev);
      const c = byId(s.customers, pc.customerId);
      const violation = ev.type === 'restricted' || (ev.type === 'suspicious' && ev.guilty);
      if (ev.type === 'fight') {
        S.bump(s, 'rep', -7);
        S.bump(s, 'risk', 12);
        s.violationLog.push('Pergaduhan tidak dikawal');
        S.log(s, `PC ${pc.id}: pergaduhan tak dikawal! REPUTASI -7.`);
        const partner = byId(s.pcs, ev.partnerPcId);
        const c2 = partner && byId(s.customers, partner.customerId);
        if (partner) partner.issue = null;
        if (c2) {
          c2.issue = null;
          c2.argueWith = null;
          State.releaseCustomer(s, c2, null, 0.5);
        }
      } else if (ev.type === 'loudvideo') {
        S.bump(s, 'rep', -5);
        S.bump(s, 'professionalism', -3);
        s.shiftStats.complaints++;
        S.log(s, `🔊 PC ${pc.id} terlalu bising! Pelanggan komplen. REP -5 / PROF -3.`);
      } else if (ev.type === 'nomouse') {
        S.bump(s, 'rep', -3);
        s.shiftStats.complaints++;
        S.log(s, `🖱️ Pelanggan PC ${pc.id} bosan tunggu mouse dan balik. Refund 50%.`);
      } else if (violation) {
        S.bump(s, 'compliance', -9);
        S.bump(s, 'risk', 15);
        s.violationLog.push('Kandungan tidak dibenarkan');
        S.log(s, `PC ${pc.id}: pelanggaran kandungan tidak dikesan. Risk +15.`);
      } else {
        S.log(s, `PC ${pc.id}: gerak-geri pelik tadi rupanya false alarm. Bagus kau tak tuduh sembarangan.`);
      }
      s.combo = 0;
      pc.issue = null;
      pc.screenAngle = 0;
      if (c) c.issue = null;
      if (c && (ev.type === 'fight' || ev.type === 'nomouse' || violation)) State.releaseCustomer(s, c, null, 0.5);
    }
  }

  /** Random background trouble, tuned by the director. */
  function triggerTrouble(s) {
    const busy = s.pcs.filter((p) => p.status === 'busy' && !p.issue);
    const faultable = s.pcs.filter((p) => p.status === 'busy' && !p.fault);
    if (!busy.length) return;

    const diff = S.pressure(s);
    const pool = [];
    if (faultable.length) pool.push('fault', 'fault', 'fault');
    pool.push('loudvideo', 'loudvideo', 'suspicious', 'suspicious', 'nomouse');
    if (busy.length >= 2) pool.push('fight');
    if (diff > 1.8) pool.push('fault', 'loudvideo');
    if (diff > 2.2) pool.push('suspicious', 'fight');
    if (S.bandwidth(s) > S.capBandwidth(s)) pool.push('lag', 'lag');
    if (S.hasPerk(s, 'printer')) pool.push('printer');
    if (S.hasPerk(s, 'snack') && S.chance(s, 0.25)) pool.push('mess');
    if ((s.day >= 2 || s.elapsed > 60) && !(s.worldEvents || []).some((e) => e.type === 'spill')) pool.push('spill');

    let chosen = S.choice(s, pool);
    if (s.eventTypes.includes(chosen) && S.chance(s, 0.5)) chosen = 'fault';
    if (chosen === 'fault' && faultable.length && s.pcs.filter((q) => q.status === 'fault').length >= 2) chosen = 'loudvideo';

    if (chosen === 'fault' && faultable.length) {
      State.breakPc(s, S.choice(s, faultable));
    } else if (chosen === 'fight' || chosen === 'suspicious' || chosen === 'loudvideo' || chosen === 'nomouse') {
      const target = pickTarget(s, chosen, busy);
      if (!target || !makeIncident(s, chosen, target)) return;
    } else if (chosen === 'spill') {
      if (!State.startEvent(s, 'spill')) return;
    } else if (chosen === 'lag') {
      S.log(s, 'PING 999! Internet jammed sebab terlalu banyak aktiviti serentak.');
      S.bump(s, 'rep', -2);
      s.shiftStats.complaints++;
      s.incidentCount++;
    } else if (chosen === 'printer') {
      S.log(s, 'PRINTER JAM! Customer assignment mula panik.');
      S.bump(s, 'rep', -1);
      s.incidentCount++;
    } else if (chosen === 'mess') {
      S.record(s, 'snack_loss', -60, 'Snack hilang / kedai sepah');
      S.bump(s, 'rep', -1);
      S.log(s, '🥤 Ada snack hilang dan lantai jadi sepah. REP -1.');
      s.incidentCount++;
    }
    s.eventTypes.push(chosen);
  }

  Object.assign(S, { eventOf, makeIncident, issueOptions, resolveIssue, registerCrisisSolved });
  Object.assign(State, { makeIncident, issueOptions, resolveIssue, expireIssues, triggerTrouble, ISSUE_ACTIONS });
})(window.ABCC);
