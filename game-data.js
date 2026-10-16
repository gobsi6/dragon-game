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
// 레벨이 오를 때마다 받는 능력치 포인트 (드래곤 기록 칸에서 직접 나눔)
const STAT_POINTS = { perLevel: 1 };

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
  blue: {
    name: '블루 드래곤',
    breath: '해일',
    home: 'coast',
    desc: '바다와 폭풍을 다스리는 드래곤. 파도 소리를 사랑하고, 뱃사람들 사이에서는 바다의 수호자로 전해진다.',
    stats: { claw: 9, scale: 10, wing: 10, wisdom: 8, majesty: 8 },
  },
  purple: {
    name: '퍼플 드래곤',
    breath: '자수정',
    home: 'ruins',
    desc: '고대 유적의 자수정 동굴에 사는 드래곤. 상처를 어루만지는 힘이 있어, 다친 짐승들이 곁으로 모여든다.',
    stats: { claw: 7, scale: 9, wing: 8, wisdom: 12, majesty: 9 },
  },
  bronze: {
    name: '브론즈 드래곤',
    breath: '모래 폭풍',
    home: 'plains',
    desc: '대지의 숨결을 품은 드래곤. 바위처럼 묵직하고 참을성이 많으며, 한번 지키기로 한 것은 끝까지 지킨다.',
    stats: { claw: 10, scale: 12, wing: 6, wisdom: 8, majesty: 9 },
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
  corrupt_crystal:{ name: '오염 결정',      rarity: 'rare', value: 35, desc: '오염된 땅에서만 맺히는 검붉은 결정. 오래 쥐고 있으면 머릿속이 웅웅거린다.' },


  // ── 사냥 전리품: 장소마다 사냥감에게서 얻는 재료 (cat: 'trophy') ──
  bison_horn:     { name: '들소 뿔',           rarity: 'common',   cat: 'trophy', desc: '굵고 휘어진 뿔. 들소 떼의 우두머리일수록 크다.' },
  wolf_pelt:      { name: '늑대 털가죽',       rarity: 'common',   cat: 'trophy', desc: '바람을 막아 주는 두툼한 회색 털이다.' },
  ghost_ash:      { name: '망령의 재',         rarity: 'uncommon', cat: 'trophy', desc: '흩어진 망령이 남긴 차가운 잿가루. 손에 쥐면 속삭임이 들린다.' },
  spider_silk:    { name: '거미줄 실',         rarity: 'common',   cat: 'trophy', desc: '가늘지만 쇠줄보다 질기다.' },
  toad_gland:     { name: '두꺼비 독샘',       rarity: 'uncommon', cat: 'trophy', desc: '짜내면 초록 독이 맺힌다. 조금만 섞으면 피가 끓는다.' },
  living_bark:    { name: '살아 있는 나무껍질', rarity: 'uncommon', cat: 'trophy', desc: '떼어 낸 뒤에도 천천히 숨을 쉰다.' },
  croc_scale:     { name: '악어 비늘',         rarity: 'common',   cat: 'trophy', desc: '울퉁불퉁하고 단단한 늪 악어의 등비늘이다.' },
  hydra_blood:    { name: '히드라의 피',       rarity: 'uncommon', cat: 'trophy', value: 18, desc: '잘린 목이 다시 자라게 하는 피. 상처에 닿으면 살이 차오른다.' },
  troll_tusk:     { name: '트롤 엄니',         rarity: 'uncommon', cat: 'trophy', desc: '얼음을 깨물던 커다란 엄니다.' },
  wyvern_membrane:{ name: '와이번 날개막',     rarity: 'rare',     cat: 'trophy', desc: '오로라 빛이 스며든 얇고 질긴 막이다.' },
  stone_heart:    { name: '파수꾼의 돌심장',   rarity: 'uncommon', cat: 'trophy', desc: '쓰러진 파수꾼의 가슴에서 꺼낸, 아직 따뜻한 돌이다.' },
  cursed_steel:   { name: '저주받은 강철',     rarity: 'uncommon', cat: 'trophy', value: 14, desc: '해골 기사의 검에서 떼어 낸 쇳조각. 녹이 슬지 않는다.' },
  seal_core:      { name: '봉인의 핵',         rarity: 'rare',     cat: 'trophy', desc: '고대 골렘을 움직이던 룬이 새겨진 핵이다.' },
  scorpion_stinger:{ name: '전갈 독침',        rarity: 'common',   cat: 'trophy', desc: '끝이 바늘처럼 뾰족하다. 아직 독이 남아 있다.' },
  sandworm_tooth: { name: '모래 벌레 이빨',    rarity: 'uncommon', cat: 'trophy', desc: '바위도 갈아 버리는 톱날 같은 이빨이다.' },
  griffin_feather:{ name: '그리핀 깃털',       rarity: 'rare',     cat: 'trophy', desc: '햇빛을 받으면 금빛으로 타오르는 깃털이다.' },
  salamander_tail:{ name: '불도마뱀 꼬리',     rarity: 'common',   cat: 'trophy', desc: '잘려도 한참 동안 뜨겁게 꿈틀거린다.' },
  magma_core:     { name: '용암 심장',         rarity: 'rare',     cat: 'trophy', desc: '용암 골렘의 가슴에서 아직도 끓고 있는 돌이다.' },
  giant_ember:    { name: '거인의 불씨',       rarity: 'rare',     cat: 'trophy', value: 55, desc: '화염 거인이 쓰러지며 남긴 꺼지지 않는 불씨다.' },

  // ── 만든 물건: 회복약 (use: 사용 효과) ──
  honey_salve:  { name: '꿀 고약',          rarity: 'common',   type: 'use', use: { hp: 30 },  desc: '상처에 바르면 금세 아문다.' },
  moss_salve:   { name: '이끼 고약',        rarity: 'uncommon', type: 'use', use: { hp: 70 },  desc: '빛나는 이끼가 상처를 차갑게 덮는다.' },
  ember_tea:    { name: '불씨 차',          rarity: 'common',   type: 'use', use: { en: 25 },  desc: '마시면 속이 뜨거워지고 기운이 돈다.' },
  sun_breath:   { name: '태양의 숨결',      rarity: 'rare',     type: 'use', use: { ap: 4 },   desc: '한 모금 들이켜면 날개에 힘이 솟는다.' },
  calm_incense: { name: '진정의 향',        rarity: 'uncommon', type: 'use', use: { mind: 40 }, desc: '빛나는 이끼와 꿀을 태운 연기가 흐려진 정신을 맑게 한다.' },

  hunter_stew:  { name: '사냥꾼의 스튜',    rarity: 'common',   type: 'use', use: { hp: 45, en: 15 }, desc: '불도마뱀 꼬리를 푹 고아 낸 뜨끈한 스튜다.' },
  hydra_tonic:  { name: '히드라 강장제',    rarity: 'rare',     type: 'use', use: { hp: 150 }, desc: '한 모금이면 찢긴 비늘 아래로 새살이 돋는다.' },
  ember_elixir: { name: '불씨 영약',        rarity: 'rare',     type: 'use', use: { en: 60, ap: 2 }, desc: '거인의 불씨를 녹인 영약. 몸속에서 불이 타오른다.' },

  // ── 만든 물건: 강화 음식 (buff: 한 시간 동안 사냥·강적 전투에서 힘이 됨. 하나만 효과가 있음) ──
  war_paint:    { name: '전쟁 물감',        rarity: 'uncommon', type: 'use', use: { buff: 'might' }, desc: '독샘을 섞은 붉은 물감을 비늘에 바르면 피가 끓어오른다.' },
  scale_oil:    { name: '비늘 기름',        rarity: 'common',   type: 'use', use: { buff: 'iron' },  desc: '악어 비늘을 짜낸 기름. 바르면 비늘이 돌처럼 단단해진다.' },
  wind_mead:    { name: '바람 꿀술',        rarity: 'common',   type: 'use', use: { buff: 'swift' }, desc: '마시면 날개가 깃털처럼 가벼워진다.' },
  sage_tea:     { name: '현자의 차',        rarity: 'uncommon', type: 'use', use: { buff: 'focus' }, desc: '머리가 맑아져 숨결과 치유가 한층 강해진다.' },
  hunt_incense: { name: '사냥꾼의 향',      rarity: 'uncommon', type: 'use', use: { buff: 'lucky' }, desc: '망령의 재를 태운 연기가 사냥감의 숨은 보물을 드러낸다.' },

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
  void_claw:    { name: '오염된 발톱덮개',  rarity: 'rare',     type: 'equip', slot: 'claw',  bonus: { claw: 3, wing: 1 },    desc: '오염 결정을 박아 넣은 발톱덮개. 강하지만 만질 때마다 섬뜩하다.' },
  pure_amulet:  { name: '정화의 부적',      rarity: 'rare',     type: 'equip', slot: 'charm', bonus: { wisdom: 1 }, mindWard: 0.5, desc: '오염 결정을 룬으로 묶어 오히려 오염을 막는다. 깎이는 정신이 절반으로 준다.' },
  silver_pendant:{ name: '은 펜던트',       rarity: 'uncommon', type: 'equip', slot: 'neck',  bonus: { majesty: 3 },          desc: '인간의 세공 솜씨가 빛나는 펜던트다.' },

  // 사냥 전리품으로 만드는 장신구
  troll_helm:   { name: '트롤 엄니 투구',   rarity: 'uncommon', type: 'equip', slot: 'head',  bonus: { scale: 2, majesty: 1 },  desc: '엄니 두 개가 뿔처럼 솟은 투구다.' },
  griffin_crest:{ name: '그리핀 깃 관',     rarity: 'rare',     type: 'equip', slot: 'head',  bonus: { wing: 2, majesty: 2 },   desc: '금빛 깃털이 왕관처럼 머리를 두른다.' },
  ghost_lantern:{ name: '망령 등불 목걸이', rarity: 'uncommon', type: 'equip', slot: 'neck',  bonus: { wisdom: 2 }, mindWard: 0.8, desc: '망령의 재를 담은 작은 등불. 깎이는 정신이 조금 준다.' },
  stinger_claw: { name: '독침 발톱덮개',    rarity: 'common',   type: 'equip', slot: 'claw',  bonus: { claw: 2 },               desc: '전갈 독침을 발톱 끝에 덧댔다.' },
  sandworm_claw:{ name: '모래 벌레 이빨 덮개', rarity: 'uncommon', type: 'equip', slot: 'claw', bonus: { claw: 2, scale: 1 }, desc: '톱날 이빨이 발톱을 따라 늘어서 있다.' },
  cursed_blade: { name: '저주받은 강철 발톱', rarity: 'rare',   type: 'equip', slot: 'claw',  bonus: { claw: 3, majesty: 1 },   desc: '녹슬지 않는 강철 발톱. 상대가 움찔한다.' },
  guardian_charm:{ name: '파수꾼의 돌 부적', rarity: 'uncommon', type: 'equip', slot: 'charm', bonus: { scale: 2, wisdom: 1 },  desc: '돌심장이 천천히 고동친다.' },
  seal_charm:   { name: '봉인의 부적',      rarity: 'rare',     type: 'equip', slot: 'charm', bonus: { wisdom: 3, scale: 1 },   desc: '고대의 룬이 머릿속에 길을 낸다.' },
  giant_heart:  { name: '거인의 심장',      rarity: 'rare',     type: 'equip', slot: 'charm', bonus: { claw: 1, scale: 1, majesty: 2 }, desc: '용암 심장에 거인의 불씨를 넣어 깨웠다.' },
  silk_wingband:{ name: '거미줄 날개띠',    rarity: 'common',   type: 'equip', slot: 'wing',  bonus: { wing: 1 },               desc: '날개 뼈를 따라 질긴 실을 감았다.' },
  wolf_cloak:   { name: '늑대 털 날개덮개', rarity: 'uncommon', type: 'equip', slot: 'wing',  bonus: { wing: 1, scale: 1 },     desc: '추운 하늘에서도 날개가 굳지 않는다.' },
  wyvern_guard: { name: '와이번 날개막 덮개', rarity: 'rare',   type: 'equip', slot: 'wing',  bonus: { wing: 3, scale: 1 },     desc: '오로라 빛이 도는 막이 바람을 붙잡는다.' },
  horn_tailring:{ name: '들소 뿔 꼬리고리', rarity: 'common',   type: 'equip', slot: 'tail',  bonus: { claw: 1 },               desc: '꼬리를 휘두를 때마다 묵직하게 울린다.' },
  croc_tailguard:{ name: '악어 비늘 꼬리갑', rarity: 'uncommon', type: 'equip', slot: 'tail', bonus: { scale: 2 },              desc: '꼬리 끝까지 비늘 갑옷을 덧댔다.' },
  bark_tailwrap:{ name: '고목 껍질 꼬리감개', rarity: 'uncommon', type: 'equip', slot: 'tail', bonus: { scale: 1, wisdom: 1 },  desc: '살아 있는 껍질이 꼬리를 감싸 상처를 보듬는다.' },
  magma_tail:   { name: '용암 심장 꼬리날', rarity: 'rare',     type: 'equip', slot: 'tail',  bonus: { claw: 2, majesty: 1 },   desc: '꼬리 끝에서 용암이 끓는다.' },

  // ── 둥지에 설치하는 것: 쓰면 둥지에 놓임 (보물 도둑을 막음) ──
  thorn_trap:   { name: '가시 덫',          rarity: 'common',   type: 'use', use: { nestWard: 'trap' },  desc: '둥지 입구에 숨겨 두는 덫. 도둑이 들면 가져가는 양이 절반으로 줄고, 다친 채로 달아난다. 한 번 쓰면 망가진다.' },
  ward_stone:   { name: '수호 결계석',      rarity: 'rare',     type: 'use', use: { nestWard: 'stone' }, desc: '룬을 새긴 결계석. 도둑을 한 번 통째로 쫓아내고 부서진다.' },

  // ── 인간의 시장에서 파는 물건 (value: 기준 값) ──
  holy_water:   { name: '성수',             rarity: 'uncommon', type: 'use', use: { mind: 30 }, value: 30, desc: '왕도 성당에서 축복한 물. 흐려진 정신을 맑게 한다.' },
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
  // 라이벌 이벤트에서 얻는 물건
  rival_scale:    { name: '라이벌의 비늘',   rarity: 'uncommon', value: 20,  desc: '라이벌이 떨어뜨리고 간 비늘 한 조각. 볼 때마다 이를 악물게 된다.' },
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
  { key: 'wing',  name: '날개' },
  { key: 'tail',  name: '꼬리' },
];

