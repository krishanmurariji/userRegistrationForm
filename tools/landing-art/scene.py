"""Layered Jaipur street with a kirana shopfront, for the landing page parallax (each layer 1600x900)."""
import os, random, sys
OUT = sys.argv[1]
random.seed(7)
W, H = 1600, 900

def save(name, body, w=W, h=H, extra=''):
    with open(os.path.join(OUT, name), 'w') as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMax slice">{extra}{body}</svg>')

# ---------- far: hills, fort wall, domes ----------
far = ['<path d="M0 560 Q180 470 360 520 T720 500 T1080 470 T1400 520 T1600 500 V900 H0 Z" fill="#f3cfae"/>']
far.append('<path d="M120 520 L120 470 l20 0 l0 -14 l14 0 l0 14 l26 0 l0 -14 l14 0 l0 14 l26 0 l0 -14 l14 0 l0 14 l26 0 l0 -14 l14 0 l0 14 l20 0 L294 510" fill="#efc29c"/>')
def dome(x, base, w, h, col):
    return (f'<rect x="{x-w/2}" y="{base-h*0.55}" width="{w}" height="{h*0.55}" fill="{col}"/>'
            f'<path d="M{x-w/2-4} {base-h*0.55} Q{x} {base-h*1.35} {x+w/2+4} {base-h*0.55} Z" fill="{col}"/>'
            f'<rect x="{x-2}" y="{base-h*1.5}" width="4" height="{h*0.2}" fill="{col}"/>')
for x, base, w, h in [(420,560,90,120),(560,560,60,90),(980,540,110,150),(1120,560,70,100),(1300,560,80,110),(760,560,50,70)]:
    far.append(dome(x, base, w, h, '#ecb994'))
# chhatris row
for i in range(7):
    x = 640 + i * 46
    far.append(f'<rect x="{x}" y="520" width="34" height="40" fill="#e9b28b"/><path d="M{x-4} 522 Q{x+17} 488 {x+38} 522 Z" fill="#e9b28b"/>')
save('far.svg', ''.join(far))

