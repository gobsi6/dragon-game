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

module.exports = function setupRaidBoss({ io, db, online, logic, combat, arena, sendMe, isOpen, fall, purify, news, presence, track }) {
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
  { const set = inFight.set.bind(inFight), del = inFight.delete.bind(inFight); // 서버가 다시 켜졌을 때 끊긴 레이드를 안내하려고 바깥에 알림
    inFight.set = (id, f) => { track?.(id, 'raid'); return set(id, f); };
    inFight.delete = (id) => { track?.(id, null); return del(id); }; }
  let nextId = 1;
  const live = (id) => online.get(id) || null;
  const load = (id) => { const e = live(id); return e ? e.dragon : db.getDragon(id); };
  const emitTo = (id, ev, data) => { const e = live(id); if (e) e.socket.emit(ev, data); };
  const lobbyOf = (id) => [...lobbies.values()].find((l) => l.ids.includes(id)) || null;
  const usedOf = (id, key) => { roll(); return st.used[key]?.[id] || 0; }; // 이번 주에 그 레이드 보상을 받은 횟수
  const weeklyOf = (key) => R.bosses[key]?.weekly || R.weekly;   // 레이드마다 주간 보상 횟수 (균열은 2회)
  const turnsOf = (fg) => fg.B.maxTurns || R.maxTurns;            // 레이드마다 턴 제한 (균열은 22턴)
  // 입장 자격 (균열: 모르벤·헤이른을 각각 한 번 이상 쓰러뜨렸는지. 첫 처치 칭호로 셈)
  const qualified = (d, key) => (R.bosses[key]?.needs || []).every((t) => logic.titlesOf(d).have.includes(t));

  // ── 모두에게 보낼 모습 ─────────────────────────────
  function view() {
    roll();
    return {
      weekly: R.weekly, size: R.size, minLevel: R.minLevel,
      list: Object.entries(R.bosses).map(([key, B]) => {
        const lb = lobbies.get(key);
        return {
          key, name: B.name, region: B.region, place: B.place, open: isOpen(B.region), script: B.script || 'morven', weekly: weeklyOf(key),
          lobby: lb ? { leader: lb.leader, ids: lb.ids.slice(), names: lb.ids.map((id) => load(id)?.name || ''), until: lb.until, ready: lb.ready.slice(), gm: !!lb.gm } : null,
          fighting: [...fights.values()].filter((f) => f.key === key && !f.over).length,
          best: st.best[key] ? { turns: st.best[key].turns, names: st.best[key].names } : null,
          first: !!st.first[key],
        };
      }),
    };
  }
  const push = () => io.emit('raidboss', view());
  const meView = (d) => ({ used: Object.fromEntries(Object.keys(R.bosses).map((k) => [k, usedOf(d.id, k)])), weekly: R.weekly, inRaid: inFight.has(d.id),
    locked: Object.fromEntries(Object.keys(R.bosses).filter((k) => !qualified(d, k)).map((k) => [k, true])) }); // 아직 자격이 없는 레이드

  // ── 들어갈 수 있는지 ───────────────────────────────
  // relax: GM 시험 (아직 열리지 않은 레이드를 멸망한 대륙 어디서든 미리 해 봄)
  function why(d, key, relax = false, gm = false) {
    const B = R.bosses[key];
    if (!B) return '그런 레이드는 없다.';
    if (isTestDragon(d)) return '시험용 드래곤은 다른 드래곤과 어울릴 수 없다.';
    if (d.level < R.minLevel) return `레벨 ${R.minLevel}이 되어야 함께할 수 있다.`;
    if (!gm && !qualified(d, key)) return '아직 균열 아래로 내려갈 때가 아니다.'; // 무엇이 모자란지는 밝히지 않음 (GM 시험은 자격 없이)
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
    const w = why(d, key, !!gm && !isOpen(R.bosses[key].region), !!gm);
    if (w) return { error: w };
    if (lobbies.has(key)) return { error: '이미 누군가 모집하고 있다. 함께 가기를 눌러 합류하자.' };
    if (lobbyOf(d.id)) return { error: '이미 다른 모집에 들어가 있다.' };
    const B = R.bosses[key];
    const lb = { key, leader: d.id, ids: [d.id], until: Date.now() + R.recruitMs, gm: !!gm, ready: [] }; // ready: 준비를 누른 드래곤 (넷이 다 차야 누를 수 있고, 넷 모두 누르면 들어감)
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
    lb.ready = []; // 사람이 바뀌면 준비는 처음부터
    for (const id of lb.ids) if (id !== d.id) emitTo(id, 'system', { text: `[레이드] ${ga(d.name)} 함께하기로 했다. (${lb.ids.length}/${R.size})`, at: Date.now() });
    push();
    return { ok: true };
  }
  function leaveLobby(d) {
    const lb = lobbyOf(d.id);
    if (!lb) return { error: '모집에 들어가 있지 않다.' };
    lb.ids = lb.ids.filter((id) => id !== d.id);
    lb.ready = [];
    if (!lb.ids.length) { closeLobby(lb, null); return { ok: true }; }
    if (lb.leader === d.id) lb.leader = lb.ids[0];
    for (const id of lb.ids) emitTo(id, 'system', { text: `[레이드] ${ga(d.name)} 빠졌다. (${lb.ids.length}/${R.size})`, at: Date.now() });
    push();
    return { ok: true };
  }
  // GM 시험: 모집한 GM이 인원이 덜 차도 바로 들어감
  function startLobby(d, key) {
    const lb = lobbies.get(key);
    if (!lb || !lb.ids.includes(d.id)) return { error: '모집에 들어가 있지 않다.' };
    if (!lb.gm || lb.leader !== d.id) return { error: `${R.size}마리가 모두 준비를 누르면 들어간다.` };
    return launch(lb);
  }
  // 준비: 넷이 다 찬 뒤에 저마다 누름. 넷 모두 누르면 바로 들어감 (다시 누르면 준비 취소)
  function readyLobby(d, key) {
    const lb = lobbies.get(key);
    if (!lb || !lb.ids.includes(d.id)) return { error: '모집에 들어가 있지 않다.' };
    if (lb.ids.length < R.size) return { error: `${R.size}마리가 모이면 준비할 수 있다. (지금 ${lb.ids.length}마리)` };
    const on = !lb.ready.includes(d.id);
    lb.ready = on ? [...lb.ready, d.id] : lb.ready.filter((id) => id !== d.id);
    const text = `[레이드] ${ga(d.name)} ${on ? '준비를 마쳤다' : '준비를 거두었다'}. (준비 ${lb.ready.length}/${R.size})`;
    for (const id of lb.ids) emitTo(id, 'system', { text, at: Date.now() });
    if (lb.ready.length >= R.size && lb.ids.every((id) => lb.ready.includes(id))) return launch(lb);
    push();
    return { ok: true };
  }
  function launch(lb) {
    const key = lb.key;
    // 들어가기 직전에 모두 다시 살핌. 안 되는 드래곤은 빼고 알림
    const out = [];
    for (const id of lb.ids) {
      const x = load(id);
      const w = !x ? '사라졌다.' : !live(id) ? '접속해 있지 않다.' : why(x, key, relaxOf(lb), lb.gm && id === lb.leader);
      if (w) out.push({ id, name: x?.name || '', w });
    }
    if (out.length) {
      lb.ids = lb.ids.filter((id) => !out.some((o) => o.id === id));
      lb.ready = [];
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
      f.atk *= (logic.titleMods(d).eliteAtk || 1) * logic.gearMods(d).eliteAtk; // 레이드 보스도 강적: '강적과 싸울 때 공격' 칭호·희귀 장비가 듦 (강적 전투와 같은 방식)
      f.hp = Math.min(f.hp, f.hpMax); f.hp0 = f.hp;
      f.ears = 0; f.reaped = 0; f.mindLoss = 0; f.erosion = 0; f.consumed = false; f.away = 0; // erosion·consumed·away: 균열 (잿빛 침식, 잿빛에 먹힘, 가장자리로 밀려남)
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
    const lines = [B.intro, `${opening}${nerf}`, `${B.maxTurns || R.maxTurns}턴 안에 쓰러뜨려야 한다. 보스가 다음 턴에 할 일은 미리 보인다.`];
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
    return { kind: 'heavy', text: `${ga(fg.B.boss.short)} 낫 끝을 ${names} 쪽으로 돌린다. 다 여문 이삭을 거둘 때다.`, hint: r.kind === 'heavy' ? `그리고 ${r.text}` : '' };
  }
  function mvIntent0(fg) {
    const B = fg.B;
    const p = fg.plan;
    if (p?.type === 'gaze') {
      const t = fg.players.find((x) => x.id === p.on);
      return { kind: 'heavy', text: `밭의 허수아비들이 일제히 ${t?.name || ''} 쪽으로 고개를 돌린다.`, hint: '' };
    }
    if (p?.type === 'song') return { kind: 'heavy', text: `${ga(B.boss.name)} 낫을 높이 들고 낮게 노래한다.`, hint: '' };
    if (fg.phase === 1) return { kind: 'attack', text: `${ga(B.lord.name)} 낫을 끌며 다가온다.`, hint: '' };
    return { kind: 'attack', text: `${ga(B.boss.name)} 검은 이삭 사이를 천천히 걷는다.`, hint: '' };
  }

  // ── 화면에 보낼 모습 ───────────────────────────────
  function tagsOf(p, fg) {
    const t = [];
    if (p.ears) t.push({ t: `검은 이삭 ${p.ears}`, bad: true });
    if (p.reaped) t.push({ t: '거두어짐', bad: true });
    if (p.erosion) t.push({ t: `잿빛 침식 ${p.erosion}`, bad: true });
    if (p.consumed) t.push({ t: '잿빛에 먹힘', bad: true });
    if (p.away) t.push({ t: `균열 끝 · ${p.away}턴`, bad: true });
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
      kind: 'raid', raid: fg.key, turn: fg.turn, maxTurns: turnsOf(fg), over: fg.over, boss: false, weather: null,
      me: mv, foe: fv(foeF),
      foes: multi ? fg.foes.map((f, i) => ({ ...fv(f), i, intent: null })) : null,
      target: multi ? fg.targets[id] : null,
      intent,
      allies: [...fg.players.filter((p) => p.id !== id).map((p) => ({ ...K.fighterView(p, false), tags: tagsOf(p, fg), left: !!p.left, chose: !!fg.pending[p.id] || !alive(p) || !!p.reaped || !!p.away || !!p.consumed })),
        ...(fg.ember ? [{ ...K.fighterView(fg.ember, false), id: 'ember', tags: [{ t: fg.ember.hp > 0 ? '지켜야 할 불씨' : '꺼짐', bad: fg.ember.hp <= 0 }], chose: true, left: fg.ember.hp <= 0 }] : [])], // 균열: 불씨도 동료처럼 골라 막아서기·치유
      fire: fg.fire, phase: fg.phase, script: fg.B.script || 'morven', duelOn: fg.duel && fg.turn + 1 >= fg.duel.from ? fg.duel.on : null,
      deadline: fg.deadline,
      waiting: !!fg.pending[id],
      pick: fg.pending[id] ? { type: fg.pending[id].type, id: fg.pending[id].id || null, ally: fg.pending[id].ally ?? null } : null, // 고른 행동 (대상을 바꾸거나 다시 고를 때 화면에 보임)
      won: fg.over ? fg.outcome === 'win' : null,
      fled: fg.over && me.left ? 'me' : null,
      log: fg.log.slice(-1)[0]?.lines || [],
      chat: fg.over ? [] : fg.chat,
    };
  }

  // ── 한 턴 ──────────────────────────────────────────
  function arm(fg) {
    clearTimeout(fg.timer);
    // 이번 턴에 고를 수 있는 드래곤이 아무도 없으면 (모두 잿빛에 먹혔거나 밀려났거나 거두어짐) 60초를 기다리지 않고 곧 넘어감
    const wait = needs(fg).length ? R.turnSeconds * 1000 : 3000;
    fg.deadline = Date.now() + wait;
    fg.timer = setTimeout(() => resolve(fg), wait + 300);
    fg.timer.unref?.();
  }
  const needs = (fg) => livePlayers(fg).filter((p) => !p.reaped && !p.away && !p.consumed);
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
    const k = power * (cv ? R.coverTaken * (cv.coverK || 1) : 1); // 막아선 쪽의 희귀 장비(넝마 망토)
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
    if (SC(fg).override?.(fg, p, a, lines)) return; // 보스마다 내 차례를 빼앗는 일 (균열: 잿빛에 먹힘, 가장자리로 밀려남)
    if (a.type === 'flee') {
      p.left = true;
      lines.push(`${ga(p.name)} 싸움에서 물러났다.`);
      return;
    }
    if (a.type === 'cover') {
      const t = fg.players.find((x) => x.id === a.ally && x !== p && alive(x)) || (a.ally === 'ember' && fg.ember?.hp > 0 ? fg.ember : null);
      if (!t) a = { type: 'guard' };
      else { p.covering = t.id; p.guarding = false; lines.push(`${ga(p.name)} ${t.name} 곁을 지키며 막아설 채비를 했다.`); return; }
    }
    // 동료를 치유 (쓰러진 동료면 일으킴)
    if (a.type === 'skill' && a.id === 'mend' && a.ally && a.ally !== p.id && p.skills.includes('mend')) {
      const t = fg.players.find((x) => x.id === a.ally && !x.left) || (a.ally === 'ember' && fg.ember?.hp > 0 ? fg.ember : null);
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
        if (B.erosion && t.erosion) erosionOff(t, 1 + Math.floor((p.mag || 0) / B.erosion.cleanseWis), lines); // 균열: 잿빛 침식 씻기 (먹힌 동료도 깨어남)
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
    // 희귀 장비(금 간 투구): 레이드 적에게 주는 피해. 이 행동 동안만 적들이 그만큼 더 다침 (치유량에는 영향 없음)
    const rk = p.raidAtk || 1, t0 = rk !== 1 ? fg.foes.map((f) => f.taken) : null;
    if (t0) for (const f of fg.foes) f.taken *= rk;
    try { K.perform(b, p, foe, a, lines); } finally { if (t0) fg.foes.forEach((f, i) => { f.taken = t0[i]; }); }
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
    else if (fg.turn >= turnsOf(fg)) { fg.outcome = 'time'; lines.push(...B.lines.time); }
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
        lines.push(`${ga(B.boss.name)} 밭을 향해 손짓한다. ${B.crow.name} ${['', '하나가', '둘이', '셋이'][add.length] || `${add.length}개가`} 일어선다!`);
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
    if (p?.type === 'wall') return { kind: 'self', text: `${ga(B.boss.name)} 외친다. "대열을 세워라!"`, hint: '' };
    if (p?.type === 'charge') {
      const [a, b] = p.on.map(nm);
      return { kind: 'heavy', text: `${ga(B.boss.name)} 창을 낮추고 ${a}${b ? `${josa(a, '과', '와')} ${b}` : ''}${josa(b || a, '을', '를')} 한 줄로 꿰뚫을 자세를 잡는다.`, hint: '' };
    }
    if (p?.type === 'duel') return { kind: 'debuff', text: `"${nm(p.on)}, 이름을 대라. 일대일로 겨루겠다."`, hint: '' };
    if (fg.duel && fg.turn + 1 <= fg.duel.until && fg.turn + 1 >= fg.duel.from) return { kind: 'debuff', text: `${B.boss.short}${josa(B.boss.short, '과', '와')} ${nm(fg.duel.on)}의 일기토가 이어진다. (남은 ${fg.duel.until - fg.turn}턴)`, hint: '' };
    if (fg.phase === 1) return { kind: 'attack', text: '기사들이 방패 너머로 창을 겨눈다.', hint: '' };
    return { kind: 'attack', text: `${ga(B.boss.name)} 검을 고쳐 쥔다.`, hint: '' };
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
      if (!reach) { lines.push(`${ga(p.name)} 깃발을 노렸지만 높이 걸려 있어 닿지 않는다.`); return true; }
    }
    if (a.type !== 'flank') return false;
    // 우회: 방패벽 턴이면 날개로 판정. 성공하면 대열이 깨지고 그 턴 남은 공격이 모두 크게 들어감
    const bossHp = fg.boss.hp;
    let power = B.flank.power;
    if (fg.wall && !fg.wallBroken) {
      const ch = clamp(0.5 + ((p.spd || 0) - B.flank.wing) * 0.04 + (p.flankK || 0), 0.2, 0.95); // 희귀 장비(깃발의 날개덮개)
      if (Math.random() < ch) {
        fg.wallBroken = true; power = 1;
        fg.flanks[p.id] = (fg.flanks[p.id] || 0) + 1;
        lines.push(`${ga(p.name)} 날개를 펼쳐 대열 옆으로 파고들었다! 방패벽이 무너졌다.`);
        knTaken(fg);
      } else lines.push(`${ga(p.name)} 옆으로 돌아들었지만 방패에 막혔다.`);
    } else lines.push(`${ga(p.name)} 옆으로 돌아들어 ${foe.name}의 빈 곳을 노린다.`);
    if (K.dodged(p, foe, lines)) return true;
    const { dmg, note } = K.damage(p, foe, power * (p.raidAtk || 1), {});
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
    if (f === fg.boss) {
      if (bannerUp(fg)) t.push({ t: '깃발의 가호' });
      if (fg.exposedUntil >= fg.turn + 1) t.push({ t: '방패를 내림', bad: true });
      if (fg.duel && fg.turn + 1 >= fg.duel.from) t.push({ t: `일기토 · ${fg.players.find((x) => x.id === fg.duel.on)?.name || ''}` });
    }
    return t;
  }

  // ── 균열을 지킨 자 아스테르 (엔드 레이드): 잿빛 침식, 심연의 숨, 번개 숨결, 꺼지지 않은 불씨, 가장자리, 마지막 숨 ──
  function erosionOff(p, n, lines) {
    if (!p.erosion || n <= 0) return;
    const k = Math.min(p.erosion, n);
    p.erosion -= k;
    lines.push(`${p.name}에게 스며든 잿빛 침식이 ${k}겹 씻겨 나갔다.`);
    if (p.consumed) { p.consumed = false; lines.push(`${ga(p.name)} 정신을 차렸다.`); }
  }
  const rps = (fg) => livePlayers(fg).filter((p) => !p.away); // 가장자리로 밀려나지 않은 드래곤
  const rtNow = (fg, type) => (fg.plans || []).find((x) => x.at === fg.turn && x.type === type);
  const rtNext = (fg) => (fg.plans || []).filter((x) => x.at === fg.turn + 1);
  function rtSetup(fg, total) {
    const B = fg.B;
    fg.boss = part(B, 'boss', total);
    fg.foes = [fg.boss];
    fg.ember = null; fg.emberLost = false; fg.last = null; fg.plans = []; fg.roarDelays = {}; fg.dispersed = false;
    return `${ga(B.boss.name)} 균열 위로 몸을 끌어올린다. 금빛과 잿빛이 뒤섞인 비늘이 번개를 머금고 일렁인다.`;
  }
  function rtSchedule(fg) {
    const B = fg.B;
    const nt = fg.turn + 1, rel = nt - fg.phaseAt;
    const ps = rps(fg);
    fg.plans = [];
    if (!ps.length) return;
    const plans = [];
    if (fg.phase === 3 && fg.ember?.hp > 0 && rel > 0 && rel % B.hesitate.every === 0) plans.push({ type: 'hesitate' });
    else {
      if (fg.phase <= 2 && rel > 0 && rel % B.abyss.every === 0) plans.push({ type: 'abyss' });
      if (nt % B.bolt.every === 0) plans.push({ type: 'bolt', on: ps.slice().sort(() => Math.random() - 0.5).slice(0, B.bolt.n).map((p) => p.id) });
      if (fg.phase >= 2 && fg.ember?.hp > 0 && rel > 0 && rel % B.emberHit.every === 0) plans.push({ type: 'ember' });
      if (fg.phase >= 2 && rel > 0 && rel % B.push.every === 0) plans.push({ type: 'push', on: pick(ps).id });
    }
    fg.plans = plans.map((x) => ({ ...x, at: nt }));
  }
  function rtIntent(fg) {
    const B = fg.B;
    const nm = (id) => fg.players.find((x) => x.id === id)?.name || '';
    const parts = [];
    let heavy = false;
    for (const x of rtNext(fg)) {
      if (x.type === 'hesitate') return { kind: 'self', text: `${B.boss.short}의 눈빛이 잠깐 흔들린다. 가슴의 불씨가 깜빡인다.`, hint: '' };
      if (x.type === 'abyss') { heavy = true; parts.push(`${ga(B.boss.short)} 균열 아래로 고개를 숙여 깊은 숨을 들이마신다.`); }
      if (x.type === 'bolt') { heavy = true; const ns = x.on.map(nm); parts.push(`비늘 사이로 번개가 튄다. ${ns.join(josa(ns[0], '과', '와') + ' ')} 쪽을 노린다.`); }
      if (x.type === 'ember') { heavy = true; parts.push('심연의 숨이 불씨 쪽으로 일렁인다.'); }
      if (x.type === 'push') parts.push(`${ga(B.boss.short)} 날개를 들어 ${nm(x.on)}${josa(nm(x.on), '을', '를')} 균열 끝으로 쓸어내려 한다.`);
    }
    if (fg.phase === 3 && fg.last) { heavy = heavy || fg.last.n + 1 >= B.last.charge; parts.push(`마지막 숨이 모인다. (${fg.last.n}/${B.last.charge})`); }
    if (!parts.length) parts.push(fg.phase === 1 ? `${ga(B.boss.short)} 바위를 움켜쥐고 이쪽을 노려본다.` : `${ga(B.boss.short)} 잿빛 발톱을 치켜든다.`);
    return { kind: heavy ? 'heavy' : 'attack', text: parts.join(' '), hint: '' };
  }
  // 내 차례를 빼앗는 일: 가장자리로 밀려났거나, 잿빛에 먹혔으면 아무것도 못 함 (먹힌 드래곤은 보스 차례에 동료를 공격)
  function rtOverride(fg, p, a, lines) {
    if (p.away > 0) { lines.push(`${ga(p.name)} 균열 끝에 매달려 올라오려 애쓴다.`); return true; }
    if (p.consumed) { lines.push(`${ga(p.name)} 잿빛에 먹혀 몸이 말을 듣지 않는다…`); return true; }
    return false;
  }
  function rtAfter(fg, p, a, foe, { did, bossHp }, lines) {
    const B = fg.B;
    if (did && a.id === 'mend') erosionOff(p, 1 + Math.floor((p.mag || 0) / B.erosion.cleanseWis), lines);
    // 날개 돌풍으로 심연의 숨 흩트리기
    if (did && a.id === 'gust' && rtNow(fg, 'abyss') && !fg.dispersed) {
      const G = B.abyss.gust;
      if (Math.random() < clamp(0.5 + ((p.spd || 0) - G.wing) * G.per, 0.1, 0.95)) { fg.dispersed = true; lines.push(`${ga(p.name)} 날개 돌풍으로 모이던 심연의 숨을 흩트렸다!`); }
      else { p.gustFail = true; lines.push(`${p.name}의 돌풍이 심연의 숨을 다 흩트리지 못했다.`); }
    }
    if (did && a.id === 'roar') {
      // 포효: 잿빛에 먹힌 동료를 깨움
      for (const x of fg.players) if (x.consumed && x !== p) { x.consumed = false; x.erosion = 0; lines.push(`${p.name}의 포효에 ${ga(x.name)} 정신을 차렸다. 잿빛 침식이 걷혔다.`); }
      // 마지막 숨 늦추기 (위엄)
      if (fg.phase === 3 && fg.last?.n > 0) {
        const L = B.last;
        if (Math.random() < clamp(L.roarBase + ((p.maj || 0) - B.maj) * L.roarPer + (p.roarK || 0), 0.2, 0.95)) {
          fg.last.n -= 1;
          fg.roarDelays[p.id] = (fg.roarDelays[p.id] || 0) + 1;
          lines.push(`${p.name}의 포효에 모이던 마지막 숨이 흐트러졌다. (${fg.last.n}/${L.charge})`);
        } else lines.push(`${p.name}의 포효가 마지막 숨을 막지 못했다.`);
      }
    }
    // 마지막 숨: 모으는 동안 큰 피해를 주면 흩어짐
    if (fg.phase === 3 && fg.last && fg.last.n > 0 && bossHp > fg.boss.hp) {
      fg.last.dealt += bossHp - fg.boss.hp;
      if (fg.last.dealt >= fg.boss.hpMax * B.last.cut) { fg.last.n = 0; fg.last.dealt = 0; lines.push('거센 공격에 고룡이 휘청인다. 모으던 마지막 숨이 흩어졌다!'); }
    }
  }
  function rtPhases(fg, lines) {
    const B = fg.B;
    if (fg.phase === 1 && fg.boss.hp > 0 && fg.boss.hp <= fg.boss.hpMax * B.phase2) {
      fg.phase = 2; fg.phaseAt = fg.turn;
      fg.ember = part(B, 'ember', B.ember.hp); fg.ember.id = 'ember'; fg.ember.atk = 0;
      lines.push(...B.lines.phase2);
    }
    if (fg.phase === 2 && fg.boss.hp > 0 && fg.boss.hp <= fg.boss.hpMax * B.phase3) {
      fg.phase = 3; fg.phaseAt = fg.turn; fg.last = { n: 0, dealt: 0 };
      lines.push(...B.lines.phase3);
    }
  }
  const rtWon = (fg) => fg.boss.hp <= 0;
  function rtBossTurn(fg, lines) {
    const B = fg.B, h = fg.boss;
    const ps = () => rps(fg);
    const red = (p) => (p.guarding ? 0.5 : 1) * ((p.st.harden || 0) > 0 ? 0.5 : 1) * ((p.st.stone || 0) > 0 ? 0.7 : 1) * (p.taken || 1);
    // 잿빛에 먹힌 드래곤이 동료에게 달려듦
    for (const p of livePlayers(fg)) {
      if (!p.consumed || p.away) continue;
      const others = ps().filter((x) => x !== p);
      if (others.length) { const t = pick(others); const { dmg } = K.damage(p, t, 1, {}); t.hp = Math.max(0, t.hp - dmg); lines.push(`잿빛에 먹힌 ${ga(p.name)} ${t.name}에게 달려들어 ${dmg}의 피해를 입혔다!`); }
      p.consumed = false; p.erosion = 0;
    }
    downs(fg, lines);
    if (!ps().length || h.hp <= 0) return;
    if (rtNow(fg, 'hesitate')) { lines.push(`${ga(h.name)} 멈칫한다. 가슴의 불씨가 깜빡이며 발톱이 허공에서 멈춘다. "…아직… 아니다."`); return; }
    if (h.st.freeze > 0 || h.st.stun > 0) { lines.push(`${ga(h.name)} 움직이지 못했다.`); return; }
    let heavy = false;
    if (rtNow(fg, 'abyss')) {
      heavy = true;
      const pct = B.abyss.pct * (fg.dispersed ? 0.5 : 1);
      const hits = ps().map((p) => { const n = Math.max(1, Math.round(p.hpMax * pct * red(p) * (p.gustFail ? B.abyss.gust.fail : 1))); p.hp = Math.max(0, p.hp - n); return `${p.name} ${n}`; });
      lines.push(`심연의 숨이 균열 위를 덮쳤다!${fg.dispersed ? ' (흩어져 절반)' : ''} ${hits.join(', ')}의 피해.`);
    }
    const bolt = rtNow(fg, 'bolt');
    if (bolt) {
      heavy = true;
      lines.push(`${ga(h.name)} 번개 숨결을 내리쳤다!`);
      for (const id of bolt.on) {
        const t = fg.players.find((x) => x.id === id && alive(x) && !x.away);
        if (!t) continue;
        const recv = coverOf(fg, t) || t;
        const before = recv.hp;
        bossStrike(fg, h, t, B.bolt.power, lines, '번개가');
        if (recv.hp < before && recv.hp > 0) {
          const K2 = B.bolt;
          const keep = clamp(((recv.maj || 0) - K2.majBase) * K2.majPer, 0, K2.majMax) + (recv.ccResist || 0);
          if (Math.random() < keep) lines.push(`${ga(recv.name)} 위엄으로 번개를 떨쳐 내 마비되지 않았다.`);
          else { recv.st.stun = 2; lines.push(`${ga(recv.name)} 마비되었다!`); }
        }
      }
    }
    if (rtNow(fg, 'ember') && fg.ember?.hp > 0) { heavy = true; bossStrike(fg, h, fg.ember, B.emberHit.power, lines, '심연의 숨이 불씨를 덮쳐'); }
    const push = rtNow(fg, 'push');
    if (push) {
      const t = fg.players.find((x) => x.id === push.on && alive(x) && !x.away);
      if (t) {
        const P = B.push;
        if (Math.random() < clamp(0.5 + ((t.spd || 0) - P.wing) * P.per, 0.1, 0.95)) lines.push(`${ga(t.name)} 날개를 펼쳐 균열 가장자리에서 버텼다.`);
        else { t.away = P.away; t.awaySet = fg.turn; lines.push(`${ga(t.name)} 균열 끝으로 밀려났다! (${P.away}턴 동안 싸움에서 빠진다)`); }
      }
    }
    if (fg.phase === 3 && fg.last) {
      fg.last.n += 1;
      if (fg.last.n >= B.last.charge) {
        heavy = true;
        const hits = ps().map((p) => { const n = Math.max(1, Math.round(p.hpMax * B.last.pct * red(p))); p.hp = Math.max(0, p.hp - n); return `${p.name} ${n}`; });
        lines.push(`${ga(h.name)} 마지막 숨을 토해 냈다! 균열 위가 잿빛으로 뒤덮인다. ${hits.join(', ')}의 피해.`);
        fg.last.n = 0; fg.last.dealt = 0;
      } else lines.push(`마지막 숨이 모인다. (${fg.last.n}/${B.last.charge})`);
    }
    if (!heavy && ps().length) bossStrike(fg, h, pick(ps()), 1, lines, `${ga(h.name)} 발톱을 휘둘러`);
    // 잿빛 침식이 스며듦
    const er = ps().slice().sort(() => Math.random() - 0.5).slice(0, B.erosion.n);
    for (const p of er) {
      p.erosion = Math.min(B.erosion.max, (p.erosion || 0) + 1);
      if (p.erosion >= B.erosion.max && !p.consumed) { p.consumed = true; lines.push(`${p.name}의 눈빛이 잿빛으로 흐려진다…`); }
    }
    if (er.length) lines.push(`잿빛 침식이 ${er.map((p) => p.name).join(', ')}에게 스며든다.`);
    downs(fg, lines);
  }
  function rtEnd(fg, lines) {
    const B = fg.B;
    fg.dispersed = false;
    for (const p of fg.players) p.gustFail = false;
    downs(fg, lines);
    phases(fg, lines);
    if (fg.ember && fg.ember.hp <= 0 && !fg.emberLost) {
      fg.emberLost = true;
      fg.boss.atk *= B.emberHit.lost;
      lines.push(`불씨가 꺼졌다. ${ga(fg.boss.name)} 완전히 심연에 넘어갔다. 눈빛에서 금빛이 사라진다.`);
    }
    for (const p of fg.players) {
      if (!(p.away > 0) || p.awaySet === fg.turn) continue;
      p.away -= 1;
      if (p.away === 0 && p.hp > 0) {
        p.hp = Math.min(p.hp, Math.round(p.hpMax * B.push.back));
        lines.push(`${ga(p.name)} 균열 끝에서 기어올라 싸움에 돌아왔다.`);
      }
    }
  }
  // 자동으로 고를 때: 먹힌 동료 깨우기, 심연의 숨 흩트리기, 불씨 지키기, 침식 씻기, 마지막 숨 늦추기
  function rtAuto(fg, p) {
    const has = (id) => p.skills.includes(id) && !combat.blocked(p, { type: 'skill', id });
    if (has('roar') && (fg.players.some((x) => x.consumed && x !== p) || (fg.phase === 3 && fg.last?.n >= 3))) return { type: 'skill', id: 'roar' };
    if (rtNow(fg, 'abyss') && has('gust')) return { type: 'skill', id: 'gust' };
    if (rtNow(fg, 'ember') && fg.ember?.hp > 0) {
      const tank = rps(fg).slice().sort((a, b) => (b.def || 0) - (a.def || 0))[0];
      if (tank === p) return { type: 'cover', ally: 'ember' };
    }
    const er = rps(fg).find((x) => x !== p && x.erosion >= fg.B.erosion.max - 1);
    if (er && has('mend')) return { type: 'skill', id: 'mend', ally: er.id };
    return null;
  }
  function rtTags(fg, f) {
    const t = [];
    if (f === fg.boss) {
      if (fg.emberLost) t.push({ t: '심연에 넘어감', bad: true });
      if (fg.phase === 3 && fg.last) t.push({ t: `마지막 숨 ${fg.last.n}/${fg.B.last.charge}` });
    }
    return t;
  }

  const SCRIPTS = {
    morven: { setup: mvSetup, schedule: mvSchedule, intent: mvIntent, beforeAct: mvBefore, afterAct: mvAfter, phases: mvPhases, endTurn: mvEnd, bossTurn: mvBossTurn, isWon: mvWon,
      // 자동으로 고를 때: 수확당할 동료(나 포함)가 있으면 치유로 이삭부터 씻음
      autoPick: (fg, p) => { const t = fg.players.find((x) => alive(x) && (fg.harvest || []).some((h) => h.on === x.id && h.at === fg.turn) && x.ears >= fg.B.ears.max); return t && p.skills.includes('mend') && !combat.blocked(p, { type: 'skill', id: 'mend' }) ? { type: 'skill', id: 'mend', ally: t.id === p.id ? null : t.id } : null; },
      sub: (f) => (f.raid === 'crow' ? '허수아비' : '레이드'), foeTags: () => [] },
    knights: { setup: knSetup, schedule: knSchedule, intent: knIntent, startTurn: knStart, beforeAct: knBefore, afterAct: knAfter, phases: knPhases, endTurn: knEnd, bossTurn: knBossTurn, isWon: knWon,
      autoPick: knAuto, sub: knSub, foeTags: knTags },
    rift: { setup: rtSetup, schedule: rtSchedule, intent: rtIntent, override: rtOverride, beforeAct: () => false, afterAct: rtAfter, phases: rtPhases, endTurn: rtEnd, bossTurn: rtBossTurn, isWon: rtWon,
      autoPick: rtAuto, sub: () => '레이드', foeTags: rtTags },
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
        fg.firstClear = true;
        news(`[레이드] ${names.join(', ')}${josa(names[names.length - 1], '이', '가')} ${REGIONS[B.region].name}에서 ${eul(B.boss.name)} 처음 쓰러뜨렸다! (${fg.turn}턴)`);
      } else io.emit('system', { text: `[레이드] ${names.join(', ')}${josa(names[names.length - 1], '이', '가')} ${eul(B.boss.name)} 쓰러뜨렸다. (${fg.turn}턴)`, at: now }); // 대륙 소식(기록)에는 첫 처치만
      if (!st.best[fg.key] || fg.turn < st.best[fg.key].turns) st.best[fg.key] = { turns: fg.turn, names, at: now };
      save();
    }
    for (const p of fg.players) {
      const d = load(p.id);
      if (!d) continue;
      logic.regen(d);
      const res = { title: `레이드 · ${B.boss.name}`, lines: [], items: [], win: won && !p.left };
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
          if (usedOf(d.id, fg.key) < weeklyOf(fg.key)) {
            (st.used[fg.key] ||= {})[d.id] = usedOf(d.id, fg.key) + 1;
            const W = B.reward;
            const gold = randInt(...W.gold);
            d.gold += gold;
            res.gold = gold; // 결과 카드에 금화 칩으로
            items.push({ id: W.shard, qty: first ? W.firstShard : W.shards }, { id: 'purify_shard', qty: W.purifyShard });
            if (Math.random() < W.journalChance) items.push({ id: W.journal, qty: 1 });
            const got = [...items.map((x) => logic.itemLabel(x)), `금화 ${gold}닢`].join(', ');
            res.lines.push(`${got}${josa(got, '을', '를')} 얻었다.`);
            // 희귀 전리품: 드래곤마다 따로 굴림 (장비 둘 중 하나, 보물 하나). 얻으면 대륙 소식에도
            const RC = R.rareChance || {};
            const found = [];
            if (B.rare?.gear?.length && Math.random() < (RC.gear || 0)) found.push(pick(B.rare.gear));
            if (B.rare?.treasure && Math.random() < (RC.treasure || 0)) found.push(B.rare.treasure);
            for (const id of found) {
              items.push({ id, qty: 1 });
              res.lines.push(`${B.boss.short}의 발치에서 ${eul(ITEM_NAME(id))} 찾았다! (희귀)`);
              news(`[레이드] ${ga(d.name)} ${B.boss.short}의 발치에서 ${eul(ITEM_NAME(id))} 찾았다!`);
            }
            if (first) res.lines.push(`처음 쓰러뜨렸으니 ${eul(ITEM_NAME(W.shard))} 넉넉히 챙겼다. 장신구 하나를 빚을 만큼이다.`);
            if (first) res.lines.push(logic.chestAdd(d, W.keepsake, '', '', now, null, {}) ? B.lines.keepsake : `${B.lines.keepsakeNoNest}`);
            res.lines.push(...purify(d, W.purify));
            res.lines.push(`이번 주 ${B.boss.name} 보상 ${st.used[fg.key][d.id]}/${weeklyOf(fg.key)}`);
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
      if (fg.roarDelays?.[p.id] && !fg.test) res.lines.push(...logic.traitCount(d, 'riftroar', fg.roarDelays[p.id])); // 균열: 마지막 숨을 포효로 늦춘 횟수
      if (won && !p.left && !fg.test && fg.ember && fg.ember.hp > 0) res.lines.push(...logic.traitCount(d, 'riftember')); // 균열: 불씨를 지킨 채 쓰러뜨림
      if (won && !p.left && !fg.test && fg.firstClear && B.firstTitle) res.lines.push(...logic.traitCount(d, B.firstTitle)); // 서버에서 처음 쓰러뜨린 넷 (전시용 칭호)
      if (p.mindLoss && !fg.test) res.lines.push(...logic.loseMind(d, p.mindLoss));
      if (falls) d.hp = 1;
      if (fg.test && !p.left) { d.hp = Math.max(1, Math.round(p.hp0 ?? d.hp)); res.lines.push('GM 시험이라 체력은 들어가기 전으로 돌아왔다.'); } // 시험은 다치지 않음
      res.items = items; // 화면이 소지품을 새로 받아 오게 (얻은 것 확인)
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
    on('raidboss:ready', (d, p) => readyLobby(d, str(p.key)));
    on('raidboss:act', (d, p) => {
      const fg = inFight.get(d.id);
      if (!fg || fg.over) return { error: '레이드 중이 아니다.' };
      const me2 = fg.players.find((x) => x.id === d.id);
      if (!alive(me2)) return { error: me2.left ? '이미 물러났다.' : '쓰러져 있다. 동료가 일으켜 주기를 기다리자.' };
      if (me2.reaped) return { error: '거두어져 이번 턴은 움직일 수 없다.' };
      if (me2.away) return { error: '균열 끝에 매달려 있어 움직일 수 없다.' };
      if (me2.consumed) return { error: '잿빛에 먹혀 이번 턴은 몸이 말을 듣지 않는다.' };
      if (fg.pending[d.id]) return { error: '이미 골랐다. 동료를 기다리는 중이다.' };
      const type = str(p.type);
      if (!ACTS.includes(type)) return { error: '알 수 없는 행동이다.' };
      const a = type === 'skill' ? { type, id: str(p.id) } : { type };
      if (type === 'flank' && fg.B.script !== 'knights') return { error: '이 레이드에서는 우회할 대열이 없다.' };
      if (Number.isInteger(p.t) && fg.foes[p.t] && fg.foes[p.t].hp > 0) fg.targets[d.id] = p.t;
      const emberOk = p.ally === 'ember' && fg.ember?.hp > 0; // 균열: 불씨도 막아서기·치유 대상
      const ally = emberOk ? 'ember' : Number(p.ally) || null;
      if (type === 'cover') {
        if (!ally || !(emberOk || fg.players.some((x) => x.id === ally && x.id !== d.id && alive(x)))) return { error: '막아설 동료를 먼저 고르자.' };
        a.ally = ally;
      }
      if (type === 'skill' && a.id === 'mend' && ally && ally !== d.id) {
        if (!(emberOk || fg.players.some((x) => x.id === ally && !x.left))) return { error: '그 동료는 이미 물러났다.' };
        a.ally = ally;
      }
      const why2 = combat.blocked(me2, a);
      if (why2) return { error: why2 };
      fg.pending[d.id] = a;
      if (needs(fg).every((x) => fg.pending[x.id])) { setImmediate(() => resolve(fg)); return { ok: true, waiting: true }; }
      const chosen = Object.fromEntries(fg.players.map((x) => [x.id, !!fg.pending[x.id] || !alive(x) || !!x.reaped || !!x.away || !!x.consumed]));
      for (const x of fg.players) if (x.id !== d.id) emitTo(x.id, 'raidboss:wait', { chosen });
      return { ok: true, waiting: true, view: viewFor(fg, d.id) }; // 고른 행동(pick)이 화면에 보이게
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
    // 고른 행동의 동료 대상만 바꿈 (치유·막아서기). 다른 행동이면 아무 일도 없음
    on('raidboss:ally', (d, p) => {
      const fg = inFight.get(d.id);
      if (!fg || fg.over) return { error: '레이드 중이 아니다.' };
      const a = fg.pending[d.id];
      const uses = a && (a.type === 'cover' || (a.type === 'skill' && a.id === 'mend'));
      if (!uses) return { ok: true, view: viewFor(fg, d.id) };
      const emberOk = p.ally === 'ember' && fg.ember?.hp > 0;
      const ally = emberOk ? 'ember' : Number(p.ally) || null;
      if (a.type === 'cover') {
        if (!ally || !(emberOk || fg.players.some((x) => x.id === ally && x.id !== d.id && alive(x)))) return { error: '막아설 수 없는 동료다.' };
      } else if (ally && ally !== d.id && !(emberOk || fg.players.some((x) => x.id === ally && !x.left))) return { error: '그 동료는 이미 물러났다.' };
      a.ally = ally === d.id ? null : ally;
      return { ok: true, view: viewFor(fg, d.id) };
    });
    // 고른 행동 물리기 (턴이 넘어가기 전까지)
    on('raidboss:undo', (d) => {
      const fg = inFight.get(d.id);
      if (!fg || fg.over) return { error: '레이드 중이 아니다.' };
      if (!fg.pending[d.id]) return { ok: true, view: viewFor(fg, d.id) };
      delete fg.pending[d.id];
      const chosen = Object.fromEntries(fg.players.map((x) => [x.id, !!fg.pending[x.id] || !alive(x) || !!x.reaped || !!x.away || !!x.consumed]));
      for (const x of fg.players) if (x.id !== d.id) emitTo(x.id, 'raidboss:wait', { chosen });
      return { ok: true, view: viewFor(fg, d.id) };
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
