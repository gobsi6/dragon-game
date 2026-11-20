# 색 손보기 (pack.json v37)
# - 칠판(rug_star): 나무 기존 규칙으로 자줏빛을 빼되, 원목 갈색보다 붉은 갈색으로 (hue 0.02)
# - 작은 수납장(cab_small) → '작은 탁자': 그림이 탁자라서 이름과 종류(생활)를 고침. 가진 수·놓아 둔 것은 그대로
# - 들꽃(flowers)을 뺌: 노란 꽃(flower2)과 그림이 같음. 가진 것·놓아 둔 것은 서버(city.js packMigrate, v40)가 노란 꽃으로 옮기고 인장 차이를 돌려줌
# - 쪽지(memo · memo_wall): 베이지로 바꿨던 것을 팩 원래 복숭앗빛으로 되돌림 (베이지 가구 위에서 묻히지 않게)
import json, base64, io, os, sys, colorsys
import numpy as np
from PIL import Image
D = sys.argv[1] if len(sys.argv) > 1 else '.'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
def uri(im): b = io.BytesIO(); im.save(b, 'PNG'); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
def wood(im, hue=0.075):   # add_bedroom.py와 같은 규칙 (hue만 고를 수 있게)
    a = np.array(im).astype(float)
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y, x, 3] == 0: continue
            h, s, v = colorsys.rgb_to_hsv(*(a[y, x, :3] / 255))
            if (h >= 0.8 or h <= 0.06) and s < 0.5:
                r, g, b = colorsys.hsv_to_rgb(hue, min(1, s * 0.9), v * 0.98); a[y, x, :3] = (r * 255, g * 255, b * 255)
    return Image.fromarray(a.round().astype('uint8'))
def cut(n, box): t = Image.open(os.path.join(D, n)).convert('RGBA').crop(box); return t.crop(t.getbbox())
P = json.load(open(PACK, encoding='utf-8')); P['v'] = max(P['v'], 37); S = P['sprites']
bb = wood(cut('Expansion_School.png', (210, 36, 254, 58)), 0.02)   # 원목 갈색(0.075)보다 붉은 갈색
S['rug_star'].update(src=uri(bb), w=bb.width, h=bb.height)
memo = cut('Expansion_Workshop.png', (100, 101, 106, 108))
for k in ('memo', 'memo_wall'): S[k].update(src=uri(memo), w=memo.width, h=memo.height)
P['cat']['cab_small'].update(name='작은 탁자', cat='live'); S['cab_small']['name'] = '작은 탁자'
for k in ('sprites', 'cat'): P[k].pop('flowers', None)
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', bb.size, memo.size)
