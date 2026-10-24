// 왕도 야시장: 축제 날(토·일) 저녁 6시부터 새벽 5시까지 왕도에 노점이 섬 (숫자·물건은 game-data.js의 NIGHT_MARKET)
// 축제가 토요일 0시에 시작하므로 토 0~5시 · 토 18시~일 5시 · 일 18~24시(축제가 끝나는 자정에 함께 걷음) 세 번 열림. 적대 드래곤도 이용할 수 있음
// - 상인 노점: 축제 한정 물건. 하룻밤에 살 수 있는 개수가 정해져 있음
// - 플레이어 노점: 드래곤마다 하나. 올린 물건은 노점에 맡겨 두고(소지품에서 빠짐), 팔리면 금화가 바로 주인에게 감
//   다 팔린 물건은 '품절'로 노점에 남고, 주인이 원할 때 내림 (노점도 저절로 걷히지 않음)
//   야시장이 끝나면 팔리지 않은 물건은 주인 소지품으로 돌아감 (접속하지 않았어도)
const { REGIONS, ITEMS, NIGHT_MARKET: NM } = require('./game-data');

const DAY = 86400000, KST = 9 * 3600000, H = 3600000;
const josa = (w, a, b) => { const c = String(w).charCodeAt(String(w).length - 1) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 ? a : b; };
const pick = (l) => l[Math.floor(Math.random() * l.length)];

