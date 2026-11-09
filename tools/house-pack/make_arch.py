# 덩굴 아치: 직접 그려 온 꽃장식 덩굴 아치(src/arch_src.png, 60×60)를 게임용으로
# 회색 바닥 그림자는 팩 가구 그림자(반투명 회청색)로 바꾸고, 빈 둘레를 잘라냄
import sys
from PIL import Image
SRC = sys.argv[1] if len(sys.argv) > 1 else 'tools/house-pack/src/arch_src.png'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'tools/house-pack/src/arch.png'
im = Image.open(SRC).convert('RGBA'); px = im.load()
SHADOW = (170, 175, 180)
for y in range(im.height):
    for x in range(im.width):
        if px[x, y][3] and px[x, y][:3] == SHADOW: px[x, y] = (40, 53, 64, 100)
im = im.crop(im.getbbox()); im.save(OUT); print(im.size)
