// 게임 규칙: 회복, 단발 행동(탐사·채집·사냥), 원정
// 숫자를 조절하고 싶으면 이 파일과 game-data.js의 RULES를 고치면 됩니다.
// 모든 함수는 드래곤 객체 d를 직접 바꾸고, 결과 { lines, items, gold, xp, ... }를 돌려줍니다.
// 저장은 부르는 쪽(server.js)이 db.saveState(d, items)로 합니다.

const {
  REGIONS, ITEMS, REGION_LOOT, CREATURES, SCENES, SCENES_HUMAN, RULES, RECIPES, SLOTS, STANCES, SHOPS, REP_TIERS, repTier, TRADE, NEST, hoardTier, RAID, BOND_RULES, SEASONS, SEASON_RULES, WEATHERS, W_BASE, W_REGION, ELEMENTS,
  HOARD_TIERS, CRAFT, SHOPS_SPECIAL, STANCE_RULES, fameTier, KIN, SKILLS, FISHING, RUIN, FACILITY, TRAITS, TRAIT_EARN, STAT_POINTS, STATS, MIND, PLACES, REGION_PLACES, PLACE_RULES, BUFFS, TITLES, TITLE_COUNT_NAMES, EXP_GOALS, EXP_FORKS, EXP_RULES, EXP_LONG, BOSSES, ACHIEVEMENTS, KEEPSAKES,
} = require('./game-data');

const SR = STANCE_RULES;

const STAT_KEYS = ['claw', 'scale', 'wing', 'wisdom', 'majesty'];

// ── 특성 ───────────────────────────────────────────
// 저장 공간에는 글자(JSON)로: { list: [특성 id], chosen: 처음 골랐는지, counts: {행동: 횟수}, done: [일어난 TRAIT_EARN id] }
function traitsOf(d) {
  if (typeof d.traits === 'string' || !d.traits) {
    try { d.traits = JSON.parse(d.traits || '{}'); } catch { d.traits = {}; }
  }
  const t = d.traits;
  t.list ||= []; t.counts ||= {}; t.done ||= [];
  return t;
}
const MULT = ['apRegen', 'hpRegen', 'enRegen', 'huntDmg', 'buy', 'sell', 'intimidateGold', 'repGain', 'fameGain', 'xp', 'expRolls', 'mindDrain'];
// 가진 특성의 효과를 모두 합침
function traitMods(d) {
  const m = { stats: {}, hpMax: 0, enMax: 0, huntClaw: 0, gatherExtra: 0, exploreFind: 0, bond: 0 };
  for (const k of MULT) m[k] = 1;
  for (const id of traitsOf(d).list) {
    const mod = TRAITS[id]?.mod;
    if (!mod) continue;
    for (const [k, v] of Object.entries(mod)) {
      if (k === 'stats') for (const [s2, n] of Object.entries(v)) m.stats[s2] = (m.stats[s2] || 0) + n;
      else if (MULT.includes(k)) m[k] *= v;
      else m[k] += v;
    }
  }
  return m;
}
const hasTrait = (d, id) => traitsOf(d).list.includes(id);
// 처음 고르기 (만들 때, 또는 특성이 생기기 전에 만든 드래곤)
function chooseTraits(d, good, bad) {
  const t = traitsOf(d);
  if (t.chosen) return { error: '특성은 이미 정해졌다.' };
  if (!TRAITS[good]?.good) return { error: '긍정 특성을 하나 골라야 한다.' };
  if (!TRAITS[bad] || TRAITS[bad].good) return { error: '부정 특성을 하나 골라야 한다.' };
  t.list = [...new Set([...t.list, good, bad])];
  t.chosen = true;
  clampVitals(d);
  return { title: '특성', lines: [`'${TRAITS[good].name}'${josa(TRAITS[good].name, '과', '와')} '${TRAITS[bad].name}'. 타고난 기질이 정해졌다.`] };
}
// 행동을 세고, 문턱을 넘으면 특성이 생기거나 사라짐. 알려 줄 문장을 돌려줌
function traitCount(d, key, n = 1) {
  const t = traitsOf(d);
  t.counts[key] = (t.counts[key] || 0) + n;
  const lines = [];
  for (const r of TRAIT_EARN) {
    if (r.count !== key || t.done.includes(r.id) || t.counts[key] < r.at) continue;
    t.done.push(r.id);
    const got = (r.gain || []).filter((id) => !t.list.includes(id));
    const lost = (r.lose || []).filter((id) => t.list.includes(id));
    if (!got.length && !lost.length) continue;
    t.list = [...t.list.filter((id) => !lost.includes(id)), ...got];
    lines.push(r.line);
    for (const id of got) lines.push(`새 특성 '${TRAITS[id].name}'${josa(TRAITS[id].name, '이', '가')} 생겼다. ${TRAITS[id].desc}`);
    for (const id of lost) lines.push(`'${TRAITS[id].name}' 특성이 사라졌다.`);
  }
  if (lines.length) clampVitals(d);
  return lines;
}
// 특성과 칭호가 반영된 경험치
const xpOf = (d, xp) => (xp > 0 ? Math.max(1, Math.round(xp * traitMods(d).xp * (titleMods(d).xp || 1) * (1 + FACILITY.list.library.xp * facPower(d, 'library')))) : 0); // 서고: 경험치 조금 더

// ── 지나온 이야기 ──────────────────────────────────
// 선택(choice)과 큰 사건(mark)을 한 줄씩 남김. 최근 CHRON_MAX개만
const CHRON_MAX = 150;
function chronOf(d) {
  if (typeof d.chron === 'string' || !Array.isArray(d.chron)) {
    try { d.chron = JSON.parse(d.chron || '[]'); } catch { d.chron = []; }
    if (!Array.isArray(d.chron)) d.chron = [];
  }
  return d.chron;
}
function chron(d, k, t, now = Date.now()) {
  const l = chronOf(d);
  l.push({ at: now, k, t });
  if (k === 'mark') (d._news ||= []).push(t); // 라이벌에게 알릴 큰 사건 (저장하지 않음, 서버가 가져감)
  if (l.length > CHRON_MAX) l.splice(0, l.length - CHRON_MAX);
}

// ── 칭호 ───────────────────────────────────────────
// 저장 공간에는 글자(JSON)로: { have: [얻은 칭호 id], on: 단 칭호 id }. 업적 횟수는 특성 횟수(traits.counts)에 함께 셈
const TITLE_BY_ID = Object.fromEntries(TITLES.map((t) => [t.id, t]));
function titlesOf(d) {
  if (typeof d.titles === 'string' || !d.titles) {
    try { d.titles = JSON.parse(d.titles || '{}'); } catch { d.titles = {}; }
  }
  const t = d.titles;
  if (!Array.isArray(t.have)) t.have = [];
  // 칭호가 생기기 전의 사냥 횟수를 '이긴 횟수'로 한 번 옮겨 줌
  if (!t.seeded) {
    const c = traitsOf(d).counts;
    c.huntwin = Math.max(c.huntwin || 0, c.hunt || 0);
    t.seeded = true;
  }
  if (t.on && !t.have.includes(t.on)) t.on = null;
  return t;
}
const titleOn = (d) => TITLE_BY_ID[titlesOf(d).on] || null;
const titleName = (d) => titleOn(d)?.name || null;
// 단 칭호의 효과. 지역 칭호는 그 지역에 있을 때만 공격·받는 피해가 바뀜
function titleMods(d) {
  const t = titleOn(d);
  if (!t) return {};
  const m = { ...t.mod };
  if (m.region && m.region !== d.region) { delete m.atk; delete m.taken; }
  return m;
}
// 칭호 조건: 지금 값과 목표
function titleProgress(d, t) {
  const c = t.cond;
  if (c.count) return [traitsOf(d).counts[c.count] || 0, c.at];
  if (c.level) return [d.level, c.level];
  if (c.duel) {
    let cb = d.combat;
    if (typeof cb === 'string') { try { cb = JSON.parse(cb || '{}'); } catch { cb = {}; } }
    return [cb?.w || 0, c.duel];
  }
  if (c.hoard) return [d.nest ? nestInfo(d).value || 0 : 0, c.hoard];
  if (c.scars) {
    let sc = d.scars;
    if (typeof sc === 'string') { try { sc = JSON.parse(sc || '[]'); } catch { sc = []; } }
    return [(sc || []).length, c.scars];
  }
  return [0, 1];
}
function titleCondText(t) {
  const c = t.cond;
  if (c.count) {
    const [k, r] = c.count.split(':');
    const text = (TITLE_COUNT_NAMES[k] || `${k} {n}번`).replace('{n}', c.at);
    return r ? `${REGIONS[r].name}에서 ${text.replace('사냥에서 ', '사냥 ')}` : text;
  }
  if (c.level) return `레벨 ${c.level}`;
  if (c.duel) return `결투에서 ${c.duel}번 이기기`;
  if (c.scars) return `상흔 ${c.scars}개를 안고 살아남기`;
  if (c.hoard) return `보물더미 가치 ${c.hoard.toLocaleString()} 모으기`;
  return '';
}
// 새로 이룬 칭호를 얻음. 얻은 칭호 이름 목록을 돌려줌 (처음 얻으면 바로 달아 줌)
function checkTitles(d) {
  if (d.dead_at) return [];
  const t = titlesOf(d);
  const got = [];
  for (const ti of TITLES) {
    if (t.have.includes(ti.id)) continue;
    const [cur, at] = titleProgress(d, ti);
    if (cur >= at) { t.have.push(ti.id); got.push(ti); chron(d, 'mark', `칭호 '${ti.name}'${josa(ti.name, '을', '를')} 얻었다.`); }
  }
  if (got.length && !t.on) t.on = got[got.length - 1].id;
  return got;
}
function setTitle(d, id) {
  const t = titlesOf(d);
  if (!id) { t.on = null; return { ok: true, lines: ['칭호를 떼었다.'] }; }
  if (!TITLE_BY_ID[id]) return { error: '없는 칭호다.' };
  if (!t.have.includes(id)) return { error: '아직 얻지 못한 칭호다.' };
  t.on = id;
  return { ok: true, lines: [`이제 '${TITLE_BY_ID[id].name}'${josa(TITLE_BY_ID[id].name, '으로', '로')} 불린다. (${TITLE_BY_ID[id].eff})`] };
}
// 화면에 보낼 칭호 목록
function titlesView(d) {
  const t = titlesOf(d);
  return {
    on: t.on || null,
    list: TITLES.map((ti) => {
      const [cur, at] = titleProgress(d, ti);
      return { id: ti.id, name: ti.name, eff: ti.eff, cond: titleCondText(ti), have: t.have.includes(ti.id), cur: Math.min(cur, at), at };
    }),
  };
}

// ── 장신구와 실제 능력치 ───────────────────────────
// 저장 공간에는 글자(JSON)로 들어 있으니 객체로 바꿔 둠
// 예전 걸작 기록 옮기기: 장신구 전체에 붙어 있던 걸작 표시(gear[id].mw)를 실제 '걸작 ○○' 한 개로 바꿈
// 차고 있던 것이 있으면 그것을, 아니면 소지품의 하나를 걸작으로. 그 장신구의 강화·각인 기록도 걸작 쪽으로 옮김
function migrateMasterwork(d, have) {
  const g = gearOf(d), eq = equipOf(d), items = [];
  let changed = false;
  for (const [id, rec] of Object.entries(g)) {
    if (!rec?.mw || !ITEMS[`${id}__mw`]) continue;
    changed = true;
    const mw = `${id}__mw`;
    const { mw: _x, ...rest } = rec;
    const slot = Object.keys(eq).find((k) => eq[k] === id);
    if (slot) eq[slot] = mw;
    else if (have(id) > 0) items.push({ id, qty: -1 }, { id: mw, qty: 1 });
    else { g[id] = rest; continue; } // 지금 가진 것이 없으면 표시만 지움
    g[mw] = { ...(g[mw] || {}), ...rest };
    delete g[id];
  }
  return { items, changed };
}
function equipOf(d) {
  // 예전 저장 버그로 여러 겹 감싸진 값도 다 풀어 냄 (다음 저장 때 바르게 고쳐져 들어감)
  for (let i = 0; typeof d.equip === 'string' && i < 10; i++) {
    try { d.equip = JSON.parse(d.equip || '{}'); } catch { d.equip = {}; }
  }
  if (!d.equip || typeof d.equip !== 'object' || Array.isArray(d.equip)) d.equip = {};
  return d.equip;
}
// 장신구가 더해 주는 능력치
function bonusOf(d) {
  const b = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
  let expRare = 0;
  for (const id of Object.values(equipOf(d))) {
    const it = ITEMS[id];
    if (!it) continue;
    for (const [k, v] of Object.entries(it.bonus || {})) b[k] += v;
    expRare += it.expRare || 0;
    // 강화(+1~+3)와 걸작: 그 장신구의 주 능력치에 더함
    const g = gearOn(d, id);
    if (g) { const main = mainStat(it); if (main) b[main] += (g.plus || 0) + (g.mw ? 1 : 0); } // 걸작은 이제 따로 된 물건(id__mw)이라 g.mw는 옛 기록에만
  }
  b.majesty += fameTier(d.fame || 0).majesty; // 용족 명성
  if (d.nest) b.majesty += hoardTier(nestInfo(d).value || 0)?.majesty || 0; // 보물더미
  for (const [k, v] of Object.entries(traitMods(d).stats)) b[k] += v; // 특성
  return { stats: b, expRare };
}
// 타고난 값 + 장신구
function statsOf(d) {
  const b = bonusOf(d).stats;
  return Object.fromEntries(STAT_KEYS.map((k) => [k, d[k] + b[k]]));
}
// 비늘·지혜 장신구는 최대 체력·기력도 올림 (능력치 1당 체력 5, 기력 2)
const hpCap = (d) => Math.max(10, d.hp_max + bonusOf(d).stats.scale * 5 + traitMods(d).hpMax);
const enCap = (d) => Math.max(5, d.en_max + bonusOf(d).stats.wisdom * 2 + traitMods(d).enMax);
// 최대 행동력: 기본값 + 레벨 보너스. 계산식이라 기존 캐릭터에도 바로 적용됨 (DB의 ap_max 열은 더 쓰지 않음)
const apCap = (d) => RULES.apBase + Math.floor((d.level || 1) / RULES.apPerLevels);
function clampVitals(d) {
  d.hp = Math.min(d.hp, hpCap(d));
  d.en = Math.min(d.en, enCap(d));
}
// 사냥·강적·재앙·추격·진정에 나설 수 없을 만큼 기운이 없는지 (RULES.huntMinHp보다 낮으면)
const lowHp = (d) => d.hp < RULES.huntMinHp;

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

// 받침에 따라 조사 고르기
function josa(word, a, b) {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return `${a}(${b})`;
  return c % 28 ? a : b;
}

// ── 계절과 날씨 ────────────────────────────────────
// 시각으로 정해짐 (저장하지 않음). 같은 지역·같은 때면 누구에게나 같은 날씨
const SEASON_MS = SEASON_RULES.days * 24 * 3600000;
const SLOT_MS = SEASON_RULES.weatherHours * 3600000;
const seasonIndex = (now) => Math.floor(now / SEASON_MS) % SEASONS.length;
function seasonAt(now = Date.now()) {
  const s = SEASONS[seasonIndex(now)];
  return { id: s.id, name: s.name, desc: s.desc, fx: s.fx, until: (Math.floor(now / SEASON_MS) + 1) * SEASON_MS };
}
// 글자 하나로 0~1 사이 수 (같은 글자면 늘 같은 수)
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  // 잘 섞기 (murmur3 마무리)
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const weatherDebug = {}; // 시험·GM: { 지역: { id, until } } 이 시각까지 이 날씨로
function weatherIdAt(region, now = Date.now()) {
  const dbg = weatherDebug[region];
  if (dbg && dbg.until > now) return dbg.id;
  const slot = Math.floor(now / SLOT_MS);
  const season = SEASONS[seasonIndex(slot * SLOT_MS)].id;
  const w = { ...W_BASE[season] };
  const R = W_REGION[region] || {};
  for (const [k, v] of Object.entries(R.add || {})) w[k] = (w[k] || 0) + v;
  for (const [k, v] of Object.entries(R.mul || {})) if (w[k] != null) w[k] *= v;
  const list = Object.entries(w).filter(([k, v]) => v > 0 && WEATHERS[k]);
  const total = list.reduce((a, [, v]) => a + v, 0);
  let r = hash01(`${region}:${slot}`) * total;
  for (const [k, v] of list) { r -= v; if (r < 0) return k; }
  return list[list.length - 1][0];
}
// 지역의 지금 날씨와 다음 날씨
function weatherOf(region, now = Date.now()) {
  const id = weatherIdAt(region, now);
  const dbg = weatherDebug[region];
  const until = dbg && dbg.until > now ? dbg.until : (Math.floor(now / SLOT_MS) + 1) * SLOT_MS;
  return { id, name: WEATHERS[id].name, until, next: weatherIdAt(region, until) };
}
// 계절과 날씨의 효과를 하나로 합침
const FX_MUL = ['exploreGold', 'huntGold', 'hpRegen', 'enRegen', 'apRegen', 'mindRegen', 'restRegen', 'taken', 'foeAtk', 'foeHp'];
const FX_ADD = ['gatherExtra', 'findRare', 'exploreFind', 'drop', 'spd', 'foeSpd'];
function weatherFx(region, now = Date.now()) {
  const out = { ap: {}, elem: {} };
  for (const k of FX_MUL) out[k] = 1;
  for (const k of FX_ADD) out[k] = 0;
  if (!region) return out;
  for (const fx of [seasonAt(now).fx, WEATHERS[weatherIdAt(region, now)].fx]) {
    for (const k of FX_MUL) if (fx[k] != null) out[k] *= fx[k];
    for (const k of FX_ADD) if (fx[k] != null) out[k] += fx[k];
    for (const [k, v] of Object.entries(fx.ap || {})) out.ap[k] = (out.ap[k] || 0) + v;
    for (const [k, v] of Object.entries(fx.elem || {})) out.elem[k] = (out.elem[k] || 1) * v;
  }
  return out;
}
// 효과를 사람이 읽는 글로: 좋은 점, 나쁜 점, 속성 (속성은 나와 사냥감 모두에게)
const pctOf = (x) => `${x > 0 ? '+' : '−'}${Math.round(Math.abs(x) * 100)}%`;
function fxText(fx) {
  const pros = [], cons = [];
  const put = (good, t) => (good ? pros : cons).push(t);
  const mul = (k, label, goodUp = true) => { if (fx[k] != null && fx[k] !== 1) put((fx[k] > 1) === goodUp, `${label} ${pctOf(fx[k] - 1)}`); };
  const add = (k, label, goodUp = true, unit = 'p') => { if (fx[k]) put((fx[k] > 0) === goodUp, `${label} ${unit === 'p' ? `${fx[k] > 0 ? '+' : '−'}${Math.round(Math.abs(fx[k]) * 100)}%` : `${fx[k] > 0 ? '+' : '−'}${Math.abs(fx[k])}`}`); };
  add('gatherExtra', '채집');
  add('findRare', '귀한 물건');
  add('exploreFind', '탐사 발견');
  mul('exploreGold', '탐사 금화');
  mul('huntGold', '사냥 금화');
  add('drop', '전리품');
  mul('hpRegen', '체력 회복');
  mul('enRegen', '기력 회복');
  mul('apRegen', '행동력 회복');
  mul('mindRegen', '정신 회복');
  mul('restRegen', '둥지 휴식');
  add('spd', '날개', true, 'n');
  mul('taken', '받는 피해', false);
  mul('foeAtk', '사냥감 공격', false);
  mul('foeHp', '사냥감 체력', false);
  add('foeSpd', '사냥감 날개', false, 'n');
  const names = { explore: '탐사', gather: '채집', hunt: '사냥' };
  for (const [k, v] of Object.entries(fx.ap || {})) if (v) put(v < 0, `${names[k] || k} 행동력 ${v > 0 ? '+' : '−'}${Math.abs(v)}`);
  // 속성 피해: 세지면 좋은 점, 약해지면 나쁜 점으로 (나와 사냥감 모두에게 똑같이)
  for (const [k, v] of Object.entries(fx.elem || {})) if (v !== 1) put(v > 1, `${ELEMENTS[k] || k}${k === 'mist' ? ' 속성' : ''} ${pctOf(v - 1)}`);
  return { pros, cons };
}

