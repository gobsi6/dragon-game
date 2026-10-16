// 둥지의 삶: 이벤트 엔진과 둥지 식구(인간 아이, 알과 새끼 드래곤)
// 숫자는 game-data.js의 KIN·TALENTS·EVENT_RULES, 이벤트 내용은 game-events.js에서 조절합니다.
//
// 식구(kin) 하나의 모양: { id, type: 'human'|'drake', status, name, data }
//   status: home(함께 삶) egg(알) returned(마을로 돌아감) dead(세상을 떠남) independent(독립함)
// 모든 함수는 식구 목록 kin을 직접 바꿉니다. 새 식구는 id가 null이고, 저장은 server.js가 합니다.

const {
  ITEMS, KINDS, REGIONS, SHOPS, STATS, REGION_LOOT, DAY, KIN, TALENTS, HUMAN_NAMES, DRAKE_NAMES, EVENT_RULES,
} = require('./game-data');
const logic = require('./game-logic');
const EVENTS = require('./game-events');

const STAT_KEYS = STATS.map((s) => s.key);
const H = KIN.human;
const R = KIN.drake;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
function josa(word, a, b) {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return `${a}(${b})`;
  return c % 28 ? a : b;
}
const ga = (k) => `${k.name}${josa(k.name, '이', '가')}`;
const fmtDays = (d) => (d >= 1 ? `${Math.ceil(d)}일` : `${Math.max(1, Math.ceil(d * 24))}시간`);

// ── 나이와 성장 단계 ──────────────────────────────
const isHome = (k) => k.status === 'home' || k.status === 'egg';
const ageOf = (k, now) => (k.data.born ? (now - k.data.born) / DAY : 0);
function stageOf(k, now) {
  if (k.status === 'egg') return { i: -1, name: '알', next: null };
  const list = k.type === 'human' ? H.stages : R.stages;
  let i = 0;
  const a = ageOf(k, now);
  list.forEach((s, j) => { if (a >= s.from) i = j; });
  return { i, name: list[i].name, next: list[i + 1] ? list[i + 1].from : null };
}
// 함께 사는 식구들: 인간, 깨어난 새끼, 알
function homeKin(kin) {
  const home = kin.filter(isHome);
  return {
    home,
    humans: home.filter((k) => k.type === 'human'),
    drakes: home.filter((k) => k.type === 'drake' && k.status === 'home'),
    eggs: home.filter((k) => k.status === 'egg'),
    full: home.length >= KIN.maxKin,
  };
}
const findKin = (kin, id) => kin.find((k) => k.id === Number(id) && isHome(k));
const atNest = (d) => {
  if (d.exp_end) return '원정을 떠나 있는 동안에는 할 수 없다.';
  if (!d.nest || d.region !== d.nest) return '식구는 둥지에 있을 때만 돌볼 수 있다.';
  return null;
};

// 가장 가까운 인간 마을
function nearestTown(region) {
  const r = REGIONS[region];
  return Object.keys(SHOPS).sort((a, b) =>
    Math.hypot(REGIONS[a].x - r.x, REGIONS[a].y - r.y) - Math.hypot(REGIONS[b].x - r.x, REGIONS[b].y - r.y))[0];
}

// ── 새 식구 ────────────────────────────────────────
// 함께 사는 식구와 겹치지 않는 이름 (다 겹치면 아무거나)
function freshName(kin, names) {
  const used = new Set(kin.filter(isHome).map((k) => k.name));
  const free = names.filter((n) => !used.has(n));
  return pick(free.length ? free : names);
}
function newHuman(origin, now, town) {
  const lean = { herbalist: 0, smith: 0, guard: 0 };
  if (origin === 'abandoned') lean.herbalist += 1;   // 마을 사람들 손에서 자람
  if (origin === 'lost') lean.smith += 1;            // 홀로 버틴 손재주
  if (origin === 'tribute') lean.guard += 2;         // 겁먹지 않는 아이
  return {
    id: null, type: 'human', status: 'home', name: pick(HUMAN_NAMES),
    // lastCare를 돌보기 간격만큼 앞당겨 둬서, 데려오자마자 처음 돌보기를 할 수 있음
    data: { born: now, origin, town: town || null, bond: H.startBond, lean, trips: 0, lastCare: now - H.careCooldown, decayed: 0, stage: 0 },
  };
}
function newEgg(kind, now) {
  return { id: null, type: 'drake', status: 'egg', name: pick(DRAKE_NAMES), data: { kind, found: now, incubateAt: null } };
}
function hatch(k, at) {
  const base = KINDS[k.data.kind].stats;
  k.status = 'home';
  Object.assign(k.data, {
    born: at, bond: 20, trains: 0, lastTrain: 0, lastHunt: at, stanceMs: {}, tickAt: at, stage: 0,
    stats: Object.fromEntries(STAT_KEYS.map((s) => [s, Math.round(base[s] / 3)])),
  });
}

