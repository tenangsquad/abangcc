/* ==========================================================================
   4d. SIDEBAR PANELS — Situasi Panas, Pelanggan Menunggu, Abang's Desk
   --------------------------------------------------------------------------
   Situasi Panas is an ALERT list: it says what is wrong and where, and a tap on a card
   selects that thing in the room. It never holds the resolution buttons — those live in
   Abang's Desk, next to the object you selected.
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

  /* --------------------------------------------------------------- Abang's Desk */
  function btn(o, targetId, extra = '') {
    return `<button type="button" class="btn ${o.css || ''} ${o.sub ? 'stack' : ''}" ${o.disabled ? 'disabled' : ''} data-act="${o.act}" data-id="${targetId}" ${o.choice ? `data-choice="${o.choice}"` : ''} ${extra}>${safe(o.label)}${o.sub ? `<small>${safe(o.sub)}</small>` : ''}</button>`;
  }
  const patienceBar = (c) => {
    const pct = State.patiencePct(c);
    return `<div class="patience ${pct < 30 ? 'low' : pct < 60 ? 'mid' : ''}" data-patience="${c.id}" aria-label="Kesabaran ${Math.round(pct)}%"><i style="width:${pct}%"></i></div>`;
  };

  /** Signature of everything that changes what the desk shows — re-render only when it changes. */
  function deskSignature(s) {
    const sel = s.selected;
    const opts = sel?.kind === 'customer' ? '' : State.options(s, sel).map((o) => o.act + (o.choice || '') + (o.disabled ? '!' : '')).join(',');
    const p = sel?.kind === 'pc' ? byId(s.pcs, sel.id) : null;
    const ev = p ? (s.activeIssues || []).find((e) => e.pcId === p.id || e.partnerPcId === p.id) : null;
    return [s.phase, sel?.kind, sel?.id, s.pendingCustomerId, s.pendingDuration, opts, p && [p.status, p.fault, p.issue, p.customerId, Math.floor(p.health / 5), p.lingerTime > 0 ? 1 : 0].join(''), ev && ev.searched ? 's' : '', ev && ev.cctvHint != null ? 'c' : '', State.pendingCount(s)].join('|');
  }

  UI.renderDesk = function renderDesk(force) {
    const s = UI.s;
    const sig = deskSignature(s);
    if (!force && sig === UI.deskSig) return;
    UI.deskSig = sig;

    const pend = s.pendingCustomerId ? byId(s.customers, s.pendingCustomerId) : null;
    const sel = s.selected;
    let html = '', durations = '', actions = '';

    if (pend && sel?.kind === 'customer' && ['waiting', 'arriving'].includes(pend.status)) {
      const wanted = pend.requestedMinutes;
      html = `<h2>${safe(pend.emoji)} ${safe(pend.name)}</h2><span class="says">“Bang, ${wanted} minit!”</span>
        ${patienceBar(pend)}
        <p>${s.pendingDuration ? `✅ ${s.pendingDuration} min dipilih. <b>Sekarang tap PC kosong</b> yang berkelip hijau.` : 'Pilih tempoh sewaan dahulu ↓ (★ = permintaan pelanggan)'}</p>`;
      durations = State.durationOptions(s, pend.id).map((d) => `<button type="button" class="btn stack ${d.chosen ? 'mint' : 'paper'} ${d.wanted ? 'wanted' : ''}" data-act="duration" data-id="${pend.id}" data-choice="${d.minutes}">${d.minutes} MIN<small>${fmtMoney(d.price)} · <kbd>${d.minutes / 30}</kbd>${d.wanted ? ' ★' : ''}</small></button>`).join('');
    } else if (sel?.kind === 'event' && State.eventById(s, sel.id)) {
      const ev = State.eventById(s, sel.id);
      const def = EVENTS[ev.type];
      html = `<h2>${safe(def.emoji)} ${safe(def.title)}</h2><span class="says">${safe(def.say)}</span>
        <p class="where">📍 ${safe(whereOf(s, ev))} · <b data-evtimer="${ev.id}">${Math.ceil(ev.time)}</b>s</p>`;
      html += '<p class="hint-line">👆 Pilihan ada pada menu di atas objek itu dalam bilik.</p>';
    } else {
      const p = byId(s.pcs, sel?.id || 1);
      if (!p) html = '<h2>Pilih PC, pelanggan atau kejadian</h2>';
      else {
        const occupant = byId(s.customers, p.customerId);
        const stateLabel = p.fault ? [FAULTS[p.fault].short, 'bad'] : p.issue ? ['MASALAH', 'bad'] : p.lingerTime > 0 ? ['LEPAK', 'busy'] : p.status === 'busy' ? ['MAIN', 'busy'] : p.status === 'job' ? ['KERJA', 'busy'] : ['SEDIA', ''];
        const ev = (s.activeIssues || []).find((e) => e.pcId === p.id || e.partnerPcId === p.id);
        html = `<h2>🖥️ PC ${pad2(p.id)}<span class="status-badge ${stateLabel[1]}">${stateLabel[0]}</span></h2>
          <p>Keadaan <b>${Math.round(p.health)}%</b> · Tier ${p.tier}${occupant ? ` · ${safe(occupant.emoji)} ${safe(occupant.name)}` : ''}</p>`;
        if (p.fault && p.status === 'fault') html += `<p class="warn">${FAULTS[p.fault].icon} ${FAULTS[p.fault].label}.${p.fault === 'hardware' ? ' Perlu repair!' : ' Pilih tindakan pada menu atas PC.'}</p>`;
        else if (p.issue && ev) {
          const info = ISSUES[ev.type];
          html += `<p class="warn">${safe(PC_ISSUE_ICON[ev.type])} <b>${safe(info.title)}</b> · <b data-evtimer="pc${p.id}">${Math.ceil(ev.time)}</b>s<br><span class="hint-line">${safe(info.hint)}</span></p>`;
          if (ev.type === 'suspicious' && ev.cctvHint != null) html += `<p class="cctv ${ev.cctvHint ? 'sus' : 'ok'}">📷 CCTV: ${ev.cctvHint ? 'gerak-geri nampak tak kena' : 'nampak biasa-biasa saja'} <small>(tak 100% tepat)</small></p>`;
        } else if (p.lingerTime > 0) html += `<p class="warn">🌙 ${safe(occupant?.name)} masih lepak. Sambung atau suruh balik?</p>`;
        else if (occupant) html += `<p>Sedang main · <b data-evtimer="play${p.id}">${Math.ceil(Math.max(0, p.occupiedSeconds))}</b>s lagi.</p>`;
        else if (p.status === 'job') html += `<p>🔧 ${safe(p.job?.type || 'kerja')} sedang berjalan…</p>`;
        else html += '<p>Tap pelanggan di queue, pilih minit, kemudian tap PC ini.</p>';
      }
    }
    const pending = State.pendingCount(s);
    $('taskCount').hidden = !pending;
    setText($('taskCount'), `${pending}/${CFG.MAX_COMMANDS}`);
    $('selectionPanel').innerHTML = html;
    $('durationButtons').innerHTML = durations;
    $('actionButtons').innerHTML = actions;
  };

  /** Live numbers in the desk (countdowns, patience bars) without rebuilding the buttons. */
  UI.tickDesk = function tickDesk() {
    const s = UI.s;
    for (const el of document.querySelectorAll('#selectionPanel [data-evtimer], #worldMenu [data-evtimer]')) {
      const id = el.dataset.evtimer;
      let v = null;
      if (id.startsWith('pc')) v = (s.activeIssues || []).find((e) => e.pcId === Number(id.slice(2)) || e.partnerPcId === Number(id.slice(2)))?.time;
      else if (id.startsWith('play')) v = byId(s.pcs, Number(id.slice(4)))?.occupiedSeconds;
      else v = State.eventById(s, Number(id))?.time;
      if (v != null) setText(el, String(Math.ceil(Math.max(0, v))));
    }
    for (const el of $('selectionPanel').querySelectorAll('[data-patience]')) {
      const c = byId(s.customers, Number(el.dataset.patience));
      if (!c) continue;
      const pct = State.patiencePct(c);
      el.firstElementChild.style.width = pct + '%';
      el.classList.toggle('low', pct < 30);
      el.classList.toggle('mid', pct >= 30 && pct < 60);
    }
  };

  /* ------------------------------------------------- the menu on the PC itself */
  UI.menuDismissed = null;
  UI.menuTarget = null;
  const menuKey = (sel) => (sel ? `${sel.kind}:${sel.id}` : null);
  let menuSig = '';

  /**
   * Actions live on the thing you clicked: tap a PC (or a door crowd / puddle / fuse box) and its choices
   * pop up right there in the room. The sidebar Desk only describes what you selected.
   */
  UI.renderWorldMenu = function renderWorldMenu(force) {
    const s = UI.s;
    const el = $('worldMenu');
    const sel = s.selected;
    let opts = [];
    let title = '', hint = '', timerId = null, timer = 0;
    if (s.phase === 'active' && (sel?.kind === 'pc' || sel?.kind === 'event')) {
      opts = State.options(s, sel);
      if (sel.kind === 'pc') {
        const p = byId(s.pcs, sel.id);
        const ev = (s.activeIssues || []).find((e) => e.pcId === sel.id || e.partnerPcId === sel.id);
        if (p?.fault && p.status === 'fault') title = `${FAULTS[p.fault].icon} PC ${pad2(p.id)} · ${FAULTS[p.fault].label}`;
        else if (p?.issue && ev) { title = `${PC_ISSUE_ICON[ev.type]} PC ${pad2(p.id)} · ${ISSUES[ev.type].title}`; timerId = `pc${p.id}`; timer = ev.time; hint = ISSUES[ev.type].hint; }
        else if (p?.lingerTime > 0) title = `🌙 PC ${pad2(p.id)} · Pelanggan lepak`;
        else title = `🖥️ PC ${pad2(p.id)}`;
      } else {
        const ev = State.eventById(s, sel.id);
        if (ev) { title = `${EVENTS[ev.type].emoji} ${EVENTS[ev.type].title}`; timerId = String(ev.id); timer = ev.time; hint = EVENTS[ev.type].say; }
      }
    }
    const key = menuKey(sel);
    const show = opts.length > 0 && UI.menuDismissed !== key;
    if (!show) {
      if (!el.hidden) { el.hidden = true; menuSig = ''; }
      UI.menuTarget = null;
      return;
    }
    const sig = key + '|' + opts.map((o) => o.act + (o.choice || '') + (o.disabled ? '!' : '')).join(',');
    if (force || sig !== menuSig) {
      menuSig = sig;
      const id = sel.kind === 'event' ? sel.id : sel.id;
      el.innerHTML = `<div class="wm-head"><b>${safe(title)}${timerId ? ` · <em data-evtimer="${timerId}">${Math.ceil(timer)}</em>s` : ''}</b><button type="button" class="wm-x" data-close aria-label="Tutup menu">✕</button></div>${hint ? `<div class="wm-hint">${safe(hint)}</div>` : ''}<div class="wm-actions">${opts.map((o) => btn(o, id)).join('')}</div>`;
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
    if (s.pendingCustomerId) return s.pendingDuration ? ['3', 'Tap PC kosong yang berkelip hijau'] : ['2', 'Pilih tempoh sewaan (1 / 2 / 3)'];
    if ((s.worldEvents || []).length) return ['!', 'Ada kejadian — tap benda yang berdenyut dalam bilik'];
    if ((s.activeIssues || []).length) return ['!', 'Tap PC yang bertanda ❗ sebelum masa tamat!'];
    if (s.pcs.some((p) => p.status === 'fault')) return ['!', 'PC rosak! Tap PC → pilih cara baiki'];
    if (waiting.length) return ['1', 'Tap pelanggan yang sedang menunggu'];
    return ['☕', 'Menunggu pelanggan datang…'];
  };
})(window.ABCC);
