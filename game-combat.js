// 전투: 숨결·스킬·상태 이상이 있는 짧은 턴제 전투
// - 사냥: 자동 전투로 한 번에 끝남 (스킬은 알아서 씀)
// - 강적·결투장: 매 턴 직접 고름 (실시간 결투에서 시간을 넘기면 자동으로 고름)
// 전투 하나 = battle { kind, turn, a, b, log, over, winner }. a·b는 싸우는 쪽(fighter)
const {
  KIN, KIN_GROW, COMBAT, CRAFT, BREATHS, BREATH_COST, SKILLS, STATUS, ITEMS, RULES, STANCE_RULES, MIND, PLACES, PLACE_RULES, COMBOS, ENRAGE, RAID, BOSSES, BOSS, RUIN, REGIONS,
} = require('./game-data');
const logic = require('./game-logic');

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function josa(word, a, b) {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return `${a}(${b})`;
  return c % 28 ? a : b;
}
const ga = (f) => `${f.name}${josa(f.name, '이', '가')}`;
const eul = (f) => `${f.name}${josa(f.name, '을', '를')}`;

// ── 드래곤의 전투 설정 ─────────────────────────────
// 저장 공간에는 글자(JSON)로: { skills: [들고 가는 스킬], w, l (결투 전적), duelOn, autoDuel, lastAuto: {상대 id: 시각} }
function combatOf(d) {
  if (typeof d.combat === 'string' || !d.combat) {
    try { d.combat = JSON.parse(d.combat || '{}'); } catch { d.combat = {}; }
  }
  const c = d.combat;
  c.w ||= 0; c.l ||= 0; c.lastAuto ||= {};
  if (c.duelOn === undefined) c.duelOn = true;     // 결투 신청 받기 (기본: 켬)
  if (c.autoDuel === undefined) c.autoDuel = false; // 자동 결투 허용 (기본: 끔)
  return c;
}
const learned = (d) => Object.keys(SKILLS).filter((id) => SKILLS[id].lv <= d.level);
// 들고 가는 스킬: 고른 것 중 배운 것만. 고른 적이 없으면 COMBAT.defaultSkills 순서로 (배운 것만), 모자라면 배운 순서대로 채움
function loadout(d) {
  const c = combatOf(d);
  const have = learned(d);
  const pref = (COMBAT.defaultSkills || []).filter((id) => have.includes(id));
  const pickd = Array.isArray(c.skills) ? c.skills.filter((id) => have.includes(id)) : [...pref, ...have.filter((id) => !pref.includes(id))];
  return pickd.slice(0, COMBAT.maxSkills);
}
function setSkills(d, list) {
  if (!Array.isArray(list)) return { error: '스킬 목록이 이상하다.' };
  const have = learned(d);
  const ids = [...new Set(list.map(String))];
  if (ids.some((id) => !have.includes(id))) return { error: '아직 배우지 않은 스킬이 있다.' };
  if (ids.length > COMBAT.maxSkills) return { error: `스킬은 ${COMBAT.maxSkills}개까지 들고 갈 수 있다.` };
  combatOf(d).skills = ids;
  return { ok: true };
}
function setSettings(d, p) {
  const c = combatOf(d);
  if (typeof p.duelOn === 'boolean') c.duelOn = p.duelOn;
  if (typeof p.autoDuel === 'boolean') c.autoDuel = p.autoDuel;
  return { ok: true };
}

