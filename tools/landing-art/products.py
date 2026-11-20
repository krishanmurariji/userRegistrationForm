"""Draws brand-free grocery illustrations for the landing page (SVG, 200x240)."""
import os, sys
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

def svg(body, w=200, h=240):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">' \
           f'<ellipse cx="100" cy="228" rx="70" ry="9" fill="#2b1d12" opacity=".12"/>{body}</svg>'

def label(x, y, text, size=20, color="#fff", weight=800):
    return f'<text x="{x}" y="{y}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="{weight}" font-size="{size}" fill="{color}">{text}</text>'

P = {}
# Atta sack
P['atta'] = svg(f'''
<path d="M40 52 Q100 30 160 52 L170 214 Q100 230 30 214 Z" fill="#f4e2c4"/>
<path d="M40 52 Q100 30 160 52 L158 70 Q100 52 42 70 Z" fill="#e3c79c"/>
<path d="M34 112 H166 L168 168 H32 Z" fill="#c2562a"/>
{label(100,148,'ATTA',30)}
<g fill="none" stroke="#c48a3a" stroke-width="5" stroke-linecap="round"><path d="M100 104 V78"/><path d="M100 92 q-12 -4 -14 -16 q12 2 14 16 q2 -14 14 -16 q-2 12 -14 16"/></g>
{label(100,196,'5 kg',16,'#8a4a22',700)}''')
# Milk pouch
P['milk'] = svg(f'''
<path d="M52 40 H148 L158 60 L150 212 Q100 224 50 212 L42 60 Z" fill="#eaf3ff"/>
<path d="M52 40 H148 L152 54 H48 Z" fill="#3d7fd0"/>
<path d="M44 150 Q100 128 156 150 L150 212 Q100 224 50 212 Z" fill="#3d7fd0"/>
<path d="M100 74 C88 92 82 102 82 112 a18 18 0 0 0 36 0 C118 102 112 92 100 74 Z" fill="#3d7fd0"/>
{label(100,186,'MILK',24)}''')
# Butter
P['butter'] = svg(f'''
<g transform="translate(0 30)"><path d="M26 98 L100 70 L176 98 L176 168 L100 196 L26 168 Z" fill="#f7c948"/>
<path d="M26 98 L100 70 L176 98 L100 126 Z" fill="#ffe08a"/><path d="M100 126 L176 98 L176 168 L100 196 Z" fill="#e8b22f"/>
<path d="M26 98 L100 126 L100 196 L26 168 Z" fill="#f2bd3a"/>
<text x="62" y="160" transform="rotate(20 62 160)" text-anchor="middle" font-family="Arial" font-weight="800" font-size="18" fill="#c2562a">BUTTER</text></g>''')
# Chai box
P['chai'] = svg(f'''
<path d="M48 54 L132 40 L160 56 L160 212 L76 226 L48 210 Z" fill="#2f6b3f"/>
<path d="M48 54 L132 40 L160 56 L76 70 Z" fill="#4c8c5a"/><path d="M76 70 L160 56 L160 212 L76 226 Z" fill="#c2562a"/>
<g transform="translate(118 112)"><path d="M-26 -8 h40 v26 a20 20 0 0 1 -40 0 Z" fill="#fff4e6"/><path d="M14 0 a10 10 0 0 1 0 18" fill="none" stroke="#fff4e6" stroke-width="5"/>
<path d="M-14 -20 q4 -8 0 -14 M-2 -20 q4 -8 0 -14" stroke="#fff4e6" stroke-width="4" fill="none" stroke-linecap="round"/></g>
<text x="118" y="190" text-anchor="middle" font-family="Arial" font-weight="800" font-size="22" fill="#fff4e6">CHAI</text>''')
# Biscuits
P['biscuit'] = svg(f'''
<g transform="rotate(-12 100 130)"><rect x="18" y="92" width="164" height="82" rx="14" fill="#f08a24"/>
<path d="M18 104 l-8 -6 v70 l8 -6 Z M182 104 l8 -6 v70 l-8 -6 Z" fill="#d06f12"/>
<circle cx="66" cy="133" r="26" fill="#d9a35a"/><circle cx="66" cy="133" r="26" fill="none" stroke="#b9823f" stroke-width="3" stroke-dasharray="4 5"/>
<g fill="#8a4a22"><circle cx="58" cy="125" r="3"/><circle cx="74" cy="128" r="3"/><circle cx="64" cy="142" r="3"/></g>
{label(132,140,'BISCUIT',20)}</g>''')
# Chips
P['chips'] = svg(f'''
<path d="M46 40 l8 8 l8 -8 l8 8 l8 -8 l8 8 l8 -8 l8 8 l8 -8 l8 8 l8 -8 l8 8 l8 -8 l4 4 L150 200 l-8 -8 l-8 8 l-8 -8 l-8 8 l-8 -8 l-8 8 l-8 -8 l-8 8 l-8 -8 l-8 8 l-8 -8 l-8 8 L50 200 Z" fill="#7a3fb0"/>
<ellipse cx="100" cy="120" rx="44" ry="40" fill="#ffd23f"/>
<g fill="#e8a020"><ellipse cx="86" cy="112" rx="16" ry="10" transform="rotate(-20 86 112)"/><ellipse cx="112" cy="128" rx="16" ry="10" transform="rotate(25 112 128)"/></g>
{label(100,186,'CHIPS',22)}''')
# Oil bottle
P['oil'] = svg(f'''
<rect x="84" y="24" width="32" height="20" rx="4" fill="#c2562a"/>
<path d="M80 44 H120 L132 78 Q146 92 146 120 V200 Q146 214 132 214 H68 Q54 214 54 200 V120 Q54 92 68 78 Z" fill="#f2b632" opacity=".95"/>
<path d="M66 96 Q100 86 134 96 V140 Q100 150 66 140 Z" fill="#fff4e6"/>
{label(100,126,'OIL',22,'#c2562a')}
<path d="M70 160 V196" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".5"/>''')
# Chilli powder jar
P['spice'] = svg(f'''
<rect x="56" y="40" width="88" height="30" rx="8" fill="#2b1d12"/>
<path d="M50 70 H150 V198 Q150 214 134 214 H66 Q50 214 50 198 Z" fill="#c8361b"/>
<rect x="58" y="108" width="84" height="60" rx="10" fill="#fff4e6"/>
<path d="M90 120 q22 -6 30 14 q-14 22 -34 20 q12 -10 4 -34" fill="#c8361b"/><path d="M88 122 q-6 -8 2 -12" stroke="#2f6b3f" stroke-width="4" fill="none"/>
{label(100,196,'MIRCH',18)}''')
# Tomato
P['tomato'] = svg(f'''
<circle cx="100" cy="140" r="70" fill="#e5412d"/><ellipse cx="74" cy="112" rx="18" ry="12" fill="#ff8a6b" opacity=".7"/>
<path d="M100 76 l-10 -14 l10 6 l10 -12 l0 16 l18 -4 l-14 12 l-28 0 l-14 -12 l18 4 Z" fill="#3f8a3a"/>''')
# Banana
P['banana'] = svg(f'''
<g fill="#f7cf3e" stroke="#d9a520" stroke-width="3"><path d="M60 70 Q40 150 120 200 Q150 206 160 196 Q90 170 78 72 Z"/>
<path d="M78 68 Q80 150 156 182 Q172 182 176 172 Q104 150 96 68 Z"/><path d="M96 66 Q118 140 178 156 Q188 150 186 140 Q130 128 112 66 Z"/></g>
<rect x="72" y="52" width="40" height="22" rx="6" fill="#6b5a2c"/>''')
# Onion
P['onion'] = svg(f'''
<path d="M100 60 C70 100 44 120 44 156 a56 56 0 0 0 112 0 C156 120 130 100 100 60 Z" fill="#9b3a6a"/>
<path d="M100 66 C88 110 80 140 86 206 M100 66 C112 110 120 140 114 206" stroke="#c76596" stroke-width="4" fill="none"/>
<path d="M100 60 q-6 -20 4 -34" stroke="#3f8a3a" stroke-width="6" fill="none" stroke-linecap="round"/>''')
# Eggs
P['eggs'] = svg(f'''
<path d="M24 150 H176 L168 196 H32 Z" fill="#c9a77d"/>
<g fill="#fff4e6"><ellipse cx="56" cy="138" rx="20" ry="26"/><ellipse cx="100" cy="132" rx="20" ry="26"/><ellipse cx="144" cy="138" rx="20" ry="26"/></g>
<g fill="#f3dcc0"><ellipse cx="78" cy="152" rx="18" ry="22"/><ellipse cx="122" cy="152" rx="18" ry="22"/></g>
<path d="M24 150 q22 18 44 0 q22 18 44 0 q22 18 44 0 q22 18 20 0" fill="#b8925f"/>''')
# Bread
P['bread'] = svg(f'''
<path d="M30 110 Q30 64 76 64 H124 Q170 64 170 110 Q170 124 158 128 V200 Q158 210 148 210 H52 Q42 210 42 200 V128 Q30 124 30 110 Z" fill="#c9823c"/>
<path d="M50 112 Q50 82 80 82 H120 Q150 82 150 112 V196 H50 Z" fill="#f6dfb5"/>
<g stroke="#e8c48a" stroke-width="3" fill="none"><path d="M66 120 h24 M100 140 h30 M70 168 h28"/></g>''')
# Dal packet
P['dal'] = svg(f'''
<path d="M48 40 H152 L160 212 H40 Z" fill="#2f6b3f"/><path d="M48 40 H152 L154 60 H46 Z" fill="#245632"/>
<ellipse cx="100" cy="122" rx="40" ry="38" fill="#f7c948"/>
<g fill="#e8a020">{''.join(f'<circle cx="{x}" cy="{y}" r="4"/>' for x,y in [(84,108),(98,116),(112,104),(90,130),(108,132),(118,120),(80,122),(100,144)])}</g>
{label(100,190,'TOOR DAL',17)}''')
# Soap
P['soap'] = svg(f'''
<g transform="rotate(-8 100 140)"><rect x="34" y="96" width="132" height="84" rx="26" fill="#7fc7c0"/><rect x="34" y="96" width="132" height="70" rx="26" fill="#a7e0d8"/>
<ellipse cx="100" cy="128" rx="40" ry="18" fill="#7fc7c0"/>{label(100,135,'SOAP',18,'#fff')}</g>
<g fill="#fff" stroke="#a7e0d8" stroke-width="3"><circle cx="150" cy="70" r="12"/><circle cx="172" cy="96" r="7"/><circle cx="132" cy="54" r="6"/></g>''')
# Rice bag
P['rice'] = svg(f'''
<path d="M44 50 Q100 34 156 50 L164 214 H36 Z" fill="#fff8ee"/>
<path d="M44 50 Q100 34 156 50 L156 66 Q100 52 44 66 Z" fill="#e3d7c3"/>
<rect x="44" y="96" width="112" height="74" rx="10" fill="#9b5227"/>
{label(100,130,'BASMATI',17)}{label(100,156,'RICE',18,'#ffe1cc')}
<g fill="#e3d7c3">{''.join(f'<ellipse cx="{x}" cy="{y}" rx="5" ry="2.4" transform="rotate({r} {x} {y})"/>' for x,y,r in [(70,190,20),(90,196,-15),(112,188,30),(132,196,-25),(80,182,10),(124,182,-5)])}</g>''')
# Coconut
P['coconut'] = svg(f'''
<circle cx="100" cy="140" r="66" fill="#7a4a2a"/><path d="M40 120 q60 -40 120 0" stroke="#5c3518" stroke-width="5" fill="none"/>
<g fill="#3a2010"><circle cx="86" cy="104" r="7"/><circle cx="110" cy="100" r="7"/><circle cx="100" cy="120" r="7"/></g>''')

for name, body in P.items():
    with open(os.path.join(OUT, f'p-{name}.svg'), 'w') as f:
        f.write(body)
print(len(P), 'products')
