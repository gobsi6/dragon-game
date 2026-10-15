// 용의 대륙 — 1단계 서버
// 계정, 드래곤 생성, 지역 이동, 지역 채팅
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');

const db = require('./db');
const {
  KINDS, REGIONS, STANCES, STATS, CREATION, derive, ITEMS, CREATURES, RULES, SLOTS, RECIPES, SHOPS, repTier, TRADE, NEST,
} = require('./game-data');
const logic = require('./game-logic');

const PORT = process.env.PORT || 3000;
const MOVE_COOLDOWN = 1500; // ms, 연속 이동 방지
const CHAT_COOLDOWN = 700;  // ms, 도배 방지
const CHAT_MAX = 200;       // 글자 수
const HISTORY = 30;         // 지역에 들어갈 때 보여줄 지난 대화 수
const AVATAR_MAX = 400000;  // 프로필 그림 최대 크기 (base64 글자 수, 약 300KB)
const AVATAR_COOLDOWN = 5000;

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server);

// ── 도우미 ─────────────────────────────────────────

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// 받침 유무에 따라 조사 고르기: josa('라엘', '이', '가') → '이'
function josa(word, withBatchim, without) {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return `${withBatchim}(${without})`;
  return (c - 0xac00) % 28 ? withBatchim : without;
}

// ── 계정 (REST) ────────────────────────────────────

app.post('/api/register', (req, res) => {
  const username = str(req.body?.username);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!/^[가-힣A-Za-z0-9_]{2,16}$/.test(username)) {
    return res.status(400).json({ error: '아이디는 한글, 영문, 숫자, _로 2~16자까지 쓸 수 있다.' });
  }
  if (password.length < 4 || password.length > 64) {
    return res.status(400).json({ error: '비밀번호는 4~64자로 정해야 한다.' });
  }
  if (db.getUserByName(username)) {
    return res.status(409).json({ error: '이미 있는 아이디다. 다른 아이디를 골라야 한다.' });
  }
  const isGm = db.countUsers() === 0; // 처음 만든 계정이 GM
  const userId = db.createUser(username, bcrypt.hashSync(password, 10), isGm);
  const token = crypto.randomBytes(24).toString('hex');
  db.createSession(token, userId);
  res.json({ token });
});

