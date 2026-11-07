// 안개 너머의 행상인: 하루 세 번, 남쪽 해안(어촌 선창)에 90분씩 배를 대는 이국 상인 (숫자·대사·물건은 game-data.js의 PEDDLER)
// 시간표는 날짜와 비밀값(world 'peddler'.salt)으로 정해지므로 서버를 다시 켜도 같고, 코드를 봐도 미리 알 수 없다
// - 과일·양념(요리 재료)과 안개 상자를 금화로 팖. 한 번 들를 때 드래곤마다 살 수 있는 개수가 정해져 있음
// - 안개 상자: 소지품에서 '열기'(쓰기)로 엶. 이국 장신구·요리 재료·기념품 중 하나 + 행상인의 증표
// - 이국 장신구는 열 때마다 능력치가 새로 나뉨 (같은 나눔이면 같은 물건으로 겹침). 빚은 물건처럼 월드에 저장 (server.js registerItem)
// - 증표를 모으면 고른 이국 장신구 하나와 바꿈 (행상인이 와 있을 때)
const crypto = require('crypto');
const { REGIONS, ITEMS, PEDDLER: P } = require('./game-data');

const DAY = 86400000, KST = 9 * 3600000;
const josa = (w, a, b) => { const c = String(w).charCodeAt(String(w).length - 1) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 ? a : b; };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pickW = (obj) => { const e = Object.entries(obj); let r = Math.random() * e.reduce((a, [, w]) => a + w, 0); return (e.find(([, w]) => (r -= w) < 0) || e[0])[0]; };
const STAT_ORDER = ['claw', 'wing', 'scale', 'wisdom', 'majesty'];

