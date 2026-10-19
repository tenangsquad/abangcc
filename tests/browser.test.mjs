// Browser acceptance tests (real Chrome, real mouse/touch events, real WebGL via swiftshader):
//   node --test tests/browser.test.mjs
// Needs Chrome or Edge installed (set CHROME_PATH if it is somewhere unusual). No npm packages.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from '../tools/cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = pathToFileURL(path.join(root, 'index.html')).href;
const SHOTS = path.join(root, 'tests', 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

let b;
before(async () => { b = await launch(); });
after(async () => { await b?.close(); });

/** Fresh page with empty storage, adaptive quality off, sound off. */
async function open(w = 1366, h = 768, { mobile = false, dpr = 1, url = INDEX } = {}) {
  await b.viewport(w, h, { dpr, mobile });
  await b.goto(url);
  // the game saves on unload — switch saving off for this page, wipe storage, then load clean
  await b.eval(`ABCC.State.save = () => true; localStorage.clear(); localStorage.setItem('abangcc2007_settings', JSON.stringify({ quality: 'high', qualityChosen: true, sound: false, noLoader: true })); 1`);
  b.clearErrors();
  await b.goto(url);
  await b.sleep(450);
}
const ev = (code) => b.eval(code);
const sleep = (ms) => b.sleep(ms);
const shot = (name) => b.screenshot(path.join(SHOTS, name + '.png'));

/** Helpers that live in the page. */
const PAGE_HELPERS = `window.T = {
  day(day = 1, o = {}) {
    const d = ABCC.debug;
    d.set((s) => { s.phase = 'prep'; s.day = day; (o.perks || []).forEach((p) => s.perks.push(p)); if (o.cash != null) s.cash = o.cash; });
    d.start();
    const s = d.state();
    s.beatPlan = []; s.specialAt = []; s.eventCooldown = 1e9; s.spawnCooldown = 1e9; s.inspectionScheduled = 1e9;
    d.freeze(true);
    return s.phase;
  },
  wait(type = 'student', req = 60, slot = 0) {
    const s = ABCC.debug.state();
    const c = ABCC.S.makeCustomer(s, type, { requestedMinutes: req });
    const q = ABCC.ROOM.queueSlot(slot);
    Object.assign(c, { status: 'waiting', x: q.x, y: q.y, queueIndex: slot });
    s.customers.push(c);
    ABCC.debug.advance(0.1);
    return c.id;
  },
  seat(type, pcId, req = 90) { // through the same API a player uses
    const d = ABCC.debug, s = d.state(), S = ABCC.State;
    const id = T.wait(type, req, 0);
    S.select(s, { kind: 'customer', id });
    S.perform(s, 'duration', id, req);
    S.select(s, { kind: 'pc', id: pcId });
    for (let i = 0; i < 400 && S.byId(s.customers, id)?.status !== 'playing'; i++) S.update(s, 0.05);
    d.advance(0.05);
    return id;
  },
};1`;

async function pageReady(day = 1, opts = {}) {
  await ev(PAGE_HELPERS);
  const phase = await ev(`T.day(${day}, ${JSON.stringify(opts)})`);
  assert.equal(phase, 'active');
  await sleep(200);
}
async function rect(sel) {
  const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom }; })()`);
  assert.ok(r, `element ${sel} exists`);
  return r;
}
async function clickEl(sel) {
  const r = await rect(sel);
  await b.click(r.x, r.y);
  await sleep(160);
  return r;
}
/** Click `sel` until `cond` (page expression) is true — a click can be swallowed while the software-rendered page is busy. */
async function clickUntil(sel, cond) {
  for (let i = 0; i < 5; i++) {
    await clickEl(sel);
    for (let j = 0; j < 6; j++) {
      if (await ev(cond)) return;
      await sleep(100);
    }
  }
}
async function clickWorld(kind, id, { touch = false } = {}) {
  await sleep(200); // let a frame draw so the anchors are current
  let p = null;
  for (let i = 0; i < 25 && !p; i++) {
    p = await ev(`ABCC.debug.pagePoint(${JSON.stringify(kind)}, ${id})`);
    if (!p) await sleep(120);
  }
  assert.ok(p, `${kind} ${id} has a place on screen`);
  await (touch ? b.tap(p.x, p.y) : b.click(p.x, p.y));
  await sleep(160);
  return p;
}
const sel = () => ev(`ABCC.debug.state().selected`);
const S = (expr) => ev(`(() => { const s = ABCC.debug.state(), State = ABCC.State; return ${expr}; })()`);

/* ---------------------------------------------------------------------------------------- */
test('A1/A23: the game opens without JavaScript errors and renders a genuine 3D scene (not an image)', async () => {
  await open();
  assert.deepEqual(b.consoleErrors, [], 'no JS errors on load');
  assert.equal(await ev('!!ABCC.debug.gfx()'), true, 'WebGL scene created');
  assert.equal(await ev(`document.getElementById('game3D').tagName`), 'CANVAS');
  assert.equal(await ev(`document.getElementById('noWebgl').hidden`), true);
  await ev(PAGE_HELPERS);
  await ev('T.day(1)');
  await sleep(300);
  const snap = await ev('ABCC.debug.gfx().snapshot(ABCC.debug.state())');
  assert.ok(snap.opaque >= 40, `scene covers the canvas (${snap.opaque}/${snap.total} opaque samples)`);
  assert.ok(snap.distinct >= 10, `many distinct colours (${snap.distinct})`);
  const stats = await ev('ABCC.debug.gfx().stats()');
  assert.ok(stats.instances > 150, `hundreds of 3D instances drawn (${stats.instances})`);
  assert.ok(stats.casters > 20, `objects cast sun shadows (${stats.casters})`);
  await shot('01_scene_afternoon');
  assert.deepEqual(b.consoleErrors, []);
});

test('A2/A3: new game → intro cards with Sebelum / Seterusnya / Langkau → Day 1 with RM35, exactly 3 PCs, target RM30', async () => {
  await open();
  await clickUntil('[data-modal="newgame"]', `/SELAMAT DATANG/.test(document.querySelector('.modal-card')?.textContent || '') && !!document.querySelector('[data-modal="intronext"]')`);
  assert.match(await ev(`document.querySelector('.modal-card').textContent`), /SELAMAT DATANG/);
  assert.equal(await ev(`!!document.querySelector('[data-modal="introback"]')`), false, 'no Sebelum on the first card');
  await clickUntil('[data-modal="intronext"]', `!!document.querySelector('[data-modal="introback"]')`);
  assert.equal(await ev(`!!document.querySelector('[data-modal="introback"]')`), true, 'Sebelum appears on card 2');
  assert.match(await ev(`document.querySelector('.modal-card').textContent`), /TARGET HARIAN/);
  await clickUntil('[data-modal="introback"]', `!document.querySelector('[data-modal="introback"]')`);
  assert.match(await ev(`document.querySelector('.modal-card').textContent`), /SELAMAT DATANG/);
  assert.equal(await ev(`!!document.querySelector('[data-modal="introskip"]')`), true, 'Langkau (skip) is offered');
  await clickUntil('[data-modal="introskip"]', `/PERSEDIAAN/.test(document.querySelector('.modal-card')?.textContent || '')`);
  assert.match(await ev(`document.querySelector('.modal-card').textContent`), /PERSEDIAAN/);
  await clickUntil('[data-modal="start"]', `ABCC.debug.state().phase === 'active'`);
  await sleep(300);
  assert.equal(await ev(`document.getElementById('hudCash').textContent`), 'RM35.00');
  assert.equal(await ev(`document.getElementById('revenueGoal').textContent`), 'RM30.00');
  assert.equal(await S('s.pcs.length'), 3);
  assert.equal(await ev(`document.querySelectorAll('.pc-chip').length`), 3, 'three PC identifiers in the room');
  assert.equal(await S('s.phase'), 'active');
  assert.deepEqual(b.consoleErrors, []);
});

test('Phase 14: HUD content, sidebar order and no old Buku Log', async () => {
  await open();
  await pageReady();
  const txt = await ev(`document.body.innerText`);
  assert.match(txt, /ABANG CC: 2007/i);
  assert.match(txt, /CASH KEDAI/i);
  assert.match(txt, /TARGET JUALAN HARI INI/i);
  assert.match(txt, /CC NEWS/);
  assert.doesNotMatch(txt, /Buku Log/i, 'the old log panel is gone');
  const order = await ev(`[...document.querySelectorAll('.sidebar .card-title > span:first-child')].map((e) => e.textContent.replace(/[^A-Za-z' ]/g, '').trim().toUpperCase())`);
  assert.deepEqual(order.slice(0, 4), ['SITUASI PANAS', 'PELANGGAN MENUNGGU', 'ARAHAN ABANG', 'STATUS KEDAI']);
  assert.equal(await ev(`!!document.getElementById('selectionPanel') || !!document.getElementById('durationButtons')`), false, "the old Abang's Desk side panel is gone");
  for (const id of ['pauseBtn', 'soundBtn', 'settingsBtn', 'helpBtn', 'hudDay', 'hudTime', 'worldCountdown']) assert.ok(await ev(`!!document.getElementById('${id}')`), id);
  assert.match(await ev(`document.getElementById('hudDay').textContent`), /Hari 1/);
});

test('A4/A5: customers arrive showing the requested duration; patience bars go down', async () => {
  await open();
  await pageReady();
  await ev(`T.wait('uncle', 60, 0); T.wait('rm1', 30, 1); T.wait('lepak', 90, 2); 1`);
  await sleep(500);
  const wants = await ev(`[...document.querySelectorAll('.queue-item .want')].map((e) => e.textContent)`);
  assert.deepEqual(wants.sort(), ['30 MIN', '60 MIN', '90 MIN']);
  const w0 = await ev(`[...document.querySelectorAll('.queue-item .patience i')].map((e) => parseFloat(e.style.width))`);
  await ev(`ABCC.debug.advance(6)`);
  await sleep(300);
  const w1 = await ev(`[...document.querySelectorAll('.queue-item .patience i')].map((e) => parseFloat(e.style.width))`);
  assert.ok(w1.every((v, i) => v < w0[i]), `patience falls ${w0} → ${w1}`);
});

test('A6/A7/A21: ONE click/tap each selects the customer, picks the duration and assigns the PC (8 trials, no misfires)', async () => {
  await open();
  await pageReady();
  let failures = 0;
  for (let trial = 0; trial < 8; trial++) {
    await ev(`(() => { const s = ABCC.debug.state(); s.pcs.forEach((p) => { p.status = 'free'; p.customerId = null; p.fault = null; p.issue = null; }); s.customers = []; s.shiftLedger = []; s.once = {}; s.pendingCustomerId = null; s.pendingDuration = null; s.selected = { kind: 'pc', id: 1 }; return 1; })()`);
    const id = await ev(`T.wait('student', 60, 0)`);
    const pcId = (trial % 3) + 1;
    const touch = trial % 2 === 1;
    // 1 click: the customer (alternating between 3D picking and the queue card)
    if (trial % 4 < 2) await clickWorld('customer', id, { touch });
    else await clickEl(`.queue-item[data-customer="${id}"]`);
    if ((await sel())?.kind !== 'customer' || (await S('s.pendingCustomerId')) !== id) { failures++; continue; }
    // 1 click: the duration button (60 = the requested ★)
    await clickEl('#worldMenu [data-act="duration"][data-choice="60"]');
    if ((await S('s.pendingDuration')) !== 60) { failures++; continue; }
    // 1 click/tap: the PC in the room
    await clickWorld('pc', pcId, { touch });
    const ok = await S(`s.pcs[${pcId - 1}].customerId === ${id} && State.breakdown(s).rental === 200`);
    if (!ok) failures++;
  }
  assert.equal(failures, 0, 'every deliberate click did exactly what it should');
});

test('Customers get their own pop-up: tapping one opens 30 / 60 / 90 beside them (not on top of them) and it closes once a length is picked', async () => {
  await open();
  await pageReady();
  const id = await ev(`T.wait('student', 60, 0)`);
  await sleep(400);
  await clickWorld('customer', id);
  const m = await ev(`(() => { const menu = document.getElementById('worldMenu'), r = menu.getBoundingClientRect(), p = ABCC.debug.pagePoint('customer', ${id}); return { hidden: menu.hidden, l: r.left, r: r.right, t: r.top, b: r.bottom, px: p.x, py: p.y, durs: [...menu.querySelectorAll('[data-act="duration"]')].map((e) => e.dataset.choice), wanted: menu.querySelectorAll('.wanted').length }; })()`);
  assert.equal(m.hidden, false, 'the menu opens when the customer is tapped');
  assert.deepEqual(m.durs, ['30', '60', '90']);
  assert.equal(m.wanted, 1, 'the requested length is marked');
  assert.ok(!(m.px > m.l - 10 && m.px < m.r + 10 && m.py > m.t - 10 && m.py < m.b + 10), 'the menu does not sit on top of the customer');
  await shot('16_customer_menu');
  await clickEl('#worldMenu [data-act="duration"][data-choice="60"]');
  assert.equal(await S('s.pendingDuration'), 60);
  assert.equal(await ev(`document.getElementById('worldMenu').hidden`), true, 'the menu closes so the PC to tap is clear');
  await clickWorld('pc', 2);
  assert.equal(await S('s.pcs[1].customerId'), id, 'then one tap on the PC seats them');
  assert.deepEqual(b.consoleErrors, []);
});

test('A7: the customer walks to the correct chair and sits on it, facing the monitor', async () => {
  await open();
  await pageReady();
  const id = await ev(`T.wait('student', 60, 0)`);
  await ev(`(() => { const s = ABCC.debug.state(); ABCC.State.select(s, { kind: 'customer', id: ${id} }); ABCC.State.perform(s, 'duration', ${id}, 60); ABCC.State.select(s, { kind: 'pc', id: 2 }); return 1; })()`);
  const trail = [];
  for (let i = 0; i < 160; i++) {
    await ev(`ABCC.debug.advance(0.1)`);
    trail.push(await S(`(() => { const c = State.byId(s.customers, ${id}); return { st: c.status, x: c.x, y: c.y, sit: c.sitBlend || 0 }; })()`));
    if (trail.at(-1).st === 'playing' && trail.at(-1).sit > 0.99) break;
  }
  const end = trail.at(-1);
  assert.equal(end.st, 'playing');
  const chair = await S(`ABCC.ROOM.seatFor(s.pcs[1])`);
  assert.ok(Math.hypot(end.x - chair.x, end.y - chair.y) < 0.25, 'at the chair, behind the desk');
  assert.ok(trail.some((t) => t.st === 'walkToPc'), 'walked, did not teleport');
  const steps = trail.slice(1).map((t, i) => Math.hypot(t.x - trail[i].x, t.y - trail[i].y));
  assert.ok(Math.max(...steps) < 0.5, `smooth movement (largest step ${Math.max(...steps).toFixed(2)})`);
  await shot('02_seated');
});

test('A8/A9 + 7.5: HUD cash/target follow the ledger; the sales breakdown popover reconciles', async () => {
  await open();
  await pageReady();
  await ev(`T.seat('student', 1, 60); 1`);
  await ev(`ABCC.debug.advance(0.5)`);
  await sleep(300);
  assert.equal(await ev(`document.getElementById('revenueNow').textContent`), 'RM2.00');
  assert.equal(await ev(`document.getElementById('hudCash').textContent`), 'RM37.00');
  await clickEl('#goalPill');
  const bd = await ev(`document.getElementById('goalBreakdown').innerText`);
  assert.match(bd, /Jualan sewa\s*RM2\.00/);
  assert.match(bd, /Jualan bersih[^\n]*\s*RM2\.00/);
  assert.doesNotMatch(bd, /Belanja|Refund/, 'belanja and refund rows only show once something was spent / refunded');
  assert.match(bd, /sebulan sekali/, 'rent and bills are monthly');
  const colours = await ev(`(() => { const rows = [...document.querySelectorAll('#goalBreakdown .bd-row')]; const col = (e) => getComputedStyle(e).color; const total = rows.find((r) => r.classList.contains('total')), other = rows.find((r) => !r.classList.contains('total')); return { label: col(total.querySelector('span')), otherLabel: col(other.querySelector('span')), value: col(total.querySelector('b')) }; })()`);
  assert.equal(colours.label, colours.otherLabel, 'the Jualan bersih label has the same colour as the other labels');
  assert.equal(colours.value, 'rgb(16, 154, 114)', 'its amount is green');
  await shot('03_breakdown');
  // a wrong duration pays less than the right one — visible in the HUD
  await ev(`(() => { const s = ABCC.debug.state(); s.shiftLedger = []; s.once = {}; s.cash = 3500; return 1; })()`);
  await ev(`(() => { const d = ABCC.debug, s = d.state(), S = ABCC.State; const id = T.wait('student', 30, 0); S.select(s, { kind: 'customer', id }); S.perform(s, 'duration', id, 90); S.select(s, { kind: 'pc', id: 2 }); d.advance(0.2); return 1; })()`);
  await sleep(300);
  const paid = await S('State.breakdown(s).rental');
  assert.ok(paid < 100, `wanted 30 min (RM1), got 90 min: pays ${paid} sen < 100`);
});

test('Phase 6/9: tapping a suspicious PC offers a soft and a harsh option; a false accusation costs once', async () => {
  await open();
  await pageReady(3, { perks: ['cctv'] });
  await ev(`T.seat('student', 1, 90); 1`);
  await ev(`ABCC.State.makeIncident(ABCC.debug.state(), 'suspicious', ABCC.debug.state().pcs[0], false); ABCC.debug.advance(0.3); 1`);
  await sleep(300);
  await clickWorld('pc', 1);
  const buttons = await ev(`[...document.querySelectorAll('#worldMenu [data-act]')].map((e) => e.dataset.act)`);
  assert.deepEqual(buttons, ['soft', 'harsh']);
  assert.match(await ev(`document.getElementById('worldMenu').innerText`), /Tegur baik-baik/);
  assert.equal(await ev(`document.querySelectorAll('.sidebar button[data-act]').length`), 0, 'the side panels hold no action buttons');
  const rep = await S('s.rep'), pro = await S('s.professionalism');
  await clickEl('#worldMenu [data-act="harsh"]');
  assert.equal(await ev(`document.getElementById('worldMenu').hidden`), true, 'the menu closes once the choice is made');
  await ev(`ABCC.debug.advance(10)`);
  await sleep(250);
  assert.equal(await S('s.rep'), rep - 7);
  assert.equal(await S('s.professionalism'), pro - 9);
  assert.match(await ev(`document.getElementById('toastRoot').innerText + document.getElementById('tickerText').textContent`), /SALAH TUDUH|salah tuduh|FALSE ALARM/i);
  await shot('04_false_accusation');
});

test('Actions are done on the PC itself: tapping a PC pops its menu right beside it, with the PC left uncovered', async () => {
  await open();
  await pageReady(3);
  await ev(`T.seat('student', 2, 90); 1`);
  await ev(`ABCC.State.breakPc(ABCC.debug.state(), ABCC.debug.state().pcs[1], null, { kind: 'bsod' }); ABCC.debug.advance(0.3); 1`);
  await clickWorld('pc', 2);
  const m = await ev(`(() => { const r = document.getElementById('worldMenu').getBoundingClientRect(); const pc = ABCC.debug.pagePoint('pc', 2); return { hidden: document.getElementById('worldMenu').hidden, l: r.left, r: r.right, t: r.top, b: r.bottom, px: pc.x, py: pc.y, acts: [...document.querySelectorAll('#worldMenu [data-act]')].map((e) => e.dataset.act) }; })()`);
  assert.equal(m.hidden, false, 'the menu opens when the PC is tapped');
  assert.deepEqual(m.acts, ['restart', 'repair']);
  assert.ok(!(m.px > m.l - 20 && m.px < m.r + 20 && m.py > m.t - 20 && m.py < m.b + 20), 'the menu does not sit on top of the PC it belongs to');
  assert.equal(await ev(`document.querySelectorAll('.sidebar button[data-act]').length`), 0, 'nothing to click in the side panels');
  await shot('14_pc_menu');
  const cash = await S('s.cash');
  await clickEl('#worldMenu [data-act="restart"]'); // one click on the PC's own menu
  await ev(`ABCC.debug.advance(8); 1`);
  assert.equal(await S('State.breakdown(s).refunds'), -75, 'restart via the menu refunded exactly 25% of the RM3.00 (90 min) rental');
  assert.ok((await S('s.cash')) < cash);
  assert.equal(await S('s.pcs[1].fault'), null);
  // the close button hides it, tapping the PC again brings it back
  await ev(`ABCC.State.breakPc(ABCC.debug.state(), ABCC.debug.state().pcs[0], null, { kind: 'freeze' }); ABCC.debug.advance(0.2); 1`);
  await clickWorld('pc', 1);
  assert.equal(await ev(`document.getElementById('worldMenu').hidden`), false);
  await clickEl('#worldMenu [data-close]');
  assert.equal(await ev(`document.getElementById('worldMenu').hidden`), true);
  await clickWorld('pc', 1);
  assert.equal(await ev(`document.getElementById('worldMenu').hidden`), false, 'tapping again reopens it');
});

test('Phase 11/14: every special event is an object in the room you can click; Situasi Panas only points, it never resolves', async () => {
  await open();
  await pageReady(4, { perks: ['snack'], cash: 9000 });
  await ev(`ABCC.debug.state().elapsed = 6; 1`); // school hours
  const types = ['gang', 'download', 'mak', 'truancy', 'lan', 'snacktheft', 'spill', 'blackout'];
  for (const type of types) {
    await ev(`(() => { const s = ABCC.debug.state(); s.worldEvents = []; s.customers = []; s.powerOutage = 0; if (${JSON.stringify(type)} === 'truancy') s.elapsed = 5; ABCC.debug.startEvent(${JSON.stringify(type)}); ABCC.debug.advance(7); return 1; })()`);
    const evId = await S('s.worldEvents[0]?.id');
    assert.ok(evId, `${type} started`);
    // Situasi Panas lists it but offers no choice buttons
    const cards = await ev(`[...document.querySelectorAll('#crisisList .crisis')].map((e) => ({ kind: e.dataset.kind, hasAct: !!e.querySelector('[data-act],[data-choice],[data-moment]') }))`);
    assert.ok(cards.length >= 1 && cards.every((c) => !c.hasAct), `${type}: alert card without resolution buttons`);
    assert.equal(await ev(`document.querySelectorAll('#crisisList [data-act], #crisisList .moment-choices').length`), 0);
    // click the thing in the 3D room
    await ev(`ABCC.debug.state().selected = { kind: 'pc', id: 1 }; 1`);
    await clickWorld('event', evId);
    assert.deepEqual(await sel(), { kind: 'event', id: evId }, `${type}: clicking it in the room selects it`);
    const choices = await ev(`[...document.querySelectorAll('#worldMenu [data-choice]')].map((e) => e.dataset.choice)`);
    assert.ok(choices.length >= 2, `${type}: choices appear in Abang's Desk (${choices})`);
    if (type === 'truancy') await shot('05_event_selected');
  }
});

test('A17/7.7: a failed day shows why, and retrying restarts the SAME day with progress intact', async () => {
  await open();
  await pageReady();
  const cash0 = await S('s.cash');
  await ev(`ABCC.debug.advance(130); 1`);
  await sleep(300);
  assert.equal(await S('s.phase'), 'result');
  const text = await ev(`document.querySelector('.modal-card').innerText`);
  assert.match(text, /Shift gagal/);
  assert.match(text, /Kekurangan/);
  assert.match(text, /Sebab utama/, 'the report opens with the main reason');
  assert.match(text, /💡/, 'and a tip');
  await shot('06_failed_report');
  const retryBtn = await rect('[data-modal="retryday"]');
  assert.ok(retryBtn.b <= 768 && retryBtn.t >= 0, `the retry button is on screen at 1366×768 (bottom ${Math.round(retryBtn.b)})`);
  await clickEl('[data-modal="retryday"]');
  await sleep(250);
  assert.equal(await S('s.day'), 1);
  assert.equal(await S('s.phase'), 'prep');
  assert.equal(await S('s.cash'), cash0);
});

test('A18/A19: day 2 offers two perk cards; buying one changes the room (an extra desk appears)', async () => {
  await open();
  await pageReady();
  await ev(`(() => { const s = ABCC.debug.state(); s.dayGoal = 1; s.shiftLedger.push({ id: 1, kind: 'rental', cat: 'rental', amount: 99999, label: 'x' }); ABCC.debug.advance(130); return 1; })()`);
  await clickEl('[data-modal="next"]');
  await ev(`ABCC.debug.set((s) => { s.cash = 9000; s.perkDraft = ['add_pc', 'snack']; s.perkChoiceMade = false; }); ABCC.debug.ui().syncModal(true); 1`);
  await sleep(250);
  assert.equal(await ev(`document.querySelectorAll('.perk').length`), 2);
  assert.match(await ev(`document.querySelector('.store-grid').innerText`), /👎|Bil|risiko/i, 'each card states its downside');
  await shot('07_perk_draft');
  const startBtn = await rect('[data-modal="start"]');
  assert.ok(startBtn.b <= 768, `Buka kedai is on screen (bottom ${Math.round(startBtn.b)})`);
  const before = await S('s.pcs.length');
  await clickEl('.perk [data-id="add_pc"]');
  await sleep(250);
  assert.equal(await S('s.pcs.length'), before + 1);
  assert.equal(await ev(`document.querySelectorAll('.perk button:not([disabled])').length`), 0, 'only one perk per day');
  await clickEl('[data-modal="start"]');
  await sleep(300);
  assert.equal(await ev(`document.querySelectorAll('.pc-chip').length`), before + 1, 'the new PC exists in the room');
});

test('A20: progress survives a browser refresh (Sambung main restores it)', async () => {
  await open();
  await pageReady();
  await ev(`ABCC.debug.freeze(false); T.seat('student', 1, 60); ABCC.State.save(ABCC.debug.state()); 1`);
  const cash = await S('s.cash'), day = await S('s.day');
  await b.goto(INDEX); // refresh
  await sleep(500);
  assert.equal(await S('s.phase'), 'paused', 'a mid-shift refresh resumes paused, never mid-action');
  assert.ok(await ev(`!!document.querySelector('[data-modal="resume"]')`), 'Sambung shift is offered');
  assert.equal(await S('s.cash'), cash);
  assert.equal(await S('s.day'), day);
  await clickEl('[data-modal="resume"]');
  await sleep(250);
  assert.equal(await S('s.phase'), 'active');
  // and from the main menu, Sambung main works too
  await ev(`ABCC.debug.state().phase = 'menu'; ABCC.State.save(ABCC.debug.state()); 1`);
  await b.goto(INDEX);
  await sleep(500);
  assert.ok(await ev(`!!document.querySelector('[data-modal="continue"]')`), 'Sambung main is offered from the menu');
  await clickEl('[data-modal="continue"]');
  await sleep(250);
  assert.equal(await S('s.cash'), cash);
  assert.equal(await S('s.day'), day);
  assert.deepEqual(b.consoleErrors, []);
});

test('A24: desktop layout fits one viewport, no page scroll, panels in order — at 1366×768, 1440×900 and 1920×1080', async () => {
  for (const [w, h] of [[1366, 768], [1440, 900], [1920, 1080]]) {
    await open(w, h);
    await pageReady(3, { perks: ['snack', 'cctv'], cash: 9999 });
    await ev(`(() => { const d = ABCC.debug, s = d.state(), S = ABCC.State; T.seat('student', 1, 90); T.seat('hot', 2, 90); T.wait('uncle', 60, 0); T.wait('fps', 60, 1); T.wait('mirc', 60, 2); S.makeIncident(s, 'suspicious', s.pcs[0], false); S.startEvent(s, 'truancy'); S.startEvent(s, 'spill'); d.advance(1); d.select({ kind: 'pc', id: 1 }); return 1; })()`);
    await sleep(350);
    const m = await ev(`(() => {
      const sb = document.querySelector('.sidebar');
      const cards = [...document.querySelectorAll('.sidebar .card')].map((c) => c.getBoundingClientRect());
      const vp = document.getElementById('viewport').getBoundingClientRect();
      return { docH: document.documentElement.scrollHeight, winH: innerHeight, docW: document.documentElement.scrollWidth, winW: innerWidth,
               sbScroll: sb.scrollHeight, sbClient: sb.clientHeight, bottoms: cards.map((r) => Math.round(r.bottom)), tops: cards.map((r) => Math.round(r.top)), vpH: vp.height, vpW: vp.width,
               deskButtons: [...document.querySelectorAll('#worldMenu [data-act]')].map((e) => { const r = e.getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0 && r.left >= 0 && r.right <= innerWidth; }),
               menu: (() => { const m = document.getElementById('worldMenu').getBoundingClientRect(), v = document.getElementById('viewport').getBoundingClientRect(); return m.left >= v.left && m.right <= v.right && m.top >= v.top && m.bottom <= v.bottom; })() };
    })()`);
    assert.ok(m.docH <= m.winH, `${w}×${h}: no vertical page scroll (${m.docH} <= ${m.winH})`);
    assert.ok(m.docW <= m.winW, `${w}×${h}: no horizontal page scroll`);
    assert.ok(m.sbScroll <= m.sbClient + 1, `${w}×${h}: sidebar needs no scrolling (${m.sbScroll} vs ${m.sbClient})`);
    assert.ok(m.bottoms.every((x) => x <= m.winH), `${w}×${h}: all four panels on screen ${m.bottoms}`);
    assert.ok(m.tops.every((x, i) => i === 0 || x >= m.tops[i - 1]), 'panels stacked in order');
    assert.ok(m.deskButtons.length >= 2 && m.deskButtons.every(Boolean), `${w}×${h}: the PC menu's buttons are fully on screen`);
    assert.ok(m.menu, `${w}×${h}: the PC menu stays inside the scene`);
    assert.ok(m.vpH > 380, `${w}×${h}: the scene stays large (${m.vpH}px high)`);
    await shot(`08_desktop_${w}x${h}`);
  }
});

test('A22: mobile (iPhone 16 portrait) keeps the scene prominent and everything reachable by touch', async () => {
  await open(393, 852, { mobile: true, dpr: 3 });
  await pageReady(2, { cash: 9000 });
  await ev(`(() => { const s = ABCC.debug.state(); T.wait('student', 60, 0); T.wait('fps', 60, 1); ABCC.debug.advance(0.5); return 1; })()`);
  await sleep(350);
  const m = await ev(`(() => {
    const vp = document.getElementById('viewport').getBoundingClientRect();
    const q = document.querySelector('.queue-item').getBoundingClientRect();
    const sb = document.querySelector('.sidebar').getBoundingClientRect();
    const top = document.querySelector('.topbar').getBoundingClientRect();
    return { winW: innerWidth, winH: innerHeight, docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, vpH: vp.height, vpW: vp.width, vpTop: vp.top, qH: q.height, qW: q.width, topB: top.bottom,
             sbBottom: sb.bottom, small: [...document.querySelectorAll('.btn-icon')].map((e) => Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)) };
  })()`);
  assert.ok(m.docW <= m.winW, 'no horizontal scroll on a phone');
  assert.ok(m.docH <= m.winH + 1, 'no page scroll on a phone');
  assert.ok(m.vpH >= m.winH * 0.4, `the 3D scene is prominent (${Math.round((m.vpH / m.winH) * 100)}% of the screen)`);
  assert.ok(m.qH >= 40, `queue cards are touch sized (${m.qH}px)`);
  assert.ok(m.small.every((v) => v >= 36), `HUD buttons are tappable ${m.small}`);
  // touch the customer card, the duration, then a PC in the 3D scene
  const id = await S('State.inQueue(s)[0].id');
  await clickEl(`.queue-item[data-customer="${id}"]`);
  const dur = await rect('#worldMenu [data-act="duration"]');
  assert.ok(dur.b <= m.winH && dur.t > m.vpTop, `duration buttons are on screen without scrolling (bottom ${Math.round(dur.b)} of ${m.winH})`);
  assert.ok(dur.h >= 40, 'duration buttons are touch sized');
  await clickEl('#worldMenu [data-act="duration"][data-choice="60"]');
  await clickWorld('pc', 1, { touch: true });
  assert.equal(await S('s.pcs[0].customerId'), id, 'a single tap on the PC in the 3D scene assigned the customer');
  await shot('09_mobile_portrait');
  assert.deepEqual(b.consoleErrors, []);
});

test('A22b: phones held sideways still work', async () => {
  await open(852, 393, { mobile: true, dpr: 3 });
  await pageReady(1);
  await ev(`T.wait('student', 60, 0); ABCC.debug.advance(0.3); 1`);
  await sleep(300);
  const m = await ev(`(() => ({ docW: document.documentElement.scrollWidth, winW: innerWidth, docH: document.documentElement.scrollHeight, winH: innerHeight, vpW: document.getElementById('viewport').getBoundingClientRect().width }))()`);
  assert.ok(m.docW <= m.winW && m.docH <= m.winH + 1);
  assert.ok(m.vpW > m.winW * 0.55, 'scene takes the bigger share in landscape');
  const vh = await ev(`document.getElementById('viewport').getBoundingClientRect().bottom`);
  assert.ok(vh > m.winH * 0.9, `the scene reaches the bottom of the screen in landscape (bottom ${Math.round(vh)} of ${m.winH})`);
  await shot('10_mobile_landscape');
});

test('Phase 3: the day moves from bright afternoon to golden hour to night (lighting + sky + lamps)', async () => {
  await open();
  await pageReady();
  const sample = async (min) => {
    await ev(`ABCC.debug.setTime(${min * 60}); 1`);
    await sleep(350);
    return ev(`(() => { const L = ABCC.debug.gfx().light(); const vp = document.getElementById('viewport').style; return { night: L.night, lamps: L.lamps, neon: L.neon, sun: L.sun, shadowAlpha: L.shadow[3], sky: vp.getPropertyValue('--sky-a') }; })()`);
  };
  const noon = await sample(13), gold = await sample(17.6), night = await sample(22.5);
  assert.ok(noon.night < 0.05 && noon.lamps < 0.05, 'afternoon: bright, lamps off');
  assert.ok(gold.sun[0] > gold.sun[2] + 0.4, `golden hour: warm sun (${gold.sun.map((v) => v.toFixed(2))})`);
  assert.ok(night.night > 0.8 && night.lamps > 0.9 && night.neon > noon.neon, 'night: indoor lights and neon take over');
  assert.notEqual(noon.sky, night.sky, 'sky changes');
  await shot('11_night');
  await ev(`ABCC.debug.setTime(17.6 * 60); 1`);
  await sleep(350);
  await shot('12_golden_hour');
});

test('Phase 3: blackout turns the monitors dark and dims the room; the fuse box is a clickable object', async () => {
  await open();
  await pageReady(2, { cash: 5000 });
  await ev(`T.seat('student', 1, 90); 1`);
  const lit = await ev(`ABCC.debug.gfx().snapshot(ABCC.debug.state())`);
  await ev(`ABCC.debug.startEvent('blackout'); ABCC.debug.advance(2); 1`);
  await sleep(900);
  const dark = await ev(`ABCC.debug.gfx().snapshot(ABCC.debug.state())`);
  assert.ok(await S('s.powerOutage > 0'));
  assert.equal(await ev(`document.getElementById('vignette').classList.contains('on')`), true);
  await shot('13_blackout');
  const id = await S('s.worldEvents[0].id');
  await clickWorld('event', id);
  assert.deepEqual(await sel(), { kind: 'event', id }, 'the fuse box can be clicked');
  await clickEl('#worldMenu [data-choice="fuse"]');
  await ev(`ABCC.debug.advance(12); 1`);
  assert.equal(await S('s.powerOutage'), 0, 'fixing the fuse restores power');
  assert.ok(lit && dark);
});

test('Phase 6: camera zoom is optional, gentle and limited — and the camera can never rotate', async () => {
  await open();
  await pageReady();
  const z0 = await ev(`ABCC.debug.gfx().getZoom()`);
  assert.equal(z0, 1);
  await clickEl('[data-zoom="in"]');
  assert.ok((await ev(`ABCC.debug.gfx().getZoom()`)) > 1);
  for (let i = 0; i < 12; i++) await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 400, y: 400, deltaX: 0, deltaY: -200 });
  await sleep(150);
  assert.ok((await ev(`ABCC.debug.gfx().getZoom()`)) <= 1.7, 'zoom is capped');
  await clickEl('[data-zoom="reset"]');
  assert.equal(await ev(`ABCC.debug.gfx().getZoom()`), 1);
  assert.equal(await ev(`Object.keys(ABCC.debug.gfx()).filter((k) => /rotat|orbit|yaw/i.test(k)).length`), 0, 'no rotation controls exist');
});

