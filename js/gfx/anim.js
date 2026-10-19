/* ==========================================================================
   3d. ANIMATION STATE MACHINE — one explicit state per person
   --------------------------------------------------------------------------
   States:  IDLE · WALK · TURN · SIT · PLAY · TYPE · REACT · ANGRY · INSPECT · LEAVE
   The game state says WHAT is happening (status, act, issue); this module decides WHICH
   state that is and what the body does in it. Poses are targets that the renderer eases
   towards, so nothing ever snaps. REACT carries a named reaction (panic, startled,
   annoyed, cheer, hide, stuck, plead, sneak, lepak, greet) — family-friendly and readable.
   ========================================================================== */
(function (ns) {
  'use strict';

  const { clamp, shortestAngle } = ns;

  const STATES = ['IDLE', 'WALK', 'TURN', 'SIT', 'PLAY', 'TYPE', 'REACT', 'ANGRY', 'INSPECT', 'LEAVE'];

  /** Games that need quick reflexes get the hunched PLAY pose; everything else is TYPE. */
  const TYPES_THAT_PLAY = new Set(['fps', 'hot', 'arena', 'mmorpg', 'lepak', 'rm1']);

  /** Reactions that make a seated customer stop playing. */
  const SEATED_REACTS = new Set(['panic', 'startled', 'annoyed', 'hide', 'cheer', 'stuck', 'lepak']);
  const ACT_TO_REACT = { panic: 'panic', startled: 'startled', annoyed: 'annoyed', cheer: 'cheer', hide: 'hide', stuck: 'stuck', plead: 'plead', sneak: 'sneak', lepak: 'lepak', greet: 'greet' };

  /**
   * Decide the animation state.
   * @param e     the person record (status, act, sitBlend, moveIntensity, patience…)
   * @param kind  'player' | 'customer' | 'officer'
   * @param ctx   { s, turning, task }  — turning: stationary and rotating on the spot; task: Abang's active task kind
   */
  function stateOf(e, kind, ctx) {
    const moving = (e.moveIntensity || 0) > 0.05;
    const sit = e.sitBlend || 0;
    const act = e.act || null;

    if (kind === 'officer') {
      if (ctx.leaving) return { state: 'LEAVE' };
      if (moving) return { state: 'WALK' };
      if (act === 'inspect') return { state: 'INSPECT' };
      if (act === 'greet') return { state: 'REACT', react: 'greet' };
      return ctx.turning ? { state: 'TURN' } : { state: 'IDLE' };
    }
    if (kind === 'player') {
      if (moving) return { state: 'WALK' };
      if (e.working) {
        const t = ctx.task;
        return ['soft', 'harsh', 'warn', 'calm', 'eject', 'close', 'search', 'event'].includes(t) ? { state: 'INSPECT' } : { state: 'TYPE' };
      }
      return ctx.turning ? { state: 'TURN' } : { state: 'IDLE' };
    }

    // customers
    if (e.status === 'leaving') return { state: 'LEAVE', angry: (e.patience ?? 1) <= 0 };
    if (moving) return { state: 'WALK', gait: e.status === 'walkToPc' ? e.gait || 'walk' : 'walk' };
    if (act === 'argue') return { state: 'ANGRY' };
    if (sit > 0.05 && sit < 0.92 && e.status === 'playing') return { state: 'SIT' };
    if (sit >= 0.92 || (sit > 0.2 && e.status === 'playing')) {
      if (act && SEATED_REACTS.has(act)) return { state: 'REACT', react: ACT_TO_REACT[act] };
      return { state: TYPES_THAT_PLAY.has(e.type) ? 'PLAY' : 'TYPE' };
    }
    if (e.status === 'waiting') {
      const pct = ((e.patience ?? 0) / (e.patienceMax || 1)) * 100;
      if (act === 'startled') return { state: 'REACT', react: 'startled' };
      if (act === 'annoyed') return { state: 'REACT', react: 'annoyed' };
      if (pct < 35) return { state: 'ANGRY', mild: true };
    }
    if (act && ACT_TO_REACT[act]) return { state: 'REACT', react: ACT_TO_REACT[act] };
    return ctx.turning ? { state: 'TURN' } : { state: 'IDLE' };
  }

  const base = { fwdL: 0, fwdR: 0, outL: 0.1, outR: 0.1, bendL: 0.18, bendR: 0.18, inL: 0, inR: 0, lean: 0, headYaw: 0, headNod: 0, mood: 'happy', hop: 0, legs: 'stand', legAmp: 1, kneeAmp: 1, mouth: 0 };

  /**
   * Target pose for a state. Angles are radians (see drawPerson for how they map onto the rig).
   * @param c  { mi, phase, t, seed }
   */
  function pose(st, c) {
    const { t, seed } = c;
    const p = { ...base };
    switch (st.state) {
      case 'WALK': {
        const sw = Math.sin(c.phase) * 0.72 * c.mi;
        Object.assign(p, { fwdL: -sw, fwdR: sw, bendL: 0.18 + 0.4 * c.mi, bendR: 0.18 + 0.4 * c.mi, lean: 0.1 * c.mi, legs: 'walk', headNod: 0.05 });
        if (st.gait === 'run') {
          // sprint: long leg swing, high knees, elbows tucked and pumping, leaning into it
          const pump = Math.sin(c.phase) * 1.0 * c.mi;
          Object.assign(p, { fwdL: -pump, fwdR: pump, outL: 0.06, outR: 0.06, bendL: 1.45 * c.mi + 0.18, bendR: 1.45 * c.mi + 0.18, lean: 0.3 * c.mi, headNod: 0.08, hop: Math.abs(Math.sin(c.phase)) * 0.045 * c.mi, legAmp: 1.45, kneeAmp: 1.5, mood: 'focus' });
        } else if (st.gait === 'joy') {
          // running and bounding with both arms thrown up, mouth open, a little hop every stride
          const b = Math.sin(c.phase);
          Object.assign(p, { fwdL: 2.7 + b * 0.35 * c.mi, fwdR: 2.7 - b * 0.35 * c.mi, outL: 0.45 + Math.abs(Math.sin(c.phase / 2)) * 0.25, outR: 0.45 + Math.abs(Math.sin(c.phase / 2)) * 0.25, bendL: 0.25, bendR: 0.25, lean: -0.04, headNod: -0.06 + b * 0.05, hop: Math.abs(Math.sin(c.phase / 2)) * 0.3 * c.mi, legAmp: 1.1, kneeAmp: 1.9, mouth: 1, mood: 'cheer' });
        }
        break;
      }
      case 'LEAVE': {
        const sw = Math.sin(c.phase) * 0.72 * Math.max(c.mi, 0.2);
        Object.assign(p, { fwdL: -sw, fwdR: sw, bendL: 0.18 + 0.4 * c.mi, bendR: 0.18 + 0.4 * c.mi, lean: 0.1 * c.mi, legs: 'walk', mood: st.angry ? 'angry' : 'happy' });
        if (st.angry) Object.assign(p, { bendL: 1.4, bendR: 1.4, outL: 0.3, outR: 0.3, headYaw: Math.sin(t * 8) * 0.25 }); // stomping off, fists clenched
        break;
      }
      case 'TURN': {
        const sh = Math.sin(t * 11) * 0.3;
        Object.assign(p, { fwdL: sh * 0.3, fwdR: -sh * 0.3, legs: 'turn', lean: 0.03 });
        break;
      }
      case 'IDLE': {
        const sway = Math.sin(t * 1.4 + seed) * 0.05;
        Object.assign(p, { fwdL: sway, fwdR: -sway, mood: c.kind === 'officer' ? 'neutral' : c.kind === 'player' ? 'happy' : 'happy' });
        if (c.kind === 'officer') Object.assign(p, { fwdL: 0.9, bendL: 1.25, inL: 0.2, mood: 'neutral' }); // clipboard
        break;
      }
      case 'SIT':
        Object.assign(p, { fwdL: 0.5, fwdR: 0.5, bendL: 0.7, bendR: 0.7, lean: 0.12, legs: 'sit' });
        break;
      case 'TYPE': {
        const tap = Math.sin(t * 13 + seed) * 0.08;
        Object.assign(p, { fwdL: 0.78 + tap, fwdR: 0.78 - tap, outL: 0.08, outR: 0.08, bendL: 0.95, bendR: 0.95, lean: 0.14, headNod: 0.1 + Math.sin(t * 5 + seed) * 0.03, legs: 'sit', mood: 'happy' });
        if (c.kind === 'player') Object.assign(p, { fwdL: 0.7, fwdR: 1.15 + Math.sin(t * 14) * 0.3, bendL: 0.9, bendR: 0.55 + Math.sin(t * 14) * 0.25, lean: 0.28, legs: 'stand', mood: 'focus' });
        break;
      }
      case 'PLAY': {
        const hit = Math.sin(t * 15 + seed);
        Object.assign(p, { fwdL: 0.82 + hit * 0.04, fwdR: 0.95 + hit * 0.1, outL: 0.06, outR: 0.14, bendL: 1.0, bendR: 0.9, lean: 0.3 + Math.sin(t * 2 + seed) * 0.04, headNod: 0.16, legs: 'sit', mood: 'happy' });
        break;
      }
      case 'ANGRY': {
        const sh = Math.sin(t * 9 + seed);
        if (st.mild) {
          // impatient in the queue: arms crossed, head shaking slowly
          Object.assign(p, { outL: 0.55, outR: 0.55, bendL: 0, bendR: 0, inL: 1.15, inR: 1.15, lean: -0.04, headYaw: sh * 0.22, mood: 'angry', legs: 'stand' });
        } else {
          // shouting match: fists up and shaking, head jerking
          Object.assign(p, { fwdL: 0.95 + Math.sin(t * 14) * 0.3, fwdR: 0.8 - Math.sin(t * 14) * 0.3, outL: 0.55, outR: 0.55, bendL: 1.5, bendR: 1.5, inL: 0.25, inR: 0.25, lean: 0.2, headYaw: sh * 0.35, mood: 'angry', legs: 'stand', hop: Math.max(0, Math.sin(t * 7)) * 0.04 });
        }
        break;
      }
      case 'INSPECT': {
        if (c.kind === 'officer') Object.assign(p, { fwdL: 0.9, bendL: 1.25, inL: 0.2, fwdR: 0.9, bendR: 1.9, outR: 0.2, lean: 0.24, headNod: 0.2 + Math.sin(t * 2) * 0.05, mood: 'neutral' });
        else Object.assign(p, { fwdL: 0.5, fwdR: 1.0, bendL: 1.1, bendR: 0.6, lean: 0.22, headNod: 0.12, mood: 'focus' });
        break;
      }
      case 'REACT': {
        const r = st.react;
        if (r === 'panic') Object.assign(p, { outL: 2.6 + Math.sin(t * 20) * 0.2, outR: 2.6 - Math.sin(t * 20) * 0.2, bendL: 0.2, bendR: 0.2, lean: -0.05, mood: 'panic', legs: c.sit > 0.5 ? 'sit' : 'stand' });
        else if (r === 'startled') Object.assign(p, { fwdL: 1.7, fwdR: 1.7, outL: 0.5, outR: 0.5, bendL: 2.0, bendR: 2.0, headYaw: Math.sin(t * 4 + seed) * 0.7, mood: 'panic', hop: Math.max(0, Math.sin(t * 6 + seed)) * 0.05, legs: c.sit > 0.5 ? 'sit' : 'stand' });
        else if (r === 'annoyed') Object.assign(p, { fwdL: 0.4, bendL: 1.4, inL: 0.9, fwdR: 1.25, bendR: 2.2, outR: 0.45, mood: 'annoyed', headYaw: 0, legs: c.sit > 0.5 ? 'sit' : 'stand', lean: c.sit > 0.5 ? 0.05 : 0 });
        else if (r === 'cheer') Object.assign(p, { fwdL: 1.6 + Math.sin(t * 9) * 0.5, fwdR: 1.6 - Math.sin(t * 9) * 0.5, outL: 0.3, outR: 0.3, bendL: 0.5, bendR: 0.5, headNod: Math.sin(t * 9) * 0.1, mood: 'cheer', legs: c.sit > 0.5 ? 'sit' : 'stand', lean: 0.1, hop: Math.max(0, Math.sin(t * 9)) * 0.03 });
        else if (r === 'hide') Object.assign(p, { fwdL: 0.7, fwdR: 1.0, bendL: 1.0, bendR: 0.5, lean: 0.46, headYaw: Math.sign(Math.sin(t * 2.2 + seed)) * 0.55 * Math.min(1, Math.abs(Math.sin(t * 2.2 + seed)) * 4), mood: 'sly', legs: 'sit' });
        else if (r === 'stuck') Object.assign(p, { fwdL: 0.3, fwdR: 0.3, outL: 1.0, outR: 1.0, bendL: 0.7, bendR: 0.7, headYaw: Math.sin(t * 1.5) * 0.3, mood: 'sad', legs: c.sit > 0.5 ? 'sit' : 'stand' });
        else if (r === 'plead') Object.assign(p, { fwdR: 2.4 + Math.sin(t * 8) * 0.2, outR: 0.35 + Math.sin(t * 8) * 0.25, bendR: 0.6, mood: 'happy', lean: 0.04 });
        else if (r === 'sneak') Object.assign(p, { fwdL: 0.35, fwdR: 0.35, bendL: 1.6, bendR: 1.6, inL: 0.8, inR: 0.8, lean: 0.32, headYaw: Math.sign(Math.sin(t * 1.8 + seed)) * 0.6, mood: 'sly' });
        else if (r === 'lepak') Object.assign(p, { fwdL: 0.25, fwdR: 0.25, bendL: 0.5, bendR: 0.5, lean: -0.18, headNod: 0.32 + Math.sin(t * 1.2) * 0.1, mood: 'sleepy', legs: 'sit' });
        else if (r === 'greet') Object.assign(p, { fwdL: 0.9, bendL: 1.25, inL: 0.2, fwdR: 2.35, bendR: 2.3, outR: 0.3, mood: 'neutral' });
        break;
      }
    }
    return p;
  }

  /** Eyes/brows/mouth targets per mood: [brow, smile, eyeOpen]. */
  const MOODS = {
    happy: [0.0, 1, 1], neutral: [0.0, 0.05, 1], angry: [-0.5, -0.9, 1], panic: [0.35, 0, 1], sly: [-0.2, 0.7, 0.8], focus: [-0.18, 0.55, 1],
    annoyed: [-0.35, -0.5, 0.85], cheer: [0.2, 1, 1], sad: [0.45, -0.6, 1], sleepy: [0.1, 0.1, 0.32],
  };

  ns.Anim = { STATES, stateOf, pose, MOODS, TYPES_THAT_PLAY };
})(window.ABCC);
