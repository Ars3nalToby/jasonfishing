/* ======================================================================
   PROGRESSION: levels, coins, bait + rod shop, daily quests, banners,
   fight prompts, first-run coach
   ====================================================================== */
const PROG = Object.assign({ xp: 0, credit: 100, baits: ['prawn'], bait: 'prawn', rods: ['light'], rod: 'light', tut: 0 }, store.get('prog', {}));
function saveProg() { store.set('prog', PROG); }
const curBait = () => BAITS.find(b => b.id === PROG.bait) || BAITS[0];
const curRod = () => RODS.find(r => r.id === PROG.rod) || RODS[0];
function levelOf(xp) {
  let lvl = 1; while (60 * (lvl + 1) * lvl <= xp) lvl++;
  const a = 60 * lvl * (lvl - 1), b = 60 * (lvl + 1) * lvl;
  return { lvl, into: xp - a, need: b - a, frac: (xp - a) / (b - a) };
}
function addXP(n) {
  const before = levelOf(PROG.xp).lvl; PROG.xp += n; const after = levelOf(PROG.xp).lvl;
  if (after > before) {
    setTimeout(() => { flash('LEVEL ' + after); sfx('level'); const r = RODS.find(x => x.lvl === after); if (r) toast('Unlocked in the tackle shop: ' + r.name); }, 1600);
  }
}

/* ---------- daily quests ---------- */
function todayKey() { const b = new Date(Date.now() + 10 * 3600e3); return b.toISOString().slice(0, 10); }
let QUESTS = store.get('quests', null);
function ensureQuests() {
  const k = todayKey();
  if (QUESTS && QUESTS.day === k) return;
  const seed = k.split('-').reduce((a, b) => a * 31 + (+b), 7), picks = [];
  for (let i = 0; picks.length < 3 && i < 50; i++) { const j = Math.floor(hash(seed, i, 5) * QUEST_POOL.length); if (picks.indexOf(j) < 0) picks.push(j); }
  QUESTS = { day: k, list: picks.map(i => ({ i, p: 0, done: false, s: [] })) };
  store.set('quests', QUESTS);
}
function questEvent(type, d) {
  ensureQuests();
  QUESTS.list.forEach(q => {
    if (q.done) return;
    const Q = QUEST_POOL[q.i];
    if (type === 'catch') {
      const h = d.h;
      if (Q.k === 'count') q.p++;
      if (Q.k === 'species' && q.s.indexOf(h.id) < 0) { q.s.push(h.id); q.p = q.s.length; }
      if (Q.k === 'stars' && h.stars >= 2) q.p = 1;
      if (Q.k === 'release' && d.under) q.p++;
      if (Q.k === 'boat' && P.inBoat) q.p++;
      if (Q.k === 'golden' && goldenHour()) q.p++;
      if (Q.k === 'cm' && h.cm >= Q.n) q.p = Q.n;
      if (Q.k === 'rare' && RARITY.indexOf(h.rarity) >= 2) q.p++;
      if (Q.k === 'keep' && d.kept) q.p++;
    }
    if (type === 'perfect' && Q.k === 'perfect') q.p++;
    if (type === 'jump' && Q.k === 'jump') q.p++;
    const goal = Q.k === 'stars' || Q.k === 'rare' ? 1 : Q.n;
    if (q.p >= goal) { q.done = true; PROG.credit += Q.r; addXP(Math.round(Q.r / 2)); saveProg(); setTimeout(() => { toast('Quest done: ' + Q.t + ' · +' + Q.r + ' coins'); sfx('level'); }, 1200); }
  });
  store.set('quests', QUESTS); renderQuests(); updateScore();
}
function renderQuests() {
  ensureQuests();
  const el = $('#quests'); if (!el) return;
  const done = QUESTS.list.filter(q => q.done).length;
  el.innerHTML = '<button class="qh" id="qToggle" aria-expanded="' + !el.classList.contains('min') + '">Today\'s quests <b>' + done + '/3</b></button><ol>' + QUESTS.list.map(q => {
    const Q = QUEST_POOL[q.i], goal = Q.k === 'stars' || Q.k === 'rare' ? 1 : Q.n, p = Q.k === 'cm' ? (q.done ? 1 : 0) : Math.min(q.p, goal), g2 = Q.k === 'cm' ? 1 : goal;
    return '<li class="' + (q.done ? 'done' : '') + '"><span>' + esc(Q.t) + '</span><i>' + (q.done ? 'Done' : p + '/' + g2) + ' · ' + Q.r + 'c</i></li>';
  }).join('') + '</ol>';
  $('#qToggle').onclick = () => { el.classList.toggle('min'); store.set('qmin', el.classList.contains('min')); renderQuests(); };
}

