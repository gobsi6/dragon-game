// 동료: 프로필 보기, 관계(동료·라이벌·경계), 선물, 교환
//
// 관계
//   동료   요청을 보내고 상대가 수락해야 맺어짐. 양쪽에 함께 기록됨
//   라이벌·경계  혼자 붙이는 표시. 상대는 모름
// 선물   내 소지품이나 금화를 그냥 줌. 동료면 어디서든(상대가 접속하지 않아도), 아니면 같은 지역에 함께 있을 때만
// 교환   둘이 교환 창에 물건·금화를 올려놓고 둘 다 확정하면 맞바꿈. 둘 다 접속해 있어야 하고,
//        동료면 어디서든, 아니면 같은 지역에 있을 때만
// 텔레파시  드래곤끼리 마음으로 주고받는 쪽지. 대륙 어디서든 닿고, 상대가 잠들어(접속하지 않아) 있으면
//        마음에 남아 있다가 깨어날 때 들림. 상대가 나를 '경계'로 표시했으면 닿지 않음

const { ITEMS, KINDS, REGIONS, STANCES, fameTier } = require('./game-data');

const TRADE_MAX_ITEMS = 6;            // 한쪽이 올려놓을 수 있는 물건 종류
const TP_MAX = 200;                   // 텔레파시 한 번의 글자 수
const TP_COOLDOWN = 1500;             // 텔레파시 간격
const INVITE_TTL = 60 * 1000;         // 교환 요청이 유효한 시간

const str = (v) => (typeof v === 'string' ? v.trim() : '');
function josa(word, a, b) {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return `${a}(${b})`;
  return c % 28 ? a : b;
}
const ga = (n) => `${n}${josa(n, '이', '가')}`;
const itemText = (items) => items.map(({ id, qty }) => `${ITEMS[id].name}${qty > 1 ? ` ${qty}개` : ''}`).join(', ');
const giveText = (gold, items) => [gold ? `금화 ${gold}닢` : '', itemText(items)].filter(Boolean).join(', ');