// ── 싸우는 쪽 만들기 ───────────────────────────────
// context: 'hunt'(지금 체력·기력으로, 사냥 특성이 붙음) / 'duel'(가득 찬 상태로, 다치지 않음)
function fromDragon(d, context) {
  const st = logic.statsOf(d);
  const tm = logic.traitMods(d);
  const hunt = context === 'hunt';
  let atk = st.claw + d.level * 1.5;
  if (hunt) {
    atk += tm.huntClaw;                                          // 특성: 타고난 사냥꾼
    if (d.stance === 'hostile') atk += STANCE_RULES.hostile.huntClaw; // 적대: 사냥에 거침없음
    if (d.perks?.knight) atk += 3;                               // 등에 탄 용기사
  }
  const ally = hunt && d.perks?.ally ? { ...d.perks.ally } : null; // 곁에 둔 새끼 드래곤 (결투에는 없음)
  const hpMax = logic.hpCap(d);
  const enMax = logic.enCap(d);
  // 강화 음식: 사냥·강적 전투에서만 (결투장에는 적용되지 않음)
  const bf = hunt ? logic.buffOf(d) : null;
  const ti = hunt ? logic.titleMods(d) : {}; // 칭호 효과 (결투장에는 없음)
  const love = hunt && logic.hooks.together?.(d) ? logic.BOND_TOGETHER.taken : 1; // 연인·반려와 함께 있으면 받는 피해가 줌
  const gm = hunt ? logic.gearMods(d) : null; // 희귀 장비의 특별한 효과 (결투장에는 없음)
  return {
    id: d.id, name: d.name, kind: d.kind, creature: false, av: d.has_avatar ? d.avatar_ver : 0, // 프로필 그림 (결투·진정에서 상대에게 보임)
    hp: hunt ? d.hp : hpMax, hp0: hunt ? d.hp : hpMax, hpMax, en: hunt ? d.en : enMax, enMax, // hp0: 싸움을 시작할 때의 체력 (잃은 체력 계산)
    atk: atk * (bf?.atk || 1) * (ti.atk || 1), def: st.scale, spd: st.wing + (bf?.spd || 0), mag: st.wisdom * (bf?.mag || 1), maj: st.majesty,
    taken: (hunt ? tm.huntDmg * (d.perks?.knight ? 0.7 : 1) * (ally?.guard ? KIN_GROW.shieldmate : 1) : 1) * (bf?.taken || 1) * (ti.taken || 1) * love * (gm?.taken || 1), // 받는 피해 배율 (등을 맡기는 새끼가 곁에 있으면 조금 덜)
    vsCorrupt: gm?.vsCorrupt || 1,
    healMult: (ti.heal || 1) * (gm?.heal || 1), // 칭호·희귀 장비(거둔 이삭의 관)
    coverK: gm?.cover || 1, raidAtk: gm?.raidAtk || 1, flankK: gm?.flank || 0, // 레이드 희귀 장비: 막아서기 피해, 레이드 보스에게 주는 피해, 우회 확률
    engrave: logic.engraveOf(d), // 장신구에 새긴 속성: 그 속성 공격 피해 배율
    buff: bf?.id || null,
    element: BREATHS[d.kind]?.element || null,
    breath: BREATHS[d.kind] ? d.kind : null,
    skills: loadout(d),
    weak: [], resist: [],
    st: {}, cd: {},
    ally,
  };
}
// 레벨별 사냥감 기본 세기. Lv12를 넘으면 레벨당 hpHigh·atkHigh가 더 붙음 (고레벨 구역)
const creatureMaj = (lv) => (COMBAT.creatureMaj ? COMBAT.creatureMaj.base + lv * COMBAT.creatureMaj.per : 6 + lv * 2);
// 지혜: 스킬 효과 배율 (사냥감은 1)
const wisK = (f) => (f.creature ? 1 : 1 + (f.mag || 0) * (COMBAT.wisSkill || 0));
function creatureBase(lv) {
  const K = COMBAT.creature;
  const hi = Math.max(0, lv - (K.highFrom || 12));
  return {
    hp: K.hp[0] + lv * K.hp[1] + hi * (K.hpHigh || 0),
    atk: K.atk[0] + lv * K.atk[1] + hi * (K.atkHigh || 0),
    def: K.def[0] + lv * K.def[1] + hi * (K.defHigh || 0),
  };
}
// place: 장소 id (사냥터 난이도 = 사냥감 레벨). corrupted: 오염된 땅의 몬스터 (조금 더 세고, 입힌 피해만큼 정신도 깎음)
// minion: 무리에 함께 나온 사냥감이면 이름 앞에 붙일 말 ('어린' 등). 체력·공격이 조금 낮음
// 멸망한 대륙에서 이겼을 때 드물게 나오는 것: 잿빛 심장, 보물, 희귀 장비
// (숨은 천장: 희귀 장비를 아직 하나도 얻지 못했는데 강적을 pity번 만났으면, 그다음 승리에서 반드시. 첫 장비 하나만 지켜 주고 그 뒤는 운)
function ruinFinds(d, kind, lines, place = null) {
  const out = [];
  const KS = RUIN.kingScale; // 왕룡의 금빛 비늘: 강적만 아주 드물게 (왕좌의 회랑에서는 사냥감도)
  const ksP = place === KS.place ? (kind === 'elite' ? KS.placeElite : KS.placeHunt) : (kind === 'elite' ? KS.elite : 0);
  if (ksP && Math.random() < ksP) {
    out.push(KS.id);
    lines.push(`검은 비늘 사이에서 단 한 장, 금빛을 잃지 않은 비늘이 떨어졌다… ${ITEMS[KS.id].name}!`);
    logic.chron(d, 'mark', `멸망한 대륙에서 ${ITEMS[KS.id].name}${josa(ITEMS[KS.id].name, '을', '를')} 얻었다.`);
  }
  if (Math.random() < RUIN.coreDrop[kind]) { out.push('ashen_core'); lines.push('식지 않은 잿빛 심장 하나가 재 속에서 뛰고 있었다.'); }
  if (Math.random() < RUIN.treasure[kind]) {
    const t = pick(RUIN.treasure.pool);
    out.push(t);
    lines.push(`잔해 속에서 ${ITEMS[t].name}${josa(ITEMS[t].name, '을', '를')} 찾았다! 둥지의 보물더미에 쌓아 두자.`);
    logic.chron(d, 'mark', `멸망한 대륙에서 보물 ${ITEMS[t].name}${josa(ITEMS[t].name, '을', '를')} 찾았다.`);
  }
  const c = logic.combatJson(d);
  const G = RUIN.gear;
  const firstYet = !G.pool.some((id) => c.dex?.i?.[id]); // 도감에 희귀 장비가 하나도 없음 = 아직 첫 장비 전
  if (Math.random() < G[kind] || (firstYet && c.ruinPity >= G.pity)) {
    const g = pick(G.pool);
    out.push(g);
    c.ruinPity = 0;
    lines.push(`쓰러진 몸 아래에서 오래된 장신구가 빛났다… ${ITEMS[g].name}!`);
    logic.chron(d, 'mark', `멸망한 대륙에서 희귀 장비 ${ITEMS[g].name}${josa(ITEMS[g].name, '을', '를')} 얻었다.`);
  }
  return out;
}
function fromCreature(place, elite, corrupted = false, minion = null) {
  const pl = PLACES[place];
  const cc = pl;
  const lv = pl.level + (elite ? 1 : 0);
  const K = COMBAT.creature; // 사냥터 난이도별 사냥감 세기
  const G = COMBAT.group;
  const DF = COMBAT.difficulty || { hp: 1, atk: 1 }; // 난이도 배율
  const CB = creatureBase(lv);
  const ruinMul = pl.hpMul ? (elite ? 1 + (pl.hpMul - 1) * (RUIN.eliteHp ?? 0.5) : pl.hpMul) : 1; // 멸망한 대륙: 체력이 훨씬 높음 (강적은 RUIN.eliteHp만큼만 적용해 잡을 길을 남김)
  const hpMax = Math.round(CB.hp * (elite ? K.eliteHp : 1) * (minion ? G.hp : 1) * DF.hp * ruinMul);
  const base = elite ? pl.elite : pl.creature;
  const scarK = logic.hooks.bossScar?.(pl.region) || 1; // 놓친 재앙이 휩쓸고 간 땅: 짐승들이 사나움
  // 무리의 말이 이름에 이미 들어 있으면 두 번 붙이지 않음 (예: '어린' + '어린 ○○')
  const name = minion && !base.startsWith(`${minion} `) ? `${minion} ${base}` : base;
  return {
    // 오염된 땅의 사냥감: '오염된 ○○' (본토의 오염된 지역, 그리고 땅 전체가 오염된 멸망한 대륙)
    id: null, name: (corrupted || REGIONS[pl.region]?.realm === 'ruin') && !name.startsWith('오염된 ') ? `오염된 ${name}` : name, kind: null, creature: true, region: pl.region, place, elite: !!elite, minion: !!minion, level: lv,
    type: (elite && pl.eliteType) || pl.type || null, // 화면 아이콘 계통
    corrupted, mindDrain: corrupted ? MIND.monster : 0,
    hp: hpMax, hpMax, en: 0, enMax: 0,
    atk: CB.atk * (elite ? K.eliteAtk : 1) * (corrupted ? MIND.monsterAtk : 1) * (minion ? G.atk : 1) * DF.atk * scarK, def: CB.def, spd: 6 + lv * 2, mag: 4 + lv * 2, maj: creatureMaj(lv),
    taken: 1, element: cc.special.element || null,
    breath: null, skills: [], special: cc.special,
    weak: cc.weak, resist: cc.resist,
    st: {}, cd: {},
  };
}
// 계절과 날씨: 그 지역의 날씨가 싸움에 끼치는 효과 (사냥·강적·재앙·도둑 쫓기. 결투장에는 없음)
// noHp: 사냥감 체력은 바꾸지 않음 (재앙은 모두가 함께 깎는 체력이라)
function weatherize(b, region, noHp = false) {
  const fx = logic.weatherFx(region);
  const w = logic.weatherOf(region);
  b.wx = { id: w.id, name: w.name };
  b.a.spd = Math.max(1, b.a.spd + fx.spd);
  b.a.taken *= fx.taken;
  b.a.elemW = fx.elem;
  for (const f of foesOf(b)) {
    f.atk *= fx.foeAtk;
    f.spd = Math.max(1, f.spd + fx.foeSpd);
    if (!noHp && fx.foeHp !== 1) { f.hpMax = Math.round(f.hpMax * fx.foeHp); f.hp = Math.round(f.hp * fx.foeHp); }
    f.elemW = fx.elem;
  }
  return b;
}
// extras: 함께 싸우는 다른 사냥감 (무리). 싸우는 상대 목록은 foes, 지금 노리는 상대는 b.b (= foes[target])
// 결투 보정: 두 드래곤의 수치를 둘의 가운데 쪽으로 당겨 격차를 COMBAT.duelGap 배로 줄임
const DUEL_KEYS = ['atk', 'def', 'spd', 'mag', 'maj', 'hpMax', 'enMax'];
function evenOut(a, b, k = COMBAT.duelGap) {
  if (a.creature || b.creature || !(k < 1)) return;
  for (const key of DUEL_KEYS) {
    if (typeof a[key] !== 'number' || typeof b[key] !== 'number') continue;
    const mid = (a[key] + b[key]) / 2;
    const round = key === 'hpMax' || key === 'enMax' ? Math.round : (x) => x;
    a[key] = round(mid + (a[key] - mid) * k);
    b[key] = round(mid + (b[key] - mid) * k);
  }
  for (const f of [a, b]) { f.hp = f.hpMax; f.hp0 = f.hpMax; f.en = f.enMax; f.swing = COMBAT.duelSwing; f.duel = true; } // 결투는 늘 가득 찬 채로 시작 (duel: 날개 효과를 결투용 값으로)
}
function newBattle(kind, a, b, extras = []) {
  if (kind === 'duel') evenOut(a, b);
  const bt = { kind, turn: 0, a, b, foes: [b, ...extras], target: 0, log: [], over: false, winner: null, fled: null };
  for (const f of [a, ...bt.foes]) if (f.creature) plan(f);
  return bt;
}
const alive = (f) => f.hp > 0;
const foesOf = (b) => b.foes || [b.b];
// 지금 노리는 상대. 쓰러졌으면 살아 있는 다음 상대로
function targetOf(b) {
  const foes = foesOf(b);
  let t = foes[b.target || 0];
  if (!t || t.hp <= 0) {
    const i = foes.findIndex(alive);
    b.target = i < 0 ? 0 : i;
    t = foes[b.target];
  }
  b.b = t;
  return t;
}

// ── 사냥감의 다음 행동 (화면에 미리 보여 줌) ──────
// 특기는 세 턴마다 (분노하면 두 턴마다). 다음 턴에 무엇을 할지 미리 정해 둔다
function plan(f) {
  const every = f.enraged ? ENRAGE.every : 3;
  f.since = f.since ?? 0;
  if (f.special && f.since >= every - 1) { f.next = { type: 'special' }; f.since = 0; }
  else { f.next = { type: 'attack' }; f.since += 1; }
}
const heavyOf = (s) => !s.self && (s.power || 0) * (s.hits || 1) >= 1.2;
// 미리 보이는 의도: kind(heavy·multi·debuff·self·attack), text, hint
function intentOf(f) {
  if (!f.creature || !f.next) return null;
  if (f.next.type !== 'special') return { kind: 'attack', text: `${ga(f)} 틈을 노리고 있다.`, hint: '평범한 공격이 온다.' };
  const s = f.special;
  if (s.self) return { kind: 'self', text: `${ga(f)} ${s.name}${josa(s.name, '으로', '로')} 몸을 굳히려 한다.`, hint: '다음 턴엔 공격이 덜 통한다. 지금 상태 이상을 걸어 두거나 기력을 아끼자.' };
  if (s.hits > 1) return { kind: 'multi', text: `${ga(f)} ${s.name}${josa(s.name, '으로', '로')} 연달아 덤벼들 기세다!`, hint: '방어하면 크게 줄이고 반격 기회를 얻는다. 돌풍으로 피해도 좋다.' };
  if (heavyOf(s)) return { kind: 'heavy', text: `${ga(f)} ${s.name}${josa(s.name, '을', '를')} 준비한다! 강한 한 방이 온다.`, hint: '방어하면 피해가 4분의 1로 줄고 반격 기회를 얻는다.' };
  return { kind: 'debuff', text: `${ga(f)} ${s.name}${josa(s.name, '을', '를')} 쓰려 한다.`, hint: '상태 이상이 따라온다. 방어하면 피해를 줄이고 반격 기회를 얻는다.' };
}

// ── 연계 ───────────────────────────────────────────
// 행동 id('attack' 또는 스킬 id)와 상대 상태로 연계가 되는지
function comboOf(foe, id) {
  for (const [key, c] of Object.entries(COMBOS)) {
    if (c.skill.includes(id) && c.when.some((k) => has(foe, k))) return { key, ...c };
  }
  return null;
}

// ── 한 턴 ──────────────────────────────────────────
// 행동: { type: 'attack' } / { type: 'skill', id: 'breath' 또는 스킬 id } / { type: 'guard' } / { type: 'flee' }
function skillOf(f, id) {
  if (id === 'breath' && f.breath) return { ...BREATHS[f.breath], ...BREATH_COST, name: BREATHS[f.breath].name, isBreath: true };
  return f.skills.includes(id) ? SKILLS[id] : null;
}
// 이 행동을 지금 쓸 수 있는지 (안 되면 이유)
function blocked(f, act) {
  if (act.type !== 'skill') return null;
  const s = skillOf(f, act.id);
  if (!s) return '쓸 수 없는 스킬이다.';
  if (f.cd[act.id] > 0) return `${s.name}${josa(s.name, '은', '는')} ${f.cd[act.id]}턴 뒤에 다시 쓸 수 있다.`;
  if (f.en < s.en) return `기력이 모자란다. (${s.en} 필요)`;
  return null;
}
const has = (f, k) => (f.st[k] || 0) > 0;
// 흠뻑 젖으면 굼떠짐 (속도 −30%: 늦게 움직이고, 잘 못 피하고, 급소를 잘 맞음)
const spdOf = (f) => f.spd * (has(f, 'soak') ? 0.7 : 1);

