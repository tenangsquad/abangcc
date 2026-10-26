// Gameplay-logic tests (no browser): node --test tests/
// Each test names the acceptance scenario (A#) from Requirements.md it covers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, newShift, run, makeStorage } from './load-state.mjs';
import { PERK_PRIORITY } from './bot.mjs';

const fresh = (opts) => {
  const { ns } = loadGame(opts);
  return { ns, State: ns.State, S: ns.S };
};

/** Put a customer straight into the queue and run until they are waiting. */
function addWaiting(ns, s, typeId = 'student', requested = 60) {
  const c = ns.S.makeCustomer(s, typeId, { requestedMinutes: requested });
  c.status = 'waiting';
  c.x = ns.ROOM.queueSlot(0).x;
  c.y = ns.ROOM.queueSlot(0).y;
  c.queueIndex = ns.State.inQueue(s).length;
  s.customers.push(c);
  return c;
}
/** Select customer + duration + PC through the same API the UI uses, then walk them to the seat. */
function seat(ns, s, { type = 'student', requested = 60, minutes = requested, pcId = 1 } = {}) {
  const c = addWaiting(ns, s, type, requested);
  ns.State.select(s, { kind: 'customer', id: c.id });
  assert.ok(ns.State.perform(s, 'duration', c.id, minutes).ok);
  const r = ns.State.select(s, { kind: 'pc', id: pcId });
  assert.ok(r.ok, r.msg);
  for (let i = 0; i < 400 && c.status !== 'playing'; i++) ns.State.update(s, 0.05);
  assert.equal(c.status, 'playing', 'customer should reach the chair and sit');
  return c;
}
/** A shift where random trouble is off, so tests control exactly what happens. */
function calmShift(ns, opts) {
  const s = newShift(ns, opts);
  s.spawnCooldown = 1e9;
  s.eventCooldown = 1e9;
  s.beatPlan = [];
  s.specialAt = [];
  s.inspectionScheduled = 1e9;
  return s;
}
const advance = (ns, s, sec) => run(ns, s, sec);
/** Arrays built inside the vm realm don't deepEqual host arrays; compare plain JSON copies. */
const plain = (x) => JSON.parse(JSON.stringify(x));

/* ---------------------------------------------------------------- A2 start */
test('A2: day 1 starts with RM35, exactly three working PCs, no perks, no auto-assign', () => {
  const { ns, State } = fresh();
  const s = State.create(1);
  assert.equal(s.cash, 3500);
  assert.equal(s.pcs.length, 3);
  assert.equal(s.perks.length, 0);
  assert.ok(s.pcs.every((p) => p.status === 'free' && !p.fault));
  assert.equal('autoDesk' in s, false, 'auto assign must be gone');
  assert.equal(State.calcRevenueGoal(s, 1), 3000);
  assert.equal(ns.CFG.SHIFT, 120, 'a day is two real minutes');
});

test('7.6: targets climb +RM2 a day for the first 20 days, then +RM1 (RM88 on day 40) — whatever the shop looks like', () => {
  const { ns, State } = fresh();
  const s = State.create(1);
  const days = [1, 2, 3, 4, 5, 10, 11, 12, 20, 21, 22, 30];
  assert.deepEqual(plain(days.map((d) => State.calcRevenueGoal(s, d) / 100)), [30, 32, 34, 36, 38, 48, 50, 52, 68, 69, 70, 78]);
  // PC count does not change the numbers; the difficulty preset scales them (whole RM): Senang ×0.8, Susah Sikit Jer ×1, Susah Teruk! ×1.1
  while (s.pcs.length < 6) ns.State.addPc(s);
  const expected = { santai: [24, 26, 27, 38], biasa: [30, 32, 34, 48], mencabar: [33, 35, 37, 53] };
  for (const preset of ['santai', 'biasa', 'mencabar']) {
    s.preset = preset;
    assert.deepEqual(plain([1, 2, 3, 10].map((d) => State.calcRevenueGoal(s, d) / 100)), expected[preset], preset);
  }
});

/* ------------------------------------------------------ A4 customers/queue */
test('A4/A5: customers arrive with a requested duration and patience drains', () => {
  const { ns, State } = fresh();
  const s = newShift(ns, { seed: 3 });
  s.spawnCooldown = 0;
  s.eventCooldown = 1e9;
  s.beatPlan = [];
  advance(ns, s, 8);
  const q = State.inQueue(s);
  assert.ok(q.length >= 1);
  for (const c of q) assert.ok([30, 60, 90].includes(c.requestedMinutes));
  const c = q.find((x) => x.status === 'waiting');
  assert.ok(c, 'someone is waiting');
  const before = c.patience;
  advance(ns, s, 3);
  assert.ok(c.patience < before, 'patience must go down while waiting');
});

test('7.4: patience reaching zero makes the customer leave (and costs reputation)', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  const c = addWaiting(ns, s, 'hot', 60);
  const rep = s.rep;
  c.patience = 0.2;
  advance(ns, s, 1);
  assert.ok(['leaving', 'gone'].includes(c.status) || !s.customers.includes(c));
  assert.ok(s.rep < rep);
  assert.equal(s.shiftStats.walkouts, 1);
});

test('A15/7.4: peak hours increase customer pressure', () => {
  const { ns, S } = fresh();
  const s = newShift(ns, { seed: 9 });
  s.peakActive = false;
  const calmDrain = S.patienceDrain(s);
  const calmEvery = Array.from({ length: 40 }, () => S.spawnInterval(s)).reduce((a, b) => a + b) / 40;
  s.peakActive = true;
  assert.ok(S.patienceDrain(s) > calmDrain * 1.3, 'patience drops faster at peak');
  const peakEvery = Array.from({ length: 40 }, () => S.spawnInterval(s)).reduce((a, b) => a + b) / 40;
  assert.ok(peakEvery < calmEvery * 0.6, 'customers arrive more often at peak');
});

/* ----------------------------------------------- A6–A9 assignment / billing */
test('A6/A7: manual assignment walks the customer to the chair, then they play', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  const c = seat(ns, s, { pcId: 2 });
  const pc = State.byId(s.pcs, 2);
  assert.equal(pc.status, 'busy');
  const chair = ns.ROOM.seatFor(pc);
  assert.ok(Math.hypot(c.x - chair.x, c.y - chair.y) < 0.2, 'sits at the chair, not at the desk');
});

test('A8: the right duration pays the list price (RM1 / RM2 / RM3)', () => {
  const { ns, State } = fresh();
  for (const [minutes, sen] of [[30, 100], [60, 200], [90, 300]]) {
    const s = calmShift(ns);
    seat(ns, s, { requested: minutes, minutes });
    assert.equal(State.breakdown(s).rental, sen, `${minutes} min`);
  }
});

test('A9 (B2 fix): a wrong duration NEVER pays more than the right one, and is penalised', () => {
  const { ns, State } = fresh();
  for (const requested of [30, 60, 90]) {
    const correct = (() => {
      const s = calmShift(ns);
      seat(ns, s, { requested, minutes: requested });
      return State.breakdown(s).rental;
    })();
    for (const chosen of [30, 60, 90].filter((m) => m !== requested)) {
      const s = calmShift(ns);
      const rep = s.rep;
      seat(ns, s, { requested, minutes: chosen });
      const paid = State.breakdown(s).rental;
      assert.ok(paid < correct, `asked ${requested}, gave ${chosen}: paid ${paid} must be < ${correct}`);
      assert.ok(s.rep < rep, 'wrong duration costs reputation');
    }
  }
});

test('A9: a wrong duration cuts the payment by exactly 50% and costs reputation', () => {
  const { ns, State } = fresh();
  // billed on the shorter of (asked, given) at half price, so a wrong pick can never out-earn the right one
  for (const [requested, chosen, expected] of [[60, 30, 50], [60, 90, 100], [90, 60, 100], [30, 90, 50]]) {
    const s = calmShift(ns);
    const rep = s.rep;
    seat(ns, s, { requested, minutes: chosen });
    assert.equal(State.breakdown(s).rental, expected, `asked ${requested}, gave ${chosen}`);
    assert.equal(s.rep, rep + ns.RENTAL.wrongRep, 'reputation drops');
  }
});

test('A9b: session lengths are snappy — 30 min = 10 s, 60 min = 16 s, 90 min = 22 s of real time', () => {
  const { ns, State } = fresh();
  for (const [minutes, seconds] of [[30, 10], [60, 16], [90, 22]]) {
    const s = calmShift(ns);
    const c = seat(ns, s, { requested: minutes, minutes });
    const pc = State.byId(s.pcs, 1);
    const left = pc.occupiedSeconds;
    assert.ok(left <= seconds && left > seconds - 4, `${minutes} min starts at ~${seconds}s (the walk to the chair eats a little): ${left}`);
    advance(ns, s, left - 0.3);
    assert.equal(pc.status, 'busy', 'still playing just before the end');
    advance(ns, s, 0.6);
    assert.equal(pc.status, 'free', `${minutes} min session is over after ~${seconds}s`);
    assert.notEqual(c.status, 'playing');
  }
});

test('Reliability: a customer is never charged twice, an occupied PC cannot be assigned', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  const c = seat(ns, s, { pcId: 1 });
  const paid = State.breakdown(s).rental;
  // same customer again
  s.pendingCustomerId = c.id;
  s.pendingDuration = 60;
  assert.equal(State.assignToPC(s, 1).ok, false, 'PC 1 is occupied');
  assert.equal(State.assignCustomer(s, c, State.byId(s.pcs, 2), 60), null, 'a playing customer cannot be re-assigned');
  assert.equal(State.breakdown(s).rental, paid);
  // recordOnce keeps a double click from charging twice
  assert.ok(ns.S.recordOnce(s, 'k', 'rental', 100, 'x'));
  assert.equal(ns.S.recordOnce(s, 'k', 'rental', 100, 'x'), null);
});

test('Reliability: a stale customer selection is cleared when they walk out', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  const c = addWaiting(ns, s);
  State.select(s, { kind: 'customer', id: c.id });
  c.patience = 0.05;
  advance(ns, s, 1);
  assert.equal(s.pendingCustomerId, null);
});

/* -------------------------------------------------- A10/A11 restart refunds */
test('A10/A11: restarting a PC refunds exactly 25% — cash, net sales and target progress all drop', () => {
  const { ns, State, S } = fresh();
  const s = calmShift(ns);
  seat(ns, s, { requested: 60 }); // RM2.00
  const pc = State.byId(s.pcs, 1);
  const cashBefore = s.cash;
  const netBefore = State.shiftTakings(s);
  State.breakPc(s, pc, null, { kind: 'bsod' });
  assert.equal(State.perform(s, 'restart', 1).ok, true);
  advance(ns, s, 12);
  const b = State.breakdown(s);
  assert.equal(b.refunds, -50, '25% of RM2.00');
  assert.equal(s.cash, cashBefore - 50);
  assert.equal(State.shiftTakings(s), netBefore - 50);
  assert.equal(b.net, b.rental + b.other + b.refunds);
});

