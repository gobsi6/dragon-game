# 내 집터 도트 생성기 (집터 6곳). 실행: python3 gen2.py <출력 폴더>
# - 색은 PAL 한 곳에서만 정한다. 초목·물·불을 뺀 모든 색은 베이지~갈색 계열.
# - 가구·장식: gen.py 옆 sprites/ 폴더의 PNG를 먼저 읽는다 (그림을 고치고 다시 실행하면 모든 집터에 반영).
#   sprites/에 없는 것만 아래 SPR의 글자 그림(한 글자 = 1도트, '.'는 투명)을 쓴다.
# - 결과: plots/<집터>-done.png(되살린 모습), plots/<집터>-ruin.png(처음 모습), 각각 1배와 @4x
#         sprites/<이름>.png(1배, 투명 배경), palette.gpl(Aseprite·GIMP 팔레트), sheet.png(한눈에 보기)
import os, random, sys
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'
S = 4  # 미리보기 배율 (게임 화면에서 1도트 = 4px)

PAL = {  # 글자: (이름, RGB)
    'a': ('벽 진함', (94, 79, 56)), 'b': ('벽', (125, 106, 76)),
    'w': ('나무', (176, 142, 98)), 'W': ('나무 그늘', (128, 102, 68)), 'v': ('나무 밝음', (200, 170, 126)),
    's': ('돌', (200, 184, 152)), 'S': ('돌 그늘', (150, 132, 100)), 't': ('돌 밝음', (222, 210, 186)),
    'g': ('잎', (122, 156, 104)), 'G': ('잎 그늘', (88, 122, 80)), 'l': ('잎 밝음', (164, 196, 136)),
    'y': ('빛', (246, 231, 168)), 'h': ('빛 번짐', (243, 234, 200)),
    'p': ('기둥', (138, 117, 86)), 'P': ('기둥 그늘', (104, 87, 62)),
    'c': ('천', (214, 190, 150)), 'C': ('천 그늘', (186, 158, 114)), 'n': ('종이', (246, 239, 224)),
    'q': ('물', (150, 178, 176)), 'Q': ('물 그늘', (118, 148, 150)), 'e': ('물 반짝임', (196, 214, 206)),
    'f': ('불', (232, 150, 70)), 'F': ('불 밝음', (246, 204, 112)), 'r': ('숯불', (182, 92, 46)),
    'k': ('검댕', (108, 98, 86)), 'K': ('쇠', (132, 126, 116)),
    'L': ('쇠 밝음', (176, 170, 158)), 'j': ('쇠 그늘', (123, 116, 103)), 'u': ('통 나무', (150, 114, 66)),
    # 바닥·땅 (스프라이트에는 거의 안 씀)
    '1': ('땅', (237, 227, 208)), '2': ('땅 얼룩', (228, 216, 194)), '3': ('땅 밝음', (244, 236, 221)),
    '4': ('잔해 바닥', (226, 214, 191)), '5': ('잔해 얼룩', (214, 200, 174)), '6': ('금', (168, 146, 108)),
    '7': ('돌바닥', (239, 230, 211)), '8': ('줄눈', (214, 200, 172)),
    '9': ('판자', (220, 195, 154)), '0': ('판자 이음', (184, 154, 108)), '+': ('판자 밝음', (232, 212, 176)),
    '-': ('흙', (230, 218, 194)), '=': ('흙 그늘', (206, 190, 160)),
    '#': ('어두운 타일', (196, 180, 152)), '%': ('어두운 줄눈', (170, 152, 122)),
}
RGB = {k: v[1] for k, v in PAL.items()}

