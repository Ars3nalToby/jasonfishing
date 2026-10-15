/* Fish engine + 27 SEQ species, carried over from SEQ Aquarium */
/* ---------- small helpers ---------- */
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = x => Math.min(1, Math.max(0, x));
const mix3 = (c1, c2, t) => [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];
function hash(x, y, s) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function interp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (x <= pts[i + 1][0]) { const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]); const e = (1 - Math.cos(Math.PI * t)) / 2; return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * e; }
  }
  return pts[pts.length - 1][1];
}
function crom(p0, p1, p2, p3, t) { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(cv, srgb) {
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  return t;
}
const nextFrame = () => new Promise(r => setTimeout(r, 0));

/* ---- 02_paint.js ---- */
/* ---------- tileable noise fields (built once, sampled by every species) ---------- */
const TS = 256;
function pnoise(x, y, per, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = n => ((n % per) + per) % per;
  const a = hash(m(xi), m(yi), seed), b = hash(m(xi + 1), m(yi), seed), c = hash(m(xi), m(yi + 1), seed), d = hash(m(xi + 1), m(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function makeField(per, oct, seed) {
  const f = new Float32Array(TS * TS); let lo = 1e9, hi = -1e9;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    let s = 0, a = 0.5, p = per, tot = 0;
    for (let o = 0; o < oct; o++) { s += a * pnoise(x / TS * p, y / TS * p, p, seed + o * 7); tot += a; p *= 2; a *= 0.5; }
    s /= tot; f[y * TS + x] = s; if (s < lo) lo = s; if (s > hi) hi = s;
  }
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) / (hi - lo);
  return f;
}
const FM = makeField(4, 4, 11);   // marbling
const FR = makeField(3, 3, 31);   // ridge lines
const FS = makeField(40, 1, 5);   // fine speckle
const FF = makeField(16, 2, 77);  // mid blotches
function samp(F, x, y) {
  x -= Math.floor(x); y -= Math.floor(y);
  const fx = x * TS, fy = y * TS, x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
  const x1 = (x0 + 1) % TS, y1 = (y0 + 1) % TS;
  const a = F[y0 * TS + x0], b = F[y0 * TS + x1], c = F[y1 * TS + x0], d = F[y1 * TS + x1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
const win = (u, w) => !w ? 1 : sm(w[0] - 0.012, w[0] + 0.012, u) * (1 - sm(w[1] - 0.012, w[1] + 0.012, u));
function gate(t, g) { return !g ? 1 : sm(g[0], g[1], t) * (1 - sm(g[2], g[3], t)); }

/* ---------- skin painter ---------- */
function ramp(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t <= stops[i + 1][0]) { const k = sm(stops[i][0], stops[i + 1][0], t); return mix3(stops[i][1], stops[i + 1][1], k); }
  }
  return stops[stops.length - 1][1];
}
function paintSkin(sk) {
  const W = sk.w || 1024, H = sk.h || 512;
  const cv = canvasOf(W, H), g = cv.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  const gi = sk.g || 0.36, layers = sk.layers || [];
  const seedBase = sk.seed || 1;
  for (let r = 0; r < H; r++) {
    const v = 1 - (r + 0.5) / H, s = v < 0.5 ? v : 1 - v, t = s * 2, tn = sk.asym ? v * 2 : t;
    const NY = k => sk.asym ? Math.max(1, Math.round(k * gi * 2)) / 2 : k * gi;
    for (let c = 0; c < W; c++) {
      const u = (c + 0.5) / W;
      let col = ramp(sk.stops, t);
      for (let li = 0; li < layers.length; li++) {
        const L = layers[li]; let w = 0;
        switch (L.type) {
          case 'marble': {
            const m = samp(FM, u * 3.5 * (L.sc || 1), tn * (sk.asym ? Math.max(1, Math.round(7 * gi * (L.sc || 1) * 2)) / 2 : 7 * gi * (L.sc || 1)) + (L.off || 0));
            w = sm(L.lo, L.hi, m) * (1 - (L.bias || 0) + (L.bias || 0) * t); break;
          }
          case 'blotch': {
            const m = samp(FF, u * 3 * (L.sc || 1), tn * (sk.asym ? Math.max(1, Math.round(6 * gi * (L.sc || 1) * 2)) / 2 : 6 * gi * (L.sc || 1)) + 0.3);
            w = sm(L.lo, L.hi, m) * gate(t, L.gate); break;
          }
          case 'speck': {
            const m = samp(FS, u * 4 * (L.sc || 1), tn * (sk.asym ? Math.max(1, Math.round(8 * gi * (L.sc || 1) * 2)) / 2 : 8 * gi * (L.sc || 1)));
            w = sm(L.lo, L.hi, m); break;
          }
          case 'ridge': {
            const m = samp(FR, u * 3 * (L.sc || 1), tn * (sk.asym ? Math.max(1, Math.round(6 * gi * (L.sc || 1) * 2)) / 2 : 6 * gi * (L.sc || 1)) + 0.7);
            const rl = 1 - Math.abs(2 * m - 1);
            w = sm(L.lo, L.hi, rl) * gate(t, L.gate); break;
          }
          case 'bars': {
            const wp = (samp(FF, u * 2, t * 3) - 0.5) * (L.warp || 0);
            const ph = (u - L.u[0]) / (L.u[1] - L.u[0]) * L.n * Math.PI * 2 + wp;
            const wv = 0.5 + 0.5 * Math.cos(ph);
            w = sm(L.lo || 0.55, L.hi || 0.85, wv) * win(u, L.u) * gate(t, L.gate); break;
          }
          case 'stripe': {
            const wob = (samp(FF, u * 4, 0.5) - 0.5) * (L.wob || 0);
            const x = (t - L.t - wob) / L.w;
            w = Math.exp(-x * x) * win(u, L.u); break;
          }
          case 'spots': {
            const cu = L.cu, cs = L.cs || Math.max(2, Math.round(cu * gi));
            const fu = u * cu, ft = (sk.asym ? tn : t) * cs, iu = Math.floor(fu), it = Math.floor(ft);
            const sd = seedBase * 13 + (L.seed || 0);
            if (hash(iu, it, sd) < (L.p === undefined ? 1 : L.p)) {
              const du = fu - iu - (0.5 + (hash(iu, it, sd + 1) - 0.5) * (L.jit === undefined ? 0.5 : L.jit));
              const dt = ft - it - (0.5 + (hash(iu, it, sd + 2) - 0.5) * (L.jit === undefined ? 0.5 : L.jit));
              const rr = (L.r || 0.3) * (0.7 + 0.6 * hash(iu, it, sd + 3));
              const dd = Math.sqrt(du * du + dt * dt);
              w = (1 - sm(rr * 0.65, rr, dd)) * win(u, L.u) * gate(t, L.gate);
            }
            break;
          }
          case 'head': {
            w = (1 - sm(L.u1 - 0.06, L.u1, u)) * gate(t, L.gate); break;
          }
          case 'fade': { // horizontal gradient tint
            w = sm(L.u0, L.u1, u) * gate(t, L.gate); break;
          }
          case 'scales': {
            const fu = u * L.cu, ft = t * L.cs, row = Math.floor(ft), px = fu + ((row & 1) ? 0.5 : 0), ix = Math.floor(px);
            const x = px - ix - 0.5, y = ft - row - 0.5, d = Math.sqrt(x * x + (y + 0.12) * (y + 0.12) * 0.9);
            const e = sm(L.lo || 0.4, L.hi || 0.62, d);
            w = (L.inv ? 1 - e : e) * gate(t, L.gate); break;
          }
          case 'vband': {
            const wob = (samp(FF, 0.3, t * 3) - 0.5) * (L.wob || 0);
            w = sm(L.c - L.w + wob, L.c - L.w + L.s + wob, u) * (1 - sm(L.c + L.w - L.s + wob, L.c + L.w + wob, u)) * gate(t, L.gate); break;
          }
          case 'diag': {
            const tk = Math.abs(t - 0.5), ph = (u * L.cu + tk * L.k) % 1 - 0.5;
            w = Math.exp(-(ph / L.w) * (ph / L.w)) * win(u, L.u) * gate(t, L.gate); break;
          }
          case 'belly': { w = (1 - sm(L.t0, L.t1, t)) * win(u, L.u); break; }
          case 'back': { w = sm(L.t0, L.t1, t) * win(u, L.u); break; }
        }
        if (L.uw) w *= win(u, L.uw);
        if (w > 0.001) col = mix3(col, L.col, Math.min(1, w * (L.amt === undefined ? 1 : L.amt)));
      }
      const br = sk.bright === undefined ? 1 : sk.bright;
      const nz = 0.93 + 0.14 * samp(FS, u * 6, t * 12 * gi) * (sk.grain === undefined ? 1 : sk.grain) + (sk.grain === undefined ? 0 : 0.07 * (1 - sk.grain));
      const k = (r * W + c) * 4;
      d[k] = Math.min(255, col[0] * br * nz); d[k + 1] = Math.min(255, col[1] * br * nz); d[k + 2] = Math.min(255, col[2] * br * nz); d[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const toPx = (u, s, side) => [u * W, (1 - (side ? 1 - s : s)) * H];
  (sk.strokes || []).forEach(st => {
    for (const [w, col] of st.layers) {
      for (let side = 0; side < 2; side++) {
        g.beginPath();
        const p = st.pts.map(q => toPx(q[0], q[1], side));
        g.moveTo(p[0][0], p[0][1]);
        if (p.length === 2) g.lineTo(p[1][0], p[1][1]);
        else if (p.length === 3) g.quadraticCurveTo(p[1][0], p[1][1], p[2][0], p[2][1]);
        else g.bezierCurveTo(p[1][0], p[1][1], p[2][0], p[2][1], p[3][0], p[3][1]);
        g.lineWidth = w * (W / 1024); g.strokeStyle = col; g.lineCap = 'round';
        g.setLineDash(st.dash || []); g.stroke();
      }
    }
  });
  g.setLineDash([]);
  return tex(cv, true);
}

/* ---------- eye texture (iris centred at sphere +Z equator) ---------- */
const eyeCache = {};
function eyeTexture(p) {
  const key = JSON.stringify(p);
  if (eyeCache[key]) return eyeCache[key];
  const W = 512, H = 256, cv = canvasOf(W, H), g = cv.getContext('2d');
  const rgb = c => 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  g.fillStyle = rgb(p.sclera || [30, 20, 10]); g.fillRect(0, 0, W, H);
  const cx = W * 0.25, cy = H * 0.5, R = p.r || 76;
  function disc(r, col) { g.fillStyle = rgb(col); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); }
  disc(R * 1.09, p.ring0 || [120, 74, 28]); disc(R * 0.98, p.ring || [200, 140, 44]);
  for (let i = 0; i < 180; i++) {
    const a = hash(i, 1, 9) * Math.PI * 2, r0 = R * 0.34 + hash(i, 2, 9) * 6, r1 = R * (0.62 + 0.34 * hash(i, 3, 9));
    g.strokeStyle = hash(i, 4, 9) < 0.5 ? 'rgba(60,30,10,0.5)' : 'rgba(255,225,150,0.4)';
    g.lineWidth = 0.6 + hash(i, 5, 9) * 1.2; g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
  }
  const ig = p.iris || [14, 90, 82];
  const gr = g.createRadialGradient(cx, cy, R * 0.26, cx, cy, R * 0.74);
  gr.addColorStop(0, 'rgba(' + ig[0] * 0.5 + ',' + ig[1] * 0.5 + ',' + ig[2] * 0.5 + ',0.98)');
  gr.addColorStop(0.65, 'rgba(' + ig[0] + ',' + ig[1] + ',' + ig[2] + ',0.9)');
  gr.addColorStop(1, 'rgba(' + ig[0] + ',' + ig[1] + ',' + ig[2] + ',0)');
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R * 0.74, 0, Math.PI * 2); g.fill();
  disc(R * (p.pupil || 0.36), [2, 3, 3]);
  g.strokeStyle = 'rgba(20,10,4,0.75)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R * 1.0, 0, Math.PI * 2); g.stroke();
  return (eyeCache[key] = tex(cv, true));
}

/* ---------- fin membrane painter (draws into one cell of the fin atlas) ---------- */
function paintFinCell(g, x0, y0, W, H, cfg) {
  const rgba = c => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + c[3] + ')';
  g.save(); g.beginPath(); g.rect(x0, y0, W, H); g.clip();
  const gr = g.createLinearGradient(0, y0 + H, 0, y0);
  cfg.stops.forEach(s => gr.addColorStop(s[0], rgba(s[1])));
  g.fillStyle = gr; g.fillRect(x0, y0, W, H);
  const n = cfg.rays || 0;
  (cfg.bands || []).forEach(b => {
    const ya = y0 + (1 - b.b1) * H, yb = y0 + (1 - b.b0) * H;
    const bg = g.createLinearGradient(0, yb, 0, ya);
    bg.addColorStop(0, 'rgba(' + b.col + ',0)'); bg.addColorStop(0.3, 'rgba(' + b.col + ',' + b.a + ')');
    bg.addColorStop(0.7, 'rgba(' + b.col + ',' + b.a + ')'); bg.addColorStop(1, 'rgba(' + b.col + ',0)');
    g.fillStyle = bg;
    if (b.alt && n > 1) { for (let k = 0; k < n - 1; k += 2) { const xa = x0 + (k / (n - 1)) * W, xb = x0 + ((k + 1) / (n - 1)) * W; g.fillRect(xa, ya, xb - xa, yb - ya); } }
    else g.fillRect(x0, ya, W, yb - ya);
  });
  (cfg.dots || []).forEach(dd => { // dots on membrane
    g.fillStyle = 'rgba(' + dd.col + ',' + dd.a + ')';
    for (let k = 0; k < dd.n; k++) { const px = x0 + hash(k, 3, dd.seed || 1) * W, py = y0 + (1 - dd.b0 - hash(k, 4, dd.seed || 1) * (dd.b1 - dd.b0)) * H; g.beginPath(); g.arc(px, py, dd.r, 0, Math.PI * 2); g.fill(); }
  });
  for (let k = 0; k < n; k++) {
    const x = x0 + (k / (n - 1)) * W;
    g.lineCap = 'butt';
    g.strokeStyle = cfg.rayEdge || 'rgba(40,30,20,0.6)'; g.lineWidth = (cfg.rayW || 1.4) + 1.6; g.beginPath(); g.moveTo(x, y0 + H); g.lineTo(x, y0); g.stroke();
    g.strokeStyle = cfg.ray || 'rgba(230,214,176,0.7)'; g.lineWidth = cfg.rayW || 1.4; g.beginPath(); g.moveTo(x, y0 + H); g.lineTo(x, y0); g.stroke();
  }
  if (cfg.edge) { // coloured leading margin along the tip
    const eg = g.createLinearGradient(0, y0 + H * cfg.edge.b, 0, y0);
    eg.addColorStop(0, 'rgba(' + cfg.edge.col + ',0)'); eg.addColorStop(1, 'rgba(' + cfg.edge.col + ',' + cfg.edge.a + ')');
    g.fillStyle = eg; g.fillRect(x0, y0, W, H * cfg.edge.b);
  }
  g.restore();
}

/* ---- 03_engine.js ---- */
/* ======================================================================
   SPECIES ENGINE
   model space: length L = 1, nose at x=+0.5 (head +x), tail base at x=-0.5,
   y up, z = left/right.  Everything in a spec is a fraction of L.
   ====================================================================== */
const scal = (a, n, c) => 1 - c * Math.pow(Math.sin(Math.PI * (n - 1) * a), 2);

function makeProfile(sp) {
  const N = sp.nodes.map(n => [n[0] / 100, n[1] / 100, n[2] / 100, n[3] / 100]);
  const capL = (sp.cap || 11) / 100, n = N.length, P = sp.P || 2.5;
  function at(u) {
    let k = 1;
    while (k < n - 3 && u > N[k + 1][0]) k++;
    const a = N[k - 1], b = N[k], c = N[k + 1], d = N[k + 2];
    const t = clamp01((u - b[0]) / (c[0] - b[0]));
    const r = [0, 0, 0];
    for (let q = 1; q <= 3; q++) r[q - 1] = Math.max(0, crom(a[q], b[q], c[q], d[q], t));
    const tt = u / capL, cap0 = tt < 1 ? Math.sqrt(Math.max(0, 1 - (1 - tt) * (1 - tt))) : 1;
    const ee = sp.capE === undefined ? 0.05 : sp.capE, te = (u - (1 - ee)) / ee, cap = cap0 * (te > 0 ? Math.sqrt(Math.max(0, 1 - te * te * 0.9)) : 1);
    return { top: r[0] * cap, bot: r[1] * cap, w: r[2] * cap };
  }
  function surfZ(u, y) {
    const p = at(u), h = y >= 0 ? p.top : p.bot, q = Math.min(1, Math.abs(y) / Math.max(h, 1e-5));
    return p.w * Math.pow(Math.max(0, 1 - Math.pow(q, P)), 1 / P);
  }
  return { at, surfZ, P };
}

/* ---------- geometry utilities ---------- */
function paint(geo, col) {
  const k = new THREE.Color(col).convertSRGBToLinear(), n = geo.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
function mergeGeos(geos, names) {
  let vc = 0, ic = 0;
  geos.forEach(g => { vc += g.attributes.position.count; ic += g.index.count; });
  const out = new THREE.BufferGeometry();
  names.forEach(nm => {
    const sz = geos[0].attributes[nm].itemSize, arr = new Float32Array(vc * sz); let o = 0;
    geos.forEach(g => { arr.set(g.attributes[nm].array, o); o += g.attributes[nm].array.length; });
    out.setAttribute(nm, new THREE.BufferAttribute(arr, sz));
  });
  const idx = vc > 65000 ? new Uint32Array(ic) : new Uint16Array(ic); let io = 0, vo = 0;
  geos.forEach(g => { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io++] = a[i] + vo; vo += g.attributes.position.count; });
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
const _up = new THREE.Vector3(0, 1, 0);
function detailKit() {
  const list = [];
  const D = {
    list,
    cone(p0, p1, r, col, seg) {
      const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1), dir = b.clone().sub(a), l = dir.length();
      const g = new THREE.CylinderGeometry(0, r, l, seg || 6, 1);
      const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, dir.clone().normalize()));
      m.setPosition(a.clone().addScaledVector(dir, 0.5)); g.applyMatrix4(m); list.push(paint(g, col));
    },
    rod(p0, p1, r0, r1, col, seg) { // tapered rod (r0 at p0)
      const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1), dir = b.clone().sub(a), l = dir.length();
      const g = new THREE.CylinderGeometry(r1, r0, l, seg || 6, 1);
      const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, dir.clone().normalize()));
      m.setPosition(a.clone().addScaledVector(dir, 0.5)); g.applyMatrix4(m); list.push(paint(g, col));
    },
    tube(pts, r, col, seg, rad) {
      const c = new THREE.CatmullRomCurve3(pts.map(p => p.isVector3 ? p : new THREE.Vector3(...p)));
      list.push(paint(new THREE.TubeGeometry(c, seg || 40, r, rad || 8, false), col));
    },
    ball(c, rx, ry, rz, col, seg) {
      const g = new THREE.SphereGeometry(1, seg || 12, (seg || 12) * 0.7 | 0);
      g.applyMatrix4(new THREE.Matrix4().makeScale(rx, ry, rz).setPosition(c[0], c[1], c[2]));
      // setPosition after scale keeps translation intact
      list.push(paint(g, col));
    },
    ring(c, q, r, tube, col) {
      const g = new THREE.TorusGeometry(r, tube, 8, 36);
      const m = new THREE.Matrix4().makeRotationFromQuaternion(q); m.setPosition(c.x, c.y, c.z); g.applyMatrix4(m); list.push(paint(g, col));
    }
  };
  return D;
}

/* ---------- fin kinds ---------- */
const FIN = {
  dorsal(f, c) {
    const sg = f.dir === 'down' ? -1 : 1;
    return (a, b, o) => {
      const bu = f.u0 + (f.u1 - f.u0) * a, p = c.prof.at(bu), by = (sg > 0 ? p.top : -p.bot) - sg * (f.inset === undefined ? 0.008 : f.inset);
      const th = f.th0 + (f.th1 - f.th0) * a, len = interp(f.len, a) * scal(a, f.n, f.sc === undefined ? 0.15 : f.sc);
      o[0] = 0.5 - bu - Math.sin(th) * len * b - (f.curve === undefined ? 0.1 : f.curve) * len * b * b;
      o[1] = by + sg * (Math.cos(th) * len * b - (f.sag === undefined ? 0.04 : f.sag) * len * b * b);
      o[2] = (f.z === undefined ? 0.012 : f.z) * Math.sin(Math.PI * a) * b;
    };
  },
  caudal(f, c) {
    const xa = 0.5 - (f.u === undefined ? 1.0 : f.u), cs = f.tilt ? Math.cos(f.tilt) : 1, sn = f.tilt ? Math.sin(f.tilt) : 0;
    return (a, b, o) => {
      const ph = f.p0 + (f.p1 - f.p0) * a, len = interp(f.shape, a) * f.L * scal(a, f.n, f.sc === undefined ? 0.08 : f.sc);
      const x = -Math.cos(ph) * len * b, y = Math.sin(ph) * len * b;
      o[0] = xa + x * cs - y * sn; o[1] = (f.y0 || 0) + x * sn + y * cs; o[2] = (f.z === undefined ? 0.01 : f.z) * Math.sin(Math.PI * a) * b;
    };
  },
  pair(f, c) {
    const sg = f.sg;
    return (a, b, o) => {
      const psi = f.psi0 + (f.psi1 - f.psi0) * a, len = interp(f.len, a) * f.L * scal(a, f.n, f.sc === undefined ? 0.1 : f.sc);
      const ry = f.y0 + (f.y1 - f.y0) * a, ru = f.u0 + (f.u1 - f.u0) * a, zr = c.prof.surfZ(ru, ry) * 0.985;
      o[0] = 0.5 - ru - Math.cos(psi) * len * b;
      o[1] = ry + Math.sin(psi) * len * b - (f.droop === undefined ? 0.07 : f.droop) * len * b * b;
      o[2] = sg * (zr + ((f.flare === undefined ? 0.05 : f.flare) + 0.012 * Math.sin(Math.PI * a)) * b);
    };
  },
  wing(f, c) {
    const sg = f.sg;
    return (a, b, o) => {
      const ru = f.u0 + (f.u1 - f.u0) * a, ry = f.y0 + (f.y1 - f.y0) * a, zr = c.prof.surfZ(ru, ry) * 0.98;
      const len = interp(f.len, a) * f.L * scal(a, f.n, f.sc === undefined ? 0.05 : f.sc);
      o[0] = 0.5 - ru - (f.sweep === undefined ? 0.5 : f.sweep) * len * b - (f.curve || 0) * len * b * b;
      o[1] = ry - (f.droop === undefined ? 0.15 : f.droop) * len * b * b + (f.lift || 0) * len * b;
      o[2] = sg * (zr + len * b);
    };
  },
  fn(f, c) { return f.fn(c); }
};

