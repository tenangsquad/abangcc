/* ==========================================================================
   2d. PERKS — weighted drafting, cooldowns, purchases
   ========================================================================== */
(function (ns) {
  'use strict';

  const { PERKS, ROOM, CFG } = ns;
  const S = ns.S;
  const State = (ns.State = ns.State || {});

  /** Perks that may be offered today: unlocked, not maxed out, not cooling down. */
  function eligiblePerks(s) {
    return PERKS.filter((p) => s.day >= p.minDay && !S.perkOwnedOut(s, p.id) && (s.perkCooldowns?.[p.id] || 1) <= s.day && (p.id !== 'add_pc' || s.pcs.length < ROOM.maxPcs));
  }

  /** Draft weight: base weight, steered by what the shop needs and what the player can afford. */
  function perkWeight(s, p) {
    let w = p.weight;
    if (p.id === 'add_pc') w *= s.pcs.length < 5 ? 1.5 : s.pcs.length >= 8 ? 0.6 : 1;
    if (p.id === 'snack' && S.hasPerk(s, 'cctv')) w *= 1.1;
    if (p.id === 'aircond' && s.pcs.length >= 5) w *= 1.4; // more PCs run hotter
    if (p.id === 'router' && s.pcs.length >= 6) w *= 1.4;
    if (p.id === 'cctv' && s.violationLog?.length) w *= 1.3;
    w *= s.cash >= p.price ? 1.35 : 0.45; // mostly offer things the player can actually buy
    return w;
  }

  /** Roll the two perk cards offered at the start of a day (from day 2). Always leaves one affordable card if any perk is. */
  function draftPerks(s, { redraft = false } = {}) {
    // anything left unchosen from yesterday's draft goes on its short cooldown first
    if (!redraft && s.perkDraft?.length && !s.perkChoiceMade) settleCooldowns(s, null);
    const pool = eligiblePerks(s);
    if (s.day < 2 || pool.length < 1) {
      s.perkDraft = [];
      s.perkChoiceMade = true;
      return [];
    }
    const chosen = [];
    const rest = [...pool];
    const first = S.weighted(s, rest, (p) => perkWeight(s, p));
    if (first) {
      chosen.push(first);
      rest.splice(rest.indexOf(first), 1);
    }
    // second card: if the first is unaffordable, force an affordable one when one exists
    if (rest.length) {
      let second;
      if (s.cash < first.price) {
        const affordable = rest.filter((p) => p.price <= s.cash);
        second = affordable.length ? S.weighted(s, affordable, (p) => perkWeight(s, p)) : null;
      }
      second = second || S.weighted(s, rest, (p) => perkWeight(s, p));
      if (second) chosen.push(second);
    }
    // guarantee: never offer only unaffordable cards. The cheap fallback perk steps in.
    if (!chosen.some((p) => p.price <= s.cash)) {
      const fallback = pool.find((p) => p.cheap && !chosen.includes(p));
      if (fallback) chosen[chosen.length ? chosen.length - 1 : 0] = fallback;
    }
    s.perkDraft = chosen.map((p) => p.id);
    s.perkChoiceMade = false;
    return s.perkDraft;
  }

  /** Cards not taken return after a short cooldown; the card taken only after a longer one (and its max count). */
  function settleCooldowns(s, chosenId) {
    for (const id of s.perkDraft || []) {
      s.perkCooldowns[id] = id === chosenId ? s.day + 6 + Math.floor(S.random(s) * 4) : s.day + 2 + Math.floor(S.random(s) * 3);
    }
    s.perkDraft = [];
    s.perkChoiceMade = true;
  }

  function applyPerk(s, id) {
    const def = S.perkDef(id);
    if (!def) return S.fail('Perk tak dijumpai.');
    if (S.perkOwnedOut(s, id)) return S.fail('Perk ini dah maksimum.');
    if (id === 'add_pc' && s.pcs.length >= ROOM.maxPcs) return S.fail('CC dah penuh buat masa ni.');
    if (s.cash < def.price) return S.fail('Duit tak cukup untuk beli perk ini.');

    S.record(s, 'perk', -def.price, `Perk: ${def.name}`);
    s.perks.push(id);
    s.perkHistory.push({ day: s.day, id });
    if (id === 'add_pc') State.addPc(s);
    settleCooldowns(s, id);
    S.log(s, `Perk dipilih: ${def.name}.`);
    s.dayGoal = S.goalFor(s, s.day);
    S.emit('perk', { id });
    return S.ok(`Perk aktif: ${def.name}!`);
  }

  function buyPerk(s, id) {
    if (s.phase !== 'prep') return S.fail('Perk hanya boleh dibeli sebelum shift.');
    if (s.perkChoiceMade) return S.fail('Kau dah pilih perk untuk hari ini.');
    if (!s.perkDraft.includes(id)) return S.fail('Perk itu tiada dalam pilihan hari ini.');
    return applyPerk(s, id);
  }

  /** Family loan: once, when cash runs low before a shift. */
  function loan(s) {
    if (s.loanUsed || s.phase !== 'prep') return false;
    s.loanUsed = true;
    S.record(s, 'loan', CFG.LOAN.amount, 'Pinjam duit keluarga');
    S.log(s, 'Pinjaman keluarga diterima.');
    // with more cash in hand, make sure today's cards include something affordable
    if (s.day >= 2 && !s.perkChoiceMade && !(s.perkDraft || []).some((id) => S.perkDef(id).price <= s.cash)) draftPerks(s, { redraft: true });
    return true;
  }

  Object.assign(State, { eligiblePerks, draftPerks, buyPerk, loan, perkWeight, settleCooldowns });
})(window.ABCC);