// 어른이 될 때 정해지는 재주: 가장 많이 기운 쪽 (같으면 자라 온 내력대로)
function topLean(k) {
  const order = { tribute: 'guard', abandoned: 'herbalist', lost: 'smith' }[k.data.origin] || 'herbalist';
  let best = order;
  for (const [t, v] of Object.entries(k.data.lean)) if (v > k.data.lean[best]) best = t;
  return best;
}
// 세상을 떠나며 남기는 유품: 함께한 깊이에 따라
function keepsakeOf(k) {
  if (k.data.path === 'knight') return 'keepsake_sword';
  if (k.data.bond >= 70) return 'keepsake_scale';
  if (k.data.bond >= 40) return 'keepsake_toy';
  return 'keepsake_cloth';
}
// 새끼의 성격: 가장 오래 지켜본 어미의 성향
function personalityOf(k) {
  const ms = k.data.stanceMs || {};
  return Object.keys(ms).sort((a, b) => ms[b] - ms[a])[0] || 'hermit';
}

// ── 시간이 흐르며 일어나는 일 ──────────────────────
// 접속하거나 무언가를 할 때마다 부름. 지난 시간만큼 한꺼번에 계산함
function tick(d, kin, now = Date.now()) {
  const out = { lines: [], items: [], hoardItems: [], gold: 0 };
  for (const k of kin) {
    if (k.type === 'human' && k.status === 'home') {
      const a = ageOf(k, now);
      // 오래 돌보지 않으면 유대가 줄어듦
      const idle = Math.floor((now - k.data.lastCare) / DAY) - H.neglectAfter;
      if (idle > (k.data.decayed || 0)) {
        const n = (idle - (k.data.decayed || 0)) * H.neglectPerDay;
        k.data.bond = clamp(k.data.bond - n);
        k.data.decayed = idle;
        out.lines.push(`${ga(k)} 외로워한다. 한동안 돌봐 주지 못했다. (유대 −${n})`);
        out.lines.push(...logic.traitCount(d, 'neglect')); // 특성: 냉담
      }
      const st = stageOf(k, now);
      if (st.i > (k.data.stage || 0)) {
        k.data.stage = st.i;
        if (a < H.adultDay) out.lines.push(`${ga(k)} 자라서 '${st.name}'${josa(st.name, '이', '가')} 되었다.`);
        else if (st.name === '노년' && a < H.lifespan) out.lines.push(`${k.name}의 머리에 흰 서리가 내렸다. 남은 날이 많지 않다.`);
      }
      if (a >= H.adultDay && !k.data.talent) {
        k.data.talent = topLean(k);
        out.lines.push(`${ga(k)} 어른이 되었다. 재주는 '${TALENTS[k.data.talent].name}'. 둥지에서 갈 길을 정해 주자.`);
      }
      // 약초꾼은 꿀 고약을 만들어 둠
      if (k.data.path === 'stay' && k.data.talent === 'herbalist') {
        if (!k.data.lastMake) k.data.lastMake = now;
        let n = 0;
        while (now - k.data.lastMake >= H.herbEvery && n < 3) { k.data.lastMake += H.herbEvery; n++; }
        if (now - k.data.lastMake >= H.herbEvery) k.data.lastMake = now; // 오래 비웠으면 3개까지만
        if (n) {
          out.items.push({ id: 'honey_salve', qty: n });
          out.lines.push(`${ga(k)} 꿀 고약 ${n}개를 만들어 두었다.`);
        }
      }
      // 인간의 생은 드래곤보다 훨씬 짧음
      if (a >= H.lifespan) {
        k.status = 'dead';
        k.data.ended = now;
        const id = keepsakeOf(k);
        (d.nest ? out.hoardItems : out.items).push({ id, qty: 1 });
        out.lines.push(
          `${ga(k)} 긴 잠에 들었다. 드래곤의 날개 아래에서 ${Math.floor(a)}일의 생을 마쳤다.`,
          `${ITEMS[id].name}${josa(ITEMS[id].name, '이', '가')} ${d.nest ? '보물더미에' : '소지품에'} 남았다.`,
        );
      }
    }
    // 품지 않은 알은 점점 식음
    if (k.type === 'drake' && k.status === 'egg' && !k.data.incubateAt) {
      const e = (now - k.data.found) / DAY;
      if (e >= R.eggColdDays) {
        k.status = 'cold';
        k.data.ended = now;
        out.lines.push(`${KINDS[k.data.kind].name}의 알이 차갑게 식었다. 끝내 품어 주지 못했다.`);
        continue;
      }
      if (e >= R.eggWarnDays && !k.data.warned) {
        k.data.warned = true;
        const need = ITEMS[KIN.eggNeeds[k.data.kind]].name;
        out.lines.push(`알의 온기가 점점 옅어진다. ${fmtDays(R.eggColdDays - e)} 안에 ${need}${josa(need, '으로', '로')} 품어 주지 않으면 식어 버린다.`);
      }
    }
    // 알이 깨어남
    if (k.type === 'drake' && k.status === 'egg' && k.data.incubateAt && now >= k.data.incubateAt + R.hatchTime) {
      hatch(k, k.data.incubateAt + R.hatchTime);
      const kn = KINDS[k.data.kind].name;
      out.lines.push(`알이 깨지고 ${ga(k)} 태어났다! 작은 ${kn}${josa(kn, '이다', '다')}.`);
    }
    if (k.type === 'drake' && k.status === 'home') {
      // 어미의 성향을 보고 자람
      const dt = Math.max(0, now - (k.data.tickAt || now));
      k.data.stanceMs[d.stance] = (k.data.stanceMs[d.stance] || 0) + dt;
      k.data.tickAt = now;
      const a = ageOf(k, now);
      const st = stageOf(k, now);
      if (st.i > (k.data.stage || 0)) {
        k.data.stage = st.i;
        out.lines.push(`${ga(k)} 자라서 '${st.name}'${josa(st.name, '이', '가')} 되었다.`);
      }
      // 젊은 용부터 혼자 사냥해 옴
      if (a >= R.huntFrom && !k.data.onExp) {
        let n = 0;
        while (now - k.data.lastHunt >= R.huntEvery && n < 3) { k.data.lastHunt += R.huntEvery; n++; }
        if (now - k.data.lastHunt >= R.huntEvery) k.data.lastHunt = now;
        if (n) {
          const fangs = Array.from({ length: n }, () => Math.random() < 0.3).filter(Boolean).length;
          out.items.push({ id: 'beast_hide', qty: n });
          if (fangs) out.items.push({ id: 'sharp_fang', qty: fangs });
          out.lines.push(`${ga(k)} 혼자 사냥해서 짐승 가죽 ${n}장${fangs ? `과 송곳니 ${fangs}개` : ''}를 물어 왔다.`);
        }
      }
      if (a >= R.independentDay && !k.data.readyTold) {
        k.data.readyTold = true;
        out.lines.push(`${ga(k)} 둥지 밖 하늘을 오래 바라본다. 떠날 때가 된 것 같다.`);
      }
    }
  }
  // 독립한 새끼들이 가끔 선물을 보냄
  const gone = kin.filter((k) => k.type === 'drake' && k.status === 'independent')
    .sort((a, b) => b.data.ended - a.data.ended).slice(0, R.giftFrom);
  for (const k of gone) {
    let n = 0;
    while (now - k.data.lastGift >= R.giftEvery && n < 2) { k.data.lastGift += R.giftEvery; n++; }
    if (!n) continue;
    const g = randInt(10, 30) * n;
    out.gold += g;
    const loot = REGION_LOOT[KINDS[k.data.kind].home];
    const id = loot ? pick(loot.uncommon) : null;
    if (id) out.items.push({ id, qty: 1 });
    out.lines.push(`독립한 ${ga(k)} 선물을 보내왔다. 금화 ${g}닢${id ? `과 ${ITEMS[id].name}` : ''}.`);
  }
  d.gold += out.gold;
  return out;
}

