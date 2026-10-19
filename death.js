// 쓰러짐과 죽음
// - 직접 싸우는 강적 전투에서 지면 체력 0으로 쓰러진다 (fall). 선택하기 전까지는 아무것도 할 수 없다.
// - 상흔을 입고 일어선다: 상흔이 없는 능력치 하나가 영구히 −1. 다섯 능력치에 모두 상흔이 생기면 더는 일어설 수 없다.
// - 도움을 기다린다: 쓰러질 때마다 한 번, 3시간 동안 다른 드래곤이 와서 일으켜 주기를 기다린다.
//   누군가 같은 지역에 와서 일으켜 주면 상흔 없이 일어선다. 시간이 지나면 다시 둘 중 하나를 골라야 한다.
// - 긴 잠에 든다: 드래곤은 '잠든 드래곤'으로 기록에 남고, 계정은 새 드래곤을 만들 수 있다.
//   독립한 새끼들이 추모하러 오고, 둥지에 남은 식구와 재산은 정해진 날 동안 다른 드래곤이 거둘 수 있다.
//   그동안 아무도 거두지 않은 식구는 실종되고, 재산은 흩어진다.
const { DEATH, STATS, REGIONS, ITEMS, KINDS, DAY, KIN, SKILLS } = require('./game-data');

const str = (v) => (typeof v === 'string' ? v.trim() : '');
function josa(word, a, b) {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return `${a}(${b})`;
  return c % 28 ? a : b;
}
const ga = (n) => `${n}${josa(n, '이', '가')}`;
const eul = (n) => `${n}${josa(n, '을', '를')}`;
const parse = (v, def) => { if (v && typeof v === 'object') return v; try { return v ? JSON.parse(v) : def; } catch { return def; } };

