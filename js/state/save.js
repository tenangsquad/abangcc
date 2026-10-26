/* ==========================================================================
   2l. SAVE / LOAD — several saves, versioned envelope, checksum, backup slot, v11 migration
   --------------------------------------------------------------------------
   Every run is its own save (up to CFG.MAX_SAVES), stored under 'abangcc2007_save_<id>'. The difficulty
   preset lives in the state, so it travels with the save. "Sambung Main" opens the save written last.
   Progress is written as { v, t, sum, s } where `sum` is a checksum of the JSON
   state. Before every write the last good copy is moved to a backup slot, so a
   half-written or corrupted save falls back instead of wiping the campaign.
   Bumping the version never discards progress: older saves are migrated, and the old single save
   (alpha v12 / v11 keys) is copied into the list the first time the game opens.
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
    s.shiftStats = Object.assign(State.create(old.seed).shiftStats, s.shiftStats); // fill in any counters an older save lacks
    if (!ns.TIERS.some((t) => t.id === old.repTier)) s.repTier = ns.TIERS[ns.tierIndexFor(s.rep, 0)].id; // saves from before tiers start at the tier they have earned
    if (s.phase === 'active') s.phase = 'paused';
    return s;
  }

  function valid(s) {
    return s && typeof s === 'object' && Array.isArray(s.pcs) && s.pcs.length >= 3 && Number.isFinite(s.day) && Number.isFinite(s.cash) && Array.isArray(s.perks || []);
  }

  /** JSON.parse reviver: a key called "__proto__" (only a hand-edited or imported file has one) is dropped, so loading a save can never swap an object's prototype. */
  const noProto = (key, value) => (key === '__proto__' ? undefined : value);

  /** Parse one stored envelope into { s, t } (state already migrated, t = when it was written), or null if it is missing or damaged. */
  function readEnvelope(raw) {
    if (!raw) return null;
    try {
      const env = JSON.parse(raw, noProto);
      if (env && typeof env.s === 'string') {
        if (checksum(env.s) !== env.sum) return null; // corrupted
        const s = JSON.parse(env.s, noProto);
        return valid(s) ? { s: migrate(s), t: Number.isFinite(env.t) ? env.t : 0 } : null;
      }
      return valid(env) ? { s: migrate(env), t: 0 } : null; // bare state (legacy v11)
    } catch {
      return null;
    }
  }

  function writeEnvelope(s, t) {
    const json = JSON.stringify(s);
    return JSON.stringify({ v: CFG.VERSION, t, sum: checksum(json), s: json });
  }

  const slotKey = (id) => CFG.SAVE_PREFIX + id;
  const bakKey = (id) => slotKey(id) + CFG.SAVE_BAK_SUFFIX;
  const ID_RE = /^[a-z0-9]{4,16}$/;

  /** Ids of every save in this browser, found by scanning the storage keys (a save whose main copy is gone but whose backup survives still counts). */
  function slotIds() {
    const ids = new Set();
    try {
      for (let i = 0; i < localStorage.length; i++) {
        let id = localStorage.key(i);
        if (!id || !id.startsWith(CFG.SAVE_PREFIX)) continue;
        id = id.slice(CFG.SAVE_PREFIX.length);
        if (id.endsWith(CFG.SAVE_BAK_SUFFIX)) id = id.slice(0, -CFG.SAVE_BAK_SUFFIX.length);
        if (ID_RE.test(id)) ids.add(id);
      }
    } catch {
      /* storage unavailable: no saves */
    }
    return [...ids];
  }

  /** A short unique id: the time (so ids sort roughly by age) plus two random characters. */
  function newId() {
    let id;
    do id = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');
    while (store.get(slotKey(id)) != null || store.get(bakKey(id)) != null);
    return id;
  }

  let activeId = null; // the save the game is writing to (null until a New Game or a load)
  const lastGood = {}; // id → the raw text of the last good write, moved to the backup slot before the next one
  let savedAt = 0; // when the active save was last written (ms since 1970), 0 = nothing saved yet
  let saveFailed = false; // true while the browser refuses to store the save (private mode, quota)

  /** The newest readable copy of one save: main slot, then its backup. */
  function readSlot(id) {
    for (const key of [slotKey(id), bakKey(id)]) {
      const raw = store.get(key);
      const env = readEnvelope(raw);
      if (env) return { ...env, id, raw: key === slotKey(id) ? raw : null };
    }
    return null;
  }

  /** The first time this browser opens the multi-save game: copy the old single save (main, backup or v11) in as the first save. The old keys are left in place. */
  function importOldSave() {
    if (store.get(CFG.SAVES_IMPORTED)) return;
    if (!slotIds().length) {
      for (const key of [CFG.SAVE, CFG.SAVE_BAK, CFG.SAVE_V11]) {
        const env = readEnvelope(store.get(key));
        if (!env) continue;
        store.set(slotKey(newId()), writeEnvelope(env.s, env.t || Date.now()));
        break;
      }
    }
    store.set(CFG.SAVES_IMPORTED, '1');
  }

  /** Every readable save, newest first. */
  function scan() {
    importOldSave();
    return slotIds()
      .map(readSlot)
      .filter(Boolean)
      .sort((a, b) => b.t - a.t || (a.id < b.id ? 1 : -1));
  }

  /** What the menu shows about a save (no state, just the facts). */
  function summary(e) {
    const s = e.s;
    return { id: e.id, t: e.t, preset: s.preset, day: s.day, cash: s.cash, tier: s.repTier, pcs: s.pcs.length, stage: s.resumeTo || s.phase, active: e.id === activeId };
  }
  const listSaves = () => scan().map(summary);
  const saveCount = () => slotIds().length;
  const activeSaveId = () => activeId;

  /** Open a save: it becomes the active one, and returns its state (or null if it cannot be read). */
  function loadSave(id) {
    const e = readSlot(id);
    if (!e) return null;
    activeId = id;
    if (e.raw) lastGood[id] = e.raw;
    else delete lastGood[id];
    savedAt = e.t;
    saveFailed = false;
    return e.s;
  }

  /** Open the save written last (what "Sambung Main" continues). Null when there are none. */
  function getSaved() {
    for (const e of scan()) {
      const s = loadSave(e.id);
      if (s) return s;
    }
    return null;
  }

  /** Write `s` to the active save. Without one (a fresh game that has not started a run yet) nothing is written. */
  function save(s) {
    const id = activeId;
    if (!id) return false;
    const t = Date.now();
    const raw = writeEnvelope(s, t);
    if (lastGood[id]) store.set(bakKey(id), lastGood[id]);
    const okWrite = store.set(slotKey(id), raw);
    if (okWrite) {
      lastGood[id] = raw;
      savedAt = t;
    }
    saveFailed = !okWrite;
    return okWrite;
  }

  /** Start a new save for `s` and make it the active one. Null when all CFG.MAX_SAVES places are used (delete one first). */
  function createSave(s) {
    if (saveCount() >= CFG.MAX_SAVES) return null;
    activeId = newId();
    delete lastGood[activeId];
    savedAt = 0;
    save(s);
    return activeId;
  }

  /** Remove a save and its backup. Deleting the active one leaves no active save until another is opened or created. */
  function deleteSave(id) {
    if (!ID_RE.test(id || '')) return false;
    store.del(slotKey(id));
    store.del(bakKey(id));
    delete lastGood[id];
    if (id === activeId) {
      activeId = null;
      savedAt = 0;
      saveFailed = false;
    }
    return true;
  }

  /* ---------- export / import: one save as a .json file, to move between browsers and devices ---------- */
  const EXPORT_GAME = 'abangcc2007';
  const MAX_IMPORT_CHARS = 2_000_000; // a real save is a few tens of KB

  /** One save as the text of a file: { text, summary }, or null if it cannot be read. */
  function exportSave(id) {
    const e = ID_RE.test(id || '') ? readSlot(id) : null;
    if (!e) return null;
    const json = JSON.stringify(e.s);
    const text = JSON.stringify({ game: EXPORT_GAME, kind: 'save', v: CFG.VERSION, t: e.t, sum: checksum(json), s: json });
    return { text, summary: summary(e) };
  }

  /**
   * Add the save in `text` (a file made by exportSave) to the list as a new save. It does NOT become the active save.
   * { ok: true, id, summary } or { ok: false, error } with error one of: toobig · notsave · damaged · newer · duplicate · full
   */
  function importSave(text) {
    if (typeof text !== 'string' || text.length > MAX_IMPORT_CHARS) return { ok: false, error: 'toobig' };
    let env;
    try {
      env = JSON.parse(text, noProto);
    } catch {
      return { ok: false, error: 'notsave' };
    }
    if (!env || typeof env !== 'object' || typeof env.s !== 'string' || typeof env.sum !== 'string' || (env.game !== undefined && env.game !== EXPORT_GAME)) return { ok: false, error: 'notsave' };
    if (Number.isFinite(env.v) && env.v > CFG.VERSION) return { ok: false, error: 'newer' };
    const read = readEnvelope(JSON.stringify({ v: env.v, t: env.t, sum: env.sum, s: env.s }));
    if (!read) return { ok: false, error: 'damaged' }; // checksum mismatch, bad JSON inside, or not a game state
    for (const id of slotIds()) { // the same file twice would only clutter the list
      try {
        const have = JSON.parse(store.get(slotKey(id)) || 'null');
        if (have && have.sum === env.sum && have.t === read.t) return { ok: false, error: 'duplicate' };
      } catch {
        /* an unreadable save cannot be a duplicate */
      }
    }
    if (saveCount() >= CFG.MAX_SAVES) return { ok: false, error: 'full' };
    const id = newId();
    const t = Math.min(read.t || Date.now(), Date.now()); // keeps its own "last played" time, but never one from the future
    if (!store.set(slotKey(id), writeEnvelope(read.s, t))) return { ok: false, error: 'storage' };
    return { ok: true, id, summary: summary({ id, t, s: read.s }) };
  }

  /** When the active save was last written: { at, failed }. `at` is 0 when nothing is stored. */
  function saveInfo() {
    if (!savedAt && activeId) {
      const e = readSlot(activeId);
      if (e) savedAt = e.t;
    }
    return { at: savedAt, failed: saveFailed };
  }

  Object.assign(State, { getSaved, save, createSave, loadSave, deleteSave, listSaves, saveCount, activeSaveId, saveInfo, exportSave, importSave, migrate, checksum });
})(window.ABCC);
