/* ==========================================================================
   2k. META — progress that outlives a single run (the "Koleksi")
   --------------------------------------------------------------------------
   A run can be restarted at any time, but some things are kept for good: how far you ever got and the
   cosmetic hats for Abang that clearing certain days unlocks. Stored under its own key, apart from the run save,
   so "Run baru" never wipes it. Hats are cosmetic only — they change nothing about the game.
   ========================================================================== */
(function (ns) {
  'use strict';

  const KEY = 'abangcc2007_meta';

  /** `day` = clear this day (in any run) to unlock it. */
  const HATS = [
    { id: 'cap', name: 'Topi Kuning', emoji: '🧢', day: 0, desc: 'Topi biasa Abang.' },
    { id: 'phones', name: 'Headphone Gamer', emoji: '🎧', day: 3, desc: 'Lepas Hari 3.' },
    { id: 'straw', name: 'Topi Jerami', emoji: '👒', day: 6, desc: 'Lepas Hari 6.' },
    { id: 'crown', name: 'Mahkota Raja CC', emoji: '👑', day: 10, desc: 'Lepas Hari 10.' },
  ];

  const blank = () => ({ bestDay: 0, runs: 0, daysCleared: 0, bestStars: 0, bestTier: 0, hat: 'cap' });
  let data = null;

  function load() {
    if (data) return data;
    data = blank();
    try {
      Object.assign(data, JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch {
      /* storage blocked or corrupt: start fresh */
    }
    if (!HATS.some((h) => h.id === data.hat)) data.hat = 'cap';
    return data;
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* storage blocked: the progress lasts until the page closes */
    }
  }

  const unlockedIds = (d) => HATS.filter((h) => d.bestDay >= h.day).map((h) => h.id);

  const Meta = {
    HATS,
    get: () => ({ ...load() }),
    hats: () => HATS.map((h) => ({ ...h, unlocked: load().bestDay >= h.day })),
    equipped: () => load().hat,
    /** A shift was cleared. Returns the hats this just unlocked (usually none). */
    recordDay(day, stars) {
      const d = load();
      const before = unlockedIds(d);
      d.daysCleared++;
      d.bestDay = Math.max(d.bestDay, day);
      d.bestStars = Math.max(d.bestStars, stars || 0);
      save();
      return HATS.filter((h) => d.bestDay >= h.day && !before.includes(h.id));
    },
    /** The shop reached tier `index` (0 = Kedai Biasa): remember the best one ever. */
    recordTier(index) {
      const d = load();
      if (index > (d.bestTier || 0)) {
        d.bestTier = index;
        save();
      }
    },
    recordRun() {
      load().runs++;
      save();
    },
    equip(id) {
      const d = load();
      if (!unlockedIds(d).includes(id)) return false;
      d.hat = id;
      save();
      return true;
    },
    /** Tests only: forget everything. */
    reset() {
      data = blank();
      save();
    },
  };

  ns.Meta = Meta;
})(window.ABCC);
