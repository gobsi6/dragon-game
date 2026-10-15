// 게임 기본 데이터: 드래곤 종류와 대륙 지도
// 새 종류나 지역을 추가할 때는 이 파일만 고치면 됩니다.

// 능력치. 키 이름은 저장 공간의 열 이름과 같습니다.
const STATS = [
  { key: 'claw',    name: '발톱', desc: '공격할 때 입히는 피해가 커진다.' },
  { key: 'scale',   name: '비늘', desc: '최대 체력이 늘고 받는 피해가 줄어든다.' },
  { key: 'wing',    name: '날개', desc: '공격을 잘 피하고, 먼저 움직이며, 빠르게 난다.' },
  { key: 'wisdom',  name: '지혜', desc: '마법과 제작에 능하고, 숨은 것을 잘 찾아낸다.' },
  { key: 'majesty', name: '위엄', desc: '인간을 설득하거나 위협하는 힘이 커진다.' },
];

// 처음 만들 때 나눠 주는 자유 포인트
const CREATION = {
  points: 10,   // 모두 써야 시작할 수 있음
  perStat: 5,   // 한 능력치에 넣을 수 있는 최대치
};

// 능력치에서 나오는 값
const derive = (st) => ({
  hpMax: 50 + st.scale * 5,
  enMax: 30 + st.wisdom * 2,
});

// 종류별 기본 능력치는 합이 모두 45가 되도록 맞춤
const KINDS = {
  black: {
    name: '블랙 드래곤',
    breath: '산(酸)',
    home: 'swamp',
    desc: '늪의 안개 속에 사는 잿빛 비늘의 드래곤. 위협과 약탈에 능하다.',
    stats: { claw: 12, scale: 9, wing: 8, wisdom: 7, majesty: 9 },
  },
  gold: {
    name: '골드 드래곤',
    breath: '번개',
    home: 'canyon',
    desc: '햇빛을 머금은 비늘의 드래곤. 보물을 알아보는 눈과 말솜씨가 있고, 노하면 하늘에서 심판의 번개를 내린다.',
    stats: { claw: 8, scale: 9, wing: 7, wisdom: 11, majesty: 10 },
  },
  white: {
    name: '화이트 드래곤',
    breath: '눈보라',
    home: 'snow',
    desc: '설원의 고요를 사랑하는 드래곤. 홀로 지내는 데 익숙하며, 날갯짓 한 번에 눈보라가 인다.',
    stats: { claw: 9, scale: 11, wing: 10, wisdom: 7, majesty: 8 },
  },
  green: {
    name: '그린 드래곤',
    breath: '독',
    home: 'forest',
    desc: '숲의 이끼와 약초를 잘 아는 드래곤. 속내를 쉽게 드러내지 않는다.',
    stats: { claw: 7, scale: 8, wing: 10, wisdom: 11, majesty: 9 },
  },
  red: {
    name: '레드 드래곤',
    breath: '화염',
    home: 'volcano',
    desc: '화산의 열기 속에서 태어난 드래곤. 자존심이 강하고 싸움을 피하지 않는다.',
    stats: { claw: 11, scale: 9, wing: 8, wisdom: 6, majesty: 11 },
  },
  silver: {
    name: '실버 드래곤',
    breath: '안개',
    home: 'capital',
    desc: '인간의 성벽 가까이에 둥지를 튼 드래곤. 은빛 안개로 정체를 감추고, 때로 사람의 모습으로 거리를 걷는다.',
    stats: { claw: 7, scale: 9, wing: 8, wisdom: 10, majesty: 11 },
  },
};

