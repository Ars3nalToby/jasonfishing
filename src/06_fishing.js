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

/* ---------- bite odds ---------- */
function biteFactor() {
  const e = Math.asin(W.sun.y) * 180 / Math.PI;
  const tod = e < -6 ? 1.15 : e < 12 ? 1.6 : e > 50 ? 0.8 : 1.0;
  const tide = LIVE.tideRate !== null ? (Math.abs(LIVE.tideRate) > 0.12 ? 1.35 : 0.8) : 1;
  return tod * tide * (1 + W.cloud * 0.15);
}
function pickSpecies(depth) {
  const tbl = [];
  for (const id in S.bites) {
    const g = GAME[id]; let w = S.bites[id];
    if (g.zone === 'shallow') w *= depth < 4 ? 1 : 0.3;
    if (g.zone === 'deep') w *= depth >= 3 ? 1.4 : 0.12;
    if (g.zone === 'boat') w *= P.inBoat && depth > 5 ? 6 : depth > 5 ? 0.25 : 0.03;
    if (P.inBoat && depth > 7 && g.zone === 'shallow') w *= 0.2;
    tbl.push([id, w]);
  }
  let tot = tbl.reduce((a, b) => a + b[1], 0), r = Math.random() * tot;
  for (const [id, w] of tbl) { r -= w; if (r <= 0) return id; }
  return tbl[0][0];
}

