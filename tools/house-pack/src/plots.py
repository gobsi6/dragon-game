import sys, json, base64, io, colorsys, numpy as np
sys.path.insert(0,'/home/claude/pack')
from PIL import Image
d=json.load(open('editor_data.json'))
def im(u): return Image.open(io.BytesIO(base64.b64decode(u.split(',')[1]))).convert('RGBA')
BASE,FRONT=im(d['base']),im(d['front']); SPR={k:im(v['src']) for k,v in d['sprites'].items()}
def unred(a):
    a=np.array(a).astype(float)
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y,x,3]==0: continue
            r,g,b=a[y,x,:3]/255.0; h,sv,v=colorsys.rgb_to_hsv(r,g,b)
            if sv<0.08 or (sv>0.6 and v>0.8): continue
            if h>=0.80 or h<=0.06:
                rr,gg,bb=colorsys.hsv_to_rgb(0.075,min(1,sv*0.9),v*0.98); a[y,x,:3]=(rr*255,gg*255,bb*255)
    return Image.fromarray(a.astype('uint8'))
FR='/home/claude/fr/1x/'; CAS='/home/claude/dot/RPG Castles asset pack (by Franuka)/1x (16x16)/Objects & Decoration/'
def cut(path,box): i=Image.open(path).convert('RGBA').crop(box); return i.crop(i.getbbox())
NEW={
 'fountain': cut(CAS+'Fountain_On.png',(0,0,48,64)),
 'orrery': unred(cut(FR+'Expansion_School.png',(161,28,176,62))),
 'bell': unred(cut(FR+'Expansion_Music.png',(227,113,237,128))),
 'planterbox': unred(cut(FR+'Expansion_AlchemyLab.png',(192,429,224,458))),
 'lectern': unred(cut(FR+'Expansion_AlchemyLab.png',(288,372,304,397))),
 'column': cut(CAS+'Column_1.png',(0,0,16,48)),
 'bellstand': Image.open('/home/claude/pack/bellstand.png').convert('RGBA'),
 'banner': unred(cut(CAS+'Banner_Tan_1A.png',(0,0,16,32))),
 'clock': unred(cut(FR+'Expansion_Bedroom.png',(48,163,64,208))),
 'window': unred(cut(FR+'Fantasy RPG Interior Pack (16x16 grid).png',(424,102,439,122))),
}
SPR.update(NEW)
NM={'fountain':'샘물 분수','orrery':'천구의','bell':'작은 종','planterbox':'꽃 상자','lectern':'새김 받침대','column':'돌기둥'}
def W(n): return SPR[n].width
def Hh(n): return SPR[n].height
def clampx(o):
    w=W(o['s']); h=Hh(o['s']); cx=o['x']+w/2; cy=o['y']+h/2
    for (rx,ry,rw,rh) in d['rooms'].values():
        if rx<=cx<rx+rw and ry<=cy<ry+rh+8:
            o=dict(o); o['x']=int(max(rx+5,min(o['x'],rx+rw-5-w))); o['y']=int(max(ry+3,o['y'])); return o
    yx,yy,yw,yh=d['yard']
    if yx<=cx<yx+yw and yy<=cy<yy+yh:
        o=dict(o); o['x']=int(max(yx+7,min(o['x'],yx+yw-7-w))); o['y']=int(max(yy+7,min(o['y'],yy+yh-7-h)))
    return o
def compose(items):
    items=[clampx(o) for o in items]
    c=BASE.copy()
    for o in [o for o in items if o['s']=='rug']+sorted([o for o in items if o['s']!='rug'],key=lambda o:o['y']+Hh(o['s'])):
        s=SPR[o['s']]
        if o.get('f'): s=s.transpose(Image.FLIP_LEFT_RIGHT)
        c.alpha_composite(s,(o['x'],o['y']))
    c.alpha_composite(FRONT); return c
OX,OY,OW,OH=d['rooms']['own']   # 16,112,80,96 — 벽 앞면 112..143, 바닥 144..200 (아래 7줄은 앞쪽 벽)
FLOOR_B=OY+OH-7                  # 가구 바닥선(이 아래는 앞쪽 벽에 가림)
def at(n,cx,by,f=0): return {'s':n,'x':int(cx-W(n)/2),'y':int(by-Hh(n)),**({'f':1} if f else {})}
base_items=[o for o in d['defaults'] if not (OX<=o['x']<OX+OW and OY<=o['y']<OY+OH+8)]   # 거처·작업실·마당 기본 (고유 칸만 바꿈)
yard_items=[o for o in base_items if 112<=o['x']<208 and 112<=o['y']<208]
rest=[o for o in base_items if o not in yard_items]
YX,YY=112,112
PLOTS={
 'spring':('샘가 집','작은 연못',[at('window',OX+18,OY+26),at('window',OX+62,OY+26),at('fountain',OX+40,FLOOR_B-10),at('plant',OX+12,FLOOR_B+5),at('plant',OX+68,FLOOR_B+5,1)],
           [at('planterbox',YX+24,YY+30),at('lamp',YX+72,YY+30),at('bench',YX+24,YY+92),at('plant',YX+80,YY+92)]),
 'green':('온실 옆 집','지붕 정원',[at('plant',OX+12,OY+40),at('planterbox',OX+40,OY+40),at('plant',OX+68,OY+40,1),at('garden',OX+40,OY+64),at('garden2',OX+40,FLOOR_B)],
           [at('planterbox',YX+24,YY+30),at('lamp',YX+72,YY+30),at('bench',YX+24,YY+92),at('plant',YX+70,YY+92),at('plant',YX+84,YY+92)]),
 'archive':('서고 뒤 집','새김 방',[at('bookcase',OX+18,OY+50),at('bookcase',OX+44,OY+50),at('lamp',OX+68,OY+48),at('lectern',OX+30,FLOOR_B-8),at('lectern',OX+54,FLOOR_B-8)],
           [at('lectern',YX+24,YY+30),at('lamp',YX+72,YY+30),at('bench',YX+24,YY+92),at('planterbox',YX+76,YY+92)]),
 'forge':('대장간 골목 집','작은 화덕',[o for o in d['defaults'] if OX<=o['x']<OX+OW and OY<=o['y']<OY+OH+8],
           yard_items),
 'belfry':('종탑 아래 집','망루',[at('clock',OX+13,OY+50),at('window',OX+38,OY+26),at('window',OX+60,OY+26),at('bellstand',OX+50,OY+66),at('rug',OX+46,FLOOR_B-8),at('chair',OX+16,FLOOR_B),at('f_crate',OX+66,FLOOR_B)],
           [at('planterbox',YX+24,YY+30),at('lamp',YX+72,YY+30),at('bench',YX+24,YY+92),at('plant',YX+80,YY+92)]),
 'plaza':('광장 앞 집','앞뜰',[at('window',OX+30,OY+26),at('window',OX+50,OY+26),at('well',OX+40,FLOOR_B-14),at('sign',OX+16,FLOOR_B),at('plant',OX+64,FLOOR_B),at('plant',OX+14,OY+46),at('plant',OX+66,OY+46)],
           [at('planterbox',YX+24,YY+30),at('lamp',YX+72,YY+30),at('bench',YX+24,YY+92),at('bench',YX+72,YY+92)]),
}
