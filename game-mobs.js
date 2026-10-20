// 모브 드래곤: 야생 지역마다 머무는 드래곤들. 성향과 상관없이 의뢰·이야기·물물교환을 할 수 있다.
// 숫자와 대사는 이 파일 위쪽(MOB_RULES, MOBS)에서 고친다.
const { ITEMS, PLACES, REGIONS, ELITES, REGION_PLACES, fameTier } = require('./game-data');
const logic = require('./game-logic');

// ── 규칙 ────────────────────────────────────────────
const MOB_RULES = {
  offers: 2,       // 드래곤마다 하루에 내미는 의뢰 수 (한국 시간 자정에 바뀜)
  maxActive: 3,    // 동시에 맡을 수 있는 의뢰 수 (건네기 의뢰는 맡지 않고 바로 끝냄)
  tradeDaily: 3,   // 교환 하나당 하루 횟수
  fameCap: 30,
  // 보상 크기 맞추기
  //  경험치: 난이도별 기본값 × (xpBase + 내 레벨 × xpPerLv)  (Lv1 ×0.72, Lv5 ×1.2, Lv10 ×1.8)
  //  금화·경험치: 일의 레벨과 내 레벨 차이 1당 ±perLv (gapMin~gapMax). 내게 쉬운 일은 덜, 버거운 일은 더 받음
  scale: { xpBase: 0.6, xpPerLv: 0.12, perLv: 0.1, gapMin: 0.4, gapMax: 1.5 },     // 의뢰·이야기로 오르는 용족 명성은 여기('존중')까지만. 그 위는 결투·재앙·위협 같은 원래 길로
  // 의뢰 난이도별 보상
  tiers: {
    1: { gold: 35,  xp: 25,  fame: 2 },
    2: { gold: 70,  xp: 55,  fame: 3 },
    3: { gold: 140, xp: 110, fame: 5 },
  },
};

