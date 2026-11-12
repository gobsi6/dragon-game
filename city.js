// 고대도시 (city.js): 지하 회랑 일곱 층이 모두 밝혀지면 고대 유적 아래로 열리는 도시
// 숫자는 이 파일 위쪽 CITY_RULES에서 고친다.
// 도시 기록(재건도·재료함·기억의 벽·보탠 이)은 world 표의 'city'에, 드래곤마다 집터·골렘은 combat JSON의 city에 둔다.
// 1단계: 도시 지도·구역·재건도(하루 상한)·재료함, 내 집터(네 칸)·골렘(공사·도시 일손·채집·잔해 뒤지기), 오늘의 부탁, 기억의 벽
const { ITEMS, MIND, RUIN } = require('./game-data');

const CITY_RULES = {
  region: 'ruins',                 // 입구가 있는 지역 (지하 회랑과 같은 곳)
  dayCap: 30,                      // 드래곤마다 하루에 보탤 수 있는 재건도 (한국 시간 자정 초기화). 넘친 재건도는 버리지 않고 다음 날로 넘김
  golemEn: 3,                      // 골렘 1시간에 드는 기력
  hours: [1, 2, 4, 8],             // 골렘을 보낼 수 있는 시간
  sealPerHour: 1,                  // 골렘이 일하고 돌아올 때 1시간마다 석공 인장
  warpAp: 2,                       // 귀환 주문진으로 내 집터에 갈 때 드는 행동력 (본 대륙. 1 → 2, 2026-11-11)
  // 멸망한 대륙(에레보스)에서 주문진으로 올 때는 바다를 건널 때와 같은 행동력 (RUIN.crossAp)
  matSon: { common: 1, uncommon: 3, rare: 8 }, // 재료 10개마다 재건도 (등급별 배수)
  matSeal: 10,                     // 재료 몇 개마다 석공 인장 1
  repair: { bog_iron: 4, obsidian: 2 }, // 쓰러진 골렘 고치기
  wear: { max: 100, low: 30, perHour: { build: 3, city: 3, gather: 4, dig: 5 } }, // 골렘 내구도: 일한 시간만큼 닳음 (보낼 때 깎이고, 작업 중단이면 하지 못한 시간만큼 돌려받음). low 아래면 할 일에 손질이 뜸
  mend: { seal: 10, mat: { per: 25, cost: { rune_stone: 1, bog_iron: 1 } } }, // 손질: 석공 인장 1개마다 내구도 10, 또는 (룬이 새겨진 돌 1 + 늪철 1)마다 25
  repairGate: [null, null, 'work'],  // 골렘마다 고치기 전에 되살려야 하는 칸 (세 번째는 작업실)
  golems: 3,                       // 골렘 수 (처음엔 1기만 깨어 있음)
  fragDig: 0.02,                   // 잔해 뒤지기 1시간마다 기억 조각 확률 (재건된 구역의, 아직 벽에 없는 조각만 나옴)
  fragHand: 5,                     // 이미 채워진 조각을 오르딘에게 건네면 받는 인장
  request: { seals: 3, son: 2, pool: [['rune_stone', 8], ['red_clay', 6], ['sea_shell', 6], ['wolf_pelt', 5], ['salt_crystal', 6], ['beast_hide', 5]] },
  gather: [['sun_dust', 0.6, 2], ['cave_crystal', 0.4, 1], ['shroom_spore', 0.4, 1], ['drip_dust', 0.2, 1], ['rune_stone', 0.3, 1]], // [물건, 1시간마다 확률, 최대 개수]
  dig: [['old_tile', 0.5, 1], ['faded_cloth', 0.35, 1], ['drip_dust', 0.4, 1]], // 종유석 가루는 잔해 뒤지기가 주된 길 (채집은 가끔 덤)
};
// 도시 일곱 구역: 재건도가 차고 재료함이 다 차면 차례로 재건된다 (합 36,000 — 40명이 모두 매일 상한 30을 채워도 30일, 2/3가 열심히 하면 약 40일)
const ZONES = [
  { id: 'plaza', name: '광장', need: 2160, desc: '무너진 열주가 둥글게 둘러선 넓은 돌바닥이다. 사방의 길이 모두 이곳으로 모인다. 북쪽에 글자가 빼곡히 새겨진 긴 벽이 반쯤 묻혀 있다.', func: '기억의 벽, 도시 게시판' },
  { id: 'spring', name: '샘', need: 3600, desc: '물길이 말라붙은 둥근 샘이다. 바닥의 돌 틈으로 아주 가늘게 물소리가 들린다.', func: '샘물 마시기 (하루 3번, 체력·기력·정신 가득), 시련의 굴' },
  { id: 'archive', name: '서고', need: 4500, desc: '글자가 빼곡히 새겨진 돌판들이 줄지어 선 서고다. 대부분 쓰러져 금이 갔지만, 안쪽 몇 장은 아직 서 있다.', func: '돌판 읽기 (석공 인장·기억 조각)' },
  { id: 'green', name: '온실', need: 5400, desc: '유리 지붕이 깨진 둥근 온실이다. 깨진 틈으로 본토에서는 본 적 없는 덩굴이 비집고 나와 있다.', func: '꽃과 씨앗 거두기 (도시 재료)' },
  { id: 'forge', name: '대장간 거리', need: 6300, desc: '화로가 줄지어 선 좁은 거리다. 식은 지 오래인데도 모루 위에 그을음이 선명하다.', func: '가구 만들 때 석공 인장 20% 덜 듦' },
  { id: 'belfry', name: '종탑', need: 6300, desc: '도시에서 가장 높은 탑이다. 종은 떨어지지 않고 그대로 매달려 있지만, 줄이 끊겨 울릴 수 없다.', func: '종 울리기 (하루 다섯 번 모이면 모두의 재건도 상한 +5)' },
  { id: 'sanctum', name: '성소', need: 7740, desc: '도시 가장 깊은 곳의 돌 성소다. 굳게 닫힌 문 너머에서 아주 느린 숨소리가 들린다.', func: '잠든 이들의 문 (기억의 벽이 다 차면 열림)' },
];
{ let acc = 0; for (const z of ZONES) { z.from = acc; acc += z.need; z.to = acc; } }
// 구역마다 재료함: 골렘이 가져오는 도시 재료만 받는다. 재건도와 재료함이 둘 다 차야 재건된다.
// 양은 '그 구역 재건도가 차는 동안 서버 전체에 남는 골렘 시간'의 약 80%로 맞춤 (멤버 40명, 2/3가 열심히)
const ZONE_MATS = {
  plaza:   {}, // 광장·샘은 재건도만 (초반엔 다들 집을 짓느라 바쁨). 재료함은 서고부터
  spring:  {},
  archive: { old_tile: 650, faded_cloth: 450, sun_dust: 400, drip_dust: 200 },
  green:   { sun_dust: 800, shroom_spore: 650, cave_crystal: 400, faded_cloth: 200 },
  forge:   { sun_dust: 1000, old_tile: 650, cave_crystal: 300, drip_dust: 200, gold: 150000 },
  belfry:  { sun_dust: 700, faded_cloth: 450, cave_crystal: 450, old_tile: 200, gold: 250000 },
  sanctum: { sun_dust: 1200, cave_crystal: 650, old_tile: 650, shroom_spore: 500, faded_cloth: 500, drip_dust: 250, gold: 400000 },
};
const BOX_SEAL = 10; // 재료함에 넣은 재료 몇 개마다 석공 인장 1
// 금: 대장간 거리(화로와 모루)·종탑(종을 다시 붓기)·성소(문의 금박)에는 둥지의 금화를 녹여 넣음. 'gold'는 물건이 아니라 금화
const GOLD_SEAL = 5000;             // 녹여 넣은 금화 몇 마다 석공 인장 1
const matName = (k) => (k === 'gold' ? '금 (녹인 금화)' : ITEMS[k].name);
const CITY_NEED = ZONES[ZONES.length - 1].to;
const FRAGS = {
  plaza: [
    { t: '하나였던 땅', s: '땅은 하나였다. 이쪽에는 우리의 도시가, 저쪽 끝에는 인간들의 땅이 있었다.\n날개로 사흘을 날아야 닿는 거리였다.\n우리는 서로를 알았지만, 같은 지붕 아래 살지는 않았다.' },
    { t: '돌에 새기는 법', s: '우리는 잊지 않으려고 돌에 새겼다.\n날개를 펴기 전에 한 줄, 알을 품기 전에 한 줄.\n이 벽의 첫 글자는 도시의 첫 용이 발톱으로 그은 것이다.' },
    { t: '날개 그늘', s: '광장은 하늘로 열려 있었다. 해가 기울면 수백의 날개 그림자가 돌바닥에 겹쳤다.\n새끼들은 그 그림자를 밟으며 나는 법을 익혔다.' }
  ],
  spring: [
    { t: '검게 흐린 샘', s: '어느 날 샘이 검게 흐려졌다. 땅 깊은 곳, 심연에서 무언가가 깨어나고 있었다.\n불로 태워도, 숨으로 얼려도 그것은 물러나지 않았다.' },
    { t: '인간의 사절', s: '저쪽 끝 인간들의 땅에서 사절이 왔다. 그들의 우물도 흐려지고 있었다.\n작은 몸으로 먼 길을 걸어온 그들을, 우리는 처음으로 샘가에 앉혔다.' },
    { t: '첫 약속', s: '우리는 힘을 내고, 인간은 주문과 지혜를 냈다.\n샘물을 나눠 마시는 것으로 약속을 맺었다.\n용과 인간이 처음으로 손을 잡은 날이다.' }
  ],
  archive: [
    { t: '심연의 틈', s: '심연으로 통하는 틈은 인간들의 땅 아래에 있었다.\n우리는 그 위에 문을 세우기로 했다. 다시는 열리지 않을 문을.' },
    { t: '봉인의 날', s: '문을 거는 날, 우리의 숨과 인간의 주문이 함께 틈을 눌렀다.\n문이 닫히는 순간, 땅이 비명을 질렀다.' },
    { t: '바다가 생기다', s: '땅이 무너지고 갈라졌다. 갈라진 자리로 바다가 밀려들었다.\n인간들의 땅은 바다 건너가 되었고, 문은 그들 곁에 남았다.' }
  ],
  green: [
    { t: '가라앉은 도시', s: '우리 도시는 바닥으로 가라앉았다.\n하늘이 있던 자리에 바위 천장이 내려앉았다. 날개를 펼 곳이 사라졌다.' },
    { t: '떠난 이들', s: '바다를 건너 인간들 곁에서 살겠다는 이들이 있었다.\n함께 봉인을 건 이들이니 믿을 수 있다고 했다. 우리는 그들을 붙잡지 않았다.' },
    { t: '남은 이들', s: '나머지는 남았다. 가라앉았어도 고향이었다.\n빛나는 이끼를 모아 온실을 밝히고, 햇빛 없이 피는 꽃을 길렀다.' }
  ],
  forge: [
    { t: '영원하지 않은 봉인', s: '우리는 첫 봉인이 영원하리라 믿지 않았다.\n문은 바다 건너 인간들 곁에 있다. 언젠가 풀리면, 재앙은 바다를 건너 이곳까지 올 것이다.' },
    { t: '잠든 돌', s: '화로에 돌을 달구고 룬을 새겼다. 돌 파수꾼과 골렘이 하나씩 일어섰다.\n"잠든 돌이 길을 지킨다." 우리는 그들에게 그 말 하나만 가르쳤다.' },
    { t: '일곱 겹', s: '고향 둘레에 일곱 겹의 회랑을 쌓았다. 층마다 네 기둥을 세우고 불을 맡겼다.\n일곱 겹의 불이 꺼지지 않는 한, 이 도시는 무너지지 않는다.' }
  ],
  belfry: [
    { t: '가장 높은 탑', s: '도시에서 가장 높은 탑은 바위 천장을 뚫고 땅 위까지 솟았다.\n땅 위에서 보면, 그 꼭대기는 이끼 낀 돌기둥처럼 보일 것이다.' },
    { t: '바다를 향한 창', s: '탑 꼭대기의 창은 바다 쪽을 향해 냈다.\n떠난 이들의 소식이 오면 가장 먼저 알 수 있도록.\n소식은 한 번도 오지 않았다.' },
    { t: '함께 당기는 줄', s: '종은 혼자서는 크게 울리지 않게 만들었다. 여럿이 차례로 줄을 당겨야 소리가 도시 끝까지 닿는다.\n종이 크게 울린 날이면, 도시의 모두가 조금 더 오래 일했다.' }
  ],
  sanctum: [
    { t: '길어지는 잠', s: '세월이 흐를수록 우리의 잠은 길어졌다. 깨어 있는 날보다 잠든 날이 많아졌다.\n돌에 새길 일도 점점 줄었다.' },
    { t: '마지막 세대', s: '마지막 세대는 성소 가장 깊은 방에 몸을 뉘었다.\n방으로 가는 길은 제단 뒤에서 시작된다. 문은 안에서 열지 않는다.' },
    { t: '깨울 이에게', s: '마지막으로 새긴 말이다.\n"우리를 깨우는 이가 있다면, 떠난 이들의 소식을 가져온 자이기를.\n그 소식을 문 앞에서 말하라."' }
  ]
};

// 집터 여섯 가지: 네 번째 칸만 다르다 (덤 효과는 다음 단계에서)
const PLOTS = [
  { id: 'spring', name: '샘가 집', mood: '물소리, 이끼 낀 돌계단', room: '작은 연못', perk: '하루 한 번 샘물 한 병 (어디서나 마시면 체력·기력·정신 가득)', ownMats: { sea_shell: 60, salt_crystal: 30, glow_moss: 30, cave_crystal: 30, bog_pearl: 5 } },
  { id: 'green', name: '온실 옆 집', mood: '덩굴 담장, 빛나는 꽃', room: '지붕 정원', perk: '하루 한 번 정원 거두기 (빛버섯 포자·동굴 수정, 가끔 이끼꽃)', ownMats: { shroom_spore: 50, red_clay: 40, glow_moss: 30, living_bark: 15, frost_lichen: 10 } },
  { id: 'archive', name: '서고 뒤 집', mood: '돌판 서가, 조용함', room: '새김 방', perk: '기억 조각 확률 ×1.3, 하루 한 번 새김 (석공 인장 2)', ownMats: { rune_stone: 55, old_tile: 35, cave_crystal: 20, drip_dust: 15, old_scroll: 15 } },
  { id: 'forge', name: '대장간 골목 집', mood: '화롯불, 그을린 벽', room: '작은 화덕', perk: '골렘이 일하는 시간 −5%', ownMats: { sun_dust: 40, bog_iron: 35, obsidian: 30, cave_crystal: 30, volcanic_ash: 25, gold_ore: 10 } },
  { id: 'belfry', name: '종탑 아래 집', mood: '높은 창, 바다 쪽 전망', room: '망루', perk: '하루 한 번 망루에서 일하러 간 골렘 하나를 바로 불러들임', ownMats: { ice_shard: 35, bog_iron: 35, cave_crystal: 30, sea_glass: 25, salt_crystal: 20 } },
  { id: 'plaza', name: '광장 앞 집', mood: '넓은 마당, 오가는 이들', room: '앞뜰', perk: '하루 한 번 앞뜰 쓸기 (오가는 용들이 떨어뜨린 도시 재료 6개)', ownMats: { old_tile: 45, red_clay: 35, wolf_pelt: 25, sea_shell: 25, beast_hide: 20, cave_crystal: 10 } },
];
const PI = Object.fromEntries(PLOTS.map((p) => [p.id, p]));
// 예전(재료가 적던 때) 기준. 이 기준으로 이미 되살린 칸은 되살린 채로 둔다 (한 번만 확인)
const OLD_MATS = { yard: { rune_stone: 12, red_clay: 8 }, work: { rune_stone: 8, wolf_pelt: 7, bog_iron: 8 }, live: { obsidian: 8, glow_moss: 6, bog_pearl: 2 },
  own: { spring: { sea_shell: 12, glow_moss: 6, cave_crystal: 4 }, green: { shroom_spore: 10, red_clay: 8, glow_moss: 6 }, archive: { old_tile: 10, rune_stone: 10, drip_dust: 6 }, forge: { bog_iron: 10, obsidian: 6, sun_dust: 6 }, belfry: { bog_iron: 6, faded_cloth: 8, cave_crystal: 4 }, plaza: { old_tile: 8, wolf_pelt: 6, red_clay: 8 } } };
const ROOMS = (plot) => [
  { id: 'yard', name: '마당', hours: 6, mats: { rune_stone: 40, red_clay: 30, beast_hide: 15, drip_dust: 15 }, opens: '꾸미기 · 바깥 뜰 · 기본 가구' },
  { id: 'work', name: '작업실', hours: 12, mats: { rune_stone: 40, old_tile: 30, wolf_pelt: 25, bog_iron: 25, sun_dust: 20 }, opens: '세 번째 골렘 고치기 · 작업실 생산대 · 기본 가구' },
  { id: 'live', name: '거처', hours: 20, mats: { faded_cloth: 35, obsidian: 25, glow_moss: 25, sea_glass: 20, cave_crystal: 20, bog_pearl: 5 }, opens: '단잠 · 기본 가구' },
  { id: 'own', name: PI[plot].room, hours: 30, mats: PI[plot].ownMats, opens: '집터 덤 · 기본 가구' },
];

