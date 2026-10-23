// ── 자유 제작: 재료의 성질로 물건을 빚음 (실험) ─────────────────────
// 설계서: 바탕(먹을거리·엮음)이 종류를, 효능이 효과를, 기운(불·얼음·독·혼)이 덧입힘을 정함
const { ITEMS, FREE } = require('./game-data');

const T = FREE.tagNames;
const tagsOf = (id) => FREE.tags[id] || {};
const FOOD_EFF = ['life', 'vigor', 'clear'];
const GEAR_EFF = ['hard', 'sharp', 'light', 'lore', 'shine'];
const AURA = ['fire', 'frost', 'venom', 'soul'];
const GEAR_STAT = { hard: 'scale', sharp: 'claw', light: 'wing', lore: 'wisdom', shine: 'majesty' };
const SLOT_WORD = { claw: '발톱덮개', wing: '날개덮개', tail: '꼬리고리', neck: '목걸이', head: '관', charm: '부적' };
const FOOD_WORD = { life: '탕', vigor: '차', clear: '꽃물' };
const AURA_WORD = { fire: '불꽃 ', frost: '서리 ', venom: '독기 어린 ', soul: '혼이 깃든 ' };
const ELEM = { fire: 'fire', frost: 'ice', venom: 'poison' }; // 장신구 각인 속성

// 넣은 순서대로 성질의 세기를 더함. first[t]: 그 성질을 처음 준 재료의 차례 (비길 때 앞선 것)
function sumTags(ids) {
  const sum = {}, first = {}, best = {};
  ids.forEach((id, i) => {
    for (const [t, n] of Object.entries(tagsOf(id))) {
      sum[t] = (sum[t] || 0) + n;
      if (first[t] == null) first[t] = i;
      if (!best[t] || n > best[t].n) best[t] = { id, n }; // 그 성질이 가장 센 재료 (이름 짓기에 씀)
    }
  });
  return { sum, first, best };
}
const pickTop = (keys, sum, first) => keys.filter((k) => sum[k] > 0).sort((a, b) => sum[b] - sum[a] || first[a] - first[b]);
// 운: 보통 · 좋음 · 빼어남
function rollQuality(rnd = Math.random) {
  const r = rnd();
  return r < FREE.luck.great ? 'great' : r < FREE.luck.great + FREE.luck.good ? 'good' : 'normal';
}
const wisCap = (wis) => { for (const [w, cap] of FREE.gearCap) if (wis <= w) return cap; return FREE.gearCap.at(-1)[1]; };

