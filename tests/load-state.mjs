// Loads the browser game logic (no DOM) into a Node vm so it can be tested headlessly.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STATE_FILES = [
  'js/core/config.js',
  'js/state/core.js',
  'js/state/economy.js',
  'js/state/movement.js',
  'js/state/perks.js',
  'js/state/customers.js',
  'js/state/pcs.js',
  'js/state/incidents.js',
  'js/state/events.js',
  'js/state/officer.js',
  'js/state/actions.js',
  'js/state/meta.js',
  'js/state/shift.js',
  'js/state/save.js',
  'js/state/index.js',
];

/** A tiny in-memory localStorage. */
export function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    _map: m,
  };
}

/** Fresh isolated copy of the game logic. Returns the ABCC namespace (State, S, config tables). */
export function loadGame({ storage = makeStorage() } = {}) {
  const window = {};
  const ctx = vm.createContext({ window, localStorage: storage, console, Math, JSON, Date, Number, Array, Object, Map, Set, WeakMap, String, Infinity, NaN, isFinite, parseInt, parseFloat });
  for (const f of STATE_FILES) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  return { ns: window.ABCC, storage };
}

/** Step the simulation `seconds` of game time in small fixed steps. */
export function run(ns, s, seconds, dt = 0.05, each) {
  for (let t = 0; t < seconds && s.phase === 'active'; t += dt) {
    ns.State.update(s, dt);
    if (each) each(s);
  }
}

/** A new game, past the menu, ready to start a shift. */
export function newShift(ns, { seed = 12345, day = 1, cash } = {}) {
  const s = ns.State.create(seed);
  s.day = day;
  if (cash !== undefined) s.cash = cash;
  s.phase = 'prep';
  if (day >= 2) ns.State.draftPerks(s);
  ns.State.startShift(s);
  return s;
}
