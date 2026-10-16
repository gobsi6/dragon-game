// 전투: 숨결·스킬·상태 이상이 있는 짧은 턴제 전투
// - 사냥: 자동 전투로 한 번에 끝남 (스킬은 알아서 씀)
// - 강적·결투장: 매 턴 직접 고름 (실시간 결투에서 시간을 넘기면 자동으로 고름)
// 전투 하나 = battle { kind, turn, a, b, log, over, winner }. a·b는 싸우는 쪽(fighter)
const {
  COMBAT, BREATHS, BREATH_COST, ELEMENTS, SKILLS, STATUS, CREATURE_COMBAT, ELITES, CREATURES, ITEMS, RULES, STANCE_RULES, KINDS, MIND, PLACES, PLACE_RULES,
} = require('./game-data');
const logic = require('./game-logic');

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
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
// 들고 가는 스킬: 고른 것 중 배운 것만. 고른 적이 없으면 배운 순서대로
function loadout(d) {
  const c = combatOf(d);
  const have = learned(d);
  const pickd = Array.isArray(c.skills) ? c.skills.filter((id) => have.includes(id)) : have;
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
  const hpMax = logic.hpCap(d);
  const enMax = logic.enCap(d);
  // 강화 음식: 사냥·강적 전투에서만 (결투장에는 적용되지 않음)
  const bf = hunt ? logic.buffOf(d) : null;
  return {
    id: d.id, name: d.name, kind: d.kind, creature: false,
    hp: hunt ? d.hp : hpMax, hpMax, en: hunt ? d.en : enMax, enMax,
    atk: atk * (bf?.atk || 1), def: st.scale, spd: st.wing + (bf?.spd || 0), mag: st.wisdom * (bf?.mag || 1), maj: st.majesty,
    taken: (hunt ? tm.huntDmg * (d.perks?.knight ? 0.7 : 1) : 1) * (bf?.taken || 1), // 받는 피해 배율
    buff: bf?.id || null,
    element: BREATHS[d.kind]?.element || null,
    breath: BREATHS[d.kind] ? d.kind : null,
    skills: loadout(d),
    weak: [], resist: [],
    st: {}, cd: {},
  };
}
// place: 장소 id (사냥터 난이도 = 사냥감 레벨). corrupted: 오염된 땅의 몬스터 (조금 더 세고, 입힌 피해만큼 정신도 깎음)
function fromCreature(place, elite, corrupted = false) {
  const pl = PLACES[place];
  const cc = pl;
  const lv = pl.level + (elite ? 1 : 0);
  const K = COMBAT.creature; // 사냥터 난이도별 사냥감 세기
  const hpMax = Math.round((K.hp[0] + lv * K.hp[1]) * (elite ? K.eliteHp : 1));
  const name = elite ? pl.elite : pl.creature;
  return {
    id: null, name: corrupted ? `오염된 ${name}` : name, kind: null, creature: true, region: pl.region, place, elite: !!elite, level: lv,
    corrupted, mindDrain: corrupted ? MIND.monster : 0,
    hp: hpMax, hpMax, en: 0, enMax: 0,
    atk: (K.atk[0] + lv * K.atk[1]) * (elite ? K.eliteAtk : 1) * (corrupted ? MIND.monsterAtk : 1), def: K.def[0] + lv * K.def[1], spd: 6 + lv * 2, mag: 4 + lv * 2, maj: 6 + lv * 2,
    taken: 1, element: cc.special.element || null,
    breath: null, skills: [], special: cc.special,
    weak: cc.weak, resist: cc.resist,
    st: {}, cd: {},
  };
}
function newBattle(kind, a, b) {
  return { kind, turn: 0, a, b, log: [], over: false, winner: null, fled: null };
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

// 치유: 지혜(마력)가 높을수록, 최대 체력이 클수록 많이
const healAmount = (f, s) => Math.round(s.heal.base + f.mag * s.heal.mag + f.hpMax * s.heal.pct);
const STATUS_LIST = (ks) => ks.map((k) => STATUS[k]).join('·');

// 피해 계산. magic: 숨결처럼 비늘을 덜 타는 공격
function damage(att, def, power, { magic = false, element = null } = {}) {
  let atk = att.atk * (has(att, 'weaken') ? 0.7 : 1);
  let armor = def.def * (has(def, 'acid') ? 0.5 : 1);
  let raw = magic ? (att.mag * 1.0 + atk * 0.5) * power - armor * 0.25 : atk * power - armor * 0.5;
  raw *= rand(0.85, 1.15);
  let note = '';
  if (element && def.weak.includes(element)) { raw *= 1.5; note = ' 약점을 찔렀다!'; }
  if (element && def.resist.includes(element)) { raw *= 0.5; note = ' 잘 통하지 않는다.'; }
  const crit = !magic && Math.random() < 0.06 + Math.max(0, att.spd - def.spd) * 0.005;
  if (crit) { raw *= 1.5; note += ' 급소를 찔렀다!'; }
  if (def.guarding) raw *= 0.5;
  if (has(def, 'harden')) raw *= 0.5;
  raw *= def.taken;
  return { dmg: Math.max(1, Math.round(raw)), note };
}
// 피하기: 날개(속도) 차이와 안개·돌풍
function dodged(att, def, lines) {
  if (has(def, 'dodge')) { def.st.dodge = 0; lines.push(`${ga(def)} 돌풍을 타고 공격을 흘려보냈다.`); return true; }
  const p = clamp(0.05 + (def.spd - att.spd) * 0.015, 0.03, 0.3) + (has(def, 'evade') ? 0.4 : 0);
  if (Math.random() < p) { lines.push(`${ga(def)} 날렵하게 피했다.`); return true; }
  return false;
}
// 상태 이상 걸기 (저항하는 속성이면 통하지 않음)
function applyDebuff(att, def, debuff, chance, element, lines) {
  if (!debuff) return;
  if (element && def.resist.includes(element)) return;
  if (chance != null && Math.random() >= chance) return;
  for (const [k, n] of Object.entries(debuff)) {
    def.st[k] = Math.max(def.st[k] || 0, n);
    // 지속 피해는 건 쪽의 힘으로 정해짐
    if (k === 'burn') def.st.burnDmg = Math.round(3 + att.mag * 0.3);
    if (k === 'poison') def.st.poisonDmg = Math.round(2 + att.mag * 0.25);
    if (k === 'bleed') def.st.bleedDmg = Math.round(2 + att.atk * 0.15);
    lines.push(`${ga(def)} ${STATUS[k]} 상태가 되었다.`);
  }
}
function hit(att, def, power, opt, lines, verb) {
  if (dodged(att, def, lines)) return 0;
  const { dmg, note } = damage(att, def, power, opt);
  def.hp = Math.max(0, def.hp - dmg);
  lines.push(`${verb} ${dmg}의 피해를 입혔다.${note}`);
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
    for (let i = 0; i < (s.hits || 1); i++) dealt += hit(f, foe, s.power, { element: s.element }, lines, `${ga(f)} ${s.name}!`);
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
      if (s.heal) {
        const h = healAmount(f, s);
        const before = f.hp;
        f.hp = Math.min(f.hpMax, f.hp + h);
        lines.push(`${ga(f)} ${s.name}! 체력을 ${Math.round(f.hp - before)} 되찾았다.`);
        if (s.cleanse) {
          const gone = ['burn', 'poison', 'bleed'].filter((k) => has(f, k));
          for (const k of gone) f.st[k] = 0;
          if (gone.length) lines.push(`${STATUS_LIST(gone)}${josa(STATUS[gone[gone.length - 1]], '이', '가')} 씻겨 나갔다.`);
        }
        return;
      }
      if (s.power) {
        const dealt = hit(f, foe, s.power, { magic: !!s.isBreath, element: s.isBreath ? s.element : null }, lines, `${ga(f)} ${s.name}!`);
        if (dealt) {
          if (s.drain) { const h = Math.round(dealt * s.drain); f.hp = Math.min(f.hpMax, f.hp + h); lines.push(`${ga(f)} 체력을 ${h} 되찾았다.`); }
          const chance = s.majesty ? clamp(0.5 + (f.maj - foe.maj) * 0.04, 0.2, 0.95) : s.chance;
          applyDebuff(f, foe, s.debuff, chance, s.isBreath ? s.element : null, lines);
        }
      } else {
        lines.push(`${ga(f)} ${s.name}!`);
        if (s.debuff) {
          const chance = s.majesty ? clamp(0.5 + (f.maj - foe.maj) * 0.04, 0.2, 0.95) : s.chance;
          const before = lines.length;
          applyDebuff(f, foe, s.debuff, chance, null, lines);
          if (lines.length === before) lines.push(`${ga(foe)} 꿈쩍도 하지 않았다.`);
        }
        if (s.self) lines.push(...Object.keys(s.self).map((k) => `${ga(f)} ${STATUS[k]} 상태가 되었다.`));
      }
      return;
    }
  }
  hit(f, foe, 1, {}, lines, `${ga(f)} 할퀴어`);
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
  for (const k of Object.keys(STATUS)) if (f.st[k] > 0 && k !== 'dodge') f.st[k] -= 1;
  for (const k of Object.keys(f.cd)) if (f.cd[k] > 0) f.cd[k] -= 1;
  if (!f.creature) f.en = Math.min(f.enMax, f.en + COMBAT.enPerTurn);
}