/* ---------- state machine ---------- */
function toggleRod() {
  if (FISH.state === 'idle') { FISH.state = 'ready'; rod.visible = true; hint(); sfx('click'); return; }
  if (FISH.state === 'ready' || FISH.state === 'waiting' || FISH.state === 'charging') { reelInNow(); FISH.state = 'idle'; rod.visible = false; hint(); }
}
function reelInNow() { bobber.visible = false; line.visible = false; FISH.hooked = null; if (FISH.state !== 'idle') FISH.state = 'ready'; hint(); }
function actionDown() {
  input.action = true; unlockAudio();
  if (CATCH_OPEN) return;
  if (FISH.state === 'idle') { toggleRod(); return; }
  if (FISH.state === 'ready') {
    if (P.inBoat && Math.abs(B.v) > 0.8) { toast('Stop the boat to cast.'); return; }
    FISH.state = 'charging'; FISH.power = 0; FISH.pdir = 1; hint(); return;
  }
  if (FISH.state === 'bite') { strike(); return; }
}
function actionUp() {
  input.action = false;
  if (FISH.state === 'charging') cast();
}
function cast() {
  const pw = FISH.power;
  rod.userData.tip.getWorldPosition(tipW);
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), d = 5 + pw * 40;
  FISH.from.copy(tipW); FISH.to.set(P.x + fx * d, 0, P.z + fz * d);
  FISH.flight = 0; FISH.flightT = 0.5 + d / 45; FISH.state = 'flying';
  bobber.visible = true; line.visible = true; sfx('cast'); hint();
  rod.userData.kick = 1;
}
function landBobber() {
  const x = FISH.to.x, z = FISH.to.z, depth = W.waterY - terrainH(x, z);
  if (depth < 0.25 || inDeckFootprint(x, z) && depth < 3 && Math.abs(z) < PIER.w / 2) {
    toast(depth < 0.25 ? 'That landed on dry ground. Reel in and try again.' : 'Snagged on the pier. Reel in.');
    FISH.state = 'waiting'; FISH.dry = true; FISH.biteIn = 1e9; return;
  }
  FISH.dry = false; splash(x, z, false);
  FISH.state = 'waiting'; FISH.biteIn = 4 + Math.random() * 12 / biteFactor(); FISH.nibbleIn = 1.5 + Math.random() * 3;
  FISH.depth = depth; hint();
}
function strike() {
  if (FISH.state !== 'bite') return;
  const id = FISH.pending, g = GAME[id];
  const cm = Math.round(g.cm[0] + (g.cm[1] - g.cm[0]) * Math.pow(Math.random(), 1.7));
  const frac = (cm - g.cm[0]) / (g.cm[1] - g.cm[0]);
  FISH.hooked = { id, cm, kg: g.wf * 0.0115 * cm * cm * cm / 1000, pull: g.pull * (0.6 + 0.5 * frac), stam: 1 };
  FISH.state = 'fight'; FISH.tension = 0.25; FISH.run = 0; FISH.runT = 0.6; FISH.slackT = 0; FISH.overT = 0;
  FISH.dist = Math.hypot(FISH.bob.x - P.x, FISH.bob.z - P.z); FISH.ang = Math.atan2(FISH.bob.z - P.z, FISH.bob.x - P.x);
  FISH.inst = instantiate(protoFor(id), 1); FISH.inst.meshes.forEach(m => { m.renderOrder = 12; m.castShadow = false; }); FISH.inst.addTo(scene);
  sfx('strike'); toast('Hooked up!'); hint();
}
function loseFish(msg) {
  toast(msg); sfx('snap');
  if (FISH.inst) FISH.inst.meshes.forEach(m => scene.remove(m)); FISH.inst = null; FISH.hooked = null;
  bobber.visible = false; line.visible = false; FISH.state = 'ready'; hint();
}
const fishPos = new THREE.Vector3();
function updateFishing(dt) {
  rod.userData.tip.getWorldPosition(tipW);
  // rod bend
  const load = FISH.state === 'fight' ? FISH.tension : FISH.state === 'bite' ? 0.25 : FISH.state === 'waiting' ? 0.04 : 0;
  rod.userData.kick = Math.max(0, (rod.userData.kick || 0) - dt * 3);
  rodSegs.forEach((s, i) => { s.rotation.x = load * 0.11 * (i / 7 + 0.3) - rod.userData.kick * 0.12 * Math.sin((1 - rod.userData.kick) * 6); });
  const charging = FISH.state === 'charging';
  rod.rotation.x = mix(rod.rotation.x, charging ? -0.35 - FISH.power * 0.5 : FISH.state === 'fight' ? -0.55 : -0.9, Math.min(1, dt * 8));
  if (FISH.state === 'fight' && input.action) rod.userData.reel.rotation.x += dt * 18;

  switch (FISH.state) {
    case 'charging':
      FISH.power += FISH.pdir * dt / 1.1; if (FISH.power > 1) { FISH.power = 1; FISH.pdir = -1; } if (FISH.power < 0) { FISH.power = 0; FISH.pdir = 1; }
      break;
    case 'flying': {
      FISH.flight += dt / FISH.flightT; const t = Math.min(1, FISH.flight);
      const ty = W.waterY;
      FISH.bob.set(mix(FISH.from.x, FISH.to.x, t), mix(FISH.from.y, ty, t) + Math.sin(t * Math.PI) * (3 + FISH.flightT * 4), mix(FISH.from.z, FISH.to.z, t));
      bobber.position.copy(FISH.bob); drawLine(tipW, FISH.bob, 0.2);
      if (t >= 1) { FISH.bob.y = waveAt(FISH.to.x, FISH.to.z); landBobber(); }
      break;
    }
    case 'waiting': case 'bite': {
      const surf = FISH.dry ? terrainH(FISH.bob.x, FISH.bob.z) + 0.05 : waveAt(FISH.bob.x, FISH.bob.z);
      let dip = 0;
      if (input.action && FISH.state === 'waiting') { // retrieve
        const dx = P.x - FISH.bob.x, dz = P.z - FISH.bob.z, dd = Math.hypot(dx, dz);
        FISH.bob.x += dx / dd * dt * 4.5; FISH.bob.z += dz / dd * dt * 4.5; sfxReel(dt);
        if (dd < 3 || (W.waterY - terrainH(FISH.bob.x, FISH.bob.z) < 0.15 && !FISH.dry)) { reelInNow(); break; }
      }
      if (FISH.state === 'waiting' && !FISH.dry) {
        FISH.nibbleIn -= dt; FISH.biteIn -= dt;
        if (FISH.nibbleIn < 0) { FISH.nibbleT = 0.35; FISH.nibbleIn = 1.2 + Math.random() * 3.5; sfx('nibble'); }
        if (FISH.biteIn < 0) { FISH.pending = pickSpecies(W.waterY - terrainH(FISH.bob.x, FISH.bob.z)); FISH.state = 'bite'; FISH.biteT = 1.1; sfx('bite'); hint(); flash('BITE!'); }
      }
      if (FISH.nibbleT > 0) { FISH.nibbleT -= dt; dip = Math.sin(FISH.nibbleT * 40) * 0.05; }
      if (FISH.state === 'bite') {
        FISH.biteT -= dt; dip = -0.25;
        if (FISH.biteT < 0) { toast('Missed it. Fresh bait on, wait for the next one.'); FISH.state = 'waiting'; FISH.biteIn = 5 + Math.random() * 10 / biteFactor(); hint(); }
      }
      FISH.bob.y = surf + dip; bobber.position.copy(FISH.bob); bobber.rotation.z = dip * 2;
      drawLine(tipW, FISH.bob, 0.35);
      break;
    }
    case 'fight': fight(dt); break;
  }
  updateRings(dt);
}

