import sys; sys.path.insert(0,'/home/claude/pack')
# 16×16 타일 격자에 맞춘 Franuka 시안: 모든 바닥·벽이 타일 단위로 딱 떨어지게
from PIL import Image
import random, numpy as np
from scipy import ndimage
B='/home/claude/fr/1x/'
MAIN=Image.open(B+'Fantasy RPG Interior Pack (16x16 grid).png').convert('RGBA')
WS=Image.open(B+'Expansion_Workshop.png').convert('RGBA')
def comp(sheet,x,y):
    A=np.array(sheet); lab,_=ndimage.label(A[:,:,3]>0,structure=np.ones((3,3))); l=lab[y,x]; assert l,(x,y)
    m=lab==l; ys,xs=np.where(m); a=A.copy(); a[~m]=0
    return Image.fromarray(a[ys.min():ys.max()+1, xs.min():xs.max()+1])
SP={'bed':comp(MAIN,272,215),'bookcase':comp(MAIN,480,485),'table':comp(MAIN,48,255),'lamp':comp(MAIN,472,312),'chair':comp(MAIN,150,330),
 'barrel':comp(MAIN,326,215),'pot':comp(MAIN,358,214),'anvil':comp(WS,135,23),'furnace':comp(WS,75,20),'worktable':comp(WS,16,20),'plant':comp(MAIN,376,210),
 'rug':comp(MAIN,24,485),'cabinet':comp(MAIN,15,215),'candel':comp(MAIN,440,345),'boxes':comp(WS,108,20)}
def nine(img,w,h,b=8):
    W0,H0=img.size; src=np.array(img); dst=np.zeros((h,w,4),np.uint8)
    xs=[i if i<b else (W0-(w-i) if i>=w-b else b+((i-b)%(W0-2*b))) for i in range(w)]
    ys=[j if j<b else (H0-(h-j) if j>=h-b else b+((j-b)%(H0-2*b))) for j in range(h)]
    for j in range(h): dst[j]=src[ys[j]][xs]
    return Image.fromarray(dst)
SP['rug']=nine(SP['rug'],48,32,8)

# 마당 돌길: Fantasy RPG asset pack의 Roads_stone (16×16, 왼쪽 3×3 묶음). 채도를 빼서 회색 쪽으로
_RS=np.array(Image.open('/home/claude/dot/Fantasy RPG asset pack/1x/Tileset/Roads_stone.png').convert('RGBA')).astype(float)
_L=(_RS[:,:,0]*0.299+_RS[:,:,1]*0.587+_RS[:,:,2]*0.114)[...,None]
RS=_RS.copy(); RS[:,:,:3]=_L*0.82+_RS[:,:,:3]*0.18+np.array([4,2,0])   # 거의 회색, 따뜻한 기운만 살짝
_m=RS[:,:,:3][RS[:,:,3]>0].mean(axis=0); RS[:,:,:3]=_m+(RS[:,:,:3]-_m)*0.68   # 대비 낮춤: 밝고 어두운 차이를 68%로 (평균 밝기는 그대로)
RS[:,:,:3]=np.clip(RS[:,:,:3]*1.06+6,0,255)   # 전체를 조금 밝게
ROAD=set(); LINK=set()   # LINK: 건물 문 안쪽 칸 (그리지 않고, 그쪽 테두리를 열어 두는 데만 씀)
RN=lambda p: p in ROAD or p in LINK
def add_road(tx,ty,tw,th):
    for j in range(ty,ty+th):
        for i in range(tx,tx+tw): ROAD.add((i,j))