// ── 내 집터 그림·가구 (Franuka·Fantasy RPG 팩을 다듬은 그림) ──
// 도면 그림, 가구 크기, 기본 배치, 가구 값은 public/house/pack.json 하나에 있고 화면과 서버가 같이 읽는다 (tools/house-pack에서 만든다)
const PACK = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'public', 'house', 'pack.json'), 'utf8'));
// 가구: 석공 인장과 재료로 만들고, 가진 만큼만 꾸미기에 놓을 수 있다. 칸을 되살리면 그 칸의 기본 가구(FURN_GIFT)가 저절로 생긴다
const FURN = Object.fromEntries(Object.entries(PACK.cat).map(([k, c]) => [k, { name: c.name, seals: c.seals, mats: c.mats, cat: c.cat }]));
// 장식 도면: 오르딘에게 석공 인장으로 사면 그 가구를 만들 수 있게 됨 (한 번 사면 계속). 칸을 되살릴 때 생기는 기본 가구는 도면 없이도 받음
const BLUEPRINT = Object.fromEntries(Object.entries(PACK.cat).filter(([, c]) => c.bp > 0).map(([k, c]) => [k, c.bp]));
const BPKEY = Object.fromEntries(Object.entries(PACK.cat).map(([k, c]) => [k, c.bpKey || k])); // 색유리 창처럼 여러 색이 도면 하나를 같이 씀
const bpName = (k) => PACK.cat[k].bpName || PACK.cat[k].name;
// 칸을 되살릴 때 저절로 생기는 기본 가구 (집터마다, 칸마다 개수). 기본 배치(PACK.defaults)에서 센 값
const FURN_GIFT = PACK.gift;
// 가진 수에 끝이 있는 가구 (만들기에서 막음). 텃밭: 수확이 개수만큼 곱해져 재료 균형이 무너지지 않게
const FURN_CAP = { bedplot: 6 };
// 바닥·벽 바꾸기: 지붕 있는 칸(거처·고유 칸·작업실)의 바닥과 벽, 마당 안쪽 바닥 (석공 인장, 한 번 사면 어느 칸에서든)
const LOOK = { floors: Object.fromEntries(PACK.floors.map((f) => [f.id, f.name])), walls: Object.fromEntries(PACK.walls.map((f) => [f.id, f.name])),
  yard: PACK.yardFloors, rooms: ['live', 'own', 'work'], fdef: PACK.fdef, wdef: PACK.wdef, cost: 25 };
// 꾸미기: 도면 320×240 도트. 칸 좌표·놓는 규칙은 화면(index.html HP)과 같음
const DECO = { max: 500, /* 놓는 수 제한은 사실상 없음 (저장 크기만 막는 안전선) */ W: PACK.W, H: PACK.H, rooms: PACK.rooms, yard: PACK.yard, block: PACK.block, door: PACK.door,
  size: Object.fromEntries(Object.entries(PACK.sprites).map(([k, s]) => [k, [s.w, s.h]])),
  base: Object.fromEntries(Object.entries(PACK.sprites).map(([k, s]) => [k, s.of || k])), // 방향 그림(의자 뒤·옆 등)은 같은 가구로 셈
  layer: Object.fromEntries(Object.entries(PACK.sprites).map(([k, s]) => [k, s.layer || ''])), // flat: 깔개(위에 다른 것을 놓음), wall: 벽 장식
  stack: Object.fromEntries(Object.entries(PACK.sprites).map(([k, s]) => [k, !!s.stack])) }; // 화분·등·촛대·책: 가구 위에 올려 둘 수 있음
// 올려 둔 소품인지: 소품의 발(아래 가운데)이 다른 가구(바닥 가구, 소품 아님) 위에 있으면 그 가구 위에 올린 것 → 'top' 층 (소품끼리만 겹침 검사, 받친 가구 바로 앞에 그림)
const decoSupport = (it, list) => { if (!DECO.stack[it.s]) return null; const [w, h] = DECO.size[it.s], fx = it.x + w / 2, fy = it.y + h - 1;
  return list.find((o) => o !== it && DECO.layer[o.s] === '' && !DECO.stack[o.s] && (() => { const [ow, oh] = DECO.size[o.s]; return fx >= o.x && fx < o.x + ow && fy >= o.y && fy < o.y + oh; })()) || null; };
const decoLayer = (it, list) => (decoSupport(it, list) ? 'top' : DECO.layer[it.s]);
// 텃밭: 놓아 둔 텃밭(두둑)에 금화로 씨앗을 사서 심고, 물을 주며 기르고, 다 자라면 거둬 금화와 재료를 얻는다
// hours: 물을 계속 줄 때 다 자라는 시간. 물을 안 주면 dry 배 속도. 물 한 번은 자라는 시간의 wet 만큼 촉촉함 (촉촉할 때는 또 줄 수 없음)
// 거두면 작물 아이템(item, got개)과 재료 조금(mat). 작물은 먹으면 회복, 둥지 아이 먹이, 자유 제작 재료로 쓰임 (game-data.js)
const GARDEN = { dry: 0.5, wet: 0.5, crops: {
  carrot:    { name: '당근',     hours: 4,  seed: 15, item: 'carrot',    got: [3, 4], mat: ['red_clay', 1, 2] },
  berry:     { name: '산딸기',   hours: 8,  seed: 25, item: 'raspberry', got: [4, 6], mat: ['glow_moss', 1, 2] },
  sunflower: { name: '해바라기', hours: 16, seed: 40, item: 'sunflower', got: [3, 4], mat: ['sun_dust', 1, 2] } } };
const gRnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const gYield = (c) => [{ id: c.item, qty: gRnd(...c.got) }, { id: c.mat[0], qty: gRnd(c.mat[1], c.mat[2]) }];
const GSTAGE = ['씨앗', '새싹', '다 자람', '거둔 뒤'];
// 2026-11 팩 그림으로 바꾸기 전 가구·도면 → 새 가구 (가진 수를 그대로 옮김. 짝이 없는 것은 석공 인장으로 돌려줌)
const OLD_FURN = { pot: 'pot', crate: 'crate', barrel: 'barrel', signpost: 'signpost', bedplot: 'bedplot', planter: 'planter', bench: 'bench', lamp: 'lamp', table: 'table', shelf: 'shelf', rug: 'rug', steps: 'rock', bed: 'bed', workbench: 'workbench',
  tablets: 'bookcase', tablets2: 'bookcase', tablets3: 'bookcase', arch: 'arch', carvedesk: 'lectern', anvil: 'anvil', bell: 'bell', hearth: 'hearth', telescope: 'clock', pond: 'pond', well: 'well', jar: 'pot', chair: 'chair',
  fence: 'fence_wood', flowers: 'flowers', mushroom: 'mushroom', bush: 'bush', stepstone: 'rock', flowerbed: 'planter', stonelamp: 'lamp', brazier: 'torch', tree: 'bush', candle: 'candle', cactus: 'pot', chest: 'chest', sofa: 'bench',
  mosaic: 'rug', crystallamp: 'lamp', goldlamp: 'lamp', glowpatch: 'bedplot', bookcase: 'bookcase', nestbed: 'rug', tapestry: 'banner', fountain: 'fountain', goldpile: 'chest', orb: 'lamp' };
const OLD_FURN_SEALS = {}; // 짝이 없어 인장으로 돌려주는 가구 (만들 때 든 인장). 나무 울타리는 2026-11 v7부터 새 나무 울타리로 옮겨짐
const OLD_BP = { arch: 'arch', hearth: 'hearth', bookcase: 'bookcase', well: 'well', fountain: 'fountain', pond: 'pond', bell: 'bellstand', carvedesk: 'lectern', tapestry: 'banner', telescope: 'clock' };
const OLD_BP_SEALS = { stonelamp: 30, brazier: 30, mosaic: 40, crystallamp: 40, goldlamp: 50, glowpatch: 50, nestbed: 60, goldpile: 50, orb: 50 };
// 오르딘 교환: 하루 3번까지(희귀·도시 재료 통틀어), 석공 인장으로 귀한 재료나 도시 재료 묶음을 바꿈. 날마다 희귀 1가지 + 도시 재료 3가지가 나옴 [물건, 인장, 개수]
const TRADE = { perDay: 3, rare: [['ancient_relic', 50, 1], ['sun_stone', 40, 1], ['bog_pearl', 35, 1]],
  city: [['drip_dust', 15, 5], ['cave_crystal', 12, 5], ['shroom_spore', 12, 5], ['faded_cloth', 8, 5], ['old_tile', 8, 5], ['sun_dust', 8, 8]] }; // 묶음은 작게: 재료함은 골렘이 주로 채우고, 교환은 모자란 것을 메우는 정도
const ZF_NAMES = { spring: 1, archive: 1, green: 1, belfry: 1, sanctum: 1 }; // 구역 기능 중 직접 하는 것 (대장간 거리는 늘 켜지는 효과)
const JOBS = { build: '집터 공사', city: '도시 일손', gather: '채집', dig: '잔해 뒤지기' };
// 작업실 생산대: 작업실을 되살리면 열림. 골렘이 가져온 도시 재료를 일반 제작에 쓰이는 재료로 바꿈 (바로 나옴, 하루 perDay번까지 · 한국 시간 자정에 다시)
// 거처의 단잠: 거처를 되살리면 하루 한 번. 몇 시간 동안 채집에서 하나 더 찾을 확률이 오름 (요리 버프와 따로 걸림)
const NAP = { hours: 6, gather: 0.10 };
const WORKSHOP = { perDay: 5, list: [ // 하루 3 → 5번 (2026-11-11)
  { out: 'sun_stone', qty: 1, needs: { sun_dust: 12, cave_crystal: 2 } },
  { out: 'living_bark', qty: 1, needs: { shroom_spore: 5, drip_dust: 2 } },
  { out: 'ancient_relic', qty: 1, needs: { old_tile: 10, faded_cloth: 6 } },
  { out: 'glow_moss', qty: 2, needs: { shroom_spore: 4, drip_dust: 1 } },
] };
const GOLEM_NAMES = ['유적 골렘 1', '유적 골렘 2', '유적 골렘 3']; // 기본 이름 (내 집터 골렘 탭에서 바꿀 수 있음)
const OLD_GOLEM_NAMES = ['돌멩이', '이끼등', '모래발'];
const GOLEM_NAME_RE = /^[가-힣A-Za-z0-9 ·'\-]{1,12}$/;

const josa = (w, a, b) => { w = String(w); const l = w[w.length - 1]; if (/[0-9]/.test(l)) return '013678'.includes(l) ? a : b; const c = w.charCodeAt(w.length - 1); if (c < 0xac00 || c > 0xd7a3) return b; if (a === '으로' && (c - 0xac00) % 28 === 8) return b; return (c - 0xac00) % 28 ? a : b; }; // 숫자로 끝나면 읽는 소리대로 (일·삼·육·칠·팔·영은 받침)
const ga = (n) => `${n}${josa(n, '이', '가')}`;
const ro = (w) => { const c = String(w).charCodeAt(String(w).length - 1); if (c < 0xac00 || c > 0xd7a3) return `${w}로`; const t = (c - 0xac00) % 28; return `${w}${t && t !== 8 ? '으로' : '로'}`; }; // ㄹ 받침은 '로'
const eul = (n) => `${n}${josa(n, '을', '를')}`;
const err = (t) => ({ error: t });
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); // '__proto__' 같은 이름을 걸러냄


// ═══ 시련의 굴: 샘이 재건되면 열림. 사흘마다 규칙과 미로가 바뀌는 혼자 걷는 미로 + 끝방의 석상 ═══
// 한 주기(사흘)의 첫 미로는 모두 같음 (순위는 이 미로에서 끝방에 닿을 때까지 쓴 횃불 총량). 끝방에 닿으면 그 드래곤만 새 미로로(주기마다 두 번까지).
// 보상은 미로를 깰 때마다: 첫 미로는 많이, 새 미로는 덤으로 적게. 석상은 끝방에 한 번 닿으면 로비에서 몇 번이든 도전, 보상은 깬 미로 하나당 한 번.
// 입장 횟수·한 번에 드는 횃불 제한 없음 (쓴 횃불이 곧 순위 점수). 걷기·싸움은 화면에서, 입장·화톳불·쓴 횃불·기록·보상은 서버에서.
const CAVE = {
  usedMax: 2000,            // 한 번 들어가서 쓸 수 있다고 믿는 횃불의 끝 (이상한 값 막기)
  rules: ['keys', 'dark', 'crumble', 'patrol', 'water'], // 주기마다 차례로
  cycleDays: 3,             // 미로·규칙·순위가 바뀌는 주기 (한국 시간 자정 기준)
  newMazes: 2,              // 첫 미로를 깬 뒤 한 주기에 더 열리는 새 미로 수
  names: { dark: '어둠의 날', crumble: '무너지는 날', keys: '열쇠의 날', patrol: '순찰의 날', water: '물의 날' },
  lines: { dark: '바로 옆 칸만 보인다. 화톳불도 붙어 서야 보인다.', crumble: '지나온 칸은 다섯 걸음 뒤에 무너진다. 되돌아갈 수 없다.', keys: '흩어진 돌 열쇠 셋을 모아야 끝방이 열린다.', patrol: '파수꾼 둘이 정해진 길을 오간다. 마주치면 지나칠 수 없으니 숨죽여 기다려야 한다.', water: '열 걸음마다 입구 쪽부터 물에 잠긴다. 잠긴 칸은 지나갈 수 없다.' },
  // 깬 미로마다 보상: first = 그 주기 첫 미로, bonus = 그 뒤 새 미로. clear = 끝방에 닿을 때, beat = 그 미로 몫으로 석상을 넘을 때
  // tab: 그 몫으로 석상을 넘을 때 시련의 돌판이 나올 확률. 돌판을 모두 모았으면 대신 인장 tabFull
  reward: { first: { clear: 6, beat: 6, tab: 0.15 }, bonus: { clear: 2, beat: 2, tab: 0.05 } }, tabFull: 2,
  echo: { owner: '오래된 용', kind: 'white', sum: 120, hpMax: 480 }, // 끝방의 석상: 모두 오래된 용, 들어갈 때의 내 능력치 합·굴 체력에 맞춰 섬
  echoHpMul: 1.6,           // 석상 체력 = 내 굴 체력 × 이 값 (2배면 어떤 수를 써도 이길 수 없었음)
  carved: 6,                // 받침돌에 새겨 보여 줄, 최근 석상을 넘은 이름 수
  dmgRef: 250,              // 주고받는 피해를 (내 굴 체력 ÷ 이 값)배로: 체력이 많든 적든 석상전 난이도가 같게
};
const TABLETS = [
  { t: '첫 비행', s: '오늘 처음으로 회랑 끝까지 날았다. 날개가 벽에 세 번 부딪혔다.\n시험관은 웃지 않았지만, 꼬리 끝이 흔들렸다.' },
  { t: '서툰 발톱 글씨', s: '이름을 새기다 획 하나를 빠뜨렸다.\n고치지 않기로 했다. 이것도 나다.' },
  { t: '꾸중 한 줄', s: '"불을 아껴라. 굴은 네 숨이 다할 때까지 기다려 주지 않는다."\n그 아래, 작게: 알겠습니다.' },
  { t: '물에 잠긴 날', s: '물이 발목까지 차올랐을 때, 처음으로 뒤를 돌아보지 않았다.\n앞만 보면 길이 줄어든다.' },
  { t: '열쇠 셋', s: '세 번째 열쇠는 처음 지나친 막다른 길에 있었다.\n돌아가는 것도 길이다.' },
  { t: '석상', s: '끝방의 돌은 나보다 먼저 온 이의 모습을 하고 있었다.\n그를 넘고 나서야, 그도 여기서 떨었다는 걸 알았다.' },
];
const N = 21, D4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gen(seed) {
  const R = rng(seed), g = [];
  for (let r = 0; r < N; r++) g.push(Array(N).fill('#'));
  g[1][1] = '.'; const st = [[1, 1]];
  while (st.length) {
    const cur = st[st.length - 1], opts = [];
    for (const d of D4) { const nr = cur[0] + d[0] * 2, nc = cur[1] + d[1] * 2; if (nr > 0 && nr < N - 1 && nc > 0 && nc < N - 1 && g[nr][nc] === '#') opts.push(d); }
    if (!opts.length) { st.pop(); continue; }
    const p = opts[Math.floor(R() * opts.length)];
    g[cur[0] + p[0]][cur[1] + p[1]] = '.'; g[cur[0] + p[0] * 2][cur[1] + p[1] * 2] = '.';
    st.push([cur[0] + p[0] * 2, cur[1] + p[1] * 2]);
  }
  for (let t = 0, made = 0; t < 3000 && made < Math.floor(N * 0.7); t++) {
    const r = 1 + Math.floor(R() * (N - 2)), c = 1 + Math.floor(R() * (N - 2));
    if (g[r][c] !== '#') continue;
    const v = g[r - 1][c] === '.' && g[r + 1][c] === '.' && g[r][c - 1] === '#' && g[r][c + 1] === '#';
    const h = g[r][c - 1] === '.' && g[r][c + 1] === '.' && g[r - 1][c] === '#' && g[r + 1][c] === '#';
    if (v || h) { g[r][c] = '.'; made++; }
  }
  const dist = Array.from({ length: N }, () => Array(N).fill(-1)), q = [[1, 1]], cells = []; dist[1][1] = 0;
  while (q.length) { const [r, c] = q.shift(); cells.push([r, c, dist[r][c]]); for (const d of D4) { const nr = r + d[0], nc = c + d[1]; if (g[nr][nc] !== '#' && dist[nr][nc] < 0) { dist[nr][nc] = dist[r][c] + 1; q.push([nr, nc]); } } }
  const E = cells[cells.length - 1], far = E[2];
  const pick = (lo, hi) => { const cand = cells.filter((x) => x[2] >= far * lo && x[2] <= far * hi && g[x[0]][x[1]] === '.'); return cand[Math.floor(R() * cand.length)]; };
  const fires = [pick(0.3, 0.4), pick(0.6, 0.7)].map((x) => `${x[0]},${x[1]}`);
  const keys = [pick(0.2, 0.45), pick(0.45, 0.7), pick(0.7, 0.9)].map((x) => `${x[0]},${x[1]}`);
  // 순찰 길: 아무 칸에서 시작해 되돌아오지 않고 8~10칸 걷기
  const patrols = [];
  for (let k = 0; k < 2; k++) {
    for (let tries = 0; tries < 60; tries++) {
      const s = pick(0.25 + k * 0.35, 0.5 + k * 0.35); const path = [[s[0], s[1]]], seen = new Set([`${s[0]},${s[1]}`]);
      while (path.length < 10) { const [r, c] = path[path.length - 1]; const nx = D4.map((d) => [r + d[0], c + d[1]]).filter(([nr, nc]) => g[nr][nc] !== '#' && !seen.has(`${nr},${nc}`)); if (!nx.length) break; const n = nx[Math.floor(R() * nx.length)]; seen.add(`${n[0]},${n[1]}`); path.push(n); }
      if (path.length >= 8) { patrols.push({ path, i: 0, dir: 1 }); break; }
    }
  }
  g[1][1] = 'S'; g[E[0]][E[1]] = 'E';
  return { g, dist, E: [E[0], E[1]], far, fires, keys, patrols };
}


