// 게임 규칙: 회복, 단발 행동(탐사·채집·사냥), 원정
// 숫자를 조절하고 싶으면 이 파일과 game-data.js의 RULES를 고치면 됩니다.
// 모든 함수는 드래곤 객체 d를 직접 바꾸고, 결과 { lines, items, gold, xp, ... }를 돌려줍니다.
// 저장은 부르는 쪽(server.js)이 db.saveState(d, items)로 합니다.

const {
  REGIONS, ITEMS, REGION_LOOT, CREATURES, SCENES, RULES, RECIPES, SLOTS, STANCES, SHOPS, repTier, TRADE, NEST, hoardTier, RAID, SEASONS, SEASON_RULES, WEATHERS, W_BASE, W_REGION, ELEMENTS,
  SHOPS_SPECIAL, STANCE_RULES, fameTier, KIN, TRAITS, TRAIT_EARN, STAT_POINTS, STATS, MIND, PLACES, REGION_PLACES, PLACE_RULES, BUFFS, TITLES, TITLE_COUNT_NAMES, EXP_GOALS, EXP_FORKS, EXP_RULES,
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
const xpOf = (d, xp) => (xp > 0 ? Math.max(1, Math.round(xp * traitMods(d).xp * (titleMods(d).xp || 1))) : 0);

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
    return r ? `${REGIONS[r].name}에서 ${text.replace('사냥에서 ', '사냥 ').replace('번 이기기', '번 이기기')}` : text;
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
function equipOf(d) {
  if (typeof d.equip === 'string') {
    try { d.equip = JSON.parse(d.equip || '{}'); } catch { d.equip = {}; }
  }
  if (!d.equip) d.equip = {};
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
  const rr = d.rest_at ? wx.restRegen : 1;
  m = { ap: m.ap * shelter(wx.apRegen) * rr, hp: m.hp * shelter(wx.hpRegen) * rr, en: m.en * shelter(wx.enRegen) * rr };
  tick('ap', apCap(d), 'ap_at', RULES.apEvery / (m.ap * tm.apRegen));
  if (isFallen(d)) d.hp_at = now; // 쓰러져 있는 동안은 체력이 차지 않음
  else tick('hp', hpCap(d), 'hp_at', RULES.hpEvery / (m.hp * tm.hpRegen));
  tick('en', enCap(d), 'en_at', RULES.enEvery / (m.en * tm.enRegen));
  // 정신: 광폭화 중에는 차지 않음. 둥지에서 쉬면 빨리, 은둔이면 조금 더 빨리
  if (d.mind == null) d.mind = MIND.max;
  if (berserkOf(d)) d.mind_at = now;
  else tick('mind', MIND.max, 'mind_at', MIND.regenEvery / ((d.rest_at ? MIND.restMult * (hoardTier(nestInfo(d).value || 0)?.mind || 1) : 1) * (d.stance === 'hermit' ? MIND.hermitMult : 1) * shelter(wx.mindRegen)));
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
// 오염된 땅: 야생 지역 중 하나. 이틀마다 다음 곳으로 옮겨 감 (모두에게 같은 곳)
const WILD = () => Object.keys(REGIONS).filter((r) => !isTown(r));
function corruptedRegion(now = Date.now()) {
  const w = WILD();
  return w[Math.floor(now / MIND.rotateMs) % w.length];
}
const corruptUntil = (now = Date.now()) => (Math.floor(now / MIND.rotateMs) + 1) * MIND.rotateMs;
const isCorrupted = (region, now = Date.now()) => region === corruptedRegion(now);
// 광폭화 상태 { at, until, region, hp, hpMax } (없으면 null)
function berserkOf(d) {
  if (!d.berserk) return null;
  if (typeof d.berserk === 'string') { try { d.berserk = JSON.parse(d.berserk); } catch { d.berserk = null; } }
  return d.berserk;
}
// 가장 가까운 인간 마을
function nearestTown(region) {
  const r = REGIONS[region];
  return Object.keys(SHOPS).sort((a, b) =>
    Math.hypot(REGIONS[a].x - r.x, REGIONS[a].y - r.y) - Math.hypot(REGIONS[b].x - r.x, REGIONS[b].y - r.y))[0];
}
// 장신구가 막아 주는 정도 (정화의 부적)
function mindWard(d) {
  let w = 1;
  for (const id of Object.values(equipOf(d))) if (ITEMS[id]?.mindWard) w *= ITEMS[id].mindWard;
  return w * (titleMods(d).mindWard || 1);
}
// 정신을 깎음. 알려 줄 문장을 돌려줌 (경고 문턱을 넘으면 경고도)
function loseMind(d, n) {
  if (!n || berserkOf(d)) return [];
  if (d.mind == null) d.mind = MIND.max;
  const lost = Math.max(1, Math.round(n * traitMods(d).mindDrain * mindWard(d)));
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
    lost,
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
function gainXp(d, xp) {
  d.xp += xp;
  const apBefore = apCap(d);
  let up = 0;
  while (d.xp >= d.level * 100) {
    d.xp -= d.level * 100;
    d.level += 1;
    d.hp_max += 5;
    d.en_max += 2;
    up += 1;
  }
  if (up) {
    chron(d, 'mark', `레벨 ${d.level}${[2, 4, 5, 9].includes(d.level % 10) ? '가' : '이'} 되었다.`);
    d.stat_pts = (d.stat_pts || 0) + STAT_POINTS.perLevel * up; // 나눌 능력치 포인트
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

  const lines = [pick(SCENES[d.region])];
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
    const a = ambush(d, SR.hostile.ambush.explore);
    if (a) { lines.push(...a.lines); gold -= a.lost; }
  }
  let xp = 6;
  xp = xpOf(d, xp);
  const levelUp = gainXp(d, xp);
  return { title: '탐사', lines, items, gold, xp, levelUp };
}

function hunt(d) {
  const err = check(d, 'hunt');
  if (err) return err;
  const c = CREATURES[d.region];
  if (!c) return { error: '인간의 땅에서는 사냥할 수 없다.' };
  if (d.hp < RULES.huntMinHp) return { error: '기운이 없어 사냥에 나설 수 없다. 조금 쉬어야 한다.' };
  spendAp(d, RULES.cost.hunt);

  const st = statsOf(d);
  const hostile = d.stance === 'hostile';
  if (hostile) st.claw += SR.hostile.huntClaw; // 적대: 사냥에 거침없음
  if (d.perks?.knight) st.claw += 3;           // 등에 탄 용기사
  const tm = traitMods(d);
  st.claw += tm.huntClaw;                      // 특성: 타고난 사냥꾼
  const power = st.claw + st.wing * 0.5 + d.level * 2;
  const fameHunt = fameTier(d.fame || 0).hunt;  // 명성이 낮으면 짐승도 얕봄
  const chance = Math.max(0.1, Math.min(0.9, 0.55 + (power - (12 + c.level * 3)) * 0.04 + fameHunt));
  const win = Math.random() < chance;
  const rawDmg = randInt(3, 6) * c.level * (win ? 1 : 1.4);
  const dmg = Math.max(1, Math.round((rawDmg - st.scale * 0.4) * (d.perks?.knight ? 0.7 : 1) * tm.huntDmg));
  d.hp = Math.max(1, d.hp - dmg);
  const wound = d.hp <= hpCap(d) * 0.15; // 쓰러지기 직전까지 몰림 (특성: 얇은 비늘)

  const lines = [];
  let items = [];
  let gold = 0;
  let xp;
  if (win) {
    lines.push(`${c.name}${josa(c.name, '을', '를')} 쓰러뜨렸다. 체력을 ${dmg} 잃었다.`);
    const ids = ['beast_hide'];
    if (Math.random() < 0.3 + c.level * 0.05 + (hostile ? SR.hostile.huntFang : 0)) ids.push('sharp_fang');
    items = bundle(ids);
    gold = Math.round(randInt(0, 3) * c.level * (hostile ? SR.hostile.huntGold : 1));
    xp = 12 + c.level * 6;
    const got = items.map(itemLabel);
    if (gold) got.push(`금화 ${gold}닢`);
    const t = got.join(', ');
    lines.push(`${t}${josa(t, '을', '를')} 얻었다.`);
  } else {
    lines.push(`${c.name}에게 밀려 물러났다. 체력을 ${dmg} 잃었다.`);
    xp = 4;
  }
  d.gold += gold;
  xp = xpOf(d, xp);
  const levelUp = gainXp(d, xp);
  return { title: '사냥', lines, items, gold, xp, levelUp, win, wound };
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

  let rolls = Math.floor(done / 10 * (1 + companions * KIN.companionBonus) * traitMods(d).expRolls * G.rolls * (fr?.rolls || 1));
  let missed = false;
  if (G.miss && rolls > 0 && Math.random() < G.miss) { rolls = Math.floor(rolls / 2); missed = true; }
  const hours = planned / 60;
  const ids = [];
  for (let i = 0; i < rolls; i++) {
    ids.push(rollItem(region, {
      uncommon: (0.16 + hours * 0.03 + st.wisdom * 0.004 + (hermit ? SR.hermit.expUncommon : 0)) * G.uncommon,
      rare: (0.015 + hours * 0.012 + st.wisdom * 0.001 + extra + (hermit ? SR.hermit.expRare : 0)) * G.rare + (fr?.rare || 0),
    }));
  }
  // 갈림길에서 얻은 것
  for (let i = 0; i < (fr?.loot || 0); i++) ids.push(rollItem(region, { uncommon: 0.5, rare: 0.12 + (fr?.rare || 0) }));
  if (fr?.item) ids.push(fr.item);
  // 사냥 원정·갈림길의 사냥: 그 지역 장소의 전리품 (갈 수 있는 장소에서)
  const trophyN = Math.floor(done / 20) * (G.trophy || 0) + (fr?.trophy || 0);
  const huntable = (REGION_PLACES[region] || []).filter((id) => PLACES[id].level <= d.level + PLACE_RULES.tooHard);
  for (let i = 0; i < trophyN && huntable.length; i++) ids.push(PLACES[pick(huntable)].drop);
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
    journal.push(early ? '부름을 받고 서둘러 돌아왔다.' : '긴 여정을 마치고 돌아왔다.');
  }

  // 몸과 마음에 남은 것
  const cap = hpCap(d);
  const hurt = (G.hurt || 0) * (done / 30) + (fr?.hurt || 0);
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
  let net = gold;
  if (rolls > 0 && !isTown(region)) {
    const a = ambush(d, SR.hostile.ambush.expedition);
    if (a) { journal.splice(journal.length - 1, 0, ...a.lines); net -= a.lost; }
  }
  xp = xpOf(d, xp);
  const levelUp = gainXp(d, xp);
  d.exp_start = null;
  d.exp_end = null;
  d.exp_region = null;
  const title = `${G.name} 원정${early ? ' (일찍 돌아옴)' : ''}`;
  d.exp_info = { last: { title, region, goal: info.goal || 'gather', journal, at: now } };
  if (F && fr) chron(d, 'choice', `${where} ${title}의 갈림길에서 '${F[info.fork.pick].label}'${info.fork.auto ? ' (저절로)' : ''} — ${fr.good ? '잘 풀렸다' : '일이 꼬였다'}.`, now);
  return { title, journal, lines, items, gold: net, xp, levelUp, minutes: Math.round(done) };
}

// ── 제작 ───────────────────────────────────────────
// 둥지의 대장장이가 있으면 기력이 30% 덜 듦
const craftEn = (d, r) => Math.ceil(r.en * (d.perks?.smith ? 0.7 : 1) * (titleMods(d).craftEn || 1) - 1e-9);
// have(id): 지금 가진 개수를 알려주는 함수 (저장 공간에서 읽음)
function craft(d, outId, have) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  const r = RECIPES.find((x) => x.out === outId);
  if (!r) return { error: '알 수 없는 제작법이다.' };
  const st = statsOf(d);
  if (st.wisdom < r.wis) return { error: `지혜가 ${r.wis} 이상이어야 만들 수 있다.` };
  const en = craftEn(d, r);
  if (d.en < en) return { error: `기력이 모자란다. (${en} 필요)` };
  for (const [id, n] of Object.entries(r.needs)) {
    if (have(id) < n) return { error: `${ITEMS[id].name}${josa(ITEMS[id].name, '이', '가')} 모자란다.` };
  }
  if (d.en >= enCap(d)) d.en_at = Date.now();
  d.en -= en;
  const items = Object.entries(r.needs).map(([id, n]) => ({ id, qty: -n }));
  items.push({ id: r.out, qty: 1 });
  traitCount(d, 'craft'); // 칭호: 제작 횟수
  let xp = 4 + Math.floor(r.en / 2);
  xp = xpOf(d, xp);
  const levelUp = gainXp(d, xp);
  const name = ITEMS[r.out].name;
  return { title: '제작', lines: [`${name}${josa(name, '을', '를')} 만들었다.`], items, made: [{ id: r.out, qty: 1 }], gold: 0, xp, levelUp };
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
function useItem(d, id, have) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  const it = ITEMS[id];
  if (!it || it.type !== 'use') return { error: '쓸 수 없는 물건이다.' };
  if (have(id) < 1) return { error: '가지고 있지 않다.' };
  const u = it.use;
  const lines = [];
  if (u.nestWard) {
    if (!d.nest || d.region !== d.nest) return { error: '둥지에 있을 때만 설치할 수 있다.' };
    const w = nestInfo(d).wards;
    if ((w[u.nestWard] || 0) >= NEST.wardMax) return { error: `${it.name}${josa(it.name, '은', '는')} 이미 ${NEST.wardMax}개 설치해 두었다.` };
    w[u.nestWard] = (w[u.nestWard] || 0) + 1;
    lines.push(u.nestWard === 'trap' ? '둥지 입구 바위틈에 가시 덫을 숨겨 두었다.' : '둥지 둘레에 결계석을 묻자, 룬이 희미하게 빛나기 시작했다.');
    lines.push(`설치한 ${it.name}: ${w[u.nestWard]}/${NEST.wardMax}`);
    return { title: it.name, lines, items: [{ id, qty: -1 }] };
  }
  if (u.buff) {
    const B = BUFFS[u.buff];
    const old = buffOf(d);
    combatJson(d).buff = { id: u.buff, until: Date.now() + BUFFS.minutes * 60000 };
    lines.push(`${BUFFS.minutes}분 동안 ${B.name} 상태가 된다. (사냥·강적 전투에서 ${B.desc})`);
    if (old && old.id !== u.buff) lines.push(`먼저 있던 ${old.name}의 효과는 사라졌다.`);
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
function equip(d, id, have) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  const it = ITEMS[id];
  if (!it || it.type !== 'equip') return { error: '착용할 수 없는 물건이다.' };
  if (have(id) < 1) return { error: '가지고 있지 않다.' };
  const eq = equipOf(d);
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
    closed: closed ? closed.error : null,
    proxy: d.stance === 'hostile' ? d.perks?.trader || null : null, // 대신 흥정하는 둥지 사람
    buy: shop.map((id) => ({ id, price: buyPrice(d, id) })),
    // 우호일 때만 보임. 평판이 모자라면 잠겨 있음
    special: d.stance === 'friendly'
      ? (SHOPS_SPECIAL[d.region] || []).map((id) => ({ id, price: buyPrice(d, id), locked: !specialOpen(d) }))
      : [],
    specialFrom: repTier(SR.friendly.specialFrom),
    sell: invList.filter((x) => ITEMS[x.item]).map((x) => ({ id: x.item, qty: x.qty, price: sellPrice(d, x.item) })),
  };
}

// 우호 드래곤이 거래하면 마을 평판은 오르고 용족 명성은 깎임
function friendlyTrade(d, lines) {
  if (d.stance !== 'friendly') return;
  addRep(d, d.region, 1);
  const f = addFame(d, SR.friendly.fameOnTrade);
  if (f) lines.push(f);
}

function buy(d, id, qty, have) {
  const err = marketCheck(d);
  if (err) return err;
  const special = (SHOPS_SPECIAL[d.region] || []).includes(id);
  if (!SHOPS[d.region].includes(id) && !special) return { error: '이 시장에서는 팔지 않는 물건이다.' };
  if (special && !specialOpen(d)) return { error: '이 물건은 마을과 더 친해져야 살 수 있다.' };
  qty = Math.max(1, Math.min(20, Math.floor(qty) || 1));
  const cost = buyPrice(d, id) * qty;
  if (d.gold < cost) return { error: `금화가 모자란다. (${cost}닢 필요)` };
  d.gold -= cost;
  const name = ITEMS[id].name;
  const lines = [`금화 ${cost}닢을 내고 ${name}${qty > 1 ? ` ${qty}개` : ''}${josa(qty > 1 ? '개' : name, '을', '를')} 샀다.`];
  friendlyTrade(d, lines);
  return { title: '시장', lines, items: [{ id, qty }] };
}

function sell(d, id, qty, have) {
  const err = marketCheck(d);
  if (err) return err;
  if (!ITEMS[id]) return { error: '알 수 없는 물건이다.' };
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
    addRep(d, d.region, -12);
    lines.push(addFame(d, SR.hostile.fameOnIntimidate) || '드래곤들 사이에 이름이 퍼진다.');
  } else {
    const dmg = Math.max(3, Math.round(randInt(8, 16) - st.scale * 0.3));
    d.hp = Math.max(1, d.hp - dmg);
    lines.push(`성벽 위 궁수들이 화살을 퍼부었다. 체력을 ${dmg} 잃고 물러났다.`);
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
  }
  return { title: '둥지', lines, gold: moving ? -NEST.moveCost : 0 };
}

