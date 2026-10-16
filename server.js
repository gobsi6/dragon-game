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
  STANCE_RULES, FAME_TIERS, fameTier, KIN, TALENTS, TRAITS, TRAIT_EARN, TRAIT_COUNTS,
  COMBAT, BREATHS, BREATH_COST, ELEMENTS, SKILLS, STATUS, CREATURE_COMBAT, MIND, PLACES, REGION_PLACES, PLACE_RULES,
} = require('./game-data');
const logic = require('./game-logic');
const life = require('./game-life');
const combat = require('./game-combat');

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

// 성별과 특징 (설정에서 언제든 바꿈)
// 성별: 남성·여성 또는 직접 쓰기(12자까지)
const BIO = { genderMax: 12, descMax: 300 };
const GENDER_OLD = { 수컷: '남성', 암컷: '여성' }; // 예전 값
const genderOf = (g) => GENDER_OLD[g] || g || '';
function bioOf(d) {
  if (typeof d.bio === 'string' || !d.bio) { try { d.bio = JSON.parse(d.bio || '{}'); } catch { d.bio = {}; } }
  return { gender: genderOf(d.bio.gender), desc: d.bio.desc || '' };
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
  berserk: !!logic.berserkOf(d),
  place: logic.placeOf(d),
  title: logic.titleName(d),
});

// 내 드래곤의 전체 정보 (나에게만 보냄)
const meOf = (d) => ({
  ...publicDragon(d),
  level: d.level, xp: d.xp, xpMax: d.level * 100,
  hp: d.hp, hpMax: logic.hpCap(d), en: d.en, enMax: logic.enCap(d),
  ap: d.ap, apMax: d.ap_max, gold: d.gold,
  stats: logic.statsOf(d),                 // 장신구까지 더한 값
  base: { claw: d.claw, scale: d.scale, wing: d.wing, wisdom: d.wisdom, majesty: d.majesty }, // 타고난 값 (포인트를 나눈 값 포함)
  statPts: d.stat_pts || 0,                // 아직 나누지 않은 능력치 포인트
  mind: d.mind ?? MIND.max, mindMax: MIND.max, mindAt: d.mind_at || 0, mindEvery: MIND.regenEvery,
  berserkInfo: (() => { const b = logic.berserkOf(d); return b ? { until: b.until, region: b.region, hp: b.hp, hpMax: b.hpMax } : null; })(),
  corrupt: { region: logic.corruptedRegion(), until: logic.corruptUntil() },
  fallen: logic.isFallen(d) ? death.view(d) : null,
  titles: logic.titlesView(d),
  craftMult: logic.titleMods(d).craftEn || 1,
  buff: (() => { const b = logic.buffOf(d); return b ? { id: b.id, until: b.until } : null; })(),
  scars: death.scarsOf(d),
  bio: bioOf(d),
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
  fame: { value: d.fame || 0, name: fameTier(d.fame || 0).name, majesty: fameTier(d.fame || 0).majesty },
  bounty: logic.hasBounty(d),
  event: pendingId(d),                // 선택을 기다리는 이벤트가 있는지
  relIn: db.reqInCount(d.id),         // 받은 동료 요청 수
  tpUnread: db.tpUnread(d.id),        // 아직 듣지 않은 텔레파시 수
  kin: d.kinSummary || { home: [], lineage: 0 },
  traits: (() => { const t = logic.traitsOf(d); return { list: t.list, chosen: !!t.chosen, counts: t.counts, done: t.done }; })(),
  combat: (() => { const c = combat.combatOf(d); return { skills: combat.loadout(d), w: c.w, l: c.l, duelOn: c.duelOn, autoDuel: c.autoDuel }; })(),
  battle: arena ? arena.inBattle(d.id) : false,
  perks: d.perks || {},
  cost: { explore: logic.actionCost(d, 'explore'), gather: logic.actionCost(d, 'gather'), hunt: logic.actionCost(d, 'hunt') },
  exp: d.exp_end ? { region: d.exp_region, start: d.exp_start, end: d.exp_end, goal: logic.expInfo(d).goal || 'gather', fork: logic.forkView(d) } : null,
  expLast: d.exp_end ? null : (logic.expInfo(d).last || null), // 지난 원정 일지
});

const EVENTS = require('./game-events');
// 기다리는 이벤트의 이름 (화면의 '일이 생겼다' 줄에 씀)
function pendingId(d) {
  if (!d.pending_event) return null;
  try {
    const id = JSON.parse(d.pending_event).id;
    return { id, title: EVENTS.find((e) => e.id === id)?.title || '' };
  } catch { return null; }
}