// 결과 정하기 (재료는 아직 빼지 않음). wis: 지금 지혜, great: 제작 대성공 확률
function resolve(ids, wis, greatChance, rnd = Math.random) {
  const { sum, first, best } = sumTags(ids);
  const food = sum.food || 0, bind = sum.bind || 0;
  const aura = pickTop(AURA, sum, first)[0] || null;
  const value = Math.max(1, Math.round(ids.reduce((a, id) => a + (ITEMS[id]?.value || 1), 0) * FREE.valueMul));
  if (!food && !bind) return { fail: '바탕이 없었다. 먹을거리나 엮음이 되는 재료가 하나는 있어야 한다.', sum, value };
  if (food === bind) return { fail: '먹을거리와 엮음이 팽팽하게 맞서 어느 쪽도 되지 못했다.', sum, value };
  const quality = rollQuality(rnd);
  const qmul = { normal: 1, good: FREE.foodLuck.good, great: FREE.foodLuck.great }[quality];
  if (food > bind) {
    const effs = pickTop(FOOD_EFF, sum, first);
    if (!effs.length) return { fail: '먹을 수는 있겠지만 아무 힘도 깃들지 않았다. 생기·기운·맑음이 필요하다.', sum, value };
    const cap = quality === 'normal' ? FREE.foodCap : FREE.foodCapLucky;
    let hp = (sum.life || 0) * FREE.food.life, en = (sum.vigor || 0) * FREE.food.vigor, mind = (sum.clear || 0) * FREE.food.clear;
    const use = {};
    if (aura === 'fire') en *= 1.2;
    if (aura === 'frost') hp *= 1.2;
    if (aura === 'soul') mind += 3;
    if (aura === 'venom') { hp *= 0.7; en *= 0.7; use.buff = 'frenzy'; }
    hp = Math.min(cap.hp, Math.round(hp * qmul)); en = Math.min(cap.en, Math.round(en * qmul)); mind = Math.min(cap.mind, Math.round(mind * qmul));
    if (hp) use.hp = hp; if (en) use.en = en; if (mind) use.mind = mind;
    const top = effs[0];
    const main = best[top]?.id;
    const name = `${aura ? AURA_WORD[aura] : ''}${ITEMS[main]?.name || ''} ${FOOD_WORD[top]}`.trim();
    const pts = hp / 30 + en / 20 + mind / 4;
    return { kind: 'food', top, aura, quality, use, name, sum, value: Math.round(value * { normal: 1, good: 1.5, great: 2 }[quality]), rarity: pts >= 5 ? 'rare' : pts >= 2.5 ? 'uncommon' : 'common' };
  }
  const effs = pickTop(GEAR_EFF, sum, first);
  if (!effs.length) return { fail: '모양은 잡혔지만 힘이 깃들지 않았다. 단단함·날카로움·가벼움·옛 지혜·빛남이 필요하다.', sum, value };
  const top = effs[0], second = effs[1] || null;
  const slot = top === 'sharp' ? 'claw' : top === 'light' ? 'wing' : top === 'hard' ? (bind > sum.hard ? 'neck' : 'tail') : top === 'lore' ? (bind > sum.lore ? 'charm' : 'head') : (bind > sum.shine ? 'head' : 'neck');
  const base = wisCap(wis);
  let pts = Math.min(base, Math.ceil(effs.reduce((a, k) => a + sum[k], 0) * FREE.gearRate)); // 효능 세기 합 × 0.7 (올림)에서 지혜 상한으로 자름
  const extra = { normal: 0, good: 1, great: 2 }[quality];
  const mw = rnd() < greatChance; // 대성공: 걸작
  pts += Math.min(2, extra + (mw ? 1 : 0)); // 기본 상한 위로는 +2까지
  if (aura) pts = Math.max(1, pts - 1); // 기운에 점수 1을 씀
  const bonus = {};
  if (second && pts > 1) { const a = Math.ceil(pts * 0.6); bonus[GEAR_STAT[top]] = a; if (pts - a > 0) bonus[GEAR_STAT[second]] = pts - a; }
  else bonus[GEAR_STAT[top]] = pts;
  const def = { bonus };
  if (aura && ELEM[aura]) def.elem = ELEM[aura];
  if (aura === 'soul') def.mindWard = 0.85;
  const main = best[top]?.id;
  const name = `${aura ? AURA_WORD[aura] : ''}${ITEMS[main]?.name || ''} ${SLOT_WORD[slot]}`.trim();
  return { kind: 'gear', top, aura, quality, mw, slot, def, name, sum, value: Math.round(value * { normal: 1, good: 1.5, great: 2 }[quality] * (mw ? 1.3 : 1)), rarity: pts >= 5 ? 'rare' : pts >= 3 ? 'uncommon' : 'common' };
}
// 창작 도감의 열쇠: 종류 + (먹는 것: 주된 효능 / 장신구: 부위) + 기운
const creationKey = (r) => `${r.kind}:${r.kind === 'food' ? r.top : r.slot}:${r.aura || '-'}`;
const creationLabel = (r) => `${r.aura ? `${T[r.aura]} 깃든 ` : ''}${r.kind === 'food' ? `${T[r.top]}의 먹을거리` : `${({ claw: '발톱', wing: '날개', tail: '꼬리', neck: '목', head: '머리', charm: '부적' })[r.slot]} 장신구`}`;
// 같은 드래곤이 같은 재료로 같은 품질을 빚으면 같은 물건 (겹쳐 쌓임)
function signature(dragonId, ids, r) { return `${dragonId}|${ids.slice().sort().join('+')}|${r.quality}|${r.mw ? 1 : 0}`; }
function hashId(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return `cx_${h.toString(36)}`; }
const NAME_RE = /^[가-힣A-Za-z0-9 ·'\-]{2,12}$/;

module.exports = { tagsOf, sumTags, resolve, creationKey, creationLabel, signature, hashId, NAME_RE };
