# 방 바닥의 벽 밑 그늘(위쪽 3줄)이 옆문 쪽에서 끊긴 것을 이어 그림
# (바탕을 만들 때 옆문 자리 바닥을 다시 깔면서 그늘을 덮어씀). 그 줄의 그늘 세기로 빈 곳을 채우고 바닥 자리 표시(fmask.a)도 함께 고침
import json, base64, io, sys
import numpy as np
from PIL import Image
PACK = sys.argv[1] if len(sys.argv) > 1 else 'public/house/pack.json'
P = json.load(open(PACK, encoding='utf-8')); W = P['W']; S = np.array([50, 30, 40.])
base = np.array(Image.open(io.BytesIO(base64.b64decode(P['base'].split(',')[1]))).convert('RGBA')).astype(float)
fixed = 0
for r, m in P['fmask'].items():
    idx = np.frombuffer(base64.b64decode(m['idx']), np.uint32); a = np.frombuffer(base64.b64decode(m['a']), np.uint8).copy()
    ry = P['rooms'][r][1]
    for y in range(ry + 32, ry + 35):
        sel = np.where(idx // W == y)[0]
        if not len(sel): continue
        top = a[sel].max()
        for i in sel:
            if a[i] < top:
                p = int(idx[i]); yy, xx = divmod(p, W); s = top / 255
                base[yy, xx, :3] = base[yy, xx, :3] * (1 - s) + S * s  # 그늘이 없던 점이라 지금 색이 바닥 그대로
                a[i] = top; fixed += 1
    m['a'] = base64.b64encode(a.tobytes()).decode()
b = io.BytesIO(); Image.fromarray(base.round().clip(0, 255).astype('uint8')).save(b, 'PNG')
P['base'] = 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('채운 점', fixed)
