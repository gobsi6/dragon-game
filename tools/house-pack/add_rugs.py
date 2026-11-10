# 깔개 정리 (pack.json v11)
# - 긴 깔개(rug): 다듬은 긴 붉은 깔개(src/rug_long.png)를 기준으로, 팩 네모 깔개 여섯 색의 색 대응표대로 다시 칠해 색 여섯
# - 네모 깔개(rug_red): 팩 네모 깔개 여섯 색 그대로 (rug_red · rug_blue · rug_orange · rug_green · rug_magenta · rug_teal)
import json, base64, io, sys
from collections import defaultdict, Counter
from PIL import Image
MAIN = sys.argv[1] if len(sys.argv) > 1 else 'Fantasy RPG Interior Pack (16x16 grid).png'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
LONG = sys.argv[3] if len(sys.argv) > 3 else 'tools/house-pack/src/rug_long.png'
S = Image.open(MAIN).convert('RGBA'); L = Image.open(LONG).convert('RGBA'); L = L.crop(L.getbbox())
def uri(im): b = io.BytesIO(); im.save(b, 'PNG'); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
SQ = [('red', '빨강', (2, 466, 46, 510)), ('blue', '파랑', (50, 466, 94, 510)), ('orange', '주황', (98, 466, 142, 510)),
      ('green', '초록', (146, 466, 190, 510)), ('magenta', '자홍', (194, 466, 238, 510)), ('teal', '청록', (242, 466, 286, 510))]
red = S.crop(SQ[0][2])
P = json.load(open(PACK, encoding='utf-8')); P['v'] = 11; P.setdefault('groupLabel', {})
for k in [k for k, s in P['sprites'].items() if s.get('of') == 'rug']: del P['sprites'][k]   # 예전 묶음(긴 빨강 + 네모 넷)을 지우고 다시
long_ids, sq_ids = [], []
for i, (cid, nm, box) in enumerate(SQ):
    sq = S.crop(box); sq = sq.crop(sq.getbbox())
    m = defaultdict(Counter)
    for y in range(44):
        for x in range(44):
            a = red.getpixel((x, y))
            if a[3]: m[a][S.crop(box).getpixel((x, y))] += 1
    mp = {a: c.most_common(1)[0][0] for a, c in m.items()}
    lg = L.copy(); px = lg.load()
    for y in range(lg.height):
        for x in range(lg.width):
            if px[x, y][3] and px[x, y] in mp: px[x, y] = mp[px[x, y]]
    lid = 'rug' if i == 0 else f'rug_long_{cid}'; sid = f'rug_{cid}'
    P['sprites'][lid] = {'name': '긴 깔개' + (f' ({nm})' if i else ''), 'w': lg.width, 'h': lg.height, 'src': uri(lg), 'layer': 'flat', **({'of': 'rug'} if i else {})}
    P['sprites'][sid] = {'name': '네모 깔개' + (f' ({nm})' if i else ''), 'w': sq.width, 'h': sq.height, 'src': uri(sq), 'layer': 'flat', **({'of': 'rug_red'} if i else {})}
    long_ids.append(lid); sq_ids.append(sid)
P['groups']['rug'] = long_ids; P['groupLabel']['rug'] = '색'
P['groups']['rug_red'] = sq_ids; P['groupLabel']['rug_red'] = '색'
P['cat']['rug']['name'] = '긴 깔개'
P['cat']['rug_red'] = {'name': '네모 깔개', 'seals': 8, 'mats': {'faded_cloth': 8}, 'bp': 0, 'cat': 'live'}
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', long_ids, sq_ids)