// 강화 음식의 효과: 한 시간 동안 사냥과 강적 전투에서 (결투장에는 적용되지 않음)
const BUFFS = {
  minutes: 60,
  might: { name: '투지',   desc: '공격 +15%',          atk: 1.15 },
  iron:  { name: '단단함', desc: '받는 피해 −15%',     taken: 0.85 },
  swift: { name: '날렵함', desc: '날개(속도) +4',      spd: 4 },
  focus: { name: '집중',   desc: '숨결·치유 +20%',     mag: 1.2 },
  lucky: { name: '행운',   desc: '사냥 전리품 확률 +25%', drop: 0.25 },
};

// 제작법. needs: 재료와 개수, en: 쓰는 기력, wis: 필요한 지혜
const RECIPES = [
  { out: 'honey_salve',   needs: { wild_honey: 1, grass_seed: 2 },                     en: 4,  wis: 0 },
  { out: 'thorn_trap',    needs: { beast_hide: 2, sharp_fang: 2 },                     en: 5,  wis: 0 },
  { out: 'ward_stone',    needs: { rune_stone: 3, old_scroll: 1, sun_stone: 1 },       en: 12, wis: 12 },
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
  { out: 'calm_incense',  needs: { glow_moss: 1, wild_honey: 1 },                      en: 5,  wis: 8 },
  { out: 'void_claw',     needs: { corrupt_crystal: 3, obsidian: 1 },                  en: 14, wis: 11 },
  { out: 'pure_amulet',   needs: { corrupt_crystal: 2, rune_stone: 2, silver_clover: 1 }, en: 14, wis: 12 },
  // 사냥 전리품으로 만드는 것
  { out: 'hunter_stew',   needs: { salamander_tail: 1, grass_seed: 2 },                en: 4,  wis: 0 },
  { out: 'hydra_tonic',   needs: { hydra_blood: 2, glow_moss: 1 },                     en: 9,  wis: 11 },
  { out: 'ember_elixir',  needs: { giant_ember: 1, wild_honey: 2 },                    en: 12, wis: 13 },
  { out: 'scale_oil',     needs: { croc_scale: 2, black_reed: 1 },                     en: 4,  wis: 0 },
  { out: 'wind_mead',     needs: { wild_honey: 1, spider_silk: 1 },                    en: 4,  wis: 0 },
  { out: 'war_paint',     needs: { red_clay: 2, toad_gland: 1 },                       en: 5,  wis: 6 },
  { out: 'sage_tea',      needs: { frost_lichen: 1, glow_moss: 1, old_scroll: 1 },     en: 6,  wis: 9 },
  { out: 'hunt_incense',  needs: { ghost_ash: 1, rune_stone: 2 },                      en: 5,  wis: 7 },
  { out: 'horn_tailring', needs: { bison_horn: 2, red_clay: 1 },                       en: 5,  wis: 0 },
  { out: 'silk_wingband', needs: { spider_silk: 3 },                                   en: 5,  wis: 0 },
  { out: 'stinger_claw',  needs: { scorpion_stinger: 3, beast_hide: 1 },               en: 6,  wis: 0 },
  { out: 'wolf_cloak',    needs: { wolf_pelt: 3, spider_silk: 1 },                     en: 7,  wis: 6 },
  { out: 'croc_tailguard',needs: { croc_scale: 3, bog_iron: 1 },                       en: 8,  wis: 7 },
  { out: 'bark_tailwrap', needs: { living_bark: 2, frost_lichen: 1 },                  en: 8,  wis: 8 },
  { out: 'ghost_lantern', needs: { ghost_ash: 2, silver_chain: 1 },                    en: 8,  wis: 9 },
  { out: 'troll_helm',    needs: { troll_tusk: 2, bog_iron: 1 },                       en: 9,  wis: 8 },
  { out: 'sandworm_claw', needs: { sandworm_tooth: 2, beast_hide: 1 },                 en: 9,  wis: 8 },
  { out: 'guardian_charm',needs: { stone_heart: 1, rune_stone: 2 },                    en: 9,  wis: 9 },
  { out: 'cursed_blade',  needs: { cursed_steel: 2, obsidian: 1 },                     en: 12, wis: 10 },
  { out: 'wyvern_guard',  needs: { wyvern_membrane: 2, spider_silk: 2 },               en: 13, wis: 11 },
  { out: 'griffin_crest', needs: { griffin_feather: 2, gold_ore: 1 },                  en: 13, wis: 11 },
  { out: 'magma_tail',    needs: { magma_core: 1, obsidian: 2 },                       en: 14, wis: 12 },
  { out: 'seal_charm',    needs: { seal_core: 1, rune_stone: 2, old_scroll: 1 },       en: 15, wis: 13 },
  { out: 'giant_heart',   needs: { giant_ember: 1, magma_core: 1 },                    en: 18, wis: 14 },
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
  capital: ['herbal_ointment', 'strong_wine', 'silver_chain', 'travel_map', 'holy_water'],
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
  // 둥지 단계: 넓힐수록 식구가 늘고 쉬는 회복이 빨라짐. 둥지를 옮기면 한 단계 낮아짐 (설치한 덫·결계도 남겨 두고 감)
  // kin: 함께 살 식구 수, rest: 쉬는 회복 배율(위 rest에 곱함), raidLoss: 도둑이 들었을 때 잃는 양 배율, cost: 넓히는 데 드는 것
  tiers: [
    { name: '보금자리', kin: 2, rest: 1,    raidLoss: 1,   desc: '바위 틈에 마련한 아늑한 잠자리.' },
    { name: '넓은 동굴', kin: 3, rest: 1.25, raidLoss: 1,   desc: '안쪽까지 깊게 판 동굴. 식구 하나가 더 지낼 수 있다.',
      cost: { gold: 300, items: { beast_hide: 6, red_clay: 6, bog_iron: 3 } } },
    { name: '용의 성채', kin: 4, rest: 1.5,  raidLoss: 0.6, desc: '흑요석과 룬으로 다진 요새. 도둑이 들어도 많이 가져가지 못한다.',
      cost: { gold: 900, items: { obsidian: 4, rune_stone: 6, stone_heart: 2, sun_stone: 1 } } },
  ],
  wardMax: 3,                       // 덫과 결계석은 종류마다 이만큼까지 설치
};

