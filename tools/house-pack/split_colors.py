# 색이 다른 가구는 저마다 따로 만드는 가구로 (pack.json v36)
# - 귀환 주문진·촛불 제단·룬 제단은 그대로 한 가구 ('색 바꾸기')
# - 방향(앞·옆·세로)·놓는 곳·커튼 여닫기·받침대 위 책처럼 '상태'가 다른 것은 묶음 그대로
# - 나뉜 가구는 기본 가구와 같은 인장·재료·종류, 도면은 기본 가구 것을 같이 씀(bpKey)
import json, sys
PACK = sys.argv[1] if len(sys.argv) > 1 else 'public/house/pack.json'
P = json.load(open(PACK, encoding='utf-8')); P['v'] = max(P['v'], 36); S, C, G, GL = P['sprites'], P['cat'], P['groups'], P.setdefault('groupLabel', {})
def solo(k, base, name):   # 묶음에서 빼 따로 만드는 가구로
    S[k].pop('of', None); S[k]['name'] = name
    c = dict(C[base]); c['name'] = name; c.pop('fn', None)
    if c.get('bp'): c['bpKey'] = C[base].get('bpKey', base); c['bp'] = 0   # 도면 가게에는 기본 가구 도면 하나만 (색유리 창처럼)
    C[k] = c
def ungroup(base, names):  # names: {그림 키: 가구 이름} (기본 가구 이름도 바꿀 수 있음)
    for k in G.pop(base): 
        if k == base: S[k]['name'] = C[k]['name'] = names.get(k, C[k]['name'])
        else: solo(k, base, names.get(k, S[k]['name']))
    GL.pop(base, None)
ungroup('cauldron', {'cauldron': '연금 솥 (청록)'})
ungroup('potion_tall', {'potion_tall': '긴 약병 (초록)', 'potion_tall_w': '긴 약병 (흰색)'})
ungroup('potion_tray', {'potion_tray': '약병 받침 (분홍 약병)'})
ungroup('alch_bench', {'alch_bench': '연금술 작업대 (갈색)'})
ungroup('alch_table', {'alch_table': '약병 놓인 긴 탁자 (갈색)', 'alch_table_b': '약병 놓인 긴 탁자 (파랑, 단지)', 'alch_table_e': '빈 긴 탁자 (파랑)'})
ungroup('book_tray', {'book_tray_brown': '책 선반 (갈색)', 'book_tray_orange': '책 선반 (주황)'})
ungroup('mirror', {'mirror_gold': '금빛 거울'})
# 새김 받침대: 받침대 색(나무·파랑)마다 한 가구, 위의 책 네 모양(마법서·펼친 책·책 한 권·빈 받침)은 '모양 바꾸기'
lec = G.pop('lectern'); wood_ids = [k for k in lec if k == 'lectern' or k.startswith('lectern_w')]; blue = [k for k in lec if k.startswith('lectern_b')]
G['lectern'] = wood_ids; GL['lectern'] = '모양'; S['lectern']['name'] = '새김 받침대'   # 기본 그림(마법서)은 가구 이름 그대로 (커튼처럼)
solo(blue[0], 'lectern', '새김 받침대 (파랑)')
for k in blue[1:]: S[k]['of'] = blue[0]
G[blue[0]] = blue; GL[blue[0]] = '모양'
# 커튼: 색마다 한 가구, 닫힌·걷은 모양은 '모양 바꾸기'
cur = G.pop('curtain'); GL.pop('curtain', None)
CN = ['옅은 갈색', '빨강', '노랑', '청록', '초록', '자홍', '흰색']
for i in range(7):
    a, b = cur[2 * i], cur[2 * i + 1]; name = f'커튼 ({CN[i]})'
    if a == 'curtain': C[a]['name'] = name; S[a]['name'] = name
    else: solo(a, 'curtain', name)
    S[b]['of'] = a; S[b]['name'] = f'커튼 ({CN[i]}, 걷음)'
    G[a] = [a, b]; GL[a] = '모양'
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
for b, ids in G.items():
    if b in ('warp_circle', 'altar_candle', 'altar_rune') or b.startswith(('curtain', 'lectern')): print(b, GL.get(b), [S[k]['name'] for k in ids])
print('new cat', len(C))