/* ---------- build one species prototype ---------- */
function buildBody(sp, prof, NI, NJ) {
  const P = prof.P, cnt = (NI + 1) * (NJ + 1);
  const pos = new Float32Array(cnt * 3), uv = new Float32Array(cnt * 2), idx = [];
  const gl = sp.gill;
  for (let i = 0; i <= NI; i++) {
    const xu = 0.5 - 0.5 * Math.cos(Math.PI * i / NI), pr = prof.at(xu);
    for (let j = 0; j <= NJ; j++) {
      const v = j / NJ, a = 2 * Math.PI * v - Math.PI / 2, sn = Math.sin(a), cs = Math.cos(a);
      const yy = sn >= 0 ? pr.top * Math.pow(sn, 2 / P) : -pr.bot * Math.pow(-sn, 2 / P);
      let zz = pr.w * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / P);
      if (gl) {
        const sg = zz >= 0 ? 1 : -1, fz = sm(0.08, 0.45, Math.abs(zz) / Math.max(pr.w, 1e-4));
        const e = Math.pow((xu - gl.u) / gl.ru, 2) + Math.pow((yy - (gl.y || 0)) / gl.ry, 2);
        let dz = 0;
        if (e < 1) dz += gl.amp * Math.sqrt(1 - e);
        dz += gl.amp * 0.73 * Math.exp(-Math.pow((Math.sqrt(e) - 1) / 0.07, 2)) * (xu > gl.u ? 0.5 : 1);
        zz += sg * dz * fz;
      }
      const k = i * (NJ + 1) + j;
      pos[k * 3] = 0.5 - xu; pos[k * 3 + 1] = yy; pos[k * 3 + 2] = zz;
      uv[k * 2] = xu; uv[k * 2 + 1] = v;
    }
  }
  for (let i = 0; i < NI; i++) for (let j = 0; j < NJ; j++) {
    const a = i * (NJ + 1) + j, b = (i + 1) * (NJ + 1) + j, c = a + 1, d = b + 1;
    idx.push(a, c, b, b, c, d); // outward-facing winding for x decreasing along i
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  for (let i = 0; i <= NI; i++) { // weld seam at the belly line
    const a = i * (NJ + 1), b = a + NJ;
    const nx = nrm.getX(a) + nrm.getX(b), ny = nrm.getY(a) + nrm.getY(b), nz = nrm.getZ(a) + nrm.getZ(b), l = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(a, nx / l, ny / l, nz / l); nrm.setXYZ(b, nx / l, ny / l, nz / l);
  }
  return geo;
}

const ATLAS_W = 1024, CELL_W = 256, CELL_H = 128;
function buildFins(sp, ctx) {
  const fins = []; // expand pairs
  sp.fins.forEach(f => {
    if ((f.k === 'pair' || f.k === 'wing') && !f.sg) { fins.push(Object.assign({}, f, { sg: 1 })); fins.push(Object.assign({}, f, { sg: -1, like: fins.length })); }
    else fins.push(f);
  });
  const cellIdx = [], owners = [];
  fins.forEach((f, i) => { if (f.like !== undefined) cellIdx.push(cellIdx[f.like]); else { cellIdx.push(owners.length); owners.push(i); } });
  const rows = Math.ceil(owners.length / 4);
  const cv = canvasOf(ATLAS_W, rows * CELL_H), g = cv.getContext('2d');
  owners.forEach((fi, k) => { const x0 = (k % 4) * CELL_W, y0 = Math.floor(k / 4) * CELL_H; paintFinCell(g, x0, y0, CELL_W, CELL_H, Object.assign({ rays: fins[fi].n }, fins[fi].tex)); });
  const AH = rows * CELL_H, geos = [], det = ctx.D;
  fins.forEach((f, i) => {
    const k = cellIdx[i], x0 = (k % 4) * CELL_W, y0 = Math.floor(k / 4) * CELL_H;
    const nA = (f.n - 1) * Math.max(2, Math.round((f.kA || 4) * 0.5)), nB = Math.max(5, Math.round((f.nB || 8) * 0.75)), cnt = (nA + 1) * (nB + 1);
    const pos = new Float32Array(cnt * 3), uv = new Float32Array(cnt * 2), fr = new Float32Array(cnt * 2), idx = [];
    const fn = FIN[f.k](f, ctx), o = [0, 0, 0];
    for (let j = 0; j <= nB; j++) for (let ii = 0; ii <= nA; ii++) {
      const a = ii / nA, b = j / nB, q = j * (nA + 1) + ii;
      fn(a, b, o); pos[q * 3] = o[0]; pos[q * 3 + 1] = o[1]; pos[q * 3 + 2] = o[2];
      uv[q * 2] = (x0 + 2 + a * (CELL_W - 4)) / ATLAS_W;
      uv[q * 2 + 1] = 1 - (y0 + 2 + (1 - b) * (CELL_H - 4)) / AH;
      fr[q * 2] = (f.rip === undefined ? 0.9 : f.rip) * b * b; fr[q * 2 + 1] = a * (f.rf || 6) + (f.sg === -1 ? 1.1 : 0);
    }
    for (let j = 0; j < nB; j++) for (let ii = 0; ii < nA; ii++) { const a = j * (nA + 1) + ii, b = a + 1, c = a + nA + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('fr', new THREE.BufferAttribute(fr, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    geos.push(geo);
    if (f.spines) { // leading spines as slim cones along the first rays
      const sc = f.spineCol || sp.spineCol || 0x5a3416, sR = f.spineR || 0.0032;
      const p0 = [0, 0, 0], p1 = [0, 0, 0];
      for (let s = 0; s < f.spines; s++) {
        const a = s / (f.n - 1); fn(a, 0, o); p0[0] = o[0]; p0[1] = o[1]; p0[2] = o[2];
        fn(a, 1.0, o); p1[0] = o[0]; p1[1] = o[1]; p1[2] = o[2];
        det.rod(p0, p1, sR, sR * 0.25, sc, 5);
      }
    }
  });
  const tex = tex_(cv);
  return { geo: mergeGeos(geos, ['position', 'normal', 'uv', 'fr']), atlas: tex };
}
function tex_(cv) { const t = tex(cv, true); t.wrapT = THREE.ClampToEdgeWrapping; return t; }

function buildEyes(sp, ctx) {
  const e = sp.eye, R = e.r, geos = [], D = ctx.D, tx = eyeTexture(e.pal || {});
  [1, -1].forEach(sg => {
    const y = e.y, z = ctx.prof.surfZ(e.u, y) + R * 0.04;
    const pos = new THREE.Vector3(0.5 - e.u, y, sg * z), dir = new THREE.Vector3(e.dir[0], e.dir[1], sg * e.dir[2]).normalize();
    const m = new THREE.Matrix4(); m.lookAt(pos.clone().add(dir), pos, _up); m.setPosition(pos);
    const gs = new THREE.SphereGeometry(R, e.seg || 22, (e.seg || 22) * 0.7 | 0); gs.applyMatrix4(m); geos.push(gs);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    const lidC = e.lid || 0xa8601e;
    D.ring(pos.clone().addScaledVector(dir, R * 0.36), q, R * 1.0, R * 0.145, lidC);
    D.ring(pos.clone().addScaledVector(dir, -R * 0.07), q, R * 1.16, R * 0.05, e.rim || 0xcfe9e4);
  });
  return { geo: mergeGeos(geos, ['position', 'normal', 'uv']), map: tx };
}

function buildMouth(sp, ctx) {
  const m = sp.mouth; if (!m) return;
  const N = 9, D = ctx.D;
  const curve = (dy, inset) => {
    const pts = [];
    for (let k = 0; k <= N; k++) {
      const u = m.u - (m.u - 0.012) * (k / N); let y = m.yC + (m.yN - m.yC) * (k / N) + dy;
      const pq = ctx.prof.at(u); y = y < 0 ? Math.max(y, -0.8 * pq.bot) : Math.min(y, 0.8 * pq.top);
      pts.push(new THREE.Vector3(0.5 - u, y, ctx.prof.surfZ(u, y) * inset));
    }
    pts.push(new THREE.Vector3(0.5 - 0.006, m.yN + dy, 0));
    for (let k = N; k >= 0; k--) { const p = pts[k]; pts.push(new THREE.Vector3(p.x, p.y, -p.z)); }
    return pts;
  };
  const sep = m.sep === undefined ? 0.012 : m.sep;
  D.tube(curve(sep, 0.96), m.lip || 0.0084, m.col || 0xb9672c, 60, 6);
  D.tube(curve(-sep, 0.96), (m.lip || 0.0084) * (m.lipL || 0.85), m.colL || m.col || 0xb9672c, 60, 6);
  D.tube(curve(0, 0.985), 0.004, 0x1b0d06, 60, 5);
}

/* ---------- materials ---------- */
const CAUS_GLSL = `
float caus(vec2 p, float t) {
  float a = sin(p.x * 1.7 + t * 0.8 + sin(p.y * 1.3 - t * 0.6) * 1.4);
  float b = sin(p.y * 1.9 - t * 0.7 + sin(p.x * 1.1 + t * 0.5) * 1.5);
  float c = sin((p.x + p.y) * 1.3 + t * 0.45 + sin(p.x * 0.9 - t * 0.4) * 1.2);
  float v = 1.0 - abs(a * b * 0.6 + c * 0.4);
  return pow(clamp(v, 0.0, 1.0), 7.0);
}`;
const WORLD_VERT = '\n vec4 wp4 = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n wp4 = instanceMatrix * wp4;\n#endif\n vWp = (modelMatrix * wp4).xyz;\n vec3 onr = objectNormal;\n#ifdef USE_INSTANCING\n onr = mat3(instanceMatrix) * onr;\n#endif\n vWn = normalize(mat3(modelMatrix) * onr).y;\n';
function bendPatch(mat, sp, opts) {
  const b = sp.bend || { A: 0.07, K: 7 };
  const uB = { value: new THREE.Vector4(b.A, b.K, sp.flap || 0, 0) };
  const uR = { value: new THREE.Vector3().fromArray(sp.rim || [0.10, 0.36, 0.42]) };
  mat.onBeforeCompile = function (sh) {
    sh.uniforms.uBend = uB; sh.uniforms.uRim = uR; sh.uniforms.uCaus = U.caus; sh.uniforms.uWater = U.water;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float iPh;\nattribute float iBd;\nuniform vec4 uBend;\nvarying vec3 vWp;\nvarying float vWn;' + (opts.fr ? '\nattribute vec2 fr;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' +
        'float tt = clamp(0.5 - position.x, 0.0, 1.8);\n' +
        'float env = pow(smoothstep(0.0, 1.1, tt), 1.4);\n' +
        'transformed.z += uBend.x * env * sin(uBend.y * tt - iPh);\n' +
        'transformed.z += iBd * 0.45 * tt * tt;\n' +
        'transformed.y += uBend.z * abs(position.z) * sin(iPh - abs(position.z) * 2.2);\n' +
        (opts.fr ? 'transformed.z += fr.x * 0.012 * sin(fr.y - iPh * 1.2);\n' : ''))
      .replace('#include <project_vertex>', '#include <project_vertex>' + WORLD_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;\nuniform vec3 uCaus;\nuniform vec4 uWater;\nvarying vec3 vWp;\nvarying float vWn;' + CAUS_GLSL)
      .replace('#include <dithering_fragment>',
        'float fadeF = 1.0;\n#ifdef USE_FOG\n fadeF = 1.0 - fogFactor;\n#endif\n' +
        (opts.rim ? 'float fres = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 3.0);\ngl_FragColor.rgb += fres * uRim * 0.38 * fadeF;\n' : '') +
        (opts.caus ? 'float cs = caus(vWp.xz * 0.42 + vWp.y * 0.1, uCaus.x) * uCaus.y * clamp(vWn * 0.6 + 0.45, 0.0, 1.0) * step(vWp.y, uCaus.z) * exp(-max(0.0, uCaus.z - vWp.y) * 0.09);\ngl_FragColor.rgb += cs * vec3(0.30, 0.46, 0.44) * fadeF;\n' : '') +
        'float uwd = max(0.0, uCaus.z - vWp.y); gl_FragColor.rgb = mix(gl_FragColor.rgb, uWater.rgb, (1.0 - exp(-uwd * uWater.a)) * 0.9);\n' +
        '#include <dithering_fragment>');
  };
  mat.customProgramCacheKey = () => (opts.fr ? 'f' : 'n') + (opts.rim ? 'r' : 'n') + (opts.caus ? 'c' : 'n');
  return mat;
}

function buildSpecies(sp) {
  const prof = makeProfile(sp), D = detailKit(), ctx = { prof, D, sp };
  const bodyGeo = buildBody(sp, prof, sp.NI || 104, sp.NJ || 42);
  const skin = paintSkin(Object.assign({ w: 768, h: 384 }, sp.skin));
  const bodyMat = bendPatch(new THREE.MeshPhysicalMaterial({
    map: skin, roughness: sp.rough === undefined ? 0.42 : sp.rough, metalness: sp.metal || 0,
    clearcoat: sp.coat === undefined ? 0.7 : sp.coat, clearcoatRoughness: 0.2, envMapIntensity: sp.env === undefined ? 0.8 : sp.env
  }), sp, { rim: true, caus: true });
  const fin = buildFins(sp, ctx);
  const finMat = bendPatch(new THREE.MeshStandardMaterial({
    map: fin.atlas, emissiveMap: fin.atlas, emissive: new THREE.Color(0.17, 0.16, 0.15), transparent: true, side: THREE.DoubleSide,
    depthWrite: false, roughness: 0.6, metalness: 0, envMapIntensity: 0.35
  }), sp, { fr: true });
  const eyes = buildEyes(sp, ctx);
  const eyeMat = bendPatch(new THREE.MeshPhysicalMaterial({ map: eyes.map, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.4 }), sp, {});
  buildMouth(sp, ctx);
  if (sp.extras) sp.extras(ctx);
  D.list.forEach(g => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); });
  const detGeo = D.list.length ? mergeGeos(D.list, ['position', 'normal', 'uv', 'color']) : null;
  const detMat = bendPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0, envMapIntensity: 0.9 }), sp, { caus: true });
  return {
    sp, prof,
    parts: [
      { geo: bodyGeo, mat: bodyMat, name: 'body' },
      { geo: fin.geo, mat: finMat, name: 'fins', order: 2 },
      { geo: eyes.geo, mat: eyeMat, name: 'eyes' },
      detGeo && { geo: detGeo, mat: detMat, name: 'det' }
    ].filter(Boolean)
  };
}

/* ---------- instancing: one InstancedMesh per part, shared matrices ---------- */
function instantiate(proto, count) {
  const iPh = new THREE.InstancedBufferAttribute(new Float32Array(count), 1); iPh.setUsage(THREE.DynamicDrawUsage);
  const iBd = new THREE.InstancedBufferAttribute(new Float32Array(count), 1); iBd.setUsage(THREE.DynamicDrawUsage);
  const meshes = [];
  proto.parts.forEach((p, k) => {
    const geo = new THREE.BufferGeometry(); for (const k in p.geo.attributes) geo.setAttribute(k, p.geo.attributes[k]); if (p.geo.index) geo.setIndex(p.geo.index);
    geo.setAttribute('iPh', iPh); geo.setAttribute('iBd', iBd);
    const m = new THREE.InstancedMesh(geo, p.mat, count);
    m.frustumCulled = false; if (p.order) m.renderOrder = p.order;
    if (k > 0) m.instanceMatrix = meshes[0].instanceMatrix; else m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    meshes.push(m);
  });
  return {
    proto, count, iPh, iBd, meshes, mat: meshes[0].instanceMatrix,
    setM(i, m) { m.toArray(this.mat.array, i * 16); },
    flush() { this.mat.needsUpdate = true; iPh.needsUpdate = true; iBd.needsUpdate = true; },
    addTo(parent) { meshes.forEach(m => parent.add(m)); }
  };
}

/* ---- 04_species_a.js ---- */
/* ---------- species registry (specs are in fractions of body length L) ---------- */
const SPECIES = [];
const FT = (stops, o) => Object.assign({ rayW: 1.2, ray: 'rgba(214,204,176,0.55)', rayEdge: 'rgba(40,34,26,0.5)', stops }, o || {});
const SHP = { fork: d => [[0, 1], [0.2, 1 - d * 0.5], [0.5, 1 - d], [0.8, 1 - d * 0.5], [1, 1]], round: [[0, 0.72], [0.5, 1], [1, 0.72]], trunc: [[0, 0.9], [0.5, 1], [1, 0.9]] };
const FLATHEAD_STROKE = [[10.5, 'rgba(60,30,14,0.85)'], [5.4, 'rgba(250,246,232,0.92)'], [2.1, 'rgba(70,214,206,0.95)']];

SPECIES.push({
  id: 'flathead', hero: true, name: 'Dusky flathead', sci: 'Platycephalus fuscus',
  regions: ['Brisbane', 'Moreton Bay', 'Gold Coast', 'Sunshine Coast'], habitat: 'Sand and mud flats, estuaries, bays',
  len: 3.3, count: 3, mode: 'bottom', band: [0.0, 0.08],
  nodes: [[-9, 1.5, 1.8, 2.1], [0, 5.1, 5.7, 6], [8.4, 9, 9, 9], [16.4, 13.4, 11.9, 11.5], [25.4, 18.2, 14.6, 13.7], [35.8, 20.9, 15.5, 14.2],
    [49.3, 20.3, 14.9, 12.5], [64.2, 16.7, 13.1, 9.9], [79.1, 11.3, 9.3, 6.4], [92.5, 6.4, 5.5, 3.6], [100, 5.1, 4.5, 2.5], [104.5, 4.5, 3.9, 2.1]],
  cap: 12, gill: { u: 0.269, ru: 0.09, ry: 0.12, amp: 0.009 },
  skin: {
    seed: 3, g: 0.36, stops: [[0, [244, 206, 120]], [0.1, [244, 206, 120]], [0.5, [216, 120, 34]], [0.6, [216, 120, 34]], [1, [110, 60, 26]]],
    layers: [
      { type: 'marble', col: [56, 28, 12], lo: 0.46, hi: 0.72, amt: 0.68, bias: 0.7 },
      { type: 'speck', col: [238, 210, 156], lo: 0.8, hi: 0.92, amt: 0.32 },
      { type: 'ridge', col: [56, 28, 12], lo: 0.925, hi: 0.985, amt: 0.6, gate: [0.1, 0.3, 2, 3] },
      { type: 'blotch', col: [56, 28, 12], lo: 0.5, hi: 0.68, amt: 0.75, gate: [0.38, 0.5, 0.62, 0.72], uw: [0.24, 0.9] },
      { type: 'bars', col: [56, 28, 12], u: [0.68, 1.0], n: 3.4, lo: 0.58, hi: 0.85, amt: 0.88, warp: 2.4, gate: [0.08, 0.38, 2, 3] },
      { type: 'head', col: [226, 150, 62], u1: 0.3, amt: 0.3, gate: [0, 0, 0.6, 0.95] }
    ],
    strokes: [
      { pts: [[0.205, 0.372], [0.245, 0.395], [0.292, 0.352]], layers: FLATHEAD_STROKE },
      { pts: [[0.118, 0.312], [0.175, 0.272], [0.245, 0.30]], layers: FLATHEAD_STROKE },
      { pts: [[0.095, 0.25], [0.14, 0.19], [0.17, 0.275], [0.225, 0.215]], layers: FLATHEAD_STROKE },
      { pts: [[0.268, 0.44], [0.305, 0.3], [0.272, 0.15]], layers: [[9, 'rgba(60,30,14,0.8)'], [3.3, 'rgba(250,230,190,0.7)']] },
      { pts: [[0.03, 0.275], [0.065, 0.245], [0.105, 0.265]], layers: FLATHEAD_STROKE },
      { pts: [[0.07, 0.34], [0.1, 0.30], [0.125, 0.335]], layers: [[7.5, 'rgba(60,30,14,0.7)'], [3.3, 'rgba(250,246,232,0.8)']] },
      { pts: [[0.3, 0.262], [0.62, 0.252], [0.95, 0.262]], layers: [[3.3, 'rgba(244,228,190,0.55)']], dash: [3, 10] }
    ]
  },
  fins: [
    { k: 'dorsal', n: 9, u0: 0.313, u1: 0.591, th0: 0.28, th1: 0.94, len: [[0, 0.155], [0.2, 0.245], [0.5, 0.19], [0.78, 0.137], [1, 0.107]], sc: 0.2, curve: 0.1, sag: 0.05, z: 0.012, spines: 9, kA: 6, nB: 10,
      tex: { rayW: 2, ray: 'rgba(238,214,170,0.8)', rayEdge: 'rgba(70,38,18,0.85)', stops: [[0, [214, 148, 62, 0.95]], [0.45, [196, 130, 54, 0.8]], [0.8, [226, 190, 120, 0.42]], [1, [240, 226, 190, 0.18]]], bands: [{ b0: 0.08, b1: 0.62, col: '62,34,16', a: 0.62, alt: true }] } },
    { k: 'dorsal', n: 13, u0: 0.657, u1: 0.872, th0: 0.55, th1: 1.05, len: [[0, 0.09], [0.3, 0.128], [0.7, 0.1], [1, 0.06]], sc: 0.1, curve: 0.06, sag: 0.03, z: 0.009,
      tex: { rayW: 1.2, ray: 'rgba(206,188,150,0.7)', rayEdge: 'rgba(80,48,24,0.7)', stops: [[0, [190, 140, 80, 0.85]], [0.35, [150, 160, 170, 0.55]], [1, [214, 222, 224, 0.16]]], bands: [{ b0: 0.2, b1: 0.34, col: '70,44,24', a: 0.5 }, { b0: 0.52, b1: 0.62, col: '70,44,24', a: 0.4 }] } },
    { k: 'dorsal', dir: 'down', n: 11, u0: 0.687, u1: 0.884, th0: 0.5, th1: 1.0, len: [[0, 0.066], [0.3, 0.1], [1, 0.06]], sc: 0.1, curve: 0.05, sag: 0, z: 0.0075,
      tex: { rayW: 1.2, ray: 'rgba(206,188,150,0.7)', rayEdge: 'rgba(80,48,24,0.7)', stops: [[0, [200, 140, 70, 0.85]], [0.4, [150, 160, 170, 0.5]], [1, [214, 222, 224, 0.15]]], bands: [{ b0: 0.3, b1: 0.42, col: '70,44,24', a: 0.45 }] } },
    { k: 'caudal', n: 15, u: 0.985, p0: -1.08, p1: 1.08, L: 0.275, shape: [[0, 0.79], [0.5, 1], [1, 0.79]], sc: 0.08, kA: 5, nB: 12,
      tex: { rayW: 1.4, ray: 'rgba(240,214,160,0.75)', rayEdge: 'rgba(60,34,16,0.75)', stops: [[0, [196, 126, 52, 0.95]], [0.3, [120, 84, 52, 0.85]], [0.55, [120, 140, 166, 0.6]], [1, [226, 214, 172, 0.22]]], bands: [{ b0: 0.12, b1: 0.3, col: '50,24,10', a: 0.85 }, { b0: 0.4, b1: 0.52, col: '50,24,10', a: 0.5 }, { b0: 0.72, b1: 0.8, col: '236,214,150', a: 0.3 }] } },
    { k: 'pair', n: 14, u0: 0.304, u1: 0.304, y0: 0.015, y1: -0.072, psi0: 1.25, psi1: -1.2, L: 0.263, len: [[0, 0.75], [0.25, 0.95], [0.5, 1], [0.75, 0.91], [1, 0.67]], sc: 0.1, flare: 0.06, droop: 0.07, kA: 5, nB: 12,
      tex: { rayW: 1.3, ray: 'rgba(226,210,170,0.7)', rayEdge: 'rgba(70,46,24,0.7)', stops: [[0, [232, 150, 48, 0.98]], [0.22, [196, 120, 60, 0.93]], [0.5, [74, 100, 136, 0.88]], [0.85, [120, 148, 170, 0.62]], [1, [196, 206, 190, 0.34]]], bands: [{ b0: 0.3, b1: 0.46, col: '40,30,22', a: 0.5, alt: true }, { b0: 0.7, b1: 0.78, col: '236,226,176', a: 0.35 }] } },
    { k: 'pair', n: 6, u0: 0.197, u1: 0.257, y0: -0.116, y1: -0.11, psi0: -1.05, psi1: -1.65, L: 0.167, len: [[0, 0.7], [0.5, 1], [1, 0.7]], sc: 0.12, flare: 0.05, droop: 0, kA: 5,
      tex: { rayW: 1.6, ray: 'rgba(255,232,150,0.8)', rayEdge: 'rgba(150,80,16,0.7)', stops: [[0, [255, 206, 74, 0.97]], [0.6, [246, 156, 40, 0.88]], [1, [255, 226, 130, 0.45]]] } }
  ],
  mouth: { u: 0.149, yC: -0.039, yN: -0.015, col: 0xb9672c, lip: 0.0084 },
  eye: { u: 0.158, y: 0.093, r: 0.041, dir: [0.22, 0.42, 0.88], pal: { sclera: [43, 26, 12], ring0: [122, 74, 28], ring: [201, 138, 44], iris: [20, 120, 108], pupil: 0.36 }, lid: 0xa8601e },
  bend: { A: 0.05, K: 7 },
  extras(c) {
    const X = u => 0.5 - u;
    c.D.tube([[X(0.042), -0.072, 0.006], [X(0.036), -0.099, 0.012], [X(0.03), -0.125, 0.009], [X(0.033), -0.149, 0.006]], 0.0025, 0xf3ecdc, 20, 6);
    [1, -1].forEach(sg => [[0.328, -0.036], [0.322, -0.066]].forEach(p => {
      const z = c.prof.surfZ(p[0], p[1]);
      c.D.cone([X(p[0]), p[1], sg * z], [X(p[0]) - 0.028, p[1] - 0.01, sg * (z + 0.004)], 0.004, 0x6a3c18, 6);
    }));
  }
});