# ---------- mid: havelis of the Pink City ----------
mid = []
x = -40
palette = ['#e8956b', '#de8660', '#ea9f74', '#d97c56']
while x < W + 40:
    w = random.choice([150, 180, 210, 240])
    h = random.choice([300, 340, 380, 420])
    top = 900 - h
    col = random.choice(palette)
    mid.append(f'<rect x="{x}" y="{top}" width="{w}" height="{h}" fill="{col}"/>')
    # parapet with little scallops
    for sx in range(int(x), int(x + w), 22):
        mid.append(f'<path d="M{sx} {top} q11 -16 22 0 Z" fill="{col}"/>')
    # arched windows
    rows = int((h - 120) // 90)
    cols = max(2, int(w // 60))
    for r in range(rows):
        for c in range(cols):
            wx = x + (c + 0.5) * w / cols - 13
            wy = top + 40 + r * 90
            mid.append(f'<path d="M{wx} {wy+48} V{wy+14} Q{wx+13} {wy-6} {wx+26} {wy+14} V{wy+48} Z" fill="#b8613c"/>')
            mid.append(f'<rect x="{wx-4}" y="{wy+48}" width="34" height="5" fill="#f7c3a2"/>')
    # jharokha balcony on some
    if random.random() < .6:
        bx = x + w / 2 - 36
        mid.append(f'<path d="M{bx} {top+70} h72 v40 q-36 20 -72 0 Z" fill="#f2b28c"/><path d="M{bx-6} {top+70} Q{bx+36} {top+34} {bx+78} {top+70} Z" fill="#f2b28c"/>')
    x += w + random.choice([0, 8, 16])
save('mid.svg', ''.join(mid))

# ---------- shop: the kirana front ----------
s = []
# roof parapet with two little chhatris (domed pavilions)
s.append('<rect x="360" y="226" width="880" height="30" fill="#eab08a"/>')
for sx in range(360, 1240, 40):
    s.append(f'<path d="M{sx} 226 q20 -22 40 0 Z" fill="#eab08a"/>')
for cx in (440, 1160):
    s.append(f'<rect x="{cx-34}" y="150" width="8" height="76" fill="#eab08a"/><rect x="{cx+26}" y="150" width="8" height="76" fill="#eab08a"/>'
             f'<path d="M{cx-44} 156 Q{cx} 84 {cx+44} 156 Z" fill="#e7a47c"/><rect x="{cx-2}" y="78" width="4" height="14" fill="#e7a47c"/>')
# shop frame
s.append('<rect x="380" y="250" width="840" height="650" fill="#fff1dc"/>')
# sign board
s.append('<rect x="410" y="270" width="780" height="104" rx="14" fill="#9b5227"/>')
s.append('<rect x="422" y="282" width="756" height="80" rx="10" fill="none" stroke="#ffcf9e" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round"/>')
s.append('<text x="800" y="333" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="50" letter-spacing="6" fill="#fff4e6">SMALL MART</text>')
s.append('<text x="800" y="358" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="17" letter-spacing="5" fill="#ffcf9e">KIRANA · GENERAL STORE · JAIPUR</text>')
# awning with scallops
stripes = ''.join(f'<rect x="{390 + i*55}" y="384" width="55" height="70" fill="{"#c2562a" if i % 2 == 0 else "#fff4e6"}"/>' for i in range(15))
scallops = ''.join(f'<path d="M{390 + i*55} 454 q27.5 30 55 0 Z" fill="{"#c2562a" if i % 2 == 0 else "#fff4e6"}"/>' for i in range(15))
s.append(f'<g>{stripes}{scallops}</g>')
# marigold toran
for i in range(22):
    cx = 400 + i * 37
    cy = 470 + (10 if i % 2 else 0)
    s.append(f'<circle cx="{cx}" cy="{cy}" r="9" fill="{"#f7a21b" if i % 3 else "#e5621f"}"/>')
for i in range(0, 22, 3):
    cx = 400 + i * 37
    s.append(''.join(f'<circle cx="{cx}" cy="{488 + k*16}" r="7" fill="#f7a21b"/>' for k in range(3)) + f'<path d="M{cx-6} {534} l6 12 l6 -12 Z" fill="#3f8a3a"/>')
# interior
s.append('<rect x="420" y="490" width="760" height="330" fill="#5b3018"/>')
s.append('<rect x="420" y="490" width="760" height="330" fill="url(#glow)"/>')
colors = ['#c2562a', '#f7c948', '#3d7fd0', '#2f6b3f', '#f08a24', '#7a3fb0', '#e5412d', '#fff4e6', '#7fc7c0', '#d9a35a']
for row in range(3):
    y = 520 + row * 92
    s.append(f'<rect x="436" y="{y+70}" width="728" height="12" fill="#8a4a22"/>')
    x = 446
    while x < 1150:
        w = random.choice([22, 28, 34, 40])
        h = random.choice([34, 44, 54, 62])
        col = random.choice(colors)
        kind = random.random()
        if kind < .25:  # jar
            s.append(f'<rect x="{x}" y="{y+70-h}" width="{w}" height="{h}" rx="7" fill="{col}" opacity=".95"/><rect x="{x+3}" y="{y+70-h-6}" width="{w-6}" height="8" rx="2" fill="#2b1d12"/>')
        elif kind < .45:  # bottle
            s.append(f'<rect x="{x+w/2-4}" y="{y+70-h-10}" width="8" height="12" fill="#2b1d12"/><rect x="{x}" y="{y+70-h}" width="{w}" height="{h}" rx="9" fill="{col}"/>')
        else:  # box
            s.append(f'<rect x="{x}" y="{y+70-h}" width="{w}" height="{h}" rx="3" fill="{col}"/><rect x="{x+4}" y="{y+70-h*0.62}" width="{w-8}" height="{h*0.24}" fill="#fff" opacity=".55"/>')
        x += w + random.choice([4, 6, 10])
# counter
s.append('<rect x="520" y="740" width="560" height="160" rx="10" fill="#b9652f"/>')
s.append('<rect x="520" y="740" width="560" height="22" rx="8" fill="#d98a4f"/>')
s.append('<rect x="560" y="780" width="480" height="90" rx="8" fill="#9b5227"/>')
s.append('<text x="800" y="836" text-anchor="middle" font-family="Arial" font-weight="800" font-size="28" fill="#ffcf9e">Order on the app</text>')
# scale and jars on the counter
s.append('<rect x="610" y="712" width="90" height="30" rx="6" fill="#cfd6d9"/><rect x="630" y="698" width="50" height="16" rx="4" fill="#9aa5ab"/><circle cx="655" cy="726" r="9" fill="#2b1d12"/>')
for i, col in enumerate(['#f7c948', '#e5412d', '#2f6b3f', '#f08a24']):
    jx = 860 + i * 46
    s.append(f'<rect x="{jx}" y="684" width="38" height="56" rx="10" fill="#fff" opacity=".85"/><rect x="{jx+4}" y="702" width="30" height="34" rx="6" fill="{col}"/><rect x="{jx+6}" y="676" width="26" height="10" rx="3" fill="#c2562a"/>')
# sacks in front
def sack(cx, col, grain):
    return (f'<path d="M{cx-60} 900 Q{cx-70} 800 {cx-50} 770 H{cx+50} Q{cx+70} 800 {cx+60} 900 Z" fill="#e8d2ad"/>'
            f'<ellipse cx="{cx}" cy="772" rx="52" ry="14" fill="{grain}"/>'
            f'<path d="M{cx-50} 772 q-14 -12 -6 -24 M{cx+50} 772 q14 -12 6 -24" stroke="#d6b98a" stroke-width="10" fill="none" stroke-linecap="round"/>')
s.append(sack(430, '#e8d2ad', '#f7c948'))
s.append(sack(1170, '#e8d2ad', '#fff8ee'))
# pillars
s.append('<rect x="380" y="250" width="30" height="650" fill="#f2c3a0"/><rect x="1190" y="250" width="30" height="650" fill="#f2c3a0"/>')
glow = '<defs><radialGradient id="glow" cx="50%" cy="20%" r="80%"><stop offset="0" stop-color="#ffcf7a" stop-opacity=".55"/><stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/></radialGradient></defs>'
save('shop.svg', ''.join(s), extra=glow)

# ---------- foreground: plants, pots, lamp ----------
fg = []
fg.append('<rect x="0" y="860" width="1600" height="40" fill="#d9b38c"/>')
def plant(cx, scale=1.0):
    pot = f'<path d="M{cx-48*scale} {900-110*scale} h{96*scale} l-12 {110*scale} h-{72*scale} Z" fill="#b65a2c"/><rect x="{cx-54*scale}" y="{900-120*scale}" width="{108*scale}" height="{18*scale}" rx="6" fill="#c96a38"/>'
    leaves = ''
    for a in range(-60, 70, 20):
        leaves += (f'<path d="M{cx} {900-118*scale} q{a*1.2*scale} -{120*scale} {a*2.2*scale} -{150*scale} '
                   f'q-{a*0.4*scale} {60*scale} -{a*2.2*scale} {150*scale} Z" fill="{"#4f7d3a" if a % 40 else "#6f9b4c"}"/>')
    return leaves + pot
fg.append(plant(140, 1.3))
fg.append(plant(1460, 1.15))
fg.append(plant(300, .8))
# lamp post on the right
fg.append('<rect x="1300" y="380" width="14" height="490" fill="#2b1d12"/><path d="M1286 380 h42 l-8 -40 h-26 Z" fill="#2b1d12"/><circle cx="1307" cy="392" r="16" fill="#ffd27a" opacity=".9"/>')
save('fg.svg', ''.join(fg))

# ---------- scooter ----------
sc = '''
<g>
<circle cx="70" cy="190" r="34" fill="#2b1d12"/><circle cx="70" cy="190" r="14" fill="#9aa5ab"/>
<circle cx="260" cy="190" r="34" fill="#2b1d12"/><circle cx="260" cy="190" r="14" fill="#9aa5ab"/>
<path d="M40 170 Q60 120 120 124 H190 Q230 124 240 150 L270 150 Q290 152 290 170 L276 176 H44 Z" fill="#c2562a"/>
<path d="M230 150 L250 70 h22" stroke="#2b1d12" stroke-width="10" fill="none" stroke-linecap="round"/>
<rect x="18" y="58" width="100" height="74" rx="10" fill="#9b5227"/>
<path d="M50 78 h36 l-4 34 h-28 Z" fill="#fff4e6"/><path d="M58 78 q10 -16 20 0" stroke="#fff4e6" stroke-width="5" fill="none"/>
<path d="M150 124 L170 70 Q176 54 192 56 L214 60 L228 120 Z" fill="#2f6b3f"/>
<circle cx="196" cy="34" r="22" fill="#f2b48a"/><path d="M174 30 Q196 4 218 30 Z" fill="#c2562a"/>
<path d="M200 66 L246 74" stroke="#2f6b3f" stroke-width="14" stroke-linecap="round"/>
<path d="M176 124 L196 172 L226 172" stroke="#2b1d12" stroke-width="12" fill="none" stroke-linecap="round"/>
</g>'''
save('scooter.svg', sc, w=320, h=230)
print('scene done')
