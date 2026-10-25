// 이벤트 자동 점검: 모든 이벤트를 가짜 둥지에서 한 번씩 일으키고, 선택지를 하나씩 골라 봄
// 오류(예외)와 문장 속 이상한 곳(undefined·NaN·빠진 변수·조사 틀림)을 찾아 알려 줌. 게임 저장 파일은 건드리지 않음
// 쓰는 법: node tools/check-events.js          (문제만)
//          node tools/check-events.js --all    (모든 이벤트의 결과까지)
//          node tools/check-events.js kin_baby (이 이벤트만, 결과까지)
//          node tools/check-events.js --deep       (상황마다 여러 번 돌려 무작위 문장까지 거의 다 보고, 나이·모습에 어긋나 보이는 문장을 '살펴볼 곳'으로 알려 줌)
//          node tools/check-events.js --deep --out 문장.txt  (나올 수 있는 문장을 이벤트별로 모아 파일로)
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dragon-check-'));
process.env.DB_PATH = path.join(tmp, 'check.db'); // 시험용 저장 파일 (끝나면 지움)
const quiet = console.log; console.log = () => {}; // 불러올 때 나오는 서버 기록은 숨김
const db = require('../db');
const life = require('../game-life');
const logic = require('../game-logic');
const EVENTS = require('../game-events');
const { REGIONS, KIN } = require('../game-data');
console.log = quiet;

const args = process.argv.slice(2);
const SHOW_ALL = args.includes('--all');
const DEEP = args.includes('--deep');
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const RUNS = DEEP ? 24 : 1; // 상황 하나에서 이벤트를 몇 번 일으켜 볼지 (무작위로 고르는 식구·선물·문장을 고루 보려고)
const ONLY = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
const DAY = 86400000, NOW = Date.now();

// ── 가짜 둥지: 여러 나이와 사정의 식구를 고루 둠 (이름은 받침 있는 것·없는 것을 섞어 조사 틀림을 잡음) ──
let nid = 1;
function human(name, age, extra = {}) {
  const k = life.newHuman('abandoned', NOW - age * DAY, 'capital');
  k.id = nid++; k.name = name; k.data.born = NOW - age * DAY; k.data.bond = 60;
  if (age >= KIN.human.adultDay) { k.data.talent = 'herbalist'; k.data.path = 'stay'; }
  Object.assign(k.data, extra.data || {}); if (extra.status) k.status = extra.status;
  return k;
}
function drake(name, age, kind = 'red', extra = {}) {
  const k = life.newEgg(kind, NOW - age * DAY - DAY); k.id = nid++; k.name = name;
  life.hatch(k, NOW - age * DAY); k.data.bond = 60;
  Object.assign(k.data, extra.data || {}); if (extra.status) k.status = extra.status;
  return k;
}
function household() {
  nid = 1;
  const mateRef = { owner: 2, id: 99 };
  return [
    human('하루', 0.5), human('하린', 1.5), human('도담', 3), human('솔', 6, { data: { friends: {} } }),
    human('보람', 8, { data: { adoptedFrom: '미르', adoptedFromId: 2, heartbreak: { why: 'else', name: '하람', home: '미르' } } }),
    human('이안', 13, { data: { mate: { name: '라온', at: NOW - 3 * DAY } } }),
    human('새벽', 14, { data: { mate: { name: '하람', at: NOW - 4 * DAY, home: '미르', ref: mateRef }, firstLove: '하람', loveRef: mateRef } }),
    human('가온', 12), // 짝이 없는 어른
    human('다온', 20),
    drake('솔바람', 2, 'blue'), drake('재희', 6, 'gold'), drake('라엘', 13, 'green'), drake('별', 19, 'white', { data: { mate: { name: '바람', kind: 'white', at: NOW - 4 * DAY } } }),
    Object.assign(life.newEgg('purple', NOW - DAY), { id: nid++, data: { kind: 'purple', found: NOW - DAY, incubateAt: NOW - DAY / 2 } }),
    drake('여울', 25, 'silver', { status: 'independent', data: { ended: NOW - 5 * DAY } }),
    human('누리', 26, { status: 'dead', data: { ended: NOW - 1.5 * DAY, mate: { name: '한결' }, kids: ['단비'] } }),
    human('가람', 16, { status: 'returned', data: { ended: NOW - 4 * DAY, family: 'capital', mate: { name: '나래' }, kids: ['봄'] } }),
  ];
}
// 상황: 성향 · 지역 (둥지 · 인간 마을 · 바다 건너)
const SCENES = [
  { stance: 'friendly', region: 'plains' }, { stance: 'friendly', region: 'capital' },
  { stance: 'hermit', region: 'forest' }, { stance: 'hostile', region: 'capital' },
  { stance: 'hostile', region: 'swamp' }, { stance: 'friendly', region: 'ruin_shore' },
];
const u1 = db.createUser('검사', 'x', 1), u2 = db.createUser('미르', 'x', 0);
const ST = { claw: 12, scale: 12, wing: 12, wisdom: 12, majesty: 12 };
db.createDragon(u1, '아르카', 'red', 'plains', ST, 110, 54);
db.createDragon(u2, '미르', 'blue', 'plains', ST, 110, 54);
function dragonFor(s) {
  const d = db.getDragon(1);
  Object.assign(d, { rivalsCache: [{ id: 2, name: '미르', kind: 'blue' }], perks: { ally: { id: 10, name: '재희' } }, stance: s.stance, region: s.region, nest: 'plains', gold: 500, level: 22, fame: 30, pending_event: null, ev_recent: '[]', mind: 80, hp: 100, en: 50 });
  return d;
}
// 다른 드래곤과의 관계·보물더미·재앙의 흔적도 가짜로 채움 (관계 이벤트가 일어날 수 있게)
const ADOPTED = (() => { const k = human('나비', 3, { data: { adoptedAt: NOW - DAY } }); k.owner = '미르'; k.owner_id = 2; return k; })();
logic.hooks.ties = () => ({ mentor: { id: 2, name: '미르' }, students: [], heart: { id: 2, name: '미르', bond: 'lover' },
  nemesis: [{ id: 2, name: '미르', nest: 'plains' }], friends: [{ id: 2, name: '미르' }],
  departed: [{ id: 3, name: '옛벗', words: '잘 지내라', heir: false }], adoptedOut: [ADOPTED] });
