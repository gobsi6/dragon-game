// 용의 대륙 — 1단계 서버
// 계정, 드래곤 생성, 지역 이동, 지역 채팅
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');

const db = require('./db');
const {
  KINDS, REGIONS, STANCES, STATS, CREATION, derive, ITEMS, CREATURES, RULES, SLOTS, RECIPES, SHOPS, repTier, TRADE, NEST, FISHING,
  STANCE_RULES, FAME_TIERS, fameTier, KIN, TALENTS, TRAITS, TRAIT_EARN, TRAIT_COUNTS,
  COMBAT, BREATHS, BREATH_COST, ELEMENTS, SKILLS, STATUS, CREATURE_COMBAT, MIND, PURIFY, CRAFT, PLACES, REGION_PLACES, PLACE_RULES, HOARD_TIERS, RAID, SEASONS, WEATHERS, DEPART,
} = require('./game-data');
const logic = require('./game-logic');
const mobs = require('./game-mobs'); // 모브 드래곤: 의뢰·이야기·교환
const life = require('./game-life');
const { REGION_LOOT, SHOPS_SPECIAL, RUIN, FACILITY, KIN_TRAITS } = require('./game-data');

// ── 물건을 얻는 곳: 제작 화면에서 재료를 누르면 보여 줌. 서버를 켤 때 한 번 정리해 둠 ──
const ITEM_SOURCES = (() => {
  const out = {};
  const add = (id, text) => { if (!ITEMS[id]) return; (out[id] ||= []); if (!out[id].includes(text)) out[id].push(text); };
  const rn = (r) => REGIONS[r]?.name || r;
  const TIER = { common: '', uncommon: ' (가끔)', rare: ' (드물게)' };
  for (const [r, loot] of Object.entries(REGION_LOOT)) for (const [tier, ids] of Object.entries(loot)) for (const id of ids || []) add(id, `${rn(r)} 탐사·채집${TIER[tier] || ''}`);
  for (const p of Object.values(PLACES)) if (p.drop) add(p.drop, `${rn(p.region)} ${p.name} 사냥 (${p.creature})`);
  add('beast_hide', '어디서든 사냥'); add('sharp_fang', '어디서든 사냥 (가끔)'); add('recipe_scroll', '강적을 쓰러뜨리면 가끔');
  add('calamity_core', '대륙의 재앙을 쓰러뜨리면 (함께 싸운 드래곤 모두)');
  add('blackened_scale', '오염된 사냥감·강적을 쓰러뜨리면'); add('blackened_scale', '오염된 곳에서 탐사·채집 (가끔)');
  add('corrupt_crystal', '오염된 사냥감·강적을 쓰러뜨리면 (가끔)'); add('corrupt_crystal', '오염된 곳에서 탐사·채집 (드물게)');
  for (const [r, ids] of Object.entries(SHOPS)) for (const id of ids) add(id, `${rn(r)} 시장${TRADE.dailyBuy?.[id] ? ` (하루 ${TRADE.dailyBuy[id]}개)` : ''}`);
  for (const [r, ids] of Object.entries(SHOPS_SPECIAL || {})) for (const id of ids) add(id, `${rn(r)} 시장 (우호·평판이 높을 때)`);
  for (const f of FISHING.fish) add(f.id, `${rn(FISHING.region)} 낚시${f.tier === 'rare' ? ' (드물게)' : f.tier === 'uncommon' ? ' (가끔)' : ''}`);
  add('bait_shrimp', `${rn(FISHING.region)} 채집`); add('salt_crystal', `${rn(FISHING.region)} 채집`);
  add('bait_worm', `${rn(FISHING.region)} 위협 (적대)`); add('fish_mackerel', `${rn(FISHING.region)} 위협 (적대)`);
  for (const m of Object.values(mobs.MOBS)) for (const t of m.trades || []) for (const id of Object.keys(t.get || {})) add(id, `${m.name}(${rn(m.region)})와 교환`);
  for (const x of RUIN.exchange) add(x.id, `${rn(RUIN.gateTo)}의 생존자와 교환 (정화의 결정 ${x.cost})`);
  add('purify_shard', `${RUIN.name}에서 사냥·강적·탐사·채집`);
  add('ashen_core', `${RUIN.name}의 강적 (가끔)`); add('ashen_core', `${RUIN.name}에서 2시간 이상 원정 (가끔)`);
  add('star_fragment', '어디서든 2시간 이상 원정을 끝까지 다녀오면 (3시간이면 더 잘)');
  for (const t of RUIN.treasure.pool) add(t, `${RUIN.name}의 강적·사냥 (드물게)`);
  for (const g of RUIN.gear.pool) add(g, `${RUIN.name}의 강적 (아주 드물게, 강적 ${RUIN.gear.pity}마리째에는 반드시)`);
  for (const id of FACILITY.cookable) add(`${id}__k`, '둥지 부엌에서 아이에게 요리를 맡기면');
  for (const r of RECIPES) if (!r.hidden) add(r.out, '제작');
  return out;
})();
const combat = require('./game-combat');

const PORT = process.env.PORT || 3000;
const MOVE_COOLDOWN = 1500; // ms, 연속 이동 방지
const CHAT_COOLDOWN = 700;  // ms, 도배 방지
const CHAT_MAX = 200;       // 글자 수
// 용언: 지역과 관계없이 대륙의 모든 드래곤에게 닿는 말 (횟수 제한 없음, 도배 방지 간격만)
const SHOUT_REGION = '*';   // 채팅 기록에서 용언을 담는 자리
const SHOUT_HISTORY = 10;   // 지역에 들어갈 때 함께 보여 줄 지난 용언 수
const HISTORY = 30;         // 지역에 들어갈 때 보여줄 지난 대화 수
const AVATAR_MAX = 400000;  // 프로필 그림 최대 크기 (base64 글자 수, 약 300KB)
const AVATAR_COOLDOWN = 5000;

const app = express();
app.use(compression()); // 화면 파일을 압축해서 보냄 (index.html 480KB → 약 120KB)
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 화면 파일(public/index.html)의 버전: 내용이 바뀌면 값이 바뀜. 열려 있는 창은 이 값으로 새 버전을 알아챔
const INDEX_FILE = path.join(__dirname, 'public', 'index.html');
let verCache = { mtime: -1, v: '' };
function clientVersion() {
  try {
    const st = require('fs').statSync(INDEX_FILE);
    if (st.mtimeMs !== verCache.mtime) verCache = { mtime: st.mtimeMs, v: crypto.createHash('sha1').update(require('fs').readFileSync(INDEX_FILE)).digest('hex').slice(0, 12) };
  } catch { /* 파일이 없으면 그대로 */ }
  return verCache.v;
}
// ── GM 백업: 저장 파일 내려받기 · 되돌리기 (요청 머리의 Authorization: Bearer <로그인 토큰>, GM만) ──
const os = require('os');
const gmFromReq = (req) => {
  const token = str((req.get('authorization') || '').replace(/^Bearer\s+/i, ''));
  const user = token ? db.getSessionUser(token) : null;
  return user && user.is_gm ? user : null;
};
const kstStamp = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
app.get('/api/gm/backup', (req, res) => {
  const gm = gmFromReq(req);
  if (!gm) return res.status(403).json({ error: 'GM만 쓸 수 있다.' });
  const tmp = path.join(os.tmpdir(), `dragon-backup-${Date.now()}.db`);
  try {
    db.snapshot(tmp);
  } catch (e) {
    return res.status(500).json({ error: `사본을 만들지 못했다. (${e.message})` });
  }
  db.gmLog(gm.username, null, '저장 파일을 내려받음');
  res.download(tmp, `dragon-continent-${kstStamp()}.db`, () => fs.unlink(tmp, () => {}));
});
app.post('/api/gm/restore', express.raw({ type: 'application/octet-stream', limit: '200mb' }), (req, res) => {
  const gm = gmFromReq(req);
  if (!gm) return res.status(403).json({ error: 'GM만 쓸 수 있다.' });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: '파일이 비어 있다.' });
  const tmp = path.join(os.tmpdir(), `dragon-restore-${Date.now()}.db`);
  fs.writeFileSync(tmp, req.body);
  const chk = db.checkBackup(tmp);
  if (chk.error) { fs.unlink(tmp, () => {}); return res.status(400).json(chk); }
  db.stageRestore(tmp);
  fs.unlink(tmp, () => {});
  db.gmLog(gm.username, null, `저장 파일 되돌리기 (드래곤 ${chk.dragons}마리, 계정 ${chk.users}개)`);
  res.json({ ok: true, ...chk });
  // 모두에게 알리고 서버를 다시 켬 (Railway가 자동으로 다시 켜도록 실패 코드로 끝냄. 켜질 때 파일을 바꿔 끼움)
  io.emit('gm:announce', { text: 'GM이 저장 파일을 되돌리는 중이다. 잠시 뒤 다시 연결된다.', at: Date.now() });
  setTimeout(() => { db.closeDb(); process.exit(1); }, 800);
});

