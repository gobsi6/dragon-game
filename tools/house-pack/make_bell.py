# 작은 종: 종 받침대(src/bellstand.png)의 종을 은색으로 바꾸고 나무 손잡이를 달아 손종으로. 탁자 위에도 올릴 수 있음
import sys
from PIL import Image
SRC = sys.argv[1] if len(sys.argv) > 1 else 'tools/house-pack/src/bellstand.png'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'tools/house-pack/src/bell.png'
bs = Image.open(SRC).convert('RGBA')
bell = bs.crop((5, 5, 15, 15))                      # 종 몸통 (고리 아래부터) 10×10
# 은종: 놋쇠 색을 은색으로 (밝은 면 · 몸통 · 그늘 · 반짝임)
SILVER = {(232, 176, 84): (176, 184, 196), (196, 132, 58): (128, 136, 152), (140, 88, 48): (84, 90, 106), (250, 222, 150): (226, 230, 238)}  # 조금 진한 은색
bp_ = bell.load()
for y in range(bell.height):
    for x in range(bell.width):
        c = bp_[x, y]
        if c[3] and c[:3] in SILVER: bp_[x, y] = SILVER[c[:3]] + (c[3],)
O, W, L = (82, 51, 63, 255), (150, 110, 80, 255), (186, 146, 108, 255)
out = Image.new('RGBA', (10, 15), (0, 0, 0, 0)); px = out.load()   # 그림자 없음
# 나무 손잡이: 둥근 머리 + 자루
for x, c in ((4, O), (5, O)): px[x, 0] = c
for x, c in ((3, O), (4, L), (5, W), (6, O)): px[x, 1] = c
for x, c in ((3, O), (4, W), (5, W), (6, O)): px[x, 2] = c
for x, c in ((4, O), (5, O)): px[x, 3] = c
for y in (4,):
    for x, c in ((4, W), (5, O)): px[x, y] = c
out.alpha_composite(bell, (0, 5))
out.save(OUT); print(out.size)