test('A11: one incident can never refund twice (restart + auto-restart race, double click)', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  seat(ns, s, { requested: 60 });
  const pc = State.byId(s.pcs, 1);
  State.breakPc(s, pc, null, { kind: 'glitch' });
  State.perform(s, 'restart', 1);
  State.perform(s, 'restart', 1); // duplicate click
  advance(ns, s, 20); // long enough for the auto-restart timer to have fired too
  assert.equal(State.breakdown(s).refunds, -50);
  // a *second* incident with a new customer is a new refund
  seat(ns, s, { requested: 30, pcId: 1 });
  State.breakPc(s, pc, null, { kind: 'bsod' });
  State.perform(s, 'restart', 1);
  advance(ns, s, 8);
  assert.equal(State.breakdown(s).refunds, -50 - 25);
});

test('A11: an unattended software crash auto-restarts with a single 25% refund', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  seat(ns, s, { requested: 90 }); // RM3.00
  State.breakPc(s, State.byId(s.pcs, 1), null, { kind: 'glitch' });
  advance(ns, s, 16);
  assert.equal(State.breakdown(s).refunds, -75);
  assert.equal(State.byId(s.pcs, 1).fault, null);
});

/* ---------------------------------------------------------- PC fault kinds */
test('Phase 8: every fault kind has its own fix and its own consequence', () => {
  const { ns, State } = fresh();
  const need = {
    freeze: 'restart', bsod: 'restart', glitch: 'restart', overheat: 'cool', noconn: 'reset', hardware: 'repair',
  };
  for (const [kind, fix] of Object.entries(need)) {
    const s = calmShift(ns);
    seat(ns, s, { requested: 60 });
    State.breakPc(s, State.byId(s.pcs, 1), null, { kind });
    const acts = State.options(s, { kind: 'pc', id: 1 }).map((o) => o.act);
    assert.ok(acts.includes(fix), `${kind} offers ${fix}: ${acts}`);
  }
});

test('Phase 8: cooling / resetting keeps the customer and charges nothing; repair costs money and time', () => {
  const { ns, State } = fresh();
  for (const [kind, fix] of [['overheat', 'cool'], ['noconn', 'reset']]) {
    const s = calmShift(ns);
    const c = seat(ns, s, { requested: 90 });
    State.breakPc(s, State.byId(s.pcs, 1), null, { kind });
    State.perform(s, fix, 1);
    advance(ns, s, 10);
    assert.equal(State.byId(s.pcs, 1).fault, null);
    assert.equal(c.status, 'playing', 'customer stays');
    assert.equal(State.breakdown(s).refunds, 0);
  }
  const s = calmShift(ns);
  seat(ns, s, { requested: 60 });
  State.breakPc(s, State.byId(s.pcs, 1), null, { kind: 'hardware' });
  const cash = s.cash;
  State.perform(s, 'repair', 1);
  advance(ns, s, 5);
  assert.equal(State.byId(s.pcs, 1).status, 'job', 'PC is unavailable while being repaired');
  assert.equal(State.perform(s, 'duration', 99, 30).ok, false);
  assert.ok(s.cash < cash, 'repair costs money');
  advance(ns, s, 20);
  assert.equal(State.byId(s.pcs, 1).status, 'free');
});

test('Crash refund rule: every crash that ends a paid session refunds exactly 25% — once per incident', () => {
  const { ns, State } = fresh();
  const cases = [
    ['restart (software crash)', 'glitch', (s) => State.perform(s, 'restart', 1), 1],
    ['repair under a customer', 'hardware', (s) => State.perform(s, 'repair', 1), 1],
    ['BSOD left alone (customer quits)', 'bsod', () => {}, 20],
    ['no internet left alone', 'noconn', () => {}, 20],
    ['overheating left alone', 'overheat', () => {}, 20],
    ['software crash left alone (auto-restart)', 'glitch', () => {}, 20],
  ];
  for (const [name, kind, act, wait] of cases) {
    const s = calmShift(ns);
    seat(ns, s, { requested: 90, minutes: 90 }); // paid RM3.00
    const cash = s.cash;
    const net = State.breakdown(s).net;
    State.breakPc(s, State.byId(s.pcs, 1), null, { kind });
    act(s);
    act(s); // a double click must not refund twice
    advance(ns, s, wait + 5);
    const b = State.breakdown(s);
    assert.equal(b.refunds, -75, `${name}: 25% of RM3.00`);
    assert.equal(s.cash + b.expenses, cash - 75, `${name}: cash drops by the refund (a repair bill is belanja, not a refund)`);
    assert.equal(b.net, net - 75, `${name}: net sales / target progress drop by the same amount`);
    assert.equal(State.audit(s).ok, true, `${name}: books reconcile`);
  }
});

test('Phase 8: a frozen screen thaws by itself without a refund; overheating left alone burns the PC', () => {
  const { ns, State } = fresh();
  let s = calmShift(ns);
  const c = seat(ns, s, { requested: 90 });
  State.breakPc(s, State.byId(s.pcs, 1), null, { kind: 'freeze' });
  advance(ns, s, 10);
  assert.equal(State.byId(s.pcs, 1).fault, null);
  assert.equal(State.breakdown(s).refunds, 0);
  assert.equal(c.status, 'playing');
  s = calmShift(ns);
  seat(ns, s, { requested: 90 });
  State.breakPc(s, State.byId(s.pcs, 1), null, { kind: 'overheat' });
  advance(ns, s, 16);
  assert.equal(State.byId(s.pcs, 1).fault, 'hardware');
});

/* ---------------------------------------------- A12/A13 suspicious customers */
test('Phase 6/9: a suspicious PC offers a soft and a harsh option — and never reveals guilt', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  seat(ns, s, { requested: 60 });
  assert.ok(State.makeIncident(s, 'suspicious', State.byId(s.pcs, 1), false));
  const opts = State.options(s, { kind: 'pc', id: 1 });
  assert.deepEqual(plain(opts.map((o) => o.act)), ['soft', 'harsh']);
  assert.ok(!JSON.stringify(opts).includes('guilty'), 'options leak nothing');
  const shown = State.options(s, { kind: 'pc', id: 1 }).map((o) => o.sub).join(' ');
  assert.ok(!/ bersalah!|terbukti/i.test(shown));
});

for (const [action, repHit, proHit, refundPct] of [['soft', -2, -3, 25], ['harsh', -7, -9, 50]]) {
  test(`A12/A13 (B1 fix): falsely accusing (${action}) hits reputation/professionalism ONCE and refunds ${refundPct}%`, () => {
    const { ns, State } = fresh();
    const s = calmShift(ns);
    const c = seat(ns, s, { requested: 60 }); // RM2.00
    State.makeIncident(s, 'suspicious', State.byId(s.pcs, 1), false);
    const rep = s.rep, pro = s.professionalism;
    assert.ok(State.perform(s, action, 1).ok);
    advance(ns, s, 8);
    assert.equal(s.rep, rep + repHit, 'reputation');
    assert.equal(s.professionalism, pro + proHit, 'professionalism');
    assert.equal(State.breakdown(s).refunds, -200 * refundPct / 100, 'revenue refunded');
    assert.ok(['leaving', 'gone'].includes(c.status) || !s.customers.includes(c), 'customer leaves upset');
    assert.equal(s.shiftStats.falseAccusations, 1);
  });
}

test('Phase 9: a guilty customer is warned (soft) or removed (harsh) and the shop gets safer', () => {
  const { ns, State } = fresh();
  for (const [action, stays] of [['soft', true], ['harsh', false]]) {
    const s = calmShift(ns);
    const c = seat(ns, s, { requested: 60 });
    State.makeIncident(s, 'suspicious', State.byId(s.pcs, 1), true);
    const compliance = s.compliance, risk = s.risk;
    State.perform(s, action, 1);
    advance(ns, s, 8);
    assert.ok(s.compliance > compliance && s.risk < risk);
    assert.equal(c.status === 'playing', stays);
    assert.equal(State.breakdown(s).refunds, 0);
  }
});

test('Phase 9: an unattended guilty customer raises risk and compliance falls', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  seat(ns, s, { requested: 90 });
  State.makeIncident(s, 'suspicious', State.byId(s.pcs, 1), true);
  const risk = s.risk;
  advance(ns, s, 20);
  assert.ok(s.risk > risk);
  assert.ok(s.violationLog.length >= 1);
});

/* ---------------------------------------------------------- other incidents */
test('Phase 6: loud video → warn / ignore; ignoring shortens the timer and then costs reputation', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  seat(ns, s, { requested: 90 });
  State.makeIncident(s, 'loudvideo', State.byId(s.pcs, 1));
  assert.deepEqual(plain(State.options(s, { kind: 'pc', id: 1 }).map((o) => o.act)), ['warn', 'ignore']);
  const other = seat(ns, s, { requested: 90, pcId: 2 });
  advance(ns, s, 0.2);
  assert.equal(other.act, 'annoyed', 'neighbours look annoyed');
  State.perform(s, 'ignore', 1);
  const rep = s.rep;
  advance(ns, s, 9);
  assert.ok(s.rep < rep);
});

test('Phase 11: a customer fight involves TWO customers who stand up and can be calmed', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  const a = seat(ns, s, { requested: 90, pcId: 1 });
  const b = seat(ns, s, { requested: 90, pcId: 3 });
  assert.ok(State.makeIncident(s, 'fight', State.byId(s.pcs, 1)));
  assert.equal(a.status, 'arguing');
  assert.equal(b.status, 'arguing');
  advance(ns, s, 2.5);
  assert.ok(a.sitBlend < 0.2 && b.sitBlend < 0.2, 'both stand');
  assert.equal(State.byId(s.pcs, 3).issue, 'fight');
  State.perform(s, 'calm', 3); // either PC works
  advance(ns, s, 12);
  assert.equal(a.status, 'playing');
  assert.equal(b.status, 'playing');
  assert.equal(State.byId(s.pcs, 1).issue, null);
});

test('Phase 11: missing mouse makes the PC unusable until found or replaced', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  seat(ns, s, { requested: 90 });
  const secs = () => State.byId(s.pcs, 1).occupiedSeconds;
  State.makeIncident(s, 'nomouse', State.byId(s.pcs, 1));
  const t = secs();
  advance(ns, s, 3);
  assert.equal(secs(), t, 'session clock stops without a mouse');
  State.perform(s, 'replace', 1);
  advance(ns, s, 6);
  assert.equal(State.byId(s.pcs, 1).issue, null);
  assert.ok(State.breakdown(s).expenses >= 500);
});

