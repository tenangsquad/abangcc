/* ==========================================================================
   2b. ECONOMY & DIRECTOR — prices, bookkeeping, perk modifiers, difficulty
   ========================================================================== */
(function (ns) {
  'use strict';

  const { CFG, RENTAL, DIRECTOR, PERKS, GAMES, TIERS, tierIndexFor, byId, priceForMinutes } = ns;
  const S = ns.S;

  /* ---------- perks as modifiers ---------- */
  const perkDef = (id) => byId(PERKS, id);
  const perkCount = (s, id) => (s.perks || []).filter((x) => x === id).length;
  const hasPerk = (s, id) => perkCount(s, id) > 0;
  const perkOwnedOut = (s, id) => perkCount(s, id) >= (perkDef(id)?.repeatMax || 1);

  const modCache = new WeakMap();
  /** Sum of every owned perk's `mods` (each perk counts once per copy). */
  function perkMods(s) {
    const key = (s.perks || []).join(',');
    const hit = modCache.get(s);
    if (hit && hit.key === key) return hit.mods;
    const mods = {};
    for (const id of s.perks || []) for (const [k, v] of Object.entries(perkDef(id)?.mods || {})) mods[k] = (mods[k] || 0) + v;
    modCache.set(s, { key, mods });
    return mods;
  }
  const mod = (s, key) => perkMods(s)[key] || 0;

  /** 0 = nothing, 1 = Kipas Siling, 2 = Aircond Mudah Alih, 3 = Aircond Kedai (the highest cooling unit the shop owns). */
  function coolLevel(s) {
    let level = 0;
    for (const id of s.perks || []) level = Math.max(level, perkDef(id)?.line === 'cooling' ? perkDef(id).rank : 0);
    return level;
  }
  /** How much a cooling level scales the chance of an overheating PC, and the patience it adds to every new customer. */
  const OVERHEAT_BY_COOL = [1, 0.7, 0.35, 0.1];
  const PATIENCE_BY_COOL = [0, 2, 4, 6];
  const overheatMult = (s) => OVERHEAT_BY_COOL[coolLevel(s)];
  const coolPatience = (s) => PATIENCE_BY_COOL[coolLevel(s)];

  /** What a perk costs this shop right now: upgrading a perk line trades in the previous unit for half its price. */
  function perkPrice(s, id) {
    const def = perkDef(id);
    if (!def) return 0;
    return def.price - tradeIn(s, def);
  }
  /** The unit of the same line this perk would replace (or null) and the credit it brings. */
  function replacedBy(s, def) {
    return def?.line ? (s.perks || []).map(perkDef).find((p) => p && p.line === def.line && p.rank < def.rank) || null : null;
  }
  const tradeIn = (s, def) => {
    const old = replacedBy(s, def);
    return old ? Math.round((old.price * CFG.UPGRADE_CREDIT) / 50) * 50 : 0;
  };

  /* ---------- reputation tiers ---------- */
  const tierIndex = (s) => clampTier(TIERS.findIndex((t) => t.id === s.repTier));
  const clampTier = (i) => (i < 0 ? 0 : i);
  const tierOf = (s) => TIERS[tierIndex(s)];
  /** Called every tick: moves the shop to the tier its reputation now deserves. Returns the new tier when it changed. */
  function updateTier(s) {
    const now = tierIndex(s);
    const next = tierIndexFor(s.rep, now);
    if (next === now) return null;
    s.repTier = TIERS[next].id;
    const up = next > now;
    S.log(s, up ? `${TIERS[next].emoji} Taraf naik: ${TIERS[next].name}!` : `📉 Taraf turun: ${TIERS[next].name}.`);
    S.emit('tier', { id: TIERS[next].id, up });
    if (ns.Meta?.recordTier) ns.Meta.recordTier(next);
    (s.shiftStats.tierMoves = s.shiftStats.tierMoves || []).push({ id: TIERS[next].id, up });
    return TIERS[next];
  }
  const taskSpeedMult = (s) => 1 + mod(s, 'taskSpeed');

  /* ---------- the difficulty director ---------- */
  const preset = (s) => DIRECTOR.presets[s.preset] || DIRECTOR.presets.biasa;
  const extraPcs = (s) => Math.max(0, s.pcs.length - 3);

  /** The single "how hard is it" number most systems read. */
  function pressure(s) {
    const P = DIRECTOR.pressure;
    return (P.base + (s.day - 1) * P.perDay + (s.perks?.length || 0) * P.perPerk + extraPcs(s) * P.perExtraPc) * preset(s).pressure;
  }

  /** Seconds until the next customer walks in. */
  function spawnInterval(s) {
    const D = DIRECTOR.spawn;
    const p = pressure(s) + (s.peakActive ? D.peakBonus : 0) + extraPcs(s) * D.perExtraPc;
    const base = s.peakActive ? D.peakEvery : D.normalEvery;
    const jitter = D.jitter[0] + S.random(s) * (D.jitter[1] - D.jitter[0]);
    const popularity = Math.max(0.6, 1 + mod(s, 'spawn') + tierOf(s).spawn + (s.rep - 55) * D.repEffect); // reputation brings (or scares off) customers
    return (base * jitter) / (Math.max(D.minPressure, p * D.pressureScale) * popularity);
  }

  /** How fast waiting customers lose patience (1 = one second per second). */
  function patienceDrain(s) {
    const D = DIRECTOR.patience;
    let drain = 1;
    if (s.peakActive) drain *= D.peakMult;
    if (s.day >= D.lateFromDay) drain *= D.lateMult;
    drain *= 1 + extraPcs(s) * D.perExtraPc;
    drain *= Math.max(0.3, 1 + mod(s, 'patienceDrain') + tierOf(s).patienceDrain);
    drain /= preset(s).patience;
    // professionalism: a well-run shop is a calmer shop (±12 %)
    drain *= 1 - ((s.professionalism - 50) / 50) * 0.12;
    if (s.activeIssues?.some((e) => e.type === 'loudvideo')) drain *= D.loudMult;
    if (s.powerOutage > 0) drain *= D.blackoutMult;
    return drain;
  }

  /** Seconds between random bits of trouble. */
  function troubleInterval(s) {
    const D = DIRECTOR.trouble;
    const scale = D.dayScale[Math.min(s.day - 1, D.dayScale.length - 1)];
    if (scale <= 0) return Infinity; // day 1: only the scripted tutorial beats
    const p = pressure(s) + (s.peakActive ? D.peakPressure : 0);
    return Math.max(D.min, ((s.peakActive ? D.peakEvery : D.normalEvery) - p * D.perPressure) / (preset(s).trouble * scale));
  }

  /** Chance that a PC hangs the moment a customer sits down. */
  function faultChance(s, pc) {
    const D = DIRECTOR.faults;
    const extra = pressure(s) * D.perPressure + extraPcs(s) * D.perExtraPc;
    const base = pc.health >= D.healthHigh ? D.chanceHigh : pc.health >= D.healthMid ? D.chanceMid : D.chanceLow;
    return base + extra;
  }

  /** Daily revenue target in sen: RM30 on day 1, +RM2 a day through day 20, then +RM1 (see DIRECTOR.goal). */
  function goalFor(s, day = s.day) {
    const G = DIRECTOR.goal;
    let rm = G.start;
    for (let d = 2; d <= day; d++) rm += G.steps.find((st) => d <= st.untilDay).perDay;
    return rm * 100;
  }

  /* ---------- prices ---------- */
  const isTier2 = (pc, game) => pc.tier >= 2 && game !== 'puzzle';
  /** Price (sen) of a session of `minutes` on `pc` playing `game`. */
  function priceFor(minutes, pc, game) {
    const base = priceForMinutes(minutes);
    return Math.round(isTier2(pc, game) ? base * RENTAL.tier2Multiplier : base);
  }
  /** Prices as shown on the three duration buttons for PC `pc` (null = base list). */
  const priceList = (pc, game) => RENTAL.durations.map((m) => ({ minutes: m, price: priceFor(m, pc || { tier: 1 }, game) }));

  /* ---------- bookkeeping ---------- */
  /**
   * Everything that happened to the cash this shift, by category:
   *   rental / other   sales (count toward the target)        refunds  negative, reduce the sales
   *   bills            monthly rent + utilities (only on billing day)
   *   expenses         "belanja": anything else that was actually spent (repairs, fuse, perks, perk upkeep …)
   * `net` = sales minus refunds is what the target is judged on. Bills and expenses are never sales.
   */
  function breakdown(s) {
    const b = { rental: 0, other: 0, refunds: 0, bills: 0, expenses: 0, loan: 0 };
    for (const e of s.shiftLedger || []) {
      if (e.cat === 'rental') b.rental += e.amount;
      else if (e.cat === 'other') b.other += e.amount;
      else if (e.cat === 'refund') b.refunds += e.amount; // negative
      else if (e.cat === 'loan') b.loan += e.amount;
      else if (e.cat === 'bill') b.bills += -e.amount;
      else b.expenses += -e.amount;
    }
    b.net = b.rental + b.other + b.refunds; // qualifying sales minus refunds
    return b;
  }
  /** Revenue progress toward the target: qualifying sales minus refunds. Expenses never count as sales. */
  const shiftTakings = (s) => breakdown(s).net;

  /** Strict bookkeeping check: the cash must equal the cash at the start of the shift plus every ledger entry. */
  function audit(s) {
    const sum = (s.shiftLedger || []).reduce((t, e) => t + e.amount, 0);
    const expected = (s.shiftStartCash ?? s.cash) + sum;
    return { ok: expected === s.cash, expected, cash: s.cash, diff: s.cash - expected };
  }

  /** Rent and utilities are paid once per "month" (CFG.BILL_CYCLE_DAYS days), at the end of that day's shift. */
  const isBillDay = (s, day = s.day) => day % CFG.BILL_CYCLE_DAYS === 0;
  /** Days left until the next bills are due, counting today (1 = they are paid at the end of today's shift). */
  const daysToBills = (s, day = s.day) => CFG.BILL_CYCLE_DAYS - ((day - 1) % CFG.BILL_CYCLE_DAYS);
  /** What the monthly bill would be right now (sen). Electricity grows with the number of PCs. */
  function monthlyBills(s) {
    const C = CFG.COSTS;
    const electric = C.electric + extraPcs(s) * C.perPcElectric;
    const assistant = s.assistant ? CFG.ASSISTANT.wage : 0; // paid every month, sick leave or not
    return { rent: C.rent, electric, internet: C.internet, assistant, total: C.rent + electric + C.internet + assistant };
  }
  /** Daily upkeep of the perks the shop owns (sen) — booked as belanja when it is paid, only if there is any. */
  const perkUpkeep = (s) => (s.perks || []).reduce((sum, id) => sum + (perkDef(id)?.upkeep || 0), 0);

  /** How many online players the shop's connection can carry. */
  const capBandwidth = (s) => 6 + mod(s, 'bandwidth');
  const bandwidth = (s) => s.pcs.reduce((sum, p) => sum + (p.status === 'busy' && byId(GAMES, p.sessionGame)?.online ? 1 : 0), 0);

  Object.assign(S, { coolLevel, overheatMult, coolPatience, perkPrice, replacedBy, tierOf, tierIndex, updateTier, perkDef, perkCount, hasPerk, perkOwnedOut, perkMods, mod, taskSpeedMult, preset, extraPcs, pressure, spawnInterval, patienceDrain, troubleInterval, faultChance, goalFor, isTier2, priceFor, priceList, breakdown, shiftTakings, audit, isBillDay, daysToBills, monthlyBills, perkUpkeep, capBandwidth, bandwidth });
})(window.ABCC);