/* ---------- tackle shop ---------- */
function openShop() {
  const lvl = levelOf(PROG.xp).lvl;
  const top = b => Object.entries(b.likes).filter(e => e[1] > 1.2).sort((x, y) => y[1] - x[1]).slice(0, 3).map(e => SPECIES.find(s => s.id === e[0]).name.replace(/ \(.*\)/, '')).join(', ');
  $('#shopBody').innerHTML =
    '<p class="lede">Coins come from every fish you land and from daily quests. Bait changes which fish bite. A heavier rod lets you lean harder before the line snaps. You have <b>' + PROG.credit + ' coins</b>, level ' + lvl + '.</p>' +
    '<h3>Bait</h3><div class="shop">' + BAITS.map(b => {
      const own = PROG.baits.indexOf(b.id) >= 0, eq = PROG.bait === b.id;
      return '<article class="sc' + (eq ? ' eq' : '') + '"><b>' + esc(b.name) + '</b><p>' + esc(b.blurb) + '</p><small>Best for: ' + esc(top(b) || 'luderick') + '</small>' +
        '<button class="btn ' + (eq ? '' : own || PROG.credit >= b.cost ? 'primary' : '') + '" data-bait="' + b.id + '" ' + (eq || (!own && PROG.credit < b.cost) ? 'disabled' : '') + '>' + (eq ? 'On the hook' : own ? 'Use' : 'Buy · ' + b.cost) + '</button></article>';
    }).join('') + '</div>' +
    '<h3>Rods</h3><div class="shop">' + RODS.map(r => {
      const own = PROG.rods.indexOf(r.id) >= 0, eq = PROG.rod === r.id, lock = lvl < r.lvl;
      return '<article class="sc' + (eq ? ' eq' : '') + '"><b>' + esc(r.name) + '</b><p>' + esc(r.blurb) + '</p><small>Line strength ×' + r.line + ' · winding ×' + r.reel + '</small>' +
        '<button class="btn ' + (eq ? '' : own || (PROG.credit >= r.cost && !lock) ? 'primary' : '') + '" data-rod="' + r.id + '" ' + (eq || lock || (!own && PROG.credit < r.cost) ? 'disabled' : '') + '>' + (eq ? 'In hand' : lock ? 'Level ' + r.lvl : own ? 'Use' : 'Buy · ' + r.cost) + '</button></article>';
    }).join('') + '</div><p class="src">Bait preferences are simplified from common south-east Queensland angling practice, tuned for the game.</p>';
  $('#shopBody').onclick = e => {
    const b = e.target.closest('[data-bait]'), r = e.target.closest('[data-rod]');
    if (b) { const it = BAITS.find(x => x.id === b.dataset.bait); if (PROG.baits.indexOf(it.id) < 0) { PROG.credit -= it.cost; PROG.baits.push(it.id); sfx('level'); } PROG.bait = it.id; }
    if (r) { const it = RODS.find(x => x.id === r.dataset.rod); if (PROG.rods.indexOf(it.id) < 0) { PROG.credit -= it.cost; PROG.rods.push(it.id); sfx('level'); } PROG.rod = it.id; }
    if (b || r) { saveProg(); updateScore(); renderBait(); openShop(); }
  };
  openPanel('#shop');
}
function renderBait() { const el = $('#baitChip'); if (el) el.innerHTML = '<i>Bait</i>' + esc(curBait().name) + ' <i>Rod</i>' + esc(curRod().name.split(' ')[0]); }
function cycleBait() {
  const i = PROG.baits.indexOf(PROG.bait); PROG.bait = PROG.baits[(i + 1) % PROG.baits.length]; saveProg(); renderBait();
  toast('Bait: ' + curBait().name + (FISH.state === 'waiting' ? ' (applies next cast)' : ''));
}
function nearShop() { return !P.inBoat && Math.hypot(P.x - (PIER.x0 - 10), P.z + 12) < 7; }

