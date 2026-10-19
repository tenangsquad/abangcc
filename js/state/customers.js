/* ==========================================================================
   2e. CUSTOMERS & RENTALS — arrivals, queue, assignment, billing, patience
   ========================================================================== */
(function (ns) {
  'use strict';

  const { CFG, RENTAL, ROOM, TYPES, byId, clamp, fmtMoney } = ns;
  const S = ns.S;
  const State = (ns.State = ns.State || {});

  const QUEUE_STATES = ['waiting', 'arriving'];
  const inQueue = (s) => s.customers.filter((c) => QUEUE_STATES.includes(c.status));
  const idlePCs = (s) => s.pcs.filter((p) => p.status === 'free' && !p.fault && !p.issue);
  const queueCap = (s) => CFG.MAX_QUEUE + (s.queueBoost || 0);
  const round5 = (v) => Math.round(v / 5) * 5;

  /** Patience as a 0–100 figure for bars and moods. */
  const patiencePct = (c) => clamp(((c.patience ?? 0) / (c.patienceMax || 1)) * 100, 0, 100);

  /** Which archetype walks in next. Respects unlock days, night-only types, perk bias and the director. */
  function pickType(s) {
    const late = s.elapsed;
    return S.weighted(s, TYPES, (t) => {
      if ((t.minDay || 1) > s.day) return 0;
      if (t.lateOnly && late < t.lateOnly) return 0;
      let w = t.weight ?? 1;
      if (t.lateOnly) w *= 1.5; // the night crowd really does turn up at night
      if (t.id === 'student') w *= 1 + S.mod(s, 'studentSpawn');
      if (t.id === 'rm1') w *= 1 + S.mod(s, 'kidSpawn');
      return w;
    });
  }

  /** What length of session this customer asks for. */
  function requestedMinutes(s, type) {
    return S.weighted(s, type.durations, (d) => d[1])[0];
  }

  /** Build a customer record (does not add it to the shop). */
  function makeCustomer(s, typeId, extra = {}) {
    const type = byId(TYPES, typeId) || TYPES[0];
    const minutes = extra.requestedMinutes || requestedMinutes(s, type);
    const patience = type.patience + (S.hasPerk(s, 'aircond') ? 6 : 0);
    return {
      id: ++s.customerSequence,
      type: type.id,
      name: type.name,
      emoji: type.emoji,
      color: type.shirt,
      patience,
      patienceMax: patience,
      status: 'arriving',
      x: ROOM.door.x,
      y: ROOM.door.y,
      destination: null,
      queueIndex: 0,
      pcId: null,
      duration: minutes,
      requestedMinutes: minutes,
      game: type.game,
      quote: `Bang, ${minutes} minit ya!`,
      bubbleUntil: 3,
      issue: null,
      act: null,
      ...extra,
    };
  }

  function spawn(s) {
    if (inQueue(s).length >= queueCap(s) || s.customers.length >= 18) return false;
    const type = pickType(s);
    if (!type) return false;
    const customer = makeCustomer(s, type.id);
    customer.queueIndex = inQueue(s).length;
    customer.destination = ROOM.queueSlot(customer.queueIndex);
    s.customers.push(customer);
    S.log(s, `${customer.name}: “${customer.quote}”`);
    S.emit('arrival', { customerId: customer.id });
    return true;
  }

  /** Close gaps in the waiting line when someone is seated or walks out. */
  function compactQueue(s) {
    inQueue(s)
      .sort((a, b) => a.id - b.id)
      .forEach((c, index) => {
        if (c.queueIndex === index) return;
        c.queueIndex = index;
        c.destination = ROOM.queueSlot(index);
      });
  }

  /** Put an event NPC (door crowd) into the waiting line as an ordinary customer. */
  function joinQueue(s, c) {
    c.status = 'arriving';
    c.eventId = null;
    c.act = null;
    c.queueIndex = inQueue(s).length;
    c.destination = ROOM.queueSlot(c.queueIndex);
  }

  function chooseRental(s, customerId, minutes) {
    const c = byId(s.customers, customerId);
    if (!c || !QUEUE_STATES.includes(c.status)) return S.fail('Pelanggan dah tak menunggu.');
    if (!RENTAL.durations.includes(minutes)) return S.fail('Tempoh tak sah.');
    s.pendingCustomerId = customerId;
    s.pendingDuration = minutes;
    s.selected = { kind: 'customer', id: customerId };
    return S.ok(`${minutes} min dipilih. Tap PC kosong untuk assign ${c.name}.`);
  }

  /** Assign the selected customer (with the chosen duration) to PC `pcId`. */
  function assignToPC(s, pcId) {
    const c = byId(s.customers, s.pendingCustomerId);
    const p = byId(s.pcs, pcId);
    if (!c || !QUEUE_STATES.includes(c.status)) {
      s.pendingCustomerId = null;
      s.pendingDuration = null;
      return S.fail('Pelanggan sudah keluar.');
    }
    if (!p || p.status !== 'free' || p.fault || p.issue) return S.fail('PC ini tak tersedia.');
    if (s.powerOutage > 0) return S.fail('Elektrik tengah padam!');
    if (!s.pendingDuration) return S.fail('Pilih tempoh sewaan dahulu.');

    const minutes = s.pendingDuration;
    const exact = minutes === c.requestedMinutes;
    const info = assignCustomer(s, c, p, minutes);
    if (!info) return S.fail('Sewaan gagal. Cuba PC lain.');

    if (!exact) {
      bumpWrong(s, c, minutes, info);
    } else {
      S.log(s, `✅ ${c.name}: ${minutes} min tepat di PC ${p.id}. +${fmtMoney(p.charged)}`);
    }
    s.pendingCustomerId = null;
    s.pendingDuration = null;
    s.selected = { kind: 'pc', id: p.id };
    return S.ok(exact ? 'Sewaan berjaya!' : 'Salah masa — pelanggan dapat potongan harga.');
  }

  function bumpWrong(s, c, minutes, info) {
    S.bump(s, 'rep', RENTAL.wrongRep);
    s.shiftStats.complaints++;
    s.shiftStats.wrongDuration++;
    s.shiftStats.wrongLost += info.lost;
    S.log(s, `⏱️ SALAH MASA! ${c.name} minta ${c.requestedMinutes} min, diberi ${minutes} min. Jualan berkurang ${fmtMoney(info.lost)}.`);
  }

  /**
   * Seat a customer. Billing rules:
   *  - the right duration pays the full list price;
   *  - the wrong one bills the *shorter* of (chosen, requested) at HALF price (50 % cut) and costs reputation, so a wrong pick can
   *    never pay more than the right one — and a too-long pick also ties the PC up for longer.
   * Returns { price, lost } or null.
   */
  function assignCustomer(s, c, pc, minutes) {
    if (!c || !QUEUE_STATES.includes(c.status) || !pc || pc.status !== 'free' || pc.fault || pc.issue) return null;
    const exact = minutes === c.requestedMinutes;
    let sessionMinutes = minutes;
    const snackSold = S.hasPerk(s, 'snack') && S.chance(s, 0.32);
    if (snackSold) sessionMinutes = Math.min(90, minutes + RENTAL.snackExtraMinutes);

    const billMinutes = exact ? sessionMinutes : Math.min(minutes, c.requestedMinutes);
    const full = S.priceFor(billMinutes, pc, c.game);
    const price = exact ? full : Math.max(0, round5(full * (1 - RENTAL.wrongPenalty)));
    const key = `rental:${c.id}`;
    if (!S.recordOnce(s, key, 'rental', price, `Rental PC ${pc.id}`)) return null; // never charge one customer twice

    if (snackSold) {
      S.record(s, 'snack', RENTAL.snackPrice, 'Jualan snack');
      if (S.chance(s, 0.18)) {
        s.snackMessTimer = 10 + Math.floor(S.random(s) * 10);
        S.log(s, '🥤 Snack laku keras… tapi ada risiko sepah atau hilang snack nanti.');
      }
    }
    if (c.type === 'student' && S.mod(s, 'printing')) S.record(s, 'printing', S.mod(s, 'printing'), 'Upah cetakan');
    if (S.mod(s, 'blockedComplaint') && S.chance(s, S.mod(s, 'blockedComplaint'))) {
      S.bump(s, 'rep', -1);
      S.log(s, '🛡️ Pelanggan merungut: laman disekat oleh filter.');
    }

    pc.status = 'reserved';
    pc.customerId = c.id;
    c.pcId = pc.id;
    c.duration = sessionMinutes;
    c.paid = price;
    pc.charged = price;
    pc.occupiedSeconds = ns.sessionSecondsFor(sessionMinutes); // 30 min = 10 s · 60 = 16 s · 90 = 22 s
    pc.rentalSeconds = pc.occupiedSeconds;
    pc.sessionGame = c.game;
    pc.lingerTime = 0;
    c.status = 'walkToPc';
    c.destination = ROOM.seatFor(pc);
    s.shiftStats.served++;
    s.pendingCustomerId = s.pendingCustomerId === c.id ? null : s.pendingCustomerId;
    S.log(s, `PC ${pc.id} disewa ${sessionMinutes} minit (+${fmtMoney(price)}).`);
    S.emit('rental', { pcId: pc.id, amount: price });
    // Abang strolls over to set the session up (cosmetic — he never blocks the sale)
    const spot = ROOM.staffSpotFor(pc);
    s.player.errand = { x: spot.x, y: spot.y, hold: 0.9 };
    // what the right answer would have paid, minus what was actually billed
    return { price, lost: exact ? 0 : Math.max(0, S.priceFor(c.requestedMinutes, pc, c.game) - price) };
  }

  /** Send a customer home, optionally refunding the unused part of their session. */
  function releaseCustomer(s, c, reason, refundFraction = 0) {
    if (!c) return;
    const p = byId(s.pcs, c.pcId);
    if (p && p.customerId === c.id) {
      if (refundFraction > 0 && (p.status === 'busy' || p.status === 'fault')) {
        const unspent = p.rentalSeconds > 0 ? clamp(p.occupiedSeconds / p.rentalSeconds, 0, 1) : 0;
        const refund = Math.round((p.charged * unspent * refundFraction) / 10) * 10;
        if (refund > 0) S.record(s, 'refund', -refund, `Refund PC ${p.id}`);
      }
      p.customerId = null;
      if (p.status === 'busy' || p.status === 'reserved') p.status = p.fault ? 'fault' : 'free';
      Object.assign(p, { occupiedSeconds: 0, rentalSeconds: 0, charged: 0, sessionGame: null, issue: null, lingerTime: 0, screenAngle: 0 });
    }
    c.status = 'leaving';
    c.destination = { x: ROOM.door.x, y: ROOM.door.y };
    c.issue = null;
    c.act = null;
    c.eventId = null;
    if (reason) S.log(s, reason);
  }

  /** What each person is visibly doing (the renderer's animation state machine reads `act`). */
  function refreshActs(s) {
    const loud = (s.activeIssues || []).find((e) => e.type === 'loudvideo');
    const loudPc = loud ? byId(s.pcs, loud.pcId) : null;
    for (const c of s.customers) {
      if (c.status === 'officer' || c.status === 'event' || c.status === 'gone') continue;
      let act = null;
      let look = null;
      if (c.issue === 'fight') act = 'argue';
      else if (c.issue === 'suspicious') act = 'hide';
      else if (c.issue === 'loudvideo') act = 'cheer';
      else if (c.issue === 'nomouse') act = 'stuck';
      else if (s.powerOutage > 0 && (c.status === 'playing' || c.status === 'waiting')) act = 'startled';
      else if (c.status === 'playing' && c.pcId && byId(s.pcs, c.pcId)?.fault) act = 'panic';
      else if (loudPc && c.pcId !== loudPc.id && (c.status === 'playing' || c.status === 'waiting')) {
        act = 'annoyed';
        look = { x: loudPc.x, y: loudPc.y };
      } else if (c.lingerTime > 0) act = 'lepak';
      if (c.act !== act) c.act = act;
      c.lookAt = look;
    }
  }

  /** Per-frame customer simulation: walking, sitting down, patience. */
  function updatePeople(s, dt) {
    const drain = S.patienceDrain(s);
    for (const c of s.customers) {
      S.updateMove(c, dt, c.status === 'event' ? 2.2 : CFG.CUSTOMER_SPEED);
      c.sitBlend = clamp((c.sitBlend || 0) + (c.status === 'playing' ? dt * 3.8 : -dt * 5.4), 0, 1);

      if (c.status === 'arriving' && !c.destination) c.status = 'waiting';

      if (c.status === 'walkToPc' && !c.destination) {
        c.status = 'playing';
        const p = byId(s.pcs, c.pcId);
        if (p && p.status === 'reserved') {
          p.status = 'busy';
          S.emit('startup', { pcId: p.id });
          if (S.chance(s, S.faultChance(s, p))) State.breakPc(s, p, null, { onSeat: true });
        }
      }

      if (c.status === 'playing') {
        const current = byId(s.pcs, c.pcId);
        if (current?.status === 'fault' && current.fault) {
          c.patience -= dt * 2.4;
          if (c.patience <= 0) {
            releaseCustomer(s, c, `${c.name} balik sebab PC ${current.id} rosak!`, 0.5);
            S.bump(s, 'rep', -3);
            s.shiftStats.walkouts++;
          }
        }
      }

      if (c.status === 'waiting') {
        // Stand in line facing the counter (a slight turn so the face stays readable from the camera).
        if (!c.destination) c.facing = (c.facing ?? 0) + ns.shortestAngle(c.facing ?? 0, -1.2) * (1 - Math.exp(-6 * dt));
        c.patience -= dt * drain;
        if (c.patience <= 0) {
          releaseCustomer(s, c, `${c.name} bosan tunggu dan balik.`);
          S.bump(s, 'rep', -2);
          s.shiftStats.walkouts++;
          s.shiftStats.walkoutLost += S.priceFor(c.requestedMinutes, { tier: 1 }, c.game);
          S.emit('walkout', { customerId: c.id });
        }
      }

      if (c.status === 'leaving' && !c.destination) c.status = 'gone';
    }
    s.customers = s.customers.filter((c) => c.status !== 'gone');
    S.separate(s, dt);
    compactQueue(s);
    refreshActs(s);
  }

  Object.assign(S, { inQueue, idlePCs, queueCap, patiencePct, makeCustomer, compactQueue, joinQueue, releaseCustomer, refreshActs });
  Object.assign(State, { spawn, chooseRental, assignToPC, assignCustomer, inQueue, idlePCs, patiencePct, releaseCustomer, updatePeople, queueCap: S.queueCap });
})(window.ABCC);
