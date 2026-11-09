# 텃밭: 흙 두둑(가구 'bedplot')만 그림으로 두고, 작물(당근·산딸기·해바라기)은 자라는 단계 그림 4장(씨앗·새싹·다 자람·거둔 뒤)을
# 화면이 그 위에 3포기씩 그림. 예전 '열매 텃밭'·'해바라기 화단'은 '텃밭' 하나로 합침 (pack.json v4)
import json, base64, io, sys
import numpy as np
from PIL import Image
FA = sys.argv[1] if len(sys.argv) > 1 else 'Fantasy RPG asset pack/1x/'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
uri = lambda im: (lambda b: (im.save(b, 'PNG'), 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode())[1])(io.BytesIO())
# 흙 두둑 44×14 (garden.py와 같은 방법: 바깥 팩 맨흙 타일 + 테두리 + 고랑 두 줄)
W, H, TOP = 44, 14, 15
D = np.array(Image.open(FA + 'Tileset/Dirt.png').convert('RGBA'))[22:32, 50:78].astype(float)
soil = np.zeros((H, W, 4))
for y in range(H):
    for x in range(W): soil[y, x] = D[y % D.shape[0], x % D.shape[1]]
dark = D[:, :, :3].reshape(-1, 3).min(axis=0) * 0.85; lite = np.clip(D[:, :, :3].reshape(-1, 3).mean(axis=0) * 1.18, 0, 255)
for x in range(W): soil[0, x, :3] = dark; soil[H - 1, x, :3] = dark; soil[1, x, :3] = lite
for y in range(H): soil[y, 0, :3] = dark; soil[y, W - 1, :3] = dark
for k in (4, 8):
    for x in range(2, W - 2): soil[k, x, :3] = soil[k, x, :3] * 0.8
bed = Image.new('RGBA', (W, H + TOP), (0, 0, 0, 0)); bed.paste(Image.fromarray(soil.astype('uint8')), (0, TOP))
P = json.load(open(PACK, encoding='utf-8')); P['v'] = 4
P['sprites']['bedplot'] = {'name': '텃밭', 'w': W, 'h': H + TOP, 'src': uri(bed)}
P['cat']['bedplot'] = {'name': '텃밭', 'seals': 4, 'mats': {'red_clay': 6, 'shroom_spore': 2}, 'bp': 0, 'cat': 'green'}
for k in ('bedplot2', 'bedplot3'): P['sprites'].pop(k, None); P['cat'].pop(k, None)
# 작물 그림: 16×32 장면 4장을 그대로 (흙 둔덕이 31행 근처라, 두둑 가운데 줄에 맞춰 그림)
crops = {}
for cid, file, name in (('carrot', 'carrot', '당근'), ('berry', 'berries', '산딸기'), ('sunflower', 'sunflower', '해바라기')):
    im = Image.open(FA + f'Objects/Crops ({file}).png').convert('RGBA')
    crops[cid] = {'name': name, 'frames': [uri(im.crop((j * 16, 0, j * 16 + 16, 32))) for j in range(4)]}
P['garden'] = {'crops': crops, 'xs': [int((i + 0.5) * W / 3) for i in range(3)], 'base': TOP + H // 2 + 3, 'ground': 29}
# 기본 배치·기본 가구 수: 예전 두 텃밭을 '텃밭'으로
for plot, items in P['defaults'].items():
    for o in items:
        if o['s'] in ('bedplot2', 'bedplot3'): o['s'] = 'bedplot'
    beds = sorted([o for o in items if o['s'] == 'bedplot'], key=lambda o: o['y'])  # 텃밭이 6도트 높아져서, 위아래로 붙은 두둑은 위쪽 것을 올림
    for a, b in zip(beds, beds[1:]):
        if a['x'] < b['x'] + W and b['x'] < a['x'] + W and a['y'] + H + TOP > b['y']:
            if b['room'] in P['rooms']: b['y'] = min(b['y'], P['rooms'][b['room']][1] + P['rooms'][b['room']][3] + 2 - (H + TOP))  # 아래 두둑은 방 아래 끝까지 내리고
            a['y'] = b['y'] - (H + TOP)
    for b in beds:  # 두둑 위에 걸친 다른 가구(벽 쪽 화분 등)는 두둑 위로 올림
        for o in items:
            if o is b or o['s'] == 'bedplot' or P['sprites'][o['s']].get('layer'): continue
            w, h = P['sprites'][o['s']]['w'], P['sprites'][o['s']]['h']
            if o['x'] < b['x'] + W and b['x'] < o['x'] + w and o['y'] < b['y'] + H + TOP and b['y'] < o['y'] + h: o['y'] = b['y'] - h
for plot in P['gift']:
    for room, g in P['gift'][plot].items():
        n = g.pop('bedplot2', 0) + g.pop('bedplot3', 0)
        if n: g['bedplot'] = g.get('bedplot', 0) + n
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('텃밭', bed.size, 'green own', P['gift']['green'].get('own'))
