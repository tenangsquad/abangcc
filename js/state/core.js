/* ==========================================================================
   2a. STATE CORE — shared internals for every state module (no DOM, no drawing)
   --------------------------------------------------------------------------
   Everything the player can change lives in one plain object `s`, which makes
   saving, retrying a day and testing trivial. Money is stored in sen (RM1 = 100).
   Modules attach their public functions to ns.State; shared helpers live on ns.S.
   ========================================================================== */
(function (ns) {
  'use strict';

  const { CFG, clamp } = ns;

  /** Transient cues for the UI (sounds, popups). Never saved. */
  const fxQueue = [];
  const emit = (type, data = {}) => {
    if (fxQueue.length < 120) fxQueue.push({ type, ...data });
  };
  const drainFx = () => fxQueue.splice(0, fxQueue.length);

  /** Deterministic LCG so a saved run replays the same way. */
  function random(s) {
    s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
    return s.seed / 4294967296;
  }
  const choice = (s, list) => list[Math.floor(random(s) * list.length)];
  const chance = (s, p) => random(s) < p;
  /** Pick one item by weight. `weightOf(item)` may return 0 to exclude. */
  function weighted(s, items, weightOf) {
    const weights = items.map((it) => Math.max(0, weightOf(it)));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    let roll = random(s) * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i];
      if (roll < 0) return items[i];
    }
    return items[items.length - 1];
  }
  const between = (s, [lo, hi]) => lo + random(s) * (hi - lo);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const ok = (msg, extra) => ({ ok: true, msg, ...extra });
  const fail = (msg) => ({ ok: false, msg });
  /** Add `delta` to a 0–100 stat (rep, professionalism, compliance, risk). */
  const bump = (s, key, delta) => {
    s[key] = clamp(s[key] + delta, 0, 100);
  };
  const minutesNow = (s) => CFG.DAY_START_MINUTES + s.elapsed * CFG.GAME_MINUTE_RATE;
  const hourNow = (s) => (minutesNow(s) / 60) % 24;

  function log(s, msg) {
    s.logs.unshift({ at: minutesNow(s), msg });
    s.logs = s.logs.slice(0, 32);
  }

  /* ---------- bookkeeping ----------
     Every cash movement goes through record(). Each ledger kind belongs to exactly one
     category, so "today's rental sales", "other sales", "refunds", "bills" and "expenses" always
     add up to what really happened to the cash. Loans are cash but never sales. */
  const CATEGORY = {
    rental: 'rental',
    snack: 'other', hero: 'other', promo: 'other', download_tip: 'other', walkin: 'other', tourney: 'other', recovered: 'other', printing: 'other', tip: 'other',
    refund: 'refund', restart_penalty: 'refund', accusation_refund: 'refund',
    loan: 'loan',
    rent: 'bill', electric: 'bill', internet: 'bill', wage: 'bill', // monthly; everything else that costs money is "belanja"
  };
  const catOf = (kind) => CATEGORY[kind] || 'expense';

  /** Book a cash movement in the shift ledger and apply it to the cash balance. */
  function record(s, kind, amount, label) {
    amount = Math.round(amount);
    s.cash += amount;
    const entry = { id: ++s.ledgerSequence, kind, cat: catOf(kind), amount, label };
    s.shiftLedger.push(entry);
    // the end-of-day recap wants to know when the takings came in: one bucket per game hour (10 real seconds)
    if (amount > 0 && (entry.cat === 'rental' || entry.cat === 'other') && s.shiftStats?.hourly && s.phase === 'active') {
      const hour = Math.max(0, Math.min(s.shiftStats.hourly.length - 1, Math.floor(s.elapsed / 10)));
      s.shiftStats.hourly[hour] += amount;
    }
    return entry;
  }
  /** Count a customer who stormed off, by who they were, for the end-of-day recap. */
  function noteWalkout(s, c, why) {
    const st = s.shiftStats;
    if (!st || !c) return;
    st.walkByType = st.walkByType || {};
    st.walkByType[c.type] = (st.walkByType[c.type] || 0) + 1;
    st.lastWalk = { type: c.type, why };
  }
  /** Idempotent charge/refund: the same key can only ever be booked once per shift (duplicate-click safe). */
  function recordOnce(s, key, kind, amount, label) {
    s.once = s.once || {};
    if (s.once[key]) return null;
    s.once[key] = 1;
    return record(s, kind, amount, label);
  }

  ns.S = { emit, drainFx, random, choice, chance, weighted, between, clone, ok, fail, bump, minutesNow, hourNow, log, record, recordOnce, catOf, noteWalkout };
})(window.ABCC);