SPR = {
  'planter': [
    "..y..y...y.",
    ".lgl.gl.lg.",
    "lgGglgGglgG",
    ".gGgGgGgGg.",
    "vvvvvvvvvvv",
    "wwwwwwwwwww",
    "wwWwwwwwWww",
    "WWWWWWWWWWW"],
  'bench': [
    "vvvvvvvvvv",
    "wwwwwwwwww",
    ".W......W.",
    ".W......W."],
  'lamp': [
    "..PPP..",
    ".PyyyP.",
    ".PyFyP.",
    ".PyyyP.",
    "..PPP..",
    "...P...",
    "...P...",
    "...P...",
    "...P...",
    "..PPP.."],
  'bed': [
    "WWWWWWWWWWWW",
    "WnntCcCccccW",
    "WnntCcCccccW",
    "WnntCcCccccW",
    "WtttCcCccccW",
    "WnnnCcCccccW",
    "WWWWWWWWWWWW",
    "W..........W"],
  'rug': [
    ".WWWWWWWWWWWW.",
    "WccccccccccccW",
    "WcCCCCCCCCCCcW",
    "WcCccccccccCcW",
    "WcCccccccccCcW",
    "WcCCCCCCCCCCcW",
    "WccccccccccccW",
    ".WWWWWWWWWWWW."],
  'table': [
    "WWWWWWWWWW",
    "WvvvvvvvvW",
    "WwwwwwwwwW",
    "WWWWWWWWWW",
    ".W......W.",
    ".W......W.",
    ".W......W."],
  'shelf': [
    "..c..q.nn.K.",
    ".cCC.qQnnKk.",
    "WWWWWWWWWWWW",
    ".sS.CcC.qQq.",
    "WWWWWWWWWWWW"],
  'workbench': [
    "...SS....kK...",
    "...SS...kK....",
    "WWWWWWWWWWWWWW",
    "WvvvvvvvvvvvvW",
    "WwwwwwwwwwwwwW",
    "WWWWWWWWWWWWWW",
    ".W..........W.",
    ".W..........W."],
  'crate': [
    "WWWWWW",
    "WvwwvW",
    "WwvvwW",
    "WvwwvW",
    "WWWWWW"],
  'barrel': [
    ".WWW.",
    "WwvwW",
    "WuuuW",
    "WwvwW",
    "WuuuW",
    ".WWW."],
  'pond': [
    ".....SSSSSSSSSS.....",
    "...SStsssssssstSS...",
    "..StsSqqqqqqqqSstS..",
    ".StSqqqeqqqqqqqqStS.",
    "StSqqqqqqqqQqqeqqStS",
    "SsqqeqqqqqQQqqqqqqsS",
    "SsqqqqqgqqqqqqqqeqsS",
    "SsqqqqglgqqqqqqqqqsS",
    "SsQqqqqgqqqqeqqqqQsS",
    "StSQqqqqqqqqqqqQQStS",
    ".StSQQqqqqqqqQQQStS.",
    "..StsSSQQQQQQSSstS..",
    "...SStsssssssstSS...",
    ".....SSSSSSSSSS....."],
  'steps': [
    "SSSSSSSSSS",
    "SttttttltS",
    "SssssssssS",
    "SSSSSSSSSS",
    "StttgttttS",
    "SssssssssS",
    "SSSSSSSSSS",
    "SttttttgtS",
    "SssssssssS",
    "SSSSSSSSSS"],
  'tablets': [
    "WWWWWWWWWW",
    "WtLsaaeSaW",
    "WtLsqaeSaW",
    "WtLsqaeSKW",
    "WtLsqaeStW",
    "WWWWWWWWWW"],
  'carvedesk': [
    "..SSSSSSS...",
    "..St6t6tS.K.",
    "..StttttS.K.",
    "WWWWWWWWWWWW",
    "WvvvvvvvvvvW",
    "WwwwwwwwwwwW",
    "WWWWWWWWWWWW",
    ".W........W.",
    ".W........W."],
  'hearth': [
    "..aaaaaaaaaa..",
    ".abbbbbbbbbba.",
    "abkkkkkkkkkkba",
    "abk...FF...kba",
    "abk..FyyF..kba",
    "abk.fFyFff.kba",
    "abkrfffffrrkba",
    "abkrrrrrrrrkba",
    "abbbbbbbbbbbba",
    "aaaaaaaaaaaaaa"],
  'anvil': [
    "jjjjjjj.",
    ".jKKKKjj",
    "..kjjk..",
    "..kKKk..",
    ".kkkkkk."],
  'telescope': [
    "......KK",
    ".....KKk",
    "....KKk.",
    "...KKk..",
    "..pKk...",
    ".ppP.p..",
    "pp.P..p.",
    "p..P...."],
  'bell': [
    "...P...",
    "..LKj..",
    ".LLKKj.",
    ".LKKKj.",
    ".LKKKj.",
    "LKKKKjk",
    "...k..."],
  'window': [
    "aaaaaaaaaa",
    "aeeqqeqqea",
    "aqqQqqqQqa",
    "aaaaaaaaaa"],
  'well': [
    "...WWWWWW...",
    ".WWvvvvvvWW.",
    "WWWWWWWWWWWW",
    ".P...P....P.",
    ".P...P....P.",
    ".P..jKKj..P.",
    ".P..jjjj..P.",
    ".tttttttttt.",
    "tSkkkkkkkkSt",
    "sssSssssSsss",
    "SsssssSsssSs",
    "sssSssssSsss",
    "SSSSSSSSSSSS"],
  'signpost': [
    "vvvvv",
    "wnnnw",
    "wnanw",
    "wwwww",
    "..W..",
    "..W..",
    ".WWW."],
  'pot': [
    ".lg.",
    "lgGg",
    "vvvv",
    "wwww",
    ".WW."],
  'bedplot': [
    "WWWWWWWWWWWWW",
    "Wg=-g==l=g=-W",
    "Wlgl=gGg=lgGW",
    "WgGg-glg-gGgW",
    "W=g==-g==-g-W",
    "WWWWWWWWWWWWW"],
  'arch': [
    "..lgglggGl..",
    ".gGlg..GlgG.",
    "gGy......ygg",
    "gl........lG",
    "p..........p",
    "p..........p",
    "p..........p",
    "P..........P"],
  'rubble': [
    ".tts..",
    "tsssS.",
    "ssSSSS"],
  'rubble2': [
    ".ts",
    "sSS"],
  'brazier': [
    "..FfF..",
    ".FfyfF.",
    ".fFyFf.",
    "KKKKKKK",
    ".KjjjK.",
    "..KjK..",
    "..KjK..",
    ".KKKKK."],
  'bush': [
    "...GgG....",
    "..GglgGg..",
    ".GglggggG.",
    "GllgGglgGG",
    "GgglgggGgG",
    ".GGgGGgGG."],
  'chair': [
    "W.....",
    "W.....",
    "W.....",
    "Wvvvvv",
    "Wwwwww",
    "W....W",
    "W....W"],
  'fence': [
    "W...W...W...W",
    "WvvvWvvvWvvvW",
    "WwwwWwwwWwwwW",
    "W...W...W...W",
    "W...W...W...W"],
  'flowerbed': [
    ".y..F..y..",
    "glgGglgGgl",
    "WwwwwwwwwW",
    "WvvvvvvvvW",
    "WWWWWWWWWW"],
  'flowers': [
    "..D.....q..",
    ".DyD...qyq.",
    "..Eg.D..Q..",
    "...gDyD.g..",
    ".F.g.Eg.g..",
    "FyFgg.gl.l.",
    ".Fglgggglg.",
    "lgGgGlgGgGl",
    ".=========."],
  'jar': [
    ".CCC.",
    "..C..",
    ".CtC.",
    "CtccC",
    "CcccC",
    ".CCC."],
  'mushroom': [
    "..rrr....",
    ".rfyfr...",
    "rfffffr..",
    "..CnC.rr.",
    "..CnCrfyr",
    "..CnC.Cn.",
    ".=======."],
  'stepstone': [
    ".SSS....SSS.",
    "SttsS..SttsS",
    "SsssS..SsssS",
    ".SSS....SSS.",
    "....SSS.....",
    "...SttsS....",
    "...SsssS....",
    "....SSS....."],
  'stonelamp': [
    "..SS..",
    ".SttS.",
    "SSSSSS",
    "SyhhyS",
    "SyyyyS",
    "SSSSSS",
    ".StsS.",
    ".StsS.",
    "SSSSSS"],
  'tree': [
    ".....G.....",
    "....GlG....",
    "...GlggG...",
    "..GlggggG..",
    "...GlggG...",
    "..GllgggG..",
    ".GlgglgggG.",
    "GllggggGgGG",
    "..GlggGGG..",
    ".GllgggggG.",
    "GggglggGgGG",
    "GgggggGgGGG",
    "..GGGGGGG..",
    "....WwW....",
    "....WwW....",
    "...=====..."],
  'bookcase': [
    "WWWWWWWWWWWW",
    "WrfAgBqrfgAW",
    "WrfAgBqrfgAW",
    "WWWWWWWWWWWW",
    "WgqrAfgAqrfW",
    "WgqrAfgAqrfW",
    "WWWWWWWWWWWW",
    "WBrgfqAgrBqW",
    "WBrgfqAgrBqW",
    "WWWWWWWWWWWW",
    "W..........W"],
  'crystallamp': [
    "..eQ..",
    ".eqqQ.",
    "eqeqQQ",
    ".eqqQ.",
    "..QQ..",
    "..PP..",
    "..PP..",
    "..PP..",
    ".PPPP.",
    "PPPPPP"],
  'fountain': [
    "......ee......",
    ".....eQQe.....",
    "......HH......",
    "....HHttHH....",
    "...HqqeqqqS...",
    "....HHSSSS....",
    "......SS......",
    "..HHHHSSHHHH..",
    ".HqqeqSSqeqqS.",
    ".HHQQqqqqQQSS.",
    ".HHHHSSSSSSSS.",
    "..HSSSSSSSSS.."],
  'glowpatch': [
    "..e.....e...",
    ".eqe.e.eqe..",
    "..P.eqe.P.e.",
    ".gPg.P.gPgqe",
    "glglgPglglP.",
    "GGGGGGGGGGGG"],
  'goldlamp': [
    "..FFF..",
    ".FyyyF.",
    ".FyhyF.",
    ".FyyyF.",
    "..FFF..",
    "...F...",
    "...u...",
    "...u...",
    "..uuu..",
    ".uuuuu."],
  'mosaic': [
    ".SSSSSSSSSSSS.",
    "SttqqttqqttqqS",
    "SttqqttqqttqqS",
    "SqqttqqttqqttS",
    "SqqttqqttqqttS",
    "SttqqttqqttqqS",
    "SttqqttqqttqqS",
    ".SSSSSSSSSSSS."],
  'nestbed': [
    "...uuuuuuuu...",
    ".uuWuuWuuWuuu.",
    "uWuccccccccuWu",
    "uucchhhhhhccuu",
    "uWchhhhhhhhcWu",
    "uuuchhhhhhcuuu",
    ".uuWuuWuuWuuu.",
    "...uuuuuuuu..."],
  'tapestry': [
    "PPPPPPPPPP",
    ".rrrrrrrr.",
    ".rFrrrrFr.",
    ".rrFFFFrr.",
    ".rFFrrFFr.",
    ".rrFFFFrr.",
    ".rrrFFrrr.",
    ".rrFrrFrr.",
    ".rrrrrrrr.",
    ".rFrFrFrF.",
    ".P......P.",
    "PP......PP"],
  'tablets2': [
    "WWWWWWWWWW",
    "WtLasaeatW",
    "WtLqsaeStW",
    "WWWWWWWWWW",
    "WtttaaLqaW",
    "WssssaLqtW",
    "WWWWWWWWWW"],
  'tablets3': [
    "WWWWWWWWWW",
    "WtLsaaeStW",
    "WtLsqaeStW",
    "WtLsqaeStW",
    "WWWWWWWWWW",
    "WaaaaaLatW",
    "WtttaaLqtW",
    "WsssSaLqtW",
    "WWWWWWWWWW"],
}