// ── 식구가 주는 도움 ──────────────────────────────
// 어른이 되어 길을 정한 인간만. game-logic.js가 d.perks로 읽음
function perksOf(kin) {
  const p = {};
  for (const k of kin) {
    if (k.type !== 'human' || k.status !== 'home' || !k.data.path) continue;
    if (k.data.path === 'stay') {
      p[k.data.talent] = k.name;
      if (k.data.bond >= H.traderBond) p.trader = k.name;
    }
    if (k.data.path === 'knight') p.knight = k.name;
  }
  return p;
}

// 프로필에 보여 줄 짧은 요약
function summary(kin, now) {
  return {
    home: kin.filter(isHome).map((k) => ({ name: k.name, type: k.type, stage: stageOf(k, now).name })),
    lineage: kin.filter((k) => k.type === 'drake' && k.status === 'independent').length,
  };
}

// 둥지 창에 보여 줄 식구 정보
function view(k, now, d) {
  const v = { id: k.id, type: k.type, status: k.status, name: k.name };
  const st = stageOf(k, now);
  v.stage = st.name;
  if (k.status === 'egg' || k.status === 'cold') {
    v.kind = k.data.kind;
    if (k.status === 'cold') { v.ended = k.data.ended; return v; }
    v.need = KIN.eggNeeds[k.data.kind];
    v.hatchIn = k.data.incubateAt ? Math.max(0, k.data.incubateAt + R.hatchTime - now) : null;
    v.coldIn = k.data.incubateAt ? null : Math.max(0, k.data.found + R.eggColdDays * DAY - now);
    return v;
  }
  const a = ageOf(k, isHome(k) ? now : k.data.ended || now); // 떠난 식구는 떠난 날의 나이
  v.age = Math.floor(a);
  v.bond = Math.round(k.data.bond);
  if (isHome(k)) v.nextIn = st.next != null ? (st.next - a) * DAY : null;
  if (k.type === 'human') {
    v.origin = k.data.origin;
    v.talent = k.data.talent || null;
    v.lean = k.data.talent ? null : (Object.values(k.data.lean).some((x) => x > 0) ? topLean(k) : null);
    v.path = k.data.path || null;
    v.lifeLeft = k.status === 'home' && a >= H.adultDay ? (H.lifespan - a) * DAY : null;
    v.choosePath = k.status === 'home' && !!k.data.talent && !k.data.path;
    v.careIn = Math.max(0, k.data.lastCare + H.careCooldown - now);
    v.onExp = !!k.data.onExp;
  } else {
    v.kind = k.data.kind;
    v.stats = k.data.stats;
    v.trains = k.data.trains;
    v.trainLimit = R.trainLimit[Math.max(0, st.i)];
    v.trainIn = Math.max(0, (k.data.lastTrain || 0) + R.trainCooldown - now);
    v.personality = personalityOf(k);
    v.canRelease = k.status === 'home' && a >= R.independentDay;
    v.onExp = !!k.data.onExp;
  }
  if (!isHome(k)) v.ended = k.data.ended || null;
  return v;
}
function views(kin, now, d) {
  return {
    home: kin.filter(isHome).map((k) => view(k, now, d)),
    past: kin.filter((k) => !isHome(k)).sort((a, b) => (b.data.ended || 0) - (a.data.ended || 0)).slice(0, 12).map((k) => view(k, now, d)),
    lineage: kin.filter((k) => k.type === 'drake' && k.status === 'independent').length,
  };
}

