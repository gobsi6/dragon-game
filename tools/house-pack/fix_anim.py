# 1) 우물 지붕: 붉은 기와는 그대로 두고, 기와 사이 갈색 선을 같은 붉은 계열로
# 2) 불 들어가는 가구에 Franuka 'Animated objects'의 장면을 붙여 움직이게 (화덕·촛대·등·횃불) + 촛대 스탠드·초 새로
#    색은 원래 가구와 같은 규칙: 불꽃은 그대로, 틀·벽돌은 베이지 갈색 쪽으로 (toward_beige)
import json, base64, io, sys, colorsys
import numpy as np
from PIL import Image
ANIM = sys.argv[1] if len(sys.argv) > 1 else 'Animated objects/'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
def uri(im): b = io.BytesIO(); im.save(b, 'PNG'); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
def load(u): return Image.open(io.BytesIO(base64.b64decode(u.split(',')[1]))).convert('RGBA')
def toward_beige(im, t=0.5, k=0.72, keepfire=True):
    a = np.array(im).astype(float); H = 0.075
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y, x, 3] == 0: continue
            h, s, v = colorsys.rgb_to_hsv(*(a[y, x, :3] / 255))
            if keepfire and s > 0.55 and v > 0.8: continue
            d = ((H - h + 0.5) % 1.0) - 0.5; h = (h + d * t) % 1.0
            r, g, b = colorsys.hsv_to_rgb(h, s * k, v); a[y, x, :3] = (r * 255, g * 255, b * 255)
    return Image.fromarray(a.round().astype('uint8'))
P = json.load(open(PACK, encoding='utf-8')); P['v'] = 8
# 1) 우물
w = load(P['sprites']['well']['src']); px = w.load()
# 붉은 기와는 살리고, 기와 줄(위 6줄)의 갈색 선을 같은 붉은 계열로: 테두리 → 짙은 적갈, 기와 사이 선 → 짙은 빨강
ROOF = {(117, 73, 37): (122, 38, 42), (169, 108, 58): (176, 50, 48), (191, 118, 66): (230, 69, 57)}
for y in range(6):
    for x in range(w.width):
        c = px[x, y]
        if c[3] and c[:3] in ROOF: px[x, y] = ROOF[c[:3]] + (c[3],)
FACE = {(169, 108, 58): (198, 58, 52), (117, 73, 37): (122, 38, 42)}   # 꺾여 내려오는 지붕 앞면(6~17줄): 윗면보다 한 단계 어두운 빨강, 선은 짙은 적갈
for y in range(6, 18):
    for x in range(w.width):
        c = px[x, y]
        if c[3] and c[:3] in FACE: px[x, y] = FACE[c[:3]] + (c[3],)
P['sprites']['well']['src'] = uri(w)
# 2) 움직이는 장면
def frames(file, n, fw, fh, **kw):
    sheet = Image.open(ANIM + file).convert('RGBA')
    fr = [toward_beige(sheet.crop((i * fw, 0, i * fw + fw, fh)), **kw) for i in range(n)]
    box = None
    for f in fr:
        b = f.getbbox(); box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    return [f.crop(box) for f in fr]
def put(k, fr, name=None, extra=None):
    sp = P['sprites'].get(k, {}); sp.update({'w': fr[0].width, 'h': fr[0].height, 'src': uri(fr[0]), 'frames': [uri(f) for f in fr]})
    if name: sp['name'] = name
    if extra: sp.update(extra)
    P['sprites'][k] = sp
put('hearth', frames('Furnace.png', 4, 32, 48))
put('candle', frames('Candelabrum.png', 4, 16, 32, t=0.35, k=0.82))
put('lamp', frames('Lamp.png', 4, 16, 16))
put('torch', frames('TorchFront.png', 4, 16, 32))
put('candle_stand', frames('CandelabrumStand.png', 4, 16, 32, t=0.35, k=0.82), '촛대 스탠드')
put('taper', frames('Candle.png', 4, 16, 16, t=0.35, k=0.82), '초', {'stack': 1})
P['cat']['candle_stand'] = {'name': '촛대 스탠드', 'seals': 4, 'mats': {'sun_dust': 2, 'bog_iron': 2}, 'bp': 0, 'cat': 'light'}
P['cat']['taper'] = {'name': '초', 'seals': 1, 'mats': {'sun_dust': 1}, 'bp': 0, 'cat': 'light'}
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print({k: (P['sprites'][k]['w'], P['sprites'][k]['h'], len(P['sprites'][k]['frames'])) for k in ['hearth', 'candle', 'lamp', 'torch', 'candle_stand', 'taper']})
