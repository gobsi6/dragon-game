# pack.json v15
# 1) '모양'으로 묶었던 가구를 모두 따로 사는 가구로 나눔 (꽃 아홉, 접시 셋, 그릇 더미 둘, 펼친 마법서 둘, 마력 수정 여덟). 이제 묶음은 '방향'만 남음
# 2) 탁자 위에 올릴 수 있는 소품(stack)은 모두 '탁상 소품' 분류로 따로 모음
import json, sys
PACK = sys.argv[1] if len(sys.argv) > 1 else 'public/house/pack.json'
P = json.load(open(PACK, encoding='utf-8')); P['v'] = 15
S, C, G = P['sprites'], P['cat'], P['groups']
NAMES = {
  'flower1': ['작은 노란 꽃', '노란 꽃', '붉은 꽃', '분홍 꽃', '하늘색 꽃', '흰 들국화', '주황 꽃', '흩어진 꽃잎', '꽃잎 무더기'],
  'plate': ['접시', '작은 접시', '세운 접시'],
  'dishes': ['그릇 더미', '낮은 그릇 더미'],
  'spellbook': ['펼친 마법서', '큰 마법서'],
  'crystal': ['작은 수정 (초록)', '마력 수정 (초록)'], 'crystal_2': ['작은 수정 (분홍)', '마력 수정 (분홍)'],
  'crystal_4': ['작은 수정 (노랑)', '마력 수정 (노랑)'], 'crystal_6': ['작은 수정 (하늘)', '마력 수정 (하늘)'],
}
for base, names in NAMES.items():
    ids = G.pop(base); P['groupLabel'].pop(base, None); src = dict(C[base])
    for vid, nm in zip(ids, names):
        S[vid].pop('of', None); S[vid]['name'] = nm; C[vid] = {**src, 'name': nm}
for k in list(P['groupLabel']):
    if k not in G: P['groupLabel'].pop(k)
# 탁상 소품: 올릴 수 있는 가구는 모두 이 분류로 (방향 그림은 첫 그림 기준)
for k, s in S.items():
    if s.get('stack') and k in C: C[k]['cat'] = 'top'
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', len(C), [k for k, c in C.items() if c['cat'] == 'top'])