// 효과를 숫자 없이 한 문장으로 (계절 설명). 같은 쪽으로 바뀌는 것끼리 묶음
// 예: '사냥 금화와 전리품을 얻을 확률이 늘고, 탐사에서 줍는 금화가 줄어든다.'
const PROSE = {
  gatherExtra: '채집에서 얻는 물건', findRare: '귀한 물건을 찾을 확률', exploreFind: '탐사에서 무언가 찾을 확률',
  exploreGold: '탐사에서 줍는 금화', huntGold: '사냥 금화', drop: '전리품을 얻을 확률',
  hpRegen: '체력 회복', enRegen: '기력 회복', apRegen: '행동력 회복', mindRegen: '정신 회복', restRegen: '둥지에서 쉴 때 회복',
  spd: '날개', taken: '받는 피해', foeAtk: '사냥감의 공격', foeHp: '사냥감의 체력', foeSpd: '사냥감의 날개',
};
const VERB = { up: ['늘고', '늘어난다'], down: ['줄고', '줄어든다'], fast: ['빨라지고', '빨라진다'], slow: ['느려지고', '느려진다'], strong: ['세지고', '세진다'], weak: ['약해지고', '약해진다'] };
const BAD_UP = ['taken', 'foeAtk', 'foeHp', 'foeSpd']; // 늘면 나쁜 것
function fxProse(fx) {
  const groups = [];
  const addTo = (dir, good, noun) => { let g = groups.find((x) => x.dir === dir && x.good === good); if (!g) groups.push(g = { dir, good, nouns: [] }); g.nouns.push(noun); };
  for (const k of Object.keys(PROSE)) {
    const v = fx[k];
    if (v == null) continue;
    const isMul = FX_MUL.includes(k);
    if (isMul ? v === 1 : v === 0) continue;
    const up = isMul ? v > 1 : v > 0;
    const dir = /Regen$/.test(k) ? (up ? 'fast' : 'slow') : k === 'foeAtk' ? (up ? 'strong' : 'weak') : (up ? 'up' : 'down');
    addTo(dir, BAD_UP.includes(k) ? !up : up, PROSE[k]);
  }
  if (!groups.length) return '';
  groups.sort((a, b) => Number(b.good) - Number(a.good)); // 좋은 것 먼저
  const parts = groups.map((g, i) => {
    const last = g.nouns[g.nouns.length - 1];
    const list = g.nouns.slice(0, -1).map((n) => `${n}${josa(n, '과', '와')} `).join('') + `${last}${josa(last, '이', '가')}`;
    return `${list} ${VERB[g.dir][i === groups.length - 1 ? 1 : 0]}`;
  });
  return `${parts.join(', ')}.`;
}

// ── 회복 ───────────────────────────────────────────
// 시간이 지난 만큼 행동력·체력을 채움. 접속하지 않은 동안에도 계산됨.
function regen(d, now = Date.now()) {
  // 값, 최댓값, 마지막 계산 시각 열 이름, 간격
  const tick = (key, cap, atKey, every) => {
    if (!d[atKey]) d[atKey] = now;
    if (d[key] >= cap) { d[atKey] = now; return; }
    const n = Math.floor((now - d[atKey]) / every);
    if (n > 0) {
      d[key] = Math.min(cap, d[key] + n);
      d[atKey] = d[key] >= cap ? now : d[atKey] + n * every;
    }
  };
  // 둥지에서 쉬면 더 빨리 참 (은둔은 더욱). 우호는 인간 마을에서 치료사 덕에 체력이 빨리 참
  let m = { ap: 1, hp: 1, en: 1 };
  if (d.rest_at) {
    const base = d.stance === 'hermit' ? SR.hermit.rest : NEST.rest;
    const r = nestTier(d).rest; // 넓힌 둥지일수록 더 빨리
    m = { ap: base.ap * r, hp: base.hp * r, en: base.en * r };
  } else if (d.stance === 'friendly' && isTown(d.region)) m = { ap: 1, hp: SR.friendly.townHpRegen, en: 1 };
  const tm = traitMods(d); // 특성: 회복 빠르기
  // 계절과 날씨. 둥지에서 쉬는 동안에는 궂은 날씨를 피함 (느려지는 효과는 없고, 겨울에는 둥지 온기로 더 빨라짐)
  const wx = weatherFx(d.region, now);
  const shelter = (v) => (d.rest_at ? Math.max(1, v) : v);
  const rr = d.rest_at ? wx.restRegen * (1 + FACILITY.list.spa.rest * facPower(d, 'spa')) : 1; // 온천: 쉴 때 더 빨리
  m = { ap: m.ap * shelter(wx.apRegen) * rr, hp: m.hp * shelter(wx.hpRegen) * rr, en: m.en * shelter(wx.enRegen) * rr };
  tick('ap', apCap(d), 'ap_at', RULES.apEvery / (m.ap * tm.apRegen));
  if (isFallen(d)) d.hp_at = now; // 쓰러져 있는 동안은 체력이 차지 않음
  else tick('hp', hpCap(d), 'hp_at', RULES.hpEvery / (m.hp * tm.hpRegen));
  tick('en', enCap(d), 'en_at', RULES.enEvery / (m.en * tm.enRegen));
  // 정신: 광폭화 중에는 차지 않음. 둥지에서 쉬면 빨리, 은둔이면 조금 더 빨리
  if (d.mind == null) d.mind = MIND.max;
  if (berserkOf(d)) d.mind_at = now;
  else tick('mind', MIND.max, 'mind_at', MIND.regenEvery / ((d.rest_at ? MIND.restMult * (hoardTier(nestInfo(d).value || 0)?.mind || 1) * (1 + FACILITY.list.spa.mind * facPower(d, 'spa')) : 1) * (d.stance === 'hermit' ? MIND.hermitMult : 1) * shelter(wx.mindRegen) * (hooks.together?.(d) ? BOND_RULES.together.mind : 1)));
}

// ── 장소 ───────────────────────────────────────────
// 지금 있는 장소 (인간 마을은 없음). 저장된 장소가 다른 지역 것이면 그 지역의 입구로
function placeOf(d) {
  const ids = REGION_PLACES[d.region];
  if (!ids) return null;
  return ids.includes(d.place) ? d.place : ids[0];
}
// 같은 지역 안에서 장소 옮기기 (행동력 없음). 너무 어려운 곳에는 들어갈 수 없음
function goPlace(d, id) {
  const p = PLACES[id];
  if (!p || p.region !== d.region) return { error: '이 지역에 그런 장소는 없다.' };
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 옮길 수 없다.' };
  if (d.rest_at) return { error: '둥지에서 쉬는 중이다. 먼저 깨어나야 한다.' };
  if (placeOf(d) === id) return { error: '이미 그곳에 있다.' };
  if (p.level > d.level + PLACE_RULES.tooHard) return { error: `${p.name}${josa(p.name, '은', '는')} 아직 너무 위험하다. (사냥터 Lv.${p.level}, 레벨 ${p.level - PLACE_RULES.tooHard}부터 들어갈 수 있다)` };
  d.place = id;
  return { title: p.name, lines: [p.desc] };
}
// 깊은 장소일수록 귀한 재료가 잘 나옴
function placeLoot(d) {
  const id = placeOf(d);
  const lv = id ? PLACES[id].level : 0;
  return { uncommon: lv * PLACE_RULES.lootPerLevel.uncommon, rare: lv * PLACE_RULES.lootPerLevel.rare };
}

// 쓰러져서 선택을 기다리는 중인지 (죽은 드래곤은 아님)
function isFallen(d) {
  if (d.dead_at || !d.fallen) return false;
  if (typeof d.fallen === 'string') { try { d.fallen = JSON.parse(d.fallen); } catch { d.fallen = null; } }
  return !!d.fallen;
}

// ── 정신과 오염 ────────────────────────────────────
// 오염된 땅: 야생 지역 중 하나. 하루마다 다음 곳으로 옮겨 감 (모두에게 같은 곳)
const isRuin = (region) => REGIONS[region]?.realm === 'ruin'; // 멸망한 대륙 (늘 오염되어 있음)
const WILD = () => Object.keys(REGIONS).filter((r) => !isTown(r) && !isRuin(r));
// 오염 시계: 서버가 { off, bump, force }를 알려 줌 (GM이 '지금 오염 일으키기'를 하면 바뀜)
//   off: 이 시각부터 rotateMs마다 새 오염 / bump: 그때까지 지난 차례 수 / force: { period, region } 그 차례에는 이 지역
const clockOf = () => (hooks.corruptClock && hooks.corruptClock()) || { off: 0, bump: 0, force: null };
function corruptPeriod(now = Date.now()) {
  const c = clockOf();
  return Math.floor((now - c.off) / MIND.rotateMs) + c.bump;
}
function corruptedRegion(now = Date.now()) {
  const w = WILD();
  const c = clockOf();
  const p = corruptPeriod(now);
  if (c.force && c.force.period === p && w.includes(c.force.region)) return c.force.region;
  return w[((p % w.length) + w.length) % w.length];
}
const corruptUntil = (now = Date.now()) => { const c = clockOf(); return c.off + (Math.floor((now - c.off) / MIND.rotateMs) + 1) * MIND.rotateMs; };
// 정화되었으면 다음 곳으로 옮겨 갈 때까지 오염이 걷혀 있음 (hooks.purified: 서버가 정화 상태를 알려 줌)
const isCorrupted = (region, now = Date.now()) => isRuin(region) || (region === corruptedRegion(now) && !(hooks.purified && hooks.purified(now)));
// 광폭화 상태 { at, until, region, hp, hpMax } (없으면 null)
function berserkOf(d) {
  if (!d.berserk) return null;
  if (typeof d.berserk === 'string') { try { d.berserk = JSON.parse(d.berserk); } catch { d.berserk = null; } }
  return d.berserk;
}
// 가장 가까운 인간 마을
function nearestTown(region) {
  if (isRuin(region)) return RUIN.gateFrom; // 멸망한 대륙에는 마을이 없음: 바다 건너 해안
  const r = REGIONS[region];
  return Object.keys(SHOPS).sort((a, b) =>
    Math.hypot(REGIONS[a].x - r.x, REGIONS[a].y - r.y) - Math.hypot(REGIONS[b].x - r.x, REGIONS[b].y - r.y))[0];
}
// 장신구가 막아 주는 정도 (정화의 부적)
// 희귀 장비의 특별한 효과 (사냥·강적에서만): vsCorrupt·eliteAtk·taken은 곱하고, shard는 더함
function gearMods(d) {
  const m = { vsCorrupt: 1, eliteAtk: 1, taken: 1, shard: 0 };
  for (const id of Object.values(equipOf(d))) {
    const g = ITEMS[id]?.gear;
    if (!g) continue;
    for (const k of ['vsCorrupt', 'eliteAtk', 'taken']) if (g[k]) m[k] *= g[k];
    if (g.shard) m.shard += g.shard;
  }
  return m;
}
function mindWard(d) {
  let w = 1;
  for (const id of Object.values(equipOf(d))) if (ITEMS[id]?.mindWard) w *= ITEMS[id].mindWard;
  return w * (titleMods(d).mindWard || 1);
}
// 정신을 깎음. 알려 줄 문장을 돌려줌 (경고 문턱을 넘으면 경고도)
function loseMind(d, n, max = Infinity) {
  if (!n || berserkOf(d)) return [];
  if (d.mind == null) d.mind = MIND.max;
  // 멸망한 대륙: 훨씬 빨리 닳음 (지역마다 다름). 같은 곳에 다른 드래곤이 있으면 덜 닳음
  const ruin = isRuin(d.region) ? RUIN.drain * (REGIONS[d.region].drain ?? 1) * (hooks.companionsHere && hooks.companionsHere(d) ? RUIN.together : 1) : 1;
  // max: 깎이는 정신의 상한 (몬스터의 피해 기반 소모 등). 특성·장신구 보호는 상한을 자른 뒤에 곱해 여전히 효과가 있음
  const lost = Math.max(1, Math.round(Math.min(max, n * ruin) * traitMods(d).mindDrain * mindWard(d)));
  const before = d.mind;
  d.mind = Math.max(0, d.mind - lost);
  if (before >= MIND.max) d.mind_at = Date.now();
  const lines = [`정신 −${before - d.mind} (남은 정신 ${d.mind})`];
  if (d.mind > 0 && d.mind <= MIND.warnAt && before > MIND.warnAt) {
    lines.push('머릿속에서 낯선 목소리가 울린다. 이대로면 광폭화한다. 둥지에서 쉬거나 진정의 향을 쓰고, 동료에게 도움을 청하자.');
  }
  return lines;
}

// 행동력을 쓸 때: 가득 차 있었다면 회복 시계를 지금부터 시작
function spendAp(d, n, now = Date.now()) {
  if (d.ap >= apCap(d)) d.ap_at = now;
  d.ap -= n;
}

// 행동에 드는 행동력. 은둔은 인간 마을에서 변장하느라 탐사·채집에 더 듦
function actionCost(d, type) {
  let c = RULES.cost[type];
  if (d.stance === 'hermit' && isTown(d.region) && (type === 'explore' || type === 'gather')) c += SR.hermit.townApExtra;
  c += weatherFx(d.region).ap[type] || 0; // 날씨: 뇌우에는 사냥이 힘듦
  return Math.max(1, c);
}

// ── 용족 명성 ──────────────────────────────────────
// 단계가 바뀌면 알려 줄 문장을 돌려줌
function addFame(d, n) {
  const before = fameTier(d.fame || 0);
  if (n > 0) n = Math.max(1, Math.round(n * traitMods(d).fameGain)); // 특성: 오만
  d.fame = Math.max(-100, Math.min(100, (d.fame || 0) + n));
  const after = fameTier(d.fame);
  if (after === before) return null;
  if (after.majesty === 0) return '드래곤들 사이의 소문이 잠잠해졌다.';
  if (n > 0) {
    return after.majesty > 0
      ? `용족 명성이 '${after.name}' 단계에 이르렀다. 위엄이 높아진다.`
      : `드래곤들 사이의 소문이 '${after.name}' 단계로 잦아들었다.`;
  }
  return after.majesty < 0
    ? `드래곤들 사이에 '${after.name}'의 소문이 돈다. 위엄이 꺾인다.`
    : `용족 명성이 '${after.name}' 단계로 내려갔다.`;
}

// ── 적대: 현상금과 습격 ────────────────────────────
// 어느 마을이든 원수가 되면 현상금이 걸림
function hasBounty(d) {
  if (d.stance !== 'hostile') return false;
  return Object.keys(SHOPS).some((r) => (repOf(d)[r] || 0) <= SR.hostile.bountyRep);
}
// 습격당하면 체력과 금화를 잃음. 일어나지 않으면 null
function ambush(d, chance) {
  if (d.perks?.guard) chance /= 2; // 둥지의 파수꾼
  if (!hasBounty(d) || Math.random() >= chance) return null;
  const h = SR.hostile;
  const dmg = Math.max(4, Math.round(randInt(h.ambushDmg[0], h.ambushDmg[1]) - statsOf(d).scale * 0.3));
  d.hp = Math.max(1, d.hp - dmg);
  const lost = Math.min(40, Math.floor(d.gold * h.ambushGold));
  d.gold -= lost;
  return {
    lost, dmg,
    lines: [
      '현상금을 노린 인간 기사단이 덮쳐 왔다.',
      lost ? `체력을 ${dmg} 잃고 금화 ${lost}닢을 빼앗겼다.` : `체력을 ${dmg} 잃고 겨우 몸을 뺐다.`,
    ],
  };
}

// 적대 드래곤이 인간 마을에 날아들면 성벽 궁수가 쏨
function townArrows(d) {
  if (d.stance !== 'hostile' || !isTown(d.region)) return null;
  const [a, b] = SR.hostile.arrows;
  const dmg = Math.max(3, Math.round(randInt(a, b) - statsOf(d).scale * 0.2));
  d.hp = Math.max(1, d.hp - dmg);
  return `성벽 위 궁수들이 화살을 퍼부었다. 체력을 ${dmg} 잃었다.`;
}

