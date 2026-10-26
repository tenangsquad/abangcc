/* ==========================================================================
   4c. HUD — cash, daily target, sales breakdown, clock, vitals, ticker
   ========================================================================== */
(function (ns) {
  'use strict';

  const { CFG, clamp, fmtMoney, clock, dayPart } = ns;
  const UI = ns.UI;
  const { $, pad2, setText } = UI;
  const State = ns.State;

  let lastCash = null;
  let breakdownOpen = false;

  /** Sales breakdown popover (click / Enter on the target bar). */
  function renderBreakdown(s, earned, target) {
    const b = State.breakdown(s);
    // Refund and belanja rows only appear once something was actually refunded / spent.
    const days = State.daysToBills(s);
    const billNote = State.isBillDay(s)
      ? `Sewa &amp; bil bulanan (${fmtMoney(State.monthlyBills(s).total)}) dibayar hujung shift ini.`
      : `Sewa &amp; bil dibayar sebulan sekali — ${days} hari lagi (hujung Hari ${s.day + days - 1}).`;
    $('goalBreakdown').innerHTML = `
      <div class="bd-row"><span>🎮 Jualan sewa</span><b>${fmtMoney(b.rental)}</b></div>
      <div class="bd-row"><span>🥤 Jualan lain</span><b>${fmtMoney(b.other)}</b></div>
      ${b.refunds ? `<div class="bd-row neg"><span>↩️ Refund</span><b>−${fmtMoney(-b.refunds)}</b></div>` : ''}
      <div class="bd-row total"><span>✅ Jualan bersih (sasaran)</span><b>${fmtMoney(earned)}</b></div>
      ${b.expenses ? `<div class="bd-row neg"><span>🧾 Belanja hari ini</span><b>−${fmtMoney(b.expenses)}</b></div>` : ''}
      <div class="bd-foot">${billNote} Bil &amp; belanja bukan jualan.</div>`;
  }

  UI.setBreakdown = (open) => {
    breakdownOpen = open;
    $('goalBreakdown').hidden = !open;
    $('goalPill').setAttribute('aria-expanded', String(open));
    if (open) renderBreakdown(UI.s, State.shiftTakings(UI.s), State.calcRevenueGoal(UI.s, UI.s.day));
  };

  UI.refreshHud = function refreshHud() {
    const s = UI.s;
    // money & target
    setText($('hudCash'), fmtMoney(s.cash));
    const earned = State.shiftTakings(s);
    const target = State.calcRevenueGoal(s, s.day);
    const pct = target > 0 ? Math.round((earned / target) * 100) : 100;
    setText($('revenueNow'), fmtMoney(earned));
    setText($('revenueGoal'), fmtMoney(target));
    setText($('revenuePct'), pct + '%');
    $('goalFill').style.width = clamp(pct, 0, 100) + '%';
    $('goalMeter').setAttribute('aria-valuenow', String(clamp(pct, 0, 100)));
    setText($('goalRemaining'), earned >= target ? '🎉 Target capai!' : `Baki ${fmtMoney(target - earned)}`);
    $('goalPill').classList.toggle('goal-done', earned >= target);
    if (breakdownOpen) renderBreakdown(s, earned, target);
    if (lastCash !== null && s.phase === 'active' && s.cash > lastCash) {
      const delta = $('cashDelta');
      delta.textContent = '+' + fmtMoney(s.cash - lastCash);
      delta.classList.remove('pop');
      $('cashPill').classList.remove('flash');
      void delta.offsetWidth;
      delta.classList.add('pop');
      $('cashPill').classList.add('flash');
    }
    lastCash = s.cash;

    // clock: day, part of the day, time
    const running = s.phase === 'active' || s.phase === 'paused';
    const minutes = running ? CFG.DAY_START_MINUTES + s.elapsed * CFG.GAME_MINUTE_RATE : s.phase === 'result' ? 24 * 60 : CFG.DAY_START_MINUTES;
    const part = dayPart(minutes);
    setText($('hudDay'), `Hari ${s.day} · ${part.label}`);
    setText($('hudTime'), clock(minutes));
    setText($('hudSky'), part.emoji);

    // vitals
    const vit = (k, v) => {
      setText($('hud' + k + 'Value'), String(Math.round(v)));
      $('hud' + k + 'Bar').style.width = clamp(v, 0, 100) + '%';
    };
    vit('Rep', s.rep);
    const tier = State.tierOf(s);
    setText($('hudRepLabel'), `${tier.emoji} ${tier.name}`);
    $('hudRepMeter').title = `Reputasi: pelanggan datang lebih ramai bila tinggi. ${tier.name}: ${tier.perks}`;
    vit('Pro', s.professionalism);
    vit('Compliance', s.compliance);
    setText($('hudRisk'), String(Math.round(s.risk)));
    $('hudRiskBar').style.width = clamp(s.risk, 0, 100) + '%';
    setText($('comboText'), `⚡ x${s.combo || 0}`);

    // world chips
    const phase = $('worldPhase');
    phase.classList.toggle('peak', s.phase === 'active' && !!s.peakActive);
    const school = s.phase === 'active' && ns.S.hourNow(s) < CFG.SCHOOL_HOURS_END && s.day >= 2;
    setText(phase, s.phase === 'active' ? (s.peakActive ? `🔥 PEAK HOUR · ${State.peakLabel(s)}` : school ? '🏫 Waktu sekolah' : `🎯 Target ${fmtMoney(target)}`) : s.phase === 'paused' ? '⏸ DIJEDA' : `🛠 Persediaan · Hari ${s.day}`);
    const left = Math.max(0, CFG.SHIFT - s.elapsed);
    const countdown = $('worldCountdown');
    setText(countdown, `⏱ ${pad2(Math.floor(left / 60))}:${pad2(Math.floor(left % 60))}`);
    countdown.classList.toggle('low', s.phase === 'active' && left < 15);
    const pauseBtn = $('pauseBtn');
    setText(pauseBtn, s.phase === 'paused' ? '▶' : 'Ⅱ');
    pauseBtn.classList.toggle('pausing', s.phase === 'paused');

    // CC NEWS ticker: the latest important message
    setText($('tickerText'), s.activeTask ? `🔧 Abang tengah urus ${s.activeTask.kind.toUpperCase()}… ${s.commands.length} arahan menunggu` : s.logs[0]?.msg || 'Takde drama buat masa ni.');
    document.getElementById('app').dataset.phase = s.phase;
  };

  // click / keyboard on the target bar toggles the breakdown
  $('goalPill').addEventListener('click', () => UI.setBreakdown(!breakdownOpen));
  $('goalPill').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') UI.setBreakdown(!breakdownOpen);
  });
  document.addEventListener('pointerdown', (e) => {
    if (breakdownOpen && !e.target.closest('#goalPill')) UI.setBreakdown(false);
  });
})(window.ABCC);
