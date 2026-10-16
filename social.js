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
// 입양   둥지의 알이나 아직 어른이 되지 않은 인간 아이를 동료에게 보내자고 제안. 받는 쪽이 데려오기로 하면
//        그 둥지로 옮겨 감 (받는 쪽 둥지에 빈자리가 있어야 함). 정할 때까지는 보내는 쪽 둥지에 있음

const { ITEMS, KINDS, REGIONS, STANCES, MIND, SKILLS, HEAL_OTHER, fameTier, KIN, DAY } = require('./game-data');

const ADOPT = { days: 3 };         // 입양 제안을 기다리는 날 (지나면 저절로 거둬짐)

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
const GIFT_MSG_MAX = 100; // 선물과 함께 보내는 말 (글자 수)
const MEMO_MAX = 200;     // 관계 메모 (글자 수, 상대도 볼 수 있음)
const itemText = (items) => items.map(({ id, qty }) => `${ITEMS[id].name}${qty > 1 ? ` ${qty}개` : ''}`).join(', ');
const giveText = (gold, items) => [gold ? `금화 ${gold}닢` : '', itemText(items)].filter(Boolean).join(', ');

module.exports = function setupSocial({ db, online, entryOf, sendMe, logic, life, inBattle = () => false }) {
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
  // 내가 라이벌로 정한 드래곤 (이벤트에서 씀)
  const refreshRivals = (d) => { d.rivalsCache = db.relList(d.id).filter((r) => r.kind === 'rival').map((r) => ({ id: r.id, name: r.name })); };
  const tellRival = (id, text) => { const t = live(id); if (t) t.socket.emit('notice', { title: '라이벌', lines: [text] }); else db.noteAdd(id, text); };
  const eul = (n) => `${n}${josa(n, '을', '를')}`;

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

  // ── 다른 드래곤 치유하기 ──
  const healAmount = (healer, t) => {
    const s = SKILLS.mend;
    const mag = logic.statsOf(healer).wisdom;
    return Math.round((s.heal.base + mag * s.heal.mag + logic.hpCap(t) * s.heal.pct) * HEAL_OTHER.bonus * (logic.titleMods(healer).heal || 1));
  };
  // 고쳐 줄 수 있는지. 안 되면 이유 (t: 받는 드래곤, 이미 회복 계산한 것)
  function healWhy(me, t) {
    if (!SKILLS.mend || me.level < SKILLS.mend.lv) return `치유를 배워야 한다. (레벨 ${SKILLS.mend.lv})`;
    if (me.id === t.id) return '자기 자신은 전투에서 치유로 고친다.';
    if (t.dead_at) return '긴 잠에 든 드래곤이다.';
    if (logic.isFallen(t)) return '쓰러진 드래곤은 지역 카드의 \'일으켜 세우기\'로 돕는다.';
    if (logic.berserkOf(t)) return '광폭화한 드래곤은 진정시켜야 한다.';
    if (me.exp_end) return '원정을 떠나 있는 동안에는 할 수 없다.';
    if (t.exp_end) return '상대가 원정을 떠나 있다.';
    if (logic.isFallen(me) || logic.berserkOf(me)) return '지금은 할 수 없다.';
    if (me.region !== t.region) return '같은 지역에 있어야 고쳐 줄 수 있다.';
    if (inBattle(me.id)) return '싸우는 중이다.';
    if (inBattle(t.id)) return '상대가 싸우는 중이다.';
    if (t.hp >= logic.hpCap(t)) return '다친 곳이 없다.';
    const left = (me.healAt || 0) + HEAL_OTHER.cooldown - Date.now();
    if (left > 0) return `치유의 기운을 다시 모으는 중이다. (${Math.ceil(left / 60000)}분 뒤)`;
    if (me.ap < HEAL_OTHER.ap) return `행동력이 모자란다. (${HEAL_OTHER.ap} 필요)`;
    if (me.en < HEAL_OTHER.en) return `기력이 모자란다. (${HEAL_OTHER.en} 필요)`;
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
    const near = !d.dead_at && d.region === viewer.region; // 같은 지역에 머무는 드래곤 (접속하지 않았어도 이곳의 드래곤 목록에 보이므로)
    // 지금의 체력·기력·정신 (접속하지 않은 동안 찬 만큼도 계산해서 보여 줌)
    if (!d.dead_at) logic.regen(d);
    const vitals = d.dead_at ? null : {
      hp: d.hp, hpMax: logic.hpCap(d), en: d.en, enMax: logic.enCap(d),
      mind: d.mind ?? MIND.max, mindMax: MIND.max,
    };
    // 능력치는 숫자 대신 다섯 단계로만 알려 줌 (정확한 값은 본인만 봄)
    const tierOf = (v) => (v >= 19 ? 5 : v >= 15 ? 4 : v >= 12 ? 3 : v >= 9 ? 2 : 1);
    const st = logic.statsOf(d);
    const statTiers = Object.fromEntries(['claw', 'scale', 'wing', 'wisdom', 'majesty'].map((k) => [k, tierOf(st[k])]));
    return {
      vitals, statTiers,
      id: d.id, name: d.name, kind: d.kind, kindName: KINDS[d.kind]?.name || '', level: d.level,
      av: d.has_avatar ? d.avatar_ver : 0,
      stance: d.stance, stanceName: STANCES[d.stance] || '',
      fame: ft.name,
      lineage: kin?.lineage || 0,
      kin: (kin?.home || []).map((k) => ({ name: k.name, type: k.type, stage: k.stage })),
      equip: Object.entries(equip).map(([slot, item]) => ({ slot, item })),
      traits: logic.traitsOf(d).list,
      title: (() => { const t = logic.titleOn(d); return t ? { name: t.name, eff: t.eff } : null; })(),
      dead: !!d.dead_at,
      // 먼 여행을 떠났으면 그때와 남긴 말, 의지를 이어받았으면 누구에게서
      departed: (() => { if (!d.dead_at) return null; let f = d.fallen; if (typeof f === 'string') { try { f = JSON.parse(f); } catch { f = null; } } return f?.departed ? { at: f.at, words: f.words || '' } : null; })(),
      heir: (() => { try { const h = d.heir ? JSON.parse(d.heir) : null; return h ? { name: h.name, kind: h.kind, kindName: KINDS[h.kind]?.name || '', level: h.level } : null; } catch { return null; } })(),
      bio: (() => { try { const b = typeof d.bio === 'string' ? JSON.parse(d.bio || '{}') : (d.bio || {}); const g = b.gender || ''; return { gender: ({ 수컷: '남성', 암컷: '여성' })[g] || g, desc: b.desc || '' }; } catch { return { gender: '', desc: '' }; } })(),
      online: !!e,
      away: !!d.exp_end, resting: !!d.rest_at,
      // 동료와 자기 자신에게만, 그리고 같은 지역이면 보이는 정보
      region: friend || self || near ? d.region : null,
      place: friend || self || near ? logic.placeOf(d) : null,   // 지역 안의 장소
      nest: friend || self ? d.nest || null : null,
      self,
      rel: self ? null : {
        mine: db.relGet(viewer.id, d.id),                 // friend / rival / wary / null
        sent: db.reqGet(viewer.id, d.id),                 // 내가 보낸 동료 요청
        got: db.reqGet(d.id, viewer.id),                  // 상대가 보낸 동료 요청
        memo: db.memoGet(viewer.id, d.id).text,           // 내가 이 드래곤에 대해 남긴 메모
        memoShared: db.memoGet(viewer.id, d.id).shared,   // 상대도 볼 수 있는지 (예전 비공개 메모면 false)
        theirMemo: db.memoShared(d.id, viewer.id),        // 이 드래곤이 나에 대해 남긴 메모
      },
      can: self ? null : {
        gift: reach(viewer, d.id, { needOnline: false }),
        trade: reach(viewer, d.id, { needOnline: true }),
        heal: (logic.regen(viewer), healWhy(viewer, d)),
      },
      heal: self ? null : { ap: HEAL_OTHER.ap, en: HEAL_OTHER.en, amount: d.dead_at ? 0 : Math.min(healAmount(viewer, d), Math.max(0, logic.hpCap(d) - d.hp)), learned: viewer.level >= (SKILLS.mend?.lv || 99) },
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
      } else if (r.kind === 'rival') { row.mutual = db.relGet(r.id, me.id) === 'rival'; out.rivals.push(row); }
      else if (r.kind === 'wary') out.wary.push(row);
    }
    out.friends.sort((a, b) => b.online - a.online);
    const view = (r) => ({ id: r.id, name: r.name, kind: r.dkind, level: r.level, av: r.has_avatar ? r.avatar_ver : 0, online: !!live(r.id) });
    out.incoming = db.reqIn(me.id).map(view);
    // 나를 라이벌로 정했지만 나는 아직 정하지 않은 드래곤
    const mine = new Set(out.rivals.map((x) => x.id));
    out.rivalsIn = db.rivalFans(me.id).filter((id) => !mine.has(id)).map((id) => db.getDragon(id)).filter((x) => x && !x.dead_at).map(view);
    out.outgoing = db.reqOut(me.id).map(view);
    // 내가 남긴 메모와 상대가 나에게 남긴 메모를 각 줄에 붙임
    const memos = db.memoMap(me.id);
    const about = db.memoAboutMap(me.id);
    for (const list of Object.values(out)) for (const x of list) { x.memo = memos.get(x.id) || ''; x.theirMemo = about.get(x.id) || ''; }
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

  // ── 식구 입양 ─────────────────────────────────────
  // 보낼 수 있는 식구: 알(식지 않은 것), 아직 갈 길을 정하지 않은 인간 아이 (어른이 되기 전). 원정을 따라간 식구는 안 됨
  function adoptWhy(k, now = Date.now()) {
    if (!k) return '그 식구는 이제 둥지에 없다.';
    if (k.status === 'egg') return null;
    if (k.type !== 'human' || k.status !== 'home') return '알이나 인간 아이만 입양 보낼 수 있다.';
    if (k.data.path || (now - k.data.born) / DAY >= KIN.human.adultDay) return '이미 다 자라 제 갈 길을 정할 때가 되었다.';
    if (k.data.onExp) return '원정에 따라가 있는 동안에는 보낼 수 없다.';
    return null;
  }
  const kinWhat = (k) => (k.status === 'egg' ? `${KINDS[k.data.kind]?.name || ''}의 알 ${k.name}` : `인간 아이 ${k.name}`);
  const kinBrief = (k, now) => ({ id: k.id, name: k.name, type: k.type, egg: k.status === 'egg', kind: k.data.kind || null, stage: life.stageOf(k, now).name });
  const loadDragon = (id) => { const e = live(id); return e ? e.dragon : db.getDragon(id); };
  // 식구가 바뀐 드래곤: 저장하고 식구 도움·요약을 새로
  function kinChanged(d, kin) {
    db.kinSaveAll(d.id, kin);
    d.perks = life.perksOf(kin);
    d.kinSummary = life.summary(kin, Date.now());
    const e = live(d.id);
    db.saveState(d);
    if (e) sendMe(e.socket, d);
  }
  const adoptTell = (id, text, ev, data) => {
    const e = live(id);
    if (e) { e.socket.emit('notice', { title: '입양', lines: [text] }); if (ev) e.socket.emit(ev, data); sendMe(e.socket, e.dragon); }
    else db.noteAdd(id, text);
  };
  // 기한이 지났거나 더는 보낼 수 없게 된 제안은 지움
  function offerAlive(o, now = Date.now()) {
    if (now - o.at > ADOPT.days * DAY) { db.offerDel(o.id); adoptTell(o.from_id, `입양 제안에 답이 없어 거두어들였다.`); return null; }
    const k = db.kinLoad(o.from_id).find((x) => x.id === o.kin_id);
    if (adoptWhy(k, now)) { db.offerDel(o.id); return null; }
    return k;
  }
  // 둥지 창에 보일 제안: 받은 것과 보낸 것
  function kinOffers(d, now = Date.now()) {
    const inn = [], out = [];
    for (const o of db.offersTo(d.id)) {
      const k = offerAlive(o, now);
      const f = k && loadDragon(o.from_id);
      if (f) inn.push({ id: o.id, at: o.at, until: o.at + ADOPT.days * DAY, from: { id: f.id, name: f.name, kind: f.kind }, kin: kinBrief(k, now) });
    }
    for (const o of db.offersFrom(d.id)) {
      const k = offerAlive(o, now);
      const t = k && loadDragon(o.to_id);
      if (t) out.push({ id: o.id, kin: o.kin_id, until: o.at + ADOPT.days * DAY, to: { id: t.id, name: t.name, kind: t.kind } });
    }
    return { in: inn, out, days: ADOPT.days };
  }
  const roomOf = (t) => (t.nest ? !life.homeKin(db.kinLoad(t.id), logic.maxKinOf(t)).full : false);

  // ── 소켓 연결마다 ─────────────────────────────────
  function attach(socket) {
    const me = () => entryOf(socket)?.dragon || null;
    // 보기만 하는 요청(목록·프로필 읽기)은 간격 제한을 두지 않음.
    // 관계를 바꾼 직후 화면이 목록과 프로필을 다시 불러오는데, 여기에 걸리면 화면이 바뀌지 않고 멈춰 있었음
    const READ_ONLY = new Set(['dragon:profile', 'rel:list', 'gift:inbox', 'gift:seen', 'tp:threads', 'tp:open', 'tp:heard']);
    const on = (event, fn) => socket.on(event, (payload, ack) => {
      if (typeof ack !== 'function') ack = () => {};
      const d = me();
      if (!d) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
      const now = Date.now();
      if (!READ_ONLY.has(event)) {
        if (now - (socket.data.lastSocial || 0) < 250) return ack({ error: '숨을 고르는 중이다.' });
        socket.data.lastSocial = now;
      }
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
      const was = db.relGet(d.id, id);
      if (!kind) {
        db.relDel(d.id, id);
        refreshRivals(d);
        if (was === 'rival') { tellRival(id, `${ga(d.name)} 라이벌 표시를 거두었다.`); relChanged(id); }
        return { ok: true, lines: [`${name}에게 붙인 표시를 지웠다.`] };
      }
      db.relSet(d.id, id, kind);
      db.reqDel(d.id, id);
      refreshRivals(d);
      // 라이벌: 상대에게 알림 (경계는 혼자만 아는 표시라 알리지 않음)
      if (kind === 'rival' && was !== 'rival') {
        const mutual = db.relGet(id, d.id) === 'rival';
        logic.chron(d, 'choice', mutual ? `${eul(name)} 맞받아 라이벌로 정했다. 이제 서로의 숙적이다.` : `${eul(name)} 라이벌로 정했다.`);
        const t = live(id);
        const text = mutual ? `${ga(d.name)} 당신의 도전을 받아들였다. 이제 서로의 숙적이다!` : `${ga(d.name)} 당신을 라이벌로 지목했다!`;
        if (t) {
          logic.chron(t.dragon, 'mark', mutual ? `${ga(d.name)} 나를 맞받아 라이벌로 정했다.` : `${ga(d.name)} 나를 라이벌로 지목했다.`);
          db.saveState(t.dragon);
          t.socket.emit('rival:named', { id: d.id, name: d.name, mutual, text });
        } else db.noteAdd(id, text);
        db.saveState(d);
        relChanged(id);
      }
      return { ok: true, lines: [`${name}${josa(name, '을', '를')} ${kind === 'rival' ? '라이벌로' : '경계할 드래곤으로'} 표시했다.`] };
    });

    // 관계 메모: 상대가 누구든 남길 수 있고, 상대도 그 드래곤의 기록에서 볼 수 있음. 빈 글이면 지움
    on('rel:memo', (d, p) => {
      const id = target(p);
      if (!id || id === d.id) return { error: '그런 드래곤은 없다.' };
      const text = (typeof p.text === 'string' ? p.text : '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MEMO_MAX);
      db.memoSet(d.id, id, text);
      relChanged(id); // 상대가 내 기록이나 동료 목록을 보고 있으면 바로 바뀌게
      return { ok: true, memo: text, lines: [text ? '메모를 남겼다. 상대도 볼 수 있다.' : '메모를 지웠다.'] };
    });

    // ── 다른 드래곤 치유하기 ──
    on('heal:other', (d, p) => {
      const id = target(p);
      if (!id) return { error: '그런 드래곤은 없다.' };
      const e = live(id);
      const t = e ? e.dragon : db.getDragon(id);
      logic.regen(d);
      if (!t.dead_at) logic.regen(t);
      const why = healWhy(d, t);
      if (why) return { error: why };
      const now = Date.now();
      const amt = Math.min(healAmount(d, t), logic.hpCap(t) - t.hp);
      logic.spendAp(d, HEAL_OTHER.ap);
      if (d.en >= logic.enCap(d)) d.en_at = now;
      d.en -= HEAL_OTHER.en;
      d.healAt = now; // 다시 쓰기까지 (서버를 다시 켜면 풀림)
      t.hp += amt;
      if (t.hp >= logic.hpCap(t)) t.hp_at = now;
      const lines = [`${t.name}에게 치유 마법을 펼쳤다. 상처가 빛 속에 아물었다. (${t.name} 체력 +${amt})`];
      // 명성: 같은 드래곤을 고쳐 줄 때는 한동안 한 번만
      d.healFame ||= {};
      if (now - (d.healFame[t.id] || 0) >= HEAL_OTHER.fameEvery) {
        d.healFame[t.id] = now;
        const f = logic.addFame(d, HEAL_OTHER.fame);
        lines.push(`용족 명성 +${HEAL_OTHER.fame}`);
        if (f) lines.push(f);
      }
      const xp = logic.xpOf(d, HEAL_OTHER.xp);
      const up = logic.gainXp(d, xp);
      lines.push(`경험치 +${xp}${up ? ` · 레벨이 올랐다! Lv. ${d.level}` : ''}`);
      lines.push(...logic.traitCount(d, 'healother'));
      logic.chron(t, 'mark', `${ga(d.name)} 치유 마법으로 상처를 아물게 해 주었다.`);
      db.saveState(d);
      db.saveState(t);
      const text = `${ga(d.name)} 치유 마법으로 상처를 아물게 해 주었다. (체력 +${amt})`;
      if (e) { sendMe(e.socket, t); e.socket.emit('healed', { by: { id: d.id, name: d.name, kind: d.kind }, amount: amt, text }); }
      else db.noteAdd(t.id, text);
      sendMe(socket, d);
      return { ok: true, amount: amt, lines };
    });

    // ── 식구 입양 ──
    on('kin:offer', (d, p) => {
      if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
      if (!d.nest || d.region !== d.nest) return { error: '식구는 둥지에 있을 때만 보낼 수 있다.' };
      const kin = db.kinLoad(d.id);
      const k = kin.find((x) => x.id === Number(p.kin) && (x.status === 'home' || x.status === 'egg'));
      const why = adoptWhy(k);
      if (why) return { error: why };
      if (db.offerOfKin(k.id)) return { error: `${k.name}에게는 이미 보낼 곳을 물어 두었다.` };
      const id = target(p);
      if (!id || id === d.id) return { error: '그런 드래곤은 없다.' };
      if (!isFriend(d.id, id) || !isFriend(id, d.id)) return { error: '동료에게만 입양 보낼 수 있다.' };
      const t = loadDragon(id);
      if (!t || t.dead_at) return { error: '그 드래곤은 지금 받을 수 없다.' };
      if (!t.nest) return { error: `${t.name}에게는 아직 둥지가 없다.` };
      if (!roomOf(t)) return { error: `${t.name}의 둥지에는 이미 식구가 가득하다.` };
      const oid = db.offerAdd(k.id, d.id, t.id);
      const what = kinWhat(k);
      adoptTell(t.id, `동료 ${ga(d.name)} ${eul(what)} 맡아 달라고 한다. 둥지에서 데려올지 정할 수 있다. (${ADOPT.days}일 안에)`, 'kin:offer:got', { id: oid, from: { id: d.id, name: d.name }, kin: kinBrief(k, Date.now()) });
      return { ok: true, lines: [`${t.name}에게 ${eul(what)} 맡아 달라고 했다. 답을 기다리는 동안 ${k.name}${josa(k.name, '은', '는')} 둥지에 있다.`] };
    });
    on('kin:offer:cancel', (d, p) => {
      const o = db.offerGet(Number(p.id));
      if (!o || o.from_id !== d.id) return { error: '그런 제안은 없다.' };
      db.offerDel(o.id);
      adoptTell(o.to_id, `${ga(d.name)} 입양 제안을 거두어들였다.`, 'kin:offer:gone', { id: o.id });
      return { ok: true, lines: ['입양 제안을 거두어들였다.'] };
    });
    on('kin:offer:answer', (d, p) => {
      const o = db.offerGet(Number(p.id));
      if (!o || o.to_id !== d.id) return { error: '그 제안은 이미 지나갔다.' };
      const now = Date.now();
      const k = offerAlive(o, now);
      const f = k && loadDragon(o.from_id);
      // 먼 여행을 떠난 드래곤이 남기고 간 제안은 받아 줄 수 있음 (긴 잠에 든 드래곤은 안 됨)
      const gone = f && f.dead_at && !(() => { let x = f.fallen; if (typeof x === 'string') { try { x = JSON.parse(x); } catch { x = null; } } return x?.departed; })();
      if (!k || !f || gone) { db.offerDel(o.id); return { error: '그 식구는 이제 보낼 수 없게 되었다.' }; }
      const what = kinWhat(k);
      if (!p.yes) {
        db.offerDel(o.id);
        adoptTell(f.id, `${ga(d.name)} ${eul(what)} 맡기 어렵다고 했다.`);
        return { ok: true, lines: [`${f.name}의 제안을 정중히 거절했다.`] };
      }
      if (!d.nest) return { error: '데려오려면 내 둥지가 있어야 한다.' };
      if (!roomOf(d)) return { error: `내 둥지에는 이미 식구가 가득하다. (최대 ${logic.maxKinOf(d)})` };
      if (!db.kinMove(k.id, f.id, d.id)) { db.offerDel(o.id); return { error: '그 식구는 이미 떠났다.' }; }
      db.offerDel(o.id);
      // 새 둥지에서: 아이는 낯을 가려 유대가 줄고, 알은 다시 품어야 함 (식기까지의 날은 새로)
      const mine = db.kinLoad(d.id);
      const m = mine.find((x) => x.id === k.id);
      if (m) {
        m.data.adoptedFrom = f.name;
        if (m.status === 'egg') { m.data.incubateAt = null; m.data.found = now; }
        else { m.data.bond = Math.max(KIN.human.startBond, Math.round((m.data.bond || 0) * 0.5)); m.data.lastCare = now - KIN.human.careCooldown; m.data.onExp = false; }
      }
      kinChanged(d, mine);
      kinChanged(f, db.kinLoad(f.id));
      logic.chron(d, 'choice', `동료 ${f.name}에게서 ${eul(what)} 맡아 왔다.`);
      logic.chron(f, 'choice', `${what}${josa(what, '을', '를')} 동료 ${d.name}에게 입양 보냈다.`);
      db.saveState(d); db.saveState(f);
      adoptTell(f.id, `${ga(d.name)} ${eul(what)} 데려갔다. 새 둥지에서 잘 자랄 것이다.`, 'kin:offer:gone', { id: o.id });
      sendMe(socket, d);
      return { ok: true, lines: [`${f.name}에게서 ${eul(what)} 맡아 왔다.`, m && m.status === 'egg' ? '새 둥지에서 다시 품어 주어야 한다.' : `${k.name}${josa(k.name, '이', '가')} 낯선 둥지를 두리번거린다. 유대를 다시 쌓아야 한다.`] };
    });

    // ── 선물 ──
    on('gift:send', (d, p) => {
      const id = target(p);
      if (!id) return { error: '그런 드래곤은 없다.' };
      const why = reach(d, id, { needOnline: false });
      if (why) return { error: why };
      const gold = Math.floor(Number(p.gold) || 0);
      const items = cleanItems(p.items);
      const msg = (typeof p.msg === 'string' ? p.msg : '').replace(/\s+/g, ' ').trim().slice(0, GIFT_MSG_MAX); // 함께 보내는 말
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
      } else {
        db.saveState(d, items.map((x) => ({ id: x.id, qty: -x.qty })));
        db.giftOffline(id, gold, items);
      }
      // 받은 선물 상자에 넣음: 받은 쪽이 '확인'을 누를 때까지 남는 알림 (접속하지 않았으면 다음 접속 때)
      const gid = db.giftIn(id, d, gold, items, msg);
      if (t) {
        t.socket.emit('gift:got', { id: gid, from: { id: d.id, name: d.name, kind: d.kind }, gold, items, msg, at: Date.now() });
        sendMe(t.socket, t.dragon);
      }
      sendMe(socket, d);
      return { ok: true, lines: [`${name}에게 ${what}${josa(what, '을', '를')} 보냈다.${msg ? ' 함께 적은 말도 전해진다.' : ''}`] };
    });

    // 받은 선물 확인 (상자에서 지움)
    on('gift:seen', (d, p) => ({ ok: db.giftSeen(Number(p.id), d.id) }));
    on('gift:inbox', (d) => ({ ok: true, list: db.giftList(d.id) }));

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
    refreshRivals(d);
    const gifts = db.giftList(d.id);
    if (gifts.length) socket.emit('gift:inbox', gifts); // 확인하지 않은 선물
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

  return { attach, onEnter, onLeave, onMove, relIncoming: (id) => db.reqInCount(id), tellRival, refreshRivals, kinOffers };
};