// 한 턴을 치름. 빠른 쪽이 먼저 움직임
function round(b, actA, actB) {
  if (b.over) return [];
  b.turn += 1;
  const lines = [];
  const first = b.a.spd + rand(0, 3) >= b.b.spd + rand(0, 3) ? ['a', 'b'] : ['b', 'a'];
  const acts = { a: actA, b: actB };
  for (const k of first) {
    const f = b[k];
    const foe = b[k === 'a' ? 'b' : 'a'];
    if (b.over || f.hp <= 0) continue;
    perform(b, f, foe, acts[k], lines);
    if (foe.hp <= 0) { b.over = true; b.winner = f; lines.push(`${ga(foe)} 쓰러졌다.`); }
  }
  if (!b.over) {
    endOfTurn(b.a, lines); endOfTurn(b.b, lines);
    for (const [f, foe] of [[b.a, b.b], [b.b, b.a]]) {
      if (!b.over && f.hp <= 0) { b.over = true; b.winner = foe; lines.push(`${ga(f)} 쓰러졌다.`); }
    }
  }
  if (!b.over && b.turn >= COMBAT.maxTurns) {
    b.over = true;
    b.winner = b.a.hp / b.a.hpMax >= b.b.hp / b.b.hpMax ? b.a : b.b;
    lines.push(`해가 기울도록 승부가 나지 않았다. 더 버틴 ${ga(b.winner)} 이겼다.`);
  }
  b.log.push({ turn: b.turn, lines });
  return lines;
}