app.get('/api/version', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ v: clientVersion() });
});

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
  const link = str(req.body?.link).replace(/\s+/g, ' ').trim().slice(0, 40); // GM과 연결된 계정 (GM 확인용 메모)
  const userId = db.createUser(username, bcrypt.hashSync(password, 10), isGm, link);
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
  duelUnseen: db.duelUnseen(d.id),       // 아직 확인하지 않은, 받은 자동 결투 수
  ...publicDragon(d),
  level: d.level, xp: d.xp, xpMax: logic.xpNeed(d.level), levelMax: logic.atMaxLevel(d),
  hp: d.hp, hpMax: logic.hpCap(d), en: d.en, enMax: logic.enCap(d),
  ap: d.ap, apMax: logic.apCap(d), gold: d.gold,
  stats: logic.statsOf(d),                 // 장신구까지 더한 값
  base: { claw: d.claw, scale: d.scale, wing: d.wing, wisdom: d.wisdom, majesty: d.majesty }, // 타고난 값 (포인트를 나눈 값 포함)
  statPts: d.stat_pts || 0,                // 아직 나누지 않은 능력치 포인트
  mind: d.mind ?? MIND.max, mindMax: MIND.max, mindAt: d.mind_at || 0, mindEvery: MIND.regenEvery,
  berserkInfo: (() => { const b = logic.berserkOf(d); return b ? { until: b.until, region: b.region, hp: b.hp, hpMax: b.hpMax } : null; })(),
  corrupt: { region: logic.isCorrupted(logic.corruptedRegion()) ? logic.corruptedRegion() : null, until: logic.corruptUntil(), purify: purify.view(d) },
  ruin: ruin.view(d),
  fallen: logic.isFallen(d) ? death.view(d) : null,
  titles: logic.titlesView(d),
  dexNew: logic.dexHasNew(d), // 도감에 아직 열어 보지 않은 새 칸
  achNew: logic.achHasNew(d), // 아직 열어 보지 않은 새 업적
  yabawi: yabawi.here(d),     // 같은 장소에 야바위꾼이 있으면 { until, greet … }
  craftMult: logic.titleMods(d).craftEn || 1,
  mob: mobs.summary(d),                     // 맡은 모브 드래곤 의뢰와 진행도
  craft: logic.craftView(d),                // 찾아낸 제작법, 대성공 확률, 공방, 장신구 강화·각인
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
  nestTier: d.nest ? logic.nestInfo(d).tier : 0,
  maxKin: logic.maxKinOf(d),
  raid: logic.raidView(d),                 // 보물 도둑 (쫓을 수 있는 동안)
  kinOffersIn: db.offersToCount(d.id),     // 받은 식구 입양 제안 수
  heir: (() => { try { return d.heir ? JSON.parse(d.heir) : null; } catch { return null; } })(), // 이어받은 의지
  love: (() => { const id = heartId(d.id); if (!id) return null; const o = online.get(id)?.dragon || db.getDragon(id); return o ? { id, name: o.name, bond: db.relBond(d.id, id), together: !!logic.hooks.together(d) } : null; })(),
  partnerNest: logic.hooks.partnerNest(d),
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
  exp: d.exp_end ? { region: d.exp_region, start: d.exp_start, end: d.exp_end, goal: logic.expInfo(d).goal || 'gather', fork: logic.forkView(d), plan: logic.planView(d), went: logic.expInfo(d).went || [] } : null,
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

// 보물더미 가치를 새로 셈(위엄·칭호에 씀)하고, 둥지를 비운 동안 도둑이 들었는지 굴림
function nestSync(socket, d, now = Date.now()) {
  if (!d.nest || d.dead_at) return;
  const ni = logic.nestInfo(d);
  let hoard = db.hoard(d.id);
  ni.value = logic.hoardValue(d.hoard_gold || 0, hoard);
  const r = logic.checkRaid(d, hoard, now, !!d._forceRaid);
  delete d._forceRaid;
  if (!r) return;
  db.saveState(d, [], r.hoardItems || []);
  hoard = db.hoard(d.id);
  ni.value = logic.hoardValue(d.hoard_gold || 0, hoard);
  if (socket) socket.emit('notice', { title: r.kind === 'blocked' ? '둥지를 지켜 냈다' : '보물 도둑', lines: r.lines, raid: r.kind === 'raid' });
  else for (const l of r.lines) db.noteAdd(d.id, l);
}

// 회복을 계산한 뒤 내 정보를 보냄
function sendMe(socket, d) {
  logic.regen(d);
  nestSync(socket, d);
  // 새로 이룬 칭호가 있으면 얻고 알림 (단 칭호가 바뀌면 같은 지역에도 알림)
  const before = logic.titleName(d);
  const got = logic.checkTitles(d);
  if (got.length) {
    db.saveState(d);
    socket.emit('notice', { title: '칭호', lines: got.map((t) => `칭호 '${t.name}'${josa(t.name, '을', '를')} 얻었다. (${t.eff})`).concat(before ? [] : [`'${got[got.length - 1].name}' 칭호를 달았다. '상태'에서 바꿀 수 있다.`]) });
    if (logic.titleName(d) !== before) setImmediate(() => broadcastPresence(d.region));
  }
  // 새로 이룬 업적. 처음 판정할 때는 도감부터 옮겨 오고, 그동안의 기록으로 이룬 것은 한 줄로만 알림
  const c = logic.combatJson(d);
  if (!c.ach) logic.dexBackfill(d, [...db.inventory(d.id), ...db.hoard(d.id)].map((x) => x.item));
  const ach = logic.checkAch(d);
  if (ach.got.length || ach.backfill) {
    db.saveState(d);
    const lines = ach.got.map((A) => `${A.hidden ? '숨겨진 업적' : '업적'} '${A.name}'${josa(A.name, '을', '를')} 이루었다. (${A.desc})`);
    if (ach.backfill) lines.push(`그동안의 기록으로 업적 ${ach.backfill}개를 이미 이루었다. '상태 → 기록 → 업적'에서 볼 수 있다.`);
    socket.emit('notice', { title: '업적', lines });
  }
  socket.emit('me', meOf(d));
  rivalNews(d);
}
// 라이벌 소식: 레벨업·칭호·강적 처치·쓰러짐 같은 큰 사건을 나를 라이벌로 정한 드래곤들에게 알림
const RIVAL_NEWS = /레벨 \d+|칭호 '|강적 |쓰러졌다|광폭화했다|다시 태어났다/;
function rivalNews(d) {
  const news = (d._news || []).filter((t) => RIVAL_NEWS.test(t));
  d._news = [];
  if (!news.length) return;
  const fans = db.rivalFans(d.id);
  for (const id of fans) {
    const lines = news.map((t) => `라이벌 ${d.name}: ${t}`);
    const e = online.get(id);
    if (e) e.socket.emit('notice', { title: '라이벌 소식', lines });
    else for (const l of lines) db.noteAdd(id, l);
  }
}
// 라이벌과 같은 지역에 있게 되면 서로에게 알림 (같은 둘에게는 10분에 한 번)
const rivalSeen = new Map();
function rivalNear(d) {
  const now = Date.now();
  for (const [id, e] of online) {
    if (id === d.id || e.dragon.region !== d.region) continue;
    const a = db.relGet(d.id, id), b = db.relGet(id, d.id);
    if (a !== 'rival' && b !== 'rival') continue;
    const key = d.id < id ? `${d.id}-${id}` : `${id}-${d.id}`;
    if (now - (rivalSeen.get(key) || 0) < 10 * 60000) continue;
    rivalSeen.set(key, now);
    const mutual = a === 'rival' && b === 'rival';
    const me = online.get(d.id);
    if (me) me.socket.emit('rival:near', { id, name: e.dragon.name, mutual, mine: a === 'rival', arrived: false });
    e.socket.emit('rival:near', { id: d.id, name: d.name, mutual, mine: b === 'rival', arrived: true });
  }
}
// 채팅 기록에 칭호를 붙임 (지금 단 칭호)
function withTitles(list) {
  const cache = new Map();
  return list.map((m) => {
    if (!m.dragonId) return m;
    if (!cache.has(m.dragonId)) {
      const d = online.get(m.dragonId)?.dragon || db.getDragon(m.dragonId);
      cache.set(m.dragonId, d ? { title: logic.titleName(d), av: d.has_avatar ? d.avatar_ver : 0 } : { title: null, av: 0 });
    }
    return { ...m, ...cache.get(m.dragonId) };   // 칭호와 지금의 프로필 사진
  });
}

