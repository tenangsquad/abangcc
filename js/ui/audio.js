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
    warn: () => { tone(760, 0.09, 'triangle', 0.045); tone(540, 0.16, 'triangle', 0.045, 0.1); }, // a customer is about to lose patience
    goal: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.16, 'square', 0.028, i * 0.08)); [523, 659, 784].forEach((f) => tone(f, 0.5, 'triangle', 0.04, 0.34)); }, // today's target reached
  };

  /* ------------------------------------------------------------------ music
     A tiny generative chiptune loop: bass, a plucked arpeggio, an occasional melody note and soft hi-hats over a
     four-chord progression. It is bright by day (C major), slower and moodier at night (A minor) and a bit faster
     and busier during peak hour. Quiet on purpose; it has its own switch in Settings, and the ♫ button mutes everything. */
  const MOODS = {
    day: { bpm: 108, base: 60, prog: [[0, 'M'], [-3, 'm'], [-7, 'M'], [-5, 'M']], scale: [0, 2, 4, 7, 9] },
    night: { bpm: 90, base: 57, prog: [[0, 'm'], [-4, 'M'], [-9, 'M'], [-2, 'M']], scale: [0, 3, 5, 7, 10] },
  };
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const rnd = (n) => Math.abs(Math.sin(n * 91.345 + 7.1) * 43758.5453) % 1; // deterministic: the loop always sounds the same
  const mu = { timer: 0, next: 0, step: 0, mood: 'day', peak: false, gain: null, on: false, userGesture: false };

  function musicStep(step, t) {
    const m = MOODS[mu.mood];
    const bar = Math.floor(step / 8) % 4, pos = step % 8;
    const [r, q] = m.prog[bar];
    const root = m.base + r;
    const c = ensure();
    const note = (n, dur, type, vol, when = t) => {
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = type;
      osc.frequency.value = midi(n);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(g).connect(mu.gain);
      osc.start(when);
      osc.stop(when + dur + 0.03);
    };
    if (pos === 0 || pos === 4) note(root - 12, 0.34, 'triangle', 0.075); // bass
    const tones = [0, q === 'M' ? 4 : 3, 7, 12];
    const idx = [0, 2, 1, 3, 0, 2, 3, 1][pos];
    if (rnd(step) > (mu.peak ? 0.12 : 0.34)) note(root + tones[idx] + 12, 0.16, 'square', 0.022); // arpeggio
    if ((pos === 0 || pos === 4) && rnd(step + 100) > 0.4) note(m.base + 12 + m.scale[Math.floor(rnd(step + 7) * 5)], 0.4, 'sine', 0.04); // melody
    if (pos % 2 === 1 || (mu.peak && pos % 2 === 0)) { // hi-hat
      const len = Math.floor(c.sampleRate * 0.025), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain();
      src.buffer = buf; hp.type = 'highpass'; hp.frequency.value = 6000; g.gain.value = 0.018;
      src.connect(hp).connect(g).connect(mu.gain);
      src.start(t);
    }
  }

  function musicTick() {
    const c = ctx;
    if (!c || !mu.on) return;
    const m = MOODS[mu.mood];
    const stepDur = 60 / (m.bpm + (mu.peak ? 16 : 0)) / 2;
    if (mu.next < c.currentTime) mu.next = c.currentTime + 0.05;
    while (mu.next < c.currentTime + 0.4) {
      musicStep(mu.step, mu.next);
      mu.next += stepDur;
      mu.step++;
    }
  }

  function musicStart() {
    const c = ensure();
    if (!c || mu.on) return;
    if (!mu.gain) {
      mu.gain = c.createGain();
      mu.gain.connect(master);
    }
    mu.gain.gain.cancelScheduledValues(c.currentTime);
    mu.gain.gain.setValueAtTime(mu.gain.gain.value, c.currentTime);
    mu.gain.gain.linearRampToValueAtTime(0.7, c.currentTime + 1.2);
    mu.on = true;
    mu.next = c.currentTime + 0.1;
    mu.timer = setInterval(musicTick, 100);
  }

  function musicStop() {
    if (!mu.on) return;
    mu.on = false;
    clearInterval(mu.timer);
    if (ctx && mu.gain) {
      mu.gain.gain.cancelScheduledValues(ctx.currentTime);
      mu.gain.gain.setValueAtTime(mu.gain.gain.value, ctx.currentTime);
      mu.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
    }
  }

  let typingClock = 0;
  UI.Sound = {
    play(name) {
      if (UI.settings.sound && effects[name]) effects[name]();
    },
    unlock() {
      mu.userGesture = true;
      return ensure();
    },
    /**
     * Called a few times a second with what the game is doing: { night, peak } while a shift is running,
     * anything falsy otherwise (menus, pause, reports). Starts and stops the music loop; needs a prior tap
     * (browsers refuse audio before that) and respects the Sound and Music settings.
     */
    music(state) {
      const want = !!state && UI.settings.sound && UI.settings.music !== false && mu.userGesture;
      if (!want) return musicStop();
      const mood = state.night ? 'night' : 'day';
      if (mood !== mu.mood) {
        mu.mood = mood;
        mu.step = Math.ceil(mu.step / 32) * 32; // change key on a phrase boundary
      }
      mu.peak = !!state.peak;
      musicStart();
    },
    musicPlaying: () => mu.on,
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
