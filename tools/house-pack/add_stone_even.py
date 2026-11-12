# 돌벽 테두리 고르게 (pack.json v29): add_stone_copy.py 다음에 실행
# 꺾이는 곳마다 따로 덩어리로 보고, 각 면에서 테두리 블록(약 TILE칸)을 고르게 나눔(모서리·문 옆 끝 길이까지 셈).
# 블록 몸통·이음매는 고유 칸 그림의 단면을 그대로 씀. 작업실·고유 칸 입구 위 마지막 블록은 반사광을 지우고, 앞 블록이 끝나는 줄을 진한 선 1줄로.
# 결과를 칸마다 [바꿀 점, 같은 색이 있는 원본 점] 쌍으로 stoneCopy에 담음 (게임은 원본 그림에서 그 점의 색을 가져와 칠함). 거처·작업실·고유 칸 모두.
import json, base64, io, sys
import numpy as np
from PIL import Image
PACK = sys.argv[1] if len(sys.argv) > 1 else 'public/house/pack.json'
TILE = 11
P = json.load(open(PACK, encoding='utf-8')); W, H = P['W'], P['H']
FRAMEMASK = P.get('frameMask') or json.load(open('tools/house-pack/src/frame_mask.json'))   # 칸마다 테두리 점 (게임에는 안 쓰여 pack.json에서 빼고 따로 둠)
im = lambda u: np.array(Image.open(io.BytesIO(base64.b64decode(u.split(',')[1]))).convert('RGBA'))
dec = lambda s: np.frombuffer(base64.b64decode(s), np.uint32)
OX, OY, OW, OH = P['rooms']['own']
B0, F0 = im(P['base']), im(P['front'])
# 1) 지금 쌍(거처·작업실에 고유 칸 테두리를 옮겨 붙인 것)을 돌 벽돌벽으로 적용한 합친 그림
B, F = B0.copy(), F0.copy()
for r in ('live', 'work'):
    for arr, key in ((B, 'b'), (F, 'f')):
        pr = dec(P['stoneCopy'][r][key]).reshape(-1, 2); flat = arr.reshape(-1, 4); flat[pr[:, 0]] = flat[pr[:, 1]]
def comp(b, f):
    o = Image.fromarray(b); o.alpha_composite(Image.fromarray(f)); return o
