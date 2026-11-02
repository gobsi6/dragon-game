// 석판: 모두가 글을 새겨 남기는 게시판 (말머리 · 짧은 답 · GM 고정)
const { isTestDragon } = require('./game-data');

const HEADS = ['story', 'tip', 'party', 'free'];      // 말머리 (지금 화면에서는 고르지 않아 늘 free로 새김)
const RULES = {
  title: 40, body: 1000, comment: 100,                // 글자 수
  imgs: 3, imgMax: 720 * 1024, imgGap: 1500,          // 글 하나에 그림 몇 장, 한 장 최대 크기(바이트), 올리는 간격
  imgDay: 20,                                         // 한 드래곤이 하루(24시간)에 올릴 수 있는 석판 그림 (글·답 합쳐서)
  postGap: 30 * 1000, perDay: 20,                     // 글 간격, 하루에 새길 수 있는 글 수
  commentGap: 3 * 1000,
  list: 200,                                          // 목록에 보여 줄 글 수
  poll: { min: 2, max: 30, opt: 40, reason: 200, days: [1, 3, 7], multi: 3 }, // 투표: 선택지 수, 선택지 글자 수, 고른 까닭 글자 수, 마감 기한(일), 여러 개 고르기를 켰을 때 고를 수 있는 수
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

  // ── 투표 ──
  // 마감: 글쓴이·GM이 닫거나 기한이 지나면. 읽을 때 기한을 보고 닫음
  function pollOf(postId) {
    const pl = db.slate.poll(postId);
    if (pl && !pl.closed_at && pl.closes_at && Date.now() >= pl.closes_at) { db.slate.pollClose(postId, pl.closes_at); pl.closed_at = pl.closes_at; }
    return pl;
  }
  // 보는 드래곤에 맞춘 모습. 결과는 공개 투표면 내가 투표했거나 마감됐을 때, 비밀 투표면 GM이 공개한 뒤에만 (GM은 늘)
  // 글마다 정해진 뒤섞인 순서 (이름 없는 까닭용)
  const hashOf = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function pollView(r, d, gm) {
    const pl = pollOf(r.id);
    if (!pl) return null;
    const my = db.slate.myVote(r.id, d.id);
    const closed = !!pl.closed_at;
    const show = gm || (pl.kind === 'secret' ? !!pl.revealed_at : my != null || closed);
    const v = { kind: pl.kind, options: pl.options, pick: pl.pick || 1, closesAt: pl.closes_at || null, closed, revealed: !!pl.revealed_at, my, show,
      canClose: !closed && (r.dragon_id === d.id || gm), canReveal: gm && pl.kind === 'secret' && !pl.revealed_at };
    if (show) {
      const counts = pl.options.map(() => 0);
      for (const c of db.slate.counts(r.id)) if (counts[c.opt] != null) counts[c.opt] = c.n;
      v.counts = counts;
      v.total = db.slate.people(r.id); // 투표한 드래곤 수 (여러 개 고르면 표 수 합과 다름)
      // 공개 투표: 선택지마다 고른 드래곤 이름
      if (pl.kind === 'public') { v.voters = pl.options.map(() => []); for (const x of db.slate.voters(r.id)) v.voters[x.opt]?.push(x.name || '(떠난 드래곤)'); }
    }
    // 내가 적은 까닭 (고른 것을 바꿀 때 다시 채워 넣으려고. 나에게만)
    if (my) v.myReasons = db.slate.myReasons(r.id, d.id);
    // 고른 까닭: 결과가 보일 때 선택지마다 그 밑에. 공개 투표는 이름과 함께, 비밀 투표는 GM에게만 이름이 보이고 다른 드래곤에게는 이름 없이
    if (show) {
      const anon = pl.kind === 'secret' && !gm;
      v.memos = pl.options.map(() => []);
      for (const x of db.slate.reasons(r.id)) {
        const o = x.opt;
        if (!v.memos[o]) continue;
        v.memos[o].push(anon ? { text: x.text, mine: x.dragon_id === d.id, k: hashOf(`${r.id}:${x.dragon_id}:${o}`) } : { name: x.name || '(떠난 드래곤)', text: x.text, mine: x.dragon_id === d.id });
      }
      // 이름 없는 까닭은 적은 순서로도 누구인지 짐작하지 못하게 글마다 정해진 뒤섞인 순서로
      if (anon) for (const l of v.memos) { l.sort((a, b) => a.k - b.k); for (const m of l) delete m.k; }
    }
    return v;
  }

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

    // 목록의 투표 글: 내가 골랐는지, 마감·공개 여부, 참여 수(공개 투표와 GM에게만)
    const pollSt = (r, d) => {
      const pl = pollOf(r.id);
      if (!pl) return null;
      const n = pl.kind === 'public' || isGm() ? new Set(db.slate.voters(r.id).map((v) => v.dragon_id)).size : null;
      return { closed: !!pl.closed_at, revealed: !!pl.revealed_at, voted: db.slate.myVote(r.id, d.id) != null, n };
    };
    on('slate:list', (d) => { const pk = db.slate.pollKinds(); return {
      ok: true, rules: RULES, gm: isGm(),
      posts: db.slate.list(RULES.list).map((r) => ({ id: r.id, poll: pk.get(r.id) || null, pollSt: pk.has(r.id) ? pollSt(r, d) : null, head: r.head, title: r.title, preview: r.preview, at: r.at, edited: !!r.edited_at, pinned: !!r.pinned, n: r.n, last: Math.max(r.at, r.last_c || 0),
        lastC: r.last_c || 0, lastBy: r.last_by || null, mine: r.dragon_id === d.id, who: who(r) })),
    }; });
    // 접속할 때 한 번: 가장 새 글, 내 글에 달린 가장 새 답의 때 (아이콘 점)
    on('slate:peek', (d) => ({ ok: true, latest: latest(), replyAt: db.slate.replyAt(d.id) }));
    on('slate:get', (d, p) => {
      const r = db.slate.get(Number(p.id));
      if (!r) return { error: '이미 지워진 글이다.' };
      return {
        ok: true, gm: isGm(),
        post: { id: r.id, head: r.head, title: r.title, body: r.body, at: r.at, edited: r.edited_at || 0, pinned: !!r.pinned, who: who(r, 'cur_name', 'cur_kind'), mine: r.dragon_id === d.id, imgs: db.slate.imgsOf(r.id), poll: pollView(r, d, isGm()) },
        comments: (() => { const ci = new Map(db.slate.cmImgs(r.id).map((x) => [x.comment_id, { id: x.id, w: x.w, h: x.h, at: x.at }]));
          return db.slate.comments(r.id).map((c) => ({ id: c.id, text: c.text, at: c.at, edited: !!c.edited_at, who: who(c), mine: c.dragon_id === d.id, parent: c.parent_id || null, img: ci.get(c.id) || null })); })(),
      };
    });
    on('slate:post', (d, p) => {
      const head = HEADS.includes(p.head) ? p.head : 'free';
      const title = oneLine(p.title, RULES.title), body = clean(p.body, RULES.body);
      if (!title || !body) return { error: '제목과 내용을 모두 적어야 새길 수 있다.' };
      const now = Date.now();
      if (now - (socket.data.slateAt || 0) < RULES.postGap) return { error: '발톱이 아직 뜨겁다. 조금 뒤에 새기자.' };
      if (db.slate.countSince(d.id, now - DAY) >= RULES.perDay) return { error: `하루에 ${RULES.perDay}개까지 새길 수 있다.` };
      // 투표 붙이기 (선택)
      let poll = null;
      if (p.poll) {
        const P = RULES.poll;
        const options = (Array.isArray(p.poll.options) ? p.poll.options : []).map((x) => oneLine(x, P.opt)).filter(Boolean).slice(0, P.max);
        if (options.length < P.min) return { error: `투표 선택지를 ${P.min}개 이상 적자.` };
        if (new Set(options).size !== options.length) return { error: '같은 선택지가 두 번 있다.' };
        if (p.poll.kind === 'secret' && !isGm()) return { error: '비밀 투표는 GM만 열 수 있다.' }; // 비밀 투표: GM 전용 (결과 공개도 GM)
        const days = P.days.includes(Number(p.poll.days)) ? Number(p.poll.days) : 0; // 0: 닫을 때까지
        poll = { kind: p.poll.kind === 'secret' ? 'secret' : 'public', options, closesAt: days ? now + days * DAY : null, pick: p.poll.multi ? P.multi : 1 }; // 여러 개 고르기: 글쓴이가 켰을 때만
      }
      socket.data.slateAt = now;
      const id = db.slate.add(d, head, title, body);
      if (poll) db.slate.pollAdd(id, poll.kind, poll.options, poll.closesAt, poll.pick);
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
    on('slate:pin', (d, p) => {
      if (!isGm()) return { error: 'GM만 고정할 수 있다.' };
      const r = db.slate.get(Number(p.id));
      if (!r) return { error: '이미 지워진 글이다.' };
      db.slate.pin(r.id, !!p.pin);
      changed({ id: r.id });
      return { ok: true };
    });
    // 투표하기 (마감 전까지 바꿀 수 있음). 비밀 투표는 사유를 적어 GM에게 보낼 수 있음 (누가 썼는지 함께, GM만 봄)
    on('slate:vote', (d, p) => {
      const r = db.slate.get(Number(p.id));
      if (!r) return { error: '이미 지워진 글이다.' };
      const pl = pollOf(r.id);
      if (!pl) return { error: '투표가 없는 글이다.' };
      if (pl.closed_at) return { error: '이미 마감된 투표다.' };
      // 고른 선택지들 (opts 배열, 예전 화면은 opt 하나)
      const raw = Array.isArray(p.opts) ? p.opts : [p.opt];
      const opts = [...new Set(raw.map(Number))].sort((a, b) => a - b);
      if (!opts.length || opts.some((o) => !Number.isInteger(o) || o < 0 || o >= pl.options.length)) return { error: '고를 수 없는 선택지다.' };
      const now = Date.now();
      if (now - (socket.data.slateVoteAt || 0) < 1500) return { error: '조금 천천히 고르자.' }; // 표를 연달아 바꾸며 모두의 화면을 흔들지 않게
      socket.data.slateVoteAt = now;
      if (opts.length > (pl.pick || 1)) return { error: pl.pick > 1 ? `${pl.pick}개까지 고를 수 있다.` : '하나만 고를 수 있다.' };
      db.slate.vote(r.id, d.id, opts);
      // 고른 선택지마다 까닭 (reasons: { 선택지 번호: 글 }). 공개·비밀 투표 모두. 예전 화면의 reason 하나는 첫 선택지에
      {
        const src = p.reasons && typeof p.reasons === 'object' ? p.reasons : p.reason ? { [opts[0]]: p.reason } : {};
        const map = {};
        for (const o of opts) { const t = clean(src[o] ?? src[String(o)], RULES.poll.reason); if (t) map[o] = t; }
        db.slate.reasonSet(r.id, d, map);
      }
      changed({ id: r.id, vote: true, by: d.id });
      return { ok: true, poll: pollView(r, d, isGm()) };
    }, true);
    on('slate:poll:close', (d, p) => {
      const r = db.slate.get(Number(p.id));
      if (!r) return { error: '이미 지워진 글이다.' };
      const pl = pollOf(r.id);
      if (!pl) return { error: '투표가 없는 글이다.' };
      if (!mine(r, d)) return { error: '글쓴이나 GM만 마감할 수 있다.' };
      db.slate.pollClose(r.id);
      changed({ id: r.id, vote: true, state: true }); // 마감·공개: 고르던 중이어도 모두 새로 그림
      return { ok: true, poll: pollView(r, d, isGm()) };
    });
    on('slate:poll:reveal', (d, p) => {
      if (!isGm()) return { error: 'GM만 결과를 공개할 수 있다.' };
      const r = db.slate.get(Number(p.id));
      const pl = r && pollOf(r.id);
      if (!pl || pl.kind !== 'secret') return { error: '공개할 비밀 투표가 없다.' };
      db.slate.pollReveal(r.id);
      changed({ id: r.id, vote: true, state: true }); // 마감·공개: 고르던 중이어도 모두 새로 그림
      return { ok: true, poll: pollView(r, d, true) };
    });
    on('slate:comment', (d, p) => {
      const r = db.slate.get(Number(p.id));
      if (!r) return { error: '이미 지워진 글이다.' };
      const text = oneLine(p.text, RULES.comment);
      // 답에 붙일 그림 한 장: 내가 올려 두고 아직 아무 데도 붙이지 않은 것만
      const imgId = Number(p.img) || 0, im = imgId ? db.slate.imgMeta(imgId) : null;
      if (imgId && (!im || im.dragon_id !== d.id || im.post_id != null)) return { error: '붙일 그림을 찾지 못했다. 다시 넣어 보자.' };
      if (!text && !im) return { error: '남길 말을 적자.' };
      const now = Date.now();
      if (now - (socket.data.slateCmAt || 0) < RULES.commentGap) return { error: '숨을 고르는 중이다.' };
      // 대댓글: parent가 있으면 그 답 밑에 (답글에 다시 답하면 맨 위 답 밑으로 모아 한 단계만)
      let parent = null;
      if (p.parent) {
        parent = db.slate.commentGet(Number(p.parent));
        if (!parent || parent.post_id !== r.id) return { error: '답할 답이 지워졌다.' };
        if (parent.parent_id) parent = db.slate.commentGet(parent.parent_id) || parent;
      }
      socket.data.slateCmAt = now;
      const cid = db.slate.comment(r.id, d, text, parent ? parent.id : null);
      if (im) db.slate.cmImgSet(im.id, r.id, cid);
      // 글쓴이에게: 누가 내 글에 답을 남겼는지 · 답의 주인에게: 내 답에 답글이 달렸는지 (모두에게 가는 알림에 실어 보내고, 화면이 그 드래곤일 때만 알림)
      const replyTo = p.parent ? db.slate.commentGet(Number(p.parent)) : null;
      changed({ id: r.id, comment: true, by: d.id, owner: r.dragon_id || null, byName: d.name, title: r.title, replyTo: replyTo?.dragon_id || null });
      return { ok: true };
    }, true);
    on('slate:recomment', (d, p) => {
      const c = db.slate.commentGet(Number(p.id));
      if (!c) return { error: '이미 지워진 답이다.' };
      if (c.dragon_id !== d.id) return { error: '내가 남긴 답만 고칠 수 있다.' };
      const text = oneLine(p.text, RULES.comment);
      if (!text && !db.slate.cmImgs(c.post_id).some((x) => x.comment_id === c.id)) return { error: '남길 말을 적자.' }; // 그림이 붙은 답은 글을 비워도 됨
      db.slate.recomment(c.id, text);
      changed({ id: c.post_id, comment: true, by: d.id });
      return { ok: true };
    }, true);
    on('slate:uncomment', (d, p) => {
      const c = db.slate.commentGet(Number(p.id));
      if (!c) return { error: '이미 지워진 답이다.' };
      if (!mine(c, d)) return { error: '내가 남긴 답만 지울 수 있다.' };
      db.slate.cmImgDel(c.id); // 답과 그 밑 답글에 붙은 그림도 함께
      db.slate.uncomment(c.id);
      changed({ id: c.post_id, comment: true });
      return { ok: true };
    }, true);
  }
  // 그림 올리기 (글을 새기기 전에 한 장씩, HTTP로 받음: server.js의 /api/slate-img). 돌려줌: 그림 번호 → 새길 때 imgs로 보냄
  // 소켓으로 받지 않는 까닭: 소켓 한 번에 받는 크기를 키우면 모든 요청에 똑같이 커지므로
  const imgAt = new Map(); // 드래곤마다 마지막으로 올린 때
  function uploadImg(d, type, buf, w, h) {
    if (!d) return { error: '먼저 드래곤을 만들어야 한다.' };
    if (isTestDragon(d)) return { error: '시험용 드래곤은 석판에 새길 수 없다.' };
    if (!['image/webp', 'image/jpeg', 'image/png'].includes(type) || !Buffer.isBuffer(buf) || !buf.length) return { error: '그림 파일을 읽지 못했다. 다른 그림으로 해 보자.' };
    if (buf.length > RULES.imgMax) return { error: '그림이 너무 크다.' };
    const now = Date.now();
    if (now - (imgAt.get(d.id) || 0) < RULES.imgGap) return { error: '조금 천천히 올리자.' };
    if (db.slate.imgPending(d.id) >= RULES.imgs * 3) return { error: '올려 두고 쓰지 않은 그림이 많다. 먼저 글을 새기자.' };
    if (db.slate.imgSince(d.id, now - DAY) >= RULES.imgDay) return { error: `석판에는 하루에 그림을 ${RULES.imgDay}장까지 올릴 수 있다.` };
    imgAt.set(d.id, now);
    const clamp = (v) => Math.max(0, Math.min(4096, Math.floor(Number(v) || 0)));
    return { ok: true, id: db.slate.imgAdd(d.id, type, buf, clamp(w), clamp(h)) };
  }
  return { attach, uploadImg, RULES };
};
