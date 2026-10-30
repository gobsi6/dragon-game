// 게임 기본 데이터: 드래곤 종류와 대륙 지도
// 새 종류나 지역을 추가할 때는 이 파일만 고치면 됩니다.

// 능력치. 키 이름은 저장 공간의 열 이름과 같습니다.
const STATS = [
  { key: 'claw',    name: '발톱', desc: '공격할 때 입히는 피해가 커진다.' },
  { key: 'scale',   name: '비늘', desc: '최대 체력이 늘고 받는 피해가 줄어든다.' },
  { key: 'wing',    name: '날개', desc: '공격을 잘 피하고, 먼저 움직이며, 빠르게 난다.' },
  { key: 'wisdom',  name: '지혜', desc: '숨결과 스킬의 힘이 깊어지고, 제작에 능하며, 숨은 것을 잘 찾아낸다.' },
  { key: 'majesty', name: '위엄', desc: '기세로 상대를 누르고 얼어붙음·마비·지속 피해를 잘 버틴다. 인간을 설득하거나 위협하는 힘도 커진다.' },
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
  // GM 시험용 종족: 드래곤을 만들 때 고를 수 없고, GM 도구의 '종족'에서만 바꿀 수 있다.
  // 이 종족의 드래곤은 목록에는 보이지만 다른 드래곤과 어울리지 못한다 (social·arena·death에서 막음)
  clear: {
    name: '투명 드래곤',
    breath: '없음',
    home: 'capital',
    hidden: true, test: true,
    desc: '대륙의 목소리가 세상을 살펴보려고 빚어 둔 그림자. 누구의 눈에도 비치지만, 누구와도 닿지 않는다.',
    stats: { claw: 9, scale: 9, wing: 9, wisdom: 9, majesty: 9 },
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
  // ── 멸망한 대륙 에레보스 (남쪽 해안에서 바다를 건너감. realm: 'ruin', 지도도 따로) ──
  // unlock: 모두의 정화도가 이 비율에 닿으면 열림. drain: 정신이 깎이는 배율 (RUIN.drain에 곱함)
  { id: 'ruin_shore',   name: '잿빛 상륙지',      tag: '멸망', realm: 'ruin', x: 230, y: 470, unlock: 0,    drain: 0.6,
    gate: { x: 862, y: 575, label: '멸망한 대륙' }, // 본 대륙 지도에서 이 땅으로 가는 표시를 그릴 자리
    desc: '검은 파도가 닿는 잿빛 모래톱. 무너진 부두 옆에 살아남은 자들이 피운 작은 모닥불 하나가 흔들린다.' },
  { id: 'ruin_plain',   name: '시든 평원',        tag: '멸망', realm: 'ruin', x: 430, y: 335, unlock: 0.25, drain: 1,
    desc: '한때 금빛 밀밭이었던 들판. 이삭은 검게 말라 있고, 허수아비들이 이쪽을 돌아본다.' },
  { id: 'ruin_capital', name: '무너진 왕도 카르넴', tag: '멸망', realm: 'ruin', x: 655, y: 205, unlock: 0.5,  drain: 1.2,
    desc: '용과 인간이 함께 세웠다는 왕도. 무너진 성벽 위로 아직도 깃발 하나가 찢긴 채 펄럭인다.' },
  { id: 'ruin_rift',    name: '심연의 균열',      tag: '멸망', realm: 'ruin', x: 825, y: 430, unlock: 0.75, drain: 1.5,
    desc: '대륙을 둘로 가른 검은 틈. 바닥이 보이지 않고, 그 아래에서 무언가가 숨을 쉰다.' },
];

// 서로 바로 날아갈 수 있는 지역 쌍 (양방향)
const ROUTES = [
  ['plains', 'capital'], ['plains', 'forest'], ['plains', 'swamp'],
  ['plains', 'canyon'], ['plains', 'coast'],
  ['coast', 'ruin_shore'], // 바다 건너기 (RUIN.crossAp, RUIN.minLevel)
  ['ruin_shore', 'ruin_plain'], ['ruin_plain', 'ruin_capital'], ['ruin_plain', 'ruin_rift'], ['ruin_capital', 'ruin_rift'],
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
REGIONS.coast.gate = { x: 130, y: 585, label: '남쪽 해안' }; // 멸망한 대륙 지도에서 '바다 건너 남쪽 해안'을 그릴 자리


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
  // ── 멸망한 대륙: 희귀 재료 (반드시 만들 수 있는 장비의 재료) ──
  ashen_core:    { name: '잿빛 심장',     rarity: 'rare',     value: 60, desc: '오염된 강적의 가슴에서 식지 않고 뛰던 잿빛 덩어리. 정화하면 단단한 힘이 된다.' },
  carnem_steel:  { name: '카르넴 강철',   rarity: 'uncommon', value: 30, desc: '용의 불로 벼린 왕국의 강철. 녹이 슬어도 날은 무뎌지지 않았다.' },
  void_silk:     { name: '공허의 실',     rarity: 'uncommon', value: 30, desc: '균열 가장자리에서 뽑아낸 검은 실. 빛을 먹어 거의 보이지 않는다.' },
  king_scale:    { name: '왕룡의 금빛 비늘', rarity: 'rare',   value: 150, desc: '카르넴의 왕룡이 검게 물들어 가면서도 끝까지 지켜 낸 비늘. 왕좌의 회랑 어둠 속에서도 홀로 금빛을 잃지 않았다.' },
  // 2시간 이상 원정에서만 (어느 지역이든)
  star_fragment: { name: '별똥별 조각',     rarity: 'rare',     value: 50, desc: '먼 길 끝에서만 주울 수 있는, 밤하늘에서 떨어진 빛나는 돌. 두 시간 넘게 원정을 다녀와야 손에 넣을 수 있다.' },
  // ── 멸망한 대륙: 보물 (cat: treasure. 둥지의 보물더미에만 쌓을 수 있고, 팔 수 없고, 보물 도둑도 가져가지 못함) ──
  // value가 보물더미 가치
  tr_map_piece:   { name: '왕국의 지도 조각', rarity: 'uncommon', cat: 'treasure', value: 250, desc: '카르넴 왕국의 옛 지도 한 귀퉁이. 지금은 없는 강과 마을이 그려져 있다.' },
  tr_star_orb:    { name: '별을 담은 유리구슬', rarity: 'uncommon', cat: 'treasure', value: 320, desc: '안에서 작은 별빛이 천천히 돈다. 멸망 전 아이들이 가지고 놀던 장난감이었다고 한다.' },
  tr_dragon_idol: { name: '오염된 용 석상', rarity: 'rare', cat: 'treasure', value: 450, desc: '검게 물든 용 석상. 둥지에 두면 이상하게도 마음이 가라앉는다.' },
  // ── 지하 회랑: 파수꾼·수호자를 쓰러뜨리면 아주 드물게 (cat: treasure) ──
  mz_scale_charm: { name: '고대 용의 비늘 장식', rarity: 'rare', cat: 'treasure', value: 300, desc: '회랑 벽에 박혀 있던 비늘. 누구의 것인지 모르지만, 손에 쥐면 희미하게 따뜻하다.' },
  mz_crystal_eye: { name: '잠든 수정 눈',       rarity: 'rare', cat: 'treasure', value: 380, desc: '돌 파수꾼의 눈이었던 수정. 어둠 속에서 아주 느리게 깜박인다.' },
  mz_king_seal:   { name: '옛 왕의 인장',       rarity: 'rare', cat: 'treasure', value: 500, desc: '지하 회랑을 판 이들의 인장. 용과 사람의 손이 함께 새겨져 있다.' },
  // 상흔을 하나 씻어 냄: 지하 회랑 수호자(아주 드물게) · 멸망한 대륙 생존자 교환. 7일에 한 번 (game-logic.js useItem)
  scar_tonic:     { name: '옛 샘의 정수', rarity: 'rare', type: 'use', use: { scar: 1 }, value: 900, desc: '고대도시 아래 샘에서 스며 나온 물을 정화의 결정으로 맑힌 것. 마시면 가장 최근에 입은 상흔 하나가 씻겨 나간다. 몸이 받아들이는 것은 7일에 한 번뿐이다.' },
  mz_city_key:    { name: '고대도시의 열쇠 조각', rarity: 'rare', cat: 'treasure', value: 650, desc: '일곱 층 아래 문의 열쇠였던 것. 조각만으로도 보물더미가 묘하게 환해진다.' },
  tr_seed_sack:   { name: '백 년 묵은 씨앗 자루', rarity: 'rare', cat: 'treasure', value: 600, desc: '모르벤의 밭 가장자리에 묻혀 있던 자루. 아직 싹을 틔울 수 있을 것만 같은 씨앗이 가득하다.' }, // 레이드 (모르벤)
  tr_oath_ring:   { name: '기사단장의 맹세 반지', rarity: 'rare', cat: 'treasure', value: 700, desc: '헤이른의 손가락에 끼워져 있던 반지. 안쪽에 "문을 지킨다"는 맹세가 새겨져 있다.' }, // 레이드 (헤이른)
  tr_ash_mirror:  { name: '잿빛 거울',     rarity: 'rare',     cat: 'treasure', value: 500, desc: '비추면 잿빛 하늘만 보이는 거울. 가끔 멸망 전의 맑은 하늘이 스친다.' },
  tr_broken_crown:{ name: '카르넴의 깨진 왕관', rarity: 'rare', cat: 'treasure', value: 700, desc: '마지막 왕이 쓰던 왕관. 반쪽이 떨어져 나갔지만 보석은 아직 빛난다.' },
  tr_last_claw:   { name: '거대 고룡의 발톱', rarity: 'rare',   cat: 'treasure', value: 900, desc: '대륙이 무너지던 날까지 싸운 거대한 고룡의 발톱. 사람 키보다 길고, 아직 따뜻하다.' },
  // ── 멸망한 대륙: 희귀 장비 (강적이 아주 드물게 떨어뜨림. gear: 사냥·강적에서만 듣는 특별한 효과) ──
  erebus_eye:     { name: '에레보스의 눈', rarity: 'rare', type: 'equip', slot: 'head', bonus: { wisdom: 4, majesty: 2 }, gear: { vsCorrupt: 1.15 }, value: 120, desc: '멸망한 대륙을 끝까지 지켜본 눈. 오염된 적에게 주는 피해 +15%.' },
  knight_gauntlet:{ name: '카르넴 기사단의 발톱갑', rarity: 'rare', type: 'equip', slot: 'claw', bonus: { claw: 6 }, gear: { eliteAtk: 1.12 }, value: 120, desc: '마지막 기사단장이 끼던 발톱 덮개. 강적에게 주는 피해 +12%.' },
  void_ring:      { name: '공허의 꼬리고리', rarity: 'rare', type: 'equip', slot: 'tail', bonus: { scale: 4, wing: 2 }, gear: { taken: 0.92 }, value: 120, desc: '균열에서 건진 검은 고리. 받는 피해 −8%.' },
  abyss_membrane: { name: '심연의 날개막', rarity: 'rare', type: 'equip', slot: 'wing', bonus: { wing: 6 }, gear: { shard: 1 }, value: 120, desc: '심연의 고룡에게서 떨어진 날개막. 멸망한 대륙에서 사냥·강적을 이기면 정화의 결정 +1.' },
  // ── 멸망한 대륙: 만드는 장비 (재료를 모으면 반드시 만들 수 있음) ──
  purified_crown: { name: '정화된 왕관', rarity: 'rare', type: 'equip', slot: 'head', bonus: { majesty: 5, wisdom: 3 }, mindWard: 0.75, value: 100, desc: '잿빛 심장을 정화해 박아 넣은 왕관. 깎이는 정신 −25%.' },
  carnem_claw:    { name: '카르넴 강철 발톱', rarity: 'rare', type: 'equip', slot: 'claw', bonus: { claw: 7, scale: 2 }, value: 100, desc: '왕국의 강철로 다시 벼린 발톱.' },
  void_cloak:     { name: '공허의 날개덮개', rarity: 'rare', type: 'equip', slot: 'wing', bonus: { wing: 6, wisdom: 2 }, mindWard: 0.85, value: 100, desc: '공허의 실로 짠 얇은 덮개. 깎이는 정신 −15%.' },
  // 목·꼬리에도 멸망한 대륙 단계(능력치 합 8, 걸작 9)를 두어 부위마다 천장을 맞춤
  purified_pendant: { name: '정화된 심장 목걸이', rarity: 'rare', type: 'equip', slot: 'neck', bonus: { wisdom: 5, scale: 3 }, value: 100, desc: '정화한 잿빛 심장 한 조각을 왕국 문장 테두리에 박았다. 가슴께에서 희미한 온기가 번진다.' },
  king_tail:        { name: '왕룡의 비늘 꼬리갑', rarity: 'rare', type: 'equip', slot: 'tail', bonus: { scale: 5, claw: 3 }, value: 120, desc: '왕룡의 금빛 비늘을 카르넴 강철 위에 겹겹이 덧댔다. 꼬리를 휘두르면 금빛 잔상이 남는다.' },
  star_charm:     { name: '별빛 부적', rarity: 'rare', type: 'equip', slot: 'charm', bonus: { wisdom: 4 }, expRare: 0.03, value: 100, desc: '별똥별 조각을 엮은 부적. 원정에서 귀한 것이 더 잘 나온다.' },
  // 레이드 장신구 (모르벤의 낫 조각으로 빚음). 둘 다 능력치 합 10: 여럿을 고르게 올리는 것과 하나를 높게 올리는 것
  harvest_sickle:   { name: '이삭지기의 금빛 낫', rarity: 'rare', type: 'equip', slot: 'claw', bonus: { claw: 4, majesty: 3, wisdom: 3 }, value: 160, desc: '모르벤의 낫 조각을 녹여 발톱 끝에 덧씌웠다. 휘두를 때마다 마른 밀 향이 난다.' },
  // 레이드 희귀 장비 (레이드 보스가 아주 드물게 떨어뜨림. gear: 사냥·레이드에서만 듣는 특별한 효과)
  raid_harvest_crown: { name: '거둔 이삭의 관',           rarity: 'rare', type: 'equip', slot: 'head', bonus: { wisdom: 4, majesty: 3 }, gear: { heal: 1.15 }, value: 140, desc: '모르벤이 마지막으로 거둔 이삭을 엮은 관. 치유로 되찾는 체력 +15%.' },
  raid_scarecrow_cloak: { name: '허수아비 군주의 넝마 망토', rarity: 'rare', type: 'equip', slot: 'wing', bonus: { scale: 4, wing: 3 }, gear: { cover: 0.8 }, value: 140, desc: '군주가 걸치고 있던 넝마. 몇 번을 베여도 찢어지지 않는다. 막아서기로 대신 맞을 때 받는 피해 −20%.' },
  raid_heiron_helm:   { name: '헤이른의 금 간 투구',       rarity: 'rare', type: 'equip', slot: 'head', bonus: { scale: 4, majesty: 3 }, gear: { raidAtk: 1.1 }, value: 140, desc: '오백 년 동안 성문을 지킨 투구. 금이 간 자리로 바람이 들어온다. 레이드 보스에게 주는 피해 +10%.' },
  raid_banner_wing:   { name: '기사단 깃발의 날개덮개',    rarity: 'rare', type: 'equip', slot: 'wing', bonus: { wing: 5, claw: 2 }, gear: { flank: 0.15 }, value: 140, desc: '꺾인 깃발 천으로 날개 끝을 감쌌다. 펼치면 대열이 흔들린다. 우회 성공 확률 +15%.' },
  knight_tail_shield: { name: '성문 기사단의 꼬리 방패', rarity: 'rare', type: 'equip', slot: 'tail', bonus: { wing: 4, scale: 3, claw: 3 }, value: 160, desc: '헤이른의 방패를 잘라 꼬리 끝에 맞췄다. 휘두르면 대열을 갈랐던 바람 소리가 난다.' },
  charge_banner_charm: { name: '돌격 깃발 장식', rarity: 'rare', type: 'equip', slot: 'charm', bonus: { wing: 8, claw: 2 }, value: 160, desc: '기사단 깃발의 술을 엮어 만든 장식. 날개를 펼치면 깃발처럼 펄럭인다.' },
  harvest_pendant:  { name: '추수 축복의 목걸이', rarity: 'rare', type: 'equip', slot: 'neck', bonus: { wisdom: 8, scale: 2 }, value: 160, desc: '모르벤이 밀밭에 걸던 축복을 낫 조각에 새겨 다시 깨웠다. 목에 걸면 손끝이 따뜻해진다.' },
  // ── 실험 재료 (자유 제작에서 비어 있던 성질 조합을 채움. 정식 제작법에는 쓰이지 않음) ──
  tough_sinew:     { name: '질긴 힘줄',          rarity: 'uncommon', value: 12, desc: '사냥감의 다리에서 뽑아낸 힘줄. 말리면 어떤 끈보다 질기다.' },
  dry_vine:        { name: '마른 덩굴 줄기',     rarity: 'common',   value: 3,  desc: '숲 바닥을 기던 덩굴을 말린 것. 엮기 좋게 잘 휜다.' },
  owl_quill:       { name: '올빼미 깃펜',        rarity: 'uncommon', value: 12, desc: '유적에 깃든 올빼미의 깃을 다듬은 펜. 끝에 오래된 먹이 말라붙어 있다.' },
  rune_shell:      { name: '글자 새긴 거북 등딱지', rarity: 'rare',  value: 40, desc: '바닷가에 떠밀려 온 커다란 등딱지. 누군가 옛 글자를 빼곡히 새겨 두었다.' },
  frost_thorn:     { name: '서리 수정 가시',     rarity: 'uncommon', value: 12, desc: '얼음 바위틈에서 자란 투명한 가시. 햇빛을 받으면 무지갯빛으로 반짝인다.' },
  rainbow_feather: { name: '무지개새 깃털',      rarity: 'rare',     value: 40, desc: '협곡 위를 나는 무지개새가 떨군 깃털. 보는 각도마다 빛깔이 바뀐다.' },
  wind_stone:      { name: '바람 구멍 돌',       rarity: 'uncommon', value: 10, desc: '바람에 깎여 구멍이 숭숭 난 가벼운 돌. 쥐고 있으면 손이 붕 뜨는 것 같다.' },
  forest_mushroom: { name: '숲 버섯',            rarity: 'common',   value: 3,  desc: '고목 아래 무리 지어 자란 통통한 버섯. 구우면 고소하다.' },
  lotus_root:      { name: '늪 연근',            rarity: 'common',   value: 3,  desc: '늪 바닥 진흙에서 캔 연근. 씹을수록 단맛이 난다.' },
  // 실험 재료로 만드는 숨겨진 제작법 (실험에서 그 조합을 맞히거나 바랜 제작서로 알게 됨)
  owl_charm:       { name: '올빼미 깃 부적',     rarity: 'rare',     type: 'equip', slot: 'charm', bonus: { wing: 2, wisdom: 2 }, value: 70, desc: '올빼미 깃펜 두 자루를 바람 구멍 돌에 꽂아 덩굴로 묶었다. 쥐면 밤바람 소리가 들린다.' },
  shell_gorget:    { name: '거북 등딱지 목가리개', rarity: 'rare',   type: 'equip', slot: 'neck',  bonus: { scale: 3, wisdom: 2 }, value: 110, desc: '옛 글자가 새겨진 등딱지를 늪철 테두리에 박고 질긴 힘줄로 동였다. 목을 감싸면 글자들이 낮게 웅얼거린다.' },
  rainbow_circlet: { name: '무지개 깃 머리장식', rarity: 'rare',     type: 'equip', slot: 'head',  bonus: { majesty: 3, wing: 2 }, value: 120, desc: '무지개새 깃털을 서리 수정 가시와 금으로 엮었다. 날개를 펼칠 때마다 머리 위로 빛이 흩어진다.' },
  forest_stew:     { name: '버섯 연근 찜',       rarity: 'uncommon', type: 'use', use: { hp: 60, en: 30 }, value: 24, desc: '숲 버섯과 늪 연근을 소금 간해 푹 찐 요리. 먹고 나면 속이 든든하고 힘이 돈다.' },
  sulfur:          { name: '유황 덩이',          rarity: 'common',   value: 3,  desc: '화산 틈에서 굳은 노란 덩어리. 매캐한 냄새가 코를 찌른다.' },
  // ── 멸망한 대륙 ──
  purify_shard: { name: '정화의 결정',  rarity: 'uncommon', value: 1, desc: '멸망한 대륙의 오염을 걷어 낼 때 맺히는 맑은 결정. 잿빛 상륙지의 생존자에게 귀한 것과 바꿀 수 있다.' },
  ashen_dust:   { name: '잿빛 먼지',    rarity: 'common',   value: 3, desc: '멸망한 대륙을 덮은 고운 먼지. 손에 묻으면 잘 지워지지 않는다.' },
  faded_crest:  { name: '바랜 왕국 문장', rarity: 'uncommon', value: 18, desc: '카르넴 왕국의 문장이 새겨진 금속 조각. 용과 인간이 함께 그려져 있다.' },
  // 자유 제작용 상급 재료: 옛 지혜·날카로움 쪽 (빛남·가벼움으로 쏠린 것을 덜려고). 정화도 단계마다 하나씩 지혜·발톱이 섞이게 둠
  ashen_tablet:    { name: '잿빛 예언 석판',       rarity: 'uncommon', value: 20, desc: '재를 털어 내자 빼곡한 예언이 드러난 돌판. 마지막 줄은 누군가 손톱으로 긁어 지워 놓았다.' },
  anchor_chain:    { name: '가시 돋친 닻 사슬',    rarity: 'uncommon', value: 22, desc: '부서진 부두에 걸려 있던 닻 사슬. 고리마다 녹슨 가시가 돋아 있어 감으면 단단히 물고 놓지 않는다.' },
  archivist_cord:  { name: '기록관의 비단 끈',     rarity: 'uncommon', value: 25, desc: '왕국의 기록을 묶던 비단 끈. 매듭마다 작은 글자가 수놓여 있어, 풀면 무엇을 묶었는지 알 수 있다.' },
  knight_blade:    { name: '기사단장의 부러진 검날', rarity: 'uncommon', value: 25, desc: '시든 밀밭에 꽂혀 있던 검의 윗동. 반으로 부러졌어도 날은 아직 서 있고, 손잡이 쪽에 기사단의 맹세가 새겨져 있다.' },
  royal_chronicle: { name: '카르넴 왕실 연대기',   rarity: 'rare',     value: 55, desc: '무너진 왕도의 서고에서 건진 두꺼운 기록. 왕국이 무너지던 마지막 날까지 같은 필체로 적혀 있다.' },
  morven_shard:   { name: '모르벤의 낫 조각', rarity: 'rare', value: 60, desc: '이삭지기 모르벤의 낫에서 떨어져 나온 조각. 검게 녹슬었지만 날 끝에 아직 금빛이 남아 있다.' },
  heiron_crest:   { name: '헤이른의 방패 조각', rarity: 'rare', value: 60, desc: '헤이른의 방패에서 떨어져 나온 조각. 용과 인간이 함께 새겨진 자리가 반쯤 깨져 있다.' },
  knight_logbook: { name: '기사단 근무 일지', rarity: 'rare', value: 40, desc: '성문 경비 일지. 날마다 "이상 없음"이라고만 적혀 있고, 뒤로 갈수록 글씨가 흔들린다.' },
  morven_journal: { name: '모르벤의 수확 일지', rarity: 'rare', value: 40, desc: '풍년을 적어 내려가던 낡은 일지. 뒤로 갈수록 같은 날짜만 몇 번이고 되풀이해 적혀 있다.' },
  abyss_fang:      { name: '심연의 송곳니',        rarity: 'rare',     value: 55, desc: '균열 아래에서 올라온 무언가가 남기고 간 이빨. 검게 빛나는 끝은 쇠를 긁어도 무뎌지지 않는다.' },
  corrupt_crystal:{ name: '오염 결정',      rarity: 'rare', value: 55, desc: '오염된 땅에서만 맺히는 검붉은 결정. 오래 쥐고 있으면 머릿속이 웅웅거린다.' },
  recipe_scroll:  { name: '바랜 제작서',   rarity: 'rare',     type: 'use', use: { recipe: true }, value: 40, desc: '누군가 남긴 제작법이 적힌 낡은 양피지. 읽으면 아직 모르는 제작법 하나를 알게 된다.' },
  ember_tonic:    { name: '불씨 강장제',   rarity: 'uncommon', type: 'use', use: { hp: 25, en: 40 }, desc: '불도마뱀 꼬리를 꿀에 재운 강장제. 목구멍이 화끈거린다.' },
  hydra_salve:    { name: '히드라 고약',   rarity: 'rare',     type: 'use', use: { hp: 120 }, desc: '잘려도 다시 자라는 히드라의 피를 고약에 섞었다.' },
  storm_charm:    { name: '폭풍 깃 부적',  rarity: 'rare',     type: 'equip', slot: 'charm', bonus: { wing: 2, wisdom: 1 }, desc: '그리핀 깃에 룬을 새겼다. 쥐면 바람이 따라 분다.' },
  troll_gorget:   { name: '트롤 엄니 목가리개', rarity: 'rare', type: 'equip', slot: 'neck', bonus: { scale: 3 }, desc: '트롤 엄니를 늪철로 엮었다. 투박하지만 무엇이든 막아 낸다.' },
  moon_circlet:   { name: '달빛 머리장식', rarity: 'rare',     type: 'equip', slot: 'head', bonus: { majesty: 2, wisdom: 2 }, desc: '은빛 토끼풀과 심해 진주를 비단으로 묶었다. 달빛 아래에서 은은하게 빛난다.' },
  star_crown:     { name: '별조각 관',     rarity: 'rare',     type: 'equip', slot: 'head', bonus: { wisdom: 3, majesty: 1 }, desc: '유성우의 밤에 주운 별조각을 금으로 박았다.' },
  blackened_scale:{ name: '검게 물든 비늘', rarity: 'rare', value: 45, desc: '오염된 땅의 짐승에게서만 벗겨지는 비늘. 차갑고, 쇠보다 단단하다.' },
  frenzy_draught: { name: '광기의 묘약',   rarity: 'uncommon', type: 'use', use: { buff: 'frenzy', mindCost: 15 }, desc: '오염 결정을 녹인 검붉은 물약. 마시면 힘이 끓어오르지만 머릿속이 웅웅거린다. (마실 때 정신 −15)' },
  purify_incense: { name: '정화의 향',     rarity: 'rare',     type: 'use', use: { mind: 60 }, desc: '오염 결정을 꿀과 이끼로 감싸 태우면, 검은 기운이 하얀 연기로 바뀐다.' },
  abyss_pendant:  { name: '심연의 펜던트', rarity: 'rare',     type: 'equip', slot: 'neck', bonus: { wisdom: 2, majesty: 1 }, mindWard: 0.7, desc: '오염을 오염으로 막는다. 깎이는 정신 −30%.' },
  blackscale_guard:{ name: '검은 비늘 꼬리갑', rarity: 'rare',  type: 'equip', slot: 'tail', bonus: { scale: 3, claw: 1 }, desc: '검게 물든 비늘을 겹겹이 엮었다.' },
  abyss_crown:    { name: '심연의 왕관',   rarity: 'rare',     type: 'equip', slot: 'head', bonus: { claw: 3, wisdom: 3, majesty: 2 }, mindWard: 1.15, value: 220, desc: '오염된 강적의 머리에서 굴러떨어진 검은 왕관. 엄청난 힘이 깃들었지만 속삭임이 그치지 않는다. (깎이는 정신 +15%)' },


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
  // 고레벨 구역 (Lv13~24) 전리품
  knight_crest:   { name: '기사단 문장',       rarity: 'rare', cat: 'trophy', value: 60, desc: '용사냥 기사단이 가슴에 달던 은빛 문장. 발톱 자국이 깊게 남아 있다.' },
  shadow_spore:   { name: '그늘 포자',         rarity: 'rare', cat: 'trophy', value: 65, desc: '빛을 받으면 스르르 녹아 버리는 검푸른 포자. 숨을 막고 감각을 흐린다.' },
  basilisk_eye:   { name: '바실리스크의 눈',   rarity: 'rare', cat: 'trophy', value: 70, desc: '아직도 노려보는 듯한 누런 눈알. 오래 들여다보면 손끝이 굳는다.' },
  frost_heart:    { name: '서리 거인의 심장',  rarity: 'rare', cat: 'trophy', value: 75, desc: '쥐면 손이 얼어붙을 듯 차가운 푸른 덩어리. 아직 희미하게 뛴다.' },
  sphinx_mane:    { name: '스핑크스의 갈기',   rarity: 'rare', cat: 'trophy', value: 80, desc: '햇빛을 머금어 금실처럼 빛나는 갈기. 만지면 따뜻하다.' },
  crown_shard:    { name: '부서진 왕관 조각',  rarity: 'rare', cat: 'trophy', value: 85, desc: '이름 잃은 왕의 왕관에서 떨어져 나온 조각. 보석 속에 검은 빛이 갇혀 있다.' },
  elder_ember:    { name: '고룡의 불씨',       rarity: 'rare', cat: 'trophy', value: 95, desc: '꺼지지 않는 붉은 불씨. 쥐고 있으면 먼 옛날 드래곤의 포효가 들리는 듯하다.' },

  // ── 만든 물건: 회복약 (use: 사용 효과) ──
  honey_salve:  { name: '꿀 고약',          rarity: 'common',   type: 'use', use: { hp: 30 },  desc: '상처에 바르면 금세 아문다.' },
  moss_salve:   { name: '이끼 고약',        rarity: 'uncommon', type: 'use', use: { hp: 70 },  desc: '빛나는 이끼가 상처를 차갑게 덮는다.' },
  ember_tea:    { name: '불씨 차',          rarity: 'common',   type: 'use', use: { en: 25 },  desc: '마시면 속이 뜨거워지고 기운이 돈다.' },
  // ── 잘 안 쓰이던 재료로 만드는 회복약 (기력·체력) ──
  mist_tea:     { name: '숲안개 꽃차',      rarity: 'common',   type: 'use', use: { en: 30, mind: 5 },  desc: '이끼꽃을 우린 푸르스름한 차. 안개 낀 숲 냄새가 나고, 마음이 가라앉는다.' },
  snow_tea:     { name: '눈꽃 얼음차',      rarity: 'common',   type: 'use', use: { en: 30, hp: 10 },   desc: '녹지 않는 눈꽃을 얼음 결정과 함께 띄웠다. 이가 시릴 만큼 차고 정신이 번쩍 든다.' },
  bindweed_drink: { name: '갯메꽃 꿀물',    rarity: 'common',   type: 'use', use: { en: 25 },           desc: '바닷가 갯메꽃을 꿀물에 띄웠다. 짭조름하고 달다.' },
  ash_cookie:   { name: '잿불 과자',        rarity: 'common',   type: 'use', use: { en: 35 },           desc: '잿빛 먼지에 불도마뱀 꼬리의 열을 입혀 구웠다. 씹을수록 속이 뜨거워진다. 멸망한 대륙에서 버티는 이들의 간식.' },
  heartwood_sap:{ name: '고목 수액',        rarity: 'uncommon', type: 'use', use: { en: 50, hp: 30 },   desc: '천 년 고목의 심재에서 짜낸 수액. 빛나는 이끼로 맑혀 마시면 오래 버틸 힘이 난다.' },
  star_honey:   { name: '별빛 꿀',          rarity: 'rare',     type: 'use', use: { en: 70, mind: 10 }, desc: '별조각을 꿀에 재워 두었더니 꿀이 희미하게 빛나기 시작했다.' },
  flower_poultice:{ name: '들꽃 찜질',      rarity: 'common',   type: 'use', use: { hp: 25 },           desc: '들꽃을 찧어 따뜻하게 덮는 찜질. 쓰라린 데가 금세 가라앉는다.' },
  bitter_brew:  { name: '쓴 약초 탕',       rarity: 'common',   type: 'use', use: { hp: 40 },           desc: '독초를 오래 달여 독기를 뺐다. 지독하게 쓰지만 상처에는 잘 듣는다.' },
  pearl_salve:  { name: '진주 가루 고약',   rarity: 'uncommon', type: 'use', use: { hp: 90 },           desc: '늪 진주를 곱게 갈아 빛나는 이끼에 갰다. 바르면 상처 자리가 은은하게 빛난다.' },
  glacier_pack: { name: '만년설 찜질',      rarity: 'uncommon', type: 'use', use: { hp: 80, en: 20 },   desc: '녹지 않는 얼음을 감싸 올려 두는 찜질. 열이 내리고 몸이 가벼워진다.' },
  clover_tonic: { name: '은빛 토끼풀 진액', rarity: 'rare',     type: 'use', use: { hp: 100, mind: 10 }, desc: '은빛 토끼풀 네 잎을 꿀에 녹였다. 마시면 몸과 마음이 함께 개운해진다.' },
  sun_breath:   { name: '태양의 숨결',      rarity: 'rare',     type: 'use', use: { ap: 4 },   desc: '한 모금 들이켜면 날개에 힘이 솟는다.' },
  calm_incense: { name: '진정의 향',        rarity: 'uncommon', type: 'use', use: { mind: 40 }, desc: '빛나는 이끼와 꿀을 태운 연기가 흐려진 정신을 맑게 한다.' },
  ash_incense:  { name: '잿빛 향',          rarity: 'common',   type: 'use', use: { mind: 20 }, desc: '멸망한 대륙의 잿빛 먼지를 빛나는 이끼와 함께 태운 향. 매캐하지만 흐려진 정신이 조금 돌아온다.' },

  hunter_stew:  { name: '사냥꾼의 스튜',    rarity: 'common',   type: 'use', use: { hp: 45, en: 15 }, desc: '불도마뱀 꼬리를 푹 고아 낸 뜨끈한 스튜다.' },
  hydra_tonic:  { name: '히드라 강장제',    rarity: 'rare',     type: 'use', use: { hp: 150 }, desc: '한 모금이면 찢긴 비늘 아래로 새살이 돋는다.' },
  ember_elixir: { name: '불씨 영약',        rarity: 'rare',     type: 'use', use: { en: 60, ap: 2 }, desc: '거인의 불씨를 녹인 영약. 몸속에서 불이 타오른다.' },

  // ── 낚시 (해안 절벽에서만. 행동력 대신 미끼를 씀) ──
  bait_worm:     { name: '지렁이 미끼',   rarity: 'common',   cat: 'bait', value: 3,  desc: '해안 어촌에서 파는 통통한 지렁이. 낚시 한 번에 하나씩 쓴다.' },
  bait_shrimp:   { name: '작은 새우 미끼', rarity: 'common',   cat: 'bait', value: 3,  desc: '갯바위 틈에서 건진 작은 새우. 낚시 한 번에 하나씩 쓴다.' },
  bait_meat:     { name: '고깃덩이 미끼', rarity: 'common',   cat: 'bait', value: 5,  desc: '사냥감 가죽에 붙은 고기를 뭉친 미끼. 냄새가 진해서 큰 물고기가 잘 문다.' },
  bait_lure:     { name: '반짝이는 루어', rarity: 'uncommon', cat: 'bait', value: 12, desc: '놋쇠 단추와 조개껍데기로 만든 가짜 물고기. 귀한 물고기가 잘 속는다.' },
  salt_crystal:  { name: '소금 결정',     rarity: 'common',   value: 2,  desc: '바닷물이 마른 바위에서 긁어 모은 굵은 소금. 생선을 절일 때 쓴다.' },
  fish_mackerel: { name: '고등어',        rarity: 'common',   cat: 'fish', value: 4,  desc: '등이 푸른 흔한 생선. 셋을 소금에 절이면 절인 생선이 된다.' },
  fish_flounder: { name: '가자미',        rarity: 'common',   cat: 'fish', value: 6,  desc: '모래에 납작 엎드려 있던 생선. 아이들이 생김새를 보고 깔깔 웃는다.' },
  fish_salmon:   { name: '은비늘 연어',   rarity: 'uncommon', cat: 'fish', value: 14, desc: '비늘이 은처럼 빛나는 연어. 비 오는 날 잘 문다.' },
  fish_eel:      { name: '번개 장어',     rarity: 'uncommon', cat: 'fish', value: 18, desc: '건드리면 찌릿한 장어. 뇌우가 치는 날에만 물가로 올라온다.' },
  fish_marlin:   { name: '푸른 청새치',   rarity: 'rare',     cat: 'fish', value: 45, desc: '창처럼 긴 주둥이를 가진 큰 물고기. 어부들이 평생 한 번 볼까 말까 하다.' },
  sea_scale:     { name: '바다 용의 비늘', rarity: 'rare',     cat: 'fish', value: 70, desc: '낚싯줄에 걸려 올라온 커다란 비늘. 깊은 바다에 무언가가 산다.' },
  salmon_grill:  { name: '연어 구이',     rarity: 'uncommon', cat: 'meal', value: 16, desc: '소금을 뿌려 구운 은비늘 연어. 한 입만 먹어도 든든하다. (파수꾼 쪽)' },
  // ── 만든 물건: 식구 요리 (cat: meal. 인간 식구에게 건네면 배가 부르고 유대가 오름. 둥지 식구 칸에서 건넴) ──
  // 새끼 드래곤 먹이 (cat: meal)
  roast_meat:     { name: '화덕 구운 고기', rarity: 'common', cat: 'meal', value: 9,  desc: '붉은 점토 화덕에 겉만 바삭하게 구운 고기. 새끼 드래곤이 가장 반긴다.' },
  ember_snack:    { name: '불씨 간식',      rarity: 'common', cat: 'meal', value: 8,  desc: '화산재를 묻혀 그을린 고기 조각. 씹으면 작은 불똥이 튄다.' },
  fish_skewer:    { name: '생선 꼬치',      rarity: 'common', cat: 'meal', value: 8,  desc: '소금을 뿌린 고등어를 통째로 꿴 꼬치. 새끼가 꼬리째 삼킨다.' },
  dragon_feast:   { name: '새끼 용의 잔칫상', rarity: 'uncommon', cat: 'meal', value: 22, desc: '고기와 연어와 꿀을 한가득 쌓은 상. 새끼 드래곤의 배가 빵빵해진다.' },
  honey_cake:     { name: '꿀떡',     rarity: 'common',   cat: 'meal', value: 6,  desc: '야생 꿀을 바른 쫀득한 떡. 아이들이 가장 반긴다. (약초꾼 쪽)' },
  moss_soup:      { name: '이끼 수프', rarity: 'common',   cat: 'meal', value: 5,  desc: '빛나는 이끼를 넣어 은은하게 빛나는 수프. 먹으면 속이 따뜻해진다. (약초꾼 쪽)' },
  fish_porridge:  { name: '생선 죽',   rarity: 'common',   cat: 'meal', value: 7,  desc: '절인 생선을 곱게 풀어 끓인 죽. 든든해서 오래 배부르다. (파수꾼 쪽)' },
  hearth_bread:   { name: '화덕빵',    rarity: 'common',   cat: 'meal', value: 6,  desc: '붉은 점토로 빚은 작은 화덕에 구운 빵. 화덕은 아이가 가지고 논다. (대장장이 쪽)' },
  feast_plate:    { name: '잔칫상',    rarity: 'uncommon', cat: 'meal', value: 16, desc: '꿀과 생선과 곡식을 한 상 가득 차린 잔치 음식. 배가 가득 차고, 유대가 크게 오른다.' },
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
  // 고레벨 구역 재료로 만드는 장신구
  crest_charm:    { name: '기사단 문장 부적',   rarity: 'rare', type: 'equip', slot: 'charm', bonus: { claw: 2, majesty: 2 }, desc: '쓰러뜨린 기사단의 문장을 녹여 만든 부적. 인간들이 보면 움찔한다.' },
  spore_mantle:   { name: '그늘 포자 날개덮개', rarity: 'rare', type: 'equip', slot: 'wing',  bonus: { wing: 3, wisdom: 1 }, desc: '포자를 먹인 거미줄로 짠 덮개. 날갯짓할 때마다 검푸른 가루가 흩날린다.' },
  basilisk_pendant:{ name: '바실리스크 눈 목걸이', rarity: 'rare', type: 'equip', slot: 'neck', bonus: { wisdom: 2, scale: 2 }, desc: '굳은 눈알을 늪 진주로 감싼 목걸이. 노려보는 눈길을 대신 받아 준다.' },
  glacier_tailguard:{ name: '빙하 비늘 꼬리갑', rarity: 'rare', type: 'equip', slot: 'tail', bonus: { scale: 4 }, desc: '서리 거인의 심장으로 얼린 꼬리갑. 어떤 불에도 쉽게 녹지 않는다.' },
  sphinx_claw:    { name: '스핑크스 발톱덮개',  rarity: 'rare', type: 'equip', slot: 'claw',  bonus: { claw: 4, wing: 1 }, desc: '금빛 갈기를 꼬아 묶은 발톱덮개. 햇빛 아래서 칼날처럼 번뜩인다.' },
  kings_crown:    { name: '잊힌 왕의 관',       rarity: 'rare', type: 'equip', slot: 'head',  bonus: { majesty: 3, wisdom: 2 }, desc: '부서진 조각을 다시 맞춘 왕관. 쓰면 잊힌 왕국의 목소리가 들린다.' },
  elder_heart:    { name: '고룡의 심장 부적',   rarity: 'rare', type: 'equip', slot: 'charm', bonus: { claw: 2, scale: 2, wing: 1, majesty: 1 }, desc: '고룡의 불씨를 용암 심장에 담은 부적. 지닌 드래곤의 숨결이 한층 뜨거워진다.' },
  silk_wingband:{ name: '거미줄 날개띠',    rarity: 'common',   type: 'equip', slot: 'wing',  bonus: { wing: 1 },               desc: '날개 뼈를 따라 질긴 실을 감았다.' },
  wolf_cloak:   { name: '늑대 털 날개덮개', rarity: 'uncommon', type: 'equip', slot: 'wing',  bonus: { wing: 1, scale: 1 },     desc: '추운 하늘에서도 날개가 굳지 않는다.' },
  wyvern_guard: { name: '와이번 날개막 덮개', rarity: 'rare',   type: 'equip', slot: 'wing',  bonus: { wing: 3, scale: 1 },     desc: '오로라 빛이 도는 막이 바람을 붙잡는다.' },
  // ── 잘 안 쓰이던 강적 전리품으로 만드는 장신구 ──
  stinger_tail:   { name: '전갈 독침 꼬리날',   rarity: 'uncommon', type: 'equip', slot: 'tail',  bonus: { claw: 2 },               desc: '황금 꼬리 전갈의 독침을 꼬리 끝에 엮었다. 휘두르면 쉭 소리가 난다.' },
  toad_charmbag:  { name: '두꺼비 독샘 목걸이', rarity: 'uncommon', type: 'equip', slot: 'neck',  bonus: { scale: 1, wisdom: 1 },   desc: '말린 독샘을 가죽 주머니에 담았다. 냄새가 고약해 작은 벌레들이 다가오지 못한다.' },
  cursed_helm:    { name: '저주받은 강철 투구', rarity: 'rare',     type: 'equip', slot: 'head',  bonus: { scale: 2, majesty: 2 },  desc: '이름 잃은 왕의 기사가 쓰던 강철을 두들겨 폈다. 쓰면 어딘가에서 갑옷 부딪는 소리가 들린다.' },
  aurora_wing:    { name: '오로라 날개막',      rarity: 'rare',     type: 'equip', slot: 'wing',  bonus: { wing: 2, wisdom: 2 },    desc: '와이번 날개막에 서리 이끼를 먹였다. 날개를 펴면 희미한 오로라가 일렁인다.' },
  crest_gorget:   { name: '기사단 문장 목가리개', rarity: 'rare',   type: 'equip', slot: 'neck',  bonus: { scale: 3, majesty: 1 },  desc: '은빛 투구 기사단의 문장을 목가리개 한가운데 박았다. 등을 꼿꼿이 펴게 된다.' },
  basilisk_crown: { name: '바실리스크 눈 관',   rarity: 'rare',     type: 'equip', slot: 'head',  bonus: { wisdom: 3, majesty: 2 }, desc: '눈먼 여왕의 눈을 관 한가운데 박았다. 마주 보는 짐승이 잠깐 몸을 굳힌다.' },
  giant_wing:     { name: '서리 거인의 날개덮개', rarity: 'rare',   type: 'equip', slot: 'wing',  bonus: { wing: 4, scale: 2 },     desc: '서리 거인의 심장이 내뿜는 냉기를 날개막에 가두었다. 아무리 높이 올라도 날개가 굳지 않는다.' },
  sphinx_torque:  { name: '스핑크스 갈기 목걸이', rarity: 'rare',   type: 'equip', slot: 'neck',  bonus: { wisdom: 3, majesty: 3 }, desc: '수수께끼를 잊은 왕의 갈기를 태양석과 함께 땋았다. 걸면 오래된 물음들이 떠오른다.' },
  crown_tailring: { name: '왕관 조각 꼬리고리', rarity: 'rare',     type: 'equip', slot: 'tail',  bonus: { majesty: 3, scale: 3 },  desc: '부서진 왕관 조각을 꼬리고리로 다시 이었다. 꼬리를 끌 때마다 왕의 발소리가 난다.' },
  elder_wing:     { name: '고룡의 불꽃 날개',   rarity: 'rare',     type: 'equip', slot: 'wing',  bonus: { wing: 4, claw: 2 },      desc: '고룡의 불씨를 날개 뼈마다 심었다. 날갯짓에 불티가 흩날린다.' },
  horn_tailring:{ name: '들소 뿔 꼬리고리', rarity: 'common',   type: 'equip', slot: 'tail',  bonus: { claw: 1 },               desc: '꼬리를 휘두를 때마다 묵직하게 울린다.' },
  croc_tailguard:{ name: '악어 비늘 꼬리갑', rarity: 'uncommon', type: 'equip', slot: 'tail', bonus: { scale: 2 },              desc: '꼬리 끝까지 비늘 갑옷을 덧댔다.' },
  sea_tailguard:{ name: '해룡 비늘 꼬리갑', rarity: 'rare',     type: 'equip', slot: 'tail', bonus: { scale: 3, wing: 2 },      desc: '낚싯줄에 걸려 올라온 바다 용의 비늘을 이어 붙였다. 물결처럼 푸르게 일렁인다.' },
  seal_ring:    { name: '옛 가문의 인장 반지', rarity: 'rare',  type: 'equip', slot: 'charm', bonus: { majesty: 3, wisdom: 1 },  desc: '잃어버린 인장을 금으로 다시 감싸 반지로 만들었다. 인간들이 보면 저도 모르게 고개를 숙인다.' },
  rival_charm:  { name: '라이벌의 비늘 부적', rarity: 'uncommon', type: 'equip', slot: 'charm', bonus: { claw: 2, majesty: 1 }, desc: '라이벌이 떨어뜨리고 간 비늘을 룬 돌에 박았다. 볼 때마다 발톱에 힘이 들어간다.' },
  bark_tailwrap:{ name: '고목 껍질 꼬리감개', rarity: 'uncommon', type: 'equip', slot: 'tail', bonus: { scale: 1, wisdom: 1 },  desc: '살아 있는 껍질이 꼬리를 감싸 상처를 보듬는다.' },
  magma_tail:   { name: '용암 심장 꼬리날', rarity: 'rare',     type: 'equip', slot: 'tail',  bonus: { claw: 2, majesty: 1 },   desc: '꼬리 끝에서 용암이 끓는다.' },

  // 대륙의 재앙을 쓰러뜨리면 나오는 것
  // 이벤트에서 얻는 물건
  star_shard:   { name: '별조각',           rarity: 'rare',     value: 45, desc: '유성우가 내린 밤, 땅에 박힌 채 아직도 희미하게 빛난다.' },
  elder_keepsake:{ name: '고향의 조약돌',  rarity: 'common',   value: 2,  type: 'use', use: { keep: 'home_pebble' }, desc: '늙은 식구가 마지막으로 고향에 다녀오며 주워 온 조약돌. 손때가 묻어 반들반들하다. 둥지의 보물 상자에 넣어 간직할 수 있다.' },
  kin_letter:   { name: '먼 둥지의 편지',   rarity: 'common',   value: 2,  type: 'use', use: { keep: 'far_letter' }, desc: '입양 보낸 식구가 보내온 안부. 값어치는 없지만 버릴 수가 없다. 둥지의 보물 상자에 넣어 간직할 수 있다.' },
  // 들꽃: 지역마다 피는 꽃이 다름. 화관·꽃다발의 재료
  wild_flower:  { name: '들꽃',           rarity: 'common',   value: 2,  desc: '바람 부는 평원에 흐드러지게 핀 작은 꽃. 엮으면 화관이 된다.' },
  moss_flower:  { name: '이끼꽃',         rarity: 'uncommon', value: 4,  desc: '안개 낀 숲 그늘의 이끼 사이에서만 피는 푸르스름한 꽃.' },
  sea_bindweed: { name: '갯메꽃',         rarity: 'common',   value: 2,  desc: '해안 절벽 모래땅을 기어가며 피는 분홍 꽃. 짠 바람에도 시들지 않는다.' },
  snow_flower:  { name: '눈꽃',           rarity: 'uncommon', value: 4,  desc: '설원의 눈 속에서 피어나는 하얀 꽃. 손에 쥐어도 녹지 않는다.' },
  // 선물용: 꽃다발은 쓰면 정신 회복, 또는 보물 상자에 넣어 간직 (받은 것이면 보낸 이와 쪽지도 함께). 화관은 쓰면 정신 조금 + 하루 동안 이름 옆에 꽃
  flower_crown: { name: '들꽃 화관',      rarity: 'common',   value: 8,  type: 'use', use: { crown: 1440, mind: 5 }, desc: '들꽃을 엮어 만든 화관. 머리에 얹으면 꽃향기에 정신이 조금 맑아지고(+5), 하루 동안 이름 옆에 작은 꽃이 핀다. 누군가에게 선물해도 좋다.' },
  shell_chime:  { name: '조개 풍경',      rarity: 'common',   type: 'use', use: { keep: 'shell_chime' }, desc: '조개껍데기를 꿰어 단 풍경. 보물 상자에 간직하거나 누군가에게 선물할 수 있다.' },
  amber_star:   { name: '호박 별 장식',   rarity: 'uncommon', type: 'use', use: { keep: 'amber_star' },  desc: '호박을 별 모양으로 깎아 금실로 감쌌다. 보물 상자에 간직하거나 누군가에게 선물할 수 있다.' },
  music_box:    { name: '은사슬 오르골',  rarity: 'rare',     type: 'use', use: { keep: 'music_box' },   desc: '은사슬 태엽의 작은 오르골. 보물 상자에 간직하거나 누군가에게 선물할 수 있다.' },
  bouquet_wild: { name: '들꽃 꽃다발',    rarity: 'common',   value: 8,  type: 'use', use: { keep: 'bouquet_wild', mind: 10 }, desc: '평원의 들꽃과 해안의 갯메꽃을 묶은 꽃다발. 향을 맡으면 정신이 맑아진다(+10). 선물로 보내거나, 둥지의 보물 상자에 넣어 간직할 수도 있다.' },
  festival_garland: { name: '축제 꽃장식', rarity: 'uncommon', value: 10, type: 'use', use: { keep: 'festival_garland' }, desc: '왕도 축제에서 처음 춤을 춘 드래곤에게 마을 사람들이 걸어 준 꽃장식. 리본 끝에 작은 방울이 달려 있다. 둥지의 보물 상자에 넣어 간직할 수 있다.' },
  // ── 왕도 야시장 (축제 날 밤에만, nightmarket.js) ──
  nm_skewer:    { name: '숯불 꼬치',        rarity: 'common',   value: 5,  type: 'use', use: { hp: 40, en: 15 }, desc: '야시장 숯불 위에서 기름이 지글지글 떨어지던 고기 꼬치. 한입 베어 물면 뜨거운 육즙이 터진다.' },
  nm_candy_apple:{ name: '설탕 사과',       rarity: 'common',   value: 5,  type: 'use', use: { en: 30, mind: 8 }, desc: '녹인 설탕을 유리처럼 입힌 붉은 사과. 깨물면 바삭 소리가 나고, 단맛에 마음이 풀린다.' },
  nm_sparkler:  { name: '국화 불꽃 막대',   rarity: 'common',   value: 6,  type: 'use', use: { mind: 20 }, desc: '불을 붙이면 끝에서 국화 모양 불꽃이 타닥타닥 핀다. 다 탈 때까지 바라보고 있으면 머릿속이 고요해진다.' },
  nm_star_candy:{ name: '별사탕 봉지',      rarity: 'common',   value: 5,  type: 'use', use: { en: 10, mind: 12 }, desc: '알록달록한 별사탕을 종이 봉지에 담았다. 하나씩 굴려 먹다 보면 어느새 봉지가 빈다.' },
  nm_corn:      { name: '버터 구운 옥수수', rarity: 'common',   value: 5,  type: 'use', use: { hp: 25, en: 25 }, desc: '숯불에 굴려 구운 옥수수에 버터를 듬뿍 발랐다. 알갱이마다 고소한 김이 오른다.' },
  nm_noodle:    { name: '장터 국수',        rarity: 'common',   value: 7,  type: 'use', use: { hp: 60, en: 20 }, desc: '멸치 국물에 고명을 얹은 뜨끈한 국수. 한 그릇 비우고 나면 축제 구경을 한 바퀴 더 돌 힘이 난다.' },
  nm_hotteok:   { name: '꿀호떡',           rarity: 'common',   value: 5,  type: 'use', use: { en: 25, mind: 6 }, desc: '기름에 지글지글 부친 호떡. 베어 물면 뜨거운 꿀이 흘러나오니 조심해야 한다.' },
  nm_chestnut:  { name: '군밤 봉지',        rarity: 'common',   value: 4,  type: 'use', use: { hp: 15, en: 20 }, desc: '껍질이 탁탁 갈라진 군밤을 종이 봉지에 담았다. 손을 녹이며 하나씩 까 먹는 맛이 있다.' },
  nm_sikhye:    { name: '축제 단술',        rarity: 'common',   value: 5,  type: 'use', use: { en: 35, mind: 4 }, desc: '밥알이 동동 뜬 달큰한 단술. 축제 밤 목을 축이기에 딱 좋다.' },
  nm_ember_candy:{ name: '불씨 사탕',       rarity: 'uncommon', value: 15, type: 'use', use: { ap: 2 }, desc: '떠돌이 약장수가 불의 결정 가루를 녹여 굳혔다는 붉은 사탕. 입에 넣으면 혀끝이 화끈하고 날개가 들썩인다.' },
  nm_lantern:   { name: '종이 등불',        rarity: 'uncommon', value: 8,  type: 'use', use: { keep: 'nm_lantern' }, desc: '야시장 등불장이가 한 장씩 붙여 만든 종이 등불. 안에 불을 넣으면 벚꽃 무늬가 벽에 비친다. 둥지의 보물 상자에 넣어 간직할 수 있다.' },
  nm_mask:      { name: '축제 가면',        rarity: 'uncommon', value: 12, type: 'use', use: { keep: 'nm_mask' }, desc: '여우인지 용인지 모를 얼굴을 칠한 나무 가면. 축제 밤에는 누구나 이것을 쓰고 서로 모르는 척한다. 둥지의 보물 상자에 넣어 간직할 수 있다.' },
  bouquet_four: { name: '네 고장 꽃다발', rarity: 'uncommon', value: 20, type: 'use', use: { keep: 'bouquet_four', mind: 25 }, desc: '평원·숲·해안·설원의 꽃을 하나씩 모아 묶은 꽃다발. 대륙을 한 바퀴 돈 정성이 담겼다. 향을 맡으면 정신이 맑아진다(+25). 선물로 보내거나 보물 상자에 넣어 간직할 수도 있다.' },
  whisper_ring: { name: '속삭이는 반지',   rarity: 'rare',     type: 'equip', slot: 'charm', bonus: { majesty: 3 }, mindWard: 1.3, value: 60, desc: '보물더미 깊은 곳에서 나온 반지. 끼면 위엄이 차오르지만, 밤마다 속삭임이 정신을 갉아먹는다. (깎이는 정신 +30%)' },
  calamity_core:{ name: '재앙의 핵',        rarity: 'rare',     cat: 'trophy', value: 120, desc: '쓰러진 재앙의 가슴에서 꺼낸, 아직 고동치는 검붉은 핵. 대륙에 몇 개 없는 물건이다.' },
  calamity_charm:{ name: '재앙을 이긴 증표', rarity: 'rare',    type: 'equip', slot: 'charm', bonus: { claw: 2, scale: 2, wing: 1, wisdom: 1, majesty: 2 }, desc: '재앙의 핵을 고대의 유물에 박아 넣었다. 지닌 드래곤의 이름이 대륙에 울린다.' },

  // ── 둥지에 설치하는 것: 쓰면 둥지에 놓임 (보물 도둑을 막음) ──
  thorn_trap:   { name: '가시 덫',          rarity: 'common',   type: 'use', use: { nestWard: 'trap' },  desc: '둥지 입구에 숨겨 두는 덫. 도둑이 들면 가져가는 양이 절반으로 줄고, 다친 채로 달아난다. 보물을 물어 가는 까마귀도 붙잡는다. 한 번 쓰면 망가진다.' },
  ward_stone:   { name: '수호 결계석',      rarity: 'rare',     type: 'use', use: { nestWard: 'stone' }, desc: '룬을 새긴 결계석. 도둑을 한 번 통째로 쫓아내고 부서진다. 덫이 없으면 보물을 물어 가는 까마귀도 쫓아낸다.' },

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
  keepsake_sword: { name: '용기사의 검',     rarity: 'rare',     value: 180, desc: '드래곤과 함께 하늘을 누빈 기사의 검이다.' },  // 모브 드래곤 이야기 퀘스트를 끝까지 하면 받는 장신구 (game-mobs.js)
  barg_horn:      { name: '부러진 뿔 부적',   rarity: 'rare', type: 'equip', slot: 'charm', bonus: { claw: 2, majesty: 1 }, value: 150, desc: '늙은 레드 드래곤 바르그가 건넨 뿔 조각. 아직 전장의 열기가 남아 있다.' },
  harsia_mantle:  { name: '서리 비늘 망토',   rarity: 'rare', type: 'equip', slot: 'wing',  bonus: { wing: 2, scale: 1 }, value: 150, desc: '하르시아가 자기 비늘로 엮은 망토. 눈보라 속에서도 날개가 얼지 않는다.' },
  ordin_circlet:  { name: '비문의 관',        rarity: 'rare', type: 'equip', slot: 'head',  bonus: { wisdom: 3 }, value: 150, desc: '오르딘이 완성된 비문의 룬을 새겨 넣은 관. 쓰고 있으면 오래된 글자가 저절로 읽힌다.' },
  morgana_seed:   { name: '고목 씨앗 목걸이', rarity: 'rare', type: 'equip', slot: 'neck',  bonus: { scale: 2, wisdom: 1 }, value: 150, desc: '되살아난 고목의 씨앗을 꿴 목걸이. 은은한 숲 냄새가 난다.' },
  skrag_claw:     { name: '늪 그림자 발톱',   rarity: 'rare', type: 'equip', slot: 'claw',  bonus: { claw: 3 }, value: 150, desc: '스크라그가 오래 쓰던 검은 발톱덮개. 늪의 진흙 냄새가 배어 있다.' },
  aurel_ring:     { name: '금빛 꼬리고리',    rarity: 'rare', type: 'equip', slot: 'tail',  bonus: { majesty: 2, scale: 1 }, value: 150, desc: '아우렐이 아끼던 금고리. 꼬리를 흔들 때마다 맑은 소리가 난다.' },
  ignar_heart:    { name: '꺼지지 않는 불씨', rarity: 'rare', type: 'equip', slot: 'charm', bonus: { claw: 1, scale: 1, wing: 1 }, value: 150, desc: '이그나르가 사흘 밤낮 두드려 만든 부적. 손에 쥐면 늘 따뜻하다.' },
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
  frenzy: { name: '광기',   desc: '공격 +25%, 받는 피해 +10%', atk: 1.25, taken: 1.1 },
  iron:  { name: '단단함', desc: '받는 피해 −15%',     taken: 0.85 },
  swift: { name: '날렵함', desc: '날개(속도) +4',      spd: 4 },
  focus: { name: '집중',   desc: '숨결·치유 +20%',     mag: 1.2 },
  lucky: { name: '행운',   desc: '사냥 전리품 확률 +25%', drop: 0.25 },
  festive: { name: '축제의 흥', desc: '공격 +10%, 받는 피해 −10%, 전리품 확률 +10%', atk: 1.1, taken: 0.9, drop: 0.1 }, // 왕도 축제에서 춤추면
};

// ── 왕도 축제: 주말(한국 시각 토·일)마다 왕도에서. 같은 지역에 있는 드래곤과 춤을 출 수 있음 (social.js) ──
// 한 축제에서 같은 드래곤과는 한 번만. 춤추면 둘 다 '축제의 흥', 처음 춤추면 마을 사람들이 꽃장식을 줌 (보물 상자에 간직 가능)
const FESTIVAL = {
  region: 'capital',
  days: [6, 0],            // 토요일, 일요일 (한국 시각)
  buffMinutes: 120,        // '축제의 흥'이 이어지는 시간
  rep: 3,                  // 춤출 때마다 오르는 왕도 평판
  inviteSeconds: 30,       // 춤 신청을 기다리는 시간
  gift: 'festival_garland',// 처음 춤춘 뒤 받는 꽃장식
};

// 제작법. needs: 재료와 개수, en: 쓰는 기력, wis: 필요한 지혜
const RECIPES = [
  // 새끼 드래곤 먹이
  { out: 'roast_meat',    needs: { bait_meat: 2, red_clay: 1 },                          en: 3,  wis: 0 },
  // 선물용 꽃 (들꽃은 평원, 이끼꽃은 숲, 갯메꽃은 해안, 눈꽃은 설원에서)
  { out: 'flower_crown', needs: { wild_flower: 3, grass_seed: 1 }, en: 2, wis: 0 },
  { out: 'shell_chime', needs: { sea_shell: 3, spider_silk: 1 }, en: 3, wis: 2 },               // 선물: 보물 상자에 간직
  { out: 'amber_star',  needs: { amber: 1, gold_ore: 1, silk_scrap: 1 }, en: 5, wis: 7 },
  { out: 'music_box',   needs: { silver_chain: 2, deep_pearl: 1, brass_button: 2 }, en: 8, wis: 12 },
  { out: 'bouquet_wild', needs: { wild_flower: 2, sea_bindweed: 1 }, en: 2, wis: 0 },
  { out: 'bouquet_four', needs: { wild_flower: 1, moss_flower: 1, sea_bindweed: 1, snow_flower: 1 }, en: 3, wis: 1 },
  { out: 'ember_snack',   needs: { bait_meat: 1, volcanic_ash: 1 },                      en: 3,  wis: 0 },
  { out: 'fish_skewer',   needs: { fish_mackerel: 2, salt_crystal: 1 },                  en: 3,  wis: 0 },
  { out: 'dragon_feast',  needs: { bait_meat: 2, fish_salmon: 1, wild_honey: 1 },        en: 6,  wis: 0 },
  // 멸망한 대륙의 장비 (지혜 18 이상)
  { out: 'purified_crown', needs: { ashen_core: 2, faded_crest: 4, purify_shard: 20 },  en: 20, wis: 18 },
  { out: 'carnem_claw',    needs: { carnem_steel: 4, ashen_core: 1, sharp_fang: 5 },     en: 20, wis: 18 },
  { out: 'void_cloak',     needs: { void_silk: 4, star_fragment: 2, ashen_core: 1 },     en: 20, wis: 18 },
  { out: 'purified_pendant', needs: { ashen_core: 1, faded_crest: 3, purify_shard: 15 }, en: 20, wis: 18 },
  { out: 'king_tail',      needs: { king_scale: 1, carnem_steel: 3, ashen_core: 1 },     en: 20, wis: 18 },
  { out: 'star_charm',     needs: { star_fragment: 3, purify_shard: 15, faded_crest: 2 }, en: 16, wis: 18 },
  // 레이드 장신구 (이삭지기 모르벤을 처음 쓰러뜨리면 낫 조각을 하나 빚을 만큼 받음)
  { out: 'harvest_sickle',  needs: { morven_shard: 5, purify_shard: 20, ashen_core: 1 }, en: 20, wis: 18 },
  { out: 'harvest_pendant', needs: { morven_shard: 5, purify_shard: 15, faded_crest: 2 }, en: 20, wis: 18 },
  { out: 'knight_tail_shield',  needs: { heiron_crest: 5, purify_shard: 20, carnem_steel: 3 }, en: 20, wis: 18 },
  { out: 'charge_banner_charm', needs: { heiron_crest: 5, purify_shard: 15, faded_crest: 2 }, en: 20, wis: 18 },
  // 낚시
  { out: 'salted_fish',   needs: { fish_mackerel: 3, salt_crystal: 1 },                 en: 4,  wis: 0 },
  { out: 'bait_meat',     needs: { beast_hide: 1 },                                     en: 2,  wis: 0 },
  { out: 'bait_lure',     needs: { brass_button: 1, sea_shell: 1 },                     en: 4,  wis: 0 },
  { out: 'salmon_grill',  needs: { fish_salmon: 1, salt_crystal: 1 },                   en: 4,  wis: 0 },
  // 식구 요리
  { out: 'honey_cake',    needs: { wild_honey: 1, grass_seed: 2 },                     en: 3,  wis: 0 },
  { out: 'moss_soup',     needs: { glow_moss: 1, grass_seed: 1 },                      en: 3,  wis: 0 },
  { out: 'fish_porridge', needs: { salted_fish: 1, grass_seed: 1 },                    en: 3,  wis: 0 },
  { out: 'hearth_bread',  needs: { red_clay: 1, grass_seed: 2 },                       en: 3,  wis: 0 },
  { out: 'feast_plate',   needs: { wild_honey: 1, salted_fish: 1, grass_seed: 3 },      en: 6,  wis: 0 },
  { out: 'honey_salve',   needs: { wild_honey: 1, grass_seed: 2 },                     en: 4,  wis: 0 },
  { out: 'calamity_charm',needs: { calamity_core: 2, ancient_relic: 1 },                en: 16, wis: 13 },
  { out: 'thorn_trap',    needs: { beast_hide: 2, sharp_fang: 2 },                     en: 5,  wis: 0 },
  { out: 'ward_stone',    needs: { rune_stone: 3, old_scroll: 1, sun_stone: 1 },       en: 12, wis: 12 },
  { out: 'ember_tea',     needs: { volcanic_ash: 2, wild_honey: 1 },                   en: 3,  wis: 0 },
  // 잘 안 쓰이던 재료로 만드는 회복약
  { out: 'mist_tea',        needs: { moss_flower: 1, wild_honey: 1 },            en: 3, wis: 3 },
  { out: 'snow_tea',        needs: { snow_flower: 1, ice_shard: 1 },             en: 3, wis: 3 },
  { out: 'bindweed_drink',  needs: { sea_bindweed: 2, wild_honey: 1 },           en: 3, wis: 0 },
  { out: 'ash_cookie',      needs: { ashen_dust: 2, salamander_tail: 1 },        en: 4, wis: 6 },
  { out: 'heartwood_sap',   needs: { heartwood: 1, glow_moss: 1 },               en: 6, wis: 10 },
  { out: 'star_honey',      needs: { star_shard: 1, wild_honey: 2 },             en: 6, wis: 14 },
  { out: 'flower_poultice', needs: { wild_flower: 2, grass_seed: 1 },            en: 3, wis: 0 },
  { out: 'bitter_brew',     needs: { poison_herb: 1, grass_seed: 2 },            en: 4, wis: 4 },
  { out: 'pearl_salve',     needs: { bog_pearl: 1, glow_moss: 1 },               en: 6, wis: 9 },
  { out: 'glacier_pack',    needs: { eternal_ice: 1, grass_seed: 2 },            en: 6, wis: 9 },
  { out: 'clover_tonic',    needs: { silver_clover: 1, wild_honey: 1 },          en: 6, wis: 12 },
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
  // 숨겨진 제작법: 처음엔 안 보임. 재료를 섞어 보는 실험이나 바랜 제작서로 알게 됨
  { out: 'ember_tonic',   needs: { salamander_tail: 1, wild_honey: 1 },               en: 6,  wis: 8,  hidden: true },
  { out: 'hydra_salve',   needs: { hydra_blood: 1, honey_salve: 1 },                  en: 8,  wis: 11, hidden: true },
  { out: 'storm_charm',   needs: { griffin_feather: 1, rune_stone: 2 },               en: 13, wis: 11, hidden: true },
  { out: 'troll_gorget',  needs: { troll_tusk: 2, bog_iron: 1 },                      en: 12, wis: 10, hidden: true },
  { out: 'moon_circlet',  needs: { silver_clover: 1, deep_pearl: 1, silk_scrap: 1 },  en: 14, wis: 12, hidden: true },
  { out: 'star_crown',    needs: { star_shard: 2, gold_ore: 1 },                      en: 15, wis: 13, hidden: true },
  // 실험 재료로 만드는 것 (재료 종류가 셋 이하라 실험에서 그 조합을 맞히면 알게 됨)
  { out: 'forest_stew',     needs: { forest_mushroom: 2, lotus_root: 1, salt_crystal: 1 }, en: 5,  wis: 6,  hidden: true },
  { out: 'owl_charm',       needs: { owl_quill: 2, wind_stone: 1, dry_vine: 1 },          en: 12, wis: 11, hidden: true },
  { out: 'shell_gorget',    needs: { rune_shell: 1, tough_sinew: 2, bog_iron: 1 },        en: 14, wis: 14, hidden: true },
  { out: 'rainbow_circlet', needs: { rainbow_feather: 1, frost_thorn: 2, gold_ore: 1 },   en: 15, wis: 15, hidden: true },
  { out: 'frenzy_draught', needs: { corrupt_crystal: 1, poison_herb: 2 },               en: 6,  wis: 9 },
  { out: 'purify_incense', needs: { corrupt_crystal: 1, glow_moss: 2, wild_honey: 1 },  en: 8,  wis: 10 },
  { out: 'abyss_pendant',  needs: { corrupt_crystal: 2, blackened_scale: 2, silver_chain: 1 }, en: 14, wis: 12 },
  { out: 'blackscale_guard', needs: { blackened_scale: 4, beast_hide: 2 },              en: 12, wis: 10 },
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
  // 잘 안 쓰이던 강적 전리품으로 만드는 장신구
  { out: 'stinger_tail',   needs: { scorpion_stinger: 3, croc_scale: 1 },                        en: 8,  wis: 6 },
  { out: 'toad_charmbag',  needs: { toad_gland: 2, beast_hide: 1 },                              en: 8,  wis: 7 },
  { out: 'cursed_helm',    needs: { cursed_steel: 2, troll_tusk: 1 },                            en: 12, wis: 11 },
  { out: 'aurora_wing',    needs: { wyvern_membrane: 2, frost_lichen: 2, ice_shard: 2 },         en: 12, wis: 12 },
  { out: 'crest_gorget',   needs: { knight_crest: 2, silver_chain: 2, bog_iron: 2 },             en: 13, wis: 13 },
  { out: 'basilisk_crown', needs: { basilisk_eye: 2, gold_ore: 2, deep_pearl: 1 },               en: 14, wis: 16 },
  { out: 'giant_wing',     needs: { frost_heart: 2, wyvern_membrane: 1, spider_silk: 3 },        en: 15, wis: 18 },
  { out: 'sphinx_torque',  needs: { sphinx_mane: 2, sun_stone: 1, silver_chain: 1 },             en: 15, wis: 19 },
  { out: 'crown_tailring', needs: { crown_shard: 2, gold_ore: 2, silver_chain: 1 },              en: 16, wis: 20 },
  { out: 'elder_wing',     needs: { elder_ember: 1, magma_core: 1, obsidian: 2 },                en: 16, wis: 21 },
  { out: 'griffin_crest', needs: { griffin_feather: 2, gold_ore: 1 },                  en: 13, wis: 11 },
  { out: 'magma_tail',    needs: { magma_core: 1, obsidian: 2 },                       en: 14, wis: 12 },
  { out: 'seal_charm',    needs: { seal_core: 1, rune_stone: 2, old_scroll: 1 },       en: 15, wis: 13 },
  { out: 'giant_heart',   needs: { giant_ember: 1, magma_core: 1 },                    en: 18, wis: 14 },
  // 고레벨 구역 (Lv13~24)
  { out: 'crest_charm',       needs: { knight_crest: 2, gold_ore: 2, rune_stone: 2 },        en: 16, wis: 13 },
  { out: 'spore_mantle',      needs: { shadow_spore: 2, spider_silk: 3, living_bark: 1 },    en: 16, wis: 14 },
  { out: 'basilisk_pendant',  needs: { basilisk_eye: 1, bog_pearl: 1, bog_iron: 2 },         en: 17, wis: 15 },
  { out: 'glacier_tailguard', needs: { frost_heart: 1, eternal_ice: 2, troll_tusk: 2 },      en: 18, wis: 16 },
  { out: 'sphinx_claw',       needs: { sphinx_mane: 2, sun_stone: 1, sandworm_tooth: 2 },    en: 19, wis: 17 },
  { out: 'kings_crown',       needs: { crown_shard: 2, ancient_relic: 1, seal_core: 1 },     en: 20, wis: 18 },
  { out: 'elder_heart',       needs: { elder_ember: 1, magma_core: 1, fire_crystal: 2 },     en: 22, wis: 19 },
  // 쓰임새가 없던 재료로 만드는 것
  { out: 'ash_incense',   needs: { ashen_dust: 4, glow_moss: 1 },                       en: 4,  wis: 0 },  // 잿빛 먼지 (멸망한 대륙)
  { out: 'sea_tailguard', needs: { sea_scale: 2, deep_pearl: 1, silver_chain: 1 },      en: 15, wis: 13 }, // 바다 용의 비늘 (낚시)
  { out: 'seal_ring',     needs: { lost_seal: 1, gold_ore: 1, silk_scrap: 1 },          en: 13, wis: 11 }, // 잃어버린 인장 (왕도)
  { out: 'rival_charm',   needs: { rival_scale: 2, rune_stone: 1 },                     en: 10, wis: 9 },  // 라이벌의 비늘 (이벤트)
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
  coast:   ['herbal_ointment', 'salted_fish', 'bait_worm', 'silver_chain', 'sea_compass', 'salt_crystal'],
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
  homeFlightAp: 0,                  // 어디서든 둥지로 곧장 날아갈 때 드는 행동력 (0이면 들지 않음)
  rest: { hp: 4, en: 4, ap: 2 },    // 쉬는 동안 회복이 몇 배 빨라지는지
  restCountMin: 10,                 // 이만큼(분) 이상 쉬고 깨어나야 '둥지에서 쉬기' 횟수로 셈 (특성·칭호·업적)
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

// ── 둥지 시설: 둥지 단계마다 지을 수 있는 칸. 시설마다 식구 한 명에게 일을 맡길 수 있음 ──
// 힘(power) = 1(시설만) + 일하는 식구 (어른 1, 소년·청소년 견습 0.5) × (잘 맞으면 1.5). 부엌은 일하는 식구가 있어야 쓸 수 있음
const FACILITY = {
  slots: [2, 3, 4],                       // 보금자리 · 넓은 동굴 · 용의 성채
  worker: { adult: 1, apprentice: 0.5, fit: 1.5, apprenticeStages: ['소년', '청소년'], adultStages: ['어른', '노년'] },
  list: {
    forge:   { name: '공방',   cost: { gold: 250, items: { bog_iron: 4, red_clay: 4, obsidian: 2 } }, talent: 'smith', traits: ['handy'],
      desc: '둥지에서 만들면 기력이 덜 들고 대성공·강화가 잘 된다.', en: 0.05, great: 0.015, rate: 0.5 },
    herb:    { name: '약초밭', cost: { gold: 120, items: { grass_seed: 6, glow_moss: 3, red_clay: 3 } }, talent: 'herbalist', traits: ['flowers'],
      desc: '하루 한 번 약초와 꿀을 거둔다. 가끔 귀한 약초도.', rolls: 3, pool: ['wild_honey', 'glow_moss', 'grass_seed', 'poison_herb'], rare: 'silver_clover', rareChance: 0.08 },
    kitchen: { name: '부엌',   cost: { gold: 150, items: { red_clay: 6, bog_iron: 2, salt_crystal: 2 } }, talent: null, traits: ['glutton', 'handy', 'gentle'],
      desc: '재료를 건네면 일하는 아이가 바로 요리한다. 아이가 만든 요리는 더 좋다. (보호자의 기력은 들지 않음)',
      uses: { adult: 3, apprentice: 2, glutton: 1 }, extra: { glutton: 0.3, handy: 0.2 }, eat: 0.3, share: { sat: 15, bond: 1 } },
    tower:   { name: '망루',   cost: { gold: 180, items: { beast_hide: 4, bog_iron: 3, obsidian: 1 } }, talent: 'guard', traits: ['brave', 'lookout'],
      desc: '보물 도둑이 덜 든다.', raid: 0.25, raidMax: 0.75 },
    library: { name: '서고',   cost: { gold: 200, items: { silk_scrap: 3, brass_button: 2, glow_moss: 2 } }, talent: null, traits: ['curious', 'steady', 'bookworm'],
      desc: '보호자가 얻는 경험치가 늘고, 식구 이야기(이벤트)가 조금 더 자주 생긴다.', xp: 0.04, event: 0.1 },
    spa:     { name: '온천',   cost: { gold: 220, items: { volcanic_ash: 4, obsidian: 2, sea_shell: 4 } }, talent: null, traits: ['sleepy', 'lonely', 'waterbaby'],
      desc: '둥지에서 쉴 때 행동력·체력·기력과 정신이 더 빨리 찬다.', rest: 0.12, mind: 0.25 },
  },
  // 부엌 요리: '정성 들인 ○○'. 식구 요리는 유대·배 ×, 강화 음식은 지속 시간 ×, 새끼 먹이는 유대·배 ×
  cooked: { bond: 1.5, sat: 1.3, buffMin: 1.5 },
};

// ── 낚시: 해안 절벽에서만. 미끼 하나로 한 번 던짐 (행동력은 들지 않음) ──
const FISHING = {
  region: 'coast',
  biteMin: 1500, biteMax: 4500,          // 던진 뒤 입질이 오기까지 (ms)
  window: 1400,                          // 입질 뒤 이 안에 당겨야 함 (ms, 늦으면 놓침)
  perfect: 450, good: 800,               // 입질 뒤 이 안에 당기면 '완벽'·'좋음'
  // 잡히는 것: 기본 무게. tier가 높을수록 잘 당기거나 좋은 미끼일 때 잘 나옴. wx: 그 날씨에 무게 ×
  fish: [
    { id: 'fish_mackerel', w: 50, tier: 'common' },
    { id: 'fish_flounder', w: 30, tier: 'common' },
    { id: 'fish_salmon',   w: 10, tier: 'uncommon', wx: { rain: 2.5, fog: 1.5 } },
    { id: 'fish_eel',      w: 0.5, tier: 'uncommon', wx: { storm: 24 } },
    { id: 'fish_marlin',   w: 2,  tier: 'rare', wx: { clear: 1.5, heat: 1.5 } },
    { id: 'sea_scale',     w: 1,  tier: 'rare', wx: { fog: 2, storm: 1.5, aurora: 2 } },
  ],
  quality: { perfect: { uncommon: 2.5, rare: 4, common: 0.6 }, good: { uncommon: 1.5, rare: 2 }, ok: { rare: 0.5 }, auto: { uncommon: 0.8, rare: 0.4 } },
  bait: { bait_worm: {}, bait_shrimp: { common: 1.2 }, bait_meat: { uncommon: 1.6, rare: 1.5 }, bait_lure: { uncommon: 2, rare: 3 } },
  xp: { common: 2, uncommon: 5, rare: 12 },
  gatherBait: 0.45, gatherSalt: 0.55,     // 해안에서 채집할 때 미끼·소금이 함께 나올 확률 (소금 0.35 → 0.6 → 0.5 → 0.6 → 0.55: 해안 시장에서 하루 5개를 살 수 있게 되어 조금 낮춤)
  coastTribute: { bait: [3, 5], fish: [1, 3], failBait: [1, 2] }, // 적대가 해안을 위협할 때: 성공하면 미끼·생선, 실패해도 미끼 조금
};

// ── 멸망한 대륙 에레보스: 모두가 함께 채우는 정화도, 정화의 결정, 생존자와의 교환 ──
const RUIN = {
  name: '멸망한 대륙 에레보스',
  gateFrom: 'coast', gateTo: 'ruin_shore',
  crossAp: 3, minLevel: 20,                      // 바다를 건널 때 (오갈 때마다)
  drain: 2,                                      // 이 땅의 정신 소모 배율 (지역 drain을 곱함). 정신 보호 장신구가 줄여 줌
  eliteChance: 0.15,                             // 이 땅에서 강적을 만날 확률 (본토의 오염된 땅 MIND.eliteChance보다 낮게)
  eliteHp: 0.25,                                 // 강적에게는 장소 체력 배율(hpMul)을 이만큼만 더함 (0이면 본토 강적과 같은 체력, 1이면 사냥감과 같은 배율)
  together: 0.7,                                 // 같은 지역에 다른 드래곤이 있으면 정신 소모 ×
  // 모두의 정화도 목표: 최근 활동한 입장 가능(레벨 minLevel 이상) 드래곤 수 × goalPer (인원이 몇이든 걸리는 기간이 비슷하게)
  goalPer: 3300,                                 // 드래곤 하나당 몫. 하루 110점쯤(사냥 20번꼴) 쌓는 보통 강도로 한 달
  goalMin: 8000,                                 // 활동 인원이 아주 적어도 목표가 이 아래로는 내려가지 않음
  activeDays: 7,                                 // 최근 이 기간에 접속한 드래곤을 셈
  pts: { explore: 3, gather: 2, hunt: 6, elite: 25 }, // 행동마다 쌓이는 기여
  shard: { explore: [0.5, 1], gather: [0.4, 1], hunt: [1, 2], elite: [6, 9] }, // [나올 확률, 개수] / 사냥은 [최소, 최대]
  // 잿빛 상륙지의 생존자 '오르샤'와 바꾸기 (정화의 결정 몇 개)
  // 값 매기는 원칙: 큰 것은 작은 것 여러 개를 합친 것보다 비싸지 않게 (같은 값이면 큰 것 하나가 늘 낫거나 같음)
  exchange: [
    { id: 'purify_incense', cost: 3 },             // 정신 60 (성수 2개보다 조금 쌈)
    { id: 'holy_water',     cost: 2 },             // 정신 30
    { id: 'herbal_ointment', cost: 2 }, { id: 'moss_salve', cost: 3 }, { id: 'hydra_salve', cost: 4 }, // 체력 회복 (50 · 70 · 120)
    { id: 'ember_tea', cost: 1 }, { id: 'ember_tonic', cost: 2 }, { id: 'ember_elixir', cost: 6 }, // 기력 회복 (25 · 40+체력 25 · 60+행동력 2)
    { id: 'recipe_scroll',  cost: 12 },
    { id: 'ghost_lantern',  cost: 30 },
    { id: 'pure_amulet',    cost: 70 },
    { id: 'fire_crystal',   cost: 15 }, { id: 'eternal_ice', cost: 15 }, { id: 'sun_stone', cost: 15 },
    { id: 'heartwood',      cost: 15 }, { id: 'bog_pearl', cost: 15 }, { id: 'deep_pearl', cost: 15 }, { id: 'ancient_relic', cost: 15 },
    { id: 'ashen_core',     cost: 40 },
    { id: 'scar_tonic',     cost: 400 }, // 상흔을 하나 씻어 냄 (7일에 한 번 쓸 수 있음)
    { id: 'tr_map_piece',   cost: 60 }, { id: 'tr_star_orb', cost: 80 }, { id: 'tr_dragon_idol', cost: 105 }, // 보물 (가치 250 · 320 · 450)
  ],
  // 강적·사냥에서 나오는 것 (멸망한 대륙)
  coreDrop: { elite: 0.3, hunt: 0.03 },          // 잿빛 심장
  // 왕룡의 금빛 비늘 (자유 제작 2단계 재료): 멸망한 대륙의 강적만 아주 드물게, 왕좌의 회랑에서는 조금 더. 왕좌의 회랑에서는 사냥감도 아주 가끔
  kingScale: { id: 'king_scale', elite: 0.005, place: 'ruin_throne', placeElite: 0.03, placeHunt: 0.003 },
  treasure: { elite: 0.05, hunt: 0.006, pool: ['tr_map_piece', 'tr_star_orb', 'tr_dragon_idol', 'tr_ash_mirror', 'tr_broken_crown', 'tr_last_claw'] },
  // 희귀 장비: 강적을 이기면 아주 드물게. 숨은 천장: 아직 하나도 못 얻었는데 강적을 pity번 만났으면 그다음 승리(사냥이든 강적이든)에서 반드시 (첫 장비만, 화면에는 알리지 않음)
  gear: { elite: 0.015, hunt: 0.001, pity: 40, pool: ['erebus_eye', 'knight_gauntlet', 'void_ring', 'abyss_membrane'] },
};

const TRADE = {
  // 시장에서 하루(한국 날짜)에 살 수 있는 개수. 적지 않은 물건은 제한 없음
  dailyBuy: { salted_fish: 5, holy_water: 5, herbal_ointment: 10, strong_wine: 10, bait_worm: 10, salt_crystal: 5 },
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
      { name: '청소년', from: 4 }, { name: '어른', from: 11 }, { name: '노년', from: 18 },
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
    traderBond: 50,                   // 적대 드래곤 대신 시장에서 흥정해 주려면 필요한 유대 (청소년부터)
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
    expeditionFrom: 2,                // 해츨링 2일째부터 원정에 따라감 (인간 아이의 소년과 같은 날. 4 → 2)
    huntFrom: 11, huntEvery: DAY,     // 젊은 용부터 혼자 사냥해서 가져옴
    trainCooldown: 6 * 60 * 60 * 1000, trainAp: 1, trainEn: 5,
    trainLimit: [4, 8, 12, 16],       // 단계별로 가르칠 수 있는 누적 횟수
    statCap: [25, 45, 65, 85],          // 성장 단계(해츨링·어린 용·젊은 용·다 자란 용)마다 능력치 합의 상한. 원정·가르치기·이벤트로 오르는 것 모두 여기까지 (이미 넘은 새끼는 깎지 않고, 상한이 따라올 때까지 더 자라지 않음)
    giftEvery: 3 * DAY,               // 독립한 새끼가 선물을 보내는 간격
    giftFrom: 3,                      // 최근 독립한 몇 마리까지 선물을 보내는지
  },
  // 알을 품는 데 드는 재료 (종류별)
  eggNeeds: { red: 'fire_crystal', white: 'eternal_ice', green: 'heartwood', black: 'bog_pearl', gold: 'sun_stone', silver: 'deep_pearl', blue: 'deep_pearl', purple: 'ancient_relic', bronze: 'silver_clover' },
  // 돌보기에 쓰는 물건: 유대가 얼마나 오르는지, 어떤 재주 쪽으로 기우는지
  // sat: 먹으면 차는 포만감 (0이면 먹을 것이 아님). eat: 요리를 먹을 때의 반응
  care: {
    grass_seed: { bond: 2, talent: 'herbalist', sat: 10 }, wild_honey: { bond: 6, talent: 'herbalist', sat: 20 },
    glow_moss: { bond: 5, talent: 'herbalist' }, honey_salve: { bond: 8, talent: 'herbalist', sat: 15 },
    honey_cake:    { bond: 9,  talent: 'herbalist', sat: 45, eat: '두 손으로 꼭 쥐고 오물오물 먹는다. 입가에 꿀이 잔뜩 묻었다.' },
    moss_soup:     { bond: 7,  talent: 'herbalist', sat: 40, eat: '빛나는 수프를 신기한 듯 들여다보다가 후후 불어 마신다.' },
    fish_porridge: { bond: 9,  talent: 'guard',     sat: 60, eat: '한 그릇을 싹 비우고 배를 두드린다. "이제 드래곤처럼 힘이 세질 거야!"' },
    hearth_bread:  { bond: 8,  talent: 'smith',     sat: 50, eat: '빵을 먹고 나서는 작은 점토 화덕을 이리저리 두드리며 논다.' },
    fish_mackerel: { bond: 3,  talent: 'guard',     sat: 20, eat: '고등어를 꼬챙이에 꿰어 구워 주자 호호 불며 먹는다.' },
    fish_flounder: { bond: 4,  talent: 'guard',     sat: 25, eat: '납작한 가자미를 보고 한참 웃더니, 구워 주자 맛있게 먹는다.' },
    fish_salmon:   { bond: 7,  talent: 'guard',     sat: 40, eat: '은빛 비늘을 하나 떼어 간직하고는 연어를 맛있게 먹는다.' },
    fish_marlin:   { bond: 12, talent: 'guard',     sat: 70, eat: '자기 키보다 긴 청새치를 보고 입이 떡 벌어진다. 구워 주자 동네방네 자랑하며 먹는다.' },
    salmon_grill:  { bond: 12, talent: 'guard',     sat: 70, eat: '연어 구이 냄새에 달려와 뼈까지 발라 먹는다. "바다 맛이 나!"' },
    feast_plate:   { bond: 14, talent: null,        sat: 100, eat: '눈이 휘둥그레져서 한 접시씩 맛을 본다. 오늘은 잔칫날이다!' },
    red_clay: { bond: 3, talent: 'smith' }, bog_iron: { bond: 5, talent: 'smith' },
    gold_ore: { bond: 7, talent: 'smith' }, obsidian: { bond: 6, talent: 'smith' },
    salted_fish: { bond: 6, talent: 'guard', sat: 30 }, beast_hide: { bond: 4, talent: 'guard' }, sharp_fang: { bond: 5, talent: 'guard' },
  },
  tripTalent: 2,                      // 원정에 한 번 따라갈 때마다 파수꾼 쪽으로
  // 유대가 조금씩 옅어짐: 마지막으로 유대가 오른 뒤 idleH시간이 지나면 everyH시간마다 1씩 줄어듦 (floor까지만. 그 아래는 오래 돌보지 않을 때의 규칙만)
  // 외로움을 타는: lonelyH시간부터 · 의젓한: 두 배 느리게 · 혼자서도 씩씩한: 4분의 1 덜 (KIN_GROW.tough) · 새침한: 줄지 않음. 원정·심부름·가출·곁에 둔 동안·둥지에서 함께 쉬는 동안은 멈춤
  bondFade: { idleH: 8, everyH: 2, floor: 30, lonelyH: 6 }, // 하루를 통째로 비우면 −9쯤, 이틀이면 −21쯤. 날마다 챙겨야 높은 유대가 지켜짐 (30에서 멈춤. 40 아래로 내려가면 가출이 잦아짐)
  // 가출: 소년(인간)과 해츨링·어린 용(새끼 드래곤)이 가끔 둥지를 나감. 영영 떠나지는 않음
  runaway: {
    human: ['소년'], drake: ['해츨링', '어린 용'],
    base: 0.04,                 // 하루에 한 번 굴리는 기본 확률
    lowBond: 40, lowBondAdd: 0.12, hungryAdd: 0.08, neglectDays: 2, neglectAdd: 0.1,
    traitAdd: { curious: 0.06, prankster: 0.06 }, traitCut: { steady: 0.5, clingy: 0.5 }, // 모험 좋아함 / 잘 안 나감
    gapDays: 7,                 // 한 번 나간 뒤 이만큼은 다시 나가지 않음
    hours: 24,                  // 아무도 찾지 않으면 이만큼 지나 스스로 돌아옴
    searchAp: 2, foundBond: 10, waitBond: -8, seekBond: 6, seekMinutes: 60, giftChance: 0.4,
  },
  // 새끼 드래곤이 보호자를 돕는 법
  //  ally: '곁에 둔 새끼'(어린 용부터) 하나가 사냥·강적·재앙과의 싸움에 따라 나와 매 턴 공격 (결투에는 나오지 않음)
  //  errand: 곁에 두지 않은 새끼를 혼자 심부름 보내 그 지역의 재료를 구해 옴 (보호자의 행동력은 들지 않음)
  drakeHelp: {
    errand: {
      from: ['어린 용', '젊은 용', '다 자란 용'], ruinFrom: ['다 자란 용'], // 멸망한 대륙은 다 자란 용만
      minutes: [60, 120, 240],
      rolls: { 60: 3, 120: 5, 240: 9 },          // 시간마다 줍는 횟수
      stageRolls: { '어린 용': 0, '젊은 용': 1, '다 자란 용': 2 },
      wingPer: 10,                               // 날개 이만큼마다 한 번 더 줍기
      tier: { common: 0.7, uncommon: 0.26, rare: 0.04 }, wisdomRare: 0.003, // 지혜 1당 귀한 것 확률 +0.3%
      satPerHour: 8,                             // 다녀오면 배가 이만큼씩 줆
      trophy: 0.25,                              // 다 자란 용은 가끔 그 지역 사냥감의 전리품도
    },
    ally: { from: ['어린 용', '젊은 용', '다 자란 용'], base: 4, claw: 1.2, wing: 0.5, stage: { '어린 용': 2, '젊은 용': 4, '다 자란 용': 6 }, power: 0.35, hunterPower: 0.43, armor: 0.25, cleverDaze: 0.2 }, // armor: 사냥감 비늘을 이만큼만 받음 (보통 공격은 0.5). 예전 power 0.25, hunterPower 0.31
  },
  // 새끼 드래곤의 먹이와 포만감. 배부르면 가르칠 때 유대가 더 오르고 가르치기 간격이 짧아짐
  drakeFood: {
    items: {
      fish_mackerel: { bond: 3, sat: 25 }, fish_flounder: { bond: 3, sat: 25 }, fish_salmon: { bond: 6, sat: 45 }, fish_eel: { bond: 6, sat: 40 }, fish_marlin: { bond: 12, sat: 90 },
      bait_meat: { bond: 4, sat: 30 }, salted_fish: { bond: 4, sat: 30 },
      roast_meat: { bond: 8, sat: 60 }, ember_snack: { bond: 7, sat: 45 }, fish_skewer: { bond: 8, sat: 55 }, dragon_feast: { bond: 14, sat: 100 },
    },
    // 종류마다 가장 좋아하는 먹이 (먹여 보면 알게 됨)
    kindFav: { red: 'roast_meat', gold: 'roast_meat', bronze: 'ember_snack', volcano: 'ember_snack', black: 'bait_meat', blue: 'fish_skewer', silver: 'fish_skewer', white: 'fish_skewer', green: 'fish_salmon', purple: 'fish_eel' },
    start: 80, perHour: 4, hungry: 30, full: 70,
    fullBondEvery: 3 * 60 * 60 * 1000,   // 배부른 동안 이 간격마다 유대 +1
    cooldown: 2 * 60 * 60 * 1000,        // 먹이를 주고 다음에 줄 수 있을 때까지
    favBond: 4,                          // 좋아하는 먹이면 유대 +
    fullTrainBond: 2, fullTrainCd: 0.75, // 배부르면: 가르칠 때 유대 +2, 가르치기 간격 ×0.75
    selfFeed: ['젊은 용', '다 자란 용'], selfFloor: 60, // 이만큼 자라면 스스로 사냥해 배를 채움 (포만감이 이 아래로 떨어지지 않음)
  },
  // 인간 식구의 포만감 (0~100). 배고프다고 아프거나 떠나지는 않음. 배부르면 좋은 일만 생김
  hunger: {
    start: 80,                        // 처음 데려왔을 때
    perHour: 5,                       // 한 시간에 줄어드는 양 (가득 찬 뒤 6시간쯤 '든든함', 10시간쯤 '출출함', 14시간쯤 '배고픔')
    hungry: 30, full: 70,             // 이 아래면 배고픔, 이 위면 배부름
    fullBondEvery: 3 * 60 * 60 * 1000,// 배부른 동안 이 간격마다 유대 +1
    hungryGift: 0.5,                  // 배고플 때 먹을 것이 아닌 물건을 받으면 유대가 이만큼만
    restFull: 1.5,                    // 배부르면 둥지에서 함께 쉴 때 유대 ×
    favBond: 5,                       // 가장 좋아하는 요리를 받으면 유대 +
    keeperFloor: 40,                  // 둥지에 남은 약초꾼 어른이 있으면 아이들의 포만감이 이 아래로 떨어지지 않음
    meals: ['honey_cake', 'moss_soup', 'fish_porridge', 'hearth_bread'], // 아이마다 이 중 하나를 가장 좋아함
  },
  companionBonus: 0.15,               // 원정에 따라간 식구 하나당 찾는 물건 +15%
};
const TALENTS = {
  herbalist: { name: '약초꾼',   desc: '둥지에 남으면 하루에 한 번 꿀 고약을 만들어 둔다.' },
  smith:     { name: '대장장이', desc: '둥지에 남으면 제작에 드는 기력이 30% 줄어든다.' },
  guard:     { name: '파수꾼',   desc: '둥지에 남으면 기사단 습격과 구출 시도가 절반으로 준다.' },
};
// ── 식구의 타고난 모습 ─────────────────────────────
// 인간 아이는 데려올 때, 새끼 드래곤은 알에서 깨어날 때 정해짐. 성별·생김새는 보는 재미, 성격은 키우는 방식에 조금씩 영향을 줌
// 이미 있던 식구도 다음 접속 때 한 번 정해짐
const KIN_LOOKS = {
  sex: { human: { m: '남자', f: '여자' }, drake: { m: '남자', f: '여자' } }, // 인간 아이와 새끼 드래곤 모두 같은 표기
  human: {
    hair: ['까만 머리', '갈색 머리', '붉은 머리', '금빛 머리', '잿빛 머리', '밤색 곱슬머리',
      '은빛 머리', '밀빛 머리', '짧게 자른 까만 머리', '땋아 내린 갈색 머리', '부스스한 붉은 머리', '구불거리는 금빛 머리', '까치집 머리'],
    eyes: ['검은 눈', '갈색 눈', '푸른 눈', '초록 눈', '회색 눈',
      '호박색 눈', '짙은 밤색 눈', '잿빛 푸른 눈', '처진 눈', '동그란 눈', '가늘고 긴 눈', '양쪽 색이 다른 눈'],
    mark: ['주근깨', '보조개', '눈 밑 점', '짙은 눈썹', '긴 속눈썹', '앞니 빠진 웃음',
      '콧등의 작은 흉터', '발그레한 볼', '손등의 반점', '한쪽 보조개', '오른쪽 귀의 점', '웃음이 많은 입매', '햇볕에 그을린 얼굴', '뽀얀 얼굴'],
    build: ['통통한 볼', '가녀린 체구', '또래보다 큰 키', '작고 다부진 체구', '팔다리가 긴 체구', '동글동글한 체구', '마르고 날랜 체구'], // 체격 (나중에 생긴 칸: 예전 아이는 처음 볼 때 채워 줌)
  },
  drake: {
    scale: ['짙은', '옅은', '얼룩무늬', '윤기 도는', '잿빛 감도는', '반짝이는', '광택 없는', '테두리가 짙은', '군데군데 빛바랜', '무지갯빛 도는'], // + 종류 이름 비늘 (예: 윤기 도는 레드 비늘)
    horn: ['곧은 뿔', '굽은 뿔', '짧고 뭉툭한 뿔', '갈래진 뿔', '나선 뿔', '작게 돋은 뿔', '뒤로 누운 뿔', '매끈한 흰 뿔'],
    eyes: ['호박색 눈', '청록 눈', '은빛 눈', '붉은 눈', '금빛 눈', '보랏빛 눈', '잿빛 눈', '연둣빛 눈', '깊은 검은 눈', '양쪽 색이 다른 눈'],
    mark: ['꼬리 끝이 두 갈래', '날개막에 반점', '한쪽 뿔이 조금 짧음', '등가시가 유난히 큼', '목덜미에 흰 비늘 한 줌',
      '날개 끝이 갈라짐', '배 비늘이 유난히 밝음', '콧등에 작은 흉터', '발톱 하나가 흰색', '등에 줄무늬'],
    tail: ['긴 채찍 꼬리', '두툼한 꼬리', '끝에 가시가 난 꼬리', '끝이 뭉툭한 꼬리', '지느러미 같은 꼬리'], // 꼬리 (나중에 생긴 칸)
  },
};
// 성격: 식구마다 2개. for는 인간(human)·새끼 드래곤(drake) 중 누구에게 붙는지
const KIN_TRAITS = {
  // 인간 아이
  glutton:   { for: 'human', name: '먹보',          desc: '먹을 것(씨앗·꿀·생선·요리)을 건네면 유대가 2 더 오르고, 배가 더 든든해진다.' },
  gentle:    { for: 'human', name: '다정한',        desc: '무엇을 건네든 유대가 1 더 오른다.' },
  lonely:    { for: 'human', name: '외로움을 타는', desc: '하루 일찍 외로워하지만, 둥지에서 함께 쉬면 유대가 두 배로 오른다.' },
  sleepy:    { for: 'human', name: '잠꾸러기',      desc: '둥지에서 함께 쉬면 유대가 두 배로 오른다.' },
  steady:    { for: 'human', name: '의젓한',        desc: '한동안 돌보지 못해도 유대가 절반만 줄어든다.' },
  shy:       { for: 'human', name: '수줍은',        desc: '유대 40까지는 낯을 가려 돌보기 유대가 1 덜 오르고, 그 뒤로는 2 더 오른다.' },
  prankster: { for: 'human', name: '장난꾸러기',    desc: '돌볼 때 가끔 주머니에서 무언가를 꺼내 준다.' },
  brave:     { for: 'human', name: '씩씩한',        desc: '파수꾼 쪽으로 조금 기울어 태어나고, 원정에서 돌아오면 유대가 2 더 오른다.' },
  handy:     { for: 'human', name: '손재주 좋은',   desc: '대장장이 쪽으로 조금 기울어 태어난다.' },
  flowers:   { for: 'human', name: '풀꽃을 좋아하는', desc: '약초꾼 쪽으로 조금 기울어 태어난다.' },
  curious:   { for: 'both',  name: '호기심 많은',   desc: '원정에 따라가면 찾는 물건이 조금 더 늘어난다.' },
  chatterbox:{ for: 'human', name: '수다쟁이',      desc: '원정에서 돌아오면 다녀온 이야기를 늘어놓느라 유대가 1 더 오른다.' },
  songbird:  { for: 'human', name: '노래를 좋아하는', desc: '둥지에서 함께 쉬면 노래를 불러 유대가 1 더 오른다.' },
  tidy:      { for: 'human', name: '깔끔한',        desc: '둥지 시설에서 일하는 날마다 유대가 1 더 오른다.' },
  bookworm:  { for: 'human', name: '책벌레',        desc: '서고 일에 잘 맞는다.' },
  waterbaby: { for: 'human', name: '물놀이를 좋아하는', desc: '온천 일에 잘 맞는다.' },
  lookout:   { for: 'human', name: '높은 곳을 좋아하는', desc: '망루 일에 잘 맞는다.' },
  picky:     { for: 'human', flaw: true, name: '편식하는', desc: '먹을 것을 건네면 유대가 1 덜 오르지만, 가장 좋아하는 요리를 먹으면 2 더 오른다.' },
  crybaby:   { for: 'human', flaw: true, name: '울보',     desc: '외로워할 때 유대가 1 더 줄지만, 다시 돌봐 주면 유대가 2 더 오른다.' },
  // 새끼 드래곤
  clever:    { for: 'drake', name: '영리한',        desc: '가르칠 때 네 번에 한 번꼴로 능력치가 1 더 오른다.' },
  diligent:  { for: 'drake', name: '부지런한',      desc: '가르치기 간격이 2시간 짧다.' },
  clingy:    { for: 'drake', name: '응석받이',      desc: '가르칠 때 유대가 2 더 오른다.' },
  hunter:    { for: 'drake', name: '사냥 본능',     desc: '혼자 사냥해 올 때 가죽을 한 장 더 물어 온다.' },
  swift:     { for: 'drake', name: '날쌘',          desc: '원정에서 자랄 때 날개 쪽으로 잘 자란다.' },
  stubborn:  { for: 'drake', name: '고집 센',       desc: '원정에서 자랄 때 발톱 쪽으로 잘 자란다.' },
  dreamy:    { for: 'drake', name: '꿈꾸는',        desc: '원정에서 자랄 때 지혜 쪽으로 잘 자란다.' },
  proud:     { for: 'drake', name: '자존심 센',     desc: '원정에서 자랄 때 위엄 쪽으로 잘 자란다.' },
  bold:      { for: 'drake', name: '겁 없는',       desc: '함께 싸울 때 주는 피해가 10% 크다.' },
  sharpnose: { for: 'drake', name: '코가 예민한',   desc: '심부름에서 귀한 것을 조금 더 잘 찾아온다.' },
  sleepyhead:{ for: 'drake', flaw: true, name: '늦잠꾸러기', desc: '가르치기 간격이 1시간 길지만, 배가 천천히 꺼진다.' },
  foodie:    { for: 'drake', flaw: true, name: '입맛 까다로운', desc: '좋아하는 먹이를 주면 유대가 3 더 오르지만, 다른 먹이에는 1 덜 오른다.' },
  // ── 자라며 생기는 성격 (grown: 태어날 때는 붙지 않음. 어떻게 키웠는지에 따라 KIN_GROW가 붙여 줌) ──
  // 인간 아이
  homebody:  { for: 'human', grown: true, name: '둥지를 좋아하는', desc: '둥지에서 함께 쉬면 유대가 1.5배로 오른다.' },
  adventurer:{ for: 'human', grown: true, name: '모험을 좋아하는', desc: '원정에 따라가면 찾는 물건이 조금 더 늘어난다.' },
  sturdy:    { for: 'human', grown: true, name: '튼튼한',         desc: '배가 천천히 꺼진다.' },
  warm:      { for: 'human', grown: true, name: '정 많은',        desc: '돌볼 때 유대가 1 더 오르고, 선물을 더 자주 만들어 온다.' },
  capable:   { for: 'human', grown: true, name: '야무진',         desc: '둥지 시설에서 일하는 힘이 25% 크다.' },
  tough:     { for: 'human', grown: true, name: '혼자서도 씩씩한', desc: '한동안 돌보지 못해도 유대가 4분의 1 덜 줄어든다.' },
  fussy:     { for: 'human', grown: true, flaw: true, name: '투정쟁이',   desc: '배가 고파지면 입이 삐죽 나와 유대가 1 줄지만, 가장 좋아하는 요리를 먹으면 유대가 3 더 오른다.' },
  willful:   { for: 'human', grown: true, flaw: true, name: '제멋대로인', desc: '돌볼 때 네 번에 한 번은 딴청을 피워 유대가 1 덜 오르지만, 그때 어디서 주워 온 것을 내민다.' },
  opened:    { for: 'human', grown: true, name: '마음을 연',      desc: '수줍던 아이가 마음을 열었다. 돌볼 때 유대가 2 더 오른다.' },
  // 새끼 드래곤
  fierce:    { for: 'drake', grown: true, name: '사나운',         desc: '함께 싸울 때 주는 피해가 20% 크다.' },
  windrider: { for: 'drake', grown: true, name: '바람을 타는',     desc: '심부름을 25% 빨리 다녀온다.' },
  stargazer: { for: 'drake', grown: true, name: '별을 읽는',       desc: '심부름에서 귀한 것을 더 잘 찾아온다.' },
  shieldmate:{ for: 'drake', grown: true, name: '등을 맡기는',     desc: '함께 싸울 때 보호자가 받는 피해가 5% 준다.' },
  pathfinder:{ for: 'drake', grown: true, name: '길눈 밝은',       desc: '심부름에서 한 번 더 주워 온다.' },
  affable:   { for: 'drake', grown: true, name: '살가운',          desc: '가르칠 때 유대가 1 더 오른다.' },
  steadfast: { for: 'drake', grown: true, name: '듬직한',          desc: '가르치기 간격이 1시간 짧다.' },
  greedy:    { for: 'drake', grown: true, flaw: true, name: '먹성 좋은', desc: '배가 20% 빨리 꺼지지만, 배부를 때 가르치면 유대가 1 더 오른다.' },
  wild:      { for: 'drake', grown: true, flaw: true, name: '천방지축', desc: '가르치기 간격이 1시간 길지만, 원정에서 자랄 때 가끔 능력치가 하나 더 오른다.' },
  sociable:  { for: 'human', grown: true, name: '친구가 많은',     desc: '다른 둥지의 아이와 놀다 오면 유대가 2 더 오른다.' },
  packmate:  { for: 'drake', grown: true, name: '어울리기 좋아하는', desc: '다른 둥지의 아이와 놀다 오면 유대가 2 더 오른다.' },
  dignified: { for: 'drake', grown: true, name: '속 깊은',         desc: '응석받이가 다 자라 속이 깊어졌다. 가르칠 때 유대가 2 더 오르고, 먹이를 주면 1 더 오른다.' },
  spoiled:    { for: 'human', grown: true, flaw: true, name: '응석받이',   desc: '교감할 때 유대가 1 더 오르지만, 하루 넘게 교감이 없으면 서운해서 유대가 2 준다.' },
  aloof:      { for: 'human', grown: true, flaw: true, name: '새침한',     desc: '교감할 때 유대가 1 덜 오르지만, 한동안 교감을 못 받아도 서운해하지 않는다.' },
  babyish:    { for: 'drake', grown: true, flaw: true, name: '어리광쟁이', desc: '교감할 때 유대가 1 더 오르지만, 하루 넘게 교감이 없으면 서운해서 유대가 2 준다.' },
  aloofd:     { for: 'drake', grown: true, flaw: true, name: '새침한',     desc: '교감할 때 유대가 1 덜 오르지만, 한동안 교감을 못 받아도 서운해하지 않는다.' },
};
const KIN_TRAIT_RULES = {
  count: 2,                                        // 식구마다 붙는 성격 수
  food: ['grass_seed', 'wild_honey', 'salted_fish', 'honey_salve'], // 먹보가 좋아하는 것
  pranksterChance: 0.2, pranksterItems: ['grass_seed', 'red_clay', 'glow_moss', 'bog_iron'],
  cleverChance: 0.25, diligentMs: 2 * 60 * 60 * 1000,
  curiousBonus: 1 / 3,                             // 원정 동행 하나를 이만큼 더 쳐 줌 (KIN.companionBonus 15% × 1/3 ≈ +5%)
  growBias: 0.5,                                   // 날쌘·고집 센·꿈꾸는: 원정에서 자랄 때 그쪽 능력치가 고를 확률
};

// ── 소꿉친구: 가까운 둥지(같은 지역이나 바로 이웃한 지역)의 아이끼리 가끔 함께 놀다 옴 ──
// 둥지 소식을 불러올 때 everyMs마다 한 번 chance 확률로. 함께 논 횟수가 friendAt이 되면 단짝
// 놀 수 있는 나이: 인간은 아이·소년·청소년, 새끼는 어린 용·젊은 용 (원정·심부름·가출 중이면 빠짐)
const KIN_PLAY = {
  everyMs: 8 * 60 * 60 * 1000, chance: 0.5, friendAt: 3, keepFriends: 6, sameFriend: 0.6, bond: 1, sociable: 2,
  stages: ['아이', '소년', '청소년', '어린 용', '젊은 용'],
  // {a} 우리 아이, {b} 다른 둥지 아이, {o} 그 아이의 보호자
  scenes: {
    hh: ['{a}[이/가] {o}의 둥지 {b}[과/와] 개울가에서 물수제비를 뜨며 놀다 왔다.', '{a}[이/가] {o}의 둥지 {b}[과/와] 들판에서 술래잡기를 하다 해 질 녘에야 돌아왔다.',
      '{a}[이/가] {o}의 둥지 {b}[과/와] 나무 위에 둘만의 비밀 기지를 만들었다며 자랑한다.', '{a}[이/가] {o}의 둥지 {b}[과/와] 들꽃으로 화관을 엮어 서로 씌워 주고 왔다.'],
    hd: ['{a}[이/가] {o}의 둥지 새끼 {b}의 등에 올라타 언덕을 한 바퀴 돌고 왔다.', '{a}[이/가] {o}의 둥지 새끼 {b}에게 막대기 던지기 놀이를 가르쳐 주고 왔다.'],
    dh: ['{a}[이/가] {o}의 둥지 아이 {b}[을/를] 등에 태우고 언덕을 한 바퀴 돌고 왔다.', '{a}[이/가] {o}의 둥지 아이 {b}[이/가] 던지는 막대기를 물어 오며 한참을 놀다 왔다.'],
    dd: ['{a}[이/가] {o}의 둥지 새끼 {b}[과/와] 하늘에서 누가 더 높이 나나 겨루고 왔다.', '{a}[이/가] {o}의 둥지 새끼 {b}[과/와] 바위 위에 나란히 엎드려 낮잠을 자고 왔다.',
      '{a}[이/가] {o}의 둥지 새끼 {b}[과/와] 작은 불씨를 주고받으며 장난치다 왔다.'],
  },
  // 둘 중 하나라도 청소년·젊은 용이면 이 장면 (어린아이 놀이 대신)
  older: ['청소년', '젊은 용'],
  scenesOld: {
    hh: ['{a}[이/가] {o}의 둥지 {b}[과/와] 개울가에 앉아 해 질 때까지 이야기를 나누다 왔다.', '{a}[이/가] {o}의 둥지 {b}[과/와] 언덕 너머 장터까지 함께 다녀왔다.',
      '{a}[이/가] {o}의 둥지 {b}[과/와] 활쏘기 내기를 하고 왔다. 누가 이겼는지는 말해 주지 않는다.'],
    hd: ['{a}[이/가] {o}의 둥지 새끼 {b}의 등에 올라 구름 위까지 날아갔다 왔다.', '{a}[이/가] {o}의 둥지 새끼 {b}[과/와] 숲 가장자리를 함께 둘러보고 왔다.'],
    dh: ['{a}[이/가] {o}의 둥지 아이 {b}[을/를] 등에 태우고 구름 위까지 날아 주고 왔다.', '{a}[이/가] {o}의 둥지 아이 {b}[과/와] 숲 가장자리를 함께 둘러보고 왔다.'],
    dd: ['{a}[이/가] {o}의 둥지 새끼 {b}[과/와] 바람을 타고 협곡 끝까지 날아갔다 왔다.', '{a}[이/가] {o}의 둥지 새끼 {b}[과/와] 함께 사냥 연습을 하고 왔다.',
      '{a}[이/가] {o}의 둥지 새끼 {b}[과/와] 높은 바위에 앉아 저 아래 땅을 내려다보다 왔다.'],
  },
  bestLine: '{a}[과/와] {o}의 둥지 {b}[은/는] 이제 단짝이다.',
};

// ── 자라며 생기는 성격: 어떻게 키웠는지 남는 자람 기록(k.data.grow)에 따라 ──
// 자람 기록: rest 함께 쉼 · trip 원정 동행 · food 먹을 것 · friend 다른 둥지 아이와 놂 · warm/trust/strict/free 이벤트에서 고른 태도
//           neglect 오래 못 돌봄 · hungry 배고파짐 · claw/wing/wisdom 가르친 능력치 · fight 함께 싸움 · errand 심부름
// 점수 = 기록 합 ÷ unit. 자라는 단계가 바뀔 때 점수가 1 이상인 것 중 가장 큰 쪽이 붙고,
// 단계와 상관없이 점수가 special 이상이 되면 그 순간에도 붙는다 ('특별한 순간'). 자라며 붙는 성격은 max개까지
const KIN_GROW = {
  max: 3, special: 3, hint: 0.5,                   // hint: 이 점수가 넘으면 식구 카드에 '요즘 ~한 것 같다' 힌트 (다 큰 식구는 hintGrown·whyGrown이 있으면 그것으로)
  openedBond: 80,                                  // 수줍은 아이가 이 유대를 넘으면 '마음을 연'으로
  sturdySat: 0.8, greedySat: 1.2,                  // 배가 꺼지는 빠르기 배율
  capable: 1.25, tough: 0.75, fierce: 1.2, shieldmate: 0.95, windrider: 0.75, stargazer: 0.03,
  bold: 1.1, sharpnose: 0.02, sleepySat: 0.85,     // 타고난 성격: 겁 없는(함께 싸울 때 피해) · 코가 예민한(심부름 귀한 것) · 늦잠꾸러기(배 꺼지는 빠르기)
  hourMs: 60 * 60 * 1000, willfulChance: 0.25, wildChance: 0.25, warmGift: 1.5,
  paths: {
    human: [
      { trait: 'homebody',   keys: ['rest'],             unit: 4, hint: '요즘 둥지에서 뒹구는 시간을 제일 좋아하는 것 같다.',  why: '둥지에서 함께 뒹굴던 날들이 몸에 배었다.' },
      { trait: 'adventurer', keys: ['trip'],             unit: 4, hint: '요즘 바깥 이야기만 나오면 눈이 반짝이는 것 같다.',   why: '함께 다녀온 먼 길들이 마음에 남았다.' },
      { trait: 'sturdy',     keys: ['food'],             unit: 6, hint: '요즘 밥을 먹고 나면 볼이 통통하게 차오르는 것 같다.', hintGrown: '요즘 밥을 든든히 먹고 나면 힘쓰는 일을 도맡는 것 같다.', why: '잘 먹고 자란 몸이 단단해졌다.' },
      { trait: 'warm',       keys: ['warm'],             unit: 2, hint: '요즘 부쩍 살갑게 구는 것 같다.',                     why: '받은 다정함을 그대로 닮아 간다.' },
      { trait: 'capable',    keys: ['trust', 'strict'],  unit: 2, hint: '요즘 제 일은 제가 하려고 드는 것 같다.',             why: '스스로 해내던 날들이 아이를 야무지게 했다.', whyGrown: '스스로 해내던 날들이 몸에 배어 야무져졌다.' },
      { trait: 'tough',      keys: ['neglect'],          unit: 2, hint: '요즘 혼자 있는 데 익숙해진 것 같다.',                why: '혼자 기다리던 날들을 씩씩하게 견뎌 냈다.' },
      { trait: 'fussy',      keys: ['hungry'],           unit: 3, hint: '요즘 배가 고프면 금방 입이 삐죽 나오는 것 같다.', hintGrown: '요즘 배가 고프면 금방 말수가 줄고 예민해지는 것 같다.',    why: '배고픈 날이 잦았던 탓인지 투정이 늘었다.' },
      { trait: 'willful',    keys: ['free'],             unit: 2, hint: '요즘 하고 싶은 대로만 하려는 것 같다.',              why: '하고 싶은 대로 두었더니 고집이 자랐다.' },
      { trait: 'sociable',   keys: ['friend'],           unit: 3, hint: '요즘 옆 둥지 친구 이야기를 자주 하는 것 같다.',      why: '다른 둥지 아이들과 어울리던 날들이 아이를 밝게 했다.', whyGrown: '다른 둥지 식구들과 어울리던 날들이 마음을 밝게 했다.' },
      { trait: 'spoiled',    keys: ['pamper'],           unit: 4, hint: '요즘 보호자 곁에서 떨어지려 하지 않는 것 같다.',     why: '너무 자주 안기고 쓰다듬어진 탓에 응석이 늘었다.', hintGrown: '요즘 다 큰 몸으로 자꾸 보호자에게 기대려는 것 같다.', whyGrown: '너무 자주 챙겨 준 탓인지 다 커서도 기대는 버릇이 생겼다.' },
      { trait: 'aloof',      keys: ['smother'],          unit: 4, hint: '요즘 보호자가 다가가면 슬쩍 피하는 것 같다.',         why: '너무 자주 챙겨 주는 손길이 조금 귀찮아졌다.' },
    ],
    drake: [
      { trait: 'fierce',     keys: ['claw'],             unit: 3, hint: '요즘 바위만 보면 발톱을 갈아 대는 것 같다.',          why: '발톱 쓰는 법을 배우며 기세가 사나워졌다.' },
      { trait: 'windrider',  keys: ['wing'],             unit: 3, hint: '요즘 바람 부는 날이면 들뜨는 것 같다.',              why: '바람을 타는 법이 날개에 익었다.' },
      { trait: 'stargazer',  keys: ['wisdom'],           unit: 3, hint: '요즘 밤하늘을 오래 올려다보는 것 같다.',             why: '별을 읽는 밤이 쌓여 눈이 깊어졌다.' },
      { trait: 'shieldmate', keys: ['fight'],            unit: 15, hint: '요즘 싸움터에서 등 뒤를 곧잘 지키는 것 같다.',       why: '함께 싸운 날들이 서로의 등을 맡기게 했다.' },
      { trait: 'pathfinder', keys: ['errand'],           unit: 3, hint: '요즘 먼 길을 다녀오는 게 즐거운 것 같다.',           why: '혼자 다녀온 심부름 길이 눈에 익었다.' },
      { trait: 'affable',    keys: ['warm'],             unit: 2, hint: '요즘 부쩍 품을 파고드는 것 같다.', hintGrown: '요즘 부쩍 곁에 와서 몸을 기대는 것 같다.',                   why: '받은 다정함을 그대로 닮아 간다.' },
      { trait: 'steadfast',  keys: ['trust', 'strict'],  unit: 2, hint: '요즘 꼬리를 곧게 세우고 의젓하게 구는 것 같다.',     why: '스스로 견뎌 낸 날들이 새끼를 듬직하게 했다.', whyGrown: '스스로 견뎌 낸 날들이 더욱 듬직하게 했다.' },
      { trait: 'greedy',     keys: ['hungry'],           unit: 3, hint: '요즘 먹을 것만 보면 눈빛이 달라지는 것 같다.',       why: '배고픈 날이 잦았던 탓인지 먹성이 좋아졌다.' },
      { trait: 'wild',       keys: ['free'],             unit: 2, hint: '요즘 둥지 안을 마구 뛰어다니는 것 같다.',            why: '하고 싶은 대로 두었더니 천방지축이 되었다.', hintGrown: '요즘 둥지 밖을 제멋대로 쏘다니는 것 같다.', whyGrown: '하고 싶은 대로 두었더니 다 커서도 거침이 없어졌다.' },
      { trait: 'packmate',   keys: ['friend'],           unit: 3, hint: '요즘 다른 둥지 쪽 하늘을 자주 바라보는 것 같다.',    why: '다른 둥지 새끼들과 어울리던 날들이 마음을 열게 했다.' },
      { trait: 'babyish',    keys: ['pamper'],           unit: 4, hint: '요즘 날개 밑으로 자꾸 파고드는 것 같다.',             why: '너무 자주 안기고 쓰다듬어진 탓에 어리광이 늘었다.', hintGrown: '요즘 다 큰 몸으로 자꾸 날개 밑을 비집고 드는 것 같다.', whyGrown: '너무 자주 챙겨 준 탓인지 다 커서도 어리광이 남았다.' },
      { trait: 'aloofd',     keys: ['smother'],          unit: 4, hint: '요즘 다가가면 고개를 홱 돌리는 것 같다.',             why: '너무 자주 챙겨 주는 손길이 조금 귀찮아졌다.' },
    ],
  },
};
// ── 교감: 쓰다듬기·안아 주기 같은, 물건 없이 함께하는 행동 ─────────
// 자라는 단계마다 좋아하는 것(like)·싫어하는 것(dislike)이 다르고, 하루에 cap번을 넘기면 과보호가 쌓여 성격이 바뀜
// ── 유대: 꼭대기로 갈수록 덜 오르고, 자라는 고비에 서먹해지며, 높을수록 아이가 달라짐 ──
// ── 자유 제작 (실험): 재료의 성질로 물건을 빚음 ─────────────────
// 성질: 바탕(food 먹을거리 · bind 엮음) · 효능(life 생기 · vigor 기운 · clear 맑음 · hard 단단함 · sharp 날카로움 · light 가벼움 · lore 옛 지혜 · shine 빛남) · 기운(fire 불 · frost 얼음 · venom 독 · soul 혼)
// 세기: 흔함 1 · 드묾 2 · 희귀 3 (멸망한 대륙 재료는 1 더)
const FREE = {
  tagNames: { food: '먹을거리', bind: '엮음', life: '생기', vigor: '기운', clear: '맑음', hard: '단단함', sharp: '날카로움', light: '가벼움', lore: '옛 지혜', shine: '빛남', fire: '불', frost: '얼음', venom: '독', soul: '혼' },
  tagGroup: { food: 'base', bind: 'base', life: 'eff', vigor: 'eff', clear: 'eff', hard: 'eff', sharp: 'eff', light: 'eff', lore: 'eff', shine: 'eff', fire: 'aura', frost: 'aura', venom: 'aura', soul: 'aura' },
  tags: {
    grass_seed: {food: 1, life: 1},
    wild_flower: {food: 1, clear: 1},
    sea_bindweed: {food: 1},
    salt_crystal: {food: 1},
    wild_honey: {food: 2, life: 2, vigor: 2},
    moss_flower: {food: 2, clear: 2},
    snow_flower: {food: 2, clear: 2, frost: 2},
    glow_moss: {food: 2, clear: 2},
    silver_clover: {food: 3, life: 3},
    spider_silk: {bind: 1, light: 1},
    beast_hide: {bind: 1},
    wolf_pelt: {bind: 1},
    black_reed: {bind: 1, venom: 1},
    silk_scrap: {bind: 2, light: 2},
    silver_chain: {bind: 2, shine: 2},
    void_silk: {bind: 3, light: 3},
    king_scale: {hard: 3, shine: 3},
    // 실험 재료: 순수한 엮음(목·부적 장신구), 두 효능 조합(날개+지혜, 비늘+지혜, 발톱+위엄, 날개+위엄), 먹을거리, 불 기운
    tough_sinew: {bind: 3},
    dry_vine: {bind: 2},
    owl_quill: {light: 2, lore: 2},
    rune_shell: {hard: 3, lore: 2},
    frost_thorn: {sharp: 2, shine: 2},
    rainbow_feather: {light: 2, shine: 2},
    wind_stone: {light: 3},
    forest_mushroom: {food: 2, vigor: 1},
    lotus_root: {food: 2, life: 2},
    sulfur: {fire: 2, venom: 1},
    // 낚시로 얻는 물고기
    fish_mackerel: {food: 1, life: 1},
    fish_flounder: {food: 1, clear: 1},
    fish_salmon: {food: 2, life: 2},
    fish_eel: {food: 2, vigor: 2},
    fish_marlin: {food: 3, vigor: 3},
    living_bark: {bind: 2, life: 2},
    wyvern_membrane: {bind: 3, light: 3},
    hydra_blood: {life: 2},
    heartwood: {life: 3},
    volcanic_ash: {vigor: 1, fire: 1},
    salamander_tail: {vigor: 1, fire: 1},
    sun_stone: {vigor: 3},
    giant_ember: {vigor: 3, fire: 3},
    star_shard: {vigor: 3},
    purify_shard: {clear: 2},
    star_fragment: {clear: 3},
    red_clay: {hard: 1},
    croc_scale: {hard: 1},
    bison_horn: {hard: 1, sharp: 1},
    bog_iron: {hard: 2},
    troll_tusk: {hard: 2},
    stone_heart: {hard: 2},
    carnem_steel: {hard: 3, sharp: 3},
    cursed_steel: {hard: 2},
    blackened_scale: {hard: 4},
    frost_heart: {hard: 3, frost: 3},
    scorpion_stinger: {sharp: 1, venom: 1},
    sharp_fang: {sharp: 2},
    obsidian: {sharp: 2},
    sandworm_tooth: {sharp: 2},
    sphinx_mane: {sharp: 3, lore: 3},
    griffin_feather: {light: 3},
    ice_shard: {light: 1, frost: 1},
    rune_stone: {lore: 1},
    old_scroll: {lore: 2},
    faded_crest: {lore: 3},
    ashen_tablet: {lore: 3, hard: 1},
    anchor_chain: {bind: 3, sharp: 2},
    archivist_cord: {bind: 4, lore: 3},
    knight_blade: {sharp: 3, lore: 1},
    royal_chronicle: {lore: 4},
    abyss_fang: {sharp: 4},
    ancient_relic: {lore: 3},
    seal_core: {lore: 3},
    brass_button: {shine: 1},
    sea_shell: {shine: 1},
    amber: {shine: 2},
    gold_ore: {shine: 2},
    rival_scale: {shine: 2},
    bog_pearl: {shine: 3},
    deep_pearl: {shine: 3},
    lost_seal: {shine: 3},
    knight_crest: {shine: 3},
    crown_shard: {shine: 3},
    fire_crystal: {fire: 3},
    magma_core: {fire: 3},
    elder_ember: {fire: 3},
    frost_lichen: {frost: 2},
    eternal_ice: {frost: 3},
    poison_herb: {venom: 1},
    toad_gland: {venom: 2},
    shadow_spore: {venom: 3},
    ashen_dust: {soul: 2},
    ghost_ash: {soul: 2},
    corrupt_crystal: {soul: 4},
    ashen_core: {soul: 4},
    basilisk_eye: {soul: 3},
    calamity_core: {soul: 3},
  },
  food: { life: 12, vigor: 10, clear: 3 },          // 성질 세기 1당 회복량 (체력·기력·정신)
  foodCap: { hp: 120, en: 60, mind: 12 },           // 보통일 때 상한
  foodCapLucky: { hp: 140, en: 70, mind: 15 },      // 좋음·빼어남일 때 상한
  foodLuck: { good: 1.15, great: 1.3 },             // 운이 좋으면 회복량 배율
  gearCap: [[5, 1], [10, 2], [15, 4], [999, 5]],    // [지혜 이하, 장신구 능력치 합의 기본 상한] (운이 없을 때는 정식 장신구보다 1점 낮음. 운이 좋아야 따라잡음)
  gearRate: 0.65,                                   // 장신구 능력치 점수 = 효능 세기 합 × 이만큼 (올림)
  statCap: 5, statCapLucky: [6, 6, 7],              // 장신구 한 능력치의 상한 (보통 · 좋음·빼어남·걸작일 때는 재료 단계 0·1·2마다). 걸작이면 여기에 +1. 넘는 점수는 두 번째 효능으로, 없으면 버려짐
  plainTopSum: 8,                                   // 장신구 능력치 합의 끝 (아래 재료가 없을 때). 재료가 있으면 그 단계만큼 더해짐 (8 · 9 · 10)
  ruinMats: { faded_crest: 1, carnem_steel: 1, ashen_core: 1, void_silk: 1, king_scale: 2, ashen_tablet: 1, anchor_chain: 1, archivist_cord: 1, knight_blade: 1, royal_chronicle: 1, abyss_fang: 1 }, // 멸망한 대륙에 들어가야만 얻는 재료: 기본 상한과 끝에 이만큼 더함 (여럿이면 가장 큰 것)
                                                    // 1단계 → 끝 9 · 2단계 → 끝 10, 한 능력치 7 (왕룡의 금빛 비늘: 멸망한 대륙 강적만 아주 드물게). 본토 오염된 땅에서도 나오는 검게 물든 비늘·오염 결정과 끼워 넣기만 하는 재료는 뺌
  luck: { good: 0.24, great: 0.06 },                // 먹을거리·선물의 좋음 · 빼어남 확률
  gearLuck: { good: 0.2, great: 0.05 },             // 장신구의 좋음(+1) · 빼어남(+2) 확률. 걸작(+1)까지 겹치면 +3
  luckMax: 3,                                       // 장신구 기본 상한 위로 운이 더할 수 있는 끝 (빼어남 2 + 걸작 1)
  en: { food: [4, 2], gear: [8, 2], gift: [4, 2] },  // 선물로 빚기도 먹는 것과 같음               // 기력: 기본 + 재료 하나당
  valueMul: 1.2,                                    // 값 = 넣은 재료값 합 × 이만큼 (좋음 1.5배 · 빼어남 2배)
  shopMatValue: 0.5,                                // 상점에서 살 수 있는 재료는 값을 이만큼만 셈 (사서 빚어 되팔아 돈을 불리지 못하게)
  chestMax: 300,                                    // 보물 상자에 간직할 수 있는 수
  failBack: 0.3,                                    // 실패하면 재료값의 이만큼을 금화로
  notes: 40, mine: 12, mineLib: 20,                 // 실험 노트 줄 수 · 내 제작법 (서고가 있으면 20)
};

const KIN_BOND = {
  curve: [[70, 1], [90, 0.5], [100, 1 / 3]],   // [이 유대까지, 오르는 비율]: 70까지는 그대로, 70~90은 절반, 90~100은 3분의 1
  dip: { stages: ['청소년', '젊은 용'], amount: 15, floor: 40 }, // 이 단계가 되면 유대가 이만큼 내려감 (이 밑으로는 안 내려감)
  gift: { min: 60, chance: 0.35, human: ['wild_flower', 'sea_shell', 'grass_seed', 'brass_button'], drake: ['glow_moss', 'sea_shell', 'beast_hide'] }, // 하루 한 번 이 확률로 작은 선물을 물어 옴
  strong: { min: 80, ally: 1.1, lean: 1.25 },   // 곁에 둔 새끼의 공격 ×1.1, 인간 아이의 재주가 1.25배 빨리 자람
};

const KIN_TOUCH = {
  cap: 4,                                   // 하루에 알맞은 교감 횟수 (넘기면 유대는 오르지 않고 과보호가 쌓임)
  bond: { like: 3, ok: 2, dislike: 0 },     // 좋아하는 것·보통·싫어하는 것일 때 오르는 유대
  boredH: 8, lonelyH: 30,                   // 교감 없이 이만큼 지나면 심심함 · 서운함
  happyH: 3,                                // 좋아하는 교감 뒤 이만큼은 신남
  night: [22, 6],                           // 이 시각(한국 시간) 사이에는 졸림
  ask: { chance: 0.1, everyH: 6, waitMin: 90, bond: 4, missH: 6 }, // 아이가 먼저 조름: 한 시간마다 확률, 최소 간격, 기다려 주는 시간, 받아 주면 더 오르는 유대, 놓치면 서운한 시간
  spoiledLoss: 2,                           // 응석받이·어리광쟁이: 하루 넘게 교감이 없으면 줄어드는 유대
  acts: {
    pat:   { name: '쓰다듬기' },
    hug:   { name: '안아 주기' },
    play:  { name: '놀아 주기' },
    story: { name: '이야기 들려주기' },
    ride:  { name: '등에 태워 주기', for: 'human' },
    fly:   { name: '함께 날기', for: 'drake' },
  },
  likes: {
    '아기':     { like: ['hug', 'pat'], dislike: [] },
    '아이':     { like: ['play', 'ride', 'hug'], dislike: [] },
    '소년':     { like: ['play', 'ride', 'story'], dislike: [] },
    '청소년':   { like: ['story', 'ride'], dislike: ['hug', 'pat'] },
    '어른':     { like: ['story'], dislike: ['pat'] },
    '노년':     { like: ['story', 'hug'], dislike: [] },
    '해츨링':   { like: ['pat', 'hug'], dislike: [] },
    '어린 용':  { like: ['pat', 'play'], dislike: [] },
    '젊은 용':  { like: ['fly', 'play'], dislike: ['hug'] },
    '다 자란 용': { like: ['fly', 'story'], dislike: ['pat', 'hug'] },
  },
  // 타고난 성격이 더 좋아하는 것 (단계보다 앞섬)
  traitLikes: { prankster: ['play'], brave: ['play', 'ride'], bookworm: ['story'], chatterbox: ['story'], lookout: ['ride'], waterbaby: ['play'],
    bold: ['play'], wild: ['play'], dreamy: ['story'], stargazer: ['story'], swift: ['fly'], windrider: ['fly'], clingy: ['hug'], lonely: ['hug'] },
};

// 인간 식구 이름 (새 아이·손주를 지을 때 둥지 식구와 겹치는 이름은 빼고 고름)
const HUMAN_NAMES = [
  '미르', '엘라', '토비', '세린', '리안', '하나', '오웬', '루카', '니나', '테오', '소이', '다온',
  '에반', '유나', '카이', '로웬', '아린', '하율', '도하', '서윤', '지안', '로아', '이레', '해솔',
  '다솜', '나린', '은비', '윤슬', '보리', '단아', '한울', '새롬', '초롱', '시온', '노아', '레아',
  '마야', '레오', '에단', '릴리', '헤나', '카라', '피오', '오린', '엘린', '루이', '미아', '제나',
  '아론', '이솔', '다인', '연우', '소담', '라희', '예솔', '온유', '별하', '수아', '채아', '리오',
  '마리', '노엘', '세아', '루나', '이로', '하진', '모아', '은호', '이도', '담희', '소율', '해든',
  '유리', '로빈', '단비', '시하', '나래', '가비',
];
// 새끼 드래곤·낯선 용 이름
const DRAKE_NAMES = [
  '아르', '벨카', '시엘', '모라크', '카이렌', '이그', '루미', '타르', '세라', '노크', '베른', '이즈',
  '아스카르', '벨리온', '카스', '드라벤', '실바', '모르', '에이라', '탈론', '바리스', '오르펜', '세렌', '칼릭스',
  '니잘', '루벨', '이그나', '아젤', '바엘', '엘로', '사르', '테노', '비렌', '하르겐', '로크', '케일',
  '미라스', '오닉스', '페일', '다르크', '소린', '알테어', '리겔', '베가', '노바', '아케르', '제피르', '라그나',
  '벨로스', '키르', '하젤', '에녹',
];

// 이벤트: 행동마다 일어날 확률 (시험 단계라 넉넉하게)
const EVENT_RULES = {
  chance: { explore: 0.3, gather: 0.15, expedition: 0.6, wake: 0.5, intimidate: 1, hunt: 0.15 },
  // 최근에 겪은 이벤트는 한동안 덜 뜸: [이만큼 지나기 전까지, 뽑힐 무게 ×] (앞에서부터 맞는 칸)
  // floor: 후보가 모두 최근 것이어도 이벤트가 일어날 확률은 원래의 이만큼 아래로는 내려가지 않음
  recent: { keep: 30, steps: [[24 * 3600000, 0.15], [72 * 3600000, 0.4], [7 * 24 * 3600000, 0.75]], floor: 0.5 },
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
  // (같은 이름을 두 번 적은 것은 원래 재료가 나오는 몫을 지키려는 것: 목록에서 고르게 하나를 뽑음)
  ruin_shore:   { common: ['ashen_dust', 'sea_shell'], uncommon: ['faded_crest', 'faded_crest', 'ashen_tablet', 'anchor_chain'], rare: ['corrupt_crystal'] },
  ruin_plain:   { common: ['ashen_dust'], uncommon: ['faded_crest', 'faded_crest', 'carnem_steel', 'carnem_steel', 'archivist_cord', 'knight_blade'], rare: ['corrupt_crystal'] },
  ruin_capital: { common: ['ashen_dust'], uncommon: ['faded_crest', 'carnem_steel'], rare: ['corrupt_crystal', 'corrupt_crystal', 'royal_chronicle'] },
  ruin_rift:    { common: ['ashen_dust'], uncommon: ['void_silk', 'blackened_scale'], rare: ['corrupt_crystal', 'corrupt_crystal', 'abyss_fang'] },
  plains:  { common: ['grass_seed', 'wild_flower'], uncommon: ['wild_honey'],   rare: ['silver_clover'] },
  capital: { common: ['brass_button'], uncommon: ['silk_scrap'],   rare: ['lost_seal'] },
  snow:    { common: ['ice_shard'],    uncommon: ['frost_lichen', 'snow_flower', 'frost_thorn'], rare: ['eternal_ice'] },
  ruins:   { common: ['rune_stone'],   uncommon: ['old_scroll', 'owl_quill'], rare: ['ancient_relic'] },
  forest:  { common: ['poison_herb', 'forest_mushroom', 'dry_vine'], uncommon: ['glow_moss', 'moss_flower'], rare: ['heartwood'] },
  swamp:   { common: ['black_reed', 'lotus_root'], uncommon: ['bog_iron'], rare: ['bog_pearl'] },
  coast:   { common: ['sea_shell', 'sea_bindweed'], uncommon: ['amber'],        rare: ['deep_pearl', 'rune_shell'] },
  canyon:  { common: ['red_clay'],     uncommon: ['gold_ore', 'wind_stone'], rare: ['sun_stone', 'rainbow_feather'] },
  volcano: { common: ['volcanic_ash', 'sulfur'], uncommon: ['obsidian'], rare: ['fire_crystal'] },
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
// 인간의 마을에서 우호·은둔 드래곤이 사람 모습으로 다닐 때의 탐사 장면 (그 밖에는 SCENES)
const SCENES_HUMAN = {
  capital: ['성문을 지나 시장 골목에 섞여 들었다.', '빵 굽는 냄새를 따라 좁은 골목을 걸었다.', '광장 분수 곁에 앉아 오가는 사람들을 구경했다.',
    '성당 종소리에 맞춰 비둘기들이 머리 위로 날아올랐다.', '대장간 앞에서 망치 소리를 한참 들었다. 대장장이가 연장 하나를 들어 보이며 자랑했다.', '골목 아이들이 낯선 나그네라며 힐끔힐끔 쳐다보았다.'],
  coast: ['어촌 선창을 거닐었다. 짠 바람에 그물 냄새가 실려 왔다.', '어부들 틈에 끼어 오늘 잡은 생선 자랑을 들었다.', '바닷가 주막 처마 밑에서 파도 소리를 들었다.', '모래톱을 맨발로 걸으며 떠밀려 온 것들을 살폈다.'],
};
const SCENES = {
  ruin_shore: ['검은 파도가 무너진 부두를 핥고 지나갔다.', '모닥불 곁에서 생존자들이 낮은 목소리로 노래를 불렀다.', '모래에 반쯤 묻힌 배의 뼈대를 발견했다.', '잿가루가 바닷바람에 실려 눈처럼 흩날렸다.', '누군가 모래 위에 그려 둔 용과 사람의 그림이 반쯤 지워져 있었다.'],
  ruin_plain: ['검게 마른 이삭이 바람에 서걱거렸다.', '허수아비 하나가 고개를 돌려 이쪽을 보는 것 같았다.', '무너진 농가의 화덕에 아직 온기가 남아 있었다.', '먼 하늘에서 뼈가 부딪히는 소리가 들렸다.', '말라붙은 우물 바닥에서 무언가가 반짝였다.'],
  ruin_capital: ['찢긴 깃발이 무너진 성벽 위에서 펄럭였다.', '광장의 분수대에는 용과 인간이 손을 맞잡은 조각상이 서 있었다.', '갑옷 부딪히는 소리가 골목 끝에서 울렸다.', '왕궁 쪽 창문 하나에 희미한 불빛이 보였다가 사라졌다.', '부서진 서고에서 탄 종이가 바람에 날렸다.'],
  ruin_rift: ['균열 아래에서 뜨겁고 축축한 바람이 올라왔다.', '발밑의 바위가 숨을 쉬듯 미세하게 떨렸다.', '어둠 속에서 누군가 이름을 부르는 것 같았다.', '균열 가장자리의 돌들이 하나둘 아래로 떨어져 사라졌다.', '머리 위로 보랏빛 번개가 소리 없이 지나갔다.'],
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
  apBase: 15,                   // 기본 최대 행동력
  apPerLevels: 5,               // 이 레벨마다 최대 행동력 +1 (5, 10, 15 …)
  hpEvery: 90 * 1000,           // 체력 1 회복 간격 (90초)
  enEvery: 2 * 60 * 1000,       // 기력 1 회복 간격 (2분)
  cost: { explore: 1, gather: 1, hunt: 2 },
  huntMinHp: 15,                // 이보다 체력이 낮으면 사냥 불가
  expeditionMinutes: [30, 60, 120, 180],
  levelMax: 25,                 // 레벨 상한
  awayMs: 3 * 24 * 60 * 60 * 1000, // 이만큼 접속하지 않은 드래곤은 잠시 자리를 비운 것으로 봄 (이곳의 드래곤 목록에서 빠지고, 동료·결투장 목록에서 흐리게)
  // 다음 레벨까지 필요한 경험치 = 레벨 × 100. xpFrom 레벨부터는 (레벨 − xpFrom) × xpStep 배만큼 더 (Lv13 ×1.5, Lv18 ×4, Lv24 ×7)
  xpFrom: 12, xpStep: 0.5,
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
// where: 'main'이면 본 대륙에서만, 'ruin'이면 멸망한 대륙에서만 (없으면 어디서나)
// 결과(ok/bad): rolls(찾는 횟수 배율), rare(귀한 물건 확률 +), gold(금화 +), xp(경험 배율), hurt(체력 비율 −), mind(정신 ±), rep(가까운 마을 평판), item(확정으로 얻는 물건), loot(지역 재료 n개 더)
const EXP_FORKS = [
  { id: 'storm', text: '하늘이 시커멓게 물들고, 폭풍이 몰려온다.',
    a: { label: '동굴로 피한다', tone: 'careful', ok: { rolls: 0.85, loot: 1, text: '동굴에서 비를 피했다. 시간은 흘렀지만, 바위틈에서 무언가를 주웠다.' } },
    b: { label: '폭풍을 뚫고 날아간다', tone: 'bold', chance: 0.6, ok: { rolls: 1.25, text: '번개 사이를 가르며 날았다. 폭풍 너머에 아무도 밟지 않은 땅이 펼쳐졌다.' }, bad: { hurt: 0.15, text: '거센 바람에 날개가 꺾여 바위에 부딪혔다.' } } },
  { id: 'tracks', text: '진흙 위로 집채만 한 발자국이 이어져 있다.', wild: true,
    a: { label: '발자국을 따라간다', tone: 'bold', chance: 0.55, ok: { trophy: 2, gold: 25, text: '발자국 끝에서 늙은 짐승의 굴을 찾았다. 싸움 끝에 전리품을 챙겼다.' }, bad: { hurt: 0.2, text: '굴의 주인은 생각보다 컸다. 겨우 빠져나왔다.' } },
    b: { label: '조용히 돌아간다', tone: 'careful', ok: { rolls: 1.1, text: '괜한 싸움을 피하고 갈 길을 서둘렀다.' } } },
  { id: 'caravan', where: 'main', text: '인간 상단의 수레바퀴가 진흙에 빠져, 상인들이 쩔쩔매고 있다.',
    a: { label: '수레를 들어 올려 준다', tone: 'kind', ok: { rep: 6, gold: 15, text: '수레를 번쩍 들어 올려 주었다. 상인들이 놀라더니 감사의 표시로 금화를 건넸다.' } },
    b: { label: '겁을 줘 짐을 빼앗는다', tone: 'cruel', ok: { rep: -10, gold: 60, text: '포효 한 번에 상인들이 짐을 버리고 달아났다.' } } },
  { id: 'glow', text: '바위틈에서 검붉은 빛이 새어 나온다. 손끝이 저릿하다.',
    a: { label: '파고든다', tone: 'bold', chance: 0.5, ok: { rare: 0.25, loot: 1, text: '빛의 근원에서 귀한 것을 캐냈다.' }, bad: { mind: -12, text: '빛이 머릿속을 파고들었다. 한참 동안 귀가 울렸다.' } },
    b: { label: '지나친다', tone: 'careful', ok: { rolls: 1.1, text: '불길한 빛을 멀리하고 날개를 돌렸다.' } } },
  { id: 'cub', where: 'main', text: '다리를 다친 어린 짐승이 덤불 아래 웅크려 떨고 있다.', wild: true,
    a: { label: '상처를 핥아 준다', tone: 'kind', ok: { mind: 15, xp: 1.2, text: '상처를 핥아 주자 어린 짐승이 비틀비틀 숲으로 돌아갔다. 마음이 따뜻해졌다.' } },
    b: { label: '먹이로 삼는다', tone: 'cruel', ok: { hurt: -0.15, text: '배를 채우고 나니 힘이 솟았다.' } } },
  { id: 'stairs', text: '무너진 탑 아래, 땅속으로 이어진 계단이 보인다.',
    a: { label: '계단을 내려간다', tone: 'bold', chance: 0.45, ok: { item: 'ancient_relic', text: '어둠 속 제단 위에 고대의 유물이 놓여 있었다.' }, bad: { rolls: 0.75, text: '끝없는 통로에서 한참을 헤매다 겨우 빠져나왔다.' } },
    b: { label: '위에서 둘러본다', tone: 'careful', ok: { item: 'rune_stone', loot: 1, text: '무너진 돌 사이에서 룬이 새겨진 돌을 골라냈다.' } } },
  { id: 'river', where: 'main', text: '불어난 강물이 길을 막았다.',
    a: { label: '헤엄쳐 건넌다', tone: 'bold', ok: { rolls: 1.15, hurt: 0.08, text: '거센 물살에 휩쓸릴 뻔했지만 건너편에 닿았다.' } },
    b: { label: '물이 빠질 때까지 기다린다', tone: 'careful', ok: { rolls: 0.9, xp: 1.15, text: '강가에 앉아 물살을 바라보며 많은 것을 생각했다.' } } },
  { id: 'rival', text: '낯선 드래곤 한 마리가 먼저 와서 이 땅을 뒤지고 있다.',
    a: { label: '위협해 쫓아낸다', tone: 'cruel', chance: 0.6, ok: { rolls: 1.3, text: '이빨을 드러내자 낯선 드래곤이 물러났다. 이 땅은 이제 나의 것이다.' }, bad: { hurt: 0.15, rolls: 0.9, text: '상대도 만만치 않았다. 서로 상처만 남기고 갈라섰다.' } },
    b: { label: '함께 뒤지자고 청한다', tone: 'kind', ok: { loot: 1, xp: 1.1, text: '둘이 함께 뒤지니 더 많은 것이 보였다. 헤어질 때 서로 고개를 끄덕였다.' } } },
  // 멸망한 대륙에서만
  { id: 'ruin_cry', where: 'ruin', text: '무너진 집 안에서 누군가 숨죽여 우는 소리가 들린다.',
    a: { label: '잔해를 치워 본다', tone: 'kind', ok: { mind: 12, xp: 1.15, text: '잔해 밑에서 다친 떠돌이를 꺼내 주었다. 그는 몇 번이고 고개를 숙이고는 바다 쪽으로 걸어갔다.' } },
    b: { label: '못 들은 척 지나간다', tone: 'careful', ok: { rolls: 1.1, text: '…바람 소리였을 것이다. 날개를 재촉했다.' } } },
  { id: 'ruin_cart', where: 'ruin', text: '재에 반쯤 묻힌 피난민의 수레가 길을 막고 있다. 주인은 오래전에 떠난 듯하다.',
    a: { label: '짐칸을 뒤진다', tone: 'bold', chance: 0.6, ok: { loot: 1, gold: 30, text: '재를 털어 내자 미처 챙기지 못한 짐들이 나왔다.' }, bad: { mind: -10, text: '짐칸에서 한 가족의 초상화가 나왔다. 한동안 마음이 무거웠다.' } },
    b: { label: '수레를 길가로 치워 둔다', tone: 'kind', ok: { mind: 8, xp: 1.15, text: '수레를 길가에 가지런히 옮겨 두었다. 언젠가 누군가 돌아와 찾을지도 모른다.' } } },
  { id: 'ruin_spring', where: 'ruin', text: '검게 물든 샘 한가운데에서 아직 맑은 물줄기 하나가 솟고 있다.',
    a: { label: '맑은 물을 마신다', tone: 'bold', chance: 0.6, ok: { hurt: -0.12, mind: 10, text: '차가운 물이 목을 타고 내려가자 머리가 맑아졌다.' }, bad: { mind: -10, text: '맑아 보였던 물에서 쇠 맛이 났다. 한참 속이 뒤집혔다.' } },
    b: { label: '샘 둘레의 오염을 걷어 낸다', tone: 'careful', ok: { xp: 1.2, rolls: 0.9, text: '검은 이끼를 걷어 내자 물줄기가 조금 굵어졌다.' } } },
];
// 2시간 이상 원정을 끝까지 다녀오면: 별똥별 조각 (멸망한 대륙이면 잿빛 심장도 가끔)
const EXP_LONG = { from: 120, star: { 120: 0.35, 180: 0.6 }, second: 0.2, ruinCore: 0.3 };
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
  // 지하 회랑 개척자: 그 층의 봉인이 풀린 날 수호자를 치거나 기둥을 밝힌 이 (maze.js)
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `maze_f${n}`, name: `제 ${n}층의 개척자`, cond: { count: `mazef${n}`, at: 1 }, mod: {}, eff: `지하 회랑 제 ${n}층의 봉인을 함께 풀었다` })),
  { id: 'maze_city', name: '고대도시의 문을 연 자', cond: { count: 'mazecity', at: 1 }, mod: { xp: 1.03 }, eff: '경험치 +3%' },
  { id: 'lord_canyon',  name: '협곡의 맹금',     cond: { count: 'huntwin:canyon', at: 30 },  mod: { region: 'canyon',  atk: 1.08, taken: 0.92 }, eff: '태양 협곡에서 공격 +8%, 받는 피해 −8%' },
  { id: 'lord_volcano', name: '불꽃을 걷는 자',  cond: { count: 'huntwin:volcano', at: 30 }, mod: { region: 'volcano', atk: 1.08, taken: 0.92 }, eff: '잿빛 화산에서 공격 +8%, 받는 피해 −8%' },
  // 강적
  { id: 'elite1',    name: '강적 사냥꾼',       cond: { count: 'elite', at: 5 },     mod: { eliteAtk: 1.06 }, eff: '강적과 싸울 때 공격 +6%' },
  { id: 'elite2',    name: '전설을 쓰러뜨린 자', cond: { count: 'elite', at: 30 },   mod: { eliteAtk: 1.1, drop: 0.05 }, eff: '강적과 싸울 때 공격 +10%, 전리품 +5%' },
  // 모으기·떠돌기
  { id: 'gatherer',  name: '약초를 아는 발톱', cond: { count: 'gather', at: 60 },   mod: { heal: 1.15 },     eff: '치유 +15%' },
  { id: 'gatherer2', name: '부지런한 발톱', cond: { count: 'gather', at: 200 }, mod: { gatherExtra: 0.1 }, eff: '채집에서 물건을 하나 더 찾을 확률 +10%' },
  { id: 'gatherer3', name: '땅을 읽는 자', cond: { count: 'gather', at: 500 }, mod: { gatherExtra: 0.1, gatherRare: 0.02 }, eff: '채집에서 물건을 하나 더 찾을 확률 +10%, 귀한 물건 +2%' },
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
  // 왕도 축제
  { id: 'dancer',    name: '축제의 춤꾼',       cond: { count: 'dance', at: 3 },     mod: { mindWard: 0.9 },  eff: '깎이는 정신 −10%' },
  // 관계
  { id: 'teacher',   name: '이름난 스승',      cond: { count: 'teach', at: 20 },    mod: { xp: 1.03 },       eff: '경험치 +3%' },
  { id: 'surpass',   name: '청출어람',         cond: { count: 'surpass', at: 1 },   mod: { atk: 1.03 },      eff: '사냥 공격 +3%' },
  // 이어받은 의지
  { id: 'pioneer',   name: '새 길을 연 발톱',   cond: { count: 'firstcraft', at: 1 }, mod: { craftEn: 0.9 }, eff: '제작 기력 −10%' },
  { id: 'masterwork', name: '걸작의 장인',     cond: { count: 'masterwork', at: 5 }, mod: { craftGreat: 0.05 }, eff: '제작 대성공 +5%' },
  // 모브 드래곤
  { id: 'errand',    name: '용족의 해결사',     cond: { count: 'mobquest', at: 15 }, mod: { mobGold: 1.2 }, eff: '모브 드래곤 의뢰 금화 +20%' },
  { id: 'lorekeeper', name: '옛이야기를 들은 용', cond: { count: 'mobstory', at: 3 }, mod: { xp: 1.05 }, eff: '경험치 +5%' },
  { id: 'voidwalker', name: '어둠을 걷는 자',  cond: { count: 'corrupt', at: 100 }, mod: { mindWard: 0.85 }, eff: '깎이는 정신 −15%' },
  { id: 'cleanser',  name: '오염을 걷어 낸 자', cond: { count: 'purify', at: 1 },     mod: { xp: 1.03 },       eff: '경험치 +3%' },
  { id: 'heir',      name: '의지를 이은 자',   cond: { count: 'heir', at: 1 },      mod: { xp: 1.05 },       eff: '경험치 +5%' },
  { id: 'sendoff',   name: '둥지를 떠나보낸 자', cond: { count: 'sendoff', at: 3 }, mod: { xp: 1.03 },     eff: '경험치 +3%' },
  // 대륙의 재앙
  { id: 'boss1',     name: '재앙에 맞선 자',   cond: { count: 'bosswin', at: 1 },   mod: { eliteAtk: 1.04 }, eff: '강적과 싸울 때 공격 +4%' },
  { id: 'boss2',     name: '대륙의 방패',      cond: { count: 'bosswin', at: 10 },  mod: { atk: 1.04, taken: 0.97 }, eff: '사냥 공격 +4%, 받는 피해 −3%' },
  { id: 'bosslast',  name: '재앙을 끝낸 자',   cond: { count: 'bosslast', at: 1 },  mod: { eliteAtk: 1.06 }, eff: '강적과 싸울 때 공격 +6%' },
  // 레이드 (raidboss.js)
  { id: 'morven1',   name: '첫 추수',         cond: { count: 'raidwin_morven', at: 1 },  mod: { taken: 0.98 }, eff: '받는 피해 −2%' },
  { id: 'morven10',  name: '이삭을 거둔 자',   cond: { count: 'raidwin_morven', at: 10 }, mod: { atk: 1.04 },   eff: '사냥 공격 +4%' },
  { id: 'raidguard', name: '막아선 비늘',      cond: { count: 'raidguard', at: 20 },      mod: { taken: 0.97 }, eff: '받는 피해 −3%' },
  // 에레보스 정화도에 쌓은 내 기여 (멸망한 대륙에서 사냥·탐사·레이드 등으로 쌓임)
  { id: 'ruin1',     name: '잿빛 땅의 길손',     cond: { count: 'ruinpts', at: 1000 }, mod: { taken: 0.98 },    eff: '받는 피해 −2%' },
  { id: 'ruin2',     name: '오염을 걷는 자',     cond: { count: 'ruinpts', at: 3000 }, mod: { eliteAtk: 1.03 }, eff: '강적과 싸울 때 공격 +3%' },
  { id: 'ruin3',     name: '에레보스의 정화자',  cond: { count: 'ruinpts', at: 8000 }, mod: { atk: 1.05 },      eff: '사냥 공격 +5%' },
  { id: 'heiron1',   name: '성문의 증인',       cond: { count: 'raidwin_heiron', at: 1 },  mod: { taken: 0.98 }, eff: '받는 피해 −2%' },
  { id: 'heiron10',  name: '기사단을 쉬게 한 자', cond: { count: 'raidwin_heiron', at: 10 }, mod: { atk: 1.04 },   eff: '사냥 공격 +4%' },
  { id: 'raidflank', name: '대열을 깬 날개',     cond: { count: 'raidflank', at: 15 },      mod: { eliteAtk: 1.04 }, eff: '강적과 싸울 때 공격 +4%' },
  { id: 'raidduel',  name: '일기토의 맞수',      cond: { count: 'raidduel', at: 5 },        mod: { taken: 0.97 }, eff: '받는 피해 −3%' },
  { id: 'raidhelp',  name: '들판의 길잡이',    cond: { count: 'raidhelp', at: 10 },       mod: { huntGold: 1.05 }, eff: '사냥 금화 +5%' },
  // 보물더미
  { id: 'hoard1',    name: '보물을 품은 자',   cond: { hoard: 2000 },               mod: { mindWard: 0.9 },  eff: '깎이는 정신 −10%' },
  { id: 'hoard2',    name: '황금 산의 주인',   cond: { hoard: 5000 },               mod: { huntGold: 1.1, mindWard: 0.9 }, eff: '사냥 금화 +10%, 깎이는 정신 −10%' },
  { id: 'keeper',    name: '보물 지킴이',      cond: { count: 'raidwin', at: 3 },   mod: { atk: 1.03 },      eff: '사냥 공격 +3%' },
  { id: 'scarred',   name: '상흔투성이',       cond: { scars: 3 },                  mod: { taken: 0.95 },    eff: '사냥 받는 피해 −5%' },
  // 떠돌이 야바위꾼: 서로 다른 때 나타난 야바위꾼에게 말 걸기 / 홀짝 판 수
  { id: 'yb_regular', name: '야바위꾼의 단골', cond: { count: 'yabawimeet', at: 5 }, mod: {}, eff: '달고 있으면 떠돌이 야바위꾼이 소문을 들려준다' },
  { id: 'yb_gambler', name: '홀짝의 귀재', cond: { count: 'yabawi', at: 30 }, mod: { huntGold: 1.05 }, eff: '사냥 금화 +5%' },
];
// 칭호 조건을 사람이 읽는 글로
const TITLE_COUNT_NAMES = { huntwin: '사냥에서 {n}번 이기기', elite: '강적 {n}마리 쓰러뜨리기', gather: '채집 {n}번', explore: '탐사 {n}번', expedition: '원정 {n}번', trade: '시장 거래 {n}번', rest: `둥지에서 {n}번 쉬기 (한 번에 ${NEST.restCountMin}분 이상)`, craft: '물건 {n}개 만들기', rescue: '쓰러진 드래곤 {n}번 일으키기', healother: '다른 드래곤 {n}번 치유하기', calm: '광폭화 {n}번 진정시키기', raidwin: '보물 도둑 {n}번 물리치기', bosswin: '대륙의 재앙 {n}번 쓰러뜨리기', bosslast: '대륙의 재앙에게 마지막 일격', raidwin_morven: '레이드에서 이삭지기 모르벤을 {n}번 쓰러뜨리기', raidguard: '레이드에서 막아서기로 동료를 {n}번 지키기', raidhelp: '보상을 다 받은 주에 레이드를 {n}번 도와 이기기', ruinpts: '에레보스 정화도에 {n}만큼 기여하기', raidwin_heiron: '레이드에서 마지막 기사단장 헤이른을 {n}번 쓰러뜨리기', raidflank: '레이드에서 우회로 방패벽을 {n}번 깨기', raidduel: '레이드에서 일기토를 {n}번 끝까지 버티기', heir: '먼 여행을 떠난 드래곤의 의지를 잇기', teach: '제자를 {n}번 가르치기', surpass: '스승의 레벨을 따라잡기', sendoff: '다 자란 식구를 {n}번 떠나보내기', corrupt: '오염된 땅에서 {n}번 행동하기', purify: '오염된 땅을 {n}번 정화하기', firstcraft: '숨겨진 제작법을 대륙에서 처음 찾아내기', masterwork: '대성공 {n}번', mobquest: '모브 드래곤의 의뢰 {n}번 마치기', mobstory: '모브 드래곤의 이야기 {n}개를 끝까지 듣기', yabawimeet: '떠돌이 야바위꾼을 {n}번 만나기 (나타날 때마다 한 번)', yabawi: '야바위꾼과 홀짝 {n}판', dance: '왕도 축제에서 {n}번 춤추기', ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [`mazef${n}`, `지하 회랑 제 ${n}층의 봉인이 풀린 날 수호자를 치거나 기둥을 밝히기`])), mazecity: '지하 회랑 일곱 층을 모두 밝힌 날 함께하기' };

