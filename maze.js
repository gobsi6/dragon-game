// 지하 회랑: 고대 유적 아래 일곱 층의 공유 미로 (maze.js)
// 숫자는 이 파일 위쪽 MAZE_RULES에서 고친다. 층의 벽 배치는 층 번호를 씨앗으로 서버가 한 번 만들고 바꾸지 않는다.
// 층 기록(밝힌 칸·표식·화톳불·기둥·수호자)은 world 표의 'maze'에, 드래곤의 횃불·위치는 combat JSON의 maze에 둔다.
const { ITEMS, REGIONS } = require('./game-data');

const MAZE_RULES = {
  region: 'ruins',                       // 입구가 있는 지역
  sizes: [45, 49, 51, 55, 59, 63, 67],  // 층 크기 (홀수)
  loops: 0.7,                            // 순환로 수 = 크기 × 이 값
  saveGap: 12,                           // 화톳불 자리 간격 (길로 몇 걸음)
  pitsDiv: 3,                            // 구덩이 수 = 크기 ÷ 이 값
  torch: 40,                             // 한 번 들어갈 때 횃불 걸음
  entries: 2,                            // 드래곤마다 하루 입장 (한국 시간 자정 초기화)
  stepNew: 1, stepOld: 0.5,              // 아무도 밟지 않은 칸 / 밟은 적 있는 칸
  deepFrom: 4,                           // 이 층 번호(0부터)부터 어둠·무너짐
  enc: { fresh: 0.08, old: 0.02, pity: 0.012, guarantee: 15, max: 6, conqueredMul: 0.3 },
  mobHits: (lv) => 2 + Math.ceil(lv / 6),
  mobLv: { lo: 3, hi: 24 },
  atk: 2,                                // 한 번 칠 때 드는 횃불
  fightHp: 15,                           // 이 아래면 칠 수 없다 (기존 사냥 규칙과 같음)
  counter: (gap) => Math.max(1, Math.min(6, Math.round(1.5 + gap * 0.3))),            // 칠 때 받는 반격
  passDmg: (hpMax, gap) => Math.max(6, Math.min(Math.round(hpMax * 0.3), Math.round(hpMax * 0.15 + gap * 1.5))), // 지나칠 때
  mobIdleMs: 60 * 60000,                 // 방치된 파수꾼이 돌로 돌아가기까지
  guardLv: (fi) => 8 + (fi + 1) * 2,
  guardHits: 14,
  guardRespawnMs: 24 * 3600000,          // 쓰러진 뒤 다시 깨어나기까지
  pillarMs: 20 * 60000,                  // 기둥 불이 타는 시간
  lightCost: 1,
  target: 80,                            // 봉인에 필요한 지도 %
  heal: 0.5, healCost: 1,                // 화톳불 상처 돌보기: 최대 체력의 비율, 횃불
  pit: 4, rescueCost: 1,
  collapse: { spots: 3, radius: 2 },     // 반나절마다 무너지는 곳
  xp: (lv, gap, boss) => Math.round(lv * 3 * Math.max(0.5, Math.min(2, 1 + gap * 0.1)) * (boss ? 4 : 1)),
  conqueredXp: 0.5,
  rare: { mob: 0.03, guard: 0.15, pool: ['mz_scale_charm', 'mz_crystal_eye', 'mz_king_seal', 'mz_city_key'] },
  scarDrop: 0.02,                        // 수호자를 쓰러뜨릴 때 참여자마다 옛 샘의 정수 (아주 드물게)
  sight: 3,                              // 안개 너머 화톳불이 보이는 거리
};

