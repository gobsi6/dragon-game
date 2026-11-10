# 침실 확장에서 고른 것 더 넣기 (pack.json v12)
# 벽지 '별밤 벽지'(16×32, 아래 굽도리), 바닥 '연한 벽돌 바닥'(16×16), 탁상시계 · 책 바구니(탁자 위에 올림) · 은 거울 · 달 깔개
# 나무·굽도리처럼 붉은 보랏빛이고 채도 낮은 부분만 원목 갈색으로, 별·유리·깔개 색은 그대로
import json, base64, io, sys, colorsys
import numpy as np
from PIL import Image
BED = sys.argv[1] if len(sys.argv) > 1 else 'Expansion_Bedroom.png'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
sheet = Image.open(BED).convert('RGBA')
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
def cut(box, keep=False): t = sheet.crop(box); t = t.crop(t.getbbox()); return t if keep else wood(t)
P = json.load(open(PACK, encoding='utf-8')); P['v'] = 12
# 벽지 · 바닥 (그림 그대로 한 칸)
star = wood(sheet.crop((16, 0, 32, 32)).convert('RGB').convert('RGBA'))
P['walls'] = [w for w in P['walls'] if w['id'] != 'starry'] + [{'id': 'starry', 'name': '별밤 벽지', 'src': uri(star.convert('RGB'))}]
brick = sheet.crop((64, 16, 80, 32)).convert('RGB')
P['floors'] = [f for f in P['floors'] if f['id'] != 'lbrick'] + [{'id': 'lbrick', 'name': '연한 벽돌 바닥', 'src': uri(brick), 's': 16}]
# 가구
ITEMS = [
    ('desk_clock', '탁상시계', (67, 190, 77, 202), 'live', 3, {'bog_iron': 1, 'gold_ore': 1}, {'stack': 1}, False),
    ('book_tray', '책 바구니', (80, 185, 96, 197), 'study', 2, {'living_bark': 1, 'old_scroll': 1}, {'stack': 1}, False),
    ('mirror', '은 거울', (368, 167, 384, 199), 'live', 6, {'cave_crystal': 2, 'bog_iron': 2}, {}, False),
    ('rug_moon', '달 깔개', (386, 162, 430, 206), 'live', 10, {'faded_cloth': 8, 'sun_dust': 1}, {'layer': 'flat'}, True),
]
for vid, name, box, cat, seals, mats, extra, keep in ITEMS:
    sp = cut(box, keep)
    P['sprites'][vid] = {'name': name, 'w': sp.width, 'h': sp.height, 'src': uri(sp), **extra}
    P['cat'][vid] = {'name': name, 'seals': seals, 'mats': mats, 'bp': 0, 'cat': cat}
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', len(P['sprites']), len(P['walls']), len(P['floors']))
