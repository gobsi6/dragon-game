# 돌벽을 고르면 그 칸의 테두리(벽 둘레 테·아랫벽 앞면)도 돌 느낌으로 (pack.json v27)
# frameMask[room] = { idx: 바탕에서 테두리 점, fidx: 앞쪽 벽 층에서 테두리 점 }, stoneFrame[벽] = { "r,g,b": [r,g,b] } (원래 나무 테 색 → 돌 색)
import json, base64, io, sys
import numpy as np
from PIL import Image
PACK = sys.argv[1] if len(sys.argv) > 1 else 'public/house/pack.json'
P = json.load(open(PACK, encoding='utf-8')); W, H = P['W'], P['H']
im = lambda u: np.array(Image.open(io.BytesIO(base64.b64decode(u.split(',')[1]))).convert('RGBA'))
B, F = im(P['base']), im(P['front'])
def mask(m): a = np.zeros(W * H, bool); a[np.frombuffer(base64.b64decode(m['idx']), np.uint32)] = True; return a.reshape(H, W)
# 나무 테두리 색 8가지 (어두운 것부터) → 돌 색 5단계 [외곽선, 짙음, 중간, 밝은 중간, 밝음]
FRAME = [(90, 74, 60), (102, 88, 74), (122, 104, 88), (163, 141, 121), (173, 143, 115), (197, 175, 154), (226, 185, 148), (248, 219, 192)]
LEVEL = [0, 1, 1, 2, 2, 3, 4, 4]
PAL = {
  'lightbrick': [(78, 76, 86), (120, 118, 122), (166, 157, 147), (198, 193, 180), (227, 224, 205)],  # 밝은 돌 벽돌벽: 회백색 돌
  'brick':      [(86, 74, 64), (122, 104, 88), (163, 141, 121), (184, 166, 148), (210, 196, 180)],  # 돌 벽돌벽: 누런 돌 (나무의 붉은 살구빛을 뺌)
}
P['stoneFrame'] = {w: {','.join(map(str, c)): list(pal[LEVEL[i]]) for i, c in enumerate(FRAME)} for w, pal in PAL.items()}
keys = set(FRAME)
rgb = B[..., :3].astype(float) / 255; mx = rgb.max(-1); mn = rgb.min(-1); sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
sand = (sat < 0.2) & (mx > 0.7)
FM = {k: mask(v) for k, v in P['fmask'].items()}; WM = {k: mask(v) for k, v in P['wmask'].items()}; YM = mask(P['ymask'])
P['frameMask'] = {}
for r, (rx, ry, rw, rh) in P['rooms'].items():
    if r == 'yard': continue
    box = np.zeros((H, W), bool); box[max(0, ry - 1):min(H, ry + rh + 9), max(0, rx - 1):min(W, rx + rw + 1)] = True
    isframe = np.array([[tuple(B[y, x, :3]) in keys for x in range(W)] for y in range(H)])
    fb = box & (B[..., 3] > 0) & ~FM[r] & ~WM[r] & ~YM & ~sand & isframe
    isframeF = np.array([[tuple(F[y, x, :3]) in keys for x in range(W)] for y in range(H)])
    ff = box & (F[..., 3] > 0) & isframeF
    enc = lambda m: base64.b64encode(np.flatnonzero(m).astype(np.uint32).tobytes()).decode()
    P['frameMask'][r] = {'idx': enc(fb), 'fidx': enc(ff)}
    print(r, int(fb.sum()), int(ff.sum()))
P['v'] = max(P['v'], 27)
json.dump(P['frameMask'], open('tools/house-pack/src/frame_mask.json', 'w'), separators=(',', ':'))   # 다른 도구가 읽는 사본
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
