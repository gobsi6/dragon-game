# 덩굴 아치: 직접 그려 온 꽃장식 덩굴 아치(src/arch_src.png, 60×58)를 게임용으로
# 1) 색 정돈: 32가지로 흩어진 색을 다른 팩 가구와 같은 색 묶음으로 모음
#    잎 초록 4단계(화분·덤불과 같음) · 나무 4단계(원본의 분홍빛 밝은 나무) · 꽃 흰색 2단계 + 꽃술 노랑 · 외곽선 1가지
# 2) 회색 바닥 그림자는 팩 가구 그림자(반투명 회청색)로
import sys, colorsys
from PIL import Image
SRC = sys.argv[1] if len(sys.argv) > 1 else 'tools/house-pack/src/arch_src.png'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'tools/house-pack/src/arch.png'
GREEN = [(47, 87, 83), (59, 125, 79), (99, 171, 63), (183, 212, 99)]          # 화분·덤불 잎
WOOD = [(129, 98, 97), (179, 128, 116), (220, 164, 141), (248, 208, 171)]     # 원본처럼 분홍빛 도는 밝은 나무 (원본 나무색 7가지를 4단계로)
LINE = (40, 53, 64)                                                           # 팩 식물 외곽선
WHITE, PETAL, YELLOW = (246, 242, 232), (206, 198, 184), (236, 190, 84)        # 꽃 (텃밭·아치 꽃과 같은 흰색)
SHADOW = (170, 175, 180)
def pick(levels, v, cuts):
    for lv, c in zip(levels, cuts):
        if v <= c: return lv
    return levels[-1]
def tidy(c):
    r, g, b = c; h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255); hd = h * 360
    if v < 0.36: return LINE                                                   # 어두운 외곽선은 모두 한 가지
    if s < 0.2 and v > 0.9: return WHITE                                       # 꽃잎
    if s < 0.22: return PETAL if v > 0.7 else (WOOD[0] if v < 0.55 else WOOD[1])  # 꽃잎 그늘 · 회색빛 나무
    if 30 <= hd <= 62 and v > 0.8 and s > 0.45: return YELLOW                   # 꽃술
    if 40 <= hd <= 62 and v > 0.8: return GREEN[3]                             # 노란 잎끝
    if 62 < hd < 170: return pick(GREEN, v, (0.42, 0.56, 0.74))                # 잎
    if hd < 40 or hd > 300: return pick(WOOD, v, (0.55, 0.75, 0.9))            # 나무 (붉은 기 있는 분홍 나무도 원목으로)
    return pick(GREEN, v, (0.42, 0.56, 0.74))
im = Image.open(SRC).convert('RGBA'); px = im.load()
for y in range(im.height):
    for x in range(im.width):
        c = px[x, y]
        if not c[3]: continue
        if c[:3] == SHADOW: px[x, y] = (40, 53, 64, 100); continue
        px[x, y] = tidy(c[:3]) + (c[3],)
im = im.crop(im.getbbox()); im.save(OUT)
print(im.size, len({px[x, y] for y in range(im.height) for x in range(im.width) if px[x, y][3]}), '색')
