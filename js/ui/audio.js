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
    generator: () => { tone(46, 0.5, 'sawtooth', 0.05, 0, 40); noise(0.15, 0.035, 260, 0.05); noise(0.15, 0.035, 260, 0.3); tone(62, 0.7, 'square', 0.02, 0.35, 10); }, // diesel generator coughing into life
    tier: () => [659, 784, 988, 1319, 1568].forEach((f, i) => tone(f, 0.16, 'triangle', 0.05, i * 0.09)), // the shop moved up a tier
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

  /* ------------------------------------------------------------------ ambience
     The sound of the café itself, under the music: room tone, the hum of the PCs, the fan or aircond, the street outside with a
     motorbike now and then, crickets at night and the diesel chug of the generator. Everything is looped noise or an oscillator
     whose volume is steered a few times a second from what is happening (see UI.Sound.ambience). It is very quiet on purpose. */
  const am = { nodes: null, bikeAt: 0, cricketAt: 0, on: false };

  function noiseLoop(c, seconds, brown) {
    const len = Math.floor(c.sampleRate * seconds), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = brown ? (last + 0.02 * w) / 1.02 : w;
      d[i] = brown ? last * 3.5 : w;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  }

  function buildAmbience() {
    const c = ensure();
    if (!c) return null;
    const out = c.createGain();
    out.gain.value = 0;
    out.connect(master);
    const layer = (source, filterType, freq, q = 0.7) => {
      const f = c.createBiquadFilter(), g = c.createGain();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      g.gain.value = 0;
      source.connect(f).connect(g).connect(out);
      source.start();
      return { f, g };
    };
    /** An oscillator whose volume pulses (cricket chirps, generator chug). */
    const pulsing = (type, freq, rate, shape, filterFreq) => {
      const osc = c.createOscillator(), lfo = c.createOscillator(), depth = c.createGain(), trem = c.createGain(), level = c.createGain();
      osc.type = type; osc.frequency.value = freq;
      lfo.type = shape; lfo.frequency.value = rate;
      depth.gain.value = 0.5; trem.gain.value = 0.5; level.gain.value = 0;
      lfo.connect(depth).connect(trem.gain);
      let head = osc;
      if (filterFreq) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq; osc.connect(f); head = f; }
      head.connect(trem).connect(level).connect(out);
      osc.start(); lfo.start();
      return { g: level };
    };
    const hum = c.createOscillator(); // PC fans: a low mains-ish drone
    hum.type = 'sawtooth'; hum.frequency.value = 96;
    const humF = c.createBiquadFilter(), humG = c.createGain();
    humF.type = 'lowpass'; humF.frequency.value = 240; humG.gain.value = 0;
    hum.connect(humF).connect(humG).connect(out);
    hum.start();
    const buzz = c.createOscillator(); // fluorescent tubes: a thin 100 Hz buzz (mains frequency doubled), only when the lights are on
    buzz.type = 'sawtooth'; buzz.frequency.value = 100;
    const buzzF = c.createBiquadFilter(), buzzG = c.createGain();
    buzzF.type = 'bandpass'; buzzF.frequency.value = 420; buzzF.Q.value = 1.4; buzzG.gain.value = 0;
    buzz.connect(buzzF).connect(buzzG).connect(out);
    buzz.start();
    const brown = noiseLoop(c, 4, true), brown2 = noiseLoop(c, 5, true), white = noiseLoop(c, 3, false), white2 = noiseLoop(c, 3, false);
    return {
      out,
      room: layer(brown, 'lowpass', 380),
      street: layer(brown2, 'lowpass', 230),
      whoosh: layer(white, 'bandpass', 1700, 0.6), // PC fans' air
      cool: layer(white2, 'bandpass', 1200, 0.5), // ceiling fan / aircond
      hum: { g: humG },
      buzz: { g: buzzG },
      chug: pulsing('sawtooth', 52, 7.5, 'sine', 210),
    };
  }

  /**
   * One cricket "phrase": two to four soft little chirps, then silence. A steady on/off pulse (which this used to be) sounds like a
   * machine, so the pitch, the number of chirps and the pause before the next phrase are all a bit random.
   */
  function chirp(level) {
    const c = ctx;
    if (!c || !am.nodes) return;
    const t0 = c.currentTime + 0.02;
    const base = 3700 + Math.random() * 900;
    const pulses = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < pulses; i++) {
      const t = t0 + i * (0.075 + Math.random() * 0.03);
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.linearRampToValueAtTime(base * 1.04, t + 0.05);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(level, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
      osc.connect(g).connect(am.nodes.out);
      osc.start(t);
      osc.stop(t + 0.07);
    }
  }

  /** A motorbike passing the shop: a rising and falling engine note that sweeps across the stereo field. */
  function motorbike() {
    const c = ctx;
    if (!c || !am.nodes) return;
    const t = c.currentTime, dur = 3.4, dir = Math.random() < 0.5 ? -1 : 1;
    const osc = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(68, t);
    osc.frequency.linearRampToValueAtTime(138, t + dur * 0.45);
    osc.frequency.linearRampToValueAtTime(62, t + dur);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(260, t);
    f.frequency.linearRampToValueAtTime(950, t + dur * 0.45);
    f.frequency.linearRampToValueAtTime(220, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.014, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f).connect(g);
    let tail = g;
    if (c.createStereoPanner) {
      const pan = c.createStereoPanner();
      pan.pan.setValueAtTime(-0.8 * dir, t);
      pan.pan.linearRampToValueAtTime(0.8 * dir, t + dur);
      g.connect(pan);
      tail = pan;
    }
    tail.connect(am.nodes.out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function ambienceSet(n, want) {
    const c = ctx, t = c.currentTime;
    const to = (layer, v, k = 0.6) => layer.g.gain.setTargetAtTime(v, t, k);
    const dark = !want.power; // blackout: the PCs and the fan/aircond stop; the room and the street carry on
    const night = want.part === 'night';
    to(n.room, 0.02);
    to(n.street, night ? 0.007 : 0.014);
    to(n.hum, dark ? 0 : Math.min(1, want.busy / 8) * 0.016 + (want.busy ? 0.004 : 0), 0.4);
    to(n.whoosh, dark ? 0 : Math.min(1, want.busy / 8) * 0.004);
    to(n.buzz, dark ? 0 : night ? 0.0028 : want.part === 'dusk' ? 0.0014 : 0, 1.2); // tubes buzz from dusk, never in a blackout
    const level = want.cool;
    n.cool.f.frequency.setTargetAtTime(level === 1 ? 1400 : level === 2 ? 900 : 650, t, 0.5); // a fan whooshes, an aircond rumbles lower
    to(n.cool, dark || !level ? 0 : [0, 0.007, 0.011, 0.012][level]);
    to(n.chug, want.generator ? 0.04 : 0, 0.3);
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
    ambiencePlaying: () => am.on,
    /**
     * Called a few times a second while a shift runs with { busy, cool, part, power, generator }; anything falsy fades the café
     * out again (menus, pause, reports). Respects the Sound and Suasana settings and needs a prior tap like the music does.
     */
    ambience(want) {
      const on = !!want && UI.settings.sound && UI.settings.ambience !== false && mu.userGesture;
      if (!on) {
        if (am.on && am.nodes && ctx) am.nodes.out.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
        am.on = false;
        return;
      }
      if (!am.nodes) am.nodes = buildAmbience();
      if (!am.nodes) return;
      if (!am.on) {
        am.on = true;
        am.bikeAt = performance.now() + 6000 + Math.random() * 8000;
      }
      am.nodes.out.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
      ambienceSet(am.nodes, want);
      const cricketLevel = want.part === 'night' ? 0.004 : want.part === 'dusk' ? 0.002 : 0;
      if (cricketLevel && performance.now() > am.cricketAt) {
        chirp(cricketLevel);
        am.cricketAt = performance.now() + 900 + Math.random() * 3200; // a phrase, then a pause
      }
      if (performance.now() > am.bikeAt) {
        am.bikeAt = performance.now() + 14000 + Math.random() * 18000;
        if (want.part !== 'night' || Math.random() < 0.5) motorbike();
      }
    },
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