// x, y는 지도(가로 1000 × 세로 640, public/map-terrain.svg) 위의 위치.
// 지도 그림을 다시 그리면 이 좌표도 함께 맞춰야 합니다.
const REGION_LIST = [
  { id: 'plains',  name: '중앙 평원',    tag: '야생',     x: 500, y: 355,
    desc: '대륙 한가운데 펼쳐진 너른 풀밭. 사방으로 길이 갈라지고, 멀리 왕도의 탑이 보인다.' },
  { id: 'capital', name: '왕도 아르덴',  tag: '인간 왕국', x: 585, y: 225,
    desc: '인간들의 성벽 도시. 성루 위의 파수병들이 하늘을 올려다보며 수군거린다.' },
  { id: 'snow',    name: '북부 설원',    tag: '야생',     x: 470, y: 92,
    desc: '바람 소리 말고는 아무것도 들리지 않는 하얀 들판. 눈 아래 무언가 잠들어 있을지도 모른다.' },
  { id: 'ruins',   name: '고대 유적',    tag: '야생',     x: 215, y: 145,
    desc: '무너진 석주들 사이로 오래된 문양이 희미하게 빛난다. 누가 세웠는지 아는 이는 없다.' },
  { id: 'forest',  name: '독안개 숲',    tag: '야생',     x: 225, y: 350,
    desc: '초록빛 안개가 나무 사이를 낮게 흐른다. 이끼 낀 바닥에 낯선 약초가 자란다.' },
  { id: 'swamp',   name: '검은 늪',      tag: '야생',     x: 330, y: 535,
    desc: '검은 물이 소리 없이 고여 있는 늪지. 썩은 나무 그루터기 위로 거품이 올라온다.' },
  { id: 'coast',   name: '남쪽 해안 절벽', tag: '인간 왕국', x: 660, y: 550,
    desc: '파도가 부서지는 절벽 아래 작은 어촌이 있다. 어부들은 하늘의 그림자에 민감하다.' },
  { id: 'canyon',  name: '태양 협곡',    tag: '야생',     x: 800, y: 365,
    desc: '붉은 바위벽이 햇빛을 받아 금빛으로 달아오른다. 바위틈에 광맥이 드러나 있다.' },
  { id: 'volcano', name: '잿빛 화산',    tag: '야생',     x: 760, y: 125,
    desc: '잿가루가 눈처럼 내리는 화산 기슭. 땅 밑에서 낮은 울림이 올라온다.' },
];

// 서로 바로 날아갈 수 있는 지역 쌍 (양방향)
const ROUTES = [
  ['plains', 'capital'], ['plains', 'forest'], ['plains', 'swamp'],
  ['plains', 'canyon'], ['plains', 'coast'],
  ['capital', 'snow'], ['capital', 'volcano'],
  ['snow', 'ruins'], ['snow', 'volcano'],
  ['forest', 'ruins'], ['forest', 'swamp'],
  ['swamp', 'coast'],
  ['canyon', 'volcano'], ['canyon', 'coast'],
];

// 성향: 인간을 대하는 방식
const STANCES = { friendly: '우호', hermit: '은둔', hostile: '적대' };

const REGIONS = {};
for (const r of REGION_LIST) REGIONS[r.id] = { ...r, links: [] };
for (const [a, b] of ROUTES) {
  REGIONS[a].links.push(b);
  REGIONS[b].links.push(a);
}


