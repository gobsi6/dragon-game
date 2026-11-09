# 텃밭 흙 색: 바깥 팩 흙(붉은 보라빛)을 베이지 갈색으로. 흙 두둑(bedplot)과 작물 단계 그림의 흙 둔덕을 같은 색으로 맞춤
import json, base64, io, sys
from PIL import Image
PACK = sys.argv[1] if len(sys.argv) > 1 else 'public/house/pack.json'
SOIL = {  # 원래 색 → 베이지 흙
    (114, 61, 69): (122, 94, 72), (121, 65, 73): (130, 100, 76), (143, 77, 87): (152, 118, 88), (168, 90, 102): (176, 140, 104),
    (99, 61, 76): (98, 76, 62), (189, 106, 98): (194, 156, 116) }
def fix(u):
    im = Image.open(io.BytesIO(base64.b64decode(u.split(',')[1]))).convert('RGBA'); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            c = px[x, y]
            if c[3] and c[:3] in SOIL: px[x, y] = SOIL[c[:3]] + (c[3],)
    b = io.BytesIO(); im.save(b, 'PNG'); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
P = json.load(open(PACK, encoding='utf-8'))
P['sprites']['bedplot']['src'] = fix(P['sprites']['bedplot']['src'])
for cr in P['garden']['crops'].values(): cr['frames'] = [fix(f) for f in cr['frames']]
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok')