// 보물더미의 이로움: 가치가 이만큼 넘으면 위엄이 오르고, 둥지에서 쉴 때 정신이 빨리 맑아짐
const HOARD_TIERS = [
  { at: 500,  name: '작은 보물더미',   majesty: 1, mind: 1.25 },
  { at: 2000, name: '빛나는 보물더미', majesty: 2, mind: 1.5 },
  { at: 5000, name: '황금 산',         majesty: 3, mind: 1.75 },
];
const hoardTier = (v) => [...HOARD_TIERS].reverse().find((t) => v >= t.at) || null;

// 보물 도둑: 둥지를 비운 동안 보물더미를 노림 (드래곤끼리 빼앗는 일은 없음)
// 한 시간 비울 때마다 chance 확률. 보물이 많을수록 잘 듦. 파수꾼 식구가 있으면 절반
const HOUR = 60 * 60 * 1000;
const RAID = {
  minValue: 300,                    // 보물더미 가치가 이보다 낮으면 오지 않음
  chance: { base: 0.015, per1000: 0.01, max: 0.06 },
  guard: 0.5,                       // 파수꾼 식구가 있으면 들 확률 배율
  maxHours: 48,                     // 한 번에 셈하는 비운 시간의 최대
  calm: 12 * HOUR,                  // 도둑 일이 끝난 뒤 다음 도둑까지 쉬는 시간
  chaseFor: 24 * HOUR,              // 이 안에 쫓아가면 되찾을 수 있음
  chaseAp: 2,
  gold: [0.1, 0.2],                 // 쌓인 금화 중 가져가는 비율
  goldMax: [300, 500, 800],         // 도둑 무리마다 가져가는 금화의 최대
  stacks: [1, 2],                   // 손대는 물건 종류 수
  itemPart: [0.2, 0.4],             // 그 물건 중 가져가는 비율 (적어도 1개)
  trap: 0.5,                        // 가시 덫: 잃는 양 배율, 도둑이 다친 채로 달아남 (체력 배율 trapHp)
  trapHp: 0.75,
  xp: 1.3,                          // 쫓아가 이기면 사냥보다 조금 더 많은 경험치
  fame: 2,
  bounty: [6, 14],                  // 이기면 도둑이 지닌 금화 (× 레벨)
  // 보물더미 가치에 따라 오는 도둑 무리. lv: 내 레벨에 더함
  thieves: [
    { upTo: 1500,     name: '좀도둑 고블린', minions: ['고블린 망꾼'], lv: -1,
      special: { name: '모래 뿌리기', power: 0.5, debuff: { weaken: 2 } }, weak: ['fire'], resist: [] },
    { upTo: 4000,     name: '보물 사냥꾼', minions: ['사냥꾼 패거리', '짐꾼'], lv: -1,
      special: { name: '쇠뇌 연사', power: 0.6, hits: 2 }, weak: ['lightning'], resist: [] },
    { upTo: Infinity, name: '용 사냥 용병대장', minions: ['용병 창잡이', '용병 궁수'], lv: -1,
      special: { name: '작살 투척', power: 1.7 }, weak: ['poison'], resist: ['fire'] },
  ],
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
  maxKin: 2,                          // 둥지에 함께 살 수 있는 식구 수 (인간·알·새끼 드래곤 상관없이). 둥지를 넓히면 늘어남 (NEST.tiers)
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
  eggNeeds: { red: 'fire_crystal', white: 'eternal_ice', green: 'heartwood', black: 'bog_pearl', gold: 'sun_stone', silver: 'deep_pearl', blue: 'deep_pearl', purple: 'ancient_relic', bronze: 'silver_clover' },
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
  apEvery: 10 * 60 * 1000,      // 행동력 1 회복 간격 (10분)
  apBase: 12,                   // 기본 최대 행동력
  apPerLevels: 5,               // 이 레벨마다 최대 행동력 +1 (5, 10, 15 …)
  hpEvery: 90 * 1000,           // 체력 1 회복 간격 (90초)
  enEvery: 2 * 60 * 1000,       // 기력 1 회복 간격 (2분)
  cost: { explore: 1, gather: 1, hunt: 2 },
  huntMinHp: 15,                // 이보다 체력이 낮으면 사냥 불가
  expeditionMinutes: [30, 60, 120, 180],
};

// ── 특성 ───────────────────────────────────────────
// 처음 만들 때 긍정 하나·부정 하나를 고르고, 플레이하다 보면 새로 생기거나 사라진다.
// mod: 효과. 곱하는 값(Regen·Dmg·buy·sell·Gold·Gain·xp·expRolls)은 1이 기준, 더하는 값(stats·hpMax·enMax·huntClaw·gatherExtra·exploreFind·bond)은 0이 기준
const TRAITS = {
  // 긍정
  steel_scale: { good: true, name: '강철 비늘', desc: '사냥에서 받는 피해가 25% 줄어든다.', mod: { huntDmg: 0.75 } },
  born_hunter: { good: true, name: '타고난 사냥꾼', desc: '사냥할 때 발톱 +3.', mod: { huntClaw: 3 } },
  hawk_eye:    { good: true, name: '매의 눈', desc: '채집에서 물건을 하나 더 찾을 때가 많고, 탐사에서 물건을 더 잘 발견한다.', mod: { gatherExtra: 0.2, exploreFind: 0.1 } },
  tireless:    { good: true, name: '지칠 줄 모름', desc: '행동력이 20% 빨리 찬다.', mod: { apRegen: 1.2 } },
  deep_breath: { good: true, name: '깊은 숨', desc: '최대 기력 +10, 기력이 20% 빨리 찬다.', mod: { enMax: 10, enRegen: 1.2 } },
  fast_healer: { good: true, name: '빠른 회복', desc: '체력이 30% 빨리 찬다.', mod: { hpRegen: 1.3 } },
  haggler:     { good: true, name: '흥정꾼', desc: '시장에서 10% 싸게 사고 10% 비싸게 판다.', mod: { buy: 0.9, sell: 1.1 } },
  imposing:    { good: true, name: '위압', desc: '위엄 +2. 위협해서 받는 공물 +20%.', mod: { stats: { majesty: 2 }, intimidateGold: 1.2 } },
  gentle:      { good: true, name: '다정한 발톱', desc: '식구를 돌볼 때 유대가 2 더 오른다.', mod: { bond: 2 } },
  scholar:     { good: true, name: '학구열', desc: '얻는 경험치 +15%.', mod: { xp: 1.15 } },
  wanderer:    { good: true, name: '길잡이', desc: '원정에서 찾는 물건 +15%.', mod: { expRolls: 1.15 } },
  // 부정
  thin_scale:  { good: false, name: '얇은 비늘', desc: '사냥에서 받는 피해가 20% 늘어난다.', mod: { huntDmg: 1.2 } },
  sleepy:      { good: false, name: '잠꾸러기', desc: '행동력이 15% 느리게 찬다.', mod: { apRegen: 0.85 } },
  frail:       { good: false, name: '허약', desc: '최대 체력 −15.', mod: { hpMax: -15 } },
  greedy:      { good: false, name: '탐욕', desc: '탐내는 눈빛을 상인들이 알아채, 시장에서 15% 비싸게 산다.', mod: { buy: 1.15 } },
  clumsy:      { good: false, name: '서투른 발톱', desc: '채집에서 물건을 하나 더 찾는 일이 드물다.', mod: { gatherExtra: -0.2 } },
  notorious:   { good: false, name: '악명', desc: '마을 평판이 오를 때 25% 덜 오른다.', mod: { repGain: 0.75 } },
  arrogant:    { good: false, name: '오만', desc: '드래곤들이 거만함을 꺼려 용족 명성이 25% 덜 오른다.', mod: { fameGain: 0.75 } },
  cold_heart:  { good: false, name: '냉담', desc: '식구를 돌볼 때 유대가 2 덜 오른다 (최소 1).', mod: { bond: -2 } },
  restless:    { good: false, name: '산만', desc: '얻는 경험치 −10%.', mod: { xp: 0.9 } },
  iron_will:   { good: true, name: '강인한 정신', desc: '오염으로 깎이는 정신이 40% 줄어든다.', mod: { mindDrain: 0.6 } },
  unstable:    { good: false, name: '불안정', desc: '오염으로 깎이는 정신이 30% 늘어난다.', mod: { mindDrain: 1.3 } },
  lost_way:    { good: false, name: '길치', desc: '원정에서 찾는 물건 −15%.', mod: { expRolls: 0.85 } },
};

