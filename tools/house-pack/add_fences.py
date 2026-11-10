# 울타리 네 가지(나무·돌·흰 쇠·높은 철)와 꽃 아홉 가지를 pack.json에 넣음 (v7)
# 울타리: 가로(기둥 셋) · 세로(기둥 셋) · 기둥 하나를 한 가구의 '방향'으로 묶음 (꾸미기에서 R로 바꿈)
# 꽃: Tileset Flower_1~9를 한 가구 '꽃'의 '모양'으로 묶음, 깔개처럼 바닥에 납작하게(다른 가구 밑에 깔림)
# 색: 나무·돌·흰 쇠는 다른 가구처럼 붉은 기만 원목 갈색으로, 높은 철 울타리는 짙은 쇠색(회청)으로
import json, base64, io, sys, colorsys
import numpy as np
from PIL import Image
FA = sys.argv[1] if len(sys.argv) > 1 else 'Fantasy RPG asset pack/1x/'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
def uri(im): b = io.BytesIO(); im.save(b, 'PNG'); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
def recolor(im, fn):
    a = np.array(im).astype(float)
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y, x, 3] == 0: continue
            h, s, v = colorsys.rgb_to_hsv(*(a[y, x, :3] / 255)); h, s, v = fn(h, s, v)
            r, g, b = colorsys.hsv_to_rgb(h, s, v); a[y, x, :3] = (r * 255, g * 255, b * 255)
    return Image.fromarray(a.round().astype('uint8'))
def unred(h, s, v):  # 붉은·자줏빛만 원목 갈색으로 (다른 가구와 같은 규칙)
    if s < 0.08 or (s > 0.6 and v > 0.8): return h, s, v
    if h >= 0.80 or h <= 0.06: return 0.075, min(1, s * 0.9), v * 0.98
    return h, s, v
def iron(h, s, v):   # 쇠: 회청색, 채도 낮게
    if s < 0.05: return h, s, v
    return 0.6, s * 0.28, v * 0.95
def cut(im, box): t = im.crop(box); return t.crop(t.getbbox())
P = json.load(open(PACK, encoding='utf-8')); P['v'] = 7
FENCES = [  # id, 이름, 파일, 색, (가로, 세로, 기둥) 자르기, 인장, 재료
    ('fence_wood', '나무 울타리', 'Fences (wood).png', unred, [(64, 0, 112, 16), (48, 0, 64, 48), (64, 16, 80, 32)], 3, {'living_bark': 2}),
    ('fence_stone', '돌 울타리', 'Fences (stone).png', unred, [(64, 0, 112, 16), (48, 0, 64, 48), (64, 16, 80, 32)], 4, {'rune_stone': 3}),
    ('fence_white', '흰 쇠 울타리', 'Fences (metal).png', unred, [(64, 0, 112, 16), (48, 0, 64, 48), (64, 16, 80, 32)], 5, {'bog_iron': 2, 'sea_shell': 1}),
    ('fence_iron', '높은 철 울타리', 'High iron fences.png', iron, [(64, 0, 112, 32), (48, 0, 64, 64), (64, 32, 80, 64)], 6, {'bog_iron': 4}),
]
for fid, name, file, fn, boxes, seals, mats in FENCES:
    im = Image.open(FA + 'Objects/' + file).convert('RGBA')
    ids = [fid, fid + '_v', fid + '_post']
    for k, (vid, box, suf) in enumerate(zip(ids, boxes, ['', ' (세로)', ' (기둥)'])):
        sp = recolor(cut(im, box), fn)
        P['sprites'][vid] = {'name': name + suf, 'w': sp.width, 'h': sp.height, 'src': uri(sp)}
        if k: P['sprites'][vid]['of'] = fid
    P['groups'][fid] = ids
    P['cat'][fid] = {'name': name, 'seals': seals, 'mats': mats, 'bp': 0, 'cat': 'fence'}
# 꽃 아홉 가지 → '꽃' 하나의 모양
ids = ['flower%d' % i if i > 1 else 'flower1' for i in range(1, 10)]
for i, vid in enumerate(ids, 1):
    sp = cut(Image.open(FA + 'Tileset/Flower_%d.png' % i).convert('RGBA'), (0, 0, 16, 16))
    P['sprites'][vid] = {'name': '꽃', 'w': sp.width, 'h': sp.height, 'src': uri(sp), 'layer': 'flat'}
    if i > 1: P['sprites'][vid]['of'] = 'flower1'
P['groups']['flower1'] = ids
P['groupLabel'] = {**P.get('groupLabel', {}), 'flower1': '모양'}
P['cat']['flower1'] = {'name': '꽃', 'seals': 1, 'mats': {'shroom_spore': 1}, 'bp': 0, 'cat': 'green'}
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', len(P['sprites']))
