/* ======================================================================
   FISHING: rod, cast, float, bites, the fight, landing, Qld rule check
   ====================================================================== */
const FISH = { state: 'idle', power: 0, pdir: 1, t: 0, bob: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), flight: 0,
  biteIn: 0, nibbleIn: 0, hooked: null, tension: 0, dist: 0, run: 0, runT: 0, slackT: 0, overT: 0, ang: 0, catchObj: null };
const protos = {};   // species id -> built prototype
const seenSchools = [];

/* ---------- rod view-model ---------- */
const rod = new THREE.Group(); camera.add(rod);
const rodSegs = [];
(function buildRod() {
  const blank = new THREE.MeshStandardMaterial({ color: 0x1d2a3a, roughness: 0.35, metalness: 0.4 });
  const cork = new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.9 });
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.42, 10), cork); grip.position.y = -0.1; rod.add(grip);
  const reel = new THREE.Group();
  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 18), new THREE.MeshStandardMaterial({ color: 0xcfd4d8, roughness: 0.3, metalness: 0.9 }));
  spool.rotation.x = Math.PI / 2; reel.add(spool);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.05), blank); body.position.set(0, 0.06, -0.01); reel.add(body);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 6), metalMat); handle.rotation.z = Math.PI / 2; handle.position.set(0.05, 0, 0); reel.add(handle);
  reel.position.set(0, 0.02, 0.06); rod.add(reel); rod.userData.reel = reel;
  // blank in segments so it can bend under load
  let parent = rod, len = 0.32, r0 = 0.012;
  for (let i = 0; i < 8; i++) {
    const seg = new THREE.Group(); seg.position.y = i === 0 ? 0.11 : len;
    len = 0.3 - i * 0.012; const r1 = r0 * 0.78;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 7), blank); m.position.y = len / 2; seg.add(m);
    const guide = new THREE.Mesh(new THREE.TorusGeometry(0.012 - i * 0.001, 0.0015, 4, 10), metalMat); guide.position.set(0, len * 0.9, 0.014); seg.add(guide);
    parent.add(seg); rodSegs.push(seg); parent = seg; r0 = r1;
  }
  const tip = new THREE.Object3D(); tip.position.y = len; parent.add(tip); rod.userData.tip = tip;
  rod.position.set(0.32, -0.36, -0.36); rod.rotation.set(-0.9, 0.12, -0.18);
  rod.visible = false;
  rod.traverse(o => { o.frustumCulled = false; });
})();
const tipW = new THREE.Vector3();

/* float + line */
const bobber = new THREE.Group();
(function () {
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xff3b1f, roughness: 0.4, emissive: 0x401000 }));
  const bot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.4 }));
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 6), new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0x442200 })); stem.position.y = 0.1;
  bobber.add(top, bot, stem); bobber.visible = false; scene.add(bobber);
})();
const LINE_N = 40;
const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINE_N * 3), 3));
const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xfff4c0 })); line.frustumCulled = false; line.visible = false; scene.add(line);
function drawLine(a, b, sag) {
  const arr = lineGeo.attributes.position.array;
  for (let i = 0; i < LINE_N; i++) {
    const t = i / (LINE_N - 1);
    arr[i * 3] = mix(a.x, b.x, t); arr[i * 3 + 1] = mix(a.y, b.y, t) - sag * 4 * t * (1 - t); arr[i * 3 + 2] = mix(a.z, b.z, t);
  }
  lineGeo.attributes.position.needsUpdate = true;
}

/* splash rings */
const rings = [];
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
function splash(x, z, big) {
  for (let k = 0; k < (big ? 3 : 1); k++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), ringMat.clone()); m.rotation.x = -Math.PI / 2; m.renderOrder = 6;
    m.position.set(x, waveAt(x, z) + 0.02, z); m.userData = { t: -k * 0.18, s: big ? 1.6 : 0.8 }; scene.add(m); rings.push(m);
  }
  sfx('splash', big ? 1 : 0.5);
}
function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.userData.t += dt; const t = Math.max(0, r.userData.t);
    r.scale.setScalar(0.1 + t * r.userData.s * 1.6); r.material.opacity = 0.6 * Math.max(0, 1 - t / 1.4);
    if (t > 1.4) { scene.remove(r); r.geometry.dispose(); rings.splice(i, 1); }
  }
}

/* ---------- species prototypes ---------- */
function protoFor(id) {
  if (protos[id]) return protos[id];
  const sp = SPECIES.find(s => s.id === id);
  sp.skin = Object.assign({}, sp.skin, { w: 512, h: 256 });
  const pr = buildSpecies(sp); pr.parts.forEach(q => { q.mat.userData.envKeep = true; });
  return (protos[id] = pr);
}
function fishLenM(id) { const g = GAME[id]; if (g) return (g.cm[0] + g.cm[1]) / 2 / 100; return id === 'moorishidol' || id === 'butterflyfish' ? 0.17 : 0.3; }
function spawnSeen() {
  seenSchools.forEach(s => s.inst.meshes.forEach(m => scene.remove(m))); seenSchools.length = 0;
  S.seen.forEach((id, k) => {
    const n = id === 'garfish' || id === 'mullet' ? 8 : 5, inst = instantiate(protoFor(id), n);
    inst.meshes.forEach((m, i) => { m.renderOrder = 10 + i; m.castShadow = false; });
    inst.addTo(scene);
    const fish = [];
    const cx = PIER.x0 + (PIER.x1 - PIER.x0) * (0.4 + 0.15 * k), cz = (k % 2 ? 1 : -1) * (4 + k * 2);
    for (let i = 0; i < n; i++) fish.push({ a: hash(i, k, 3) * 6.28, r: 3 + hash(i, k, 4) * 6, y: -0.7 - hash(i, k, 5) * 1.6, w: (0.18 + hash(i, k, 6) * 0.15) * (hash(i, k, 7) < 0.5 ? 1 : -1), ph: hash(i, k, 8) * 9 });
    seenSchools.push({ id, inst, fish, cx, cz, len: fishLenM(id) * (0.85 + hash(k, 1, 1) * 0.3) });
  });
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function updateSeen(dt) {
  seenSchools.forEach(sc => {
    sc.fish.forEach((f, i) => {
      f.a += f.w * dt; f.ph += dt * (5 + Math.abs(f.w) * 10);
      const x = sc.cx + Math.cos(f.a) * f.r, z = sc.cz + Math.sin(f.a) * f.r;
      const floor = terrainH(x, z) + 0.3, y = Math.max(floor, W.waterY + f.y);
      const head = Math.atan2(-Math.cos(f.a) * Math.sign(f.w), -Math.sin(f.a) * Math.sign(f.w));
      _q.setFromEuler(_e.set(0, head, 0)); _s.setScalar(sc.len);
      _m.compose(_v.set(x, y, z), _q, _s); sc.inst.setM(i, _m); sc.inst.iPh.array[i] = f.ph;
      if (!DEX[sc.id] && !P.inBoat && Math.hypot(x - P.x, z - P.z) < 13 && y < W.waterY) markSeen(sc.id);
    });
    sc.inst.flush();
  });
}

