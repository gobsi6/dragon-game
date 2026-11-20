# 연금술 확장의 받침 제단 두 가지 (pack.json v33). 색 넷(초록·분홍·주황·청록)은 한 가구로 셈 → 하나만 만들면 '색 바꾸기'로 고름 (귀환 주문진처럼, 청록이 기본)
# - 촛불 제단: 한 줄의 네 칸이 촛불 흔들리는 움직임 장면 → frames 4장, 0.24초
# - 룬 제단: 같은 줄 맨 오른쪽, 촛불 없는 받침대
# 그림은 팩 그대로 (나무 색 바꾸기 안 함: 짙은 자줏빛 받침이라 원목으로 바꾸면 무늬가 탁해짐)
import json, base64, io, sys
from PIL import Image
SRC = sys.argv[1] if len(sys.argv) > 1 else 'Expansion_AlchemyLab.png'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
def uri(im): b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
sheet = Image.open(SRC).convert('RGBA')
P = json.load(open(PACK, encoding='utf-8')); P['v'] = max(P['v'], 33)
ROWS = [('청록', 3), ('초록', 0), ('분홍', 1), ('주황', 2)]           # 줄: 위에서부터 초록·분홍·주황·청록 (48px 간격)
cell = lambda col, row, top: (col * 32 + 4, 304 + row * 48 + top, col * 32 + 28, 304 + row * 48 + 46)
def add(base, name, cat, seals, mats, cols, top, anim):
    ids = []
    for i, (cn, row) in enumerate(ROWS):
        vid = base if i == 0 else f'{base}_{["", "g", "p", "o"][i]}'
        fr = [sheet.crop(cell(c, row, top)) for c in cols]
        s = {'name': name if i == 0 else f'{name} ({cn})', 'w': fr[0].width, 'h': fr[0].height}
        if anim: s.update({'frames': [uri(f) for f in fr], 'ms': 240})
        else: s['src'] = uri(fr[0])
        if i: s['of'] = base
        P['sprites'][vid] = s; ids.append(vid)
    P['groups'][base] = ids; P.setdefault('groupLabel', {})[base] = '색'
    P['cat'][base] = {'name': name, 'seals': seals, 'mats': mats, 'bp': 0, 'cat': cat}
    print(base, ids, s['w'], s['h'])
add('altar_candle', '촛불 제단', 'light', 6, {'rune_stone': 3, 'sun_dust': 2, 'cave_crystal': 1}, [0, 1, 2, 3], 12, True)
add('altar_rune', '룬 제단', 'out', 5, {'rune_stone': 3, 'cave_crystal': 1}, [5], 17, False)
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