// 어디서든 둥지로 곧장 날아감 (이웃 지역이 아니어도)
function flyHome(d) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  if (d.rest_at) return { error: RESTING };
  if (!d.nest) return { error: '아직 둥지가 없다.' };
  if (d.region === d.nest) return { error: '이미 둥지에 있다.' };
  if (d.ap < NEST.homeFlightAp) return { error: `행동력이 모자란다. (${NEST.homeFlightAp} 필요)` };
  spendAp(d, NEST.homeFlightAp);
  const from = d.region;
  d.region = d.nest;
  return { title: '둥지', lines: [`${REGIONS[d.nest].name}의 둥지로 곧장 날아왔다.`], from };
}

// 쉬기 시작과 끝. 속도가 바뀌기 전에 지금까지의 회복을 먼저 계산함
function startRest(d, now = Date.now()) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  if (d.rest_at) return { error: '이미 쉬고 있다.' };
  if (!d.nest || d.region !== d.nest) return { error: '둥지에 있을 때만 쉴 수 있다.' };
  regen(d, now);
  d.rest_at = now;
  return { title: '둥지', lines: ['둥지에 몸을 말고 눈을 감았다.'] };
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
    const p = Math.min(C.max, C.base + C.per1000 * (value / 1000)) * (d.perks?.guard ? RAID.guard : 1);
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
  const stacks = shuffle(hoard.filter((x) => x.qty > 0 && ITEMS[x.item])).slice(0, randInt(...RAID.stacks));
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
  if (d.hp < RULES.huntMinHp) return { error: '기운이 없어 쫓아갈 수 없다. 조금 쉬어야 한다.' };
  return null;
}

module.exports = {
  seasonAt, weatherOf, weatherIdAt, weatherFx, fxText, fxProse, weatherDebug, SLOT_MS,
  nestInfo, nestTier, maxKinOf, expandNest, checkRaid, raidView, chaseCheck,
  regen, gather, explore, hunt, startExpedition, finishExpedition, chooseFork, forkView, expInfo,
  craft, useItem, equip, unequip, statsOf, bonusOf, hpCap, enCap, apCap, equipOf, buffOf, giveBuff,
  repOf, setStance, marketInfo, buy, sell, intimidate,
  buildNest, flyHome, startRest, stopRest, hoardMove, hoardValue,
  actionCost, townArrows, hasBounty, addRep, addFame, craftEn, gainXp, spendStats,
  traitsOf, traitMods, hasTrait, chooseTraits, traitCount,
  check, spendAp, rollItem, bundle, itemLabel, xpOf, isTown, // 전투(game-combat.js)가 씀
  corruptedRegion, corruptUntil, isCorrupted, berserkOf, loseMind, nearestTown,
  placeOf, goPlace, isFallen, chron, chronOf,
  titlesOf, titleOn, titleName, titleMods, checkTitles, setTitle, titlesView,
};
