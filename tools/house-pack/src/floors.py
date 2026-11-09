import numpy as np, colorsys
from PIL import Image
FR='/home/claude/fr/1x/'
MAIN=Image.open(FR+'Fantasy RPG Interior Pack (16x16 grid).png').convert('RGBA')
MUS=Image.open(FR+'Expansion_Music.png').convert('RGBA'); ALC=Image.open(FR+'Expansion_AlchemyLab.png').convert('RGBA')
def beige(a, hue=0.08, sat=0.72):
    a=np.array(a,float); sh=a.shape; f=a.reshape(-1,3)/255.0; out=np.empty_like(f)
    for k,(r,g,b) in enumerate(f):
        h,sv,v=colorsys.rgb_to_hsv(r,g,b); out[k]=colorsys.hsv_to_rgb(hue,sv*sat,min(1,v*1.16+0.03))
    return (out*255).reshape(sh)
def soft(a,k=0.8):
    a=np.array(a,float); sh=a.shape; f=a.reshape(-1,3)/255.0; out=np.empty_like(f)
    for i,(r,g,b) in enumerate(f):
        h,sv,v=colorsys.rgb_to_hsv(r,g,b)
        if h>=0.8 or h<=0.06: out[i]=colorsys.hsv_to_rgb(0.08,sv*0.72,min(1,v*1.16+0.03))
        else: out[i]=colorsys.hsv_to_rgb(h,sv*k,min(1,v*1.06))
    return (out*255).reshape(sh)
def t(sheet,x,y,s=16): return np.array(sheet.crop((x,y,x+s,y+s)))[:,:,:3].astype(float)
FLOORS=[ # id, 이름, 타일, 처리
 ('plank','나무 마루',beige(t(MAIN,96,32),0.08,0.7)),
 ('orange','황갈색 마루',beige(t(MAIN,112,32),0.075,0.8)),
 ('stone','돌바닥',beige(t(MAIN,192,48),0.08,0.65)),
 ('mauve','짙은 마루',soft(t(MAIN,128,32))),
 ('brick','벽돌 바닥',soft(t(MAIN,176,32))),
 ('brick2','붉은 벽돌 바닥',soft(t(MAIN,192,32))),
 ('square','네모 타일',soft(t(MAIN,112,48))),
 ('frame','테 두른 타일',soft(t(MAIN,96,64))),
 ('plain','맨 타일',soft(t(MAIN,112,80))),
 ('ornate','무늬 타일',soft(t(MAIN,144,32))),
 ('ornate2','진한 무늬 타일',soft(t(MAIN,160,48))),
 ('starry','별빛 카펫',soft(t(MAIN,176,48))),
 ('hb1','쪽모이 마루',soft(t(MUS,160,0,32))),
 ('hb2','밝은 쪽모이 마루',soft(t(MUS,192,0,32))),
 ('hb4','초록 쪽모이 마루',soft(t(MUS,256,0,32))),
 ('checker','체크 타일',soft(t(ALC,304,0))),
 ('marble','흰 대리석',soft(t(ALC,320,0))),
 ('sand','금빛 모래',soft(t(ALC,320,16))),
]
ALC2=ALC
def tw(sheet,x,y): return np.array(sheet.crop((x,y,x+16,y+32)))[:,:,:3].astype(float)
WALLS=[ # id, 이름, 16×32 벽 타일 (아래쪽에 굽도리)
 ('wood','판자벽',beige(tw(MAIN,160,0))),
 ('brick','돌 벽돌벽',beige(tw(MAIN,400,0))),
 ('darkwood','짙은 판자벽',soft(tw(MAIN,208,0))),
 ('plainw','연한 살구 벽',soft(tw(MAIN,112,0))),
 ('cream','크림 벽지',soft(tw(MAIN,256,32))),
 ('redw','갈색 벽지',soft(tw(MAIN,256,0))),
 ('bluew','푸른 벽지',soft(tw(MAIN,304,0))),
 ('orangew','주황 벽지',soft(tw(MAIN,352,0))),
 ('pinkw','살구 벽지',soft(tw(MAIN,304,32))),
 ('greenw','초록 벽지',soft(tw(MAIN,400,32),0.6)),
 ('redbrick','붉은 벽돌벽',soft(tw(MAIN,448,0))),
 ('lightbrick','밝은 돌 벽돌벽',soft(tw(ALC2,192,0))),
]
