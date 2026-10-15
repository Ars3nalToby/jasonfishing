/* ======================================================================
   PLAYER: walking, looking, pier and water limits, the hire tinnie
   ====================================================================== */
const P = { x: 0, z: 0, y: 3, yaw: 0, pitch: -0.05, bob: 0, inBoat: false, speed: 0 };
const keys = {};
const input = { joy: { x: 0, y: 0 }, action: false, lookDX: 0, lookDY: 0 };
let locked = false;

function onDeck(x, z) {
  if (x < PIER.x0 || x > PIER.x1 - 0.3) return false;
  if (Math.abs(z) < PIER.w / 2 - 0.25) return true;
  return x > PIER.hx0 + 0.2 && Math.abs(z) < PIER.hw / 2 - 0.25;
}
function inDeckFootprint(x, z) {
  if (x < PIER.x0 - 0.5 || x > PIER.x1 + 0.6) return false;
  return Math.abs(z) < PIER.w / 2 + 0.6 || (x > PIER.hx0 - 0.6 && Math.abs(z) < PIER.hw / 2 + 0.6);
}
function groundAt(x, z, deck) { return deck ? PIER.h : terrainH(x, z); }

function placeAtPier() {
  P.x = PIER.x0 - 4; P.z = 0.6; P.yaw = -Math.PI / 2; P.pitch = -0.04; P.inBoat = false;
  P.y = terrainH(P.x, P.z) + 1.65; P.deck = false;
  placeBoat();
}

function tryMove(nx, nz) {
  const deckNow = P.deck, deckNext = onDeck(nx, nz);
  if (deckNow) {
    if (!deckNext) {
      if (nx < PIER.x0 + 3 && Math.abs(terrainH(nx, nz) - PIER.h) < 0.7) { P.deck = false; P.x = nx; P.z = nz; }
      return;
    }
    P.x = nx; P.z = nz; return;
  }
  if (inDeckFootprint(nx, nz)) {
    if (deckNext && Math.abs(terrainH(nx, nz) - PIER.h) < 0.7) { P.deck = true; P.x = nx; P.z = nz; }
    else if (PIER.h - terrainH(nx, nz) > 2.3) { P.x = nx; P.z = nz; } // walk under the pier
    return;
  }
  const depth = W.waterY - terrainH(nx, nz);
  if (depth > 0.9) return;
  if (Math.abs(nx) > 480 || Math.abs(nz) > 480) return;
  P.x = nx; P.z = nz;
}

