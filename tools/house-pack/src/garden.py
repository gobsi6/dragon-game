import numpy as np
from PIL import Image
FA='/home/claude/dot/Fantasy RPG asset pack/1x/'
def frame(path,i,w=16):
    im=Image.open(FA+path).convert('RGBA'); f=im.crop((i*w,0,i*w+w,im.height)); return f.crop(f.getbbox())
def bed(crop='Objects/Crops (carrot).png', stage=2, n=3, W=44, H=14):
    D=np.array(Image.open(FA+'Tileset/Dirt.png').convert('RGBA'))[22:32,50:78].astype(float)   # 맨흙 타일
    soil=np.zeros((H,W,4)); 
    for y in range(H):
        for x in range(W): soil[y,x]=D[y%D.shape[0],x%D.shape[1]]
    dark=D[:,:,:3].reshape(-1,3).min(axis=0)*0.85; lite=np.clip(D[:,:,:3].reshape(-1,3).mean(axis=0)*1.18,0,255)
    for x in range(W): soil[0,x,:3]=dark; soil[H-1,x,:3]=dark; soil[1,x,:3]=lite   # 두둑 테두리와 윗면 밝은 줄
    for y in range(H): soil[y,0,:3]=dark; soil[y,W-1,:3]=dark
    for k in (4,8):   # 고랑 두 줄
        for x in range(2,W-2): soil[k,x,:3]=soil[k,x,:3]*0.8
    plant=frame(crop,stage); pw,ph=plant.size
    top=ph-H//2-2; out=Image.new('RGBA',(W,H+top),(0,0,0,0)); out.paste(Image.fromarray(soil.astype('uint8')),(0,top))
    for i in range(n):
        cx=int((i+0.5)*W/n); out.alpha_composite(plant,(cx-pw//2, top+H//2+3-ph))
    return out