// ── 경험치와 레벨 ──────────────────────────────────
// 다음 레벨까지 필요한 경험치 (RULES.xpFrom 레벨부터 가파르게)
const xpNeed = (lv) => Math.round(lv * 100 * (1 + Math.max(0, lv - (RULES.xpFrom || Infinity)) * (RULES.xpStep || 0)));
const atMaxLevel = (d) => d.level >= (RULES.levelMax || Infinity);
function gainXp(d, xp) {
  if (atMaxLevel(d)) { d.xp = 0; return 0; } // 레벨 상한: 경험치가 더 쌓이지 않음
  d.xp += xp;
  const apBefore = apCap(d);
  const lvBefore = d.level;
  let up = 0;
  while (!atMaxLevel(d) && d.xp >= xpNeed(d.level)) {
    d.xp -= xpNeed(d.level);
    d.level += 1;
    d.hp_max += 5;
    d.en_max += 2;
    up += 1;
  }
  if (atMaxLevel(d)) d.xp = 0;
  if (up) {
    chron(d, 'mark', `레벨 ${d.level}${[2, 4, 5, 9].includes(d.level % 10) ? '가' : '이'} 되었다.`);
    d.stat_pts = (d.stat_pts || 0) + STAT_POINTS.perLevel * up; // 나눌 능력치 포인트
    for (const s of Object.values(SKILLS)) {
      if (s.lv > lvBefore && s.lv <= d.level) chron(d, 'mark', `새 스킬 '${s.name}'${josa(s.name, '을', '를')} 배웠다.`);
    }
    if (apCap(d) > apBefore) chron(d, 'mark', `최대 행동력이 ${apCap(d)}${[0, 3, 6].includes(apCap(d) % 10) ? '으로' : '로'} 늘었다.`);
    d.hp = hpCap(d);
    d.en = enCap(d);
  }
  return up;
}

// 레벨이 올라 받은 포인트를 능력치에 나눔. alloc: { claw: 1, scale: 2, ... }
// 비늘 1점당 최대 체력 +5, 지혜 1점당 최대 기력 +2 (만들 때와 같은 계산)
function spendStats(d, alloc) {
  const add = {};
  let sum = 0;
  for (const { key } of STATS) {
    const v = Number(alloc?.[key] ?? 0);
    if (!Number.isInteger(v) || v < 0) return { error: '포인트는 0 이상의 정수로 나눠야 한다.' };
    add[key] = v;
    sum += v;
  }
  if (!sum) return { error: '나눌 포인트를 하나 이상 골라야 한다.' };
  if (sum > (d.stat_pts || 0)) return { error: `포인트가 모자란다. (남은 포인트 ${d.stat_pts || 0})` };
  for (const { key } of STATS) d[key] += add[key];
  d.hp_max += add.scale * 5; d.hp += add.scale * 5;
  d.en_max += add.wisdom * 2; d.en += add.wisdom * 2;
  d.stat_pts -= sum;
  clampVitals(d);
  const what = STATS.filter((s) => add[s.key]).map((s) => `${s.name} +${add[s.key]}`).join(', ');
  return { title: '능력치', lines: [`${what}. 몸에 새로운 힘이 깃들었다.`] };
}

// ── 물건 뽑기 ──────────────────────────────────────
// bonus는 드문·귀한 물건이 나올 확률을 올림 (지혜, 원정 길이 등)
function rollItem(region, { uncommon = 0.15, rare = 0.02 } = {}) {
  const loot = REGION_LOOT[region];
  const r = Math.random();
  if (r < rare) return pick(loot.rare);
  if (r < rare + uncommon) return pick(loot.uncommon);
  return pick(loot.common);
}

// 같은 물건끼리 묶어서 [{ id, qty }]로
function bundle(ids) {
  const m = new Map();
  for (const id of ids) m.set(id, (m.get(id) || 0) + 1);
  return [...m].map(([id, qty]) => ({ id, qty }));
}

const itemLabel = ({ id, qty }) => `${ITEMS[id].name}${qty > 1 ? ` ${qty}개` : ''}`;

// ── 단발 행동 ──────────────────────────────────────
// 실패 이유가 있으면 { error }, 아니면 결과
const RESTING = '둥지에서 쉬는 중이다. 먼저 깨어나야 한다.';

function check(d, type) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  if (d.rest_at) return { error: RESTING };
  const cost = actionCost(d, type);
  if (d.ap < cost) return { error: `행동력이 모자란다. (${cost} 필요)` };
  return null;
}

function gather(d) {
  const err = check(d, 'gather');
  if (err) return err;
  spendAp(d, actionCost(d, 'gather'));
  const st = statsOf(d);

  const wx = weatherFx(d.region);
  const n = Math.random() < 0.35 + st.wisdom * 0.01 + traitMods(d).gatherExtra + wx.gatherExtra ? 2 : 1;
  const ids = [];
  for (let i = 0; i < n; i++) {
    const pl = placeLoot(d);
    ids.push(rollItem(d.region, { uncommon: 0.12 + st.wisdom * 0.006 + pl.uncommon, rare: Math.max(0, 0.01 + st.wisdom * 0.001 + pl.rare + wx.findRare) }));
  }
  if (d.region === FISHING.region) { // 해안: 갯바위 틈의 미끼와 소금
    if (Math.random() < FISHING.gatherBait) ids.push(...Array(randInt(1, 2)).fill('bait_shrimp'));
    if (Math.random() < FISHING.gatherSalt) ids.push('salt_crystal');
  }
  const items = bundle(ids);
  let xp = 3;
  xp = xpOf(d, xp);
  const levelUp = gainXp(d, xp);
  const what = items.map(itemLabel).join(', ');
  return {
    title: '채집',
    lines: [`${REGIONS[d.region].name}에서 ${what}${josa(what, '을', '를')} 모았다.`],
    items, gold: 0, xp, levelUp,
  };
}

function explore(d) {
  const err = check(d, 'explore');
  if (err) return err;
  spendAp(d, actionCost(d, 'explore'));
  const st = statsOf(d);
  if (d.stance === 'hermit') st.wisdom += SR.hermit.exploreWisdom; // 은둔: 숨은 것을 잘 찾음

  const lines = [pick((d.stance !== 'hostile' && SCENES_HUMAN[d.region]) || SCENES[d.region])]; // 마을에선 우호·은둔이면 사람 모습 장면
  let items = [];
  let gold = 0;
  const r = Math.random();
  const wx = weatherFx(d.region); // 계절과 날씨
  const find = traitMods(d).exploreFind + wx.exploreFind;
  if (r < 0.4 + find) {
    // 귀한 물건이 잘 나오는 탐사
    const pl = placeLoot(d);
    const id = rollItem(d.region, { uncommon: 0.4 + st.wisdom * 0.01 + pl.uncommon, rare: Math.max(0, 0.06 + st.wisdom * 0.003 + pl.rare + wx.findRare) });
    items = [{ id, qty: 1 }];
    lines.push(`${ITEMS[id].name}${josa(ITEMS[id].name, '을', '를')} 발견했다.`);
  } else if (r < 0.75 + find) {
    gold = Math.max(1, Math.round((randInt(4, 12) + Math.floor(st.majesty / 3)) * wx.exploreGold));
    lines.push(`누군가 흘리고 간 금화 ${gold}닢을 주웠다.`);
  } else {
    lines.push('특별한 것은 찾지 못했지만, 이곳 지리를 조금 더 알게 되었다.');
  }
  // 우호: 인간 마을 사람들이 선물을 건넴
  if (d.stance === 'friendly' && isTown(d.region) && Math.random() < SR.friendly.giftChance) {
    if (Math.random() < 0.5) {
      const g = randInt(10, 25);
      gold += g;
      lines.push(`마을 사람들이 반갑게 다가와 금화 ${g}닢을 건넸다.`);
    } else {
      const gifts = SHOPS[d.region].filter((id) => ITEMS[id].type === 'use');
      const id = pick(gifts);
      items = bundle([...items.flatMap((x) => Array(x.qty).fill(x.id)), id]);
      lines.push(`마을 사람이 ${ITEMS[id].name}${josa(ITEMS[id].name, '을', '를')} 선물로 건넸다.`);
    }
  }
  d.gold += gold;
  // 적대: 현상금이 걸려 있으면 야생에서 습격당할 수 있음
  if (!isTown(d.region)) {
    var a = ambush(d, SR.hostile.ambush.explore);
    if (a) lines.push(...a.lines);
  }
  let xp = 6;
  xp = xpOf(d, xp);
  const levelUp = gainXp(d, xp);
  // gold: 번 금화, goldLost·hpLost: 습격으로 잃은 것 (결과 창이 얻은 것·잃은 것을 따로 보여 줌)
  return { title: '탐사', lines, items, gold, goldLost: a?.lost || 0, hpLost: a?.dmg || 0, xp, levelUp };
}

// ── 원정 ───────────────────────────────────────────
// 원정의 목적·갈림길·지난 일지 (저장 공간에는 글자(JSON)로)
function expInfo(d) {
  if (typeof d.exp_info === 'string' || !d.exp_info) {
    try { d.exp_info = JSON.parse(d.exp_info || '{}'); } catch { d.exp_info = {}; }
  }
  return d.exp_info;
}
function startExpedition(d, minutes, goal = 'gather', now = Date.now()) {
  if (d.exp_end) return { error: '이미 원정을 떠나 있다.' };
  if (d.rest_at) return { error: RESTING };
  if (!RULES.expeditionMinutes.includes(minutes)) return { error: '고를 수 없는 원정 시간이다.' };
  const G = EXP_GOALS[goal];
  if (!G) return { error: '알 수 없는 원정 목적이다.' };
  if (G.wild && isTown(d.region)) return { error: '인간의 땅에서는 사냥 원정을 떠날 수 없다.' };
  d.exp_start = now;
  d.exp_end = now + minutes * 60 * 1000;
  d.exp_region = d.region;
  // 갈림길: 원정 중간쯤 한 번
  const forks = EXP_FORKS.filter((f) => !f.wild || !isTown(d.region));
  const at = Math.round(now + minutes * 60000 * rand(EXP_RULES.forkFrom, EXP_RULES.forkTo));
  d.exp_info = { goal, fork: { id: pick(forks).id, at, pick: null }, last: expInfo(d).last || null };
  return { ok: true };
}
// ── 원정의 시간표: 떠날 때 길 위에서 주울 것·만날 싸움·다칠 일을 미리 정해 둠 ──
// 팝업은 이 시간표를 보여 주고, 돌아오면 그 시각까지 일어난 일만 그대로 받음 (일찍 불러도 그때까지 주운 것만)
// 정해 두는 양은 예전 계산(돌아올 때 한꺼번에)과 같은 기댓값이 되도록 맞춤
function planExpedition(d, companions = 0) {
  const info = expInfo(d);
  const G = EXP_GOALS[info.goal] || EXP_GOALS.gather;
  const st = statsOf(d);
  const extra = bonusOf(d).expRare + (titleMods(d).expRare || 0);
  const hermit = d.stance === 'hermit';
  const planned = (d.exp_end - d.exp_start) / 60000;
  const region = d.exp_region || d.region;
  const hours = planned / 60;
  const ev = [];
  const at = () => Math.round(rand(0.03, 0.97) * planned * 60000); // 출발부터 몇 ms 뒤
  let rolls = Math.floor(planned / 10 * (1 + companions * KIN.companionBonus) * traitMods(d).expRolls * G.rolls);
  if (G.miss && rolls > 0 && Math.random() < G.miss) { rolls = Math.floor(rolls / 2); ev.push({ t: at(), k: 'miss' }); }
  for (let i = 0; i < rolls; i++) {
    ev.push({ t: at(), k: 'item', id: rollItem(region, {
      uncommon: (0.16 + hours * 0.03 + st.wisdom * 0.004 + (hermit ? SR.hermit.expUncommon : 0)) * G.uncommon,
      rare: (0.015 + hours * 0.012 + st.wisdom * 0.001 + extra + (hermit ? SR.hermit.expRare : 0)) * G.rare,
    }) });
  }
  // 싸움: 사냥 원정은 20분마다 사냥감을 만나 쓰러뜨림 (전리품). 다치는 만큼은 싸움에 나눠 담음
  const trophyN = Math.floor(planned / 20) * (G.trophy || 0);
  const huntable = (REGION_PLACES[region] || []).filter((id) => PLACES[id].level <= d.level + PLACE_RULES.tooHard);
  const cap = hpCap(d);
  const hurtAll = Math.max(0, (G.hurt || 0) * (planned / 30)) * cap; // 전체 원정에서 깎일 체력
  const fights = [];
  for (let i = 0; i < trophyN && huntable.length; i++) { const p = PLACES[pick(huntable)]; fights.push({ t: at(), k: 'fight', foe: p.creature, id: p.drop }); }
  if (hurtAll > 0) {
    if (!fights.length) for (let i = 0; i < Math.max(1, Math.round(planned / 40)); i++) fights.push({ t: at(), k: 'scrape' }); // 사냥이 아니면 길에서 다침
    const each = hurtAll / fights.length;
    for (const f of fights) f.hp = Math.max(1, Math.round(each * rand(0.6, 1.4)));
  }
  ev.push(...fights);
  // 쉬어 가는 원정(다치는 대신 회복)이면 회복도 나눠 담음
  if ((G.hurt || 0) < 0) { const n = Math.max(1, Math.round(planned / 30)); const each = Math.round((-G.hurt * (planned / 30) * cap) / n); for (let i = 0; i < n; i++) ev.push({ t: at(), k: 'heal', hp: each }); }
  ev.sort((a, b) => a.t - b.t);
  info.plan = ev;
  return ev;
}
// 화면에 보낼 시간표 (이름은 화면에서 붙임)
const planView = (d) => (expInfo(d).plan || null);

// 갈림길을 고름 (key: 'a'/'b'). auto: 돌아올 때까지 고르지 않아 저절로 고름
function resolveFork(d, key, auto = false) {
  const f = expInfo(d).fork;
  const F = EXP_FORKS.find((x) => x.id === f.id);
  const opt = F[key];
  const ok = opt.chance == null || Math.random() < opt.chance;
  f.pick = key;
  f.auto = auto;
  f.res = { ...(ok ? opt.ok : opt.bad), good: ok };
  return f.res;
}
// 성향에 맞는 쪽 (적대: 대담·거침, 은둔: 신중, 우호: 다정·신중)
function autoForkKey(d) {
  const f = expInfo(d).fork;
  const F = EXP_FORKS.find((x) => x.id === f.id);
  for (const tone of EXP_RULES.stanceTone[d.stance] || EXP_RULES.stanceTone.hermit) {
    for (const k of ['a', 'b']) if (F[k].tone === tone) return k;
  }
  return 'b';
}
function chooseFork(d, key, now = Date.now()) {
  if (!d.exp_end) return { error: '원정을 떠나 있지 않다.' };
  const f = expInfo(d).fork;
  if (!f || now < f.at) return { error: '아직 갈림길에 닿지 않았다.' };
  if (f.pick) return { error: '이미 길을 골랐다.' };
  if (key !== 'a' && key !== 'b') return { error: '고를 수 없는 길이다.' };
  const res = resolveFork(d, key);
  return { ok: true, lines: [res.text] };
}
// 화면에 보낼 갈림길 (닿았을 때만)
function forkView(d, now = Date.now()) {
  if (!d.exp_end) return null;
  const f = expInfo(d).fork;
  if (!f || now < f.at) return f ? { at: f.at } : null;
  const F = EXP_FORKS.find((x) => x.id === f.id);
  if (!F) return null;
  if (f.pick) return { at: f.at, text: F.text, picked: F[f.pick].label, outcome: f.res?.text || '', good: !!f.res?.good };
  return { at: f.at, text: F.text, options: ['a', 'b'].map((k) => ({ key: k, label: F[k].label, risky: F[k].chance != null })) };
}

