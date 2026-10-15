/* ======================================================================
   UI: HUD, hints, toasts, catch card, Fishdex, boat hire, minimap, audio
   ====================================================================== */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let GAME_ON = false;
let BAG = {};
const store = {
  get(k, d) { try { const v = localStorage.getItem('bf_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('bf_' + k, JSON.stringify(v)); } catch (e) {} }
};
const DEX = store.get('dex', {});          // id -> { seen, caught, kept, best }
let SCORE = store.get('score', 0);
const LOG = store.get('log', []);

function toast(msg) {
  const box = $('#toasts'), d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; box.appendChild(d);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 600); }, 3600);
}
function flash(t) { const f = $('#flash'); f.textContent = t; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
function hint() {
  const t = IS_TOUCH;
  const map = {
    idle: t ? 'Tap Rod to take it out' : (locked ? '' : 'Click to look around · ') + 'WASD walk · F take out the rod · E boat hire',
    ready: t ? 'Hold Cast, release to throw' : 'Hold click or Space to wind up, release to cast · F put rod away',
    charging: 'Release to cast',
    flying: '',
    waiting: t ? 'Wait for the float to go under · hold Reel to wind in' : 'Watch the float · hold to wind in and recast',
    bite: t ? 'TAP NOW to strike!' : 'CLICK NOW to strike!',
    fight: t ? 'Hold Reel · keep the needle in the green' : 'Hold to reel · keep the needle in the green zone',
    landed: ''
  };
  $('#hint').textContent = P.inBoat && (FISH.state === 'idle' || FISH.state === 'ready') ? (t ? 'Stick to drive · Rod to fish · Exit near pier' : 'W/S throttle · A/D steer · stop to fish · E step off') : map[FISH.state] || '';
  $('#bAct').textContent = FISH.state === 'idle' ? 'Rod' : FISH.state === 'ready' || FISH.state === 'charging' ? 'Cast' : FISH.state === 'bite' ? 'Strike!' : 'Reel';
  $('#bAct').classList.toggle('hot', FISH.state === 'bite');
  $('#bRod').hidden = FISH.state === 'idle' || FISH.state === 'fight' || FISH.state === 'landed';
  document.body.classList.toggle('fighting', FISH.state === 'fight' || FISH.state === 'landed');
}

/* ---------- catch card ---------- */
function showCatch(h) {
  const sp = SPECIES.find(s => s.id === h.id), v = verdict(h), r = RULES[h.id] || {};
  $('#catch').innerHTML =
    '<div class="eyebrow">' + esc(S.name) + (P.inBoat ? ' · from the boat' : '') + '</div>' +
    '<div class="tagrow"><span class="rar r-' + h.rarity.id + '">' + h.rarity.name + '</span><span class="stars" aria-label="' + h.stars + ' of 3 stars">' + '★★★'.slice(0, h.stars) + '<i>' + '★★★'.slice(h.stars) + '</i></span>' + (h.isNew ? '<span class="pb">NEW</span>' : h.pb ? '<span class="pb">PB</span>' : '') + '</div>' +
    (h.legend ? '<div class="legend">' + esc(h.legend) + '</div>' : '') +
    '<h2>' + esc(sp.name) + '</h2><em>' + esc(sp.sci) + '</em>' +
    '<div class="meas"><div><b>' + h.cm + '</b><span>cm</span></div><div><b>' + (h.kg < 1 ? Math.round(h.kg * 1000) + '</b><span>g' : h.kg.toFixed(1) + '</b><span>kg') + '</span></div>' +
    '<div class="ruler" aria-hidden="true">' + rulerSvg(h.cm, r) + '</div></div>' +
    '<div class="verdict ' + v.cls + '"><b>' + esc(v.t) + '</b><span>' + esc(v.d) + '</span></div>' +
    '<div class="row"><button class="btn primary" id="cKeep" ' + (v.ok ? '' : 'disabled') + '>Keep</button><button class="btn" id="cRel">Release</button></div>' +
    '<p class="src">Rules: Qld Government tidal limits, checked ' + CHECKED + (r.src === 'none' ? '. This species is not on that page.' : '') + '</p>';
  $('#catch').hidden = false; document.body.classList.add('catching');
  $('#cKeep').onclick = () => finishCatch(true); $('#cRel').onclick = () => finishCatch(false);
  if (document.pointerLockElement) document.exitPointerLock();
}
function rulerSvg(cm, r) {
  const max = Math.max(cm, r.max || 0, r.min || 0) * 1.15, W_ = 220, x = v => 6 + v / max * (W_ - 12);
  let s = '<svg viewBox="0 0 ' + W_ + ' 34" width="100%" height="34">';
  s += '<rect x="6" y="12" width="' + (W_ - 12) + '" height="10" rx="2" class="rl"/>';
  if (r.min) s += '<rect x="' + x(r.min) + '" y="12" width="' + ((r.max ? x(r.max) : W_ - 6) - x(r.min)) + '" height="10" class="rok"/>';
  s += '<line x1="' + x(cm) + '" x2="' + x(cm) + '" y1="6" y2="28" class="rm"/>';
  if (r.min) s += '<text x="' + x(r.min) + '" y="33" class="rt">' + r.min + '</text>';
  if (r.max) s += '<text x="' + x(r.max) + '" y="33" class="rt">' + r.max + '</text>';
  return s + '</svg>';
}
function hideCatch() { $('#catch').hidden = true; document.body.classList.remove('catching'); }
function markSeen(id) { DEX[id] = Object.assign({ seen: true }, DEX[id] || {}); DEX[id].seen = true; store.set('dex', DEX); const sp = SPECIES.find(s => s.id === id); toast('Spotted: ' + sp.name + ' (added to Fishdex)'); }
function logCatch(h, kept, pts) {
  const d = DEX[h.id] = DEX[h.id] || {};
  d.seen = true; d.caught = (d.caught || 0) + 1; if (kept) d.kept = (d.kept || 0) + 1; d.best = Math.max(d.best || 0, h.cm);
  SCORE += pts; addXP(pts); PROG.credit += pts; saveProg(); LOG.unshift({ id: h.id, cm: h.cm, kept, spot: S.id, t: Date.now() }); LOG.length = Math.min(LOG.length, 40);
  store.set('dex', DEX); store.set('score', SCORE); store.set('log', LOG); updateScore();
}
function updateScore() {
  $('#score').textContent = PROG.credit.toLocaleString('en-AU');
  const L = levelOf(PROG.xp); $('#lvl').textContent = L.lvl; $('#xpbar').style.setProperty('--v', L.frac); $('#lvlbox').title = L.into + ' / ' + L.need + ' XP to level ' + (L.lvl + 1);
  const kept = Object.values(BAG).reduce((a, b) => a + b, 0); $('#esky').textContent = kept;
}

/* ---------- panels ---------- */
function closePanels() { document.querySelectorAll('.panel').forEach(p => { if (p.id !== 'start' || GAME_ON) p.hidden = true; }); }
function openPanel(id) { closePanels(); $(id).hidden = false; if (document.pointerLockElement) document.exitPointerLock(); }
function openDex() {
  const ids = Object.keys(GAME).concat(['butterflyfish', 'moorishidol']);
  const found = ids.filter(i => DEX[i] && (DEX[i].caught || DEX[i].seen)).length;
  $('#dexBody').innerHTML = '<p class="lede">' + found + ' of ' + ids.length + ' south-east Queensland species found. Score ' + SCORE.toLocaleString('en-AU') + '.</p><div class="dex">' +
    ids.map(id => {
      const sp = SPECIES.find(s => s.id === id), d = DEX[id] || {}, r = RULES[id] || {}, where = SPOTS.filter(s => s.bites[id] || s.seen.indexOf(id) >= 0).map(s => s.region).join(', ');
      const st = d.caught ? 'caught' : d.seen ? 'seen' : 'unknown';
      return '<div class="dx ' + st + '"><b>' + (st === 'unknown' ? '???' : esc(sp.name)) + '</b><span>' + (d.caught ? d.caught + ' caught · best ' + d.best + ' cm' : d.seen ? 'Seen, not caught' : (GAME[id] && GAME[id].zone === 'boat' ? 'Try deep water by boat' : 'Not found yet')) + '</span>' +
        '<small>' + esc(where || 'Seen near rock walls') + (r.min ? ' · min ' + r.min + ' cm' : '') + (r.noTake ? ' · no take' : '') + '</small></div>';
    }).join('') + '</div>';
  openPanel('#dex');
}
function goVerdict() {
  if (!LIVE.ok) return { cls: 'mid', t: 'No live weather on this page', d: 'Check the Bureau of Meteorology coastal forecast before heading out.' };
  const w = LIVE.wind, wv = LIVE.wave || 0;
  if (w <= 12 && wv <= 0.8) return { cls: 'good', t: 'Looks good for a tinnie', d: 'Wind ' + Math.round(w) + ' kn, waves ' + wv.toFixed(1) + ' m.' };
  if (w <= 18 && wv <= 1.3) return { cls: 'mid', t: 'Marginal, stay sheltered', d: 'Wind ' + Math.round(w) + ' kn, waves ' + wv.toFixed(1) + ' m. Keep to the bay side.' };
  return { cls: 'bad', t: 'Too rough for a small boat', d: 'Wind ' + Math.round(w) + ' kn, waves ' + wv.toFixed(1) + ' m.' };
}
function openHire() {
  const rows = HIRE.map(h => Object.assign({ km: kmBetween(S.lat, S.lon, h.lat, h.lon) }, h)).sort((a, b) => a.km - b.km);
  const v = goVerdict();
  $('#hireBody').innerHTML =
    '<div class="verdict ' + v.cls + '"><b>' + esc(v.t) + '</b><span>' + esc(v.d) + ' Game guide only, not a marine safety forecast.</span></div>' +
    '<p class="lede">Advertised self-drive hire prices, nearest to ' + esc(S.name) + ' first. Hire companies here do not publish a live price feed, so each price shows where and when it was checked. Confirm when you book.</p>' +
    '<div class="hire">' + rows.map(h =>
      '<article class="hc"><header><b>' + esc(h.name) + '</b><span>' + esc(h.place) + ' · ' + (h.km < 10 ? h.km.toFixed(1) : Math.round(h.km)) + ' km</span></header>' +
      '<div class="chips"><span class="chip ' + (h.licence ? 'lic' : 'nolic') + '">' + (h.licence ? 'Boat licence required' : 'No licence needed') + '</span><span class="chip">' + esc(h.boat) + '</span></div>' +
      (h.prices.length ? '<table class="pr"><tr>' + h.prices.map(p => '<th>' + esc(p[0]) + '</th>').join('') + '</tr><tr>' + h.prices.map(p => '<td>$' + p[1] + '</td>').join('') + '</tr></table>' : '<p class="noprice">No public price. Ask the operator.</p>') +
      '<p class="ex">' + esc(h.extra) + '</p><footer><span>Checked ' + CHECKED + ' · ' + esc(h.via) + '</span><a href="' + esc(h.url) + '" target="_blank" rel="noopener">Check price ↗</a></footer></article>').join('') + '</div>' +
    '<button class="btn primary wide" id="hireGo">Take the game tinnie out from this pier</button>';
  $('#hireGo').onclick = () => { closePanels(); if (!P.inBoat) { P.x = B.x - 1; P.z = B.z - 2.5; if (!onDeck(P.x, P.z)) { P.x = PIER.x0 + (PIER.hx0 - PIER.x0) * 0.55; P.z = PIER.w / 2 - 0.6; } P.deck = onDeck(P.x, P.z); boardBoat(); } };
  openPanel('#hire');
}

/* ---------- conditions strip ---------- */
const compass = d => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(((d % 360) + 360) % 360 / 22.5) % 16];
function renderConditions() {
  const now = timeNow(), tz = { timeZone: 'Australia/Brisbane', hour: 'numeric', minute: '2-digit' };
  const tideTxt = LIVE.tide === null ? '—' : (LIVE.tideRate > 0.05 ? 'Rising ' : LIVE.tideRate < -0.05 ? 'Falling ' : 'Slack ') + (LIVE.tide >= 0 ? '+' : '') + LIVE.tide.toFixed(2) + ' m';
  const bf = biteFactor();
  $('#cond').innerHTML =
    '<span><i>Time</i>' + now.toLocaleTimeString('en-AU', tz) + (TIME_MODE !== 'live' ? ' (' + TIME_MODE + ')' : '') + '</span>' +
    '<span><i>Tide</i>' + tideTxt + '</span>' +
    '<span><i>Wind</i>' + (LIVE.wind === null ? '—' : Math.round(LIVE.wind) + ' kn ' + compass(LIVE.windFrom)) + '</span>' +
    '<span><i>Waves</i>' + (LIVE.wave === null ? '—' : LIVE.wave.toFixed(1) + ' m') + '</span>' +
    '<span><i>Air</i>' + (LIVE.temp === null ? '—' : Math.round(LIVE.temp) + '°C') + '</span>' +
    '<span><i>Bite</i>' + (bf > 1.5 ? 'Hot' : bf > 1.1 ? 'Good' : bf > 0.85 ? 'Fair' : 'Slow') + '</span>';
  $('#src').textContent = LIVE.source;
}