/* ------------------------------------------------------------- A14 officer */
test('A14: the officer enters, walks to PCs, examines them and leaves with a verdict', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns, { seed: 21 });
  seat(ns, s, { requested: 90, pcId: 1 });
  seat(ns, s, { requested: 90, pcId: 2 });
  State.startOfficer(s);
  const npc = State.byId(s.customers, State.OFFICER_ID);
  assert.ok(npc);
  const startPos = { x: npc.x, y: npc.y };
  const visited = new Set();
  let moved = 0;
  let left = false;
  for (let i = 0; i < 4000 && s.phase === 'active'; i++) {
    State.update(s, 0.05);
    const o = s.officer;
    if (o?.stage === 'scan' && o.hold > 0) visited.add(o.visits[o.scanIndex]);
    if (npc.destination || npc.moveIntensity > 0.1) moved += 0.05;
    if (!s.officer) {
      left = true;
      break;
    }
  }
  assert.ok(left, 'officer finished and left');
  assert.ok(moved > 3, 'actually walked');
  assert.ok(visited.size >= 2, `inspected several PCs (${[...visited]})`);
  assert.ok(!State.byId(s.customers, State.OFFICER_ID));
  assert.ok(s.lastInspection && Number.isFinite(s.lastInspection.score));
  assert.ok(startPos);
});

test('Phase 10: the verdict depends on the shop\'s state, not a dice roll', () => {
  const { ns, State } = fresh();
  const score = (mutate) => {
    const s = calmShift(ns, { seed: 5 });
    mutate(s);
    return State.scoreOf(s, { flags: 0, attitude: 0 });
  };
  const clean = score((s) => Object.assign(s, { compliance: 90, professionalism: 90, risk: 10 }));
  const messy = score((s) => Object.assign(s, { compliance: 40, professionalism: 40, risk: 80, violationLog: ['x', 'y'] }));
  assert.ok(messy > clean + 40, `messy ${messy} vs clean ${clean}`);
  // identical shop → identical score every time
  assert.equal(score((s) => (s.compliance = 70)), score((s) => (s.compliance = 70)));
  // repeated offences keep risk high
  const s = calmShift(ns);
  Object.assign(s, { violationLog: ['a', 'b', 'c'], risk: 60 });
  State.inspection(s, { flags: 2, attitude: 0 });
  assert.ok(s.risk >= 40 && s.repeatOffences === 1);
});

test('Phase 10: inspection timing differs between days', () => {
  const { ns, State } = fresh();
  const times = new Set();
  for (let seed = 1; seed <= 8; seed++) {
    const s = newShift(ns, { seed: seed * 101 });
    times.add(s.inspectionScheduled);
  }
  assert.ok(times.size > 4);
});

/* ---------------------------------------------------------- A16 special events */
test('A16: every special event exists physically and can be resolved through Abang\'s Desk', () => {
  const { ns, State } = fresh();
  for (const id of Object.keys(ns.EVENTS).filter((x) => x !== 'raid')) {
    const s = calmShift(ns, { day: 4 });
    s.perks.push('snack');
    s.elapsed = 5; // school hours
    const ev = State.startEvent(s, id);
    assert.ok(ev, `${id} starts`);
    const opts = State.options(s, { kind: 'event', id: ev.id });
    assert.ok(opts.length >= 2, `${id} has choices`);
    if (ev.kind === 'npc') assert.ok(ev.npcIds.length >= 1 && ev.npcIds.every((nid) => State.byId(s.customers, nid)), `${id} has visible people`);
    if (id === 'blackout') assert.ok(s.powerOutage > 0);
    for (const o of opts) {
      const s2 = calmShift(ns, { day: 4 });
      s2.perks.push('snack');
      s2.elapsed = 5;
      s2.cash = 5000;
      const e2 = State.startEvent(s2, id);
      assert.ok(State.perform(s2, 'event', e2.id, o.choice).ok, `${id}/${o.choice}`);
      advance(ns, s2, 14);
      assert.equal(State.eventById(s2, e2.id), undefined, `${id}/${o.choice} resolved`);
    }
  }
});

test('A16: events fire only under the right conditions (snack theft needs the Snack Machine, truancy only in school hours)', () => {
  const { ns, State } = fresh();
  let s = calmShift(ns, { day: 4 });
  assert.equal(State.startEvent(s, 'snacktheft'), false, 'no snack machine, no snack theft');
  s.perks.push('snack');
  assert.ok(State.startEvent(s, 'snacktheft'));
  s = calmShift(ns, { day: 4 });
  s.elapsed = 5;
  assert.ok(State.canStartEvent(s, 'truancy'), 'school hours');
  s.elapsed = 80;
  assert.equal(State.canStartEvent(s, 'truancy'), false, 'after school');
});

test('Phase 11: unanswered events fall back to their default consequence (no silent stalls)', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns, { day: 4 });
  const ev = State.startEvent(s, 'spill');
  const pc = State.byId(s.pcs, ev.data.pcId);
  advance(ns, s, 20);
  assert.equal(State.eventById(s, ev.id), undefined);
  assert.ok(pc.fault, 'ignored spill damaged the PC next to it');
});

test('Phase 11: blackout stops billing, dims, blocks assignment, then restores', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  seat(ns, s, { requested: 90 });
  const ev = State.startEvent(s, 'blackout');
  const t = State.byId(s.pcs, 1).occupiedSeconds;
  advance(ns, s, 2);
  assert.equal(State.byId(s.pcs, 1).occupiedSeconds, t, 'rentals interrupted');
  const c = addWaiting(ns, s);
  State.select(s, { kind: 'customer', id: c.id });
  State.perform(s, 'duration', c.id, 60);
  assert.equal(State.select(s, { kind: 'pc', id: 2 }).ok, false, 'no new rentals in the dark');
  State.perform(s, 'event', ev.id, 'fuse');
  advance(ns, s, 12);
  assert.equal(s.powerOutage, 0);
});

/* ------------------------------------------------------------ A17 retry day */
test('A17/7.7: failing a day allows retrying the SAME day from the start-of-day checkpoint', () => {
  const { ns, State } = fresh();
  const s = newShift(ns, { seed: 77 });
  const cashAtStart = s.cash;
  s.spawnCooldown = 1e9; // nobody comes → guaranteed failure
  s.eventCooldown = 1e9;
  advance(ns, s, 130);
  assert.equal(s.phase, 'result');
  assert.equal(s.dayFailed, true);
  const r = s.lastReport;
  assert.equal(r.goalMet, false);
  assert.equal(r.shortfall, r.goal, 'shortfall is explained');
  assert.ok(r.reasons.length >= 1);
  const retry = State.retryDay(s);
  assert.equal(retry.day, 1);
  assert.equal(retry.phase, 'prep');
  assert.equal(retry.cash, cashAtStart, 'cash restored to the start of the day');
  assert.ok(retry.reports.length === s.reports.length - 0 || retry.reports.length <= s.reports.length);
});

test('7.7: retrying keeps previously completed days and perks', () => {
  const { ns, State } = fresh();
  let s = newShift(ns, { seed: 31 });
  s.spawnCooldown = 1e9; s.eventCooldown = 1e9; s.beatPlan = [];
  s.dayGoal = 1; // trivially met
  s.shiftLedger.push({ id: 1, kind: 'rental', cat: 'rental', amount: 99999, label: 'cheat' });
  advance(ns, s, 130);
  assert.equal(s.dayFailed, false);
  State.proceed(s); // day 2
  State.draftPerks(s);
  s.cash = 20000;
  State.buyPerk(s, s.perkDraft[0]);
  const perksBought = [...s.perks];
  State.startShift(s);
  s.spawnCooldown = 1e9; s.eventCooldown = 1e9;
  advance(ns, s, 130);
  if (!s.dayFailed) s.dayFailed = true, s.lastReport.goalMet = false;
  const retry = State.retryDay(s);
  assert.equal(retry.day, 2);
  assert.deepEqual(plain(retry.perks), perksBought);
  assert.equal(retry.reports.length, 1, 'day 1 stays completed');
});

/* ------------------------------------------------------------- A18/A19 perks */
test('A18/12: day 2 offers two different perks; only ONE can be bought; unaffordable-only is avoided', () => {
  const { ns, State } = fresh();
  for (let seed = 1; seed <= 30; seed++) {
    const s = State.create(seed * 13);
    s.day = 2;
    s.phase = 'prep';
    s.cash = seed % 3 === 0 ? 1600 : 6000; // sometimes nearly broke (RM16 — can only just afford the cheapest card)
    State.draftPerks(s);
    assert.equal(s.perkDraft.length, 2, 'two cards');
    assert.notEqual(s.perkDraft[0], s.perkDraft[1]);
    const prices = s.perkDraft.map((id) => State.perkDef(id).price);
    assert.ok(prices.some((p) => p <= s.cash), `seed ${seed}: at least one affordable card (${s.perkDraft}, cash ${s.cash})`);
  }
  // completely broke (RM8): nothing is affordable, so the family loan must open the door
  const broke = State.create(3);
  broke.day = 2; broke.phase = 'prep'; broke.cash = 800;
  State.draftPerks(broke);
  assert.ok(State.loan(broke), 'the loan is on offer when cash is low');
  assert.ok(broke.perkDraft.some((id) => State.perkDef(id).price <= broke.cash), 'after the loan something is affordable');
  const s = State.create(5);
  s.day = 2; s.phase = 'prep'; s.cash = 20000;
  State.draftPerks(s);
  const [a, b] = s.perkDraft;
  assert.ok(State.buyPerk(s, a).ok);
  assert.equal(State.buyPerk(s, b).ok, false, 'only one per day');
});

test('A18: the draft is randomised across seeds and weighted', () => {
  const { ns, State } = fresh();
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const s = State.create(seed * 997);
    s.day = 3; s.phase = 'prep'; s.cash = 20000;
    State.draftPerks(s);
    seen.add(s.perkDraft.join('+'));
  }
  assert.ok(seen.size > 6);
});

test('12: unselected perks return after a short cooldown, the selected one after a longer one (and respects max count)', () => {
  const { ns, State } = fresh();
  const s = State.create(11);
  s.day = 2; s.phase = 'prep'; s.cash = 20000;
  const [taken, left] = ['spares', 'filter'];
  s.perkDraft = [taken, left]; s.perkChoiceMade = false;
  State.buyPerk(s, taken);
  const takenCd = s.perkCooldowns[taken] - s.day;
  const leftCd = s.perkCooldowns[left] - s.day;
  assert.ok(leftCd >= 2 && leftCd <= 4, `short cooldown ${leftCd}`);
  assert.ok(takenCd >= 6 && takenCd <= 9, `long cooldown ${takenCd}`);
  const single = State.create(3);
  single.perks.push('snack');
  assert.equal(State.eligiblePerks(single).some((p) => p.id === 'snack'), false, 'maxed-out perks never reappear');
});

