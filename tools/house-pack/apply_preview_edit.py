# 직접 고친 집터 미리보기(src/house_preview_edit.png, 바탕+앞쪽 벽을 겹친 320×240)를 pack.json에 반영
# 지금 그림과 다른 점만 찾아서: 그 자리에 앞쪽 벽 층이 있으면 앞쪽 벽 층과 바탕 둘 다, 없으면 바탕만 고침. 고친 자리는 바닥 자리 표시에서 뺌
import json, base64, io, sys
import numpy as np
from PIL import Image
EDIT = sys.argv[1] if len(sys.argv) > 1 else 'tools/house-pack/src/house_preview_edit.png'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
P = json.load(open(PACK, encoding='utf-8')); W = P['W']
load = lambda u: Image.open(io.BytesIO(base64.b64decode(u.split(',')[1]))).convert('RGBA')
def uri(im): b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
base, front = load(P['base']), load(P['front']); cur = base.copy(); cur.alpha_composite(front)
edit = Image.open(EDIT).convert('RGBA')
A, E, F = np.array(cur), np.array(edit), np.array(front)
ys, xs = np.where(np.any(A != E, axis=2)); changed = set()
for y, x in zip(ys.tolist(), xs.tolist()):
    c = tuple(int(v) for v in E[y, x])
    if F[y, x, 3] > 0: front.putpixel((x, y), c)
    base.putpixel((x, y), c); changed.add(y * W + x)
P['base'], P['front'] = uri(base), uri(front)
for r, m in P['fmask'].items():
    idx = np.frombuffer(base64.b64decode(m['idx']), np.uint32); a = np.frombuffer(base64.b64decode(m['a']), np.uint8)
    keep = np.array([i not in changed for i in idx.tolist()], bool)
    if not keep.all(): m['idx'] = base64.b64encode(idx[keep].astype(np.uint32).tobytes()).decode(); m['a'] = base64.b64encode(a[keep].tobytes()).decode(); m['n'] = int(keep.sum())
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('고친 점', len(changed))
