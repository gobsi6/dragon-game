// 대륙의 재앙: 모든 드래곤이 함께 맞서는 거대한 적
// - 가끔 야생 지역 하나에 나타남 (재앙이 떠나거나 쓰러진 뒤 BOSS.gapHours 사이에서 무작위로)
// - 체력은 모두가 함께 깎음. 그 지역에서 '맞서기'를 하면 BOSS.turns 턴 동안 싸우고 물러남 (사냥처럼 직접 또는 자동으로)
// - 한 번 맞설 때마다 입힌 피해만큼 경험치·금화. 쓰러뜨리면 입힌 피해 비율에 따라 모두에게 큰 보상
// - BOSS.lastsHours 안에 쓰러뜨리지 못하면 떠나 버림
// 상태는 world 표의 'boss'(지금 재앙)와 'boss_next'(다음 재앙이 오는 시각)에 저장
const { BOSSES, BOSS, REGIONS, ITEMS, SHOPS, RULES } = require('./game-data');

const HOUR = 3600000;
const str = (v) => (typeof v === 'string' ? v.trim() : '');
function josa(word, a, b) {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return `${a}(${b})`;
  return c % 28 ? a : b;
}
const ga = (n) => `${n}${josa(n, '이', '가')}`;
const eul = (n) => `${n}${josa(n, '을', '를')}`;
const rand = (a, b) => a + Math.random() * (b - a);

