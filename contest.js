// 풍어 요리 잔치 (요리대회): GM이 여는 기간 한정 이벤트 (숫자·심사평·재료는 game-data.js의 CONTEST)
// - 대회 동안(CONTEST.days일) 지역마다 귀한 재료가 나옴 (server.js가 채집·탐사·사냥 뒤에 drop을 부름)
// - 해안(CONTEST.region)에 바다괴물이 몰려듦: '바다괴물 사냥'으로 고기를 얻음. 대회 동안은 재앙이 올 차례마다 재앙 대신 크라켄이 나타남 (boss.js의 BOSSES.coast)
// - 심사위원 셋에게 하루 perDay번까지 요리를 냄. 순위는 가장 잘 만든 한 그릇 (같으면 두 번째 그릇)
// - 대회가 끝나면 1위 '대륙의 요리사', 1~3위 금·은·동 트로피, 낸 모두 앞치마
// - 인기 투표: 대회가 열리면 해안에서 내 요리를 한 그릇 직접 출품(심사와 따로). GM이 원할 때 투표를 열고(두 부문), 정한 시간이 지나거나 GM이 닫으면 마침
//   대회와 투표는 따로 흘러감: 대회 phase on → over, 투표 vote.state entry(출품) → open(투표) → closed. 둘 다 끝나면 phase done
// - 잔치가 마무리될 때까지 적대 드래곤도 해안에서 화살을 맞지 않음 (logic.hooks.townSafe)
// 상태는 world 표의 'contest'에 저장
const { CONTEST: C, ITEMS, RECIPES, REGIONS, FREE, COMBAT, PEDDLER, TITLES } = require('./game-data');

const H = 3600000, DAY = 24 * H, KST = 9 * H;
const josa = (w, a, b) => { const c = String(w).charCodeAt(String(w).length - 1) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 ? a : b; };
const eul = (w) => `${w}${josa(w, '을', '를')}`;
const ga = (w) => `${w}${josa(w, '이', '가')}`;
const pick = (l) => l[Math.floor(Math.random() * l.length)];
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const dayOf = (t) => Math.floor((t + KST) / DAY); // 한국 시각 날짜 번호
const RECIPE_OF = Object.fromEntries(RECIPES.map((r) => [r.out, r]));
const SPICES = ['salt', 'pepper', 'cedar'];
const CC_RECIPES = RECIPES.filter((r) => r.cc).map((r) => r.out); // 숨겨진 잔치 요리 제작법 (실험으로 찾음)
// 잔치 창 '보상' 탭에 보일 것 (data에서 바로 만듦: 이름·효과를 고치면 함께 바뀜)
const TITLE_OF = (id) => (Array.isArray(TITLES) ? TITLES : Object.values(TITLES)).find((t) => t.id === id);
const REWARDS = (() => {
  const t = (id) => { const x = TITLE_OF(id); return x ? { name: x.name, eff: x.secret ? '효과는 받아 봐야 알 수 있다.' : x.eff } : null; }; // secret: 인기 투표 칭호는 효과를 미리 알려 주지 않음 (받으면 알림에 나옴)
  const it = (id) => (ITEMS[id] ? { name: ITEMS[id].name, desc: ITEMS[id].desc } : null);
  return {
    rank: [1, 2, 3].map((n) => ({ rank: n, item: it(C.trophies[n - 1]), title: n === 1 ? t(C.kingTitle) : null })),
    all: { item: it(C.apron), title: t('cc_guest') },
    vote: C.votes.map((c) => ({ name: c.name, id: c.title, title: t(c.title) })),
  };
})();
// 대회 재료: 지역 재료 + 바다괴물 고기 + 크라켄 다리살
const EVENT_MATS = new Set([...Object.values(C.drops), ...C.hunt.beasts.map((b) => b.drop), C.hunt.elite.drop, 'kraken_leg']);
const TASTE = Object.fromEntries(Object.entries(C.taste).map(([k, l]) => [k, new Set(l)]));
const tastesOf = (id) => {
  const out = new Set();
  for (const [k, s] of Object.entries(TASTE)) if (s.has(id)) out.add(k);
  if (ITEMS[id]?.cat === 'fish') out.add('salt'); // 물고기는 모두 바다 맛
  return out;
};

