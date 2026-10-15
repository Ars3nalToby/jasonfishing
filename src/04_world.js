/* ======================================================================
   WORLD: sky, sun, terrain, water, pier, rock walls, trees, horizon.
   x = east (out to sea), z = south, y = up. Mean water level y = 0.
   ====================================================================== */
let S = SPOTS[0];
const W = { waterY: 0, amp: 0.4, windDir: 0.6, cloud: 0.35, sun: new THREE.Vector3(0.3, 0.8, 0.2), night: 0, t: 0 };
const world = new THREE.Group(); scene.add(world);

/* ---------- 2D value noise ---------- */
function vn2(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi, s), b = hash(xi + 1, zi, s), c = hash(xi, zi + 1, s), d = hash(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm2(x, z, s) { return 0.5 * vn2(x, z, s) + 0.25 * vn2(x * 2.1, z * 2.1, s + 3) + 0.125 * vn2(x * 4.3, z * 4.3, s + 7) + 0.0625 * vn2(x * 8.7, z * 8.7, s + 11); }
const gauss = x => Math.exp(-x * x);

/* ---------- terrain shape ---------- */
let SEED = 1;
function shoreRaw(z) { return 22 * Math.sin(z * 0.0055 + SEED) + 8 * Math.sin(z * 0.016 + SEED * 2.3) + 3 * Math.sin(z * 0.05 + SEED * 5.1); }
function shoreX(z) { return shoreRaw(z) - shoreRaw(0); }
function terrainH(x, z) {
  const d = x - shoreX(z);
  let h;
  if (d < 0) {
    const L = -d;
    h = 2.75 * sm(0, 38, L) + 1.4 * sm(45, 220, L) + 0.5 * gauss((L - 15) / 6) + 0.45 * (fbm2(x * 0.025, z * 0.025, 4) - 0.5) * sm(12, 50, L);
  } else {
    h = -1.3 * sm(0, 28, d) - 6.5 * sm(18, 230, d) - 7 * sm(200, 650, d) + 0.18 * (vn2(x * 0.4, z * 0.15, 9) - 0.5) * (1 - sm(40, 120, d));
    h += 0.9 * (fbm2(x * 0.012, z * 0.012, 12) - 0.5) * sm(30, 120, d);
  }
  if (S.cliff) {
    const g = gauss((z - S.cliff.z) / 38);
    if (d < 0) h += S.cliff.h * g * sm(0, 16, -d) * (0.8 + 0.4 * fbm2(x * 0.05, z * 0.05, 21));
    else h = Math.max(h, (1.6 - d * 0.07) * g + 0.6 * (fbm2(x * 0.15, z * 0.15, 22) - 0.5) * g - 0.4);
  }
  if (S.wall) {
    const dz = Math.abs(z - S.wall.z);
    if (d > -40 && d < S.wall.len) {
      const top = 2.5 - Math.max(0, dz - 3) * 0.75 - sm(S.wall.len - 25, S.wall.len, d) * 4;
      if (top > h) h = top;
    }
  }
  return h;
}
function isLand(x, z) { return terrainH(x, z) > W.waterY; }

/* ---------- waves (CPU twin of the GLSL below) ---------- */
const WAVES = [[38, 0, 1], [21, 0.5, 0.55], [13, -0.6, 0.38], [7.5, 1.1, 0.2], [4.2, -1.4, 0.1]];
function waveAt(x, z) {
  const depth = W.waterY - hmSample(x, z);
  const att = (0.25 + 0.75 * sm(0, 4, depth)) * W.amp;
  let h = 0;
  for (const [L, a, k] of WAVES) {
    const ang = W.windDir + a, dx = Math.cos(ang), dz = Math.sin(ang), w = 2 * Math.PI / L, sp = Math.sqrt(9.8 / w);
    h += k * 0.5 * Math.sin((x * dx + z * dz) * w - W.t * sp * w);
  }
  return W.waterY + h * att * 0.5;
}

/* ---------- heightmap texture (seabed depth for the water shader) ---------- */
const HM = { n: 512, r: 700, lo: -24, hi: 12, data: null, tex: null };
function bakeHeightmap() {
  const n = HM.n, buf = new Uint8Array(n * n * 4), f = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -HM.r + (i + 0.5) / n * 2 * HM.r, z = -HM.r + (j + 0.5) / n * 2 * HM.r, h = terrainH(x, z);
    f[j * n + i] = h; buf[(j * n + i) * 4] = Math.round(clamp01((h - HM.lo) / (HM.hi - HM.lo)) * 255); buf[(j * n + i) * 4 + 3] = 255;
  }
  HM.data = f;
  if (HM.tex) HM.tex.dispose();
  HM.tex = new THREE.DataTexture(buf, n, n, THREE.RGBAFormat);
  HM.tex.magFilter = HM.tex.minFilter = THREE.LinearFilter; HM.tex.needsUpdate = true;
}
function hmSample(x, z) {
  const n = HM.n, fx = (x + HM.r) / (2 * HM.r) * n - 0.5, fz = (z + HM.r) / (2 * HM.r) * n - 0.5;
  const i = Math.max(0, Math.min(n - 2, Math.floor(fx))), j = Math.max(0, Math.min(n - 2, Math.floor(fz)));
  const tx = clamp01(fx - i), tz = clamp01(fz - j), F = HM.data;
  const a = F[j * n + i], b = F[j * n + i + 1], c = F[(j + 1) * n + i], d = F[(j + 1) * n + i + 1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

/* ---------- shared GLSL: sky colour (used by the dome and by water reflections) ---------- */
const SKY_GLSL = `
uniform vec3 uSunDir; uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunCol; uniform vec3 uCloudCol;
uniform float uCloud; uniform float uTime; uniform float uNight;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
vec3 skyCol(vec3 d, bool clouds){
  float y = max(d.y, 0.0);
  vec3 c = mix(uHor, uZen, pow(y, 0.5));
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunCol * (pow(sd, 6.0) * 0.18 + pow(sd, 48.0) * 0.45);
  c += uSunCol * smoothstep(0.99955, 0.99985, sd) * 14.0 * (1.0 - uNight);
  if (clouds && d.y > 0.0) {
    vec2 p = d.xz / (d.y + 0.12) * 0.75 + vec2(uTime * 0.006, uTime * 0.003);
    float n = fbm(p * 1.3);
    float cov = smoothstep(0.78 - uCloud * 0.5, 0.98 - uCloud * 0.45, n);
    vec3 cc = uCloudCol * (0.8 + 0.35 * fbm(p * 3.1 + 4.0)) + uSunCol * pow(sd, 5.0) * 0.5;
    c = mix(c, cc, cov * smoothstep(0.0, 0.12, d.y) * 0.92);
  }
  if (uNight > 0.0) {
    vec2 q = vec2(atan(d.z, d.x) * 700.0, asin(clamp(d.y, -1.0, 1.0)) * 700.0);
    vec2 cell = floor(q), fq = fract(q) - 0.5;
    float s = step(0.993, h21(cell)) * smoothstep(0.32, 0.05, length(fq)) * (0.4 + 0.6 * h21(cell + 7.0));
    c += s * uNight * smoothstep(0.02, 0.3, d.y) * 0.9;
  }
  return c;
}`;
const SKY_U = {
  uSunDir: { value: W.sun }, uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
  uCloudCol: { value: new THREE.Color() }, uCloud: { value: 0.35 }, uTime: U.T, uNight: { value: 0 }
};
const sky = new THREE.Mesh(new THREE.SphereGeometry(8000, 48, 24), new THREE.ShaderMaterial({
  uniforms: SKY_U, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
  fragmentShader: SKY_GLSL + '\nvarying vec3 vD; void main(){ vec3 d = normalize(vD); vec3 c = d.y < 0.0 ? uHor * 0.85 : skyCol(d, true); gl_FragColor = vec4(c, 1.0);\n#include <tonemapping_fragment>\n#include <encodings_fragment>\n}'
}));
sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

/* ---------- lights ---------- */
const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
sunLight.castShadow = true; sunLight.shadow.mapSize.set(2048, 2048);
const sc = sunLight.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 400;
sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.04;
scene.add(sunLight, sunLight.target);
const hemi = new THREE.HemisphereLight(0xbfe3ff, 0xc8b48c, 0.6); scene.add(hemi);
scene.fog = new THREE.FogExp2(0xbcd8e8, 0.0011);

/* sun position from real solar geometry at the spot */
function solar(date, lat, lon) {
  const r = Math.PI / 180, d = (date - Date.UTC(date.getUTCFullYear(), 0, 0)) / 864e5;
  const decl = -23.44 * Math.cos(r * 360 / 365 * (d + 10));
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60;
  const ha = (utcH + lon / 15 - 12) * 15;
  const el = Math.asin(Math.sin(lat * r) * Math.sin(decl * r) + Math.cos(lat * r) * Math.cos(decl * r) * Math.cos(ha * r));
  let az = Math.atan2(-Math.sin(ha * r), Math.tan(decl * r) * Math.cos(lat * r) - Math.sin(lat * r) * Math.cos(ha * r));
  return { el, az }; // az from north, clockwise
}
const C3 = (r, g, b) => new THREE.Color(r, g, b);
function setSun(el, az) {
  // north = -z, east = +x
  W.sun.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  const e = el * 180 / Math.PI, day = sm(-4, 12, e), gold = sm(-4, 3, e) * (1 - sm(4, 20, e)), night = 1 - sm(-10, -2, e);
  W.night = night;
  const cl = W.cloud;
  const zen = C3(0.13, 0.36, 0.78).lerp(C3(0.04, 0.06, 0.14), 1 - day).lerp(C3(0.006, 0.01, 0.03), night);
  const hor = C3(0.62, 0.78, 0.9).lerp(C3(0.98, 0.6, 0.38), gold * 0.9).lerp(C3(0.02, 0.035, 0.07), night);
  const grey = C3(0.6, 0.64, 0.68).multiplyScalar(0.25 + 0.75 * day);
  zen.lerp(grey, cl * 0.55); hor.lerp(grey, cl * 0.35);
  const sun = C3(1.0, 0.95, 0.86).lerp(C3(1.0, 0.55, 0.25), gold).multiplyScalar(day * (1 - cl * 0.55));
  SKY_U.uZen.value.copy(zen); SKY_U.uHor.value.copy(hor); SKY_U.uSunCol.value.copy(sun);
  SKY_U.uCloudCol.value.copy(C3(1, 1, 1).lerp(C3(1, 0.72, 0.55), gold).multiplyScalar(0.12 + 0.88 * day).lerp(C3(0.55, 0.58, 0.62), cl * 0.5 * day));
  SKY_U.uCloud.value = cl; SKY_U.uNight.value = night;
  sunLight.color.copy(sun.clone().multiplyScalar(1 / Math.max(0.001, Math.max(sun.r, sun.g, sun.b)))); sunLight.intensity = 1.35 * day * (1 - cl * 0.5);
  hemi.color.copy(zen.clone().lerp(C3(1, 1, 1), 0.35)); hemi.groundColor.copy(C3(0.62, 0.55, 0.42).multiplyScalar(0.3 + 0.7 * day));
  hemi.intensity = 0.18 + 0.34 * day + 0.1 * night;
  if (night > 0.5) { hemi.color.setRGB(0.25, 0.35, 0.6); }
  scene.fog.color.copy(hor);
  scene.fog.density = 0.0009 + cl * 0.0004;
  renderer.toneMappingExposure = 0.82 + night * 0.7;
  refreshHaze(hor);
  envDirty = true;
}
/* environment map from the sky, rebuilt when the sun changes */
let envDirty = true, envRT = null;
const pmrem = new THREE.PMREMGenerator(renderer);
function updateEnv() {
  if (!envDirty) return; envDirty = false;
  const es = new THREE.Scene(); const s2 = sky.clone(); s2.material = sky.material; es.add(s2);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), new THREE.MeshBasicMaterial({ color: SKY_U.uHor.value.clone().multiplyScalar(0.55) }));
  g.rotation.x = -Math.PI / 2; g.position.y = -50; es.add(g);
  const rt = pmrem.fromScene(es, 0, 1, 9000);
  if (envRT) envRT.dispose(); envRT = rt; scene.environment = rt.texture;
  scene.traverse(o => { if (o.material && o.material.isMeshStandardMaterial && !o.material.userData.envKeep) o.material.envMapIntensity = o.material.metalness > 0.5 ? 0.7 : 0.25; });
}