// ── 식구 돌보기 ────────────────────────────────────
function care(d, kin, id, item, have, now = Date.now()) {
  const err = atNest(d);
  if (err) return { error: err };
  const k = findKin(kin, id);
  if (!k || k.type !== 'human' || k.status !== 'home') return { error: '돌볼 수 있는 식구가 아니다.' };
  const c = KIN.care[item];
  if (!c) return { error: '그 물건으로는 돌볼 수 없다.' };
  if (have(item) < 1) return { error: '가지고 있지 않다.' };
  if (now - k.data.lastCare < H.careCooldown) return { error: `${ga(k)} 아직 배부르다. 조금 뒤에 다시 돌보자.` };
  const gain = Math.max(1, c.bond + logic.traitMods(d).bond); // 특성: 다정한 발톱·냉담
  k.data.bond = clamp(k.data.bond + gain);
  if (!k.data.talent) k.data.lean[c.talent] += 1;
  k.data.lastCare = now;
  k.data.decayed = 0;
  const name = ITEMS[item].name;
  const react = {
    herbalist: '킁킁 냄새를 맡아 보고는 신기한 듯 만지작거린다.',
    smith: '반짝이는 걸 쥐고 이리저리 두드려 본다.',
    guard: '꼭 쥐고 드래곤 흉내를 내며 으르렁거린다.',
  }[c.talent];
  return { title: k.name, lines: [`${k.name}에게 ${name}${josa(name, '을', '를')} 건넸다. ${react}`, `유대 +${gain}`, ...logic.traitCount(d, 'care')], items: [{ id: item, qty: -1 }] };
}