// ── 재료와 물건 ──────────────────────────────────────
// rarity: common(흔함) / uncommon(드묾) / rare(귀함)
const ITEMS = {
  grass_seed:   { name: '들풀 씨앗',        rarity: 'common',   desc: '바람에 실려 온 작은 씨앗이다.' },
  wild_honey:   { name: '야생 꿀',          rarity: 'uncommon', desc: '들벌이 숨겨 둔 진한 꿀이다.' },
  silver_clover:{ name: '은빛 토끼풀',      rarity: 'rare',     desc: '달빛 아래에서만 잎이 은색으로 빛난다.' },
  brass_button: { name: '낡은 놋쇠 단추',   rarity: 'common',   desc: '인간의 옷에서 떨어진 단추다.' },
  silk_scrap:   { name: '비단 조각',        rarity: 'uncommon', desc: '시장 바닥에서 주운 고운 천이다.' },
  lost_seal:    { name: '잃어버린 인장',    rarity: 'rare',     desc: '어느 귀족 가문의 문장이 새겨져 있다.' },
  ice_shard:    { name: '얼음 결정',        rarity: 'common',   desc: '햇빛에 비추면 무지개가 맺힌다.' },
  frost_lichen: { name: '서리 이끼',        rarity: 'uncommon', desc: '눈 밑에서도 자라는 질긴 이끼다.' },
  eternal_ice:  { name: '녹지 않는 얼음',   rarity: 'rare',     desc: '불 곁에 두어도 차갑게 남아 있다.' },
  rune_stone:   { name: '룬이 새겨진 돌',   rarity: 'common',   desc: '알 수 없는 문자가 희미하게 남아 있다.' },
  old_scroll:   { name: '바랜 두루마리',    rarity: 'uncommon', desc: '글자의 절반이 지워져 있다.' },
  ancient_relic:{ name: '고대의 유물',      rarity: 'rare',     desc: '만지면 손끝이 저릿하다.' },
  poison_herb:  { name: '독초',             rarity: 'common',   desc: '잎 끝이 보랏빛으로 물들어 있다.' },
  glow_moss:    { name: '빛나는 이끼',      rarity: 'uncommon', desc: '어둠 속에서 은은하게 빛난다.' },
  heartwood:    { name: '고목의 심재',      rarity: 'rare',     desc: '천 년을 버틴 나무의 단단한 속이다.' },
  black_reed:   { name: '검은 갈대',        rarity: 'common',   desc: '늪물을 먹고 자라 줄기가 검다.' },
  bog_iron:     { name: '늪철',             rarity: 'uncommon', desc: '늪 바닥에 엉겨 붙은 붉은 쇠다.' },
  bog_pearl:    { name: '늪 진주',          rarity: 'rare',     desc: '탁한 물속에서 자란 검은 진주다.' },
  sea_shell:    { name: '조개껍데기',       rarity: 'common',   desc: '파도에 닳아 매끈하다.' },
  amber:        { name: '호박',             rarity: 'uncommon', desc: '안에 작은 벌레가 갇혀 있다.' },
  deep_pearl:   { name: '심해 진주',        rarity: 'rare',     desc: '깊은 바다에서 올라온 커다란 진주다.' },
  red_clay:     { name: '붉은 점토',        rarity: 'common',   desc: '햇볕에 구우면 단단해진다.' },
  gold_ore:     { name: '금광석',           rarity: 'uncommon', desc: '바위틈에서 캐낸 금빛 돌이다.' },
  sun_stone:    { name: '태양석',           rarity: 'rare',     desc: '한낮의 열기를 품고 있다.' },
  volcanic_ash: { name: '화산재',           rarity: 'common',   desc: '손가락 사이로 곱게 흘러내린다.' },
  obsidian:     { name: '흑요석',           rarity: 'uncommon', desc: '깨진 면이 칼날처럼 날카롭다.' },
  fire_crystal: { name: '불의 결정',        rarity: 'rare',     desc: '안에서 작은 불꽃이 흔들린다.' },
  beast_hide:   { name: '짐승 가죽',        rarity: 'common',   desc: '질기고 두꺼운 가죽이다.' },
  sharp_fang:   { name: '날카로운 송곳니',  rarity: 'uncommon', desc: '사냥한 짐승에게서 얻었다.' },

  // ── 만든 물건: 회복약 (use: 사용 효과) ──
  honey_salve:  { name: '꿀 고약',          rarity: 'common',   type: 'use', use: { hp: 30 },  desc: '상처에 바르면 금세 아문다.' },
  moss_salve:   { name: '이끼 고약',        rarity: 'uncommon', type: 'use', use: { hp: 70 },  desc: '빛나는 이끼가 상처를 차갑게 덮는다.' },
  ember_tea:    { name: '불씨 차',          rarity: 'common',   type: 'use', use: { en: 25 },  desc: '마시면 속이 뜨거워지고 기운이 돈다.' },
  sun_breath:   { name: '태양의 숨결',      rarity: 'rare',     type: 'use', use: { ap: 4 },   desc: '한 모금 들이켜면 날개에 힘이 솟는다.' },

  // ── 만든 물건: 장신구 (slot: 착용 자리, bonus: 능력치, expRare: 원정 귀한 물건 확률) ──
  frost_plume:  { name: '서리 깃장식',      rarity: 'uncommon', type: 'equip', slot: 'head',  bonus: { wing: 2 },             desc: '얼음 결정을 엮은 머리 장식이다.' },
  fire_crown:   { name: '불꽃 관',          rarity: 'rare',     type: 'equip', slot: 'head',  bonus: { majesty: 2, claw: 1 }, desc: '불의 결정이 이마 위에서 타오른다.' },
  fang_necklace:{ name: '송곳니 목걸이',    rarity: 'common',   type: 'equip', slot: 'neck',  bonus: { claw: 1 },             desc: '사냥의 증표다.' },
  amber_necklace:{ name: '호박 목걸이',     rarity: 'uncommon', type: 'equip', slot: 'neck',  bonus: { majesty: 2 },          desc: '인간들이 넋을 잃고 바라본다.' },
  bog_gorget:   { name: '늪철 목가리개',    rarity: 'uncommon', type: 'equip', slot: 'neck',  bonus: { scale: 2 },            desc: '목덜미를 단단히 감싼다.' },
  venom_claw:   { name: '독날 발톱덮개',    rarity: 'common',   type: 'equip', slot: 'claw',  bonus: { claw: 1, wing: 1 },    desc: '독초 즙을 먹인 가벼운 덮개다.' },
  obsidian_claw:{ name: '흑요석 발톱덮개',  rarity: 'uncommon', type: 'equip', slot: 'claw',  bonus: { claw: 2 },             desc: '흑요석 날이 발톱 끝을 덮는다.' },
  rune_charm:   { name: '룬 부적',          rarity: 'uncommon', type: 'equip', slot: 'charm', bonus: { wisdom: 2 },           desc: '지워진 글자가 머릿속에서 되살아난다.' },
  clover_charm: { name: '은빛 토끼풀 부적', rarity: 'rare',     type: 'equip', slot: 'charm', bonus: { majesty: 1 }, expRare: 0.03, desc: '먼 길에 행운을 불러온다.' },
  scout_knot:   { name: '탐험가의 매듭',    rarity: 'common',   type: 'equip', slot: 'charm', bonus: {}, expRare: 0.02,           desc: '길을 잃지 않게 해 준다는 매듭이다.' },
  ancient_charm:{ name: '고대의 부적',      rarity: 'rare',     type: 'equip', slot: 'charm', bonus: { claw: 1, scale: 1, wing: 1, wisdom: 1, majesty: 1 }, desc: '오래전 드래곤이 지녔던 부적이다.' },
  silver_pendant:{ name: '은 펜던트',       rarity: 'uncommon', type: 'equip', slot: 'neck',  bonus: { majesty: 3 },          desc: '인간의 세공 솜씨가 빛나는 펜던트다.' },

  // ── 인간의 시장에서 파는 물건 (value: 기준 값) ──
  herbal_ointment:{ name: '약초상 연고',    rarity: 'common',   type: 'use', use: { hp: 50 }, value: 18, desc: '왕도 약초상이 파는 쓴 냄새의 연고다.' },
  strong_wine:  { name: '진한 포도주',      rarity: 'common',   type: 'use', use: { en: 40 }, value: 20, desc: '한 통을 비우면 기운이 끓어오른다.' },
  salted_fish:  { name: '절인 생선',        rarity: 'common',   type: 'use', use: { ap: 2 },  value: 25, desc: '어촌에서 말린 짭짤한 생선이다.' },
  silver_chain: { name: '은 사슬',          rarity: 'uncommon', value: 15, desc: '인간 대장장이가 엮은 가는 사슬이다.' },
  travel_map:   { name: '여행자의 지도',    rarity: 'uncommon', type: 'equip', slot: 'charm', bonus: {}, expRare: 0.04, value: 60, desc: '인간들이 그린 대륙 지도다. 생각보다 정확하다.' },
  sea_compass:  { name: '항해사의 나침반',  rarity: 'uncommon', type: 'equip', slot: 'charm', bonus: { wing: 1 }, expRare: 0.03, value: 70, desc: '바늘이 언제나 북쪽을 가리킨다.' },

  // ── 우호 드래곤에게만 파는 물건 (마을 평판 '호의' 이상) ──
  royal_charm:  { name: '왕실 문장 부적',   rarity: 'rare',     type: 'equip', slot: 'charm', bonus: { majesty: 2, wisdom: 1 }, value: 120, desc: '왕가가 인정한 드래곤에게만 내리는 부적이다.' },
  tide_amulet:  { name: '해안 수호 목걸이', rarity: 'rare',     type: 'equip', slot: 'neck',  bonus: { scale: 2, wing: 1 },   value: 110, desc: '어부들이 바다의 친구에게 바치는 목걸이다.' },

  // ── 유품: 함께 살던 인간이 세상을 떠나며 남긴 것 ──
  keepsake_cloth: { name: '낡은 손수건',     rarity: 'common',   value: 20,  desc: '작은 손이 늘 쥐고 있던 손수건이다.' },
  keepsake_toy:   { name: '손때 묻은 목각 용', rarity: 'uncommon', value: 80,  desc: '어린 날 드래곤을 흉내 내며 깎은 인형이다.' },
  keepsake_scale: { name: '비늘 목걸이',     rarity: 'rare',     value: 200, desc: '드래곤의 비늘을 꿰어 평생 걸고 다닌 목걸이다.' },
  keepsake_sword: { name: '용기사의 검',     rarity: 'rare',     value: 180, desc: '드래곤과 함께 하늘을 누빈 기사의 검이다.' },
};