module.exports = function setupSocial({ db, online, entryOf, sendMe, logic, life }) {
  const trades = new Map();   // 교환 창: id → { id, a, b, side: { [드래곤 id]: { gold, items, ready } } }
  const invites = new Map();  // 교환 요청: id → { from, to, at }
  let nextId = 1;

  const live = (id) => online.get(id) || null;
  const isFriend = (a, b) => db.relGet(a, b) === 'friend';
  const sameRegion = (a, b) => {
    const x = live(a), y = live(b);
    return !!x && !!y && x.dragon.region === y.dragon.region;
  };
  const tell = (id, event, data) => { const e = live(id); if (e) e.socket.emit(event, data); };
  const relChanged = (id) => tell(id, 'rel:changed', {});

  // 교환·선물이 가능한지. 안 되면 이유를 돌려줌
  function reach(me, them, { needOnline }) {
    if (me.id === them) return '자기 자신과는 할 수 없다.';
    if (me.exp_end) return '원정을 떠나 있는 동안에는 할 수 없다.';
    const t = live(them);
    if (t && t.dragon.exp_end) return '상대가 원정을 떠나 있다.';
    if (isFriend(me.id, them)) {
      if (needOnline && !t) return '상대가 접속해 있지 않다.';
      return null;
    }
    if (!t) return '동료가 아니면 같은 지역에 함께 있을 때만 할 수 있다.';
    if (!sameRegion(me.id, them)) return '동료가 아니면 같은 지역에 함께 있을 때만 할 수 있다.';
    return null;
  }

  // 올려놓은 물건과 금화가 실제로 있는지
  function checkOffer(d, gold, items) {
    if (!Number.isInteger(gold) || gold < 0) return '금화를 다시 정해야 한다.';
    if (gold > d.gold) return '그만한 금화가 없다.';
    if (!Array.isArray(items) || items.length > TRADE_MAX_ITEMS) return `물건은 ${TRADE_MAX_ITEMS}가지까지 올려놓을 수 있다.`;
    const seen = new Set();
    for (const it of items) {
      if (!ITEMS[it.id] || seen.has(it.id)) return '알 수 없는 물건이다.';
      seen.add(it.id);
      if (!Number.isInteger(it.qty) || it.qty < 1) return '개수를 다시 정해야 한다.';
      if (db.itemCount(d.id, it.id) < it.qty) return `${ITEMS[it.id].name}${josa(ITEMS[it.id].name, '이', '가')} 그만큼 없다.`;
    }
    return null;
  }
  const cleanItems = (raw) => (Array.isArray(raw) ? raw : [])
    .map((x) => ({ id: str(x?.id), qty: Math.floor(Number(x?.qty)) }))
    .filter((x) => x.id && x.qty > 0);

  // ── 프로필 ────────────────────────────────────────
  function profile(viewer, id) {
    const e = live(id);
    const d = e ? e.dragon : db.getDragon(id);
    if (!d) return null;
    const self = viewer.id === d.id;
    const friend = !self && isFriend(viewer.id, d.id);
    const kin = e ? d.kinSummary : life.summary(db.kinLoad(d.id), Date.now());
    const equip = logic.equipOf(d);
    const ft = fameTier(d.fame || 0);
    const near = !!e && e.dragon.region === viewer.region;
    return {
      id: d.id, name: d.name, kind: d.kind, kindName: KINDS[d.kind]?.name || '', level: d.level,
      av: d.has_avatar ? d.avatar_ver : 0,
      stance: d.stance, stanceName: STANCES[d.stance] || '',
      fame: ft.name,
      lineage: kin?.lineage || 0,
      kin: (kin?.home || []).map((k) => ({ name: k.name, type: k.type, stage: k.stage })),
      equip: Object.entries(equip).map(([slot, item]) => ({ slot, item })),
      traits: logic.traitsOf(d).list,
      dead: !!d.dead_at,
      online: !!e,
      away: !!d.exp_end, resting: !!d.rest_at,
      // 동료와 자기 자신에게만, 그리고 같은 지역이면 보이는 정보
      region: friend || self || near ? d.region : null,
      nest: friend || self ? d.nest || null : null,
      self,
      rel: self ? null : {
        mine: db.relGet(viewer.id, d.id),                 // friend / rival / wary / null
        sent: db.reqGet(viewer.id, d.id),                 // 내가 보낸 동료 요청
        got: db.reqGet(d.id, viewer.id),                  // 상대가 보낸 동료 요청
      },
      can: self ? null : {
        gift: reach(viewer, d.id, { needOnline: false }),
        trade: reach(viewer, d.id, { needOnline: true }),
      },
    };
  }

  function relList(me) {
    const out = { friends: [], rivals: [], wary: [] };
    for (const r of db.relList(me.id)) {
      const e = live(r.id);
      const row = { id: r.id, name: r.name, kind: r.dkind, level: r.level, av: r.has_avatar ? r.avatar_ver : 0, online: !!e };
      if (r.kind === 'friend') {
        row.region = e ? e.dragon.region : r.region;
        row.away = !!e?.dragon.exp_end;
        out.friends.push(row);
      } else if (r.kind === 'rival') out.rivals.push(row);
      else if (r.kind === 'wary') out.wary.push(row);
    }
    out.friends.sort((a, b) => b.online - a.online);
    const view = (r) => ({ id: r.id, name: r.name, kind: r.dkind, level: r.level, av: r.has_avatar ? r.avatar_ver : 0, online: !!live(r.id) });
    out.incoming = db.reqIn(me.id).map(view);
    out.outgoing = db.reqOut(me.id).map(view);
    return out;
  }

  // ── 교환 창 ──────────────────────────────────────
  function tradeOf(socket, id) {
    const t = trades.get(Number(id));
    const me = entryOf(socket);
    if (!t || !me || (t.a !== me.dragon.id && t.b !== me.dragon.id)) return null;
    return t;
  }
  const other = (t, id) => (t.a === id ? t.b : t.a);
  function pushTrade(t) {
    for (const id of [t.a, t.b]) {
      const o = other(t, id);
      tell(id, 'trade:state', {
        id: t.id,
        me: t.side[id],
        them: { id: o, name: live(o)?.dragon.name || '', ...t.side[o] },
      });
    }
  }
  function closeTrade(t, reason) {
    trades.delete(t.id);
    for (const id of [t.a, t.b]) tell(id, 'trade:closed', { id: t.id, reason });
  }
  // 둘 다 확정하면 맞바꿈. 그 순간에 다시 모두 확인함
  function settle(t) {
    const A = live(t.a), B = live(t.b);
    if (!A || !B) return closeTrade(t, '상대가 떠나 교환이 취소되었다.');
    const a = A.dragon, b = B.dragon;
    const why = reach(a, b.id, { needOnline: true })
      || checkOffer(a, t.side[a.id].gold, t.side[a.id].items)
      || checkOffer(b, t.side[b.id].gold, t.side[b.id].items);
    if (why) {
      t.side[a.id].ready = false; t.side[b.id].ready = false;
      for (const id of [t.a, t.b]) tell(id, 'trade:error', { id: t.id, error: why });
      return pushTrade(t);
    }
    const sa = t.side[a.id], sb = t.side[b.id];
    a.gold += sb.gold - sa.gold;
    b.gold += sa.gold - sb.gold;
    const move = (from, to) => [...from.items.map((x) => ({ id: x.id, qty: -x.qty })), ...to.items.map((x) => ({ id: x.id, qty: x.qty }))];
    db.saveMany([[a, move(sa, sb)], [b, move(sb, sa)]]);
    trades.delete(t.id);
    const done = (me, gave, got, them) => ({
      id: t.id, title: '교환',
      lines: [`${them.name}${josa(them.name, '과', '와')} 교환했다.`,
        gave.gold || gave.items.length ? `건넨 것: ${giveText(gave.gold, gave.items)}` : '건넨 것 없음',
        got.gold || got.items.length ? `받은 것: ${giveText(got.gold, got.items)}` : '받은 것 없음'],
      items: got.items, gold: got.gold - gave.gold,
    });
    A.socket.emit('trade:done', done(a, sa, sb, b));
    B.socket.emit('trade:done', done(b, sb, sa, a));
    sendMe(A.socket, a);
    sendMe(B.socket, b);
  }

  // ── 소켓 연결마다 ─────────────────────────────────
  function attach(socket) {
    const me = () => entryOf(socket)?.dragon || null;
    const on = (event, fn) => socket.on(event, (payload, ack) => {
      if (typeof ack !== 'function') ack = () => {};
      const d = me();
      if (!d) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
      const now = Date.now();
      if (now - (socket.data.lastSocial || 0) < 250) return ack({ error: '숨을 고르는 중이다.' });
      socket.data.lastSocial = now;
      try { ack(fn(d, payload || {})); } catch (err) { console.error(err); ack({ error: '잠시 뒤에 다시 해 보자.' }); }
    });
    const target = (p) => {
      const id = Number(p.id);
      return Number.isInteger(id) && db.getDragon(id) ? id : null;
    };

    on('dragon:profile', (d, p) => {
      const id = target(p);
      const v = id && profile(d, id);
      return v ? { ok: true, profile: v } : { error: '그런 드래곤은 없다.' };
    });
    on('rel:list', (d) => ({ ok: true, list: relList(d) }));

    // 동료 요청. 상대도 이미 요청을 보냈다면 바로 맺어짐
    on('rel:request', (d, p) => {
      const id = target(p);
      if (!id || id === d.id) return { error: '그런 드래곤은 없다.' };
      if (isFriend(d.id, id)) return { error: '이미 동료다.' };
      const name = db.getDragon(id).name;
      if (db.reqGet(id, d.id)) {
        db.befriend(d.id, id);
        tell(id, 'notice', { title: '동료', lines: [`${ga(d.name)} 동료 요청을 받아들였다. 이제 동료다.`] });
        if (!live(id)) db.noteAdd(id, `${ga(d.name)} 동료 요청을 받아들였다. 이제 동료다.`);
        relChanged(id);
        return { ok: true, lines: [`${name}${josa(name, '과', '와')} 동료가 되었다.`] };
      }
      if (db.reqGet(d.id, id)) return { error: '이미 동료 요청을 보냈다.' };
      db.reqAdd(d.id, id);
      // 동료를 청하면서 붙여 둔 라이벌·경계 표시는 지움
      if (db.relGet(d.id, id)) db.relDel(d.id, id);
      tell(id, 'notice', { title: '동료 요청', lines: [`${ga(d.name)} 동료가 되자고 청했다. 동료 메뉴에서 받아들일 수 있다.`] });
      relChanged(id);
      return { ok: true, lines: [`${name}에게 동료 요청을 보냈다.`] };
    });
    on('rel:accept', (d, p) => {
      const id = target(p);
      if (!id || !db.reqGet(id, d.id)) return { error: '받은 요청이 없다.' };
      db.befriend(d.id, id);
      const name = db.getDragon(id).name;
      const text = `${ga(d.name)} 동료 요청을 받아들였다. 이제 동료다.`;
      if (live(id)) tell(id, 'notice', { title: '동료', lines: [text] }); else db.noteAdd(id, text);
      relChanged(id);
      return { ok: true, lines: [`${name}${josa(name, '과', '와')} 동료가 되었다.`] };
    });
    on('rel:decline', (d, p) => {
      const id = target(p);
      if (!id) return { error: '그런 드래곤은 없다.' };
      db.reqDel(id, d.id);
      relChanged(id);
      return { ok: true, lines: ['요청을 거절했다.'] };
    });
    on('rel:cancel', (d, p) => {
      const id = target(p);
      if (!id) return { error: '그런 드래곤은 없다.' };
      db.reqDel(d.id, id);
      relChanged(id);
      return { ok: true, lines: ['보낸 요청을 거두었다.'] };
    });
    on('rel:unfriend', (d, p) => {
      const id = target(p);
      if (!id || !isFriend(d.id, id)) return { error: '동료가 아니다.' };
      db.unfriend(d.id, id);
      relChanged(id);
      const name = db.getDragon(id).name;
      return { ok: true, lines: [`${name}${josa(name, '과', '와')}의 동료 관계를 끊었다.`] };
    });
    // 라이벌·경계: 혼자 붙이는 표시. 동료에게는 붙일 수 없음 (먼저 끊어야 함)
    on('rel:mark', (d, p) => {
      const id = target(p);
      if (!id || id === d.id) return { error: '그런 드래곤은 없다.' };
      const kind = p.kind === 'rival' || p.kind === 'wary' ? p.kind : null;
      if (isFriend(d.id, id)) return { error: '동료에게는 붙일 수 없다. 먼저 동료 관계를 끊어야 한다.' };
      const name = db.getDragon(id).name;
      if (!kind) { db.relDel(d.id, id); return { ok: true, lines: [`${name}에게 붙인 표시를 지웠다.`] }; }
      db.relSet(d.id, id, kind);
      db.reqDel(d.id, id);
      return { ok: true, lines: [`${name}${josa(name, '을', '를')} ${kind === 'rival' ? '라이벌로' : '경계할 드래곤으로'} 표시했다.`] };
    });

    // ── 선물 ──
    on('gift:send', (d, p) => {
      const id = target(p);
      if (!id) return { error: '그런 드래곤은 없다.' };
      const why = reach(d, id, { needOnline: false });
      if (why) return { error: why };
      const gold = Math.floor(Number(p.gold) || 0);
      const items = cleanItems(p.items);
      if (!gold && !items.length) return { error: '보낼 것을 골라야 한다.' };
      const bad = checkOffer(d, gold, items);
      if (bad) return { error: bad };
      const t = live(id);
      const name = t ? t.dragon.name : db.getDragon(id).name;
      const what = giveText(gold, items);
      d.gold -= gold;
      if (t) {
        t.dragon.gold += gold;
        db.saveMany([[d, items.map((x) => ({ id: x.id, qty: -x.qty }))], [t.dragon, items]]);
        t.socket.emit('notice', { title: '선물', lines: [`${ga(d.name)} ${what}${josa(what, '을', '를')} 보내왔다.`], items });
        sendMe(t.socket, t.dragon);
      } else {
        db.saveState(d, items.map((x) => ({ id: x.id, qty: -x.qty })));
        db.giftOffline(id, gold, items);
        db.noteAdd(id, `자리를 비운 사이 ${ga(d.name)} ${what}${josa(what, '을', '를')} 보내왔다.`);
      }
      sendMe(socket, d);
      return { ok: true, lines: [`${name}에게 ${what}${josa(what, '을', '를')} 보냈다.`] };
    });

    // ── 텔레파시 ──
    on('tp:threads', (d) => ({
      ok: true,
      threads: db.tpThreads(d.id).map((t) => ({
        id: t.id, name: t.name, kind: t.kind, level: t.level, av: t.has_avatar ? t.avatar_ver : 0,
        online: !!live(t.id), text: t.text, at: t.at, mine: t.fromId === d.id, unread: t.unread,
      })),
    }));
    // 대화 열기: 지난 텔레파시를 보여 주고, 받은 것은 들은 것으로
    on('tp:open', (d, p) => {
      const id = target(p);
      if (!id || id === d.id) return { error: '그런 드래곤은 없다.' };
      const o = db.getDragon(id);
      db.tpHear(d.id, id);
      sendMe(socket, d);
      return {
        ok: true,
        with: { id, name: o.name, kind: o.kind, level: o.level, av: o.has_avatar ? o.avatar_ver : 0, online: !!live(id), blocked: db.relGet(id, d.id) === 'wary' },
        messages: db.tpConvo(d.id, id).map((m) => ({ id: m.id, mine: m.fromId === d.id, text: m.text, at: m.at, heard: !!m.heard })),
      };
    });
    on('tp:send', (d, p) => {
      const id = target(p);
      if (!id || id === d.id) return { error: '그런 드래곤은 없다.' };
      const text = str(p.text).replace(/\s+/g, ' ').slice(0, TP_MAX);
      if (!text) return { error: '전할 말이 없다.' };
      const now = Date.now();
      if (now - (socket.data.lastTp || 0) < TP_COOLDOWN) return { error: '생각을 가다듬는 중이다.' };
      socket.data.lastTp = now;
      const o = db.getDragon(id);
      if (!o) return { error: '그런 드래곤은 없다.' };
      if (o.dead_at) return { error: `${o.name}${josa(o.name, '은', '는')} 긴 잠에 들었다. 생각이 더는 닿지 않는다.` };
      // 상대가 나를 경계하면 마음이 닫혀 있어 닿지 않음
      if (db.relGet(id, d.id) === 'wary') return { error: `${o.name}의 마음이 굳게 닫혀 있다. 텔레파시가 닿지 않는다.` };
      const mid = db.tpSend(d.id, id, text);
      const msg = { id: mid, text, at: now };
      const t = live(id);
      if (t) {
        t.socket.emit('tp:msg', { ...msg, from: { id: d.id, name: d.name, kind: d.kind } });
        sendMe(t.socket, t.dragon);
      }
      return { ok: true, message: { ...msg, mine: true, heard: false }, reached: !!t };
    });
    // 대화 창을 열어 둔 채 받은 텔레파시를 바로 들었을 때
    on('tp:heard', (d, p) => {
      const id = target(p);
      if (id) { db.tpHear(d.id, id); sendMe(socket, d); }
      return { ok: true };
    });

    // ── 교환 ──
    on('trade:invite', (d, p) => {
      const id = target(p);
      if (!id) return { error: '그런 드래곤은 없다.' };
      const why = reach(d, id, { needOnline: true });
      if (why) return { error: why };
      for (const t of trades.values()) if ([t.a, t.b].includes(d.id)) return { error: '이미 교환 중이다.' };
      const inv = nextId++;
      invites.set(inv, { from: d.id, to: id, at: Date.now() });
      tell(id, 'trade:invited', { id: inv, from: { id: d.id, name: d.name } });
      return { ok: true, lines: [`${live(id).dragon.name}에게 교환을 청했다. 상대가 받아들이면 교환 창이 열린다.`] };
    });
    on('trade:accept', (d, p) => {
      const inv = invites.get(Number(p.id));
      invites.delete(Number(p.id));
      if (!inv || inv.to !== d.id || Date.now() - inv.at > INVITE_TTL) return { error: '교환 요청이 이미 지났다.' };
      const why = reach(d, inv.from, { needOnline: true });
      if (why) return { error: why };
      for (const t of trades.values()) if ([t.a, t.b].some((x) => x === d.id || x === inv.from)) return { error: '한쪽이 이미 교환 중이다.' };
      const t = { id: nextId++, a: inv.from, b: d.id, side: {} };
      t.side[t.a] = { gold: 0, items: [], ready: false };
      t.side[t.b] = { gold: 0, items: [], ready: false };
      trades.set(t.id, t);
      pushTrade(t);
      return { ok: true };
    });
    on('trade:decline', (d, p) => {
      const inv = invites.get(Number(p.id));
      invites.delete(Number(p.id));
      if (inv && inv.to === d.id) tell(inv.from, 'notice', { title: '교환', lines: [`${ga(d.name)} 교환을 거절했다.`] });
      return { ok: true };
    });
    // 내 쪽에 올려놓기. 무엇이든 바뀌면 양쪽 확정이 풀림
    on('trade:set', (d, p) => {
      const t = tradeOf(socket, p.id);
      if (!t) return { error: '교환 창이 닫혔다.' };
      const gold = Math.floor(Number(p.gold) || 0);
      const items = cleanItems(p.items);
      const bad = checkOffer(d, gold, items);
      if (bad) return { error: bad };
      t.side[d.id] = { gold, items, ready: false };
      t.side[other(t, d.id)].ready = false;
      pushTrade(t);
      return { ok: true };
    });
    on('trade:ready', (d, p) => {
      const t = tradeOf(socket, p.id);
      if (!t) return { error: '교환 창이 닫혔다.' };
      t.side[d.id].ready = !!p.ready;
      if (t.side[t.a].ready && t.side[t.b].ready) settle(t);
      else pushTrade(t);
      return { ok: true };
    });
    on('trade:cancel', (d, p) => {
      const t = tradeOf(socket, p.id);
      if (t) closeTrade(t, `${ga(d.name)} 교환을 그만두었다.`);
      return { ok: true };
    });
  }

  // 접속할 때: 자리를 비운 동안 온 소식
  function onEnter(socket, d) {
    const notes = db.notesTake(d.id);
    const tp = db.tpUnread(d.id);
    if (tp) notes.push(`잠든 사이 마음에 남겨진 텔레파시가 ${tp}개 있다.`);
    if (notes.length) socket.emit('notice', { title: '자리를 비운 동안', lines: notes });
  }
  // 떠날 때: 열려 있던 교환은 취소
  function onLeave(dragonId) {
    for (const t of [...trades.values()]) if (t.a === dragonId || t.b === dragonId) closeTrade(t, '상대가 떠나 교환이 취소되었다.');
    for (const [k, inv] of invites) if (inv.from === dragonId || inv.to === dragonId) invites.delete(k);
  }
  // 지역을 옮기면, 동료가 아닌 상대와의 교환은 취소
  function onMove(dragonId) {
    for (const t of [...trades.values()]) {
      if ((t.a === dragonId || t.b === dragonId) && !isFriend(t.a, t.b) && !sameRegion(t.a, t.b)) {
        closeTrade(t, '서로 다른 곳으로 떠나 교환이 취소되었다.');
      }
    }
  }

  return { attach, onEnter, onLeave, onMove, relIncoming: (id) => db.reqInCount(id) };
};