function rename(kin, id, name) {
  const k = findKin(kin, id);
  if (!k) return { error: '없는 식구다.' };
  if (!/^[가-힣A-Za-z]{1,8}$/.test(name)) return { error: '이름은 한글이나 영문으로 1~8자까지 쓸 수 있다.' };
  k.name = name;
  return { title: '이름', lines: [`이제부터 ${name}${josa(name, '이라', '라')}고 부르기로 했다.`] };
}

// 어른이 된 인간의 갈 길
function choosePath(d, kin, id, path, town, now = Date.now()) {
  const err = atNest(d);
  if (err) return { error: err };
  const k = findKin(kin, id);
  if (!k || k.type !== 'human' || !k.data.talent || k.data.path) return { error: '지금은 정할 수 없다.' };
  if (path === 'stay') {
    k.data.path = 'stay';
    return { title: k.name, lines: [`${ga(k)} 둥지에 남기로 했다. ${TALENTS[k.data.talent].desc}`] };
  }
  if (path === 'knight') {
    if (k.data.bond < H.knightBond) return { error: `용기사로 삼으려면 유대가 ${H.knightBond} 이상이어야 한다.` };
    k.data.path = 'knight';
    return { title: k.name, lines: [`${ga(k)} 등에 올라탔다. 이제 용기사로서 함께 사냥하고 싸운다.`, '사냥 때 발톱 +3, 받는 피해 30% 감소, 위협 성공률 +10%.'] };
  }
  if (path === 'return') {
    if (!SHOPS[town]) return { error: '돌려보낼 마을을 골라야 한다.' };
    const r = logic.repOf(d);
    const before = r[town] || 0;
    r[town] = clamp(Math.max(before, -20) + H.returnRep, -100, 100);
    k.status = 'returned';
    k.data.path = 'return';
    k.data.ended = now;
    return { title: k.name, lines: [
      `${ga(k)} ${REGIONS[town].name}${josa(REGIONS[town].name, '으로', '로')} 돌아갔다. 드래곤에게 길러진 사람의 이야기가 마을에 퍼진다.`,
      `${REGIONS[town].name} 평판 ${before} → ${r[town]}`,
    ] };
  }
  return { error: '알 수 없는 길이다.' };
}

// ── 알과 새끼 드래곤 ──────────────────────────────
function incubate(d, kin, id, have, now = Date.now()) {
  const err = atNest(d);
  if (err) return { error: err };
  const k = findKin(kin, id);
  if (!k || k.status !== 'egg') return { error: '품을 알이 없다.' };
  if (k.data.incubateAt) return { error: '이미 품고 있다.' };
  const need = KIN.eggNeeds[k.data.kind];
  if (have(need) < 1) return { error: `${ITEMS[need].name}${josa(ITEMS[need].name, '이', '가')} 있어야 알을 품을 수 있다.` };
  k.data.incubateAt = now;
  return {
    title: '알',
    lines: [`${ITEMS[need].name}${josa(ITEMS[need].name, '을', '를')} 알 곁에 두고 품기 시작했다. 껍데기 속에서 무언가 꿈틀거린다.`, `깨어나기까지 ${fmtDays(R.hatchTime / DAY)}.`],
    items: [{ id: need, qty: -1 }],
  };
}