test('A19: perks change gameplay — Add PC adds a desk, Aircond calms customers, Router adds bandwidth, CCTV gives hints', () => {
  const { ns, State, S } = fresh();
  let s = State.create(1); s.day = 2; s.phase = 'prep'; s.cash = 99999;
  const pcs = s.pcs.length;
  s.perkDraft = ['add_pc']; State.buyPerk(s, 'add_pc');
  assert.equal(s.pcs.length, pcs + 1);
  assert.ok(State.monthlyBills(s).electric > ns.CFG.COSTS.electric, 'more PCs → higher monthly electricity');
  s = State.create(1); s.phase = 'prep'; s.cash = 99999; s.day = 3;
  const drain = S.patienceDrain(s), bw = S.capBandwidth(s), upkeep = State.perkUpkeep(s);
  s.perkDraft = ['aircond']; State.buyPerk(s, 'aircond');
  assert.ok(S.patienceDrain(s) < drain, 'aircond: calmer');
  assert.ok(State.perkUpkeep(s) > upkeep, 'aircond: running cost (downside)');
  s.perkChoiceMade = false; s.perkDraft = ['router']; State.buyPerk(s, 'router');
  assert.equal(S.capBandwidth(s), bw + 3);
  s.perkChoiceMade = false; s.perkDraft = ['cctv']; State.buyPerk(s, 'cctv');
  const s2 = calmShift(ns, { day: 4 });
  s2.perks.push('cctv');
  seat(ns, s2, { requested: 60 });
  State.makeIncident(s2, 'suspicious', State.byId(s2.pcs, 1));
  assert.ok('cctvHint' in s2.activeIssues[0], 'CCTV provides a hint');
});

test('12: every perk has a real downside (upkeep or behaviour change) — none is a free lunch', () => {
  const { ns } = fresh();
  for (const p of ns.PERKS) assert.ok(p.downside && (p.upkeep > 0 || ['add_pc', 'poster'].includes(p.id) || p.downside.length > 10), p.id);
});

/* --------------------------------------------------------- A20 save / load */
test('A20: save → refresh → load restores the run; a corrupt save falls back to the backup', () => {
  const storage = makeStorage();
  let { ns, State } = fresh({ storage });
  const s = newShift(ns, { seed: 2 });
  s.spawnCooldown = 0;
  advance(ns, s, 20);
  s.cash += 123;
  const id = State.createSave(s);
  assert.ok(id);
  State.save(s); // second write moves the first to the backup slot
  // "refresh the browser": brand-new game instance, same storage
  ({ ns, State } = fresh({ storage }));
  const loaded = State.getSaved();
  assert.ok(loaded);
  assert.equal(loaded.cash, s.cash);
  assert.equal(loaded.day, s.day);
  assert.equal(loaded.phase, 'paused', 'a mid-shift save resumes paused');
  // corrupt the main slot
  const key = ns.CFG.SAVE_PREFIX + id;
  storage.setItem(key, storage.getItem(key).slice(0, 200));
  ({ ns, State } = fresh({ storage }));
  const fallback = State.getSaved();
  assert.ok(fallback, 'falls back to the backup');
  assert.equal(fallback.day, s.day);
});

/** Run `fn` with Date.now() under our control, so saves written "one minute apart" really are, whatever the speed of the test. */
function withClock(start, fn) {
  const real = Date.now;
  let now = start;
  Date.now = () => now;
  try {
    return fn((ms) => { now += ms; });
  } finally {
    Date.now = real;
  }
}

test('Saves: every New Game is its own save with its own difficulty; Continue opens the one written last', () => {
  const storage = makeStorage();
  withClock(1_700_000_000_000, (tick) => {
    let { ns, State } = fresh({ storage });
    assert.equal(State.getSaved(), null, 'nothing yet');
    assert.equal(State.save(State.create(1)), false, 'a fresh game with no save writes nothing');
    assert.equal(State.saveCount(), 0);

    const a = State.create(1, 'santai'); a.day = 3;
    const idA = State.createSave(a);
    tick(60_000);
    const b = State.create(2, 'mencabar'); b.day = 7; b.cash = 4242;
    const idB = State.createSave(b);
    tick(60_000);
    const c = State.create(3); c.day = 5;
    const idC = State.createSave(c);
    assert.equal(new Set([idA, idB, idC]).size, 3, 'three different saves');
    assert.equal(State.saveCount(), 3);

    // "refresh": Continue is the newest, and every save keeps its own difficulty and progress
    ({ ns, State } = fresh({ storage }));
    const list = State.listSaves();
    assert.deepEqual(plain(list.map((x) => [x.id, x.preset, x.day])), [[idC, 'biasa', 5], [idB, 'mencabar', 7], [idA, 'santai', 3]]);
    const cont = State.getSaved();
    assert.equal(cont.day, 5);
    assert.equal(cont.preset, 'biasa');
    assert.equal(State.activeSaveId(), idC);

    // opening another save makes it the active one; writes go only to it
    tick(60_000);
    const loaded = State.loadSave(idB);
    assert.equal(loaded.preset, 'mencabar');
    assert.equal(loaded.cash, 4242);
    loaded.cash += 100;
    State.save(loaded);
    assert.equal(State.listSaves()[0].id, idB, 'the save just written is now the newest');
    assert.equal(State.loadSave(idC).day, 5, 'the others are untouched');
    assert.equal(State.loadSave(idA).preset, 'santai');
    assert.equal(State.loadSave('nosuchid'), null);
  });
});

test('Saves: at most CFG.MAX_SAVES; deleting one frees a place and takes its backup with it; the others are untouched', () => {
  const storage = makeStorage();
  withClock(1_700_000_000_000, (tick) => {
    const { ns, State } = fresh({ storage });
    const ids = [];
    for (let i = 0; i < ns.CFG.MAX_SAVES; i++) {
      tick(1000);
      const s = State.create(i + 1); s.day = i + 1;
      ids.push(State.createSave(s));
      State.save(s); // a second write, so a backup exists
    }
    assert.equal(State.createSave(State.create(99)), null, 'no sixth save');
    assert.equal(State.saveCount(), ns.CFG.MAX_SAVES);
    const bak = ns.CFG.SAVE_PREFIX + ids[2] + ns.CFG.SAVE_BAK_SUFFIX;
    assert.ok(storage.getItem(bak), 'the backup exists');

    assert.equal(State.deleteSave(ids[2]), true);
    assert.equal(storage.getItem(bak), null, 'the backup goes too');
    assert.equal(storage.getItem(ns.CFG.SAVE_PREFIX + ids[2]), null);
    assert.equal(State.saveCount(), ns.CFG.MAX_SAVES - 1);
    assert.ok(State.createSave(State.create(100)), 'a place is free again');
    assert.deepEqual(plain(State.listSaves().map((x) => x.day).sort()), [1, 1, 2, 4, 5], 'the other four are intact, plus the new one');
    assert.equal(State.deleteSave('../meta'), false, 'only well-formed ids are accepted');
    assert.ok(State.deleteSave(State.activeSaveId()) && State.activeSaveId() === null, 'deleting the active save leaves none active');
  });
});

test('Saves: a damaged save falls back to its own backup, and one that is damaged twice is skipped without hiding the others', () => {
  const storage = makeStorage();
  withClock(1_700_000_000_000, (tick) => {
    let { ns, State } = fresh({ storage });
    const mk = (day) => { tick(1000); const s = State.create(day); s.day = day; const id = State.createSave(s); State.save(s); return id; };
    const idA = mk(2), idB = mk(4), idC = mk(6);
    const cut = (id, suffix = '') => storage.setItem(ns.CFG.SAVE_PREFIX + id + suffix, storage.getItem(ns.CFG.SAVE_PREFIX + id + suffix).slice(0, 80));
    cut(idB);
    cut(idC); cut(idC, ns.CFG.SAVE_BAK_SUFFIX);
    ({ ns, State } = fresh({ storage }));
    assert.deepEqual(plain(State.listSaves().map((x) => x.id)), [idB, idA], 'C is unreadable; B was recovered from its backup');
    assert.equal(State.getSaved().day, 4, 'Continue skips the unreadable save');
  });
});

test('Saves: the old single save is copied in once, never again, and the old keys stay as a safety net', () => {
  const storage = makeStorage();
  let { ns, State } = fresh({ storage });
  const old = State.create(9); old.day = 8; old.cash = 1234; old.phase = 'prep';
  const env = (s) => JSON.stringify({ v: 12, t: 1_650_000_000_000, sum: State.checksum(JSON.stringify(s)), s: JSON.stringify(s) });
  storage.setItem(ns.CFG.SAVE, env(old));
  const first = State.getSaved();
  assert.equal(first.day, 8);
  assert.equal(State.saveCount(), 1);
  assert.equal(State.saveInfo().at, 1_650_000_000_000, 'it keeps the time it was last written');
  assert.ok(storage.getItem(ns.CFG.SAVE), 'the old key is still there');

  // delete it, and the next page load must not bring it back
  State.deleteSave(State.activeSaveId());
  ({ ns, State } = fresh({ storage }));
  assert.equal(State.getSaved(), null);
  assert.equal(State.saveCount(), 0);
});

test('Difficulty: Senang Sunggoh / Susah Sikit Jer / Susah Teruk! is chosen when a run is created, travels with the save, and an unknown name falls back to Susah Sikit Jer', () => {
  const { ns, State, S } = fresh();
  const P = ns.DIRECTOR.presets;
  assert.deepEqual(plain(['santai', 'biasa', 'mencabar'].map((k) => P[k].label)), ['Senang Sunggoh', 'Susah Sikit Jer', 'Susah Teruk!']);
  assert.equal(State.create(1, 'mencabar').preset, 'mencabar');
  assert.equal(State.create(1).preset, 'biasa');
  assert.equal(State.create(1, 'impossible').preset, 'biasa');

  // each step up is harder in every way a preset can touch
  const [easy, mid, hard] = ['santai', 'biasa', 'mencabar'].map((k) => { const s = State.create(1, k); s.day = 10; return s; });
  const pc = hard.pcs[0]; pc.health = 10;
  for (const [lo, hi] of [[easy, mid], [mid, hard]]) {
    assert.ok(S.pressure(lo) < S.pressure(hi), 'more customers');
    assert.ok(S.patienceDrain(lo) < S.patienceDrain(hi), 'they lose patience faster');
    assert.ok(S.troubleInterval(lo) > S.troubleInterval(hi), 'trouble comes more often');
    assert.ok(S.faultChance(lo, pc) < S.faultChance(hi, pc), 'PCs hang more often');
    assert.ok(State.calcRevenueGoal(lo, 10) < State.calcRevenueGoal(hi, 10), 'the daily target is higher');
  }

  // it survives a save and a reload, and a save from before presets existed is Susah Sikit Jer
  const storage = makeStorage();
  const g = fresh({ storage });
  const s = g.State.create(5, 'santai');
  g.State.createSave(s);
  assert.equal(fresh({ storage }).State.getSaved().preset, 'santai');
  const legacy = plain(g.State.create(6)); delete legacy.preset;
  assert.equal(g.State.migrate(legacy).preset, 'biasa');
});

