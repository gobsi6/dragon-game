# 그림 팩 용량 줄이기 (무손실): 모든 그림을 다시 PNG로 압축. 색이 256개 이하면 팔레트 PNG로.
# 다시 풀어 원래 점과 하나도 다르지 않을 때만 바꾸고, 더 작아질 때만 바꿈. 가구 도구들을 다 돌린 뒤 마지막에 한 번
import json, base64, io, sys
import numpy as np
from PIL import Image
PACK = sys.argv[1] if len(sys.argv) > 1 else 'public/house/pack.json'
def enc(im):
    out = []
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True); out.append(b.getvalue())
    cols = im.getcolors(256)
    if cols:
        q = im.quantize(colors=len(cols), method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        if np.array_equal(np.array(q.convert('RGBA')), np.array(im)): b = io.BytesIO(); q.save(b, 'PNG', optimize=True); out.append(b.getvalue())
    return 'data:image/png;base64,' + base64.b64encode(min(out, key=len)).decode()
def opt(u):
    im = Image.open(io.BytesIO(base64.b64decode(u.split(',')[1]))).convert('RGBA'); n = enc(im)
    same = np.array_equal(np.array(Image.open(io.BytesIO(base64.b64decode(n.split(',')[1]))).convert('RGBA')), np.array(im))
    return n if same and len(n) < len(u) else u
P = json.load(open(PACK, encoding='utf-8')); before = len(json.dumps(P, ensure_ascii=False, separators=(',', ':')))
for s in P['sprites'].values():
    if 'src' in s: s['src'] = opt(s['src'])
    if 'frames' in s: s['frames'] = [opt(f) for f in s['frames']]
for k in ('base', 'front', 'cobble'):
    if isinstance(P.get(k), str) and P[k].startswith('data:image'): P[k] = opt(P[k])
for f in P.get('floors', []):
    if 'src' in f: f['src'] = opt(f['src'])
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', before, '->', len(json.dumps(P, ensure_ascii=False, separators=(',', ':'))))