SPECIES.push({
  id: 'bream', hero: true, name: 'Yellowfin bream', sci: 'Acanthopagrus australis',
  regions: ['Brisbane', 'Moreton Bay', 'Gold Coast', 'Sunshine Coast'], habitat: 'Estuaries, rock walls, pylons, surf gutters',
  len: 1.7, count: 9, mode: 'school', band: [0.2, 0.6],
  nodes: [[-8, 1.5, 1.5, 2], [0, 8, 8, 7], [6, 14, 12.5, 9.5], [14, 18, 15.5, 11], [24, 23.5, 20, 12.5], [36, 26, 22.5, 13], [50, 25, 22, 12],
    [64, 21, 17, 9.8], [78, 14.5, 11.5, 6.5], [90, 8.5, 7.5, 4], [100, 6.8, 6, 3], [108, 6.4, 5.6, 2.8]],
  cap: 7, gill: { u: 0.2, ru: 0.08, ry: 0.15, amp: 0.006 },
  skin: {
    seed: 5, g: 0.5, stops: [[0, [236, 232, 212]], [0.18, [226, 218, 186]], [0.5, [172, 160, 118]], [0.8, [108, 100, 72]], [1, [70, 66, 50]]],
    layers: [
      { type: 'scales', col: [60, 56, 38], cu: 52, cs: 22, lo: 0.42, hi: 0.66, amt: 0.24 },
      { type: 'scales', col: [255, 248, 214], cu: 52, cs: 22, lo: 0.2, hi: 0.4, inv: true, amt: 0.14, gate: [0.2, 0.5, 2, 3] },
      { type: 'stripe', col: [190, 170, 96], t: 0.4, w: 0.07, amt: 0.35, u: [0.2, 0.96] },
      { type: 'marble', col: [58, 52, 34], lo: 0.5, hi: 0.8, amt: 0.3, bias: 0.8 },
      { type: 'head', col: [86, 76, 52], u1: 0.2, amt: 0.35, gate: [0.3, 0.6, 2, 3] },
      { type: 'back', col: [52, 50, 36], t0: 0.7, t1: 1, amt: 0.3, u: [0, 1] }
    ],
    strokes: [{ pts: [[0.18, 0.4], [0.2, 0.3], [0.18, 0.2]], layers: [[8, 'rgba(50,42,28,0.5)'], [2.4, 'rgba(250,236,170,0.4)']] },
      { pts: [[0.24, 0.3], [0.6, 0.285], [0.96, 0.3]], layers: [[2.6, 'rgba(40,36,24,0.45)']], dash: [5, 6] }]
  },
  rough: 0.3, metal: 0.25, coat: 0.5, env: 1.0, rim: [0.2, 0.4, 0.4],
  fins: [
    { k: 'dorsal', n: 11, u0: 0.29, u1: 0.53, th0: 0.12, th1: 0.82, len: [[0, 0.12], [0.2, 0.17], [0.6, 0.15], [1, 0.1]], sc: 0.1, curve: 0.08, sag: 0.04, z: 0.01, spines: 11, spineCol: 0x6a6048, spineR: 0.0026, kA: 4,
      tex: { rayW: 1.6, ray: 'rgba(210,198,160,0.8)', rayEdge: 'rgba(40,36,24,0.8)', stops: [[0, [120, 112, 80, 0.95]], [0.6, [92, 88, 64, 0.8]], [1, [60, 58, 44, 0.5]]] } },
    { k: 'dorsal', n: 12, u0: 0.545, u1: 0.72, th0: 0.55, th1: 0.95, len: [[0, 0.11], [0.35, 0.115], [1, 0.07]], sc: 0.08, curve: 0.08, sag: 0.03, z: 0.008,
      tex: { rayW: 1.1, ray: 'rgba(200,190,150,0.65)', rayEdge: 'rgba(50,46,30,0.7)', stops: [[0, [128, 116, 80, 0.9]], [0.5, [110, 104, 78, 0.6]], [1, [80, 78, 60, 0.25]]] } },
    { k: 'dorsal', dir: 'down', n: 10, u0: 0.665, u1: 0.855, th0: 0.4, th1: 0.95, len: [[0, 0.085], [0.2, 0.12], [1, 0.07]], sc: 0.1, curve: 0.06, sag: 0, z: 0.008,
      tex: { rayW: 1.3, ray: 'rgba(255,226,130,0.7)', rayEdge: 'rgba(120,76,10,0.7)', stops: [[0, [236, 170, 30, 0.96]], [0.6, [250, 200, 60, 0.85]], [1, [250, 224, 130, 0.45]]] } },
    { k: 'caudal', n: 17, u: 0.99, p0: -0.78, p1: 0.78, L: 0.27, shape: [[0, 1], [0.22, 0.8], [0.5, 0.55], [0.78, 0.8], [1, 1]], sc: 0.06, kA: 4, nB: 10,
      tex: { rayW: 1.3, ray: 'rgba(200,190,150,0.6)', rayEdge: 'rgba(30,26,18,0.8)', stops: [[0, [150, 130, 72, 0.96]], [0.5, [118, 108, 72, 0.9]], [0.92, [70, 66, 50, 0.75]], [1, [30, 28, 22, 0.85]]] } },
    { k: 'pair', n: 14, u0: 0.235, u1: 0.235, y0: 0.02, y1: -0.07, psi0: 1.2, psi1: -1.1, L: 0.22, len: [[0, 0.7], [0.3, 1], [0.7, 0.9], [1, 0.55]], sc: 0.08, flare: 0.05, droop: 0.05, kA: 4,
      tex: { rayW: 1.1, ray: 'rgba(220,214,180,0.6)', rayEdge: 'rgba(60,56,40,0.5)', stops: [[0, [196, 180, 120, 0.95]], [0.6, [190, 190, 170, 0.5]], [1, [210, 220, 220, 0.2]]] } },
    { k: 'pair', n: 6, u0: 0.29, u1: 0.33, y0: -0.2, y1: -0.19, psi0: -0.9, psi1: -1.3, L: 0.15, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.12, flare: 0.04, droop: 0.02, kA: 4,
      tex: { rayW: 1.5, ray: 'rgba(255,230,140,0.8)', rayEdge: 'rgba(130,80,10,0.6)', stops: [[0, [255, 214, 70, 0.97]], [0.6, [252, 190, 50, 0.9]], [1, [255, 226, 130, 0.5]]] } }
  ],
  mouth: { u: 0.08, yC: -0.04, yN: -0.018, col: 0xb98c58, lip: 0.0045, sep: 0.007 },
  eye: { u: 0.12, y: 0.045, r: 0.03, dir: [0.2, 0.15, 0.97], pal: { sclera: [50, 44, 30], ring0: [110, 90, 40], ring: [196, 160, 72], iris: [24, 22, 18], pupil: 0.44 }, lid: 0x8a7440, rim: 0xeeeedd },
  bend: { A: 0.07, K: 7.4 }
});

/* ---- 05_species_b.js ---- */
/* ---------- batch B: inshore & pelagic hunters ---------- */
const EYE = (u, y, r, o) => Object.assign({ u, y, r, dir: [0.2, 0.12, 0.97], pal: { sclera: [40, 34, 26], ring0: [110, 84, 40], ring: [200, 168, 80], iris: [26, 22, 16], pupil: 0.45 }, lid: 0x7a6a44, rim: 0xe8ecdc }, o || {});
const SCALES = (cu, cs, amt, dark) => [
  { type: 'scales', col: dark || [50, 50, 44], cu, cs, lo: 0.42, hi: 0.66, amt: amt || 0.24 },
  { type: 'scales', col: [255, 252, 236], cu, cs, lo: 0.2, hi: 0.4, inv: true, amt: 0.12, gate: [0.2, 0.5, 2, 3] }
];

SPECIES.push({
  id: 'snapper', hero: true, name: 'Pink snapper', sci: 'Chrysophrys auratus',
  regions: ['Moreton Bay', 'Gold Coast', 'Sunshine Coast', 'Brisbane'], habitat: 'Reefs, wrecks and sandy bays; young fish in Moreton Bay',
  len: 3.4, count: 5, mode: 'cruise', band: [0.12, 0.5],
  nodes: [[-8, 1.5, 1.5, 2], [0, 5, 5, 3.6], [6, 10, 8, 6], [14, 16, 11.5, 8.6], [24, 22.5, 17, 11], [36, 27.5, 21.5, 13], [50, 25.5, 21, 12.4],
    [64, 20, 16, 9.8], [78, 13.5, 10.5, 6.5], [90, 8, 7, 4], [100, 6.4, 5.6, 3], [108, 6, 5.2, 2.8]],
  cap: 9, gill: { u: 0.22, ru: 0.08, ry: 0.16, amp: 0.006 },
  skin: {
    seed: 9, g: 0.5, stops: [[0, [244, 222, 214]], [0.2, [232, 168, 160]], [0.55, [204, 108, 106]], [0.85, [158, 72, 80]], [1, [126, 62, 74]]],
    layers: SCALES(50, 22, 0.2, [96, 36, 40]).concat([
      { type: 'spots', col: [70, 150, 240], cu: 120, cs: 40, r: 0.17, p: 0.42, jit: 0.8, amt: 0.95, gate: [0.45, 0.62, 0.98, 1.1], uw: [0.2, 0.95] },
      { type: 'marble', col: [84, 40, 56], lo: 0.55, hi: 0.85, amt: 0.28, bias: 0.8 },
      { type: 'head', col: [180, 82, 92], u1: 0.22, amt: 0.3, gate: [0.3, 0.6, 2, 3] }
    ]),
    strokes: [{ pts: [[0.205, 0.42], [0.225, 0.3], [0.205, 0.17]], layers: [[9, 'rgba(90,40,50,0.45)'], [2.4, 'rgba(255,220,214,0.4)']] },
      { pts: [[0.24, 0.3], [0.6, 0.285], [0.96, 0.3]], layers: [[2.6, 'rgba(110,40,50,0.4)']], dash: [5, 6] }]
  },
  rough: 0.34, metal: 0.18, coat: 0.55, env: 1.0, rim: [0.3, 0.34, 0.36],
  fins: [
    { k: 'dorsal', n: 12, u0: 0.27, u1: 0.55, th0: 0.15, th1: 0.9, len: [[0, 0.1], [0.2, 0.15], [0.6, 0.14], [1, 0.1]], sc: 0.1, curve: 0.08, sag: 0.04, spines: 12, spineCol: 0xa05060, spineR: 0.0028, kA: 4,
      tex: FT([[0, [200, 90, 100, 0.95]], [0.6, [186, 84, 94, 0.82]], [1, [150, 70, 86, 0.5]]], { ray: 'rgba(250,200,200,0.5)' }) },
    { k: 'dorsal', n: 10, u0: 0.565, u1: 0.74, th0: 0.55, th1: 0.95, len: [[0, 0.1], [0.4, 0.105], [1, 0.07]], sc: 0.08, curve: 0.08, sag: 0.03, z: 0.008,
      tex: FT([[0, [210, 110, 116, 0.9]], [0.6, [196, 100, 110, 0.65]], [1, [170, 90, 110, 0.3]]]) },
    { k: 'dorsal', dir: 'down', n: 8, u0: 0.675, u1: 0.815, th0: 0.4, th1: 0.95, len: [[0, 0.08], [0.2, 0.11], [1, 0.07]], sc: 0.1, curve: 0.06, sag: 0, z: 0.008,
      tex: FT([[0, [226, 120, 126, 0.92]], [0.6, [216, 140, 144, 0.7]], [1, [236, 190, 190, 0.35]]]) },
    { k: 'caudal', n: 17, u: 0.99, p0: -0.82, p1: 0.82, L: 0.26, shape: SHP.fork(0.4), sc: 0.05, kA: 4, nB: 10,
      tex: FT([[0, [200, 96, 100, 0.96]], [0.55, [190, 92, 106, 0.9]], [0.9, [140, 70, 92, 0.78]], [1, [60, 40, 54, 0.85]]], { ray: 'rgba(240,190,190,0.45)' }) },
    { k: 'pair', n: 14, u0: 0.25, u1: 0.25, y0: 0.02, y1: -0.07, psi0: 1.0, psi1: -1.0, L: 0.22, len: [[0, 0.5], [0.3, 1], [0.7, 0.85], [1, 0.45]], sc: 0.08, flare: 0.05, droop: 0.04, kA: 4,
      tex: FT([[0, [220, 100, 110, 0.95]], [0.6, [226, 120, 126, 0.55]], [1, [236, 170, 176, 0.2]]]) },
    { k: 'pair', n: 6, u0: 0.28, u1: 0.33, y0: -0.22, y1: -0.21, psi0: -0.9, psi1: -1.3, L: 0.15, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.12, flare: 0.04, droop: 0.02, kA: 4,
      tex: FT([[0, [226, 110, 116, 0.96]], [1, [240, 170, 170, 0.5]]]) }
  ],
  mouth: { u: 0.1, yC: -0.04, yN: -0.012, col: 0xcf8a82, lip: 0.0058, sep: 0.008 },
  eye: EYE(0.135, 0.06, 0.026, { pal: { sclera: [40, 28, 26], ring0: [120, 60, 50], ring: [220, 170, 100], iris: [30, 20, 16], pupil: 0.46 }, lid: 0xb06060 }),
  bend: { A: 0.07, K: 7.2 }
});

SPECIES.push({
  id: 'mulloway', hero: true, name: 'Mulloway (jewfish)', sci: 'Argyrosomus japonicus',
  regions: ['Brisbane', 'Moreton Bay', 'Gold Coast', 'Sunshine Coast'], habitat: 'Deep holes in estuaries, surf gutters, offshore reefs',
  len: 5.2, count: 3, mode: 'cruise', band: [0.1, 0.45],
  nodes: [[-8, 1, 1, 1.5], [0, 4.5, 4.5, 3.8], [6, 9, 8, 5.8], [14, 12.5, 10.5, 7.6], [26, 15.5, 12.8, 8.6], [40, 16.2, 13.2, 8.8], [55, 14.6, 11.6, 7.8],
    [70, 11, 8.8, 6], [84, 7.6, 6.2, 4], [96, 5.2, 4.6, 2.8], [100, 5, 4.5, 2.6], [108, 4.8, 4.4, 2.4]],
  cap: 8, gill: { u: 0.2, ru: 0.08, ry: 0.15, amp: 0.006 },
  skin: {
    seed: 12, g: 0.4, stops: [[0, [238, 238, 228]], [0.25, [214, 212, 196]], [0.55, [170, 164, 142]], [0.85, [112, 108, 92]], [1, [86, 84, 74]]],
    layers: SCALES(56, 22, 0.2, [64, 58, 44]).concat([
      { type: 'stripe', col: [200, 160, 120], t: 0.55, w: 0.16, amt: 0.22, u: [0.2, 0.96] },
      { type: 'marble', col: [70, 64, 50], lo: 0.5, hi: 0.8, amt: 0.3, bias: 0.8 },
      { type: 'head', col: [120, 112, 92], u1: 0.24, amt: 0.3, gate: [0.35, 0.65, 2, 3] }
    ]),
    strokes: [{ pts: [[0.2, 0.42], [0.22, 0.3], [0.2, 0.17]], layers: [[8, 'rgba(60,54,40,0.45)']] },
      { pts: [[0.24, 0.3], [0.6, 0.29], [0.97, 0.3]], layers: [[2.8, 'rgba(46,42,30,0.5)']], dash: [6, 5] }]
  },
  rough: 0.3, metal: 0.3, coat: 0.5, env: 1.0, rim: [0.25, 0.38, 0.38],
  fins: [
    { k: 'dorsal', n: 10, u0: 0.27, u1: 0.44, th0: 0.15, th1: 0.85, len: [[0, 0.07], [0.3, 0.1], [0.7, 0.09], [1, 0.07]], sc: 0.1, curve: 0.08, sag: 0.04, spines: 10, spineCol: 0x4a4636, spineR: 0.0024, kA: 4,
      tex: FT([[0, [96, 90, 70, 0.95]], [0.7, [80, 76, 60, 0.8]], [1, [60, 58, 46, 0.5]]]) },
    { k: 'dorsal', n: 20, u0: 0.47, u1: 0.8, th0: 0.7, th1: 0.95, len: [[0, 0.065], [0.5, 0.06], [1, 0.045]], sc: 0.08, curve: 0.06, sag: 0.02, z: 0.006, kA: 3,
      tex: FT([[0, [108, 100, 80, 0.9]], [0.6, [110, 106, 90, 0.6]], [1, [130, 126, 110, 0.3]]]) },
    { k: 'dorsal', dir: 'down', n: 7, u0: 0.7, u1: 0.8, th0: 0.4, th1: 0.9, len: [[0, 0.06], [0.2, 0.075], [1, 0.05]], sc: 0.1, curve: 0.05, sag: 0, z: 0.006,
      tex: FT([[0, [140, 128, 96, 0.9]], [1, [170, 160, 130, 0.4]]]) },
    { k: 'caudal', n: 17, u: 0.99, p0: -0.82, p1: 0.82, L: 0.2, shape: [[0, 0.82], [0.5, 1], [1, 0.82]], sc: 0.04, kA: 4, nB: 10,
      tex: FT([[0, [118, 108, 82, 0.96]], [0.6, [104, 98, 78, 0.9]], [1, [58, 54, 44, 0.8]]]) },
    { k: 'pair', n: 14, u0: 0.24, u1: 0.24, y0: 0.0, y1: -0.065, psi0: 1.0, psi1: -1.1, L: 0.17, len: [[0, 0.6], [0.3, 1], [0.7, 0.85], [1, 0.5]], sc: 0.08, flare: 0.04, droop: 0.04, kA: 4,
      tex: FT([[0, [150, 130, 88, 0.95]], [0.6, [170, 160, 130, 0.55]], [1, [200, 196, 176, 0.25]]]) },
    { k: 'pair', n: 6, u0: 0.27, u1: 0.31, y0: -0.145, y1: -0.14, psi0: -0.9, psi1: -1.3, L: 0.1, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.12, flare: 0.03, droop: 0.02, kA: 4,
      tex: FT([[0, [210, 200, 170, 0.9]], [1, [228, 222, 200, 0.4]]]) }
  ],
  mouth: { u: 0.17, yC: -0.012, yN: 0.0, col: 0xa89870, lip: 0.005, sep: 0.008 },
  eye: EYE(0.115, 0.04, 0.032, { pal: { sclera: [30, 26, 20], ring0: [100, 80, 40], ring: [210, 190, 120], iris: [20, 18, 12], pupil: 0.5 }, lid: 0x6a6040 }),
  bend: { A: 0.065, K: 7.5 }
});

