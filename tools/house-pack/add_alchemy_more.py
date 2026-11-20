# 연금술 확장에서 더 (pack.json v34). 그림은 팩 그대로, 갈색 나무(작업대·긴 탁자·약병 받침·모래시계)만 기존 규칙으로 붉은기를 뺌. 한 줄에 같은 모양이 네 칸 이어진 것은 움직임 장면(frames, 0.24초)
# 색·모양만 다른 것은 한 가구로 셈(of + groups) → 하나만 만들면 꾸미기에서 '색/모양 바꾸기'로 고름
import json, base64, io, sys, colorsys
import numpy as np
from PIL import Image
SRC = sys.argv[1] if len(sys.argv) > 1 else 'Expansion_AlchemyLab.png'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
sheet = Image.open(SRC).convert('RGBA')
def wood(im):   # 나무 색 기존 규칙 (add_bedroom.py와 같음): 붉은 보랏빛이고 채도 낮은 부분만 원목 갈색(베이지 쪽)으로
    a = np.array(im).astype(float)
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y, x, 3] == 0: continue
            h, s, v = colorsys.rgb_to_hsv(*(a[y, x, :3] / 255))
            if (h >= 0.8 or h <= 0.06) and s < 0.5:
                r, g, b = colorsys.hsv_to_rgb(0.075, min(1, s * 0.9), v * 0.98); a[y, x, :3] = (r * 255, g * 255, b * 255)
    return Image.fromarray(a.round().astype('uint8'))
def W(fr): return [wood(f) for f in fr]
def uri(im): b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
def union(boxes):   # 움직임 장면은 네 칸을 같은 크기로 (칸마다 그림이 있는 곳을 모두 덮는 상자)
    bb = None
    for (x0, y0, x1, y1) in boxes:
        b = sheet.crop((x0, y0, x1, y1)).getbbox(); b = (b[0], b[1], b[2], b[3])
        bb = b if bb is None else (min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3]))
    return [sheet.crop((x0 + bb[0], y0 + bb[1], x0 + bb[2], y0 + bb[3])) for (x0, y0, x1, y1) in boxes]
def one(box): t = sheet.crop(box); return t.crop(t.getbbox())
P = json.load(open(PACK, encoding='utf-8')); P['v'] = max(P['v'], 34); GL = P.setdefault('groupLabel', {})
def sprite(k, name, fr, extra=None, of=None):
    s = {'name': name, 'w': fr[0].width, 'h': fr[0].height, **(extra or {})}
    if len(fr) > 1: s.update({'frames': [uri(f) for f in fr], 'ms': 240})
    else: s['src'] = uri(fr[0])
    if of: s['of'] = of
    P['sprites'][k] = s
def furn(base, name, cat, seals, mats, looks, label, extra=None):   # looks: [(접미, 이름 덧말, 그림들)]
    ids = []
    for i, (suf, sub, fr) in enumerate(looks):
        k = base if i == 0 else f'{base}_{suf}'
        sprite(k, name if i == 0 else f'{name} ({sub})', fr, extra, None if i == 0 else base); ids.append(k)
    if len(ids) > 1: P['groups'][base] = ids; GL[base] = label
    P['cat'][base] = {'name': name, 'seals': seals, 'mats': mats, 'bp': 0, 'cat': cat}
    print(base, [(k, P['sprites'][k]['w'], P['sprites'][k]['h'], len(P['sprites'][k].get('frames') or [1])) for k in ids])
COL4 = [('', '청록', 3), ('g', '초록', 0), ('p', '분홍', 1), ('o', '주황', 2)]   # 위에서부터 초록·분홍·주황·청록 줄 → 청록을 기본으로 (주문진·제단과 같게)
# 연금 솥: 색마다 한 줄 네 칸이 끓는 장면
furn('cauldron', '연금 솥', 'work', 8, {'bog_iron': 3, 'cave_crystal': 2, 'sun_dust': 1},
     [(s, c, union([(96 + i * 16, 64 + r * 16, 112 + i * 16, 80 + r * 16) for i in range(4)])) for s, c, r in COL4], '색')