// ── 장소와 사냥터 난이도 ───────────────────────────
// 야생 지역마다 장소가 넷. 입구는 쉽고 안쪽일수록 사냥터 난이도가 높다 (셋째까지 Lv.1~12, 넷째는 고레벨 구역 Lv.13~24).
// 지역으로 날아오면 첫 장소(입구)에 내려앉고, 같은 지역 안에서는 행동력 없이 옮겨 다닌다.
// creature: 사냥감, elite: 강적, weak/resist: 약점·저항 속성, special: 특기 (power 피해 배율, hits 연타, debuff 상태 이상, self 자기 강화)
const PLACES = {
  plains_field:  { region: 'plains',  name: '풀밭',         level: 1,  creature: '들소 떼', type: 'beast',       elite: '뿔 꺾인 들소왕',     weak: ['poison'], resist: [], special: { name: '돌진', power: 1.6 },
    desc: '바람에 눕는 풀이 끝없이 이어진다. 들소 떼가 느긋하게 풀을 뜯는다.' },
  plains_hill:   { region: 'plains',  name: '바람 언덕',    level: 2,  creature: '회색 늑대', type: 'beast',     elite: '외눈 늑대왕',        weak: ['fire', 'earth', 'poison'], resist: [], special: { name: '무리 사냥', power: 0.65, hits: 2 },
    desc: '언덕 꼭대기에서 바람이 울부짖는다. 바위 그늘마다 늑대의 눈이 번뜩인다.' },
  plains_war:    { region: 'plains',  name: '옛 전장',      level: 3,  creature: '떠도는 망령', type: 'ghost',   elite: '녹슨 기사의 망령',   weak: ['fire', 'lightning', 'spirit'], resist: ['poison'], special: { name: '저주', power: 0.6, debuff: { weaken: 2 } },
    desc: '부러진 창과 녹슨 투구가 풀숲에 묻혀 있다. 해가 지면 무언가가 일어선다.' },
  forest_edge:   { region: 'forest',  name: '숲 가장자리',  level: 2,  creature: '거대 거미', type: 'bug',     elite: '여왕 거미',          weak: ['fire'], resist: [], special: { name: '거미줄', power: 0.5, debuff: { stun: 1 }, chance: 0.45 },
    desc: '나무 사이로 끈적한 거미줄이 햇빛에 반짝인다.' },
  forest_valley: { region: 'forest',  name: '독안개 골짜기', level: 4, creature: '독두꺼비', type: 'reptile',      elite: '부풀어 오른 두꺼비왕', weak: ['fire', 'ice'], resist: ['poison'], special: { name: '독액', power: 0.8, debuff: { poison: 3 } },
    desc: '초록 안개가 낮게 깔린 골짜기. 숨을 들이쉴 때마다 목이 따끔하다.' },
  forest_heart:  { region: 'forest',  name: '고목의 심장',  level: 6,  creature: '나무 수호자', type: 'spirit',   elite: '천 년 고목의 정령',  weak: ['fire', 'acid', 'poison'], resist: ['lightning'], special: { name: '뿌리 감기', power: 0.7, debuff: { stun: 1 }, chance: 0.5 },
    desc: '숲 한가운데 하늘을 가린 고목이 있다. 뿌리가 숨을 쉬듯 꿈틀거린다.' },
  swamp_reeds:   { region: 'swamp',   name: '갈대밭',       level: 3,  creature: '늪 악어', type: 'reptile',       elite: '늪의 늙은 악어',     weak: ['lightning'], resist: ['acid', 'water'], special: { name: '물어 끌기', power: 1.5 },
    desc: '검은 갈대가 사람 키보다 높이 자랐다. 물속에서 커다란 눈이 떠올랐다 가라앉는다.' },
  swamp_village: { region: 'swamp',   name: '가라앉은 마을', level: 5, creature: '늪 망령', type: 'ghost',       elite: '물에 잠긴 촌장의 망령', weak: ['fire', 'lightning', 'spirit'], resist: ['poison', 'ice'], special: { name: '울부짖음', power: 0.5, debuff: { weaken: 3 } },
    desc: '지붕만 남은 집들이 늪 위로 솟아 있다. 밤마다 종소리가 들린다고 한다.' },
  swamp_mire:    { region: 'swamp',   name: '검은 수렁',    level: 7,  creature: '작은 히드라', type: 'reptile',   elite: '머리 셋 달린 히드라', weak: ['fire'], resist: ['poison', 'acid', 'water'], special: { name: '세 머리 물기', power: 0.55, hits: 3 },
    desc: '빠지면 다시는 올라오지 못한다는 수렁. 거품 사이로 비늘 덮인 목들이 솟는다.' },
  snow_field:    { region: 'snow',    name: '눈벌판',       level: 2,  creature: '설원 늑대', type: 'beast',     elite: '서리 늑대 우두머리', weak: ['fire', 'poison'], resist: ['ice'], special: { name: '무리 사냥', power: 0.65, hits: 2 },
    desc: '눈보라가 지나간 뒤 세상이 고요하다. 눈 위에 발자국이 어지럽게 찍혀 있다.' },
  snow_cave:     { region: 'snow',    name: '얼음 동굴',    level: 5,  creature: '얼음 트롤', type: 'giant',     elite: '서리 트롤 족장',     weak: ['fire', 'lightning', 'poison'], resist: ['ice', 'water'], special: { name: '얼음 몽둥이', power: 1.4, debuff: { freeze: 1 }, chance: 0.3, element: 'ice' },
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
  canyon_cliff:  { region: 'canyon',  name: '황금 절벽',    level: 10, creature: '그리핀', type: 'bird',        elite: '태양을 등진 그리핀왕', weak: ['ice', 'lightning', 'earth', 'poison'], resist: ['fire'], special: { name: '급강하', power: 1.6 },
    desc: '절벽 꼭대기 둥지에 금빛 깃털이 흩날린다. 드래곤에게도 물러서지 않는 짐승이 산다.' },
  volcano_slope: { region: 'volcano', name: '잿빛 비탈',    level: 4,  creature: '화염 도마뱀', type: 'reptile',   elite: '용암 도롱뇽 군주',   weak: ['ice', 'water'], resist: ['fire'], special: { name: '불 뿜기', power: 0.9, debuff: { burn: 3 }, element: 'fire' },
    desc: '잿가루가 눈처럼 날린다. 굳은 용암 사이로 도마뱀들이 빠르게 숨는다.' },
  volcano_cave:  { region: 'volcano', name: '용암 동굴',    level: 8,  creature: '용암 골렘', type: 'construct',     elite: '녹아내린 대장장이의 골렘', weak: ['ice', 'water'], resist: ['fire', 'poison'], special: { name: '용암 주먹', power: 1.3, debuff: { burn: 3 }, element: 'fire' },
    desc: '붉은 빛이 동굴 벽을 핥는다. 땅 밑에서 무언가 거대한 것이 걸어 다닌다.' },
  volcano_crater:{ region: 'volcano', name: '분화구',       level: 12, creature: '화염 거인', type: 'giant', eliteType: 'ghost',     elite: '잠든 화룡의 망령',   weak: ['ice', 'water'], resist: ['fire'], special: { name: '화산 강타', power: 1.8, debuff: { burn: 3 }, element: 'fire' },
    desc: '대륙에서 가장 뜨거운 곳. 끓는 용암 위로 오래전 쓰러진 드래곤의 뼈가 보인다.' },  // ── 고레벨 구역 (지역마다 넷째 장소) ──
  plains_keep:   { region: 'plains',  name: '무너진 성채',  level: 13, creature: '용사냥 기사단', type: 'thief', elite: '은빛 투구의 기사단장', weak: ['lightning', 'acid', 'poison'], resist: ['mist'], special: { name: '작살 쇠뇌', power: 1.5, debuff: { bleed: 3 } },
    desc: '용을 사냥하려고 인간들이 쌓은 성채. 무너진 성벽 위로 아직 기사단 깃발이 나부낀다.' },
  forest_root:   { region: 'forest',  name: '그늘진 뿌리굴', level: 14, creature: '썩은 뿌리 괴물', type: 'spirit', elite: '빛을 먹는 숲의 어미', weak: ['fire', 'spirit'], resist: ['poison', 'earth', 'water'], special: { name: '포자 폭발', power: 0.9, debuff: { poison: 4 } },
    desc: '고목의 뿌리 아래로 이어진 어두운 굴. 썩은 냄새와 함께 희미한 포자가 떠다닌다.' },
  swamp_abyss:   { region: 'swamp',   name: '늪의 심연',    level: 16, creature: '검은 바실리스크', type: 'reptile', elite: '눈먼 바실리스크 여왕', weak: ['lightning', 'spirit'], resist: ['poison', 'acid', 'water'], special: { name: '석화의 눈', power: 0.8, debuff: { stun: 1 }, chance: 0.4 },
    desc: '수렁보다 더 깊이 가라앉은 곳. 돌이 된 짐승들이 진흙 속에 서 있다.' },
  snow_glacier:  { region: 'snow',    name: '영원의 빙하',  level: 18, creature: '빙하 거인', type: 'giant', elite: '겨울을 부르는 서리 거인왕', weak: ['fire', 'lightning'], resist: ['ice', 'water', 'earth'], special: { name: '빙하 붕괴', power: 1.6, debuff: { freeze: 1 }, chance: 0.35, element: 'ice' },
    desc: '천 년 동안 녹지 않은 얼음 강. 얼음 속에 거인들의 그림자가 잠들어 있다.' },
  canyon_temple: { region: 'canyon',  name: '모래에 묻힌 신전', level: 20, creature: '사막 스핑크스', type: 'beast', elite: '수수께끼를 잊은 스핑크스왕', weak: ['ice', 'water', 'poison'], resist: ['fire', 'lightning'], special: { name: '태양 광선', power: 1.4, debuff: { burn: 3 }, element: 'fire' },
    desc: '협곡 끝 모래 속에서 드러난 황금 신전. 입구를 지키는 짐승이 낯선 이에게 수수께끼를 낸다.' },
  ruins_vault:   { region: 'ruins',   name: '잊힌 왕의 금고', level: 22, creature: '저주받은 근위대', type: 'ghost', elite: '이름 잃은 왕', weak: ['fire', 'spirit'], resist: ['poison', 'ice', 'earth'], special: { name: '왕의 저주', power: 1.1, debuff: { weaken: 3 } },
    desc: '봉인된 제단 아래 숨겨진 금고. 죽어서도 보물을 지키는 근위대가 문 앞에 늘어서 있다.' },
  volcano_core:  { region: 'volcano', name: '불의 심장부',  level: 24, creature: '용암 와이번', type: 'flyer', eliteType: 'ghost', elite: '불을 삼킨 고룡의 그림자', weak: ['ice', 'water'], resist: ['fire', 'earth'], special: { name: '불바다', power: 1.5, debuff: { burn: 4 }, element: 'fire' },
    desc: '분화구 아래, 대륙의 불이 시작되는 곳. 오래전 이곳에서 쓰러진 고룡의 기운이 아직 맴돈다.' },
  // ── 멸망한 대륙: 모든 사냥감이 오염되어 있음 (이름 앞에 '오염된'이 붙음). hpMul: 체력 배율 ──
  ruin_pier:     { region: 'ruin_shore', name: '부서진 부두', level: 21, hpMul: 1.7, creature: '어부 무리', type: 'human', elite: '바다에 삼켜진 선장', weak: ['fire', 'lightning', 'poison'], resist: ['water'], special: { name: '녹슨 작살', power: 1.2, debuff: { bleed: 3 } },
    desc: '썩은 판자가 반쯤 물에 잠긴 부두. 그물을 든 사람들이 아직도 고기를 잡는 시늉을 한다.' },
  ruin_flats:    { region: 'ruin_shore', name: '잿빛 모래톱', level: 22, hpMul: 1.8, creature: '껍질 게', type: 'bug', elite: '모래톱의 거대 집게', weak: ['lightning', 'earth'], resist: ['water', 'ice'], special: { name: '부수는 집게', power: 1.5 },
    desc: '잿가루가 섞인 검은 모래. 밟을 때마다 껍질이 부서지는 소리가 난다.' },
  ruin_field:    { region: 'ruin_plain', name: '시든 밀밭', level: 23, hpMul: 1.9, creature: '농부 무리', type: 'human', eliteType: 'construct', elite: '허수아비 군주', weak: ['fire', 'poison'], resist: ['earth'], special: { name: '낫질', power: 1.0, hits: 2 },
    desc: '검게 마른 이삭 사이로 낫을 든 그림자들이 천천히 걸어 다닌다.' },
  ruin_river:    { region: 'ruin_plain', name: '말라붙은 강바닥', level: 24, hpMul: 2.0, creature: '뼈 와이번', type: 'flyer', elite: '뼈만 남은 와이번 왕', weak: ['spirit', 'fire'], resist: ['poison', 'ice'], special: { name: '썩은 숨결', power: 1.0, debuff: { poison: 2 } },
    desc: '강이 흐르던 자리에 갈라진 진흙만 남았다. 하늘에서 뼈가 부딪히는 소리가 들린다.' },
  ruin_gate:     { region: 'ruin_capital', name: '무너진 성문', level: 25, hpMul: 2.1, creature: '기사단', type: 'human', elite: '마지막 기사단장', weak: ['lightning', 'spirit'], resist: ['earth'], special: { name: '돌격 대열', power: 1.4, debuff: { weaken: 2 } },
    desc: '부서진 성문 앞에 갑옷을 입은 기사들이 아직 대열을 지키고 서 있다.' },
  ruin_throne:   { region: 'ruin_capital', name: '왕좌의 회랑', level: 26, hpMul: 2.2, creature: '왕궁의 드래곤', type: 'drake', elite: '카르넴의 왕룡', weak: ['spirit', 'ice'], resist: ['fire'], special: { name: '검게 탄 숨결', power: 1.6, debuff: { burn: 3 }, element: 'fire' },
    desc: '왕좌로 이어지는 긴 회랑. 왕을 지키던 용들이 검게 물든 비늘로 기둥을 감고 있다.' },
  ruin_edge:     { region: 'ruin_rift', name: '균열 가장자리', level: 27, hpMul: 2.3, creature: '공허의 망령', type: 'ghost', elite: '이름을 잃은 것', weak: ['spirit', 'lightning'], resist: ['poison', 'earth', 'ice'], special: { name: '공허의 속삭임', power: 1.2, debuff: { weaken: 3 } },
    desc: '발밑이 끝없는 어둠으로 이어진다. 가장자리에 선 망령들이 아래를 내려다보고 있다.' },
  ruin_abyss:    { region: 'ruin_rift', name: '심연의 문턱', level: 28, hpMul: 2.5, creature: '고룡', type: 'drake', elite: '심연에 삼켜진 고룡', weak: ['spirit'], resist: ['fire', 'poison', 'earth', 'ice'], special: { name: '심연의 포효', power: 1.8, debuff: { stun: 1 }, chance: 0.4 },
    desc: '균열 아래로 내려가는 마지막 바위턱. 이 대륙을 멸망시킨 것의 숨결이 여기까지 올라온다.' },
};
// 장소별 사냥 전리품
const PLACE_DROPS = {'plains_keep': 'knight_crest', 'forest_root': 'shadow_spore', 'swamp_abyss': 'basilisk_eye', 'snow_glacier': 'frost_heart', 'canyon_temple': 'sphinx_mane', 'ruins_vault': 'crown_shard', 'volcano_core': 'elder_ember', 'plains_field': 'bison_horn', 'plains_hill': 'wolf_pelt', 'plains_war': 'ghost_ash', 'forest_edge': 'spider_silk', 'forest_valley': 'toad_gland', 'forest_heart': 'living_bark', 'swamp_reeds': 'croc_scale', 'swamp_village': 'ghost_ash', 'swamp_mire': 'hydra_blood', 'snow_field': 'wolf_pelt', 'snow_cave': 'troll_tusk', 'snow_peak': 'wyvern_membrane', 'ruins_hall': 'stone_heart', 'ruins_crypt': 'cursed_steel', 'ruins_altar': 'seal_core', 'canyon_path': 'scorpion_stinger', 'canyon_storm': 'sandworm_tooth', 'canyon_cliff': 'griffin_feather', 'volcano_slope': 'salamander_tail', 'volcano_cave': 'magma_core', 'volcano_crater': 'giant_ember'};
for (const [id, p] of Object.entries(PLACES)) { p.id = id; p.drop = PLACE_DROPS[id] || (p.region.startsWith('ruin_') ? 'purify_shard' : undefined); }
// 지역별 장소 (입구 → 안쪽)
const REGION_PLACES = {};
for (const p of Object.values(PLACES)) (REGION_PLACES[p.region] ||= []).push(p.id);
for (const ids of Object.values(REGION_PLACES)) ids.sort((a, b) => PLACES[a].level - PLACES[b].level);
const PLACE_RULES = {
  tooHard: 3,          // 내 레벨 + 이만큼보다 어려운 장소에는 들어갈 수 없음
  moveCooldown: 1200,  // 장소를 옮기는 간격 (ms)
  lootPerLevel: { uncommon: 0.012, rare: 0.005 }, // 깊은 장소일수록 귀한 재료가 잘 나옴 (사냥터 Lv.1당)
  sinewChance: 0.08,   // 사냥감을 쓰러뜨릴 때마다 질긴 힘줄이 나올 확률 (어디서든, 무리에 섞인 어린 것은 빼고)
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
  helpPerDay: 2,               // 한 드래곤이 남의 도움으로 일어설 수 있는 횟수 (한국 날짜 기준 하루)
};

// ── 정신과 오염 ────────────────────────────────────
// 오염된 땅(야생 지역 하나, 하루마다 옮겨 감)과 오염된 몬스터가 정신을 깎는다. 정신이 0이 되면 광폭화
const MIND = {
  max: 100,
  regenEvery: 3 * 60 * 1000,   // 정신 1이 차는 간격 (둥지에서 쉬면 3배, 은둔이면 1.3배 빠름)
  restMult: 3, hermitMult: 1.3,
  rotateMs: 24 * 60 * 60 * 1000, // 오염된 땅이 옮겨 가는 간격 (24시간마다 새 곳에 오염이 생김)
  drain: { explore: 5, gather: 4, hunt: 0, expedition: 2 }, // 오염된 땅에서 행동할 때 깎이는 정신 (원정은 10분마다). 사냥은 몬스터가 깎음
  monster: 0.5,                // 오염된 몬스터가 입힌 피해의 이만큼 정신도 깎임
  monsterMax: 30,              // 몬스터가 한 번의 싸움에서 깎는 정신의 최대 (멸망한 대륙의 질긴 몸과 땅의 배율이 겹쳐도 이 위로는 깎이지 않음. 정신 보호는 여기에 다시 곱해 줄여 줌)
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
  // 오염된 땅의 보상
  reward: { xp: 1.5, gold: 1.5 },                             // 오염된 사냥감·강적: 경험치·금화 배율
  scale: { explore: 0.12, gather: 0.15, hunt: 0.25, elite: 2 }, // 검게 물든 비늘이 나올 확률 (강적은 개수)
  legend: { item: 'abyss_crown', chance: 0.08 },               // 오염된 강적이 떨어뜨리는 전설 장신구
};
// 제작을 더 재미있게: 대성공, 실험, 장신구 강화·각인, 마을 의뢰, 둥지 공방
const CRAFT = {
  // 대성공 확률 = 기본 + 지혜 × 지혜당 + 제작 횟수 / 횟수당(최대 countMax) + 공방 + 대장장이 식구 + 칭호 + 불 조절(미니게임)
  great: { base: 0.08, perWis: 0.004, perCount: 500, countMax: 0.08, forge: 0.03, smith: 0.05, cap: 0.6, focus: [[0.85, 0.25], [0.55, 0.1]] },
  experiment: { en: 4 },                  // 실험에 드는 기력 (고른 재료는 하나씩 사라짐)
  scrollChance: { explore: 0.04, elite: 0.1 }, // 바랜 제작서가 나올 확률
  // 장신구 강화: 단계마다 성공 확률·재료·금화. 실패하면 재료와 금화만 사라짐. 한 단계마다 그 장신구의 주 능력치 +1
  // 단계 수가 곧 최대 강화 (지금 +2). 줄을 더하면 +3도 열림
  enhance: [
    { rate: 1.0, gold: 60,  items: { rune_stone: 3 } },
    { rate: 0.5, gold: 300, items: { rune_stone: 5, old_scroll: 1, ancient_relic: 1 } },
  ],
  forgeRate: 0.1,                         // 공방이 있는 둥지에서 강화하면 성공 확률 +10%
  // 속성 각인: 그 속성 공격(숨결·스킬) 피해 배율. 재료는 속성마다 다름
  engrave: { power: 1.12, gold: 40, items: { fire: { fire_crystal: 1 }, ice: { eternal_ice: 1 }, lightning: { sun_stone: 1 }, earth: { obsidian: 2 }, poison: { poison_herb: 3 }, mist: { glow_moss: 2 }, acid: { toad_gland: 2 }, water: { deep_pearl: 1 }, spirit: { silver_clover: 1 } } },
  // 마을 제작 의뢰: 마을마다 하루 3개. 보상 = 물건 값 × 개수 × gold, 평판 +rep
  orders: { perTown: 3, gold: 1.6, rep: 4, maxWis: 12, bonus: 1.5 }, // bonus: 걸작·정성 들인 요리로 채운 몫의 보상 배율
  // 둥지 공방(화로): 둥지에서 만들 때 기력 −20%, 대성공 +3%
  forge: { cost: { gold: 250, items: { bog_iron: 4, red_clay: 4, obsidian: 2 } }, en: 0.8 },
};

// 정화: 오염된 땅에서 행동할수록 모두의 정화 기여가 쌓이고, 목표에 닿으면 그 땅의 오염이 일찍 걷힘
const PURIFY = {
  goal: 1500,                  // 정화에 필요한 모두의 기여 (여럿이 힘을 모아야 닿도록. 사람이 늘어 1200에서 올림). 멸망한 대륙은 RUIN.goalPer로 따로 셈
  pts: { explore: 3, gather: 2, hunt: 4, elite: 15 }, // 행동마다 쌓이는 기여 (사냥·강적은 이겼을 때)
  minPts: 5,                                   // 이만큼은 기여해야 보상
  reward: { goldBase: 40, goldPer: 2, goldMax: 300, fame: 3, xp: 60 },
};

// ── 전투 ───────────────────────────────────────────
// 사냥은 자동 전투로 한 번에 끝나고, 가끔 나타나는 강적과 결투장은 직접 턴을 고른다.
const COMBAT = {
  // 결투 보정: 결투에서는 두 드래곤의 공격·비늘·날개·지혜·위엄·체력·기력을 둘의 가운데 쪽으로 당김
  // 0이면 두 드래곤이 똑같아지고, 1이면 보정 없음. 레벨과 장신구 차이가 커도 낮은 쪽에 기회가 남게
  duelGap: 0.25,           // 예: 공격 36과 54가 결투에서는 42.8과 47.3이 됨
  duelSwing: 0.35,         // 결투의 피해 흔들림 (±35%. 사냥은 ±15%)
  maxTurns: 12,            // 이만큼 지나면 남은 체력 비율로 판정
  ruinMaxTurns: 16,        // 멸망한 대륙의 사냥·강적은 몸이 질겨 조금 더 길게 싸움
  enPerTurn: 2,            // 턴마다 차는 기력
  huntReserve: 0.25,       // 자동 사냥은 기력을 이만큼(최대치 비율) 남겨 둠 (제작할 몫)
  fleeBelow: 0.2,          // 자동 사냥은 체력이 이 아래면 물러남
  eliteChance: 0.12,       // 사냥하다 강적을 만날 확률 (레벨 2부터)
  eliteFrom: 2,
  maxSkills: 3,            // 숨결 말고 들고 갈 수 있는 스킬 수
  gustDodge: 0.6,
  dodgeCap: 0.6,
  missRun: 2,                       // 연속 빗나감 보호: 같은 공격자가 이만큼 연달아 빗나가면 다음 공격은 반드시 맞음                    // 한 번 공격이 빗나갈 확률의 상한 (돌풍·흙먼지·속도·안개가 겹쳐도)          // 날개 돌풍을 탄 뒤 다음 공격을 흘려보낼 확률 (예전에는 반드시)
  turnSeconds: 30,         // 실시간 결투에서 한 턴을 고르는 시간. 넘기면 자동으로 고름
  inviteSeconds: 30,       // 결투 신청을 기다리는 시간
  // 내기 결투: 실시간 결투에서만. 둘 다 걸고, 진 쪽이 건 것을 이긴 쪽이 가져감
  bet: { levelGap: 5, goldMax: 200, itemKinds: 3, itemQty: 20, answerSeconds: 60, confirmSeconds: 30 },
  autoCooldown: 10 * 60 * 1000, // 같은 상대에게 자동 결투를 다시 걸 수 있는 간격
  fameWin: 3, fameRival: 2, fameLose: -1,
  // 결투 경험치 = 기본 + 상대 레벨 × 레벨당 (예: 상대가 Lv.5면 이기면 20+5×4=40, 지면 8+5×2=18)
  xpWin: 20, xpLose: 8,
  xpWinPerLv: 4, xpLosePerLv: 2,
  // 사냥감 세기: [기본, 사냥터 Lv.1당]. 강적은 체력·공격에 배율
  creature: { hp: [34, 3.3], atk: [12, 0.45], def: [3.5, 0.4], eliteHp: 1.8, eliteAtk: 1.3, highFrom: 12, hpHigh: 2, atkHigh: 0.3 }, // 초반은 조금 더 아프게, 레벨당 오르는 폭은 줄여 후반 벽을 낮춤 (예전: hp [27, 4.2], atk [8, 0.85], 강적 공격 1.2)
  // 난이도: 사냥·강적의 사냥감 세기 배율 (1이면 예전과 같음). 올리면 사냥감이 더 단단하고 아프게 문다
  difficulty: { hp: 1.08, atk: 1.08 },
  // 사냥감이 거는 화상·중독의 세기 기울기 (1이면 예전과 같음). 레벨이 오를수록 커지는데 비늘로 막히지 않아 높은 사냥터만 튀던 것을 누름
  creatureDot: 0.5,
  // 지혜: 스킬 효과 배율 = 1 + 지혜 × wisSkill (포식·자수정 숨결의 흡수, 숨 고르기의 기력, 스킬이 상태 이상을 걸 확률). 피해·지속 피해에는 붙지 않음
  wisSkill: 0.015,
  // 지혜: 드래곤이 스킬·숨결로 거는 상태 이상이 한 턴 더 갈 확률 = 지혜 × per (최대 max). 지혜 20이면 30%, 40이면 60%
  // 얼어붙음·마비는 한 턴 더 가면 너무 세서 뺌 (skip)
  wisLinger: { per: 0.015, max: 0.6, skip: ['freeze', 'stun'] },
  // 스킬을 한 번도 고르지 않은 드래곤이 들고 가는 스킬 (배운 것만, 이 순서로). 모자라면 배운 순서대로 채움
  defaultSkills: ['tail', 'mend', 'roar'],
  // 위엄: 사냥감·도둑의 위엄 = base + 레벨 × per (포효가 통할 확률을 정함. 대륙의 재앙은 따로)
  creatureMaj: { base: 4, per: 0.5 },
  // 위엄: 드래곤이 얼어붙음·마비를 떨쳐 낼 확률, 화상·중독·출혈이 한 턴 짧아질 확률 = 위엄 × per (최대 max)
  majResist: { per: 0.012, max: 0.35 },
  // 위압: 위엄이 상대보다 높으면 상대가 거는 상태 이상을 떨쳐 냄. 확률 = (내 위엄 − 상대 위엄) × per (최대 max, 위엄 10 차이에서 최대)
  // 결투에서는 결투 보정으로 줄어든 뒤의 차이로 셈. 사냥감·강적·도둑이 거는 것에도 통함 (그쪽 위엄은 creatureMaj)
  majPress: { per: 0.05, max: 0.5 },
  // 행동 순서: 날개(속도) + 0~initSwing 사이 무작위. 넓을수록 날개가 조금 높다고 늘 먼저 움직이지는 않음 (예전 3)
  initSwing: 10,
  // 날개(속도) 차이: 피하기 = base + (내 속도 − 상대 속도) × per (min~max), 급소 = base + 속도가 높은 만큼 × per
  wingDodge: { base: 0.05, per: 0.015, min: 0.03, max: 0.3 },
  wingCrit: { base: 0.06, per: 0.005 },
  // 결투(드래곤끼리)에서만 쓰는 날개 효과: 1:1에서 날개가 너무 세서 낮춤 (능력치 합 140 시험에서 다섯 능력치 승률을 비슷하게 맞춘 값). 사냥·강적·레이드는 위의 값 그대로
  wingDuel: { dodge: { base: 0.05, per: 0.003, min: 0.03, max: 0.09 }, crit: { base: 0.06, per: 0.001 }, initSwing: 20 },
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
// 숨결 위력: 하위권 종족을 조금 끌어올림 (산 1.35→1.4, 눈보라 1.0→1.22, 해일 0.9→1.0, 독 0.9→1.0. 같은 능력치 결투 시험에서 평균 쪽으로)
const BREATHS = {
  red:    { name: '화염 숨결',   element: 'fire',      power: 1.35, debuff: { burn: 3 }, desc: '불길을 쏟아 큰 피해를 주고, 세 턴 동안 불태운다.' },
  black:  { name: '산 숨결',     element: 'acid',      power: 1.4,   debuff: { acid: 3 }, desc: '비늘을 녹여 세 턴 동안 상대의 방어를 절반으로 만들고, 받는 피해를 15% 늘린다.' },
  white:  { name: '눈보라 숨결', element: 'ice',       power: 1.22, debuff: { freeze: 1 }, chance: 0.45, desc: '얼음 폭풍으로 피해를 주고, 절반 가까운 확률로 한 턴 얼려 움직이지 못하게 한다.' },
  gold:   { name: '번개 숨결',   element: 'lightning', power: 1.7,  debuff: { stun: 1 }, chance: 0.3, desc: '가장 강한 한 방. 가끔 상대를 마비시켜 한 턴 쉬게 한다.' },
  green:  { name: '독 숨결',     element: 'poison',    power: 1.0,  debuff: { poison: 3 }, desc: '짙은 독안개로 세 턴 동안 중독시킨다.' },
  clear:  { name: '투명한 숨결', element: 'mist', power: 0.8, desc: '시험용 숨결. 바람이 스칠 뿐 아무 일도 일어나지 않는다.' },
  silver: { name: '안개 숨결',   element: 'mist',      power: 0.8,  self: { evade: 3 }, desc: '은빛 안개에 몸을 숨겨, 세 턴 동안 공격을 잘 피한다.' },
  blue:   { name: '해일 숨결',   element: 'water',     power: 1.0, debuff: { soak: 2 }, desc: '거센 물살로 피해를 주고, 두 턴 동안 흠뻑 젖게 해 굼뜨게 만든다 (속도 −30%, 잘 피하지 못함). 젖은 적에게 꼬리치기를 하면 넘어뜨린다.' },
  purple: { name: '자수정 숨결', element: 'spirit',    power: 1.15, drain: 0.55, cleanse: 1, desc: '보랏빛 결정을 쏟아 피해를 주고, 입힌 피해의 55%만큼 체력을 되찾으며 나쁜 상태 하나를 씻어 낸다.' },
  bronze: { name: '모래 폭풍 숨결', element: 'earth',  power: 1.2,  self: { stone: 3 }, desc: '모래와 돌 조각을 쏟아 피해를 주고, 세 턴 동안 비늘이 돌처럼 굳어 받는 피해가 30% 준다.' },
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
  mend:   { name: '치유',         lv: 4, en: 8,  cd: 5, heal: { base: 6, mag: 1.5, pct: 0.08 }, cleanse: true, desc: '치유 마법으로 상처를 아물게 해 체력을 되찾고 화상·중독·출혈을 씻어 낸다. 지혜가 높을수록 많이 회복한다. 쓰러진 드래곤을 일으킬 때도 더 많이 회복시킨다.' },
  gust:   { name: '날개 돌풍',    lv: 5, en: 6,  cd: 3, power: 0.8, self: { dodge: 1 }, desc: '거센 바람으로 피해 ×0.8, 다음 공격 한 번을 60% 확률로 흘려보낸다.' },
  headbutt: { name: '박치기',     lv: 6, en: 7,  cd: 3, power: 1.0, debuff: { stun: 1 }, chance: 0.3, desc: '뿔로 들이받아 피해 ×1.0, 30% 확률로 한 턴 마비시킨다. 마비되면 급소 찌르기로 이어진다.' },
  rend:   { name: '찢어발기기',   lv: 7, en: 8,  cd: 3, power: 1.2, debuff: { bleed: 3 }, desc: '발톱으로 깊이 찢어 피해 ×1.2, 세 턴 동안 피를 흘리게 한다.' },
  dust:   { name: '흙먼지 날리기', lv: 8, en: 6, cd: 4, power: 0.5, debuff: { blind: 2 }, desc: '날갯짓으로 흙먼지를 일으켜 피해 ×0.5, 눈을 가려 이번 턴과 다음 턴에 공격이 네 번에 한 번꼴로 빗나가게 한다.' },
  devour: { name: '포식',         lv: 9, en: 10, cd: 4, power: 1.0, drain: 0.5, desc: '물어뜯어 입힌 피해의 절반만큼 체력을 되찾는다.' },
  flurry: { name: '연속 할퀴기',  lv: 10, en: 9, cd: 3, power: 0.5, hits: 3, desc: '양 발톱으로 세 번 연달아 할퀸다. 한 번에 피해 ×0.5. 피하기 잘하는 적에게도 한두 번은 닿는다.' },
  focus:  { name: '숨 고르기',    lv: 11, en: 0, cd: 4, enGain: 12, self: { opening: 2 }, desc: '숨을 깊이 골라 기력을 12 되찾고, 다음 공격이 ×1.5로 들어간다.' },
  quake:  { name: '땅울림',       lv: 12, en: 10, cd: 4, power: 0.9, aoe: true, debuff: { dazed: 2 }, desc: '땅을 내리쳐 모든 적에게 피해 ×0.9, 한 턴 휘청이게 한다 (급소 찌르기로 이어짐). 무리와 싸울 때 강하다.' },
  fury:   { name: '역린',         lv: 14, en: 8, cd: 4, power: 0.9, self: { fury: 3 }, desc: '분노에 차 들이받아 피해 ×0.9, 그 뒤 세 턴 동안 주는 피해 +35%. 대신 받는 피해도 +10%.' },
  dive:   { name: '하늘 낙하',    lv: 16, en: 14, cd: 5, power: 1.9, self: { exposed: 2 }, desc: '높이 솟구쳤다가 내리꽂아 피해 ×1.9. 내려앉은 뒤 한동안 빈틈이 생겨 받는 피해 +25%. 눈이 먼 적에게는 반드시 급소.' },
};
// 상태 이름 (화면 표시용)
const STATUS = {
  burn: '화상', poison: '중독', bleed: '출혈', acid: '비늘 녹음', freeze: '얼어붙음', stun: '마비',
  weaken: '움츠러듦', harden: '비늘 세움', evade: '안개', dodge: '돌풍',
  brittle: '얼음 금', dazed: '휘청임', opening: '반격 기회',
  soak: '흠뻑 젖음', stone: '돌 비늘',
  blind: '눈 멂', fury: '역린', exposed: '빈틈',
};
// 연계: 상대의 상태에 맞는 스킬을 쓰면 추가 효과
// (얼어붙음·마비가 풀린 다음 턴에도 '얼음 금'·'휘청임'이 남아 연계를 이을 수 있다)
const COMBOS = {
  shatter:  { name: '얼음 깨기',     skill: ['tail'],                  when: ['freeze', 'brittle'], desc: '얼어붙은 적에게 꼬리치기: 피해 ×2' },
  vital:    { name: '급소 찌르기',   skill: ['attack', 'rend'],        when: ['stun', 'dazed'],     desc: '마비된 적에게 할퀴기·찢어발기기: 반드시 급소' },
  wildfire: { name: '불길 번짐',     skill: ['gust'],                  when: ['burn'],              desc: '불타는 적에게 날개 돌풍: 화상 피해를 바로 한 번 더, 화상 3턴 연장' },
  flay:     { name: '녹은 비늘 찢기', skill: ['rend'],                 when: ['acid'],              desc: '비늘이 녹은 적에게 찢어발기기: 출혈 피해 ×2' },
  surge:    { name: '물살 휩쓸기',   skill: ['tail'],                  when: ['soak'],              desc: '흠뻑 젖은 적에게 꼬리치기: 미끄러져 한 턴 마비 (급소 찌르기로 이어짐)' },
  spread:   { name: '독 터뜨리기',   skill: ['tail', 'devour'],        when: ['poison'],            mult: 2, desc: '중독된 적에게 꼬리치기·포식: 남은 중독 피해를 한꺼번에 두 배로 터뜨림 (중독은 끝남)' },
  pounce:   { name: '사각에서 덮치기', skill: ['dive', 'flurry'],      when: ['blind'],             desc: '눈이 먼 적에게 하늘 낙하·연속 할퀴기: 반드시 급소', crit: true },
};
// 강적의 분노: 체력이 이 비율 아래로 떨어지면 한 번
const ENRAGE = { below: 0.5, atk: 1.25, every: 2 };

// ── 관계 ───────────────────────────────────────────
// 서로 맺는 관계(상대가 받아들여야 함). 한 상대와는 하나만. 이름은 '상대가 나에게 무엇인지'
// inv: 상대 쪽에서 본 이름 (스승 ↔ 제자), ask: 청할 때 상대에게 보이는 말, label: 청하는 버튼
const BONDS = {
  acquaint: { name: '지인', label: '지인으로 지내자', ask: '지인으로 지내자고 청했다' },
  comrade:  { name: '동료', label: '동료가 되자', ask: '동료가 되자고 청했다' },
  friend:   { name: '친구', label: '친구가 되자', ask: '친구가 되자고 청했다' },
  mentor:   { name: '스승', inv: 'student', label: '스승으로 모시기', ask: '스승으로 모시고 싶어 한다' },
  student:  { name: '제자', inv: 'mentor', label: '제자로 삼기', ask: '제자로 받아 주겠다고 한다' },
  family:   { name: '가족', label: '가족이 되자', ask: '가족이 되자고 청했다' },
  relative: { name: '친척', label: '친척으로 지내자', ask: '친척으로 지내자고 청했다' },
  lover:    { name: '연인', label: '마음을 고백하기', ask: '마음을 고백했다' },
  partner:  { name: '반려', label: '반려가 되어 달라', ask: '반려가 되어 달라고 청했다', needs: 'lover' },
};
// 혼자 붙이는 표시 (상대는 라이벌·원수만 알게 됨)
const MARKS = { rival: '라이벌', wary: '경계', nemesis: '원수' };
const BOND_RULES = {
  hearts: ['lover', 'partner'],      // 연인·반려는 한 번에 한 상대
  mentorGap: 3,                      // 스승은 제자보다 이만큼 레벨이 높아야
  studentsMax: 3,                    // 스승 하나가 둘 수 있는 제자 수 (제자는 스승 하나)
  // 가르치기: 스승이 같은 지역의 제자에게. 제자는 경험치, 스승은 명성
  teach: { ap: 2, en: 8, cooldown: 4 * 60 * 60 * 1000, xpBase: 20, xpPerLv: 4, fame: 1 },
  // 연인·반려와 같은 지역에 함께 있으면 (둘 다 접속): 정신 회복 배율, 사냥·전투에서 받는 피해 배율
  together: { mind: 1.5, taken: 0.95 },
  // 원수를 결투에서 이기면: 명성 더, 경험치 배율
  nemesis: { fame: 3, xp: 1.5 },
};

// ── 먼 여행: 지금 드래곤이 대륙을 떠나고, 같은 계정으로 새 드래곤을 만듦 ──
// minLevel 이상이면 새 드래곤에게 의지를 이어 줌: 능력치 포인트(레벨 × perLevel, 최대 max)와 칭호 '의지를 이은 자'
// 재산(금화·물건·보물더미)과 둥지, 식구는 함께 떠남 (남기고 싶은 식구는 먼저 동료에게 입양 보내기)
const DEPART = { minLevel: 5, perLevel: 0.5, max: 10, wordsMax: 100 };

// ── 계절과 날씨 ────────────────────────────────────
// 계절은 대륙 전체에 같이 흐르고(SEASON_RULES.days일마다 바뀜), 날씨는 지역마다 SEASON_RULES.weatherHours시간마다 바뀐다.
// 모두 시각으로 정해지므로 저장할 것이 없다 (서버를 다시 켜도 같은 날씨).
// fx(효과) 이름: (배율은 1이 기준, 더하기는 0이 기준)
//   ap: { explore, gather, hunt } 드는 행동력 +   gatherExtra: 채집에서 하나 더 나올 확률 +   findRare: 탐사·채집 귀한 물건 확률 +
//   exploreFind: 탐사에서 무언가 찾을 확률 +   exploreGold·huntGold: 금화 배율   drop: 사냥 전리품 확률 +
//   hpRegen·enRegen·apRegen·mindRegen: 회복 빠르기 배율   restRegen: 둥지에서 쉴 때 회복 배율
//   spd: 싸울 때 내 날개 +   taken: 사냥·전투에서 받는 피해 배율   foeAtk·foeHp: 사냥감 공격·체력 배율   foeSpd: 사냥감 날개 +
//   elem: { 속성: 피해 배율 } (나와 사냥감 모두에게 똑같이)
const SEASON_RULES = { days: 4, weatherHours: 3 };
const SEASONS = [
  { id: 'spring', name: '봄',   desc: '눈이 녹고 새싹이 돋는다. 짐승들은 새끼를 지키느라 사납다.',
    fx: { gatherExtra: 0.1, foeAtk: 1.05 } },
  { id: 'summer', name: '여름', desc: '해가 길어 날개가 가볍지만, 더위에 기운이 쉽게 빠진다.',
    fx: { apRegen: 1.1, enRegen: 0.9 } },
  { id: 'autumn', name: '가을', desc: '짐승들이 살이 오르는 수확의 계절. 해가 짧아 길에서 줍는 것은 적다.',
    fx: { huntGold: 1.1, drop: 0.05, exploreGold: 0.85 } },
  { id: 'winter', name: '겨울', desc: '긴 밤이 이어진다. 둥지의 온기가 더없이 반갑지만, 바깥은 혹독하다.',
    fx: { restRegen: 1.2, hpRegen: 0.85, foeHp: 1.1 } },
];
const WEATHERS = {
  clear:  { name: '맑음',     desc: '구름 한 점 없는 하늘. 멀리까지 내다보인다.',
    fx: { findRare: 0.03, exploreGold: 1.2, enRegen: 0.85 } },
  rain:   { name: '비',       desc: '빗줄기가 땅을 적신다. 풀과 이끼가 쑥쑥 자란다.',
    fx: { gatherExtra: 0.2, hpRegen: 1.1, elem: { fire: 0.7, lightning: 1.25 } } },
  storm:  { name: '뇌우',     desc: '천둥이 하늘을 가른다. 날기 힘들지만, 쓰러진 나무 아래 무언가 드러난다.',
    fx: { drop: 0.1, ap: { hunt: 1 }, spd: -3, elem: { lightning: 1.4, fire: 0.8 } } },
  fog:    { name: '안개',     desc: '짙은 안개가 깔렸다. 사냥감도 나를 잘 보지 못하지만, 길을 잃기 쉽다.',
    fx: { taken: 0.9, exploreFind: -0.1, elem: { mist: 1.3 } } },
  snow:   { name: '눈',       desc: '함박눈이 쌓인다. 사냥감은 느려지고, 몸은 차갑게 식는다.',
    fx: { foeSpd: -3, hpRegen: 0.75, elem: { ice: 1.3, fire: 0.85 } } },
  heat:   { name: '불볕더위', desc: '땅이 달아올라 아지랑이가 피어오른다. 불길은 거세지고 기운은 빠진다.',
    fx: { huntGold: 1.15, enRegen: 0.7, gatherExtra: -0.15, elem: { fire: 1.3, ice: 0.8 } } },
  wind:   { name: '강풍',     desc: '거센 바람이 분다. 날개에 바람이 실리지만, 독과 안개는 흩어진다.',
    fx: { spd: 3, exploreFind: 0.05, elem: { poison: 0.7, mist: 0.7 } } },
  aurora: { name: '오로라',   desc: '밤하늘에 빛의 장막이 흔들린다. 마음이 맑아지지만, 짐승들도 들떠 있다.',
    fx: { mindRegen: 2, findRare: 0.04, foeAtk: 1.1 } },
  ash:    { name: '잿비',     desc: '화산재가 비처럼 내린다. 귀한 광물이 드러나지만, 숨이 막힌다.',
    fx: { findRare: 0.03, mindRegen: 0.5, hpRegen: 0.9, elem: { earth: 1.2 } } },
};
// 계절마다 지역마다 날씨가 나올 무게 (적힌 것만 나옴)
const W_BASE = {
  spring: { clear: 4, rain: 4, fog: 2, wind: 2, storm: 1 },
  summer: { clear: 4, heat: 3, storm: 2, rain: 2, wind: 1 },
  autumn: { clear: 4, wind: 3, fog: 2, rain: 2 },
  winter: { clear: 3, snow: 4, wind: 2, fog: 1 },
};
// 지역 성질: 무게에 곱함 (0이면 나오지 않음). add: 그 지역에서 더해지는 날씨
const W_REGION = {
  snow:    { mul: { rain: 0, heat: 0, storm: 0.3 }, add: { snow: 5, aurora: 2 } },
  volcano: { mul: { snow: 0.2, rain: 0.5 }, add: { ash: 4, heat: 2 } },
  swamp:   { mul: { heat: 0.6 }, add: { fog: 3, rain: 2 } },
  forest:  { add: { rain: 2, fog: 2 } },
  canyon:  { mul: { rain: 0.4, snow: 0.3, fog: 0.4 }, add: { heat: 3, wind: 2 } },
  ruins:   { add: { fog: 2, aurora: 1, wind: 1 } },
  plains:  { add: { wind: 1, storm: 1 } },
  capital: { add: { rain: 1 } },
  coast:   { add: { fog: 2, wind: 2, storm: 1 } },
  ruin_shore:   { mul: { clear: 0.3, heat: 0.3, snow: 0.3 }, add: { fog: 4, ash: 3, storm: 1 } },
  ruin_plain:   { mul: { clear: 0.3, heat: 0.3, snow: 0.3 }, add: { ash: 5, wind: 2 } },
  ruin_capital: { mul: { clear: 0.2, heat: 0.3 }, add: { ash: 4, fog: 3, storm: 2 } },
  ruin_rift:    { mul: { clear: 0.1, heat: 0.3, snow: 0.3 }, add: { fog: 4, storm: 3, aurora: 1 } },
};

// ── 대륙의 재앙: 모든 드래곤이 함께 맞서는 거대한 적 ──
// 가끔 야생 지역 하나에 나타남. 체력은 모두가 함께 깎고, 한 번 맞설 때마다 정해진 턴만큼 싸운 뒤 물러남.
// 쓰러뜨리면 입힌 피해 비율에 따라 모두에게 보상. 시간 안에 쓰러뜨리지 못하면 떠나 버림
const BOSSES = {
  plains:  { name: '대지를 가르는 거수', type: 'beast',   weak: ['fire', 'lightning'], resist: ['earth'],
    special: { name: '대지 짓밟기', power: 1.5, debuff: { stun: 1 }, chance: 0.35 },
    desc: '평원 한가운데 언덕만 한 짐승이 몸을 일으켰다. 발을 구를 때마다 땅이 갈라진다.' },
  snow:    { name: '서리 거신 이미르', type: 'giant',   weak: ['fire'], resist: ['ice', 'water'],
    special: { name: '빙하 내려찍기', power: 1.4, debuff: { freeze: 1 }, chance: 0.4 },
    desc: '설원의 빙하가 갈라지며 얼음으로 된 거인이 걸어 나왔다. 숨결마다 눈보라가 인다.' },
  ruins:   { name: '봉인에서 풀린 고대 거신', type: 'construct', weak: ['acid'], resist: ['lightning', 'fire', 'earth'],
    special: { name: '룬 붕괴', power: 1.7 },
    desc: '유적 깊은 곳의 봉인이 깨졌다. 온몸에 룬이 타오르는 거신이 하늘을 올려다본다.' },
  forest:  { name: '썩어 가는 천 년 고목', type: 'spirit',  weak: ['fire', 'acid'], resist: ['lightning'],
    special: { name: '독 포자 폭발', power: 0.9, debuff: { poison: 3 } },
    desc: '숲의 가장 오래된 나무가 병들어 일어섰다. 가지마다 검은 포자가 흩날린다.' },
  swamp:   { name: '아홉 머리 히드라', type: 'reptile', weak: ['fire'], resist: ['poison', 'acid', 'water'],
    special: { name: '아홉 머리 물기', power: 0.4, hits: 4 },
    desc: '검은 늪이 끓어오르더니, 머리 아홉 달린 히드라가 솟아올랐다.' },
  canyon:  { name: '폭풍을 부르는 괴조', type: 'bird',    weak: ['ice', 'earth'], resist: ['fire', 'lightning'],
    special: { name: '번개 날개', power: 1.3, debuff: { stun: 1 }, chance: 0.3, element: 'lightning' },
    desc: '협곡 하늘이 시커멓게 물들었다. 날개를 펼치면 해가 가려지는 괴조가 번개를 몰고 왔다.' },
  volcano: { name: '깨어난 고룡 바르가스', type: 'flyer',  weak: ['ice', 'water'], resist: ['fire'],
    special: { name: '멸망의 화염', power: 1.6, debuff: { burn: 3 }, element: 'fire' },
    desc: '천 년을 잠들어 있던 고룡이 분화구에서 깨어났다. 대륙의 모든 드래곤이 그 울음을 들었다.' },
};
const BOSS = {
  gapHours: [10, 20],      // 재앙이 사라진 뒤 다음 재앙까지 (시간, 이 사이에서 무작위)
  lastsHours: 18,          // 나타난 뒤 이 시간 안에 쓰러뜨려야 함
  ap: 3,                   // 한 번 맞서는 데 드는 행동력
  turns: 8,                // 한 번 맞서면 이만큼 싸우고 물러남
  activeDays: 2,           // 최근 이 기간에 접속한 드래곤 수로 체력을 정함
  minActive: 2,
  triesPerActive: 4,       // 드래곤 하나가 평균 이만큼 맞서면 쓰러지도록
  lvAdd: 1,                // 최근 접속한 드래곤들의 평균 레벨 + 이만큼
  lvMin: 2, lvMax: 26,
  atk: 1.3, def: 1.2,      // 같은 레벨 사냥감보다 이만큼 셈
  // 한 번 맞설 때마다: 입힌 피해에 따라 경험치·금화
  xpBase: 10, xpPerDmg: 0.12, goldPerDmg: 0.04,
  // 쓰러뜨렸을 때: 금화 = 레벨 × (goldBase + goldShare × 내 몫), 재앙의 핵, 명성
  goldBase: 15, goldShare: 120, core: 1, topCore: 1, top: 3, fame: 2, lastFame: 3,
  news: [0.5, 0.25],       // 체력이 이만큼 아래로 떨어지면 대륙에 알림
  // 지난 재앙에서 배우기: 끝날 때마다 '한 번 맞설 때 실제 평균 피해'와 '얼마 만에 쓰러졌는지'를 기록해 다음 재앙 체력을 맞춤
  tune: {
    targetFrac: 0.5,       // 머무는 시간(lastsHours)의 이만큼 지나서 쓰러지는 게 목표 (18시간 × 0.5 = 9시간)
    learn: 0.5,            // 새 기록을 이만큼 반영 (나머지는 지난 값 유지: 한 번의 들쭉날쭉에 휘둘리지 않게)
    stepMax: 1.5, stepMin: 0.75, // 한 번에 체력 배율이 이 사이로만 바뀜
    multMin: 0.6, multMax: 4,    // 체력 배율의 범위
    minTries: 4,           // 맞선 횟수가 이보다 적으면 피해 기록은 반영하지 않음
  },
};
// ── 레이드: 만렙 드래곤 넷이 모여 함께 맞서는 기믹 전투 (raidboss.js) ──
// 멸망한 대륙 지역마다 하나. 지금은 시든 평원의 이삭지기 모르벤
const RAIDBOSS = {
  size: 4, minLevel: 25, minHp: 15,  // 4인 고정 (GM은 혼자서도 시험 입장). 사냥·재앙처럼 체력 15부터
  recruitMs: 10 * 60 * 1000,         // 모집이 열려 있는 시간
  weekly: 3,                         // 보상을 받는 횟수 (월요일 0시 초기화). 그 뒤에도 도우러 들어갈 수 있음
  turnSeconds: 60, maxTurns: 20,     // 한 턴을 고르는 시간 (넷이 다 고르면 바로 진행. 작전 이야기로 의논할 시간), 턴 제한
  chatMax: 120,                      // 작전 이야기 한 줄 글자 수
  coverTaken: 0.8,                   // 막아서기로 대신 맞을 때 받는 피해 배율 (피해는 막아선 쪽의 비늘로 셈)
  armorK: 0.35,                      // 레이드 보스 공격이 비늘을 얼마나 받는지 (보통 0.5. 낮을수록 비늘이 덜 막음)
  accuracy: 20,                      // 레이드 적의 명중: 피하기를 잴 때 공격하는 쪽 속도에 더함 (날개 45 드래곤도 열 번에 한 번쯤만 피함)
  rareChance: { gear: 0.02, treasure: 0.06 }, // 보상을 받는 판마다 드래곤마다 따로: 희귀 장비 2% (둘 중 하나), 보물 6%
  hitPct: 0.08,                      // 레이드 보스 공격에 더해지는 몫: 맞는 쪽 최대 체력의 8% × 공격 배율 (큰 기믹은 그만큼 크게)
  retreatLoss: 0.4,                  // 시간 초과로 물러날 때 잃는 체력 (최대 체력 비율)
  downHeal: 0.1,                     // 이겼을 때 쓰러져 있던 드래곤이 되찾는 체력 (최대 체력 비율)
  nerf: { step: 0.1, max: 0.3 },     // 안전판: 한 주 동안 아무도 못 잡으면 다음 주 체력 −10% (최대 −30%). 잡히면 다음 주 원래대로
  bosses: {
    morven: {
      script: 'morven', // raidboss.js의 기믹 갈래
      region: 'ruin_plain', place: '검은 밀밭 한가운데', name: '이삭지기 모르벤',
      desc: '카르넴 왕실이 곡창 평원에 보낸 풍요의 마법사. 오백 년 동안 홀로 남아 아무도 없는 밭의 추수를 기다린다.',
      // 만렙 넷이 기믹을 하나도 놓치지 않으면 17턴쯤에 쓰러지는 체력 (허수아비·그림자에 쓰는 턴과 빗나감까지 셈해 시험으로 맞춤)
      lv: 27, hp: 4400, lordShare: 0.25, atk: 60, def: 16, spd: 22, mag: 50, maj: 32, // maj: 포효로 노래를 끊는 판정의 기준 (만렙 평균 위엄 + 5쯤)
      lord:   { name: '허수아비 군주', type: 'construct', weak: ['fire', 'poison'], resist: ['earth'] },
      boss:   { name: '이삭지기 모르벤', short: '모르벤', type: 'human', weak: ['spirit', 'lightning'], resist: ['poison'] },
      shadow: { name: '모르벤의 그림자', type: 'spirit', weak: ['spirit', 'fire'], resist: ['poison', 'ice'], atk: 0.8 },
      crow:   { name: '검은 허수아비', type: 'construct', weak: ['fire', 'poison'], resist: ['earth'], atk: 0.5, def: 0.6, sides: ['왼편', '오른편'] },
      gaze:  { every: 3, power: 3.5 },                    // 1단계: 세 턴마다 '고개 돌리기' (예고 다음 턴에 한 드래곤에게 낫질 ×3.5)
      fire:  { per: 0.04, max: 3 },                       // 불 숨결로 허수아비를 치면 밀밭에 불길 (단계마다 턴 끝에 최대 체력의 4%). 얼음·물 숨결이 한 단계씩 끔
      song:  { every: 4, pct: 0.36, cut: 0.5 },           // 2단계: 네 턴마다 '추수의 노래' (모두 최대 체력의 36%, 포효로 끊으면 그 절반)
      ears:  { every: 2, n: 2, max: 3, mind: 8, cleanseWis: 15 }, // 2단계부터 두 턴마다 두 드래곤에게 검은 이삭. 3개가 다 여물면 다음 턴에 '수확'(즉사, 정신 −8, 동료가 일으킬 수 있음) — 그 전에 치유로 씻으면 삶. 치유 한 번에 1 + 지혜 15마다 1개씩 씻음
      summon: { at: [2, 7, 12], n: 2, hp: 0.055, shield: 0.5 }, // 2단계의 이 턴마다 허수아비 둘 (하나당 모르벤 체력의 5.5%). 서 있는 동안 모르벤이 받는 피해 절반
      split: { below: 0.3, floor: 0.15, window: 2, revive: 0.7 }, // 체력 30% 아래로 떨어지면 그림자와 갈라짐 (갈라질 때 둘 다 최소 15%). 하나가 쓰러지고 2턴 안에 나머지를 못 쓰러뜨리면 70%로 되살아남
      p3Every: 2,                                          // 3단계: 두 턴마다 고개 돌리기·추수의 노래를 번갈아
      rare: { gear: ['raid_harvest_crown', 'raid_scarecrow_cloak'], treasure: 'tr_seed_sack' }, // 희귀 전리품 (확률은 RAIDBOSS.rareChance)
      reward: { gold: [250, 400], shard: 'morven_shard', shards: 2, firstShard: 5, purifyShard: 15, purify: 50, journal: 'morven_journal', journalChance: 0.2, keepsake: 'golden_wheat', fame: 3 },
      intro: '검게 마른 이삭 사이로 들어서자 바람이 멎었다. 밭 한가운데, 낡은 로브를 걸친 사람이 낫을 쥔 채 이쪽을 돌아본다. "올해는 이삭이 무겁구나."',
      lines: {
        phase2: ['허수아비 군주가 실 끊긴 인형처럼 무너졌다.', '"거둘 때가 됐다." 모르벤이 낫을 고쳐 쥐고 직접 걸어 나온다. 검은 이삭이 그의 발밑에서 일제히 고개를 든다.'],
        phase3: ['모르벤이 비틀거리자 그의 그림자가 땅에서 떨어져 나와 따로 선다.', '"하나를 거두면 하나가 남지. 남은 하나가 다시 심는다."'],
        win: ['모르벤이 무릎을 꿇었다. 낫이 손에서 미끄러진다.', '"…올해 추수는, 끝났구나." 검은 이삭들이 바람에 부서지고, 그 사이로 금빛 이삭 몇 줄기가 고개를 내민다.'],
        time: ['해가 졌다. 모르벤이 낫을 높이 들어 마지막 추수를 거둔다.', '밀밭 전체가 검게 일렁이고, 드래곤들은 더 버티지 못하고 밭 밖으로 밀려났다.'],
        wipe: ['마지막 드래곤이 쓰러졌다. 모르벤은 낫을 거두고 다시 밭 한가운데로 돌아간다.', '"아직이다. 아직 덜 여물었어."'],
        timeHead: '마지막 추수를 견디지 못하고 물러났다.',
        keepsake: '밭 가장자리에서 금빛으로 여문 이삭 한 줌을 꺾었다. 보물 상자에 간직했다.',
        keepsakeNoNest: '금빛으로 여문 이삭 한 줌을 꺾었지만, 간직할 둥지가 없어 바람에 날려 보냈다.',
      },
    },
    heiron: {
      script: 'knights',
      region: 'ruin_capital', place: '무너진 성문 앞', name: '마지막 기사단장 헤이른',
      desc: '카르넴 기사단의 마지막 단장. 왕이 "문을 열지 마라"는 말을 남기고 들어간 뒤로, 오백 년 동안 대열을 풀지 않았다.',
      // 모르벤보다 한 단계 위 (성문 사냥터가 Lv.25·26). 실제 수치는 시험으로 다시 맞춤
      lv: 28, hp: 4722, knightShare: 0.07793, atk: 70, def: 18, spd: 24, mag: 46, maj: 34, // 기사 넷은 하나당 368 그대로, 헤이른 본체 3250
      knight: { name: '카르넴 기사', type: 'human', weak: ['lightning', 'spirit'], resist: ['earth'], atk: 0.45, def: 1.1, names: ['왼쪽 방패 기사', '오른쪽 방패 기사', '창 기사', '늙은 기사'] },
      boss:   { name: '마지막 기사단장 헤이른', short: '헤이른', type: 'human', weak: ['lightning', 'spirit'], resist: ['earth', 'poison'] },
      banner: { name: '기사단 깃발', type: 'construct', weak: [], resist: [], def: 0.5, spd: 1, hp: 0.08, taken: 0.6, regen: 0.025, back: 4, only: ['dive', 'gust'] }, // 헤이른 체력의 8%. 서 있는 동안 헤이른 받는 피해 ×0.6, 턴마다 2% 회복. 꺾이면 4턴 뒤 다시
      wall:   { every: 2, front: 0.3, broken: 1.5 },        // 1단계: 두 턴마다 방패벽 (정면 ×0.3). 우회·땅울림으로 깨면 그 턴 남은 공격 ×1.5
      flank:  { wing: 25, power: 0.8 },                     // 우회: 50% + (날개 − 25) × 4% (20~95%). 방패벽이 아닌 턴에는 ×0.8 공격
      charge: { every: 4, n: 2, power: 3.5 },                 // 2·3단계: 네 턴마다 두 드래곤에게 돌격 ×3.5 (날개 돌풍으로 피함, 막아서기 가능)
      duel:   { below: 0.4, every: 5, turns: 3, heal: 0.1, after: 1.5, afterTurns: 3, punish: 1.5 }, // 3단계(40% 아래): 다섯 턴마다 3턴 일기토. 버티면 헤이른 ×1.5 (3턴), 지목된 드래곤이 쓰러지면 헤이른 10% 회복, 끼어들면 ×1.5 반격
      rare: { gear: ['raid_heiron_helm', 'raid_banner_wing'], treasure: 'tr_oath_ring' },
      reward: { gold: [280, 450], shard: 'heiron_crest', shards: 2, firstShard: 5, purifyShard: 15, purify: 50, journal: 'knight_logbook', journalChance: 0.2, keepsake: 'knight_banner', fame: 3 },
      intro: '무너진 성문 앞, 녹슨 갑옷들이 한 치도 흐트러지지 않은 채 줄지어 서 있다. 가장 앞에 선 기사가 투구 너머로 낮게 말한다. "물러가라. 이 문은 열리지 않는다."',
      lines: {
        phase2: ['마지막 기사가 무릎을 꿇었다.', '"대열이 무너졌는가." 헤이른이 땅에 꽂았던 검을 뽑는다. 성문 위로 찢긴 기사단 깃발이 다시 오른다.'],
        phase3: ['헤이른의 투구에 금이 갔다. 그는 투구를 고쳐 쓰고 검 끝을 땅에 댄다.', '"이제 하나씩 겨루겠다. 이름을 대라."'],
        win: ['헤이른이 한쪽 무릎을 꿇었다. 검이 손에서 미끄러진다.', '"…문은, 아직 닫혀 있는가." 닫혀 있다는 대답을 듣고서야 그는 투구를 벗는다. "그렇다면 됐다. 이제 쉬어도 되겠군."'],
        time: ['해가 졌다. 헤이른이 검을 높이 들자 쓰러졌던 기사들이 일제히 일어선다.', '"성문을 지켜라!" 드래곤들은 더 버티지 못하고 성문 앞에서 밀려났다.'],
        wipe: ['마지막 드래곤이 쓰러졌다. 헤이른은 검을 거두고 다시 성문 앞에 선다.', '"물러가라. 이 문은 열리지 않는다."'],
        timeHead: '성문을 끝내 넘지 못하고 물러났다.',
        keepsake: '꺾인 기사단 깃발에서 한 폭을 찢어 왔다. 보물 상자에 간직했다.',
        keepsakeNoNest: '꺾인 깃발에서 한 폭을 찢어 왔지만, 간직할 둥지가 없어 성문 앞에 내려놓았다.',
      },
    },
  },
};
// 사냥감의 전투 성질: 약점(피해 ×1.5)과 저항(피해 ×0.5, 상태 이상이 통하지 않음), 특기
const CREATURE_COMBAT = {
  plains:  { weak: [],            resist: [],                    special: { name: '돌진', power: 1.6 } },
  snow:    { weak: ['fire'],      resist: ['ice'],               special: { name: '무리 사냥', power: 0.65, hits: 2 } },
  forest:  { weak: ['fire'],      resist: [],                     special: { name: '거미줄', power: 0.5, debuff: { stun: 1 }, chance: 0.45 } },
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

// 부엌에서 아이가 만든 요리: 제작법이 있는 식구 요리·강화 음식·새끼 먹이마다 '정성 들인 ○○'(id__k)을 만들어 둠
FACILITY.cookable = [];
for (const r of RECIPES) {
  const it = ITEMS[r.out];
  if (!it || r.hidden) continue;
  const meal = it.cat === 'meal';
  const buff = it.type === 'use' && it.use?.buff;
  if (!meal && !buff) continue;
  const id = `${r.out}__k`;
  const C = FACILITY.cooked;
  ITEMS[id] = { ...it, name: `정성 들인 ${it.name}`, value: Math.round((it.value || 1) * 1.5), cooked: r.out,
    desc: `${it.desc} 둥지의 아이가 정성껏 만들어 더 맛있다.`, ...(buff ? { use: { ...it.use, minutes: Math.round(BUFFS.minutes * C.buffMin) } } : {}) };
  if (KIN.care[r.out]) { const c = KIN.care[r.out]; KIN.care[id] = { ...c, bond: Math.round(c.bond * C.bond), sat: Math.round((c.sat || 0) * C.sat) }; }
  if (KIN.drakeFood.items[r.out]) { const f = KIN.drakeFood.items[r.out]; KIN.drakeFood.items[id] = { bond: Math.round(f.bond * C.bond), sat: Math.round(f.sat * C.sat) }; }
  FACILITY.cookable.push(r.out);
}

// 걸작 장신구: 장신구마다 '걸작 ○○'(id__mw)을 따로 둠. 주 능력치 +1이 이미 들어 있고, 강화·각인도 걸작은 걸작대로 따로 기록됨
// (예전에는 같은 장신구 전체에 걸작 표시가 붙어 일반·걸작이 한 칸에 겹쳤음)
for (const [id, it] of Object.entries(ITEMS)) {
  if (it.type !== 'equip' || id.endsWith('__mw')) continue;
  const main = Object.entries(it.bonus || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
  ITEMS[`${id}__mw`] = { ...it, name: `걸작 ${it.name}`, mwOf: id, value: Math.round((it.value || 1) * 1.6),
    bonus: main ? { ...it.bonus, [main]: it.bonus[main] + 1 } : { ...it.bonus },
    desc: `${it.desc} 대성공으로 태어난 걸작이라 손끝이 닿은 자리마다 빛이 서려 있다.` };
}

// ── 보물 상자: 보물더미 안의 잠긴 상자. 아이의 선물·받은 꽃다발 같은 특별한 물건을 넣음 ──
// 한번 넣으면 꺼내거나 팔 수 없고, 보물 도둑도 손대지 못함. 하나마다 value만큼 보물더미 가치에 더해짐
// fmt — of: '루비의 그림' / from: '하늘에게 받은 들꽃 꽃다발' / plain: 이름만 · say: false면 함께 남은 글이 말이 아니라 설명 (따옴표 없이)
const KEEPSAKES = {
  // 제작으로 만드는 선물 (보물 상자에 간직. 받은 것이면 '○○에게 받은')
  shell_chime:   { name: '조개 풍경',         value: 12, fmt: 'from', desc: '조개껍데기를 거미줄 실에 꿰어 단 풍경. 바람이 불면 자그락자그락 바다 소리가 난다.' },
  amber_star:    { name: '호박 별 장식',      value: 30, fmt: 'from', desc: '호박을 별 모양으로 깎아 금실로 감쌌다. 안에 갇힌 작은 벌레가 별빛처럼 보인다.' },
  music_box:     { name: '은사슬 오르골',     value: 60, fmt: 'from', desc: '은사슬을 감아 태엽 삼은 작은 오르골. 뚜껑을 열면 진주가 돌며 낯익은 노래가 흐른다.' },
  town_drawing:  { name: '마을 집 그림',      value: 6,  fmt: 'of',   say: false, desc: '마을 집 창가에서 건네받은 그림. 지붕 위에 커다란 드래곤 한 마리가 앉아 있고, 그 아래 사람들이 손을 흔든다.' }, // 마을에서 다시 만난 식구 (kin_in_town)
  kid_drawing:   { name: '그림',              value: 8,  fmt: 'of',   say: false, desc: '삐뚤빼뚤한 선으로 그린 그림. 크레용 자국이 손끝에 묻어난다.' },
  kid_letter:    { name: '편지',              value: 8,  fmt: 'of',   desc: '또박또박 눌러 쓴 편지. 군데군데 지우고 다시 쓴 자국이 있다.' },
  pressed_flower:{ name: '눌러 말린 꽃',      value: 6,  fmt: 'of',   desc: '책갈피 사이에 며칠을 눌러 둔 꽃. 색은 바랬지만 모양은 그대로다.' },
  flower_ring:   { name: '들꽃 반지',         value: 5,  fmt: 'of',   desc: '풀줄기를 엮어 만든 작은 반지. 새끼손가락에도 들어가지 않을 만큼 작다.' },
  wood_dragon:   { name: '나무로 깎은 용',    value: 10, fmt: 'of',   desc: '나뭇조각을 깎아 만든 작은 용 인형. 꼬리가 조금 짧다.' },
  pebble_neck:   { name: '조약돌 목걸이',     value: 7,  fmt: 'of',   desc: '구멍 난 조약돌을 실에 꿰어 만든 목걸이. 하나하나 직접 골랐다고 한다.' },
  first_scale:   { name: '첫 비늘',           value: 10, fmt: 'of',   desc: '처음으로 빠진 작은 비늘. 아직 온기가 남아 있는 것 같다.' },
  shiny_pebble:  { name: '반짝이는 조약돌',   value: 5,  fmt: 'of',   desc: '어디선가 물어 온 반짝이는 조약돌. 보물이라며 내밀었다.' },
  // 아이·새끼가 주는 선물 (더 늘림) — 고르는 규칙은 game-events.js kid_gift
  clover:        { name: '네잎클로버',        value: 6,  fmt: 'of',   desc: '풀밭에 엎드려 한참을 찾았다는 네잎클로버. 잎 하나가 살짝 접혀 있다.' },
  clay_dragon:   { name: '흙으로 빚은 용',    value: 7,  fmt: 'of',   desc: '냇가 진흙을 빚어 햇볕에 말린 작은 용. 날개 한쪽이 조금 더 크다.' },
  wish_note:     { name: '소원 쪽지',         value: 5,  fmt: 'of',   desc: '작게 접은 쪽지. 펼쳐 보면 삐뚤빼뚤한 글씨로 소원이 적혀 있다.' },
  woven_band:    { name: '엮은 팔찌',         value: 6,  fmt: 'of',   desc: '알록달록한 실을 땋아 만든 팔찌. 발목에라도 감으라며 건네주었다.' },
  wood_sword:    { name: '나무 검',           value: 7,  fmt: 'of',   desc: '나뭇가지를 깎아 만든 작은 검. 손잡이에 이름이 새겨져 있다.' },
  wood_flute:    { name: '나무 피리',         value: 9,  fmt: 'of',   desc: '속을 파낸 나뭇가지에 구멍을 뚫은 피리. 불면 바람 소리 같은 음이 난다.' },
  knit_scarf:    { name: '손뜨개 목도리',     value: 10, fmt: 'of',   desc: '긴 겨울 내내 몰래 뜬 목도리. 용의 목에 두르기엔 조금 짧다.' },
  star_map:      { name: '별자리 그림',       value: 8,  fmt: 'of',   say: false, desc: '밤하늘의 별을 이어 그린 그림. 별 사이사이에 작은 글씨로 이름이 붙어 있다.' },
  bird_feather:  { name: '알록달록한 깃털',   value: 6,  fmt: 'of',   desc: '하늘 높이 날다가 주워 온 커다란 새의 깃털. 빛을 받으면 색이 바뀐다.' },
  conch_shell:   { name: '작은 소라 껍데기',  value: 5,  fmt: 'of',   desc: '손바닥만 한 소라 껍데기. 귀에 대면 먼 바다의 파도 소리가 난다.' },
  warm_stone:    { name: '햇볕에 데운 돌',    value: 6,  fmt: 'of',   desc: '한낮 내내 햇볕에 굴려 데웠다는 둥근 돌. 아직 따뜻하다.' },
  storm_stone:   { name: '벼락 맞은 돌',      value: 8,  fmt: 'of',   desc: '벼락이 떨어진 자리에서 주워 온 돌. 겉에 나뭇가지 같은 무늬가 타 들어가 있다.' },
  hunt_fang:     { name: '짐승의 송곳니',     value: 8,  fmt: 'of',   desc: '혼자 사냥한 짐승에게서 뽑아 온 송곳니. 자랑스러운 듯 내밀었다.' },
  dream_journal: { name: '꿈 일기',           value: 10, fmt: 'of',   desc: '밤마다 꾼 꿈을 적어 둔 낡은 공책. 사람 모습일 때 쓴 글씨라 조금 서툴다. 하늘을 나는 꿈이 유난히 많다.' },
  paper_bird:    { name: '종이 새',           value: 5,  fmt: 'of',   desc: '종이를 접어 만든 작은 새. 날개 끝을 당기면 파닥인다.' },
  paper_kite:    { name: '종이 연',           value: 7,  fmt: 'of',   desc: '나뭇살에 종이를 붙여 만든 연. 한가운데 서툴게 그린 용 한 마리가 있다.' },
  portrait:      { name: '초상화',            value: 10, fmt: 'of',   say: false, desc: '숯으로 그린 초상화. 그린 이의 눈에 비친 모습이라 실제보다 조금 더 늠름하다.' },
  knight_banner: { name: '빛바랜 기사단 깃발 한 폭', value: 10, fmt: 'of', say: false, desc: '꺾인 카르넴 기사단 깃발에서 찢어 낸 천. 용과 인간이 함께 그려진 문장의 한 귀퉁이가 남아 있다.' }, // 레이드 첫 처치
  golden_wheat:  { name: '금빛 밀 이삭 한 줌', value: 10, fmt: 'of',   say: false, desc: '이삭지기 모르벤이 쓰러진 뒤, 시든 평원에 오백 년 만에 다시 여문 금빛 이삭. 흔들면 마른 밀 소리가 난다.' }, // 레이드 첫 처치
  herb_sachet:   { name: '약초 주머니',       value: 7,  fmt: 'of',   desc: '말린 약초를 천에 싸서 묶은 주머니. 맡으면 머리가 맑아지는 풀 냄새가 난다.' },
  acorns:        { name: '도토리 한 줌',      value: 4,  fmt: 'of',   desc: '반질반질한 도토리 한 줌. 겨울을 위해 모아 두라는 뜻인 모양이다.' },
  pinecone:      { name: '커다란 솔방울',     value: 4,  fmt: 'of',   desc: '꼭지까지 온전한 커다란 솔방울. 송진 냄새가 난다.' },
  old_coin:      { name: '녹슨 옛 동전',      value: 8,  fmt: 'of',   desc: '어느 옛 왕국의 것인지 모를 녹슨 동전. 벌써 반짝이는 것을 알아보는 용의 눈이 생긴 모양이다.' },
  sky_sketch:    { name: '하늘에서 본 둥지',  value: 9,  fmt: 'of',   say: false, desc: '높이 날며 내려다본 둥지와 그 둘레를 그린 그림. 길과 숲이 지도처럼 그려져 있다.' },
  far_letter:    { name: '먼 둥지의 편지',    value: 5,  fmt: 'from', desc: '입양 보낸 식구가 보내온 안부.' },
  gift_pic:      { name: '손수 마련한 선물',  value: 3,  fmt: 'from',   desc: '보낸 이가 손수 마련해 보내온, 세상에 하나뿐인 물건.' }, // 이미지로 보낸 창작 선물 (img: { id, key, t: 보낸 이가 붙인 이름 })
  court_gift:    { name: '구애의 선물',       value: 10, fmt: 'from',   desc: '낯선 용이 둥지 가장자리에 놓고 간 반짝이는 돌. 드래곤은 마음에 둔 상대에게 가장 아끼는 보물을 건넨다고 한다.' },
  mourn_scale:   { name: '무덤가의 비늘',     value: 4,  fmt: 'of',     desc: '먼저 떠난 식구의 무덤가에 새끼 드래곤이 두고 온 비늘과 똑같이 생긴 한 조각. 둘이 함께 자란 날들을 기억한다.' },
  home_pebble:   { name: '고향의 조약돌',     value: 5,  fmt: 'from',   desc: '늙은 식구가 마지막으로 고향에 다녀오며 주워 온 조약돌.' },
  bouquet_wild:  { name: '들꽃 꽃다발',       value: 6,  fmt: 'from', desc: '평원의 들꽃과 해안의 갯메꽃을 묶은 꽃다발. 상자 안에서 곱게 말라 간다.' },
  bouquet_four:  { name: '네 고장 꽃다발',    value: 10, fmt: 'from', desc: '네 고장의 꽃을 하나씩 모은 꽃다발. 상자 안에서 곱게 말라 간다.' },
  nm_lantern:    { name: '종이 등불',         value: 6,  fmt: 'plain', desc: '축제 밤 야시장에서 산 종이 등불. 불을 넣으면 지금도 벚꽃 무늬가 둥지 벽에 번진다.' },
  nm_mask:       { name: '축제 가면',         value: 10, fmt: 'plain', desc: '축제 밤 야시장에서 산 나무 가면. 칠이 조금 벗겨졌지만, 쓰면 그날 밤 음악이 들리는 것 같다.' },
  fest_drawing:  { name: '축제 그림',         value: 8,  fmt: 'of',   say: false, desc: '왕도 축제를 그린 그림. 하늘 가득 국화 불꽃이 터지고, 그 아래 식구들이 손을 잡고 작게 서 있다.' },
  festival_garland: { name: '축제 꽃장식',     value: 8,  fmt: 'plain', desc: '왕도 축제에서 처음 춤춘 날 받은 꽃장식. 꽃은 말랐지만 방울 소리는 그대로다.' },
};

// ── 왕도 야시장: 축제 날(토·일) 저녁부터 밤까지 왕도에 노점이 섬 (nightmarket.js) ──
// 일요일 밤은 축제가 끝나는 자정에 함께 걷음. 적대 드래곤도 이용할 수 있음
// ── 왕도 축제에 식구들 데려가기 (game-life.js festOuting). 축제마다 식구 하나가 낮에 한 번 · 야시장 밤에 한 번, 모두 두 번까지 ──
// {a}: 식구 이름, {o}: 식구가 부르는 이름(엄마·아빠·드래곤 이름). [이/가] 등은 이름 받침에 맞춤
const KIN_FEST = {
  bond: 5,            // 오르는 유대
  drawChance: 0.4,    // 아이(아이·소년)나 어린 용이 함께 가면, 돌아와 축제 그림을 그려 줄 확률
  drawStages: ['아이', '소년', '어린 용'],
  open: ['식구들을 데리고 왕도 축제에 갔다. 성문을 지나자 북소리와 사람들 웃음소리가 한꺼번에 밀려왔다.', '식구들과 함께 왕도 광장으로 들어섰다. 깃발이 줄줄이 나부끼고, 어디선가 구운 밤 냄새가 났다.'],
  openNight: ['등불이 환히 켜진 밤, 식구들을 데리고 왕도 축제에 갔다. 골목마다 야시장 노점이 줄지어 섰다.'],
  // 둘 이상 함께 가면 맨 끝에 붙는 한 줄 (식구 구성에 맞춰: 모두 인간 · 모두 드래곤 · 섞임)
  family: {
    human: ['식구들이 서로 손을 꼭 잡고 광장을 한 바퀴 돌았다. 오늘 밤 둥지는 일찍 조용해지겠다.', '돌아오는 길, 식구들은 서로 본 것을 이야기하느라 쉴 새가 없었다.', '돌아오는 길, 가장 어린 식구가 업힌 채 새근새근 잠들어 버렸다.'],
    drake: ['식구들이 줄지어 날아 둥지로 돌아왔다. 꼬리 끝마다 축제 리본이 하나씩 묶여 있었다.', '돌아오는 길, 식구들은 아직 귓가에 남은 북소리에 맞춰 날갯짓을 했다.', '둥지에 닿자마자 식구들이 한데 엉겨 붙어 곯아떨어졌다. 날개 사이로 꽃잎 몇 장이 떨어졌다.'],
    mixed: ['식구들이 서로 손과 꼬리를 잡고 광장을 한 바퀴 돌았다. 오늘 밤 둥지는 일찍 조용해지겠다.', '돌아오는 길, 사람 식구와 용 식구가 서로 본 것을 이야기하느라 쉴 새가 없었다.', '돌아오는 길, 지친 식구들이 서로에게 기대어 꾸벅꾸벅 졸았다.'],
  },
  // 둘이 함께한 장면 ({a}·{b}: 아기는 빼고 고름. 사람과 용이면 {a}가 사람, {b}가 용)
  pair: {
    hh: ['{a}[과/와] {b}[이/가] 서로 가면을 바꿔 써 보며 깔깔 웃었다.', '{a}[이/가] {b}의 손을 잡아끌고 춤추는 사람들 사이로 뛰어들었다.', '{a}[과/와] {b}[이/가] 꿀호떡 하나를 반으로 갈라 사이좋게 나눠 먹었다.', '{a}[이/가] 사람들 틈에서 {b}[을/를] 잃어버릴까 봐 내내 소매를 붙잡고 다녔다.'],
    hd: ['{a}[이/가] {b}에게 꼬치 하나를 내밀자, {b}[이/가] 단숨에 받아먹고 꼬리를 흔들었다.', '{b}[이/가] 작은 불씨를 뿜어 {a}의 국화 불꽃 막대에 불을 붙여 주었다.', '{a}[이/가] 길을 잃을까 봐 {b}의 꼬리 끝을 꼭 붙잡고 다녔다.', '{a}[이/가] 줄타기 광대를 가리키며 신이 나서 떠들자, {b}도 덩달아 날개를 파닥였다.'],
    dd: ['{a}[과/와] {b}[이/가] 누가 더 큰 불꽃을 뿜나 겨루다 구경꾼들의 박수를 받았다.', '{a}[이/가] 졸린 {b}[을/를] 날개로 감싸 안고 광장 구석에서 북소리를 들었다.', '{a}[과/와] {b}[이/가] 바람에 날리는 꽃잎을 서로 먼저 물겠다고 뛰어다녔다.'],
  },
  scene: {
    babyH: ['{a}[을/를] 품에 안고 광장을 걸었다. 북소리가 울릴 때마다 {a}[이/가] 작은 손을 버둥거리며 까르르 웃었다.', '포대기 속 {a}[이/가] 머리 위로 흔들리는 깃발을 눈으로 좇다가 스르르 잠들었다.', '지나가던 아낙이 {a}의 볼을 콕 찌르며 예쁘다고 하자, {a}[이/가] 방긋 웃었다.', '사람들의 박수 소리에 {a}[이/가] 깜짝 놀라 눈을 동그랗게 뜨더니, 이내 따라서 손뼉을 쳤다.'],
    kidH: ['{a}[이/가] 줄타기 광대 앞에서 입을 떡 벌린 채 한참을 서 있었다.', '{a}[이/가] 사람들 틈에 끼어 빙글빙글 춤을 추었다. "{o}, 봤어요? 나 춤 잘 추죠!"', '{a}[이/가] 손을 꼭 잡고 놓지 않았다. 사람이 너무 많다며 눈이 동그래졌다.', '{a}[이/가] 풍선 장수 앞에서 한참을 서성이다가, 결국 빨간 풍선 하나를 손목에 매달았다.', '{a}[이/가] 마을 아이들과 금세 친해져 술래잡기를 하며 광장을 뛰어다녔다.'],
    youthH: ['{a}[은/는] 또래들 무리에 섞여 노래를 따라 부르다가, 눈이 마주치자 쑥스러운 듯 손을 흔들었다.', '{a}[이/가] 활쏘기 놀이판에서 과녁 한가운데를 맞히고, 상으로 받은 리본을 슬쩍 보여 주었다.', '{a}[이/가] 춤판 가장자리에서 망설이다가, 누군가 손을 내밀자 못 이기는 척 끼어들었다.', '{a}[이/가] 노점에서 산 머리끈을 식구들 몫까지 골라 와 하나씩 나눠 주었다.'],
    adultH: ['{a}[이/가] 오랜만의 축제라며 옛 노래를 흥얼거렸다.', '{a}[이/가] 광장 가장자리 의자에 앉아 춤추는 사람들을 흐뭇하게 바라보았다.', '{a}[이/가] 장터에서 옛 동무를 만나 한참 이야기꽃을 피웠다.', '{a}[이/가] 어린 식구들이 길을 잃지 않게 앞장서서 사람들 사이로 길을 냈다.'],
    hatch: ['{a}[이/가] 등 위에 납작 엎드려 흔들리는 깃발을 하나하나 눈으로 좇았다.', '불꽃이 터질 때마다 {a}[이/가] 깜짝 놀라 날개 밑으로 파고들었다가, 다시 고개를 빼꼼 내밀었다.', '{a}[이/가] 북소리에 맞춰 꼬리를 탁탁 내리치다가, 구경하던 아이들의 웃음을 샀다.', '꽃잎 하나가 코끝에 내려앉자 {a}[이/가] 재채기를 하며 작은 불씨를 퐁 뿜었다.'],
    littleD: ['{a}[이/가] 꼬마들 사이를 뛰어다니다 꼬리로 깃발 하나를 휘감아 쓰러뜨렸다. 아이들은 오히려 깔깔 웃었다.', '{a}[이/가] "나도 불꽃 만들 수 있어!" 하며 작은 불씨를 퐁 뿜었다. 구경꾼들이 박수를 쳐 주었다.', '{a}[이/가] 춤추는 사람들 틈에 끼어 앞발을 번갈아 들며 제 나름의 춤을 추었다.', '{a}[이/가] 사탕 장수가 건넨 별사탕을 혀로 날름 받아먹고 눈을 반짝였다.'],
    olderD: ['{a}[이/가] 성벽 위로 날아올라 광장을 내려다보았다. 불빛 사이로 춤추는 사람들이 작은 꽃처럼 보였다.', '{a}[은/는] 의젓하게 곁을 지키다가, 음악이 바뀌자 슬쩍 박자에 맞춰 꼬리를 흔들었다.', '{a}[이/가] 마을 아이들의 부탁에 못 이겨 날개를 펼쳐 보여 주었다. 아이들의 탄성이 광장에 퍼졌다.', '{a}[이/가] 광장 가장자리에 몸을 낮추고, 지친 아이들이 꼬리에 기대어 쉬게 해 주었다.'],
  },
  // 같은 무리 식구가 많아 제 장면을 다 썼을 때 꺼내 쓰는 장면 (한 나들이에서 같은 문장이 두 번 나오지 않게)
  spare: {
    human: ['{a}[이/가] 사람들 틈에서 축제 음악에 맞춰 어깨를 들썩였다.', '{a}[이/가] 광장 분수에 동전을 던지며 소원을 빌었다.', '{a}[이/가] 길가 악사의 피리 소리에 걸음을 멈추고 한참 귀를 기울였다.'],
    drake: ['{a}[이/가] 북소리에 맞춰 꼬리를 살랑살랑 흔들었다.', '{a}[이/가] 바람에 날리는 꽃잎을 코끝으로 톡톡 건드려 보았다.', '{a}[이/가] 깃발 끝에 매달린 방울 소리를 따라 고개를 갸웃거렸다.'],
    babyH: ['{a}[이/가] 축제 내내 품에 안겨 사람들 얼굴을 신기한 듯 올려다보았다.', '{a}[이/가] 흔들리는 리본을 잡으려고 작은 손을 꼼지락거렸다.'],
    hatch: ['{a}[이/가] 등 위에서 꾸벅꾸벅 졸다가 불꽃 소리에 번쩍 눈을 떴다.', '{a}[이/가] 낯선 냄새가 날 때마다 코를 벌름거리며 이리저리 고개를 돌렸다.'],
  },
  // 야시장이 열려 있으면 이쪽이 섞여 나옴
  // 아기·해츨링에게는 any를 섞지 않음 (서 있거나 말하는 장면이라)
  night: {
    any: ['{a}[이/가] 꼬치 굽는 냄새에 이끌려 노점 앞을 떠나지 못했다.', '{a}[이/가] 종이 등불 아래 서서 벚꽃 무늬 그림자를 한참 바라보았다.'],
    babyH: ['{a}[이/가] 품에 안긴 채 흔들리는 종이 등불을 향해 작은 손을 뻗었다.', '야시장의 따뜻한 불빛 아래에서 {a}[이/가] 포대기에 싸인 채 곤히 잠들었다.'],
    kidH: ['가면 노점 앞에서 {a}[이/가] 여우 가면을 써 보고는 "이제 아무도 날 못 알아보겠지?" 하고 속삭였다.', '{a}[이/가] 설탕 사과를 한 입 베어 물 때마다 "바삭!" 하고 소리를 따라 했다.'],
    youthH: ['{a}[이/가] 군밤 봉지를 품에 안고, 식구들 몫까지 하나씩 까서 나눠 주었다.'],
    adultH: ['{a}[이/가] 국수 노점에 앉아 뜨끈한 국물을 들이켜며 "역시 축제엔 국수지" 하고 웃었다.'],
    hatch: ['{a}[이/가] 설탕 사과 냄새를 킁킁 맡으며 노점 쪽으로 고개를 쭉 뺐다.', '{a}[이/가] 종이 등불에 비친 제 그림자를 잡으려고 빙글빙글 돌았다.'],
    littleD: ['{a}[이/가] 국화 불꽃 막대를 입에 물고 타닥타닥 튀는 불꽃을 신기한 듯 바라보았다.'],
    olderD: ['{a}[이/가] 등불이 늘어선 골목을 내려다보며, 불빛이 강물처럼 흐른다고 중얼거렸다.'],
  },
  // 함께한 날들에 남는 한 줄
  diary: ['왕도 축제에 함께 가 광장을 구경했다.', '{o}[과/와] 왕도 축제에 다녀왔다.'],
  diaryNight: ['왕도 축제 밤, 야시장 등불 아래를 함께 걸었다.'],
  drawLine: '둥지로 돌아오자 {a}[이/가] 축제 그림 한 장을 그려 내밀었다. 보물 상자에 간직했다.',
  drawNote: '불꽃이 가득한 하늘 아래 {o}[과/와] 내가 나란히 서 있는 그림.',
};

const NIGHT_MARKET = {
  region: 'capital',
  open: 18,        // 저녁 6시 (한국 시각)
  close: 5,        // 다음 날 새벽 5시 (축제가 먼저 끝나면 그때). 축제 첫날 0~5시에도 열림
  // 상인 노점: 하룻밤에 살 수 있는 개수(limit)가 정해져 있음
  npc: [
    { id: 'grill', name: '꼬치 굽는 노점', who: '꼬치집 아주머니', say: '"갓 구운 거요! 식기 전에 하나 들고 가요."',
      items: [{ id: 'nm_skewer', price: 14, limit: 5 }, { id: 'nm_corn', price: 12, limit: 5 }, { id: 'nm_candy_apple', price: 12, limit: 5 }] },
    { id: 'noodle', name: '국수 노점', who: '국숫집 할아버지', say: '"축제엔 국수지. 앉아서 한 그릇 하고 가게."',
      items: [{ id: 'nm_noodle', price: 20, limit: 3 }, { id: 'nm_hotteok', price: 10, limit: 5 }] },
    { id: 'chestnut', name: '군밤 수레', who: '군밤장수 소년', say: '"군밤이요, 군밤! 단술도 있어요!"',
      items: [{ id: 'nm_chestnut', price: 8, limit: 5 }, { id: 'nm_sikhye', price: 10, limit: 5 }] },
    { id: 'lamp', name: '등불 노점', who: '등불장이 노인', say: '"오늘 밤 하늘엔 별 대신 이것이 뜨지."',
      items: [{ id: 'nm_lantern', price: 30, limit: 1 }, { id: 'nm_sparkler', price: 16, limit: 5 }] },
    { id: 'mask', name: '가면 노점', who: '가면장수 청년', say: '"하나 써 봐요. 오늘 밤엔 아무도 당신이 누군지 몰라요."',
      items: [{ id: 'nm_mask', price: 45, limit: 1 }, { id: 'nm_star_candy', price: 12, limit: 5 }] },
    { id: 'potion', name: '떠돌이 약장수', who: '수염 난 약장수', say: '"쉿, 축제 밤에만 꺼내는 물건이오. 날개가 무거운 용에게 딱이지."',
      items: [{ id: 'sun_breath', price: 150, limit: 2 }, { id: 'nm_ember_candy', price: 60, limit: 4 }] },
  ],
  // 플레이어 노점: 하나씩. 올린 물건은 노점에 맡겨 두고, 야시장이 끝나면 팔리지 않은 것은 주인에게 돌아감
  stall: { lines: 6, priceMax: 99999, qtyMax: 999, signMax: 16 },
  greet: ['"등불 아래로 오시오. 오늘 밤은 용이든 사람이든 손님이오."', '"골목 끝까지 노점이 줄지어 섰다오. 천천히 둘러보시오."', '"축제 밤이라 성벽 궁수들도 오늘은 활을 내려놓았소."'],
};

// ── 떠돌이 야바위꾼: 하루 네 번, 한 시간씩 대륙 어딘가에 판을 벌임 (yabawi.js) ──
// 하루(한국 날짜)를 여섯 시간씩 넷으로 나눠 구간마다 한 번, 그 안의 아무 때나 나타남. 지역은 본 대륙 야생 지역 중 하나, 장소는 그 지역 장소 중 하나
// 전체 알림에는 지역 이름 대신 hint만 나옴. 장소를 찾아가면 '말 걸기'가 생김
// 판: 금화를 걸고 홀·짝을 고름. 야바위꾼이 쥔 조약돌(1~10개)이 맞으면 건 만큼 따고, 틀리면 건 만큼 잃음 (정확히 반반)
const YABAWI = {
  name: '떠돌이 야바위꾼',
  perDay: 4,                 // 하루에 나타나는 횟수 (하루를 이만큼 나눈 구간마다 한 번)
  minutes: 60,               // 한 번 머무는 시간
  edge: 10,                  // 구간 가장자리에서 이만큼(분)은 비움 (두 번이 바로 이어 붙지 않게)
  placeDepth: 3,             // 지역의 앞쪽 몇 장소에서만 판을 벌일지 (넷째는 고레벨 구역이라 낮은 레벨은 들어가지 못함. 2로 줄이면 더 많은 드래곤이 닿음)
  minBet: 1,                 // 가장 적게 걸 수 있는 금화
  maxBet: null,              // 가장 많이 걸 수 있는 금화 (null이면 가진 만큼)
  bigBet: 300,               // 이만큼 넘게 걸어 따거나 잃으면 발자취에 남음
  hints: {
    plains: '바람에 눕는 풀밭 어딘가에서', snow: '눈보라가 잦아든 하얀 땅 어딘가에서', ruins: '무너진 돌기둥 사이 어딘가에서',
    forest: '안개 낀 나무들 사이 어딘가에서', swamp: '검은 갈대가 우거진 물가 어딘가에서', canyon: '붉은 바위 골짜기 어딘가에서',
    volcano: '잿가루가 흩날리는 뜨거운 땅 어딘가에서',
  },
  greet: [
    '어이, 거기 지나가는 손님! 홀이냐 짝이냐, 한 판 어때?',
    '조약돌은 거짓말을 안 해. 거짓말은 내가 하지. …농담이야, 농담!',
    '이런 외진 데까지 손님이 다 오셨네. 금화 냄새 맡고 왔지?',
    '쉿, 경비대한테는 비밀이야. 자, 걸어 봐.',
    '한 판에 인생이 바뀌진 않아. 그래도 저녁값은 바뀌지.',
  ],
  win: ['이런, 손님 눈이 매섭구먼!', '쳇, 오늘 운이 좋은 손님이네.', '어허, 내 주머니가 가벼워지는 소리가 들리는구먼.', '다음 판엔 안 질 거야. 아마도.'],
  lose: ['헤헤, 조약돌은 정직하다니까.', '아깝다, 아까워! 한 판 더?', '금화는 잘 받았어. 다음엔 맞힐 거야, 분명히.', '운은 금화로 못 사는 법이지.'],
  // 소문: '야바위꾼의 단골' 칭호를 달고 있으면 나타날 때마다 하나씩 들려줌. 안 들은 것부터
  // kind — ruin: 멸망한 대륙 에레보스 (region이 열려 있을 때만) · tease: 아직 닫힌 region의 예고 (닫혀 있을 때만) · tale: 대륙의 옛이야기 · tip: 쓸모 있는 귀띔 (늘 사실)
  rumorLocked: '"단골한테만 하는 얘기가 있지. 자주 보는 얼굴이 되면 말이야."',
  rumorUsed: '"오늘 몫의 소문은 다 풀었어. 다음에 또 만나면 하나 더 해 주지."',
  rumorKinds: { ruin: '에레보스 이야기', tease: '에레보스 이야기', raid: '에레보스 이야기', tale: '대륙의 옛이야기', tip: '귀띔' },
  rumors: [
    { id: 'r_fire',    kind: 'ruin', region: 'ruin_shore', text: '검은 바다 건너 잿빛 상륙지에 모닥불 하나가 꺼지지 않는다더군. 늙은 드래곤 오르샤가 지킨대. 정화의 결정을 가져가면 살아남은 자들이 숨겨 둔 걸 내어 준다지.' },
    { id: 'r_nets',    kind: 'ruin', region: 'ruin_shore', text: '부서진 부두의 어부들 말이야, 아직도 그물을 던진대. 바다가 마을을 삼킨 날부터 하루도 안 쉬었다는 거야. 잡히는 건 하나도 없는데.' },
    { id: 'r_why',     kind: 'ruin', region: 'ruin_shore', text: '에레보스가 왜 멸망했냐고? 다들 다르게 말해. 하늘이 갈라졌다는 놈, 땅이 울었다는 놈… 확실한 건, 그날 이후 그 땅의 바람에선 재 냄새가 난다는 거지.' },
    { id: 'r_captain', kind: 'ruin', region: 'ruin_shore', text: '바다에 삼켜진 선장 얘기 들었나? 마지막 배를 띄우려다 배랑 같이 가라앉았대. 아직도 부두에서 출항하라고 외친다더군.' },
    { id: 'r_wheat',   kind: 'ruin', region: 'ruin_plain', text: '시든 평원은 원래 금빛 밀밭이었대. 카르넴 사람들 배를 다 채우고도 남았다지. 지금은 허수아비만 남았는데… 그놈들이 고개를 돌린다는 거, 사실이야. 내가 봤거든.' },
    { id: 'r_river',   kind: 'ruin', region: 'ruin_plain', text: '말라붙은 강바닥에 뼈 와이번들이 산대. 강이 마를 때 물을 따라 떠나지 못한 놈들이라더군. 하늘에서 뼈 부딪히는 소리가 나면 고개 숙여.' },
    { id: 'r_scare',   kind: 'ruin', region: 'ruin_plain', text: '허수아비 군주 말이야, 원래는 농부들이 밭 지키라고 세운 거래. 지키라고 세웠더니 정말로 지키고 있는 거지. 지금도, 아무도 없는 밭을.' },
    { id: 'r_heiron',  kind: 'raid', raid: 'heiron', text: '성문 앞 기사단 말이야, 드디어 쉬었대. 누가 그 단장을 꺾었는데, 쓰러지면서 "문은 아직 닫혀 있는가" 하고 묻더라나. 닫혀 있다니까 웃었대. 그 문 안에 뭐가 있길래 오백 년을 지켰을까.' }, // 레이드 첫 처치 뒤에 풀림
    { id: 'r_morven',  kind: 'raid', raid: 'morven', text: '허수아비들이 밭을 지킨다는 얘기, 반만 맞았더라고. 지키라고 주문을 새긴 마법사가 아직 거기 있었대. 모르벤이라던가. 추수가 끝나지 않았다면서 오백 년을 버텼다지. 그걸 누가 끝내 줬다던데… 너도 거기 있었나?' }, // 레이드 첫 처치 뒤에 풀림
    { id: 'r_karnem',  kind: 'ruin', region: 'ruin_capital', text: '카르넴은 용과 인간이 함께 세운 왕도였어. 성벽은 인간이 쌓고, 탑 꼭대기는 용들이 불로 구웠다지. 그런 나라가 또 있을까 싶어.' },
    { id: 'r_crown',   kind: 'ruin', region: 'ruin_capital', text: '카르넴의 마지막 왕은 왕관을 반으로 쪼개서 반쪽을 용에게 줬대. 함께 다스리자는 약속이었다나. 나머지 반쪽이 어디 있냐고? 그걸 알면 내가 여기서 조약돌이나 굴리고 있겠나.' },
    { id: 'r_knights', kind: 'ruin', region: 'ruin_capital', text: '무너진 성문 앞 기사단은 아직 대열을 안 풀었대. 왕이 "문을 열지 마라" 하고 들어간 뒤로, 아무도 해산하라는 말을 안 했거든.' },
    { id: 'r_kingdrg', kind: 'ruin', region: 'ruin_capital', text: '왕좌의 회랑에 있는 왕룡은 왕을 지키던 용이래. 검게 물든 뒤에도 왕좌 앞에서 안 비킨다더군. 지키는 게 왕인지, 빈 왕좌인지는 모르겠지만.' },
    { id: 'r_rift',    kind: 'ruin', region: 'ruin_rift', text: '심연의 균열은 대륙을 둘로 가른 틈이야. 그 아래에서 뭔가 숨을 쉰다는데… 그 숨소리를 들은 놈들은 하나같이 잠을 못 자.' },
    { id: 'r_noname',  kind: 'ruin', region: 'ruin_rift', text: '"이름을 잃은 것"이라고 들어 봤나? 균열 가장자리를 떠도는 그림자래. 이름을 불러 주면 대답한다는데, 아무도 그 이름을 몰라.' },
    { id: 'r_lastclaw', kind: 'ruin', region: 'ruin_rift', text: '거대한 고룡 하나가 대륙이 무너지던 날까지 균열 앞에서 싸웠대. 그 발톱이 아직 따뜻하다는 얘기, 허풍만은 아닐걸.' },
    { id: 'r_abyss',   kind: 'ruin', region: 'ruin_rift', text: '심연의 문턱으로 내려간 고룡은 돌아오지 않았어. 대신 그 숨결이 위로 올라오지. 거긴 오래 있지 마. 이건 진심이야.' },
    { id: 'r_core',    kind: 'ruin', region: 'ruin_shore', text: '잿빛 심장은 오염된 강적의 가슴에서 뛰던 거래. 꺼내도 식지 않아. 정화하면 단단한 힘이 된다지만, 손에 쥐고 있으면 기분이 묘하다더군.' },
    { id: 'r_orb',     kind: 'ruin', region: 'ruin_shore', text: '별을 담은 유리구슬은 그 땅 아이들 장난감이었대. 멸망한 날에도 어딘가 굴러다녔겠지. …이런 얘긴 판돈이 안 돼서 공짜야.' },
    { id: 'r_idol',    kind: 'ruin', region: 'ruin_shore', text: '오염된 용 석상을 둥지에 두면 이상하게 마음이 가라앉는다던데, 정말일까? 난 무서워서 못 두겠어.' },
    { id: 'r_quiet',   kind: 'ruin', region: 'ruin_shore', text: '오르샤한테 그날 얘길 물어봐. 하늘이 어땠는지는 말해 줘도, 누가 그랬는지는 절대 말 안 해. 이천 년째 그렇다더군.' },
    { id: 'r_library', kind: 'ruin', region: 'ruin_capital', text: '카르넴 서고에선 아직도 종이가 타고 있대. 그날부터 쭉. 그 땅은 시간이 고인다는 말이 있어. 깃발도, 어부도, 기사들도 그래서 그대로인 거라고.' },
    { id: 'r_tower',   kind: 'ruin', region: 'ruin_capital', text: '카르넴이 무너진 날 밤, 마법사 탑에만 불이 켜져 있었대. 왜 하필 거기만이냐고? …난 모른다니까. 판이나 벌이자고.' },
    { id: 'r_door',    kind: 'ruin', region: 'ruin_capital', text: '왕이 "문을 열지 마라" 했다는 그 문 말이야, 성문이 아니라는 얘기가 있어. 왕은 밖으로 나간 게 아니라 아래로 내려갔다나.' },
    { id: 't_plain',   kind: 'tease', region: 'ruin_plain', text: '상륙지 너머로 길이 하나 나 있는데, 오염이 짙어서 아직 아무도 못 갔지. 다들 결정을 모아 길을 열면… 금빛이었다는 들판을 볼 수 있으려나.' },
    { id: 't_capital', kind: 'tease', region: 'ruin_capital', text: '그 대륙 안쪽에 카르넴이라는 왕도가 있었대. 길이 열리면 가 봐. 무너진 성벽 위로 아직 깃발 하나가 펄럭인다더라.' },
    { id: 't_rift',    kind: 'tease', region: 'ruin_rift', text: '에레보스 가장 깊은 곳엔 대륙을 가른 틈이 있다더군. 거기까지 가는 길은 아직 오염에 막혀 있어. 정화도가 한참 올라야 할걸.' },
    { id: 's_beast',   kind: 'tale', text: '중앙 평원의 거수는 땅을 가르며 걷는대. 지나간 자리엔 골짜기가 생긴다나. 평원에 골짜기가 많은 게 그래서라고, 어떤 노인이 그러더군.' },
    { id: 's_ymir',    kind: 'tale', text: '북부 설원의 이미르는 서리 거신이야. 눈보라는 그놈 한숨이래. 오늘 눈보라가 심했다면, 뭐… 기분이 안 좋은 거지.' },
    { id: 's_tree',    kind: 'tale', text: '독안개 숲의 천 년 고목이 썩어 간다는 거 알아? 숲 전체가 그 뿌리 위에 있대. 고목이 쓰러지면 숲도 무너진다는 거야.' },
    { id: 's_hydra',   kind: 'tale', text: '검은 늪 히드라는 머리가 아홉이래. 하나를 자르면 둘이 난다는 건 거짓말이고, 그냥 아홉 개야. 그래도 많지.' },
    { id: 's_bird',    kind: 'tale', text: '태양 협곡의 괴조는 날갯짓 한 번에 폭풍을 부른다더군. 협곡 바람이 갑자기 바뀌면 그놈이 깬 거야.' },
    { id: 's_vargas',  kind: 'tale', text: '잿빛 화산 아래 고룡 바르가스가 자고 있대. 깨어나면 하늘이 재로 덮인다지. …아, 이미 깨어났다고? 어쩐지 요즘 덥더라.' },
    { id: 's_giant',   kind: 'tale', text: '고대 유적의 거신은 봉인에서 풀려났대. 누가 풀었냐고? 그걸 알면 현상금이 꽤 될걸.' },
    { id: 's_mobs',    kind: 'tale', text: '지역마다 머무는 드래곤들 있잖아. 다들 사연이 하나씩 있어. 끝까지 들어 주면 선물을 준다더라. 나한텐 안 주던데.' },
    { id: 's_stairs',  kind: 'tale', text: '원정 가다 보면 어둠 속으로 내려가는 계단이 나올 때가 있지. 그 아래엔 제단이 있대. 겁 없는 놈만 내려가고, 겁 많은 놈은 룬 돌이나 줍고 돌아오지.' },
    { id: 's_arden',   kind: 'tale', text: '왕도 아르덴 경비대는 내 얼굴을 알아. 그래서 내가 마을엔 판을 안 벌이는 거야. 이유는 묻지 마.' },
    { id: 's_thief',   kind: 'tale', text: '보물 도둑 무리는 반짝이는 걸 좋아해. 보물더미가 클수록 잘 꼬이지. 둥지 지킬 거 하나쯤은 두는 게 좋아.' },
    { id: 's_calm',    kind: 'tale', text: '광폭화한 용을 붙잡아 주는 건 쉬운 일이 아니야. 그래도 곁에 누가 있으면 돌아오는 길이 짧대. 혼자는 위험해.' },
    { id: 's_fish',    kind: 'tale', text: '남쪽 해안 절벽에선 비 오는 날 연어가 잘 문대. 뇌우 치는 날엔 번개 장어가 올라온다더군. 짜릿하겠지.' },
    { id: 's_ashwind', kind: 'tale', text: '아주 옛날 해안에 잿바람이 불었대. 용이 몰고 왔다는 사람도 있고, 마법사들이 불렀다는 사람도 있고. 나? 그땐 안 태어났지. 다행히.' },
    { id: 's_shadow',  kind: 'tale', text: '요즘 하늘에 용 그림자가 부쩍 늘었지? 시장 할멈들이 "용이 늘면 재가 내린다" 하더라. 옛말이래. 나한텐 손님이 느는 거지만.' },
    { id: 's_bell',    kind: 'tale', text: '옛날 바닷가 마을엔 용이 오면 치는 종이 있었대. 요즘 그런 종 치면 장사꾼들이 먼저 짐 싸. 단골손님이 놀라니까.' },
    { id: 's_flag',    kind: 'tale', text: '무너진 성채에 옛 깃발 걸어 둔 기사들 있잖아. 아르덴 경비대랑은 다른 무리야. 팔백 년 전 일을 어제처럼 말한다더군. 술 한 잔 사 주면 밤새 떠들걸.' },
    { id: 's_native',  kind: 'tale', text: '지역마다 머무는 늙은 드래곤들은 이 땅 토박이래. 요즘 용들은 대부분 바다 너머, 산맥 너머에서 건너왔다지. 토박이들이 옛날 얘기를 잘 안 하는 건… 할 얘기가 너무 많아서일걸.' },
    { id: 's_fairy',   kind: 'tale', text: '바다 건너 용이랑 사람이 왕관을 나눠 쓰던 나라 얘기, 어릴 때 할머니가 해 주던 동화였거든. 근데 그게 진짜 있었다니. 다음엔 어떤 동화가 진짜로 튀어나올지 겁난다니까.' },
    { id: 's_seabed',  kind: 'tale', text: '고대 유적 땅 밑 깊은 곳에 무언가 잠들어 있대. 뭐냐고? 끝까지 내려가 본 놈이 아무도 없는데 내가 알 턱이 있나.' }, // id는 예전 소문(바다 밑 길) 그대로: 이미 들은 기록이 어긋나지 않게
    { id: 's_pillar',  kind: 'tale', text: '고대 유적 석주들 말이야, 땅에 박은 게 아니라 땅 밑에서 솟은 거라는 얘기가 있어. 그럼 그 밑엔 뭐가 있겠어? …난 안 내려가.' },
    { id: 's_sleep',   kind: 'tale', text: '늙은 용은 몇십 년, 몇백 년씩 잔대. 깨어나면 세상이 바뀌어 있겠지. 바르가스는 천 년 만에 깨서 제일 먼저 뭘 했을까. 배가 고팠겠지, 아마.' },
    { id: 's_roots',   kind: 'tale', text: '독안개 숲 고목이 썩는 거, 누가 저주를 걸었다는 놈도 있더군. 근데 뿌리는 땅 밑으로 이어지잖아. 그럼 땅 밑은 또 어디로 이어질까?' },
    { id: 's_noking',  kind: 'tale', text: '고대 유적 금고를 지키는 "이름 잃은 왕" 있잖아. 왕이 어쩌다 이름을 잃냐고. 나 같으면 금화를 잃었으면 잃었지.' },
    { id: 'p_weak',    kind: 'tip', text: '강적은 싫어하는 숨결이 있어. 도감에 약점이 적혀 있잖아? 그걸 보고 가. 옛 전장 망령은 불이랑 번개를, 갈대밭 늪 악어는 번개를 못 견뎌.' },
    { id: 'p_star',    kind: 'tip', text: '원정을 두 시간 넘게, 끝까지 다녀오면 별똥별 조각이 떨어져 있을 때가 있어. 세 시간이면 더 잘 보이지. 중간에 불러들이면 꽝이고.' },
    { id: 'p_pity',    kind: 'tip', text: '멸망한 대륙 강적이 안 잡힌다고? 만나기만 해도 운이 쌓인대. 마흔 번쯤 만나면, 그다음 이길 때 귀한 장비가 꼭 나온다더라.' },
    { id: 'p_rest',    kind: 'tip', text: '체력이 15도 안 남았으면 사냥엔 못 나서. 둥지에서 쉬면 금방 차오르지. 무리하다 쓰러지면 상흔이 남는다고.' },
    { id: 'p_together', kind: 'tip', text: '멸망한 대륙에선 정신이 빨리 깎여. 그런데 같은 곳에 누가 함께 있으면 덜 깎인대. 혼자 다니지 마.' },
    { id: 'p_back',    kind: 'tip', text: '멸망한 대륙에서 돌아올 땐 둥지로 곧장 못 날아가. 뱃길로 건너와야 해. 행동력 세 개는 남겨 둬.' },
    { id: 'p_ward',    kind: 'tip', text: '정신 보호 장신구를 차면 오염된 땅에서 정신이 덜 깎여. 멸망한 대륙 갈 땐 꼭 챙겨.' },
    { id: 'p_stone',   kind: 'tip', text: '둥지 둘레에 결계석을 묻어 두면 보물 도둑이 들어와도 통째로 쫓아낸대. 보물더미가 크다면 아끼지 마.' },
    { id: 'p_dex',     kind: 'tip', text: '도감에 처음 보는 칸이 채워지면 약점이랑 나오는 곳이 적혀. 못 본 칸도 어디서 나오는지 힌트는 있지. 심심하면 들여다봐.' },
    { id: 'p_secret',  kind: 'tip', text: '숨겨진 제작법은 목록에 안 나와. 실험에서 재료 두세 개를 섞어 봐. 비슷하면 힌트를 주지. 바랜 두루마리를 읽어도 되고.' },
    { id: 'p_shard',   kind: 'tip', text: '정화의 결정은 오르샤가 귀한 것과 바꿔 줘. 멸망한 대륙에선 뭘 해도 조금씩 나오니까 버리지 말고 모아 둬.' },
    { id: 'p_deep',    kind: 'tip', text: '같은 지역이라도 깊은 장소일수록 귀한 재료가 잘 나와. 대신 너무 약하면 들어가지도 못하지. 사냥터 레벨을 잘 봐.' },
    { id: 'p_kin',     kind: 'tip', text: '식구를 원정에 데려가 봐. 눈이 여럿이면 찾는 것도 늘어. 애들이 수다스러운 건 덤이고.' },
    { id: 'p_arena',   kind: 'tip', text: '결투장에선 칭호 효과가 없어. 순전히 실력이지. 칭호 믿고 덤볐다간 큰코다쳐.' },
    { id: 'p_boss',    kind: 'tip', text: '대륙의 재앙은 다 같이 때려잡는 거야. 마지막 일격을 넣은 녀석한텐 따로 칭호도 준다더군.' },
    { id: 'p_mobq',    kind: 'tip', text: '지역의 드래곤들이 주는 의뢰는 자정이 지나면 바뀌어. 하루 두 개씩이니까 아침마다 들러 봐.' },
    { id: 'p_open',    kind: 'tip', text: '멸망한 대륙은 다 같이 정화할수록 새 길이 열려. 한 번 열린 길은 다시 안 닫히니까, 한 발씩만 거들어도 돼.' },
    { id: 'p_past',    kind: 'tip', text: '지역 드래곤들 이야기를 끝까지 들어 주면 옛일도 털어놓는대. 하루에 한 조각씩만. 다들 말이 달라서 문제지. 누구 말이 맞는지는… 그걸 맞히는 게 야바위 아니겠어?' },
  ],
};

// ── 업적: 효과 없이 모으는 기록 (칭호는 '다는 것', 업적은 '모으는 것') ──
// 칭호가 이미 세는 횟수(사냥·채집·제작…)와 겹치지 않게: 도감 모으기 · 이정표 · 숨겨진 사건
// cond 종류 — dexRegion: 지역의 사냥감·강적을 모두 만나기 / dexFish·dexBoss: 모두 / dexCat: [물건 분류, 개수(없으면 전부)]
//   dexPct: 도감 전체 비율 / item: 그 물건을 얻은 적 / metRuin: 멸망한 대륙의 사냥감을 만난 적 / beat: 그 사냥감(키)을 쓰러뜨린 적
//   recipes: 찾아낸 숨겨진 제작법 수 / level / nest: 둥지 단계(0부터) / count: [셈 이름, 횟수] / chron: 지나온 이야기에 이 글이 남은 적
// hidden: 이루기 전에는 이름과 조건이 '???'로 가려짐
const ACHIEVEMENTS = [
  ...Object.keys(REGION_PLACES).map((r) => ({ id: `dex_${r}`, name: `${REGIONS[r].name} 박물지`, desc: `${REGIONS[r].name}의 사냥감과 강적을 모두 도감에 올리기`, cond: { dexRegion: r } })),
  { id: 'dex_fish',     name: '낚시꾼의 꿈',     desc: '물고기를 모두 낚아 보기',                 cond: { dexFish: 1 } },
  { id: 'dex_boss',     name: '재앙을 마주하다', desc: '대륙의 재앙을 모두 만나 보기',             cond: { dexBoss: 1 } },
  { id: 'dex_treasure', name: '보물 수집가',     desc: '보물을 모두 모아 보기',                    cond: { dexCat: ['treasure'] } },
  { id: 'dex_meal',     name: '대륙의 식탁',     desc: '요리를 모두 맛보기',                       cond: { dexCat: ['meal'] } },
  { id: 'dex_equip',    name: '장신구 상자',     desc: '장신구 20가지를 얻어 보기',                cond: { dexCat: ['equip', 20] } },
  { id: 'dex_half',     name: '반쪽짜리 박물지', desc: '도감의 절반을 채우기',                     cond: { dexPct: 0.5 } },
  { id: 'dex_most',     name: '대륙의 박물학자', desc: '도감의 여덟 할을 채우기',                  cond: { dexPct: 0.8 } },
  { id: 'recipe3',      name: '비밀의 제작자',   desc: '숨겨진 제작법 셋을 찾아내기',              cond: { recipes: 3 } },
  { id: 'recipe_all',   name: '모든 비밀',       desc: '숨겨진 제작법을 모두 찾아내기',            cond: { recipes: RECIPES.filter((r) => r.hidden).length } },
  { id: 'lv25',         name: '하늘에 닿다',     desc: '레벨 25에 이르기',                         cond: { level: 25 } },
  // 대륙에서 보낸 날 (현실 시간, 드래곤을 만든 날부터)
  { id: 'days30',       name: '대륙에 깃들다',   desc: '용의 대륙에서 30일 보내기',                cond: { daysIn: 30 } },
  { id: 'days100',      name: '오래된 비늘',     desc: '용의 대륙에서 100일 보내기',               cond: { daysIn: 100 } },
  // 왕도 축제
  { id: 'fest_first',   name: '광장의 첫 춤',    desc: '왕도 축제에서 처음 춤추기',                cond: { count: ['dance', 1] } },
  { id: 'fest_joy',     name: '축제를 즐기는 용', desc: '왕도 축제에서 10번 춤추기',               cond: { count: ['dance', 10] } },
  { id: 'nest_top',     name: '가장 큰 둥지',       desc: `둥지를 ${NEST.tiers[NEST.tiers.length - 1].name}${'까지'} 넓히기`, cond: { nest: NEST.tiers.length - 1 } },
  { id: 'ruin_step',    name: '검은 바다 너머',  desc: '멸망한 대륙의 사냥감을 만나 보기',         cond: { metRuin: 1 } },
  { id: 'ruin_throne',  name: '왕좌 앞에서',     desc: '왕좌의 회랑의 강적을 쓰러뜨리기',          cond: { beat: 'ruin_throne!' } },
  // 숨겨진 업적
  { id: 'h_star',    hidden: true, name: '별을 주운 용',   desc: '먼 원정 끝에서 별똥별 조각을 줍기',       cond: { item: 'star_fragment' } },
  { id: 'h_relic',   hidden: true, name: '어둠 속 제단',   desc: '고대의 유물을 손에 넣기',                 cond: { item: 'ancient_relic' } },
  { id: 'h_core',    hidden: true, name: '식지 않는 재',   desc: '잿빛 심장을 손에 넣기',                   cond: { item: 'ashen_core' } },
  { id: 'h_crown',   hidden: true, name: '심연이 내린 것',    desc: `${MIND.legend && ITEMS[MIND.legend.item] ? ITEMS[MIND.legend.item].name : '전설의 물건'}을 손에 넣기`, cond: { item: MIND.legend ? MIND.legend.item : 'abyss_crown' } },
  { id: 'h_berserk', hidden: true, name: '돌아온 이성',    desc: '광폭화했다가 정신을 되찾기',              cond: { count: ['berserk', 1] } },
  { id: 'h_fall',    hidden: true, name: '흙을 씹다',      desc: '싸움에서 쓰러져 보기',                    cond: { chron: '쓰러졌다.' } },
  { id: 'h_robbed',  hidden: true, name: '텅 빈 보물더미', desc: '보물 도둑에게 보물을 도둑맞기',           cond: { chron: '보물을 도둑맞았다' } },
  { id: 'h_sendoff', hidden: true, name: '떠나보내는 날',  desc: '다 자란 식구를 처음 떠나보내기',          cond: { count: ['sendoff', 1] } },
  { id: 'h_story',   hidden: true, name: '한 마리의 이야기', desc: '모브 드래곤의 이야기를 끝까지 듣기',     cond: { count: ['mobstory', 1] } },
  // 엉뚱한 업적 — kills: [사냥감 키, 쓰러뜨린 수] / fishN: [물고기 id, 낚은 수] / bossKills: 한 재앙을 쓰러뜨린 수
  //   goldAt: 지닌 금화 / goldZero: 이 레벨 이상에서 금화 0닢 / mindLow: 정신이 이 값 이하 (광폭화 아닐 때) / fameAt: 용족 명성이 이 값 이하 / hourKST: 한국 시각 이 시에 접속·행동
  { id: 'q_mackerel', name: '고등어 박사',       desc: '고등어를 100마리 낚기',                  cond: { fishN: ['fish_mackerel', 100] } },
  { id: 'q_bison',    name: '들소의 천적',       desc: '들소 떼를 100마리 쓰러뜨리기',           cond: { kills: ['plains_field', 100] } },
  { id: 'q_wolfking', name: '외눈 늑대왕의 숙적', desc: '외눈 늑대왕을 10번 쓰러뜨리기',         cond: { kills: ['plains_hill!', 10] } },
  { id: 'q_regular',  name: '재앙의 단골손님',   desc: '같은 대륙의 재앙을 10번 쓰러뜨리기',     cond: { bossKills: 10 } },
  { id: 'q_sleepy',   name: '겨울잠',            desc: `둥지에서 200번 쉬기 (한 번에 ${NEST.restCountMin}분 이상)`,                     cond: { count: ['rest', 200] } },
  { id: 'h_broke',  hidden: true, name: '주머니가 가볍다', desc: '레벨 5가 넘어서 금화를 한 닢도 남기지 않기', cond: { goldZero: 5 } },
  { id: 'h_rich',   hidden: true, name: '금화 이불',       desc: '금화를 5,000닢 넘게 지니고 다니기',       cond: { goldAt: 5000 } },
  { id: 'h_dawn',   hidden: true, name: '새벽 네 시의 용', desc: '새벽 네 시에 대륙을 거닐기',              cond: { hourKST: 4 } },
  { id: 'h_thread', hidden: true, name: '실 한 가닥',      desc: '정신이 5 이하로 남은 채 버티기',          cond: { mindLow: 5 } },
  { id: 'h_shame',  hidden: true, name: '평판 따윈',       desc: "용족 명성이 '수치'까지 떨어지기",         cond: { fameAt: -60 } },
  { id: 'q_rumor',  name: '귀가 밝은 용',      desc: '떠돌이 야바위꾼에게서 소문 20가지 듣기',  cond: { count: ['rumor', 20] } },
  { id: 'h_eel',    hidden: true, name: '번개를 낚다',     desc: '번개 장어를 낚기',                        cond: { item: 'fish_eel' } },
];

module.exports = {
  SCENES_HUMAN,
  PLAY_KINDS: Object.keys(KINDS).filter((k) => !KINDS[k].hidden), // 고를 수 있는 종족 (무작위로 뽑을 때도 이것만)
  isTestDragon: (d) => !!d && !!KINDS[d.kind]?.test,                // GM 시험용 투명 드래곤인가
  KINDS, REGIONS, STANCES, STATS, CREATION, derive, ITEMS, REGION_LOOT, CREATURES, SCENES, RULES, SLOTS, RECIPES, BUFFS, FESTIVAL, NIGHT_MARKET, KIN_FEST, TITLES, TITLE_COUNT_NAMES, ACHIEVEMENTS, YABAWI, KEEPSAKES,
  PURIFY, CRAFT, SHOPS, SHOPS_SPECIAL, REP_TIERS, repTier, TRADE, FISHING, RUIN, FACILITY, NEST, HOARD_TIERS, hoardTier, RAID, STANCE_RULES, FAME_TIERS, fameTier,
  DAY, KIN, TALENTS, HUMAN_NAMES, DRAKE_NAMES, KIN_LOOKS, KIN_TRAITS, KIN_TRAIT_RULES, KIN_GROW, KIN_PLAY, KIN_TOUCH, KIN_BOND, FREE, EVENT_RULES, TRAITS, TRAIT_EARN, TRAIT_COUNTS, STAT_POINTS, MIND, PLACES, REGION_PLACES, PLACE_RULES, DEATH,
  COMBAT, BREATHS, BREATH_COST, ELEMENTS, SKILLS, HEAL_OTHER, BOSSES, BOSS, RAIDBOSS, DEPART, BONDS, MARKS, BOND_RULES, SEASONS, SEASON_RULES, WEATHERS, W_BASE, W_REGION, STATUS, CREATURE_COMBAT, ELITES, COMBOS, ENRAGE, EXP_GOALS, EXP_FORKS, EXP_RULES, EXP_LONG,
};