// 도착했거나 일찍 불러들였을 때. 지난 시간만큼 보상
// companions: 함께 간 식구 수 (하나당 찾는 물건 +15%)
function finishExpedition(d, now = Date.now(), companions = 0) {
  if (!d.exp_end) return { error: '원정을 떠나 있지 않다.' };
  const st = statsOf(d);
  const extra = bonusOf(d).expRare + (titleMods(d).expRare || 0);
  const hermit = d.stance === 'hermit'; // 은둔: 홀로 깊은 곳을 누비는 데 익숙함
  const planned = (d.exp_end - d.exp_start) / 60000;
  const done = Math.max(0, Math.min(planned, (now - d.exp_start) / 60000));
  const early = done < planned;
  const region = d.exp_region || d.region;
  const where = REGIONS[region].name;

  const info = expInfo(d);
  const G = EXP_GOALS[info.goal] || EXP_GOALS.gather;
  // 갈림길에 닿았으면 (고르지 않았으면 성향대로 저절로)
  let fr = null, F = null;
  if (info.fork && now >= info.fork.at) {
    F = EXP_FORKS.find((x) => x.id === info.fork.id);
    if (F) { if (!info.fork.pick) resolveFork(d, autoForkKey(d), true); fr = info.fork.res; }
  }
  const journal = [G.open(where)];
  const lines = [];

  const plan = info.plan;
  const doneMs = done * 60000;
  const past = plan ? plan.filter((e) => e.t <= doneMs) : null; // 돌아오기 전까지 일어난 일
  let rolls, missed = false;
  const hours = planned / 60;
  const ids = [];
  if (past) {
    // 시간표대로: 주운 것과 싸워서 얻은 전리품 (갈림길에서 '더 많이 찾기'를 골랐으면 그만큼 더)
    const found = past.filter((e) => e.k === 'item');
    rolls = found.length;
    missed = past.some((e) => e.k === 'miss');
    for (const e of found) ids.push(e.id);
    const more = Math.floor(found.length * ((fr?.rolls || 1) - 1));
    for (let i = 0; i < more; i++) ids.push(rollItem(region, { uncommon: 0.25, rare: 0.03 + (fr?.rare || 0) }));
  } else {
    rolls = Math.floor(done / 10 * (1 + companions * KIN.companionBonus) * traitMods(d).expRolls * G.rolls * (fr?.rolls || 1));
    if (G.miss && rolls > 0 && Math.random() < G.miss) { rolls = Math.floor(rolls / 2); missed = true; }
    for (let i = 0; i < rolls; i++) {
      ids.push(rollItem(region, {
        uncommon: (0.16 + hours * 0.03 + st.wisdom * 0.004 + (hermit ? SR.hermit.expUncommon : 0)) * G.uncommon,
        rare: (0.015 + hours * 0.012 + st.wisdom * 0.001 + extra + (hermit ? SR.hermit.expRare : 0)) * G.rare + (fr?.rare || 0),
      }));
    }
  }
  // 갈림길에서 얻은 것
  for (let i = 0; i < (fr?.loot || 0); i++) ids.push(rollItem(region, { uncommon: 0.5, rare: 0.12 + (fr?.rare || 0) }));
  if (fr?.item) ids.push(fr.item);
  // 사냥 원정·갈림길의 사냥: 그 지역 장소의 전리품 (갈 수 있는 장소에서)
  const huntable = (REGION_PLACES[region] || []).filter((id) => PLACES[id].level <= d.level + PLACE_RULES.tooHard);
  const pastFights = past ? past.filter((e) => e.k === 'fight') : [];
  const trophyN = past ? pastFights.length + (fr?.trophy || 0) : Math.floor(done / 20) * (G.trophy || 0) + (fr?.trophy || 0);
  if (past) { for (const e of pastFights) ids.push(e.id); for (let i = 0; i < (fr?.trophy || 0) && huntable.length; i++) ids.push(PLACES[pick(huntable)].drop); }
  else for (let i = 0; i < trophyN && huntable.length; i++) ids.push(PLACES[pick(huntable)].drop);
  // 2시간 이상 원정을 끝까지 다녀오면: 별똥별 조각 (멸망한 대륙이면 잿빛 심장도)
  let longFind = null;
  const plannedMin = Math.round(planned);
  if (!early && plannedMin >= EXP_LONG.from) {
    const p = plannedMin >= 180 ? EXP_LONG.star[180] : EXP_LONG.star[120];
    if (Math.random() < p) { ids.push('star_fragment'); if (plannedMin >= 180 && Math.random() < EXP_LONG.second) ids.push('star_fragment'); longFind = 'star'; }
    if (isRuin(region) && Math.random() < EXP_LONG.ruinCore) { ids.push('ashen_core'); longFind = longFind || 'core'; }
  }
  const items = bundle(ids);
  let gold = Math.round((Math.round(done * rand(0.4, 0.8)) + (rolls ? Math.floor(st.majesty / 2) : 0)) * G.gold) + (fr?.gold || 0);
  let xp = Math.round(done * 0.8 * G.xp * (fr?.xp || 1));

  if (rolls === 0 && !ids.length) {
    journal.push('멀리 가지 못하고 금세 돌아왔다.');
  } else {
    const nScenes = Math.min(3, 1 + Math.floor(done / 60));
    const scenes = shuffle(SCENES[region]).slice(0, nScenes);
    journal.push(scenes[0]);
    if (F && fr) {
      journal.push(F.text);
      journal.push(`— ${F[info.fork.pick].label}${info.fork.auto ? ' (돌아오기 전에 고르지 않아, 몸이 가는 대로 했다)' : ''}.`);
      journal.push(fr.text);
    }
    journal.push(...scenes.slice(1));
    if (missed) journal.push('짚이는 곳을 몇 군데나 파헤쳤지만, 대부분 헛걸음이었다.');
    if (trophyN && huntable.length) journal.push('사냥감을 몰아 몇 마리를 쓰러뜨리고 전리품을 챙겼다.');
    const rare = items.find((it) => ITEMS[it.id].rarity === 'rare');
    if (rare) journal.push(`그리고 ${ITEMS[rare.id].name}${josa(ITEMS[rare.id].name, '을', '를')} 손에 넣었다.`);
    if (longFind === 'star') journal.push('먼 길 끝, 밤하늘에서 떨어진 별똥별 조각이 발밑에서 빛나고 있었다.');
    journal.push(early ? '부름을 받고 서둘러 돌아왔다.' : '긴 여정을 마치고 돌아왔다.');
  }

  // 몸과 마음에 남은 것
  const cap = hpCap(d);
  // 시간표가 있으면 실제로 다친 만큼(싸움·긁힘)과 쉬어 간 만큼
  const hurt = past
    ? (past.reduce((a, e) => a + (e.k === 'fight' || e.k === 'scrape' ? e.hp || 0 : e.k === 'heal' ? -(e.hp || 0) : 0), 0) / cap) + (fr?.hurt || 0)
    : (G.hurt || 0) * (done / 30) + (fr?.hurt || 0);
  if (hurt > 0) {
    const before = d.hp;
    d.hp = Math.max(1, Math.round(d.hp - cap * hurt));
    if (before - d.hp > 0) lines.push(`체력 −${before - d.hp}`);
  } else if (hurt < 0) {
    const before = d.hp;
    d.hp = Math.min(cap, Math.round(d.hp - cap * hurt));
    if (d.hp > before) lines.push(`체력 +${d.hp - before}`);
  }
  if (fr?.mind < 0) lines.push(...loseMind(d, -fr.mind));
  if (fr?.mind > 0 && !berserkOf(d)) { const b0 = d.mind ?? MIND.max; d.mind = Math.min(MIND.max, b0 + fr.mind); if (d.mind > b0) lines.push(`정신 +${d.mind - b0}`); }
  if (fr?.rep) { const town = nearestTown(region); addRep(d, town, fr.rep); lines.push(`${REGIONS[town].name} 평판 ${fr.rep > 0 ? '+' : ''}${fr.rep}`); }
  if (G.fame && !early && planned >= 120) { const f = addFame(d, G.fame); lines.push(f || `용족 명성 +${G.fame}`); }

  d.gold += gold;
  let robbed = null;
  if (rolls > 0 && !isTown(region)) {
    robbed = ambush(d, SR.hostile.ambush.expedition);
    if (robbed) journal.splice(journal.length - 1, 0, ...robbed.lines);
  }
  xp = xpOf(d, xp);
  const levelUp = gainXp(d, xp);
  d.exp_start = null;
  d.exp_end = null;
  d.exp_region = null;
  const title = `${G.name} 원정${early ? ' (일찍 돌아옴)' : ''}`;
  d.exp_info = { last: { title, region, goal: info.goal || 'gather', journal, at: now } };
  if (F && fr) chron(d, 'choice', `${where} ${title}의 갈림길에서 '${F[info.fork.pick].label}'${info.fork.auto ? ' (저절로)' : ''} — ${fr.good ? '잘 풀렸다' : '일이 꼬였다'}.`, now);
  return { title, journal, lines, items, gold, goldLost: robbed?.lost || 0, hpLost: robbed?.dmg || 0, xp, levelUp, minutes: Math.round(done) };
}

// ── 제작 ───────────────────────────────────────────
// 둥지의 대장장이가 있으면 기력이 30% 덜 듦
const craftEn = (d, r) => Math.ceil(r.en * (d.perks?.smith ? 0.7 : 1) * (titleMods(d).craftEn || 1) * (atForge(d) ? CRAFT.forge.en - FACILITY.list.forge.en * (forgeP(d) - 1) : 1) - 1e-9);
// ── 제작 확장: 걸작·강화·각인(장신구별 기록), 숨겨진 제작법, 공방 ──
// 전투 설정(combat JSON)에 { gear: { 아이템id: { plus, mw, elem } }, recipes: [찾아낸 제작법], orders: { day, done } }
const gearOf = (d) => {
  const c = combatJson(d);
  if (!c.gear || typeof c.gear !== 'object') c.gear = {};
  for (const g of Object.values(c.gear)) if (g && g.plus > CRAFT.enhance.length) g.plus = CRAFT.enhance.length; // 최대 강화가 줄었을 때 예전 기록을 맞춤
  return c.gear;
};
// 강화·각인은 같은 장신구 여러 개 가운데 '한 개'에만 붙음. at: 그 한 개가 어디 있는지 ('eq' 착용 중 / 'inv' 소지품)
// (예전 기록에는 at이 없음: 그 장신구를 차고 있으면 착용 중인 것으로 봄)
const gearAt = (d, id) => gearOf(d)[id]?.at || (Object.values(equipOf(d)).includes(id) ? 'eq' : 'inv');
const gearOn = (d, id) => { const g = gearOf(d)[id]; return g && gearAt(d, id) === 'eq' ? g : null; }; // 차고 있는 그 한 개가 강화된 것일 때만
const mainStat = (it) => Object.entries(it.bonus || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || null; // 가장 크게 올려 주는 능력치
const knownRecipes = (d) => { const c = combatJson(d); if (!Array.isArray(c.recipes)) c.recipes = []; return c.recipes; };
const recipeKnown = (d, r) => !r.hidden || knownRecipes(d).includes(r.out);
const atForge = (d) => !!d.nest && d.region === d.nest && !!facOf(d).forge;
const forgeP = (d) => (atForge(d) ? facPower(d, 'forge') : 0); // 공방의 힘 (일하는 식구가 있으면 더)
// 각인: 속성별 피해 배율 (착용한 장신구에 새긴 것만)
function engraveOf(d) {
  const m = {};
  for (const id of Object.values(equipOf(d))) { const e = gearOn(d, id)?.elem; if (e) m[e] = (m[e] || 1) * CRAFT.engrave.power; }
  return m;
}
// 대성공 확률 (focus: 불 조절 점수 0~1, 없으면 null)
function greatChance(d, focus = null) {
  const G = CRAFT.great;
  const count = traitsOf(d).counts?.craft || 0;
  let p = G.base + statsOf(d).wisdom * G.perWis + Math.min(G.countMax, count / G.perCount);
  if (atForge(d)) p += G.forge + FACILITY.list.forge.great * (forgeP(d) - 1);
  if (d.perks?.smith) p += G.smith;
  p += titleMods(d).craftGreat || 0;
  if (focus != null) for (const [at, add] of G.focus) if (focus >= at) { p += add; break; }
  return Math.min(G.cap, p);
}
// have(id): 지금 가진 개수를 알려주는 함수 (저장 공간에서 읽음). focus: 장신구를 만들 때 불 조절 점수
function craft(d, outId, have, focus = null) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  const r = RECIPES.find((x) => x.out === outId);
  if (!r || !recipeKnown(d, r)) return { error: '알 수 없는 제작법이다.' };
  const st = statsOf(d);
  if (st.wisdom < r.wis) return { error: `지혜가 ${r.wis} 이상이어야 만들 수 있다.` };
  const en = craftEn(d, r);
  if (d.en < en) return { error: `기력이 모자란다. (${en} 필요)` };
  for (const [id, n] of Object.entries(r.needs)) {
    if (have(id) < n) return { error: `${ITEMS[id].name}${josa(ITEMS[id].name, '이', '가')} 모자란다.` };
  }
  const it = ITEMS[r.out];
  const f = it.type === 'equip' && Number.isFinite(Number(focus)) ? Math.max(0, Math.min(1, Number(focus))) : null;
  const chance = greatChance(d, f);
  if (d.en >= enCap(d)) d.en_at = Date.now();
  d.en -= en;
  const items = Object.entries(r.needs).map(([id, n]) => ({ id, qty: -n }));
  const name = it.name;
  const lines = [];
  let qty = 1;
  let great = false;
  let madeId = r.out;
  if (f != null) lines.push(f >= 0.85 ? '불길을 완벽하게 다스렸다!' : f >= 0.55 ? '불길을 제법 잘 다스렸다.' : '불길이 조금 흔들렸다.');
  if (Math.random() < chance) {
    great = true;
    if (it.type === 'equip' && ITEMS[`${r.out}__mw`]) {
      madeId = `${r.out}__mw`; // 걸작은 따로 된 물건으로 (일반 장신구와 겹치지 않게)
      lines.push(`대성공! 손끝에서 빛이 일더니 ${name}${josa(name, '이', '가')} 걸작으로 태어났다. (${STATS.find((x) => x.key === mainStat(it))?.name || '능력치'} +1)`);
    } else {
      qty = 2;
      lines.push(`대성공! 재료를 아껴 ${name}${josa(name, '을', '를')} 하나 더 만들었다. (2개)`);
    }
    lines.push(...traitCount(d, 'masterwork'));
  } else lines.push(`${name}${josa(name, '을', '를')} 만들었다.`);
  items.push({ id: madeId, qty });
  traitCount(d, 'craft'); // 칭호: 제작 횟수
  let xp = 4 + Math.floor(r.en / 2) + (great ? 4 : 0);
  xp = xpOf(d, xp);
  const levelUp = gainXp(d, xp);
  return { title: great ? '제작 · 대성공' : '제작', lines, items, made: [{ id: madeId, qty }], gold: 0, xp, levelUp, great };
}
// 실험: 재료 2~3가지를 하나씩 넣어 섞어 봄. 숨겨진 제작법과 재료가 같으면 알게 됨
function experiment(d, ids, have) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  ids = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string' && ITEMS[x]))];
  if (ids.length < 2 || ids.length > 3) return { error: '재료를 2~3가지 골라야 한다.' };
  for (const id of ids) if (have(id) < 1) return { error: `${ITEMS[id].name}${josa(ITEMS[id].name, '이', '가')} 없다.` };
  const en = CRAFT.experiment.en;
  if (d.en < en) return { error: `기력이 모자란다. (${en} 필요)` };
  if (d.en >= enCap(d)) d.en_at = Date.now();
  d.en -= en;
  const items = ids.map((id) => ({ id, qty: -1 }));
  const key = (r) => Object.keys(r.needs).sort().join('|');
  const mine = ids.slice().sort().join('|');
  const hit = RECIPES.find((r) => key(r) === mine);
  const names = ids.map((x) => ITEMS[x].name).join(', ');
  const lines = [`${names}${josa(names, '을', '를')} 화로에 넣고 섞어 보았다.`];
  let found = null;
  if (hit && hit.hidden && !knownRecipes(d).includes(hit.out)) {
    knownRecipes(d).push(hit.out);
    found = hit.out;
    lines.push(`재료가 녹아 하나로 엉기더니 새로운 모양이 떠올랐다… '${ITEMS[hit.out].name}' 제작법을 알아냈다!`);
    lines.push(...(hooks.firstRecipe ? hooks.firstRecipe(d, hit.out) : []));
  } else if (hit) {
    lines.push(`이미 아는 제작법이다. ('${ITEMS[hit.out].name}')`);
  } else {
    const near = RECIPES.some((r) => r.hidden && !knownRecipes(d).includes(r.out) && Object.keys(r.needs).filter((x) => ids.includes(x)).length >= 2);
    lines.push(near ? '무언가 될 듯하다가 연기만 피어올랐다. 재료 하나가 다른 것 같다.' : '쉭 하는 소리와 함께 연기만 피어올랐다.');
  }
  return { title: '실험', lines, items, found };
}
// 바랜 제작서: 아직 모르는 숨겨진 제작법 하나를 알게 됨
function readRecipeScroll(d) {
  const left = RECIPES.filter((r) => r.hidden && !knownRecipes(d).includes(r.out));
  if (!left.length) return { error: '이미 모든 숨겨진 제작법을 알고 있다.' };
  const r = left[Math.floor(Math.random() * left.length)];
  knownRecipes(d).push(r.out);
  const need = Object.entries(r.needs).map(([id, n]) => `${ITEMS[id].name} ${n}`).join(', ');
  return { lines: [`바랜 글씨를 더듬어 읽었다. '${ITEMS[r.out].name}' 제작법이다! (${need})`, ...(hooks.firstRecipe ? hooks.firstRecipe(d, r.out) : [])], found: r.out };
}
// 가진 장신구 (착용한 것 + 소지품)
const ownsGear = (d, id, have) => Object.values(equipOf(d)).includes(id) || have(id) > 0;
// 장신구 강화: +1 → +3. 실패하면 재료·금화만 사라짐
function enhanceGear(d, id, have) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  const it = ITEMS[id];
  if (!it || it.type !== 'equip') return { error: '장신구만 강화할 수 있다.' };
  if (!ownsGear(d, id, have)) return { error: '가지고 있지 않은 장신구다.' };
  const g = gearOf(d);
  const lv = g[id]?.plus || 0;
  const step = CRAFT.enhance[lv];
  if (!step) return { error: `더는 강화할 수 없다. (+${CRAFT.enhance.length}이 끝)` };
  if (d.gold < step.gold) return { error: `금화가 모자란다. (${step.gold}닢 필요)` };
  for (const [x, n] of Object.entries(step.items)) if (have(x) < n) return { error: `${ITEMS[x].name}${josa(ITEMS[x].name, '이', '가')} 모자란다. (${n}개 필요)` };
  d.gold -= step.gold;
  const items = Object.entries(step.items).map(([x, n]) => ({ id: x, qty: -n }));
  const rate = Math.min(1, step.rate + (atForge(d) ? CRAFT.forgeRate * (1 + FACILITY.list.forge.rate * (forgeP(d) - 1)) : 0));
  const lines = [];
  if (Math.random() < rate) {
    g[id] = { ...(g[id] || {}), plus: lv + 1, at: gearAt(d, id) }; // 강화된 한 개 (없었으면 차고 있는 것, 아니면 소지품의 하나)
    lines.push(`망치 소리가 울려 퍼졌다. ${it.name}${josa(it.name, '이', '가')} +${lv + 1}로 강화되었다! (${STATS.find((x) => x.key === mainStat(it))?.name || '능력치'} +1)`);
    if (lv + 1 === CRAFT.enhance.length) chron(d, 'mark', `${it.name}${josa(it.name, '을', '를')} +${lv + 1}까지 강화했다.`);
  } else {
    lines.push(`불꽃이 튀며 금이 갔던 룬이 사라졌다. 강화에 실패했다. (${it.name}${josa(it.name, '은', '는')} +${lv} 그대로)`);
  }
  return { title: '강화', lines, items, gold: -step.gold };
}
// 속성 각인: 그 속성 공격 피해 +12%. 이미 새겼으면 바꿔 새김
function engraveGear(d, id, elem, have) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  const it = ITEMS[id];
  if (!it || it.type !== 'equip') return { error: '장신구에만 새길 수 있다.' };
  if (!ownsGear(d, id, have)) return { error: '가지고 있지 않은 장신구다.' };
  const need = CRAFT.engrave.items[elem];
  if (!need) return { error: '그런 속성은 없다.' };
  const g = gearOf(d);
  if (g[id]?.elem === elem) return { error: '이미 그 속성이 새겨져 있다.' };
  if (d.gold < CRAFT.engrave.gold) return { error: `금화가 모자란다. (${CRAFT.engrave.gold}닢 필요)` };
  for (const [x, n] of Object.entries(need)) if (have(x) < n) return { error: `${ITEMS[x].name}${josa(ITEMS[x].name, '이', '가')} 모자란다. (${n}개 필요)` };
  d.gold -= CRAFT.engrave.gold;
  const old = g[id]?.elem;
  g[id] = { ...(g[id] || {}), elem, at: gearAt(d, id) };
  const items = Object.entries(need).map(([x, n]) => ({ id: x, qty: -n }));
  return { title: '각인', lines: [`${it.name}에 ${ELEMENTS[elem]} 룬을 새겼다.${old ? ` (먼저 있던 ${ELEMENTS[old]} 룬은 지워졌다)` : ''}`, `착용하면 ${ELEMENTS[elem]} 공격 피해 +${Math.round((CRAFT.engrave.power - 1) * 100)}%`], items, gold: -CRAFT.engrave.gold };
}
// 장신구를 모두 잃으면 기록도 지움 (팔거나 버리거나 줬을 때)
// 같은 것이 여러 개면 보통 것부터 나가고, 강화된 한 개는 마지막까지 남음 (소지품에서 다 나가면 그때 지움)
function tidyGear(d, have) {
  const g = gearOf(d), worn = Object.values(equipOf(d));
  for (const id of Object.keys(g)) {
    const at = gearAt(d, id);
    if (at === 'eq' && !worn.includes(id)) { if (have(id) > 0) g[id].at = 'inv'; else delete g[id]; }
    else if (at === 'inv' && have(id) < 1) delete g[id];
    else if (!g[id].at) g[id].at = at;
  }
}
// ── 마을 제작 의뢰: 마을마다 하루 3개 (날마다 바뀜, 모두에게 같음) ──
const dayIdx = (now = Date.now()) => Math.floor((now + 9 * 3600000) / 86400000); // 한국 날짜
// 의뢰에서 빼는 재료: 멸망한 대륙에서만 나오는 것(그 지역 채집표에만 있는 것) + 이벤트로만 얻는 것
// (멸망한 대륙에 가 보지 못한 드래곤에게 그 재료가 드는 물건을 의뢰하면 너무 어려움)
const ORDER_SKIP = (() => {
  const inRuin = new Set(), inOther = new Set();
  for (const [r, t] of Object.entries(REGION_LOOT)) for (const arr of Object.values(t)) for (const id of arr) (r.startsWith('ruin_') ? inRuin : inOther).add(id);
  return new Set([...[...inRuin].filter((id) => !inOther.has(id)), 'rival_scale']);
})();
// 의뢰 물건 대신 낼 수 있는 더 좋은 것: 장신구는 걸작, 요리는 정성 들인 것 (보상 CRAFT.orders.bonus배)
const ORDER_ALT = (() => {
  const m = {};
  for (const [id, it] of Object.entries(ITEMS)) { if (it.mwOf) m[it.mwOf] = id; if (it.cooked) m[it.cooked] = id; }
  return m;
})();
function ordersOf(town, now = Date.now()) {
  const pool = RECIPES.filter((r) => !r.hidden && r.wis <= CRAFT.orders.maxWis && ['use', 'equip'].includes(ITEMS[r.out].type) && !ITEMS[r.out].use?.nestWard
    && !Object.keys(r.needs).some((id) => ORDER_SKIP.has(id))).map((r) => r.out);
  let seed = dayIdx(now) * 9973 + [...town].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const out = [];
  const used = new Set();
  while (out.length < CRAFT.orders.perTown && used.size < pool.length) {
    const id = pool[Math.floor(rnd() * pool.length)];
    if (used.has(id)) continue;
    used.add(id);
    const qty = ITEMS[id].type === 'equip' ? 1 : 1 + Math.floor(rnd() * 3);
    out.push({ key: `${town}:${id}`, id, qty, gold: Math.round((ITEMS[id].value || 10) * qty * CRAFT.orders.gold), rep: CRAFT.orders.rep, alt: ORDER_ALT[id] || null, bonus: CRAFT.orders.bonus || 1 });
  }
  return out;
}
function ordersView(d, now = Date.now()) {
  const town = d.region;
  if (!SHOPS[town]) return null;
  const c = combatJson(d);
  const done = c.orders?.day === dayIdx(now) ? c.orders.done || [] : [];
  return { town, list: ordersOf(town, now).map((o) => ({ ...o, done: done.includes(o.key) })), resetAt: (dayIdx(now) + 1) * 86400000 - 9 * 3600000 };
}
// 납품할 것을 플레이어가 고름: 보통 물건으로만, 또는 alt(걸작·정성 들인 것)를 먼저 쓰고 모자란 몫만 보통 물건으로 (alt 몫은 보상을 더 받음)
function orderPay(o, nAlt) {
  const per = o.gold / o.qty;
  return Math.round(per * (o.qty - nAlt) + per * nAlt * (o.bonus || 1));
}
function fillOrder(d, key, have, now = Date.now(), useAlt = false) {
  const err = marketCheck(d);
  if (err) return err;
  const o = ordersOf(d.region, now).find((x) => x.key === key);
  if (!o) return { error: '그 의뢰는 이미 내려갔다.' };
  const c = combatJson(d);
  if (c.orders?.day !== dayIdx(now)) c.orders = { day: dayIdx(now), done: [] };
  if (c.orders.done.includes(key)) return { error: '오늘은 이미 이 의뢰를 마쳤다.' };
  const nAlt = useAlt && o.alt ? Math.min(have(o.alt), o.qty) : 0;
  const n = o.qty - nAlt;
  if (useAlt && !nAlt) return { error: `${ITEMS[o.alt || o.id].name}${josa(ITEMS[o.alt || o.id].name, '이', '가')} 없다.` };
  if (have(o.id) < n) return { error: nAlt ? `모자란 몫을 채울 ${ITEMS[o.id].name}${josa(ITEMS[o.id].name, '이', '가')} ${n}개 더 있어야 한다.` : `${ITEMS[o.id].name} ${o.qty}개가 있어야 한다.` };
  c.orders.done.push(key);
  const gold = orderPay(o, nAlt);
  d.gold += gold;
  addRep(d, d.region, o.rep);
  const items = [];
  if (n) items.push({ id: o.id, qty: -n });
  if (nAlt) items.push({ id: o.alt, qty: -nAlt });
  const altPart = `${ITEMS[o.alt]?.name || ''}${nAlt > 1 ? ` ${nAlt}개` : ''}`;
  const what = nAlt ? `${altPart}${n ? `${josa(nAlt > 1 ? '개' : altPart, '과', '와')} ${ITEMS[o.id].name}${n > 1 ? ` ${n}개` : ''}` : ''}` : `${ITEMS[o.id].name}${o.qty > 1 ? ` ${o.qty}개` : ''}`;
  const lines = [`${what}${josa(what.endsWith('개') ? '개' : what, '을', '를')} 건네자 의뢰인이 활짝 웃었다.`];
  if (nAlt) lines.push(ITEMS[o.alt].mwOf ? '솜씨에 감탄한 의뢰인이 웃돈을 얹어 주었다.' : '정성이 듬뿍 담긴 것을 알아본 의뢰인이 웃돈을 얹어 주었다.');
  lines.push(`금화 ${gold}닢, ${REGIONS[d.region].name} 평판 +${o.rep}`);
  return { title: '의뢰', lines, items, gold };
}
// ── 둥지 공방(화로) ──
function buildForge(d, have) {
  if (!d.nest || d.region !== d.nest) return { error: '공방은 둥지에 있을 때만 지을 수 있다.' };
  const n = nestInfo(d);
  if (n.forge) return { error: '이미 공방이 있다.' };
  const c = CRAFT.forge.cost;
  if (d.gold < c.gold) return { error: `금화가 모자란다. (${c.gold}닢 필요)` };
  for (const [x, k] of Object.entries(c.items)) if (have(x) < k) return { error: `${ITEMS[x].name}${josa(ITEMS[x].name, '이', '가')} 모자란다. (${k}개 필요)` };
  d.gold -= c.gold;
  n.forge = true;
  chron(d, 'mark', '둥지에 공방(화로)을 지었다.');
  return { title: '공방', lines: ['둥지 안쪽에 돌을 쌓아 화로를 지었다. 불길이 낮게 으르렁거린다.', `둥지에서 만들면 기력 −${Math.round((1 - CRAFT.forge.en) * 100)}%, 대성공 +${Math.round(CRAFT.great.forge * 100)}%, 강화 성공 +${Math.round(CRAFT.forgeRate * 100)}%`], items: Object.entries(c.items).map(([x, k]) => ({ id: x, qty: -k })), gold: -c.gold };
}
// 화면에 보낼 제작 정보
function craftView(d) {
  return {
    known: knownRecipes(d).slice(),
    needs: Object.fromEntries(knownRecipes(d).map((o) => [o, RECIPES.find((r) => r.out === o)?.needs || {}])), // 찾아낸 숨겨진 제작법의 재료
    hiddenLeft: RECIPES.filter((r) => r.hidden && !knownRecipes(d).includes(r.out)).length,
    great: Math.round(greatChance(d) * 1000) / 10,
    forge: atForge(d), hasForge: !!(d.nest && nestInfo(d).forge),
    gear: Object.fromEntries(Object.entries(gearOf(d)).map(([id, g]) => [id, { ...g, at: gearAt(d, id) }])), // at: 강화된 한 개가 어디 있는지
  };
}

