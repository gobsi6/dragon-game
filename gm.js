// GM 도구: 드래곤 찾기·살펴보기, 금화·물건 주고 빼기, 회복, 수치 고치기, 순간이동,
// 이벤트 일으키기, 둥지 식구 손보기, 공지, 일괄 지급, GM 권한, 접속 끊기, GM 기록
//
// 접속 중인 드래곤은 서버가 들고 있는 그 객체를 고쳐야 함
// (DB만 고치면 그 드래곤이 다음에 저장할 때 옛 값으로 덮어씀)
const { REGIONS, ITEMS, STANCES, KINDS, KIN, DAY, TRAITS, STATS, NEST } = require('./game-data');
const EVENTS = require('./game-events');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const int = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : NaN);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function josa(word, a, b) {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return `${a}(${b})`;
  return (c - 0xac00) % 28 ? a : b;
}
const ORIGINS = { abandoned: '버려진 아기', lost: '길 잃은 아이', tribute: '공물로 바쳐진 아이' };
const ANNOUNCE_MAX = 300;
const GIVE = { maxKinds: 20, maxQty: 9999, msgMax: 100 }; // 일괄 지급: 한 번에 고를 수 있는 물건 종류, 종류당 개수, 함께 보낼 말

module.exports = function setupGm({ io, db, online, logic, life, meOf, sendMe, refreshKin, teleport, kick, arena, presence, nestSync }) {
  // 대상 드래곤을 불러 고치고 저장. 접속 중이면 화면도 새로 고침
  // fn(d, kin, now) → { error } 또는 { log, tell, items, kinChanged }
  function withTarget(id, notify, fn) {
    const entry = online.get(id);
    const d = entry ? entry.dragon : db.getDragon(id);
    if (!d) return { error: '그런 드래곤은 없다.' };
    const now = Date.now();
    logic.regen(d, now);
    const kin = db.kinLoad(d.id);
    const before = life.tick(d, kin, now);          // 밀린 시간 먼저 계산
    const r = fn(d, kin, now) || {};
    if (r.error) return r;
    refreshKin(d, kin);
    db.saveState(d, [...before.items, ...(r.items || [])], before.hoardItems);
    if (!entry && d._forceRaid && nestSync) nestSync(null, d); // 접속하지 않은 드래곤의 둥지에도 도둑을 보냄
    // 식구를 손봤으면 바뀐 나이대로 한 번 더 흘려서 성장·부화 소식을 바로 만듦
    let lines = before.lines;
    if (r.kinChanged) {
      const k2 = db.kinLoad(d.id);
      const t = life.tick(d, k2, now);
      refreshKin(d, k2);
      db.saveState(d, t.items, t.hoardItems);
      lines = [...lines, ...t.lines];
    }
    const tell = [...(notify && r.tell ? [r.tell] : []), ...lines];
    if (entry) {
      sendMe(entry.socket, d);
      if (tell.length) entry.socket.emit('notice', { title: '대륙의 목소리', lines: tell, items: r.items || [] });
    } else {
      for (const t of tell) db.noteAdd(d.id, t);
    }
    if (r.after) r.after(d);
    return { ok: true, log: r.log, d };
  }

  // GM 화면에 보여 줄 드래곤의 모든 것
  function detail(id) {
    const entry = online.get(id);
    const d = entry ? entry.dragon : db.getDragon(id);
    if (!d) return null;
    const now = Date.now();
    logic.regen(d, now);
    const kin = db.kinLoad(d.id);
    d.perks = life.perksOf(kin);
    d.kinSummary = life.summary(kin, now);
    const u = db.gmUserOf(d.id);
    let ev = null;
    try { ev = d.pending_event ? JSON.parse(d.pending_event).id : null; } catch {}
    return {
      ...meOf(d),
      region: d.region,
      username: u?.username || '', isGm: !!u?.is_gm,
      online: !!entry,
      lastSeen: entry ? now : d.last_seen,
      eventId: ev,
      items: db.inventory(d.id),
      hoard: d.nest ? db.hoard(d.id) : [],
      kinAll: kin.map((k) => ({
        id: k.id, type: k.type, status: k.status, name: k.name,
        kind: k.data.kind || null,
        age: k.data.born ? +((now - k.data.born) / DAY).toFixed(1) : null,
        stage: k.status === 'home' || k.status === 'egg' ? life.stageOf(k, now).name : null,
        bond: k.data.bond ?? null,
        incubating: k.status === 'egg' ? !!k.data.incubateAt : null,
        eggDays: k.status === 'egg' ? +((now - k.data.found) / DAY).toFixed(1) : null,
        talent: k.data.talent || null, path: k.data.path || null,
      })),
    };
  }

  const findKin = (kin, kinId) => kin.find((k) => k.id === int(kinId));
  const living = (k) => k && (k.status === 'home' || k.status === 'egg');

  // 동작 하나하나. p: 화면에서 보낸 값
  const OPS = {
    gold(d, kin, now, p) {
      const n = int(p.n);
      if (!n || Math.abs(n) > 1e7) return { error: '금화 숫자를 확인하자.' };
      const before = d.gold;
      d.gold = Math.max(0, d.gold + n);
      const real = d.gold - before;
      return {
        log: `금화 ${real > 0 ? '+' : ''}${real}`,
        tell: real > 0 ? `하늘에서 금화 ${real}닢이 내려왔다.` : `금화 ${-real}닢이 바람에 흩어졌다.`,
      };
    },
    item(d, kin, now, p) {
      const id = str(p.item);
      let n = int(p.qty);
      if (!ITEMS[id]) return { error: '그런 물건은 없다.' };
      if (!n || Math.abs(n) > 9999) return { error: '개수를 확인하자.' };
      if (n < 0) n = -Math.min(-n, db.itemCount(d.id, id));
      if (!n) return { error: '그 물건을 갖고 있지 않다.' };
      const nm = ITEMS[id].name;
      return {
        items: [{ id, qty: n }],
        log: `${nm} ${n > 0 ? '+' : ''}${n}`,
        tell: n > 0 ? `하늘에서 ${nm} ${n}개가 내려왔다.` : `${nm} ${-n}개가 소지품에서 사라졌다.`,
      };
    },
    heal(d, kin, now) {
      d.hp = logic.hpCap(d); d.en = logic.enCap(d); d.ap = logic.apCap(d);
      d.hp_at = now; d.en_at = now; d.ap_at = now;
      return { log: '체력·기력·행동력 가득 채움', tell: '따스한 기운이 온몸을 채운다. 체력·기력·행동력이 가득 찼다.' };
    },
    xp(d, kin, now, p) {
      const n = int(p.n);
      if (!(n > 0) || n > 1e6) return { error: '경험치 숫자를 확인하자.' };
      const up = logic.gainXp(d, n);
      return { log: `경험치 +${n}${up ? ` (레벨 +${up})` : ''}`, tell: `경험치 ${n}을 얻었다.${up ? ` 레벨이 올랐다! Lv. ${d.level}` : ''}` };
    },
    mind(d, kin, now, p) {
      const v = int(p.value);
      if (Number.isNaN(v)) return { error: '숫자를 확인하자.' };
      if (logic.berserkOf(d)) return { error: '광폭화 중이다. 먼저 광폭화를 풀자.' };
      d.mind = clamp(v, 0, 100);
      d.mind_at = now;
      return { log: `정신 → ${d.mind}`, after: (x) => arena.checkMind(x) };
    },
    calm(d) {
      if (!logic.berserkOf(d)) return { error: '광폭화하지 않았다.' };
      arena.endBerserk(d, 'calmed', { name: 'GM' });
      return { log: '광폭화 풀기 (피해 없이)' };
    },
    statPts(d, kin, now, p) {
      const n = int(p.n);
      if (!n || Math.abs(n) > 999) return { error: '숫자를 확인하자.' };
      const before = d.stat_pts || 0;
      d.stat_pts = Math.max(0, before + n);
      const real = d.stat_pts - before;
      return { log: `능력치 포인트 ${real > 0 ? '+' : ''}${real}`, tell: real > 0 ? `능력치 포인트 ${real}을 받았다. 드래곤 기록에서 나눌 수 있다.` : null };
    },
    fame(d, kin, now, p) {
      const v = int(p.value);
      if (Number.isNaN(v)) return { error: '숫자를 확인하자.' };
      d.fame = clamp(v, -100, 100);
      return { log: `용족 명성 → ${d.fame}` };
    },
    rep(d, kin, now, p) {
      const region = str(p.region);
      const v = int(p.value);
      if (!REGIONS[region]) return { error: '없는 지역이다.' };
      if (Number.isNaN(v)) return { error: '숫자를 확인하자.' };
      const r = logic.repOf(d);
      r[region] = clamp(v, -100, 100);
      return { log: `${REGIONS[region].name} 평판 → ${r[region]}` };
    },
    // 이름 바꾸기: 드래곤 만들 때와 같은 규칙 (한글·영문·숫자 2~12자, 겹치는 이름 안 됨)
    rename(d, kin, now, p) {
      const name = str(p.name);
      if (!/^[가-힣A-Za-z0-9]{2,12}$/.test(name)) return { error: '이름은 한글, 영문, 숫자로 2~12자까지 쓸 수 있다.' };
      if (name === d.name) return { error: '지금 이름과 같다.' };
      const owner = db.dragonNameOwner(name);
      if (owner && owner !== d.id) return { error: '이미 대륙에 같은 이름의 드래곤이 있다.' };
      const old = d.name;
      d.name = name;
      db.setNameKind(d.id, d.name, d.kind);
      logic.chron(d, 'mark', `이름이 '${old}'에서 '${name}'${josa(name, '으로', '로')} 바뀌었다.`);
      return { log: `이름: ${old} → ${name}`, tell: `이제부터 '${name}'${josa(name, '이라', '라')} 불린다.`, after: presence };
    },
    // 종족 바꾸기. restat이면 타고난 능력치도 새 종족에 맞게 (두 종족 기본값의 차이만큼, 나눈 포인트·상흔은 그대로)
    kind(d, kin, now, p) {
      const k = str(p.kind);
      if (!KINDS[k]) return { error: '없는 종족이다.' };
      if (k === d.kind) return { error: '지금 종족과 같다.' };
      const old = d.kind;
      const out = [];
      if (p.restat) {
        const a = KINDS[old].stats, b = KINDS[k].stats;
        const before = { scale: d.scale, wisdom: d.wisdom };
        for (const { key } of STATS) d[key] = Math.max(1, d[key] + (b[key] - a[key]));
        d.hp_max = Math.max(10, d.hp_max + (d.scale - before.scale) * 5); // 비늘 1 = 최대 체력 5
        d.en_max = Math.max(5, d.en_max + (d.wisdom - before.wisdom) * 2); // 지혜 1 = 최대 기력 2
        d.hp = Math.min(d.hp, logic.hpCap(d));
        d.en = Math.min(d.en, logic.enCap(d));
        out.push('능력치도 새 종족에 맞게');
      }
      d.kind = k;
      db.setNameKind(d.id, d.name, d.kind);
      logic.chron(d, 'mark', `${KINDS[old].name}에서 ${KINDS[k].name}${josa(KINDS[k].name, '으로', '로')} 다시 태어났다.`);
      return { log: `종족: ${KINDS[old].name} → ${KINDS[k].name}${out.length ? ` (${out.join(', ')})` : ''}`, tell: `비늘 색이 바뀌고 숨결이 달라졌다. 이제 ${KINDS[k].name}이다.`, after: presence };
    },
    stance(d, kin, now, p) {
      const s = str(p.stance);
      if (!STANCES[s]) return { error: '알 수 없는 성향이다.' };
      d.stance = s;
      d.stance_at = 0;
      return { log: `성향 → ${STANCES[s]}` };
    },
    cooldowns(d, kin) {
      d.stance_at = 0;
      for (const k of kin) {
        if (k.type === 'human' && k.status === 'home') k.data.lastCare = Date.now() - KIN.human.careCooldown;
        if (k.type === 'drake' && k.status === 'home') k.data.lastTrain = 0;
      }
      return { log: '대기 시간 초기화 (성향 바꾸기, 식구 돌보기·가르치기)' };
    },
    teleport(d, kin, now, p) {
      const to = str(p.region);
      if (!REGIONS[to]) return { error: '없는 지역이다.' };
      if (d.region === to) return { error: '이미 그곳에 있다.' };
      if (d.exp_end) return { error: '원정 중에는 옮길 수 없다. 먼저 원정을 끝내자.' };
      if (d.rest_at) d.rest_at = null;
      const from = d.region;
      d.region = to;
      teleport(d, from);
      return { log: `${REGIONS[from].name} → ${REGIONS[to].name} 순간이동`, tell: `거센 바람이 몸을 휘감더니, 정신을 차리자 ${REGIONS[to].name}에 와 있었다.` };
    },
    expDone(d, kin, now) {
      if (!d.exp_end) return { error: '원정 중이 아니다.' };
      const left = d.exp_end - now;
      // 출발 시각도 같이 당겨서, 원래 정한 길이만큼 다녀온 것으로
      if (left > 0) { d.exp_start -= left; d.exp_end = now; }
      return { log: '원정 바로 끝내기', tell: '원정이 끝났다. 결과를 받으러 가자.' };
    },
    event(d, kin, now, p) {
      if (d.pending_event) return { error: '이미 기다리는 이벤트가 있다. 먼저 지우자.' };
      const r = life.forceEvent(d, kin, (id) => db.itemCount(d.id, id), str(p.event), !!p.ignoreCond, now);
      if (r.error) return r;
      return { log: `이벤트 '${r.title}' 일으킴` };
    },
    eventClear(d) {
      if (!d.pending_event) return { error: '기다리는 이벤트가 없다.' };
      d.pending_event = null;
      return { log: '기다리는 이벤트 지움' };
    },
    trait(d, kin, now, p) {
      const id = str(p.trait);
      if (!TRAITS[id]) return { error: '그런 특성은 없다.' };
      const t = logic.traitsOf(d);
      const on = !!p.on;
      if (on === t.list.includes(id)) return { error: on ? '이미 가진 특성이다.' : '갖고 있지 않은 특성이다.' };
      t.list = on ? [...t.list, id] : t.list.filter((x) => x !== id);
      t.chosen = true;
      d.hp = Math.min(d.hp, logic.hpCap(d)); d.en = Math.min(d.en, logic.enCap(d));
      const nm = TRAITS[id].name;
      return { log: `특성 ${on ? '+' : '−'} ${nm}`, tell: on ? `새 특성 '${nm}'${josa(nm, '이', '가')} 생겼다. ${TRAITS[id].desc}` : `'${nm}' 특성이 사라졌다.` };
    },
    // ── 둥지 식구 ──
    kinAge(d, kin, now, p) {
      const k = findKin(kin, p.kin);
      const days = Number(p.days);
      if (!living(k)) return { error: '함께 사는 식구가 아니다.' };
      if (!(days > 0) || days > 60) return { error: '날 수를 확인하자 (0~60).' };
      if (k.status === 'egg') {
        if (k.data.incubateAt) k.data.incubateAt -= days * DAY;
        else k.data.found -= days * DAY;
      } else k.data.born -= days * DAY;
      return { kinChanged: true, log: `${k.name} 시간 ${days}일 앞당김` };
    },
    kinHatch(d, kin, now, p) {
      const k = findKin(kin, p.kin);
      if (!k || k.status !== 'egg') return { error: '알이 아니다.' };
      k.data.incubateAt = now - KIN.drake.hatchTime;
      return { kinChanged: true, log: `${k.name}의 알 바로 깨움` };
    },
    kinBond(d, kin, now, p) {
      const k = findKin(kin, p.kin);
      const v = int(p.value);
      if (!living(k) || k.status === 'egg') return { error: '깨어 있는 식구가 아니다.' };
      if (Number.isNaN(v)) return { error: '숫자를 확인하자.' };
      k.data.bond = clamp(v, 0, 100);
      return { log: `${k.name} 유대 → ${k.data.bond}` };
    },
    nestTier(d, kin, now, p) {
      if (!d.nest) return { error: '둥지가 없는 드래곤이다.' };
      const t = int(p.tier);
      if (!NEST.tiers[t]) return { error: '그런 둥지 단계는 없다.' };
      logic.nestInfo(d).tier = t;
      return { log: `둥지 단계 → ${NEST.tiers[t].name}` };
    },
    raid(d) {
      if (!d.nest) return { error: '둥지가 없는 드래곤이다.' };
      const ni = logic.nestInfo(d);
      if (ni.raid) return { error: '이미 도둑이 들어 있다.' };
      if (!(d.hoard_gold > 0) && !db.hoard(d.id).length) return { error: '보물더미가 비어 있다.' };
      ni.calm = 0;
      d._forceRaid = true; // 다음 내 정보 계산 때 바로 도둑이 듦 (덫·결계는 그대로 작동)
      return { log: '보물 도둑을 보냄' };
    },
    raidClear(d) {
      const ni = logic.nestInfo(d);
      ni.raid = null; ni.calm = 0; ni.raidAt = Date.now();
      return { log: '도둑 일과 쉬는 시간을 지움' };
    },
    kinAdd(d, kin, now, p) {
      if (!d.nest) return { error: '둥지가 없는 드래곤이다.' };
      if (life.homeKin(kin, logic.maxKinOf(d)).full) return { error: `식구가 가득하다 (최대 ${logic.maxKinOf(d)}).` };
      let k;
      if (str(p.type) === 'human') {
        const origin = ORIGINS[str(p.origin)] ? str(p.origin) : 'abandoned';
        k = life.newHuman(origin, now, null);
      } else {
        const kind = KINDS[str(p.kind)] ? str(p.kind) : d.kind;
        k = life.newEgg(kind, now);
      }
      kin.push(k);
      return {
        kinChanged: true,
        log: `식구 추가: ${k.type === 'human' ? `인간 아이 ${k.name} (${ORIGINS[k.data.origin]})` : `${KINDS[k.data.kind].name}의 알`}`,
        tell: k.type === 'human' ? `둥지에 ${k.name}${josa(k.name, '이라는', '라는')} 아이가 맡겨졌다.` : `둥지에 ${KINDS[k.data.kind].name}의 알이 놓여 있었다.`,
      };
    },
    kinRemove(d, kin, now, p) {
      const k = findKin(kin, p.kin);
      if (!k) return { error: '그런 식구는 없다.' };
      kin.splice(kin.indexOf(k), 1);
      db.kinDelete(k.id, d.id);
      return { log: `식구 기록 지움: ${k.name}` };
    },
  };

  function attach(socket) {
    const isGm = () => !!socket.data.user?.is_gm;
    const gmName = () => socket.data.user.username;
    // GM만 쓸 수 있는 요청
    const on = (ev, fn) => socket.on(ev, (p, ack) => {
      if (typeof ack !== 'function') return;
      if (!isGm()) return ack({ error: 'GM만 쓸 수 있다.' });
      try { ack(fn(p || {}) || { ok: true }); } catch (e) {
        console.error('[GM]', ev, e);
        ack({ error: '처리하다 문제가 생겼다. 서버 기록을 확인하자.' });
      }
    });

    on('gm:meta', () => ({
      ok: true,
      events: EVENTS.map((e) => ({ id: e.id, title: e.title, when: e.when })),
      origins: ORIGINS,
      log: db.gmLogList(40),
    }));

    on('gm:list', (p) => ({
      ok: true,
      dragons: db.gmList(str(p.q)).map((x) => ({
        id: x.id, name: x.name, kind: x.kind, level: x.level, region: x.region, gold: x.gold,
        av: x.has_avatar ? x.avatar_ver : 0, username: x.username, isGm: !!x.isGm,
        online: online.has(x.id), lastSeen: online.has(x.id) ? Date.now() : x.lastSeen,
      })),
    }));

    on('gm:get', (p) => {
      const d = detail(int(p.id));
      return d ? { ok: true, dragon: d } : { error: '그런 드래곤은 없다.' };
    });

    on('gm:do', (p) => {
      const op = OPS[str(p.op)];
      if (!op) return { error: '알 수 없는 동작이다.' };
      const id = int(p.id);
      const r = withTarget(id, p.notify !== false, (d, kin, now) => op(d, kin, now, p));
      if (r.error) return r;
      if (r.log) db.gmLog(gmName(), r.d.name, r.log);
      return { ok: true, dragon: detail(id), log: db.gmLogList(40) };
    });

    // 공지: 접속 중인 모두에게 바로, 접속하지 않은 드래곤에게는 다음 접속 때
    on('gm:announce', (p) => {
      const text = str(p.text).replace(/\s+/g, ' ').slice(0, ANNOUNCE_MAX);
      if (!text) return { error: '알릴 말을 적자.' };
      const now = Date.now();
      io.emit('gm:announce', { text, at: now });
      for (const id of db.dragonIds()) if (!online.has(id)) db.noteAdd(id, `[공지] ${text}`);
      db.gmLog(gmName(), null, `공지: ${text}`);
      return { ok: true, log: db.gmLogList(40) };
    });

    // 일괄 지급: 여러 드래곤에게 같은 물건 묶음을 한 번에. 긴 잠에 든 드래곤은 건너뜀
    // p: { items: [{ id, qty }], mode: 'all' | 'online' | 'pick', ids: [드래곤 id], msg }
    on('gm:give', (p) => {
      const sum = new Map();
      for (const x of Array.isArray(p.items) ? p.items : []) {
        const id = str(x?.id);
        const n = int(x?.qty);
        if (!ITEMS[id]) return { error: '그런 물건은 없다.' };
        if (!(n > 0) || n > GIVE.maxQty) return { error: `개수는 1에서 ${GIVE.maxQty} 사이로 적자.` };
        sum.set(id, Math.min(GIVE.maxQty, (sum.get(id) || 0) + n));
      }
      if (!sum.size) return { error: '줄 물건을 고르자.' };
      if (sum.size > GIVE.maxKinds) return { error: `물건은 한 번에 ${GIVE.maxKinds}종류까지 줄 수 있다.` };
      const items = [...sum].map(([id, qty]) => ({ id, qty }));
      const list = items.map((x) => `${ITEMS[x.id].name} ${x.qty}개`).join(', ');

      const mode = str(p.mode);
      let ids;
      if (mode === 'all') ids = db.dragonIds();
      else if (mode === 'online') ids = [...online.keys()];
      else if (mode === 'pick') ids = [...new Set((Array.isArray(p.ids) ? p.ids : []).map(int).filter((n) => n > 0))];
      else return { error: '받을 드래곤을 고르자.' };
      if (!ids.length) return { error: mode === 'online' ? '지금 접속한 드래곤이 없다.' : '받을 드래곤을 고르자.' };

      const msg = str(p.msg).replace(/\s+/g, ' ').slice(0, GIVE.msgMax);
      const tell = msg ? `${msg} (받은 물건: ${list})` : `하늘에서 ${list}가 내려왔다.`;
      let given = 0, skipped = 0;
      for (const id of ids) {
        const r = withTarget(id, true, (d) => (d.dead_at ? { error: 'dead' } : { items: items.map((x) => ({ ...x })), tell }));
        if (r.error) skipped += 1; else given += 1;
      }
      if (!given) return { error: '받을 수 있는 드래곤이 없었다.' };
      const who = mode === 'all' ? '모두' : mode === 'online' ? '접속 중' : '고른 드래곤';
      db.gmLog(gmName(), null, `일괄 지급(${who} ${given}마리): ${list}${msg ? ` — ${msg}` : ''}`);
      return { ok: true, given, skipped, log: db.gmLogList(40) };
    });

    // GM 권한 주기·거두기 (자기 자신은 거둘 수 없음)
    on('gm:role', (p) => {
      const id = int(p.id);
      const u = db.gmUserOf(id);
      if (!u) return { error: '그런 드래곤은 없다.' };
      const onRole = !!p.on;
      if (!onRole && u.id === socket.data.user.id) return { error: '자기 자신의 GM 권한은 거둘 수 없다.' };
      db.gmSetRole(u.id, onRole);
      const entry = online.get(id);
      if (entry) {
        entry.socket.data.user.is_gm = onRole ? 1 : 0;
        entry.socket.emit('gm:role', { isGm: onRole });
      }
      const name = db.getDragon(id).name;
      db.gmLog(gmName(), name, onRole ? 'GM 권한 줌' : 'GM 권한 거둠');
      return { ok: true, dragon: detail(id), log: db.gmLogList(40) };
    });

    // 비밀번호를 잃어버린 멤버에게 임시 비밀번호 발급 (그 계정의 모든 로그인은 끊김). 비밀번호는 기록에 남기지 않음
    on('gm:pwreset', (p) => {
      const id = int(p.id);
      const u = db.gmUserOf(id);
      if (!u || u.username.startsWith('#')) return { error: '계정이 있는 드래곤이 아니다. (긴 잠·먼 여행을 떠난 드래곤)' };
      const ABC = 'abcdefghjkmnpqrstuvwxyz23456789'; // 헷갈리는 글자(0 o 1 l i) 뺌
      const temp = Array.from(crypto.randomBytes(8), (b) => ABC[b % ABC.length]).join('');
      db.setPassword(u.id, bcrypt.hashSync(temp, 10));
      const entry = online.get(id);
      if (entry && entry.socket !== socket) kick(entry.socket);
      db.gmLog(gmName(), db.getDragon(id).name, `임시 비밀번호 발급 (아이디 ${u.username})`);
      return { ok: true, username: u.username, temp, dragon: detail(id), log: db.gmLogList(40) };
    });

    on('gm:kick', (p) => {
      const id = int(p.id);
      const entry = online.get(id);
      if (!entry) return { error: '접속 중이 아니다.' };
      if (entry.socket === socket) return { error: '자기 자신은 내보낼 수 없다.' };
      db.gmLog(gmName(), entry.dragon.name, '접속 끊기');
      kick(entry.socket);
      return { ok: true, dragon: detail(id), log: db.gmLogList(40) };
    });
  }

  return { attach };
};