def draw_roads():   # 이웃이 길(또는 건물 문)이 아닌 쪽에만 테두리 돌을 두름
    for (i,j) in ROAD:
        L,Rr,U,Dn=RN((i-1,j)),RN((i+1,j)),RN((i,j-1)),RN((i,j+1))
        cx=1 if (L and Rr) else (0 if not L else 2)
        cy=1 if (U and Dn) else (0 if not U else 2)
        t=RS[cy*16:cy*16+16, cx*16:cx*16+16]
        for yy in range(16):
            for xx in range(16):
                if t[yy,xx,3]>0: put(i*TS+xx,j*TS+yy,t[yy,xx,:3])
    # 안쪽 모서리: 두 옆 칸은 길인데 대각선 칸만 길이 아니면, 그 모서리를 '액자 이음'으로 채움.
    #  팩 테두리는 변마다 두께가 조금씩 달라서(위 6, 아래 7, 왼쪽 5, 오른쪽 6도트), 변마다 두께를 재서 그 크기로 잇는다
    def thick(tile,axis,from_end):   # 바깥쪽 끝에서 안쪽 윤곽선(두 번째 진한 줄)까지의 두께
        line=tile[:,8,0] if axis=='v' else tile[8,:,0]
        idx=range(15,-1,-1) if from_end else range(16)
        dark=[k for n,k in enumerate(idx) if line[k]<0x90]
        return (abs(dark[1]-(15 if from_end else 0))+1) if len(dark)>1 else 6
    for (i,j) in ROAD:
        for dx,dy in ((-1,-1),(1,-1),(-1,1),(1,1)):
            if RN((i+dx,j)) and RN((i,j+dy)) and not RN((i+dx,j+dy)):
                Hs=RS[(0 if dy<0 else 32):(0 if dy<0 else 32)+16, 16:32]     # 위(또는 아래) 변 타일
                Vs=RS[16:32, (0 if dx<0 else 32):(0 if dx<0 else 32)+16]     # 왼(또는 오른) 변 타일
                # 두께는 색 조정 전 원본 타일로 잰다 (대비·밝기를 바꾸면 진한 선 판별이 틀어지므로)
                Hs0=_RS[(0 if dy<0 else 32):(0 if dy<0 else 32)+16, 16:32]; Vs0=_RS[16:32, (0 if dx<0 else 32):(0 if dx<0 else 32)+16]
                th=thick(Hs0,'v',dy>0); tv=thick(Vs0,'h',dx>0)
                for v in range(th):
                    for u in range(tv):
                        px_=u if dx<0 else 15-u; py_=v if dy<0 else 15-v
                        p=Hs[py_,px_] if u*th<=v*tv else Vs[py_,px_]
                        if p[3]>0: put(i*TS+px_,j*TS+py_,p[:3])

def tile(sheet,x,y,w=16,h=16): return np.array(sheet.crop((x,y,x+w,y+h)))[:,:,:3].astype(float)
T_PLANK=tile(MAIN,96,32); T_ORANGE=tile(MAIN,112,32); T_STONE=tile(MAIN,192,48); T_YARD=tile(MAIN,96,80)
import colorsys
def beige(a, hue=0.08, sat=0.72):   # 붉은 자주빛 벽을 베이지·갈색 쪽으로: 색상을 노란 갈색으로 옮기고 채도를 낮춤 (밝기는 그대로)
    a=np.array(a,float); sh=a.shape; f=a.reshape(-1,3)/255.0; out=np.empty_like(f)
    for k,(r,g,b) in enumerate(f):
        h,sv,v=colorsys.rgb_to_hsv(r,g,b); out[k]=colorsys.hsv_to_rgb(hue,sv*sat,min(1,v*1.16+0.03))
    return (out*255).reshape(sh)
F_WOOD=beige(tile(MAIN,160,0,16,32)); F_BRICK=beige(tile(MAIN,400,0,16,32))
T_PLANK=beige(T_PLANK,0.08,0.7); T_ORANGE=beige(T_ORANGE,0.075,0.8); T_STONE=beige(T_STONE,0.08,0.65)   # 바닥도 같은 톤으로 (작업실 주황 마루는 조금 더 진한 황갈색)
TS=16; WT,HT=20,15; W,H=WT*TS,HT*TS
img=np.zeros((H,W,3),float)
hx=lambda h: np.array([int(h[i:i+2],16) for i in (1,3,5)],float)
C={k:hx(v) for k,v in dict(OL='#5a4a3c',cap='#8f4d57',g1='#ede3d0',g2='#e4d8c2',g3='#f4ecdd',gr='#7a9c68',gl='#a4c488',aj='#d6c8ae',a6='#a8926c').items()}
def put(x,y,c):
    if 0<=x<W and 0<=y<H: img[y,x]=C[c] if isinstance(c,str) else c