// 플레이로 생기고 사라지는 특성. count: 세는 행동, at: 이만큼 하면 한 번 일어남
// gain: 생기는 특성, lose: 사라지는 특성, line: 그때 보여 줄 문장
const TRAIT_EARN = [
  { id: 'hunt50', count: 'hunt', at: 50, gain: ['born_hunter'], line: '수없이 사냥한 끝에 발톱이 사냥감을 기억한다.' },
  { id: 'wound5', count: 'wound', at: 5, gain: ['thin_scale'], line: '쓰러지기 직전까지 몰린 상처가 쌓여 비늘이 얇아졌다.' },
  { id: 'gather50', count: 'gather', at: 50, gain: ['hawk_eye'], lose: ['clumsy'], line: '수없이 땅을 뒤진 끝에 작은 것도 놓치지 않게 되었다.' },
  { id: 'explore60', count: 'explore', at: 60, gain: ['scholar'], lose: ['restless'], line: '대륙 곳곳을 누비며 보고 들은 것이 쌓였다.' },
  { id: 'exp15', count: 'expedition', at: 15, gain: ['wanderer'], lose: ['lost_way'], line: '먼 길을 거듭 오가며 바람의 길을 익혔다.' },
  { id: 'intim20', count: 'intimidate', at: 20, gain: ['imposing', 'notorious'], line: '인간들은 이제 그림자만 보아도 떤다. 그만큼 이름도 더럽혀졌다.' },
  { id: 'trade30', count: 'trade', at: 30, gain: ['haggler'], lose: ['greedy'], line: '시장을 드나들며 값을 읽는 눈이 생겼다.' },
  { id: 'care25', count: 'care', at: 25, gain: ['gentle'], lose: ['cold_heart'], line: '작은 것들을 돌보는 사이 발톱 끝이 부드러워졌다.' },
  { id: 'neglect3', count: 'neglect', at: 3, gain: ['cold_heart'], line: '돌보지 못한 날들이 쌓여 마음 한쪽이 식었다.' },
  { id: 'rest15', count: 'rest', at: 15, gain: ['fast_healer'], lose: ['sleepy'], line: '둥지에서 쉬는 법을 익혀 몸이 빨리 회복된다.' },
  { id: 'corrupt40', count: 'corrupt', at: 40, gain: ['iron_will'], lose: ['unstable'], line: '오염된 땅을 수없이 견뎌 낸 끝에 정신이 단단해졌다.' },
  { id: 'berserk1', count: 'berserk', at: 1, gain: ['unstable'], line: '한 번 무너진 정신에는 금이 남았다.' },
  { id: 'rest40', count: 'rest', at: 40, lose: ['thin_scale'], line: '오랜 휴식 끝에 묵은 상처가 아물었다.' },
];
// 화면에 보여 줄 행동 이름
const TRAIT_COUNTS = {
  hunt: '사냥', wound: '큰 상처', gather: '채집', explore: '탐사', expedition: '원정', intimidate: '위협',
  trade: '시장 거래', care: '식구 돌보기', neglect: '식구를 외롭게 함', rest: '둥지에서 쉬기',
  corrupt: '오염된 땅에서 행동', berserk: '광폭화',
};

// ── 원정: 목적과 갈림길 ────────────────────────────
// '~으로/로' (받침 없거나 ㄹ 받침이면 '로')
const ro = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return `${w}${c < 0 || c > 11171 || c % 28 === 0 || c % 28 === 8 ? '로' : '으로'}`; };
// 목적: rolls(찾는 횟수 배율), uncommon·rare(확률 배율), gold·xp(배율), trophy(사냥 전리품을 20분마다 몇 번), hurt(30분마다 잃는 체력 비율),
//       miss(헛걸음 확률: 찾는 횟수 절반), fame(2시간 이상이면 명성)
const EXP_GOALS = {
  gather:   { name: '채집',     desc: '풀숲과 바위틈을 뒤진다. 재료를 많이 찾는다.', eff: '찾는 횟수 +40%, 금화 −30%', rolls: 1.4, uncommon: 1, rare: 1, gold: 0.7, xp: 1,
    open: (w) => `${w}의 풀숲과 바위틈을 살피러 떠났다.` },
  hunt:     { name: '사냥',     desc: '사냥감을 쫓는다. 사냥 전리품과 금화를 얻지만 다칠 수 있다.', eff: '사냥 전리품, 금화 +50%, 경험 +20%, 찾는 횟수 −30%, 체력이 깎임', rolls: 0.7, uncommon: 1, rare: 1, gold: 1.5, xp: 1.2, trophy: 1, hurt: 0.04, wild: true,
    open: (w) => `${ro(w)} 사냥감을 쫓아 떠났다.` },
  treasure: { name: '보물찾기', desc: '숨은 보물을 찾는다. 귀한 물건이 잘 나오지만 헛걸음할 수도 있다.', eff: '귀한 물건 ×4, 드문 물건 ×1.8, 찾는 횟수 −40%, 헛걸음 20%', rolls: 0.6, uncommon: 1.8, rare: 4, gold: 1, xp: 1, miss: 0.2,
    open: (w) => `${w} 어딘가에 숨은 보물을 찾아 떠났다.` },
  scout:    { name: '정찰',     desc: '하늘 높이 날아 땅을 살핀다. 물건은 적지만 많이 배운다.', eff: '경험 +60%, 2시간 이상이면 명성 +1, 찾는 횟수 −50%', rolls: 0.5, uncommon: 1, rare: 1, gold: 0.8, xp: 1.6, fame: 1,
    open: (w) => `${w}의 하늘 높이 날아올라 땅을 살폈다.` },
};
// 갈림길: 원정 중간에 한 번 고른다. 고르지 않고 돌아오면 성향에 맞게 저절로 고른다.
// tone: bold(대담) / careful(신중) / kind(다정) / cruel(거침) — 적대는 대담·거침, 은둔은 신중·다정, 우호는 다정·신중 순으로 고름
// 결과(ok/bad): rolls(찾는 횟수 배율), rare(귀한 물건 확률 +), gold(금화 +), xp(경험 배율), hurt(체력 비율 −), mind(정신 ±), rep(가까운 마을 평판), item(확정으로 얻는 물건), loot(지역 재료 n개 더)
const EXP_FORKS = [
  { id: 'storm', text: '하늘이 시커멓게 물들고, 폭풍이 몰려온다.',
    a: { label: '동굴로 피한다', tone: 'careful', ok: { rolls: 0.85, loot: 1, text: '동굴에서 비를 피했다. 시간은 흘렀지만, 바위틈에서 무언가를 주웠다.' } },
    b: { label: '폭풍을 뚫고 날아간다', tone: 'bold', chance: 0.6, ok: { rolls: 1.25, text: '번개 사이를 가르며 날았다. 폭풍 너머에 아무도 밟지 않은 땅이 펼쳐졌다.' }, bad: { hurt: 0.15, text: '거센 바람에 날개가 꺾여 바위에 부딪혔다.' } } },
  { id: 'tracks', text: '진흙 위로 집채만 한 발자국이 이어져 있다.', wild: true,
    a: { label: '발자국을 따라간다', tone: 'bold', chance: 0.55, ok: { trophy: 2, gold: 25, text: '발자국 끝에서 늙은 짐승의 굴을 찾았다. 싸움 끝에 전리품을 챙겼다.' }, bad: { hurt: 0.2, text: '굴의 주인은 생각보다 컸다. 겨우 빠져나왔다.' } },
    b: { label: '조용히 돌아간다', tone: 'careful', ok: { rolls: 1.1, text: '괜한 싸움을 피하고 갈 길을 서둘렀다.' } } },
  { id: 'caravan', text: '인간 상단의 수레바퀴가 진흙에 빠져, 상인들이 쩔쩔매고 있다.',
    a: { label: '수레를 들어 올려 준다', tone: 'kind', ok: { rep: 6, gold: 15, text: '수레를 번쩍 들어 올려 주었다. 상인들이 놀라더니 감사의 표시로 금화를 건넸다.' } },
    b: { label: '겁을 줘 짐을 빼앗는다', tone: 'cruel', ok: { rep: -10, gold: 60, text: '포효 한 번에 상인들이 짐을 버리고 달아났다.' } } },
  { id: 'glow', text: '바위틈에서 검붉은 빛이 새어 나온다. 손끝이 저릿하다.',
    a: { label: '파고든다', tone: 'bold', chance: 0.5, ok: { rare: 0.25, loot: 1, text: '빛의 근원에서 귀한 것을 캐냈다.' }, bad: { mind: -12, text: '빛이 머릿속을 파고들었다. 한참 동안 귀가 울렸다.' } },
    b: { label: '지나친다', tone: 'careful', ok: { rolls: 1.1, text: '불길한 빛을 멀리하고 날개를 돌렸다.' } } },
  { id: 'cub', text: '다리를 다친 어린 짐승이 덤불 아래 웅크려 떨고 있다.', wild: true,
    a: { label: '상처를 핥아 준다', tone: 'kind', ok: { mind: 15, xp: 1.2, text: '상처를 핥아 주자 어린 짐승이 비틀비틀 숲으로 돌아갔다. 마음이 따뜻해졌다.' } },
    b: { label: '먹이로 삼는다', tone: 'cruel', ok: { hurt: -0.15, text: '배를 채우고 나니 힘이 솟았다.' } } },
  { id: 'stairs', text: '무너진 탑 아래, 땅속으로 이어진 계단이 보인다.',
    a: { label: '계단을 내려간다', tone: 'bold', chance: 0.45, ok: { item: 'ancient_relic', text: '어둠 속 제단 위에 고대의 유물이 놓여 있었다.' }, bad: { rolls: 0.75, text: '끝없는 통로에서 한참을 헤매다 겨우 빠져나왔다.' } },
    b: { label: '위에서 둘러본다', tone: 'careful', ok: { item: 'rune_stone', loot: 1, text: '무너진 돌 사이에서 룬이 새겨진 돌을 골라냈다.' } } },
  { id: 'river', text: '불어난 강물이 길을 막았다.',
    a: { label: '헤엄쳐 건넌다', tone: 'bold', ok: { rolls: 1.15, hurt: 0.08, text: '거센 물살에 휩쓸릴 뻔했지만 건너편에 닿았다.' } },
    b: { label: '물이 빠질 때까지 기다린다', tone: 'careful', ok: { rolls: 0.9, xp: 1.15, text: '강가에 앉아 물살을 바라보며 많은 것을 생각했다.' } } },
  { id: 'rival', text: '낯선 드래곤 한 마리가 먼저 와서 이 땅을 뒤지고 있다.',
    a: { label: '위협해 쫓아낸다', tone: 'cruel', chance: 0.6, ok: { rolls: 1.3, text: '이빨을 드러내자 낯선 드래곤이 물러났다. 이 땅은 이제 나의 것이다.' }, bad: { hurt: 0.15, rolls: 0.9, text: '상대도 만만치 않았다. 서로 상처만 남기고 갈라섰다.' } },
    b: { label: '함께 뒤지자고 청한다', tone: 'kind', ok: { loot: 1, xp: 1.1, text: '둘이 함께 뒤지니 더 많은 것이 보였다. 헤어질 때 서로 고개를 끄덕였다.' } } },
];
const EXP_RULES = { forkFrom: 0.35, forkTo: 0.6, stanceTone: { hostile: ['bold', 'cruel', 'careful', 'kind'], hermit: ['careful', 'kind', 'bold', 'cruel'], friendly: ['kind', 'careful', 'bold', 'cruel'] } };

