# 실내 팩에서 고른 가구·소품 더 넣기 (pack.json v9)
# 나무 부분(붉은 보랏빛, 채도 낮음)만 원목 갈색으로 바꾸고, 빨간 방석·산딸기·보랏빛 병처럼 진한 색은 그대로. 깔개는 원래 색
import json, base64, io, sys, colorsys
import numpy as np
from PIL import Image
MAIN = sys.argv[1] if len(sys.argv) > 1 else 'Fantasy RPG Interior Pack (16x16 grid).png'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
sheet = Image.open(MAIN).convert('RGBA')
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
def cut(box, keep=False): t = sheet.crop(box); t = t.crop(t.getbbox()); return t if keep else wood(t)
P = json.load(open(PACK, encoding='utf-8')); P['v'] = 9
ITEMS = [  # id, 이름, 자르기, 분류, 인장, 재료, 더할 것
    ('pot_flower', '노란 꽃 화분', (339, 210, 349, 222), 'green', 2, {'red_clay': 1, 'shroom_spore': 1}, {'stack': 1}),
    ('keg', '눕힌 술통', (417, 215, 431, 234), 'kitchen', 4, {'living_bark': 3, 'bog_iron': 1}, {}),
    ('berry_bucket', '산딸기 바구니', (322, 225, 334, 239), 'kitchen', 2, {'living_bark': 1}, {'stack': 1}),
    ('bucket', '나무 들통', (386, 226, 398, 239), 'kitchen', 2, {'living_bark': 2}, {}),
    ('mug', '찻잔', (324, 260, 334, 271), 'kitchen', 1, {'red_clay': 1}, {'stack': 1}),
    ('tankard', '맥주잔', (340, 260, 350, 271), 'kitchen', 1, {'living_bark': 1}, {'stack': 1}),
    ('mortar', '약초 절구', (356, 262, 365, 271), 'kitchen', 2, {'rune_stone': 1}, {'stack': 1}),
    ('plate', '접시', (355, 276, 364, 285), 'kitchen', 1, {'red_clay': 1}, {'stack': 1}),
    ('plate_s', '작은 접시', (324, 278, 331, 285), 'kitchen', 1, {'red_clay': 1}, {'stack': 1, 'of': 'plate'}),
    ('plate_b', '접시 (세운)', (341, 276, 347, 284), 'kitchen', 1, {'red_clay': 1}, {'stack': 1, 'of': 'plate'}),
    ('dishes', '그릇 더미', (339, 306, 349, 320), 'kitchen', 2, {'red_clay': 2}, {'stack': 1}),
    ('dishes_s', '그릇 더미 (낮은)', (339, 294, 349, 304), 'kitchen', 2, {'red_clay': 2}, {'stack': 1, 'of': 'dishes'}),
    ('potion', '보랏빛 병', (421, 257, 427, 269), 'kitchen', 2, {'cave_crystal': 1}, {'stack': 1}),
    ('herbs', '말린 약초 걸이', (390, 292, 409, 304), 'kitchen', 3, {'living_bark': 1, 'glow_moss': 2}, {'layer': 'wall'}),
    ('broom', '빗자루', (420, 288, 429, 313), 'kitchen', 2, {'living_bark': 2}, {}),
    ('cab_small', '작은 수납장', (240, 336, 256, 352), 'store', 3, {'living_bark': 2}, {}),
    ('counter_s', '짧은 진열대', (48, 370, 64, 400), 'kitchen', 3, {'rune_stone': 2}, {}),
    ('quill', '깃펜', (374, 369, 382, 382), 'study', 1, {'old_scroll': 1}, {'stack': 1}),
    ('scroll', '두루마리', (370, 388, 381, 396), 'study', 1, {'old_scroll': 1}, {'stack': 1}),
    ('coins', '금화 몇 닢', (385, 390, 398, 399), 'store', 3, {'gold_ore': 1}, {'stack': 1}),
    ('firewood', '장작 더미', (416, 363, 431, 378), 'kitchen', 2, {'living_bark': 3}, {}),
]
for vid, name, box, cat, seals, mats, extra in ITEMS:
    sp = cut(box)
    P['sprites'][vid] = {'name': name, 'w': sp.width, 'h': sp.height, 'src': uri(sp), **{k: v for k, v in extra.items()}}
    if 'of' not in extra: P['cat'][vid] = {'name': name, 'seals': seals, 'mats': mats, 'bp': 0, 'cat': cat}
P['groups']['plate'] = ['plate', 'plate_s', 'plate_b']; P['groupLabel']['plate'] = '모양'
P['groups']['dishes'] = ['dishes', 'dishes_s']; P['groupLabel']['dishes'] = '모양'
# 붉은 방석 의자: 앞 · 뒤 · 옆
for i, (vid, box) in enumerate((('chair_red', (194, 352, 206, 366)), ('chair_red_back', (210, 352, 222, 366)), ('chair_red_side', (226, 352, 237, 366)))):
    sp = cut(box); P['sprites'][vid] = {'name': '붉은 방석 의자' + ('', ' (뒤)', ' (옆)')[i], 'w': sp.width, 'h': sp.height, 'src': uri(sp)}
    if i: P['sprites'][vid]['of'] = 'chair_red'
P['groups']['chair_red'] = ['chair_red', 'chair_red_back', 'chair_red_side']
P['cat']['chair_red'] = {'name': '붉은 방석 의자', 'seals': 4, 'mats': {'living_bark': 2, 'faded_cloth': 1}, 'bp': 0, 'cat': 'live'}
# 깔개 색: 지금 깔개(긴 빨강)에 네모 깔개 빨강·파랑·주황·청록을 '색'으로 묶음 (원래 색 그대로)
for vid, box, nm in (('rug_red', (2, 466, 46, 510), '네모 빨강'), ('rug_blue', (50, 466, 94, 510), '파랑'), ('rug_orange', (98, 466, 142, 510), '주황'), ('rug_teal', (242, 466, 286, 510), '청록')):
    sp = cut(box, keep=True); P['sprites'][vid] = {'name': f'깔개 ({nm})', 'w': sp.width, 'h': sp.height, 'src': uri(sp), 'layer': 'flat', 'of': 'rug'}
P['groups']['rug'] = ['rug', 'rug_red', 'rug_blue', 'rug_orange', 'rug_teal']; P['groupLabel']['rug'] = '색'
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', len(P['sprites']), len(P['cat']))
