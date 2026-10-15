/* ======================================================================
   BITE + FIGHT + CATCH
   approach (you see the fish come in) -> nibble -> bite (timed strike) ->
   fight (tension sweet spot + species moves) -> landing moment -> card
   ====================================================================== */
const TSC = { scale: 1, slowT: 0 };   // global time scale for slow-motion moments

/* ---------- bite odds ---------- */
function goldenHour() { const e = Math.asin(W.sun.y) * 180 / Math.PI; return e < 12; }
function biteFactor() {
  const e = Math.asin(W.sun.y) * 180 / Math.PI;
  const tod = e < -6 ? 1.15 : e < 12 ? 1.6 : e > 50 ? 0.8 : 1.0;
  const tide = LIVE.tideRate !== null ? (Math.abs(LIVE.tideRate) > 0.12 ? 1.35 : 0.8) : 1;
  return tod * tide * (1 + W.cloud * 0.15);
}
function baitLike(id) { const b = curBait(); return b.likes[id] !== undefined ? b.likes[id] : 0.7; }
function speciesWeights(depth) {
  const tbl = [];
  for (const id in S.bites) {
    const g = GAME[id]; let w = S.bites[id];
    if (g.zone === 'shallow') w *= depth < 4 ? 1 : 0.3;
    if (g.zone === 'deep') w *= depth >= 3 ? 1.4 : 0.12;
    if (g.zone === 'boat') w *= P.inBoat && depth > 5 ? 6 : depth > 5 ? 0.25 : 0.03;
    if (P.inBoat && depth > 7 && g.zone === 'shallow') w *= 0.2;
    tbl.push([id, w * baitLike(id)]);
  }
  return tbl;
}
var pickBite = function (depth) {
  const L = LEGENDS[S.id];
  const legendOdds = (goldenHour() ? 0.035 : 0.004) * (LIVE.tideRate !== null && Math.abs(LIVE.tideRate) > 0.12 ? 1.6 : 1) * (depth > 4 ? 1 : 0.2) * baitLike(L.id) * (P.inBoat ? 1.4 : 1);
  if (Math.random() < legendOdds) return { id: L.id, cm: Math.round(L.cm[0] + Math.random() * (L.cm[1] - L.cm[0])), legend: L.name };
  const tbl = speciesWeights(depth);
  let tot = tbl.reduce((a, b) => a + b[1], 0), r = Math.random() * tot, id = tbl[0][0];
  for (const [k, w] of tbl) { r -= w; if (r <= 0) { id = k; break; } }
  const g = GAME[id];
  return { id, cm: Math.round(g.cm[0] + (g.cm[1] - g.cm[0]) * Math.pow(Math.random(), 1.7)) };
};
function rarityOf(id, legend) {
  if (legend) return RARITY[4];
  const tot = Object.values(S.bites).reduce((a, b) => a + b, 0), share = (S.bites[id] || 0.5) / tot * (GAME[id].zone === 'boat' ? 0.5 : 1);
  return share >= 0.12 ? RARITY[0] : share >= 0.06 ? RARITY[1] : share >= 0.03 ? RARITY[2] : RARITY[3];
}
function starsOf(id, cm, legend) { if (legend) return 3; const g = GAME[id], f = (cm - g.cm[0]) / (g.cm[1] - g.cm[0]); return f >= 0.72 ? 3 : f >= 0.38 ? 2 : 1; }

