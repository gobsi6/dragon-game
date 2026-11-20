# RPG Castles asset pack(by Franuka)의 깔개 일곱 (pack.json v42). Rug_Tan은 뺌. 색마다 따로 만드는 가구
# 색 이름은 그림에 맞춤: Orange → 주홍, Purple → 자홍, Red → 진홍
# 깔개 층(flat) · 키는 rug_로 시작(그리는 순서에서 깔개로 침 → 꽃은 그 위). 그림 그대로, 값은 네모 깔개와 같음. 목록에서는 달 깔개 다음
import json, base64, io, os, sys
from PIL import Image
D = sys.argv[1] if len(sys.argv) > 1 else 'Tiles'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
def uri(im): b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
COL = [('blue', '파랑', 'Blue'), ('gray', '회색', 'Gray'), ('green', '초록', 'Green'), ('orange', '주홍', 'Orange'), ('pink', '분홍', 'Pink'), ('purple', '자홍', 'Purple'), ('red', '진홍', 'Red')]
P = json.load(open(PACK, encoding='utf-8')); P['v'] = max(P['v'], 42); new = {}
for k, n, f in COL:
    im = Image.open(os.path.join(D, f'Rug_{f}.png')).convert('RGBA'); im = im.crop(im.getbbox()); key = f'rug_castle_{k}'
    P['sprites'][key] = {'name': f'성 깔개 ({n})', 'w': im.width, 'h': im.height, 'src': uri(im), 'layer': 'flat'}
    new[key] = {'name': f'성 깔개 ({n})', 'seals': 8, 'mats': {'faded_cloth': 8}, 'bp': 0, 'cat': 'live'}
cat = {}
for k, v in P['cat'].items():
    if k in new: continue
    cat[k] = v
    if k == 'rug_moon': cat.update(new)
P['cat'] = cat
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', list(new), P['sprites']['rug_castle_blue']['w'], P['sprites']['rug_castle_blue']['h'])