SPECIES.push({
  id: 'tailor', hero: true, name: 'Tailor', sci: 'Pomatomus saltatrix',
  regions: ['Brisbane', 'Moreton Bay', 'Gold Coast', 'Sunshine Coast'], habitat: 'Surf beaches, headlands and bays in schools; strong winter run',
  len: 2.4, count: 12, mode: 'school', band: [0.25, 0.7],
  nodes: [[-8, 1, 1, 1.5], [0, 4.2, 4.2, 3.6], [6, 8, 7.4, 5.4], [14, 11.2, 10, 6.8], [26, 13.6, 12.2, 7.8], [40, 14, 12.6, 8], [55, 12.6, 10.6, 7],
    [70, 9.6, 7.6, 5], [84, 6.6, 5.4, 3.4], [96, 4.6, 4, 2.2], [100, 4.4, 3.8, 2], [108, 4.2, 3.6, 1.8]],
  cap: 8, gill: { u: 0.2, ru: 0.08, ry: 0.15, amp: 0.005 },
  skin: {
    seed: 14, g: 0.4, stops: [[0, [240, 242, 238]], [0.3, [208, 220, 222]], [0.6, [150, 172, 178]], [0.85, [88, 118, 126]], [1, [62, 92, 96]]],
    layers: SCALES(60, 24, 0.16, [60, 80, 84]).concat([
      { type: 'back', col: [52, 96, 90], t0: 0.62, t1: 0.95, amt: 0.5, u: [0, 1] },
      { type: 'marble', col: [56, 82, 90], lo: 0.5, hi: 0.8, amt: 0.25, bias: 0.8 }
    ]),
    strokes: [{ pts: [[0.2, 0.42], [0.22, 0.3], [0.2, 0.17]], layers: [[7, 'rgba(40,60,60,0.4)']] },
      { pts: [[0.24, 0.3], [0.6, 0.29], [0.97, 0.3]], layers: [[2.2, 'rgba(40,60,66,0.45)']], dash: [6, 5] }]
  },
  rough: 0.26, metal: 0.35, coat: 0.5, env: 1.1, rim: [0.2, 0.4, 0.44],
  fins: [
    { k: 'dorsal', n: 7, u0: 0.33, u1: 0.45, th0: 0.15, th1: 0.9, len: [[0, 0.07], [0.5, 0.075], [1, 0.05]], sc: 0.12, curve: 0.08, sag: 0.04, spines: 7, spineCol: 0x4a5a56, spineR: 0.0022, kA: 4,
      tex: FT([[0, [70, 96, 96, 0.95]], [1, [56, 80, 84, 0.6]]]) },
    { k: 'dorsal', n: 16, u0: 0.5, u1: 0.72, th0: 0.6, th1: 0.95, len: [[0, 0.075], [0.3, 0.085], [1, 0.05]], sc: 0.1, curve: 0.08, sag: 0.03, z: 0.006,
      tex: FT([[0, [96, 128, 120, 0.92]], [0.6, [110, 140, 128, 0.7]], [1, [150, 176, 168, 0.35]]]) },
    { k: 'dorsal', dir: 'down', n: 14, u0: 0.56, u1: 0.78, th0: 0.55, th1: 0.95, len: [[0, 0.06], [0.3, 0.075], [1, 0.045]], sc: 0.1, curve: 0.06, sag: 0, z: 0.006,
      tex: FT([[0, [150, 170, 160, 0.9]], [1, [200, 214, 210, 0.4]]]) },
    { k: 'caudal', n: 17, u: 0.99, p0: -0.85, p1: 0.85, L: 0.27, shape: SHP.fork(0.55), sc: 0.04, kA: 4, nB: 10,
      tex: FT([[0, [100, 130, 124, 0.95]], [0.6, [96, 124, 120, 0.9]], [1, [50, 70, 70, 0.8]]]) },
    { k: 'pair', n: 12, u0: 0.24, u1: 0.24, y0: -0.02, y1: -0.07, psi0: 0.6, psi1: -1.0, L: 0.12, len: [[0, 0.7], [0.4, 1], [1, 0.5]], sc: 0.08, flare: 0.03, droop: 0.04, kA: 4,
      tex: FT([[0, [60, 84, 84, 0.95]], [1, [120, 150, 150, 0.4]]]) },
    { k: 'pair', n: 5, u0: 0.3, u1: 0.33, y0: -0.12, y1: -0.115, psi0: -0.9, psi1: -1.3, L: 0.075, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.12, flare: 0.02, droop: 0.02, kA: 4,
      tex: FT([[0, [230, 236, 230, 0.9]], [1, [240, 244, 240, 0.4]]]) }
  ],
  mouth: { u: 0.17, yC: -0.012, yN: 0.0, col: 0x6a8084, lip: 0.0036, sep: 0.007 },
  eye: EYE(0.115, 0.032, 0.028, { dir: [0.2, 0.1, 0.97], pal: { sclera: [20, 28, 26], ring0: [60, 70, 50], ring: [160, 170, 120], iris: [14, 18, 16], pupil: 0.5 }, lid: 0x55706c }),
  extras(c) { // lower-jaw teeth
    [1, -1].forEach(sg => { for (let k = 0; k < 6; k++) { const u = 0.03 + k * 0.022, y = -0.004, z = c.prof.surfZ(u, y) * 0.9; c.D.cone([0.5 - u, y - 0.004, sg * z], [0.5 - u, y + 0.008, sg * z * 0.98], 0.0016, 0xf4f0e4, 4); } });
  },
  bend: { A: 0.08, K: 7.6 }
});

SPECIES.push({
  id: 'mackerel', hero: true, name: 'Spanish mackerel', sci: 'Scomberomorus commerson',
  regions: ['Moreton Bay', 'Gold Coast', 'Sunshine Coast'], habitat: 'Offshore reefs, headlands and bait schools; fast open-water hunter',
  len: 5.4, count: 3, mode: 'pelagic', band: [0.3, 0.8],
  nodes: [[-8, 1, 1, 1.4], [0, 3.2, 3.2, 2.6], [8, 7.2, 6.6, 4.5], [18, 10.2, 9.2, 6], [30, 12, 11, 6.8], [44, 12, 11, 6.8], [60, 10.4, 9.4, 5.8],
    [74, 8, 7, 4.5], [86, 5.4, 4.8, 3], [95, 3.6, 3.2, 1.9], [100, 3.4, 3, 1.7], [110, 3.2, 2.8, 1.6]],
  cap: 8, gill: { u: 0.2, ru: 0.07, ry: 0.15, amp: 0.004 },
  skin: {
    seed: 21, g: 0.34, stops: [[0, [244, 246, 242]], [0.3, [216, 226, 226]], [0.55, [160, 184, 194]], [0.82, [72, 102, 134]], [1, [38, 62, 96]]],
    layers: SCALES(70, 26, 0.1, [70, 90, 100]).concat([
      { type: 'spots', col: [48, 64, 78], cu: 60, cs: 12, r: 0.24, p: 0.55, jit: 0.9, amt: 0.65, gate: [0.38, 0.5, 0.82, 0.92], uw: [0.2, 0.95] },
      { type: 'ridge', col: [50, 68, 88], lo: 0.9, hi: 0.98, amt: 0.4, gate: [0.5, 0.65, 2, 3], sc: 2.5 },
      { type: 'back', col: [30, 50, 84], t0: 0.7, t1: 1, amt: 0.5, u: [0, 1] }
    ]),
    strokes: [{ pts: [[0.24, 0.3], [0.5, 0.275], [0.97, 0.3]], layers: [[2, 'rgba(40,56,72,0.5)']] }]
  },
  rough: 0.24, metal: 0.4, coat: 0.5, env: 1.15, rim: [0.2, 0.4, 0.5],
  fins: [
    { k: 'dorsal', n: 15, u0: 0.27, u1: 0.53, th0: 0.7, th1: 0.95, len: [[0, 0.05], [0.3, 0.055], [1, 0.035]], sc: 0.08, curve: 0.05, sag: 0.02, z: 0.004, kA: 3,
      tex: FT([[0, [26, 40, 66, 0.95]], [1, [34, 50, 76, 0.7]]]) },
    { k: 'dorsal', n: 14, u0: 0.55, u1: 0.65, th0: 0.6, th1: 0.95, len: [[0, 0.07], [0.2, 0.085], [1, 0.05]], sc: 0.1, curve: 0.08, sag: 0.03, z: 0.005,
      tex: FT([[0, [44, 66, 96, 0.92]], [1, [90, 116, 140, 0.5]]]) },
    { k: 'dorsal', n: 10, u0: 0.665, u1: 0.87, th0: 0.7, th1: 1.0, len: [[0, 0.05], [1, 0.035]], sc: 0.95, curve: 0.1, sag: 0.0, z: 0.003, kA: 4,
      tex: FT([[0, [60, 84, 110, 0.95]], [1, [90, 116, 140, 0.8]]]) },
    { k: 'dorsal', dir: 'down', n: 14, u0: 0.58, u1: 0.65, th0: 0.6, th1: 0.95, len: [[0, 0.07], [0.2, 0.08], [1, 0.05]], sc: 0.1, curve: 0.08, sag: 0, z: 0.005,
      tex: FT([[0, [190, 206, 210, 0.9]], [1, [214, 226, 228, 0.4]]]) },
    { k: 'dorsal', dir: 'down', n: 10, u0: 0.675, u1: 0.87, th0: 0.7, th1: 1.0, len: [[0, 0.05], [1, 0.035]], sc: 0.95, curve: 0.1, sag: 0, z: 0.003, kA: 4,
      tex: FT([[0, [190, 206, 210, 0.9]], [1, [214, 226, 228, 0.7]]]) },
    { k: 'caudal', n: 19, u: 0.995, p0: -1.0, p1: 1.0, L: 0.3, shape: [[0, 1], [0.2, 0.78], [0.5, 0.4], [0.8, 0.78], [1, 1]], sc: 0.03, kA: 4, nB: 10,
      tex: FT([[0, [44, 66, 96, 0.95]], [0.6, [60, 84, 112, 0.9]], [1, [30, 44, 66, 0.85]]]) },
    { k: 'pair', n: 10, u0: 0.24, u1: 0.24, y0: -0.03, y1: -0.07, psi0: 0.4, psi1: -0.9, L: 0.09, len: [[0, 0.7], [0.4, 1], [1, 0.5]], sc: 0.08, flare: 0.02, droop: 0.04, kA: 4,
      tex: FT([[0, [50, 70, 96, 0.95]], [1, [100, 124, 144, 0.4]]]) },
    { k: 'pair', n: 5, u0: 0.28, u1: 0.3, y0: -0.12, y1: -0.115, psi0: -0.9, psi1: -1.3, L: 0.055, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.12, flare: 0.015, droop: 0.02, kA: 4,
      tex: FT([[0, [180, 200, 206, 0.9]], [1, [214, 226, 228, 0.4]]]) }
  ],
  mouth: { u: 0.17, yC: -0.012, yN: 0.0, col: 0x5a6e7c, lip: 0.003, sep: 0.006 },
  eye: EYE(0.11, 0.028, 0.022, { pal: { sclera: [16, 22, 28], ring0: [50, 60, 60], ring: [150, 160, 140], iris: [10, 14, 16], pupil: 0.5 }, lid: 0x4a5a64 }),
  extras(c) {
    [1, -1].forEach(sg => { for (let k = 0; k < 7; k++) { const u = 0.03 + k * 0.02, y = -0.004, z = c.prof.surfZ(u, y) * 0.92; c.D.cone([0.5 - u, y - 0.004, sg * z], [0.5 - u, y + 0.007, sg * z * 0.98], 0.0014, 0xf4f0e4, 4); } });
    // caudal keels on the peduncle
    [1, -1].forEach(sg => c.D.rod([0.5 - 0.86, 0.0, sg * 0.016], [0.5 - 1.0, 0.0, sg * 0.016], 0.0032, 0.0012, 0x4a6074, 6));
  },
  bend: { A: 0.055, K: 8.4 }
});

SPECIES.push({
  id: 'kingfish', hero: true, name: 'Yellowtail kingfish', sci: 'Seriola lalandi',
  regions: ['Gold Coast', 'Sunshine Coast', 'Moreton Bay'], habitat: 'Offshore reefs, headlands, and around wrecks',
  len: 4.8, count: 5, mode: 'school', band: [0.25, 0.7],
  nodes: [[-8, 1, 1, 1.5], [0, 4, 4, 3.4], [6, 8.2, 7.6, 5.4], [14, 11.6, 10.6, 7.5], [28, 14, 12.6, 8.5], [42, 15, 13.2, 8.8], [58, 13.4, 11.2, 7.8],
    [72, 10, 8.2, 5.8], [86, 6.8, 5.6, 3.8], [96, 4.8, 4.2, 2.6], [100, 4.5, 4, 2.4], [108, 4.3, 3.8, 2.2]],
  cap: 8, gill: { u: 0.2, ru: 0.08, ry: 0.15, amp: 0.005 },
  skin: {
    seed: 25, g: 0.38, stops: [[0, [238, 238, 228]], [0.3, [214, 220, 210]], [0.55, [150, 176, 170]], [0.82, [62, 102, 124]], [1, [44, 78, 104]]],
    layers: SCALES(66, 24, 0.14, [50, 76, 84]).concat([
      { type: 'stripe', col: [236, 196, 70], t: 0.52, w: 0.045, amt: 0.9, u: [0.18, 0.99], wob: 0.01 },
      { type: 'stripe', col: [236, 196, 70], t: 0.52, w: 0.12, amt: 0.2, u: [0.18, 0.99], wob: 0.01 },
      { type: 'back', col: [40, 70, 96], t0: 0.68, t1: 1, amt: 0.5, u: [0, 1] },
      { type: 'fade', col: [220, 190, 80], u0: 0.74, u1: 0.98, amt: 0.55, gate: [0.3, 0.6, 2, 3] }
    ]),
    strokes: [{ pts: [[0.01, 0.43], [0.1, 0.4], [0.2, 0.42]], layers: [[8, 'rgba(30,40,48,0.6)']] }]
  },
  rough: 0.26, metal: 0.35, coat: 0.5, env: 1.1, rim: [0.2, 0.4, 0.42],
  fins: [
    { k: 'dorsal', n: 7, u0: 0.33, u1: 0.45, th0: 0.15, th1: 0.9, len: [[0, 0.05], [0.4, 0.06], [1, 0.04]], sc: 0.15, curve: 0.08, sag: 0.04, spines: 7, spineCol: 0x5a6a60, spineR: 0.002, kA: 4,
      tex: FT([[0, [100, 120, 90, 0.95]], [1, [90, 110, 90, 0.5]]]) },
    { k: 'dorsal', n: 20, u0: 0.48, u1: 0.78, th0: 0.55, th1: 0.95, len: [[0, 0.11], [0.1, 0.085], [0.5, 0.05], [1, 0.035]], sc: 0.08, curve: 0.06, sag: 0.02, z: 0.005, kA: 3,
      tex: FT([[0, [200, 180, 70, 0.95]], [0.6, [186, 176, 90, 0.75]], [1, [150, 164, 110, 0.4]]]) },
    { k: 'dorsal', dir: 'down', n: 14, u0: 0.62, u1: 0.8, th0: 0.55, th1: 0.95, len: [[0, 0.075], [0.15, 0.06], [1, 0.035]], sc: 0.08, curve: 0.06, sag: 0, z: 0.005, kA: 3,
      tex: FT([[0, [210, 190, 90, 0.92]], [1, [200, 204, 150, 0.4]]]) },
    { k: 'caudal', n: 17, u: 0.995, p0: -0.9, p1: 0.9, L: 0.27, shape: SHP.fork(0.45), sc: 0.04, kA: 4, nB: 10,
      tex: FT([[0, [226, 182, 50, 0.97]], [0.6, [236, 196, 70, 0.93]], [1, [220, 190, 80, 0.8]]], { ray: 'rgba(255,230,140,0.4)' }) },
    { k: 'pair', n: 12, u0: 0.24, u1: 0.24, y0: -0.03, y1: -0.075, psi0: 0.6, psi1: -1.0, L: 0.12, len: [[0, 0.7], [0.4, 1], [1, 0.5]], sc: 0.08, flare: 0.03, droop: 0.04, kA: 4,
      tex: FT([[0, [190, 180, 90, 0.95]], [1, [210, 210, 160, 0.4]]]) },
    { k: 'pair', n: 6, u0: 0.28, u1: 0.31, y0: -0.13, y1: -0.125, psi0: -0.9, psi1: -1.3, L: 0.09, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.12, flare: 0.02, droop: 0.02, kA: 4,
      tex: FT([[0, [226, 200, 90, 0.92]], [1, [240, 230, 170, 0.4]]]) }
  ],
  mouth: { u: 0.15, yC: -0.012, yN: 0.0, col: 0x6a7e7c, lip: 0.0034, sep: 0.007 },
  eye: EYE(0.108, 0.026, 0.026, { pal: { sclera: [20, 26, 26], ring0: [70, 70, 40], ring: [200, 180, 90], iris: [14, 16, 14], pupil: 0.5 }, lid: 0x4a6a64 }),
  bend: { A: 0.06, K: 7.8 }
});

SPECIES.push({
  id: 'trevally', hero: true, name: 'Golden trevally', sci: 'Gnathanodon speciosus',
  regions: ['Moreton Bay', 'Gold Coast', 'Sunshine Coast'], habitat: 'Reefs and sandy flats; juveniles shadow larger fish and sharks',
  len: 3.2, count: 5, mode: 'school', band: [0.15, 0.55],
  nodes: [[-8, 1.5, 1.5, 2], [0, 5.5, 5.5, 4.2], [6, 12, 11, 7.2], [14, 18, 16, 9.8], [26, 22.5, 20.5, 11.2], [40, 24, 21.5, 11.6], [55, 21, 18, 10.2],
    [70, 15.8, 12.8, 7.6], [84, 10, 8.2, 5], [96, 6.2, 5.6, 3.2], [100, 5.6, 5, 2.8], [108, 5.2, 4.6, 2.6]],
  cap: 7, gill: { u: 0.2, ru: 0.08, ry: 0.15, amp: 0.006 },
  skin: {
    seed: 31, g: 0.5, stops: [[0, [252, 240, 180]], [0.3, [244, 214, 110]], [0.6, [232, 186, 64]], [0.85, [196, 150, 48]], [1, [150, 120, 44]]],
    layers: SCALES(54, 22, 0.16, [130, 96, 24]).concat([
      { type: 'bars', col: [34, 30, 24], u: [0.2, 0.92], n: 6.5, lo: 0.68, hi: 0.9, amt: 0.5, warp: 0.8, gate: [0.1, 0.4, 2, 3] },
      { type: 'head', col: [200, 150, 50], u1: 0.2, amt: 0.3, gate: [0.3, 0.6, 2, 3] }
    ]),
    strokes: [{ pts: [[0.2, 0.42], [0.22, 0.3], [0.2, 0.17]], layers: [[8, 'rgba(120,80,20,0.4)']] }]
  },
  rough: 0.3, metal: 0.25, coat: 0.5, env: 1.0, rim: [0.4, 0.36, 0.2],
  fins: [
    { k: 'dorsal', n: 7, u0: 0.31, u1: 0.42, th0: 0.15, th1: 0.9, len: [[0, 0.06], [0.4, 0.07], [1, 0.045]], sc: 0.15, curve: 0.08, sag: 0.04, spines: 7, spineCol: 0x8a7030, spineR: 0.0024, kA: 4,
      tex: FT([[0, [230, 190, 80, 0.95]], [1, [210, 180, 90, 0.5]]]) },
    { k: 'dorsal', n: 22, u0: 0.46, u1: 0.76, th0: 0.5, th1: 0.95, len: [[0, 0.22], [0.12, 0.14], [0.5, 0.075], [1, 0.045]], sc: 0.08, curve: 0.1, sag: 0.02, z: 0.006, kA: 3,
      tex: FT([[0, [236, 192, 70, 0.96]], [0.6, [230, 190, 90, 0.8]], [1, [220, 196, 120, 0.4]]], { ray: 'rgba(255,236,160,0.45)' }) },
    { k: 'dorsal', dir: 'down', n: 18, u0: 0.62, u1: 0.8, th0: 0.5, th1: 0.95, len: [[0, 0.17], [0.15, 0.11], [0.5, 0.06], [1, 0.04]], sc: 0.08, curve: 0.1, sag: 0, z: 0.006, kA: 3,
      tex: FT([[0, [236, 196, 80, 0.95]], [1, [228, 204, 130, 0.4]]]) },
    { k: 'caudal', n: 17, u: 0.995, p0: -0.9, p1: 0.9, L: 0.3, shape: SHP.fork(0.5), sc: 0.04, kA: 4, nB: 10,
      tex: FT([[0, [232, 188, 60, 0.97]], [0.6, [238, 200, 80, 0.93]], [1, [226, 196, 90, 0.8]]], { ray: 'rgba(255,236,160,0.4)' }) },
    { k: 'pair', n: 12, u0: 0.24, u1: 0.24, y0: -0.0, y1: -0.07, psi0: 0.8, psi1: -1.0, L: 0.16, len: [[0, 0.6], [0.3, 1], [0.7, 0.85], [1, 0.5]], sc: 0.08, flare: 0.04, droop: 0.04, kA: 4,
      tex: FT([[0, [230, 190, 80, 0.95]], [1, [240, 220, 150, 0.4]]]) },
    { k: 'pair', n: 6, u0: 0.28, u1: 0.31, y0: -0.2, y1: -0.19, psi0: -0.9, psi1: -1.3, L: 0.1, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.12, flare: 0.03, droop: 0.02, kA: 4,
      tex: FT([[0, [240, 210, 100, 0.92]], [1, [250, 236, 170, 0.4]]]) }
  ],
  mouth: { u: 0.09, yC: -0.032, yN: -0.012, col: 0xe0b860, lip: 0.0058, sep: 0.008 },
  eye: EYE(0.115, 0.04, 0.028, { dir: [0.2, 0.12, 0.97], pal: { sclera: [40, 30, 14], ring0: [120, 84, 20], ring: [226, 176, 50], iris: [30, 20, 8], pupil: 0.46 }, lid: 0xb08a30 }),
  extras(c) { // pilot-fish style thick lips handled by mouth; faint finlets none
  },
  bend: { A: 0.07, K: 7.4 }
});

