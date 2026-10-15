// 게임 기본 데이터: 드래곤 종류와 대륙 지도
// 새 종류나 지역을 추가할 때는 이 파일만 고치면 됩니다.

const KINDS = {
  black: {
    name: '블랙 드래곤',
    breath: '산(酸)',
    home: 'swamp',
    desc: '늪의 안개 속에 사는 잿빛 비늘의 드래곤. 위협과 약탈에 능하다.',
  },
  gold: {
    name: '골드 드래곤',
    breath: '화염',
    home: 'canyon',
    desc: '햇빛을 머금은 비늘의 드래곤. 보물을 알아보는 눈과 말솜씨가 있다.',
  },
  white: {
    name: '화이트 드래곤',
    breath: '냉기',
    home: 'snow',
    desc: '설원의 고요를 사랑하는 드래곤. 홀로 지내는 데 익숙하다.',
  },
  green: {
    name: '그린 드래곤',
    breath: '독',
    home: 'forest',
    desc: '숲의 이끼와 약초를 잘 아는 드래곤. 속내를 쉽게 드러내지 않는다.',
  },
};

// x, y는 지도(가로 1000 × 세로 680) 위의 위치
const REGION_LIST = [
  { id: 'plains',  name: '중앙 평원',    tag: '야생',     x: 500, y: 370,
    desc: '대륙 한가운데 펼쳐진 너른 풀밭. 사방으로 길이 갈라지고, 멀리 왕도의 탑이 보인다.' },
  { id: 'capital', name: '왕도 아르덴',  tag: '인간 왕국', x: 585, y: 235,
    desc: '인간들의 성벽 도시. 성루 위의 파수병들이 하늘을 올려다보며 수군거린다.' },
  { id: 'snow',    name: '북부 설원',    tag: '야생',     x: 470, y: 95,
    desc: '바람 소리 말고는 아무것도 들리지 않는 하얀 들판. 눈 아래 무언가 잠들어 있을지도 모른다.' },
  { id: 'ruins',   name: '고대 유적',    tag: '야생',     x: 215, y: 150,
    desc: '무너진 석주들 사이로 오래된 문양이 희미하게 빛난다. 누가 세웠는지 아는 이는 없다.' },
  { id: 'forest',  name: '독안개 숲',    tag: '야생',     x: 225, y: 365,
    desc: '초록빛 안개가 나무 사이를 낮게 흐른다. 이끼 낀 바닥에 낯선 약초가 자란다.' },
  { id: 'swamp',   name: '검은 늪',      tag: '야생',     x: 330, y: 560,
    desc: '검은 물이 소리 없이 고여 있는 늪지. 썩은 나무 그루터기 위로 거품이 올라온다.' },
  { id: 'coast',   name: '남쪽 해안 절벽', tag: '인간 왕국', x: 660, y: 575,
    desc: '파도가 부서지는 절벽 아래 작은 어촌이 있다. 어부들은 하늘의 그림자에 민감하다.' },
  { id: 'canyon',  name: '태양 협곡',    tag: '야생',     x: 815, y: 380,
    desc: '붉은 바위벽이 햇빛을 받아 금빛으로 달아오른다. 바위틈에 광맥이 드러나 있다.' },
  { id: 'volcano', name: '잿빛 화산',    tag: '야생',     x: 775, y: 130,
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

const REGIONS = {};
for (const r of REGION_LIST) REGIONS[r.id] = { ...r, links: [] };
for (const [a, b] of ROUTES) {
  REGIONS[a].links.push(b);
  REGIONS[b].links.push(a);
}

module.exports = { KINDS, REGIONS };
