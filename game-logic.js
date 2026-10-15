// 게임 규칙: 회복, 단발 행동(탐사·채집·사냥), 원정
// 숫자를 조절하고 싶으면 이 파일과 game-data.js의 RULES를 고치면 됩니다.
// 모든 함수는 드래곤 객체 d를 직접 바꾸고, 결과 { lines, items, gold, xp, ... }를 돌려줍니다.
// 저장은 부르는 쪽(server.js)이 db.saveState(d, items)로 합니다.

const {
  REGIONS, ITEMS, REGION_LOOT, CREATURES, SCENES, RULES, RECIPES, SLOTS, STANCES, SHOPS, repTier, TRADE, NEST,
} = require('./game-data');

const STAT_KEYS = ['claw', 'scale', 'wing', 'wisdom', 'majesty'];

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
  return { stats: b, expRare };
}
// 타고난 값 + 장신구
function statsOf(d) {
  const b = bonusOf(d).stats;
  return Object.fromEntries(STAT_KEYS.map((k) => [k, d[k] + b[k]]));
}
// 비늘·지혜 장신구는 최대 체력·기력도 올림 (능력치 1당 체력 5, 기력 2)
const hpCap = (d) => d.hp_max + bonusOf(d).stats.scale * 5;
const enCap = (d) => d.en_max + bonusOf(d).stats.wisdom * 2;
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
  // 둥지에서 쉬는 동안에는 더 빨리 참
  const m = d.rest_at ? NEST.rest : { ap: 1, hp: 1, en: 1 };
  tick('ap', d.ap_max, 'ap_at', RULES.apEvery / m.ap);
  tick('hp', hpCap(d), 'hp_at', RULES.hpEvery / m.hp);
  tick('en', enCap(d), 'en_at', RULES.enEvery / m.en);
}

// 행동력을 쓸 때: 가득 차 있었다면 회복 시계를 지금부터 시작
function spendAp(d, n, now = Date.now()) {
  if (d.ap >= d.ap_max) d.ap_at = now;
  d.ap -= n;
}

// ── 경험치와 레벨 ──────────────────────────────────
function gainXp(d, xp) {
  d.xp += xp;
  let up = 0;
  while (d.xp >= d.level * 100) {
    d.xp -= d.level * 100;
    d.level += 1;
    d.hp_max += 5;
    d.en_max += 2;
    up += 1;
  }
  if (up) {
    d.hp = hpCap(d);
    d.en = enCap(d);
  }
  return up;
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
  const cost = RULES.cost[type];
  if (d.ap < cost) return { error: `행동력이 모자란다. (${cost} 필요)` };
  return null;
}

