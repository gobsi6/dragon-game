// ── 자유 제작: 재료의 성질로 물건을 빚음 (실험) ─────────────────────
// 설계서: 바탕(먹을거리·엮음)이 종류를, 효능이 효과를, 기운(불·얼음·독·혼)이 덧입힘을 정함
const { ITEMS, FREE, SHOPS, SHOPS_SPECIAL } = require('./game-data');
// 상점에서 금화로 살 수 있는 재료 (값을 낮춰 셈)
const SHOP_MATS = new Set([...Object.values(SHOPS || {}).flat(), ...Object.values(SHOPS_SPECIAL || {}).flat()].map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean));
const matValue = (id) => (ITEMS[id]?.value || 1) * (SHOP_MATS.has(id) ? FREE.shopMatValue : 1);

const T = FREE.tagNames;
const tagsOf = (id) => FREE.tags[id] || {};
const FOOD_EFF = ['life', 'vigor', 'clear'];
const GEAR_EFF = ['hard', 'sharp', 'light', 'lore', 'shine'];
const AURA = ['fire', 'frost', 'venom', 'soul'];
const GEAR_STAT = { hard: 'scale', sharp: 'claw', light: 'wing', lore: 'wisdom', shine: 'majesty' };
// ── 이름 짓기: 재료와 성질의 특징을 엮어 이름을 만듦 (같은 물건은 늘 같은 이름) ──
// 형태: 보통 · 좋음 · 빼어남마다 다른 말
const SLOT_WORD = {
  claw: [['발톱덮개', '발톱싸개'], ['발톱갑'], ['용발톱']],
  wing: [['날개덮개', '날개띠'], ['날개옷'], ['날개막']],
  tail: [['꼬리고리', '꼬리감개'], ['꼬리갑'], ['꼬리날']],
  neck: [['목걸이', '목가리개'], ['목장식'], ['보석 목걸이']],
  head: [['관', '머리장식'], ['투구'], ['왕관']],
  charm: [['부적', '매듭'], ['인장'], ['비약 부적']],
};
const FOOD_WORD = { life: [['탕', '죽'], ['보양탕'], ['선약']], vigor: [['차', '강장제'], ['강장차'], ['영약']], clear: [['꽃물', '향차'], ['맑은 차'], ['이슬']] };
// 기운: 맨 앞에 붙는 말
const AURA_WORD = { fire: ['불꽃', '타오르는', '불씨 품은'], frost: ['서리', '얼어붙은', '눈보라'], venom: ['독기 어린', '독니', '검붉은'], soul: ['혼이 깃든', '잿빛', '넋 서린'] };
// 두 번째로 센 성질: 그 앞에 붙는 꾸밈말
const EFF_WORD = { hard: ['단단한', '굳센'], sharp: ['날 선', '서슬 퍼런'], light: ['가벼운', '바람결'], lore: ['오래된', '옛'], shine: ['빛나는', '찬란한'], life: ['든든한', '푸릇한'], vigor: ['뜨끈한', '힘찬'], clear: ['맑은', '고요한'] };
// 재료 이름을 짧게 (이름이 길어지지 않게)
const SHORT = { spider_silk: '거미줄', wolf_pelt: '늑대털', beast_hide: '가죽', black_reed: '검은 갈대', silk_scrap: '비단', silver_chain: '은사슬', void_silk: '공허실', living_bark: '나무껍질', wyvern_membrane: '와이번', hydra_blood: '히드라', heartwood: '고목', volcanic_ash: '화산재', salamander_tail: '불도마뱀', sun_stone: '태양석', giant_ember: '거인불씨', star_shard: '별조각', purify_shard: '정화', star_fragment: '별똥별', red_clay: '점토', croc_scale: '악어비늘', bison_horn: '들소뿔', bog_iron: '늪철', troll_tusk: '트롤엄니', stone_heart: '돌심장', carnem_steel: '카르넴', cursed_steel: '저주강철', blackened_scale: '검은 비늘', frost_heart: '서리심장', scorpion_stinger: '전갈침', sharp_fang: '송곳니', obsidian: '흑요석', sandworm_tooth: '모래이빨', sphinx_mane: '스핑크스', griffin_feather: '그리핀', ice_shard: '얼음', rune_stone: '룬', old_scroll: '두루마리', faded_crest: '왕국 문장', ancient_relic: '고대', seal_core: '봉인', brass_button: '놋쇠', sea_shell: '조개', amber: '호박', gold_ore: '금', rival_scale: '라이벌', bog_pearl: '늪진주', deep_pearl: '심해진주', lost_seal: '인장', knight_crest: '기사단', crown_shard: '왕관', fire_crystal: '불결정', magma_core: '용암', elder_ember: '고룡불씨', frost_lichen: '서리이끼', eternal_ice: '만년빙', poison_herb: '독초', toad_gland: '두꺼비', shadow_spore: '그늘포자', ashen_dust: '잿먼지', ghost_ash: '망령', corrupt_crystal: '오염', ashen_core: '잿빛 심장', basilisk_eye: '바실리스크', calamity_core: '재앙', grass_seed: '들풀', wild_flower: '들꽃', sea_bindweed: '갯메꽃', salt_crystal: '소금', wild_honey: '꿀', moss_flower: '이끼꽃', snow_flower: '눈꽃', glow_moss: '빛이끼', silver_clover: '은토끼풀' };
const pickBy = (arr, seed) => arr[seed % arr.length];
const seedOf = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
// 기운 → 꾸밈말 → 주재료 → 형태. 길면(14자 넘으면) 꾸밈말부터 뺌
function makeName({ ids, aura, second, main, form, quality, mw = false }) {
  const seed = seedOf(ids.slice().sort().join('+'));
  const q = { normal: 0, good: 1, great: 2 }[quality] || 0;
  const parts = [aura ? pickBy(AURA_WORD[aura], seed) : '', second ? pickBy(EFF_WORD[second], seed >>> 3) : '', SHORT[main] || ITEMS[main]?.name || '', pickBy(form[q], seed >>> 5)];
  const pre = mw ? '걸작 ' : ''; // 걸작이면 정식 장신구처럼 이름 앞에
  const max = mw ? 17 : 14;      // '걸작 ' 세 자만큼 더 허락
  let name = pre + parts.filter(Boolean).join(' ');
  if (name.length > max) name = pre + [parts[0], parts[2], parts[3]].filter(Boolean).join(' ');
  if (name.length > max) name = pre + [parts[2], parts[3]].filter(Boolean).join(' ');
  return name;
}
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
  const value = Math.max(1, Math.round(ids.reduce((a, id) => a + matValue(id), 0) * FREE.valueMul));
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
    const name = makeName({ ids, aura, second: effs[1] || null, main, form: FOOD_WORD[top], quality });
    const pts = hp / 30 + en / 20 + mind / 4;
    return { kind: 'food', top, aura, quality, use, name, sum, value: Math.round(value * { normal: 1, good: 1.5, great: 2 }[quality]), rarity: pts >= 5 ? 'rare' : pts >= 2.5 ? 'uncommon' : 'common' };
  }
  const effs = pickTop(GEAR_EFF, sum, first);
  if (!effs.length) return { fail: '모양은 잡혔지만 힘이 깃들지 않았다. 단단함·날카로움·가벼움·옛 지혜·빛남이 필요하다.', sum, value };
  const top = effs[0], second = effs[1] || null;
  const slot = top === 'sharp' ? 'claw' : top === 'light' ? 'wing' : top === 'hard' ? (bind > sum.hard ? 'neck' : 'tail') : top === 'lore' ? (bind > sum.lore ? 'charm' : 'head') : (bind > sum.shine ? 'head' : 'neck');
  const base = wisCap(wis);
  let pts = Math.min(base, Math.ceil(effs.reduce((a, k) => a + sum[k], 0) * FREE.gearRate)); // 효능 세기 합 × 0.65 (올림)에서 지혜 상한으로 자름
  const extra = { normal: 0, good: 1, great: 2 }[quality];
  const mw = rnd() < greatChance; // 대성공: 걸작
  pts += Math.min(2, extra + (mw ? 1 : 0)); // 기본 상한 위로는 +2까지
  // 능력치 합의 끝: 8점은 멸망한 대륙 재료가 하나라도 있어야 (정식 장신구도 8점부터는 그 땅의 재료가 듦)
  pts = Math.min(pts, ids.some((id) => FREE.ruinMats.includes(id)) ? FREE.topSum : FREE.plainTopSum);
  if (aura) pts = Math.max(1, pts - 1); // 기운에 점수 1을 씀
  // 나누기: 가장 센 효능에 6할, 나머지는 두 번째 효능에. 한 능력치는 상한(보통 5 · 운이 좋으면 6)을 넘지 못함
  const cap = quality !== 'normal' || mw ? FREE.statCapLucky : FREE.statCap;
  const bonus = {};
  let a = second && pts > 1 ? Math.ceil(pts * 0.6) : pts;
  a = Math.min(cap, a);
  bonus[GEAR_STAT[top]] = a;
  if (second) { const b = Math.min(cap, pts - a); if (b > 0) bonus[GEAR_STAT[second]] = b; }
  const def = { bonus };
  if (aura && ELEM[aura]) def.elem = ELEM[aura];
  if (aura === 'soul') def.mindWard = 0.85;
  const main = best[top]?.id;
  const name = makeName({ ids, aura, second, main, form: SLOT_WORD[slot], quality, mw });
  return { kind: 'gear', top, aura, quality, mw, slot, def, name, sum, value: Math.round(value * { normal: 1, good: 1.5, great: 2 }[quality] * (mw ? 1.3 : 1)), rarity: pts >= 5 ? 'rare' : pts >= 3 ? 'uncommon' : 'common' };
}
// ── 선물로 빚기: 능력치·회복 없이 보물 상자에 간직할 물건. 가장 센 성질이 모양을 정함 ──
const GIFT_FORM = {
  shine: [['장식', '보석 장식'], ['보석함'], ['왕관 장식']], clear: [['방울', '풍경'], ['수정 방울'], ['별 방울']],
  light: [['깃털 장식', '바람개비'], ['날개 장식'], ['구름 장식']], hard: [['조각상', '돌 조각'], ['석상'], ['수호상']],
  sharp: [['칼 장식'], ['은장도'], ['보검 장식']], lore: [['두루마리', '책갈피'], ['비망록'], ['고서']],
  life: [['화분', '씨앗 주머니'], ['작은 정원'], ['꽃 정원']], vigor: [['등잔'], ['등불'], ['횃불 장식']],
  food: [['꽃묶음', '꽃다발'], ['꽃바구니'], ['꽃 화환']], bind: [['매듭 장식', '엮은 장식'], ['자수 걸개'], ['태피스트리']],
  fire: [['등불'], ['화로 장식'], ['불꽃 등']], frost: [['얼음꽃', '눈송이 장식'], ['서리 장식'], ['서리 왕관']],
  venom: [['보랏빛 병'], ['독병 장식'], ['검은 성배']], soul: [['수정 구슬', '넋 구슬'], ['혼 등불'], ['혼의 수정']],
};
function resolveGift(ids, rnd = Math.random) {
  const { sum, first } = sumTags(ids);
  const all = Object.keys(sum).filter((k) => sum[k] > 0).sort((a, b) => sum[b] - sum[a] || first[a] - first[b]);
  const quality = rollQuality(rnd);
  const value0 = Math.max(1, Math.round(ids.reduce((a, id) => a + matValue(id), 0) * FREE.valueMul));
  const top = all[0] || 'bind';
  const aura = AURA.includes(top) ? null : pickTop(AURA, sum, first)[0] || null;
  // 주재료: 성질 세기 합이 가장 큰 재료 (비기면 앞선 것)
  const power = (id) => Object.values(tagsOf(id)).reduce((a, n) => a + n, 0);
  const main = ids.slice().sort((a, b) => power(b) - power(a) || ids.indexOf(a) - ids.indexOf(b))[0];
  const name = makeName({ ids, aura, second: null, main, form: GIFT_FORM[top] || GIFT_FORM.bind, quality });
  const value = Math.round(value0 * { normal: 1, good: 1.5, great: 2 }[quality]);
  return { kind: 'gift', top, aura, quality, name, sum, value, rarity: value >= 120 ? 'rare' : value >= 40 ? 'uncommon' : 'common', use: { keep: 'custom' } };
}
// 창작 도감의 열쇠: 종류 + (먹는 것: 주된 효능 / 장신구: 부위) + 기운
const creationKey = (r) => `${r.kind}:${r.kind === 'gear' ? r.slot : r.top}:${r.aura || '-'}`;
const creationLabel = (r) => `${r.aura ? `${T[r.aura]} 깃든 ` : ''}${r.kind === 'food' ? `${T[r.top]}의 먹을거리` : r.kind === 'gift' ? `${T[r.top]}의 선물` : `${({ claw: '발톱', wing: '날개', tail: '꼬리', neck: '목', head: '머리', charm: '부적' })[r.slot]} 장신구`}`;
// 같은 드래곤이 빚은 것 중 효과가 같으면 같은 물건 (재료가 달라도 겹쳐 쌓임 → 빚은 물건이 끝없이 늘지 않게)
function signature(dragonId, ids, r) {
  if (r.kind === 'gift') return `v2|${dragonId}|gift|${r.name}|${r.value}|${r.quality}`; // 선물: 이름과 가치가 같으면 같은 것
  const eff = r.kind === 'food' ? r.use : { slot: r.slot, ...r.def };
  const key = JSON.stringify(eff, Object.keys(eff).sort()) + JSON.stringify(eff.bonus || {}, Object.keys(eff.bonus || {}).sort());
  return `v2|${dragonId}|${r.kind}|${key}|${r.quality}|${r.mw ? 1 : 0}`;
}
function hashId(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return `cx_${h.toString(36)}`; }
const NAME_RE = /^[가-힣A-Za-z0-9 ·'\-]{2,12}$/;

module.exports = { tagsOf, sumTags, resolve, resolveGift, creationKey, creationLabel, signature, hashId, NAME_RE };