/* ---------- procedural detail textures ---------- */
function noiseTex(size, fn, repeat) {
  const cv = canvasOf(size, size), g = cv.getContext('2d'), im = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const v = fn(x / size, y / size), k = (y * size + x) * 4; im.data[k] = im.data[k + 1] = im.data[k + 2] = v * 255; im.data[k + 3] = 255; }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8; return t;
}
const sandTex = noiseTex(256, (u, v) => 0.78 + 0.22 * (0.6 * samp(FS, u * 2, v * 2) + 0.4 * samp(FF, u, v)), 220);
const woodTex = (function () {
  const cv = canvasOf(256, 256), g = cv.getContext('2d'), im = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const gr = samp(FR, x / 256 * 0.5, y / 256 * 6), k = (y * 256 + x) * 4, v = 0.72 + 0.28 * gr - 0.12 * samp(FS, x / 256 * 3, y / 256 * 3);
    im.data[k] = 255 * v; im.data[k + 1] = 255 * v; im.data[k + 2] = 255 * v; im.data[k + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
})();

/* ---------- terrain ---------- */
const TER = { size: 1400, seg: 420, mesh: null };
const terMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: sandTex, roughness: 0.95, metalness: 0, envMapIntensity: 0.4 });
terMat.onBeforeCompile = sh => {
  sh.uniforms.uCaus = U.caus;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp2;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp2 = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uCaus;\nvarying vec3 vWp2;' + CAUS_GLSL)
    .replace('#include <dithering_fragment>', 'float uwd = uCaus.z - vWp2.y; if (uwd > 0.0) { float cs = caus(vWp2.xz * 0.55, uCaus.x) * uCaus.y * exp(-uwd * 0.25) * smoothstep(0.0, 0.25, uwd); gl_FragColor.rgb += cs * vec3(0.35, 0.42, 0.36); }\n#include <dithering_fragment>');
};
function buildTerrain() {
  if (TER.mesh) { world.remove(TER.mesh); TER.mesh.geometry.dispose(); }
  const g = new THREE.PlaneGeometry(TER.size, TER.size, TER.seg, TER.seg); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const dry = [0.8, 0.69, 0.5], wet = [0.55, 0.45, 0.32], grass = [0.36, 0.48, 0.22], grass2 = [0.48, 0.52, 0.28], rock = S.cliff ? S.cliff.col.map(v => v / 255) : [0.5, 0.46, 0.4];
  const bed = [0.72, 0.66, 0.5], bedDeep = [0.36, 0.4, 0.34], weed = [0.2, 0.3, 0.16], wallC = [0.38, 0.36, 0.33];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = terrainH(x, z); p.setY(i, h);
    const d = x - shoreX(z), L = -d, e = 1.2;
    const sl = Math.abs(terrainH(x + e, z) - terrainH(x - e, z)) + Math.abs(terrainH(x, z + e) - terrainH(x, z - e));
    let c;
    if (d < 0) {
      c = mix3(wet, dry, sm(1, 9, L));
      const gm = sm(24, 36, L + 6 * (fbm2(x * 0.06, z * 0.06, 31) - 0.5)); c = mix3(c, mix3(grass, grass2, fbm2(x * 0.08, z * 0.08, 33)), gm);
    } else {
      c = mix3(bed, bedDeep, sm(10, 160, d));
      const sg = sm(0.55, 0.7, fbm2(x * 0.03, z * 0.03, 41)) * sm(15, 40, d) * (1 - sm(150, 260, d));
      c = mix3(c, weed, sg * 0.85); // seagrass meadows
    }
    c = mix3(c, rock, sm(0.9, 2.2, sl));
    if (S.wall && Math.abs(z - S.wall.z) < 8 && d > -40 && d < S.wall.len && h > -3) c = mix3(c, wallC, 0.8);
    const n = 0.92 + 0.16 * vn2(x * 0.7, z * 0.7, 51);
    col[i * 3] = c[0] * n; col[i * 3 + 1] = c[1] * n; col[i * 3 + 2] = c[2] * n;
  }
  for (let i = 0; i < col.length; i++) col[i] = Math.pow(col[i], 2.2);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  TER.mesh = new THREE.Mesh(g, terMat); TER.mesh.receiveShadow = true; world.add(TER.mesh);
}

