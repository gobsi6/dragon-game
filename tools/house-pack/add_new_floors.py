# 새 바닥 여덟 (pack.json v44). 방 바닥과 마당 바닥 모두에서 고를 수 있음
# - RPG Castles asset pack(by Franuka) Tiles: 채도 0.7배. 네모 돌은 매끈한 칸에 점무늬·금 간 칸을 조금 섞은 3×3(48px) 무늬
#   푸른 벽돌(Bricks_3) · 푸른 돌(Stone_4) · 자줏빛 돌(Stone_5) · 베이지 돌(Stone_2) · 회색 돌(Stone_1) · 붉은 마루(Floor_Wooden)
#   회색 벽돌: 베이지 벽돌(Bricks_1)의 채도를 0.12배로
# - 붉은 카펫: 기존 '금빛 모래' 바닥을 붉게. 무늬 두 색도 붉은 계열 명암으로
import json, base64, io, os, sys, colorsys
import numpy as np
from PIL import Image
D = sys.argv[1] if len(sys.argv) > 1 else 'Tiles'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
def uri(im): b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
def desat(im, k):
    a = np.array(im.convert('RGBA')).astype(float)
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            h, s, v = colorsys.rgb_to_hsv(*(a[y, x, :3] / 255)); r, g, b = colorsys.hsv_to_rgb(h, s * k, v); a[y, x, :3] = (r * 255, g * 255, b * 255)
    return Image.fromarray(a.round().astype('uint8')).convert('RGB')
def tile(f, i=0): return Image.open(os.path.join(D, f)).convert('RGBA').crop((i * 16, 0, i * 16 + 16, 16))
def pat(f, grid):
    c = Image.new('RGBA', (16 * len(grid), 16 * len(grid)))
    for y, row in enumerate(grid):
        for x, i in enumerate(row): c.paste(tile(f, i), (x * 16, y * 16))
    return c
STONE = [[0, 0, 1], [0, 2, 0], [3, 0, 0]]
P = json.load(open(PACK, encoding='utf-8')); P['v'] = max(P['v'], 44)
sand = np.array(Image.open(io.BytesIO(base64.b64decode(next(f for f in P['floors'] if f['id'] == 'sand')['src'].split(',')[1]))).convert('RGB'))
for k, v in {(254, 204, 105): (0.0, 0.65, 0.78), (248, 219, 192): (0.0, 0.5, 0.86), (226, 185, 148): (0.99, 0.62, 0.66)}.items():
    m = (sand[:, :, 0] == k[0]) & (sand[:, :, 1] == k[1]) & (sand[:, :, 2] == k[2]); sand[m] = [round(c * 255) for c in colorsys.hsv_to_rgb(*v)]
NEW = [('brick_blue', '푸른 벽돌', desat(tile('Floors_Bricks_3.png'), 0.7)),
       ('stone_blue', '푸른 돌', desat(pat('Floors_Stone_4.png', STONE), 0.7)),
       ('stone_plum', '자줏빛 돌', desat(pat('Floors_Stone_5.png', STONE), 0.7)),
       ('stone_beige', '베이지 돌', desat(pat('Floors_Stone_2.png', STONE), 0.7)),
       ('stone_gray', '회색 돌', desat(pat('Floors_Stone_1.png', STONE), 0.7)),
       ('brick_gray', '회색 벽돌', desat(tile('Floors_Bricks_1.png'), 0.12)),
       ('wood_red', '붉은 마루', desat(tile('Floor_Wooden.png'), 0.7)),
       ('carpet_red', '붉은 카펫', Image.fromarray(sand))]
ids = {k for k, _, _ in NEW}
P['floors'] = [f for f in P['floors'] if f['id'] not in ids] + [{'id': k, 'name': n, 'src': uri(im), 's': im.width} for k, n, im in NEW]
P['yardFloors'] = [k for k in P['yardFloors'] if k not in ids] + [k for k, _, _ in NEW]
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', [(f['id'], f['s']) for f in P['floors'][-8:]])