// ── 칭호 ───────────────────────────────────────────
// 업적을 이루면 저절로 얻고, 하나를 골라 단다. 단 칭호는 이름 옆에 보이고 작은 효과가 있다 (결투장에는 효과 없음).
// cond: { count: 셈 이름, at } (특성 횟수와 같은 곳에 셈) / { level } / { duel: 결투 승리 } / { scars: 상흔 수 } / { hoard: 보물더미 가치 }
// mod: atk·taken(사냥·강적 전투 공격·받는 피해 배율, region이 있으면 그 지역에서만), eliteAtk(강적 공격), xp(경험치), huntGold(사냥 금화),
//      drop(사냥 전리품 확률 +), craftEn(제작 기력 배율), mindWard(깎이는 정신 배율), heal(치유 배율), helpHp(일으켜 줄 때 체력 +), expRare(원정 귀한 물건 +)
const TITLES = [
  // 사냥
  { id: 'hunter1',   name: '풋내기 사냥꾼',     cond: { count: 'huntwin', at: 10 },  mod: { huntGold: 1.1 },  eff: '사냥 금화 +10%' },
  { id: 'hunter2',   name: '노련한 사냥꾼',     cond: { count: 'huntwin', at: 100 }, mod: { atk: 1.04 },      eff: '사냥 공격 +4%' },
  { id: 'hunter3',   name: '대륙의 포식자',     cond: { count: 'huntwin', at: 400 }, mod: { atk: 1.07, taken: 0.97 }, eff: '사냥 공격 +7%, 받는 피해 −3%' },
  // 지역의 주인: 그 지역에서 사냥 30번 이기기
  { id: 'lord_plains',  name: '평원의 주인',     cond: { count: 'huntwin:plains', at: 30 },  mod: { region: 'plains',  atk: 1.08, taken: 0.92 }, eff: '중앙 평원에서 공격 +8%, 받는 피해 −8%' },
  { id: 'lord_forest',  name: '숲의 그림자',     cond: { count: 'huntwin:forest', at: 30 },  mod: { region: 'forest',  atk: 1.08, taken: 0.92 }, eff: '독안개 숲에서 공격 +8%, 받는 피해 −8%' },
  { id: 'lord_swamp',   name: '늪의 군주',       cond: { count: 'huntwin:swamp', at: 30 },   mod: { region: 'swamp',   atk: 1.08, taken: 0.92 }, eff: '검은 늪에서 공격 +8%, 받는 피해 −8%' },
  { id: 'lord_snow',    name: '설원의 방랑자',   cond: { count: 'huntwin:snow', at: 30 },    mod: { region: 'snow',    atk: 1.08, taken: 0.92 }, eff: '북부 설원에서 공격 +8%, 받는 피해 −8%' },
  { id: 'lord_ruins',   name: '폐허의 파수꾼',   cond: { count: 'huntwin:ruins', at: 30 },   mod: { region: 'ruins',   atk: 1.08, taken: 0.92 }, eff: '고대 유적에서 공격 +8%, 받는 피해 −8%' },
  { id: 'lord_canyon',  name: '협곡의 맹금',     cond: { count: 'huntwin:canyon', at: 30 },  mod: { region: 'canyon',  atk: 1.08, taken: 0.92 }, eff: '태양 협곡에서 공격 +8%, 받는 피해 −8%' },
  { id: 'lord_volcano', name: '불꽃을 걷는 자',  cond: { count: 'huntwin:volcano', at: 30 }, mod: { region: 'volcano', atk: 1.08, taken: 0.92 }, eff: '잿빛 화산에서 공격 +8%, 받는 피해 −8%' },
  // 강적
  { id: 'elite1',    name: '강적 사냥꾼',       cond: { count: 'elite', at: 5 },     mod: { eliteAtk: 1.06 }, eff: '강적과 싸울 때 공격 +6%' },
  { id: 'elite2',    name: '전설을 쓰러뜨린 자', cond: { count: 'elite', at: 30 },   mod: { eliteAtk: 1.1, drop: 0.05 }, eff: '강적과 싸울 때 공격 +10%, 전리품 +5%' },
  // 모으기·떠돌기
  { id: 'gatherer',  name: '약초를 아는 발톱', cond: { count: 'gather', at: 60 },   mod: { heal: 1.15 },     eff: '치유 +15%' },
  { id: 'explorer',  name: '길 찾는 자',       cond: { count: 'explore', at: 60 },  mod: { drop: 0.05 },     eff: '사냥 전리품 +5%' },
  { id: 'wanderer',  name: '먼 길의 나그네',   cond: { count: 'expedition', at: 20 }, mod: { expRare: 0.03 }, eff: '원정 귀한 물건 +3%' },
  { id: 'trader',    name: '흥정꾼',           cond: { count: 'trade', at: 30 },    mod: { huntGold: 1.15 }, eff: '사냥 금화 +15%' },
  { id: 'sleeper',   name: '깊은 잠의 용',     cond: { count: 'rest', at: 40 },     mod: { mindWard: 0.85 }, eff: '깎이는 정신 −15%' },
  // 만들기
  { id: 'crafter1',  name: '솜씨 좋은 발톱',   cond: { count: 'craft', at: 20 },    mod: { craftEn: 0.85 },  eff: '제작 기력 −15%' },
  { id: 'crafter2',  name: '용의 장인',        cond: { count: 'craft', at: 100 },   mod: { craftEn: 0.75 },  eff: '제작 기력 −25%' },
  // 자라기
  { id: 'lv5',       name: '날개를 편 자',     cond: { level: 5 },                  mod: { xp: 1.03 },       eff: '경험치 +3%' },
  { id: 'lv10',      name: '하늘의 주인',      cond: { level: 10 },                 mod: { xp: 1.06 },       eff: '경험치 +6%' },
  // 결투장
  { id: 'duel1',     name: '결투장의 신예',    cond: { duel: 10 },                  mod: { atk: 1.03 },      eff: '사냥 공격 +3%' },
  { id: 'duel2',     name: '결투장의 왕',      cond: { duel: 50 },                  mod: { atk: 1.05, eliteAtk: 1.03 }, eff: '사냥 공격 +5%, 강적 공격 +3%' },
  // 서로 돕기·정신
  { id: 'rescuer',   name: '손을 내미는 자',   cond: { count: 'rescue', at: 3 },    mod: { helpHp: 0.15 },   eff: '일으켜 줄 때 체력 +15%' },
  { id: 'mender',    name: '치유의 손길',      cond: { count: 'healother', at: 15 }, mod: { heal: 1.1, helpHp: 0.05 }, eff: '치유 +10%, 일으켜 줄 때 체력 +5%' },
  { id: 'calmer',    name: '광기를 잠재우는 자', cond: { count: 'calm', at: 3 },     mod: { mindWard: 0.8 },  eff: '깎이는 정신 −20%' },
  // 보물더미
  { id: 'hoard1',    name: '보물을 품은 자',   cond: { hoard: 2000 },               mod: { mindWard: 0.9 },  eff: '깎이는 정신 −10%' },
  { id: 'hoard2',    name: '황금 산의 주인',   cond: { hoard: 5000 },               mod: { huntGold: 1.1, mindWard: 0.9 }, eff: '사냥 금화 +10%, 깎이는 정신 −10%' },
  { id: 'keeper',    name: '보물 지킴이',      cond: { count: 'raidwin', at: 3 },   mod: { atk: 1.03 },      eff: '사냥 공격 +3%' },
  { id: 'scarred',   name: '상흔투성이',       cond: { scars: 3 },                  mod: { taken: 0.95 },    eff: '사냥 받는 피해 −5%' },
];
// 칭호 조건을 사람이 읽는 글로
const TITLE_COUNT_NAMES = { huntwin: '사냥에서 {n}번 이기기', elite: '강적 {n}마리 쓰러뜨리기', gather: '채집 {n}번', explore: '탐사 {n}번', expedition: '원정 {n}번', trade: '시장 거래 {n}번', rest: '둥지에서 {n}번 쉬기', craft: '물건 {n}개 만들기', rescue: '쓰러진 드래곤 {n}번 일으키기', healother: '다른 드래곤 {n}번 치유하기', calm: '광폭화 {n}번 진정시키기', raidwin: '보물 도둑 {n}번 물리치기' };

