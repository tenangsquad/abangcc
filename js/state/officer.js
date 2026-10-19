/* ==========================================================================
   2i. ENFORCEMENT OFFICER — a real NPC who walks the shop and judges its state
   --------------------------------------------------------------------------
   Arrives at a random time (different every day), greets Abang at the door, walks to
   a handful of PCs, stands beside each and examines the screen, then leaves with a
   verdict. The verdict is computed from the *state of the shop* — open violations,
   compliance, professionalism, risk, repeat offences — never from a dice roll alone.
   ========================================================================== */
(function (ns) {
  'use strict';

  const { ROOM, DIRECTOR, byId, clamp, clock } = ns;
  const S = ns.S;
  const State = (ns.State = ns.State || {});

  const OFFICER_ID = -99;
  const VIOLATION_ISSUES = ['fight', 'restricted'];

  /** Day-seeded arrival time. More risk brings the officer earlier. */
  function scheduleInspection(s) {
    const D = DIRECTOR.inspection;
    const base = S.between(s, D.window);
    return Math.max(15, Math.floor(base - s.risk * D.earlierPerRisk));
  }

  /** The PCs the officer decides to look at: busy ones and ones with trouble are more interesting. */
  function chooseVisits(s) {
    const want = clamp(2 + Math.floor(s.day / 3), 2, Math.min(4, s.pcs.length));
    const pool = [...s.pcs];
    const picked = [];
    while (picked.length < want && pool.length) {
      const p = S.weighted(s, pool, (q) => 1 + (q.status === 'busy' ? 1.2 : 0) + (q.issue ? 2 : 0) + (q.fault ? 0.6 : 0));
      picked.push(p);
      pool.splice(pool.indexOf(p), 1);
    }
    // walk the shortest tour from the door
    const ordered = [];
    let at = { x: ROOM.door.x, y: ROOM.door.y };
    while (picked.length) {
      picked.sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y));
      const next = picked.shift();
      ordered.push(next.id);
      at = next;
    }
    return ordered;
  }

  function startOfficer(s) {
    if (s.officer || s.inspectionDoneDay) return false;
    s.officer = { stage: 'greet', scanIndex: 0, hold: 0, visits: chooseVisits(s), flags: 0, notes: [], attitude: 0, greetFor: 0 };
    s.customers.push({
      id: OFFICER_ID, type: 'officer', name: 'Pegawai', emoji: '👮', color: '#3f7bd8', patience: 999, patienceMax: 999,
      status: 'officer', x: ROOM.door.x, y: ROOM.door.y, destination: { ...ROOM.doorCluster[0] }, pcId: null,
      quote: 'Pemeriksaan premis', bubbleUntil: 4, issue: null, act: 'greet',
    });
    s.inspectionScheduled = 999;
    s.shiftStats.inspections++;
    S.log(s, '👮 PEGAWAI MASUK. Dia akan berjalan ke beberapa PC dan periksa keadaan kedai.');
    S.emit('officer');
    State.startEvent(s, 'raid', { npcId: OFFICER_ID, story: true });
    return true;
  }

  const scoreOf = (s, o) => {
    const open = (s.activeIssues || []).filter((x) => VIOLATION_ISSUES.includes(x.type) || (x.type === 'suspicious' && x.guilty)).length;
    return (
      o.flags * 22 +
      s.violationLog.length * 14 +
      open * 16 +
      Math.max(0, s.risk - 30) * 0.6 +
      Math.max(0, 60 - s.compliance) * 0.5 -
      Math.max(0, s.professionalism - 50) * 0.15 -
      Math.max(0, s.compliance - 70) * 0.2 +
      (o.attitude || 0)
    );
  };

  /** The verdict. Exposed so tests (and the report) can read the score. */
  function inspection(s, o = { flags: 0, attitude: 0 }) {
    s.inspectionDoneDay = true;
    s.inspectionsCampaign++;
    const score = scoreOf(s, o);
    const severe = score >= 45;
    const minor = !severe && score >= 18;
    if (severe) {
      S.record(s, 'fine', -3000, 'Denda inspection');
      S.bump(s, 'compliance', -15);
      S.bump(s, 'rep', -12);
      s.risk = Math.max(s.risk - 9, 40); // an offender stays on the radar
      s.repeatOffences = (s.repeatOffences || 0) + 1;
      S.log(s, '🚨 PEMERIKSAAN GAGAL! Denda RM30.');
    } else if (minor) {
      S.bump(s, 'rep', -8);
      S.bump(s, 'risk', -4);
      S.log(s, '👮 Pemeriksaan: amaran diberikan. Kena jaga lebih elok.');
    } else {
      S.bump(s, 'rep', 8);
      S.bump(s, 'compliance', 5);
      S.bump(s, 'risk', -9);
      S.log(s, '👮 PEMERIKSAAN LULUS! Reputasi +8.');
    }
    s.lastInspection = { severe, minor, score: Math.round(score), flags: o.flags, notes: o.notes || [], at: clock(S.minutesNow(s)) };
    return s.lastInspection;
  }

  function updateOfficer(s, dt) {
    const a = s.officer;
    if (!a) return;
    const npc = byId(s.customers, OFFICER_ID);
    if (!npc) {
      s.officer = null;
      return;
    }
    if (npc.destination) return;

    if (a.stage === 'greet') {
      npc.act = 'greet';
      a.greetFor += dt;
      const raid = (s.worldEvents || []).find((e) => e.type === 'raid');
      if (raid && a.greetFor < 10) return; // waiting for Abang (or the greeting to time out)
      a.stage = 'scan';
      a.hold = 0;
      npc.act = null;
    }
    if (a.stage === 'scan') {
      const id = a.visits[a.scanIndex];
      if (id == null) {
        a.stage = 'leave';
        npc.act = null;
        npc.lookAt = null;
        npc.destination = { ...ROOM.door };
        return;
      }
      const p = byId(s.pcs, id);
      if (!p) {
        a.scanIndex++;
        return;
      }
      if (a.hold === 0) {
        npc.destination = { x: p.x - 0.55, y: p.y + 0.72 };
        a.hold = -1;
        npc.act = null;
        return;
      }
      if (a.hold < 0) a.hold = 2.5;
      npc.act = 'inspect';
      npc.lookAt = { x: p.x, y: p.y };
      a.hold -= dt;
      if (a.hold <= 0) {
        const ev = (s.activeIssues || []).find((x) => x.pcId === id);
        const sitter = byId(s.customers, p.customerId);
        if (p.issue === 'restricted' || (p.issue === 'suspicious' && ev?.guilty) || p.issue === 'fight') {
          a.flags++;
          a.notes.push(`PC ${id}: masalah disiplin`);
          S.log(s, `👮 Pegawai catat kesalahan di PC ${id}.`);
        } else if (sitter?.truant) {
          a.flags++;
          a.notes.push(`PC ${id}: pelajar beruniform`);
          S.log(s, `👮 Pegawai catat pelajar beruniform di PC ${id}.`);
        }
        a.scanIndex++;
        a.hold = 0;
      }
    } else if (a.stage === 'leave') {
      s.officer = null;
      s.customers = s.customers.filter((c) => c.id !== OFFICER_ID);
      inspection(s, a);
    }
  }

  Object.assign(S, { OFFICER_ID });
  Object.assign(State, { startOfficer, updateOfficer, inspection, scheduleInspection, scoreOf });
})(window.ABCC);