C0 = np.array(comp(B0, F0)); img = comp(B, F)
S0 = np.array(img)
RIMC = {tuple(int(v) for v in S0[y, x, :3]) for y in range(OY, OY + 5) for x in range(OX + 5, OX + OW - 5)}
def even(img, rooms=('live','work','own')):
    A=np.array(img).copy(); S=A.copy()   # S: 원본(고유 칸 무늬 출처)
    # 고유 칸에서 단면 뽑기: 몸통 줄(이음매 없는 곳)과 이음매 3줄(옆·가운데·옆)
    prof={
      'top':   (lambda i: S[OY:OY+5, i], 33, 28),          # 가로 띠: 열 단위
      'bottom':(lambda i: S[OY+OH-7:OY+OH, i], 33, 28),
      'left':  (lambda i: S[i, OX:OX+5], 130, 124),          # 세로 띠: 행 단위
      'right': (lambda i: S[i, OX+OW-5:OX+OW], 130, 124),
    }
    def run(kind, fixed, a, b, put, pre=5, post=5, flat_end=False):
        cur_get = getattr(put, 'get', None)
        # pre/post: 띠 양끝에서 그대로 둔 부분(모서리 5칸, 문 옆 끝 2칸)도 끝 블록의 일부로 보고, 전체 길이를 고르게 나눔
        get, body_i, joint_i = prof[kind]
        body, side_l, mid, side_r = get(body_i), get(joint_i-1), get(joint_i), get(joint_i+1)
        L = b - a + 1
        if L < 6: return
        T = pre + L + post
        n = max(1, round(T / TILE)); joints = [round(k * T / n) - pre for k in range(1, n)]
        joints = [j for j in joints if 2 <= j <= L - 3]
        # 입구 위쪽 마지막 블록: 꺾여 들어가는 면처럼 반사광(밝은 줄)을 몸통 색으로
        lastj = max(joints) if joints else None
        flat_from = (lastj + 1 if joints else 0) if flat_end else None
        HL = (248, 219, 192)
        def flat(col, shade=False):   # 반사광(밝은 줄)을 지움: 몸통 색으로, 이음매 바로 아래 줄(shade)은 그늘 색으로
            c = col.copy()
            for k in range(len(c)):
                if tuple(int(v) for v in c[k][:3]) == (248, 219, 192):
                    c[k][:3] = (163, 141, 121) if shade else (197, 175, 154)
            return c
        for t in range(L + (post if flat_end else 0)):
            if t >= L:   # 그대로 둔 문 옆 끝 2칸도 반사광만 지움
                if flat_end: put(a + t, flat(cur_get(a + t)))
                continue
            col = body
            for j in joints:
                if t == j - 1: col = side_l
                elif t == j: col = mid
                elif t == j + 1: col = side_r
            if flat_from is not None and t >= flat_from: col = flat(col)   # 그늘 줄 없이 몸통 색만
            if flat_end and lastj is not None and t == lastj:   # 마지막 블록 바로 위, 앞 타일이 끝나는 줄(1줄): 진한 선으로 (외곽선 색)
                col = col.copy(); col[1:-1, :3] = (102, 88, 74)
            put(a + t, col)
    for r in rooms:
        rx,ry,rw,rh=P['rooms'][r]
        def ph(rows):   # 가로 띠에 열 넣기
            def f(x, col): A[rows[0]:rows[1], x] = col
            return f
        def pv(cols):
            def f(y, col): A[y, cols[0]:cols[1]] = col
            f.get = lambda y: A[y, cols[0]:cols[1]].copy()
            return f
        # 문 자리: 바탕에서 띠 가운데 줄이 바닥(테두리 아님)인 구간을 찾음
        def gaps_h(y, x0, x1):
            seg=[]; s=None
            for x in range(x0, x1+1):
                ok = tuple(S[y,x,:3]) in RIMC
                if ok and s is None: s=x
                if not ok and s is not None: seg.append((s,x-1)); s=None
            if s is not None: seg.append((s,x1))
            return seg
        def gaps_v(x, y0, y1):
            seg=[]; s=None
            for y in range(y0, y1+1):
                ok = tuple(S[y,x,:3]) in RIMC
                if ok and s is None: s=y
                if not ok and s is not None: seg.append((s,y-1)); s=None
            if s is not None: seg.append((s,y1))
            return seg
        T=(ry, ry+5); Bm=(ry+rh-7, ry+rh); Lc=(rx, rx+5); Rc=(rx+rw-5, rx+rw)
        for s,e in gaps_h(ry+2, rx+5, rx+rw-6): run('top', None, s+2 if s>rx+5 else s, e-2 if e<rx+rw-6 else e, ph(T), 2 if s>rx+5 else 5, 2 if e<rx+rw-6 else 5)
        for s,e in gaps_h(ry+rh-5, rx+5, rx+rw-6): run('bottom', None, s+2 if s>rx+5 else s, e-2 if e<rx+rw-6 else e, ph(Bm), 2 if s>rx+5 else 5, 2 if e<rx+rw-6 else 5)
        for s,e in gaps_v(rx+2, ry+5, ry+rh-8): run('left', None, s+2 if s>ry+5 else s, e-2 if e<ry+rh-8 else e, pv(Lc), 2 if s>ry+5 else 5, 2 if e<ry+rh-8 else 7, e<ry+rh-8)
        for s,e in gaps_v(rx+rw-3, ry+5, ry+rh-8): run('right', None, s+2 if s>ry+5 else s, e-2 if e<ry+rh-8 else e, pv(Rc), 2 if s>ry+5 else 5, 2 if e<ry+rh-8 else 7, e<ry+rh-8)
    return Image.fromarray(A)

C2 = np.array(even(img))
# 2) 칸마다 바꿀 점: 테두리 점(바탕) · 앞쪽 벽 점 · 고르게 하며 달라진 점
src_b, src_f = {}, {}
for idx in range(W * H - 1, -1, -1):
    y, x = divmod(idx, W)
    src_b.setdefault(tuple(int(v) for v in B0[y, x]), idx)
    if F0[y, x, 3] > 0: src_f.setdefault(tuple(int(v) for v in F0[y, x]), idx)
enc = lambda a: base64.b64encode(np.array(a, np.uint32).tobytes()).decode()
out, miss = {}, 0
for r in ('live', 'own', 'work'):
    rx, ry, rw, rh = P['rooms'][r]
    dst = set(dec(FRAMEMASK[r]['idx']).tolist()) | set(dec(FRAMEMASK[r]['fidx']).tolist())
    for y in range(max(0, ry - 1), min(H, ry + rh + 9)):
        for x in range(max(0, rx - 1), min(W, rx + rw + 1)):
            if (C2[y, x] != C0[y, x]).any(): dst.add(y * W + x)
    pb, pf = [], []
    for p in sorted(dst):
        y, x = divmod(p, W); v = tuple(int(c) for c in C2[y, x])
        if F0[y, x, 3] > 0:
            q = src_f.get(v)
            if q is None: miss += 1; continue
            pf += [p, q]
        else:
            q = src_b.get(v)
            if q is None: miss += 1; continue
            pb += [p, q]
    out[r] = {'b': enc(pb), 'f': enc(pf)}
    print(r, len(pb) // 2, len(pf) // 2)
print('색을 못 찾은 점', miss)
P['stoneCopy'] = out; P['v'] = max(P['v'], 29)
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