/* ---------- state machine ---------- */
function toggleRod() {
  if (FISH.state === 'idle') { FISH.state = 'ready'; rod.visible = true; hint(); sfx('click'); tutorial('rod'); return; }
  if (FISH.state === 'ready' || FISH.state === 'waiting' || FISH.state === 'charging') { reelInNow(); FISH.state = 'idle'; rod.visible = false; hint(); }
}
function clearApproach() { if (FISH.ap) { FISH.ap.inst.meshes.forEach(m => scene.remove(m)); FISH.ap = null; } }
function reelInNow() { clearApproach(); bobber.visible = false; line.visible = false; FISH.hooked = null; if (FISH.state !== 'idle') FISH.state = 'ready'; hint(); }
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
function actionUp() { input.action = false; if (FISH.state === 'charging') cast(); }
function cast() {
  const pw = FISH.power;
  rod.userData.tip.getWorldPosition(tipW);
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), d = 5 + pw * 40;
  FISH.from.copy(tipW); FISH.to.set(P.x + fx * d, 0, P.z + fz * d);
  FISH.flight = 0; FISH.flightT = 0.5 + d / 45; FISH.state = 'flying';
  bobber.visible = true; line.visible = true; sfx('cast'); hint(); tutorial('cast');
  rod.userData.kick = 1;
}
function landBobber() {
  const x = FISH.to.x, z = FISH.to.z, depth = W.waterY - terrainH(x, z);
  if (depth < 0.25 || inDeckFootprint(x, z)) {
    toast(depth < 0.25 ? 'That landed on dry ground. Reel in and try again.' : 'Snagged on the pier. Reel in.');
    FISH.state = 'waiting'; FISH.dry = true; FISH.biteIn = 1e9; return;
  }
  FISH.dry = false; splash(x, z, false);
  FISH.state = 'waiting'; FISH.biteIn = 5 + Math.random() * 11 / biteFactor(); FISH.nibbleIn = 2 + Math.random() * 3;
  if (PROG.tut < 4) FISH.biteIn = 5; // first-timers get a quick bite
  FISH.depth = depth; hint();
}
function startApproach() {
  const depth = W.waterY - terrainH(FISH.bob.x, FISH.bob.z);
  const pick = pickBite(depth), inst = instantiate(protoFor(pick.id), 1);
  inst.meshes.forEach(m => { m.renderOrder = 12; m.castShadow = false; }); inst.addTo(scene);
  FISH.ap = { pick, inst, t: 0, a0: Math.random() * Math.PI * 2, spin: Math.random() < 0.5 ? 1 : -1, ph: 0, rush: 0 };
  if (pick.legend) { setTimeout(() => toast('Something big is circling your bait…'), 400); sfx('legend'); }
}
function updateApproach(dt) {
  const ap = FISH.ap; if (!ap) return;
  ap.t += dt; ap.ph += dt * 9;
  const L = ap.pick.cm / 100;
  const k = sm(0, 2.8, ap.t), r = mix(7.5, 0.25 + L * 0.5, k) * (FISH.state === 'bite' ? Math.max(0, 1 - ap.rush) : 1);
  if (FISH.state === 'bite') ap.rush = Math.min(1, ap.rush + dt * 4);
  const a = ap.a0 + ap.spin * (1 - k) * 2.2 + (k >= 1 ? Math.sin(ap.t * 2.5) * 0.4 : 0);
  const x = FISH.bob.x + Math.cos(a) * r, z = FISH.bob.z + Math.sin(a) * r;
  const y = Math.max(terrainH(x, z) + 0.2, W.waterY - mix(1.2, 0.35, k));
  // face the float
  const head = Math.atan2(-(FISH.bob.z - z), FISH.bob.x - x);
  _q.setFromEuler(_e.set(0, head, 0)); _m.compose(_v.set(x, y, z), _q, _s.setScalar(L));
  ap.inst.setM(0, _m); ap.inst.iPh.array[0] = ap.ph; ap.inst.flush();
}
function strike() {
  if (FISH.state !== 'bite') return;
  const ap = FISH.ap, pick = ap.pick, g = GAME[pick.id];
  const late = 1.1 - FISH.biteT, perfect = late < 0.42;
  const frac = clamp01((pick.cm - g.cm[0]) / (g.cm[1] - g.cm[0]));
  FISH.hooked = {
    id: pick.id, cm: pick.cm, legend: pick.legend, kg: g.wf * 0.0115 * pick.cm * pick.cm * pick.cm / 1000,
    pull: Math.min(1.25, g.pull * (0.6 + 0.5 * frac) * (pick.legend ? 1.2 : 1)), stam: (pick.legend ? 1.6 : 1) - (perfect ? 0.22 : 0),
    moves: MOVES[pick.id] || [], perfect
  };
  FISH.inst = ap.inst; FISH.ap = null;
  Object.assign(FISH, { state: 'fight', tension: 0.3, run: 0, runT: 0.6, slackT: 0, overT: 0, move: null, moveCD: 1.6, inZoneT: 0 });
  FISH.dist = Math.max(2.5, Math.hypot(FISH.bob.x - P.x, FISH.bob.z - P.z)); FISH.ang = Math.atan2(FISH.bob.z - P.z, FISH.bob.x - P.x);
  sfx('strike'); splash(FISH.bob.x, FISH.bob.z, true); shake(0.5);
  if (perfect) { flash('PERFECT HOOK SET'); questEvent('perfect'); } else toast('Hooked up!');
  if (pick.legend) flash(pick.legend.toUpperCase());
  hint(); tutorial('strike');
}
function loseFish(msg) {
  toast(msg); sfx('snap'); shake(0.4);
  if (FISH.inst) FISH.inst.meshes.forEach(m => scene.remove(m)); FISH.inst = null; FISH.hooked = null; FISH.move = null;
  bobber.visible = false; line.visible = false; FISH.state = 'ready'; hint(); showMove(null);
}

