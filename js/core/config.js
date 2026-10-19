/* ==========================================================================
   1. CORE — constants, balance tables and small helpers (no DOM, no state)
   --------------------------------------------------------------------------
   Everything you would tune while balancing lives in this file:
     CFG       shift length, start cash, monthly bills
     RENTAL    price list + wrong-duration rules
     DIRECTOR  the difficulty director (one table, three presets)
     TYPES     the nine customer archetypes
     PERKS     roguelite perks (benefit, downside, weight, upkeep)
     FAULTS    PC fault kinds   ·   EVENTS   special events
     ROOM      floor plan, lanes, landmarks
   ========================================================================== */
(function (ns) {
  'use strict';

  /* ---------- helpers ---------- */
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  /** Frame-rate independent exponential smoothing. */
  const damp = (current, target, rate, dt) => lerp(current, target, 1 - Math.exp(-rate * dt));
  const byId = (list, id) => list.find((item) => item.id === id);
  const fmtMoney = (sen) => 'RM' + (Math.round(sen || 0) / 100).toFixed(2);
  const shortestAngle = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

  /** Minutes since midnight -> "12:30 PM". */
  function clock(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  /** Part of the day for a clock time (minutes since midnight). Drives lighting and the HUD label. */
  function dayPart(minutes) {
    const h = (minutes / 60) % 24;
    if (h < 16.5) return { id: 'afternoon', label: 'TENGAH HARI', emoji: '☀️' };
    if (h < 19) return { id: 'golden', label: 'PETANG', emoji: '🌇' };
    if (h < 20.5) return { id: 'dusk', label: 'SENJA', emoji: '🌆' };
    return { id: 'night', label: 'MALAM', emoji: '🌙' };
  }

  /* ---------- shop floor plan ----------
     World units are roughly metres. x runs left→right along the back wall,
     y is the depth axis (towards the camera). The entrance sits in the top-left
     corner and the pay counter fills the bottom-left corner of the left wall.
     Customers queue in a roped-off lane in front of the counter (head of the line
     at the till, tail towards the door); Abang serves from behind the counter and
     walks out through a gap at its upper end (the "hatch"). The PC desks line the
     back (right-hand) wall, so the middle of the café stays open: a second row only
     appears once the first one (5 desks) is full. The water dispenser and magazine
     rack stand on the left wall between the door and the counter. */
  const ROOM = {
    depth: 12,
    wallHeight: 3.3,
    minWidth: 11.9,
    rightMargin: 2.4,
    maxPcs: 10,
    // PC desks: two rows (back / front) of `perRow`. Desks fill the back row first, column by column.
    perRow: 5,
    firstColumnX: 4.5,
    columnGap: 2.5,
    rowY: [1.8, 5.4],
    // Walking lanes: one vertical lane beside the queue lane, one aisle between and one in front of the rows.
    laneX: 3.1,
    aisleBack: 3.9,
    aisleFront: 7.45,
    // Landmarks
    door: { x: 0.4, y: 1.3 },
    // Queue lane: slot 0 is at the till (bottom), higher slots stretch back towards the door.
    queue: { x: 2.4, headY: 10.9, gap: 0.88, entryY: 7.5, left: 1.95, right: 2.85 },
    // Where groups wait just inside the door (event NPCs, and the overflow of a big queue).
    doorCluster: [{ x: 1.45, y: 1.95 }, { x: 2.05, y: 1.35 }, { x: 1.4, y: 0.85 }, { x: 2.1, y: 2.25 }],
    doorTalk: { x: 2.55, y: 2.2 }, // where Abang stands to talk to the people at the door
    // Counter: a long desk against the left wall in the front corner, from y0 to y1. Abang stands behind it.
    counter: { x: 1.45, y0: 8.0, y1: 11.7, depth: 0.95 },
    hatchY: 7.45, // gap above the counter that Abang uses to walk out (lines up with the front aisle)
    home: { x: 0.62, y: 10.9 },
    // Fuse box on the left wall between the door and the water dispenser.
    fuse: { x: 0.12, y: 1.45, z: 2.75, spot: { x: 1.05, y: 2.75 } },
    // Left-wall furniture that took the counter's old place
    dispenser: { x: 0.75, y: 4.9 },
    rack: { x: 0.4, y: 6.3 },
    // Offsets relative to a PC desk position
    seatOffset: 0.72, // = the old 0.92 × pcScale: the chair sits the same relative distance from the (now smaller) desk
    pcScale: 0.78, // desks, monitors, chairs are drawn 22% smaller …
    charScale: 0.78, // … and so are the people, so the same room feels roomier
    staffOffset: { x: -0.62, y: 0.7 },
    sidestep: 0.72,
  };
  ROOM.pcSlot = (index) => ({
    x: ROOM.firstColumnX + (index % ROOM.perRow) * ROOM.columnGap,
    y: ROOM.rowY[Math.floor(index / ROOM.perRow)],
  });
  ROOM.widthFor = (pcCount) =>
    Math.max(ROOM.minWidth, ROOM.firstColumnX + (Math.min(Math.max(pcCount, 1), ROOM.perRow) - 1) * ROOM.columnGap + ROOM.rightMargin);
  /** Slot `index` in the queue. The first four stand in the roped lane, extra people wait at the door cluster. */
  ROOM.queueSlot = (index) =>
    index < 4 ? { x: ROOM.queue.x, y: ROOM.queue.headY - index * ROOM.queue.gap } : ROOM.doorCluster[(index - 4) % ROOM.doorCluster.length];
  ROOM.queueEntry = () => ({ x: ROOM.queue.x, y: ROOM.queue.entryY });
  ROOM.inQueueLane = (p) => p.x > ROOM.queue.left && p.x < ROOM.queue.right && p.y > ROOM.queue.entryY + 0.25;
  ROOM.behindCounter = (p) => p.x < ROOM.counter.x - ROOM.counter.depth / 2 + 0.05 && p.y > ROOM.hatchY - 0.3 && p.y < ROOM.counter.y1 + 0.6;
  ROOM.seatFor = (pc) => ({ x: pc.x, y: pc.y + ROOM.seatOffset });
  ROOM.staffSpotFor = (pc) => ({ x: pc.x + ROOM.staffOffset.x, y: pc.y + ROOM.staffOffset.y });
  /** Where the snack machine stands (back wall, right corner). Depends on the room width. */
  ROOM.snackSpot = (W) => ({ x: W - 0.9, y: 0.55, stand: { x: W - 1.2, y: 1.45 } });
  /** Spot in the aisle in front of a PC where a drink can spill. */
  ROOM.spillSpotFor = (pc) => ({ x: pc.x - 0.15, y: pc.y + 1.85 });

  /* ---------- game balance ---------- */
  const CFG = {
    SAVE: 'abangcc2007_alpha_v12',
    SAVE_BAK: 'abangcc2007_alpha_v12_bak',
    SAVE_V11: 'abangcc2007_alpha_v11',
    SETTINGS: 'abangcc2007_settings',
    VERSION: 12,
    SHIFT: 120, // seconds of real time per shop day (TWO real minutes)
    GAME_MINUTE_RATE: 6, // in-game minutes per real second → 12:00 PM … 12:00 AM
    DAY_START_MINUTES: 720,
    MAX_QUEUE: 4,
    CUSTOMER_SPEED: 3.0, // walking speed of customers (was 2.0 — the café is now bigger, so the walk from the queue to a PC is longer)
    ABANG_SPEED: 4.8, // world units per second when Abang rushes to a PC or an event (was 3.5)
    ABANG_ERRAND_SPEED: 4.2, // setting up a customer's PC / walking back to the counter (was 3.1)
    ABANG_WORK_SCALE: 0.85, // every fix / confrontation takes 15 % less time once he arrives
    MAX_COMMANDS: 3,
    START_CASH: 3500, // sen
    // Rent and utility bills are MONTHLY: paid once every BILL_CYCLE_DAYS days (at the end of that day's shift),
    // never daily. Money spent on anything else (repairs, fuse, perks …) is booked as "belanja" the moment it is spent.
    BILL_CYCLE_DAYS: 30,
    COSTS: { rent: 25000, electric: 12000, internet: 6000, perPcElectric: 1500 },
    SCHOOL_HOURS_END: 14.5, // 2:30 PM — before this, uniformed students are "truant"
    PC_HEALTH: [94, 91, 88, 91, 91, 91, 100, 100, 100, 100],
    LOAN: { amount: 8000, below: 2500 },
    PREP_MESSAGE: [
      'HARI PERTAMA JAGA CC',
      'RAMAI BUDAK LEPAS SEKOLAH',
      'KEDAI MULA PANAS',
      'RUMOUR PEAK HOUR',
      'RAMAI CUBA TEST LIMIT',
      'LINE INTERNET JADI PENTING',
      'RANDOM CHAOS MODE',
    ],
  };

  /** Rental price list (sen) and what happens when Abang picks the wrong duration. */
  const RENTAL = {
    prices: { 30: 100, 60: 200, 90: 300 },
    durations: [30, 60, 90],
    // How long a session really keeps the PC busy (real seconds). Short on purpose, so customers never hog a PC.
    sessionSeconds: { 30: 10, 60: 16, 90: 22 },
    tier2Multiplier: 1.25, // PCs 9–10 on non-casual games
    wrongPenalty: 0.5, // share of the price lost when the duration is wrong: payment is cut by 50 %
    wrongRep: -2,
    snackExtraMinutes: 30,
    snackPrice: 80,
  };
  const priceForMinutes = (minutes) => RENTAL.prices[minutes] ?? Math.round((RENTAL.prices[60] * minutes) / 60);
  /** Real seconds a session of `minutes` keeps the PC busy. */
  const sessionSecondsFor = (minutes) => RENTAL.sessionSeconds[minutes] ?? Math.round((RENTAL.sessionSeconds[60] * minutes) / 60);

  /* ---------- the difficulty director ----------
     One table drives how hard a day is. `pressure` is the single number most systems
     read: it grows with the day, with every perk bought and with every extra PC.
     Presets scale it for Santai / Biasa / Mencabar. */
  const DIRECTOR = {
    presets: {
      santai: { label: 'Santai', pressure: 0.85, patience: 1.15, trouble: 0.8 },
      biasa: { label: 'Biasa', pressure: 1, patience: 1, trouble: 1 },
      mencabar: { label: 'Mencabar', pressure: 1.2, patience: 0.88, trouble: 1.25 },
    },
    pressure: { base: 1, perDay: 0.16, perPerk: 0.08, perExtraPc: 0.12 },
    spawn: { normalEvery: 3.6, peakEvery: 1.55, jitter: [0.72, 1.27], pressureScale: 0.72, peakBonus: 0.7, perExtraPc: 0.12, minPressure: 0.8, repEffect: 0.0035 },
    patience: { peakMult: 1.42, lateFromDay: 6, lateMult: 1.14, perExtraPc: 0.03, loudMult: 1.15, blackoutMult: 1.3 },
    // dayScale: share of random trouble on day 1, 2, 3, … (day 1 is only the scripted tutorial beats)
    trouble: { firstAt: 15, normalEvery: 17, peakEvery: 12, perPressure: 2.5, min: 6.5, peakPressure: 0.5, dayScale: [0, 0.55, 0.8, 1] },
    faults: { healthHigh: 55, healthMid: 25, chanceHigh: 0.012, chanceMid: 0.065, chanceLow: 0.18, perPressure: 0.01, perExtraPc: 0.01 },
    // Scripted "special" slots (seconds into the shift). School slot = uniformed students during school hours.
    specials: { school: { fromDay: 3, at: [6, 18] }, slots: [{ fromDay: 2, at: [41, 55] }, { fromDay: 5, at: [83, 95] }] },
    inspection: { window: [22, 85], latest: CFG.SHIFT - 16, summonFromDay: 5, summonRisk: 72, summonChance: 0.025, earlierPerRisk: 0.2 },
    // Daily target (RM): day 1 = `start`, then it grows by `perDay` for every day up to and including `untilDay`:
    // +RM3 a day through day 10 (30, 33, 36 … 57), +RM4 a day through day 20, +RM5 a day after that. Same on every preset.
    // Upgrades (extra PCs, perks) stay exclusive: nothing is handed out to keep up with the target.
    goal: { start: 30, steps: [{ untilDay: 10, perDay: 3 }, { untilDay: 20, perDay: 4 }, { untilDay: Infinity, perDay: 5 }] },
    peaks: [{ fromDay: 1, start: [36, 46], len: [17, 23], label: 'LEPAS SEKOLAH' }, { fromDay: 4, start: [82, 92], len: [15, 22], label: 'MALAM CHAOS', endCap: 116 }],
  };

  /* ---------- fault kinds a PC can develop ----------
     `fix` lists the buttons the PC's pop-up menu offers. `auto` = seconds until it sorts itself out
     (or, for 'dies', until it gets worse). Restarting during a session refunds 25 %. */
  const FAULTS = {
    glitch: { icon: '💥', label: 'Software crash', short: 'HANG', fix: ['restart', 'repair'], auto: 13, autoEnds: 'restart' },
    freeze: { icon: '🥶', label: 'Skrin beku', short: 'BEKU', fix: ['restart', 'repair'], auto: 8, autoEnds: 'thaw' },
    overheat: { icon: '🔥', label: 'PC terlalu panas', short: 'PANAS', fix: ['cool', 'restart', 'repair'], auto: 14, autoEnds: 'burn' },
    bsod: { icon: '💙', label: 'Blue Screen (BSOD)', short: 'BSOD', fix: ['restart', 'repair'], auto: 16, autoEnds: 'quit' },
    noconn: { icon: '📡', label: 'Sambungan internet putus', short: 'NO NET', fix: ['reset', 'repair'], auto: 15, autoEnds: 'quit' },
    hardware: { icon: '🔧', label: 'Hardware rosak', short: 'ROSAK', fix: ['repair'], auto: 0, autoEnds: null },
  };

  const GAMES = [
    { id: 'puzzle', name: 'Puzzle Mania', genre: 'Casual', online: false },
    { id: 'counter', name: 'Counter Battalion', genre: 'FPS', online: true },
    { id: 'war', name: 'War of Ancients', genre: 'Arena', online: true },
    { id: 'turbo', name: 'Turbo Kampung', genre: 'Racing', online: false },
    { id: 'myth', name: 'MythQuest Online', genre: 'MMORPG', online: true },
  ];

  /* ---------- perks ----------
     `mods` are summed (× count owned) by State.perkMods(). `upkeep` is paid at the end of every shift (sen).
     Every perk carries a real downside — either an upkeep bill, extra risk or a behaviour change. */
  const PERKS = [
    { id: 'add_pc', name: 'Tambah PC', price: 4500, minDay: 2, repeatMax: 7, icon: '🖥️', weight: 3, upkeep: 0,
      desc: 'PC baru: lebih kapasiti dan jualan.', downside: 'Bil elektrik bulanan naik, lebih banyak rosak & salah guna.', mods: {} },
    { id: 'snack', name: 'Snack Machine', price: 3500, minDay: 2, repeatMax: 1, icon: '🥤', weight: 2, upkeep: 100,
      desc: 'Jualan snack tambahan, pelanggan duduk lebih lama.', downside: 'Risiko kecurian, sepah dan snack tak berbayar.', mods: {} },
    { id: 'spares', name: 'Rak Spare Parts', price: 3600, minDay: 2, repeatMax: 1, icon: '🛠️', weight: 2, upkeep: 150,
      desc: 'Repair 30% lebih murah dan 25% lebih laju.', downside: 'Stok alat ganti perlu belanja harian.', mods: { repairCost: -0.3, repairTime: -0.25 } },
    { id: 'filter', name: 'Content Filter', price: 3600, minDay: 2, repeatMax: 1, icon: '🛡️', weight: 2, upkeep: 150,
      desc: 'Kurangkan kes laman tak sesuai.', downside: 'Langganan harian + kadang-kadang pelanggan merungut laman disekat.', mods: { guilty: -0.35, blockedComplaint: 0.08 } },
    { id: 'router', name: 'Tukar Router', price: 8500, minDay: 3, repeatMax: 2, icon: '📡', weight: 1.5, upkeep: 300,
      desc: 'Bandwidth lebih besar, kurang lag.', downside: 'Kos langganan router dibayar setiap hari (belanja).', mods: { bandwidth: 3 } },
    { id: 'aircond', name: 'Aircond Kedai', price: 11000, minDay: 3, repeatMax: 1, icon: '❄️', weight: 1, upkeep: 300,
      desc: 'Pelanggan lebih sabar, PC kurang panas.', downside: 'Kos elektrik aircond dibayar setiap hari (belanja).', mods: { patienceDrain: -0.28, wear: -1, overheat: -0.9 } },
    { id: 'runner', name: 'Abang Laju', price: 7000, minDay: 3, repeatMax: 2, icon: '🏃', weight: 1.2, upkeep: 200,
      desc: 'Abang bergerak dan bertindak lebih pantas.', downside: 'Belanja air tenaga setiap hari.', mods: { taskSpeed: 0.15 } },
    { id: 'printer', name: 'Printer Corner', price: 9500, minDay: 4, repeatMax: 1, icon: '🖨️', weight: 1, upkeep: 100,
      desc: 'Tarik pelajar assignment + upah cetakan.', downside: 'Printer boleh jem dan kertas perlu dibeli.', mods: { studentSpawn: 0.3, printing: 50 } },
    { id: 'cctv', name: 'CCTV Hujung Kedai', price: 8000, minDay: 4, repeatMax: 1, icon: '📷', weight: 1.2, upkeep: 200,
      desc: 'Beri petunjuk siapa yang mencurigakan + masa lebih panjang.', downside: 'Kos penyelenggaraan harian; petunjuk tidak 100% tepat.', mods: { suspiciousTime: 5, cctvHint: 1 } },
    { id: 'poster', name: 'Poster Promosi', price: 1500, minDay: 2, repeatMax: 3, icon: '📣', weight: 0.6, upkeep: 0, cheap: true,
      desc: 'Poster murah: lebih ramai pelanggan datang.', downside: 'Menarik lebih ramai budak RM1 yang cepat bosan.', mods: { spawn: 0.08, kidSpawn: 0.3 } },
  ];

  /* ---------- customer archetypes ----------
     patience     seconds of waiting this person tolerates at normal pace
     durations    [[minutes, weight], …] what they ask for
     weight       how often they walk in           bias   incident multipliers
     look         only affects how the 3D character is dressed
     trait        'linger' = stays on after the session · 'chat' = chats on IRC */
  const TYPES = [
    { id: 'uncle', name: 'Pakcik Internet', emoji: '👓', shirt: '#e8b04c', patience: 62, game: 'puzzle', durations: [[60, 0.7], [30, 0.2], [90, 0.1]], look: 'songkok', weight: 1, bias: { suspicious: 0.7 },
      quotes: ['Dik, macam mana nak login?', 'Nak check e-mel kejap.'] },
    { id: 'fps', name: 'Kaki FPS', emoji: '🎮', shirt: '#ff7a59', patience: 38, game: 'counter', durations: [[60, 0.6], [90, 0.25], [30, 0.15]], look: 'headset', weight: 1, bias: { loudvideo: 1.4 },
      quotes: ['Bang, nak PC yang tak lag!', 'Ada Counter Battalion tak?'] },
    { id: 'hot', name: 'Kaki Panas Baran', emoji: '🔥', shirt: '#ff5252', patience: 30, game: 'counter', durations: [[60, 0.6], [30, 0.3], [90, 0.1]], look: 'redband', weight: 0.8, bias: { fight: 2.2 },
      quotes: ['PC laju ada tak?!', 'Jangan bagi aku PC rosak.'] },
    { id: 'student', name: 'Student Assignment', emoji: '📚', shirt: '#ff8fb8', patience: 55, game: 'puzzle', durations: [[60, 0.6], [90, 0.25], [30, 0.15]], look: 'student', weight: 1, bias: { suspicious: 0.5 },
      quotes: ['Bang, nak buat assignment.', 'Boleh guna internet tak?'] },
    { id: 'mmorpg', name: 'Kaki MMORPG', emoji: '🐉', shirt: '#a780ff', patience: 48, game: 'myth', durations: [[90, 0.7], [60, 0.3]], look: 'wizard', minDay: 4, weight: 0.9, bias: {},
      quotes: ['Nak grind sampai malam.', 'Ada MythQuest Online?'] },
    { id: 'rm1', name: 'Budak RM1', emoji: '🪙', shirt: '#5aa9ff', patience: 45, game: 'puzzle', durations: [[30, 0.85], [60, 0.15]], look: 'kid', weight: 1.2, bias: {},
      quotes: ['Bang, RM1 je. Boleh?', 'PC kosong ada bang?'] },
    { id: 'arena', name: 'Kaki LAN', emoji: '🎯', shirt: '#6fd66f', patience: 40, game: 'war', durations: [[90, 0.55], [60, 0.35], [30, 0.1]], look: 'bandana', weight: 1, bias: { fight: 1.3, loudvideo: 1.3 },
      quotes: ['Member aku mana?', 'Ada War of Ancients?'] },
    { id: 'lepak', name: 'Lepak Sampai Pagi', emoji: '🌙', shirt: '#4b4a8a', patience: 70, game: 'myth', durations: [[90, 0.8], [60, 0.2]], look: 'hoodie', minDay: 3, lateOnly: 50, weight: 0.9, trait: 'linger', bias: { suspicious: 1.3, loudvideo: 1.3 },
      quotes: ['Aku tak ada tempat nak pergi…', 'Bang, tutup pukul berapa?'] },
    { id: 'mirc', name: 'Kaki MIRC', emoji: '💬', shirt: '#9fb3cf', patience: 50, game: 'puzzle', durations: [[60, 0.6], [30, 0.2], [90, 0.2]], look: 'mirc', minDay: 2, weight: 0.9, trait: 'chat', bias: { suspicious: 1.6 },
      quotes: ['a/s/l? haha.', 'Channel #kl-lepak tengah rancak!'] },
  ];

  /* ---------- special events ----------
     Every event is a physical thing in the room: people at the door (kind 'npc'), the fuse box ('power'),
     a puddle ('floor') or a suspect by the snack machine ('machine'). The player selects it in the 3D scene
     (or via "Tengok" in Situasi Panas) and picks a choice in the pop-up menu on it.
     choice.walk  = Abang has to walk over first      choice.remote = resolved at once (phone call)
     choice.cost  = sen, checked against cash          */
  const EVENTS = {
    gang: { kind: 'npc', title: 'Rombongan Budak Sekolah', emoji: '🎒', npc: { type: 'rm1', count: 3 }, time: 18, fallback: 'normal',
      say: '“Bang! Kami bertiga nak main LAN. Ada harga geng tak?”',
      choices: [{ id: 'deal', label: '🔥 Pakej geng', desc: '+RM5 tempahan, tapi queue jadi sesak' }, { id: 'normal', label: '✋ Harga biasa', desc: 'Mereka merungut dan balik. Reputasi turun sedikit' }] },
    download: { kind: 'npc', title: 'Kaki Download', emoji: '🎞️', npc: { type: 'fps', count: 1 }, time: 18, fallback: 'later',
      say: '“Bang, boleh aku muat turun filem besar? Aku bayar lebih!”',
      choices: [{ id: 'now', label: '💰 Benarkan', desc: '+RM8, tetapi line lag 18 saat' }, { id: 'later', label: '📡 Lepas shift', desc: 'Line stabil, dia kecewa sikit' }] },
    mak: { kind: 'npc', title: 'Mak Cari Anak', emoji: '👩', npc: { type: 'uncle', count: 1, look: 'mak' }, time: 18, fallback: 'help',
      say: '“Bang! Anak saya dari tadi dekat sini ke?!”',
      choices: [{ id: 'help', label: '🤝 Tolong cari', desc: 'Reputasi naik, tapi Abang hilang sedikit masa', walkWork: 3 }, { id: 'ignore', label: '🙈 Suruh tunggu', desc: 'Tak sibuk, tapi reputasi jatuh' }] },
    truancy: { kind: 'npc', title: 'Budak Ponteng', emoji: '🏫', npc: { type: 'student', count: 2, look: 'uniform' }, time: 18, fallback: 'refuse', schoolHours: true,
      say: '“Bang, kami nak sewa PC kejap. Cikgu tak tahu.”',
      choices: [{ id: 'refuse', label: '🛡️ Tolak baik-baik', desc: 'Patuh peraturan, professionalism naik' }, { id: 'serve', label: '💰 Benarkan masuk', desc: '+RM2 tip, tapi risiko pemeriksaan naik' }] },
    lan: { kind: 'npc', title: 'LAN Tournament', emoji: '🏆', npc: { type: 'arena', count: 3 }, time: 18, fallback: 'decline',
      say: '“Bang! Kami satu geng, nak guna banyak PC. Kita buat tournament!”',
      choices: [{ id: 'host', label: '🎮 Jadi host', desc: '+RM10 yuran, semua PC boleh penuh — peak jadi kecoh' }, { id: 'decline', label: '🤝 Tolak sopan', desc: 'Kedai lebih tenang, tiada bonus' }] },
    blackout: { kind: 'power', title: 'Blackout!', emoji: '⚡', time: 20, fallback: 'wait',
      say: 'Lampu terpadam! Semua PC mati dan masa sewaan terhenti. Pergi ke kotak fius di dinding.',
      choices: [{ id: 'fuse', label: '🔧 Baiki fius', desc: 'RM8 · bekalan pulih dalam 3 saat', cost: 800, walk: true, work: 1.4 }, { id: 'wait', label: '🕯️ Tunggu elektrik', desc: 'Percuma, tetapi gelap lebih lama', remote: true }] },
    snacktheft: { kind: 'machine', title: 'Snack Hilang', emoji: '🥤', time: 18, fallback: 'loss', requires: 'snack',
      say: 'Stok mesin snack berkurang dan ada orang berdiri dekat mesin. Salah dia ke… atau salah kira?',
      choices: [{ id: 'audit', label: '🔍 Semak stok', desc: 'RM2 · bukti jelas, boleh recover kerugian', cost: 200, walk: true, work: 1.4 }, { id: 'accuse', label: '📢 Tuduh terus', desc: 'Cepat, tapi mungkin silap orang', walk: true, work: 1 }] },
    spill: { kind: 'floor', title: 'Air Tumpah', emoji: '🧃', time: 18, fallback: 'hazard',
      say: 'Minuman tertumpah dekat PC. Lantai licin dan PC sebelah berisiko rosak.',
      choices: [{ id: 'clean', label: '🧹 Panggil cleaner', desc: 'RM6 · bersih serta-merta', cost: 600, remote: true }, { id: 'mop', label: '🧽 Lap sendiri', desc: 'Percuma, tetapi kerja Abang jadi perlahan', walk: true, work: 3 }] },
    raid: { kind: 'npc', title: 'Pegawai Penguat Kuasa', emoji: '👮', time: 9, fallback: 'neutral', isOfficer: true,
      say: '“Selamat petang. Saya akan periksa premis ini.”',
      choices: [{ id: 'cooperate', label: '📋 Sambut & tunjuk rekod', desc: 'Pegawai lebih yakin; professionalism naik', walk: true, work: 1.2 }, { id: 'rush', label: '😰 Buat-buat sibuk', desc: 'Dia curiga; pemeriksaan lebih ketat', remote: true }] },
  };
  // The nomouse special is a PC issue (see ISSUES), so it has no entry above.
  const SPECIALS = ['blackout', 'snacktheft', 'truancy', 'spill', 'lan', 'nomouse', 'fight', 'loudvideo'];

  /** Problems that sit on a PC. `time` = seconds the player has. */
  const ISSUES = {
    suspicious: { icon: '👀', title: 'Monitor disorok', hint: 'Betul-betul curang? Dia mungkin tak bersalah.', time: 13 },
    loudvideo: { icon: '🔊', title: 'Video bising', hint: 'Tegur supaya perlahankan volume.', time: 12 },
    fight: { icon: '💢', title: 'Pelanggan bergaduh', hint: 'Dua pelanggan bertekak. Leraikan cepat!', time: 13 },
    restricted: { icon: '🚨', title: 'Salah laku', hint: 'Laman terlarang dikesan.', time: 13 },
    nomouse: { icon: '🖱️', title: 'Mouse hilang', hint: 'Tak boleh guna tanpa mouse.', time: 13 },
  };

  Object.assign(ns, { CFG, RENTAL, DIRECTOR, ROOM, FAULTS, GAMES, PERKS, TYPES, EVENTS, ISSUES, SPECIALS, priceForMinutes, sessionSecondsFor, clamp, lerp, damp, byId, fmtMoney, clock, dayPart, shortestAngle });
})((window.ABCC = window.ABCC || {}));
