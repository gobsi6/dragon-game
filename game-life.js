// 둥지의 삶: 이벤트 엔진과 둥지 식구(인간 아이, 알과 새끼 드래곤)
// 숫자는 game-data.js의 KIN·TALENTS·EVENT_RULES, 이벤트 내용은 game-events.js에서 조절합니다.
//
// 식구(kin) 하나의 모양: { id, type: 'human'|'drake', status, name, data }
//   status: home(함께 삶) egg(알) returned(마을로 돌아감) dead(세상을 떠남) independent(독립함)
// 모든 함수는 식구 목록 kin을 직접 바꿉니다. 새 식구는 id가 null이고, 저장은 server.js가 합니다.

const {
  ITEMS, KINDS, REGIONS, SHOPS, STATS, REGION_LOOT, PLACES, FACILITY, RECIPES, DAY, KIN, TALENTS, HUMAN_NAMES, DRAKE_NAMES, EVENT_RULES, KIN_LOOKS, KIN_TRAITS, KIN_TRAIT_RULES, KIN_GROW, KIN_PLAY, KIN_TOUCH, KIN_BOND, KIN_FEST, FESTIVAL,
} = require('./game-data');
const logic = require('./game-logic');
const EVENTS = require('./game-events');

const STAT_KEYS = STATS.map((s) => s.key);
const H = KIN.human;
const R = KIN.drake;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
function josa(word, a, b) {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return `${a}(${b})`;
  return c % 28 ? a : b;
}
const ga = (k) => `${k.name}${josa(k.name, '이', '가')}`;
const fmtDays = (d) => (d >= 1 ? `${Math.ceil(d)}일` : `${Math.max(1, Math.ceil(d * 24))}시간`);

// ── 나이와 성장 단계 ──────────────────────────────
const isHome = (k) => k.status === 'home' || k.status === 'egg';
const ageOf = (k, now) => (k.data.born ? (now - k.data.born) / DAY : 0);
// 새끼 드래곤이 이 단계에서 더 자랄 수 있는 몫 (능력치 합의 상한 − 지금 합). 0이면 더 자라지 않음
function statRoom(k, now = Date.now()) {
  if (k.type !== 'drake' || !k.data.stats) return 0;
  const cap = (R.statCap || [])[stageOf(k, now).i];
  if (cap == null) return Infinity;
  return Math.max(0, cap - STAT_KEYS.reduce((a, s) => a + (k.data.stats[s] || 0), 0));
}
function stageOf(k, now) {
  if (k.status === 'egg') return { i: -1, name: '알', next: null };
  const list = k.type === 'human' ? H.stages : R.stages;
  let i = 0;
  const a = ageOf(k, now);
  list.forEach((s, j) => { if (a >= s.from) i = j; });
  return { i, name: list[i].name, next: list[i + 1] ? list[i + 1].from : null };
}
// 함께 사는 식구들: 인간, 깨어난 새끼, 알
function homeKin(kin, max = KIN.maxKin) {
  const home = kin.filter(isHome);
  return {
    home,
    humans: home.filter((k) => k.type === 'human'),
    drakes: home.filter((k) => k.type === 'drake' && k.status === 'home'),
    eggs: home.filter((k) => k.status === 'egg'),
    full: home.length >= max,
    max,
  };
}
const findKin = (kin, id) => kin.find((k) => k.id === Number(id) && isHome(k));
const atNest = (d) => {
  if (d.exp_end) return '원정을 떠나 있는 동안에는 할 수 없다.';
  if (!d.nest || d.region !== d.nest) return '식구는 둥지에 있을 때만 돌볼 수 있다.';
  return null;
};

// 가장 가까운 인간 마을
function nearestTown(region) {
  const r = REGIONS[region];
  return Object.keys(SHOPS).sort((a, b) =>
    Math.hypot(REGIONS[a].x - r.x, REGIONS[a].y - r.y) - Math.hypot(REGIONS[b].x - r.x, REGIONS[b].y - r.y))[0];
}

// ── 타고난 모습 (성별·생김새·성격) ─────────────────
const TR = KIN_TRAIT_RULES;
const hasT = (k, id) => !!k.data.traits && k.data.traits.includes(id);

// ── 함께한 날들: 아이마다 겪은 일을 남김 (떠난 뒤에도 '지난 식구'에서 볼 수 있음) ──
const DIARY_MAX = 60;
const ORIGIN_LINE = { abandoned: '성문 곁 바구니에서 발견되어 둥지로 왔다.', lost: '홀로 남은 채 발견되어 둥지로 왔다.', tribute: '마을이 바친 아이로 둥지에 왔다.' };
// 일기가 없던 식구(이 기능 전부터 있던 식구 포함)에게 첫 장을 씀
function diaryStart(k) {
  if (k.data.diary || k.status === 'egg' || k.status === 'cold') return;
  k.data.diary = [{ at: k.data.born || Date.now(), t: k.type === 'drake' ? '알에서 깨어났다.' : (ORIGIN_LINE[k.data.origin] || '둥지 식구가 되었다.') }];
}
// 예전 첫사랑 기록 채우기: 이름이 들어간 줄이 생기기 전에 첫사랑이 정해진 아이에게 한 번만 (서버를 켤 때)
// 날짜는 예전에 남은 "'아이의 첫사랑' — …" 줄과 같게, 그 줄이 없으면 청소년이 된 날. 바뀌었으면 true
function loveDiaryFix(k) {
  const d = k?.data, nm = d?.firstLove;
  if (k?.type !== 'human' || !nm || nm === '-' || d.loveDiary || !Array.isArray(d.diary)) return false;
  let owner = d.loveRef?.ownerName || null;
  if (!owner) { const c = Object.values(d.friends || {}).filter((x) => x.type === 'human' && x.name === nm); if (c.length === 1) owner = c[0].owner || null; } // 예전 기록: 같은 이름의 단짝이 하나면 그 아이
  const text = owner ? `${owner}의 둥지에 사는 ${nm}${josa(nm, '을', '를')} 좋아하게 되었다.`
    : d.loveRef ? `${nm}${josa(nm, '을', '를')} 좋아하게 되었다.` : `마을에 사는 ${nm}${josa(nm, '을', '를')} 좋아하게 되었다.`;
  const i = d.diary.findIndex((x) => typeof x.t === 'string' && x.t.startsWith("'아이의 첫사랑'"));
  if (i >= 0) d.diary.splice(i, 0, { at: d.diary[i].at, t: text }); // 이벤트 줄 바로 앞 (같은 날짜)
  else {
    const teen = (KIN.human.stages.find((s) => s.name === '청소년') || { from: 4 }).from;
    const at = d.born != null ? d.born + teen * DAY : Date.now();
    let j = d.diary.findIndex((x, n) => n > 0 && x.at > at); if (j < 0) j = d.diary.length; // 날짜 순서에 맞는 자리 (첫 장은 맨 앞 그대로)
    d.diary.splice(j, 0, { at, t: text });
  }
  if (d.diary.length > DIARY_MAX) d.diary.splice(1, d.diary.length - DIARY_MAX);
  d.loveDiary = true;
  return true;
}
function diary(k, text, now = Date.now()) {
  if (!k || !k.data) return;
  diaryStart(k);
  if (!k.data.diary) return;
  k.data.diary.push({ at: now, t: text });
  if (k.data.diary.length > DIARY_MAX) k.data.diary.splice(1, k.data.diary.length - DIARY_MAX); // 첫 장은 늘 남김
}

// 유대 올리기: 꼭대기로 갈수록 덜 오름 (KIN_BOND.curve). 내리는 것은 그대로. 실제로 오른 만큼을 돌려줌
function addBond(k, n) {
  if (!k) return 0;
  const before = k.data.bond || 0;
  if (!(n > 0)) { k.data.bond = clamp(before + (n || 0)); return k.data.bond - before; }
  let b = before, left = n;
  for (const [cap, rate] of KIN_BOND.curve) {
    if (b >= cap) continue;
    const room = (cap - b) / rate;           // 이 구간을 다 채우는 데 드는 양
    const use = Math.min(left, room);
    b += use * rate; left -= use;
    if (left <= 0) break;
  }
  k.data.bond = clamp(Math.round(b * 10) / 10);
  if (k.data.bond >= 100 && !k.data.bondTop) { k.data.bondTop = Date.now(); diary(k, '보호자를 세상에서 가장 믿게 되었다.'); } // 처음 100에 닿은 날
  return Math.round((k.data.bond - before) * 10) / 10;
}

// ── 자라며 생기는 성격 (KIN_GROW) ─────────────────
const GR = KIN_GROW;
const clingyish = (k) => hasT(k, 'clingy') || hasT(k, 'dignified'); // 응석받이가 자라 속이 깊어져도 정은 그대로
// 자람 기록에 더함 (함께 쉼·원정·먹을 것·고른 태도·가르친 능력치 …)
function growAdd(k, key, n = 1) {
  if (!k || !k.data || k.status !== 'home') return;
  const g = (k.data.grow ||= {});
  g[key] = (g[key] || 0) + n;
}
const isGrown = (k) => ['어른', '노년', '젊은 용', '다 자란 용'].includes(stageOf(k, Date.now()).name); // 다 큰 식구 (힌트·성격 문장을 나이에 맞게)
// from: 타고난 성격이 자라 바뀐 것(수줍은 → 마음을 연 등)은 타고난 몫이라 세지 않음
const grownCount = (k) => (k.data.traits || []).filter((id) => KIN_TRAITS[id]?.grown && !KIN_TRAITS[id].from).length;
// 아직 붙지 않은 성격 가운데 자람 기록 점수가 가장 큰 것
function growBest(k) {
  const g = k.data.grow || {};
  let best = null;
  for (const p of GR.paths[k.type] || []) {
    if (hasT(k, p.trait)) continue;
    const v = p.keys.reduce((a, key) => a + (g[key] || 0), 0) / p.unit;
    if (!best || v > best.v) best = { ...p, v };
  }
  return best;
}
// 성격이 붙을 때인지 봄. stageUp: 자라는 단계가 막 바뀜 (점수 1 이상) / 아니면 특별한 순간 (점수 special 이상)
function growCheck(d, k, lines, stageUp) {
  if (k.status !== 'home' || grownCount(k) >= GR.max) return;
  const b = growBest(k);
  if (!b || b.v < (stageUp ? 1 : GR.special)) return;
  (k.data.traits ||= []).push(b.trait);
  const name = KIN_TRAITS[b.trait].name;
  const why = (isGrown(k) && b.whyGrown) || b.why; // 다 큰 식구에게는 '아이를·새끼를' 같은 말 대신
  lines.push(stageUp
    ? `${why} ${k.name}에게 '${name}' 성격이 생겼다.`
    : `어느 날 문득 알게 되었다. ${why} ${k.name}에게 '${name}' 성격이 생겼다.`);
  logic.chron(d, 'mark', `${k.name}에게 '${name}' 성격이 생겼다.`);
  diary(k, `'${name}' 성격이 생겼다. ${why}`);
}
// 성격이 자람: 수줍은 → 마음을 연 (유대가 높아지면), 응석받이 → 속 깊은 (다 자란 용이 되면)
function growUp(d, k, lines, from, to, line) {
  if (!hasT(k, from) || hasT(k, to)) return;
  k.data.traits = k.data.traits.map((id) => (id === from ? to : id));
  lines.push(line);
  logic.chron(d, 'mark', `${k.name}의 '${KIN_TRAITS[from].name}' 성격이 자라 '${KIN_TRAITS[to].name}' 성격이 되었다.`);
  diary(k, `'${KIN_TRAITS[from].name}' 성격이 자라 '${KIN_TRAITS[to].name}' 성격이 되었다.`);
}
// 식구 카드의 힌트: 가장 두드러진 기록 (아직 붙지 않았을 때)
function growHint(k) {
  if (k.status !== 'home' || grownCount(k) >= GR.max) return null;
  const b = growBest(k);
  return b && b.v >= GR.hint ? (isGrown(k) && b.hintGrown) || b.hint : null; // 다 큰 식구는 그 나이에 맞는 말로
}
// ── 소꿉친구 (KIN_PLAY): 다른 둥지의 아이와 놀기. server.js가 가까운 둥지를 찾아 부름 ──
const PL = KIN_PLAY;
// {a}[이/가] 같은 자리에 이름을 넣고 조사를 맞춤
const fillT = (tpl, names) => tpl.replace(/\{([abo])\}(\[([^/\]]+)\/([^\]]+)\])?/g, (m, w, _x, j1, j2) => { const nm = names[w] || ''; return j1 ? `${nm}${josa(nm, j1, j2)}` : nm; });
// 지금 놀러 나갈 수 있는 식구 (둥지에 있고, 원정·심부름·가출 중이 아니고, 놀 나이)
const playable = (kin, now = Date.now()) => kin.filter((k) => k.status === 'home' && !k.data.onExp && !k.data.errand && !k.data.runaway && !k.data.companion && PL.stages.includes(stageOf(k, now).name));
const friendKey = (ownerId, k) => `${ownerId}:${k.id}`;
// a(내 아이, 보호자 me)와 b(다른 둥지 아이, 보호자 other)가 함께 놂. 두 아이의 기록을 모두 바꾸고, 양쪽 보호자에게 보일 문장을 돌려줌
function playTogether(a, me, b, other, now = Date.now()) {
  const meet = (x, y, yOwner) => {
    const fr = (x.data.friends ||= {});
    const f = (fr[friendKey(yOwner.id, y)] ||= { n: 0 });
    Object.assign(f, { name: y.name, type: y.type, owner: yOwner.name, ownerId: yOwner.id, at: now });
    f.n += 1;
    // 친구가 너무 많아지면 가장 덜 만난 친구부터 잊음
    const keys = Object.keys(fr);
    if (keys.length > PL.keepFriends) delete fr[keys.sort((p, q) => fr[p].n - fr[q].n || fr[p].at - fr[q].at)[0]];
    addBond(x, PL.bond + (hasT(x, 'sociable') || hasT(x, 'packmate') ? PL.sociable : 0)); // 친구가 많은·어울리기 좋아하는
    growAdd(x, 'friend');
    return f.n;
  };
  const n = meet(a, b, other); meet(b, a, me);
  if (n === 1) { diary(a, `${other.name}의 둥지 ${b.name}${josa(b.name, '과', '와')} 처음 만나 함께 놀았다.`, now); diary(b, `${me.name}의 둥지 ${a.name}${josa(a.name, '과', '와')} 처음 만나 함께 놀았다.`, now); }
  if (n === PL.friendAt) { diary(a, `${other.name}의 둥지 ${b.name}${josa(b.name, '과', '와')} 단짝이 되었다.`, now); diary(b, `${me.name}의 둥지 ${a.name}${josa(a.name, '과', '와')} 단짝이 되었다.`, now); }
  const kind = (x) => (x.type === 'human' ? 'h' : 'd');
  const old = PL.older.includes(stageOf(a, now).name) || PL.older.includes(stageOf(b, now).name); // 큰 아이가 끼면 어린아이 놀이 대신
  const sceneFor = (x, y, yOwner) => fillT(pick((old ? PL.scenesOld : PL.scenes)[kind(x) + kind(y)]), { a: x.name, b: y.name, o: yOwner.name });
  const mine = [sceneFor(a, b, other)], theirs = [sceneFor(b, a, me)];
  if (n === PL.friendAt) {
    mine.push(fillT(PL.bestLine, { a: a.name, b: b.name, o: other.name }));
    theirs.push(fillT(PL.bestLine, { a: b.name, b: a.name, o: me.name }));
  }
  return { mine, theirs, best: n >= PL.friendAt };
}
// 가장 친한 친구 (첫사랑 상대 고르기 등)
const bestFriends = (k, type = null) => Object.values(k.data.friends || {}).filter((f) => f.n >= PL.friendAt && (!type || f.type === type)).sort((p, q) => q.n - p.n);
const satMul = (k) => (hasT(k, 'sturdy') ? GR.sturdySat : 1) * (hasT(k, 'greedy') ? GR.greedySat : 1) * (hasT(k, 'sleepyhead') ? GR.sleepySat : 1); // 튼튼한·늦잠꾸러기: 천천히, 먹성 좋은: 빨리
// 아직 모습이 정해지지 않은 식구에게 한 번만 정해 줌 (알은 깨어날 때)
function rollLooks(k) {
  if (k.data.sex || k.status === 'egg' || k.status === 'cold') return false;
  const L = KIN_LOOKS[k.type];
  k.data.sex = Math.random() < 0.5 ? 'm' : 'f';
  k.data.looks = k.type === 'human'
    ? [pick(L.hair), pick(L.eyes), pick(L.mark), pick(L.build)]
    : [`${pick(L.scale)} ${(KINDS[k.data.kind]?.name || '').replace(/\s*드래곤$/, '')} 비늘`.replace(/\s+/g, ' '), pick(L.horn), pick(L.eyes), pick(L.mark), pick(L.tail)];
  const pool = Object.keys(KIN_TRAITS).filter((id) => (KIN_TRAITS[id].for === k.type || KIN_TRAITS[id].for === 'both') && !KIN_TRAITS[id].grown);
  const got = [];
  while (got.length < TR.count && pool.length) got.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  k.data.traits = got;
  if (k.type === 'human' && !k.data.favFood) k.data.favFood = pick(KIN.hunger.meals); // 가장 좋아하는 요리 (먹여 보면 알게 됨)
  // 타고난 기울기 (아직 재주가 정해지지 않은 아이만)
  if (k.type === 'human' && k.data.lean && !k.data.talent) {
    if (hasT(k, 'brave')) k.data.lean.guard += 1;
    if (hasT(k, 'handy')) k.data.lean.smith += 1;
    if (hasT(k, 'flowers')) k.data.lean.herbalist += 1;
  }
  return true;
}
// 나중에 생긴 생김새 칸(인간: 체격, 새끼: 꼬리)을 예전 식구에게도 한 번 채워 줌
function fillLooks(k) {
  if (!Array.isArray(k.data.looks) || !k.data.sex) return;
  const L = KIN_LOOKS[k.type];
  if (k.type === 'human' && k.data.looks.length === 3) k.data.looks.push(pick(L.build));
  if (k.type === 'drake' && k.data.looks.length === 4) k.data.looks.push(pick(L.tail));
  // 이름만 바뀐 꼬리는 새 이름으로, 빠진 꼬리 모양('돌돌 말리는 꼬리')은 남은 꼬리 중 하나로 (식구마다 늘 같은 것)
  const TAIL_RENAME = { '굵고 짧은 꼬리': '두툼한 꼬리' };
  if (k.type === 'drake' && TAIL_RENAME[k.data.looks[4]]) k.data.looks[4] = TAIL_RENAME[k.data.looks[4]];
  if (k.type === 'drake' && k.data.looks[4] && !L.tail.includes(k.data.looks[4])) k.data.looks[4] = L.tail[k.id % L.tail.length];
}
// "윤기 도는 레드 비늘에 굽은 뿔. 영리하고 응석받이 같다." 같은 소개
const traitNames = (k) => (k.data.traits || []).map((id) => KIN_TRAITS[id]?.name).filter(Boolean);
function introOf(k) {
  const sex = KIN_LOOKS.sex[k.type][k.data.sex];
  const [a, b, c, e] = k.data.looks;
  const look = k.type === 'human' ? `${a}에 ${b}, ${c}${e ? `, ${e}` : ''}` : `${a}에 ${b}${k.data.looks[4] ? `, ${k.data.looks[4]}` : ''}`; // 체격·꼬리 칸이 있으면 함께
  const who = `${sex}아이`;
  return `${who}${josa(who, '이다', '다')}. ${look}. ${traitNames(k).map((n) => `'${n}'`).join(', ')} 성격이다.`;
}

