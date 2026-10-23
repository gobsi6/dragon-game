// 이벤트 목록
// 새 이벤트를 넣거나 확률·조건을 바꿀 때는 이 파일만 고치면 됩니다.
//
// 이벤트 하나의 모양
//   id       고유 이름
//   title    선택 창 제목
//   when     일어나는 때: explore(탐사) gather(채집) hunt(사냥을 마침) expedition(원정 귀환) wake(둥지에서 깨어남) intimidate(위협 성공)
//   weight   뽑힐 무게. 숫자 또는 (c) => 숫자
//   cond     (c) => 참이면 일어날 수 있음
//   setup    (c) => 이벤트 동안 고정할 값 (알의 종류 등). 선택할 때 vars로 다시 들어옴
//   text     (c, vars) => 보여 줄 문장 목록
//   choices  [{ label, show?(c, vars), need?(c, vars) → 못 고르는 이유, run(h, c, vars) }]
//
// c (상황): d(드래곤) region town(인간 마을인지) rep(이 마을 평판) fame stance nest have(id)(가진 개수) perks(식구 재주)
//           home(함께 사는 식구) humans drakes(깨어난 새끼) eggs grown(알 뺀 식구) full(식구가 가득 찼는지, 최대 2)
//           k(id)(이벤트가 고른 식구, 떠났으면 null) age(식구)(나이, 일) stage(식구)(성장 단계 이름)
//           canTravel(식구)(원정에 따라갈 나이인지) pick(목록)
//           weather(지금 날씨 id) season(계절 id) level place(장소 id) hoard(보물더미 [{item, qty}]) hoardValue
//           bossTrace(하루 안에 재앙이 쓰러지거나 떠난 지역이면 { name, won }) me(내 이름) call(아이가 나를 부르는 말)
//   식구를 다루는 이벤트는 setup에서 대상 id를 골라 두고, text·run에서 c.k(v.id)로 꺼냅니다.
//   그 사이 식구가 떠나 버리면 이벤트는 조용히 지나갑니다.
// h (결과 만들기): say(문장) gold(n) give(id, n) take(id, n) rep(지역, n) fame(n) hp(n) en(n) keep(보물 상자 종류, 준 이, 글)
//           adopt(유래) egg(종류) bond(식구, n) lean(식구, 재주, n) train(새끼, 능력치) leave(식구, 상태)
//           nudge(새끼, 성향, 일)(성격을 그 성향 쪽으로)
//           nearestTown() name(식구 → '미르가') josa(말, 받침, 없음)
//           mind(n) buff(강화 id, 분) notify(드래곤 id, 글, 제목) hoardTake(id, n)(보물더미에서, 있는 만큼만) hoardGive(id, n)

const { ITEMS, KINDS, REGIONS, PLACES, REGION_LOOT, KIN, KIN_GROW, KIN_PLAY, STATS, HUMAN_NAMES, DRAKE_NAMES, PLAY_KINDS } = require('./game-data');

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// '옛 둥지를 그리워하는 아이': 입양 온 아이가 한 번 그리워한 뒤 다시 그리워하기까지의 간격
const MISS_GAP = 3 * 24 * 3600 * 1000; // 3일
// 짝·자녀·자손 이벤트
const DAYMS = 24 * 3600 * 1000;
const PARTNER_NAMES = ['리라', '한별', '에린', '도윤', '마루', '시아', '라온', '이든', '서하', '노을'];
const adultHuman = (c, x) => ['어른', '노년'].includes(c.stage(x));
const grownDrake = (c, x) => ['젊은 용', '다 자란 용'].includes(c.stage(x));
const canMate = (c, x) => !x.data.mate && c.now - (x.data.mateNo || 0) >= 3 * DAYMS; // 거절하면 3일 뒤에 다시
// 다른 둥지 첫사랑의 지금 모습 (kinlove.js). 없으면 null
const loveOf = (c, x) => { const kl = require('./game-logic').hooks.kinLove; return kl && (x.data.loveRef || kl.refOf(x, c.d.id)) ? kl.status(c.d.id, x) : null; };
// 서로의 첫사랑이 아직 어른이 되지 않았거나 혼인 청을 기다리는 중이면: 다른 사람과 짝을 맺지 않고 기다림
// 첫사랑의 끝 (실연): 혼인 청을 사양당했거나, 짝사랑이 끝났을 때 (상대가 다른 사람과 맺어짐 · 다른 사람을 좋아함 · 떠남). 아이마다 한 번
// 실연을 겪은 뒤: 다시 뜨지 않게 하고, 그 첫사랑은 끝난 것으로 (새로 만난 사람과 짝을 맺을 수 있음)
const heartEnd = (k, c) => { k.data.heartDone = c.now; k.data.heartbreak = null; if (k.data.loveRef) k.data.loveRef.ended = c.now; k.data.mateNo = Math.max(k.data.mateNo || 0, c.now - 2 * DAYMS); };
const heartDiary = (h, k, t) => { if (h.diary) h.diary(k, t); };
const heartOf = (c, x) => {
  if (x.type !== 'human' || x.data.heartDone || !['청소년', '어른', '노년'].includes(c.stage(x))) return null;
  if (x.data.heartbreak) return x.data.heartbreak;
  const s = loveOf(c, x);
  if (!s || s.mateUs) return null;
  if (s.gone) return { why: 'gone', name: s.name, home: s.ownerName };
  if (!s.free) return { why: 'mated', name: s.name, home: s.ownerName };
  if (!s.mutual && s.otherLove === 'else') return { why: 'else', name: s.name, home: s.ownerName };
  return null;
};
// 다른 둥지 아이와 맺어진 짝이면 그 둥지에도 아이 소식
const babyTell = (h, c, k, baby, found = false) => {
  const r = k.data.mate?.ref; if (!r) return;
  const m = k.data.mate.name;
  h.notify(r.owner, found
    ? `${c.me}의 둥지 ${k.name}${c.josa(k.name, '과', '와')} 당신의 둥지 ${m}${c.josa(m, '이', '가')} 길 잃은 아이를 함께 데려왔다. 이름은 ${baby}. 아이는 ${c.me}의 둥지에서 자란다.`
    : `${c.me}의 둥지에서 ${k.name}${c.josa(k.name, '과', '와')} 당신의 둥지 ${m} 사이에 아이가 태어났다. 이름은 ${baby}. 아이는 ${c.me}의 둥지에서 자란다.`, '둥지 소식');
  const kl = require('./game-logic').hooks.kinLove;
  if (kl) kl.babyShared(r, baby, c.now, found ? `짝 ${k.name}${c.josa(k.name, '과', '와')} 함께 길 잃은 아이 ${baby}${c.josa(baby, '을', '를')} 데려왔다. 아이는 짝의 둥지에서 자란다.` : null);
}; // 짝 쪽 기록에도 자녀를 남겨 두 둥지에서 겹쳐 생기지 않게
const loveWaits = (c, x) => { const s = loveOf(c, x); return !!s && !s.gone && s.mutual && s.free && (!s.adult || s.pending); };
// 다른 둥지 아이와 맺어진 짝: 성별이 같으면 아이 이벤트 없음, 아이 수·마지막 아이는 두 둥지가 함께 셈 (kinlove.js)
const sameSexMate = (x) => !!x.data.mate?.ref && (!x.data.mate.sex || x.data.mate.sex === x.data.sex);
const kidsRoom = (c, x) => x.data.mate && c.stage(x) === '어른' && (x.data.kids || []).length < 3
  && c.now - x.data.mate.at >= 2 * DAYMS && c.now - (x.data.lastBaby || 0) >= 3 * DAYMS;
// 성별이 같은 짝: 아이가 태어나는 대신 길 잃은 아이를 함께 데려옴 (kin_foundling)
const wantsFoundling = (c, x) => sameSexMate(x) && kidsRoom(c, x);
const wantsBaby = (c, x) => x.data.mate && c.stage(x) === '어른' && (x.data.kids || []).length < 3 && !sameSexMate(x)
  && c.now - x.data.mate.at >= 2 * DAYMS && c.now - (x.data.lastBaby || 0) >= 3 * DAYMS;
const bringsEgg = (c, x) => x.data.mate && !x.data.eggBrought
  && (x.status === 'independent' ? c.now - (x.data.ended || 0) >= 2 * DAYMS : c.stage(x) === '다 자란 용' && c.now - x.data.mate.at >= 3 * DAYMS);
const awaitsFarewell = (c, x) => !x.data.farewell && c.now - (x.data.ended || 0) >= DAYMS && (x.data.mate || (x.data.kids || []).length);
const parentWord = (k) => (k.data.sex === 'f' ? '어머니' : '아버지');
const elderWord = (k) => (k.data.sex === 'f' ? '할머니' : '할아버지');
const freshKid = (k) => { const used = new Set([k.name, ...(k.data.kids || [])]); return pick(HUMAN_NAMES.filter((n) => !used.has(n))) || pick(HUMAN_NAMES); };

const missable = (c, x) => !!(x.data.adoptedFrom && x.data.adoptedFromId) && c.now - (x.data.missedAt || 0) >= MISS_GAP;
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const statName = (k) => STATS.find((x) => x.key === k)?.name || k;
const bestStat = (kind) => Object.entries(KINDS[kind].stats).sort((a, b) => b[1] - a[1])[0][0]; // 그 종류가 가장 강한 능력치
const D3 = 3 * 864e5;
const hasTrait = (k, id) => !!k.data.traits && k.data.traits.includes(id);
const GIFT_STAGES = ['아이', '소년', '청소년', '해츨링', '어린 용', '젊은 용'];
const giftKids = (c) => [...c.humans, ...c.drakes].filter((x) => GIFT_STAGES.includes(c.stage(x)) && (x.data.bond || 0) >= 40 && c.now - (x.data.giftAt || 0) >= 2 * 864e5);
// ── 아이의 선물: 무엇을 줄지 ──
// 나이 단계마다 기본 목록 + 성격에 따라 더해지는 목록. 성격 목록은 두 번 넣어 더 자주 나오게 함
// first_scale(첫 비늘)은 식구마다 한 번만 (k.data.gifts에 기록, 예전에 받은 것은 보물 상자에서 이름으로 확인)
const GIFT_POOL = {
  '해츨링': ['shiny_pebble', 'bird_feather', 'conch_shell', 'acorns', 'pinecone', 'old_coin'],
  // 어린 용부터는 폴리모프로 사람 모습이 되어 말하고 손을 쓰므로, 손으로 만든 선물도 줌
  '어린 용': ['first_scale', 'shiny_pebble', 'bird_feather', 'conch_shell', 'warm_stone', 'acorns', 'old_coin', 'kid_drawing', 'woven_band', 'paper_bird'],
  '젊은 용': ['first_scale', 'warm_stone', 'storm_stone', 'hunt_fang', 'bird_feather', 'old_coin', 'sky_sketch', 'kid_letter', 'wood_flute'],
  '아이': ['kid_drawing', 'flower_ring', 'clover', 'clay_dragon', 'wish_note', 'paper_bird'],
  '소년': ['kid_letter', 'kid_drawing', 'pebble_neck', 'clay_dragon', 'woven_band', 'clover', 'paper_bird', 'paper_kite'],
  '청소년': ['kid_letter', 'wood_dragon', 'wood_flute', 'knit_scarf', 'star_map', 'portrait', 'herb_sachet'],
};
const GIFT_TRAIT = {
  // 새끼 드래곤 성격
  drake: { hunter: ['hunt_fang'], dreamy: ['dream_journal', 'sky_sketch'], curious: ['storm_stone', 'conch_shell', 'old_coin'], clingy: ['warm_stone', 'kid_drawing'],
    swift: ['sky_sketch', 'bird_feather'], diligent: ['acorns', 'pinecone'], stubborn: ['old_coin'], clever: ['paper_bird'],
    proud: ['old_coin', 'shiny_pebble'], bold: ['hunt_fang'], sharpnose: ['acorns', 'pinecone'], sleepyhead: ['warm_stone'], foodie: ['hunt_fang'],
    fierce: ['hunt_fang'], windrider: ['bird_feather', 'sky_sketch'], stargazer: ['star_map'], pathfinder: ['storm_stone', 'old_coin'], affable: ['warm_stone', 'kid_drawing'] }, // 자라며 생긴 성격도
  // 인간 아이 성격
  human: { flowers: ['pressed_flower', 'flower_ring', 'clover'], handy: ['wood_dragon', 'pebble_neck', 'clay_dragon', 'wood_flute'], curious: ['star_map', 'conch_shell'],
    gentle: ['kid_letter', 'woven_band'], lonely: ['kid_letter', 'wish_note'], brave: ['wood_sword', 'paper_kite'], prankster: ['wish_note', 'shiny_pebble'],
    steady: ['portrait'], shy: ['paper_bird'], sleepy: ['herb_sachet'],
    chatterbox: ['kid_letter', 'wish_note'], songbird: ['wood_flute'], tidy: ['woven_band', 'pebble_neck'], bookworm: ['star_map', 'kid_letter'], waterbaby: ['conch_shell', 'shiny_pebble'],
    lookout: ['paper_kite', 'bird_feather'], picky: ['herb_sachet'], crybaby: ['kid_drawing', 'wish_note'],
    homebody: ['herb_sachet', 'woven_band'], adventurer: ['conch_shell', 'bird_feather'], warm: ['kid_letter', 'woven_band'], capable: ['wood_dragon', 'pebble_neck'], opened: ['paper_bird', 'pressed_flower'] }, // 자라며 생긴 성격도
};
const GIFT_ONCE = ['first_scale']; // 식구마다 한 번만
const GIFT_HATCH = ['shiny_pebble', 'bird_feather', 'conch_shell', 'acorns', 'pinecone', 'old_coin']; // 해츨링은 아직 폴리모프를 못 하니, 입에 물어 올 수 있는 것만
const giftedBefore = (c, k, kind) => (k.data.gifts || []).includes(kind) || (c.chest || []).some((e) => e.k === kind && e.n === k.name);
function pickGift(c, k, st) {
  let pool = [...(GIFT_POOL[st] || GIFT_POOL[k.type === 'drake' ? '어린 용' : '소년'])];
  const TR = GIFT_TRAIT[k.type === 'drake' ? 'drake' : 'human'];
  for (const t of k.data.traits || []) for (const g of TR[t] || []) pool.push(g, g);
  pool = pool.filter((g) => !(GIFT_ONCE.includes(g) && giftedBefore(c, k, g)) && !(st === '해츨링' && !GIFT_HATCH.includes(g)));
  return c.pick(pool.length ? pool : [k.type === 'drake' ? 'shiny_pebble' : 'kid_drawing']);
}
const ready = (t, ms) => !t || Date.now() - t > ms; // 다시 일어나기까지의 간격

