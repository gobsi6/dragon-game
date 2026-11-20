# 붉은 벽지 (pack.json v43): 본 팩 붉은 벽지 칸(256,0)을 자줏빛 대신 붉은색 쪽으로 돌리고 채도 0.8배로. 굽도리(아래 다섯 줄)는 기존 '갈색 벽지'와 같은 원목 색
# (기존 '갈색 벽지'(redw)는 같은 칸을 붉은기를 빼 갈색으로 만든 것)
import json, base64, io, sys, colorsys
import numpy as np
from PIL import Image
MAINP = sys.argv[1] if len(sys.argv) > 1 else 'Fantasy RPG Interior Pack (16x16 grid).png'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
def uri(im): b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
P = json.load(open(PACK, encoding='utf-8')); P['v'] = max(P['v'], 43)
a = np.array(Image.open(MAINP).convert('RGBA').crop((256, 0, 272, 32)))[:, :, :3].astype(float)
out = a.copy()
for y in range(27):
    for x in range(16):
        h, s, v = colorsys.rgb_to_hsv(*(a[y, x] / 255)); h = 0.995 if y >= 2 else 0.97; out[y, x] = np.array(colorsys.hsv_to_rgb(h, s * 0.8, min(1, v * 1.04))) * 255   # 바탕은 자줏빛을 빼 붉은색 쪽으로(색상 0.97 → 0.995), 맨 위 테두리 두 줄은 짙은 자줏빛 조금 남김
redw = np.array(Image.open(io.BytesIO(base64.b64decode(next(w for w in P['walls'] if w['id'] == 'redw')['src'].split(',')[1]))).convert('RGB')).astype(float)
out[27:] = redw[27:]
im = Image.fromarray(out.round().astype('uint8'))
P['walls'] = [w for w in P['walls'] if w['id'] != 'crimsonw']
i = next(k for k, w in enumerate(P['walls']) if w['id'] == 'redw')
P['walls'].insert(i + 1, {'id': 'crimsonw', 'name': '붉은 벽지', 'src': uri(im)})
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', [w['id'] for w in P['walls']])