# 긴 약병: 여섯 색 (그림 그대로)
furn('potion_tall', '긴 약병', 'kitchen', 2, {'cave_crystal': 1},
     [(s, c, [one((x, y, x + 16, y + 16))]) for s, c, x, y in [('', '초록', 208, 64), ('p', '분홍', 224, 64), ('r', '빨강', 240, 64), ('o', '주황', 208, 80), ('t', '청록', 224, 80), ('w', '흰', 240, 80)]], '색', {'stack': 1})
# 약병 받침: 모양 셋
furn('potion_tray', '약병 받침', 'kitchen', 3, {'cave_crystal': 1, 'living_bark': 1},
     [(s, c, W([one((x, 128, x + 16, 150))])) for s, c, x in [('', '분홍 약병', 64), ('r', '붉은 약병', 80), ('b', '파란 약병', 96)]], '모양', {'stack': 1})
# 연금술 작업대: 갈색·파랑, 한 줄 네 칸이 움직이는 장면 (촛불·끓는 불)
furn('alch_bench', '연금술 작업대', 'work', 12, {'living_bark': 5, 'cave_crystal': 2, 'sun_dust': 2},
     [(s, c, (W if s == '' else list)(union([(i * 48, y, i * 48 + 48, y + 44) for i in range(4)]))) for s, c, y in [('', '갈색', 164), ('b', '파랑', 212)]], '색')   # 44: 아래 줄(진열장 꼭대기, y 256~)이 섞이지 않게
# 약병 놓인 긴 탁자: 갈색(약병) · 파랑(단지) · 파랑 빈 탁자
furn('alch_table', '약병 놓인 긴 탁자', 'work', 8, {'living_bark': 4, 'cave_crystal': 1},
     [(s, c, (W if s == '' else list)([one((x, y, x + 48, y + 44))])) for s, c, x, y in [('', '갈색', 192, 164), ('b', '파랑, 단지', 192, 212), ('e', '파랑, 빈 탁자', 240, 212)]], '모양')
# 마법 등불 초록·분홍 (노랑·파랑은 이미 있음과 같은 그림): 앞·옆을 '방향'으로, 네 칸 움직임
for cid, col, row in (('g', '초록', 0), ('p', '분홍', 2)):
    base = f'lantern_{cid}'
    front = union([(288 + i * 16, 208 + row * 16, 304 + i * 16, 224 + row * 16) for i in range(4)])
    side = union([(288 + i * 16, 224 + row * 16, 304 + i * 16, 240 + row * 16) for i in range(4)])
    sprite(base, f'마법 등불 ({col})', front, {'stack': 1}); sprite(base + '_side', f'마법 등불 ({col}, 옆)', side, {'stack': 1}, base)
    P['groups'][base] = [base, base + '_side']
    P['cat'][base] = {'name': f'마법 등불 ({col})', 'seals': 5, 'mats': {'cave_crystal': 2, 'sun_dust': 1}, 'bp': 0, 'cat': 'light'}
    print(base, front[0].size, side[0].size, len(front))
# 약병 진열장 (파랑)
furn('potion_shelf', '약병 진열장', 'store', 7, {'living_bark': 3, 'cave_crystal': 2}, [('', '', [one((64, 256, 96, 304))])], '')
# 모래시계
furn('hourglass', '모래시계', 'live', 3, {'sun_dust': 1, 'cave_crystal': 1}, [('', '', W([one((210, 464, 222, 482))]))], '', {'stack': 1})
# 새김 받침대: 파란 받침대 네 모양을 더함 (모양이 같은 그림)
ids = ['lectern']
for i, sub in enumerate(['파랑, 마법서', '파랑, 펼친 책', '파랑, 책 한 권', '파랑, 빈 받침']):
    k = f'lectern_b{i}'; sprite(k, f'새김 받침대 ({sub})', [one((288 + i * 16, 432, 304 + i * 16, 464))], None, 'lectern'); ids.append(k)
# 나무 받침대(이미 있는 '새김 받침대' = 맨 윗줄 마법서, 나무 규칙으로 바꾼 것)의 나머지 세 모양도 같은 규칙으로
for i, sub in enumerate(['펼친 책', '책 한 권', '빈 받침'], 1):
    k = f'lectern_w{i}'; sprite(k, f'새김 받침대 ({sub})', W([one((288 + i * 16, 368, 304 + i * 16, 400))]), None, 'lectern'); ids.append(k)
P['groups']['lectern'] = ids; GL['lectern'] = '모양'
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