SPECIES.push({
  id: 'cobia', hero: true, name: 'Cobia', sci: 'Rachycentron canadum',
  regions: ['Moreton Bay', 'Gold Coast', 'Sunshine Coast'], habitat: 'Around reefs, wrecks and navigation markers; often shadows rays and sharks',
  len: 5.0, count: 2, mode: 'cruise', band: [0.1, 0.5],
  nodes: [[-8, 1, 1, 2], [0, 2.6, 2.8, 4], [8, 5, 4.5, 7.5], [16, 8, 6.5, 9.5], [28, 10, 8.5, 9.5], [44, 11, 9.5, 8.8], [58, 10, 8.5, 7.8],
    [72, 8, 7, 6], [86, 5.8, 5, 4], [96, 4.4, 4, 2.8], [100, 4.2, 3.8, 2.6], [108, 4, 3.6, 2.4]],
  cap: 8, P: 2.3, gill: { u: 0.24, ru: 0.07, ry: 0.12, amp: 0.004 },
  skin: {
    seed: 33, g: 0.34, stops: [[0, [240, 236, 220]], [0.3, [212, 204, 182]], [0.55, [118, 96, 74]], [0.8, [66, 54, 44]], [1, [48, 40, 34]]],
    layers: [
      { type: 'stripe', col: [30, 24, 20], t: 0.56, w: 0.07, amt: 0.85, u: [0.12, 0.98], wob: 0.01 },
      { type: 'stripe', col: [236, 228, 208], t: 0.4, w: 0.045, amt: 0.5, u: [0.14, 0.96] },
      { type: 'marble', col: [38, 30, 24], lo: 0.5, hi: 0.8, amt: 0.3, bias: 0.8 },
      { type: 'speck', col: [20, 16, 12], lo: 0.8, hi: 0.95, amt: 0.2, gate: [0.5, 0.7, 2, 3] }
    ],
    strokes: [{ pts: [[0.012, 0.37], [0.1, 0.33], [0.2, 0.36]], layers: [[5, 'rgba(24,18,14,0.5)']] }]
  },
  rough: 0.4, metal: 0.05, coat: 0.5, env: 0.9, rim: [0.2, 0.3, 0.3],
  fins: [
    { k: 'dorsal', n: 8, u0: 0.26, u1: 0.46, th0: 0.15, th1: 0.9, len: [[0, 0.035], [0.4, 0.05], [1, 0.035]], sc: 0.95, curve: 0.08, sag: 0.04, spines: 8, spineCol: 0x2a2018, spineR: 0.0026, kA: 3,
      tex: FT([[0, [50, 40, 34, 0.95]], [1, [50, 40, 34, 0.7]]]) },
    { k: 'dorsal', n: 18, u0: 0.5, u1: 0.8, th0: 0.55, th1: 0.95, len: [[0, 0.1], [0.15, 0.085], [0.6, 0.055], [1, 0.04]], sc: 0.08, curve: 0.1, sag: 0.02, z: 0.005, kA: 3,
      tex: FT([[0, [64, 52, 44, 0.95]], [0.6, [70, 60, 50, 0.8]], [1, [100, 90, 76, 0.4]]]) },
    { k: 'dorsal', dir: 'down', n: 18, u0: 0.6, u1: 0.8, th0: 0.55, th1: 0.95, len: [[0, 0.075], [0.2, 0.06], [1, 0.035]], sc: 0.08, curve: 0.08, sag: 0, z: 0.005, kA: 3,
      tex: FT([[0, [110, 94, 78, 0.92]], [1, [190, 180, 160, 0.4]]]) },
    { k: 'caudal', n: 17, u: 0.995, p0: -0.75, p1: 0.95, L: 0.2, shape: [[0, 0.8], [0.5, 0.95], [1, 1]], sc: 0.05, kA: 4, nB: 10, tilt: 0.06,
      tex: FT([[0, [60, 50, 44, 0.96]], [0.6, [70, 60, 50, 0.9]], [1, [40, 34, 30, 0.8]]]) },
    { k: 'pair', n: 12, u0: 0.28, u1: 0.28, y0: -0.0, y1: -0.05, psi0: 0.4, psi1: -0.9, L: 0.14, len: [[0, 0.6], [0.4, 1], [1, 0.7]], sc: 0.06, flare: 0.05, droop: 0.04, kA: 4,
      tex: FT([[0, [64, 54, 46, 0.96]], [1, [80, 70, 60, 0.6]]]) },
    { k: 'pair', n: 6, u0: 0.28, u1: 0.31, y0: -0.115, y1: -0.11, psi0: -0.9, psi1: -1.3, L: 0.09, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.12, flare: 0.03, droop: 0.02, kA: 4,
      tex: FT([[0, [220, 214, 196, 0.9]], [1, [236, 232, 220, 0.4]]]) }
  ],
  mouth: { u: 0.16, yC: -0.008, yN: -0.002, col: 0x6a5a48, lip: 0.0038, sep: 0.007 },
  eye: EYE(0.11, 0.024, 0.02, { dir: [0.2, 0.3, 0.9], pal: { sclera: [18, 14, 10], ring0: [60, 48, 30], ring: [150, 120, 70], iris: [12, 10, 8], pupil: 0.5 }, lid: 0x3a3028 }),
  bend: { A: 0.07, K: 6.8 }
});

SPECIES.push({
  id: 'jack', hero: true, name: 'Mangrove jack', sci: 'Lutjanus argentimaculatus',
  regions: ['Brisbane', 'Moreton Bay', 'Gold Coast', 'Sunshine Coast'], habitat: 'Mangrove snags, rock bars, pylons and estuary reaches',
  len: 3.0, count: 4, mode: 'lurk', band: [0.05, 0.4],
  nodes: [[-8, 1.5, 1.5, 2], [0, 6, 6, 4.8], [6, 12, 10.5, 7.8], [14, 17, 14.5, 10.2], [26, 21, 17.8, 11.8], [40, 22, 18.6, 12.2], [55, 19.5, 16, 10.5],
    [70, 15, 12, 8], [84, 9.6, 8, 5.2], [96, 6.4, 5.8, 3.4], [100, 6, 5.4, 3.2], [108, 5.8, 5.2, 3]],
  cap: 8, gill: { u: 0.21, ru: 0.08, ry: 0.15, amp: 0.007 },
  skin: {
    seed: 37, g: 0.5, stops: [[0, [238, 196, 160]], [0.25, [226, 142, 98]], [0.55, [196, 88, 52]], [0.85, [148, 56, 36]], [1, [108, 44, 32]]],
    layers: SCALES(48, 22, 0.28, [92, 30, 20]).concat([
      { type: 'marble', col: [74, 28, 22], lo: 0.5, hi: 0.82, amt: 0.35, bias: 0.8 },
      { type: 'head', col: [150, 56, 40], u1: 0.22, amt: 0.28, gate: [0.3, 0.6, 2, 3] },
      { type: 'speck', col: [250, 210, 170], lo: 0.82, hi: 0.95, amt: 0.25 }
    ]),
    strokes: [{ pts: [[0.2, 0.42], [0.22, 0.3], [0.2, 0.17]], layers: [[8, 'rgba(70,24,16,0.5)']] },
      { pts: [[0.05, 0.27], [0.1, 0.24], [0.16, 0.255]], layers: [[3.2, 'rgba(120,200,230,0.55)']] }]
  },
  rough: 0.36, metal: 0.15, coat: 0.6, env: 1.0, rim: [0.4, 0.3, 0.26],
  fins: [
    { k: 'dorsal', n: 10, u0: 0.27, u1: 0.5, th0: 0.15, th1: 0.9, len: [[0, 0.09], [0.2, 0.14], [0.6, 0.13], [1, 0.09]], sc: 0.1, curve: 0.08, sag: 0.04, spines: 10, spineCol: 0x8a3020, spineR: 0.0028, kA: 4,
      tex: FT([[0, [200, 70, 40, 0.95]], [0.6, [180, 60, 40, 0.82]], [1, [130, 46, 36, 0.5]]], { ray: 'rgba(250,180,150,0.45)' }) },
    { k: 'dorsal', n: 12, u0: 0.51, u1: 0.7, th0: 0.55, th1: 0.95, len: [[0, 0.1], [0.4, 0.105], [1, 0.07]], sc: 0.08, curve: 0.08, sag: 0.03, z: 0.008,
      tex: FT([[0, [206, 84, 50, 0.92]], [0.6, [190, 74, 48, 0.7]], [1, [150, 60, 46, 0.35]]]) },
    { k: 'dorsal', dir: 'down', n: 8, u0: 0.665, u1: 0.8, th0: 0.4, th1: 0.95, len: [[0, 0.075], [0.2, 0.105], [1, 0.07]], sc: 0.1, curve: 0.06, sag: 0, z: 0.008,
      tex: FT([[0, [216, 88, 52, 0.94]], [0.6, [206, 100, 64, 0.7]], [1, [220, 150, 110, 0.35]]]) },
    { k: 'caudal', n: 17, u: 0.99, p0: -0.82, p1: 0.82, L: 0.26, shape: [[0, 0.85], [0.5, 1], [1, 0.85]], sc: 0.05, kA: 4, nB: 10,
      tex: FT([[0, [210, 84, 48, 0.96]], [0.6, [196, 70, 44, 0.92]], [1, [120, 40, 32, 0.82]]], { ray: 'rgba(250,180,140,0.45)' }) },
    { k: 'pair', n: 14, u0: 0.235, u1: 0.235, y0: 0.02, y1: -0.07, psi0: 1.1, psi1: -1.1, L: 0.2, len: [[0, 0.6], [0.3, 1], [0.7, 0.85], [1, 0.5]], sc: 0.08, flare: 0.05, droop: 0.04, kA: 4,
      tex: FT([[0, [216, 100, 60, 0.95]], [0.6, [226, 140, 100, 0.6]], [1, [240, 190, 160, 0.25]]]) },
    { k: 'pair', n: 6, u0: 0.28, u1: 0.33, y0: -0.2, y1: -0.19, psi0: -0.9, psi1: -1.3, L: 0.14, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.12, flare: 0.04, droop: 0.02, kA: 4,
      tex: FT([[0, [220, 84, 50, 0.96]], [1, [240, 150, 110, 0.5]]]) }
  ],
  mouth: { u: 0.1, yC: -0.032, yN: -0.012, col: 0xc87050, lip: 0.0058, sep: 0.008 },
  eye: EYE(0.12, 0.04, 0.03, { pal: { sclera: [50, 14, 10], ring0: [130, 30, 20], ring: [226, 90, 40], iris: [30, 10, 6], pupil: 0.44 }, lid: 0xa04030 }),
  extras(c) {
    [1, -1].forEach(sg => { for (let k = 0; k < 4; k++) { const u = 0.03 + k * 0.016, y = -0.016, z = c.prof.surfZ(u, y) * 0.88; c.D.cone([0.5 - u, y, sg * z], [0.5 - u, y + 0.012, sg * z * 0.95], 0.0017, 0xf6f0e0, 4); } });
  },
  bend: { A: 0.06, K: 7.2 }
});

/* ---- 06_species_c.js ---- */
/* ---------- batch C: freshwater natives, reef & schooling species ---------- */
SPECIES.push({
  id: 'bass', hero: true, name: 'Australian bass', sci: 'Macquaria novemaculeata',
  regions: ['Brisbane', 'Gold Coast', 'Sunshine Coast'], habitat: 'Coastal rivers and estuaries; breeds in brackish water',
  len: 2.3, count: 6, mode: 'lurk', band: [0.1, 0.5],
  nodes: [[-8, 1.5, 1.5, 2], [0, 4.5, 4.5, 3.4], [6, 9, 7.6, 5.6], [14, 14.5, 11.5, 8.2], [26, 19.5, 15.5, 10.6], [40, 21, 16.8, 11.2], [55, 18.8, 14.6, 9.8],
    [70, 14, 10.8, 7], [84, 9, 7.4, 4.6], [96, 6.2, 5.4, 3.2], [100, 5.8, 5, 3], [108, 5.6, 4.8, 2.8]],
  cap: 9, gill: { u: 0.21, ru: 0.08, ry: 0.15, amp: 0.006 },
  skin: {
    seed: 41, g: 0.5, stops: [[0, [236, 226, 176]], [0.25, [216, 196, 120]], [0.55, [150, 130, 68]], [0.85, [88, 78, 40]], [1, [64, 58, 32]]],
    layers: SCALES(46, 20, 0.26, [56, 48, 24]).concat([
      { type: 'marble', col: [44, 40, 22], lo: 0.5, hi: 0.82, amt: 0.35, bias: 0.8 },
      { type: 'head', col: [92, 82, 40], u1: 0.22, amt: 0.3, gate: [0.3, 0.6, 2, 3] },
      { type: 'stripe', col: [236, 214, 130], t: 0.46, w: 0.06, amt: 0.3, u: [0.22, 0.96] }
    ]),
    strokes: [{ pts: [[0.21, 0.42], [0.235, 0.3], [0.21, 0.17]], layers: [[8, 'rgba(50,44,22,0.5)']] }]
  },
  rough: 0.34, metal: 0.2, coat: 0.55, env: 1.0, rim: [0.3, 0.38, 0.3],
  fins: [
    { k: 'dorsal', n: 9, u0: 0.3, u1: 0.5, th0: 0.15, th1: 0.9, len: [[0, 0.1], [0.2, 0.15], [0.6, 0.14], [1, 0.1]], sc: 0.1, curve: 0.08, sag: 0.04, spines: 9, spineCol: 0x4a4020, spineR: 0.0028, kA: 4,
      tex: FT([[0, [96, 86, 44, 0.95]], [0.6, [84, 76, 40, 0.82]], [1, [60, 56, 34, 0.5]]]) },
    { k: 'dorsal', n: 11, u0: 0.515, u1: 0.68, th0: 0.55, th1: 0.95, len: [[0, 0.1], [0.4, 0.105], [1, 0.07]], sc: 0.08, curve: 0.08, sag: 0.03, z: 0.007,
      tex: FT([[0, [120, 108, 56, 0.92]], [0.6, [110, 100, 58, 0.68]], [1, [100, 96, 66, 0.3]]]) },
    { k: 'dorsal', dir: 'down', n: 8, u0: 0.665, u1: 0.8, th0: 0.4, th1: 0.95, len: [[0, 0.08], [0.2, 0.1], [1, 0.065]], sc: 0.1, curve: 0.06, sag: 0, z: 0.007,
      tex: FT([[0, [160, 140, 64, 0.92]], [1, [176, 164, 100, 0.4]]]) },
    { k: 'caudal', n: 17, u: 0.99, p0: -0.8, p1: 0.8, L: 0.22, shape: [[0, 0.85], [0.5, 1], [1, 0.85]], sc: 0.04, kA: 4, nB: 10,
      tex: FT([[0, [100, 90, 46, 0.96]], [0.6, [88, 80, 44, 0.9]], [1, [48, 44, 28, 0.82]]]) },
    { k: 'pair', n: 14, u0: 0.25, u1: 0.25, y0: 0.0, y1: -0.065, psi0: 1.0, psi1: -1.0, L: 0.17, len: [[0, 0.6], [0.3, 1], [0.7, 0.85], [1, 0.5]], sc: 0.08, flare: 0.04, droop: 0.04, kA: 4,
      tex: FT([[0, [170, 150, 76, 0.95]], [0.6, [176, 168, 120, 0.5]], [1, [200, 196, 170, 0.2]]]) },
    { k: 'pair', n: 6, u0: 0.28, u1: 0.33, y0: -0.18, y1: -0.17, psi0: -0.9, psi1: -1.3, L: 0.1, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.12, flare: 0.03, droop: 0.02, kA: 4,
      tex: FT([[0, [210, 190, 100, 0.92]], [1, [226, 214, 150, 0.4]]]) }
  ],
  mouth: { u: 0.12, yC: -0.028, yN: -0.006, col: 0x8a7a40, lip: 0.0048, sep: 0.008 },
  eye: EYE(0.125, 0.04, 0.026, { pal: { sclera: [30, 26, 12], ring0: [90, 70, 20], ring: [200, 170, 60], iris: [22, 18, 8], pupil: 0.46 }, lid: 0x6a5a28 }),
  bend: { A: 0.065, K: 7.2 }
});

SPECIES.push({
  id: 'marycod', hero: true, name: 'Mary River cod', sci: 'Maccullochella mariensis',
  regions: ['Sunshine Coast'], habitat: 'Freshwater; endangered, native to the Mary River system',
  len: 3.2, count: 2, mode: 'lurk', band: [0.0, 0.2],
  nodes: [[-8, 2, 2, 2.5], [0, 6, 6, 5.6], [6, 12, 10.5, 9.6], [16, 17, 14, 12.5], [28, 20, 16, 14], [42, 20, 16.5, 14.2], [56, 18, 15, 12.4],
    [70, 13.5, 11, 9], [84, 9, 8, 5.8], [96, 6.8, 6, 4], [100, 6.6, 5.8, 3.8], [108, 6.4, 5.6, 3.6]],
  cap: 10, P: 2.3, gill: { u: 0.25, ru: 0.09, ry: 0.15, amp: 0.008 },
  skin: {
    seed: 45, g: 0.42, stops: [[0, [196, 190, 136]], [0.25, [150, 146, 84]], [0.55, [102, 104, 56]], [0.85, [66, 70, 38]], [1, [48, 52, 30]]],
    layers: [
      { type: 'marble', col: [36, 40, 22], lo: 0.42, hi: 0.66, amt: 0.72, bias: 0.4, sc: 1.4 },
      { type: 'blotch', col: [150, 150, 92], lo: 0.6, hi: 0.78, amt: 0.4, gate: [0.2, 0.4, 0.9, 1.1] },
      { type: 'speck', col: [210, 206, 150], lo: 0.8, hi: 0.94, amt: 0.3 },
      { type: 'speck', col: [24, 26, 14], lo: 0.84, hi: 0.95, amt: 0.4, sc: 0.6 },
      { type: 'head', col: [60, 64, 32], u1: 0.28, amt: 0.3, gate: [0.3, 0.6, 2, 3] }
    ],
    strokes: [{ pts: [[0.25, 0.42], [0.27, 0.3], [0.25, 0.17]], layers: [[8, 'rgba(30,34,16,0.55)']] }]
  },
  rough: 0.46, metal: 0, coat: 0.55, env: 0.8, rim: [0.2, 0.3, 0.26],
  fins: [
    { k: 'dorsal', n: 13, u0: 0.3, u1: 0.56, th0: 0.15, th1: 0.9, len: [[0, 0.07], [0.3, 0.095], [0.7, 0.09], [1, 0.07]], sc: 0.1, curve: 0.08, sag: 0.04, spines: 13, spineCol: 0x34381c, spineR: 0.003, kA: 4,
      tex: FT([[0, [78, 82, 44, 0.95]], [0.6, [70, 76, 42, 0.85]], [1, [50, 56, 32, 0.55]]]) },
    { k: 'dorsal', n: 16, u0: 0.575, u1: 0.8, th0: 0.55, th1: 0.95, len: [[0, 0.08], [0.4, 0.09], [1, 0.06]], sc: 0.08, curve: 0.08, sag: 0.03, z: 0.008, kA: 3,
      tex: FT([[0, [96, 98, 52, 0.92]], [0.6, [88, 92, 54, 0.75]], [1, [80, 86, 56, 0.4]]]) },
    { k: 'dorsal', dir: 'down', n: 11, u0: 0.66, u1: 0.82, th0: 0.4, th1: 0.95, len: [[0, 0.07], [0.2, 0.09], [1, 0.06]], sc: 0.1, curve: 0.06, sag: 0, z: 0.007,
      tex: FT([[0, [100, 100, 56, 0.92]], [1, [120, 120, 76, 0.45]]]) },
    { k: 'caudal', n: 17, u: 0.99, p0: -1.0, p1: 1.0, L: 0.2, shape: SHP.round, sc: 0.04, kA: 4, nB: 10,
      tex: FT([[0, [76, 80, 42, 0.96]], [0.6, [64, 70, 38, 0.9]], [1, [36, 40, 24, 0.85]]]) },
    { k: 'pair', n: 16, u0: 0.28, u1: 0.28, y0: -0.0, y1: -0.07, psi0: 0.8, psi1: -0.8, L: 0.16, len: [[0, 0.6], [0.3, 1], [0.7, 0.95], [1, 0.6]], sc: 0.05, flare: 0.05, droop: 0.04, kA: 4,
      tex: FT([[0, [110, 112, 60, 0.95]], [0.6, [120, 122, 78, 0.65]], [1, [150, 150, 110, 0.3]]]) },
    { k: 'pair', n: 6, u0: 0.28, u1: 0.33, y0: -0.16, y1: -0.15, psi0: -0.9, psi1: -1.3, L: 0.1, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.1, flare: 0.04, droop: 0.02, kA: 4,
      tex: FT([[0, [140, 140, 80, 0.92]], [1, [176, 176, 120, 0.4]]]) }
  ],
  mouth: { u: 0.22, yC: -0.014, yN: -0.002, col: 0x5a5c30, lip: 0.0064, sep: 0.01 },
  eye: EYE(0.14, 0.046, 0.022, { dir: [0.15, 0.55, 0.8], pal: { sclera: [24, 24, 10], ring0: [70, 70, 20], ring: [170, 160, 60], iris: [20, 20, 8], pupil: 0.5 }, lid: 0x5a5c2c }),
  bend: { A: 0.05, K: 6.8 }
});

SPECIES.push({
  id: 'lungfish', hero: true, name: 'Australian lungfish', sci: 'Neoceratodus forsteri',
  regions: ['Brisbane', 'Sunshine Coast'], habitat: 'Slow, weedy pools of the Mary and Burnett rivers; introduced to the Brisbane River',
  len: 4.2, count: 2, mode: 'bottom', band: [0.0, 0.12],
  nodes: [[-8, 1.5, 1.5, 2], [0, 4, 4, 4], [8, 8, 7, 7], [18, 10.5, 9.5, 8.8], [30, 11.5, 10.5, 9.5], [45, 11, 10, 9.2], [60, 9.8, 9, 8.2],
    [75, 8, 7.2, 6.4], [88, 6, 5.4, 4.6], [98, 4.4, 4, 3.4], [100, 4, 3.6, 3], [108, 3.4, 3, 2.6]],
  cap: 10, P: 2.3, gill: { u: 0.2, ru: 0.07, ry: 0.15, amp: 0.005 },
  skin: {
    seed: 49, g: 0.42, stops: [[0, [236, 168, 112]], [0.2, [216, 148, 96]], [0.5, [158, 124, 70]], [0.8, [92, 80, 46]], [1, [64, 56, 34]]],
    layers: SCALES(26, 12, 0.38, [60, 46, 24]).concat([
      { type: 'marble', col: [50, 44, 24], lo: 0.46, hi: 0.76, amt: 0.5, bias: 0.6 },
      { type: 'speck', col: [226, 190, 120], lo: 0.8, hi: 0.94, amt: 0.3 },
      { type: 'head', col: [100, 86, 44], u1: 0.22, amt: 0.35, gate: [0.3, 0.6, 2, 3] }
    ]),
    strokes: []
  },
  rough: 0.5, metal: 0, coat: 0.4, env: 0.7, rim: [0.3, 0.3, 0.22],
  fins: [
    { k: 'dorsal', n: 26, u0: 0.4, u1: 0.99, th0: 0.7, th1: 1.1, len: [[0, 0.05], [0.5, 0.09], [1, 0.1]], sc: 0.05, curve: 0.1, sag: 0.02, z: 0.006, kA: 3, nB: 6,
      tex: FT([[0, [106, 90, 50, 0.95]], [0.6, [110, 96, 60, 0.75]], [1, [130, 118, 80, 0.4]]], { rayW: 0.9 }) },
    { k: 'dorsal', dir: 'down', n: 20, u0: 0.55, u1: 0.99, th0: 0.7, th1: 1.1, len: [[0, 0.04], [0.5, 0.075], [1, 0.09]], sc: 0.05, curve: 0.1, sag: 0, z: 0.006, kA: 3, nB: 6,
      tex: FT([[0, [180, 130, 80, 0.92]], [1, [196, 160, 110, 0.4]]], { rayW: 0.9 }) },
    { k: 'caudal', n: 15, u: 0.99, p0: -1.2, p1: 1.2, L: 0.14, shape: [[0, 0.5], [0.5, 1], [1, 0.5]], sc: 0.02, kA: 4, nB: 8,
      tex: FT([[0, [100, 88, 50, 0.96]], [0.7, [96, 84, 52, 0.85]], [1, [70, 62, 42, 0.6]]], { rayW: 0.9 }) },
    { k: 'pair', n: 8, u0: 0.25, u1: 0.25, y0: -0.03, y1: -0.07, psi0: -0.3, psi1: -1.0, L: 0.2, len: [[0, 0.6], [0.5, 1], [1, 0.5]], sc: 0.05, flare: 0.09, droop: 0.1, kA: 4,
      tex: FT([[0, [158, 118, 70, 0.97]], [0.6, [150, 118, 76, 0.8]], [1, [190, 160, 110, 0.5]]], { rayW: 1.0 }) },
    { k: 'pair', n: 8, u0: 0.6, u1: 0.6, y0: -0.09, y1: -0.11, psi0: -0.3, psi1: -1.0, L: 0.16, len: [[0, 0.6], [0.5, 1], [1, 0.5]], sc: 0.05, flare: 0.08, droop: 0.1, kA: 4,
      tex: FT([[0, [226, 150, 100, 0.95]], [0.6, [210, 140, 94, 0.8]], [1, [226, 180, 130, 0.5]]], { rayW: 1.0 }) }
  ],
  mouth: { u: 0.11, yC: -0.018, yN: -0.008, col: 0x8a6a40, lip: 0.007, sep: 0.008 },
  eye: EYE(0.09, 0.03, 0.012, { dir: [0.1, 0.5, 0.85], pal: { sclera: [30, 24, 12], ring0: [70, 50, 20], ring: [150, 120, 50], iris: [16, 12, 6], pupil: 0.55 }, lid: 0x6a5a30 }),
  bend: { A: 0.08, K: 6.2 }
});

