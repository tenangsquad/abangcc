/* ==========================================================================
   2f. PCs — faults, repairs, billing clock, wear
   --------------------------------------------------------------------------
   Fault kinds (see FAULTS in config): glitch, freeze, overheat, bsod, noconn, hardware.
   Restart rule: restarting a PC under an active customer refunds 25 % of what that
   customer paid. The refund is booked with a per-incident key, so one incident can
   never refund twice (not by a double click, not by the auto-restart racing Abang).
   ========================================================================== */
(function (ns) {
  'use strict';

  const { CFG, ROOM, FAULTS, GAMES, byId, clamp, fmtMoney } = ns;
  const S = ns.S;
  const State = (ns.State = ns.State || {});

  function makePc(index) {
    const slot = ROOM.pcSlot(index);
    return {
      id: index + 1,
      x: slot.x,
      y: slot.y,
      tier: index >= 8 ? 2 : 1,
      health: CFG.PC_HEALTH[index] ?? 100,
      status: 'free', // free | reserved | busy | fault | job
      fault: null, // null | one of FAULTS
      faultId: 0, // bumps whenever a new fault starts — the "incident" refunds are keyed on
      faultAge: 0,
      customerId: null,
      occupiedSeconds: 0,
      rentalSeconds: 0,
      charged: 0,
      job: null,
      issue: null, // null | suspicious | loudvideo | fight | restricted | nomouse
      screenAngle: 0,
      sessionGame: null,
      lingerTime: 0,
    };
  }

  /** Add the next PC (perk purchase). */
  function addPc(s) {
    const index = s.pcs.length;
    const pc = makePc(index);
    pc.health = 100;
    s.pcs.push(pc);
    return pc;
  }

  /** Which kind of fault hits this PC, given its health, cooling and the network. */
  function pickFaultKind(s, p) {
    const online = !!byId(GAMES, p.sessionGame)?.online;
    const cool = S.coolLevel(s);
    const overloaded = S.bandwidth(s) > S.capBandwidth(s);
    const kinds = [
      ['glitch', 3],
      ['freeze', 2],
      ['bsod', 1.2 + clamp((60 - p.health) / 40, 0, 1.5)],
      ['overheat', cool >= 3 ? 0.1 : (0.8 + clamp((75 - p.health) / 20, 0, 2.2)) * S.overheatMult(s)],
      ['noconn', online ? 1.4 + (overloaded ? 2.2 : 0) : 0],
      ['hardware', p.health < 45 ? (45 - p.health) / 8 : 0],
    ];
    if (p.health < 22) return 'hardware';
    return S.weighted(s, kinds, (k) => k[1])[0];
  }

  /** A PC develops a fault. Starts a new incident (new `faultId`). */
  function breakPc(s, p, message, { onSeat = false, kind = null } = {}) {
    kind = kind || pickFaultKind(s, p);
    p.fault = kind;
    p.status = 'fault';
    p.faultAge = 0;
    p.faultId = (p.faultId || 0) + 1;
    p.autoDone = false;
    s.shiftStats.complaints++;
    s.shiftStats.pcFaults[p.id] = (s.shiftStats.pcFaults[p.id] || 0) + 1;
    if (!onSeat) {
      s.shiftStats.incidents++;
      s.incidentCount++;
    }
    const F = FAULTS[kind];
    S.log(s, message ? message(p) : onSeat ? `BANG! PC ${p.id} ${F.short} masa baru nak main!` : `${F.icon} PC ${p.id}: ${F.label}!`);
    S.emit('fault', { pcId: p.id, kind });
  }

  /**
   * The crash refund rule. Whenever a crash ends a paying customer's session (restart, auto-restart, repair,
   * overheat, BSOD / no-internet walk-out) they get back exactly 25 % of what they paid — never more, never less,
   * and only once per incident (keyed on the PC's `faultId`). It is booked as a refund, so cash, net sales and
   * the target progress all drop by the same amount. Book the refund and send the customer home.
   */
  function restartRefund(s, p, message) {
    const c = byId(s.customers, p.customerId);
    if (!c) return 0;
    const fee = Math.round((p.charged || 0) / 4);
    let booked = 0;
    if (fee > 0 && S.recordOnce(s, `refund:pc${p.id}:f${p.faultId}`, 'restart_penalty', -fee, `Refund 25% PC ${p.id}`)) booked = fee;
    State.releaseCustomer(s, c, message, 0);
    return booked;
  }

  /** Apply an Abang fix to a PC. Returns a message, or null if it can't be done. */
  function applyFix(s, p, kind) {
    switch (kind) {
      case 'restart': {
        if (!p.fault || p.fault === 'hardware' || p.fault === 'noconn') return null;
        const had = !!p.customerId;
        const fee = restartRefund(s, p, `↻ Restart PC ${p.id}: refund 25% pelanggan.`);
        p.fault = null;
        p.status = 'job';
        p.job = { type: 'restart', remaining: 3, total: 3 };
        S.log(s, `Restart PC ${p.id}… 3 saat.${had ? ` Refund ${fmtMoney(fee)}.` : ''}`);
        return 'Restart bermula.';
      }
      case 'cool': {
        if (p.fault !== 'overheat') return null;
        p.fault = null;
        p.status = 'job';
        p.job = { type: 'cool', remaining: 4, total: 4 };
        S.log(s, `❄️ PC ${p.id} disejukkan… pelanggan boleh sambung selepas ini.`);
        return 'PC sedang disejukkan.';
      }
      case 'reset': {
        if (p.fault !== 'noconn') return null;
        p.fault = null;
        p.status = 'job';
        p.job = { type: 'reset', remaining: 2, total: 2 };
        S.log(s, `📡 Sambungan PC ${p.id} di-reset.`);
        return 'Sambungan di-reset.';
      }
      case 'repair': {
        if (p.status === 'job') return null;
        const cost = repairCost(s);
        if (s.cash < cost) {
          S.log(s, 'Duit tak cukup nak repair!');
          return null;
        }
        restartRefund(s, p, `PC ${p.id} perlu repair — pelanggan dapat refund 25%.`);
        S.record(s, 'repair', -cost, `Repair PC ${p.id}`);
        p.fault = null;
        p.status = 'job';
        const duration = repairTime(s);
        p.job = { type: 'repair', remaining: duration, total: duration };
        s.shiftStats.repairs++;
        S.log(s, `Repair PC ${p.id} bermula (${fmtMoney(cost)}).`);
        return 'Repair bermula.';
      }
    }
    return null;
  }
  const repairCost = (s) => Math.round(2000 * (1 + S.mod(s, 'repairCost')));
  const repairTime = (s) => 15 * (1 + S.mod(s, 'repairTime'));

  /** What happens when a fault is left alone for too long (FAULTS[kind].autoEnds). */
  function faultTimeout(s, p) {
    const F = FAULTS[p.fault];
    const c = byId(s.customers, p.customerId);
    switch (F.autoEnds) {
      case 'restart': // software crash: the machine reboots itself — at the customer's expense
        restartRefund(s, p, `↻ PC ${p.id} auto-restart. Refund 25%.`);
        p.fault = null;
        p.faultAge = 0;
        p.status = 'free';
        p.health = clamp(p.health - 1, 0, 100);
        S.log(s, `↻ PC ${p.id} berjaya auto-restart. Sedia untuk rental lagi.`);
        break;
      case 'thaw': // frozen screen: wakes up on its own, session carries on
        p.fault = null;
        p.faultAge = 0;
        p.status = c ? 'busy' : 'free';
        S.log(s, `🥶 PC ${p.id} pulih sendiri. Sambung main.`);
        break;
      case 'burn': // overheating: the box cooks itself
        p.fault = 'hardware';
        p.faultAge = 0;
        p.health = clamp(p.health - 18, 0, 100);
        restartRefund(s, p, `🔥 PC ${p.id} terlalu panas dan mati! Pelanggan balik, refund 25%.`);
        S.bump(s, 'rep', -2);
        break;
      case 'quit': // BSOD / no internet: the customer gives up, the PC still needs fixing
        if (c) {
          restartRefund(s, p, `${c.name} marah dan keluar — PC ${p.id} ${F.short}. Refund 25%.`);
          S.bump(s, 'rep', -3);
          s.shiftStats.walkouts++;
          S.noteWalkout(s, c, 'fault');
        }
        p.autoDone = true;
        break;
    }
  }

  /** Per-frame PC simulation. */
  function updatePcs(s, dt) {
    const online = S.bandwidth(s) > S.capBandwidth(s);
    for (const p of s.pcs) {
      // faults age; each kind sorts itself out (or gets worse) after FAULTS[kind].auto seconds
      if (p.fault && p.status === 'fault') {
        const F = FAULTS[p.fault];
        p.faultAge = (p.faultAge || 0) + dt;
        if (F.auto && !p.autoDone && p.faultAge >= F.auto) faultTimeout(s, p);
      } else p.faultAge = 0;

      if (p.status === 'job' && p.job) {
        p.job.remaining -= dt;
        if (p.job.remaining <= 0) {
          const job = p.job;
          p.job = null;
          p.status = p.customerId && (job.type === 'cool' || job.type === 'reset') ? 'busy' : 'free';
          if (job.type === 'repair') p.health = clamp(p.health + 35, 0, 100);
          p.fault = null;
          S.log(s, `PC ${p.id}: ${job.type} selesai!`);
          S.emit('fixed', { pcId: p.id });
        }
      }

      if (p.status === 'busy') {
        const c = byId(s.customers, p.customerId);
        if (p.lingerTime > 0) {
          // night owl: session is over but they are still glued to the seat
          p.lingerTime -= dt;
          if (c) c.lingerTime = p.lingerTime;
          if (p.lingerTime <= 0) finishSession(s, p, c);
          continue;
        }
        if (!p.issue && s.powerOutage <= 0) p.occupiedSeconds -= dt;

        const laggy = (online && byId(GAMES, p.sessionGame)?.online) || s.networkRush > 0;
        if (laggy && c) {
          c.patience -= dt * 2;
          if (c.patience <= 0) {
            State.releaseCustomer(s, c, `PING MERAH! Customer PC ${p.id} rage quit sebab internet lag.`, 0.5);
            S.bump(s, 'rep', -3);
            s.shiftStats.complaints++;
            s.shiftStats.walkouts++;
            S.noteWalkout(s, c, 'lag');
            continue;
          }
        }

        if (p.occupiedSeconds <= 0) {
          const type = c && ns.byId(ns.TYPES, c.type);
          if (type?.trait === 'linger' && !c.lingered && !p.issue) {
            c.lingered = true;
            p.lingerTime = 7;
            c.lingerTime = 7;
            S.log(s, `🌙 ${c.name} masih lepak di PC ${p.id}. Tawarkan sambung atau suruh balik.`);
          } else finishSession(s, p, c);
        }
      }
    }
  }

  /** Normal end of a session: customer leaves, the PC wears a little. */
  function finishSession(s, p, c) {
    const played = p.rentalSeconds;
    State.releaseCustomer(s, c, `PC ${p.id}: masa sewaan tamat.`, 0);
    const wearNoAir = 0.23 * Math.max(0, 1 + S.mod(s, 'wear'));
    p.health = clamp(p.health - (0.5 + 0.4 * (played / 60) + wearNoAir), 0, 100);
    p.lingerTime = 0;
    if (p.health <= 0) {
      p.fault = 'hardware';
      p.status = 'fault';
      p.faultId = (p.faultId || 0) + 1;
      S.emit('fault', { pcId: p.id, kind: 'hardware' });
    }
  }

  /** Lepak customer: sell another half hour on the spot, or send them home. */
  function lingerChoice(s, pcId, choice) {
    const p = byId(s.pcs, pcId);
    const c = p && byId(s.customers, p.customerId);
    if (!p || !c || !(p.lingerTime > 0)) return S.fail('Tiada pelanggan lepak di PC ini.');
    if (choice === 'extend') {
      const minutes = 30;
      const price = S.priceFor(minutes, p, c.game);
      S.record(s, 'rental', price, `Sambung PC ${p.id}`);
      p.charged += price;
      p.occupiedSeconds = ns.sessionSecondsFor(minutes);
      p.rentalSeconds = p.occupiedSeconds;
      p.lingerTime = 0;
      c.lingerTime = 0;
      c.lingered = true;
      S.log(s, `🌙 ${c.name} sambung 30 minit (+${fmtMoney(price)}).`);
      S.emit('rental', { pcId: p.id, amount: price });
      return S.ok('Sambung 30 minit!');
    }
    finishSession(s, p, c);
    return S.ok('Pelanggan dihantar balik.');
  }

  Object.assign(S, { makePc, pickFaultKind, repairCost, repairTime });
  Object.assign(State, { addPc, breakPc, applyFix, updatePcs, lingerChoice, restartRefund, repairCost, repairTime });
})(window.ABCC);
