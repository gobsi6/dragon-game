# 연금술 확장에서 고른 것 더 넣기 (pack.json v10): 색유리 창(색 여섯), 펼친 마법서(모양 둘), 마력 수정(모양·색 여덟), 화분대 파랑
# 나무 부분(붉은 보랏빛, 채도 낮음)만 원목 갈색으로, 유리·수정·책 색은 그대로
import json, base64, io, sys, colorsys
import numpy as np
from PIL import Image
ALC = sys.argv[1] if len(sys.argv) > 1 else 'Expansion_AlchemyLab.png'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
sheet = Image.open(ALC).convert('RGBA')
def uri(im): b = io.BytesIO(); im.save(b, 'PNG'); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
def wood(im):
    a = np.array(im).astype(float)
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y, x, 3] == 0: continue
            h, s, v = colorsys.rgb_to_hsv(*(a[y, x, :3] / 255))
            if (h >= 0.8 or h <= 0.06) and s < 0.5:
                r, g, b = colorsys.hsv_to_rgb(0.075, min(1, s * 0.9), v * 0.98); a[y, x, :3] = (r * 255, g * 255, b * 255)
    return Image.fromarray(a.round().astype('uint8'))
def cut(box): t = sheet.crop(box); return wood(t.crop(t.getbbox()))
P = json.load(open(PACK, encoding='utf-8')); P['v'] = 10; P.setdefault('groupLabel', {})
def group(base, name, cat, seals, mats, parts, label, extra=None):
    ids = []
    for i, (suf, box) in enumerate(parts):
        vid = base if i == 0 else f'{base}_{i}'; sp = cut(box)
        P['sprites'][vid] = {'name': name + (f' ({suf})' if suf else ''), 'w': sp.width, 'h': sp.height, 'src': uri(sp), **(extra or {})}
        if i: P['sprites'][vid]['of'] = base
        ids.append(vid)
    P['groups'][base] = ids; P['groupLabel'][base] = label
    P['cat'][base] = {'name': name, 'seals': seals, 'mats': mats, 'bp': 0, 'cat': cat}
group('glasswin', '색유리 창', 'wall', 6, {'old_tile': 2, 'cave_crystal': 2},
      [('', (8, 66, 23, 91)), ('하늘', (40, 66, 55, 91)), ('남색', (72, 66, 87, 91)), ('초록', (8, 98, 23, 123)), ('분홍', (40, 98, 55, 123)), ('노랑', (72, 98, 87, 123))], '색', {'layer': 'wall'})
group('spellbook', '펼친 마법서', 'study', 2, {'old_scroll': 1}, [('', (2, 132, 14, 141)), ('큰', (25, 132, 39, 142))], '모양', {'stack': 1})
group('crystal', '마력 수정', 'light', 3, {'cave_crystal': 2},
      [('', (132, 294, 140, 304)), ('초록 무리', (145, 291, 158, 304)), ('분홍', (164, 294, 172, 304)), ('분홍 무리', (177, 291, 190, 304)),
       ('노랑', (196, 294, 204, 304)), ('노랑 무리', (209, 291, 222, 304)), ('하늘', (228, 294, 236, 304)), ('하늘 무리', (241, 291, 254, 304))], '모양', {'stack': 1})
# 화분대(지금 것) + 파랑 화분대를 '색'으로
sp = cut((224, 429, 256, 458)); P['sprites']['planter_blue'] = {'name': '화분대 (파랑)', 'w': sp.width, 'h': sp.height, 'src': uri(sp), 'of': 'planter'}
P['groups']['planter'] = ['planter', 'planter_blue']; P['groupLabel']['planter'] = '색'
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', len(P['sprites']), len(P['cat']))
