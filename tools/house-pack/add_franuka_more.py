# Franuka 확장에서 고른 것 더 넣기 (pack.json v31): 칠판(학교, 벽) · 풀무 · 쪽지(공방) · 류트 하늘·주황(음악) · 기둥 침대(침실)
# 침대 나무만 원목 갈색으로(붉은 보랏빛이고 채도 낮은 부분), 칠판·풀무·류트는 원래 색, 쪽지는 베이지로
# id는 처음 붙인 그대로(rug_star = 칠판, wizard_hat = 풀무)
# 쓰는 법: python3 add_franuka_more.py <1x 폴더> [pack.json]  그다음 order_cat.py
import json, base64, io, sys, colorsys, os
import numpy as np
from PIL import Image
D = sys.argv[1] if len(sys.argv) > 1 else '.'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
def sheet(n): return Image.open(os.path.join(D, n)).convert('RGBA')
def uri(im): b = io.BytesIO(); im.save(b, 'PNG'); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
def wood(im):
    a = np.array(im).astype(float)
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y, x, 3] == 0: continue
            h, s, v = colorsys.rgb_to_hsv(*(a[y, x, :3] / 255))
            if (h >= 0.8 or h <= 0.06) and s < 0.5:
                r, g, b = colorsys.hsv_to_rgb(0.075, min(1, s * 0.9), v * 0.98); a[y, x, :3] = (r * 255, g * 255, b * 255)
    return Image.fromarray(a.round().astype('uint8'))
def recolor(im, table):  # 정한 색을 바꿀 색으로 (점 하나하나 그대로)
    a = np.array(im); out = a.copy()
    for src, dst in table.items(): m = (a[:, :, :3] == src).all(axis=2) & (a[:, :, 3] > 0); out[m, :3] = dst
    return Image.fromarray(out)
def cut(sh, box, keep=True): t = sheet(sh).crop(box); t = t.crop(t.getbbox()); return t if keep else wood(t)
P = json.load(open(PACK, encoding='utf-8')); P['v'] = 31; 
def add(vid, name, sp, cat, seals, mats, extra=None, of=None):
    P['sprites'][vid] = {'name': name, 'w': sp.width, 'h': sp.height, 'src': uri(sp), **(extra or {})}
    if of: P['sprites'][vid]['of'] = of
    else: P['cat'][vid] = {'name': name, 'seals': seals, 'mats': mats, 'bp': 0, 'cat': cat}
add('rug_star', '칠판', cut('Expansion_School.png', (210, 36, 254, 58)), 'wall', 8, {'living_bark': 3, 'rune_stone': 2}, {'layer': 'wall'})
add('wizard_hat', '풀무', cut('Expansion_Workshop.png', (53, 94, 76, 111)), 'work', 4, {'beast_hide': 2, 'living_bark': 2})
# 쪽지: 복숭앗빛 종이를 베이지로 (바탕 · 글씨 자국)
add('memo', '쪽지', recolor(cut('Expansion_Workshop.png', (100, 101, 106, 108)), {(255, 194, 161): (236, 223, 198), (208, 156, 142): (184, 163, 134)}), 'study', 1, {'old_scroll': 1}, {'stack': 1})
# 쪽지는 벽에도 붙임: 같은 그림을 벽 장식 층으로 한 장 더(memo_wall, 같은 가구로 셈). 놓을 때 '놓는 곳 바꾸기'로 탁자 위 ↔ 벽
P['sprites']['memo_wall'] = {**P['sprites']['memo'], 'name': '쪽지 (벽)', 'layer': 'wall', 'of': 'memo'}; P['sprites']['memo_wall'].pop('stack', None)
P['groups']['memo'] = ['memo', 'memo_wall']; P.setdefault('groupLabel', {})['memo'] = '놓는 곳'
# 류트: 색마다 따로 사는 가구 (v13부터의 규칙: '색유리 창 (하늘)'처럼). 목록에서는 order_cat.py가 이름 '류트'끼리 한데 모음
add('lute', '류트 (하늘)', cut('Expansion_Music.png', (275, 64, 285, 80)), 'live', 4, {'living_bark': 2, 'beast_hide': 1})
add('lute_orange', '류트 (주황)', cut('Expansion_Music.png', (291, 64, 301, 80)), 'live', 4, {'living_bark': 2, 'beast_hide': 1})
# 기둥 침대: 원목 갈색으로 바꾼 뒤 남는 주홍·붉은 점(채도가 높아 wood()가 건너뜀)을 1인용 침대의 나무 색으로
add('bed_post', '기둥 침대', recolor(cut('Expansion_Bedroom.png', (8, 259, 40, 296), keep=False), {(125, 56, 51): (122, 86, 57), (207, 117, 43): (185, 141, 104)}), 'live', 12, {'living_bark': 4, 'faded_cloth': 4, 'wolf_pelt': 2})
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', {k: (P['sprites'][k]['w'], P['sprites'][k]['h']) for k in ['rug_star', 'wizard_hat', 'memo', 'lute', 'lute_orange', 'bed_post']})
