# 귀환 주문진 색 세 가지 더 (연금술 확장의 초록·분홍·주황 주문진 48×48). 청록(warp_circle)과 같은 가구로 셈(of) → 하나만 만들면 '색 바꾸기'로 마음대로 고름. pack.json v32
import json, base64, io, sys
from PIL import Image
SRC = sys.argv[1] if len(sys.argv) > 1 else 'Expansion_AlchemyLab.png'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
def uri(im): b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
img = Image.open(SRC).convert('RGBA')
P = json.load(open(PACK, encoding='utf-8')); P['v'] = max(P['v'], 32)
base = P['sprites']['warp_circle']
for key, nm, box in [('warp_circle_g', '초록', (192, 320)), ('warp_circle_p', '분홍', (240, 320)), ('warp_circle_o', '주황', (192, 368))]:
    sp = img.crop((box[0], box[1], box[0] + 48, box[1] + 48)); sp = sp.crop(sp.getbbox())
    P['sprites'][key] = {'name': f'귀환 주문진 ({nm})', 'w': sp.width, 'h': sp.height, 'src': uri(sp), 'layer': 'flat', 'under': 1, 'of': 'warp_circle'}
    print(key, sp.size, '(청록', base['w'], base['h'], ')')
P['sprites']['warp_circle']['name'] = '귀환 주문진'   # 청록이 기본
P['groups']['warp_circle'] = ['warp_circle', 'warp_circle_g', 'warp_circle_p', 'warp_circle_o']
P.setdefault('groupLabel', {})['warp_circle'] = '색'   # 놓을 때·놓은 뒤 '색 바꾸기'
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