// registerItem(sig, def): 이국 장신구를 물건으로 올리고 id를 돌려줌 (같은 sig면 같은 id)
module.exports = function setupPeddler({ io, db, online, logic, sendMe, registerItem }) {
  const st = db.worldGet('peddler') || {};
  if (!st.salt) { st.salt = crypto.randomInt(1, 2 ** 31); db.worldSet('peddler', st); }
  const save = () => db.worldSet('peddler', st);
  const where = () => REGIONS[P.region]?.name || '남쪽 해안';

  // 그날(한국 날짜)의 시간표: [{ key, start, end }]. from~to시를 perDay 구간으로 나눠 구간마다 한 번
  const dayCache = new Map();
  function daySlots(day) {
    if (dayCache.has(day)) return dayCache.get(day);
    const r = rng(st.salt ^ Math.imul(day + 7, 2654435761));
    const dayStart = day * DAY - KST, span = Math.floor(((P.to - P.from) * 60) / P.perDay);
    const out = [];
    for (let i = 0; i < P.perDay; i++) {
      const from = P.from * 60 + i * span + P.edge, to = P.from * 60 + (i + 1) * span - P.minutes - P.edge;
      const start = dayStart + (from + Math.floor(r() * Math.max(1, to - from))) * 60000;
      out.push({ key: `${day}-${i}`, start, end: start + P.minutes * 60000 });
    }
    dayCache.set(day, out);
    if (dayCache.size > 4) dayCache.delete(dayCache.keys().next().value);
    return out;
  }
  function slotNow(now = Date.now()) {
    if (process.env.PEDDLER_FORCE === '1') return { key: `force-${Math.floor(now / DAY)}`, start: now - 60000, end: now + P.minutes * 60000 };
    if (st.force && now < st.force.end) return st.force;
    const day = Math.floor((now + KST) / DAY);
    return [...daySlots(day - 1), ...daySlots(day)].find((s) => now >= s.start && now < s.end) || null; // 새벽 1시까지 걸친 판은 전날 시간표
  }
  // 다음에 배가 닿는 시각 (오늘·내일 시간표에서)
  function nextAt(now = Date.now()) {
    const day = Math.floor((now + KST) / DAY);
    return [...daySlots(day), ...daySlots(day + 1)].find((s) => s.start > now)?.start || null;
  }
  const isHere = (d) => !d.exp_end && d.region === P.region;
  // 드래곤마다 이번에 산 개수 (combat JSON)
  function bookOf(d, key) {
    const c = logic.combatJson(d);
    if (!c.pd || c.pd.key !== key) { dayBookOf(d); c.pd = { key, n: {} }; } // 지난 판 기록을 지우기 전에 하루치로 옮겨 둠 (dayBookOf의 mig)
    return c.pd;
  }
  // 판 이름(key)이 어느 한국 날짜의 판인지: `날짜-번호` / `gm-시각` / `force-날짜`. 모르면 null
  function slotDay(key) {
    let m;
    if ((m = /^(\d+)-\d+$/.exec(key))) return Number(m[1]);
    if ((m = /^gm-(\d+)$/.exec(key))) return Math.floor((Number(m[1]) + KST) / DAY);
    if ((m = /^force-(\d+)$/.exec(key))) return Number(m[1]);
    return null;
  }
  // 하루 제한 물건(row.daily)은 들른 판과 상관없이 한국 시간 하루 동안 센 개수
  function dayBookOf(d, now = Date.now()) {
    const c = logic.combatJson(d), day = Math.floor((now + KST) / DAY);
    if (!c.pdDay || c.pdDay.day !== day) c.pdDay = { day, n: {} };
    // 하루 제한으로 바뀌기 전에 산 것도 셈: 예전엔 판마다(c.pd) 셌으므로, 오늘 판의 기록이 남아 있으면 하루치에 한 번만 더함
    // mig 1: 평소 판(`날짜-번호`)만 옮김 / mig 2: GM이 부른 판(`gm-시각`)·강제 판(`force-날짜`)도 옮김
    if (c.pdDay.mig !== 2) {
      const key = c.pd && typeof c.pd.key === 'string' ? c.pd.key : '', normal = /^\d+-\d+$/.test(key);
      const take = slotDay(key) === day && !(c.pdDay.mig === 1 && normal); // mig 1 때 이미 옮긴 평소 판은 다시 더하지 않음
      c.pdDay.mig = 2;
      if (take) for (const row of P.shop) if (row.daily && c.pd.n[row.id]) c.pdDay.n[row.id] = (c.pdDay.n[row.id] || 0) + c.pd.n[row.id];
    }
    return c.pdDay;
  }
  const boughtOf = (d, key, row, now) => ((row.daily ? dayBookOf(d, now) : bookOf(d, key)).n[row.id] || 0);

  // 내 정보에 붙임. now: 와 있으면 { until, here } / 아니면 { next } (다음에 닿는 시각)
  function status(d, now = Date.now()) {
    const s = slotNow(now);
    return s ? { open: true, until: s.end, here: isHere(d), where: where() } : { open: false, next: nextAt(now), where: where() };
  }

  // 행상인 창
  function view(d, now = Date.now()) {
    const s = slotNow(now);
    if (!s) return { error: `안개 너머의 배가 아직 닿지 않았다. 하루 세 번, ${where()} 어촌 선창에 들른다.` };
    if (!isHere(d)) return { error: `행상인은 ${where()} 어촌 선창에 배를 대고 있다.` };
    const b = bookOf(d, s.key);
    return {
      name: P.name, until: s.end, where: where(), greet: P.greet[Math.floor(Math.random() * P.greet.length)],
      shop: P.shop.filter((x) => ITEMS[x.id]).map((x) => ({ id: x.id, price: x.price, limit: x.limit, daily: !!x.daily, group: x.group || null, left: Math.max(0, x.limit - boughtOf(d, s.key, x, now)) })),
      tokens: db.itemCount(d.id, 'mist_token') || 0, tokenTrade: P.tokenTrade,
      gear: Object.entries(P.gear).map(([k, g]) => ({ key: k, name: g.name, slot: g.slot, stats: g.stats, eff: g.eff })),
      total: P.total, gearLv: P.gearLv || null, spices: Object.values(P.spices).map((x) => ({ item: x.item, fits: x.fits, text: x.text })),
    };
  }
  function buy(d, id, qty, now = Date.now()) {
    const s = slotNow(now);
    if (!s) return { error: '행상인의 배는 이미 안개 속으로 떠났다.' };
    if (!isHere(d)) return { error: `행상인은 ${where()} 어촌 선창에 있다.` };
    const row = P.shop.find((x) => x.id === id);
    if (!row || !ITEMS[id]) return { error: '행상인이 파는 물건이 아니다.' };
    qty = Math.max(1, Math.floor(Number(qty)) || 1);
    const b = row.daily ? dayBookOf(d, now) : bookOf(d, s.key), left = Math.max(0, row.limit - (b.n[id] || 0)), nm = ITEMS[id].name;
    if (!left) return { error: row.daily ? `${nm}${josa(nm, '은', '는')} 오늘 더 살 수 없다. (하루 ${row.limit}개까지, 자정에 다시)` : `${nm}${josa(nm, '은', '는')} 이번에 더 살 수 없다. (한 번 들를 때 ${row.limit}개까지)` };
    if (qty > left) return { error: `${nm}${josa(nm, '은', '는')} ${row.daily ? '오늘' : '이번에'} ${left}개까지만 더 살 수 있다.` };
    const cost = row.price * qty;
    if ((d.gold || 0) < cost) return { error: `금화가 모자란다. (${cost.toLocaleString()}닢 필요)` };
    d.gold -= cost;
    b.n[id] = (b.n[id] || 0) + qty;
    return { title: P.name, lines: [`금화 ${cost.toLocaleString()}닢을 내고 ${nm}${qty > 1 ? ` ${qty}개` : ''}${josa(qty > 1 ? '개' : nm, '을', '를')} 샀다.`], items: [{ id, qty }], gold: -cost };
  }

  // 이국 장신구 하나: 능력치 총합 total 안에서 무작위로 나눔 (첫 능력치는 꼭 들어감, 2~3가지)
  function rollGear(key) {
    const g = P.gear[key];
    const total = P.totalW ? Number(pickW(P.totalW)) : randInt(P.total[0], P.total[1]); // totalW: 총합마다 나오는 비율
    const rest = g.stats.slice(1).sort(() => Math.random() - 0.5);
    const keys = [g.stats[0], ...rest.slice(0, Math.random() < 0.5 ? 1 : 2)];
    const bonus = Object.fromEntries(keys.map((k) => [k, 2]));
    for (let n = total - keys.length * 2; n > 0; n--) bonus[pickW(Object.fromEntries(keys.map((k, i) => [k, i ? 1 : 1.6])))]++;
    const sorted = Object.fromEntries(STAT_ORDER.filter((k) => bonus[k]).map((k) => [k, bonus[k]]));
    const word = P.totalWord[total];
    const def = {
      name: `${word ? `${word} ` : ''}${g.name}`, rarity: 'rare', type: 'equip', slot: g.slot, bonus: sorted,
      life: { ...g.life }, lifeEff: g.eff, exotic: key, value: 100 + total * 10, lvReq: P.gearLv || undefined,
      desc: `${g.desc} 안개 너머의 행상인에게서 왔다.`,
    };
    return registerItem(`peddler:${key}:${JSON.stringify(sorted)}`, def);
  }

  // 안개 상자 열기 (소지품에서 '쓰기'. 행상인이 없어도 어디서든)
  function openBox(d, id = 'mist_box') {
    if ((db.itemCount(d.id, id) || 0) < 1) return { error: '가지고 있지 않다.' };
    const items = [{ id, qty: -1 }], lines = [];
    const sum = P.box.reduce((a, x) => a + x.w, 0);
    let r = Math.random() * sum;
    const hit = P.box.find((x) => (r -= x.w) < 0) || P.box[P.box.length - 1];
    let reveal;
    if (hit.kind === 'gear') {
      const key = Object.keys(P.gear)[Math.floor(Math.random() * Object.keys(P.gear).length)];
      const gid = rollGear(key);
      items.push({ id: gid, qty: 1 });
      lines.push(`봉인을 뜯자 안개가 스르르 새어 나왔다. 안에는 ${ITEMS[gid].name}${josa(ITEMS[gid].name, '이', '가')} 들어 있었다!`);
      reveal = { kind: 'gear', id: gid, item: ITEMS[gid] }; // 화면이 새 물건을 아직 모를 수 있어 함께 보냄
      logic.chron?.(d, 'mark', `안개 상자에서 ${ITEMS[gid].name}${josa(ITEMS[gid].name, '을', '를')} 꺼냈다.`);
    } else if (hit.kind === 'mat') {
      const mid = pickW(P.boxMat.pool), qty = randInt(P.boxMat.qty[0], P.boxMat.qty[1]), nm = ITEMS[mid].name;
      items.push({ id: mid, qty });
      lines.push(`상자 밑바닥, 천에 몇 겹이나 싸인 것이 있었다. 펼쳐 보니 ${nm}${josa(nm, '이', '가')} 나왔다!`);
      reveal = { kind: 'mat', id: mid, qty };
    } else if (hit.kind === 'potion') {
      const pid = pickW(P.boxPotion.pool), qty = randInt(P.boxPotion.qty[0], P.boxPotion.qty[1]), nm = ITEMS[pid].name;
      items.push({ id: pid, qty });
      lines.push(`상자 안에서 유리병이 부딪치는 소리가 났다. ${nm}${qty > 1 ? ` ${qty}병` : ''}${josa(qty > 1 ? '병' : nm, '이', '가')} 들어 있었다.`);
      reveal = { kind: 'potion', id: pid, qty };
    } else if (hit.kind === 'food') {
      const F = P.boxFood, pool = { ...F.pool }, got = [];
      for (let i = randInt(F.picks[0], F.picks[1]); i > 0 && Object.keys(pool).length; i--) { const k = pickW(pool); delete pool[k]; got.push({ id: k, qty: randInt(F.qty[0], F.qty[1]) }); }
      items.push(...got);
      lines.push(`상자 안에는 낯선 냄새가 나는 꾸러미가 들어 있었다: ${got.map((x) => `${ITEMS[x.id].name} ${x.qty}`).join(', ')}.`);
      reveal = { kind: 'food', items: got };
    } else {
      const qty = randInt(hit.qty[0], hit.qty[1]);
      items.push({ id: hit.id, qty });
      lines.push(`상자 바닥에서 ${ITEMS[hit.id].name}${josa(ITEMS[hit.id].name, '이', '가')} 굴러 나왔다.`);
      reveal = { kind: 'item', id: hit.id };
    }
    if (P.tokens) { items.push({ id: 'mist_token', qty: P.tokens }); lines.push(`${ITEMS.mist_token.name} ${P.tokens}개도 함께 들어 있었다.`); }
    return { title: ITEMS[id].name, lines, items, reveal };
  }

  // 증표로 고른 이국 장신구 하나 (능력치 나눔은 무작위)
  function trade(d, key, now = Date.now()) {
    if (!slotNow(now)) return { error: '행상인의 배가 닿아 있을 때만 바꿀 수 있다.' };
    if (!isHere(d)) return { error: `행상인은 ${where()} 어촌 선창에 있다.` };
    if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(P.gear, key)) return { error: '그런 장신구는 없다.' }; // '__proto__' 같은 값이 통과하지 않게
    const have = db.itemCount(d.id, 'mist_token') || 0;
    if (have < P.tokenTrade) return { error: `${ITEMS.mist_token.name}${josa(ITEMS.mist_token.name, '이', '가')} 모자란다. (${P.tokenTrade}개 필요, 지금 ${have}개)` };
    const gid = rollGear(key);
    return { title: P.name, lines: [`증표 ${P.tokenTrade}개를 내밀자 행상인이 배 안쪽 궤짝에서 ${ITEMS[gid].name}${josa(ITEMS[gid].name, '을', '를')} 꺼내 주었다.`], items: [{ id: 'mist_token', qty: -P.tokenTrade }, { id: gid, qty: 1 }], reveal: { kind: 'gear', id: gid, item: ITEMS[gid] } };
  }

  // 도착·떠남을 살펴 전체에 알림 (한 판에 한 번씩. 서버를 다시 켜도 거듭 알리지 않음)
  const refreshAll = () => { for (const e of online.values()) sendMe(e.socket, e.dragon); };
  let cur = null;
  function tick(now = Date.now()) {
    const s = slotNow(now);
    if (cur && (!s || s.key !== cur.key)) {
      if (st.gone !== cur.key) { st.gone = cur.key; save(); io.emit('system', { text: `[${P.name}] 배가 다시 안개 속으로 들어갔다. 다음에도 이 선창에 들른다고 했다.`, at: now }); }
      refreshAll();
    }
    if (s && (!cur || s.key !== cur.key)) {
      if (st.ann !== s.key) { st.ann = s.key; save(); io.emit('system', { text: `[${P.name}] ${where()} 앞바다의 안개를 가르고 낯선 돛이 나타났다. 이국의 행상인이 어촌 선창에 배를 댔다! (${P.minutes}분 뒤 떠난다)`, at: now }); }
      refreshAll();
    }
    cur = s;
  }
  const timer = setInterval(() => { try { tick(); } catch (e) { console.error('[행상인]', e); } }, 15000);
  timer.unref?.();
  setImmediate(() => { try { tick(); } catch (e) { console.error('[행상인]', e); } });

  // GM: 지금 바로 부르기 (minutes분 동안)
  function summon(minutes = P.minutes) { st.force = { key: `gm-${Date.now()}`, start: Date.now(), end: Date.now() + minutes * 60000 }; save(); tick(); }
  return { status, view, buy, openBox, trade, slotNow, daySlots, tick, summon };
};
