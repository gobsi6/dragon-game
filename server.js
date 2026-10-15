// 용의 대륙 — 1단계 서버
// 계정, 드래곤 생성, 지역 이동, 지역 채팅
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');

const db = require('./db');
const { KINDS, REGIONS } = require('./game-data');

const PORT = process.env.PORT || 3000;
const MOVE_COOLDOWN = 1500; // ms, 연속 이동 방지
const CHAT_COOLDOWN = 700;  // ms, 도배 방지
const CHAT_MAX = 200;       // 글자 수
const HISTORY = 30;         // 지역에 들어갈 때 보여줄 지난 대화 수

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server);

// ── 도우미 ─────────────────────────────────────────

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// 받침 유무에 따라 조사 고르기: josa('라엘', '이', '가') → '이'
function josa(word, withBatchim, without) {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return `${withBatchim}(${without})`;
  return (c - 0xac00) % 28 ? withBatchim : without;
}

// ── 계정 (REST) ────────────────────────────────────

app.post('/api/register', (req, res) => {
  const username = str(req.body?.username);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!/^[가-힣A-Za-z0-9_]{2,16}$/.test(username)) {
    return res.status(400).json({ error: '아이디는 한글, 영문, 숫자, _로 2~16자까지 쓸 수 있어요.' });
  }
  if (password.length < 4 || password.length > 64) {
    return res.status(400).json({ error: '비밀번호는 4~64자로 정해 주세요.' });
  }
  if (db.getUserByName(username)) {
    return res.status(409).json({ error: '이미 있는 아이디예요. 다른 아이디를 골라 주세요.' });
  }
  const isGm = db.countUsers() === 0; // 처음 만든 계정이 GM
  const userId = db.createUser(username, bcrypt.hashSync(password, 10), isGm);
  const token = crypto.randomBytes(24).toString('hex');
  db.createSession(token, userId);
  res.json({ token });
});