// ── 장소와 사냥터 난이도 ───────────────────────────
// 야생 지역마다 장소가 셋. 입구는 쉽고 안쪽일수록 사냥터 난이도(Lv.1~12)가 높다.
// 지역으로 날아오면 첫 장소(입구)에 내려앉고, 같은 지역 안에서는 행동력 없이 옮겨 다닌다.
// creature: 사냥감, elite: 강적, weak/resist: 약점·저항 속성, special: 특기 (power 피해 배율, hits 연타, debuff 상태 이상, self 자기 강화)
const PLACES = {
  plains_field:  { region: 'plains',  name: '풀밭',         level: 1,  creature: '들소 떼', type: 'beast',       elite: '뿔 꺾인 들소왕',     weak: [], resist: [], special: { name: '돌진', power: 1.6 },
    desc: '바람에 눕는 풀이 끝없이 이어진다. 들소 떼가 느긋하게 풀을 뜯는다.' },
  plains_hill:   { region: 'plains',  name: '바람 언덕',    level: 2,  creature: '회색 늑대', type: 'beast',     elite: '외눈 늑대왕',        weak: ['fire', 'earth'], resist: [], special: { name: '무리 사냥', power: 0.65, hits: 2 },
    desc: '언덕 꼭대기에서 바람이 울부짖는다. 바위 그늘마다 늑대의 눈이 번뜩인다.' },
  plains_war:    { region: 'plains',  name: '옛 전장',      level: 3,  creature: '떠도는 망령', type: 'ghost',   elite: '녹슨 기사의 망령',   weak: ['fire', 'lightning', 'spirit'], resist: ['poison'], special: { name: '저주', power: 0.6, debuff: { weaken: 2 } },
    desc: '부러진 창과 녹슨 투구가 풀숲에 묻혀 있다. 해가 지면 무언가가 일어선다.' },
  forest_edge:   { region: 'forest',  name: '숲 가장자리',  level: 2,  creature: '거대 거미', type: 'bug',     elite: '여왕 거미',          weak: ['fire'], resist: ['poison'], special: { name: '거미줄', power: 0.5, debuff: { stun: 1 }, chance: 0.45 },
    desc: '나무 사이로 끈적한 거미줄이 햇빛에 반짝인다.' },
  forest_valley: { region: 'forest',  name: '독안개 골짜기', level: 4, creature: '독두꺼비', type: 'reptile',      elite: '부풀어 오른 두꺼비왕', weak: ['fire', 'ice'], resist: ['poison'], special: { name: '독액', power: 0.8, debuff: { poison: 3 } },
    desc: '초록 안개가 낮게 깔린 골짜기. 숨을 들이쉴 때마다 목이 따끔하다.' },
  forest_heart:  { region: 'forest',  name: '고목의 심장',  level: 6,  creature: '나무 수호자', type: 'spirit',   elite: '천 년 고목의 정령',  weak: ['fire', 'acid'], resist: ['poison', 'lightning'], special: { name: '뿌리 감기', power: 0.7, debuff: { stun: 1 }, chance: 0.5 },
    desc: '숲 한가운데 하늘을 가린 고목이 있다. 뿌리가 숨을 쉬듯 꿈틀거린다.' },
  swamp_reeds:   { region: 'swamp',   name: '갈대밭',       level: 3,  creature: '늪 악어', type: 'reptile',       elite: '늪의 늙은 악어',     weak: ['lightning'], resist: ['poison', 'acid', 'water'], special: { name: '물어 끌기', power: 1.5 },
    desc: '검은 갈대가 사람 키보다 높이 자랐다. 물속에서 커다란 눈이 떠올랐다 가라앉는다.' },
  swamp_village: { region: 'swamp',   name: '가라앉은 마을', level: 5, creature: '늪 망령', type: 'ghost',       elite: '물에 잠긴 촌장의 망령', weak: ['fire', 'lightning', 'spirit'], resist: ['poison', 'ice'], special: { name: '울부짖음', power: 0.5, debuff: { weaken: 3 } },
    desc: '지붕만 남은 집들이 늪 위로 솟아 있다. 밤마다 종소리가 들린다고 한다.' },
  swamp_mire:    { region: 'swamp',   name: '검은 수렁',    level: 7,  creature: '어린 히드라', type: 'reptile',   elite: '머리 셋 달린 히드라', weak: ['fire'], resist: ['poison', 'acid', 'water'], special: { name: '세 머리 물기', power: 0.55, hits: 3 },
    desc: '빠지면 다시는 올라오지 못한다는 수렁. 거품 사이로 비늘 덮인 목들이 솟는다.' },
  snow_field:    { region: 'snow',    name: '눈벌판',       level: 2,  creature: '설원 늑대', type: 'beast',     elite: '서리 늑대 우두머리', weak: ['fire'], resist: ['ice'], special: { name: '무리 사냥', power: 0.65, hits: 2 },
    desc: '눈보라가 지나간 뒤 세상이 고요하다. 눈 위에 발자국이 어지럽게 찍혀 있다.' },
  snow_cave:     { region: 'snow',    name: '얼음 동굴',    level: 5,  creature: '얼음 트롤', type: 'giant',     elite: '서리 트롤 족장',     weak: ['fire', 'lightning'], resist: ['ice', 'water'], special: { name: '얼음 몽둥이', power: 1.4, debuff: { freeze: 1 }, chance: 0.3, element: 'ice' },
    desc: '푸른 얼음벽이 끝없이 이어진다. 안쪽에서 무언가 얼음을 깨무는 소리가 난다.' },
  snow_peak:     { region: 'snow',    name: '오로라 봉우리', level: 9, creature: '서리 와이번', type: 'flyer',   elite: '오로라를 삼킨 와이번', weak: ['fire', 'earth'], resist: ['ice', 'mist'], special: { name: '서리 숨결', power: 1.1, debuff: { freeze: 1 }, chance: 0.4, element: 'ice' },
    desc: '하늘과 가장 가까운 봉우리. 초록빛 커튼 아래로 날개 달린 그림자가 맴돈다.' },
  ruins_hall:    { region: 'ruins',   name: '무너진 회랑',  level: 4,  creature: '돌 파수꾼', type: 'construct',     elite: '깨어난 수호 골렘',   weak: ['acid'], resist: ['lightning', 'fire', 'earth'], special: { name: '돌 피부', self: { harden: 2 } },
    desc: '무너진 석주 사이로 바람이 운다. 벽의 드래곤 그림이 이쪽을 내려다본다.' },
  ruins_crypt:   { region: 'ruins',   name: '지하 묘실',    level: 7,  creature: '해골 기사', type: 'ghost',     elite: '이름 잃은 왕의 기사', weak: ['fire', 'lightning', 'earth'], resist: ['poison', 'ice'], special: { name: '저주받은 검', power: 1.2, debuff: { bleed: 3 } },
    desc: '계단이 땅속 깊이 이어진다. 관 뚜껑마다 긁힌 자국이 남아 있다.' },
  ruins_altar:   { region: 'ruins',   name: '봉인된 제단',  level: 11, creature: '고대 골렘', type: 'construct',     elite: '봉인의 거신',        weak: ['acid'], resist: ['lightning', 'fire', 'poison', 'earth'], special: { name: '대지 강타', power: 1.7 },
    desc: '룬이 새겨진 제단이 희미하게 빛난다. 봉인이 조금씩 풀리고 있다.' },
  canyon_path:   { region: 'canyon',  name: '붉은 바위길',  level: 3,  creature: '사막 전갈', type: 'bug',     elite: '황금 꼬리 전갈',     weak: ['ice', 'water'], resist: ['fire'], special: { name: '독침', power: 0.8, debuff: { poison: 3 } },
    desc: '붉은 바위벽이 한낮의 열기를 뿜는다. 바위틈에서 집게발이 딸깍거린다.' },
  canyon_storm:  { region: 'canyon',  name: '모래 폭풍 지대', level: 6, creature: '모래 벌레', type: 'bug',    elite: '협곡을 삼키는 벌레', weak: ['ice', 'water'], resist: ['fire', 'mist', 'earth'], special: { name: '모래 삼키기', power: 1.5 },
    desc: '모래바람이 시야를 가린다. 발밑의 모래가 거대한 숨을 쉬듯 꺼졌다 솟는다.' },
  canyon_cliff:  { region: 'canyon',  name: '황금 절벽',    level: 10, creature: '그리핀', type: 'bird',        elite: '태양을 등진 그리핀왕', weak: ['ice', 'lightning', 'earth'], resist: ['fire'], special: { name: '급강하', power: 1.6 },
    desc: '절벽 꼭대기 둥지에 금빛 깃털이 흩날린다. 드래곤에게도 물러서지 않는 짐승이 산다.' },
  volcano_slope: { region: 'volcano', name: '잿빛 비탈',    level: 4,  creature: '화염 도마뱀', type: 'reptile',   elite: '용암 도롱뇽 군주',   weak: ['ice', 'water'], resist: ['fire'], special: { name: '불 뿜기', power: 0.9, debuff: { burn: 3 }, element: 'fire' },
    desc: '잿가루가 눈처럼 날린다. 굳은 용암 사이로 도마뱀들이 빠르게 숨는다.' },
  volcano_cave:  { region: 'volcano', name: '용암 동굴',    level: 8,  creature: '용암 골렘', type: 'construct',     elite: '녹아내린 대장장이의 골렘', weak: ['ice', 'water'], resist: ['fire', 'poison'], special: { name: '용암 주먹', power: 1.3, debuff: { burn: 3 }, element: 'fire' },
    desc: '붉은 빛이 동굴 벽을 핥는다. 땅 밑에서 무언가 거대한 것이 걸어 다닌다.' },
  volcano_crater:{ region: 'volcano', name: '분화구',       level: 12, creature: '화염 거인', type: 'giant', eliteType: 'ghost',     elite: '잠든 화룡의 망령',   weak: ['ice', 'water'], resist: ['fire', 'poison'], special: { name: '화산 강타', power: 1.8, debuff: { burn: 3 }, element: 'fire' },
    desc: '대륙에서 가장 뜨거운 곳. 끓는 용암 위로 오래전 쓰러진 드래곤의 뼈가 보인다.' },
};
// 장소별 사냥 전리품
const PLACE_DROPS = {'plains_field': 'bison_horn', 'plains_hill': 'wolf_pelt', 'plains_war': 'ghost_ash', 'forest_edge': 'spider_silk', 'forest_valley': 'toad_gland', 'forest_heart': 'living_bark', 'swamp_reeds': 'croc_scale', 'swamp_village': 'ghost_ash', 'swamp_mire': 'hydra_blood', 'snow_field': 'wolf_pelt', 'snow_cave': 'troll_tusk', 'snow_peak': 'wyvern_membrane', 'ruins_hall': 'stone_heart', 'ruins_crypt': 'cursed_steel', 'ruins_altar': 'seal_core', 'canyon_path': 'scorpion_stinger', 'canyon_storm': 'sandworm_tooth', 'canyon_cliff': 'griffin_feather', 'volcano_slope': 'salamander_tail', 'volcano_cave': 'magma_core', 'volcano_crater': 'giant_ember'};
for (const [id, p] of Object.entries(PLACES)) { p.id = id; p.drop = PLACE_DROPS[id]; }
// 지역별 장소 (입구 → 안쪽)
const REGION_PLACES = {};
for (const p of Object.values(PLACES)) (REGION_PLACES[p.region] ||= []).push(p.id);
for (const ids of Object.values(REGION_PLACES)) ids.sort((a, b) => PLACES[a].level - PLACES[b].level);
const PLACE_RULES = {
  tooHard: 3,          // 내 레벨 + 이만큼보다 어려운 장소에는 들어갈 수 없음
  moveCooldown: 1200,  // 장소를 옮기는 간격 (ms)
  lootPerLevel: { uncommon: 0.012, rare: 0.005 }, // 깊은 장소일수록 귀한 재료가 잘 나옴 (사냥터 Lv.1당)
  dropChance: { common: 0.6, uncommon: 0.45, rare: 0.3 }, // 사냥에 이기면 그 장소의 전리품이 나올 확률 (강적은 2개 확정)
};

