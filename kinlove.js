// 다른 둥지 아이와 맺어지기 (서로의 첫사랑 → 어른이 되어 혼인 청 → 두 보호자가 허락하면 짝)
// - 첫사랑: 청소년 때 다른 둥지의 인간 단짝을 좋아하게 되면 k.data.loveRef = { owner, id, name, ownerName }
// - 서로의 첫사랑: 상대 아이의 loveRef도 이 아이를 가리킬 때
// - 혼인 청: 한쪽 보호자가 축복하면 상대 보호자에게 허락을 물음 (world 'kinLove'.offers, DAYS일 안에)
// - 맺어지면 두 아이 모두 data.mate = { name, at, home: 상대 둥지 주인 이름, ref: { owner, id } }. 각자 자기 둥지에 산다
// 새끼 드래곤도 같은 틀: 젊은 용 때 다른 둥지의 드래곤 단짝에게 마음을 둠(loveRef) → 둘 다 젊은 용 이상이면 짝을 청함 → 두 보호자가 허락하면 구애 비행을 하고 짝
//   (낯선 용 구애가 젊은 용부터 뜨는 것과 맞춤. 다 자란 용이 되는 날부터 독립시킬 수 있어서, 그 전에 짝을 맺을 틈이 있음)
//   (청에 drake: true. 둘 사이의 알은 '맡기러 온 알'에서 어느 둥지에서 품을지 정하고, 상대 둥지에 맡길 때는 아이와 같은 청(kind 'egg'))
const DAY = 86400000, DAYS = 2;
const { REGIONS, KINDS, KIN_PLAY } = require('./game-data');
// 중매: 두 보호자가 다른 둥지 아이끼리 만남을 주선 → 만남의 결과는 확률로. 성공하면 서로의 첫사랑이 되고, 그 뒤는 혼인 청·짝 청 흐름 그대로
// base 처음 보는 사이 · friend 함께 논 적 있음 · best 단짝 · loves 한쪽이 이미 상대를 좋아함 · other 한쪽 마음이 다른 데 가 있음(빼기) · retry 같은 둘을 다시 주선할 때마다 · cool 실패 뒤 같은 둘을 다시 주선하기까지
const MATCH = { base: 0.25, friend: 0.40, best: 0.60, loves: 0.20, other: 0.15, retry: 0.05, min: 0.05, max: 0.80, cool: 3 * 86400000 };
const josa = (w, a, b) => { const c = String(w).charCodeAt(String(w).length - 1) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 ? a : b; };

