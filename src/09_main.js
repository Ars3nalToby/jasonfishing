/* ======================================================================
   BOOT + LOOP
   ====================================================================== */
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 0.8 ? 78 : 68; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
const setBar = (f, msg) => { $('#lbar').style.width = Math.round(f * 100) + '%'; if (msg) $('#lmsg').textContent = msg; };

function renderStart() {
  $('#spots').innerHTML = SPOTS.map((s, i) =>
    '<button class="spot" data-i="' + i + '"><span class="reg">' + esc(s.region) + '</span><b>' + esc(s.name) + '</b><span class="bl">' + esc(s.blurb) + '</span>' +
    '<span class="tg">' + Object.keys(s.bites).slice(0, 5).map(id => esc(SPECIES.find(x => x.id === id).name.replace(/ \(.*\)/, ''))).join(' · ') + '</span></button>').join('');
  $('#spots').onclick = e => { const b = e.target.closest('.spot'); if (b) startSpot(SPOTS[+b.dataset.i]); };
}

async function startSpot(spot) {
  $('#start').hidden = true; $('#loader').hidden = false; GAME_ON = false;
  if (FISH.state !== 'idle') { reelInNow(); FISH.state = 'idle'; rod.visible = false; }
  if (CATCH_OPEN) finishCatch(false);
  if (P.inBoat) P.inBoat = false;
  BAG = {}; updateScore();
  setBar(0.05, 'Shaping ' + spot.name + '…'); await nextFrame();
  buildWorld(spot); placeAtPier(); buildMinimapBase();
  simulate(); fetchLive();
  const ids = Object.keys(spot.bites).concat(spot.seen).filter((v, i, a) => a.indexOf(v) === i);
  let n = 0;
  for (const id of ids) { setBar(0.15 + 0.8 * n++ / ids.length, 'Painting ' + SPECIES.find(s => s.id === id).name + '…'); await nextFrame(); protoFor(id); }
  spawnSeen();
  setBar(1, 'Ready'); await nextFrame();
  $('#loader').hidden = true; $('#spotName').textContent = spot.name; $('#spotReg').textContent = spot.region;
  // quick start: end of the pier, rod out, facing the water
  P.x = PIER.x1 - 2; P.z = 0.4; P.deck = true; P.yaw = -Math.PI / 2 + 0.25; P.pitch = -0.12; P.y = PIER.h + 1.65;
  GAME_ON = true; document.body.classList.add('playing'); FISH.state = 'idle'; toggleRod(); hint(); renderQuests(); renderBait(); updateScore(); tutorial();
  try { store.set('lastSpot', spot.id); } catch (e) {}
  toast(spot.name + ' · bait: ' + curBait().name + (PROG.tut < 4 ? '' : ' · B swaps bait, T opens the tackle shop'));
}

let last = performance.now(), ema = 0.016, adaptT = 0, condT = 0, sunTick = 0, frameN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.5, (now - last) / 1000); last = now;
  if (TSC.slowT > 0) { TSC.slowT -= raw; TSC.scale = mix(TSC.scale, 0.3, 0.3); } else TSC.scale = mix(TSC.scale, 1, 0.08);
  const dt = Math.min(window.__dtcap || 0.05, raw) * TSC.scale;
  ema += (raw - ema) * 0.05; adaptT += raw; frameN++;
  if (adaptT > 2 && !window.__noadapt) {
    adaptT = 0;
    if (ema > 0.03 && curPR > 0.6) { curPR = Math.max(0.6, curPR * 0.85); renderer.setPixelRatio(curPR); resize(); }
    else if (ema < 0.017 && curPR < maxPR) { curPR = Math.min(maxPR, curPR * 1.1); renderer.setPixelRatio(curPR); resize(); }
  }
  if (W.targetY !== undefined) W.waterY += (W.targetY - W.waterY) * Math.min(1, dt * 0.2);
  if (GAME_ON) {
    updateBoat(dt); updatePlayer(dt); updateJuice(raw); updateFishing(dt); updateSeen(dt); updateHolder(raw); updateAudio(dt); updateMoveUI();
    if (frameN % 2 === 0) drawMinimap();
    drawMeters();
    condT += dt; if (condT > 1) { condT = 0; renderConditions(); }
    if (LIVE.ok && Date.now() - LIVE.at > 600e3) { LIVE.at = Date.now(); fetchLive(); }
  } else {
    // attract mode: slow drift along the foreshore
    const t = now / 1000 * 0.05;
    camera.position.set(PIER.x0 + 30 + Math.sin(t) * 20, 7 + Math.sin(t * 1.3), 30 + Math.cos(t) * 12);
    camera.lookAt(PIER.x1, 1, -10);
  }
  sunTick += dt; if (sunTick > 5) { sunTick = 0; updateSun(); }
  updateWorld(dt); updateEnv();
  renderer.render(scene, camera);
}