// ── 쓰러짐과 죽음 ──────────────────────────────────
// 직접 싸우는 강적 전투에서 지면 체력이 0이 되어 쓰러진다. 상흔을 입고 일어서거나, 긴 잠에 든다.
const DEATH = {
  reviveHp: 0.3,               // 상흔을 입고 일어설 때 체력 (최대치 비율)
  graveDays: 3,                // 남긴 둥지(식구·재산)를 거둘 수 있는 날 수. 지나면 식구는 실종, 재산은 흩어짐
  waitMs: 3 * 60 * 60 * 1000,  // 다른 드래곤의 도움을 기다릴 수 있는 시간 (쓰러질 때마다 한 번)
  helpAp: 2, helpEn: 8,        // 일으켜 세우는 쪽이 쓰는 행동력·기력
  helpHp: 0.3,                 // 도움으로 일어설 때 체력 (상흔 없음). 돕는 쪽이 '치유'를 배웠으면 healHp
  healHp: 0.5,
  helpFame: 2, helpXp: 25,     // 돕는 쪽이 받는 것
};

// ── 정신과 오염 ────────────────────────────────────
// 오염된 땅(야생 지역 하나, 이틀마다 옮겨 감)과 오염된 몬스터가 정신을 깎는다. 정신이 0이 되면 광폭화
const MIND = {
  max: 100,
  regenEvery: 3 * 60 * 1000,   // 정신 1이 차는 간격 (둥지에서 쉬면 3배, 은둔이면 1.3배 빠름)
  restMult: 3, hermitMult: 1.3,
  rotateMs: 2 * DAY,           // 오염된 땅이 옮겨 가는 간격
  drain: { explore: 5, gather: 4, hunt: 0, expedition: 2 }, // 오염된 땅에서 행동할 때 깎이는 정신 (원정은 10분마다). 사냥은 몬스터가 깎음
  monster: 0.5,                // 오염된 몬스터가 입힌 피해의 이만큼 정신도 깎임
  monsterAtk: 1.15,            // 오염된 몬스터는 조금 더 셈
  eliteChance: 0.25,           // 오염된 땅에서 강적이 나올 확률
  crystal: { explore: 0.25, gather: 0.2, hunt: 0.3, elite: 2 }, // 오염 결정이 나올 확률 (강적은 개수)
  warnAt: 10,                  // 이 아래로 떨어지면 경고
  berserkMinutes: 30,          // 광폭화를 저지해야 하는 시간 (다른 드래곤이 아무도 없으면 2배)
  berserkAtk: 1.3,             // 광폭화한 드래곤의 공격력
  timeoutHpLoss: 0.5,          // 저지되지 않으면 잃는 체력 비율
  timeoutRep: -20,             // 가까운 마을 평판
  timeoutFame: -3,
  kinGuard: 0.5,               // 용기사나 유대 60 이상인 인간 식구가 곁에 있으면 피해가 이만큼으로 줆
  afterTimeout: 30,            // 광폭화가 끝난 뒤 정신
  afterCalm: 50,
  calmFame: 4, calmXp: 30,     // 진정시킨 드래곤이 받는 것
};