logic.hooks.hoard = () => [{ item: 'silver_ring', qty: 2 }, { item: 'gold_ore', qty: 3 }];
logic.hooks.bossTrace = () => ({ name: '잿빛 군주', won: true });
const HAVE = () => 5; // 소지품: 무엇이든 5개씩 있는 것으로 (have(물건) → 개수)

// ── 문장 검사 ──
const NAMES = ['하루', '하린', '도담', '솔', '보람', '이안', '새벽', '가온', '다온', '솔바람', '재희', '라엘', '별', '여울', '누리', '가람', '라온', '하람', '나래', '봄', '아르카', '미르'];
const PAIRS = [['이', '가'], ['을', '를'], ['은', '는'], ['과', '와'], ['이라고', '라고'], ['이다', '다'], ['이야', '야'], ['이랑', '랑']];
const batchim = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 !== 0; };
function textIssues(s) {
  const out = [];
  if (typeof s !== 'string') return ['문장이 글자가 아님: ' + String(s)];
  for (const bad of ['undefined', 'NaN', '[object', '${', '{{', 'null']) if (s.includes(bad)) out.push(`'${bad}'가 들어 있음`);
  if (!s.trim()) out.push('빈 문장');
  if (/\[[이을은과]\/[가를는와]\]/.test(s)) out.push('조사 자리표([이/가] 등)가 그대로 남음');
  for (const n of NAMES) {
    const re = new RegExp(`${n}(이라고|라고|이다|이야|이랑|이|가|을|를|은|는|과|와|랑|야|다)(?=[\\s.,!?"'」)…·]|$)`, 'g');
    let m;
    while ((m = re.exec(s))) {
      if (s[m.index - 1] && /[가-힣]/.test(s[m.index - 1])) continue; // 더 긴 낱말의 일부
      const p = m[1], b = batchim(n);
      const pair = PAIRS.find((x) => x.includes(p)); if (!pair) continue;
      const want = b ? pair[0] : pair[1];
      if (p !== want && !(p === '다' && !b) && !(p === '이' && !b && /^이[^가-힣]/.test(s.slice(m.index + n.length)) === false)) {
        if (p === '이' && !b) continue; // '하루이'처럼 보여도 '이 아이'의 '이'일 수 있어 건너뜀
        out.push(`조사: '${n}${p}' → '${n}${want}'`);
      }
    }
  }
  return out;
}

// ── 나이·모습 살펴보기 (--deep): 틀렸다고 단정하지 않고 '살펴볼 곳'으로만 알려 줌 ──
// 가짜 둥지 식구의 나이 (household()와 맞출 것)
const STAGE = { 하루: '아기', 하린: '아이', 도담: '소년', 솔: '청소년', 보람: '청소년', 이안: '어른', 새벽: '어른', 가온: '어른', 다온: '노년', 가람: '어른',
  솔바람: '해츨링', 재희: '어린 용', 라엘: '젊은 용', 별: '다 자란 용', 여울: '다 자란 용' };