// 물건 기준 값. value가 없으면 귀한 정도로, 만든 물건은 재료 값으로 정함
const RARITY_VALUE = { common: 3, uncommon: 10, rare: 40 };
ITEMS.beast_hide.value = 4;
ITEMS.sharp_fang.value = 12;

// 장신구 자리
const SLOTS = [
  { key: 'head',  name: '머리' },
  { key: 'neck',  name: '목' },
  { key: 'claw',  name: '발톱' },
  { key: 'charm', name: '부적' },
];

// 제작법. needs: 재료와 개수, en: 쓰는 기력, wis: 필요한 지혜
const RECIPES = [
  { out: 'honey_salve',   needs: { wild_honey: 1, grass_seed: 2 },                     en: 4,  wis: 0 },
  { out: 'ember_tea',     needs: { volcanic_ash: 2, wild_honey: 1 },                   en: 3,  wis: 0 },
  { out: 'moss_salve',    needs: { glow_moss: 1, frost_lichen: 1 },                    en: 6,  wis: 10 },
  { out: 'sun_breath',    needs: { sun_stone: 1, red_clay: 2 },                        en: 10, wis: 12 },
  { out: 'fang_necklace', needs: { sharp_fang: 2, beast_hide: 1 },                     en: 6,  wis: 0 },
  { out: 'scout_knot',    needs: { beast_hide: 2, red_clay: 2, black_reed: 2 },        en: 5,  wis: 0 },
  { out: 'venom_claw',    needs: { poison_herb: 4, beast_hide: 1 },                    en: 7,  wis: 8 },
  { out: 'amber_necklace',needs: { amber: 1, sea_shell: 3 },                           en: 8,  wis: 7 },
  { out: 'bog_gorget',    needs: { bog_iron: 2, black_reed: 3 },                       en: 8,  wis: 7 },
  { out: 'frost_plume',   needs: { ice_shard: 3, frost_lichen: 1 },                    en: 8,  wis: 8 },
  { out: 'obsidian_claw', needs: { obsidian: 2, beast_hide: 1, bog_iron: 1 },          en: 10, wis: 9 },
  { out: 'rune_charm',    needs: { rune_stone: 3, old_scroll: 1 },                     en: 8,  wis: 10 },
  { out: 'clover_charm',  needs: { silver_clover: 1, silk_scrap: 1 },                  en: 8,  wis: 9 },
  { out: 'fire_crown',    needs: { fire_crystal: 1, gold_ore: 2 },                     en: 14, wis: 12 },
  { out: 'ancient_charm', needs: { ancient_relic: 1, eternal_ice: 1, heartwood: 1 },   en: 18, wis: 14 },
  { out: 'silver_pendant',needs: { silver_chain: 2, amber: 1 },                        en: 10, wis: 9 },
];
for (const r of RECIPES) {
  const it = ITEMS[r.out];
  if (it.value == null) {
    const sum = Object.entries(r.needs).reduce((a, [id, n]) => a + (ITEMS[id].value ?? RARITY_VALUE[ITEMS[id].rarity]) * n, 0);
    it.value = Math.round(sum * 1.3);
  }
}
for (const it of Object.values(ITEMS)) if (it.value == null) it.value = RARITY_VALUE[it.rarity];

