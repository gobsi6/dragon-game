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

module.exports = { KINDS, REGIONS, STANCES, STATS, CREATION, derive };