def shade(x,y,a):
    if 0<=x<W and 0<=y<H: img[y,x]=img[y,x]*(1-a)+np.array([50,30,40])*a
def fill_t(tx,ty,tw,th,t):   # 타일 단위 칸을 통째 타일로 채움 (잘리는 타일 없음)
    for j in range(th*TS):
        for i in range(tw*TS): put(tx*TS+i,ty*TS+j,t[j%t.shape[0],i%t.shape[1]])
R=random.Random(5); img[:]=C['g1']
for j in range(H):
    for i in range(W):
        r=R.random()
        if r<.03: img[j,i]=C['g2']
        elif r<.045: img[j,i]=C['g3']
# 칸 (타일 단위 x, y, 가로, 세로): 안쪽 = 벽 앞면 2줄 + 바닥
ROOMS={'live':(6,1,8,5),'own':(1,7,5,6),'work':(14,7,5,6)}
YARD=(7,7,6,6); PATH=(9,13,2,2)
add_road(*YARD); add_road(*PATH)
for (tx,ty,tw,th) in ROOMS.values():   # 건물 그림자: 오른쪽 벽과 아랫벽 앞면 바로 바깥에 붙여서 (빛은 왼쪽 위)
    x,y,w,h=tx*TS,ty*TS,tw*TS,th*TS
    for j in range(y+4,y+h+8):
        shade(x+w,j,.26); shade(x+w+1,j,.12)
    for i in range(x,x+w+2):   # 아래 그림자: 건물 왼쪽 끝부터
        shade(i,y+h+8,.24); shade(i,y+h+9,.1)
def building(key,floor,face):
    tx,ty,tw,th=ROOMS[key]; x,y,w,h=tx*TS,ty*TS,tw*TS,th*TS
    fill_t(tx,ty,tw,th,floor)
    for j in range(32):
        for i in range(w): put(x+i,y+j,face[j,i%16])
    for j in range(3):
        for i in range(x,x+w): shade(i,y+32+j,(.32,.18,.08)[j])
    for j in range(8):   # 아랫벽 바깥 앞면 (칸 바로 아래 땅 줄에)
        for i in range(x,x+w):
            put(i,y+h+j, C['OL'] if j==7 or i in (x,x+w-1) else face[(j+20)%32,(i-x)%16])
building('live',T_PLANK,F_WOOD); building('own',T_STONE,F_BRICK); building('work',T_ORANGE,F_WOOD)
FRAME={'wood':(0,0),'stone':(0,96)}   # 팩의 벽 윗면 테두리 (3×3타일 묶음)
def frame(key,style):
    tx,ty,tw,th=ROOMS[key]; sx,sy=FRAME[style]
    for j in range(th):
        for i in range(tw):
            cx=0 if i==0 else (2 if i==tw-1 else 1); cy=0 if j==0 else (2 if j==th-1 else 1)
            if cx==1 and cy==1: continue
            t=np.array(MAIN.crop((sx+cx*16,sy+cy*16,sx+cx*16+16,sy+cy*16+16))).astype(float); t[:,:,:3]=beige(t[:,:,:3])
            for yy in range(16):
                for xx in range(16):
                    if t[yy,xx,3]>200: put((tx+i)*TS+xx,(ty+j)*TS+yy,t[yy,xx,:3].astype(float))
frame('live','wood'); frame('own','stone'); frame('work','wood')
def clear(tx,ty,t,dy=0):   # 문 자리: 테두리를 걷어 내고 바닥 타일을 다시 깖
    for j in range(16):
        for i in range(16): put(tx*TS+i,ty*TS+j,t[j%16,i%16])
def path_t(tx,ty,tw,th, posts=None):   # 문 길: 타일로 깔고, 벽 끊긴 자리에 문기둥
    fill_t(tx,ty,tw,th,T_YARD)
    if posts:
        for (px_,y0,y1) in posts:
            for j in range(y0,y1): put(px_,j,'OL'); put(px_+1,j,'OL')
