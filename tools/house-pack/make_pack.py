# 팩 시안 데이터를 게임용 public/house/pack.json 으로 정리 (미리보기에서 확정한 그림·값 그대로)
import json, sys, base64, io
sys.path.insert(0,'/home/claude/pack')
from PIL import Image
D=json.load(open('/home/claude/pack/final_D.json'))
REN={'f_barrel':'barrel','f_crate':'crate','f_stool':'stool','f_waterbarrel':'waterbarrel','candel':'candle','plant':'pot','dishshelf':'shelf',
 'worktable':'workbench','furnace':'hearth','sign':'signpost','flower':'flowers','garden':'bedplot','garden2':'bedplot2','garden3':'bedplot3',
 'wwin_day':'wwin','bay_day':'bay','book_rack':'book_tall','planterbox':'planter'}
rn=lambda k: REN.get(k,k)
CAT={'bed':'live','cabinet':'live','table':'live','chair':'live','stool':'live','bench':'live','rug':'live','clock':'live',
 'bookcase':'store','shelf':'store','crate':'store','boxes':'store','barrel':'store','waterbarrel':'store','chest':'store',
 'desk_read':'study','desk_small':'study','desk_long':'study','desk_long2':'study','desk_study':'study','desk_drawer':'study','desk_write':'study','book_open':'study','book_red':'study','book_stack':'study','book_tall':'study',
 'dine_table':'live','bread_table':'live','tea_table':'live','feast_table':'live','plant_table':'live','side_table':'live','stool2':'live','wardrobe':'live','drawer_long':'store','bigtable':'live','longtable':'live','counter':'work','counter_l':'work','fireplace':'light',
 'workbench':'work','anvil':'work','hearth':'work','lectern':'work','lamp':'light','candle':'light','torch':'light',
 'pot':'green','planter':'green','flowers':'green','bush':'green','mushroom':'green','bedplot':'green','bedplot2':'green','bedplot3':'green','rock':'green',
 'window':'wall','wwin':'wall','wwin_shut':'wall','bay':'wall','bay_shut':'wall','banner':'wall',
 'well':'out','fountain':'out','bellstand':'out','column':'out','signpost':'out'}
LAYER={'rug':'flat'}
for k,v in CAT.items():
    if v=='wall': LAYER[k]='wall'
for k in ['book_open','book_red','book_stack','book_tall']: LAYER[k]='top'
groups={rn(b):[rn(x) for x in v] for b,v in D['groups'].items()}
base_of={x:b for b,v in groups.items() for x in v}
spr={}
for k,v in D['sprites'].items():
    K=rn(k); b=base_of.get(K,K)
    spr[K]={'name':v['name'],'w':v['w'],'h':v['h'],'src':v['src']}
    if K in base_of and base_of[K]!=K: spr[K]['of']=b
    if b in LAYER: spr[K]['layer']=LAYER[b]
for k,fr in D.get('anim',{}).items(): spr[rn(k)]['frames']=fr
MATID={'룬이 새겨진 돌':'rune_stone','살아 있는 나무껍질':'living_bark','바랜 천 조각':'faded_cloth','낡은 두루마리':'old_scroll','태양가루':'sun_dust','흑요석':'obsidian','붉은 점토':'red_clay','옛 타일 조각':'old_tile','동굴 수정':'cave_crystal','늑대 가죽':'wolf_pelt','종유석 가루':'drip_dust','짐승 가죽':'beast_hide','늪철':'bog_iron','조개껍데기':'sea_shell','금광석':'gold_ore','빛버섯 포자':'shroom_spore','빛나는 이끼':'glow_moss'}
cat={}
for k,v in D['cat'].items():
    K=rn(k); cat[K]={'name':spr[K]['name'],'seals':v['seals'],'mats':{MATID[n]:c for n,c in v['mats']},'bp':v['bp'],'cat':CAT[K]}
# 집터별 기본 배치 (plots.py 시안 그대로, 벽 안쪽 맞춤 포함)
import plots as P
defaults={}
for plot,(nm,room,own,yard) in P.PLOTS.items():
    items=[P.clampx(o) for o in P.rest+yard+own]
    out=[]
    for o in items:
        K=rn(o['s']); w,h=spr[K]['w'],spr[K]['h']; it={'s':K,'x':o['x'],'y':o['y']}
        if o.get('f'): it['f']=1
        cx,cy=o['x']+w/2,o['y']+h/2; rid=None
        for r,(rx,ry,rw,rh) in D['rooms'].items():
            if rx<=cx<rx+rw and ry<=cy<ry+rh+8: rid=r
        yx,yy,yw,yh=D['yard']
        if rid is None and yx<=cx<yx+yw and yy<=cy<yy+yh: rid='yard'
        it['room']=rid or 'yard'; out.append(it)
    defaults[plot]=out
# 큰 팩 그림끼리 1도트씩 겹치는 곳 손보기
for o in defaults['spring']:
    if o['s']=='fountain': o['x']=34
    if o['s']=='pot' and o.get('f'): o['x']=78
for o in defaults['forge']:
    if o['s']=='workbench' and o['room']=='own': o['x']=49
gift={plot:{} for plot in defaults}
for plot,items in defaults.items():
    for it in items:
        b=base_of.get(it['s'],it['s']); g=gift[plot].setdefault(it['room'],{}); g[b]=g.get(b,0)+1
pack={'v':1,'W':D['W'],'H':D['H'],'rooms':D['rooms'],'yard':D['yard'],'roads':[r for r in D['roads'] if 0<=r[1]*16<D['H']],'block':D['block'],'door':[144,176],
 'base':D['base'],'front':D['front'],'sprites':spr,'groups':groups,'cat':cat,'defaults':defaults,'gift':gift,
 'floors':D['floors'],'walls':D['walls'],'cobble':D['cobble'],'fmask':D['fmask'],'wmask':D['wmask'],'ymask':D['ymask'],
 'fdef':D['fdef'],'wdef':D['wdef'],'yardFloors':['cobble','stone','brick','brick2','square','frame','plain','ornate','ornate2','marble','sand']}
json.dump(pack,open('/home/claude/rel/dragon-game-main/public/house/pack.json','w'),ensure_ascii=False,separators=(',',':'))
print('sprites',len(spr),'cat',len(cat))
for p,g in gift.items(): print(p,g)