SPECIES.push({
  id: 'groper', hero: true, name: 'Eastern blue groper', sci: 'Achoerodus viridis',
  regions: ['Gold Coast', 'Sunshine Coast', 'Moreton Bay'], habitat: 'Rocky reefs and headlands; males turn blue as they mature',
  len: 4.2, count: 3, mode: 'reef', band: [0.05, 0.4],
  nodes: [[-8, 1.5, 1.5, 2], [0, 6, 6, 5], [6, 15, 10, 8.5], [14, 25, 14.5, 11.5], [26, 27.5, 19, 13.4], [40, 25.5, 20, 13.8], [55, 20.5, 17, 11.8],
    [70, 15.5, 12.5, 8.6], [84, 10.5, 9, 5.8], [96, 7.4, 6.6, 4], [100, 7, 6.2, 3.8], [108, 6.8, 6, 3.6]],
  cap: 8, gill: { u: 0.22, ru: 0.08, ry: 0.17, amp: 0.008 },
  skin: {
    seed: 53, g: 0.5, stops: [[0, [150, 190, 226]], [0.25, [88, 140, 206]], [0.55, [46, 96, 176]], [0.85, [28, 62, 126]], [1, [22, 48, 100]]],
    layers: SCALES(36, 16, 0.34, [14, 36, 84]).concat([
      { type: 'marble', col: [20, 44, 100], lo: 0.5, hi: 0.8, amt: 0.4, bias: 0.6 },
      { type: 'head', col: [92, 130, 170], u1: 0.24, amt: 0.35, gate: [0.3, 0.6, 2, 3] },
      { type: 'belly', col: [170, 200, 226], t0: 0.0, t1: 0.3, amt: 0.4, u: [0, 1] }
    ]),
    strokes: [{ pts: [[0.22, 0.42], [0.245, 0.3], [0.22, 0.17]], layers: [[9, 'rgba(10,30,70,0.5)']] }]
  },
  rough: 0.36, metal: 0.1, coat: 0.6, env: 1.0, rim: [0.1, 0.3, 0.5],
  fins: [
    { k: 'dorsal', n: 22, u0: 0.26, u1: 0.8, th0: 0.4, th1: 0.95, len: [[0, 0.08], [0.2, 0.1], [0.6, 0.1], [1, 0.07]], sc: 0.08, curve: 0.08, sag: 0.03, z: 0.008, spines: 9, spineCol: 0x1c3a78, spineR: 0.0028, kA: 3,
      tex: FT([[0, [40, 90, 170, 0.95]], [0.6, [50, 110, 190, 0.8]], [1, [110, 160, 210, 0.4]]], { ray: 'rgba(170,210,250,0.5)' }) },
    { k: 'dorsal', dir: 'down', n: 13, u0: 0.62, u1: 0.82, th0: 0.4, th1: 0.95, len: [[0, 0.07], [0.2, 0.09], [1, 0.065]], sc: 0.08, curve: 0.06, sag: 0, z: 0.007, kA: 3,
      tex: FT([[0, [40, 90, 170, 0.95]], [1, [110, 160, 210, 0.4]]]) },
    { k: 'caudal', n: 17, u: 0.99, p0: -0.9, p1: 0.9, L: 0.22, shape: SHP.round, sc: 0.04, kA: 4, nB: 10,
      tex: FT([[0, [36, 84, 164, 0.96]], [0.6, [40, 92, 176, 0.9]], [1, [24, 56, 120, 0.82]]], { ray: 'rgba(170,210,250,0.45)' }) },
    { k: 'pair', n: 14, u0: 0.27, u1: 0.27, y0: 0.01, y1: -0.07, psi0: 0.6, psi1: -1.0, L: 0.18, len: [[0, 0.6], [0.3, 1], [0.7, 0.9], [1, 0.55]], sc: 0.06, flare: 0.06, droop: 0.04, kA: 4,
      tex: FT([[0, [56, 110, 190, 0.95]], [0.6, [110, 160, 210, 0.55]], [1, [190, 220, 240, 0.2]]]) },
    { k: 'pair', n: 6, u0: 0.28, u1: 0.33, y0: -0.2, y1: -0.19, psi0: -0.9, psi1: -1.3, L: 0.12, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.1, flare: 0.04, droop: 0.02, kA: 4,
      tex: FT([[0, [50, 100, 180, 0.95]], [1, [130, 180, 220, 0.4]]]) }
  ],
  mouth: { u: 0.085, yC: -0.036, yN: -0.016, col: 0xa890a8, lip: 0.0096, sep: 0.01, lipL: 0.9 },
  eye: EYE(0.115, 0.05, 0.022, { pal: { sclera: [14, 24, 40], ring0: [70, 80, 30], ring: [220, 190, 60], iris: [10, 14, 20], pupil: 0.5 }, lid: 0x2a4a8a, rim: 0xb0d0f0 }),
  extras(c) { // fleshy forehead hump & big front teeth
    [1, -1].forEach(sg => { for (let k = 0; k < 2; k++) { const u = 0.018 + k * 0.012; c.D.cone([0.5 - u, -0.014, sg * 0.006], [0.5 - u + 0.012, -0.002, sg * 0.006], 0.0024, 0xf2ecde, 5); } });
  },
  bend: { A: 0.05, K: 6.8 }
});

SPECIES.push({
  id: 'luderick', hero: true, name: 'Luderick (blackfish)', sci: 'Girella tricuspidata',
  regions: ['Brisbane', 'Moreton Bay', 'Gold Coast', 'Sunshine Coast'], habitat: 'Weedy rock walls, jetties and estuary edges; grazes on algae',
  len: 2.2, count: 12, mode: 'school', band: [0.1, 0.5],
  nodes: [[-8, 1.5, 1.5, 2], [0, 5.5, 5.5, 4], [6, 10.5, 9.4, 6.6], [14, 15.5, 13, 9], [26, 20, 17.4, 11.2], [40, 21.5, 18.5, 11.8], [55, 19, 16, 10.4],
    [70, 14, 11.6, 7.4], [84, 9, 7.8, 4.8], [96, 6.4, 5.8, 3.2], [100, 6, 5.4, 3], [108, 5.8, 5.2, 2.8]],
  cap: 8, gill: { u: 0.21, ru: 0.08, ry: 0.16, amp: 0.006 },
  skin: {
    seed: 57, g: 0.5, stops: [[0, [214, 216, 196]], [0.3, [168, 172, 140]], [0.6, [112, 120, 92]], [0.85, [70, 80, 58]], [1, [52, 60, 42]]],
    layers: SCALES(54, 22, 0.22, [44, 52, 36]).concat([
      { type: 'bars', col: [30, 34, 24], u: [0.24, 0.92], n: 9.5, lo: 0.7, hi: 0.9, amt: 0.62, warp: 0.4, gate: [0.3, 0.5, 2, 3] },
      { type: 'head', col: [70, 78, 56], u1: 0.2, amt: 0.3, gate: [0.3, 0.6, 2, 3] }
    ]),
    strokes: [{ pts: [[0.21, 0.42], [0.23, 0.3], [0.21, 0.17]], layers: [[8, 'rgba(34,40,26,0.5)']] }]
  },
  rough: 0.34, metal: 0.18, coat: 0.5, env: 0.95, rim: [0.25, 0.34, 0.3],
  fins: [
    { k: 'dorsal', n: 16, u0: 0.28, u1: 0.7, th0: 0.15, th1: 0.95, len: [[0, 0.09], [0.2, 0.12], [0.65, 0.12], [1, 0.08]], sc: 0.1, curve: 0.08, sag: 0.04, spines: 14, spineCol: 0x36402a, spineR: 0.0026, kA: 3,
      tex: FT([[0, [60, 68, 44, 0.95]], [0.6, [64, 74, 50, 0.8]], [1, [60, 70, 52, 0.45]]]) },
    { k: 'dorsal', dir: 'down', n: 11, u0: 0.64, u1: 0.82, th0: 0.4, th1: 0.95, len: [[0, 0.075], [0.2, 0.1], [1, 0.065]], sc: 0.1, curve: 0.06, sag: 0, z: 0.007,
      tex: FT([[0, [76, 84, 56, 0.92]], [1, [110, 118, 86, 0.4]]]) },
    { k: 'caudal', n: 15, u: 0.99, p0: -0.85, p1: 0.85, L: 0.22, shape: SHP.fork(0.2), sc: 0.04, kA: 4, nB: 10,
      tex: FT([[0, [70, 80, 52, 0.96]], [0.6, [64, 74, 48, 0.9]], [1, [34, 40, 28, 0.8]]]) },
    { k: 'pair', n: 12, u0: 0.25, u1: 0.25, y0: -0.0, y1: -0.065, psi0: 0.9, psi1: -1.0, L: 0.14, len: [[0, 0.6], [0.3, 1], [0.7, 0.85], [1, 0.5]], sc: 0.08, flare: 0.04, droop: 0.04, kA: 4,
      tex: FT([[0, [96, 104, 70, 0.95]], [1, [160, 168, 130, 0.3]]]) },
    { k: 'pair', n: 6, u0: 0.28, u1: 0.33, y0: -0.19, y1: -0.18, psi0: -0.9, psi1: -1.3, L: 0.09, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.12, flare: 0.03, droop: 0.02, kA: 4,
      tex: FT([[0, [86, 94, 64, 0.92]], [1, [140, 150, 110, 0.4]]]) }
  ],
  mouth: { u: 0.08, yC: -0.03, yN: -0.012, col: 0x6a704c, lip: 0.0046, sep: 0.007 },
  eye: EYE(0.12, 0.04, 0.026, { pal: { sclera: [24, 26, 16], ring0: [80, 74, 30], ring: [190, 170, 70], iris: [16, 16, 10], pupil: 0.5 }, lid: 0x4a5236 }),
  bend: { A: 0.065, K: 7.2 }
});

SPECIES.push({
  id: 'mullet', hero: true, name: 'Sea mullet', sci: 'Mugil cephalus',
  regions: ['Brisbane', 'Moreton Bay', 'Gold Coast', 'Sunshine Coast'], habitat: 'Estuaries, beaches and tidal creeks in large schools; autumn–winter spawning run',
  len: 2.6, count: 14, mode: 'school', band: [0.35, 0.85],
  nodes: [[-8, 1.5, 1.5, 2], [0, 4.5, 4.5, 3.8], [6, 8.5, 7.8, 6.2], [14, 12, 10.8, 7.8], [26, 15.2, 13.2, 8.8], [40, 16, 14, 9.2], [55, 14.4, 12.4, 8.4],
    [70, 11.4, 9.4, 6.6], [84, 8, 7, 4.6], [96, 5.4, 5, 3], [100, 5.2, 4.8, 2.8], [108, 5, 4.6, 2.6]],
  cap: 9, gill: { u: 0.2, ru: 0.08, ry: 0.15, amp: 0.005 },
  skin: {
    seed: 61, g: 0.45, stops: [[0, [242, 244, 240]], [0.3, [216, 224, 220]], [0.6, [160, 176, 172]], [0.85, [100, 118, 114]], [1, [76, 94, 92]]],
    layers: SCALES(34, 14, 0.2, [60, 76, 76]).concat([
      { type: 'stripe', col: [90, 106, 104], t: 0.62, w: 0.014, amt: 0.4, u: [0.2, 0.96] },
      { type: 'stripe', col: [90, 106, 104], t: 0.5, w: 0.014, amt: 0.35, u: [0.2, 0.96] },
      { type: 'stripe', col: [90, 106, 104], t: 0.38, w: 0.014, amt: 0.3, u: [0.2, 0.96] },
      { type: 'stripe', col: [90, 106, 104], t: 0.74, w: 0.014, amt: 0.4, u: [0.2, 0.96] },
      { type: 'back', col: [70, 90, 90], t0: 0.78, t1: 1, amt: 0.45, u: [0, 1] }
    ]),
    strokes: [{ pts: [[0.21, 0.42], [0.23, 0.3], [0.21, 0.17]], layers: [[7, 'rgba(60,76,76,0.4)']] }]
  },
  rough: 0.3, metal: 0.3, coat: 0.5, env: 1.05, rim: [0.2, 0.36, 0.36],
  fins: [
    { k: 'dorsal', n: 4, u0: 0.4, u1: 0.46, th0: 0.15, th1: 0.7, len: [[0, 0.085], [1, 0.07]], sc: 0.1, curve: 0.08, sag: 0.04, spines: 4, spineCol: 0x586666, spineR: 0.0022, kA: 5,
      tex: FT([[0, [100, 116, 112, 0.95]], [1, [120, 134, 130, 0.6]]]) },
    { k: 'dorsal', n: 9, u0: 0.62, u1: 0.72, th0: 0.55, th1: 0.95, len: [[0, 0.085], [1, 0.05]], sc: 0.1, curve: 0.08, sag: 0.03, z: 0.005, kA: 3,
      tex: FT([[0, [140, 154, 150, 0.9]], [1, [190, 204, 200, 0.4]]]) },
    { k: 'dorsal', dir: 'down', n: 9, u0: 0.7, u1: 0.8, th0: 0.55, th1: 0.95, len: [[0, 0.075], [1, 0.05]], sc: 0.1, curve: 0.06, sag: 0, z: 0.005, kA: 3,
      tex: FT([[0, [190, 200, 196, 0.9]], [1, [226, 232, 228, 0.4]]]) },
    { k: 'caudal', n: 15, u: 0.99, p0: -0.85, p1: 0.85, L: 0.25, shape: SHP.fork(0.45), sc: 0.04, kA: 4, nB: 10,
      tex: FT([[0, [130, 146, 142, 0.96]], [0.6, [120, 136, 132, 0.9]], [1, [60, 74, 72, 0.8]]]) },
    { k: 'pair', n: 12, u0: 0.26, u1: 0.26, y0: -0.04, y1: -0.08, psi0: 0.6, psi1: -0.9, L: 0.1, len: [[0, 0.7], [0.4, 1], [1, 0.5]], sc: 0.08, flare: 0.03, droop: 0.04, kA: 4,
      tex: FT([[0, [210, 190, 100, 0.96]], [0.4, [150, 160, 150, 0.8]], [1, [200, 210, 206, 0.35]]]) },
    { k: 'pair', n: 6, u0: 0.38, u1: 0.4, y0: -0.115, y1: -0.11, psi0: -0.9, psi1: -1.3, L: 0.08, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.12, flare: 0.02, droop: 0.02, kA: 4,
      tex: FT([[0, [226, 232, 226, 0.9]], [1, [240, 244, 240, 0.4]]]) }
  ],
  mouth: { u: 0.075, yC: -0.02, yN: -0.006, col: 0x7a8a86, lip: 0.0042, sep: 0.006 },
  eye: EYE(0.115, 0.034, 0.026, { pal: { sclera: [26, 30, 28], ring0: [90, 90, 50], ring: [210, 200, 130], iris: [16, 18, 16], pupil: 0.5 }, lid: 0x6a7a74 }),
  bend: { A: 0.07, K: 7.6 }
});

SPECIES.push({
  id: 'whiting', hero: true, name: 'Sand whiting', sci: 'Sillago ciliata',
  regions: ['Brisbane', 'Moreton Bay', 'Gold Coast', 'Sunshine Coast'], habitat: 'Sandy flats, surf gutters and Moreton Bay banks; buries in sand when alarmed',
  len: 1.9, count: 14, mode: 'school', band: [0.0, 0.2],
  nodes: [[-8, 1, 1, 1.5], [0, 3.4, 3.4, 2.8], [8, 6.2, 5.6, 4.4], [18, 8.2, 7.2, 5.6], [30, 9.2, 8.2, 6.1], [44, 9.2, 8, 6.1], [60, 8.2, 7, 5.3],
    [74, 6.4, 5.4, 4.1], [86, 4.9, 4.3, 3.1], [96, 3.9, 3.5, 2.3], [100, 3.7, 3.3, 2.1], [108, 3.5, 3.1, 1.9]],
  cap: 9, gill: { u: 0.2, ru: 0.07, ry: 0.15, amp: 0.004 },
  skin: {
    seed: 65, g: 0.36, stops: [[0, [248, 246, 238]], [0.3, [236, 226, 196]], [0.6, [218, 196, 148]], [0.85, [186, 160, 112]], [1, [158, 134, 92]]],
    layers: SCALES(66, 24, 0.14, [150, 124, 82]).concat([
      { type: 'stripe', col: [252, 252, 246], t: 0.46, w: 0.05, amt: 0.65, u: [0.2, 0.97] },
      { type: 'speck', col: [170, 130, 80], lo: 0.8, hi: 0.94, amt: 0.35, gate: [0.6, 0.8, 2, 3] },
      { type: 'back', col: [150, 124, 84], t0: 0.72, t1: 1, amt: 0.4, u: [0, 1] }
    ]),
    strokes: []
  },
  rough: 0.3, metal: 0.2, coat: 0.5, env: 1.0, rim: [0.3, 0.34, 0.3],
  fins: [
    { k: 'dorsal', n: 11, u0: 0.3, u1: 0.5, th0: 0.3, th1: 0.95, len: [[0, 0.08], [0.3, 0.095], [1, 0.05]], sc: 0.1, curve: 0.08, sag: 0.04, spines: 11, spineCol: 0xb8a070, spineR: 0.002, kA: 3,
      tex: FT([[0, [220, 204, 160, 0.9]], [1, [236, 228, 200, 0.45]]]) },
    { k: 'dorsal', n: 16, u0: 0.56, u1: 0.78, th0: 0.55, th1: 0.95, len: [[0, 0.07], [0.3, 0.075], [1, 0.045]], sc: 0.08, curve: 0.08, sag: 0.03, z: 0.005, kA: 3,
      tex: FT([[0, [226, 212, 170, 0.85]], [1, [240, 234, 214, 0.35]]]) },
    { k: 'dorsal', dir: 'down', n: 15, u0: 0.56, u1: 0.78, th0: 0.55, th1: 0.95, len: [[0, 0.06], [0.3, 0.065], [1, 0.04]], sc: 0.08, curve: 0.06, sag: 0, z: 0.005, kA: 3,
      tex: FT([[0, [240, 232, 200, 0.85]], [1, [248, 244, 232, 0.35]]]) },
    { k: 'caudal', n: 15, u: 0.99, p0: -0.8, p1: 0.8, L: 0.2, shape: SHP.fork(0.22), sc: 0.04, kA: 4, nB: 10,
      tex: FT([[0, [226, 210, 164, 0.94]], [0.6, [230, 218, 180, 0.8]], [1, [200, 184, 140, 0.6]]]) },
    { k: 'pair', n: 12, u0: 0.24, u1: 0.24, y0: -0.02, y1: -0.06, psi0: 0.5, psi1: -0.9, L: 0.09, len: [[0, 0.7], [0.4, 1], [1, 0.5]], sc: 0.08, flare: 0.025, droop: 0.04, kA: 4,
      tex: FT([[0, [226, 210, 160, 0.9]], [1, [240, 232, 210, 0.3]]]) },
    { k: 'pair', n: 5, u0: 0.28, u1: 0.3, y0: -0.1, y1: -0.095, psi0: -0.9, psi1: -1.3, L: 0.065, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.12, flare: 0.015, droop: 0.02, kA: 4,
      tex: FT([[0, [250, 246, 236, 0.9]], [1, [250, 248, 244, 0.4]]]) }
  ],
  mouth: { u: 0.05, yC: -0.018, yN: -0.006, col: 0xc8b088, lip: 0.003, sep: 0.005 },
  eye: EYE(0.095, 0.03, 0.02, { dir: [0.1, 0.4, 0.9], pal: { sclera: [40, 34, 20], ring0: [100, 84, 40], ring: [210, 190, 110], iris: [20, 18, 10], pupil: 0.5 }, lid: 0xa89870 }),
  bend: { A: 0.07, K: 8 }
});

SPECIES.push({
  id: 'mahi', hero: true, name: 'Dolphinfish (mahi-mahi)', sci: 'Coryphaena hippurus',
  regions: ['Gold Coast', 'Sunshine Coast', 'Moreton Bay'], habitat: 'Open water offshore, often around floating weed and FADs; fast, short-lived',
  len: 4.2, count: 4, mode: 'pelagic', band: [0.55, 0.95],
  nodes: [[-8, 1.5, 1.5, 1.5], [0, 4, 4, 2.2], [4, 10, 5, 3.4], [10, 15, 7, 4.6], [18, 17, 9, 5.6], [30, 16, 10, 5.8], [44, 13.5, 9.5, 5.4], [58, 10.5, 8, 4.6],
    [72, 8, 6.4, 3.6], [86, 5.8, 4.8, 2.6], [96, 4.2, 3.6, 1.8], [100, 4, 3.4, 1.6], [108, 3.8, 3.2, 1.5]],
  cap: 6, gill: { u: 0.2, ru: 0.07, ry: 0.15, amp: 0.004 },
  skin: {
    seed: 69, g: 0.42, stops: [[0, [244, 240, 190]], [0.3, [236, 212, 100]], [0.55, [150, 200, 120]], [0.78, [40, 160, 150]], [1, [24, 120, 150]]],
    layers: SCALES(70, 26, 0.1, [90, 130, 90]).concat([
      { type: 'spots', col: [30, 150, 230], cu: 70, cs: 14, r: 0.22, p: 0.5, jit: 0.9, amt: 0.8, gate: [0.45, 0.6, 0.95, 1.05], uw: [0.2, 0.96] },
      { type: 'spots', col: [220, 220, 40], cu: 40, cs: 8, r: 0.2, p: 0.2, jit: 0.9, amt: 0.7, gate: [0.2, 0.3, 0.55, 0.65], uw: [0.2, 0.9], seed: 4 },
      { type: 'back', col: [20, 110, 160], t0: 0.74, t1: 1, amt: 0.5, u: [0, 1] }
    ]),
    strokes: []
  },
  rough: 0.26, metal: 0.3, coat: 0.5, env: 1.1, rim: [0.2, 0.44, 0.4],
  fins: [
    { k: 'dorsal', n: 26, u0: 0.1, u1: 0.93, th0: 0.4, th1: 1.0, len: [[0, 0.07], [0.15, 0.12], [0.5, 0.11], [1, 0.04]], sc: 0.05, curve: 0.08, sag: 0.03, z: 0.005, kA: 3, nB: 6,
      tex: FT([[0, [24, 110, 190, 0.95]], [0.6, [30, 130, 200, 0.8]], [1, [60, 170, 200, 0.4]]], { rayW: 0.9, ray: 'rgba(160,230,250,0.45)' }) },
    { k: 'dorsal', dir: 'down', n: 22, u0: 0.5, u1: 0.95, th0: 0.4, th1: 1.0, len: [[0, 0.06], [0.2, 0.09], [1, 0.04]], sc: 0.05, curve: 0.08, sag: 0, z: 0.005, kA: 3, nB: 6,
      tex: FT([[0, [220, 200, 60, 0.94]], [1, [240, 230, 130, 0.5]]], { rayW: 0.9 }) },
    { k: 'caudal', n: 19, u: 0.995, p0: -1.0, p1: 1.0, L: 0.3, shape: SHP.fork(0.6), sc: 0.03, kA: 4, nB: 10,
      tex: FT([[0, [226, 200, 50, 0.97]], [0.6, [230, 210, 70, 0.93]], [1, [210, 190, 80, 0.8]]], { ray: 'rgba(255,240,150,0.45)' }) },
    { k: 'pair', n: 12, u0: 0.25, u1: 0.25, y0: -0.03, y1: -0.07, psi0: 0.5, psi1: -0.9, L: 0.1, len: [[0, 0.7], [0.4, 1], [1, 0.5]], sc: 0.08, flare: 0.02, droop: 0.04, kA: 4,
      tex: FT([[0, [80, 170, 190, 0.95]], [1, [140, 200, 210, 0.4]]]) },
    { k: 'pair', n: 6, u0: 0.28, u1: 0.3, y0: -0.12, y1: -0.115, psi0: -0.9, psi1: -1.3, L: 0.08, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.12, flare: 0.02, droop: 0.02, kA: 4,
      tex: FT([[0, [240, 220, 100, 0.92]], [1, [250, 240, 170, 0.4]]]) }
  ],
  mouth: { u: 0.1, yC: -0.012, yN: -0.006, col: 0x6a9a80, lip: 0.0036, sep: 0.007 },
  eye: EYE(0.1, 0.028, 0.02, { dir: [0.2, 0.2, 0.95], pal: { sclera: [10, 24, 24], ring0: [30, 60, 40], ring: [170, 200, 90], iris: [10, 18, 14], pupil: 0.5 }, lid: 0x4a8a70 }),
  bend: { A: 0.06, K: 8 }
});