module.exports = [
  // ── 아이의 선물: 정이 든 식구가 선물을 들고 옴 → 보물 상자에 (성격·나이에 따라 선물이 다름) ──
  {
    id: 'kid_gift',
    title: '작은 선물',
    when: ['wake'],
    weight: (c) => 6 * (giftKids(c).some((x) => x.data.traits?.includes('warm')) ? KIN_GROW.warmGift : 1), // 정 많은 아이가 있으면 더 자주
    cond: (c) => !!c.nest && giftKids(c).length > 0,
    setup: (c) => {
      const k = c.pick(giftKids(c));
      const st = c.stage(k);
      const call = c.callOf(k);
      const ga = (w) => `${w}${c.josa(w, '이', '가')}`;
      const kind = pickGift(c, k, st);
      const hatch = k.type === 'drake' && st === '해츨링'; // 해츨링은 아직 말을 못 하고 용의 모습 그대로 (어린 용부터 폴리모프)
      // 상자에 함께 남길 글 (편지는 나이에 따라)
      const LETTER = {
        '아이': `${call}에게. 사랑해요. ${ga(call)} 세상에서 제일 커요. 나도 크면 ${call}처럼 하늘을 날 거예요.`,
        '소년': `${call}, 오늘도 고마워요. 사냥 나갈 때마다 조금 걱정했는데, 무사히 돌아와 줘서 좋아요. 다음엔 나도 데려가 줘요.`,
        '청소년': `${call}. 어릴 땐 몰랐는데, 둥지가 얼마나 따뜻한 곳인지 이제 알 것 같아요. 키워 줘서 고마워요. 이건 쑥스러우니까 나중에 읽어요.`,
      };
      const NOTE = {
        kid_letter: LETTER[st] || LETTER[{ '어린 용': '소년', '젊은 용': '청소년' }[st]] || LETTER['소년'],
        kid_drawing: `${call}${c.josa(call, '이랑', '랑')} 나랑 같이 하늘을 나는 그림. 구름 위에 '${call}'${c.josa(call, '이라고', '라고')} 커다랗게 적혀 있다.`,
        pressed_flower: '책장 사이에 며칠이나 눌러 둔 거예요. 제일 예쁜 걸로 골랐어요.',
        flower_ring: '발톱엔 안 들어가니까… 그냥 갖고만 있어요!',
        wood_dragon: `${call}${c.josa(call, '을', '를')} 깎았어요. 꼬리가 좀 짧은 건 나무가 모자라서예요.`,
        pebble_neck: '강가에서 구멍 난 돌만 골라 꿰었어요. 하나도 똑같은 게 없어요.',
        first_scale: '처음으로 빠진 비늘이에요. 제일 먼저 보여 주고 싶었어요.',
        shiny_pebble: hatch ? '' : '제일 반짝이는 걸로 골랐어요. 보물이니까 잘 간직해요.',
        clover: '한참 찾았어요. 이거 있으면 행운이 온대요. 다 가져요.',
        clay_dragon: `${call}${c.josa(call, '을', '를')} 만들었어요. 날개가 짝짝이인 건… 일부러 그런 거예요.`,
        wish_note: `${call}${c.josa(call, '이', '가')} 다치지 않게 해 주세요. 그리고 나도 언젠가 하늘을 날게 해 주세요.`,
        woven_band: '실을 세 가지 색으로 골랐어요. 하나는 내 거, 하나는 둥지, 하나는 하늘이에요.',
        wood_sword: `이걸로 ${call}${c.josa(call, '을', '를')} 지킬 거예요. 지금은 나무지만 나중엔 진짜로요.`,
        wood_flute: '처음 불었을 때 새들이 대답했어요. 같이 불어요.',
        knit_scarf: `겨울에 ${call} 목이 추워 보여서요. 조금 짧은 건… 실이 모자랐어요.`,
        star_map: `밤마다 올려다본 별을 이어 그린 그림. 한가운데 가장 밝은 별 옆에 '${call}'${c.josa(call, '이라고', '라고')} 적혀 있다.`,
        bird_feather: hatch ? '' : '하늘 높이 날다가 주웠어요. 이렇게 예쁜 색은 처음 봐요.',
        conch_shell: hatch ? '' : '바닷가까지 날아갔다 왔어요. 귀에 대 보면 파도 소리가 나요.',
        warm_stone: '한낮 내내 햇볕에 굴려 놨어요. 밤에 품고 자면 따뜻해요.',
        storm_stone: '천둥 치던 날 혼자 날아가서 주워 왔어요. 이제 폭풍 같은 건 하나도 안 무서워요.',
        hunt_fang: '혼자서 잡았어요. 이제 저도 사냥할 수 있어요.',
        dream_journal: `꿈에서 본 걸 잊어버리기 전에 적어 뒀어요. ${call}도 자주 나와요.`,
        paper_bird: `접는 법 배웠어요. 날개를 당기면 날갯짓해요. ${call}처럼!`,
        paper_kite: `${call}처럼 높이 날라고 만들었어요. 바람 부는 날 같이 날려요.`,
        portrait: `숯으로 그린 ${call}의 얼굴. 날개를 편 모습이 실제보다 조금 더 늠름하게 그려져 있다.`,
        herb_sachet: '잠이 안 올 때 머리맡에 두면 좋대요. 약초는 제가 직접 골라서 말렸어요.',
        acorns: hatch ? '' : '겨울에 배고프면 먹어요. 제일 반질반질한 것만 모았어요.',
        pinecone: hatch ? '' : '숲에서 제일 큰 걸로 골랐어요. 냄새 맡아 봐요.',
        old_coin: hatch ? '' : '땅속에서 반짝이길래 파냈어요. 보물더미에 넣어도 돼요!',
        sky_sketch: '높이 날아 내려다본 둥지와 그 둘레를 그린 그림. 둥지 한가운데 작은 글씨로 "우리 집"이라고 적혀 있다.',
      };
      return { id: k.id, kind, note: NOTE[kind] || '', hatch, human: k.type === 'human' };
    },
    text: (c, v) => {
      const k = c.k(v.id);
      const nm = `${k.name}${c.josa(k.name, '이', '가')}`;
      const T = {
        kid_letter: [`눈을 뜨니 ${nm} 접은 종이 한 장을 등 뒤에 숨긴 채 서 있다.`, `"이거… 읽어 봐요." 꾹꾹 눌러 쓴 편지다.`],
        kid_drawing: [`눈을 뜨니 ${nm} 그림 한 장을 들고 기다리고 있었다.`, `"내가 그렸어요! 이게 ${c.callOf(k)}고, 이게 나예요!"`],
        pressed_flower: [`${nm} 두 손을 오므린 채 다가왔다.`, `손바닥 위에는 곱게 눌러 말린 꽃 한 송이가 놓여 있다.`],
        flower_ring: [`${nm} 풀줄기로 엮은 작은 반지를 내밀었다.`, `"선물이에요!" 반지는 발톱 끝에도 들어가지 않을 만큼 작다.`],
        wood_dragon: [`${nm} 나뭇조각으로 깎은 작은 인형을 내밀었다.`, `날개를 편 용이다. 며칠 동안 몰래 깎았다고 한다.`],
        pebble_neck: [`${nm} 조약돌 목걸이를 들고 쭈뼛거린다.`, `구멍 난 조약돌을 실에 하나하나 꿴 것이다.`],
        first_scale: [`${nm} 사람 모습으로 쭈뼛거리며 다가왔다.`, `내민 손바닥 위에 손톱만 한 비늘 한 조각. 처음으로 빠진 비늘이다.`],
        shiny_pebble: v.hatch ? [`${nm} 반짝이는 조약돌 하나를 물어 와 발치에 내려놓았다.`, `꼬리를 흔들며 올려다본다. 아무래도 보물이라는 모양이다.`]
          : [`${nm} ${v.human ? '' : '사람 모습으로 '}둥지 어귀에 서서 꼭 쥔 주먹을 내밀었다.`, `손을 펴자 반짝이는 조약돌 하나가 놓여 있다.`],
        clover: [`${nm} 풀물이 든 손을 등 뒤로 감춘 채 다가왔다.`, `내민 손바닥 위에 네잎클로버 한 줄기가 놓여 있다.`],
        clay_dragon: [`${nm} 진흙 묻은 손으로 작은 인형을 내밀었다.`, `흙으로 빚어 말린 용이다. 날개 한쪽이 조금 더 크다.`],
        wish_note: [`${nm} 작게 접은 쪽지를 내밀고는 얼굴이 빨개졌다.`, `"소원 적은 거예요. 지금 펴 보면 안 돼요!"`],
        woven_band: [`${nm} 실로 땋은 팔찌를 들고 왔다.`, `"발목에라도 감아요!" 팔찌는 발톱 하나에 겨우 걸린다.`],
        wood_sword: [`${nm} 나무 검을 허리에 차고 씩씩하게 걸어왔다.`, `"이건 ${c.callOf(k)} 거예요. 내 건 또 깎으면 돼요." 손잡이에 이름이 새겨져 있다.`],
        wood_flute: [`어디선가 서툰 피리 소리가 들려왔다. ${nm} 나무 피리를 들고 서 있다.`, `"직접 만들었어요. 가져요." 피리는 아직 따뜻하다.`],
        knit_scarf: [`${nm} 둘둘 만 털실 뭉치 같은 것을 안고 왔다.`, `펼쳐 보니 목도리다. 겨울 내내 몰래 떴다고 한다.`],
        star_map: [`${nm} 둘둘 만 종이를 조심스럽게 펼쳐 보였다.`, `밤하늘의 별을 하나하나 이어 그린 그림이다.`],
        bird_feather: v.hatch ? [`${nm} 커다란 깃털을 입에 물고 자랑스럽게 걸어왔다.`, `빛을 받을 때마다 색이 바뀌는 깃털이다.`]
          : [`${nm} 사람 모습을 하고, 머리에 깃털 하나를 꽂은 채 나타났다.`, `"하나는 내 거, 이건 ${c.callOf(k)} 거." 빛을 받을 때마다 색이 바뀌는 깃털이다.`],
        conch_shell: v.hatch ? [`${nm} 바닷바람 냄새를 풍기며 돌아왔다.`, `발치에 작은 소라 껍데기 하나를 굴려 놓았다.`]
          : [v.human ? `${nm} 모래 묻은 발로 뛰어 들어왔다.` : `바닷바람 냄새와 함께 둥지에 내려앉은 ${k.name}${c.josa(k.name, '이', '가')} 사람 모습으로 바뀌어 다가왔다.`, `두 손에 작은 소라 껍데기 하나를 받쳐 들고 있다.`],
        warm_stone: [`${nm} 사람 모습으로 두 손을 모은 채 종종걸음으로 다가왔다.`, `건네받은 둥근 돌이 따뜻하다. 한낮 내내 햇볕에 데운 모양이다.`],
        storm_stone: [`${nm} 비에 흠뻑 젖은 채 날아 돌아오더니, 사람 모습으로 바뀌어 손을 내밀었다.`, `손바닥 위에 나뭇가지 무늬가 타 들어간 돌 하나. 벼락이 떨어진 자리에서 주워 왔다고 한다.`],
        hunt_fang: [`${nm} 의기양양하게 날아 돌아와 사람 모습으로 내려섰다.`, `내민 손에 짐승의 송곳니 하나. 혼자 사냥해서 얻은 것이라고 한다.`],
        paper_bird: [`${nm} ${v.human ? '' : '사람 모습으로 '}손바닥에 무언가를 올려놓고 조심조심 걸어왔다.`, `종이로 접은 작은 새다. 날개 끝을 당기니 파닥파닥 움직인다.`],
        paper_kite: [`${nm} 자기 키만 한 연을 끌고 둥지로 올라왔다.`, `나뭇살에 종이를 붙인 연이다. 한가운데 서툴게 그린 용 한 마리가 있다.`],
        portrait: [`${nm} 둘둘 만 종이를 등 뒤에 숨긴 채 헛기침을 했다.`, `펼쳐 보니 숯으로 그린 초상화다. 그려진 것은 다름 아닌 ${c.callOf(k)}${c.josa(c.callOf(k), '이다', '다')}.`],
        herb_sachet: [`${nm} 작은 천 주머니를 내밀었다. 은은한 풀 냄새가 퍼진다.`, `안에는 직접 말린 약초가 가득 들어 있다.`],
        acorns: v.hatch ? [`${nm} 볼이 불룩해진 채 뒤뚱뒤뚱 다가왔다.`, `발치에 도토리를 하나, 둘, 셋… 우르르 쏟아 놓았다.`]
          : [`${nm} 사람 모습으로 두 손 가득 무언가를 받쳐 들고 왔다.`, `반질반질한 도토리 한 줌이다.`],
        pinecone: v.hatch ? [`${nm} 커다란 솔방울을 앞발로 굴리며 다가왔다.`, `솔방울을 발치까지 밀어 놓고는 뿌듯하게 앉았다.`]
          : [`${nm} 사람 모습으로 커다란 솔방울을 품에 안고 왔다.`, `송진 냄새가 나는, 꼭지까지 온전한 솔방울이다.`],
        old_coin: v.hatch ? [`${nm} 흙투성이 주둥이로 무언가를 물고 왔다.`, `내려놓은 것은 녹슨 동전 하나. 벌써 보물을 알아보는 모양이다.`]
          : [`${nm} 흙 묻은 손으로 동전 하나를 내밀었다.`, `어느 옛 왕국의 것인지 모를 녹슨 동전이다. "보물이에요!"`],
        sky_sketch: [`${nm} 바람에 헝클어진 머리를 한 사람 모습으로 종이 한 장을 내밀었다.`, `"제일 높이 날아서 내려다본 거예요." 둥지와 그 둘레가 지도처럼 그려져 있다.`],
        dream_journal: [`${nm} 사람 모습으로 낡은 공책 한 권을 품에 안고 왔다.`, `"꿈 일기예요. 부끄러우니까 나중에 읽어요." 밤마다 꾼 꿈이 빼곡히 적혀 있다.`],
      };
      return T[v.kind] || [`${nm} 작은 선물을 들고 왔다.`];
    },
    choices: [
      { label: '보물 상자에 소중히 넣는다', run: (h, c, v) => {
        const k = c.k(v.id); k.data.giftAt = c.now; k.data.gifts = [...new Set([...(k.data.gifts || []), v.kind])]; // 준 선물 기록 (첫 비늘은 한 번만)
        h.keep(v.kind, k.name, v.note); h.bond(k, 3); h.mind(6);
        h.say(`보물 상자를 열어 가장 안쪽에 넣고 잠갔다. ${h.name(k)} 그 모습을 보고 배시시 웃었다. (유대 +3, 정신 +6)`);
      } },
      { label: '꼭 안아 주고 상자에 넣는다', run: (h, c, v) => {
        const k = c.k(v.id); k.data.giftAt = c.now; k.data.gifts = [...new Set([...(k.data.gifts || []), v.kind])]; // 준 선물 기록 (첫 비늘은 한 번만)
        h.keep(v.kind, k.name, v.note); h.bond(k, 6); h.mind(3);
        h.say(`날개로 ${k.name}${h.josa(k.name, '을', '를')} 감싸 안았다. 선물은 보물 상자 가장 안쪽에 넣고 잠갔다. (유대 +6, 정신 +3)`);
      } },
    ],
  },
  // ── 아이를 만나는 길: 성향마다 다름 ──
  {
    id: 'abandoned_baby',
    title: '성문 곁의 바구니',
    when: ['explore'],
    weight: 3,
    cond: (c) => c.stance === 'friendly' && c.town && c.rep >= 20 && c.nest && !c.full,
    // 마을이라 사람 모습으로 성문을 지나던 참 (c.human)
    text: () => [
      '성문을 지나던 참에, 그늘에 놓인 작은 바구니가 눈에 들어왔다.',
      '안에서 강보에 싸인 아기가 낯선 나그네를 올려다보며 방긋 웃는다.',
      '지나가던 아낙이 "부디 그 아이를…" 하고 말끝을 흐린다.',
    ],
    choices: [
      { label: '둥지로 데려가 기른다', run: (h, c) => {
        h.adopt('abandoned'); h.rep(c.region, 5);
        h.say('바구니를 품에 안고 성문 밖으로 나섰다. 사람들의 눈길이 닿지 않는 언덕에서 본래 모습으로 돌아가 날아올랐다. 아낙이 멀리서 고개 숙여 배웅한다.');
      } },
      { label: '고아원에 맡기고 금화를 보탠다 (금화 20)', need: (c) => (c.d.gold < 20 ? '금화가 모자란다.' : null), run: (h, c) => {
        h.gold(-20); h.rep(c.region, 6);
        h.say('바구니를 안고 고아원 문을 두드려 아기를 맡기고, 금화 주머니를 함께 건넸다.');
      } },
      { label: '그냥 지나친다', run: (h) => h.say('바구니를 뒤로하고 사람들 틈으로 걸어갔다. 등 뒤로 작은 울음소리가 들렸다.') },
    ],
  },
  {
    id: 'lost_child',
    title: '홀로 남은 아이',
    when: ['explore', 'expedition'],
    weight: 3,
    cond: (c) => c.stance === 'hermit' && !c.town && c.nest && !c.full,
    setup: (c) => ({ sea: ['coast', 'swamp'].includes(c.region) }),
    text: (c, v) => (v.sea
      ? ['물가에 부서진 배 조각이 밀려와 있다.', '판자 위에서 젖은 아이 하나가 떨며 하늘을 올려다본다.', '주위에는 아무도 없다.']
      : ['눈보라에 뒤집힌 짐마차 곁에서 아이 하나가 홀로 웅크리고 있다.', '어른들의 발자국은 이미 눈에 덮였다.']),
    choices: [
      { label: '아무도 모르게 둥지로 데려간다', run: (h) => {
        h.adopt('lost');
        h.say('아이를 날개 밑에 감싸 안고, 누구의 눈에도 띄지 않게 둥지로 돌아왔다.');
      } },
      { label: '가까운 마을 어귀에 내려 준다', run: (h) => {
        const t = h.nearestTown(); h.rep(t, 4);
        h.say(`밤을 틈타 ${REGIONS[t].name} 어귀에 아이를 내려 주었다. 아침이면 누군가 발견할 것이다.`);
      } },
    ],
  },
  {
    id: 'tribute_child',
    title: '공물로 바쳐진 아이',
    when: ['intimidate'],
    weight: 5,
    cond: (c) => c.stance === 'hostile' && c.town && c.rep <= -20 && c.nest && !c.full,
    text: () => [
      '포효가 잦아들자 성문이 삐걱 열리고, 노인들이 떨리는 손으로 아이 하나를 앞세운다.',
      '"부디 이 아이로 노여움을 거두소서."',
      '아이는 울지도 않고 드래곤을 똑바로 올려다본다.',
    ],
    choices: [
      { label: '공물로 받아 둥지로 데려간다', run: (h) => {
        h.adopt('tribute'); h.fame(3);
        h.say('아이를 움켜쥐고 날아올랐다. 인간들이 바친 공물이라는 소문이 드래곤들 사이에 퍼진다.');
      } },
      { label: '아이를 돌려보낸다', run: (h, c) => {
        h.rep(c.region, 8); h.fame(-2);
        h.say('콧김 한 번에 아이를 어른들 쪽으로 밀어 보냈다. 인간들은 안도했지만, 드래곤들은 물렀다고 수군댄다.');
      } },
    ],
  },

  // ── 주인 없는 알 ──
  {
    id: 'lonely_egg',
    title: '주인 없는 알',
    when: ['expedition', 'explore'],
    weight: (c) => (c.trigger === 'expedition' ? 4 : c.region === 'ruins' ? 2 : 0.6),
    cond: (c) => !c.town && c.nest && !c.full,
    setup: (c) => {
      const home = Object.entries(KINDS).find(([, k]) => !k.hidden && k.home === c.region);
      return { kind: home ? home[0] : pick(PLAY_KINDS) };
    },
    text: (c, v) => [
      '바위틈에 아직 온기가 남은 커다란 알 하나가 놓여 있다.',
      `주인의 흔적은 어디에도 없다. 껍데기에 ${KINDS[v.kind].name}의 무늬가 희미하게 비친다.`,
    ],
    choices: [
      { label: '둥지로 가져가 품는다', run: (h, c, v) => {
        h.egg(v.kind);
        h.say('알을 조심스레 안고 둥지로 날아왔다. 품으려면 알맞은 재료가 필요할 것 같다.');
      } },
      { label: '깨뜨려 먹는다', run: (h) => {
        h.hp(40); h.fame(-6);
        h.say('알을 깨뜨려 삼켰다. 힘이 차오르지만, 동족의 알을 먹었다는 소문은 금세 퍼질 것이다.');
      } },
      { label: '그대로 둔다', run: (h) => h.say('알을 바위틈에 그대로 두었다. 어미가 돌아오기를 바라며.') },
    ],
  },

  // ── 대륙의 일들 ──
  {
    id: 'peddler',
    title: '떠돌이 상인',
    when: ['explore'],
    weight: 2,
    cond: (c) => !c.town,
    setup: () => {
      const id = pick(['herbal_ointment', 'strong_wine', 'salted_fish', 'silver_chain', 'travel_map']);
      return { item: id, price: Math.round(ITEMS[id].value * 0.8) };
    },
    text: (c, v) => [
      '짐을 잔뜩 진 떠돌이 상인이 길가에 주저앉아 있다가 드래곤을 보고 얼어붙었다.',
      `"사, 살려만 주시면… ${ITEMS[v.item].name}${c.josa(ITEMS[v.item].name, '을', '를')} 싸게 드리겠습니다!"`,
    ],
    choices: [
      { label: (c, v) => `${ITEMS[v.item].name}${c.josa(ITEMS[v.item].name, '을', '를')} 산다 (금화 ${v.price})`, need: (c, v) => (c.d.gold < v.price ? '금화가 모자란다.' : null), run: (h, c, v) => {
        h.gold(-v.price); h.give(v.item);
        h.say(`금화 ${v.price}닢을 건네고 ${ITEMS[v.item].name}${h.josa(ITEMS[v.item].name, '을', '를')} 받았다. 상인은 몇 번이고 절을 했다.`);
      } },
      { label: '위협해 빼앗는다', show: (c) => c.stance === 'hostile', run: (h, c, v) => {
        h.give(v.item); h.fame(1); h.rep(h.nearestTown(), -3);
        h.say(`으르렁거리자 상인이 ${ITEMS[v.item].name}${h.josa(ITEMS[v.item].name, '을', '를')} 내던지고 달아났다.`);
      } },
      { label: '그냥 보내 준다', run: (h) => h.say('고개를 돌리자 상인은 허둥지둥 짐을 챙겨 사라졌다.') },
    ],
  },
  {
    id: 'hurt_hunter',
    title: '다친 사냥꾼',
    when: ['explore', 'gather'],
    weight: 2,
    cond: (c) => !c.town,
    text: () => ['덫에 다리가 걸린 인간 사냥꾼이 신음하고 있다.', '드래곤을 보자 활을 들려다 힘없이 떨어뜨린다.'],
    choices: [
      { label: '덫을 풀고 상처를 돌봐 준다 (기력 6)', need: (c) => (c.d.en < 6 ? '기력이 모자란다.' : null), run: (h, c) => {
        const t = h.nearestTown(); h.en(-6); h.rep(t, 6);
        if (c.stance === 'friendly') h.fame(-1);
        h.say(`덫을 부수고 상처에 숨결을 불어 주었다. 사냥꾼은 ${REGIONS[t].name}에 이 일을 전하겠다고 했다.`);
      } },
      { label: '못 본 척 지나간다', run: (h) => h.say('신음 소리를 뒤로하고 날개를 폈다.') },
      { label: '겁을 줘서 쫓아낸다', run: (h) => {
        h.fame(1); h.rep(h.nearestTown(), -4);
        h.say('포효 한 번에 사냥꾼이 덫을 끌고 절뚝이며 달아났다.');
      } },
    ],
  },
  {
    id: 'rival_dragon',
    title: '낯선 드래곤의 도전',
    when: ['explore', 'expedition'],
    weight: 2,
    cond: (c) => !c.town,
    setup: (c) => ({ kind: pick(PLAY_KINDS), level: Math.max(1, c.d.level + randInt(-1, 2)) }),
    text: (c, v) => [
      `하늘을 가르며 낯선 ${KINDS[v.kind].name} 한 마리가 내려앉았다.`,
      `제법 나이 든 기색이다(레벨 ${v.level} 정도). 꼬리로 땅을 치며 도전을 청한다.`,
    ],
    choices: [
      { label: '도전을 받아들인다', need: (c) => (c.d.hp < 25 ? '체력이 너무 낮다.' : null), run: (h, c, v) => {
        const st = c.stats;
        const me = st.claw + st.scale * 0.5 + st.wing * 0.5 + c.d.level * 3;
        const foe = 18 + v.level * 3;
        const win = Math.random() < Math.max(0.15, Math.min(0.85, 0.5 + (me - foe) * 0.04));
        if (win) {
          const g = randInt(10, 25) + v.level * 3;
          h.hp(-randInt(5, 12)); h.gold(g); h.fame(5);
          h.say(`긴 싸움 끝에 상대가 먼저 고개를 숙였다. 상대가 두고 간 금화 ${g}닢을 챙겼다.`);
        } else {
          h.hp(-randInt(15, 25)); h.fame(-3);
          h.say('발톱이 비늘을 긁고 지나갔다. 결국 먼저 물러선 쪽은 이쪽이었다.');
        }
      } },
      { label: '고개를 돌려 피한다', run: (h) => { h.fame(-2); h.say('싸움을 피해 날아올랐다. 등 뒤에서 비웃는 울음이 들렸다.'); } },
    ],
  },
  {
    id: 'festival',
    title: '왕도의 축제',
    when: ['explore'],
    weight: 3,
    cond: (c) => c.stance === 'friendly' && c.region === 'capital' && c.rep >= 40,
    text: () => ['왕도에 축제가 열렸다. 거리마다 깃발이 나부끼고 음악이 흐른다.', '인파에 섞여 걷는데, 아이 하나가 소매를 잡아끌며 같이 춤추자고 한다.'],
    choices: [
      { label: '사람들 틈에서 함께 즐긴다', run: (h, c) => {
        h.rep(c.region, 4); h.gold(15); h.fame(-2);
        h.say('아이 손에 이끌려 광장을 몇 바퀴나 돌았다. 상인들이 낯선 나그네에게 꽃과 동전을 쥐여 주었다. 드래곤들은 이 모습을 탐탁지 않게 여길 것이다.');
      } },
      { label: '본래 모습으로 하늘에 올라 불꽃을 뿜는다 (기력 8)', need: (c) => (c.d.en < 8 ? '기력이 모자란다.' : null), run: (h, c) => {
        h.en(-8); h.rep(c.region, 8); h.fame(-1);
        h.say('광장 끝 그늘에서 폴리모프를 풀고 밤하늘로 솟구쳤다. 숨결을 흩뿌리자 거리 전체가 환호성으로 뒤덮였다.');
      } },
      { label: '멀리서 지켜본다', run: (h) => h.say('성벽 위 망루 그늘에 기대어 축제의 불빛을 한참 내려다보았다.') },
    ],
  },

  // ── 둥지 식구 이벤트 ──
  {
    id: 'child_fever',
    title: '열이 나는 아이',
    when: ['wake', 'explore'],
    weight: 4,
    cond: (c) => c.humans.some((x) => ['아기', '아이'].includes(c.stage(x))),
    setup: (c) => ({ id: c.pick(c.humans.filter((x) => ['아기', '아이'].includes(c.stage(x)))).id }),
    text: (c, v) => [`${c.k(v.id).name}의 이마가 불덩이 같다.`, '밤새 뒤척이며 작게 앓는 소리를 낸다.'],
    choices: [
      { label: '고약을 발라 준다 (꿀 고약 또는 약초상 연고)', tone: 'warm', need: (c) => (c.have('honey_salve') + c.have('herbal_ointment') < 1 ? '고약이 없다.' : null), run: (h, c, v) => {
        const k = c.k(v.id);
        h.take(c.have('honey_salve') ? 'honey_salve' : 'herbal_ointment'); h.bond(k, 10);
        h.say(`고약을 발라 주자 ${h.name(k)} 새근새근 잠들었다.`);
      } },
      { label: '마을 의원에게 데려간다 (금화 15)', show: (c) => c.stance !== 'hostile', need: (c) => (c.d.gold < 15 ? '금화가 모자란다.' : null), run: (h, c, v) => {
        h.gold(-15); h.bond(c.k(v.id), 6);
        h.say('의원은 드래곤을 보고 놀랐지만, 아이를 정성껏 돌봐 주었다.');
      } },
      { label: '밤새 곁을 지킨다 (기력 10)', tone: 'warm', run: (h, c, v) => {
        h.en(-10); h.bond(c.k(v.id), 4);
        h.say('날개로 아이를 감싸 밤새 따뜻하게 해 주었다. 새벽녘에야 열이 내렸다.');
      } },
    ],
  },
  {
    id: 'child_question',
    title: '아이의 물음',
    when: ['wake'],
    weight: 2,
    cond: (c) => c.humans.some((x) => ['아이', '소년', '청소년'].includes(c.stage(x))),
    setup: (c) => ({ id: c.pick(c.humans.filter((x) => ['아이', '소년', '청소년'].includes(c.stage(x)))).id }),
    text: (c, v) => { const k = c.k(v.id); return [`${k.name}${c.josa(k.name, '이', '가')} 꼬리에 기대앉아 묻는다.`, `"나는 왜 사람이고, ${c.callOf(k)}${c.josa(c.callOf(k), '은', '는')} 왜 용이야?"`]; },
    choices: [
      { label: '사람의 마을 이야기를 들려준다', run: (h, c, v) => { const k = c.k(v.id); h.bond(k, 5); h.lean(k, 'herbalist', 2); h.say('약초 냄새 가득한 시장 이야기에 아이의 눈이 반짝였다.'); } },
      { label: '용의 옛이야기를 들려준다', run: (h, c, v) => { const k = c.k(v.id); h.bond(k, 5); h.lean(k, 'guard', 2); h.say('하늘을 지키던 옛 용들의 이야기에 아이가 주먹을 꼭 쥐었다.'); } },
      { label: '대장간의 불 이야기를 들려준다', run: (h, c, v) => { const k = c.k(v.id); h.bond(k, 5); h.lean(k, 'smith', 2); h.say('쇠를 두드려 칼을 만드는 이야기에 아이가 손뼉을 쳤다.'); } },
      { label: '대답하지 않는다', tone: 'free', run: (h, c, v) => { h.bond(c.k(v.id), -3); h.say('대답 대신 눈을 감았다. 아이는 한참을 말없이 앉아 있었다.'); } },
    ],
  },
  {
    id: 'rescue_raid',
    title: '기사단의 구출',
    when: ['wake', 'explore'],
    weight: (c) => (c.perks.guard ? 2 : 4),
    // 되찾으러 오는 것은 아직 어린 아이만 (어른·노년이 된 식구는 빼고)
    cond: (c) => c.stance === 'hostile' && c.humans.some((x) => x.data.path !== 'knight' && !adultHuman(c, x)),
    setup: (c) => ({ id: c.pick(c.humans.filter((x) => x.data.path !== 'knight' && !adultHuman(c, x))).id }),
    text: (c, v) => { const k = c.k(v.id); return [
      '둥지 아래 계곡에 기사단이 진을 쳤다.',
      `"${k.name}${c.josa(k.name, '을', '를')} 돌려받으러 왔다! 괴물아, 나와라!"`,
    ]; },
    choices: [
      { label: '맞서 싸운다', run: (h, c, v) => {
        const k = c.k(v.id);
        h.hp(-randInt(15, 30)); h.fame(4); h.bond(k, 8);
        h.say(`숨결로 진을 불사르자 기사단이 흩어졌다. ${h.name(k)} 날개 밑에서 떨면서도 놓지 않았다.`);
      } },
      { label: '아이를 돌려보낸다', run: (h, c, v) => {
        const k = c.k(v.id);
        h.rep(k.data.town || h.nearestTown(), 15); h.fame(-3); h.leave(k, 'returned');
        h.say(`${h.name(k)} 기사의 말에 올라 몇 번이고 뒤돌아보았다.`);
      } },
    ],
  },
  {
    id: 'first_flight',
    title: '첫 날갯짓',
    when: ['wake', 'explore'],
    weight: 6,
    cond: (c) => c.drakes.some((x) => c.canTravel(x) && !x.data.flew),
    setup: (c) => ({ id: c.pick(c.drakes.filter((x) => c.canTravel(x) && !x.data.flew)).id }),
    text: (c, v) => { const k = c.k(v.id); return [`${k.name}${c.josa(k.name, '이', '가')} 둥지 가장자리에서 날개를 퍼덕이고 있다.`, '몇 번이나 떨어질 뻔하면서도 포기하지 않는다.']; },
    choices: [
      { label: '함께 날아오른다', tone: 'warm', run: (h, c, v) => {
        const k = c.k(v.id);
        h.bond(k, 10); h.train(k, 'wing'); k.data.flew = true;
        h.say('옆에서 바람을 받쳐 주자, 새끼가 처음으로 하늘에 떴다. 날개 +1');
      } },
      { label: '스스로 날 때까지 지켜본다', tone: 'trust', run: (h, c, v) => {
        const k = c.k(v.id);
        h.bond(k, 4); k.data.flew = true;
        h.say('해 질 녘, 새끼는 혼자 힘으로 둥지 위를 한 바퀴 돌았다.');
      } },
    ],
  },

  // ── 둘을 함께 키울 때 ──
  {
    id: 'kin_fight',
    title: '둥지 안의 다툼',
    when: ['wake', 'explore'],
    weight: 3,
    cond: (c) => c.grown.length >= 2,
    // 인간과 새끼가 섞여 있으면 인간을 a로
    setup: (c) => { const [a, b] = [...c.grown].sort((x, y) => (x.type === 'human' ? -1 : 1) - (y.type === 'human' ? -1 : 1)); return { a: a.id, b: b.id }; },
    text: (c, v) => {
      const a = c.k(v.a), b = c.k(v.b);
      const j = c.josa;
      if (a.type === 'human' && b.type === 'human') return [
        `${a.name}${j(a.name, '이', '가')} ${b.name}의 몫까지 꿀을 다 먹어 버렸다.`,
        '둘이 엉겨 붙어 둥지 바닥을 데굴데굴 구른다.',
      ];
      if (a.type === 'drake' && b.type === 'drake') return [
        `${a.name}${j(a.name, '과', '와')} ${b.name}${j(b.name, '이', '가')} 둥지에서 가장 따뜻한 자리를 두고 으르렁거린다.`,
        '서로 꼬리를 물고 늘어지는 사이 작은 불똥이 튄다.',
      ];
      return [
        `${b.name}${j(b.name, '이', '가')} 장난치다 그만 ${a.name}의 소매를 태웠다.`,
        `${a.name}${j(a.name, '이', '가')} 울음을 터뜨리며 ${b.name}의 꼬리를 걷어찼다.`,
      ];
    },
    choices: [
      { label: (c, v) => `${c.k(v.a).name}의 편을 든다`, run: (h, c, v) => {
        const a = c.k(v.a), b = c.k(v.b);
        h.bond(a, 6); h.bond(b, -6);
        h.say(`${h.name(a)} 의기양양해졌다. ${h.name(b)} 구석에서 등을 돌리고 웅크렸다.`);
      } },
      { label: (c, v) => `${c.k(v.b).name}의 편을 든다`, run: (h, c, v) => {
        const a = c.k(v.a), b = c.k(v.b);
        h.bond(b, 6); h.bond(a, -6);
        h.say(`${h.name(b)} 의기양양해졌다. ${h.name(a)} 구석에서 등을 돌리고 웅크렸다.`);
      } },
      { label: '둘 다 꾸짖는다', tone: 'strict', run: (h, c, v) => {
        h.bond(c.k(v.a), -2); h.bond(c.k(v.b), -2); h.fame(1);
        h.say('낮게 울리는 한마디에 둘 다 고개를 푹 숙였다. 둥지에 질서가 섰다.');
      } },
      { label: '함께 놀게 해 준다 (기력 6)', tone: 'warm', need: (c) => (c.d.en < 6 ? '기력이 모자란다.' : null), run: (h, c, v) => {
        h.en(-6); h.bond(c.k(v.a), 4); h.bond(c.k(v.b), 4);
        h.say('꼬리 끝을 흔들어 둘의 관심을 돌렸다. 해가 질 무렵엔 나란히 잠들어 있었다.');
      } },
    ],
  },

  // 아이와 새끼 용을 함께 키울 때: 어미의 성향에 따라 다른 일이 생김
  {
    id: 'mixed_friendly',
    title: '함께 가는 마을 구경',
    when: ['wake', 'explore'],
    weight: 3,
    cond: (c) => c.stance === 'friendly' && c.humans.length && c.drakes.some(c.canTravel),
    setup: (c) => ({ h: c.pick(c.humans).id, d: c.pick(c.drakes.filter(c.canTravel)).id }),
    text: (c, v) => { const a = c.k(v.h), b = c.k(v.d); return [
      `${a.name}${c.josa(a.name, '이', '가')} ${b.name}의 등에 올라타 마을 구경을 가자고 조른다.`,
      `${b.name}도 꼬리를 흔들며 둥지 밖을 기웃거린다.`,
    ]; },
    choices: [
      { label: '둘을 데리고 마을에 간다', run: (h, c, v) => {
        const a = c.k(v.h), b = c.k(v.d);
        const t = h.nearestTown();
        h.rep(t, 5); h.fame(-1); h.bond(a, 5); h.bond(b, 5); h.nudge(b, 'friendly', 2);
        h.say(`아이를 태운 새끼 용을 본 ${REGIONS[t].name} 사람들이 환호했다. 둘은 하루 종일 사람들 틈에서 웃었다.`);
      } },
      { label: '둥지에 머물게 한다', run: (h, c, v) => {
        h.bond(c.k(v.h), -3); h.bond(c.k(v.d), -3);
        h.say('둘은 시무룩하게 둥지 가장자리에 나란히 앉아 먼 마을 불빛만 바라보았다.');
      } },
    ],
  },
  {
    id: 'mixed_hermit',
    title: '숨는 법',
    when: ['wake', 'explore'],
    weight: 3,
    cond: (c) => c.stance === 'hermit' && c.humans.length && c.drakes.length,
    setup: (c) => ({ h: c.pick(c.humans).id, d: c.pick(c.drakes).id }),
    text: (c, v) => { const a = c.k(v.h), b = c.k(v.d); return [
      '둥지 위로 인간 사냥꾼들의 그림자가 지나간다.',
      `${b.name}${c.josa(b.name, '이', '가')} ${a.name}${c.josa(a.name, '을', '를')} 날개 밑에 감춘 채 숨을 죽인다.`,
    ]; },
    choices: [
      { label: '둘에게 함께 숨는 법을 가르친다', run: (h, c, v) => {
        const a = c.k(v.h), b = c.k(v.d);
        h.bond(a, 4); h.bond(b, 4); h.train(b, 'wing'); h.lean(a, 'guard', 1);
        h.say('바위 그늘과 바람의 결을 읽는 법을 둘에게 가르쳤다. 서로를 지키는 눈빛이 달라졌다. 새끼의 날개 +1');
      } },
      { label: '새끼에게만 홀로 숨는 법을 가르친다', run: (h, c, v) => {
        const a = c.k(v.h), b = c.k(v.d);
        h.bond(b, 3); h.bond(a, -3); h.nudge(b, 'hermit', 2);
        h.say(`새끼에게 아무도 믿지 않고 숨는 법을 따로 가르쳤다. ${h.name(a)} 조금 서운한 눈치다.`);
      } },
    ],
  },
  {
    id: 'mixed_hostile',
    title: '함께 가는 약탈', // 여러 번 뜨는 이벤트라 '첫'을 뺌 (우호 쪽 '함께 가는 마을 구경'과 짝)
    when: ['wake', 'explore'],
    weight: 3,
    cond: (c) => c.stance === 'hostile' && c.humans.length && c.drakes.some(c.canTravel),
    setup: (c) => ({ h: c.pick(c.humans).id, d: c.pick(c.drakes.filter(c.canTravel)).id }),
    text: (c, v) => { const a = c.k(v.h), b = c.k(v.d); return [
      `${b.name}${c.josa(b.name, '이', '가')} ${a.name}${c.josa(a.name, '을', '를')} 등에 태우고 인간 마을을 겁주러 가자고 조른다.`,
      `${a.name}${c.josa(a.name, '은', '는')} 무서워하면서도 눈을 반짝인다.`,
    ]; },
    choices: [
      { label: '둘을 데리고 간다', run: (h, c, v) => {
        const a = c.k(v.h), b = c.k(v.d);
        const t = h.nearestTown();
        const g = randInt(10, 20);
        h.rep(t, -6); h.fame(2); h.gold(g); h.lean(a, 'guard', 3); h.nudge(b, 'hostile', 2); h.bond(a, 3); h.bond(b, 3);
        h.say(`작은 포효에도 ${REGIONS[t].name} 사람들이 혼비백산했다. 둘은 빼앗은 금화 ${g}닢을 세며 깔깔 웃었다.`);
      } },
      { label: '새끼만 데려간다', run: (h, c, v) => {
        const a = c.k(v.h), b = c.k(v.d);
        h.rep(h.nearestTown(), -3); h.fame(1); h.bond(b, 4); h.bond(a, -4); h.nudge(b, 'hostile', 2);
        h.say(`새끼와 함께 마을 위를 낮게 돌고 왔다. 둥지에 남은 ${h.name(a)} 입을 삐죽 내밀었다.`);
      } },
      { label: '둘 다 말린다', run: (h, c, v) => {
        h.bond(c.k(v.h), 1); h.bond(c.k(v.d), 1);
        h.say('아직은 때가 아니라고 타일렀다. 둘은 아쉬워하면서도 고개를 끄덕였다.');
      } },
    ],
  },

  // ── 라이벌: 내가 라이벌로 정한 드래곤이 있을 때 ──
  {
    id: 'rival_marks',
    title: '라이벌의 발톱 자국',
    when: ['explore', 'gather'],
    weight: 4,
    cond: (c) => c.rivals.length > 0 && !c.town,
    setup: (c) => { const r = pick(c.rivals); return { rid: r.id, rname: r.name }; },
    text: (c, v) => [
      '바위벽에 깊은 발톱 자국이 새겨져 있다.',
      `냄새를 맡아 보니 라이벌 ${v.rname}의 것이다. 이 땅이 제 것이라는 표시다.`,
    ],
    choices: [
      { label: '그 위에 더 깊은 자국을 새긴다', run: (h, c, v) => {
        h.fame(1);
        h.notify(v.rid, `${c.me}${c.josa(c.me, '이', '가')} ${c.regionName}에 남긴 당신의 발톱 자국 위에 더 깊은 자국을 새겼다. 이 땅은 이제 자기 것이라는 듯이.`);
        h.say('바위가 갈라질 만큼 깊게 발톱을 박아 넣었다. 이제 이곳은 내 땅이다.');
      } },
      { label: '도전의 표시를 남긴다', run: (h, c, v) => {
        h.buff('might', 30);
        h.notify(v.rid, `${c.me}${c.josa(c.me, '이', '가')} ${c.regionName}의 바위에 도전의 표시를 남겼다. "결투장에서 기다리겠다."`);
        h.say('자국 옆에 꼬리로 커다란 원을 그렸다. 언제든 덤비라는 뜻이다. 가슴이 뜨거워진다. (30분 동안 투지: 공격 +15%)');
      } },
      { label: '못 본 척 지나간다', run: (h) => h.say('콧김을 한 번 내뿜고 지나쳤다. 지금은 상대할 때가 아니다.') },
    ],
  },
  {
    id: 'rival_rumor',
    title: '라이벌의 소문',
    when: ['explore', 'expedition'],
    weight: 3,
    cond: (c) => c.rivals.length > 0,
    setup: (c) => { const r = pick(c.rivals); return { rid: r.id, rname: r.name, deed: pick(['강적 셋을 연달아 쓰러뜨렸다', '오로라 봉우리 꼭대기까지 날아올랐다', '분화구 근처에서 불길 속을 걸었다', '하룻밤 새 보물더미를 두 배로 불렸다']) }; },
    text: (c, v) => [
      '바람결에 드래곤들의 수군거림이 실려 온다.',
      `"${v.rname}${c.josa(v.rname, '이', '가')} ${v.deed}더군. 요즘 부쩍 강해졌어."`,
    ],
    choices: [
      { label: '질 수 없다. 더 거세게 몰아붙인다', run: (h) => {
        h.buff('might', 60); h.en(-8);
        h.say('이를 악물고 날개를 폈다. 오늘은 평소보다 두 배로 사냥할 것이다. (60분 동안 투지: 공격 +15%)');
      } },
      { label: '소문을 비틀어 깎아내린다', run: (h, c, v) => {
        h.fame(-1);
        h.notify(v.rid, `요즘 당신에 대한 나쁜 소문이 돈다. 처음 퍼뜨린 건 ${c.me}${c.josa(c.me, '이라는', '라는')} 말이 있다.`);
        h.say('"그거 다 허풍이야." 한마디 했을 뿐인데, 소문은 금세 부풀어 퍼져 나갔다. 용족들의 눈초리가 조금 차가워졌다.');
      } },
      { label: '흘려듣는다', run: (h) => { h.mind(5); h.say('남의 이야기에 흔들릴 필요는 없다. 마음이 차분해졌다.'); } },
    ],
  },
  {
    id: 'rival_scale',
    title: '떨어진 비늘',
    when: ['explore', 'gather', 'expedition'],
    weight: 3,
    cond: (c) => c.rivals.length > 0 && !c.town,
    setup: (c) => { const r = pick(c.rivals); return { rid: r.id, rname: r.name }; },
    text: (c, v) => [
      '풀숲에 반짝이는 비늘 한 조각이 떨어져 있다.',
      `라이벌 ${v.rname}의 비늘이다. 방금 전까지 여기서 무언가와 싸운 모양이다.`,
    ],
    choices: [
      { label: '전리품처럼 챙긴다', run: (h, c, v) => {
        h.give('rival_scale');
        h.notify(v.rid, `${c.me}${c.josa(c.me, '이', '가')} ${c.regionName}에서 당신이 떨어뜨린 비늘을 주워 전리품처럼 챙겨 갔다.`);
        h.say('비늘을 집어 들었다. 다음에 만나면 이걸 보여 줘야지.');
      } },
      { label: '돌려주겠다고 텔레파시를 보낸다', run: (h, c, v) => {
        h.fame(1);
        h.notify(v.rid, `"네 비늘을 ${c.regionName}에서 주웠다. 다음엔 다치지 말고 와라. 쓰러뜨리는 건 내 몫이니까." — ${c.me}`);
        h.say('비늘을 바위 위에 잘 올려 두고 짧은 생각을 보냈다. 라이벌이라도 지킬 것은 지킨다.');
      } },
      { label: '발로 밟아 묻어 버린다', run: (h) => h.say('비늘을 흙 속에 밟아 넣었다. 속이 조금 후련하다.') },
    ],
  },

  // ── 사냥하다 생기는 일 ───────────────────────────
  {
    id: 'trapped_beast',
    title: '덫에 걸린 짐승',
    when: ['hunt'],
    weight: 3,
    cond: (c) => !c.town && !!c.place,
    setup: (c) => ({ beast: PLACES[c.place].creature }),
    text: (c, v) => [
      `사냥감을 쫓던 중, 쇠덫에 다리가 물린 ${v.beast}${c.josa(v.beast, '이', '가')} 몸부림치는 것을 보았다.`,
      '덫에는 인간 마을의 낙인이 찍혀 있다. 밀렵꾼의 짓이다.',
    ],
    choices: [
      { label: '덫을 부수고 풀어 준다', run: (h, c, v) => {
        h.fame(1); h.mind(5);
        h.say(`발톱으로 덫을 비틀어 끊자 ${v.beast}${h.josa(v.beast, '이', '가')} 절뚝이며 숲으로 사라졌다. 마음 한구석이 개운하다.`);
      } },
      { label: '덫째로 잡아먹는다', run: (h, c, v) => {
        h.hp(15); h.give('beast_hide');
        h.say(`손쉬운 먹잇감이다. 배를 채우고 가죽까지 챙겼다. (체력 +15)`);
      } },
      { label: '덫을 놓은 밀렵꾼을 찾아가 혼낸다', run: (h, c) => {
        const g = randInt(8, 20) + c.level * 2;
        h.gold(g); h.rep(h.nearestTown(), -4); h.fame(1);
        h.say(`냄새를 따라가 밀렵꾼의 움막을 덮쳤다. 밀렵꾼은 금화 주머니를 던지고 달아났다. (금화 ${g}닢)`);
      } },
    ],
  },
  {
    id: 'alpha_yields',
    title: '항복한 우두머리',
    when: ['hunt'],
    weight: 2,
    cond: (c) => !c.town && !!c.place && c.level >= 3,
    setup: (c) => ({ beast: PLACES[c.place].creature, drop: PLACES[c.place].drop || null }),
    text: (c, v) => [
      `무리를 흩어 놓자, 상처투성이 ${v.beast} 우두머리가 앞으로 나와 머리를 땅에 댔다.`,
      '뒤에 남은 무리가 숨을 죽이고 지켜본다.',
    ],
    choices: [
      { label: '살려 보낸다', run: (h, c, v) => {
        h.fame(1); h.buff('iron', 60);
        h.say(`고개를 돌리자 우두머리가 무리를 이끌고 물러났다. 소문이 퍼져 한동안 짐승들이 함부로 덤비지 못한다. (한 시간 동안 단단함: 받는 피해 −15%)`);
      } },
      { label: '마지막 숨을 끊는다', run: (h, c, v) => {
        if (v.drop) h.give(v.drop, 2); else h.give('sharp_fang', 2);
        h.mind(-5);
        h.say(`우두머리를 쓰러뜨리고 전리품을 넉넉히 챙겼다. 그 눈빛이 오래 머리에 남는다. (정신 −5)`);
      } },
    ],
  },
  {
    id: 'rival_hunter',
    title: '사냥감을 노리는 드래곤',
    when: ['hunt'],
    weight: 2,
    cond: (c) => !c.town,
    setup: () => ({ kind: pick(PLAY_KINDS) }),
    text: (c, v) => [
      `쓰러뜨린 사냥감 위로 그림자가 드리웠다. 낯선 ${KINDS[v.kind].name}${c.josa(KINDS[v.kind].name, '이', '가')} 내려앉아 이빨을 드러낸다.`,
      '"그건 내가 먼저 노리던 거다."',
    ],
    choices: [
      { label: '반으로 나눠 먹는다', run: (h) => {
        h.fame(2); h.hp(10);
        h.say('사냥감을 반으로 갈라 내밀자, 낯선 드래곤이 잠시 망설이다 고개를 끄덕였다. 둘은 말없이 배를 채웠다. (체력 +10)');
      } },
      { label: '으르렁거려 쫓아낸다', run: (h, c) => {
        h.hp(-randInt(8, 16)); h.fame(c.stance === 'hostile' ? 2 : 1); h.give('sharp_fang');
        h.say('발톱이 몇 번 오간 끝에 낯선 드래곤이 물러났다. 상처는 났지만 사냥감은 지켰다.');
      } },
      { label: '사냥감을 넘겨준다', run: (h) => {
        h.mind(8);
        h.say('굳이 다툴 일은 아니다. 사냥감을 남겨 두고 날아올랐다. 마음이 한결 가볍다. (정신 +8)');
      } },
    ],
  },

  // ── 날씨·계절에 따라 생기는 일 ───────────────────
  {
    id: 'lightning_tree',
    title: '낙뢰 맞은 고목',
    when: ['explore', 'gather'],
    weight: 4,
    cond: (c) => c.weather === 'storm' && !c.town,
    text: () => ['하늘을 가르는 번개가 바로 앞의 고목을 내리쳤다.', '쪼개진 줄기에서 불길이 치솟고, 그 속에서 단단한 심재가 붉게 빛난다.'],
    choices: [
      { label: '불길 속에서 심재를 꺼낸다', run: (h) => {
        h.hp(-randInt(10, 20)); h.give('heartwood');
        h.say('불길에 비늘을 그을리며 고목의 심재를 끌어냈다.');
      } },
      { label: '숲으로 번지지 않게 불을 끈다 (기력 8)', need: (c) => (c.d.en < 8 ? '기력이 모자란다.' : null), run: (h) => {
        h.en(-8); h.fame(1); h.mind(5); h.rep(h.nearestTown(), 3);
        h.say('날갯짓으로 흙을 덮어 불길을 잡았다. 멀리서 지켜보던 인간 나무꾼들이 고개를 숙인다.');
      } },
      { label: '지나친다', run: (h) => h.say('비를 맞으며 그 자리를 떠났다. 등 뒤에서 고목이 무너지는 소리가 났다.') },
    ],
  },
  {
    id: 'snowbound_caravan',
    title: '눈에 갇힌 상단',
    when: ['explore'],
    weight: 4,
    cond: (c) => c.weather === 'snow' && !c.town,
    text: () => ['함박눈 속에 인간 상단의 수레들이 반쯤 파묻혀 있다.', '상인들이 모닥불 앞에 웅크린 채 드래곤을 보고 얼어붙었다.'],
    choices: [
      { label: '눈을 치우고 길을 터 준다 (기력 10)', need: (c) => (c.d.en < 10 ? '기력이 모자란다.' : null), run: (h) => {
        const g = randInt(10, 25);
        h.en(-10); h.rep(h.nearestTown(), 8); h.gold(g);
        h.say(`날갯짓으로 눈을 쓸어 길을 냈다. 상인들이 몇 번이고 절하며 금화 ${g}닢을 건넸다.`);
      } },
      { label: '짐을 털어 간다', run: (h, c) => {
        const g = randInt(30, 60);
        h.gold(g); h.give('silk_scrap'); h.rep(h.nearestTown(), -10); if (c.stance === 'hostile') h.fame(1);
        h.say(`눈보라 속에서 수레를 뒤집었다. 금화 ${g}닢과 비단 조각을 챙겼다. 이 일은 마을에 금세 퍼질 것이다.`);
      } },
      { label: '지나친다', run: (h) => h.say('눈보라를 뚫고 그대로 날아갔다.') },
    ],
  },
  {
    id: 'aurora_vision',
    title: '오로라 아래의 환영',
    when: ['explore', 'wake'],
    weight: 4,
    cond: (c) => c.weather === 'aurora',
    text: () => ['밤하늘에 흔들리는 빛의 장막 아래, 오래전 사라진 거대한 용의 환영이 내려앉았다.', '"어린 것아, 내 이야기를 들어 보겠느냐. 아니면 내가 가는 길을 따라오겠느냐."'],
    choices: [
      { label: '이야기를 듣는다', run: (h) => {
        h.mind(25);
        h.say('옛 용은 대륙이 처음 생겨나던 때의 이야기를 들려주었다. 흐려졌던 머릿속이 맑게 갠다. (정신 +25)');
      } },
      { label: '환영을 따라간다', run: (h, c) => {
        if (Math.random() < 0.6) {
          const id = pick(REGION_LOOT[c.region]?.rare || ['ancient_relic']);
          h.give(id);
          h.say(`빛을 따라 날아가자, 환영이 사라진 자리에 ${ITEMS[id].name}${h.josa(ITEMS[id].name, '이', '가')} 놓여 있었다.`);
        } else {
          h.hp(-10); h.en(-10);
          h.say('빛을 쫓다 보니 어느새 길을 잃었다. 새벽이 되어서야 겨우 돌아왔다. (체력·기력 −10)');
        }
      } },
      { label: '고개를 숙이고 물러난다', run: (h) => { h.mind(5); h.say('환영은 고개를 끄덕이고 빛 속으로 흩어졌다.'); } },
    ],
  },
  {
    id: 'harvest_festival',
    title: '가을 수확제',
    when: ['explore'],
    weight: 5,
    cond: (c) => c.season === 'autumn' && c.town,
    text: (c) => [`${c.regionName}에 수확제가 열렸다. 곡식 단과 과일 바구니가 광장을 가득 메웠다.`,
      c.human ? '광장 어귀에 서자, 햇과일 냄새와 흥겨운 피리 소리가 밀려왔다.' : '사람들이 하늘의 그림자를 올려다보며 웅성거린다.'],
    choices: [
      { label: '광장에서 사람들과 어울린다', show: (c) => c.stance !== 'hostile', run: (h, c) => {
        h.rep(c.region, 5); h.en(10); h.give(pick(['honey_salve', 'strong_wine', 'salted_fish']));
        h.say('아이들이 낯선 나그네의 손을 잡아끌어 춤판에 끼워 주고, 어른들은 햇과일과 술을 내왔다. (기력 +10)');
      } },
      { label: '공물을 요구한다', show: (c) => c.stance === 'hostile', run: (h, c) => {
        const g = randInt(25, 50);
        h.gold(g); h.rep(c.region, -6); h.fame(1);
        h.say(`광장 한가운데 내려앉아 포효하자, 촌장이 떨리는 손으로 금화 ${g}닢을 바쳤다.`);
      } },
      { label: '멀리서 바라본다', run: (h, c) => { h.mind(10); h.say(c.human ? '광장 가장자리 처마 밑에 앉아 축제의 불빛을 한참 바라보았다. (정신 +10)' : '지붕 위에서 축제의 불빛을 한참 내려다보았다. (정신 +10)'); } },
    ],
  },

  // ── 둥지와 보물더미 ──────────────────────────────
  {
    id: 'raven_thief',
    title: '보물을 물어 가는 까마귀',
    when: ['wake'],
    weight: 3,
    cond: (c) => !!c.nest && c.hoard.some((x) => ITEMS[x.item] && ITEMS[x.item].type !== 'use'),
    setup: (c) => ({ item: pick(c.hoard.filter((x) => ITEMS[x.item] && ITEMS[x.item].type !== 'use')).item }),
    text: (c, v) => [`눈을 뜨자 까마귀 한 마리가 보물더미에서 ${ITEMS[v.item].name}${c.josa(ITEMS[v.item].name, '을', '를')} 물고 날아오르고 있다.`, '반짝이는 것을 좋아하는 녀석들이다.'],
    choices: [
      { label: '쫓아간다 (기력 6)', need: (c) => (c.d.en < 6 ? '기력이 모자란다.' : null), run: (h, c, v) => {
        h.en(-6);
        if (Math.random() < 0.7) {
          const g = randInt(5, 15);
          h.gold(g); h.give('brass_button', 2);
          h.say(`까마귀 둥지까지 쫓아가 ${ITEMS[v.item].name}${h.josa(ITEMS[v.item].name, '을', '를')} 되찾았다. 둥지에 모여 있던 놋쇠 단추와 금화 ${g}닢도 챙겼다.`);
        } else {
          h.hoardTake(v.item, 1);
          h.say('바위 틈으로 숨어든 까마귀를 끝내 놓쳤다.');
        }
      } },
      { label: '내버려 둔다', run: (h, c, v) => {
        h.hoardTake(v.item, 1); h.mind(3);
        h.say('반짝이 하나쯤이야. 다시 눈을 감았다.');
      } },
    ],
  },
  {
    id: 'cursed_ring',
    title: '속삭이는 반지',
    when: ['wake'],
    weight: 2,
    cond: (c) => !!c.nest && c.hoardValue >= 300,
    text: () => ['보물더미 깊은 곳에서 본 적 없는 반지가 굴러 나왔다.', '귀를 기울이자 반지 속에서 누군가 속삭인다. "나를 끼면… 모두가 너를 우러러볼 거야."'],
    choices: [
      { label: '손가락에 끼워 본다', run: (h) => {
        h.give('whisper_ring'); h.mind(-10);
        h.say('반지를 끼자 등줄기에 서늘한 힘이 차올랐다. 속삭임은 멈추지 않는다. (속삭이는 반지를 얻었다. 정신 −10)');
      } },
      { label: '녹여서 금화로 만든다', run: (h) => {
        const g = randInt(30, 50);
        h.gold(g);
        h.say(`숨결로 반지를 녹이자 비명 같은 소리가 났다. 남은 금덩이는 금화 ${g}닢 값어치였다.`);
      } },
      { label: '아무도 찾지 못할 곳에 묻는다', run: (h) => { h.mind(5); h.say('반지를 둥지 밑 깊은 곳에 묻었다. 속삭임이 잦아들었다. (정신 +5)'); } },
    ],
  },
  {
    id: 'kid_toy',
    title: '아이의 보물 장난감',
    when: ['wake'],
    weight: 3,
    cond: (c) => !!c.nest && c.humans.some((x) => ['아이', '소년'].includes(c.stage(x))) && c.hoard.length > 0,
    setup: (c) => {
      const cheap = [...c.hoard].filter((x) => ITEMS[x.item]).sort((a, b) => (ITEMS[a.item].value || 0) - (ITEMS[b.item].value || 0));
      return { id: c.pick(c.humans.filter((x) => ['아이', '소년'].includes(c.stage(x)))).id, item: cheap[0].item };
    },
    text: (c, v) => { const k = c.k(v.id); return [`${k.name}${c.josa(k.name, '이', '가')} 보물더미에서 ${ITEMS[v.item].name}${c.josa(ITEMS[v.item].name, '을', '를')} 꺼내 들고 놀고 있다.`, '반짝이는 것을 끈에 꿰어 목에 걸고는 잔뜩 뿌듯한 얼굴이다.']; },
    choices: [
      { label: '혼내고 보물을 되찾는다', tone: 'strict', run: (h, c, v) => {
        const k = c.k(v.id); h.bond(k, -3);
        h.say(`${h.name(k)} 입을 삐죽이며 보물을 돌려놓았다. (유대 −3)`);
      } },
      { label: '장난감으로 갖게 해 준다', tone: 'free', run: (h, c, v) => {
        const k = c.k(v.id); h.hoardTake(v.item, 1); h.bond(k, 10);
        h.say(`"정말? 내 거야?" ${h.name(k)} 꼬리에 매달려 한참을 떨어지지 않았다. (유대 +10)`);
      } },
      { label: '함께 놀아 준다 (기력 5)', tone: 'warm', need: (c) => (c.d.en < 5 ? '기력이 모자란다.' : null), run: (h, c, v) => {
        const k = c.k(v.id); h.en(-5); h.bond(k, 6);
        h.say(`보물을 굴리며 한참을 놀아 주었다. 놀이가 끝나자 ${h.name(k)} 보물을 제자리에 돌려놓았다. (유대 +6)`);
      } },
    ],
  },

  // ── 채집하다 생기는 일 ───────────────────────────
  {
    id: 'hidden_spring',
    title: '숨겨진 샘',
    when: ['gather'],
    weight: 3,
    cond: (c) => !c.town,
    text: () => ['덤불을 헤치자 바위 아래에서 맑은 샘물이 솟고 있다.', '샘가에는 빛나는 이끼가 두텁게 자랐다.'],
    choices: [
      { label: '실컷 마신다', run: (h) => { h.hp(40); h.en(20); h.say('차가운 샘물이 목을 타고 내려가자 온몸에 기운이 돈다. (체력 +40, 기력 +20)'); } },
      { label: '샘가의 이끼를 캔다', run: (h) => { h.give('glow_moss', 2); h.say('샘물을 머금은 빛나는 이끼를 조심스럽게 떼어 냈다.'); } },
      { label: '샘물에 비친 얼굴을 들여다본다', run: (h) => { h.mind(15); h.say('물 위에 비친 눈빛이 오늘따라 차분하다. (정신 +15)'); } },
    ],
  },
  {
    id: 'human_herbalist',
    title: '약초꾼과 마주침',
    when: ['gather'],
    weight: 3,
    cond: (c) => !c.town,
    text: () => ['같은 약초밭에서 바구니를 든 인간 약초꾼과 눈이 마주쳤다.', '약초꾼은 바구니를 끌어안은 채 뒷걸음질 친다.'],
    choices: [
      { label: '약초밭을 나눠 쓴다', run: (h) => {
        h.rep(h.nearestTown(), 6); h.give('honey_salve');
        h.say('한쪽으로 비켜서자 약초꾼이 놀란 눈으로 고개를 숙이고, 답례로 꿀 고약을 놓고 갔다.');
      } },
      { label: '겁을 줘 쫓아낸다', run: (h, c) => {
        h.give(pick(['glow_moss', 'poison_herb', 'wild_honey']), 2); h.rep(h.nearestTown(), -4); if (c.stance === 'hostile') h.fame(1);
        h.say('으르렁거리자 약초꾼이 바구니를 떨어뜨리고 달아났다. 바구니의 약초는 이제 내 것이다.');
      } },
      { label: '모른 척한다', run: (h) => h.say('서로 못 본 척 각자의 약초를 캤다.') },
    ],
  },

  // ── 대륙의 재앙·입양과 엮인 일 ───────────────────
  {
    id: 'calamity_trace',
    title: '재앙이 지나간 자리',
    when: ['explore'],
    weight: 6,
    cond: (c) => !!c.bossTrace,
    setup: (c) => ({ name: c.bossTrace.name, won: c.bossTrace.won }),
    text: (c, v) => v.won
      ? [`${v.name}${c.josa(v.name, '이', '가')} 쓰러진 자리다. 땅이 깊게 패이고, 거대한 비늘 조각이 여기저기 흩어져 있다.`]
      : [`${v.name}${c.josa(v.name, '이', '가')} 휩쓸고 지나간 자리다. 부러진 나무와 갈라진 땅이 끝없이 이어진다.`],
    choices: [
      { label: '잔해를 뒤진다', run: (h, c) => {
        const loot = REGION_LOOT[c.region] || { uncommon: ['sharp_fang'] };
        const id1 = pick(loot.uncommon), id2 = Math.random() < 0.35 ? pick(loot.rare || loot.uncommon) : pick(loot.uncommon);
        const g = randInt(10, 30);
        h.give(id1); h.give(id2); h.gold(g);
        h.say(`잔해 속에서 ${ITEMS[id1].name}, ${ITEMS[id2].name}${h.josa(ITEMS[id2].name, '과', '와')} 금화 ${g}닢을 찾아냈다.`);
      } },
      { label: '고개를 숙이고 지나간다', run: (h) => { h.fame(1); h.mind(10); h.say('맞서 싸운 드래곤들을 떠올리며 잠시 머리를 숙였다. (정신 +10)'); } },
    ],
  },
  {
    id: 'old_nest_letter',
    title: '옛 둥지를 그리워하는 아이',
    when: ['wake'],
    weight: 2,
    // 한 아이가 한 번 그리워하면 MISS_GAP 동안은 다시 그리워하지 않음
    cond: (c) => c.humans.some((x) => missable(c, x)),
    setup: (c) => { const k = c.pick(c.humans.filter((x) => missable(c, x))); return { id: k.id, from: k.data.adoptedFrom, fromId: k.data.adoptedFromId }; },
    text: (c, v) => { const k = c.k(v.id); return [`${k.name}${c.josa(k.name, '이', '가')} 둥지 가장자리에 앉아 먼 하늘을 바라보고 있다.`, `"${v.from}… 잘 지낼까?"`]; },
    choices: [
      { label: '텔레파시로 소식을 전해 준다', run: (h, c, v) => {
        const k = c.k(v.id); h.bond(k, 8); k.data.missedAt = Date.now();
        h.notify(v.fromId, `${c.me}의 둥지에서 지내는 ${k.name}${c.josa(k.name, '이', '가')} 잘 지낸다는 소식이 마음에 닿았다. "보고 싶어요."`, '옛 식구의 소식');
        h.say(`${v.from}에게 ${k.name}의 소식을 전했다. ${h.name(k)} 환하게 웃었다. (유대 +8)`);
      } },
      { label: '새 둥지에 마음을 붙이게 한다', run: (h, c, v) => {
        const k = c.k(v.id); h.bond(k, 4); k.data.missedAt = Date.now();
        h.say(`날개로 감싸 안고 새 둥지의 별자리를 하나하나 알려 주었다. (유대 +4)`);
      } },
      { label: '모른 척한다', run: (h, c, v) => { const k = c.k(v.id); h.bond(k, -2); k.data.missedAt = Date.now(); h.say('아이는 한참을 혼자 앉아 있었다. (유대 −2)'); } },
    ],
  },
  // ── 동료와의 관계 ──
  {
    id: 'mentor_marks',
    title: '스승의 흔적',
    when: ['explore'],
    weight: 4,
    cond: (c) => !!c.ties.mentor,
    setup: (c) => ({ id: c.ties.mentor.id, name: c.ties.mentor.name, xp: 20 + c.level * 4 }),
    text: (c, v) => [
      `바위 벽에 깊게 패인 발톱 자국이 줄지어 있다. 스승 ${v.name}의 것이다.`,
      '자국마다 힘을 싣는 각도와 물러서는 발놀림이 그대로 남아 있다.',
    ],
    choices: [
      { label: (c, v) => `자국을 따라 수련한다 (기력 8)`, need: (c) => (c.d.en < 8 ? '기력이 모자란다.' : null), run: (h, c, v) => {
        h.en(-8); h.xp(v.xp);
        h.say(`스승의 발놀림을 하나하나 따라 해 보았다. 해가 질 무렵에는 몸이 먼저 움직였다. (경험치 +${v.xp})`);
      } },
      { label: '옆에 내 발톱 자국을 남긴다', run: (h, c, v) => {
        h.mind(8);
        h.notify(v.id, `제자 ${c.me}${h.josa(c.me, '이', '가')} ${c.regionName}의 바위 벽, 당신의 발톱 자국 옆에 자기 자국을 나란히 새겨 두었다.`, '제자의 흔적');
        h.say(`스승의 자국 옆에 내 자국을 새겼다. 언젠가 ${v.name}도 보게 될 것이다. (정신 +8)`);
      } },
      { label: '그냥 지나간다', run: (h, c, v) => h.say(`${v.name}의 자국을 한 번 쓸어 보고 날개를 폈다.`) },
    ],
  },
  {
    id: 'lover_gift',
    title: '마음에 둔 선물',
    when: ['gather'],
    weight: 4,
    cond: (c) => !!c.ties.heart,
    setup: (c) => ({ id: c.ties.heart.id, name: c.ties.heart.name, bond: c.ties.heart.bond, item: c.pick(['silver_clover', 'wild_honey', 'glow_moss', 'deep_pearl', 'gold_ore', 'heartwood']) }),
    text: (c, v) => {
      const it = ITEMS[v.item].name;
      return [`풀숲 사이에서 ${c.josa(it, '이', '가')} 반짝였다.`, `문득 ${v.name}의 얼굴이 떠오른다. ${v.bond === 'partner' ? '반려' : '연인'}에게 주면 좋아하지 않을까.`];
    },
    choices: [
      { label: (c, v) => `${v.name}에게 보낸다`, run: (h, c, v) => {
        h.send(v.id, [{ id: v.item, qty: 1 }], '오늘 찾은 거야. 네 생각이 나서.');
        h.mind(10);
        h.say(`${ITEMS[v.item].name}${h.josa(ITEMS[v.item].name, '을', '를')} 곱게 싸서 ${v.name}에게 보냈다. 생각만 해도 마음이 따뜻해진다. (정신 +10)`);
      } },
      { label: '보물더미에 간직한다', show: (c) => !!c.nest, run: (h, c, v) => {
        h.hoardGive(v.item);
        h.say(`언젠가 직접 건네려고 ${ITEMS[v.item].name}${h.josa(ITEMS[v.item].name, '을', '를')} 보물더미 깊숙이 넣어 두었다.`);
      } },
      { label: '내가 쓴다', run: (h, c, v) => { h.give(v.item); h.say(`${ITEMS[v.item].name}${h.josa(ITEMS[v.item].name, '을', '를')} 챙겼다. 조금 미안한 마음이 든다.`); } },
    ],
  },
  {
    id: 'nemesis_trap',
    title: '원수의 덫',
    when: ['explore', 'gather'],
    weight: 5,
    cond: (c) => c.ties.nemesis.some((x) => x.nest === c.region),
    setup: (c) => { const n = c.pick(c.ties.nemesis.filter((x) => x.nest === c.region)); return { id: n.id, name: n.name, dmg: 8 + c.level }; },
    text: (c, v) => [
      `발밑에서 무언가 철컥 닫혔다. ${v.name}의 영역에 깔린 덫이다.`,
      `쇠 이빨이 비늘 사이를 파고든다. (체력 −${v.dmg})`,
      `덫 주변에 ${v.name}의 냄새가 짙게 배어 있다.`,
    ],
    choices: [
      { label: '덫을 박살 내고 흔적을 남긴다', run: (h, c, v) => {
        h.hp(-v.dmg - 5); h.fame(3);
        h.notify(v.id, `${c.me}${h.josa(c.me, '이', '가')} 당신의 영역에 깔린 덫을 산산조각 내고, 그 자리에 발톱 자국을 남겼다.`, '원수');
        h.say(`덫을 물어뜯어 부수고, 보란 듯이 발톱 자국을 남겼다. ${v.name}도 알게 될 것이다. (체력 −${v.dmg + 5}, 용족 명성 +3)`);
      } },
      { label: '조용히 빠져나온다', run: (h, c, v) => {
        h.hp(-Math.ceil(v.dmg / 2));
        h.say(`이를 악물고 덫을 벌려 다리를 빼냈다. 상처가 덜 벌어졌다. (체력 −${Math.ceil(v.dmg / 2)})`);
      } },
      { label: '부서진 쇠붙이를 챙긴다', run: (h, c, v) => {
        h.hp(-v.dmg); h.give('bog_iron', 2);
        h.say(`덫을 뜯어내 쓸 만한 쇠붙이를 챙겼다. 원수의 물건이라도 쇠는 쇠다. (체력 −${v.dmg}, 늪철 2개)`);
      } },
    ],
  },
  {
    id: 'departed_news',
    title: '바람에 실려 온 소식',
    when: ['explore', 'wake'],
    weight: 3,
    cond: (c) => c.ties.departed.length > 0,
    setup: (c) => { const x = c.pick(c.ties.departed); return { name: x.name, words: x.words, heir: !!x.heir, id: x.id }; },
    text: (c, v) => [
      `먼 하늘에서 낯익은 바람이 불어왔다. ${v.heir ? '내게 의지를 물려준 ' : '먼 여행을 떠난 '}${v.name}의 냄새가 실려 있다.`,
      v.words ? `바람 속에서 그 말이 다시 들리는 듯하다. "${v.words}"` : '아무 말도 없지만, 어딘가에서 잘 지내고 있다는 것만은 알 수 있었다.',
    ],
    choices: [
      { label: '바람에 대고 답한다', run: (h, c, v) => {
        h.mind(15);
        h.say(`"나도 잘 지내고 있어." 바람은 그 말을 싣고 ${v.name}에게로 흘러갔다. (정신 +15)`);
      } },
      { label: '바람이 떨어뜨린 것을 줍는다', run: (h, c, v) => {
        const id = Math.random() < 0.35 ? 'ancient_relic' : pick(['silver_clover', 'rune_stone', 'old_scroll', 'travel_map']);
        h.give(id);
        h.say(`바람이 지나간 자리에 ${ITEMS[id].name}${h.josa(ITEMS[id].name, '이', '가')} 놓여 있었다. 먼 곳에서 보낸 선물 같다.`);
      } },
    ],
  },

  // ── 식구: 입양 보낸 아이, 여럿의 다툼, 독립 ──
  {
    id: 'adopted_letter',
    title: '먼 둥지에서 온 안부',
    when: ['wake', 'explore'],
    weight: 4,
    cond: (c) => c.ties.adoptedOut.some((x) => x.status === 'home'),
    setup: (c) => { const k = c.pick(c.ties.adoptedOut.filter((x) => x.status === 'home')); return { name: k.name, type: k.type, owner: k.owner, ownerId: k.owner_id, stage: c.stage(k) }; },
    text: (c, v) => v.type === 'human'
      ? [`${v.owner}의 둥지로 보낸 ${v.name}에게서 편지가 왔다.`, `삐뚤빼뚤한 글씨로 "잘 먹고 잘 자요. 가끔 보고 싶어요." 라고 적혀 있다. 어느새 '${v.stage}'${c.josa(v.stage, '이', '가')} 되었다고 한다.`]
      : [`${v.owner}의 둥지로 보낸 ${v.name}${c.josa(v.name, '이', '가')} 반짝이는 비늘 한 조각을 바람에 실어 보냈다.`, `벌써 '${v.stage}'${c.josa(v.stage, '이', '가')} 되었다고 한다. 비늘에서 익숙한 온기가 느껴진다.`],
    choices: [
      { label: '답장을 보낸다', run: (h, c, v) => {
        h.mind(10);
        h.notify(v.ownerId, `${c.me}${h.josa(c.me, '이', '가')} ${v.name}에게 답장을 보내왔다. "잘 지내라. 언제나 응원하고 있다."`, '먼 둥지의 안부');
        h.say(`${v.name}에게 짧은 답장을 써서 ${v.owner}의 둥지로 보냈다. (정신 +10)`);
      } },
      { label: '소중히 간직한다', run: (h, c, v) => {
        h.mind(5);
        if (c.nest) h.keep('far_letter', v.name, v.type === 'human' ? '잘 먹고 잘 자요. 가끔 보고 싶어요.' : ''); else h.give('kin_letter');
        h.say(`${v.type === 'human' ? '편지를' : '비늘을'} ${c.nest ? '보물 상자에 넣고 잠갔다' : '품속 깊이 넣어 두었다'}. (정신 +5, 먼 둥지의 편지)`);
      } },
    ],
  },
  {
    id: 'kin_squabble',
    title: '셋이 모이면',
    when: ['wake', 'explore'],
    weight: 3,
    cond: (c) => c.grown.length >= 3,
    setup: (c) => { const [a, b, m] = [...c.grown].sort(() => Math.random() - 0.5); return { a: a.id, b: b.id, m: m.id, what: c.pick(['둥지의 가장 높은 자리', '마지막 남은 꿀단지', '반짝이는 조약돌', '이야기를 먼저 들을 차례']) }; },
    text: (c, v) => {
      const a = c.k(v.a), b = c.k(v.b), m = c.k(v.m);
      return [`${a.name}${c.josa(a.name, '과', '와')} ${b.name}${c.josa(b.name, '이', '가')} ${v.what}${c.josa(v.what, '을', '를')} 두고 다투고 있다.`, `${m.name}${c.josa(m.name, '은', '는')} 어쩔 줄 몰라 둘 사이를 오간다. 모두의 눈이 나를 향했다.`];
    },
    choices: [
      { label: (c, v) => `${c.k(v.a).name} 편을 든다`, run: (h, c, v) => {
        const a = c.k(v.a), b = c.k(v.b);
        h.bond(a, 8); h.bond(b, -6);
        if (a.type === 'drake') h.nudge(a, 'hostile', 1); else h.lean(a, 'guard', 2);
        h.say(`${h.name(a)} 의기양양하게 꼬리를 세웠다. ${b.name}${h.josa(b.name, '은', '는')} 구석에서 토라졌다. (${a.name} 유대 +8, ${b.name} 유대 −6)`);
      } },
      { label: (c, v) => `${c.k(v.b).name} 편을 든다`, run: (h, c, v) => {
        const a = c.k(v.a), b = c.k(v.b);
        h.bond(b, 8); h.bond(a, -6);
        if (b.type === 'drake') h.nudge(b, 'hostile', 1); else h.lean(b, 'guard', 2);
        h.say(`${h.name(b)} 의기양양하게 가슴을 폈다. ${a.name}${h.josa(a.name, '은', '는')} 구석에서 토라졌다. (${b.name} 유대 +8, ${a.name} 유대 −6)`);
      } },
      { label: (c, v) => `${c.k(v.m).name}에게 정하게 한다`, run: (h, c, v) => {
        const a = c.k(v.a), b = c.k(v.b), m = c.k(v.m);
        h.bond(m, 6); h.bond(a, 2); h.bond(b, 2);
        if (m.type === 'drake') h.nudge(m, 'friendly', 1); else h.lean(m, 'herbalist', 2);
        h.say(`${h.name(m)} 한참 고민하더니 똑같이 나누자고 했다. 둘은 머쓱하게 웃었다. (${m.name} 유대 +6, 둘 유대 +2)`);
      } },
      { label: '셋을 모아 화해시킨다 (기력 6)', tone: 'warm', need: (c) => (c.d.en < 6 ? '기력이 모자란다.' : null), run: (h, c, v) => {
        const a = c.k(v.a), b = c.k(v.b), m = c.k(v.m);
        h.en(-6); h.mind(5);
        for (const k of [a, b, m]) h.bond(k, 4);
        h.say('셋을 날개 아래 모아 놓고 오래된 이야기를 들려주었다. 이야기가 끝날 즈음엔 서로 기대어 잠들어 있었다. (모두 유대 +4, 정신 +5)');
      } },
    ],
  },
  {
    id: 'kin_leaving',
    title: '둥지를 떠나고 싶은 마음',
    when: ['wake'],
    weight: 4,
    // 갈 길을 정한 어른 인간, 또는 독립할 때가 된 새끼. 한 번 붙잡으면 이틀은 다시 묻지 않음
    cond: (c) => c.grown.some((k) => !k.data.onExp && (!k.data.stayAsk || c.now - k.data.stayAsk > 2 * 864e5)
      && (k.type === 'human' ? !!k.data.path && c.age(k) >= 11 : c.age(k) >= 18)),
    setup: (c) => ({ id: c.pick(c.grown.filter((k) => !k.data.onExp && (!k.data.stayAsk || c.now - k.data.stayAsk > 2 * 864e5)
      && (k.type === 'human' ? !!k.data.path && c.age(k) >= 11 : c.age(k) >= 18))).id }),
    text: (c, v) => {
      const k = c.k(v.id);
      return k.type === 'human'
        ? [`${k.name}${c.josa(k.name, '이', '가')} 둥지 입구에 앉아 멀리 인간 마을의 불빛을 바라보고 있다.`, '"이제… 저도 저 아래에서 제 힘으로 살아 보고 싶어요."']
        : [`${k.name}${c.josa(k.name, '이', '가')} 둥지 끝에 서서 날개를 활짝 편 채 먼 하늘을 바라보고 있다.`, '이제 이 둥지는 그 날개에 비해 너무 작아 보인다.'];
    },
    choices: [
      { label: '등을 떠밀어 보내 준다', tone: 'trust', run: (h, c, v) => {
        const k = c.k(v.id);
        if (k.type === 'drake') h.free(k);
        else {
          const t = k.data.town || h.nearestTown();
          h.rep(t, 15); h.fame(2); h.leave(k, 'returned');
          h.say(`${h.name(k)} 몇 번이고 뒤돌아보며 손을 흔들었다. ${REGIONS[t].name}에서 새 삶을 꾸릴 것이다.`, `${REGIONS[t].name} 평판 +15, 용족 명성 +2`);
        }
        h.mind(8); h.count('sendoff');
        h.say('둥지가 조금 넓어졌다. 허전하지만 자랑스럽다. (정신 +8)');
      } },
      { label: '조금만 더 곁에 있어 달라고 한다', tone: 'warm', run: (h, c, v) => {
        const k = c.k(v.id);
        k.data.stayAsk = c.now; h.bond(k, 8); h.mind(4);
        h.say(`${h.name(k)} 잠시 망설이다 고개를 끄덕였다. "조금만 더요." (유대 +8, 정신 +4)`);
      } },
    ],
  },

  // ── 밤하늘과 안개 ──
  {
    id: 'meteor_shower',
    title: '유성우의 밤',
    when: ['explore', 'wake'],
    weight: 5,
    cond: (c) => c.weather === 'clear' && (c.hour >= 20 || c.hour < 5),
    text: () => ['맑은 밤하늘에 별똥별이 쏟아지기 시작했다.', '하나, 둘… 셀 수 없이 많은 빛줄기가 지평선 너머로 떨어진다.'],
    choices: [
      { label: '떨어진 별조각을 찾아 나선다 (기력 6)', need: (c) => (c.d.en < 6 ? '기력이 모자란다.' : null), run: (h, c) => {
        h.en(-6);
        if (Math.random() < 0.65) { h.give('star_shard'); h.say('식어 가는 구덩이 한가운데서 희미하게 빛나는 별조각을 찾았다. (별조각)'); }
        else { h.give('rune_stone'); h.say('밤새 헤맸지만 찾은 건 그을린 돌멩이뿐이었다. 그래도 하늘은 아름다웠다.'); }
      } },
      { label: '소원을 빈다', run: (h, c) => {
        const r = Math.random();
        if (r < 0.4) { h.mind(20); h.say('조용히 눈을 감고 소원을 빌었다. 마음이 맑게 갠다. (정신 +20)'); }
        else if (r < 0.7) { h.buff('lucky', 60); h.say('별똥별 하나가 유난히 가까이 떨어졌다. 좋은 일이 생길 것 같다. (행운 60분)'); }
        else { h.hp(30); h.en(15); h.say('별빛을 받으며 소원을 빌자 몸 깊은 곳까지 따뜻해졌다. (체력 +30, 기력 +15)'); }
      } },
      { label: (c) => `${c.ties.heart?.name || '연인'}에게 함께 보자고 한다`, show: (c) => !!c.ties.heart, run: (h, c) => {
        const t = c.ties.heart;
        h.mind(15);
        h.notify(t.id, `${c.me}${h.josa(c.me, '이', '가')} ${c.regionName}의 밤하늘에 유성우가 쏟아진다며, 같이 보고 싶다고 전해 왔다.`, '유성우의 밤');
        h.say(`${t.name}에게 별이 쏟아진다고 전했다. 같은 하늘 아래 있다는 것만으로도 충분하다. (정신 +15)`);
      } },
    ],
  },
  {
    id: 'fog_merchant',
    title: '안개 속의 상인',
    when: ['explore'],
    weight: 5,
    cond: (c) => c.weather === 'fog',
    setup: () => {
      const id = pick(['ancient_relic', 'eternal_ice', 'heartwood', 'bog_pearl', 'sun_stone', 'deep_pearl', 'fire_crystal', 'star_shard']);
      return { item: id, price: Math.round(ITEMS[id].value * (0.5 + Math.random() * 0.4)), fake: Math.random() < 0.3 };
    },
    text: (c, v) => [
      '짙은 안개 속에서 등불 하나가 흔들리며 다가왔다. 얼굴이 보이지 않는 상인이다.',
      `"귀한 ${ITEMS[v.item].name}${c.josa(ITEMS[v.item].name, '이', '가')} 있소. 금화 ${v.price}닢이면 드리지. …아니면, 금화 대신 기억 한 조각을 주시겠소?"`,
    ],
    choices: [
      { label: (c, v) => `금화 ${v.price}닢에 산다`, need: (c, v) => (c.d.gold < v.price ? '금화가 모자란다.' : null), run: (h, c, v) => {
        h.gold(-v.price);
        if (v.fake) { h.give('rune_stone'); h.say('물건을 받아 드는 순간 안개가 걷혔다. 손에 남은 것은 평범한 돌멩이였다. 상인은 어디에도 없다.'); }
        else { h.give(v.item); h.say(`금화를 건네자 상인은 ${ITEMS[v.item].name}${h.josa(ITEMS[v.item].name, '을', '를')} 내밀고 안개 속으로 사라졌다.`); }
      } },
      { label: '기억 한 조각을 내준다 (정신 −20)', need: (c) => ((c.d.mind ?? 100) < 25 ? '정신이 너무 흐려 내줄 기억이 없다.' : null), run: (h, c, v) => {
        h.mind(-20); h.give(v.item);
        h.say(`상인이 이마에 손을 얹자, 어떤 하루가 통째로 흐릿해졌다. 손에는 진짜 ${ITEMS[v.item].name}${h.josa(ITEMS[v.item].name, '이', '가')} 들려 있었다. (정신 −20)`);
      } },
      { label: '등불을 피해 지나간다', run: (h) => h.say('등불은 한동안 뒤를 따라오다가, 안개 속으로 스르르 꺼졌다.') },
    ],
  },
  // ── 식구: 자라는 순간들 ──
  {
    id: 'egg_stir',
    title: '알 속의 두근거림',
    when: ['wake'],
    weight: 5,
    cond: (c) => c.eggs.some((x) => x.data.incubateAt && !x.data.stirred),
    setup: (c) => { const k = c.pick(c.eggs.filter((x) => x.data.incubateAt && !x.data.stirred)); return { id: k.id, need: KIN.eggNeeds[k.data.kind], stat: bestStat(k.data.kind) }; },
    text: (c, v) => { const k = c.k(v.id); return [`품고 있던 ${KINDS[k.data.kind].name}의 알이 톡, 톡 흔들렸다.`, '껍질 너머에서 작은 심장 소리가 들린다. 곧 세상에 나올 모양이다.']; },
    choices: [
      { label: '노래를 불러 준다', run: (h, c, v) => {
        const k = c.k(v.id); k.data.stirred = true; k.data.preBond = 15;
        h.mind(5);
        h.say('낮게 울리는 용의 노래를 불러 주자, 흔들림이 잦아들며 알이 따뜻해졌다.', '깨어나면 처음부터 나를 잘 따를 것이다. (깨어날 때 유대 +15, 정신 +5)');
      } },
      { label: (c, v) => `${ITEMS[v.need].name}${c.josa(ITEMS[v.need].name, '을', '를')} 곁에 더 놓아 준다`, need: (c, v) => (c.have(v.need) < 1 ? `${ITEMS[v.need].name}${c.josa(ITEMS[v.need].name, '이', '가')} 없다.` : null), run: (h, c, v) => {
        const k = c.k(v.id); k.data.stirred = true; k.data.preStat = v.stat;
        h.take(v.need);
        h.say(`${ITEMS[v.need].name}의 기운이 껍질 속으로 스며들었다.`, `깨어나면 ${statName(v.stat)}${h.josa(statName(v.stat), '이', '가')} 남다를 것이다. (깨어날 때 ${statName(v.stat)} +1)`);
      } },
      { label: '조용히 지켜본다', run: (h, c, v) => { c.k(v.id).data.stirred = true; h.say('알은 한참 흔들리다 다시 잠잠해졌다.'); } },
    ],
  },
  {
    id: 'hatchling_spark',
    title: '해츨링의 첫 불씨',
    when: ['wake', 'explore'],
    weight: 4,
    cond: (c) => !!c.nest && c.drakes.some((x) => c.stage(x) === '해츨링' && !x.data.sparked),
    setup: (c) => ({ id: c.pick(c.drakes.filter((x) => c.stage(x) === '해츨링' && !x.data.sparked)).id }),
    text: (c, v) => { const k = c.k(v.id); return [`${k.name}${c.josa(k.name, '이', '가')} 에취! 하고 재채기를 하자 작은 불씨가 튀었다.`, '불씨가 보물더미 위로 떨어져 금화 몇 닢이 그을렸다. 새끼는 놀라 눈만 끔뻑인다.']; },
    choices: [
      { label: '웃어넘긴다', tone: 'free', run: (h, c, v) => { const k = c.k(v.id); k.data.sparked = true; h.bond(k, 6); h.say(`${h.name(k)} 안심한 듯 꼬리를 흔들며 품으로 파고들었다. (유대 +6)`); } },
      { label: '숨결 다루는 법을 가르친다', tone: 'strict', run: (h, c, v) => {
        const k = c.k(v.id); k.data.sparked = true; h.train(k, 'wisdom'); h.bond(k, -2);
        h.say(`숨을 고르고 불씨를 모으는 법을 엄하게 가르쳤다. ${h.name(k)} 시무룩하지만 제법 따라 한다. (지혜 +1, 유대 −2)`);
      } },
    ],
  },
  {
    id: 'first_word',
    title: '첫 마디',
    when: ['wake'],
    weight: 5,
    cond: (c) => c.humans.some((x) => c.stage(x) === '아기' && !x.data.firstWord),
    setup: (c) => ({ id: c.pick(c.humans.filter((x) => c.stage(x) === '아기' && !x.data.firstWord)).id }),
    text: (c, v) => { const k = c.k(v.id); return [`${k.name}${c.josa(k.name, '이', '가')} 옹알이를 하다 나를 똑바로 올려다보았다.`, '작은 입술이 달싹인다. 무언가 말하려는 것 같다. 어떤 말을 들려줄까?']; },
    choices: [
      { label: '"꽃"을 들려준다', run: (h, c, v) => { const k = c.k(v.id); k.data.firstWord = '꽃'; h.bond(k, 6); h.lean(k, 'herbalist', 2); h.say(`"꼬…꽃!" ${h.name(k)} 둥지 가장자리의 들꽃을 가리키며 까르르 웃었다. (유대 +6, 약초꾼 쪽으로)`); } },
      { label: '"불"을 들려준다', run: (h, c, v) => { const k = c.k(v.id); k.data.firstWord = '불'; h.bond(k, 6); h.lean(k, 'smith', 2); h.say(`"부…불!" ${h.name(k)} 내 숨결의 불빛을 보며 손뼉을 쳤다. (유대 +6, 대장장이 쪽으로)`); } },
      { label: '"용"을 들려준다', run: (h, c, v) => { const k = c.k(v.id); k.data.firstWord = '용'; h.bond(k, 8); h.lean(k, 'guard', 2); h.say(`"요…용!" ${h.name(k)} 내 발톱을 꼭 붙잡았다. 처음 한 말이 나라니. (유대 +8, 파수꾼 쪽으로)`); } },
    ],
  },
  {
    id: 'nightmare',
    title: '악몽 꾸는 밤',
    when: ['wake'],
    weight: 5,
    cond: (c) => (c.hour >= 21 || c.hour < 5) && c.humans.some((x) => ['아이', '소년'].includes(c.stage(x))),
    setup: (c) => ({ id: c.pick(c.humans.filter((x) => ['아이', '소년'].includes(c.stage(x)))).id }),
    text: (c, v) => { const k = c.k(v.id); return [`한밤중, ${k.name}${c.josa(k.name, '이', '가')} 울먹이며 잠에서 깼다.`, '"무서운 꿈을 꿨어요… 커다란 그림자가 쫓아왔어요."']; },
    choices: [
      { label: '날개로 감싸고 자장가를 불러 준다', tone: 'warm', run: (h, c, v) => { const k = c.k(v.id); h.bond(k, 7); h.mind(8); h.say(`날개 아래에서 노래를 듣던 ${h.name(k)} 이내 새근새근 잠들었다. 나도 마음이 편안해진다. (유대 +7, 정신 +8)`); } },
      { label: '그림자를 쫓아내는 이야기를 해 준다', tone: 'warm', run: (h, c, v) => { const k = c.k(v.id); h.bond(k, 5); h.lean(k, 'guard', 2); h.say(`"그림자가 오면 내가 불을 뿜어 줄게." ${h.name(k)} 주먹을 꼭 쥐고 다시 누웠다. (유대 +5, 파수꾼 쪽으로)`); } },
      { label: '혼자 이겨 내도록 둔다', tone: 'trust', run: (h, c, v) => { const k = c.k(v.id); h.bond(k, -2); h.lean(k, 'guard', 1); h.say(`${h.name(k)} 한참을 뒤척이다 혼자 잠들었다. 조금 더 단단해졌을지도 모른다. (유대 −2)`); } },
    ],
  },
  {
    id: 'runaway_kid',
    title: '사라진 아이',
    when: ['wake'],
    weight: 4,
    cond: (c) => c.humans.some((x) => c.stage(x) === '소년' && !x.data.onExp && ready(x.data.ranAt, D3)),
    setup: (c) => ({ id: c.pick(c.humans.filter((x) => c.stage(x) === '소년' && !x.data.onExp && ready(x.data.ranAt, D3))).id }),
    text: (c, v) => { const k = c.k(v.id); return [`깨어나 보니 ${k.name}의 자리가 비어 있다.`, '둥지 밖으로 작은 발자국이 이어진다. 한쪽은 숲으로, 한쪽은 마을 쪽으로 흐려져 있다.']; },
    choices: [
      { label: '숲 쪽을 찾아본다 (기력 8)', tone: 'warm', need: (c) => (c.d.en < 8 ? '기력이 모자란다.' : null), run: (h, c, v) => {
        const k = c.k(v.id); k.data.ranAt = c.now; h.en(-8); h.bond(k, 8); h.lean(k, 'guard', 2);
        h.say(`덤불 속 커다란 바위 위에서 ${h.name(k)} 막대기를 들고 '용사 놀이'를 하고 있었다. 혼날 줄 알고 움찔했지만, 등에 태워 돌아오는 내내 신이 나 있었다. (유대 +8, 파수꾼 쪽으로)`);
      } },
      { label: '마을 쪽을 찾아본다 (기력 8)', tone: 'warm', need: (c) => (c.d.en < 8 ? '기력이 모자란다.' : null), run: (h, c, v) => {
        const k = c.k(v.id); k.data.ranAt = c.now; h.en(-8); h.bond(k, 6); h.lean(k, 'herbalist', 2);
        const t = h.nearestTown(); h.rep(t, 3);
        h.say(`마을 어귀 약초 가게 앞에서 ${h.name(k)} 할머니에게 풀 이름을 배우고 있었다. 할머니는 아이를 잘 키웠다며 고개를 숙였다. (유대 +6, 약초꾼 쪽으로, ${REGIONS[t].name} 평판 +3)`);
      } },
      { label: '돌아올 때까지 기다린다', tone: 'trust', run: (h, c, v) => {
        const k = c.k(v.id); k.data.ranAt = c.now;
        if (Math.random() < 0.6) { h.give('brass_button'); h.bond(k, 2); h.say(`해 질 녘, ${h.name(k)} 주머니 가득 반짝이는 단추를 들고 돌아왔다. "선물이에요!" (유대 +2, 낡은 놋쇠 단추)`); }
        else { h.bond(k, -5); h.say(`밤이 깊어서야 ${h.name(k)} 무릎이 까진 채 절뚝이며 돌아왔다. 왜 찾으러 오지 않았냐는 눈빛이다. (유대 −5)`); }
      } },
    ],
  },
  {
    id: 'first_love',
    title: '아이의 첫사랑',
    when: ['wake', 'explore'],
    weight: 3,
    // 아이마다 한 번: 세 선택지 모두 그 아이의 firstLove를 남기므로, 한 번 고르면 다시 뜨지 않음
    cond: (c) => c.humans.some((x) => c.stage(x) === '청소년' && !x.data.firstLove),
    // 다른 둥지에 사는 인간 단짝이 있으면 그 아이가 첫사랑 (가장 많이 만난 단짝). 없으면 마을 아이
    setup: (c) => {
      const k = c.pick(c.humans.filter((x) => c.stage(x) === '청소년' && !x.data.firstLove));
      const fe = Object.entries(k.data.friends || {}).filter(([, x]) => x.type === 'human' && x.n >= KIN_PLAY.friendAt).sort(([, p], [, q]) => q.n - p.n)[0];
      if (!fe) return { id: k.id, other: c.pick(['리라', '한별', '에린', '도윤', '마루', '시아']) };
      const [key, f] = fe, kid = Number(String(key).split(':')[1]); // 단짝 기록의 열쇠: '둥지 주인 id:아이 id'
      const ref = { owner: f.ownerId, id: kid, name: f.name, ownerName: f.owner };
      const kl = require('./game-logic').hooks.kinLove;
      return { id: k.id, other: f.name, owner: f.owner, oid: f.ownerId, ref, back: !!(kl && kid && kl.lovesBack(c.d.id, k.id, ref)) }; // back: 그 아이도 이미 이 아이를 좋아함
    },
    text: (c, v) => {
      const k = c.k(v.id);
      if (v.oid) return [`요즘 ${k.name}${c.josa(k.name, '이', '가')} ${v.owner}의 둥지에 놀러 갈 때마다 옷매무새를 몇 번이나 고친다.`, `단짝 ${v.other}${c.josa(v.other, '을', '를')} 좋아하는 것 같다. 눈치챈 걸 알자 얼굴이 새빨개졌다.`];
      return [`요즘 ${k.name}${c.josa(k.name, '이', '가')} 자꾸 마을 쪽 하늘만 바라본다.`, `마을에 사는 ${v.other}${c.josa(v.other, '과', '와')} 강가에서 몰래 만난다는 걸 알게 되었다. 들킨 줄 알자 얼굴이 새빨개졌다.`];
    },
    choices: [
      { label: '만나러 가도 된다고 한다', tone: 'trust', run: (h, c, v) => {
        const k = c.k(v.id); k.data.firstLove = v.other;
        if (v.oid) { // 다른 둥지의 단짝: 그 아이의 보호자에게도 소식
          if (v.ref) k.data.loveRef = v.ref;
          h.bond(k, 8);
          h.say(`${h.name(k)} 환하게 웃으며 ${v.owner}의 둥지 쪽으로 날듯이 달려갔다. (유대 +8)`);
          if (v.back) h.say(`알고 보니 ${v.other}${h.josa(v.other, '도', '도')} ${k.name}${h.josa(k.name, '을', '를')} 좋아하고 있었다. 두 아이는 서로의 첫사랑이다.`);
          h.notify(v.oid, `${c.me}의 둥지에 사는 ${k.name}${h.josa(k.name, '이', '가')} 당신의 둥지 ${v.other}${h.josa(v.other, '을', '를')} 좋아하는 것 같다. ${c.me}${h.josa(c.me, '은', '는')} 두 아이를 응원하기로 했다.${v.back ? ' 두 아이는 서로의 첫사랑이다.' : ''}`, '둥지 소식');
          return;
        }
        const t = k.data.town || h.nearestTown();
        h.bond(k, 8); h.rep(t, 8);
        h.say(`${h.name(k)} 환하게 웃으며 마을로 달려갔다. 용이 키운 아이가 착하다는 소문이 ${REGIONS[t].name}에 돌았다. (유대 +8, ${REGIONS[t].name} 평판 +8)`);
      } },
      { label: '직접 만나 보겠다고 한다', tone: 'warm', run: (h, c, v) => {
        const k = c.k(v.id); k.data.firstLove = v.other;
        if (v.oid) {
          if (v.ref) k.data.loveRef = v.ref;
          h.bond(k, 3); h.fame(1);
          if (v.back) h.say(`돌아오는 길에 들으니, ${v.other}${h.josa(v.other, '도', '도')} ${k.name}${h.josa(k.name, '을', '를')} 좋아하고 있었다고 한다. 두 아이는 서로의 첫사랑이다.`);
          h.say(`직접 ${v.owner}의 둥지를 찾아갔다. ${v.other}${h.josa(v.other, '은', '는')} 수줍게 인사하고는 ${k.name} 뒤로 쏙 숨었다. (유대 +3, 명성 +1)`);
          h.notify(v.oid, `${c.me}${h.josa(c.me, '이', '가')} 당신의 둥지를 찾아와 ${v.other}에게 인사를 건넸다. ${c.me}의 둥지 ${k.name}${h.josa(k.name, '이', '가')} ${v.other}${h.josa(v.other, '을', '를')} 좋아하는 것 같다.`, '둥지 소식');
          return;
        }
        const t = k.data.town || h.nearestTown();
        h.bond(k, 3); h.rep(t, 3); h.fame(1);
        h.say(`강가에 내려앉자 ${v.other}${h.josa(v.other, '은', '는')} 하얗게 질렸다가, 떨리는 목소리로 인사를 건넸다. 제법 용감한 아이다. (유대 +3, 평판 +3, 명성 +1)`);
      } },
      { label: '만나지 말라고 한다', tone: 'strict', run: (h, c, v) => {
        const k = c.k(v.id); k.data.firstLove = '-'; h.bond(k, -8);
        h.say(`${h.name(k)} 아무 말 없이 등을 돌렸다. 며칠 동안 눈을 마주치지 않을 것 같다. (유대 −8)`);
      } },
    ],
  },
  {
    id: 'kin_heartbreak',
    title: '첫사랑의 끝',
    when: ['wake', 'explore'],
    weight: 6,
    cond: (c) => c.humans.some((x) => !x.data.onExp && heartOf(c, x)),
    setup: (c) => { const k = c.pick(c.humans.filter((x) => !x.data.onExp && heartOf(c, x))); return { id: k.id, ...heartOf(c, k) }; },
    text: (c, v) => {
      const k = c.k(v.id), n = v.name || '그 아이';
      const why = {
        declined: `${v.home ? `${v.home}의 둥지에서` : '상대 둥지에서'} 혼인을 사양한다는 답이 온 날이다.`,
        mated: `${n}${c.josa(n, '이', '가')} 다른 사람과 맺어졌다는 소식을 들은 모양이다.`,
        else: `${n}에게는 따로 마음에 둔 사람이 있다는 걸 알게 된 모양이다.`,
        gone: `${n}${c.josa(n, '이', '가')} 먼 곳으로 떠나 다시는 만날 수 없게 되었다고 한다.`,
      }[v.why] || '';
      const grown = c.stage(k) !== '청소년';
      return [`${k.name}${c.josa(k.name, '이', '가')} 둥지 구석에 웅크린 채 저녁도 먹지 않았다. ${why}`, grown ? '아무렇지 않은 척 웃어 보이지만, 손끝이 떨리고 있다.' : '눈가가 붉게 부어 있다. 말을 걸어도 고개만 저을 뿐이다.'];
    },
    choices: [
      { label: '곁에 앉아 이야기를 들어 준다', tone: 'warm', run: (h, c, v) => {
        const k = c.k(v.id); heartEnd(k, c); h.bond(k, 8);
        h.say(`말없이 곁에 앉아 날개를 내려 주었다. 한참 뒤에야 ${h.name(k)} ${v.name || '그 아이'} 이야기를 띄엄띄엄 꺼냈다. 다 털어놓고 나서야 조금 웃었다. (유대 +8)`);
        heartDiary(h, k, `첫사랑과 이어지지 못한 날, ${c.callOf(k)}${c.josa(c.callOf(k), '이', '가')} 곁에서 밤새 이야기를 들어 주었다.`);
      } },
      { label: '바람을 쐬러 함께 날아간다', tone: 'trust', run: (h, c, v) => {
        const k = c.k(v.id); heartEnd(k, c); h.bond(k, 6); h.mind(5);
        h.say(`${k.name}${h.josa(k.name, '을', '를')} 등에 태우고 구름 위까지 날아올랐다. 차가운 바람에 눈물이 다 말랐는지, 내려올 즈음엔 "다음엔 더 멋진 사람을 만날 거예요" 하고 큰 소리로 외쳤다. (유대 +6, 정신 +5)`);
        heartDiary(h, k, `첫사랑과 이어지지 못한 날, ${c.callOf(k)}${c.josa(c.callOf(k), '과', '와')} 구름 위까지 날아올라 소리쳐 울었다.`);
      } },
      { label: '혼자 있게 둔다', tone: 'free', run: (h, c, v) => {
        const k = c.k(v.id); heartEnd(k, c); h.bond(k, 2);
        h.say(`조용히 자리를 비켜 주었다. 다음 날 아침, ${h.name(k)} 먼저 다가와 작게 "고마워요" 하고는 평소처럼 아침을 먹었다. (유대 +2)`);
        heartDiary(h, k, '첫사랑을 마음에 묻었다. 하룻밤 혼자 울고 나니 조금 어른이 된 것 같다.');
      } },
    ],
  },
  {
    id: 'talent_show',
    title: '재주 자랑',
    when: ['wake'],
    weight: 4,
    cond: (c) => c.humans.some((x) => x.data.talent && !x.data.onExp && ready(x.data.showAt, D3)),
    setup: (c) => {
      const k = c.pick(c.humans.filter((x) => x.data.talent && !x.data.onExp && ready(x.data.showAt, D3)));
      const item = { herbalist: pick(['silver_clover', 'glow_moss', 'honey_salve']), smith: pick(['fang_necklace', 'rune_charm', 'scout_knot', 'horn_tailring']), guard: 'thorn_trap' }[k.data.talent];
      return { id: k.id, item };
    },
    text: (c, v) => {
      const k = c.k(v.id), it = ITEMS[v.item].name;
      return {
        herbalist: [`${k.name}${c.josa(k.name, '이', '가')} 이슬 젖은 바구니를 들고 돌아왔다.`, `"새벽에 산 너머까지 다녀왔어요!" 바구니 맨 위에 ${it}${c.josa(it, '이', '가')} 놓여 있다.`],
        smith: [`${k.name}${c.josa(k.name, '이', '가')} 그을음투성이 얼굴로 무언가를 내밀었다.`, `"밤새 두드려 만들었어요. 받아 주실래요?" 손에 ${it}${c.josa(it, '이', '가')} 들려 있다.`],
        guard: [`${k.name}${c.josa(k.name, '이', '가')} 둥지 아래 길목을 가리켰다.`, '"어젯밤 수상한 놈들이 기웃거리길래 쫓아냈어요. 다시는 못 오게 가시 덫도 하나 만들어 뒀어요."'],
      }[k.data.talent];
    },
    choices: [
      { label: '크게 칭찬하고 받는다', tone: 'warm', run: (h, c, v) => {
        const k = c.k(v.id); k.data.showAt = c.now; h.bond(k, 6); h.give(v.item);
        h.say(`${h.name(k)} 어깨를 으쓱하며 뿌듯해했다. (유대 +6, ${ITEMS[v.item].name})`);
      } },
      { label: '마을에 내다 팔게 한다', tone: 'trust', run: (h, c, v) => {
        const k = c.k(v.id); k.data.showAt = c.now; const g = Math.max(8, Math.round(ITEMS[v.item].value * 0.8)); const t = k.data.town || h.nearestTown();
        h.gold(g); h.rep(t, 3); h.bond(k, 2);
        h.say(`${h.name(k)} 마을에서 제값을 받아 왔다. 솜씨 좋은 아이라는 칭찬도 함께. (금화 +${g}, ${REGIONS[t].name} 평판 +3, 유대 +2)`);
      } },
    ],
  },
  // ── 짝을 만남 · 아이가 태어남 · 자손의 인사 ──
  {
    id: 'kin_partner',
    title: '함께 살고 싶은 사람',
    when: ['wake'],
    weight: 4,
    cond: (c) => c.humans.some((x) => adultHuman(c, x) && canMate(c, x) && !loveWaits(c, x)),
    setup: (c) => {
      const k = c.pick(c.humans.filter((x) => adultHuman(c, x) && canMate(c, x) && !loveWaits(c, x)));
      // 다른 둥지의 서로의 첫사랑이 어른이 되어 짝 없이 있으면: 그 아이와 맺어지기를 청함
      const ls = loveOf(c, k);
      if (ls && ls.mutual && ls.adult && ls.free && !ls.pending) return { id: k.id, partner: ls.name, home: ls.ownerName, mutual: true };
      // 마을 아이가 첫사랑이었으면 그 사람 (다른 둥지 아이를 좋아했지만 맺어질 수 없으면 새로 만난 사람)
      const friendLove = Object.values(k.data.friends || {}).some((x) => x.type === 'human' && x.name === k.data.firstLove); // 예전 기록인데 첫사랑이 다른 둥지 단짝이었으면 마을 사람으로 쓰지 않음
      const love = !k.data.loveRef && !friendLove && k.data.firstLove && k.data.firstLove !== '-' ? k.data.firstLove : null;
      return { id: k.id, partner: love || c.pick(PARTNER_NAMES), love: !!love };
    },
    text: (c, v) => {
      const k = c.k(v.id);
      if (v.mutual) return [`${k.name}${c.josa(k.name, '이', '가')} 쭈뼛거리며 둥지 앞에 섰다. 어릴 적부터 ${v.home}의 둥지에 놀러 갈 때마다 함께 뛰놀던 단짝, ${v.partner}의 이야기다.`, `"${v.partner}${c.josa(v.partner, '과', '와')} 함께하고 싶어요. ${v.home}께도 허락을 받아 주세요."`];
      return v.love
        ? [`${k.name}${c.josa(k.name, '이', '가')} ${v.partner}의 손을 꼭 잡고 둥지 앞에 섰다. 강가에서 몰래 만나던 바로 그 ${v.partner}다.`, '"이제는 함께 살고 싶어요. 허락해 주세요."']
        : [`${k.name}${c.josa(k.name, '이', '가')} 마을에서 만난 ${v.partner}${c.josa(v.partner, '과', '와')} 함께 둥지 앞에 섰다. ${v.partner}${c.josa(v.partner, '은', '는')} 드래곤을 올려다보면서도 물러서지 않았다.`, '"이 사람과 함께 살고 싶어요."'];
    },
    choices: [
      // 다른 둥지의 서로의 첫사랑: 상대 보호자에게 허락을 청함 (kinlove.js)
      { label: '축복하고 혼인을 청한다', show: (c, v) => !!v.mutual, run: (h, c, v) => {
        const k = c.k(v.id); h.bond(k, 5); h.mind(5); h.loveAsk(k);
        h.say(`날개를 펼쳐 ${k.name}${h.josa(k.name, '을', '를')} 축복하고, ${v.home}의 둥지에 혼인을 청하는 편지를 띄웠다. ${v.home}${h.josa(v.home, '이', '가')} 허락하면 두 아이가 맺어진다. (유대 +5, 정신 +5)`);
      } },
      { label: '아직 이르다고 한다', show: (c, v) => !!v.mutual, run: (h, c, v) => {
        const k = c.k(v.id); k.data.mateNo = c.now; h.bond(k, -5);
        h.say(`${h.name(k)} 고개를 떨구었다. 그래도 ${v.partner}${h.josa(v.partner, '을', '를')} 만나러 가는 발걸음은 멈추지 않을 것 같다. (유대 −5)`);
      } },
      { label: '날개를 펼쳐 축복한다', show: (c, v) => !v.mutual, run: (h, c, v) => {
        const k = c.k(v.id); k.data.mate = { name: v.partner, at: c.now };
        h.bond(k, 10); h.mind(10);
        h.say(`날개를 활짝 펼쳐 두 사람을 감쌌다. ${v.partner}${h.josa(v.partner, '은', '는')} 떨리는 손으로 비늘을 쓰다듬었다. (유대 +10, 정신 +10)`);
      } },
      { label: '혼례 선물을 마련해 준다 (금화 30)', show: (c, v) => !v.mutual, need: (c) => (c.d.gold < 30 ? '금화가 모자란다.' : null), run: (h, c, v) => {
        const k = c.k(v.id); k.data.mate = { name: v.partner, at: c.now };
        const t = k.data.town || h.nearestTown();
        h.gold(-30); h.bond(k, 15); h.rep(t, 10);
        h.say(`금화로 혼례 옷감과 음식을 마련해 주었다. 용이 맺어 준 혼례 이야기가 ${REGIONS[t].name}에 퍼졌다. (유대 +15, ${REGIONS[t].name} 평판 +10)`);
      } },
      { label: '아직 이르다고 한다', show: (c, v) => !v.mutual, run: (h, c, v) => {
        const k = c.k(v.id); k.data.mateNo = c.now; h.bond(k, -5);
        h.say(`${h.name(k)} 고개를 떨구었다. ${v.partner}${h.josa(v.partner, '은', '는')} 조용히 마을로 돌아갔다. (유대 −5)`);
      } },
    ],
  },
  {
    id: 'kin_baby',
    title: '둥지에 온 작은 손님',
    when: ['wake'],
    weight: 4,
    cond: (c) => c.humans.some((x) => wantsBaby(c, x)),
    setup: (c) => { const k = c.pick(c.humans.filter((x) => wantsBaby(c, x))); return { id: k.id, baby: freshKid(k) }; },
    text: (c, v) => {
      const k = c.k(v.id); const m = k.data.mate.name;
      return [`${k.name}${c.josa(k.name, '과', '와')} ${m}에게 아이가 태어났다.`, '포대기에 싸인 작은 손이 드래곤의 발톱 끝을 꼭 쥐었다.'];
    },
    choices: [
      { label: '이름을 지어 준다', run: (h, c, v) => {
        const k = c.k(v.id); (k.data.kids ||= []).push(v.baby); k.data.lastBaby = c.now; babyTell(h, c, k, v.baby);
        h.bond(k, 8); h.fame(1);
        h.say(`'${v.baby}'${h.josa(v.baby, '이라고', '라고')} 불러 주었다. ${h.name(k)} 눈물을 글썽이며 아이에게 그 이름을 몇 번이고 속삭였다. (유대 +8, 명성 +1)`);
      } },
      { label: '비늘 한 조각을 수호 부적으로 준다', run: (h, c, v) => {
        const k = c.k(v.id); (k.data.kids ||= []).push(v.baby); k.data.lastBaby = c.now; babyTell(h, c, k, v.baby);
        h.bond(k, 12); h.mind(5);
        h.say(`떨어진 비늘 한 조각을 실에 꿰어 ${v.baby}의 목에 걸어 주었다. 드래곤이 지켜 주는 아이가 되었다. (유대 +12, 정신 +5)`);
      } },
      { label: '멀리서 지켜본다', run: (h, c, v) => {
        const k = c.k(v.id); (k.data.kids ||= []).push(v.baby); k.data.lastBaby = c.now; babyTell(h, c, k, v.baby);
        h.bond(k, 3);
        h.say(`둥지 끝에서 조용히 지켜보았다. ${h.name(k)} 아이에게 '${v.baby}'${h.josa(v.baby, '이라는', '라는')} 이름을 붙였다. (유대 +3)`);
      } },
    ],
  },
  {
    id: 'kin_foundling',
    title: '함께 데려온 아이',
    when: ['wake'],
    weight: 4,
    cond: (c) => c.humans.some((x) => wantsFoundling(c, x)),
    setup: (c) => {
      const k = c.pick(c.humans.filter((x) => wantsFoundling(c, x)));
      return { id: k.id, baby: freshKid(k), where: c.pick(['장터 뒷골목', '무너진 방앗간', '숲 가장자리 오두막', '비 오는 성문 아래', '강가 나룻배']) };
    },
    text: (c, v) => {
      const k = c.k(v.id); const m = k.data.mate.name;
      return [`${k.name}${c.josa(k.name, '과', '와')} ${m}${c.josa(m, '이', '가')} 작은 아이 하나를 사이에 두고 둥지 앞에 섰다. ${v.where}에서 홀로 울고 있던 아이라고 한다.`, `"둘이서 키우고 싶어요. 이 아이에게도 돌아갈 곳이 있었으면 해서요."`];
    },
    choices: [
      { label: '이름을 지어 준다', run: (h, c, v) => {
        const k = c.k(v.id); (k.data.kids ||= []).push(v.baby); k.data.lastBaby = c.now; babyTell(h, c, k, v.baby, true);
        h.bond(k, 8); h.fame(1);
        h.say(`'${v.baby}'${h.josa(v.baby, '이라고', '라고')} 불러 주었다. 아이는 처음엔 머뭇거리다가, ${h.name(k)} 내민 손을 꼭 잡았다. (유대 +8, 명성 +1)`);
      } },
      { label: '날개로 감싸 따뜻하게 해 준다', run: (h, c, v) => {
        const k = c.k(v.id); (k.data.kids ||= []).push(v.baby); k.data.lastBaby = c.now; babyTell(h, c, k, v.baby, true);
        h.bond(k, 12); h.mind(5);
        h.say(`날개를 펼쳐 세 사람을 감쌌다. 떨던 아이가 비늘에 기대어 스르르 잠들었다. 두 사람은 아이를 ${v.baby}${h.josa(v.baby, '이라고', '라고')} 부르기로 했다. (유대 +12, 정신 +5)`);
      } },
      { label: '두 사람에게 맡긴다', run: (h, c, v) => {
        const k = c.k(v.id); (k.data.kids ||= []).push(v.baby); k.data.lastBaby = c.now; babyTell(h, c, k, v.baby, true);
        h.bond(k, 3);
        h.say(`멀리서 조용히 지켜보았다. 두 사람은 아이에게 '${v.baby}'${h.josa(v.baby, '이라는', '라는')} 이름을 붙여 주었다. (유대 +3)`);
      } },
    ],
  },
  {
    id: 'drake_courtship',
    title: '둥지 위를 맴도는 낯선 용',
    when: ['wake', 'explore'],
    weight: 3,
    cond: (c) => c.drakes.some((x) => grownDrake(c, x) && canMate(c, x)),
    setup: (c) => {
      const k = c.pick(c.drakes.filter((x) => grownDrake(c, x) && canMate(c, x)));
      return { id: k.id, name: c.pick(DRAKE_NAMES.filter((n) => n !== k.name)), kind: c.pick(PLAY_KINDS) };
    },
    text: (c, v) => {
      const k = c.k(v.id); const kn = KINDS[v.kind].name;
      return [`둥지 위로 낯선 ${kn} 한 마리가 큰 원을 그리며 맴돈다. 이름은 ${v.name}${c.josa(v.name, '이라고', '라고')} 했다.`, `${k.name}${c.josa(k.name, '이', '가')} 날개를 반쯤 펼친 채 그쪽만 올려다보고 있다. ${v.name}${c.josa(v.name, '은', '는')} 낮게 노래를 불렀다.`];
    },
    choices: [
      { label: '함께 날아 보라고 한다', run: (h, c, v) => {
        const k = c.k(v.id); k.data.mate = { name: v.name, kind: v.kind, at: c.now };
        h.bond(k, 8);
        h.say(`${h.name(k)} 단숨에 날아올랐다. 두 용은 해가 질 때까지 구름 사이를 함께 돌았다. (유대 +8)`);
      } },
      { label: '실력을 겨뤄 보게 한다', run: (h, c, v) => {
        const k = c.k(v.id); k.data.mate = { name: v.name, kind: v.kind, at: c.now };
        const s = c.pick(['claw', 'wing', 'scale']); h.train(k, s); h.fame(1);
        h.say(`두 용이 공중에서 한참을 겨뤘다. 지친 둘은 나란히 바위에 내려앉았다. 서로가 마음에 든 모양이다. (${STATS.find((x) => x.key === s).name} +1, 명성 +1)`);
      } },
      { label: '둥지에서 쫓아낸다', run: (h, c, v) => {
        const k = c.k(v.id); k.data.mateNo = c.now; h.bond(k, -6);
        h.say(`포효 한 번에 ${v.name}${h.josa(v.name, '은', '는')} 멀리 날아갔다. ${h.name(k)} 한동안 하늘만 바라보았다. (유대 −6)`);
      } },
    ],
  },
  {
    id: 'mate_egg',
    title: '맡기러 온 알',
    when: ['wake'],
    weight: 4,
    cond: (c) => !c.full && [...c.drakes, ...c.gone].some((x) => bringsEgg(c, x)),
    setup: (c) => {
      const k = c.pick([...c.drakes, ...c.gone].filter((x) => bringsEgg(c, x)));
      return { id: k.id, kind: c.pick([k.data.kind, k.data.mate.kind || k.data.kind]) };
    },
    text: (c, v) => {
      const k = c.kAny(v.id); const m = k.data.mate.name;
      return [`${k.name}${c.josa(k.name, '이', '가')} ${m}${c.josa(m, '과', '와')} 함께 둥지로 날아왔다. 발톱 사이에 따뜻한 ${KINDS[v.kind].name}의 알 하나가 들려 있다.`, '"우리 아이를… 당신의 둥지에서 키워 주실래요?"'];
    },
    choices: [
      { label: '알을 맡아 품는다', run: (h, c, v) => {
        const k = c.kAny(v.id); k.data.eggBrought = c.now;
        h.egg(v.kind); h.fame(2); h.bond(k, 6);
        h.say(`알을 받아 둥지 가장 따뜻한 곳에 두었다. 이제 손주를 품게 되었다. (명성 +2)`);
      } },
      { label: '둘이 직접 키우라고 돌려보낸다', run: (h, c, v) => {
        const k = c.kAny(v.id); k.data.eggBrought = c.now;
        h.mind(6);
        h.say(`"너희 둥지에서 키우렴." ${k.name}${h.josa(k.name, '은', '는')} 고개를 끄덕이고, 알을 품에 안은 채 날아갔다. (정신 +6)`);
      } },
    ],
  },
  {
    id: 'descendants_visit',
    title: '언덕을 오르는 사람들',
    when: ['wake'],
    weight: 6,
    cond: (c) => c.past.some((x) => awaitsFarewell(c, x)),
    setup: (c) => {
      const k = c.pick(c.past.filter((x) => awaitsFarewell(c, x)));
      const kids = (k.data.kids || []).slice(0, 3);
      const used = new Set([k.name, ...kids]);
      const grand = kids.length ? c.pick(HUMAN_NAMES.filter((n) => !used.has(n))) : null;
      return { id: k.id, kids, grand, mate: k.data.mate?.name || null, town: k.data.town || null };
    },
    text: (c, v) => {
      const k = c.kAny(v.id);
      if (v.kids.length) {
        return [
          `${k.name}${c.josa(k.name, '이', '가')} 긴 잠에 든 지 며칠이 지났다. 둥지 아래 언덕으로 사람들이 줄지어 올라온다.`,
          `${v.kids.join(', ')}… 그리고 그 품에 안긴 어린 ${v.grand}까지. ${k.name}의 자손들이다.`,
          `"${parentWord(k)}가 늘 이야기했어요. 우리 집안을 키워 준 용이 있다고. 인사를 드리러 왔어요."`,
          `어린 ${v.grand}${c.josa(v.grand, '이', '가')} 눈을 동그랗게 뜨고 속삭였다. "${elderWord(k)}가 말한 용이 진짜 있었어…"`,
        ];
      }
      return [
        `${v.mate}${c.josa(v.mate, '이', '가')} 홀로 언덕을 올라왔다. ${k.name}${c.josa(k.name, '과', '와')} 평생을 함께한 사람이다.`,
        `"마지막까지 당신 이야기를 했어요. 꼭 고맙다고 전해 달라고."`,
      ];
    },
    choices: [
      { label: (c, v) => `${c.kAny(v.id)?.name || '그 아이'}의 어린 시절 이야기를 들려준다`, run: (h, c, v) => {
        const k = c.kAny(v.id); k.data.farewell = c.now;
        const t = v.town || h.nearestTown();
        h.mind(15); h.rep(t, 10); h.give(c.pick(['wild_honey', 'salted_fish', 'grass_seed']), 2);
        h.say(`처음 둥지에 왔을 때 얼마나 작았는지, 처음 내 이름을 불렀던 날을 이야기해 주었다. 사람들은 웃다가 울었다. 떠나며 정성껏 마련한 제물을 두고 갔다. (정신 +15, ${REGIONS[t].name} 평판 +10)`);
      } },
      { label: '가문의 증표로 비늘 하나를 내어 준다', run: (h, c, v) => {
        const k = c.kAny(v.id); k.data.farewell = c.now;
        const t = v.town || h.nearestTown();
        h.fame(3); h.rep(t, 5);
        h.say(v.kids.length
          ? `가장 단단한 비늘 하나를 뽑아 ${v.kids[0]}에게 건넸다. "대대로 전하겠습니다." ${v.grand}${h.josa(v.grand, '이', '가')} 비늘을 신기한 듯 만졌다. (명성 +3, 평판 +5)`
          : `가장 단단한 비늘 하나를 뽑아 ${v.mate}에게 건넸다. ${v.mate}${h.josa(v.mate, '은', '는')} 그것을 가슴에 꼭 안았다. (명성 +3, 평판 +5)`);
      } },
      { label: '말없이 고개를 숙인다', run: (h, c, v) => {
        const k = c.kAny(v.id); k.data.farewell = c.now;
        h.mind(8);
        h.say(`긴 목을 땅에 닿도록 숙였다. 사람들도 하나둘 고개를 숙였다. 바람이 언덕을 쓸고 지나갔다. (정신 +8)`);
      } },
    ],
  },
  {
    id: 'elder_wish',
    title: '노년의 마지막 소원',
    when: ['wake'],
    weight: 5,
    cond: (c) => c.humans.some((x) => c.stage(x) === '노년' && !x.data.lastWish),
    setup: (c) => { const k = c.pick(c.humans.filter((x) => c.stage(x) === '노년' && !x.data.lastWish)); return { id: k.id, town: k.data.town || null }; },
    text: (c, v) => { const k = c.k(v.id); const home = v.town && REGIONS[v.town] ? REGIONS[v.town].name : '마을'; return [`허리가 굽은 ${k.name}${c.josa(k.name, '이', '가')} 둥지 끝에 앉아 먼 곳을 바라본다.`, `"죽기 전에… 제가 태어난 ${home}${c.josa(home, '을', '를')} 한 번만 더 보고 싶어요. 당신 등에 타고."`]; },
    choices: [
      { label: '등에 태워 다녀온다 (기력 15)', need: (c) => (c.d.en < 15 ? '기력이 모자란다.' : null), run: (h, c, v) => {
        const k = c.k(v.id); k.data.lastWish = 'went'; h.en(-15); h.bond(k, 15); h.mind(20);
        if (c.nest) h.keep('home_pebble', k.name, '고마워요. 정말로.'); else h.give('elder_keepsake');
        h.say(`바람을 가르며 날아가는 동안 ${h.name(k)} 어린아이처럼 웃었다. 옛 골목을 내려다보며 오래오래 눈을 감았다.`, `돌아오는 길, 고향 강가에서 주운 조약돌을 손에 쥐여 주었다. "고마워요. 정말로." (유대 +15, 정신 +20, 고향의 조약돌)`);
      } },
      { label: '대신 옛이야기를 들어 준다', run: (h, c, v) => {
        const k = c.k(v.id); k.data.lastWish = 'told'; h.bond(k, 6); h.mind(6);
        h.say(`${h.name(k)} 고향 이야기를 밤새 들려주었다. 이야기만으로도 그곳에 다녀온 것 같다고 웃었다. (유대 +6, 정신 +6)`);
      } },
      { label: '너무 멀다고 거절한다', run: (h, c, v) => { const k = c.k(v.id); k.data.lastWish = 'no'; h.bond(k, -6); h.say(`"…그렇지요. 괜한 말을 했네요." ${h.name(k)} 쓸쓸하게 웃었다. (유대 −6)`); } },
    ],
  },
  {
    id: 'molting',
    title: '비늘 갈이',
    when: ['wake', 'explore'],
    weight: 4,
    cond: (c) => c.drakes.some((x) => c.stage(x) === '어린 용' && !x.data.molted),
    setup: (c) => { const k = c.pick(c.drakes.filter((x) => c.stage(x) === '어린 용' && !x.data.molted)); return { id: k.id, need: KIN.eggNeeds[k.data.kind] }; },
    text: (c, v) => { const k = c.k(v.id); return [`${k.name}${c.josa(k.name, '이', '가')} 바위에 몸을 비비며 끙끙댄다. 낡은 비늘이 들뜨기 시작했다.`, '비늘 갈이다. 새 비늘이 단단히 자리 잡으려면 도움이 필요하다.']; },
    choices: [
      { label: (c, v) => `${ITEMS[v.need].name}${c.josa(ITEMS[v.need].name, '을', '를')} 갈아 발라 준다`, need: (c, v) => (c.have(v.need) < 1 ? `${ITEMS[v.need].name}${c.josa(ITEMS[v.need].name, '이', '가')} 없다.` : null), run: (h, c, v) => {
        const k = c.k(v.id); k.data.molted = true; h.take(v.need); h.train(k, 'scale'); h.bond(k, 4);
        h.say(`고향의 기운이 스며들자 새 비늘이 윤기 있게 돋아났다. (비늘 +1, 유대 +4)`);
      } },
      { label: '등을 긁어 준다 (기력 5)', tone: 'warm', need: (c) => (c.d.en < 5 ? '기력이 모자란다.' : null), run: (h, c, v) => {
        const k = c.k(v.id); k.data.molted = true; h.en(-5); h.bond(k, 6);
        h.say(`발톱 끝으로 들뜬 비늘을 살살 긁어 주자 ${h.name(k)} 눈을 가늘게 뜨고 그르렁거렸다. (유대 +6)`);
      } },
      { label: '스스로 견디게 둔다', tone: 'trust', run: (h, c, v) => { const k = c.k(v.id); k.data.molted = true; h.bond(k, -3); h.say(`${h.name(k)} 며칠을 가려움에 뒤척였다. (유대 −3)`); } },
    ],
  },
  {
    id: 'hunt_blunder',
    title: '젊은 용의 사냥 실수',
    when: ['wake'],
    weight: 4,
    cond: (c) => c.drakes.some((x) => c.stage(x) === '젊은 용' && !x.data.onExp && ready(x.data.blunderAt, D3)),
    setup: (c) => ({ id: c.pick(c.drakes.filter((x) => c.stage(x) === '젊은 용' && !x.data.onExp && ready(x.data.blunderAt, D3))).id }),
    text: (c, v) => { const k = c.k(v.id); return [`${k.name}${c.josa(k.name, '이', '가')} 의기양양하게 사냥감을 물고 돌아왔다.`, '…그런데 목에 방울이 달려 있다. 인간 마을의 양이다. 멀리서 목동의 고함이 들린다.']; },
    choices: [
      { label: '양값을 물어 주고 사과한다 (금화 15)', tone: 'warm', need: (c) => (c.d.gold < 15 ? '금화가 모자란다.' : null), run: (h, c, v) => {
        const k = c.k(v.id); k.data.blunderAt = c.now; const t = h.nearestTown();
        h.gold(-15); h.rep(t, 4); h.bond(k, -2);
        h.say(`목동에게 금화를 건네고 고개를 숙였다. ${h.name(k)} 풀이 죽어 꼬리를 늘어뜨렸다. (금화 −15, ${REGIONS[t].name} 평판 +4, 유대 −2)`);
      } },
      { label: '직접 사과하게 한다', tone: 'strict', run: (h, c, v) => {
        const k = c.k(v.id); k.data.blunderAt = c.now; const t = h.nearestTown();
        h.rep(t, 2); h.bond(k, 2); h.nudge(k, 'friendly', 2);
        h.say(`${h.name(k)} 머뭇거리며 목동 앞에 고개를 숙였다. 목동은 겁에 질렸지만, 이내 웃음을 터뜨렸다. (평판 +2, 유대 +2, 새끼 우호 쪽으로)`);
      } },
      { label: '훌륭한 사냥이라고 칭찬한다', tone: 'free', run: (h, c, v) => {
        const k = c.k(v.id); k.data.blunderAt = c.now; const t = h.nearestTown();
        h.rep(t, -5); h.fame(2); h.bond(k, 5); h.nudge(k, 'hostile', 2);
        h.say(`"잘했다." ${h.name(k)} 양을 뜯으며 으쓱했다. 마을에서는 용이 가축을 노린다는 소문이 돌 것이다. (평판 −5, 명성 +2, 유대 +5, 새끼 적대 쪽으로)`);
      } },
    ],
  },
  {
    id: 'grown_return',
    title: '독립한 새끼의 귀환',
    when: ['wake', 'explore'],
    weight: 3,
    cond: (c) => c.gone.some((x) => ready(x.data.visitAt, D3)),
    setup: (c) => {
      const k = c.pick(c.gone.filter((x) => ready(x.data.visitAt, D3)));
      const r = Math.random();
      return { id: k.id, name: k.name, kind: k.data.kind, mode: r < 0.5 ? 'gift' : r < 0.75 ? 'egg' : 'help', item: KIN.eggNeeds[k.data.kind] || 'ancient_relic' };
    },
    text: (c, v) => {
      const kn = KINDS[v.kind]?.name || '용';
      const head = `커다란 그림자가 둥지 위를 맴돌다 내려앉았다. 다 자란 ${kn}, ${v.name}${c.josa(v.name, '이다', '다')}.`;
      if (v.mode === 'gift') return [head, `발톱에 ${ITEMS[v.item].name}${c.josa(ITEMS[v.item].name, '을', '를')} 쥐고 있다. 머리를 내 어깨에 비비며 그르렁거린다.`];
      if (v.mode === 'egg') return [head, '품에 작은 알 하나를 소중히 안고 있다. 자기 둥지에서 낳은 알을 보여 주러 온 것이다.'];
      return [head, '옆구리에 화살이 박혀 있다. "용사냥꾼들이 내 둥지를 노려요. 도와줄 수 있나요?"'];
    },
    choices: [
      { label: '반갑게 맞는다', show: (c, v) => v.mode !== 'help', run: (h, c, v) => {
        const k = c.gone.find((x) => x.id === v.id); if (k) k.data.visitAt = c.now;
        h.mind(12);
        if (v.mode === 'gift') { h.give(v.item); h.say(`${v.name}${h.josa(v.name, '은', '는')} 선물을 내려놓고 하룻밤을 둥지에서 함께 보냈다. (정신 +12, ${ITEMS[v.item].name})`); }
        else { h.fame(3); h.say(`알을 들여다보는 동안 가슴이 벅차올랐다. 내 계보가 이어지고 있다. 용족 사이에 소문이 퍼졌다. (정신 +12, 명성 +3)`); }
      } },
      { label: '함께 둥지를 지키러 간다 (체력 15, 기력 10)', show: (c, v) => v.mode === 'help', need: (c) => (c.d.en < 10 ? '기력이 모자란다.' : c.d.hp <= 15 ? '체력이 모자란다.' : null), run: (h, c, v) => {
        const k = c.gone.find((x) => x.id === v.id); if (k) k.data.visitAt = c.now;
        h.hp(-15); h.en(-10); h.fame(4); h.give('sharp_fang', 2);
        h.say(`둘이 함께 포효하자 사냥꾼들은 무기를 버리고 달아났다. ${v.name}${h.josa(v.name, '이', '가')} 고개 숙여 고마움을 전했다. (체력 −15, 기력 −10, 명성 +4, 날카로운 송곳니 2)`);
      } },
      { label: '상처만 돌봐 주고 보낸다', show: (c, v) => v.mode === 'help', run: (h, c, v) => {
        const k = c.gone.find((x) => x.id === v.id); if (k) k.data.visitAt = c.now;
        h.en(-5); h.mind(3);
        h.say(`화살을 뽑고 상처를 핥아 주었다. ${v.name}${h.josa(v.name, '은', '는')} 혼자 해 보겠다며 날아갔다. (기력 −5, 정신 +3)`);
      } },
    ],
  },
  // ── 멸망한 대륙 에레보스 (ruin: 이 땅에서만. 이 땅에서는 ruin·ruinToo 이벤트만 뜸) ──
  {
    id: 'ruin_bottle',
    title: '잿빛 파도의 유리병',
    ruin: true,
    when: ['explore', 'gather'],
    weight: 5,
    cond: (c) => c.region === 'ruin_shore',
    text: () => [
      '검은 파도가 물러난 자리에 유리병 하나가 굴러다닌다. 마개는 밀랍으로 단단히 막혀 있다.',
      '병 속에 둘둘 만 쪽지가 보인다. 멸망 전에 누군가 바다에 띄운 것 같다.',
    ],
    choices: [
      { label: '쪽지를 펼쳐 읽는다', run: (h, c) => {
        const xp = 20 + c.level * 4;
        h.mind(-3); h.xp(xp);
        h.say(`"내일은 비가 그친대. 그러면 밀밭에 가 보자." 끝내 오지 않은 내일의 약속이 적혀 있었다. (정신 −3, 경험 +${xp})`);
      } },
      { label: '오르샤에게 가져다준다', run: (h) => {
        h.mind(5); h.purify(6);
        h.say('모닥불 곁의 늙은 드래곤은 쪽지를 오래 들여다보다가 불 속에 넣었다. "기억해 주는 이가 있으면 넋도 편히 쉬지." (정신 +5, 정화 기여 +6)');
      } },
      { label: '다시 바다에 띄워 보낸다', run: (h) => {
        h.mind(8);
        h.say('병을 힘껏 던졌다. 잿빛 파도 너머로 작게 반짝이다 사라졌다. 어딘가 맑은 바다에 닿기를. (정신 +8)');
      } },
    ],
  },
  {
    id: 'ruin_bonfire_child',
    title: '모닥불 곁의 그림',
    ruin: true,
    when: ['explore'],
    weight: 4,
    cond: (c) => c.region === 'ruin_shore',
    text: () => [
      '생존자들의 모닥불 곁에서 작은 아이 하나가 잿빛 모래 위에 손가락으로 그림을 그리고 있다.',
      '푸른 하늘, 노란 해, 그리고 그 아래를 나는 커다란 날개. 아이가 고개를 들어 이쪽을 본다.',
    ],
    choices: [
      { label: '꼬리 끝으로 함께 그려 준다', run: (h) => {
        h.mind(8);
        h.say('모래 위에 꽃과 나무를 하나씩 더 그려 주었다. 아이가 오랜만에 소리 내어 웃었다고 생존자들이 말했다. (정신 +8)');
      } },
      { label: '정화의 결정 하나를 건넨다', run: (h, c) => {
        h.take('purify_shard', 1); h.purify(8); h.fame(2); h.mind(4);
        h.say('맑은 결정을 손에 쥔 아이가 불빛에 비춰 보며 눈을 크게 떴다. "하늘 색이다!" (정화의 결정 −1, 정화 기여 +8, 명성 +2, 정신 +4)');
      }, need: (c) => (c.have('purify_shard') >= 1 ? null : '정화의 결정이 있어야 한다.') },
      { label: '조용히 지켜보다 떠난다', run: (h) => {
        h.mind(2);
        h.say('불빛 속에 그려진 하늘을 눈에 담고 날개를 폈다. (정신 +2)');
      } },
    ],
  },
  {
    id: 'ruin_scarecrow',
    title: '돌아보는 허수아비',
    ruin: true,
    when: ['explore', 'gather'],
    weight: 5,
    cond: (c) => c.region === 'ruin_plain',
    text: () => [
      '검게 마른 밀밭 한가운데, 허수아비 셋이 서 있다. 바람 한 점 없는데 짚으로 만든 고개가 천천히 이쪽으로 돌아간다.',
      '누더기 소매 끝에서 잿빛 가루가 흘러내린다.',
    ],
    choices: [
      { label: '다가가 살펴본다 (체력 −10)', run: (h) => {
        h.hp(-10); h.give('ghost_ash', Math.random() < 0.5 ? 2 : 1);
        h.say('가까이 가자 허수아비가 손을 뻗었다. 발톱으로 쳐내자 짚 속에 깃들었던 망령이 흩어지며 차가운 재를 남겼다. (체력 −10, 망령의 재)');
      } },
      { label: '숨결로 태워 보낸다 (기력 −8)', run: (h) => {
        h.en(-8); h.purify(10);
        h.say('불길에 휩싸인 허수아비들이 마지막으로 한 번 고개를 숙였다. 밀밭 위로 하얀 연기가 곧게 피어올랐다. (기력 −8, 정화 기여 +10)');
      } },
      { label: '눈을 피하고 지나친다', run: (h) => {
        h.mind(-4);
        h.say('등 뒤로 짚이 바스락거리는 소리가 한참을 따라왔다. (정신 −4)');
      } },
    ],
  },
  {
    id: 'ruin_last_ear',
    title: '금빛 이삭 하나',
    ruin: true,
    when: ['gather', 'explore'],
    weight: 3,
    cond: (c) => c.region === 'ruin_plain',
    text: () => [
      '온통 검게 말라 버린 밀밭 사이에서 이삭 하나가 아직 금빛으로 고개를 숙이고 있다.',
      '이 땅이 한때 어떤 빛이었는지, 이삭 하나가 기억하고 있는 것 같다.',
    ],
    choices: [
      { label: '오르샤에게 가져간다', run: (h) => {
        h.purify(12); h.mind(4);
        h.say('늙은 드래곤은 이삭을 받아 들고 한동안 말이 없었다. "씨앗이 남았다면, 이 땅도 아직 끝난 건 아니야." (정화 기여 +12, 정신 +4)');
      } },
      { label: '그대로 두고 둘레를 지킨다', run: (h) => {
        h.mind(10); h.purify(4);
        h.say('이삭 곁에 한참 엎드려 있었다. 바람이 불자 이삭이 가만히 흔들렸다. 언젠가 이 들판이 다시 금빛이 되기를. (정신 +10, 정화 기여 +4)');
      } },
    ],
  },
  {
    id: 'ruin_dry_nest',
    title: '말라붙은 강바닥의 둥지 자리',
    ruin: true,
    when: ['explore', 'hunt'],
    weight: 3,
    cond: (c) => c.region === 'ruin_plain' || c.region === 'ruin_rift',
    text: () => [
      '갈라진 강바닥 바위 그늘에 둥글게 다져진 자리가 있다. 오래전 어느 드래곤의 둥지였던 곳이다.',
      '잿빛 먼지 속에 깨진 알껍데기 조각이 반쯤 묻혀 있다.',
    ],
    choices: [
      { label: '껍데기를 모아 묻어 준다', run: (h) => {
        h.mind(6); h.purify(8);
        h.say('발톱으로 흙을 파 조각들을 묻고 그 위에 돌 하나를 올려 두었다. (정신 +6, 정화 기여 +8)');
      } },
      { label: '둥지 자리를 뒤져 본다', run: (h) => {
        const g = randInt(20, 45);
        h.gold(g); h.give('ashen_dust', 2); h.mind(-4);
        h.say(`먼지 아래에서 녹슨 금화 ${g}닢이 나왔다. 둥지의 주인이 모아 둔 보물이었을까. (정신 −4)`);
      } },
    ],
  },
  {
    id: 'ruin_banner',
    title: '성벽 위의 찢긴 깃발',
    ruin: true,
    when: ['explore'],
    weight: 5,
    cond: (c) => c.region === 'ruin_capital',
    text: () => [
      '무너진 카르넴의 성벽 꼭대기, 찢긴 깃발 하나가 아직도 펄럭인다.',
      '바랜 천에 희미하게 남은 문장: 서로 날개와 손을 맞댄 용과 사람.',
    ],
    choices: [
      { label: '깃대를 곧게 다시 세운다 (기력 −6)', run: (h) => {
        h.en(-6); h.purify(10); h.fame(1);
        h.say('기울어진 깃대를 바로 세우자 깃발이 바람을 한껏 머금었다. 잿빛 하늘 아래 그 문장이 또렷해졌다. (기력 −6, 정화 기여 +10, 명성 +1)');
      } },
      { label: '깃발을 내려 품에 안는다', run: (h) => {
        h.mind(8);
        h.say('조심스레 깃발을 내려 접었다. 오래 버텨 온 것을 이제 쉬게 해 주고 싶었다. (정신 +8)');
      } },
      { label: '바라보기만 한다', run: (h) => h.say('함께 세웠다는 왕도. 그 약속이 어떻게 끝났는지 깃발은 말해 주지 않았다.') },
    ],
  },
  {
    id: 'ruin_throne_echo',
    title: '왕좌의 회랑에 남은 목소리',
    ruin: true,
    when: ['explore', 'hunt'],
    weight: 4,
    cond: (c) => c.region === 'ruin_capital',
    text: () => [
      '텅 빈 회랑 끝, 금이 간 왕좌에서 낮은 목소리가 울린다. "누구냐. 이 땅에 아직 날개 달린 것이 남았느냐."',
      '목소리는 슬프고, 지쳐 있고, 조금은 반가워하는 것 같다.',
    ],
    choices: [
      { label: '귀를 기울인다 (정신 −6)', run: (h, c) => {
        const xp = 30 + c.level * 5;
        h.mind(-6); h.xp(xp);
        h.say(`목소리는 마지막 날의 이야기를 들려주었다. 하늘이 잿빛으로 갈라지던 날, 왕은 끝까지 성문을 열어 두었다고. (정신 −6, 경험 +${xp})`);
      } },
      { label: '"이 땅을 되찾겠다"고 답한다', run: (h) => {
        h.purify(10); h.mind(3);
        h.say('한동안 대답이 없더니, 회랑 가득 낮은 웃음이 번졌다. "그럼 서둘러라. 나는 오래 기다렸다." (정화 기여 +10, 정신 +3)');
      } },
      { label: '돌아선다', run: (h) => { h.mind(-2); h.say('"또 떠나는구나." 등 뒤로 목소리가 작게 흩어졌다. (정신 −2)'); } },
    ],
  },
  {
    id: 'ruin_rift_breath',
    title: '균열 아래의 숨결',
    ruin: true,
    when: ['explore', 'gather', 'hunt'],
    weight: 5,
    cond: (c) => c.region === 'ruin_rift',
    text: () => [
      '바닥이 보이지 않는 균열 아래에서 뜨겁고 축축한 숨이 천천히 올라온다. 들이쉬고, 내쉬고.',
      '숨이 닿는 바위마다 검은 결정이 꽃처럼 피어 있다.',
    ],
    choices: [
      { label: '몸을 기울여 들여다본다 (정신 −10)', run: (h) => {
        h.mind(-10);
        if (Math.random() < 0.4) { h.give('ashen_core'); h.say('어둠 속에서 무언가가 눈을 떴다. 황급히 물러서는데, 발톱 사이에 아직 뛰고 있는 잿빛 덩어리가 걸려 올라왔다. (정신 −10, 잿빛 심장)'); }
        else { h.give('ashen_dust', 3); h.say('어둠 속에서 무언가가 눈을 떴다. 황급히 물러서자 날개 가득 잿빛 먼지가 엉겨 있었다. (정신 −10, 잿빛 먼지 3)'); }
      } },
      { label: '바위를 굴려 틈을 덮는다 (기력 −10)', run: (h) => {
        h.en(-10); h.purify(14);
        h.say('큰 바위 여러 개를 굴려 틈 한쪽을 덮었다. 숨소리가 한 박자 느려졌다. (기력 −10, 정화 기여 +14)');
      } },
      { label: '물러난다', run: (h) => h.say('저 아래 있는 것과는 아직 마주할 때가 아니다.') },
    ],
  },
  {
    id: 'ruin_old_ghost',
    title: '사냥감 곁의 옛 드래곤',
    ruin: true,
    when: ['hunt'],
    weight: 3,
    cond: () => true,
    text: (c) => [
      '쓰러뜨린 사냥감 곁에 반투명한 드래곤 하나가 앉아 있다. 비늘 사이로 잿빛 하늘이 비쳐 보인다.',
      `"${c.me}${c.josa(c.me, '이라', '라')} 했나. 이 땅의 것들을 쉬게 해 주어 고맙다."`,
    ],
    choices: [
      { label: '정화의 결정을 바친다', run: (h) => {
        h.take('purify_shard', 1); h.purify(16); h.mind(10);
        h.say('결정을 내밀자 망령은 그것을 가슴에 품고 천천히 빛 속으로 흩어졌다. 머릿속이 맑아졌다. (정화의 결정 −1, 정화 기여 +16, 정신 +10)');
      }, need: (c) => (c.have('purify_shard') >= 1 ? null : '정화의 결정이 있어야 한다.') },
      { label: '이 땅에서 무슨 일이 있었는지 묻는다', run: (h, c) => {
        const xp = 25 + c.level * 4;
        h.mind(-4); h.xp(xp);
        h.say(`"하늘이 먼저 무너졌다. 그다음은 우리 마음이었지." 망령은 그 말만 남기고 사라졌다. (정신 −4, 경험 +${xp})`);
      } },
      { label: '고개를 숙여 인사한다', run: (h) => { h.mind(4); h.say('망령도 고개를 숙이고, 잿빛 바람에 섞여 흩어졌다. (정신 +4)'); } },
    ],
  },
  {
    id: 'ruin_ash_storm',
    title: '잿빛 먼지 폭풍',
    ruin: true,
    when: ['explore', 'gather'],
    weight: 4,
    cond: () => true,
    text: () => [
      '지평선이 흐려지더니, 잿빛 먼지가 벽처럼 밀려온다. 숨을 들이쉴 때마다 입안이 텁텁하다.',
    ],
    choices: [
      { label: '날개로 몸을 감싸고 버틴다 (체력 −8)', run: (h) => {
        h.hp(-8); h.give('ashen_dust', 2);
        h.say('폭풍이 지나가자 날개막 가득 고운 먼지가 쌓여 있었다. 털어 내어 주머니에 담았다. (체력 −8, 잿빛 먼지 2)');
      } },
      { label: '바위 그늘로 서둘러 피한다 (기력 −5)', run: (h) => {
        h.en(-5);
        h.say('바위 틈에 몸을 밀어 넣고 폭풍이 지나가기를 기다렸다. (기력 −5)');
      } },
    ],
  },
  {
    id: 'ruin_clear_sky',
    title: '갈라진 구름',
    ruin: true,
    when: ['explore', 'gather', 'hunt'],
    weight: 1.5,
    cond: () => true,
    text: () => [
      '두꺼운 잿빛 구름이 아주 잠깐, 손바닥만큼 갈라졌다. 그 틈으로 시리도록 파란 하늘이 보인다.',
    ],
    choices: [
      { label: '날아올라 그 빛을 받는다', run: (h) => {
        h.mind(15);
        h.say('틈이 닫히기 전에 힘껏 날아올라 얼굴 가득 햇빛을 받았다. 이 땅에도 하늘이 남아 있었다. (정신 +15)');
      } },
      { label: '크게 울어 모두에게 알린다', run: (h) => {
        h.mind(8); h.fame(1); h.purify(6);
        h.say('대륙 끝까지 닿도록 길게 울었다. 멀리서 다른 드래곤의 울음이 화답해 왔다. (정신 +8, 명성 +1, 정화 기여 +6)');
      } },
    ],
  },
  {
    id: 'ruin_burnt_library',
    title: '반쯤 탄 지도',
    ruin: true,
    when: ['explore'],
    weight: 3,
    cond: (c) => c.region === 'ruin_capital' || c.region === 'ruin_plain',
    text: () => [
      '무너진 집 아래에서 가죽 표지의 지도첩이 나왔다. 절반은 타 버렸지만, 남은 쪽에 이 대륙의 옛 길이 그려져 있다.',
    ],
    choices: [
      { label: '남은 쪽을 챙긴다', run: (h) => {
        if (Math.random() < 0.12) { h.give('tr_map_piece'); h.say('지도첩 사이에서 보물 지도 조각이 미끄러져 나왔다!'); }
        const g = randInt(15, 35); h.gold(g);
        h.say(`쓸 만한 쪽을 추려 냈다. 끼워져 있던 옛 금화 ${g}닢도 함께. (금화 +${g})`);
      } },
      { label: '오르샤에게 옛 길을 알려 준다', run: (h) => {
        h.purify(8); h.mind(3);
        h.say('"이 길이 아직 남아 있다면, 생존자들을 안쪽까지 데려갈 수 있겠어." 늙은 드래곤의 눈이 빛났다. (정화 기여 +8, 정신 +3)');
      } },
    ],
  },
  {
    id: 'ruin_orsha_story',
    title: '오르샤의 옛이야기',
    ruin: true,
    when: ['explore'],
    weight: 2,
    cond: (c) => c.region === 'ruin_shore',
    text: () => [
      '모닥불에 마른 가지를 던지던 오르샤가 문득 입을 연다. "그날 일을 듣고 싶으냐. 하늘이 처음 잿빛으로 물들던 날."',
    ],
    choices: [
      { label: '곁에 앉아 듣는다', run: (h, c) => {
        const xp = 40 + c.level * 5;
        h.mind(-5); h.xp(xp);
        h.say(`"우리는 하늘을 너무 믿었다. 무너지는 건 늘 땅이라고만 생각했지." 이야기는 불이 사그라들 때까지 이어졌다. (정신 −5, 경험 +${xp})`);
      } },
      { label: '"이제 어떻게 되돌리죠?" 하고 묻는다', run: (h) => {
        h.purify(10); h.mind(3);
        h.say('오르샤가 불씨 하나를 집어 손바닥에 올렸다. "이렇게. 하나씩, 꺼지지 않게." (정화 기여 +10, 정신 +3)');
      } },
    ],
  },
  {
    id: 'ruin_fisher_ghosts',
    title: '그물을 걷는 어부들',
    ruin: true,
    when: ['explore', 'hunt'],
    weight: 4,
    cond: (c) => c.region === 'ruin_shore',
    text: () => [
      '부서진 부두 끝에서 반투명한 어부 셋이 빈 그물을 걷어 올리는 시늉을 하고 있다. 몇 번이고, 몇 번이고.',
      '그물에는 아무것도 걸려 있지 않다.',
    ],
    choices: [
      { label: '함께 그물을 당겨 준다 (기력 −6)', run: (h) => {
        h.en(-6); h.mind(6); h.purify(8);
        h.say('발톱으로 그물 끝을 잡아 힘껏 당겼다. 어부들이 고개를 들어 웃더니, 그물째 하얗게 흩어졌다. 손에 조개껍데기 하나가 남았다. (기력 −6, 정신 +6, 정화 기여 +8)');
        h.give('sea_shell');
      } },
      { label: '그물을 들여다본다', run: (h) => {
        h.mind(-4);
        if (Math.random() < 0.35) { h.give('deep_pearl'); h.say('그물코에 검게 물든 진주 하나가 걸려 있었다. 어부들은 그걸 보지 못한 듯 계속 그물을 걷었다. (정신 −4, 심해 진주)'); }
        else { h.give('ghost_ash'); h.say('그물코마다 차가운 재가 엉겨 있었다. (정신 −4, 망령의 재)'); }
      } },
      { label: '지나간다', run: (h) => h.say('끝나지 않는 일을 하는 넋들 곁을, 소리 없이 지나쳤다.') },
    ],
  },
  {
    id: 'ruin_crab_shell',
    title: '빈 껍데기의 노래',
    ruin: true,
    when: ['gather'],
    weight: 4,
    cond: (c) => c.region === 'ruin_shore',
    text: () => [
      '잿빛 모래톱에 사람 머리만 한 게 껍데기가 뒤집혀 있다. 귀를 대자 안에서 파도 소리가 아닌, 누군가의 자장가가 들린다.',
    ],
    choices: [
      { label: '껍데기를 열어 본다', run: (h) => {
        const g = randInt(15, 40);
        h.gold(g); h.give('sea_shell', 2);
        h.say(`껍데기 속에 누군가 숨겨 둔 금화 ${g}닢과 조개껍데기가 있었다. 자장가가 뚝 그쳤다.`);
      } },
      { label: '자장가가 끝날 때까지 듣는다', run: (h) => {
        h.mind(10);
        h.say('노래는 짧고, 서툴고, 다정했다. 마지막 소절이 끝나자 껍데기가 잿빛 모래로 부서졌다. (정신 +10)');
      } },
    ],
  },
  {
    id: 'ruin_dry_well',
    title: '마른 우물',
    ruin: true,
    when: ['explore', 'gather'],
    weight: 4,
    cond: (c) => c.region === 'ruin_plain',
    text: () => [
      '마을 터 한가운데 돌우물이 있다. 들여다보니 바닥이 까마득하고, 물 대신 잿빛 먼지가 고여 있다.',
      '우물가 돌에 아이 키 높이로 금이 여러 줄 그어져 있다. 해마다 잰 키였을까.',
    ],
    choices: [
      { label: '바닥까지 내려가 본다 (체력 −12)', run: (h) => {
        const g = randInt(30, 60);
        h.hp(-12); h.gold(g);
        if (Math.random() < 0.25) { h.give('moss_salve'); h.say('먼지 속에 봉해진 약 단지도 하나 있었다.'); }
        h.say(`좁은 벽에 날개가 긁혔다. 바닥 먼지 속에서 사람들이 던진 소원 동전 ${g}닢을 건졌다. (체력 −12)`);
      } },
      { label: '돌멩이 하나를 던지고 소원을 빈다', run: (h) => {
        h.mind(6); h.purify(5);
        h.say('한참 뒤에야 바닥에 닿는 소리가 났다. 이 땅에 다시 물이 차오르기를. (정신 +6, 정화 기여 +5)');
      } },
    ],
  },
  {
    id: 'ruin_windmill',
    title: '다시 도는 풍차',
    ruin: true,
    when: ['explore'],
    weight: 3,
    cond: (c) => c.region === 'ruin_plain',
    text: () => [
      '언덕 위 풍차가 바람도 없는데 삐걱이며 한 바퀴를 돈다. 날개 천은 다 해져 뼈대만 남았다.',
    ],
    choices: [
      { label: '날갯짓으로 바람을 일으켜 돌려 준다 (기력 −8)', run: (h) => {
        h.en(-8); h.purify(10); h.mind(4);
        h.say('큰 날개로 바람을 몰아 주자 풍차가 오래 잊었던 소리를 내며 힘차게 돌았다. 맷돌 사이로 하얀 가루가 흘렀다. (기력 −8, 정화 기여 +10, 정신 +4)');
      } },
      { label: '풍차 안을 살핀다', run: (h) => {
        h.give('ashen_dust', 2);
        if (Math.random() < 0.3) { const g = randInt(20, 40); h.gold(g); h.say(`방앗간 주인의 돈궤에 금화 ${g}닢이 남아 있었다.`); }
        h.say('맷돌 틈마다 밀가루 대신 잿빛 먼지가 가득했다. (잿빛 먼지 2)');
      } },
    ],
  },
  {
    id: 'ruin_knight_oath',
    title: '무릎 꿇은 기사',
    ruin: true,
    when: ['hunt'],
    weight: 4,
    cond: (c) => c.region === 'ruin_capital',
    text: () => [
      '쓰러진 기사단 사이에서, 마지막 하나가 투구를 벗고 무릎을 꿇는다. 얼굴은 잿빛으로 굳어 있지만 눈빛만은 맑다.',
      '"용이여. 우리는 성문을 지키겠다고 맹세했소. 이제 그 맹세를 받아 주겠소?"',
    ],
    choices: [
      { label: '맹세를 받아 준다', run: (h) => {
        h.purify(14); h.fame(2); h.mind(5);
        h.say('고개를 끄덕이자 기사는 검을 바닥에 꽂고 미소 지으며 흩어졌다. 무너진 성문 위로 바람이 한 번 크게 불었다. (정화 기여 +14, 명성 +2, 정신 +5)');
      } },
      { label: '그의 검을 거두어 간다', run: (h) => {
        h.give('blackened_scale', 2); const g = randInt(25, 50); h.gold(g); h.mind(-6);
        h.say(`기사의 손에서 검을 빼냈다. 칼자루에 박힌 금장식 ${g}닢어치와 검게 물든 비늘 장식을 떼어 냈다. 기사는 아무 말 없이 사라졌다. (정신 −6)`);
      } },
    ],
  },
  {
    id: 'ruin_cracked_bell',
    title: '금 간 종',
    ruin: true,
    when: ['explore'],
    weight: 3,
    cond: (c) => c.region === 'ruin_capital',
    text: () => [
      '무너진 종탑 아래 커다란 종이 옆으로 누워 있다. 한가운데로 길게 금이 갔다.',
      '종 안쪽에 이름이 빽빽하게 새겨져 있다. 이 도시에서 태어난 아이들의 이름 같다.',
    ],
    choices: [
      { label: '꼬리로 종을 친다', run: (h) => {
        h.fame(1); h.purify(8); h.mind(-3);
        h.say('갈라진 소리가 무너진 거리를 따라 멀리 퍼졌다. 어딘가에서 그 소리에 답하듯 깃발이 펄럭였다. (명성 +1, 정화 기여 +8, 정신 −3)');
      } },
      { label: '이름들을 하나씩 읽어 준다', run: (h, c) => {
        const xp = 20 + c.level * 3;
        h.mind(5); h.xp(xp);
        h.say(`해가 기울 때까지 이름을 읽었다. 누구 하나 대답하지 않았지만, 읽는 동안은 이 도시가 조금 덜 조용했다. (정신 +5, 경험 +${xp})`);
      } },
    ],
  },
  {
    id: 'ruin_void_mirror',
    title: '나를 흉내 내는 그림자',
    ruin: true,
    when: ['explore', 'hunt'],
    weight: 4,
    cond: (c) => c.region === 'ruin_rift',
    text: (c) => [
      '균열 가장자리, 공허의 망령 하나가 내 모습을 하고 서 있다. 날개를 펴면 따라 펴고, 고개를 기울이면 따라 기울인다.',
      `그것이 입을 열었다. 내 목소리로. "${c.me}. 너는 왜 여기 왔지?"`,
    ],
    choices: [
      { label: '"이 땅을 되찾으러"라고 답한다', run: (h) => {
        h.mind(-6); h.purify(12);
        h.say('그림자는 한동안 나를 빤히 보더니 똑같이 대답하고는 금이 가듯 부서졌다. (정신 −6, 정화 기여 +12)');
      } },
      { label: '숨결로 꿰뚫는다 (기력 −8)', run: (h) => {
        h.en(-8); h.give('ghost_ash', 2);
        h.say('그림자가 마지막까지 내 얼굴로 웃으며 흩어졌다. 차가운 재가 남았다. (기력 −8, 망령의 재 2)');
      } },
      { label: '눈을 감고 지나간다', run: (h) => { h.mind(-8); h.say('발소리가 두 개였다. 균열을 벗어날 때까지. (정신 −8)'); } },
    ],
  },
  {
    id: 'ruin_elder_bones',
    title: '고룡의 갈비뼈',
    ruin: true,
    when: ['explore', 'gather'],
    weight: 3,
    cond: (c) => c.region === 'ruin_rift',
    text: () => [
      '심연의 문턱 앞, 산처럼 큰 갈비뼈가 아치를 이루고 있다. 지금 이 땅을 지키는 고룡보다도 훨씬 오래된 뼈다.',
    ],
    choices: [
      { label: '뼈 사이에서 하룻밤 쉰다', run: (h) => {
        h.hp(25); h.mind(8);
        h.say('거대한 갈비뼈가 바람을 막아 주었다. 꿈에 낯선 노래가 들렸고, 눈을 떴을 땐 몸이 가벼웠다. (체력 +25, 정신 +8)');
      } },
      { label: '뼈에 새겨진 문양을 따라 그린다', run: (h, c) => {
        const xp = 35 + c.level * 4;
        h.xp(xp); h.mind(-5);
        h.say(`문양은 숨결을 다루는 오래된 방식이었다. 따라 그릴수록 머리가 지끈거렸다. (경험 +${xp}, 정신 −5)`);
      } },
    ],
  },
  {
    id: 'ruin_companion_sniff',
    title: '잿빛 먼지에 재채기',
    ruin: true,
    when: ['hunt', 'explore'],
    weight: 3,
    cond: (c) => !!c.perks.ally && !!c.k(c.perks.ally.id),
    setup: (c) => ({ id: c.perks.ally.id }),
    text: (c, v) => { const k = c.k(v.id); return [
      `곁을 따르던 ${k.name}${c.josa(k.name, '이', '가')} 잿빛 먼지를 들이마시고는 크게 재채기를 했다. 작은 불똥이 튀었다.`,
      `${k.name}${c.josa(k.name, '은', '는')} 코를 찡그리면서도 무언가를 발견한 듯 바위틈을 앞발로 긁고 있다.`,
    ]; },
    choices: [
      { label: '바위틈을 함께 파 본다', run: (h, c, v) => {
        const k = c.k(v.id); h.bond(k, 3);
        if (Math.random() < 0.5) { h.give('ashen_core'); h.say(`${h.name(k)} 잿빛 덩어리를 물고 자랑스럽게 고개를 들었다. (유대 +3, 잿빛 심장)`); }
        else { h.give('ashen_dust', 2); h.say(`${h.name(k)} 먼지만 잔뜩 뒤집어쓰고 시무룩해졌다. 머리를 쓰다듬어 주었다. (유대 +3, 잿빛 먼지 2)`); }
      } },
      { label: '날개로 먼지를 막아 준다', run: (h, c, v) => {
        const k = c.k(v.id); h.bond(k, 5); h.mind(4);
        h.say(`${h.name(k)} 날개 밑으로 쏙 들어와 몸을 붙였다. 이 땅에서도 따뜻한 것이 하나는 있었다. (유대 +5, 정신 +4)`);
      } },
    ],
  },
  {
    id: 'ruin_ash_flower',
    title: '잿더미의 하얀 꽃',
    ruin: true,
    when: ['gather', 'explore'],
    weight: 2,
    cond: () => true,
    text: () => [
      '잿더미 사이에서 하얀 꽃 한 송이가 고개를 내밀었다. 꽃잎 끝이 아주 옅게 푸르다.',
      '이 땅에서 처음 보는, 살아 있는 색이다.',
    ],
    choices: [
      { label: '둘레의 재를 걷어 내 준다', run: (h) => {
        h.purify(10); h.mind(6);
        h.say('발톱 끝으로 재를 조심조심 걷어 냈다. 꽃이 고개를 조금 더 들었다. (정화 기여 +10, 정신 +6)');
      } },
      { label: '꺾어 둥지에 가져간다', run: (h) => {
        h.give('wild_flower'); h.mind(10);
        h.say('품에 넣고 날아오는 동안에도 꽃은 시들지 않았다. (정신 +10, 들꽃)');
      } },
    ],
  },
  {
    id: 'ruin_fellow_mark',
    title: '먼저 온 발톱 자국',
    ruin: true,
    when: ['explore', 'hunt'],
    weight: 3,
    cond: () => true,
    text: () => [
      '바위에 깊은 발톱 자국이 나 있다. 오래되지 않았다. 다른 드래곤이 이곳을 지나며 남긴 표식이다.',
      '자국 옆에 정화의 결정 하나가 놓여 있다. 뒤에 올 누군가를 위해 두고 간 것 같다.',
    ],
    choices: [
      { label: '결정을 챙기고 내 표식을 남긴다', run: (h) => {
        h.give('purify_shard'); h.fame(1);
        h.say('결정을 집어 들고, 그 옆에 내 발톱 자국을 나란히 새겼다. 다음에 올 누군가가 알아보기를. (정화의 결정 +1, 명성 +1)');
      } },
      { label: '결정은 두고, 내 결정 하나를 더 놓는다', run: (h) => {
        h.take('purify_shard', 1); h.purify(12); h.mind(8);
        h.say('두 개가 된 결정이 잿빛 빛 속에서 나란히 반짝였다. 이 땅을 되찾으려는 게 혼자가 아니라는 걸 알았다. (정화의 결정 −1, 정화 기여 +12, 정신 +8)');
      }, need: (c) => (c.have('purify_shard') >= 1 ? null : '정화의 결정이 있어야 한다.') },
    ],
  },
  // ── 오염된 땅 ──
  {
    id: 'void_tomb',
    ruinToo: true, // 멸망한 대륙에서도 뜸
    title: '오염에 잠긴 옛 용의 무덤',
    when: ['explore'],
    weight: 5,
    cond: (c) => c.corrupted,
    text: () => [
      '검붉은 안개 사이로 거대한 뼈가 드러났다. 오래전 이 땅에서 쓰러진 용의 무덤이다.',
      '갈비뼈 사이에 무언가 반짝인다. 하지만 무덤 전체가 검은 기운으로 고동치고 있다.',
    ],
    choices: [
      { label: '무덤을 파헤친다 (정신 −15)', run: (h) => {
        h.mind(-15);
        const g = randInt(30, 70);
        h.gold(g); h.give('blackened_scale', 2);
        if (Math.random() < 0.2) { h.give('ancient_relic'); h.say('뼈 무더기 아래에서 고대의 유물까지 나왔다.'); }
        h.say(`손끝이 얼어붙을 듯한 냉기를 견디며 뒤졌다. 금화 ${g}닢과 검게 물든 비늘 2장을 챙겼다. (정신 −15)`);
      } },
      { label: '옛 용의 넋을 기린다', run: (h) => {
        h.mind(10); h.purify(12);
        h.say('무덤 앞에 고개를 숙이고 오래 머물렀다. 고동치던 검은 기운이 조금 잦아들었다. (정신 +10, 정화 기여 +12)');
      } },
      { label: '건드리지 않고 지나간다', run: (h) => h.say('죽은 자는 쉬게 두는 법이다. 날개를 접고 조용히 지나쳤다.') },
    ],
  },
  {
    id: 'void_whisper',
    ruinToo: true, // 멸망한 대륙에서도 뜸
    title: '속삭이는 목소리',
    when: ['explore', 'gather'],
    weight: 4,
    cond: (c) => c.corrupted && (c.d.mind ?? 100) >= 30,
    text: () => [
      '머릿속에서 낯선 목소리가 속삭인다. "네 정신 한 조각만 내게 다오. 그러면 원하는 것을 주마."',
      '목소리는 달콤하고, 거절하기 어려울 만큼 가깝다.',
    ],
    choices: [
      { label: '힘을 원한다 (정신 −25)', run: (h) => {
        h.mind(-25); h.buff('frenzy', 60);
        h.say('검은 기운이 혈관을 타고 흘러들었다. 발톱 끝까지 힘이 끓어오른다. (광기 60분: 공격 +25%, 받는 피해 +10%, 정신 −25)');
      } },
      { label: '부를 원한다 (정신 −25)', run: (h) => {
        const g = randInt(60, 110);
        h.mind(-25); h.gold(g);
        h.say(`발밑의 흙이 금빛으로 일렁이더니 금화 ${g}닢이 솟아올랐다. 머릿속이 지끈거린다. (정신 −25)`);
      } },
      { label: '목소리를 떨쳐 낸다', run: (h) => {
        h.mind(6); h.purify(5);
        h.say('크게 포효해 목소리를 떨쳐 냈다. 머릿속이 조금 맑아졌다. (정신 +6, 정화 기여 +5)');
      } },
    ],
  },
  {
    id: 'void_trapped_human',
    title: '오염에 갇힌 사람',
    when: ['explore', 'gather'],
    weight: 4,
    cond: (c) => c.corrupted,
    text: () => [
      '검은 덩굴에 휘감긴 인간 약초꾼이 정신을 잃고 쓰러져 있다.',
      '덩굴이 천천히 숨통을 조여 온다. 이대로 두면 오래 버티지 못할 것이다.',
    ],
    choices: [
      { label: '덩굴을 태워 구해 낸다 (기력 10, 정신 −8)', need: (c) => (c.d.en < 10 ? '기력이 모자란다.' : null), run: (h, c) => {
        const t = h.nearestTown();
        h.en(-10); h.mind(-8); h.rep(t, 10); h.purify(8);
        if (c.stance === 'friendly') h.fame(-1);
        h.give('purify_incense');
        h.say(`숨결로 덩굴을 태워 약초꾼을 끌어냈다. 깨어난 약초꾼은 떨리는 손으로 정화의 향을 건넸다. "${REGIONS[t].name}에 꼭 알리겠습니다." (${REGIONS[t].name} 평판 +10, 정화 기여 +8)`);
      } },
      { label: '짐을 털어 간다', show: (c) => c.stance === 'hostile', run: (h) => {
        const g = randInt(15, 35);
        h.gold(g); h.give('glow_moss', 2); h.rep(h.nearestTown(), -6); h.fame(1);
        h.say(`쓰러진 약초꾼의 짐에서 금화 ${g}닢과 빛나는 이끼를 챙겼다. 덩굴은 그대로 두었다.`);
      } },
      { label: '못 본 척 지나간다', run: (h) => { h.mind(-3); h.say('뒤에서 가느다란 신음이 따라왔다. 마음이 무겁다. (정신 −3)'); } },
    ],
  },
];