function updateFishing(dt) {
  rod.userData.tip.getWorldPosition(tipW);
  const load = FISH.state === 'fight' ? FISH.tension : FISH.state === 'bite' ? 0.3 : FISH.state === 'waiting' ? 0.04 : 0;
  rod.userData.kick = Math.max(0, (rod.userData.kick || 0) - dt * 3);
  rodSegs.forEach((s, i) => { s.rotation.x = load * 0.12 * (i / 7 + 0.3) - rod.userData.kick * 0.12 * Math.sin((1 - rod.userData.kick) * 6); s.rotation.z = FISH.state === 'fight' ? (FISH.steer || 0) * 0.02 * (i / 7) : 0; });
  const charging = FISH.state === 'charging';
  rod.rotation.x = mix(rod.rotation.x, charging ? -0.35 - FISH.power * 0.5 : FISH.state === 'fight' ? -0.5 + FISH.tension * 0.15 : -0.9, Math.min(1, dt * 8));
  rod.rotation.z = mix(rod.rotation.z, -0.18 + (FISH.state === 'fight' ? (FISH.steer || 0) * 0.35 : 0), Math.min(1, dt * 6));
  if (FISH.state === 'fight' && input.action) rod.userData.reel.rotation.x += dt * 18;

  switch (FISH.state) {
    case 'charging':
      FISH.power += FISH.pdir * dt / 1.1; if (FISH.power > 1) { FISH.power = 1; FISH.pdir = -1; } if (FISH.power < 0) { FISH.power = 0; FISH.pdir = 1; }
      break;
    case 'flying': {
      FISH.flight += dt / FISH.flightT; const t = Math.min(1, FISH.flight);
      FISH.bob.set(mix(FISH.from.x, FISH.to.x, t), mix(FISH.from.y, W.waterY, t) + Math.sin(t * Math.PI) * (3 + FISH.flightT * 4), mix(FISH.from.z, FISH.to.z, t));
      bobber.position.copy(FISH.bob); drawLine(tipW, FISH.bob, 0.2);
      if (t >= 1) { FISH.bob.y = waveAt(FISH.to.x, FISH.to.z); landBobber(); }
      break;
    }
    case 'waiting': case 'bite': {
      const surf = FISH.dry ? terrainH(FISH.bob.x, FISH.bob.z) + 0.05 : waveAt(FISH.bob.x, FISH.bob.z);
      let dip = 0;
      if (input.action && FISH.state === 'waiting') {
        if (FISH.ap) { toast('You spooked it.'); clearApproach(); FISH.biteIn = 6 + Math.random() * 8; }
        const dx = P.x - FISH.bob.x, dz = P.z - FISH.bob.z, dd = Math.hypot(dx, dz);
        FISH.bob.x += dx / dd * dt * 4.5; FISH.bob.z += dz / dd * dt * 4.5; sfxReel(dt);
        if (dd < 3 || (W.waterY - terrainH(FISH.bob.x, FISH.bob.z) < 0.15 && !FISH.dry)) { reelInNow(); break; }
      }
      if (FISH.state === 'waiting' && !FISH.dry) {
        FISH.biteIn -= dt;
        if (FISH.biteIn < 3.4 && !FISH.ap) startApproach();
        if (FISH.ap && FISH.ap.t > 2.6) { FISH.nibbleIn -= dt; if (FISH.nibbleIn < 0) { FISH.nibbleT = 0.3; FISH.nibbleIn = 0.35 + Math.random() * 0.3; sfx('nibble'); } }
        if (FISH.biteIn < 0 && FISH.ap) { FISH.state = 'bite'; FISH.biteT = 1.1; sfx('bite'); hint(); flash('BITE!'); shake(0.25); tutorial('bite'); }
      }
      if (FISH.nibbleT > 0) { FISH.nibbleT -= dt; dip = Math.sin(FISH.nibbleT * 40) * 0.05; }
      if (FISH.state === 'bite') {
        FISH.biteT -= dt; dip = -0.3;
        if (FISH.biteT < 0) { toast('Too slow. It stole the bait.'); clearApproach(); FISH.state = 'waiting'; FISH.biteIn = 5 + Math.random() * 10 / biteFactor(); hint(); }
      }
      updateApproach(dt);
      FISH.bob.y = surf + dip; bobber.position.copy(FISH.bob); bobber.rotation.z = dip * 2;
      drawLine(tipW, FISH.bob, 0.35);
      break;
    }
    case 'fight': fight(dt); break;
  }
  updateRings(dt); updateDrops(dt);
}

