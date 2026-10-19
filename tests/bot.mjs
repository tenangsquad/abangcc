// A simulated player. It drives the same State API the UI uses, one action at a time with a
// human-like delay, so campaign balance can be measured headlessly (see tests/sim.mjs).
import { loadGame, makeStorage } from './load-state.mjs';

export const SKILLS = {
  // reaction = seconds each action costs · accuracy = chance of picking the requested duration
  excellent: { reaction: 0.9, accuracy: 1, handlesIssues: 1, perkSmart: true },
  good: { reaction: 1.7, accuracy: 0.85, handlesIssues: 0.85, perkSmart: true },
  sloppy: { reaction: 3.4, accuracy: 0.55, handlesIssues: 0.5, perkSmart: false },
};

const PERK_PRIORITY = ['add_pc', 'poster', 'spares', 'snack', 'router', 'aircond', 'runner', 'cctv', 'filter', 'printer'];

export function makeBot(ns, skillName) {
  const { State, S } = ns;
  const sk = SKILLS[skillName];
  let cooldown = 0;
  let rng = 0.5;
  const rand = () => ((rng = (rng * 9301 + 49297) % 233280) / 233280);

  function act(s) {
    // 1) world events (people at the door, fuse box, puddle …)
    for (const ev of s.worldEvents) {
      if (rand() > sk.handlesIssues) continue;
      const opts = State.options(s, { kind: 'event', id: ev.id }).filter((o) => !o.disabled);
      if (!opts.length) continue;
      const want = {
        gang: s.pcs.filter((p) => p.status === 'free').length >= 2 ? 'deal' : 'normal',
        download: 'later',
        mak: 'help',
        truancy: 'refuse',
        lan: 'decline',
        blackout: s.cash >= 800 ? 'fuse' : 'wait',
        snacktheft: 'audit',
        spill: s.cash > 1500 ? 'clean' : 'mop',
        raid: 'cooperate',
      }[ev.type];
      const pick = opts.find((o) => o.choice === want) || opts[0];
      if (State.perform(s, 'event', ev.id, pick.choice).ok) return true;
    }
    // 2) faults and PC issues
    for (const p of s.pcs) {
      if (!(p.fault || p.issue || p.lingerTime > 0)) continue;
      if (p.issue && rand() > sk.handlesIssues) continue;
      const opts = State.options(s, { kind: 'pc', id: p.id }).filter((o) => !o.disabled);
      if (!opts.length) continue;
      const ev = S.eventOf(s, p.id);
      const prefer = {
        suspicious: ev?.cctvHint ? 'harsh' : 'soft',
        loudvideo: 'warn',
        fight: 'calm',
        restricted: 'close',
        nomouse: ev?.searched ? 'replace' : 'search',
      }[p.issue];
      const faultPrefer = { glitch: 'restart', freeze: 'restart', overheat: 'cool', bsod: 'restart', noconn: 'reset', hardware: 'repair' }[p.fault];
      const want = p.lingerTime > 0 ? 'extend' : prefer || faultPrefer;
      const pick = opts.find((o) => o.act === want) || opts[0];
      if (State.perform(s, pick.act, p.id).ok) return true;
    }
    // 3) serve the oldest waiting customer
    const waiting = State.inQueue(s).filter((c) => c.status === 'waiting').sort((a, b) => a.id - b.id);
    const free = s.pcs.filter((p) => p.status === 'free' && !p.fault && !p.issue);
    if (waiting.length && free.length && s.powerOutage <= 0) {
      const c = waiting[0];
      State.select(s, { kind: 'customer', id: c.id });
      const durations = [30, 60, 90];
      const minutes = rand() < sk.accuracy ? c.requestedMinutes : durations[Math.floor(rand() * 3)];
      State.perform(s, 'duration', c.id, minutes);
      // best seat: the healthiest free PC
      const pc = [...free].sort((a, b) => b.health - a.health)[0];
      return State.select(s, { kind: 'pc', id: pc.id }).ok;
    }
    return false;
  }

  return {
    tick(s, dt) {
      cooldown -= dt;
      if (cooldown > 0) return;
      if (act(s)) cooldown = sk.reaction;
      else cooldown = 0.25;
    },
    chooseBreakPerk(s) {
      // spend on the best-ranked affordable card
      const draft = s.perkDraft || [];
      if (!draft.length || s.perkChoiceMade) return;
      const affordable = draft.filter((id) => S.perkDef(id).price <= s.cash);
      if (!affordable.length) return;
      const pick = sk.perkSmart ? [...affordable].sort((a, b) => PERK_PRIORITY.indexOf(a) - PERK_PRIORITY.indexOf(b))[0] : affordable[0];
      // keep a small cash buffer for repairs
      if (s.cash - S.perkDef(pick).price < 500 && sk.perkSmart && pick !== "poster") return;
      State.buyPerk(s, pick);
    },
  };
}

/** Play a whole campaign. Returns one row per attempted day. */
export function playCampaign({ skill = 'good', days = 10, seed = 1, retries = 3, storage = makeStorage() } = {}) {
  const { ns } = loadGame({ storage });
  const { State } = ns;
  let s = State.create(seed);
  s.phase = 'prep';
  const bot = makeBot(ns, skill);
  const rows = [];
  let attempts = 0;
  while (s.day <= days) {
    bot.chooseBreakPerk(s);
    if (s.cash < ns.CFG.LOAN.below && !s.loanUsed) State.loan(s);
    State.startShift(s);
    const startCash = s.cash;
    for (let t = 0; s.phase === 'active' && t < 400; t += 0.05) {
      State.update(s, 0.05);
      bot.tick(s, 0.05);
    }
    const r = s.lastReport;
    attempts++;
    rows.push({ day: r.day, attempt: attempts, goal: r.goal / 100, income: r.income / 100, rental: r.rental / 100, other: r.other / 100, refunds: r.refunds / 100, expense: r.expense / 100, met: r.goalMet, stars: r.stars, pcs: s.pcs.length, cash: s.cash / 100, startCash: startCash / 100, rep: Math.round(s.rep), served: r.served, perks: s.perks.length });
    if (r.goalMet) {
      State.proceed(s);
      attempts = 0;
    } else if (attempts >= retries) {
      break;
    } else {
      s = State.retryDay(s);
    }
  }
  return rows;
}