def load_png_sprites(folder):
    # sprites/*.png가 있으면 그 그림이 SPR보다 먼저다. 팔레트에 없는 색은 '추가 색'으로 자동 등록
    from PIL import Image as _I
    if not os.path.isdir(folder): return
    rev = {v: k for k, v in RGB.items()}
    spare = iter('ABDEHIJLMNORTUVXYZimoxz!@$&*/<>?^~')
    for f in sorted(os.listdir(folder)):
        if not f.endswith('.png'): continue
        im = _I.open(os.path.join(folder, f)).convert('RGBA'); rows = []
        for j in range(im.height):
            row = ''
            for i in range(im.width):
                r, g, b, a = im.getpixel((i, j))
                if a < 128: row += '.'; continue
                if (r, g, b) not in rev:
                    ch = next(spare); RGB[ch] = (r, g, b); PAL[ch] = (f'추가 색 ({f[:-4]})', (r, g, b)); rev[(r, g, b)] = ch
                row += rev[(r, g, b)]
            rows.append(row)
        SPR[f[:-4]] = rows

def put(im, x, y, name):
    for j, row in enumerate(SPR[name]):
        for i, ch in enumerate(row):
            if ch != '.' and 0 <= x + i < im.width and 0 <= y + j < im.height: im.putpixel((x + i, y + j), RGB[ch])

