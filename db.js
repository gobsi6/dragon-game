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

// 그림(avatar)을 뺀 드래곤 정보 열
const DRAGON_FIELDS = `id, name, kind, region, avatar_ver, level, xp, hp, hp_max, en, en_max,
  ap, ap_max, gold, claw, scale, wing, wisdom, majesty, stance,
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
  setRegion:    db.prepare('UPDATE dragons SET region = ? WHERE id = ?'),
  touch:        db.prepare('UPDATE dragons SET last_seen = ? WHERE id = ?'),
  addChat:      db.prepare('INSERT INTO chat (region, dragon_id, name, kind, text, at) VALUES (?, ?, ?, ?, ?, ?)'),
  recentChat:   db.prepare('SELECT dragon_id AS dragonId, name, kind, text, at FROM chat WHERE region = ? ORDER BY id DESC LIMIT ?'),
  pruneChat:    db.prepare('DELETE FROM chat WHERE region = ? AND id <= (SELECT id FROM chat WHERE region = ? ORDER BY id DESC LIMIT 1 OFFSET 200)'),
};

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
  setRegion: (dragonId, region) => q.setRegion.run(region, dragonId),
  touch: (dragonId) => q.touch.run(Date.now(), dragonId),
  addChat: (region, m) => {
    q.addChat.run(region, m.dragonId, m.name, m.kind, m.text, m.at);
    q.pruneChat.run(region, region); // 지역별 최근 200개만 보관
  },
  recentChat: (region, limit) => q.recentChat.all(region, limit).reverse(),
};