// ── 자동으로 고르기 ────────────────────────────────
// reserve: 이만큼의 기력은 남겨 둠 (자동 사냥). flee: 체력이 이 비율 아래면 물러남
function aiPick(f, foe, { reserve = 0, flee = 0 } = {}) {
  if (f.creature) {
    if (f.special && f.turnCount++ % 3 === 2) return { type: 'special' };
    return { type: 'attack' };
  }
  if (flee && f.hp < f.hpMax * flee) return { type: 'flee' };
  const can = (id) => {
    const s = skillOf(f, id);
    return s && !(f.cd[id] > 0) && f.en - s.en >= reserve;
  };
  const hpr = f.hp / f.hpMax;
  if (hpr < 0.4 && can('mend')) return { type: 'skill', id: 'mend' }; // 위험하면 숨결보다 치유 먼저
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
  if (can('gust') && !has(f, 'dodge') && Math.random() < 0.5) return { type: 'skill', id: 'gust' };
  if (can('tail')) return { type: 'skill', id: 'tail' };
  return { type: 'attack' };
}
function runAuto(b, optA = {}, optB = {}) {
  b.a.turnCount = 0; b.b.turnCount = 0;
  while (!b.over) round(b, aiPick(b.a, b.b, optA), aiPick(b.b, b.a, optB));
  return b;
}