def px(im, x, y, ch):
    if 0 <= x < im.width and 0 <= y < im.height: im.putpixel((x, y), RGB[ch])

def rect(im, x, y, w, h, ch):
    for i in range(x, x + w):
        for j in range(y, y + h): px(im, i, j, ch)

def border(im, x, y, w, h, ch='b'):
    for i in range(x, x + w): px(im, i, y, ch); px(im, i, y + h - 1, ch)
    for j in range(y, y + h): px(im, x, j, ch); px(im, x + w - 1, j, ch)

# ── 바닥 ──
def fl_pave(im, x, y, w, h, a='7', b='8'):
    rect(im, x, y, w, h, a)
    for j in range(y, y + h):
        row = (j - y) // 4
        for i in range(x, x + w):
            if (j - y) % 4 == 0 or (i - x + (3 if row % 2 else 0)) % 7 == 0: px(im, i, j, b)

def fl_plank(im, x, y, w, h):
    for j in range(y, y + h):
        r = (j - y) // 3
        for i in range(x, x + w):
            px(im, i, j, '0' if (j - y) % 3 == 2 or (i - x + r * 5) % 13 == 0 else '+' if (j - y) % 3 == 0 else '9')

def fl_dirt(im, x, y, w, h, rnd):
    rect(im, x, y, w, h, '-')
    for i in range(x, x + w):
        for j in range(y, y + h):
            if rnd.random() < .1: px(im, i, j, '=')