/* ---------- the fight ---------- */
const ZONE = [0.42, 0.78];
function steerInput() {
  const l = keys.KeyA || keys.ArrowLeft || input.steer < 0, r = keys.KeyD || keys.ArrowRight || input.steer > 0;
  return (r ? 1 : 0) - (l ? 1 : 0);
}
function startMove(k) {
  const L = FISH.hooked;
  if (k === 'jump') { FISH.move = { k, t: 0, dur: 0.85 + Math.min(0.5, L.cm / 250), reelT: 0 }; splash(FISH.bob.x, FISH.bob.z, true); sfx('splash', 1); }
  if (k === 'structure') { FISH.move = { k, t: 0, dur: 2.3, dir: Math.random() < 0.5 ? -1 : 1, good: 0 }; }
  if (k === 'dig') { FISH.move = { k, t: 0, dur: 2.6 }; }
  showMove(FISH.move);
}
function endMove(ok) {
  const m = FISH.move; FISH.move = null; FISH.moveCD = 2.2 + Math.random() * 2; showMove(null);
  if (!m) return;
  if (m.k === 'jump' && ok) { FISH.hooked.stam -= 0.12; toast('Nice. You bowed to the jump.'); questEvent('jump'); splash(FISH.bob.x, FISH.bob.z, true); }
  if (m.k === 'structure' && ok) { FISH.hooked.stam -= 0.15; toast('Turned it away from the ' + (P.inBoat ? 'reef' : 'pylons') + '!'); }
}
function fight(dt) {
  const h = FISH.hooked, reeling = input.action, R = curRod();
  FISH.runT -= dt; FISH.moveCD -= dt;
  if (!FISH.move) {
    if (FISH.runT < 0) {
      if (FISH.run > 0) { FISH.run = 0; FISH.runT = 0.8 + Math.random() * 1.5; }
      else {
        FISH.run = (0.5 + Math.random() * 0.5) * (0.35 + 0.65 * Math.max(0, h.stam)); FISH.runT = 0.7 + Math.random() * 1.8 * Math.max(0.3, h.stam); FISH.runDir = (Math.random() - 0.5) * 1.4;
        if (h.moves.length && FISH.moveCD < 0 && Math.random() < 0.55 && h.stam > 0.15) startMove(h.moves[(Math.random() * h.moves.length) | 0]);
      }
    }
  } else {
    const m = FISH.move; m.t += dt;
    if (m.k === 'jump') { FISH.run = 0.7; if (reeling && FISH.tension > 0.5) m.reelT += dt; if (m.reelT > 0.28) return loseFish('It jumped and threw the hook. Let go of reel when it jumps.'); if (m.t > m.dur) endMove(true); }
    if (m.k === 'structure') {
      FISH.run = 0.85; FISH.ang += dt * m.dir * 0.35;
      if (steerInput() === -m.dir) m.good += dt;
      if (m.good > 0.8) endMove(true);
      else if (m.t > m.dur) return loseFish('Busted off on the ' + (P.inBoat ? 'reef' : 'pylons') + '. Steer it away next time.');
    }
    if (m.k === 'dig') { FISH.run = 0.95; if (m.t > m.dur) endMove(true); }
  }
  FISH.steer = steerInput();
  const pull = h.pull * FISH.run / R.line;
  const target = reeling ? 0.2 + 0.95 * pull + 0.1 : 0.02 + 0.35 * pull;
  FISH.tension += (target - FISH.tension) * Math.min(1, dt * (reeling ? 2.6 : 1.8));
  if (FISH.move && FISH.move.k === 'dig') FISH.tension += dt * 0.08 * (reeling ? 1 : 0);
  const inZone = reeling && FISH.tension >= ZONE[0] && FISH.tension <= ZONE[1];
  FISH.inZone = inZone;
  if (reeling) FISH.dist -= dt * (inZone ? 3.2 : 1.5) * R.reel * (1 - 0.7 * Math.min(1, pull)) * (0.7 + 0.3 * (1 - Math.max(0, h.stam)));
  FISH.dist += dt * pull * (reeling ? 1.0 : 2.6) * (FISH.move && FISH.move.k === 'dig' ? 0.5 : 1);
  FISH.dist = Math.min(FISH.dist, 70);
  FISH.ang += dt * FISH.run * (FISH.runDir || 0) * 0.15;
  h.stam = Math.max(-0.2, h.stam - dt * (0.014 + (inZone ? 0.06 : 0.02)) * (h.legend ? 0.65 : 1));
  if (FISH.tension > 0.93) { FISH.overT += dt; if (FISH.overT > 0.45) return loseFish('Snap! Line broke. Keep the needle in the green.'); } else FISH.overT = Math.max(0, FISH.overT - dt);
  if (FISH.tension < 0.07 && FISH.run > 0.4 && !FISH.move) { FISH.slackT += dt; if (FISH.slackT > 2.4) return loseFish('Slack line. It threw the hook.'); } else FISH.slackT = Math.max(0, FISH.slackT - dt * 0.5);
  if (reeling) sfxReel(dt);

  let fx = P.x + Math.cos(FISH.ang) * FISH.dist, fz = P.z + Math.sin(FISH.ang) * FISH.dist;
  if (W.waterY - terrainH(fx, fz) < 0.3) { FISH.ang += 0.05; }
  const near = FISH.dist < (P.deck ? 3.2 : 2.2);
  const surf = waveAt(fx, fz), L = h.cm / 100;
  let y = surf - (near ? 0 : 0.25 + 0.4 * FISH.run), roll = Math.sin(W.t * 7) * 0.15 * FISH.run, pitch = 0;
  if (FISH.move && FISH.move.k === 'jump') { const t = FISH.move.t / FISH.move.dur; y = surf + Math.sin(Math.PI * Math.min(1, t)) * (0.5 + L * 0.9); pitch = (0.5 - t) * 1.6; roll = Math.sin(W.t * 18) * 0.5; if (t > 0.98 && !FISH.move.splashed) { FISH.move.splashed = 1; splash(fx, fz, true); } }
  if (FISH.move && FISH.move.k === 'dig') y = Math.max(terrainH(fx, fz) + 0.3, surf - 1.6);
  FISH.bob.set(fx, y, fz);
  bobber.position.set(fx, surf, fz);
  const away = FISH.run > 0.2 ? 1 : -1;
  const head = Math.atan2(-(fz - P.z) * away, (fx - P.x) * away);
  _q.setFromEuler(_e.set(roll, head, pitch, 'YXZ'));
  _m.compose(FISH.bob, _q, _s.setScalar(L)); FISH.inst.setM(0, _m); FISH.inst.iPh.array[0] += dt * (8 + 16 * FISH.run); FISH.inst.flush();
  drawLine(tipW, FISH.bob, 0.25 * (1 - FISH.tension));
  if (FISH.dist < 1.6 || (near && FISH.dist < 3.2 && P.deck)) landFish();
}