const HUMAN = new Set(['하루', '하린', '도담', '솔', '보람', '이안', '새벽', '가온', '다온', '가람']);
const RULES = [
  // [누구에게, 낱말, 까닭]
  // 날개로 감싸기·날개 밑에 숨기·숨결은 보호자나 새끼의 것이라 빼고, 사람 식구가 주어인 문장만 봄 ('○○이 꼬리를 흔들며' 같은 것)
  [(n) => HUMAN.has(n), (s, n) => new RegExp(`${n}(이|가|은|는) [^.!?]*(꼬리를|꼬리로|비늘을 세|발톱을|발톱으로|불씨를 뿜|그르렁|가르릉|날개를 파닥|날개를 펴|날개를 접)`).test(s), '사람 식구에게 드래곤의 몸 묘사'],
  [(n) => ['아기', '해츨링'].includes(STAGE[n]), /"[^"]{4,}"/, '아기·해츨링이 말을 하는 것처럼 보임'],
  [(n) => ['아기'].includes(STAGE[n]), /(뛰어|달려|걸어|조른|조르|편지|글씨|그림을 그|말에 올라|업어|춤)/, '아기가 할 수 없는 행동'],
  [(n) => ['해츨링'].includes(STAGE[n]), /(사람 모습|손으로|손에|손을|편지|글씨|그림을 그)/, '해츨링이 폴리모프한 것처럼 보임'],
  [(n) => ['어른', '노년', '다 자란 용'].includes(STAGE[n]), /(칭얼|떼를|엉엉|깔깔|조른|조르|장난감|업혀|안겨|소꿉|입을 삐죽)/, '다 큰 식구의 아이 같은 행동'],
  [(n) => ['청소년', '젊은 용'].includes(STAGE[n]), /(칭얼|엉엉|업혀|안겨|소꿉)/, '청소년에게 어린 행동'],
];
const AGE_OK = { first_word: ['아기·해츨링이 말을 하는 것처럼 보임'] }; // 일부러 그렇게 쓴 장면 (첫 마디는 아기가 처음 말을 하는 장면)
function ageIssues(line, eid) {
  const out = [];
  for (const n of Object.keys(STAGE)) {
    const at = line.indexOf(n);
    if (at < 0 || /[가-힣]/.test(line[at - 1] || '') || (line.slice(at, at + n.length + 1) === n + '바')) continue; // 다른 낱말의 일부 ('솔바람' 속 '솔')
    // 이름이 나온 문장 하나만 봄 (다른 식구 이야기와 섞이지 않게)
    const sent = line.split(/(?<=[.!?])\s+/).find((x) => x.includes(n)) || line;
    for (const [who, re, why] of RULES) if (!(AGE_OK[eid] || []).includes(why) && who(n) && (typeof re === 'function' ? re(sent, n) : re.test(sent))) out.push(`${why} (${n}·${STAGE[n]}): "${sent.slice(0, 70)}"`);
  }
  return out;
}

