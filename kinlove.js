// 다른 둥지 아이와 맺어지기 (서로의 첫사랑 → 어른이 되어 혼인 청 → 두 보호자가 허락하면 짝)
// - 첫사랑: 청소년 때 다른 둥지의 인간 단짝을 좋아하게 되면 k.data.loveRef = { owner, id, name, ownerName }
// - 서로의 첫사랑: 상대 아이의 loveRef도 이 아이를 가리킬 때
// - 혼인 청: 한쪽 보호자가 축복하면 상대 보호자에게 허락을 물음 (world 'kinLove'.offers, DAYS일 안에)
// - 맺어지면 두 아이 모두 data.mate = { name, at, home: 상대 둥지 주인 이름, ref: { owner, id } }. 각자 자기 둥지에 산다
const DAY = 86400000, DAYS = 2;
const josa = (w, a, b) => { const c = String(w).charCodeAt(String(w).length - 1) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 ? a : b; };

module.exports = function setupKinLove({ db, online, sendMe, life, logic, news, kinChanged }) {
  const st = db.worldGet('kinLove') || {};
  if (!Array.isArray(st.offers)) st.offers = [];
  const save = () => db.worldSet('kinLove', st);
  const live = (id) => online.get(id) || null;
  const tell = (id, lines, ev, data) => {
    const e = live(id);
    if (e) { e.socket.emit('notice', { title: '둥지 소식', lines }); if (ev) e.socket.emit(ev, data || {}); }
    else for (const l of lines) db.noteAdd(id, l);
  };
  const adult = (k, now = Date.now()) => ['어른', '노년'].includes(life.stageOf(k, now).name);
  const homeKid = (owner, id) => { const kin = db.kinLoad(owner); return { kin, k: kin.find((x) => x.id === id && x.status === 'home' && x.type === 'human') || null }; };
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
  const points = (k, kOwner, owner, id) => { const r = refOf(k, kOwner); return !!r && !r.declined && r.owner === owner && r.id === id; };

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
    if (!r || r.declined) return null;
    sweep();
    const { k: o } = homeKid(r.owner, r.id);
    if (!o) return { gone: true };
    return { name: o.name, ownerName: ownerName(r.owner) || r.ownerName || '', mutual: points(o, r.owner, owner, k.id), adult: adult(o), free: !o.data.mate, pending: !!pendingOf(k.id) || !!pendingOf(o.id) };
  }
  // 첫사랑을 정할 때: 상대 아이도 이미 이 아이를 좋아하는지
  function lovesBack(owner, kinId, ref) { const { k: o } = homeKid(ref.owner, ref.id); return points(o, ref.owner, owner, kinId); }

  // 혼인 청 (보낸 쪽 보호자가 이벤트에서 축복했을 때)
  function ask(d, info, now = Date.now()) {
    const r = info.ref;
    if (!r || pendingOf(info.id)) return;
    const o = { id: now + Math.floor(Math.random() * 1000), at: now, until: now + DAYS * DAY,
      from: { owner: d.id, ownerName: d.name, kin: info.id, name: info.name },
      to: { owner: r.owner, ownerName: ownerName(r.owner) || r.ownerName || '', kin: r.id, name: r.name } };
    st.offers.push(o); save();
    tell(r.owner, [`${d.name}${josa(d.name, '이', '가')} 혼인을 청해 왔다. ${info.name}${josa(info.name, '과', '와')} 당신의 둥지 ${r.name}${josa(r.name, '이', '가')} 함께하기를 바란다. 둥지에서 허락할지 정할 수 있다. (${DAYS}일 안에)`], 'kinlove:got', { from: d.name, a: info.name, b: r.name });
  }

  // 둥지 창에 보일 것: 받은 혼인 청 · 보낸 혼인 청
  function view(d, now = Date.now()) {
    sweep(now);
    return {
      in: st.offers.filter((o) => o.to.owner === d.id).map((o) => ({ id: o.id, until: o.until, from: o.from, to: o.to })),
      out: st.offers.filter((o) => o.from.owner === d.id).map((o) => ({ id: o.id, until: o.until, kin: o.from.kin, to: o.to })),
    };
  }

  // 받은 쪽 보호자의 답
  function answer(d, id, yes, now = Date.now()) {
    sweep(now);
    const o = st.offers.find((x) => x.id === Number(id) && x.to.owner === d.id);
    if (!o) return { error: '그 혼인 청은 이미 지나갔다.' };
    const A = homeKid(o.from.owner, o.from.kin), B = homeKid(d.id, o.to.kin);
    const drop = () => { st.offers = st.offers.filter((x) => x !== o); save(); };
    if (!A.k || !B.k) { drop(); return { error: '두 아이 가운데 한 아이가 이제 둥지에 없다.' }; }
    const a = A.k, b = B.k;
    if (!yes) {
      drop();
      a.data.mateNo = now; a.data.loveRef.declined = now;
      life.diary(a, '첫사랑을 마음에 묻었다.', now);
      kinChanged(o.from.owner, A.kin);
      tell(o.from.owner, [`${d.name}${josa(d.name, '이', '가')} 혼인 청을 정중히 사양했다. ${a.name}${josa(a.name, '은', '는')} 한동안 말이 없더니, 첫사랑을 마음에 묻었다.`], 'kinlove:gone');
      return { ok: true, lines: [`${o.from.ownerName}의 혼인 청을 정중히 사양했다.`] };
    }
    if (a.data.mate || b.data.mate) { drop(); return { error: '두 아이 가운데 한 아이에게 이미 짝이 있다.' }; }
    if (!adult(a, now) || !adult(b, now)) return { error: '두 아이가 모두 어른이 되어야 맺어질 수 있다.' };
    drop();
    const F = o.from.ownerName, T = d.name;
    a.data.mate = { name: b.name, at: now, home: T, sex: b.data.sex || null, ref: { owner: d.id, id: b.id } }; // sex: 같은 성별이면 아이 이벤트가 없음
    b.data.mate = { name: a.name, at: now, home: F, sex: a.data.sex || null, ref: { owner: o.from.owner, id: a.id } };
    life.addBond(a, 10); life.addBond(b, 10);
    life.diary(a, `${T}의 둥지에 사는 첫사랑 ${b.name}${josa(b.name, '과', '와')} 맺어졌다. 두 둥지가 함께 축복했다.`, now);
    life.diary(b, `${F}의 둥지에 사는 첫사랑 ${a.name}${josa(a.name, '과', '와')} 맺어졌다. 두 둥지가 함께 축복했다.`, now);
    kinChanged(o.from.owner, A.kin);
    kinChanged(d.id, B.kin);
    for (const [ow, mine, other, home] of [[o.from.owner, a, b, T], [d.id, b, a, F]]) {
      const e = live(ow); const p = e ? e.dragon : db.getDragon(ow);
      if (p) { logic.chron(p, 'mark', `${mine.name}${josa(mine.name, '이', '가')} ${home}의 둥지 ${other.name}${josa(other.name, '과', '와')} 맺어졌다.`, now); db.saveState(p); if (e) sendMe(e.socket, p); }
    }
    news(`${F}의 둥지 ${a.name}${josa(a.name, '과', '와')} ${T}의 둥지 ${b.name}${josa(b.name, '이', '가')} 맺어졌다. 서로의 첫사랑이었다고 한다.`);
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
  return { status, lovesBack, ask, view, answer, refOf, babyShared };
};