function fight(dt) {
  const h = FISH.hooked, reeling = input.action;
  FISH.runT -= dt;
  if (FISH.runT < 0) {
    if (FISH.run > 0) { FISH.run = 0; FISH.runT = 0.8 + Math.random() * 1.6; }
    else { FISH.run = (0.5 + Math.random() * 0.5) * (0.35 + 0.65 * h.stam); FISH.runT = 0.7 + Math.random() * 1.8 * h.stam; FISH.runDir = (Math.random() - 0.5) * 1.4; if (FISH.run > 0.5) { splash(FISH.bob.x, FISH.bob.z, true); } }
  }
  const pull = h.pull * FISH.run;
  const target = reeling ? 0.22 + 0.95 * pull + 0.08 : 0.02 + 0.35 * pull;
  FISH.tension += (target - FISH.tension) * Math.min(1, dt * (reeling ? 2.6 : 1.8));
  if (reeling) FISH.dist -= dt * (2.6 - 2.2 * pull) * (0.6 + 0.4 * (1 - h.stam * 0.5));
  FISH.dist += dt * pull * (reeling ? 1.2 : 3.0);
  FISH.ang += dt * FISH.run * (FISH.runDir || 0) * 0.15;
  h.stam = Math.max(0.05, h.stam - dt * (0.018 + 0.05 * FISH.tension));
  if (FISH.tension > 0.92) { FISH.overT += dt; if (FISH.overT > 0.45) return loseFish('Snap! The line broke. Ease off when it runs.'); } else FISH.overT = Math.max(0, FISH.overT - dt);
  if (FISH.tension < 0.07 && FISH.run > 0.4) { FISH.slackT += dt; if (FISH.slackT > 2.4) return loseFish('Slack line. It threw the hook.'); } else FISH.slackT = Math.max(0, FISH.slackT - dt * 0.5);
  if (reeling) sfxReel(dt);
  // keep the fish in water
  let fx = P.x + Math.cos(FISH.ang) * FISH.dist, fz = P.z + Math.sin(FISH.ang) * FISH.dist;
  if (W.waterY - terrainH(fx, fz) < 0.3) { FISH.ang += 0.05; }
  const near = FISH.dist < (P.deck ? 3.2 : 2.2);
  const surf = waveAt(fx, fz);
  FISH.bob.set(fx, surf - (near ? 0 : 0.25 + 0.4 * FISH.run), fz);
  bobber.position.set(fx, surf, fz);
  const L = GAME[h.id] ? h.cm / 100 : 0.3;
  const head = Math.atan2(-(fz - P.z) * (FISH.run > 0.2 ? 1 : -1), (fx - P.x) * (FISH.run > 0.2 ? 1 : -1));
  _q.setFromEuler(_e.set(0, head, Math.sin(W.t * 7) * 0.15 * FISH.run));
  _m.compose(FISH.bob, _q, _s.setScalar(L)); FISH.inst.setM(0, _m); FISH.inst.iPh.array[0] += dt * (8 + 16 * FISH.run); FISH.inst.flush();
  drawLine(tipW, FISH.bob, 0.25 * (1 - FISH.tension));
  if (FISH.dist < 1.6 || (near && FISH.dist < 3.2 && P.deck)) landFish();
}

