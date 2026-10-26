/* ==========================================================================
   3g. PICKING — real ray casting against the 3D scene
   --------------------------------------------------------------------------
   The camera is orthographic, so every screen pixel is a parallel ray. We intersect it
   with simple bounding volumes (boxes for PCs and the fuse box, a few spheres for a
   person, a flat box for a puddle) and pick by click priority:
       events (door crowd, puddle, fuse box)  >  waiting customers  >  PCs
   so the important thing wins even when it overlaps something big. Touch gets fatter
   shapes (and a nearest-label fallback) so a fingertip never misses.
   ========================================================================== */
(function (ns) {
  'use strict';

  const { ROOM, byId } = ns;

  ns.GfxParts = ns.GfxParts || {};
  ns.GfxParts.picking = function (G) {
    const { R } = G;

    /** World-space ray through a canvas pixel (CSS px). */
    function rayFor(px, py) {
      const c = R.cam;
      const nx = (px / R.cssW) * 2 - 1, ny = 1 - (py / R.cssH) * 2;
      const vx = c.cx + (nx * c.viewW) / 2, vy = c.cy + (ny * c.viewH) / 2;
      const o = [0, 1, 2].map((i) => c.eye[i] + c.right[i] * vx + c.up[i] * vy);
      return { o, d: c.fwd };
    }

    /** Ray vs axis-aligned box → distance t or null. */
    function hitBox(ray, min, max) {
      let t0 = -1e9, t1 = 1e9;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(ray.d[i]) < 1e-9) {
          if (ray.o[i] < min[i] || ray.o[i] > max[i]) return null;
        } else {
          let a = (min[i] - ray.o[i]) / ray.d[i], b = (max[i] - ray.o[i]) / ray.d[i];
          if (a > b) [a, b] = [b, a];
          t0 = Math.max(t0, a);
          t1 = Math.min(t1, b);
          if (t0 > t1) return null;
        }
      }
      return t0;
    }
    /** Ray vs sphere → distance t or null. */
    function hitSphere(ray, c, r) {
      const oc = [ray.o[0] - c[0], ray.o[1] - c[1], ray.o[2] - c[2]];
      const b = oc[0] * ray.d[0] + oc[1] * ray.d[1] + oc[2] * ray.d[2];
      const cc = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - r * r;
      const disc = b * b - cc;
      return disc < 0 ? null : -b - Math.sqrt(disc);
    }
    /** A person: three spheres up the body (feet-ish, belly, head). */
    function hitPerson(ray, x, z, scale, fat) {
      let best = null;
      for (const [y, r] of [[0.45, 0.42], [1.0, 0.46], [1.55, 0.44]]) {
        const t = hitSphere(ray, [x, y * scale, z], r * scale * fat + 0.06);
        if (t != null && (best == null || t < best)) best = t;
      }
      return best;
    }

    /**
     * What is under the pointer? Returns { kind: 'event'|'customer'|'pc', id } or null.
     * opts.touch widens every shape; opts.fallbackPx = pixels for the nearest-label fallback.
     */
    function pick(s, px, py, opts = {}) {
      if (!R.cam) return null;
      const fat = opts.touch ? 1.55 : 1.12;
      const ray = rayFor(px, py);
      let best = null;
      const consider = (priority, kind, id, t) => {
        if (t == null) return;
        if (!best || priority < best.priority || (priority === best.priority && t < best.t)) best = { priority, kind, id, t };
      };

      // ---- events: the crowd at the door, a suspect by the snack machine, the officer waiting for a greeting
      for (const ev of s.worldEvents || []) {
        if (ev.kind === 'floor') {
          const f = ev.focus, r = 0.95 * fat;
          consider(0, 'event', ev.id, hitBox(ray, [f.x - r, 0, f.y - r], [f.x + r, 0.45, f.y + r]));
        } else if (ev.kind === 'power') {
          const F = ROOM.fuse, e = 0.22 * fat;
          consider(0, 'event', ev.id, hitBox(ray, [0, F.y - 0.55 - e, F.z - 0.4 - e], [0.4, F.y + 0.3 + e, F.z + 0.4 + e]));
        }
      }
      // ---- people
      for (const c of s.customers) {
        if (c.status === 'gone') continue;
        const scale = (c.type === 'rm1' || c.look === 'uniform' ? 0.78 : 0.9) * ROOM.charScale;
        if (c.status === 'event' || c.status === 'officer') {
          const ev = (s.worldEvents || []).find((e) => e.npcIds.includes(c.id));
          if (ev) consider(0, 'event', ev.id, hitPerson(ray, c.x, c.y, scale, fat));
        } else if (c.status === 'waiting' || c.status === 'arriving') {
          consider(1, 'customer', c.id, hitPerson(ray, c.x, c.y, scale, fat));
        }
      }
      // ---- the assistant (tap them to ask what they can do, or to switch auto on and off)
      const asst = s.assistant;
      if (asst && !asst.mc) consider(1, 'assistant', 1, hitPerson(ray, asst.x, asst.y, 0.9 * ROOM.charScale, fat));
      // ---- PCs: desk + monitor + tower + chair as one box
      for (const p of s.pcs) {
        const e = opts.touch ? 0.2 : 0.06;
        const S = ROOM.pcScale;
        consider(2, 'pc', p.id, hitBox(ray, [p.x - 1.0 * S - e, 0, p.y - 0.75 * S - e], [p.x + 1.4 * S + e, 2.45 * S + e, p.y + 1.35 * S + e]));
      }
      if (best) return { kind: best.kind, id: best.id };

      // ---- nothing hit: nearest label/anchor within a small radius (helps fingers)
      const limit = opts.fallbackPx ?? (opts.touch ? 34 : 14);
      let near = null, nearD = limit;
      for (const a of R.anchors.people) {
        const target = a.kind === 'assistant' ? { kind: 'assistant', id: 1 } : a.kind === 'customer' && (a.status === 'waiting' || a.status === 'arriving') ? { kind: 'customer', id: a.id } : a.eventId != null ? { kind: 'event', id: a.eventId } : null;
        if (!target) continue;
        const d = Math.hypot(a.bx - px, a.by - py);
        if (d < nearD) { nearD = d; near = target; }
      }
      for (const a of R.anchors.pcs) {
        const d = Math.hypot(a.mx - px, a.my - py);
        if (d < nearD * 1.4) { nearD = d / 1.4; near = { kind: 'pc', id: a.id }; }
      }
      return near;
    }

    return { pick, rayFor };
  };
})(window.ABCC);