/* ---------- the hire tinnie ---------- */
const B = { x: 0, z: 0, yaw: 0, v: 0, steer: 0, mesh: null, y: 0, roll: 0, pitch: 0 };
function buildBoat() {
  const g = new THREE.Group();
  const alu = new THREE.MeshStandardMaterial({ color: 0xc9ced2, roughness: 0.35, metalness: 0.85 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0x1f5d8a, roughness: 0.5, metalness: 0.3 });
  const shape = [], L = 4.3, Wd = 1.8;
  // hull: lofted cross-sections (punt-nosed tinnie)
  const secs = 14, pts = 9, pos = [], idx = [];
  for (let i = 0; i <= secs; i++) {
    const u = i / secs, x = -L / 2 + u * L, bow = sm(0.62, 1, u);
    const half = Wd / 2 * (1 - 0.45 * bow * bow), keel = -0.35 + 0.28 * bow * bow, top = 0.32 + 0.12 * bow;
    for (let j = 0; j <= pts; j++) {
      const a = j / pts; // 0 = port gunwale, 1 = starboard gunwale
      const s = Math.cos(a * Math.PI), zz = -half * s, yy = keel + (top - keel) * Math.pow(Math.abs(s), 1.6) * 0.98;
      pos.push(x, yy, zz);
    }
  }
  for (let i = 0; i < secs; i++) for (let j = 0; j < pts; j++) { const a = i * (pts + 1) + j, b = a + pts + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.setIndex(idx); hg.computeVertexNormals();
  const hull = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ color: 0xc9ced2, roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide }));
  hull.castShadow = true; g.add(hull);
  const tr = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, Wd * 0.98), alu); tr.position.set(-L / 2, 0, 0); g.add(tr);
  [-1, 1].forEach(sd => { const band = new THREE.Mesh(new THREE.BoxGeometry(L * 0.62, 0.09, 0.03), stripe); band.position.set(-0.45, 0.22, sd * (Wd / 2 + 0.01)); g.add(band); });
  [-1.1, 0.1, 1.1].forEach(x => { const s = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, Wd * 0.92 * (x > 1 ? 0.8 : 1)), woodMat); s.position.set(x, 0.12, 0); s.castShadow = true; g.add(s); });
  const motor = new THREE.Group();
  const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.36), new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.4, metalness: 0.2 })); cowl.position.set(-0.15, 0.55, 0); motor.add(cowl);
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.1), alu); leg.position.set(-0.12, -0.05, 0); motor.add(leg);
  const tiller = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), alu); tiller.rotation.z = Math.PI / 2 - 0.25; tiller.position.set(0.3, 0.55, 0); motor.add(tiller);
  motor.position.set(-L / 2 - 0.1, 0.05, 0); g.add(motor);
  const tx = signTexture([['HIRE 07', 90, 0.5]], 512, 128, '#c9ced2', '#1f5d8a');
  [-1, 1].forEach(s => { const n = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshStandardMaterial({ map: tx, transparent: true })); n.position.set(1.2, 0.16, s * (Wd / 2 * 0.86 + 0.02)); n.rotation.y = s > 0 ? 0 : Math.PI; g.add(n); });
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  B.mesh = g; scene.add(g);
}
function placeBoat() {
  B.x = PIER.x0 + (PIER.hx0 - PIER.x0) * 0.55; B.z = PIER.w / 2 + 2.2; B.yaw = 0; B.v = 0;
  if (W.waterY - terrainH(B.x, B.z) < 0.8) { B.x = PIER.hx0 - 4; }
}
function updateBoat(dt) {
  if (!B.mesh) return;
  if (P.inBoat) {
    const thr = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + (-input.joy.y);
    const st = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0) - input.joy.x;
    B.v += (thr * 7 - B.v * 0.7) * dt; B.v = Math.max(-2, Math.min(9, B.v));
    B.yaw += st * dt * (0.25 + Math.min(1, Math.abs(B.v) / 3)) * 0.9 * Math.sign(B.v || 1);
    const nx = B.x + Math.cos(B.yaw) * B.v * dt, nz = B.z - Math.sin(B.yaw) * B.v * dt;
    const depth = W.waterY - terrainH(nx, nz);
    if (depth > 0.55 && !inDeckFootprint(nx, nz) && Math.abs(nx) < 1400 && Math.abs(nz) < 1400) { B.x = nx; B.z = nz; }
    else B.v *= -0.25;
  } else B.v *= 0.95;
  const h0 = waveAt(B.x, B.z), hf = waveAt(B.x + Math.cos(B.yaw) * 1.8, B.z - Math.sin(B.yaw) * 1.8), hs = waveAt(B.x + Math.sin(B.yaw) * 0.8, B.z + Math.cos(B.yaw) * 0.8);
  B.y = h0 + 0.12; B.pitch = mix(B.pitch, Math.atan2(hf - h0, 1.8) + B.v * 0.012, 0.1); B.roll = mix(B.roll, Math.atan2(hs - h0, 0.8) * 0.8, 0.1);
  B.mesh.position.set(B.x, B.y, B.z);
  B.mesh.rotation.set(B.roll, B.yaw, B.pitch, 'YXZ');
}
function nearBoat() { return !P.inBoat && Math.hypot(P.x - B.x, P.z - B.z) < 5; }
function boardBoat() { P.inBoat = true; P.deck = false; P.yaw = B.yaw - Math.PI / 2; toast('You took the tinnie. W/S throttle, A/D steer. Stop to fish. E to step off at the pier or beach.'); hint(); }
function leaveBoat() {
  // nearest deck point or beach point
  let best = null, bd = 9;
  for (let k = 0; k < 40; k++) {
    const a = k / 40 * Math.PI * 2;
    for (let r = 1; r <= 6; r += 1) {
      const x = B.x + Math.cos(a) * r, z = B.z + Math.sin(a) * r;
      if ((onDeck(x, z) || (W.waterY - terrainH(x, z) < 0.6 && !inDeckFootprint(x, z))) && r < bd) { bd = r; best = [x, z]; }
    }
  }
  if (!best) { toast('Bring the boat alongside the pier or into the shallows to step off.'); return false; }
  P.inBoat = false; P.x = best[0]; P.z = best[1]; P.deck = onDeck(P.x, P.z); B.v = 0; hint(); return true;
}

