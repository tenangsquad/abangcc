/* ==========================================================================
   3f. PROPS — the room shell, counter, queue lane and everything that makes it lived-in
   --------------------------------------------------------------------------
   Lighting-aware: window glass, light patches, lamps, neon and the emergency beacon all
   follow R.light (the time of day) and the blackout state. Decorations are kept clear of
   the PC desks, the walking lanes and the queue so nothing hides a click target.
   ========================================================================== */
(function (ns) {
  'use strict';

  const { CFG, ROOM, clamp, damp } = ns;
  const TAU = Math.PI * 2;

  ns.GfxParts = ns.GfxParts || {};
  ns.GfxParts.props = function (G) {
    const { R, st, eng, meshes, ball, cyl, blk, ring, shadow, glow, flatRing, putSpecial, putDecalM, putDecal, PAL, burst } = G;

    /* ---------------------------------------------------------- sign textures */
    const text = (c, str, x, y, size, color, align = 'center') => {
      c.font = `700 ${size}px Fredoka, 'Trebuchet MS', 'Arial Rounded MT Bold', system-ui, sans-serif`;
      c.textAlign = align;
      c.textBaseline = 'middle';
      c.fillStyle = color;
      c.fillText(str, x, y);
    };
    function fillSign(c, w, h, bg, border) {
      c.clearRect(0, 0, w, h);
      c.fillStyle = bg;
      c.beginPath();
      c.roundRect(4, 4, w - 8, h - 8, 26);
      c.fill();
      c.lineWidth = 8;
      c.strokeStyle = border;
      c.stroke();
    }
    /** A cartoon head for the posters. */
    const face = (c, x, y, r, skin) => {
      c.fillStyle = skin;
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      c.fillStyle = '#251a3a';
      c.beginPath(); c.arc(x - r * 0.35, y, r * 0.11, 0, TAU); c.arc(x + r * 0.35, y, r * 0.11, 0, TAU); c.fill();
      c.strokeStyle = '#5a1f3d'; c.lineWidth = Math.max(2, r * 0.07);
      c.beginPath(); c.arc(x, y + r * 0.12, r * 0.4, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    };
    const SIGNS = {
      neon: { w: 512, h: 160, paint: (c, w, h) => { fillSign(c, w, h, '#2a2150', '#ff7ac6'); text(c, 'KEDAI SIBER', w / 2, 70, 84, '#7ff3ff'); text(c, 'PING STABIL? MIMPI LAH.', w / 2, 128, 30, '#ffd36e'); } },
      kaunter: { w: 384, h: 128, paint: (c, w, h) => { fillSign(c, w, h, '#ff7a6b', '#fff3d1'); text(c, 'KAUNTER', w / 2, 52, 64, '#fff'); text(c, 'RM1 · RM2 · RM3', w / 2, 98, 30, '#fff3d1'); } },
      nolag: { w: 256, h: 320, paint: (c, w, h) => { fillSign(c, w, h, '#2a2150', '#7ff3ff'); text(c, 'NO', w / 2, 70, 66, '#ffd36e'); text(c, 'LAG', w / 2, 150, 108, '#7ff3ff'); text(c, 'ZONE', w / 2, 240, 56, '#ff8fc0'); } },
      gameon: { w: 256, h: 320, paint: (c, w, h) => { fillSign(c, w, h, '#ffcf3d', '#2a2150'); text(c, '🎮', w / 2, 90, 88, '#000'); text(c, 'GAME', w / 2, 180, 64, '#2a2150'); text(c, 'ON!', w / 2, 255, 80, '#ff5d73'); } },
      buka: { w: 256, h: 128, paint: (c, w, h) => { fillSign(c, w, h, '#7ee8b4', '#2a2150'); text(c, 'BUKA', w / 2, 46, 52, '#2a2150'); text(c, '12 – 12', w / 2, 96, 44, '#2a2150'); } },
      masuk: { w: 256, h: 96, paint: (c, w, h) => { fillSign(c, w, h, '#59c7ff', '#fff3d1'); text(c, 'MASUK →', w / 2, 50, 54, '#fff'); } },
      snack: { w: 256, h: 96, paint: (c, w, h) => { fillSign(c, w, h, '#ff5d73', '#fff3d1'); text(c, 'SNACK', w / 2, 50, 60, '#fff'); } },
      parts: { w: 384, h: 96, paint: (c, w, h) => { fillSign(c, w, h, '#2a2150', '#ffcf3d'); text(c, '🔧 SPARE PARTS', w / 2, 52, 46, '#ffcf3d'); } },
      wet: { w: 256, h: 256, paint: (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(w / 2, 14); c.lineTo(w - 14, h - 24); c.lineTo(14, h - 24); c.closePath(); c.fill(); c.lineWidth = 12; c.strokeStyle = '#2a2150'; c.stroke(); text(c, '!', w / 2, h * 0.62, 130, '#2a2150'); } },
      pos: { w: 256, h: 192, paint: (c, w, h) => { c.fillStyle = '#0c2a14'; c.fillRect(0, 0, w, h); c.fillStyle = '#58ff8a'; text(c, 'SEWA PC', w / 2, 34, 34, '#58ff8a'); text(c, '30m  RM1', w / 2, 82, 30, '#58ff8a'); text(c, '60m  RM2', w / 2, 120, 30, '#58ff8a'); text(c, '90m  RM3', w / 2, 158, 30, '#58ff8a'); } },
      fuse: { w: 128, h: 128, paint: (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(w / 2, 8); c.lineTo(w - 10, h - 14); c.lineTo(10, h - 14); c.closePath(); c.fill(); c.lineWidth = 8; c.strokeStyle = '#2a2150'; c.stroke(); c.fillStyle = '#2a2150'; c.beginPath(); c.moveTo(w * 0.56, 34); c.lineTo(w * 0.4, h * 0.6); c.lineTo(w * 0.52, h * 0.6); c.lineTo(w * 0.44, h - 30); c.lineTo(w * 0.64, h * 0.5); c.lineTo(w * 0.52, h * 0.5); c.closePath(); c.fill(); } },
      posterFps: { w: 256, h: 340, paint: (c, w, h) => {
        const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ff7a59'); g.addColorStop(1, '#7a1f3d'); c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.fillStyle = '#2f5d3a'; c.beginPath(); c.arc(w / 2, 150, 78, Math.PI, 0); c.fill(); c.fillRect(w / 2 - 78, 150, 156, 18); // helmet
        face(c, w / 2, 190, 62, '#f3bb8e');
        c.fillStyle = '#2f5d3a'; c.fillRect(w / 2 - 70, 142, 140, 22);
        c.fillStyle = '#222'; c.fillRect(w / 2 + 30, 232, 96, 22); c.fillRect(w / 2 + 100, 222, 26, 42); // rifle
        text(c, 'COUNTER', w / 2, 40, 44, '#fff3d1'); text(c, 'BATTALION', w / 2, 82, 44, '#ffd23f'); text(c, 'FPS · 2007', w / 2, 312, 28, '#fff3d1');
      } },
      posterMmo: { w: 256, h: 340, paint: (c, w, h) => {
        const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#4a2fa0'); g.addColorStop(1, '#1c1250'); c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.fillStyle = '#ffe14d'; for (let i = 0; i < 18; i++) { c.beginPath(); c.arc((i * 83) % w, 100 + ((i * 47) % 160), 2.4, 0, TAU); c.fill(); }
        c.fillStyle = '#7a4dff'; c.beginPath(); c.moveTo(w / 2, 70); c.lineTo(w / 2 + 70, 190); c.lineTo(w / 2 - 70, 190); c.closePath(); c.fill(); // wizard hat
        face(c, w / 2, 214, 52, '#ffd9b8');
        c.fillStyle = '#e8e4ff'; c.beginPath(); c.moveTo(w / 2 - 40, 236); c.lineTo(w / 2, 300); c.lineTo(w / 2 + 40, 236); c.closePath(); c.fill(); // beard
        c.fillStyle = '#9aa3bd'; c.fillRect(w / 2 + 70, 150, 10, 150); c.fillStyle = '#ffe14d'; c.beginPath(); c.arc(w / 2 + 75, 142, 16, 0, TAU); c.fill(); // staff
        text(c, 'MYTHQUEST', w / 2, 36, 40, '#ffe14d'); text(c, 'ONLINE', w / 2, 316, 40, '#fff3d1');
      } },
      posterRace: { w: 256, h: 340, paint: (c, w, h) => {
        const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#59c7ff'); g.addColorStop(1, '#ffd36e'); c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.fillStyle = '#3a3a52'; c.beginPath(); c.moveTo(0, h); c.lineTo(w * 0.42, 150); c.lineTo(w * 0.58, 150); c.lineTo(w, h); c.closePath(); c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = 6; c.setLineDash([22, 20]); c.beginPath(); c.moveTo(w / 2, 160); c.lineTo(w / 2, h); c.stroke(); c.setLineDash([]);
        c.fillStyle = '#ff5d73'; c.beginPath(); c.roundRect(w / 2 - 54, 214, 108, 54, 20); c.fill(); c.fillStyle = '#bfe5ff'; c.fillRect(w / 2 - 32, 200, 64, 26);
        c.fillStyle = '#222'; c.beginPath(); c.arc(w / 2 - 36, 272, 14, 0, TAU); c.arc(w / 2 + 36, 272, 14, 0, TAU); c.fill();
        text(c, 'TURBO', w / 2, 40, 54, '#2a2150'); text(c, 'KAMPUNG', w / 2, 94, 40, '#ff5d73');
      } },
      posterToon: { w: 256, h: 340, paint: (c, w, h) => {
        c.fillStyle = '#ffe9a8'; c.fillRect(0, 0, w, h); c.strokeStyle = '#2a2150'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10);
        face(c, w / 2 - 46, 150, 54, '#ffd9b8'); face(c, w / 2 + 52, 170, 44, '#f3bb8e');
        c.fillStyle = '#ff5d73'; c.beginPath(); c.arc(w / 2 - 46, 108, 40, Math.PI, 0); c.fill();
        c.fillStyle = '#59c7ff'; c.beginPath(); c.arc(w / 2 + 52, 134, 34, Math.PI, 0); c.fill();
        text(c, 'KAWAN', w / 2, 44, 46, '#2a2150'); text(c, 'KARTUN', w / 2, 300, 46, '#ff5d73'); text(c, 'SABTU PAGI', w / 2, 330, 22, '#2a2150');
      } },
    };
    function bakeSigns() {
      for (const [id, s] of Object.entries(SIGNS)) SIGNS[id].tex = eng.makeTexture(id, s.w, s.h, s.paint);
      R.signsReady = true;
    }
    bakeSigns();
    if (document.fonts?.ready) document.fonts.ready.then(bakeSigns);
    /** Stand a sign in the world; `ry` = rotation about Y (0 faces +z, π/2 faces +x). */
    function sign(id, x, y, z, w, h, ry = 0, emis = 0.35) {
      st.push();
      st.translate(x, y, z);
      st.rotateY(ry);
      putSpecial('sign', meshes.planeXY(), w, h, 1, '#ffffff', '#ffffff', SIGNS[id].tex, emis);
      st.pop();
    }

    /** Additive halo on a wall (back wall: axis 'z', left wall: axis 'x'). */
    function wallHalo(axis, x, y, z, rx, rh, col, alpha) {
      if (alpha < 0.01) return;
      st.push();
      if (axis === 'z') { st.translate(x, y, 0.13); st.rotateX(-Math.PI / 2); } // back wall
      else { st.translate(0.13, y, z); st.rotateZ(Math.PI / 2); } // left wall
      putDecalM('glow', rx, rh, col, alpha);
      st.pop();
    }

    /* -------------------------------------------------------------- small props */
    function plant(x, z, k) {
      st.push();
      st.translate(x, 0, z);
      st.scale(k);
      shadow(x, z, 0.5 * k, 0.4 * k, 0.3);
      cyl(0, 0, 0, 0.3, 0.42, PAL.coral, 0.8, 1);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.4, h = 0.75 + (i % 3) * 0.14;
        ball(Math.cos(a) * 0.2, 0.45 + h * 0.5, Math.sin(a) * 0.2, 0.17, h * 0.55, 0.12, i % 2 ? '#3fbf6f' : '#58d487', 1, 0, true);
      }
      ball(0, 0.95, 0, 0.2, 0.34, 0.2, '#58d487', 1, 0, true);
      st.pop();
    }

    /** Office water dispenser: jug on top, red & blue taps, drip tray. Stands on the left wall between the door and the counter. */
    function waterDispenser(x, z) {
      const S = ROOM.pcScale;
      st.push();
      st.translate(x, 0, z);
      st.scale(S);
      shadow(x, z, 0.55 * S, 0.5 * S, 0.3);
      blk(0, 0, 0, 0.55, 1.12, 0.5, '#f1f5fb', 0.1);
      blk(0.255, 0.55, 0, 0.06, 0.34, 0.34, '#d9e3f3', 0.03, 0); // recessed front
      blk(0.29, 0.66, -0.08, 0.1, 0.07, 0.07, '#ff5d73', 0.02, 0.2); // hot tap
      blk(0.29, 0.66, 0.08, 0.1, 0.07, 0.07, '#4cc3ff', 0.02, 0.2); // cold tap
      blk(0.29, 0.42, 0, 0.14, 0.04, 0.3, '#9aa3bd', 0.02, 0); // drip tray
      cyl(0, 1.1, 0, 0.23, 0.07, '#d9e3f3', 1); // neck
      cyl(0, 1.17, 0, 0.21, 0.5, '#9fe0ff', 0.9, 1, 0.25); // jug
      ball(0, 1.68, 0, 0.19, 0.12, 0.19, '#9fe0ff', 1, 0.25, true);
      ball(0.0, 1.38, 0.0, 0.06, 0.12, 0.06, '#d8f6ff', 0, 0.9, true); // bubble
      st.pop();
    }

    /** Magazine rack: slanted shelves of colourful covers. */
    function magazineRack(x, z) {
      const S = ROOM.pcScale;
      st.push();
      st.translate(x, 0, z);
      st.scale(S);
      shadow(x, z, 0.4 * S, 0.6 * S, 0.28);
      blk(-0.06, 0, 0, 0.14, 1.0, 0.82, PAL.woodDark, 0.05);
      const covers = ['#ff5d73', '#4cc3ff', '#ffd23f', '#7ee8b4', '#b49cff', '#ff9a5c'];
      for (let row = 0; row < 3; row++) {
        blk(0.05, 0.16 + row * 0.3, 0, 0.3, 0.04, 0.8, PAL.wood, 0.02);
        for (let i = 0; i < 4; i++) {
          st.push();
          st.translate(0.15, 0.2 + row * 0.3, -0.27 + i * 0.18);
          st.rotateZ(-0.35);
          blk(0, 0.12, 0, 0.03, 0.26, 0.15, covers[(row * 2 + i) % covers.length], 0.01, 0);
          st.pop();
        }
      }
      st.pop();
    }

    /** A vinyl-toy character figure for shelves and counters. */
    function figure(x, y, z, kind, ry = 0) {
      st.push();
      st.translate(x, y, z);
      st.rotateY(ry);
      const spec = { hero: ['#ff5d73', '#2f5d3a', '#f3bb8e'], wizard: ['#7a4dff', '#7a4dff', '#ffd9b8'], racer: ['#ffd23f', '#ff7a59', '#d99b6c'], robot: ['#9aa3bd', '#4cc3ff', '#d9e3f3'] }[kind];
      cyl(0, 0, 0, 0.12, 0.03, '#2a2150', 1);
      cyl(0, 0.03, 0, 0.07, 0.14, spec[0], 0.9);
      ball(0, 0.25, 0, 0.1, 0.1, 0.09, spec[2], 1, 0, true);
      if (kind === 'wizard') cyl(0, 0.3, 0, 0.1, 0.16, spec[1], 0.05);
      else if (kind === 'robot') { blk(0, 0.34, 0, 0.02, 0.07, 0.02, '#ffd23f', 0.005, 0); ball(0, 0.4, 0, 0.025, 0.025, 0.025, '#ff5d73', 0, 1, true); }
      else ball(0, 0.31, -0.01, 0.1, 0.05, 0.09, spec[1], 1, 0, true);
      ball(0.035, 0.26, 0.085, 0.015, 0.02, 0.01, '#251a3a', 0, 0, true);
      ball(-0.035, 0.26, 0.085, 0.015, 0.02, 0.01, '#251a3a', 0, 0, true);
      st.pop();
    }

    /** Articulated desk lamp. `on` lights the hood. */
    function deskLamp(x, y, z, on, ry = 0) {
      st.push();
      st.translate(x, y, z);
      st.rotateY(ry);
      cyl(0, 0, 0, 0.13, 0.04, '#2a2150', 1);
      st.push();
      st.rotateZ(0.5);
      cyl(0, 0.2, 0, 0.018, 0.4, '#9aa3bd', 1);
      st.translate(0, 0.4, 0);
      st.rotateZ(-1.2);
      cyl(0, 0.17, 0, 0.018, 0.34, '#9aa3bd', 1);
      st.translate(0, 0.34, 0);
      st.rotateZ(-0.9);
      cyl(0, 0.04, 0, 0.14, 0.14, '#ffd23f', 0.45, 1, on * 0.5);
      ball(0, 0.0, 0, 0.07, 0.04, 0.07, on > 0.1 ? '#fff3b0' : '#e8e0c0', 0, on, true);
      st.pop();
      st.pop();
    }

    /** The retro "kaunter" PC: a small beige CRT facing the customers (+x) whose screen shows the price list. */
    function posComputer(x, y, z, power) {
      st.push();
      st.translate(x, y, z);
      blk(0, 0, 0, 0.5, 0.05, 0.46, PAL.beige, 0.03); // base plate
      cyl(0, 0.05, 0, 0.1, 0.05, PAL.beige, 0.95); // swivel
      blk(0.02, 0.1, 0, 0.14, 0.42, 0.5, PAL.cream, 0.08); // bezel
      blk(-0.2, 0.13, 0, 0.3, 0.34, 0.4, PAL.beige, 0.1); // CRT tube behind the glass
      blk(0.1, 0.14, 0, 0.04, 0.34, 0.4, power ? '#143a22' : '#232a4a', 0.04, 0, power ? 0.5 : 0);
      if (power) {
        st.push();
        st.translate(0.131, 0.31, 0);
        st.rotateY(Math.PI / 2);
        putSpecial('sign', meshes.planeXY(), 0.38, 0.28, 1, '#ffffff', '#ffffff', SIGNS.pos.tex, 0.95);
        st.pop();
      }
      blk(0.32, 0.0, 0, 0.2, 0.03, 0.4, PAL.cream, 0.02); // keyboard
      blk(0.52, 0.0, 0.3, 0.07, 0.03, 0.1, PAL.cream, 0.02); // mouse
      st.pop();
    }

    /* ------------------------------------------------------------------ the room */
    function drawRoom(s, dt) {
      const L = R.light;
      const W = R.roomW, D = ROOM.depth, H = ROOM.wallHeight, t = R.t;
      const dark = R.dark;
      const power = s.powerOutage <= 0;
      const lampsOn = power ? L.lamps : 0;
      const neonAmt = power ? L.neon * (L.night > 0.5 && Math.sin(t * 2.7) > 0.985 ? 0.35 : 1) : 0.02;

      // diorama base: plinth, slab and the checkered floor
      blk(W / 2, -0.95, D / 2, W + 1.0, 0.4, D + 1.0, PAL.plinth, 0.16);
      blk(W / 2, -0.55, D / 2, W + 0.6, 0.55, D + 0.6, PAL.slab, 0.16);
      st.push();
      st.translate(W / 2, 0.006, D / 2);
      putSpecial('floor', meshes.planeXZ(), W, 1, D, PAL.floorA, PAL.floorB, null, 0);
      st.pop();

      // walls (back + left), trims and wainscot
      blk(W / 2, 0, -0.15, W + 0.6, H, 0.3, PAL.wall, 0.08);
      blk(-0.15, 0, D / 2, 0.3, H, D + 0.6, PAL.wall, 0.08);
      blk(W / 2, H - 0.12, -0.15, W + 0.7, 0.2, 0.44, PAL.wallTrim, 0.09);
      blk(-0.15, H - 0.12, D / 2, 0.44, 0.2, D + 0.7, PAL.wallTrim, 0.09);
      blk(-0.15, 0, -0.15, 0.48, H + 0.06, 0.48, PAL.wallTrim, 0.1);
      blk(W / 2, 0, 0.07, W, 1.0, 0.14, PAL.wainscot, 0.05, 0.5);
      blk(W / 2, 0.98, 0.08, W, 0.1, 0.18, PAL.rail, 0.04, 0.5);
      blk(0.07, 0, D / 2, 0.14, 1.0, D, PAL.wainscot, 0.05, 0.5);
      blk(0.08, 0.98, D / 2, 0.18, 0.1, D, PAL.rail, 0.04, 0.5);

      // windows on the back wall: glass takes the colour of the sky outside, stars appear at night
      const glass = L.glass;
      const glassHex = '#' + glass.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
      const winXs = [3.9, 8.4].filter((wx) => wx <= W - 1.2);
      for (const wx of winXs) {
        blk(wx, 1.18, 0.1, 2.0, 1.58, 0.16, PAL.rail, 0.07);
        blk(wx, 1.3, 0.16, 1.7, 1.34, 0.08, glassHex, 0.04, 0, 0.9);
        blk(wx, 1.3, 0.22, 0.07, 1.34, 0.06, PAL.rail, 0.02, 0);
        blk(wx, 1.9, 0.22, 1.7, 0.07, 0.06, PAL.rail, 0.02, 0);
        if (L.night < 0.5) {
          ball(wx - 0.38, 2.05, 0.21, 0.3, 0.13, 0.04, '#ffffff', 0, 0.9 * (1 - L.night * 1.6), true);
          ball(wx + 0.42, 1.62, 0.21, 0.22, 0.1, 0.04, '#ffffff', 0, 0.9 * (1 - L.night * 1.6), true);
        } else {
          for (let i = 0; i < 6; i++) ball(wx - 0.6 + ((i * 0.53) % 1.3), 1.65 + ((i * 0.37) % 0.55), 0.21, 0.02, 0.02, 0.01, '#fff8d0', 0, 1, true);
        }
        blk(wx - 1.12, 1.08, 0.2, 0.3, 1.6, 0.1, PAL.coral, 0.1);
        blk(wx + 1.12, 1.08, 0.2, 0.3, 1.6, 0.1, PAL.coral, 0.1);
        // the sun comes in as a soft patch on the floor, stretching and turning orange towards evening
        const [px, py, pz] = L.patch;
        const elev = Math.max(0.35, L.shadow[1]);
        const reach = 1 / elev;
        putDecal('patch', wx - L.shadow[0] * 1.9 * reach * 0.55, 1.15 + reach * 1.25 - L.shadow[2] * 0.0, 1.05, 0.55 + reach * 0.45, [px, py, pz], L.patch[3] * (power ? 1 : 0.2), 0.12);
      }
      eng.cast(false);

      sign('gameon', 1.5, 1.95, 0.2, 0.95, 1.2);
      if (W > 10.5) sign('nolag', 6.15, 1.95, 0.2, 1.0, 1.25);
      sign('buka', 2.75, 2.55, 0.2, 0.9, 0.45);

      // wall clock shows the in-game time
      const clockX = Math.min(W - 1.0, 10.7), minutes = CFG.DAY_START_MINUTES + s.elapsed * CFG.GAME_MINUTE_RATE;
      st.push();
      st.translate(clockX, 2.5, 0.18);
      st.rotateX(Math.PI / 2);
      cyl(0, 0, 0, 0.42, 0.14, PAL.cream, 1, 1);
      st.pop();
      st.push();
      st.translate(clockX, 2.5, 0.27);
      st.rotateZ(-((minutes / 60) % 12) / 12 * TAU);
      blk(0, -0.03, 0, 0.07, 0.2, 0.03, PAL.navy, 0.02, 0);
      st.pop();
      st.push();
      st.translate(clockX, 2.5, 0.29);
      st.rotateZ(-((minutes % 60) / 60) * TAU);
      blk(0, -0.03, 0, 0.05, 0.3, 0.03, PAL.coral, 0.02, 0);
      st.pop();

      // wall fan
      st.push();
      st.translate(2.55, 2.45, 0.34);
      ball(0, 0, 0, 0.1, 0.1, 0.1, PAL.cream, 1, 0, true);
      st.rotateZ(t * 3.2);
      for (let k = 0; k < 4; k++) {
        st.push();
        st.rotateZ((k * Math.PI) / 2);
        blk(-0.08, 0.06, 0, 0.16, 0.5, 0.03, '#9ad8d1', 0.03, 1);
        st.pop();
      }
      st.pop();

      // back wall: two tube lights, a wall socket strip and the emergency beacon
      for (const lx of [5.55, Math.max(7.2, W - 3.4)]) {
        blk(lx, 2.9, 0.12, 1.2, 0.12, 0.12, '#e8edf5', 0.05, 0);
        blk(lx, 2.9, 0.19, 1.05, 0.07, 0.05, lampsOn > 0.1 ? '#fff6d0' : '#d9dce6', 0.02, lampsOn);
        wallHalo('z', lx, 2.55, 0, 1.3, 0.9, [1, 0.9, 0.6], lampsOn * 0.42);
      }
      const beacon = !power;
      blk(W - 0.9, 3.0, 0.14, 0.22, 0.2, 0.2, '#5b4a6a', 0.05, 0);
      ball(W - 0.9, 3.04, 0.27, 0.11, 0.11, 0.07, beacon ? (Math.sin(t * 6) > 0 ? '#ff4d5e' : '#a02a38') : '#6a3a44', 0, beacon ? 1 : 0, true);
      if (beacon) wallHalo('z', W - 0.9, 2.55, 0, 1.6, 1.2, [1, 0.2, 0.25], 0.45 + 0.25 * Math.sin(t * 6));

      // left wall: neon, door, counter, posters, fuse box, light switch
      const neonE = clamp(0.35 + neonAmt * 0.5, 0, 1.25);
      sign('neon', 0.18, 2.1, 5.6, 3.0, 0.94, Math.PI / 2, neonE);
      glow(0.9, 5.6, 1.6, 1.0, '#7ff3ff', 0.12 + neonAmt * 0.28);
      wallHalo('x', 0, 2.1, 5.6, 0.8, 2.1, [0.45, 0.95, 1], neonAmt * 0.22);
      drawDoor(s, dt);
      drawCounter(s, lampsOn, power);
      sign('posterFps', 0.19, 2.05, 3.55, 0.62, 0.82, Math.PI / 2, 0.25);
      sign('posterMmo', 0.19, 2.1, 7.5, 0.55, 0.74, Math.PI / 2, 0.25);
      sign('posterRace', 0.19, 1.55, 8.05, 0.42, 0.56, Math.PI / 2, 0.25);
      if (S_has(s, 'poster')) {
        sign('posterToon', 4.95, 2.0, 0.2, 0.5, 0.66, 0, 0.25);
        if (S_count(s, 'poster') > 1) sign('posterFps', 1.0, 1.2, 0.2, 0.4, 0.52, 0, 0.25);
      }
      sign('posterToon', 0.19, 1.75, 8.55, 0.4, 0.54, Math.PI / 2, 0.25);
      drawFuseBox(s, power);
      blk(0.1, 1.2, 2.3, 0.05, 0.16, 0.1, '#f6f6fb', 0.02, 0); // light switch
      blk(0.13, 1.22, 2.3, 0.03, 0.06, 0.04, '#ffd23f', 0.01, 0);
      // toy figures on a wall shelf
      blk(0.2, 1.5, 11.15, 0.26, 0.05, 0.5, PAL.wood, 0.02, 0);
      figure(0.2, 1.53, 11.02, 'hero', Math.PI / 2);
      figure(0.2, 1.53, 11.18, 'wizard', Math.PI / 2);
      figure(0.2, 1.53, 11.34, 'robot', Math.PI / 2);

      // rugs & floor markings
      blk(1.1, 0, 1.3, 1.5, 0.035, 1.55, '#8a6bd6', 0.015, 0);
      drawQueueLane(s, dt);
      const carpetFrom = 3.2, carpetTo = W - 1.0;
      blk((carpetFrom + carpetTo) / 2, 0, ROOM.rowY[0] + 0.4, carpetTo - carpetFrom, 0.03, 2.9, '#cdbdff', 0.015, 0);
      if (s.pcs.length > ROOM.perRow) blk((carpetFrom + carpetTo) / 2, 0, ROOM.rowY[1] + 0.4, carpetTo - carpetFrom, 0.03, 2.9, '#bfe5ff', 0.015, 0);

      // lived-in corners: plants, water dispenser, magazine rack (all clear of lanes and desks)
      eng.cast(true);
      plant(4.4, 10.9, 0.85);
      plant(W - 0.65, 3.65, 0.76);
      waterDispenser(ROOM.dispenser.x, ROOM.dispenser.y);
      magazineRack(ROOM.rack.x, ROOM.rack.y);
      eng.cast(false);

      // repair corner and optional upgrades
      eng.cast(true);
      drawRepairCorner(s, W, D);
      eng.cast(false);
      eng.cast(true);
      if (S_has(s, 'snack')) drawSnackMachine(W, lampsOn);
      if (S_has(s, 'portable')) drawPortableAircond(W, t, power);
      if (S_has(s, 'generator')) drawGenerator(s, t);
      if (s.assistant) drawMopBucket(s);
      eng.cast(false);
      if (S_has(s, 'fan')) drawCeilingFan(dt, power);
      if (S_has(s, 'aircond')) drawAircond(W, t);
      if (S_has(s, 'cctv')) drawCCTV(W, t);
    }
    const S_count = (s, id) => (s.perks || []).filter((x) => x === id).length;
    const S_has = (s, id) => S_count(s, id) > 0;

    function drawDoor(s, dt) {
      const near = s.customers.some((c) => c.x < 1.7 && c.y < 2.6 && (c.status === 'arriving' || c.status === 'leaving' || c.status === 'officer' || c.status === 'event'));
      R.doorOpen = damp(R.doorOpen, near ? 1 : 0, 7, dt);
      const o = R.doorOpen;
      const L = R.light;
      const outside = '#' + L.glass.map((v) => Math.round(clamp(v * 1.05, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
      blk(0.1, 0, 1.3, 0.22, 2.45, 1.7, '#ff9a5c', 0.06);
      blk(0.13, 0.0, 1.3, 0.06, 2.12, 1.28, outside, 0.02, 0, 1); // the sky outside the door
      for (const side of [-1, 1]) blk(0.2, 0, 1.3 + side * (0.3 + 0.42 * o), 0.07, 2.1, 0.62, '#9ee4ff', 0.03, 1, 0.55);
      sign('masuk', 0.22, 2.38, 1.3, 0.95, 0.36, Math.PI / 2, 0.5);
      blk(0.75, 0, 1.3, 0.9, 0.03, 1.4, '#8a6bd6', 0.015, 0);
    }

    function drawFuseBox(s, power) {
      const F = ROOM.fuse;
      const ev = (s.worldEvents || []).find((e) => e.type === 'blackout');
      const t = R.t;
      blk(F.x, F.y - 0.3, F.z, 0.12, 0.62, 0.5, '#5a6478', 0.04);
      blk(F.x + 0.07, F.y - 0.27, F.z, 0.04, 0.54, 0.42, ev ? '#7d8aa3' : '#9aa6bd', 0.03, 0);
      ball(F.x + 0.1, F.y + 0.12, F.z + 0.12, 0.03, 0.03, 0.03, power ? '#58ff8a' : Math.sin(t * 8) > 0 ? '#ff4d5e' : '#7a2a35', 0, 1, true);
      sign('fuse', F.x + 0.1, F.y - 0.02, F.z - 0.08, 0.2, 0.2, Math.PI / 2, 0.4);
      if (ev) {
        // sparks and a pulsing ring so the broken thing is easy to find
        if (Math.sin(t * 9) > 0.4) burst('spark', F.x + 0.25, F.y, F.z, 1);
        flatRing(F.spot.x, F.spot.y, 0.55 + Math.sin(t * 5) * 0.05, '#ffe14d');
      }
    }

    function drawCounter(s, lampsOn, power) {
      const c = ROOM.counter, len = c.y1 - c.y0, mid = (c.y0 + c.y1) / 2, till = ROOM.queueSlot(0).y;
      eng.cast(true);
      shadow(c.x + 0.2, mid, 0.9, len / 2 + 0.4, 0.28);
      // rounded wooden counter with a front panel, plinth and a lighter top
      blk(c.x, 0, mid, c.depth, 1.0, len, '#ff9a5c', 0.14);
      blk(c.x + 0.04, 1.0, mid, c.depth + 0.14, 0.12, len + 0.14, PAL.rail, 0.07);
      blk(c.x + 0.5, 0.18, mid, 0.06, 0.6, len - 0.5, '#ffbd8a', 0.03, 0);
      blk(c.x + 0.49, 0.06, mid, 0.05, 0.1, len - 0.2, '#c9703a', 0.02, 0);
      const top = 1.12;
      // ---- old-style computer (price list faces the customers)
      posComputer(c.x + 0.02, top, c.y0 + 0.6, power);
      // ---- desk lamp
      deskLamp(c.x - 0.18, top, c.y0 + 1.25, lampsOn > 0.05 && power ? Math.max(0.35, lampsOn) : 0.0, -0.4);
      // ---- cartoon figures
      figure(c.x + 0.1, top, c.y0 + 1.75, 'racer', Math.PI / 2);
      figure(c.x + 0.25, top, c.y0 + 1.95, 'hero', Math.PI / 2 + 0.3);
      // ---- stationery pot with pens
      cyl(c.x + 0.05, top, c.y0 + 2.45, 0.1, 0.2, '#ff5d73', 0.95);
      ['#4cc3ff', '#ffd23f', '#7ee8b4'].forEach((col, i) => {
        st.push();
        st.translate(c.x + 0.05, top + 0.2, c.y0 + 2.45);
        st.rotateX((i - 1) * 0.28);
        st.rotateZ((i - 1) * 0.2);
        cyl(0, 0.1, 0, 0.015, 0.24, col, 1);
        st.pop();
      });
      // ---- stacked CDs
      for (let i = 0; i < 5; i++) {
        const cdCol = ['#e8eef8', '#bfe5ff', '#ffe27a', '#e8eef8', '#ffc1d6'][i];
        st.push();
        st.translate(c.x + 0.08, top + 0.025 * i, c.y0 + 2.9);
        st.rotateY(i * 0.4);
        cyl(0, 0, 0, 0.17, 0.022, cdCol, 1, 1, 0.12);
        st.pop();
      }
      // ---- cash register at the head of the queue, then bell and candy jar
      blk(c.x + 0.02, top, till, 0.52, 0.28, 0.5, '#5b6bff', 0.08);
      blk(c.x + 0.07, top + 0.28, till, 0.36, 0.22, 0.34, power ? '#bfe5ff' : '#4a5470', 0.05, power ? 1 : 0, power ? 0.5 : 0);
      ball(c.x + 0.12, top + 0.13, till - 0.65, 0.12, 0.06, 0.12, PAL.yellow, 1); // service bell
      cyl(c.x - 0.05, top, till + 0.62, 0.2, 0.36, '#bfe5ff', 1, 1, 0.3);
      ball(c.x - 0.05, top + 0.2, till + 0.62, 0.15, 0.1, 0.15, PAL.pink, 1, 0, true);
      if (S_has(s, 'runner')) { // "Abang Laju" energy drink can
        cyl(c.x + 0.1, top, till - 1.1, 0.06, 0.2, '#ff5d73', 1, 1, 0.2);
        blk(c.x + 0.1, top + 0.2, till - 1.1, 0.04, 0.02, 0.04, '#ffd23f', 0.005, 0);
      }
      eng.cast(false);
      sign('kaunter', 0.2, 2.1, mid, 1.9, 0.64, Math.PI / 2, 0.45);
      if (lampsOn > 0.05 && power) glow(c.x + 0.1, c.y0 + 1.3, 1.1, 0.9, '#ffd98a', 0.28 * lampsOn);
    }

    /* Queue lane: runner rug, slot markers, direction chevrons and the red-rope-on-chrome-stanchion divider.
       A rope segment drops to the floor while somebody steps across it. */
    const CHROME = '#d5dbe6';
    function stanchion(x, z) {
      shadow(x, z, 0.22, 0.22, 0.3);
      cyl(x, 0, z, 0.17, 0.05, CHROME, 1, 1);
      cyl(x, 0.05, z, 0.035, 0.88, CHROME, 1, 1);
      ball(x, 0.97, z, 0.075, 0.075, 0.075, CHROME, 1, 0, true);
    }
    function rope(x0, z0, x1, z1, open) {
      const N = 9, top = 0.9, sag = 0.1 + open * 0.78;
      for (let j = 0; j <= N; j++) {
        const u = j / N, hang = 1 - (2 * u - 1) * (2 * u - 1);
        ball(x0 + (x1 - x0) * u, Math.max(0.07, top - sag * hang), z0 + (z1 - z0) * u, 0.05, 0.05, 0.05, '#e0243a', 1, 0.12, true);
      }
    }
    function drawQueueLane(s, dt) {
      const Q = ROOM.queue, slots = CFG.MAX_QUEUE;
      const tail = ROOM.queueSlot(slots - 1).y, head = ROOM.queueSlot(0).y;
      blk(Q.x, 0, (tail + head) / 2, Q.right - Q.left - 0.1, 0.03, head - tail + 1.1, '#ffb0a0', 0.015, 0);
      for (let i = 0; i < slots; i++) {
        const q = ROOM.queueSlot(i);
        st.push();
        st.translate(q.x, 0.045, q.y);
        ball(0, 0, 0, 0.36, 0.012, 0.36, i === 0 ? '#ffe14d' : '#fff3d1', 0, 0.3, true);
        st.pop();
      }
      for (let i = 0; i < slots - 1; i++) {
        const z = ROOM.queueSlot(i).y - Q.gap / 2;
        for (const side of [-1, 1]) {
          st.push();
          st.translate(Q.x + side * 0.14, 0.05, z - 0.08);
          st.rotateY(side * 0.8);
          blk(0, 0, 0, 0.3, 0.012, 0.07, '#fff3d1', 0.005, 0, 0.25);
          st.pop();
        }
      }
      eng.cast(true);
      const postZ = [];
      for (let z = Q.entryY + 0.25; z <= head - 0.4; z += 0.9) postZ.push(z);
      for (const z of postZ) stanchion(Q.right, z);
      stanchion(Q.left, postZ[0]);
      for (let i = 0; i < postZ.length - 1; i++) {
        const z0 = postZ[i], z1 = postZ[i + 1];
        let want = 0;
        const crossing = (e) => Math.abs(e.x - Q.right) < 0.22 && e.y > z0 - 0.25 && e.y < z1 + 0.25 && (e.moveIntensity || 0) > 0.05;
        if (crossing(s.player) || s.customers.some(crossing)) want = 1;
        R.ropeOpen[i] = damp(R.ropeOpen[i] || 0, want, 9, dt);
        rope(Q.right, z0, Q.right, z1, R.ropeOpen[i]);
      }
      eng.cast(false);
    }

    function drawRepairCorner(s, W, D) {
      const x = W - 1.7, z = D - 0.85;
      shadow(x, z, 1.4, 0.7, 0.3);
      blk(x, 0, z, 2.3, 0.95, 0.9, '#a9783e', 0.1);
      blk(x, 0.95, z, 2.42, 0.12, 1.02, '#e2b16a', 0.06);
      blk(x - 0.6, 1.07, z, 0.5, 0.18, 0.4, '#7d93a8', 0.05);
      blk(x + 0.1, 1.07, z + 0.1, 0.28, 0.1, 0.5, PAL.coral, 0.04);
      cyl(x + 0.55, 1.07, z - 0.1, 0.14, 0.26, PAL.yellow, 1, 1);
      if (S_count(s, 'router') > 0) {
        blk(x + 0.85, 1.07, z, 0.5, 0.12, 0.3, PAL.navy, 0.05);
        for (const dx of [-0.17, 0.17]) cyl(x + 0.85 + dx, 1.19, z, 0.025, 0.55, '#9ee4ff', 1, 1);
        ball(x + 0.76, 1.2, z + 0.12, 0.03, 0.03, 0.03, '#7bff9e', 0, 1, true);
      }
      if (S_has(s, 'printer')) {
        blk(x - 0.05, 1.07, z - 0.25, 0.8, 0.34, 0.45, PAL.cream, 0.08);
        blk(x - 0.05, 1.42, z - 0.28, 0.5, 0.03, 0.3, '#ffffff', 0.01, 0);
      }
      if (S_has(s, 'filter')) { // firewall box with a shield sticker
        blk(x - 0.05, 1.07, z + 0.3, 0.46, 0.12, 0.26, '#3a4a9a', 0.05);
        ball(x - 0.05, 1.2, z + 0.34, 0.05, 0.05, 0.02, '#7bff9e', 0, 1, true);
        ball(x - 0.2, 1.2, z + 0.34, 0.035, 0.035, 0.02, '#ffd23f', 0, 1, true);
      }
      if (S_has(s, 'spares')) { // spare-parts rack above the bench
        blk(x - 0.7, 1.6, z - 0.3, 0.9, 0.05, 0.3, PAL.woodDark, 0.02, 0);
        blk(x - 0.7, 2.0, z - 0.3, 0.9, 0.05, 0.3, PAL.woodDark, 0.02, 0);
        ['#ff7a6b', '#4cc3ff', '#ffd23f', '#7ee8b4'].forEach((col, i) => {
          blk(x - 1.0 + i * 0.2, 1.65, z - 0.3, 0.16, 0.2, 0.2, col, 0.03, 0);
          blk(x - 1.0 + i * 0.2, 2.05, z - 0.3, 0.16, 0.14, 0.2, col, 0.03, 0);
        });
      }
      for (const dx of [-0.55, 0.55]) blk(x + dx, 1.07, z - 0.32, 0.06, 0.55, 0.06, PAL.navy, 0.02, 0);
      sign('parts', x, 1.78, z - 0.32, 1.3, 0.34, 0, 0.5);
    }

    function drawSnackMachine(W, lampsOn) {
      const S = ROOM.pcScale;
      st.push();
      st.translate(W - 0.9, 0, 0.55);
      st.scale(S);
      shadow(W - 0.9, 0.7, 0.8 * S, 0.6 * S, 0.3);
      blk(0, 0, 0, 0.95, 2.05, 0.8, PAL.coral, 0.1);
      blk(0, 0.5, 0.35, 0.72, 1.15, 0.12, '#bfe5ff', 0.05, 1, 0.4 + lampsOn * 0.3);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) ball(-0.22 + c * 0.22, 0.7 + r * 0.26, 0.43, 0.08, 0.1, 0.05, ['#ffd23f', '#7ee8b4', '#ff8fc0', '#b49cff'][(r + c) % 4], 0, 0.2, true);
      blk(0, 0.12, 0.4, 0.5, 0.2, 0.08, PAL.navy, 0.04);
      st.pop();
      sign('snack', W - 0.9, 2.28 * S - 0.04, 0.95, 0.8, 0.3, 0, 0.5);
      glow(W - 0.9, 1.25, 1.1, 0.8, '#bfe5ff', 0.1 + lampsOn * 0.18);
    }

    function drawAircond(W, t) {
      const x = W - 3.2;
      blk(x, 2.35, 0.3, 1.6, 0.5, 0.5, PAL.cream, 0.14);
      blk(x, 2.38, 0.56, 1.3, 0.07, 0.05, '#9ad8d1', 0.02, 0);
      for (let k = 0; k < 3; k++) {
        const a = 0.18 + 0.1 * Math.sin(t * 2 + k);
        ring(x - 0.4 + k * 0.4, 1.95, 0.62, 0.2, 0.025, '#bff4ff', 0, 1, Math.PI * (0.8 + a));
      }
    }

    /** Kipas Siling: the room has no ceiling, so the fan hangs from a rafter that juts out of the back wall. It spins down in a blackout. */
    function drawCeilingFan(dt, power) {
      R.fanSpeed = damp(R.fanSpeed || 0, power ? 9 : 0, 1.6, dt);
      R.fanAngle = ((R.fanAngle || 0) + R.fanSpeed * dt) % TAU;
      const x = ROOM.firstColumnX + ROOM.columnGap * 1.5, z = 1.1;
      blk(x, 3.02, z / 2, 0.14, 0.13, z, PAL.woodDark, 0.03); // rafter
      cyl(x, 2.62, z, 0.03, 0.42, PAL.navy, 1, 1); // rod
      cyl(x, 2.5, z, 0.13, 0.13, '#ffd23f', 1, 1); // motor
      st.push();
      st.translate(x, 2.55, z);
      st.rotateY(R.fanAngle);
      for (let k = 0; k < 4; k++) {
        st.push();
        st.rotateY((k * TAU) / 4);
        blk(0.56, 0, -0.1, 0.8, 0.035, 0.2, '#f1e3bd', 0.015, 1);
        st.pop();
      }
      st.pop();
    }

    /** Aircond Mudah Alih: a wheeled floor unit on the right edge of the room with a hose, a little display and a drip tray. */
    function drawPortableAircond(W, t, power) {
      const x = W - 0.7, z = 2.35;
      shadow(x, z, 0.5, 0.42, 0.3);
      blk(x, 0.14, z, 0.52, 0.95, 0.46, '#f4f1e8', 0.12);
      blk(x, 0.78, z + 0.235, 0.4, 0.14, 0.03, '#9ad8d1', 0.02, 0); // vent slats
      blk(x, 0.5, z + 0.235, 0.3, 0.1, 0.03, PAL.navy, 0.02, 0); // display
      ball(x + 0.12, 0.35, z + 0.25, 0.025, 0.025, 0.025, power ? '#58ff8a' : '#7a2a35', 0, 1, true);
      for (const [dx, dz] of [[-0.18, -0.14], [0.18, -0.14], [-0.18, 0.14], [0.18, 0.14]]) ball(x + dx, 0.07, z + dz, 0.07, 0.07, 0.07, PAL.navy, 1, 0, true);
      cyl(x - 0.16, 1.09, z - 0.05, 0.06, 0.55, '#b9c3cf', 1, 1); // exhaust hose
      blk(x - 0.16, 1.62, z - 0.05, 0.22, 0.08, 0.14, '#b9c3cf', 0.03);
      blk(x - 0.05, 0, z + 0.55, 0.42, 0.012, 0.26, '#8fd8ff', 0.004, 0, 0.15); // the puddle it drips into
      ball(x - 0.05, 0.4 - ((t * 0.9) % 1) * 0.36, z + 0.5, 0.022, 0.035, 0.022, '#8fd8ff', 0, 0.5, true);
    }

    /** Generator: a red diesel genset by the left wall with a fuel can and an exhaust that smokes and shakes while it runs. */
    function drawGenerator(s, t) {
      const running = s.powerOutage > 0;
      const x = 0.58 + (running ? Math.sin(t * 55) * 0.006 : 0), z = 3.65;
      shadow(0.58, z, 0.55, 0.62, 0.3);
      blk(x, 0.1, z, 0.7, 0.56, 0.88, '#e0483a', 0.1);
      blk(x, 0.66, z, 0.6, 0.06, 0.78, PAL.navy, 0.03); // top frame
      for (const dz of [-0.36, 0.36]) blk(x, 0, z + dz, 0.74, 0.1, 0.1, PAL.navy, 0.03); // skids
      blk(x + 0.36, 0.28, z, 0.04, 0.3, 0.52, PAL.navy, 0.02, 0); // control panel (faces the room)
      ball(x + 0.39, 0.4, z - 0.12, 0.05, 0.05, 0.05, running ? '#58ff8a' : '#ffd23f', 0, 1, true);
      ball(x + 0.39, 0.4, z + 0.12, 0.05, 0.05, 0.05, '#9ad8d1', 0, 0.4, true);
      cyl(x - 0.22, 0.7, z - 0.26, 0.05, 0.36, '#505a6e', 1, 1); // exhaust
      blk(x + 0.1, 0.72, z + 0.2, 0.3, 0.3, 0.2, '#ffd23f', 0.04); // jerrycan
      blk(x + 0.1, 1.02, z + 0.2, 0.08, 0.06, 0.08, PAL.navy, 0.02, 0);
      if (running && Math.sin(t * 14) > 0.6) burst('smoke', x - 0.22, 1.1, z - 0.26, 1);
    }

    /** The assistant's corner: a yellow mop bucket with a mop leaning against the wall. */
    function drawMopBucket(s) {
      const B = ROOM.assistantBucket;
      shadow(B.x, B.y, 0.34, 0.34, 0.28);
      cyl(B.x, 0, B.y, 0.2, 0.34, '#ffd23f', 0.82, 1);
      cyl(B.x, 0.3, B.y, 0.185, 0.04, '#6d7284', 1, 0);
      blk(B.x - 0.12, 0.34, B.y + 0.02, 0.05, 0.9, 0.05, '#c9a066', 0.02, 0);
      blk(B.x - 0.12, 0.2, B.y + 0.02, 0.26, 0.08, 0.2, '#ffffff', 0.04);
      ball(B.x + 0.16, 0.2, B.y + 0.12, 0.05, 0.04, 0.02, '#ff7ac6', 0, 0.3, true);
    }

    function drawCCTV(W, t) {
      st.push();
      st.translate(W - 1.7, 2.85, 0.32);
      cyl(0, 0, 0, 0.05, 0.3, '#b9c3cf', 1, 1);
      st.rotateY(Math.sin(t * 0.5) * 0.5);
      blk(0, -0.2, 0.1, 0.3, 0.22, 0.46, PAL.cream, 0.08);
      ball(0, -0.09, 0.36, 0.07, 0.07, 0.04, PAL.navy, 0, 0);
      ball(0.1, -0.12, 0.28, 0.04, 0.04, 0.04, Math.sin(t * 4) > 0 ? '#ff4d5e' : '#7a2a35', 0, 1, true);
      st.pop();
    }

    return { drawRoom, sign, SIGNS, wallHalo, figure, plant, SIGNS_READY: () => R.signsReady };
  };
})(window.ABCC);