// ── 인간 마을 ──────────────────────────────────────
// 시장이 있는 지역과 파는 물건
const SHOPS = {
  capital: ['herbal_ointment', 'strong_wine', 'silver_chain', 'travel_map'],
  coast:   ['herbal_ointment', 'salted_fish', 'silver_chain', 'sea_compass'],
};

// 우호 성향이고 마을 평판이 '호의'(20) 이상일 때만 파는 물건
const SHOPS_SPECIAL = {
  capital: ['royal_charm'],
  coast:   ['tide_amulet'],
};

// 평판 단계 (-100 ~ 100)
const REP_TIERS = [
  { min: 60,   name: '신뢰' },
  { min: 20,   name: '호의' },
  { min: -19,  name: '낯섦' },
  { min: -59,  name: '경계' },
  { min: -100, name: '원수' },
];
const repTier = (v) => REP_TIERS.find((t) => v >= t.min).name;

// 둥지
const NEST = {
  moveCost: 30,                     // 둥지를 옮길 때 드는 금화 (처음 틀 때는 무료)
  homeFlightAp: 1,                  // 어디서든 둥지로 곧장 날아갈 때 드는 행동력
  rest: { hp: 4, en: 4, ap: 2 },    // 쉬는 동안 회복이 몇 배 빨라지는지
};

const TRADE = {
  stanceCooldown: 12 * 60 * 60 * 1000, // 성향을 바꾼 뒤 다시 바꾸기까지 (12시간)
  refuseBelow: -40,                 // 평판이 이보다 낮으면 상인이 거래를 거절
  intimidateCost: 2,                // 위협하기에 드는 행동력
};

