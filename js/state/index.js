/* ==========================================================================
   2m. STATE API — the one object the UI and the renderer talk to
   --------------------------------------------------------------------------
   The modules above attach their functions to ns.State and ns.S. This file adds the
   read-only queries and the helpers the debug hooks and tests use.
   ========================================================================== */
(function (ns) {
  'use strict';

  const S = ns.S;
  const State = ns.State;

  Object.assign(State, {
    // queries
    byId: ns.byId,
    calcRevenueGoal: S.goalFor,
    shiftTakings: S.shiftTakings,
    breakdown: S.breakdown,
    audit: S.audit,
    isBillDay: S.isBillDay,
    daysToBills: S.daysToBills,
    monthlyBills: S.monthlyBills,
    perkUpkeep: S.perkUpkeep,
    perkDef: S.perkDef,
    perkCount: S.perkCount,
    hasPerk: S.hasPerk,
    perkMods: S.perkMods,
    capBandwidth: S.capBandwidth,
    bandwidth: S.bandwidth,
    pressure: S.pressure,
    spawnInterval: S.spawnInterval,
    patienceDrain: S.patienceDrain,
    priceFor: S.priceFor,
    priceList: S.priceList,
    // events & helpers (also used by the debug hooks and tests)
    log: S.log,
    record: S.record,
    random: S.random,
    drainFx: S.drainFx,
    emit: S.emit,
    seedOf: (s) => s.seed,
    OFFICER_ID: S.OFFICER_ID,
  });
})(window.ABCC);