// ── 포만감 (인간 식구) ─────────────────────────────
const HG = KIN.hunger;
const isFood = (item) => (KIN.care[item]?.sat || 0) > 0;
// 지금 포만감으로 맞추고, 배부른 동안 쌓인 유대를 돌려줌. keeper: 둥지에 남은 약초꾼 어른이 돌봐 주는지
// R: 포만감 규칙 (인간 HG, 새끼 드래곤 DF). floor: 이 아래로 떨어지지 않음 (돌봐 주는 어른·스스로 사냥)
function satUpdate(k, now, keeper, R = HG, floor = keeper ? HG.keeperFloor : 0) {
  if (k.data.sat == null) { k.data.sat = R.start; k.data.satAt = now; }
  const s0 = k.data.sat;
  const hours = Math.max(0, (now - (k.data.satAt || now)) / 3600000);
  const rate = R.perHour * satMul(k); // 튼튼한: 천천히, 먹성 좋은: 빨리
  let s = s0 - hours * rate;
  if (floor) s = Math.max(s, Math.min(s0, floor));
  s = Math.max(0, s);
  // 배부름(full 위)에 머문 시간만큼 유대
  const fullMs = s0 > R.full ? Math.min(hours, (s0 - R.full) / rate) * 3600000 : 0;
  k.data.fullAcc = (k.data.fullAcc || 0) + fullMs;
  let up = 0;
  while (k.data.fullAcc >= R.fullBondEvery) { k.data.fullAcc -= R.fullBondEvery; up++; }
  if (up) addBond(k, up);
  k.data.sat = Math.round(s * 10) / 10;
  k.data.satAt = now;
  return up;
}
const satWord = (s) => (s >= HG.full ? '배부름' : s >= 50 ? '든든함' : s >= HG.hungry ? '출출함' : '배고픔');
const DF = KIN.drakeFood;
const drakeFloor = (k, now) => (DF.selfFeed.includes(stageOf(k, now).name) ? DF.selfFloor : 0); // 젊은 용부터는 스스로 사냥
const drakeFull = (k) => (k.data.sat ?? 0) >= DF.full;
const hasKeeper = (kin, k) => kin.some((x) => x !== k && x.type === 'human' && x.status === 'home' && x.data.path === 'stay' && x.data.talent === 'herbalist');

// ── 새 식구 ────────────────────────────────────────
// 함께 사는 식구와 겹치지 않는 이름 (다 겹치면 아무거나)
function freshName(kin, names) {
  const used = new Set(kin.filter(isHome).map((k) => k.name));
  const free = names.filter((n) => !used.has(n));
  return pick(free.length ? free : names);
}
function newHuman(origin, now, town) {
  const lean = { herbalist: 0, smith: 0, guard: 0 };
  if (origin === 'abandoned') lean.herbalist += 1;   // 마을 사람들 손에서 자람
  if (origin === 'lost') lean.smith += 1;            // 홀로 버틴 손재주
  if (origin === 'tribute') lean.guard += 2;         // 겁먹지 않는 아이
  const k = {
    id: null, type: 'human', status: 'home', name: pick(HUMAN_NAMES),
    // lastCare를 돌보기 간격만큼 앞당겨 둬서, 데려오자마자 처음 돌보기를 할 수 있음
    data: { born: now, origin, town: town || null, bond: H.startBond, lean, trips: 0, lastCare: now - H.careCooldown, decayed: 0, stage: 0, sat: KIN.hunger.start, satAt: now },
  };
  rollLooks(k);
  return k;
}
// 짝 사이에서 태어난(또는 함께 데려온) 아이를 아기 식구로 들임. 둥지에 빈자리가 없으면 null
// parents: 두 부모 이름, town: 부모가 온 마을 (평판·돌려보낼 곳에 씀), d: 이 둥지의 주인 드래곤
function bornKid(kin, d, parents, name, found, town, now = Date.now()) {
  if (homeKin(kin, logic.maxKinOf(d)).full) return null;
  const k = newHuman(found ? 'found' : 'born', now, town || null);
  k.name = name;
  k.data.parents = parents.filter(Boolean);
  const [p1, p2] = k.data.parents;
  k.data.diary = [{ at: now, t: found
    ? `${p1}${josa(p1, '과', '와')} ${p2}${josa(p2, '이', '가')} 데려와 둥지 식구가 되었다.`
    : `${p1}${josa(p1, '과', '와')} ${p2} 사이에서 태어났다.` }];
  kin.push(k);
  return k;
}
function newEgg(kind, now) {
  return { id: null, type: 'drake', status: 'egg', name: pick(DRAKE_NAMES), data: { kind, found: now, incubateAt: null } };
}
function hatch(k, at) {
  const base = KINDS[k.data.kind].stats;
  k.status = 'home';
  Object.assign(k.data, {
    born: at, bond: 20, trains: 0, lastTrain: 0, lastHunt: at, stanceMs: {}, tickAt: at, stage: 0,
    stats: Object.fromEntries(STAT_KEYS.map((s) => [s, Math.round(base[s] / 3)])),
  });
  // 알일 때 받은 정성 (이벤트 '알 속의 두근거림')
  if (k.data.preBond) addBond(k, k.data.preBond);
  if (k.data.preStat && k.data.stats[k.data.preStat] != null) k.data.stats[k.data.preStat] += 1;
  rollLooks(k);
  diaryStart(k); // '알에서 깨어났다.'
}

// 어른이 될 때 정해지는 재주: 가장 많이 기운 쪽 (같으면 자라 온 내력대로)
function topLean(k) {
  const order = { tribute: 'guard', abandoned: 'herbalist', lost: 'smith' }[k.data.origin] || 'herbalist';
  let best = order;
  for (const [t, v] of Object.entries(k.data.lean)) if (v > k.data.lean[best]) best = t;
  return best;
}
// 세상을 떠나며 남기는 유품: 함께한 깊이에 따라
function keepsakeOf(k) {
  if (k.data.path === 'knight') return 'keepsake_sword';
  if (k.data.bond >= 70) return 'keepsake_scale';
  if (k.data.bond >= 40) return 'keepsake_toy';
  return 'keepsake_cloth';
}
// 새끼의 성격: 가장 오래 지켜본 어미의 성향
function personalityOf(k) {
  const ms = k.data.stanceMs || {};
  return Object.keys(ms).sort((a, b) => ms[b] - ms[a])[0] || 'hermit';
}

// ── 유대가 조금씩 옅어짐 ─────────────────────────
// 마지막으로 유대가 오른 때(어떤 방법이든)를 적어 두고, 오래 오르지 않으면 바닥선(floor)까지 조금씩 줄임
// 유대가 올랐는지는 지난번에 본 값(bondSeen)과 비교해서 알아냄 (돌보기·먹이·가르치기·놀기·함께 쉬기 등 어디서 올렸든)
const BF = KIN.bondFade;
function bondFade(k, now, out, d) {
  const b = k.data.bond ?? 0;
  const away = k.data.onExp || k.data.errand || k.data.runaway || k.data.companion || d?.rest_at; // 함께 있거나(곁에 둠·둥지에서 함께 쉬는 중) 둥지를 비운 동안은 멈춤
  if (k.data.bondSeen == null || b > k.data.bondSeen || away || !k.data.bondUpAt) { k.data.bondUpAt = now; k.data.fadeN = 0; }
  if (!away && !hasT(k, 'aloof') && !hasT(k, 'aloofd') && b > BF.floor) {
    const idle = (hasT(k, 'lonely') ? BF.lonelyH : BF.idleH) * 3600000;
    const every = BF.everyH * 3600000 * (hasT(k, 'steady') ? 2 : 1) * (hasT(k, 'tough') ? 1 / GR.tough : 1); // 혼자서도 씩씩한: 오래 돌보지 않을 때와 같이 4분의 1 덜 (간격 4/3배)
    const steps = Math.max(0, Math.floor((now - k.data.bondUpAt - idle) / every) + 1);
    const n = Math.min(steps - (k.data.fadeN || 0), b - BF.floor);
    if (n > 0) {
      k.data.bond = b - n;
      out.lines.push(`${ga(k)} 조금 서운해한다. 한동안 마음을 나누지 못했다. (유대 −${n})`);
    }
    k.data.fadeN = Math.max(k.data.fadeN || 0, steps);
  }
}

// ── 시간이 흐르며 일어나는 일 ──────────────────────
// 접속하거나 무언가를 할 때마다 부름. 지난 시간만큼 한꺼번에 계산함
function tick(d, kin, now = Date.now()) {
  const out = { lines: [], items: [], hoardItems: [], gold: 0 };
  // 곁에 둔 새끼와 함께 싸운 횟수 (전투 쪽이 드래곤에 적어 둔 것을 자람 기록으로)
  const cj = logic.combatJson(d);
  if (cj.allyFights) {
    for (const [id, n] of Object.entries(cj.allyFights)) growAdd(kin.find((x) => x.id === Number(id)), 'fight', n);
    delete cj.allyFights;
  }
  for (const k of kin) {
    // 원정이 끝났는데 '따라나섬'이 남아 있으면 풀어 줌 (긴 잠에 든 둥지에서 거둔 식구 등. 남아 있으면 시설 일을 못 함)
    if (k.data.onExp && !d.exp_end) k.data.onExp = false;
    // 모습이 정해지기 전에 들어온 식구 (이 기능이 생기기 전의 식구)
    if (k.status === 'home' && rollLooks(k)) out.lines.push(`${k.name}${josa(k.name, '을', '를')} 다시 찬찬히 들여다보았다. ${introOf(k)}`);
    if (k.status === 'home') { fillLooks(k); diaryStart(k); }
    if (k.status === 'home') { touchTick(k, now, out); bondGift(k, out, now); } // 교감: 아이가 먼저 조르기 · 놓침 · 서운함 · 유대가 깊으면 선물
    if (k.status === 'home' && k.type !== 'egg') bondFade(k, now, out, d); // 유대가 조금씩 옅어짐
    if (k.type === 'drake' && k.status === 'home' && k.data.errand && now >= k.data.errand.end) {
      const seek = k.data.errand.seek;
      if (seek) {
        const er = k.data.errand.region;
        k.data.errand = null;
        const t = findKin(kin, seek);
        if (t && isRunaway(t)) {
          t.data.runaway = null;
          addBond(t, RW.seekBond);
          addBond(k, 2);
          out.lines.push(`${ga(k)} ${t.name}${josa(t.name, '을', '를')} 데리고 돌아왔다. 둘은 서로 꼭 붙어 있다. (${t.name} 유대 +${RW.seekBond})`);
          const g = runawayGift(d, t, er, out);
          if (g) out.items.push(g);
        } else out.lines.push(`${ga(k)} 돌아왔다. 찾던 식구는 이미 둥지에 와 있었다.`);
      } else {
        const fe = finishErrand(k, now);
        out.items.push(...fe.items);
        out.lines.push(fe.line);
      }
    }
    // 가출: 하루에 한 번 굴림 / 가출 중이면 시간이 다 되었을 때 스스로 돌아옴
    if (k.status === 'home' && isRunaway(k) && now >= k.data.runaway.until && !k.data.runaway.seeker) {
      const r = k.data.runaway.region;
      k.data.runaway = null;
      addBond(k, RW.waitBond);
      out.lines.push(`${ga(k)} 스스로 둥지로 돌아왔다. ${canTalk(k, now) ? `"…아무도 찾으러 오지 않았어." ` : '고개를 푹 숙이고 구석으로 갔다. '}(유대 ${RW.waitBond})`);
      const g = runawayGift(d, k, r, out);
      if (g) out.items.push(g);
    } else if (k.status === 'home' && !isRunaway(k)) {
      const day = logic.dayIdx(now);
      if (k.data.runRoll !== day) {
        k.data.runRoll = day;
        if (Math.random() < runawayChance(k, now)) {
          const r = runawayRegion(d);
          k.data.runaway = { region: r, at: now, until: now + RW.hours * 3600000 };
          k.data.lastRunaway = now;
          out.lines.push(`${k.name}${josa(k.name, '이', '가')} 보이지 않는다. ${pick(RW_CLUE).replace('{r}', REGIONS[r].name)}`);
        }
      }
    }
    if (k.type === 'drake' && k.status === 'home') {
      const wasHungry = k.data.sat != null && k.data.sat < DF.hungry;
      satUpdate(k, now, false, DF, drakeFloor(k, now));
      if (!wasHungry && k.data.sat < DF.hungry) { out.lines.push(['젊은 용', '다 자란 용'].includes(stageOf(k, now).name) ? `${ga(k)} 배가 고픈지 둥지 입구에서 먼 들판을 한참 노려본다.` : `${ga(k)} 배가 고픈지 둥지 바닥을 발톱으로 긁으며 칭얼거린다.`); growAdd(k, 'hungry'); }
    }
    if (k.type === 'human' && k.status === 'home') {
      const a = ageOf(k, now);
      if (!k.data.favFood) k.data.favFood = pick(HG.meals);
      const wk = workerOf(k, now);
      const day = logic.dayIdx(now);
      if (wk && k.data.jobDay !== day) { // 일하는 날마다: 유대 조금, 견습이면 그 시설의 재주 쪽으로
        k.data.jobDay = day;
        addBond(k, 1 + (hasT(k, 'tidy') ? 1 : 0)); // 깔끔한: 1 더
        const tl = FACILITY.list[k.data.job].talent;
        if (!wk.adult && tl && !k.data.talent && k.data.lean) k.data.lean[tl] = (k.data.lean[tl] || 0) + 2;
      }
      const wasHungry = k.data.sat != null && k.data.sat < HG.hungry;
      satUpdate(k, now, hasKeeper(kin, k));
      if (!wasHungry && k.data.sat < HG.hungry) {
        out.lines.push(`${ga(k)} 배가 고픈지 자꾸 둥지 입구를 기웃거린다.`);
        growAdd(k, 'hungry');
        if (hasT(k, 'fussy')) { k.data.bond = clamp(k.data.bond - 1); out.lines.push(`투정쟁이 ${k.name}${josa(k.name, '이', '가')} 입을 삐죽 내밀었다. (유대 −1)`); }
      }
      // 오래 돌보지 않으면 유대가 줄어듦 (외로움을 타는: 하루 일찍 · 의젓한: 절반만)
      const idle = Math.floor((now - k.data.lastCare) / DAY) - (H.neglectAfter - (hasT(k, 'lonely') ? 1 : 0));
      if (idle > (k.data.decayed || 0)) {
        const n = Math.ceil((idle - (k.data.decayed || 0)) * H.neglectPerDay * (hasT(k, 'steady') ? 0.5 : 1) * (hasT(k, 'tough') ? GR.tough : 1)) + (hasT(k, 'crybaby') ? 1 : 0); // 울보: 1 더
        growAdd(k, 'neglect');
        k.data.bond = clamp(k.data.bond - n);
        k.data.decayed = idle;
        out.lines.push(`${ga(k)} 외로워한다. 한동안 돌봐 주지 못했다. (유대 −${n})`);
        out.lines.push(...logic.traitCount(d, 'neglect')); // 특성: 냉담
      }
      const st = stageOf(k, now);
      if (st.i > (k.data.stage || 0)) {
        k.data.stage = st.i;
        if (a < H.adultDay) { out.lines.push(`${ga(k)} 자라서 '${st.name}'${josa(st.name, '이', '가')} 되었다.`); diary(k, `'${st.name}'${josa(st.name, '이', '가')} 되었다.`, now); bondDip(k, st, out, now); }
        else if (st.name === '노년' && a < H.lifespan) { out.lines.push(`${k.name}의 머리에 흰 서리가 내렸다. 남은 날이 많지 않다.`); diary(k, '머리에 흰 서리가 내렸다.', now); }
        if (st.name !== '노년') growCheck(d, k, out.lines, true); // 자라는 단계마다 성격 하나
      }
      growCheck(d, k, out.lines, false); // 특별한 순간
      if (k.data.bond >= GR.openedBond) growUp(d, k, out.lines, 'shy', 'opened', `늘 숨어서 내다보던 ${ga(k)} 오늘은 먼저 다가와 손을 잡았다. 수줍던 ${k.name}${josa(k.name, '이', '가')} 마음을 열었다.`);
      if (a >= H.adultDay && !k.data.talent) {
        k.data.talent = topLean(k);
        out.lines.push(`${ga(k)} 어른이 되었다. 재주는 '${TALENTS[k.data.talent].name}'. 둥지에서 갈 길을 정해 주자.`);
        diary(k, `어른이 되었다. 재주는 '${TALENTS[k.data.talent].name}'.`, now);
      }
      // 약초꾼은 꿀 고약을 만들어 둠
      if (k.data.path === 'stay' && k.data.talent === 'herbalist') {
        if (!k.data.lastMake) k.data.lastMake = now;
        let n = 0;
        while (now - k.data.lastMake >= H.herbEvery && n < 3) { k.data.lastMake += H.herbEvery; n++; }
        if (now - k.data.lastMake >= H.herbEvery) k.data.lastMake = now; // 오래 비웠으면 3개까지만
        if (n) {
          out.items.push({ id: 'honey_salve', qty: n });
          out.lines.push(`${ga(k)} 꿀 고약 ${n}개를 만들어 두었다.`);
        }
      }
      // 인간의 생은 드래곤보다 훨씬 짧음
      if (a >= H.lifespan) {
        diary(k, `긴 잠에 들었다. ${Math.floor(a)}일의 생이었다.`, now);
        k.status = 'dead';
        k.data.ended = now;
        const id = keepsakeOf(k);
        (d.nest ? out.hoardItems : out.items).push({ id, qty: 1 });
        out.lines.push(
          `${ga(k)} 긴 잠에 들었다. 드래곤의 날개 아래에서 ${Math.floor(a)}일의 생을 마쳤다.`,
          `${ITEMS[id].name}${josa(ITEMS[id].name, '이', '가')} ${d.nest ? '보물더미에' : '소지품에'} 남았다.`,
        );
      }
    }
    // 품지 않은 알은 점점 식음
    if (k.type === 'drake' && k.status === 'egg' && !k.data.incubateAt) {
      const e = (now - k.data.found) / DAY;
      if (e >= R.eggColdDays) {
        k.status = 'cold';
        k.data.ended = now;
        out.lines.push(`${KINDS[k.data.kind].name}의 알이 차갑게 식었다. 끝내 품어 주지 못했다.`);
        continue;
      }
      if (e >= R.eggWarnDays && !k.data.warned) {
        k.data.warned = true;
        const need = ITEMS[KIN.eggNeeds[k.data.kind]].name;
        out.lines.push(`알의 온기가 점점 옅어진다. ${fmtDays(R.eggColdDays - e)} 안에 ${need}${josa(need, '으로', '로')} 품어 주지 않으면 식어 버린다.`);
      }
    }
    // 알이 깨어남
    if (k.type === 'drake' && k.status === 'egg' && k.data.incubateAt && now >= k.data.incubateAt + R.hatchTime) {
      hatch(k, k.data.incubateAt + R.hatchTime);
      const kn = KINDS[k.data.kind].name;
      out.lines.push(`알이 깨지고 ${ga(k)} 태어났다! 작은 ${kn}${josa(kn, '이다', '다')}.`, introOf(k));
    }
    if (k.type === 'drake' && k.status === 'home') {
      // 어미의 성향을 보고 자람
      const dt = Math.max(0, now - (k.data.tickAt || now));
      k.data.stanceMs ||= {}; // 예전 기록에 없으면 새로 (없으면 접속이 막혔음)
      k.data.stanceMs[d.stance] = (k.data.stanceMs[d.stance] || 0) + dt;
      k.data.tickAt = now;
      const a = ageOf(k, now);
      const st = stageOf(k, now);
      if (st.i > (k.data.stage || 0)) {
        k.data.stage = st.i;
        out.lines.push(`${ga(k)} 자라서 '${st.name}'${josa(st.name, '이', '가')} 되었다.`);
        diary(k, `'${st.name}'${josa(st.name, '이', '가')} 되었다.`, now);
        bondDip(k, st, out, now); // 젊은 용: 조금 서먹해짐
        growCheck(d, k, out.lines, true); // 자라는 단계마다 성격 하나
      }
      // 응석받이 → 속 깊은: 예전에는 '다 자란 용'이 되는 그 순간에만 따져서, 이 성격 변화가 생기기 전에 이미 다 자란 새끼는 영영 바뀌지 않았음
      if (st.name === '다 자란 용') growUp(d, k, out.lines, 'clingy', 'dignified', `늘 꼬리를 물고 따라다니던 ${ga(k)} 이제는 말없이 곁에 앉아 먼저 마음을 살핀다. 응석받이의 속이 깊어졌다.`);
      growCheck(d, k, out.lines, false); // 특별한 순간
      // 젊은 용부터 혼자 사냥해 옴
      if (a >= R.huntFrom && !k.data.onExp && !k.data.errand) {
        let n = 0;
        while (now - k.data.lastHunt >= R.huntEvery && n < 3) { k.data.lastHunt += R.huntEvery; n++; }
        if (now - k.data.lastHunt >= R.huntEvery) k.data.lastHunt = now;
        if (n) {
          const fangs = Array.from({ length: n }, () => Math.random() < 0.3).filter(Boolean).length;
          const hides = n * (hasT(k, 'hunter') ? 2 : 1); // 사냥 본능: 한 장씩 더
          out.items.push({ id: 'beast_hide', qty: hides });
          if (fangs) out.items.push({ id: 'sharp_fang', qty: fangs });
          out.lines.push(`${ga(k)} 혼자 사냥해서 짐승 가죽 ${hides}장${fangs ? `과 송곳니 ${fangs}개` : ''}를 물어 왔다.`);
        }
      }
      if (a >= R.independentDay && !k.data.readyTold) {
        k.data.readyTold = true;
        out.lines.push(`${ga(k)} 둥지 밖 하늘을 오래 바라본다. 떠날 때가 된 것 같다.`);
      }
    }
  }
  // 독립한 새끼들이 가끔 선물을 보냄
  const gone = kin.filter((k) => k.type === 'drake' && k.status === 'independent')
    .sort((a, b) => b.data.ended - a.data.ended).slice(0, R.giftFrom);
  for (const k of gone) {
    let n = 0;
    while (now - k.data.lastGift >= R.giftEvery && n < 2) { k.data.lastGift += R.giftEvery; n++; }
    if (!n) continue;
    const g = randInt(10, 30) * n;
    out.gold += g;
    const loot = REGION_LOOT[KINDS[k.data.kind].home];
    const id = loot ? pick(loot.uncommon) : null;
    if (id) out.items.push({ id, qty: 1 });
    out.lines.push(`독립한 ${ga(k)} 선물을 보내왔다. 금화 ${g}닢${id ? `과 ${ITEMS[id].name}` : ''}.`);
  }
  d.gold += out.gold;
  for (const k of kin) if (k.data) k.data.bondSeen = k.data.bond ?? 0; // 유대가 옅어지는 규칙: 다음에 볼 때 그 사이에 직접 올려 준 것만 '챙겨 줌'으로 셈
  return out;
}

