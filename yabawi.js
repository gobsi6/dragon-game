// 떠돌이 야바위꾼: 하루 네 번, 한 시간씩 대륙 어딘가에 판을 벌이는 홀짝 놀이 (숫자·대사는 game-data.js의 YABAWI)
// 시간표는 날짜와 비밀값(world 'yabawi'.salt)으로 정해지므로 서버를 다시 켜도 같고, 코드를 봐도 미리 알 수 없다
const crypto = require('crypto');
const { REGIONS, REGION_PLACES, PLACES, YABAWI: Y } = require('./game-data');

const DAY = 86400000, KST = 9 * 3600000;
// 본 대륙 야생 지역 (마을과 멸망한 대륙은 빼고)
const WILD = Object.keys(REGION_PLACES).filter((r) => REGIONS[r] && REGIONS[r].realm !== 'ruin' && !REGIONS[r].town && Y.hints[r]);
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, l) => l[Math.floor(r() * l.length)];
// 판을 벌일 수 있는 장소: 지역의 앞쪽 몇 곳 (깊은 고레벨 구역은 낮은 레벨이 들어가지 못하므로 뺌)
const spots = (region) => REGION_PLACES[region].slice(0, Y.placeDepth || REGION_PLACES[region].length);

// isOpen(지역): 멸망한 대륙의 그 지역이 열렸는지 (소문을 정화도에 맞춰 풀어 줌)
module.exports = function setupYabawi({ io, db, online, logic, sendMe, isOpen = () => true }) {
  const st = db.worldGet('yabawi') || {};
  if (!st.salt) { st.salt = crypto.randomInt(1, 2 ** 31); db.worldSet('yabawi', st); }
  const save = () => db.worldSet('yabawi', st);

  // 그날(한국 날짜)의 시간표: [{ key, start, end, region, place }]
  const dayCache = new Map();
  function daySlots(day) {
    if (dayCache.has(day)) return dayCache.get(day);
    const r = rng(st.salt ^ Math.imul(day, 2654435761));
    const dayStart = day * DAY - KST;
    const span = Math.floor(1440 / Y.perDay);
    const out = [];
    let last = null;
    for (let i = 0; i < Y.perDay; i++) {
      const from = i * span + Y.edge, to = (i + 1) * span - Y.minutes - Y.edge;
      const startMin = from + Math.floor(r() * Math.max(1, to - from));
      let region = pick(r, WILD);
      if (region === last && WILD.length > 1) region = WILD[(WILD.indexOf(region) + 1) % WILD.length]; // 같은 곳에 연달아 나타나지 않게
      last = region;
      const start = dayStart + startMin * 60000;
      out.push({ key: `${day}-${i}`, start, end: start + Y.minutes * 60000, region, place: pick(r, spots(region)) });
    }
    dayCache.set(day, out);
    if (dayCache.size > 4) dayCache.delete(dayCache.keys().next().value);
    return out;
  }
  // 지금 판을 벌이고 있는 곳 (GM이 부른 판이 있으면 그쪽)
  function slotNow(now = Date.now()) {
    if (st.force && now < st.force.end) return st.force;
    const day = Math.floor((now + KST) / DAY);
    return daySlots(day).find((s) => now >= s.start && now < s.end) || null;
  }
  // 장소는 게임과 같은 방식으로 읽음 (지역에 막 내려앉으면 장소 값이 비어 있고 입구로 간주함)
  const isHere = (d, s) => !!s && !d.exp_end && d.region === s.region && logic.placeOf(d) === s.place;
  // 드래곤마다의 기록 (combat JSON): { met: 마지막으로 말 건 판, said: 마지막으로 소문을 들은 판, heard: [들은 소문 id] }
  const ybOf = (d) => { const c = logic.combatJson(d); if (!c.yb || typeof c.yb !== 'object') c.yb = {}; if (!Array.isArray(c.yb.heard)) c.yb.heard = []; return c.yb; };
  const RUMOR_TITLE = 'yb_regular';
  const wearing = (d) => logic.titlesOf(d).on === RUMOR_TITLE;
  const rumorState = (d, s) => (!wearing(d) ? 'locked' : ybOf(d).said === s.key ? 'used' : 'ok');
  // 지금 들려줄 수 있는 소문: 에레보스 이야기는 열린 지역만, 예고는 아직 닫힌 지역만
  const rumorPool = () => Y.rumors.filter((r) => (r.kind === 'ruin' ? isOpen(r.region) : r.kind === 'tease' ? !isOpen(r.region) : r.kind === 'raid' ? isOpen(`raid:${r.raid}`) : true)); // raid: 그 레이드를 누군가 처음 쓰러뜨린 뒤
  // 내 정보에 붙임: 같은 장소에 있을 때만 (다른 곳에서는 어디 있는지 알려 주지 않음)
  function here(d, now = Date.now()) {
    const s = slotNow(now);
    return isHere(d, s) ? { name: Y.name, until: s.end, greet: Y.greet, minBet: Y.minBet, maxBet: Y.maxBet, rumor: rumorState(d, s), rumorLocked: Y.rumorLocked, rumorUsed: Y.rumorUsed, heard: ybOf(d).heard.length, rumors: Y.rumors.length } : null;
  }
  // 지금 판이 벌어져 있으면 모두에게 보일 것: 힌트와 떠나는 시각 (어느 장소인지는 알려 주지 않음)
  const nowInfo = (now = Date.now()) => { const s = slotNow(now); return s ? { hint: Y.hints[s.region] || '대륙 어딘가에서', until: s.end } : null; };
  // 그 장소에 있는 드래곤들 화면을 새로 고침 (말 걸기 버튼이 생기거나 사라지게)
  function refreshAt(s) {
    if (!s) return;
    for (const e of online.values()) if (e.dragon.region === s.region && logic.placeOf(e.dragon) === s.place) sendMe(e.socket, e.dragon);
  }
  // 나타남·떠남을 살펴 전체에 알림 (한 판에 한 번씩. 서버를 다시 켜도 거듭 알리지 않음)
  let cur = null;
  function tick(now = Date.now()) {
    const s = slotNow(now);
    if (cur && (!s || s.key !== cur.key)) {
      if (st.gone !== cur.key) { st.gone = cur.key; save(); io.emit('system', { text: `[${Y.name}] 야바위꾼이 판을 접고 어디론가 사라졌다.`, at: now }); }
      refreshAt(cur);
      if (!s) io.emit('yabawi:now', null);
    }
    if (s && (!cur || s.key !== cur.key)) {
      if (st.ann !== s.key) {
        st.ann = s.key; save();
        io.emit('system', { text: `[${Y.name}] ${Y.hints[s.region] || '대륙 어딘가에서'} 조약돌 굴리는 소리가 들려온다. 떠돌이 야바위꾼이 판을 벌였다! (한 시간 뒤 떠난다)`, at: now });
      }
      refreshAt(s);
      io.emit('yabawi:now', nowInfo(now));
    }
    cur = s;
  }
  const timer = setInterval(() => { try { tick(); } catch (e) { console.error('[야바위꾼]', e); } }, 15000);
  timer.unref?.();
  setImmediate(() => { try { tick(); } catch (e) { console.error('[야바위꾼]', e); } });

  // 한 판: bet 금화, pick 'odd'(홀) | 'even'(짝)
  function play(d, bet, pickOE, now = Date.now()) {
    const s = slotNow(now);
    if (!isHere(d, s)) return { error: '야바위꾼은 이미 떠났거나 여기에 없다.' };
    bet = Math.floor(Number(bet));
    if (!Number.isFinite(bet) || bet < Y.minBet) return { error: `금화를 ${Y.minBet}닢 이상 걸어야 한다.` };
    if (Y.maxBet && bet > Y.maxBet) return { error: `한 판에 금화 ${Y.maxBet}닢까지만 걸 수 있다.` };
    if (bet > (d.gold || 0)) return { error: '가진 금화보다 많이 걸 수는 없다.' };
    if (pickOE !== 'odd' && pickOE !== 'even') return { error: '홀이나 짝을 골라야 한다.' };
    const stones = 1 + crypto.randomInt(10); // 1~10개: 홀 다섯, 짝 다섯 → 정확히 반반
    const odd = stones % 2 === 1;
    const win = (pickOE === 'odd') === odd;
    d.gold += win ? bet : -bet;
    const lines = [
      `${pickOE === 'odd' ? '홀' : '짝'}에 금화 ${bet}닢을 걸었다.`,
      `야바위꾼이 주먹을 폈다. 조약돌 ${stones}개, ${odd ? '홀' : '짝'}이다.`,
      win ? `맞혔다! 금화 ${bet}닢을 땄다.` : `틀렸다. 금화 ${bet}닢을 잃었다.`,
    ];
    lines.push(...logic.traitCount(d, 'yabawi'));
    if (win) lines.push(...logic.traitCount(d, 'yabawiwin'));
    if (bet >= Y.bigBet) logic.chron(d, 'mark', win ? `떠돌이 야바위꾼에게서 금화 ${bet}닢을 따냈다.` : `떠돌이 야바위꾼에게 금화 ${bet}닢을 잃었다.`, now);
    return { ok: true, win, stones, pick: pickOE, bet, gold: d.gold, say: pick(Math.random, win ? Y.win : Y.lose), lines };
  }
  // 말을 걸면: 이번 판에 처음이면 '만난 횟수'를 하나 셈 (칭호 '야바위꾼의 단골')
  function talk(d, now = Date.now()) {
    const s = slotNow(now);
    if (!isHere(d, s)) return { error: '야바위꾼은 이미 떠났거나 여기에 없다.' };
    const yb = ybOf(d);
    if (yb.met === s.key) return { ok: true, lines: [] };
    yb.met = s.key;
    return { ok: true, first: true, lines: logic.traitCount(d, 'yabawimeet') };
  }
  // 소문 하나: '야바위꾼의 단골'을 달고 있을 때, 나타날 때마다 한 번. 안 들은 것부터
  function rumor(d, now = Date.now()) {
    const s = slotNow(now);
    if (!isHere(d, s)) return { error: '야바위꾼은 이미 떠났거나 여기에 없다.' };
    const st = rumorState(d, s);
    if (st === 'locked') return { error: Y.rumorLocked };
    if (st === 'used') return { error: Y.rumorUsed };
    const yb = ybOf(d);
    const pool = rumorPool();
    const fresh = pool.filter((r) => !yb.heard.includes(r.id));
    const r = (fresh.length ? fresh : pool)[crypto.randomInt((fresh.length ? fresh : pool).length)];
    yb.said = s.key;
    const isNew = !yb.heard.includes(r.id);
    const lines = [];
    if (isNew) { yb.heard.push(r.id); lines.push(...logic.traitCount(d, 'rumor')); }
    return { ok: true, id: r.id, kind: Y.rumorKinds[r.kind] || '소문', text: isNew ? r.text : `전에도 한 얘기지만… ${r.text}`, isNew, heard: yb.heard.length, total: Y.rumors.length, lines };
  }
  // GM: 지금 바로 한 시간 동안 판을 벌임 (지역을 주지 않으면 아무 데나)
  function summon(region, now = Date.now()) {
    const r = WILD.includes(region) ? region : WILD[crypto.randomInt(WILD.length)];
    const pl = spots(r);
    st.force = { key: `gm-${now}`, start: now, end: now + Y.minutes * 60000, region: r, place: pl[crypto.randomInt(pl.length)] };
    save();
    tick(now);
    return st.force;
  }
  const where = (now = Date.now()) => { const s = slotNow(now); return s ? { region: s.region, regionName: REGIONS[s.region].name, place: s.place, placeName: PLACES[s.place]?.name, until: s.end } : null; };
  return { here, nowInfo, play, talk, rumor, summon, where, daySlots, slotNow, tick };
};