# 거처 아래 문 (위 칸과 마당 사이 한 줄)
clear(9,5,T_PLANK); clear(10,5,T_PLANK); add_road(9,6,2,1); LINK.update({(9,5),(10,5)})
# 옆문: 고유 칸 ↔ 마당, 마당 ↔ 작업실
for r in (9,10): clear(5,r,T_STONE); clear(14,r,T_ORANGE)
# 문 때문에 끊긴 테두리 끝: 벽돌·판자 한 칸이 딱 끝나는 모양으로 마감
#  끝줄 = 진한 윤곽선(가로질러), 그 안쪽 한 줄 = 밝은 테 (팩 테두리의 줄눈 모양과 같음)
B_=lambda rgb: beige(np.array([[rgb]],float))[0,0]
DARK=B_((82,51,63)); HI_S=B_((208,156,142)); HI_W=B_((189,106,98))
def cap_v(x0,x1,y_line,y_hi,hi):   # 세로 테두리(폭 x0..x1)의 위/아래 끝
    for x in range(x0,x1+1): put(x,y_line,DARK)
    for x in range(x0+1,x1): put(x,y_hi,hi)
def cap_h(y0,y1,x_line,x_hi,hi):   # 가로 테두리(높이 y0..y1)의 왼/오른 끝
    for y in range(y0,y1+1): put(x_line,y,DARK)
    for y in range(y0+1,y1): put(x_hi,y,hi)
# 벽 테두리 끝을 문 길 테두리의 '안쪽 윤곽선'과 같은 줄에 맞춤: 테두리를 그 줄까지 늘려 그리고 거기서 닫음
def rim_rows(style,side):   # 변 타일에서 테두리 줄무늬 한 줄(세로 변은 한 행, 가로 변은 한 열)
    sx,sy=FRAME[style]
    if side=='R': t=np.array(MAIN.crop((sx+32,sy+16,sx+48,sy+32))).astype(float)[0,11:16]
    elif side=='L': t=np.array(MAIN.crop((sx,sy+16,sx+16,sy+32))).astype(float)[0,0:5]
    else: t=np.array(MAIN.crop((sx+16,sy+32,sx+32,sy+48))).astype(float)[9:16,0]
    return beige(t[:,:3])
def ext_v(style,side,x0,y0,y1):   # 세로 테두리를 y0..y1까지 늘림
    pat=rim_rows(style,side)
    for y in range(y0,y1+1):
        for k,x in enumerate(range(x0,x0+5)): put(x,y,pat[k])
def ext_h(style,x0,x1,y0):        # 가로(아랫벽) 테두리를 x0..x1까지 늘림
    pat=rim_rows(style,'B')
    for x in range(x0,x1+1):
        for k in range(7): put(x,y0+k,pat[k])
# 옆문 길: 위 테두리 안쪽 윤곽선 = 9*TS+5, 아래 테두리 안쪽 윤곽선 = 11*TS-7
UP_IN, DN_IN = 9*TS+5, 11*TS-7
ext_v('stone','R',5*TS+11,9*TS,UP_IN); cap_v(5*TS+11,6*TS-1,UP_IN,UP_IN-1,HI_S)
ext_v('stone','R',5*TS+11,DN_IN,11*TS-1); cap_v(5*TS+11,6*TS-1,DN_IN,DN_IN+1,HI_S)     # 고유 칸 오른쪽 벽
ext_v('wood','L',14*TS,9*TS,UP_IN); cap_v(14*TS,14*TS+4,UP_IN,UP_IN-1,HI_W)
ext_v('wood','L',14*TS,DN_IN,11*TS-1); cap_v(14*TS,14*TS+4,DN_IN,DN_IN+1,HI_W)          # 작업실 왼쪽 벽
# 거처 아래 문 길: 왼쪽 테두리 안쪽 윤곽선 = 9*TS+4, 오른쪽 = 11*TS-6
LF_IN, RT_IN = 9*TS+4, 11*TS-6
def cap_live(x_line,x_hi):   # 거처 아랫벽 끝: 밝은 테는 위쪽(밝은 줄까지)만, 아래로는 빛 없이. 아래 벽 앞면에도 세로 선을 그어 돌길과 구분
    y0=5*TS+9
    for y in range(y0,6*TS): put(x_line,y,DARK)
    for y in range(y0+1,y0+4): put(x_hi,y,HI_W)
    for y in range(6*TS,6*TS+8): put(x_line,y,DARK)
