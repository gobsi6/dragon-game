// 레이드: 만렙 드래곤 넷이 모여 함께 맞서는 기믹 전투 (멸망한 대륙 지역마다 하나)
// - 모집: 그 지역에서 누군가 모집을 열면 모두에게 알림. RAIDBOSS.recruitMs 안에 넷이 모이면 모집한 드래곤이 들어감
// - 전투: 넷이 한 턴에 저마다 행동을 고름 (RAIDBOSS.turnSeconds 안에. 넘기면 자동). 보스는 다음 턴에 할 일을 미리 알림(예고)
//   드래곤들이 먼저 움직이고(막는 행동이 가장 먼저), 보스는 그 뒤에 움직임
// - 보상: 주 RAIDBOSS.weekly번 (월요일 0시 초기화). 그 뒤에도 들어가 도울 수 있음 (보상 대신 '도움' 횟수)
// - 안전판: 한 주 동안 아무도 못 잡으면 다음 주 체력을 RAIDBOSS.nerf.step씩 (최대 nerf.max) 낮춤. 누가 잡으면 다음 주 원래대로
// - GM은 혼자서도 시험으로 들어갈 수 있음 (보상·기록 없음)
// 상태는 world 표의 'raidboss'에 저장 (주간 보상 횟수, 안전판, 첫 처치와 가장 빠른 기록)
const { RAIDBOSS, REGIONS, ITEMS, SKILLS, STATUS, BREATHS, isTestDragon } = require('./game-data');

const DAY = 86400000;
const weekIdx = (now = Date.now()) => Math.floor((Math.floor((now + 9 * 3600000) / DAY) + 3) / 7); // 한국 시각 월요일 0시에 바뀜
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function josa(word, a, b) {
  const c = String(word).charCodeAt(String(word).length - 1) - 0xac00;
  if (c < 0 || c > 11171) return `${a}(${b})`;
  return c % 28 ? a : b;
}
const ga = (n) => `${n}${josa(n, '이', '가')}`;
const eul = (n) => `${n}${josa(n, '을', '를')}`;
const ACTS = ['attack', 'skill', 'guard', 'flee', 'cover', 'flank']; // flank: 우회 (카르넴)

