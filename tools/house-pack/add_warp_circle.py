# 귀환 주문진(연금술 확장의 청록 주문진 48×48): 바닥에 납작하게. 내 집터에 놓아 두면 '고대도시로 날아가기'가 생김 (city.js warpTo). 도면 80. pack.json v26
import json, base64, io, sys
from PIL import Image
SRC = sys.argv[1] if len(sys.argv) > 1 else 'Expansion_AlchemyLab.png'
PACK = sys.argv[2] if len(sys.argv) > 2 else 'public/house/pack.json'
def uri(im): b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
sp = Image.open(SRC).convert('RGBA').crop((240, 368, 288, 416)); sp = sp.crop(sp.getbbox())
P = json.load(open(PACK, encoding='utf-8')); P['v'] = max(P['v'], 26)
P['sprites']['warp_circle'] = {'name': '귀환 주문진', 'w': sp.width, 'h': sp.height, 'src': uri(sp), 'layer': 'flat', 'under': 1}   # under: 깔개보다도 아래에 그림
P['cat']['warp_circle'] = {'name': '귀환 주문진', 'seals': 12, 'mats': {'cave_crystal': 4, 'rune_stone': 6, 'ancient_relic': 1}, 'bp': 80, 'cat': 'out'}
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', sp.size)
