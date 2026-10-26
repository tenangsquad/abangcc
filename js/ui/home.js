/* ==========================================================================
   4d. HOME — the main menu page (shown before every session, instead of the old pop-up)
   --------------------------------------------------------------------------
   Full-screen page: the live 3D café stays on screen behind a floating menu card. What the card offers depends on
   whether there is a session to go back to:
     no session   →  Mula Main (pick a difficulty → a new save) · Cara Main · Koleksi · Tetapan
     has session  →  Sambung Main (the save written last) · Main Baru · Muat Game · Cara Main · Koleksi · Tetapan
   Every New Game is its own save; Muat Game lists them all (see js/state/save.js). Buttons carry data-modal="…" so js/ui/modals.js (UI.handleModal) does the work, exactly as for the pop-ups.
   ========================================================================== */
(function (ns) {
  'use strict';

  const { fmtMoney, DIRECTOR } = ns;
  const UI = ns.UI;
  const { $, safe } = UI;
  const State = ns.State;

  const home = $('home');
  const card = $('homeCard');
  const chips = $('homeChips');
  const tip = $('homeTip');

  /** Is there a run to go back to? (A fresh, untouched shop is not a session.) */
  UI.hasSession = (s) => !!(s && (s.resumeTo || s.day > 1 || s.reports?.length || s.elapsed > 0));

  const where = {
    onboarding: 'Belum habis pengenalan',
    prep: 'Sebelum buka kedai',
    paused: 'Shift dijeda',
    result: 'Laporan hari',
    active: 'Shift dijeda',
  };
  UI.stageLabel = (stage) => where[stage] || '';

  /** One tip a day (it changes at midnight); tap the tip for the next one. Every line is true of the game as it is. */
  const TIPS = [
    'Pilih tempoh yang sama dengan permintaan pelanggan (★) untuk bayaran penuh. Salah pilih = bayaran dipotong.',
    'Tap dua kali pada pelanggan untuk Auto-duduk: terus ke PC kosong yang paling dekat.',
    'Restart PC masa ada pelanggan = refund 25% (sekali setiap kejadian).',
    'Pelanggan yang menunggu terlalu lama akan balik dan reputasi turun. Layan yang bar kesabarannya hampir merah dulu.',
    'PC suspicious? Tegur baik-baik dulu. Menuduh terus berisiko kalau dia sebenarnya tak bersalah.',
    'Peak hour = lebih ramai dan PC cepat panas. Siapkan perk sebelum waktu itu tiba.',
    'Perk CCTV memberi petunjuk tentang PC yang suspicious, tapi petunjuknya tak 100% tepat.',
    'Hari 1 tiada kejadian rawak. Guna masa itu untuk belajar flow kedai.',
    'Sewa & bil dibayar sebulan sekali, bukan setiap hari. Simpan cukup cash untuk hari itu.',
    'Gagal capai target? Hari yang sama diulang dan progres hari-hari lepas kekal.',
    'Papan kekunci: Space = pause, N = pelanggan seterusnya, 1 / 2 / 3 = tempoh, A = auto-duduk.',
    'Topi Abang dibuka bila kau lepas hari-hari tertentu. Tengok di Koleksi.',
  ];
  let tipAt = Math.floor(Date.now() / 86400000) % TIPS.length;
  const showTip = () => { tip.textContent = `💡 ${TIPS[tipAt % TIPS.length]}`; };
  tip.addEventListener('click', () => {
    tipAt = (tipAt + 1) % TIPS.length;
    showTip();
    UI.Sound.play('tap');
  });

  const tile = (cmd, ico, label, sub, css = '', size = 44) =>
    `<button type="button" class="tile ${css}" data-modal="${cmd}"><span class="tile-ico">${UI.icon(ico, size)}</span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</button>`;

  /** "Buy me a coffee" — a plain link (opens the TNG Digital payment page in a new tab), styled like the other tiles. */
  const COFFEE_URL = 'https://payment.tngdigital.com.my/sc/bDLoeTIL3c';
  const coffeeTile = `<a class="tile coffee" href="${COFFEE_URL}" target="_blank" rel="noopener noreferrer"><span class="tile-ico">${UI.icon('coffee', 44)}</span><b>Belanja Kopi</b><small>Sokong kami</small></a>`;

  /** A small side-by-side tile (icon left, label right) for the secondary buttons next to the big one. */
  const mini = (cmd, ico, label, css) => `<button type="button" class="tile mini ${css}" data-modal="${cmd}"><span class="tile-ico">${UI.icon(ico, 26)}</span><b>${label}</b></button>`;

  UI.renderHome = function renderHome() {
    const s = UI.s;
    const session = UI.hasSession(s);
    const meta = ns.Meta.get();
    const diff = DIRECTOR.presets[s.preset] || DIRECTOR.presets.biasa;
    const hero = session
      ? tile('continue', 'resume', 'Sambung Main', `${diff.icon} Hari ${s.day} · ${fmtMoney(s.cash)}${where[s.resumeTo] ? ` · ${where[s.resumeTo]}` : ''}`, 'hero', 60)
      : tile('newgame', 'play', 'Mula Main', `Pilih kesukaran · modal ${fmtMoney(ns.CFG.START_CASH)}`, 'hero', 60);
    const row = [
      tile('help', 'guide', 'Cara Main', 'Panduan', 'sky'),
      tile('collection', 'collection', 'Koleksi', `${ns.Meta.hats().filter((h) => h.unlocked).length}/${ns.Meta.hats().length} topi`, 'violet'),
      tile('settings', 'settings', 'Tetapan', 'Bunyi · grafik', ''),
      coffeeTile,
    ].filter(Boolean);
    // the big button shares its row (70 / 30) with Main Baru (when a run is open) and Muat Game (when there are saves); the small buttons sit below, evenly
    const side = [session ? mini('newgame', 'play', 'Main Baru', 'coral') : '', State.saveCount() ? mini('loadgame', 'collection', 'Muat Game', 'sky') : ''].filter(Boolean);
    const top = side.length ? `<div class="tile-top">${hero}<div class="tile-side">${side.join('')}</div></div>` : hero;
    card.innerHTML = `${top}<div class="tile-row" style="--n:${row.length}">${row.join('')}</div>`;
    showTip();
    chips.innerHTML = (session ? `<span>${diff.icon} ${safe(diff.label)}</span>` : '') + (meta.bestDay ? `<span>🏆 Hari terbaik ${safe(meta.bestDay)}</span>` : '');
    document.documentElement.dataset.screen = 'home';
    home.hidden = false;
    card.querySelector('.tile')?.focus({ preventScroll: true });
  };

  UI.hideHome = function hideHome() {
    document.documentElement.dataset.screen = 'game';
    home.hidden = true;
  };

  // the page is one big hit area: nothing underneath (the 3D scene) reacts while it is up
  home.addEventListener('click', (e) => {
    const el = e.target.closest('[data-modal]');
    if (el) UI.handleModal(el);
  });
})(window.ABCC);
