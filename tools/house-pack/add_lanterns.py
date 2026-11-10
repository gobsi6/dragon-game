# pack.json v14: 마법 등불(노랑·파랑, 앞·옆 '방향'), 횃불 옆모습을 횃불의 '방향'으로, 장작 테두리를 짙은 갈색으로
# 움직이는 장면 4장씩 (Franuka Animated objects). 등불은 원래 색 그대로, 횃불 옆모습은 횃불과 같은 색 규칙(불꽃은 그대로)
import json, base64, io, sys, colorsys
import numpy as np
from PIL import Image
ANIM = sys.argv[1] if len(sys.argv) > 1 else 'Animated objects/'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
def uri(im): b = io.BytesIO(); im.save(b, 'PNG'); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
def load(u): return Image.open(io.BytesIO(base64.b64decode(u.split(',')[1]))).convert('RGBA')
def toward_beige(im, t=0.5, k=0.72, keepfire=True):
    a = np.array(im).astype(float); H = 0.075
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y, x, 3] == 0: continue
            h, s, v = colorsys.rgb_to_hsv(*(a[y, x, :3] / 255))
            if keepfire and s > 0.55 and v > 0.8: continue
            d = ((H - h + 0.5) % 1.0) - 0.5; h = (h + d * t) % 1.0
            r, g, b = colorsys.hsv_to_rgb(h, s * k, v); a[y, x, :3] = (r * 255, g * 255, b * 255)
    return Image.fromarray(a.round().astype('uint8'))
def frames(file, fw, fh, fn=None):
    sheet = Image.open(ANIM + file).convert('RGBA'); n = sheet.width // fw
    fr = [sheet.crop((i * fw, 0, i * fw + fw, fh)) for i in range(n)]
    if fn: fr = [fn(f) for f in fr]
    box = None
    for f in fr:
        b = f.getbbox(); box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    return [f.crop(box) for f in fr]
P = json.load(open(PACK, encoding='utf-8')); P['v'] = 14
def put(k, fr, name, extra=None):
    P['sprites'][k] = {'name': name, 'w': fr[0].width, 'h': fr[0].height, 'src': uri(fr[0]), 'frames': [uri(f) for f in fr], **(extra or {})}
# 횃불 옆모습 → 횃불의 방향
put('torch_side', frames('TorchSide.png', 16, 32, toward_beige), '횃불 (옆)', {'of': 'torch'})
P['groups']['torch'] = ['torch', 'torch_side']
# 마법 등불: 색마다 따로, 앞·옆은 방향
for cid, col, file in (('y', '노랑', 'yellow'), ('b', '파랑', 'blue')):
    base = f'lantern_{cid}'
    put(base, frames(f'MagicLantern ({file}).png', 16, 16), f'마법 등불 ({col})', {'stack': 1})
    put(base + '_side', frames(f'MagicLantern_side ({file}).png', 16, 16), f'마법 등불 ({col}, 옆)', {'stack': 1, 'of': base})
    P['groups'][base] = [base, base + '_side']
    P['cat'][base] = {'name': f'마법 등불 ({col})', 'seals': 5, 'mats': {'cave_crystal': 2, 'sun_dust': 1}, 'bp': 0, 'cat': 'light'}
# 장작: 붉은 테두리 → 짙은 갈색
fw = load(P['sprites']['firewood']['src']); px = fw.load()
for y in range(fw.height):
    for x in range(fw.width):
        if px[x, y][3] and px[x, y][:3] == (125, 56, 51): px[x, y] = (92, 62, 44, px[x, y][3])
P['sprites']['firewood']['src'] = uri(fw)
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', len(P['sprites']), len(P['cat']))