// ── 강화 음식 ──────────────────────────────────────
// 전투 설정(combat JSON)에 { buff: { id, until } }로 저장. 한 번에 하나만 효과가 있음
function combatJson(d) {
  if (typeof d.combat === 'string' || !d.combat) {
    try { d.combat = JSON.parse(d.combat || '{}'); } catch { d.combat = {}; }
  }
  return d.combat;
}
// 강화 효과를 줌 (이벤트 등에서)
function giveBuff(d, id, minutes, now = Date.now()) {
  if (!BUFFS[id]) return;
  combatJson(d).buff = { id, until: now + minutes * 60000 };
}
function buffOf(d, now = Date.now()) {
  const b = combatJson(d).buff;
  if (!b || !BUFFS[b.id] || b.until <= now) return null;
  return { id: b.id, until: b.until, ...BUFFS[b.id] };
}

// ── 회복약 사용 ────────────────────────────────────
// opts.keep: 보물 상자에 넣기를 고름 (꽃다발처럼 쓸 수도, 간직할 수도 있는 물건), opts.from: 받은 선물이면 보낸 이 이름 (상자에 함께 남김), opts.msg: 그때의 쪽지
function useItem(d, id, have, opts = {}) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  const it = ITEMS[id];
  if (!it || it.type !== 'use') return { error: '쓸 수 없는 물건이다.' };
  if (have(id) < 1) return { error: '가지고 있지 않다.' };
  const u = it.use;
  const lines = [];
  // 지하 회랑 안에서는 회복 아이템을 쓸 수 없다. 상처는 화톳불에서만 돌본다 (maze.js heal)
  const mzs = combatJson(d).maze;
  const inMaze = !!mzs && typeof mzs === 'object' && mzs.fi != null;
  const heals = u.hp != null || u.en != null || u.ap != null || u.mind != null;
  if (inMaze && heals && !u.crown && !(u.keep && (opts.keep || !u.mind))) return { error: '지하 회랑 안에서는 회복 아이템을 쓸 수 없다. 화톳불 자리에서 상처를 돌보자.' };
  if (u.keep && (opts.keep || !u.mind)) { // 보물 상자에 넣고 잠금 (꺼낼 수 없음). 꽃다발은 '상자에 넣기'를 고를 때만, 아니면 아래에서 정신 회복
    if (!d.nest) return { error: '둥지를 틀어야 보물 상자에 간직할 수 있다.' };
    if (d.region !== d.nest) return { error: '보물 상자는 둥지에 있을 때만 열 수 있다.' };
    chestAdd(d, u.keep, opts.from || '', opts.msg || '');
    const label = chestLabel({ k: u.keep, n: opts.from || '' });
    lines.push(`${label}${josa(label, '을', '를')} 보물 상자에 넣고 잠갔다.`);
    if (opts.msg) lines.push(`함께 받은 쪽지도 접어 넣었다. "${opts.msg}"`);
    return { title: '보물 상자', lines, items: [{ id, qty: -1 }] };
  }
  if (u.crown) { // 화관: 하루 동안 이름 옆에 꽃
    const c = combatJson(d);
    const wasOn = crownOn(d);
    c.crownUntil = Date.now() + u.crown * 60000;
    lines.push(wasOn ? `시든 화관을 내려놓고 새 ${it.name}${josa(it.name, '을', '를')} 머리에 얹었다.` : `${it.name}${josa(it.name, '을', '를')} 머리에 얹었다. 하루 동안 이름 옆에 작은 꽃이 핀다.`);
    if (u.mind && !inMaze && !berserkOf(d) && (d.mind ?? MIND.max) < MIND.max) { // 회랑 안에서는 화관을 써도 정신은 회복되지 않음
      const before = d.mind ?? MIND.max;
      d.mind = Math.min(MIND.max, before + u.mind);
      lines.push(`꽃향기에 정신이 ${d.mind - before} 맑아졌다.`);
    }
    return { title: it.name, lines, items: [{ id, qty: -1 }] };
  }
  if (u.nestWard) {
    if (!d.nest || d.region !== d.nest) return { error: '둥지에 있을 때만 설치할 수 있다.' };
    const w = nestInfo(d).wards;
    if ((w[u.nestWard] || 0) >= NEST.wardMax) return { error: `${it.name}${josa(it.name, '은', '는')} 이미 ${NEST.wardMax}개 설치해 두었다.` };
    w[u.nestWard] = (w[u.nestWard] || 0) + 1;
    lines.push(u.nestWard === 'trap' ? '둥지 입구 바위틈에 가시 덫을 숨겨 두었다.' : '둥지 둘레에 결계석을 묻자, 룬이 희미하게 빛나기 시작했다.');
    lines.push(`설치한 ${it.name}: ${w[u.nestWard]}/${NEST.wardMax}`);
    return { title: it.name, lines, items: [{ id, qty: -1 }] };
  }
  if (u.scar) { // 옛 샘의 정수: 가장 최근 상흔 하나를 씻어 냄, 30일에 한 번
    let sc = d.scars;
    if (typeof sc === 'string') { try { sc = JSON.parse(sc || '[]'); } catch { sc = []; } }
    sc = Array.isArray(sc) ? sc : [];
    if (!sc.length) return { error: '씻어 낼 상흔이 없다.' };
    const c = combatJson(d), wait = 30 * 86400000, left = (c.scarHealAt || 0) + wait - Date.now();
    if (left > 0) return { error: `몸이 아직 지난 정수를 받아들이는 중이다. ${Math.ceil(left / 86400000)}일 뒤에 다시 마실 수 있다.` };
    const key = sc.pop();
    const st = STATS.find((s) => s.key === key);
    d[key] = (d[key] || 0) + 1;
    if (key === 'scale') d.hp_max += 5;   // 상흔을 입을 때 깎인 만큼 되돌림 (death.js revive)
    if (key === 'wisdom') d.en_max += 2;
    d.scars = sc;
    c.scarHealAt = Date.now();
    chron(d, 'mark', `옛 샘의 정수로 ${st ? st.name : key}의 상흔을 씻어 냈다.`);
    lines.push(`차가운 물이 목을 타고 내려가자 ${st ? st.name : key}의 상흔이 희미해지더니 사라졌다. (${st ? st.name : key} +1)`, sc.length ? `남은 상흔 ${sc.length}개.` : '이제 몸에 상흔이 하나도 없다.', '다음 정수는 30일 뒤에 받아들일 수 있다.');
    return { title: it.name, lines, items: [{ id, qty: -1 }] };
  }
  if (u.recipe) {
    const r = readRecipeScroll(d);
    if (r.error) return r;
    return { title: it.name, lines: r.lines, items: [{ id, qty: -1 }] };
  }
  if (u.buff) {
    const B = BUFFS[u.buff];
    const old = buffOf(d);
    const mins = u.minutes || BUFFS.minutes; // 부엌에서 아이가 만든 것은 더 오래감
    combatJson(d).buff = { id: u.buff, until: Date.now() + mins * 60000 };
    lines.push(`${mins}분 동안 ${B.name} 상태가 된다. (사냥·강적 전투에서 ${B.desc})`);
    if (old && old.id !== u.buff) lines.push(`먼저 있던 ${old.name}의 효과는 사라졌다.`);
    if (u.mindCost) lines.push(...loseMind(d, u.mindCost)); // 광기의 묘약: 정신이 깎임
    return { title: it.name, lines, items: [{ id, qty: -1 }] };
  }
  // 여러 효과가 있는 물건은 하나라도 쓸모가 있으면 씀
  const full = (u.hp == null || d.hp >= hpCap(d)) && (u.en == null || d.en >= enCap(d)) && (u.ap == null || d.ap >= apCap(d));
  const multi = ['hp', 'en', 'ap'].filter((k) => u[k]).length > 1;
  if (multi && full) return { error: '이미 기운이 넘친다.' };
  if (u.hp && !(multi && d.hp >= hpCap(d))) {
    if (d.hp >= hpCap(d)) return { error: '체력이 이미 가득 차 있다.' };
    const before = d.hp;
    d.hp = Math.min(hpCap(d), d.hp + u.hp);
    lines.push(`체력이 ${d.hp - before} 회복되었다.`);
  }
  if (u.en && !(multi && d.en >= enCap(d))) {
    if (d.en >= enCap(d)) return { error: '기력이 이미 가득 차 있다.' };
    const before = d.en;
    d.en = Math.min(enCap(d), d.en + u.en);
    lines.push(`기력이 ${d.en - before} 회복되었다.`);
  }
  if (u.mind) {
    if (berserkOf(d)) return { error: '광폭화한 몸은 무엇도 받아들이지 않는다.' };
    if ((d.mind ?? MIND.max) >= MIND.max) return { error: '정신이 이미 맑다.' };
    const before = d.mind;
    d.mind = Math.min(MIND.max, d.mind + u.mind);
    lines.push(`정신이 ${d.mind - before} 맑아졌다.`);
  }
  if (u.ap && !(multi && d.ap >= apCap(d))) {
    if (d.ap >= apCap(d)) return { error: '행동력이 이미 가득 차 있다.' };
    const before = d.ap;
    d.ap = Math.min(apCap(d), d.ap + u.ap);
    if (d.ap >= apCap(d)) d.ap_at = Date.now();
    lines.push(`행동력이 ${d.ap - before} 회복되었다.`);
  }
  return { title: it.name, lines, items: [{ id, qty: -1 }] };
}

// ── 장신구 착용 ────────────────────────────────────
function equip(d, id, have, plain = false) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  const it = ITEMS[id];
  if (!it || it.type !== 'equip') return { error: '착용할 수 없는 물건이다.' };
  if (have(id) < 1) return { error: '가지고 있지 않다.' };
  const eq = equipOf(d), g = gearOf(d);
  const prev = eq[it.slot];
  const prevAt = prev && g[prev] ? gearAt(d, prev) : null;
  if (prev && prev !== id && prevAt === 'eq') g[prev].at = 'inv'; // 벗은 것이 강화된 한 개였으면 소지품으로
  if (g[id] && gearAt(d, id) === 'inv') {
    // 소지품에 강화된 한 개가 있음: 보통 것을 고르지 않았다면 그것을 참 (보통 것은 강화된 것 말고도 하나 더 있어야 고를 수 있음)
    if (!(plain && have(id) >= 2)) g[id].at = 'eq';
  } else if (g[id] && prev === id && prevAt === 'eq' && plain) g[id].at = 'inv'; // 같은 것을 보통 것으로 바꿔 참
  const items = [{ id, qty: -1 }];
  if (eq[it.slot]) items.push({ id: eq[it.slot], qty: 1 }); // 원래 차고 있던 것은 소지품으로
  eq[it.slot] = id;
  clampVitals(d);
  return { ok: true, items };
}

