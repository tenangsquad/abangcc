/* ==========================================================================
   4e. WORLD LABELS — PC identifiers, problem indicators, patience bubbles, event tags
   --------------------------------------------------------------------------
   DOM labels glued to 3D positions (projected by the scene). They never take clicks —
   all picking is done by the ray caster — so they can't steal or double a tap.
   Also builds the simple clickable board used when WebGL is unavailable.
   ========================================================================== */
(function (ns) {
  'use strict';

  const { FAULTS, EVENTS, TYPES, byId, clamp } = ns;
  const UI = ns.UI;
  const { $, safe, pad2, setText } = UI;
  const State = ns.State;

  const pcChips = new Map();
  const personTags = new Map();
  const eventTags = new Map();
  const PC_STATE = { free: 'KOSONG', reserved: 'TEMPAH', busy: 'ONLINE', fault: 'ROSAK', job: 'KERJA' };

  function pcChip(id) {
    let el = pcChips.get(id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'pc-chip';
      el.innerHTML = `<div class="bubble"></div><div class="tag"><span class="dot"></span><b>PC ${pad2(id)}</b><span class="state"></span></div><div class="prog"><i></i></div>`;
      $('labels').appendChild(el);
      pcChips.set(id, el);
    }
    return el;
  }
  function personTag(a) {
    let el = personTags.get(a.id);
    if (!el) {
      el = document.createElement('div');
      el.className = `person-tag ${a.kind === 'player' ? 'abang' : a.kind}`;
      el.innerHTML = '<div class="bub"><span class="ring"><span></span></span><b></b></div>';
      $('labels').appendChild(el);
      personTags.set(a.id, el);
    }
    return el;
  }
  function eventTag(a) {
    let el = eventTags.get(a.id);
    if (!el) {
      const def = EVENTS[a.type];
      el = document.createElement('div');
      el.className = `event-tag ${a.type}`;
      el.innerHTML = `<div class="bub"><span class="ring"><span>${safe(def.emoji)}</span></span><b>${safe(def.title)}</b></div><div class="tip">TAP</div>`;
      $('labels').appendChild(el);
      eventTags.set(a.id, el);
    }
    return el;
  }

  UI.updateLabels = function updateLabels() {
    const gfx = UI.gfx;
    if (!gfx) return;
    const s = UI.s;
    const anchors = gfx.anchors();
    const seen = new Set();
    for (const a of anchors.pcs) {
      const p = byId(s.pcs, a.id);
      if (!p || a.x == null) continue;
      seen.add(a.id);
      const el = pcChip(a.id);
      el.style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px) translate(-50%, -100%)`;
      const faulted = !!p.fault && p.status === 'fault';
      const bad = faulted || !!p.issue;
      const issueEv = (s.activeIssues || []).find((e) => e.pcId === p.id || e.partnerPcId === p.id);
      const label = p.issue ? 'ALERT' : faulted ? FAULTS[p.fault].short : p.lingerTime > 0 ? 'LEPAK' : PC_STATE[p.status] || 'KOSONG';
      const bubble = p.issue ? UI.PC_ISSUE_ICON[p.issue] : faulted ? FAULTS[p.fault].icon : p.status === 'job' ? '🔧' : p.lingerTime > 0 ? '🌙' : '';
      const sel = s.selected?.kind === 'pc' && s.selected.id === p.id ? 'sel' : '';
      const cctv = issueEv?.type === 'suspicious' && issueEv.cctvHint != null ? (issueEv.cctvHint ? 'cctv-sus' : 'cctv-ok') : '';
      const cls = `pc-chip ${sel} ${bad ? 'is-bad' : ''} ${p.status === 'busy' ? 'is-busy' : ''} ${p.status === 'job' ? 'is-job' : ''} ${bubble ? 'bubble-on' : ''} ${cctv}`;
      if (el.className !== cls) el.className = cls;
      setText(el.querySelector('.state'), label);
      setText(el.querySelector('.bubble'), bubble + (cctv ? '📷' : ''));
      const prog = el.querySelector('.prog');
      let pct = -1;
      if (p.status === 'busy' && p.rentalSeconds > 0 && !(p.lingerTime > 0)) pct = clamp(p.occupiedSeconds / p.rentalSeconds, 0, 1);
      else if (p.status === 'job' && p.job) pct = 1 - clamp(p.job.remaining / Math.max(0.1, p.job.total), 0, 1);
      prog.style.display = pct < 0 ? 'none' : '';
      if (pct >= 0) prog.firstElementChild.style.width = (pct * 100).toFixed(0) + '%';
    }
    for (const [id, el] of pcChips) if (!seen.has(id)) { el.remove(); pcChips.delete(id); }

    const seenPeople = new Set();
    for (const a of anchors.people) {
      const c = a.kind === 'player' ? null : byId(s.customers, a.id);
      if (a.kind === 'customer' && !c) continue;
      if (c && (c.status === 'event' || (c.status === 'officer' && a.eventId == null && (s.worldEvents || []).some((e) => e.type === 'raid')))) continue; // the event tag labels them
      seenPeople.add(a.id);
      const el = personTag(a);
      el.style.transform = `translate(${a.x.toFixed(1)}px, ${(a.y - 6).toFixed(1)}px) translate(-50%, -100%)`;
      const ring = el.querySelector('.ring'), icon = ring.firstElementChild, label = el.querySelector('b');
      let show = true, emoji = '', text = '', pct = -1, color = '';
      if (a.kind === 'player') {
        emoji = s.player.working ? '🔧' : '😎';
        text = 'ABANG';
      } else if (a.kind === 'officer') {
        emoji = '👮';
        text = 'PEGAWAI';
      } else if (c.status === 'waiting' || c.status === 'arriving') {
        const type = TYPES.find((t) => t.id === c.type);
        emoji = type?.emoji || '🙂';
        pct = State.patiencePct(c);
        color = pct < 30 ? 'var(--coral)' : pct < 60 ? 'var(--yellow-d)' : 'var(--mint)';
        text = s.pendingCustomerId === c.id ? '👆 ' + (s.pendingDuration || c.requestedMinutes) + 'm' : '';
      } else if (c.act === 'argue') emoji = '💢';
      else if (c.act === 'annoyed') emoji = '😒';
      else if (c.act === 'startled') emoji = '😱';
      else if (c.act === 'cheer') emoji = '🔊';
      else show = false;
      el.style.display = show ? '' : 'none';
      if (!show) continue;
      setText(icon, emoji);
      setText(label, text);
      label.style.display = text ? '' : 'none';
      ring.style.setProperty('--p', pct < 0 ? 100 : pct.toFixed(0));
      ring.style.setProperty('--c', color || 'transparent');
      el.classList.toggle('low', pct >= 0 && pct < 25);
    }
    for (const [id, el] of personTags) if (!seenPeople.has(id)) { el.remove(); personTags.delete(id); }

    const seenEvents = new Set();
    for (const a of anchors.events) {
      seenEvents.add(a.id);
      const el = eventTag(a);
      el.style.transform = `translate(${a.x.toFixed(1)}px, ${(a.y - 4).toFixed(1)}px) translate(-50%, -100%)`;
      el.querySelector('.ring').style.setProperty('--p', clamp((a.time / a.total) * 100, 0, 100).toFixed(0));
      el.classList.toggle('sel', s.selected?.kind === 'event' && s.selected.id === a.id);
      el.classList.toggle('urgent', a.time / a.total < 0.35);
    }
    for (const [id, el] of eventTags) if (!seenEvents.has(id)) { el.remove(); eventTags.delete(id); }

    UI.placeWorldMenu(anchors);
  };


  /** The action menu floats over whatever is selected, kept inside the scene. Called every frame and the moment it opens. */
  UI.placeWorldMenu = function placeWorldMenu(anchors = UI.gfx?.anchors()) {
    const menu = $('worldMenu');
    if (!anchors || menu.hidden || !UI.menuTarget) return;
    const t = UI.menuTarget;
    const a = t.kind === 'pc' ? anchors.pcs.find((p) => p.id === t.id) : t.kind === 'customer' ? anchors.people.find((p) => p.kind === 'customer' && p.id === t.id) : anchors.events.find((e) => e.id === t.id);
    if (!a || a.x == null) return;
    const vpW = $('viewport').clientWidth, vpH = $('viewport').clientHeight, w = menu.offsetWidth, h = menu.offsetHeight;
    const pad = 6, isPc = t.kind === 'pc';
    // what must stay uncovered: the PC / person / object itself (with its label and problem bubble)
    const keep = isPc ? { x: a.x - 78, y: a.y - 54, w: 156, h: 150 } : t.kind === 'customer' ? { x: a.x - 44, y: a.y - 52, w: 88, h: Math.max(120, (a.by - a.y) * 2 + 60) } : { x: a.x - 60, y: a.y - 20, w: 120, h: 110 };
    const hits = (r) => r.x < keep.x + keep.w && r.x + r.w > keep.x && r.y < keep.y + keep.h && r.y + r.h > keep.y;
    const inside = (r) => r.x >= pad && r.y >= pad && r.x + r.w <= vpW - pad && r.y + r.h <= vpH - pad;
    const spots = [
      { x: a.x - w / 2, y: keep.y - h - 4 }, // above
      { x: keep.x - w - 6, y: a.y - 10 }, // left of it
      { x: keep.x + keep.w + 6, y: a.y - 10 }, // right of it
      { x: a.x - w / 2, y: keep.y + keep.h + 4 }, // below
    ].map((s) => ({ ...s, w, h }));
    let spot = spots.find((r) => inside(r) && !hits(r));
    if (!spot) {
      // squeeze the best candidate into the scene
      spot = spots.find((r) => !hits({ ...r, x: clamp(r.x, pad, vpW - w - pad), y: clamp(r.y, pad, vpH - h - pad) })) || spots[0];
    }
    menu.style.setProperty('--mx', clamp(spot.x, pad, Math.max(pad, vpW - w - pad)).toFixed(0) + 'px');
    menu.style.setProperty('--my', clamp(spot.y, pad, Math.max(pad, vpH - h - pad)).toFixed(0) + 'px');
  };

  /* ----------------------------------------------- no-WebGL fallback board */
  let boardKey = '';
  UI.updateFallbackBoard = function updateFallbackBoard() {
    const s = UI.s;
    const key = s.pcs.map((p) => `${p.id}${p.status}${p.fault || ''}${p.issue || ''}`).join() + (s.worldEvents || []).map((e) => e.id).join() + s.selected?.id + s.selected?.kind;
    if (key === boardKey) return;
    boardKey = key;
    const pcBtns = s.pcs.map((p) => {
      const icon = p.issue ? UI.PC_ISSUE_ICON[p.issue] : p.fault ? FAULTS[p.fault].icon : p.status === 'busy' ? '🎮' : '🖥️';
      const sel = s.selected?.kind === 'pc' && s.selected.id === p.id ? 'sel' : '';
      return `<button type="button" class="fb-pc ${sel} ${p.fault || p.issue ? 'bad' : ''}" data-kind="pc" data-id="${p.id}"><span>${icon}</span><b>PC ${pad2(p.id)}</b><small>${p.issue ? 'ALERT' : p.fault ? FAULTS[p.fault].short : PC_STATE[p.status]}</small></button>`;
    });
    const evBtns = (s.worldEvents || []).map((e) => `<button type="button" class="fb-pc bad" data-kind="event" data-id="${e.id}"><span>${EVENTS[e.type].emoji}</span><b>${safe(EVENTS[e.type].title)}</b><small>${Math.ceil(e.time)}s</small></button>`);
    $('fallbackBoard').innerHTML = pcBtns.concat(evBtns).join('');
  };
})(window.ABCC);
