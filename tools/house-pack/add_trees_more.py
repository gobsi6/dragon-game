# 바깥 팩(Fantasy RPG asset pack) 나무를 모두 (pack.json v39). 이미 있는 Tree_A1(초록 나무) · Tree_A3(단풍 나무) 빼고
# 색마다 따로 만드는 가구. 줄기는 add_trees.py와 같은 나무 규칙(붉은 보랏빛·채도 낮은 부분만 원목 갈색), 잎 색은 그대로
# Tree stump는 이미 '나무 그루터기'(stump)로 있어 뺌
# 이름: 1 연두 · 2 초록 · 3 단풍 · 4 서리(푸른 잎). 목록에서는 단풍 나무 다음
import json, base64, io, os, sys, colorsys
import numpy as np
from PIL import Image
DIR = sys.argv[1] if len(sys.argv) > 1 else 'Tileset'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
def uri(im): b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
def wood(im):
    a = np.array(im).astype(float)
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y, x, 3] == 0: continue
            h, s, v = colorsys.rgb_to_hsv(*(a[y, x, :3] / 255))
            if (h >= 0.8 or h <= 0.06) and s < 0.5:
                r, g, b = colorsys.hsv_to_rgb(0.075, min(1, s * 0.9), v * 0.98); a[y, x, :3] = (r * 255, g * 255, b * 255)
    return Image.fromarray(a.round().astype('uint8'))
M = {'living_bark': 4, 'shroom_spore': 2}
COL = {1: '연두', 2: '초록', 3: '단풍', 4: '서리'}
L = [('tree_a2', '짙은 초록 나무', 'Tree_A2.png'), ('tree_a4', '서리 나무', 'Tree_A4.png')]
for t, kind in (('b', '뭉게 나무'), ('c', '굽은 나무'), ('d', '둥근 나무'), ('e', '큰 전나무'), ('f', '키 큰 전나무')):
    L += [(f'tree_{t}{i}', f'{kind} ({COL[i]})', f'Tree_{t.upper()}{i}.png') for i in range(1, 5)]
L.insert(6, ('tree_xmas', '별 장식 나무', 'Tree_B_christmas.png'))   # 뭉게 나무 다음
P = json.load(open(PACK, encoding='utf-8')); P['v'] = max(P['v'], 39)
new = {}
for k, name, f in L:
    im = Image.open(os.path.join(DIR, f)).convert('RGBA'); sp = wood(im.crop(im.getbbox()))
    P['sprites'][k] = {'name': name, 'w': sp.width, 'h': sp.height, 'src': uri(sp)}
    new[k] = {'name': name, 'seals': 5, 'mats': dict(M), 'bp': 0, 'cat': 'green'}
cat = {}
for k, v in P['cat'].items():
    if k in new: continue
    cat[k] = v
    if k == 'tree_autumn': cat.update(new)
P['cat'] = cat
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', len(new), [(k, P['sprites'][k]['w'], P['sprites'][k]['h']) for k in new][:3])