/* ---------- water: radial grid that follows the camera ---------- */
function radialGrid(rings, segs, r0, r1) {
  const pos = [], idx = [];
  pos.push(0, 0, 0);
  for (let i = 1; i <= rings; i++) {
    const r = r0 * Math.pow(r1 / r0, (i - 1) / (rings - 1));
    for (let j = 0; j < segs; j++) { const a = j / segs * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + (j + 1) % segs, 1 + j);
  for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = 1 + (i - 1) * segs + j, b = 1 + (i - 1) * segs + (j + 1) % segs, c = a + segs, d = b + segs;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}
const WAVE_GLSL = `
uniform float uAmp; uniform float uWind;
float waves(vec2 p, float att, out vec2 grad){
  float h = 0.0; grad = vec2(0.0);
  ${WAVES.map(([L, a, k]) => `{ float ang = uWind + ${a.toFixed(3)}; vec2 dr = vec2(cos(ang), sin(ang)); float w = ${(2 * Math.PI / L).toFixed(5)}; float sp = sqrt(9.8 / w);
    float ph = dot(p, dr) * w - uTime * sp * w; h += ${(k * 0.5).toFixed(4)} * sin(ph); grad += ${(k * 0.5).toFixed(4)} * w * cos(ph) * dr; }`).join('\n  ')}
  float s = att * uAmp * 0.5; grad *= s; return h * s;
}`;
const WAT_U = Object.assign({
  uHM: { value: null }, uHMR: { value: HM.r }, uHMLo: { value: HM.lo }, uHMHi: { value: HM.hi },
  uWaterY: { value: 0 }, uAmp: { value: 0.4 }, uWind: { value: 0.6 }, uCenter: { value: new THREE.Vector3() },
  uShallow: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uK: { value: 0.4 }, uAmb: { value: 1 },
  uFogCol: { value: new THREE.Color() }, uFogD: { value: 0.001 }
}, SKY_U);
const water = new THREE.Mesh(radialGrid(150, 160, 0.6, 5000), new THREE.ShaderMaterial({
  uniforms: WAT_U, transparent: true, depthWrite: false, fog: false,
  vertexShader: SKY_GLSL.split('\n').filter(l => l.startsWith('uniform')).join('\n') + `
uniform sampler2D uHM; uniform float uHMR; uniform float uHMLo; uniform float uHMHi; uniform float uWaterY; uniform vec3 uCenter;
${WAVE_GLSL}
varying vec3 vWp; varying float vDepth; varying float vAtt;
float seabed(vec2 p){ vec2 uv = (p + uHMR) / (2.0 * uHMR); float h = texture2D(uHM, clamp(uv, 0.001, 0.999)).r; return mix(uHMLo, uHMHi, h); }
void main(){
  vec3 wp = position + vec3(uCenter.x, 0.0, uCenter.z);
  float depth = uWaterY - seabed(wp.xz);
  float dist = length(position.xz);
  float att = (0.25 + 0.75 * smoothstep(0.0, 4.0, depth)) * (1.0 - smoothstep(250.0, 1400.0, dist));
  vec2 g; wp.y = uWaterY + waves(wp.xz, att, g);
  vWp = wp; vDepth = depth; vAtt = att;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,
  fragmentShader: SKY_GLSL + `
uniform sampler2D uHM; uniform float uHMR; uniform float uHMLo; uniform float uHMHi; uniform float uWaterY;
uniform vec3 uShallow; uniform vec3 uDeep; uniform float uK; uniform float uAmb; uniform vec3 uFogCol; uniform float uFogD;
${WAVE_GLSL}
varying vec3 vWp; varying float vDepth; varying float vAtt;
float seabed(vec2 p){ vec2 uv = (p + uHMR) / (2.0 * uHMR); float h = texture2D(uHM, clamp(uv, 0.001, 0.999)).r; return mix(uHMLo, uHMHi, h); }
void main(){
  vec2 p = vWp.xz;
  float depth = uWaterY - seabed(p);
  if (depth < -0.6) discard;
  vec3 toCam = cameraPosition - vWp; float dist = length(toCam); vec3 v = toCam / dist;
  vec2 g; float hgt = waves(p, vAtt, g);
  float df = 1.0 - smoothstep(30.0, 260.0, dist);
  vec2 dn = vec2(sin(p.x * 1.3 + uTime * 1.1 + sin(p.y * 0.9)), cos(p.y * 1.7 - uTime * 0.9 + sin(p.x * 1.1))) * 0.045
          + vec2(sin((p.x + p.y) * 3.1 + uTime * 2.0), cos((p.x - p.y) * 2.7 - uTime * 1.7)) * 0.025
          + (vec2(vn(p * 0.9 + uTime * 0.3), vn(p.yx * 0.9 - uTime * 0.25)) - 0.5) * 0.12;
  vec3 n = normalize(vec3(-g.x - dn.x * df * (0.4 + uAmp), 1.0, -g.y - dn.y * df * (0.4 + uAmp)));
  vec3 r = reflect(-v, n); r.y = abs(r.y) + 0.02;
  vec3 rc = skyCol(normalize(r), true);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  float light = max(uSunDir.y, 0.0) * 0.9 + 0.12;
  vec3 body = mix(uShallow, uDeep, 1.0 - exp(-max(depth, 0.0) * 0.28)) * (uAmb * light + dot(uSunCol, vec3(0.2)) * 0.6);
  body += uShallow * 0.35 * pow(max(dot(v, -uSunDir) * 0.5 + 0.5, 0.0), 3.0) * smoothstep(0.0, 0.5, hgt + 0.2) * light;
  float slant = 1.0 + 2.5 * (1.0 - abs(v.y));
  float alpha = 1.0 - exp(-max(depth, 0.0) * uK * slant);
  vec3 col = mix(body, rc, fres);
  vec3 sr = reflect(-uSunDir, n);
  col += uSunCol * (pow(max(dot(sr, v), 0.0), 600.0) * 6.0 + pow(max(dot(sr, v), 0.0), 60.0) * 0.18);
  float tex = 0.55 + 0.45 * vn(p * 1.6 + vec2(uTime * 0.2, 0.0)) * vn(p * 3.7 - uTime * 0.15);
  float shore = 1.0 - smoothstep(0.0, 0.3, depth);
  float lines = smoothstep(0.8, 0.97, sin(depth * 3.0 - uTime * 1.25 + vn(p * 0.25) * 5.0)) * (1.0 - smoothstep(0.25, 1.8 + uAmp, depth)) * smoothstep(0.0, 0.08, uAmp);
  float crest = smoothstep(0.55, 0.9, hgt / max(uAmp * 0.5 * vAtt, 0.01)) * 0.35 * smoothstep(0.4, 1.2, uAmp);
  float foam = clamp((shore * 0.9 + lines + crest) * tex, 0.0, 1.0);
  vec3 foamCol = vec3(0.92, 0.95, 0.95) * (uAmb * light + dot(uSunCol, vec3(0.25)));
  col = mix(col, foamCol, foam);
  alpha = clamp(max(alpha, max(foam, fres * 0.95)), 0.0, 1.0);
  alpha *= smoothstep(-0.6, 0.0, depth) * 0.5 + 0.5 * step(0.0, depth);
  float f = 1.0 - exp(-uFogD * uFogD * dist * dist);
  col = mix(col, uFogCol, f); alpha = mix(alpha, 1.0, f);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
}`
}));
water.frustumCulled = false; water.renderOrder = 5; scene.add(water);

/* ---------- builders for props ---------- */
const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, color: 0x9a7b5a, roughness: 0.85, metalness: 0 });
const woodDark = new THREE.MeshStandardMaterial({ map: woodTex, color: 0x5e4a36, roughness: 0.9 });
const metalMat = new THREE.MeshStandardMaterial({ color: 0x8c9396, roughness: 0.45, metalness: 0.8 });
const props = new THREE.Group(); world.add(props);
function clearGroup(g) { while (g.children.length) { const c = g.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); }); } }
function inst(geo, mat, mats, shadow) {
  const m = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((M, i) => m.setMatrixAt(i, M));
  m.castShadow = shadow !== false; m.receiveShadow = true; props.add(m); return m;
}
const M4 = (x, y, z, ry, sx, sy, sz, rx, rz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(sx || 1, sy || 1, sz || 1));
function vcol(geo, c) { return paint(geo, c); }

/* pier: deck, T-head, pylons, rails, lamps, shelter, cleaning table, sign */
const PIER = { x0: 0, x1: 0, w: 3, h: 2.6, hx0: 0, hw: 9, lamps: [] };
function signTexture(lines, w, h, bg, fg) {
  const cv = canvasOf(w, h), g = cv.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => { g.font = (i === 0 ? '700 ' : '500 ') + l[1] + 'px system-ui, sans-serif'; g.fillText(l[0], w / 2, l[2] * h); });
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
  const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t;
}
function buildPier() {
  const P = S.pier, sx = shoreX(0);
  // start where the foreshore reaches deck height
  let x0 = sx - 2; while (terrainH(x0, 0) < 2.45 && x0 > sx - 90) x0 -= 0.5;
  const h = terrainH(x0, 0) + 0.12, x1 = sx + P.len, w = P.w;
  Object.assign(PIER, { x0, x1, w, h, hx0: x1 - P.head[0], hw: P.head[1] });
  const planks = [], pyl = [], posts = [], rails = [];
  for (let x = x0; x < x1; x += 0.3) {
    const head = x > PIER.hx0, ww = head ? PIER.hw : w;
    planks.push(M4(x + 0.14, h - 0.05, 0, 0, 0.27, 0.07, ww, 0, (hash(x * 10 | 0, 1, 3) - 0.5) * 0.01));
  }
  const pylon = (x, z) => { const b = terrainH(x, z) - 1.5, L = h - 0.12 - b; pyl.push(M4(x, b + L / 2, z, 0, 1, L, 1)); };
  for (let x = x0 + 4; x < x1; x += 4) {
    const head = x > PIER.hx0 - 0.1, hz = (head ? PIER.hw : w) / 2 - 0.15;
    if (terrainH(x, 0) < h - 0.6) { pylon(x, -hz); pylon(x, hz); if (head) pylon(x, 0); }
  }
  const railRun = (xa, xb, z) => { for (let x = xa; x <= xb + 0.01; x += 2) posts.push(M4(x, h + 0.55, z, 0, 1, 1, 1)); rails.push(M4((xa + xb) / 2, h + 1.08, z, 0, xb - xa, 1, 1)); rails.push(M4((xa + xb) / 2, h + 0.6, z, 0, xb - xa, 1, 1)); };
  railRun(x0 + 3, PIER.hx0, -w / 2 + 0.06); railRun(x0 + 3, PIER.hx0, w / 2 - 0.06);
  railRun(PIER.hx0, x1, -PIER.hw / 2 + 0.06); railRun(PIER.hx0, x1, PIER.hw / 2 - 0.06);
  rails.push(M4(x1 - 0.05, h + 1.08, 0, Math.PI / 2, PIER.hw, 1, 1)); rails.push(M4(x1 - 0.05, h + 0.6, 0, Math.PI / 2, PIER.hw, 1, 1));
  for (let z = -PIER.hw / 2; z <= PIER.hw / 2; z += 2) posts.push(M4(x1 - 0.05, h + 0.55, z, 0, 1, 1, 1));
  const ps = inst(new THREE.BoxGeometry(1, 1, 1), woodMat, planks); ps.castShadow = true;
  const pg = new THREE.CylinderGeometry(0.17, 0.2, 1, 10);
  inst(pg, woodDark, pyl);
  inst(new THREE.BoxGeometry(0.12, 1.1, 0.12), woodMat, posts);
  inst(new THREE.BoxGeometry(1, 0.08, 0.1), woodMat, rails);
  // stringers under the deck
  const str = [M4((x0 + PIER.hx0) / 2, h - 0.25, -w / 2 + 0.3, 0, PIER.hx0 - x0, 0.3, 0.2), M4((x0 + PIER.hx0) / 2, h - 0.25, w / 2 - 0.3, 0, PIER.hx0 - x0, 0.3, 0.2)];
  inst(new THREE.BoxGeometry(1, 1, 1), woodDark, str);
  // lamps
  PIER.lamps = [];
  const lampG = new THREE.Group();
  for (let x = x0 + 10; x < x1; x += 18) {
    const z = (x > PIER.hx0 ? PIER.hw : w) / 2 - 0.1, side = ((x / 18) | 0) % 2 ? 1 : -1;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.6, 8), metalMat); pole.position.set(x, h + 1.8, z * side); lampG.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffc070, emissiveIntensity: 0, roughness: 0.3 }));
    head.position.set(x, h + 3.65, z * side); lampG.add(head); PIER.lamps.push(head);
  }
  props.add(lampG);
  // shelter roof on the head
  const roof = new THREE.Group(), rx = x1 - P.head[0] * 0.5, rl = P.head[0] * 0.7, rw = PIER.hw * 0.7;
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.7, 0.16), woodMat); p.position.set(rx + a * rl / 2, h + 1.35, b * rw / 2); p.castShadow = true; roof.add(p); });
  const rm = new THREE.MeshStandardMaterial({ color: 0x2f6f6a, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide });
  [-1, 1].forEach(s => { const pl = new THREE.Mesh(new THREE.BoxGeometry(rl + 0.8, 0.06, rw / 2 / Math.cos(0.32) + 0.35), rm); pl.rotation.x = s * 0.32; pl.position.set(rx, h + 2.95, s * rw / 4); pl.castShadow = true; roof.add(pl); });
  // bench and fish-cleaning table with tap
  const bench = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 0.45), woodMat); bench.position.set(rx - 1, h + 0.48, -rw / 2 + 0.6); roof.add(bench);
  const steel = new THREE.MeshStandardMaterial({ color: 0xd8dcdc, roughness: 0.3, metalness: 0.7 });
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.7), steel); table.position.set(rx + 1.4, h + 0.9, rw / 2 - 0.6); roof.add(table);
  [[-0.7, -0.28], [0.7, -0.28], [-0.7, 0.28], [0.7, 0.28]].forEach(([a, b]) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6), steel); l.position.set(rx + 1.4 + a, h + 0.45, rw / 2 - 0.6 + b); roof.add(l); });
  const sink = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.4), new THREE.MeshStandardMaterial({ color: 0x9aa2a5, roughness: 0.2, metalness: 0.9 })); sink.position.set(rx + 1.75, h + 0.88, rw / 2 - 0.6); roof.add(sink);
  const tap = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 12, Math.PI), metalMat); tap.position.set(rx + 1.4, h + 1.05, rw / 2 - 0.35); roof.add(tap);
  props.add(roof);
  // rules sign at the entry
  const st = signTexture([['FISHING', 64, 0.2], ['Size and possession', 34, 0.42], ['limits apply', 34, 0.55], ['Release undersize fish', 30, 0.72], ['quickly and carefully', 30, 0.84]], 512, 512, '#1d4f73', '#f2f6f4');
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshStandardMaterial({ map: st, roughness: 0.5 }));
  sg.position.set(x0 + 2.2, h + 1.6, -w / 2 - 0.4); sg.rotation.y = -Math.PI / 2 + 0.6; props.add(sg);
  const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), metalMat); sp.position.set(x0 + 2.2, h + 0.6, -w / 2 - 0.42); props.add(sp);
}

/* rock walls and boulders */
function buildRocks() {
  const m = [], ms = [];
  const rg = new THREE.DodecahedronGeometry(1, 1);
  rg.attributes.position.array.forEach((v, i, a) => { a[i] = v * (0.82 + 0.36 * hash(i, 7, 3)); }); rg.computeVertexNormals();
  if (S.wall) {
    for (let d = -20; d < S.wall.len; d += 1.6) for (let k = -2; k <= 2; k++) {
      const x = shoreX(S.wall.z) + d + (hash(d * 7 | 0, k, 1) - 0.5), z = S.wall.z + k * 2.2 + (hash(d * 7 | 0, k, 2) - 0.5) * 1.2;
      const y = terrainH(x, z) + 0.2, s = 0.9 + hash(d * 7 | 0, k, 4) * 0.9;
      m.push(M4(x, y, z, hash(d | 0, k, 5) * 6, s * 1.2, s * 0.8, s, hash(d | 0, k, 6), 0));
    }
  }
  if (S.cliff) {
    for (let i = 0; i < 90; i++) {
      const z = S.cliff.z + (hash(i, 1, 9) - 0.5) * 80, x = shoreX(z) + (hash(i, 2, 9) - 0.6) * 18, y = terrainH(x, z), s = 0.4 + hash(i, 3, 9) * 1.4;
      ms.push(M4(x, y, z, hash(i, 4, 9) * 6, s * 1.3, s * 0.7, s));
    }
  }
  const rockM = new THREE.MeshStandardMaterial({ color: S.cliff ? new THREE.Color(S.cliff.col[0] / 255, S.cliff.col[1] / 255, S.cliff.col[2] / 255).multiplyScalar(0.8) : 0x6d6760, roughness: 0.9, flatShading: true });
  const wallM = new THREE.MeshStandardMaterial({ color: 0x5f5a54, roughness: 0.92, flatShading: true });
  if (m.length) inst(rg, wallM, m);
  if (ms.length) inst(rg, rockM, ms);
}

/* trees: Norfolk pines, palms, pandanus */
function treeGeo(kind) {
  const D = detailKit();
  if (kind === 'norfolk') {
    D.rod([0, 0, 0], [0, 15, 0], 0.32, 0.06, 0x5a4636, 7);
    for (let t = 0; t < 11; t++) {
      const y = 3 + t * 1.15, r = 3.2 * (1 - t / 12) + 0.4;
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + t; D.rod([0, y, 0], [Math.cos(a) * r, y - 0.5, Math.sin(a) * r], 0.38 - t * 0.02, 0.12, t % 2 ? 0x2f5a2c : 0x376536, 5); }
    }
  } else if (kind === 'palm') {
    const top = [1.2, 9, 0.4];
    D.tube([[0, 0, 0], [0.5, 3, 0.1], [1.0, 6.5, 0.3], top], 0.2, 0x8a7458, 16, 7);
    for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; D.tube([top, [top[0] + Math.cos(a) * 2, top[1] + 0.8, top[2] + Math.sin(a) * 2], [top[0] + Math.cos(a) * 3.8, top[1] - 1.2, top[2] + Math.sin(a) * 3.8]], 0.16, 0x3f7a34, 8, 4); }
  } else {
    D.rod([0, 0, 0], [0.3, 3.5, 0], 0.18, 0.12, 0x7a6a56, 6);
    for (let k = 0; k < 4; k++) { const a = k * 1.7; D.rod([0.3, 1.2, 0], [0.3 + Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9], 0.04, 0.03, 0x8a7458, 4); }
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, b = hash(k, 1, 1) * 0.6; D.rod([0.3, 3.5, 0], [0.3 + Math.cos(a) * 2, 3.5 + 0.6 - b * 2.5, Math.sin(a) * 2], 0.14, 0.03, 0x4f7a3a, 3); }
  }
  return mergeGeos(D.list, ['position', 'normal', 'color']);
}
const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
function buildTrees() {
  const kinds = S.trees === 'mixed' ? ['norfolk', 'pandanus'] : [S.trees === 'pandanus' ? 'pandanus' : S.trees];
  if (S.trees !== 'norfolk' && S.trees !== 'mixed') kinds.push('palm');
  kinds.forEach((k, ki) => {
    const mats = [], n = k === 'norfolk' ? 16 : 26;
    for (let i = 0; i < n; i++) {
      let z = -220 + (i + hash(i, ki, 4) * 0.8) * (440 / n);
      if (Math.abs(z) < 9) z += 14;
      const L = 30 + hash(i, ki, 5) * 22 + (k === 'norfolk' ? 4 : 0), x = shoreX(z) - L;
      const s = (k === 'norfolk' ? 1.1 : 1) * (0.75 + hash(i, ki, 6) * 0.5);
      mats.push(M4(x, terrainH(x, z) - 0.2, z, hash(i, ki, 7) * 6, s, s, s));
    }
    inst(treeGeo(k), treeMat, mats);
  });
}

/* bait shop kiosk and picnic shelters */
function buildShops() {
  const x = PIER.x0 - 10, z = -12, y = terrainH(x, z);
  const g = new THREE.Group(); g.position.set(x, y, z);
  const wallM = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), wallM); body.position.y = 1.5; body.castShadow = body.receiveShadow = true; g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.2, 5.2), new THREE.MeshStandardMaterial({ color: 0x2d5f7a, roughness: 0.5, metalness: 0.4 })); roof.position.y = 3.15; roof.rotation.z = 0.06; roof.castShadow = true; g.add(roof);
  const tx = signTexture([['BAIT & TACKLE', 76, 0.42], ['prawns · squid · pilchards · ice', 34, 0.76]], 1024, 256, '#f4c542', '#16323f');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.5 })); sign.position.set(2.51, 2.4, 0); sign.rotation.y = Math.PI / 2; g.add(sign);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.0), new THREE.MeshStandardMaterial({ color: 0x1b2a30, roughness: 0.1, metalness: 0.6 })); win.position.set(2.52, 1.2, 0); win.rotation.y = Math.PI / 2; g.add(win);
  props.add(g);
  for (let k = 0; k < 2; k++) {
    const sx = PIER.x0 - 16 - k * 3, sz = 18 + k * 22, sy = terrainH(sx, sz), sh = new THREE.Group(); sh.position.set(sx, sy, sz);
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), woodMat); p.position.set(a * 1.8, 1.3, b * 1.4); sh.add(p); });
    const r = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.2, 4), new THREE.MeshStandardMaterial({ color: 0x8a4a2e, roughness: 0.7 })); r.position.y = 3.1; r.rotation.y = Math.PI / 4; r.castShadow = true; sh.add(r);
    const t = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 0.9), woodMat); t.position.y = 0.75; t.castShadow = true; sh.add(t);
    props.add(sh);
  }
}

/* horizon: Moreton Island dunes, Surfers skyline, Glass House Mountains. Pre-hazed, unlit. */
const haze = [];
function hazeMat(base, k) { const m = new THREE.MeshBasicMaterial({ color: base, fog: false, vertexColors: false }); haze.push({ m, base: new THREE.Color(base), k }); return m; }
function refreshHaze(hor) { haze.forEach(h => { h.m.color.copy(h.base).multiplyScalar(0.25 + 0.75 * (1 - W.night) * 0.9 + 0.05).lerp(hor, h.k); }); }
const horizon = new THREE.Group(); scene.add(horizon);
function buildHorizon() {
  clearGroup(horizon); haze.length = 0;
  if (S.horizon === 'moreton') {
    const g = new THREE.PlaneGeometry(9000, 200, 300, 4); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), top = p.getY(i) > 0; const hh = top ? (40 + 70 * fbm2(x * 0.002, 1, 61) + 60 * sm(0.55, 0.8, vn2(x * 0.004, 2, 62))) * (1 - sm(3000, 4400, Math.abs(x))) : -20; p.setY(i, hh); }
    const isl = new THREE.Mesh(g, hazeMat(0x6f8a68, 0.62)); isl.position.set(2600, 0, 0); isl.rotation.y = -Math.PI / 2; horizon.add(isl);
    const g2 = g.clone(); const isl2 = new THREE.Mesh(g2, hazeMat(0xd9cfae, 0.68)); isl2.scale.set(0.15, 0.85, 1); isl2.position.set(2620, 0, -900); isl2.rotation.y = -Math.PI / 2; horizon.add(isl2);
  }
  if (S.skyline) {
    for (let i = 0; i < 46; i++) {
      const h = 40 + hash(i, 1, 71) * 150 + (i === 20 ? 140 : 0), w = 18 + hash(i, 2, 71) * 20;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), hazeMat(0xb8c2c8, 0.55 + hash(i, 3, 71) * 0.15));
      b.position.set(-120 + hash(i, 4, 71) * 280, h / 2, 1700 + i * 26 + hash(i, 5, 71) * 30); horizon.add(b);
      if (i === 20) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 3, 70, 6), hazeMat(0xc8d0d4, 0.55)); sp.position.set(b.position.x, h + 35, b.position.z); horizon.add(sp); }
    }
  }
  if (S.glasshouse) {
    [[-2600, 1800, 260, 220], [-2900, 2300, 330, 260], [-2500, 2650, 210, 120], [-3100, 3100, 300, 300], [-2700, 1400, 150, 160]].forEach(([x, z, h, r], i) => {
      const g = new THREE.ConeGeometry(r, h, 18, 4); const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) { const y = p.getY(k); if (y > h * 0.2) { p.setX(k, p.getX(k) * (0.55 + 0.25 * hash(k, i, 3))); p.setZ(k, p.getZ(k) * (0.55 + 0.25 * hash(k, i, 4))); } }
      const m = new THREE.Mesh(g, hazeMat(0x4f6a58, 0.6)); m.position.set(x, h / 2 - 10, z); horizon.add(m);
    });
  }
  const hills = new THREE.PlaneGeometry(8000, 160, 200, 2); const hp = hills.attributes.position;
  for (let i = 0; i < hp.count; i++) if (hp.getY(i) > 0) hp.setY(i, 20 + 50 * fbm2(hp.getX(i) * 0.003, 5, 81));
  const hm = new THREE.Mesh(hills, hazeMat(0x5d7458, 0.7)); hm.position.set(-1800, 0, 0); hm.rotation.y = Math.PI / 2; horizon.add(hm);
}

function buildWorld(spot) {
  S = spot; SEED = SPOTS.indexOf(spot) * 1.7 + 0.4;
  const w = spot.water;
  WAT_U.uShallow.value.setRGB(w.shallow[0], w.shallow[1], w.shallow[2]).convertSRGBToLinear();
  WAT_U.uDeep.value.setRGB(w.deep[0], w.deep[1], w.deep[2]).convertSRGBToLinear();
  WAT_U.uK.value = w.k;
  U.water.value.set(WAT_U.uDeep.value.r * 1.4, WAT_U.uDeep.value.g * 1.4, WAT_U.uDeep.value.b * 1.4, w.k * 1.1);
  bakeHeightmap(); WAT_U.uHM.value = HM.tex;
  buildTerrain(); clearGroup(props); buildPier(); buildRocks(); buildTrees(); buildShops(); buildHorizon();
}

function updateWorld(dt) {
  W.t += dt; U.T.value = W.t; U.caus.value.x = W.t; U.caus.value.z = W.waterY;
  WAT_U.uWaterY.value = W.waterY; WAT_U.uAmp.value = W.amp; WAT_U.uWind.value = W.windDir;
  WAT_U.uCenter.value.set(Math.round(camera.position.x / 4) * 4, 0, Math.round(camera.position.z / 4) * 4);
  WAT_U.uFogCol.value.copy(scene.fog.color); WAT_U.uFogD.value = scene.fog.density; WAT_U.uAmb.value = 0.6 + 0.4 * (1 - W.night);
  U.caus.value.y = 0.45 * (1 - W.night) * (1 - W.cloud * 0.6);
  sky.position.copy(camera.position);
  sunLight.position.copy(camera.position).addScaledVector(W.sun, 200); sunLight.target.position.copy(camera.position);
  PIER.lamps.forEach(l => l.material.emissiveIntensity = W.night * 3);
}