app.post('/api/login', (req, res) => {
  const username = str(req.body?.username);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = db.getUserByName(username);
  if (!user || !bcrypt.compareSync(password, user.pw_hash)) {
    return res.status(401).json({ error: '아이디나 비밀번호가 맞지 않아요.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  db.createSession(token, user.id);
  res.json({ token });
});

app.post('/api/logout', (req, res) => {
  const token = str(req.body?.token);
  if (token) db.deleteSession(token);
  res.json({ ok: true });
});

// ── 접속 중인 드래곤 ────────────────────────────────

// dragonId → { socket, dragon: { id, name, kind, region } }
const online = new Map();

const publicDragon = (d) => ({ id: d.id, name: d.name, kind: d.kind });

function occupants(region) {
  const list = [];
  for (const { dragon } of online.values()) {
    if (dragon.region === region) list.push(publicDragon(dragon));
  }
  return list;
}

function broadcastPresence(region) {
  io.to(region).emit('presence', { region, occupants: occupants(region) });
}

function broadcastCounts() {
  const counts = {};
  for (const { dragon } of online.values()) {
    counts[dragon.region] = (counts[dragon.region] || 0) + 1;
  }
  io.emit('world:counts', counts);
}

// 지역 안내 문구. except를 넘기면 그 소켓에게는 보내지 않음
function system(region, text, except) {
  (except ? except.to(region) : io.to(region)).emit('system', { text, at: Date.now() });
}

function sendRegionState(socket, dragon) {
  socket.emit('region:state', {
    region: dragon.region,
    occupants: occupants(dragon.region),
    history: db.recentChat(dragon.region, HISTORY),
  });
}

function enterWorld(socket, dragon) {
  const prev = online.get(dragon.id);
  if (prev && prev.socket.id !== socket.id) {
    // 같은 드래곤으로 다른 창에서 접속하면 이전 창을 끊음
    prev.socket.data.kicked = true;
    prev.socket.emit('kicked');
    prev.socket.disconnect(true);
  }
  socket.data.dragonId = dragon.id;
  online.set(dragon.id, { socket, dragon });
  socket.join(dragon.region);
  db.touch(dragon.id);

  if (!prev) {
    system(dragon.region, `${dragon.name}${josa(dragon.name, '이', '가')} 이곳에 모습을 드러냈다.`, socket);
  }
  sendRegionState(socket, dragon);
  broadcastPresence(dragon.region);
  broadcastCounts();
}

function entryOf(socket) {
  const entry = online.get(socket.data.dragonId);
  return entry && entry.socket === socket ? entry : null;
}

// ── 실시간 (Socket.IO) ─────────────────────────────

io.use((socket, next) => {
  const user = db.getSessionUser(str(socket.handshake.auth?.token));
  if (!user) return next(new Error('auth'));
  socket.data.user = user;
  next();
});

io.on('connection', (socket) => {
  const user = socket.data.user;
  const dragon = db.getDragonByUser(user.id);

  socket.emit('init', {
    me: { username: user.username, isGm: !!user.is_gm },
    dragon: dragon ? publicDragon(dragon) : null,
    kinds: KINDS,
    regions: REGIONS,
  });
  if (dragon) enterWorld(socket, dragon);

  socket.on('dragon:create', (payload, ack) => {
    if (typeof ack !== 'function') return;
    if (db.getDragonByUser(user.id)) return ack({ error: '이미 드래곤이 있어요.' });

    const name = str(payload?.name);
    const kind = str(payload?.kind);
    if (!/^[가-힣A-Za-z0-9]{2,12}$/.test(name)) {
      return ack({ error: '이름은 한글, 영문, 숫자로 2~12자까지 쓸 수 있어요.' });
    }
    if (!KINDS[kind]) return ack({ error: '드래곤 종류를 골라 주세요.' });
    if (db.dragonNameTaken(name)) return ack({ error: '이미 대륙에 같은 이름의 드래곤이 있어요.' });

    const region = KINDS[kind].home;
    const id = db.createDragon(user.id, name, kind, region);
    const created = { id, name, kind, region };
    ack({ ok: true, dragon: publicDragon(created) });
    enterWorld(socket, created);
  });

  socket.on('move', (payload, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const entry = entryOf(socket);
    if (!entry) return ack({ error: '먼저 드래곤을 만들어 주세요.' });

    const d = entry.dragon;
    const from = d.region;
    const to = str(payload?.to);
    if (!REGIONS[to]) return ack({ error: '없는 지역이에요.' });
    if (!REGIONS[from].links.includes(to)) return ack({ error: '그곳은 여기서 바로 날아갈 수 없어요.' });

    const now = Date.now();
    if (now - (socket.data.lastMove || 0) < MOVE_COOLDOWN) {
      return ack({ error: '날개를 잠깐 쉬고 다시 날아 주세요.' });
    }
    socket.data.lastMove = now;

    const ga = josa(d.name, '이', '가');
    socket.leave(from);
    d.region = to;
    db.setRegion(d.id, to);
    system(from, `${d.name}${ga} ${REGIONS[to].name} 쪽으로 날아갔다.`);
    socket.join(to);
    system(to, `${d.name}${ga} ${REGIONS[from].name} 쪽에서 날아왔다.`, socket);

    broadcastPresence(from);
    broadcastPresence(to);
    broadcastCounts();
    sendRegionState(socket, d);
    ack({ ok: true });
  });

  socket.on('chat', (payload) => {
    const entry = entryOf(socket);
    if (!entry) return;
    const text = str(payload?.text).slice(0, CHAT_MAX);
    if (!text) return;

    const now = Date.now();
    if (now - (socket.data.lastChat || 0) < CHAT_COOLDOWN) return;
    socket.data.lastChat = now;

    const d = entry.dragon;
    const msg = { dragonId: d.id, name: d.name, kind: d.kind, text, at: now };
    db.addChat(d.region, msg);
    io.to(d.region).emit('chat', msg);
  });

  socket.on('disconnect', () => {
    const entry = entryOf(socket);
    if (!entry) return;
    online.delete(entry.dragon.id);
    db.touch(entry.dragon.id);
    if (socket.data.kicked) return; // 다른 창으로 옮겨간 경우는 조용히
    const d = entry.dragon;
    system(d.region, `${d.name}${josa(d.name, '이', '가')} 구름 속으로 사라졌다.`);
    broadcastPresence(d.region);
    broadcastCounts();
  });
});

server.listen(PORT, () => {
  console.log(`용의 대륙 서버가 http://localhost:${PORT} 에서 열렸어요.`);
});