const D4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const josa = (w, a, b) => { const c = w.charCodeAt(w.length - 1); if (c < 0xac00 || c > 0xd7a3) return b; return (c - 0xac00) % 28 ? a : b; };
const ga = (n) => `${n}${josa(n, '이', '가')}`;
const eul = (n) => `${n}${josa(n, '을', '를')}`;
function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ── 층 만들기: 벽(#) 길(.) 입구(S) 계단(E) 기둥(P) 화톳불(F) 구덩이(T) ──
function genFloor(fi) {
  const N = MAZE_RULES.sizes[fi], R = rng(1000 + fi * 977), g = [];
  for (let r = 0; r < N; r++) g.push(Array(N).fill('#'));
  g[1][1] = '.';
  const st = [[1, 1]];
  while (st.length) {
    const cur = st[st.length - 1], opts = [];
    for (const d of D4) { const nr = cur[0] + d[0] * 2, nc = cur[1] + d[1] * 2; if (nr > 0 && nr < N - 1 && nc > 0 && nc < N - 1 && g[nr][nc] === '#') opts.push(d); }
    if (!opts.length) { st.pop(); continue; }
    const p = opts[Math.floor(R() * opts.length)];
    g[cur[0] + p[0]][cur[1] + p[1]] = '.'; g[cur[0] + p[0] * 2][cur[1] + p[1] * 2] = '.';
    st.push([cur[0] + p[0] * 2, cur[1] + p[1] * 2]);
  }
  let made = 0; const want = Math.floor(N * MAZE_RULES.loops);
  for (let t = 0; t < 4000 && made < want; t++) {
    const r = 1 + Math.floor(R() * (N - 2)), c = 1 + Math.floor(R() * (N - 2));
    if (g[r][c] !== '#') continue;
    const v = g[r - 1][c] === '.' && g[r + 1][c] === '.' && g[r][c - 1] === '#' && g[r][c + 1] === '#';
    const h = g[r][c - 1] === '.' && g[r][c + 1] === '.' && g[r - 1][c] === '#' && g[r + 1][c] === '#';
    if (v || h) { g[r][c] = '.'; made++; }
  }
  const dist = {}, q = [[1, 1]], cells = []; dist['1,1'] = 0;
  while (q.length) {
    const x = q.shift(), dd = dist[`${x[0]},${x[1]}`]; cells.push([x[0], x[1], dd]);
    for (const d of D4) { const nr = x[0] + d[0], nc = x[1] + d[1], k = `${nr},${nc}`; if (g[nr][nc] !== '#' && dist[k] === undefined) { dist[k] = dd + 1; q.push([nr, nc]); } }
  }
  const E = cells[cells.length - 1]; g[E[0]][E[1]] = 'E'; g[1][1] = 'S';
  const free = (r, c) => g[r][c] === '.';
  const nb = (r, c) => D4.filter((d) => g[r + d[0]][c + d[1]] !== '#').length;
  const mid = (N - 1) / 2, pillars = [];
  for (let qd = 0; qd < 4; qd++) {
    let best = null, bs = -1;
    for (const x of cells) {
      if (!free(x[0], x[1])) continue;
      const qq = (x[0] < mid ? 0 : 1) * 2 + (x[1] < mid ? 0 : 1); if (qq !== qd || x[2] < 8) continue;
      const s = Math.abs(x[0] - mid) + Math.abs(x[1] - mid) + (nb(x[0], x[1]) === 1 ? 4 : 0) + x[2] * 0.15;
      if (s > bs) { bs = s; best = x; }
    }
    if (best) { g[best[0]][best[1]] = 'P'; pillars.push([best[0], best[1]]); }
  }
  const shuf = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const cor = shuf(cells.filter((x) => free(x[0], x[1]) && nb(x[0], x[1]) >= 2 && x[2] > 5));
  for (let a = 0; a < cor.length && a < Math.floor(N / MAZE_RULES.pitsDiv); a++) g[cor[a][0]][cor[a][1]] = 'T';
  // 화톳불 자리: 입구·기둥에서 길을 따라 가장 먼 곳을 골라 가며 깐다
  const D = new Int32Array(N * N).fill(1e9), saves = [];
  const relax = (r0, c0) => { const qq = [[r0, c0]]; D[r0 * N + c0] = 0; for (let h = 0; h < qq.length; h++) { const y = qq[h], base = D[y[0] * N + y[1]]; for (const d of D4) { const rr = y[0] + d[0], cc = y[1] + d[1]; if (g[rr][cc] === '#') continue; const k = rr * N + cc; if (D[k] > base + 1) { D[k] = base + 1; qq.push([rr, cc]); } } } };
  relax(1, 1); for (const p of pillars) relax(p[0], p[1]);
  for (let guard = 0; guard < 400; guard++) {
    let bk = -1, bd = -1;
    for (let k = 0; k < N * N; k++) if (D[k] < 1e9 && D[k] > bd) { const rr = (k / N) | 0, cc = k % N; if (g[rr][cc] === '.' || D[k] > MAZE_RULES.saveGap + 2) { bd = D[k]; bk = k; } }
    if (bd <= MAZE_RULES.saveGap || bk < 0) break;
    const sr = (bk / N) | 0, sc = bk % N; if (g[sr][sc] !== '.') { D[bk] = 0; continue; }
    g[sr][sc] = 'F'; saves.push([sr, sc]); relax(sr, sc);
  }
  return { N, g, rows: g.map((r) => r.join('')), E: [E[0], E[1]], pillars, saves, total: cells.length };
}

module.exports = function setupMaze({ io, db, online, logic, sendMe, system, death, broadcastPresence }) {
  const R = MAZE_RULES;
  const GEO = R.sizes.map((n, i) => genFloor(i));
  const room = (fi) => `maze:${fi}`;
  const dayIdx = () => logic.dayIdx();
  const halfIdx = (now = Date.now()) => Math.floor((now + 9 * 3600000) / (12 * 3600000));

  // ── 층 기록 ──
  const newFloor = (i) => ({ opened: i === 0 ? Date.now() : null, conquered: false, reached: false, rev: '', step: '', pits: [], flags: {}, ways: [], lit: [0, 0, 0, 0], guard: [], contrib: {}, pioneers: [] });
  const W = db.worldGet('maze', null) || { floors: R.sizes.map((n, i) => newFloor(i)), city: false, half: halfIdx() };
  while (W.floors.length < R.sizes.length) W.floors.push(newFloor(W.floors.length));
  const FL = GEO.map((G, i) => {
    const n = G.N * G.N, f = W.floors[i], rev = new Uint8Array(n), step = new Uint8Array(n);
    const dec = (s, arr) => { for (let k = 0; k < n; k++) arr[k] = (parseInt(s[k >> 2] || '0', 16) >> (k & 3)) & 1; };
    dec(f.rev || '', rev); dec(f.step || '', step);
    return { rev, step };
  });
  const enc = (arr) => { let s = ''; for (let k = 0; k < arr.length; k += 4) s += ((arr[k] || 0) | ((arr[k + 1] || 0) << 1) | ((arr[k + 2] || 0) << 2) | ((arr[k + 3] || 0) << 3)).toString(16); return s; };
  function save() {
    W.floors.forEach((f, i) => { f.rev = enc(FL[i].rev); f.step = enc(FL[i].step); });
    db.worldSet('maze', W);
  }
  const idx = (fi, r, c) => r * GEO[fi].N + c;
  const inb = (fi, r, c) => r >= 0 && c >= 0 && r < GEO[fi].N && c < GEO[fi].N;
  const deep = (fi) => fi >= R.deepFrom;
  function reveal(fi, r, c) {
    const G = GEO[fi]; let n = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (deep(fi) && dr && dc) continue;
      const nr = r + dr, nc = c + dc; if (!inb(fi, nr, nc)) continue;
      const k = idx(fi, nr, nc); if (!FL[fi].rev[k]) { FL[fi].rev[k] = 1; if (G.g[nr][nc] !== '#') n++; }
    }
    return n;
  }
  function pct(fi) {
    const G = GEO[fi]; let n = 0;
    for (let r = 0; r < G.N; r++) for (let c = 0; c < G.N; c++) if (G.g[r][c] !== '#' && FL[fi].rev[idx(fi, r, c)]) n++;
    return Math.round((n / G.total) * 1000) / 10;
  }
  const overall = () => Math.round((W.floors.reduce((t, f, i) => t + (f.conquered ? 1 : f.opened ? 0.8 * Math.min(pct(i) / R.target, 1) : 0), 0) / W.floors.length) * 100);
  const frontier = () => W.floors.findIndex((f) => f.opened && !f.conquered);
  GEO.forEach((G, i) => { reveal(i, 1, 1); for (const k of W.floors[i].ways) { const a = k.split(','); reveal(i, +a[0], +a[1]); } });
  const pillarAt = (fi, r, c) => GEO[fi].pillars.findIndex((p) => p[0] === r && p[1] === c);

  // ── 층의 실시간 상태 (서버가 꺼지면 사라짐) ──
  const live = GEO.map(() => ({ mobs: {} }));
  const news = (text) => { const at = Date.now(); let id = 0; try { id = db.addChat('!', { dragonId: 0, name: '', kind: '', text, at }); } catch {} io.emit('system', { text, at, news: true, id }); };
  const notice = (text) => system(R.region, text); // 고대 유적에 있는 모두에게 (이야기 창)

  // ── 드래곤의 회랑 상태 ──
  const mz = (d) => { const c = logic.combatJson(d); if (!c.maze || typeof c.maze !== 'object') c.maze = {}; const m = c.maze; if (m.day !== dayIdx()) { m.day = dayIdx(); m.used = 0; } return m; };
  const opened = (d) => !!logic.combatJson(d).corridor;
  const inside = (d) => { const m = mz(d); return m.fi != null ? m : null; };
  const entryOf = (id) => online.get(id) || null;

  function guard(fi, pi) {
    const f = W.floors[fi], now = Date.now();
    let g = f.guard[pi];
    if (!g || (g.hp <= 0 && now - (g.deadAt || 0) >= R.guardRespawnMs)) { g = { hp: R.guardHits, hpMax: R.guardHits, deadAt: 0, f: [] }; f.guard[pi] = g; }
    return g;
  }
  const guardsDown = (fi) => GEO[fi].pillars.filter((p, pi) => guard(fi, pi).hp <= 0).length;
  const litLeft = (fi, pi) => Math.max(0, W.floors[fi].lit[pi] - Date.now());
  const sweep = (fi) => { const cut = Date.now() - R.mobIdleMs; for (const [k, m] of Object.entries(live[fi].mobs)) if (m.at < cut) delete live[fi].mobs[k]; };

  // 지금 층에 있는 드래곤 (접속 중이고 고대 유적에 있는 드래곤만)
  function hereOn(fi) {
    const out = [];
    for (const { dragon: d } of online.values()) {
      const m = inside(d);
      if (!m || m.fi !== fi || d.region !== R.region) continue;
      out.push({ id: d.id, name: d.name, kind: d.kind, level: d.level, av: d.has_avatar ? d.avatar_ver : 0, pos: m.pos, stuck: !!m.stuck, torch: m.torch });
    }
    return out;
  }
  function floorView(fi) {
    sweep(fi);
    const f = W.floors[fi], G = GEO[fi];
    return {
      fi, N: G.N, deep: deep(fi), pct: pct(fi), reached: f.reached, unsealed: !!f.unsealed, conquered: f.conquered, opened: !!f.opened,
      rev: enc(FL[fi].rev), step: enc(FL[fi].step), pits: f.pits, flags: f.flags, ways: f.ways,
      lit: f.lit.map((t) => Math.max(0, t - Date.now())),
      guards: G.pillars.map((p, pi) => { const g = guard(fi, pi); return { hp: g.hp, hpMax: g.hpMax, f: g.f.map((x) => x.name), lv: R.guardLv(fi) }; }),
      mobs: Object.fromEntries(Object.entries(live[fi].mobs).map(([k, m]) => [k, { lv: m.lv, hp: m.hp, hpMax: m.hpMax, f: m.f.map((x) => x.name) }])),
      here: hereOn(fi), overall: overall(), city: W.city,
    };
  }
  const broadcast = (fi) => io.to(room(fi)).emit('maze:floor', floorView(fi));

  // 들어갈 수 있는 곳
  function points(fi) {
    const G = GEO[fi], out = [{ key: '1,1', name: '입구', pos: [1, 1], kind: 'gate' }];
    let sn = 0;
    for (const k of W.floors[fi].ways) {
      const a = k.split(','), r = +a[0], c = +a[1];
      if (G.g[r][c] === 'P') out.push({ key: k, name: `${pillarAt(fi, r, c) + 1}번 기둥`, pos: [r, c], kind: 'pillar' });
      else { sn++; out.push({ key: k, name: `화톳불 ${sn}`, pos: [r, c], kind: 'fire' }); }
    }
    return out;
  }
  // 아직 밝히지 않은 곳에 가장 가까운 지점
  function bestPoint(fi) {
    const G = GEO[fi], N = G.N, pts = points(fi), dist = new Int32Array(N * N).fill(-1), q = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const k = idx(fi, r, c); if (!FL[fi].rev[k] || G.g[r][c] === '#') continue;
      if (D4.some((d) => inb(fi, r + d[0], c + d[1]) && !FL[fi].rev[idx(fi, r + d[0], c + d[1])])) { dist[k] = 0; q.push(k); }
    }
    for (let h = 0; h < q.length; h++) { const k = q[h], r = (k / N) | 0, c = k % N; for (const d of D4) { const rr = r + d[0], cc = c + d[1]; if (!inb(fi, rr, cc)) continue; const nk = idx(fi, rr, cc); if (dist[nk] < 0 && FL[fi].rev[nk] && G.g[rr][cc] !== '#') { dist[nk] = dist[k] + 1; q.push(nk); } } }
    let best = pts[0].key, bd = 1e9;
    for (const p of pts) { const dd = dist[idx(fi, p.pos[0], p.pos[1])]; if (dd >= 0 && dd < bd) { bd = dd; best = p.key; } }
    return best;
  }

  // 회랑 창에 보이는 것
  function homeView(d, fi) {
    const fr = frontier();
    if (fi == null || !W.floors[fi]?.opened) fi = fr >= 0 ? fr : W.floors.length - 1;
    const m = mz(d);
    return {
      open: opened(d), city: W.city, overall: overall(), frontier: fr, fi,
      floors: W.floors.map((f, i) => ({ i, N: GEO[i].N, opened: !!f.opened, conquered: f.conquered, pct: pct(i), guardsDown: guardsDown(i), deep: deep(i),
        fires: f.ways.filter((k) => { const a = k.split(','); return GEO[i].g[+a[0]][+a[1]] === 'F'; }).length, pioneers: f.pioneers })),
      me: { fi: m.fi ?? null, used: m.used || 0, max: R.entries, torch: m.torch || 0 },
      points: points(fi), best: bestPoint(fi), rev: enc(FL[fi].rev), rows: GEO[fi].rows, lockedText: '회랑 입구는 오르딘이 지키고 있다. 먼저 그에게 말을 걸어야 한다.',
      here: hereOn(fi).length,
    };
  }
  const meView = (d) => { const m = mz(d); return { open: opened(d), fi: m.fi ?? null, torch: m.torch || 0, used: m.used || 0, max: R.entries, floor: frontier() + 1, overall: overall(), city: W.city }; };

  // ── 층 떠나기 ──
  function leave(d, fi) {
    const m = mz(d);
    if (m.fi == null) return;
    const e = entryOf(d.id); if (e) e.socket.leave(room(fi));
    m.fi = null; m.pos = null; m.torch = 0; m.stuck = false; m.healed = false;
  }
  function knockOut(d, fi, by) {
    leave(d, fi);
    db.saveState(d);
    death.fall(d, by);
    news(`${ga(d.name)} 지하 회랑 제 ${fi + 1}층에서 쓰러져 밖으로 실려 나갔다.`);
  }

  // 반나절마다: 깊은 층의 회랑이 무너진다
  function collapse(fi) {
    const G = GEO[fi], N = G.N, f = W.floors[fi], keep = new Set([...f.ways, '1,1']);
    let done = 0;
    for (let t = 0; t < 400 && done < R.collapse.spots; t++) {
      const r = 1 + Math.floor(Math.random() * (N - 2)), c = 1 + Math.floor(Math.random() * (N - 2));
      if (G.g[r][c] === '#' || !FL[fi].step[idx(fi, r, c)]) continue;
      for (let a = -R.collapse.radius; a <= R.collapse.radius; a++) for (let b = -R.collapse.radius; b <= R.collapse.radius; b++) {
        const rr = r + a, cc = c + b; if (rr <= 0 || cc <= 0 || rr >= N - 1 || cc >= N - 1 || keep.has(`${rr},${cc}`)) continue;
        const k = idx(fi, rr, cc); FL[fi].rev[k] = 0; FL[fi].step[k] = 0;
      }
      done++;
    }
    for (const k of f.ways) { const a = k.split(','); reveal(fi, +a[0], +a[1]); } reveal(fi, 1, 1);
    for (const h of hereOn(fi)) reveal(fi, h.pos[0], h.pos[1]); // 지금 안에 있는 드래곤 자리는 보이게
    if (done) notice(`지하 회랑 제 ${fi + 1}층의 회랑 ${done}곳이 무너져 다시 어둠에 묻혔다.`);
  }
  const ticker = setInterval(() => {
    let changed = false;
    const h = halfIdx();
    if (W.half !== h) { W.half = h; W.floors.forEach((f, i) => { if (deep(i) && f.opened && !f.conquered) { collapse(i); changed = true; } }); }
    for (let i = 0; i < GEO.length; i++) { const before = Object.keys(live[i].mobs).length; sweep(i); if (before !== Object.keys(live[i].mobs).length || changed) broadcast(i); }
    if (changed) save();
  }, 60000);
  ticker.unref?.();

  // ── 행동 ──
  const err = (text) => ({ error: text });
  function ready(d) {
    if (d.region !== R.region) { const m = inside(d); if (m) { leave(d, m.fi); db.saveState(d); } return err('지하 회랑은 고대 유적에 있다.'); }
    if (d.exp_end) return err('원정을 떠나 있는 동안에는 들어갈 수 없다.');
    if (logic.isFallen(d)) return err('쓰러져 있다. 먼저 일어서야 한다.');
    return null;
  }
  function enter(d, fi, key) {
    const e0 = ready(d); if (e0) return e0;
    if (!opened(d)) return err('회랑 입구는 오르딘이 지키고 있다. 먼저 그에게 말을 걸어야 한다.');
    if (W.city) return err('모든 회랑이 밝혀졌다. 이제 이 길은 고대도시로 곧장 이어진다.');
    fi = Number(fi); const f = W.floors[fi];
    if (!f || !f.opened) return err('아직 열리지 않은 층이다.');
    const m = mz(d);
    if (m.fi != null) return err('이미 회랑 안에 있다.');
    if ((m.used || 0) >= R.entries) return err(`오늘은 더 들어갈 수 없다. (하루 ${R.entries}번)`);
    const pt = points(fi).find((p) => p.key === key) || points(fi)[0];
    m.used = (m.used || 0) + 1; m.fi = fi; m.pos = pt.pos.slice(); m.torch = R.torch; m.stuck = false; m.healed = false; m.pity = 0;
    reveal(fi, pt.pos[0], pt.pos[1]);
    const e = entryOf(d.id); if (e) e.socket.join(room(fi));
    notice(`${ga(d.name)} ${pt.name}에서 지하 회랑 제 ${fi + 1}층에 들어왔다.`);
    return { ok: true, lines: [`${pt.name}에서 횃불 ${R.torch}걸음을 들고 내려섰다.`], floor: floorView(fi), rows: GEO[fi].rows };
  }
  function canStep(fi, m, r, c) {
    const G = GEO[fi];
    if (Math.abs(r - m.pos[0]) + Math.abs(c - m.pos[1]) !== 1) return false;
    if (!inb(fi, r, c) || G.g[r][c] === '#' || !FL[fi].rev[idx(fi, r, c)]) return false;
    return true;
  }
  const stepCost = (fi, r, c) => (FL[fi].step[idx(fi, r, c)] ? R.stepOld : R.stepNew);
  const gapOf = (d, lv) => lv - (d.level || 1);
  // 함께 싸운 드래곤 모두에게 보상
  function reward(d, fi, target, boss) {
    const f = W.floors[fi], lines = [];
    for (const x of target.f) {
      const e = entryOf(x.id); if (!e) continue;
      const p = e.dragon, lv = boss ? R.guardLv(fi) : target.lv;
      const xp = logic.xpOf(p, Math.round(R.xp(lv, gapOf(p, lv), boss) * (f.conquered ? R.conqueredXp : 1)));
      const up = logic.gainXp(p, xp);
      const items = [];
      if (boss && Math.random() < R.scarDrop) {
        items.push({ id: 'scar_tonic', qty: 1 });
        news(`${ga(p.name)} 지하 회랑 수호자의 발치에서 ${eul(ITEMS.scar_tonic.name)} 찾았다.`);
      }
      if (Math.random() < (boss ? R.rare.guard : R.rare.mob)) {
        const id = R.rare.pool[Math.floor(Math.random() * R.rare.pool.length)];
        items.push({ id, qty: 1 });
        news(`${ga(p.name)} 지하 회랑에서 ${eul(ITEMS[id].name)} 찾았다.`);
      }
      db.saveState(p, items);
      if (p.id !== d.id) { sendMe(e.socket, p); e.socket.emit('notice', { title: '지하 회랑', lines: [`${boss ? '수호자' : '파수꾼'}가 무너졌다. 경험치 +${xp}${up ? ' · 레벨이 올랐다!' : ''}`, ...items.map((it) => `${eul(ITEMS[it.id].name)} 찾았다!`)] }); }
      else lines.push(`경험치 +${xp}${up ? ' · 레벨이 올랐다!' : ''}`, ...items.map((it) => `${eul(ITEMS[it.id].name)} 찾았다!`));
    }
    return lines;
  }
  function move(d, r, c) {
    const e0 = ready(d); if (e0) return e0;
    const m = inside(d); if (!m) return err('회랑 안에 있지 않다.');
    const fi = m.fi, G = GEO[fi], f = W.floors[fi];
    r = Number(r); c = Number(c);
    if (m.stuck) return err('구덩이에 갇혀 있다. 누가 끌어올려 주거나, 혼자 기어 나와야 한다.');
    if (!canStep(fi, m, r, c)) return err('그리로는 갈 수 없다.');
    const cost = stepCost(fi, r, c);
    if (m.torch < cost) return err('횃불이 다 탔다. 더 나아갈 수 없다.');
    const lines = [];
    // 파수꾼·수호자 곁을 빠져나오면 등 뒤를 맞는다
    const fromKey = `${m.pos[0]},${m.pos[1]}`, fromMob = live[fi].mobs[fromKey], fpi = G.g[m.pos[0]][m.pos[1]] === 'P' ? pillarAt(fi, m.pos[0], m.pos[1]) : -1;
    const hitLv = fromMob ? fromMob.lv : fpi >= 0 && guard(fi, fpi).hp > 0 ? R.guardLv(fi) : 0;
    if (hitLv) { const dmg = R.passDmg(logic.hpCap(d), gapOf(d, hitLv)); d.hp = Math.max(0, d.hp - dmg); lines.push(`물러서는 등 뒤로 ${fromMob ? '파수꾼' : '수호자'}의 돌팔이 날아들었다. 체력 −${dmg}.`); }
    m.torch = Math.round((m.torch - cost) * 2) / 2; m.pos = [r, c];
    const k = idx(fi, r, c), key = `${r},${c}`, ch = G.g[r][c], wasNew = !FL[fi].step[k];
    FL[fi].step[k] = 1; reveal(fi, r, c);
    if (d.hp <= 0) { knockOut(d, fi, fromMob ? '돌 파수꾼' : '기둥 수호자'); broadcast(fi); save(); return { ok: true, lines: [...lines, '체력이 다해 쓰러졌다. 유적 밖으로 실려 나갔다.'], out: true }; }
    const mob = live[fi].mobs[key];
    if (mob) lines.push(`${mob.f.length ? mob.f.map((x) => x.name).join(', ') + ' 곁에 내려앉았다.' : `Lv ${mob.lv} 돌 파수꾼 앞에 섰다.`}`);
    else if (ch === 'T' && !f.pits.includes(key)) { f.pits.push(key); m.stuck = true; d.hp = Math.max(0, d.hp - R.pit); lines.push(`돌판이 꺼지며 아래로 떨어졌다. 체력 −${R.pit}. 다른 드래곤이 옆 칸까지 와야 끌어올릴 수 있다.`); notice(`${ga(d.name)} 제 ${fi + 1}층의 구덩이에 빠졌다. 누가 끌어올려 줘야 한다.`); if (d.hp <= 0) { knockOut(d, fi, null); broadcast(fi); save(); return { ok: true, lines: [...lines, '체력이 다해 쓰러졌다.'], out: true }; } }
    else if (ch === 'T') lines.push('이미 무너진 자리다. 가장자리를 밟고 조심히 지나간다.');
    else if (ch === 'F') { if (!f.ways.includes(key)) { f.ways.push(key); lines.push('옛 화톳불 자리를 찾았다. 재 속에 아직 온기가 남아 있다. 이제 여기서 바로 들어올 수 있다.'); notice(`${ga(d.name)} 제 ${fi + 1}층에서 새 화톳불 자리를 찾았다.`); } else lines.push('이미 찾아 둔 화톳불 자리다. 불 곁에서 상처를 돌볼 수 있다.'); }
    else if (ch === 'P') { const pi = pillarAt(fi, r, c), g = guard(fi, pi); lines.push(g.hp > 0 ? `${pi + 1}번 기둥 앞을 Lv ${R.guardLv(fi)} 수호자가 막고 있다. 쓰러뜨려야 불을 붙일 수 있다.` : litLeft(fi, pi) > 0 ? `${pi + 1}번 기둥이 타오르고 있다. ${Math.ceil(litLeft(fi, pi) / 60000)}분 남았다.` : `수호자가 무너진 ${pi + 1}번 기둥이다. 불을 붙일 수 있다.`); }
    else if (ch === 'E') {
      if (f.unsealed) { const r2 = conquer(d, fi); db.saveState(d); return r2; }
      lines.push(`아래로 가는 계단을 룬 사슬이 막고 있다. 지도 ${R.target}%, 네 수호자, 네 기둥의 불이 함께 맞아야 풀린다.`);
    } else if (ch === 'S') lines.push('위층으로 이어지는 좁은 계단이다.');
    else {
      const cnt = Object.keys(live[fi].mobs).length;
      let chance = (wasNew ? R.enc.fresh : R.enc.old) + (m.pity || 0) * R.enc.pity;
      if (f.conquered) chance *= R.enc.conqueredMul;
      if (cnt < R.enc.max && (Math.random() < chance || ((m.pity || 0) >= R.enc.guarantee && !f.conquered))) {
        m.pity = 0;
        const lv = Math.max(R.mobLv.lo, Math.min(R.mobLv.hi, (d.level || 1) + fi + Math.floor(Math.random() * 3) - 1)), hp = R.mobHits(lv);
        live[fi].mobs[key] = { lv, hp, hpMax: hp, f: [], at: Date.now() };
        lines.push(`무너진 돌 틈에서 Lv ${lv} 돌 파수꾼이 몸을 일으켰다.`);
      } else { m.pity = (m.pity || 0) + 1; lines.push(deep(fi) ? '어둠이 짙어 바로 옆만 겨우 보인다.' : '무너진 회랑을 걷는다.'); }
    }
    if (m.torch < 0.5) lines.push('횃불이 다 탔다. 더 나아갈 수 없다. 이제 밖으로 나가야 한다.');
    checkSeal(fi);
    save(); broadcast(fi);
    return { ok: true, lines };
  }
  function attack(d) {
    const e0 = ready(d); if (e0) return e0;
    const m = inside(d); if (!m) return err('회랑 안에 있지 않다.');
    const fi = m.fi, G = GEO[fi], f = W.floors[fi], key = `${m.pos[0]},${m.pos[1]}`;
    if (m.stuck) return err('구덩이에 갇혀 있다.');
    if (d.hp < R.fightHp) return err(`체력이 ${R.fightHp} 아래라 맞설 수 없다.`);
    if (m.torch < R.atk) return err('횃불이 모자라 칠 수 없다.');
    const mob = live[fi].mobs[key], pi = G.g[m.pos[0]][m.pos[1]] === 'P' ? pillarAt(fi, m.pos[0], m.pos[1]) : -1;
    const g = pi >= 0 ? guard(fi, pi) : null;
    const target = mob || (g && g.hp > 0 ? g : null);
    if (!target) return err('여기에는 칠 상대가 없다.');
    const boss = !mob, lv = boss ? R.guardLv(fi) : mob.lv;
    m.torch -= R.atk;
    if (!target.f.some((x) => x.id === d.id)) target.f.push({ id: d.id, name: d.name });
    target.hp -= 1; if (mob) mob.at = Date.now(); else f.contrib[d.id] = dayIdx();
    const dmg = R.counter(gapOf(d, lv)); d.hp = Math.max(0, d.hp - dmg);
    const lines = [`일격을 넣었다. 횃불 −${R.atk}, 반격에 체력 −${dmg}.`];
    if (target.hp <= 0) {
      const names = target.f.map((x) => x.name).join(', ');
      if (mob) { delete live[fi].mobs[key]; lines.push(`돌 파수꾼이 돌무더기로 무너졌다. 함께 싸운 ${names} 모두 처치에 이름을 올렸다.`); }
      else { g.deadAt = Date.now(); lines.push(`${pi + 1}번 기둥의 수호자가 무릎을 꿇고 돌로 굳었다. 하루 동안 이 기둥에 불을 붙일 수 있다.`); notice(`${ga(d.name)} 제 ${fi + 1}층 ${pi + 1}번 기둥의 수호자를 쓰러뜨렸다. (함께한 이: ${names})`); }
      lines.push(...reward(d, fi, target, boss));
    }
    if (d.hp <= 0) { knockOut(d, fi, boss ? '기둥 수호자' : '돌 파수꾼'); broadcast(fi); save(); return { ok: true, lines: [...lines, '체력이 다해 쓰러졌다. 유적 밖으로 실려 나갔다.'], out: true }; }
    else if (d.hp < R.fightHp) lines.push(`체력이 ${R.fightHp} 아래로 떨어졌다. 물러나야 한다.`);
    if (m.torch < 0.5) lines.push('횃불이 다 탔다. 더 나아갈 수 없다.');
    save(); broadcast(fi);
    return { ok: true, lines };
  }
  function light(d) {
    const e0 = ready(d); if (e0) return e0;
    const m = inside(d); if (!m) return err('회랑 안에 있지 않다.');
    const fi = m.fi, G = GEO[fi], f = W.floors[fi];
    const pi = G.g[m.pos[0]][m.pos[1]] === 'P' ? pillarAt(fi, m.pos[0], m.pos[1]) : -1;
    if (pi < 0) return err('기둥이 있는 칸이 아니다.');
    if (m.stuck) return err('구덩이에 갇혀 있다.');
    if (guard(fi, pi).hp > 0) return err('수호자가 기둥을 막고 있다.');
    if (litLeft(fi, pi) > 0) return err('이미 타오르고 있다.');
    if (m.torch < R.lightCost) return err('횃불이 모자란다.');
    m.torch -= R.lightCost; f.lit[pi] = Date.now() + R.pillarMs; f.contrib[d.id] = dayIdx();
    const key = `${m.pos[0]},${m.pos[1]}`; if (!f.ways.includes(key)) f.ways.push(key);
    const lines = [`${pi + 1}번 기둥에 불을 붙였다. ${Math.round(R.pillarMs / 60000)}분 동안 타오른다.`];
    notice(`${ga(d.name)} 제 ${fi + 1}층 ${pi + 1}번 기둥에 불을 붙였다. ${Math.round(R.pillarMs / 60000)}분 동안 타오른다. (${f.lit.filter((t) => t > Date.now()).length}/4)`);
    lines.push(...checkSeal(fi));
    save(); broadcast(fi);
    return { ok: true, lines };
  }
  function checkSeal(fi) {
    const f = W.floors[fi];
    if (pct(fi) >= R.target && !f.reached) { f.reached = true; notice(`제 ${fi + 1}층의 지도가 ${R.target}% 밝혀졌다.`); }
    if (f.unsealed) return [];
    if (!f.reached || guardsDown(fi) < 4 || f.lit.some((t) => t <= Date.now())) return [];
    f.unsealed = true;
    news(`지하 회랑 제 ${fi + 1}층 계단의 봉인이 풀렸다. 계단을 밟으면 다음 층이 열린다.`);
    return ['네 기둥이 한꺼번에 타오르자 계단의 룬 사슬이 끊어졌다. 봉인이 풀렸다.'];
  }
  function conquer(d, fi) {
    const f = W.floors[fi], day = dayIdx();
    const ids = Object.entries(f.contrib).filter(([, dd]) => day - dd <= 1).map(([id]) => Number(id));
    if (!ids.includes(d.id)) ids.push(d.id);
    f.conquered = true; f.pioneers = [];
    for (const id of ids) {
      const e = entryOf(id); const p = e ? e.dragon : db.getDragon(id); if (!p) continue;
      f.pioneers.push(p.name);
      logic.traitCount(p, `mazef${fi + 1}`);
      if (fi + 1 === W.floors.length) logic.traitCount(p, 'mazecity');
      logic.chron(p, 'mark', `지하 회랑 제 ${fi + 1}층의 봉인을 함께 풀었다.`);
      if (p.id !== d.id) { db.saveState(p); if (e) sendMe(e.socket, p); }
    }
    const lines = ['어둠 속으로 계단이 이어진다. 가장 먼저 발을 디뎠다.'];
    for (const h of hereOn(fi)) { const e = entryOf(h.id); if (e) { leave(e.dragon, fi); if (e.dragon.id !== d.id) { db.saveState(e.dragon); sendMe(e.socket, e.dragon); e.socket.emit('maze:end', { fi, lines: [`${ga(d.name)} 제 ${fi + 1}층 계단을 내려갔다. 층이 정복되어 밖으로 나왔다.`] }); } } }
    if (fi + 1 < W.floors.length) { W.floors[fi + 1].opened = Date.now(); news(`${ga(d.name)} 지하 회랑 제 ${fi + 1}층 계단을 가장 먼저 내려갔다. 제 ${fi + 2}층이 열렸다. (개척자: ${f.pioneers.join(', ')})`); }
    else { W.city = true; news(`지하 회랑의 일곱 층이 모두 밝혀졌다. 고대도시로 가는 길이 열렸다. (문을 연 이: ${f.pioneers.join(', ')})`); }
    live[fi].mobs = {};
    save(); broadcast(fi);
    return { ok: true, lines, out: true, conquered: fi + 1 };
  }
  function heal(d) {
    const e0 = ready(d); if (e0) return e0;
    const m = inside(d); if (!m) return err('회랑 안에 있지 않다.');
    const fi = m.fi, key = `${m.pos[0]},${m.pos[1]}`;
    if (GEO[fi].g[m.pos[0]][m.pos[1]] !== 'F' || !W.floors[fi].ways.includes(key)) return err('찾아 둔 화톳불 자리에서만 상처를 돌볼 수 있다.');
    if (m.healed) return err('이번에 들어와서는 이미 상처를 돌봤다.');
    if (m.torch < R.healCost) return err('횃불이 모자란다.');
    const cap = logic.hpCap(d), add = Math.min(cap - d.hp, Math.round(cap * R.heal));
    if (add <= 0) return err('돌볼 상처가 없다.');
    m.torch -= R.healCost; m.healed = true; d.hp += add;
    return { ok: true, lines: [`화톳불 곁에 앉아 상처를 돌봤다. 체력 +${add}.`] };
  }
  function rescue(d, id) {
    const e0 = ready(d); if (e0) return e0;
    const m = inside(d); if (!m) return err('회랑 안에 있지 않다.');
    if (m.stuck) return err('나도 갇혀 있다.');
    if (m.torch < R.rescueCost) return err('횃불이 모자란다.');
    const e = entryOf(Number(id)); const v = e && inside(e.dragon);
    if (!v || v.fi !== m.fi || !v.stuck) return err('그 드래곤은 여기 갇혀 있지 않다.');
    if (Math.abs(v.pos[0] - m.pos[0]) + Math.abs(v.pos[1] - m.pos[1]) > 1) return err('옆 칸까지 가야 끌어올릴 수 있다.');
    m.torch -= R.rescueCost; v.stuck = false;
    db.saveState(e.dragon); sendMe(e.socket, e.dragon); e.socket.emit('notice', { title: '지하 회랑', lines: [`${ga(d.name)} 구덩이에서 끌어올려 주었다.`] });
    notice(`${ga(d.name)} ${eul(e.dragon.name)} 구덩이에서 끌어올렸다.`);
    broadcast(m.fi);
    return { ok: true, lines: [`${eul(e.dragon.name)} 발톱으로 붙잡아 끌어올렸다.`] };
  }
  function climb(d) {
    const m = inside(d); if (!m) return err('회랑 안에 있지 않다.');
    if (!m.stuck) return err('갇혀 있지 않다.');
    m.stuck = false; m.torch = 0;
    broadcast(m.fi);
    return { ok: true, lines: ['남은 횃불을 모두 태워 가며 벽을 기어올랐다. 횃불은 다 탔다. 이제 밖으로 나가야 한다.'] };
  }
  function flag(d) {
    const m = inside(d); if (!m) return err('회랑 안에 있지 않다.');
    const f = W.floors[m.fi], key = `${m.pos[0]},${m.pos[1]}`;
    if (f.flags[key] === d.name) delete f.flags[key]; else f.flags[key] = d.name;
    save(); broadcast(m.fi);
    return { ok: true, lines: [f.flags[key] ? '이 자리에 표식을 남겼다. 다른 드래곤의 지도에도 보인다.' : '표식을 거두었다.'] };
  }
  function out(d) {
    const m = inside(d); if (!m) return err('회랑 안에 있지 않다.');
    const fi = m.fi; leave(d, fi);
    broadcast(fi);
    return { ok: true, lines: ['횃불을 끄고 유적 밖으로 나왔다.'], out: true };
  }

  // ── 소켓 ──
  function bind(socket, entry) {
    const handle = (event, fn) => socket.on(event, (p, ack) => {
      if (typeof ack !== 'function') return;
      const e = entry(); if (!e) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
      const d = e.dragon; logic.regen(d);
      const res = fn(d, p || {});
      if (res.error) return ack(res);
      db.saveState(d); sendMe(socket, d);
      const m = inside(d); // 움직인 사람에게는 바뀐 층 모습을 바로 돌려줌
      ack({ ...res, me: meView(d), floor: res.floor || (m ? floorView(m.fi) : null), rows: res.rows || (m ? GEO[m.fi].rows : null) });
    });
    handle('maze:get', (d, p) => ({ ok: true, view: homeView(d, p.fi), floor: inside(d) ? floorView(inside(d).fi) : null, rows: inside(d) ? GEO[inside(d).fi].rows : null }));
    handle('maze:enter', (d, p) => enter(d, p.fi, String(p.point || '')));
    handle('maze:move', (d, p) => move(d, p.r, p.c));
    handle('maze:attack', (d) => attack(d));
    handle('maze:light', (d) => light(d));
    handle('maze:heal', (d) => heal(d));
    handle('maze:rescue', (d, p) => rescue(d, p.id));
    handle('maze:climb', (d) => climb(d));
    handle('maze:flag', (d) => flag(d));
    handle('maze:leave', (d) => out(d));
  }
  // 접속할 때: 안에 있던 드래곤은 방에 다시 들어온다
  function onEnter(socket, d) { const m = inside(d); if (m && W.floors[m.fi]) { socket.join(room(m.fi)); broadcast(m.fi); } }

  return { RULES: R, meView, bind, onEnter, forClient: () => ({ torch: R.torch, entries: R.entries, atk: R.atk, fightHp: R.fightHp, target: R.target, sight: R.sight, sizes: R.sizes, pillarMin: Math.round(R.pillarMs / 60000) }) };
};
module.exports.MAZE_RULES = MAZE_RULES;
module.exports.genFloor = genFloor;