cap_live(9*TS-1,9*TS-2); cap_live(11*TS,11*TS+1)       # 거처 아랫벽: 돌길 바깥 선 바로 앞에서 닫음 (문 안쪽은 방 바닥)

add_road(6,9,1,2); add_road(13,9,1,2); LINK.update({(5,9),(5,10),(14,9),(14,10)}); add_road(9,15,2,1)   # 맨 아래 바깥 한 줄: 입구 길이 그림 밖으로 이어지게 (테두리 없이)
draw_roads()
# 바깥 담 (옅게): 바깥 선·안쪽 선을 각각 한 바퀴 이어진 사각형으로 (모서리에서 끊기지 않게). 입구 길 자리만 비우고 끝을 막음
GAP0,GAP1=9*TS-2,11*TS+2
def ring(inset,col):
    x0,y0,x1,y1=inset,inset,W-1-inset,H-1-inset
    for i in range(x0,x1+1):
        put(i,y0,col)
        if not GAP0<=i<GAP1: put(i,y1,col)
    for j in range(y0,y1+1): put(x0,j,col); put(x1,j,col)
ring(5,'aj'); ring(4,'a6')
for x in (GAP0-1,GAP1): put(x,H-6,'a6')   # 입구 양옆: 두 줄 끝을 진한 선으로 막음
FT='/home/claude/dot/Fantasy RPG asset pack/1x/Tileset/'
LEAF=[Image.open(FT+n).convert('RGBA') for n in ['Leaves_1.png','Leaves_2.png','Leaves_3.png']]  # 작은 풀잎만
FLOW=[Image.open(FT+f'Flower_{i}.png').convert('RGBA') for i in (1,2,5,6)]
busy=set()
for (tx,ty,tw,th) in list(ROOMS.values())+[YARD,PATH,(6,9,1,2),(13,9,1,2),(9,6,2,1)]:
    for j in range(ty-1,ty+th+1):
        for i in range(tx-1,tx+tw+1): busy.add((i,j))
free=[(i,j) for j in range(1,HT) for i in range(1,WT-1) if (i,j) not in busy]
RL=random.Random(11); RL.shuffle(free)
BLOCK=[]
for (tx,ty,tw,th) in ROOMS.values(): BLOCK.append((tx*TS-6,ty*TS-6,tw*TS+12,th*TS+22))   # 벽 두께·아랫벽 앞면·그림자까지
for (tx,ty,tw,th) in [YARD,PATH,(6,9,1,2),(13,9,1,2),(9,6,2,1)]: BLOCK.append((tx*TS-4,ty*TS-4,tw*TS+8,th*TS+8))
def okpx(x,y): return 9<=x<W-9 and 9<=y<H-9 and not any(bx<=x<bx+bw and by<=y<by+bh for bx,by,bw,bh in BLOCK)
def stamp(im,x,y):
    a=np.array(im)
    if not all(okpx(x+i,y+j) for j in range(a.shape[0]) for i in range(a.shape[1]) if a[j,i,3]>0): return   # 한 픽셀이라도 건물·길에 닿으면 놓지 않음
    for j in range(a.shape[0]):
        for i in range(a.shape[1]):
            if a[j,i,3]>200: put(x+i,y+j,a[j,i,:3].astype(float))
# 불규칙 배치: 아무 자리나 고르되, 이미 놓인 풀잎과 MIN도트 이상 떨어진 자리에만 (푸아송 원반처럼)
MIN=40; spots=[]
def fits(im,x,y):
    a=np.array(im); return all(okpx(x+i,y+j) for j in range(a.shape[0]) for i in range(a.shape[1]) if a[j,i,3]>0)
for _ in range(4000):
    im_=RL.choice(LEAF); x=RL.randrange(10,W-26); y=RL.randrange(10,H-26)
    cx,cy=x+8,y+8
    if any((cx-p)**2+(cy-q)**2<MIN*MIN for p,q in spots): continue
    if not fits(im_,x,y): continue
    spots.append((cx,cy)); stamp(im_,x,y)