module.exports = function setupKinLove({ db, online, sendMe, life, logic, news, kinChanged }) {
  const st = db.worldGet('kinLove') || {};
  if (!Array.isArray(st.offers)) st.offers = [];
  if (!Array.isArray(st.babies)) st.babies = [];
  if (!Array.isArray(st.matches)) st.matches = []; // 중매 청 (받은 쪽 보호자가 답하기를 기다림)
  if (!st.matchTry || typeof st.matchTry !== 'object') st.matchTry = {}; // 두 아이 사이의 중매 기록 { n: 주선한 횟수, cool: 다시 주선할 수 있는 때 } // 짝 사이의 아이를 두고 둥지끼리 의논하는 청 (raise: 짝의 둥지에서 키우기 · village: 마을에 가정을 꾸리기)
  const save = () => db.worldSet('kinLove', st);
  const live = (id) => online.get(id) || null;
  const tell = (id, lines, ev, data) => {
    const e = live(id);
    if (e) { e.socket.emit('notice', { title: '둥지 소식', lines }); if (ev) e.socket.emit(ev, data || {}); }
    else for (const l of lines) db.noteAdd(id, l);
  };
  const adult = (k, now = Date.now()) => (k.type === 'drake' ? ['젊은 용', '다 자란 용'] : ['어른', '노년']).includes(life.stageOf(k, now).name); // 짝을 맺을 수 있는 나이
  const homeKid = (owner, id) => { const kin = db.kinLoad(owner); return { kin, k: kin.find((x) => x.id === id && x.status === 'home' && (x.type === 'human' || x.type === 'drake')) || null }; };
  const ownerName = (id) => db.getDragon(id)?.name || '';
  // 첫사랑이 다른 둥지 아이인지: 새 기록(loveRef)이 없으면, 예전 기록(이름만 적힌 firstLove)을 단짝 목록에서 찾아 맞춰 봄
  // (이 기능 전에 첫사랑이 정해진 청소년·어른도 서로의 첫사랑이면 맺어질 수 있게)
  // 동명이인: 같은 이름의 단짝이 여럿이면, 그 가운데 이 아이를 첫사랑으로 둔(그리고 이 아이와 단짝인) 아이가 꼭 하나일 때만 이음. 아니면 잇지 않음
  // owner: 이 아이가 사는 둥지의 주인 id
  const friendKey = (owner, id) => `${owner}:${id}`;
  function refOf(k, owner) {
    if (!k?.data) return null;
    if (k.data.loveRef) return k.data.loveRef;
    const nm = k.data.firstLove;
    if (!nm || nm === '-' || k.type !== 'human') return null;
    const cands = Object.entries(k.data.friends || {}).filter(([, x]) => x.type === 'human' && x.name === nm)
      .map(([key, f]) => ({ owner: f.ownerId, id: Number(String(key).split(':')[1]), name: f.name, ownerName: f.owner || '', old: true }))
      .filter((r) => r.owner && r.id);
    if (!cands.length) return null; // 마을 아이가 첫사랑
    if (owner == null) return cands.length === 1 ? cands[0] : null;
    const back = cands.filter((r) => {
      const { k: o } = homeKid(r.owner, r.id);
      if (!o || !o.data.friends?.[friendKey(owner, k.id)]) return false; // 그 아이도 이 아이와 단짝이어야 함
      return o.data.loveRef ? o.data.loveRef.owner === owner && o.data.loveRef.id === k.id : o.data.firstLove === k.name;
    });
    if (back.length === 1) return back[0];
    return cands.length === 1 ? cands[0] : null; // 같은 이름이 여럿인데 서로 좋아하는 아이를 하나로 고를 수 없으면 잇지 않음
  }
  // k(둥지 주인 kOwner)의 첫사랑이 (owner, id) 아이인지
  const points = (k, kOwner, owner, id) => { const r = refOf(k, kOwner); return !!r && !r.declined && !r.ended && r.owner === owner && r.id === id; };

  // 지난 제안 치우기 (답이 없이 기한이 지나면 사양한 것처럼: 보낸 쪽 아이는 사흘 뒤에 다시 짝을 찾을 수 있음)
  function sweep(now = Date.now()) {
    const keep = [];
    for (const o of st.offers) {
      if (now < o.until) { keep.push(o); continue; }
      const { kin, k } = homeKid(o.from.owner, o.from.kin);
      if (k) { k.data.mateNo = now; kinChanged(o.from.owner, kin); }
      tell(o.from.owner, [`${o.to.ownerName}에게서 ${o.from.name}의 혼인 청에 답이 오지 않았다. 다음에 다시 청해 볼 수 있다.`]);
    }
    if (keep.length !== st.offers.length) { st.offers = keep; save(); }
  }
  const pendingOf = (kinId) => st.offers.find((o) => o.from.kin === kinId || o.to.kin === kinId) || null;

  // 이벤트에서 씀: 이 아이의 첫사랑이 지금 어떤지
  // { name, ownerName, mutual: 서로의 첫사랑, adult: 상대가 어른, free: 상대에게 짝이 없음, pending: 혼인 청을 기다리는 중 } | null(첫사랑이 다른 둥지 아이가 아님) | { gone }
  function status(owner, k) {
    if (!k.data.loveRef) { const d = refOf(k, owner); if (d) k.data.loveRef = d; } // 예전 기록이면 이 자리에서 새 기록으로 옮겨 적음 (이벤트가 끝나면 저장됨)
    const r = k.data.loveRef;
    if (!r || r.declined || r.ended) return null;
    sweep();
    const { k: o } = homeKid(r.owner, r.id);
    if (!o) return { gone: true, name: r.name, ownerName: r.ownerName || '' };
    const mutual = points(o, r.owner, owner, k.id);
    // otherLove: 상대 아이의 첫사랑 — 'us' 이 아이 · 'else' 다른 사람 · 'none' 아직 정하지 않음
    const ol = refOf(o, r.owner);
    const otherLove = mutual ? 'us' : (ol || (o.data.firstLove && o.data.firstLove !== '-')) ? 'else' : 'none'; // '-'(보호자가 막음)는 아직 정하지 않은 것으로
    const mateUs = !!o.data.mate?.ref && o.data.mate.ref.owner === owner && o.data.mate.ref.id === k.id;
    // late: 상대가 마음을 정할 때(인간 청소년·젊은 용)가 지남 — 아직 정하지 않았으면 이제는 정하지 않을 것으로 봄
    const late = o.type === 'drake' ? life.stageOf(o).name === '다 자란 용' : adult(o);
    return { name: o.name, ownerName: ownerName(r.owner) || r.ownerName || '', mutual, otherLove, mateUs, adult: adult(o), late, free: !o.data.mate, pending: !!pendingOf(k.id) || !!pendingOf(o.id), match: !!r.match };
  }
  // 첫사랑을 정할 때: 상대 아이도 이미 이 아이를 좋아하는지
  function lovesBack(owner, kinId, ref) { const { k: o } = homeKid(ref.owner, ref.id); return points(o, ref.owner, owner, kinId); }

  // 혼인 청 (보낸 쪽 보호자가 이벤트에서 축복했을 때)
  function ask(d, info, now = Date.now()) {
    const r = info.ref;
    if (!r || pendingOf(info.id)) return;
    const o = { id: now + Math.floor(Math.random() * 1000), at: now, until: now + DAYS * DAY, drake: !!info.drake, match: !!r.match,
      from: { owner: d.id, ownerName: d.name, kin: info.id, name: info.name },
      to: { owner: r.owner, ownerName: ownerName(r.owner) || r.ownerName || '', kin: r.id, name: r.name } };
    st.offers.push(o); save();
    tell(r.owner, [o.drake
      ? `${d.name}${josa(d.name, '이', '가')} 짝을 청해 왔다. ${info.name}${josa(info.name, '과', '와')} 당신의 둥지 ${r.name}${josa(r.name, '이', '가')} 구애 비행을 하고 짝이 되기를 바란다. 둥지에서 허락할지 정할 수 있다. (${DAYS}일 안에)`
      : `${d.name}${josa(d.name, '이', '가')} 혼인을 청해 왔다. ${info.name}${josa(info.name, '과', '와')} 당신의 둥지 ${r.name}${josa(r.name, '이', '가')} 함께하기를 바란다. 둥지에서 허락할지 정할 수 있다. (${DAYS}일 안에)`], 'kinlove:got', { from: d.name, a: info.name, b: r.name, drake: o.drake });
  }

  // ── 짝 사이의 아이: 어디에서 키울지 두 둥지가 의논 ──
  const dragonOf = (id) => { const e = live(id); return e ? e.dragon : db.getDragon(id); };
  const kidWord = (o) => (o.found ? '데려온 아이' : '태어난 아이');
  // 청을 보냄 (아이가 생긴 쪽 보호자가 이벤트에서 고름)
  function babyAsk(d, info, now = Date.now()) {
    const r = info.ref;
    if (!r || !['raise', 'village', 'egg'].includes(info.kind)) return;
    const o = { id: now + Math.floor(Math.random() * 1000), at: now, until: now + DAYS * DAY, kind: info.kind, baby: info.baby, found: !!info.found, town: info.town,
      from: { owner: d.id, ownerName: d.name, kin: info.id, name: info.name },
      to: { owner: r.owner, ownerName: ownerName(r.owner) || '', kin: r.id, name: info.mate } };
    if (o.kind === 'egg') { // 새끼 드래곤 짝 사이의 알: baby에는 알의 종류가 옴
      o.egg = KINDS[info.baby] ? info.baby : 'red'; o.baby = `${KINDS[o.egg].name}의 알`;
      st.babies.push(o); save();
      eggShared(r, now, o.found ? `짝 ${info.name}${josa(info.name, '과', '와')} 함께 주인 잃은 알을 찾아왔다. 이 둥지에서 품어 달라는 청이 왔다.` : `짝 ${info.name}${josa(info.name, '과', '와')}의 사이에 알이 생겼다. 이 둥지에서 품어 달라는 청이 왔다.`);
      { const e = live(r.owner); if (e) sendMe(e.socket, e.dragon); }
      tell(r.owner, [`${d.name}의 둥지 ${info.name}${josa(info.name, '과', '와')} 당신의 둥지 ${info.mate} 사이의 ${o.baby}${josa(o.baby, '을', '를')} 당신의 둥지에서 품어 주기를 ${d.name}${josa(d.name, '이', '가')} 청했다. 둥지에서 정할 수 있다. (${DAYS}일 안에)`], 'kinbaby:got', { from: d.name, baby: o.baby, kind: o.kind });
      return;
    }
    st.babies.push(o); save();
    // 짝 쪽 기록에도 자녀를 적어 둠 (두 둥지가 아이 수를 함께 세서, 답을 기다리는 사이 겹쳐 태어나지 않게)
    babyShared(r, info.baby, now, o.found ? `짝 ${info.name}${josa(info.name, '과', '와')} 함께 길 잃은 아이 ${info.baby}${josa(info.baby, '을', '를')} 데려왔다.` : `짝 ${info.name}${josa(info.name, '과', '와')}의 사이에 아이 ${info.baby}${josa(info.baby, '이', '가')} 태어났다.`);
    const what = o.kind === 'raise' ? `${info.baby}${josa(info.baby, '을', '를')} 당신의 둥지에서 키워 주기를 바란다` : `두 사람이 ${info.baby}${josa(info.baby, '과', '와')} 함께 마을로 내려가 가정을 꾸리기를 바란다`;
    { const e = live(r.owner); if (e) sendMe(e.socket, e.dragon); } // 받은 쪽 '둥지' 메뉴에 붉은 점
    tell(r.owner, [`${d.name}의 둥지 ${info.name}${josa(info.name, '과', '와')} 당신의 둥지 ${info.mate} 사이에 ${kidWord(o)} ${info.baby}의 일로 ${d.name}${josa(d.name, '이', '가')} 청을 보냈다. ${what}. 둥지에서 정할 수 있다. (${DAYS}일 안에)`], 'kinbaby:got', { from: d.name, baby: info.baby, kind: o.kind });
  }
  // 사양하거나 답이 없을 때: 아이는 청을 보낸 둥지에서 자람 (자리가 없으면 마을 이웃에게 맡겨짐)
  function babyFallback(o, why, now = Date.now()) {
    const A = homeKid(o.from.owner, o.from.kin), p = dragonOf(o.from.owner);
    const head = why === 'no' ? `${o.to.ownerName}${josa(o.to.ownerName, '이', '가')} 청을 정중히 사양했다.`
      : o.kind === 'egg' ? `${o.to.ownerName}에게서 ${o.baby}${josa(o.baby, '을', '를')} 맡아 달라는 청에 답이 오지 않았다.` : `${o.to.ownerName}에게서 ${o.baby}의 일에 답이 오지 않았다.`;
    if (o.kind === 'egg') { // 알은 청을 보낸 둥지에서 품음 (자리가 없으면 두 용이 직접 품음)
      const kin = A.k ? A.kin : db.kinLoad(o.from.owner);
      const egg = p && life.layEgg(kin, p, o.egg, [o.from.name, o.to.name], now);
      if (A.k) life.diary(A.k, egg ? `${o.baby}${josa(o.baby, '은', '는')} 이 둥지에서 품게 되었다.` : `둥지에 빈자리가 없어 ${o.baby}${josa(o.baby, '은', '는')} 짝과 둘이서 직접 품기로 했다.`, now);
      if (egg || A.k) kinChanged(o.from.owner, kin);
      tell(o.from.owner, [head, egg ? `${o.baby}${josa(o.baby, '은', '는')} 이 둥지에서 품는다.` : `둥지에 빈자리가 없어 ${o.from.name}${josa(o.from.name, '과', '와')} ${o.to.name}${josa(o.to.name, '이', '가')} 알을 직접 품기로 했다.`], 'kinlove:gone');
      return;
    }
    const kid = A.k && p && life.bornKid(A.kin, p, [o.from.name, o.to.name], o.baby, o.found, o.town, now);
    if (kid) {
      if (A.k) life.diary(A.k, `${o.baby}${josa(o.baby, '은', '는')} 이 둥지에서 자라게 되었다.`, now);
      kinChanged(o.from.owner, A.kin);
      tell(o.from.owner, [head, `${o.baby}${josa(o.baby, '은', '는')} 이 둥지에서 아기 식구로 자란다.`], 'kinlove:gone');
    } else {
      if (A.k) { life.diary(A.k, `${o.baby}${josa(o.baby, '은', '는')} 마을의 이웃 손에 맡겨졌다.`, now); kinChanged(o.from.owner, A.kin); }
      tell(o.from.owner, [head, `둥지에 빈자리가 없어 ${o.baby}${josa(o.baby, '은', '는')} 마을의 이웃 손에 맡겨졌다.`], 'kinlove:gone');
    }
  }
  function babySweep(now = Date.now()) {
    const left = st.babies.filter((o) => now >= o.until);
    if (!left.length) return;
    st.babies = st.babies.filter((o) => now < o.until); save();
    for (const o of left) babyFallback(o, 'late', now);
  }
  // 받은 쪽 보호자의 답
  function babyAnswer(d, id, yes, now = Date.now()) {
    babySweep(now);
    const o = st.babies.find((x) => x.id === Number(id) && x.to.owner === d.id);
    if (!o) return { error: '그 청은 이미 지나갔다.' };
    const drop = () => { st.babies = st.babies.filter((x) => x !== o); save(); };
    if (!yes) { drop(); babyFallback(o, 'no', now); return { ok: true, lines: [`${o.from.ownerName}의 청을 정중히 사양했다. ${o.baby}${josa(o.baby, '은', '는')} ${o.from.ownerName}의 둥지에서 ${o.kind === 'egg' ? '품는다' : '자란다'}.`] }; }
    const A = homeKid(o.from.owner, o.from.kin), B = homeKid(d.id, o.to.kin);
    if (o.kind === 'egg') {
      const egg = life.layEgg(B.kin, d, o.egg, [o.to.name, o.from.name], now);
      if (!egg) return { error: '둥지에 빈자리가 없다. 자리를 만든 뒤에 받아들이거나, 사양할 수 있다.' };
      drop();
      if (B.k) life.diary(B.k, `짝과의 사이의 ${o.baby}${josa(o.baby, '을', '를')} 이 둥지에서 품게 되었다.`, now);
      if (A.k) { life.diary(A.k, `${o.baby}${josa(o.baby, '은', '는')} ${d.name}의 둥지에서 품게 되었다.`, now); kinChanged(o.from.owner, A.kin); }
      kinChanged(d.id, B.kin);
      tell(o.from.owner, [`${d.name}${josa(d.name, '이', '가')} ${o.baby}${josa(o.baby, '을', '를')} 맡아 품기로 했다. 알은 ${d.name}의 둥지에서 깨어난다.`], 'kinlove:gone');
      return { ok: true, lines: [`${o.baby}${josa(o.baby, '을', '를')} 둥지에 들였다. 품어 주면 깨어난다.`] };
    }
    if (o.kind === 'raise') {
      const kid = life.bornKid(B.kin, d, [o.to.name, o.from.name], o.baby, o.found, o.town, now);
      if (!kid) return { error: '둥지에 빈자리가 없다. 자리를 만든 뒤에 받아들이거나, 사양할 수 있다.' };
      drop();
      if (B.k) life.diary(B.k, `짝과의 아이 ${o.baby}${josa(o.baby, '을', '를')} 이 둥지에서 키우게 되었다.`, now);
      if (A.k) { life.diary(A.k, `${o.baby}${josa(o.baby, '은', '는')} ${d.name}의 둥지에서 자라게 되었다.`, now); kinChanged(o.from.owner, A.kin); }
      kinChanged(d.id, B.kin);
      tell(o.from.owner, [`${d.name}${josa(d.name, '이', '가')} ${o.baby}${josa(o.baby, '을', '를')} 맡아 키우기로 했다. 아이는 ${d.name}의 둥지에서 자란다.`], 'kinlove:gone');
      return { ok: true, lines: [`${o.baby}${josa(o.baby, '이', '가')} 둥지의 아기 식구가 되었다.`] };
    }
    // village: 두 사람이 아이와 함께 마을로 내려가 가정을 꾸림 (두 둥지 모두 식구를 떠나보냄)
    if (!A.k || !B.k) { drop(); babyFallback(o, 'no', now); return { error: '두 사람 가운데 한 사람이 이제 둥지에 없다. 아이는 청을 보낸 둥지에서 자란다.' }; }
    drop();
    const town = REGIONS[o.town] ? o.town : 'capital', tn = REGIONS[town].name;
    for (const [ow, mine, other, kinList] of [[o.from.owner, A.k, B.k, A.kin], [d.id, B.k, A.k, B.kin]]) {
      life.diary(mine, `${other.name}, ${o.baby}${josa(o.baby, '과', '와')} 함께 ${tn}에서 새 가정을 꾸렸다.`, now);
      mine.status = 'returned'; mine.data.ended = now; mine.data.family = town; // 지난 식구 목록: '○○에 가정을 꾸렸다'
      kinChanged(ow, kinList);
      const e = live(ow); const p = e ? e.dragon : db.getDragon(ow);
      if (p) {
        logic.addRep(p, town, 15); logic.addFame(p, 2); logic.traitCount(p, 'sendoff');
        logic.chron(p, 'mark', `${mine.name}${josa(mine.name, '이', '가')} ${other.name}, ${o.baby}${josa(o.baby, '과', '와')} 함께 ${tn}에 새 가정을 꾸렸다.`, now);
        db.saveState(p); if (e) sendMe(e.socket, p);
      }
    }
    news(`${o.from.ownerName}의 둥지 ${A.k.name}${josa(A.k.name, '과', '와')} ${d.name}의 둥지 ${B.k.name}${josa(B.k.name, '이', '가')} 아이 ${o.baby}${josa(o.baby, '과', '와')} 함께 ${tn}에 새 가정을 꾸렸다.`);
    tell(o.from.owner, [`${d.name}${josa(d.name, '이', '가')} 청을 받아들였다. ${A.k.name}${josa(A.k.name, '과', '와')} ${B.k.name}${josa(B.k.name, '이', '가')} ${o.baby}${josa(o.baby, '과', '와')} 함께 ${tn}${josa(tn, '으로', '로')} 내려갔다. (${tn} 평판 +15, 용족 명성 +2)`], 'kinlove:gone');
    return { ok: true, lines: [`청을 받아들였다. ${B.k.name}${josa(B.k.name, '과', '와')} ${A.k.name}${josa(A.k.name, '이', '가')} ${o.baby}${josa(o.baby, '과', '와')} 함께 ${tn}${josa(tn, '으로', '로')} 내려갔다. (${tn} 평판 +15, 용족 명성 +2)`] };
  }

  // 둥지 창에 보일 것: 받은 혼인 청 · 보낸 혼인 청 · 아이를 두고 받은 청 · 보낸 청
  function view(d, now = Date.now()) {
    sweep(now); babySweep(now);
    const bv = (o) => ({ id: o.id, until: o.until, kind: o.kind, baby: o.baby, found: o.found, from: o.from, to: o.to });
    return {
      ...matchView(d, now), // 중매 청 (받은 것·보낸 것)
      in: st.offers.filter((o) => o.to.owner === d.id).map((o) => ({ id: o.id, until: o.until, from: o.from, to: o.to, drake: !!o.drake, match: !!o.match })),
      out: st.offers.filter((o) => o.from.owner === d.id).map((o) => ({ id: o.id, until: o.until, kin: o.from.kin, to: o.to, drake: !!o.drake })),
      babyIn: st.babies.filter((o) => o.to.owner === d.id).map(bv),
      babyOut: st.babies.filter((o) => o.from.owner === d.id).map(bv),
    };
  }

  // 받은 쪽 보호자의 답
  function answer(d, id, yes, now = Date.now()) {
    sweep(now);
    const o = st.offers.find((x) => x.id === Number(id) && x.to.owner === d.id);
    if (!o) return { error: '그 혼인 청은 이미 지나갔다.' };
    const A = homeKid(o.from.owner, o.from.kin), B = homeKid(d.id, o.to.kin);
    const drop = () => { st.offers = st.offers.filter((x) => x !== o); save(); };
    const dk = !!o.drake, two = dk ? '두 용' : '두 아이', what = dk ? '짝을 맺자는 청' : '혼인 청';
    if (!A.k || !B.k) { drop(); return { error: `${two} 가운데 하나가 이제 둥지에 없다.` }; }
    const a = A.k, b = B.k;
    if (!yes) {
      drop();
      a.data.mateNo = now; a.data.loveRef.declined = now;
      a.data.heartbreak = { why: 'declined', name: b.name, home: d.name, at: now }; // 실연 이벤트 ('첫사랑의 끝' · '엇갈린 마음')가 뜸
      kinChanged(o.from.owner, A.kin);
      tell(o.from.owner, [dk
        ? `${d.name}${josa(d.name, '이', '가')} ${what}${josa(what, '을', '를')} 정중히 사양했다. ${a.name}${josa(a.name, '은', '는')} 한동안 하늘만 올려다보더니, 마음에 둔 용을 가슴에 묻었다.`
        : `${d.name}${josa(d.name, '이', '가')} 혼인 청을 정중히 사양했다. ${a.name}${josa(a.name, '은', '는')} 한동안 말이 없더니, 첫사랑을 마음에 묻었다.`], 'kinlove:gone');
      return { ok: true, lines: [`${o.from.ownerName}의 ${what}${josa(what, '을', '를')} 정중히 사양했다.`] };
    }
    if (a.data.mate || b.data.mate) { drop(); return { error: `${two} 가운데 하나에게 이미 짝이 있다.` }; }
    if (!adult(a, now) || !adult(b, now)) return { error: dk ? '두 용이 모두 젊은 용이 되어야 짝이 될 수 있다.' : '두 아이가 모두 어른이 되어야 맺어질 수 있다.' };
    drop();
    const F = o.from.ownerName, T = d.name;
    a.data.mate = { name: b.name, at: now, home: T, sex: b.data.sex || null, ref: { owner: d.id, id: b.id } }; // sex: 같은 성별이면 아이 이벤트가 없음
    b.data.mate = { name: a.name, at: now, home: F, sex: a.data.sex || null, ref: { owner: o.from.owner, id: a.id } };
    if (dk) { a.data.mate.kind = b.data.kind; b.data.mate.kind = a.data.kind; } // 짝의 종류 (알의 종류·식구 카드)
    life.addBond(a, 10); life.addBond(b, 10);
    const whom = (x, home) => (o.match ? `중매로 만난 ${home}의 둥지 ${x.name}` : `${home}의 둥지에 사는 ${dk ? '단짝' : '첫사랑'} ${x.name}`);
    const line = (x, home) => (dk
      ? `${whom(x, home)}${josa(x.name, '과', '와')} 구름 위까지 나란히 날아오르는 구애 비행을 하고 짝이 되었다. 두 둥지가 함께 축복했다.`
      : `${whom(x, home)}${josa(x.name, '과', '와')} 맺어졌다. 두 둥지가 함께 축복했다.`);
    life.diary(a, line(b, T), now);
    life.diary(b, line(a, F), now);
    kinChanged(o.from.owner, A.kin);
    kinChanged(d.id, B.kin);
    for (const [ow, mine, other, home] of [[o.from.owner, a, b, T], [d.id, b, a, F]]) {
      const e = live(ow); const p = e ? e.dragon : db.getDragon(ow);
      if (p) { logic.chron(p, 'mark', `${mine.name}${josa(mine.name, '이', '가')} ${home}의 둥지 ${other.name}${josa(other.name, '과', '와')} ${dk ? '짝이 되었다' : '맺어졌다'}.`, now); db.saveState(p); if (e) sendMe(e.socket, p); }
    }
    if (dk) {
      news(`${F}의 둥지 ${a.name}${josa(a.name, '과', '와')} ${T}의 둥지 ${b.name}${josa(b.name, '이', '가')} 구애 비행을 하고 짝이 되었다. ${o.match ? '중매로 만난 사이였다고 한다.' : '어릴 적부터 함께 날던 단짝이었다고 한다.'}`);
      tell(o.from.owner, [`${T}${josa(T, '이', '가')} 짝을 허락했다. ${a.name}${josa(a.name, '과', '와')} ${b.name}${josa(b.name, '이', '가')} 구름 위까지 나란히 날아올랐다가, 날개를 맞댄 채 내려왔다. 두 용은 각자의 둥지에 살며 서로 오간다. (${a.name} 유대 +10)`], 'kinlove:gone');
      return { ok: true, lines: [`짝을 허락했다. ${b.name}${josa(b.name, '과', '와')} ${a.name}${josa(a.name, '이', '가')} 구름 위까지 나란히 날아올랐다가, 날개를 맞댄 채 내려왔다. 두 용은 각자의 둥지에 살며 서로 오간다. (${b.name} 유대 +10)`] };
    }
    news(`${F}의 둥지 ${a.name}${josa(a.name, '과', '와')} ${T}의 둥지 ${b.name}${josa(b.name, '이', '가')} 맺어졌다. ${o.match ? '중매로 만난 사이였다고 한다.' : '서로의 첫사랑이었다고 한다.'}`);
    tell(o.from.owner, [`${T}${josa(T, '이', '가')} 혼인을 허락했다. ${a.name}${josa(a.name, '과', '와')} ${b.name}${josa(b.name, '이', '가')} 맺어졌다. 두 아이는 각자의 둥지에 살며 서로 오간다. (${a.name} 유대 +10)`], 'kinlove:gone');
    return { ok: true, lines: [`혼인을 허락했다. ${b.name}${josa(b.name, '과', '와')} ${a.name}${josa(a.name, '이', '가')} 맺어졌다. 두 아이는 각자의 둥지에 살며 서로 오간다. (${b.name} 유대 +10)`] };
  }

  // 한쪽 둥지에서 아이가 태어나면 짝 쪽 기록에도 자녀를 적음 (아이 수·마지막 아이를 두 둥지가 함께 세서 겹쳐 태어나지 않게)
  function babyShared(ref, baby, now = Date.now(), line = null) {
    const { kin, k } = homeKid(ref.owner, ref.id);
    if (!k) return;
    (k.data.kids ||= []).push(baby); k.data.lastBaby = now;
    life.diary(k, line || `짝과의 사이에 아이 ${baby}${josa(baby, '이', '가')} 태어났다. 아이는 짝의 둥지에서 자란다.`, now);
    kinChanged(ref.owner, kin);
  }
  // 새끼 드래곤 짝 사이의 알: 한쪽 둥지에서 알 일을 정하면 짝 쪽에도 표시 (두 둥지에서 '맡기러 온 알'이 겹쳐 뜨지 않게)
  function eggShared(ref, now = Date.now(), line = null) {
    const kin = db.kinLoad(ref.owner), k = kin.find((x) => x.id === ref.id);
    if (!k) return;
    k.data.eggBrought = now;
    if (line) life.diary(k, line, now);
    kinChanged(ref.owner, kin);
  }
  // ── 중매 ──
  const kidKey = (owner, id) => `${owner}:${id}`;
  const pairKey = (a, b) => [a, b].sort().join('|');
  const matchAge = (k, now = Date.now()) => { const n = life.stageOf(k, now).name; return k.type === 'drake' ? ['젊은 용', '다 자란 용'].includes(n) : ['청소년', '어른'].includes(n); };
  const matchPending = (owner, id) => st.matches.find((o) => (o.from.owner === owner && o.from.kin === id) || (o.to.owner === owner && o.to.kin === id)) || null;
  // 이 아이를 중매할 수 없는 까닭 (없으면 null)
  function matchWhy(k, owner, now = Date.now()) {
    if (!k) return '그 아이는 지금 둥지에 없다.';
    if (k.data.mate) return `${k.name}에게는 이미 짝이 있다.`;
    if (!matchAge(k, now)) return k.type === 'drake' ? '젊은 용이 되어야 중매를 설 수 있다.' : '청소년이 되어야 중매를 설 수 있다.';
    if (matchPending(owner, k.id)) return `${k.name}에게는 이미 오가는 중매 청이 있다.`;
    if (pendingOf(k.id)) return `${k.name}에게는 이미 오가는 혼인 청이 있다.`;
    return null;
  }
  // 성공 확률: 둘 사이(처음·친구·단짝) + 이미 좋아함 · 마음이 다른 데 감 + 다시 주선한 횟수
  function matchChance(a, aOwner, b, bOwner) {
    const n = Math.max(a.data.friends?.[kidKey(bOwner, b.id)]?.n || 0, b.data.friends?.[kidKey(aOwner, a.id)]?.n || 0);
    let c = n >= (KIN_PLAY?.friendAt || 3) ? MATCH.best : n > 0 ? MATCH.friend : MATCH.base;
    if (points(a, aOwner, bOwner, b.id) || points(b, bOwner, aOwner, a.id)) c += MATCH.loves;
    for (const [x, xo, y, yo] of [[a, aOwner, b, bOwner], [b, bOwner, a, aOwner]]) {
      const r = refOf(x, xo);
      if (r && !r.declined && !r.ended && !(r.owner === yo && r.id === y.id)) c -= MATCH.other;
    }
    c += (st.matchTry[pairKey(kidKey(aOwner, a.id), kidKey(bOwner, b.id))]?.n || 0) * MATCH.retry;
    return Math.max(MATCH.min, Math.min(MATCH.max, c));
  }
  const tieOf = (a, aOwner, b, bOwner) => { const n = Math.max(a.data.friends?.[kidKey(bOwner, b.id)]?.n || 0, b.data.friends?.[kidKey(aOwner, a.id)]?.n || 0); return n >= (KIN_PLAY?.friendAt || 3) ? 'best' : n > 0 ? 'friend' : 'none'; };
  function matchSweep(now = Date.now()) {
    const keep = [];
    for (const o of st.matches) {
      if (now < o.until) { keep.push(o); continue; }
      tell(o.from.owner, [`${o.to.ownerName}에게서 ${o.from.name}의 중매 청에 답이 오지 않았다. 다음에 다시 청해 볼 수 있다.`]);
    }
    if (keep.length !== st.matches.length) { st.matches = keep; save(); }
  }
  // 중매할 만한 상대: 이 아이의 친구·단짝 + 동료 둥지의 아이 (같은 종류, 중매할 수 있는 나이, 짝 없음)
  function matchCands(d, kinId, now = Date.now()) {
    matchSweep(now);
    const { k } = homeKid(d.id, Number(kinId));
    const why = matchWhy(k, d.id, now);
    if (why) return { error: why };
    const out = new Map();
    const tryAdd = (owner, id) => {
      if (!owner || owner === d.id || out.has(kidKey(owner, id))) return;
      const { k: o } = homeKid(owner, id);
      if (!o || o.type !== k.type || o.data.mate || !matchAge(o, now)) return;
      const od = db.getDragon(owner);
      if (!od || od.dead_at) return;
      const cool = st.matchTry[pairKey(kidKey(d.id, k.id), kidKey(owner, o.id))]?.cool || 0;
      out.set(kidKey(owner, id), { owner, ownerName: od.name, id: o.id, name: o.name, stage: life.stageOf(o, now).name, kind: o.data.kind || null,
        tie: tieOf(k, d.id, o, owner), chance: Math.round(matchChance(k, d.id, o, owner) * 100), busy: !!matchPending(owner, o.id) || !!pendingOf(o.id), cool: cool > now ? cool : 0 });
    };
    for (const key of Object.keys(k.data.friends || {})) { const [ow, id] = key.split(':').map(Number); tryAdd(ow, id); }
    for (const r of db.relList(d.id)) if (r.kind === 'friend') for (const o of db.kinLoad(r.id)) if (o.status === 'home') tryAdd(r.id, o.id);
    const rank = { best: 0, friend: 1, none: 2 };
    return { ok: true, list: [...out.values()].sort((x, y) => rank[x.tie] - rank[y.tie] || y.chance - x.chance) };
  }
  // 중매 청 (내 아이 kinId와 다른 둥지 owner의 아이 toKin)
  function matchAsk(d, kinId, toOwner, toKin, now = Date.now()) {
    matchSweep(now);
    toOwner = Number(toOwner); toKin = Number(toKin);
    const A = homeKid(d.id, Number(kinId));
    const w1 = matchWhy(A.k, d.id, now); if (w1) return { error: w1 };
    if (!toOwner || toOwner === d.id) return { error: '다른 둥지의 아이와만 중매를 설 수 있다.' };
    const od = db.getDragon(toOwner);
    if (!od || od.dead_at) return { error: '그 둥지의 주인을 찾을 수 없다.' };
    const B = homeKid(toOwner, toKin);
    const w2 = matchWhy(B.k, toOwner, now); if (w2) return { error: w2 };
    const a = A.k, b = B.k;
    if (a.type !== b.type) return { error: '인간 아이는 인간 아이와, 드래곤 식구는 드래곤 식구와만 중매를 설 수 있다.' };
    const pk = pairKey(kidKey(d.id, a.id), kidKey(toOwner, b.id));
    if ((st.matchTry[pk]?.cool || 0) > now) return { error: `${a.name}${josa(a.name, '과', '와')} ${b.name}의 만남은 얼마 전에 어긋났다. 조금 더 시간이 지난 뒤에 다시 주선하자.` };
    const o = { id: now + Math.floor(Math.random() * 1000), at: now, until: now + DAYS * DAY, drake: a.type === 'drake',
      from: { owner: d.id, ownerName: d.name, kin: a.id, name: a.name }, to: { owner: toOwner, ownerName: od.name, kin: b.id, name: b.name } };
    st.matches.push(o); save();
    tell(toOwner, [`${d.name}${josa(d.name, '이', '가')} 중매를 청해 왔다. ${a.name}${josa(a.name, '과', '와')} 당신의 둥지 ${b.name}${josa(b.name, '이', '가')} 한번 만나 보기를 바란다. 둥지에서 받아들일지 정할 수 있다. (${DAYS}일 안에)`], 'kinlove:got', { from: d.name, a: a.name, b: b.name, match: true });
    return { ok: true, lines: [`${od.name}에게 ${a.name}${josa(a.name, '과', '와')} ${b.name}의 만남을 주선하자고 청했다. 상대 보호자가 받아들이면 두 ${a.type === 'drake' ? '용' : '아이'}가 만난다.`] };
  }
  function matchCancel(d, id) {
    const o = st.matches.find((x) => x.id === Number(id) && x.from.owner === d.id);
    if (!o) return { error: '그 중매 청은 이미 지나갔다.' };
    st.matches = st.matches.filter((x) => x !== o); save();
    return { ok: true, lines: [`${o.from.name}의 중매 청을 거두었다.`] };
  }
  const MATCH_SCENE = {
    human: {
      yes: ['장터 한쪽 찻집에서 두 {w}가 처음으로 마주 앉았다. 서툰 인사 끝에 웃음이 터지더니, 해가 질 때까지 이야기가 끊이지 않았다.',
        '우물가에서 만난 두 {w}는 물동이를 나눠 들고 마을을 몇 바퀴나 돌았다. 헤어질 때 둘 다 자꾸 뒤를 돌아보았다.',
        '축제 등불 아래에서 만난 두 {w}는 같은 노래를 알고 있었다. 노래가 끝나도 한참을 나란히 앉아 있었다.'],
      no: ['두 {w}는 찻집에 마주 앉았지만, 서로 눈만 피하다 찻잔이 식었다. 어색하게 인사하고 헤어졌다.',
        '우물가에서 만났지만 말이 이어지지 않았다. 둘은 공손하게 인사하고 각자의 길로 돌아갔다.',
        '만남은 나쁘지 않았지만, 둘 다 좋은 친구로 남는 게 낫겠다고 웃으며 말했다.'],
    },
    drake: {
      yes: ['두 용이 바람을 타고 나란히 날아올랐다. 구름을 몇 번 오가는 사이 날갯짓이 꼭 맞아 갔다.',
        '해 질 녘 절벽 위에서 만난 두 용은 서로의 비늘에 비친 노을을 한참 바라보았다.'],
      no: ['두 용이 함께 날아올랐지만, 바람을 서로 다르게 타다 각자의 둥지로 돌아갔다.',
        '두 용은 서로를 한 바퀴 돌며 냄새를 맡더니, 고개를 돌려 버렸다. 아직은 인연이 아닌 모양이다.'],
    },
  };
  const pickOne = (l) => l[Math.floor(Math.random() * l.length)];
  // 받은 쪽 보호자의 답: 받아들이면 그 자리에서 두 아이가 만나고, 결과는 확률로
  function matchAnswer(d, id, yes, now = Date.now()) {
    matchSweep(now);
    const o = st.matches.find((x) => x.id === Number(id) && x.to.owner === d.id);
    if (!o) return { error: '그 중매 청은 이미 지나갔다.' };
    const drop = () => { st.matches = st.matches.filter((x) => x !== o); save(); };
    if (!yes) {
      drop();
      tell(o.from.owner, [`${d.name}${josa(d.name, '이', '가')} ${o.from.name}${josa(o.from.name, '과', '와')} ${o.to.name}의 중매 청을 정중히 사양했다.`], 'kinlove:gone');
      return { ok: true, lines: [`${o.from.ownerName}의 중매 청을 정중히 사양했다.`] };
    }
    const A = homeKid(o.from.owner, o.from.kin), B = homeKid(d.id, o.to.kin);
    const a = A.k, b = B.k;
    drop();
    for (const [k, ow] of [[a, o.from.owner], [b, d.id]]) {
      const why = !k ? '두 아이 가운데 하나가 이제 둥지에 없다.' : k.data.mate ? `${k.name}에게 이미 짝이 생겼다.` : pendingOf(k.id) ? `${k.name}에게 이미 오가는 혼인 청이 있다.` : !matchAge(k, now) ? '중매를 설 나이가 아니다.' : null;
      if (why) { tell(o.from.owner, [`${o.from.name}의 중매가 이루어지지 못했다. ${why}`], 'kinlove:gone'); return { error: why }; }
      void ow;
    }
    const pk = pairKey(kidKey(o.from.owner, a.id), kidKey(d.id, b.id));
    const chance = matchChance(a, o.from.owner, b, d.id);
    const rec = (st.matchTry[pk] ||= { n: 0, cool: 0 });
    rec.n += 1;
    const ok = Math.random() < chance;
    const sc = MATCH_SCENE[a.type === 'drake' ? 'drake' : 'human'];
    const grown = adult(a, now) && adult(b, now); // 어른끼리면 '두 사람'
    const scene = pickOne(ok ? sc.yes : sc.no).replace(/\{w\}/g, grown ? '사람' : '아이')
      .replace(/사람는/g, '사람은').replace(/사람가/g, '사람이').replace(/사람를/g, '사람을').replace(/사람와/g, '사람과'); // 받침에 맞춘 조사
    const F = o.from.ownerName, T = d.name, dk = a.type === 'drake';
    if (ok) {
      a.data.loveRef = { owner: d.id, id: b.id, name: b.name, ownerName: T, match: true }; // match: 중매로 이어짐 (사건·혼인 문구가 '어릴 적 단짝·첫사랑'이 아니게)
      b.data.loveRef = { owner: o.from.owner, id: a.id, name: a.name, ownerName: F, match: true };
      // 첫사랑 기록은 덮어쓰지 않음: 아직 마음을 준 적이 없을 때만 이 상대를 첫사랑으로 (나중에 다른 첫사랑 사건이 이 인연을 덮지 않게)
      for (const [x, y] of [[a, b], [b, a]]) if (!x.data.firstLove || x.data.firstLove === '-') x.data.firstLove = y.name;
      delete a.data.heartbreak; delete b.data.heartbreak; delete a.data.mateNo; delete b.data.mateNo;
      life.addBond(a, 3); life.addBond(b, 3);
      life.diary(a, `${T}의 둥지 ${b.name}${josa(b.name, '과', '와')} 중매로 만났다. 서로 마음을 주고받는 사이가 되었다.`, now);
      life.diary(b, `${F}의 둥지 ${a.name}${josa(a.name, '과', '와')} 중매로 만났다. 서로 마음을 주고받는 사이가 되었다.`, now);
      delete st.matchTry[pk];
    } else {
      rec.cool = now + MATCH.cool;
      life.diary(a, `${T}의 둥지 ${b.name}${josa(b.name, '과', '와')} 중매로 만났지만, 인연은 아니었다.`, now);
      life.diary(b, `${F}의 둥지 ${a.name}${josa(a.name, '과', '와')} 중매로 만났지만, 인연은 아니었다.`, now);
    }
    save();
    kinChanged(o.from.owner, A.kin);
    kinChanged(d.id, B.kin);
    const after = ok ? (dk ? `두 용이 서로 마음을 주고받는 사이가 되었다. ${adult(a, now) && adult(b, now) ? '이제 짝을 청할 수 있다.' : '둘 다 젊은 용이 되면 짝을 청할 수 있다.'}`
      : `${grown ? '두 사람이' : '두 아이가'} 서로 마음을 주고받는 사이가 되었다. ${adult(a, now) && adult(b, now) ? '이제 혼인을 청할 수 있다.' : '둘 다 어른이 되면 혼인을 청할 수 있다.'}`)
      : `이번에는 인연이 닿지 않았다. ${Math.round(MATCH.cool / DAY)}일 뒤에 다시 주선해 볼 수 있다.`;
    if (ok) news(`${F}의 둥지 ${a.name}${josa(a.name, '과', '와')} ${T}의 둥지 ${b.name}${josa(b.name, '이', '가')} 중매로 만나 서로 마음을 주고받는 사이가 되었다고 한다.`);
    tell(o.from.owner, [`${T}${josa(T, '이', '가')} 중매를 받아들였다. ${scene} ${after}`], 'kinlove:gone');
    return { ok: true, lines: [`중매를 받아들였다. ${scene} ${after}`], matched: ok };
  }
  function matchView(d, now = Date.now()) {
    matchSweep(now);
    return {
      matchIn: st.matches.filter((o) => o.to.owner === d.id).map((o) => ({ id: o.id, until: o.until, from: o.from, to: o.to, drake: !!o.drake })),
      matchOut: st.matches.filter((o) => o.from.owner === d.id).map((o) => ({ id: o.id, until: o.until, kin: o.from.kin, from: o.from, to: o.to, drake: !!o.drake })),
    };
  }

  // 받은 청 수 (혼인 청 + 아이를 두고 받은 청): 아래 '둥지' 메뉴의 붉은 점에 씀
  const inCount = (id, now = Date.now()) => st.offers.filter((o) => o.to.owner === id && now < o.until).length + st.babies.filter((o) => o.to.owner === id && now < o.until).length + st.matches.filter((o) => o.to.owner === id && now < o.until).length;
  return { status, lovesBack, ask, view, answer, refOf, babyShared, eggShared, babyAsk, babyAnswer, babySweep, inCount, matchCands, matchAsk, matchAnswer, matchCancel };
};