function train(d, kin, id, stat, now = Date.now()) {
  const err = atNest(d);
  if (err) return { error: err };
  const k = findKin(kin, id);
  if (!k || k.type !== 'drake' || k.status !== 'home') return { error: '가르칠 새끼가 없다.' };
  if (!STAT_KEYS.includes(stat)) return { error: '알 수 없는 능력치다.' };
  const limit = R.trainLimit[stageOf(k, now).i];
  if (k.data.trains >= limit) return { error: '지금은 더 가르쳐도 소용이 없다. 조금 더 자라야 한다.' };
  if (now - (k.data.lastTrain || 0) < R.trainCooldown) return { error: `${ga(k)} 지쳐 있다. 조금 쉬게 하자.` };
  if (d.ap < R.trainAp) return { error: `행동력이 모자란다. (${R.trainAp} 필요)` };
  if (d.en < R.trainEn) return { error: `기력이 모자란다. (${R.trainEn} 필요)` };
  if (d.ap >= d.ap_max) d.ap_at = now;
  d.ap -= R.trainAp;
  d.en -= R.trainEn;
  k.data.stats[stat] += 1;
  k.data.trains += 1;
  k.data.lastTrain = now;
  k.data.bond = clamp(k.data.bond + 3);
  const name = STATS.find((s) => s.key === stat).name;
  const how = { claw: '바위를 할퀴는 법', scale: '비늘을 단단히 세우는 법', wing: '바람을 타는 법', wisdom: '별을 읽는 법', majesty: '포효하는 법' }[stat];
  return { title: k.name, lines: [`${k.name}에게 ${how}을 가르쳤다.`, `${name} +1, 유대 +3`] };
}

// 다 자란 새끼를 떠나보냄. 강하게, 정 깊게 키울수록 용족 명성이 크게 오름
function release(d, kin, id, now = Date.now()) {
  const err = atNest(d);
  if (err) return { error: err };
  const k = findKin(kin, id);
  if (!k || k.type !== 'drake' || k.status !== 'home') return { error: '떠나보낼 새끼가 없다.' };
  if (ageOf(k, now) < R.independentDay) return { error: '아직 혼자 살아가기에는 어리다.' };
  const sum = STAT_KEYS.reduce((a, s) => a + k.data.stats[s], 0);
  const gain = 8 + Math.floor(sum / 4) + (k.data.bond >= 60 ? 4 : 0);
  k.status = 'independent';
  k.data.ended = now;
  k.data.lastGift = now;
  k.data.personality = personalityOf(k);
  const lines = [
    `${ga(k)} 둥지 가장자리에서 한 번 뒤돌아보고는 힘차게 날아올랐다.`,
    `${{ friendly: '인간과 어울려', hermit: '조용히 홀로', hostile: '거칠게 하늘을 누비며' }[k.data.personality]} 살아갈 것이다.`,
  ];
  const f = logic.addFame(d, gain);
  lines.push(`새끼를 길러 낸 드래곤으로 이름이 났다. 용족 명성 +${gain}`);
  if (f) lines.push(f);
  lines.push(`계보: ${kin.filter((x) => x.type === 'drake' && x.status === 'independent').length}마리째 독립`);
  return { title: '독립', lines };
}

// ── 원정에 함께 가는 식구 ──────────────────────────
function expStart(kin, now = Date.now()) {
  const went = [];
  for (const k of kin) {
    if (k.status !== 'home') continue;
    const from = k.type === 'human' ? H.expeditionFrom : R.expeditionFrom;
    if (k.type === 'human' && k.data.path === 'stay') continue; // 둥지를 지키는 어른은 남음
    if (ageOf(k, now) >= from) { k.data.onExp = true; went.push(k.name); }
  }
  return went;
}
const companions = (kin) => kin.filter((k) => k.data.onExp && k.status === 'home').length;
function expFinish(kin, minutes) {
  const lines = [];
  const back = [];
  for (const k of kin) {
    if (!k.data.onExp) continue;
    k.data.onExp = false;
    if (k.status !== 'home') continue;
    back.push(k.name);
    k.data.bond = clamp(k.data.bond + 3);
    if (k.type === 'human') {
      k.data.trips += 1;
      if (!k.data.talent) k.data.lean.guard += KIN.tripTalent;
    } else {
      const n = Math.min(2, Math.floor(minutes / 60));
      const got = [];
      for (let i = 0; i < n; i++) { const s = pick(STAT_KEYS); k.data.stats[s] += 1; got.push(STATS.find((x) => x.key === s).name); }
      if (got.length) lines.push(`${ga(k)} 원정에서 자랐다. ${got.map((g) => `${g} +1`).join(', ')}`);
    }
  }
  if (back.length) lines.unshift(`${back.join(', ')}${josa(back.at(-1), '이', '가')} 함께 다녀왔다. 유대 +3`);
  return lines;
}
// 둥지에서 함께 쉰 시간
function restTogether(kin, minutes) {
  const n = Math.min(10, Math.floor(minutes / 30) * H.restBondPer30m);
  const hs = homeKin(kin).humans;
  if (!hs.length || !n) return null;
  for (const k of hs) k.data.bond = clamp(k.data.bond + n);
  const names = hs.map((k) => k.name).join(', ');
  return `${names}${josa(names, '과', '와')} 함께 쉬었다. 유대 +${n}`;
}