print('leaves',len(spots))
KEEP={'furnace','candel','lamp'}   # 불이 들어가는 것은 팩 원래 색 그대로
def unred(a):   # 가구의 붉은·자줏빛만 골라 베이지 갈색으로 (초록 잎, 파란 병, 노란 불빛 등은 그대로, 밝고 진한 불꽃색도 그대로)
    a=a.astype(float).copy()
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y,x,3]==0: continue
            r,g,b=a[y,x,:3]/255.0; h,sv,v=colorsys.rgb_to_hsv(r,g,b)
            if sv<0.08 or (sv>0.6 and v>0.8): continue
            if h>=0.80 or h<=0.06:
                rr,gg,bb=colorsys.hsv_to_rgb(0.075,min(1,sv*0.9),v*0.98); a[y,x,:3]=(rr*255,gg*255,bb*255)
    return a
def soften(a, k=0.5, keepfire=False):   # 색은 그대로 두고 채도만 낮춤. keepfire: 밝고 진한 불꽃 픽셀은 그대로
    a=a.astype(float).copy()
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y,x,3]==0: continue
            r,g,b=a[y,x,:3]/255.0; h,sv,v=colorsys.rgb_to_hsv(r,g,b)
            if keepfire and sv>0.55 and v>0.8: continue
            rr,gg,bb=colorsys.hsv_to_rgb(h,sv*k,v); a[y,x,:3]=(rr*255,gg*255,bb*255)
    return a
def toward_beige(a, t=0.5, k=0.72, keepfire=True):   # 불 가구: 불꽃은 그대로, 나머지(벽돌·틀)는 색상을 베이지 갈색 쪽으로 t만큼 당기고 채도를 k배
    a=a.astype(float).copy(); H=0.075
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            if a[y,x,3]==0: continue
            r,g,b=a[y,x,:3]/255.0; h,sv,v=colorsys.rgb_to_hsv(r,g,b)
            if keepfire and sv>0.55 and v>0.8: continue
            d=((H-h+0.5)%1.0)-0.5; h=(h+d*t)%1.0
            rr,gg,bb=colorsys.hsv_to_rgb(h,sv*k,v); a[y,x,:3]=(rr*255,gg*255,bb*255)
    return a
PLACED_OUT=[]
def proc(n):
    s=np.array(SP[n]); return toward_beige(s,0.35,0.82,False) if n=='candel' else (toward_beige(s) if n in KEEP else (s if n=='rug' else unred(s)))
def place(n,tx,ty,dx=0,dy=0):
    s=SP[n]; sh,sw=np.array(s).shape[:2]; X=tx*TS+dx; Y=(ty+1)*TS-sh+dy
    for (rtx,rty,rtw,rth) in ROOMS.values():   # 기본 배치는 앞쪽 벽에 가리지 않게 바닥 위에 세움
        rx,ry,rw,rh=rtx*TS,rty*TS,rtw*TS,rth*TS
        if rx<=X+sw/2<rx+rw and ry<=Y+sh/2<ry+rh+8: Y=min(Y,ry+rh-7-sh)
    PLACED_OUT.append({'s':n,'x':int(X),'y':int(Y)})
# ── 게임 기본 가구(대장간 골목 집)를 팩 가구로 짝지어 놓기 ──
FO='/home/claude/dot/Fantasy RPG asset pack/1x/Objects/'
def obj(n): im=Image.open(FO+n).convert('RGBA'); return im.crop(im.getbbox())
SP.update({'f_barrel':obj('Barrel.png'),'f_crate':obj('Crate.png'),'f_anvil':obj('Anvil.png'),'f_stool':obj('Stool.png'),
  'bench':comp(MAIN,55,312),'dishshelf':comp(MAIN,45,215)})
# 거처: 침대 · 깔개 · 탁자 · 나무 상자
place('bed',7,3,0); place('table',11,3,4); place('rug',9,5,0,0); place('f_crate',13,5,0)
# 고유 칸(대장간): 화덕 · 모루 · 작업대 · 통 · 나무 상자
place('furnace',1,9,0); place('worktable',3,9,0); place('anvil',2,11,4); place('f_barrel',1,12,4); place('f_crate',4,12,4)
# 작업실: 선반 · 작업대 · 통 2 · 나무 상자
place('dishshelf',14,9,4); place('worktable',16,9,0); place('f_barrel',14,12,4); place('f_barrel',15,12,4); place('f_crate',18,12,0)
# 마당: 모루 · 등 · 벤치 · 통 · 나무 상자
place('anvil',8,8,2); place('lamp',11,8,6); place('bench',7,12,1); place('f_barrel',7,10,4); place('f_crate',12,12,0)

