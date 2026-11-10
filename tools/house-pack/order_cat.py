# 가구 목록 순서: 이름이 같은 가구(색만 다른 것: '긴 깔개 (빨강)' · '긴 깔개 (파랑)' …)와 깔개 종류를 처음 나온 자리에 한데 모음
# 가구 놓기·가구 만들기 목록이 이 순서를 따름 (화면은 분류 순서로만 다시 정렬하고, 같은 분류 안에서는 이 순서 그대로)
import json, sys
PACK = sys.argv[1] if len(sys.argv) > 1 else 'public/house/pack.json'
P = json.load(open(PACK, encoding='utf-8'))
def fam(k):  # 한데 모을 묶음: 이름이 같은 것(색만 다른 것)과, 깔개·꽃·접시·그릇·마법서·수정은 종류끼리
    n = P['cat'][k]['name'].split(' (')[0]
    if k.startswith('flower') and k != 'flowers': return '꽃'
    for w in ('깔개', '접시', '그릇', '마법서', '수정'):
        if w in n: return w
    return n
order, seen = [], set()
keys = list(P['cat'])
for k in keys:
    f = fam(k)
    if f in seen: continue
    seen.add(f); order += [x for x in keys if fam(x) == f]
P['cat'] = {k: P['cat'][k] for k in order}
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print([P['cat'][k]['name'] for k in order if '깔개' in P['cat'][k]['name']])