function unequip(d, slot) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  if (!SLOTS.some((x) => x.key === slot)) return { error: '없는 자리다.' };
  const eq = equipOf(d);
  if (!eq[slot]) return { error: '비어 있는 자리다.' };
  const items = [{ id: eq[slot], qty: 1 }];
  const g = gearOf(d);
  if (g[eq[slot]] && gearAt(d, eq[slot]) === 'eq') g[eq[slot]].at = 'inv'; // 강화된 한 개가 소지품으로
  delete eq[slot];
  clampVitals(d);
  return { ok: true, items };
}

// ── 인간 마을: 평판 ────────────────────────────────
function repOf(d) {
  if (typeof d.rep === 'string') {
    try { d.rep = JSON.parse(d.rep || '{}'); } catch { d.rep = {}; }
  }
  if (!d.rep) d.rep = {};
  return d.rep;
}
function addRep(d, region, n) {
  const r = repOf(d);
  if (n > 0) n = Math.max(1, Math.round(n * traitMods(d).repGain)); // 특성: 악명
  r[region] = Math.max(-100, Math.min(100, (r[region] || 0) + n));
  return r[region];
}

// ── 성향 바꾸기 ────────────────────────────────────
function setStance(d, stance, now = Date.now()) {
  if (!STANCES[stance]) return { error: '알 수 없는 성향이다.' };
  if (d.stance === stance) return { error: '이미 그 성향이다.' };
  const left = (d.stance_at || 0) + TRADE.stanceCooldown - now;
  if (left > 0) return { error: `성향은 ${Math.ceil(left / 60000)}분 뒤에 다시 바꿀 수 있다.` };
  d.stance = stance;
  d.stance_at = now;
  const lines = [{
    friendly: '인간과 어울려 살기로 마음먹었다.',
    hermit: '인간의 눈을 피해 조용히 살기로 했다.',
    hostile: '인간에게 발톱을 드러내기로 했다.',
  }[stance]];
  // 배신: 적대로 돌아서면 사이가 좋던 마을이 모두 원수가 됨
  if (stance === 'hostile') {
    const r = repOf(d);
    const betrayed = Object.keys(SHOPS).filter((id) => (r[id] || 0) >= SR.friendly.specialFrom);
    for (const id of betrayed) r[id] = SR.friendly.betrayRep;
    if (betrayed.length) {
      const names = betrayed.map((id) => REGIONS[id].name).join('과 ');
      lines.push(`믿었던 드래곤에게 배신당한 ${names}${josa(names, '이', '가')} 등을 돌렸다. 이제 원수다.`);
    }
  }
  return { title: '성향', lines };
}

// ── 시장 ───────────────────────────────────────────
// 성향과 평판에 따라 사고파는 값이 달라짐
//   우호: 평판이 높을수록 잘 쳐줌, 거래할 때마다 평판 +1
//   은둔: 사람 모습으로 섞여 거래. 값은 조금 손해, 평판은 그대로
//   적대: 상인이 거래하지 않음 (대신 위협하기)
function priceRates(d, region) {
  const rep = repOf(d)[region] || 0;
  if (d.stance === 'hermit' || d.stance === 'hostile') return { sell: SR.hermit.sell, buy: SR.hermit.buy }; // 적대는 둥지 사람이 대신 흥정할 때만
  const f = SR.friendly;
  if (rep < 0) return { sell: f.sell.base * (1 + rep / 250), buy: 1 - rep / 400 };
  const k = Math.min(rep, 60) / 60; // '신뢰'(60)에서 최고
  return { sell: f.sell.base + (f.sell.best - f.sell.base) * k, buy: 1 - f.buyDiscount * k };
}
// 우호 전용 상품을 살 수 있는지
const specialOpen = (d) => d.stance === 'friendly' && (repOf(d)[d.region] || 0) >= SR.friendly.specialFrom;
function marketCheck(d) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  if (d.rest_at) return { error: RESTING };
  const shop = SHOPS[d.region];
  if (!shop) return { error: '이곳에는 시장이 없다.' };
  if (d.stance === 'hostile' && !d.perks?.trader) return { error: '상인들이 드래곤을 보자마자 가게 문을 닫았다.' };
  const rep = repOf(d)[d.region] || 0;
  if (d.stance === 'friendly' && rep < TRADE.refuseBelow) return { error: '상인들이 아직 지난 일을 잊지 않았다. 거래를 거절한다.' };
  return null;
}
const sellPrice = (d, id) => Math.max(1, Math.floor(ITEMS[id].value * priceRates(d, d.region).sell * traitMods(d).sell));
const buyPrice = (d, id) => Math.ceil(ITEMS[id].value * priceRates(d, d.region).buy * traitMods(d).buy);

// 시장 정보: 파는 물건과 값, 내 물건을 팔 때 값
function marketInfo(d, invList) {
  const shop = SHOPS[d.region];
  if (!shop) return { error: '이곳에는 시장이 없다.' };
  const rep = repOf(d)[d.region] || 0;
  const closed = marketCheck(d);
  return {
    region: d.region,
    stance: d.stance,
    rep, repName: repTier(rep),
    repBar: (() => { // 평판 막대: 지금 단계의 시작부터 다음 단계까지
      const T = [...REP_TIERS].sort((a, b) => a.min - b.min);
      const i = T.reduce((k, t, j) => (rep >= t.min ? j : k), 0);
      const nx = T[i + 1];
      return { from: T[i].min, to: nx ? nx.min : 100, next: nx ? nx.name : null };
    })(),
    closed: closed ? closed.error : null,
    proxy: d.stance === 'hostile' ? d.perks?.trader || null : null, // 대신 흥정하는 둥지 사람
    buy: shop.map((id) => ({ id, price: buyPrice(d, id), limit: TRADE.dailyBuy[id] || null, left: buyLeft(d, id) })),
    // 우호일 때만 보임. 평판이 모자라면 잠겨 있음
    special: d.stance === 'friendly'
      ? (SHOPS_SPECIAL[d.region] || []).map((id) => ({ id, price: buyPrice(d, id), locked: !specialOpen(d), limit: TRADE.dailyBuy[id] || null, left: buyLeft(d, id) }))
      : [],
    specialFrom: repTier(SR.friendly.specialFrom),
    sell: invList.filter((x) => ITEMS[x.item] && ITEMS[x.item].cat !== 'treasure').map((x) => ({ id: x.item, qty: x.qty, price: sellPrice(d, x.item) })),
  };
}

// 우호 드래곤이 거래하면 마을 평판은 오르고 용족 명성은 깎임
function friendlyTrade(d, lines) {
  if (d.stance !== 'friendly') return;
  addRep(d, d.region, 1);
  const f = addFame(d, SR.friendly.fameOnTrade);
  if (f) lines.push(f);
}

// 오늘 시장에서 산 개수 (전투 설정 JSON의 buys에 { day, n: { 물건: 개수 } }, 날이 바뀌면 비움)
function buyBook(d) {
  const c = combatJson(d);
  const day = dayIdx();
  if (!c.buys || c.buys.day !== day) c.buys = { day, n: {} };
  return c.buys;
}
const buyLeft = (d, id) => (TRADE.dailyBuy[id] ? Math.max(0, TRADE.dailyBuy[id] - (buyBook(d).n[id] || 0)) : null);

function buy(d, id, qty, have) {
  const err = marketCheck(d);
  if (err) return err;
  const special = (SHOPS_SPECIAL[d.region] || []).includes(id);
  if (!SHOPS[d.region].includes(id) && !special) return { error: '이 시장에서는 팔지 않는 물건이다.' };
  if (special && !specialOpen(d)) return { error: '이 물건은 마을과 더 친해져야 살 수 있다.' };
  qty = Math.max(1, Math.min(20, Math.floor(qty) || 1));
  const left = buyLeft(d, id);
  const name0 = ITEMS[id].name;
  if (left === 0) return { error: `${name0}${josa(name0, '은', '는')} 오늘 더 살 수 없다. (하루 ${TRADE.dailyBuy[id]}개까지)` };
  if (left != null && qty > left) return { error: `${name0}${josa(name0, '은', '는')} 오늘 ${left}개까지만 더 살 수 있다.` };
  const cost = buyPrice(d, id) * qty;
  if (d.gold < cost) return { error: `금화가 모자란다. (${cost}닢 필요)` };
  d.gold -= cost;
  if (left != null) { const b = buyBook(d); b.n[id] = (b.n[id] || 0) + qty; }
  const name = ITEMS[id].name;
  const lines = [`금화 ${cost}닢을 내고 ${name}${qty > 1 ? ` ${qty}개` : ''}${josa(qty > 1 ? '개' : name, '을', '를')} 샀다.`];
  friendlyTrade(d, lines);
  return { title: '시장', lines, items: [{ id, qty }] };
}

function sell(d, id, qty, have) {
  const err = marketCheck(d);
  if (err) return err;
  if (!ITEMS[id]) return { error: '알 수 없는 물건이다.' };
  if (ITEMS[id].cat === 'treasure') return { error: '보물은 팔 수 없다. 둥지의 보물더미에 쌓아 두자.' };
  const n = have(id);
  qty = Math.max(1, Math.min(n, Math.floor(qty) || 1));
  if (n < 1) return { error: '가지고 있지 않다.' };
  const gain = sellPrice(d, id) * qty;
  d.gold += gain;
  const name = ITEMS[id].name;
  const lines = [`${name}${qty > 1 ? ` ${qty}개` : ''}${josa(qty > 1 ? '개' : name, '을', '를')} 팔고 금화 ${gain}닢을 받았다.`];
  friendlyTrade(d, lines);
  return { title: '시장', lines, items: [{ id, qty: -qty }] };
}

// ── 낚시 (해안 절벽에서만, 미끼 하나로 한 번) ──────
const FG = FISHING;
function fishCheck(d) {
  if (d.region !== FG.region) return { error: `낚시는 ${REGIONS[FG.region].name}에서만 할 수 있다.` };
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  if (d.rest_at) return { error: RESTING };
  return null;
}
const isBait = (id) => ITEMS[id]?.cat === 'bait';
// 무엇이 낚일지: quality = perfect | good | ok | auto
function fishRoll(d, bait, quality) {
  const wx = weatherIdAt(d.region);
  const q = FG.quality[quality] || {}, b = FG.bait[bait] || {};
  const list = FG.fish.map((f) => ({ f, w: f.w * (q[f.tier] ?? 1) * (b[f.tier] ?? 1) * (f.wx?.[wx] ?? 1) }));
  let r = Math.random() * list.reduce((a, x) => a + x.w, 0);
  return (list.find((x) => (r -= x.w) < 0) || list[0]).f;
}
const QUALITY_LINE = {
  perfect: '찌가 쑥 들어가는 순간, 단숨에 낚아챘다!',
  good: '입질에 맞춰 힘껏 당겼다.',
  ok: '조금 늦었지만 겨우 끌어 올렸다.',
  auto: '느긋하게 기다리다 줄을 건졌다.',
};
// 낚아 올림: 결과 { title, lines, items, xp }
function fishLand(d, bait, quality) {
  const f = fishRoll(d, bait, quality);
  dexFish(d, f.id); // 도감: 낚은 수
  const it = ITEMS[f.id];
  const lines = [QUALITY_LINE[quality], `${it.name}${josa(it.name, '이', '가')} 걸려 올라왔다!`];
  if (f.tier === 'rare') { lines.push('해안의 어부들이 몰려와 웅성거린다.'); chron(d, 'mark', `해안에서 ${it.name}${josa(it.name, '을', '를')} 낚았다.`); }
  const xp = xpOf(d, FG.xp[f.tier]);
  const levelUp = gainXp(d, xp);
  return { title: '낚시', lines, items: [{ id: f.id, qty: 1 }], xp, levelUp, catch: { id: f.id, tier: f.tier, quality } };
}
// 던짐: 미끼를 하나 씀. auto면 바로 건짐
function fishCast(d, bait, have, auto) {
  const err = fishCheck(d);
  if (err) return err;
  if (!isBait(bait)) return { error: '미끼를 골라야 한다.' };
  if (have(bait) < 1) return { error: `${ITEMS[bait].name}${josa(ITEMS[bait].name, '이', '가')} 없다.` };
  if (auto) {
    const r = fishLand(d, bait, 'auto');
    r.items.unshift({ id: bait, qty: -1 });
    return r;
  }
  const biteIn = randInt(FG.biteMin, FG.biteMax);
  return { title: '낚시', lines: [`${ITEMS[bait].name}${josa(ITEMS[bait].name, '을', '를')} 꿰어 줄을 던졌다.`], items: [{ id: bait, qty: -1 }], fishing: { biteIn, window: FG.window } };
}
// 당김: cast = { bait, bite(입질 시각) }
function fishReel(d, cast, now = Date.now()) {
  const err = fishCheck(d);
  if (err) return err;
  if (!cast) return { error: '던져 둔 낚싯줄이 없다.' };
  const dt = now - cast.bite;
  if (dt < 0) return { title: '낚시', lines: ['너무 일찍 당겼다. 물고기가 놀라 달아나고, 미끼만 사라졌다.'], items: [], missed: 'early' };
  if (dt > FG.window) return { title: '낚시', lines: ['찌가 잠잠해졌다. 물고기가 미끼만 떼어 먹고 달아났다.'], items: [], missed: 'late' };
  return fishLand(d, cast.bait, dt <= FG.perfect ? 'perfect' : dt <= FG.good ? 'good' : 'ok');
}

// ── 위협하기 (적대 성향만) ──────────────────────────
function intimidate(d) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  if (d.rest_at) return { error: RESTING };
  if (!SHOPS[d.region]) return { error: '위협할 인간이 이곳에는 없다.' };
  if (d.stance !== 'hostile') return { error: '적대 성향일 때만 인간을 위협할 수 있다.' };
  if (d.ap < TRADE.intimidateCost) return { error: `행동력이 모자란다. (${TRADE.intimidateCost} 필요)` };
  spendAp(d, TRADE.intimidateCost);
  const st = statsOf(d);
  const where = REGIONS[d.region].name;
  // 원수가 된 마을은 미리 대비하고 있어서 더 어려움
  const prepared = (repOf(d)[d.region] || 0) <= -60 ? 0.15 : 0;
  const knight = d.perks?.knight ? 0.1 : 0;
  const chance = Math.max(0.15, Math.min(0.9, 0.4 + (st.majesty - 12) * 0.04 + d.level * 0.02 - prepared + knight));
  let items = [];
  let gold = 0;
  const lines = [];
  if (Math.random() < chance) {
    gold = Math.round((randInt(15, 35) + st.majesty) * SR.hostile.intimidateGold * traitMods(d).intimidateGold);
    lines.push(`${where} 하늘을 낮게 돌며 포효하자, 인간들이 서둘러 공물을 내왔다.`);
    if (Math.random() < 0.4) {
      const id = pick(SHOPS[d.region]);
      items = [{ id, qty: 1 }];
      lines.push(`금화 ${gold}닢과 ${ITEMS[id].name}${josa(ITEMS[id].name, '을', '를')} 빼앗았다.`);
    } else {
      lines.push(`금화 ${gold}닢을 빼앗았다.`);
    }
    if (d.region === FISHING.region) { // 해안 어촌: 그물째 바침
      const N = FISHING.coastTribute, n = randInt(...N.bait), f = randInt(...N.fish);
      const fid = Math.random() < 0.3 ? 'fish_flounder' : 'fish_mackerel';
      items.push({ id: 'bait_worm', qty: n }, { id: fid, qty: f });
      lines.push(`어부들이 벌벌 떨며 지렁이 미끼 ${n}개와 ${ITEMS[fid].name} ${f}마리를 그물째 바쳤다.`);
    }
    addRep(d, d.region, -12);
    lines.push(addFame(d, SR.hostile.fameOnIntimidate) || '드래곤들 사이에 이름이 퍼진다.');
  } else {
    const dmg = Math.max(3, Math.round(randInt(8, 16) - st.scale * 0.3));
    d.hp = Math.max(1, d.hp - dmg);
    lines.push(`성벽 위 궁수들이 화살을 퍼부었다. 체력을 ${dmg} 잃고 물러났다.`);
    if (d.region === FISHING.region) { // 해안: 쫓겨나면서도 그물 한 자락은 낚아챔
      const n = randInt(...FISHING.coastTribute.failBait);
      items.push({ id: 'bait_worm', qty: n });
      lines.push(`달아나면서 발톱에 걸린 그물 한 자락에서 지렁이 미끼 ${n}개를 건졌다.`);
    }
    addRep(d, d.region, -4);
    const f = addFame(d, SR.hostile.fameOnIntimidateFail);
    if (f) lines.push(f);
  }
  d.gold += gold;
  let xp = 8;
  xp = xpOf(d, xp);
  const levelUp = gainXp(d, xp);
  return { title: '위협', lines, items, gold, xp, levelUp };
}

// ── 둥지 ───────────────────────────────────────────
const isTown = (region) => !!SHOPS[region];

function buildNest(d) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  if (isTown(d.region)) return { error: '인간의 땅에는 둥지를 틀 수 없다.' };
  if (isRuin(d.region)) return { error: '오염된 이 땅에는 둥지를 틀 수 없다.' };
  if (d.nest === d.region) return { error: '이미 이곳에 둥지가 있다.' };
  const moving = !!d.nest;
  if (moving && d.gold < NEST.moveCost) return { error: `둥지를 옮기려면 금화 ${NEST.moveCost}닢이 든다.` };
  if (moving) d.gold -= NEST.moveCost;
  const from = d.nest;
  d.nest = d.region;
  const where = REGIONS[d.region].name;
  const ni = nestInfo(d);
  const lines = moving
    ? [`${REGIONS[from].name}의 둥지를 버리고 ${where}에 새 둥지를 틀었다.`, '보물더미도 하나도 빠짐없이 옮겨 왔다.']
    : [`${where}에 둥지를 틀었다.`, '이제 이곳에서 쉬고, 보물을 쌓을 수 있다.'];
  if (moving) {
    // 넓혀 둔 둥지는 한 단계 낮아지고, 설치한 덫·결계는 두고 옴
    if (ni.tier > 0) { ni.tier -= 1; lines.push(`새 둥지는 아직 ${NEST.tiers[ni.tier].name} 정도다.`); }
    if (ni.wards.trap || ni.wards.stone) lines.push('설치해 둔 덫과 결계는 옛 둥지에 남았다.');
    ni.wards = {};
    if (ni.forge) { ni.forge = false; lines.push('공방의 화로는 옛 둥지에 두고 왔다. 새로 지어야 한다.'); }
  }
  return { title: '둥지', lines, gold: moving ? -NEST.moveCost : 0 };
}

