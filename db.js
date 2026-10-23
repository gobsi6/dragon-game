// SQLite 저장소. 데이터는 data/game.db 파일 하나에 모두 들어갑니다.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'game.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// GM이 '저장 파일 되돌리기'로 올린 파일이 있으면, 서버를 켜는 이 순간 바꿔 끼움
// 바꾸기 전의 파일은 game.db.before-restore로 하나 남겨 둠
const RESTORE_PATH = `${DB_PATH}.restore`;
if (fs.existsSync(RESTORE_PATH)) {
  try {
    if (fs.existsSync(DB_PATH)) fs.copyFileSync(DB_PATH, `${DB_PATH}.before-restore`);
    for (const ext of ['-wal', '-shm']) if (fs.existsSync(DB_PATH + ext)) fs.unlinkSync(DB_PATH + ext);
    fs.renameSync(RESTORE_PATH, DB_PATH);
    console.log('[되돌리기] 올려 둔 저장 파일로 바꿔 끼웠다. 이전 파일은 .before-restore로 남겨 두었다.');
  } catch (e) {
    console.error('[되돌리기] 저장 파일을 바꾸지 못했다:', e.message);
  }
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL'); // WAL에서는 안전함. 저장할 때마다 디스크 동기화를 기다리지 않아 느린 볼륨에서도 빠름
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
// 계정: 먼 여행을 떠난 드래곤이 남긴 의지 (새 드래곤을 만들 때 받고 지움)
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'legacy')) db.exec('ALTER TABLE users ADD COLUMN legacy TEXT');
// 가입할 때 적는 'GM과 연결된 계정' (GM 확인용 메모. 게임에는 쓰지 않음)
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'link_account')) db.exec('ALTER TABLE users ADD COLUMN link_account TEXT');
// 환영 공지를 몇 번째 판까지 읽었는지 (계정마다)
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'welcome_seen')) db.exec('ALTER TABLE users ADD COLUMN welcome_seen INTEGER NOT NULL DEFAULT 0');
const addCol = (name, def) => {
  if (dragonCols.includes(name)) return false;
  db.exec(`ALTER TABLE dragons ADD COLUMN ${name} ${def}`);
  return true;
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
// 11단계: 특성
addCol('traits', "TEXT NOT NULL DEFAULT '{}'");     // { list, chosen, counts, done }
// 12단계: 전투
addCol('combat', "TEXT NOT NULL DEFAULT '{}'");     // { skills, w, l, duelOn, autoDuel, lastAuto, lastWin }
// 13단계: 레벨이 오르면 받는 능력치 포인트. 처음 생길 때 이미 오른 레벨만큼 채워 줌
// 14단계: 정신과 광폭화
addCol('mind', 'INTEGER NOT NULL DEFAULT 100');
addCol('mind_at', 'INTEGER NOT NULL DEFAULT 0');
addCol('berserk', 'TEXT');
addCol('place', 'TEXT');
// 16단계: 쓰러짐·상흔·죽음
addCol('fallen', 'TEXT');                           // 쓰러져 선택을 기다리면 { at, region }, 죽은 뒤에는 남긴 둥지 { region, until, closed }
addCol('scars', "TEXT NOT NULL DEFAULT '[]'");      // 상흔이 남은 능력치
addCol('dead_at', 'INTEGER');                       // 긴 잠에 든 시각
addCol('titles', "TEXT NOT NULL DEFAULT '{}'");
addCol('exp_info', "TEXT NOT NULL DEFAULT '{}'");
addCol('chron', "TEXT NOT NULL DEFAULT '[]'");      // 20단계: 지나온 이야기 [{ at, k: 'choice'|'mark', t }] (최근 150개)   // 19단계: 원정 목적·갈림길 { goal, fork: { id, at, pick, res }, last: 지난 원정 일지 }     // 18단계: 칭호 { have: [얻은 칭호 id], on: 단 칭호 id }
addCol('nest_info', "TEXT NOT NULL DEFAULT '{}'");  // 21단계: 둥지 단계·설치한 덫과 결계·보물더미 가치·보물 도둑 { tier, wards, value, raidAt, calm, raid }
addCol('ev_recent', "TEXT NOT NULL DEFAULT '[]'");  // 최근에 겪은 이벤트 [[id, 시각], …] (같은 이벤트가 연달아 뜨지 않게)
addCol('map_public', 'INTEGER NOT NULL DEFAULT 0');  // 관계도에 내 관계를 보일지 (기본은 나에게만)
addCol('heir', 'TEXT');                             // 22단계: 먼 여행을 떠난 드래곤에게서 의지를 이었으면 { name, kind, level, pts }
addCol('bio', "TEXT NOT NULL DEFAULT '{}'");        // 17단계: 성별과 특징 { gender, desc }                            // 15단계: 지역 안의 장소 (없으면 지역 입구)                          // 광폭화 중이면 { at, until, region, hp, hpMax }
if (addCol('stat_pts', 'INTEGER NOT NULL DEFAULT 0')) {
  db.exec(`UPDATE dragons SET stat_pts = (level - 1) * ${require('./game-data').STAT_POINTS.perLevel}`);
}

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
  CREATE TABLE IF NOT EXISTS duels (           -- 결투 기록 (누가 걸었고 누가 이겼는지, 다시 보기용 기록)
    id        INTEGER PRIMARY KEY,
    at        INTEGER NOT NULL,
    mode      TEXT NOT NULL,                     -- auto(자동 결투) / live(실시간 결투)
    from_id   INTEGER NOT NULL REFERENCES dragons(id) ON DELETE CASCADE,   -- 건 쪽
    to_id     INTEGER NOT NULL REFERENCES dragons(id) ON DELETE CASCADE,   -- 받은 쪽
    winner_id INTEGER NOT NULL,
    turns     INTEGER NOT NULL,
    data      TEXT NOT NULL,                     -- 양쪽에서 본 마지막 모습, 턴 기록, 각자의 결과
    seen      INTEGER NOT NULL DEFAULT 1         -- 받은 쪽이 확인했는지 (자동 결투는 0으로 시작)
  );
  CREATE INDEX IF NOT EXISTS duels_from ON duels(from_id, id);
  CREATE INDEX IF NOT EXISTS duels_to ON duels(to_id, id);
  CREATE TABLE IF NOT EXISTS rel_memos (       -- 상대에 대해 나만 보는 메모
    from_id INTEGER NOT NULL REFERENCES dragons(id) ON DELETE CASCADE,
    to_id   INTEGER NOT NULL REFERENCES dragons(id) ON DELETE CASCADE,
    text    TEXT NOT NULL,
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
  CREATE TABLE IF NOT EXISTS gift_inbox (      -- 받은 선물: 받은 쪽이 '확인'을 누를 때까지 남음
    id        INTEGER PRIMARY KEY,
    to_id     INTEGER NOT NULL REFERENCES dragons(id) ON DELETE CASCADE,
    from_id   INTEGER,
    from_name TEXT NOT NULL,
    from_kind TEXT,
    gold      INTEGER NOT NULL DEFAULT 0,
    items     TEXT NOT NULL DEFAULT '[]',
    msg       TEXT NOT NULL DEFAULT '',
    at        INTEGER NOT NULL
  );
`);
// 주고받은 기록: 선물(보냄·받음), 교환, 이벤트로 오간 선물, GM 지급. 드래곤마다 따로 한 줄씩 (최근 LEDGER.keep개, LEDGER.days일)
db.exec(`
  CREATE TABLE IF NOT EXISTS ledger (
    id         INTEGER PRIMARY KEY,
    dragon_id  INTEGER NOT NULL REFERENCES dragons(id) ON DELETE CASCADE,
    at         INTEGER NOT NULL,
    kind       TEXT NOT NULL,              -- gift_out / gift_in / trade / gm
    other_id   INTEGER,                    -- 상대 드래곤 (GM 지급은 NULL)
    other_name TEXT NOT NULL DEFAULT '',
    other_kind TEXT,
    gold_in    INTEGER NOT NULL DEFAULT 0,
    gold_out   INTEGER NOT NULL DEFAULT 0,
    items_in   TEXT NOT NULL DEFAULT '[]',
    items_out  TEXT NOT NULL DEFAULT '[]',
    msg        TEXT NOT NULL DEFAULT '',
    note       TEXT NOT NULL DEFAULT ''    -- '이벤트' 같은 덧붙임
  );
  CREATE INDEX IF NOT EXISTS ledger_dragon ON ledger(dragon_id, id);
`);
const LEDGER = { keep: 300, days: 90 };

// 관계 이름: 서로 맺은 관계(kind = friend)가 어떤 사이인지 (비어 있으면 동료). 요청에도 청한 관계를 적음
if (!db.prepare('PRAGMA table_info(relations)').all().some((c) => c.name === 'bond')) db.exec('ALTER TABLE relations ADD COLUMN bond TEXT');
if (!db.prepare('PRAGMA table_info(friend_requests)').all().some((c) => c.name === 'bond')) db.exec('ALTER TABLE friend_requests ADD COLUMN bond TEXT');
// 관계 메모를 상대도 볼 수 있게 됨. 예전에 '나만 본다'로 쓴 메모는 그대로 비공개(0)로 두고,
// 새로 저장하는 메모부터 공개(1)로 함
if (!db.prepare('PRAGMA table_info(rel_memos)').all().some((c) => c.name === 'shared')) {
  db.exec('ALTER TABLE rel_memos ADD COLUMN shared INTEGER NOT NULL DEFAULT 0');
}


// 10단계: GM 기록 (누가 언제 누구에게 무엇을 했는지)
db.exec(`
  CREATE TABLE IF NOT EXISTS gm_log (
    id      INTEGER PRIMARY KEY,
    gm      TEXT NOT NULL,       -- GM 아이디
    target  TEXT,                -- 대상 드래곤 이름 (공지는 NULL)
    text    TEXT NOT NULL,
    at      INTEGER NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS kin_offers (      -- 둥지 식구(알·아이)를 동료에게 입양 보내자는 제안. 받는 쪽이 정할 때까지 식구는 보내는 쪽 둥지에 있음
    id      INTEGER PRIMARY KEY,
    kin_id  INTEGER NOT NULL UNIQUE,
    from_id INTEGER NOT NULL,
    to_id   INTEGER NOT NULL,
    at      INTEGER NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS world (           -- 대륙 전체의 상태 (대륙의 재앙 등). v는 글자(JSON)
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
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
  ap_at, hp_at, en_at, exp_start, exp_end, exp_region, equip, rep, stance_at, nest, rest_at, hoard_gold, fame, pending_event, traits, combat, last_seen, stat_pts, mind, mind_at, berserk, place, fallen, scars, dead_at, bio, titles, exp_info, chron, nest_info, heir, ev_recent, created_at,
  (avatar IS NOT NULL) AS has_avatar`;

// 석판: 모두가 글을 새겨 남기는 게시판. 쓴 드래곤이 사라져도 글은 남도록 이름·종류를 함께 적어 둠
db.exec(`
  CREATE TABLE IF NOT EXISTS slate_posts (
    id        INTEGER PRIMARY KEY,
    dragon_id INTEGER REFERENCES dragons(id) ON DELETE SET NULL,
    name      TEXT NOT NULL,
    kind      TEXT,
    head      TEXT NOT NULL,                 -- 말머리: story(이야기) / tip(공략) / party(모집) / free(자유)
    title     TEXT NOT NULL,
    body      TEXT NOT NULL,
    at        INTEGER NOT NULL,
    edited_at INTEGER,
    pinned    INTEGER NOT NULL DEFAULT 0     -- GM이 맨 위에 고정
  );
  CREATE TABLE IF NOT EXISTS slate_comments (
    id        INTEGER PRIMARY KEY,
    post_id   INTEGER NOT NULL REFERENCES slate_posts(id) ON DELETE CASCADE,
    dragon_id INTEGER REFERENCES dragons(id) ON DELETE SET NULL,
    name      TEXT NOT NULL,
    kind      TEXT,
    text      TEXT NOT NULL,
    at        INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS slate_comments_post ON slate_comments(post_id, at);
`);
if (!db.prepare('PRAGMA table_info(slate_comments)').all().some((c) => c.name === 'edited_at')) db.exec('ALTER TABLE slate_comments ADD COLUMN edited_at INTEGER'); // 답 고친 때
if (!db.prepare('PRAGMA table_info(slate_comments)').all().some((c) => c.name === 'parent_id')) db.exec('ALTER TABLE slate_comments ADD COLUMN parent_id INTEGER'); // 대댓글: 어느 답에 단 답인지
// 석판 그림: 먼저 올려 두고(post_id 없음) 글을 새길 때 그 글에 붙임. 글이 지워지면 함께 지워짐
db.exec(`
  CREATE TABLE IF NOT EXISTS slate_images (
    id        INTEGER PRIMARY KEY,
    post_id   INTEGER REFERENCES slate_posts(id) ON DELETE CASCADE,
    dragon_id INTEGER NOT NULL,
    type      TEXT NOT NULL,
    data      BLOB NOT NULL,
    w         INTEGER, h INTEGER,
    ord       INTEGER NOT NULL DEFAULT 0,
    at        INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS slate_images_post ON slate_images(post_id, ord);
`);

const q = {
  countUsers:   db.prepare('SELECT COUNT(*) AS n FROM users'),
  userByName:   db.prepare('SELECT * FROM users WHERE username = ?'),
  createUser:   db.prepare('INSERT INTO users (username, pw_hash, is_gm, created_at, link_account) VALUES (?, ?, ?, ?, ?)'),
  createSess:   db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)'),
  // 로그인 토큰은 90일이 지나면 쓸 수 없음 (오래전에 남긴 토큰이 새어 나가도 계속 쓰이지 않게)
  sessUser:     db.prepare('SELECT u.id, u.username, u.is_gm FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.created_at > ?'),
  deleteSess:   db.prepare('DELETE FROM sessions WHERE token = ?'),
  setPw:        db.prepare('UPDATE users SET pw_hash = ? WHERE id = ?'),
  delSessOf:    db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  dragonByUser: db.prepare(`SELECT ${DRAGON_FIELDS} FROM dragons WHERE user_id = ?`),
  dragonByName: db.prepare('SELECT id FROM dragons WHERE name = ?'),
  setNameKind:  db.prepare('UPDATE dragons SET name = ?, kind = ? WHERE id = ?'),
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
                              pending_event = @pending_event, traits = @traits, combat = @combat,
                              claw = @claw, scale = @scale, wing = @wing, wisdom = @wisdom, majesty = @majesty, stat_pts = @stat_pts,
                              mind = @mind, mind_at = @mind_at, berserk = @berserk, place = @place,
                              fallen = @fallen, scars = @scars, titles = @titles, exp_info = @exp_info, chron = @chron, nest_info = @nest_info, ev_recent = @ev_recent
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
  recentChat:   db.prepare('SELECT id, dragon_id AS dragonId, name, kind, text, at FROM chat WHERE region = ? ORDER BY id DESC LIMIT ?'),
  olderChat:    db.prepare('SELECT id, dragon_id AS dragonId, name, kind, text, at FROM chat WHERE region = ? AND id < ? ORDER BY id DESC LIMIT ?'),
  chatGet:      db.prepare('SELECT id, region, dragon_id AS dragonId FROM chat WHERE id = ?'),
  chatDel:      db.prepare('DELETE FROM chat WHERE id = ?'),
  kinList:      db.prepare('SELECT id, type, status, name, data FROM kin WHERE dragon_id = ? ORDER BY id'),
  kinAdd:       db.prepare('INSERT INTO kin (dragon_id, type, status, name, data, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  kinSave:      db.prepare('UPDATE kin SET status = ?, name = ?, data = ? WHERE id = ? AND dragon_id = ?'),
  dragonById:   db.prepare(`SELECT ${DRAGON_FIELDS} FROM dragons WHERE id = ?`),
  dragonsIn:    db.prepare(`SELECT ${DRAGON_FIELDS} FROM dragons WHERE region = ? AND dead_at IS NULL ORDER BY last_seen DESC`),
  nestsAll:     db.prepare('SELECT id, name, nest FROM dragons WHERE nest IS NOT NULL AND dead_at IS NULL AND id != ?'), // 둥지를 튼 드래곤 (소꿉친구 찾기)
  addGold:      db.prepare('UPDATE dragons SET gold = gold + ? WHERE id = ?'),
  relGet:       db.prepare('SELECT kind FROM relations WHERE from_id = ? AND to_id = ?'),
  relSet:       db.prepare(`INSERT INTO relations (from_id, to_id, kind, at) VALUES (?, ?, ?, ?)
                            ON CONFLICT(from_id, to_id) DO UPDATE SET kind = excluded.kind, at = excluded.at`),
  relDel:       db.prepare('DELETE FROM relations WHERE from_id = ? AND to_id = ?'),
  duelAdd:      db.prepare('INSERT INTO duels (at, mode, from_id, to_id, winner_id, turns, data, seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  duelPrune:    db.prepare('DELETE FROM duels WHERE at < ?'),
  duelList:     db.prepare(`SELECT x.id, x.at, x.mode, x.from_id, x.to_id, x.winner_id, x.turns, x.seen,
                              o.id AS oid, o.name AS oname, o.kind AS okind, o.avatar_ver AS oav, (o.avatar IS NOT NULL) AS ohas
                            FROM duels x JOIN dragons o ON o.id = CASE WHEN x.from_id = @me THEN x.to_id ELSE x.from_id END
                            WHERE x.from_id = @me OR x.to_id = @me ORDER BY x.id DESC LIMIT @n`),
  duelGet:      db.prepare('SELECT * FROM duels WHERE id = ?'),
  duelUnseen:   db.prepare("SELECT COUNT(*) AS n FROM duels WHERE to_id = ? AND seen = 0"),
  duelSeenAll:  db.prepare('UPDATE duels SET seen = 1 WHERE to_id = ? AND seen = 0'),
  memoGet:      db.prepare('SELECT text, shared FROM rel_memos WHERE from_id = ? AND to_id = ?'),
  memoSet:      db.prepare(`INSERT INTO rel_memos (from_id, to_id, text, at, shared) VALUES (?, ?, ?, ?, 1)
                            ON CONFLICT(from_id, to_id) DO UPDATE SET text = excluded.text, at = excluded.at, shared = 1`),
  memoDel:      db.prepare('DELETE FROM rel_memos WHERE from_id = ? AND to_id = ?'),
  memoAll:      db.prepare('SELECT to_id AS id, text FROM rel_memos WHERE from_id = ?'),
  memoAbout:    db.prepare('SELECT from_id AS id, text FROM rel_memos WHERE to_id = ? AND shared = 1'),
  rivalFans:    db.prepare("SELECT from_id AS id FROM relations WHERE to_id = ? AND kind = 'rival'"),
  relBond:      db.prepare('SELECT bond FROM relations WHERE from_id = ? AND to_id = ? AND kind = \'friend\''),
  relBondSet:   db.prepare('UPDATE relations SET bond = ? WHERE from_id = ? AND to_id = ?'),
  relByBond:    db.prepare("SELECT to_id AS id FROM relations WHERE from_id = ? AND kind = 'friend' AND bond = ?"),
  reqBond:      db.prepare('SELECT bond FROM friend_requests WHERE from_id = ? AND to_id = ?'),
  reqAddBond:   db.prepare('INSERT OR REPLACE INTO friend_requests (from_id, to_id, at, bond) VALUES (?, ?, ?, ?)'),
  kinAdoptedOut: db.prepare(`SELECT k.id, k.type, k.status, k.name, k.data, k.dragon_id AS owner_id, d.name AS owner FROM kin k JOIN dragons d ON d.id = k.dragon_id
    WHERE k.status IN ('home', 'egg') AND d.dead_at IS NULL AND json_extract(k.data, '$.adoptedFromId') = ?`),
  relList:      db.prepare(`SELECT r.to_id AS id, r.kind, r.bond, d.name, d.kind AS dkind, d.level, d.region, d.avatar_ver, (d.avatar IS NOT NULL) AS has_avatar
                            FROM relations r JOIN dragons d ON d.id = r.to_id WHERE r.from_id = ? ORDER BY d.name`),
  // 관계도: 대륙의 모든 드래곤과 서로 맺은 관계 (한 쌍에 한 줄. bond는 from에게 to가 무엇인지)
  mapDragons:   db.prepare('SELECT id, name, kind, level, avatar_ver, (avatar IS NOT NULL) AS has_avatar, map_public FROM dragons WHERE dead_at IS NULL'),
  // 관계도에 함께 보일 표시: 라이벌·원수 (혼자 붙이지만 상대도 아는 것만. 경계는 나만 아는 것이라 빼둠)
  mapMarks:     db.prepare(`SELECT r.from_id AS a, r.to_id AS b, r.kind FROM relations r
                            JOIN dragons x ON x.id = r.from_id JOIN dragons y ON y.id = r.to_id
                            WHERE r.kind IN ('rival', 'nemesis') AND x.dead_at IS NULL AND y.dead_at IS NULL`),
  mapPublicGet: db.prepare('SELECT map_public FROM dragons WHERE id = ?'),
  mapPublicSet: db.prepare('UPDATE dragons SET map_public = ? WHERE id = ?'),
  mapBonds:     db.prepare(`SELECT r.from_id AS a, r.to_id AS b, r.bond FROM relations r
                            JOIN dragons x ON x.id = r.from_id JOIN dragons y ON y.id = r.to_id
                            WHERE r.kind = 'friend' AND r.from_id < r.to_id AND x.dead_at IS NULL AND y.dead_at IS NULL`),
  reqGet:       db.prepare('SELECT at FROM friend_requests WHERE from_id = ? AND to_id = ?'),
  reqAdd:       db.prepare('INSERT OR IGNORE INTO friend_requests (from_id, to_id, at) VALUES (?, ?, ?)'),
  reqDel:       db.prepare('DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?'),
  reqIn:        db.prepare(`SELECT r.from_id AS id, r.bond, d.name, d.kind AS dkind, d.level, d.avatar_ver, (d.avatar IS NOT NULL) AS has_avatar
                            FROM friend_requests r JOIN dragons d ON d.id = r.from_id WHERE r.to_id = ? ORDER BY r.at`),
  reqOut:       db.prepare(`SELECT r.to_id AS id, r.bond, d.name, d.kind AS dkind, d.level, d.avatar_ver, (d.avatar IS NOT NULL) AS has_avatar
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
  ledgerAdd:    db.prepare(`INSERT INTO ledger (dragon_id, at, kind, other_id, other_name, other_kind, gold_in, gold_out, items_in, items_out, msg, note)
                            VALUES (@dragon_id, @at, @kind, @other_id, @other_name, @other_kind, @gold_in, @gold_out, @items_in, @items_out, @msg, @note)`),
  ledgerList:   db.prepare('SELECT * FROM ledger WHERE dragon_id = ? ORDER BY id DESC LIMIT ?'),
  ledgerPrune:  db.prepare(`DELETE FROM ledger WHERE dragon_id = @d AND (at < @old OR id <= (SELECT id FROM ledger WHERE dragon_id = @d ORDER BY id DESC LIMIT 1 OFFSET @keep))`),
  giftIn:       db.prepare('INSERT INTO gift_inbox (to_id, from_id, from_name, from_kind, gold, items, msg, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  giftList:     db.prepare('SELECT * FROM gift_inbox WHERE to_id = ? ORDER BY id'),
  giftSeen:     db.prepare('DELETE FROM gift_inbox WHERE id = ? AND to_id = ?'),
  noteList:     db.prepare('SELECT text FROM notes WHERE dragon_id = ? ORDER BY id'),
  noteClear:    db.prepare('DELETE FROM notes WHERE dragon_id = ?'),
  // GM
  gmList:       db.prepare(`SELECT d.id, d.name, d.kind, d.level, d.region, d.gold, d.last_seen AS lastSeen, d.avatar_ver, (d.avatar IS NOT NULL) AS has_avatar,
                                   u.username, u.is_gm AS isGm, u.link_account AS link
                            FROM dragons d JOIN users u ON u.id = d.user_id
                            WHERE d.name LIKE @q OR u.username LIKE @q ORDER BY d.last_seen DESC LIMIT 100`),
  gmUserOf:     db.prepare('SELECT u.id, u.username, u.is_gm, u.link_account AS link FROM dragons d JOIN users u ON u.id = d.user_id WHERE d.id = ?'),
  gmSetRole:    db.prepare('UPDATE users SET is_gm = ? WHERE id = ?'),
  welcomeSeen:  db.prepare('SELECT welcome_seen AS v FROM users WHERE id = ?'),
  welcomeSet:   db.prepare('UPDATE users SET welcome_seen = ? WHERE id = ?'),
  gmLogAdd:     db.prepare('INSERT INTO gm_log (gm, target, text, at) VALUES (?, ?, ?, ?)'),
  gmLogList:    db.prepare('SELECT gm, target, text, at FROM gm_log ORDER BY id DESC LIMIT ?'),
  gmLogPrune:   db.prepare('DELETE FROM gm_log WHERE id <= (SELECT id FROM gm_log ORDER BY id DESC LIMIT 1 OFFSET 500)'),
  dragonIds:    db.prepare('SELECT id FROM dragons'),
  activeSince:  db.prepare('SELECT id, level FROM dragons WHERE dead_at IS NULL AND last_seen >= ?'),
  offerAdd:     db.prepare('INSERT INTO kin_offers (kin_id, from_id, to_id, at) VALUES (?, ?, ?, ?)'),
  offerGet:     db.prepare('SELECT * FROM kin_offers WHERE id = ?'),
  offerOfKin:   db.prepare('SELECT * FROM kin_offers WHERE kin_id = ?'),
  offersTo:     db.prepare('SELECT * FROM kin_offers WHERE to_id = ? ORDER BY at'),
  offersFrom:   db.prepare('SELECT * FROM kin_offers WHERE from_id = ? ORDER BY at'),
  offerDel:     db.prepare('DELETE FROM kin_offers WHERE id = ?'),
  offersToN:    db.prepare('SELECT COUNT(*) AS n FROM kin_offers WHERE to_id = ?'),
  // 석판 (쓴 드래곤이 남아 있으면 지금 이름·종류·그림으로)
  slateList:    db.prepare(`SELECT p.id, p.dragon_id, COALESCE(d.name, p.name) AS name, COALESCE(d.kind, p.kind) AS kind, d.avatar_ver, (d.avatar IS NOT NULL) AS has_avatar,
                              p.head, p.title, substr(p.body, 1, 160) AS preview, p.at, p.edited_at, p.pinned,
                              (SELECT COUNT(*) FROM slate_comments c WHERE c.post_id = p.id) AS n,
                              (SELECT MAX(c.at) FROM slate_comments c WHERE c.post_id = p.id) AS last_c,
                              (SELECT c.dragon_id FROM slate_comments c WHERE c.post_id = p.id ORDER BY c.at DESC LIMIT 1) AS last_by
                            FROM slate_posts p LEFT JOIN dragons d ON d.id = p.dragon_id ORDER BY p.pinned DESC, p.at DESC LIMIT ?`),
  slateGet:     db.prepare(`SELECT p.*, COALESCE(d.name, p.name) AS cur_name, COALESCE(d.kind, p.kind) AS cur_kind, d.avatar_ver, (d.avatar IS NOT NULL) AS has_avatar
                            FROM slate_posts p LEFT JOIN dragons d ON d.id = p.dragon_id WHERE p.id = ?`),
  slateCms:     db.prepare(`SELECT c.id, c.dragon_id, COALESCE(d.name, c.name) AS name, COALESCE(d.kind, c.kind) AS kind, d.avatar_ver, (d.avatar IS NOT NULL) AS has_avatar, c.text, c.at, c.edited_at, c.parent_id
                            FROM slate_comments c LEFT JOIN dragons d ON d.id = c.dragon_id WHERE c.post_id = ? ORDER BY c.at`),
  slateAdd:     db.prepare('INSERT INTO slate_posts (dragon_id, name, kind, head, title, body, at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  slateEdit:    db.prepare('UPDATE slate_posts SET head = ?, title = ?, body = ?, edited_at = ? WHERE id = ?'),
  slateDel:     db.prepare('DELETE FROM slate_posts WHERE id = ?'),
  slatePin:     db.prepare('UPDATE slate_posts SET pinned = ? WHERE id = ?'),
  slateCmAdd:   db.prepare('INSERT INTO slate_comments (post_id, dragon_id, name, kind, text, at, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  slateCmGet:   db.prepare('SELECT * FROM slate_comments WHERE id = ?'),
  slateCmDel:   db.prepare('DELETE FROM slate_comments WHERE id = ? OR parent_id = ?'), // 답을 지우면 그 답에 달린 답글도 함께
  slateCmEdit:  db.prepare('UPDATE slate_comments SET text = ?, edited_at = ? WHERE id = ?'),
  slateLatest:  db.prepare('SELECT MAX(at) AS at FROM slate_posts'),
  // 내 글이나 내가 단 답에 남이 단 가장 새 답의 때 (석판 아이콘 점)
  slateReplyAt: db.prepare(`SELECT MAX(c.at) AS at FROM slate_comments c JOIN slate_posts p ON p.id = c.post_id
                            WHERE (p.dragon_id = ? OR c.parent_id IN (SELECT id FROM slate_comments WHERE dragon_id = ?)) AND (c.dragon_id IS NULL OR c.dragon_id != ?)`),
  slateImgAdd:  db.prepare('INSERT INTO slate_images (dragon_id, type, data, w, h, at) VALUES (?, ?, ?, ?, ?, ?)'),
  slateImgGet:  db.prepare('SELECT id, post_id, dragon_id, type, data FROM slate_images WHERE id = ?'),
  slateImgMeta: db.prepare('SELECT id, post_id, dragon_id FROM slate_images WHERE id = ?'),
  slateImgsOf:  db.prepare('SELECT id, w, h FROM slate_images WHERE post_id = ? ORDER BY ord, id'),
  slateImgSet:  db.prepare('UPDATE slate_images SET post_id = ?, ord = ? WHERE id = ?'),
  slateImgDel:  db.prepare('DELETE FROM slate_images WHERE id = ?'),
  slateImgPend: db.prepare('SELECT COUNT(*) AS n FROM slate_images WHERE dragon_id = ? AND post_id IS NULL'),
  slateImgOld:  db.prepare('DELETE FROM slate_images WHERE post_id IS NULL AND at < ?'),
  slateDayN:    db.prepare('SELECT COUNT(*) AS n FROM slate_posts WHERE dragon_id = ? AND at >= ?'),
  worldGet:     db.prepare('SELECT v FROM world WHERE k = ?'),
  worldSet:     db.prepare('INSERT INTO world (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'),
  berserkIds:   db.prepare('SELECT id FROM dragons WHERE berserk IS NOT NULL'),
  // 죽음
  delUser:      db.prepare('DELETE FROM users WHERE id = ?'),
  gmCount:      db.prepare("SELECT COUNT(*) AS n FROM users WHERE is_gm = 1"),
  userCount:    db.prepare("SELECT COUNT(*) AS n FROM users WHERE username NOT LIKE '#묘비#%'"),
  setBio:       db.prepare('UPDATE dragons SET bio = ? WHERE id = ?'),
  graveIds:     db.prepare("SELECT id FROM dragons WHERE dead_at IS NOT NULL AND fallen IS NOT NULL AND fallen NOT LIKE '%\"closed\":true%'"),
  waitIds:      db.prepare("SELECT id FROM dragons WHERE dead_at IS NULL AND fallen LIKE '%\"wait\"%'"),
  graveUser:    db.prepare('INSERT INTO users (username, pw_hash, is_gm, created_at) VALUES (?, ?, 0, ?)'),
  setOwner:     db.prepare('UPDATE dragons SET user_id = ?, dead_at = ? WHERE id = ?'),
  legacyGet:    db.prepare('SELECT legacy FROM users WHERE id = ?'),
  legacySet:    db.prepare('UPDATE users SET legacy = ? WHERE id = ?'),
  setHeir:      db.prepare('UPDATE dragons SET heir = ? WHERE id = ?'),
  invClear:     db.prepare('DELETE FROM inventory WHERE dragon_id = ?'),
  hoardSet:     db.prepare('UPDATE hoard SET qty = qty - ? WHERE dragon_id = ? AND item = ? AND qty >= ?'),
  hoardClear:   db.prepare('DELETE FROM hoard WHERE dragon_id = ?'),
  hoardGoldSet: db.prepare('UPDATE dragons SET hoard_gold = ? WHERE id = ?'),
  kinMove:      db.prepare('UPDATE kin SET dragon_id = ? WHERE id = ? AND dragon_id = ?'),
  arenaList:    db.prepare(`SELECT id, name, kind, level, combat, last_seen AS lastSeen, avatar_ver, (avatar IS NOT NULL) AS has_avatar
                            FROM dragons WHERE id != ? AND dead_at IS NULL ORDER BY last_seen DESC LIMIT 60`),
  kinDel:       db.prepare('DELETE FROM kin WHERE id = ? AND dragon_id = ?'),
  pruneChat:    db.prepare('DELETE FROM chat WHERE region = ? AND id <= (SELECT id FROM chat WHERE region = ? ORDER BY id DESC LIMIT 1 OFFSET 200)'),
};

// 드래곤의 바뀌는 상태(체력, 행동력, 원정 등)와 얻은 물건을 저장 (트랜잭션은 부르는 쪽에서)
function saveStateRaw(d, items = [], hoardItems = []) {
  if (items.length || hoardItems.length) require('./game-logic').dexItems(d, [...items, ...hoardItems]); // 도감: 처음 얻은 물건
  q.saveState.run({
    id: d.id, level: d.level, xp: d.xp, hp: d.hp, hp_max: d.hp_max, en: d.en, en_max: d.en_max,
    ap: d.ap, gold: d.gold, ap_at: d.ap_at, hp_at: d.hp_at, en_at: d.en_at || 0,
    exp_start: d.exp_start ?? null, exp_end: d.exp_end ?? null, exp_region: d.exp_region ?? null,
    equip: typeof d.equip === 'string' ? d.equip : JSON.stringify(d.equip || {}), // 이미 글자면 그대로 (두 번 감싸지 않게)
    rep: typeof d.rep === 'string' ? d.rep : JSON.stringify(d.rep || {}),
    stance: d.stance, stance_at: d.stance_at || 0,
    region: d.region, nest: d.nest ?? null, rest_at: d.rest_at ?? null, hoard_gold: d.hoard_gold || 0,
    fame: d.fame || 0, pending_event: d.pending_event ?? null,
    traits: typeof d.traits === 'string' ? d.traits : JSON.stringify(d.traits || {}),
    combat: typeof d.combat === 'string' ? d.combat : JSON.stringify(d.combat || {}),
    claw: d.claw, scale: d.scale, wing: d.wing, wisdom: d.wisdom, majesty: d.majesty, stat_pts: d.stat_pts || 0,
    mind: d.mind ?? 100, mind_at: d.mind_at || 0, place: d.place ?? null,
    fallen: d.fallen ? (typeof d.fallen === 'string' ? d.fallen : JSON.stringify(d.fallen)) : null,
    scars: typeof d.scars === 'string' ? d.scars : JSON.stringify(d.scars || []),
    titles: typeof d.titles === 'string' ? d.titles : JSON.stringify(d.titles || {}),
    exp_info: typeof d.exp_info === 'string' ? d.exp_info : JSON.stringify(d.exp_info || {}),
    chron: typeof d.chron === 'string' ? d.chron : JSON.stringify(d.chron || []),
    nest_info: typeof d.nest_info === 'string' ? d.nest_info : JSON.stringify(d.nest_info || {}),
    ev_recent: typeof d.ev_recent === 'string' ? d.ev_recent : JSON.stringify(d.ev_recent || []),
    berserk: d.berserk ? (typeof d.berserk === 'string' ? d.berserk : JSON.stringify(d.berserk)) : null,
  });

  for (const { id, qty } of items) q.invAdd.run(d.id, id, qty);
  for (const { id, qty } of hoardItems) q.hoardAdd.run(d.id, id, qty);
}

// ── 백업: 지금 순간의 사본을 파일로 (게임이 돌아가는 중에도 깨지지 않게 VACUUM INTO) ──
function snapshot(to) {
  if (fs.existsSync(to)) fs.unlinkSync(to);
  db.exec(`VACUUM INTO '${to.replace(/'/g, "''")}'`);
  return to;
}
// 올린 파일이 이 게임의 저장 파일이 맞는지 살펴봄 (SQLite이고, 드래곤·계정 표가 있는지)
function checkBackup(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 100 || buf.subarray(0, 16).toString('latin1') !== 'SQLite format 3\u0000') return { error: '저장 파일(.db)이 아니다.' };
  let t;
  try {
    t = new Database(file, { readonly: true, fileMustExist: true });
    const names = new Set(t.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
    if (!names.has('dragons') || !names.has('users')) return { error: '용의 대륙의 저장 파일이 아니다.' };
    const ok = t.pragma('quick_check', { simple: true });
    if (ok !== 'ok') return { error: '저장 파일이 깨져 있다.' };
    return { ok: true, dragons: t.prepare('SELECT COUNT(*) AS n FROM dragons').get().n, users: t.prepare('SELECT COUNT(*) AS n FROM users').get().n };
  } catch (e) {
    return { error: `저장 파일을 읽지 못했다. (${e.message})` };
  } finally {
    if (t) t.close();
  }
}
// 되돌릴 파일을 자리에 놓음. 실제로 바꾸는 건 서버를 다시 켤 때 (위의 RESTORE_PATH)
function stageRestore(file) {
  fs.copyFileSync(file, RESTORE_PATH);
}
const closeDb = () => { try { db.pragma('wal_checkpoint(TRUNCATE)'); db.close(); } catch {} };
const dbFileSize = () => { try { return fs.statSync(DB_PATH).size + (fs.existsSync(`${DB_PATH}-wal`) ? fs.statSync(`${DB_PATH}-wal`).size : 0); } catch { return 0; } };

// 빚은 물건(cx_…)이 지금 어딘가에 남아 있는지: 소지품 · 보물더미 · 받은 선물함 · 착용 · 내 제작법
function customRefs() {
  const keep = new Set();
  for (const r of db.prepare("SELECT DISTINCT item FROM inventory WHERE item LIKE 'cx\_%' ESCAPE '\\'").all()) keep.add(r.item);
  for (const r of db.prepare("SELECT DISTINCT item FROM hoard WHERE item LIKE 'cx\_%' ESCAPE '\\'").all()) keep.add(r.item);
  for (const r of db.prepare("SELECT items FROM gift_inbox WHERE items LIKE '%cx\_%' ESCAPE '\\'").all()) { try { for (const x of JSON.parse(r.items || '[]')) keep.add(x.id); } catch {} }
  for (const r of db.prepare("SELECT equip, combat FROM dragons WHERE equip LIKE '%cx\_%' ESCAPE '\\' OR combat LIKE '%cx\_%' ESCAPE '\\'").all()) {
    try { for (const v of Object.values(JSON.parse(r.equip || '{}'))) keep.add(v); } catch {}
    try { for (const m of JSON.parse(r.combat || '{}').myRecipes || []) if (m.id) keep.add(m.id); } catch {}
  }
  return keep;
}

// 목록에 없는 빚은 물건(cx_…)이 어딘가에 남아 있으면 치움: 소지품 · 보물더미 · 받은 선물함 · 착용
// (백업을 되돌리거나 무언가 잘못되어 정의가 사라진 경우. 남겨 두면 버리지도 쓰지도 못하는 물건이 됨)
function customOrphans(isKnown) {
  let n = 0;
  const tx = db.transaction(() => {
    for (const t of ['inventory', 'hoard']) {
      for (const r of db.prepare(`SELECT dragon_id, item FROM ${t} WHERE item LIKE 'cx\\_%' ESCAPE '\\'`).all()) {
        if (isKnown(r.item)) continue;
        db.prepare(`DELETE FROM ${t} WHERE dragon_id = ? AND item = ?`).run(r.dragon_id, r.item); n++;
      }
    }
    for (const r of db.prepare("SELECT id, items FROM gift_inbox WHERE items LIKE '%cx\\_%' ESCAPE '\\'").all()) {
      let l; try { l = JSON.parse(r.items || '[]'); } catch { continue; }
      const k = l.filter((x) => !String(x.id).startsWith('cx_') || isKnown(x.id));
      if (k.length !== l.length) { db.prepare('UPDATE gift_inbox SET items = ? WHERE id = ?').run(JSON.stringify(k), r.id); n += l.length - k.length; }
    }
    for (const r of db.prepare("SELECT id, equip FROM dragons WHERE equip LIKE '%cx\\_%' ESCAPE '\\'").all()) {
      let e; try { e = JSON.parse(r.equip || '{}'); } catch { continue; }
      let ch = false;
      for (const [slot, id] of Object.entries(e)) if (String(id).startsWith('cx_') && !isKnown(id)) { delete e[slot]; ch = true; n++; }
      if (ch) db.prepare('UPDATE dragons SET equip = ? WHERE id = ?').run(JSON.stringify(e), r.id);
    }
  });
  tx();
  return n;
}

module.exports = {
  DB_PATH, snapshot, customRefs, customOrphans, checkBackup, stageRestore, closeDb, dbFileSize,
  countUsers: () => q.countUsers.get().n,
  getUserByName: (name) => q.userByName.get(name),
  // 비밀번호 바꾸기. keepToken이 있으면 그 접속만 남기고 다른 기기의 로그인은 모두 끊음
  setPassword: (userId, hash, keepToken = null) => {
    q.setPw.run(hash, userId);
    const keep = keepToken ? q.sessUser.get(keepToken) : null;
    q.delSessOf.run(userId);
    if (keep && keep.id === userId) q.createSess.run(keepToken, userId, Date.now());
  },
  createUser: (name, hash, isGm, link = null) => q.createUser.run(name, hash, isGm ? 1 : 0, Date.now(), link || null).lastInsertRowid,
  createSession: (token, userId) => q.createSess.run(token, userId, Date.now()),
  getSessionUser: (token) => q.sessUser.get(token, Date.now() - 90 * 86400000),
  deleteSession: (token) => q.deleteSess.run(token),
  getDragonByUser: (userId) => q.dragonByUser.get(userId),
  dragonNameTaken: (name) => !!q.dragonByName.get(name),
  dragonNameOwner: (name) => q.dragonByName.get(name)?.id ?? null,
  setNameKind: (id, name, kind) => q.setNameKind.run(name, kind, id),     // GM: 이름·종족 바꾸기
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
  // 결투 기록 (30일이 지난 것은 지움)
  duelAdd: (r) => {
    q.duelPrune.run(Date.now() - 30 * 86400000);
    return Number(q.duelAdd.run(Date.now(), r.mode, r.from, r.to, r.winner, r.turns, JSON.stringify(r.data), r.seen ? 1 : 0).lastInsertRowid);
  },
  duelList: (me, n = 30) => q.duelList.all({ me, n }),
  duelGet: (id) => { const r = q.duelGet.get(id); if (r) { try { r.data = JSON.parse(r.data); } catch { r.data = {}; } } return r; },
  duelUnseen: (id) => q.duelUnseen.get(id).n,
  duelSeenAll: (id) => q.duelSeenAll.run(id),
  nestsAll: (exceptId) => q.nestsAll.all(exceptId),
  dragonsIn: (region) => q.dragonsIn.all(region),   // 이 지역에 머무는 드래곤 (접속하지 않은 드래곤 포함, 긴 잠에 든 드래곤 제외)
  relGet: (a, b) => q.relGet.get(a, b)?.kind || null,
  relSet: (a, b, kind) => q.relSet.run(a, b, kind, Date.now()),
  relDel: (a, b) => q.relDel.run(a, b),
  relList: (id) => q.relList.all(id),
  mapDragons: () => q.mapDragons.all(),
  mapBonds: () => q.mapBonds.all(),
  mapMarks: () => q.mapMarks.all(),
  mapPublic: (id) => !!q.mapPublicGet.get(id)?.map_public,
  setMapPublic: (id, on) => q.mapPublicSet.run(on ? 1 : 0, id),
  // 내가 입양 보낸 식구 (다른 둥지에서 아직 함께 사는)
  kinAdoptedOut: (id) => q.kinAdoptedOut.all(id).map((r) => { let data = {}; try { data = JSON.parse(r.data); } catch {} return { ...r, data }; }),
  // 관계 메모: a가 b에 대해 쓴 글. 상대(b)도 볼 수 있음 (예전에 쓴 비공개 메모는 다시 저장하기 전까지 a만 봄). 비우면 지워짐
  memoGet: (a, b) => { const r = q.memoGet.get(a, b); return { text: r?.text || '', shared: !!r?.shared }; },
  memoShared: (a, b) => { const r = q.memoGet.get(a, b); return r?.shared ? r.text : ''; },   // b가 볼 수 있는 a의 메모
  memoAboutMap: (b) => new Map(q.memoAbout.all(b).map((r) => [r.id, r.text])),               // b에 대해 남긴 공개 메모들
  memoSet: (a, b, text) => (text ? q.memoSet.run(a, b, text, Date.now()) : q.memoDel.run(a, b)),
  memoMap: (a) => new Map(q.memoAll.all(a).map((r) => [r.id, r.text])),
  rivalFans: (id) => q.rivalFans.all(id).map((r) => r.id),      // 이 드래곤을 라이벌로 정한 드래곤들
  reqGet: (a, b) => !!q.reqGet.get(a, b),
  reqAdd: (a, b) => q.reqAdd.run(a, b, Date.now()),
  reqDel: (a, b) => q.reqDel.run(a, b),
  reqIn: (id) => q.reqIn.all(id),
  reqOut: (id) => q.reqOut.all(id),
  reqInCount: (id) => q.reqInCount.get(id).n,
  // 동료 맺기·끊기는 양쪽을 한 번에
  // 서로 맺음: bond는 a에게 b가 무엇인지 (b 쪽에는 그 반대: 스승 ↔ 제자). 이미 맺은 사이면 관계만 바뀜
  befriend: db.transaction((a, b, bond = 'comrade', inv = bond) => {
    q.relSet.run(a, b, 'friend', Date.now()); q.relSet.run(b, a, 'friend', Date.now());
    q.relBondSet.run(bond, a, b); q.relBondSet.run(inv, b, a);
    q.reqDel.run(a, b); q.reqDel.run(b, a);
  }),
  relBond: (a, b) => { const r = q.relBond.get(a, b); return r ? r.bond || 'comrade' : null; },
  relByBond: (a, bond) => q.relByBond.all(a, bond).map((r) => r.id),
  reqBond: (a, b) => { const r = q.reqBond.get(a, b); return r ? r.bond || 'comrade' : null; },
  reqAddBond: (a, b, bond) => q.reqAddBond.run(a, b, Date.now(), bond),
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
  // 주고받은 기록 한 줄. e: { kind, other: { id, name, kind } | null, goldIn, goldOut, itemsIn, itemsOut, msg, note }
  ledgerAdd: (dragonId, e) => {
    const clean = (l) => JSON.stringify((l || []).filter((x) => x && x.id && x.qty > 0).map((x) => ({ id: x.id, qty: x.qty })));
    q.ledgerAdd.run({
      dragon_id: dragonId, at: Date.now(), kind: e.kind,
      other_id: e.other?.id ?? null, other_name: e.other?.name || '', other_kind: e.other?.kind || null,
      gold_in: Math.max(0, e.goldIn || 0), gold_out: Math.max(0, e.goldOut || 0),
      items_in: clean(e.itemsIn), items_out: clean(e.itemsOut), msg: e.msg || '', note: e.note || '',
    });
    q.ledgerPrune.run({ d: dragonId, old: Date.now() - LEDGER.days * 86400000, keep: LEDGER.keep });
  },
  ledgerList: (dragonId, n = 100) => q.ledgerList.all(dragonId, n).map((r) => {
    const parse = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };
    return {
      id: r.id, at: r.at, kind: r.kind, note: r.note, msg: r.msg,
      other: r.other_id || r.other_name ? { id: r.other_id, name: r.other_name, kind: r.other_kind } : null,
      goldIn: r.gold_in, goldOut: r.gold_out, itemsIn: parse(r.items_in), itemsOut: parse(r.items_out),
    };
  }),
  // 받은 선물 상자 (확인할 때까지 남는 알림)
  giftIn: (to, from, gold, items, msg) => Number(q.giftIn.run(to, from.id, from.name, from.kind, gold, JSON.stringify(items), msg, Date.now()).lastInsertRowid),
  giftList: (to) => q.giftList.all(to).map((r) => ({ id: r.id, from: { id: r.from_id, name: r.from_name, kind: r.from_kind }, gold: r.gold, items: JSON.parse(r.items || '[]'), msg: r.msg, at: r.at })),
  giftSeen: (id, to) => q.giftSeen.run(id, to).changes > 0,
  notesTake: db.transaction((id) => { const l = q.noteList.all(id).map((r) => r.text); q.noteClear.run(id); return l; }),
  // GM
  gmList: (text) => q.gmList.all({ q: `%${String(text || '').replace(/[%_]/g, '')}%` }),
  gmUserOf: (dragonId) => q.gmUserOf.get(dragonId),
  welcomeSeen: (userId) => q.welcomeSeen.get(userId)?.v || 0,
  welcomeSet: (userId, ver) => q.welcomeSet.run(ver, userId),
  gmSetRole: (userId, on) => q.gmSetRole.run(on ? 1 : 0, userId),
  gmLog: (gm, target, text) => { q.gmLogAdd.run(gm, target ?? null, text, Date.now()); q.gmLogPrune.run(); },
  gmLogList: (n = 40) => q.gmLogList.all(n),
  dragonIds: () => q.dragonIds.all().map((r) => r.id),
  activeSince: (t) => q.activeSince.all(t),        // 이 시각 뒤로 접속한 (잠들지 않은) 드래곤 [{ id, level }]
  // 식구 입양 제안
  offerAdd: (kinId, from, to) => Number(q.offerAdd.run(kinId, from, to, Date.now()).lastInsertRowid),
  offerGet: (id) => q.offerGet.get(id) || null,
  offerOfKin: (kinId) => q.offerOfKin.get(kinId) || null,
  offersTo: (id) => q.offersTo.all(id),
  offersFrom: (id) => q.offersFrom.all(id),
  offerDel: (id) => q.offerDel.run(id).changes > 0,
  offersToCount: (id) => q.offersToN.get(id).n,
  slate: {
    list: (limit = 200) => q.slateList.all(limit),
    get: (id) => q.slateGet.get(id) || null,
    comments: (id) => q.slateCms.all(id),
    add: (d, head, title, body) => q.slateAdd.run(d.id, d.name, d.kind, head, title, body, Date.now()).lastInsertRowid,
    edit: (id, head, title, body) => q.slateEdit.run(head, title, body, Date.now(), id),
    del: (id) => q.slateDel.run(id).changes > 0,
    pin: (id, on) => q.slatePin.run(on ? 1 : 0, id),
    comment: (postId, d, text, parentId = null) => q.slateCmAdd.run(postId, d.id, d.name, d.kind, text, Date.now(), parentId).lastInsertRowid,
    commentGet: (id) => q.slateCmGet.get(id) || null,
    uncomment: (id) => q.slateCmDel.run(id, id).changes > 0,
    recomment: (id, text) => q.slateCmEdit.run(text, Date.now(), id),
    latest: () => q.slateLatest.get().at || 0,
    replyAt: (dragonId) => q.slateReplyAt.get(dragonId, dragonId, dragonId).at || 0,
    imgAdd: (dragonId, type, buf, w, h) => Number(q.slateImgAdd.run(dragonId, type, buf, w || null, h || null, Date.now()).lastInsertRowid),
    imgGet: (id) => q.slateImgGet.get(id) || null,
    imgMeta: (id) => q.slateImgMeta.get(id) || null,
    imgsOf: (postId) => q.slateImgsOf.all(postId),
    imgSet: (id, postId, ord) => q.slateImgSet.run(postId, ord, id),
    imgDel: (id) => q.slateImgDel.run(id),
    imgPending: (dragonId) => q.slateImgPend.get(dragonId).n,
    imgPrune: (before) => q.slateImgOld.run(before).changes, // 글에 붙지 않고 남은 그림 정리
    countSince: (dragonId, since) => q.slateDayN.get(dragonId, since).n,
  },
  worldGet: (k, def = null) => { const r = q.worldGet.get(k); if (!r) return def; try { return JSON.parse(r.v); } catch { return def; } },
  worldSet: (k, v) => q.worldSet.run(k, JSON.stringify(v)),
  berserkIds: () => q.berserkIds.all().map((r) => r.id),
  graveIds: () => q.graveIds.all().map((r) => r.id),
  waitIds: () => q.waitIds.all().map((r) => r.id),       // 쓰러져 도움을 기다리는 (또는 기다렸던) 드래곤
  // 계정 탈퇴: 계정과 그 드래곤, 드래곤에 딸린 모든 것(식구·소지품·관계·텔레파시…)이 함께 지워짐
  deleteUser: (userId) => q.delUser.run(userId),
  // 드래곤만 지움 (계정은 남음). 식구·소지품·관계·텔레파시 등 딸린 것도 함께 지워짐
  deleteDragon: (id) => db.prepare('DELETE FROM dragons WHERE id = ?').run(id),
  gmCount: () => q.gmCount.get().n,
  userCount: () => q.userCount.get().n,
  setBio: (dragonId, bio) => q.setBio.run(JSON.stringify(bio), dragonId),
  // 긴 잠: 소지품과 금화를 둥지(보물더미)로 옮기고, 계정에서 떼어 냄 (계정은 새 드래곤을 만들 수 있게)
  bury: db.transaction((d) => {
    for (const { item, qty } of q.invList.all(d.id)) q.hoardAdd.run(d.id, item, qty);
    q.invClear.run(d.id);
    const graveId = Number(q.graveUser.run(`#묘비#${d.id}`, '!', Date.now()).lastInsertRowid);
    q.setOwner.run(graveId, Date.now(), d.id);
  }),
  // 먼 여행: 계정에서 떼어 냄 (소지품·보물더미는 그대로 함께 떠남). 계정은 새 드래곤을 만들 수 있게
  depart: db.transaction((d) => {
    const id = Number(q.graveUser.run(`#여행#${d.id}`, '!', Date.now()).lastInsertRowid);
    q.setOwner.run(id, Date.now(), d.id);
  }),
  legacyGet: (userId) => { const r = q.legacyGet.get(userId); try { return r?.legacy ? JSON.parse(r.legacy) : null; } catch { return null; } },
  legacySet: (userId, v) => q.legacySet.run(v ? JSON.stringify(v) : null, userId),
  setHeir: (dragonId, v) => q.setHeir.run(JSON.stringify(v), dragonId),
  hoardTake: (dragonId, item, qty) => q.hoardSet.run(qty, dragonId, item, qty).changes > 0,
  hoardClear: (dragonId) => { q.hoardClear.run(dragonId); q.hoardGoldSet.run(0, dragonId); },
  kinMove: (kinId, from, to) => q.kinMove.run(to, kinId, from).changes > 0,
  arenaList: (me) => q.arenaList.all(me),
  kinDelete: (kinId, dragonId) => q.kinDel.run(kinId, dragonId),
  inventory: (dragonId) => q.invList.all(dragonId),
  itemCount: (dragonId, item) => q.invCount.get(dragonId, item)?.qty || 0,
  hoard: (dragonId) => q.hoardList.all(dragonId),
  hoardCount: (dragonId, item) => q.hoardCount.get(dragonId, item)?.qty || 0,
  setRegion: (dragonId, region) => q.setRegion.run(region, dragonId),
  touch: (dragonId) => q.touch.run(Date.now(), dragonId),
  addChat: (region, m) => {
    const id = Number(q.addChat.run(region, m.dragonId, m.name, m.kind, m.text, m.at).lastInsertRowid);
    q.pruneChat.run(region, region); // 지역별 최근 200개만 보관
    return id;
  },
  recentChat: (region, limit) => q.recentChat.all(region, limit).reverse(),
  olderChat: (region, before, limit) => q.olderChat.all(region, before, limit).reverse(), // before(id)보다 앞의 말
  chatGet: (id) => q.chatGet.get(id),
  chatDel: (id) => q.chatDel.run(id),
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