// ── 전투 ───────────────────────────────────────────
// 사냥은 자동 전투로 한 번에 끝나고, 가끔 나타나는 강적과 결투장은 직접 턴을 고른다.
const COMBAT = {
  maxTurns: 12,            // 이만큼 지나면 남은 체력 비율로 판정
  enPerTurn: 2,            // 턴마다 차는 기력
  huntReserve: 0.25,       // 자동 사냥은 기력을 이만큼(최대치 비율) 남겨 둠 (제작할 몫)
  fleeBelow: 0.2,          // 자동 사냥은 체력이 이 아래면 물러남
  eliteChance: 0.12,       // 사냥하다 강적을 만날 확률 (레벨 2부터)
  eliteFrom: 2,
  maxSkills: 3,            // 숨결 말고 들고 갈 수 있는 스킬 수
  turnSeconds: 30,         // 실시간 결투에서 한 턴을 고르는 시간. 넘기면 자동으로 고름
  inviteSeconds: 30,       // 결투 신청을 기다리는 시간
  autoCooldown: 10 * 60 * 1000, // 같은 상대에게 자동 결투를 다시 걸 수 있는 간격
  fameWin: 3, fameRival: 2, fameLose: -1,
  xpWin: 15, xpLose: 5,
  // 사냥감 세기: [기본, 사냥터 Lv.1당]. 강적은 체력·공격에 배율
  creature: { hp: [27, 4.2], atk: [8, 0.85], def: [3.5, 0.4], eliteHp: 1.8, eliteAtk: 1.2 },
  // 무리 조우: 사냥하다 여러 마리를 한꺼번에 만남. 함께 나온 사냥감은 조금 약하고(체력·공격 배율), 쓰러뜨린 만큼 전리품이 더 나옴
  group: {
    from: 2,             // 사냥터 Lv. 이만큼부터 무리가 나옴
    chance: 0.3,         // 무리를 만날 확률
    threeFrom: 5, three: 0.25, // 사냥터 Lv.5부터는 무리 중 이 확률로 세 마리
    hp: 0.5, atk: 0.6,   // 함께 나온 사냥감의 세기
    prefixes: ['어린', '굶주린', '사나운', '떠돌이'],
    splash: 0.4,         // 숨결이 다른 적에게 번지는 피해 비율
    xp: 0.5, gold: 0.6, dropChance: 0.5, // 함께 나온 사냥감 한 마리당 경험치·금화 배율, 전리품 확률 배율
    maxTurns: 16,        // 무리와 싸울 때 최대 턴
  },
};
// 종류마다 하나뿐인 숨결. 기력 12, 3턴마다
const BREATHS = {
  red:    { name: '화염 숨결',   element: 'fire',      power: 1.35, debuff: { burn: 3 }, desc: '불길을 쏟아 큰 피해를 주고, 세 턴 동안 불태운다.' },
  black:  { name: '산 숨결',     element: 'acid',      power: 1.1,  debuff: { acid: 3 }, desc: '비늘을 녹여 세 턴 동안 상대의 방어를 절반으로 만든다.' },
  white:  { name: '눈보라 숨결', element: 'ice',       power: 1.0,  debuff: { freeze: 1 }, chance: 0.7, desc: '얼음 폭풍으로 피해를 주고, 높은 확률로 한 턴 얼려 움직이지 못하게 한다.' },
  gold:   { name: '번개 숨결',   element: 'lightning', power: 1.7,  debuff: { stun: 1 }, chance: 0.3, desc: '가장 강한 한 방. 가끔 상대를 마비시켜 한 턴 쉬게 한다.' },
  green:  { name: '독 숨결',     element: 'poison',    power: 0.75, debuff: { poison: 4 }, desc: '짙은 독안개로 네 턴 동안 중독시킨다.' },
  silver: { name: '안개 숨결',   element: 'mist',      power: 0.6,  self: { evade: 3 }, desc: '은빛 안개에 몸을 숨겨, 세 턴 동안 공격을 잘 피한다.' },
  blue:   { name: '해일 숨결',   element: 'water',     power: 1.05, debuff: { soak: 2 }, desc: '거센 물살로 피해를 주고, 두 턴 동안 흠뻑 젖게 해 굼뜨게 만든다 (속도 −30%, 잘 피하지 못함). 젖은 적에게 꼬리치기를 하면 넘어뜨린다.' },
  purple: { name: '자수정 숨결', element: 'spirit',    power: 0.95, drain: 0.4, cleanse: 1, desc: '보랏빛 결정을 쏟아 피해를 주고, 입힌 피해의 40%만큼 체력을 되찾으며 나쁜 상태 하나를 씻어 낸다.' },
  bronze: { name: '모래 폭풍 숨결', element: 'earth',  power: 1.0,  self: { stone: 2 }, desc: '모래와 돌 조각을 쏟아 피해를 주고, 두 턴 동안 비늘이 돌처럼 굳어 받는 피해가 30% 준다.' },
};
const BREATH_COST = { en: 12, cd: 3 };
const ELEMENTS = { fire: '화염', acid: '산', ice: '얼음', lightning: '번개', poison: '독', mist: '안개', water: '물', spirit: '정화', earth: '대지' };
// 레벨이 오르면 배우는 스킬
// 다른 드래곤 치유하기: '치유'를 배운 드래곤이 같은 지역의 다친 드래곤을 고쳐 줌. 회복량은 치유 스킬과 같음 (돕는 쪽의 지혜, 받는 쪽의 최대 체력)
const HEAL_OTHER = {
  ap: 1, en: 8,                  // 쓰는 행동력·기력
  cooldown: 3 * 60 * 1000,       // 한 번 쓰면 이만큼 뒤에 다시
  bonus: 1.2,                    // 전투 밖에서 차분히 쓰니 전투 때보다 조금 더 회복
  xp: 8,                         // 고쳐 준 쪽이 받는 경험치
  fame: 1, fameEvery: 60 * 60 * 1000, // 같은 드래곤을 고쳐 줄 때 명성은 이 간격에 한 번만
};
const SKILLS = {
  tail:   { name: '꼬리치기',     lv: 1, en: 4,  cd: 1, power: 1.25, desc: '꼬리를 휘둘러 묵직하게 친다. 피해 ×1.25.' },
  harden: { name: '비늘 세우기',  lv: 2, en: 5,  cd: 3, self: { harden: 2 }, desc: '비늘을 곤두세워 두 턴 동안 받는 피해가 절반이 된다.' },
  roar:   { name: '포효',         lv: 3, en: 6,  cd: 3, debuff: { weaken: 3 }, majesty: true, desc: '세 턴 동안 상대의 공격을 30% 꺾는다. 위엄이 높을수록 잘 통한다. 적이 여럿이면 모두에게 울린다.' },
  mend:   { name: '치유',         lv: 4, en: 8,  cd: 4, heal: { base: 6, mag: 0.9, pct: 0.12 }, cleanse: true, desc: '치유 마법으로 상처를 아물게 해 체력을 되찾고 화상·중독·출혈을 씻어 낸다. 지혜가 높을수록 많이 회복한다. 쓰러진 드래곤을 일으킬 때도 더 많이 회복시킨다.' },
  gust:   { name: '날개 돌풍',    lv: 5, en: 6,  cd: 3, power: 0.8, self: { dodge: 1 }, desc: '거센 바람으로 피해 ×0.8, 다음 공격 한 번을 반드시 피한다.' },
  rend:   { name: '찢어발기기',   lv: 7, en: 8,  cd: 3, power: 1.2, debuff: { bleed: 3 }, desc: '발톱으로 깊이 찢어 피해 ×1.2, 세 턴 동안 피를 흘리게 한다.' },
  devour: { name: '포식',         lv: 9, en: 10, cd: 4, power: 1.0, drain: 0.5, desc: '물어뜯어 입힌 피해의 절반만큼 체력을 되찾는다.' },
};
// 상태 이름 (화면 표시용)
const STATUS = {
  burn: '화상', poison: '중독', bleed: '출혈', acid: '비늘 녹음', freeze: '얼어붙음', stun: '마비',
  weaken: '움츠러듦', harden: '비늘 세움', evade: '안개', dodge: '돌풍',
  brittle: '얼음 금', dazed: '휘청임', opening: '반격 기회',
  soak: '흠뻑 젖음', stone: '돌 비늘',
};
// 연계: 상대의 상태에 맞는 스킬을 쓰면 추가 효과
// (얼어붙음·마비가 풀린 다음 턴에도 '얼음 금'·'휘청임'이 남아 연계를 이을 수 있다)
const COMBOS = {
  shatter:  { name: '얼음 깨기',     skill: ['tail'],                  when: ['freeze', 'brittle'], desc: '얼어붙은 적에게 꼬리치기: 피해 ×2' },
  vital:    { name: '급소 찌르기',   skill: ['attack', 'rend'],        when: ['stun', 'dazed'],     desc: '마비된 적에게 할퀴기·찢어발기기: 반드시 급소' },
  wildfire: { name: '불길 번짐',     skill: ['gust'],                  when: ['burn'],              desc: '불타는 적에게 날개 돌풍: 화상 피해를 바로 한 번 더, 화상 3턴 연장' },
  flay:     { name: '녹은 비늘 찢기', skill: ['rend'],                 when: ['acid'],              desc: '비늘이 녹은 적에게 찢어발기기: 출혈 피해 ×2' },
  surge:    { name: '물살 휩쓸기',   skill: ['tail'],                  when: ['soak'],              desc: '흠뻑 젖은 적에게 꼬리치기: 미끄러져 한 턴 마비 (급소 찌르기로 이어짐)' },
  spread:   { name: '독 퍼뜨리기',   skill: ['tail', 'devour'],        when: ['poison'],            desc: '중독된 적에게 꼬리치기·포식: 독 피해 +50%, 중독 2턴 연장' },
};
// 강적의 분노: 체력이 이 비율 아래로 떨어지면 한 번
const ENRAGE = { below: 0.5, atk: 1.25, every: 2 };
// 사냥감의 전투 성질: 약점(피해 ×1.5)과 저항(피해 ×0.5, 상태 이상이 통하지 않음), 특기
const CREATURE_COMBAT = {
  plains:  { weak: [],            resist: [],                    special: { name: '돌진', power: 1.6 } },
  snow:    { weak: ['fire'],      resist: ['ice'],               special: { name: '무리 사냥', power: 0.65, hits: 2 } },
  forest:  { weak: ['fire'],      resist: ['poison'],            special: { name: '거미줄', power: 0.5, debuff: { stun: 1 }, chance: 0.45 } },
  swamp:   { weak: ['lightning'], resist: ['poison', 'acid'],    special: { name: '물어 끌기', power: 1.5 } },
  ruins:   { weak: ['acid'],      resist: ['lightning', 'fire'], special: { name: '돌 피부', self: { harden: 2 } } },
  canyon:  { weak: ['ice'],       resist: ['fire'],              special: { name: '독침', power: 0.8, debuff: { poison: 3 } } },
  volcano: { weak: ['ice'],       resist: ['fire'],              special: { name: '불 뿜기', power: 0.9, debuff: { burn: 3 }, element: 'fire' } },
};
// 사냥감 계통 (화면 아이콘): beast 짐승 · bug 벌레 · reptile 파충류 · ghost 망령 · construct 골렘 · giant 거인 · flyer 날짐승(날개) · bird 새(그리핀) · spirit 정령 · thief 도둑
// PLACES의 type이 사냥감, eliteType이 있으면 강적의 계통 (없으면 type과 같음)
// 강적: 레벨 +2, 체력 1.6배. 이기면 귀한 물건과 금화, 용족 명성
const ELITES = {
  plains: '뿔 꺾인 들소왕', snow: '서리 늑대 우두머리', forest: '여왕 거미', swamp: '늪의 늙은 악어',
  ruins: '깨어난 수호 골렘', canyon: '황금 꼬리 전갈', volcano: '용암 도롱뇽 군주',
};

module.exports = {
  KINDS, REGIONS, STANCES, STATS, CREATION, derive, ITEMS, REGION_LOOT, CREATURES, SCENES, RULES, SLOTS, RECIPES, BUFFS, TITLES, TITLE_COUNT_NAMES,
  SHOPS, SHOPS_SPECIAL, REP_TIERS, repTier, TRADE, NEST, HOARD_TIERS, hoardTier, RAID, STANCE_RULES, FAME_TIERS, fameTier,
  DAY, KIN, TALENTS, HUMAN_NAMES, DRAKE_NAMES, EVENT_RULES, TRAITS, TRAIT_EARN, TRAIT_COUNTS, STAT_POINTS, MIND, PLACES, REGION_PLACES, PLACE_RULES, DEATH,
  COMBAT, BREATHS, BREATH_COST, ELEMENTS, SKILLS, HEAL_OTHER, STATUS, CREATURE_COMBAT, ELITES, COMBOS, ENRAGE, EXP_GOALS, EXP_FORKS, EXP_RULES,
};
