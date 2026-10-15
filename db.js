// SQLite 저장소. 데이터는 data/game.db 파일 하나에 모두 들어갑니다.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'game.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY,
    username   TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pw_hash    TEXT NOT NULL,
    is_gm      INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS dragons (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    kind       TEXT NOT NULL,
    region     TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chat (
    id        INTEGER PRIMARY KEY,
    region    TEXT NOT NULL,
    dragon_id INTEGER NOT NULL,
    name      TEXT NOT NULL,
    kind      TEXT NOT NULL,
    text      TEXT NOT NULL,
    at        INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chat_region ON chat(region, id);
`);


// ── 2단계 열 추가: 이미 있는 데이터는 그대로 두고 빠진 열만 붙입니다 ──
const dragonCols = db.prepare('PRAGMA table_info(dragons)').all().map((c) => c.name);
const addCol = (name, def) => {
  if (!dragonCols.includes(name)) db.exec(`ALTER TABLE dragons ADD COLUMN ${name} ${def}`);
};
addCol('avatar', 'BLOB');
addCol('avatar_type', 'TEXT');
addCol('avatar_ver', 'INTEGER NOT NULL DEFAULT 0');
addCol('level', 'INTEGER NOT NULL DEFAULT 1');
addCol('xp', 'INTEGER NOT NULL DEFAULT 0');
addCol('hp', 'INTEGER NOT NULL DEFAULT 100');
addCol('hp_max', 'INTEGER NOT NULL DEFAULT 100');
addCol('en', 'INTEGER NOT NULL DEFAULT 50');
addCol('en_max', 'INTEGER NOT NULL DEFAULT 50');
addCol('ap', 'INTEGER NOT NULL DEFAULT 10');
addCol('ap_max', 'INTEGER NOT NULL DEFAULT 10');
addCol('gold', 'INTEGER NOT NULL DEFAULT 0');
addCol('claw', 'INTEGER NOT NULL DEFAULT 10');
addCol('scale', 'INTEGER NOT NULL DEFAULT 10');
addCol('wing', 'INTEGER NOT NULL DEFAULT 10');
addCol('wisdom', 'INTEGER NOT NULL DEFAULT 10');
addCol('stance', "TEXT NOT NULL DEFAULT 'hermit'");
addCol('majesty', 'INTEGER NOT NULL DEFAULT 10');
// 3단계: 회복 시각, 원정
addCol('ap_at', 'INTEGER NOT NULL DEFAULT 0');   // 행동력을 마지막으로 계산한 시각
addCol('hp_at', 'INTEGER NOT NULL DEFAULT 0');   // 체력을 마지막으로 계산한 시각
addCol('exp_start', 'INTEGER');                  // 원정 출발 시각 (없으면 NULL)
addCol('exp_end', 'INTEGER');                    // 원정 도착 예정 시각
addCol('exp_region', 'TEXT');
// 4단계: 제작과 장신구
addCol('en_at', 'INTEGER NOT NULL DEFAULT 0');   // 기력을 마지막으로 계산한 시각
addCol('equip', "TEXT NOT NULL DEFAULT '{}'");    // 착용한 장신구 {자리: 물건 id}
// 5단계: 인간 마을
addCol('rep', "TEXT NOT NULL DEFAULT '{}'");      // 지역별 평판 {지역: -100~100}
addCol('stance_at', 'INTEGER NOT NULL DEFAULT 0'); // 성향을 마지막으로 바꾼 시각
// 6단계: 둥지
addCol('nest', 'TEXT');                            // 둥지가 있는 지역 (없으면 NULL)
addCol('rest_at', 'INTEGER');                      // 쉬기 시작한 시각 (쉬지 않으면 NULL)
addCol('hoard_gold', 'INTEGER NOT NULL DEFAULT 0'); // 보물더미에 쌓은 금화
// 7단계: 용족 명성
addCol('fame', 'INTEGER NOT NULL DEFAULT 0');      // 드래곤들 사이의 명성 (-100~100)
// 8단계: 이벤트와 둥지 식구
addCol('pending_event', 'TEXT');                   // 선택을 기다리는 이벤트 (없으면 NULL)

db.exec(`
  CREATE TABLE IF NOT EXISTS kin (
    id         INTEGER PRIMARY KEY,
    dragon_id  INTEGER NOT NULL REFERENCES dragons(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,           -- human(인간) / drake(새끼 드래곤)
    status     TEXT NOT NULL,           -- home / egg / returned / dead / independent
    name       TEXT NOT NULL,
    data       TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS kin_dragon ON kin(dragon_id);
`);

// 9단계: 동료
db.exec(`
  CREATE TABLE IF NOT EXISTS relations (       -- 내가 상대를 어떻게 여기는지
    from_id INTEGER NOT NULL REFERENCES dragons(id) ON DELETE CASCADE,
    to_id   INTEGER NOT NULL REFERENCES dragons(id) ON DELETE CASCADE,
    kind    TEXT NOT NULL,                     -- friend(동료, 양쪽에 함께 기록) / rival(라이벌) / wary(경계)
    at      INTEGER NOT NULL,
    PRIMARY KEY (from_id, to_id)
  );
  CREATE TABLE IF NOT EXISTS friend_requests (
    from_id INTEGER NOT NULL REFERENCES dragons(id) ON DELETE CASCADE,
    to_id   INTEGER NOT NULL REFERENCES dragons(id) ON DELETE CASCADE,
    at      INTEGER NOT NULL,
    PRIMARY KEY (from_id, to_id)
  );
  CREATE TABLE IF NOT EXISTS telepathy (       -- 텔레파시 (드래곤끼리의 쪽지)
    id      INTEGER PRIMARY KEY,
    from_id INTEGER NOT NULL REFERENCES dragons(id) ON DELETE CASCADE,
    to_id   INTEGER NOT NULL REFERENCES dragons(id) ON DELETE CASCADE,
    text    TEXT NOT NULL,
    at      INTEGER NOT NULL,
    heard   INTEGER NOT NULL DEFAULT 0           -- 받는 쪽이 들었는지
  );
  CREATE INDEX IF NOT EXISTS tp_to ON telepathy(to_id, heard);
  CREATE INDEX IF NOT EXISTS tp_pair ON telepathy(from_id, to_id, id);
  CREATE TABLE IF NOT EXISTS notes (           -- 자리를 비운 동안 온 소식 (다음 접속 때 보여 줌)
    id        INTEGER PRIMARY KEY,
    dragon_id INTEGER NOT NULL REFERENCES dragons(id) ON DELETE CASCADE,
    text      TEXT NOT NULL,
    at        INTEGER NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS hoard (
    dragon_id INTEGER NOT NULL REFERENCES dragons(id) ON DELETE CASCADE,
    item      TEXT NOT NULL,
    qty       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (dragon_id, item)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS inventory (
    dragon_id INTEGER NOT NULL REFERENCES dragons(id) ON DELETE CASCADE,
    item      TEXT NOT NULL,
    qty       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (dragon_id, item)
  );
`);

// 그림(avatar)을 뺀 드래곤 정보 열
const DRAGON_FIELDS = `id, name, kind, region, avatar_ver, level, xp, hp, hp_max, en, en_max,
  ap, ap_max, gold, claw, scale, wing, wisdom, majesty, stance,
  ap_at, hp_at, en_at, exp_start, exp_end, exp_region, equip, rep, stance_at, nest, rest_at, hoard_gold, fame, pending_event,
  (avatar IS NOT NULL) AS has_avatar`;

const q = {
  countUsers:   db.prepare('SELECT COUNT(*) AS n FROM users'),
  userByName:   db.prepare('SELECT * FROM users WHERE username = ?'),
  createUser:   db.prepare('INSERT INTO users (username, pw_hash, is_gm, created_at) VALUES (?, ?, ?, ?)'),
  createSess:   db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)'),
  sessUser:     db.prepare('SELECT u.id, u.username, u.is_gm FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'),
  deleteSess:   db.prepare('DELETE FROM sessions WHERE token = ?'),
  dragonByUser: db.prepare(`SELECT ${DRAGON_FIELDS} FROM dragons WHERE user_id = ?`),
  dragonByName: db.prepare('SELECT id FROM dragons WHERE name = ?'),
  createDragon: db.prepare(`INSERT INTO dragons (user_id, name, kind, region, created_at, last_seen,
                              claw, scale, wing, wisdom, majesty, hp, hp_max, en, en_max)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  setAvatar:    db.prepare('UPDATE dragons SET avatar = ?, avatar_type = ?, avatar_ver = avatar_ver + 1 WHERE id = ?'),
  clearAvatar:  db.prepare('UPDATE dragons SET avatar = NULL, avatar_type = NULL, avatar_ver = avatar_ver + 1 WHERE id = ?'),
  avatarVer:    db.prepare('SELECT avatar_ver FROM dragons WHERE id = ?'),
  getAvatar:    db.prepare('SELECT avatar, avatar_type FROM dragons WHERE id = ?'),
  saveState:    db.prepare(`UPDATE dragons SET level = @level, xp = @xp, hp = @hp, hp_max = @hp_max,
                              en = @en, en_max = @en_max, ap = @ap, gold = @gold, ap_at = @ap_at, hp_at = @hp_at,
                              en_at = @en_at, exp_start = @exp_start, exp_end = @exp_end, exp_region = @exp_region,
                              equip = @equip, rep = @rep, stance = @stance, stance_at = @stance_at,
                              region = @region, nest = @nest, rest_at = @rest_at, hoard_gold = @hoard_gold, fame = @fame,
                              pending_event = @pending_event
                            WHERE id = @id`),
  invCount:     db.prepare('SELECT qty FROM inventory WHERE dragon_id = ? AND item = ?'),
  hoardAdd:     db.prepare(`INSERT INTO hoard (dragon_id, item, qty) VALUES (?, ?, ?)
                            ON CONFLICT(dragon_id, item) DO UPDATE SET qty = qty + excluded.qty`),
  hoardList:    db.prepare('SELECT item, qty FROM hoard WHERE dragon_id = ? AND qty > 0'),
  hoardCount:   db.prepare('SELECT qty FROM hoard WHERE dragon_id = ? AND item = ?'),
  invAdd:       db.prepare(`INSERT INTO inventory (dragon_id, item, qty) VALUES (?, ?, ?)
                            ON CONFLICT(dragon_id, item) DO UPDATE SET qty = qty + excluded.qty`),
  invList:      db.prepare('SELECT item, qty FROM inventory WHERE dragon_id = ? AND qty > 0'),
  setRegion:    db.prepare('UPDATE dragons SET region = ? WHERE id = ?'),
  touch:        db.prepare('UPDATE dragons SET last_seen = ? WHERE id = ?'),
  addChat:      db.prepare('INSERT INTO chat (region, dragon_id, name, kind, text, at) VALUES (?, ?, ?, ?, ?, ?)'),
  recentChat:   db.prepare('SELECT dragon_id AS dragonId, name, kind, text, at FROM chat WHERE region = ? ORDER BY id DESC LIMIT ?'),
  kinList:      db.prepare('SELECT id, type, status, name, data FROM kin WHERE dragon_id = ? ORDER BY id'),
  kinAdd:       db.prepare('INSERT INTO kin (dragon_id, type, status, name, data, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  kinSave:      db.prepare('UPDATE kin SET status = ?, name = ?, data = ? WHERE id = ? AND dragon_id = ?'),
  dragonById:   db.prepare(`SELECT ${DRAGON_FIELDS} FROM dragons WHERE id = ?`),
  addGold:      db.prepare('UPDATE dragons SET gold = gold + ? WHERE id = ?'),
  relGet:       db.prepare('SELECT kind FROM relations WHERE from_id = ? AND to_id = ?'),
  relSet:       db.prepare(`INSERT INTO relations (from_id, to_id, kind, at) VALUES (?, ?, ?, ?)
                            ON CONFLICT(from_id, to_id) DO UPDATE SET kind = excluded.kind, at = excluded.at`),
  relDel:       db.prepare('DELETE FROM relations WHERE from_id = ? AND to_id = ?'),
  relList:      db.prepare(`SELECT r.to_id AS id, r.kind, d.name, d.kind AS dkind, d.level, d.region, d.avatar_ver, (d.avatar IS NOT NULL) AS has_avatar
                            FROM relations r JOIN dragons d ON d.id = r.to_id WHERE r.from_id = ? ORDER BY d.name`),
  reqGet:       db.prepare('SELECT at FROM friend_requests WHERE from_id = ? AND to_id = ?'),
  reqAdd:       db.prepare('INSERT OR IGNORE INTO friend_requests (from_id, to_id, at) VALUES (?, ?, ?)'),
  reqDel:       db.prepare('DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?'),
  reqIn:        db.prepare(`SELECT r.from_id AS id, d.name, d.kind AS dkind, d.level, d.avatar_ver, (d.avatar IS NOT NULL) AS has_avatar
                            FROM friend_requests r JOIN dragons d ON d.id = r.from_id WHERE r.to_id = ? ORDER BY r.at`),
  reqOut:       db.prepare(`SELECT r.to_id AS id, d.name, d.kind AS dkind, d.level, d.avatar_ver, (d.avatar IS NOT NULL) AS has_avatar
                            FROM friend_requests r JOIN dragons d ON d.id = r.to_id WHERE r.from_id = ? ORDER BY r.at`),
  reqInCount:   db.prepare('SELECT COUNT(*) AS n FROM friend_requests WHERE to_id = ?'),
  tpAdd:        db.prepare('INSERT INTO telepathy (from_id, to_id, text, at) VALUES (?, ?, ?, ?)'),
  tpConvo:      db.prepare(`SELECT id, from_id AS fromId, text, at, heard FROM telepathy
                            WHERE (from_id = @a AND to_id = @b) OR (from_id = @b AND to_id = @a) ORDER BY id DESC LIMIT @n`),
  tpHear:       db.prepare('UPDATE telepathy SET heard = 1 WHERE to_id = ? AND from_id = ? AND heard = 0'),
  tpUnread:     db.prepare('SELECT COUNT(*) AS n FROM telepathy WHERE to_id = ? AND heard = 0'),
  // 대화 상대별 마지막 텔레파시와 안 들은 수
  tpThreads:    db.prepare(`
    SELECT t.other AS id, d.name, d.kind, d.level, d.avatar_ver, (d.avatar IS NOT NULL) AS has_avatar,
           m.text, m.at, m.from_id AS fromId,
           (SELECT COUNT(*) FROM telepathy u WHERE u.to_id = @me AND u.from_id = t.other AND u.heard = 0) AS unread
    FROM (SELECT CASE WHEN from_id = @me THEN to_id ELSE from_id END AS other, MAX(id) AS last
          FROM telepathy WHERE from_id = @me OR to_id = @me GROUP BY other) t
    JOIN telepathy m ON m.id = t.last JOIN dragons d ON d.id = t.other
    ORDER BY t.last DESC LIMIT 40`),
  // 한 쌍마다 최근 200개만 남김
  tpPrune:      db.prepare(`DELETE FROM telepathy WHERE ((from_id = @a AND to_id = @b) OR (from_id = @b AND to_id = @a))
                            AND id <= (SELECT id FROM telepathy WHERE (from_id = @a AND to_id = @b) OR (from_id = @b AND to_id = @a)
                                       ORDER BY id DESC LIMIT 1 OFFSET 200)`),
  noteAdd:      db.prepare('INSERT INTO notes (dragon_id, text, at) VALUES (?, ?, ?)'),
  noteList:     db.prepare('SELECT text FROM notes WHERE dragon_id = ? ORDER BY id'),
  noteClear:    db.prepare('DELETE FROM notes WHERE dragon_id = ?'),
  pruneChat:    db.prepare('DELETE FROM chat WHERE region = ? AND id <= (SELECT id FROM chat WHERE region = ? ORDER BY id DESC LIMIT 1 OFFSET 200)'),
};

// 드래곤의 바뀌는 상태(체력, 행동력, 원정 등)와 얻은 물건을 저장 (트랜잭션은 부르는 쪽에서)
function saveStateRaw(d, items = [], hoardItems = []) {
  q.saveState.run({
    id: d.id, level: d.level, xp: d.xp, hp: d.hp, hp_max: d.hp_max, en: d.en, en_max: d.en_max,
    ap: d.ap, gold: d.gold, ap_at: d.ap_at, hp_at: d.hp_at, en_at: d.en_at || 0,
    exp_start: d.exp_start ?? null, exp_end: d.exp_end ?? null, exp_region: d.exp_region ?? null,
    equip: JSON.stringify(d.equip || {}),
    rep: typeof d.rep === 'string' ? d.rep : JSON.stringify(d.rep || {}),
    stance: d.stance, stance_at: d.stance_at || 0,
    region: d.region, nest: d.nest ?? null, rest_at: d.rest_at ?? null, hoard_gold: d.hoard_gold || 0,
    fame: d.fame || 0, pending_event: d.pending_event ?? null,
  });

  for (const { id, qty } of items) q.invAdd.run(d.id, id, qty);
  for (const { id, qty } of hoardItems) q.hoardAdd.run(d.id, id, qty);
}

module.exports = {
  countUsers: () => q.countUsers.get().n,
  getUserByName: (name) => q.userByName.get(name),
  createUser: (name, hash, isGm) => q.createUser.run(name, hash, isGm ? 1 : 0, Date.now()).lastInsertRowid,
  createSession: (token, userId) => q.createSess.run(token, userId, Date.now()),
  getSessionUser: (token) => q.sessUser.get(token),
  deleteSession: (token) => q.deleteSess.run(token),
  getDragonByUser: (userId) => q.dragonByUser.get(userId),
  dragonNameTaken: (name) => !!q.dragonByName.get(name),
  createDragon: (userId, name, kind, region, st, hpMax, enMax) => {
    const now = Date.now();
    q.createDragon.run(userId, name, kind, region, now, now,
      st.claw, st.scale, st.wing, st.wisdom, st.majesty, hpMax, hpMax, enMax, enMax);
    return q.dragonByUser.get(userId);
  },
  setAvatar: (dragonId, buf, type) => {
    q.setAvatar.run(buf, type, dragonId);
    return q.avatarVer.get(dragonId).avatar_ver;
  },
  clearAvatar: (dragonId) => {
    q.clearAvatar.run(dragonId);
    return q.avatarVer.get(dragonId).avatar_ver;
  },
  getAvatar: (dragonId) => q.getAvatar.get(dragonId),
  saveState: db.transaction((d, items = [], hoardItems = []) => saveStateRaw(d, items, hoardItems)),
  // 교환: 두 드래곤의 상태와 물건을 한 번에 저장 (중간에 실패하면 둘 다 되돌림)
  saveMany: db.transaction((list) => { for (const [d, items] of list) saveStateRaw(d, items, []); }),
  // 접속하지 않은 동료에게 보내는 선물
  giftOffline: db.transaction((toId, gold, items) => {
    if (gold) q.addGold.run(gold, toId);
    for (const { id, qty } of items) q.invAdd.run(toId, id, qty);
  }),
  getDragon: (id) => q.dragonById.get(id),
  relGet: (a, b) => q.relGet.get(a, b)?.kind || null,
  relSet: (a, b, kind) => q.relSet.run(a, b, kind, Date.now()),
  relDel: (a, b) => q.relDel.run(a, b),
  relList: (id) => q.relList.all(id),
  reqGet: (a, b) => !!q.reqGet.get(a, b),
  reqAdd: (a, b) => q.reqAdd.run(a, b, Date.now()),
  reqDel: (a, b) => q.reqDel.run(a, b),
  reqIn: (id) => q.reqIn.all(id),
  reqOut: (id) => q.reqOut.all(id),
  reqInCount: (id) => q.reqInCount.get(id).n,
  // 동료 맺기·끊기는 양쪽을 한 번에
  befriend: db.transaction((a, b) => {
    q.relSet.run(a, b, 'friend', Date.now()); q.relSet.run(b, a, 'friend', Date.now());
    q.reqDel.run(a, b); q.reqDel.run(b, a);
  }),
  unfriend: db.transaction((a, b) => { q.relDel.run(a, b); q.relDel.run(b, a); }),
  // 텔레파시
  tpSend: db.transaction((a, b, text) => {
    const id = Number(q.tpAdd.run(a, b, text, Date.now()).lastInsertRowid);
    q.tpPrune.run({ a, b });
    return id;
  }),
  tpConvo: (a, b, n = 60) => q.tpConvo.all({ a, b, n }).reverse(),
  tpHear: (me, other) => q.tpHear.run(me, other),
  tpUnread: (me) => q.tpUnread.get(me).n,
  tpThreads: (me) => q.tpThreads.all({ me }),
  noteAdd: (id, text) => q.noteAdd.run(id, text, Date.now()),
  notesTake: db.transaction((id) => { const l = q.noteList.all(id).map((r) => r.text); q.noteClear.run(id); return l; }),
  inventory: (dragonId) => q.invList.all(dragonId),
  itemCount: (dragonId, item) => q.invCount.get(dragonId, item)?.qty || 0,
  hoard: (dragonId) => q.hoardList.all(dragonId),
  hoardCount: (dragonId, item) => q.hoardCount.get(dragonId, item)?.qty || 0,
  setRegion: (dragonId, region) => q.setRegion.run(region, dragonId),
  touch: (dragonId) => q.touch.run(Date.now(), dragonId),
  addChat: (region, m) => {
    q.addChat.run(region, m.dragonId, m.name, m.kind, m.text, m.at);
    q.pruneChat.run(region, region); // 지역별 최근 200개만 보관
  },
  recentChat: (region, limit) => q.recentChat.all(region, limit).reverse(),
  // 둥지 식구: 불러오기와, 바뀐 것만 저장하기 (새 식구는 id가 없음)
  kinLoad: (dragonId) => q.kinList.all(dragonId).map((r) => {
    let data = {};
    try { data = JSON.parse(r.data); } catch {}
    return { id: r.id, type: r.type, status: r.status, name: r.name, data, _snap: `${r.status}|${r.name}|${r.data}` };
  }),
  kinSaveAll: db.transaction((dragonId, kin) => {
    for (const k of kin) {
      const data = JSON.stringify(k.data);
      if (k.id == null) {
        k.id = Number(q.kinAdd.run(dragonId, k.type, k.status, k.name, data, Date.now()).lastInsertRowid);
      } else if (k._snap !== `${k.status}|${k.name}|${data}`) {
        q.kinSave.run(k.status, k.name, data, k.id, dragonId);
      }
      k._snap = `${k.status}|${k.name}|${data}`;
    }
  }),
};
