import numpy as np
from PIL import Image
def make(small=True):
    s=np.array(Image.open('/home/claude/dot/Fantasy RPG asset pack/1x/Objects/Wooden sign.png').convert('RGBA')).astype(float)
    P=np.array([246,239,224,255.]); Ln=np.array([170,150,120,255.]); Sh=np.array([214,200,176,255.])
    def paper(x0,y0,w,h):
        for y in range(y0,y0+h):
            for x in range(x0,x0+w): s[y,x]=P
        for x in range(x0,x0+w): s[y0+h,x]=Sh
        for yy in range(y0+1,y0+h-1,2):
            for x in range(x0+1,x0+w-1): s[yy,x]=Ln
    if small: paper(4,4,4,4); paper(9,5,3,4)
    else: paper(3,3,5,6); paper(9,4,4,5)
    return Image.fromarray(s.astype('uint8'))