module.exports = function setupNightMarket({ io, db, online, logic, sendMe }) {
  const st = db.worldGet('nightmarket') || {};
  if (!st.stalls || typeof st.stalls !== 'object') st.stalls = {};
  const save = () => db.worldSet('nightmarket', st);

  // 그 시각에 열려 있는 야시장 { key, start, until } (없으면 null)
  function sessionAt(now = Date.now()) {
    const fest = logic.festivalNow(now);
    if (!fest) return null;
    if (process.env.FESTIVAL_FORCE === '1') return { key: `nm-${fest.key}`, start: now - H, until: fest.until }; // 시험용: 축제 내내 열림
    const kst = now + KST, day = Math.floor(kst / DAY), min = (kst - day * DAY) / 60000;
    const startDay = min >= NM.open * 60 ? day : min < NM.close * 60 ? day - 1 : null;
    if (startDay == null) return null;
    // 저녁 6시에 서는 판. 축제 전날 저녁에 선 판이면 축제가 시작하는 자정부터 (토요일 0시~5시)
    const start = Math.max(startDay * DAY - KST + NM.open * H, fest.until - 2 * DAY);
    if (!logic.festivalNow(start)) return null;
    const until = Math.min((startDay + 1) * DAY - KST + NM.close * H, fest.until);
    return now < until ? { key: `nm-${startDay}`, start, until } : null;
  }
  // 다음에 열리는 시각 (축제 기간 안에서만. 없으면 null)
  function nextOpen(now = Date.now()) {
    const fest = logic.festivalNow(now);
    if (!fest) return null;
    for (let t = Math.ceil(now / 60000) * 60000; t < fest.until; t += 30 * 60000) if (sessionAt(t)) return t;
    return null;
  }
  const isHere = (d) => !d.exp_end && d.region === NM.region;
  const regionName = () => REGIONS[NM.region]?.name || '왕도';

  // 드래곤마다 이번 밤 상인 노점에서 산 개수 (combat JSON)
  function bookOf(d, key) {
    const c = logic.combatJson(d);
    if (!c.nm || c.nm.key !== key) c.nm = { key, n: {} };
    return c.nm;
  }
  // 소지품에서 노점에 올릴 수 있는 개수 (보물은 못 올림, 끼고 있는 장신구는 하나 남김)
  function spare(d, id) {
    const it = ITEMS[id];
    if (!it || it.cat === 'treasure') return 0;
    const worn = Object.values(logic.equipOf(d)).includes(id) ? 1 : 0;
    const enh = !worn && logic.gearOf(d)[id] ? 1 : 0; // 강화·각인한 장신구는 그 한 개를 남김 (기록이 사라지지 않게)
    return Math.max(0, db.itemCount(d.id, id) - worn - enh);
  }
  const itemText = (id, qty) => `${ITEMS[id].name}${qty > 1 ? ` ${qty}개` : ''}`;
  const live = (id) => online.get(id) || null;
  // 다른 드래곤에게 소식 (접속해 있으면 알림, 아니면 다음 접속 때 소식으로)
  function tell(id, lines, items) {
    const e = live(id);
    if (e) e.socket.emit('notice', { title: '야시장', lines, items });
    else for (const l of lines) db.noteAdd(id, l);
  }

  // 이번 축제의 야시장 시간표 [{ start, until }] (축제가 시작한 때부터 30분 간격으로 살펴 모음. 축제마다 한 번만 셈)
  let timesCache = null;
  function timesOf(fest) {
    if (timesCache?.key === fest.key) return timesCache.list;
    const list = [];
    for (let t = fest.until - 2 * DAY; t < fest.until; t += 30 * 60000) { const s = sessionAt(t); if (s && !list.some((x) => x.start === s.start)) list.push({ start: s.start, until: s.until }); }
    timesCache = { key: fest.key, list };
    return list;
  }
  // 내 정보에 붙임: 축제 중일 때만 { open, until, next, here, times }
  function status(d, now = Date.now()) {
    const fest = logic.festivalNow(now);
    if (!fest) return null;
    const s = sessionAt(now);
    return { open: !!s, until: s ? s.until : null, next: s ? null : nextOpen(now), here: isHere(d), mine: !!st.stalls[d.id], times: s || process.env.FESTIVAL_FORCE === '1' ? null : timesOf(fest) };
  }

  // 야시장 창
  function view(d, now = Date.now()) {
    const s = sessionAt(now);
    if (!s) return { error: '지금은 야시장이 열려 있지 않다. 축제 날 저녁 6시면 광장에 노점이 선다.' };
    const m = st.stalls[d.id];
    const mine = m ? { sign: m.sign, items: m.items, sold: m.sold || 0, earned: m.earned || 0 } : null;
    // 광장을 떠나 있어도 내 노점은 볼 수 있음 (거두기·간판만)
    if (!isHere(d)) return m ? { away: true, until: s.until, greet: pick(NM.greet), npc: [], stalls: [], mine, inv: [], rules: NM.stall } : { error: `야시장은 ${regionName()} 광장에서 열린다.` };
    const b = bookOf(d, s.key);
    const npc = NM.npc.map((x) => ({ id: x.id, name: x.name, who: x.who, say: x.say, items: x.items.map((y) => ({ id: y.id, price: y.price, limit: y.limit, left: Math.max(0, y.limit - (b.n[y.id] || 0)) })) }));
    const stalls = Object.entries(st.stalls)
      .filter(([id, x]) => Number(id) !== d.id && x.items.length)
      .sort((a, b2) => (b2[1].at || 0) - (a[1].at || 0))
      .map(([id, x]) => ({ id: Number(id), name: x.name, kind: x.kind, sign: x.sign, items: x.items.filter((y) => ITEMS[y.id]) }));
    const inv = db.inventory(d.id).filter((x) => spare(d, x.item) > 0).map((x) => ({ id: x.item, qty: spare(d, x.item), value: ITEMS[x.item].value || 0 }));
    return {
      until: s.until, greet: pick(NM.greet), npc, stalls,
      mine, inv, rules: NM.stall,
    };
  }

  // 상인 노점에서 사기
  function npcBuy(d, id, qty, now = Date.now()) {
    const s = sessionAt(now);
    if (!s) return { error: '야시장은 이미 노점을 걷었다.' };
    if (!isHere(d)) return { error: `야시장은 ${regionName()} 광장에서 열린다.` };
    const shop = NM.npc.find((x) => x.items.some((y) => y.id === id));
    const row = shop?.items.find((y) => y.id === id);
    if (!row || !ITEMS[id]) return { error: '야시장 상인이 파는 물건이 아니다.' };
    qty = Math.max(1, Math.floor(Number(qty)) || 1);
    const b = bookOf(d, s.key);
    const left = Math.max(0, row.limit - (b.n[id] || 0));
    const nm = ITEMS[id].name;
    if (!left) return { error: `${nm}${josa(nm, '은', '는')} 오늘 밤 더 살 수 없다. (하룻밤 ${row.limit}개까지)` };
    if (qty > left) return { error: `${nm}${josa(nm, '은', '는')} 오늘 밤 ${left}개까지만 더 살 수 있다.` };
    const cost = row.price * qty;
    if ((d.gold || 0) < cost) return { error: `금화가 모자란다. (${cost}닢 필요)` };
    d.gold -= cost;
    b.n[id] = (b.n[id] || 0) + qty;
    const w = itemText(id, qty);
    return { title: '야시장', lines: [`${shop.name}에서 금화 ${cost}닢을 내고 ${w}${josa(qty > 1 ? '개' : nm, '을', '를')} 샀다.`], items: [{ id, qty }] };
  }

  // 내 노점에 물건 올리기 (같은 물건이면 개수를 더하고 값은 새로 정한 값으로)
  function put(d, id, qty, price, sign, now = Date.now()) {
    const s = sessionAt(now);
    if (!s) return { error: '지금은 야시장이 열려 있지 않다.' };
    if (!isHere(d)) return { error: `노점은 ${regionName()} 광장에서만 펼 수 있다.` };
    const R = NM.stall;
    if (!ITEMS[id]) return { error: '알 수 없는 물건이다.' };
    if (ITEMS[id].cat === 'treasure') return { error: '보물은 노점에 올릴 수 없다. 둥지의 보물더미에 쌓아 두자.' };
    qty = Math.floor(Number(qty)); price = Math.floor(Number(price));
    if (!Number.isFinite(qty) || qty < 1 || qty > R.qtyMax) return { error: '개수를 다시 정해야 한다.' };
    if (!Number.isFinite(price) || price < 1 || price > R.priceMax) return { error: `값은 1닢부터 ${R.priceMax.toLocaleString()}닢까지 정할 수 있다.` };
    const nm = ITEMS[id].name;
    if (spare(d, id) < qty) return { error: `${nm}${josa(nm, '이', '가')} 그만큼 없다.${Object.values(logic.equipOf(d)).includes(id) ? ' (끼고 있는 것은 올릴 수 없다)' : logic.gearOf(d)[id] ? ' (강화·각인한 것은 올릴 수 없다)' : ''}` };
    const m = st.stalls[d.id] || { name: d.name, kind: d.kind, sign: '', items: [], at: now, sold: 0, earned: 0 };
    const line = m.items.find((x) => x.id === id);
    if (!line && m.items.length >= R.lines) return { error: `노점에는 물건을 ${R.lines}가지까지 올릴 수 있다.` };
    if (line) { line.qty += qty; line.price = price; } else m.items.push({ id, qty, price });
    if (typeof sign === 'string') m.sign = sign.replace(/\s+/g, ' ').trim().slice(0, R.signMax);
    const first = !st.stalls[d.id];
    m.name = d.name; m.kind = d.kind; m.at = now;
    st.stalls[d.id] = m;
    save();
    return { title: '야시장', lines: [`${first ? '광장 한쪽에 노점을 펴고 ' : ''}${itemText(id, qty)}${josa(qty > 1 ? '개' : nm, '을', '를')} 개당 ${price}닢에 올려놓았다.`], items: [{ id, qty: -qty }] };
  }
  // 내 노점에서 물건 거두기 (id가 없으면 노점을 통째로 걷음). 어디에 있든 할 수 있음
  function take(d, id) {
    const m = st.stalls[d.id];
    if (!m) return { error: '펴 둔 노점이 없다.' };
    const back = id ? m.items.filter((x) => x.id === id) : m.items.slice();
    if (id && !back.length) return { error: '노점에 그런 물건이 없다.' };
    m.items = m.items.filter((x) => !back.includes(x));
    const items = back.filter((x) => ITEMS[x.id] && x.qty > 0).map((x) => ({ id: x.id, qty: x.qty }));
    const gone = back.filter((x) => ITEMS[x.id] && !(x.qty > 0)); // 품절: 돌려받을 것 없이 내리기만
    const lines = [];
    if (items.length) lines.push(`노점에서 ${items.map((x) => itemText(x.id, x.qty)).join(', ')}${josa(items.length > 1 || items[0].qty > 1 ? '개' : ITEMS[items[0].id].name, '을', '를')} 거두었다.`);
    if (gone.length) lines.push(`다 팔린 ${gone.map((x) => ITEMS[x.id].name).join(', ')}의 자리를 치웠다.`);
    if (!lines.length) lines.push('노점을 걷었다.');
    if (!m.items.length) { delete st.stalls[d.id]; if (id) lines.push('노점이 비어 자리를 걷었다.'); }
    save();
    return { title: '야시장', lines, items };
  }
  // 간판 글씨만 바꾸기
  function setSign(d, sign) {
    const m = st.stalls[d.id];
    if (!m) return { error: '펴 둔 노점이 없다.' };
    m.sign = String(sign || '').replace(/\s+/g, ' ').trim().slice(0, NM.stall.signMax);
    save();
    return { title: '야시장', lines: [m.sign ? `노점에 '${m.sign}' 간판을 걸었다.` : '간판을 떼었다.'], items: [] };
  }

  // 다른 드래곤의 노점에서 사기: 금화는 바로 주인에게 (접속하지 않았어도)
  function buyFrom(d, sellerId, id, qty, now = Date.now()) {
    const s = sessionAt(now);
    if (!s) return { error: '야시장은 이미 노점을 걷었다.' };
    if (!isHere(d)) return { error: `야시장은 ${regionName()} 광장에서 열린다.` };
    sellerId = Number(sellerId);
    if (sellerId === d.id) return { error: '내 노점의 물건은 살 수 없다. 거두려면 내 노점에서 거두자.' };
    const m = st.stalls[sellerId];
    const line = m?.items.find((x) => x.id === id);
    if (!line || !ITEMS[id]) return { error: '그 물건은 이미 팔렸거나 노점에서 내려갔다.' };
    if (!(line.qty > 0)) return { error: `${ITEMS[id].name}${josa(ITEMS[id].name, '은', '는')} 이미 다 팔렸다. (품절)` };
    qty = Math.max(1, Math.floor(Number(qty)) || 1);
    if (qty > line.qty) return { error: `노점에 ${line.qty}개밖에 남지 않았다.` };
    const cost = line.price * qty;
    if ((d.gold || 0) < cost) return { error: `금화가 모자란다. (${cost}닢 필요)` };
    d.gold -= cost;
    line.qty -= qty; // 0이 되어도 줄은 남김 (품절 표시, 주인이 내릴 때까지)
    m.sold = (m.sold || 0) + qty; m.earned = (m.earned || 0) + cost;
    const emptied = !m.items.some((x) => x.qty > 0);
    save();
    // 금화를 주인에게
    const e = live(sellerId);
    if (e) { e.dragon.gold += cost; db.saveState(e.dragon); sendMe(e.socket, e.dragon); }
    else db.giftOffline(sellerId, cost, []);
    const w = itemText(id, qty), nm = ITEMS[id].name, o = josa(qty > 1 ? '개' : nm, '을', '를');
    tell(sellerId, [`야시장 노점에서 ${d.name}${josa(d.name, '이', '가')} ${w}${o} 사 갔다. 금화 ${cost}닢을 받았다.${!line.qty ? ` ${nm}${josa(nm, '은', '는')} 품절이 되었다.` : ''}${emptied ? ' 노점의 물건이 모두 팔렸다. 원할 때 노점을 걷자.' : ''}`]);
    db.ledgerAdd(d.id, { kind: 'market', other: { id: sellerId, name: m.name, kind: m.kind }, goldOut: cost, itemsIn: [{ id, qty }], note: '야시장 노점에서 삼' });
    db.ledgerAdd(sellerId, { kind: 'market', other: { id: d.id, name: d.name, kind: d.kind }, goldIn: cost, itemsOut: [{ id, qty }], note: '야시장 노점에서 팖' });
    return { title: '야시장', lines: [`${m.sign ? `'${m.sign}' 노점` : `${m.name}의 노점`}에서 금화 ${cost}닢을 내고 ${w}${o} 샀다.`], items: [{ id, qty }] };
  }

  // 야시장이 끝나면: 남은 물건을 모두 주인에게 돌려줌
  function closeAll() {
    for (const [sid, m] of Object.entries(st.stalls)) {
      const id = Number(sid);
      const items = m.items.filter((x) => ITEMS[x.id] && x.qty > 0).map((x) => ({ id: x.id, qty: x.qty }));
      if (items.length) {
        const e = live(id);
        if (e) { db.saveState(e.dragon, items); sendMe(e.socket, e.dragon); }
        else if (db.getDragon(id)) db.giftOffline(id, 0, items);
      }
      const lines = [`야시장이 끝나 노점을 걷었다.${m.sold ? ` 이번 밤에 ${m.sold}개를 팔아 금화 ${m.earned}닢을 벌었다.` : ''}`];
      if (items.length) lines.push(`팔리지 않은 ${items.map((x) => itemText(x.id, x.qty)).join(', ')}${josa(items.length > 1 || items[0].qty > 1 ? '개' : ITEMS[items[0].id].name, '은', '는')} 소지품으로 돌아왔다.`);
      if (db.getDragon(id)) tell(id, lines, items);
    }
    st.stalls = {};
    save();
  }

  // 열림·닫힘을 살펴 전체에 알림 (한 번씩. 서버를 다시 켜도 거듭 알리지 않음)
  const refreshAll = () => { for (const e of online.values()) sendMe(e.socket, e.dragon); };
  function tick(now = Date.now()) {
    const s = sessionAt(now);
    if (st.key && (!s || s.key !== st.key)) { // 지난 밤 야시장이 끝남
      closeAll();
      if (st.gone !== st.key) { st.gone = st.key; io.emit('system', { text: `[${regionName()} 야시장] 등불이 하나둘 꺼지고, 야시장이 노점을 걷었다.`, at: now }); }
      st.key = null; save();
      refreshAll();
    }
    if (s && st.key !== s.key) {
      st.key = s.key;
      if (st.ann !== s.key) { st.ann = s.key; io.emit('system', { text: `[${regionName()} 야시장] 광장에 등불이 켜지고 야시장이 열렸다. 상인 노점과 드래곤들의 노점이 골목을 따라 줄지어 선다.`, at: now }); }
      save();
      refreshAll();
    }
  }
  const timer = setInterval(() => { try { tick(); } catch (e) { console.error('[야시장]', e); } }, 15000);
  timer.unref?.();
  setImmediate(() => { try { tick(); } catch (e) { console.error('[야시장]', e); } });

  // 노점에 맡겨 둔 물건 id (빚은 물건 정리에서 '누군가 가지고 있음'으로 셈)
  const heldItems = () => new Set(Object.values(st.stalls).flatMap((m) => m.items.map((x) => x.id)));
  return { status, view, npcBuy, put, take, setSign, buyFrom, sessionAt, tick, heldItems };
};