test('Export / import: a save travels as a file into another browser, keeps its level, progress and time, and never takes over Sambung Main', () => {
  withClock(1_700_000_000_000, (tick) => {
    const a = fresh({ storage: makeStorage() });
    const s = a.State.create(7, 'mencabar'); s.day = 9; s.cash = 5150; s.rep = 71;
    const id = a.State.createSave(s);
    tick(5000);
    const file = a.State.exportSave(id);
    assert.ok(file && typeof file.text === 'string');
    assert.equal(file.summary.preset, 'mencabar');
    assert.equal(a.State.exportSave('nosuchid'), null);
    assert.equal(a.State.exportSave('../x'), null);

    // another browser (empty storage) that already has its own, newer save
    const b = fresh({ storage: makeStorage() });
    tick(60_000);
    const own = b.State.create(1); own.day = 2;
    const ownId = b.State.createSave(own);
    tick(60_000);
    const r = b.State.importSave(file.text);
    assert.equal(r.ok, true);
    assert.equal(b.State.saveCount(), 2);
    assert.equal(b.State.activeSaveId(), ownId, 'importing does not switch to the imported save');
    assert.equal(b.State.getSaved().day, 2, 'Sambung Main is still the save that was played last');
    const got = b.State.loadSave(r.id);
    assert.equal(got.preset, 'mencabar');
    assert.equal(got.day, 9);
    assert.equal(got.cash, 5150);
    assert.equal(got.rep, 71);
    assert.equal(r.summary.t, 1_700_000_000_000, 'it keeps the time it was last played');

    // the same file again is not added twice
    assert.deepEqual(plain(b.State.importSave(file.text)), { ok: false, error: 'duplicate' });
    assert.equal(b.State.saveCount(), 2);
  });
});

test('Export / import: files that are not a save, were edited, or come from a newer game are refused and nothing is added', () => {
  const { ns, State } = fresh();
  const s = State.create(3); s.day = 4;
  const file = JSON.parse((State.createSave(s), State.exportSave(State.activeSaveId())).text);
  const bad = (text) => State.importSave(text);
  assert.equal(bad('hello').error, 'notsave');
  assert.equal(bad('{"a":1}').error, 'notsave');
  assert.equal(bad('[1,2,3]').error, 'notsave');
  assert.equal(bad(JSON.stringify({ ...file, game: 'another-game' })).error, 'notsave');
  assert.equal(bad(JSON.stringify({ ...file, s: file.s.replace('"day":4', '"day":40') })).error, 'damaged', 'the checksum catches a hand edit');
  assert.equal(bad(JSON.stringify({ ...file, s: 'not json', sum: State.checksum('not json') })).error, 'damaged');
  const notState = JSON.stringify({ x: 1 });
  assert.equal(bad(JSON.stringify({ ...file, s: notState, sum: State.checksum(notState) })).error, 'damaged', 'valid JSON that is not a game');
  assert.equal(bad(JSON.stringify({ ...file, v: ns.CFG.VERSION + 1 })).error, 'newer');
  assert.equal(bad('x'.repeat(2_000_001)).error, 'toobig');
  assert.equal(bad(null).error, 'toobig');
  assert.equal(State.saveCount(), 1, 'nothing was added');
});

test('Export / import: a full list refuses another import; a "__proto__" key in a file cannot change what a loaded save is made of', () => {
  const storage = makeStorage();
  const { ns, State } = fresh({ storage });
  const donor = State.create(2); donor.day = 6;
  State.createSave(donor);
  const file = State.exportSave(State.activeSaveId()).text;
  State.deleteSave(State.activeSaveId());
  for (let i = 0; i < ns.CFG.MAX_SAVES; i++) State.createSave(State.create(i + 1));
  assert.deepEqual(plain(State.importSave(file)), { ok: false, error: 'full' });
  assert.equal(State.saveCount(), ns.CFG.MAX_SAVES);

  // a poisoned file: its checksum is right (the attacker made it), but it carries "__proto__"
  const inner = '{"pcs":[{"id":1,"__proto__":{"polluted":true}},{"id":2},{"id":3}],"day":3,"cash":100,"__proto__":{"isAdmin":true},"perks":[]}';
  State.deleteSave(State.listSaves()[0].id);
  const r = State.importSave(JSON.stringify({ game: 'abangcc2007', v: ns.CFG.VERSION, t: 1, sum: State.checksum(inner), s: inner }));
  assert.equal(r.ok, true);
  const loaded = State.loadSave(r.id);
  assert.equal(loaded.day, 3);
  assert.equal(loaded.isAdmin, undefined, 'the prototype was not replaced');
  assert.equal(({}).polluted, undefined);
  assert.equal(loaded.pcs[0].polluted, undefined);

  // the same poisoned text put straight into the browser's storage (no import in between) is read the same safe way
  storage.setItem(`${ns.CFG.SAVE_PREFIX}poison01`, JSON.stringify({ v: ns.CFG.VERSION, t: 1, sum: State.checksum(inner), s: inner }));
  const direct = State.loadSave('poison01');
  assert.equal(direct.day, 3);
  assert.equal(direct.isAdmin, undefined, 'the prototype was not replaced');
  assert.equal(direct.pcs[0].polluted, undefined);
});

test('B8: older (v11-style) saves are migrated, never discarded', () => {
  const storage = makeStorage();
  const { ns, State } = fresh({ storage });
  const old = State.create(4);
  old.version = 11; old.day = 5; old.cash = 7777; old.phase = 'prep'; old.upgrades = ['router2']; old.autoDesk = false;
  old.pcs.forEach((p) => { p.installed = ['puzzle']; p.storage = 10; });
  storage.setItem(ns.CFG.SAVE_V11, JSON.stringify(old));
  const s = State.getSaved();
  assert.ok(s);
  assert.equal(s.day, 5);
  assert.equal(s.cash, 7777);
  assert.equal('upgrades' in s, false);
  assert.equal(s.version, ns.CFG.VERSION);
  assert.equal('installed' in s.pcs[0], false);
  assert.equal(State.saveCount(), 1, 'the old save became the first save in the list');
  assert.ok(storage.getItem(ns.CFG.SAVE_V11), 'the old key is left in place');
});

/* ---------------------------------------------------- 7.5 bookkeeping, end of day */
test('7.5: bookkeeping — rental / other / refunds / expenses reconcile with the cash balance', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  const start = s.cash;
  seat(ns, s, { requested: 60 });
  State.record(s, 'snack', 80, 'snack');
  State.record(s, 'refund', -30, 'refund');
  State.record(s, 'repair', -2000, 'repair');
  const b = State.breakdown(s);
  assert.equal(b.rental, 200);
  assert.equal(b.other, 80);
  assert.equal(b.refunds, -30);
  assert.equal(b.expenses, 2000, 'a repair is an expense, not a refund');
  assert.equal(b.net, 250, 'target progress = sales minus refunds only');
  assert.equal(s.cash, start + b.rental + b.other + b.refunds - b.expenses, 'every sen accounted for');
});

test('7.5: no rent or bill on an ordinary day — and no belanja unless something was spent', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  seat(ns, s, { requested: 90 }); // RM3
  advance(ns, s, 130);
  const r = s.lastReport;
  assert.equal(r.income, 300);
  assert.equal(r.bills, null, 'rent and utilities are monthly, not daily');
  assert.equal(r.billsPaid, 0);
  assert.equal(r.expense, 0, 'nothing was spent, so there is no belanja');
  assert.equal(r.net, 300);
  assert.equal(s.cash, 3500 + 300);
  assert.equal(State.audit(s).ok, true);
});

test('7.5: rent + utilities are paid once a month, AFTER the day is judged, and never count as sales', () => {
  const { ns, State } = fresh();
  const days = ns.CFG.BILL_CYCLE_DAYS;
  const probe = State.create(1);
  assert.deepEqual(plain([days - 1, days, days + 1, days * 2].map((d) => State.isBillDay(probe, d))), [false, true, false, true]);
  const s = calmShift(ns, { day: days });
  assert.equal(State.daysToBills(s), 1);
  seat(ns, s, { requested: 90 });
  advance(ns, s, 130);
  const r = s.lastReport;
  const bills = State.monthlyBills(s);
  assert.equal(r.income, 300, 'bills do not touch the sales figure');
  assert.equal(r.billsPaid, bills.rent + bills.electric + bills.internet);
  assert.equal(r.expense, 0, 'bills are not belanja');
  assert.equal(r.net, r.income - r.billsPaid);
  assert.equal(s.cash, 3500 + 300 - r.billsPaid);
  assert.equal(State.audit(s).ok, true);
  assert.equal(State.daysToBills({ day: days + 1 }), days, 'the next month starts counting again');
});

test('7.5: belanja is booked only when money is actually spent (repairs, perk upkeep)', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  seat(ns, s, { requested: 60 });
  State.breakPc(s, State.byId(s.pcs, 2), null, { kind: 'hardware' });
  State.perform(s, 'repair', 2);
  advance(ns, s, 6); // Abang walks over first; the money is only spent when he gets there
  const spent = State.breakdown(s).expenses;
  assert.ok(spent > 0 && State.breakdown(s).bills === 0);
  advance(ns, s, 130);
  assert.equal(s.lastReport.expense, spent);
  assert.equal(s.lastReport.bills, null);
  assert.equal(State.audit(s).ok, true, 'every sen accounted for');
});

/* ------------------------------------------------------------- archetypes etc. */
test('4.3: all nine customer archetypes exist and can walk in', () => {
  const { ns, State } = fresh();
  const want = ['Pakcik Internet', 'Kaki FPS', 'Kaki Panas Baran', 'Student Assignment', 'Kaki MMORPG', 'Budak RM1', 'Kaki LAN', 'Lepak Sampai Pagi', 'Kaki MIRC'];
  assert.deepEqual(plain(ns.TYPES.map((t) => t.name)).sort(), [...want].sort());
  const seen = new Set();
  for (let seed = 1; seed <= 400; seed++) {
    const s = newShift(ns, { seed: seed * 31, day: 6 });
    s.elapsed = 70; // late enough for the night crowd
    s.customers = [];
    State.spawn(s);
    if (s.customers[0]) seen.add(s.customers[0].type);
  }
  assert.equal(seen.size, 9, `spawned: ${[...seen]}`);
});

test('Lepak Sampai Pagi lingers after the session; extending sells another half hour', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns, { day: 4 });
  const c = seat(ns, s, { type: 'lepak', requested: 90 });
  const pc = State.byId(s.pcs, 1);
  pc.occupiedSeconds = 0.05;
  advance(ns, s, 0.5);
  assert.ok(pc.lingerTime > 0 && c.status === 'playing', 'still glued to the seat');
  const before = State.breakdown(s).rental;
  assert.deepEqual(plain(State.options(s, { kind: 'pc', id: 1 }).map((o) => o.act)), ['extend', 'sendoff']);
  State.perform(s, 'extend', 1);
  assert.equal(State.breakdown(s).rental, before + 100);
  assert.ok(pc.occupiedSeconds > 4);
});