function gather(d) {
  const err = check(d, 'gather');
  if (err) return err;
  spendAp(d, RULES.cost.gather);
  const st = statsOf(d);

  const n = Math.random() < 0.35 + st.wisdom * 0.01 ? 2 : 1;
  const ids = [];
  for (let i = 0; i < n; i++) {
    ids.push(rollItem(d.region, { uncommon: 0.12 + st.wisdom * 0.006, rare: 0.01 + st.wisdom * 0.001 }));
  }
  const items = bundle(ids);
  const xp = 3;
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
  spendAp(d, RULES.cost.explore);
  const st = statsOf(d);

  const lines = [pick(SCENES[d.region])];
  let items = [];
  let gold = 0;
  const r = Math.random();
  if (r < 0.4) {
    // 귀한 물건이 잘 나오는 탐사
    const id = rollItem(d.region, { uncommon: 0.4 + st.wisdom * 0.01, rare: 0.06 + st.wisdom * 0.003 });
    items = [{ id, qty: 1 }];
    lines.push(`${ITEMS[id].name}${josa(ITEMS[id].name, '을', '를')} 발견했다.`);
  } else if (r < 0.75) {
    gold = randInt(4, 12) + Math.floor(st.majesty / 3);
    lines.push(`누군가 흘리고 간 금화 ${gold}닢을 주웠다.`);
  } else {
    lines.push('특별한 것은 찾지 못했지만, 이곳 지리를 조금 더 알게 되었다.');
  }
  d.gold += gold;
  const xp = 6;
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
  const power = st.claw + st.wing * 0.5 + d.level * 2;
  const chance = Math.max(0.15, Math.min(0.9, 0.55 + (power - (12 + c.level * 3)) * 0.04));
  const win = Math.random() < chance;
  const rawDmg = randInt(3, 6) * c.level * (win ? 1 : 1.4);
  const dmg = Math.max(1, Math.round(rawDmg - st.scale * 0.4));
  d.hp = Math.max(1, d.hp - dmg);

  const lines = [];
  let items = [];
  let gold = 0;
  let xp;
  if (win) {
    lines.push(`${c.name}${josa(c.name, '을', '를')} 쓰러뜨렸다. 체력을 ${dmg} 잃었다.`);
    const ids = ['beast_hide'];
    if (Math.random() < 0.3 + c.level * 0.05) ids.push('sharp_fang');
    items = bundle(ids);
    gold = randInt(0, 3) * c.level;
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
  const levelUp = gainXp(d, xp);
  return { title: '사냥', lines, items, gold, xp, levelUp, win };
}

// ── 원정 ───────────────────────────────────────────
function startExpedition(d, minutes, now = Date.now()) {
  if (d.exp_end) return { error: '이미 원정을 떠나 있다.' };
  if (d.rest_at) return { error: RESTING };
  if (!RULES.expeditionMinutes.includes(minutes)) return { error: '고를 수 없는 원정 시간이다.' };
  d.exp_start = now;
  d.exp_end = now + minutes * 60 * 1000;
  d.exp_region = d.region;
  return { ok: true };
}

// 도착했거나 일찍 불러들였을 때. 지난 시간만큼 보상
function finishExpedition(d, now = Date.now()) {
  if (!d.exp_end) return { error: '원정을 떠나 있지 않다.' };
  const st = statsOf(d);
  const extra = bonusOf(d).expRare;
  const planned = (d.exp_end - d.exp_start) / 60000;
  const done = Math.max(0, Math.min(planned, (now - d.exp_start) / 60000));
  const early = done < planned;
  const region = d.exp_region || d.region;
  const where = REGIONS[region].name;

  const rolls = Math.floor(done / 10);
  const hours = planned / 60;
  const ids = [];
  for (let i = 0; i < rolls; i++) {
    ids.push(rollItem(region, {
      uncommon: 0.16 + hours * 0.03 + st.wisdom * 0.004,
      rare: 0.015 + hours * 0.012 + st.wisdom * 0.001 + extra,
    }));
  }
  const items = bundle(ids);
  const gold = Math.round(done * rand(0.4, 0.8)) + (rolls ? Math.floor(st.majesty / 2) : 0);
  const xp = Math.round(done * 0.8);

  const lines = [`${where} 깊은 곳으로 떠났다.`];
  if (rolls === 0) {
    lines.push('멀리 가지 못하고 금세 돌아왔다.');
  } else {
    const nScenes = Math.min(3, 1 + Math.floor(done / 60));
    lines.push(...shuffle(SCENES[region]).slice(0, nScenes));
    const rare = items.find((it) => ITEMS[it.id].rarity === 'rare');
    if (rare) lines.push(`그리고 ${ITEMS[rare.id].name}${josa(ITEMS[rare.id].name, '을', '를')} 손에 넣었다.`);
    lines.push(early ? '부름을 받고 서둘러 돌아왔다.' : '긴 여정을 마치고 돌아왔다.');
  }

  d.gold += gold;
  const levelUp = gainXp(d, xp);
  d.exp_start = null;
  d.exp_end = null;
  d.exp_region = null;
  return { title: early ? '원정 (일찍 돌아옴)' : '원정', lines, items, gold, xp, levelUp, minutes: Math.round(done) };
}

// ── 제작 ───────────────────────────────────────────
// have(id): 지금 가진 개수를 알려주는 함수 (저장 공간에서 읽음)
function craft(d, outId, have) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  const r = RECIPES.find((x) => x.out === outId);
  if (!r) return { error: '알 수 없는 제작법이다.' };
  const st = statsOf(d);
  if (st.wisdom < r.wis) return { error: `지혜가 ${r.wis} 이상이어야 만들 수 있다.` };
  if (d.en < r.en) return { error: `기력이 모자란다. (${r.en} 필요)` };
  for (const [id, n] of Object.entries(r.needs)) {
    if (have(id) < n) return { error: `${ITEMS[id].name}${josa(ITEMS[id].name, '이', '가')} 모자란다.` };
  }
  if (d.en >= enCap(d)) d.en_at = Date.now();
  d.en -= r.en;
  const items = Object.entries(r.needs).map(([id, n]) => ({ id, qty: -n }));
  items.push({ id: r.out, qty: 1 });
  const xp = 4 + Math.floor(r.en / 2);
  const levelUp = gainXp(d, xp);
  const name = ITEMS[r.out].name;
  return { title: '제작', lines: [`${name}${josa(name, '을', '를')} 만들었다.`], items, made: [{ id: r.out, qty: 1 }], gold: 0, xp, levelUp };
}