// 이 지역에 머무는 드래곤: 접속 중인 드래곤이 먼저, 그다음 접속하지 않은 드래곤(마지막으로 본 순서)
// 창을 내리거나 닫아도 목록에서 사라지지 않고 '접속 안 함'으로 남음
function occupants(region) {
  const list = [];
  for (const { dragon } of online.values()) {
    if (dragon.region === region) list.push({ ...publicDragon(dragon), online: true });
  }
  for (const d of db.dragonsIn(region)) {
    if (online.has(d.id)) continue;
    list.push({ ...publicDragon(d), online: false, lastSeen: d.last_seen || 0 });
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
    // 이 지역의 대화에 지난 용언을 시각 순서대로 섞어 보여 줌
    more: true, // 위로 올리면 더 불러올 수 있음 (불러와 보고 없으면 버튼을 숨김)
    history: withTitles([
      ...db.recentChat(dragon.region, HISTORY),
      ...db.recentChat(SHOUT_REGION, SHOUT_HISTORY).map((m) => ({ ...m, shout: true })),
    ].sort((a, b) => a.at - b.at || a.id - b.id).slice(-HISTORY)),
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
  if (arena) arena.resume(dragon.id, socket); // 새로고침 전의 싸움이 남아 있으면 이어서
  social.onEnter(socket, dragon);
  online.set(dragon.id, { socket, dragon });
  socket.join(dragon.region);
  setImmediate(() => rivalNear(dragon));
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
const social = require('./social')({ db, online, entryOf, sendMe, logic, life, inBattle: (id) => !!arena && arena.inBattle(id) });

// 강적·결투장·전투 설정·광폭화 (arena.js)
let arena = null;
arena = require('./arena')({ io, db, online, logic, combat, life, sendMe, broadcastPresence });
const BERSERK = '광폭화한 몸이 제멋대로 날뛴다. 누군가 진정시켜 주기를 기다려야 한다.';

// 쓰러짐·상흔·죽음·남긴 둥지 (death.js)
const death = require('./death')({ io, db, online, logic, life, sendMe, broadcastPresence });
// ── 계절과 날씨: 시각으로 정해짐. 바뀌면 모두에게 알리고, 그 지역 이야기 창에도 한 줄 ──
function weatherAll(now = Date.now()) {
  const se = logic.seasonAt(now);
  return {
    season: { id: se.id, name: se.name, until: se.until },
    regions: Object.fromEntries(Object.keys(REGIONS).map((r) => [r, logic.weatherOf(r, now)])),
  };
}
let wxLast = weatherAll();
const wxTicker = setInterval(() => {
  const cur = weatherAll();
  if (cur.season.id !== wxLast.season.id) {
    const se = SEASONS.find((x) => x.id === cur.season.id);
    io.emit('system', { text: `[계절] ${se.name}${josa(se.name, '이', '가')} 왔다. ${se.desc}`, at: Date.now() });
  }
  let changed = cur.season.id !== wxLast.season.id;
  for (const [r, w] of Object.entries(cur.regions)) {
    const prev = wxLast.regions[r];
    if (prev.id !== w.id || prev.until !== w.until) changed = true;
    if (prev.id !== w.id) system(r, `하늘이 바뀌었다: ${WEATHERS[prev.id].name} → ${WEATHERS[w.id].name}. ${WEATHERS[w.id].desc}`);
  }
  wxLast = cur;
  if (changed) io.emit('weather', cur);
}, 20000);
wxTicker.unref?.();

// 대륙의 재앙: 모두가 함께 맞서는 거대한 적 (boss.js)
const boss = require('./boss')({ io, db, online, logic, combat, arena, sendMe });
// 떠돌이 야바위꾼: 하루 네 번 한 시간씩 대륙 어딘가에 판을 벌임 (yabawi.js)
const yabawi = require('./yabawi')({ io, db, online, logic, sendMe, isOpen: (r) => ruin.unlocked(r) }); // ruin은 아래에서 만들어지지만, 쓰는 건 게임이 돌아갈 때라 괜찮음
// ── 정화: 오염된 땅에서 행동할수록 모두의 기여가 쌓이고, 목표에 닿으면 그 땅의 오염이 일찍 걷힘 ──
// 오염 시계 (GM이 즉시 일으키면 바뀜). logic이 이걸 보고 지금 오염된 곳을 셈
let corruptClock = db.worldGet('corruptClock') || { off: 0, bump: 0, force: null };
logic.hooks.corruptClock = () => corruptClock;
const purify = (() => {
  const period = (now = Date.now()) => logic.corruptPeriod(now);
  let st = db.worldGet('purify');
  const cur = (now = Date.now()) => {
    const p = period(now);
    if (!st || st.period !== p) { st = { period: p, region: logic.corruptedRegion(now), pts: {}, names: {}, total: 0, done: false }; db.worldSet('purify', st); }
    return st;
  };
  // 오염된 땅에서 한 행동만큼 기여. 정화되면 모두에게 보상 (돌려주는 건 이 행동의 결과에 붙일 문장)
  function add(d, kind, n = null) {
    const s = cur();
    if (s.done || d.region !== s.region) return [];
    const v = n ?? PURIFY.pts[kind] ?? 0;
    if (!v) return [];
    s.pts[d.id] = (s.pts[d.id] || 0) + v;
    s.names[d.id] = d.name;
    s.total += v;
    const lines = [];
    if (s.total >= PURIFY.goal) { lines.push('마지막 한 줌의 검은 기운이 흩어졌다. 이 땅의 오염이 걷힌다!'); setImmediate(finish); }
    db.worldSet('purify', s);
    return lines;
  }
  function finish() {
    const s = cur();
    if (s.done) return;
    s.done = true;
    s.doneAt = Date.now();
    db.worldSet('purify', s);
    const R = PURIFY.reward;
    const ids = Object.keys(s.pts).map(Number).filter((id) => s.pts[id] >= PURIFY.minPts);
    const regionName = REGIONS[s.region]?.name || '';
    io.emit('system', { text: `[정화] ${regionName}의 오염이 걷혔다! ${ids.length}마리의 드래곤이 함께 정화했다. 다음 오염이 퍼질 때까지 이 땅은 맑다.`, at: Date.now() });
    for (const id of ids) {
      const e = online.get(id);
      const d = e ? e.dragon : db.getDragon(id);
      if (!d || d.dead_at) continue;
      const mine = s.pts[id];
      const gold = Math.min(R.goldMax, R.goldBase + mine * R.goldPer);
      d.gold += gold;
      const lines = [`${regionName}의 오염을 함께 걷어 냈다. 나의 기여 ${mine} (전체 ${s.total})`, `금화 ${gold}닢을 받았다.`];
      const f = logic.addFame(d, R.fame); if (f) lines.push(f);
      const up = logic.gainXp(d, logic.xpOf(d, R.xp)); lines.push(`경험치 +${logic.xpOf(d, R.xp)}${up ? ' · 레벨이 올랐다!' : ''}`);
      lines.push(...logic.traitCount(d, 'purify'));
      logic.chron(d, 'mark', `${regionName}의 오염을 함께 정화했다.`);
      db.saveState(d);
      if (e) { sendMe(e.socket, d); e.socket.emit('notice', { title: '정화', lines }); } else for (const l of lines) db.noteAdd(id, l);
    }
    for (const e of online.values()) sendMe(e.socket, e.dragon); // 오염 표시가 사라지게
  }
  const view = (d) => { const s = cur(); return { region: s.region, total: s.total, goal: PURIFY.goal, mine: s.pts[d.id] || 0, done: s.done, people: Object.keys(s.pts).length }; };
  return { add, view, purified: (now = Date.now()) => { const s = cur(now); return s.period === period(now) && s.done; }, debugSet: (n) => { const s = cur(); s.total = n; db.worldSet('purify', s); } };
})();
logic.hooks.purified = purify.purified;
// ── 멸망한 대륙의 정화도: 서버 전체가 함께 채움. 단계를 넘을 때마다 새 지역이 열림 ──
// 목표는 최근 활동한 입장 가능(레벨 RUIN.minLevel 이상) 드래곤 수 × RUIN.goalPer — 인원이 몇이든 걸리는 기간이 비슷하다
// 한 번 열린 지역은 st.open에 남아, 인원이 늘어 목표가 커져도 다시 잠기지 않는다
const ruin = (() => {
  let st = db.worldGet('ruin') || { total: 0, pts: {}, names: {}, stage: 0 };
  const save = () => db.worldSet('ruin', st);
  let goalAt = 0, goalV = RUIN.goalMin; // 목표는 1분씩 캐시 (저장 공간을 자주 두드리지 않게)
  const goal = (now = Date.now()) => {
    if (now - goalAt > 60000) {
      const n = db.activeSince(now - RUIN.activeDays * 24 * 3600000).filter((x) => x.level >= RUIN.minLevel).length;
      goalV = Math.max(RUIN.goalMin, n * RUIN.goalPer);
      goalAt = now;
    }
    return goalV;
  };
  const pct = () => Math.min(1, st.total / goal());
  const gated = () => Object.values(REGIONS).filter((r) => r.realm === 'ruin' && r.unlock > 0);
  const openText = (r) => `[${RUIN.name}] 정화도 ${Math.round(r.unlock * 100)}%! 오염이 물러나며 ${r.name}${josa(r.name, '으로', '로')} 가는 길이 열렸다.`;
  // 예전 저장분: 열림 기록이 없으면 지금 정화도로 조용히 채움 (다시 알리지 않게)
  if (!Array.isArray(st.open)) { st.open = gated().filter((r) => pct() >= r.unlock).map((r) => r.id); save(); }
  // 문턱을 새로 넘은 지역을 열고 모두에게 알림. 돌려주는 것: 이번에 새로 열린 지역들
  function settle() {
    const opened = gated().filter((r) => !st.open.includes(r.id) && pct() >= r.unlock);
    for (const r of opened) {
      st.open.push(r.id);
      io.emit('system', { text: openText(r), at: Date.now() });
    }
    if (opened.length) save();
    return opened;
  }
  const unlocked = (region) => {
    if (!logic.isRuin(region) || !(REGIONS[region]?.unlock > 0)) return true;
    if (!st.open.includes(region)) settle();
    return st.open.includes(region);
  };
  const nextLock = () => gated().filter((r) => !st.open.includes(r.id)).sort((a, b) => a.unlock - b.unlock)[0] || null;
  function add(d, kind, n = null) {
    if (!logic.isRuin(d.region)) return [];
    const v = n ?? RUIN.pts[kind] ?? 0;
    if (!v) return [];
    st.pts[d.id] = (st.pts[d.id] || 0) + v;
    st.names[d.id] = d.name;
    st.total += v;
    const lines = settle().map(openText); // 새로 열린 지역이 있으면 내 결과 창에도
    save();
    return lines;
  }
  const top = (n = 5) => Object.entries(st.pts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id, p]) => ({ id: Number(id), name: st.names[id], pts: p }));
  const view = (d) => { settle(); const nx = nextLock(); return { total: st.total, goal: goal(), pct: pct(), open: st.open.slice(), mine: st.pts[d.id] || 0, next: nx ? { name: nx.name, at: nx.unlock } : null }; };
  return { add, view, top, unlocked, debugSet: (n) => { st.total = n; save(); goalAt = 0; settle(); } };
})();
logic.hooks.purify = (d, kind) => (logic.isRuin(d.region) ? ruin.add(d, kind) : purify.add(d, kind));
logic.hooks.companionsHere = (d) => { for (const e of online.values()) if (e.dragon.id !== d.id && e.dragon.region === d.region && !e.dragon.dead_at) return true; return false; };
logic.hooks.purifyDebug = purify.debugSet; // 시험용: 정화 진행을 바로 정함
// 숨겨진 제작법을 대륙에서 처음 찾아낸 드래곤: 전체 공지와 칭호
logic.hooks.firstRecipe = (d, out) => {
  const w = db.worldGet('firstRecipe') || {};
  if (w[out]) return [`(이 제작법을 처음 찾아낸 드래곤은 ${w[out].name}이었다)`];
  w[out] = { id: d.id, name: d.name, at: Date.now() };
  db.worldSet('firstRecipe', w);
  io.emit('system', { text: `[발견] ${d.name}${josa(d.name, '이', '가')} 대륙에서 처음으로 '${ITEMS[out].name}' 제작법을 찾아냈다!`, at: Date.now() });
  logic.chron(d, 'mark', `대륙에서 처음으로 '${ITEMS[out].name}' 제작법을 찾아냈다.`);
  return ['대륙에서 처음 찾아낸 제작법이다! 모두에게 소식이 퍼졌다.', ...logic.traitCount(d, 'firstcraft')];
};
// 이벤트가 볼 수 있게: 보물더미, 최근 재앙의 흔적
logic.hooks.hoard = (id) => db.hoard(id);
logic.hooks.bossTrace = (region) => boss.trace(region);
// ── 환영 공지 (GM 도구에서 고칠 수 있음. ver가 오르면 모두에게 한 번 더 뜸) ──
const WELCOME_MAX = 2000;
const WELCOME_DEFAULT = `안녕하세요. 용의 대륙에 오신 것을 환영합니다.
당신은 이 대륙에서 살아가는 용입니다. 인간을 적대할 수도 있고, 우호적인 관계를 맺을 수도 있으며, 어느 쪽에도 속하지 않은 채 은둔하며 살아갈 수도 있습니다. 버려진 알이나 인간 아이와 인연이 닿아 그들을 거두어 키울 수도 있겠죠. 몬스터를 사냥하며 스스로를 갈고닦는 것도 좋은 선택입니다.
그러나 조심하세요. 강적을 만나 쓰러질 수도 있고, 정신력이 바닥나 폭주하게 될 수도 있습니다. 물론, 곁에서 당신을 도와줄 동료가 있다면 큰 문제는 없을지도 모릅니다.
본 게임은 캐릭터 이입을 통한 플레이를 권장합니다. 처음 만나는 사이라도 상냥하게 대해주세요.

본 게임은 바이브 코딩을 통해 제작되었습니다. 따라서 일부 기능이 원활하게 작동하지 않거나 예상치 못한 오류가 발생할 수 있습니다. 너그러운 마음으로 양해 부탁드리며, 플레이 중 문제가 발생한다면 GM(청우)에게 편하게 제보해주세요. 감사합니다!`;
// ── 업데이트 노트: GM이 쓰고, 모두가 메뉴에서 읽음. world 표의 'notes'에 새것부터 [{ id, title, date, body }]
const NOTE = { max: 60, titleMax: 60, bodyMax: 3000 };
const NOTES_DEFAULT = [{
  id: 1, date: '2026-10-17', title: '용언과 업데이트 노트',
  body: [
    '- 용언이 생겼다. 채팅 입력칸 왼쪽의 \'용언\'을 켜고 말하면, 지역과 관계없이 대륙의 모든 드래곤에게 닿는다.',
    '- 채팅 보내기 버튼이 둥근 화살표로 바뀌었다. 글을 쓰면 색이 들어온다.',
    '- 착용 중인 장신구에도 등급 마름모가 보인다. 희귀한 장신구는 칸이 금빛이 된다.',
    '- 남의 도움으로 일어서는 건 하루 2번까지로 바뀌었다.',
    '- 업데이트 노트가 생겼다. 메뉴에서 언제든 다시 볼 수 있고, 환영 공지도 여기서 다시 볼 수 있다.',
  ].join('\n'),
}];
const notesOf = () => db.worldGet('notes', null) ?? NOTES_DEFAULT;
const kstDate = (t = Date.now()) => new Date(t + 9 * 3600000).toISOString().slice(0, 10); // 한국 날짜 YYYY-MM-DD

