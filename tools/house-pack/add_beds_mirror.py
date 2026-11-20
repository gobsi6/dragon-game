# 침대 색 · 벽걸이 거울 (pack.json v38)
# - 침대 · 기둥 침대: 침실 확장의 이불 색 다섯(빨강·노랑·파랑·초록·자홍)을 '색 바꾸기'로 (귀환 주문진처럼 하나만 만들면 고름)
#   나무는 기존 가구와 같게: 나무 규칙(wood) 뒤 기둥 침대와 같은 표로 남는 붉은·주홍 점을 원목 색으로 (add_franuka_more.py와 같음)
# - 벽걸이 거울: 욕실 확장의 금테 거울, 벽 장식 층. 금테는 그림 그대로
import json, base64, io, os, sys, colorsys
import numpy as np
from PIL import Image
D = sys.argv[1] if len(sys.argv) > 1 else '.'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
def uri(im): b = io.BytesIO(); im.save(b, 'PNG'); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
def wood(im):   # add_bedroom.py와 같은 규칙
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
FIX = {(125, 56, 51): (122, 86, 57), (207, 117, 43): (185, 141, 104)}   # 기둥 침대와 같은 표
def cut(n, box): t = Image.open(os.path.join(D, n)).convert('RGBA').crop(box); return t.crop(t.getbbox())
def bed(box, base):   # 기둥 꼭지의 주홍 점(207,117,43)은 노란 이불 그늘과 같은 색: 베이지 침대(base)에서 그 색이던 자리만 원목 색으로
    raw = cut('Expansion_Bedroom.png', box); b = np.array(cut('Expansion_Bedroom.png', base)); a = np.array(recolor(wood(raw), {k: v for k, v in FIX.items() if k != (207, 117, 43)}))
    m = (b[:, :, 0] == 207) & (b[:, :, 1] == 117) & (b[:, :, 2] == 43); a[m, :3] = FIX[(207, 117, 43)]
    return Image.fromarray(a)
P = json.load(open(PACK, encoding='utf-8')); P['v'] = max(P['v'], 38); S, G, GL = P['sprites'], P['groups'], P.setdefault('groupLabel', {})
COL = [('red', '빨강'), ('yellow', '노랑'), ('blue', '파랑'), ('green', '초록'), ('magenta', '자홍')]
def put(k, name, im, of): S[k] = {'name': name, 'w': im.width, 'h': im.height, 'src': uri(im), 'of': of}
# 침대(1인): 침실 그림판 y 216, 칸마다 64. 첫 칸(베이지)은 이미 있는 '침대'
G['bed'] = ['bed']
for i, (k, n) in enumerate(COL, 1): put(f'bed_{k}', f'침대 ({n})', bed((6 + 64 * i, 216, 26 + 64 * i, 248), (6, 216, 26, 248)), 'bed'); G['bed'].append(f'bed_{k}')
GL['bed'] = '색'
# 기둥 침대: (8, 259)부터 가로 96, 세로 48. 첫 칸(베이지)은 이미 있는 '기둥 침대'
G['bed_post'] = ['bed_post']
for i, (k, n) in enumerate(COL, 1):
    x, y = 8 + 96 * (i % 3), 259 + 48 * (i // 3); put(f'bed_post_{k}', f'기둥 침대 ({n})', bed((x, y, x + 32, y + 37), (8, 259, 40, 296)), 'bed_post'); G['bed_post'].append(f'bed_post_{k}')
GL['bed_post'] = '색'
# 벽걸이 거울
def desat(im, k):
    a = np.array(im).astype(float)
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y, x, 3] == 0: continue
            h, s, v = colorsys.rgb_to_hsv(*(a[y, x, :3] / 255)); r, g, b = colorsys.hsv_to_rgb(h, s * k, v); a[y, x, :3] = (r * 255, g * 255, b * 255)
    return Image.fromarray(a.round().astype('uint8'))
m = cut('Expansion_Bath.png', (112, 20, 129, 44))   # 그림 그대로 (채도를 낮춰 봤다가 되돌림)
S['mirror_wall'] = {'name': '벽걸이 거울', 'w': m.width, 'h': m.height, 'src': uri(m), 'layer': 'wall'}
P['cat']['mirror_wall'] = {'name': '벽걸이 거울', 'seals': 5, 'mats': {'cave_crystal': 2, 'bog_iron': 1}, 'bp': 0, 'cat': 'wall'}
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', G['bed'], G['bed_post'], m.size)