/* ---------- fight prompts ---------- */
function showMove(m) {
  const el = $('#move'), touch = $('#steer');
  document.body.classList.toggle('moving', !!m);
  if (!m) { el.hidden = true; touch.hidden = true; input.steer = 0; return; }
  el.hidden = false; el.className = 'move m-' + m.k;
  if (m.k === 'jump') el.innerHTML = '<b>JUMP!</b><span>Let go of reel until it lands</span>';
  if (m.k === 'dig') el.innerHTML = '<b>It\'s digging in</b><span>Short pumps · keep the needle in the green</span>';
  if (m.k === 'structure') {
    const need = -m.dir;
    el.innerHTML = '<b>' + (need < 0 ? '◀ Steer' : 'Steer ▶') + '</b><span>It is running for the ' + (P.inBoat ? 'reef' : 'pylons') + ' · ' + (IS_TOUCH ? 'hold the steer button' : need < 0 ? 'hold A' : 'hold D') + '</span><i class="sbar"><u></u></i>';
    touch.hidden = !IS_TOUCH; touch.dataset.need = need;
  }
}
function updateMoveUI() {
  const m = FISH.move; if (!m || m.k !== 'structure') return;
  const u = document.querySelector('#move .sbar u'); if (u) u.style.width = Math.min(100, m.good / 0.8 * 100) + '%';
}

/* ---------- catch banner ---------- */
function showBanner(h) {
  const sp = SPECIES.find(s => s.id === h.id), el = $('#banner');
  el.className = 'banner r-' + h.rarity.id; el.hidden = false;
  el.innerHTML = '<div class="bk">' + (h.legend ? 'LEGEND LANDED' : h.isNew ? 'NEW SPECIES' : h.pb ? 'PERSONAL BEST' : h.rarity.name.toUpperCase()) + '</div>' +
    '<div class="bn">' + esc(h.legend || sp.name) + '</div><div class="bs">' + '★'.repeat(h.stars) + '<i>' + '★'.repeat(3 - h.stars) + '</i> · ' + h.cm + ' cm</div>';
  el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  const cf = $('#confetti'); cf.innerHTML = '';
  if (RARITY.indexOf(h.rarity) >= 2 || h.isNew || h.pb) {
    const cols = ['#ffd23a', '#ff4d24', '#57d68d', '#5fc8ff', '#f3f6f4'];
    for (let i = 0; i < 46; i++) { const d = document.createElement('i'); d.style.cssText = 'left:' + (Math.random() * 100) + '%;background:' + cols[i % 5] + ';animation-delay:' + (Math.random() * 0.4) + 's;--dx:' + ((Math.random() - 0.5) * 160) + 'px;--r:' + (Math.random() * 720) + 'deg'; cf.appendChild(d); }
  }
  setTimeout(() => { el.hidden = true; cf.innerHTML = ''; }, 2600);
}

/* ---------- first-run coach ---------- */
const TUT = ['Hold click or Space to wind up. Let go to cast.', 'Watch the water. A fish is coming to check your float.', 'The float went under. Click now to strike!', 'Hold to reel. Keep the needle in the green zone. Let go if it jumps.'];
const TUT_T = ['Hold Cast to wind up. Let go to throw.', 'Watch the water. A fish is coming to check your float.', 'The float went under. Tap Strike now!', 'Hold Reel. Keep the needle in the green zone. Let go if it jumps.'];
const TUT_EV = ['cast', 'bite', 'strike', 'land'];
function tutorial(ev) {
  if (ev && PROG.tut < 4 && TUT_EV[PROG.tut] === ev) { PROG.tut++; saveProg(); }
  const el = $('#coach'); if (!el) return;
  if (PROG.tut >= 4 || !GAME_ON || FISH.state === 'idle') { el.hidden = true; document.body.classList.remove('coaching'); return; }
  document.body.classList.add('coaching');
  el.hidden = false; el.innerHTML = '<i>' + (PROG.tut + 1) + ' / 4</i>' + esc((IS_TOUCH ? TUT_T : TUT)[PROG.tut]);
}
