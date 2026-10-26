/* ==========================================================================
   3. 3D RENDERER — dependency-free toon-shaded WebGL scene
   --------------------------------------------------------------------------
   3a. Engine  : matrices, mesh generators, instanced batching, shaders
   3b. Scene   : room, props, PCs, characters, particles   (next <script>)
   Everything is drawn with GPU instancing: each frame the scene code submits
   "instances" (a transform + colour) of a handful of meshes, and the engine
   draws every mesh once (twice with the ink-outline pass).
   ========================================================================== */
window.ABCC = window.ABCC || {};
window.ABCC.GfxEngine = (function () {
  'use strict';

  /* ---------- matrices ---------- */
  const identity = (o) => {
    o.fill(0);
    o[0] = o[5] = o[10] = o[15] = 1;
    return o;
  };
  const multiply = (a, b) => {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++)
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  };
  const ortho = (l, r, b, t, n, f) =>
    new Float32Array([2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]);
  const norm3 = (v) => {
    const q = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / q, v[1] / q, v[2] / q];
  };
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  function lookAt(eye, ctr) {
    const z = norm3([eye[0] - ctr[0], eye[1] - ctr[1], eye[2] - ctr[2]]);
    const x = norm3(cross3([0, 1, 0], z));
    const y = cross3(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1]);
  }

  /** Matrix stack with the usual push/pop and in-place translate/rotate/scale. */
  class MatrixStack {
    constructor() {
      this.mats = Array.from({ length: 40 }, () => new Float32Array(16));
      this.top = 0;
      identity(this.mats[0]);
    }
    reset() {
      this.top = 0;
      identity(this.mats[0]);
    }
    get m() {
      return this.mats[this.top];
    }
    push() {
      this.mats[this.top + 1].set(this.mats[this.top]);
      this.top++;
    }
    pop() {
      this.top--;
    }
    translate(x, y, z) {
      const m = this.m;
      for (let i = 0; i < 4; i++) m[12 + i] += m[i] * x + m[4 + i] * y + m[8 + i] * z;
    }
    rotateY(a) {
      const m = this.m, c = Math.cos(a), s = Math.sin(a);
      for (let i = 0; i < 4; i++) {
        const a0 = m[i], a2 = m[8 + i];
        m[i] = c * a0 - s * a2;
        m[8 + i] = s * a0 + c * a2;
      }
    }
    rotateX(a) {
      const m = this.m, c = Math.cos(a), s = Math.sin(a);
      for (let i = 0; i < 4; i++) {
        const a1 = m[4 + i], a2 = m[8 + i];
        m[4 + i] = c * a1 + s * a2;
        m[8 + i] = -s * a1 + c * a2;
      }
    }
    rotateZ(a) {
      const m = this.m, c = Math.cos(a), s = Math.sin(a);
      for (let i = 0; i < 4; i++) {
        const a0 = m[i], a1 = m[4 + i];
        m[i] = c * a0 + s * a1;
        m[4 + i] = -s * a0 + c * a1;
      }
    }
    scale(k) {
      for (let i = 0; i < 12; i++) this.m[i] *= k;
    }
  }

  /* ---------- colours ---------- */
  const colorCache = new Map();
  function rgb(c) {
    if (Array.isArray(c)) return c;
    let v = colorCache.get(c);
    if (!v) {
      let h = c.replace('#', '');
      if (h.length === 3) h = [...h].map((x) => x + x).join('');
      v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
      colorCache.set(c, v);
    }
    return v;
  }
  const mixColor = (a, b, t) => {
    const A = rgb(a), B = rgb(b);
    return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
  };

  /* ---------- mesh generators (return {pos, nor, uv, idx}) ---------- */

  function sphereData(lat, lon) {
    const pos = [], nor = [], uv = [], idx = [];
    for (let i = 0; i <= lat; i++) {
      const phi = (i / lat) * Math.PI;
      for (let j = 0; j <= lon; j++) {
        const th = (j / lon) * Math.PI * 2;
        const n = [Math.sin(phi) * Math.sin(th), Math.cos(phi), Math.sin(phi) * Math.cos(th)];
        pos.push(...n);
        nor.push(...n);
        uv.push(j / lon, i / lat);
      }
    }
    for (let i = 0; i < lat; i++)
      for (let j = 0; j < lon; j++) {
        const a = i * (lon + 1) + j, b = a + lon + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    return { pos, nor, uv, idx };
  }

  /**
   * Surface of revolution around Y. `profile` is [[radius, y, normalRadial, normalY], …]
   * walking from the bottom to the top.
   */
  function latheData(profile, seg) {
    const pos = [], nor = [], uv = [], idx = [];
    profile.forEach(([r, y, nr, ny], i) => {
      for (let j = 0; j <= seg; j++) {
        const th = (j / seg) * Math.PI * 2, s = Math.sin(th), c = Math.cos(th);
        pos.push(r * s, y, r * c);
        nor.push(nr * s, ny, nr * c);
        uv.push(j / seg, i / (profile.length - 1));
      }
    });
    for (let i = 0; i < profile.length - 1; i++)
      for (let j = 0; j < seg; j++) {
        const a = i * (seg + 1) + j, b = a + seg + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    return { pos, nor, uv, idx };
  }

  /** Unit tapered cylinder (bottom radius 1, top radius k, height 1, centred) with softly bevelled rims. */
  function cylinderData(k, seg) {
    const b = 0.09, s = Math.SQRT1_2;
    const slope = norm3([1, 1 - k, 0]);
    const sideN = [slope[0], slope[1]];
    const rb = 1, rt = Math.max(k, 0.0001);
    const p = [];
    p.push([0, -0.5, 0, -1]);
    p.push([rb - b, -0.5, 0, -1]);
    p.push([rb - b + b * s, -0.5 + b - b * s, 0.7, -0.7]);
    p.push([rb, -0.5 + b, sideN[0], sideN[1]]);
    p.push([rt, 0.5 - b, sideN[0], sideN[1]]);
    const bt = Math.min(b, rt * 0.45);
    p.push([rt - bt + bt * s, 0.5 - bt + bt * s, 0.7, 0.7]);
    p.push([Math.max(0, rt - bt), 0.5, 0, 1]);
    p.push([0, 0.5, 0, 1]);
    return latheData(p, seg);
  }

  /** Torus (or arc of one) in the XY plane. major radius 1, minor radius r. The arc is centred on −Y (a smile). */
  function torusData(r, arc, majorSeg, minorSeg) {
    const pos = [], nor = [], uv = [], idx = [];
    const start = arc >= Math.PI * 2 - 0.01 ? 0 : -Math.PI / 2 - arc / 2;
    for (let i = 0; i <= majorSeg; i++) {
      const a = start + (i / majorSeg) * arc, ca = Math.cos(a), sa = Math.sin(a);
      for (let j = 0; j <= minorSeg; j++) {
        const b = (j / minorSeg) * Math.PI * 2, cb = Math.cos(b), sb = Math.sin(b);
        pos.push((1 + r * cb) * ca, (1 + r * cb) * sa, r * sb);
        nor.push(cb * ca, cb * sa, sb);
        uv.push(i / majorSeg, j / minorSeg);
      }
    }
    for (let i = 0; i < majorSeg; i++)
      for (let j = 0; j < minorSeg; j++) {
        const a = i * (minorSeg + 1) + j, b = a + minorSeg + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    return { pos, nor, uv, idx };
  }

  /** Box with genuinely rounded edges: outer shape = inner box inflated by radius r. */
  function roundBoxData(w, h, d, r, steps) {
    const half = [w / 2, h / 2, d / 2];
    r = Math.min(r, Math.min(...half) * 0.98);
    const pos = [], nor = [], uv = [], idx = [];
    const samples = (hf) => {
      if (r < 1e-4) return [-hf, hf];
      const lo = [], hi = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        lo.push(-(hf - r) - r * (1 - t));
        hi.push(hf - r + r * t);
      }
      return lo.concat(hi);
    };
    const clampAxis = (v, hf) => Math.max(-(hf - r), Math.min(hf - r, v));
    for (let axis = 0; axis < 3; axis++)
      for (const sign of [1, -1]) {
        const b = (axis + 1) % 3, c = (axis + 2) % 3;
        const sb = samples(half[b]), sc = samples(half[c]);
        const base = pos.length / 3;
        for (let i = 0; i < sb.length; i++)
          for (let j = 0; j < sc.length; j++) {
            const p = [0, 0, 0];
            p[axis] = sign * half[axis];
            p[b] = sb[i];
            p[c] = sc[j];
            const q = [clampAxis(p[0], half[0]), clampAxis(p[1], half[1]), clampAxis(p[2], half[2])];
            let n = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
            if (r < 1e-4 || Math.hypot(...n) < 1e-6) {
              n = [0, 0, 0];
              n[axis] = sign;
            } else n = norm3(n);
            pos.push(q[0] + n[0] * r, q[1] + n[1] * r, q[2] + n[2] * r);
            nor.push(...n);
            uv.push(i / (sb.length - 1), j / (sc.length - 1));
          }
        for (let i = 0; i < sb.length - 1; i++)
          for (let j = 0; j < sc.length - 1; j++) {
            const a = base + i * sc.length + j, bb = a + sc.length;
            if (sign > 0) idx.push(a, bb, a + 1, a + 1, bb, bb + 1);
            else idx.push(a, a + 1, bb, a + 1, bb + 1, bb);
          }
      }
    return { pos, nor, uv, idx };
  }

  const planeXZData = () => ({
    pos: [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5],
    nor: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uv: [0, 0, 1, 0, 1, 1, 0, 1],
    idx: [0, 2, 1, 0, 3, 2],
  });
  const planeXYData = () => ({
    pos: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
    nor: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uv: [0, 1, 1, 1, 1, 0, 0, 0],
    idx: [0, 1, 2, 0, 2, 3],
  });

  /* ---------- shaders ---------- */

  const TOON_VS = `
    attribute vec3 aPos; attribute vec3 aNor;
    attribute vec4 iM0; attribute vec4 iM1; attribute vec4 iM2; attribute vec4 iM3;
    attribute vec4 iS;  /* xyz = 1/scale^2, w = emissive */
    attribute vec4 iC;  /* rgb = colour,    w = outline scale */
    uniform mat4 uVP; uniform float uOutline; uniform mediump float uPass; uniform vec3 uShadowDir;
    varying vec3 vN; varying vec3 vCol; varying vec3 vW; varying float vEmis;
    void main(){
      mat4 M = mat4(iM0, iM1, iM2, iM3);
      mat3 R = mat3(iM0.xyz, iM1.xyz, iM2.xyz);
      vec4 w = M * vec4(aPos, 1.0);
      if (uPass > 1.5) {                       /* planar sun shadow: flatten along the light onto the floor */
        float t = max(w.y, 0.0) / uShadowDir.y;
        gl_Position = uVP * vec4(w.x - uShadowDir.x * t, 0.05, w.z - uShadowDir.z * t, 1.0);
        vN = vec3(0.0, 1.0, 0.0); vCol = vec3(0.0); vW = w.xyz; vEmis = 0.0;
        return;
      }
      vec3 n = normalize(R * (aNor * iS.xyz));
      if (uPass > 0.5) w.xyz += n * uOutline * iC.w;
      vN = n; vCol = iC.rgb; vW = w.xyz; vEmis = iS.w;
      gl_Position = uVP * w;
    }`;
  const TOON_FS = `
    precision mediump float;
    varying vec3 vN; varying vec3 vCol; varying vec3 vW; varying float vEmis;
    uniform mediump float uPass; uniform vec3 uSun; uniform vec3 uView; uniform vec3 uTint; uniform vec3 uInk; uniform float uDark;
    uniform vec3 uSunCol; uniform vec3 uAmbCol; uniform vec4 uShadowCol; uniform float uNight;
    void main(){
      if (uPass > 1.5) { gl_FragColor = uShadowCol; return; }
      if (uPass > 0.5) { gl_FragColor = vec4(uInk * mix(1.0, 0.55, uDark), 1.0); return; }
      vec3 n = normalize(vN);
      float ndl = dot(n, uSun);
      float lit = smoothstep(-0.06, 0.07, ndl) * 0.45 + smoothstep(0.40, 0.54, ndl) * 0.55;
      vec3 shadow = vCol * uAmbCol;
      vec3 col = mix(shadow, vCol * uSunCol, lit);
      float rim = pow(1.0 - clamp(dot(n, uView), 0.0, 1.0), 3.0);
      col += rim * 0.10 * lit;
      /* subtle toon specular: bright / glossy colours (chrome, glass, white plastic) catch the sun, wood barely does */
      float luma = dot(vCol, vec3(0.3, 0.59, 0.11));
      float gloss = 0.05 + 0.55 * smoothstep(0.78, 0.95, luma);
      vec3 hv = normalize(uSun + uView);
      float spec = smoothstep(0.80, 0.86, pow(max(dot(n, hv), 0.0), 36.0));
      col += spec * gloss * lit * (1.0 - uNight * 0.6) * uSunCol;
      col *= mix(0.84, 1.0, smoothstep(0.0, 0.55, vW.y));          /* cheap ground occlusion */
      vec3 lighting = col * uTint * (1.0 - uDark * 0.62);
      gl_FragColor = vec4(mix(lighting, vCol * 1.12, vEmis * (1.0 - uDark * 0.55)), 1.0);
    }`;

  const DECAL_VS = `
    attribute vec3 aPos;
    attribute vec4 iM0; attribute vec4 iM1; attribute vec4 iM2; attribute vec4 iM3;
    attribute vec4 iS;  /* w = alpha */
    attribute vec4 iC;
    uniform mat4 uVP;
    varying vec2 vLocal; varying vec3 vCol; varying float vA;
    void main(){
      mat4 M = mat4(iM0, iM1, iM2, iM3);
      vLocal = aPos.xz; vCol = iC.rgb; vA = iS.w;
      gl_Position = uVP * (M * vec4(aPos, 1.0));
    }`;
  const DECAL_FS = `
    precision mediump float;
    varying vec2 vLocal; varying vec3 vCol; varying float vA;
    uniform float uKind; uniform float uDark;
    void main(){
      float d = length(vLocal) * 2.0;
      if (uKind < 0.5) { gl_FragColor = vec4(0.17, 0.10, 0.34, (1.0 - smoothstep(0.30, 1.0, d)) * vA); }
      else if (uKind < 1.5) { gl_FragColor = vec4(vCol, pow(1.0 - clamp(d, 0.0, 1.0), 1.5) * vA * (1.0 + uDark * 0.8)); }
      else if (uKind > 2.5) {                              /* light cone: a standing quad, narrow at the lamp (local +z, which points up) and wide at the floor */
        vec2 q = vLocal * 2.0;
        float t = clamp(0.5 - 0.5 * q.y, 0.0, 1.0);        /* 0 at the lamp, 1 at the floor */
        float hw = mix(0.07, 1.0, t);                      /* half-width of the beam at this height */
        float edge = 1.0 - smoothstep(hw * 0.35, hw, abs(q.x));
        float fade = mix(1.0, 0.4, t) * smoothstep(0.0, 0.05, t);
        gl_FragColor = vec4(vCol, edge * fade * vA * (1.0 + uDark * 0.8));
      }
      else {                                               /* window light patch: soft-edged rectangle */
        vec2 q = abs(vLocal) * 2.0;
        float e = (1.0 - smoothstep(0.62, 1.0, q.x)) * (1.0 - smoothstep(0.62, 1.0, q.y));
        gl_FragColor = vec4(vCol, e * vA * (1.0 - uDark * 0.9));
      }
    }`;

  const FLAT_VS = `
    attribute vec3 aPos; attribute vec3 aNor; attribute vec2 aUV;
    uniform mat4 uVP; uniform mat4 uM;
    varying vec3 vW; varying vec2 vUV;
    void main(){ vec4 w = uM * vec4(aPos, 1.0); vW = w.xyz; vUV = aUV; gl_Position = uVP * w; }`;
  const FLAT_FS = `
    precision mediump float;
    varying vec3 vW; varying vec2 vUV;
    uniform float uMode; uniform vec3 uColor; uniform vec3 uColor2; uniform sampler2D uTex;
    uniform vec3 uTint; uniform float uDark; uniform float uEmis;
    void main(){
      vec3 col;
      if (uMode < 0.5) {                                   /* checkered tile floor */
        vec2 g = floor(vW.xz);
        float chk = mod(g.x + g.y, 2.0);
        float h = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453);
        col = mix(uColor, uColor2, chk) * (0.97 + 0.05 * h);
        vec2 f = fract(vW.xz);
        float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
        col *= mix(0.90, 1.0, smoothstep(0.0, 0.035, edge));
        col *= uTint * (1.0 - uDark * 0.62);
      } else {                                              /* textured sign / poster */
        vec4 t = texture2D(uTex, vUV);
        if (t.a < 0.2) discard;
        col = t.rgb * uColor;
        col = mix(col * uTint * (1.0 - uDark * 0.62), col, uEmis);
      }
      gl_FragColor = vec4(col, 1.0);
    }`;

  /* ---------- factory ---------- */

  /** Create the GL context, programs and mesh library. Returns null when WebGL is unavailable. */
  function create(canvas) {
    let gl = null;
    let isGL2 = false;
    const attrs = { alpha: true, antialias: true, depth: true, stencil: true, premultipliedAlpha: true, powerPreference: 'high-performance' };
    try {
      gl = canvas.getContext('webgl2', attrs);
      isGL2 = !!gl;
      if (!gl) gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    } catch {
      gl = null;
    }
    if (!gl) return null;
    const angle = isGL2 ? null : gl.getExtension('ANGLE_instanced_arrays');
    if (!isGL2 && !angle) return null;
    const divisor = (loc, d) => (isGL2 ? gl.vertexAttribDivisor(loc, d) : angle.vertexAttribDivisorANGLE(loc, d));
    const drawInstanced = (count, n) =>
      isGL2 ? gl.drawElementsInstanced(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0, n) : angle.drawElementsInstancedANGLE(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0, n);

    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    }
    function program(vs, fs, attribs) {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      attribs.forEach((name, i) => gl.bindAttribLocation(p, i, name));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {};
      const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(p, i);
        u[info.name] = gl.getUniformLocation(p, info.name);
      }
      return { p, u };
    }

    const INSTANCE_ATTRIBS = ['aPos', 'aNor', 'iM0', 'iM1', 'iM2', 'iM3', 'iS', 'iC'];
    let toon, decal, flat;
    try {
      toon = program(TOON_VS, TOON_FS, INSTANCE_ATTRIBS);
      decal = program(DECAL_VS, DECAL_FS, INSTANCE_ATTRIBS);
      flat = program(FLAT_VS, FLAT_FS, ['aPos', 'aNor', 'aUV']);
    } catch (err) {
      console.warn('Shader build failed', err);
      return null;
    }

    /* ---- meshes ---- */
    const meshCache = new Map();
    const usedMeshes = [];
    let frameId = 1;

    function upload(data, key) {
      const n = data.pos.length / 3;
      const buf = new Float32Array(n * 8);
      for (let i = 0; i < n; i++) {
        buf.set([data.pos[i * 3], data.pos[i * 3 + 1], data.pos[i * 3 + 2], data.nor[i * 3], data.nor[i * 3 + 1], data.nor[i * 3 + 2], data.uv[i * 2], data.uv[i * 2 + 1]], i * 8);
      }
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.idx), gl.STATIC_DRAW);
      return { key, vbo, ibo, count: data.idx.length, inst: new Float32Array(24 * 16), n: 0, frame: 0, lastUsed: 0, base: 0 };
    }
    function mesh(key, build) {
      let m = meshCache.get(key);
      if (!m) {
        m = upload(build(), key);
        meshCache.set(key, m);
      }
      m.lastUsed = frameId;
      return m;
    }
    /** Dispose of rounded boxes that haven't been used for a while (their size keeps changing while the room grows). */
    function purgeMeshes() {
      if (meshCache.size < 260) return;
      for (const [key, m] of meshCache) {
        if (key.startsWith('box:') && frameId - m.lastUsed > 90) {
          gl.deleteBuffer(m.vbo);
          gl.deleteBuffer(m.ibo);
          meshCache.delete(key);
        }
      }
    }

    const q = (v) => Math.round(v * 50) / 50; // quantise sizes so equal boxes share one mesh
    const meshes = {
      sphere: () => mesh('sphere', () => sphereData(14, 20)),
      sphereLow: () => mesh('sphereLow', () => sphereData(7, 10)),
      cyl: (k = 1) => mesh(`cyl:${k.toFixed(2)}`, () => cylinderData(k, 20)),
      torus: (r, arc = Math.PI * 2) => mesh(`tor:${r.toFixed(3)}:${arc.toFixed(2)}`, () => torusData(r, arc, arc > 6 ? 28 : 16, 8)),
      box: (w, h, d, r) => {
        const W = q(w), H = q(h), D = q(d), R = Math.min(q(r), Math.min(W, H, D) / 2);
        const steps = R > 0.09 ? 3 : R > 0 ? 2 : 1;
        return mesh(`box:${W}:${H}:${D}:${R}`, () => roundBoxData(W, H, D, R, steps));
      },
      planeXZ: () => mesh('planeXZ', planeXZData),
      planeXY: () => mesh('planeXY', planeXYData),
    };

    /* ---- instance submission ---- */
    const stack = new MatrixStack();
    const decalLists = { shadow: { inst: new Float32Array(24 * 64), n: 0 }, glow: { inst: new Float32Array(24 * 64), n: 0 }, patch: { inst: new Float32Array(24 * 32), n: 0 }, cone: { inst: new Float32Array(24 * 16), n: 0 } };
    const casters = new Map(); // mesh -> { m, inst, n }   (instances that also cast a planar sun shadow)
    const casterOrder = [];
    let castFrame = 0;
    let castOn = false;
    let shadowsEnabled = true;
    const specials = []; // floor + sign quads, drawn individually
    let staging = new Float32Array(24 * 2048);
    let instBuf = gl.createBuffer();

    /** Add an instance of `m` at stack-relative offset (ox,oy,oz), scaled (sx,sy,sz). */
    function put(m, col, ox, oy, oz, sx, sy, sz, emis, outline) {
      if (m.frame !== frameId) {
        m.frame = frameId;
        m.n = 0;
        usedMeshes.push(m);
      }
      let a = m.inst;
      const o = m.n * 24;
      if (o + 24 > a.length) {
        const bigger = new Float32Array(a.length * 2);
        bigger.set(a);
        m.inst = a = bigger;
      }
      const M = stack.m;
      for (let i = 0; i < 4; i++) {
        a[o + i] = M[i] * sx;
        a[o + 4 + i] = M[4 + i] * sy;
        a[o + 8 + i] = M[8 + i] * sz;
        a[o + 12 + i] = M[12 + i] + M[i] * ox + M[4 + i] * oy + M[8 + i] * oz;
      }
      a[o + 16] = 1 / (sx * sx);
      a[o + 17] = 1 / (sy * sy);
      a[o + 18] = 1 / (sz * sz);
      a[o + 19] = emis;
      const c = rgb(col);
      a[o + 20] = c[0];
      a[o + 21] = c[1];
      a[o + 22] = c[2];
      a[o + 23] = outline;
      m.n++;
      if (castOn && shadowsEnabled) addCaster(m, a, o);
    }

    /** Copy an instance to the shadow-caster list of its mesh. */
    function addCaster(m, src, o) {
      let L = casters.get(m);
      if (!L) casters.set(m, (L = { m, inst: new Float32Array(24 * 16), n: 0, frame: 0, base: 0 }));
      if (L.frame !== castFrame) {
        L.frame = castFrame;
        L.n = 0;
        casterOrder.push(L);
      }
      if ((L.n + 1) * 24 > L.inst.length) {
        const bigger = new Float32Array(L.inst.length * 2);
        bigger.set(L.inst);
        L.inst = bigger;
      }
      L.inst.set(src.subarray(o, o + 24), L.n * 24);
      L.n++;
    }

    function nextDecalSlot(kind) {
      const list = decalLists[kind];
      let a = list.inst;
      const o = list.n * 24;
      if (o + 24 > a.length) {
        const bigger = new Float32Array(a.length * 2);
        bigger.set(a);
        list.inst = a = bigger;
      }
      a.fill(0, o, o + 24);
      list.n++;
      return { a: list.inst, o };
    }
    /** A flat decal lying on the floor. `rot` turns it about Y. */
    function putDecal(kind, x, z, rx, rz, col, alpha, rot = 0) {
      const { a, o } = nextDecalSlot(kind);
      const c = Math.cos(rot), s = Math.sin(rot);
      a[o] = c * rx; a[o + 2] = -s * rx; // x axis
      a[o + 5] = 1;
      a[o + 8] = s * rz; a[o + 10] = c * rz; // z axis
      a[o + 15] = 1;
      a[o + 12] = x; a[o + 13] = 0.012; a[o + 14] = z;
      a[o + 19] = alpha;
      const k = rgb(col);
      a[o + 20] = k[0]; a[o + 21] = k[1]; a[o + 22] = k[2];
    }
    /** A decal placed with the current matrix stack (e.g. a neon halo on a wall): the quad spans the stack's XZ plane. */
    function putDecalM(kind, rx, rz, col, alpha) {
      const { a, o } = nextDecalSlot(kind);
      const M = stack.m;
      for (let i = 0; i < 4; i++) {
        a[o + i] = M[i] * rx;
        a[o + 4 + i] = M[4 + i];
        a[o + 8 + i] = M[8 + i] * rz;
        a[o + 12 + i] = M[12 + i];
      }
      a[o + 19] = alpha;
      const k = rgb(col);
      a[o + 20] = k[0]; a[o + 21] = k[1]; a[o + 22] = k[2];
    }

    function putSpecial(kind, meshObj, sx, sy, sz, color, color2, tex, emis) {
      const M = stack.m;
      const model = new Float32Array(16);
      for (let i = 0; i < 4; i++) {
        model[i] = M[i] * sx;
        model[4 + i] = M[4 + i] * sy;
        model[8 + i] = M[8 + i] * sz;
        model[12 + i] = M[12 + i];
      }
      specials.push({ kind, mesh: meshObj, model, color: rgb(color), color2: rgb(color2 || color), tex, emis: emis || 0 });
    }

    /* ---- textures for signs / posters ---- */
    const textures = new Map();
    function makeTexture(id, w, h, paint) {
      // Paint at the natural aspect ratio, then stretch into a power-of-two canvas:
      // WebGL1 can't mipmap non-power-of-two textures. The quad maps it back, so nothing looks distorted.
      const art = document.createElement('canvas');
      art.width = w;
      art.height = h;
      paint(art.getContext('2d'), w, h);
      const pot = (n) => 2 ** Math.ceil(Math.log2(n));
      const c = document.createElement('canvas');
      c.width = pot(w);
      c.height = pot(h);
      c.getContext('2d').drawImage(art, 0, 0, c.width, c.height);
      let tex = textures.get(id);
      if (!tex) {
        tex = gl.createTexture();
        textures.set(id, tex);
      }
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    }

    /* ---- frame flush ---- */
    const frame = {
      vp: new Float32Array(16), sun: [0.32, 0.9, 0.62], view: [0.5, 0.62, 0.5], tint: [1, 1, 1], dark: 0, outlineWorld: 0.03, outlines: true,
      sunCol: [1.05, 1.02, 0.97], ambCol: [0.64, 0.58, 0.82], night: 0,
      shadowDir: [-0.5, 1, -0.45], shadowCol: [0.17, 0.1, 0.34, 0.3], shadows: true,
    };

    function bindInstanceAttribs(baseIndex) {
      const stride = 96, base = baseIndex * stride;
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, base);
      gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, base + 16);
      gl.vertexAttribPointer(4, 4, gl.FLOAT, false, stride, base + 32);
      gl.vertexAttribPointer(5, 4, gl.FLOAT, false, stride, base + 48);
      gl.vertexAttribPointer(6, 4, gl.FLOAT, false, stride, base + 64);
      gl.vertexAttribPointer(7, 4, gl.FLOAT, false, stride, base + 80);
    }
    function enableInstancing(on) {
      for (let i = 2; i <= 7; i++) {
        if (on) {
          gl.enableVertexAttribArray(i);
          divisor(i, 1);
        } else {
          divisor(i, 0);
          gl.disableVertexAttribArray(i);
        }
      }
    }
    function bindMesh(m) {
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
      gl.enableVertexAttribArray(0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
    }

    function flush(cw, ch) {
      // 1. pack every instance into one buffer: toon meshes, blob shadows, glows, light patches, then sun-shadow casters
      const sunShadows = frame.shadows && shadowsEnabled && frame.shadowCol[3] > 0.01;
      let total = usedMeshes.reduce((s, m) => s + m.n, 0) + decalLists.shadow.n + decalLists.glow.n + decalLists.patch.n + decalLists.cone.n + (sunShadows ? casterOrder.reduce((s, L) => s + L.n, 0) : 0);
      if (total * 24 > staging.length) staging = new Float32Array(total * 24 * 2);
      let cursor = 0;
      for (const m of usedMeshes) {
        m.base = cursor;
        staging.set(m.inst.subarray(0, m.n * 24), cursor * 24);
        cursor += m.n;
      }
      const shadowBase = cursor;
      staging.set(decalLists.shadow.inst.subarray(0, decalLists.shadow.n * 24), cursor * 24);
      cursor += decalLists.shadow.n;
      const glowBase = cursor;
      staging.set(decalLists.glow.inst.subarray(0, decalLists.glow.n * 24), cursor * 24);
      cursor += decalLists.glow.n;
      const patchBase = cursor;
      staging.set(decalLists.patch.inst.subarray(0, decalLists.patch.n * 24), cursor * 24);
      cursor += decalLists.patch.n;
      const coneBase = cursor;
      staging.set(decalLists.cone.inst.subarray(0, decalLists.cone.n * 24), cursor * 24);
      cursor += decalLists.cone.n;
      if (sunShadows) {
        for (const L of casterOrder) {
          L.base = cursor;
          staging.set(L.inst.subarray(0, L.n * 24), cursor * 24);
          cursor += L.n;
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
      gl.bufferData(gl.ARRAY_BUFFER, staging.subarray(0, Math.max(24, cursor * 24)), gl.STREAM_DRAW);

      gl.viewport(0, 0, cw, ch);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE);

      // 2. toon meshes: ink outline (inverted hull) then colour
      gl.useProgram(toon.p);
      gl.uniformMatrix4fv(toon.u.uVP, false, frame.vp);
      gl.uniform3fv(toon.u.uSun, frame.sun);
      gl.uniform3fv(toon.u.uView, frame.view);
      gl.uniform3fv(toon.u.uTint, frame.tint);
      gl.uniform3f(toon.u.uInk, 0.14, 0.09, 0.28);
      gl.uniform1f(toon.u.uDark, frame.dark);
      gl.uniform1f(toon.u.uOutline, frame.outlineWorld);
      gl.uniform3fv(toon.u.uSunCol, frame.sunCol);
      gl.uniform3fv(toon.u.uAmbCol, frame.ambCol);
      gl.uniform1f(toon.u.uNight, frame.night);
      gl.uniform3fv(toon.u.uShadowDir, frame.shadowDir);
      gl.uniform4fv(toon.u.uShadowCol, frame.shadowCol);
      enableInstancing(true);
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
      const passes = frame.outlines ? [1, 0] : [0];
      for (const pass of passes) {
        gl.cullFace(pass ? gl.FRONT : gl.BACK);
        gl.uniform1f(toon.u.uPass, pass);
        for (const m of usedMeshes) {
          bindMesh(m);
          gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
          bindInstanceAttribs(m.base);
          gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
          drawInstanced(m.count, m.n);
          gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
        }
      }
      enableInstancing(false);
      gl.cullFace(gl.BACK);

      // 3. floor and signs
      gl.useProgram(flat.p);
      gl.uniformMatrix4fv(flat.u.uVP, false, frame.vp);
      gl.uniform3fv(flat.u.uTint, frame.tint);
      gl.uniform1f(flat.u.uDark, frame.dark);
      gl.uniform1i(flat.u.uTex, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.disable(gl.CULL_FACE);
      for (const sp of specials) {
        gl.bindBuffer(gl.ARRAY_BUFFER, sp.mesh.vbo);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sp.mesh.ibo);
        for (let i = 0; i < 3; i++) gl.enableVertexAttribArray(i);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
        gl.uniformMatrix4fv(flat.u.uM, false, sp.model);
        gl.uniform1f(flat.u.uMode, sp.kind === 'floor' ? 0 : 1);
        gl.uniform3fv(flat.u.uColor, sp.color);
        gl.uniform3fv(flat.u.uColor2, sp.color2);
        gl.uniform1f(flat.u.uEmis, sp.emis);
        if (sp.tex) gl.bindTexture(gl.TEXTURE_2D, sp.tex);
        gl.drawElements(gl.TRIANGLES, sp.mesh.count, gl.UNSIGNED_SHORT, 0);
      }
      gl.disableVertexAttribArray(2);

      // 3b. planar sun shadows: casters flattened along the light onto the floor, stencil-guarded so overlaps don't double up
      if (sunShadows && casterOrder.length) {
        gl.useProgram(toon.p);
        gl.uniformMatrix4fv(toon.u.uVP, false, frame.vp);
        gl.uniform3fv(toon.u.uShadowDir, frame.shadowDir);
        gl.uniform4fv(toon.u.uShadowCol, frame.shadowCol);
        gl.uniform1f(toon.u.uPass, 2);
        gl.disable(gl.CULL_FACE); // flattening can flip winding
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE); // keep the canvas alpha: it is composited premultiplied over the CSS sky
        gl.depthMask(false);
        gl.enable(gl.STENCIL_TEST);
        gl.stencilFunc(gl.EQUAL, 0, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
        enableInstancing(true);
        for (const L of casterOrder) {
          bindMesh(L.m);
          gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
          bindInstanceAttribs(L.base);
          gl.bindBuffer(gl.ARRAY_BUFFER, L.m.vbo);
          drawInstanced(L.m.count, L.n);
          gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
        }
        enableInstancing(false);
        gl.disable(gl.STENCIL_TEST);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.uniform1f(toon.u.uPass, 0);
      }

      // 4. soft decals (contact shadows, glows, window light)
      gl.useProgram(decal.p);
      gl.uniformMatrix4fv(decal.u.uVP, false, frame.vp);
      gl.uniform1f(decal.u.uDark, frame.dark);
      enableInstancing(true);
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      const quad = meshes.planeXZ();
      const drawDecals = (kind, base, n) => {
        if (!n) return;
        gl.uniform1f(decal.u.uKind, kind);
        bindMesh(quad);
        gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
        bindInstanceAttribs(base);
        drawInstanced(quad.count, n);
      };
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE); // keep the canvas alpha: it is composited premultiplied over the CSS sky
      drawDecals(0, shadowBase, decalLists.shadow.n);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ZERO, gl.ONE);
      drawDecals(2, patchBase, decalLists.patch.n);
      drawDecals(1, glowBase, decalLists.glow.n);
      drawDecals(3, coneBase, decalLists.cone.n);
      enableInstancing(false);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    function beginFrame() {
      frameId++;
      usedMeshes.length = 0;
      decalLists.shadow.n = 0;
      decalLists.glow.n = 0;
      decalLists.patch.n = 0;
      decalLists.cone.n = 0;
      casterOrder.length = 0;
      castFrame++;
      castOn = false;
      specials.length = 0;
      stack.reset();
    }
    function endFrame(cw, ch) {
      flush(cw, ch);
      purgeMeshes();
    }

    const stats = () => ({ meshes: usedMeshes.length, instances: usedMeshes.reduce((n, m) => n + m.n, 0) + decalLists.shadow.n + decalLists.glow.n + decalLists.patch.n + decalLists.cone.n, casters: casterOrder.reduce((n, L) => n + L.n, 0), specials: specials.length, cached: meshCache.size });

    return {
      stats, gl, stack, meshes, put, putDecal, putDecalM, putSpecial, makeTexture, frame, beginFrame, endFrame, rgb, mixColor,
      cast: (on) => { castOn = !!on; },
      setShadows: (on) => { shadowsEnabled = !!on; },
      isLost: () => gl.isContextLost(),
    };
  }

  return { create, multiply, ortho, lookAt, norm3, dot3, rgb, mixColor };
})();
