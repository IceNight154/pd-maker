import re
def parse(path):
    s=open(path,encoding='utf-8').read()
    if 'class Icons' in s: s=s[:s.index('class Icons')]   # 안쪽 Icons 클래스(item_icons.png)는 제외
    scale=int(re.search(r'int scale\s*=\s*(\d+)',s).group(1)) if 'int scale' in s else 1
    W=16*scale
    env={}
    def xy(x,y): return (x-1)+W*(y-1)
    def idx(i): return i+16 if (scale>1 and i>=16) else i
    env.update(xy=xy, idx=idx, WIDTH=W, scale=scale, SIZE=16*scale)
    out={}
    for m in re.finditer(r'(public|private)?\s*static\s+final\s+int\s+(\w+)\s*=\s*([^;]+);',s):
        pub,n,e=m.group(1),m.group(2),m.group(3)
        if n in('WIDTH','SIZE','scale'): continue
        try:
            v=eval(e,{},env); env[n]=v
            if pub=='public': out[n]=v
        except Exception as ex: pass
    return out,scale