// ── 회복약 사용 ────────────────────────────────────
function useItem(d, id, have) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  const it = ITEMS[id];
  if (!it || it.type !== 'use') return { error: '쓸 수 없는 물건이다.' };
  if (have(id) < 1) return { error: '가지고 있지 않다.' };
  const u = it.use;
  const lines = [];
  if (u.hp) {
    if (d.hp >= hpCap(d)) return { error: '체력이 이미 가득 차 있다.' };
    const before = d.hp;
    d.hp = Math.min(hpCap(d), d.hp + u.hp);
    lines.push(`체력이 ${d.hp - before} 회복되었다.`);
  }
  if (u.en) {
    if (d.en >= enCap(d)) return { error: '기력이 이미 가득 차 있다.' };
    const before = d.en;
    d.en = Math.min(enCap(d), d.en + u.en);
    lines.push(`기력이 ${d.en - before} 회복되었다.`);
  }
  if (u.ap) {
    if (d.ap >= d.ap_max) return { error: '행동력이 이미 가득 차 있다.' };
    const before = d.ap;
    d.ap = Math.min(d.ap_max, d.ap + u.ap);
    if (d.ap >= d.ap_max) d.ap_at = Date.now();
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
  const lines = {
    friendly: '인간과 어울려 살기로 마음먹었다.',
    hermit: '인간의 눈을 피해 조용히 살기로 했다.',
    hostile: '인간에게 발톱을 드러내기로 했다.',
  };
  return { title: '성향', lines: [lines[stance]] };
}

// ── 시장 ───────────────────────────────────────────
// 성향과 평판에 따라 사고파는 값이 달라짐
//   우호: 평판이 높을수록 잘 쳐줌, 거래할 때마다 평판 +1
//   은둔: 사람 모습으로 섞여 거래. 값은 조금 손해, 평판은 그대로
//   적대: 상인이 거래하지 않음 (대신 위협하기)
function priceRates(d, region) {
  const rep = repOf(d)[region] || 0;
  if (d.stance === 'hermit') return { sell: 0.5, buy: 1.15 };
  return { sell: 0.6 * (1 + rep / 250), buy: 1 - rep / 400 };
}
function marketCheck(d) {
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  if (d.rest_at) return { error: RESTING };
  const shop = SHOPS[d.region];
  if (!shop) return { error: '이곳에는 시장이 없다.' };
  if (d.stance === 'hostile') return { error: '상인들이 드래곤을 보자마자 가게 문을 닫았다.' };
  const rep = repOf(d)[d.region] || 0;
  if (d.stance === 'friendly' && rep < TRADE.refuseBelow) return { error: '상인들이 아직 지난 일을 잊지 않았다. 거래를 거절한다.' };
  return null;
}
const sellPrice = (d, id) => Math.max(1, Math.floor(ITEMS[id].value * priceRates(d, d.region).sell));
const buyPrice = (d, id) => Math.ceil(ITEMS[id].value * priceRates(d, d.region).buy);

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
    buy: shop.map((id) => ({ id, price: buyPrice(d, id) })),
    sell: invList.filter((x) => ITEMS[x.item]).map((x) => ({ id: x.item, qty: x.qty, price: sellPrice(d, x.item) })),
  };
}