module.exports = function setupDeath({ io, db, online, logic, life, sendMe, broadcastPresence }) {
  const shout = (text) => { // 모든 지역 이야기 창에 알리고, 대륙 소식으로 기록에도 남김 (늦게 들어와도 볼 수 있게)
    const at = Date.now();
    let id = 0;
    try { id = db.addChat('!', { dragonId: 0, name: '', kind: '', text, at }); } catch (e) { console.error('[대륙 소식]', e); }
    io.emit('system', { text, at, news: true, id });
  };
  const live = (id) => online.get(id) || null;
  const load = (id) => { const e = live(id); return e ? e.dragon : db.getDragon(id); };

  const fallenOf = (d) => (d.dead_at ? null : (d.fallen = parse(d.fallen, null)));
  const scarsOf = (d) => (d.scars = parse(d.scars, []));
  const canRevive = (d) => scarsOf(d).length < STATS.length;

  // 강적에게 져서 쓰러짐
  function fall(d, by = null) {
    if (fallenOf(d)) return;
    d.hp = 0;
    d.hp_at = Date.now();
    d.rest_at = null;
    d.fallen = { at: Date.now(), region: d.region };
    logic.chron(d, 'mark', `${REGIONS[d.region].name}에서 ${by ? `${by}에게 ` : ''}쓰러졌다.`);
    db.saveState(d);
    const e = live(d.id);
    if (e) { sendMe(e.socket, d); e.socket.emit('fallen', view(d)); }
  }
  function view(d) {
    const f = fallenOf(d) || {};
    return {
      scars: scarsOf(d), canRevive: canRevive(d), kin: (d.kinSummary?.home || []).length,
      waiting: waitingOf(d) ? f.wait.until : null, // 도움을 기다리는 중이면 끝나는 시각
      waited: !!f.waited,                         // 이번에 쓰러져서 이미 기다려 봤는지
      helpLeft: helpLeft(d), helpMax: DEATH.helpPerDay, // 오늘 남의 도움으로 더 일어설 수 있는 횟수
    };
  }

  // ── 도움으로 일어선 횟수 (하루 DEATH.helpPerDay번) ───
  // world 표의 'rescued'에 { day, n: { 드래곤 id: 횟수 } }로 보관, 날이 바뀌면 비움
  function rescuedBook() {
    const day = logic.dayIdx();
    const b = db.worldGet('rescued', null);
    return b && b.day === day ? b : { day, n: {} };
  }
  const helpLeft = (d) => Math.max(0, DEATH.helpPerDay - (rescuedBook().n[d.id] || 0));

  // ── 도움을 기다림 ──────────────────────────────────
  const waitingOf = (d) => { const f = fallenOf(d); return f && f.wait && f.wait.until > Date.now() ? f.wait : null; };
  function rescueInfo(d) {
    const w = waitingOf(d);
    return w ? { id: d.id, name: d.name, kind: d.kind, level: d.level, region: d.fallen.region || d.region, until: w.until } : null;
  }
  const rescues = () => db.waitIds().map((id) => rescueInfo(load(id))).filter(Boolean);
  // ── 다시 일어선 드래곤: 도움을 청했던 드래곤이 일어서면 3시간 동안 모두의 대륙 탭에 남겨 둠 ──
  const RISEN_MS = 3 * 3600 * 1000;
  const risenList = () => (db.worldGet('risen', []) || []).filter((x) => Date.now() - x.at < RISEN_MS);
  const pushRisen = () => io.emit('rescue:risen', risenList());
  function markRisen(d, how, by = null, byId = null) {
    const where = REGIONS[(d.fallen && d.fallen.region) || d.region]?.name || '';
    const list = [{ id: d.id, name: d.name, kind: d.kind, at: Date.now(), how, by, where }, ...risenList().filter((x) => x.id !== d.id)].slice(0, 12);
    db.worldSet('risen', list);
    pushRisen();
    // 동료에게는 둥지 소식 카드로 (채팅이 밀려도 남음)
    const text = how === 'rescued' ? `동료 ${ga(d.name)} ${where}에서 ${by}의 도움으로 다시 일어섰다.` : `동료 ${ga(d.name)} ${where}에서 상흔을 입고 스스로 다시 일어섰다.`;
    for (const r of db.relList(d.id)) {
      if (r.kind !== 'friend' || r.id === byId) continue; // 일으켜 준 드래곤은 이미 앎
      const e = live(r.id);
      if (e) e.socket.emit('notice', { title: '동료 소식', lines: [text] });
      else db.noteAdd(r.id, text);
    }
  }
  const pushRescues = () => io.emit('rescue:list', rescues());
  function wait(d) {
    const f = fallenOf(d);
    if (!f) return { error: '쓰러져 있지 않다.' };
    if (waitingOf(d)) return { error: '이미 도움을 기다리고 있다.' };
    if (f.waited) return { error: '이번에는 이미 기다려 보았다. 이제 스스로 정해야 한다.' };
    if (!helpLeft(d)) return { error: `오늘은 이미 ${DEATH.helpPerDay}번 도움을 받아 일어섰다. 이번에는 스스로 정해야 한다.` };
    const until = Date.now() + DEATH.waitMs;
    d.fallen = { ...f, region: f.region || d.region, wait: { until }, waited: true };
    logic.chron(d, 'choice', '쓰러진 채 다른 드래곤의 도움을 기다리기로 했다.');
    db.saveState(d);
    const where = REGIONS[d.fallen.region].name;
    const h = Math.round(DEATH.waitMs / 3600000);
    shout(`[구조 요청] ${ga(d.name)} ${where}에서 쓰러져 도움을 기다린다. ${h}시간 안에 누군가 ${where}에 가서 일으켜 줄 수 있다.`);
    for (const r of db.relList(d.id)) {
      if (r.kind !== 'friend') continue;
      const text = `동료 ${ga(d.name)} ${where}에서 쓰러져 도움을 기다린다. ${h}시간 안에 가서 일으켜 줄 수 있다.`;
      const e = live(r.id);
      if (e) e.socket.emit('notice', { title: '구조 요청', lines: [text] });
      else db.noteAdd(r.id, text);
    }
    pushRescues();
    return { ok: true, until, lines: [`${where}에 몸을 누이고 도움을 기다린다. ${h}시간 안에 누군가 와 주지 않으면, 그때는 스스로 정해야 한다.`] };
  }
  // 다른 드래곤을 일으켜 세움 (helper: 돕는 드래곤, id: 쓰러진 드래곤)
  function help(helper, id) {
    if (helper.id === id) return { error: '스스로를 일으킬 수는 없다.' };
    const t = load(id);
    if (!t || t.dead_at || !waitingOf(t)) return { error: '그 드래곤은 이제 도움을 기다리고 있지 않다.' };
    const where = t.fallen.region || t.region;
    if (helper.region !== where) return { error: `${REGIONS[where].name}에 가야 일으켜 줄 수 있다.` };
    if (fallenOf(helper) || logic.berserkOf(helper)) return { error: '지금은 할 수 없다.' };
    if (helper.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
    if (!helpLeft(t)) return { error: `${ga(t.name)} 오늘은 이미 ${DEATH.helpPerDay}번 도움을 받아 일어섰다.` };
    if (helper.ap < DEATH.helpAp) return { error: `행동력이 모자란다. (${DEATH.helpAp} 필요)` };
    if (helper.en < DEATH.helpEn) return { error: `기력이 모자란다. (${DEATH.helpEn} 필요)` };
    logic.spendAp(helper, DEATH.helpAp);
    if (helper.en >= logic.enCap(helper)) helper.en_at = Date.now();
    helper.en -= DEATH.helpEn;
    // 치유를 배운 드래곤이 도우면 더 많이 회복
    const healer = SKILLS.mend && helper.level >= SKILLS.mend.lv;
    const hpPct = Math.min(1, (healer ? DEATH.healHp : DEATH.helpHp) + (logic.titleMods(helper).helpHp || 0)); // 칭호: 손을 내미는 자
    t.fallen = null;
    t.hp = Math.max(1, Math.round(logic.hpCap(t) * hpPct));
    const book = rescuedBook(); // 오늘 도움으로 일어선 횟수 +1
    book.n[t.id] = (book.n[t.id] || 0) + 1;
    db.worldSet('rescued', book);
    logic.chron(t, 'mark', `${ga(helper.name)} 찾아와 일으켜 주었다. 상흔 없이 다시 일어섰다.`);
    logic.chron(helper, 'mark', `쓰러진 ${eul(t.name)} 일으켜 세웠다.`);
    t.hp_at = Date.now();
    db.saveState(t);
    logic.traitCount(helper, 'rescue');
    const fame = logic.addFame(helper, DEATH.helpFame);
    const xp = logic.xpOf(helper, DEATH.helpXp);
    const levelUp = logic.gainXp(helper, xp);
    db.saveState(helper);
    shout(`[구조] ${ga(helper.name)} 쓰러진 ${eul(t.name)} 일으켜 세웠다.`);
    markRisen({ ...t, fallen: { region: where } }, 'rescued', helper.name, helper.id);
    const tl = `${ga(helper.name)} 찾아와 ${healer ? '치유 마법으로 상처를 아물게 하며 ' : ''}일으켜 주었다. 상흔 없이 다시 일어섰다. (체력 ${Math.round(hpPct * 100)}%)`;
    const e = live(t.id);
    if (e) { sendMe(e.socket, t); e.socket.emit('rescued', { by: helper.name, lines: [tl] }); broadcastPresence(t.region); }
    else db.noteAdd(t.id, tl);
    pushRescues();
    const lines = [`쓰러진 ${t.name}에게 다가가 ${healer ? '치유의 힘으로 상처를 덮고 ' : ''}일으켜 세웠다.`];
    if (fame) lines.push(fame);
    return { title: '구조', lines, xp, levelUp, items: [], gold: 0 };
  }

  // 상흔을 입고 일어섬
  function revive(d) {
    if (!fallenOf(d)) return { error: '쓰러져 있지 않다.' };
    if (!canRevive(d)) return { error: '온몸에 상흔이 가득해 더는 일어설 수 없다.' };
    const scars = scarsOf(d);
    const free = STATS.filter((s) => !scars.includes(s.key));
    const st = free[Math.floor(Math.random() * free.length)];
    d[st.key] = Math.max(1, d[st.key] - 1);
    if (st.key === 'scale') d.hp_max -= 5;     // 비늘 1 = 최대 체력 5
    if (st.key === 'wisdom') d.en_max -= 2;    // 지혜 1 = 최대 기력 2
    scars.push(st.key);
    logic.chron(d, 'choice', `쓰러졌다가 상흔을 입고 일어섰다. (${st.name} 영구 −1)`);
    const wasWaiting = !!waitingOf(d);
    const askedHelp = wasWaiting || !!fallenOf(d)?.waited; // 도움을 청한 적이 있으면 모두에게 알림
    if (askedHelp) {
      markRisen(d, 'scar');
      shout(`[일어섬] ${ga(d.name)} 상흔을 입고 스스로 다시 일어섰다.`);
    }
    d.fallen = null;
    if (wasWaiting) setImmediate(pushRescues);
    d.hp = Math.max(1, Math.round(logic.hpCap(d) * DEATH.reviveHp));
    d.hp_at = Date.now();
    d.en = Math.min(d.en, logic.enCap(d));
    const left = STATS.length - scars.length;
    return { title: '상흔', lines: [
      `떨리는 다리로 다시 일어섰다. ${st.name}에 깊은 상흔이 남았다. (${st.name} 영구 −1)`,
      left ? `상흔이 없는 능력치가 ${left}개 남았다.` : '이제 온몸에 상흔이 가득하다. 다시 쓰러지면 일어설 수 없다.',
    ] };
  }

  // 긴 잠에 듦
  function die(d) {
    if (!fallenOf(d)) return { error: '쓰러져 있지 않다.' };
    const now = Date.now();
    if (waitingOf(d)) setImmediate(pushRescues);
    const graveRegion = d.nest || d.region;
    const kin = db.kinLoad(d.id);
    const home = kin.filter((k) => k.status === 'home' || k.status === 'egg');
    const grown = kin.filter((k) => k.type === 'drake' && k.status === 'independent');
    life.views(kin, now, d); // 남길 식구 모습을 미리 만들어 봄 (문제가 있으면 여기서 멈추고 아무것도 바꾸지 않음)
    // 금화는 남긴 재산으로
    d.hoard_gold = (d.hoard_gold || 0) + d.gold;
    d.gold = 0;
    d.rest_at = null; d.exp_end = null; d.exp_start = null; d.exp_region = null;
    d.berserk = null; d.pending_event = null;
    d.fallen = { region: graveRegion, until: now + DEATH.graveDays * DAY, at: now };
    db.saveState(d);
    db.bury(d);
    d.dead_at = now;
    const where = REGIONS[graveRegion].name;
    const lines = [`${ga(d.name)} 긴 잠에 들었다.`];
    const kn = KINDS[d.kind].name;
    shout(`[부고] ${ga(d.name)} 긴 잠에 들었다. 레벨 ${d.level}의 ${kn}${josa(kn, '이었다', '였다')}.`);
    // 독립한 새끼들이 추모하러 옴
    for (const k of grown) {
      const t = `[부고] 독립한 ${ga(k.name)} 먼 하늘에서 날아와, ${d.name}의 곁에서 오래도록 울었다.`;
      shout(t);
      lines.push(t.replace('[부고] ', ''));
    }
    const hasHoard = (d.hoard_gold || 0) > 0 || db.hoard(d.id).length > 0;
    if (home.length || hasHoard) {
      shout(`[부고] ${where}에 ${d.name}의 둥지가 남았다.${home.length ? ` 남은 식구들이 기다린다. (${home.length})` : ''} ${DEATH.graveDays}일 안에 누군가 거두지 않으면 ${home.length ? '실종되고' : ''} 남은 것들은 흩어진다.`);
      io.emit('grave', graveInfo(d.id));
    }
    // 동료들에게 (접속하지 않았으면 다음 접속 때)
    for (const r of db.relList(d.id)) {
      if (r.kind !== 'friend') continue;
      const text = `동료 ${ga(d.name)} 긴 잠에 들었다.${home.length || hasHoard ? ` ${where}에 남긴 둥지를 ${DEATH.graveDays}일 안에 거둘 수 있다.` : ''}`;
      const e = live(r.id);
      if (e) e.socket.emit('notice', { title: '부고', lines: [text] });
      else db.noteAdd(r.id, text);
    }
    return { ok: true, died: { name: d.name, level: d.level, kind: d.kind, lines, mourners: grown.map((k) => k.name), lineage: grown.length } };
  }

  // ── 남긴 둥지 ──────────────────────────────────────
  function graveInfo(id) {
    const d = db.getDragon(id);
    if (!d || !d.dead_at) return null;
    const g = parse(d.fallen, null);
    if (!g || g.closed) return null;
    const kin = db.kinLoad(id).filter((k) => k.status === 'home' || k.status === 'egg');
    return {
      id, name: d.name, kind: d.kind, level: d.level, region: g.region, until: g.until,
      gold: d.hoard_gold || 0, items: db.hoard(id).filter((x) => x.qty > 0),
      kin: life.views(kin, Date.now(), d).home.map((k) => ({ id: k.id, name: k.name, type: k.type, stage: k.stage, egg: k.status === 'egg', kind: k.kind || null })),
    };
  }
  const graves = () => db.graveIds().map(graveInfo).filter(Boolean);
  // 정해진 날이 지나면: 식구는 실종, 재산은 흩어짐
  function closeGrave(id) {
    const d = db.getDragon(id);
    const g = d && parse(d.fallen, null);
    if (!g || g.closed) return;
    const kin = db.kinLoad(id);
    let lost = 0;
    for (const k of kin) if (k.status === 'home' || k.status === 'egg') { k.status = 'lost'; k.data.ended = Date.now(); lost++; }
    db.kinSaveAll(id, kin);
    db.hoardClear(id);
    d.hoard_gold = 0;
    d.fallen = { ...g, closed: true };
    db.saveState(d);
    if (lost) shout(`[부고] 아무도 찾아오지 않은 ${d.name}의 둥지에서, 남아 있던 식구들이 어디론가 사라졌다. (${lost})`);
    io.emit('grave:end', { id });
  }
  const ticker = setInterval(() => {
    const now = Date.now();
    // 기다림이 끝난 드래곤: 접속해 있으면 다시 고르게 함
    let changed = false;
    for (const id of db.waitIds()) {
      const d = load(id);
      const f = d && fallenOf(d);
      if (!f || !f.wait || f.wait.until > now) continue;
      d.fallen = { ...f, wait: null };
      logic.chron(d, 'mark', '아무도 오지 않았다.');
      db.saveState(d);
      changed = true;
      const e = live(id);
      if (e) { sendMe(e.socket, d); e.socket.emit('fallen', view(d)); e.socket.emit('notice', { title: '기다림의 끝', lines: ['아무도 오지 않았다. 이제 스스로 정해야 한다.'] }); }
    }
    if (changed) pushRescues();
    for (const id of db.graveIds()) {
      const g = parse(db.getDragon(id)?.fallen, null);
      if (g && !g.closed && now >= g.until) closeGrave(id);
    }
  }, 60000);
  ticker.unref?.();

  function attach(socket) {
    const me = () => { const e = online.get(socket.data.dragonId); return e && e.socket === socket ? e.dragon : null; };
    const on = (ev, fn) => socket.on(ev, (p, ack) => {
      if (typeof ack !== 'function') ack = () => {};
      const d = me();
      if (!d) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
      try { ack(fn(d, p || {}) || { ok: true }); } catch (e) { console.error('[죽음]', ev, e); ack({ error: '처리하다 문제가 생겼다.' }); }
    });

    on('fallen:revive', (d) => {
      const r = revive(d);
      if (r.error) return r;
      db.saveState(d);
      sendMe(socket, d);
      broadcastPresence(d.region);
      return { ok: true, result: r };
    });
    on('fallen:die', (d) => {
      const r = die(d);
      if (r.error) return r;
      // 이 접속에서 드래곤을 떼어 냄. 화면은 추모 창을 보여 준 뒤 새로 접속해 드래곤을 만듦
      online.delete(d.id);
      socket.leave(d.region);
      socket.data.dragonId = null;
      broadcastPresence(d.region);
      return r;
    });

    on('fallen:wait', (d) => {
      const r = wait(d);
      if (r.error) return r;
      sendMe(socket, d);
      return r;
    });
    socket.on('fallen:help', (p, ack) => {
      if (typeof ack !== 'function') ack = () => {};
      const d = me();
      if (!d) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
      try {
        logic.regen(d);
        const r = help(d, Number(p?.id));
        if (r.error) return ack(r);
        sendMe(socket, d);
        ack({ ok: true, result: r });
      } catch (e) { console.error('[죽음] fallen:help', e); ack({ error: '처리하다 문제가 생겼다.' }); }
    });
    on('rescue:list', () => ({ ok: true, list: rescues() }));
    on('grave:list', () => ({ ok: true, list: graves() }));
    on('grave:get', (d, p) => {
      const g = graveInfo(Number(p.id));
      return g ? { ok: true, grave: g } : { error: '그 둥지에는 이제 아무것도 남지 않았다.' };
    });
    // 남긴 것 가져가기: what = 'gold' 또는 물건 id (그 물건을 모두)
    on('grave:take', (d, p) => {
      const id = Number(p.id);
      const g = graveInfo(id);
      if (!g) return { error: '그 둥지에는 이제 아무것도 남지 않았다.' };
      if (d.region !== g.region) return { error: `${REGIONS[g.region].name}에 가야 가져올 수 있다.` };
      if (logic.berserkOf(d) || fallenOf(d)) return { error: '지금은 할 수 없다.' };
      const what = str(p.what);
      let line;
      if (what === 'gold') {
        if (!g.gold) return { error: '남은 금화가 없다.' };
        const o = db.getDragon(id);
        o.hoard_gold = 0;
        db.saveState(o);
        d.gold += g.gold;
        db.saveState(d);
        line = `${g.name}의 둥지에서 금화 ${g.gold}닢을 거두었다.`;
      } else {
        const it = g.items.find((x) => x.item === what);
        if (!it) return { error: '그 물건은 남아 있지 않다.' };
        if (!db.hoardTake(id, what, it.qty)) return { error: '이미 누군가 가져갔다.' };
        db.saveState(d, [{ id: what, qty: it.qty }]);
        line = `${ITEMS[what].name} ${it.qty}개를 거두었다.`;
      }
      sendMe(socket, d);
      io.emit('grave', graveInfo(id));
      return { ok: true, line, grave: graveInfo(id) };
    });
    // 남은 식구 거두기: 둥지가 있고 자리가 있어야 함
    on('grave:adopt', (d, p) => {
      const id = Number(p.id);
      const g = graveInfo(id);
      if (!g) return { error: '그 둥지에는 이제 아무것도 남지 않았다.' };
      if (d.region !== g.region) return { error: `${REGIONS[g.region].name}에 가야 거둘 수 있다.` };
      if (!d.nest) return { error: '거두려면 내 둥지가 있어야 한다.' };
      if (logic.berserkOf(d) || fallenOf(d)) return { error: '지금은 할 수 없다.' };
      const mine = db.kinLoad(d.id);
      if (life.homeKin(mine, logic.maxKinOf(d)).full) return { error: `내 둥지에는 이미 식구가 가득하다. (최대 ${logic.maxKinOf(d)})` };
      const k = g.kin.find((x) => x.id === Number(p.kin));
      if (!k) return { error: '그 식구는 이미 떠났다.' };
      if (!db.kinMove(k.id, id, d.id)) return { error: '이미 누군가 거두었다.' };
      const kinNow = db.kinLoad(d.id);
      const moved = kinNow.find((x) => x.id === k.id);
      if (moved && moved.type === 'human') { moved.data.lastCare = Date.now() - KIN.human.careCooldown; db.kinSaveAll(d.id, kinNow); }
      d.perks = life.perksOf(kinNow);
      d.kinSummary = life.summary(kinNow, Date.now());
      const line = k.egg ? `${d.name}의 둥지에 남은 알을 품에 안았다. 이제 내 둥지의 식구다.` : `${eul(k.name)} 거두었다. 낯선 냄새에 잠시 떨더니, 곧 곁에 몸을 붙인다.`;
      shout(`[부고] ${ga(d.name)} ${g.name}의 둥지에 남은 ${k.egg ? '알' : k.name}${josa(k.egg ? '알' : k.name, '을', '를')} 거두었다.`);
      sendMe(socket, d);
      io.emit('grave', graveInfo(id));
      return { ok: true, line, grave: graveInfo(id) };
    });
  }

  // 쓰러진 동안·죽은 뒤에는 아무것도 할 수 없음
  const blocked = (d) => (fallenOf(d) ? (waitingOf(d) ? '쓰러져 도움을 기다리는 중이다.' : '쓰러져 있다. 일어설지, 긴 잠에 들지 먼저 정해야 한다.') : null);

  return { attach, fall, blocked, fallenOf, scarsOf, canRevive, graves, view, closeGrave, rescues, risenList, wait, help, waitingOf };
};