const welcomeOf = () => { const w = db.worldGet('welcome', null); return w && w.text ? { text: w.text, ver: w.ver || 1 } : { text: WELCOME_DEFAULT, ver: 1 }; };

// 관계: 연인·반려와 같은 지역에 함께 있는지 (둘 다 접속), 반려의 둥지
const heartId = (id) => db.relByBond(id, 'partner')[0] || db.relByBond(id, 'lover')[0] || null;
logic.hooks.together = (d) => {
  const id = heartId(d.id);
  const e = id && online.get(id);
  return e && online.has(d.id) && e.dragon.region === d.region && !e.dragon.exp_end && !d.exp_end ? e.dragon.name : null;
};
logic.hooks.partnerNest = (d) => {
  const id = db.relByBond(d.id, 'partner')[0];
  if (!id) return null;
  const e = online.get(id);
  const p = e ? e.dragon : db.getDragon(id);
  return p && !p.dead_at && p.nest ? { id, name: p.name, region: p.nest } : null;
};
// 관계 이벤트가 볼 수 있게: 스승·제자, 연인·반려, 원수, 동료, 먼 여행을 떠난 드래곤, 입양 보낸 식구
logic.hooks.ties = (d) => {
  const look = (id) => online.get(id)?.dragon || db.getDragon(id);
  const fallenOf = (x) => { let f = x.fallen; if (typeof f === 'string') { try { f = JSON.parse(f); } catch { f = null; } } return f; };
  const t = { mentor: null, students: [], heart: null, nemesis: [], friends: [], departed: [], adoptedOut: [] };
  for (const r of db.relList(d.id)) {
    const x = look(r.id);
    if (!x) continue;
    const one = { id: x.id, name: x.name, level: x.level, region: x.region, nest: x.nest };
    if (x.dead_at) {
      const f = fallenOf(x);
      if (f?.departed && r.kind === 'friend') t.departed.push({ ...one, words: f.words || '', at: f.at });
      continue;
    }
    if (r.kind === 'nemesis') t.nemesis.push(one);
    if (r.kind !== 'friend') continue;
    if (r.bond === 'mentor') t.mentor = one;
    else if (r.bond === 'student') t.students.push(one);
    else if (r.bond === 'partner' || (r.bond === 'lover' && !t.heart)) t.heart = { ...one, bond: r.bond };
    else t.friends.push({ ...one, bond: r.bond });
  }
  // 의지를 물려준 드래곤도 먼 여행을 떠난 드래곤
  try { const h = d.heir && JSON.parse(d.heir); if (h?.name) t.departed.push({ id: null, name: h.name, words: h.words || '', at: h.at, heir: true }); } catch {}
  t.adoptedOut = db.kinAdoptedOut(d.id);
  return t;
};
arena.setFall(death.fall);
const FALLEN = '쓰러져 있다. 일어설지, 긴 잠에 들지 먼저 정해야 한다.';