def fl_moss(im, x, y, w, h, rnd):
    fl_pave(im, x, y, w, h)
    for _ in range(w * h // 30):
        i, j = x + rnd.randrange(w), y + rnd.randrange(h); px(im, i, j, 'l'); px(im, i + 1, j, 'g')

def fl_ruin(im, x, y, w, h, rnd, vines=False):
    rect(im, x, y, w, h, '4')
    for i in range(x, x + w):
        for j in range(y, y + h):
            if rnd.random() < .08: px(im, i, j, '5')
    for i in range(x, x + w):
        if not (x + w * .35 < i < x + w * .45): px(im, i, y, '6')
        if not (x + w * .6 < i < x + w * .72): px(im, i, y + h - 1, '6')
    for j in range(y, y + h):
        px(im, x, j, '6')
        if not (y + h * .45 < j < y + h * .6): px(im, x + w - 1, j, '6')
    for _ in range(max(3, w * h // 160)):
        put(im, x + 3 + rnd.randrange(max(1, w - 9)), y + 6 + rnd.randrange(max(1, h - 10)), rnd.choice(['rubble', 'rubble2', 'rubble2']))
    cx = x + w // 3
    for k in range(6): px(im, cx + (k % 2), y + 1 + k, '6')
    if vines:
        vx, vy = x + w - 4, y + 3
        while vy < y + h - 3:
            px(im, vx, vy, 'G'); px(im, vx - 1, vy, 'g')
            if rnd.random() < .45: px(im, vx - 2, vy - 1, 'l'); px(im, vx + 1, vy + 1, 'l')
            vy += 1; vx = min(x + w - 3, max(x + w // 2, vx + rnd.choice([-1, 0, 0, 1])))

# ── 집터 배치 (모든 집터 같은 뼈대: 위 거처, 가운데 마당, 오른쪽 작업실, 왼쪽 고유 칸) ──
W, H = 146, 110
ROOMS = {'live': (49, 6, 48, 29), 'own': (6, 40, 40, 43), 'yard': (49, 40, 48, 46), 'work': (100, 40, 40, 43)}

def base(rnd, grassy=1.0):
    im = Image.new('RGB', (W, H), RGB['1'])
    for x in range(W):
        for y in range(H):
            r = rnd.random()
            if r < .06: px(im, x, y, '2')
            elif r < .09: px(im, x, y, '3')
    for gy in range(4, H - 6, 9):  # 잡초: 10×9 칸마다 많아야 하나 (겹치지 않음)
        for gx in range(4, W - 6, 10):
            if rnd.random() > 0.5 * grassy: continue
            x, y = gx + 1 + rnd.randrange(6), gy + 2 + rnd.randrange(5); px(im, x, y - 1, 'l'); px(im, x + 1, y, 'g'); px(im, x + 2, y - 1, 'l')
    for j in range(86, H):
        for i in range(66, 80): px(im, i, j, '8' if (j % 4 == 0 or (i + (j // 4) * 3) % 6 == 0) else '4')
    # 바깥 담: 안쪽 선을 먼저, 바깥 선을 나중에 그려 모서리가 비지 않게
    for i in range(3, W - 3):
        if not (64 <= i <= 81): px(im, i, H - 4, 'b')
        px(im, i, 3, 'b')
    for j in range(3, H - 3): px(im, 3, j, 'b'); px(im, W - 4, j, 'b')
    for i in range(2, W - 2):
        if not (64 <= i <= 81): px(im, i, H - 3, 'a')
        px(im, i, 2, 'a')
    for j in range(2, H - 2): px(im, 2, j, 'a'); px(im, W - 3, j, 'a')
    return im

# 기본 가구를 게임과 똑같이 4도트 눈금에 맞춰 놓음 (index.html의 HP.defaults와 같은 규칙: 칸 안쪽에 맞추고, 겹치면 뺌)
GRID = 4
PLACED = []
def dput(im, room, dx, dy, name):
    rx, ry, rw, rh = ROOMS[room]; rows = SPR[name]; w, h = max(len(r) for r in rows), len(rows)
    if w > rw - 2 or h > rh - 2: return
    rnd_ = lambda v: int(v // 1 + (1 if v % 1 >= 0.5 else 0))
    x = rx + 1 + max(0, min((rw - 2 - w) // GRID, rnd_((dx - 1) / GRID))) * GRID
    y = ry + 1 + max(0, min((rh - 2 - h) // GRID, rnd_((dy - 1) / GRID))) * GRID
    if any(x < ox + ow and ox < x + w and y < oy + oh and oy < y + h for ox, oy, ow, oh in PLACED): return
    PLACED.append((x, y, w, h)); put(im, x, y, name)

def common_done(im, rnd):
    x, y, w, h = ROOMS['live']; fl_plank(im, x, y, w, h); border(im, x, y, w, h)
    dput(im, 'live', 3, 3, 'bed'); dput(im, 'live', 18, 14, 'rug'); dput(im, 'live', 36, 4, 'table'); dput(im, 'live', 33, 22, 'crate')
    x, y, w, h = ROOMS['work']; fl_plank(im, x, y, w, h); border(im, x, y, w, h)
    dput(im, 'work', 3, 3, 'shelf'); dput(im, 'work', 3, 14, 'workbench'); dput(im, 'work', 30, 3, 'barrel'); dput(im, 'work', 30, 36, 'crate'); dput(im, 'work', 22, 38, 'barrel')
    x, y, w, h = ROOMS['yard']; fl_pave(im, x, y, w, h); border(im, x, y, w, h)

PLOTS = {
  'spring':  ('샘가 집',       'moss',  0.9),
  'green':   ('온실 옆 집',    'dirt',  1.4),
  'archive': ('서고 뒤 집',    'pave',  0.6),
  'forge':   ('대장간 골목 집', 'dark', 0.4),
  'belfry':  ('종탑 아래 집',  'plank', 0.8),
  'plaza':   ('광장 앞 집',    'pave',  0.7),
}

def plot_done(pid):
    rnd = random.Random(sum(map(ord, pid)))
    name, own_floor, grassy = PLOTS[pid]
    PLACED.clear(); im = base(rnd, grassy); common_done(im, rnd)
    yx, yy, yw, yh = ROOMS['yard']; ox, oy, ow, oh = ROOMS['own']
    if own_floor == 'moss': fl_moss(im, ox, oy, ow, oh, rnd)
    elif own_floor == 'dirt': fl_dirt(im, ox, oy, ow, oh, rnd)
    elif own_floor == 'dark': fl_pave(im, ox, oy, ow, oh, '#', '%')
    elif own_floor == 'plank': fl_plank(im, ox, oy, ow, oh)
    else: fl_pave(im, ox, oy, ow, oh)
    border(im, ox, oy, ow, oh)
    if pid == 'spring':
        dput(im, 'own', 10, 13, 'pond'); dput(im, 'own', 3, 3, 'steps'); dput(im, 'own', 30, 34, 'pot'); dput(im, 'own', 4, 34, 'pot')
        dput(im, 'yard', 4, 36, 'planter'); dput(im, 'yard', 34, 4, 'lamp'); dput(im, 'yard', 30, 38, 'bench'); dput(im, 'yard', 20, 4, 'steps')
    elif pid == 'green':
        dput(im, 'own', 3, 4, 'bedplot'); dput(im, 'own', 3, 14, 'bedplot'); dput(im, 'own', 22, 24, 'arch'); dput(im, 'own', 4, 34, 'pot'); dput(im, 'own', 12, 35, 'pot')
        dput(im, 'yard', 4, 36, 'planter'); dput(im, 'yard', 34, 4, 'lamp'); dput(im, 'yard', 30, 40, 'bench'); dput(im, 'yard', 4, 4, 'pot'); dput(im, 'yard', 10, 4, 'pot')
    elif pid == 'archive':
        dput(im, 'own', 3, 3, 'tablets'); dput(im, 'own', 24, 3, 'tablets'); dput(im, 'own', 6, 24, 'carvedesk'); dput(im, 'own', 24, 30, 'lamp')
        dput(im, 'yard', 4, 4, 'tablets'); dput(im, 'yard', 34, 4, 'lamp'); dput(im, 'yard', 30, 40, 'bench'); dput(im, 'yard', 4, 36, 'planter')
    elif pid == 'forge':
        dput(im, 'own', 3, 3, 'hearth'); dput(im, 'own', 22, 8, 'anvil'); dput(im, 'own', 4, 22, 'workbench'); dput(im, 'own', 28, 34, 'barrel'); dput(im, 'own', 20, 35, 'crate')
        dput(im, 'yard', 4, 4, 'anvil'); dput(im, 'yard', 34, 4, 'lamp'); dput(im, 'yard', 30, 40, 'bench'); dput(im, 'yard', 4, 38, 'barrel'); dput(im, 'yard', 11, 38, 'crate')
    elif pid == 'belfry':
        put(im, ox + 15, oy, 'window'); dput(im, 'own', 6, 6, 'telescope'); dput(im, 'own', 26, 6, 'bell'); dput(im, 'own', 4, 26, 'rug'); dput(im, 'own', 26, 33, 'crate')
        dput(im, 'yard', 4, 36, 'planter'); dput(im, 'yard', 34, 4, 'lamp'); dput(im, 'yard', 30, 40, 'bench'); dput(im, 'yard', 4, 4, 'bell')
    elif pid == 'plaza':
        dput(im, 'own', 14, 13, 'well'); dput(im, 'own', 4, 4, 'signpost'); dput(im, 'own', 4, 34, 'pot'); dput(im, 'own', 31, 34, 'pot'); dput(im, 'own', 31, 4, 'pot')
        dput(im, 'yard', 4, 36, 'planter'); dput(im, 'yard', 34, 4, 'lamp'); dput(im, 'yard', 6, 4, 'bench'); dput(im, 'yard', 30, 40, 'bench'); dput(im, 'yard', 36, 36, 'pot')
    return im

def plot_ruin(pid):
    rnd = random.Random(sum(map(ord, pid)) + 7)
    im = base(rnd, PLOTS[pid][2] + .4)
    for k, (x, y, w, h) in ROOMS.items(): fl_ruin(im, x, y, w, h, rnd, vines=(pid == 'green' and k == 'own'))
    return im

def big(im): return im.resize((im.width * S, im.height * S), Image.NEAREST)

def main():
    load_png_sprites(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sprites'))
    for d in ['plots', 'sprites']: os.makedirs(f'{OUT}/{d}', exist_ok=True)
    for pid in PLOTS:
        for kind, fn in [('done', plot_done), ('ruin', plot_ruin)]:
            im = fn(pid); im.save(f'{OUT}/plots/{pid}-{kind}.png'); big(im).save(f'{OUT}/plots/{pid}-{kind}@4x.png')
    for name, rows in SPR.items():
        w = max(len(r) for r in rows); im = Image.new('RGBA', (w, len(rows)), (0, 0, 0, 0))
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch != '.': im.putpixel((i, j), RGB[ch] + (255,))
        im.save(f'{OUT}/sprites/{name}.png')
    with open(f'{OUT}/palette.gpl', 'w', encoding='utf-8') as f:
        f.write('GIMP Palette\nName: 내 집터\nColumns: 8\n#\n')
        for k, (nm, (r, g, b)) in PAL.items(): f.write(f'{r:3d} {g:3d} {b:3d}\t{nm} [{k}]\n')
    print('ok')

if __name__ == '__main__': main()
