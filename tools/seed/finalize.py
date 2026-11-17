# Builds catalog.json: the product list plus, for food, the Open Food Facts photo that was found for it.
# A match is only kept when it is clearly the same product: the brand must appear in the database's name or brand,
# so a branded item never shows another brand's pack. Unbranded staples always get the drawn picture.
import json, re

base = json.load(open('catalog.base.json'))
matches = json.load(open('food-matches.json'))

GENERIC = {'Rajma Chitra', 'Kabuli Chana', 'Besan (Gram Flour)', 'Bombay Rava (Sooji)', 'Poha (Flattened Rice)', 'Sugar'}
ALIASES = {"kellogg's": 'kellogg', "lay's": 'lay', "haldiram's": 'haldiram', "ching's": 'ching', 'dr.': 'funfoods',
           'coca-cola': 'coca', 'india': 'india gate', 'paper': 'paper boat', 'red': 'red bull', 'top': 'top ramen',
           'sunfeast': 'yippee', 'brooke': 'brooke bond', 'del': 'del monte', 'real': 'real', 'act': 'act ii', 'farm': None}

def brand_of(name):
    first = name.split()[0].lower()
    return ALIASES.get(first, first.strip("'"))

kept = dropped = 0
for rows in base.values():
    for row in rows:
        m = matches.get(row['name']) if row['db'] == 'food' else None
        if not m or row['name'] in GENERIC:
            if m: dropped += 1
            continue
        brand = brand_of(row['name'])
        haystack = (m.get('offName') or '').lower() + ' ' + (m.get('brands') or '').lower()
        if brand and re.sub(r'[^a-z ]', '', brand) not in re.sub(r'[^a-z ]', '', haystack):
            dropped += 1
            print('different brand, using the drawn picture:', row['name'], '<-', m.get('offName'), '/', m.get('brands'))
            continue
        row['image'] = m['image']
        row['barcode'] = m.get('barcode')
        kept += 1

json.dump(base, open('catalog.json', 'w'), indent=1, ensure_ascii=False)
total = sum(len(v) for v in base.values())
print(f'catalog.json: {total} products, {kept} with a pinned photo, {dropped} matches rejected')