app.post('/api/login', (req, res) => {
  const username = str(req.body?.username);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = db.getUserByName(username);
  if (!user || !bcrypt.compareSync(password, user.pw_hash)) {
    return res.status(401).json({ error: '아이디나 비밀번호가 맞지 않는다.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  db.createSession(token, user.id);
  res.json({ token });
});

// 프로필 그림. 주소 끝의 ?v=버전 덕분에 그림을 바꾸면 새로 받아집니다.
app.get('/avatar/:id', (req, res) => {
  const row = db.getAvatar(Number(req.params.id));
  if (!row || !row.avatar) return res.status(404).end();
  res.set('Content-Type', row.avatar_type);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(row.avatar);
});

app.post('/api/logout', (req, res) => {
  const token = str(req.body?.token);
  if (token) db.deleteSession(token);
  res.json({ ok: true });
});

// ── 접속 중인 드래곤 ────────────────────────────────

// dragonId → { socket, dragon: { id, name, kind, region } }
const online = new Map();

// av: 그림 버전. 0이면 그림이 없어서 종류별 문양을 보여줌
// away: 원정을 떠나 자리를 비운 상태
const publicDragon = (d) => ({
  id: d.id, name: d.name, kind: d.kind, av: d.has_avatar ? d.avatar_ver : 0, away: !!d.exp_end, resting: !!d.rest_at,
});

// 내 드래곤의 전체 정보 (나에게만 보냄)
const meOf = (d) => ({
  ...publicDragon(d),
  level: d.level, xp: d.xp, xpMax: d.level * 100,
  hp: d.hp, hpMax: logic.hpCap(d), en: d.en, enMax: logic.enCap(d),
  ap: d.ap, apMax: d.ap_max, gold: d.gold,
  stats: logic.statsOf(d),                 // 장신구까지 더한 값
  statBonus: logic.bonusOf(d).stats,       // 그중 장신구 몫
  equip: logic.equipOf(d),
  stance: d.stance, stanceName: STANCES[d.stance] || '',
  apAt: d.ap_at,
  enAt: d.en_at,
  rep: Object.fromEntries(Object.keys(SHOPS).map((r) => {
    const v = logic.repOf(d)[r] || 0;
    return [r, { value: v, name: repTier(v) }];
  })),
  stanceAt: d.stance_at || 0,
  nest: d.nest || null,
  restAt: d.rest_at || null,
  hoardGold: d.hoard_gold || 0,
  exp: d.exp_end ? { region: d.exp_region, start: d.exp_start, end: d.exp_end } : null,
});

// 회복을 계산한 뒤 내 정보를 보냄
function sendMe(socket, d) {
  logic.regen(d);
  socket.emit('me', meOf(d));
}

function occupants(region) {
  const list = [];
  for (const { dragon } of online.values()) {
    if (dragon.region === region) list.push(publicDragon(dragon));
  }
  return list;
}

function broadcastPresence(region) {
  io.to(region).emit('presence', { region, occupants: occupants(region) });
}

function broadcastCounts() {
  const counts = {};
  for (const { dragon } of online.values()) {
    counts[dragon.region] = (counts[dragon.region] || 0) + 1;
  }
  io.emit('world:counts', counts);
}

// 지역 안내 문구. except를 넘기면 그 소켓에게는 보내지 않음
function system(region, text, except) {
  (except ? except.to(region) : io.to(region)).emit('system', { text, at: Date.now() });
}

function sendRegionState(socket, dragon) {
  socket.emit('region:state', {
    region: dragon.region,
    occupants: occupants(dragon.region),
    history: db.recentChat(dragon.region, HISTORY),
  });
}

function enterWorld(socket, dragon) {
  const prev = online.get(dragon.id);
  if (prev && prev.socket.id !== socket.id) {
    // 같은 드래곤으로 다른 창에서 접속하면 이전 창을 끊음
    prev.socket.data.kicked = true;
    prev.socket.emit('kicked');
    prev.socket.disconnect(true);
  }
  socket.data.dragonId = dragon.id;
  logic.regen(dragon);
  online.set(dragon.id, { socket, dragon });
  socket.join(dragon.region);
  db.touch(dragon.id);

  if (!prev) {
    system(dragon.region, `${dragon.name}${josa(dragon.name, '이', '가')} 이곳에 모습을 드러냈다.`, socket);
  }
  sendRegionState(socket, dragon);
  broadcastPresence(dragon.region);
  broadcastCounts();
}

function entryOf(socket) {
  const entry = online.get(socket.data.dragonId);
  return entry && entry.socket === socket ? entry : null;
}

// ── 실시간 (Socket.IO) ─────────────────────────────

io.use((socket, next) => {
  const user = db.getSessionUser(str(socket.handshake.auth?.token));
  if (!user) return next(new Error('auth'));
  socket.data.user = user;
  next();
});

io.on('connection', (socket) => {
  const user = socket.data.user;
  const dragon = db.getDragonByUser(user.id);

  socket.emit('init', {
    me: { username: user.username, isGm: !!user.is_gm },
    dragon: dragon ? (logic.regen(dragon), meOf(dragon)) : null,
    kinds: KINDS,
    regions: REGIONS,
    stats: STATS,
    creation: CREATION,
    items: ITEMS,
    huntable: Object.keys(CREATURES),
    rules: { cost: RULES.cost, apEvery: RULES.apEvery, enEvery: RULES.enEvery, expeditionMinutes: RULES.expeditionMinutes },
    slots: SLOTS,
    recipes: RECIPES,
    shops: Object.keys(SHOPS),
    trade: TRADE,
    nestRules: NEST,
  });
  if (dragon) enterWorld(socket, dragon);

  socket.on('dragon:create', (payload, ack) => {
    if (typeof ack !== 'function') return;
    if (db.getDragonByUser(user.id)) return ack({ error: '이미 드래곤이 있다.' });

    const name = str(payload?.name);
    const kind = str(payload?.kind);
    if (!/^[가-힣A-Za-z0-9]{2,12}$/.test(name)) {
      return ack({ error: '이름은 한글, 영문, 숫자로 2~12자까지 쓸 수 있다.' });
    }
    if (!KINDS[kind]) return ack({ error: '드래곤 종류를 골라야 한다.' });
    if (db.dragonNameTaken(name)) return ack({ error: '이미 대륙에 같은 이름의 드래곤이 있다.' });

    // 자유 포인트 검사: 정수, 0~perStat, 합이 정확히 points
    const alloc = payload?.alloc || {};
    let spent = 0;
    const final = {};
    for (const { key } of STATS) {
      const v = alloc[key] ?? 0;
      if (!Number.isInteger(v) || v < 0 || v > CREATION.perStat) {
        return ack({ error: `한 능력치에는 0~${CREATION.perStat}점까지 넣을 수 있다.` });
      }
      spent += v;
      final[key] = KINDS[kind].stats[key] + v;
    }
    if (spent !== CREATION.points) {
      return ack({ error: `능력치 포인트 ${CREATION.points}점을 모두 나눠야 한다.` });
    }

    const { hpMax, enMax } = derive(final);
    const created = db.createDragon(user.id, name, kind, KINDS[kind].home, final, hpMax, enMax);
    ack({ ok: true, dragon: meOf(created) });
    enterWorld(socket, created);
  });

  socket.on('move', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });

    const d = entry.dragon;
    if (d.exp_end) return ack({ error: '원정을 떠나 있는 동안에는 날아갈 수 없다.' });
    if (d.rest_at) return ack({ error: '둥지에서 쉬는 중이다. 먼저 깨어나야 한다.' });
    const from = d.region;
    const to = str(payload?.to);
    if (!REGIONS[to]) return ack({ error: '없는 지역이다.' });
    if (!REGIONS[from].links.includes(to)) return ack({ error: '그곳은 여기서 바로 날아갈 수 없다.' });

    const now = Date.now();
    if (now - (socket.data.lastMove || 0) < MOVE_COOLDOWN) {
      return ack({ error: '날개를 잠깐 쉬고 다시 날아야 한다.' });
    }
    socket.data.lastMove = now;

    const ga = josa(d.name, '이', '가');
    socket.leave(from);
    d.region = to;
    db.setRegion(d.id, to);
    system(from, `${d.name}${ga} ${REGIONS[to].name} 쪽으로 날아갔다.`);
    socket.join(to);
    system(to, `${d.name}${ga} ${REGIONS[from].name} 쪽에서 날아왔다.`, socket);

    broadcastPresence(from);
    broadcastPresence(to);
    broadcastCounts();
    sendRegionState(socket, d);
    ack({ ok: true });
  });

  socket.on('dragon:avatar', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });

    const m = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(str(payload?.dataUrl));
    if (!m) return ack({ error: '그림 파일을 읽지 못했다. 다른 그림으로 해 보자.' });
    if (m[2].length > AVATAR_MAX) return ack({ error: '그림이 너무 크다.' });

    const now = Date.now();
    if (now - (socket.data.lastAvatar || 0) < AVATAR_COOLDOWN) {
      return ack({ error: '그림은 잠시 뒤에 다시 바꿀 수 있다.' });
    }
    socket.data.lastAvatar = now;

    const d = entry.dragon;
    d.avatar_ver = db.setAvatar(d.id, Buffer.from(m[2], 'base64'), `image/${m[1]}`);
    d.has_avatar = 1;
    socket.emit('me', meOf(d));
    broadcastPresence(d.region);
    ack({ ok: true });
  });

  socket.on('dragon:avatar:delete', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const d = entry.dragon;
    if (!d.has_avatar) return ack({ ok: true });
    d.avatar_ver = db.clearAvatar(d.id);
    d.has_avatar = 0;
    socket.emit('me', meOf(d));
    broadcastPresence(d.region);
    ack({ ok: true });
  });

  // ── 단발 행동: 탐사·채집·사냥 ──
  const ACTIONS = { explore: logic.explore, gather: logic.gather, hunt: logic.hunt };
  socket.on('act', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const fn = ACTIONS[str(payload?.type)];
    if (!fn) return ack({ error: '알 수 없는 행동이다.' });

    const now = Date.now();
    if (now - (socket.data.lastAct || 0) < 400) return ack({ error: '숨을 고르는 중이다.' });
    socket.data.lastAct = now;

    const d = entry.dragon;
    logic.regen(d, now);
    const res = fn(d);
    if (res.error) return ack(res);
    db.saveState(d, res.items);
    sendMe(socket, d);
    ack({ ok: true, result: res });
  });

  // ── 원정 ──
  socket.on('exp:start', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const d = entry.dragon;
    logic.regen(d);
    const res = logic.startExpedition(d, Number(payload?.minutes));
    if (res.error) return ack(res);
    db.saveState(d);
    sendMe(socket, d);
    broadcastPresence(d.region);
    system(d.region, `${d.name}${josa(d.name, '이', '가')} 원정을 떠났다.`, socket);
    ack({ ok: true });
  });

  // 도착 뒤 결과 받기, 또는 일찍 불러들이기 (서버가 시각으로 판단)
  socket.on('exp:finish', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const d = entry.dragon;
    logic.regen(d);
    const res = logic.finishExpedition(d);
    if (res.error) return ack(res);
    db.saveState(d, res.items);
    sendMe(socket, d);
    broadcastPresence(d.region);
    system(d.region, `${d.name}${josa(d.name, '이', '가')} 원정에서 돌아왔다.`, socket);
    ack({ ok: true, result: res });
  });

  socket.on('inv:get', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    ack({ ok: true, items: db.inventory(entry.dragon.id), equip: logic.equipOf(entry.dragon) });
  });

  // ── 제작 · 회복약 · 장신구 ──
  // 모두 같은 모양: 규칙 함수를 부르고, 성공하면 저장하고 내 정보를 다시 보냄
  const itemAction = (event, run, after) => {
    socket.on(event, (payload, ack) => {
      if (typeof ack !== 'function') return;
      const entry = entryOf(socket);
      if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
      const now = Date.now();
      if (now - (socket.data.lastItem || 0) < 300) return ack({ error: '숨을 고르는 중이다.' });
      socket.data.lastItem = now;
      const d = entry.dragon;
      logic.regen(d, now);
      const have = (id) => db.itemCount(d.id, id);
      const res = run(d, payload || {}, have);
      if (res.error) return ack(res);
      db.saveState(d, res.items, res.hoardItems);
      sendMe(socket, d);
      if (after) after(d, res);
      ack({ ok: true, result: res });
    });
  };
  itemAction('craft', (d, p, have) => logic.craft(d, str(p.recipe), have));
  itemAction('item:use', (d, p, have) => logic.useItem(d, str(p.item), have));
  itemAction('equip', (d, p, have) => logic.equip(d, str(p.item), have));
  itemAction('unequip', (d, p) => logic.unequip(d, str(p.slot)));

  // ── 인간 마을 ──
  itemAction('stance:set', (d, p) => logic.setStance(d, str(p.stance)));
  itemAction('market:buy', (d, p, have) => logic.buy(d, str(p.item), Number(p.qty), have));
  itemAction('market:sell', (d, p, have) => logic.sell(d, str(p.item), Number(p.qty), have));
  itemAction('intimidate', (d) => logic.intimidate(d));
  // ── 둥지 ──
  const presenceAfter = (d) => broadcastPresence(d.region);
  itemAction('nest:build', (d) => logic.buildNest(d));
  itemAction('rest:start', (d) => logic.startRest(d), presenceAfter);
  itemAction('rest:stop', (d) => logic.stopRest(d), presenceAfter);
  itemAction('hoard:put', (d, p, have) => logic.hoardMove(d, 'put', str(p.what), Number(p.qty), have, () => 0));
  itemAction('hoard:take', (d, p) => logic.hoardMove(d, 'take', str(p.what), Number(p.qty), () => 0, (id) => db.hoardCount(d.id, id)));
  // 둥지로 곧장 날아가기: 지역이 바뀌므로 이동과 같은 처리를 함
  itemAction('nest:home', (d) => logic.flyHome(d), (d, res) => {
    const ga = josa(d.name, '이', '가');
    socket.leave(res.from);
    system(res.from, `${d.name}${ga} 둥지를 향해 날아갔다.`);
    socket.join(d.region);
    system(d.region, `${d.name}${ga} 둥지로 돌아왔다.`, socket);
    broadcastPresence(res.from);
    broadcastPresence(d.region);
    broadcastCounts();
    sendRegionState(socket, d);
  });
  socket.on('nest:get', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const d = entry.dragon;
    const items = d.nest ? db.hoard(d.id) : [];
    // 순위: 접속 중인 드래곤은 메모리 값, 나머지는 저장 공간 값
    const all = db.allHoards();
    const byDragon = new Map();
    for (const x of all.items) {
      if (!byDragon.has(x.dragon_id)) byDragon.set(x.dragon_id, []);
      byDragon.get(x.dragon_id).push(x);
    }
    const ranking = all.dragons.map((r) => {
      const live = online.get(r.id)?.dragon;
      const gold = live ? live.hoard_gold : r.hoard_gold;
      return {
        id: r.id, name: r.name, kind: r.kind, av: r.has_avatar ? r.avatar_ver : 0, nest: live ? live.nest : r.nest,
        value: logic.hoardValue(gold || 0, byDragon.get(r.id) || []),
      };
    }).sort((a, b) => b.value - a.value);
    ack({
      ok: true,
      nest: {
        region: d.nest, here: !!d.nest && d.region === d.nest,
        gold: d.hoard_gold || 0, items, value: logic.hoardValue(d.hoard_gold || 0, items),
        ranking: ranking.slice(0, 10), myRank: ranking.findIndex((r) => r.id === d.id) + 1,
      },
    });
  });

  socket.on('market:get', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const res = logic.marketInfo(entry.dragon, db.inventory(entry.dragon.id));
    ack(res.error ? res : { ok: true, market: res });
  });

  // 화면이 회복 시각이 됐다고 알려주면 다시 계산해서 보냄
  socket.on('me:sync', () => {
    const entry = entryOf(socket);
    if (entry) sendMe(socket, entry.dragon);
  });

  socket.on('chat', (payload) => {
    const entry = entryOf(socket);
    if (!entry) return;
    const text = str(payload?.text).slice(0, CHAT_MAX);
    if (!text) return;

    const now = Date.now();
    if (now - (socket.data.lastChat || 0) < CHAT_COOLDOWN) return;
    socket.data.lastChat = now;

    const d = entry.dragon;
    const msg = { dragonId: d.id, name: d.name, kind: d.kind, text, at: now };
    db.addChat(d.region, msg);
    io.to(d.region).emit('chat', msg);
  });

  socket.on('disconnect', () => {
    const entry = entryOf(socket);
    if (!entry) return;
    online.delete(entry.dragon.id);
    logic.regen(entry.dragon);
    db.saveState(entry.dragon);
    db.touch(entry.dragon.id);
    if (socket.data.kicked) return; // 다른 창으로 옮겨간 경우는 조용히
    const d = entry.dragon;
    system(d.region, `${d.name}${josa(d.name, '이', '가')} 구름 속으로 사라졌다.`);
    broadcastPresence(d.region);
    broadcastCounts();
  });
});

server.listen(PORT, () => {
  console.log(`용의 대륙 서버가 http://localhost:${PORT} 에서 열렸어요.`);
});