/* ---- 07_species_d.js ---- */
/* ---------- batch D: sharks, rays, reef fish & oddballs ---------- */
const NOLINE = { ray: 'rgba(0,0,0,0)', rayEdge: 'rgba(0,0,0,0)', rayW: 0.1 };
const GREYFIN = (a, b) => FT([[0, [b || 92, (b || 92) + 2, (b || 92) + 4, a || 0.96]], [1, [(b || 92) + 30, (b || 92) + 30, (b || 92) + 30, (a || 0.96) * 0.8]]], NOLINE);

SPECIES.push({
  id: 'greynurse', hero: true, name: 'Grey nurse shark', sci: 'Carcharias taurus',
  regions: ['Gold Coast', 'Sunshine Coast', 'Moreton Bay'], habitat: 'Rocky reefs, gutters, caves and ledges',
  len: 8.4, count: 3, mode: 'cruise', band: [0.1, 0.45],
  nodes: [[-8, 1, 1, 1.5], [0, 3.2, 3.2, 3.2], [6, 6.5, 5.2, 5.4], [14, 9.8, 8.2, 7.6], [28, 12.6, 10.6, 9.2], [42, 13, 11, 9.4], [56, 11, 9.6, 8],
    [70, 8.2, 7, 6], [84, 6, 5.2, 4], [96, 4.2, 3.8, 2.6], [100, 4, 3.6, 2.3], [106, 3.8, 3.4, 2.1]],
  cap: 7, P: 2.2, capE: 0.04,
  skin: {
    seed: 71, g: 0.34, stops: [[0, [240, 238, 230]], [0.36, [226, 224, 214]], [0.52, [128, 126, 120]], [0.8, [98, 98, 96]], [1, [78, 80, 82]]], bright: 0.95,
    layers: [
      { type: 'marble', col: [78, 78, 78], lo: 0.5, hi: 0.8, amt: 0.3, bias: 0.8 },
      { type: 'spots', col: [96, 74, 54], cu: 90, cs: 22, r: 0.2, p: 0.3, jit: 0.9, amt: 0.7, gate: [0.5, 0.58, 0.9, 1.0], uw: [0.3, 0.96] },
      { type: 'speck', col: [60, 60, 60], lo: 0.84, hi: 0.95, amt: 0.15, gate: [0.5, 0.6, 2, 3] },
      { type: 'head', col: [140, 136, 126], u1: 0.2, amt: 0.2, gate: [0.5, 0.7, 2, 3] }
    ],
    strokes: [0.17, 0.195, 0.22, 0.245, 0.27].map(u => ({ pts: [[u, 0.42], [u + 0.006, 0.33], [u, 0.24]], layers: [[5, 'rgba(40,40,40,0.8)']] }))
  },
  rough: 0.5, metal: 0, coat: 0.3, env: 0.8, rim: [0.2, 0.3, 0.34],
  fins: [
    { k: 'dorsal', n: 7, u0: 0.40, u1: 0.52, th0: 0.0, th1: 0.6, len: [[0, 0.0], [0.45, 0.085], [0.78, 0.115], [1, 0.0]], sc: 0, curve: 0.14, sag: 0, z: 0.008, kA: 5, nB: 8, inset: 0.012, tex: GREYFIN(0.98, 100) },
    { k: 'dorsal', n: 6, u0: 0.64, u1: 0.72, th0: 0.0, th1: 0.6, len: [[0, 0.0], [0.45, 0.06], [0.78, 0.082], [1, 0.0]], sc: 0, curve: 0.14, sag: 0, z: 0.006, kA: 5, nB: 8, inset: 0.01, tex: GREYFIN(0.98, 100) },
    { k: 'dorsal', dir: 'down', n: 5, u0: 0.7, u1: 0.78, th0: 0.0, th1: 0.6, len: [[0, 0.01], [0.5, 0.06], [0.8, 0.08], [1, 0.02]], sc: 0, curve: 0.1, sag: 0, z: 0.005, kA: 5, nB: 8, inset: 0.01, tex: GREYFIN(0.98, 150) },
    { k: 'caudal', n: 12, u: 0.99, p0: -0.5, p1: 1.0, L: 0.34, tilt: 0.42, shape: [[0, 0.28], [0.3, 0.42], [0.7, 0.75], [1, 1]], sc: 0, kA: 5, nB: 12, tex: GREYFIN(0.98, 98) },
    { k: 'pair', n: 8, u0: 0.27, u1: 0.29, y0: -0.035, y1: -0.07, psi0: -0.3, psi1: -1.3, L: 0.2, len: [[0, 1], [0.5, 0.7], [1, 0.25]], sc: 0, flare: 0.07, droop: 0.12, kA: 4, nB: 8, tex: GREYFIN(0.98, 126) },
    { k: 'pair', n: 5, u0: 0.58, u1: 0.6, y0: -0.095, y1: -0.1, psi0: -0.5, psi1: -1.2, L: 0.07, len: [[0, 1], [0.5, 0.7], [1, 0.3]], sc: 0, flare: 0.04, droop: 0.05, kA: 4, nB: 6, tex: GREYFIN(0.98, 140) }
  ],
  mouth: { u: 0.145, yC: -0.036, yN: -0.016, col: 0x4a4440, lip: 0.0036, sep: 0.002, lipL: 1 },
  eye: EYE(0.135, 0.022, 0.012, { dir: [0.2, 0.1, 0.97], pal: { sclera: [18, 18, 16], ring0: [40, 36, 24], ring: [110, 100, 50], iris: [20, 18, 12], pupil: 0.6 }, lid: 0x707070, rim: 0x777777 }),
  extras(c) { // ragged ivory teeth
    [1, -1].forEach(sg => {
      for (let k = 0; k < 11; k++) {
        const t = k / 10, u = 0.016 + t * 0.12; let y = -0.016 - 0.02 * t; const q = c.prof.at(u); y = Math.max(y, -0.8 * q.bot); const z = c.prof.surfZ(u, y) * 0.93;
        c.D.cone([0.5 - u, y + 0.003, sg * z], [0.5 - u + 0.003, y - 0.012 - 0.003 * (k % 3), sg * z * 0.99], 0.0016, 0xf4efe0, 4);
        c.D.cone([0.5 - u, y - 0.004, sg * z], [0.5 - u - 0.002, y + 0.011 + 0.003 * (k % 2), sg * z * 0.99], 0.0014, 0xeee8d6, 4);
      }
    });
  },
  bend: { A: 0.1, K: 5.6 }
});

SPECIES.push({
  id: 'wobbegong', hero: true, name: 'Spotted wobbegong', sci: 'Orectolobus maculatus',
  regions: ['Moreton Bay', 'Gold Coast', 'Sunshine Coast'], habitat: 'Reef ledges, caves and wrecks; ambush predator',
  len: 6.2, count: 2, mode: 'bottom', band: [0.0, 0.1],
  nodes: [[-8, 1.5, 1.5, 3], [0, 4.5, 2.8, 9], [8, 9, 4, 17], [18, 11, 4.6, 21], [30, 10, 4, 20], [44, 8.6, 3.6, 17], [58, 7, 3.2, 13], [72, 5.4, 2.9, 9],
    [84, 3.8, 2.4, 6], [96, 2.8, 2.2, 3.6], [100, 2.6, 2, 3.2], [108, 2.4, 1.9, 2.8]],
  cap: 8, P: 2.1, capE: 0.04,
  skin: {
    seed: 75, g: 1.0, asym: true, w: 1024, h: 1024, stops: [[0, [226, 214, 180]], [0.4, [214, 196, 152]], [0.52, [164, 128, 80]], [0.8, [138, 104, 62]], [1, [112, 82, 50]]],
    layers: [
      { type: 'bars', col: [56, 40, 28], u: [0.12, 0.96], n: 4.6, lo: 0.52, hi: 0.78, amt: 0.8, warp: 3.2, gate: [0.52, 0.58, 2, 3] },
      { type: 'marble', col: [64, 46, 30], lo: 0.5, hi: 0.76, amt: 0.4, bias: 0.3, gate: [0.5, 0.58, 2, 3], sc: 1.6 },
      { type: 'ridge', col: [236, 226, 192], lo: 0.84, hi: 0.93, amt: 0.9, gate: [0.52, 0.6, 2, 3], sc: 3.2 },
      { type: 'spots', col: [240, 232, 204], cu: 70, cs: 14, r: 0.22, p: 0.25, jit: 0.9, amt: 0.85, gate: [0.52, 0.6, 2, 3], uw: [0.1, 0.96], seed: 7 },
      { type: 'speck', col: [90, 66, 40], lo: 0.8, hi: 0.94, amt: 0.3 }
    ],
    strokes: []
  },
  rough: 0.62, metal: 0, coat: 0.2, env: 0.6, rim: [0.2, 0.3, 0.3],
  fins: [
    { k: 'dorsal', n: 6, u0: 0.58, u1: 0.65, th0: 0.0, th1: 0.6, len: [[0, 0.01], [0.5, 0.06], [0.8, 0.075], [1, 0.015]], sc: 0, curve: 0.1, sag: 0, z: 0.006, kA: 4, nB: 6, inset: 0.01, tex: GREYFIN(0.95, 140) },
    { k: 'dorsal', n: 6, u0: 0.7, u1: 0.77, th0: 0.0, th1: 0.6, len: [[0, 0.01], [0.5, 0.05], [0.8, 0.06], [1, 0.015]], sc: 0, curve: 0.1, sag: 0, z: 0.006, kA: 4, nB: 6, inset: 0.01, tex: GREYFIN(0.95, 140) },
    { k: 'caudal', n: 10, u: 0.99, p0: -0.3, p1: 1.0, L: 0.16, tilt: 0.12, shape: [[0, 0.5], [0.5, 0.7], [1, 1]], sc: 0, kA: 4, nB: 8, tex: GREYFIN(0.95, 140) },
    { k: 'wing', n: 8, u0: 0.22, u1: 0.34, y0: -0.018, y1: -0.022, L: 0.14, len: [[0, 0.7], [0.4, 1], [1, 0.6]], sc: 0.03, sweep: 0.6, droop: 0.1, kA: 4, nB: 8, tex: FT([[0, [150, 112, 66, 0.97]], [1, [200, 176, 130, 0.9]]], NOLINE) },
    { k: 'wing', n: 7, u0: 0.46, u1: 0.54, y0: -0.014, y1: -0.016, L: 0.1, len: [[0, 0.7], [0.4, 1], [1, 0.6]], sc: 0.03, sweep: 0.6, droop: 0.1, kA: 4, nB: 8, tex: FT([[0, [150, 112, 66, 0.97]], [1, [200, 176, 130, 0.9]]], NOLINE) }
  ],
  mouth: { u: 0.13, yC: -0.012, yN: -0.004, col: 0x3a2c20, lip: 0.003, sep: 0.002, lipL: 1 },
  eye: EYE(0.1, 0.05, 0.011, { dir: [0.1, 0.95, 0.3], pal: { sclera: [30, 24, 14], ring0: [90, 70, 30], ring: [190, 160, 70], iris: [24, 20, 10], pupil: 0.5 }, lid: 0x7a5a38, rim: 0x9a7a52 }),
  extras(c) { // dermal tassels fringing the head
    const X = u => 0.5 - u;
    [1, -1].forEach(sg => {
      for (let k = 0; k < 7; k++) {
        const u = 0.03 + k * 0.026, w = c.prof.at(u).w, L1 = 0.05 - k * 0.003, y = -0.008;
        c.D.rod([X(u), y, sg * w * 0.95], [X(u) + 0.01, y - 0.004, sg * (w + L1)], 0.0075, 0.0018, 0x8a6a40, 6);
        c.D.rod([X(u) + 0.004, y - 0.001, sg * (w + L1 * 0.55)], [X(u) + 0.014, y - 0.008, sg * (w + L1 * 1.0)], 0.0035, 0.0010, 0xb09468, 5);
        c.D.rod([X(u) - 0.004, y - 0.001, sg * (w + L1 * 0.5)], [X(u) - 0.002, y - 0.009, sg * (w + L1 * 0.9)], 0.003, 0.001, 0xb09468, 5);
      }
      c.D.rod([X(0.02), -0.004, sg * 0.006], [X(0.008) + 0.006, -0.01, sg * 0.02], 0.002, 0.0008, 0xb09468, 4);
    });
  },
  bend: { A: 0.07, K: 6 }
});

SPECIES.push({
  id: 'eagleray', hero: true, name: 'Spotted eagle ray', sci: 'Aetobatus ocellatus',
  regions: ['Moreton Bay', 'Gold Coast', 'Sunshine Coast'], habitat: 'Sandy flats, reef edges and bay channels; glides on broad wings and digs for shellfish',
  len: 4.6, count: 3, mode: 'glide', band: [0.15, 0.7],
  nodes: [[-6, 0.4, 0.4, 0.8], [0, 1.4, 1.2, 3], [5, 3.2, 2, 5.5], [10, 4.8, 2.4, 8], [16, 5.2, 2.4, 14], [24, 4.4, 2, 32], [34, 3.6, 1.6, 48], [46, 3.2, 1.5, 56],
    [58, 2.8, 1.4, 54], [70, 2.4, 1.2, 44], [82, 2, 1, 30], [92, 1.6, 0.9, 16], [100, 1.3, 0.8, 6], [108, 1.1, 0.7, 3]],
  cap: 6, P: 2.0, capE: 0.1, flap: 0.2,
  skin: {
    seed: 79, g: 1.0, asym: true, w: 1024, h: 1024, stops: [[0, [246, 246, 242]], [0.42, [238, 238, 234]], [0.52, [64, 74, 100]], [0.7, [34, 44, 70]], [1, [24, 32, 54]]],
    layers: [
      { type: 'marble', col: [18, 24, 44], lo: 0.5, hi: 0.8, amt: 0.35, gate: [0.5, 0.58, 2, 3] },
      { type: 'spots', col: [238, 242, 248], cu: 44, cs: 48, r: 0.3, p: 0.55, jit: 0.9, amt: 0.95, gate: [0.54, 0.6, 2, 3], uw: [0.12, 0.95] },
      { type: 'belly', col: [226, 226, 222], t0: 0.0, t1: 0.46, amt: 0.0, u: [0, 1] }
    ],
    strokes: []
  },
  rough: 0.4, metal: 0, coat: 0.5, env: 0.9, rim: [0.2, 0.34, 0.5],
  fins: [
    { k: 'dorsal', n: 5, u0: 0.93, u1: 0.99, th0: 0.0, th1: 0.6, len: [[0, 0.01], [0.5, 0.04], [0.8, 0.05], [1, 0.01]], sc: 0, curve: 0.1, sag: 0, z: 0.004, kA: 4, nB: 5, inset: 0.01, tex: GREYFIN(0.98, 40) }
  ],
  eye: EYE(0.1, 0.01, 0.016, { dir: [0.2, 0.15, 0.97], pal: { sclera: [10, 14, 24], ring0: [40, 50, 40], ring: [150, 150, 100], iris: [10, 14, 20], pupil: 0.6 }, lid: 0x2a3858, rim: 0x6a7a98 }),
  extras(c) { // whip tail with a serrated spine at the base
    const X = u => 0.5 - u, pts = [[X(0.99), 0, 0], [X(1.25), -0.004, 0.006], [X(1.6), 0.0, -0.01], [X(2.0), 0.004, 0.012], [X(2.5), 0.0, -0.01]];
    c.D.tube(pts, 0.0065, 0x1c2640, 30, 6);
    c.D.cone([X(1.12), 0.004, 0], [X(1.2), 0.012, 0], 0.002, 0xe4e0d0, 4);
    c.D.cone([X(1.06), -0.012, 0], [X(1.17), -0.02, 0], 0.003, 0x20283e, 4); // pelvic nub
    // pale cephalic 'duck-bill' underside
    c.D.ball([X(0.045), -0.006, 0], 0.03, 0.012, 0.035, 0xe8e8e0, 10);
  },
  bend: { A: 0.02, K: 5 }
});

SPECIES.push({
  id: 'shovelnose', hero: true, name: 'Eastern shovelnose ray', sci: 'Aptychotrema rostrata',
  regions: ['Brisbane', 'Moreton Bay', 'Gold Coast', 'Sunshine Coast'], habitat: 'Sand and mud flats, estuaries and bays; half-buried by day',
  len: 4.4, count: 2, mode: 'bottom', band: [0.0, 0.1],
  nodes: [[-6, 0.3, 0.3, 0.8], [0, 1, 1, 1.5], [10, 2, 1.2, 4], [22, 3, 1.6, 8], [34, 4, 2.2, 12], [46, 5.2, 2.8, 16], [58, 6, 3.2, 17],
    [68, 6.4, 3.4, 13], [78, 6, 3.2, 9], [88, 5.2, 2.9, 6], [96, 4.4, 2.6, 4], [100, 4.2, 2.5, 3.6], [108, 4, 2.4, 3.4]],
  cap: 6, P: 2.3, capE: 0.04,
  skin: {
    seed: 83, g: 1.0, asym: true, w: 1024, h: 1024, stops: [[0, [244, 240, 232]], [0.42, [238, 232, 220]], [0.52, [186, 154, 106]], [0.78, [168, 136, 92]], [1, [140, 110, 74]]],
    layers: [
      { type: 'marble', col: [104, 78, 48], lo: 0.48, hi: 0.76, amt: 0.5, gate: [0.5, 0.58, 2, 3], sc: 1.4 },
      { type: 'speck', col: [236, 220, 184], lo: 0.78, hi: 0.92, amt: 0.5, gate: [0.52, 0.6, 2, 3] },
      { type: 'spots', col: [96, 70, 44], cu: 50, cs: 26, r: 0.2, p: 0.25, jit: 0.9, amt: 0.6, gate: [0.52, 0.6, 2, 3], uw: [0.2, 0.9], seed: 3 },
      { type: 'bars', col: [86, 62, 40], u: [0.62, 1.0], n: 2.2, lo: 0.62, hi: 0.86, amt: 0.5, warp: 2, gate: [0.5, 0.6, 2, 3] }
    ],
    strokes: []
  },
  rough: 0.62, metal: 0, coat: 0.2, env: 0.6, rim: [0.25, 0.3, 0.3],
  fins: [
    { k: 'dorsal', n: 6, u0: 0.72, u1: 0.79, th0: 0.0, th1: 0.6, len: [[0, 0.01], [0.5, 0.05], [0.8, 0.065], [1, 0.012]], sc: 0, curve: 0.1, sag: 0, z: 0.005, kA: 4, nB: 6, inset: 0.012, tex: GREYFIN(0.95, 168) },
    { k: 'dorsal', n: 6, u0: 0.83, u1: 0.9, th0: 0.0, th1: 0.6, len: [[0, 0.01], [0.5, 0.045], [0.8, 0.055], [1, 0.012]], sc: 0, curve: 0.1, sag: 0, z: 0.005, kA: 4, nB: 6, inset: 0.012, tex: GREYFIN(0.95, 168) },
    { k: 'caudal', n: 10, u: 0.99, p0: -0.7, p1: 1.0, L: 0.13, tilt: 0.1, shape: [[0, 0.5], [0.5, 0.85], [1, 1]], sc: 0, kA: 4, nB: 8, tex: GREYFIN(0.95, 168) }
  ],
  eye: EYE(0.2, 0.02, 0.01, { dir: [0.05, 0.95, 0.35], pal: { sclera: [30, 24, 14], ring0: [90, 70, 30], ring: [190, 160, 70], iris: [24, 20, 10], pupil: 0.6 }, lid: 0x8a6a46, rim: 0xaa8a60 }),
  bend: { A: 0.06, K: 6 }, flap: 0.05
});

