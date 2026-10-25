/* ==========================================================================
   2h. WORLD EVENTS — special events that exist physically in the room
   --------------------------------------------------------------------------
   An event is something you can walk up to: people waiting at the door (gang, mak,
   download, truancy, LAN group, the inspecting officer), the fuse box (blackout), a
   puddle (spill) or a suspect by the snack machine (snack theft). The player selects
   it in the 3D room — or taps "Tengok" in Situasi Panas — and chooses in the pop-up menu on it.
   Most choices send Abang walking first; the outcome lands when he arrives.
   ========================================================================== */
(function (ns) {
  'use strict';

  const { CFG, ROOM, EVENTS, DIRECTOR, byId, fmtMoney } = ns;
  const S = ns.S;
  const State = (ns.State = ns.State || {});

  const MAX_CONCURRENT = 2;
  const eventById = (s, id) => (s.worldEvents || []).find((e) => e.id === id);

  /* ---------- starting an event ---------- */

  function canStart(s, id) {
    const def = EVENTS[id];
    if (!def) return false;
    if ((s.worldEvents || []).length >= MAX_CONCURRENT) return false;
    if ((s.worldEvents || []).some((e) => e.type === id)) return false;
    if (def.requires && !S.hasPerk(s, def.requires)) return false;
    if (def.schoolHours && S.hourNow(s) >= CFG.SCHOOL_HOURS_END) return false;
    if (id === 'blackout' && s.powerOutage > 0) return false;
    return true;
  }

  /** People who walk in and wait at the door cluster. */
  function spawnNpcs(s, ev, def) {
    const { type, count, look, name, emoji } = def.npc;
    for (let i = 0; i < count; i++) {
      const c = S.makeCustomer(s, type, { status: 'event', eventId: ev.id, patience: 999, patienceMax: 999, act: 'plead' });
      if (look) c.look = look;
      if (name) c.name = name;
      if (emoji) c.emoji = emoji;
      if (look === 'mak') Object.assign(c, { name: 'Mak Cik', emoji: '👩', female: true });
      if (look === 'uniform') Object.assign(c, { name: 'Pelajar Beruniform', emoji: '🏫', truant: true });
      c.destination = ROOM.doorCluster[i % ROOM.doorCluster.length];
      s.customers.push(c);
      ev.npcIds.push(c.id);
    }
  }

  function startEvent(s, id, opts = {}) {
    if (!canStart(s, id)) return false;
    const def = EVENTS[id];
    const ev = { id: ++s.eventSeq, type: id, kind: def.kind, time: def.time, total: def.time, npcIds: [], data: {}, spot: { ...ROOM.doorTalk }, focus: { ...ROOM.doorCluster[0] } };

    if (def.isOfficer) {
      ev.npcIds.push(opts.npcId); // the officer is already standing at the door
    } else if (def.kind === 'npc') {
      spawnNpcs(s, ev, def);
    } else if (def.kind === 'power') {
      s.powerOutage = 20;
      s.powerFlicker = 2;
      if (S.hasPerk(s, 'generator')) {
        // the generator coughs into life by itself: a short blip instead of a long dark spell, for the price of some diesel
        const fuel = Math.min(CFG.GENERATOR.fuel, Math.max(0, s.cash));
        if (fuel) S.record(s, 'fuel', -fuel, 'Minyak generator');
        s.powerOutage = CFG.GENERATOR.outage;
        s.shiftStats.generatorRuns++;
        S.log(s, `🔌 Generator hidup sendiri! Elektrik pulih dalam ${CFG.GENERATOR.outage} saat.`);
        S.emit('generator');
      }
      ev.spot = { ...ROOM.fuse.spot };
      ev.focus = { x: ROOM.fuse.x + 0.3, y: ROOM.fuse.z };
    } else if (def.kind === 'machine') {
      const W = ROOM.widthFor(s.pcs.length);
      const m = ROOM.snackSpot(W);
      const suspect = S.makeCustomer(s, S.choice(s, ns.TYPES).id, { status: 'event', eventId: ev.id, patience: 999, patienceMax: 999, act: 'sneak', name: 'Orang dekat mesin', emoji: '🤨' });
      suspect.destination = { ...m.stand };
      s.customers.push(suspect);
      ev.npcIds.push(suspect.id);
      ev.data.thief = S.chance(s, 0.5); // decided now, shown never
      ev.spot = { x: m.stand.x - 0.9, y: m.stand.y + 0.4 };
      ev.focus = { ...m.stand };
    } else if (def.kind === 'floor') {
      const busy = s.pcs.filter((p) => p.status === 'busy');
      const pc = S.choice(s, busy.length ? busy : s.pcs);
      const spot = ROOM.spillSpotFor(pc);
      ev.data.pcId = pc.id;
      ev.focus = spot;
      ev.spot = { x: spot.x - 0.85, y: spot.y };
    }

    s.worldEvents.push(ev);
    if (!opts.story) {
      s.specialHandled++;
      s.specialSeen.push(id);
    }
    s.shiftStats.incidents++;
    S.log(s, `${def.emoji} ${def.title}: ${def.say}`);
    S.emit('event', { id: ev.id, type: id });
    return ev;
  }

  /* ---------- choices ---------- */

  /** Choices for the pop-up menu, with disabled flags (cost) already applied. */
  function eventOptions(s, ev) {
    const def = EVENTS[ev.type];
    return def.choices.map((ch) => ({
      act: 'event', choice: ch.id, label: ch.label, sub: ch.desc,
      cost: ch.cost || 0,
      disabled: !!(ch.cost && s.cash < ch.cost),
      css: ch.id === def.fallback ? 'paper' : 'mint',
      remote: !!ch.remote,
    }));
  }

  const leaveAll = (s, ev, reason) => {
    for (const id of ev.npcIds) {
      const c = byId(s.customers, id);
      if (c && c.status !== 'leaving') {
        c.status = 'leaving';
        c.destination = { ...ROOM.door };
        c.eventId = null;
        c.act = null;
      }
    }
    if (reason) S.log(s, reason);
  };
  const joinAll = (s, ev, tweak) => {
    for (const id of ev.npcIds) {
      const c = byId(s.customers, id);
      if (!c) continue;
      if (tweak) tweak(c);
      S.joinQueue(s, c);
    }
  };
  const removeEvent = (s, ev) => {
    s.worldEvents = s.worldEvents.filter((e) => e !== ev);
    if (s.selected?.kind === 'event' && s.selected.id === ev.id) s.selected = { kind: 'pc', id: 1 };
  };

  /** Apply the outcome of a choice and clear the event from the room. */
  function resolveEvent(s, evId, choiceId, opts = {}) {
    const ev = eventById(s, evId);
    if (!ev) return S.fail('Kejadian dah selesai.');
    const def = EVENTS[ev.type];
    const choice = def.choices.find((c) => c.id === choiceId) || def.choices.find((c) => c.id === def.fallback) || { id: def.fallback };
    if (choice.cost && s.cash < choice.cost) return S.fail('Duit tak cukup.');
    const pick = choice.id;
    let msg = '';

    switch (ev.type) {
      case 'gang':
        if (pick === 'deal') {
          S.record(s, 'promo', 500, 'Pakej geng');
          s.peakRush = 14;
          s.spawnCooldown = 0;
          joinAll(s, ev);
          msg = 'Pakej geng! Duit masuk, tetapi geng memenuhi kedai.';
        } else {
          S.bump(s, 'rep', -2);
          leaveAll(s, ev);
          msg = 'Harga biasa. Geng mengomel dan balik.';
        }
        break;
      case 'download':
        if (pick === 'now') {
          S.record(s, 'download_tip', 800, 'Upah muat turun');
          s.peakRush = Math.max(s.peakRush, 18);
          s.networkRush = 18;
          S.bump(s, 'rep', -3);
          joinAll(s, ev);
          msg = 'Muat turun bermula! +RM8, tetapi reputasi -3 sebab line lag.';
        } else {
          S.bump(s, 'rep', -1);
          leaveAll(s, ev);
          msg = 'Download ditangguh. Network kekal stabil.';
        }
        break;
      case 'mak':
        if (pick === 'help') {
          S.bump(s, 'rep', 4);
          S.bump(s, 'risk', -4);
          s.heroSaved++;
          msg = 'Mak lega. “Terima kasih bang!”';
        } else {
          S.bump(s, 'rep', -5);
          msg = 'Mak marah. “Aku report kedai ni!”';
        }
        leaveAll(s, ev);
        break;
      case 'truancy':
        if (pick === 'refuse') {
          S.bump(s, 'compliance', 4);
          S.bump(s, 'professionalism', 3);
          S.bump(s, 'risk', -5);
          leaveAll(s, ev);
          msg = '🎒 Pelajar diminta pulang ke sekolah. Kedai lebih dipercayai.';
        } else {
          S.record(s, 'walkin', 200, 'Tip pelajar beruniform');
          S.bump(s, 'risk', 17);
          S.bump(s, 'compliance', -11);
          s.violationLog.push('Pelanggan beruniform dalam waktu sekolah');
          joinAll(s, ev);
          msg = '💰 Mereka masuk. Tapi risiko pemeriksaan meningkat!';
        }
        break;
      case 'lan':
        if (pick === 'host') {
          S.record(s, 'tourney', 1000, 'Yuran LAN tournament');
          s.peakRush = Math.max(s.peakRush, 19);
          s.spawnCooldown = 0;
          S.bump(s, 'risk', 5);
          joinAll(s, ev, (c) => { c.patience = c.patienceMax = 26; });
          msg = '🏆 Tournament bermula! Duit masuk, tapi pressure jadi kuat.';
        } else {
          S.bump(s, 'professionalism', 1);
          leaveAll(s, ev);
          msg = 'Kau tolak baik-baik. Regular customer boleh main seperti biasa.';
        }
        break;
      case 'blackout':
        if (pick === 'fuse') {
          S.record(s, 'emergency', -choice.cost, 'Fius elektrik');
          s.powerOutage = Math.min(s.powerOutage, 3);
          S.bump(s, 'professionalism', 2);
          msg = opts.by === 'assistant' ? `⚡ ${CFG.ASSISTANT.name} tukar fius. Kuasa pulih dalam 3 saat.` : '⚡ Fius diganti. Kuasa akan pulih dalam 3 saat.';
        } else {
          S.bump(s, 'rep', -2);
          msg = '🕯️ Tunggu bekalan pulih. Pelanggan mula tidak sabar.';
        }
        break;
      case 'snacktheft': {
        const thief = !!ev.data.thief;
        if (pick === 'audit') {
          S.record(s, 'audit', -choice.cost, 'Semak stok snack');
          if (thief) {
            S.record(s, 'recovered', 400, 'Snack berjaya dipulangkan');
            S.bump(s, 'professionalism', 3);
            msg = '🕵️ Stok hilang dijumpai — memang dia. Customer lega bila kau semak dengan adil.';
          } else {
            S.bump(s, 'professionalism', 2);
            msg = '🧾 Rupanya stok salah kira, dia tak bersalah! Nasib baik kau semak dulu.';
          }
        } else if (pick === 'accuse') {
          if (thief) {
            S.record(s, 'recovered', 300, 'Snack dipulangkan');
            S.bump(s, 'rep', -2);
            msg = 'Betul dia! Snack dipulangkan, tapi customer lain dah mula takut.';
          } else {
            S.bump(s, 'rep', -7);
            S.bump(s, 'professionalism', -10);
            msg = '😬 Salah tuduh! Orang itu marah dan reputasi jatuh.';
          }
        } else {
          S.record(s, 'loss', -400, 'Stok snack hilang');
          S.bump(s, 'rep', -2);
          msg = 'Stok snack hilang sebab isu diabaikan.';
        }
        leaveAll(s, ev);
        break;
      }
      case 'spill':
        if (pick === 'clean') {
          S.record(s, 'cleaning', -choice.cost, 'Bersihkan lantai');
          S.bump(s, 'rep', 2);
          msg = '🧹 Cleaner sampai, lantai bersih sebelum sesi seterusnya.';
        } else if (pick === 'mop') {
          if (opts.by === 'assistant') msg = `🧽 ${CFG.ASSISTANT.name} siap lap lantai. Abang tak terganggu.`;
          else {
            s.cleanupSlow = 10;
            msg = '🧽 Abang lap sendiri. Semua kerja jadi perlahan sebentar.';
          }
        } else {
          // left alone: the liquid reaches the machine next to it
          const pc = byId(s.pcs, ev.data.pcId);
          if (pc && !pc.fault && pc.status !== 'job') State.breakPc(s, pc, (p) => `⚡ Air tumpah menyebabkan PC ${p.id} litar pintas!`, { kind: S.chance(s, 0.5) ? 'hardware' : 'bsod' });
          S.bump(s, 'rep', -2);
          S.bump(s, 'risk', 4);
          msg = 'Air tak dilap — PC sebelah rosak!';
        }
        break;
      case 'raid': {
        const o = s.officer;
        if (pick === 'cooperate') {
          if (o) o.attitude = -8;
          S.bump(s, 'professionalism', 2);
          msg = '👮 Kau bekerjasama dan tunjuk rekod dengan jelas.';
        } else if (pick === 'rush') {
          if (o) o.attitude = 10;
          S.bump(s, 'professionalism', -2);
          msg = '😰 Pegawai nampak kau gelisah. Dia lebih teliti.';
        } else msg = '👮 Pegawai mula memeriksa.';
        break;
      }
    }
    S.log(s, msg);
    removeEvent(s, ev);
    S.emit('eventDone', { type: ev.type, choice: pick });
    return S.ok(msg);
  }

  /** Per-frame: count events down; unanswered ones fall back to their default outcome. */
  function updateEvents(s, dt) {
    for (const ev of [...(s.worldEvents || [])]) {
      if (ev.kind === 'power') {
        ev.time -= dt;
        if (s.powerOutage <= 0) {
          removeEvent(s, ev); // power is back — nothing left to decide
          continue;
        }
        if (ev.time <= 0) resolveEvent(s, ev.id, EVENTS.blackout.fallback);
        continue;
      }
      ev.time -= dt;
      if (ev.time <= 0) resolveEvent(s, ev.id, EVENTS[ev.type].fallback);
    }
  }

  /* ---------- the scripted day and the special-event director ---------- */

  /** Scripted incident timeline; day 1 is a fixed tutorial, later days shuffle. */
  function makeBeatPlan(s) {
    if (s.day === 1) {
      return [
        { at: 18, id: 'suspicious' },
        { at: 37, id: 'loudvideo' },
        { at: 56, id: 'fight' },
        { at: 74, id: 'fault' },
        { at: 94, id: 'download' },
        { at: 105, id: 'fight' },
      ];
    }
    const trouble = S.chance(s, 0.5) ? ['suspicious', 'loudvideo'] : ['loudvideo', 'suspicious'];
    const moments = ['gang', 'mak', 'download'];
    const first = S.choice(s, moments);
    const second = S.choice(s, moments.filter((x) => x !== first));
    const offset = Math.min(10, Math.floor((s.day - 1) / 2));
    return [
      { at: 16, id: first },
      { at: 32 - offset * 0.2, id: trouble[0] },
      { at: 50 - offset * 0.1, id: 'fault' },
      { at: 71, id: second },
      { at: 88 - offset * 0.2, id: trouble[1] },
      { at: 104 + Math.floor(S.random(s) * 6), id: 'fight' },
    ];
  }

  /** Special-event slots for the day (seconds into the shift). */
  function makeSpecialSlots(s) {
    const D = DIRECTOR.specials;
    const slots = [];
    for (const slot of D.slots) if (s.day >= slot.fromDay) slots.push({ at: Math.floor(S.between(s, slot.at)), done: false });
    if (s.day >= D.school.fromDay) slots.push({ at: Math.floor(S.between(s, D.school.at)), done: false, school: true });
    return slots;
  }

  function chooseSpecial(s, slot) {
    if (slot.school) return 'truancy';
    const choices = ['blackout', 'spill', 'nomouse'];
    if (s.day >= 3) choices.push('lan');
    if (S.hasPerk(s, 'snack')) choices.push('snacktheft', 'snacktheft');
    for (let i = 0; i < S.mod(s, 'spillBias'); i++) choices.push('spill', 'spill'); // the portable aircond drips
    if (s.day >= 4) choices.push('blackout');
    const fresh = choices.filter((v) => !s.specialSeen.includes(v));
    return fresh.length ? S.choice(s, fresh) : S.choice(s, choices);
  }

  function runSpecialDirector(s) {
    for (const slot of s.specialAt || []) {
      if (slot.done || s.elapsed < slot.at || s.inspectionIncoming > 0) continue;
      const id = chooseSpecial(s, slot);
      if (id === 'nomouse' || id === 'fight') {
        const busy = s.pcs.filter((p) => p.status === 'busy' && !p.issue);
        if (!busy.length) continue; // wait until somebody is actually playing
        const target = S.choice(s, busy);
        if (State.makeIncident(s, id, target)) {
          slot.done = true;
          s.specialHandled++;
          s.specialSeen.push(id);
        }
        continue;
      }
      if (startEvent(s, id)) slot.done = true;
      else if (s.elapsed > slot.at + 25) slot.done = true; // couldn't start — don't wait forever
    }
  }

  function runScriptedBeat(s) {
    const beats = s.beatPlan || makeBeatPlan(s);
    const beat = beats[s.beatIndex];
    if (!beat || s.elapsed < beat.at) return;
    const overdue = s.elapsed > beat.at + 20;

    if (['suspicious', 'loudvideo', 'fight', 'fault'].includes(beat.id)) {
      // Wait until somebody is actually playing so the tutorial beat isn't wasted (but never block the plan for ever).
      const playing = s.pcs.filter((p) => p.status === 'busy' && !p.issue && !p.fault);
      let started = false;
      if (playing.length) {
        const p = S.choice(s, playing);
        if (beat.id === 'fault') {
          if (s.pcs.filter((q) => q.status === 'fault').length >= 2) started = State.makeIncident(s, 'loudvideo', p);
          else {
            State.breakPc(s, p, (q) => `💥 PC ${q.id}: ${ns.FAULTS[q.fault].label}! Pelanggan panik, perlu tindakan.`);
            started = true;
          }
        } else started = State.makeIncident(s, beat.id, p);
      }
      if (!started && !overdue) return;
    } else if (!startEvent(s, beat.id, { story: true }) && !overdue) {
      return;
    }
    s.beatIndex++;
  }

  Object.assign(S, { eventById, removeEvent });
  Object.assign(State, { startEvent, resolveEvent, eventOptions, eventById, updateEvents, makeBeatPlan, makeSpecialSlots, runSpecialDirector, runScriptedBeat, canStartEvent: canStart });
})(window.ABCC);
