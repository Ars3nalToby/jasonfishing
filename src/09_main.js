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
  GAME_ON = true; document.body.classList.add('playing'); hint();
  try { store.set('lastSpot', spot.id); } catch (e) {}
  toast(IS_TOUCH ? 'Drag to look, stick to walk. Rod button to fish.' : 'Click the view to look around. Walk out along the pier and press F.');
}

let last = performance.now(), ema = 0.016, adaptT = 0, condT = 0, sunTick = 0, frameN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.5, (now - last) / 1000); last = now; const dt = Math.min(window.__dtcap || 0.05, raw);
  ema += (raw - ema) * 0.05; adaptT += raw; frameN++;
  if (adaptT > 2 && !window.__noadapt) {
    adaptT = 0;
    if (ema > 0.03 && curPR > 0.6) { curPR = Math.max(0.6, curPR * 0.85); renderer.setPixelRatio(curPR); resize(); }
    else if (ema < 0.017 && curPR < maxPR) { curPR = Math.min(maxPR, curPR * 1.1); renderer.setPixelRatio(curPR); resize(); }
  }
  if (W.targetY !== undefined) W.waterY += (W.targetY - W.waterY) * Math.min(1, dt * 0.2);
  if (GAME_ON) {
    updateBoat(dt); updatePlayer(dt); updateFishing(dt); updateSeen(dt); updateHolder(dt); updateAudio(dt);
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
setInterval(() => { if (GAME_ON) { const nb = nearBoat(); $('#bUse').textContent = P.inBoat ? 'Step off' : nb ? 'Take boat' : 'Hire'; $('#useTip').hidden = !(nb && !IS_TOUCH); } }, 300);

(async function boot() {
  resize(); buildBoat();
  setBar(0.2, 'Shaping the bay…'); await nextFrame();
  buildWorld(SPOTS[0]); placeAtPier(); simulate();
  renderStart(); updateScore();
  $('#bSound').textContent = AU.on ? 'Sound on' : 'Sound off';
  setBar(1); $('#loader').hidden = true; $('#start').hidden = false;
  last = performance.now(); requestAnimationFrame(frame);
  window.__bf = { sim(sec, act) { for (let t = 0; t < sec; t += 0.05) { if (act !== undefined) input.action = act; updateBoat(0.05); updatePlayer(0.05); updateFishing(0.05); updateSeen(0.05); updateHolder(0.05); updateWorld(0.05); if (FISH.state === 'landed') break; } return FISH.state; }, P, B, FISH, S: () => S, W, LIVE, startSpot, SPOTS, cast: (p) => { if (FISH.state === 'idle') toggleRod(); FISH.state = 'charging'; FISH.power = p; actionUp(); }, strike, keys, input, openHire, openDex, setTime: m => { TIME_MODE = m; updateSun(); } };
})();