// 치유: 지혜(마력)가 높을수록, 최대 체력이 클수록 많이
const healAmount = (f, s) => Math.round((s.heal.base + f.mag * s.heal.mag + f.hpMax * s.heal.pct) * (f.healMult || 1));
const STATUS_LIST = (ks) => ks.map((k) => STATUS[k]).join('·');

// 피해 계산. magic: 숨결처럼 비늘을 덜 타는 공격
function damage(att, def, power, opt = {}) {
  const { magic = false, element = null, armorK = 0.5 } = opt; // armorK: 상대 비늘을 얼마나 받는지 (보통 공격 0.5, 함께 싸우는 새끼는 덜)
  let atk = att.atk * (has(att, 'weaken') ? 0.7 : 1) * (has(att, 'fury') ? 1.35 : 1); // 역린
  let armor = def.def * (has(def, 'acid') ? 0.5 : 1);
  let raw = magic ? (att.mag * 1.0 + atk * 0.5) * power - armor * 0.25 : atk * power - armor * armorK;
  raw *= att.swing ? rand(1 - att.swing, 1 + att.swing) : rand(0.85, 1.15); // 결투는 흔들림이 더 커서 약한 쪽에도 기회가 생김
  let note = '';
  if (element && att.elemW?.[element]) raw *= att.elemW[element]; // 날씨: 비에는 불이 약해지고 번개가 세짐
  if (element && att.engrave?.[element]) raw *= att.engrave[element]; // 장신구 각인
  if (def.corrupted && att.vsCorrupt) raw *= att.vsCorrupt; // 희귀 장비: 오염된 적에게
  if (element && def.weak.includes(element)) { raw *= 1.5; note = ' 약점을 찔렀다!'; }
  if (element && def.resist.includes(element)) { raw *= 0.5; note = ' 잘 통하지 않는다.'; }
  const WC = att.duel || def.duel ? COMBAT.wingDuel.crit : COMBAT.wingCrit;
  const crit = !magic && (opt.crit || Math.random() < WC.base + Math.max(0, spdOf(att) - spdOf(def)) * WC.per); // 날개(속도)가 높을수록 급소 (결투는 따로)
  if (crit) { raw *= 1.5; note += ' 급소를 찔렀다!'; }
  if (def.guarding) raw *= opt.special ? 0.25 : 0.5; // 예고된 특기를 방어하면 4분의 1
  if (has(def, 'harden')) raw *= 0.5;
  if (has(def, 'stone')) raw *= 0.7; // 브론즈: 돌 비늘
  if (has(def, 'acid')) raw *= 1.15; // 비늘이 녹으면 받는 피해도 늘어남 (산 숨결)
  if (has(def, 'fury')) raw *= 1.1;    // 역린: 받는 피해도 늘어남
  if (has(def, 'exposed')) raw *= 1.25; // 하늘 낙하 뒤의 빈틈
  raw *= def.taken;
  return { dmg: Math.max(1, Math.round(raw)), note };
}
// 피하기: 날개(속도) 차이와 안개·돌풍
// 빗나감: 돌풍(다음 한 번) · 흙먼지(공격하는 쪽이 앞을 못 봄) · 속도와 안개로 피하기가 겹쳐도
// 한 번 공격이 빗나갈 확률은 모두 합쳐 COMBAT.dodgeCap까지 (겹쳐 쌓여 한 대도 못 맞히는 일이 없게)
function dodged(att, def, lines) {
  const gust = has(def, 'dodge') ? COMBAT.gustDodge : 0;
  if (gust) def.st.dodge = 0; // 돌풍: 다음 공격 한 번
  const blind = has(att, 'blind') ? 0.25 : 0; // 흙먼지
  const WD = att.duel || def.duel ? COMBAT.wingDuel.dodge : COMBAT.wingDodge; // 날개(속도) 차이로 피하기 (결투는 따로)
  const evade = has(def, 'soak') ? 0.02 : clamp(WD.base + (spdOf(def) - spdOf(att)) * WD.per, WD.min, WD.max) + (has(def, 'evade') ? 0.4 : 0);
  // 연속 빗나감 보호: 이 공격자가 COMBAT.missRun번 연달아 빗나갔으면 이번엔 반드시 맞음 (돌풍은 써 버린 채로)
  const miss = (att.missRun || 0) >= (COMBAT.missRun ?? 99) ? 0 : Math.min(COMBAT.dodgeCap ?? 1, 1 - (1 - gust) * (1 - blind) * (1 - Math.min(1, evade)));
  if (Math.random() >= miss) {
    att.missRun = 0;
    if (gust) lines.push(`${ga(def)} 돌풍을 탔지만 공격이 스쳤다.`);
    return false;
  }
  // 어느 쪽으로 빗나갔는지는 각각의 몫에 비례해 고름 (문장만 다름)
  att.missRun = (att.missRun || 0) + 1;
  const w = [gust, blind, evade], r = Math.random() * (gust + blind + evade);
  if (r < w[0]) lines.push(`${ga(def)} 돌풍을 타고 공격을 흘려보냈다.`);
  else if (r < w[0] + w[1]) lines.push(`${ga(att)} 앞이 보이지 않아 헛손질했다.`);
  else lines.push(`${ga(def)} 날렵하게 피했다.`);
  return true;
}
// 상태 이상 걸기 (저항하는 속성이면 통하지 않음)
// 위엄: 드래곤이 얼어붙음·마비를 기세로 떨쳐 냄 (떨쳐 냈으면 true)
function resisted(def, lines, k) {
  const MR = COMBAT.majResist;
  if (def.creature || !MR || Math.random() >= Math.min(MR.max, (def.maj || 0) * MR.per)) return false;
  lines.push(`${ga(def)} 기세로 버텨 내 ${STATUS[k]}에 빠지지 않았다.`);
  return true;
}
// 위압: 드래곤의 위엄이 상대(드래곤·사냥감·강적·도둑)보다 높으면 그만큼 상대가 거는 상태 이상을 떨쳐 냄 (떨쳐 냈으면 true)
function pressed(att, def, lines, k) {
  const P = COMBAT.majPress;
  if (!P || !att || def.creature) return false; // 떨쳐 내는 건 드래곤뿐
  const p = Math.min(P.max, Math.max(0, ((def.maj || 0) - (att.maj || 0)) * P.per));
  if (!(p > 0) || Math.random() >= p) return false;
  lines.push(`${ga(def)} 위엄으로 ${att.name}${josa(att.name, '을', '를')} 눌러 ${STATUS[k]}에 빠지지 않았다.`);
  return true;
}
function applyDebuff(att, def, debuff, chance, element, lines) {
  if (!debuff) return;
  if (element && def.resist.includes(element)) return;
  if (chance != null && Math.random() >= chance) return;
  if (pressed(att, def, lines, Object.keys(debuff)[0])) return; // 위압: 위엄이 높은 쪽은 상태 이상을 떨쳐 냄
  // 위엄: 드래곤은 기세로 얼어붙음·마비를 떨쳐 내고, 지속 피해를 한 턴 짧게 버팀
  const MR = COMBAT.majResist;
  const resist = !def.creature && MR ? Math.min(MR.max, (def.maj || 0) * MR.per) : 0;
  for (let [k, n] of Object.entries(debuff)) {
    if ((k === 'freeze' || k === 'stun') && resisted(def, lines, k)) continue;
    if (resist && (k === 'burn' || k === 'poison' || k === 'bleed') && n > 1 && Math.random() < resist) n -= 1;
    // 지혜: 드래곤이 거는 상태 이상이 확률로 한 턴 더 감 (확률 = 지혜 × per, 최대 max. 얼어붙음·마비는 빼고)
    const WL = COMBAT.wisLinger;
    const longer = !!WL && !att.creature && !WL.skip.includes(k) && Math.random() < Math.min(WL.max, (att.mag || 0) * WL.per);
    if (longer) n += 1;
    def.st[k] = Math.max(def.st[k] || 0, n);
    // 지속 피해는 건 쪽의 힘으로 정해짐. 사냥감(사냥·강적·도둑)은 비늘로 막히지 않는 피해라 기울기를 COMBAT.creatureDot배로 (대륙의 재앙은 그대로)
    const dot = att.creature && !att.boss ? (COMBAT.creatureDot ?? 1) : 1;
    if (k === 'burn') def.st.burnDmg = Math.round(3 + att.mag * 0.3 * dot);
    if (k === 'poison') def.st.poisonDmg = Math.round(3 + att.mag * 0.35 * dot); // 독: 바로 주는 피해가 약한 대신 지속 피해는 화상보다 조금 세게
    if (k === 'bleed') def.st.bleedDmg = Math.round(2 + att.atk * 0.15);
    lines.push(`${ga(def)} ${STATUS[k]} 상태가 되었다.${longer ? ' (지혜로 한 턴 더)' : ''}`);
  }
}
function hit(att, def, power, opt, lines, verb) {
  if (dodged(att, def, lines)) return 0;
  let extra = '';
  if (has(att, 'opening')) { power *= 1.5; att.st.opening = 0; extra = ' 틈을 찔렀다!'; } // 방어로 얻은 반격 기회
  const { dmg, note } = damage(att, def, power, opt);
  def.hp = Math.max(0, def.hp - dmg);
  lines.push(`${verb} ${dmg}의 피해를 입혔다.${extra}${note}`);
  if (opt.special && def.guarding && def.hp > 0 && !def.creature) {
    def.st.opening = 2;
    lines.push(`${ga(def)} 공격을 받아 내고 틈을 보았다! (다음 공격 ×1.5)`);
  }
  if (att.mindDrain && !def.creature) def.mindLoss = (def.mindLoss || 0) + dmg * att.mindDrain; // 오염된 몬스터
  return dmg;
}