import json, base64, io
FO2='/home/claude/dot/Fantasy RPG asset pack/1x/'
def objt(p): im=Image.open(FO2+p).convert('RGBA'); return im.crop(im.getbbox())
AL='/home/claude/fr/1x/Expansion_AlchemyLab.png'; ALI=Image.open(AL).convert('RGBA')
SP.update({'chest':obj('Chest_small.png').crop((0,0,16,16)), 'sign':__import__('sign_paper').make(True), 'torch':obj('Torch.png'),
  'well':objt('Tileset/Well_1.png'), 'bush':objt('Tileset/Bush_A.png'), 'flower':objt('Tileset/Flower_2.png'),
  'garden':__import__('garden').bed(), 'garden2':__import__('garden').bed('Objects/Crops (berries).png',2), 'garden3':__import__('garden').bed('Objects/Crops (sunflower).png',2), 'mushroom':__import__('garden').frame('Objects/Mushroom_1.png',0), 'rock':objt('Tileset/Rock_1.png'),
  'f_waterbarrel':obj('Barrel_water.png')})
SP['chest']=SP['chest'].crop(SP['chest'].getbbox())
NAMES={'bed':'침대','table':'탁자','rug':'깔개','f_crate':'나무 상자','f_barrel':'통','f_waterbarrel':'물통','anvil':'모루',
 'furnace':'화덕','worktable':'작업대','dishshelf':'선반','bookcase':'책장','cabinet':'옷장','chair':'의자','f_stool':'걸상','bench':'벤치',
 'lamp':'등','candel':'촛대','plant':'화분','chest':'보물 상자','sign':'방명록 받침','torch':'횃불','well':'우물','bush':'덤불','flower':'들꽃',
 'garden':'텃밭','garden2':'열매 텃밭','garden3':'해바라기 화단','mushroom':'버섯','rock':'바위','boxes':'짐 더미'}
def uri(arr):
    im=Image.fromarray(np.clip(arr,0,255).astype('uint8'),'RGBA'); b=io.BytesIO(); im.save(b,'PNG'); return 'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode()
sprites={}
for n in NAMES:
    a=np.array(SP[n]).astype(float)
    p=proc(n) if n in SP else a
    p=np.array(p,float)
    if p.shape[2]==3: p=np.dstack([p,a[:,:,3]])
    else: p[:,:,3]=a[:,:,3]
    sprites[n]={'name':NAMES[n],'w':int(p.shape[1]),'h':int(p.shape[0]),'src':uri(p)}
base=np.dstack([img.clip(0,255),np.full((H,W),255)])
# 앞쪽 벽(아랫벽 테두리 + 바깥 앞면): 가구 위에 다시 그릴 층
front=np.zeros((H,W,4))
ROOMPX={k:(tx*TS,ty*TS,tw*TS,th*TS) for k,(tx,ty,tw,th) in ROOMS.items()}
for k,(x,y,w,h) in ROOMPX.items():
    for yy in range(y+h-7,y+h+8):
        for xx in range(x,x+w):
            if k=='live' and 9*TS<=xx<11*TS and yy<y+h+8: continue   # 거처 아래 문 자리(돌길)는 비움
            front[yy,xx,:3]=base[yy,xx,:3]; front[yy,xx,3]=255
data={'W':W,'H':H,'TS':TS,'base':uri(base),'front':uri(front),'sprites':sprites,'defaults':PLACED_OUT,
 'rooms':{k:list(v) for k,v in ROOMPX.items()},'yard':[YARD[0]*TS,YARD[1]*TS,YARD[2]*TS,YARD[3]*TS],
 'roads':sorted([list(t) for t in ROAD]),'block':[list(b) for b in BLOCK],'doorLive':[LF_IN,RT_IN]}
json.dump(data,open('/home/claude/pack/editor_data.json','w'),ensure_ascii=False)
print('exported',len(sprites),len(PLACED_OUT))
