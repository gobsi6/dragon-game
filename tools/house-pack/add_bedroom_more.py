# 침실 확장에서 더 (pack.json v35)
# - 커튼: 색 일곱 × (닫힌·걷은) 열네 장을 한 가구로 ('모양 바꾸기'로 차례로). 벽 장식 층. 천 색은 그대로
# - 책 선반(책 바구니 그림): 갈색(붉은 보랏빛 나무 → 원목 갈색, 기존 규칙) · 주황 나무를 '색'으로 더함
# - 은 거울: 금빛 거울을 '색'으로 더함 (금테 그대로)
import json, base64, io, sys, colorsys
import numpy as np
from PIL import Image
BED = sys.argv[1] if len(sys.argv) > 1 else 'Expansion_Bedroom.png'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
sheet = Image.open(BED).convert('RGBA')
def uri(im): b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
def wood(im):   # 기존 규칙 (add_bedroom.py와 같음): 붉은 보랏빛이고 채도 낮은 부분만 원목 갈색으로
    a = np.array(im).astype(float)
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y, x, 3] == 0: continue
            h, s, v = colorsys.rgb_to_hsv(*(a[y, x, :3] / 255))
            if (h >= 0.8 or h <= 0.06) and s < 0.5:
                r, g, b = colorsys.hsv_to_rgb(0.075, min(1, s * 0.9), v * 0.98); a[y, x, :3] = (r * 255, g * 255, b * 255)
    return Image.fromarray(a.round().astype('uint8'))
def cut(box, fn=None): t = sheet.crop(box); t = t.crop(t.getbbox()); return fn(t) if fn else t
P = json.load(open(PACK, encoding='utf-8')); P['v'] = max(P['v'], 35); GL = P.setdefault('groupLabel', {})
def put(k, name, im, extra=None, of=None):
    P['sprites'][k] = {'name': name, 'w': im.width, 'h': im.height, 'src': uri(im), **(extra or {}), **({'of': of} if of else {})}
# 커튼
COLS = [('옅은 갈색', 105, 101), ('빨강', 201, 101), ('노랑', 297, 101), ('청록', 9, 133), ('초록', 105, 133), ('자홍', 201, 133), ('흰', 297, 133)]
ids = []
for i, (cn, x, y) in enumerate(COLS):
    for j, st in enumerate(('닫힌', '걷은')):
        k = 'curtain' if not ids else f'curtain_{i}{"co"[j]}'
        put(k, '커튼' if not ids else f'커튼 ({cn}, {st})', cut((x + j * 48, y, x + j * 48 + 29, y + 20)), {'layer': 'wall'}, None if not ids else 'curtain'); ids.append(k)
P['sprites']['curtain']['name'] = '커튼'
P['groups']['curtain'] = ids; GL['curtain'] = '모양'
P['cat']['curtain'] = {'name': '커튼', 'seals': 5, 'mats': {'living_bark': 1, 'moss_flower': 2}, 'bp': 0, 'cat': 'wall'}
print('curtain', len(ids), P['sprites']['curtain']['w'], P['sprites']['curtain']['h'])
# 책 바구니 색 둘
put('book_tray_brown', '책 선반 (갈색 바구니)', cut((32, 185, 48, 197), wood), {'stack': 1}, 'book_tray')
put('book_tray_orange', '책 선반 (주황 바구니)', cut((128, 185, 144, 197)), {'stack': 1}, 'book_tray')
P['groups']['book_tray'] = ['book_tray', 'book_tray_brown', 'book_tray_orange']; GL['book_tray'] = '색'
# 금빛 거울
put('mirror_gold', '은 거울 (금빛)', cut((336, 167, 352, 199)), None, 'mirror')
P['groups']['mirror'] = ['mirror', 'mirror_gold']; GL['mirror'] = '색'
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
