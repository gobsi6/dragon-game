# 고유 칸에서 돌이 아닌 벽(판자벽·벽지 등)을 고르면, 고유 칸 테두리·아랫벽 앞면도 나무 테두리로 (pack.json v30)
# 고유 칸과 작업실은 크기가 같고 문 방향만 반대 → 작업실의 원래 나무 테두리 그림을 좌우로 뒤집어 그대로 옮겨 붙임
# woodCopy.own = { b: [바꿀 점, 작업실 점, …](바탕), f: […](앞쪽 벽 층, 투명도 포함) }
import json, base64, io, sys
import numpy as np
from PIL import Image
PACK = sys.argv[1] if len(sys.argv) > 1 else 'public/house/pack.json'
P = json.load(open(PACK, encoding='utf-8')); W, H = P['W'], P['H']
FRAMEMASK = P.get('frameMask') or json.load(open('tools/house-pack/src/frame_mask.json'))   # 칸마다 테두리 점 (게임에는 안 쓰여 pack.json에서 빼고 따로 둠)
dec = lambda s: np.frombuffer(base64.b64decode(s), np.uint32)
OX, OY, OW, OH = P['rooms']['own']; WX, WY, WW, WH = P['rooms']['work']
assert (OW, OH) == (WW, WH)
mir = lambda x, y: (WX + WW - 1 - (x - OX), WY + (y - OY))          # 고유 칸 점 → 작업실의 거울 자리
back = lambda x, y: (OX + OW - 1 - (x - WX), OY + (y - WY))        # 작업실 점 → 고유 칸의 거울 자리
def mask(m): a = np.zeros(W * H, bool); a[dec(m['idx'])] = True; return a.reshape(H, W)
inner = mask(P['fmask']['own']) | mask(P['wmask']['own'])          # 고유 칸 바닥·안쪽 벽은 건드리지 않음
D = set()
for k in ('idx', 'fidx'):
    for p in dec(FRAMEMASK['own'][k]).tolist(): D.add(p)
    for p in dec(FRAMEMASK['work'][k]).tolist():
        y, x = divmod(p, W); bx, by = back(x, y)
        if 0 <= bx < W and 0 <= by < H: D.add(by * W + bx)
pb, pf = [], []
for p in sorted(D):
    y, x = divmod(p, W)
    if inner[y, x]: continue
    sx, sy = mir(x, y)
    if not (0 <= sx < W and 0 <= sy < H): continue
    q = sy * W + sx
    pb += [p, q]; pf += [p, q]
enc = lambda a: base64.b64encode(np.array(a, np.uint32).tobytes()).decode()
P['woodCopy'] = {'own': {'b': enc(pb), 'f': enc(pf)}}
P['v'] = max(P['v'], 30)
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('own wood', len(pb) // 2)
