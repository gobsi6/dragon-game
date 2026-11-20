# 버섯 셋 · 해골 나무 팻말 (pack.json v40). 바깥 팩(Fantasy RPG asset pack) Objects
# - 버섯: 움직임 네 칸 중 첫 칸만 (기존 '버섯'과 같게). 줄기·테두리는 기존 버섯과 같은 표로 원목 쪽 색으로, 갓 색은 그대로
#   주황 버섯(Mushroom_3) · 푸른 버섯(Mushroom_4) · 초록 버섯(푸른 버섯 갓의 색상만 초록으로 돌림)
# - 해골 나무 팻말: 나무 규칙(wood)으로 붉은기를 뺌
import json, base64, io, os, sys, colorsys
import numpy as np
from PIL import Image
D = sys.argv[1] if len(sys.argv) > 1 else 'Objects'
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
def recolor(im, table):
    a = np.array(im)
    for f, t in table.items(): m = (a[:, :, 0] == f[0]) & (a[:, :, 1] == f[1]) & (a[:, :, 2] == f[2]); a[m, :3] = t
    return Image.fromarray(a)
STEM = {(82, 51, 63): (80, 65, 53), (143, 77, 87): (140, 108, 81), (255, 194, 161): (249, 204, 166)}   # 기존 버섯과 같은 줄기 색
def first(f): t = Image.open(os.path.join(D, f)).convert('RGBA').crop((0, 0, 16, 16)); return recolor(t.crop(t.getbbox()), STEM)
def green(im):   # 푸른 갓(색상 0.53~0.64)만 초록 쪽으로
    a = np.array(im).astype(float)
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y, x, 3] < 255: continue
            h, s, v = colorsys.rgb_to_hsv(*(a[y, x, :3] / 255))
            if 0.5 <= h <= 0.7 and s > 0.3: r, g, b = colorsys.hsv_to_rgb(h - 0.24, min(1, s * 1.05), v); a[y, x, :3] = (r * 255, g * 255, b * 255)
    return Image.fromarray(a.round().astype('uint8'))
P = json.load(open(PACK, encoding='utf-8')); P['v'] = max(P['v'], 40)
blue = first('Mushroom_4.png')
NEW = [('mushroom_orange', '주황 버섯', first('Mushroom_3.png'), 'green', 3, {'shroom_spore': 4}),
       ('mushroom_blue', '푸른 버섯', blue, 'green', 3, {'shroom_spore': 4}),
       ('mushroom_green', '초록 버섯', green(blue), 'green', 3, {'shroom_spore': 4}),
       ('sign_skull', '해골 나무 팻말', wood(Image.open(os.path.join(D, 'Wooden sign (skull).png')).convert('RGBA')), 'out', 3, {'living_bark': 2})]
new = {}
for k, name, im, cat, seals, mats in NEW:
    im = im.crop(im.getbbox()); P['sprites'][k] = {'name': name, 'w': im.width, 'h': im.height, 'src': uri(im)}
    new[k] = {'name': name, 'seals': seals, 'mats': mats, 'bp': 0, 'cat': cat}
cat = {}
for k, v in P['cat'].items():   # 버섯들은 기존 '버섯' 다음, 팻말은 맨 뒤
    if k in new: continue
    cat[k] = v
    if k == 'mushroom': cat.update({k2: new[k2] for k2 in new if k2.startswith('mushroom')})
cat.update({k2: new[k2] for k2 in new if k2 not in cat})
P['cat'] = cat
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', [(k, P['sprites'][k]['w'], P['sprites'][k]['h']) for k in new])
