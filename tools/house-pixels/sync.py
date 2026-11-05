# 고친 도트 그림을 게임 파일에 반영: python3 tools/house-pixels/sync.py
# - sprites/*.png와 gen.py의 색(PAL)을 읽어
#   public/index.html의 `const D = …` 줄(내 집터 도면 그림 데이터)과
#   city.js의 `DECO.size` 줄(서버가 검사하는 장식 크기)을 새로 씀.
# - gen.py의 SPR 글자 그림도 PNG와 같게 맞춤.
import json, os, re, runpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
FIXED = {'rubble', 'rubble2', 'window'}  # 꾸미기로 놓을 수 없는 것 (잔해, 벽에 붙은 창)

g = runpy.run_path(os.path.join(HERE, 'gen.py'), run_name='sync')
g['load_png_sprites'](os.path.join(HERE, 'sprites'))
SPR, RGB = g['SPR'], g['RGB']

# gen.py의 SPR 글자 그림 맞추기
gp = os.path.join(HERE, 'gen.py'); src = open(gp, encoding='utf-8').read()
body = 'SPR = {\n' + ''.join(f"  '{k}': [\n" + ',\n'.join(f'    "{r}"' for r in v) + '],\n' for k, v in SPR.items()) + '}\n'
a, b = src.index('SPR = {'), src.index('\ndef load_png_sprites')
open(gp, 'w', encoding='utf-8').write(src[:a] + body + src[b:])

data = json.dumps({'pal': {k: '#%02x%02x%02x' % v for k, v in RGB.items()}, 'spr': SPR}, ensure_ascii=False, separators=(',', ':'))
size = json.dumps({k: [max(len(r) for r in v), len(v)] for k, v in SPR.items() if k not in FIXED}, separators=(',', ':'))

def patch(path, pattern, repl, what):
    s = open(path, encoding='utf-8').read()
    n = len(re.findall(pattern, s, flags=re.M))
    if n != 1: raise SystemExit(f'{what}: {os.path.relpath(path, ROOT)}에서 바꿀 줄을 {n}개 찾았다 (1개여야 함)')
    open(path, 'w', encoding='utf-8').write(re.sub(pattern, lambda m: repl, s, flags=re.M))
    print(f'{what} → {os.path.relpath(path, ROOT)}')

patch(os.path.join(ROOT, 'public', 'index.html'), r'^    const D = \{"pal".*?\};$', '    const D = ' + data + ';', '도면 그림 데이터')
patch(os.path.join(ROOT, 'city.js'), r'^  size: \{.*?\}, // 장식마다 \[가로, 세로\] 도트$', '  size: ' + size + ', // 장식마다 [가로, 세로] 도트', '장식 크기')
print('끝. 놓아 둔 장식 중 크기가 커진 것은 서버가 겹침을 다시 검사하니, 꾸미기에서 한 번 확인해 보자.')