test('Director: presets scale pressure; difficulty grows with the day, the perks and the PCs', () => {
  const { ns, S } = fresh();
  const s = ns.State.create(1);
  const base = S.pressure(s);
  s.preset = 'mencabar';
  assert.ok(S.pressure(s) > base);
  s.preset = 'santai';
  assert.ok(S.pressure(s) < base);
  s.preset = 'biasa';
  s.day = 6;
  assert.ok(S.pressure(s) > base);
  const p6 = S.pressure(s);
  s.perks.push('snack');
  assert.ok(S.pressure(s) > p6);
});

test('Movement: people keep apart and arrive at their goals without teleporting', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  const a = seat(ns, s, { requested: 90, pcId: 1 });
  const track = [];
  const c = addWaiting(ns, s);
  State.select(s, { kind: 'customer', id: c.id });
  State.perform(s, 'duration', c.id, 60);
  State.select(s, { kind: 'pc', id: 3 });
  let last = { x: c.x, y: c.y }, maxJump = 0;
  for (let i = 0; i < 600 && c.status !== 'playing'; i++) {
    State.update(s, 0.05);
    maxJump = Math.max(maxJump, Math.hypot(c.x - last.x, c.y - last.y));
    last = { x: c.x, y: c.y };
    track.push(c.moveIntensity);
  }
  assert.equal(c.status, 'playing');
  assert.ok(maxJump < 0.3, `no teleporting (max step ${maxJump.toFixed(3)})`);
  assert.ok(Math.max(...track) > 0.5 && a);
});

test('Floor plan: counter in the front-left corner, desks hug the back wall first, Abang can reach every desk and come home', () => {
  const { ns, State } = fresh();
  const { ROOM } = ns;
  // counter fills the bottom-left corner of the left wall; the water dispenser and rack took its old place
  assert.ok(ROOM.counter.y1 > ROOM.depth - 1 && ROOM.counter.y0 > ROOM.depth / 2, 'counter is in the front corner');
  assert.ok(ROOM.dispenser.y < ROOM.counter.y0 - 1 && ROOM.rack.y < ROOM.counter.y0 - 0.5, 'dispenser and rack stand where the counter used to be');
  // the first five desks all sit on the back row, so the middle of the café stays open
  for (let i = 0; i < ROOM.perRow; i++) assert.equal(ROOM.pcSlot(i).y, ROOM.rowY[0], `desk ${i + 1} is against the back wall`);
  assert.equal(ROOM.pcSlot(ROOM.perRow).y, ROOM.rowY[1], 'the sixth desk opens the second row');
  assert.ok(ROOM.widthFor(3) < ROOM.widthFor(5), 'the room widens as desks are added');
  // everything stays inside the room
  for (let i = 0; i < ROOM.maxPcs; i++) assert.ok(ROOM.seatFor(ROOM.pcSlot(i)).y < ROOM.depth - 1);
  // Abang walks from behind the counter to every desk and back home again, through the hatch, never teleporting
  const s = calmShift(ns);
  s.pcs.length = 0;
  for (let i = 0; i < ROOM.maxPcs; i++) s.pcs.push(ns.S.makePc ? ns.S.makePc(i) : { id: i + 1, ...ROOM.pcSlot(i) });
  for (const pc of s.pcs) {
    s.player.destination = ROOM.staffSpotFor(pc);
    let last = { x: s.player.x, y: s.player.y }, maxJump = 0, steps = 0;
    while (s.player.destination && steps++ < 1200) {
      ns.S.updateMove(s.player, 0.05, ns.CFG.ABANG_SPEED);
      maxJump = Math.max(maxJump, Math.hypot(s.player.x - last.x, s.player.y - last.y));
      last = { x: s.player.x, y: s.player.y };
    }
    assert.equal(s.player.destination, null, `Abang reaches PC ${pc.id}`);
    assert.ok(maxJump < 0.5, `no teleporting (max step ${maxJump.toFixed(2)})`);
    s.player.destination = { ...ROOM.home };
    steps = 0;
    while (s.player.destination && steps++ < 1200) ns.S.updateMove(s.player, 0.05, ns.CFG.ABANG_SPEED);
    assert.ok(Math.hypot(s.player.x - ROOM.home.x, s.player.y - ROOM.home.y) < 0.2, `Abang gets back behind the counter from PC ${pc.id}`);
  }
});

test('Customers: the pop-up needs no side panel — State.durationOptions gives the three lengths, with the requested one starred', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  const c = addWaiting(ns, s, 'student', 90);
  assert.ok(State.select(s, { kind: 'customer', id: c.id }).ok);
  const opts = State.durationOptions(s, c.id);
  assert.deepEqual([...opts.map((o) => o.minutes)], [30, 60, 90]);
  assert.deepEqual([...opts.filter((o) => o.wanted).map((o) => o.minutes)], [90]);
});

/* ------------------------------------------------ the "suggestions" round: auto-seat, jobs, tips, hats */
test('Auto-duduk: one step books the ★ length on the nearest free PC and pays exactly like the manual correct pick', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  const c = addWaiting(ns, s, 'student', 90);
  const r = State.quickSeat(s, c.id);
  assert.ok(r.ok, r.msg);
  const pc = State.byId ? State.byId(s.pcs, c.pcId) : s.pcs.find((p) => p.id === c.pcId);
  assert.equal(pc.id, 1, 'PC 1 is the nearest free PC to the queue head');
  assert.equal(c.duration, 90);
  assert.equal(State.breakdown(s).rental, 300, 'the full RM3.00 for 90 minutes, no wrong-duration cut');
  assert.equal(s.shiftStats.wrongDuration, 0);
  for (let i = 0; i < 400 && c.status !== 'playing'; i++) State.update(s, 0.05);
  assert.equal(c.status, 'playing');
  // with PC 1 busy the next customer goes elsewhere; with none free it says so and charges nothing
  const d = addWaiting(ns, s, 'rm1', 30);
  assert.ok(State.quickSeat(s, d.id).ok);
  assert.notEqual(d.pcId, c.pcId);
  const e = addWaiting(ns, s, 'uncle', 60);
  State.quickSeat(s, e.id);
  const f = addWaiting(ns, s, 'uncle', 60);
  const before = State.breakdown(s).rental;
  const none = State.quickSeat(s, f.id);
  assert.equal(none.ok, false);
  assert.equal(State.breakdown(s).rental, before);
});

test("Abang's jobs: they can be listed, reordered and cancelled — and nothing is charged for a cancelled job", () => {
  const { ns, State } = fresh();
  const s = calmShift(ns, { cash: 100000 });
  for (const id of [1, 2, 3]) State.breakPc(s, s.pcs[id - 1], null, { kind: 'hardware' });
  assert.ok(State.perform(s, 'repair', 1).ok);
  assert.ok(State.perform(s, 'repair', 2).ok);
  assert.ok(State.perform(s, 'repair', 3).ok);
  State.updatePlayer(s, 0.05); // the first job becomes Abang's active one
  let list = State.taskList(s);
  assert.deepEqual(plain(list.map((t) => t.entityId)), [1, 2, 3]);
  assert.equal(State.perform(s, 'repair', 3).ok, false, 'a fourth job is refused (max 3)');
  // move the last one up, then cancel the one Abang is only walking to
  assert.ok(State.moveTaskUp(s, list[2].id).ok);
  assert.deepEqual(plain(State.taskList(s).map((t) => t.entityId)), [1, 3, 2]);
  assert.equal(State.moveTaskUp(s, State.taskList(s)[1].id).ok, false, 'the next job cannot jump the one in progress');
  const cash = s.cash;
  assert.ok(State.cancelTask(s, list[0].id).ok, 'a job Abang is still walking to can be dropped');
  assert.ok(State.cancelTask(s, State.taskList(s)[0].id).ok);
  assert.equal(s.cash, cash, 'no money is spent on a cancelled repair');
  assert.equal(State.taskList(s).length, 1);
});

test('A customer who is nearly out of patience triggers exactly one warning event', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  const c = addWaiting(ns, s, 'hot', 60);
  State.drainFx?.();
  let warned = 0;
  for (let i = 0; i < 1500 && c.status === 'waiting'; i++) {
    State.update(s, 0.05);
    warned += State.drainFx().filter((f) => f.type === 'patienceLow' && f.customerId === c.id).length;
  }
  assert.equal(warned, 1, 'one beep, not a stream of them');
  assert.ok(s.shiftStats.queueWalkouts >= 1, 'and they did walk out in the end');
});

test('Shift report: every report has a headline with a fix; a bad day names its biggest leak', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns);
  for (let i = 0; i < 3; i++) addWaiting(ns, s, 'hot', 60); // never served → they walk out
  run(ns, s, ns.CFG.SHIFT + 5);
  const r = s.lastReport;
  assert.equal(r.goalMet, false);
  assert.ok(r.headline && r.headline.text && r.headline.tip, 'headline + tip');
  assert.equal(r.headline.kind, 'fail');
  assert.match(r.headline.text, /beratur|Tiada pelanggan dilayan/);
  // a clean winning day still gets a line
  const { ns: ns2 } = fresh();
  const w = calmShift(ns2);
  w.cash += 0;
  ns2.S.record(w, 'rental', 99900, 'test');
  run(ns2, w, ns2.CFG.SHIFT + 5);
  assert.equal(w.lastReport.goalMet, true);
  assert.ok(w.lastReport.headline.tip);
});

test('Koleksi: hats unlock by clearing days, only unlocked hats can be worn, and everything survives a new run', () => {
  const { ns, storage } = loadGame();
  const M = ns.Meta;
  assert.equal(M.equipped(), 'cap');
  assert.deepEqual(plain(M.hats().filter((h) => h.unlocked).map((h) => h.id)), ['cap']);
  assert.equal(M.equip('crown'), false, 'a locked hat cannot be worn');
  assert.deepEqual(plain(M.recordDay(1, 2).map((h) => h.id)), []);
  assert.deepEqual(plain(M.recordDay(3, 2).map((h) => h.id)), ['phones'], 'clearing day 3 unlocks the headphones');
  assert.deepEqual(plain(M.recordDay(3, 3).map((h) => h.id)), [], 'clearing it again unlocks nothing twice');
  assert.equal(M.equip('phones'), true);
  assert.deepEqual(plain(M.recordDay(10, 3).map((h) => h.id)).sort(), ['crown', 'straw'], 'a jump to day 10 unlocks everything on the way');
  M.recordRun();
  assert.equal(JSON.parse(storage.getItem('abangcc2007_meta')).hat, 'phones', 'stored on its own, apart from the run save');
  // a brand-new run (State.create) and deleting a save do not touch it
  ns.State.deleteSave(ns.State.createSave(ns.State.create()));
  ns.State.create();
  assert.equal(M.get().bestDay, 10);
  assert.equal(M.get().runs, 1);
  // a fresh page (fresh module, same storage) reads it back
  const { ns: again } = loadGame({ storage });
  assert.equal(again.Meta.equipped(), 'phones');
  assert.equal(again.Meta.get().bestDay, 10);
});

