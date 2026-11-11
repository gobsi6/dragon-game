# 돌벽이면 그 칸의 테두리·아랫벽 앞면을 '고유 칸'의 돌 테두리 그림 그대로 옮겨 붙임 (pack.json v28)
# 고유 칸(돌 벽돌벽)은 팩 그림부터 돌 테두리라, 거처·작업실의 테두리 점마다 고유 칸에서 같은 자리(모서리·변·앞면, 16칸 주기)의 점을 찾아 둠
# stoneCopy[room] = { b: [대상 점, 고유 칸 점, …](바탕), f: […](앞쪽 벽 층) }
import json, base64, io, sys
import numpy as np
from PIL import Image
PACK = sys.argv[1] if len(sys.argv) > 1 else 'public/house/pack.json'
P = json.load(open(PACK, encoding='utf-8')); W, H = P['W'], P['H']
im = lambda u: np.array(Image.open(io.BytesIO(base64.b64decode(u.split(',')[1]))).convert('RGBA'))
B, F = im(P['base']), im(P['front'])
dec = lambda s: np.frombuffer(base64.b64decode(s), np.uint32)
OX, OY, OW, OH = P['rooms']['own']
ownB = set(dec(P['frameMask']['own']['idx']).tolist()); ownF = set(dec(P['frameMask']['own']['fidx']).tolist())
def src_of(r, x, y):
    rx, ry, rw, rh = P['rooms'][r]
    dx, dy = x - rx, y - ry
    if dx < 8: sx = OX + dx
    elif rx + rw - x <= 8: sx = OX + OW - (rx + rw - x)
    else: sx = OX + 8 + ((dx - 8) % 16)
    if r == 'live' and y >= ry + rh - 8 and x in (P['door'][0] - 1, P['door'][1]): sx = OX   # 거처 문 양옆 끝은 고유 칸 바깥 외곽선으로 마감
    if dy < 8: sy = OY + dy
    elif y >= ry + rh - 8: sy = OY + OH + (y - (ry + rh))   # 아래 테·앞면은 아래쪽 끝에서 같은 거리
    else: sy = OY + 8 + ((dy - 8) % 16)
    return sx, sy
P['stoneCopy'] = {}
for r in ('live', 'work'):
    pb, pf = [], []
    for p in dec(P['frameMask'][r]['idx']).tolist():
        y, x = divmod(p, W); sx, sy = src_of(r, x, y); q = sy * W + sx
        if 0 <= sx < W and 0 <= sy < H and q in ownB: pb += [p, q]
    rx, ry, rw, rh = P['rooms'][r]
    for y in range(max(0, ry - 1), min(H, ry + rh + 9)):        # 앞쪽 벽 층
        for x in range(max(0, rx - 1), min(W, rx + rw + 1)):
            p = y * W + x; sx, sy = src_of(r, x, y); q = sy * W + sx
            if F[y, x, 3] > 0 and 0 <= sx < W and 0 <= sy < H and F[sy, sx, 3] > 0: pf += [p, q]   # 이 칸에 앞면이 있는 자리만 (거처 문 자리는 그대로 비어 있게)
    enc = lambda a: base64.b64encode(np.array(a, np.uint32).tobytes()).decode()
    P['stoneCopy'][r] = {'b': enc(pb), 'f': enc(pf)}
    print(r, len(pb) // 2, len(pf) // 2)
P.pop('frameTex', None)
P['v'] = max(P['v'], 28)
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

# 다른 돌벽(붉은 벽돌벽·밝은 돌 벽돌벽): 옮겨 붙인 돌 테두리를 밝기 단계(5)로 그 벽 무늬 색에 맞춤. 맨 위 밝은 면만 더 밝게
from collections import Counter
P = json.load(open(PACK, encoding='utf-8'))
tile = lambda wid: np.array(Image.open(io.BytesIO(base64.b64decode(next(w['src'] for w in P['walls'] if w['id'] == wid).split(',')[1]))).convert('RGB'))
ownc = set(map(tuple, B.reshape(-1, 4)[list(ownB)][:, :3].tolist())) | set(map(tuple, F.reshape(-1, 4)[list(ownF)][:, :3].tolist()))
ownc = {tuple(int(v) for v in c) for c in ownc}
lum = lambda c: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
tint = {}
for wid in ('redbrick', 'lightbrick'):
    # 밝기 단계로 대응: 외곽선 · 짙은 무늬 · 중간 무늬 · 밝은 무늬 · 맨 위 밝은 면 (그 벽 무늬의 세 색 + 더 짙은·더 밝은 색)
    t = tile(wid); body = sorted({tuple(int(v) for v in c) for c in t[:27].reshape(-1, 3).tolist()}, key=lum)
    dk, md, lt = body[0], body[len(body) // 2], body[-1]
    out = tuple(int(v * 0.62) for v in dk)
    # 테두리 맨 위 밝은 면: 밝은 돌(흰 벽돌)은 무늬의 가장 밝은 색에서 흰색 쪽으로 85%, 붉은 벽돌은 그 벽 무늬 굽도리의 따뜻한 밝은 살구색(주변 색과 어우러지게)
    hi = tuple(min(255, round(v + (255 - v) * 0.85)) for v in lt) if wid == 'lightbrick' else (248, 219, 192)
    if wid == 'redbrick':   # 붉은 벽돌: 무늬의 잿빛 줄눈·외곽선이 살구빛 벽·주황 바닥과 따로 놀아서, 어두운 쪽을 따뜻한 적갈색으로 (밝기는 거의 그대로)
        out, dk, md = (92, 66, 52), (138, 100, 78), (186, 148, 118)
    def pick(c):
        L = lum(c)
        return out if L < 100 else dk if L < 130 else md if L < 170 else lt if L < 210 else hi
    tint[wid] = {','.join(map(str, c)): list(pick(c)) for c in ownc}
P['stoneTint'] = tint
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('tint', {k: sorted(v.values(), key=sum) for k, v in tint.items()})
