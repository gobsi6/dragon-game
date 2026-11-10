# pack.json v13
# 1) 색이 여러 개인 가구를 색마다 따로 사는 가구로 나눔: 긴 깔개·네모 깔개(6)·색유리 창(6)·화분대(2)·마력 수정(4색, 색마다 한 알·무리 '모양')
# 2) 이름 바꾸기, 둥근 걸상(걸상과 같은 그림) 지우기
# 3) 도면이 있어야 만드는 가구: 붉은 방석 의자·은 거울·달 깔개·높은 철 울타리·색유리 창(색 여섯이 도면 하나를 같이 씀: bpKey)
import json, sys
PACK = sys.argv[1] if len(sys.argv) > 1 else 'public/house/pack.json'
P = json.load(open(PACK, encoding='utf-8')); P['v'] = 13
S, C, G, GL = P['sprites'], P['cat'], P['groups'], P['groupLabel']
def split(base, names):
    ids = G.pop(base); GL.pop(base, None); src = dict(C[base])
    for vid, nm in zip(ids, names):
        S[vid].pop('of', None); S[vid]['name'] = nm
        C[vid] = {**src, 'name': nm}
split('rug', ['긴 깔개 (빨강)', '긴 깔개 (파랑)', '긴 깔개 (주황)', '긴 깔개 (초록)', '긴 깔개 (자홍)', '긴 깔개 (청록)'])
split('rug_red', ['네모 깔개 (빨강)', '네모 깔개 (파랑)', '네모 깔개 (주황)', '네모 깔개 (초록)', '네모 깔개 (자홍)', '네모 깔개 (청록)'])
split('glasswin', ['색유리 창 (갈색)', '색유리 창 (하늘)', '색유리 창 (남색)', '색유리 창 (초록)', '색유리 창 (분홍)', '색유리 창 (노랑)'])
split('planter', ['화분대 (주황)', '화분대 (파랑)'])
# 마력 수정: 색 넷으로 나누고, 색마다 한 알·무리를 '모양'으로
cr = G.pop('crystal'); GL.pop('crystal', None); src = dict(C['crystal'])
for i, col in enumerate(['초록', '분홍', '노랑', '하늘']):
    a, b = cr[2 * i], cr[2 * i + 1]
    for vid in (a, b): S[vid].pop('of', None)
    S[a]['name'] = f'마력 수정 ({col})'; S[b]['name'] = f'마력 수정 ({col} 무리)'; S[b]['of'] = a
    G[a] = [a, b]; GL[a] = '모양'; C[a] = {**src, 'name': f'마력 수정 ({col})'}
# 이름 바꾸기
for k, nm in {'bucket': '항아리', 'mug': '빈 잔', 'keg': '술통', 'book_tray': '책 선반', 'coins': '저울', 'stool': '낮은 의자', 'desk_read': '독서대', 'pond': '연못'}.items():
    S[k]['name'] = nm; C[k]['name'] = nm
# 둥근 걸상 지우기 (걸상과 같은 그림)
S.pop('stool2', None); C.pop('stool2', None)
# 도면
for k, cost in {'chair_red': 40, 'mirror': 50, 'rug_moon': 60, 'fence_iron': 40, 'glasswin': 50}.items(): C[k]['bp'] = cost
C['glasswin']['bpName'] = '색유리 창'
for k in ['glasswin_1', 'glasswin_2', 'glasswin_3', 'glasswin_4', 'glasswin_5']: C[k]['bp'] = 0; C[k]['bpKey'] = 'glasswin'
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', len(S), len(C))
