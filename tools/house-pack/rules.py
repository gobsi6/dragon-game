import json
P=json.load(open('/home/claude/rel/dragon-game-main/public/house/pack.json'))
W,H=P['W'],P['H']
def hit(x,y,w,h,b): return x<b[0]+b[2] and b[0]<x+w and y<b[1]+b[3] and b[1]<y+h
def inb(x,y,w,h,b): return x>=b[0] and y>=b[1] and x+w<=b[0]+b[2] and y+h<=b[1]+b[3]
def where(s,x,y,done):
    sp=P['sprites'][s]; w,h=sp['w'],sp['h']
    for rid,(rx,ry,rw,rh) in P['rooms'].items():
        if not (rx<=x+w/2<rx+rw and ry<=y+h/2<ry+rh+6): continue
        if rid not in done: return '아직 되살리지 않은 칸이다.'
        if not (x>=rx+5 and x+w<=rx+rw-5 and y>=ry+3 and y+h<=ry+rh+2): return '방 벽 안쪽에 놓아야 한다.'
        if rid=='live' and y+h>ry+rh-7 and x<P['door'][1] and P['door'][0]<x+w: return '문 앞은 비워 둬야 한다.'
        return None
    if 'yard' not in done: return '마당을 되살린 뒤에 놓을 수 있다.'
    Y=P['yard']
    if hit(x,y,w,h,Y): return None if (x>=Y[0]+2 and y>=Y[1]-10 and y+h>=Y[1]+6 and x+w<=Y[0]+Y[2]-2 and y+h<=Y[1]+Y[3]-2) else '마당 돌 안쪽에 놓아야 한다.'
    if not (x>=9 and y>=9 and x+w<=W-9 and y+h<=H-9): return '바깥 담 안에 놓아야 한다.'
    if any(hit(x,y,w,h,b) for b in P['block']): return '건물이나 길 위에는 놓을 수 없다.'
    return None
def layer(s): return P['sprites'][s].get('layer','')
def check(items,done):
    errs=[]
    for i,o in enumerate(items):
        e=where(o['s'],o['x'],o['y'],done)
        if e: errs.append((i,o['s'],e)); continue
        L=layer(o['s'])
        if L=='flat': continue
        sp=P['sprites'][o['s']]
        for j,q in enumerate(items[:i]):
            if layer(q['s'])!=L or L=='flat': continue
            sq=P['sprites'][q['s']]
            if hit(o['x'],o['y'],sp['w'],sp['h'],[q['x'],q['y'],sq['w'],sq['h']]): errs.append((i,o['s'],'겹침 '+q['s']))
    return errs
if __name__=='__main__':
    for plot,items in P['defaults'].items(): print(plot, check(items,['yard','live','own','work']))