// ── 이벤트 엔진 ────────────────────────────────────
function ctxOf(d, kin, have, trigger, now, region = d.region) {
  const hk = homeKin(kin);
  return {
    d, now, trigger, region, town: !!SHOPS[region],
    rep: logic.repOf(d)[region] || 0, fame: d.fame || 0, stance: d.stance, nest: d.nest,
    ...hk,                                        // home humans drakes eggs full
    grown: [...hk.humans, ...hk.drakes],          // 알을 뺀 식구
    k: (id) => hk.home.find((x) => x.id === id) || null, // 이벤트가 고른 식구 (떠났으면 null)
    age: (x) => (x && x.data.born ? (now - x.data.born) / DAY : -1),
    stage: (x) => stageOf(x, now).name,          // '아기' '아이' … '어린 용' …
    canTravel: (x) => ageOf(x, now) >= (x.type === 'human' ? H.expeditionFrom : R.expeditionFrom),
    pick,
    have, perks: d.perks || {}, stats: logic.statsOf(d), josa,
    rivals: d.rivalsCache || [], me: d.name, regionName: REGIONS[region]?.name || '', // 라이벌 이벤트
  };
}
const weightOf = (e, c) => (typeof e.weight === 'function' ? e.weight(c) : e.weight);
function safe(fn) { try { return fn(); } catch { return false; } }

function pending(d) {
  if (!d.pending_event) return null;
  try { return JSON.parse(d.pending_event); } catch { return null; }
}
function eventView(e, c, vars) {
  return {
    id: e.id, title: e.title,
    lines: e.text(c, vars),
    choices: e.choices.map((ch, i) => ({
      i,
      label: typeof ch.label === 'function' ? ch.label(c, vars) : ch.label,
      hidden: ch.show ? !ch.show(c, vars) : false,
      reason: ch.need ? ch.need(c, vars) : null,
    })).filter((x) => !x.hidden),
  };
}

// 행동 뒤에 이벤트가 일어나는지 굴림. 일어나면 선택 창에 보낼 내용을 돌려줌
function rollEvent(d, kin, have, trigger, now = Date.now(), force = false) {
  if (pending(d)) return null;
  if (!force && Math.random() >= (EVENT_RULES.chance[trigger] || 0)) return null;
  const c = ctxOf(d, kin, have, trigger, now);
  const list = EVENTS.filter((e) => e.when.includes(trigger) && safe(() => e.cond(c)) && weightOf(e, c) > 0);
  if (!list.length) return null;
  const total = list.reduce((a, e) => a + weightOf(e, c), 0);
  let r = Math.random() * total;
  const e = list.find((x) => (r -= weightOf(x, c)) < 0) || list[list.length - 1];
  const vars = e.setup ? e.setup(c) : {};
  d.pending_event = JSON.stringify({ id: e.id, vars, at: now, region: d.region, trigger });
  return eventView(e, c, vars);
}

// GM: 고른 이벤트를 바로 일으킴. ignoreCond면 조건이 맞지 않아도 (문장을 만들 수 있을 때만)
function forceEvent(d, kin, have, id, ignoreCond, now = Date.now()) {
  const e = EVENTS.find((x) => x.id === id);
  if (!e) return { error: '그런 이벤트는 없다.' };
  const c = ctxOf(d, kin, have, e.when[0], now);
  if (!ignoreCond && !safe(() => e.cond(c))) return { error: '지금은 이 이벤트의 조건이 맞지 않는다. (조건 무시를 켜면 일으킬 수 있다)' };
  let vars;
  try { vars = e.setup ? e.setup(c) : {}; e.text(c, vars); } catch {
    return { error: '이 이벤트에 필요한 것이 없어 일으킬 수 없다. (예: 식구가 있어야 하는 이벤트)' };
  }
  d.pending_event = JSON.stringify({ id: e.id, vars, at: now, region: d.region, trigger: e.when[0] });
  return { ok: true, title: e.title };
}