function buy(d, id, qty, have) {
  const err = marketCheck(d);
  if (err) return err;
  if (!SHOPS[d.region].includes(id)) return { error: '이 시장에서는 팔지 않는 물건이다.' };
  qty = Math.max(1, Math.min(20, Math.floor(qty) || 1));
  const cost = buyPrice(d, id) * qty;
  if (d.gold < cost) return { error: `금화가 모자란다. (${cost}닢 필요)` };
  d.gold -= cost;
  if (d.stance === 'friendly') addRep(d, d.region, 1);
  const name = ITEMS[id].name;
  return {
    title: '시장',
    lines: [`금화 ${cost}닢을 내고 ${name}${qty > 1 ? ` ${qty}개` : ''}${josa(qty > 1 ? '개' : name, '을', '를')} 샀다.`],
    items: [{ id, qty }],
  };
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
  if (d.stance === 'friendly') addRep(d, d.region, 1);
  const name = ITEMS[id].name;
  return {
    title: '시장',
    lines: [`${name}${qty > 1 ? ` ${qty}개` : ''}${josa(qty > 1 ? '개' : name, '을', '를')} 팔고 금화 ${gain}닢을 받았다.`],
    items: [{ id, qty: -qty }],
  };
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
  const chance = Math.max(0.15, Math.min(0.9, 0.4 + (st.majesty - 12) * 0.04 + d.level * 0.02 - prepared));
  let items = [];
  let gold = 0;
  const lines = [];
  if (Math.random() < chance) {
    gold = randInt(15, 35) + st.majesty;
    lines.push(`${where} 하늘을 낮게 돌며 포효하자, 인간들이 서둘러 공물을 내왔다.`);
    if (Math.random() < 0.4) {
      const id = pick(SHOPS[d.region]);
      items = [{ id, qty: 1 }];
      lines.push(`금화 ${gold}닢과 ${ITEMS[id].name}${josa(ITEMS[id].name, '을', '를')} 빼앗았다.`);
    } else {
      lines.push(`금화 ${gold}닢을 빼앗았다.`);
    }
    addRep(d, d.region, -12);
  } else {
    const dmg = Math.max(3, Math.round(randInt(8, 16) - st.scale * 0.3));
    d.hp = Math.max(1, d.hp - dmg);
    lines.push(`성벽 위 궁수들이 화살을 퍼부었다. 체력을 ${dmg} 잃고 물러났다.`);
    addRep(d, d.region, -4);
  }
  d.gold += gold;
  const xp = 8;
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
  const lines = moving
    ? [`${REGIONS[from].name}의 둥지를 버리고 ${where}에 새 둥지를 틀었다.`, '보물더미도 하나도 빠짐없이 옮겨 왔다.']
    : [`${where}에 둥지를 틀었다.`, '이제 이곳에서 쉬고, 보물을 쌓을 수 있다.'];
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

module.exports = {
  regen, gather, explore, hunt, startExpedition, finishExpedition,
  craft, useItem, equip, unequip, statsOf, bonusOf, hpCap, enCap, equipOf,
  repOf, setStance, marketInfo, buy, sell, intimidate,
  buildNest, flyHome, startRest, stopRest, hoardMove, hoardValue,
};
