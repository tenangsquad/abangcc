/* ==========================================================================
   3h. SCENE — draws the cyber café from game state with the engine
   --------------------------------------------------------------------------
   Orchestrates the parts: lighting (time of day) → camera → room & props → PCs →
   world events → people → particles. The camera is a fixed isometric orthographic
   view with optional gentle zoom/pan (never rotation).
   ========================================================================== */
(function (ns) {
  'use strict';

  const { CFG, ROOM, FAULTS, clamp, lerp, damp, byId } = ns;
  const E = ns.GfxEngine;
  const TAU = Math.PI * 2;

  const PAL = {
    wall: '#86dccf', wallTrim: '#fff3d1', wainscot: '#ffd36e', rail: '#fff3d1',
    floorA: '#fbe9c6', floorB: '#f3d6a4', slab: '#c98f58', plinth: '#83523f',
    wood: '#eaa968', woodDark: '#c98547', cream: '#fff1d6', beige: '#efe2c0', coral: '#ff7a6b',
    mint: '#7ee8b4', sky: '#59c7ff', yellow: '#ffcf3d', violet: '#8c6cff', pink: '#ff8fc0', navy: '#2a2150',
    chairs: ['#ff8fb8', '#59c7ff', '#7ee8b4', '#ffcf3d', '#b49cff', '#ff9a5c', '#4fe0d0', '#ff7a6b', '#8fd14f', '#ff6fb5'],
  };

  function create(canvas) {
    const eng = E.create(canvas);
    if (!eng) return null;
    const { stack: st, meshes, put, putDecal, putDecalM, putSpecial, frame } = eng;
    const VIEW_DIR = E.norm3([1, 1.22, 1]);
    frame.view = VIEW_DIR;
    frame.sun = E.norm3([0.3, 1.0, 0.8]);

    const R = {
      t: 0,
      roomW: ROOM.minWidth,
      dark: 0,
      tint: [1, 1, 1],
      light: ns.Lighting.at(CFG.DAY_START_MINUTES),
      doorOpen: 0,
      cssW: 1, cssH: 1, pxPerUnit: 30,
      vp: new Float32Array(16),
      cam: null,
      zoom: 1, pan: { x: 0, y: 0 },
      quality: 'high',
      anchors: { pcs: [], people: [], events: [] },
      poses: new Map(),
      pcAnim: new Map(),
      ropeOpen: [],
      particles: [],
      lastNow: 0,
      signsReady: false,
      hover: null,
      lastSky: -1,
    };

    /* ----------------------------------------------------------------------
       Primitive helpers (all positions are relative to the current transform)
       ---------------------------------------------------------------------- */
    const ball = (x, y, z, rx, ry, rz, col, out = 1, emis = 0, low = false) => put(low ? meshes.sphereLow() : meshes.sphere(), col, x, y, z, rx, ry, rz, emis, out);
    const cyl = (x, y, z, r, h, col, k = 1, out = 1, emis = 0) => put(meshes.cyl(k), col, x, y + h / 2, z, r, h, r, emis, out);
    const blk = (x, y, z, w, h, d, col, r = 0.05, out = 1, emis = 0) => put(meshes.box(w, h, d, r), col, x, y + h / 2, z, 1, 1, 1, emis, out);
    const ring = (x, y, z, major, thick, col, out = 1, emis = 0, arc = TAU) => put(meshes.torus(thick / major, arc), col, x, y, z, major, major, major, emis, out);
    const shadow = (x, z, rx, rz, a = 0.34) => putDecal('shadow', x, z, rx * 2, rz * 2, '#000', a);
    const glow = (x, z, rx, rz, col, a) => putDecal('glow', x, z, rx * 2, rz * 2, col, a);
    const flatRing = (x, z, r, col, thick = 0.07) => {
      st.push();
      st.translate(x, 0.035, z);
      st.rotateX(Math.PI / 2);
      ring(0, 0, 0, r, thick, col, 0, 1);
      st.pop();
    };

    /* ----------------------------------------------------------------------
       Camera: orthographic, auto-fitted to the (growing) room, optional zoom
       ---------------------------------------------------------------------- */
    function setupCamera() {
      const W = R.roomW, D = ROOM.depth, H = ROOM.wallHeight;
      const center = [W / 2, 0.6, D / 2];
      const eye = center.map((c, i) => c + VIEW_DIR[i] * 60);
      const view = E.lookAt(eye, center);
      const corners = [[-0.4, -0.9, -0.4], [W + 0.4, -0.9, -0.4], [-0.4, -0.9, D + 0.4], [W + 0.4, -0.9, D + 0.4], [-0.4, H, -0.4], [W + 0.4, H, -0.4], [-0.4, H, D + 0.4], [W, 2.4, D]];
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (const [x, y, z] of corners) {
        const vx = view[0] * x + view[4] * y + view[8] * z + view[12];
        const vy = view[1] * x + view[5] * y + view[9] * z + view[13];
        minX = Math.min(minX, vx); maxX = Math.max(maxX, vx);
        minY = Math.min(minY, vy); maxY = Math.max(maxY, vy);
      }
      const aspect = R.cssW / R.cssH;
      const spanX = maxX - minX + 0.15, spanY = maxY - minY + 0.45; // tight fit: the room fills the window
      const fullH = Math.max(spanY, spanX / aspect), fullW = fullH * aspect;
      let viewH = fullH, viewW = fullW;
      let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2 + 0.25;
      if (R.focus) {
        // Debug / cinematic close-up: centre on a floor point and zoom in.
        const f = R.focus;
        cx = view[0] * f.x + view[4] * 0.9 + view[8] * f.z + view[12];
        cy = view[1] * f.x + view[5] * 0.9 + view[9] * f.z + view[13];
        viewH /= f.zoom;
        viewW = viewH * aspect;
      } else if (R.zoom > 1.001) {
        // gentle player zoom: shrink the view and let it pan, but only as far as the room extends
        viewH = fullH / R.zoom;
        viewW = viewH * aspect;
        const limX = Math.max(0, (maxX - minX + 0.8 - viewW) / 2), limY = Math.max(0, (maxY - minY + 1.2 - viewH) / 2);
        R.pan.x = clamp(R.pan.x, -limX, limX);
        R.pan.y = clamp(R.pan.y, -limY, limY);
        cx += R.pan.x;
        cy += R.pan.y;
      } else {
        R.pan.x = R.pan.y = 0;
      }
      const proj = E.ortho(cx - viewW / 2, cx + viewW / 2, cy - viewH / 2, cy + viewH / 2, 1, 200);
      R.vp = E.multiply(proj, view);
      frame.vp = R.vp;
      R.pxPerUnit = R.cssH / viewH;
      R.cam = {
        eye, cx, cy, viewW, viewH,
        right: [view[0], view[4], view[8]], up: [view[1], view[5], view[9]], fwd: [-view[2], -view[6], -view[10]],
      };
      frame.outlineWorld = clamp(1.9 / R.pxPerUnit, 0.014, 0.05);
    }
    function project(x, y, z) {
      const m = R.vp;
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
      const ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
      return { x: (nx * 0.5 + 0.5) * R.cssW, y: (0.5 - ny * 0.5) * R.cssH };
    }

    /* ----------------------------------------------------------------------
       Particles (coins, sparks, smoke, steam, frost, stars)
       ---------------------------------------------------------------------- */
    function burst(type, x, y, z, n = 8) {
      const defs = {
        coin: { col: '#ffd23f', size: 0.09, up: 3.2, spread: 0.9, life: 0.9, grav: 7 },
        spark: { col: '#ffb347', size: 0.06, up: 2.2, spread: 1.6, life: 0.55, grav: 6 },
        smoke: { col: '#d7d3ea', size: 0.13, up: 0.9, spread: 0.25, life: 1.3, grav: -0.4 },
        steam: { col: '#ffe6dc', size: 0.12, up: 1.3, spread: 0.3, life: 1.1, grav: -0.8 },
        frost: { col: '#bfeaff', size: 0.07, up: 0.9, spread: 0.7, life: 0.9, grav: 0.4 },
        star: { col: '#fff27a', size: 0.08, up: 2.6, spread: 1.4, life: 0.8, grav: 3 },
        heart: { col: '#ff6fa8', size: 0.09, up: 1.6, spread: 0.6, life: 1.0, grav: -0.5 },
        poof: { col: '#ffffff', size: 0.16, up: 1.2, spread: 1.3, life: 0.6, grav: 1 },
      };
      const d = defs[type] || defs.spark;
      for (let i = 0; i < n && R.particles.length < 220; i++) {
        const a = Math.random() * TAU, v = d.spread * (0.4 + Math.random() * 0.8);
        R.particles.push({ x, y, z, vx: Math.cos(a) * v, vy: d.up * (0.6 + Math.random() * 0.6), vz: Math.sin(a) * v, life: d.life * (0.7 + Math.random() * 0.5), max: d.life, col: d.col, size: d.size, grav: d.grav });
      }
    }
    function drawParticles(dt) {
      for (let i = R.particles.length - 1; i >= 0; i--) {
        const p = R.particles[i];
        p.life -= dt;
        if (p.life <= 0) { R.particles.splice(i, 1); continue; }
        p.vy -= p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.06 && p.grav > 0) { p.y = 0.06; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; }
        const k = Math.min(1, p.life / p.max * 1.6);
        ball(p.x, p.y, p.z, p.size * k, p.size * k, p.size * k, p.col, 0, 1, true);
      }
    }

    /* ---------------------------------------------------------------- parts */
    const G = { R, st, eng, put, meshes, ball, cyl, blk, ring, shadow, glow, flatRing, putSpecial, putDecalM, putDecal, PAL, burst, project, E };
    const props = ns.GfxParts.props(G);
    const chars = ns.GfxParts.characters(G);
    const picker = ns.GfxParts.picking(G);
    G.sign = props.sign;

    /* ----------------------------------------------------------------------
       PCs
       ---------------------------------------------------------------------- */
    function pcAnimOf(id) {
      let a = R.pcAnim.get(id);
      if (!a) R.pcAnim.set(id, (a = { swivel: 0, smoke: 0, spark: 0, rock: 0, seatTurn: 0, fan: 0, lean: 0 }));
      return a;
    }

    /** A cable as a chain of small beads drooping between two points. */
    function cable(x0, y0, z0, x1, y1, z1, droop = 0.18, col = '#2a2a40') {
      const N = 7;
      for (let j = 0; j <= N; j++) {
        const u = j / N;
        ball(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u - droop * 4 * u * (1 - u), z0 + (z1 - z0) * u, 0.017, 0.017, 0.017, col, 0, 0, true);
      }
    }

    function drawPC(s, p, ui, dt) {
      const t = R.t;
      const L = R.light;
      const a = pcAnimOf(p.id);
      const fault = p.fault && p.status === 'fault' ? p.fault : null;
      const power = s.powerOutage <= 0;
      const occupied = p.status === 'busy' || p.status === 'reserved';
      a.swivel = damp(a.swivel, p.issue === 'suspicious' ? 0.85 + Math.sin(t * 5 + p.id) * 0.14 : 0, 9, dt);
      a.rock = damp(a.rock, p.status === 'busy' ? 1 : 0, 4, dt);
      a.fan = (a.fan + dt * (fault === 'overheat' ? 26 : p.status === 'busy' ? 9 : 3)) % TAU;

      const selected = s.selected?.kind === 'pc' && s.selected.id === p.id;
      const hovered = R.hover?.kind === 'pc' && R.hover.id === p.id;
      const wantsCustomer = ui.pendingReady && p.status === 'free' && !p.fault && !p.issue;

      st.push();
      const PS = ROOM.pcScale;
      st.translate(p.x, 0, p.y);
      st.scale(PS);
      shadow(p.x, p.y + 0.1, 1.55 * PS, 1.25 * PS, 0.32);
      if (power && (occupied || p.status === 'job')) glow(p.x, p.y + 0.5, 1.5 * PS, 1.2 * PS, fault ? '#ff9c8a' : p.issue ? '#ff9c8a' : '#6cf0ff', 0.2 + L.night * 0.22);

      if (selected) {
        flatRing(0, 0.15, 1.5 + Math.sin(t * 5) * 0.04, '#ffe14d');
        glow(p.x, p.y + 0.15, 1.7 * PS, 1.45 * PS, '#ffe14d', 0.28);
      } else if (hovered) flatRing(0, 0.15, 1.45, '#ffffff', 0.05);
      if (wantsCustomer) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 6);
        flatRing(0, 0.15, 1.35 + pulse * 0.14, '#53f0a8', 0.08);
        glow(p.x, p.y + 0.15, 1.6 * PS, 1.3 * PS, '#53f0a8', 0.18 + pulse * 0.2);
      }

      eng.cast(true);
      // desk: side panels, back panel and top
      blk(-0.72, 0, 0.02, 0.14, 0.82, 1.0, PAL.woodDark, 0.06);
      blk(0.72, 0, 0.02, 0.14, 0.82, 1.0, PAL.woodDark, 0.06);
      blk(0, 0.15, -0.4, 1.38, 0.6, 0.08, '#b9763a', 0.04, 0.7);
      blk(0, 0.8, 0.0, 1.78, 0.14, 1.14, PAL.wood, 0.07);

      // tower PC with blinking LEDs, tucked beside the desk (a fan grille spins on the front)
      blk(1.12, 0, -0.05, 0.4, 0.78, 0.62, PAL.beige, 0.09);
      blk(1.12, 0.52, 0.27, 0.3, 0.07, 0.04, '#7a7f93', 0.02, 0);
      blk(1.12, 0.36, 0.27, 0.3, 0.05, 0.04, '#cfc7a8', 0.02, 0); // CD drive
      ball(1.2, 0.2, 0.28, 0.035, 0.035, 0.03, fault ? '#ff5d6c' : power && p.status === 'busy' ? '#7bff9e' : '#ffd166', 0, 1, true);
      st.push();
      st.translate(1.12, 0.66, 0.29);
      st.rotateZ(a.fan);
      for (let k = 0; k < 3; k++) { st.push(); st.rotateZ((k * TAU) / 3); blk(0, 0.03, 0, 0.025, 0.07, 0.01, '#b5ad90', 0.005, 0); st.pop(); }
      st.pop();

      // keyboard + mouse pad + mouse (the mouse vanishes when it goes missing)
      blk(-0.05, 0.94, 0.33, 0.74, 0.055, 0.24, PAL.cream, 0.03);
      for (let r = 0; r < 2; r++) blk(-0.05, 0.99, 0.3 + r * 0.09, 0.62, 0.02, 0.06, '#c9d0e0', 0.01, 0);
      blk(0.62, 0.94, 0.3, 0.34, 0.02, 0.36, '#6b7cff', 0.015, 0);
      if (p.issue === 'nomouse') {
        blk(0.62, 0.955, 0.3, 0.14, 0.012, 0.14, '#ffe27a', 0.01, 0, 0.3); // sticky note: "mouse?"
        ball(0.62, 0.975, 0.3, 0.015, 0.012, 0.045, '#d9304a', 0, 0, true);
      } else {
        ball(0.62, 0.97, 0.3, 0.07, 0.04, 0.1, PAL.cream, 1, 0, true);
        cable(0.62, 0.975, 0.2, 0.2, 0.97, 0.22, 0.04); // mouse lead
      }

      // cables: monitor → tower, tower → power strip, and (back row) strip → wall socket
      cable(0.12, 0.98, -0.5, 1.02, 0.5, -0.3, 0.2);
      blk(1.12, 0, -0.62, 0.42, 0.05, 0.12, '#f0f0f5', 0.02, 0);
      ball(1.3, 0.06, -0.58, 0.016, 0.012, 0.012, power ? '#ff5d6c' : '#6a2a35', 0, power ? 1 : 0, true);
      cable(1.12, 0.2, -0.36, 1.12, 0.06, -0.6, 0.08);
      cable(-0.05, 0.94, 0.2, 0.1, 0.86, -0.4, 0.06); // keyboard lead
      if (p.y < 3) {
        const wz = -p.y / PS; // wall is at world z = 0 (local units, the desk is scaled)
        blk(0.98, 0.0, (wz - 0.6) / 2 - 0.3, 0.04, 0.03, Math.abs(wz) - 0.6, '#2a2a40', 0.01, 0);
        blk(0.98, 0.03, wz + 0.1, 0.04, 0.46, 0.04, '#2a2a40', 0.01, 0);
        blk(1.0, 0.44, wz + 0.04, 0.2, 0.2, 0.04, '#f6f6fb', 0.02, 0); // socket plate
        blk(1.0, 0.5, wz + 0.07, 0.05, 0.05, 0.02, '#2a2a40', 0.005, 0);
      }

      // CRT monitor on a swivel
      st.push();
      st.translate(fault ? Math.sin(t * 46) * 0.012 : 0, 0.94, -0.18);
      st.rotateY(a.swivel);
      cyl(0, 0, 0, 0.27, 0.07, PAL.beige, 0.95);
      cyl(0, 0.06, 0, 0.12, 0.14, PAL.beige, 0.9);
      st.translate(0, 0.19, 0);
      blk(0, 0.04, -0.34, 0.72, 0.64, 0.46, PAL.beige, 0.14);
      blk(0, 0, -0.06, 1.0, 0.86, 0.3, PAL.cream, 0.14);
      const FAULT_SCREEN = { glitch: '#ff5d6c', freeze: '#8190b4', bsod: '#2456e0', overheat: '#ff7a3a', noconn: '#f2c94c', hardware: '#14161f' };
      const scr = !power ? '#232a4a' : fault ? FAULT_SCREEN[fault] : p.issue === 'suspicious' ? '#ffe08a' : p.issue === 'nomouse' ? '#9fb3d8' : p.status === 'busy' ? '#46e0d2' : p.status === 'reserved' ? '#8fb4ff' : p.status === 'job' ? '#ffd166' : '#5d8cff';
      blk(0, 0.07, 0.1, 0.8, 0.66, 0.08, scr, 0.08, 0, power ? 0.95 : 0);
      if (power) drawScreenContent(p, t, fault);
      ball(0.36, -0.03, 0.12, 0.028, 0.028, 0.025, p.status === 'busy' ? '#7bff9e' : '#ffd166', 0, 1, true);
      st.pop();

      // chair, rocking slightly while someone plays
      st.push();
      st.translate(0, 0, ROOM.seatOffset / PS + 0.03);
      st.rotateY(Math.sin(t * 1.3 + p.id) * 0.16 * a.rock + (p.status === 'free' ? Math.sin(t * 0.5 + p.id) * 0.03 : 0));
      const chair = PAL.chairs[(p.id - 1) % PAL.chairs.length];
      cyl(0, 0, 0, 0.3, 0.05, '#4a4466', 1, 1);
      cyl(0, 0.04, 0, 0.055, 0.3, '#9aa3bd', 1, 1);
      for (const dx of [-0.24, 0, 0.24]) ball(dx, 0.04, dx ? 0.08 : -0.18, 0.06, 0.05, 0.06, '#4a4466', 0, 0, true);
      blk(0, 0.32, 0, 0.7, 0.14, 0.66, chair, 0.1);
      blk(0, 0.46, 0.32, 0.64, 0.66, 0.13, chair, 0.1);
      st.pop();
      eng.cast(false);

      // loud video: sound waves from the monitor + a speaker icon
      if (p.issue === 'loudvideo') {
        for (let k = 0; k < 3; k++) {
          const ph = (t * 1.8 + k * 0.33) % 1;
          st.push();
          st.translate(0.82, 1.5, 0.0);
          st.rotateZ(Math.PI / 2);
          ring(0, 0, 0, 0.18 + ph * 0.5, 0.035, ph < 0.8 ? '#ffe14d' : '#ffd1b0', 0, 1, 1.7);
          st.pop();
        }
      }
      st.pop();

      // effects
      if (fault === 'overheat' && power) {
        a.smoke -= dt;
        if (a.smoke <= 0) { burst('steam', p.x + 1.1, 1.2, p.y - 0.1, 2); burst('steam', p.x, 2.0, p.y - 0.2, 1); a.smoke = 0.22; }
      } else if (fault && fault !== 'freeze' && fault !== 'noconn' && power) {
        a.smoke -= dt;
        if (a.smoke <= 0) { burst('smoke', p.x, 2.0, p.y - 0.2, 2); a.smoke = 0.32; }
      } else if (fault === 'freeze' && power) {
        a.smoke -= dt;
        if (a.smoke <= 0) { burst('frost', p.x, 1.6, p.y, 2); a.smoke = 0.45; }
      }
      if (p.status === 'job') {
        a.spark -= dt;
        const kind = p.job?.type;
        if (a.spark <= 0) {
          burst(kind === 'cool' ? 'frost' : kind === 'reset' ? 'star' : 'spark', p.x, 1.45, p.y + 0.1, 3);
          a.spark = 0.22;
        }
      }
      R.anchors.pcs.push({ id: p.id });
    }

    /** What the CRT shows, by state. Local to the monitor face. */
    function drawScreenContent(p, t, fault) {
      const z = 0.17;
      const dots = (n, fn) => { for (let i = 0; i < n; i++) fn(i); };
      if (fault === 'glitch') {
        for (const sgn of [-1, 1]) {
          st.push();
          st.translate(0, 0.07, z);
          st.rotateZ(sgn * 0.78);
          blk(0, 0, 0, 0.46, 0.07, 0.02, '#ffffff', 0.02, 0, 1);
          st.pop();
        }
      } else if (fault === 'freeze') { // frozen frame, hourglass, no cursor movement
        blk(0, 0.07, z, 0.7, 0.5, 0.01, '#b6c4e8', 0.02, 0, 0.6);
        for (const sg of [1, -1]) { st.push(); st.translate(0, 0.07 + sg * 0.09, z + 0.01); st.rotateZ(sg > 0 ? Math.PI : 0); blk(0, 0, 0, 0.18, 0.12, 0.01, '#ffffff', 0.01, 0, 1); st.pop(); }
        ball(0.2 + Math.sin(t * 9) * 0.01, -0.12, z + 0.02, 0.025, 0.04, 0.01, '#ffffff', 0, 1, true);
      } else if (fault === 'bsod') { // blue screen: ":(" and error lines
        ball(-0.22, 0.26, z, 0.03, 0.045, 0.02, '#ffffff', 0, 1, true);
        ball(-0.12, 0.26, z, 0.03, 0.045, 0.02, '#ffffff', 0, 1, true);
        st.push(); st.translate(-0.17, 0.13, z); st.rotateZ(Math.PI); ring(0, 0, 0, 0.08, 0.018, '#ffffff', 0, 1, Math.PI * 0.9); st.pop();
        dots(3, (i) => blk(-0.04 + (i % 2) * 0.05, 0.03 - i * 0.09, z, 0.52 - i * 0.12, 0.035, 0.02, '#cfe0ff', 0.01, 0, 1));
      } else if (fault === 'overheat') { // flames
        dots(3, (i) => ball(-0.2 + i * 0.2, -0.05 + Math.sin(t * 9 + i) * 0.03, z, 0.09, 0.17 + Math.sin(t * 11 + i * 2) * 0.05, 0.02, i === 1 ? '#fff27a' : '#ff5d3a', 0, 1, true));
      } else if (fault === 'noconn') { // wifi arcs with a cross
        for (let k = 0; k < 3; k++) { st.push(); st.translate(0, -0.12, z); ring(0, 0, 0, 0.1 + k * 0.1, 0.022, '#2a2150', 0, 1, Math.PI * 0.62); st.pop(); }
        for (const sg of [-1, 1]) { st.push(); st.translate(0.18, 0.2, z + 0.01); st.rotateZ(sg * 0.78); blk(0, 0, 0, 0.2, 0.035, 0.01, '#d9304a', 0.01, 0, 1); st.pop(); }
      } else if (fault === 'hardware') {
        if (Math.sin(t * 17 + p.id) > 0.3) ball((Math.sin(t * 3) * 0.25), 0.05, z, 0.04, 0.04, 0.02, '#ffd23f', 0, 1, true);
      } else if (p.issue === 'nomouse') {
        ball(0.0, 0.07, z, 0.1, 0.13, 0.02, '#2a2150', 0, 0.6, true); // a big "?" (dot + hook)
        ball(0.0, -0.1, z, 0.025, 0.025, 0.02, '#2a2150', 0, 0.6, true);
      } else if (p.status === 'busy') {
        const g = p.sessionGame;
        if (g === 'counter') { // FPS: crosshair + muzzle flashes
          st.push(); st.translate(0, 0.07, z); ring(0, 0, 0, 0.12, 0.014, '#e9fffb', 0, 1); blk(0, 0, 0, 0.3, 0.012, 0.01, '#e9fffb', 0.005, 0, 1); blk(0, 0, 0, 0.012, 0.3, 0.01, '#e9fffb', 0.005, 0, 1); st.pop();
          if (Math.sin(t * 14 + p.id) > 0.8) ball(0.1, -0.1, z, 0.05, 0.05, 0.01, '#fff27a', 0, 1, true);
        } else if (g === 'war' || g === 'myth') { // RPG: health bars + a hopping sprite
          blk(-0.25, 0.28, z, 0.28, 0.04, 0.02, '#ff5d73', 0.01, 0, 1);
          blk(-0.25, 0.22, z, 0.2 + Math.sin(t * 1.5) * 0.05, 0.04, 0.02, '#58d487', 0.01, 0, 1);
          ball(Math.sin(t * 2 + p.id) * 0.22, -0.08 + Math.abs(Math.sin(t * 5)) * 0.05, z + 0.01, 0.07, 0.09, 0.03, '#ffe14d', 0, 1, true);
        } else { // casual / chat: grid of coloured squares, or chat lines
          if (p.sessionGame === 'puzzle') dots(9, (i) => blk(-0.16 + (i % 3) * 0.16, 0.2 - Math.floor(i / 3) * 0.14, z, 0.12, 0.1, 0.02, ['#ff5d73', '#ffd23f', '#4cc3ff', '#7ee8b4'][(i + Math.floor(t * 1.5)) % 4], 0.02, 0, 1));
          else dots(3, (i) => blk(-0.38 + (0.3 + 0.2 * Math.sin(t * 2.5 + i * 1.7 + p.id)) / 2, 0.22 - i * 0.15, z, 0.3 + 0.2 * Math.sin(t * 2.5 + i * 1.7 + p.id), 0.07, 0.02, i === 1 ? '#fff27a' : '#e9fffb', 0.02, 0, 1));
        }
      } else if (p.status === 'job' && p.job) {
        const pct = 1 - clamp(p.job.remaining / Math.max(0.1, p.job.total), 0, 1);
        blk(0, 0.07, z, 0.6, 0.1, 0.02, '#ffffff', 0.03, 0, 0.7);
        blk(-0.3 + (0.6 * pct) / 2, 0.07, z + 0.012, Math.max(0.02, 0.6 * pct), 0.07, 0.02, p.job.type === 'cool' ? '#4cc3ff' : '#46e0a2', 0.02, 0, 1);
      } else {
        // idle "screensaver": a bouncing logo
        const tri = (v) => Math.abs((v % 2) - 1);
        blk(-0.26 + tri(t * 0.4 + p.id) * 0.52, -0.1 + tri(t * 0.27 + p.id * 0.7) * 0.34, z, 0.2, 0.12, 0.02, '#ffffff', 0.03, 0, 1);
      }
    }

    /* ----------------------------------------------------------------------
       World events: puddle, rings under the crowd at the door, selection feedback
       ---------------------------------------------------------------------- */
    function drawWorldEvents(s) {
      const t = R.t;
      for (const ev of s.worldEvents || []) {
        const sel = s.selected?.kind === 'event' && s.selected.id === ev.id;
        const hov = R.hover?.kind === 'event' && R.hover.id === ev.id;
        const f = ev.focus;
        let height = 2.5;
        if (ev.kind === 'floor') {
          height = 1.1;
          // spilled drink: a glossy puddle, a tipped cup and a wet-floor sign
          eng.cast(false);
          glow(f.x, f.y, 1.5, 1.2, '#5ec8ff', 0.35);
          ball(f.x, 0.03, f.y, 0.95, 0.02, 0.7, '#6fd0ff', 0, 0.45, true);
          ball(f.x - 0.2, 0.05, f.y - 0.1, 0.4, 0.015, 0.22, '#d8f6ff', 0, 0.9, true);
          ball(f.x + 0.35, 0.04, f.y + 0.3, 0.3, 0.015, 0.2, '#6fd0ff', 0, 0.45, true);
          st.push();
          st.translate(f.x + 0.75, 0.13, f.y - 0.2);
          st.rotateZ(Math.PI / 2 - 0.2);
          cyl(0, 0, 0, 0.1, 0.26, '#ff5d73', 0.8, 1);
          st.pop();
          cyl(f.x - 0.95, 0, f.y + 0.3, 0.16, 0.05, '#ffd23f', 1);
          st.push();
          st.translate(f.x - 0.95, 0.5, f.y + 0.3);
          G.sign('wet', 0, 0, 0, 0.5, 0.5, 0.6, 0.4);
          st.pop();
        } else if (ev.kind === 'power') height = 2.1;
        else if (ev.kind === 'machine') height = 2.6;

        // pulse ring: where to look. Brighter when selected or hovered.
        const urgency = clamp(1 - ev.time / ev.total, 0, 1);
        const pulse = 0.5 + 0.5 * Math.sin(t * (4 + urgency * 5));
        const crowd = ev.kind === 'npc' || ev.kind === 'machine';
        const ringR = crowd ? 1.15 : ev.kind === 'floor' ? 1.1 : 0.7;
        const rx = ev.kind === 'power' ? ROOM.fuse.spot.x : f.x, ry = ev.kind === 'power' ? ROOM.fuse.spot.y : f.y;
        if (sel) {
          flatRing(rx, ry, ringR + Math.sin(t * 5) * 0.04, '#ffe14d', 0.09);
          glow(rx, ry, ringR * 1.3, ringR * 1.1, '#ffe14d', 0.3);
        } else {
          flatRing(rx, ry, ringR + pulse * 0.08, hov ? '#ffffff' : urgency > 0.6 ? '#ff6b6b' : '#ffb347', hov ? 0.07 : 0.05);
        }
        const a = project(rx, height, ry);
        const g = ev.kind === 'power' ? project(0.1, 1.2, ROOM.fuse.z) : project(f.x, 0.15, f.y); // a point on the object itself (for tests)
        R.anchors.events.push({ id: ev.id, type: ev.type, x: a.x, y: a.y, gx: g.x, gy: g.y, time: ev.time, total: ev.total });
      }
    }

    /* ----------------------------------------------------------------------
       Frame orchestration
       ---------------------------------------------------------------------- */
    const QUALITY = { high: { dpr: 2, outlines: true, shadows: true }, medium: { dpr: 1.5, outlines: true, shadows: true }, low: { dpr: 1, outlines: false, shadows: false } };

    function resizeCanvas(cssW, cssH) {
      const q = QUALITY[R.quality] || QUALITY.high;
      const dpr = Math.min(q.dpr, window.devicePixelRatio || 1);
      const cw = Math.max(1, Math.round(cssW * dpr)), ch = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      frame.outlines = q.outlines;
      frame.shadows = q.shadows;
      return { cw, ch };
    }

    /** In-game clock for lighting: running shifts follow the clock; menus show a bright afternoon, results show the night. */
    function lightMinutes(s) {
      if (s.phase === 'active' || s.phase === 'paused') return CFG.DAY_START_MINUTES + s.elapsed * CFG.GAME_MINUTE_RATE;
      if (s.phase === 'result') return 24 * 60;
      return CFG.DAY_START_MINUTES + 2 * 60;
    }

    function updateLighting(s, dt) {
      const L = (R.light = ns.Lighting.at(R.debugMinutes ?? lightMinutes(s)));
      const power = s.powerOutage <= 0;
      // peak hour pushes the room slightly warmer/busier
      const peak = s.peakActive ? 1 : 0;
      R.tint = [L.flat[0] + peak * 0.03, L.flat[1] - peak * 0.015, L.flat[2] - peak * 0.04];
      // blackout: lights and screens off. Daylight still comes through the windows, so it is dimmer, not pitch-black, in the afternoon.
      const darkTarget = !power ? 0.7 + 0.3 * L.night : s.powerFlicker > 0 && Math.sin(R.t * 30) > 0.4 ? 0.5 : 0;
      R.dark = damp(R.dark, darkTarget, 8, dt);
      frame.tint = R.tint;
      frame.dark = R.dark;
      frame.sunCol = L.sun;
      frame.ambCol = L.amb;
      frame.night = L.night;
      const sd = E.norm3([L.shadow[0], L.shadow[1], L.shadow[2]]);
      frame.shadowDir = sd;
      frame.shadowCol = [0.17, 0.1, 0.34, L.shadow[3] * (power ? 1 : 0.6)];
    }

    /** Push the sky colours to CSS so the backdrop follows the time of day. */
    function applySky(L) {
      const key = Math.round(L.hour * 30);
      if (key === R.lastSky) return;
      R.lastSky = key;
      const el = canvas.parentElement;
      if (!el) return;
      el.style.setProperty('--sky-a', L.sky[0]);
      el.style.setProperty('--sky-b', L.sky[1]);
      el.style.setProperty('--sky-c', L.sky[2]);
      el.style.setProperty('--cloud', L.cloud.toFixed(2));
      el.style.setProperty('--night', L.night.toFixed(2));
    }

    function render(s, nowMs, ui = {}) {
      if (eng.isLost()) return false;
      const dt = R.lastNow ? clamp((nowMs - R.lastNow) / 1000, 0, 0.1) : 0.016;
      R.lastNow = nowMs;
      R.t = nowMs / 1000;
      R.cssW = Math.max(1, canvas.clientWidth);
      R.cssH = Math.max(1, canvas.clientHeight);
      const { cw, ch } = resizeCanvas(R.cssW, R.cssH);

      R.roomW = damp(R.roomW, ROOM.widthFor(s.pcs.length), 3.2, dt);
      updateLighting(s, dt);
      applySky(R.light);

      const tBuild = performance.now();
      setupCamera();
      eng.beginFrame();
      R.anchors = { pcs: [], people: [], events: [] };

      props.drawRoom(s, dt);
      for (const p of s.pcs) {
        drawPC(s, p, ui, dt);
        const top = project(p.x, 2.2 * ROOM.pcScale, p.y - 0.2), mid = project(p.x, 1.5 * ROOM.pcScale, p.y - 0.1);
        const anchor = R.anchors.pcs[R.anchors.pcs.length - 1];
        Object.assign(anchor, { x: top.x, y: top.y, mx: mid.x, my: mid.y });
      }
      drawWorldEvents(s);
      for (const c of s.customers) {
        if (c.status === 'gone') continue;
        if (R.hover?.kind === 'customer' && R.hover.id === c.id && (c.status === 'waiting' || c.status === 'arriving')) flatRing(c.x, c.y, 0.58, '#ffffff', 0.05);
        if (s.pendingCustomerId === c.id) { flatRing(c.x, c.y, 0.62 + Math.sin(R.t * 6) * 0.03, '#ffe14d'); glow(c.x, c.y, 0.9, 0.8, '#ffe14d', 0.3); }
        else if (ui.hintCustomers && c.status === 'waiting') flatRing(c.x, c.y, 0.5 + 0.08 * Math.sin(R.t * 5 + c.id), '#53f0a8', 0.05);
        chars.drawPerson(s, c, c.type === 'officer' ? 'officer' : 'customer', dt);
      }
      chars.drawPerson(s, { ...s.player, id: 'abang' }, 'player', dt);
      drawParticles(dt);

      R.stats = { ...eng.stats(), buildMs: performance.now() - tBuild };
      eng.endFrame(cw, ch);
      // forget animation state of people who left
      if (R.poses.size > 40) for (const [key, v] of R.poses) if (R.t - v.seen > 5) R.poses.delete(key);
      return true;
    }

    const clampZoom = (z) => clamp(z, 1, 1.7);
    return {
      render, burst, project,
      pick: (s, px, py, opts) => picker.pick(s, px, py, opts),
      rayFor: picker.rayFor,
      anchors: () => R.anchors,
      stats: () => R.stats,
      light: () => R.light,
      setHover: (h) => { R.hover = h; },
      setFocus: (x, z, zoom = 3) => { R.focus = x == null ? null : { x, z, zoom }; },
      setQuality: (q) => { R.quality = QUALITY[q] ? q : 'high'; eng.setShadows(QUALITY[R.quality].shadows); },
      setDebugTime: (minutes) => { R.debugMinutes = minutes; },
      // subtle zoom / pan (no rotation, ever)
      zoomBy: (f) => { R.zoom = clampZoom(R.zoom * f); },
      setZoom: (z) => { R.zoom = clampZoom(z); },
      getZoom: () => R.zoom,
      panBy: (dxPx, dyPx) => { if (R.zoom > 1.001) { R.pan.x -= dxPx / R.pxPerUnit; R.pan.y += dyPx / R.pxPerUnit; } },
      resetCamera: () => { R.zoom = 1; R.pan.x = R.pan.y = 0; },
      worldToScreen: project,
      /** Render once and read back a coarse grid of pixels — proves the scene really is drawn (tests). */
      snapshot(s) {
        render(s, performance.now(), {});
        const gl = eng.gl;
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(4), colors = new Set();
        let opaque = 0, total = 0;
        for (let gy = 1; gy < 12; gy++) for (let gx = 1; gx < 16; gx++) {
          gl.readPixels(Math.floor((w * gx) / 16), Math.floor((h * gy) / 12), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          total++;
          if (px[3] > 200) opaque++;
          colors.add(`${px[0] >> 4},${px[1] >> 4},${px[2] >> 4}`);
        }
        return { opaque, total, distinct: colors.size, w, h };
      },
    };
  }

  ns.Gfx = { create };
})(window.ABCC);
