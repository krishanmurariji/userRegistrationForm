# Looks up each food product on Open Food Facts and keeps the best match that has a front photo.
# Open Food Facts allows about 10 searches a minute, so this waits between requests.
import json, sys, time, urllib.parse, urllib.request

base = json.load(open('catalog.base.json'))
out_path = 'food-matches.json'
try:
    done = json.load(open(out_path))
except FileNotFoundError:
    done = {}

def search(terms):
    q = urllib.parse.urlencode({'search_terms': terms, 'json': 1, 'page_size': 12,
        'fields': 'code,product_name,product_name_en,brands,quantity,image_front_url,countries_tags,unique_scans_n'})
    req = urllib.request.Request('https://world.openfoodfacts.org/cgi/search.pl?' + q, headers={'User-Agent': 'SmallMartSeed/1.0'})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r).get('products', [])

for category, rows in base.items():
    for row in rows:
        if row['db'] != 'food' or row['name'] in done:
            continue
        products = None
        for attempt in range(4):
            try:
                products = search(row['search'])
                break
            except Exception as e:
                # The database is often briefly busy: wait longer each time before trying again.
                print('busy', row['name'], e, flush=True)
                time.sleep(15 * (attempt + 1))
        if products is None:
            print('ERR', row['name'], flush=True)
            continue
        best, best_score = None, -1
        brand_word = row['name'].split()[0].lower().strip("'s.")
        for p in products:
            name = (p.get('product_name_en') or p.get('product_name') or '').lower()
            if not p.get('image_front_url') or row['must'] not in name:
                continue
            score = 0
            if 'en:india' in (p.get('countries_tags') or []): score += 3
            if brand_word in (name + ' ' + (p.get('brands') or '').lower()): score += 2
            score += min(2, (p.get('unique_scans_n') or 0) / 50)
            if score > best_score:
                best, best_score = p, score
        done[row['name']] = None if best is None else {
            'barcode': best.get('code'), 'offName': best.get('product_name_en') or best.get('product_name'),
            'brands': best.get('brands'), 'quantity': best.get('quantity'), 'image': best.get('image_front_url'),
            'india': 'en:india' in (best.get('countries_tags') or [])}
        print(('OK  ' if best else 'NONE'), row['name'], '->', (done[row['name']] or {}).get('offName'), flush=True)
        json.dump(done, open(out_path, 'w'), indent=1, ensure_ascii=False)
        time.sleep(6.5)
print('finished', len(done))
