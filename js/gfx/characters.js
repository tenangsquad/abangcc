/* ==========================================================================
   3e. CHARACTERS — the chibi cast: Abang, nine customer archetypes, the officer
   --------------------------------------------------------------------------
   Big round heads, small bodies, readable eyes and brows. Each person is a little
   rig of rounded primitives (legs, torso, arms, head, hair/headwear, face) posed by
   the animation state machine (anim.js). Placeholder-quality geometry, but every
   archetype has its own silhouette and clothing.
   ========================================================================== */
(function (ns) {
  'use strict';

  const { TYPES, ROOM, clamp, lerp, damp, shortestAngle } = ns;
  const TAU = Math.PI * 2;

  const SKINS = ['#ffd9b8', '#f3bb8e', '#d99b6c', '#b97a52', '#8c5a3a'];
  const HAIRS = ['#2b2233', '#3a2a22', '#15151c', '#5a3a2a', '#7a4cff', '#c9702a'];
  const PANTS = ['#4a6fd8', '#3b4b6b', '#7a5c3c', '#2f8f83', '#6b4b9e'];
  const SCARVES = ['#ff8fb8', '#8c6cff', '#59c7ff', '#ffcf3d', '#7ee8b4'];

  ns.GfxParts = ns.GfxParts || {};
  ns.GfxParts.characters = function (G) {
    const { R, st, eng, put, meshes, ball, cyl, blk, ring, shadow, project, E } = G;
    const Anim = ns.Anim;
    const hash = (n) => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;

    function poseOf(key) {
      let p = R.poses.get(key);
      if (!p) R.poses.set(key, (p = { fwdL: 0, fwdR: 0, outL: 0.12, outR: 0.12, bendL: 0.18, bendR: 0.18, inL: 0, inR: 0, lean: 0, look: 0, nod: 0, brow: 0, smile: 0.6, open: 0, eye: 1, seen: 0, face: null, hop: 0, yaw: 0, state: 'IDLE' }));
      return p;
    }

    /** Colours, hair and headgear for a person. */
    function lookFor(e, kind) {
      if (kind === 'player') return { skin: SKINS[1], hair: '#17151f', style: 'cap', pants: '#3b4b6b', shirt: '#2fc4b2', scale: 0.98, gear: 'abang', shoe: '#ffffff' };
      if (kind === 'officer') return { skin: SKINS[2], hair: '#15151c', style: 'officer', pants: '#27325c', shirt: '#4f86ee', scale: 0.96, gear: 'officer', shoe: '#17151f' };
      const type = TYPES.find((t) => t.id === e.type) || TYPES[0];
      const id = Math.abs(e.id);
      const female = e.female ?? (type.id === 'student' ? id % 2 === 1 : ['mmorpg', 'arena', 'lepak', 'hot'].includes(type.id) ? false : id % 4 === 1);
      const look = { skin: SKINS[id % SKINS.length], hair: HAIRS[(id * 3) % 4], style: 'short', pants: PANTS[id % PANTS.length], shirt: e.color || type.shirt, scale: 0.88, gear: e.look || type.look, shoe: id % 2 ? '#ffffff' : '#ff7a6b', female };
      if (look.gear === 'kid') { look.scale = 0.74; look.style = 'cap'; }
      if (female && look.gear !== 'kid') { look.style = id % 3 === 0 ? 'long' : 'tudung'; look.scarf = SCARVES[id % SCARVES.length]; }
      if (look.gear === 'songkok') { look.style = 'songkok'; look.scale = 0.9; }
      if (look.gear === 'wizard') look.style = 'wizardhair';
      if (look.gear === 'redband' || look.gear === 'bandana') look.style = 'spiky';
      if (look.gear === 'hoodie') { look.style = 'hood'; look.shirt = '#4b4a8a'; look.pants = '#2a2a45'; look.scale = 0.9; look.bags = true; }
      if (look.gear === 'mirc') { look.style = 'bucket'; look.shirt = '#9fb3cf'; look.hat = '#3d6b8f'; look.scale = 0.88; }
      if (look.gear === 'mak') { look.style = 'tudung'; look.scarf = '#7a4cbf'; look.female = true; look.shirt = '#d86c8c'; look.pants = '#5a3a6a'; look.scale = 0.9; look.skin = SKINS[2]; look.glasses = true; }
      if (look.gear === 'uniform') {
        look.shirt = '#f6f6fb'; look.pants = '#2b3f8f'; look.scale = 0.82; look.shoe = '#ffffff';
        look.style = female ? 'tudung' : 'short';
        if (female) look.scarf = '#ffffff';
      }
      return look;
    }

    /* ---------------------------------------------------------------- outfits */
    function drawOutfit(look) {
      switch (look.gear) {
        case 'abang':
          ball(0, 0.34, 0.2, 0.26, 0.33, 0.14, '#fff3d1');
          ball(0.14, 0.52, 0.31, 0.07, 0.045, 0.02, '#ffcf3d', 0, 0, true);
          break;
        case 'officer':
          ball(-0.13, 0.52, 0.26, 0.05, 0.05, 0.03, '#ffd23f', 0, 0.4, true);
          blk(0, 0.07, 0.0, 0.7, 0.06, 0.56, '#17151f', 0.02, 0);
          break;
        case 'student':
        case 'kid':
          blk(0, 0.1, -0.33, 0.5, 0.58, 0.24, look.gear === 'kid' ? '#ff8f3d' : '#7a4cff', 0.1);
          break;
        case 'uniform':
          blk(0, 0.1, -0.33, 0.5, 0.58, 0.24, '#4a6bd8', 0.1); // school bag
          blk(0, 0.5, 0.29, 0.07, 0.2, 0.03, '#d9304a', 0.02, 0); // tie
          break;
        case 'hoodie': // hood bunching at the back, kangaroo pocket
          ball(0, 0.62, -0.2, 0.28, 0.16, 0.16, look.shirt);
          blk(0, 0.12, 0.27, 0.36, 0.14, 0.05, '#3a3970', 0.03, 0);
          break;
        case 'mirc': // headphones round the neck, band tee print
          ring(0, 0.66, 0.05, 0.27, 0.04, '#2a2150', 1, 0, Math.PI * 1.2);
          ball(0, 0.4, 0.27, 0.12, 0.1, 0.03, '#ff5da2', 0, 0.3, true);
          break;
        case 'mak': // handbag
          blk(0.4, 0.14, 0.05, 0.14, 0.2, 0.22, '#7a3a20', 0.04);
          break;
        default:
          ball(0, 0.44, 0.27, 0.1, 0.1, 0.03, '#ffffff', 0, 0.25, true);
      }
    }

    function drawHead(look, kind, P, e, seed) {
      const t = R.t;
      const skin = look.skin;
      ball(0, 0, 0, 0.41, 0.38, 0.38, skin);
      for (const side of [-1, 1]) ball(side * 0.4, -0.02, 0, 0.07, 0.09, 0.05, skin, 1, 0, true);

      // hair / headwear
      switch (look.style) {
        case 'tudung':
          ball(0, 0.0, -0.09, 0.5, 0.47, 0.43, look.scarf);
          ball(0, -0.4, -0.02, 0.43, 0.3, 0.34, look.scarf);
          break;
        case 'long':
          ball(0, 0.15, -0.07, 0.44, 0.35, 0.42, look.hair);
          ball(0, -0.17, -0.24, 0.4, 0.55, 0.26, look.hair);
          break;
        case 'songkok':
          ball(0, 0.12, -0.06, 0.42, 0.3, 0.4, look.hair);
          cyl(0, 0.26, -0.02, 0.3, 0.24, '#1e1b33', 0.92);
          blk(0, 0.31, 0.27, 0.12, 0.04, 0.03, '#ffd23f', 0.015, 0);
          break;
        case 'cap':
          ball(0, 0.12, -0.06, 0.42, 0.3, 0.4, look.hair);
          if (kind === 'player') {
            const hat = R.abangHat || 'cap'; // cosmetic, unlocked across runs (see js/state/meta.js)
            if (hat === 'phones') { // gamer headphones over the hair
              ring(0, -0.02, -0.02, 0.47, 0.05, '#2a2150', 1, 0, Math.PI);
              for (const side of [-1, 1]) {
                ball(side * 0.45, -0.02, 0, 0.1, 0.17, 0.15, '#2a2150');
                ball(side * 0.53, -0.02, 0, 0.03, 0.12, 0.11, '#4cc3ff', 0, 0.5, true);
              }
              ball(0, 0.36, 0.08, 0.1, 0.05, 0.1, '#ff5da2', 0, 0.2, true); // a hair tuft so the head isn't bare
            } else if (hat === 'straw') { // wide-brim straw hat with a red band
              cyl(0, 0.2, -0.02, 0.68, 0.05, '#e8c46a', 1, 1);
              cyl(0, 0.24, -0.02, 0.36, 0.26, '#f2d27e', 0.9, 1);
              cyl(0, 0.25, -0.02, 0.375, 0.07, '#d9304a', 0.97, 0);
            } else if (hat === 'crown') { // gold crown with gems
              cyl(0, 0.3, -0.03, 0.36, 0.17, '#ffd23f', 1.12, 1, 0.12);
              for (let i = 0; i < 5; i++) {
                const a = (i / 5) * TAU;
                cyl(Math.sin(a) * 0.3, 0.46, Math.cos(a) * 0.3 - 0.03, 0.07, 0.2, '#ffd23f', 0.2, 1, 0.12);
                ball(Math.sin(a) * 0.3, 0.68, Math.cos(a) * 0.3 - 0.03, 0.05, 0.05, 0.05, i % 2 ? '#ff5d73' : '#4cc3ff', 0, 0.6, true);
              }
            } else {
              ball(0, 0.22, -0.03, 0.44, 0.26, 0.42, '#ffcf3d');
              blk(0, 0.2, 0.36, 0.5, 0.06, 0.34, '#ffb300', 0.03);
              ball(0, 0.3, 0.3, 0.1, 0.06, 0.03, '#ffffff', 0, 0.3, true);
            }
          } else {
            ball(0, 0.22, -0.03, 0.44, 0.26, 0.42, '#4da3ff');
            blk(0, 0.2, -0.36, 0.5, 0.06, 0.34, '#2f7fe0', 0.03);
          }
          break;
        case 'officer':
          ball(0, 0.1, -0.06, 0.42, 0.3, 0.4, look.hair);
          cyl(0, 0.22, 0, 0.44, 0.22, '#27325c', 0.96);
          blk(0, 0.21, 0.34, 0.5, 0.05, 0.3, '#17151f', 0.02);
          ball(0, 0.36, 0.32, 0.07, 0.07, 0.03, '#ffd23f', 0, 0.5, true);
          break;
        case 'spiky':
          ball(0, 0.14, -0.06, 0.43, 0.33, 0.41, look.hair);
          for (let i = 0; i < 5; i++) {
            st.push();
            st.translate(0, 0.32, 0);
            st.rotateY((i / 5) * TAU);
            st.rotateX(0.7);
            cyl(0, 0, 0, 0.11, 0.34, look.hair, 0.1, 1);
            st.pop();
          }
          break;
        case 'wizardhair':
          ball(0, 0.14, -0.06, 0.43, 0.33, 0.41, '#c9c4e8');
          break;
        case 'hood': // hood up, dark brim over the forehead
          ball(0, 0.04, -0.08, 0.5, 0.46, 0.45, look.shirt);
          ball(0, 0.22, 0.2, 0.42, 0.14, 0.2, '#3a3970');
          break;
        case 'bucket': // bucket hat with a brim
          ball(0, 0.12, -0.06, 0.42, 0.3, 0.4, look.hair);
          cyl(0, 0.2, 0, 0.42, 0.2, look.hat, 0.85);
          cyl(0, 0.19, 0, 0.56, 0.05, look.hat, 1);
          break;
        default:
          ball(0, 0.15, -0.07, 0.43, 0.35, 0.42, look.hair);
          ball(0.12, 0.27, 0.2, 0.2, 0.08, 0.12, look.hair, 0, 0, true);
      }

      // gear
      switch (look.gear) {
        case 'headset':
          st.push();
          st.rotateZ(Math.PI);
          ring(0, 0, 0, 0.45, 0.035, '#2a2150', 1, 0, Math.PI);
          st.pop();
          for (const side of [-1, 1]) {
            st.push();
            st.translate(side * 0.46, -0.02, 0);
            st.rotateZ(Math.PI / 2);
            cyl(0, -0.07, 0, 0.14, 0.14, '#ff5d73', 0.95);
            st.pop();
          }
          blk(0.3, -0.16, 0.3, 0.05, 0.05, 0.2, '#2a2150', 0.02, 0);
          break;
        case 'bandana':
        case 'redband':
          st.push();
          st.translate(0, 0.17, 0);
          st.rotateX(Math.PI / 2);
          ring(0, 0, 0, 0.405, 0.05, look.gear === 'bandana' ? '#ff4d5e' : '#ff8f3d', 1);
          st.pop();
          ball(0, 0.17, -0.43, 0.1, 0.09, 0.05, look.gear === 'bandana' ? '#ff4d5e' : '#ff8f3d', 1, 0, true);
          break;
        case 'wizard':
          cyl(0, 0.3, 0, 0.52, 0.06, '#7a4dff', 1, 1);
          cyl(0, 0.34, 0, 0.32, 0.9, '#7a4dff', 0.06, 1);
          ball(0.1, 0.78, 0.2, 0.07, 0.07, 0.03, '#ffe14d', 0, 1, true);
          break;
        case 'student':
        case 'uncle':
        case 'songkok':
        case 'mirc':
        case 'mak':
          for (const side of [-1, 1]) ring(side * 0.15, 0.02, 0.375, 0.115, 0.02, '#2a2150', 0, 0);
          blk(0, 0.03, 0.385, 0.08, 0.02, 0.02, '#2a2150', 0.01, 0);
          break;
      }
      if (look.gear === 'songkok') blk(0, -0.1, 0.36, 0.22, 0.045, 0.04, '#2d2a3a', 0.02, 0);

      // face
      const eyeOpen = P.eye;
      const blink = ((t + seed) % (3.2 + (seed % 3) * 0.4) < 0.12 ? 0.12 : 1) * eyeOpen;
      for (const side of [-1, 1]) {
        ball(side * 0.145, 0.02, 0.325, 0.062, 0.085 * blink, 0.05, '#251a3a', 0, 0, true);
        if (blink > 0.5) ball(side * 0.145 + 0.02, 0.05, 0.365, 0.022, 0.026, 0.015, '#ffffff', 0, 1, true);
        if (look.bags) ball(side * 0.145, -0.07, 0.34, 0.075, 0.025, 0.02, '#6a5aa0', 0, 0, true); // night-owl eye bags
        st.push();
        st.translate(side * 0.145, 0.165 - P.brow * 0.02, 0.33);
        st.rotateZ(-side * P.brow * 0.55 + side * 0.04);
        blk(-0.07, 0, 0, 0.14, 0.035, 0.03, look.hair === '#c9c4e8' ? '#8a86a8' : look.style === 'hood' ? '#2a2150' : look.hair, 0.015, 0);
        st.pop();
        ball(side * 0.255, -0.09, 0.28, 0.07, 0.045, 0.03, '#ff9aa8', 0, 0.15, true);
      }
      ball(0, -0.04, 0.378, 0.04, 0.035, 0.03, E.mixColor(skin, '#8a5a3a', 0.2), 0, 0, true);
      st.push();
      st.translate(0, -0.15, 0.352);
      if (P.open > 0.15) {
        ball(0, -0.01, 0, 0.065 * P.open + 0.02, 0.08 * P.open, 0.03, '#5a1f3d', 0, 0, true);
      } else if (P.smile > 0.2) {
        ring(0, 0.1, 0, 0.1, 0.018, '#5a1f3d', 0, 0, 2.2 * Math.min(1, P.smile + 0.2));
      } else if (P.smile < -0.2) {
        st.rotateZ(Math.PI);
        ring(0, 0.1, 0, 0.09, 0.018, '#5a1f3d', 0, 0, 1.9);
      } else {
        blk(-0.05, 0, 0, 0.1, 0.02, 0.02, '#5a1f3d', 0.01, 0);
      }
      st.pop();
      if (look.gear === 'uncle' || look.gear === 'songkok') blk(-0.1, -0.09, 0.36, 0.2, 0.04, 0.04, '#3a3550', 0.02, 0);
    }

    /** Where this person should be facing while standing still (null = keep the simulation's own facing). */
    function faceTarget(e, kind, s, mode) {
      const point = (x, y) => Math.atan2(x - e.x, y - e.y);
      if (mode.state === 'ANGRY' && !mode.mild && e.argueWith != null) {
        const other = s.customers.find((c) => c.id === e.argueWith);
        if (other) return point(other.x, other.y);
      }
      if ((mode.state === 'INSPECT' || mode.react === 'annoyed') && e.lookAt && !(e.sitBlend > 0.5)) return point(e.lookAt.x, e.lookAt.y);
      if (kind === 'player' && !e.working && Math.hypot(e.x - ns.ROOM.home.x, e.y - ns.ROOM.home.y) < 0.2) return Math.PI / 2;
      if (e.status === 'waiting') return -1.2;
      return null;
    }

    /* ----------------------------------------------------------------- person */
    function drawPerson(s, e, kind, dt) {
      const key = kind === 'player' ? 'abang' : e.id;
      const P = poseOf(key);
      P.seen = R.t;
      const look = lookFor(e, kind);
      const t = R.t, seed = (Math.abs(typeof e.id === 'number' ? e.id : 0) % 9) * 1.7;

      // pop in/out at the door
      let pop = 1;
      if (kind !== 'player' && e.y < 2.4 && e.x < 1.5 && (e.status === 'arriving' || e.status === 'leaving' || e.status === 'officer' || e.status === 'event')) pop = clamp((e.x - 0.3) / 0.8, 0, 1);
      pop = pop * pop * (3 - 2 * pop);
      if (pop < 0.03) return;

      const sit = e.sitBlend || 0;
      const mi = e.moveIntensity || 0;
      const phase = e.walkCycle || 0;
      const k = look.scale * ROOM.charScale * pop;

      // facing: eased towards what they should be looking at; walking people just follow their velocity
      const moving = mi > 0.05;
      let ang = e.facing ?? 0;
      let turning = false;
      if (P.face == null) P.face = ang;
      const preMode = { state: e.act === 'argue' ? 'ANGRY' : e.act === 'inspect' ? 'INSPECT' : 'IDLE', mild: false, react: e.act };
      const want = !moving && sit < 0.3 ? faceTarget(e, kind, s, preMode) : null;
      if (moving || want == null) P.face = ang;
      else {
        const diff = shortestAngle(P.face, want);
        P.face += diff * (1 - Math.exp(-7 * dt));
        turning = Math.abs(diff) > 0.32;
        ang = P.face;
      }

      // the animation state machine
      const taskKind = kind === 'player' ? s.activeTask?.kind : null;
      const mode = Anim.stateOf(e, kind, { s, turning, task: taskKind, leaving: kind === 'officer' && s.officer?.stage === 'leave' });
      const tgt = Anim.pose(mode, { mi, phase, t, seed, kind, sit });
      P.state = mode.state;

      // pose targets → eased pose
      const rate = mode.state === 'REACT' || mode.state === 'ANGRY' ? 14 : 11;
      for (const key2 of ['fwdL', 'fwdR', 'outL', 'outR', 'bendL', 'bendR', 'inL', 'inR', 'lean']) P[key2] = damp(P[key2], tgt[key2], rate, dt);
      P.yaw = damp(P.yaw, tgt.headYaw, 9, dt);
      P.hop = damp(P.hop, tgt.hop, 14, dt);

      // head targets
      let lookYaw = 0;
      if (e.lookAt && (mode.react === 'annoyed' || mode.state === 'INSPECT')) lookYaw = clamp(shortestAngle(ang + shortestAngle(ang, Math.PI) * sit, Math.atan2(e.lookAt.x - e.x, e.lookAt.y - e.y)), -1.1, 1.1);
      const lookCam = !moving && sit < 0.3 && want == null && mode.state === 'IDLE' ? clamp(shortestAngle(e.facing ?? 0, Math.PI / 4) * 0.5, -0.7, 0.7) : 0;
      P.look = damp(P.look, lookCam + lookYaw + P.yaw + (sit > 0.5 && mode.state !== 'REACT' ? Math.sin(t * 0.7 + seed) * 0.12 : 0), 7, dt);
      P.nod = damp(P.nod, tgt.headNod || (sit > 0.5 ? 0.12 + Math.sin(t * 5 + seed) * 0.03 : moving ? 0.05 : 0), 6, dt);
      const [browT, smileT, eyeT] = Anim.MOODS[tgt.mood] || Anim.MOODS.neutral;
      P.brow = damp(P.brow, browT, 9, dt);
      P.smile = damp(P.smile, smileT, 9, dt);
      P.open = damp(P.open, tgt.mood === 'panic' ? 1 : 0, 10, dt);
      P.eye = damp(P.eye, eyeT, 6, dt);

      // placement
      ang += shortestAngle(ang, Math.PI) * sit;
      const bob = Math.abs(Math.sin(phase)) * 0.055 * mi;
      const breathe = 1 + Math.sin(t * 2.2 + seed) * 0.012;
      const hipY = lerp(0.8, 0.5, sit) + bob + P.hop;
      const squash = 1 + Math.sin(phase * 2) * 0.025 * mi;

      eng.cast(true);
      st.push();
      st.translate(e.x, 0, e.y);
      shadow(e.x, e.y, 0.5 * k, 0.4 * k, 0.36);
      st.rotateY(ang);
      st.scale(k);

      // legs
      for (const side of [-1, 1]) {
        const ph = phase + (side > 0 ? 0 : Math.PI);
        let f = Math.sin(ph) * 0.7 * mi;
        let knee = Math.max(0, -Math.sin(ph + 0.9)) * 0.9 * mi;
        if (tgt.legs === 'turn') {
          const step = Math.sin(t * 11 + (side > 0 ? 0 : Math.PI));
          f = step * 0.32;
          knee = Math.max(0, -step) * 0.5;
        }
        f = lerp(f, 1.35, sit);
        knee = lerp(knee, 1.35, sit);
        st.push();
        st.translate(side * 0.17, hipY, 0);
        st.rotateX(-f);
        cyl(0, -0.34, 0, 0.1, 0.36, look.pants, 0.9);
        st.translate(0, -0.34, 0);
        st.rotateX(knee);
        cyl(0, -0.34, 0, 0.088, 0.35, look.gear === 'kid' || look.gear === 'redband' ? look.skin : look.pants, 0.9);
        ball(0, -0.37, 0.07, 0.115, 0.08, 0.19, look.shoe);
        st.pop();
      }

      // torso
      st.push();
      st.translate(0, hipY, 0);
      st.rotateX(P.lean);
      ball(0, 0.06, 0, 0.31, 0.2, 0.26, look.pants);
      ball(0, 0.4 * squash, 0, 0.35 * (2 - squash), 0.39 * squash * breathe, 0.29, look.shirt);
      drawOutfit(look);

      // arms
      for (const side of [-1, 1]) {
        const fwd = side < 0 ? P.fwdL : P.fwdR, out = side < 0 ? P.outL : P.outR, bend = side < 0 ? P.bendL : P.bendR, inward = side < 0 ? P.inL : P.inR;
        st.push();
        st.translate(side * 0.38, 0.64, 0);
        st.rotateZ(side * out);
        st.rotateX(-fwd);
        cyl(0, -0.28, 0, 0.085, 0.3, look.shirt, 0.92);
        st.translate(0, -0.27, 0);
        st.rotateX(-bend);
        st.rotateZ(-side * inward);
        cyl(0, -0.25, 0, 0.073, 0.26, look.skin, 0.9);
        ball(0, -0.3, 0, 0.095, 0.095, 0.095, look.skin);
        if (look.gear === 'officer' && side < 0) { blk(-0.02, -0.34, 0.12, 0.34, 0.04, 0.44, '#8a5a3a', 0.02); blk(-0.02, -0.325, 0.12, 0.28, 0.02, 0.38, '#ffffff', 0.01, 0); }
        if (kind === 'player' && e.working && side > 0 && mode.state === 'TYPE') { blk(0, -0.45, 0.04, 0.07, 0.22, 0.07, '#9aa3bd', 0.03); blk(0, -0.52, 0.04, 0.2, 0.1, 0.1, G.PAL.coral, 0.04); }
        st.pop();
      }

      // head
      st.push();
      st.translate(0, 1.05, 0);
      st.rotateY(P.look);
      st.rotateX(P.nod);
      drawHead(look, kind, P, e, seed);
      st.pop();
      st.pop(); // torso
      st.pop(); // person
      eng.cast(false);

      // anchors for labels and ray picking (screen space + world capsule)
      const headY = (lerp(0.8, 0.5, sit) + 1.45) * k + 0.25;
      const head = project(e.x, headY, e.y);
      const body = project(e.x, 0.95 * k, e.y);
      R.anchors.people.push({ kind, id: key, x: head.x, y: head.y, bx: body.x, by: body.y, status: e.status, eventId: e.eventId, anim: mode.state, react: mode.react || null, h: 1.75 * k });
    }

    return { drawPerson, lookFor };
  };
})(window.ABCC);