// ── 둥지 식구: 인간 아이와 새끼 드래곤 ─────────────
// 나이와 기간은 '일' 단위 (실제 시간). 어린 시절은 짧게, 도움을 주는 어른·노년은 2주
const DAY = 24 * 60 * 60 * 1000;
const KIN = {
  maxKin: 2,                          // 둥지에 함께 살 수 있는 식구 수 (인간·알·새끼 드래곤 상관없이)
  human: {
    stages: [
      { name: '아기', from: 0 }, { name: '아이', from: 1 }, { name: '소년', from: 2 },
      { name: '청년', from: 4 }, { name: '어른', from: 11 }, { name: '노년', from: 18 },
    ],
    adultDay: 11,                     // 이날 재주가 정해지고 갈 길을 고름
    lifespan: 25,                     // 이날이 지나면 세상을 떠남 (어른 1주 + 노년 1주)
    expeditionFrom: 2,                // 이 나이(소년)부터 원정에 따라감
    startBond: 20,
    careCooldown: 3 * 60 * 60 * 1000, // 돌보기 간격 (3시간)
    neglectAfter: 2,                  // 이만큼(일) 돌보지 않으면
    neglectPerDay: 5,                 // 하루에 유대가 이만큼 줄어듦
    restBondPer30m: 1,                // 둥지에서 함께 쉬면 30분마다 유대
    knightBond: 60,                   // 용기사로 삼으려면 필요한 유대
    traderBond: 50,                   // 적대 드래곤 대신 시장에서 흥정해 주려면 필요한 유대
    returnRep: 40,                    // 마을로 돌려보내면 오르는 평판 (원수였어도 -20부터 계산)
    herbEvery: DAY,                   // 약초꾼이 꿀 고약을 만드는 간격
  },
  drake: {
    hatchTime: 1 * DAY,               // 알을 품기 시작해서 깨어나기까지
    eggWarnDays: 5,                   // 품지 않은 알: 이날 온기가 옅어진다고 알림
    eggColdDays: 7,                   // 품지 않은 알: 이날 식어 버림
    stages: [
      { name: '해츨링', from: 0 }, { name: '어린 용', from: 4 }, { name: '젊은 용', from: 11 }, { name: '다 자란 용', from: 18 },
    ],
    independentDay: 18,               // 이날부터 독립시킬 수 있음 (미뤄도 됨)
    expeditionFrom: 4,                // 어린 용부터 원정에 따라감
    huntFrom: 11, huntEvery: DAY,     // 젊은 용부터 혼자 사냥해서 가져옴
    trainCooldown: 6 * 60 * 60 * 1000, trainAp: 1, trainEn: 5,
    trainLimit: [4, 8, 12, 16],       // 단계별로 가르칠 수 있는 누적 횟수
    giftEvery: 3 * DAY,               // 독립한 새끼가 선물을 보내는 간격
    giftFrom: 3,                      // 최근 독립한 몇 마리까지 선물을 보내는지
  },
  // 알을 품는 데 드는 재료 (종류별)
  eggNeeds: { red: 'fire_crystal', white: 'eternal_ice', green: 'heartwood', black: 'bog_pearl', gold: 'sun_stone', silver: 'deep_pearl' },
  // 돌보기에 쓰는 물건: 유대가 얼마나 오르는지, 어떤 재주 쪽으로 기우는지
  care: {
    grass_seed: { bond: 2, talent: 'herbalist' }, wild_honey: { bond: 6, talent: 'herbalist' },
    glow_moss: { bond: 5, talent: 'herbalist' }, honey_salve: { bond: 8, talent: 'herbalist' },
    red_clay: { bond: 3, talent: 'smith' }, bog_iron: { bond: 5, talent: 'smith' },
    gold_ore: { bond: 7, talent: 'smith' }, obsidian: { bond: 6, talent: 'smith' },
    salted_fish: { bond: 6, talent: 'guard' }, beast_hide: { bond: 4, talent: 'guard' }, sharp_fang: { bond: 5, talent: 'guard' },
  },
  tripTalent: 2,                      // 원정에 한 번 따라갈 때마다 파수꾼 쪽으로
  companionBonus: 0.15,               // 원정에 따라간 식구 하나당 찾는 물건 +15%
};
const TALENTS = {
  herbalist: { name: '약초꾼',   desc: '둥지에 남으면 하루에 한 번 꿀 고약을 만들어 둔다.' },
  smith:     { name: '대장장이', desc: '둥지에 남으면 제작에 드는 기력이 30% 줄어든다.' },
  guard:     { name: '파수꾼',   desc: '둥지에 남으면 기사단 습격과 구출 시도가 절반으로 준다.' },
};
const HUMAN_NAMES = ['미르', '엘라', '토비', '세린', '리안', '하나', '오웬', '루카', '니나', '테오', '소이', '다온', '에반', '유나', '카이', '로웬'];
const DRAKE_NAMES = ['아르', '벨카', '시엘', '모라크', '카이렌', '이그', '루미', '타르', '세라', '노크', '베른', '이즈'];