function perform(b, f, foe, act, lines) {
  f.guarding = false;
  if (has(f, 'freeze')) { lines.push(`${ga(f)} 얼어붙어 움직이지 못했다.`); return; }
  if (has(f, 'stun')) { lines.push(`${ga(f)} 마비되어 움직이지 못했다.`); return; }
  if (act.type === 'flee') {
    b.over = true; b.fled = f; b.winner = foe;
    lines.push(f.creature ? `${ga(f)} 달아났다.` : b.kind === 'duel' ? `${ga(f)} 고개를 숙이고 물러났다. 결투를 포기했다.` : `${ga(f)} 싸움을 멈추고 물러났다.`);
    return;
  }
  if (act.type === 'guard') {
    f.guarding = true;
    f.en = Math.min(f.enMax, f.en + 3);
    lines.push(`${ga(f)} 몸을 웅크리고 방어 자세를 취했다.`);
    return;
  }
  if (act.type === 'special') {
    const s = f.special;
    if (s.self) { for (const [k, n] of Object.entries(s.self)) f.st[k] = n; lines.push(`${ga(f)} ${s.name}${josa(s.name, '으로', '로')} 몸을 단단히 했다.`); return; }
    let dealt = 0;
    for (let i = 0; i < (s.hits || 1); i++) dealt += hit(f, foe, s.power, { element: s.element, special: true }, lines, `${ga(f)} ${s.name}!`);
    if (dealt) applyDebuff(f, foe, s.debuff, s.chance, s.element, lines);
    return;
  }
  if (act.type === 'skill') {
    const why = blocked(f, act);
    if (why) act = { type: 'attack' };
    else {
      const s = skillOf(f, act.id);
      f.en -= s.en;
      (f.used ||= []).push(s.name);
      f.cd[act.id] = s.cd + 1; // 이번 턴 끝에 하나 줄어듦
      if (s.self) for (const [k, n] of Object.entries(s.self)) f.st[k] = n;
      if (s.enGain) { const before = f.en; f.en = Math.min(f.enMax, f.en + Math.round(s.enGain * wisK(f))); lines.push(`${ga(f)} 숨을 깊이 골랐다. 기력을 ${Math.round(f.en - before)} 되찾았다.`); }
      if (s.heal) {
        const h = healAmount(f, s);
        const before = f.hp;
        f.hp = Math.min(f.hpMax, f.hp + h);
        lines.push(`${ga(f)} 치유 마법을 펼쳤다! 상처가 빛 속에 아물며 체력을 ${Math.round(f.hp - before)} 되찾았다.`);
        if (s.cleanse) {
          const gone = ['burn', 'poison', 'bleed'].filter((k) => has(f, k));
          for (const k of gone) f.st[k] = 0;
          if (gone.length) lines.push(`${STATUS_LIST(gone)}${josa(STATUS[gone[gone.length - 1]], '이', '가')} 씻겨 나갔다.`);
        }
        return;
      }
      if (s.power) {
        const cb = comboOf(foe, act.id);
        const pw = s.power * (cb?.key === 'shatter' ? 2 : 1);
        if (cb) lines.push(`연계! ${cb.name}`);
        let dealt = 0;
        for (let i = 0; i < (s.hits || 1) && foe.hp > 0; i++) {
          dealt += hit(f, foe, pw, { magic: !!s.isBreath, element: s.isBreath ? s.element : null, crit: cb?.key === 'vital' || !!cb?.crit }, lines, i ? '또 한 번' : `${ga(f)} ${s.name}!`);
        }
        // 땅울림: 무리의 다른 적에게도 같은 피해와 상태 (결투에서는 상대 하나)
        if (s.aoe && f === b.a) {
          for (const o of foesOf(b)) {
            if (o === foe || !alive(o)) continue;
            if (hit(f, o, s.power, {}, lines, `땅이 흔들려 ${o.name}에게도`)) applyDebuff(f, o, s.debuff, s.chance, null, lines);
          }
        }
        if (dealt && cb) comboAfter(f, foe, cb, lines);
        // 숨결은 무리의 다른 적에게도 번짐 (피해 일부, 상태 이상은 없음)
        if (s.isBreath && f === b.a && foesOf(b).length > 1) {
          for (const o of foesOf(b)) if (o !== foe && alive(o)) hit(f, o, s.power * COMBAT.group.splash, { magic: true, element: s.element }, lines, `숨결이 번져 ${o.name}에게도`);
        }
        if (dealt) {
          if (s.drain) { const h = Math.round(dealt * s.drain * wisK(f)); f.hp = Math.min(f.hpMax, f.hp + h); lines.push(`${ga(f)} 체력을 ${h} 되찾았다.`); }
          if (s.cleanse) { // 퍼플: 나쁜 상태 하나를 씻어 냄
            const bad = ['burn', 'poison', 'bleed', 'weaken', 'acid', 'soak'].find((k) => has(f, k));
            if (bad) { f.st[bad] = 0; lines.push(`보랏빛 결정이 ${STATUS[bad]}${josa(STATUS[bad], '을', '를')} 씻어 냈다.`); }
          }
          const chance = s.majesty ? clamp(0.5 + (f.maj - foe.maj) * 0.04, 0.2, 0.95) : s.chance != null && !s.isBreath ? Math.min(0.95, s.chance * wisK(f)) : s.chance; // 스킬의 확률은 지혜로 (숨결은 그대로)
          applyDebuff(f, foe, s.debuff, chance, s.isBreath ? s.element : null, lines);
        }
      } else {
        if (!s.enGain) lines.push(`${ga(f)} ${s.name}!`);
        if (s.debuff) {
          // 위엄으로 거는 것(포효)은 적이 여럿이면 모두에게
          const targets = s.majesty && f === b.a ? foesOf(b).filter(alive) : [foe];
          for (const t of targets) {
            const chance = s.majesty ? clamp(0.5 + (f.maj - t.maj) * 0.04, 0.2, 0.95) : s.chance;
            const before = lines.length;
            applyDebuff(f, t, s.debuff, chance, null, lines);
            if (lines.length === before) lines.push(`${ga(t)} 꿈쩍도 하지 않았다.`);
          }
        }
        if (s.self) lines.push(...Object.keys(s.self).map((k) => `${ga(f)} ${STATUS[k]} 상태가 되었다.`));
      }
      return;
    }
  }
  const cb = f.creature ? null : comboOf(foe, 'attack');
  if (cb) lines.push(`연계! ${cb.name}`);
  const dealt = hit(f, foe, 1, { crit: cb?.key === 'vital' }, lines, `${ga(f)} 할퀴어`);
  if (dealt && cb) comboAfter(f, foe, cb, lines);
}
// 연계의 뒤따르는 효과
function comboAfter(f, foe, cb, lines) {
  if (cb.key === 'shatter') { foe.st.freeze = 0; foe.st.brittle = 0; lines.push(`${foe.name}의 몸을 덮은 얼음이 산산조각 났다!`); }
  if (cb.key === 'vital') { foe.st.dazed = 0; }
  if (cb.key === 'surge' && foe.hp > 0 && (resisted(foe, lines, 'stun') || pressed(f, foe, lines, 'stun'))) { foe.st.soak = 0; }
  else if (cb.key === 'surge' && foe.hp > 0) { foe.st.stun = Math.max(foe.st.stun || 0, foe.acted === f.turnNow ? 2 : 1); foe.st.soak = 0; lines.push(`${ga(foe)} 젖은 몸으로 미끄러져 넘어졌다! (한 턴 마비)`); }
  if (cb.key === 'wildfire' && foe.hp > 0) {
    const n = foe.st.burnDmg || 3;
    foe.hp = Math.max(0, foe.hp - n);
    foe.st.burn = (foe.st.burn || 0) + 3;
    lines.push(`불길이 번져 ${ga(foe)} ${n}의 화상 피해를 더 입었다. (화상 3턴 연장)`);
  }
  if (cb.key === 'flay') { foe.st.bleedDmg = (foe.st.bleedDmg || 3) * 2; foe.st.bleed = Math.max(foe.st.bleed || 0, 3); lines.push(`녹은 비늘 사이로 상처가 깊게 벌어졌다. (출혈 피해 ×2)`); }
  // 독 터뜨리기: 남은 중독 피해를 한꺼번에 (× mult) 주고 중독은 끝남. 짧은 결투에서도 독이 제 몫을 하게
  if (cb.key === 'spread' && foe.hp > 0) {
    const n = Math.round((foe.st.poisonDmg || 3) * Math.max(1, foe.st.poison || 0) * (COMBOS.spread.mult || 1.5));
    foe.hp = Math.max(0, foe.hp - n);
    foe.st.poison = 0;
    lines.push(`몸속에 퍼진 독이 한꺼번에 터졌다! ${ga(foe)} ${n}의 독 피해를 입었다.`);
  }
}

