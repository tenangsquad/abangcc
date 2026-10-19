/* ==========================================================================
   2l. SAVE / LOAD — versioned envelope, checksum, backup slot, v11 migration
   --------------------------------------------------------------------------
   Progress is written as { v, t, sum, s } where `sum` is a checksum of the JSON
   state. Before every write the last good copy is moved to a backup slot, so a
   half-written or corrupted save falls back instead of wiping the campaign.
   Bumping the version never discards progress: older saves are migrated.
   ========================================================================== */
(function (ns) {
  'use strict';

  const { CFG, ROOM, TYPES, byId } = ns;
  const S = ns.S;
  const State = (ns.State = ns.State || {});

  /** FNV-1a 32-bit — enough to catch a truncated or edited save. */
  function checksum(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16);
  }

  const store = {
    get: (k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v);
        return true;
      } catch {
        return false;
      }
    },
    del: (k) => {
      try {
        localStorage.removeItem(k);
      } catch {
        /* storage unavailable */
      }
    },
  };

  const OBSOLETE = ['upgrades', 'licenses', 'moment', 'autoDesk', 'autoCooldown', 'daysNegative', 'specialQueue', 'specialLast', 'sceneEffect', 'modalTab', 'tutorialShown', 'endRank', 'lastResolved', 'inspectionsCampaignLegacy'];

  /** Bring any older (or partial) state up to the current shape. Never throws away progress. */
  function migrate(old) {
    const s = Object.assign(State.create(old.seed), old);
    s.version = CFG.VERSION;
    for (const k of OBSOLETE) delete s[k];
    s.pcs = s.pcs.map((p, i) => {
      const pc = Object.assign(S.makePc(i), p);
      delete pc.installed;
      delete pc.storage;
      pc.x = ROOM.pcSlot(i).x;
      pc.y = ROOM.pcSlot(i).y;
      pc.screenAngle = pc.issue === 'suspicious' ? 1 : 0;
      return pc;
    });
    s.customers = (s.customers || []).map((c) => {
      const type = byId(TYPES, c.type);
      if (!c.patienceMax) c.patienceMax = Math.max(c.patience || 0, type?.patience || 40);
      return c;
    });
    s.perks = s.perks || [];
    s.perkCooldowns = s.perkCooldowns || {};
    s.worldEvents = s.worldEvents || [];
    s.activeIssues = s.activeIssues || [];
    s.once = s.once || {};
    s.shiftStats = Object.assign({ served: 0, complaints: 0, repairs: 0, incidents: 0, inspections: 0, walkouts: 0, queueWalkouts: 0, walkoutLost: 0, wrongDuration: 0, wrongLost: 0, falseAccusations: 0, pcDownSec: 0, idleWhileWaiting: 0, blackoutSec: 0 }, s.shiftStats);
    if (s.phase === 'active') s.phase = 'paused';
    return s;
  }

  function valid(s) {
    return s && typeof s === 'object' && Array.isArray(s.pcs) && s.pcs.length >= 3 && Number.isFinite(s.day) && Number.isFinite(s.cash) && Array.isArray(s.perks || []);
  }

  function readEnvelope(raw) {
    if (!raw) return null;
    try {
      const env = JSON.parse(raw);
      if (env && typeof env.s === 'string') {
        if (checksum(env.s) !== env.sum) return null; // corrupted
        const s = JSON.parse(env.s);
        return valid(s) ? migrate(s) : null;
      }
      return valid(env) ? migrate(env) : null; // bare state (legacy v11)
    } catch {
      return null;
    }
  }

  let lastGood = null;

  /** Latest good save: main slot → backup slot → legacy v11 slot. */
  function getSaved() {
    for (const key of [CFG.SAVE, CFG.SAVE_BAK, CFG.SAVE_V11]) {
      const s = readEnvelope(store.get(key));
      if (s) {
        if (key === CFG.SAVE) lastGood = store.get(key);
        return s;
      }
    }
    return null;
  }

  function save(s) {
    const json = JSON.stringify(s);
    const raw = JSON.stringify({ v: CFG.VERSION, t: Date.now(), sum: checksum(json), s: json });
    if (lastGood) store.set(CFG.SAVE_BAK, lastGood);
    const okWrite = store.set(CFG.SAVE, raw);
    if (okWrite) lastGood = raw;
    return okWrite;
  }

  function resetSave() {
    store.del(CFG.SAVE);
    store.del(CFG.SAVE_BAK);
    lastGood = null;
  }

  Object.assign(State, { getSaved, save, resetSave, migrate, checksum });
})(window.ABCC);