// 어디서든 둥지로 곧장 날아감 (이웃 지역이 아니어도)
function flyHome(d) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  if (d.rest_at) return { error: RESTING };
  if (!d.nest) return { error: '아직 둥지가 없다.' };
  if (d.region === d.nest) return { error: '이미 둥지에 있다.' };
  if (isRuin(d.region) !== isRuin(d.nest)) return { error: '다른 대륙에 있을 땐 둥지로 돌아가려면 대륙을 넘어야 한다.' }; // 바다 건너에서는 뱃길(RUIN.crossAp)로만
  if (d.ap < NEST.homeFlightAp) return { error: `행동력이 모자란다. (${NEST.homeFlightAp} 필요)` };
  if (NEST.homeFlightAp > 0) spendAp(d, NEST.homeFlightAp);
  const from = d.region;
  d.region = d.nest;
  return { title: '둥지', lines: [`${REGIONS[d.nest].name}의 둥지로 곧장 날아왔다.`], from };
}

// 쉬기 시작과 끝. 속도가 바뀌기 전에 지금까지의 회복을 먼저 계산함
function startRest(d, now = Date.now()) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  if (d.rest_at) return { error: '이미 쉬고 있다.' };
  const pn = hooks.partnerNest?.(d); // 반려의 둥지에서도 쉴 수 있음
  const atOwn = !!d.nest && d.region === d.nest;
  if (!atOwn && !(pn && pn.region === d.region)) return { error: '둥지에 있을 때만 쉴 수 있다.' };
  regen(d, now);
  d.rest_at = now;
  return { title: '둥지', lines: [atOwn ? '둥지에 몸을 말고 눈을 감았다.' : `반려 ${pn.name}의 둥지에 몸을 말고 눈을 감았다.`] };
}
function stopRest(d, now = Date.now()) {
  if (!d.rest_at) return { error: '쉬고 있지 않다.' };
  regen(d, now);
  const mins = Math.round((now - d.rest_at) / 60000);
  d.rest_at = null;
  return { title: '둥지', lines: [`${mins}분 동안 쉬고 깨어났다. 몸이 한결 가볍다.`] };
}

// 보물더미: 둥지에 있을 때만 넣고 뺄 수 있음
// what: 'gold' 또는 물건 id, have/hoardHave: 소지품·보물더미에 있는 개수
function hoardMove(d, dir, what, qty, have, hoardHave) {
  if (!d.nest || d.region !== d.nest) return { error: '보물더미는 둥지에 있을 때만 만질 수 있다.' };
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  qty = Math.floor(qty);
  if (!(qty > 0)) return { error: '개수를 다시 정해야 한다.' };
  if (what === 'gold') {
    if (dir === 'put') {
      if (d.gold < qty) return { error: '그만한 금화가 없다.' };
      d.gold -= qty; d.hoard_gold += qty;
      return { lines: [`금화 ${qty}닢을 보물더미에 쌓았다.`] };
    }
    if (d.hoard_gold < qty) return { error: '보물더미에 그만한 금화가 없다.' };
    d.hoard_gold -= qty; d.gold += qty;
    return { lines: [`보물더미에서 금화 ${qty}닢을 꺼냈다.`] };
  }
  const it = ITEMS[what];
  if (!it) return { error: '알 수 없는 물건이다.' };
  const label = `${it.name}${qty > 1 ? ` ${qty}개` : ''}`;
  if (dir === 'put') {
    if (have(what) < qty) return { error: '그만큼 가지고 있지 않다.' };
    return { lines: [`${label}${josa(label, '을', '를')} 보물더미에 쌓았다.`], items: [{ id: what, qty: -qty }], hoardItems: [{ id: what, qty }] };
  }
  if (hoardHave(what) < qty) return { error: '보물더미에 그만큼 없다.' };
  return { lines: [`보물더미에서 ${label}${josa(label, '을', '를')} 꺼냈다.`], items: [{ id: what, qty }], hoardItems: [{ id: what, qty: -qty }] };
}

// 보물더미 가치: 금화 + 물건 기준 값
function hoardValue(gold, items) {
  return gold + items.reduce((a, x) => a + (ITEMS[x.item]?.value || 0) * x.qty, 0);
}

// ── 둥지 단계·보물 도둑 ────────────────────────────
// 저장 공간에는 글자(JSON)로: { tier, wards: {trap, stone}, value: 보물더미 가치(서버가 갱신), raidAt: 도둑을 마지막으로 셈한 시각, calm: 이때까지 도둑이 오지 않음, raid }
function nestInfo(d) {
  if (typeof d.nest_info === 'string' || !d.nest_info) {
    try { d.nest_info = JSON.parse(d.nest_info || '{}'); } catch { d.nest_info = {}; }
  }
  const n = d.nest_info;
  if (!Number.isInteger(n.tier) || !NEST.tiers[n.tier]) n.tier = 0;
  if (!n.wards || typeof n.wards !== 'object') n.wards = {};
  return n;
}
const nestTier = (d) => NEST.tiers[d.nest ? nestInfo(d).tier : 0];
// 둥지 한 줄 요약 (내 둥지 창·프로필·동료 목록): 단계, 보물더미 단계(금액은 빼고), 지은 시설, 식구 (home: life.summary의 home)
function nestLine(d, home) {
  if (!d.nest) return null;
  const ni = nestInfo(d);
  const ht = hoardTier(ni.value || 0);
  const fac = facOf(d);
  return {
    region: d.nest, tier: ni.tier,
    hoard: ht ? HOARD_TIERS.indexOf(ht) + 1 : 0,
    facs: Object.keys(FACILITY.list).filter((id) => fac[id]),
    kin: (home || []).map((k) => ({ name: k.name, type: k.type, egg: k.status === 'egg', away: k.away || null })),
  };
}
// ── 둥지 시설 ─────────────────────────────────────
// 지은 시설 { 시설 id: { at } }. 예전의 화로(forge: true)는 공방으로 옮김
function facOf(d) {
  const n = nestInfo(d);
  if (!n.fac || typeof n.fac !== 'object') n.fac = {};
  if (n.forge && !n.fac.forge) n.fac.forge = { at: Date.now() };
  return n.fac;
}
const facSlots = (d) => FACILITY.slots[d.nest ? nestInfo(d).tier : 0] || FACILITY.slots[0];
// 시설의 힘: 없으면 0, 지었으면 1 + 일하는 식구 몫 (d.perks.fac는 game-life의 perksOf가 채움)
const facPower = (d, id) => (d.nest && facOf(d)[id] ? 1 + (d.perks?.fac?.[id] || 0) : 0);
function buildFacility(d, id, have) {
  const F = FACILITY.list[id];
  if (!F) return { error: '알 수 없는 시설이다.' };
  if (!d.nest || d.region !== d.nest) return { error: '시설은 둥지에 있을 때만 지을 수 있다.' };
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  const fac = facOf(d);
  if (fac[id]) return { error: `이미 ${F.name}${josa(F.name, '이', '가')} 있다.` };
  if (Object.keys(fac).length >= facSlots(d)) return { error: `시설 칸이 모자란다. (지금 ${facSlots(d)}칸. 둥지를 넓히면 늘어난다)` };
  const c = F.cost;
  if (d.gold < c.gold) return { error: `금화가 모자란다. (${c.gold}닢 필요)` };
  for (const [x, k] of Object.entries(c.items)) if (have(x) < k) return { error: `${ITEMS[x].name}${josa(ITEMS[x].name, '이', '가')} 모자란다. (${k}개 필요)` };
  d.gold -= c.gold;
  fac[id] = { at: Date.now() };
  if (id === 'forge') nestInfo(d).forge = true;
  chron(d, 'mark', `둥지에 ${F.name}${josa(F.name, '을', '를')} 지었다.`);
  return { title: F.name, lines: [`둥지에 ${F.name}${josa(F.name, '을', '를')} 지었다.`, F.desc, '식구에게 일을 맡기면 더 좋아진다.'], items: Object.entries(c.items).map(([x, k]) => ({ id: x, qty: -k })), gold: -c.gold };
}
function removeFacility(d, id) {
  const F = FACILITY.list[id];
  if (!F) return { error: '알 수 없는 시설이다.' };
  if (!d.nest || d.region !== d.nest) return { error: '둥지에 있을 때만 할 수 있다.' };
  const fac = facOf(d);
  if (!fac[id]) return { error: '그 시설이 없다.' };
  delete fac[id];
  if (id === 'forge') nestInfo(d).forge = false;
  return { title: F.name, lines: [`${F.name}${josa(F.name, '을', '를')} 허물었다. 그 자리가 비었다.`] };
}
const maxKinOf = (d) => nestTier(d).kin;

// 둥지 넓히기: 금화는 가진 것에서 먼저, 모자라면 보물더미에서
function expandNest(d, have) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  if (d.rest_at) return { error: RESTING };
  if (!d.nest || d.region !== d.nest) return { error: '둥지에 있을 때만 넓힐 수 있다.' };
  const ni = nestInfo(d);
  const next = NEST.tiers[ni.tier + 1];
  if (!next) return { error: '더는 넓힐 수 없다.' };
  const c = next.cost;
  const missing = Object.entries(c.items).filter(([id, n]) => have(id) < n).map(([id, n]) => `${ITEMS[id].name} ${n - have(id)}개`);
  if (missing.length) return { error: `재료가 모자란다: ${missing.join(', ')}` };
  if (d.gold + (d.hoard_gold || 0) < c.gold) return { error: `금화가 모자란다. (가진 금화와 보물더미를 합쳐 ${c.gold}닢 필요)` };
  const fromHand = Math.min(d.gold, c.gold);
  d.gold -= fromHand;
  d.hoard_gold -= c.gold - fromHand;
  ni.tier += 1;
  const lines = [`둥지를 넓혀 ${next.name}${josa(next.name, '을', '를')} 만들었다!`, next.desc, `이제 식구 ${next.kin}명이 함께 지낼 수 있고, 쉴 때 회복이 더 빨라진다.`];
  if (c.gold > fromHand) lines.push(`모자란 금화 ${c.gold - fromHand}닢은 보물더미에서 꺼내 썼다.`);
  chron(d, 'mark', `둥지를 넓혀 ${next.name}${josa(next.name, '을', '를')} 만들었다.`);
  return { title: '둥지', lines, gold: -fromHand, items: Object.entries(c.items).map(([id, n]) => ({ id, qty: -n })) };
}

const awayFromNest = (d) => !d.nest || d.region !== d.nest || !!d.exp_end;
const thiefOf = (value) => RAID.thieves.findIndex((t) => value <= t.upTo);
// 보물 도둑이 드는지 셈. 둥지를 비운 시간만큼 굴림. hoard: 보물더미 물건 [{item, qty}]
// 돌려주는 것: null(아무 일 없음) 또는 { kind: 'raid'|'blocked'|'expired', lines, hoardItems, gold }
function checkRaid(d, hoard, now = Date.now(), force = false) {
  if (!d.nest || d.dead_at || isFallen(d)) return null;
  const ni = nestInfo(d);
  // 쫓지 못한 도둑은 멀리 달아남
  if (ni.raid && ni.raid.until <= now) {
    const r = ni.raid;
    ni.raid = null;
    ni.calm = now + RAID.calm;
    ni.raidAt = now;
    chron(d, 'mark', `${r.name} 무리를 끝내 쫓지 못했다.`);
    return { kind: 'expired', lines: [`${r.name} 무리는 끝내 멀리 달아났다. 빼앗긴 보물은 돌아오지 않는다.`] };
  }
  if (ni.raid) return null;
  if (!force && !awayFromNest(d)) { ni.raidAt = now; return null; }
  if (!ni.raidAt) ni.raidAt = now;
  const value = ni.value || 0;
  if (!force && (value < RAID.minValue || (ni.calm || 0) > now)) { ni.raidAt = now; return null; }
  let chance = 1;
  if (!force) {
    const hours = Math.min(RAID.maxHours, Math.floor((now - ni.raidAt) / 3600000));
    if (hours < 1) return null;
    ni.raidAt += hours * 3600000;
    if (ni.raidAt < now - 3600000) ni.raidAt = now;
    const C = RAID.chance;
    const tw = FACILITY.list.tower;
    const p = Math.min(C.max, C.base + C.per1000 * (value / 1000)) * (d.perks?.guard ? RAID.guard : 1) * (1 - Math.min(tw.raidMax, tw.raid * facPower(d, 'tower'))); // 망루
    chance = 1 - (1 - p) ** hours;
  }
  if (Math.random() >= chance) return null;
  const ti = Math.max(0, thiefOf(value));
  const T = RAID.thieves[ti];
  const where = REGIONS[d.nest].name;
  // 결계석: 통째로 막음
  if (ni.wards.stone > 0) {
    ni.wards.stone -= 1;
    ni.calm = now + RAID.calm;
    chron(d, 'mark', `둥지에 든 ${T.name}${josa(T.name, '을', '를')} 결계석이 쫓아냈다.`);
    return { kind: 'blocked', lines: [`${where}의 둥지에 ${T.name} 무리가 숨어들었지만, 수호 결계석이 번쩍이며 쫓아냈다.`, `결계석 하나가 부서졌다. (남은 결계석 ${ni.wards.stone})`] };
  }
  const trapped = ni.wards.trap > 0;
  if (trapped) ni.wards.trap -= 1;
  const mult = nestTier(d).raidLoss * (trapped ? RAID.trap : 1);
  const gold = Math.min(RAID.goldMax[ti], Math.floor((d.hoard_gold || 0) * rand(...RAID.gold) * mult));
  const stacks = shuffle(hoard.filter((x) => x.qty > 0 && ITEMS[x.item] && ITEMS[x.item].cat !== 'treasure')).slice(0, randInt(...RAID.stacks)); // 보물은 도둑도 손대지 못함
  const items = stacks.map((x) => ({ id: x.item, qty: Math.min(x.qty, Math.max(1, Math.round(x.qty * rand(...RAID.itemPart) * mult))) }));
  if (!gold && !items.length) { ni.calm = now + RAID.calm; return null; }
  d.hoard_gold -= gold;
  const lv = Math.max(1, Math.min(14, d.level + T.lv));
  ni.raid = { at: now, until: now + RAID.chaseFor, thief: ti, name: T.name, lv, gold, items, trapped };
  const got = [...(gold ? [`금화 ${gold}닢`] : []), ...items.map(itemLabel)].join(', ');
  const lines = [`${where}의 둥지에 ${T.name} 무리가 숨어들었다!`, `보물더미에서 ${got}${josa(got, '을', '를')} 훔쳐 달아났다.`];
  if (trapped) lines.push(`가시 덫에 걸린 도둑들이 피를 흘리며 반쯤만 챙겨 갔다. (남은 덫 ${ni.wards.trap})`);
  lines.push(`${Math.round(RAID.chaseFor / 3600000)}시간 안에 둥지에서 뒤쫓으면 되찾을 수 있다.`);
  chron(d, 'mark', `${T.name} 무리에게 보물을 도둑맞았다.`);
  return { kind: 'raid', lines, gold: -gold, hoardItems: items.map((x) => ({ id: x.id, qty: -x.qty })) };
}
// 둥지 창·내 정보에 보일 도둑 소식
function raidView(d) {
  const r = d.nest && nestInfo(d).raid;
  if (!r) return null;
  return { name: r.name, until: r.until, gold: r.gold, items: r.items, lv: r.lv, trapped: !!r.trapped, minions: RAID.thieves[r.thief].minions.length };
}
// 쫓아갈 수 있는지
function chaseCheck(d) {
  const r = d.nest && nestInfo(d).raid;
  if (!r) return { error: '쫓을 도둑이 없다.' };
  if (d.region !== d.nest) return { error: '둥지에 가야 도둑의 흔적을 쫓을 수 있다.' };
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  if (d.rest_at) return { error: RESTING };
  if (d.ap < RAID.chaseAp) return { error: `행동력이 모자란다. (${RAID.chaseAp} 필요)` };
  if (lowHp(d)) return { error: '기운이 없어 쫓아갈 수 없다. 조금 쉬어야 한다.' };
  return null;
}

// ── 보물 상자 ──────────────────────────────────────
// 둥지 정보(nest_info)에 { chest: [{ k: 종류(KEEPSAKES), n: 준 이, t: 글(편지·쪽지), at }] }
// 물건 칸이 아니라서 보물 도둑이 손대지 못하고, 꺼내거나 팔 수도 없음. 하나마다 작은 값어치가 보물더미 가치에 더해짐
function chestOf(d) {
  const ni = nestInfo(d);
  if (!Array.isArray(ni.chest)) ni.chest = [];
  return ni.chest;
}
function chestAdd(d, kind, from = '', text = '', now = Date.now()) {
  if (!KEEPSAKES[kind] || !d.nest) return false;
  chestOf(d).push({ k: kind, n: String(from || '').slice(0, 24), t: String(text || '').slice(0, 400), at: now });
  return true;
}
const chestValue = (d) => (d.nest ? chestOf(d).reduce((a, e) => a + (KEEPSAKES[e.k]?.value || 0), 0) : 0);
// 보이는 이름: '루비의 그림' · '하늘에게 받은 들꽃 꽃다발' · 준 이가 없으면 이름만
function chestLabel(e) {
  const K = KEEPSAKES[e.k];
  if (!K) return '';
  if (!e.n) return K.name;
  return K.fmt === 'from' ? `${e.n}에게 받은 ${K.name}` : `${e.n}의 ${K.name}`;
}
const chestView = (d) => (d.nest ? chestOf(d).map((e) => ({ k: e.k, label: chestLabel(e), desc: KEEPSAKES[e.k]?.desc || '', text: e.t || '', say: KEEPSAKES[e.k]?.say !== false, at: e.at, value: KEEPSAKES[e.k]?.value || 0 })).reverse() : []);
// 예전에 보물더미에 물건으로 쌓아 둔 추억 물건(먼 둥지의 편지, 고향의 조약돌)을 상자로 옮김. 돌려주는 것: 보물더미에서 뺄 것
function chestMigrate(d, hoard) {
  if (!d.nest) return [];
  const out = [];
  for (const x of hoard) {
    const keep = ITEMS[x.item]?.use?.keep;
    if (!keep || !['kin_letter', 'elder_keepsake'].includes(x.item) || !(x.qty > 0)) continue;
    for (let i = 0; i < x.qty; i++) chestAdd(d, keep, '', '', 0);
    out.push({ id: x.item, qty: -x.qty });
  }
  return out;
}
// 화관을 쓰고 있는지 (이름 옆 꽃 표시)
const crownOn = (d, now = Date.now()) => (combatJson(d).crownUntil || 0) > now;