// 이벤트: 행동마다 일어날 확률 (시험 단계라 넉넉하게)
const EVENT_RULES = {
  chance: { explore: 0.3, gather: 0.15, expedition: 0.6, wake: 0.5, intimidate: 1 },
};

// ── 성향별 장점과 단점 ─────────────────────────────
// 숫자를 바꾸면 바로 게임에 반영됩니다.
const STANCE_RULES = {
  friendly: {
    sell: { base: 0.6, best: 0.9 },  // 파는 값: 평판 0일 때 기준가의 60%, '신뢰'(60)일 때 90%
    buyDiscount: 0.3,                 // 사는 값: '신뢰'일 때 30% 할인
    specialFrom: 20,                  // 이 평판부터 전용 상품이 열림
    townHpRegen: 2,                   // 인간 마을에 있으면 체력이 몇 배 빨리 차는지
    giftChance: 0.35,                 // 인간 마을에서 탐사할 때 선물을 받을 확률
    fameOnTrade: -2,                  // 시장에서 한 번 거래할 때마다 용족 명성 변화
    betrayRep: -80,                   // 적대로 돌아서면 '호의' 이상이던 마을 평판이 이 값으로
  },
  hermit: {
    sell: 0.4, buy: 1.3,              // 파는 값 40%, 사는 값 130%
    expUncommon: 0.08, expRare: 0.04, // 원정에서 드문·귀한 물건 확률 추가
    rest: { hp: 6, en: 6, ap: 3 },    // 둥지에서 쉴 때 회복 배수 (보통은 NEST.rest)
    exploreWisdom: 2,                 // 탐사할 때 지혜에 더해서 계산
    townApExtra: 1,                   // 인간 마을에서 탐사·채집할 때 행동력 추가 소모
  },
  hostile: {
    intimidateGold: 1.5,              // 위협하기 공물 배수
    fameOnIntimidate: 4,              // 위협 성공 시 용족 명성
    fameOnIntimidateFail: 1,          // 실패해도 대담함은 인정받음
    huntClaw: 2,                      // 사냥할 때 발톱에 더해서 계산
    huntFang: 0.15,                   // 송곳니가 나올 확률 추가
    huntGold: 1.5,                    // 사냥 금화 배수
    arrows: [6, 12],                  // 인간 마을에 날아들면 입는 피해
    bountyRep: -60,                   // 어느 마을이든 평판이 이 값 이하면 현상금이 걸림
    ambush: { explore: 0.2, expedition: 0.35 }, // 야생에서 기사단에게 습격당할 확률
    ambushDmg: [8, 18],               // 습격 피해
    ambushGold: 0.15,                 // 습격으로 잃는 금화 비율 (최대 40닢)
  },
};

// 용족 명성 (-100 ~ 100): 드래곤들 사이의 체면. 위엄에 더해지고, 낮으면 사냥이 어려워짐
const FAME_TIERS = [
  { min: 60,   name: '경외', majesty: 3,  hunt: 0 },
  { min: 30,   name: '존중', majesty: 2,  hunt: 0 },
  { min: 10,   name: '인정', majesty: 1,  hunt: 0 },
  { min: -9,   name: '평범', majesty: 0,  hunt: 0 },
  { min: -29,  name: '수군거림', majesty: -1, hunt: 0 },
  { min: -59,  name: '멸시', majesty: -2, hunt: -0.08 },
  { min: -100, name: '수치', majesty: -3, hunt: -0.15 },
];
const fameTier = (v) => FAME_TIERS.find((t) => v >= t.min);

// 지역별 채집 재료
const REGION_LOOT = {
  plains:  { common: ['grass_seed'],   uncommon: ['wild_honey'],   rare: ['silver_clover'] },
  capital: { common: ['brass_button'], uncommon: ['silk_scrap'],   rare: ['lost_seal'] },
  snow:    { common: ['ice_shard'],    uncommon: ['frost_lichen'], rare: ['eternal_ice'] },
  ruins:   { common: ['rune_stone'],   uncommon: ['old_scroll'],   rare: ['ancient_relic'] },
  forest:  { common: ['poison_herb'],  uncommon: ['glow_moss'],    rare: ['heartwood'] },
  swamp:   { common: ['black_reed'],   uncommon: ['bog_iron'],     rare: ['bog_pearl'] },
  coast:   { common: ['sea_shell'],    uncommon: ['amber'],        rare: ['deep_pearl'] },
  canyon:  { common: ['red_clay'],     uncommon: ['gold_ore'],     rare: ['sun_stone'] },
  volcano: { common: ['volcanic_ash'], uncommon: ['obsidian'],     rare: ['fire_crystal'] },
};