SPECIES.push({
  id: 'clownfish', hero: true, name: 'Barrier Reef anemonefish', sci: 'Amphiprion akindynos',
  regions: ['Moreton Bay', 'Gold Coast'], habitat: 'Lives among anemones on southern reefs; every fish starts male and the dominant one becomes female',
  len: 0.75, count: 6, mode: 'hover', band: [0.02, 0.15],
  nodes: [[-8, 2, 2, 2.5], [0, 6, 6, 5], [8, 14, 13, 9], [18, 22, 20, 12], [30, 26, 23, 13.6], [44, 26, 23, 13.6], [58, 23, 20, 12], [72, 18, 15, 9],
    [86, 13, 11, 6.4], [96, 10, 9, 4.6], [100, 9.6, 8.6, 4.2], [108, 9.2, 8.2, 4]],
  cap: 10, gill: { u: 0.24, ru: 0.08, ry: 0.2, amp: 0.008 },
  skin: {
    seed: 87, g: 0.5, stops: [[0, [250, 150, 56]], [0.3, [244, 120, 30]], [0.7, [230, 96, 16]], [1, [206, 76, 12]]],
    layers: [
      { type: 'marble', col: [180, 60, 8], lo: 0.5, hi: 0.8, amt: 0.25 },
      { type: 'vband', col: [10, 8, 8], c: 0.27, w: 0.075, s: 0.05, amt: 0.92 },
      { type: 'vband', col: [10, 8, 8], c: 0.58, w: 0.1, s: 0.06, amt: 0.92 },
      { type: 'vband', col: [10, 8, 8], c: 0.93, w: 0.075, s: 0.05, amt: 0.92 },
      { type: 'vband', col: [250, 250, 244], c: 0.27, w: 0.052, s: 0.03, amt: 1 },
      { type: 'vband', col: [250, 250, 244], c: 0.58, w: 0.075, s: 0.04, amt: 1 },
      { type: 'vband', col: [250, 250, 244], c: 0.93, w: 0.05, s: 0.03, amt: 1 },
      { type: 'scales', col: [150, 50, 6], cu: 40, cs: 18, lo: 0.45, hi: 0.68, amt: 0.14 }
    ],
    strokes: []
  },
  rough: 0.3, metal: 0, coat: 0.8, env: 1.0, rim: [0.4, 0.3, 0.2],
  fins: [
    { k: 'dorsal', n: 16, u0: 0.24, u1: 0.8, th0: 0.15, th1: 0.9, len: [[0, 0.14], [0.2, 0.22], [0.5, 0.2], [1, 0.12]], sc: 0.06, curve: 0.06, sag: 0.03, z: 0.008, kA: 3,
      tex: FT([[0, [240, 100, 20, 0.97]], [0.6, [236, 96, 18, 0.9]], [0.9, [230, 90, 20, 0.7]], [1, [10, 8, 8, 0.9]]], { ray: 'rgba(255,200,150,0.4)' }) },
    { k: 'dorsal', dir: 'down', n: 10, u0: 0.62, u1: 0.84, th0: 0.4, th1: 0.9, len: [[0, 0.1], [0.3, 0.16], [1, 0.11]], sc: 0.06, curve: 0.06, sag: 0, z: 0.006, kA: 3,
      tex: FT([[0, [240, 100, 20, 0.97]], [0.8, [236, 96, 18, 0.9]], [1, [10, 8, 8, 0.9]]], { ray: 'rgba(255,200,150,0.4)' }) },
    { k: 'caudal', n: 13, u: 0.99, p0: -0.9, p1: 0.9, L: 0.26, shape: SHP.round, sc: 0.04, kA: 4, nB: 8,
      tex: FT([[0, [250, 250, 244, 0.97]], [0.5, [244, 244, 236, 0.9]], [0.9, [236, 140, 40, 0.8]], [1, [10, 8, 8, 0.9]]], { ray: 'rgba(255,230,200,0.4)' }) },
    { k: 'pair', n: 10, u0: 0.26, u1: 0.26, y0: -0.02, y1: -0.08, psi0: 0.4, psi1: -0.9, L: 0.16, len: [[0, 0.7], [0.4, 1], [1, 0.6]], sc: 0.04, flare: 0.04, droop: 0.03, kA: 4,
      tex: FT([[0, [250, 140, 50, 0.9]], [1, [250, 190, 120, 0.4]]]) },
    { k: 'pair', n: 5, u0: 0.32, u1: 0.35, y0: -0.2, y1: -0.19, psi0: -0.9, psi1: -1.3, L: 0.14, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.1, flare: 0.03, droop: 0.02, kA: 4,
      tex: FT([[0, [240, 100, 20, 0.97]], [1, [10, 8, 8, 0.8]]]) }
  ],
  mouth: { u: 0.07, yC: -0.03, yN: -0.012, col: 0xd86a1e, lip: 0.007, sep: 0.008 },
  eye: EYE(0.11, 0.05, 0.05, { dir: [0.3, 0.2, 0.93], pal: { sclera: [40, 20, 6], ring0: [120, 50, 10], ring: [210, 120, 30], iris: [28, 14, 6], pupil: 0.5 }, lid: 0xc86018, rim: 0xffd8b0 }),
  bend: { A: 0.08, K: 8 }
});

SPECIES.push({
  id: 'moorishidol', hero: true, name: 'Moorish idol', sci: 'Zanclus cornutus',
  regions: ['Moreton Bay', 'Gold Coast'], habitat: 'Warm reefs and lagoons; roams in pairs along reef slopes',
  len: 1.3, count: 3, mode: 'reef', band: [0.1, 0.5],
  nodes: [[-8, 2, 2, 1.6], [0, 5, 5, 2.4], [8, 12, 10.5, 3.6], [16, 24, 22, 5.2], [28, 34, 31, 6.2], [40, 38, 35, 6.4], [54, 34, 31, 6],
    [68, 26, 24, 5], [80, 16, 15, 3.6], [92, 9, 8.4, 2.4], [100, 7, 6.6, 2], [108, 6.6, 6.2, 1.9]],
  cap: 6, P: 2.4, capE: 0.04,
  skin: {
    seed: 91, g: 1.0, stops: [[0, [250, 248, 232]], [0.5, [250, 246, 224]], [1, [250, 244, 214]]],
    layers: [
      { type: 'vband', col: [234, 190, 40], c: 0.5, w: 0.1, s: 0.1, amt: 0.9 },
      { type: 'vband', col: [14, 14, 18], c: 0.27, w: 0.1, s: 0.05, amt: 0.97 },
      { type: 'vband', col: [14, 14, 18], c: 0.7, w: 0.11, s: 0.06, amt: 0.97 },
      { type: 'head', col: [240, 170, 40], u1: 0.1, amt: 0.9, gate: [0.1, 0.4, 0.9, 1.0] },
      { type: 'speck', col: [200, 190, 150], lo: 0.8, hi: 0.94, amt: 0.2 }
    ],
    strokes: []
  },
  rough: 0.32, metal: 0, coat: 0.8, env: 1.0, rim: [0.3, 0.34, 0.3],
  fins: [
    { k: 'dorsal', n: 8, u0: 0.28, u1: 0.62, th0: 0.55, th1: 0.15, len: [[0, 0.58], [0.1, 0.22], [0.5, 0.18], [1, 0.1]], sc: 0.1, curve: 0.3, sag: 0, z: 0.006, kA: 4, nB: 12, inset: 0.02,
      tex: FT([[0, [20, 20, 24, 0.96]], [0.5, [24, 24, 28, 0.9]], [0.85, [250, 248, 240, 0.9]], [1, [250, 250, 244, 0.9]]], { ray: 'rgba(250,250,240,0.5)' }) },
    { k: 'dorsal', dir: 'down', n: 6, u0: 0.55, u1: 0.78, th0: 0.4, th1: 0.9, len: [[0, 0.1], [0.5, 0.15], [1, 0.08]], sc: 0.1, curve: 0.06, sag: 0, z: 0.005, kA: 4, inset: 0.02,
      tex: FT([[0, [20, 20, 24, 0.96]], [0.7, [30, 30, 34, 0.9]], [1, [250, 248, 240, 0.9]]]) },
    { k: 'caudal', n: 11, u: 0.99, p0: -0.9, p1: 0.9, L: 0.22, shape: SHP.fork(0.25), sc: 0.05, kA: 4, nB: 8,
      tex: FT([[0, [12, 12, 16, 0.97]], [0.7, [20, 20, 24, 0.9]], [1, [250, 250, 244, 0.9]]]) },
    { k: 'pair', n: 8, u0: 0.4, u1: 0.4, y0: -0.0, y1: -0.07, psi0: 0.6, psi1: -0.6, L: 0.11, len: [[0, 0.7], [0.4, 1], [1, 0.7]], sc: 0.06, flare: 0.012, droop: 0.04, kA: 4,
      tex: FT([[0, [240, 220, 120, 0.7]], [1, [250, 248, 230, 0.3]]]) },
    { k: 'pair', n: 4, u0: 0.42, u1: 0.46, y0: -0.31, y1: -0.3, psi0: -0.9, psi1: -1.3, L: 0.1, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.1, flare: 0.01, droop: 0.02, kA: 4,
      tex: FT([[0, [14, 14, 18, 0.97]], [1, [30, 30, 36, 0.8]]]) }
  ],
  mouth: { u: 0.09, yC: 0.01, yN: 0.008, col: 0xf0b040, lip: 0.004, sep: 0.003 },
  eye: EYE(0.2, 0.04, 0.032, { dir: [0.2, 0.15, 0.97], pal: { sclera: [14, 14, 14], ring0: [50, 44, 20], ring: [150, 130, 60], iris: [14, 12, 8], pupil: 0.5 }, lid: 0x1a1a1e, rim: 0xe8e0c8 }),
  extras(c) { // elongated tube snout & the little 'horns' above the eyes
    [1, -1].forEach(sg => c.D.cone([0.5 - 0.2, 0.062, sg * 0.016], [0.5 - 0.215, 0.092, sg * 0.016], 0.006, 0xf6f0e0, 6));
  },
  bend: { A: 0.06, K: 8.2 }
});

SPECIES.push({
  id: 'butterflyfish', hero: true, name: 'Threadfin butterflyfish', sci: 'Chaetodon auriga',
  regions: ['Moreton Bay', 'Gold Coast'], habitat: 'Coral and rocky reefs; often in pairs',
  len: 1.1, count: 4, mode: 'reef', band: [0.05, 0.45],
  nodes: [[-8, 2, 2, 1.8], [0, 6, 6, 2.4], [8, 13, 11, 3.4], [18, 24, 21, 4.8], [30, 32, 29, 5.6], [42, 35, 32, 5.8], [56, 32, 29, 5.6],
    [70, 25, 22, 4.6], [82, 16, 14.4, 3.4], [92, 10, 9.4, 2.4], [100, 8.4, 8, 2], [108, 8, 7.6, 1.9]],
  cap: 6, P: 2.4, capE: 0.04,
  skin: {
    seed: 95, g: 0.9, stops: [[0, [252, 250, 240]], [0.5, [250, 248, 234]], [1, [248, 244, 228]]],
    layers: [
      { type: 'diag', col: [30, 28, 26], cu: 14, k: 6, w: 0.09, amt: 0.85, u: [0.3, 0.9], gate: [0.1, 0.2, 0.9, 1] },
      { type: 'fade', col: [252, 218, 70], u0: 0.7, u1: 0.84, amt: 0.95, gate: [0.1, 0.3, 2, 3] },
      { type: 'vband', col: [16, 16, 18], c: 0.17, w: 0.04, s: 0.02, amt: 0.97 },
      { type: 'vband', col: [16, 16, 18], c: 0.98, w: 0.04, s: 0.03, amt: 0.9 },
      { type: 'head', col: [250, 232, 120], u1: 0.1, amt: 0.6, gate: [0.1, 0.4, 0.9, 1.0] },
      { type: 'speck', col: [200, 190, 160], lo: 0.8, hi: 0.94, amt: 0.2 }
    ],
    strokes: []
  },
  rough: 0.3, metal: 0, coat: 0.8, env: 1.0, rim: [0.3, 0.34, 0.3],
  fins: [
    { k: 'dorsal', n: 13, u0: 0.27, u1: 0.84, th0: 0.3, th1: 1.2, len: [[0, 0.11], [0.5, 0.13], [0.85, 0.42], [1, 0.1]], sc: 0.05, curve: 0.14, sag: 0, z: 0.006, kA: 3, nB: 8, inset: 0.02,
      tex: FT([[0, [252, 244, 190, 0.95]], [0.5, [252, 226, 90, 0.92]], [1, [250, 214, 60, 0.8]]], { ray: 'rgba(255,255,230,0.5)' }) },
    { k: 'dorsal', dir: 'down', n: 9, u0: 0.6, u1: 0.8, th0: 0.4, th1: 0.9, len: [[0, 0.07], [0.3, 0.1], [1, 0.07]], sc: 0.1, curve: 0.06, sag: 0, z: 0.005, kA: 3, inset: 0.02,
      tex: FT([[0, [250, 214, 60, 0.95]], [0.8, [250, 224, 90, 0.8]], [1, [250, 240, 190, 0.4]]]) },
    { k: 'caudal', n: 11, u: 0.99, p0: -0.9, p1: 0.9, L: 0.2, shape: SHP.trunc, sc: 0.05, kA: 4, nB: 8,
      tex: FT([[0, [250, 214, 60, 0.97]], [0.6, [246, 224, 100, 0.9]], [0.85, [20, 18, 18, 0.95]], [1, [250, 248, 240, 0.7]]]) },
    { k: 'pair', n: 8, u0: 0.4, u1: 0.4, y0: -0.0, y1: -0.07, psi0: 0.6, psi1: -0.6, L: 0.1, len: [[0, 0.7], [0.4, 1], [1, 0.7]], sc: 0.06, flare: 0.012, droop: 0.04, kA: 4,
      tex: FT([[0, [250, 240, 200, 0.7]], [1, [252, 252, 244, 0.3]]]) },
    { k: 'pair', n: 4, u0: 0.4, u1: 0.44, y0: -0.28, y1: -0.27, psi0: -0.9, psi1: -1.3, L: 0.1, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.1, flare: 0.01, droop: 0.02, kA: 4,
      tex: FT([[0, [250, 214, 60, 0.97]], [1, [250, 236, 160, 0.6]]]) }
  ],
  mouth: { u: 0.1, yC: -0.004, yN: -0.002, col: 0xe8c850, lip: 0.0036, sep: 0.003 },
  eye: EYE(0.19, 0.036, 0.026, { dir: [0.2, 0.15, 0.97], pal: { sclera: [14, 14, 14], ring0: [50, 44, 20], ring: [170, 150, 70], iris: [14, 12, 8], pupil: 0.5 }, lid: 0x1a1a1e, rim: 0xf0e8c8 }),
  bend: { A: 0.06, K: 8.2 }
});

SPECIES.push({
  id: 'toadfish', hero: true, name: 'Weeping toadfish', sci: 'Torquigener pleurogramma',
  regions: ['Brisbane', 'Moreton Bay', 'Gold Coast', 'Sunshine Coast'], habitat: 'Sandy and seagrass flats in estuaries and bays; inflates when threatened (toxic to eat)',
  len: 1.5, count: 4, mode: 'bottom', band: [0.0, 0.12],
  nodes: [[-8, 2, 2, 2.5], [0, 8, 8, 7], [8, 16, 15, 12], [20, 24, 22, 18], [34, 28, 26, 20], [48, 27, 25, 19], [62, 22, 20, 15], [76, 16, 15, 10],
    [88, 11, 10.5, 6.4], [98, 8, 8, 4.4], [100, 7.8, 7.6, 4], [108, 7.4, 7.2, 3.8]],
  cap: 10, P: 2.2, gill: { u: 0.3, ru: 0.08, ry: 0.2, amp: 0.008 },
  skin: {
    seed: 99, g: 0.8, stops: [[0, [248, 246, 236]], [0.3, [232, 224, 190]], [0.55, [190, 176, 126]], [0.8, [130, 118, 78]], [1, [96, 86, 56]]],
    layers: [
      { type: 'marble', col: [70, 62, 40], lo: 0.5, hi: 0.78, amt: 0.4, bias: 0.8 },
      { type: 'spots', col: [44, 36, 24], cu: 48, cs: 20, r: 0.26, p: 0.4, jit: 0.9, amt: 0.8, gate: [0.45, 0.55, 2, 3], uw: [0.25, 0.95] },
      { type: 'stripe', col: [220, 208, 150], t: 0.4, w: 0.06, amt: 0.5, u: [0.3, 0.9] },
      { type: 'speck', col: [50, 44, 30], lo: 0.8, hi: 0.95, amt: 0.3 }
    ],
    strokes: [{ pts: [[0.115, 0.3], [0.13, 0.22], [0.12, 0.14]], layers: [[8, 'rgba(40,32,20,0.75)']] }]
  },
  rough: 0.5, metal: 0, coat: 0.5, env: 0.8, rim: [0.3, 0.3, 0.24],
  fins: [
    { k: 'dorsal', n: 10, u0: 0.68, u1: 0.8, th0: 0.4, th1: 0.9, len: [[0, 0.06], [0.4, 0.085], [1, 0.05]], sc: 0.08, curve: 0.06, sag: 0.02, z: 0.005, kA: 3,
      tex: FT([[0, [130, 118, 76, 0.9]], [1, [200, 190, 150, 0.4]]]) },
    { k: 'dorsal', dir: 'down', n: 9, u0: 0.68, u1: 0.8, th0: 0.4, th1: 0.9, len: [[0, 0.05], [0.4, 0.07], [1, 0.045]], sc: 0.08, curve: 0.06, sag: 0, z: 0.005, kA: 3,
      tex: FT([[0, [226, 216, 170, 0.9]], [1, [240, 234, 210, 0.4]]]) },
    { k: 'caudal', n: 15, u: 0.99, p0: -0.9, p1: 0.9, L: 0.17, shape: SHP.round, sc: 0.04, kA: 4, nB: 8,
      tex: FT([[0, [140, 128, 84, 0.96]], [0.6, [120, 108, 70, 0.9]], [1, [60, 52, 34, 0.8]]]) },
    { k: 'pair', n: 12, u0: 0.32, u1: 0.32, y0: -0.02, y1: -0.09, psi0: 0.7, psi1: -0.9, L: 0.1, len: [[0, 0.7], [0.4, 1], [1, 0.6]], sc: 0.04, flare: 0.06, droop: 0.02, kA: 4,
      tex: FT([[0, [200, 188, 140, 0.8]], [1, [240, 236, 210, 0.3]]]) }
  ],
  mouth: { u: 0.075, yC: -0.02, yN: -0.006, col: 0xe8dcc0, lip: 0.0064, sep: 0.007 },
  eye: EYE(0.14, 0.078, 0.036, { dir: [0.2, 0.25, 0.95], pal: { sclera: [30, 24, 14], ring0: [90, 70, 30], ring: [200, 170, 80], iris: [20, 16, 8], pupil: 0.5 }, lid: 0x9a8a5a, rim: 0xf0e8d0 }),
  bend: { A: 0.07, K: 7.6 }
});

SPECIES.push({
  id: 'garfish', hero: true, name: 'Eastern sea garfish', sci: 'Hyporhamphus australis',
  regions: ['Moreton Bay', 'Gold Coast', 'Sunshine Coast', 'Brisbane'], habitat: 'Surface schools over seagrass and sand flats; lower jaw extended into a beak',
  len: 2.0, count: 14, mode: 'school', band: [0.82, 0.98],
  nodes: [[-8, 1, 1, 1.4], [0, 2.2, 2, 1.8], [6, 3.6, 3.2, 2.6], [16, 4.6, 4.2, 3.4], [30, 5.2, 4.8, 3.8], [46, 5.2, 4.8, 3.8], [62, 5, 4.6, 3.6], [76, 4.6, 4.2, 3.2],
    [88, 4, 3.7, 2.8], [96, 3.6, 3.3, 2.4], [100, 3.5, 3.2, 2.2], [108, 3.4, 3.1, 2]],
  cap: 6, P: 2.4,
  skin: {
    seed: 103, g: 0.4, stops: [[0, [244, 246, 242]], [0.3, [226, 234, 234]], [0.55, [176, 200, 204]], [0.8, [92, 140, 136]], [1, [64, 112, 112]]],
    layers: SCALES(70, 24, 0.1, [70, 100, 100]).concat([
      { type: 'stripe', col: [236, 244, 246], t: 0.46, w: 0.05, amt: 0.8, u: [0.15, 0.99] },
      { type: 'back', col: [50, 100, 104], t0: 0.74, t1: 1, amt: 0.5, u: [0, 1] }
    ]),
    strokes: []
  },
  rough: 0.26, metal: 0.35, coat: 0.5, env: 1.1, rim: [0.2, 0.4, 0.44],
  fins: [
    { k: 'dorsal', n: 14, u0: 0.6, u1: 0.8, th0: 0.55, th1: 0.95, len: [[0, 0.05], [0.4, 0.06], [1, 0.035]], sc: 0.08, curve: 0.06, sag: 0.02, z: 0.004, kA: 3,
      tex: FT([[0, [140, 170, 170, 0.9]], [1, [200, 220, 220, 0.4]]]) },
    { k: 'dorsal', dir: 'down', n: 14, u0: 0.6, u1: 0.8, th0: 0.55, th1: 0.95, len: [[0, 0.05], [0.4, 0.06], [1, 0.035]], sc: 0.08, curve: 0.06, sag: 0, z: 0.004, kA: 3,
      tex: FT([[0, [200, 214, 214, 0.9]], [1, [230, 240, 240, 0.4]]]) },
    { k: 'caudal', n: 15, u: 0.995, p0: -1.0, p1: 0.8, L: 0.16, shape: [[0, 1], [0.3, 0.7], [0.6, 0.5], [1, 0.75]], sc: 0.04, kA: 4, nB: 8, tilt: -0.04,
      tex: FT([[0, [150, 180, 180, 0.96]], [0.6, [140, 170, 170, 0.9]], [1, [230, 70, 50, 0.7]]]) },
    { k: 'pair', n: 9, u0: 0.28, u1: 0.28, y0: 0.0, y1: -0.04, psi0: 0.4, psi1: -0.8, L: 0.08, len: [[0, 0.7], [0.4, 1], [1, 0.6]], sc: 0.06, flare: 0.012, droop: 0.02, kA: 4,
      tex: FT([[0, [160, 190, 190, 0.8]], [1, [230, 240, 240, 0.3]]]) },
    { k: 'pair', n: 4, u0: 0.5, u1: 0.52, y0: -0.045, y1: -0.043, psi0: -0.6, psi1: -1.2, L: 0.05, len: [[0, 0.75], [0.5, 1], [1, 0.7]], sc: 0.1, flare: 0.01, droop: 0.02, kA: 4,
      tex: FT([[0, [220, 230, 230, 0.8]], [1, [240, 244, 244, 0.3]]]) }
  ],
  mouth: { u: 0.05, yC: -0.012, yN: -0.006, col: 0x7a9a9a, lip: 0.0028, sep: 0.004 },
  eye: EYE(0.08, 0.016, 0.028, { dir: [0.1, 0.2, 0.97], pal: { sclera: [16, 22, 22], ring0: [60, 70, 50], ring: [190, 190, 120], iris: [10, 14, 14], pupil: 0.5 }, lid: 0x5a8080, rim: 0xeef4f2 }),
  extras(c) { // the garfish beak: lower jaw runs past the upper
    c.D.rod([0.5 - 0.012, -0.012, 0.0], [0.5 + 0.1, -0.012, 0.0], 0.0075, 0.0034, 0x8aa8aa, 8);
    c.D.rod([0.5 + 0.1, -0.012, 0.0], [0.5 + 0.17, -0.012, 0.0], 0.0034, 0.0016, 0xe05a30, 6);
    c.D.rod([0.5 - 0.004, -0.004, 0.0], [0.5 + 0.02, -0.004, 0.0], 0.0045, 0.0028, 0x6a8a8a, 6);
  },
  bend: { A: 0.07, K: 8.2 }
});

