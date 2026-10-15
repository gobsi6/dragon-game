// 이벤트 목록
// 새 이벤트를 넣거나 확률·조건을 바꿀 때는 이 파일만 고치면 됩니다.
//
// 이벤트 하나의 모양
//   id       고유 이름
//   title    선택 창 제목
//   when     일어나는 때: explore(탐사) gather(채집) expedition(원정 귀환) wake(둥지에서 깨어남) intimidate(위협 성공)
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
//   식구를 다루는 이벤트는 setup에서 대상 id를 골라 두고, text·run에서 c.k(v.id)로 꺼냅니다.
//   그 사이 식구가 떠나 버리면 이벤트는 조용히 지나갑니다.
// h (결과 만들기): say(문장) gold(n) give(id, n) take(id, n) rep(지역, n) fame(n) hp(n) en(n)
//           adopt(유래) egg(종류) bond(식구, n) lean(식구, 재주, n) train(새끼, 능력치) leave(식구, 상태)
//           nudge(새끼, 성향, 일)(성격을 그 성향 쪽으로)
//           nearestTown() name(식구 → '미르가') josa(말, 받침, 없음)

const { ITEMS, KINDS, REGIONS, SHOPS } = require('./game-data');

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

module.exports = [
  // ── 아이를 만나는 길: 성향마다 다름 ──
  {
    id: 'abandoned_baby',
    title: '성문 곁의 바구니',
    when: ['explore'],
    weight: 3,
    cond: (c) => c.stance === 'friendly' && c.town && c.rep >= 20 && c.nest && !c.full,
    text: () => [
      '성문 곁 그늘에 작은 바구니 하나가 놓여 있다.',
      '안에서 강보에 싸인 아기가 드래곤을 올려다보며 방긋 웃는다.',
      '지나가던 아낙이 "부디 그 아이를…" 하고 말끝을 흐린다.',
    ],
    choices: [
      { label: '둥지로 데려가 기른다', run: (h, c) => {
        h.adopt('abandoned'); h.rep(c.region, 5);
        h.say('바구니를 조심스레 발톱에 걸고 날아올랐다. 마을 사람들이 고개 숙여 배웅한다.');
      } },
      { label: '고아원에 맡기고 금화를 보탠다 (금화 20)', need: (c) => (c.d.gold < 20 ? '금화가 모자란다.' : null), run: (h, c) => {
        h.gold(-20); h.rep(c.region, 6);
        h.say('아기를 고아원 문 앞에 데려다주고 금화를 남겼다.');
      } },
      { label: '그냥 지나친다', run: (h) => h.say('바구니를 뒤로하고 날아올랐다. 등 뒤로 작은 울음소리가 들렸다.') },
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
      const home = Object.entries(KINDS).find(([, k]) => k.home === c.region);
      return { kind: home ? home[0] : pick(Object.keys(KINDS)) };
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
    setup: (c) => ({ kind: pick(Object.keys(KINDS)), level: Math.max(1, c.d.level + randInt(-1, 2)) }),
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
    text: () => ['왕도에 축제가 열렸다. 거리마다 깃발이 나부끼고 음악이 흐른다.', '아이들이 드래곤을 보고 손을 흔든다.'],
    choices: [
      { label: '광장에 내려앉아 함께 즐긴다', run: (h, c) => {
        h.rep(c.region, 4); h.gold(15); h.fame(-2);
        h.say('사람들이 꽃과 금화를 던져 주었다. 드래곤들은 이 모습을 탐탁지 않게 여길 것이다.');
      } },
      { label: '하늘에 불꽃을 뿜어 축하한다 (기력 8)', need: (c) => (c.d.en < 8 ? '기력이 모자란다.' : null), run: (h, c) => {
        h.en(-8); h.rep(c.region, 8); h.fame(-1);
        h.say('밤하늘에 숨결을 흩뿌리자 거리 전체가 환호성으로 뒤덮였다.');
      } },
      { label: '멀리서 지켜본다', run: (h) => h.say('구름 위에서 축제의 불빛을 한참 내려다보았다.') },
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
      { label: '고약을 발라 준다 (꿀 고약 또는 약초상 연고)', need: (c) => (c.have('honey_salve') + c.have('herbal_ointment') < 1 ? '고약이 없다.' : null), run: (h, c, v) => {
        const k = c.k(v.id);
        h.take(c.have('honey_salve') ? 'honey_salve' : 'herbal_ointment'); h.bond(k, 10);
        h.say(`고약을 발라 주자 ${h.name(k)} 새근새근 잠들었다.`);
      } },
      { label: '마을 의원에게 데려간다 (금화 15)', show: (c) => c.stance !== 'hostile', need: (c) => (c.d.gold < 15 ? '금화가 모자란다.' : null), run: (h, c, v) => {
        h.gold(-15); h.bond(c.k(v.id), 6);
        h.say('의원은 드래곤을 보고 놀랐지만, 아이를 정성껏 돌봐 주었다.');
      } },
      { label: '밤새 곁을 지킨다 (기력 10)', run: (h, c, v) => {
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
    cond: (c) => c.humans.some((x) => ['아이', '소년', '청년'].includes(c.stage(x))),
    setup: (c) => ({ id: c.pick(c.humans.filter((x) => ['아이', '소년', '청년'].includes(c.stage(x)))).id }),
    text: (c, v) => { const k = c.k(v.id); return [`${k.name}${c.josa(k.name, '이', '가')} 꼬리에 기대앉아 묻는다.`, '"나는 왜 사람이고, 너는 왜 용이야?"']; },
    choices: [
      { label: '사람의 마을 이야기를 들려준다', run: (h, c, v) => { const k = c.k(v.id); h.bond(k, 5); h.lean(k, 'herbalist', 2); h.say('약초 냄새 가득한 시장 이야기에 아이의 눈이 반짝였다.'); } },
      { label: '용의 옛이야기를 들려준다', run: (h, c, v) => { const k = c.k(v.id); h.bond(k, 5); h.lean(k, 'guard', 2); h.say('하늘을 지키던 옛 용들의 이야기에 아이가 주먹을 꼭 쥐었다.'); } },
      { label: '대장간의 불 이야기를 들려준다', run: (h, c, v) => { const k = c.k(v.id); h.bond(k, 5); h.lean(k, 'smith', 2); h.say('쇠를 두드려 칼을 만드는 이야기에 아이가 손뼉을 쳤다.'); } },
      { label: '대답하지 않는다', run: (h, c, v) => { h.bond(c.k(v.id), -3); h.say('대답 대신 눈을 감았다. 아이는 한참을 말없이 앉아 있었다.'); } },
    ],
  },
  {
    id: 'rescue_raid',
    title: '기사단의 구출',
    when: ['wake', 'explore'],
    weight: (c) => (c.perks.guard ? 2 : 4),
    cond: (c) => c.stance === 'hostile' && c.humans.some((x) => x.data.path !== 'knight'),
    setup: (c) => ({ id: c.pick(c.humans.filter((x) => x.data.path !== 'knight')).id }),
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
      { label: '함께 날아오른다', run: (h, c, v) => {
        const k = c.k(v.id);
        h.bond(k, 10); h.train(k, 'wing'); k.data.flew = true;
        h.say('옆에서 바람을 받쳐 주자, 새끼가 처음으로 하늘에 떴다. 날개 +1');
      } },
      { label: '스스로 날 때까지 지켜본다', run: (h, c, v) => {
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
      { label: '둘 다 꾸짖는다', run: (h, c, v) => {
        h.bond(c.k(v.a), -2); h.bond(c.k(v.b), -2); h.fame(1);
        h.say('낮게 울리는 한마디에 둘 다 고개를 푹 숙였다. 둥지에 질서가 섰다.');
      } },
      { label: '함께 놀게 해 준다 (기력 6)', need: (c) => (c.d.en < 6 ? '기력이 모자란다.' : null), run: (h, c, v) => {
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
    title: '첫 약탈',
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
];
