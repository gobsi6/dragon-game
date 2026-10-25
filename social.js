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

const { ITEMS, KINDS, STANCES, MIND, SKILLS, HEAL_OTHER, fameTier, KIN, DAY, BONDS, MARKS, BOND_RULES, FESTIVAL, BUFFS, REGIONS, RULES, isTestDragon } = require('./game-data');

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

module.exports = function setupSocial({ db, online, entryOf, sendMe, logic, life, inBattle = () => false, nightOpen = () => false }) {
  const trades = new Map();   // 교환 창: id → { id, a, b, side: { [드래곤 id]: { gold, items, ready } } }
  const invites = new Map();  // 교환 요청: id → { from, to, at }
  const teachAt = new Map();  // 가르치기: '스승 id:제자 id' → 마지막으로 가르친 시각
  let nextId = 1;

  const live = (id) => online.get(id) || null;
  const isFriend = (a, b) => db.relGet(a, b) === 'friend';
  // ── 관계 이름 ──
  const invOf = (bond) => BONDS[bond]?.inv || bond;          // 상대 쪽에서 본 관계 (스승 ↔ 제자)
  const bondName = (bond) => BONDS[bond]?.name || '동료';
  // 연인·반려 상대 (한 명)
  const heartOf = (id) => { for (const b of BOND_RULES.hearts) { const x = db.relByBond(id, b)[0]; if (x) return { id: x, bond: b }; } return null; };
  // a가 b에게 bond(b가 a에게 무엇인지)를 맺을 수 있는지. 안 되면 이유
  // 보낸 드래곤의 지금 프로필 그림 번호 (없으면 0 → 화면에서 문장으로)
  const avOf = (id) => { const x = db.getDragon(id); return x && x.has_avatar ? x.avatar_ver : 0; };
  function bondWhy(a, b, bond) {
    const A = loadD(a), B = loadD(b);
    if (!BONDS[bond]) return '그런 관계는 없다.';
    if (!A || !B || B.dead_at) return '그 드래곤과는 관계를 맺을 수 없다.';
    const cur = db.relBond(a, b);
    if (cur === bond) return `이미 ${bondName(bond)} 사이다.`;
    if (BONDS[bond].needs && cur !== BONDS[bond].needs) return `${bondName(BONDS[bond].needs)} 사이여야 ${bondName(bond)}${josa(bondName(bond), '이', '가')} 될 수 있다.`;
    if (BOND_RULES.hearts.includes(bond)) {
      const ha = heartOf(a), hb = heartOf(b);
      if (ha && ha.id !== b) return `이미 마음을 준 상대가 있다.`;
      if (hb && hb.id !== a) return `${B.name}에게는 이미 마음을 준 상대가 있다.`;
    }
    const G = BOND_RULES.mentorGap;
    const mentorStudent = (m, st) => {
      if (m.level < st.level + G) return `스승은 제자보다 레벨이 ${G} 이상 높아야 한다.`;
      if (db.relByBond(st.id, 'mentor').some((x) => x !== m.id)) return `${st.name}에게는 이미 스승이 있다.`;
      if (db.relByBond(m.id, 'student').filter((x) => x !== st.id).length >= BOND_RULES.studentsMax) return `${m.name}에게는 이미 제자가 ${BOND_RULES.studentsMax}명 있다.`;
      return null;
    };
    if (bond === 'mentor') return mentorStudent(B, A);   // b를 스승으로
    if (bond === 'student') return mentorStudent(A, B);  // b를 제자로
    return null;
  }
  const loadD = (id) => { const e = live(id); return e ? e.dragon : db.getDragon(id); };
  // '시엘과 친구 사이가 되었다' / '시엘이 나의 제자가 되었다' (관계: 상대가 나에게 무엇인지)
  const becameText = (name, bond) => {
    const n = bondName(bond);
    return n === bondName(invOf(bond)) ? `${name}${josa(name, '과', '와')} ${n} 사이가 되었다.` : `${name}${josa(name, '이', '가')} 나의 ${n}${josa(n, '이', '가')} 되었다.`;
  };
  // 관계를 맺기 전 서로 붙여 둔 표시(라이벌·원수·경계): 관계가 맺어지면 사라지므로 기록과 알림에 남김
  // mine: 내가 상대에게 붙인 것, theirs: 상대가 나에게 붙인 것 (경계는 상대가 모르는 표시라 theirs에서는 뺌)
  const MARK_KINDS = ['rival', 'nemesis', 'wary'];
  const pastOf = (mine, theirs) => {
    mine = MARK_KINDS.includes(mine) ? mine : null;
    theirs = theirs === 'rival' || theirs === 'nemesis' ? theirs : null;
    if (!mine && !theirs) return null;
    if (mine === 'rival' && theirs === 'rival') return { was: '숙적이던', end: '서로 숙적이던 사이는 끝났다.' };
    if (mine === 'nemesis' && theirs === 'nemesis') return { was: '서로 원수이던', end: '서로 품었던 원한을 내려놓았다.' };
    if (mine === 'rival') return { was: '라이벌로 여기던', end: '붙여 두었던 라이벌 표시는 사라졌다.' };
    if (mine === 'nemesis') return { was: '원수로 여기던', end: '품고 있던 원한을 내려놓았다.' };
    if (mine === 'wary') return { was: '경계하던', end: '경계하던 마음도 거두었다.' };
    if (theirs === 'rival') return { was: '나를 라이벌로 지목했던', end: '상대가 붙였던 라이벌 표시도 사라졌다.' };
    return { was: '나를 원수로 여기던', end: '상대가 품었던 원한도 사라졌다.' };
  };
  // 관계를 맺음 (a가 청하고 b가 받아들임). 돌려줌: { a, b } 각자에게 사라진 표시 안내 (없으면 null)
  function bondMake(a, b, bond) {
    const ma = db.relGet(a, b), mb = db.relGet(b, a);
    const pa = pastOf(ma, mb), pb = pastOf(mb, ma);
    db.befriend(a, b, bond, invOf(bond));
    const A = loadD(a), B = loadD(b);
    const nA = bondName(bond), nB = bondName(invOf(bond));
    const pre = (p) => (p ? `${p.was} ` : '');
    // 예: '숙적이던 카이렌과 친구 사이가 되었다.' / '라이벌로 여기던 카이렌이 나의 스승이 되었다.'
    const say = (p, other, n, same) => `${pre(p)}${other}${same ? `${josa(other, '과', '와')} ${n} 사이가 되었다` : `${josa(other, '이', '가')} 나의 ${n}${josa(n, '이', '가')} 되었다`}.`;
    logic.chron(A, 'mark', say(pa, B.name, nA, nA === nB));
    logic.chron(B, 'mark', say(pb, A.name, nB, nA === nB));
    db.saveState(A); db.saveState(B);
    for (const id of [a, b]) { const e = live(id); if (e) refreshRivals(e.dragon); }
    return { a: pa?.end || null, b: pb?.end || null };
  }
  const sameRegion = (a, b) => {
    const x = live(a), y = live(b);
    return !!x && !!y && x.dragon.region === y.dragon.region;
  };
  const tell = (id, event, data) => { const e = live(id); if (e) e.socket.emit(event, data); };
  const relChanged = (id) => tell(id, 'rel:changed', {});
  // 내가 라이벌로 정한 드래곤 (이벤트에서 씀)
  const refreshRivals = (d) => { d.rivalsCache = db.relList(d.id).filter((r) => r.kind === 'rival').map((r) => ({ id: r.id, name: r.name })); };
  const tellRival = (id, text, title = '라이벌') => { const t = live(id); if (t) t.socket.emit('notice', { title, lines: [text] }); else db.noteAdd(id, text); };
  const eul = (n) => `${n}${josa(n, '을', '를')}`;
  // 이벤트에서 생긴 물건을 다른 드래곤에게 보냄 (받은 선물 상자로)
  const eventGift = (from, id, items, msg = '') => {
    const t = live(id);
    if (!t && !db.getDragon(id)) return;
    if (t) db.saveState(t.dragon, items); else db.giftOffline(id, 0, items);
    const gid = db.giftIn(id, from, 0, items, msg);
    // 주고받은 기록 (이벤트로 오간 선물)
    const to = t ? t.dragon : db.getDragon(id);
    db.ledgerAdd(id, { kind: 'gift_in', other: { id: from.id, name: from.name, kind: from.kind }, itemsIn: items, msg, note: '이벤트' });
    db.ledgerAdd(from.id, { kind: 'gift_out', other: { id, name: to?.name || '', kind: to?.kind }, itemsOut: items, msg, note: '이벤트' });
    if (t) {
      t.socket.emit('gift:got', { id: gid, from: { id: from.id, name: from.name, kind: from.kind, av: avOf(from.id) }, gold: 0, items, msg, at: Date.now() });
      sendMe(t.socket, t.dragon);
    }
  };

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

  // ── 왕도 축제 ─────────────────────────────────────
  const festivalNow = logic.festivalNow; // 한국 시각 토·일 (game-logic.js)
  // 이번 축제에서 함께 춘 드래곤 (드래곤마다 저장, 축제가 바뀌면 새로)
  function dancedWith(d, key) {
    const c = logic.combatJson(d);
    if (!c.fest || c.fest.key !== key) c.fest = { key, with: [] };
    return c.fest.with;
  }
  const festInvites = new Map(); // 신청 id → { id, from, to, timer }
  function danceWhy(me, t, fest) {
    if (!fest) return '지금은 축제가 열리지 않았다. 주말마다 왕도에서 열린다.';
    if (me.region !== FESTIVAL.region) return `축제는 ${REGIONS[FESTIVAL.region]?.name || '왕도'}에서 열린다.`;
    if (!t) return '상대가 접속해 있지 않다.';
    if (t.id === me.id) return '혼자서는 춤출 수 없다.';
    if (t.region !== me.region) return '같은 지역에 있어야 함께 춤출 수 있다.';
    for (const [x, who] of [[me, ''], [t, '상대가 ']]) {
      if (x.exp_end) return `${who}원정을 떠나 있다.`;
      if (x.rest_at) return `${who}둥지에서 쉬는 중이다.`;
      if (inBattle(x.id)) return `${who}싸우는 중이다.`;
      if (logic.berserkOf(x)) return `${who}광폭화 중이다.`;
      if (logic.isFallen(x)) return `${who}쓰러져 있다.`;
    }
    if (dancedWith(me, fest.key).includes(t.id)) return '이번 축제에서 이미 함께 춤추었다.';
    return null;
  }
  // 춤을 춘 뒤: 둘 다 강화 효과, 춤 횟수(칭호), 처음이면 꽃장식
  function danceDone(d, partner, fest) {
    dancedWith(d, fest.key).push(partner.id);
    const first = !(logic.traitsOf(d).counts.dance > 0);
    const lines = [`${partner.name}${josa(partner.name, '과', '와')} 광장 한가운데서 춤을 추었다. 사람들이 손뼉을 치며 둘레를 돈다.`];
    logic.giveBuff(d, 'festive', FESTIVAL.buffMinutes);
    lines.push(`강화 효과 '${BUFFS.festive.name}' (${FESTIVAL.buffMinutes / 60}시간): ${BUFFS.festive.desc}`);
    const before = logic.repOf(d)[FESTIVAL.region] || 0;
    const rep = logic.addRep(d, FESTIVAL.region, FESTIVAL.rep); // 축제에 함께한 드래곤을 마을이 반김 (특성에 따라 오르는 폭이 다를 수 있음)
    if (rep > before) lines.push(`${REGIONS[FESTIVAL.region]?.name || '왕도'} 평판 +${rep - before}`);
    lines.push(...logic.traitCount(d, 'dance'));
    const items = [];
    if (first) {
      items.push({ id: FESTIVAL.gift, qty: 1 });
      lines.push(`춤이 끝나자 마을 사람들이 목에 ${ITEMS[FESTIVAL.gift].name}${josa(ITEMS[FESTIVAL.gift].name, '을', '를')} 걸어 주었다. 둥지의 보물 상자에 넣어 간직할 수 있다.`);
    }
    return { lines, items };
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
    // 단계는 '그 레벨의 드래곤에게 흔한 값'에 견줘서 정함. 레벨이 오르면 모두가 '압도적'이 되지 않게
    const ref = 10 + 0.7 * Math.min(d.level || 1, 25);  // 레벨별로 흔한 능력치 (장신구 포함)
    const tierOf = (v) => { const r = v / ref; return r >= 1.45 ? 5 : r >= 1.15 ? 4 : r >= 0.9 ? 3 : r >= 0.7 ? 2 : 1; };
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
      // 둥지 한 줄 요약: 누구에게나 보임 (식구 이름 포함). 어느 지역인지는 동료·자기 자신에게만
      nestLine: (() => { const l = d.dead_at ? null : logic.nestLine(d, kin?.home); if (l && !(friend || self)) l.region = null; return l; })(),
      self,
      rel: self ? null : {
        mine: db.relGet(viewer.id, d.id),                 // friend(관계를 맺음) / rival / wary / nemesis / null
        bond: db.relBond(viewer.id, d.id),                // 맺은 관계: 상대가 나에게 무엇인지 (acquaint, comrade, friend, mentor, student …)
        sentBond: db.reqBond(viewer.id, d.id),            // 내가 청해 둔 관계
        gotBond: db.reqBond(d.id, viewer.id),             // 상대가 청해 온 관계 (상대에게 내가 무엇이 되는지)
        teachIn: (() => { const l = teachAt.get(`${viewer.id}:${d.id}`) || 0; return Math.max(0, l + BOND_RULES.teach.cooldown - Date.now()); })(),
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
    const out = { friends: [], rivals: [], wary: [], nemesis: [] };
    for (const r of db.relList(me.id)) {
      const e = live(r.id);
      const row = { id: r.id, name: r.name, kind: r.dkind, level: r.level, av: r.has_avatar ? r.avatar_ver : 0, online: !!e,
        idle: !e && Date.now() - (r.last_seen || 0) >= RULES.awayMs }; // 3일 넘게 자리를 비움 (목록에서 흐리게)
      if (r.kind === 'friend') {
        row.bond = r.bond || 'comrade';
        row.region = e ? e.dragon.region : r.region;
        row.away = !!e?.dragon.exp_end;
        out.friends.push(row);
      } else if (r.kind === 'rival') { row.mutual = db.relGet(r.id, me.id) === 'rival'; out.rivals.push(row); }
      else if (r.kind === 'wary') out.wary.push(row);
      else if (r.kind === 'nemesis') out.nemesis.push(row);
    }
    out.friends.sort((a, b) => b.online - a.online);
    const view = (r) => ({ id: r.id, name: r.name, kind: r.dkind, level: r.level, av: r.has_avatar ? r.avatar_ver : 0, online: !!live(r.id), bond: r.bond || 'comrade',
      idle: !live(r.id) && r.last_seen != null && Date.now() - r.last_seen >= RULES.awayMs });
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
    // 주고받은 기록 (교환)
    db.ledgerAdd(a.id, { kind: 'trade', other: { id: b.id, name: b.name, kind: b.kind }, goldOut: sa.gold, itemsOut: sa.items, goldIn: sb.gold, itemsIn: sb.items });
    db.ledgerAdd(b.id, { kind: 'trade', other: { id: a.id, name: a.name, kind: a.kind }, goldOut: sb.gold, itemsOut: sb.items, goldIn: sa.gold, itemsIn: sa.items });
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
  // keep: 이미 건 제안을 살려 둘지 볼 때. 원정에 따라간 건 잠깐이라 제안을 지우지 않음 (돌아오면 데려갈 수 있음)
  function adoptWhy(k, now = Date.now(), keep = false) {
    if (!k) return '그 식구는 이제 둥지에 없다.';
    if (k.status === 'egg') return null;
    if (k.type !== 'human' || k.status !== 'home') return '알이나 인간 아이만 입양 보낼 수 있다.';
    if (k.data.path || (now - k.data.born) / DAY >= KIN.human.adultDay) return '이미 다 자라 제 갈 길을 정할 때가 되었다.';
    if (k.data.onExp && !keep) return '원정에 따라가 있는 동안에는 보낼 수 없다.';
    return null;
  }
  const kinWhat = (k) => (k.status === 'egg' ? `${KINDS[k.data.kind]?.name || ''}의 알 ${k.name}` : `인간 아이 ${k.name}`);
  const kinBrief = (k, now) => ({ id: k.id, name: k.name, type: k.type, egg: k.status === 'egg', kind: k.data.kind || null, stage: life.stageOf(k, now).name, away: !!k.data.onExp });
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
    const why = adoptWhy(k, now, true);
    if (why) {
      // 더는 보낼 수 없게 됨: 양쪽에 알리고 지움 (예전엔 말없이 사라졌음)
      db.offerDel(o.id);
      const name = k ? k.name : '그 식구';
      adoptTell(o.from_id, `${name}의 입양 제안이 취소되었다. ${why}`, 'kin:offer:gone', { id: o.id });
      adoptTell(o.to_id, `${name}의 입양 제안이 취소되었다. ${why}`, 'kin:offer:gone', { id: o.id });
      return null;
    }
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
    // p.id가 상대 드래곤인 요청들 (시험용 드래곤이면 막음)
    const TARGETED = new Set(['rel:request', 'rel:accept', 'rel:decline', 'rel:cancel', 'rel:unfriend', 'rel:mark', 'rel:memo', 'heal:other', 'rel:teach', 'kin:offer', 'gift:send', 'tp:open', 'tp:send', 'tp:heard', 'trade:invite', 'fest:invite']);
    const READ_ONLY = new Set(['dragon:profile', 'fest:get', 'rel:list', 'rel:map', 'gift:inbox', 'gift:seen', 'ledger:list', 'tp:threads', 'tp:open', 'tp:heard']);
    const on = (event, fn) => socket.on(event, (payload, ack) => {
      if (typeof ack !== 'function') ack = () => {};
      const d = me();
      if (!d) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
      const now = Date.now();
      // GM 시험용 투명 드래곤: 보기(목록·프로필)만 되고, 주고받기·관계·말 걸기·춤 등은 양쪽 모두 막음
      if (!READ_ONLY.has(event)) {
        if (isTestDragon(d)) return ack({ error: '시험용 드래곤은 다른 드래곤과 어울릴 수 없다.' });
        if (TARGETED.has(event) && isTestDragon(db.getDragon(Number(payload?.id)))) return ack({ error: '시험용 드래곤과는 어울릴 수 없다.' });
      }
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
    // 관계도: 서로 맺은 관계와 라이벌·원수 (혼자 붙이는 경계는 보내지 않음). 긴 잠에 든 드래곤·시험용은 빼고
    // 공개는 고른 드래곤만: 남들 사이의 관계는 두 드래곤이 모두 '관계도에 보이기'를 켰을 때만 보임.
    // 내가 맺은 관계는 늘 나에게 보임 (상대가 공개하지 않았어도). 공개하지 않은 드래곤은 내 상대가 아니면 아예 보내지 않음
    on('rel:map', (d) => {
      const all = db.mapDragons().filter((x) => !isTestDragon(x));
      const pub = new Set(all.filter((x) => x.map_public).map((x) => x.id));
      const alive = new Set(all.map((x) => x.id));
      const seen = (a, b) => alive.has(a) && alive.has(b) && (a === d.id || b === d.id || (pub.has(a) && pub.has(b)));
      const pairs = db.mapBonds().filter((r) => seen(r.a, r.b)).map((r) => [r.a, r.b, r.bond || 'comrade']);
      // 라이벌·원수: [표시한 쪽, 표시된 쪽, 'rival'|'nemesis']. 서로 라이벌이면 한 줄로 [a, b, 'rival2'](숙적), 서로 원수면 'nemesis2'
      const marks = new Map();
      for (const r of db.mapMarks()) {
        if (!seen(r.a, r.b)) continue;
        const back = marks.get(`${r.b}-${r.a}`);
        if (back && back[2] === r.kind) back[2] = `${r.kind}2`;
        else marks.set(`${r.a}-${r.b}`, [r.a, r.b, r.kind]);
      }
      pairs.push(...marks.values());
      const keep = new Set([d.id, ...pub]);
      for (const [a, b] of pairs) { keep.add(a); keep.add(b); }
      const dragons = all.filter((x) => keep.has(x.id))
        .map((x) => ({ id: x.id, name: x.name, kind: x.kind, level: x.level, av: x.has_avatar ? x.avatar_ver : 0, pub: !!x.map_public }));
      return { ok: true, dragons, pairs, mine: db.mapPublic(d.id) };
    });
    on('rel:mapPublic', (d, p) => {
      db.setMapPublic(d.id, !!p.on);
      return { ok: true, on: !!p.on };
    });

    // 동료 요청. 상대도 이미 요청을 보냈다면 바로 맺어짐
    // 관계 청하기: p.bond = 상대가 나에게 무엇이 되었으면 하는지 (없으면 동료). 이미 맺은 사이면 관계를 바꾸자는 청
    on('rel:request', (d, p) => {
      const id = target(p);
      if (!id || id === d.id) return { error: '그런 드래곤은 없다.' };
      const bond = BONDS[p.bond] ? p.bond : 'comrade';
      const why = bondWhy(d.id, id, bond);
      if (why) return { error: why };
      const name = db.getDragon(id).name;
      // 상대도 같은 관계를 청해 두었으면 바로 맺어짐
      if (db.reqBond(id, d.id) === invOf(bond)) {
        const gone = bondMake(id, d.id, invOf(bond));
        const text = `${ga(d.name)} 청을 받아들였다. ${becameText(d.name, invOf(bond)).replace(`${d.name}${josa(d.name, '과', '와')} `, '이제 ')}${gone.a ? ` ${gone.a}` : ''}`;
        if (live(id)) tell(id, 'notice', { title: '관계', lines: [text] }); else db.noteAdd(id, text);
        relChanged(id);
        return { ok: true, lines: [becameText(name, bond), ...(gone.b ? [gone.b] : [])] };
      }
      db.reqAddBond(d.id, id, bond);
      // 붙여 둔 라이벌·경계·원수 표시는 관계가 실제로 맺어질 때 지움 (그때 기록·알림에 남김. 거절되면 표시는 그대로)
      const text = `${ga(d.name)} ${BONDS[bond].ask}. 동료 메뉴에서 받아들일 수 있다.`;
      if (live(id)) tell(id, 'notice', { title: '관계 요청', lines: [text] }); else db.noteAdd(id, text);
      relChanged(id);
      return { ok: true, lines: [`${name}에게 '${BONDS[bond].label}' 청을 보냈다.`] };
    });
    on('rel:accept', (d, p) => {
      const id = target(p);
      const bond = id && db.reqBond(id, d.id); // 청한 쪽에게 내가 무엇이 되는지
      if (!bond) return { error: '받은 요청이 없다.' };
      const why = bondWhy(id, d.id, bond);
      if (why) return { error: why };
      const gone = bondMake(id, d.id, bond);
      const name = db.getDragon(id).name;
      const text = `${ga(d.name)} 청을 받아들였다. ${becameText(d.name, bond).replace(`${d.name}${josa(d.name, '과', '와')} `, '이제 ')}${gone.a ? ` ${gone.a}` : ''}`;
      if (live(id)) tell(id, 'notice', { title: '관계', lines: [text] }); else db.noteAdd(id, text);
      relChanged(id);
      return { ok: true, lines: [becameText(name, invOf(bond)), ...(gone.b ? [gone.b] : [])] };
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
      if (!id || !isFriend(d.id, id)) return { error: '맺은 관계가 없다.' };
      const was = bondName(db.relBond(d.id, id));
      db.unfriend(d.id, id);
      relChanged(id);
      const name = db.getDragon(id).name;
      const text = `${ga(d.name)} ${was} 관계를 끊었다.`;
      if (live(id)) tell(id, 'notice', { title: '관계', lines: [text] }); else db.noteAdd(id, text);
      logic.chron(d, 'mark', `${name}${josa(name, '과', '와')}의 ${was} 관계를 끊었다.`); db.saveState(d);
      return { ok: true, lines: [`${name}${josa(name, '과', '와')}의 ${was} 관계를 끊었다.`] };
    });
    // 라이벌·경계: 혼자 붙이는 표시. 동료에게는 붙일 수 없음 (먼저 끊어야 함)
    on('rel:mark', (d, p) => {
      const id = target(p);
      if (!id || id === d.id) return { error: '그런 드래곤은 없다.' };
      const kind = MARKS[p.kind] ? p.kind : null;
      if (isFriend(d.id, id)) return { error: '관계를 맺은 상대에게는 붙일 수 없다. 먼저 관계를 끊어야 한다.' };
      const name = db.getDragon(id).name;
      const was = db.relGet(d.id, id);
      if (!kind) {
        db.relDel(d.id, id);
        refreshRivals(d);
        if (was === 'rival') { tellRival(id, `${ga(d.name)} 라이벌 표시를 거두었다.`); relChanged(id); }
        if (was === 'nemesis') { tellRival(id, `${ga(d.name)} 원한을 내려놓았다.`, '원수'); relChanged(id); }
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
      // 원수: 상대에게도 알림 (결투에서 이기면 명성이 더 오름)
      if (kind === 'nemesis' && was !== 'nemesis') {
        logic.chron(d, 'choice', `${eul(name)} 원수로 삼았다.`);
        db.saveState(d);
        tellRival(id, `${ga(d.name)} 당신을 원수로 삼았다.`, '원수');
        relChanged(id);
      }
      return { ok: true, lines: [`${name}${josa(name, '을', '를')} ${kind === 'rival' ? '라이벌로' : kind === 'nemesis' ? '원수로' : '경계할 드래곤으로'} 표시했다.`] };
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

    // ── 가르치기: 스승이 같은 지역의 제자에게 (제자는 경험치, 스승은 명성) ──
    on('rel:teach', (d, p) => {
      const id = target(p);
      if (!id || db.relBond(d.id, id) !== 'student') return { error: '내 제자가 아니다.' };
      const T = BOND_RULES.teach;
      const t = loadD(id);
      if (!t || t.dead_at) return { error: '지금은 가르칠 수 없다.' };
      if (t.region !== d.region || d.exp_end || t.exp_end) return { error: '같은 지역에 함께 있어야 가르칠 수 있다.' };
      if (inBattle(d.id) || inBattle(id)) return { error: '싸우는 중에는 할 수 없다.' };
      const now = Date.now();
      const last = teachAt.get(`${d.id}:${id}`) || 0;
      if (now - last < T.cooldown) return { error: `${t.name}${josa(t.name, '은', '는')} 아직 배운 것을 익히는 중이다. (${Math.ceil((T.cooldown - (now - last)) / 60000)}분 뒤)` };
      logic.regen(d, now);
      if (d.ap < T.ap) return { error: `행동력이 모자란다. (${T.ap} 필요)` };
      if (d.en < T.en) return { error: `기력이 모자란다. (${T.en} 필요)` };
      logic.spendAp(d, T.ap);
      d.en -= T.en;
      teachAt.set(`${d.id}:${id}`, now);
      const xp = logic.xpOf(t, T.xpBase + d.level * T.xpPerLv);
      const up = logic.gainXp(t, xp);
      const lines = [`${t.name}에게 사냥과 숨결의 요령을 가르쳤다.`];
      lines.push(...logic.traitCount(d, 'teach'));
      const f = logic.addFame(d, T.fame); if (f) lines.push(f);
      const told = [`스승 ${ga(d.name)} 가르침을 주었다. 경험치 +${xp}${up ? ` · 레벨이 올랐다! Lv. ${t.level}` : ''}`];
      if (t.level >= d.level) { told.push(...logic.traitCount(t, 'surpass')); told.push(`스승 ${d.name}의 레벨을 따라잡았다!`); logic.chron(t, 'mark', `스승 ${d.name}의 레벨을 따라잡았다.`); }
      db.saveState(d); db.saveState(t);
      const e = live(id);
      if (e) { sendMe(e.socket, t); e.socket.emit('notice', { title: '가르침', lines: told }); } else for (const l of told) db.noteAdd(id, l);
      sendMe(socket, d);
      return { ok: true, lines };
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
      if (k.data.onExp) return { error: `${k.name}${josa(k.name, '은', '는')} 지금 ${f.name}의 원정에 따라가 있다. 돌아온 뒤에 데려올 수 있다.` };
      if (!d.nest) return { error: '데려오려면 내 둥지가 있어야 한다.' };
      if (!roomOf(d)) return { error: `내 둥지에는 이미 식구가 가득하다. (최대 ${logic.maxKinOf(d)})` };
      if (!db.kinMove(k.id, f.id, d.id)) { db.offerDel(o.id); return { error: '그 식구는 이미 떠났다.' }; }
      db.offerDel(o.id);
      // 새 둥지에서: 아이는 낯을 가려 유대가 줄고, 알은 다시 품어야 함 (식기까지의 날은 새로)
      const mine = db.kinLoad(d.id);
      const m = mine.find((x) => x.id === k.id);
      if (m) {
        m.data.adoptedFrom = f.name;
        m.data.adoptedFromId = f.id;
        m.data.adoptedAt = now; // 먼 둥지에서 온 안부: 입양 뒤 며칠 동안만 (game-events.js LETTER_DAYS)
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
    // ── 왕도 축제: 지금 축제 여부와 이 지역에서 함께 출 수 있는 드래곤 ──
    // 다음 축제가 시작하는 때 (축제가 아닐 때 화면이 그때 한 번만 다시 묻도록)
    const festNext = (now = Date.now()) => { for (let t = now; t < now + 8 * DAY; t += 3600000) { const h = Math.floor(t / 3600000) * 3600000; if (festivalNow(h)) return h; } return now + DAY; };
    on('fest:get', (d) => {
      const fest = festivalNow();
      if (!fest) return { ok: true, on: false, next: festNext(), region: FESTIVAL.region };
      const done = dancedWith(d, fest.key);
      const list = [];
      if (d.region === FESTIVAL.region) {
        for (const [id, e] of online) {
          if (id === d.id || e.dragon.region !== d.region) continue;
          list.push({ id, name: e.dragon.name, kind: e.dragon.kind, level: e.dragon.level, av: e.dragon.has_avatar ? e.dragon.avatar_ver : 0, done: done.includes(id), why: danceWhy(d, e.dragon, fest) });
        }
      }
      const kin = d.nest ? db.kinLoad(d.id) : [];
      const slot = nightOpen() ? 'night' : 'day', other = slot === 'night' ? 'day' : 'night';
      // 지금(낮 또는 야시장 밤) 데려갈 수 있는 식구 · 이미 다녀온 식구 · 다른 때(밤 또는 낮)에 아직 갈 수 있는 식구
      const kinFest = { slot, left: life.festKids(kin, fest, slot).length, done: life.festWent(kin, fest, slot).length, otherLeft: life.festKids(kin, fest, other).length };
      return { ok: true, on: true, here: d.region === FESTIVAL.region, until: fest.until, count: done.length, list, region: FESTIVAL.region, kinFest };
    });
    on('fest:invite', (d, p) => {
      const fest = festivalNow();
      const t = live(Number(p.id))?.dragon || null;
      const why = danceWhy(d, t, fest);
      if (why) return { error: why };
      for (const inv of festInvites.values()) {
        if (inv.from === d.id) return { error: '이미 춤을 청해 두었다. 답을 기다리자.' };
        if (inv.to === t.id) return { error: `${t.name}${josa(t.name, '은', '는')} 다른 드래곤의 청을 받고 있다.` };
      }
      const inv = { id: nextId++, from: d.id, to: t.id };
      inv.timer = setTimeout(() => {
        if (!festInvites.delete(inv.id)) return;
        tell(d.id, 'fest:declined', { name: t.name, reason: '답이 없었다.' });
        tell(t.id, 'fest:gone', { id: inv.id });
      }, FESTIVAL.inviteSeconds * 1000);
      inv.timer.unref?.();
      festInvites.set(inv.id, inv);
      tell(t.id, 'fest:invited', { id: inv.id, from: { id: d.id, name: d.name }, seconds: FESTIVAL.inviteSeconds });
      return { ok: true, lines: [`${t.name}에게 춤을 청했다. 답을 기다린다.`] };
    });
    on('fest:answer', (d, p) => {
      const inv = festInvites.get(Number(p.id));
      if (!inv || inv.to !== d.id) return { error: '그 청은 이미 지나갔다.' };
      festInvites.delete(inv.id);
      clearTimeout(inv.timer);
      const f = live(inv.from);
      if (!p.accept) { tell(inv.from, 'fest:declined', { name: d.name, reason: '정중히 사양했다.' }); return { ok: true }; }
      const fest = festivalNow();
      const why = danceWhy(d, f?.dragon || null, fest);
      if (why) { tell(inv.from, 'fest:declined', { name: d.name, reason: why }); return { error: why }; }
      const a = danceDone(f.dragon, d, fest), b = danceDone(d, f.dragon, fest);
      db.saveMany([[f.dragon, a.items], [d, b.items]]);
      for (const [x, r, sock] of [[f.dragon, a, f.socket], [d, b, socket]]) {
        sock.emit('notice', { title: '왕도 축제', lines: r.lines });
        sendMe(sock, x);
        sock.emit('fest:changed', {});
      }
      return { ok: true };
    });

    on('gift:send', (d, p) => {
      const id = target(p);
      if (!id) return { error: '그런 드래곤은 없다.' };
      const why = reach(d, id, { needOnline: false });
      if (why) return { error: why };
      const gold = Math.floor(Number(p.gold) || 0);
      const items = cleanItems(p.items);
      const msg = (typeof p.msg === 'string' ? p.msg : '').replace(/\s+/g, ' ').trim().slice(0, GIFT_MSG_MAX); // 함께 보내는 말
      // 함께 끼운 그림 한 장: 내가 올려 두고 아직 보내지 않은 것만. 그림만 보내도 됨
      const gi = Number(p.img) || 0, gm = gi ? db.giftImg.meta(gi) : null;
      if (gi && (!gm || gm.dragon_id !== d.id || gm.sent_at != null)) return { error: '끼울 그림을 찾지 못했다. 다시 넣어 보자.' };
      const imgT = (typeof p.imgTitle === 'string' ? p.imgTitle : '').replace(/\s+/g, ' ').trim().slice(0, 20); // 그림 이름 (보물 상자에 간직하면 이 이름으로)
      const img = gm ? { id: gm.id, key: gm.key, w: gm.w, h: gm.h, ...(imgT ? { t: imgT } : {}) } : null;
      if (!gold && !items.length && !img) return { error: '보낼 것을 골라야 한다.' };
      const bad = checkOffer(d, gold, items);
      if (bad) return { error: bad };
      const t = live(id);
      const name = t ? t.dragon.name : db.getDragon(id).name;
      const what = gold || items.length ? `${giveText(gold, items)}${img ? '과 그림' : ''}` : '그림 한 장';
      if (img) db.giftImg.send(img.id, id);
      d.gold -= gold;
      if (t) {
        t.dragon.gold += gold;
        db.saveMany([[d, items.map((x) => ({ id: x.id, qty: -x.qty }))], [t.dragon, items]]);
      } else {
        db.saveState(d, items.map((x) => ({ id: x.id, qty: -x.qty })));
        db.giftOffline(id, gold, items);
      }
      // 받은 선물 상자에 넣음: 받은 쪽이 '확인'을 누를 때까지 남는 알림 (접속하지 않았으면 다음 접속 때)
      const gid = db.giftIn(id, d, gold, items, msg, img);
      // 주고받은 기록 (선물)
      const to = t ? t.dragon : db.getDragon(id);
      db.ledgerAdd(d.id, { kind: 'gift_out', other: { id, name, kind: to?.kind }, goldOut: gold, itemsOut: items, msg, img });
      db.ledgerAdd(id, { kind: 'gift_in', other: { id: d.id, name: d.name, kind: d.kind }, goldIn: gold, itemsIn: items, msg, img });
      if (t) {
        t.socket.emit('gift:got', { id: gid, from: { id: d.id, name: d.name, kind: d.kind, av: avOf(d.id) }, gold, items, msg, img, at: Date.now() });
        sendMe(t.socket, t.dragon);
      }
      sendMe(socket, d);
      return { ok: true, lines: [`${name}에게 ${what}${josa(what, '을', '를')} 보냈다.${msg ? ' 함께 적은 말도 전해진다.' : ''}`] };
    });

    // 받은 선물 확인 (상자에서 지움)
    // keep: 함께 온 그림을 보물 상자에 간직 (둥지가 있어야 함. 간직하지 않은 그림은 주고받은 기록에서 90일 동안 보임)
    on('gift:seen', (d, p) => {
      const g = p.keep ? db.giftGet(Number(p.id), d.id) : null;
      let kept = false;
      if (g?.img) {
        if (!d.nest) return { error: '그림을 간직하려면 먼저 둥지를 틀어야 한다.' };
        kept = logic.chestAdd(d, 'gift_pic', g.fromName, g.msg || '', Date.now(), null, { img: g.img, src: 'got' });
        if (!kept) return { error: '보물 상자가 가득 찼다.' };
        db.giftImg.keep(g.img.id, d.id); db.saveState(d);
      }
      return { ok: db.giftSeen(Number(p.id), d.id), kept };
    });
    on('gift:inbox', (d) => ({ ok: true, list: db.giftList(d.id).map((g) => ({ ...g, from: { ...g.from, av: avOf(g.from.id) } })) }));
    // 주고받은 기록: 선물·교환·이벤트 선물·GM 지급 (최근 것부터)
    on('ledger:list', (d) => ({ ok: true, list: db.ledgerList(d.id, 150) }));

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

  return { attach, onEnter, onLeave, onMove, relIncoming: (id) => db.reqInCount(id), tellRival, refreshRivals, kinOffers, eventGift };
};