module.exports = function setupBoss({ io, db, online, logic, combat, arena, sendMe }) {
  let st = db.worldGet('boss', null);           // 지금 재앙 (없거나 끝났으면 done이 있음)
  let nextAt = db.worldGet('boss_next', null);  // 다음 재앙이 오는 시각
  const save = () => { db.worldSet('boss', st); db.worldSet('boss_next', nextAt); };
  const shout = (text) => io.emit('system', { text, at: Date.now() });
  const active = () => !!st && !st.done;
  const WILD = () => Object.keys(BOSSES).filter((r) => REGIONS[r] && !SHOPS[r]);
  if (!nextAt) { nextAt = Date.now() + rand(...BOSS.gapHours) * HOUR; save(); }

  // 순위: 입힌 피해가 큰 순서
  const ranking = () => Object.entries(st?.dmg || {}).map(([id, v]) => ({ id: Number(id), name: st.names[id] || '', dmg: v })).sort((a, b) => b.dmg - a.dmg);
  const total = () => Object.values(st?.dmg || {}).reduce((a, b) => a + b, 0);
  // 화면에 보낼 모습 (끝났으면 null)
  function view() {
    if (!active()) return null;
    const T = BOSSES[st.key];
    const r = ranking();
    const sum = total() || 1;
    return {
      id: st.id, key: st.key, region: st.region, name: T.name, desc: T.desc, type: T.type, lv: st.lv,
      weak: T.weak, resist: T.resist, special: T.special.name,
      hp: Math.max(0, Math.round(st.hp)), hpMax: st.hpMax, at: st.at, until: st.until, ap: BOSS.ap, turns: BOSS.turns,
      fighters: r.length,
      top: r.slice(0, 5).map((x) => ({ id: x.id, name: x.name, share: Math.round((x.dmg / sum) * 100) })),
      dmg: Object.fromEntries(r.map((x, i) => [x.id, { dmg: Math.round(x.dmg), rank: i + 1, share: Math.round((x.dmg / sum) * 100) }])),
    };
  }
  const push = () => io.emit('boss', view());

  // 재앙을 부름. key: 지역 (없으면 무작위). GM은 체력·레벨을 정할 수 있음
  function spawn(key, opt = {}) {
    if (active()) return { error: '이미 재앙이 대륙에 있다.' };
    const now = Date.now();
    const list = db.activeSince(now - BOSS.activeDays * 24 * HOUR);
    if (!list.length && !opt.force) return { error: '최근 접속한 드래곤이 없다.' };
    const regions = WILD().filter((r) => r !== logic.corruptedRegion(now));
    if (!key) key = regions[Math.floor(Math.random() * regions.length)];
    if (!BOSSES[key]) return { error: '그 지역에는 재앙이 나타나지 않는다.' };
    const avg = list.length ? list.reduce((a, x) => a + x.level, 0) / list.length : 3;
    const lv = Math.max(BOSS.lvMin, Math.min(BOSS.lvMax, opt.lv || Math.round(avg) + BOSS.lvAdd));
    const per = 80 + lv * 4; // 같은 레벨 드래곤이 한 번 맞설 때 입히는 피해 (대략)
    const hpMax = opt.hp || Math.round(per * BOSS.triesPerActive * Math.max(BOSS.minActive, list.length));
    st = { id: (st?.id || 0) + 1, key, region: key, lv, hp: hpMax, hpMax, at: now, until: now + BOSS.lastsHours * HOUR, dmg: {}, names: {}, tries: {}, news: [], last: null, done: null, paid: [] };
    save();
    const T = BOSSES[key];
    shout(`[대륙의 재앙] ${REGIONS[key].name}에 ${ga(T.name)} 나타났다! ${T.desc} 모든 드래곤이 힘을 모아야 한다. (${BOSS.lastsHours}시간 안에)`);
    push();
    return { ok: true, view: view() };
  }

  // 한 드래곤에게 보상을 주고 알림 (접속하지 않았으면 다음 접속 때 소식으로)
  function grant(id, fn) {
    const e = online.get(id);
    const d = e ? e.dragon : db.getDragon(id);
    if (!d || d.dead_at) return;
    const r = fn(d);
    if (!r) return;
    db.saveState(d, r.items || []);
    if (e) { sendMe(e.socket, d); e.socket.emit('notice', { title: r.title, lines: r.lines, items: r.items || [] }); }
    else for (const l of r.lines) db.noteAdd(id, l);
  }
  // 쓰러뜨린 사람 몫: 피해 비율로 금화, 모두 재앙의 핵, 상위는 하나 더와 귀한 물건
  function payOne(id, rank, share, lastId) {
    const T = BOSSES[st.key];
    grant(id, (d) => {
      const gold = Math.round(st.lv * (BOSS.goldBase + BOSS.goldShare * share));
      const ids = Array(BOSS.core).fill('calamity_core');
      if (rank <= BOSS.top) ids.push(...Array(BOSS.topCore).fill('calamity_core'), logic.rollItem(st.key, { uncommon: 0, rare: 1 }));
      const items = logic.bundle(ids);
      d.gold += gold;
      const lines = [`${eul(T.name)} 쓰러뜨렸다! 대륙의 드래곤들이 함께 이겨 냈다.`, `내가 입힌 피해는 전체의 ${Math.round(share * 100)}%, ${rank}위였다.`];
      const got = [...items.map(logic.itemLabel), `금화 ${gold}닢`].join(', ');
      lines.push(`${got}${josa(got, '을', '를')} 얻었다.`);
      const f1 = logic.addFame(d, BOSS.fame + (id === lastId ? BOSS.lastFame : 0));
      if (f1) lines.push(f1);
      lines.push(...logic.traitCount(d, 'bosswin'));
      if (id === lastId) { lines.push('마지막 일격은 나의 것이었다!'); lines.push(...logic.traitCount(d, 'bosslast')); }
      logic.chron(d, 'mark', `대륙의 재앙 ${eul(T.name)} 함께 쓰러뜨렸다. (${rank}위${id === lastId ? ', 마지막 일격' : ''})`);
      return { title: '대륙의 재앙', lines, items };
    });
  }
  function defeat(lastId) {
    const T = BOSSES[st.key];
    st.done = 'win';
    st.last = lastId;
    const sum = total() || 1;
    const r = ranking();
    save();
    shout(`[대륙의 재앙] ${ga(T.name)} 쓰러졌다! ${r.length}마리의 드래곤이 함께 맞섰다. 마지막 일격: ${st.names[lastId] || ''}${r[0] ? ` · 가장 큰 피해: ${r[0].name}` : ''}`);
    r.forEach((x, i) => { st.paid.push(x.id); payOne(x.id, i + 1, x.dmg / sum, lastId); });
    nextAt = Date.now() + rand(...BOSS.gapHours) * HOUR;
    save();
    push();
  }
  function gone() {
    const T = BOSSES[st.key];
    st.done = 'gone';
    nextAt = Date.now() + rand(...BOSS.gapHours) * HOUR;
    save();
    shout(`[대륙의 재앙] ${ga(T.name)} ${REGIONS[st.region].name}${josa(REGIONS[st.region].name, '을', '를')} 휩쓸고 어디론가 떠났다. 남은 체력 ${Math.round((st.hp / st.hpMax) * 100)}%.`);
    push();
  }

  // 맞서기: 사냥처럼 직접 싸우는 전투. 끝나면 입힌 피해를 모두의 체력에서 뺌
  function fight(d) {
    if (!active()) return { error: '지금 대륙에 재앙은 없다.' };
    if (d.region !== st.region) return { error: `${REGIONS[st.region].name}에 가야 맞설 수 있다.` };
    if (arena.inBattle(d.id)) return { error: '이미 싸우는 중이다.' };
    if (d.exp_end) return { error: '원정을 떠나 있는 동안에는 할 수 없다.' };
    if (d.rest_at) return { error: '둥지에서 쉬는 중이다. 먼저 깨어나야 한다.' };
    logic.regen(d);
    if (d.ap < BOSS.ap) return { error: `행동력이 모자란다. (${BOSS.ap} 필요)` };
    if (d.hp < RULES.huntMinHp) return { error: '기운이 없어 맞설 수 없다. 조금 쉬어야 한다.' };
    logic.spendAp(d, BOSS.ap);
    const b = combat.bossBattle(d, st);
    const bossId = st.id;
    const T = BOSSES[st.key];
    const c = { name: T.name, level: st.lv };
    const lines = [`${ga(T.name)} 앞을 가로막았다. 모두의 상처가 쌓인 몸이다. (남은 체력 ${Math.round((st.hp / st.hpMax) * 100)}%)`, `${BOSS.turns}턴 동안 싸우고 물러난다. 입힌 피해는 모두의 몫으로 남는다.`];
    if (b.b.enraged) lines.push(`${ga(T.name)} 분노해 있다! 공격이 거세다.`);
    const view = arena.startHunt(d, b, c, null, (dd, bb) => result(dd, bb, bossId));
    db.saveState(d);
    return { ok: true, battle: view, lines, title: `재앙 · ${T.name}` };
  }
  // 한 번 맞선 결과
  function result(d, b, bossId) {
    const me = b.a;
    d.hp = Math.max(1, Math.round(me.hp));
    d.en = Math.max(0, Math.round(me.en));
    const dealt = Math.max(0, Math.round(b.startHp - Math.max(0, b.b.hp)));
    const lines = [];
    const same = st && st.id === bossId;
    if (b.a.hp <= 0) lines.push('쓰러지기 직전, 다른 드래곤들 틈으로 겨우 몸을 뺐다.');
    lines.push(`${b.turn}턴 동안 ${b.b.name}에게 피해를 ${dealt} 입혔다.`);
    let killed = false;
    if (same) {
      st.dmg[d.id] = (st.dmg[d.id] || 0) + dealt;
      st.names[d.id] = d.name;
      st.tries[d.id] = (st.tries[d.id] || 0) + 1;
      if (!st.done) {
        const before = st.hp / st.hpMax;
        st.hp = Math.max(0, st.hp - dealt);
        const after = st.hp / st.hpMax;
        for (const t of BOSS.news) if (before > t && after <= t && !st.news.includes(t)) {
          st.news.push(t);
          shout(`[대륙의 재앙] ${ga(b.b.name)} 비틀거린다! 남은 체력 ${Math.round(after * 100)}%. (${REGIONS[st.region].name})`);
        }
        if (st.hp <= 0) killed = true;
        const v = view();
        const mine = v?.dmg[d.id];
        if (!killed && mine) lines.push(`지금까지 내가 입힌 피해 ${mine.dmg} · 전체의 ${mine.share}% · ${mine.rank}위. 재앙의 남은 체력 ${Math.round(after * 100)}%.`);
      } else if (st.done === 'win' && !st.paid.includes(d.id)) {
        // 싸우는 사이 다른 드래곤이 쓰러뜨렸으면 그래도 몫을 받음
        st.paid.push(d.id);
        const sum = total() || 1;
        const r = ranking();
        setImmediate(() => payOne(d.id, r.findIndex((x) => x.id === d.id) + 1, st.dmg[d.id] / sum, st.last));
        lines.push('싸우는 사이 재앙이 쓰러졌다! 나의 몫도 받는다.');
      }
      save();
    }
    const gold = Math.round(dealt * BOSS.goldPerDmg);
    d.gold += gold;
    const xp = logic.xpOf(d, Math.round(BOSS.xpBase + dealt * BOSS.xpPerDmg));
    const levelUp = logic.gainXp(d, xp);
    if (gold) lines.push(`흩어진 비늘 사이에서 금화 ${gold}닢을 주웠다.`);
    lines.push(`체력을 ${Math.round(me.hpMax - me.hp)} 잃었다.`);
    if (killed) setImmediate(() => defeat(d.id)); else setImmediate(push);
    return { title: `대륙의 재앙`, lines, items: [], gold, xp, levelUp, win: killed, turns: b.turn, fall: false, dealt, wound: d.hp <= logic.hpCap(d) * 0.15 };
  }

  // 1분마다: 시간이 다 되면 떠나고, 때가 되면 새 재앙
  const ticker = setInterval(() => {
    const now = Date.now();
    if (active() && st.until <= now) gone();
    else if (!active() && nextAt && now >= nextAt) {
      const r = spawn();
      if (r.error) { nextAt = now + HOUR; save(); }
    }
  }, 60000);
  ticker.unref?.();

  function attach(socket) {
    const me = () => { const e = online.get(socket.data.dragonId); return e && e.socket === socket ? e.dragon : null; };
    socket.on('boss:get', (p, ack) => { if (typeof ack === 'function') ack({ ok: true, boss: view() }); });
    socket.on('boss:fight', (p, ack) => {
      if (typeof ack !== 'function') return;
      const d = me();
      if (!d) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
      if (logic.berserkOf(d)) return ack({ error: '광폭화한 몸이 제멋대로 날뛴다.' });
      if (logic.isFallen(d)) return ack({ error: '쓰러져 있다.' });
      const r = fight(d);
      if (!r.error) sendMe(socket, d);
      ack(r);
    });
    // GM: 재앙 부르기·끝내기·체력 정하기
    const gm = (ev, fn) => socket.on(ev, (p, ack) => {
      if (typeof ack !== 'function') return;
      if (!socket.data.user?.is_gm) return ack({ error: 'GM만 쓸 수 있다.' });
      const r = fn(p || {});
      if (!r.error) { db.gmLog(socket.data.user.username, null, r.gmlog); delete r.gmlog; r.log = db.gmLogList(40); }
      ack(r);
    });
    gm('gm:boss:spawn', (p) => {
      const key = str(p.key) || null;
      const r = spawn(key, { force: true, lv: Number(p.lv) || 0, hp: Number(p.hp) || 0 });
      return r.error ? r : { ok: true, view: r.view, gmlog: `대륙의 재앙을 불렀다: ${r.view.name} (${REGIONS[r.view.region].name}, Lv.${r.view.lv}, 체력 ${r.view.hpMax})` };
    });
    gm('gm:boss:hp', (p) => {
      if (!active()) return { error: '지금 재앙이 없다.' };
      const pct = Number(p.pct);
      if (!(pct > 0 && pct <= 100)) return { error: '1~100 사이로 적자.' };
      st.hp = Math.max(1, Math.round(st.hpMax * pct / 100));
      save(); push();
      return { ok: true, view: view(), gmlog: `재앙의 체력을 ${pct}%로 정했다.` };
    });
    gm('gm:boss:end', () => {
      if (!active()) return { error: '지금 재앙이 없다.' };
      gone();
      return { ok: true, gmlog: '재앙을 떠나보냈다.' };
    });
    gm('gm:boss:next', (p) => {
      const h = Number(p.hours);
      if (!(h >= 0 && h <= 240)) return { error: '0~240시간 사이로 적자.' };
      nextAt = Date.now() + h * HOUR;
      save();
      return { ok: true, nextAt, gmlog: `다음 재앙을 ${h}시간 뒤로 정했다.` };
    });
  }

  return { attach, view, spawn, nextAt: () => nextAt, _state: () => st };
};