// 지역별 사냥감. 인간 왕국에는 없음. level이 높을수록 어렵고 보상이 큼
const CREATURES = {
  plains:  { name: '들소 떼',     level: 1 },
  snow:    { name: '설원 늑대',   level: 2 },
  forest:  { name: '거대 거미',   level: 2 },
  swamp:   { name: '늪 악어',     level: 2 },
  ruins:   { name: '돌 파수꾼',   level: 3 },
  canyon:  { name: '사막 전갈',   level: 3 },
  volcano: { name: '화염 도마뱀', level: 3 },
};

// 지역별 장면. 탐사 결과와 원정 기록에 쓰임
const SCENES = {
  plains: ['바람에 눕는 풀밭 위를 낮게 날았다.', '멀리 왕도의 종소리가 들려왔다.', '들소 떼가 그림자를 보고 흩어졌다.', '해 질 녘 언덕에서 잠시 날개를 쉬었다.'],
  capital: ['성벽 위 파수병들의 눈을 피해 구름 속을 맴돌았다.', '시장의 소란이 하늘까지 올라왔다.', '성당 첨탑 위에 앉은 비둘기들이 일제히 날아올랐다.', '골목 어귀에서 아이 하나가 하늘을 가리켰다.'],
  snow: ['눈보라가 지나간 뒤 세상이 고요해졌다.', '얼어붙은 호수 위에 자신의 모습이 비쳤다.', '눈 속에 반쯤 묻힌 인간의 썰매를 발견했다.', '밤하늘에 초록빛 커튼이 일렁였다.'],
  ruins: ['무너진 석주 사이로 바람이 울었다.', '벽에 새겨진 드래곤 그림 앞에 한참 머물렀다.', '발밑의 돌판이 희미하게 빛났다.', '오래된 계단이 땅속 깊이 이어져 있었다.'],
  forest: ['초록 안개가 비늘 사이로 스며들었다.', '이끼 낀 고목 아래에서 낯선 버섯을 보았다.', '나무 위에서 무언가가 조용히 지켜보고 있었다.', '숲 한가운데 빛이 드는 빈터를 찾았다.'],
  swamp: ['검은 물 위로 거품이 천천히 올라왔다.', '썩은 나무 그루터기에 발을 걸쳐 쉬었다.', '늪 저편에서 낮은 울음소리가 들렸다.', '물안개 속에 오래된 배 한 척이 가라앉아 있었다.'],
  coast: ['절벽에 부딪히는 파도 소리를 들었다.', '어촌의 굴뚝 연기가 바다 쪽으로 기울었다.', '모래톱에 떠밀려 온 상자를 발견했다.', '갈매기 떼가 날개 곁을 스쳐 지나갔다.'],
  canyon: ['붉은 바위벽이 한낮의 열기를 뿜어냈다.', '바위틈에서 금빛 줄기가 번뜩였다.', '마른 번개가 협곡 끝을 갈랐다.', '모래 언덕 너머로 신기루가 일렁였다.'],
  volcano: ['잿가루가 눈처럼 날개 위에 쌓였다.', '땅 밑에서 낮은 울림이 올라왔다.', '굳은 용암 사이로 붉은 빛이 새어 나왔다.', '분화구 가장자리에서 뜨거운 바람을 맞았다.'],
};

// 시간·행동력 규칙
const RULES = {
  apEvery: 15 * 60 * 1000,      // 행동력 1 회복 간격 (15분)
  hpEvery: 90 * 1000,           // 체력 1 회복 간격 (90초)
  enEvery: 2 * 60 * 1000,       // 기력 1 회복 간격 (2분)
  cost: { explore: 1, gather: 1, hunt: 2 },
  huntMinHp: 15,                // 이보다 체력이 낮으면 사냥 불가
  expeditionMinutes: [30, 60, 120, 180],
};

module.exports = {
  KINDS, REGIONS, STANCES, STATS, CREATION, derive, ITEMS, REGION_LOOT, CREATURES, SCENES, RULES, SLOTS, RECIPES,
  SHOPS, SHOPS_SPECIAL, REP_TIERS, repTier, TRADE, NEST, STANCE_RULES, FAME_TIERS, fameTier,
  DAY, KIN, TALENTS, HUMAN_NAMES, DRAKE_NAMES, EVENT_RULES,
};
