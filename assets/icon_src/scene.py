import sys, base64, math
sys.path.insert(0,__import__('os').path.dirname(__file__))

def squircle(cx, cy, size, n=3.0, pts=90):
    e = 0.30*size; h = size/2
    corners = [(cx+h-e, cy-h+e, 0), (cx+h-e, cy+h-e, 90), (cx-h+e, cy+h-e, 180), (cx-h+e, cy-h+e, 270)]
    out=[]
    for (ox, oy, start) in corners:
        for i in range(pts+1):
            t = math.radians(start - 90 + 90*i/pts)
            c, s_ = math.cos(t), math.sin(t)
            out.append(f"{ox+e*math.copysign(abs(c)**(2/n),c):.2f},{oy+e*math.copysign(abs(s_)**(2/n),s_):.2f}")
    return "M"+" L".join(out)+" Z"
def b64(p): return 'data:image/png;base64,'+base64.b64encode(open(__import__('os').path.join(__import__('os').path.dirname(__file__),'sources',p),'rb').read()).decode()

def html(mode="mac", detail="full"):
    T = 824 if mode=="mac" else 1024
    k = T/824
    tile = squircle(512,512,T)
    simple = detail=="simple"
    if simple:
        cards=[('pdf.png',-1,270,-30,-40),('design.png',1,270,30,-40),('formvis.png',0,340,0,40)]
    else:
        cards=[('more.png',-2,200,-40,-150),('design.png',2,200,40,-150),
               ('pdf.png',-1,236,-26,-60),('deck.png',1,236,26,-60),('formvis.png',0,276,0,30)]
    X = {0:0, 1:(200 if not simple else 232), 2:352}
    base_y = 512 + (82 if not simple else 92)*k
    items=[]
    for src,pos,size,rot,z in cards:
        s=size*k; x=512+math.copysign(X[abs(pos)],pos)*k - s/2 if pos else 512-s/2
        items.append(f'''<div class="card" style="left:{x:.1f}px;top:{base_y-s:.1f}px;width:{s:.1f}px;height:{s:.1f}px;transform:translateZ({z*k:.0f}px) rotateY({-rot}deg)"><img src="{b64(src)}"></div>''')
    shadow = f'<path d="{tile}" fill="#000" filter="url(#ts)"/>' if mode=="mac" else ''
    return f'''<!doctype html><html><head><style>
html,body{{margin:0;background:transparent}}
.wrap{{position:relative;width:1024px;height:1024px}}
svg.t{{position:absolute;inset:0}}
.scene{{position:absolute;inset:0;clip-path:path('{tile}');perspective:{1300*k:.0f}px;perspective-origin:512px {300*k:.0f}px}}
.bloom{{position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(255,79,122,.22),rgba(194,85,217,.10) 25%,rgba(154,92,255,.05) 50%,rgba(154,92,255,0) 72%)}}
.dock{{position:absolute;left:{512-(372 if not simple else 360)*k:.0f}px;width:{(744 if not simple else 720)*k:.0f}px;top:{base_y-(118 if not simple else 140)*k:.0f}px;height:{(176 if not simple else 196)*k:.0f}px;
 transform:translateZ({-40*k:.0f}px) rotateX(28deg);transform-origin:50% 100%;border-radius:{64*k:.0f}px;
 background:linear-gradient(180deg,rgba(255,255,255,.30),rgba(255,255,255,.12) 45%,rgba(255,255,255,.07));
 box-shadow:inset 0 {2*k:.1f}px 0 rgba(255,255,255,.55),inset 0 0 0 {1.5*k:.1f}px rgba(255,255,255,.22),0 {24*k:.0f}px {60*k:.0f}px rgba(0,0,0,.45)}}
.glow{{position:absolute;left:{512-330*k:.0f}px;width:{660*k:.0f}px;top:{base_y-40*k:.0f}px;height:{200*k:.0f}px;border-radius:50%;
 background:radial-gradient(closest-side,rgba(255,79,122,.55),rgba(154,92,255,.30) 55%,rgba(58,123,255,0));filter:blur({30*k:.0f}px)}}
.stage{{position:absolute;inset:0;transform-style:preserve-3d}}
.card{{position:absolute;transform-style:preserve-3d;filter:drop-shadow(0 {14*k:.0f}px {18*k:.0f}px rgba(0,0,0,.55));
 -webkit-box-reflect:below {4*k:.0f}px linear-gradient(transparent 86%,rgba(255,255,255,.20))}}
.card img{{width:100%;height:100%;display:block}}
.card::after{{content:'';position:absolute;inset:0;border-radius:23%;box-shadow:inset 0 0 0 {2.5*k:.1f}px rgba(255,255,255,.28),inset 0 {3*k:.1f}px 0 rgba(255,255,255,.22)}}
.rim{{position:absolute;inset:0}}
</style></head><body><div class="wrap">
<svg class="t" viewBox="0 0 1024 1024"><defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#24212B"/><stop offset="1" stop-color="#0B0A0E"/></linearGradient>
<filter id="ts" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.5"/></filter></defs>
{shadow}<path d="{tile}" fill="url(#bg)"/></svg>
<div class="scene"><div class="bloom"></div><div class="glow"></div><div class="stage"><div class="dock"></div>{''.join(items)}</div></div>
<svg class="t rim" viewBox="0 0 1024 1024"><defs><linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".3" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity=".08"/></linearGradient><clipPath id="c"><path d="{tile}"/></clipPath></defs>
<path d="{tile}" fill="none" stroke="url(#rim)" stroke-width="{3*k:.1f}" clip-path="url(#c)"/></svg>
</div></body></html>'''

if __name__=="__main__":
    open(sys.argv[3],'w').write(html(sys.argv[1],sys.argv[2]))