// ── 둥지 식구 ──────────────────────────────────────
// 지난 시간만큼 식구의 일을 계산하고(성장, 노화, 부화, 선물), 소식이 있으면 알림
function syncKin(socket, d, now = Date.now()) {
  const kin = db.kinLoad(d.id);
  const t = life.tick(d, kin, now);
  refreshKin(d, kin);
  db.saveState(d, t.items, t.hoardItems);
  if (t.lines.length && socket) {
    socket.emit('notice', { title: '둥지 소식', lines: t.lines, items: [...t.items, ...t.hoardItems], gold: t.gold });
  }
  return kin;
}
// 식구가 바뀐 뒤: 저장하고, 식구가 주는 도움(d.perks)과 요약을 새로 계산
function refreshKin(d, kin) {
  db.kinSaveAll(d.id, kin);
  d.perks = life.perksOf(kin);
  d.kinSummary = life.summary(kin, Date.now());
}

// 회복을 계산한 뒤 내 정보를 보냄
function sendMe(socket, d) {
  logic.regen(d);
  // 새로 이룬 칭호가 있으면 얻고 알림 (단 칭호가 바뀌면 같은 지역에도 알림)
  const before = logic.titleName(d);
  const got = logic.checkTitles(d);
  if (got.length) {
    db.saveState(d);
    socket.emit('notice', { title: '칭호', lines: got.map((t) => `칭호 '${t.name}'${josa(t.name, '을', '를')} 얻었다. (${t.eff})`).concat(before ? [] : [`'${got[got.length - 1].name}' 칭호를 달았다. '상태'에서 바꿀 수 있다.`]) });
    if (logic.titleName(d) !== before) setImmediate(() => broadcastPresence(d.region));
  }
  socket.emit('me', meOf(d));
}
// 채팅 기록에 칭호를 붙임 (지금 단 칭호)
function withTitles(list) {
  const cache = new Map();
  return list.map((m) => {
    if (!m.dragonId) return m;
    if (!cache.has(m.dragonId)) {
      const d = online.get(m.dragonId)?.dragon || db.getDragon(m.dragonId);
      cache.set(m.dragonId, d ? logic.titleName(d) : null);
    }
    return { ...m, title: cache.get(m.dragonId) };
  });
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
    history: withTitles(db.recentChat(dragon.region, HISTORY)),
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
  syncKin(socket, dragon);
  sendMe(socket, dragon); // 접속할 때 새로 이룬 칭호도 확인
  social.onEnter(socket, dragon);
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

// 동료: 프로필, 관계, 선물, 교환 (social.js)
const social = require('./social')({ db, online, entryOf, sendMe, logic, life });

// 강적·결투장·전투 설정·광폭화 (arena.js)
let arena = null;
arena = require('./arena')({ io, db, online, logic, combat, life, sendMe, broadcastPresence });
const BERSERK = '광폭화한 몸이 제멋대로 날뛴다. 누군가 진정시켜 주기를 기다려야 한다.';

// 쓰러짐·상흔·죽음·남긴 둥지 (death.js)
const death = require('./death')({ io, db, online, logic, life, sendMe, broadcastPresence });
arena.setFall(death.fall);
const FALLEN = '쓰러져 있다. 일어설지, 긴 잠에 들지 먼저 정해야 한다.';

// GM 도구 (gm.js)
const gm = require('./gm')({
  io, db, online, logic, life, meOf, sendMe, refreshKin, arena,
  // 순간이동: d.region은 이미 바뀐 상태. 접속 중이면 방을 옮기고 양쪽에 알림
  teleport(d, from) {
    const entry = online.get(d.id);
    if (!entry) return;
    const ga = josa(d.name, '이', '가');
    entry.socket.leave(from);
    system(from, `${d.name}${ga} 거센 바람에 휩쓸려 사라졌다.`);
    entry.socket.join(d.region);
    system(d.region, `${d.name}${ga} 바람을 타고 나타났다.`, entry.socket);
    broadcastPresence(from);
    broadcastPresence(d.region);
    broadcastCounts();
    sendRegionState(entry.socket, d);
    social.onMove(d.id);
  },
  kick(sock) {
    sock.emit('gm:kicked');
    sock.disconnect(true);
  },
});

// 지나온 이야기: 이 행동이 성공하면 [종류, 한 줄]을 남김 (choice: 선택, mark: 큰 사건)
const firstLine = (res) => String(res.lines?.[0] || '').replace(/\s+$/, '');
const CHRON_ON = {
  'event:choose': (d, res) => ['choice', `${res.title} — '${res.choice}'`],
  'stance:set': (d) => ['choice', `인간을 대하는 방식을 '${STANCES[d.stance]}'${josa(STANCES[d.stance], '으로', '로')} 바꾸었다.`],
  'traits:choose': (d, res) => ['choice', firstLine(res)],
  'kin:path': (d, res) => ['choice', firstLine(res)],
  'kin:release': (d, res) => ['choice', firstLine(res)],
  'kin:incubate': (d, res) => ['mark', firstLine(res)],
  'nest:build': (d, res) => ['mark', firstLine(res)],
};

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
    kinRules: KIN, talents: TALENTS,
    rules: { cost: RULES.cost, apEvery: RULES.apEvery, enEvery: RULES.enEvery, expeditionMinutes: RULES.expeditionMinutes },
    slots: SLOTS,
    recipes: RECIPES,
    buffs: require('./game-data').BUFFS,
    expGoals: Object.fromEntries(Object.entries(require('./game-data').EXP_GOALS).map(([k, g]) => [k, { name: g.name, desc: g.desc, eff: g.eff, wild: !!g.wild }])),
    death: { waitMs: require('./game-data').DEATH.waitMs, helpAp: require('./game-data').DEATH.helpAp, helpEn: require('./game-data').DEATH.helpEn },
    shops: Object.keys(SHOPS),
    trade: TRADE,
    nestRules: NEST,
    stanceRules: STANCE_RULES,
    fameTiers: FAME_TIERS,
    traits: TRAITS, traitEarn: TRAIT_EARN, traitCounts: TRAIT_COUNTS,
    statPerLevel: require('./game-data').STAT_POINTS.perLevel,
    places: PLACES, regionPlaces: REGION_PLACES, placeRules: PLACE_RULES,
    combat: { breaths: BREATHS, breathCost: BREATH_COST, elements: ELEMENTS, skills: SKILLS, status: STATUS, combos: require('./game-data').COMBOS, maxSkills: COMBAT.maxSkills, turnSeconds: COMBAT.turnSeconds,
      creatures: Object.fromEntries(Object.entries(CREATURE_COMBAT).map(([r, c]) => [r, { weak: c.weak, resist: c.resist, special: c.special.name }])) },
  });
  if (dragon) enterWorld(socket, dragon);
  socket.emit('rampage:list', arena.rampages());
  socket.emit('grave:list', death.graves());
  socket.emit('rescue:list', death.rescues());

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

    const good = str(payload?.traits?.good);
    const bad = str(payload?.traits?.bad);
    if (!TRAITS[good]?.good) return ack({ error: '긍정 특성을 하나 골라야 한다.' });
    if (!TRAITS[bad] || TRAITS[bad].good) return ack({ error: '부정 특성을 하나 골라야 한다.' });

    const { hpMax, enMax } = derive(final);
    const created = db.createDragon(user.id, name, kind, KINDS[kind].home, final, hpMax, enMax);
    logic.chooseTraits(created, good, bad);
    created.hp = logic.hpCap(created); created.en = logic.enCap(created);
    db.saveState(created);
    ack({ ok: true, dragon: meOf(created) });
    enterWorld(socket, created);
  });

  socket.on('move', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });

    const d = entry.dragon;
    if (d.exp_end) return ack({ error: '원정을 떠나 있는 동안에는 날아갈 수 없다.' });
    if (arena.inBattle(d.id)) return ack({ error: '싸우는 중에는 날아갈 수 없다.' });
    if (logic.berserkOf(d)) return ack({ error: BERSERK });
    if (logic.isFallen(d)) return ack({ error: FALLEN });
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
    logic.regen(d, now);
    socket.leave(from);
    d.region = to;
    d.place = REGION_PLACES[to]?.[0] || null; // 새 지역에서는 입구에 내려앉음
    db.setRegion(d.id, to);
    const arrows = logic.townArrows(d); // 적대 드래곤이 인간 마을에 날아들면
    system(from, `${d.name}${ga} ${REGIONS[to].name} 쪽으로 날아갔다.`);
    socket.join(to);
    system(to, `${d.name}${ga} ${REGIONS[from].name} 쪽에서 날아왔다.`, socket);

    broadcastPresence(from);
    broadcastPresence(to);
    broadcastCounts();
    sendRegionState(socket, d);
    social.onMove(d.id);
    if (arrows) {
      db.saveState(d);
      system(to, `${d.name}${ga} 나타나자 성벽 위에서 화살이 쏟아졌다.`, socket);
    }
    sendMe(socket, d);
    ack({ ok: true, notice: arrows });
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
  const ACTIONS = { explore: logic.explore, gather: logic.gather, hunt: combat.hunt }; // 사냥은 자동 전투 (game-combat.js)
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
    if (arena.inBattle(d.id)) return ack({ error: '싸우는 중이다. 먼저 싸움을 끝내자.' });
    if (logic.berserkOf(d)) return ack({ error: BERSERK });
    if (logic.isFallen(d)) return ack({ error: FALLEN });
    logic.regen(d, now);
    const kin = syncKin(socket, d, now);
    const res = fn(d);
    if (res.error) return ack(res);
    if (res.elite) {
      // 강적: 직접 싸우는 전투를 열고, 결과는 싸움이 끝날 때 줌
      res.battle = arena.startElite(d, res.battle);
      db.saveState(d);
      sendMe(socket, d);
      return ack({ ok: true, result: res });
    }
    // 오염된 땅: 탐사·채집은 정신이 깎이고, 오염 결정이 나오기도 함 (사냥은 몬스터가 깎음)
    const type = str(payload?.type);
    if (logic.isCorrupted(d.region)) {
      if (type !== 'hunt') {
        if (Math.random() < MIND.crystal[type]) { res.items = [...(res.items || []), { id: 'corrupt_crystal', qty: 1 }]; res.lines.push('검붉게 빛나는 오염 결정을 주웠다.'); }
        res.lines.push(...logic.loseMind(d, MIND.drain[type]));
      }
      res.lines.push(...logic.traitCount(d, 'corrupt'));
    }
    // 특성: 행동을 세고, 쓰러지기 직전까지 몰린 사냥은 상처로 셈
    res.lines.push(...logic.traitCount(d, type));
    if (res.wound) res.lines.push(...logic.traitCount(d, 'wound'));
    res.event = life.rollEvent(d, kin, (id) => db.itemCount(d.id, id), str(payload?.type), now);
    db.saveState(d, res.items);
    sendMe(socket, d);
    ack({ ok: true, result: res });
    arena.checkMind(d); // 정신이 다 깎였으면 광폭화
  });

  // ── 원정 ──
  socket.on('exp:start', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const d = entry.dragon;
    logic.regen(d);
    if (logic.berserkOf(d)) return ack({ error: BERSERK });
    if (logic.isFallen(d)) return ack({ error: FALLEN });
    const kin = syncKin(socket, d);
    const res = logic.startExpedition(d, Number(payload?.minutes), str(payload?.goal) || 'gather');
    if (res.error) return ack(res);
    const went = life.expStart(kin);
    refreshKin(d, kin);
    db.saveState(d);
    sendMe(socket, d);
    broadcastPresence(d.region);
    system(d.region, `${d.name}${josa(d.name, '이', '가')} 원정을 떠났다.`, socket);
    ack({ ok: true, went });
  });

  // 지나온 이야기 (상태 화면에서 열 때 받아 감)
  socket.on('chron:get', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    ack({ ok: true, list: logic.chronOf(entry.dragon).slice().reverse() });
  });

  // 원정 중 갈림길에서 길 고르기
  socket.on('exp:fork', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const d = entry.dragon;
    const res = logic.chooseFork(d, str(payload?.pick));
    if (res.error) return ack(res);
    db.saveState(d);
    sendMe(socket, d);
    ack(res);
  });

  // 도착 뒤 결과 받기, 또는 일찍 불러들이기 (서버가 시각으로 판단)
  socket.on('exp:finish', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const d = entry.dragon;
    logic.regen(d);
    const kin = syncKin(socket, d);
    const expRegion = d.exp_region;
    const res = logic.finishExpedition(d, Date.now(), life.companions(kin));
    if (res.error) return ack(res);
    if (expRegion && logic.isCorrupted(expRegion) && res.minutes >= 10) {
      res.lines.push('오염된 땅을 오래 헤맨 탓에 머릿속이 무겁다.', ...logic.loseMind(d, MIND.drain.expedition * Math.floor(res.minutes / 10)));
    }
    res.lines.push(...life.expFinish(kin, res.minutes));
    if (res.minutes >= 10) res.lines.push(...logic.traitCount(d, 'expedition'));
    if (res.minutes >= 10) res.event = life.rollEvent(d, kin, (id) => db.itemCount(d.id, id), 'expedition');
    refreshKin(d, kin);
    db.saveState(d, res.items);
    sendMe(socket, d);
    broadcastPresence(d.region);
    system(d.region, `${d.name}${josa(d.name, '이', '가')} 원정에서 돌아왔다.`, socket);
    ack({ ok: true, result: res });
    arena.checkMind(d);
  });

  socket.on('inv:get', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    ack({ ok: true, items: db.inventory(entry.dragon.id), equip: logic.equipOf(entry.dragon) });
  });

  // ── 제작 · 회복약 · 장신구 ──
  // 모두 같은 모양: 규칙 함수를 부르고, 성공하면 저장하고 내 정보를 다시 보냄
  // trigger(res): 성공한 결과를 보고 이벤트를 굴릴 때의 이름 (없으면 굴리지 않음)
  const itemAction = (event, run, after, trigger) => {
    socket.on(event, (payload, ack) => {
      if (typeof ack !== 'function') return;
      const entry = entryOf(socket);
      if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
      const now = Date.now();
      if (now - (socket.data.lastItem || 0) < 300) return ack({ error: '숨을 고르는 중이다.' });
      socket.data.lastItem = now;
      const d = entry.dragon;
      if (logic.berserkOf(d)) return ack({ error: BERSERK });
    if (logic.isFallen(d)) return ack({ error: FALLEN });
      logic.regen(d, now);
      const kin = syncKin(socket, d, now);
      const have = (id) => db.itemCount(d.id, id);
      const res = run(d, payload || {}, have, kin);
      if (res.error) return ack(res);
      // 지나온 이야기에 남길 선택·사건
      const cr = CHRON_ON[event];
      if (cr) { const [k, t] = cr(d, res, payload || {}) || []; if (t) logic.chron(d, k, t); }
      const t = trigger && trigger(res);
      if (t) res.event = life.rollEvent(d, kin, have, t, now);
      refreshKin(d, kin);
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
  // 결과가 성공이면 특성 횟수를 셈
  const counted = (key, fn) => (...a) => { const r = fn(...a); if (!r.error) r.lines.push(...logic.traitCount(a[0], key)); return r; };
  itemAction('market:buy', counted('trade', (d, p, have) => logic.buy(d, str(p.item), Number(p.qty), have)));
  itemAction('market:sell', counted('trade', (d, p, have) => logic.sell(d, str(p.item), Number(p.qty), have)));
  itemAction('intimidate', counted('intimidate', (d) => logic.intimidate(d)), null, (res) => (res.gold > 0 ? 'intimidate' : null));
  itemAction('traits:choose', (d, p) => logic.chooseTraits(d, str(p.good), str(p.bad)));
  itemAction('stats:spend', (d, p) => logic.spendStats(d, p.alloc));
  itemAction('title:set', (d, p) => logic.setTitle(d, str(p.id) || null), (d) => broadcastPresence(d.region));
  // ── 둥지 ──
  const presenceAfter = (d) => broadcastPresence(d.region);
  itemAction('nest:build', (d) => logic.buildNest(d));
  itemAction('rest:start', (d) => logic.startRest(d), presenceAfter);
  itemAction('rest:stop', (d, p, have, kin) => {
    const mins = d.rest_at ? (Date.now() - d.rest_at) / 60000 : 0;
    const res = logic.stopRest(d);
    if (!res.error) {
      const l = life.restTogether(kin, mins); if (l) res.lines.push(l);
      if (mins >= 10) res.lines.push(...logic.traitCount(d, 'rest')); // 10분 넘게 쉬어야 셈
    }
    return res;
  }, presenceAfter, () => 'wake');
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
    social.onMove(d.id);
  });
  // ── 장소: 같은 지역 안에서 옮기기 (행동력 없음) ──
  socket.on('place:go', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const d = entry.dragon;
    if (logic.berserkOf(d)) return ack({ error: BERSERK });
    if (logic.isFallen(d)) return ack({ error: FALLEN });
    if (arena.inBattle(d.id)) return ack({ error: '싸우는 중에는 옮길 수 없다.' });
    const now = Date.now();
    if (now - (socket.data.lastPlace || 0) < PLACE_RULES.moveCooldown) return ack({ error: '날개를 잠깐 쉬고 다시 움직이자.' });
    socket.data.lastPlace = now;
    const res = logic.goPlace(d, str(payload?.id));
    if (res.error) return ack(res);
    db.saveState(d);
    sendMe(socket, d);
    broadcastPresence(d.region);
    ack({ ok: true, result: res });
  });

  // ── 둥지 식구 ──
  itemAction('kin:care', (d, p, have, kin) => life.care(d, kin, p.id, str(p.item), have));
  itemAction('kin:rename', (d, p, have, kin) => life.rename(kin, p.id, str(p.name)));
  itemAction('kin:path', (d, p, have, kin) => life.choosePath(d, kin, p.id, str(p.path), str(p.town)));
  itemAction('kin:incubate', (d, p, have, kin) => life.incubate(d, kin, p.id, have));
  itemAction('kin:train', (d, p, have, kin) => life.train(d, kin, p.id, str(p.stat)));
  itemAction('kin:release', (d, p, have, kin) => life.release(d, kin, p.id));

  // ── 이벤트 ──
  socket.on('event:get', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const d = entry.dragon;
    const kin = syncKin(socket, d);
    const had = d.pending_event;
    const event = life.getEvent(d, kin, (id) => db.itemCount(d.id, id));
    if (had && !event) { db.saveState(d); sendMe(socket, d); } // 지나가 버린 이벤트
    ack(event ? { ok: true, event } : { error: '그 일은 이미 지나갔다.' });
  });
  itemAction('event:choose', (d, p, have, kin) => life.chooseEvent(d, kin, have, p.i));

  socket.on('nest:get', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const d = entry.dragon;
    const kin = syncKin(socket, d);
    const items = d.nest ? db.hoard(d.id) : [];
    ack({
      ok: true,
      nest: {
        region: d.nest, here: !!d.nest && d.region === d.nest,
        gold: d.hoard_gold || 0, items, value: logic.hoardValue(d.hoard_gold || 0, items),
        kin: life.views(kin, Date.now(), d),
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
    if (!entry) return;
    syncKin(socket, entry.dragon);
    sendMe(socket, entry.dragon);
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
    msg.id = db.addChat(d.region, msg);
    io.to(d.region).emit('chat', { ...msg, title: logic.titleName(d) });
  });

  // 내가 한 말 지우기 (GM은 누구의 말이든)
  socket.on('chat:delete', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const row = db.chatGet(Number(payload?.id));
    if (!row) return ack({ error: '이미 지워진 말이다.' });
    if (row.dragonId !== entry.dragon.id && !socket.data.user.is_gm) return ack({ error: '내가 한 말만 지울 수 있다.' });
    db.chatDel(row.id);
    io.to(row.region).emit('chat:deleted', { id: row.id });
    ack({ ok: true });
  });

  // 성별과 특징
  socket.on('bio:set', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const gender = str(payload?.gender).replace(/\s+/g, ' ').slice(0, BIO.genderMax);
    const desc = (typeof payload?.desc === 'string' ? payload.desc : '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, BIO.descMax);
    const d = entry.dragon;
    d.bio = { gender, desc };
    db.setBio(d.id, d.bio);
    sendMe(socket, d);
    ack({ ok: true });
  });

  // 계정 탈퇴: 비밀번호를 다시 확인하고, 계정과 드래곤을 모두 지움 (되돌릴 수 없음)
  socket.on('account:delete', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const u = db.getUserByName(user.username);
    const pw = typeof payload?.password === 'string' ? payload.password : '';
    if (!u || !pw || !bcrypt.compareSync(pw, u.pw_hash)) return ack({ error: '비밀번호가 맞지 않는다.' });
    if (u.is_gm && db.gmCount() <= 1 && db.userCount() > 1) {
      return ack({ error: '마지막 GM은 탈퇴할 수 없다. GM 도구에서 다른 드래곤에게 GM 권한을 준 뒤 탈퇴하자.' });
    }
    const entry = entryOf(socket);
    if (entry) {
      const d = entry.dragon;
      social.onLeave(d.id);
      arena.onLeave(d.id);
      online.delete(d.id);
      socket.leave(d.region);
      system(d.region, `${d.name}${josa(d.name, '이', '가')} 구름 너머로 영영 떠났다.`);
      broadcastPresence(d.region);
      broadcastCounts();
    }
    db.deleteUser(u.id);
    socket.data.kicked = true;
    ack({ ok: true });
    socket.disconnect(true);
  });

  social.attach(socket);
  gm.attach(socket);
  arena.attach(socket);
  death.attach(socket);

  socket.on('disconnect', () => {
    const entry = entryOf(socket);
    if (!entry) return;
    social.onLeave(entry.dragon.id);
    arena.onLeave(entry.dragon.id);
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
