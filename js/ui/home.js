/* ==========================================================================
   4d. HOME — the main menu page (shown before every session, instead of the old pop-up)
   --------------------------------------------------------------------------
   Full-screen page: the live 3D café stays on screen behind a floating menu card. What the card offers depends on
   whether there is a session to go back to:
     no session   →  Mula Main · Cara Main · Koleksi · Tetapan
     has session  →  Sambung Main · Main Semula · Cara Main · Koleksi · Tetapan
   Buttons carry data-modal="…" so js/ui/modals.js (UI.handleModal) does the work, exactly as for the pop-ups.
   ========================================================================== */
(function (ns) {
  'use strict';

  const { fmtMoney } = ns;
  const UI = ns.UI;
  const { $, safe } = UI;

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

  UI.renderHome = function renderHome() {
    const s = UI.s;
    const session = UI.hasSession(s);
    const meta = ns.Meta.get();
    const hero = session
      ? tile('continue', 'resume', 'Sambung Main', `Hari ${s.day} · ${fmtMoney(s.cash)}${where[s.resumeTo] ? ` · ${where[s.resumeTo]}` : ''}`, 'hero', 60)
      : tile('newgame', 'play', 'Mula Main', `Hari 1 · modal ${fmtMoney(ns.CFG.START_CASH)} · 3 PC`, 'hero', 60);
    const row = [
      session ? tile('restart', 'restart', 'Main Semula', 'Dari Hari 1', 'coral') : '',
      tile('help', 'guide', 'Cara Main', 'Panduan', 'sky'),
      tile('collection', 'collection', 'Koleksi', `${ns.Meta.hats().filter((h) => h.unlocked).length}/${ns.Meta.hats().length} topi`, 'violet'),
      tile('settings', 'settings', 'Tetapan', 'Bunyi · grafik', ''),
    ].filter(Boolean);
    card.innerHTML = `${hero}<div class="tile-row" style="--n:${row.length}">${row.join('')}</div>`;
    showTip();
    chips.innerHTML = meta.bestDay ? `<span>🏆 Hari terbaik ${safe(meta.bestDay)}</span>` : '';
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