// ── 식구가 주는 도움 ──────────────────────────────
// 어른이 되어 길을 정한 인간만. game-logic.js가 d.perks로 읽음
function perksOf(kin, now = Date.now()) {
  const p = {};
  const DH = KIN.drakeHelp;
  // 새끼 드래곤: 곁에 둔 새끼 (심부름 중이면 함께 못 감)
  for (const k of kin) {
    if (k.type !== 'drake' || k.status !== 'home' || !k.data.stats || k.data.errand || k.data.runaway) continue;
    if (k.data.companion && DH.ally.from.includes(stageOf(k, now).name)) {
      const A = DH.ally, st = k.data.stats;
      p.ally = {
        id: k.id, name: k.name, kind: k.data.kind,
        atk: Math.round((A.base + st.claw * A.claw + st.wing * A.wing + (A.stage[stageOf(k, now).name] || 0)) * (hasT(k, 'fierce') ? GR.fierce : 1) * (hasT(k, 'bold') ? GR.bold : 1) * (k.data.bond >= KIN_BOND.strong.min ? KIN_BOND.strong.ally : 1)), // 사나운·겁 없는 · 유대가 깊으면 더 세게
        hunter: hasT(k, 'hunter'), clever: hasT(k, 'clever'), guard: hasT(k, 'shieldmate'), // 등을 맡기는
      };
    }
  }
  // 둥지 시설에서 일하는 식구 (어른 1, 견습 0.5, 잘 맞으면 ×1.5)
  for (const k of kin) {
    const w = workerOf(k, now);
    if (!w) continue;
    (p.fac ||= {})[k.data.job] = w.part;
    if (k.data.job === 'kitchen') p.cook = { id: k.id, name: k.name, adult: w.adult, glutton: hasT(k, 'glutton'), handy: hasT(k, 'handy'), gentle: hasT(k, 'gentle') };
  }
  for (const k of kin) {
    if (k.type !== 'human' || k.status !== 'home' || !k.data.path) continue;
    if (k.data.path === 'stay') p[k.data.talent] = k.name;
    if (k.data.path === 'knight') p.knight = k.name;
  }
  // 적대 드래곤 대신 시장에서 흥정해 주는 사람: 청소년부터 (어른·노년은 둥지에 남은 사람. 용기사는 아님), 유대 H.traderBond 이상, 지금 둥지에 있음
  if (!p.trader) for (const k of kin) {
    if (k.type !== 'human' || k.status !== 'home' || k.data.onExp || k.data.runaway || k.data.path === 'knight') continue;
    if (!['청소년', '어른', '노년'].includes(stageOf(k, now).name) || (k.data.bond || 0) < H.traderBond) continue;
    p.trader = k.name; break;
  }
  return p;
}

// 프로필에 보여 줄 짧은 요약
function summary(kin, now) {
  return {
    // away: 원정·심부름·가출로 둥지를 비움 (둥지 한 줄 요약에서 흐리게)
    home: kin.filter(isHome).map((k) => ({ name: k.name, type: k.type, stage: stageOf(k, now).name, status: k.status,
      away: k.data.onExp ? 'exp' : k.data.errand ? 'errand' : k.data.runaway ? 'runaway' : null })),
    lineage: kin.filter((k) => k.type === 'drake' && k.status === 'independent').length,
  };
}

// 둥지 창에 보여 줄 식구 정보
function view(k, now, d) {
  const v = { id: k.id, type: k.type, status: k.status, name: k.name };
  const st = stageOf(k, now);
  v.stage = st.name;
  if (k.status === 'egg' || k.status === 'cold') {
    v.kind = k.data.kind;
    if (k.status === 'cold') { v.ended = k.data.ended; return v; }
    v.need = KIN.eggNeeds[k.data.kind];
    v.hatchIn = k.data.incubateAt ? Math.max(0, k.data.incubateAt + R.hatchTime - now) : null;
    v.coldIn = k.data.incubateAt ? null : Math.max(0, k.data.found + R.eggColdDays * DAY - now);
    return v;
  }
  const a = ageOf(k, isHome(k) ? now : k.data.ended || now); // 떠난 식구는 떠난 날의 나이
  v.age = Math.floor(a);
  v.bond = Math.round(k.data.bond);
  // 포만감과 기분 (인간 식구)
  if (k.type === 'human' && k.status === 'home' && k.data.sat != null) {
    const hrs = Math.max(0, (now - (k.data.satAt || now)) / 3600000);
    const s = Math.max(0, k.data.sat - hrs * HG.perHour * satMul(k));
    v.sat = Math.round(s);
    v.satWord = satWord(s);
    v.mood = s < HG.hungry ? 'hungry' : s >= HG.full && k.data.bond >= 60 ? 'happy' : 'calm';
    if (k.data.favKnown && k.data.favFood) v.favFood = k.data.favFood;
  }
  if (k.type === 'drake' && k.status === 'home') {
    const fl = drakeFloor(k, now);
    const hrs = Math.max(0, (now - (k.data.satAt || now)) / 3600000);
    const s = Math.max(fl ? Math.min(k.data.sat ?? DF.start, fl) : 0, (k.data.sat ?? DF.start) - hrs * DF.perHour * satMul(k));
    v.sat = Math.round(s);
    v.satWord = satWord(s);
    v.mood = s < DF.hungry ? 'hungry' : s >= DF.full && k.data.bond >= 60 ? 'happy' : 'calm';
    v.feedIn = Math.max(0, (k.data.lastFeed || 0) + DF.cooldown - now);
    // 곁에 두기와 심부름
    const EH = KIN.drakeHelp.errand;
    v.companion = !!k.data.companion;
    v.canCompanion = KIN.drakeHelp.ally.from.includes(stageOf(k, now).name);
    v.canErrand = EH.from.includes(stageOf(k, now).name);
    v.errandRuin = EH.ruinFrom.includes(stageOf(k, now).name);
    if (k.data.errand) v.errand = { region: k.data.errand.region, end: k.data.errand.end };
    v.selfFeed = !!fl;
    if (k.data.favKnown) v.favFood = DF.kindFav[k.data.kind];
  }
  if (k.type === 'human' && k.data.job && FACILITY.list[k.data.job]) {
    const w = workerOf(k, now);
    v.job = { id: k.data.job, name: FACILITY.list[k.data.job].name, working: !!w, apprentice: w ? !w.adult : false, fit: !!w?.fit };
    if (!w) v.job.why = k.data.onExp ? '원정에 따라감' : k.data.runaway ? '둥지를 나감' : k.data.path === 'knight' ? '용기사' : '아직 어림'; // 일하지 못하는 까닭
  }
  if (k.data.runaway) v.runaway = { region: k.data.runaway.region, until: k.data.runaway.until, seeker: k.data.runaway.seeker || null };
  if (k.type === 'human' && k.status === 'home') v.canWork = FW.adultStages.includes(stageOf(k, now).name) || FW.apprenticeStages.includes(stageOf(k, now).name);
  // 짝과 자녀 (식구 이벤트로 생김)
  if (k.data.mate) v.mate = { name: k.data.mate.name, kind: k.data.mate.kind || null, home: k.data.mate.home || null }; // home: 다른 둥지 아이와 맺어졌으면 그 둥지 주인
  if (k.data.kids?.length) v.kids = k.data.kids.slice();
  if (k.data.family) v.family = REGIONS[k.data.family]?.name || ''; // 마을에 가정을 꾸려 떠남 (그 마을 이름)
  if (k.data.sex) {
    v.sex = k.data.sex;
    v.sexName = KIN_LOOKS.sex[k.type][k.data.sex];
    v.looks = k.data.looks || [];
    v.traits = (k.data.traits || []).filter((id) => KIN_TRAITS[id]).map((id) => ({ id, name: KIN_TRAITS[id].name, desc: KIN_TRAITS[id].desc, grown: !!KIN_TRAITS[id].grown, flaw: !!KIN_TRAITS[id].flaw }));
    v.hint = growHint(k); // '요즘 ~한 것 같다'
    // 다른 둥지의 친구 (많이 만난 순서로 모두, 최대 keepFriends명)
    const fr = Object.values(k.data.friends || {}).sort((p, q) => q.n - p.n);
    if (fr.length) v.friends = fr.map((f) => ({ name: f.name, owner: f.owner, best: f.n >= PL.friendAt }));
  }
  if (isHome(k)) v.nextIn = st.next != null ? (st.next - a) * DAY : null;
  if (k.type === 'human') {
    v.origin = k.data.origin;
    if (k.data.parents) v.parents = k.data.parents; // 짝 사이에서 태어났거나 함께 데려온 아이: 두 부모 이름
    v.talent = k.data.talent || null;
    v.lean = k.data.talent ? null : (Object.values(k.data.lean).some((x) => x > 0) ? topLean(k) : null);
    v.path = k.data.path || null;
    v.lifeLeft = k.status === 'home' && a >= H.adultDay ? (H.lifespan - a) * DAY : null;
    v.choosePath = k.status === 'home' && !!k.data.talent && !k.data.path;
    v.careIn = Math.max(0, k.data.lastCare + H.careCooldown - now);
    v.onExp = !!k.data.onExp;
  } else {
    v.kind = k.data.kind;
    v.stats = k.data.stats;
    { const cap = (R.statCap || [])[stageOf(k, now).i]; if (cap != null) v.statCap = cap; } // 이 단계의 능력치 합 상한 (식구 카드에 '합 ○○ / ○○')
    v.trains = k.data.trains;
    v.trainLimit = R.trainLimit[Math.max(0, st.i)];
    v.trainIn = Math.max(0, (k.data.lastTrain || 0) + trainCd(k) - now);
    v.personality = personalityOf(k);
    // 성격이 선택지로 정해졌는지: 선택지 몫을 빼고 보면 다른 성향이 가장 길었을 때
    {
      const ms = k.data.stanceMs || {}, nd = k.data.stanceNudge || {};
      const lived = Object.keys(ms).sort((x, y) => ((ms[y] || 0) - (nd[y] || 0)) - ((ms[x] || 0) - (nd[x] || 0)))[0];
      v.persByChoice = !!nd[v.personality] && lived !== v.personality;
    }
    v.canRelease = k.status === 'home' && a >= R.independentDay;
    v.onExp = !!k.data.onExp;
  }
  // 둥지 이야기: 원정에 따라나선 때, 최근 세 시간 안에 돌아온 때
  if (k.data.onExp && k.data.expAt) v.expAt = k.data.expAt;
  if (k.data.expBack && now - k.data.expBack < 3 * 3600000) v.expBack = k.data.expBack;
  if (k.data.festAt && now - k.data.festAt < 2 * DAY) v.festAt = k.data.festAt; // 둥지 이야기: 축제에 다녀온 지 이틀 안
  if (!isHome(k)) v.ended = k.data.ended || null;
  // 함께한 날들: 며칠째인지와 함께 (새것이 위로)
  if (k.status === 'home') {
    const md = moodOf(k, now), t = k.data.touch || {};
    v.mood = md ? { key: md, name: MOODS[md] } : null;
    v.touch = { n: t.day === kstDay(now) ? t.n : 0, cap: TC.cap };
    const away = k.data.onExp || k.data.runaway || (k.type === 'drake' && k.data.errand); // 가출·심부름·원정 중에는 교감할 수 없음
    v.touchActs = away ? [] : Object.entries(TC.acts).filter(([, a]) => !a.for || a.for === k.type).map(([id, a]) => ({ id, name: a.name }));
    if (k.data.ask && k.data.ask.until > now) v.ask = { act: k.data.ask.act, name: TC.acts[k.data.ask.act].name, line: ASK_LINE[k.data.ask.act], left: k.data.ask.until - now };
  }
  diaryStart(k);
  if (k.data.diary) { const b0 = k.data.born || k.data.diary[0].at; v.diary = k.data.diary.map((x) => ({ d: Math.max(1, Math.floor((x.at - b0) / DAY) + 1), t: x.t })).reverse(); }
  return v;
}
function views(kin, now, d) {
  return {
    home: kin.filter(isHome).map((k) => view(k, now, d)),
    past: kin.filter((k) => !isHome(k)).sort((a, b) => (b.data.ended || 0) - (a.data.ended || 0)).slice(0, 12).map((k) => view(k, now, d)),
    lineage: kin.filter((k) => k.type === 'drake' && k.status === 'independent').length,
  };
}