// ── 돌리기 ──
const clone = (x) => JSON.parse(JSON.stringify(x));
const report = [];
let nEvents = 0, nRan = 0, nChoices = 0, nIssues = 0;
for (const e of EVENTS) {
  if (ONLY.length && !ONLY.includes(e.id)) continue;
  nEvents++;
  const r = { id: e.id, title: e.title, issues: [], runs: [], forced: false, skipped: null, texts: new Set(), warns: new Set() };
  const seen = new Set();
  let hit = 0;
  for (const pass of [false, true]) { // 먼저 조건을 지켜서, 한 번도 안 되면 조건을 무시하고
    if (hit) break;
    for (const s of SCENES) for (let run = 0; run < RUNS; run++) {
      const d = dragonFor(s), kin = household();
      const f = life.forceEvent(d, kin, HAVE, e.id, pass, NOW);
      if (f.error) continue;
      hit++; if (pass) r.forced = true;
      let view;
      try { view = life.getEvent(d, kin, HAVE, NOW); } catch (err) { r.issues.push(`[${s.stance}·${s.region}] 창을 만들다 오류: ${err.message}`); continue; }
      if (!view) { r.issues.push(`[${s.stance}·${s.region}] 일으켰는데 창이 비어 있음`); continue; }
      for (const l of view.lines) { for (const i of textIssues(l)) r.issues.push(`[${s.stance}·${s.region}] 지문 "${l.slice(0, 40)}…": ${i}`); if (DEEP) { r.texts.add(l); for (const w of ageIssues(l, e.id)) r.warns.add(w); } }
      const saved = { d: clone(d), kin: clone(kin) };
      for (const ch of view.choices) {
        for (const i of textIssues(ch.label)) r.issues.push(`선택지 "${ch.label}": ${i}`);
        if (ch.reason) continue; // 지금은 고를 수 없는 선택지 (금화가 모자람 등)
        const key = `${ch.label}`;
        if (seen.has(key) && !SHOW_ALL && !DEEP) continue; seen.add(key);
        const d2 = Object.assign(db.getDragon(1), clone(saved.d)), kin2 = clone(saved.kin);
        nChoices++;
        let res;
        try { res = life.chooseEvent(d2, kin2, HAVE, ch.i, NOW); } catch (err) { r.issues.push(`선택지 "${ch.label}" 고르다 오류: ${err.stack.split('\n').slice(0, 2).join(' / ')}`); continue; }
        if (res.error) { r.issues.push(`선택지 "${ch.label}": ${res.error}`); continue; }
        const lines = [...(res.lines || [])];
        for (const k of kin2) for (const x of (k.data.diary || []).slice(-2)) if (x.at >= NOW - 1000) lines.push(`(기록·${k.name}) ${x.t}`);
        for (const l of lines) { for (const i of textIssues(l)) r.issues.push(`선택지 "${ch.label}" 결과 "${String(l).slice(0, 40)}…": ${i}`); if (DEEP) { r.texts.add(`  └ ${ch.label}: ${l}`); for (const w of ageIssues(String(l), e.id)) r.warns.add(`[${ch.label}] ${w}`); } }
        if (!DEEP) r.runs.push({ scene: `${s.stance}·${REGIONS[s.region]?.name || s.region}`, label: ch.label, lines });
      }
      if (!SHOW_ALL && !DEEP && hit >= 2) break; // 상황 둘만 보면 충분 (--all·--deep이면 모두)
    }
  }
  if (!hit) r.skipped = '가짜 둥지로는 일으킬 수 없음 (특별한 식구나 동료 관계가 필요)';
  else nRan++;
  r.issues = [...new Set(r.issues)];
  nIssues += r.issues.length;
  report.push(r);
}

// ── 결과 ──
const out = [];
for (const r of report) {
  if (!r.issues.length && !SHOW_ALL && !ONLY.length) continue;
  out.push(`\n■ ${r.title} (${r.id})${r.forced ? ' · 조건 무시하고 일으킴' : ''}${r.skipped ? ` · 건너뜀: ${r.skipped}` : ''}`);
  for (const i of r.issues) out.push(`  ⚠ ${i}`);
  if (SHOW_ALL || ONLY.length) for (const x of r.runs) { out.push(`  ▸ [${x.scene}] ${x.label}`); for (const l of x.lines) out.push(`      ${l}`); }
}
if (DEEP) {
  let nw = 0;
  for (const r of report) if (r.warns.size) { out.push(`\n◆ 살펴볼 곳 · ${r.title} (${r.id})`); for (const w of r.warns) { out.push(`  ? ${w}`); nw++; } }
  out.push(`\n살펴볼 곳 ${nw}개 (틀렸다는 뜻은 아니고, 사람이 한 번 읽어 보면 좋은 문장)`);
  if (OUT) {
    const lines = [];
    for (const r of report) { lines.push(`\n■ ${r.title} (${r.id})`); for (const x of r.texts) lines.push(x.startsWith('  └') ? x : `  ${x}`); }
    fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
    out.push(`나올 수 있는 문장 ${report.reduce((a, r) => a + r.texts.size, 0)}줄을 ${OUT}에 모았다.`);
  }
}
const skipped = report.filter((r) => r.skipped).map((r) => r.id);
console.log(out.join('\n'));
console.log(`\n이벤트 ${nEvents}개 중 ${nRan}개를 일으켜 선택지 ${nChoices}개를 골라 봄. 찾은 문제 ${nIssues}개.`);
if (skipped.length) console.log(`건너뛴 이벤트 ${skipped.length}개 (가짜 둥지로는 조건을 만들 수 없음): ${skipped.join(', ')}`);
try { db.closeDb && db.closeDb(); } catch {}
fs.rmSync(tmp, { recursive: true, force: true });
process.exitCode = nIssues ? 1 : 0;
