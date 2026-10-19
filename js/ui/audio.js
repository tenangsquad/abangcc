/* ==========================================================================
   4b. AUDIO — tiny synthesised effects, no audio files, always muteable
   --------------------------------------------------------------------------
   Every sound is generated with the Web Audio API (original, licence-free), kept quiet
   and short, and the repetitive ones (typing) are throttled so they never get annoying.
   ========================================================================== */
(function (ns) {
  'use strict';

  const UI = ns.UI;

  let ctx = null;
  let master = null;
  const ensure = () => {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.9;
        master.connect(ctx.destination);
      } catch {
        return null;
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };

  function tone(freq, dur = 0.1, type = 'sine', vol = 0.05, delay = 0, slide = 0) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator(), gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** A short burst of filtered noise (keyboard clack, CRT static). */
  function noise(dur = 0.03, vol = 0.02, freq = 2400, delay = 0) {
    const c = ensure();
    if (!c) return;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
    src.buffer = buf;
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(master);
    src.start(c.currentTime + delay);
  }

  const effects = {
    tap: () => tone(560, 0.06, 'triangle', 0.05),
    click: () => tone(700, 0.07, 'triangle', 0.045),
    coin: () => { tone(988, 0.08, 'square', 0.03); tone(1319, 0.16, 'square', 0.03, 0.07); },
    good: () => { tone(523, 0.1, 'triangle', 0.05); tone(659, 0.1, 'triangle', 0.05, 0.09); tone(784, 0.18, 'triangle', 0.05, 0.18); },
    bad: () => tone(260, 0.22, 'sawtooth', 0.04, 0, -140),
    error: () => { tone(330, 0.12, 'square', 0.035); tone(247, 0.2, 'square', 0.035, 0.13); noise(0.12, 0.02, 900, 0.02); }, // computer error
    alert: () => { tone(880, 0.1, 'square', 0.03); tone(660, 0.12, 'square', 0.03, 0.12); },
    siren: () => { for (let i = 0; i < 3; i++) { tone(740, 0.14, 'square', 0.028, i * 0.3); tone(540, 0.14, 'square', 0.028, i * 0.3 + 0.15); } }, // inspection alert
    bell: () => { tone(1568, 0.28, 'sine', 0.05); tone(2093, 0.4, 'sine', 0.035, 0.02); }, // customer arrival bell
    typing: () => { noise(0.018, 0.016, 2600); noise(0.016, 0.012, 3200, 0.07); },
    crt: () => { tone(60, 0.35, 'sine', 0.05, 0, 40); tone(320, 0.22, 'triangle', 0.02, 0.1, 500); noise(0.06, 0.02, 600, 0.02); }, // CRT startup thump + whine
    angry: () => { tone(150, 0.3, 'sawtooth', 0.04, 0, -50); tone(135, 0.3, 'sawtooth', 0.035, 0.05, -45); },
    powerdown: () => tone(520, 0.7, 'sawtooth', 0.04, 0, -440),
    powerup: () => { tone(180, 0.4, 'triangle', 0.045, 0, 520); noise(0.05, 0.02, 800, 0.35); },
    splash: () => noise(0.18, 0.03, 1200),
    peak: () => { tone(392, 0.12, 'triangle', 0.05); tone(523, 0.12, 'triangle', 0.05, 0.1); tone(659, 0.2, 'triangle', 0.05, 0.2); },
    perk: () => [523, 784, 988, 1319].forEach((f, i) => tone(f, 0.12, 'triangle', 0.045, i * 0.07)), // perk purchase
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.055, i * 0.11)), // successful shift
    lose: () => [392, 349, 294].forEach((f, i) => tone(f, 0.24, 'sawtooth', 0.035, i * 0.16)),
  };

  let typingClock = 0;
  UI.Sound = {
    play(name) {
      if (UI.settings.sound && effects[name]) effects[name]();
    },
    unlock: ensure,
    /** Called every frame: a soft, throttled keyboard patter while customers are playing. */
    ambient(dt, playingCount) {
      if (!UI.settings.sound || playingCount <= 0) return;
      typingClock -= dt;
      if (typingClock <= 0) {
        typingClock = 0.5 + Math.random() * 0.5 - Math.min(0.25, playingCount * 0.05);
        if (Math.random() < 0.6) effects.typing();
      }
    },
  };
})(window.ABCC);