// 턴 끝: 지속 피해, 상태와 재사용 대기 줄이기, 기력 조금 회복
function endOfTurn(f, lines) {
  for (const [k, label] of [['burn', '불길'], ['poison', '독'], ['bleed', '상처']]) {
    if (has(f, k) && f.hp > 0) {
      const n = f.st[`${k}Dmg`] || 3;
      f.hp = Math.max(0, f.hp - n);
      lines.push(`${ga(f)} ${label}에 ${n}의 피해를 입었다.`);
    }
  }
  // 얼어붙음·마비가 풀리는 턴: 다음 턴까지 '얼음 금'·'휘청임'이 남아 연계를 이을 수 있음
  if (f.st.freeze === 1 && f.hp > 0) f.st.brittle = 2;
  if (f.st.stun === 1 && f.hp > 0) f.st.dazed = 2;
  for (const k of Object.keys(STATUS)) if (f.st[k] > 0 && k !== 'dodge') f.st[k] -= 1;
  for (const k of Object.keys(f.cd)) if (f.cd[k] > 0) f.cd[k] -= 1;
  if (!f.creature) f.en = Math.min(f.enMax, f.en + COMBAT.enPerTurn);
}

// 쓰러진 쪽을 알리고, 싸움이 끝났는지 봄
function checkDown(b, lines) {
  for (const f of [b.a, ...foesOf(b)]) {
    if (f.hp <= 0 && !f.down) { f.down = true; lines.push(`${ga(f)} 쓰러졌다.`); }
  }
  if (b.over) return;
  if (b.a.hp <= 0) { b.over = true; b.winner = foesOf(b).find(alive) || b.b; }
  else if (!foesOf(b).some(alive)) { b.over = true; b.winner = b.a; }
}
// 한 턴을 치름. 빠른 쪽이 먼저 움직임 (적이 여럿이면 저마다 한 번씩)
// actA.t: 노릴 적의 순번 (무리와 싸울 때). actB: 결투 상대의 행동 (사냥감은 미리 정해 둔 행동을 씀)
// 곁에 둔 새끼 드래곤의 공격 (사냥·강적·재앙. 결투에는 나오지 않음)
function allyStrike(b, ally, lines) {
  const foe = targetOf(b);
  if (!foe || foe.hp <= 0) return;
  const A = KIN.drakeHelp.ally;
  const att = { name: ally.name, atk: ally.atk, mag: 0, spd: 0, maj: 0, st: {}, level: 1, taken: 1 };
  const dealt = hit(att, foe, ally.hunter ? A.hunterPower : A.power, { armorK: A.armor ?? 0.5 }, lines, `${ga(att)} 함께 덤벼들었다!`);
  b.allyHits = (b.allyHits || 0) + 1; // 함께 싸운 셈 (끝날 때 자람 기록으로)
  if (dealt && ally.clever && foe.hp > 0 && Math.random() < A.cleverDaze) {
    foe.st.dazed = Math.max(foe.st.dazed || 0, 2);
    lines.push(`영리한 ${ally.name}${josa(ally.name, '이', '가')} 빈틈을 파고들어 ${foe.name}${josa(foe.name, '이', '가')} 휘청인다.`);
  }
}
function round(b, actA, actB) {
  if (b.over) return [];
  b.turn += 1;
  const foes = foesOf(b);
  for (const f of [b.a, ...foes]) f.guarding = false; // 지난 턴의 방어는 이번 턴에 이어지지 않음
  if (actA && Number.isInteger(actA.t) && foes[actA.t] && alive(foes[actA.t])) b.target = actA.t;
  targetOf(b);
  const lines = [];
  // 방어·비늘 세우기처럼 몸을 지키는 행동은 먼저 (예고를 보고 막을 수 있게). 나머지는 빠른 쪽이 먼저
  const guardish = (f, act) => !!act && (act.type === 'guard' || (act.type === 'skill' && !blocked(f, act) && (() => { const sk = skillOf(f, act.id); return sk && sk.self && !sk.power && !sk.heal; })()));
  const actors = [{ f: b.a, act: actA, side: 'a' }, ...foes.filter(alive).map((f) => ({ f, act: f.creature ? (f.next || { type: 'attack' }) : actB, side: 'b' }))];
  for (const x of actors) { x.pri = guardish(x.f, x.act) ? 1 : 0; x.sp = spdOf(x.f) + rand(0, (x.f.duel ? COMBAT.wingDuel.initSwing : COMBAT.initSwing) ?? 3); }
  actors.sort((p, q) => q.pri - p.pri || q.sp - p.sp);
  for (const x of actors) {
    const f = x.f;
    if (b.over || f.hp <= 0) continue;
    const foe = x.side === 'a' ? targetOf(b) : b.a;
    f.turnNow = b.turn;
    perform(b, f, foe, x.act || { type: 'attack' }, lines);
    f.acted = b.turn; // 이번 턴에 이미 움직였음 (넘어뜨리기가 다음 턴까지 이어지게)
    checkDown(b, lines);
    if (x.side === 'a' && f.ally && !b.over) { allyStrike(b, f.ally, lines); checkDown(b, lines); } // 곁에 둔 새끼가 뒤이어 덤벼듦
  }
  if (!b.over) {
    endOfTurn(b.a, lines);
    for (const f of foes) if (alive(f)) endOfTurn(f, lines);
    checkDown(b, lines);
  }
  // 강적의 분노: 체력이 절반 아래로 떨어지면 한 번
  for (const f of foes) {
    if (!b.over && f.creature && f.elite && !f.enraged && f.hp > 0 && f.hp <= f.hpMax * ENRAGE.below) {
      f.enraged = true;
      f.atk *= ENRAGE.atk;
      f.since = Math.max(f.since || 0, ENRAGE.every - 1); // 곧바로 특기를 노림
      lines.push(`${ga(f)} 분노했다! 눈빛이 붉게 타오르고, 공격이 거세진다.`);
    }
  }
  if (!b.over) for (const f of [b.a, ...foes]) if (f.creature && alive(f)) plan(f);
  const maxTurns = b.maxTurns || (foes.length > 1 ? COMBAT.group.maxTurns : COMBAT.maxTurns);
  if (!b.over && b.turn >= maxTurns && b.boss) {
    // 재앙: 정해진 턴만큼 싸우면 물러남 (입힌 피해는 모두의 몫으로 남음)
    b.over = true;
    b.fled = b.a;
    b.winner = targetOf(b);
    lines.push(`${ga(b.winner)} 크게 포효하며 날개를 펼쳤다. 숨을 고르러 물러난다. 입힌 상처는 그대로 남는다.`);
  } else if (!b.over && b.turn >= maxTurns) {
    b.over = true;
    const sum = (k) => foes.reduce((n, f) => n + Math.max(0, f[k]), 0);
    b.winner = b.a.hp / b.a.hpMax >= sum('hp') / sum('hpMax') ? b.a : targetOf(b);
    lines.push(`해가 기울도록 승부가 나지 않았다. 더 버틴 ${ga(b.winner)} 이겼다.`);
  }
  targetOf(b);
  b.log.push({ turn: b.turn, lines });
  return lines;
}

// ── 자동으로 고르기 ────────────────────────────────
// reserve: 이만큼의 기력은 남겨 둠 (자동 사냥). flee: 체력이 이 비율 아래면 물러남
function aiPick(f, foe, { reserve = 0, flee = 0, danger: danger0, many = false } = {}) {
  if (f.creature) return f.next || { type: 'attack' }; // 미리 정해 둔 행동
  if (flee && f.hp < f.hpMax * flee) return { type: 'flee' };
  const can = (id) => {
    const s = skillOf(f, id);
    return s && !(f.cd[id] > 0) && f.en - s.en >= reserve;
  };
  const hpr = f.hp / f.hpMax;
  if (hpr < 0.4 && can('mend')) return { type: 'skill', id: 'mend' }; // 위험하면 숨결보다 치유 먼저
  // 예고된 강한 특기: 비늘을 세우거나 방어 (danger: 무리 중 누군가가 준비 중)
  const heavyNext = (x) => x.creature && x.next?.type === 'special' && x.special && heavyOf(x.special);
  const danger = danger0 ?? (heavyNext(foe) ? foe : null);
  if (danger) {
    if (can('harden') && !has(f, 'harden')) return { type: 'skill', id: 'harden' };
    if (hpr < 0.8 || danger.special.hits > 1) return { type: 'guard' };
  }
  // 연계가 되는 스킬이 있으면 먼저
  for (const id of f.skills) if (can(id) && comboOf(foe, id)) return { type: 'skill', id };
  if (comboOf(foe, 'attack')?.key === 'vital' && has(foe, 'stun')) return { type: 'attack' };
  const br = f.breath && BREATHS[f.breath];
  if (br && can('breath') && !foe.resist.includes(br.element)) {
    const debuffKey = br.debuff && Object.keys(br.debuff)[0];
    if (!debuffKey || !has(foe, debuffKey) || br.power >= 1.3) return { type: 'skill', id: 'breath' };
  }
  const hurt = ['burn', 'poison', 'bleed'].some((k) => has(f, k));
  if (can('mend') && (hpr < 0.5 || (hurt && hpr < 0.75))) return { type: 'skill', id: 'mend' };
  if (hpr < 0.45 && can('harden') && !has(f, 'harden')) return { type: 'skill', id: 'harden' };
  if (hpr < 0.6 && can('devour')) return { type: 'skill', id: 'devour' };
  if (can('roar') && !has(foe, 'weaken')) return { type: 'skill', id: 'roar' };
  if (can('rend') && !has(foe, 'bleed')) return { type: 'skill', id: 'rend' };
  // 새 스킬들
  if (can('quake') && (many || Math.random() < 0.3)) return { type: 'skill', id: 'quake' };
  if (can('focus') && f.en < 8) return { type: 'skill', id: 'focus' };
  if (can('fury') && !has(f, 'fury') && hpr > 0.6) return { type: 'skill', id: 'fury' };
  if (can('dive') && (has(foe, 'blind') || foe.hp / foe.hpMax < 0.5) && hpr > 0.35) return { type: 'skill', id: 'dive' };
  if (can('dust') && !has(foe, 'blind') && Math.random() < 0.6) return { type: 'skill', id: 'dust' };
  if (can('headbutt') && !has(foe, 'stun') && !has(foe, 'dazed') && Math.random() < 0.6) return { type: 'skill', id: 'headbutt' };
  if (can('flurry')) return { type: 'skill', id: 'flurry' };
  if (can('gust') && !has(f, 'dodge') && Math.random() < 0.5) return { type: 'skill', id: 'gust' };
  if (can('tail')) return { type: 'skill', id: 'tail' };
  return { type: 'attack' };
}
// 내 쪽을 자동으로: 무리면 연계가 되는 적, 아니면 가장 약해진 적을 노림
function autoAct(b, opt = {}) {
  const f = b.a;
  const live = foesOf(b).filter(alive);
  if (live.length <= 1) return aiPick(f, targetOf(b), opt);
  const heavy = live.find((x) => x.next?.type === 'special' && x.special && heavyOf(x.special)) || null;
  let t = live.find((x) => [...(f.breath ? ['breath'] : []), ...f.skills, 'attack'].some((id) => comboOf(x, id)))
    || live.reduce((m, x) => (x.hp / x.hpMax < m.hp / m.hpMax ? x : m), live[0]);
  // 여럿에게 둘러싸이면 조금 더 일찍 물러남
  const act = aiPick(f, t, { ...opt, danger: heavy, many: true, flee: opt.flee ? opt.flee + 0.08 * (live.length - 1) : 0 });
  return { ...act, t: foesOf(b).indexOf(t) };
}
function runAuto(b, optA = {}, optB = {}) {
  b.a.turnCount = 0; b.b.turnCount = 0;
  while (!b.over) round(b, autoAct(b, optA), b.b.creature ? null : aiPick(b.b, b.a, optB));
  return b;
}