// 목표 적는 법
//   win: 장소 id, n        그 장소에서 사냥 n번 이기기
//   winR: 지역 id, n       그 지역에서 사냥 n번 이기기
//   elite: 지역 id         그 지역의 강적 쓰러뜨리기
//   gather / explore: 지역 id, n
//   count: 칭호·특성 셈 이름(corrupt, expedition, craft …), n
//   bring: { 물건 id: 개수 }  가져다주기 (맡지 않고 바로 건넴)
const MOBS = {
  barg: {
    region: 'plains', name: '바르그', kind: 'red', who: '뿔 꺾인 늙은 레드',
    desc: '뿔 하나가 잘려 나간 늙은 레드 드래곤. 바람 언덕 바위에 몸을 누이고 지나가는 용들을 가늠한다.',
    greet: '흥, 젊은 것. 겁먹고 도망칠 생각은 아니겠지?',
    greetHi: '오, 소문의 그 녀석이군. 이 늙은이도 네 이름은 들었다.', // 용족 명성 높음 (경외·존중)
    greetLo: '…네 얘기는 들었다. 볼일만 보고 꺼져라.', // 용족 명성 낮음 (수군거림·멸시·수치)
    pool: [
      { t: 1, g: { win: 'plains_hill', n: 3 }, say: '언덕 늑대들이 내 낮잠을 방해한다. 좀 조용히 시켜라.' },
      { t: 1, g: { bring: { bison_horn: 3 } }, say: '들소 뿔을 갈아 먹으면 이가 튼튼해지지. 몇 개 가져와.' },
      { t: 1, g: { gather: 'plains', n: 3 }, say: '풀이나 뜯는 꼴은 우습지만, 둥지 깔개로는 쓸만하지.' },
      { t: 2, g: { win: 'plains_war', n: 3 }, say: '옛 전장의 망령들… 내가 싸웠던 전쟁의 찌꺼기다. 쉬게 해 줘라.' },
      { t: 2, g: { winR: 'plains', n: 5 }, say: '사냥감 다섯을 쓰러뜨려 와라. 그럼 너를 조금은 인정해 주지.' },
      { t: 2, g: { bring: { wolf_pelt: 3, beast_hide: 2 } }, say: '겨울이 오기 전에 깔개를 새로 깔아야겠다.' },
      { t: 3, g: { elite: 'plains' }, say: '뿔 꺾인 들소왕이 또 나타났다더군. 놈의 콧대를 꺾어 와.' },
    ],
    trades: [
      { give: { wolf_pelt: 3 }, get: { hunter_stew: 1 } },
      { give: { bison_horn: 2, beast_hide: 2 }, get: { war_paint: 1 } },
      { gold: 30, get: { honey_salve: 1 } },
    ],
    story: {
      title: '부러진 뿔의 맹세',
      ch: [
        { intro: '내 뿔이 왜 부러졌는지 궁금하냐? …먼저 쓸만한 녀석인지 보자. 옛 전장의 망령 다섯을 쓰러뜨려라.',
          g: { win: 'plains_war', n: 5 }, t: 2,
          done: '망령들이 흩어진 자리에서 낡은 기사단 깃발 조각이 나왔다. 바르그가 그것을 오래 바라본다.' },
        { intro: '백 년 전, 나는 인간 기사단과 싸웠다. 그때 나와 함께 날던 녀석이 있었지. 그 녀석을 위해 언덕에 돌무덤을 쌓을 거다. 짐승 가죽과 송곳니를 가져와.',
          g: { bring: { beast_hide: 4, sharp_fang: 2 } }, t: 2,
          done: '바르그가 언덕 꼭대기에 작은 돌무덤을 쌓았다. "…이제야 인사를 하는군."' },
        { intro: '그날 우리를 쫓던 들소왕의 후손이 아직 평원을 누빈다. 놈을 쓰러뜨려라. 그러면 내 뿔을 너에게 주마.',
          g: { elite: 'plains' }, t: 3, item: 'barg_horn',
          done: '바르그가 부러진 뿔 조각을 내밀었다. "이제 이건 네 것이다. 나보다 오래 날아라."' },
      ],
    },
  },
  harsia: {
    region: 'snow', name: '하르시아', kind: 'white', who: '눈보라 속의 화이트 장로',
    desc: '눈보라가 칠 때만 모습을 드러내는 늙은 화이트 드래곤. 얼음 같은 눈으로 오래된 노래를 흥얼거린다.',
    greet: '추위가 두렵지 않다면, 잠시 이야기를 들어 주겠니.',
    greetHi: '눈보라도 너를 알아보는구나. 어서 와, 네 이야기를 기다리고 있었어.', // 용족 명성 높음 (경외·존중)
    greetLo: '…차가운 소문이 먼저 왔네. 그래도 이야기는 들어 줄게.', // 용족 명성 낮음 (수군거림·멸시·수치)
    pool: [
      { t: 1, g: { win: 'snow_field', n: 3 }, say: '눈벌판 늑대들이 새끼 사슴을 노려. 쫓아내 줘.' },
      { t: 1, g: { gather: 'snow', n: 3 }, say: '서리 이끼를 모아 와. 따뜻한 차를 끓여 줄게.' },
      { t: 1, g: { explore: 'snow', n: 2 }, say: '눈 아래 무언가 묻혀 있대. 찾아봐 줄래?' },
      { t: 2, g: { win: 'snow_cave', n: 2 }, say: '얼음 동굴의 트롤이 내 얼음 조각을 부수고 다녀.' },
      { t: 2, g: { bring: { frost_lichen: 2, ice_shard: 3 } }, say: '오래된 상처에 바를 연고를 만들 거야.' },
      { t: 3, g: { win: 'snow_peak', n: 1 }, say: '오로라 봉우리의 와이번… 한 마리만 잡아 줄래? 날개막이 필요해.' },
      { t: 3, g: { elite: 'snow' }, say: '서리 늑대 우두머리가 무리를 이끌고 내려왔어.' },
    ],
    trades: [
      { give: { ice_shard: 4 }, get: { frost_lichen: 1 } },
      { give: { frost_lichen: 2, wolf_pelt: 1 }, get: { moss_salve: 1 } },
      { give: { eternal_ice: 1 }, get: { sage_tea: 1 } },
    ],
    story: {
      title: '얼음 속의 알',
      ch: [
        { intro: '설원 깊은 얼음 속에, 오래전 잃어버린 내 알이 잠들어 있어. 먼저 눈벌판을 살펴 줘.',
          g: { explore: 'snow', n: 3 }, t: 1,
          done: '눈 아래에서 금이 간 알껍데기 조각을 찾았다. 하르시아가 숨을 멈춘다.' },
        { intro: '얼음 동굴의 트롤들이 그 알을 가져갔을지도 몰라. 트롤 셋을 쓰러뜨려 줘.',
          g: { win: 'snow_cave', n: 3 }, t: 2,
          done: '트롤 굴 안쪽, 녹지 않는 얼음 덩어리 속에서 희미한 빛이 새어 나왔다.' },
        { intro: '그 얼음을 녹이려면 불의 결정이 필요해. 그리고 녹지 않는 얼음 하나로 새 요람을 만들 거야.',
          g: { bring: { fire_crystal: 1, eternal_ice: 1 } }, t: 3, item: 'harsia_mantle',
          done: '얼음이 녹자, 알 속에서 아주 작은 화이트 드래곤이 눈을 떴다. 하르시아가 자기 비늘로 엮은 망토를 건넨다. "고마워. 정말로."' },
      ],
    },
  },
  ordin: {
    region: 'ruins', name: '오르딘', kind: 'silver', who: '유적을 읽는 실버 학자',
    desc: '무너진 석주 사이에 두루마리를 펼쳐 놓고 중얼거리는 실버 드래곤. 눈앞에 얇은 수정 조각을 띄워 두었다.',
    greet: '아, 마침 잘 왔네. 손이 하나 더 필요했거든.',
    greetHi: '오오, 자네로군! 자네 이름은 내 기록에도 남겨 두었다네.', // 용족 명성 높음 (경외·존중)
    greetLo: '흠… 자네에 대한 기록은 좋지 않더군. 뭐, 일손은 일손이지.', // 용족 명성 낮음 (수군거림·멸시·수치)
    pool: [
      { t: 1, g: { explore: 'ruins', n: 2 }, say: '회랑 벽의 문양을 더 찾아 주게.' },
      { t: 1, g: { bring: { rune_stone: 4 } }, say: '룬 돌을 모으는 중일세. 많을수록 좋지.' },
      { t: 1, g: { gather: 'ruins', n: 3 }, say: '돌 부스러기 하나에도 글자가 남아 있을지 모르네.' },
      { t: 2, g: { win: 'ruins_hall', n: 3 }, say: '돌 파수꾼들이 자꾸 연구를 방해하네.' },
      { t: 2, g: { bring: { old_scroll: 2 } }, say: '바랜 두루마리 두 장이면 이 문장을 다 읽을 수 있겠어.' },
      { t: 3, g: { win: 'ruins_crypt', n: 2 }, say: '묘실의 해골 기사들… 그들이 무엇을 지키는지 알고 싶네.' },
      { t: 3, g: { elite: 'ruins' }, say: '깨어난 수호 골렘을 다시 재워 주게.' },
    ],
    trades: [
      { give: { rune_stone: 5 }, get: { old_scroll: 1 } },
      { give: { old_scroll: 3 }, get: { recipe_scroll: 1 }, weekly: 1, needStory: true }, // 이야기를 끝까지 들은 뒤, 일주일에 1번
      { give: { ancient_relic: 1 }, get: { sage_tea: 1 } },
    ],
    story: {
      title: '봉인된 제단의 비문',
      ch: [
        { intro: '제단의 비문을 읽으려면 먼저 회랑에 흩어진 조각을 맞춰야 하네. 회랑을 세 번 탐사해 주게.',
          g: { explore: 'ruins', n: 3 }, t: 1,
          done: '깨진 비문 조각을 맞추자 "용과 인간이 함께…"라는 글귀가 드러났다.' },
        { intro: '나머지는 묘실 안에 있을 걸세. 해골 기사 셋을 지나야 하지.',
          g: { win: 'ruins_crypt', n: 3 }, t: 2,
          done: '묘실 벽에 용과 인간 기사가 나란히 새겨진 부조가 있었다.' },
        { intro: '마지막 조각은 봉인의 핵 속에 있네. 하나 가져다주게.',
          g: { bring: { seal_core: 1 } }, t: 3, item: 'ordin_circlet',
          done: '비문이 완성되었다. "용과 인간이 함께 재앙을 봉인하였노라." 오르딘이 룬을 새긴 관을 건넨다. "자네가 이 이야기의 마지막 장을 열었네."' },
      ],
    },
    gate: {
      title: '땅속으로 이어진 계단',
      key: 'corridor',
      // 아직 자격이 없을 때 회랑 입구 띠에 보이는 말
      locked: '회랑 입구는 오르딘이 지키고 있다. 먼저 그에게 말을 걸어야 한다.',
      ch: [
        { intro: '무너진 회랑 벽 뒤에서 계단을 하나 찾았네. 땅속 깊이, 끝이 보이지 않을 만큼 이어져 있더군. 그런데 입구에 봉인 문양이 새겨져 있어. 읽으려면 룬 돌이 필요하네. 세 개만 가져다주게.',
          g: { bring: { rune_stone: 3 } }, t: 1,
          done: '오르딘이 룬 돌을 문양 위에 하나씩 올려놓는다. 돌이 희미하게 빛나며 글자가 떠올랐다. "…\'잠든 돌이 길을 지킨다\'라. 좋지 않은 소식이군."' },
        { intro: '문양에 따르면 회랑 안에는 돌 파수꾼들이 잠들어 있다네. 발소리에 깨어나는 놈들이지. 자네가 그놈들을 감당할 수 있는지 먼저 보고 싶네. 무너진 회랑에서 돌 파수꾼 둘을 쓰러뜨려 주게.',
          g: { win: 'ruins_hall', n: 2 }, t: 1,
          done: '돌 파수꾼이 무너진 자리에서, 오르딘이 부서진 돌 조각을 살핀다. "이것들보다 깊은 곳에 있는 놈들은 더 단단하겠지. 그래도 자네라면 해 볼 만하겠어."' },
        { intro: '마지막일세. 계단 아래에 옛 탐사대가 남긴 표식이 있다고 비문에 적혀 있는데, 그 위치를 알려면 회랑 벽의 그림을 한 번 더 살펴야 하네. 회랑을 한 번 탐사해 주게.',
          g: { explore: 'ruins', n: 1 }, t: 1,
          done: '벽화 구석에서 작은 불꽃 문양을 찾아냈다. 오르딘이 고개를 끄덕이며 횃불 하나를 건넨다. "옛 탐사대는 불을 피운 자리마다 이 문양을 남겼네. 이제 자네도 내려갈 수 있어."' },
      ],
      // 마지막 장을 끝낸 직후, 이어서 한 줄씩 보여 주는 안내 (규칙 설명)
      guide: [
        '횃불 하나로 마흔 걸음일세. 누가 이미 지나간 길은 반만 타고, 아직 아무도 밟지 않은 길은 온전히 타지.',
        '옛 탐사대가 피운 화톳불 자리를 찾게. 찾아 둔 자리에서는 다음번에 곧장 내려갈 수 있고, 불 곁에서 상처도 돌볼 수 있다네. 횃불 한 걸음이면 되지.',
        '돌 파수꾼은 그냥 지나치면 등 뒤를 세게 친다네. 횃불을 써서 싸울지, 한 대 맞고 지나갈지 잘 고르게.',
        '층마다 아래로 가는 계단이 봉인돼 있네. 네 기둥을 지키는 수호자를 쓰러뜨리고, 네 기둥에 함께 불을 밝혀야 풀리지. 혼자서는 어려우니 다른 드래곤을 부르게.',
        '비문에 따르면, 일곱 번째 층 아래에 고대도시가 잠들어 있다네. …나도 그 문이 열리는 걸 보고 싶군.',
      ],
      // 자격을 얻은 뒤 말을 걸면 (greet 대신)
      greetIn: '회랑은 어떤가? 내려갈 때마다 무엇을 보았는지 들려주게. 기록해 두고 있으니.',
      // 층이 정복될 때: 대륙 소식 한 줄 + 그 뒤 말을 걸면 오르딘이 하는 말
      floors: {
        1: { news: '오르딘이 지하 회랑 제 1층의 지도를 다 그렸다고 알렸다.',
             say: '첫 층의 봉인이 풀렸군! 계단 아래에서 더 오래된 공기가 올라오고 있네. 벽돌 쌓는 법부터 달라.' },
        2: { news: '오르딘이 제 2층 벽에서 고대 문자를 새로 찾았다.',
             say: '제 2층 벽의 글자는 제단의 비문과 같은 손으로 쓰였네. 같은 시대, 같은 이들이 이 길을 팠다는 뜻이지.' },
        3: { news: '지하 회랑 제 3층이 정복되었다. 오르딘이 밤새 두루마리를 펼쳐 두었다.',
             say: '수호자들이 지키던 기둥 말일세. 네 기둥에 새겨진 이름이 모두 다르더군. 문지기였던 용들의 이름일지도 모르겠네.' },
        4: { news: '지하 회랑 제 4층이 정복되었다. 아래쪽에서 바람이 끊겼다.',
             say: '이제부터는 바람이 없네. 다음 층부터는 어둠이 짙어질 걸세. 횃불이 비추는 곳이 훨씬 좁아질 테니 조심하게.' },
        5: { news: '어둠 속 제 5층이 정복되었다. 무너지는 회랑 사이로 길이 열렸다.',
             say: '회랑이 스스로 무너지고 다시 열린다지? 길이 살아 있는 것처럼 말이야. 누군가 이곳을 아직도 지키고 있는 걸세.' },
        6: { news: '제 6층이 정복되었다. 오르딘이 고대도시의 문장을 그리기 시작했다.',
             say: '벽화 속에 성문이 보이기 시작했네. 용과 인간이 나란히 서 있는 문이야. 거의 다 왔어.' },
        7: { news: '지하 회랑의 일곱 층이 모두 밝혀졌다. 고대도시로 가는 길이 열렸다.',
             say: '…해냈군. 자네들 모두가. 저 아래 문 너머에 무엇이 있든, 이 길을 연 건 자네들일세. 내 기록의 마지막 장에 모두의 이름을 적어 두겠네.' },
      },
    },
  },
  morgana: {
    region: 'forest', name: '모르가나', kind: 'green', who: '독안개 숲의 약초사',
    desc: '독안개 속에서 약초 냄새를 풍기는 그린 드래곤. 꼬리 끝에 작은 약초 주머니를 매달고 다닌다.',
    greet: '안개를 들이마시지 마. …아, 이미 마셨구나. 괜찮아, 해독제가 있어.',
    greetHi: '왔구나! 숲의 짐승들도 네 이야기를 하더라. 차 한 잔 할래?', // 용족 명성 높음 (경외·존중)
    greetLo: '안개보다 네 소문이 더 독하더라. …필요한 게 뭐야?', // 용족 명성 낮음 (수군거림·멸시·수치)
    pool: [
      { t: 1, g: { gather: 'forest', n: 3 }, say: '독초가 모자라. 조금 뜯어다 줄래?' },
      { t: 1, g: { win: 'forest_edge', n: 3 }, say: '거미줄이 약초밭을 뒤덮었어.' },
      { t: 2, g: { bring: { toad_gland: 2 } }, say: '두꺼비 독샘 두 개. 해독제의 재료야.' },
      { t: 2, g: { win: 'forest_valley', n: 3 }, say: '독두꺼비들이 너무 많아졌어.' },
      { t: 2, g: { count: 'corrupt', n: 3 }, say: '오염된 땅의 풀을 연구하고 싶어. 그곳에서 세 번 움직여 보고 이야기해 줘.' },
      { t: 3, g: { win: 'forest_heart', n: 1 }, say: '나무 수호자가 화가 났어. 진정시켜… 아니, 쓰러뜨려 줘.' },
      { t: 3, g: { elite: 'forest' }, say: '여왕 거미가 알을 낳기 전에!' },
    ],
    trades: [
      { give: { poison_herb: 4 }, get: { glow_moss: 1 } },
      { give: { glow_moss: 2, wild_honey: 1 }, get: { calm_incense: 1 } },
      { gold: 40, get: { moss_salve: 1 } },
    ],
    story: {
      title: '시들어 가는 고목',
      ch: [
        { intro: '숲의 심장인 고목이 시들고 있어. 원인을 찾아야 해. 숲을 두 번 탐사해 줘.',
          g: { explore: 'forest', n: 2 }, t: 1,
          done: '고목 뿌리 근처에서 검붉은 진액이 스며 나오는 걸 발견했다.' },
        { intro: '오염이야… 오염된 땅의 기운이 뿌리를 타고 왔어. 오염된 땅에서 세 번 움직이며 그 기운을 흩어 줘.',
          g: { count: 'corrupt', n: 3 }, t: 2,
          done: '오염된 기운이 옅어지자 고목의 잎 몇 장이 다시 초록빛을 띠었다.' },
        { intro: '이제 고목에 새 힘을 불어넣을 차례야. 살아 있는 나무껍질과 빛나는 이끼를 가져와.',
          g: { bring: { living_bark: 2, glow_moss: 3 } }, t: 3, item: 'morgana_seed',
          done: '고목이 깊게 숨을 쉬듯 흔들렸다. 모르가나가 고목의 씨앗을 꿴 목걸이를 걸어 준다. "숲이 널 기억할 거야."' },
      ],
    },
  },
  skrag: {
    region: 'swamp', name: '스크라그', kind: 'black', who: '늪에 숨은 블랙',
    desc: '검은 물 위로 눈만 내놓고 있는 블랙 드래곤. 목소리가 늘 낮게 깔려 있다.',
    greet: '…인간 냄새는 안 나는군. 좋아, 얘기해 보자.',
    greetHi: '…대단한 녀석이 왔군. 이 늪까지 네 이름이 흘러들더라.', // 용족 명성 높음 (경외·존중)
    greetLo: '…너 같은 녀석은 늪에 흔하지. 용건만 말해.', // 용족 명성 낮음 (수군거림·멸시·수치)
    pool: [
      { t: 1, g: { win: 'swamp_reeds', n: 3 }, say: '악어들이 내 사냥감을 가로챈다.' },
      { t: 1, g: { gather: 'swamp', n: 3 }, say: '늪철을 모으고 있지. 쓸 데가 있거든.' },
      { t: 1, g: { explore: 'swamp', n: 2 }, say: '늪 바닥에 뭐가 가라앉아 있는지 보고 와.' },
      { t: 2, g: { win: 'swamp_village', n: 3 }, say: '가라앉은 마을의 망령들이 시끄럽다.' },
      { t: 2, g: { bring: { croc_scale: 3, bog_iron: 1 } }, say: '비늘 갑옷을 손볼 거다.' },
      { t: 3, g: { win: 'swamp_mire', n: 1 }, say: '작은 히드라의 피… 한 방울이면 충분해.' },
      { t: 3, g: { elite: 'swamp' }, say: '늪의 늙은 악어. 놈이 내 꼬리를 물었었지.' },
    ],
    trades: [
      { give: { black_reed: 4 }, get: { bog_iron: 1 } },
      { give: { croc_scale: 3 }, get: { scale_oil: 1 } },
      { give: { hydra_blood: 2, bog_iron: 1 }, get: { hydra_tonic: 1 } },
    ],
    story: {
      title: '가라앉은 마을의 종',
      ch: [
        { intro: '저 가라앉은 마을 말이다… 누가 그 마을을 늪에 가라앉혔는지 아나? …먼저 망령들을 치워라.',
          g: { win: 'swamp_village', n: 3 }, t: 2,
          done: '망령들이 흩어진 자리에 녹슨 종 하나가 드러났다.' },
        { intro: '저 종은 인간들이 용을 쫓을 때 울리던 거다. 그날 밤, 내가 마을 둑을 무너뜨렸지. …후회? 글쎄. 늪 진주를 하나 가져와. 종에 바칠 거다.',
          g: { bring: { bog_pearl: 1 } }, t: 2,
          done: '스크라그가 진주를 종 안에 넣고 오래 말이 없었다. "…마을엔 아이들도 있었지."' },
        { intro: '수렁 깊은 곳의 히드라가 망령들을 불러낸다. 놈들을 없애면 이 늪도 조금은 조용해지겠지.',
          g: { win: 'swamp_mire', n: 2 }, t: 3, item: 'skrag_claw',
          done: '늪 위로 처음으로 안개가 걷혔다. 스크라그가 검은 발톱덮개를 던져 준다. "내가 쓰던 거다. …넌 나처럼 되지 마라."' },
      ],
    },
  },
  aurel: {
    region: 'canyon', name: '아우렐', kind: 'gold', who: '금을 모으는 골드 상인',
    desc: '황금 절벽 그늘에 금광석을 산처럼 쌓아 둔 골드 드래곤. 거래라면 사족을 못 쓴다.',
    greet: '어서 와, 어서 와! 오늘은 뭘 바꿔 갈 텐가?',
    greetHi: '이게 누구야! 대륙에서 제일 잘나가는 손님이잖아! 오늘은 특별히 잘해 주지.', // 용족 명성 높음 (경외·존중)
    greetLo: '어… 자네 소문이 장사에 안 좋은데. 뭐, 금은 금이니까. 빨리 끝내자고.', // 용족 명성 낮음 (수군거림·멸시·수치)
    pool: [
      { t: 1, g: { gather: 'canyon', n: 3 }, say: '금광석이 반짝이는 소리가 들리지 않나? 캐 와!' },
      { t: 1, g: { win: 'canyon_path', n: 3 }, say: '전갈들이 내 금고 근처를 어슬렁거려.' },
      { t: 2, g: { bring: { gold_ore: 3 } }, say: '금광석 셋이면 장사가 되지.' },
      { t: 2, g: { win: 'canyon_storm', n: 2 }, say: '모래 벌레가 내 보물 굴을 파먹고 있어!' },
      { t: 2, g: { count: 'expedition', n: 1 }, say: '원정 한 번 다녀와서 바깥 소식을 들려줘. 장사엔 소문이 제일이야.' },
      { t: 3, g: { win: 'canyon_cliff', n: 1 }, say: '그리핀 깃털! 아주 비싸게 팔리거든.' },
      { t: 3, g: { elite: 'canyon' }, say: '황금 꼬리 전갈의 꼬리… 진짜 금일까?' },
    ],
    trades: [
      { give: { red_clay: 4 }, get: { gold_ore: 1 } },
      { give: { gold_ore: 2 }, getGold: 18 },
      { give: { sharp_fang: 2 }, getGold: 20 },
      { gold: 35, get: { ember_tea: 1 } },
    ],
    story: {
      title: '사라진 금화 자루',
      ch: [
        { intro: '내 금고에서 금화 한 자루가 사라졌어! 범인은 분명 전갈이야. 붉은 바위길의 전갈 넷을 혼내 줘.',
          g: { win: 'canyon_path', n: 4 }, t: 1,
          done: '전갈 굴에 금화는 없었다. 대신 모래 위에 작은 발자국이 찍혀 있었다.' },
        { intro: '발자국? …작은 용의 발자국이잖아. 협곡을 뒤져 봐.',
          g: { explore: 'canyon', n: 3 }, t: 2,
          done: '바위틈에서 어린 골드 드래곤이 금화 자루를 끌어안고 잠들어 있었다.' },
        { intro: '…내 어릴 적이랑 똑같군. 그 녀석한테 줄 선물을 만들어야겠어. 금광석과 태양석을 가져와.',
          g: { bring: { gold_ore: 4, sun_stone: 1 } }, t: 3, item: 'aurel_ring',
          done: '아우렐이 어린 용에게 작은 금목걸이를 걸어 주고, 너에게는 금빛 꼬리고리를 건넨다. "금보다 귀한 게 있다는 걸 오늘 알았네."' },
      ],
    },
  },
  ignar: {
    region: 'volcano', name: '이그나르', kind: 'bronze', who: '분화구의 대장장이',
    desc: '분화구 가장자리에서 꼬리로 쇠를 두드리는 브론즈 드래곤. 비늘 곳곳에 불똥 자국이 있다.',
    greet: '불 앞에서 겁먹지 않는 눈이군. 마음에 들어.',
    greetHi: '네 이름은 불똥처럼 퍼졌더군. 너라면 내 화로 곁에 서도 좋다.', // 용족 명성 높음 (경외·존중)
    greetLo: '…소문이 시원찮더군. 불 앞에선 말보다 행동이다. 증명해 봐.', // 용족 명성 낮음 (수군거림·멸시·수치)
    pool: [
      { t: 1, g: { gather: 'volcano', n: 3 }, say: '화산재가 필요해. 쇠를 식힐 때 쓰지.' },
      { t: 1, g: { win: 'volcano_slope', n: 3 }, say: '화염 도마뱀이 풀무를 갉아먹는다.' },
      { t: 2, g: { bring: { obsidian: 2, volcanic_ash: 3 } }, say: '흑요석으로 새 모루를 만들 거다.' },
      { t: 2, g: { win: 'volcano_cave', n: 2 }, say: '용암 골렘의 심장은 최고의 연료지.' },
      { t: 2, g: { count: 'craft', n: 3 }, say: '네 손으로 뭔가 세 개 만들어 와 봐. 실력을 보자.' },
      { t: 3, g: { win: 'volcano_crater', n: 1 }, say: '화염 거인… 한 번 겨뤄 볼 만한 상대다.' },
      { t: 3, g: { elite: 'volcano' }, say: '용암 도롱뇽 군주가 내 화로를 노린다.' },
    ],
    trades: [
      { give: { volcanic_ash: 4 }, get: { obsidian: 1 } },
      { give: { salamander_tail: 3 }, get: { ember_tea: 1 } },
      { give: { magma_core: 1 }, get: { fire_crystal: 1 } },
    ],
    story: {
      title: '꺼지지 않는 화로',
      ch: [
        { intro: '내 화로의 불이 약해졌어. 불도마뱀 꼬리 넷이면 다시 지필 수 있지.',
          g: { bring: { salamander_tail: 4 } }, t: 1,
          done: '화로가 다시 으르렁거렸다. 이그나르가 만족스럽게 콧김을 뿜는다.' },
        { intro: '이제 쇠를 녹일 만큼 뜨거운 불이 필요해. 용암 골렘 셋을 쓰러뜨려 심장의 열기를 가져와.',
          g: { win: 'volcano_cave', n: 3 }, t: 2,
          done: '골렘의 열기를 머금은 화로가 하얗게 달아올랐다.' },
        { intro: '마지막으로 거인의 불씨. 그게 있으면 평생 한 번 만들 수 있는 물건을 만들 수 있다.',
          g: { bring: { giant_ember: 1, obsidian: 2 } }, t: 3, item: 'ignar_heart',
          done: '이그나르가 사흘 밤낮 쇠를 두드려 붉게 빛나는 부적을 만들었다. "이걸 지닌 용은 불 속에서도 꺾이지 않는다."' },
      ],
    },
  },
};
const MOB_BY_REGION = Object.fromEntries(Object.entries(MOBS).map(([id, m]) => [m.region, id]));