test('Clearing a day through the real shift flow records progress and reports newly unlocked hats', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns, { day: 3 });
  s.cash = 5000;
  ns.S.record(s, 'rental', 99900, 'test'); // plenty of sales
  run(ns, s, ns.CFG.SHIFT + 5);
  assert.equal(s.lastReport.goalMet, true);
  assert.deepEqual(plain(s.lastReport.unlocked), ['phones']);
  assert.equal(ns.Meta.get().bestDay, 3);
});

test('Customers walk, run or run-with-joy to their PC, and the faster gaits get there sooner', () => {
  const { ns } = fresh();
  const counts = { walk: 0, run: 0, joy: 0 };
  for (let id = 1; id <= 300; id++) counts[ns.gaitFor(id, 'student')]++;
  assert.ok(counts.walk > 0 && counts.run > 0 && counts.joy > 0, `all three gaits occur: ${JSON.stringify(counts)}`);
  assert.equal(ns.gaitFor(7, 'rm1'), ns.gaitFor(7, 'rm1'), 'deterministic per customer');

  const travel = (gait) => {
    const s = calmShift(ns);
    const c = addWaiting(ns, s, 'student', 60);
    ns.State.select(s, { kind: 'customer', id: c.id });
    ns.State.perform(s, 'duration', c.id, 60);
    assert.ok(ns.State.select(s, { kind: 'pc', id: 1 }).ok);
    assert.ok(['walk', 'run', 'joy'].includes(c.gait), 'a gait is assigned when they head to the PC');
    c.gait = gait;
    let t = 0;
    while (c.status === 'walkToPc' && t < 30) { ns.State.update(s, 0.05); t += 0.05; }
    assert.equal(c.status, 'playing');
    return t;
  };
  const [w, j, r] = [travel('walk'), travel('joy'), travel('run')];
  assert.ok(r < j && j < w, `run ${r.toFixed(1)}s < joy ${j.toFixed(1)}s < walk ${w.toFixed(1)}s`);
});

/* ------------------------------------------------- cooling line, generator, tiers, recap, last saved */
test('Cooling line: Kipas → Aircond Mudah Alih → Aircond Kedai, each the next step only, each trades in the last one', () => {
  const { ns, State, S } = fresh();
  const s = State.create(77);
  s.day = 6; s.phase = 'prep'; s.cash = 50000;
  const offered = () => State.eligiblePerks(s).map((p) => p.id).filter((id) => ['fan', 'portable', 'aircond'].includes(id));
  assert.deepEqual(plain(offered()), ['fan'], 'only the fan to begin with');

  s.perkDraft = ['fan']; s.perkChoiceMade = false;
  assert.ok(State.buyPerk(s, 'fan').ok);
  assert.equal(State.coolLevel(s), 1);
  assert.deepEqual(plain(offered()), ['portable'], 'fan owned: the portable unit is the next step');

  s.perkDraft = ['portable']; s.perkChoiceMade = false; s.perkCooldowns = {};
  const before = s.cash;
  assert.equal(State.perkPrice(s, 'portable'), ns.byId(ns.PERKS, 'portable').price - 1250, 'half the fan price is traded in');
  assert.ok(State.buyPerk(s, 'portable').ok);
  assert.equal(before - s.cash, 6500 - 1250);
  assert.equal(State.hasPerk(s, 'fan'), false, 'the fan is replaced, not kept');
  assert.equal(State.coolLevel(s), 2);
  assert.deepEqual(plain(offered()), ['aircond']);

  s.perkDraft = ['aircond']; s.perkChoiceMade = false; s.perkCooldowns = {};
  assert.equal(State.perkPrice(s, 'aircond'), 11000 - 3250);
  assert.ok(State.buyPerk(s, 'aircond').ok);
  assert.equal(State.coolLevel(s), 3);
  assert.equal(State.hasPerk(s, 'portable'), false);
  assert.deepEqual(plain(offered()), [], 'the line is finished');
  assert.equal(S.perkUpkeep(s), 300, 'only the top unit is paid for');
});

test('Cooling line: better units make overheating rarer and customers more patient', () => {
  const { ns, S } = fresh();
  const s = newShift(ns, { seed: 9, day: 2 });
  const heat = (perks) => { s.perks = perks; return [S.overheatMult(s), S.coolPatience(s), S.patienceDrain(s)]; };
  const none = heat([]), fan = heat(['fan']), portable = heat(['portable']), full = heat(['aircond']);
  assert.ok(none[0] > fan[0] && fan[0] > portable[0] && portable[0] > full[0], 'overheat chance falls with every step');
  assert.ok(none[1] < fan[1] && fan[1] < portable[1] && portable[1] < full[1], 'new customers arrive with more patience');
  assert.ok(none[2] > fan[2] && fan[2] > portable[2] && portable[2] > full[2], 'waiting customers lose patience more slowly');
});

test('Generator: a blackout is a 5-second blip, costs RM3 of diesel and keeps the day running', () => {
  const { ns, State, S } = fresh();
  const dark = (withGen) => {
    const s = calmShift(ns, { seed: 21, day: 4 });
    if (withGen) s.perks.push('generator');
    s.cash = 5000;
    assert.ok(State.startEvent(s, 'blackout'));
    return s;
  };
  const plainDay = dark(false);
  assert.equal(plainDay.powerOutage, 20);
  const s = dark(true);
  assert.equal(s.powerOutage, ns.CFG.GENERATOR.outage);
  assert.equal(s.cash, 5000 - ns.CFG.GENERATOR.fuel, 'diesel is booked as belanja');
  assert.equal(s.shiftStats.generatorRuns, 1);
  assert.equal(S.breakdown(s).expenses, ns.CFG.GENERATOR.fuel);
  run(ns, s, 6);
  assert.equal(s.powerOutage, 0, 'power is back after five seconds');
  assert.equal((s.worldEvents || []).some((e) => e.type === 'blackout'), false, 'nothing left to fix at the fuse box');
});

test('Reputation tiers: Biasa → Best → Popular → Port Lepak, with a 3-point cushion before a tier is lost', () => {
  const { ns, S } = fresh();
  const s = calmShift(ns, { seed: 5 });
  const go = (rep) => { s.rep = rep; S.updateTier(s); return s.repTier; };
  assert.equal(go(55), 'biasa');
  assert.equal(go(60), 'best');
  assert.equal(go(75), 'popular');
  assert.equal(go(90), 'lepak');
  assert.equal(go(88), 'lepak', 'two points under is still Port Lepak');
  assert.equal(go(86), 'popular', 'more than three under and it is gone');
  assert.equal(go(40), 'biasa');
  assert.deepEqual(plain(ns.TIERS.map((t) => t.name)), ['Kedai Biasa', 'Kedai Best', 'Kedai Popular', 'Port Lepak']);
  assert.ok(s.shiftStats.tierMoves.length >= 5, 'each change is remembered for the recap');
});

test('Reputation tiers: higher tiers make people more patient, bring regulars and duit kopi — and Port Lepak draws the officer', () => {
  const { ns, State, S } = fresh();
  const drain = (rep) => { const s = calmShift(ns, { seed: 5 }); s.rep = rep; S.updateTier(s); return { drain: S.patienceDrain(s), tier: S.tierOf(s) }; };
  const [a, b, c, d] = [drain(55), drain(65), drain(80), drain(95)];
  assert.ok(a.drain > b.drain && b.drain > c.drain && c.drain > d.drain, 'every tier lowers the patience drain');
  assert.equal(a.tier.tipSen, 0);
  assert.ok(c.tier.tipSen > 0 && d.tier.tipSen > c.tier.tipSen);
  assert.ok(d.tier.riskDrift > 0 && c.tier.riskDrift === 0, 'only Port Lepak raises inspection risk each night');

  // duit kopi: over many customers a Port Lepak shop earns some, a plain shop none
  const tips = (rep) => {
    const s = calmShift(ns, { seed: 13 });
    s.rep = rep; S.updateTier(s);
    for (let i = 0; i < 40; i++) {
      for (const p of s.pcs) { p.status = 'free'; p.customerId = null; p.fault = null; p.issue = null; }
      const cust = addWaiting(ns, s, 'student', 60);
      State.select(s, { kind: 'customer', id: cust.id });
      State.perform(s, 'duration', cust.id, 60);
      State.select(s, { kind: 'pc', id: 1 });
      s.customers = [];
    }
    return s.shiftStats.tips;
  };
  assert.equal(tips(55), 0);
  assert.ok(tips(95) > 0, 'Port Lepak customers tip');
});

test('End-of-day recap: a report carries up to five highlights built from what really happened', () => {
  const { ns, State, S } = fresh();
  const s = calmShift(ns, { seed: 41, day: 3 });
  s.perks.push('generator');
  s.cash = 9000;
  seat(ns, s, { type: 'rm1', requested: 30, minutes: 30, pcId: 1 });
  assert.ok(s.shiftStats.bestSale && s.shiftStats.bestSale.type === 'rm1');
  State.startEvent(s, 'blackout');
  State.breakPc(s, s.pcs[1], null, { kind: 'bsod' });
  State.breakPc(s, s.pcs[1], null, { kind: 'glitch' });
  s.rep = 62; S.updateTier(s);
  run(ns, s, ns.CFG.SHIFT + 5);
  const r = s.lastReport;
  assert.ok(Array.isArray(r.recap) && r.recap.length > 0 && r.recap.length <= 5);
  const titles = r.recap.map((x) => x.title).join('|');
  assert.match(titles, /Naik taraf: Kedai Best/, 'tier changes show up');
  assert.match(titles, /Generator/, 'the generator is mentioned');
  assert.ok(r.recap.every((x) => x.icon && x.title && x.text), 'every highlight is complete');
  assert.equal(r.tier, 'best');
});

test('Last saved: the save remembers when it was written and survives a reload; a blocked store is reported', () => {
  const storage = makeStorage();
  const { State } = fresh({ storage });
  assert.equal(State.saveInfo().at, 0, 'nothing saved yet');
  const s = State.create(3);
  const t0 = Date.now();
  assert.ok(State.createSave(s));
  const info = State.saveInfo();
  assert.ok(info.at >= t0 && info.at <= Date.now() && !info.failed);

  // a second page load reads the time back from the stored envelope
  const again = loadGame({ storage });
  assert.ok(again.ns.State.getSaved());
  assert.ok(Math.abs(again.ns.State.saveInfo().at - info.at) < 5);

  // storage that refuses writes: the game still plays, and the failure is reported
  const blocked = loadGame({ storage: { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} } });
  assert.ok(blocked.ns.State.createSave(blocked.ns.State.create(1)), 'a run can still start');
  assert.equal(blocked.ns.State.saveInfo().failed, true);
  assert.equal(blocked.ns.State.save(blocked.ns.State.create(1)), false);
});