module.exports = function setupRaidBoss({ io, db, online, logic, combat, arena, sendMe, isOpen, fall, purify, news, presence }) {
  const R = RAIDBOSS;
  const K = combat.raidKit;
  let st = db.worldGet('raidboss', null) || {};
  st.used ||= {}; st.cleared ||= {}; st.tried ||= {}; st.nerf ||= {}; st.first ||= {}; st.best ||= {};
  const save = () => db.worldSet('raidboss', st);
  // 새 주가 되면: 지난주에 도전했는데 아무도 못 잡은 레이드는 체력을 조금 낮추고, 잡혔으면 원래대로
  function roll() {
    const w = weekIdx();
    if (st.week === w) return;
    if (st.week != null) {
      for (const key of Object.keys(R.bosses)) {
        if (st.cleared[key]) st.nerf[key] = 0;
        else if (st.tried[key]) st.nerf[key] = Math.min(R.nerf.max, (st.nerf[key] || 0) + R.nerf.step);
      }
    }
    st.week = w; st.used = {}; st.cleared = {}; st.tried = {}; // used: { 레이드 key: { 드래곤 id: 횟수 } }
    save();
  }
  roll();
  if (Object.values(st.used).some((v) => typeof v === 'number')) { st.used = {}; save(); } // 예전 저장분(모든 레이드를 합쳐 셈)은 비움

  const lobbies = new Map(); // 레이드 key → { key, leader, ids, until, timer }
  const fights = new Map();  // 싸움 id → 싸움
  const inFight = new Map(); // 드래곤 id → 싸움
  let nextId = 1;
  const live = (id) => online.get(id) || null;
  const load = (id) => { const e = live(id); return e ? e.dragon : db.getDragon(id); };
  const emitTo = (id, ev, data) => { const e = live(id); if (e) e.socket.emit(ev, data); };
  const lobbyOf = (id) => [...lobbies.values()].find((l) => l.ids.includes(id)) || null;
  const usedOf = (id, key) => { roll(); return st.used[key]?.[id] || 0; }; // 이번 주에 그 레이드 보상을 받은 횟수

  // ── 모두에게 보낼 모습 ─────────────────────────────
  function view() {
    roll();
    return {
      weekly: R.weekly, size: R.size, minLevel: R.minLevel,
      list: Object.entries(R.bosses).map(([key, B]) => {
        const lb = lobbies.get(key);
        return {
          key, name: B.name, region: B.region, place: B.place, open: isOpen(B.region), script: B.script || 'morven',
          lobby: lb ? { leader: lb.leader, ids: lb.ids.slice(), names: lb.ids.map((id) => load(id)?.name || ''), until: lb.until } : null,
          fighting: [...fights.values()].filter((f) => f.key === key && !f.over).length,
          best: st.best[key] ? { turns: st.best[key].turns, names: st.best[key].names } : null,
          first: !!st.first[key],
        };
      }),
    };
  }
  const push = () => io.emit('raidboss', view());
  const meView = (d) => ({ used: Object.fromEntries(Object.keys(R.bosses).map((k) => [k, usedOf(d.id, k)])), weekly: R.weekly, inRaid: inFight.has(d.id) });

  // ── 들어갈 수 있는지 ───────────────────────────────
  // relax: GM 시험 (아직 열리지 않은 레이드를 멸망한 대륙 어디서든 미리 해 봄)
  function why(d, key, relax = false) {
    const B = R.bosses[key];
    if (!B) return '그런 레이드는 없다.';
    if (isTestDragon(d)) return '시험용 드래곤은 다른 드래곤과 어울릴 수 없다.';
    if (d.level < R.minLevel) return `레벨 ${R.minLevel}이 되어야 함께할 수 있다.`;
    if (relax) { if (!logic.isRuin(d.region)) return '멸망한 대륙에 가야 시험할 수 있다.'; }
    else {
      if (!isOpen(B.region)) return `${REGIONS[B.region].name}${josa(REGIONS[B.region].name, '은', '는')} 아직 열리지 않았다.`;
      if (d.region !== B.region) return `${REGIONS[B.region].name}에 가야 한다.`;
    }
    if (logic.isFallen(d)) return '쓰러져 있다.';
    if (logic.berserkOf(d)) return '광폭화한 몸이 제멋대로 날뛴다.';
    if (d.exp_end) return '원정을 떠나 있는 동안에는 함께할 수 없다.';
    if (d.rest_at) return '둥지에서 쉬는 중이다. 먼저 깨어나야 한다.';
    if (arena.inBattle(d.id)) return '이미 싸우는 중이다.';
    logic.regen(d);
    if (d.hp < R.minHp) return `체력이 ${R.minHp}은 있어야 맞설 수 있다. 조금 쉬어야 한다.`;
    return null;
  }

  // ── 모집 ───────────────────────────────────────────
  function closeLobby(lb, text) {
    clearTimeout(lb.timer);
    lobbies.delete(lb.key);
    if (text) for (const id of lb.ids) emitTo(id, 'notice', { title: '레이드', lines: [text] });
    push();
  }
  const relaxOf = (lb) => !!lb.gm && !isOpen(R.bosses[lb.key].region); // 닫힌 레이드의 GM 시험
  function openLobby(d, key, gm) {
    if (!R.bosses[key]) return { error: '그런 레이드는 없다.' };
    const w = why(d, key, !!gm && !isOpen(R.bosses[key].region));
    if (w) return { error: w };
    if (lobbies.has(key)) return { error: '이미 누군가 모집하고 있다. 함께 가기를 눌러 합류하자.' };
    if (lobbyOf(d.id)) return { error: '이미 다른 모집에 들어가 있다.' };
    const B = R.bosses[key];
    const lb = { key, leader: d.id, ids: [d.id], until: Date.now() + R.recruitMs, gm: !!gm };
    if (relaxOf(lb)) { lb.timer = null; lobbies.set(key, lb); push(); return { ok: true }; } // 닫힌 레이드의 GM 시험은 알리지 않음
    lb.timer = setTimeout(() => { if (lobbies.get(key) === lb) closeLobby(lb, `${R.size}마리가 모이지 않아 ${B.place} 모집이 닫혔다.`); }, R.recruitMs);
    lb.timer.unref?.();
    lobbies.set(key, lb);
    io.emit('system', { text: `[레이드] ${ga(d.name)} ${REGIONS[B.region].name} ${B.place}에서 ${eul(B.name)} 함께 칠 드래곤을 찾는다. (${Math.round(R.recruitMs / 60000)}분 안에 ${R.size}마리, Lv.${R.minLevel})`, at: Date.now() });
    push();
    return { ok: true };
  }
  function joinLobby(d, key) {
    const lb = lobbies.get(key);
    if (!lb) return { error: '모집이 이미 닫혔다.' };
    if (lb.ids.includes(d.id)) return { error: '이미 함께하고 있다.' };
    if (lb.ids.length >= R.size) return { error: '자리가 다 찼다.' };
    if (lobbyOf(d.id)) return { error: '이미 다른 모집에 들어가 있다.' };
    const w = why(d, key, relaxOf(lb));
    if (w) return { error: w };
    lb.ids.push(d.id);
    for (const id of lb.ids) if (id !== d.id) emitTo(id, 'system', { text: `[레이드] ${ga(d.name)} 함께하기로 했다. (${lb.ids.length}/${R.size})`, at: Date.now() });
    push();
    return { ok: true };
  }
  function leaveLobby(d) {
    const lb = lobbyOf(d.id);
    if (!lb) return { error: '모집에 들어가 있지 않다.' };
    lb.ids = lb.ids.filter((id) => id !== d.id);
    if (!lb.ids.length) { closeLobby(lb, null); return { ok: true }; }
    if (lb.leader === d.id) lb.leader = lb.ids[0];
    for (const id of lb.ids) emitTo(id, 'system', { text: `[레이드] ${ga(d.name)} 빠졌다. (${lb.ids.length}/${R.size})`, at: Date.now() });
    push();
    return { ok: true };
  }
  function startLobby(d, key) {
    const lb = lobbies.get(key);
    if (!lb || !lb.ids.includes(d.id)) return { error: '모집에 들어가 있지 않다.' };
    if (lb.leader !== d.id) return { error: '모집한 드래곤만 들어갈 수 있다.' };
    if (lb.ids.length < R.size && !lb.gm) return { error: `${R.size}마리가 모여야 들어갈 수 있다. (지금 ${lb.ids.length}마리)` };
    // 들어가기 직전에 모두 다시 살핌. 안 되는 드래곤은 빼고 알림
    const out = [];
    for (const id of lb.ids) {
      const x = load(id);
      const w = !x ? '사라졌다.' : !live(id) ? '접속해 있지 않다.' : why(x, key, relaxOf(lb));
      if (w) out.push({ id, name: x?.name || '', w });
    }
    if (out.length) {
      lb.ids = lb.ids.filter((id) => !out.some((o) => o.id === id));
      if (!lb.ids.includes(lb.leader)) lb.leader = lb.ids[0];
      const text = `[레이드] 들어가지 못했다. ${out.map((o) => `${o.name}: ${o.w}`).join(' · ')}`;
      for (const id of [...lb.ids, ...out.map((o) => o.id)]) emitTo(id, 'system', { text, at: Date.now() });
      if (!lb.ids.length) closeLobby(lb, null); else push();
      return { error: text.replace('[레이드] ', '') };
    }
    clearTimeout(lb.timer);
    lobbies.delete(key);
    begin(key, lb.ids, lb.gm && (lb.ids.length < R.size || relaxOf(lb)));
    return { ok: true };
  }

  // ── 싸우는 쪽 만들기 ───────────────────────────────
  function part(B, which, hp) {
    const P = B[which];
    return {
      id: null, name: P.name, kind: null, creature: true, elite: true, boss: true, raid: which, level: B.lv, type: P.type, region: B.region,
      corrupted: false, mindDrain: 0,
      hp: Math.round(hp), hpMax: Math.round(hp), en: 0, enMax: 0,
      atk: B.atk * (P.atk || 1), def: B.def * (P.def || 1), spd: P.spd ?? B.spd, mag: B.mag, maj: B.maj,
      taken: 1, element: null, breath: null, skills: [], special: null,
      weak: P.weak || [], resist: P.resist || [], st: {}, cd: {},
    };
  }
  function begin(key, ids, test) {
    roll();
    const B = R.bosses[key];
    const players = [];
    for (const id of ids) {
      const d = load(id);
      logic.regen(d);
      const f = combat.fromDragon(d, 'hunt');
      f.ally = null; // 곁에 둔 새끼는 레이드에 따라오지 않음
      f.hp = Math.min(f.hp, f.hpMax); f.hp0 = f.hp;
      f.ears = 0; f.reaped = 0; f.mindLoss = 0;
      players.push(f);
      logic.dexMeet(d, `raid:${key}`);
      db.saveState(d);
    }
    const scale = test ? ids.length / R.size : 1;
    const total = B.hp * (1 - (st.nerf[key] || 0)) * scale;
    const fight = {
      id: nextId++, key, B, test: !!test, ids: ids.slice(), players, foes: [], phase: 1, phaseAt: 0, turn: 0, plan: null, fire: 0,
      pending: {}, targets: {}, log: [], over: false, outcome: null, guards: {}, heals: {}, deadline: 0, timer: null,
      chat: [], // 레이드 작전 이야기: 함께 싸우는 넷만 보고, 레이드가 끝나면 싸움과 함께 사라짐 (DB에 남기지 않음)
    };
    const opening = SC(fight).setup(fight, total);
    for (const id of ids) inFight.set(id, fight);
    fights.set(fight.id, fight);
    if (!test) { st.tried[key] = true; save(); }
    const nerf = st.nerf[key] ? ` 지난주의 상처가 남아 있어 조금 약해져 있다. (체력 −${Math.round(st.nerf[key] * 100)}%)` : '';
    const lines = [B.intro, `${opening}${nerf}`, `${R.maxTurns}턴 안에 쓰러뜨려야 한다. 보스가 다음 턴에 할 일은 미리 보인다.`];
    if (test) lines.push(`GM 시험: ${ids.length}마리로 들어갔다. 보상과 기록은 남지 않는다.`);
    fight.log.push({ turn: 0, lines });
    schedule(fight);
    arm(fight);
    for (const id of ids) {
      emitTo(id, 'battle:start', { view: viewFor(fight, id), lines, title: `레이드 · ${B.boss.name}` });
      const e = live(id); if (e) sendMe(e.socket, e.dragon);
    }
    presence?.(B.region); // 이곳의 드래곤 목록에 '레이드 중'
    push();
  }

  // ── 상태 ───────────────────────────────────────────
  const alive = (f) => f.hp > 0 && !f.left;
  const livePlayers = (fg) => fg.players.filter(alive);
  const liveFoes = (fg) => fg.foes.filter((f) => f.hp > 0);
  const crowsUp = (fg) => fg.crows.some((c) => c.hp > 0);
  function targetOf(fg, p) {
    const foes = fg.foes;
    let i = fg.targets[p.id];
    if (!Number.isInteger(i) || !foes[i] || foes[i].hp <= 0) {
      i = foes.findIndex((f) => f.hp > 0);
      fg.targets[p.id] = i < 0 ? 0 : i;
    }
    return foes[fg.targets[p.id]];
  }
  const SC = (fg) => SCRIPTS[fg.B.script || 'morven']; // 보스마다의 기믹
  const schedule = (fg) => SC(fg).schedule(fg);
  const intentOf = (fg) => (fg.over ? null : SC(fg).intent(fg));
  const phases = (fg, lines) => SC(fg).phases(fg, lines);
  const isWon = (fg) => SC(fg).isWon(fg);
  const bossTurn = (fg, lines) => SC(fg).bossTurn(fg, lines);
  // ── 모르벤: 다음 턴에 할 일 정하기 (지금 턴이 끝난 뒤 부름. 예고가 없으면 평범한 공격)
  function mvSchedule(fg) {
    const B = fg.B;
    const rel = fg.turn - fg.phaseAt + 1; // 다음 턴이 이 단계의 몇 번째 턴인지
    const ps = livePlayers(fg);
    fg.plan = null;
    if (!ps.length) return;
    if (fg.phase === 1) {
      if (rel % B.gaze.every === 0) fg.plan = { type: 'gaze', at: fg.turn + 1, on: pick(ps).id };
    } else if (fg.phase === 2) {
      if (rel % B.song.every === 0) fg.plan = { type: 'song', at: fg.turn + 1 };
    } else if (rel % B.p3Every === 0) {
      fg.p3n = (fg.p3n || 0) + 1;
      fg.plan = fg.p3n % 2 ? { type: 'gaze', at: fg.turn + 1, on: pick(ps).id } : { type: 'song', at: fg.turn + 1 };
    }
  }
  function mvIntent(fg) {
    const r = mvIntent0(fg);
    const hv = (fg.harvest || []).filter((h) => h.at === fg.turn + 1).map((h) => fg.players.find((p) => p.id === h.on)).filter((p) => p && alive(p));
    if (!hv.length) return r;
    const names = hv.map((p) => p.name).join(', ');
    return { kind: 'heavy', text: `${ga(fg.B.boss.short)} 낫 끝을 ${names} 쪽으로 돌린다. 다 여문 이삭을 거둘 때다.`, hint: `다음 턴 ${names}${josa(hv[hv.length - 1].name, '이', '가')} 수확당한다(즉사). 치유로 이삭을 씻어 내야 한다. 막아서기로는 막을 수 없다.${r.kind === 'heavy' ? ` 그리고 ${r.text}` : ''}` };
  }
  function mvIntent0(fg) {
    const B = fg.B;
    const p = fg.plan;
    if (p?.type === 'gaze') {
      const t = fg.players.find((x) => x.id === p.on);
      return { kind: 'heavy', text: `밭의 허수아비들이 일제히 ${t?.name || ''} 쪽으로 고개를 돌린다.`, hint: `다음 턴 낫질이 ${t?.name || ''}에게 몰린다. 동료가 막아서거나, 비늘 세우기·방어로 버티자.` };
    }
    if (p?.type === 'song') return { kind: 'heavy', text: `${ga(B.boss.name)} 낫을 높이 들고 낮게 노래한다.`, hint: '다음 턴 모두가 크게 다친다. 포효로 노래를 끊을 수 있다 (위엄이 높을수록 잘 끊긴다). 비늘 세우기·방어도 통한다.' };
    if (fg.phase === 1) return { kind: 'attack', text: `${ga(B.lord.name)} 낫을 끌며 다가온다.`, hint: '평범한 공격이 온다.' };
    return { kind: 'attack', text: `${ga(B.boss.name)} 검은 이삭 사이를 천천히 걷는다.`, hint: fg.phase === 2 ? `이삭이 ${B.ears.max}개 다 여물면 수확당한다. 치유로 씻어 내자.` : '그림자와 본체를 함께 쓰러뜨려야 한다.' };
  }

  // ── 화면에 보낼 모습 ───────────────────────────────
  function tagsOf(p, fg) {
    const t = [];
    if (p.ears) t.push({ t: p.ears >= (fg.B.ears?.max || 3) ? '수확 예고' : `검은 이삭 ${p.ears}`, bad: true });
    if (p.reaped) t.push({ t: '거두어짐', bad: true });
    return t;
  }
  function viewFor(fg, id) {
    const me = fg.players.find((p) => p.id === id);
    const foeF = targetOf(fg, me);
    const mv = K.fighterView(me, true);
    mv.tags = tagsOf(me, fg);
    for (const sk of mv.skills || []) { const c = combat.comboOf(foeF, sk.id); if (c) sk.combo = c.name; }
    const ac = combat.comboOf(foeF, 'attack');
    if (ac) mv.attackCombo = ac.name;
    const fv = (f) => ({ ...K.fighterView(f, false), sub: SC(fg).sub?.(f) || '레이드', tags: SC(fg).foeTags?.(fg, f) || [] });
    const multi = fg.foes.length > 1;
    const intent = intentOf(fg);
    return {
      kind: 'raid', raid: fg.key, turn: fg.turn, maxTurns: R.maxTurns, over: fg.over, boss: false, weather: null,
      me: mv, foe: fv(foeF),
      foes: multi ? fg.foes.map((f, i) => ({ ...fv(f), i, intent: null })) : null,
      target: multi ? fg.targets[id] : null,
      intent,
      allies: fg.players.filter((p) => p.id !== id).map((p) => ({ ...K.fighterView(p, false), tags: tagsOf(p, fg), left: !!p.left, chose: !!fg.pending[p.id] || !alive(p) || !!p.reaped })),
      fire: fg.fire, phase: fg.phase, script: fg.B.script || 'morven', duelOn: fg.duel && fg.turn + 1 >= fg.duel.from ? fg.duel.on : null,
      deadline: fg.deadline,
      waiting: !!fg.pending[id],
      won: fg.over ? fg.outcome === 'win' : null,
      fled: fg.over && me.left ? 'me' : null,
      log: fg.log.slice(-1)[0]?.lines || [],
      chat: fg.over ? [] : fg.chat,
    };
  }

  // ── 한 턴 ──────────────────────────────────────────
  function arm(fg) {
    clearTimeout(fg.timer);
    fg.deadline = Date.now() + R.turnSeconds * 1000;
    fg.timer = setTimeout(() => resolve(fg), R.turnSeconds * 1000 + 300);
    fg.timer.unref?.();
  }
  const needs = (fg) => livePlayers(fg).filter((p) => !p.reaped);
  // 자동으로 고르기: 예고된 큰 공격은 막고, 위험하면 치유, 아니면 평소처럼
  function autoPick(fg, p) {
    const foe = targetOf(fg, p);
    const act = combat.aiPick(p, foe, { reserve: 0 });
    if (act.type === 'flee') return { type: 'guard' };
    if (fg.plan?.type === 'song' && p.skills.includes('roar') && !combat.blocked(p, { type: 'skill', id: 'roar' })) return { type: 'skill', id: 'roar' };
    return SC(fg).autoPick?.(fg, p, act) || act;
  }
  // 막아선 동료가 있으면 그 동료가 대신 맞음
  function coverOf(fg, t) { return livePlayers(fg).find((p) => p !== t && p.covering === t.id) || null; }
  function bossStrike(fg, att, t, power, lines, verb, opt = {}) {
    if (!t || !alive(t)) return;
    let recv = t;
    const cv = coverOf(fg, t);
    if (cv) { recv = cv; lines.push(`${ga(cv.name)} ${t.name} 앞을 막아섰다!`); fg.guards[cv.id] = (fg.guards[cv.id] || 0) + 1; }
    // 레이드 보스는 눈이 밝음: 피하기를 잴 때만 속도를 R.accuracy만큼 더 높게 봄 (날개가 높아도 잘 못 피함. 돌풍은 그대로 통함)
    if (!opt.sure) { const s0 = att.spd; att.spd = s0 + R.accuracy; const miss = K.dodged(att, recv, lines); att.spd = s0; if (miss) return; }
    const k = power * (cv ? R.coverTaken : 1);
    const hit = K.damage(att, recv, k, { armorK: R.armorK });
    // 비늘이 아무리 두꺼워도 레이드 보스의 공격은 최대 체력에 비례한 몫이 더 들어감 (만렙 드래곤에게도 아프게)
    // 거기에도 방어·비늘 세우기·돌 비늘·받는 피해 줄이기는 똑같이 통함. 부하(기사·허수아비)는 공격 세기만큼만
    const red = (recv.guarding ? 0.5 : 1) * ((recv.st.harden || 0) > 0 ? 0.5 : 1) * ((recv.st.stone || 0) > 0 ? 0.7 : 1) * (recv.taken || 1);
    const extra = Math.round(recv.hpMax * R.hitPct * k * Math.min(1, att.atk / fg.B.atk) * red);
    const dmg = hit.dmg + extra, note = hit.note;
    recv.hp = Math.max(0, recv.hp - dmg);
    lines.push(`${verb} ${recv.name}에게 ${dmg}의 피해를 입혔다.${note}`);
  }
  function earsOff(p, n, lines) {
    if (!p.ears || n <= 0) return;
    const k = Math.min(p.ears, n);
    p.ears -= k;
    lines.push(`${p.name}에게 박힌 검은 이삭 ${k}개가 씻겨 나갔다.`);
  }
  // 드래곤 하나의 행동
  function act(fg, p, a, lines) {
    p.covering = null;
    const B = fg.B;
    if (p.reaped) { lines.push(`${ga(p.name)} 거두어져 움직이지 못했다.`); return; }
    if (a.type === 'flee') {
      p.left = true;
      lines.push(`${ga(p.name)} 싸움에서 물러났다.`);
      return;
    }
    if (a.type === 'cover') {
      const t = fg.players.find((x) => x.id === a.ally && x !== p && alive(x));
      if (!t) a = { type: 'guard' };
      else { p.covering = t.id; p.guarding = false; lines.push(`${ga(p.name)} ${t.name} 곁을 지키며 막아설 채비를 했다.`); return; }
    }
    // 동료를 치유 (쓰러진 동료면 일으킴)
    if (a.type === 'skill' && a.id === 'mend' && a.ally && a.ally !== p.id && p.skills.includes('mend')) {
      const t = fg.players.find((x) => x.id === a.ally && !x.left);
      const why2 = combat.blocked(p, a);
      if (t && !why2 && !p.st.freeze && !p.st.stun) {
        const s = SKILLS.mend;
        p.en -= s.en;
        p.cd.mend = s.cd + 1;
        const h = K.healAmount(p, s);
        const before = t.hp;
        const up = t.hp <= 0;
        t.hp = Math.max(t.hp, Math.min(t.hpMax, Math.max(0, t.hp) + h));
        if (up) t.down = false;
        lines.push(up ? `${ga(p.name)} 치유 마법으로 쓰러진 ${eul(t.name)} 일으켰다! 체력을 ${Math.round(t.hp - before)} 되찾았다.` : `${ga(p.name)} ${t.name}에게 치유 마법을 펼쳤다! ${ga(t.name)} 체력을 ${Math.round(t.hp - Math.max(0, before))} 되찾았다.`);
        const gone = ['burn', 'poison', 'bleed'].filter((k) => (t.st[k] || 0) > 0);
        for (const k of gone) t.st[k] = 0;
        if (gone.length) lines.push(`${t.name}의 ${gone.map((k) => STATUS[k]).join('·')} 상태가 씻겨 나갔다.`);
        if (B.ears) earsOff(t, 1 + Math.floor((p.mag || 0) / B.ears.cleanseWis), lines);
        fg.heals[p.id] = (fg.heals[p.id] || 0) + 1;
        return;
      }
      if (!t) a = { type: 'skill', id: 'mend' };
    }
    const foe = targetOf(fg, p);
    if (!foe) return;
    if (SC(fg).beforeAct(fg, p, a, foe, lines)) return; // 보스마다의 행동 (우회 등)을 다 처리했으면 끝
    if (a.type === 'flank') a = { type: 'attack' };
    const b = { kind: 'raid', a: p, b: foe, foes: fg.foes, target: fg.foes.indexOf(foe) };
    const usedN = (p.used || []).length;
    const earsBefore = p.ears;
    const bossHp = fg.boss.hp;
    K.perform(b, p, foe, a, lines);
    const did = a.type === 'skill' && (p.used || []).length > usedN; // 스킬을 실제로 썼는지 (얼어붙었거나 기력이 모자라면 아님)
    if (did && a.id === 'roar') (fg.roared ||= []).push(p);
    SC(fg).afterAct(fg, p, a, foe, { did, earsBefore, bossHp }, lines);
  }
  // 모르벤: 드래곤이 움직이기 전 (허수아비가 서 있는 동안 모르벤은 덜 다침)
  function mvBefore(fg) { fg.boss.taken = crowsUp(fg) ? fg.B.summon.shield : 1; return false; }
  // 모르벤: 드래곤이 움직인 뒤 (이삭 씻기, 밀밭의 불길)
  function mvAfter(fg, p, a, foe, { did, earsBefore }, lines) {
    const B = fg.B;
    // 자기 치유: 박힌 이삭도 씻음
    if (did && a.id === 'mend') earsOff(p, 1 + Math.floor((p.mag || 0) / B.ears.cleanseWis), lines);
    // 숨결의 속성: 불은 허수아비를 태우지만 밭에 번지고, 얼음·물은 불길을 끔
    if (did && a.id === 'breath' && p.breath) {
      const el = BREATHS[p.breath]?.element;
      if (el === 'fire' && (foe.raid === 'lord' || foe.raid === 'crow') && fg.fire < B.fire.max) {
        fg.fire += 1;
        lines.push(`불길이 마른 밀밭으로 번졌다! (밀밭의 불길 ${fg.fire}단계)`);
      }
      if ((el === 'ice' || el === 'water') && fg.fire > 0) {
        fg.fire -= 1;
        lines.push(fg.fire ? `${p.breath === 'white' ? '눈보라' : '물살'}가 불길을 잡았다. (밀밭의 불길 ${fg.fire}단계)` : `${p.breath === 'white' ? '눈보라' : '물살'}가 밀밭의 불길을 모두 껐다.`);
      }
      if (p.breath === 'purple' && earsBefore > 0 && p.ears === earsBefore) earsOff(p, 1, lines); // 자수정 숨결의 씻어 내기
    }
  }
  // 쓰러진 쪽 알리기
  function downs(fg, lines) {
    for (const f of [...fg.players, ...fg.foes]) {
      if (f.hp <= 0 && !f.down && !f.left) { f.down = true; lines.push(`${ga(f.name)} ${f.raid === 'banner' ? '꺾였다' : '쓰러졌다'}.`); }
      if (f.hp > 0 && f.down) f.down = false;
    }
  }
  // 모르벤: 단계가 바뀌는지 (드래곤들이 움직인 뒤)
  function mvPhases(fg, lines) {
    const B = fg.B;
    if (fg.phase === 1 && fg.lord.hp <= 0) {
      fg.phase = 2; fg.phaseAt = fg.turn; fg.plan = null;
      fg.foes = [fg.boss, ...fg.crows];
      for (const k of Object.keys(fg.targets)) fg.targets[k] = 0;
      lines.push(...B.lines.phase2);
    }
    if (fg.phase === 2 && fg.boss.hp <= fg.boss.hpMax * B.split.below) {
      const hp = Math.max(fg.boss.hp, Math.round(fg.boss.hpMax * B.split.floor));
      fg.boss.hp = hp; fg.boss.splitHp = hp; // 되살아날 때는 갈라질 때의 체력을 기준으로
      fg.shadow = part(B, 'shadow', hp); fg.shadow.splitHp = hp;
      fg.phase = 3; fg.phaseAt = fg.turn; fg.plan = null; fg.p3n = 0;
      fg.foes = [fg.boss, fg.shadow, ...fg.crows.filter((c) => c.hp > 0)];
      for (const k of Object.keys(fg.targets)) fg.targets[k] = 0;
      lines.push(...B.lines.phase3);
    }
  }
  function resolve(fg) {
    if (fg.over) return;
    clearTimeout(fg.timer);
    const B = fg.B;
    fg.turn += 1;
    const lines = [];
    fg.roared = [];
    for (const f of [...fg.players, ...fg.foes]) f.guarding = false;
    SC(fg).startTurn?.(fg, lines);
    // 행동 모으기 (고르지 않았으면 자동)
    const acts = [];
    for (const p of livePlayers(fg)) acts.push({ p, a: fg.pending[p.id] || autoPick(fg, p), auto: !fg.pending[p.id] });
    fg.pending = {};
    // 막는 행동이 먼저, 그다음 빠른 쪽
    const guardish = (p, a) => a.type === 'guard' || a.type === 'cover' || (a.type === 'skill' && ['harden'].includes(a.id) && !combat.blocked(p, a));
    for (const x of acts) { x.pri = guardish(x.p, x.a) ? 1 : 0; x.sp = (x.p.spd || 0) + rand(0, 3); }
    acts.sort((p, q) => q.pri - p.pri || q.sp - p.sp);
    for (const x of acts) {
      if (fg.over || !alive(x.p)) continue;
      act(fg, x.p, x.a, lines);
      downs(fg, lines);
      phases(fg, lines);
      if (isWon(fg)) break;
    }
    if (!isWon(fg)) bossTurn(fg, lines);
    // 턴 끝: 지속 피해·상태·재사용 대기
    if (!isWon(fg)) {
      for (const p of livePlayers(fg)) {
        K.endOfTurn(p, lines);
        if (p.reaped > 0 && p.reapedAt !== fg.turn) p.reaped -= 1;
      }
      for (const f of liveFoes(fg)) K.endOfTurn(f, lines);
      SC(fg).endTurn(fg, lines);
    }
    if (isWon(fg)) { fg.outcome = 'win'; lines.push(...B.lines.win); }
    else if (!livePlayers(fg).length) { fg.outcome = fg.players.some((p) => p.hp > 0) ? 'left' : 'wipe'; if (fg.outcome === 'wipe') lines.push(...B.lines.wipe); }
    else if (fg.turn >= R.maxTurns) { fg.outcome = 'time'; lines.push(...B.lines.time); }
    fg.log.push({ turn: fg.turn, lines });
    if (fg.outcome) return finish(fg, lines);
    schedule(fg);
    arm(fg);
    for (const p of fg.players) if (!p.gone) emitTo(p.id, 'battle:update', { view: viewFor(fg, p.id), lines });
  }
  const mvWon = (fg) => fg.phase === 3 ? fg.boss.hp <= 0 && fg.shadow.hp <= 0 : fg.phase === 2 && fg.boss.hp <= 0 && !fg.shadow;
  // 모르벤: 턴 끝 (밀밭의 불길, 두 개의 그림자)
  function mvEnd(fg, lines) {
    const B = fg.B;
    if (fg.fire > 0 && livePlayers(fg).length) {
      const pct = B.fire.per * fg.fire;
      for (const p of livePlayers(fg)) p.hp = Math.max(0, p.hp - Math.max(1, Math.round(p.hpMax * pct)));
      lines.push(`밀밭의 불길이 일렁인다. 모두 최대 체력의 ${Math.round(pct * 100)}%만큼 데었다.`);
    }
    downs(fg, lines);
    phases(fg, lines);
    // 두 개의 그림자: 하나만 쓰러지면 정해진 턴 안에 나머지도 쓰러뜨려야 함
    if (fg.phase === 3 && !isWon(fg)) {
      const pair = [fg.boss, fg.shadow];
      const dead = pair.filter((f) => f.hp <= 0);
      if (dead.length === 1) {
        fg.splitDown ||= { turn: fg.turn };
        if (fg.turn - fg.splitDown.turn >= B.split.window) {
          const f = dead[0];
          f.hp = Math.round((f.splitHp || f.hpMax) * B.split.revive);
          f.down = false;
          fg.splitDown = null;
          lines.push(`쓰러졌던 ${ga(f.name)} 검은 이삭을 그러모아 다시 일어선다! (체력 ${Math.round(B.split.revive * 100)}%)`);
        }
      } else fg.splitDown = null;
    }
  }

  // 모르벤: 보스 쪽 차례
  function mvBossTurn(fg, lines) {
    const B = fg.B;
    const ps = () => livePlayers(fg);
    if (!ps().length) return;
    const rel = fg.turn - fg.phaseAt;
    const plan = fg.plan && fg.plan.at === fg.turn ? fg.plan : null;
    const actor = fg.phase === 1 ? fg.lord : fg.boss.hp > 0 ? fg.boss : fg.shadow;
    const can = (f) => f && f.hp > 0 && !(f.st.freeze > 0) && !(f.st.stun > 0);
    // 수확: 이삭이 다 여문 드래곤을 거둠. 그 사이 이삭을 씻어 냈으면 낫이 허공을 가름
    for (const h of fg.harvest.filter((x) => x.at === fg.turn)) {
      const t = fg.players.find((p) => p.id === h.on);
      if (!t || !alive(t)) continue;
      if (t.ears >= B.ears.max) {
        t.hp = 0; t.ears = 0; t.mindLoss = (t.mindLoss || 0) + B.ears.mind;
        lines.push(`${ga(actor.name)} 낫을 크게 휘둘렀다. "거둘 때가 됐다." ${ga(t.name)} 수확당했다! (정신 −${B.ears.mind})`);
      } else lines.push(`${ga(actor.name)} ${t.name} 쪽으로 낫을 휘둘렀지만, 이삭이 씻겨 나가 낫이 허공을 갈랐다.`);
    }
    fg.harvest = fg.harvest.filter((x) => x.at > fg.turn);
    // 예고했던 큰 공격
    if (plan?.type === 'gaze') {
      let t = fg.players.find((p) => p.id === plan.on && alive(p));
      if (!t) t = pick(ps());
      lines.push(`${ga(actor.name)} 허수아비들이 가리키는 쪽으로 낫을 휘둘렀다!`);
      bossStrike(fg, actor, t, B.gaze.power, lines, '낫질이', { sure: true });
    } else if (plan?.type === 'song') {
      const cut = (fg.roared || []).find((p) => Math.random() < clamp(0.5 + ((p.maj || 0) - B.maj) * 0.04, 0.2, 0.95));
      if (cut) lines.push(`${ga(cut.name)} 포효로 노래를 끊었다! 노래가 흐트러진다.`);
      else if ((fg.roared || []).length) lines.push('포효가 울렸지만 노래는 끊기지 않았다.');
      lines.push(cut ? '흐트러진 노래가 밀밭을 스친다.' : `${B.boss.name}의 노래가 밀밭을 덮는다. 이삭들이 일제히 고개를 숙인다.`);
      for (const p of ps()) {
        let n = p.hpMax * B.song.pct * (cut ? B.song.cut : 1);
        if (p.guarding) n *= 0.5;
        if ((p.st.harden || 0) > 0) n *= 0.5;
        if ((p.st.stone || 0) > 0) n *= 0.7;
        n = Math.max(1, Math.round(n * (p.taken || 1)));
        p.hp = Math.max(0, p.hp - n);
        lines.push(`${ga(p.name)} ${n}의 피해를 입었다.`);
      }
    } else if (can(actor)) {
      // 평범한 공격
      bossStrike(fg, actor, pick(ps()), 1, lines, `${ga(actor.name)} 낫을 휘둘러`);
    } else if (actor && actor.hp > 0) lines.push(`${ga(actor.name)} 움직이지 못했다.`);
    // 그림자도 따로 공격
    if (fg.phase === 3 && fg.shadow && can(fg.shadow) && actor !== fg.shadow && ps().length) bossStrike(fg, fg.shadow, pick(ps()), 1, lines, `${ga(fg.shadow.name)} 손을 뻗어`);
    // 허수아비들
    for (const c of fg.crows) if (can(c) && ps().length) bossStrike(fg, c, pick(ps()), 1, lines, `${ga(c.name)} 낫을 휘둘러`);
    if (fg.phase >= 2) {
      // 검은 이삭: 정해진 턴마다 몇 드래곤에게 박힘. 다 차면 거두어짐 (한 턴 움직이지 못하고 정신이 깎임)
      if (rel > 0 && rel % B.ears.every === 0 && ps().length) {
        const pool = ps().slice().sort(() => Math.random() - 0.5).slice(0, B.ears.n);
        lines.push(`${ga(B.boss.name)} 검은 이삭 한 줌을 흩뿌렸다. ${pool.map((p) => p.name).join(', ')}에게 이삭이 박혔다.`);
        for (const p of pool) {
          p.ears = Math.min(B.ears.max, p.ears + 1);
          if (p.ears >= B.ears.max && !fg.harvest.some((h) => h.on === p.id)) {
            fg.harvest.push({ on: p.id, at: fg.turn + 1 });
            lines.push(`${p.name}의 이삭이 다 여물었다. ${ga(B.boss.short)} 낫 끝을 ${p.name} 쪽으로 돌린다…`);
          }
        }
      }
      // 허수아비 부르기 (2단계에만)
      if (fg.phase === 2 && fg.summons < B.summon.at.length && rel === B.summon.at[fg.summons]) {
        fg.summons += 1;
        const add = [];
        for (let i = 0; i < B.summon.n; i++) {
          const c = part(B, 'crow', fg.boss.hpMax * B.summon.hp);
          c.name = `${B.crow.sides[i] || ''} ${B.crow.name}`.trim();
          c.raid = 'crow';
          add.push(c);
        }
        fg.crows = [...fg.crows.filter((c) => c.hp > 0), ...add];
        fg.foes = [fg.boss, ...fg.crows];
        for (const k of Object.keys(fg.targets)) fg.targets[k] = 0;
        lines.push(`${ga(B.boss.name)} 밭을 향해 손짓한다. ${B.crow.name} ${['', '하나가', '둘이', '셋이'][add.length] || `${add.length}개가`} 일어선다! 허수아비가 서 있는 동안 ${B.boss.name}에게는 피해가 절반만 들어간다.`);
      }
    }
    downs(fg, lines);
  }

  // ── 모르벤: 시작 ──
  function mvSetup(fg, total) {
    const B = fg.B;
    fg.lord = part(B, 'lord', total * B.lordShare);
    fg.boss = part(B, 'boss', total * (1 - B.lordShare));
    fg.shadow = null; fg.crows = []; fg.summons = 0; fg.splitDown = null; fg.harvest = [];
    fg.foes = [fg.lord];
    return `${ga(B.lord.name)} 앞을 막아선다. 뒤에서 ${ga(B.boss.name)} 실을 당기듯 손가락을 움직인다.`;
  }

  // ── 헤이른 (카르넴 기사단): 방패벽·우회, 돌격 대열, 기사단 깃발, 일기토 ──
  const bannerUp = (fg) => !!fg.banner && fg.banner.hp > 0;
  const duelNow = (fg) => !!fg.duel && fg.turn >= fg.duel.from && fg.turn <= fg.duel.until;
  function knSetup(fg, total) {
    const B = fg.B;
    fg.knights = B.knight.names.map((nm) => { const k = part(B, 'knight', total * B.knightShare); k.name = nm; return k; });
    fg.boss = part(B, 'boss', total * (1 - B.knightShare * B.knight.names.length));
    fg.banner = null; fg.bannerDownAt = null; fg.duel = null; fg.exposedUntil = 0; fg.flanks = {}; fg.duels = {}; fg.offenders = [];
    fg.wall = false; fg.wallBroken = false;
    fg.foes = [...fg.knights];
    return `기사 ${B.knight.names.length}명이 방패를 맞대고 성문 앞을 막아선다. 그 뒤에서 ${ga(B.boss.name)} 검을 땅에 꽂은 채 이쪽을 내려다본다.`;
  }
  function knSchedule(fg) {
    const B = fg.B;
    const rel = fg.turn - fg.phaseAt + 1;
    const ps = livePlayers(fg);
    fg.plan = null;
    if (!ps.length) return;
    if (fg.phase === 1) { if (rel % B.wall.every === 0) fg.plan = { type: 'wall', at: fg.turn + 1 }; return; }
    if (fg.duel && fg.duel.until > fg.turn) return; // 일기토가 이어지는 동안은 다른 예고 없음
    if (fg.phase === 3 && (rel - 1) % B.duel.every === 0) {
      const on = pick(ps).id;
      fg.duel = { on, from: fg.turn + 1, until: fg.turn + B.duel.turns };
      fg.plan = { type: 'duel', at: fg.turn + 1, on };
      return;
    }
    if (rel % B.charge.every === 0) {
      const two = ps.slice().sort(() => Math.random() - 0.5).slice(0, B.charge.n);
      fg.plan = { type: 'charge', at: fg.turn + 1, on: two.map((p) => p.id) };
    }
  }
  function knIntent(fg) {
    const B = fg.B;
    const p = fg.plan;
    const nm = (id) => fg.players.find((x) => x.id === id)?.name || '';
    const flagHint = bannerUp(fg) ? ` 깃발이 서 있는 동안 ${B.boss.short}${josa(B.boss.short, '은', '는')} 덜 다치고 조금씩 회복한다. 하늘 낙하·날개 돌풍으로 꺾자.` : '';
    if (p?.type === 'wall') return { kind: 'self', text: `${ga(B.boss.name)} 외친다. "대열을 세워라!"`, hint: '다음 턴 기사들이 방패를 맞댄다. 정면 공격은 거의 막힌다. 우회(날개)나 땅울림으로 대열을 깨자.' };
    if (p?.type === 'charge') {
      const [a, b] = p.on.map(nm);
      return { kind: 'heavy', text: `${ga(B.boss.name)} 창을 낮추고 ${a}${b ? `${josa(a, '과', '와')} ${b}` : ''}${josa(b || a, '을', '를')} 한 줄로 꿰뚫을 자세를 잡는다.`, hint: `다음 턴 돌격이 온다. 날개 돌풍으로 피하거나, 동료가 막아서자. 방어로는 절반만 줄어든다.${flagHint}` };
    }
    if (p?.type === 'duel') return { kind: 'debuff', text: `"${nm(p.on)}, 이름을 대라. 일대일로 겨루겠다."`, hint: `${B.duel.turns}턴 동안 ${B.boss.short}${josa(B.boss.short, '은', '는')} ${nm(p.on)}만 노린다. 다른 드래곤이 ${eul(B.boss.short)} 치면 기사도를 어긴 것이 된다. 치유와 막아서기는 괜찮다.` };
    if (fg.duel && fg.turn + 1 <= fg.duel.until && fg.turn + 1 >= fg.duel.from) return { kind: 'debuff', text: `${B.boss.short}${josa(B.boss.short, '과', '와')} ${nm(fg.duel.on)}의 일기토가 이어진다. (남은 ${fg.duel.until - fg.turn}턴)`, hint: `${nm(fg.duel.on)}${josa(nm(fg.duel.on), '이', '가')} 버티면 ${ga(B.boss.short)} 방패를 내린다. 동료는 치유와 막아서기로 돕자.` };
    if (fg.phase === 1) return { kind: 'attack', text: '기사들이 방패 너머로 창을 겨눈다.', hint: '평범한 공격이 온다.' };
    return { kind: 'attack', text: `${ga(B.boss.name)} 검을 고쳐 쥔다.`, hint: `평범한 공격이 온다.${flagHint}` };
  }
  function knStart(fg, lines) {
    fg.wall = fg.phase === 1 && fg.plan?.type === 'wall' && fg.plan.at === fg.turn;
    fg.wallBroken = false;
    fg.offenders = [];
    if (fg.wall) lines.push('기사들이 방패를 맞대어 벽을 세웠다!');
  }
  // 받는 피해 배율 맞추기 (방패벽, 깃발의 가호, 일기토 뒤 빈틈)
  function knTaken(fg) {
    const B = fg.B;
    for (const k of fg.knights) k.taken = fg.wall && !fg.wallBroken ? B.wall.front : fg.wallBroken ? B.wall.broken : 1;
    fg.boss.taken = (bannerUp(fg) ? B.banner.taken : 1) * (fg.exposedUntil >= fg.turn ? B.duel.after : 1);
  }
  function knBefore(fg, p, a, foe, lines) {
    const B = fg.B;
    knTaken(fg);
    // 깃발: 하늘 낙하·날개 돌풍으로만 닿음
    if (foe === fg.banner) {
      const reach = a.type === 'skill' && B.banner.only.includes(a.id) && !combat.blocked(p, a);
      fg.banner.taken = reach ? 1 : 0;
      if (!reach) { lines.push(`${ga(p.name)} 깃발을 노렸지만 높이 걸려 있어 닿지 않는다. 하늘 낙하나 날개 돌풍으로만 꺾을 수 있다.`); return true; }
    }
    if (a.type !== 'flank') return false;
    // 우회: 방패벽 턴이면 날개로 판정. 성공하면 대열이 깨지고 그 턴 남은 공격이 모두 크게 들어감
    const bossHp = fg.boss.hp;
    let power = B.flank.power;
    if (fg.wall && !fg.wallBroken) {
      const ch = clamp(0.5 + ((p.spd || 0) - B.flank.wing) * 0.04, 0.2, 0.95);
      if (Math.random() < ch) {
        fg.wallBroken = true; power = 1;
        fg.flanks[p.id] = (fg.flanks[p.id] || 0) + 1;
        lines.push(`${ga(p.name)} 날개를 펼쳐 대열 옆으로 파고들었다! 방패벽이 무너졌다.`);
        knTaken(fg);
      } else lines.push(`${ga(p.name)} 옆으로 돌아들었지만 방패에 막혔다.`);
    } else lines.push(`${ga(p.name)} 옆으로 돌아들어 ${foe.name}의 빈 곳을 노린다.`);
    if (K.dodged(p, foe, lines)) return true;
    const { dmg, note } = K.damage(p, foe, power, {});
    foe.hp = Math.max(0, foe.hp - dmg);
    lines.push(`${ga(p.name)} ${foe.name}에게 ${dmg}의 피해를 입혔다.${note}`);
    knAfter(fg, p, a, foe, { did: false, bossHp }, lines);
    return true;
  }
  function knAfter(fg, p, a, foe, { did, bossHp }, lines) {
    if (did && a.id === 'quake' && fg.wall && !fg.wallBroken) { fg.wallBroken = true; lines.push('땅울림에 방패벽이 흔들려 무너졌다!'); knTaken(fg); }
    // 일기토에 끼어들면 기사도를 어긴 것
    if (duelNow(fg) && p.id !== fg.duel.on && fg.boss.hp < bossHp && !fg.offenders.includes(p)) {
      fg.offenders.push(p);
      lines.push(`${ga(p.name)} 일기토에 끼어들었다! "기사도를 어겼구나."`);
    }
  }
  function knPhases(fg, lines) {
    const B = fg.B;
    if (fg.phase === 1 && fg.knights.every((k) => k.hp <= 0)) {
      fg.phase = 2; fg.phaseAt = fg.turn; fg.plan = null; fg.wall = false;
      fg.banner = part(B, 'banner', fg.boss.hpMax * B.banner.hp);
      fg.foes = [fg.boss, fg.banner];
      for (const k of Object.keys(fg.targets)) fg.targets[k] = 0;
      lines.push(...B.lines.phase2);
    }
    if (fg.phase === 2 && fg.boss.hp > 0 && fg.boss.hp <= fg.boss.hpMax * B.duel.below) {
      fg.phase = 3; fg.phaseAt = fg.turn; fg.plan = null;
      lines.push(...B.lines.phase3);
    }
  }
  const knWon = (fg) => fg.phase >= 2 && fg.boss.hp <= 0;
  function knBossTurn(fg, lines) {
    const B = fg.B;
    const ps = () => livePlayers(fg);
    if (!ps().length) return;
    const plan = fg.plan && fg.plan.at === fg.turn ? fg.plan : null;
    const can = (f) => f && f.hp > 0 && !(f.st.freeze > 0) && !(f.st.stun > 0);
    if (fg.phase === 1) {
      // 기사들: 방패벽을 세운 턴은 막기만 함
      if (fg.wall) { lines.push('기사들이 방패 뒤에서 버틴다.'); }
      else for (const k of fg.knights) if (can(k) && ps().length) bossStrike(fg, k, pick(ps()), 1, lines, `${ga(k.name)} 창을 찔러`);
      downs(fg, lines);
      return;
    }
    const h = fg.boss;
    // 기사도를 어긴 드래곤에게 반격
    for (const o of fg.offenders) if (h.hp > 0 && alive(o)) bossStrike(fg, h, o, B.duel.punish, lines, `${ga(h.name)} 돌아서서 검을 휘둘러`);
    if (duelNow(fg)) {
      const t = fg.players.find((x) => x.id === fg.duel.on && alive(x));
      if (t && can(h)) bossStrike(fg, h, t, 1, lines, `${ga(h.name)} 일기토의 검을 내리쳐`);
    } else if (plan?.type === 'charge') {
      lines.push(`${ga(h.name)} 창을 앞세워 돌격한다!`);
      for (const id of plan.on) { const t = fg.players.find((x) => x.id === id && alive(x)); if (t) bossStrike(fg, h, t, B.charge.power, lines, '돌격이'); }
    } else if (can(h)) bossStrike(fg, h, pick(ps()), 1, lines, `${ga(h.name)} 검을 휘둘러`);
    else if (h.hp > 0) lines.push(`${ga(h.name)} 움직이지 못했다.`);
    downs(fg, lines);
  }
  function knEnd(fg, lines) {
    const B = fg.B;
    downs(fg, lines);
    phases(fg, lines);
    if (knWon(fg)) return;
    if (fg.phase >= 2 && fg.banner) {
      if (bannerUp(fg) && fg.boss.hp > 0 && fg.boss.hp < fg.boss.hpMax) {
        const n = Math.min(fg.boss.hpMax - fg.boss.hp, Math.round(fg.boss.hpMax * B.banner.regen));
        fg.boss.hp += n;
        lines.push(`깃발 아래에서 ${ga(fg.boss.name)} 숨을 고른다. (체력 +${n})`);
      }
      if (!bannerUp(fg)) {
        if (fg.bannerDownAt == null) fg.bannerDownAt = fg.turn;
        else if (fg.turn - fg.bannerDownAt >= B.banner.back) {
          fg.banner.hp = fg.banner.hpMax; fg.banner.down = false; fg.bannerDownAt = null;
          lines.push('기사단 깃발이 다시 성문 위에 오른다!');
        }
      }
    }
    // 일기토가 끝났는지
    if (fg.duel && fg.turn >= fg.duel.from) {
      const t = fg.players.find((x) => x.id === fg.duel.on);
      if (!t || !alive(t)) {
        const n = Math.round(fg.boss.hpMax * B.duel.heal);
        fg.boss.hp = Math.min(fg.boss.hpMax, fg.boss.hp + n);
        lines.push(`일기토가 끝났다. ${ga(fg.boss.name)} 검을 거두며 숨을 고른다. (체력 +${n})`);
        fg.duel = null;
      } else if (fg.turn >= fg.duel.until) {
        fg.exposedUntil = fg.turn + B.duel.afterTurns;
        fg.duels[t.id] = (fg.duels[t.id] || 0) + 1;
        lines.push(`${ga(fg.boss.name)} 검을 내리며 고개를 끄덕인다. "좋은 상대였다." 방패를 내린 ${B.boss.short}에게 공격이 깊이 들어간다. (${B.duel.afterTurns}턴)`);
        fg.duel = null;
      }
    }
  }
  // 자동으로 고를 때: 방패벽 턴에는 우회, 남의 일기토 중에는 헤이른을 치지 않음
  function knAuto(fg, p, act) {
    const plan = fg.plan && fg.plan.at === fg.turn ? fg.plan : null;
    if (plan?.type === 'wall' || fg.wall) return { type: 'flank' };
    if (duelNow(fg) && p.id !== fg.duel.on && targetOf(fg, p) === fg.boss) return { type: 'guard' };
    return null;
  }
  const knSub = (f) => (f.raid === 'knight' ? '기사' : f.raid === 'banner' ? '깃발' : '레이드');
  function knTags(fg, f) {
    const t = [];
    if (f.raid === 'knight' && fg.wall && !fg.wallBroken && f.hp > 0) t.push({ t: '방패벽' });
    if (f.raid === 'banner') t.push({ t: '하늘 낙하·돌풍으로만' });
    if (f === fg.boss) {
      if (bannerUp(fg)) t.push({ t: '깃발의 가호' });
      if (fg.exposedUntil >= fg.turn + 1) t.push({ t: '방패를 내림', bad: true });
      if (fg.duel && fg.turn + 1 >= fg.duel.from) t.push({ t: `일기토 · ${fg.players.find((x) => x.id === fg.duel.on)?.name || ''}` });
    }
    return t;
  }

  const SCRIPTS = {
    morven: { setup: mvSetup, schedule: mvSchedule, intent: mvIntent, beforeAct: mvBefore, afterAct: mvAfter, phases: mvPhases, endTurn: mvEnd, bossTurn: mvBossTurn, isWon: mvWon,
      // 자동으로 고를 때: 수확당할 동료(나 포함)가 있으면 치유로 이삭부터 씻음
      autoPick: (fg, p) => { const t = fg.players.find((x) => alive(x) && (fg.harvest || []).some((h) => h.on === x.id && h.at === fg.turn) && x.ears >= fg.B.ears.max); return t && p.skills.includes('mend') && !combat.blocked(p, { type: 'skill', id: 'mend' }) ? { type: 'skill', id: 'mend', ally: t.id === p.id ? null : t.id } : null; },
      sub: (f) => (f.raid === 'crow' ? '허수아비' : '레이드'), foeTags: (fg, f) => (f === fg.boss && crowsUp(fg) ? [{ t: '허수아비 뒤에 숨음' }] : []) },
    knights: { setup: knSetup, schedule: knSchedule, intent: knIntent, startTurn: knStart, beforeAct: knBefore, afterAct: knAfter, phases: knPhases, endTurn: knEnd, bossTurn: knBossTurn, isWon: knWon,
      autoPick: knAuto, sub: knSub, foeTags: knTags },
  };

  // ── 끝내기 ─────────────────────────────────────────
  function finish(fg, lastLines) {
    fg.over = true;
    clearTimeout(fg.timer);
    fights.delete(fg.id);
    for (const id of fg.ids) if (inFight.get(id) === fg) inFight.delete(id);
    const B = fg.B;
    const won = fg.outcome === 'win';
    const now = Date.now();
    if (won && !fg.test) {
      st.cleared[fg.key] = true;
      const names = fg.players.map((p) => p.name);
      if (!st.first[fg.key]) {
        st.first[fg.key] = { at: now, names };
        news(`[레이드] ${names.join(', ')}${josa(names[names.length - 1], '이', '가')} ${REGIONS[B.region].name}에서 ${eul(B.boss.name)} 처음 쓰러뜨렸다! (${fg.turn}턴)`);
      } else io.emit('system', { text: `[레이드] ${names.join(', ')}${josa(names[names.length - 1], '이', '가')} ${eul(B.boss.name)} 쓰러뜨렸다. (${fg.turn}턴)`, at: now }); // 대륙 소식(기록)에는 첫 처치만
      if (!st.best[fg.key] || fg.turn < st.best[fg.key].turns) st.best[fg.key] = { turns: fg.turn, names, at: now };
      save();
    }
    for (const p of fg.players) {
      const d = load(p.id);
      if (!d) continue;
      logic.regen(d);
      const res = { title: `레이드 · ${B.boss.name}`, lines: [], items: [], win: won };
      const items = [];
      let falls = false;
      if (p.left) {
        d.hp = Math.max(1, Math.round(p.hp)); d.en = Math.max(0, Math.round(p.en));
        res.head = '물러났다.';
        res.lines.push('싸움에서 물러났다. 이번 레이드의 몫은 없다.');
      } else if (won) {
        d.hp = Math.max(Math.round(p.hp), p.hp > 0 ? 1 : Math.round(p.hpMax * R.downHeal));
        d.en = Math.max(0, Math.round(p.en));
        res.head = `${eul(B.boss.name)} 쓰러뜨렸다!`;
        if (p.hp <= 0) res.lines.push('쓰러졌지만, 동료들이 끝까지 버텨 낸 덕에 다시 눈을 떴다.');
        if (fg.test) res.lines.push('GM 시험이라 보상은 없다.');
        else {
          logic.dexWin(d, `raid:${fg.key}`);
          res.lines.push(...logic.traitCount(d, `raidwin_${fg.key}`));
          const first = (logic.traitsOf(d).counts[`raidwin_${fg.key}`] || 0) === 1;
          if (usedOf(d.id, fg.key) < R.weekly) {
            (st.used[fg.key] ||= {})[d.id] = usedOf(d.id, fg.key) + 1;
            const W = B.reward;
            const gold = randInt(...W.gold);
            d.gold += gold;
            items.push({ id: W.shard, qty: first ? W.firstShard : W.shards }, { id: 'purify_shard', qty: W.purifyShard });
            if (Math.random() < W.journalChance) items.push({ id: W.journal, qty: 1 });
            const got = [...items.map((x) => logic.itemLabel(x)), `금화 ${gold}닢`].join(', ');
            res.lines.push(`${got}${josa(got, '을', '를')} 얻었다.`);
            if (first) res.lines.push(`처음 쓰러뜨렸으니 ${eul(ITEM_NAME(W.shard))} 넉넉히 챙겼다. 장신구 하나를 빚을 만큼이다.`);
            if (first) res.lines.push(logic.chestAdd(d, W.keepsake, '', '', now, null, {}) ? B.lines.keepsake : `${B.lines.keepsakeNoNest}`);
            res.lines.push(...purify(d, W.purify));
            res.lines.push(`이번 주 ${B.boss.name} 보상 ${st.used[fg.key][d.id]}/${R.weekly}`);
            const f = logic.addFame(d, W.fame);
            if (f) res.lines.push(f);
            save();
          } else {
            res.lines.push(`이번 주 보상은 이미 다 받았다. 이번에는 동료를 도우러 왔다.`);
            res.lines.push(...logic.traitCount(d, 'raidhelp'));
          }
          logic.chron(d, 'mark', `${REGIONS[B.region].name}에서 동료들과 ${eul(B.boss.name)} 쓰러뜨렸다. (${fg.turn}턴)`);
        }
      } else {
        // 시간 초과는 서 있던 드래곤이 크게 다친 채 물러나고, 쓰러져 있던 드래곤은 쓰러짐. 전멸하면 모두 쓰러짐
        res.head = fg.outcome === 'time' ? B.lines.timeHead : fg.outcome === 'left' ? '모두 물러났다.' : '모두 쓰러졌다.';
        if (p.hp > 0) {
          d.hp = Math.max(1, Math.round(p.hp - p.hpMax * R.retreatLoss));
          d.en = Math.max(0, Math.round(p.en));
          if (!fg.test) res.lines.push(`겨우 몸을 빼냈다. 체력을 크게 잃었다.`);
        } else {
          d.hp = 0;
          falls = !fg.test;
          if (fg.test) d.hp = 1;
          res.lines.push(fg.test ? 'GM 시험이라 쓰러지지 않는다.' : '눈앞이 캄캄해진다. 숨이 멎어 간다…');
        }
        if (!fg.test) logic.chron(d, 'mark', `${REGIONS[B.region].name}에서 ${B.boss.name}에게 맞섰지만 물러섰다.`);
      }
      if (fg.guards[p.id] && !fg.test) res.lines.push(...logic.traitCount(d, 'raidguard', fg.guards[p.id]));
      if (fg.heals[p.id] && !fg.test) res.lines.push(...logic.traitCount(d, 'healother', fg.heals[p.id]));
      if (fg.flanks?.[p.id] && !fg.test) res.lines.push(...logic.traitCount(d, 'raidflank', fg.flanks[p.id]));
      if (fg.duels?.[p.id] && !fg.test) res.lines.push(...logic.traitCount(d, 'raidduel', fg.duels[p.id]));
      if (p.mindLoss && !fg.test) res.lines.push(...logic.loseMind(d, p.mindLoss));
      if (falls) d.hp = 1;
      if (fg.test && !p.left) { d.hp = Math.max(1, Math.round(p.hp0 ?? d.hp)); res.lines.push('GM 시험이라 체력은 들어가기 전으로 돌아왔다.'); } // 시험은 다치지 않음
      db.saveState(d, items);
      const e = live(p.id);
      const v = viewFor(fg, p.id);
      if (e) {
        sendMe(e.socket, d);
        e.socket.emit('battle:end', { view: { ...v, log: lastLines }, result: res });
      } else for (const l of [res.head, ...res.lines]) db.noteAdd(p.id, `[레이드] ${l}`);
      if (falls) fall(d, B.boss.name);
    }
    for (const r of new Set(fg.ids.map((id) => load(id)?.region).filter(Boolean))) presence?.(r);
    push();
  }
  const ITEM_NAME = (id) => ITEMS[id]?.name || id;

  // ── 소켓 ───────────────────────────────────────────
  function attach(socket) {
    const me = () => { const e = online.get(socket.data.dragonId); return e && e.socket === socket ? e.dragon : null; };
    const on = (ev, fn) => socket.on(ev, (p, ack) => {
      if (typeof ack !== 'function') ack = () => {};
      const d = me();
      if (!d) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
      try { ack(fn(d, p || {}) || { ok: true }); } catch (e) { console.error('[레이드]', ev, e); ack({ error: '처리하다 문제가 생겼다.' }); }
    });
    on('raidboss:get', () => ({ ok: true, view: view() }));
    on('raidboss:open', (d, p) => openLobby(d, str(p.key), !!socket.data.user?.is_gm));
    on('raidboss:join', (d, p) => joinLobby(d, str(p.key)));
    on('raidboss:leave', (d) => leaveLobby(d));
    on('raidboss:start', (d, p) => startLobby(d, str(p.key)));
    on('raidboss:act', (d, p) => {
      const fg = inFight.get(d.id);
      if (!fg || fg.over) return { error: '레이드 중이 아니다.' };
      const me2 = fg.players.find((x) => x.id === d.id);
      if (!alive(me2)) return { error: me2.left ? '이미 물러났다.' : '쓰러져 있다. 동료가 일으켜 주기를 기다리자.' };
      if (me2.reaped) return { error: '거두어져 이번 턴은 움직일 수 없다.' };
      if (fg.pending[d.id]) return { error: '이미 골랐다. 동료를 기다리는 중이다.' };
      const type = str(p.type);
      if (!ACTS.includes(type)) return { error: '알 수 없는 행동이다.' };
      const a = type === 'skill' ? { type, id: str(p.id) } : { type };
      if (type === 'flank' && fg.B.script !== 'knights') return { error: '이 레이드에서는 우회할 대열이 없다.' };
      if (Number.isInteger(p.t) && fg.foes[p.t] && fg.foes[p.t].hp > 0) fg.targets[d.id] = p.t;
      const ally = Number(p.ally) || null;
      if (type === 'cover') {
        if (!ally || !fg.players.some((x) => x.id === ally && x.id !== d.id && alive(x))) return { error: '막아설 동료를 먼저 고르자.' };
        a.ally = ally;
      }
      if (type === 'skill' && a.id === 'mend' && ally && ally !== d.id) {
        if (!fg.players.some((x) => x.id === ally && !x.left)) return { error: '그 동료는 이미 물러났다.' };
        a.ally = ally;
      }
      const why2 = combat.blocked(me2, a);
      if (why2) return { error: why2 };
      fg.pending[d.id] = a;
      if (needs(fg).every((x) => fg.pending[x.id])) { setImmediate(() => resolve(fg)); return { ok: true, waiting: true }; }
      const chosen = Object.fromEntries(fg.players.map((x) => [x.id, !!fg.pending[x.id] || !alive(x) || !!x.reaped]));
      for (const x of fg.players) if (x.id !== d.id) emitTo(x.id, 'raidboss:wait', { chosen });
      return { ok: true, waiting: true };
    });
    // 레이드 작전 이야기 (함께 싸우는 동료에게만)
    on('raidboss:say', (d, p) => {
      const fg = inFight.get(d.id);
      if (!fg || fg.over) return { error: '레이드 중이 아니다.' };
      const text = str(p.text).replace(/\s+/g, ' ').slice(0, R.chatMax);
      if (!text) return { error: '할 말을 적자.' };
      const now = Date.now();
      if (now - (fg.saidAt?.[d.id] || 0) < 700) return { error: '조금 천천히 말하자.' };
      (fg.saidAt ||= {})[d.id] = now;
      const msg = { id: d.id, name: d.name, text, at: now };
      fg.chat.push(msg);
      if (fg.chat.length > 80) fg.chat.shift();
      for (const x of fg.players) emitTo(x.id, 'raidboss:chat', msg);
      return { ok: true };
    });
    on('raidboss:target', (d, p) => {
      const fg = inFight.get(d.id);
      if (!fg || fg.over) return { error: '레이드 중이 아니다.' };
      const t = Number(p.t);
      if (!Number.isInteger(t) || !fg.foes[t] || fg.foes[t].hp <= 0) return { error: '그 적은 이미 쓰러졌다.' };
      fg.targets[d.id] = t;
      return { ok: true, view: viewFor(fg, d.id) };
    });
  }
  // 다시 접속했을 때 싸우던 레이드가 있으면 화면을 다시 보내 줌
  function resume(id, socket) {
    const fg = inFight.get(id);
    if (!fg || fg.over) return false;
    socket.emit('battle:start', { view: viewFor(fg, id), lines: ['다시 돌아와 레이드를 이어 간다.'], title: `레이드 · ${fg.B.boss.name}` });
    return true;
  }
  function get(id) {
    const fg = inFight.get(id);
    if (!fg || fg.over) return null;
    return { ok: true, view: viewFor(fg, id), log: fg.log.flatMap((t) => t.lines).slice(-8), title: `레이드 · ${fg.B.boss.name}` };
  }
  // 모집에 들어간 드래곤이 떠나면 (접속 끊김은 그대로 둠. 들어갈 때 다시 살핌)
  const cleared = (key) => !!st.first[key];

  return { attach, view, meView, busy: (id) => inFight.has(id), resume, get, cleared, _state: () => st };
};