// 화면에 보낼 모습. me: 내 쪽('a'/'b'). 상대의 스킬 구성은 보이지 않음
function fighterView(f, mine) {
  const v = {
    name: f.name, kind: f.kind, creature: f.creature, elite: !!f.elite, id: f.id, type: f.type || null, region: f.region || null, av: f.av || 0,
    hp: Math.round(f.hp), hpMax: f.hpMax, en: Math.round(f.en), enMax: f.enMax,
    st: Object.fromEntries(Object.keys(STATUS).filter((k) => f.st[k] > 0).map((k) => [k, f.st[k]])),
    weak: f.weak, resist: f.resist,
    enraged: !!f.enraged, down: f.hp <= 0, minion: !!f.minion,
  };
  if (mine) {
    v.skills = [
      ...(f.breath ? [{ id: 'breath', name: BREATHS[f.breath].name, en: BREATH_COST.en, cd: f.cd.breath || 0 }] : []),
      ...f.skills.map((id) => ({ id, name: SKILLS[id].name, en: SKILLS[id].en, cd: f.cd[id] || 0 })),
    ];
  }
  return v;
}
const INTENT_RANK = { heavy: 4, multi: 3, debuff: 2, self: 1, attack: 0 };
function view(b, me = 'a') {
  const foeF = me === 'a' ? targetOf(b) : b.a;
  const mv = fighterView(b[me], true);
  // 지금 쓰면 연계가 되는 행동 (노리는 적 기준)
  for (const sk of mv.skills || []) { const c = comboOf(foeF, sk.id); if (c) sk.combo = c.name; }
  const ac = comboOf(foeF, 'attack');
  if (ac) mv.attackCombo = ac.name;
  const foes = foesOf(b);
  const multi = me === 'a' && foes.length > 1;
  // 무리: 적마다의 모습과 다음 행동. 맨 위 예고는 가장 위험한 것
  const list = multi ? foes.map((f, i) => ({ ...fighterView(f, false), i, intent: b.over || f.hp <= 0 ? null : intentOf(f) })) : null;
  let intent = b.over ? null : intentOf(foeF);
  if (multi && !b.over) intent = list.filter((x) => x.intent).map((x) => x.intent).sort((p, q) => INTENT_RANK[q.kind] - INTENT_RANK[p.kind])[0] || null;
  return {
    kind: b.kind, turn: b.turn, maxTurns: b.maxTurns || (foes.length > 1 ? COMBAT.group.maxTurns : COMBAT.maxTurns), over: b.over, boss: !!b.boss, weather: b.wx || null,
    me: mv, foe: fighterView(foeF, false),
    foes: list, target: multi ? b.target : null,
    intent,
    won: b.over ? b.winner === b[me] : null,
    fled: b.over && b.fled ? (b.fled === b[me] ? 'me' : 'foe') : null,
    log: b.log.slice(-1)[0]?.lines || [],
  };
}

// ── 사냥 ───────────────────────────────────────────
// 평범한 사냥: 자동 전투로 한 번에. 레벨 2부터 가끔 강적이 길을 막음 (그때는 battle을 돌려주고, 직접 싸움)
const debug = { forceElite: null }; // 시험용: true/false로 강적 등장을 정함
function hunt(d) {
  const err = logic.check(d, 'hunt');
  if (err) return err;
  const place = logic.placeOf(d);
  if (!place) return { error: '인간의 땅에서는 사냥할 수 없다.' };
  const c = { name: PLACES[place].creature, level: PLACES[place].level };
  if (logic.lowHp(d)) return { error: '기운이 없어 사냥에 나설 수 없다. 조금 쉬어야 한다.' };
  logic.spendAp(d, logic.actionCost(d, 'hunt'));

  const corrupted = logic.isCorrupted(d.region);
  const chance = corrupted ? (logic.isRuin(d.region) ? RUIN.eliteChance : MIND.eliteChance) : COMBAT.eliteChance;
  const eliteRoll = debug.forceElite ?? (d.level >= COMBAT.eliteFrom && Math.random() < chance);
  const me = fromDragon(d, 'hunt');
  if (eliteRoll) {
    const foe = fromCreature(place, true, corrupted);
    me.atk *= (logic.titleMods(d).eliteAtk || 1) * logic.gearMods(d).eliteAtk; // 칭호: 강적 사냥꾼, 희귀 장비
    const b = newBattle('elite', me, foe);
    b.region = d.region;
    weatherize(b, d.region);
    b.place = place;
    b.corrupted = corrupted;
    if (logic.isRuin(d.region)) { // 질긴 몸은 조금 더 길게 싸움. 희귀 장비 천장은 만날 때마다 셈 (져도 쌓임)
      b.maxTurns = COMBAT.ruinMaxTurns;
      const cj = logic.combatJson(d);
      cj.ruinPity = (cj.ruinPity || 0) + 1;
    }
    b.a.turnCount = 0; b.b.turnCount = 0;
    const first = logic.dexMeet(d, `${place}!`); // 도감
    return {
      title: '강적', elite: true, battle: b,
      lines: [`${c.name}${josa(c.name, '을', '를')} 쫓던 중, ${ga(foe)} 길을 막아섰다!`, corrupted ? '검붉은 기운이 머릿속을 파고든다. 맞을 때마다 정신도 깎인다.' : '물러설 수 없다. 직접 싸워야 한다.', ...(first ? ['처음 보는 강적이다. 도감에 적어 두었다.'] : [])],
      items: [], gold: 0, xp: 0,
    };
  }
  // 평범한 사냥도 직접 싸움. 가끔은 무리를 만남
  const G = COMBAT.group;
  let n = 1;
  if (Number.isInteger(debug.forceGroup)) n = debug.forceGroup;
  else if (c.level >= G.from && Math.random() < G.chance) n = 2 + (c.level >= G.threeFrom && Math.random() < G.three ? 1 : 0);
  const pre = [...G.prefixes].sort(() => Math.random() - 0.5);
  const foes = [fromCreature(place, false, corrupted), ...Array.from({ length: n - 1 }, (_, i) => fromCreature(place, false, corrupted, pre[i % pre.length]))];
  const b = newBattle('hunt', me, foes[0], foes.slice(1));
  b.region = d.region;
  weatherize(b, d.region);
  b.place = place;
  b.corrupted = corrupted;
  if (logic.isRuin(d.region)) b.maxTurns = COMBAT.ruinMaxTurns; // 질긴 몸은 조금 더 길게 싸움
  b.a.turnCount = 0;
  const lines = n > 1
    ? [`${c.name}${josa(c.name, '이', '가')} 무리 지어 나타났다! (${n}마리)`, '노릴 적을 골라 싸운다. 숨결은 다른 적에게도 번지고, 포효는 모두에게 울린다.']
    : [`${c.name}${josa(c.name, '을', '를')} 찾아냈다.`];
  if (corrupted) lines.push('검붉은 기운이 머릿속을 파고든다. 맞을 때마다 정신도 깎인다.');
  if (logic.dexMeet(d, place)) lines.push('처음 보는 사냥감이다. 도감에 적어 두었다.'); // 도감
  return { title: '사냥', hunt: true, battle: b, lines, items: [], gold: 0, xp: 0 };
}