test('Old saves load: tiers are worked out from reputation and new recap counters are filled in', () => {
  const { State } = fresh();
  const old = plain(State.create(8));
  old.rep = 78; delete old.repTier;
  old.shiftStats = { served: 3 }; // as saved before the recap existed
  const s = State.migrate(old);
  assert.equal(s.repTier, 'popular');
  assert.equal(s.shiftStats.served, 3);
  assert.equal(s.shiftStats.hourly.length, 12);
  assert.deepEqual(plain(s.shiftStats.pcFaults), {});
});

test('Balance bot: every perk is in its shopping list (a missing one would sort to the front and skew every simulation)', () => {
  const { ns } = fresh();
  const missing = ns.PERKS.map((p) => p.id).filter((id) => !PERK_PRIORITY.includes(id));
  assert.deepEqual(plain(missing), [], 'add new perks to PERK_PRIORITY in tests/bot.mjs');
});

/* ------------------------------------------------------------------ the assistant */
/** A calm day-15+ shift with the assistant already hired. */
function asstShift(ns, opts = {}) {
  const s = calmShift(ns, { seed: 77, day: 16, ...opts });
  s.assistant = { since: 15, x: ns.ROOM.assistantHome.x, y: ns.ROOM.assistantHome.y, facing: 0, auto: true, mc: null, mcBlock: -1, mcDays: [], task: null, working: false, idle: 0, jobs: 0 };
  s.cash = 5000;
  return s;
}

test('Assistant: unlocks on day 15, costs a one-off fee, can be hired only once, only from the prep screen', () => {
  const { ns, State, S } = fresh();
  const s = State.create(3);
  s.phase = 'prep'; s.cash = 20000;
  s.day = 14;
  assert.equal(State.canHireAssistant(s), false, 'locked before day 15');
  assert.equal(State.hireAssistant(s).ok, false);
  s.day = 15;
  assert.equal(State.canHireAssistant(s), true);
  s.cash = 1000;
  assert.equal(State.hireAssistant(s).ok, false, 'too poor');
  s.cash = 20000;
  s.phase = 'active';
  assert.equal(State.hireAssistant(s).ok, false, 'only before a shift');
  s.phase = 'prep';
  assert.ok(State.hireAssistant(s).ok);
  assert.equal(s.cash, 20000 - ns.CFG.ASSISTANT.hireFee);
  assert.equal(S.breakdown(s).expenses, ns.CFG.ASSISTANT.hireFee, 'the hire fee is belanja');
  assert.equal(State.hireAssistant(s).ok, false, 'no second helper — and no way to let them go');
  assert.equal(State.canHireAssistant(s), false);
});

test('Assistant: the wage is a monthly bill paid with the rent, whether or not they were sick', () => {
  const { ns, State, S } = fresh();
  const s = calmShift(ns, { seed: 9, day: 30 });
  s.cash = 100000;
  const without = State.monthlyBills(s);
  assert.equal(without.assistant, 0);
  s.assistant = asstShift(ns).assistant;
  s.assistant.mc = { reason: 'demam' };
  const bills = State.monthlyBills(s);
  assert.equal(bills.assistant, ns.CFG.ASSISTANT.wage);
  assert.equal(bills.total, without.total + ns.CFG.ASSISTANT.wage);
  s.dayGoal = 1;
  S.record(s, 'rental', 99999, 'test');
  run(ns, s, ns.CFG.SHIFT + 5);
  const wage = s.shiftLedger.find((e) => e.kind === 'wage');
  assert.ok(wage && wage.amount === -ns.CFG.ASSISTANT.wage && wage.cat === 'bill', 'wage booked as a bill on day 30');
  assert.equal(s.lastReport.bills.assistant, ns.CFG.ASSISTANT.wage);
});

test('Assistant: mops a spill by themselves, for free, without slowing Abang down', () => {
  const { ns, State, S } = fresh();
  const s = asstShift(ns);
  const cash = s.cash;
  assert.ok(State.startEvent(s, 'spill'));
  const ev = s.worldEvents[0];
  run(ns, s, 0.2);
  assert.ok(s.assistant.task, 'they took the job on their own');
  assert.equal(s.assistant.task.kind, 'spill');
  assert.equal(State.taskList(s).length, 0, 'Abang was not involved');
  run(ns, s, 14, 0.05, () => {});
  assert.equal(State.eventById(s, ev.id), undefined, 'the puddle is gone');
  assert.equal(s.cash, cash, 'free');
  assert.equal(s.cleanupSlow, 0, 'Abang is not slowed');
  assert.equal(s.shiftStats.assistantJobs, 1);
  assert.equal(s.assistant.task, null);
});

test('Assistant: replaces the fuse after a blackout (the fuse itself costs RM8), but not when broke or when it is nearly over', () => {
  const { ns, State, S } = fresh();
  const s = asstShift(ns);
  assert.ok(State.startEvent(s, 'blackout'));
  run(ns, s, 25);
  assert.equal(s.powerOutage, 0, 'power came back well before the 20 seconds ran out');
  assert.equal(s.shiftStats.assistantJobs, 1);
  assert.equal(S.breakdown(s).expenses, 800, 'RM8 for the fuse');

  const broke = asstShift(ns);
  broke.cash = 300;
  State.startEvent(broke, 'blackout');
  run(ns, broke, 3);
  assert.equal(broke.assistant.task, null, 'cannot buy a fuse with RM3');

  const gen = asstShift(ns);
  gen.perks.push('generator');
  State.startEvent(gen, 'blackout');
  run(ns, gen, 0.5);
  assert.equal(gen.assistant.task, null, 'with a generator the blackout is over before they could get there');
});

test('Assistant: auto can be switched off, and then they only go when sent; Abang and the assistant never take the same job', () => {
  const { ns, State } = fresh();
  const s = asstShift(ns);
  State.assistantAuto(s);
  assert.equal(s.assistant.auto, false);
  State.startEvent(s, 'spill');
  const ev = s.worldEvents[0];
  run(ns, s, 3);
  assert.equal(s.assistant.task, null, 'auto is off: they wait for orders');
  const opt = State.options(s, { kind: 'event', id: ev.id }).find((o) => o.act === 'asstgo');
  assert.ok(opt && !opt.disabled, 'the spill menu offers Suruh Pembantu');
  assert.ok(State.perform(s, 'asstgo', ev.id).ok);
  assert.ok(s.assistant.task);
  assert.equal(State.perform(s, 'event', ev.id, 'mop').ok, false, 'Abang is told the helper has it');
  assert.equal(State.perform(s, 'asstgo', ev.id).ok, false, 'already busy');

  // the other way round: Abang first, the assistant leaves it alone
  const t = asstShift(ns);
  State.startEvent(t, 'spill');
  const ev2 = t.worldEvents[0];
  t.assistant.auto = false;
  assert.ok(State.perform(t, 'event', ev2.id, 'mop').ok);
  const again = State.options(t, { kind: 'event', id: ev2.id }).find((o) => o.act === 'asstgo');
  assert.equal(again.disabled, true, 'no point sending the helper to what Abang is already doing');
});

test('Assistant: the pop-up on a spill only mentions the assistant once one is hired; tapping them shows Auto and "Apa boleh buat?"', () => {
  const { ns, State } = fresh();
  const s = calmShift(ns, { seed: 4, day: 16 });
  State.startEvent(s, 'spill');
  const id = s.worldEvents[0].id;
  assert.equal(State.options(s, { kind: 'event', id }).some((o) => o.act === 'asstgo'), false, 'no assistant, no button');
  s.assistant = asstShift(ns).assistant;
  assert.equal(State.options(s, { kind: 'event', id }).some((o) => o.act === 'asstgo'), true);
  assert.ok(State.select(s, { kind: 'assistant', id: 1 }).ok);
  assert.deepEqual(plain(State.options(s, { kind: 'assistant', id: 1 }).map((o) => o.act)), ['asstauto', 'asstinfo']);
  s.assistant.mc = { reason: 'demam' };
  assert.equal(State.select(s, { kind: 'assistant', id: 1 }).ok, false, 'cannot tap someone who is not in');
  const opt = State.options(s, { kind: 'event', id }).find((o) => o.act === 'asstgo');
  assert.equal(opt.disabled, true);
  assert.match(opt.sub, /MC/);
});

test('Assistant: sick leave — one day in every block of 10 (sometimes two), never two days running, never before the day after hiring', () => {
  const { ns, State } = fresh();
  const s = State.create(2024);
  s.day = 15; s.phase = 'prep'; s.cash = 99999;
  State.hireAssistant(s);
  const sick = [];
  const reasons = new Set();
  for (let day = 16; day <= 135; day++) {
    s.day = day;
    State.rollSickLeave(s);
    if (s.assistant.mc) { sick.push(day); reasons.add(s.assistant.mc.reason); }
  }
  for (let block = 1; block <= 12; block++) {
    const inBlock = sick.filter((d) => d > block * 10 && d <= block * 10 + 10);
    assert.ok(inBlock.length >= 1 && inBlock.length <= 2, `block ${block} (days ${block * 10 + 1}-${block * 10 + 10}) has ${inBlock.length} sick day(s)`);
  }
  assert.ok(sick.every((d, i) => i === 0 || d - sick[i - 1] > 1), 'never two days running');
  assert.ok(sick.every((d) => d > 15), 'not on the day they were hired');
  assert.ok(sick.length >= 12 && sick.length <= 24, `over 12 blocks that is ${sick.length} days off, a light sprinkle`);
  assert.ok(reasons.size > 2, 'the excuses vary');
});

test('Assistant: on MC they are not in the shop and do nothing; a retried day repeats the same MC; the report mentions it', () => {
  const { ns, State, S } = fresh();
  const s = asstShift(ns);
  s.assistant.mc = { reason: 'demam panas 🤒' };
  State.resetAssistantForShift(s);
  State.startEvent(s, 'spill');
  run(ns, s, 20);
  assert.equal(s.shiftStats.assistantJobs, 0, 'nobody mopped');
  assert.equal(s.assistant.task, null);
  assert.equal(State.assistantPresent(s), false);
  run(ns, s, ns.CFG.SHIFT);
  const titles = (s.lastReport.recap || []).map((r) => r.title + r.text).join('|');
  assert.match(titles, /MC/, 'the recap says they were out');

  // the snapshot taken when the day started keeps the plan, so a retry sees the same day
  const t = calmShift(ns, { seed: 12, day: 16 });
  t.assistant = asstShift(ns).assistant;
  t.assistant.mc = { reason: 'sakit gigi 🦷' };
  const snap = JSON.parse(State.snapshotDay(t));
  assert.equal(snap.assistant.mc.reason, 'sakit gigi 🦷');
});

test('Assistant: saves and old saves — the helper survives a reload, and a save from before them has none', () => {
  const { ns, State } = fresh();
  const s = asstShift(ns);
  s.assistant.mcDays = [18]; s.assistant.mcBlock = 1; s.assistant.auto = false;
  const back = State.migrate(plain(s));
  assert.equal(back.assistant.auto, false);
  assert.deepEqual(plain(back.assistant.mcDays), [18]);
  const old = plain(State.create(5));
  delete old.assistant;
  assert.equal(State.migrate(old).assistant, null);
});