module.exports = function city({ io, db, online, logic, sendMe }) {
  const R = CITY_RULES;
  const W = db.worldGet('city', null) || { son: 0, wall: {}, hands: {} };
  if (!W.wall) W.wall = {}; if (!W.hands) W.hands = {}; if (!W.box) W.box = {}; if (!W.givers) W.givers = {};
  if (!W.done) { W.done = {}; for (const z of ZONES) { if (W.son >= z.to) W.done[z.id] = 1; else break; } } // 재료함이 생기기 전에 이미 재건된 구역은 그대로
  const save = () => db.worldSet('city', W);
  const dayIdx = () => logic.dayIdx();
  const boxFull = (z) => Object.entries(ZONE_MATS[z.id]).every(([k, n]) => ((W.box[z.id] || {})[k] || 0) >= n);
  const curZone = () => ZONES.find((z) => !W.done[z.id]) || null;
  const zState = (z) => (W.done[z.id] ? 'done' : curZone() === z ? 'going' : 'locked');
  // 재건도·재료함이 둘 다 찬 구역을 차례로 재건 (재건도가 앞서 쌓였으면 재료함이 차는 순간 재건)
  function advance() {
    for (const z of ZONES) {
      if (W.done[z.id]) continue;
      if (W.son >= z.to && boxFull(z)) { W.done[z.id] = 1; news(`모두가 힘을 모아 고대도시의 ${ga(z.name)} 재건되었다.${z.id === 'plaza' ? ' 광장 벽에 기억의 벽이 섰다.' : ''}`); continue; }
      break;
    }
  }
  const done = (id) => zState(ZONES.find((z) => z.id === id)) === 'done';
  const news = (text) => { const at = Date.now(); let id = 0; try { id = db.addChat('!', { dragonId: 0, name: '', kind: '', text, at }); } catch {} io.emit('system', { text, at, news: true, id }); };
  // 고대도시가 열렸는가: 지하 회랑 일곱 층을 모두 밝혔거나, 서버 환경 변수 CITY_OPEN=1 (시험용)
  // 지하 회랑 일곱 층이 모두 열리면 저절로 열림. GM은 점검할 때 잠시 닫을 수만 있음 (CITY_OPEN=1은 시험용)
  const pathOpen = () => process.env.CITY_OPEN === '1' || !!(db.worldGet('maze', null) || {}).city;
  const isOpen = () => pathOpen() && !W.closed;

  // ── 드래곤의 도시 상태 ──
  const ct = (d) => {
    const c = logic.combatJson(d); if (!c.city || typeof c.city !== 'object') c.city = {};
    const m = c.city;
    if (!m.golems) m.golems = GOLEM_NAMES.slice(0, R.golems).map((name, i) => ({ name, awake: i === 0, job: null, hours: 0, start: 0, until: 0, report: null }));
    m.golems.forEach((g, i) => { if (!g.named && OLD_GOLEM_NAMES.includes(g.name)) g.name = GOLEM_NAMES[i]; }); // 예전 기본 이름은 새 기본 이름으로 (직접 지은 이름은 그대로)
    m.golems.forEach((g) => { if (g.dur == null) g.dur = R.wear.max; }); // 내구도가 생기기 전 골렘은 새것으로
    if (m.seals == null) m.seals = 0; if (!m.frags) m.frags = []; if (m.frac == null) m.frac = 0;
    if (!m.furn || typeof m.furn !== 'object') m.furn = {}; if (!m.furnGot) m.furnGot = {};
    migrateRooms(m); packMigrate(m);
    if (m.day !== dayIdx()) { m.day = dayIdx(); m.daySon = 0; m.req = null; }
    if (m.inside && d.region !== R.region) m.inside = false; // 다른 곳으로 날아가면 도시에서 나온 것으로
    return m;
  };
  // 팩 그림으로 바꾸기 전 집터: 가진 가구·도면은 새 가구로 옮기고, 배치는 새 기본 배치로, 산 바닥·담·벽지는 인장으로 돌려줌 (한 번만)
  function packMigrate(m) {
    if (m.packV === PACK.v) return;
    if (m.packV >= 1) { // 이미 팩 그림으로 옮긴 집: 그 뒤에 바뀐 것만 차례로
      if (m.plot && m.packV <= 2) { // 1·2 → 3: 먼저 올린 판(1)에서 연못이 샘물 분수로, 연못 도면이 분수 도면으로 바뀌었음
        // 그때 예전 목록을 남기지 않아 어느 분수가 원래 연못이었는지 모르므로 넉넉하게: 가진 분수 수만큼 연못을, 분수 도면이 있으면 연못 도면을 줌 (분수·분수 도면은 그대로)
        if (!m.bp) m.bp = {};
        const before = m.furn.pond || 0; let want = Math.max(before, m.furn.fountain || 0);
        if (m.plot === 'spring' && curIdx(m) > plotRooms(m).findIndex((r) => r.id === 'own')) want = Math.max(want, 1); // 샘가 집 고유 칸 기본 연못
        const bp = !!m.bp.fountain && !m.bp.pond;
        m.furn.pond = want; if (bp) m.bp.pond = 1;
        if (want > before || bp) m.pondBack = { at: Date.now(), n: want - before, bp };
      }
      if (m.plot && m.packV <= 3) { // 3 → 4: 열매 텃밭·해바라기 화단은 '텃밭' 하나로 (무엇을 심느냐로 모습이 바뀜)
        for (const k of ['bedplot2', 'bedplot3']) if (m.furn[k]) { m.furn.bedplot = (m.furn.bedplot || 0) + m.furn[k]; delete m.furn[k]; }
        if (Array.isArray(m.deco)) m.deco.forEach((o) => { if (o.s === 'bedplot2' || o.s === 'bedplot3') o.s = 'bedplot'; });
      }
      if (m.plot && m.packV <= 10 && Array.isArray(m.deco)) { // 10 → 11: 네모 깔개가 '깔개'의 색에서 따로 '네모 깔개'가 됨. 놓아 둔 네모 깔개 수만큼 깔개에서 네모 깔개로 옮김
        const n = m.deco.filter((o) => ['rug_red', 'rug_blue', 'rug_orange', 'rug_teal'].includes(o.s)).length;
        if (n) { const mv = Math.min(n, m.furn.rug || 0); m.furn.rug = (m.furn.rug || 0) - mv; m.furn.rug_red = (m.furn.rug_red || 0) + n; }
      }
      if (m.plot && m.packV <= 12) { // 12 → 13: 색이 여러 개인 가구를 색마다 따로 · 둥근 걸상은 걸상으로 · 새로 도면이 생긴 가구는 이미 가졌으면 도면도 줌
        if (m.furn.stool2) { m.furn.stool = (m.furn.stool || 0) + m.furn.stool2; delete m.furn.stool2; }
        if (!m.bp) m.bp = {}; for (const k of ['chair_red', 'mirror', 'rug_moon', 'fence_iron', 'glasswin']) if (m.furn[k] > 0) m.bp[k] = 1; // 나누기 전에 (색유리 창은 어느 색이든 가졌으면)
        const SPLIT = { rug: ['rug_long_blue', 'rug_long_orange', 'rug_long_green', 'rug_long_magenta', 'rug_long_teal'], rug_red: ['rug_blue', 'rug_orange', 'rug_green', 'rug_magenta', 'rug_teal'],
          glasswin: ['glasswin_1', 'glasswin_2', 'glasswin_3', 'glasswin_4', 'glasswin_5'], planter: ['planter_blue'], crystal: ['crystal_2', 'crystal_3', 'crystal_4', 'crystal_5', 'crystal_6', 'crystal_7'] };
        const CRYS = { crystal_3: 'crystal_2', crystal_5: 'crystal_4', crystal_7: 'crystal_6' };
        if (Array.isArray(m.deco)) {
          for (const o of m.deco) if (o.s === 'stool2') o.s = 'stool';
          for (const [old, vs] of Object.entries(SPLIT)) for (const v of vs) {
            const nb = CRYS[v] || v, n = m.deco.filter((o) => o.s === v).length; if (!n) continue;
            const mv = Math.min(n, m.furn[old] || 0); m.furn[old] = (m.furn[old] || 0) - mv; m.furn[nb] = (m.furn[nb] || 0) + n;
          }
        }
      }
      if (m.plot && m.packV <= 14 && Array.isArray(m.deco)) { // 14 → 15: '모양'으로 묶었던 꽃·접시·그릇 더미·마법서·수정을 따로. 놓아 둔 모양 수만큼 그 가구로 옮김
        const SPLIT = { flower1: ['flower2', 'flower3', 'flower4', 'flower5', 'flower6', 'flower7', 'flower8', 'flower9'], plate: ['plate_s', 'plate_b'], dishes: ['dishes_s'], spellbook: ['spellbook_1'],
          crystal: ['crystal_1'], crystal_2: ['crystal_3'], crystal_4: ['crystal_5'], crystal_6: ['crystal_7'] };
        for (const [old, vs] of Object.entries(SPLIT)) for (const v of vs) { const n = m.deco.filter((o) => o.s === v).length; if (!n) continue;
          const mv = Math.min(n, m.furn[old] || 0); m.furn[old] = (m.furn[old] || 0) - mv; m.furn[v] = (m.furn[v] || 0) + n; }
      }
      if (m.plot && m.packV === 16) { // 16 → 17: 잠깐 있던 작은 덩굴 아치를 뺌. 만든 것은 덩굴 아치로, 놓아 둔 것은 치움
        if (m.furn.arch_small) { m.furn.arch = (m.furn.arch || 0) + m.furn.arch_small; delete m.furn.arch_small; }
        if (Array.isArray(m.deco)) m.deco = m.deco.filter((o) => o.s !== 'arch_small');
      }
      // 4 → 5: 덩굴 아치 · 5 → 6: 작은 종 · 6 → 7: 울타리 네 가지·꽃 · 7 → 8: 촛대 스탠드·초, 불 가구 움직임 · 8 → 9: 부엌·소품 가구, 깔개 색 · 9 → 10: 색유리 창·마법서·마력 수정·파랑 화분대 · 10 → 11: 긴 깔개 색 여섯, 네모 깔개 따로 · 11 → 12: 별밤 벽지·연한 벽돌 바닥·탁상시계·책 선반·은 거울·달 깔개 · 13 → 14: 마법 등불, 횃불 옆모습, 장작 테두리 · 15 → 16: 작은 덩굴 아치 · 16 → 17: 작은 덩굴 아치 뺌 · 17 → 18: 건물 앞·바깥뜰에 놓기 (새로 옮길 것 없음)
      m.packV = PACK.v; return;
    }
    m.packV = PACK.v;
    if (!m.plot) { m.deco = null; m.look = null; return; }
    let back = 0; const furn = {};
    for (const [k, n] of Object.entries(m.furn || {})) { const to = OLD_FURN[k]; if (to && FURN[to]) furn[to] = (furn[to] || 0) + n; else back += (OLD_FURN_SEALS[k] || 0) * n; }
    const bp = {}; for (const k of Object.keys(m.bp || {})) { if (OLD_BP[k]) bp[OLD_BP[k]] = 1; else back += OLD_BP_SEALS[k] || 0; }
    const ow = (m.look && m.look.own) || {}; back += ((ow.floor || []).length + (ow.face || []).length) * 25 + (ow.wall || []).length * 30;
    // 이미 되살린 칸의 새 기본 가구는 적어도 그만큼은 가짐
    const rs = plotRooms(m), ci = curIdx(m);
    const gift = {}; for (let i = 0; i < ci; i++) for (const [k, n] of Object.entries((FURN_GIFT[m.plot] || {})[rs[i].id] || {})) gift[k] = (gift[k] || 0) + n;
    for (const [k, n] of Object.entries(gift)) furn[k] = Math.max(furn[k] || 0, n);
    m.furn = furn; m.bp = bp; m.deco = null; m.look = null; m.seals = (m.seals || 0) + back;
    m.packNote = { at: Date.now(), back };
  }
  const inside = (d) => { const m = ct(d); return !!m.inside && d.region === R.region && isOpen(); }; // 점검으로 닫히면 도시 화면에서 나옴
  const have = (d, id) => (id === 'gold' ? Math.max(0, Math.floor(d.gold || 0)) : db.itemCount(d.id, id) || 0);
  const plotRooms = (m) => (m.plot ? ROOMS(m.plot) : []);
  const roomDone = (r, st) => { if (st.done) return true; if (st.h >= r.hours && Object.entries(r.mats).every(([k, n]) => (st.mats[k] || 0) >= n)) { st.done = 1; return true; } return false; };
  function migrateRooms(m) { // 재료 표를 늘리기 전에 이미 되살린 칸 (앞에서부터 차례로)
    if (!m.plot || m.roomsV2) return; m.roomsV2 = 1;
    for (const r of ROOMS(m.plot)) { const st = m.rooms[r.id], old = r.id === 'own' ? OLD_MATS.own[m.plot] : OLD_MATS[r.id];
      if (st.h >= r.hours && Object.entries(old).every(([k, n]) => (st.mats[k] || 0) >= n)) st.done = 1; else break; }
  }
  const curIdx = (m) => { const rs = plotRooms(m); for (let i = 0; i < rs.length; i++) if (!roomDone(rs[i], m.rooms[rs[i].id])) return i; return rs.length; };
  const stage = (m) => curIdx(m); // 되살린 칸 수

  // 재건도 보태기 (하루 상한). 실제로 보탠 만큼 돌려줌
  function addSon(d, n) {
    const m = ct(d); n = Math.max(0, Math.floor(n)); if (!n) return 0;
    const give = Math.min(n, Math.max(0, capOf() - (m.daySon || 0)));
    if (n > give) m.bank = (m.bank || 0) + (n - give); // 오늘 상한을 넘친 재건도는 모아 두었다가 다음 날 먼저 보탬
    if (!give) return 0;
    W.son += give; m.daySon = (m.daySon || 0) + give; m.sonAll = (m.sonAll || 0) + give;
    W.hands[d.name] = (W.hands[d.name] || 0) + give;
    advance(); save();
    return give;
  }

  // 전날까지 넘친 재건도를 오늘 상한 안에서 먼저 보탬
  function flushBank(d) {
    const m = ct(d); if (!m.bank) return false;
    const room = Math.max(0, capOf() - (m.daySon || 0)); if (!room) return false;
    const n = Math.min(room, m.bank); m.bank -= n; addSon(d, n); return true;
  }
  // 돌아온 골렘 정리 (일한 시간만큼 결과를 넣음)
  function settle(d) {
    const m = ct(d), now = Date.now(); const items = []; let changed = false;
    for (const g of m.golems) {
      if (!g.job || g.until > now) continue;
      const rep = { job: g.job, hours: g.hours, got: {}, son: 0, seals: Math.round(g.hours * R.sealPerHour * (logic.lifeMods ? logic.lifeMods(d).seals : 1)), frag: null, at: g.until }; // 장신구 효과 seals (지금은 이 효과를 가진 장신구 없음, 늘 1)
      if (g.job === 'build') {
        const rs = plotRooms(m), i = curIdx(m), r = rs[i];
        const add = r ? Math.min(g.hours, Math.max(0, r.hours - m.rooms[r.id].h)) : 0;
        if (r && add) { m.rooms[r.id].h += add; rep.room = r.name; rep.roomH = add; }
        rep.extra = g.hours - add; // 칸 공사가 먼저 끝나 남은 시간은 도시 공사를 도움
        rep.son = addSon(d, g.hours);
      } else if (g.job === 'city') { rep.son = addSon(d, g.hours); }
      else {
        const table = g.job === 'gather' ? R.gather : R.dig;
        for (let h = 0; h < g.hours; h++) for (const [id, p, max] of table) if (Math.random() < p) rep.got[id] = (rep.got[id] || 0) + 1 + Math.floor(Math.random() * max);
        if (g.job === 'dig') {
          const pf = R.fragDig * (m.plot === 'archive' && perkOn(m) ? 1.3 : 1);
          for (let h = 0; h < g.hours && !rep.frag; h++) if (Math.random() < pf) {
            const all = []; for (const [zid, list] of Object.entries(FRAGS)) if (done(zid)) list.forEach((_, i) => all.push(`${zid}:${i}`)); // 재건된 구역의 조각만
            const pool = all.filter((k) => !m.frags.includes(k) && !W.wall[k]); // 이미 벽에 끼운 조각은 다시 나오지 않음
            if (pool.length) { rep.frag = pool[Math.floor(Math.random() * pool.length)]; m.frags.push(rep.frag); }
          }
        }
        for (const [id, n] of Object.entries(rep.got)) items.push({ id, qty: n });
      }
      m.seals += rep.seals;
      g.report = rep; g.job = null; g.hours = 0; g.until = 0; changed = true;
    }
    if (items.length) db.saveState(d, items);
    return changed;
  }

  // 되살린 칸의 기본 가구를 가구 보관함에 넣음 (한 칸에 한 번). 예전에 놓아 둔 장식은 가진 것으로 쳐 줌
  function grantFurn(d) {
    const m = ct(d); if (!m.plot) return;
    const rs = plotRooms(m), ci = curIdx(m);
    for (let i = 0; i < ci; i++) { const id = rs[i].id; if (m.furnGot[id]) continue; m.furnGot[id] = 1; for (const [k, n] of Object.entries((FURN_GIFT[m.plot] || {})[id] || {})) m.furn[k] = (m.furn[k] || 0) + n; }
    if (!m.furnMig) { m.furnMig = 1; if (Array.isArray(m.deco)) { const c = {}; m.deco.forEach((o) => { c[o.s] = (c[o.s] || 0) + 1; }); for (const [k, n] of Object.entries(c)) if ((m.furn[k] || 0) < n) m.furn[k] = n; } }
  }
  // 지금 재건 중인 구역의 재료함에 가진 도시 재료를 넣음 (모자란 만큼만)
  function give(d) {
    const e = ready(d); if (e) return e;
    const z = curZone(); if (!z) return err('일곱 구역이 모두 재건되었다.');
    if (!Object.keys(ZONE_MATS[z.id]).length) return err(`${ga(z.name)} 재료함 없이 재건도만 차면 재건된다.`);
    const box = (W.box[z.id] = W.box[z.id] || {}), m = ct(d), items = [], parts = []; let cnt = 0;
    for (const [k, n] of Object.entries(ZONE_MATS[z.id])) { if (k === 'gold') continue; const q = Math.min(n - (box[k] || 0), have(d, k)); if (q <= 0) continue; box[k] = (box[k] || 0) + q; items.push({ id: k, qty: -q }); parts.push(`${ITEMS[k].name} ${q}`); cnt += q; }
    if (!items.length) return err(boxFull(z) ? `${z.name} 재료함은 이미 다 찼다.` : ZONE_MATS[z.id].gold && Object.entries(ZONE_MATS[z.id]).every(([k, n]) => k === 'gold' || (box[k] || 0) >= n) ? '도시 재료는 다 찼다. 금은 금화를 녹여 넣어야 한다.' : '넣을 수 있는 도시 재료가 없다. 골렘을 채집·잔해 뒤지기로 보내 보자.');
    db.saveState(d, items);
    W.givers[d.name] = (W.givers[d.name] || 0) + cnt;
    m.gfrac = (m.gfrac || 0) + cnt; const seals = Math.floor(m.gfrac / BOX_SEAL); m.gfrac -= seals * BOX_SEAL; m.seals += seals;
    advance(); save();
    return { ok: true, lines: [`${z.name} 재료함에 넣었다: ${parts.join(', ')}.${seals ? ` 석공 인장 +${seals}.` : ''}`] };
  }
  // 금화를 녹여 재료함의 금 줄에 넣음 (넣을 양을 직접 고름)
  function giveGold(d, n) {
    const e = ready(d); if (e) return e;
    const z = curZone(); if (!z) return err('일곱 구역이 모두 재건되었다.');
    const need = ZONE_MATS[z.id].gold; if (!need) return err(`${z.name}에는 금이 들지 않는다.`);
    const box = (W.box[z.id] = W.box[z.id] || {}), left = need - (box.gold || 0);
    if (left <= 0) return err(`${z.name}에 넣을 금은 이미 다 모였다.`);
    n = Math.floor(Number(n)); if (!(n >= 100)) return err('금화는 100 이상 녹여 넣을 수 있다.');
    n = Math.min(n, left); if ((d.gold || 0) < n) return err(`금화가 모자란다. (가진 금화 ${Math.floor(d.gold || 0).toLocaleString('ko-KR')})`);
    d.gold -= n; box.gold = (box.gold || 0) + n;
    const m = ct(d); W.givers[d.name] = (W.givers[d.name] || 0) + 1;
    m.gofrac = (m.gofrac || 0) + n; const seals = Math.floor(m.gofrac / GOLD_SEAL); m.gofrac -= seals * GOLD_SEAL; m.seals += seals;
    advance(); save();
    const what = { forge: '식은 화로에 다시 불을 넣고 모루를 되살리는 데', belfry: '깨진 종을 다시 붓는 쇳물에', sanctum: '성소 문의 문양을 덮을 금박에' }[z.id] || '도시를 되살리는 데';
    return { ok: true, lines: [`둥지의 금화 ${n.toLocaleString('ko-KR')}을 녹여 ${what} 보탰다.${seals ? ` 석공 인장 +${seals}.` : ''}`] };
  }
  function craft(d, s, n) {
    const e = ready(d); if (e) return e;
    const m = ct(d); if (!m.plot) return err('먼저 집터를 골라야 한다.');
    if (!own(FURN, s)) return err('모르는 가구다.'); const f = { ...FURN[s], seals: sealCost(FURN[s]) };
    if (own(BLUEPRINT, BPKEY[s]) && !(m.bp || {})[BPKEY[s]]) return err(`${bpName(BPKEY[s])} 도면이 있어야 만들 수 있다. 꾸미기의 '도면'에서 살 수 있다.`);
    n = Math.max(1, Math.min(5, Math.floor(Number(n) || 1)));
    const cap = FURN_CAP[s];
    if (cap && (m.furn[s] || 0) + n > cap) return err((m.furn[s] || 0) >= cap ? `${f.name}${josa(f.name, '은', '는')} ${cap}개까지만 가질 수 있다. (가진 것 ${m.furn[s] || 0}개)` : `${f.name}${josa(f.name, '은', '는')} ${cap}개까지만 가질 수 있어, ${cap - (m.furn[s] || 0)}개만 더 만들 수 있다.`);
    if (m.seals < f.seals * n) return err(`석공 인장 ${f.seals * n}개가 있어야 한다. (가진 것 ${m.seals})`);
    const lack = Object.entries(f.mats).filter(([k, q]) => have(d, k) < q * n);
    if (lack.length) return err(`${lack.map(([k, q]) => `${ITEMS[k].name} ${q * n}개`).join(', ')}가 있어야 한다.`);
    db.saveState(d, Object.entries(f.mats).map(([k, q]) => ({ id: k, qty: -q * n })));
    m.seals -= f.seals * n; m.furn[s] = (m.furn[s] || 0) + n;
    return { ok: true, lines: [`${f.name}${n > 1 ? ` ${n}개` : ''}${josa(f.name, '을', '를')} 만들었다. 꾸미기에서 놓을 수 있다.`] };
  }

  // ── 구역 기능 (임시판): 재건된 구역마다 하루 한 번 할 수 있는 일, 또는 늘 켜지는 효과 ──
  const ZF = { springTimes: 3, archiveSeals: 5, archiveFrag: 0.15, greenGot: [['shroom_spore', 5, 8], ['cave_crystal', 1, 3], ['sun_dust', 2, 4]], forgeOff: 0.2, bellCap: 5, bellSeals: 2, bellNeed: 5 }; // 종: 누구나 하루 한 번 울림(인장 2). 그날 다섯 번 울리면 모두 상한 +5
  const bellToday = () => (W.bell && W.bell.day === dayIdx() ? W.bell : { day: dayIdx(), by: [] });
  const capOf = () => { const by = bellToday().by; return R.dayCap + (Array.isArray(by) && by.length >= ZF.bellNeed ? ZF.bellCap : 0); }; // 그날 종이 다섯 번 울리면 모두 +5
  const sealCost = (f) => (done('forge') ? Math.ceil(f.seals * (1 - ZF.forgeOff)) : f.seals); // 대장간 거리: 가구 인장 20% 덜
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  function zoneAct(d, id) {
    const e = ready(d); if (e) return e;
    if (!own(ZF_NAMES, id)) return err('그 구역에서 할 수 있는 일이 없다.');
    if (!done(id)) return err('그 구역이 재건되어야 한다.');
    const m = ct(d); if (!m.zday || typeof m.zday !== 'object') m.zday = {};
    const today = dayIdx();
    if (id === 'sanctum') {
      const n = Object.keys(W.wall).length;
      if (n < 21) return { ok: true, lines: [`굳게 닫힌 문에 손을 대자 아주 느린 숨소리가 들린다. 문에 새겨진 홈 스물한 개 가운데 ${n}개에 빛이 들어와 있다. 기억의 벽이 다 채워지면 열릴 것 같다.`] };
      return { ok: true, lines: ['문의 홈 스물한 개가 모두 빛나자, 돌문이 소리 없이 안으로 열렸다.', '잠든 이들의 방이다. 가장 오래된 용들이 몸을 말고 누워 있다. 그중 하나가 눈꺼풀을 반쯤 들어 너를 본다.', '"…다시 일으켜 세웠구나. 땅이 갈라지던 날 가라앉은 우리 고향을." 그는 떠난 이들의 소식을 물으려는 듯 입을 달싹이다가, 다시 잠에 묻혔다. (마지막 이야기는 다음 업데이트에서 이어진다)'] };
    }
    if (id === 'belfry') { // 선착순이 아니라 함께: 누구나 하루 한 번 울리고, 그날 다섯 번이 모이면 모두에게 축복
      const bt = bellToday(); if (!Array.isArray(bt.by)) bt.by = [];
      if (bt.by.includes(d.name)) return err('오늘은 이미 종을 울렸다. 내일 다시 울릴 수 있다.');
      bt.by.push(d.name); W.bell = bt; m.seals += ZF.bellSeals;
      const n = bt.by.length, lines = [`줄을 힘껏 당기자 오래 잠든 종이 도시에 울려 퍼졌다. 석공 인장 +${ZF.bellSeals}. (오늘 종 ${Math.min(n, ZF.bellNeed)} / ${ZF.bellNeed}번)`];
      if (n === ZF.bellNeed) { news(`오늘 고대도시 종탑의 종이 ${ZF.bellNeed}번 울렸다. 오늘 모두가 보탤 수 있는 재건도가 ${ZF.bellCap} 늘었다.`); lines.push(`종이 ${ZF.bellNeed}번 모였다. 오늘 모두의 재건도 상한이 ${ZF.bellCap} 늘었다.`); }
      save(); return { ok: true, lines };
    }
    if (m.zday[id] === today) return err('오늘은 이미 했다. 내일 다시 할 수 있다.');
    m.zday[id] = today;
    if (id === 'archive') {
      m.seals += ZF.archiveSeals; let frag = null;
      if (Math.random() < ZF.archiveFrag) { const pool = []; for (const [zid, list] of Object.entries(FRAGS)) if (done(zid)) list.forEach((_, i) => { const k = `${zid}:${i}`; if (!m.frags.includes(k) && !W.wall[k]) pool.push(k); }); if (pool.length) { frag = pool[Math.floor(Math.random() * pool.length)]; m.frags.push(frag); } }
      return { ok: true, lines: [`쓰러진 돌판을 하나 일으켜 새김을 따라 읽었다. 석공 인장 +${ZF.archiveSeals}.${frag ? ' 돌판 틈에서 기억 조각 하나가 굴러 나왔다.' : ''}`] };
    }
    if (id === 'green') {
      const items = ZF.greenGot.map(([k, a, b]) => ({ id: k, qty: rnd(a, b) })); db.saveState(d, items);
      return { ok: true, lines: [`온실의 덩굴을 손보고 꽃과 씨앗을 거두었다: ${items.map((x) => `${ITEMS[x.id].name} ${x.qty}`).join(', ')}.`] };
    }
    return err('그 구역에서 할 수 있는 일이 없다.');
  }

  // ── 시련의 굴 ──
  const weekIdx = () => Math.floor(dayIdx() / CAVE.cycleDays); // 주기 번호 (사흘마다). 이름은 예전 그대로
  const caveRule = (w = weekIdx()) => CAVE.rules[((w % CAVE.rules.length) + CAVE.rules.length) % CAVE.rules.length];
  const r1 = (x) => Math.round(x * 10) / 10;
  // 미로 씨앗: 그 주기 첫 미로(n = 0)는 모두 같고, 끝방에 닿을 때마다 드래곤마다 다른 새 미로
  const caveSeed = (d, n, w = weekIdx()) => (n ? w * 7919 + (Number(d.id) || 0) * 104729 + n * 613 + 17 : w * 7 + 13);
  const MAPS = new Map();
  const caveMap = (seed) => { if (!MAPS.has(seed)) { if (MAPS.size >= 60) MAPS.clear(); MAPS.set(seed, gen(seed)); } return MAPS.get(seed); };
  const mazeMax = 1 + CAVE.newMazes; // 한 주기에 깰 수 있는 미로 수
  // keep: 미로를 걷거나 석상과 싸우는 도중에 새 굴이 열려도, 들어간 굴의 기록으로 끝낼 수 있게 (걷기·싸움 쪽 요청만 true)
  function caveSt(d, keep = false) {
    const m = ct(d), w = weekIdx(), o = m.cave;
    const stale = !o || o.week !== w || o.cyc !== CAVE.cycleDays;
    if (stale && !(keep && o && o.cyc === CAVE.cycleDays && (o.open || o.echoOpen))) {
      m.cave = { week: w, cyc: CAVE.cycleDays, n: 0, spent: 0, open: false, score: null, owe: (o && o.cyc === CAVE.cycleDays && o.carry) || [], echoOpen: false, fires: [], keys: [], tabs: (o && o.tabs) || [] };
    }
    return m.cave; // n: 이번 주기에 깬 미로 수, owe: 아직 석상으로 받지 않은 미로 몫('first'·'bonus'), carry: 지난 굴에 들어가 새 굴이 열린 뒤 깬 미로의 석상 몫
  }
  const myMap = (d, c = caveSt(d)) => caveMap(caveSeed(d, Math.min(c.n, mazeMax - 1), c.week));
  const caveWorld = () => {
    const w = weekIdx();
    if (!W.cave || W.cave.week !== w || W.cave.cyc !== CAVE.cycleDays) W.cave = { week: w, cyc: CAVE.cycleDays, rank: {} };
    return W.cave;
  };
  // ── 석상: 모두 오래된 용. 들어갈 때 찍은 내 능력치 합(장신구·명성 포함)·굴 체력에 맞춰 섬.
  //    굴 안에서 장신구를 바꿔도 이번 입장의 싸움은 그대로 ──
  const sumOf = (d) => { const st = (logic.statsOf ? logic.statsOf(d) : null) || {}; return Object.values(st).reduce((a, v) => a + (Number(v) || 0), 0) || 120; };
  const caveMe = (d) => ({ sum: sumOf(d), hp: logic.hpCap(d) });
  const echoFor = (me) => ({ ...CAVE.echo, sum: me.sum, hpMax: Math.round(me.hp * CAVE.echoHpMul) });
  const caveMul = (f) => ({ scale: Math.round(f.me.hp / CAVE.dmgRef * 100) / 100 }); // 주고받는 피해 크기를 내 굴 체력에 맞춤
  function caveView(d) {
    const c = caveSt(d), cw = caveWorld(), M = myMap(d), rule = caveRule();
    let f = c.echoOpen && c.fight; if (!f) { const me = caveMe(d); f = { me, echo: echoFor(me) }; } // 석상 앞이 아니면 지금 들어갈 때의 미리보기
    const all = Object.entries(cw.rank).sort((a, b) => a[1] - b[1]), mine = all.findIndex(([n]) => n === d.name);
    const resetIn = CAVE.cycleDays - (((dayIdx() % CAVE.cycleDays) + CAVE.cycleDays) % CAVE.cycleDays); // 새 굴까지 남은 날 (오늘 포함)
    return { open: done('spring'), week: cw.week, mapId: `${cw.week}:${c.n}`, n: c.n, mazeMax, closed: c.n >= mazeMax, resetIn, reward: CAVE.reward,
      rule, ruleName: CAVE.names[rule], ruleLine: CAVE.lines[rule],
      echo: f.echo, mul: caveMul(f), carved: (W.caveCarved || []).map((x) => x.name), map: { g: M.g.map((r) => r.join('')), dist: M.dist, E: M.E, far: M.far, fires: M.fires, keys: M.keys, patrols: M.patrols.map((p) => p.path) },
      rank: all.slice(0, 3), myRank: mine >= 0 ? [mine + 1, all[mine][1], all.length] : null,
      me: { spent: c.spent, score: c.score, owe: c.owe.slice(), fires: c.fires, keys: c.keys, tabs: c.tabs.map((i) => TABLETS[i]), tabTotal: TABLETS.length, hpMax: f.me.hp, sum: f.me.sum } };
  }
  // 한 번 들어가서 쓴 횃불 (화면이 보냄). 걷는 동안 tick으로 받아 둔 값(live)보다 적게는 셈하지 않음
  const caveUsed = (p, c) => { const s = r1(Number(p.used)); return s >= 0 ? Math.max(c.live || 0, Math.min(CAVE.usedMax, s)) : null; };
  function caveTick(d, p) { const c = caveSt(d, true); if (!c.open) return; const s = caveUsed(p, c); if (s != null) c.live = s; }
  function caveEnter(d) {
    const e = ready(d); if (e) return e;
    if (!done('spring')) return err('샘이 재건되어야 굴이 열린다.');
    const c = caveSt(d);
    if (c.n >= mazeMax) return err('이번 굴의 미로를 모두 지났다. 새 굴이 열릴 때까지는 석상과만 겨룰 수 있다.');
    if (c.open) c.spent = r1(c.spent + (c.live || 0)); // 나간다는 기록 없이 끝난 입장(창을 닫음 등)은 걷는 동안 알려 온 만큼
    c.open = true; c.live = 0; c.echoOpen = false;
    return { ok: true };
  }
  function caveFire(d, k) {
    const c = caveSt(d, true), M = myMap(d, c); k = String(k || '');
    if (M.fires.includes(k) && !c.fires.includes(k)) c.fires.push(k);
    if (M.keys.includes(k) && !c.keys.includes(k)) c.keys.push(k);
    return { ok: true };
  }
  function caveLeave(d, p) {
    const c = caveSt(d, true); if (!c.open) return { ok: true };
    const s = caveUsed(p, c); if (s == null) return err('기록이 이상하다.');
    c.spent = r1(c.spent + s); c.open = false; c.live = 0;
    return { ok: true };
  }
  // 끝방에 닿음: 미로를 깸. 보상(첫 미로는 많이, 새 미로는 덤), 첫 미로면 순위, 석상 몫 하나 쌓고 새 미로로
  function caveFinish(d, p) {
    const c = caveSt(d, true), cw = caveWorld(), M = myMap(d, c), late = c.week !== weekIdx(); // late: 지난 굴에 들어가 새 굴이 열린 뒤 닿음
    if (!c.open) return err('굴에 들어간 기록이 없다.');
    const s = caveUsed(p, c); if (s == null) return err('기록이 이상하다.');
    const total = r1(c.spent + s);
    if (total < M.dist[M.E[0]][M.E[1]] * 0.5) return err('기록이 이상하다.');
    c.open = false; c.live = 0;
    const lines = [], m = ct(d), kind = c.n === 0 ? 'first' : 'bonus', R = CAVE.reward[kind];
    m.seals += R.clear;
    lines.push(kind === 'first' ? `이번 굴의 첫 미로를 넘었다. 쓴 횃불 ${total}. 석공 인장 +${R.clear}.` : `새 미로를 넘었다. 석공 인장 +${R.clear}.`);
    if (late) { c.carry = [kind]; lines.push('들어간 굴의 기록으로 남겼다. 그사이 새 굴이 열렸으니, 이 미로 몫의 석상은 새 굴에서 겨룰 수 있다.'); save(); return { ok: true, lines }; } // 순위는 지난 굴과 함께 닫힘
    if (kind === 'first' && c.score == null) { c.score = total; cw.rank[d.name] = total; }
    c.owe.push(kind); c.n += 1; c.spent = 0; c.fires = []; c.keys = [];
    lines.push(c.n < mazeMax ? `굴 안쪽에서 돌이 울렸다. 새 미로가 열렸다. (남은 새 미로 ${mazeMax - c.n})` : '이번 굴의 미로를 모두 지났다.');
    save();
    return { ok: true, lines };
  }
  // 석상 앞에 섬: 이번 주기에 끝방에 한 번이라도 닿았으면 몇 번이든. 그때의 내 값으로 석상이 맞춰 섬
  function caveEcho(d) {
    const e = ready(d); if (e) return e;
    const c = caveSt(d); if (c.n < 1 && !c.owe.length) return err('끝방에 한 번 닿아야 석상 앞에 설 수 있다.');
    if (c.open) { c.spent = r1(c.spent + (c.live || 0)); c.open = false; c.live = 0; } // 걷던 입장은 거기서 끝
    const me = caveMe(d); c.fight = { me, echo: echoFor(me) }; c.echoOpen = true; // 싸우는 동안 장신구를 바꿔도 그대로
    return { ok: true };
  }
  function caveEchoEnd(d, p) {
    const c = caveSt(d, true); if (!c.echoOpen) return err('석상 앞에 선 기록이 없다.'); // 싸우는 도중 새 굴이 열려도 들어간 굴의 몫으로
    c.echoOpen = false;
    const lines = []; let tab = null;
    if (p.beat) {
      const kind = c.owe.shift();
      if (!kind) lines.push('석상을 넘었다. 이번 굴에서 받을 몫은 이미 다 받았다.');
      else {
        const R = CAVE.reward[kind], m = ct(d); m.seals += R.beat;
        lines.push(`석상을 넘었다. 석공 인장 +${R.beat}.`);
        if (kind === 'first') { // 첫 미로 몫: 대륙 소식과 받침돌
          news(`${ga(d.name)} 시련의 굴 끝방에서 ${(c.fight && c.fight.echo.owner) || CAVE.echo.owner}의 석상을 넘었다.`);
          W.caveCarved = [{ name: d.name, day: dayIdx() }, ...(W.caveCarved || []).filter((x) => x.name !== d.name)].slice(0, CAVE.carved); // 받침돌에 새김
        }
        if (Math.random() < (R.tab || 0)) { // 시련의 돌판: 낮은 확률로. 모두 모았으면 대신 인장 조금
          const pool = TABLETS.map((_, i) => i).filter((i) => !c.tabs.includes(i));
          if (pool.length) { const i = pool[Math.floor(Math.random() * pool.length)]; c.tabs.push(i); tab = TABLETS[i]; lines.push(`석상 발치에서 시련의 돌판을 찾았다: '${tab.t}'.`); }
          else { m.seals += CAVE.tabFull; lines.push(`석상 발치에 돌판이 하나 있었지만, 시련의 돌판은 이미 모두 모았다. 대신 석공 인장 +${CAVE.tabFull}.`); }
        }
      }
    }
    save();
    return { ok: true, lines, tab };
  }

  // ── 집터 덤: 고유 칸(네 번째 칸)을 되살리면 열림. 집터와 같은 이름의 구역이 재건되면 한 단계 커짐 ──
  const PERK = { springWater: [1, 2], greenGot: [['shroom_spore', 4, 6], ['cave_crystal', 1, 2]], greenFlower: ['moss_flower', 0.25], archiveSeals: [2, 4], forgeOff: [0.05, 0.1], recall: [1, 2], plazaMats: [6, 10], plazaPool: ['sun_dust', 'old_tile', 'drip_dust', 'faded_cloth', 'cave_crystal', 'shroom_spore'] };
  const perkOn = (m) => !!m.plot && curIdx(m) >= plotRooms(m).length; // 네 칸을 모두 되살림
  const perkUp = (m) => perkOn(m) && done(m.plot);                    // 같은 이름의 구역이 재건됨
  const perkLv = (m) => (perkUp(m) ? 1 : 0);
  const perkDaily = (m) => { if (!m.perk || m.perk.day !== dayIdx()) m.perk = { day: dayIdx(), n: 0 }; return m.perk; };
  const perkMax = (m) => (m.plot === 'belfry' ? PERK.recall[perkLv(m)] : m.plot === 'forge' ? 0 : 1);
  function perkUse(d, gi) {
    const e = ready(d); if (e) return e;
    const m = ct(d); if (!perkOn(m)) return err('네 번째 칸을 되살리면 집터의 덤이 열린다.');
    if (m.plot === 'forge') return err('이 집터의 덤은 늘 켜져 있다.');
    const pd = perkDaily(m), max = perkMax(m); if (pd.n >= max) return err('오늘 덤은 다 썼다. 내일 다시 쓸 수 있다.');
    const lv = perkLv(m), rnd2 = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    let lines;
    if (m.plot === 'spring') { const n = PERK.springWater[lv]; db.saveState(d, [{ id: 'spring_water', qty: n }]); lines = [`연못에서 맑은 물을 길어 병에 담았다. 샘물 한 병 +${n}.`]; }
    else if (m.plot === 'green') { const mul = lv ? 1.5 : 1; const items = PERK.greenGot.map(([k, a, b]) => ({ id: k, qty: Math.round(rnd2(a, b) * mul) })); if (Math.random() < PERK.greenFlower[1] * (lv ? 1.5 : 1) && ITEMS[PERK.greenFlower[0]]) items.push({ id: PERK.greenFlower[0], qty: 1 }); db.saveState(d, items); lines = [`지붕 정원을 손보고 거두었다: ${items.map((x) => `${ITEMS[x.id].name} ${x.qty}`).join(', ')}.`]; }
    else if (m.plot === 'archive') { const n = PERK.archiveSeals[lv]; m.seals += n; lines = [`새김 방에서 돌판 한 줄을 새로 새겼다. 석공 인장 +${n}.`]; }
    else if (m.plot === 'plaza') { const n = PERK.plazaMats[lv], got = {}; for (let k = 0; k < n; k++) { const id = PERK.plazaPool[Math.floor(Math.random() * PERK.plazaPool.length)]; got[id] = (got[id] || 0) + 1; } const items = Object.entries(got).map(([id, qty]) => ({ id, qty })); db.saveState(d, items); lines = [`앞뜰을 쓸다 오가는 용들이 떨어뜨린 것을 주웠다: ${items.map((x) => `${ITEMS[x.id].name} ${x.qty}`).join(', ')}.`]; }
    else if (m.plot === 'belfry') {
      const now = Date.now(); let g = m.golems[Number(gi)];
      if (!g || !g.job || g.until <= now) g = m.golems.filter((x) => x.job && x.until > now).sort((a, b) => b.until - a.until)[0];
      if (!g) return err('일하러 간 골렘이 없다.');
      g.until = now; settle(d); lines = [`망루에서 깃발을 흔들자 ${ga(g.name)} 일을 마치고 바로 돌아왔다.`];
    } else return err('이 집터의 덤은 아직 없다.');
    pd.n += 1;
    return { ok: true, lines };
  }

  // ── 놀러 가기 · 방명록: 남의 집터는 보기만, 방명록은 '방명록 받침'을 놓은 집에만 하루 한 줄 ──
  const BOOK = { keep: 30, len: 40, show: 20, phrases: ['멋진 집이에요!', '잠깐 쉬었다 가요', '꾸민 솜씨가 좋아요', '다음에 또 올게요', '골렘이 귀여워요', '도시를 함께 고쳐요'] };
  if (!W.books) W.books = {}; if (!W.bookDay) W.bookDay = {};
  const otherDragon = (name) => { const id = db.dragonNameOwner ? db.dragonNameOwner(String(name || '')) : null; if (!id) return null; return (online.get && online.get(id) && online.get(id).dragon) || db.getDragon(id); };
  const cityOf = (o) => { const c = logic.combatJson(o); return c && c.city && typeof c.city === 'object' ? c.city : null; };
  // ── 가구 선물: 놓지 않고 남은 가구를 다른 드래곤의 집터로 보냄 (고대 유적에 와 있어야 함, 하루 FGIFT.perDay개까지) ──
  const FGIFT = { perDay: 10 };
  const decoNow = (m) => { if (Array.isArray(m.deco)) return m.deco; const done = plotRooms(m).slice(0, curIdx(m)).map((r) => r.id); return (PACK.defaults[m.plot] || []).filter((o) => done.includes(o.room)); };
  const spareOf = (m, s) => Math.max(0, ((m.furn || {})[s] || 0) - decoNow(m).filter((o) => DECO.base[o.s] === s).length);
  const fgDaily = (m) => { if (!m.fgift || m.fgift.day !== dayIdx()) m.fgift = { day: dayIdx(), n: 0 }; return m.fgift; };
  function giveFurn(d, name, s, n) {
    const m = ct(d); if (!m.plot) return err('먼저 집터를 골라야 한다.');
    if (d.exp_end) return err('원정을 떠나 있는 동안에는 할 수 없다.');
    if (d.region !== R.region) return err('가구를 보내려면 고대 유적에 직접 와 있어야 한다.');
    const o = otherDragon(name); if (!o) return err('그런 드래곤은 없다.');
    if (o.id === d.id) return err('내 집터에는 보낼 수 없다.');
    if (o.dead_at) return err(`${ga(o.name)} 긴 잠에 들었다.`);
    if (db.relGet && db.relGet(o.id, d.id) === 'wary') return err(`${o.name}의 집터 문이 굳게 닫혀 있다.`);
    const om = cityOf(o); if (!om || !om.plot) return err(`${ga(o.name)} 아직 집터를 고르지 않았다.`);
    if (!FURN[s]) return err('그런 가구는 없다.');
    n = Math.floor(Number(n) || 0); if (n < 1) return err('보낼 개수를 골라야 한다.');
    const sp = spareOf(m, s); if (sp < n) return err(sp ? `놓지 않고 남은 ${FURN[s].name}${josa(FURN[s].name, '은', '는')} ${sp}개뿐이다.` : `놓지 않고 남은 ${FURN[s].name}${josa(FURN[s].name, '이', '가')} 없다. 놓아 둔 가구는 먼저 치워야 보낼 수 있다.`);
    if (FURN_CAP[s] && ((om.furn || {})[s] || 0) + n > FURN_CAP[s]) return err(`${o.name}의 집터에는 ${FURN[s].name}${josa(FURN[s].name, '을', '를')} 더 둘 자리가 없다. (${FURN_CAP[s]}개까지)`);
    const fd = fgDaily(m); if (fd.n + n > FGIFT.perDay) return err(`가구는 하루 ${FGIFT.perDay}개까지 보낼 수 있다. (오늘 남은 ${Math.max(0, FGIFT.perDay - fd.n)}개)`);
    m.furn[s] -= n; fd.n += n;
    if (!om.furn) om.furn = {}; om.furn[s] = (om.furn[s] || 0) + n;
    db.saveState(d); db.saveState(o);
    const what = `${FURN[s].name}${n > 1 ? ` ${n}개` : ''}`, tell = `${ga(d.name)} 집터로 가구를 보내왔다: ${what}. 꾸미기에서 놓을 수 있다.`;
    const oe = online.get && online.get(o.id); if (oe && oe.socket) { try { oe.socket.emit('notice', { title: '가구 선물', lines: [tell] }); sendMe(oe.socket, oe.dragon); } catch {} } else if (db.noteAdd) db.noteAdd(o.id, tell);
    return { ok: true, lines: [`${o.name}의 집터로 ${what}${josa(what, '을', '를')} 보냈다. (오늘 보낼 수 있는 가구 ${FGIFT.perDay - fd.n}개 남음)`] };
  }
  // ── 텃밭 ──
  // 기르는 정도: 심은 때부터 지금까지, 촉촉한 동안은 1배, 마른 동안은 GARDEN.dry 배로 자람 (ms 단위로 쌓음)
  function gInfo(st, now = Date.now()) {
    const c = GARDEN.crops[st.c], G = c.hours * 36e5, wetLen = G * GARDEN.wet;
    let prog = 0, t = st.at; const ws = (st.w || []).filter((w) => w >= st.at).sort((a, b) => a - b);
    for (const w of ws) { if (w > now) break; if (w > t) { prog += (w - t) * GARDEN.dry; t = w; } const e = Math.min(now, w + wetLen); if (e > t) { prog += e - t; t = e; } }
    if (now > t) prog += (now - t) * GARDEN.dry;
    const lastW = ws.length ? ws[ws.length - 1] : -Infinity, wetLeft = Math.max(0, lastW + wetLen - now);
    const grown = prog >= G, rest = Math.max(0, G - prog), left = rest <= wetLeft ? rest : wetLeft + (rest - wetLeft) / GARDEN.dry; // 더 물을 주지 않으면 남은 시간
    return { c: st.c, stage: st.h ? 3 : grown ? 2 : prog >= G / 3 ? 1 : 0, p: Math.min(1, prog / G), wet: !st.h && !grown && wetLeft > 0, wetLeft: grown ? 0 : wetLeft, left: grown || st.h ? 0 : Math.ceil(left) };
  }
  // 텃밭 두둑에 번호(g)를 붙임. 기본 배치(deco가 null)에 두둑이 있으면 그 배치를 그대로 저장해서 번호를 붙임
  function gBeds(m) {
    if (!m.plot) return [];
    if (!Array.isArray(m.deco)) { const done = plotRooms(m).slice(0, curIdx(m)).map((r) => r.id), def = (PACK.defaults[m.plot] || []).filter((o) => done.includes(o.room));
      if (!def.some((o) => o.s === 'bedplot')) return []; m.deco = def.map(({ room, ...o }) => ({ ...o })); }
    if (!m.garden) m.garden = {};
    const beds = m.deco.filter((o) => o.s === 'bedplot'), used = new Set();
    for (const o of beds) { if (!Number.isInteger(o.g) || used.has(o.g)) o.g = m.gNext = (m.gNext || 0) + 1; used.add(o.g); }
    for (const g of Object.keys(m.garden)) if (!used.has(+g)) delete m.garden[g]; // 치운 두둑의 작물은 사라짐
    return beds;
  }
  const gView = (m) => Object.fromEntries(gBeds(m).filter((o) => m.garden[o.g]).map((o) => { const i = gInfo(m.garden[o.g]); return [o.g, { c: i.c, stage: i.stage }]; })); // 놀러 가기·그림용
  function gardenAct(d, p) {
    const e = ready(d); if (e) return e;
    const m = ct(d); if (!m.plot) return err('먼저 집터를 골라야 한다.');
    const beds = gBeds(m); if (!beds.length) return err('놓아 둔 텃밭이 없다. 꾸미기에서 텃밭을 놓을 수 있다.');
    const act = String(p.act || ''), now = Date.now(), nm = (o) => `텃밭 ${beds.indexOf(o) + 1}`;
    if (act === 'waterAll' || act === 'harvestAll') {
      const lines = []; let n = 0; const items = {};
      for (const o of beds) { const st = m.garden[o.g]; if (!st || st.h) continue; const i = gInfo(st, now);
        if (act === 'waterAll' && i.stage < 2 && !i.wet) { (st.w = st.w || []).push(now); n++; }
        if (act === 'harvestAll' && i.stage === 2) { for (const y of gYield(GARDEN.crops[st.c])) items[y.id] = (items[y.id] || 0) + y.qty; st.h = 1; n++; } }
      if (!n) return err(act === 'waterAll' ? '지금 물을 줄 텃밭이 없다.' : '다 자란 텃밭이 없다.');
      if (act === 'waterAll') return { ok: true, lines: [`텃밭 ${n}곳에 물을 주었다. 한동안 촉촉하게 잘 자란다.`] };
      const got = Object.entries(items).map(([k, q]) => ({ id: k, qty: q })); db.saveState(d, got);
      return { ok: true, lines: [`텃밭 ${n}곳을 거두었다: ${got.map((x) => `${ITEMS[x.id].name} ${x.qty}`).join(', ')}.`] };
    }
    const o = beds.find((b) => b.g === Math.floor(Number(p.g))); if (!o) return err('그런 텃밭은 없다.');
    const st = m.garden[o.g];
    if (act === 'plant') {
      const c = own(GARDEN.crops, String(p.crop || '')) ? GARDEN.crops[p.crop] : null; if (!c) return err('그런 씨앗은 없다.');
      if (st && !st.h) return err(`${nm(o)}에는 이미 ${GARDEN.crops[st.c].name}${josa(GARDEN.crops[st.c].name, '이', '가')} 자라고 있다.`);
      if ((d.gold || 0) < c.seed) return err(`${c.name} 씨앗을 사려면 금화 ${c.seed}이 있어야 한다. (가진 금화 ${Math.floor(d.gold || 0).toLocaleString('ko-KR')})`);
      d.gold -= c.seed; m.garden[o.g] = { c: p.crop, at: now, w: [] };
      return { ok: true, lines: [`${nm(o)}에 ${c.name} 씨앗을 심었다. 금화 −${c.seed}. 물을 주면 더 빨리 자란다.`] };
    }
    if (!st) return err(`${nm(o)}에는 아무것도 심지 않았다.`);
    const i = gInfo(st, now), c = GARDEN.crops[st.c];
    if (act === 'water') {
      if (st.h) return err('이미 거둔 텃밭이다. 다시 심을 수 있다.'); if (i.stage === 2) return err('다 자랐다. 거두기만 하면 된다.');
      if (i.wet) { const mm = Math.ceil(i.wetLeft / 6e4); return err(`아직 흙이 촉촉하다. (${mm >= 60 ? `${Math.floor(mm / 60)}시간${mm % 60 ? ` ${mm % 60}분` : ''}` : `${mm}분`} 뒤에 다시 줄 수 있다)`); }
      (st.w = st.w || []).push(now); return { ok: true, lines: [`${nm(o)}의 ${c.name}에 물을 주었다.`] };
    }
    if (act === 'harvest') {
      if (i.stage !== 2) return err(st.h ? '이미 거둔 텃밭이다.' : `아직 다 자라지 않았다. (${GSTAGE[i.stage]})`);
      const got = gYield(c); st.h = 1; db.saveState(d, got);
      return { ok: true, lines: [`${nm(o)}의 ${c.name}${josa(c.name, '을', '를')} 거두었다: ${got.map((x) => `${ITEMS[x.id].name} ${x.qty}`).join(', ')}.`] };
    }
    if (act === 'clear') { delete m.garden[o.g]; return { ok: true, lines: [`${nm(o)}의 흙을 갈아엎었다.`] }; }
    return err('무엇을 할지 모르겠다.');
  }
  const hasBook = (m) => { if (!m || !m.plot || !m.rooms) return false; if (Array.isArray(m.deco)) return m.deco.some((o) => o.s === 'signpost'); return m.plot === 'plaza' && curIdx(m) >= 4; }; // 기본 배치에선 광장 앞 집 앞뜰에 받침이 있음
  const bookOf = (name) => (W.books[name] || []).slice(-BOOK.show).reverse();
  function visitView(d, name) {
    const o = otherDragon(name); if (!o) return err('그런 드래곤은 없다.');
    if (o.dead_at && o.id !== d.id) return err(`${o.name}의 집터는 이제 비어 있다. 주인이 대륙을 떠났다.`); // 먼 여행·긴 잠
    const m = cityOf(o); if (!m || !m.plot || !m.rooms) return err(`${ga(o.name)} 아직 집터를 고르지 않았다.`);
    const mm = ct(d), spare = o.id !== d.id && mm.plot ? Object.keys(FURN).map((s) => ({ s, name: FURN[s].name, n: spareOf(mm, s) })).filter((x) => x.n > 0) : [];
    const rs = ROOMS(m.plot), ci = curIdx(m), today = dayIdx();
    return { ok: true, visit: { id: o.id, name: o.name, me: o.id === d.id, plot: { id: m.plot, name: PI[m.plot].name, mood: PI[m.plot].mood, perk: PI[m.plot].perk },
      rooms: rs.map((r, i) => { const st = m.rooms[r.id], need = Object.values(r.mats).reduce((a, n) => a + n, 0), put = Object.entries(r.mats).reduce((a, [k, n]) => a + Math.min(n, (st.mats || {})[k] || 0), 0); return { id: r.id, name: r.name, hours: r.hours, h: Math.min(r.hours, st.h), matsFrac: need ? put / need : 1, state: i < ci ? 'done' : i === ci ? 'cur' : 'lock' }; }),
      garden: m.packV >= 1 ? gView(m) : {}, deco: m.packV >= 1 && Array.isArray(m.deco) ? m.deco : null, look: m.packV >= 1 ? m.look || null : null, book: hasBook(m), guest: bookOf(o.name), // 아직 집터를 열지 않아 팩 그림으로 옮기지 않은 집은 새 기본 모습으로 보여 줌
      fgift: o.id !== d.id ? { spare, left: Math.max(0, FGIFT.perDay - fgDaily(mm).n), per: FGIFT.perDay } : null, // 가구 보내기: 내가 놓지 않고 남은 가구
      golems: (m.golems || []).filter((g) => g.awake).map((g) => ({ name: g.name, job: g.job && g.until > Date.now() ? JOBS[g.job] : null })), // 놀러 온 이에게 보이는 골렘 이름 (일하는 중이면 그 일)
      canWrite: hasBook(m) && o.id !== d.id && W.bookDay[`${d.name}>${o.name}`] !== today, len: BOOK.len } };
  }
  function guestWrite(d, name, text) {
    const e = ready(d); if (e) return e;
    const o = otherDragon(name); if (!o) return err('그런 드래곤은 없다.');
    if (o.id === d.id) return err('내 집 방명록에는 쓸 수 없다.');
    const m = cityOf(o); if (!hasBook(m)) return err('이 집에는 방명록 받침이 없다.');
    const key = `${d.name}>${o.name}`, today = dayIdx(); if (W.bookDay[key] === today) return err('이 집 방명록에는 오늘 이미 글을 남겼다.');
    text = String(text || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, BOOK.len);
    if (!text) return err('남길 말을 적어야 한다.');
    const list = (W.books[o.name] = W.books[o.name] || []); list.push({ by: d.name, t: text, at: Date.now() }); if (list.length > BOOK.keep) list.splice(0, list.length - BOOK.keep);
    W.bookDay[key] = today; save();
    const oe = online.get && online.get(o.id); if (oe && oe.socket) { try { sendMe(oe.socket, oe.dragon); } catch {} } // 집주인이 접속해 있으면 새 글 표시를 바로
    return { ok: true, lines: [`${o.name}의 집 방명록에 "${text}"라고 남겼다.`] };
  }
  // 집터에 놓인 선물 받기: 고대도시 안, 내 집터에서만. 받으면 소지품에 넣고 받은 선물 창(말·그림·보물 상자에 간직)을 띄움
  function takeGift(d, id, socket) {
    const e = ready(d); if (e) return e;
    if (!inside(d)) return err('집터에 놓인 선물은 고대도시의 내 집터에서 받을 수 있다.');
    if (!ct(d).plot) return err('먼저 집터를 골라야 한다.');
    const g = Number.isInteger(id) ? db.giftHomeTake(d, id) : null;
    if (!g) return err('이미 받은 선물이다.');
    const f = db.getDragon(g.from.id);
    db.ledgerAdd(d.id, { kind: 'gift_in', other: { id: g.from.id, name: g.from.name, kind: g.from.kind }, goldIn: g.gold, itemsIn: g.items, msg: g.msg, img: g.img, note: '집터' });
    try { socket.emit('gift:got', { ...g, home: true, from: { ...g.from, av: f && f.has_avatar ? f.avatar_ver : 0 } }); } catch {}
    return { ok: true };
  }
  const bookNew = (d, m) => (W.books[d.name] || []).filter((x) => x.at > (m.bookSeen || 0)).length;

  // ── 장식 도면 · 바닥·담 · 오르딘 교환 ──
  const weekNo = () => Math.floor((dayIdx() + 3) / 7); // 한국 시간 월요일에 바뀜
  function buyBp(d, s) {
    const e = ready(d); if (e) return e;
    const m = ct(d); if (!m.plot) return err('먼저 집터를 골라야 한다.');
    if (!own(BLUEPRINT, s)) return err('그런 도면은 없다.'); if (!m.bp) m.bp = {};
    if (m.bp[s]) return err('이미 가진 도면이다.'); const cost = BLUEPRINT[s];
    if (m.seals < cost) return err(`석공 인장 ${cost}개가 있어야 한다. (가진 것 ${m.seals})`);
    m.seals -= cost; m.bp[s] = 1;
    return { ok: true, lines: [`오르딘에게서 ${FURN[s].name} 도면을 받았다. 이제 가구 만들기에서 만들 수 있다. 석공 인장 −${cost}.`] };
  }
  // 바닥·벽은 한 번 사면 계속 가짐 (어느 칸에서나, 마당 바닥과 방 바닥은 함께 씀). 처음 깔린 바닥·벽은 처음부터 가짐
  function lookOwn(m) {
    if (!m.look) m.look = { floor: {}, wall: {}, own: { floor: [], wall: [] } };
    if (!m.look.own) m.look.own = { floor: [], wall: [] }; return m.look.own;
  }
  const hasFloor = (m, f) => f === 'cobble' || Object.values(LOOK.fdef).includes(f) || lookOwn(m).floor.includes(f);
  const hasWall = (m, w) => Object.values(LOOK.wdef).includes(w) || lookOwn(m).wall.includes(w);
  function setLook(d, p) {
    const e = ready(d); if (e) return e;
    const m = ct(d); if (!m.plot) return err('먼저 집터를 골라야 한다.'); const ow = lookOwn(m);
    const id = String(p.room || ''), r = plotRooms(m).find((x) => x.id === id);
    if (!r) return err('그런 칸은 없다.'); if (!roomDone(r, m.rooms[id])) return err(`${r.name}${josa(r.name, '을', '를')} 되살린 뒤에 바꿀 수 있다.`);
    const isWall = p.wall != null, k = String(isWall ? p.wall : p.floor || '');
    if (isWall && !LOOK.rooms.includes(id)) return err('그 칸에는 벽을 바꿀 수 없다.');
    if (isWall ? !own(LOOK.walls, k) : id === 'yard' ? !LOOK.yard.includes(k) : !own(LOOK.floors, k)) return err(isWall ? '그런 벽은 없다.' : '그런 바닥은 없다.');
    const nowK = isWall ? ((m.look.wall || {})[id] || LOOK.wdef[id]) : ((m.look.floor || {})[id] || (id === 'yard' ? 'cobble' : LOOK.fdef[id]));
    if (nowK === k) return err(isWall ? '이미 그 벽이다.' : '이미 그 바닥이다.');
    const nm = isWall ? LOOK.walls[k] : k === 'cobble' ? '회색 자갈' : LOOK.floors[k], what = isWall ? '벽' : '바닥';
    let paid = '';
    if (!(isWall ? hasWall(m, k) : hasFloor(m, k))) {
      if (!p.buy) return err(`아직 갖지 않은 ${what}이다.`); // 미리 보기에서 '인장으로 바꾸기'를 눌렀을 때만 삼
      if (m.seals < LOOK.cost) return err(`석공 인장 ${LOOK.cost}개가 있어야 한다. (가진 것 ${m.seals})`);
      m.seals -= LOOK.cost; (isWall ? ow.wall : ow.floor).push(k); paid = ` 석공 인장 −${LOOK.cost}. 이제 어느 칸에서든 다시 쓸 수 있다.`;
    }
    if (isWall) m.look.wall = { ...(m.look.wall || {}), [id]: k }; else m.look.floor = { ...(m.look.floor || {}), [id]: k };
    return { ok: true, lines: [`${r.name} ${what}${josa(what, '을', '를')} ${ro(nm)} 바꿨다.${paid}`] };
  }
  const tradeOffers = () => { const w = dayIdx(), r = TRADE.rare.filter(([k]) => ITEMS[k]), c = TRADE.city.filter(([k]) => ITEMS[k]), out = []; if (r.length) out.push(r[w % r.length]); for (let i = 0; out.length < 1 + Math.min(3, c.length); i++) { const it = c[(w * 2 + i) % c.length]; if (!out.includes(it)) out.push(it); } return out; }; // 희귀 1 + 도시 재료 3 (주마다 돌아감)
  const tradeLeft = (m) => { if (!m.trade || m.trade.day !== dayIdx()) m.trade = { day: dayIdx(), n: 0 }; return Math.max(0, TRADE.perDay - m.trade.n); }; // 한국 시간 자정에 다시
  function doTrade(d, i) {
    const e = ready(d); if (e) return e;
    const m = ct(d), offers = tradeOffers(), o = offers[Number(i)]; if (!o) return err('그런 물건은 없다.');
    if (tradeLeft(m) <= 0) return err(`오늘은 ${TRADE.perDay}번 다 바꿨다. 내일 다시 바꿀 수 있다.`);
    if (m.seals < o[1]) return err(`석공 인장 ${o[1]}개가 있어야 한다. (가진 것 ${m.seals})`);
    const q = o[2] || 1; m.seals -= o[1]; m.trade.n += 1; db.saveState(d, [{ id: o[0], qty: q }]);
    return { ok: true, lines: [`오르딘과 바꿨다: ${ITEMS[o[0]].name} ${q}. 석공 인장 −${o[1]}. (오늘 남은 교환 ${tradeLeft(m)})`] };
  }

  // 거처의 단잠
  const liveOpen = (m) => { if (!m.plot) return false; const rs = plotRooms(m), at = rs.findIndex((r) => r.id === 'live'); return at >= 0 && curIdx(m) > at; };
  const napToday = (m) => m.napDay === dayIdx();
  function doNap(d) {
    const e = ready(d); if (e) return e;
    const m = ct(d); if (!m.plot) return err('먼저 집터를 골라야 한다.');
    if (!liveOpen(m)) return err('거처를 되살려야 단잠을 잘 수 있다.');
    if (napToday(m)) return err('오늘은 이미 단잠을 잤다. 내일 다시 잘 수 있다.');
    m.napDay = dayIdx();
    logic.combatJson(d).nap = { until: Date.now() + NAP.hours * 3600000, gather: NAP.gather };
    return { ok: true, lines: [`거처의 낡은 침상에 몸을 누이고 단잠을 잤다. 개운하다.`, `${NAP.hours}시간 동안 채집에서 물건을 하나 더 찾을 확률이 ${Math.round(NAP.gather * 100)}% 오른다.`] };
  }
  // 작업실 생산대
  const workOpen = (m) => { if (!m.plot) return false; const rs = plotRooms(m), at = rs.findIndex((r) => r.id === 'work'); return at >= 0 && curIdx(m) > at; };
  const workLeft = (m) => { if (!m.make || m.make.day !== dayIdx()) m.make = { day: dayIdx(), n: 0 }; return Math.max(0, WORKSHOP.perDay - m.make.n); };
  function doMake(d, i) {
    const e = ready(d); if (e) return e;
    const m = ct(d); if (!m.plot) return err('먼저 집터를 골라야 한다.');
    if (!workOpen(m)) return err('작업실을 되살려야 생산대를 쓸 수 있다.');
    const w = WORKSHOP.list[Number(i)]; if (!w || !ITEMS[w.out]) return err('그런 것은 만들 수 없다.');
    if (workLeft(m) <= 0) return err(`오늘은 생산대를 ${WORKSHOP.perDay}번 다 썼다. 내일 다시 쓸 수 있다.`);
    const lack = Object.entries(w.needs).filter(([k, n]) => have(d, k) < n);
    if (lack.length) return err(`${lack.map(([k, n]) => `${ITEMS[k].name} ${n}개`).join(', ')}가 있어야 한다.`);
    m.make.n += 1;
    db.saveState(d, [...Object.entries(w.needs).map(([k, n]) => ({ id: k, qty: -n })), { id: w.out, qty: w.qty }]);
    return { ok: true, lines: [`작업실 생산대에서 ${ITEMS[w.out].name} ${w.qty}개를 만들었다. (오늘 남은 횟수 ${workLeft(m)})`] };
  }

  // ── 동작 ──
  function ready(d) {
    if (!isOpen()) return err(W.closed && pathOpen() ? '고대도시는 잠시 닫혀 있다. (점검 중)' : '고대도시로 가는 길은 아직 열리지 않았다.');
    if (d.region !== R.region) return err('고대도시는 고대 유적 아래에 있다.');
    if (logic.isFallen(d)) return err('쓰러져 있어 움직일 수 없다.');
    if (d.exp_end) return err('원정 중에는 할 수 없다.');
    return null;
  }
  function enter(d) {
    const e = ready(d); if (e) return e;
    if (d.rest_at) return err('쉬는 중에는 내려갈 수 없다.');
    const m = ct(d); m.inside = true;
    const intro = !m.introSeen; m.introSeen = 1; // 처음 내려가면 입구의 석판을 읽게 함
    return { ok: true, intro, lines: ['무너진 회랑의 마지막 계단을 내려갔다. 동굴 천장 아래, 잠든 도시가 펼쳐진다.'] };
  }
  function leave(d) { const m = ct(d); m.inside = false; return { ok: true, lines: ['회랑을 거슬러 고대 유적으로 올라왔다.'] }; }
  // 귀환 주문진: 내 집터에 놓아 두면 어디서든 고대도시(집터가 있는 도시 안)로 곧장 날아옴. 행동력 본 대륙 R.warpAp, 멸망한 대륙 RUIN.crossAp (고대 유적에 둥지를 둔 이는 둥지로 날아가기로 공짜)
  const hasWarp = (m) => Array.isArray(m.deco) && m.deco.some((o) => o.s === 'warp_circle');
  function warpTo(d) {
    if (!isOpen()) return { error: W.closed && pathOpen() ? '고대도시는 잠시 닫혀 있다. (점검 중)' : '고대도시로 가는 길은 아직 열리지 않았다.' };
    const m = ct(d);
    if (!hasWarp(m)) return { error: '내 집터에 귀환 주문진을 놓아 두어야 한다.' };
    if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
    if (d.rest_at) return { error: '둥지에서 쉬는 중이다. 먼저 깨어나야 한다.' };
    if (logic.isFallen(d)) return { error: '쓰러져 있어 움직일 수 없다.' };
    const ruin = logic.isRuin(d.region), cost = ruin ? RUIN.crossAp : R.warpAp; // 에레보스에서는 바다를 건너는 것과 같은 값
    if (d.region === R.region && m.inside) return { error: '이미 고대도시에 있다.' };
    logic.regen(d, Date.now());
    if (d.ap < cost) return { error: `행동력이 모자란다. (${cost} 필요)` };
    logic.spendAp(d, cost);
    const from = d.region; d.region = R.region; m.inside = true;
    return { title: '고대도시', from, lines: [ruin ? '바다 건너까지 닿은 주문진의 빛이 잿빛 하늘을 가른다. 파도를 넘어 고대도시의 집터 앞에 내려섰다.' : '집터에 그려 둔 주문진이 희미하게 빛나며 부른다. 눈 깜짝할 새 고대도시의 집터 앞에 내려섰다.'] };
  }
  function choose(d, id) {
    const e = ready(d); if (e) return e;
    const m = ct(d); if (m.plot) return err('이미 집터를 골랐다.');
    if (!own(PI, id)) return err('그런 집터는 없다.');
    m.plot = id; m.roomsV2 = 1; m.rooms = Object.fromEntries(ROOMS(id).map((r) => [r.id, { h: 0, mats: {} }]));
    return { ok: true, lines: [`${eul(PI[id].name)} 내 집터로 삼았다. 무너진 담 너머로 ${PI[id].mood}.`] };
  }
  function put(d) {
    const e = ready(d); if (e) return e;
    const m = ct(d); if (!m.plot) return err('먼저 집터를 골라야 한다.');
    const rs = plotRooms(m), r = rs[curIdx(m)]; if (!r) return err('모든 칸을 되살렸다.');
    const st = m.rooms[r.id], items = [], parts = []; let son = 0, cnt = 0;
    for (const [k, n] of Object.entries(r.mats)) {
      const give = Math.min(n - (st.mats[k] || 0), have(d, k)); if (give <= 0) continue;
      st.mats[k] = (st.mats[k] || 0) + give; items.push({ id: k, qty: -give }); parts.push(`${ITEMS[k].name} ${give}`); cnt += give;
      son += give * (R.matSon[ITEMS[k].rarity] || 1);
    }
    if (!items.length) return err('넣을 수 있는 재료가 없다.');
    db.saveState(d, items);
    m.frac += son; const whole = Math.floor(m.frac / 10); m.frac -= whole * 10;
    const got = addSon(d, whole), seals = Math.floor(cnt / R.matSeal); m.seals += seals;
    const lines = [`${r.name}에 재료를 채웠다: ${parts.join(', ')}.${seals ? ` 석공 인장 +${seals}.` : ''}${got ? ` 재건도 +${got}.` : ''}`];
    if (roomDone(r, st)) lines.push(`${ga(r.name)} 되살아났다! 열린 것: ${r.opens}`);
    return { ok: true, lines };
  }
  function send(d, i, job, hours) {
    const e = ready(d); if (e) return e;
    const m = ct(d); const g = m.golems[Number(i)];
    if (!g || !g.awake) return err('그 골렘은 깨어 있지 않다.');
    if (g.job) return err('그 골렘은 이미 일하는 중이다.');
    if (!own(JOBS, job)) return err('그런 일은 없다.');
    hours = Number(hours); if (!R.hours.includes(hours)) return err('시간을 다시 골라야 한다.');
    if (job === 'build') { if (!m.plot) return err('먼저 집터를 골라야 한다.'); const r = plotRooms(m)[curIdx(m)]; if (!r) return err('모든 칸을 되살렸다. 도시 일손으로 보내 보자.'); if (m.rooms[r.id].h >= r.hours) return err(`${r.name}에 필요한 공사 시간은 다 채웠다. 재료를 채워야 한다.`); }
    const cost = hours * R.golemEn, wear = wearOf(d, job, hours);
    if (g.dur < wear) return err(`${g.name}의 내구도가 모자란다. (${wear} 필요, 지금 ${g.dur}) 먼저 손질해 주자.`);
    if (d.en < cost) return err(`기력이 모자란다. (${cost} 필요)`);
    if (d.en >= logic.enCap(d)) d.en_at = Date.now();
    d.en -= cost;
    const ms = hours * 3600000 * (m.plot === 'forge' && perkOn(m) ? 1 - PERK.forgeOff[perkLv(m)] : 1) / (Number(process.env.CITY_FAST) || 1); // CITY_FAST: 시험용으로 시간을 빨리 (평소엔 비워 둠)
    Object.assign(g, { job, hours, start: Date.now(), until: Date.now() + ms, report: null, dur: g.dur - wear, wear, last: { job, hours } }); // last: 다음에 고를 일의 기본값 (돌아온 뒤에도 눌렀던 버튼이 그대로)
    return { ok: true, lines: [`${ga(g.name)} ${JOBS[job]} ${hours}시간을 하러 갔다. 기력 −${cost}, 내구도 −${wear} (남은 ${g.dur}).`] };
  }
  // 골렘 작업 중단 (일하러 간 골렘을 도중에 데려옴): 그때까지 다 채운 시간만큼만 일한 것으로 치고(가져온 것·재건도·인장도 그만큼),
  // 아직 하지 못한 시간의 기력은 돌려줌. 처음부터 그 시간만큼만 보낸 것과 같아 취소로 얻거나 잃는 것이 없음
  function cancelJob(d, i) {
    const e = ready(d); if (e) return e;
    const m = ct(d); const g = m.golems[Number(i)];
    if (!g || !g.job) return err('일하러 간 골렘이 아니다.');
    const now = Date.now();
    if (g.until <= now) return err('이미 일을 마치고 돌아왔다.');
    const per = Math.max(1, (g.until - g.start) / g.hours); // 한 시간 몫 (대장간 덤이면 짧음)
    const worked = Math.max(0, Math.min(g.hours - 1, Math.floor((now - g.start) / per)));
    const left = g.hours - worked, back = left * R.golemEn, name = g.name, job = JOBS[g.job];
    const wearBack = g.wear != null && g.hours ? Math.round(g.wear * left / g.hours) : left * (R.wear.perHour[g.job] || 3); g.dur = Math.min(R.wear.max, (g.dur ?? R.wear.max) + wearBack); // 하지 못한 시간만큼 내구도도
    const cap = logic.enCap(d), en0 = d.en;
    d.en = Math.min(cap, d.en + back); // 넘치는 몫은 버림 (기력이 이미 거의 찼을 때)
    if (d.en >= cap && en0 < cap) d.en_at = now;
    const gotEn = d.en - en0;
    if (worked > 0) { g.hours = worked; g.until = now; settle(d); }
    else { g.job = null; g.hours = 0; g.start = 0; g.until = 0; }
    const lines = [worked > 0
      ? `${ga(name)} ${job} ${worked}시간만 하고 돌아왔다. 한 만큼 가져온 것은 골렘 탭에서 확인하자.`
      : `${ga(name)} ${eul(job)} 시작하기 전에 돌아왔다.`];
    lines.push(`하지 못한 ${left}시간만큼 내구도도 ${wearBack} 돌아왔다. (지금 ${g.dur})`);
    lines.push(gotEn > 0 ? `하지 못한 ${left}시간의 기력을 ${gotEn}만큼 돌려받았다.${gotEn < back ? ` (기력이 가득 차 ${back - gotEn}만큼은 넘쳤다)` : ''}` : `하지 못한 ${left}시간의 기력은 이미 가득 차 있어 돌려받지 못했다.`);
    return { ok: true, lines };
  }
  function repair(d, i) {
    const e = ready(d); if (e) return e;
    const m = ct(d); const g = m.golems[Number(i)]; if (!g || g.awake) return err('고칠 골렘이 아니다.');
    const gate = gateOf(m, Number(i)); if (gate) return err(`이 골렘은 ${eul(gate)} 되살린 뒤에 고칠 수 있다.`);
    const lack = Object.entries(R.repair).filter(([k, n]) => have(d, k) < n);
    if (lack.length) return err(`고치려면 ${lack.map(([k, n]) => `${ITEMS[k].name} ${n}개`).join(', ')}가 있어야 한다.`);
    db.saveState(d, Object.entries(R.repair).map(([k, n]) => ({ id: k, qty: -n })));
    g.awake = true; g.dur = R.wear.max;
    return { ok: true, lines: [`쓰러진 골렘의 금 간 몸을 늪철로 잇고 흑요석을 박아 넣었다. 눈에 청록빛이 켜졌다. 골렘 탭에서 이름을 지어 줄 수 있다.`] };
  }
  // 일 보낼 때 닳는 내구도 (장신구 효과 golemWear: 지금은 이 효과를 가진 장신구 없음, 늘 1)
  const wearMul = (d) => (logic.lifeMods ? logic.lifeMods(d).golemWear : 1);
  const wearOf = (d, job, hours) => Math.max(1, Math.round(hours * (R.wear.perHour[job] || 3) * wearMul(d)));
  // 손질: 닳은 만큼 한 번에 채움. by = 'seal'(석공 인장) | 'mat'(룬이 새겨진 돌 + 늪철)
  const mendCost = (g, by) => { const lack = R.wear.max - (g.dur ?? R.wear.max); if (lack <= 0) return null;
    if (by === 'seal') return { seals: Math.ceil(lack / R.mend.seal), items: {} };
    const n = Math.ceil(lack / R.mend.mat.per); return { seals: 0, items: Object.fromEntries(Object.entries(R.mend.mat.cost).map(([k, c]) => [k, c * n])) }; };
  function mend(d, i, by) {
    const e = ready(d); if (e) return e;
    const m = ct(d); const g = m.golems[Number(i)];
    if (!g || !g.awake) return err('손질할 골렘이 아니다.');
    if (g.job) return err('일하러 간 골렘은 돌아온 뒤에 손질할 수 있다.');
    if (by !== 'seal' && by !== 'mat') return err('손질할 방법을 골라야 한다.');
    const c = mendCost(g, by); if (!c) return err(`${g.name}에게는 손질할 곳이 없다.`);
    if (m.seals < c.seals) return err(`석공 인장이 모자란다. (${c.seals}개 필요, 지금 ${m.seals}개)`);
    const lack = Object.entries(c.items).filter(([k, n]) => have(d, k) < n);
    if (lack.length) return err(`손질하려면 ${lack.map(([k, n]) => `${ITEMS[k].name} ${n}개`).join(', ')}가 있어야 한다.`);
    m.seals -= c.seals;
    if (Object.keys(c.items).length) db.saveState(d, Object.entries(c.items).map(([k, n]) => ({ id: k, qty: -n })));
    const before = g.dur; g.dur = R.wear.max;
    const paid = c.seals ? `석공 인장 ${c.seals}` : Object.entries(c.items).map(([k, n]) => `${ITEMS[k].name} ${n}`).join(', ');
    return { ok: true, lines: [`${eul(g.name)} 손질했다. 내구도 ${before} → ${g.dur}. (${paid})`] };
  }
  // 아직 못 고치는 골렘이면 되살려야 하는 칸 이름
  function gateOf(m, i) {
    const need = (R.repairGate || [])[i]; if (!need || !m.plot) return null;
    const rs = plotRooms(m), at = rs.findIndex((r) => r.id === need);
    return at >= 0 && curIdx(m) <= at ? rs[at].name : null;
  }
  function rename(d, i, name) {
    const m = ct(d); const g = m.golems[Number(i)]; if (!g) return err('그런 골렘은 없다.');
    if (!g.awake) return err('깨운 뒤에 이름을 지어 줄 수 있다.');
    name = String(name || '').replace(/\s+/g, ' ').trim();
    if (!GOLEM_NAME_RE.test(name)) return err('골렘 이름은 한글·영문·숫자로 1~12자까지 쓸 수 있다.');
    if (m.golems.some((x, k) => k !== Number(i) && x.awake && x.name === name)) return err('다른 골렘과 같은 이름이다.');
    const old = g.name; g.name = name; g.named = 1;
    return { ok: true, lines: [`${old}에게 '${name}'${josa(name, '이라는', '라는')} 이름을 지어 주었다. 골렘의 눈빛이 잠깐 밝아졌다.`] };
  }
  function reqOf(d) {
    const m = ct(d);
    if (!m.req) { const p = R.request.pool[(dayIdx() * 7 + (d.id % 13)) % R.request.pool.length]; m.req = { id: p[0], n: p[1], done: false }; }
    return m.req;
  }
  function fillReq(d) {
    const e = ready(d); if (e) return e;
    const q = reqOf(d); if (q.done) return err('오늘 부탁은 이미 들어줬다.');
    if (have(d, q.id) < q.n) return err(`${ITEMS[q.id].name} ${q.n}개가 있어야 한다.`);
    db.saveState(d, [{ id: q.id, qty: -q.n }]);
    q.done = true; const m = ct(d); m.seals += R.request.seals; const got = addSon(d, R.request.son);
    return { ok: true, lines: [`오르딘의 부탁을 들어줬다. 석공 인장 +${R.request.seals}.${got ? ` 재건도 +${got}.` : ''}`] };
  }
  function putFrag(d, key) {
    const e = ready(d); if (e) return e;
    const m = ct(d); if (!m.frags.includes(key)) return err('가진 조각이 아니다.');
    const [zid] = key.split(':'); if (!done('plaza')) return err('광장이 재건되어야 기억의 벽이 선다.');
    if (!done(zid)) return err('그 구역이 재건되어야 끼울 수 있다.');
    if (W.wall[key]) return err('이미 누군가 끼운 자리다.');
    W.wall[key] = d.name; m.frags = m.frags.filter((k) => k !== key); save();
    const z = ZONES.find((x) => x.id === zid), f = FRAGS[zid][+key.split(':')[1]];
    news(`${ga(d.name)} 기억의 벽에 '${f.t}' 조각을 끼웠다.`);
    return { ok: true, lines: [`기억의 벽 ${z.name} 줄에 '${f.t}' 조각을 끼웠다. 이 장면은 이제 모두가 읽을 수 있다.`] };
  }
  // 꾸미기 놓는 자리 (화면 HP.where와 같은 규칙): 되살린 칸의 벽 안쪽(아랫벽 뒤로 조금 숨길 수 있음, 거처 문 앞 제외) · 돌 마당 · 담 안 모래밭
  const decoBox = (x, y, w, h, [bx, by, bw, bh]) => x < bx + bw && bx < x + w && y < by + bh && by < y + h;
  // 가구가 선 곳: 가운데가 들어 있는 방, 아니면 바깥('out')
  function decoZone(s, x, y) { const [w, h] = DECO.size[s], cx = x + w / 2, cy = y + h / 2; for (const [id, [rx, ry, rw, rh]] of Object.entries(DECO.rooms)) if (cx >= rx && cx < rx + rw && cy >= ry && cy < ry + rh) return id; return 'out'; }
  function decoWhere(s, x, y, done) {
    const [w, h] = DECO.size[s];
    for (const [id, [rx, ry, rw, rh]] of Object.entries(DECO.rooms)) {
      if (!(x + w / 2 >= rx && x + w / 2 < rx + rw && y + h / 2 >= ry && y + h / 2 < ry + rh)) continue; // 가운데가 방 안이면 방 가구 (아래쪽 앞면에 걸친 바깥 가구는 아래 '건물 앞'으로)
      if (!done.includes(id)) return '아직 되살리지 않은 칸이다.';
      if (!(x >= rx + 5 && x + w <= rx + rw - 5 && y >= ry + 3 && y + h <= ry + rh + 2)) return '방 벽 안쪽에 놓아야 한다.';
      if (id === 'live' && y + h > ry + rh - 7 && x < DECO.door[1] && DECO.door[0] < x + w) return '문 앞은 비워 둬야 한다.';
      return null;
    }
    if (!done.includes('yard')) return '마당을 되살린 뒤에 놓을 수 있다.';
    const [yx, yy, yw, yh] = DECO.yard;
    if (decoBox(x, y, w, h, DECO.yard)) return x >= yx + 2 && y >= yy - 10 && y + h >= yy + 6 && x + w <= yx + yw - 2 && y + h <= yy + yh - 2 ? null : '마당 돌 안쪽에 놓아야 한다.'; // 위쪽은 발이 마당 안이면 윗부분이 담(돌 테두리)을 가려도 됨
    if (!(x >= 9 && y >= 9 && x + w <= DECO.W - 9 && y + h <= DECO.H - 9)) return '바깥 담 안에 놓아야 한다.';
    // 바깥뜰(담 안 모래·잔디): 건물(아래쪽 앞면 8줄 + 그림자 2줄까지)과 겹치면, 발이 그 아래 땅에 있어야 함. 그러면 윗부분이 건물 아랫부분에 걸쳐도 됨 (그 가구는 건물보다 앞에 그려짐)
    for (const [rx, ry, rw, rh] of Object.values(DECO.rooms)) if (decoBox(x, y, w, h, [rx - 1, ry - 1, rw + 2, rh + 11]) && y + h < ry + rh + 10) return '건물 앞에 놓으려면 벽 아래 땅에 세워야 한다.';
    if (DECO.block.some((b) => decoBox(x, y, w, h, b))) return '길 위에는 놓을 수 없다.';
    return null;
  }
  // 장식 배치 저장. list가 null이면 처음 모습(칸마다 정해진 가구)으로
  function setDeco(d, list) {
    const e = ready(d); if (e) return e;
    const m = ct(d); if (!m.plot) return err('먼저 집터를 골라야 한다.');
    if (list === null) { m.deco = null; return { ok: true, lines: ['장식을 처음 모습으로 되돌렸다.'] }; }
    if (!Array.isArray(list)) return err('장식 배치를 다시 해 보자.');
    if (list.length > DECO.max) return err(`장식은 ${DECO.max}개까지 놓을 수 있다.`);
    const done = plotRooms(m).slice(0, curIdx(m)).map((r) => r.id), items = [];
    for (const it of list) {
      const s = it && typeof it.s === 'string' && own(DECO.size, it.s) ? it.s : null; if (!s) return err('모르는 장식이다.');
      const x = Math.floor(Number(it.x)), y = Math.floor(Number(it.y));
      if (!Number.isFinite(x) || !Number.isFinite(y)) return err('장식 배치를 다시 해 보자.');
      items.push({ s, x, y, f: it.f ? 1 : 0, ...(s === 'bedplot' && Number.isInteger(it.g) ? { g: it.g } : {}) });
    }
    const boxes = [];
    for (const it of items) { // 올려 둔 소품은 받친 가구가 목록 어디에 있든 알아야 해서, 다 읽은 뒤에 검사
      const [w, h] = DECO.size[it.s], L = decoLayer(it, items);
      const why = decoWhere(it.s, it.x, it.y, done); if (why) return err(`${FURN[DECO.base[it.s]]?.name || '장식'}: ${why}`);
      const Z = decoZone(it.s, it.x, it.y); // 벽 안쪽(방)과 바깥뜰은 서로 겹쳐도 됨 (바깥 가구가 건물 아랫부분에 걸칠 때)
      if (L !== 'flat' && boxes.some((b) => b.L === L && b.Z === Z && decoBox(it.x, it.y, w, h, [b.x, b.y, b.w, b.h]))) return err('장식끼리 겹친다.');
      boxes.push({ ...it, w, h, L, Z });
    }
    grantFurn(d);
    const used = {}; boxes.forEach((b) => { const k = DECO.base[b.s]; used[k] = (used[k] || 0) + 1; });
    const over = Object.entries(used).find(([k, n]) => n > (m.furn[k] || 0));
    if (over) return err(`${FURN[over[0]]?.name || over[0]}${josa(FURN[over[0]]?.name || '가구', '이', '가')} 모자란다. (가진 것 ${m.furn[over[0]] || 0}개) 가구 만들기에서 더 만들 수 있다.`);
    m.deco = boxes.map(({ s, x, y, f, g }) => ({ s, x, y, ...(f ? { f } : {}), ...(g ? { g } : {}) })); gBeds(m); // f: 좌우 반전 (방향은 그림 이름에 들어 있음: chair_back 등), g: 텃밭 번호
    return { ok: true, lines: [m.deco.length ? `장식 ${m.deco.length}개를 놓았다.` : '장식을 모두 치웠다.'] };
  }
  function handFrag(d, key) {
    const m = ct(d); if (!m.frags.includes(key)) return err('가진 조각이 아니다.');
    if (!W.wall[key]) return err('아직 아무도 끼우지 않은 조각이다. 벽에 끼울 수 있다.');
    m.frags = m.frags.filter((k) => k !== key); m.seals += R.fragHand;
    return { ok: true, lines: [`오르딘에게 조각을 건넸다. 석공 인장 +${R.fragHand}.`] };
  }

  // ── 보기 ──
  function meView(d) {
    const m = ct(d);
    // 게임 어디에 있든 접속해 있으면 돌아온 골렘을 바로 정리 (도시를 열지 않아도 재건도가 늦게 쌓이지 않게)
    if (m.plot) { let ch = false; try { ch = settle(d); ch = flushBank(d) || ch; } catch (er) { console.error('[고대도시] meView', er && er.stack ? er.stack : er); } if (ch) db.saveState(d); }
    const awake = m.golems.filter((g) => g.awake);
    return { bookNew: bookNew(d, m), open: isOpen(), closed: !!W.closed && pathOpen(), inside: inside(d), plot: m.plot || null, stage: m.plot ? stage(m) : 0,
      back: awake.filter((g) => !g.job && g.report).length, idle: awake.filter((g) => !g.job).length, work: awake.filter((g) => g.job).length,
      next: (() => { const t = awake.filter((g) => g.job).reduce((a, g) => Math.min(a, g.until), Infinity); return Number.isFinite(t) ? t : null; })(), son: W.son, need: CITY_NEED,
      warp: hasWarp(m) && isOpen(), warpAp: R.warpAp, warpApRuin: RUIN.crossAp }; // 귀환 주문진을 놓아 두었으면 '내 집터로 가기' (행동력 warpAp)
  }
  function view(d) {
    const m = ct(d), now = Date.now();
    const rs = plotRooms(m), ci = m.plot ? curIdx(m) : -1;
    const need = new Set(); rs.forEach((r) => Object.keys(r.mats).forEach((k) => need.add(k))); Object.keys(R.repair).forEach((k) => need.add(k));
    const q = reqOf(d); need.add(q.id);
    WORKSHOP.list.forEach((w) => { need.add(w.out); Object.keys(w.needs).forEach((k) => need.add(k)); });
    Object.values(ZONE_MATS).forEach((b) => Object.keys(b).forEach((k) => need.add(k)));
    grantFurn(d); Object.values(FURN).forEach((f) => Object.keys(f.mats).forEach((k) => need.add(k)));
    return {
      rules: { dayCap: capOf(), golemEn: R.golemEn, hours: R.hours, repair: R.repair, jobs: JOBS, wear: R.wear, mend: R.mend },
      zones: ZONES.map((z) => ({ id: z.id, name: z.name, need: z.need, from: z.from, to: z.to, desc: z.desc, func: z.func, state: zState(z), box: Object.entries(ZONE_MATS[z.id]).map(([k, n]) => ({ id: k, name: matName(k), need: n, put: (W.box[z.id] || {})[k] || 0 })) })),
      son: W.son, total: CITY_NEED, hands: new Set([...Object.keys(W.hands), ...Object.keys(W.givers)]).size,
      wall: W.wall, frags: Object.fromEntries(Object.entries(FRAGS).map(([k, l]) => [k, l.map((f) => ({ t: f.t }))])),
      me: {
        plot: m.plot, plots: PLOTS.map((p) => ({ id: p.id, name: p.name, mood: p.mood, room: p.room, perk: p.perk })),
        rooms: rs.map((r, i) => ({ id: r.id, name: r.name, hours: r.hours, h: m.rooms[r.id].h, mats: Object.entries(r.mats).map(([k, n]) => ({ id: k, name: ITEMS[k].name, need: n, put: m.rooms[r.id].mats[k] || 0 })), opens: r.opens, state: i < ci ? 'done' : i === ci ? 'cur' : 'lock' })),
        golems: m.golems.map((g, i) => ({ i, name: g.name, named: !!g.named, awake: g.awake, job: g.job, hours: g.hours, start: g.start, until: g.until, report: g.report, last: g.last || null, gate: g.awake ? null : gateOf(m, i), dur: g.dur ?? R.wear.max })),
        garden: m.plot ? { list: gBeds(m).map((o, k) => ({ g: o.g, n: k + 1, ...(m.garden[o.g] ? gInfo(m.garden[o.g]) : { c: null }) })), crops: GARDEN.crops, dry: GARDEN.dry, gold: Math.floor(d.gold || 0) } : null,
        deco: m.deco || null, decoRules: { max: DECO.max }, packNote: m.packNote && m.packNote.at > Date.now() - 7 * 864e5 ? m.packNote : null, pondBack: m.pondBack && m.pondBack.at > Date.now() - 7 * 864e5 ? m.pondBack : null,
        furn: m.furn, furnCat: Object.entries(FURN).map(([k, f]) => ({ s: k, name: f.name, cat: f.cat, seals: sealCost(f), base: f.seals, cap: FURN_CAP[k] || null, bp: own(BLUEPRINT, BPKEY[k]) ? !!(m.bp || {})[BPKEY[k]] : null, mats: Object.entries(f.mats).map(([id, n]) => ({ id, name: ITEMS[id].name, need: n })) })),
        zday: Object.fromEntries(Object.entries(m.zday || {}).filter(([, v]) => v === dayIdx())), springLeft: ZF.springTimes - (m.spring && m.spring.day === dayIdx() ? m.spring.n : 0), bell: (() => { const bt = bellToday(), by = Array.isArray(bt.by) ? bt.by : []; return { n: by.length, need: ZF.bellNeed, mine: by.includes(d.name), on: by.length >= ZF.bellNeed }; })(), forgeOff: done('forge') ? ZF.forgeOff : 0,
        bp: Object.entries(BLUEPRINT).map(([k, c]) => ({ s: k, name: bpName(k), seals: c, have: !!(m.bp || {})[k] })),
        look: { floor: (m.look && m.look.floor) || {}, wall: (m.look && m.look.wall) || {}, own: m.plot ? lookOwn(m) : { floor: [], wall: [] }, cost: LOOK.cost },
        nap: { open: liveOpen(m), done: napToday(m), hours: NAP.hours, gather: NAP.gather, until: (() => { const n = logic.combatJson(d).nap; return n && n.until > now ? n.until : 0; })() },
        make: { open: workOpen(m), left: workLeft(m), per: WORKSHOP.perDay, list: WORKSHOP.list.filter((w) => ITEMS[w.out]).map((w, i) => ({ i: WORKSHOP.list.indexOf(w), id: w.out, name: ITEMS[w.out].name, qty: w.qty, needs: Object.entries(w.needs).map(([k, n]) => ({ id: k, name: ITEMS[k].name, need: n })) })) },
        trade: { left: tradeLeft(m), per: TRADE.perDay, offers: tradeOffers().map(([k, c, q], i) => ({ i, id: k, name: ITEMS[k].name, rarity: ITEMS[k].rarity, seals: c, qty: q || 1, city: TRADE.city.some((x) => x[0] === k) })) },
        perk: m.plot ? (() => { const on = perkOn(m), pd = perkDaily(m), max = perkMax(m); return { on, up: perkUp(m), kind: m.plot === 'forge' ? 'passive' : m.plot === 'belfry' ? 'recall' : 'daily', text: PI[m.plot].perk, left: on ? Math.max(0, max - pd.n) : 0, max, off: m.plot === 'forge' ? PERK.forgeOff[perkLv(m)] : 0 }; })() : null,
        book: { has: hasBook(m), list: bookOf(d.name), unread: bookNew(d, m) },
        gifts: m.plot && db.giftHomeList ? db.giftHomeList(d.id).map((g) => ({ id: g.id, from: g.from.name, at: g.at })) : [], // 집터에 놓여 있는 선물 (누가·언제만. 무엇인지는 받을 때 열어 봄)
        seals: m.seals, wearMul: wearMul(d), daySon: m.daySon || 0, bank: m.bank || 0, sonAll: m.sonAll || 0, frags: m.frags, en: d.en, enMax: logic.enCap(d),
        req: { ...q, name: ITEMS[q.id].name },
        inv: Object.fromEntries([...need].map((k) => [k, have(d, k)])),
      },
    };
  }
  // 도시 게시판: 재건을 도운 이 (가나다 순). 집터 이름과 방명록 받침이 있는지 함께 (놀러 가기용)
  function board(d) {
    const names = [...new Set([...Object.keys(W.hands), ...Object.keys(W.givers)])].sort((a, b) => a.localeCompare(b, 'ko'));
    return names.map((n) => { let plot = null, book = false, gone = false; try { const o = otherDragon(n); gone = !o || !!o.dead_at; const m = !gone && cityOf(o); if (m && m.plot && PI[m.plot]) { plot = PI[m.plot].name; book = hasBook(m); } } catch {} return { name: n, plot, book, gone, me: !!d && n === d.name }; }); // gone: 먼 여행을 떠났거나 긴 잠에 든 이 (이름은 남기고 집터는 보이지 않게)
  }
  function scene(key) { const [zid, i] = String(key).split(':'); const f = own(FRAGS, zid) ? FRAGS[zid][+i] : null; if (!f || !W.wall[key]) return null; return { t: f.t, s: f.s, who: W.wall[key], zone: ZONES.find((z) => z.id === zid).name }; }

  // ── 소켓 ──
  function bind(socket, entry) {
    const handle = (event, fn) => socket.on(event, (p, ack) => {
      if (typeof ack !== 'function') return;
      const e = entry(); if (!e) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
      const d = e.dragon; logic.regen(d);
      let res;
      try { settle(d); flushBank(d); res = fn(d, p && typeof p === 'object' ? p : {}); }
      catch (er) { console.error('[고대도시]', event, er && er.stack ? er.stack : er); return ack({ error: '고대도시에서 문제가 생겼다. 잠시 뒤 다시 해 보자.' }); }
      if (res.error) return ack(res);
      db.saveState(d); sendMe(socket, d);
      ack({ ...res, view: view(d) });
    });
    handle('city:get', () => ({ ok: true }));
    handle('city:enter', (d) => enter(d));
    handle('city:leave', (d) => leave(d));
    handle('city:choose', (d, p) => choose(d, String(p.id || '')));
    handle('city:put', (d) => put(d));
    handle('city:send', (d, p) => send(d, p.i, String(p.job || ''), p.hours));
    handle('city:repair', (d, p) => repair(d, p.i));
    handle('city:cancel', (d, p) => cancelJob(d, p.i)); // 골렘 작업 중단
    handle('city:rename', (d, p) => rename(d, p.i, p.name));
    handle('city:mend', (d, p) => mend(d, p.i, String(p.by || '')));
    handle('city:req', (d) => fillReq(d));
    handle('city:frag', (d, p) => putFrag(d, String(p.key || '')));
    handle('city:hand', (d, p) => handFrag(d, String(p.key || '')));
    handle('city:board', (d) => ({ ok: true, board: board(d) }));
    handle('city:give', (d) => give(d));
    handle('city:bp', (d, p) => buyBp(d, String(p.s || '')));
    handle('city:look', (d, p) => setLook(d, p));
    handle('city:garden', (d, p) => gardenAct(d, p));
    handle('city:trade', (d, p) => doTrade(d, p.i));
    handle('city:make', (d, p) => doMake(d, p.i));
    handle('city:nap', (d) => doNap(d));
    handle('city:visit', (d, p) => visitView(d, String(p.name || '')));
    handle('city:guest', (d, p) => guestWrite(d, String(p.name || ''), p.text));
    handle('city:book:seen', (d) => { ct(d).bookSeen = Date.now(); return { ok: true }; });
    handle('city:gift:take', (d, p) => takeGift(d, Number(p.id), socket));
    handle('city:fgift', (d, p) => giveFurn(d, String(p.name || ''), String(p.s || ''), p.n));
    handle('city:gold', (d, p) => giveGold(d, p.n));
    handle('city:perk', (d, p) => perkUse(d, p.i));
    handle('city:zone', (d, p) => zoneAct(d, String(p.id || '')));
    handle('city:cave:get', (d) => ({ ok: true, cave: caveView(d) }));
    handle('city:cave:enter', (d) => { const r = caveEnter(d); return r.error ? r : { ok: true, cave: caveView(d) }; });
    handle('city:cave:fire', (d, p) => caveFire(d, p.k));
    socket.on('city:cave:tick', (p) => { const e = entry(); if (e && p && typeof p === 'object') try { caveTick(e.dragon, p); } catch {} }); // 걸을 때마다 (답 없음, 저장은 다음 행동 때)
    handle('city:cave:leave', (d, p) => { const r = caveLeave(d, p); return r.error ? r : { ok: true, cave: caveView(d) }; });
    handle('city:cave:finish', (d, p) => { const r = caveFinish(d, p); return r.error ? r : { ...r, cave: caveView(d) }; });
    handle('city:cave:echo', (d) => { const r = caveEcho(d); return r.error ? r : { ok: true, cave: caveView(d) }; });
    handle('city:cave:echoEnd', (d, p) => { const r = caveEchoEnd(d, p); return r.error ? r : { ...r, cave: caveView(d) }; });
    handle('city:deco', (d, p) => setDeco(d, p.list === null ? null : p.list));
    handle('city:craft', (d, p) => craft(d, String(p.s || ''), p.n));
    handle('city:scene', (d, p) => { const s = scene(p.key); return s ? { ok: true, scene: s } : err('아직 아무도 끼우지 않은 조각이다.'); });
  }
  // ── GM 도구 (GM 창 '기록' 탭의 고대도시 칸) ──
  function gmView() {
    return { ok: true, open: isOpen(), path: pathOpen(), closed: !!W.closed, son: W.son, total: CITY_NEED, hands: Object.keys(W.hands).length, givers: Object.keys(W.givers).length, wall: Object.keys(W.wall).length,
      zones: ZONES.map((z) => ({ id: z.id, name: z.name, from: z.from, to: z.to, state: zState(z), box: Object.entries(ZONE_MATS[z.id]).map(([k, n]) => ({ name: matName(k), put: (W.box[z.id] || {})[k] || 0, need: n })) })) };
  }
  function bindGm(socket) {
    const on = (ev, fn) => socket.on(ev, (p, ack) => {
      if (typeof ack !== 'function') return;
      const u = socket.data && socket.data.user; if (!u || !u.is_gm) return ack({ error: 'GM만 쓸 수 있다.' });
      try { const r = fn(p && typeof p === 'object' ? p : {}); if (r && r.log) { try { db.gmLog(u.username, '고대도시', r.log); } catch {} } save(); ack(r && r.error ? r : gmView()); }
      catch (er) { console.error('[고대도시 GM]', ev, er); ack({ error: '처리하다 문제가 생겼다. 서버 기록을 확인하자.' }); }
    });
    const zi = (id) => ZONES.findIndex((z) => z.id === id);
    on('city:gm:get', () => ({}));
    on('city:gm:close', (p) => { W.closed = !!p.on; return { log: W.closed ? '도시 잠시 닫음 (점검)' : '도시 다시 엶' }; });
    on('city:gm:son', (p) => {
      const n = Math.trunc(Number(p.n)); if (!Number.isFinite(n) || !n) return { error: '더하거나 뺄 값을 적어야 한다.' };
      W.son = Math.max(0, W.son + n);
      if (n < 0) for (const z of ZONES) if (W.son < z.to) delete W.done[z.id]; // 빼서 모자라면 재건 취소
      advance(); return { log: `재건도 ${n > 0 ? '+' : ''}${n} → ${W.son}` };
    });
    on('city:gm:zone', (p) => {
      const i = zi(String(p.id)); if (i < 0) return { error: '그런 구역은 없다.' };
      if (p.done) { for (let k = 0; k <= i; k++) W.done[ZONES[k].id] = 1; } else { for (let k = i; k < ZONES.length; k++) delete W.done[ZONES[k].id]; }
      return { log: `${ZONES[i].name} ${p.done ? '재건됨으로 (앞 구역 포함)' : '재건 취소 (뒤 구역 포함)'}` };
    });
    on('city:gm:box', (p) => {
      const i = zi(String(p.id)); if (i < 0) return { error: '그런 구역은 없다.' };
      const z = ZONES[i]; W.box[z.id] = p.fill ? { ...ZONE_MATS[z.id] } : {};
      if (p.fill) advance();
      return { log: `${z.name} 재료함 ${p.fill ? '채움' : '비움'}` };
    });
  }
  const bind0 = bind;
  return { RULES: R, meView, warpTo, bind: (socket, entry) => { bind0(socket, entry); bindGm(socket); }, isOpen };
};
module.exports.CITY_RULES = CITY_RULES;
module.exports.CITY_ZONES = ZONES;
module.exports.CITY_TRADE = TRADE; // 재료 얻는 곳 안내(server.js ITEM_SOURCES)에 씀
module.exports.CITY_WORKSHOP = WORKSHOP;
module.exports.CITY_JOBS = JOBS;