// 기다리는 이벤트. 사정이 바뀌어 더는 일어날 수 없으면 조용히 지나감
function currentEvent(d, kin, have, now = Date.now()) {
  const p = pending(d);
  if (!p) return null;
  const e = EVENTS.find((x) => x.id === p.id);
  const c = ctxOf(d, kin, have, p.trigger, now, p.region);
  if (!e || !safe(() => { e.text(c, p.vars); return true; })) { d.pending_event = null; return null; }
  return { e, c, vars: p.vars };
}
function getEvent(d, kin, have, now = Date.now()) {
  const cur = currentEvent(d, kin, have, now);
  return cur ? eventView(cur.e, cur.c, cur.vars) : null;
}

function chooseEvent(d, kin, have, idx, now = Date.now()) {
  const cur = currentEvent(d, kin, have, now);
  if (!cur) return { error: '그 일은 이미 지나갔다.' };
  const { e, c, vars } = cur;
  const ch = e.choices[Number(idx)];
  if (!ch || (ch.show && !ch.show(c, vars))) return { error: '고를 수 없는 선택이다.' };
  const reason = ch.need ? ch.need(c, vars) : null;
  if (reason) return { error: reason };

  const out = { lines: [], items: [], gold: 0, tells: [] };
  const town = SHOPS[c.region] ? c.region : nearestTown(c.region);
  const h = {
    say: (...l) => out.lines.push(...l),
    gold: (n) => { d.gold = Math.max(0, d.gold + n); out.gold += n; },
    give: (id, qty = 1) => out.items.push({ id, qty }),
    take: (id, qty = 1) => out.items.push({ id, qty: -qty }),
    rep: (region, n) => logic.addRep(d, region, n),
    fame: (n) => { const l = logic.addFame(d, n); if (l) out.lines.push(l); },
    hp: (n) => { d.hp = clamp(d.hp + n, 1, logic.hpCap(d)); },
    en: (n) => { d.en = clamp(d.en + n, 0, logic.enCap(d)); },
    bond: (k, n) => { if (k) k.data.bond = clamp(k.data.bond + n); },
    lean: (k, t, n) => { if (k && !k.data.talent) k.data.lean[t] += n; },
    train: (k, s) => { if (k && k.data.stats) k.data.stats[s] += 1; },
    leave: (k, status) => { k.status = status; k.data.ended = now; },
    // 새끼의 성격을 한쪽으로 기울임 (그 성향 밑에서 며칠 더 자란 것처럼)
    nudge: (k, stance, days) => { if (k && k.data.stanceMs) k.data.stanceMs[stance] = (k.data.stanceMs[stance] || 0) + days * DAY; },
    adopt: (origin) => {
      if (homeKin(kin).full) return out.lines.push('둥지에는 이미 식구가 가득해 더 데려갈 수 없었다.');
      const k = newHuman(origin, now, origin === 'lost' ? nearestTown(c.region) : town);
      k.name = freshName(kin, HUMAN_NAMES);
      kin.push(k);
      out.lines.push(`아이에게 '${k.name}'${josa(k.name, '이라는', '라는')} 이름을 붙여 주었다.`);
    },
    egg: (kind) => {
      if (homeKin(kin).full) return out.lines.push('둥지에는 이미 식구가 가득해 알을 둘 자리가 없었다.');
      const k = newEgg(kind, now);
      k.name = freshName(kin, DRAKE_NAMES);
      kin.push(k);
    },
    nearestTown: () => nearestTown(c.region),
    notify: (id, text) => out.tells.push({ id, text }),           // 다른 드래곤에게 소식 (라이벌 이벤트)
    buff: (id, minutes) => logic.giveBuff(d, id, minutes),
    mind: (n) => { if (!logic.berserkOf(d)) d.mind = clamp((d.mind ?? 100) + n, 0, 100); },
    name: (k) => ga(k),
    josa,
  };
  ch.run(h, c, vars);
  d.pending_event = null;
  const label = typeof ch.label === 'function' ? ch.label(c, vars) : ch.label;
  return { title: e.title, lines: out.lines, items: out.items, gold: out.gold, choice: label, tells: out.tells };
}

module.exports = {
  tick, perksOf, summary, views, homeKin, stageOf,
  care, rename, choosePath, incubate, train, release,
  expStart, expFinish, companions, restTogether,
  rollEvent, getEvent, chooseEvent, forceEvent,
  newHuman, newEgg, // 시험용
};