/* buttons */
$('#bSpots').onclick = () => { renderStart(); $('#start').hidden = false; $('#start').classList.add('again'); if (document.pointerLockElement) document.exitPointerLock(); };
$('#bHire').onclick = () => openHire();
$('#bDex').onclick = () => openDex();
$('#bShop').onclick = () => openShop();
$('#bMenu').onclick = () => { const o = document.body.classList.toggle('menu-open'); $('#bMenu').setAttribute('aria-expanded', o); $('#bMenu').textContent = o ? 'Close' : 'Menu'; if (o) { $('#quests').classList.remove('min'); renderQuests(); } };
document.querySelector('.tools').addEventListener('click', () => { if (document.body.classList.contains('menu-open')) $('#bMenu').click(); });
$('#baitChip').onclick = () => openShop();
['#stL', '#stR'].forEach((id, i) => { const b = $(id); const on = e => { e.preventDefault(); input.steer = i ? 1 : -1; }, off = () => { input.steer = 0; }; b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off); });
$('#bSound').onclick = () => toggleSound();
$('#bTime').onclick = () => { const order = ['live', 'dawn', 'noon', 'dusk', 'night']; TIME_MODE = order[(order.indexOf(TIME_MODE) + 1) % order.length]; $('#bTime').textContent = TIME_MODE === 'live' ? 'Time: now' : 'Time: ' + TIME_MODE; updateSun(); renderConditions(); };
document.querySelectorAll('.panel .x').forEach(b => b.onclick = () => closePanels());
$('#bAct').addEventListener('pointerdown', e => { e.preventDefault(); actionDown(); });
$('#bAct').addEventListener('pointerup', e => { e.preventDefault(); actionUp(); });
$('#bAct').addEventListener('pointercancel', () => actionUp());
$('#bRod').onclick = () => toggleRod();
$('#bUse').onclick = () => interact();
(function joystick() {
  const pad = $('#joy'), knob = pad.querySelector('i'); let id = null, cx = 0, cy = 0;
  pad.addEventListener('pointerdown', e => { id = e.pointerId; const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; pad.setPointerCapture(id); move(e); });
  const move = e => { if (e.pointerId !== id) return; let dx = (e.clientX - cx) / 50, dy = (e.clientY - cy) / 50; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } input.joy.x = dx; input.joy.y = dy; knob.style.transform = 'translate(' + dx * 34 + 'px,' + dy * 34 + 'px)'; };
  pad.addEventListener('pointermove', move);
  const end = e => { if (e.pointerId !== id) return; id = null; input.joy.x = input.joy.y = 0; knob.style.transform = ''; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
})();
setInterval(() => { if (GAME_ON) { const nb = nearBoat(), ns = nearShop(); $('#bUse').textContent = P.inBoat ? 'Step off' : nb ? 'Take boat' : ns ? 'Tackle' : 'Hire'; $('#useTip').hidden = !((nb || ns) && !IS_TOUCH); $('#useTip').textContent = ns ? 'E · bait & tackle shop' : 'E · take the hire tinnie'; tutorial(); } }, 300);

(async function boot() {
  resize(); buildBoat(); if (store.get('qmin', true)) $('#quests').classList.add('min');
  setBar(0.2, 'Shaping the bay…'); await nextFrame();
  buildWorld(SPOTS[0]); placeAtPier(); simulate();
  renderStart(); updateScore();
  $('#bSound').textContent = AU.on ? 'Sound on' : 'Sound off';
  setBar(1); $('#loader').hidden = true; $('#start').hidden = false;
  last = performance.now(); requestAnimationFrame(frame);
  window.__bf = { sim(sec, act) { for (let t = 0; t < sec; t += 0.05) { if (act !== undefined) input.action = act; updateBoat(0.05); updatePlayer(0.05); updateFishing(0.05); updateMoveUI(); updateSeen(0.05); updateHolder(0.05); updateWorld(0.05); if (FISH.state === 'landed') break; } return FISH.state; }, P, B, FISH, S: () => S, W, LIVE, startSpot, SPOTS, cast: (p) => { if (FISH.state === 'idle') toggleRod(); FISH.state = 'charging'; FISH.power = p; actionUp(); }, strike, keys, input, PROG, finishCatch, verdict, startMove, openShop, forceBite: (id, cm) => { FISH.biteIn = 3.3; const o = pickBite; pickBite = () => { pickBite = o; return { id, cm }; }; }, openHire, openDex, setTime: m => { TIME_MODE = m; updateSun(); } };
})();