function updatePlayer(dt) {
  if (!P.inBoat) B.lastYaw = undefined;
  if (P.inBoat) {
    P.yaw += B.yaw - (B.lastYaw === undefined ? B.yaw : B.lastYaw); B.lastYaw = B.yaw;
    const bx = Math.cos(B.yaw), bz = -Math.sin(B.yaw);
    P.x = B.x - bx * 1.2; P.z = B.z - bz * 1.2; P.y = B.y + 1.05;
    P.speed = Math.abs(B.v);
  } else {
    let f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - input.joy.y;
    let s = FISH.state === 'fight' ? 0 : (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + input.joy.x;
    const len = Math.hypot(f, s); if (len > 1) { f /= len; s /= len; }
    const wade = W.waterY - terrainH(P.x, P.z) > 0.2 && !P.deck;
    const sp = (keys.ShiftLeft || keys.ShiftRight ? 6.5 : 3.6) * (wade ? 0.45 : 1) * (FISH.state === 'fight' ? 0.25 : 1);
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const dx = (fx * f + rx * s) * sp * dt, dz = (fz * f + rz * s) * sp * dt;
    if (dx || dz) { tryMove(P.x + dx, P.z); tryMove(P.x, P.z + dz); }
    P.speed = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
    P.bob += P.speed * dt * 2.1;
    const gy = Math.max(groundAt(P.x, P.z, P.deck), P.deck ? 0 : W.waterY - 0.9) + 1.65 + Math.sin(P.bob * 2) * 0.03 * Math.min(1, P.speed / 3);
    P.y = mix(P.y, gy, Math.min(1, dt * 12));
  }
  camera.position.set(P.x, P.y, P.z);
  camera.rotation.set(P.pitch + (P.inBoat ? B.pitch * 0.5 : 0), P.yaw, P.inBoat ? -B.roll * 0.5 : 0, 'YXZ');
}

/* ---------- input ---------- */
function lookBy(dx, dy) { P.yaw -= dx * 0.0024; P.pitch = Math.max(-1.35, Math.min(1.2, P.pitch - dy * 0.0024)); }
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  keys[e.code] = true;
  if (!GAME_ON) return;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) actionDown(); }
  if (e.code === 'KeyF' && !e.repeat) toggleRod();
  if (e.code === 'KeyE' && !e.repeat) interact();
  if (e.code === 'KeyM' && !e.repeat) toggleSound();
  if (e.code === 'KeyB' && !e.repeat) cycleBait();
  if (e.code === 'KeyT' && !e.repeat) openShop();
  if (e.code === 'Escape') closePanels();
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Space') actionUp(); });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; actionUp(); });
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; document.body.classList.toggle('locked', locked); });
let drag = null;
canvas.addEventListener('pointerdown', e => {
  if (!GAME_ON) return;
  if (e.pointerType === 'mouse') {
    if (!locked) {
      try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) {}
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      if (e.button === 0 && FISH.state !== 'idle') actionDown();
      return;
    }
    if (e.button === 0) actionDown();
    return;
  }
  drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
});
addEventListener('pointermove', e => {
  if (locked && e.pointerType === 'mouse') { lookBy(e.movementX, e.movementY); return; }
  if (drag && drag.id === e.pointerId) { lookBy((e.clientX - drag.x) * 1.6, (e.clientY - drag.y) * 1.6); drag.x = e.clientX; drag.y = e.clientY; }
});
addEventListener('pointerup', e => { if (drag && drag.id === e.pointerId) drag = null; if (e.pointerType === 'mouse' && e.button === 0) actionUp(); });

function interact() {
  if (P.inBoat) { if (Math.abs(B.v) > 1.2) { toast('Slow down before stepping off.'); return; } leaveBoat(); return; }
  if (nearShop()) { openShop(); return; }
  if (nearBoat()) { if (FISH.state !== 'idle' && FISH.state !== 'ready') { toast('Reel in first.'); return; } boardBoat(); return; }
  openHire();
}