/* ---------- landing moment ---------- */
let CATCH_OPEN = false;
const holder = new THREE.Group(); camera.add(holder); holder.position.set(0, -0.06, -0.85);
const drops = (function () {
  const n = 80, g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdff6ff, size: 0.012, transparent: true, opacity: 0.9, depthTest: false }));
  pts.frustumCulled = false; pts.renderOrder = 30; pts.visible = false; holder.add(pts);
  return { pts, pos, vel: new Float32Array(n * 3), n, t: 0 };
})();
function burstDrops() {
  const d = drops; d.t = 1.2; d.pts.visible = true;
  for (let i = 0; i < d.n; i++) { d.pos[i * 3] = (Math.random() - 0.5) * 0.5; d.pos[i * 3 + 1] = -0.1 + Math.random() * 0.1; d.pos[i * 3 + 2] = (Math.random() - 0.5) * 0.1; d.vel[i * 3] = (Math.random() - 0.5) * 0.6; d.vel[i * 3 + 1] = 0.4 + Math.random() * 0.9; d.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.3; }
}
function updateDrops(dt) {
  const d = drops; if (d.t <= 0) return; d.t -= dt;
  for (let i = 0; i < d.n; i++) { d.vel[i * 3 + 1] -= 2.2 * dt; for (let k = 0; k < 3; k++) d.pos[i * 3 + k] += d.vel[i * 3 + k] * dt; }
  d.pts.geometry.attributes.position.needsUpdate = true; d.pts.material.opacity = Math.min(0.9, d.t);
  if (d.t <= 0) d.pts.visible = false;
}
function landFish() {
  const h = FISH.hooked;
  FISH.inst.meshes.forEach(m => { scene.remove(m); holder.add(m); m.renderOrder = 20; });
  FISH.state = 'landed'; bobber.visible = false; line.visible = false; CATCH_OPEN = true; FISH.move = null; showMove(null);
  h.rarity = rarityOf(h.id, h.legend); h.stars = starsOf(h.id, h.cm, h.legend);
  h.isNew = !(DEX[h.id] && DEX[h.id].caught); h.pb = !h.isNew && h.cm > (DEX[h.id].best || 0);
  FISH.lift = 0; TSC.slowT = 0.7; burstDrops(); shake(0.35); punchFov();
  sfx('landed', RARITY.indexOf(h.rarity)); showBanner(h);
  setTimeout(() => { if (CATCH_OPEN) showCatch(h); }, 900);
  if (document.pointerLockElement) document.exitPointerLock();
  hint(); tutorial('land');
}
function updateHolder(dt) {
  if (!CATCH_OPEN || !FISH.inst) return;
  FISH.lift = Math.min(1, (FISH.lift || 0) + dt * 1.6);
  const e = 1 - Math.pow(1 - FISH.lift, 3);
  holder.position.set(IS_TOUCH ? 0 : 0.12 * e, -0.75 + 0.69 * e + (IS_TOUCH ? 0.08 : 0), -0.85);
  FISH.spin = (FISH.spin || 0) + dt; holder.rotation.y = Math.sin(FISH.spin * 0.7) * 0.55 + (1 - e) * 1.2;
  _q.setFromEuler(_e.set(0, 0, Math.sin(W.t * 3) * 0.08 * (2 - e))); _m.compose(_v.set(0, 0, 0), _q, _s.setScalar(0.62));
  FISH.inst.setM(0, _m); FISH.inst.iPh.array[0] += dt * (4 + 10 * (1 - e)); FISH.inst.flush();
}
function verdict(h) {
  const r = RULES[h.id] || {};
  if (r.noTake) return { ok: false, cls: 'bad', t: 'No take species', d: r.note };
  if (r.release) return { ok: false, cls: 'warn', t: 'Release', d: r.note };
  if (r.min && h.cm < r.min) return { ok: false, under: true, cls: 'warn', t: 'Undersize', d: 'Minimum ' + r.min + ' cm. Release it.' };
  if (r.max && h.cm > r.max) return { ok: false, cls: 'warn', t: 'Over the slot', d: 'Maximum ' + r.max + ' cm. Release it.' };
  const kept = (BAG[h.id] || 0);
  if (r.bag && kept >= r.bag) return { ok: false, cls: 'warn', t: 'Bag full', d: 'Possession limit of ' + r.bag + ' reached for this trip.' };
  return { ok: true, cls: 'good', t: 'Legal to keep', d: (r.min ? 'Min ' + r.min + ' cm' : 'No min size') + (r.max ? ' · max ' + r.max + ' cm' : '') + (r.bag ? ' · limit ' + r.bag : '') + (r.note ? '. ' + r.note : '') };
}
function finishCatch(keep) {
  const h = FISH.hooked; if (!h) return;
  const v = verdict(h), kept = keep && v.ok;
  const base = Math.round(10 + h.kg * 10 + h.rarity.xp + (h.stars - 1) * 8 + (h.isNew ? 40 : 0));
  const pts = kept ? base : base + (v.ok ? 4 : 10);
  if (kept) { BAG[h.id] = (BAG[h.id] || 0) + 1; toast('Into the esky. +' + pts + ' XP'); }
  else { toast((v.ok ? 'Released. ' : 'Good release. ') + '+' + pts + ' XP'); splashNearPlayer(); }
  logCatch(h, kept, pts);
  questEvent('catch', { h, kept, under: !keep && v.under });
  holder.children.slice().forEach(m => { if (m !== drops.pts) holder.remove(m); }); FISH.inst = null; FISH.hooked = null;
  CATCH_OPEN = false; FISH.state = 'ready'; hideCatch(); hint();
}
function splashNearPlayer() { const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); const x = P.x + fx * 2.5, z = P.z + fz * 2.5; if (W.waterY - terrainH(x, z) > 0.2) splash(x, z, false); }

/* camera juice */
const JUICE = { shake: 0, fov: 0 };
function shake(a) { JUICE.shake = Math.max(JUICE.shake, a); }
function punchFov() { JUICE.fov = 1; }
function updateJuice(dt) {
  JUICE.shake = Math.max(0, JUICE.shake - dt * 1.8); JUICE.fov = Math.max(0, JUICE.fov - dt * 1.4);
  if (JUICE.shake > 0) { const s = JUICE.shake * JUICE.shake * 0.03; camera.rotation.x += (Math.random() - 0.5) * s; camera.rotation.y += (Math.random() - 0.5) * s; }
  const base = innerWidth / innerHeight < 0.8 ? 78 : 68, f = base - 10 * Math.sin(JUICE.fov * Math.PI) * JUICE.fov;
  if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
}
