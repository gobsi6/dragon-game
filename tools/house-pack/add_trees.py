# 바깥 팩 나무 둘: Tree_A1(초록 나무) · Tree_A3(단풍 나무). 식물·정원. 줄기(붉은 보랏빛, 채도 낮음)만 원목 갈색으로, 잎 색은 그대로. pack.json v25
import json, base64, io, sys, colorsys
import numpy as np
from PIL import Image
DIR = sys.argv[1] if len(sys.argv) > 1 else 'Tileset/'
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
P = json.load(open(PACK, encoding='utf-8')); P['v'] = max(P['v'], 25)
for vid, name, f in (('tree_green', '초록 나무', 'Tree_A1.png'), ('tree_autumn', '단풍 나무', 'Tree_A3.png')):
    im = Image.open(DIR + f).convert('RGBA'); sp = wood(im.crop(im.getbbox()))
    P['sprites'][vid] = {'name': name, 'w': sp.width, 'h': sp.height, 'src': uri(sp)}
    P['cat'][vid] = {'name': name, 'seals': 5, 'mats': {'living_bark': 4, 'shroom_spore': 2}, 'bp': 0, 'cat': 'green'}
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', P['sprites']['tree_green']['w'], P['sprites']['tree_green']['h'])