// 사냥 결과: 체력·기력을 남은 만큼으로. 쓰러뜨린 사냥감마다 전리품 (무리면 함께 나온 사냥감은 조금 적게)
// 결과의 fall: 물러나지 않고 졌음 (쓰러짐)
// 곁에 둔 새끼와 함께 싸운 횟수를 드래곤에 적어 둠 (둥지 식구를 불러올 때 자람 기록으로 옮겨짐)
function noteAlly(d, b) {
  if (!b.allyHits || !b.a.ally?.id) return;
  const c = logic.combatJson(d);
  (c.allyFights ||= {})[b.a.ally.id] = (c.allyFights[b.a.ally.id] || 0) + 1;
}
function huntReward(d, b, c) {
  noteAlly(d, b);
  const me = b.a;
  const foes = foesOf(b);
  d.hp = Math.max(1, Math.round(me.hp));
  d.en = Math.max(0, Math.round(me.en));
  const skillsUsed = [...new Set(me.used || [])].slice(0, 3);
  const win = b.winner === me;
  const lost = Math.max(0, (me.hp0 ?? me.hpMax) - me.hp); // 싸우기 전 체력에서 줄어든 만큼
  const killed = foes.filter((f) => f.hp <= 0);
  if (b.place && killed.length) logic.dexWin(d, b.place, killed.length); // 도감: 쓰러뜨린 수
  const lines = [];
  const hostile = d.stance === 'hostile';
  const G = COMBAT.group;
  const ti = logic.titleMods(d);
  const drop = PLACES[b.place]?.drop;
  const wx = logic.weatherFx(b.region); // 계절과 날씨: 금화·전리품
  const ids = [];
  let gold = 0;
  let xp = 0;
  const how = skillsUsed.length ? ` (${skillsUsed.join(', ')})` : '';
  for (const f of killed) {
    const extra = f.minion;
    ids.push('beast_hide');
    if (!extra && Math.random() < 0.3 + c.level * 0.05 + (hostile ? STANCE_RULES.hostile.huntFang : 0)) ids.push('sharp_fang');
    if (!extra && Math.random() < (PLACE_RULES.sinewChance || 0)) ids.push('tough_sinew'); // 실험 재료: 질긴 힘줄 (어디서든)
    // 장소마다 다른 사냥 전리품 (강화 음식 '행운'이면 더 잘 나옴)
    if (drop && Math.random() < (PLACE_RULES.dropChance[ITEMS[drop].rarity] + (logic.buffOf(d)?.drop || 0) + (ti.drop || 0) + wx.drop) * (extra ? G.dropChance : 1)) ids.push(drop);
    gold += randInt(0, 3) * c.level * (hostile ? STANCE_RULES.hostile.huntGold : 1) * (ti.huntGold || 1) * wx.huntGold * (extra ? G.gold : 1);
    xp += (12 + c.level * 6) * (extra ? G.xp : 1);
  }
  // 판정승: 턴이 다하도록 쓰러뜨리지 못하고 물리친 사냥감은 입힌 피해 비율만큼만 보상 (멸망한 대륙의 질긴 몸)
  const driven = win ? foes.filter((f) => f.hp > 0) : [];
  for (const f of driven) {
    const r = Math.max(0, Math.min(1, (f.hpMax - f.hp) / f.hpMax));
    if (Math.random() < r) ids.push('beast_hide');
    if (drop && Math.random() < (PLACE_RULES.dropChance[ITEMS[drop].rarity] + (logic.buffOf(d)?.drop || 0) + (ti.drop || 0) + wx.drop) * r) ids.push(drop);
    gold += randInt(0, 3) * c.level * (hostile ? STANCE_RULES.hostile.huntGold : 1) * (ti.huntGold || 1) * wx.huntGold * r;
    xp += (12 + c.level * 6) * r;
  }
  // 오염된 땅의 사냥감: 경험치·금화가 더 많음, 검게 물든 비늘이 나옴
  const corrupt = foeCorrupt(b);
  if (corrupt) {
    gold *= MIND.reward.gold;
    xp *= MIND.reward.xp;
    for (let i = 0; i < killed.length; i++) if (Math.random() < MIND.scale.hunt) ids.push('blackened_scale');
  }
  gold = Math.round(gold);
  let items = logic.bundle(ids);
  const names = (l) => { const t = l.map((f) => f.name).join(', '); return `${t}${josa(t, '을', '를')}`; };
  if (win) {
    if (killed.length) lines.push(`${b.turn}턴 만에 ${names(killed)} ${killed.length > 1 ? '모두 ' : ''}쓰러뜨렸다${how}.`);
    if (driven.length) lines.push(killed.length
      ? `${names(driven)} 만신창이로 만들어 쫓아냈다. 입힌 만큼은 거두었다.`
      : `${b.turn}턴 내내 몰아붙이자 ${names(driven)} 만신창이가 되어 물러났다${how}. 입힌 만큼은 거두었다.`);
    // 칭호: 사냥에서 이긴 횟수 (전체와 지역별)
    logic.traitCount(d, 'huntwin');
    logic.traitCount(d, `huntwin:${PLACES[b.place]?.region || d.region}`);
    if (b.place) logic.traitCount(d, `huntwin:${b.place}`); // 모브 드래곤 의뢰: 장소별
  } else if (b.fled === me) {
    lines.push(killed.length ? `${names(killed)} 쓰러뜨리고, 나머지에게 밀려 ${b.turn}턴 만에 물러났다${how}.` : `${c.name}에게 밀려 ${b.turn}턴 만에 물러났다${how}.`);
  } else {
    lines.push(killed.length ? `${names(killed)} 쓰러뜨렸지만, 끝내 쓰러지고 말았다${how}.` : `${c.name}에게 쓰러졌다${how}.`);
  }
  if (items.length || gold) {
    const got = items.map(logic.itemLabel);
    if (gold) got.push(`금화 ${gold}닢`);
    const t = got.join(', ');
    lines.push(`${t}${josa(t, '을', '를')} 얻었다.`);
  }
  if (!killed.length && !driven.length) xp = 4;
  lines.push(`체력을 ${Math.round(lost)} 잃었다.`);
  // 오염된 몬스터: 오염 결정이 나오기도 하고, 맞은 만큼 정신이 깎임
  if (corrupt) {
    if (killed.length && Math.random() < MIND.crystal.hunt) { items = logic.bundle([...items.flatMap((x) => Array(x.qty).fill(x.id)), 'corrupt_crystal']); lines.push('쓰러진 몸에서 오염 결정이 굴러 나왔다.'); }
    if (killed.length) lines.push(`오염된 사냥감이라 경험치와 금화를 더 얻었다. (×${MIND.reward.xp})`);
    lines.push(...logic.loseMind(d, me.mindLoss || 0, MIND.monsterMax));
    if (win && logic.hooks.purify) lines.push(...logic.hooks.purify(d, 'hunt'));
    if (win && logic.isRuin(d.region)) { // 멸망한 대륙: 정화의 결정과 귀한 것들
      const n = randInt(...RUIN.shard.hunt) + logic.gearMods(d).shard;
      const extra = [...Array(n).fill('purify_shard'), ...ruinFinds(d, 'hunt', lines, b.place)];
      items = logic.bundle([...items.flatMap((x) => Array(x.qty).fill(x.id)), ...extra]);
      lines.push(`쓰러진 자리에서 정화의 결정 ${n}개가 맑게 떠올랐다.`);
    }
  }
  d.gold += gold;
  xp = logic.xpOf(d, Math.round(xp));
  const levelUp = logic.gainXp(d, xp);
  return {
    title: '사냥', lines, items, gold, xp, levelUp, win, turns: b.turn,
    fall: !win && b.fled !== me,
    wound: d.hp <= logic.hpCap(d) * 0.15,
    log: b.log.map((t) => t.lines).flat(),
    lost: Math.round(lost),
  };
}

const foeCorrupt = (b) => !!b.b.corrupted;