// ── 식구 돌보기 ────────────────────────────────────
// opt.away: 반려의 둥지에서 그 집 식구를 돌봄 (둥지에 있는지는 서버가 따로 확인)
// 새끼 드래곤에게 먹이 주기 (돌보기와 같은 길로 들어옴)
function feedDrake(d, kin, k, item, have, now) {
  if (k.data.errand) return { error: `${ga(k)} 심부름을 떠나 있다.` };
  const f = DF.items[item];
  if (!f) return { error: `${k.name}${josa(k.name, '은', '는')} 그건 먹지 않는다. 생선이나 고기를 주자.` };
  if (have(item) < 1) return { error: '가지고 있지 않다.' };
  const left = (k.data.lastFeed || 0) + DF.cooldown - now;
  if (left > 0) { const m = Math.ceil(left / 60000); return { error: `${k.name}${josa(k.name, '은', '는')} 아직 배가 부르다. ${m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`} 뒤에 다시 주자.` }; }
  satUpdate(k, now, false, DF, drakeFloor(k, now));
  const hungry = k.data.sat < DF.hungry;
  const fav = (ITEMS[item]?.cooked || item) === DF.kindFav[k.data.kind];
  let gain = Math.max(1, f.bond + (fav ? DF.favBond : 0) + (clingyish(k) ? 1 : 0) + (hasT(k, 'foodie') ? (fav ? 3 : -1) : 0)); // 입맛 까다로운
  gain = addBond(k, gain); // 실제로 오른 만큼
  k.data.sat = Math.min(100, k.data.sat + f.sat);
  k.data.lastFeed = now;
  const name = ITEMS[item].name;
  const big = ['젊은 용', '다 자란 용'].includes(stageOf(k, now).name); // 큰 새끼는 어린 새끼처럼 굴지 않음
  const lines = [`${k.name}에게 ${name}${josa(name, '을', '를')} 주었다. ${hungry
    ? (big ? '배가 고팠는지 한입에 삼키고 더 없느냐는 듯 이쪽을 본다.' : '배가 고팠는지 단숨에 삼키고 더 달라는 듯 입을 벌린다.')
    : (big ? '먹는 내내 꼬리 끝이 느긋하게 흔들렸다. 만족스러운 모양이다.' : '꼬리를 흔들며 오물오물 씹어 먹는다.')}`];
  if (fav) {
    if (!k.data.favKnown) { k.data.favKnown = true; lines.push(`${ga(k)} 눈을 반짝이며 콧김을 내뿜었다. ${k.name}${josa(k.name, '은', '는')} ${name}${josa(name, '을', '를')} 가장 좋아하는 것 같다!`); }
    else lines.push(`가장 좋아하는 ${name}이다. ${big ? `${ga(k)} 한 입 한 입 아껴 가며 음미한다.` : `${ga(k)} 날개를 파닥이며 좋아한다.`}`);
  }
  if (drakeFull(k)) lines.push('배가 든든하니 가르칠 때 더 잘 따를 것이다.');
  lines.push(`유대 +${gain} · ${satWord(k.data.sat)}`);
  return { title: k.name, lines, items: [{ id: item, qty: -1 }] };
}
// ── 교감: 쓰다듬기·안아 주기·놀아 주기·이야기·등에 태우기/함께 날기 ──────────
// 물건·행동력 없이 하루 몇 번. 단계와 성격마다 좋아하는 것이 다르고, 기분에 따라 반응이 달라짐.
// 하루 KIN_TOUCH.cap번을 넘기면 유대는 오르지 않고 과보호가 쌓여 '응석받이/어리광쟁이' 또는 '새침한'으로 자람
const TC = KIN_TOUCH;
const kstDay = (now) => new Date(now + 9 * 3600000).toISOString().slice(0, 10);
const kstHour = (now) => new Date(now + 9 * 3600000).getUTCHours();
const isNight = (now) => { const h = kstHour(now); const [a, b] = TC.night; return a > b ? h >= a || h < b : h >= a && h < b; };
const touchOf = (k, now) => { const t = k.data.touch || (k.data.touch = { day: '', n: 0, last: 0, liked: 0 }); if (t.day !== kstDay(now)) { t.day = kstDay(now); t.n = 0; } return t; };
// 이 식구가 좋아하는 것·싫어하는 것 (성격이 더 좋아하는 것이 단계보다 앞섬)
function prefOf(k, act, now) {
  const L = TC.likes[stageOf(k, now).name] || { like: [], dislike: [] };
  const byTrait = (k.data.traits || []).some((t) => (TC.traitLikes[t] || []).includes(act));
  if (byTrait || L.like.includes(act)) return 'like';
  if (L.dislike.includes(act)) return 'dislike';
  return 'ok';
}
// 지금 기분 (식구 카드에 한 단어로)
const MOODS = { pout: '뾰로통', ask: '조르는 중', sleepy: '졸림', sad: '서운함', bored: '심심함', happy: '신남', calm: '평온' };
function moodOf(k, now) {
  if (k.status !== 'home' || k.type === 'egg') return null;
  if (k.data.onExp || k.data.runaway || (k.type === 'drake' && k.data.errand)) return null; // 둥지를 비운 동안은 기분 표시 없음
  const t = k.data.touch || {};
  const today = t.day === kstDay(now);
  if (today && t.n > TC.cap) return 'pout';
  if (k.data.ask && k.data.ask.until > now) return 'ask';
  if (isNight(now)) return 'sleepy';
  const lonelyOk = hasT(k, 'aloof') || hasT(k, 'aloofd') || hasT(k, 'tough');
  if (!lonelyOk && ((k.data.askMissed && now - k.data.askMissed < TC.ask.missH * 3600000) || (t.last && now - t.last > TC.lonelyH * 3600000))) return 'sad';
  if (!t.last || now - t.last > TC.boredH * 3600000) return 'bored';
  if (t.liked && now - t.liked < TC.happyH * 3600000) return 'happy';
  return 'calm';
}
// 넘치게 챙기면 어느 쪽으로 자랄지: 품을 파고드는 성격이면 응석 쪽, 제 고집이 있는 성격이면 새침 쪽 (나머지는 식구마다 정해짐)
const SOFT = ['gentle', 'lonely', 'shy', 'crybaby', 'clingy', 'warm', 'affable', 'sleepy', 'opened', 'dreamy'];
const FIRM = ['willful', 'wild', 'brave', 'bold', 'proud', 'stubborn', 'tough', 'capable', 'steadfast', 'fierce', 'steady', 'tidy'];
function overdoKey(k) {
  const tr = k.data.traits || [];
  const soft = tr.filter((x) => SOFT.includes(x)).length, firm = tr.filter((x) => FIRM.includes(x)).length;
  if (soft !== firm) return soft > firm ? 'pamper' : 'smother';
  return k.id % 2 ? 'pamper' : 'smother';
}
const TOUCH_FIRST = { pat: '처음 머리를 쓰다듬어 주었다.', hug: '처음 꼭 안아 주었다.', play: '처음 함께 놀아 주었다.', story: '처음 이야기를 들려주었다.', ride: '처음 등에 태워 주었다.', fly: '처음 함께 하늘을 날았다.' };
const ASK_LINE = { pat: '머리를 쓰다듬어 달라고 슬그머니 다가온다', hug: '안아 달라고 팔을 뻗는다', play: '놀아 달라고 자꾸 잡아당긴다', story: '이야기를 해 달라고 조른다', ride: '등에 태워 달라고 조른다', fly: '함께 날자고 날개를 퍼덕인다' };
// 반응 문장: [행동][좋음·보통·싫음] (n: 이름, g: 이름+이/가, e: 이름+은/는)
const TOUCH_LINES = {
  pat: { like: ['{g} 눈을 가늘게 뜨고 손길에 머리를 비빈다.', '{g} 기분 좋은 듯 {purr}'], ok: ['{g} 가만히 쓰다듬어지다가 씩 웃는다.'], dislike: ['{e} "이제 애 아니거든!" 하고 고개를 홱 돌린다.', '{e} 머리를 피하며 투덜거린다.'] },
  hug: { like: ['{g} 품에 쏙 안겨 한참을 떨어지지 않는다.', '{g} 꼭 안긴 채 작게 웃음소리를 낸다.'], ok: ['{g} 잠깐 안겨 있다가 꼼지락거리며 내려간다.'], dislike: ['{e} "창피해요!" 하고 품에서 빠져나간다.', '{e} 버둥거리며 몸을 빼낸다.'] },
  play: { like: ['{g} 신이 나서 둥지 안을 뛰어다닌다.', '{g} 숨이 찰 때까지 깔깔거리며 논다.'], ok: ['{g} 한참 함께 뛰어놀았다.'], dislike: ['{e} 내키지 않는지 금방 시들해진다.'] },
  story: { like: ['{g} 눈을 반짝이며 다음 이야기를 조른다.', '{g} 이야기 끝까지 숨죽여 듣는다.'], ok: ['{g} 이야기를 듣다가 고개를 끄덕인다.'], dislike: ['{e} 듣는 둥 마는 둥 하품을 한다.'] },
  ride: { like: ['{g} 등 위에서 두 팔을 활짝 펴고 소리친다.', '{g} 등에 매달려 신나게 웃는다.'], ok: ['{g} 등에 올라 둥지 둘레를 한 바퀴 돌았다.'], dislike: ['{e} 등에 오르기 싫다며 고개를 젓는다.'] },
  fly: { like: ['{g} 날개를 나란히 펴고 신나게 바람을 가른다.', '{g} 구름 사이를 빙글빙글 돌며 좋아한다.'], ok: ['{g} 뒤따라 둥지 위를 몇 바퀴 날았다.'], dislike: ['{e} 날개를 접고 따라오지 않는다.'] },
};
const fillLine = (t, k) => t.replace('{g}', ga(k)).replace('{e}', `${k.name}${josa(k.name, '은', '는')}`).replace('{n}', k.name).replace('{purr}', k.type === 'drake' ? '가르릉 소리를 낸다.' : '눈을 감고 배시시 웃는다.'); // 사람 아이는 가르릉거리지 않음
const pickLine = (arr) => arr[Math.floor(Math.random() * arr.length)];
function touch(d, kin, id, act, now = Date.now()) {
  const err = atNest(d);
  if (err) return { error: err };
  const k = findKin(kin, id);
  const A = TC.acts[act];
  if (!k || k.status !== 'home') return { error: '교감할 수 있는 식구가 아니다.' };
  if (isRunaway(k)) return { error: `${k.name}${josa(k.name, '은', '는')} 지금 둥지에 없다. 먼저 찾아오자.` };
  if (k.data.onExp) return { error: `${k.name}${josa(k.name, '은', '는')} 원정에 따라가 있다.` };
  if (k.type === 'drake' && k.data.errand) return { error: `${k.name}${josa(k.name, '은', '는')} 심부름을 떠나 있다.` };
  if (!A || (A.for && A.for !== k.type)) return { error: '할 수 없는 교감이다.' };
  const t = touchOf(k, now);
  const lines = [];
  // 아이가 조르던 것을 해 주는 건 오늘 횟수가 다 찼어도 받아 줌 (과보호로 치지 않음)
  const askedNow = k.data.ask && k.data.ask.act === act && k.data.ask.until >= now;
  const counted = !askedNow || t.n < TC.cap;
  if (counted) t.n += 1;
  // 처음 해 준 교감은 함께한 날들에
  k.data.touchFirst ||= {};
  if (!k.data.touchFirst[act]) { k.data.touchFirst[act] = now; diary(k, TOUCH_FIRST[act], now); }
  // 아이가 조르던 것을 해 주면 기다렸다는 듯이
  const asked = k.data.ask && k.data.ask.act === act && k.data.ask.until >= now;
  if (t.n > TC.cap && !askedNow) {
    // 너무 자주: 유대는 그대로, 과보호가 쌓임
    const key = overdoKey(k);
    growAdd(k, key, 1);
    lines.push(key === 'pamper' ? `${ga(k)} 또 매달리며 놓아 주지 않는다.` : `${k.name}${josa(k.name, '은', '는')} "또요?" 하는 얼굴로 슬그머니 피한다.`); // 안내 없이 반응으로만 (알아 가는 재미)
    t.last = now;
    return { title: k.name, lines };
  }
  let pref = prefOf(k, act, now);
  const mood = moodOf(k, now);
  let shyNow = hasT(k, 'shy') && k.data.bond < 40;
  if (shyNow && pref !== 'dislike') pref = 'ok';
  let gain = TC.bond[pref];
  if (mood === 'sleepy') { if (act === 'story') gain += 1; else if (act === 'play' || act === 'fly' || act === 'ride') gain = Math.max(0, gain - 1); }
  if (mood === 'sad' && (act === 'hug' || act === 'pat') && pref !== 'dislike') gain += 1;
  if (mood === 'bored' && (act === 'play' || act === 'fly') && pref !== 'dislike') gain += 1;
  if (hasT(k, 'spoiled') || hasT(k, 'babyish')) gain += 1;
  if (hasT(k, 'aloof') || hasT(k, 'aloofd')) gain = Math.max(0, gain - 1);
  if (hasT(k, 'crybaby') && act === 'hug' && mood === 'sad') gain += 1;
  if (asked) { gain += TC.ask.bond; growAdd(k, 'warm', 0.5); k.data.ask = null; }
  // 반응
  let line;
  if (shyNow) line = `${ga(k)} 살짝 몸을 빼다가, 조심스레 다시 다가온다.`;
  else if (mood === 'sleepy' && (act === 'play' || act === 'fly' || act === 'ride')) line = `${ga(k)} 눈을 비비며 꾸벅꾸벅 존다. 지금은 졸린가 보다.`;
  else if ((hasT(k, 'sleepy') || hasT(k, 'sleepyhead')) && kstHour(now) >= 6 && kstHour(now) < 10 && act !== 'story') line = `${ga(k)} 이불 속에서 "오 분만…" 하고 웅얼거린다.`;
  else line = fillLine(pickLine(TOUCH_LINES[act][pref]), k);
  if (asked) line = `${ga(k)} 기다렸다는 듯이 활짝 웃는다. ${line}`;
  if (k.data.bond >= 100 && pref === 'like' && !shyNow) line = `${line} 보호자를 세상에서 가장 믿는 얼굴이다.`; // 유대 100
  gain = addBond(k, gain);
  if (pref === 'like') t.liked = now;
  t.last = now;
  lines.push(`${line}${gain ? ` (유대 +${gain})` : ''}`);
  if (counted && t.n === TC.cap && k.data.ask) k.data.ask = null; // 충분히 함께했으니 조르던 것도 그만둠 (놓친 것으로 치지 않음)
  return { title: k.name, lines };
}
// tick에서: 아이가 먼저 조르기, 조르기를 놓침, 응석받이가 서운해함
// 자라는 고비 (청소년·젊은 용): 유대가 조금 내려가고 서먹해짐. 이 단계부터 좋아하는 교감도 바뀜
function bondDip(k, st, out, now) {
  const B = KIN_BOND.dip;
  if (!B.stages.includes(st.name)) return;
  const before = k.data.bond || 0;
  const after = Math.max(Math.min(before, B.floor), before - B.amount);
  if (after >= before) return;
  k.data.bond = after;
  const line = k.type === 'human'
    ? `요즘 ${ga(k)} 부쩍 말수가 줄고 혼자 있는 시간이 늘었다. 예전처럼 안기려 하지도 않는다. (유대 −${Math.round(before - after)})`
    : `요즘 ${ga(k)} 혼자 멀리 날아갔다 돌아오곤 한다. 예전처럼 품으로 파고들지 않는다. (유대 −${Math.round(before - after)})`;
  out.lines.push(line);
  diary(k, k.type === 'human' ? '부쩍 말수가 줄었다. 사춘기인가 보다.' : '혼자 멀리 날아갔다 돌아오기 시작했다.', now);
}
// 유대가 깊으면 하루 한 번쯤 작은 선물을 물어 옴
function bondGift(k, out, now) {
  const G = KIN_BOND.gift;
  if ((k.data.bond || 0) < G.min || k.status !== 'home' || k.data.onExp || k.data.runaway || (k.type === 'drake' && k.data.errand) || k.type === 'egg') return;
  const day = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  if (k.data.giftDay === day) return;
  k.data.giftDay = day; // 하루에 한 번만 굴림
  if (Math.random() >= G.chance) return;
  const list = (G[k.type] || []).filter((id) => ITEMS[id]);
  if (!list.length) return;
  const id = list[Math.floor(Math.random() * list.length)];
  out.items.push({ id, qty: 1 });
  out.lines.push(k.type === 'human'
    ? `${ga(k)} 어디선가 ${ITEMS[id].name}${josa(ITEMS[id].name, '을', '를')} 주워 와 수줍게 내밀었다.`
    : `${ga(k)} ${ITEMS[id].name}${josa(ITEMS[id].name, '을', '를')} 물어 와 발치에 툭 내려놓았다.`);
}
function touchTick(k, now, out) {
  if (k.status !== 'home') return;
  // 원정·심부름·가출로 둥지를 비우면 조르던 것은 없던 일로 (돌아와서 놓친 것으로 치지 않음)
  if (k.data.onExp || isRunaway(k) || (k.type === 'drake' && k.data.errand)) { if (k.data.ask) k.data.ask = null; return; }
  const A = k.data.ask;
  if (A && A.until < now) {
    k.data.ask = null;
    k.data.askMissed = now;
    if (!hasT(k, 'aloof') && !hasT(k, 'aloofd')) growAdd(k, 'neglect', 0.5);
    out.lines.push(`${ga(k)} 한참 기다리다 시무룩하게 돌아섰다.`);
  }
  const t = k.data.touch || {};
  // 응석받이·어리광쟁이: 하루 넘게 교감이 없으면 서운해함 (하루 한 번)
  if ((hasT(k, 'spoiled') || hasT(k, 'babyish')) && t.last && now - t.last > 24 * 3600000 && k.data.spoiledDay !== kstDay(now)) {
    k.data.spoiledDay = kstDay(now);
    k.data.bond = clamp(k.data.bond - TC.spoiledLoss);
    out.lines.push(`${ga(k)} 하루 종일 보호자만 기다리다 서운해졌다. (유대 −${TC.spoiledLoss})`);
  }
  // 아이가 먼저 조름 (밤에는 조르지 않음 · 오늘 알맞은 만큼 함께했으면 조르지 않음)
  const enough = t.day === kstDay(now) && (t.n || 0) >= TC.cap;
  if (!k.data.ask && !enough && !isNight(now) && (!k.data.askAt || now - k.data.askAt > TC.ask.everyH * 3600000)) {
    const hrs = Math.min(3, Math.max(0, (now - (k.data.askCheck || now)) / 3600000));
    k.data.askCheck = now;
    if (hrs > 0 && Math.random() < 1 - Math.pow(1 - TC.ask.chance, hrs)) {
      const L = TC.likes[stageOf(k, now).name] || { like: ['hug'] };
      const acts = (L.like.length ? L.like : ['pat']).filter((a) => !TC.acts[a].for || TC.acts[a].for === k.type);
      const act = acts[Math.floor(Math.random() * acts.length)] || 'pat';
      k.data.ask = { act, at: now, until: now + TC.ask.waitMin * 60000 };
      k.data.askAt = now;
      out.lines.push(`${ga(k)} ${ASK_LINE[act]}.`);
    }
  } else if (!k.data.askCheck) k.data.askCheck = now;
}

function care(d, kin, id, item, have, now = Date.now(), opt = {}) {
  const err = opt.away ? null : atNest(d);
  if (err) return { error: err };
  const k = findKin(kin, id);
  if (k && isRunaway(k)) return { error: `${k.name}${josa(k.name, '은', '는')} 지금 둥지에 없다. 먼저 찾아오자.` };
  if (k && k.type === 'drake' && k.status === 'home') return feedDrake(d, kin, k, item, have, now);
  if (!k || k.type !== 'human' || k.status !== 'home') return { error: '돌볼 수 있는 식구가 아니다.' };
  const c = KIN.care[item];
  if (!c) return { error: '그 물건으로는 돌볼 수 없다.' };
  if (have(item) < 1) return { error: '가지고 있지 않다.' };
  const careLeft = k.data.lastCare + H.careCooldown - now;
  if (careLeft > 0) {
    const m = Math.ceil(careLeft / 60000), h = Math.floor(m / 60);
    const left = h ? `${h}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`;
    return { error: `${k.name}${josa(k.name, '은', '는')} 방금 돌봐 줬다. ${left} 뒤에 다시 돌보자.` };
  }
  satUpdate(k, now, hasKeeper(kin, k));
  const food = isFood(item);
  const hungry = k.data.sat < HG.hungry;
  const fav = (ITEMS[item]?.cooked || item) === k.data.favFood; // 정성 들인 것도 같은 음식
  // 특성: 다정한 발톱·냉담 / 아이의 성격: 다정한·먹보·수줍은 / 가장 좋아하는 요리
  let mood = 0;
  if (hasT(k, 'gentle')) mood += 1;
  if (hasT(k, 'glutton') && food) mood += 2;
  if (hasT(k, 'shy')) mood += k.data.bond < 40 ? -1 : 2;
  if (hasT(k, 'opened')) mood += 2;   // 마음을 연
  if (hasT(k, 'warm')) mood += 1;     // 정 많은
  if (hasT(k, 'picky') && food) mood += fav ? 2 : -1; // 편식하는
  const cried = hasT(k, 'crybaby') && (k.data.decayed || 0) > 0; // 울보: 외로워하던 참에 다시 돌봐 줌
  if (cried) mood += 2;
  if (fav) mood += HG.favBond + (hasT(k, 'fussy') ? 3 : 0); // 투정쟁이: 좋아하는 요리엔 더
  const sulk = hasT(k, 'willful') && Math.random() < GR.willfulChance; // 제멋대로인: 가끔 딴청
  if (sulk) mood -= 1;
  let gain = Math.max(1, c.bond + logic.traitMods(d).bond + mood);
  if (hungry && !food) gain = Math.max(1, Math.round(gain * HG.hungryGift)); // 배고프면 장난감에 마음이 덜 감
  gain = addBond(k, gain); // 실제로 오른 만큼
  if (food) { k.data.sat = Math.min(100, k.data.sat + c.sat * (hasT(k, 'glutton') ? 1.2 : 1)); growAdd(k, 'food'); }
  if (!k.data.talent && c.talent) k.data.lean[c.talent] += k.data.bond >= KIN_BOND.strong.min ? KIN_BOND.strong.lean : 1; // 유대가 깊으면 재주가 빨리 자람
  k.data.lastCare = now;
  k.data.decayed = 0;
  const name = ITEMS[item].name;
  const react = {
    herbalist: '킁킁 냄새를 맡아 보고는 신기한 듯 만지작거린다.',
    smith: '반짝이는 걸 쥐고 이리저리 두드려 본다.',
    guard: '꼭 쥐고 드래곤 흉내를 내며 으르렁거린다.',
  }[c.talent];
  const lines = [`${k.name}에게 ${name}${josa(name, '을', '를')} 건넸다. ${c.eat || (hungry && food ? '배가 고팠는지 허겁지겁 먹는다.' : react)}`];
  if (hungry && !food) lines.push(`${ga(k)} 배가 고파서인지 금방 내려놓고 둥지 입구만 바라본다.`);
  if (fav) {
    if (!k.data.favKnown) { k.data.favKnown = true; lines.push(`${ga(k)} 눈을 반짝였다. ${k.name}${josa(k.name, '은', '는')} ${name}${josa(name, '을', '를')} 가장 좋아하는 것 같다!`); }
    else lines.push(`가장 좋아하는 ${name}이다. ${ga(k)} 몸을 흔들며 좋아한다.`);
  }
  if (cried) lines.push(`울보 ${k.name}${josa(k.name, '이', '가')} 왈칵 울음을 터뜨리며 품에 안겼다.`);
  if (hasT(k, 'glutton') && food) lines.push(`먹보 ${k.name}${josa(k.name, '은', '는')} 눈 깜짝할 새 먹어 치우고 입맛을 다신다.`);
  else if (hasT(k, 'picky') && food && !fav) lines.push(`편식하는 ${k.name}${josa(k.name, '이', '가')} 깨작깨작 먹는 시늉만 한다.`);
  else if (hasT(k, 'shy')) lines.push(k.data.bond - gain < 40 ? `수줍은 ${k.name}${josa(k.name, '은', '는')} 받아 들고 슬그머니 등을 돌린다.` : `${k.name}${josa(k.name, '이', '가')} 이제는 수줍게 웃으며 다가온다.`);
  const items = [{ id: item, qty: -1 }];
  if (sulk) {
    const got = pick(TR.pranksterItems);
    items.push({ id: got, qty: 1 });
    const gn = ITEMS[got].name;
    lines.push(`제멋대로인 ${k.name}${josa(k.name, '은', '는')} 딴청을 피우다가, 어디서 주워 온 ${gn}${josa(gn, '을', '를')} 쑥 내밀었다.`);
  }
  if (hasT(k, 'prankster') && Math.random() < TR.pranksterChance) {
    const got = pick(TR.pranksterItems);
    items.push({ id: got, qty: 1 });
    const gn = ITEMS[got].name;
    lines.push(`장난꾸러기 ${k.name}${josa(k.name, '이', '가')} 키득거리며 주머니에서 ${gn}${josa(gn, '을', '를')} 꺼내 쥐여 주었다.`);
  }
  lines.push(food ? `유대 +${gain} · ${satWord(k.data.sat)}` : `유대 +${gain}`, ...logic.traitCount(d, 'care'));
  return { title: k.name, lines, items };
}

function rename(kin, id, name) {
  const k = findKin(kin, id);
  if (!k) return { error: '없는 식구다.' };
  if (!/^[가-힣A-Za-z]{1,8}$/.test(name)) return { error: '이름은 한글이나 영문으로 1~8자까지 쓸 수 있다.' };
  k.name = name;
  return { title: '이름', lines: [`이제부터 ${name}${josa(name, '이라', '라')}고 부르기로 했다.`] };
}

// 어른이 된 인간의 갈 길
function choosePath(d, kin, id, path, town, now = Date.now()) {
  const err = atNest(d);
  if (err) return { error: err };
  const k = findKin(kin, id);
  if (!k || k.type !== 'human' || !k.data.talent || k.data.path) return { error: '지금은 정할 수 없다.' };
  if (path === 'stay') {
    k.data.path = 'stay';
    diary(k, '둥지에 남기로 했다.', now);
    return { title: k.name, lines: [`${ga(k)} 둥지에 남기로 했다. ${TALENTS[k.data.talent].desc}`] };
  }
  if (path === 'knight') {
    if (k.data.bond < H.knightBond) return { error: `용기사로 삼으려면 유대가 ${H.knightBond} 이상이어야 한다.` };
    k.data.path = 'knight';
    diary(k, '용기사가 되어 등에 올라탔다.', now);
    return { title: k.name, lines: [`${ga(k)} 등에 올라탔다. 이제 용기사로서 함께 사냥하고 싸운다.`, '사냥 때 발톱 +3, 받는 피해 30% 감소, 위협 성공률 +10%.'] };
  }
  if (path === 'return') {
    if (!SHOPS[town]) return { error: '돌려보낼 마을을 골라야 한다.' };
    const r = logic.repOf(d);
    const before = r[town] || 0;
    r[town] = clamp(Math.max(before, -20) + H.returnRep, -100, 100);
    diary(k, `${REGIONS[town].name}${josa(REGIONS[town].name, '으로', '로')} 돌아갔다.`, now);
    k.status = 'returned';
    k.data.liveIn = town; // 사는 마을 (마을에서 다시 만나는 이벤트)
    k.data.path = 'return';
    k.data.ended = now;
    return { title: k.name, lines: [
      `${ga(k)} ${REGIONS[town].name}${josa(REGIONS[town].name, '으로', '로')} 돌아갔다. 드래곤에게 길러진 사람의 이야기가 마을에 퍼진다.`,
      `${REGIONS[town].name} 평판 ${before} → ${r[town]}`,
    ] };
  }
  return { error: '알 수 없는 길이다.' };
}

// ── 알과 새끼 드래곤 ──────────────────────────────
function incubate(d, kin, id, have, now = Date.now()) {
  const err = atNest(d);
  if (err) return { error: err };
  const k = findKin(kin, id);
  if (!k || k.status !== 'egg') return { error: '품을 알이 없다.' };
  if (k.data.incubateAt) return { error: '이미 품고 있다.' };
  const need = KIN.eggNeeds[k.data.kind];
  if (have(need) < 1) return { error: `${ITEMS[need].name}${josa(ITEMS[need].name, '이', '가')} 있어야 알을 품을 수 있다.` };
  k.data.incubateAt = now;
  return {
    title: '알',
    lines: [`${ITEMS[need].name}${josa(ITEMS[need].name, '을', '를')} 알 곁에 두고 품기 시작했다. 껍데기 속에서 무언가 꿈틀거린다.`, `깨어나기까지 ${fmtDays(R.hatchTime / DAY)}.`],
    items: [{ id: need, qty: -1 }],
  };
}

// ── 가출 ──────────────────────────────────────────
const RW = KIN.runaway;
// 아이가 보호자를 부르는 말: 성별 칸이 여성이면 엄마, 남성이면 아빠, 그 밖에는 이름
// 다 큰 식구(인간 어른·노년, 젊은 용·다 자란 용)는 엄마·아빠 대신 어머니·아버지라고 부름. 이름으로 부르던 것은 그대로
const GROWN_CALL = ['어른', '노년', '젊은 용', '다 자란 용'];
function callFor(d, k, now = Date.now()) {
  const c = callName(d);
  if (!k || !GROWN_CALL.includes(stageOf(k, now).name)) return c;
  return c === '엄마' ? '어머니' : c === '아빠' ? '아버지' : c;
}
const isParentCall = (c) => ['엄마', '아빠', '어머니', '아버지'].includes(c);
function callName(d) {
  let b = d.bio;
  if (typeof b === 'string') { try { b = JSON.parse(b || '{}'); } catch { b = {}; } }
  const g = (b && b.gender) || '';
  return g === '여성' || g === '암컷' ? '엄마' : g === '남성' || g === '수컷' ? '아빠' : d.name;
}
// 말을 하는 식구인지: 인간, 그리고 폴리모프를 하는 어린 용부터
const canTalk = (k, now) => k.type === 'human' || stageOf(k, now).name !== '해츨링';
const isRunaway = (k) => !!k.data.runaway;
function runawayChance(k, now) {
  const st = stageOf(k, now).name;
  if (!(k.type === 'human' ? RW.human : RW.drake).includes(st)) return 0;
  if (k.status !== 'home' || k.data.onExp || k.data.errand || k.data.companion || k.data.job) return 0;
  if (k.data.lastRunaway && now - k.data.lastRunaway < RW.gapDays * DAY) return 0;
  let p = RW.base;
  if ((k.data.bond ?? 50) < RW.lowBond) p += RW.lowBondAdd;
  if (k.data.sat != null && k.data.sat < (k.type === 'human' ? HG.hungry : DF.hungry)) p += RW.hungryAdd;
  const last = k.type === 'human' ? k.data.lastCare : Math.max(k.data.lastFeed || 0, k.data.lastTrain || 0, k.data.born || 0);
  if (last && now - last > RW.neglectDays * DAY) p += RW.neglectAdd;
  for (const [t, a] of Object.entries(RW.traitAdd)) if (hasT(k, t)) p += a;
  for (const [t, m] of Object.entries(RW.traitCut)) if (hasT(k, t)) p *= m;
  return p;
}
// 어디로 나갔는지: 둥지 근처(둥지 지역 반, 나머지는 본 대륙의 다른 야생 지역)
function runawayRegion(d) {
  const wild = Object.keys(REGIONS).filter((r) => !SHOPS[r] && REGIONS[r].realm !== 'ruin');
  return d.nest && Math.random() < 0.5 ? d.nest : pick(wild);
}
const RW_CLUE = ['둥지 바닥에 작은 발자국이 {r} 쪽으로 나 있다.', '{r} 쪽으로 가는 길에 떨어뜨린 듯한 장난감 하나가 놓여 있다.', '{r} 쪽에서 왔다는 바람에 익숙한 냄새가 섞여 있다.'];
// 돌아올 때: 가끔 그 지역에서 주운 작은 선물
function runawayGift(d, k, region, out) {
  if (Math.random() >= RW.giftChance) return null;
  const pool = REGION_LOOT[region]?.common || [];
  if (!pool.length) return null;
  const id = pick(pool);
  const call = callFor(d, k);
  const parent = isParentCall(call);
  const nm = ITEMS[id].name;
  const say = canTalk(k, Date.now())
    ? `"${parent ? call : `${call}에게`} 주려고 주웠어." ${ga(k)} ${nm}${josa(nm, '을', '를')} 내밀었다.`
    : `${ga(k)} ${parent ? '' : `${call}의 `}발치에 ${nm}${josa(nm, '을', '를')} 살며시 내려놓았다.`;
  out.lines.push(say);
  return { id, qty: 1 };
}
// 직접 찾아가기 (그 지역에 있어야 함)
function searchRunaway(d, kin, id, have, now = Date.now()) {
  const k = findKin(kin, id);
  if (!k || !isRunaway(k)) return { error: '찾을 식구가 없다.' };
  const r = k.data.runaway.region;
  if (d.region !== r) return { error: `${REGIONS[r].name}에 가야 찾을 수 있다.` };
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  if (d.ap < RW.searchAp) return { error: `행동력이 모자란다. (${RW.searchAp} 필요)` };
  logic.spendAp(d, RW.searchAp, now);
  k.data.runaway = null;
  addBond(k, RW.foundBond);
  const call = callFor(d, k, now);
  const found = pick(k.type === 'human'
    ? [`나무 위에서 울다 잠든 ${k.name}${josa(k.name, '을', '를')} 찾았다.`, `개울가에 쪼그려 앉아 돌을 던지던 ${k.name}${josa(k.name, '을', '를')} 찾았다.`, `덤불 속에 숨어 있던 ${k.name}${josa(k.name, '이', '가')} 먼저 뛰어나왔다.`]
    : [`바위틈에 몸을 말고 있던 ${k.name}${josa(k.name, '을', '를')} 찾았다.`, `높은 가지에 매달려 내려오지 못하던 ${k.name}${josa(k.name, '을', '를')} 찾았다.`, `작은 불씨를 피워 놓고 웅크린 ${k.name}${josa(k.name, '을', '를')} 찾았다.`]);
  const out = { lines: [found] };
  out.lines.push(canTalk(k, now) ? `"${call}! 찾으러 올 줄 알았어…" ${ga(k)} 품에 안겼다.` : `${ga(k)} 끼룩 울며 품으로 파고들었다.`);
  out.lines.push(`유대 +${RW.foundBond}`);
  const g = runawayGift(d, k, r, out);
  return { title: k.name, lines: out.lines, items: g ? [g] : [] };
}
// 새끼 드래곤을 보내 찾아오게 함 (곁에 두지 않은 어린 용 이상, 심부름처럼 다녀옴)
function sendSeek(kin, drakeId, targetId, now = Date.now()) {
  const t = findKin(kin, targetId);
  if (!t || !isRunaway(t)) return { error: '찾을 식구가 없다.' };
  if (t.data.runaway.seeker) return { error: '이미 누군가 찾으러 갔다.' };
  const k = findKin(kin, drakeId);
  if (!k || k.id === t.id) return { error: '보낼 새끼가 아니다.' };
  const res = sendErrand(kin, drakeId, t.data.runaway.region, RW.seekMinutes, false, now);
  if (res.error) return res;
  k.data.errand.seek = t.id;
  t.data.runaway.seeker = k.id;
  return { title: k.name, lines: [`${k.name}에게 ${t.name}${josa(t.name, '을', '를')} 찾아오게 했다.`, `${ga(k)} 고개를 끄덕이고 ${REGIONS[t.data.runaway.region].name} 쪽으로 날아갔다.`] };
}

// ── 둥지 시설의 일 ─────────────────────────────────
const FW = FACILITY.worker;
// 이 식구가 맡은 일에서 내는 힘. 일할 수 없으면 null
function workerOf(k, now = Date.now()) {
  if (k.type !== 'human' || k.status !== 'home' || !k.data.job || !FACILITY.list[k.data.job]) return null;
  if (k.data.onExp || k.data.path === 'knight' || k.data.runaway) return null;
  const stg = stageOf(k, now).name;
  const adult = FW.adultStages.includes(stg);
  if (!adult && !FW.apprenticeStages.includes(stg)) return null;
  const F = FACILITY.list[k.data.job];
  const fit = (F.talent && k.data.talent === F.talent) || F.traits.some((t) => hasT(k, t));
  return { adult, fit, part: (adult ? FW.adult : FW.apprentice) * (fit ? FW.fit : 1) * (hasT(k, 'capable') ? GR.capable : 1) }; // 야무진
}
function setJob(d, kin, id, fac, now = Date.now()) {
  const k = findKin(kin, id);
  if (!k || k.type !== 'human' || k.status !== 'home') return { error: '일을 맡길 수 있는 식구가 아니다.' };
  if (!fac) { if (!k.data.job) return { error: '맡은 일이 없다.' }; const was = FACILITY.list[k.data.job]?.name; k.data.job = null; return { title: k.name, lines: [`${ga(k)} ${was || '일'}에서 손을 놓고 쉬기로 했다.`] }; }
  const F = FACILITY.list[fac];
  if (!F || !logic.facOf(d)[fac]) return { error: '그 시설이 둥지에 없다.' };
  const stg = stageOf(k, now).name;
  if (!FW.adultStages.includes(stg) && !FW.apprenticeStages.includes(stg)) return { error: `${k.name}${josa(k.name, '은', '는')} 아직 너무 어리다. 소년이 되면 견습으로 일할 수 있다.` };
  if (k.data.path === 'knight') return { error: '용기사는 둥지 일을 맡을 수 없다.' };
  if (isRunaway(k)) return { error: `${k.name}${josa(k.name, '은', '는')} 지금 둥지에 없다.` };
  const other = kin.find((x) => x !== k && x.type === 'human' && x.status === 'home' && x.data.job === fac);
  if (other) other.data.job = null; // 한 시설에는 한 명
  k.data.job = fac;
  const w = workerOf(k, now);
  return { title: k.name, lines: [`${k.name}에게 ${F.name} 일을 맡겼다.${w?.adult ? '' : ' (견습)'}`, w?.fit ? `${ga(k)} 눈을 반짝인다. 잘 맞는 일이다.` : `${ga(k)} 소매를 걷어붙였다.`] };
}
// 약초밭: 하루 한 번 거둠 (한국 날짜)
function harvest(d, kin, now = Date.now()) {
  if (!d.nest || d.region !== d.nest) return { error: '둥지에 있을 때만 거둘 수 있다.' };
  const fac = logic.facOf(d);
  if (!fac.herb) return { error: '약초밭이 없다.' };
  const day = logic.dayIdx(now);
  if (fac.herb.day === day) return { error: '오늘은 이미 거두었다. 내일 다시 거두자.' };
  fac.herb.day = day;
  const F = FACILITY.list.herb;
  const p = logic.facPower(d, 'herb');
  const n = Math.round(F.rolls * p);
  const ids = Array.from({ length: n }, () => pick(F.pool));
  if (Math.random() < F.rareChance * p) ids.push(F.rare);
  const cnt = {};
  for (const x of ids) cnt[x] = (cnt[x] || 0) + 1;
  const items = Object.entries(cnt).map(([id, qty]) => ({ id, qty }));
  const worker = kin.find((x) => x.data.job === 'herb' && workerOf(x, now));
  const lines = [worker ? `${ga(worker)} 흙 묻은 손으로 약초밭을 거두었다.` : '약초밭을 거두었다.', `${items.map((x) => `${ITEMS[x.id].name}${x.qty > 1 ? ` ${x.qty}개` : ''}`).join(', ')}${josa('개', '을', '를')} 얻었다.`];
  if (cnt[F.rare]) lines.push(`${ITEMS[F.rare].name}${josa(ITEMS[F.rare].name, '이', '가')} 섞여 있었다!`);
  return { title: '약초밭', lines, items };
}
// 부엌: 재료를 건네면 일하는 아이가 바로 요리 (하루 횟수 제한, 보호자 기력은 들지 않음)
const cookUses = (cook) => (cook ? (cook.adult ? FACILITY.list.kitchen.uses.adult : FACILITY.list.kitchen.uses.apprentice) + (cook.glutton ? FACILITY.list.kitchen.uses.glutton : 0) : 0);
function cookLeft(d, now = Date.now()) {
  const k = logic.facOf(d).kitchen;
  if (!k || !d.perks?.cook) return 0;
  const used = k.day === logic.dayIdx(now) ? k.used || 0 : 0;
  return Math.max(0, cookUses(d.perks.cook) - used);
}
function cook(d, kin, recipe, have, now = Date.now()) {
  if (!d.nest || d.region !== d.nest) return { error: '둥지에 있을 때만 맡길 수 있다.' };
  const fac = logic.facOf(d);
  if (!fac.kitchen) return { error: '부엌이 없다.' };
  const c = d.perks?.cook;
  const k = c && findKin(kin, c.id);
  if (!k || !workerOf(k, now)) return { error: '부엌에서 일하는 아이가 없다. 먼저 아이에게 부엌 일을 맡기자.' };
  if (!FACILITY.cookable.includes(recipe)) return { error: '부엌에서 만들 수 있는 요리가 아니다.' };
  const r = RECIPES.find((x) => x.out === recipe);
  if (!r) return { error: '알 수 없는 요리다.' };
  if (cookLeft(d, now) < 1) return { error: `오늘은 ${k.name}${josa(k.name, '이', '가')} 더 요리할 수 없다. 내일 다시 맡기자.` };
  for (const [x, q] of Object.entries(r.needs)) if (have(x) < q) return { error: `${ITEMS[x].name}${josa(ITEMS[x].name, '이', '가')} 모자란다. (${q}개 필요)` };
  const day = logic.dayIdx(now);
  if (fac.kitchen.day !== day) { fac.kitchen.day = day; fac.kitchen.used = 0; }
  fac.kitchen.used = (fac.kitchen.used || 0) + 1;
  const F = FACILITY.list.kitchen;
  const out = `${recipe}__k`;
  let qty = 1;
  const name = ITEMS[out].name;
  const lines = [`${ga(k)} 재료를 받아 들고 ${ITEMS[recipe].name}${josa(ITEMS[recipe].name, '을', '를')} 정성껏 만들었다.`];
  if (c.glutton && Math.random() < F.extra.glutton) {
    if (Math.random() < F.eat) lines.push(`먹보 ${k.name}${josa(k.name, '은', '는')} 한 그릇 더 만들었지만… 맛만 본다더니 다 먹어 버렸다.`);
    else { qty++; lines.push(`먹보 ${k.name}${josa(k.name, '은', '는')} 신이 나서 한 그릇을 더 만들었다!`); }
  }
  if (c.handy && Math.random() < F.extra.handy) { qty++; lines.push(`손재주 좋은 ${k.name} 덕에 모양까지 예쁘게 하나 더 나왔다.`); }
  // 다정한 아이: 둥지의 다른 아이들과 나눠 먹음
  if (c.gentle) {
    const others = kin.filter((x) => x !== k && x.type === 'human' && x.status === 'home');
    for (const o of others) { satUpdate(o, now, false); o.data.sat = Math.min(100, o.data.sat + F.share.sat); addBond(o, F.share.bond); }
    if (others.length) lines.push(`다정한 ${k.name}${josa(k.name, '은', '는')} 만든 것을 조금씩 덜어 다른 아이들과 나눠 먹었다.`);
  }
  addBond(k, 1);
  lines.push(`${name}${qty > 1 ? ` ${qty}개` : ''}${josa(qty > 1 ? '개' : name, '을', '를')} 받았다. (오늘 ${cookLeft(d, now)}번 더)`);
  return { title: '부엌', lines, items: [...Object.entries(r.needs).map(([x, q]) => ({ id: x, qty: -q })), { id: out, qty }] };
}

// ── 심부름 ─────────────────────────────────────────
// 곁에 두지 않은 새끼를 혼자 보냄. allowRuin: 멸망한 대륙으로 보낼 수 있는지 (서버가 정화도로 정함)
function sendErrand(kin, id, region, minutes, allowRuin, now = Date.now()) {
  const EH = KIN.drakeHelp.errand;
  const k = findKin(kin, id);
  if (!k || k.type !== 'drake' || k.status !== 'home') return { error: '심부름을 보낼 수 있는 새끼가 아니다.' };
  const stg = stageOf(k, now).name;
  if (!EH.from.includes(stg)) return { error: `${k.name}${josa(k.name, '은', '는')} 아직 혼자 다니기에 어리다. 어린 용이 되면 심부름을 보낼 수 있다.` };
  if (k.data.errand) return { error: `${ga(k)} 이미 심부름을 떠나 있다.` };
  if (isRunaway(k)) return { error: `${k.name}${josa(k.name, '은', '는')} 지금 둥지에 없다.` };
  if (k.data.onExp) return { error: `${ga(k)} 원정에 함께 가 있다.` };
  if (k.data.companion) return { error: `곁에 둔 새끼는 심부름을 보낼 수 없다. 먼저 곁에서 풀어 주자.` };
  const r = REGIONS[region];
  if (!r) return { error: '그런 곳은 없다.' };
  if (r.realm === 'ruin') {
    if (!EH.ruinFrom.includes(stg)) return { error: '멸망한 대륙은 너무 위험하다. 다 자란 용만 보낼 수 있다.' };
    if (!allowRuin) return { error: `${r.name}${josa(r.name, '은', '는')} 아직 오염이 짙어 갈 수 없다.` };
  }
  const m = Number(minutes);
  if (!EH.minutes.includes(m)) return { error: '심부름 시간을 골라야 한다.' };
  k.data.errand = { region, start: now, end: now + m * 60000 * (hasT(k, 'windrider') ? GR.windrider : 1), minutes: m }; // 바람을 타는: 빨리 다녀옴
  k.data.ask = null; // 조르던 것은 없던 일로
  return { title: k.name, lines: [`${k.name}에게 ${r.name}${josa(r.name, '으로', '로')} 심부름을 보냈다. (${m >= 60 ? `${m / 60}시간` : `${m}분`})`, `${ga(k)} 고개를 끄덕이고 힘차게 날아올랐다.`] };
}
// 돌아온 심부름: 그 지역의 재료를 줍고, 배가 줄어듦
function finishErrand(k, now) {
  const EH = KIN.drakeHelp.errand;
  const e = k.data.errand;
  k.data.errand = null;
  const st = k.data.stats || {};
  const loot = REGION_LOOT[e.region] || {};
  const n = (EH.rolls[e.minutes] || 3) + (EH.stageRolls[stageOf(k, now).name] || 0) + Math.floor((st.wing || 0) / EH.wingPer) + (hasT(k, 'pathfinder') ? 1 : 0); // 길눈 밝은
  const rareUp = (st.wisdom || 0) * EH.wisdomRare * (hasT(k, 'curious') ? 1.5 : 1) + (hasT(k, 'stargazer') ? GR.stargazer : 0) + (hasT(k, 'sharpnose') ? GR.sharpnose : 0); // 별을 읽는·코가 예민한
  growAdd(k, 'errand');
  const ids = [];
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    const tier = r < EH.tier.rare + rareUp ? 'rare' : r < EH.tier.rare + rareUp + EH.tier.uncommon ? 'uncommon' : 'common';
    const pool = (loot[tier]?.length ? loot[tier] : loot.common) || [];
    if (pool.length) ids.push(pick(pool));
  }
  if (hasT(k, 'hunter')) ids.push('beast_hide', 'beast_hide'); // 사냥 본능: 오는 길에 사냥까지
  if (stageOf(k, now).name === '다 자란 용' && Math.random() < EH.trophy) {
    const pl = Object.values(PLACES).filter((p) => p.region === e.region && p.drop);
    if (pl.length) ids.push(pick(pl).drop);
  }
  const cnt = {};
  for (const id of ids) cnt[id] = (cnt[id] || 0) + 1;
  const items = Object.entries(cnt).map(([id, qty]) => ({ id, qty }));
  if (k.data.sat != null) k.data.sat = Math.max(0, k.data.sat - EH.satPerHour * (e.minutes / 60));
  const rname = REGIONS[e.region]?.name || '먼 곳';
  const what = items.map((x) => `${ITEMS[x.id].name}${x.qty > 1 ? ` ${x.qty}개` : ''}`).join(', ');
  return { items, line: `${ga(k)} ${rname}에서 심부름을 마치고 돌아왔다. ${what ? `입에 물고 온 것: ${what}.` : '아무것도 찾지 못했는지 시무룩하다.'}` };
}

// 곁에 둘 새끼 고르기 (하나만). 같은 새끼를 다시 고르면 풀어 줌
function setCompanion(kin, id, now = Date.now()) {
  const k = findKin(kin, id);
  if (!k || k.type !== 'drake' || k.status !== 'home') return { error: '곁에 둘 수 있는 새끼가 아니다.' };
  if (!KIN.drakeHelp.ally.from.includes(stageOf(k, now).name)) return { error: `${k.name}${josa(k.name, '은', '는')} 아직 너무 어리다. 어린 용이 되면 함께 싸울 수 있다.` };
  if (k.data.companion) { k.data.companion = false; return { title: k.name, lines: [`${ga(k)} 둥지에 남아 쉬기로 했다.`] }; }
  if (k.data.errand) return { error: `${ga(k)} 심부름을 떠나 있다. 돌아오면 곁에 둘 수 있다.` };
  if (isRunaway(k)) return { error: `${k.name}${josa(k.name, '은', '는')} 지금 둥지에 없다.` };
  for (const x of kin) if (x.type === 'drake') x.data.companion = false;
  k.data.companion = true;
  return { title: k.name, lines: [`${ga(k)} 날개를 펼치고 곁에 섰다. 이제 사냥과 강적과의 싸움에 함께 나선다.`] };
}
const trainCd = (k) => (R.trainCooldown - (hasT(k, 'diligent') ? TR.diligentMs : 0) - (hasT(k, 'steadfast') ? GR.hourMs : 0) + (hasT(k, 'wild') ? GR.hourMs : 0) + (hasT(k, 'sleepyhead') ? GR.hourMs : 0)) * (drakeFull(k) ? DF.fullTrainCd : 1); // 부지런한·듬직한·배부름: 짧음, 천방지축: 김
function train(d, kin, id, stat, now = Date.now(), opt = {}) {
  const err = opt.away ? null : atNest(d);
  if (err) return { error: err };
  const k = findKin(kin, id);
  if (!k || k.type !== 'drake' || k.status !== 'home') return { error: '가르칠 새끼가 없다.' };
  if (k.data.errand) return { error: `${ga(k)} 심부름을 떠나 있다. 돌아오면 가르치자.` };
  if (isRunaway(k)) return { error: `${k.name}${josa(k.name, '은', '는')} 지금 둥지에 없다.` };
  if (!STAT_KEYS.includes(stat)) return { error: '알 수 없는 능력치다.' };
  const limit = R.trainLimit[stageOf(k, now).i];
  if (k.data.trains >= limit) return { error: '지금은 더 가르쳐도 소용이 없다. 조금 더 자라야 한다.' };
  if (statRoom(k, now) <= 0) return { error: `${ga(k)} 지금 배울 수 있는 만큼은 다 배웠다. 조금 더 자라야 한다.` };
  if (now - (k.data.lastTrain || 0) < trainCd(k)) return { error: `${ga(k)} 지쳐 있다. 조금 쉬게 하자.` };
  if (d.ap < R.trainAp) return { error: `행동력이 모자란다. (${R.trainAp} 필요)` };
  if (d.en < R.trainEn) return { error: `기력이 모자란다. (${R.trainEn} 필요)` };
  if (d.ap >= logic.apCap(d)) d.ap_at = now;
  d.ap -= R.trainAp;
  d.en -= R.trainEn;
  const up = Math.min(statRoom(k, now), hasT(k, 'clever') && Math.random() < TR.cleverChance ? 2 : 1); // 영리한: 가끔 한 번 더 (합의 상한까지)
  const bondUp = 3 + (clingyish(k) ? 2 : 0) + (hasT(k, 'affable') ? 1 : 0) + (drakeFull(k) ? DF.fullTrainBond + (hasT(k, 'greedy') ? 1 : 0) : 0); // 응석받이·속 깊은·살가운·배부름(먹성 좋은은 더)
  k.data.stats[stat] += up;
  if (['claw', 'wing', 'wisdom'].includes(stat)) growAdd(k, stat); // 자람 기록: 가르친 쪽
  k.data.trains += 1;
  k.data.lastTrain = now;
  const bondGot = addBond(k, bondUp);
  const name = STATS.find((s) => s.key === stat).name;
  const how = { claw: '바위를 할퀴는 법', scale: '비늘을 단단히 세우는 법', wing: '바람을 타는 법', wisdom: '별을 읽는 법', majesty: '포효하는 법' }[stat];
  const lines = [`${k.name}에게 ${how}을 가르쳤다.`];
  if (up > 1) lines.push(`영리한 ${k.name}${josa(k.name, '은', '는')} 한 번 보고 두 가지를 깨우쳤다.`);
  if (clingyish(k)) lines.push(hasT(k, 'dignified') ? `${ga(k)} 끝나자 가만히 머리를 기대 왔다.` : `${ga(k)} 끝나자마자 품으로 파고든다.`);
  lines.push(`${name} +${up}${bondGot ? `, 유대 +${bondGot}` : ''}`);
  return { title: k.name, lines };
}

// 다 자란 새끼를 떠나보냄. 강하게, 정 깊게 키울수록 용족 명성이 크게 오름
function release(d, kin, id, now = Date.now()) {
  const err = atNest(d);
  if (err) return { error: err };
  const k = findKin(kin, id);
  if (!k || k.type !== 'drake' || k.status !== 'home') return { error: '떠나보낼 새끼가 없다.' };
  if (ageOf(k, now) < R.independentDay) return { error: '아직 혼자 살아가기에는 어리다.' };
  return { title: '독립', lines: freeDrake(d, kin, k, now) };
}
// 새끼를 독립시키고 문장을 돌려줌 (떠나보내기, 이벤트에서 함께 씀)
function freeDrake(d, kin, k, now) {
  const sum = STAT_KEYS.reduce((a, s) => a + k.data.stats[s], 0);
  const gain = 8 + Math.floor(sum / 4) + (k.data.bond >= 60 ? 4 : 0);
  diary(k, '다 자라 둥지를 떠났다.', now);
  k.status = 'independent';
  k.data.ended = now;
  k.data.lastGift = now;
  k.data.personality = personalityOf(k);
  const lines = [
    `${ga(k)} 둥지 가장자리에서 한 번 뒤돌아보고는 힘차게 날아올랐다.`,
    `${{ friendly: '인간과 어울려', hermit: '조용히 홀로', hostile: '거칠게 하늘을 누비며' }[k.data.personality]} 살아갈 것이다.`,
  ];
  const f = logic.addFame(d, gain);
  lines.push(`새끼를 길러 낸 드래곤으로 이름이 났다. 용족 명성 +${gain}`);
  if (f) lines.push(f);
  lines.push(`계보: ${kin.filter((x) => x.type === 'drake' && x.status === 'independent').length}마리째 독립`);
  return lines;
}

// ── 원정에 함께 가는 식구 ──────────────────────────
// 원정에 따라갈 수 있는 식구인지
function canFollow(k, now = Date.now()) {
  if (k.status !== 'home') return false;
  const from = k.type === 'human' ? H.expeditionFrom : R.expeditionFrom;
  if (k.type === 'human' && k.data.path === 'stay') return false; // 둥지를 지키는 어른은 남음
  if (k.data.runaway || k.data.errand) return false; // 가출·심부름 중인 식구는 못 따라감
  if (k.type === 'human' && k.data.job && FACILITY.list[k.data.job]) return false; // 시설 일을 맡은 식구는 둥지에 남아 일함
  return ageOf(k, now) >= from;
}
// 원정 떠나기 창에 보여 줄, 데려갈 수 있는 식구 (고르게 함)
const expCandidates = (kin, now = Date.now()) => kin.filter((k) => canFollow(k, now)).map((k) => ({ id: k.id, name: k.name, type: k.type, stage: stageOf(k, now).name }));
// stay: 이번에는 둥지에 두고 갈 식구 id 목록
function expStart(kin, now = Date.now(), stay = []) {
  const keep = new Set((Array.isArray(stay) ? stay : []).map(Number));
  const went = [];
  for (const k of kin) {
    if (!canFollow(k, now) || keep.has(k.id)) continue;
    k.data.onExp = true; k.data.expAt = now; k.data.ask = null; went.push(k.name); // expAt: 둥지 이야기에 '따라나섰다'를 적을 때
  }
  return went;
}
// 함께 간 식구의 이름·종류·나잇대 (원정 길 팝업의 말: 아이·청소년·어른, 새끼 드래곤)
const ageGroup = (k, now) => {
  const s = stageOf(k, now).name;
  if (k.type === 'drake') return s === '해츨링' ? 'drake' : s === '다 자란 용' ? 'dadult' : s === '젊은 용' ? 'dteen' : 'dyoung'; // 해츨링은 말을 못 하고(몸짓), 어린 용부터는 말을 함 (드래곤다운 말). 젊은 용은 한창 커 가는 나이의 말투
  return ['어른', '노년'].includes(s) ? 'adult' : s === '청소년' ? 'young' : 'child';
};
const expWent = (kin, now = Date.now()) => kin.filter((k) => k.status === 'home' && k.data.onExp).map((k) => ({ name: k.name, age: ageGroup(k, now) }));
// 함께 간 식구 수. 호기심 많은 식구는 조금 더 쳐 줌
const companions = (kin) => kin.filter((k) => k.data.onExp && k.status === 'home').reduce((a, k) => a + 1 + (hasT(k, 'curious') ? TR.curiousBonus : 0) + (hasT(k, 'adventurer') ? TR.curiousBonus : 0), 0); // 호기심 많은·모험을 좋아하는
function expFinish(kin, minutes) {
  const lines = [];
  const back = [];
  for (const k of kin) {
    if (!k.data.onExp) continue;
    k.data.onExp = false;
    if (k.status !== 'home') continue;
    k.data.expBack = Date.now(); // 둥지 이야기에 '돌아왔다'를 적을 때
    back.push(k.name);
    addBond(k, 3 + (hasT(k, 'brave') ? 2 : 0) + (hasT(k, 'chatterbox') ? 1 : 0)); // 씩씩한: 원정이 즐거움, 수다쟁이: 1 더
    if (k.type === 'human') {
      k.data.trips += 1;
      growAdd(k, 'trip');
      if (!k.data.talent) k.data.lean.guard += KIN.tripTalent;
    } else {
      const want = Math.min(2, Math.floor(minutes / 60)) + (hasT(k, 'wild') && minutes >= 60 && Math.random() < GR.wildChance ? 1 : 0); // 천방지축: 가끔 하나 더
      const n = Math.min(want, statRoom(k)); // 이 단계의 능력치 합 상한까지
      const got = [];
      // 날쌘·고집 센·꿈꾸는: 그쪽으로 잘 자람
      const bias = hasT(k, 'swift') ? 'wing' : hasT(k, 'stubborn') ? 'claw' : hasT(k, 'dreamy') ? 'wisdom' : hasT(k, 'proud') ? 'majesty' : null;
      for (let i = 0; i < n; i++) {
        const s = bias && Math.random() < TR.growBias ? bias : pick(STAT_KEYS);
        k.data.stats[s] += 1;
        got.push(STATS.find((x) => x.key === s).name);
      }
      if (got.length) lines.push(`${ga(k)} 원정에서 자랐다. ${got.map((g) => `${g} +1`).join(', ')}`);
      else if (want > 0) lines.push(`${ga(k)} 원정에서 많은 것을 보고 왔지만, 더 자라려면 시간이 필요해 보인다.`);
    }
  }
  if (back.length) lines.unshift(`${back.join(', ')}${josa(back.at(-1), '이', '가')} 함께 다녀왔다. 유대 +3`);
  return lines;
}
// 둥지에서 함께 쉰 시간
function restTogether(kin, minutes) {
  const n = Math.min(10, Math.floor(minutes / 30) * H.restBondPer30m);
  const hs = homeKin(kin).humans;
  if (!hs.length || !n) return null;
  const extra = [];
  for (const k of hs) {
    const dbl = hasT(k, 'sleepy') || hasT(k, 'lonely'); // 잠꾸러기·외로움을 타는: 두 배
    const fullUp = (k.data.sat ?? 0) >= HG.full ? HG.restFull : 1;   // 배부르면 더 푹 쉼
    addBond(k, Math.round(n * (dbl ? 2 : hasT(k, 'homebody') ? 1.5 : 1) * fullUp) + (hasT(k, 'songbird') ? 1 : 0)); // 둥지를 좋아하는: 1.5배, 노래를 좋아하는: 1 더
    growAdd(k, 'rest');
    if (dbl) extra.push(k.name);
  }
  const names = hs.map((k) => k.name).join(', ');
  const ex = extra.length ? ` (${extra.join(', ')}${josa(extra.at(-1), '은', '는')} 곁에 꼭 붙어 +${n * 2})` : '';
  return `${names}${josa(names, '과', '와')} 함께 쉬었다. 유대 +${n}${ex}`;
}

// ── 이벤트 엔진 ────────────────────────────────────
function ctxOf(d, kin, have, trigger, now, region = d.region) {
  const hk = homeKin(kin, logic.maxKinOf(d));
  return {
    d, now, trigger, region, town: !!SHOPS[region],
    // 사람 모습: 인간의 마을(왕도·해안 어촌)에서는 우호·은둔 드래곤이 폴리모프로 사람 틈에 섞여 다님 (적대는 용의 모습 그대로)
    human: !!SHOPS[region] && d.stance !== 'hostile',
    rep: logic.repOf(d)[region] || 0, fame: d.fame || 0, stance: d.stance, nest: d.nest,
    ...hk,                                        // home humans drakes eggs full
    grown: [...hk.humans, ...hk.drakes],          // 알을 뺀 식구
    gone: kin.filter((x) => x.type === 'drake' && x.status === 'independent'), // 독립한 새끼
    past: kin.filter((x) => x.type === 'human' && x.status === 'dead'),     // 긴 잠에 든 인간 식구
    away: kin.filter((x) => x.type === 'human' && x.status === 'returned'), // 마을로 떠난 인간 식구 (마을에서 다시 만남)
    k: (id) => hk.home.find((x) => x.id === id) || null, // 이벤트가 고른 식구 (떠났으면 null)
    kAny: (id) => kin.find((x) => x.id === id) || null, // 떠난 식구까지 (독립한 새끼, 긴 잠에 든 식구)
    age: (x) => (x && x.data.born ? (now - x.data.born) / DAY : -1),
    stage: (x) => stageOf(x, now).name,          // '아기' '아이' … '어린 용' …
    canTravel: (x) => ageOf(x, now) >= (x.type === 'human' ? H.expeditionFrom : R.expeditionFrom),
    pick,
    have, perks: d.perks || {}, stats: logic.statsOf(d), josa,
    rivals: d.rivalsCache || [], me: d.name, regionName: REGIONS[region]?.name || '', // 라이벌 이벤트
    call: callName(d), // 아이가 나를 부르는 말 (엄마·아빠·이름)
    callOf: (k) => callFor(d, k, now), // 그 식구가 부르는 말 (다 크면 어머니·아버지)
    chest: d.nest ? logic.chestOf(d) : [], // 보물 상자 (아이의 선물에서 이미 받은 것을 확인)
    // 날씨·계절·장소·보물더미·재앙의 흔적 (날씨·둥지 이벤트)
    weather: logic.weatherIdAt(region, now), season: logic.seasonAt(now).id, level: d.level,
    place: region === d.region ? logic.placeOf(d) : null,
    hoard: d.nest && logic.hooks.hoard ? logic.hooks.hoard(d.id).filter((x) => x.qty > 0) : [],
    hoardValue: d.nest ? logic.nestInfo(d).value || 0 : 0,
    bossTrace: logic.hooks.bossTrace ? logic.hooks.bossTrace(region) : null,
    // 동료와의 관계 (관계 이벤트). 처음 볼 때 한 번만 불러옴
    get ties() { return this._ties || (this._ties = (logic.hooks.ties && safe(() => logic.hooks.ties(d))) || NO_TIES); },
    hour: new Date(now + 9 * 3600000).getUTCHours(), // 한국 시각 (밤 이벤트)
    corrupted: logic.isCorrupted(region, now), // 오염된 땅 (오염 이벤트)
  };
}
const NO_TIES = { mentor: null, students: [], heart: null, nemesis: [], friends: [], departed: [], adoptedOut: [] };
const weightOf = (e, c) => (typeof e.weight === 'function' ? e.weight(c) : e.weight);
function safe(fn) { try { return fn(); } catch { return false; } }

function pending(d) {
  if (!d.pending_event) return null;
  try { return JSON.parse(d.pending_event); } catch { return null; }
}
function eventView(e, c, vars) {
  return {
    id: e.id, title: e.title,
    lines: e.text(c, vars),
    choices: e.choices.map((ch, i) => ({
      i,
      label: typeof ch.label === 'function' ? ch.label(c, vars) : ch.label,
      hidden: ch.show ? !ch.show(c, vars) : false,
      reason: ch.need ? ch.need(c, vars) : null,
    })).filter((x) => !x.hidden),
  };
}

// 행동 뒤에 이벤트가 일어나는지 굴림. 일어나면 선택 창에 보낼 내용을 돌려줌
// 최근에 겪은 이벤트 [[id, 시각], …] 와, 그 이벤트가 지금 얼마나 덜 뜰지 (1 = 그대로)
function recentOf(d) {
  if (Array.isArray(d.ev_recent)) return d.ev_recent;
  try { return JSON.parse(d.ev_recent || '[]'); } catch { return []; }
}
function recentFactor(recent, id, now) {
  const hit = recent.find((x) => x[0] === id);
  if (!hit) return 1;
  const step = EVENT_RULES.recent.steps.find(([gap]) => now - hit[1] < gap);
  return step ? step[1] : 1;
}
function rememberEvent(d, id, now) {
  const list = [[id, now], ...recentOf(d).filter((x) => x[0] !== id)].slice(0, EVENT_RULES.recent.keep);
  d.ev_recent = JSON.stringify(list);
}

function rollEvent(d, kin, have, trigger, now = Date.now(), force = false) {
  if (pending(d)) return null;
  if (!force && Math.random() >= (EVENT_RULES.chance[trigger] || 0) * (1 + FACILITY.list.library.event * logic.facPower(d, 'library'))) return null; // 서고: 이야기가 조금 더 자주
  const c = ctxOf(d, kin, have, trigger, now);
  // 멸망한 대륙에서는 그 땅의 이벤트(ruin)와 어울리는 오염 이벤트(ruinToo)만, 다른 곳에서는 멸망한 대륙 이벤트를 빼고
  const inRuin = logic.isRuin(c.region);
  const list = EVENTS.filter((e) => (inRuin ? e.ruin || e.ruinToo : !e.ruin) && e.when.includes(trigger) && safe(() => e.cond(c)) && weightOf(e, c) > 0);
  if (!list.length) return null;
  // 최근에 본 이벤트는 무게를 줄임. 후보가 모두 최근 것뿐이면 그만큼 아예 덜 일어남
  const recent = recentOf(d);
  const w = new Map(list.map((e) => [e, weightOf(e, c) * recentFactor(recent, e.id, now)]));
  const base = list.reduce((a, e) => a + weightOf(e, c), 0);
  const total = list.reduce((a, e) => a + w.get(e), 0);
  if (!force && Math.random() >= Math.max(EVENT_RULES.recent.floor, total / base)) return null;
  let r = Math.random() * total;
  const e = list.find((x) => (r -= w.get(x)) < 0) || list[list.length - 1];
  const vars = e.setup ? e.setup(c) : {};
  d.pending_event = JSON.stringify({ id: e.id, vars, at: now, region: d.region, trigger });
  rememberEvent(d, e.id, now);
  return eventView(e, c, vars);
}

// GM: 고른 이벤트를 바로 일으킴. ignoreCond면 조건이 맞지 않아도 (문장을 만들 수 있을 때만)
function forceEvent(d, kin, have, id, ignoreCond, now = Date.now()) {
  const e = EVENTS.find((x) => x.id === id);
  if (!e) return { error: '그런 이벤트는 없다.' };
  const c = ctxOf(d, kin, have, e.when[0], now);
  if (!ignoreCond && !safe(() => e.cond(c))) return { error: '지금은 이 이벤트의 조건이 맞지 않는다. (조건 무시를 켜면 일으킬 수 있다)' };
  let vars;
  try { vars = e.setup ? e.setup(c) : {}; e.text(c, vars); } catch {
    return { error: '이 이벤트에 필요한 것이 없어 일으킬 수 없다. (예: 식구가 있어야 하는 이벤트)' };
  }
  d.pending_event = JSON.stringify({ id: e.id, vars, at: now, region: d.region, trigger: e.when[0] });
  return { ok: true, title: e.title };
}

// 기다리는 이벤트. 사정이 바뀌어 더는 일어날 수 없으면 조용히 지나감
function currentEvent(d, kin, have, now = Date.now()) {
  const p = pending(d);
  if (!p) return null;
  const e = EVENTS.find((x) => x.id === p.id);
  const c = ctxOf(d, kin, have, p.trigger, now, p.region);
  if (!e || !safe(() => { e.text(c, p.vars); return true; })) { d.pending_event = null; return null; }
  return { e, c, vars: p.vars };
}
function getEvent(d, kin, have, now = Date.now()) {
  const cur = currentEvent(d, kin, have, now);
  return cur ? eventView(cur.e, cur.c, cur.vars) : null;
}

function chooseEvent(d, kin, have, idx, now = Date.now()) {
  const cur = currentEvent(d, kin, have, now);
  if (!cur) return { error: '그 일은 이미 지나갔다.' };
  const { e, c, vars } = cur;
  const ch = e.choices[Number(idx)];
  if (!ch || (ch.show && !ch.show(c, vars))) return { error: '고를 수 없는 선택이다.' };
  const reason = ch.need ? ch.need(c, vars) : null;
  if (reason) return { error: reason };

  const out = { lines: [], items: [], hoardItems: [], gold: 0, tells: [], sends: [], purify: 0, loves: [], babies: [] };
  const town = SHOPS[c.region] ? c.region : nearestTown(c.region);
  const h = {
    say: (...l) => out.lines.push(...l),
    gold: (n) => { d.gold = Math.max(0, d.gold + n); out.gold += n; },
    give: (id, qty = 1) => out.items.push({ id, qty }),
    take: (id, qty = 1) => out.items.push({ id, qty: -qty }),
    rep: (region, n) => logic.addRep(d, region, n),
    fame: (n) => { const l = logic.addFame(d, n); if (l) out.lines.push(l); },
    hp: (n) => { d.hp = clamp(d.hp + n, 1, logic.hpCap(d)); },
    en: (n) => { d.en = clamp(d.en + n, 0, logic.enCap(d)); },
    bond: (k, n) => { if (k) addBond(k, n); },
    lean: (k, t, n) => { if (k && !k.data.talent) k.data.lean[t] += n; },
    train: (k, s) => { if (k && k.data.stats && statRoom(k, now) > 0) k.data.stats[s] += 1; }, // 능력치 합의 상한까지
    leave: (k, status) => { k.status = status; k.data.ended = now; },
    // 새끼의 성격을 한쪽으로 기울임 (그 성향 밑에서 며칠 더 자란 것처럼)
    nudge: (k, stance, days) => {
      if (!k || !k.data.stanceMs) return;
      k.data.stanceMs[stance] = (k.data.stanceMs[stance] || 0) + days * DAY;
      (k.data.stanceNudge ||= {})[stance] = (k.data.stanceNudge[stance] || 0) + days * DAY; // 선택지로 기운 몫 (성격 문구에 씀)
    },
    adopt: (origin) => {
      if (homeKin(kin, logic.maxKinOf(d)).full) return out.lines.push('둥지에는 이미 식구가 가득해 더 데려갈 수 없었다.');
      const k = newHuman(origin, now, origin === 'lost' ? nearestTown(c.region) : town);
      k.name = freshName(kin, HUMAN_NAMES);
      kin.push(k);
      out.lines.push(`아이에게 '${k.name}'${josa(k.name, '이라는', '라는')} 이름을 붙여 주었다. ${introOf(k)}`);
    },
    egg: (kind) => {
      if (homeKin(kin, logic.maxKinOf(d)).full) return out.lines.push('둥지에는 이미 식구가 가득해 알을 둘 자리가 없었다.');
      const k = newEgg(kind, now);
      k.name = freshName(kin, DRAKE_NAMES);
      kin.push(k);
    },
    nearestTown: () => nearestTown(c.region),
    notify: (id, text, title) => out.tells.push({ id, text, title }), // 다른 드래곤에게 소식 (라이벌 이벤트 등)
    diary: (k, t) => { if (k) diary(k, t, now); }, // 함께한 날들에 한 줄
    // 짝 사이의 아이를 이 둥지의 아기 식구로 (자리가 없으면 그 뜻만 알림)
    born: (k, name, found) => { if (!bornKid(kin, d, [k.name, k.data.mate?.name], name, found, k.data.town || nearestTown(c.region), now)) out.lines.push('둥지에 빈자리가 없어 아이를 들이지 못했다.'); },
    // 다른 둥지의 짝: 아이를 그 둥지에서 키우게 하거나(raise), 마을에 가정을 꾸리게 하자는(village) 청 (kinlove.js)
    babyAsk: (k, kind, baby, found) => { if (k?.data.mate?.ref) out.babies.push({ kind, id: k.id, name: k.name, mate: k.data.mate.name, ref: k.data.mate.ref, baby, found: !!found, town: k.data.town || nearestTown(c.region) }); },
    loveAsk: (k) => { if (k?.data.loveRef) out.loves.push({ id: k.id, name: k.name, ref: k.data.loveRef }); }, // 다른 둥지 첫사랑에게 혼인 청 (kinlove.js)
    // 보물더미에서 꺼내거나 넣음 (꺼낼 때는 지금 있는 만큼만)
    hoardTake: (id, qty = 1) => {
      const have = (c.hoard.find((x) => x.item === id)?.qty || 0) + out.hoardItems.filter((x) => x.id === id).reduce((a, x) => a + x.qty, 0);
      const n = Math.min(qty, have);
      if (n > 0) out.hoardItems.push({ id, qty: -n });
      return n;
    },
    hoardGive: (id, qty = 1) => out.hoardItems.push({ id, qty }),
    keep: (kind, from = '', text = '') => logic.chestAdd(d, kind, from, text, now), // 보물 상자에 넣음 (도둑이 못 가져가고 꺼낼 수 없음)
    send: (id, items, msg = '') => out.sends.push({ id, items, msg }),
    purify: (n) => { out.purify += n; }, // 오염된 땅의 정화 기여 // 다른 드래곤에게 물건을 보냄 (받은 선물 상자로)
    xp: (n) => { const lv = d.level; logic.gainXp(d, n); if (d.level > lv) out.lines.push(`레벨 ${d.level}${[2, 4, 5, 9].includes(d.level % 10) ? '가' : '이'} 되었다!`); },
    count: (key) => out.lines.push(...logic.traitCount(d, key)), // 칭호·특성에 쓰는 셈
    free: (k) => { if (k && k.type === 'drake' && k.status === 'home') out.lines.push(...freeDrake(d, kin, k, now)); },
    buff: (id, minutes) => logic.giveBuff(d, id, minutes),
    mind: (n) => { if (!logic.berserkOf(d)) d.mind = clamp((d.mind ?? 100) + n, 0, 100); },
    name: (k) => ga(k),
    josa,
  };
  ch.run(h, c, vars);
  // 키우는 태도 (다정·믿음·엄격·자유): 그 일을 겪은 식구의 자람 기록에
  if (ch.tone) for (const id of new Set([vars?.id, vars?.a, vars?.b, vars?.m].filter((x) => x != null))) growAdd(kin.find((x) => x.id === id), ch.tone);
  // 함께한 날들: 그 일을 겪은 식구에게 '이벤트 이름: 고른 것'
  {
    const lb = typeof ch.label === 'function' ? ch.label(c, vars) : ch.label;
    for (const id of new Set([vars?.id, vars?.a, vars?.b, vars?.m].filter((x) => x != null))) {
      const kk = kin.find((x) => x.id === id);
      if (kk && (kk.status === 'home' || kk.status === 'independent')) diary(kk, `'${e.title}' — ${lb.replace(/\s*\([^)]*\)\s*$/, '')}.`, now); // 끝의 (금화 15) 같은 값은 뺌
    }
  }
  d.pending_event = null;
  const label = typeof ch.label === 'function' ? ch.label(c, vars) : ch.label;
  return { title: e.title, lines: out.lines, items: out.items, hoardItems: out.hoardItems, gold: out.gold, choice: label, tells: out.tells, sends: out.sends, purify: out.purify, loves: out.loves, babies: out.babies };
}

// GM 도구: 자람 기록과 가장 가까운 성격, 친구
function growInfo(k) {
  if (k.status !== 'home') return null;
  const b = growBest(k);
  return {
    grow: { ...(k.data.grow || {}) },
    traits: (k.data.traits || []).map((id) => ({ name: KIN_TRAITS[id]?.name || id, grown: !!KIN_TRAITS[id]?.grown })),
    best: b ? { name: KIN_TRAITS[b.trait].name, v: Math.round(b.v * 100) / 100 } : null,
    grown: grownCount(k), max: GR.max, special: GR.special,
    friends: Object.values(k.data.friends || {}).sort((p, q) => q.n - p.n).map((f) => ({ name: f.name, owner: f.owner, n: f.n })),
  };
}

// ── 왕도 축제에 식구들 데려가기: 축제 중 왕도에 있을 때. 축제마다 낮에 한 번, 야시장이 열린 밤에 한 번 (식구마다) ──
const FEST_GROUP = { '아기': 'babyH', '아이': 'kidH', '소년': 'kidH', '청소년': 'youthH', '어른': 'adultH', '노년': 'adultH', '해츨링': 'hatch', '어린 용': 'littleD', '젊은 용': 'olderD', '다 자란 용': 'olderD' };
// 그 시각에 야시장이 열려 있었는지 (server.js가 nightmarket.js의 시간표로 정해 줌)
let nightAt = () => false;
const setNightCheck = (fn) => { nightAt = fn; };
const festSlot = (t) => (nightAt(t) ? 'night' : 'day');
// 이번 축제에 낮·밤 각각 다녀왔는지. 다녀온 시각으로 판단하므로, 예전 방식으로 남은 기록(festAt 하나)도 그 시각이 낮이었는지 밤이었는지로 인정함
// 이번 축제에 다녀온 횟수: 함께한 날들에 남은 축제 기록으로 셈 (규칙을 바꾸는 사이에 낮·밤 구분 없이 다녀온 것까지)
const FEST_DIARY = /왕도 축제/;
const festCount = (k, fest) => { const from = fest.until - 2 * DAY; return (k.data.diary || []).filter((e) => e.at >= from && e.at < fest.until && FEST_DIARY.test(e.t)).length; };
function festSlots(k, fest) {
  const rec = k.data.fest && k.data.fest.key === fest.key ? k.data.fest : {};
  const out = { day: !!rec.day, night: !!rec.night };
  const at = k.data.festAt, from = fest.until - 2 * DAY;
  if (at && at >= from && at < fest.until) out[festSlot(at)] = true;
  if (festCount(k, fest) >= 2) { out.day = true; out.night = true; out.full = true; } // 이미 두 번 다녀왔으면 더는 못 감 (축제마다 두 번까지)
  return out;
}
const festKids = (kin, fest, slot) => kin.filter((k) => k.status === 'home' && !k.data.onExp && !k.data.runaway && !(k.type === 'drake' && k.data.errand) && !festSlots(k, fest)[slot]);
const festWent = (kin, fest, slot) => kin.filter((k) => festSlots(k, fest)[slot]);
function festOuting(d, kin, fest, nightOpen, now = Date.now()) {
  if (!fest) return { error: '지금은 축제가 열리지 않았다.' };
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  if (d.region !== FESTIVAL.region) return { error: `식구들과 축제를 보려면 ${REGIONS[FESTIVAL.region]?.name || '왕도'}에 가야 한다.` };
  if (!d.nest) return { error: '아직 둥지를 틀지 않아 데려갈 식구가 없다.' };
  const slot = nightOpen ? 'night' : 'day';
  const went = festKids(kin, fest, slot);
  if (!went.length) {
    if (!festWent(kin, fest, slot).length) return { error: '함께 축제에 갈 수 있는 식구가 없다.' };
    if (kin.filter((k) => k.status === 'home').every((k) => festSlots(k, fest).full)) return { error: '이번 축제에는 이미 식구들과 두 번 다녀왔다.' };
    return { error: slot === 'night' ? '이번 축제의 야시장 밤에는 이미 식구들과 함께 다녀왔다.' : '이번 축제의 낮 구경은 이미 식구들과 함께 다녀왔다. 야시장이 열리면 한 번 더 갈 수 있다.' };
  }
  const F = KIN_FEST;
  const line = (tpl, k) => fillT(tpl, { a: k ? k.name : '', o: callFor(d, k, now) }); // 다 큰 식구는 어머니·아버지
  const lines = [pick(nightOpen ? F.openNight : F.open)];
  const used = new Set(); // 한 나들이에서 같은 장면이 겹치지 않게
  // 다른 식구가 있어야 말이 되는 장면은 그럴 때만: '어린 식구들'은 더 어린 식구가 함께 왔을 때, '식구들 몫'은 둘 이상 함께 왔을 때
  const YOUNG = new Set(['babyH', 'kidH', 'hatch', 'littleD']);
  const groupOf = (k) => FEST_GROUP[stageOf(k, now).name] || 'kidH';
  const fits = (tpl, k) => {
    if (/어린 식구/.test(tpl)) return went.some((o) => o !== k && YOUNG.has(groupOf(o)));
    if (/식구들 몫/.test(tpl)) return went.length > 1;
    return true;
  };
  for (const k of went) {
    const g = groupOf(k);
    const pool = [...(F.scene[g] || F.scene.kidH)];
    if (nightOpen) pool.push(...(g === 'hatch' || g === 'babyH' ? [] : F.night.any), ...(F.night[g] || [])); // 밤에는 야시장 장면도 (아기·해츨링은 제 장면만)
    for (let i = pool.length - 1; i >= 0; i--) if (!fits(pool[i], k)) pool.splice(i, 1);
    // 제 장면을 다 썼으면 꺼내 쓰는 장면에서 (한 나들이에서 같은 문장이 두 번 나오지 않게)
    let fresh = pool.filter((t) => !used.has(t));
    if (!fresh.length) fresh = (F.spare[g === 'babyH' || g === 'hatch' ? g : k.type] || []).filter((t) => !used.has(t));
    const tpl = pick(fresh.length ? fresh : pool);
    used.add(tpl);
    const gain = addBond(k, F.bond);
    lines.push(`${line(tpl, k)}${gain ? ` (${k.name} 유대 +${gain})` : ''}`);
    growAdd(k, 'warm', 0.5);
    const rec = k.data.fest && k.data.fest.key === fest.key ? k.data.fest : { key: fest.key };
    rec[slot] = now; k.data.fest = rec; k.data.festAt = now;
    diary(k, line(pick(nightOpen ? F.diaryNight : F.diary), k), now);
  }
  if (went.length > 1) {
    // 둘이 함께한 장면 하나 (아기는 빼고. 사람과 용이면 사람을 앞에)
    const can = went.filter((k) => stageOf(k, now).name !== '아기');
    if (can.length > 1) {
      const x = pick(can), y = pick(can.filter((k) => k !== x));
      // 사람과 용이면 사람을 앞에, 용 둘이면 나이 많은 쪽을 앞에 (어린 쪽을 날개로 감싸 주는 장면 등)
      const [a, b] = x.type === 'drake' && y.type === 'human' ? [y, x] : x.type === 'drake' && y.type === 'drake' && (x.data.born || 0) > (y.data.born || 0) ? [y, x] : [x, y];
      const pool = a.type === 'human' && b.type === 'human' ? F.pair.hh : a.type === 'drake' && b.type === 'drake' ? F.pair.dd : F.pair.hd;
      lines.push(fillT(pick(pool), { a: a.name, b: b.name, o: callFor(d, a, now) }));
    }
    const hs = went.some((k) => k.type === 'human'), ds = went.some((k) => k.type === 'drake');
    lines.push(pick(F.family[hs && ds ? 'mixed' : ds ? 'drake' : 'human']));
  }
  // 아이나 어린 용이 함께 갔으면, 가끔 축제 그림을 그려 줌 (보물 상자)
  const drawer = went.filter((k) => F.drawStages.includes(stageOf(k, now).name));
  if (drawer.length && Math.random() < F.drawChance) {
    const k = pick(drawer);
    if (logic.chestAdd(d, 'fest_drawing', k.name, line(F.drawNote, k), now)) lines.push(line(F.drawLine, k));
  }
  return { title: '왕도 축제', lines, items: [] };
}

module.exports = {
  bornKid, // 짝 사이의 아이를 아기 식구로 (kinlove.js에서도 씀)
  loveDiaryFix, // 예전 첫사랑 기록 채우기 (서버를 켤 때 한 번)
  festKids, festWent, festOuting, setNightCheck, // 왕도 축제에 식구들 데려가기 (낮 한 번 · 야시장 밤 한 번)
  touch, // 교감
  playable, playTogether, bestFriends, growInfo,
  expCandidates,
  tick, perksOf, summary, views, homeKin, stageOf,
  care, rename, choosePath, incubate, train, release,
  expStart, expFinish, companions, restTogether,
  rollEvent, getEvent, chooseEvent, forceEvent, diary, addBond, // diary·addBond: 다른 둥지 아이와 맺어질 때 (kinlove.js)
  newHuman, newEgg, hatch, setCompanion, sendErrand, setJob, harvest, cook, cookLeft, expWent, searchRunaway, sendSeek, callName, // 시험용
};
