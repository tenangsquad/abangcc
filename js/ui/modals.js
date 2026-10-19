/* ==========================================================================
   4f. MODALS — menu, intro cards, prep + perk draft, shift report, pause, help, settings
   ========================================================================== */
(function (ns) {
  'use strict';

  const { CFG, DIRECTOR, RENTAL, clamp, fmtMoney } = ns;
  const UI = ns.UI;
  const { $, safe } = UI;
  const State = ns.State;

  const modalRoot = $('modalRoot');
  let modalKey = '';
  let overlay = null; // 'help' | 'settings' | null
  UI.getOverlay = () => overlay;
  UI.setOverlay = (v) => { overlay = v; };

  function showModal(html) {
    modalRoot.classList.add('open');
    modalRoot.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${html}</div>`;
    modalRoot.querySelector('button')?.focus({ preventScroll: true });
  }
  function hideModal() {
    modalRoot.classList.remove('open');
    modalRoot.innerHTML = '';
  }
  const stat = (label, value, cls = '') => `<span class="${cls}">${label} ${value}</span>`;

  function renderMenu() {
    const s = UI.s;
    const hasSave = !!State.getSaved() && !(s.phase === 'menu' && s.day === 1 && s.elapsed === 0 && s.reports.length === 0);
    showModal(`
      <span class="modal-eyebrow">GAME NOSTALGIA MALAYSIA · 3D</span>
      <h1>ABANG <em>CC</em>: 2007</h1>
      <p class="modal-lead">"Abang aku balik kampung. Aku kena jaga cyber cafe dia hari demi hari… dan makin lama makin huru-hara."</p>
      <div class="modal-hero">
        <div class="badges"><span>🖥️ Mula 3 PC</span><span>👆 Tap &amp; urus</span><span>⚡ Shift 2 minit</span><span>🎴 Perk draft</span><span>🔥 Peak hour</span><span>👀 Pelanggan suspicious</span></div>
        <p>Mula dengan 3 komputer CRT dan RM35. Setiap hari kau kena capai target jualan, pilih satu daripada dua perk, dan layan setiap pelanggan secara manual. Masalah diselesaikan terus dalam bilik 3D — tap PC, pelanggan atau benda yang berdenyut.</p>
      </div>
      <div class="modal-actions">
        ${hasSave ? '<button class="btn big mint" data-modal="continue">▶ Sambung main</button>' : ''}
        <button class="btn big ${hasSave ? 'paper' : 'mint'}" data-modal="newgame">${hasSave ? '↻ Run baru' : '▶ Mula jaga kedai'}</button>
        <button class="btn big sky" data-modal="help">? Cara main</button>
      </div>
      <p class="small">Alpha 0.12 · progress disimpan automatik dalam browser ini</p>`);
  }

  function perkHTML() {
    const s = UI.s;
    if (s.day < 2) return '<div class="notice">Hari 1 fokus belajar flow kedai dulu. Mulai Hari 2, kau akan dapat <b>2 pilihan perk</b> setiap hari.</div>';
    if (!s.perkDraft?.length) return '<div class="notice">Tiada perk draft baru hari ini.</div>';
    const cards = s.perkDraft.map((id) => {
      const p = State.perkDef(id);
      const locked = s.cash < p.price || s.perkChoiceMade;
      const label = s.perkChoiceMade ? '✓ Pilihan selesai' : s.cash < p.price ? `${fmtMoney(p.price)} diperlukan` : `${fmtMoney(p.price)} · Pilih`;
      const own = State.perkCount(s, id);
      return `<div class="perk"><div class="perk-icon">${safe(p.icon)}</div><strong>${safe(p.name)}${p.repeatMax > 1 ? ` <em class="own">${own}/${p.repeatMax}</em>` : ''}</strong>
        <small class="up">👍 ${safe(p.desc)}</small><small class="down">👎 ${safe(p.downside)}</small>${p.upkeep ? `<small class="upkeep">🧾 ${fmtMoney(p.upkeep)}/hari</small>` : ''}
        <button type="button" class="btn ${locked ? '' : 'mint'}" data-modal="perk" data-id="${p.id}" ${locked ? 'disabled' : ''}>${label}</button></div>`;
    }).join('');
    return `<div class="notice">Pilih <b>1 daripada 2 perk</b>. Yang tak dipilih akan kembali selepas beberapa hari.</div><div class="store-grid">${cards}</div>`;
  }

  function renderPrep() {
    const s = UI.s;
    const goal = State.calcRevenueGoal(s, s.day);
    const canLoan = s.cash < CFG.LOAN.below && !s.loanUsed;
    const billsIn = State.daysToBills(s);
    showModal(`
      <span class="modal-eyebrow">HARI ${s.day} · PERSEDIAAN</span>
      <h1>${safe(CFG.PREP_MESSAGE[(s.day - 1) % CFG.PREP_MESSAGE.length])}<em>!</em></h1>
      <p class="modal-lead">Sasaran jualan hari ini: <b>${fmtMoney(goal)}</b>. Capai target untuk mara ke hari seterusnya.</p>
      <div class="badges stats">${stat('💰', fmtMoney(s.cash))}${stat('🎯 Target', fmtMoney(goal))}${stat('🖥️', s.pcs.length + ' PC')}${stat('⭐ Rep', Math.round(s.rep))}${stat('🤝 Prof', Math.round(s.professionalism))}${stat('🏠 Sewa &amp; bil', billsIn === 1 ? 'hari ini' : billsIn + ' hari lagi')}</div>
      <h2>Perk hari ini</h2>
      ${perkHTML()}
      ${canLoan ? `<div class="notice">Cash makin kurang? Boleh minta pinjaman keluarga ${fmtMoney(CFG.LOAN.amount)} (sekali sahaja).</div>` : ''}
      <div class="modal-actions">
        <button class="btn big mint" data-modal="start">▶ Buka kedai</button>
        ${canLoan ? `<button class="btn big paper" data-modal="loan">Pinjam ${fmtMoney(CFG.LOAN.amount)}</button>` : ''}
        <button class="btn big sky" data-modal="help">? Cara main</button>
      </div>`);
  }

  function renderResult() {
    const s = UI.s;
    const r = s.lastReport;
    if (!r) return;
    const stars = [1, 2, 3].map((n) => `<span class="${n <= r.stars ? 'on' : ''}">⭐</span>`).join('');
    const why = !r.goalMet && r.reasons?.length ? `<div class="notice why"><b>Kenapa gagal?</b><ul>${r.reasons.map((x) => `<li>${safe(x.icon)} ${safe(x.text)}</li>`).join('')}</ul></div>` : '';
    showModal(`
      <span class="modal-eyebrow">LAPORAN HARI ${s.day}</span>
      <h1>${r.goalMet ? 'Target capai' : 'Shift gagal'} <em>${r.goalMet ? '🎉' : '😵'}</em></h1>
      <div class="stars" aria-label="${r.stars} bintang">${stars}</div>
      <p class="modal-lead">${r.goalMet ? 'Bagus! Kedai hari ini lepas target. Esok mungkin lebih huru-hara.' : `Jualan bersih ${fmtMoney(r.income)} — kurang <b>${fmtMoney(r.shortfall)}</b> daripada target. Hari ini diulang dari awal; progres hari-hari lepas kekal.`}</p>
      ${why}
      <div class="settlement">
        <span>Target jualan</span><span>${fmtMoney(r.goal)}</span>
        <span>🎮 Jualan sewa</span><span class="good">+ ${fmtMoney(r.rental)}</span>
        <span>🥤 Jualan lain</span><span class="good">+ ${fmtMoney(r.other)}</span>
        ${r.refunds ? `<span>↩️ Refund</span><span class="bad">− ${fmtMoney(-r.refunds)}</span>` : ''}
        <span>Jualan bersih</span><span class="good">${fmtMoney(r.income)}</span>
        ${r.goalMet ? '' : `<span>Kekurangan</span><span class="bad">− ${fmtMoney(r.shortfall)}</span>`}
        ${r.billsPaid ? `<span>🏠 Sewa &amp; bil bulanan</span><span class="bad">− ${fmtMoney(r.billsPaid)}</span>` : ''}
        ${r.expense ? `<span>🧾 Belanja</span><span class="bad">− ${fmtMoney(r.expense)}</span>` : ''}
        <span>Untung / rugi bersih</span><span class="${r.net < 0 ? 'bad' : 'good'}">${r.net < 0 ? '− ' : '+ '}${fmtMoney(Math.abs(r.net))}</span>
        <span>Cash kedai</span><span>${fmtMoney(r.endingCash)}</span>
      </div>
      <div class="badges stats">${stat('👥', r.served + ' pelanggan')}${stat('💢', r.incidents + ' insiden')}${stat('🔧', r.repairs + ' repair')}${stat('⚡ Combo', 'x' + (r.combo || 0))}${stat('🏆 Clutch', r.heroSaved || 0)}${stat('👮', r.inspections + ' pemeriksaan')}</div>
      <div class="modal-actions">
        ${r.goalMet ? '<button class="btn big mint" data-modal="next">→ Hari seterusnya</button>' : '<button class="btn big coral" data-modal="retryday">↻ Cuba hari ini lagi</button>'}
        <button class="btn big paper" data-modal="share">📋 Salin result</button>
      </div>`);
  }

  function renderPaused() {
    showModal(`
      <span class="modal-eyebrow">SIMULASI DIHENTIKAN SEBENTAR</span>
      <h1>Pause <em>☕</em></h1>
      <p class="modal-lead">Semua timer berhenti. Ambil nafas, susun strategi.</p>
      <div class="modal-actions">
        <button class="btn big mint" data-modal="resume">▶ Sambung shift</button>
        <button class="btn big sky" data-modal="help">? Cara main</button>
        <button class="btn big paper" data-modal="settings">⚙ Tetapan</button>
        <button class="btn big paper" data-modal="mainmenu">Menu utama</button>
      </div>
      <p class="small">Progress disimpan automatik.</p>`);
  }

  const INTRO = [
    { eye: 'SELAMAT DATANG KE ABANG CC', title: 'Kedai ini hidup huru-hara', body: 'Kau bermula dengan RM35 dan 3 PC. Tap pelanggan yang beratur, pilih masa sewaan, kemudian tap PC kosong. Semua PC sudah ada game siap-siap.', badges: ['👆 Tap komputer / pelanggan', '⚡ Shift 2 minit', '🎮 Browser sahaja'] },
    { eye: 'TARGET HARIAN', title: 'Setiap hari ada target jualan', body: 'Capai target untuk mara ke hari seterusnya. Jualan = sewa + snack + bonus, tolak refund. Sewa &amp; bil dibayar sebulan sekali (bukan setiap hari); belanja lain hanya bila kau betul-betul belanja. Kalau gagal, kau ulang hari yang sama tanpa hilang progres.', badges: ['🎯 Target jualan', '💰 Cash dibawa ke esok', '↻ Ulang bila gagal'] },
    { eye: 'MASALAH DALAM BILIK', title: 'Selesaikan terus di tempat kejadian', body: 'PC hang, pelanggan suspicious, video bising, gaduh, blackout, air tumpah… Tap benda itu dalam bilik, pilih tindakan pada menu yang muncul di sebelahnya, dan Abang akan berjalan ke sana. Panel Situasi Panas hanya beri amaran.', badges: ['❓ Suspicious: tegur lembut atau tuduh berani', '↻ Restart PC = refund 25%', '🔥 Peak hour = lebih ramai'] },
    { eye: 'PERK ROGUELITE', title: 'Mulai hari 2, pilih 1 daripada 2 perk', body: 'Tambah PC, snack machine, router, aircond, CCTV… Setiap perk ada kelebihan dan kelemahan (bil harian, risiko). Setiap run berbeza.', badges: ['🎴 2 pilihan rawak', '🧩 Build berlainan', '📈 Makin lama, makin susah'] },
  ];
  function renderOnboarding() {
    const s = UI.s;
    const step = clamp(s.introStep || 0, 0, INTRO.length - 1);
    const c = INTRO[step];
    showModal(`
      <span class="modal-eyebrow">${c.eye}</span>
      <h1>${c.title}<em>.</em></h1>
      <p class="modal-lead">${c.body}</p>
      <div class="badges">${c.badges.map((b) => `<span>${b}</span>`).join('')}</div>
      <div class="intro-nav">
        <div class="dots">${INTRO.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>
        <button class="btn paper" data-modal="introskip">Langkau</button>
        ${step > 0 ? '<button class="btn sky" data-modal="introback">Sebelum</button>' : ''}
        ${step < INTRO.length - 1 ? '<button class="btn mint" data-modal="intronext">Seterusnya →</button>' : '<button class="btn big mint" data-modal="introdone">▶ Masuk Hari 1</button>'}
      </div>`);
  }

  function renderHelp() {
    overlay = 'help';
    showModal(`
      <span class="modal-eyebrow">PANDUAN PANTAS</span>
      <h1>Jaga CC. <em>Jangan panik!</em></h1>
      <div class="modal-hero">
        <p>👤 <b>Tap pelanggan</b> yang beratur → menu <b>30 / 60 / 90 minit</b> muncul di sebelahnya (<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>) → tap PC yang berkelip hijau. Pilih sama seperti permintaan pelanggan (★) untuk bayaran penuh; salah pilih = bayaran dipotong.</p>
        <p>🔧 <b>PC bermasalah</b> (hang, beku, panas, BSOD, internet putus, rosak)? Tap PC → pilih cara baiki pada menu di sebelah PC. Restart masa ada pelanggan = refund 25% (sekali setiap kejadian).</p>
        <p>❓ <b>PC suspicious</b>: tap PC → <b>Tegur baik-baik</b> (selamat) atau <b>Tuduh &amp; halau</b> (berani). Dia mungkin tak bersalah — salah tuduh kos reputasi, professionalism dan refund.</p>
        <p>🎲 <b>Kejadian khas</b> (rombongan, ponteng, blackout, air tumpah, snack hilang…) muncul sebagai orang/benda dalam bilik. Tap yang berdenyut, atau kad di <b>Situasi Panas</b> (TENGOK), lalu pilih pada menu di atas benda itu.</p>
        <p>🖱️ Zoom kamera: roda tetikus / cubit / butang Zoom. ⌨️ <kbd>Space</kbd> pause · <kbd>N</kbd> pelanggan seterusnya · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> tempoh · <kbd>R</kbd> restart PC yang dipilih.</p>
      </div>
      <div class="modal-actions"><button class="btn big mint" data-modal="back">Faham, jom main!</button></div>`);
  }

  function renderSettings() {
    overlay = 'settings';
    const s = UI.s;
    const seg = (key, options, current) => `<div class="seg">${options.map(([v, label]) => `<button type="button" class="btn ${current === v ? 'mint active' : ''}" data-setting="${key}" data-value="${v}">${label}</button>`).join('')}</div>`;
    showModal(`
      <span class="modal-eyebrow">TETAPAN</span>
      <h1>Ubah <em>suai</em></h1>
      <div class="switch-row"><span>🔊 Bunyi</span>${seg('sound', [[true, 'ON'], [false, 'OFF']], UI.settings.sound)}</div>
      <div class="switch-row"><span>🎨 Kualiti grafik</span>${seg('quality', [['high', 'Tinggi'], ['medium', 'Sederhana'], ['low', 'Rendah']], UI.settings.quality)}</div>
      <div class="switch-row"><span>🎚️ Kesukaran</span>${seg('preset', Object.entries(DIRECTOR.presets).map(([k, v]) => [k, v.label]), s.preset || 'biasa')}</div>
      <div class="switch-row"><span>💡 Tunjuk petunjuk</span>${seg('hints', [[true, 'ON'], [false, 'OFF']], UI.settings.hints)}</div>
      <div class="switch-row"><span>🐢 Kurangkan animasi</span>${seg('reduceMotion', [[true, 'ON'], [false, 'OFF']], UI.settings.reduceMotion)}</div>
      <p class="small">Kualiti Rendah mematikan outline &amp; bayang matahari dan menurunkan resolusi — sesuai untuk telefon lama. Kesukaran berkuat kuasa untuk hari seterusnya.</p>
      <div class="modal-actions">
        <button class="btn big mint" data-modal="back">Siap</button>
        <button class="btn coral" data-modal="wipe">Padam save</button>
      </div>`);
  }

  /** Show whichever modal matches the game phase (unless help / settings is on top). */
  UI.syncModal = function syncModal(force = false) {
    const s = UI.s;
    if (overlay && !force) return;
    if (!force && modalKey === s.phase) return;
    modalKey = s.phase;
    switch (s.phase) {
      case 'menu': return renderMenu();
      case 'prep': return renderPrep();
      case 'result': return renderResult();
      case 'onboarding': return renderOnboarding();
      case 'paused': return renderPaused();
      default: return hideModal();
    }
  };

  UI.openOverlay = function openOverlay(kind) {
    UI.Sound.unlock();
    if (UI.s.phase === 'active') {
      UI.s.phase = 'paused';
      State.save(UI.s);
    }
    overlay = kind;
    kind === 'help' ? renderHelp() : renderSettings();
  };

  UI.resync = function resync() {
    overlay = null;
    UI.syncModal(true);
    UI.refresh(true);
  };

  function fallbackCopy(text) {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand('copy');
      UI.toast('Result disalin!', 'good');
    } catch {
      UI.toast('Clipboard tak tersedia di browser ni.', 'bad');
    }
    el.remove();
  }

  UI.handleModal = function handleModal(el) {
    const cmd = el.dataset.modal;
    UI.Sound.unlock();
    UI.Sound.play('click');
    let s = UI.s;
    switch (cmd) {
      case 'newgame':
        if ((s.reports.length > 0 || s.elapsed > 10) && !confirm('Mula balik akan overwrite save lama. Confirm?')) return;
        State.resetSave();
        UI.s = s = State.create();
        s.phase = 'onboarding';
        s.introStep = 0;
        State.save(s);
        return UI.resync();
      case 'continue':
        UI.s = State.getSaved() || s;
        if (UI.s.phase === 'menu') UI.s.phase = 'prep';
        return UI.resync();
      case 'start':
        State.startShift(s);
        State.save(s);
        return UI.resync();
      case 'resume':
        s.phase = 'active';
        State.save(s);
        return UI.resync();
      case 'mainmenu':
        s.phase = 'menu';
        State.save(s);
        return UI.resync();
      case 'next':
        State.proceed(s);
        State.save(s);
        return UI.resync();
      case 'retryday':
        UI.s = State.retryDay(s);
        State.save(UI.s);
        return UI.resync();
      case 'perk': {
        const r = State.buyPerk(s, el.dataset.id);
        UI.toast(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) State.save(s);
        renderPrep();
        return UI.refresh(true);
      }
      case 'loan':
        if (State.loan(s)) {
          UI.toast(`Pinjaman ${fmtMoney(CFG.LOAN.amount)} diterima.`, 'good');
          State.save(s);
          renderPrep();
        }
        return;
      case 'help': return UI.openOverlay('help');
      case 'settings': return UI.openOverlay('settings');
      case 'back':
        overlay = null;
        return UI.syncModal(true);
      case 'wipe':
        if (confirm('Padam semua progress dan mula dari awal?')) {
          State.resetSave();
          UI.s = State.create();
          return UI.resync();
        }
        return;
      case 'introskip':
        s.phase = 'prep';
        s.introStep = 4;
        s.dayGoal = State.calcRevenueGoal(s, s.day);
        State.save(s);
        return UI.resync();
      case 'intronext':
        s.introStep = (s.introStep || 0) + 1;
        State.save(s);
        return renderOnboarding();
      case 'introback':
        s.introStep = Math.max(0, (s.introStep || 0) - 1);
        State.save(s);
        return renderOnboarding();
      case 'introdone':
        s.phase = 'prep';
        s.dayGoal = State.calcRevenueGoal(s, s.day);
        s.perkDraft = [];
        State.save(s);
        return UI.resync();
      case 'share': {
        const r = s.lastReport;
        const text = `Aku sampai Hari ${s.day} dalam ABANG CC: 2007 — target ${fmtMoney(r?.goal || s.dayGoal)} | jualan bersih ${fmtMoney(r?.income || 0)} | ${r?.stars || 1}⭐ | ${r?.incidents || 0} insiden. Kau boleh survive peak hour tak? #AbangCC2007`;
        if (navigator.clipboard && location.protocol !== 'file:') navigator.clipboard.writeText(text).then(() => UI.toast('Result disalin!', 'good')).catch(() => fallbackCopy(text));
        else fallbackCopy(text);
      }
    }
  };

  modalRoot.addEventListener('click', (e) => {
    const setting = e.target.closest('[data-setting]');
    if (setting) {
      const raw = setting.dataset.value;
      const key = setting.dataset.setting;
      const val = raw === 'true' ? true : raw === 'false' ? false : raw;
      if (key === 'preset') UI.s.preset = val;
      else {
        UI.settings[key] = val;
        if (key === 'quality') UI.settings.qualityChosen = true;
        UI.saveSettings();
      }
      UI.applySettings();
      UI.Sound.play('click');
      return renderSettings();
    }
    const el = e.target.closest('[data-modal]');
    if (el) UI.handleModal(el);
  });
})(window.ABCC);