// 강적과의 싸움이 끝났을 때 (이기면 큰 보상)
function eliteReward(d, b) {
  noteAlly(d, b);
  const me = b.a;
  const foe = b.b;
  d.hp = Math.max(1, Math.round(me.hp));
  d.en = Math.max(0, Math.round(me.en));
  const lv = PLACES[b.place].level;
  const lines = [];
  let items = [];
  let gold = 0;
  let xp;
  if (b.winner === me) {
    const drop = PLACES[b.place]?.drop;
    const ids = ['beast_hide', 'beast_hide', 'sharp_fang', ...(drop ? [drop, drop] : []),
      logic.rollItem(b.region, { uncommon: 0.6, rare: 0.3 + lv * 0.02 }), logic.rollItem(b.region, { uncommon: 0.6, rare: 0.15 + lv * 0.02 })];
    items = logic.bundle(ids);
    gold = Math.round(randInt(20, 40) * lv * (logic.titleMods(d).huntGold || 1) * logic.weatherFx(b.region).huntGold * (b.corrupted ? MIND.reward.gold : 1));
    xp = (12 + lv * 6) * 3 * (b.corrupted ? MIND.reward.xp : 1);
    // 바랜 제작서 (숨겨진 제작법)
    if (Math.random() < CRAFT.scrollChance.elite) items = logic.bundle([...items.flatMap((x) => Array(x.qty).fill(x.id)), 'recipe_scroll']);
    // 오염된 강적: 검게 물든 비늘, 낮은 확률로 전설 장신구
    if (b.corrupted) {
      items = logic.bundle([...items.flatMap((x) => Array(x.qty).fill(x.id)), ...Array(MIND.scale.elite).fill('blackened_scale'), ...(Math.random() < MIND.legend.chance ? [MIND.legend.item] : [])]);
    }
    logic.traitCount(d, 'elite');
    if (b.place) logic.dexWin(d, `${b.place}!`); // 도감
    logic.traitCount(d, `elite:${PLACES[b.place]?.region || d.region}`); // 모브 드래곤 의뢰: 지역별 강적
    if (b.place) logic.traitCount(d, `elite:${b.place}`); // 모브 드래곤 의뢰: 이름을 대 준 바로 그 강적 (사냥터별)
    logic.traitCount(d, 'huntwin');
    logic.traitCount(d, `huntwin:${PLACES[b.place]?.region || d.region}`);
    if (b.place) logic.traitCount(d, `huntwin:${b.place}`); // 모브 드래곤 의뢰 '그 사냥터에서 n번 이기기': 강적도 한 번으로 셈
    d.gold += gold;
    const t = [...items.map(logic.itemLabel), `금화 ${gold}닢`].join(', ');
    lines.push(`${eul(foe)} 쓰러뜨렸다! ${t}${josa(t, '을', '를')} 얻었다.`);
    const f = logic.addFame(d, 2);
    lines.push(f || '강적을 쓰러뜨렸다는 소문이 드래곤들 사이에 퍼진다.');
    logic.chron(d, 'mark', `${PLACES[b.place]?.name || ''}에서 강적 ${eul(foe)} 쓰러뜨렸다.`);
  } else if (b.fled === me) {
    lines.push(`${foe.name}에게서 물러났다. 다음을 기약하자.`);
    xp = 4;
  } else {
    lines.push(`${foe.name}에게 쓰러졌다. 겨우 정신을 차리고 몸을 피했다.`);
    xp = 8;
  }
  if (b.corrupted) {
    if (b.winner === me) {
      items = logic.bundle([...items.flatMap((x) => Array(x.qty).fill(x.id)), ...Array(MIND.crystal.elite).fill('corrupt_crystal')]);
      lines.push(`오염 결정 ${MIND.crystal.elite}개를 거두었다. 오염된 강적이라 경험치와 금화를 더 얻었다.`);
      if (items.some((x) => x.id === MIND.legend.item)) {
        lines.push(`쓰러진 강적의 머리에서 검은 왕관이 굴러떨어졌다… ${ITEMS[MIND.legend.item].name}!`);
        logic.chron(d, 'mark', `오염된 강적에게서 ${ITEMS[MIND.legend.item].name}${josa(ITEMS[MIND.legend.item].name, '을', '를')} 얻었다.`);
      }
      if (logic.hooks.purify) lines.push(...logic.hooks.purify(d, 'elite'));
      if (logic.isRuin(d.region)) {
        const n = randInt(...RUIN.shard.elite) + logic.gearMods(d).shard;
        const extra = [...Array(n).fill('purify_shard'), ...ruinFinds(d, 'elite', lines, b.place)];
        items = logic.bundle([...items.flatMap((x) => Array(x.qty).fill(x.id)), ...extra]);
        lines.push(`검은 기운이 걷히며 정화의 결정 ${n}개가 남았다.`);
      }
    }
    lines.push(...logic.loseMind(d, me.mindLoss || 0, MIND.monsterMax));
  }
  xp = logic.xpOf(d, xp);
  const levelUp = logic.gainXp(d, xp);
  return { title: '강적', lines, items, gold, xp, levelUp, win: b.winner === me, wound: d.hp <= logic.hpCap(d) * 0.15 };
}

// ── 보물 도둑 쫓기 ─────────────────────────────────
// 둥지에서 도둑의 흔적을 쫓아 무리와 싸움 (사냥처럼 직접 싸우고, 자동으로 끝낼 수도 있음)
function fromThief(T, lv, name, minion, trapped) {
  const G = COMBAT.group;
  const CB = creatureBase(lv);
  const hpMax = Math.round(CB.hp * (minion ? G.hp : 1));
  return {
    id: null, name, kind: null, creature: true, region: null, place: null, elite: false, minion, level: lv, type: 'thief',
    corrupted: false, mindDrain: 0,
    hp: Math.round(hpMax * (trapped ? RAID.trapHp : 1)), hpMax, en: 0, enMax: 0,
    atk: CB.atk * (minion ? G.atk : 1), def: CB.def, spd: 6 + lv * 2, mag: 4 + lv * 2, maj: creatureMaj(lv),
    taken: 1, element: null, breath: null, skills: [],
    special: T.special,
    weak: T.weak, resist: T.resist,
    st: {}, cd: {},
  };
}
// ── 대륙의 재앙 ────────────────────────────────────
// 모두가 함께 깎는 체력: 싸움을 시작할 때의 남은 체력(hp)과 전체 체력(hpMax)으로 만듦. 절반 아래면 처음부터 분노
function fromBoss(key, lv, hp, hpMax) {
  const T = BOSSES[key];
  const CB = creatureBase(lv);
  const enraged = hp <= hpMax * ENRAGE.below;
  return {
    id: null, name: T.name, kind: null, creature: true, region: key, place: null, elite: true, boss: true, level: lv, type: T.type,
    corrupted: false, mindDrain: 0,
    hp, hpMax, en: 0, enMax: 0,
    atk: CB.atk * BOSS.atk * (enraged ? ENRAGE.atk : 1), def: CB.def * BOSS.def, spd: 6 + lv * 2, mag: 4 + lv * 2, maj: 8 + lv * 2,
    taken: 1, element: T.special.element || null, breath: null, skills: [], special: T.special,
    weak: T.weak, resist: T.resist, enraged,
    st: {}, cd: {},
  };
}
function bossBattle(d, st) {
  const me = fromDragon(d, 'hunt');
  me.atk *= (logic.titleMods(d).eliteAtk || 1) * logic.gearMods(d).eliteAtk; // 칭호: 강적 사냥꾼, 희귀 장비
  const foe = fromBoss(st.key, st.lv, st.hp, st.hpMax);
  const b = newBattle('hunt', me, foe);
  b.boss = true;
  b.maxTurns = BOSS.turns;
  b.region = d.region;
  b.a.turnCount = 0;
  weatherize(b, d.region, true);
  b.startHp = foe.hp;
  return b;
}

function raidBattle(d, raid) {
  const T = RAID.thieves[raid.thief];
  const me = fromDragon(d, 'hunt');
  const foes = [fromThief(T, raid.lv, T.name, false, raid.trapped), ...T.minions.map((n) => fromThief(T, raid.lv, n, true, raid.trapped))];
  const b = newBattle('hunt', me, foes[0], foes.slice(1));
  b.raid = true;
  b.region = d.region;
  weatherize(b, d.region);
  b.a.turnCount = 0;
  const lines = [`도둑들의 발자국을 따라 날았다. 바위 그늘에 ${T.name} 무리가 보물을 나누고 있다! (${foes.length}명)`];
  if (raid.trapped) lines.push('가시 덫에 다친 도둑들이 절뚝거린다.');
  return { battle: b, lines, c: { name: T.name, level: raid.lv } };
}
// 쫓은 결과: 이기면 훔쳐 간 것을 모두 보물더미로 되찾고, 도둑이 지닌 금화도 얻음
function raidReward(d, b, c, raid) {
  const me = b.a;
  const foes = foesOf(b);
  d.hp = Math.max(1, Math.round(me.hp));
  d.en = Math.max(0, Math.round(me.en));
  const win = b.winner === me;
  const fled = b.fled === me;
  const lost = Math.round(Math.max(0, (me.hp0 ?? me.hpMax) - me.hp));
  const killed = foes.filter((f) => f.hp <= 0);
  const lines = [];
  let gold = 0;
  let xp = 0;
  let hoardItems = [];
  let back = 0;
  if (win) {
    back = raid.gold;
    hoardItems = raid.items.map((x) => ({ id: x.id, qty: x.qty }));
    d.hoard_gold = (d.hoard_gold || 0) + back;
    gold = randInt(...RAID.bounty) * c.level;
    d.gold += gold;
    const got = [...(back ? [`금화 ${back}닢`] : []), ...raid.items.map(logic.itemLabel)].join(', ');
    lines.push(`${b.turn}턴 만에 ${c.name} 무리를 모두 쓰러뜨렸다!`);
    if (got) lines.push(`${got}${josa(got, '을', '를')} 되찾아 보물더미에 돌려놓았다.`);
    lines.push(`도둑들이 지니고 있던 금화 ${gold}닢도 챙겼다.`);
    const f = logic.addFame(d, RAID.fame);
    lines.push(f || '보물을 지켜 낸 이야기가 드래곤들 사이에 퍼진다.');
    lines.push(...logic.traitCount(d, 'raidwin'));
    logic.chron(d, 'mark', `${c.name} 무리를 쫓아가 보물을 되찾았다.`);
    xp = (12 + c.level * 6) * foes.length * RAID.xp;
  } else if (fled) {
    lines.push(`${c.name} 무리에게 밀려 ${b.turn}턴 만에 물러났다. 흔적이 남아 있는 동안 다시 쫓을 수 있다.`);
    xp = 4 + killed.length * 6;
  } else {
    lines.push(`${c.name} 무리에게 쓰러졌다. 도둑들은 보물을 챙겨 멀리 달아났다.`);
    logic.chron(d, 'mark', `${c.name} 무리를 쫓다가 쓰러졌다.`);
    xp = 6;
  }
  lines.push(`체력을 ${lost} 잃었다.`);
  xp = logic.xpOf(d, Math.round(xp));
  const levelUp = logic.gainXp(d, xp);
  return {
    title: '도둑 추격', lines, items: [], hoardItems, gold, xp, levelUp, win, turns: b.turn,
    fall: !win && !fled, settled: win || !fled,
    wound: d.hp <= logic.hpCap(d) * 0.15,
    lost,
  };
}

module.exports = {
  combatOf, loadout, learned, setSkills, setSettings,
  fromDragon, fromCreature, newBattle, round, aiPick, autoAct, runAuto, blocked, view, comboOf, intentOf, targetOf,
  hunt, huntReward, eliteReward, creatureBase, raidBattle, raidReward, fromBoss, bossBattle, weatherize, debug,
  raidKit: { perform, endOfTurn, damage, dodged, healAmount, fighterView }, // 레이드(raidboss.js)가 넷이 함께 싸우는 턴을 직접 짤 때 씀
};
