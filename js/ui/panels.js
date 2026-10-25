/* ==========================================================================
   4d. SIDEBAR PANELS — Situasi Panas, Pelanggan Menunggu, and the menu on the thing you tapped
   --------------------------------------------------------------------------
   Situasi Panas is an ALERT list: it says what is wrong and where, and a tap on a card
   selects that thing in the room. It never holds the resolution buttons — those live in
   the pop-up menu that opens right next to the customer, PC or object you selected.
   ========================================================================== */
(function (ns) {
  'use strict';

  const { CFG, FAULTS, EVENTS, ISSUES, TYPES, byId, clamp, fmtMoney } = ns;
  const UI = ns.UI;
  const { $, safe, pad2, setText } = UI;
  const State = ns.State;

  const PC_ISSUE_ICON = { suspicious: '❓', loudvideo: '🔊', fight: '💢', restricted: '🚨', nomouse: '🖱️' };
  UI.PC_ISSUE_ICON = PC_ISSUE_ICON;

  /** Where in the room to look, in words. */
  function whereOf(s, ev) {
    if (ev.kind === 'power') return 'Kotak fius di dinding kiri';
    if (ev.kind === 'floor') return `Lantai dekat PC ${ev.data.pcId}`;
    if (ev.kind === 'machine') return 'Dekat mesin snek';
    return 'Di pintu masuk';
  }

  /* ------------------------------------------------------------ Situasi Panas */
  let crisisKey = '';
  UI.renderCrises = function renderCrises() {
    const s = UI.s;
    const items = [];
    const raid = (s.worldEvents || []).find((e) => e.type === 'raid');
    if (s.officer && !raid) items.push({ key: 'officer', cls: 'officer', ico: '👮', title: 'Pegawai memeriksa', text: 'Berjalan dalam CC dan teliti setiap PC. Pastikan tiada masalah!' });
    for (const ev of s.worldEvents || []) {
      const def = EVENTS[ev.type];
      items.push({ key: `event:${ev.id}`, cls: `event ${ev.type}`, ico: def.emoji, title: def.title, text: `${whereOf(s, ev)} — tap untuk lihat pilihan`, timer: ev.time, total: ev.total, target: { kind: 'event', id: ev.id } });
    }
    for (const ev of s.activeIssues || []) {
      const pc = byId(s.pcs, ev.pcId);
      if (!pc?.issue) continue;
      const info = ISSUES[ev.type];
      items.push({ key: `issue:${ev.pcId}:${ev.type}`, cls: ev.type, ico: PC_ISSUE_ICON[ev.type] || info.icon, title: `${info.title} · PC ${ev.pcId}`, text: 'Tap PC untuk pilih tindakan', timer: ev.time, total: ev.total || info.time, target: { kind: 'pc', id: ev.pcId } });
    }
    for (const p of s.pcs) {
      if (p.fault && p.status === 'fault') items.push({ key: `fault:${p.id}`, cls: 'fault', ico: FAULTS[p.fault].icon, title: `PC ${p.id}: ${FAULTS[p.fault].label}`, text: 'Tap PC untuk pilih cara baiki', target: { kind: 'pc', id: p.id }, timer: FAULTS[p.fault].auto && !p.autoDone ? Math.max(0, FAULTS[p.fault].auto - (p.faultAge || 0)) : undefined, total: FAULTS[p.fault].auto || undefined });
    }

    const visible = items.slice(0, 5);
    const key = visible.map((i) => i.key).join('|');
    setText($('crisisCount'), String(items.length));
    $('crisisPanel').classList.toggle('urgent', items.length > 0 && !s.officer);
    $('crisisPanel').classList.toggle('calm', items.length === 0);

    if (key !== crisisKey) {
      crisisKey = key;
      $('crisisList').innerHTML = visible.length
        ? visible.map((i) => `<button type="button" class="crisis ${i.cls}" ${i.target ? `data-kind="${i.target.kind}" data-id="${i.target.id}"` : 'disabled'} data-key="${safe(i.key)}"><span class="ico" ${i.total ? 'style="--p:100"' : ''}><span>${safe(i.ico)}</span></span><span class="ctext"><b>${safe(i.title)}${i.total && i.timer != null ? ` · <em data-t>${Math.ceil(i.timer)}</em>s` : ''}</b><small>${safe(i.text)}</small></span>${i.target ? '<span class="look">TENGOK ›</span>' : ''}</button>`).join('')
        : '<p class="calm-note">Aman buat masa ini. Tap pelanggan → pilih masa → tap PC kosong ☕</p>';
    }
    // live countdowns without re-rendering (keeps cards clickable)
    for (const i of visible) {
      if (!i.total || i.timer == null) continue;
      const card = $('crisisList').querySelector(`[data-key="${CSS.escape(i.key)}"]`);
      if (!card) continue;
      card.querySelector('.ico').style.setProperty('--p', clamp((i.timer / i.total) * 100, 0, 100));
      const t = card.querySelector('[data-t]');
      if (t) setText(t, String(Math.ceil(Math.max(0, i.timer))));
    }

    // banner over the world
    const banner = $('crisisOverlay');
    let html = '';
    const first = (s.activeIssues || []).find((a) => byId(s.pcs, a.pcId)?.issue);
    if (s.powerOutage > 0) html = `<div class="world-alert amber">⚡ BLACKOUT · ${Math.ceil(s.powerOutage)}s</div>`;
    else if (s.officer) html = '<div class="world-alert">👮 PEGAWAI SEDANG PERIKSA!</div>';
    else if (first) html = `<div class="world-alert">${safe(PC_ISSUE_ICON[first.type])} PC ${first.pcId}<span class="long"> PERLUKAN TINDAKAN</span> · ${Math.ceil(first.time)}s</div>`;
    else if (s.worldEvents?.length) html = `<div class="world-alert amber">${safe(EVENTS[s.worldEvents[0].type].emoji)} ${safe(EVENTS[s.worldEvents[0].type].title)}</div>`;
    if (banner.dataset.html !== html) {
      banner.dataset.html = html;
      banner.innerHTML = html;
    }
    const v = $('vignette');
    v.classList.toggle('on', s.powerOutage > 0);
    v.classList.toggle('alert', s.powerOutage <= 0 && !!first);
  };

  /* ---------------------------------------------------------- Pelanggan Menunggu */
  let queueKey = '';
  UI.renderQueue = function renderQueue() {
    const s = UI.s;
    const waiting = State.inQueue(s).filter((c) => c.status === 'waiting' || c.status === 'arriving');
    setText($('queueCount'), String(waiting.length));
    const key = waiting.map((c) => `${c.id}:${c.status}:${c.id === s.pendingCustomerId ? 1 : 0}`).join(',');
    if (key !== queueKey) {
      queueKey = key;
      $('queueList').innerHTML = waiting.length
        ? waiting.map((c) => `<button type="button" class="queue-item ${c.id === s.pendingCustomerId ? 'chosen' : ''}" data-customer="${c.id}">
            <span class="queue-avatar" style="--c:${safe(c.color)}">${safe(c.emoji)}</span>
            <span class="queue-meta"><span class="queue-name"><span>${safe(c.name)}</span><b class="want">${c.requestedMinutes} MIN</b></span><span class="patience"><i></i></span></span>
          </button>`).join('')
        : '<p class="empty">Belum ada pelanggan. Bersedia! 🧑‍💻</p>';
    }
    for (const el of $('queueList').querySelectorAll('[data-customer]')) {
      const c = byId(s.customers, Number(el.dataset.customer));
      if (!c) continue;
      const pct = State.patiencePct(c);
      const bar = el.querySelector('.patience');
      bar.firstElementChild.style.width = pct + '%';
      bar.classList.toggle('low', pct < 30);
      bar.classList.toggle('mid', pct >= 30 && pct < 60);
    }
  };

  /* ------------------------------------------------------- menu building blocks */
  function btn(o, targetId, extra = '') {
    return `<button type="button" class="btn ${o.css || ''} ${o.sub ? 'stack' : ''}" ${o.disabled ? 'disabled' : ''} data-act="${o.act}" data-id="${targetId}" ${o.choice ? `data-choice="${o.choice}"` : ''} ${extra}>${safe(o.label)}${o.sub ? `<small>${safe(o.sub)}</small>` : ''}</button>`;
  }
  const patienceBar = (c) => {
    const pct = State.patiencePct(c);
    return `<div class="patience ${pct < 30 ? 'low' : pct < 60 ? 'mid' : ''}" data-patience="${c.id}" aria-label="Kesabaran ${Math.round(pct)}%"><i style="width:${pct}%"></i></div>`;
  };

  /* ------------------------------------------------------------ Arahan Abang */
  const TASK_NAME = { restart: '↻ Restart', repair: '🔧 Repair', cool: '❄️ Sejukkan', reset: '📡 Reset sambungan', soft: '🗣️ Tegur baik-baik', harsh: '📢 Tuduh & halau', warn: '🔊 Tegur', calm: '🕊️ Leraikan', eject: '👋 Halau', close: '✖️ Tutup laman', search: '🔍 Geledah', replace: '🛒 Mouse baru' };
  function taskText(s, t) {
    if (t.entityKind === 'event') {
      const ev = State.eventById(s, t.entityId);
      if (!ev) return { text: 'Kejadian dah tamat', target: null };
      const ch = EVENTS[ev.type].choices.find((c) => c.id === t.opts?.choice);
      return { text: `${EVENTS[ev.type].emoji} ${ch ? ch.label.replace(/^\S+\s/, '') : EVENTS[ev.type].title}`, sub: EVENTS[ev.type].title, target: { kind: 'event', id: ev.id } };
    }
    return { text: `${TASK_NAME[t.kind] || t.kind} · PC ${pad2(t.entityId)}`, target: { kind: 'pc', id: t.entityId } };
  }
  let jobKey = '';
  /** The list of jobs Abang has lined up (max 3): what he is on, what is waiting, with reorder / cancel. */
  UI.renderJobs = function renderJobs() {
    const s = UI.s;
    const tasks = State.taskList(s);
    const key = tasks.map((t, i) => `${t.id}:${i}:${t === s.activeTask ? (t.remaining === null ? 'w' : 'k') : 'q'}`).join('|');
    const asst = $('asstLine');
    if (asst) {
      const text = s.assistant && s.phase === 'active' ? `🎀 ${CFG.ASSISTANT.name}: ${State.assistantStatus(s)}` : '';
      asst.hidden = !text;
      setText(asst, text);
    }
    $('jobsPanel').classList.toggle('idle', !tasks.length);
    setText($('taskCount'), `${tasks.length}/${CFG.MAX_COMMANDS}`);
    $('taskCount').classList.toggle('full', tasks.length >= CFG.MAX_COMMANDS);
    if (key === jobKey) return;
    jobKey = key;
    $('jobList').innerHTML = tasks.length
      ? tasks.map((t, i) => {
          const info = taskText(s, t);
          const active = t === s.activeTask;
          const state = active ? (t.remaining === null ? '🚶 menuju…' : '🔧 sedang buat') : i === 1 && s.activeTask ? '⏳ seterusnya' : `⏳ #${i + 1}`;
          const canUp = !active && s.commands.indexOf(t) > 0;
          const canCancel = !(active && t.remaining !== null);
          return `<li class="job ${active ? 'active' : ''}" ${info.target ? `data-kind="${info.target.kind}" data-id="${info.target.id}"` : ''}><span class="job-n">${i + 1}</span><span class="job-main"><b>${safe(info.text)}</b><small>${state}</small></span>${canUp ? `<button type="button" class="job-btn" data-job-up="${t.id}" title="Dahulukan" aria-label="Dahulukan arahan ${i + 1}">↑</button>` : ''}${canCancel ? `<button type="button" class="job-btn" data-job-cancel="${t.id}" title="Batalkan" aria-label="Batalkan arahan ${i + 1}">✕</button>` : ''}</li>`;
        }).join('')
      : '<li class="job-empty">Abang free. Tap PC atau kejadian untuk bagi arahan.</li>';
  };

  /** Live numbers in the pop-up menu (countdowns, patience bar) without rebuilding its buttons. */
  UI.tickDesk = function tickDesk() {
    const s = UI.s;
    for (const el of document.querySelectorAll('#worldMenu [data-evtimer]')) {
      const id = el.dataset.evtimer;
      let v = null;
      if (id.startsWith('pc')) v = (s.activeIssues || []).find((e) => e.pcId === Number(id.slice(2)) || e.partnerPcId === Number(id.slice(2)))?.time;
      else if (id.startsWith('play')) v = byId(s.pcs, Number(id.slice(4)))?.occupiedSeconds;
      else v = State.eventById(s, Number(id))?.time;
      if (v != null) setText(el, String(Math.ceil(Math.max(0, v))));
    }
    for (const el of $('worldMenu').querySelectorAll('[data-patience]')) {
      const c = byId(s.customers, Number(el.dataset.patience));
      if (!c) continue;
      const pct = State.patiencePct(c);
      el.firstElementChild.style.width = pct + '%';
      el.classList.toggle('low', pct < 30);
      el.classList.toggle('mid', pct >= 30 && pct < 60);
    }
  };

  /* ------------------------------------------- the menu on the thing you tapped */
  UI.menuDismissed = null;
  UI.menuTapped = null; // what the player last tapped, so a default selection never pops an info card by itself
  UI.menuTarget = null;
  const menuKey = (sel) => (sel ? `${sel.kind}:${sel.id}` : null);
  let menuSig = '';

  /**
   * Actions live on the thing you clicked: tap a customer (30 / 60 / 90 min), a PC, or a door crowd / puddle /
   * fuse box and its choices pop up right there in the room. There is no separate side panel for them.
   */
  UI.renderWorldMenu = function renderWorldMenu(force) {
    const s = UI.s;
    const el = $('worldMenu');
    const sel = s.selected;
    let opts = [];
    let title = '', hint = '', info = '', infoSig = '', timerId = null, timer = 0, mode = '', showEmpty = false;
    if (s.phase === 'active' && sel?.kind === 'customer') {
      const c = byId(s.customers, sel.id);
      if (c && c.id === s.pendingCustomerId && ['waiting', 'arriving'].includes(c.status)) {
        mode = 'dur';
        title = `${c.emoji} ${c.name}`;
        hint = `“Bang, ${c.requestedMinutes} minit!” · ★ = permintaan pelanggan`;
        info = patienceBar(c);
        opts = State.durationOptions(s, c.id).map((d) => ({ act: 'duration', choice: d.minutes, label: `${d.minutes} MIN${d.wanted ? ' ★' : ''}`, sub: `${fmtMoney(d.price)} · tekan ${d.minutes / 30}`, css: `${d.chosen ? 'mint' : 'paper'} ${d.wanted ? 'wanted' : ''}` }));
        opts.push({ act: 'autoseat', label: '⚡ Auto-duduk', sub: `★ ${c.requestedMinutes} min + PC terdekat · tekan A · atau tap dua kali`, css: 'sky', disabled: !State.idlePCs(s).length || s.powerOutage > 0 });
      }
    } else if (s.phase === 'active' && sel?.kind === 'assistant' && State.assistantPresent(s)) {
      opts = State.options(s, sel);
      title = `🎀 ${CFG.ASSISTANT.name} · Pembantu`;
      hint = State.assistantStatus(s);
      infoSig = hint;
      info = '<p class="wm-info">Tap air tumpah atau kotak fius untuk suruh dia. Jangan lupa: gaji dia dibayar sebulan sekali.</p>';
    } else if (s.phase === 'active' && (sel?.kind === 'pc' || sel?.kind === 'event')) {
      opts = State.options(s, sel);
      if (sel.kind === 'pc') {
        const p = byId(s.pcs, sel.id);
        const ev = (s.activeIssues || []).find((e) => e.pcId === sel.id || e.partnerPcId === sel.id);
        const occupant = p && byId(s.customers, p.customerId);
        if (p?.fault && p.status === 'fault') title = `${FAULTS[p.fault].icon} PC ${pad2(p.id)} · ${FAULTS[p.fault].label}`;
        else if (p?.issue && ev) { title = `${PC_ISSUE_ICON[ev.type]} PC ${pad2(p.id)} · ${ISSUES[ev.type].title}`; timerId = `pc${p.id}`; timer = ev.time; hint = ISSUES[ev.type].hint; }
        else if (p?.lingerTime > 0) title = `🌙 PC ${pad2(p.id)} · Pelanggan lepak`;
        else title = `🖥️ PC ${pad2(p.id)}`;
        if (p) {
          showEmpty = true; // a plain tap on a PC still tells you how it is doing
          infoSig = [p.status, p.fault, p.issue, p.customerId, Math.floor(p.health / 5), p.lingerTime > 0 ? 1 : 0, ev?.cctvHint, p.job?.type].join('');
          info = `<p class="wm-info">Keadaan <b>${Math.round(p.health)}%</b> · Tier ${p.tier}${occupant ? ` · ${safe(occupant.emoji)} ${safe(occupant.name)}` : ''}</p>`;
          if (p.fault && p.status === 'fault' && p.fault === 'hardware') info += '<p class="wm-info warn">Hardware rosak — perlu repair!</p>';
          if (ev?.type === 'suspicious' && ev.cctvHint != null) info += `<p class="wm-info cctv ${ev.cctvHint ? 'sus' : 'ok'}">📷 CCTV: ${ev.cctvHint ? 'gerak-geri nampak tak kena' : 'nampak biasa-biasa saja'} <small>(tak 100% tepat)</small></p>`;
          if (!p.fault && !p.issue && !(p.lingerTime > 0)) {
            if (occupant) info += `<p class="wm-info">Sedang main · <b data-evtimer="play${p.id}">${Math.ceil(Math.max(0, p.occupiedSeconds))}</b>s lagi.</p>`;
            else if (p.status === 'job') info += `<p class="wm-info">🔧 ${safe(p.job?.type || 'kerja')} sedang berjalan…</p>`;
            else if (p.status === 'free') info += '<p class="wm-info">Kosong. Tap pelanggan, pilih minit, kemudian tap PC ini.</p>';
          }
        }
      } else {
        const ev = State.eventById(s, sel.id);
        if (ev) { title = `${EVENTS[ev.type].emoji} ${EVENTS[ev.type].title}`; timerId = String(ev.id); timer = ev.time; hint = EVENTS[ev.type].say; }
      }
    }
    if (ns.Layout?.current() === 'phone') opts = opts.map((o) => (o.sub ? { ...o, sub: o.sub.replace(/ · tekan [A-Z0-9]/, '') } : o)); // no keyboard on a phone
    const key = menuKey(sel);
    const show = (opts.length > 0 || (showEmpty && title && UI.menuTapped === key)) && UI.menuDismissed !== key;
    if (!show) {
      if (!el.hidden) { el.hidden = true; menuSig = ''; }
      UI.menuTarget = null;
      return;
    }
    const sig = key + '|' + opts.map((o) => o.act + (o.choice || '') + (o.disabled ? '!' : '')).join(',') + '|' + infoSig;
    if (force || sig !== menuSig) {
      menuSig = sig;
      const id = sel.id;
      el.innerHTML = `<div class="wm-head"><b>${safe(title)}${timerId ? ` · <em data-evtimer="${timerId}">${Math.ceil(timer)}</em>s` : ''}</b><button type="button" class="wm-x" data-close aria-label="Tutup menu">✕</button></div>${hint ? `<div class="wm-hint">${safe(hint)}</div>` : ''}${info}${opts.length ? `<div class="wm-actions ${mode}">${opts.map((o) => btn(o, id)).join('')}</div>` : ''}`;
    }
    el.hidden = false;
    UI.menuTarget = { kind: sel.kind, id: sel.id };
    UI.placeWorldMenu(); // put it in the right place at once — don't wait for the next rendered frame
  };

  /** Short coaching line shown at the bottom of the world. */
  UI.hint = function hint() {
    const s = UI.s;
    if (!UI.settings.hints || s.phase !== 'active') return null;
    const waiting = State.inQueue(s).filter((c) => c.status === 'waiting');
    if (s.pendingCustomerId) return s.pendingDuration ? ['3', 'Tap PC kosong yang berkelip hijau'] : ['2', ns.Layout?.current() === 'phone' ? 'Pilih tempoh sewaan' : 'Pilih tempoh sewaan (1 / 2 / 3)'];
    if ((s.worldEvents || []).length) return ['!', 'Ada kejadian — tap benda yang berdenyut dalam bilik'];
    if ((s.activeIssues || []).length) return ['!', 'Tap PC yang bertanda ❗ sebelum masa tamat!'];
    if (s.pcs.some((p) => p.status === 'fault')) return ['!', 'PC rosak! Tap PC → pilih cara baiki'];
    if (waiting.length) return ['1', 'Tap pelanggan yang sedang menunggu'];
    return ['☕', 'Menunggu pelanggan datang…'];
  };
})(window.ABCC);