// ── 목표 ────────────────────────────────────────────
const josa = (w, a, b) => {
  const c = w.charCodeAt(w.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return b;
  return (c - 0xac00) % 28 ? a : b;
};
const isBring = (g) => !!g.bring;
function goalKey(g) {
  if (g.win) return `huntwin:${g.win}`;
  if (g.winR) return `huntwin:${g.winR}`;
  if (g.elite) return `elite:${g.elite}`;
  if (g.gather) return `gather:${g.gather}`;
  if (g.explore) return `explore:${g.explore}`;
  return g.count;
}
const goalN = (g) => (isBring(g) ? 0 : g.elite ? 1 : g.n || 1);
const COUNT_TEXT = { corrupt: '오염된 땅에서 {n}번 움직이기', expedition: '원정 {n}번 다녀오기', craft: '물건 {n}개 만들기' };
function goalText(g) {
  if (g.bring) return Object.entries(g.bring).map(([id, n]) => `${ITEMS[id].name} ${n}개`).join(', ') + ' 건네기';
  if (g.win) { const p = PLACES[g.win]; return `${p.name}의 ${p.creature} ${g.n}번 쓰러뜨리기 (Lv.${p.level})`; }
  if (g.winR) return `${REGIONS[g.winR].name}에서 사냥 ${g.n}번 이기기`;
  if (g.elite) return `강적 ${ELITES[g.elite]} 쓰러뜨리기`;
  if (g.gather) return `${REGIONS[g.gather].name}에서 채집 ${g.n}번`;
  if (g.explore) return `${REGIONS[g.explore].name}에서 탐사 ${g.n}번`;
  return (COUNT_TEXT[g.count] || `${g.count} {n}번`).replace('{n}', g.n);
}
const countOf = (d, key) => logic.traitsOf(d).counts[key] || 0;

// ── 저장 상태: combat JSON 안의 mob ──
function stateOf(d) {
  const c = logic.combatJson(d);
  if (!c.mob || typeof c.mob !== 'object') c.mob = {};
  const m = c.mob;
  if (!Array.isArray(m.act)) m.act = [];
  // 의뢰 목록이 바뀌어 없어진 의뢰는 맡은 목록에서 뺌 (칸만 차지하고 끝낼 수 없게 되지 않도록)
  if (m.act.some((a) => !MOBS[a.mob]?.pool[a.i])) m.act = m.act.filter((a) => MOBS[a.mob]?.pool[a.i]);
  if (!m.story || typeof m.story !== 'object') m.story = {};
  if (!m.done || typeof m.done !== 'object') m.done = { day: 0, keys: [] };
  if (!m.tr || typeof m.tr !== 'object') m.tr = { day: 0, n: {} };
  return m;
}
function todayDone(m, now) {
  const day = logic.dayIdx(now);
  if (m.done.day !== day) m.done = { day, keys: [] };
  return m.done.keys;
}
// 한 주 (한국 시간 월요일 0시에 바뀜)
const weekIdx = (now = Date.now()) => Math.floor((logic.dayIdx(now) + 3) / 7);
function weekTrades(m, now) {
  if (!m.trw || typeof m.trw !== 'object' || m.trw.week !== weekIdx(now)) m.trw = { week: weekIdx(now), n: {} };
  return m.trw.n;
}
function todayTrades(m, now) {
  const day = logic.dayIdx(now);
  if (m.tr.day !== day) m.tr = { day, n: {} };
  return m.tr.n;
}

// 오늘 이 드래곤이 내미는 의뢰 (날짜로 정해지는 순서)
function offersOf(mobId, now = Date.now()) {
  const pool = MOBS[mobId].pool;
  let seed = logic.dayIdx(now) * 7919 + [...mobId].reduce((a, c) => a * 31 + c.charCodeAt(0), 11);
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const out = [];
  while (out.length < Math.min(MOB_RULES.offers, pool.length)) {
    const i = Math.floor(rnd() * pool.length);
    if (!out.includes(i)) out.push(i);
  }
  return out.sort((a, b) => pool[a].t - pool[b].t || a - b);
}

// 일의 레벨: 사냥은 그 장소, 지역 일은 그 지역에서 가장 쉬운 장소(강적은 +1). 물건·셈 의뢰는 내 레벨과 같게 봄
function goalLevel(d, g) {
  const minLv = (r) => Math.min(...(REGION_PLACES[r] || []).map((p) => PLACES[p].level));
  if (g.win) return PLACES[g.win].level;
  if (g.winR) return minLv(g.winR);
  if (g.elite) return minLv(g.elite) + 1;
  if (g.gather) return minLv(g.gather);
  if (g.explore) return minLv(g.explore);
  return d.level || 1;
}
// 내게 맞춘 보상: { gold, xp, fame, gap(배율) }
function rewardFor(d, tier, g) {
  const r = MOB_RULES.tiers[tier] || MOB_RULES.tiers[1];
  const S = MOB_RULES.scale;
  const gap = Math.max(S.gapMin, Math.min(S.gapMax, 1 + (goalLevel(d, g) - (d.level || 1)) * S.perLv));
  return {
    gold: Math.round(r.gold * gap * (logic.titleMods(d).mobGold || 1)),
    xp: Math.round(r.xp * (S.xpBase + (d.level || 1) * S.xpPerLv) * gap),
    fame: r.fame, gap: Math.round(gap * 100) / 100,
  };
}
// 보상 주기
function payReward(d, tier, g, extra = {}) {
  const r = rewardFor(d, tier, g);
  const gold = r.gold;
  d.gold += gold;
  const xp = logic.xpOf(d, r.xp);
  const up = logic.gainXp(d, xp);
  const fame = Math.max(0, Math.min(r.fame, MOB_RULES.fameCap - (d.fame || 0)));
  const lines = [`금화 ${gold}닢, 경험치 +${xp}${fame > 0 ? `, 용족 명성 +${fame}` : ''}${up ? ' · 레벨이 올랐다!' : ''}`];
  if (fame > 0) { const f = logic.addFame(d, fame); if (f) lines.push(f); }
  else if ((d.fame || 0) >= MOB_RULES.fameCap) lines.push(`(심부름으로 쌓는 명성은 '존중'까지다. 그 위는 결투나 재앙에서 이름을 떨쳐야 한다.)`);
  const items = [];
  if (extra.item) {
    items.push({ id: extra.item, qty: 1 });
    lines.push(`${ITEMS[extra.item].name}${josa(ITEMS[extra.item].name, '을', '를')} 받았다!`);
  }
  return { lines, items, gold };
}

function here(d, mobId) {
  const m = MOBS[mobId];
  if (!m) return { error: '그런 드래곤은 없다.' };
  if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
  if (d.region !== m.region) return { error: `${m.name}${josa(m.name, '은', '는')} ${REGIONS[m.region].name}에 있다.` };
  return null;
}
const lacking = (bring, have) => Object.entries(bring).filter(([id, n]) => have(id) < n);
const takeItems = (bring) => Object.entries(bring).map(([id, n]) => ({ id, qty: -n }));

// ── 하루 의뢰 ───────────────────────────────────────
function accept(d, mobId, i, now = Date.now()) {
  const err = here(d, mobId);
  if (err) return err;
  i = Number(i);
  if (!offersOf(mobId, now).includes(i)) return { error: '그 의뢰는 오늘 내민 것이 아니다.' };
  const q = MOBS[mobId].pool[i];
  if (isBring(q.g)) return { error: '이 의뢰는 물건을 바로 건네면 된다.' };
  const m = stateOf(d);
  const done = todayDone(m, now);
  const key = `${mobId}:${i}`;
  if (done.includes(key)) return { error: '오늘은 이미 이 의뢰를 맡았다.' };
  if (m.act.length >= MOB_RULES.maxActive) return { error: `의뢰는 한 번에 ${MOB_RULES.maxActive}개까지만 맡을 수 있다.` };
  done.push(key);
  m.act.push({ mob: mobId, i, base: countOf(d, goalKey(q.g)), at: now });
  const mb = MOBS[mobId];
  return { title: mb.name, lines: [`"${q.say}"`, `의뢰를 맡았다: ${goalText(q.g)}`, `다 하면 ${mb.name}에게 돌아와 알려 주자.`] };
}
function progressOf(d, a) {
  const q = MOBS[a.mob]?.pool[a.i];
  if (!q) return null;
  const n = goalN(q.g);
  return { have: Math.min(n, countOf(d, goalKey(q.g)) - a.base), n };
}
function turnIn(d, mobId, i, have, now = Date.now()) {
  const err = here(d, mobId);
  if (err) return err;
  i = Number(i);
  const mb = MOBS[mobId];
  const q = mb.pool[i];
  if (!q) return { error: '그런 의뢰는 없다.' };
  const m = stateOf(d);
  const lines = [];
  let items = [];
  if (isBring(q.g)) {
    if (!offersOf(mobId, now).includes(i)) return { error: '그 의뢰는 오늘 내민 것이 아니다.' };
    const done = todayDone(m, now);
    const key = `${mobId}:${i}`;
    if (done.includes(key)) return { error: '오늘은 이미 이 의뢰를 마쳤다.' };
    const lack = lacking(q.g.bring, have);
    if (lack.length) return { error: `${lack.map(([id, n]) => `${ITEMS[id].name} ${n}개`).join(', ')}가 있어야 한다.` };
    done.push(key);
    items = takeItems(q.g.bring);
    lines.push(`${goalText(q.g).replace(/ 건네기$/, '')}를 건넸다.`);
  } else {
    const k = m.act.findIndex((a) => a.mob === mobId && a.i === i);
    if (k < 0) return { error: '맡은 의뢰가 아니다.' };
    const p = progressOf(d, m.act[k]);
    if (p.have < p.n) return { error: `아직 다 하지 못했다. (${p.have}/${p.n})` };
    m.act.splice(k, 1);
    lines.push(`${goalText(q.g)} — 해냈다고 알렸다.`);
  }
  lines.push(`${mb.name}${josa(mb.name, '이', '가')} 고개를 끄덕인다.`);
  const r = payReward(d, q.t, q.g);
  lines.push(...r.lines, ...logic.traitCount(d, 'mobquest'));
  return { title: `${mb.name}의 의뢰`, lines, items: [...items, ...r.items], gold: r.gold };
}
function abandon(d, mobId, i) {
  const m = stateOf(d);
  const k = m.act.findIndex((a) => a.mob === mobId && a.i === Number(i));
  if (k < 0) return { error: '맡은 의뢰가 아니다.' };
  m.act.splice(k, 1);
  return { title: '의뢰', lines: [`${MOBS[mobId].name}의 의뢰를 내려놓았다. 오늘은 다시 맡을 수 없다.`] };
}

// ── 이야기 퀘스트 ───────────────────────────────────
// kind: 'story'(이야기) 또는 'gate'(지하 회랑 입장 부탁). 저장 자리는 story[mobId], story[mobId#gate]
const storyKey = (mobId, kind) => (kind === 'gate' ? `${mobId}#gate` : mobId);
const bookOf = (mb, kind) => (kind === 'gate' ? mb.gate : mb.story);
function storyOf(m, mobId, kind = 'story') {
  const s = m.story[storyKey(mobId, kind)];
  return s && typeof s === 'object' ? s : { ch: 0, base: null };
}
function storyAccept(d, mobId, kind = 'story') {
  const err = here(d, mobId);
  if (err) return err;
  const mb = MOBS[mobId];
  const bk = bookOf(mb, kind);
  if (!bk) return { error: '그런 이야기는 없다.' };
  const m = stateOf(d);
  const s = storyOf(m, mobId, kind);
  const c = bk.ch[s.ch];
  if (!c) return { error: '이 이야기는 이미 끝까지 들었다.' };
  if (s.base != null) return { error: '이미 듣고 있는 이야기다.' };
  m.story[storyKey(mobId, kind)] = { ch: s.ch, base: isBring(c.g) ? 0 : countOf(d, goalKey(c.g)) };
  return { title: `${bk.title} · ${s.ch + 1}장`, lines: [`"${c.intro}"`, `할 일: ${goalText(c.g)}`] };
}
function storyProgress(d, mobId, kind = 'story') {
  const m = stateOf(d);
  const s = storyOf(m, mobId, kind);
  const c = bookOf(MOBS[mobId], kind)?.ch[s.ch];
  if (!c || s.base == null || isBring(c.g)) return null;
  const n = goalN(c.g);
  return { have: Math.min(n, countOf(d, goalKey(c.g)) - s.base), n };
}
function storyTurnIn(d, mobId, have, kind = 'story') {
  const err = here(d, mobId);
  if (err) return err;
  const mb = MOBS[mobId];
  const bk = bookOf(mb, kind);
  if (!bk) return { error: '그런 이야기는 없다.' };
  const m = stateOf(d);
  const s = storyOf(m, mobId, kind);
  const c = bk.ch[s.ch];
  if (!c) return { error: '이 이야기는 이미 끝까지 들었다.' };
  if (s.base == null) return { error: '먼저 이야기를 들어야 한다.' };
  let items = [];
  if (isBring(c.g)) {
    const lack = lacking(c.g.bring, have);
    if (lack.length) return { error: `${lack.map(([id, n]) => `${ITEMS[id].name} ${n}개`).join(', ')}가 있어야 한다.` };
    items = takeItems(c.g.bring);
  } else {
    const p = storyProgress(d, mobId, kind);
    if (p.have < p.n) return { error: `아직 다 하지 못했다. (${p.have}/${p.n})` };
  }
  const last = s.ch === bk.ch.length - 1;
  m.story[storyKey(mobId, kind)] = { ch: s.ch + 1, base: null };
  const r = payReward(d, c.t, c.g, { item: c.item });
  const lines = [c.done, ...r.lines];
  if (last && kind === 'gate') {
    // 입장 자격: combat JSON에 남긴다 (maze.js가 읽음). 이어서 안내 다섯 줄
    logic.combatJson(d)[bk.key || 'corridor'] = true;
    lines.push(...(bk.guide || []).map((t) => `"${t}"`));
    logic.chron(d, 'mark', `${mb.name}에게서 지하 회랑으로 내려가는 길을 들었다.`);
  } else if (last) {
    lines.push(`'${bk.title}' 이야기를 끝까지 들었다.`, ...logic.traitCount(d, 'mobstory'));
    logic.chron(d, 'mark', `${mb.name}의 이야기 '${bk.title}'${josa(bk.title, '을', '를')} 끝까지 함께했다.`);
  }
  return { title: `${bk.title} · ${s.ch + 1}장`, lines, items: [...items, ...r.items], gold: r.gold };
}

// ── 용족 교환소 ─────────────────────────────────────
function trade(d, mobId, i, have, now = Date.now()) {
  const err = here(d, mobId);
  if (err) return err;
  const mb = MOBS[mobId];
  i = Number(i);
  const o = mb.trades[i];
  if (!o) return { error: '그런 교환은 없다.' };
  const m = stateOf(d);
  if (o.needStory && storyOf(m, mobId).ch < mb.story.ch.length) return { error: `${mb.name}의 이야기 '${mb.story.title}'${josa(mb.story.title, '을', '를')} 끝까지 들어야 바꿔 준다.` };
  const used = o.weekly ? weekTrades(m, now) : todayTrades(m, now);
  const key = `${mobId}:${i}`;
  const cap = o.weekly || o.daily || MOB_RULES.tradeDaily;
  if ((used[key] || 0) >= cap) return { error: o.weekly ? '이번 주에는 더 바꿔 줄 수 없다고 한다.' : '오늘은 더 바꿔 줄 수 없다고 한다.' };
  if (o.gold && d.gold < o.gold) return { error: `금화가 모자란다. (${o.gold}닢 필요)` };
  const lack = lacking(o.give || {}, have);
  if (lack.length) return { error: `${lack.map(([id, n]) => `${ITEMS[id].name} ${n}개`).join(', ')}가 있어야 한다.` };
  used[key] = (used[key] || 0) + 1;
  const items = takeItems(o.give || {});
  if (o.gold) d.gold -= o.gold;
  if (o.getGold) d.gold += o.getGold;
  for (const [id, n] of Object.entries(o.get || {})) items.push({ id, qty: n });
  const gave = [...Object.entries(o.give || {}).map(([id, n]) => `${ITEMS[id].name} ${n}개`), ...(o.gold ? [`금화 ${o.gold}닢`] : [])].join(', ');
  const got = [...Object.entries(o.get || {}).map(([id, n]) => `${ITEMS[id].name} ${n}개`), ...(o.getGold ? [`금화 ${o.getGold}닢`] : [])].join(', ');
  return { title: `${mb.name}${josa(mb.name, '과', '와')}의 교환`, lines: [`${gave}${josa(gave, '을', '를')} 내주고 ${got}${josa(got, '을', '를')} 받았다.`], items, gold: (o.getGold || 0) - (o.gold || 0) };
}

// ── 화면에 보낼 정보 ────────────────────────────────
// 용족 명성에 따라 첫인사가 달라짐: 높음(위엄 +2 이상) · 보통 · 낮음(위엄 − 단계)
function greetOf(d, mb) {
  const t = fameTier(d.fame || 0);
  if (t.majesty >= 2 && mb.greetHi) return { text: mb.greetHi, fame: t.name, mood: 'hi' };
  if (t.majesty < 0 && mb.greetLo) return { text: mb.greetLo, fame: t.name, mood: 'lo' };
  return { text: mb.greet, fame: t.name, mood: 'mid' };
}
function activeView(d) {
  const m = stateOf(d);
  const gates = Object.entries(MOBS).filter(([, mb]) => mb.gate).map(([id, mb]) => {
    const s = storyOf(m, id, 'gate'); const c = mb.gate.ch[s.ch];
    if (!c || s.base == null) return null;
    const p = isBring(c.g) ? null : storyProgress(d, id, 'gate');
    return { mob: id, i: -1, gate: true, name: mb.name, region: mb.region, regionName: REGIONS[mb.region].name, text: `${mb.gate.title} · ${goalText(c.g)}`, have: p?.have ?? 0, n: p?.n ?? 0, ready: !!p && p.have >= p.n };
  }).filter(Boolean);
  return [...gates, ...m.act.map((a) => {
    const mb = MOBS[a.mob];
    const q = mb?.pool[a.i];
    if (!q) return null;
    const p = progressOf(d, a);
    return { mob: a.mob, i: a.i, name: mb.name, region: mb.region, regionName: REGIONS[mb.region].name, text: goalText(q.g), have: p.have, n: p.n, ready: p.have >= p.n };
  }).filter(Boolean)];
}
// 내 정보에 붙는 요약 (어디서든 보임)
function summary(d) {
  const act = activeView(d);
  return { act, max: MOB_RULES.maxActive };
}
// 그 드래곤 앞에서 보는 화면
function view(d, mobId, have, now = Date.now()) {
  const mb = MOBS[mobId];
  if (!mb) return null;
  const m = stateOf(d);
  const done = todayDone(m, now);
  // 오늘 내미는 의뢰 + 예전에 이 드래곤에게서 맡아 아직 끝내지 않은 의뢰 (날이 바뀌어 오늘 목록에 없어도 끝낼 수 있게)
  const today = offersOf(mobId, now);
  const carried = m.act.filter((a) => a.mob === mobId && !today.includes(a.i)).map((a) => a.i);
  const offers = [...today, ...carried].map((i) => {
    const q = mb.pool[i];
    const bring = isBring(q.g);
    const act = m.act.find((a) => a.mob === mobId && a.i === i);
    const p = act ? progressOf(d, act) : null;
    return {
      i, t: q.t, say: q.say, text: goalText(q.g), bring, reward: rewardFor(d, q.t, q.g),
      needs: bring ? Object.entries(q.g.bring).map(([id, n]) => ({ id, n, have: have(id) })) : null,
      state: act ? (p.have >= p.n ? 'ready' : 'doing') : done.includes(`${mobId}:${i}`) ? 'done' : 'open',
      have: p?.have, n: p?.n,
      carried: carried.includes(i), // 지난날 맡은 의뢰
    };
  });
  const s = storyOf(m, mobId);
  const c = mb.story.ch[s.ch];
  const story = {
    title: mb.story.title, total: mb.story.ch.length, ch: s.ch,
    past: mb.story.ch.slice(0, s.ch).map((x) => x.done),
    cur: c ? {
      intro: c.intro, text: goalText(c.g), accepted: s.base != null, bring: isBring(c.g), reward: rewardFor(d, c.t, c.g),
      item: c.item ? { id: c.item, name: ITEMS[c.item].name } : null,
      needs: isBring(c.g) ? Object.entries(c.g.bring).map(([id, n]) => ({ id, n, have: have(id) })) : null,
      prog: storyProgress(d, mobId),
    } : null,
  };
  // 지하 회랑 입장 부탁 (있는 드래곤만)
  let gate = null;
  if (mb.gate) {
    const gs = storyOf(m, mobId, 'gate');
    const gc = mb.gate.ch[gs.ch];
    gate = {
      title: mb.gate.title, total: mb.gate.ch.length, ch: gs.ch, done: !gc,
      past: mb.gate.ch.slice(0, gs.ch).map((x) => x.done),
      cur: gc ? {
        intro: gc.intro, text: goalText(gc.g), accepted: gs.base != null, bring: isBring(gc.g), reward: rewardFor(d, gc.t, gc.g), item: null,
        needs: isBring(gc.g) ? Object.entries(gc.g.bring).map(([id, n]) => ({ id, n, have: have(id) })) : null,
        prog: storyProgress(d, mobId, 'gate'),
      } : null,
    };
  }
  const used = todayTrades(m, now);
  const usedW = weekTrades(m, now);
  const trades = mb.trades.map((o, i) => ({
    i, give: Object.entries(o.give || {}).map(([id, n]) => ({ id, n, have: have(id) })), gold: o.gold || 0,
    get: Object.entries(o.get || {}).map(([id, n]) => ({ id, n })), getGold: o.getGold || 0,
    weekly: !!o.weekly,
    left: o.weekly ? o.weekly - (usedW[`${mobId}:${i}`] || 0) : (o.daily || MOB_RULES.tradeDaily) - (used[`${mobId}:${i}`] || 0),
    locked: o.needStory && storyOf(m, mobId).ch < mb.story.ch.length ? `'${mb.story.title}' 이야기를 끝까지 들으면 열린다` : null,
  }));
  return {
    id: mobId, name: mb.name, kind: mb.kind, who: mb.who, desc: mb.desc,
    greet: gate?.done && mb.gate.greetIn ? mb.gate.greetIn : greetOf(d, mb).text, fame: greetOf(d, mb).fame, mood: greetOf(d, mb).mood, region: mb.region,
    offers, story, gate, trades, act: activeView(d), max: MOB_RULES.maxActive,
    resetAt: (logic.dayIdx(now) + 1) * 86400000 - 9 * 3600000,
  };
}
// 지도·지역 카드에 쓰는 목록
const listForClient = () => Object.fromEntries(Object.entries(MOBS).map(([id, m]) => [m.region, { id, name: m.name, kind: m.kind, who: m.who }]));

module.exports = {
  MOBS, MOB_RULES, MOB_BY_REGION, goalKey, goalText, offersOf, rewardFor,
  accept, turnIn, abandon, storyAccept, storyTurnIn, trade, view, summary, listForClient,
};