/* ---------- landing + catch card ---------- */
let CATCH_OPEN = false;
const holder = new THREE.Group(); camera.add(holder); holder.position.set(0, -0.06, -0.85);
function landFish() {
  const h = FISH.hooked;
  FISH.inst.meshes.forEach(m => { scene.remove(m); holder.add(m); m.renderOrder = 20; });
  FISH.state = 'landed'; bobber.visible = false; line.visible = false; CATCH_OPEN = true;
  sfx('landed'); showCatch(h); hint();
}
function updateHolder(dt) {
  if (!CATCH_OPEN || !FISH.inst) return;
  holder.rotation.y += dt * 0.5;
  const s = 0.62;
  _q.setFromEuler(_e.set(0, 0, Math.sin(W.t * 3) * 0.08)); _m.compose(_v.set(0, 0, 0), _q, _s.setScalar(s));
  FISH.inst.setM(0, _m); FISH.inst.iPh.array[0] += dt * 4; FISH.inst.flush();
}
function verdict(h) {
  const r = RULES[h.id] || {};
  if (r.noTake) return { ok: false, cls: 'bad', t: 'No take species', d: r.note };
  if (r.release) return { ok: false, cls: 'warn', t: 'Release', d: r.note };
  if (r.min && h.cm < r.min) return { ok: false, cls: 'warn', t: 'Undersize', d: 'Minimum ' + r.min + ' cm. Release it.' };
  if (r.max && h.cm > r.max) return { ok: false, cls: 'warn', t: 'Over the slot', d: 'Maximum ' + r.max + ' cm. Release it.' };
  const kept = (BAG[h.id] || 0);
  if (r.bag && kept >= r.bag) return { ok: false, cls: 'warn', t: 'Bag full', d: 'Possession limit of ' + r.bag + ' reached for this trip.' };
  return { ok: true, cls: 'good', t: 'Legal to keep', d: (r.min ? 'Min ' + r.min + ' cm' : 'No min size') + (r.max ? ' · max ' + r.max + ' cm' : '') + (r.bag ? ' · limit ' + r.bag : '') + (r.note ? '. ' + r.note : '') };
}
function finishCatch(keep) {
  const h = FISH.hooked, v = verdict(h);
  let pts;
  if (keep && v.ok) { BAG[h.id] = (BAG[h.id] || 0) + 1; pts = Math.round(10 + h.kg * 12); toast('Into the esky. +' + pts); }
  else { pts = Math.round(8 + h.kg * 10) + (v.ok ? 0 : 6); toast((v.ok ? 'Released. ' : 'Good release. ') + '+' + pts); splashNearPlayer(); }
  logCatch(h, keep && v.ok, pts);
  holder.children.slice().forEach(m => holder.remove(m)); FISH.inst = null; FISH.hooked = null;
  CATCH_OPEN = false; FISH.state = 'ready'; hideCatch(); hint();
}
function splashNearPlayer() { const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); const x = P.x + fx * 2.5, z = P.z + fz * 2.5; if (W.waterY - terrainH(x, z) > 0.2) splash(x, z, false); }