module.exports = function setupContest({ io, db, online, logic, combat, arena, sendMe, boss }) {
  let st = db.worldGet('contest', null);
  const save = () => db.worldSet('contest', st);
  const shout = (text) => io.emit('system', { text, at: Date.now() });
  const on = () => !!st && st.phase === 'on';
  const live = () => !!st && st.phase !== 'done';
  // 인기 투표 상태 (예전 저장 모양이면 새로 만듦)
  const VT = () => (st.vote && st.vote.entries ? st.vote : (st.vote = { state: 'entry', until: 0, entries: {}, votes: Object.fromEntries(C.votes.map((c) => [c.key, {}])), result: null }));
  const wrapUp = (now) => { if (st.phase === 'over' && VT().state === 'closed' && VT().shown !== false) { st.phase = 'done'; st.doneAt = now; } }; // 대회도 투표도 끝나면 마무리
  const regionName = () => REGIONS[C.region]?.name || '해안';
  const tag = `[${C.name}]`;


  // ── 요리 알아보기: 낼 수 있는 요리인지, 무엇으로 만들었는지 ──
  // 드래곤이 먹을 수 있는 회복 요리: 잔치 요리(강화 효과 없는 것)·CONTEST.dishes의 회복 음식·차와 그 양념 요리, 직접 빚은 먹을거리
  // 빠지는 것: 강화 음식, 식구 요리, 아이가 부엌에서 만든 '정성 들인' 요리
  function dishInfo(id) {
    const it = ITEMS[id];
    if (!it) return null;
    if (it.custom && it.custom.kind === 'food' && !it.use?.buff) { // 직접 빚은 먹을거리 (빚은 식구 요리는 드래곤이 먹을 수 없어 빠짐, 독 기운이 깃들어 강화 효과가 붙은 것도 빠짐)
      return { name: it.name, mats: [...new Set(it.custom.mats || [])], quality: it.custom.quality || 'normal', custom: true };
    }
    const [base, suf] = String(id).split('__');
    const r = RECIPE_OF[base], b = ITEMS[base];
    if (!r || !b) return null; // 숨겨진 제작법으로 만든 요리도 낼 수 있음
    const needs = Object.keys(r.needs);
    // 드래곤이 먹을 수 있는 회복 요리만: 잔치 요리(강화 효과 있는 것 빼고) + CONTEST.dishes. 강화 음식·식구 요리는 빠짐 (1위 요리를 모두에게 나눠 주므로)
    const food = (!!b.dish && !b.use?.buff) || C.dishes.includes(base); // 강화 음식·식구 요리·잔치 요리 + CONTEST.dishes (약·향·화관은 빠짐)
    if (!food) return null;
    if (suf && !SPICES.includes(suf)) return null; // 아이가 부엌에서 만든 요리(__k)는 낼 수 없음 (직접 만든 요리로만 겨룸)
    const mats = [...needs];
    let spiced = false;
    if (SPICES.includes(suf)) { spiced = true; const sp = PEDDLER.spices?.[suf]?.item; if (sp && ITEMS[sp] && !mats.includes(sp)) mats.push(sp); }
    return { name: it.name, mats, spiced };
  }

  // ── 점수 매기기 ──
  function judge(info, now = Date.now()) {
    const parts = { judges: [], event: 0, care: 0, creative: 0, mood: 0 };
    const says = [];
    for (const J of C.judges) {
      const n = info.mats.filter((m) => tastesOf(m).has(J.key)).length;
      const pts = Math.min(J.max, n * J.per);
      parts.judges.push({ name: J.name, pts });
      const tier = pts >= (J.max * 2) / 3 ? 2 : pts >= J.max / 3 ? 1 : 0;
      says.push(pick(C.says[J.key][tier]));
    }
    parts.event = Math.min(C.eventMax, info.mats.filter((m) => EVENT_MATS.has(m)).length * C.eventPer);
    parts.care = (info.spiced ? C.care.spiced : 0) + (info.quality === 'good' ? C.care.good : info.quality === 'great' ? C.care.great : 0);
    if (info.custom) { parts.creative = C.creative.pts; says.push(pick(C.creative.says)); } // 창작 요리: 직접 빚은 요리 (재료가 2~3가지뿐이라 제작법 요리와 겨룰 수 있게)
    parts.mood = randInt(...C.mood);
    const total = Math.min(100, parts.judges.reduce((a, j) => a + j.pts, 0) + parts.event + parts.care + parts.creative + parts.mood);
    return { total, parts, says };
  }

  // ── 순위 ──
  const scoresOf = (e) => e.subs.map((x) => x.score).sort((a, b) => b - a);
  const bestSub = (e) => e.subs.reduce((m, x) => (!m || x.score > m.score ? x : m), null);
  // 가짓수: varietyMin점 이상을 받은 서로 다른 요리 수 (정성 들인·양념 요리는 본래 요리와 같은 것으로 셈)
  const varietyOf = (e) => new Set(e.subs.filter((x) => x.score >= C.varietyMin).map((x) => String(x.item).split('__')[0])).size;
  // 순위: 가장 잘 만든 한 그릇 → 같으면 가짓수 → 같으면 두 번째 그릇 → 그래도 같으면 같은 등수
  function ranking() {
    const l = Object.entries(st?.entries || {}).filter(([, e]) => e.subs.length).map(([id, e]) => {
      const s = scoresOf(e);
      return { id: Number(id), name: e.name, best: s[0] || 0, kinds: varietyOf(e), second: s[1] || 0, dish: bestSub(e)?.dish || '' };
    }).sort((a, b) => b.best - a.best || b.kinds - a.kinds || b.second - a.second);
    let rank = 0, prev = null;
    l.forEach((x, i) => { if (!prev || prev.best !== x.best || prev.kinds !== x.kinds || prev.second !== x.second) rank = i + 1; x.rank = rank; prev = x; });
    return l;
  }

  // 보상 탭: 숨긴 칭호 효과(인기 투표)는 그 칭호를 가진 드래곤에게만 진짜로 보여 줌
  function rewardsFor(d) {
    if (!d) return REWARDS;
    const mine = Object.fromEntries((logic.titlesView(d).list || []).map((x) => [x.id, x.eff]));
    return { ...REWARDS, vote: REWARDS.vote.map((x) => ({ ...x, title: x.title && mine[x.id] ? { ...x.title, eff: mine[x.id] } : x.title })) };
  }
  // 대회 시작 안내 팝업: 대회마다 드래곤당 한 번 (열릴 때 접속해 있거나, 대회 중 처음 접속할 때)
  const BOSS_NAME = () => require('./game-data').BOSSES[C.region]?.name || '크라켄';
  function intro(d) {
    if (!on() || !d) return null;
    const seen = (st.seen ||= {});
    if (seen[d.id]) return null;
    seen[d.id] = 1; save();
    return introView();
  }
  // 안내 내용 (잔치 창 '잔치 안내 다시 보기'에서도 씀)
  function introView() {
    if (!on()) return null;
    const king = TITLE_OF(C.kingTitle);
    const boss = BOSS_NAME();
    const days = Math.round((st.until - st.at) / DAY);
    const trophy = ITEMS[C.trophies[0]]?.name || '금 트로피', apron = ITEMS[C.apron]?.name || '앞치마';
    // 잔치 창보다 가볍게: 이야기처럼 읽히는 몇 덩어리 (재료·보상 이름은 game-data에서)
    return {
      title: `${C.name}가 열렸습니다`,
      until: st.until,
      lead: `${regionName()} 어촌에 ${C.name}가 열렸습니다. 올해도 바다가 넉넉히 내어 준 덕분에, 어촌 사람들은 ${days}일 동안 광장에 잔칫상을 차리기로 했습니다.`,
      judges: C.judges.map((J) => ({ name: J.name, role: J.role, like: J.like })),
      judging: `세 심사위원에게 하루 ${C.perDay}번까지 요리를 심사받을 수 있습니다. 순위는 가장 잘 만든 한 그릇으로 정해집니다.`,
      rumors: [
        { text: '잔치 소식이 퍼지면서 묘한 소문도 함께 돌기 시작했습니다. 잔치를 반기기라도 하듯, 대륙 곳곳에서 좀처럼 보기 힘든 귀한 재료가 나타났다는 이야기입니다.',
          chips: Object.entries(C.drops).map(([r, id]) => ({ where: REGIONS[r]?.name || r, what: ITEMS[id]?.name || id })) },
        { text: `어촌 사람들 사이에서는 또 다른 소문도 돕니다. 잔치 냄새를 맡은 바다괴물들이 ${regionName()}${josa(regionName(), '으로', '로')} 몰려들고 있고, 재앙이 찾아올 무렵이면 깊은 바다에서 ${boss}${josa(boss, '이', '가')} 올라온다는 것입니다. 쓰러뜨리기만 하면 귀한 고기를 얻을 수 있다고들 하네요.` },
      ],
      secret: '잔치 요리의 제작법은 어촌 사람들만 아는 비밀입니다. 실험에서 재료를 섞어 직접 찾아내거나, 심사위원들에게 슬쩍 귀띔을 들어 보세요. 세상에 없던 요리를 직접 빚어 낸다면 심사위원들이 점수를 더 얹어 줄 겁니다.',
      vote: '심사와는 따로, 잔치 마당에 올릴 인기 투표 요리도 한 그릇씩 받고 있습니다.',
      rewards: [
        { who: '1위', what: `${trophy} · 칭호 '${king?.name || ''}'` },
        { who: '요리를 낸 모두', what: apron },
      ],
      rewardNote: '자세한 보상은 잔치 창의 보상 탭에서 볼 수 있습니다.',
    };
  }
  // ── 화면에 보낼 모습 ──
  function view(d, now = Date.now()) {
    if (!st) return null;
    if (st.phase === 'done' && now > (st.doneAt || 0) + 3 * DAY) return null; // 끝나고 사흘 지나면 거둠
    const e = d && st.entries[d.id];
    const today = dayOf(now);
    const used = d && st.daily[d.id]?.day === today ? st.daily[d.id].n : 0;
    const v = {
      phase: st.phase, name: C.name, region: C.region, at: st.at, until: st.until,
      judges: C.judges.map((J) => ({ name: J.name, role: J.role, like: J.like })),
      rewards: rewardsFor(d),
      perDay: C.perDay, varietyMin: C.varietyMin, left: Math.max(0, C.perDay - used), people: Object.keys(st.entries).length,
      hunt: { ap: C.hunt.ap },
      mine: e ? { best: scoresOf(e)[0] || 0, second: scoresOf(e)[1] || 0, kinds: varietyOf(e), n: e.subs.length, subs: e.subs.map((x) => ({ dish: x.dish, score: x.score, at: x.at })).reverse().slice(0, 21) } : null,
    };
    if (st.phase === 'on') {
      const rk = ranking();
      v.top = rk.slice(0, C.topShow).map((x) => ({ rank: x.rank, name: x.name, best: x.best, kinds: x.kinds, dish: x.dish }));
      if (v.mine) v.mine.rank = rk.find((x) => x.id === d.id)?.rank || null;
    }
    if (st.phase !== 'on') v.result = st.result || null;
    // 잔치 요리 제작법: 찾은 수와 들은 귀띔
    if (d) {
      const known = new Set(logic.knownRecipes(d));
      const Hh = st.hints?.[d.id];
      v.recipes = { found: CC_RECIPES.filter((o) => known.has(o)).length, total: CC_RECIPES.length, hintPer: C.hints.perDay };
      v.hints = (Hh?.list || []).map((o) => ({ dish: ITEMS[o].name, by: C.hints.lines[o][0], text: C.hints.lines[o][1], found: known.has(o) }));
      v.hintLeft = Math.max(0, C.hints.perDay - (Hh?.day === today ? Hh.n : 0));
    }
    // 인기 투표: 출품 중에는 내 출품과 그릇 수만, 열리면 후보 모두
    const V = VT(), mineV = d && V.entries[d.id];
    v.vote = {
      state: V.state, until: V.until || 0, n: Object.keys(V.entries).length, noteMax: C.noteMax,
      cats: C.votes.map((c) => ({ key: c.key, name: c.name })),
      mine: mineV ? { dish: mineV.dish, note: mineV.note || '' } : null,
      cands: V.state === 'entry' ? [] : Object.entries(V.entries).map(([id, x]) => ({ id: Number(id), name: x.name, dish: x.dish, note: x.note || '' })),
      my: d ? Object.fromEntries(C.votes.map((c) => [c.key, V.votes[c.key]?.[d.id] ?? null])) : {},
      result: V.shown ? V.result || null : null, // 결과는 GM이 공개한 뒤에만
      shown: V.state === 'closed' && V.shown !== false,
    };
    return v;
  }
  const push = () => { for (const e of online.values()) e.socket.emit('contest', view(e.dragon)); };
  const pushOne = (id) => { const e = online.get(id); if (e) e.socket.emit('contest', view(e.dragon)); };

  // 한 드래곤에게 무언가를 주고 알림 (접속하지 않았으면 다음 접속 때 소식으로)
  function grant(id, fn) {
    const e = online.get(id);
    const d = e ? e.dragon : db.getDragon(id);
    if (!d || d.dead_at) return;
    const r = fn(d);
    if (!r) return;
    db.saveState(d, r.items || []);
    if (e) { sendMe(e.socket, d); e.socket.emit('notice', { title: C.name, lines: r.lines, items: r.items || [] }); } else for (const l of r.lines) db.noteAdd(id, l);
  }

  // ── 열기·끝내기 ──
  function start(days = C.days) {
    if (live()) return { error: '이미 잔치가 열려 있다. 먼저 끝내야 한다.' };
    const now = Date.now();
    st = { id: (st?.id || 0) + 1, at: now, until: now + days * DAY, phase: 'on', entries: {}, daily: {}, hints: {}, vote: null, result: null };
    VT();
    save();
    shout(`${tag} ${regionName()} 어촌에서 ${C.name}가 열렸다! ${days}일 동안 대륙 곳곳에서 귀한 재료가 나고, 해안에는 바다괴물이 몰려든다. 어촌의 심사위원 셋에게 요리를 내 보자. (하루 ${C.perDay}번까지) 인기 투표에 올릴 요리도 한 그릇씩 받는다.`);
    st.pin = io.lastNews || null; save();
    push();
    for (const e of online.values()) { const x = intro(e.dragon); if (x) e.socket.emit('contest:intro', x); } // 접속해 있는 드래곤에게 시작 안내
    return { ok: true };
  }
  // 대회를 마치고 상을 줌 (인기 투표는 따로: GM이 열고 닫음)
  function finish(now = Date.now()) {
    if (!on()) return { error: '지금 열린 대회가 없다.' };
    const rank = ranking();
    st.phase = 'over';
    st.until = Math.min(st.until, now);
    st.result = { rank: rank.slice(0, 10).map((x) => ({ rank: x.rank, name: x.name, best: x.best, kinds: x.kinds, dish: x.dish })), people: rank.length };
    wrapUp(now);
    save();
    const top = rank.filter((x) => x.rank <= 3);
    const line = top.length ? top.map((x) => `${x.rank}위 ${x.name} (${x.dish} ${x.best}점)`).join(' · ') : '요리를 낸 드래곤이 없었다';
    shout(`${tag} 요리대회가 끝났다! ${line}.${rank.length ? ` 요리를 낸 드래곤 ${rank.length}마리.` : ''}${VT().state === 'entry' ? ' 인기 투표 출품은 투표가 열릴 때까지 해안에서 계속 받는다.' : VT().state === 'open' ? ' 인기 투표는 아직 진행 중이다.' : ''}`);
    st.pin = io.lastNews || null; save();
    const date = new Date(st.at + KST).toISOString().slice(0, 10);
    // 1위 요리를 모든 드래곤에게 한 그릇씩 (같은 등수면 1위 요리 모두)
    const gifts = [];
    for (const x of rank.filter((r) => r.rank === 1)) { const b = bestSub(st.entries[x.id]); if (b && ITEMS[b.item] && !gifts.some((g) => g.item === b.item)) gifts.push({ item: b.item, dish: b.dish, by: x.name }); }
    st.result.gift = gifts.map((g) => ({ dish: g.dish, by: g.by }));
    for (const x of rank) {
      grant(x.id, (d) => {
        const lines = [`${C.name}가 끝났다. 가장 잘 만든 요리는 ${x.dish} ${x.best}점, ${rank.length}마리 가운데 ${x.rank}위였다.`];
        const items = [];
        if (x.rank === 1) {
          lines.push(...logic.traitCount(d, C.kingTitle));
          lines.push('심사위원 셋이 입을 모아 이번 잔치 최고의 요리사로 꼽았다!');
          logic.chron(d, 'mark', `${C.name}에서 1위를 해 대륙의 요리사가 되었다. (${x.dish} ${x.best}점)`);
        } else logic.chron(d, 'mark', `${C.name}에서 ${x.rank}위를 했다. (${x.dish} ${x.best}점)`);
        const tr = C.trophies[x.rank - 1];
        if (tr) { items.push({ id: tr, qty: 1 }); lines.push(`어촌 사람들이 ${eul(ITEMS[tr].name)} 건넸다. (${date})`); }
        items.push({ id: C.apron, qty: 1 });
        lines.push(`요리를 내 준 고마움으로 ${eul(ITEMS[C.apron].name)} 받았다.`);
        return { lines, items };
      });
    }
    if (gifts.length) {
      const what = gifts.map((g) => `${g.by}의 ${g.dish}`).join(', ');
      shout(`${tag} 어촌 사람들이 1위 요리를 그대로 만들어 대륙의 모든 드래곤에게 한 그릇씩 보냈다. (${what})`);
      for (const id of db.dragonIds()) {
        grant(id, () => ({ lines: gifts.map((g) => `어촌에서 ${C.name} 1위 요리, ${g.by}의 ${eul(g.dish)} 한 그릇 보내왔다.`), items: gifts.map((g) => ({ id: g.item, qty: 1 })) }));
      }
    }
    push();
    return { ok: true };
  }
  // 인기 투표 열기 (GM): 출품을 닫고 hours시간 동안 투표
  function openVote(hours = C.voteHours, now = Date.now()) {
    if (!live()) return { error: '지금 열린 잔치가 없다.' };
    const V = VT();
    if (V.state !== 'entry') return { error: V.state === 'open' ? '이미 투표가 열려 있다.' : '이번 잔치의 투표는 이미 끝났다.' };
    const n = Object.keys(V.entries).length;
    if (n < 2) return { error: `출품된 요리가 둘 이상이어야 한다. (지금 ${n}그릇)` };
    V.state = 'open'; V.until = now + hours * H;
    save();
    shout(`${tag} 인기 투표가 열렸다! 출품된 요리 ${n}그릇 가운데 ${C.votes.map((c) => `'${c.name}'`).join('와 ')}를 뽑는다. 어디서든 잔치 칸에서 투표할 수 있다. (${hours}시간 동안)`);
    st.pin = io.lastNews || null; save();
    push();
    return { ok: true };
  }
  // 인기 투표를 마감 (정한 시간이 지나거나 GM이 마침): 표를 세어 두기만 하고, 결과·칭호는 GM이 공개할 때
  function closeVote(now = Date.now()) {
    const V = st && VT();
    if (!V || V.state !== 'open') return { error: '지금 열린 인기 투표가 없다.' };
    V.state = 'closed';
    V.shown = false;
    V.until = Math.min(V.until, now);
    V.tally = {};
    for (const c of C.votes) {
      const n = {};
      for (const t of Object.values(V.votes[c.key] || {})) if (V.entries[t]) n[t] = (n[t] || 0) + 1;
      V.tally[c.key] = Object.entries(n).map(([id, k]) => ({ id: Number(id), name: V.entries[id].name, dish: V.entries[id].dish, votes: k })).sort((a, b) => b.votes - a.votes);
    }
    save();
    shout(`${tag} 인기 투표가 마감되었다. 결과는 곧 발표된다.`);
    push();
    return { ok: true };
  }
  // 결과 공개 (GM): 부문별 1위(같은 표면 함께)에게 칭호
  function publish(now = Date.now()) {
    const V = st && VT();
    if (!V || V.state !== 'closed' || V.shown !== false) return { error: V?.state === 'open' ? '먼저 투표를 마감해야 한다.' : '공개할 결과가 없다.' };
    V.shown = true;
    V.result = {};
    const out = [];
    for (const c of C.votes) {
      const l = V.tally?.[c.key] || [];
      const max = l[0]?.votes || 0;
      const win = l.filter((x) => max > 0 && x.votes === max);
      V.result[c.key] = win.map((x) => ({ name: x.name, dish: x.dish, votes: x.votes }));
      out.push(`${c.name}: ${win.length ? win.map((x) => `${x.name}의 ${x.dish}`).join(', ') + ` (${max}표)` : '표가 없었다'}`);
      for (const x of win) {
        grant(x.id, (d) => {
          const lines = [`${C.name} 인기 투표 '${c.name}'에서 1위를 했다! (${max}표)`, ...logic.traitCount(d, c.title)];
          logic.chron(d, 'mark', `${C.name} 인기 투표 '${c.name}'에서 1위를 했다.`);
          return { lines };
        });
      }
    }
    wrapUp(now);
    save();
    shout(`${tag} 인기 투표 결과를 발표한다! ${out.join(' · ')}.${st.phase === 'done' ? ' 다음 잔치에서 또 만나자!' : ''}`);
    push();
    return { ok: true };
  }
  // GM: 상 없이 거두기
  function cancel() {
    if (!live()) return { error: '지금 열린 잔치가 없다.' };
    st.phase = 'done'; st.doneAt = Date.now() - 3 * DAY - 1; // 바로 화면에서 거둠
    VT().state = 'closed';
    save();
    shout(`${tag} 잔치가 일찍 마무리되었다.`);
    push();
    return { ok: true };
  }

  // ── 크라켄: 대회 동안은 재앙이 올 차례마다 재앙 대신 해안에 (boss.js가 hooks.bossOverride를 물어봄). GM은 바로 부를 수도 있음 ──
  function kraken() { return boss.spawn(C.region, { force: true, ev: true }); }
  logic.hooks.bossOverride = () => (on() ? C.region : null);

  // ── 대회 재료 (server.js가 채집·탐사·사냥 뒤에 부름) ──
  function drop(d, type, res) {
    if (!on() || !res || d.exp_end) return;
    const id = C.drops[d.region];
    if (!id || !(Math.random() < (C.dropChance[type] || 0))) return;
    res.items = [...(res.items || [])];
    const have = res.items.find((x) => x.id === id && !x.great); // 다른 칸(대성공 표시 등)은 그대로 두고 한 개만 보탬
    if (have) have.qty++; else res.items.push({ id, qty: 1 });
    res.lines = [...(res.lines || []), `${C.name}에 낼 만한 ${eul(ITEMS[id].name)} 찾았다!`];
  }

  // ── 바다괴물 사냥 ──
  function seaFoe(def, lv, elite) {
    const K = COMBAT.creature, DF = COMBAT.difficulty || { hp: 1, atk: 1 };
    const CB = combat.creatureBase(lv);
    const hp = Math.round(CB.hp * (elite ? K.eliteHp : 1) * DF.hp);
    return {
      id: null, name: def.name, kind: null, creature: true, region: C.region, place: null, elite: !!elite, minion: false, level: lv, type: def.type,
      corrupted: false, mindDrain: 0,
      hp, hpMax: hp, en: 0, enMax: 0,
      atk: CB.atk * (elite ? K.eliteAtk : 1) * DF.atk, def: CB.def, spd: 6 + lv * 2, mag: 4 + lv * 2, maj: 8 + lv * 2,
      taken: 1, element: def.special.element || null, breath: null, skills: [], special: def.special,
      weak: def.weak, resist: def.resist, st: {}, cd: {},
    };
  }
  function hunt(d) {
    if (!on()) return { error: '지금은 바다괴물이 없다.' };
    if (d.region !== C.region) return { error: `${regionName()}에 가야 바다괴물을 사냥할 수 있다.` };
    if (arena.inBattle(d.id)) return { error: '이미 싸우는 중이다.' };
    if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
    if (d.rest_at) return { error: '둥지에서 쉬는 중이다. 먼저 깨어나야 한다.' };
    logic.regen(d);
    if (d.ap < C.hunt.ap) return { error: `행동력이 모자란다. (${C.hunt.ap} 필요)` };
    if (logic.lowHp(d)) return { error: '기운이 없어 사냥에 나설 수 없다. 조금 쉬어야 한다.' };
    logic.spendAp(d, C.hunt.ap);
    const elite = Math.random() < C.hunt.eliteChance;
    const def = elite ? C.hunt.elite : pick(C.hunt.beasts);
    const lv = Math.max(1, Math.min(26, d.level + def.lv));
    const me = combat.fromDragon(d, 'hunt');
    const foe = seaFoe(def, lv, elite);
    const b = combat.newBattle('hunt', me, foe);
    b.region = C.region;
    combat.weatherize(b, C.region);
    b.a.turnCount = 0;
    const c = { name: def.name, level: lv };
    const lines = elite
      ? [def.intro || `깊은 물에서 ${ga(def.name)} 솟아올랐다!`, '강적이다. 물러설 수 없다.']
      : [def.intro || `파도 사이로 ${ga(def.name)} 기어 올라왔다.`]; // intro: 바다괴물마다 나타나는 문장 (CONTEST.hunt)
    const view = arena.startHunt(d, b, c, null, (dd, bb) => huntResult(dd, bb, def, elite));
    db.saveState(d);
    return { ok: true, battle: view, lines, title: `바다괴물 · ${def.name}` };
  }
  function huntResult(d, b, def, elite) {
    const me = b.a;
    d.hp = Math.max(1, Math.round(me.hp));
    d.en = Math.max(0, Math.round(me.en));
    const win = b.winner === me;
    const lost = Math.max(0, Math.round((me.hp0 ?? me.hpMax) - me.hp));
    const lines = [];
    const ids = [];
    let gold = 0, xp = 4;
    if (win) {
      lines.push(`${b.turn}턴 만에 ${eul(def.name)} 쓰러뜨렸다.`);
      ids.push(def.drop);
      if (elite || Math.random() < C.hunt.extra) ids.push(def.drop);
      gold = Math.round(randInt(...C.hunt.gold) * d.level / 3 * (elite ? 2 : 1));
      xp = (C.hunt.xp[0] + d.level * C.hunt.xp[1]) * (elite ? 2 : 1);
      d.gold += gold;
      lines.push(...logic.traitCount(d, 'huntwin'));
    } else if (b.fled === me) lines.push(`${def.name}에게 밀려 ${b.turn}턴 만에 뭍으로 물러났다.`);
    else lines.push(`${def.name}에게 밀려 선창 끝까지 쫓겨났다. 어부들이 그물을 던져 겨우 떼어 냈다.`);
    const items = logic.bundle(ids);
    if (items.length || gold) {
      const t = [...items.map(logic.itemLabel), ...(gold ? [`금화 ${gold}닢`] : [])].join(', ');
      lines.push(`${eul(t)} 얻었다.`);
    }
    lines.push(`체력을 ${lost} 잃었다.`);
    xp = logic.xpOf(d, Math.round(xp));
    const levelUp = logic.gainXp(d, xp);
    return { title: '바다괴물 사냥', lines, items, gold, xp, levelUp, win, turns: b.turn, fall: false, wound: d.hp <= logic.hpCap(d) * 0.15, lost };
  }

  // ── 요리 내기 (server.js의 itemAction이 부름: 돌려준 items로 소지품에서 뺌) ──
  function submit(d, id, have, now = Date.now()) {
    if (!on()) return { error: '지금은 요리대회가 열려 있지 않다.' };
    if (d.region !== C.region) return { error: `${regionName()} 어촌에 가야 요리를 낼 수 있다.` };
    if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
    id = String(id || '');
    if (!ITEMS[id] || have(id) < 1) return { error: '가지고 있지 않은 요리다.' };
    if (id.endsWith('__k')) return { error: '아이가 부엌에서 만든 요리는 낼 수 없다. 직접 만든 요리를 내자.' };
    const info = dishInfo(id);
    if (!info) return { error: '심사위원들이 고개를 저었다. 요리라고 하기 어렵다.' };
    const today = dayOf(now);
    const dl = st.daily[d.id]?.day === today ? st.daily[d.id] : (st.daily[d.id] = { day: today, n: 0 });
    if (dl.n >= C.perDay) return { error: `오늘은 이미 ${C.perDay}번 냈다. 내일 다시 내자.` };
    const j = judge(info, now);
    dl.n++;
    const e = st.entries[d.id] ||= { name: d.name, subs: [], show: null };
    e.name = d.name;
    const before = scoresOf(e)[0] || 0;
    const topKey = () => JSON.stringify(ranking().slice(0, C.topShow).map((x) => [x.id, x.best, x.rank]));
    const topBefore = topKey();
    e.subs.push({ item: id, dish: info.name, score: j.total, at: now });
    save();
    const topChanged = topKey() !== topBefore;
    const lines = [`심사위원 셋 앞에 ${eul(info.name)} 내놓았다.`, ...j.says];
    const p = j.parts;
    const extra = [p.event ? `대회 재료 +${p.event}` : '', p.care ? `정성 +${p.care}` : '', p.creative ? `창작 +${p.creative}` : '', `기분 +${p.mood}`].filter(Boolean);
    lines.push(`점수 ${j.total}점 (${p.judges.map((x) => `${x.name} ${x.pts}`).join(' · ')} · ${extra.join(' · ')})`);
    if (j.total > before) lines.push(before ? `지금까지 낸 요리 가운데 가장 좋은 점수다! (전에는 ${before}점)` : '첫 요리를 냈다. 이 점수로 순위에 오른다.');
    else lines.push(`가장 좋은 점수는 여전히 ${before}점이다.`);
    lines.push(`${C.varietyMin}점을 넘긴 서로 다른 요리 ${varietyOf(e)}가지. (가장 좋은 점수가 같으면 가짓수가 많은 쪽이 앞선다)`);
    lines.push(`오늘 더 낼 수 있는 요리 ${C.perDay - dl.n}번.`);
    if (e.subs.length === 1) {
      lines.push(...logic.traitCount(d, 'cc_join'));
      logic.chron(d, 'mark', `${C.name}에 ${eul(info.name)} 냈다.`);
    }
    setImmediate(() => (topChanged ? push() : pushOne(d.id))); // 상위 순위가 바뀌면 모두의 잔치 칸을 새로
    return { title: C.name, lines, items: [{ id, qty: -1 }], gold: 0 };
  }

  // 귀띔 듣기: 해안에서 하루 C.hints.perDay번. 아직 모르고 듣지 않은 잔치 요리 제작법 하나의 실마리
  function hint(d, now = Date.now()) {
    if (!on()) return { error: '지금은 요리 대회가 열려 있지 않다.' };
    if (d.region !== C.region) return { error: `${regionName()} 어촌에 가야 심사위원을 만날 수 있다.` };
    const H0 = (st.hints ||= {});
    const today = dayOf(now);
    const h = H0[d.id] && H0[d.id].list ? H0[d.id] : (H0[d.id] = { day: today, n: 0, list: [] });
    if (h.day !== today) { h.day = today; h.n = 0; }
    if (h.n >= C.hints.perDay) return { error: `오늘은 귀띔을 더 들을 수 없다. (하루 ${C.hints.perDay}번)` };
    const known = new Set(logic.knownRecipes(d));
    const left = CC_RECIPES.filter((o) => !known.has(o) && !h.list.includes(o));
    if (!left.length) return { error: CC_RECIPES.every((o) => known.has(o)) ? '잔치 요리 제작법을 모두 찾아냈다!' : '심사위원들이 해 줄 수 있는 귀띔은 다 들었다. 남은 건 직접 찾아 보자.' };
    // 풍어 잔치 한상은 다른 잔치 요리를 셋 넘게 찾은 뒤에야 귀띔해 줌
    const pool = left.filter((o) => o !== 'cc_feast' || CC_RECIPES.filter((x) => known.has(x)).length >= 3);
    const o = pick(pool.length ? pool : left);
    h.n++; h.list.push(o);
    save();
    const [by, text] = C.hints.lines[o];
    return { ok: true, title: '심사위원의 귀띔', lines: [`${by === '세 심사위원' ? '심사위원들이' : ga(by)} 목소리를 낮추어 말했다.`, `"${text}"`, '(실험에서 재료를 섞어 보면 잔치 요리 제작법을 찾을 수 있다)'], contest: view(d, now) };
  }

  // 인기 투표 출품: 해안에서 내 요리 한 그릇 (심사와 따로, 다시 내면 바뀜. 낸 요리는 돌려받지 못함). note: 한 줄 소개
  function enter(d, id, note, have, now = Date.now()) {
    if (!live()) return { error: '지금은 잔치가 열려 있지 않다.' };
    const V = VT();
    if (V.state !== 'entry') return { error: V.state === 'open' ? '이미 투표가 시작되어 출품을 받지 않는다.' : '이번 잔치의 인기 투표는 끝났다.' };
    if (d.region !== C.region) return { error: `${regionName()} 어촌에 가야 요리를 출품할 수 있다.` };
    if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
    id = String(id || '');
    if (!ITEMS[id] || have(id) < 1) return { error: '가지고 있지 않은 요리다.' };
    if (id.endsWith('__k')) return { error: '아이가 부엌에서 만든 요리는 낼 수 없다. 직접 만든 요리를 올리자.' };
    const info = dishInfo(id);
    if (!info) return { error: '어촌 사람들이 고개를 저었다. 요리라고 하기 어렵다.' };
    note = String(note || '').replace(/\s+/g, ' ').trim().slice(0, C.noteMax);
    const old = V.entries[d.id];
    V.entries[d.id] = { name: d.name, item: id, dish: info.name, note, at: now };
    save();
    const lines = [old ? `잔치 마당에 올려 둔 ${old.dish} 대신 ${eul(info.name)} 올렸다.` : `잔치 마당의 인기 투표 상에 ${eul(info.name)} 올렸다.`];
    if (note) lines.push(`곁에 꽂은 쪽지: "${note}"`);
    lines.push('투표가 열리면 모두가 이 요리를 보게 된다. 투표가 열리기 전까지는 다른 요리로 바꿀 수 있다.');
    setImmediate(() => pushOne(d.id));
    return { title: '인기 투표 출품', lines, items: [{ id, qty: -1 }], gold: 0 };
  }
  function vote(d, cat, target) {
    const V = st && VT();
    if (!V || V.state !== 'open') return { error: '지금은 인기 투표 기간이 아니다.' };
    const c = C.votes.find((x) => x.key === cat);
    if (!c) return { error: '그런 부문은 없다.' };
    const t = Number(target);
    if (!V.entries[t]) return { error: '그런 요리는 없다.' };
    if (t === d.id) return { error: '내 요리에는 투표할 수 없다.' };
    (V.votes[cat] ||= {})[d.id] = t;
    save();
    return { ok: true, contest: view(d) };
  }

  // 1분마다: 기간이 다하면 대회를 마치고, 투표 시간이 다하면 마감
  const ticker = setInterval(() => {
    if (!st) return;
    const now = Date.now();
    if (st.phase === 'on' && now >= st.until) finish(now);
    if (st.vote?.state === 'open' && now >= st.vote.until) closeVote(now);
  }, 60000);
  ticker.unref?.();

  logic.hooks.townSafe = (region) => region === C.region && live(); // 잔치가 마무리될 때까지 해안: 적대 드래곤도 화살을 맞지 않음 (대회가 끝나도 인기 투표 출품은 해안에서 받으므로)

  function attach(socket) {
    const me = () => { const e = online.get(socket.data.dragonId); return e && e.socket === socket ? e.dragon : null; };
    const call = (ev, fn) => socket.on(ev, (p, ack) => {
      if (typeof ack !== 'function') return;
      const d = me();
      if (!d) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
      ack(fn(d, p || {}));
    });
    socket.emit('contest', view(me()));
    { const x = intro(me()); if (x) setTimeout(() => socket.connected && socket.emit('contest:intro', x), 1500); } // 대회 중 처음 접속하면 시작 안내 (다른 첫 화면 알림이 먼저 뜬 뒤에)
    call('cc:get', (d) => ({ ok: true, contest: view(d) }));
    call('cc:vote', (d, p) => vote(d, String(p.cat || ''), p.id));
    call('cc:hint', (d) => hint(d));
    call('cc:intro', () => { const x = introView(); return x ? { ok: true, intro: x } : { error: '지금은 요리 대회가 열려 있지 않다.' }; }); // 잔치 안내 다시 보기
    // 낼 수 있는 요리: 소지품에서
    call('cc:dishes', (d) => ({ ok: true, list: db.inventory(d.id).filter((x) => x.qty > 0 && dishInfo(x.item)).map((x) => ({ id: x.item, name: ITEMS[x.item].name, qty: x.qty, rarity: ITEMS[x.item].rarity || 'common' })).sort((a, b) => a.name.localeCompare(b.name, 'ko')) }));
    call('cc:hunt', (d) => {
      if (logic.berserkOf(d)) return { error: '광폭화한 몸이 제멋대로 날뛴다.' };
      if (logic.isFallen(d)) return { error: '쓰러져 있다.' };
      const r = hunt(d);
      if (!r.error) sendMe(socket, d);
      return r;
    });
    // GM
    const gm = (ev, fn) => socket.on(ev, (p, ack) => {
      if (typeof ack !== 'function') return;
      if (!socket.data.user?.is_gm) return ack({ error: 'GM만 쓸 수 있다.' });
      const r = fn(p || {});
      if (!r.error && r.gmlog) db.gmLog(socket.data.user.username, null, r.gmlog);
      delete r.gmlog;
      ack({ ...r, state: gmView() });
    });
    gm('gm:cc:start', (p) => { const days = Math.max(1, Math.min(14, Math.round(Number(p.days) || C.days))); const r = start(days); return r.error ? r : { ok: true, gmlog: `${C.name}를 열었다. (${days}일)` }; });
    gm('gm:cc:finish', () => { const r = finish(); return r.error ? r : { ok: true, gmlog: `${C.name} 요리대회를 마치고 상을 줬다.` }; });
    gm('gm:cc:vote', (p) => { const hours = Math.max(1, Math.min(168, Math.round(Number(p.hours) || C.voteHours))); const r = openVote(hours); return r.error ? r : { ok: true, gmlog: `${C.name} 인기 투표를 열었다. (${hours}시간)` }; });
    gm('gm:cc:close', () => { const r = closeVote(); return r.error ? r : { ok: true, gmlog: `${C.name} 인기 투표를 마감했다.` }; });
    gm('gm:cc:publish', () => { const r = publish(); return r.error ? r : { ok: true, gmlog: `${C.name} 인기 투표 결과를 공개했다.` }; });
    gm('gm:cc:cancel', () => { const r = cancel(); return r.error ? r : { ok: true, gmlog: `${C.name}를 상 없이 거뒀다.` }; });
    gm('gm:cc:kraken', () => { if (!on()) return { error: '대회 중에만 부를 수 있다.' }; const r = kraken(); return r.error ? r : { ok: true, gmlog: '크라켄을 불렀다.' }; });
    gm('gm:cc:get', () => ({ ok: true }));
  }
  // GM 화면에 보일 상태
  function gmView() {
    if (!st) return null;
    const V = VT();
    return { phase: st.phase, at: st.at, until: st.until, vote: { state: V.state, shown: V.shown !== false, tally: V.state === 'closed' ? C.votes.map((c) => ({ name: c.name, top: (V.tally?.[c.key] || []).slice(0, 3).map((x) => `${x.name}의 ${x.dish} ${x.votes}표`) })) : null, until: V.until || 0, n: Object.keys(V.entries).length, voters: new Set(Object.values(V.votes).flatMap((x) => Object.keys(x))).size }, krakenAt: st.phase === 'on' && !boss.active() ? boss.nextAt() || 0 : 0, people: Object.keys(st.entries).length, subs: Object.values(st.entries).reduce((a, e) => a + e.subs.length, 0), top: st.phase === 'on' ? ranking().slice(0, 5).map((x) => `${x.rank}위 ${x.name} ${x.best}점`) : [] };
  }

  return { attach, view, drop, submit, enter, gmView, on, pin: () => (live() && (st.phase === 'on' || VT().state === 'open') ? st.pin || null : null), _dish: dishInfo, _judge: judge };
};