// GM 도구 (gm.js)
const gm = require('./gm')({
  io, db, online, logic, life, meOf, sendMe, refreshKin, arena, nestSync,
  presence: (d) => broadcastPresence(d.region), // 이름·종족이 바뀌면 이곳의 드래곤 목록을 다시 보냄
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
    legacy: dragon ? null : db.legacyGet(user.id),   // 먼 여행을 떠난 드래곤이 남긴 의지 (새 드래곤에게)
    departRules: DEPART,
    version: clientVersion(),
    kinds: KINDS,
    regions: REGIONS,
    stats: STATS,
    creation: CREATION,
    items: ITEMS,
    huntable: Object.keys(CREATURES),
    kinRules: KIN, talents: TALENTS,
    rules: { cost: RULES.cost, apEvery: RULES.apEvery, enEvery: RULES.enEvery, expeditionMinutes: RULES.expeditionMinutes },
    slots: SLOTS,
    recipes: RECIPES.map((r) => (r.hidden ? { ...r, needs: {} } : r)), // 숨겨진 제작법은 재료를 숨김 (찾아내면 me.craft.needs로)
    buffs: require('./game-data').BUFFS,
    expGoals: Object.fromEntries(Object.entries(require('./game-data').EXP_GOALS).map(([k, g]) => [k, { name: g.name, desc: g.desc, eff: g.eff, wild: !!g.wild }])),
    death: { waitMs: require('./game-data').DEATH.waitMs, helpAp: require('./game-data').DEATH.helpAp, helpEn: require('./game-data').DEATH.helpEn },
    shops: Object.keys(SHOPS),
    trade: TRADE,
    sources: ITEM_SOURCES,
    facility: {
      slots: FACILITY.slots, cookable: FACILITY.cookable,
      list: Object.fromEntries(Object.entries(FACILITY.list).map(([id, F]) => [id, { ...F,
        fit: [F.talent ? `${TALENTS[F.talent].name} 재주` : null, ...F.traits.map((t) => KIN_TRAITS[t]?.name)].filter(Boolean).join(', ') }])),
    },
    ruinRules: { name: RUIN.name, crossAp: RUIN.crossAp, minLevel: RUIN.minLevel, gateTo: RUIN.gateTo, drain: RUIN.drain },
    fishing: { region: FISHING.region, window: FISHING.window },
    bonds: require('./game-data').BONDS, marks: require('./game-data').MARKS, bondRules: require('./game-data').BOND_RULES,
    nestRules: NEST, hoardTiers: HOARD_TIERS,
    seasons: SEASONS.map((x) => ({ id: x.id, name: x.name, desc: x.desc, prose: logic.fxProse(x.fx), ...logic.fxText(x.fx) })),
    weathers: Object.fromEntries(Object.entries(WEATHERS).map(([id, w]) => [id, { name: w.name, desc: w.desc, ...logic.fxText(w.fx) }])),
    raidRules: { minValue: RAID.minValue, chaseAp: RAID.chaseAp, chaseFor: RAID.chaseFor, guard: RAID.guard, trap: RAID.trap },
    stanceRules: STANCE_RULES,
    fameTiers: FAME_TIERS,
    traits: TRAITS, traitEarn: TRAIT_EARN, traitCounts: TRAIT_COUNTS,
    mobs: mobs.listForClient(),
    craftRules: { enhance: CRAFT.enhance, forgeRate: CRAFT.forgeRate, engrave: CRAFT.engrave, experimentEn: CRAFT.experiment.en, forge: CRAFT.forge, hidden: RECIPES.filter((r) => r.hidden).map((r) => r.out) },
    statPerLevel: require('./game-data').STAT_POINTS.perLevel,
    places: PLACES, regionPlaces: REGION_PLACES, placeRules: PLACE_RULES,
    combat: { breaths: BREATHS, breathCost: BREATH_COST, elements: ELEMENTS, skills: SKILLS, status: STATUS, combos: require('./game-data').COMBOS, maxSkills: COMBAT.maxSkills, turnSeconds: COMBAT.turnSeconds,
      creatures: Object.fromEntries(Object.entries(CREATURE_COMBAT).map(([r, c]) => [r, { weak: c.weak, resist: c.resist, special: c.special.name }])) },
  });
  if (dragon) enterWorld(socket, dragon);
  socket.emit('welcome', { ...welcomeOf(), seen: db.welcomeSeen(user.id) }); // 환영 공지 (읽지 않은 판이면 화면이 띄움)
  socket.emit('notes:latest', { id: notesOf()[0]?.id || 0 }); // 가장 새 업데이트 노트 (읽지 않았으면 메뉴에 점)
  socket.emit('rampage:list', arena.rampages());
  socket.emit('boss', boss.view());
  socket.emit('weather', weatherAll());
  socket.emit('grave:list', death.graves());
  socket.emit('rescue:list', death.rescues());
  socket.emit('rescue:risen', death.risenList()); // 최근 다시 일어선 드래곤

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
    created.hp = logic.hpCap(created); created.en = logic.enCap(created); created.ap = logic.apCap(created); // 처음엔 행동력도 가득
    // 먼 여행을 떠난 드래곤의 의지: 능력치 포인트와 칭호
    const legacy = db.legacyGet(user.id);
    if (legacy) {
      created.stat_pts = (created.stat_pts || 0) + (legacy.pts || 0);
      logic.traitCount(created, 'heir');
      logic.chron(created, 'mark', `먼 여행을 떠난 ${legacy.name}(레벨 ${legacy.level} ${KINDS[legacy.kind]?.name || ''})의 의지를 이어받았다. 능력치 포인트 +${legacy.pts}`);
      created.heir = JSON.stringify(legacy);
      db.setHeir(created.id, legacy);
      db.legacySet(user.id, null);
    }
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
    // 멸망한 대륙: 아직 정화도가 모자라 닫혀 있는 땅
    if (!ruin.unlocked(to)) return ack({ error: `${REGIONS[to].name}${josa(REGIONS[to].name, '은', '는')} 아직 오염이 짙어 들어갈 수 없다. (모두의 정화도 ${Math.round(REGIONS[to].unlock * 100)}%에 열림)` });
    // 바다 건너기: 본 대륙 ↔ 멸망한 대륙 (조건은 먼저 보고, 행동력은 실제로 떠날 때 씀)
    const cross = logic.isRuin(from) !== logic.isRuin(to);
    if (cross) {
      if (logic.isRuin(to) && d.level < RUIN.minLevel) return ack({ error: `바다 건너의 땅은 너무 위험하다. 레벨 ${RUIN.minLevel}부터 건널 수 있다.` });
      logic.regen(d, Date.now());
      if (d.ap < RUIN.crossAp) return ack({ error: `바다를 건너려면 행동력 ${RUIN.crossAp}이 필요하다.` });
    }

    const now = Date.now();
    if (now - (socket.data.lastMove || 0) < MOVE_COOLDOWN) {
      return ack({ error: '날개를 잠깐 쉬고 다시 날아야 한다.' });
    }
    socket.data.lastMove = now;

    const ga = josa(d.name, '이', '가');
    logic.regen(d, now);
    if (cross) logic.spendAp(d, RUIN.crossAp);
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
    rivalNear(d);
    broadcastCounts();
    sendRegionState(socket, d);
    social.onMove(d.id);
    if (arrows) {
      db.saveState(d);
      system(to, `${d.name}${ga} 나타나자 성벽 위에서 화살이 쏟아졌다.`, socket);
    }
    let crossed = null;
    if (cross) {
      db.saveState(d); // 바다를 건너며 쓴 행동력
      crossed = logic.isRuin(to)
        ? { title: '바다 건너기', lines: [`검은 바다를 건너 ${RUIN.name}에 내려앉았다. (행동력 −${RUIN.crossAp})`, '공기가 무겁다. 이 땅에서는 정신이 훨씬 빨리 깎인다. 정신 보호 장신구가 있다면 꼭 차 두자.'] }
        : { title: '바다 건너기', lines: [`검은 바다를 건너 ${REGIONS[to].name}${josa(REGIONS[to].name, '으로', '로')} 돌아왔다. (행동력 −${RUIN.crossAp})`, '맑은 바람이 비늘 사이로 스민다.'] };
    }
    sendMe(socket, d);
    ack({ ok: true, notice: arrows, crossed });
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
    if (res.hunt) {
      // 사냥: 직접 싸우는 전투. 끝나면 특성 횟수·이벤트·정신을 살핌 (arena.js가 부름)
      const place = logic.placeOf(d);
      const c = { name: PLACES[place].creature, level: PLACES[place].level };
      res.battle = arena.startHunt(d, res.battle, c, (dd, r) => {
        if (logic.isCorrupted(dd.region)) r.lines.push(...logic.traitCount(dd, 'corrupt'));
        r.lines.push(...logic.traitCount(dd, 'hunt'));
        if (r.wound) r.lines.push(...logic.traitCount(dd, 'wound'));
        if (!r.fall) r.event = life.rollEvent(dd, db.kinLoad(dd.id), (id) => db.itemCount(dd.id, id), 'hunt');
      });
      db.saveState(d);
      sendMe(socket, d);
      return ack({ ok: true, result: res });
    }
    // 오염된 땅: 탐사·채집은 정신이 깎이고, 오염 결정이 나오기도 함 (사냥은 몬스터가 깎음)
    const type = str(payload?.type);
    if (logic.isCorrupted(d.region)) {
      if (type !== 'hunt') {
        if (Math.random() < MIND.crystal[type]) { res.items = [...(res.items || []), { id: 'corrupt_crystal', qty: 1 }]; res.lines.push('검붉게 빛나는 오염 결정을 주웠다.'); }
        if (Math.random() < (MIND.scale[type] || 0)) { res.items = [...(res.items || []), { id: 'blackened_scale', qty: 1 }]; res.lines.push('검게 물든 비늘 한 장이 바위틈에 박혀 있었다.'); }
        res.lines.push(...logic.loseMind(d, MIND.drain[type]));
        res.lines.push(...(logic.isRuin(d.region) ? ruin.add(d, type) : purify.add(d, type)));
        const sh = logic.isRuin(d.region) && RUIN.shard[type];
        if (sh && Math.random() < sh[0]) { res.items = [...(res.items || []), { id: 'purify_shard', qty: sh[1] }]; res.lines.push('잿빛 먼지 사이에서 맑게 빛나는 정화의 결정을 찾았다.'); }
      }
      res.lines.push(...logic.traitCount(d, 'corrupt'));
    }
    // 바랜 제작서: 탐사하다 가끔 (숨겨진 제작법)
    if (type === 'explore' && Math.random() < CRAFT.scrollChance.explore) { res.items = [...(res.items || []), { id: 'recipe_scroll', qty: 1 }]; res.lines.push('무너진 돌 틈에 낡은 양피지가 끼어 있었다. 바랜 제작서다!'); }
    // 특성: 행동을 세고, 쓰러지기 직전까지 몰린 사냥은 상처로 셈
    res.lines.push(...logic.traitCount(d, type));
    if (type === 'gather' || type === 'explore') logic.traitCount(d, `${type}:${d.region}`); // 모브 드래곤 의뢰: 지역별
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
    logic.planExpedition(d, life.companions(kin)); // 길 위의 일을 미리 정해 둠 (팝업에 보여 주고, 돌아오면 그대로 받음)
    logic.expInfo(d).went = life.expWent(kin); // 함께 간 식구 (이름과 나잇대: 원정 길 이야기에)
    refreshKin(d, kin);
    db.saveState(d);
    sendMe(socket, d);
    broadcastPresence(d.region);
    system(d.region, `${d.name}${josa(d.name, '이', '가')} 원정을 떠났다.`, socket);
    ack({ ok: true, went });
  });

  // 도감 (상태 화면에서 열 때 받아 감). 도감이 생기기 전의 기록도 이때 옮겨 옴
  socket.on('dex:get', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const d = entry.dragon;
    logic.dexBackfill(d, [...db.inventory(d.id), ...db.hoard(d.id)].map((x) => x.item));
    const view = logic.dexView(d); // '새로' 표시는 지난번에 연 뒤로 생긴 것
    logic.dexSeen(d);
    db.saveState(d);
    ack({ ok: true, dex: view });
  });

  // 떠돌이 야바위꾼과 한 판 (홀짝)
  socket.on('yabawi:play', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const d = entry.dragon;
    const now = Date.now();
    if (now - (socket.data.lastYabawi || 0) < 800) return ack({ error: '야바위꾼이 조약돌을 다시 모으는 중이다.' });
    socket.data.lastYabawi = now;
    if (logic.berserkOf(d)) return ack({ error: BERSERK });
    if (logic.isFallen(d)) return ack({ error: FALLEN });
    if (d.rest_at) return ack({ error: '둥지에서 쉬는 중이다. 먼저 깨어나야 한다.' });
    if (arena.inBattle(d.id)) return ack({ error: '싸우는 중에는 할 수 없다.' });
    const res = yabawi.play(d, payload?.bet, str(payload?.pick), now);
    if (res.error) return ack(res);
    db.saveState(d);
    sendMe(socket, d);
    ack(res);
  });
  // 야바위꾼에게 말 걸기 (만난 횟수) · 소문 듣기
  for (const [ev, fn] of [['yabawi:talk', yabawi.talk], ['yabawi:rumor', yabawi.rumor]]) {
    socket.on(ev, (payload, ack) => {
      if (typeof ack !== 'function') return;
      const entry = entryOf(socket);
      if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
      const d = entry.dragon;
      if (logic.berserkOf(d)) return ack({ error: BERSERK });
      if (logic.isFallen(d)) return ack({ error: FALLEN });
      const res = fn(d);
      if (res.error) return ack(res);
      if (res.first || res.id) { db.saveState(d); sendMe(socket, d); } // 칭호·업적 확인도 여기서
      ack(res);
    });
  }
  // GM: 야바위꾼을 지금 바로 부름 (시험용). 어디에 있는지도 알려 줌
  socket.on('gm:yabawi', (p, ack) => {
    if (typeof ack !== 'function') return;
    if (!socket.data.user?.is_gm) return ack({ error: 'GM만 쓸 수 있다.' });
    if (p?.summon) yabawi.summon(str(p?.region));
    ack({ ok: true, where: yabawi.where(), today: yabawi.daySlots(logic.dayIdx()).map((s) => ({ start: s.start, end: s.end, region: REGIONS[s.region].name, place: PLACES[s.place]?.name })) });
  });

  // 업적 (상태 화면에서 열 때 받아 감)
  socket.on('ach:get', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const d = entry.dragon;
    const view = logic.achView(d); // '새로' 표시는 지난번에 연 뒤로 이룬 것
    logic.achSeen(d);
    db.saveState(d);
    ack({ ok: true, ach: view });
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
    // 지난 일지에도 얻은 것·잃은 것이 보이게 (결과 창과 같은 내용)
    const last = logic.expInfo(d).last;
    if (last) Object.assign(last, { items: res.items, gold: res.gold, goldLost: res.goldLost, hpLost: res.hpLost, xp: res.xp, lines: res.lines });
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
      // 이벤트가 다른 드래곤에게 남긴 소식 (라이벌 이벤트)
      for (const t of res.tells || []) social.tellRival(t.id, t.text, t.title);
      for (const g of res.sends || []) social.eventGift(d, g.id, g.items, g.msg); // 이벤트로 보낸 선물
      if (res.purify) res.lines = [...(res.lines || []), ...purify.add(d, 'event', res.purify)]; // 이벤트로 쌓은 정화 기여
      delete res.tells; delete res.sends; delete res.purify;
      // 지나온 이야기에 남길 선택·사건
      const cr = CHRON_ON[event];
      if (cr) { const [k, t] = cr(d, res, payload || {}) || []; if (t) logic.chron(d, k, t); }
      const t = trigger && trigger(res);
      if (t) res.event = life.rollEvent(d, kin, have, t, now);
      refreshKin(d, kin);
      // 장신구를 모두 팔거나 버렸으면 강화·각인 기록도 지움
      if ((res.items || []).some((x) => x.qty < 0 && ITEMS[x.id]?.type === 'equip')) {
        const delta = {}; for (const x of res.items) delta[x.id] = (delta[x.id] || 0) + x.qty;
        logic.tidyGear(d, (id) => have(id) + (delta[id] || 0));
      }
      db.saveState(d, res.items, res.hoardItems);
      sendMe(socket, d);
      if (after) after(d, res);
      ack({ ok: true, result: res });
    });
  };
  itemAction('craft', (d, p, have) => logic.craft(d, str(p.recipe), have, p.focus));
  itemAction('craft:experiment', (d, p, have) => logic.experiment(d, p.items, have));
  itemAction('gear:enhance', (d, p, have) => logic.enhanceGear(d, str(p.item), have));
  itemAction('gear:engrave', (d, p, have) => logic.engraveGear(d, str(p.item), str(p.elem), have));
  itemAction('nest:forge', (d, p, have) => logic.buildFacility(d, 'forge', have)); // 예전 화로 짓기 버튼
  // 둥지 시설
  itemAction('nest:fac:build', (d, p, have) => logic.buildFacility(d, str(p.id), have));
  itemAction('nest:fac:remove', (d, p) => logic.removeFacility(d, str(p.id)));
  itemAction('nest:job', (d, p, have, kin) => life.setJob(d, kin, p.kin, str(p.fac)));
  itemAction('nest:harvest', (d, p, have, kin) => life.harvest(d, kin));
  itemAction('nest:cook', (d, p, have, kin) => life.cook(d, kin, str(p.recipe), have));
  itemAction('order:fill', (d, p, have) => logic.fillOrder(d, str(p.key), have));
  // ── 모브 드래곤 ──
  socket.on('mob:get', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const d = entry.dragon;
    const id = mobs.MOB_BY_REGION[d.region];
    if (!id) return ack({ error: '이곳에는 머무는 드래곤이 없다.' });
    ack({ ok: true, mob: mobs.view(d, id, (x) => db.itemCount(d.id, x)) });
  });
  itemAction('mob:accept', (d, p) => mobs.accept(d, str(p.mob), p.i));
  itemAction('mob:turnin', (d, p, have) => mobs.turnIn(d, str(p.mob), p.i, have));
  itemAction('mob:abandon', (d, p) => mobs.abandon(d, str(p.mob), p.i));
  itemAction('mob:story', (d, p) => mobs.storyAccept(d, str(p.mob)));
  itemAction('mob:storyturn', (d, p, have) => mobs.storyTurnIn(d, str(p.mob), have));
  itemAction('mob:trade', (d, p, have) => mobs.trade(d, str(p.mob), p.i, have));
  socket.on('order:list', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const v = logic.ordersView(entry.dragon);
    if (!v) return ack({ error: '의뢰 게시판은 인간 마을에만 있다.' });
    ack({ ok: true, orders: v });
  });
  itemAction('item:use', (d, p, have) => logic.useItem(d, str(p.item), have), (d) => arena.checkMind(d)); // 광기의 묘약으로 정신이 다 깎일 수 있음
  // 소지품 버리기: 버린 물건은 사라짐
  itemAction('item:drop', (d, p, have) => {
    const id = str(p.item);
    const it = require('./game-data').ITEMS[id];
    if (!it) return { error: '알 수 없는 물건이다.' };
    const n = have(id);
    if (n < 1) return { error: '가지고 있지 않다.' };
    const q = Math.max(1, Math.min(n, Math.floor(Number(p.qty)) || 1));
    const what = q > 1 ? `${it.name} ${q}개` : it.name;
    return { title: '소지품', lines: [`${what}${josa(q > 1 ? '개' : it.name, '을', '를')} 버렸다.`], items: [{ id, qty: -q }] };
  });
  itemAction('equip', (d, p, have) => logic.equip(d, str(p.item), have));
  itemAction('unequip', (d, p) => logic.unequip(d, str(p.slot)));

  // ── 인간 마을 ──
  itemAction('stance:set', (d, p) => logic.setStance(d, str(p.stance)));
  // 결과가 성공이면 특성 횟수를 셈
  const counted = (key, fn) => (...a) => { const r = fn(...a); if (!r.error) r.lines.push(...logic.traitCount(a[0], key)); return r; };
  itemAction('market:buy', counted('trade', (d, p, have) => logic.buy(d, str(p.item), Number(p.qty), have)));
  itemAction('market:sell', counted('trade', (d, p, have) => logic.sell(d, str(p.item), Number(p.qty), have)));
  itemAction('intimidate', counted('intimidate', (d) => logic.intimidate(d)), null, (res) => (res.gold > 0 ? 'intimidate' : null));
  // ── 낚시: 던지면 서버가 입질 시각을 정하고, 당긴 시각으로 결과를 정함 ──
  itemAction('fish:cast', (d, p, have) => {
    const f = socket.data.fish;
    if (f && Date.now() < f.bite + FISHING.window) return { error: '이미 줄을 던져 두었다.' };
    const bait = str(p.bait);
    const r = logic.fishCast(d, bait, have, !!p.auto);
    socket.data.fish = r.fishing ? { bait, bite: Date.now() + r.fishing.biteIn } : null;
    return r;
  });
  itemAction('fish:reel', (d) => { const c = socket.data.fish; socket.data.fish = null; return logic.fishReel(d, c); });
  itemAction('traits:choose', (d, p) => logic.chooseTraits(d, str(p.good), str(p.bad)));
  itemAction('stats:spend', (d, p) => logic.spendStats(d, p.alloc));
  itemAction('title:set', (d, p) => logic.setTitle(d, str(p.id) || null), (d) => broadcastPresence(d.region));
  // ── 둥지 ──
  const presenceAfter = (d) => broadcastPresence(d.region);
  itemAction('nest:build', (d) => logic.buildNest(d));
  itemAction('nest:expand', (d, p, have) => logic.expandNest(d, have));
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
  // ── 반려의 둥지에서 그 집 식구 돌보기 (인간 아이 돌보기, 새끼 드래곤 가르치기). 유대·능력치는 반려의 식구에게 쌓임 ──
  const partnerHome = (d) => {
    const ph = logic.hooks.partnerNest(d);
    if (!ph) return { error: '반려가 없거나, 반려에게 아직 둥지가 없다.' };
    if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
    if (d.region !== ph.region) return { error: `반려 ${ph.name}의 둥지(${REGIONS[ph.region].name})에 있어야 돌볼 수 있다.` };
    return ph;
  };
  const partnerKinAct = (fn, verb) => (d, p, have) => {
    const ph = partnerHome(d);
    if (ph.error) return ph;
    const pkin = db.kinLoad(ph.id);
    const k = pkin.find((x) => x.id === Number(p.id));
    const res = fn(d, pkin, p, have);
    if (res.error) return res;
    const pe = online.get(ph.id);
    if (pe) refreshKin(pe.dragon, pkin); else db.kinSaveAll(ph.id, pkin);
    res.title = `반려 ${ph.name}의 식구 · ${res.title}`;
    const gain = res.lines.find((l) => /유대 \+/.test(l));
    social.tellRival(ph.id, `${d.name}${josa(d.name, '이', '가')} 둥지에 들러 ${k ? k.name : '식구'}${josa(k ? k.name : '식구', '을', '를')} ${verb}.${gain ? ` (${gain})` : ''}`, '반려');
    return res;
  };
  itemAction('kin:pcare', partnerKinAct((d, pkin, p, have) => life.care(d, pkin, p.id, str(p.item), have, Date.now(), { away: true }), '돌봐 주었다'));
  itemAction('kin:ptrain', partnerKinAct((d, pkin, p) => life.train(d, pkin, p.id, str(p.stat), Date.now(), { away: true }), '가르쳐 주었다'));
  itemAction('kin:rename', (d, p, have, kin) => life.rename(kin, p.id, str(p.name)));
  itemAction('kin:path', (d, p, have, kin) => life.choosePath(d, kin, p.id, str(p.path), str(p.town)));
  itemAction('kin:incubate', (d, p, have, kin) => life.incubate(d, kin, p.id, have));
  itemAction('kin:train', (d, p, have, kin) => life.train(d, kin, p.id, str(p.stat)));
  itemAction('kin:companion', (d, p, have, kin) => life.setCompanion(kin, p.id)); // 곁에 둘 새끼 (사냥·강적에 함께 나섬)
  itemAction('kin:search', (d, p, have, kin) => life.searchRunaway(d, kin, p.id, have)); // 가출한 식구 직접 찾기
  itemAction('kin:seek', (d, p, have, kin) => life.sendSeek(kin, p.id, p.target)); // 새끼 드래곤을 보내 찾아오게
  itemAction('kin:errand', (d, p, have, kin) => life.sendErrand(kin, p.id, str(p.region), Number(p.minutes), ruin.unlocked(str(p.region)))); // 새끼 혼자 심부름
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
  itemAction('event:choose', (d, p, have, kin) => life.chooseEvent(d, kin, have, p.i), (d) => arena.checkMind(d)); // 오염 이벤트로 정신이 다 깎일 수 있음

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
        tier: logic.nestInfo(d).tier, maxKin: logic.maxKinOf(d),
        wards: { trap: logic.nestInfo(d).wards.trap || 0, stone: logic.nestInfo(d).wards.stone || 0 },
        raid: logic.raidView(d),
        guard: d.perks?.guard || null,
        forge: !!logic.nestInfo(d).forge, forgeCost: CRAFT.forge.cost, // 둥지 공방(화로)
        // 둥지 시설: 칸 수, 지은 시설과 그 힘, 일하는 식구, 오늘 할 수 있는 것
        facilities: (() => {
          const fac = logic.facOf(d);
          const today = logic.dayIdx();
          const workers = {};
          for (const k of kin) if (k.type === 'human' && k.status === 'home' && k.data.job) workers[k.data.job] = k;
          return {
            slots: logic.facSlots(d),
            built: Object.keys(fac).filter((id) => FACILITY.list[id]).map((id) => {
              const w = workers[id];
              const v = w && life.views([w], Date.now(), d).home[0];
              return { id, power: logic.facPower(d, id), worker: w ? { id: w.id, name: w.name, working: !!v?.job?.working, apprentice: !!v?.job?.apprentice, fit: !!v?.job?.fit } : null,
                herbDone: id === 'herb' ? fac.herb.day === today : undefined, cookLeft: id === 'kitchen' ? life.cookLeft(d) : undefined };
            }),
          };
        })(),
        offers: social.kinOffers(d),            // 식구 입양 제안 (받은 것·보낸 것)
        partnerKin: (() => {                     // 반려의 둥지에 와 있으면 그 집 식구 (같이 돌보기)
          const ph = logic.hooks.partnerNest(d);
          if (!ph || ph.region !== d.region || d.exp_end) return null;
          const v = life.views(db.kinLoad(ph.id), Date.now(), d);
          return { id: ph.id, name: ph.name, home: v.home };
        })(),
      },
    });
  });

  // ── 보물 도둑 쫓기: 사냥처럼 직접 싸움. 이기면 훔쳐 간 것을 되찾음 ──
  socket.on('raid:chase', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const d = entry.dragon;
    if (logic.berserkOf(d)) return ack({ error: BERSERK });
    if (logic.isFallen(d)) return ack({ error: FALLEN });
    if (arena.inBattle(d.id)) return ack({ error: '이미 싸우는 중이다.' });
    logic.regen(d);
    const why = logic.chaseCheck(d);
    if (why) return ack(why);
    const raid = logic.nestInfo(d).raid;
    logic.spendAp(d, RAID.chaseAp);
    const { battle, lines, c } = combat.raidBattle(d, raid);
    const view = arena.startHunt(d, battle, c, (dd, r) => {
      // 이기거나 쓰러지면 도둑 일은 끝남 (물러나면 흔적이 남은 동안 다시 쫓을 수 있음)
      if (r.settled) { const ni = logic.nestInfo(dd); ni.raid = null; ni.calm = Date.now() + RAID.calm; ni.raidAt = Date.now(); }
      if (r.wound) r.lines.push(...logic.traitCount(dd, 'wound'));
    }, (dd, b, cc) => combat.raidReward(dd, b, cc, raid));
    db.saveState(d);
    sendMe(socket, d);
    ack({ ok: true, result: { title: '도둑 추격', hunt: true, raid: true, battle: view, lines, items: [], gold: 0, xp: 0 } });
  });

  // ── 환영 공지: 계정마다 처음 들어올 때(와 GM이 다시 띄울 때) 한 번 ──
  socket.on('welcome:seen', (p, ack) => {
    db.welcomeSet(user.id, welcomeOf().ver);
    if (typeof ack === 'function') ack({ ok: true });
  });
  socket.on('gm:welcome:get', (p, ack) => {
    if (typeof ack !== 'function') return;
    if (!socket.data.user?.is_gm) return ack({ error: 'GM만 쓸 수 있다.' });
    ack({ ok: true, welcome: welcomeOf() });
  });
  socket.on('gm:welcome:set', (p, ack) => {
    if (typeof ack !== 'function') return;
    if (!socket.data.user?.is_gm) return ack({ error: 'GM만 쓸 수 있다.' });
    const text = (typeof p?.text === 'string' ? p.text : '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim().slice(0, WELCOME_MAX);
    if (!text) return ack({ error: '공지 내용을 적자.' });
    const cur = welcomeOf();
    const w = { text, ver: p?.again ? cur.ver + 1 : cur.ver };
    db.worldSet('welcome', w);
    db.gmLog(socket.data.user.username, null, `환영 공지를 고침${p?.again ? ' (모두에게 다시 띄움)' : ''}`);
    if (p?.again) io.emit('welcome', { ...w, seen: -1 }); // 접속 중인 모두에게 바로 (seen −1: 다시 띄우라는 뜻)
    ack({ ok: true, welcome: w });
  });

  // ── 업데이트 노트 ──
  socket.on('notes:get', (p, ack) => { if (typeof ack === 'function') ack({ ok: true, list: notesOf() }); });
  // 새로 올리기(id 없음) 또는 고치기(id 있음)
  socket.on('gm:note:save', (p, ack) => {
    if (typeof ack !== 'function') return;
    if (!socket.data.user?.is_gm) return ack({ error: 'GM만 쓸 수 있다.' });
    const title = str(p?.title).replace(/\s+/g, ' ').slice(0, NOTE.titleMax);
    const body = (typeof p?.body === 'string' ? p.body : '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim().slice(0, NOTE.bodyMax);
    if (!title) return ack({ error: '제목을 적자.' });
    if (!body) return ack({ error: '내용을 적자.' });
    const list = notesOf().slice();
    const id = Number(p?.id) || 0;
    if (id) {
      const i = list.findIndex((n) => n.id === id);
      if (i < 0) return ack({ error: '그 노트를 찾지 못했다.' });
      list[i] = { ...list[i], title, body };
      db.worldSet('notes', list);
      db.gmLog(socket.data.user.username, null, `업데이트 노트를 고침: ${title}`);
      return ack({ ok: true, list });
    }
    const n = { id: Date.now(), date: kstDate(), title, body };
    list.unshift(n);
    db.worldSet('notes', list.slice(0, NOTE.max));
    db.gmLog(socket.data.user.username, null, `업데이트 노트를 올림: ${title}`);
    io.emit('notes:latest', { id: n.id });
    ack({ ok: true, list: notesOf() });
  });
  socket.on('gm:note:delete', (p, ack) => {
    if (typeof ack !== 'function') return;
    if (!socket.data.user?.is_gm) return ack({ error: 'GM만 쓸 수 있다.' });
    const list = notesOf();
    const n = list.find((x) => x.id === Number(p?.id));
    if (!n) return ack({ error: '그 노트를 찾지 못했다.' });
    db.worldSet('notes', list.filter((x) => x !== n));
    db.gmLog(socket.data.user.username, null, `업데이트 노트를 지움: ${n.title}`);
    ack({ ok: true, list: notesOf() });
  });

  // ── 멸망한 대륙: 정화도와 기여 순위, 생존자와의 교환 ──
  socket.on('ruin:get', (p, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const d = entry.dragon;
    ack({ ok: true, view: ruin.view(d), top: ruin.top(5), exchange: d.region === RUIN.gateTo ? RUIN.exchange : null, shards: db.itemCount(d.id, 'purify_shard') });
  });
  itemAction('ruin:trade', (d, p, have) => {
    if (d.region !== RUIN.gateTo) return { error: `${REGIONS[RUIN.gateTo].name}의 생존자에게서만 바꿀 수 있다.` };
    const x = RUIN.exchange.find((e) => e.id === str(p.id));
    if (!x) return { error: '바꿀 수 없는 물건이다.' };
    const qty = Math.max(1, Math.min(20, Math.floor(Number(p.qty)) || 1));
    const cost = x.cost * qty;
    if (have('purify_shard') < cost) return { error: `정화의 결정이 모자란다. (${cost}개 필요)` };
    const name = ITEMS[x.id].name;
    return { title: '생존자 오르샤', lines: [`정화의 결정 ${cost}개를 건네자, 오르샤가 낡은 상자에서 ${name}${qty > 1 ? ` ${qty}개` : ''}${josa(qty > 1 ? '개' : name, '을', '를')} 꺼내 주었다.`, '"이 땅을 맑게 해 주는 대가요. 부디 무사히 돌아가시오."'], items: [{ id: 'purify_shard', qty: -cost }, { id: x.id, qty }] };
  });

  // GM: 지금 바로 새 오염을 일으킴 (region을 비우면 다음 차례 지역)
  socket.on('gm:corrupt', (p, ack) => {
    if (typeof ack !== 'function') return;
    if (!socket.data.user?.is_gm) return ack({ error: 'GM만 쓸 수 있다.' });
    const now = Date.now();
    const next = logic.corruptPeriod(now) + 1;
    const want = str(p?.region);
    if (want && (!REGIONS[want] || SHOPS[want] || logic.isRuin(want))) return ack({ error: '인간 마을과 멸망한 대륙에는 일으킬 수 없다.' });
    corruptClock = { off: now, bump: next, force: want ? { period: next, region: want } : null };
    db.worldSet('corruptClock', corruptClock);
    const region = logic.corruptedRegion(now);
    db.gmLog(socket.data.user.username, null, `오염을 일으킴: ${REGIONS[region].name}`);
    io.emit('system', { text: `[오염] ${REGIONS[region].name}에 검은 기운이 번졌다! 함께 정화하자.`, at: now });
    for (const e of online.values()) sendMe(e.socket, e.dragon);
    ack({ ok: true, region, until: logic.corruptUntil(now) });
  });

  // 이야기 창: 위로 올려서 지난 말 더 불러오기 (지금 지역의 말과 용언을 섞어 before보다 앞의 것)
  socket.on('chat:older', (p, ack) => {
    if (typeof ack !== 'function') return;
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const before = Math.floor(Number(p?.before));
    if (!(before > 0)) return ack({ error: '불러올 곳을 모르겠다.' });
    const N = HISTORY;
    const list = [
      ...db.olderChat(entry.dragon.region, before, N),
      ...db.olderChat(SHOUT_REGION, before, N).map((m) => ({ ...m, shout: true })),
    ].sort((a, b) => a.id - b.id).slice(-N);
    ack({ ok: true, history: withTitles(list), more: list.length >= N });
  });

  socket.on('weather:get', (p, ack) => { if (typeof ack === 'function') ack({ ok: true, weather: weatherAll() }); });

  // GM: 한 지역의 날씨를 정해진 시간 동안 바꿈 (id가 비면 원래대로)
  socket.on('gm:weather', (p, ack) => {
    if (typeof ack !== 'function') return;
    if (!socket.data.user?.is_gm) return ack({ error: 'GM만 쓸 수 있다.' });
    const r = str(p?.region);
    if (!REGIONS[r]) return ack({ error: '그런 지역은 없다.' });
    const id = str(p?.id);
    if (!id) delete logic.weatherDebug[r];
    else {
      if (!WEATHERS[id]) return ack({ error: '그런 날씨는 없다.' });
      const h = Math.max(0.1, Math.min(48, Number(p?.hours) || 3));
      logic.weatherDebug[r] = { id, until: Date.now() + h * 3600000 };
    }
    db.gmLog(socket.data.user.username, null, id ? `${REGIONS[r].name}의 날씨를 ${WEATHERS[id].name}${josa(WEATHERS[id].name, '으로', '로')} 바꿈` : `${REGIONS[r].name}의 날씨를 원래대로`);
    const cur = weatherAll();
    wxLast = cur;
    io.emit('weather', cur);
    ack({ ok: true, weather: cur, log: db.gmLogList(40) });
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
    // 광폭화 중에는 말을 잃음 (텔레파시만 가능)
    if (logic.berserkOf(entry.dragon)) return socket.emit('system', { text: '광폭화 중에는 말을 할 수 없다. 텔레파시로만 마음을 전할 수 있다.', at: Date.now() });

    const now = Date.now();
    if (now - (socket.data.lastChat || 0) < CHAT_COOLDOWN) return;
    socket.data.lastChat = now;

    const d = entry.dragon;
    const msg = { dragonId: d.id, name: d.name, kind: d.kind, text, at: now };
    msg.id = db.addChat(d.region, msg);
    io.to(d.region).emit('chat', { ...msg, title: logic.titleName(d), av: d.has_avatar ? d.avatar_ver : 0 });
  });

  // 용언: 대륙의 모든 드래곤에게 텔레파시로 외침
  socket.on('shout', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
    const text = str(payload?.text).slice(0, CHAT_MAX);
    if (!text) return ack({ error: '외칠 말을 적자.' });
    if (logic.berserkOf(entry.dragon)) return ack({ error: '광폭화 중에는 외칠 수 없다. 텔레파시로만 마음을 전할 수 있다.' });
    const now = Date.now();
    if (now - (socket.data.lastChat || 0) < CHAT_COOLDOWN) return ack({ error: '숨을 고르고 다시 외치자.' });
    const d = entry.dragon;
    socket.data.lastChat = now;
    const msg = { dragonId: d.id, name: d.name, kind: d.kind, text, at: now };
    msg.id = db.addChat(SHOUT_REGION, msg);
    io.emit('chat', { ...msg, shout: true, title: logic.titleName(d), av: d.has_avatar ? d.avatar_ver : 0 });
    ack({ ok: true });
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
    (row.region === SHOUT_REGION ? io : io.to(row.region)).emit('chat:deleted', { id: row.id }); // 용언은 모두에게서
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

  // 비밀번호 바꾸기: 지금 비밀번호를 확인하고 새 비밀번호로. 이 기기만 로그인을 유지하고 다른 기기는 끊김
  socket.on('account:password', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const u = db.getUserByName(user.username);
    const cur = typeof payload?.current === 'string' ? payload.current : '';
    const next = typeof payload?.next === 'string' ? payload.next : '';
    if (!u || !cur || !bcrypt.compareSync(cur, u.pw_hash)) return ack({ error: '지금 비밀번호가 맞지 않는다.' });
    if (next.length < 4 || next.length > 64) return ack({ error: '새 비밀번호는 4~64자로 정해야 한다.' });
    if (next === cur) return ack({ error: '지금 비밀번호와 다른 비밀번호를 정하자.' });
    db.setPassword(u.id, bcrypt.hashSync(next, 10), socket.handshake.auth?.token || null);
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
      arena.onLeave(d.id, true);
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

  // ── 먼 여행: 지금 드래곤은 대륙을 떠나고(기록은 남음), 같은 계정으로 새 드래곤을 만듦 ──
  // 레벨 DEPART.minLevel 이상이면 새 드래곤에게 의지(능력치 포인트·칭호)를 이어 줌. 재산·둥지·식구는 함께 떠남
  socket.on('dragon:depart', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '떠날 드래곤이 없다.' });
    const d = entry.dragon;
    if (str(payload?.name) !== d.name) return ack({ error: `확인을 위해 드래곤 이름 '${d.name}'${josa(d.name, '을', '를')} 그대로 적어야 한다.` });
    if (arena.inBattle(d.id)) return ack({ error: '싸우는 중에는 떠날 수 없다.' });
    if (logic.berserkOf(d)) return ack({ error: BERSERK });
    if (logic.isFallen(d)) return ack({ error: '쓰러진 채로는 떠날 수 없다. 먼저 일어서거나 긴 잠을 정하자.' });
    if (d.exp_end) return ack({ error: '원정에서 돌아온 뒤에 떠나자.' });
    const now = Date.now();
    const words = str(payload?.words).replace(/\s+/g, ' ').slice(0, DEPART.wordsMax);
    const legacy = d.level >= DEPART.minLevel
      ? { name: d.name, kind: d.kind, level: d.level, pts: Math.min(DEPART.max, Math.floor(d.level * DEPART.perLevel)), at: now, words: str(payload?.words).replace(/\s+/g, ' ').slice(0, DEPART.wordsMax) }
      : null;
    logic.regen(d, now);
    d.rest_at = null;
    d.fallen = { departed: true, closed: true, at: now, region: d.region, words };
    logic.chron(d, 'mark', `먼 여행을 떠났다.${legacy ? ' 의지는 새로운 드래곤에게 이어진다.' : ''}`);
    db.saveState(d);
    db.depart(d);
    d.dead_at = now;
    if (legacy) db.legacySet(user.id, legacy);
    for (const o of db.offersTo(d.id)) db.offerDel(o.id); // 받은 입양 제안은 지움 (보낸 제안은 동료가 받아 줄 수 있게 둠)
    social.onLeave(d.id);
    arena.onLeave(d.id, true);
    online.delete(d.id);
    socket.leave(d.region);
    socket.data.dragonId = null;
    const ga = `${d.name}${josa(d.name, '이', '가')}`;
    io.emit('system', { text: `[먼 여행] ${ga} 먼 여행을 떠났다.${words ? ` "${words}"` : ''}${legacy ? ' 그 의지는 새로운 드래곤에게 이어진다.' : ''}`, at: now });
    for (const r of db.relList(d.id)) {
      if (r.kind !== 'friend') continue;
      const text = `동료 ${ga} 먼 여행을 떠났다.${words ? ` 남긴 말: "${words}"` : ''}`;
      const e = online.get(r.id);
      if (e) e.socket.emit('notice', { title: '먼 여행', lines: [text] });
      else db.noteAdd(r.id, text);
    }
    broadcastPresence(d.region);
    broadcastCounts();
    io.emit('rescue:list', death.rescues());
    ack({ ok: true, legacy });
  });

  // GM: 내 드래곤을 정리하고 같은 계정으로 처음부터 다시 만들기 (GM 권한은 그대로)
  socket.on('gm:remake', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const u = db.getUserByName(user.username);
    if (!u || !u.is_gm) return ack({ error: 'GM만 할 수 있다.' });
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '정리할 드래곤이 없다.' });
    const d = entry.dragon;
    if (str(payload?.name) !== d.name) return ack({ error: `확인을 위해 드래곤 이름 '${d.name}'을 그대로 적어야 한다.` });
    if (arena.inBattle(d.id)) return ack({ error: '싸우는 중에는 할 수 없다. 싸움을 끝낸 뒤 다시 하자.' });
    if (logic.berserkOf(d)) return ack({ error: '광폭화 중에는 할 수 없다.' });
    social.onLeave(d.id);
    arena.onLeave(d.id, true);
    online.delete(d.id);
    socket.leave(d.region);
    socket.data.dragonId = null;
    system(d.region, `${d.name}${josa(d.name, '이', '가')} 바람 속으로 흩어져 사라졌다.`);
    broadcastPresence(d.region);
    broadcastCounts();
    db.gmLog(user.username, d.name, '내 드래곤을 정리하고 새로 만들기');
    db.deleteDragon(d.id);
    io.emit('rescue:list', death.rescues());
    ack({ ok: true });
  });

  social.attach(socket);
  gm.attach(socket);
  arena.attach(socket);
  death.attach(socket);
  boss.attach(socket);

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