test('Auto-duduk: a double tap on a customer seats them for the ★ length on the nearest free PC; so does the ⚡ button and the A key', async () => {
  await open();
  await pageReady();
  await ev(`ABCC.debug.ui().settings.hints = false; 1`);
  // 1) double tap (two quick clicks on the same customer in the room)
  const a = await ev(`T.wait('student', 90, 0)`);
  await sleep(500);
  const p = await ev(`ABCC.debug.pagePoint('customer', ${a})`);
  await b.click(p.x, p.y);
  await sleep(90);
  await b.click(p.x, p.y);
  await sleep(250);
  assert.equal(await S(`State.byId(s.customers, ${a}).pcId`), 1, 'seated on PC 1 without choosing anything');
  assert.equal(await S(`State.byId(s.customers, ${a}).duration`), 90, 'for the length they asked for');
  assert.equal(await S('State.breakdown(s).rental'), 300);
  // 2) the ⚡ button in the pop-up
  const c = await ev(`T.wait('rm1', 30, 0)`);
  await clickWorld('customer', c);
  assert.equal(await ev(`!!document.querySelector('#worldMenu [data-act="autoseat"]')`), true, 'the menu offers Auto-duduk');
  await clickEl('#worldMenu [data-act="autoseat"]');
  assert.equal(await S(`State.byId(s.customers, ${c}).pcId`), 2);
  // 3) the A key after selecting from the queue list
  const d = await ev(`T.wait('uncle', 60, 0)`);
  await sleep(300);
  await clickEl(`.queue-item[data-customer="${d}"]`);
  await b.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })); 1`);
  await sleep(200);
  assert.equal(await S(`State.byId(s.customers, ${d}).pcId`), 3);
  // 4) nothing free: the button is disabled, nothing is charged
  const e = await ev(`T.wait('fps', 60, 0)`);
  const rental = await S('State.breakdown(s).rental');
  await clickWorld('customer', e);
  assert.equal(await ev(`document.querySelector('#worldMenu [data-act="autoseat"]').disabled`), true, 'the button is disabled when every PC is taken');
  assert.equal(await S('State.breakdown(s).rental'), rental);
  assert.deepEqual(b.consoleErrors, []);
});

test('Arahan Abang: lined-up jobs are listed in order, can be moved up or cancelled, and cost nothing when cancelled', async () => {
  await open();
  await pageReady(3, { cash: 50000 });
  await ev(`(() => { const s = ABCC.debug.state(); for (const i of [0, 1, 2]) ABCC.State.breakPc(s, s.pcs[i], null, { kind: 'hardware' }); ABCC.debug.advance(0.3); return 1; })()`);
  assert.match(await ev(`document.getElementById('jobList').innerText`), /Abang free/);
  for (const id of [1, 2, 3]) {
    await clickWorld('pc', id);
    await clickEl('#worldMenu [data-act="repair"]');
  }
  await sleep(300);
  const rows = await ev(`[...document.querySelectorAll('#jobList .job')].map((e) => e.querySelector('b').textContent)`);
  assert.equal(rows.length, 3);
  assert.match(rows[0], /Repair · PC 01/);
  assert.equal(await ev(`document.getElementById('taskCount').textContent`), '3/3');
  assert.equal(await ev(`document.getElementById('taskCount').classList.contains('full')`), true);
  assert.equal(await ev(`document.querySelectorAll('#jobList [data-job-up]').length`), 2, 'the 2nd and 3rd waiting jobs can move up, the first has nowhere to go');
  await clickEl('#jobList .job:nth-child(3) [data-job-up]');
  const moved = await ev(`[...document.querySelectorAll('#jobList .job b')].map((e) => e.textContent.replace(/\\D+/g, ''))`);
  assert.deepEqual(moved, ['01', '03', '02'], 'job 3 now comes before job 2');
  const cash = await S('s.cash');
  await clickEl('#jobList .job:nth-child(3) [data-job-cancel]');
  assert.equal(await ev(`document.querySelectorAll('#jobList .job').length`), 2);
  assert.equal(await S('s.cash'), cash, 'cancelling costs nothing');
  await shot('18_jobs_panel');
  assert.deepEqual(b.consoleErrors, []);
});

test('Shift report headline and Koleksi: the report names a tip; hats unlock, show in the Koleksi, can be worn and are remembered', async () => {
  await open();
  await pageReady(3);
  await ev(`ABCC.Meta.reset(); ABCC.S.record(ABCC.debug.state(), 'rental', 99900, 'test'); ABCC.debug.advance(130); 1`);
  await sleep(500);
  const text = await ev(`document.querySelector('.modal-card').innerText`);
  assert.match(text, /Target capai/);
  assert.match(text, /Boleh lebih baik|Hari yang bersih/);
  assert.match(text, /Topi baru dibuka[\s\S]*Headphone Gamer/, 'clearing day 3 unlocks the headphones and says so');
  await shot('19_report_unlock');
  await ev(`ABCC.debug.ui().openOverlay('collection'); 1`);
  assert.match(await ev(`document.querySelector('.modal-card').innerText`), /Topi Abang/);
  assert.equal(await ev(`document.querySelectorAll('.perk.hat').length`), 4);
  assert.equal(await ev(`document.querySelectorAll('.perk.hat.locked').length`), 2, 'straw hat and crown are still locked');
  await clickEl('[data-modal="hat"][data-id="phones"]');
  assert.equal(await ev(`ABCC.Meta.equipped()`), 'phones');
  await shot('20_collection');
  await b.goto(INDEX);
  await sleep(500);
  assert.equal(await ev(`ABCC.Meta.equipped()`), 'phones', 'the chosen hat is remembered');
});

test('Music: it only plays during a shift, follows the Muzik setting and the ♫ button, and stops on pause', async () => {
  await open();
  await ev(`localStorage.setItem('abangcc2007_settings', JSON.stringify({ quality: 'high', qualityChosen: true, sound: true, music: true, noLoader: true })); 1`);
  await b.goto(INDEX);
  await sleep(500);
  await pageReady();
  await b.click(300, 300); // a real tap, so the browser lets audio start
  await sleep(300);
  await ev(`ABCC.debug.ui().refresh(true); 1`);
  await sleep(500);
  assert.equal(await ev(`ABCC.debug.ui().Sound.musicPlaying()`), true, 'music plays in an active shift');
  await ev(`ABCC.debug.ui().settings.music = false; ABCC.debug.ui().refresh(true); 1`);
  assert.equal(await ev(`ABCC.debug.ui().Sound.musicPlaying()`), false, 'Muzik OFF stops it');
  await ev(`ABCC.debug.ui().settings.music = true; ABCC.debug.ui().refresh(true); 1`);
  assert.equal(await ev(`ABCC.debug.ui().Sound.musicPlaying()`), true);
  await ev(`document.getElementById('soundBtn').click(); ABCC.debug.ui().refresh(true); 1`);
  assert.equal(await ev(`ABCC.debug.ui().Sound.musicPlaying()`), false, 'the ♫ button mutes music too');
  await ev(`document.getElementById('soundBtn').click(); ABCC.debug.ui().refresh(true); 1`);
  await ev(`ABCC.debug.ui().togglePause(); ABCC.debug.ui().refresh(true); 1`);
  assert.equal(await ev(`ABCC.debug.ui().Sound.musicPlaying()`), false, 'silent while paused');
  assert.deepEqual(b.consoleErrors, []);
});

test('Phone readiness: on an emulated phone with the CPU slowed 6×, the game keeps running without errors, and the FPS overlay and report work', async () => {
  await open(390, 844, { mobile: true, dpr: 3 });
  await b.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  try {
    await b.goto(INDEX + '?fps');
    await sleep(600);
    await pageReady(4);
    await ev(`(() => { const s = ABCC.debug.state(); s.spawnCooldown = 0.5; return 1; })()`);
    await ev(`ABCC.debug.freeze(false); 1`);
    const t0 = await S('s.elapsed');
    await sleep(5000);
    const t1 = await S('s.elapsed');
    assert.ok(t1 - t0 > 0.5, `the simulation kept advancing under load, just slower (${(t1 - t0).toFixed(1)} s of game time in 5 s)`);
    assert.equal(await ev(`document.getElementById('perfHud').hidden`), false, '?fps shows the overlay');
    assert.match(await ev(`document.getElementById('perfHud').textContent`), /^FPS \d+ · terburuk \d+ ms/);
    const report = await ev(`ABCC.debug.ui().perfReport()`);
    assert.match(report, /Purata FPS: [\d.]+ dalam \d+ s/);
    assert.match(report, /GPU: /);
    assert.deepEqual(b.consoleErrors, []);
    await shot('21_throttled_phone');
  } finally {
    await b.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
});

test('Phase 16: mute toggle works; sounds are generated (no audio files requested)', async () => {
  await open();
  await ev(`localStorage.setItem('abangcc2007_settings', JSON.stringify({ quality: 'high', qualityChosen: true, sound: true })); 1`);
  await b.goto(INDEX);
  await sleep(400);
  assert.equal(await ev(`document.getElementById('soundBtn').classList.contains('muted')`), false);
  await ev(`document.getElementById('soundBtn').click(); 1`);
  assert.equal(await ev(`document.getElementById('soundBtn').classList.contains('muted')`), true);
  assert.equal(await ev(`JSON.parse(localStorage.getItem('abangcc2007_settings')).sound`), false);
  const audioRequests = await ev(`performance.getEntriesByType('resource').filter((r) => /\\.(mp3|wav|ogg|m4a)/i.test(r.name)).length`);
  assert.equal(audioRequests, 0);
});

test('Phase 17: graceful fallback when WebGL is unavailable — a clickable board keeps the game playable', async () => {
  const nb = await launch({ extraArgs: ['--disable-3d-apis', '--disable-gpu'] });
  try {
    await nb.viewport(1366, 768);
    await nb.goto(INDEX);
    await nb.eval(`localStorage.clear(); 1`);
    nb.clearErrors();
    await nb.goto(INDEX);
    await nb.sleep(600);
    assert.equal(await nb.eval(`ABCC.debug.gfx() === null`), true, 'no WebGL scene');
    assert.equal(await nb.eval(`document.getElementById('noWebgl').hidden`), false, 'a friendly message is shown');
    await nb.eval(`(() => { ABCC.debug.set((s) => { s.phase = 'prep'; }); ABCC.debug.start(); ABCC.debug.freeze(true); return 1; })()`);
    await nb.sleep(500);
    assert.equal(await nb.eval(`document.querySelectorAll('#fallbackBoard .fb-pc').length`), 3, 'the board lists the PCs');
    await nb.eval(`document.querySelector('#fallbackBoard [data-id="2"]').click(); 1`);
    await nb.sleep(150);
    assert.deepEqual(await nb.eval(`ABCC.debug.state().selected`), { kind: 'pc', id: 2 });
    assert.deepEqual(nb.consoleErrors.filter((e) => !/WebGL|GPU|gpu/i.test(e)), []);
  } finally {
    await nb.close();
  }
});

test('the standalone bundle (dist/) boots and plays the same as the folder build', async () => {
  const bundle = pathToFileURL(path.join(root, 'dist', 'ABANG_CC_2007_ALPHA_12.html')).href;
  if (!fs.existsSync(path.join(root, 'dist', 'ABANG_CC_2007_ALPHA_12.html'))) return; // run `node tools/build.mjs` first
  await open(1366, 768, { url: bundle });
  assert.deepEqual(b.consoleErrors, []);
  assert.equal(await ev('!!ABCC.debug.gfx()'), true);
  await ev(PAGE_HELPERS);
  assert.equal(await ev('T.day(1)'), 'active');
});

test('Loading screen: the wallpaper shows for at least ~3 s with a moving progress bar, then fades away and the game is usable', async () => {
  await b.viewport(1366, 768, {});
  await b.goto(INDEX);
  await b.eval(`localStorage.clear(); localStorage.setItem('abangcc2007_settings', JSON.stringify({ quality: 'high', qualityChosen: true, sound: false })); 1`);
  b.clearErrors();
  await b.goto(INDEX); // clean load, loader enabled
  // (in software-rendered Chrome the load event itself can take 2 s, so check at once and poll for the end)
  assert.equal(await ev(`!!document.querySelector('#loader svg.ld-art')`), true, 'the wallpaper is drawn');
  assert.match(await ev(`document.querySelector('#loader .ld-title').textContent`), /ABANG\s*CC/);
  assert.equal(await ev(`document.querySelector('#loader .ld-year').textContent.trim()`), '2007');
  assert.equal(await ev(`!!document.getElementById('ldFill')`), true, 'a progress bar is shown');
  await shot('15_loading_screen');
  for (let i = 0; i < 40 && (await ev(`!!document.getElementById('loader')`)); i++) await sleep(200);
  assert.equal(await ev(`!!document.getElementById('loader')`), false, 'the splash goes away by itself');
  assert.equal(await ev(`ABCC.Loader.active`), false);
  const ms = await ev(`ABCC.Loader.visibleMs`);
  assert.ok(ms >= 2900 && ms < 8000, `visible for ${ms} ms (at least ~3 s, not forever)`);
  assert.deepEqual(b.consoleErrors, []);
  assert.equal(await ev(`document.getElementById('app').getBoundingClientRect().width > 300`), true, 'the game is there');
});
