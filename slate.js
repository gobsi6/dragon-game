// 석판: 모두가 글을 새겨 남기는 게시판 (말머리 · 짧은 답 · GM 고정)
const { isTestDragon } = require('./game-data');

const HEADS = ['story', 'tip', 'party', 'free'];      // 말머리 (지금 화면에서는 고르지 않아 늘 free로 새김)
const RULES = {
  title: 40, body: 1000, comment: 100,                // 글자 수
  imgs: 3, imgMax: 600000, imgGap: 1500,              // 글 하나에 그림 몇 장, 한 장 최대 크기(base64 글자 수, 약 450KB), 올리는 간격
  postGap: 30 * 1000, perDay: 20,                     // 글 간격, 하루에 새길 수 있는 글 수
  commentGap: 3 * 1000,
  list: 200,                                          // 목록에 보여 줄 글 수
};
const DAY = 86400000;
const clean = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, max) : '');
const oneLine = (v, max) => clean(v, max).replace(/\s*\n\s*/g, ' ');

module.exports = function setupSlate({ io, db, entryOf }) {
  const who = (r, nameKey = 'name', kindKey = 'kind') => ({ id: r.dragon_id || null, name: r[nameKey], kind: r[kindKey], av: r.has_avatar ? r.avatar_ver : 0 });
  const latest = () => db.slate.latest();
  const changed = (extra) => io.emit('slate:changed', { latest: latest(), ...extra });

  // 그림 붙이기: 내가 올린 그림 중 글에 아직 안 붙었거나 이 글에 붙은 것만. 빠진 그림은 지움
  function setImgs(d, postId, ids) {
    const want = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Boolean))].slice(0, RULES.imgs);
    const ok = want.filter((id) => { const m = db.slate.imgMeta(id); return m && m.dragon_id === d.id && (m.post_id == null || m.post_id === postId); });
    for (const old of db.slate.imgsOf(postId)) if (!ok.includes(old.id)) db.slate.imgDel(old.id);
    ok.forEach((id, i) => db.slate.imgSet(id, postId, i));
  }
  db.slate.imgPrune(Date.now() - 86400000); // 서버가 켜질 때: 하루 넘게 글에 안 붙은 그림 정리

  function attach(socket) {
    socket.emit('slate:latest', { at: latest() });
    const me = () => entryOf(socket)?.dragon || null;
    const isGm = () => !!socket.data.user?.is_gm;
    const on = (event, fn, write) => socket.on(event, (p, ack) => {
      if (typeof ack !== 'function') ack = () => {};
      const d = me();
      if (!d) return ack({ error: '먼저 드래곤을 만들어야 한다.' });
      if (write && isTestDragon(d)) return ack({ error: '시험용 드래곤은 석판에 새길 수 없다.' });
      try { ack(fn(d, p || {})); } catch (err) { console.error(err); ack({ error: '잠시 뒤에 다시 해 보자.' }); }
    });
    const mine = (row, d) => row && (row.dragon_id === d.id || isGm());

    on('slate:list', () => ({
      ok: true, rules: RULES, gm: isGm(),
      posts: db.slate.list(RULES.list).map((r) => ({ id: r.id, head: r.head, title: r.title, preview: r.preview, at: r.at, edited: !!r.edited_at, pinned: !!r.pinned, n: r.n, last: Math.max(r.at, r.last_c || 0), who: who(r) })),
    }));
    on('slate:get', (d, p) => {
      const r = db.slate.get(Number(p.id));
      if (!r) return { error: '이미 지워진 글이다.' };
      return {
        ok: true, gm: isGm(),
        post: { id: r.id, head: r.head, title: r.title, body: r.body, at: r.at, edited: r.edited_at || 0, pinned: !!r.pinned, who: who(r, 'cur_name', 'cur_kind'), mine: r.dragon_id === d.id, imgs: db.slate.imgsOf(r.id) },
        comments: db.slate.comments(r.id).map((c) => ({ id: c.id, text: c.text, at: c.at, edited: !!c.edited_at, who: who(c), mine: c.dragon_id === d.id })),
      };
    });
    on('slate:post', (d, p) => {
      const head = HEADS.includes(p.head) ? p.head : 'free';
      const title = oneLine(p.title, RULES.title), body = clean(p.body, RULES.body);
      if (!title || !body) return { error: '제목과 내용을 모두 적어야 새길 수 있다.' };
      const now = Date.now();
      if (now - (socket.data.slateAt || 0) < RULES.postGap) return { error: '발톱이 아직 뜨겁다. 조금 뒤에 새기자.' };
      if (db.slate.countSince(d.id, now - DAY) >= RULES.perDay) return { error: `하루에 ${RULES.perDay}개까지 새길 수 있다.` };
      socket.data.slateAt = now;
      const id = db.slate.add(d, head, title, body);
      setImgs(d, id, p.imgs);
      changed({ by: d.id, id });
      return { ok: true, id };
    }, true);
    on('slate:edit', (d, p) => {
      const r = db.slate.get(Number(p.id));
      if (!r) return { error: '이미 지워진 글이다.' };
      if (r.dragon_id !== d.id) return { error: '내가 새긴 글만 고칠 수 있다.' };
      const head = HEADS.includes(p.head) ? p.head : r.head;
      const title = oneLine(p.title, RULES.title), body = clean(p.body, RULES.body);
      if (!title || !body) return { error: '제목과 내용을 모두 적어야 한다.' };
      db.slate.edit(r.id, head, title, body);
      setImgs(d, r.id, p.imgs);
      changed({ id: r.id });
      return { ok: true };
    }, true);
    on('slate:delete', (d, p) => {
      const r = db.slate.get(Number(p.id));
      if (!r) return { error: '이미 지워진 글이다.' };
      if (!mine(r, d)) return { error: '내가 새긴 글만 지울 수 있다.' };
      db.slate.del(r.id);
      if (r.dragon_id !== d.id) db.gmLog?.(socket.data.user.username, r.cur_name, `석판 글 지우기: ${r.title}`);
      changed({ id: r.id, gone: true });
      return { ok: true };
    }, true);
    // 그림 올리기 (글을 새기기 전에 한 장씩). 돌려줌: 그림 번호 → 새길 때 imgs로 보냄
    on('slate:img', (d, p) => {
      const m = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(typeof p.dataUrl === 'string' ? p.dataUrl : '');
      if (!m) return { error: '그림 파일을 읽지 못했다. 다른 그림으로 해 보자.' };
      if (m[2].length > RULES.imgMax) return { error: '그림이 너무 크다.' };
      const now = Date.now();
      if (now - (socket.data.slateImgAt || 0) < RULES.imgGap) return { error: '조금 천천히 올리자.' };
      if (db.slate.imgPending(d.id) >= RULES.imgs * 3) return { error: '올려 두고 쓰지 않은 그림이 많다. 먼저 글을 새기자.' };
      socket.data.slateImgAt = now;
      const w = Math.max(0, Math.min(4096, Math.floor(Number(p.w) || 0))), h = Math.max(0, Math.min(4096, Math.floor(Number(p.h) || 0)));
      const id = db.slate.imgAdd(d.id, `image/${m[1]}`, Buffer.from(m[2], 'base64'), w, h);
      return { ok: true, id };
    }, true);
    on('slate:pin', (d, p) => {
      if (!isGm()) return { error: 'GM만 고정할 수 있다.' };
      const r = db.slate.get(Number(p.id));
      if (!r) return { error: '이미 지워진 글이다.' };
      db.slate.pin(r.id, !!p.pin);
      changed({ id: r.id });
      return { ok: true };
    });
    on('slate:comment', (d, p) => {
      const r = db.slate.get(Number(p.id));
      if (!r) return { error: '이미 지워진 글이다.' };
      const text = oneLine(p.text, RULES.comment);
      if (!text) return { error: '남길 말을 적자.' };
      const now = Date.now();
      if (now - (socket.data.slateCmAt || 0) < RULES.commentGap) return { error: '숨을 고르는 중이다.' };
      socket.data.slateCmAt = now;
      db.slate.comment(r.id, d, text);
      changed({ id: r.id, comment: true, by: d.id });
      return { ok: true };
    }, true);
    on('slate:recomment', (d, p) => {
      const c = db.slate.commentGet(Number(p.id));
      if (!c) return { error: '이미 지워진 답이다.' };
      if (c.dragon_id !== d.id) return { error: '내가 남긴 답만 고칠 수 있다.' };
      const text = oneLine(p.text, RULES.comment);
      if (!text) return { error: '남길 말을 적자.' };
      db.slate.recomment(c.id, text);
      changed({ id: c.post_id, comment: true, by: d.id });
      return { ok: true };
    }, true);
    on('slate:uncomment', (d, p) => {
      const c = db.slate.commentGet(Number(p.id));
      if (!c) return { error: '이미 지워진 답이다.' };
      if (!mine(c, d)) return { error: '내가 남긴 답만 지울 수 있다.' };
      db.slate.uncomment(c.id);
      changed({ id: c.post_id, comment: true });
      return { ok: true };
    }, true);
  }
  return { attach };
};