// 화면에 보낼 모습. me: 내 쪽('a'/'b'). 상대의 스킬 구성은 보이지 않음
function fighterView(f, mine) {
  const v = {
    name: f.name, kind: f.kind, creature: f.creature, elite: !!f.elite, id: f.id,
    hp: Math.round(f.hp), hpMax: f.hpMax, en: Math.round(f.en), enMax: f.enMax,
    st: Object.fromEntries(Object.keys(STATUS).filter((k) => f.st[k] > 0).map((k) => [k, f.st[k]])),
    weak: f.weak, resist: f.resist,
  };
  if (mine) {
    v.skills = [
      ...(f.breath ? [{ id: 'breath', name: BREATHS[f.breath].name, en: BREATH_COST.en, cd: f.cd.breath || 0 }] : []),
      ...f.skills.map((id) => ({ id, name: SKILLS[id].name, en: SKILLS[id].en, cd: f.cd[id] || 0 })),
    ];
  }
  return v;
}
function view(b, me = 'a') {
  const foe = me === 'a' ? 'b' : 'a';
  return {
    kind: b.kind, turn: b.turn, maxTurns: COMBAT.maxTurns, over: b.over,
    me: fighterView(b[me], true), foe: fighterView(b[foe], false),
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
  if (d.hp < RULES.huntMinHp) return { error: '기운이 없어 사냥에 나설 수 없다. 조금 쉬어야 한다.' };
  logic.spendAp(d, RULES.cost.hunt);

  const corrupted = logic.isCorrupted(d.region);
  const chance = corrupted ? MIND.eliteChance : COMBAT.eliteChance;
  const eliteRoll = debug.forceElite ?? (d.level >= COMBAT.eliteFrom && Math.random() < chance);
  const me = fromDragon(d, 'hunt');
  if (eliteRoll) {
    const foe = fromCreature(place, true, corrupted);
    const b = newBattle('elite', me, foe);
    b.region = d.region;
    b.place = place;
    b.corrupted = corrupted;
    b.a.turnCount = 0; b.b.turnCount = 0;
    return {
      title: '강적', elite: true, battle: b,
      lines: [`${c.name}${josa(c.name, '을', '를')} 쫓던 중, ${ga(foe)} 길을 막아섰다!`, corrupted ? '검붉은 기운이 머릿속을 파고든다. 맞을 때마다 정신도 깎인다.' : '물러설 수 없다. 직접 싸워야 한다.'],
      items: [], gold: 0, xp: 0,
    };
  }
  const foe = fromCreature(place, false, corrupted);
  const b = runAuto(newBattle('hunt', me, foe), { reserve: Math.round(me.enMax * COMBAT.huntReserve), flee: COMBAT.fleeBelow });
  return { ...huntReward(d, b, c), turns: b.turn };
}

// 사냥 결과: 체력·기력을 남은 만큼으로, 이기면 전리품
function huntReward(d, b, c) {
  const me = b.a;
  d.hp = Math.max(1, Math.round(me.hp));
  d.en = Math.max(0, Math.round(me.en));
  const skillsUsed = [...new Set(me.used || [])].slice(0, 3);
  const win = b.winner === me;
  const lost = me.hpMax - me.hp;
  const lines = [];
  const hostile = d.stance === 'hostile';
  let items = [];
  let gold = 0;
  let xp;
  const how = skillsUsed.length ? ` (${skillsUsed.join(', ')})` : '';
  if (win) {
    lines.push(`${b.turn}턴 만에 ${c.name}${josa(c.name, '을', '를')} 쓰러뜨렸다${how}.`);
    const ids = ['beast_hide'];
    if (Math.random() < 0.3 + c.level * 0.05 + (hostile ? STANCE_RULES.hostile.huntFang : 0)) ids.push('sharp_fang');
    // 장소마다 다른 사냥 전리품 (강화 음식 '행운'이면 더 잘 나옴)
    const drop = PLACES[b.b.place]?.drop;
    if (drop && Math.random() < PLACE_RULES.dropChance[ITEMS[drop].rarity] + (logic.buffOf(d)?.drop || 0)) ids.push(drop);
    items = logic.bundle(ids);
    gold = Math.round(randInt(0, 3) * c.level * (hostile ? STANCE_RULES.hostile.huntGold : 1));
    xp = 12 + c.level * 6;
    const got = items.map(logic.itemLabel);
    if (gold) got.push(`금화 ${gold}닢`);
    const t = got.join(', ');
    lines.push(`${t}${josa(t, '을', '를')} 얻었다.`);
  } else {
    lines.push(b.fled === me
      ? `${c.name}에게 밀려 ${b.turn}턴 만에 물러났다${how}.`
      : `${c.name}${josa(c.name, '과', '와')} 겨루다 지쳐 물러났다${how}.`);
    xp = 4;
  }
  lines.push(`체력을 ${Math.round(lost)} 잃었다.`);
  // 오염된 몬스터: 오염 결정이 나오기도 하고, 맞은 만큼 정신이 깎임
  if (foeCorrupt(b)) {
    if (win && Math.random() < MIND.crystal.hunt) { items = logic.bundle([...items.flatMap((x) => Array(x.qty).fill(x.id)), 'corrupt_crystal']); lines.push('쓰러진 몸에서 오염 결정이 굴러 나왔다.'); }
    lines.push(...logic.loseMind(d, me.mindLoss || 0));
  }
  d.gold += gold;
  xp = logic.xpOf(d, xp);
  const levelUp = logic.gainXp(d, xp);
  return {
    title: '사냥', lines, items, gold, xp, levelUp, win,
    wound: d.hp <= logic.hpCap(d) * 0.15,
    log: b.log.map((t) => t.lines).flat(),
    lost: Math.round(lost),
  };
}

const foeCorrupt = (b) => !!b.b.corrupted;

// 강적과의 싸움이 끝났을 때 (이기면 큰 보상)
function eliteReward(d, b) {
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
    gold = randInt(20, 40) * lv;
    xp = (12 + lv * 6) * 3;
    d.gold += gold;
    const t = [...items.map(logic.itemLabel), `금화 ${gold}닢`].join(', ');
    lines.push(`${eul(foe)} 쓰러뜨렸다! ${t}${josa(t, '을', '를')} 얻었다.`);
    const f = logic.addFame(d, 2);
    lines.push(f || '강적을 쓰러뜨렸다는 소문이 드래곤들 사이에 퍼진다.');
  } else if (b.fled === me) {
    lines.push(`${foe.name}에게서 물러났다. 다음을 기약하자.`);
    xp = 4;
  } else {
    lines.push(`${foe.name}에게 쓰러졌다. 겨우 정신을 차리고 몸을 피했다.`);
    xp = 8;
  }
  if (b.corrupted) {
    if (b.winner === me) { items = logic.bundle([...items.flatMap((x) => Array(x.qty).fill(x.id)), ...Array(MIND.crystal.elite).fill('corrupt_crystal')]); lines.push(`오염 결정 ${MIND.crystal.elite}개를 거두었다.`); }
    lines.push(...logic.loseMind(d, me.mindLoss || 0));
  }
  xp = logic.xpOf(d, xp);
  const levelUp = logic.gainXp(d, xp);
  return { title: '강적', lines, items, gold, xp, levelUp, win: b.winner === me, wound: d.hp <= logic.hpCap(d) * 0.15 };
}

module.exports = {
  combatOf, loadout, learned, setSkills, setSettings,
  fromDragon, fromCreature, newBattle, round, aiPick, runAuto, blocked, view,
  hunt, huntReward, eliteReward, debug,
};
