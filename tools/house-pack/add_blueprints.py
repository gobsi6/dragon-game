# 도면이 있어야 만드는 가구 (pack.json v41). 모두 이번 판에 새로 넣은 가구라 이미 가진 사람은 없음
# 색마다 따로 만드는 가구는 색유리 창처럼 도면 하나(bpKey)로 모든 색을 만듦. 도면 가게에는 기본 가구 하나만(bpName)
import json, sys
PACK = sys.argv[1] if len(sys.argv) > 1 else 'public/house/pack.json'
P = json.load(open(PACK, encoding='utf-8')); P['v'] = max(P['v'], 41); C = P['cat']
BP = [('altar_candle', 60, None, []),
      ('tree_xmas', 50, None, []),
      ('tree_e1', 40, '큰 전나무', ['tree_e2', 'tree_e3', 'tree_e4']),
      ('tree_f1', 40, '키 큰 전나무', ['tree_f2', 'tree_f3', 'tree_f4']),
      ('alch_bench', 60, '연금술 작업대', ['alch_bench_b']),
      ('cauldron', 40, '연금 솥', ['cauldron_g', 'cauldron_p', 'cauldron_o'])]
for k, cost, name, more in BP:
    C[k]['bp'] = cost
    if name: C[k]['bpName'] = name
    for o in more: C[o]['bp'] = 0; C[o]['bpKey'] = k
json.dump(P, open(PACK, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', [(k, C[k]['bp'], C[k].get('bpName', C[k]['name'])) for k, *_ in BP])
