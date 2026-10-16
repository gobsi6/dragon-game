// 결투장과 직접 싸우는 전투 (강적, 실시간 결투), 전투 설정과 스킬 구성
// - 강적: 사냥하다 만남. 한 턴씩 직접 고르고, 사냥감은 바로 응수함
// - 실시간 결투: 둘 다 접속해 있을 때. 신청 → 수락 → 둘 다 고르면 한 턴. 시간을 넘기면 자동으로 고름
// - 자동 결투: 상대가 '자동 결투 허용'을 켜 두었으면, 접속하지 않았어도 서로의 스킬 구성대로 자동으로 싸움
// 결투에서는 다치지 않음 (가득 찬 상태로 싸우고, 끝나면 원래대로). 전적과 명성, 경험치만 남음
const { COMBAT, MIND, REGIONS } = require('./game-data');

const str = (v) => (typeof v === 'string' ? v.trim() : '');
function josa(word, a, b) {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return `${a}(${b})`;
  return c % 28 ? a : b;
}
const ACTS = ['attack', 'skill', 'guard', 'flee'];

module.exports = function setupArena({ io, db, online, logic, combat, life, sendMe, broadcastPresence }) {
  const sessions = new Map(); // 드래곤 id → 전투 { id, kind, b, side: {드래곤 id: 'a'|'b'}, ids: {a, b}, pending, timer, deadline }
  const invites = new Map();  // 신청 id → { id, from, to, timer }
  let nextId = 1;

  const live = (id) => online.get(id) || null;
  const emitTo = (id, ev, data) => { const e = live(id); if (e) e.socket.emit(ev, data); };
  const inBattle = (id) => sessions.has(id);
  // 접속 중이면 그 객체를, 아니면 저장된 것을 불러옴
  const load = (id) => { const e = live(id); return e ? e.dragon : db.getDragon(id); };

  function cleanup(s) {
    clearTimeout(s.timer);
    for (const id of Object.values(s.ids)) if (id && sessions.get(id) === s) sessions.delete(id);
  }

  // ── 강적 ─────────────────────────────────────────
  function startElite(d, b) {
    const s = { id: nextId++, kind: 'elite', b, ids: { a: d.id, b: null }, side: { [d.id]: 'a' } };
    sessions.set(d.id, s);
    return combat.view(b, 'a');
  }
  // ── 사냥 (직접 싸움, 무리일 수도 있음) ─────────────
  // c: 사냥감 이름과 사냥터 레벨, after(d, res): 끝난 뒤 서버가 할 일 (특성 횟수·이벤트·광폭화 검사)
  // reward(d, b, c): 결과를 정하는 함수 (없으면 사냥 결과. 보물 도둑 쫓기는 따로)
  function startHunt(d, b, c, after, reward) {
    const s = { id: nextId++, kind: 'hunt', b, c, after, reward, ids: { a: d.id, b: null }, side: { [d.id]: 'a' } };
    sessions.set(d.id, s);
    return combat.view(b, 'a');
  }
  function finishHunt(s) {
    cleanup(s);
    const e = live(s.ids.a);
    const d = load(s.ids.a);
    if (!d) return;
    logic.regen(d);
    const res = (s.reward || combat.huntReward)(d, s.b, s.c);
    // 지면(물러나지 않고) 쓰러짐
    const falls = res.fall && !!fallFn;
    if (falls) res.lines.push('눈앞이 캄캄해진다. 숨이 멎어 간다…');
    if (s.after) s.after(d, res, falls);
    db.saveState(d, res.items, res.hoardItems || []);
    if (e) {
      sendMe(e.socket, d);
      e.socket.emit('battle:end', { view: combat.view(s.b, 'a'), result: res });
    }
    if (falls) return fallFn(d, s.b.b.name);
    checkMind(d);
  }
  // 나머지를 자동으로: 사냥은 지금까지처럼 기력을 조금 남기고, 체력이 낮아지면 물러남
  function autoHunt(s) {
    const r = combat.runAuto(s.b, { reserve: Math.round(s.b.a.enMax * COMBAT.huntReserve), flee: COMBAT.fleeBelow });
    return r;
  }
  // ── 광폭화 ─────────────────────────────────────────
  // 정신이 0이 되면 광폭화. 정해진 시간 안에 다른 드래곤이 싸워 진정시키지 않으면 큰 피해
  const berserkSet = new Set(db.berserkIds()); // 광폭화한 드래곤 (서버를 다시 켜도 이어짐)
  const calming = new Map();                   // 광폭화한 드래곤 id → 진정시키는 중인 드래곤 id
  const shout = (text) => io.emit('system', { text, at: Date.now() }); // 모든 지역 이야기 창에
  const ga = (n) => `${n}${josa(n, '이', '가')}`;
  const eul = (n) => `${n}${josa(n, '을', '를')}`;
  function rampageInfo(id) {
    const d = load(id);
    const bz = d && logic.berserkOf(d);
    if (!bz) return null;
    return { id, name: d.name, kind: d.kind, region: bz.region, until: bz.until, hp: bz.hp, hpMax: bz.hpMax, calming: calming.has(id) };
  }
  const rampages = () => [...berserkSet].map(rampageInfo).filter(Boolean);
  function startBerserk(d) {
    if (logic.berserkOf(d) || (d.mind ?? 100) > 0) return false;
    const now = Date.now();
    const others = [...online.keys()].filter((id) => id !== d.id).length;
    const mins = MIND.berserkMinutes * (others ? 1 : 2); // 아무도 없으면 기다려 주는 시간을 늘림
    const hpMax = Math.round(logic.hpCap(d) * 1.2);
    d.berserk = { at: now, until: now + mins * 60000, region: d.region, hp: hpMax, hpMax };
    d.rest_at = null;
    logic.chron(d, 'mark', `${REGIONS[d.region].name}에서 정신을 잃고 광폭화했다.`);
    db.saveState(d);
    berserkSet.add(d.id);
    const where = REGIONS[d.region].name;
    shout(`[광폭화] ${where} 하늘이 붉게 물든다. ${ga(d.name)} 정신을 잃고 날뛰기 시작했다! ${mins}분 안에 누군가 ${where}에서 진정시켜야 한다.`);
    io.emit('rampage', rampageInfo(d.id));
    const e = live(d.id);
    if (e) {
      sendMe(e.socket, d);
      e.socket.emit('notice', { title: '광폭화', lines: [
        '머릿속의 목소리가 모든 것을 삼켰다. 몸이 제멋대로 날뛴다.',
        `${mins}분 안에 다른 드래곤이 ${where}에서 진정시켜 주지 않으면 크게 다치고, 가까운 마을이 피해를 입는다.`,
        '텔레파시로 동료에게 도움을 청하자.'] });
    }
    broadcastPresence(d.region);
    return true;
  }
  // how: 'timeout'(저지되지 않음) / 'calmed'(누군가 진정시킴)
  function endBerserk(d, how, calmer) {
    const bz = logic.berserkOf(d);
    if (!bz) return;
    const now = Date.now();
    const lines = [];
    if (how === 'timeout') {
      const kin = db.kinLoad(d.id);
      const perks = life.perksOf(kin);
      const guard = perks.knight || kin.some((k) => k.type === 'human' && k.status === 'home' && (k.data.bond || 0) >= 60);
      const f = guard ? MIND.kinGuard : 1;
      logic.regen(d, now);
      const hpLoss = Math.round(logic.hpCap(d) * MIND.timeoutHpLoss * f);
      d.hp = Math.max(1, d.hp - hpLoss);
      const town = logic.nearestTown(bz.region);
      const rep = Math.round(MIND.timeoutRep * f);
      logic.addRep(d, town, rep);
      const fl = logic.addFame(d, MIND.timeoutFame);
      d.mind = MIND.afterTimeout;
      const tn = REGIONS[town].name;
      lines.push(`광폭화가 잦아들었다. 정신을 차려 보니 온몸이 상처투성이다. (체력 −${hpLoss})`,
        `날뛰는 사이 ${tn} 근처 마을을 덮쳤다. (${tn} 평판 ${rep}, 용족 명성 ${MIND.timeoutFame})`);
      if (guard) lines.push('식구가 끝까지 곁을 지켜, 피해가 줄었다.');
      if (fl) lines.push(fl);
      shout(`[광폭화] ${d.name}의 광폭화가 잦아들었다. 그 사이 ${tn} 근처 마을이 큰 피해를 입었다.`);
    } else {
      d.mind = MIND.afterCalm;
      lines.push(`${ga(calmer.name)} 날뛰던 몸을 붙잡아 주었다. 정신이 돌아왔다. (정신 ${MIND.afterCalm})`);
      shout(`[광폭화] ${ga(calmer.name)} ${eul(d.name)} 진정시켰다!`);
    }
    d.berserk = null;
    d.mind_at = now;
    lines.push(...logic.traitCount(d, 'berserk'));
    db.saveState(d);
    berserkSet.delete(d.id);
    calming.delete(d.id);
    const e = live(d.id);
    if (e) { sendMe(e.socket, d); e.socket.emit('notice', { title: '광폭화', lines }); }
    else for (const l of lines) db.noteAdd(d.id, l);
    io.emit('rampage:end', { id: d.id });
    broadcastPresence(bz.region);
  }
  // 정신이 0이 됐는지 살펴 광폭화 시작 (행동 뒤에 부름)
  const checkMind = (d) => ((d.mind ?? 100) <= 0 ? startBerserk(d) : false);
  // 시간이 다 된 광폭화 (누군가 붙잡고 싸우는 중이면 그 싸움이 끝날 때까지 기다림)
  const ticker = setInterval(() => {
    const now = Date.now();
    for (const id of [...berserkSet]) {
      if (calming.has(id)) continue;
      const d = load(id);
      const bz = d && logic.berserkOf(d);
      if (!bz) { berserkSet.delete(id); continue; }
      if (now >= bz.until) endBerserk(d, 'timeout');
    }
  }, 10000);
  ticker.unref?.();

  function startCalm(d, id) {
    const t = id && id !== d.id ? load(id) : null;
    const bz = t && logic.berserkOf(t);
    if (!bz) return { error: '그 드래곤은 광폭화하지 않았다.' };
    if (logic.berserkOf(d)) return { error: '광폭화한 몸으로는 누구도 붙잡을 수 없다.' };
    const mine = myBlock(d);
    if (mine) return { error: mine };
    if (d.region !== bz.region) return { error: `${REGIONS[bz.region].name}에 가야 진정시킬 수 있다.` };
    if (d.hp < 15) return { error: '기운이 없어 맞설 수 없다. 조금 쉬어야 한다.' };
    if (calming.has(id)) return { error: '다른 드래곤이 이미 붙잡고 싸우는 중이다. 잠시 기다리자.' };
    logic.regen(d);
    const foe = combat.fromDragon(t, 'duel');
    foe.name = `광폭한 ${t.name}`;
    foe.hp = bz.hp; foe.hpMax = bz.hpMax;
    foe.atk *= MIND.berserkAtk;
    const b = combat.newBattle('calm', combat.fromDragon(d, 'hunt'), foe);
    b.a.turnCount = 0; b.b.turnCount = 0;
    const s = { id: nextId++, kind: 'calm', b, target: id, ids: { a: d.id, b: null }, side: { [d.id]: 'a' } };
    sessions.set(d.id, s);
    calming.set(id, d.id);
    io.emit('rampage', rampageInfo(id));
    return { ok: true, view: combat.view(b, 'a'), lines: [`${eul(foe.name)} 막아섰다! 쓰러뜨려야 정신이 돌아온다.`] };
  }
  function finishCalm(s) {
    cleanup(s);
    calming.delete(s.target);
    const d = load(s.ids.a);
    const t = load(s.target);
    const e = live(s.ids.a);
    const { b } = s;
    logic.regen(d);
    d.hp = Math.max(1, Math.round(b.a.hp));
    d.en = Math.max(0, Math.round(b.a.en));
    const bz = t && logic.berserkOf(t);
    const res = { title: '진정시키기', lines: [], items: [] };
    if (bz && b.winner === b.a) {
      res.lines.push(`${eul(t.name)} 쓰러뜨려 진정시켰다!`);
      logic.traitCount(d, 'calm');
      logic.chron(d, 'mark', `광폭화한 ${eul(t.name)} 쓰러뜨려 진정시켰다.`);
      const f = logic.addFame(d, MIND.calmFame);
      res.lines.push(`용족 명성 +${MIND.calmFame}`);
      if (f) res.lines.push(f);
      res.xp = logic.xpOf(d, MIND.calmXp);
      res.levelUp = logic.gainXp(d, res.xp);
      res.lines.push(`경험치 +${res.xp}`);
      db.saveState(d);
      endBerserk(t, 'calmed', d);
    } else {
      if (bz) { bz.hp = Math.max(1, Math.round(b.b.hp)); db.saveState(t); }
      const pct = bz ? Math.round((bz.hp / bz.hpMax) * 100) : 0;
      res.lines.push(b.fled === b.a ? '물러났다.' : `광폭한 ${t.name}에게 밀려났다.`, `광폭한 ${t.name}의 체력이 ${pct}% 남았다. 다른 드래곤이 이어서 맞설 수 있다.`);
      res.xp = logic.xpOf(d, 5);
      res.levelUp = logic.gainXp(d, res.xp);
      db.saveState(d);
      if (bz) shout(`[광폭화] ${ga(d.name)} ${eul(t.name)} 막아섰지만 밀려났다. (광폭한 ${t.name} 체력 ${pct}%)`);
      if (bz) io.emit('rampage', rampageInfo(s.target));
    }
    if (e) { sendMe(e.socket, d); e.socket.emit('battle:end', { view: combat.view(b, 'a'), result: res }); }
  }

  let fallFn = null; // 강적에게 져서 쓰러질 때 (death.js가 정함)
  const setFall = (fn) => { fallFn = fn; };

  function finishElite(s) {
    cleanup(s);
    const e = live(s.ids.a);
    const d = load(s.ids.a);
    if (!d) return;
    logic.regen(d);
    const res = combat.eliteReward(d, s.b);
    res.lines.push(...logic.traitCount(d, 'hunt'));
    if (res.wound) res.lines.push(...logic.traitCount(d, 'wound'));
    // 물러나지 않고 졌으면 쓰러짐 (체력 0). 접속이 끊겨 끝난 싸움은 물러난 것으로 침
    const falls = !res.win && s.b.fled !== s.b.a && !!fallFn;
    if (falls) res.lines.push('눈앞이 캄캄해진다. 숨이 멎어 간다…');
    db.saveState(d, res.items);
    if (e) {
      sendMe(e.socket, d);
      e.socket.emit('battle:end', { view: combat.view(s.b, 'a'), result: res });
    }
    if (falls) return fallFn(d, s.b.b.name);
    checkMind(d); // 오염된 강적에게 정신이 다 깎였으면 광폭화
  }

  // ── 결투 ─────────────────────────────────────────
  function duelSession(da, db2, kind) {
    const b = combat.newBattle('duel', combat.fromDragon(da, 'duel'), combat.fromDragon(db2, 'duel'));
    b.a.turnCount = 0; b.b.turnCount = 0;
    return { id: nextId++, kind, b, ids: { a: da.id, b: db2.id }, side: { [da.id]: 'a', [db2.id]: 'b' }, pending: { a: null, b: null } };
  }
  // 결투가 끝나면: 전적, 명성(같은 상대에게는 한동안 한 번만), 경험치. 다친 것은 없음
  // idA가 결투를 건 쪽. 결과는 결투 기록에 남겨서 나중에 누가 걸었고 어떻게 끝났는지 다시 볼 수 있게 함
  function settleDuel(b, idA, idB, mode = 'live') {
    const da = load(idA);
    const dbb = load(idB);
    const winA = b.winner === b.a;
    const [w, l] = winA ? [da, dbb] : [dbb, da];
    const now = Date.now();
    const cw = combat.combatOf(w);
    const cl = combat.combatOf(l);
    cw.w += 1; cl.l += 1;
    cw.lastWin ||= {};
    const lines = { [w.id]: [], [l.id]: [] };
    const fresh = now - (cw.lastWin[l.id] || 0) >= COMBAT.autoCooldown;
    if (fresh) {
      cw.lastWin[l.id] = now;
      let fame = COMBAT.fameWin;
      if (db.relGet(w.id, l.id) === 'rival') { fame += COMBAT.fameRival; lines[w.id].push('라이벌을 꺾었다! 명성이 더 오른다.'); }
      lines[w.id].push(`용족 명성 +${fame}`);
      lines[l.id].push(`용족 명성 ${COMBAT.fameLose}`);
      const f1 = logic.addFame(w, fame); if (f1) lines[w.id].push(f1);
      const f2 = logic.addFame(l, COMBAT.fameLose); if (f2) lines[l.id].push(f2);
      // 상대 레벨이 높을수록 더 많이 오름
      const xpWin = COMBAT.xpWin + l.level * (COMBAT.xpWinPerLv || 0);
      const xpLose = COMBAT.xpLose + w.level * (COMBAT.xpLosePerLv || 0);
      for (const [d, xp] of [[w, xpWin], [l, xpLose]]) {
        const x = logic.xpOf(d, xp);
        const up = logic.gainXp(d, x);
        lines[d.id].push(`경험치 +${x}${up ? ` · 레벨이 올랐다! Lv. ${d.level}` : ''}`);
      }
    } else {
      lines[w.id].push('같은 상대와 연달아 겨뤄 명성과 경험치는 오르지 않았다.');
    }
    db.duelAdd({
      mode, from: idA, to: idB, winner: w.id, turns: b.turn,
      data: { view: { a: combat.view(b, 'a'), b: combat.view(b, 'b') }, log: b.log.map((t) => ({ turn: t.turn, lines: t.lines })), lines },
      seen: mode !== 'auto',   // 자동 결투는 받은 쪽이 결투장에서 확인할 때까지 '새 기록'
    });
    for (const d of [w, l]) {
      logic.regen(d);
      db.saveState(d);
      const e = live(d.id);
      if (e) sendMe(e.socket, d);
    }
    return { winner: w, loser: l, lines };
  }
  function finishDuel(s) {
    cleanup(s);
    const st = settleDuel(s.b, s.ids.a, s.ids.b);
    for (const k of ['a', 'b']) {
      const id = s.ids[k];
      const won = st.winner.id === id;
      emitTo(id, 'battle:end', {
        view: combat.view(s.b, k),
        result: { title: '결투', lines: [won ? '결투에서 이겼다!' : '결투에서 졌다.', ...st.lines[id]] },
      });
    }
  }
  // 실시간 결투의 한 턴: 둘 다 골랐거나 시간이 다 됐을 때
  function resolveDuel(s) {
    clearTimeout(s.timer);
    const { b } = s;
    for (const k of ['a', 'b']) if (!s.pending[k]) s.pending[k] = combat.aiPick(b[k], b[k === 'a' ? 'b' : 'a']);
    const lines = combat.round(b, s.pending.a, s.pending.b);
    s.pending = { a: null, b: null };
    if (b.over) return finishDuel(s);
    armTimer(s);
    for (const k of ['a', 'b']) emitTo(s.ids[k], 'battle:update', { view: { ...combat.view(b, k), deadline: s.deadline }, lines });
  }
  function armTimer(s) {
    s.deadline = Date.now() + COMBAT.turnSeconds * 1000;
    s.timer = setTimeout(() => resolveDuel(s), COMBAT.turnSeconds * 1000 + 300);
    s.timer.unref?.();
  }

  // 결투장 목록에 보일 상대의 사정
  function duelState(me, o, oCombat) {
    const on = !!live(o.id);
    const busy = inBattle(o.id);
    const c = oCombat;
    const res = { live: null, auto: null };
    if (logic.berserkOf(o)) res.live = res.auto = '광폭화 중이다.';
    else if (!c.duelOn) res.live = res.auto = '결투를 받지 않는다.';
    else {
      if (!on) res.live = '접속해 있지 않다.';
      else if (busy) res.live = '지금 싸우는 중이다.';
      if (!c.autoDuel) res.auto = '자동 결투를 허용하지 않았다.';
      else {
        const left = (combat.combatOf(me).lastAuto[o.id] || 0) + COMBAT.autoCooldown - Date.now();
        if (left > 0) res.auto = `${Math.ceil(left / 60000)}분 뒤에 다시 걸 수 있다.`;
      }
    }
    return res;
  }
  const myBlock = (d) => {
    if (logic.berserkOf(d)) return '광폭화 중이다.';
    if (logic.isFallen(d)) return '쓰러져 있다.';
    if (inBattle(d.id)) return '이미 싸우는 중이다.';
    if (d.exp_end) return '원정을 떠나 있는 동안에는 결투할 수 없다.';
    return null;
  };

  function attach(socket) {
    const me = () => { const e = online.get(socket.data.dragonId); return e && e.socket === socket ? e.dragon : null; };
    const on = (ev, fn) => socket.on(ev, (p, ack) => {
      if (typeof ack !== 'function') ack = () => {};
      const d = me();
      if (!d) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
      try { ack(fn(d, p || {}) || { ok: true }); } catch (e) { console.error('[전투]', ev, e); ack({ error: '처리하다 문제가 생겼다.' }); }
    });

    // 설정과 스킬 구성
    on('settings:set', (d, p) => { const r = combat.setSettings(d, p); db.saveState(d); sendMe(socket, d); return r; });
    on('skills:set', (d, p) => { const r = combat.setSkills(d, p.list); if (r.error) return r; db.saveState(d); sendMe(socket, d); return r; });

    // 지금 싸우는 중인 전투 (창을 다시 열 때)
    on('battle:get', (d) => {
      const s = sessions.get(d.id);
      if (!s) return { ok: true, view: null };
      const k = s.side[d.id];
      return { ok: true, view: { ...combat.view(s.b, k), deadline: s.deadline, waiting: s.kind === 'duel' && !!s.pending?.[k] }, log: s.b.log.flatMap((t) => t.lines) };
    });

    on('battle:act', (d, p) => {
      const s = sessions.get(d.id);
      if (!s) return { error: '싸우는 중이 아니다.' };
      const type = str(p.type);
      if (!ACTS.includes(type)) return { error: '알 수 없는 행동이다.' };
      const act = type === 'skill' ? { type, id: str(p.id) } : { type };
      if (Number.isInteger(p.t)) act.t = p.t; // 무리와 싸울 때 노릴 적
      const k = s.side[d.id];
      const f = s.b[k];
      const why = combat.blocked(f, act);
      if (why) return { error: why };
      if (s.kind === 'elite' || s.kind === 'calm' || s.kind === 'hunt') {
        const lines = combat.round(s.b, act, combat.aiPick(s.b.b, s.b.a));
        if (s.b.over) { ({ calm: finishCalm, elite: finishElite, hunt: finishHunt })[s.kind](s); return { ok: true, lines, over: true }; }
        return { ok: true, lines, view: combat.view(s.b, 'a') };
      }
      // 결투: 상대도 고를 때까지 기다림
      if (s.pending[k]) return { error: '이미 골랐다. 상대를 기다리는 중이다.' };
      s.pending[k] = act;
      const other = s.ids[k === 'a' ? 'b' : 'a'];
      if (s.pending.a && s.pending.b) resolveDuel(s);
      else emitTo(other, 'battle:ready', { foe: true });
      return { ok: true, waiting: !s.b.over && !!(s.pending.a || s.pending.b) };
    });

    // 무리와 싸울 때 노릴 적 바꾸기 (턴은 지나가지 않음. 연계 표시가 그 적에 맞게 바뀜)
    on('battle:target', (d, p) => {
      const s = sessions.get(d.id);
      if (!s || s.side[d.id] !== 'a' || !s.b.foes || s.b.foes.length < 2) return { error: '노릴 적을 고를 수 없다.' };
      const t = Number(p.t);
      if (!Number.isInteger(t) || !s.b.foes[t] || s.b.foes[t].hp <= 0) return { error: '그 적은 이미 쓰러졌다.' };
      s.b.target = t;
      return { ok: true, view: combat.view(s.b, 'a') };
    });
    // 사냥: 나머지를 자동으로 싸움
    on('battle:auto', (d) => {
      const s = sessions.get(d.id);
      if (!s || s.kind !== 'hunt') return { error: '지금은 자동으로 싸울 수 없다.' };
      const from = s.b.log.length;
      autoHunt(s);
      const log = s.b.log.slice(from).map((t) => ({ turn: t.turn, lines: t.lines }));
      finishHunt(s);
      return { ok: true, log };
    });

    on('rampage:list', () => ({ ok: true, list: rampages() }));
    on('rampage:calm', (d, p) => startCalm(d, Number(p.id)));

    on('arena:list', (d) => {
      const c = combat.combatOf(d);
      const list = db.arenaList(d.id).map((r) => {
        const e = live(r.id);
        const o = e ? e.dragon : r;
        const oc = combat.combatOf(e ? e.dragon : { combat: r.combat });
        const why = duelState(d, o, oc);
        return {
          id: r.id, name: o.name, kind: o.kind, level: o.level, av: r.has_avatar ? r.avatar_ver : 0,
          online: !!e, lastSeen: e ? Date.now() : r.lastSeen, w: oc.w, l: oc.l,
          rel: db.relGet(d.id, r.id), live: why.live, auto: why.auto,
        };
      });
      return { ok: true, me: { w: c.w, l: c.l, duelOn: c.duelOn, autoDuel: c.autoDuel }, list };
    });

    on('arena:challenge', (d, p) => {
      const id = Number(p.id);
      const o = id && id !== d.id ? load(id) : null;
      if (!o) return { error: '그런 드래곤은 없다.' };
      const mine = myBlock(d);
      if (mine) return { error: mine };
      if (!combat.combatOf(d).duelOn) return { error: '결투 받기를 꺼 두었으면 신청도 할 수 없다. 설정에서 켜자.' };
      const why = duelState(d, o, combat.combatOf(o));
      if (str(p.mode) === 'auto') {
        if (why.auto) return { error: why.auto };
        combat.combatOf(d).lastAuto[o.id] = Date.now();
        logic.regen(o);
        const b = combat.runAuto(combat.newBattle('duel', combat.fromDragon(d, 'duel'), combat.fromDragon(o, 'duel')));
        const st = settleDuel(b, d.id, o.id, 'auto');
        const won = st.winner.id === d.id;
        // 상대에게 알림 (접속하지 않았으면 다음 접속 때)
        const tell = `${d.name}${josa(d.name, '이', '가')} 자동 결투를 걸어 왔다. ${won ? `${o.name}${josa(o.name, '이', '가')} 졌다.` : `${o.name}${josa(o.name, '이', '가')} 이겼다!`} (${b.turn}턴)`;
        const hint = '결투장의 결투 기록에서 다시 볼 수 있다.';
        const oe = live(o.id);
        if (oe) oe.socket.emit('notice', { title: '결투', lines: [tell, ...st.lines[o.id], hint] });
        else db.noteAdd(o.id, `${tell} ${hint}`);
        return {
          ok: true, auto: true, view: combat.view(b, 'a'), log: b.log.map((t) => ({ turn: t.turn, lines: t.lines })),
          result: { title: '자동 결투', lines: [won ? '결투에서 이겼다!' : '결투에서 졌다.', ...st.lines[d.id]] },
        };
      }
      if (why.live) return { error: why.live };
      for (const inv of invites.values()) {
        if (inv.from === d.id) return { error: '이미 결투를 신청해 두었다. 답을 기다리자.' };
        if (inv.to === o.id) return { error: `${o.name}${josa(o.name, '은', '는')} 다른 결투 신청을 받고 있다.` };
      }
      const inv = { id: nextId++, from: d.id, to: o.id };
      inv.timer = setTimeout(() => {
        if (!invites.delete(inv.id)) return;
        emitTo(d.id, 'arena:declined', { name: o.name, reason: '답이 없었다.' });
        emitTo(o.id, 'arena:invite-gone', { id: inv.id });
      }, COMBAT.inviteSeconds * 1000);
      inv.timer.unref?.();
      invites.set(inv.id, inv);
      emitTo(o.id, 'arena:invite', { id: inv.id, from: { id: d.id, name: d.name, kind: d.kind, level: d.level }, seconds: COMBAT.inviteSeconds });
      return { ok: true, sent: true };
    });

    // 결투 기록: 내가 건 것과 받은 것. 열어 보면 받은 자동 결투는 확인한 것으로
    on('arena:history', (d) => {
      const list = db.duelList(d.id).map((r) => ({
        id: r.id, at: r.at, mode: r.mode, turns: r.turns,
        mine: r.from_id === d.id,                // 내가 건 결투인지
        won: r.winner_id === d.id,
        fresh: r.to_id === d.id && !r.seen,      // 아직 확인하지 않은, 받은 자동 결투
        other: { id: r.oid, name: r.oname, kind: r.okind, av: r.ohas ? r.oav : 0 },
      }));
      if (list.some((x) => x.fresh)) { db.duelSeenAll(d.id); sendMe(socket, d); }
      return { ok: true, list };
    });
    // 결투 다시 보기: 내 쪽에서 본 모습으로
    on('arena:replay', (d, p) => {
      const r = db.duelGet(Number(p.id));
      if (!r || (r.from_id !== d.id && r.to_id !== d.id)) return { error: '그 결투 기록은 없다.' };
      const side = r.from_id === d.id ? 'a' : 'b';
      const other = db.getDragon(side === 'a' ? r.to_id : r.from_id);
      const won = r.winner_id === d.id;
      const how = r.mode === 'auto' ? (side === 'a' ? '자동 결투를 걸었다' : '자동 결투를 걸어 왔다') : '결투';
      return {
        ok: true,
        view: r.data.view?.[side],
        log: r.data.log || [],
        title: `${r.mode === 'auto' ? '자동 결투' : '결투'} · ${other?.name || ''}`,
        result: { title: '결투 기록', lines: [
          side === 'a' ? `${other?.name || '상대'}에게 ${how}.` : r.mode === 'auto' ? `${other?.name || '상대'}${josa(other?.name || '상대', '이', '가')} ${how}.` : `${other?.name || '상대'}${josa(other?.name || '상대', '과', '와')} 결투했다.`,
          won ? '결투에서 이겼다!' : '결투에서 졌다.',
          ...(r.data.lines?.[d.id] || []),
        ] },
      };
    });

    on('arena:answer', (d, p) => {
      const inv = invites.get(Number(p.id));
      if (!inv || inv.to !== d.id) return { error: '그 결투 신청은 이미 지나갔다.' };
      invites.delete(inv.id);
      clearTimeout(inv.timer);
      const from = live(inv.from);
      if (!p.accept) {
        emitTo(inv.from, 'arena:declined', { name: d.name, reason: '거절했다.' });
        return { ok: true };
      }
      if (!from) return { error: '상대가 떠나 버렸다.' };
      const why = myBlock(d) || myBlock(from.dragon);
      if (why) return { error: why };
      const s = duelSession(from.dragon, d, 'duel');
      sessions.set(s.ids.a, s);
      sessions.set(s.ids.b, s);
      armTimer(s);
      for (const k of ['a', 'b']) {
        emitTo(s.ids[k], 'battle:start', {
          view: { ...combat.view(s.b, k), deadline: s.deadline },
          lines: [`${from.dragon.name}${josa(from.dragon.name, '과', '와')} ${d.name}의 결투가 시작되었다!`],
        });
      }
      return { ok: true };
    });
  }

  // 접속이 끊기면: 강적은 물러난 것으로, 결투는 진 것으로
  function onLeave(id) {
    for (const [k, inv] of invites) if (inv.from === id || inv.to === id) { clearTimeout(inv.timer); invites.delete(k); }
    const s = sessions.get(id);
    if (!s) return;
    if (s.kind === 'hunt') { autoHunt(s); return finishHunt(s); } // 사냥은 나머지를 자동으로 끝냄
    const k = s.side[id];
    s.b.over = true;
    s.b.fled = s.b[k];
    s.b.winner = s.b[k === 'a' ? 'b' : 'a'];
    if (s.kind === 'elite') return finishElite(s); // 물러난 것으로
    if (s.kind === 'calm') return finishCalm(s);
    s.b.log.push({ turn: s.b.turn, lines: [`${s.b[k].name}${josa(s.b[k].name, '이', '가')} 자리를 떠나 결투가 끝났다.`] });
    finishDuel(s);
  }

  return { attach, startElite, startHunt, inBattle, onLeave, checkMind, rampages, endBerserk, startBerserk, setFall };
};