// ── 도감 ───────────────────────────────────────────
// 전투 설정(combat JSON)에 { dex: { m: { 사냥감 키: [처음 본 시각, 쓰러뜨린 수] }, i: { 물건 id: 처음 얻은 시각 }, f: { 물고기 id: 낚은 수 }, seenAt } }
// 사냥감 키: 장소 id(사냥감) · 장소 id + '!'(그 장소의 강적) · 'boss:지역'(대륙의 재앙). 시각 0은 '도감이 생기기 전부터'
// 물건은 db.saveState를 지나는 모든 획득에서 저절로 기록됨 (정성 들인 요리는 원래 요리로 셈)
function dexOf(d) {
  const c = combatJson(d);
  if (!c.dex || typeof c.dex !== 'object') c.dex = {};
  const x = c.dex;
  if (!x.m || typeof x.m !== 'object') x.m = {};
  if (!x.i || typeof x.i !== 'object') x.i = {};
  if (!x.f || typeof x.f !== 'object') x.f = {};
  return x;
}
const dexKey = (id) => ITEMS[id]?.cooked || ITEMS[id]?.mwOf || id; // 정성 들인 요리·걸작은 본래 물건으로 셈
// 처음 만난 사냥감이면 true
function dexMeet(d, key, now = Date.now()) {
  const m = dexOf(d).m;
  if (m[key]) return false;
  m[key] = [now, 0];
  return true;
}
function dexWin(d, key, n = 1, now = Date.now()) { dexMeet(d, key, now); dexOf(d).m[key][1] += n; }
// 얻은 물건들 (qty가 양수인 것만). db.saveState가 부름
function dexItems(d, items, now = Date.now()) {
  let x = null;
  for (const it of items || []) {
    if (!(it && it.qty > 0) || !ITEMS[it.id]) continue;
    x ||= dexOf(d);
    const k = dexKey(it.id);
    if (x.i[k] == null) x.i[k] = now;
  }
}
const dexFish = (d, id) => { const f = dexOf(d).f; f[id] = (f[id] || 0) + 1; };
// 도감이 생기기 전의 기록을 한 번에 옮겨 옴: 가진 물건, 장소별 사냥 승리, 지나온 이야기의 강적·재앙
// owned: 소지품·보물더미의 물건 id 목록
function dexBackfill(d, owned = []) {
  const x = dexOf(d);
  for (const id of [...owned, ...Object.values(equipOf(d))]) { const k = dexKey(id); if (ITEMS[k] && x.i[k] == null) x.i[k] = 0; }
  const counts = traitsOf(d).counts;
  for (const [k, n] of Object.entries(counts)) {
    const p = k.startsWith('huntwin:') && k.slice(8);
    if (p && PLACES[p] && n > 0 && !x.m[p]) x.m[p] = [0, n];
  }
  for (const { t } of chronOf(d)) {
    if (typeof t !== 'string') continue;
    for (const p of Object.values(PLACES)) if (t.includes('강적') && t.includes(p.elite) && !x.m[`${p.id}!`]) x.m[`${p.id}!`] = [0, 1];
    for (const [r, B] of Object.entries(BOSSES)) if (t.includes(B.name) && !x.m[`boss:${r}`]) x.m[`boss:${r}`] = [0, t.includes('쓰러뜨렸다') ? 1 : 0];
  }
  for (const f of FISHING.fish) if (x.i[f.id] != null && !x.f[f.id]) x.f[f.id] = 0;
}
// 물건이 어디서 나오는지 (보이는 글). known: 숨겨진 제작법을 아는지
const dexRegionName = (r) => REGIONS[r]?.name || r;
const DEX_DROPS = {};
for (const p of Object.values(PLACES)) if (p.drop && p.drop !== 'purify_shard') (DEX_DROPS[p.drop] ||= []).push(p.name);
function dexSources(d, id) {
  const out = [];
  const gather = Object.entries(REGION_LOOT).filter(([, L]) => [...L.common, ...L.uncommon, ...L.rare].includes(id)).map(([r]) => dexRegionName(r));
  if (gather.length) out.push(`채집·탐사: ${gather.join(', ')}`);
  if (DEX_DROPS[id]) out.push(`사냥: ${DEX_DROPS[id].join(', ')}`);
  if (FISHING.fish.some((f) => f.id === id)) out.push(`낚시: ${dexRegionName(FISHING.region)}`);
  const shop = Object.entries(SHOPS).filter(([, l]) => l.includes(id)).map(([r]) => dexRegionName(r));
  const special = Object.entries(SHOPS_SPECIAL).filter(([, l]) => l.includes(id)).map(([r]) => dexRegionName(r));
  if (shop.length) out.push(`시장: ${shop.join(', ')}`);
  if (special.length) out.push(`우호 전용 시장: ${special.join(', ')}`);
  if (RUIN.exchange.some((e) => e.id === id)) out.push('생존자 오르샤와 교환');
  const r = RECIPES.find((x) => x.out === id);
  if (r && recipeKnown(d, r)) out.push(`제작 (지혜 ${r.wis})`);
  else if (r) out.push('숨겨진 제작법');
  return out;
}
// 물건 분류 (도감 칸)
const DEX_CATS = [['material', '재료'], ['trophy', '전리품'], ['meal', '요리'], ['use', '쓰는 것'], ['equip', '장신구'], ['treasure', '보물'], ['etc', '그 밖의 것']];
function dexCat(it) {
  if (it.cat === 'treasure') return 'treasure';
  if (it.type === 'equip') return 'equip';
  if (it.cat === 'meal') return 'meal';
  if (it.type === 'use') return 'use';
  if (it.cat === 'trophy') return 'trophy';
  if (it.cat === 'bait') return 'etc';
  return 'material';
}
const elemList = (l) => (l || []).map((e) => ELEMENTS[e] || e).join('·');
const fightInfo = (o) => [o.weak?.length ? `약점 ${elemList(o.weak)}` : '', o.resist?.length ? `저항 ${elemList(o.resist)}` : '', o.special ? `특기 '${o.special.name}'` : ''].filter(Boolean).join(' · ');
// 화면에 보낼 도감. 보지 못한 칸은 이름 대신 힌트만
function dexView(d) {
  const x = dexOf(d);
  const NEW = x.seenAt || 0;
  const isNew = (t) => !!t && t > NEW;
  // 사냥감: 지역마다 (본 대륙 → 멸망한 대륙)
  const beasts = [];
  for (const [r, ids] of Object.entries(REGION_PLACES)) {
    const list = [];
    for (const pid of ids) {
      const p = PLACES[pid];
      for (const elite of [false, true]) {
        const e = x.m[elite ? `${pid}!` : pid];
        const where = `${p.name} · 사냥터 Lv.${p.level}`; // 강적은 화면이 따로 표시
        if (!e) { list.push({ seen: false, elite, where }); continue; }
        const drop = p.drop ? ITEMS[p.drop]?.name : null;
        list.push({ seen: true, elite, name: elite ? p.elite : p.creature, where, info: fightInfo(p), sub: [drop ? `전리품 ${drop}` : '', `쓰러뜨린 수 ${e[1]}`].filter(Boolean).join(' · '), at: e[0], fresh: isNew(e[0]) });
      }
    }
    beasts.push({ region: r, name: dexRegionName(r), ruin: isRuin(r), list });
  }
  // 대륙의 재앙
  const bosses = Object.entries(BOSSES).map(([r, B]) => {
    const e = x.m[`boss:${r}`];
    const where = `${dexRegionName(r)}에 나타남`;
    return e ? { seen: true, name: B.name, where, desc: B.desc, info: fightInfo(B), sub: `쓰러뜨린 수 ${e[1]}`, at: e[0], fresh: isNew(e[0]) } : { seen: false, where };
  });
  // 물고기
  const fish = FISHING.fish.map((f) => {
    const it = ITEMS[f.id];
    const at = x.i[f.id];
    return at != null ? { seen: true, id: f.id, name: it.name, rarity: it.rarity, desc: it.desc, sub: `낚은 수 ${x.f[f.id] || 0}`, at, fresh: isNew(at) } : { seen: false, id: f.id, rarity: it.rarity, where: dexRegionName(FISHING.region) };
  });
  // 물건 (물고기와 정성 들인 요리는 뺌)
  const fishIds = new Set(FISHING.fish.map((f) => f.id));
  const items = DEX_CATS.map(([k, name]) => ({ cat: k, name, list: [] }));
  for (const [id, it] of Object.entries(ITEMS)) {
    if (it.cooked || it.mwOf || fishIds.has(id)) continue;
    const at = x.i[id];
    const src = dexSources(d, id);
    const row = at != null
      ? { seen: true, id, name: it.name, rarity: it.rarity, desc: it.desc, sub: src.join(' · '), at, fresh: isNew(at) }
      : { seen: false, id, rarity: it.rarity, sub: src.join(' · ') || '어디서 나오는지 아무도 모른다' };
    items.find((c) => c.cat === dexCat(it)).list.push(row);
  }
  const tally = (l) => [l.filter((e) => e.seen).length, l.length];
  const allBeasts = beasts.flatMap((g) => g.list);
  const allItems = items.flatMap((c) => c.list);
  const parts = { beasts: tally(allBeasts), bosses: tally(bosses), fish: tally(fish), items: tally(allItems) };
  const sum = Object.values(parts).reduce((a, [s, n]) => [a[0] + s, a[1] + n], [0, 0]);
  return { beasts, bosses, fish, items, parts, total: sum };
}
// 도감을 열면: 이번에 처음 본 것까지 '새로' 표시를 거둠
const dexSeen = (d, now = Date.now()) => { dexOf(d).seenAt = now; };
// 지난번에 도감을 연 뒤로 새로 채운 칸이 있는지 (상태 창의 점)
function dexHasNew(d) {
  const x = dexOf(d), t = x.seenAt || 0;
  for (const e of Object.values(x.m)) if (e[0] > t) return true;
  for (const at of Object.values(x.i)) if (at > t) return true;
  return false;
}

// ── 업적 ───────────────────────────────────────────
// 전투 설정(combat JSON)에 { ach: { 업적 id: 이룬 시각 }, achSeenAt }. 시각 0은 '업적이 생기기 전에 이미 이룸'
// 판정은 이미 남아 있는 기록(도감·셈·지나온 이야기·레벨·둥지)으로만 하므로 새로 세는 것이 없다
const DEX_ALL = (() => { // 도감의 모든 칸 (분류별 물건 id 포함)
  const fishIds = new Set(FISHING.fish.map((f) => f.id));
  const cats = {};
  for (const [id, it] of Object.entries(ITEMS)) if (!it.cooked && !it.mwOf && !fishIds.has(id)) (cats[dexCat(it)] ||= []).push(id);
  const beasts = Object.values(REGION_PLACES).flat().flatMap((p) => [p, `${p}!`]);
  return { cats, beasts, bosses: Object.keys(BOSSES).map((r) => `boss:${r}`), fish: [...fishIds], items: Object.values(cats).flat() };
})();
const RUIN_PLACES = Object.values(PLACES).filter((p) => isRuin(p.region)).map((p) => p.id);
function achOf(d) {
  const c = combatJson(d);
  if (!c.ach || typeof c.ach !== 'object') c.ach = {};
  return c.ach;
}
// 지금까지 어디까지 왔는지 [cur, at]
function achProgress(d, A) {
  const c = A.cond, x = dexOf(d);
  const seenM = (k) => (x.m[k] ? 1 : 0), seenI = (k) => (x.i[k] != null ? 1 : 0);
  const sum = (l, f) => l.reduce((a, k) => a + f(k), 0);
  if (c.dexRegion) { const l = (REGION_PLACES[c.dexRegion] || []).flatMap((p) => [p, `${p}!`]); return [sum(l, seenM), l.length]; }
  if (c.dexFish) return [sum(DEX_ALL.fish, seenI), DEX_ALL.fish.length];
  if (c.dexBoss) return [sum(DEX_ALL.bosses, seenM), DEX_ALL.bosses.length];
  if (c.dexCat) { const l = DEX_ALL.cats[c.dexCat[0]] || []; return [sum(l, seenI), Math.min(l.length, c.dexCat[1] || l.length)]; }
  if (c.dexPct) {
    const all = DEX_ALL.beasts.length + DEX_ALL.bosses.length + DEX_ALL.fish.length + DEX_ALL.items.length;
    const seen = sum(DEX_ALL.beasts, seenM) + sum(DEX_ALL.bosses, seenM) + sum(DEX_ALL.fish, seenI) + sum(DEX_ALL.items, seenI);
    return [seen, Math.ceil(all * c.dexPct)];
  }
  if (c.item) return [seenI(c.item), 1];
  if (c.metRuin) return [RUIN_PLACES.some((p) => x.m[p] || x.m[`${p}!`]) ? 1 : 0, 1];
  if (c.beat) return [(x.m[c.beat]?.[1] || 0) > 0 ? 1 : 0, 1];
  if (c.recipes) return [knownRecipes(d).length, c.recipes];
  if (c.level) return [d.level, c.level];
  if (c.nest) return [d.nest ? nestInfo(d).tier : 0, c.nest];
  if (c.count) return [traitsOf(d).counts[c.count[0]] || 0, c.count[1]];
  if (c.chron) return [chronOf(d).some((e) => typeof e.t === 'string' && e.t.includes(c.chron)) ? 1 : 0, 1];
  if (c.kills) return [x.m[c.kills[0]]?.[1] || 0, c.kills[1]];
  if (c.fishN) return [x.f[c.fishN[0]] || 0, c.fishN[1]];
  if (c.bossKills) return [Math.max(0, ...Object.keys(BOSSES).map((r) => x.m[`boss:${r}`]?.[1] || 0)), c.bossKills];
  if (c.goldAt) return [Math.min(d.gold || 0, c.goldAt), c.goldAt];
  if (c.goldZero) return [d.level >= c.goldZero && (d.gold || 0) === 0 ? 1 : 0, 1];
  if (c.mindLow) return [!berserkOf(d) && d.mind != null && d.mind <= c.mindLow ? 1 : 0, 1];
  if (c.fameAt) return [(d.fame || 0) <= c.fameAt ? 1 : 0, 1];
  if (c.hourKST != null) return [new Date(Date.now() + 9 * 3600000).getUTCHours() === c.hourKST ? 1 : 0, 1];
  if (c.daysIn) return [Math.min(c.daysIn, d.created_at ? Math.floor((Date.now() - d.created_at) / 86400000) : 0), c.daysIn]; // 드래곤을 만든 날부터 지난 날 (현실 시간)
  return [0, 1];
}
// 새로 이룬 업적을 기록하고 돌려줌. 처음 판정할 때(업적이 생기기 전 기록)는 시각 0으로 조용히 채우고 개수만 돌려줌
function checkAch(d, now = Date.now()) {
  if (d.dead_at) return { got: [], backfill: 0 };
  const c = combatJson(d);
  const first = !c.ach || typeof c.ach !== 'object';
  const have = achOf(d);
  const got = [];
  for (const A of ACHIEVEMENTS) {
    if (have[A.id] != null) continue;
    const [cur, at] = achProgress(d, A);
    if (cur < at) continue;
    have[A.id] = first ? 0 : now;
    if (!first) { got.push(A); chron(d, 'mark', `${A.hidden ? '숨겨진 ' : ''}업적 '${A.name}'${josa(A.name, '을', '를')} 이루었다.`, now); }
  }
  if (first) c.achSeenAt = now;
  return { got, backfill: first ? Object.keys(have).length : 0 };
}
// 화면에 보낼 업적 목록. 숨겨진 업적은 이루기 전에는 가려짐
function achView(d) {
  const have = achOf(d), seenAt = combatJson(d).achSeenAt || 0;
  const list = ACHIEVEMENTS.map((A) => {
    const at = have[A.id];
    if (at != null) return { id: A.id, have: true, hidden: !!A.hidden, name: A.name, desc: A.desc, at, fresh: at > seenAt };
    if (A.hidden) return { id: A.id, have: false, hidden: true };
    const [cur, need] = achProgress(d, A);
    return { id: A.id, have: false, name: A.name, desc: A.desc, cur: Math.min(cur, need), need };
  });
  const open = list.filter((a) => !a.hidden || a.have);
  return { list, have: list.filter((a) => a.have).length, total: list.length, hidden: [list.filter((a) => a.hidden && a.have).length, list.filter((a) => a.hidden).length], shown: open.length };
}
const achSeen = (d, now = Date.now()) => { combatJson(d).achSeenAt = now; };
const achHasNew = (d) => { const t = combatJson(d).achSeenAt || 0; return Object.values(achOf(d)).some((at) => at > t); };

// 다른 모듈(서버)이 채워 주는 것: hoard(드래곤 id) → 보물더미 물건, bossTrace(지역) → 최근 재앙의 흔적
const hooks = {};

module.exports = {
  migrateMasterwork,
  hooks, BOND_TOGETHER: BOND_RULES.together,
  seasonAt, weatherOf, weatherIdAt, weatherFx, fxText, fxProse, weatherDebug, SLOT_MS,
  nestInfo, nestTier, maxKinOf, expandNest, checkRaid, raidView, chaseCheck,
  regen, gather, explore, fishCast, fishReel, startExpedition, finishExpedition, chooseFork, forkView, expInfo,
  craft, experiment, enhanceGear, engraveGear, tidyGear, engraveOf, gearOf, greatChance, craftView, ordersView, fillOrder, buildForge, atForge,
  useItem, equip, unequip, statsOf, bonusOf, hpCap, enCap, apCap, equipOf, buffOf, giveBuff,
  repOf, setStance, marketInfo, buy, sell, intimidate,
  buildNest, flyHome, startRest, stopRest, hoardMove, hoardValue,
  actionCost, townArrows, hasBounty, addRep, addFame, craftEn, gainXp, spendStats,
  traitsOf, traitMods, hasTrait, chooseTraits, traitCount,
  check, spendAp, rollItem, bundle, itemLabel, xpOf, isTown, lowHp, // 전투(game-combat.js)가 씀
  corruptedRegion, corruptUntil, corruptPeriod, isCorrupted, isRuin, berserkOf, loseMind, nearestTown,
  placeOf, goPlace, isFallen, chron, chronOf,
  titlesOf, titleOn, titleName, titleMods, checkTitles, setTitle, titlesView,
  combatJson, dayIdx, gearMods, clampVitals, planExpedition, planView, facOf, facSlots, facPower, buildFacility, removeFacility, // 모브 드래곤(game-mobs.js)이 씀
  xpNeed, atMaxLevel,
  dexOf, dexMeet, dexWin, dexItems, dexBackfill, dexView, dexSeen, dexHasNew, // 도감
  checkAch, achView, achSeen, achHasNew, // 업적
  chestOf, chestAdd, chestValue, chestView, chestMigrate, crownOn, // 보물 상자 · 화관
  nestLine, // 둥지 한 줄 요약
  gearAt, gearOn, // 강화된 한 개가 어디 있는지
};
