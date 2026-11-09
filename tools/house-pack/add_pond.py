# 작은 연못: tools/house-pack/src/pond.png (성 팩 Moat 타일을 바탕으로 직접 다듬은 연못)을 pack.json에 넣음 (v2)
# 물 위에 떠 있는 것(연잎·물결)은 좌우로 1도트씩 천천히 흔들리게 장면 12장을 만든다. 돌 테두리와 물은 그대로
# 샘가 집 고유 칸 기본 배치를 연못으로 바꾼 뒤 기본 가구 수를 다시 셈
import json, base64, io, sys
from PIL import Image
SRC = sys.argv[1] if len(sys.argv) > 1 else 'tools/house-pack/src/pond.png'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
WATER = (79, 164, 184, 255)
pond = Image.open(SRC).convert('RGBA'); W, H = pond.size; px = pond.load()
# 돌 테두리 대비 낮추기: 물빛(파랑·청록이 짙은 색)이 아닌 돌 색만, 돌 평균 색 쪽으로 ROCK배 (1이면 그대로)
ROCK = 0.72
isrock = lambda c: c[3] and not (c[2] > c[0] + 25 and c[2] >= c[1] - 60) and not c[1] > c[0] + 20  # 물빛·연잎(초록) 빼고
rocks = [(x, y) for y in range(H) for x in range(W) if isrock(px[x, y])]
if rocks and ROCK != 1:
    mean = [sum(px[x, y][i] for x, y in rocks) / len(rocks) for i in range(3)]
    for (x, y) in rocks:
        c = px[x, y]
        px[x, y] = tuple(int(round(mean[i] + (c[i] - mean[i]) * ROCK)) for i in range(3)) + (c[3],)
# 물가의 짙은 남색(돌 밑 그늘·깊은 물가)을 물빛 쪽으로 NAVY만큼 옅게
NAVY = 0.3
for y in range(H):
    for x in range(W):
        c = px[x, y]
        if c[:3] in ((58, 63, 94), (76, 104, 133)): px[x, y] = tuple(int(round(c[i] + (WATER[i] - c[i]) * NAVY)) for i in range(3)) + (c[3],)
# 물 위에 떠 있는 것 찾기: 물빛이 아닌 점들을 이웃끼리 묶어서, 그림 가장자리(돌 테두리)에 닿지 않고 둘레가 모두 물인 작은 덩어리
seen, objs = set(), []
for y in range(H):
    for x in range(W):
        if (x, y) in seen or px[x, y] == WATER or px[x, y][3] == 0: continue
        st, comp, edge = [(x, y)], [], False; seen.add((x, y))
        while st:
            a, b = st.pop(); comp.append((a, b))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    u, v = a + dx, b + dy
                    if not (0 <= u < W and 0 <= v < H): edge = True; continue
                    if (u, v) in seen or px[u, v] == WATER: continue
                    if px[u, v][3] == 0: edge = True; continue
                    seen.add((u, v)); st.append((u, v))
        if not edge and len(comp) < 60: objs.append(comp)
base = pond.copy(); bp = base.load()
for comp in objs:
    for (x, y) in comp: bp[x, y] = WATER
# 장면: 0 → +1 → 0 → −1 로 (한 자리에 3장씩, 12장 ≈ 2초). 물결(작은 점)은 모두 함께 같은 쪽으로 흔들리고,
# 연잎은 물결보다 조금 늦게 따라 움직임 (연잎끼리는 같이)
STEP = [0, 0, 0, 1, 1, 1, 0, 0, 0, -1, -1, -1]
LAG = lambda comp: 2 if len(comp) > 6 else 0
SHIFT = 1  # 물결·연잎의 기본 자리를 원본보다 오른쪽으로 1도트
frames = []
for f in range(len(STEP)):
    im = base.copy(); ip = im.load()
    for k, comp in enumerate(objs):
        dx = SHIFT + STEP[(f - LAG(comp)) % len(STEP)]
        for (x, y) in comp:
            u = x + dx
            if 0 <= u < W and bp[u, y] == WATER: ip[u, y] = px[x, y]
    frames.append(im)
def uri(im):
    b = io.BytesIO(); im.save(b, 'PNG'); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
P = json.load(open(PACK, encoding='utf-8'))
P['v'] = 3  # 3: 먼저 올린 판에서 분수로 바뀐 연못을 돌려줌 (city.js packMigrate)
P['sprites']['pond'] = {'name': '작은 연못', 'w': W, 'h': H, 'src': uri(frames[0]), 'frames': [uri(f) for f in frames]}
P['cat']['pond'] = {'name': '작은 연못', 'seals': 15, 'mats': {'sea_shell': 8, 'cave_crystal': 4}, 'bp': 60, 'cat': 'out'}
own = [o for o in P['defaults']['spring'] if o['room'] == 'own' and o['s'] not in ('fountain', 'pond')]
rest = [o for o in P['defaults']['spring'] if o['room'] != 'own']
OX, OY, OW, OH = P['rooms']['own']
own.append({'s': 'pond', 'x': OX + (OW - W) // 2, 'y': OY + 33, 'room': 'own'})
P['defaults']['spring'] = rest + own
gift = {}
for it in P['defaults']['spring']:
    b_ = P['sprites'][it['s']].get('of', it['s']); g = gift.setdefault(it['room'], {}); g[b_] = g.get(b_, 0) + 1
P['gift']['spring'] = gift
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('연못', (W, H), '떠 있는 것', len(objs), [len(c) for c in objs])
if len(sys.argv) > 3:  # 확인용 움직이는 그림
    big = [Image.alpha_composite(Image.new('RGBA', (W, H), (237, 227, 208, 255)), f).resize((W * 8, H * 8), Image.NEAREST) for f in frames]
    big[0].save(sys.argv[3], save_all=True, append_images=big[1:], duration=160, loop=0)