/* ---------- minimap ---------- */
const mini = { cv: null, base: null, R: 160 };
function buildMinimapBase() {
  const n = 256, cv = canvasOf(n, n), g = cv.getContext('2d'), im = g.createImageData(n, n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -mini.R + (i + 0.5) / n * 2 * mini.R, z = -mini.R + (j + 0.5) / n * 2 * mini.R, h = terrainH(x, z), k = (j * n + i) * 4;
    let c;
    if (h > 0.4) c = h > 2.4 ? [118, 150, 92] : [232, 214, 170];
    else { const d = clamp01(-h / 9); c = [Math.round(mix(118, 26, d)), Math.round(mix(214, 98, d)), Math.round(mix(206, 150, d))]; }
    im.data[k] = c[0]; im.data[k + 1] = c[1]; im.data[k + 2] = c[2]; im.data[k + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  const px = x => (x + mini.R) / (2 * mini.R) * n;
  g.fillStyle = '#7a5a3c';
  g.fillRect(px(PIER.x0), px(-PIER.w / 2), px(PIER.x1) - px(PIER.x0), Math.max(2, px(PIER.w / 2) - px(-PIER.w / 2)));
  g.fillRect(px(PIER.hx0), px(-PIER.hw / 2), px(PIER.x1) - px(PIER.hx0), px(PIER.hw / 2) - px(-PIER.hw / 2));
  mini.base = cv;
}
function drawMinimap() {
  const cv = mini.cv || (mini.cv = $('#mini')), g = cv.getContext('2d'), s = cv.width, n = 256, sc = n / (2 * mini.R);
  g.clearRect(0, 0, s, s); g.save(); g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#1a5f7a'; g.fillRect(0, 0, s, s);
  g.translate(s / 2, s / 2); g.rotate(P.yaw); const zoom = s / 90 / sc * 1.0;
  g.scale(zoom, zoom); g.translate(-(P.x + mini.R) * sc, -(P.z + mini.R) * sc);
  g.drawImage(mini.base, 0, 0);
  const dot = (x, z, r, c) => { g.fillStyle = c; g.beginPath(); g.arc((x + mini.R) * sc, (z + mini.R) * sc, r / zoom, 0, Math.PI * 2); g.fill(); };
  if (!P.inBoat) { g.save(); g.translate((B.x + mini.R) * sc, (B.z + mini.R) * sc); g.rotate(-B.yaw); g.fillStyle = '#f2f4f5'; g.fillRect(-6 / zoom, -2.5 / zoom, 12 / zoom, 5 / zoom); g.restore(); }
  if (bobber.visible) dot(FISH.bob.x, FISH.bob.z, 3.5, '#ff3b1f');
  g.restore();
  g.fillStyle = '#ffd23a'; g.beginPath(); g.moveTo(s / 2, s / 2 - 8); g.lineTo(s / 2 + 6, s / 2 + 6); g.lineTo(s / 2, s / 2 + 3); g.lineTo(s / 2 - 6, s / 2 + 6); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2); g.stroke();
  // north tick
  const a = P.yaw - Math.PI / 2; g.fillStyle = '#fff'; g.font = '700 11px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('N', s / 2 + Math.cos(a) * (s / 2 - 11), s / 2 + Math.sin(a) * (s / 2 - 11));
}

/* ---------- meters ---------- */
function drawMeters() {
  const m = $('#meter');
  if (FISH.state === 'charging') { m.hidden = false; m.className = 'meter power'; m.style.setProperty('--v', FISH.power); m.dataset.label = 'Cast ' + Math.round(5 + FISH.power * 40) + ' m'; }
  else if (FISH.state === 'fight') {
    m.hidden = false; m.className = 'meter tension' + (FISH.tension > 0.85 ? ' danger' : '') + (FISH.inZone ? ' zone' : ''); m.style.setProperty('--v', Math.min(1, FISH.tension));
    const st = FISH.hooked ? Math.max(0, FISH.hooked.stam) / (FISH.hooked.legend ? 1.6 : 1) : 0;
    m.style.setProperty('--s', st);
    m.dataset.label = Math.round(FISH.dist) + ' m · ' + (FISH.inZone ? 'in the zone' : FISH.tension > 0.85 ? 'too tight!' : FISH.tension < ZONE[0] && input.action ? 'wind harder' : FISH.run > 0.4 ? 'it is running' : 'reel');
  } else m.hidden = true;
}

/* ---------- audio (synthesised, starts after a click) ---------- */
const AU = { ctx: null, on: store.get('sound', true), master: null, surf: null, reelT: 0 };
function unlockAudio() {
  if (AU.ctx || !AU.on) return;
  try {
    const C = AU.ctx = new (window.AudioContext || window.webkitAudioContext)();
    AU.master = C.createGain(); AU.master.gain.value = 0.55; AU.master.connect(C.destination);
    const buf = C.createBuffer(1, C.sampleRate * 4, C.sampleRate), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < d.length; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = b * 3.5; }
    const src = C.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = C.createGain(); g.gain.value = 0.25; src.connect(lp); lp.connect(g); g.connect(AU.master); src.start();
    AU.surf = g; AU.noise = buf;
  } catch (e) { AU.ctx = null; }
}
function toggleSound() {
  AU.on = !AU.on; store.set('sound', AU.on);
  if (AU.ctx) AU.master.gain.value = AU.on ? 0.55 : 0; else if (AU.on) unlockAudio();
  $('#bSound').textContent = AU.on ? 'Sound on' : 'Sound off';
}
function sfx(kind, k) {
  const C = AU.ctx; if (!C || !AU.on) return;
  const t = C.currentTime, g = C.createGain(); g.connect(AU.master);
  const noise = (dur, f, q, vol) => { const s = C.createBufferSource(); s.buffer = AU.noise; const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; s.connect(bp); bp.connect(g); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.start(t, Math.random() * 2); s.stop(t + dur); };
  const tone = (f0, f1, dur, vol, type) => { const o = C.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); o.connect(g); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.start(t); o.stop(t + dur); };
  if (kind === 'splash') noise(0.5, 900, 0.8, 0.9 * (k || 1));
  else if (kind === 'cast') noise(0.35, 2400, 2, 0.5);
  else if (kind === 'nibble') tone(320, 260, 0.08, 0.15);
  else if (kind === 'bite') { tone(180, 90, 0.25, 0.5); noise(0.3, 600, 1, 0.5); }
  else if (kind === 'strike') noise(0.15, 3000, 1, 0.6);
  else if (kind === 'snap') tone(1800, 300, 0.12, 0.35, 'square');
  else if (kind === 'landed') { const r = k || 0; [523, 659, 784, 1046, 1318].slice(0, 2 + r).forEach((f, i) => setTimeout(() => { const t2 = C.currentTime, o = C.createOscillator(), gg = C.createGain(); o.type = 'triangle'; o.frequency.value = f; o.connect(gg); gg.connect(AU.master); gg.gain.setValueAtTime(0.18, t2); gg.gain.exponentialRampToValueAtTime(0.001, t2 + 0.35); o.start(t2); o.stop(t2 + 0.4); }, i * 90)); setTimeout(() => sfx('splash', 0.6), 40); }
  else if (kind === 'level') { [660, 880, 1320].forEach((f, i) => setTimeout(() => { const t2 = C.currentTime, o = C.createOscillator(), gg = C.createGain(); o.type = 'square'; o.frequency.value = f; o.connect(gg); gg.connect(AU.master); gg.gain.setValueAtTime(0.06, t2); gg.gain.exponentialRampToValueAtTime(0.001, t2 + 0.2); o.start(t2); o.stop(t2 + 0.22); }, i * 70)); }
  else if (kind === 'legend') { tone(70, 50, 1.6, 0.5, 'sine'); tone(105, 80, 1.6, 0.25, 'triangle'); }
  else if (kind === 'click') tone(1400, 1200, 0.03, 0.12, 'square');
  else if (kind === 'gull') { const o = C.createOscillator(); o.type = 'sawtooth'; const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 3; o.connect(f); f.connect(g); o.frequency.setValueAtTime(1700, t); o.frequency.linearRampToValueAtTime(2400, t + 0.12); o.frequency.linearRampToValueAtTime(1500, t + 0.3); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + 0.32); o.start(t); o.stop(t + 0.35); }
}
function sfxReel(dt) { AU.reelT -= dt; if (AU.reelT < 0) { AU.reelT = 0.05; sfx('click'); } }
function updateAudio(dt) {
  if (!AU.ctx) return;
  const near = Math.max(0, 1 - Math.abs(P.x - shoreX(P.z)) / 120);
  AU.surf.gain.value = 0.08 + (0.12 + 0.25 * W.amp) * near * (0.6 + 0.4 * Math.sin(W.t * 0.7));
  if (Math.random() < dt * 0.06 && W.night < 0.5) sfx('gull');
}
