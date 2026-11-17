// Fills a Small Mart API with a demo shop: a shop-owner login, the shop with its logo and cover picture,
// its categories, and every product in catalog.json with a picture and opening stock.
//
// Safe to run again: the owner, the shop, categories and products that already exist are kept and skipped.
// Run by the "Seed demo data" GitHub workflow (docs/SEED.md). Needs Node 20 or newer, nothing to install.
//
// Settings (environment variables):
//   API_URL                       the API address, for example https://smallmart-api.runasp.net
//   ADMIN_EMAIL, ADMIN_PASSWORD   the platform admin, who creates the shop owner
//   OWNER_EMAIL, OWNER_PASSWORD   the demo shop owner's login (created if missing)
//   OWNER_NAME                    optional, default "Ramesh Sharma"
//   SHOP_UPI_ID                   optional; without it the demo shop takes cash on delivery only
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const env = (name, fallback) => {
  const value = process.env[name]?.trim() || fallback;
  if (value === undefined) {
    console.error(`::error::${name} is not set.`);
    process.exit(1);
  }
  return value;
};

const API = env('API_URL').replace(/\/+$/, '') + '/api';
const ADMIN = { email: env('ADMIN_EMAIL'), password: env('ADMIN_PASSWORD') };
const OWNER = { email: env('OWNER_EMAIL'), password: env('OWNER_PASSWORD'), name: env('OWNER_NAME', 'Ramesh Sharma') };
const UPI = process.env.SHOP_UPI_ID?.trim() || null;
const catalog = JSON.parse(readFileSync(join(here, 'catalog.json'), 'utf8'));
const USER_AGENT = 'SmallMartSeed/1.0 (demo data for a shop app)';

const SHOP = {
  name: 'Sharma General Store',
  description: 'Your neighbourhood kirana in Malviya Nagar: groceries, dairy, snacks and daily needs, delivered fresh.',
  phone: '+91 98290 00000',
  addressLine: '24 Gopalpura Bypass Road, Malviya Nagar',
  city: 'Jaipur',
  pincode: '302017',
  upiId: UPI,
  deliveryFee: 20,
  minimumOrder: 99,
  isOpen: true,
};

const BLURBS = {
  'Fruits & Vegetables': 'Picked fresh every morning from the local mandi.',
  'Dairy, Bread & Eggs': 'Kept chilled and delivered fresh.',
  'Atta, Rice & Dal': 'Everyday kitchen staple.',
  'Oils & Ghee': 'For everyday cooking.',
  'Masala & Spices': 'Adds flavour to every dish.',
  'Breakfast & Spreads': 'A good start to the day.',
  'Tea, Coffee & Drinks': 'For every time of the day.',
  'Biscuits & Snacks': 'Perfect with chai or on the go.',
  'Noodles, Sauces & Ready to Eat': 'Quick to make, easy to enjoy.',
  'Chocolates & Sweets': 'A little something sweet.',
  'Personal Care': 'Daily care for the whole family.',
  'Household & Cleaning': 'Keeps your home clean and fresh.',
};

const CREDITS = {
  food: 'Product photo: Open Food Facts contributors (openfoodfacts.org), CC BY-SA 3.0.',
  beauty: 'Product photo: Open Beauty Facts contributors (openbeautyfacts.org), CC BY-SA 3.0.',
  products: 'Product photo: Open Products Facts contributors (openproductsfacts.org), CC BY-SA 3.0.',
};

const LOOKUP_HOSTS = { beauty: 'world.openbeautyfacts.org', products: 'world.openproductsfacts.org', food: 'world.openfoodfacts.org' };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------------------------------------------------------------- talking to the API
async function call(method, path, { token, body, form, ok = [200, 201, 204] } = {}) {
  for (let attempt = 1; ; attempt++) {
    let response;
    try {
      response = await fetch(API + path, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: form ?? (body ? JSON.stringify(body) : undefined),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      if (attempt < 4) { await sleep(3000 * attempt); continue; }
      throw new Error(`${method} ${path}: ${e.message}`);
    }
    // The free host can be slow to wake up or briefly busy: try again on 5xx and 429.
    if ((response.status >= 500 || response.status === 429) && attempt < 4) { await sleep(4000 * attempt); continue; }
    const text = await response.text();
    const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
    if (!ok.includes(response.status)) {
      const error = new Error(`${method} ${path} -> ${response.status} ${typeof data === 'object' ? JSON.stringify(data) : data}`);
      error.status = response.status;
      error.code = data?.code;
      throw error;
    }
    return data;
  }
}

async function signIn(email, password) {
  return (await call('POST', '/auth/login', { body: { email, password } })).accessToken;
}

// ---------------------------------------------------------------- pictures
const isPicture = (b) =>
  (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
  (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) ||
  (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP');

async function download(url) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length > 0 && bytes.length <= 5 * 1024 * 1024 && isPicture(bytes) ? bytes : null;
  } catch {
    return null;
  }
}

let lastLookup = 0;
async function lookUp(row) {
  const host = LOOKUP_HOSTS[row.db];
  if (!host || !row.search) return null;
  // These databases ask for no more than about 10 searches a minute.
  const wait = lastLookup + 6500 - Date.now();
  if (wait > 0) await sleep(wait);
  lastLookup = Date.now();
  const query = new URLSearchParams({
    search_terms: row.search, json: '1', page_size: '12',
    fields: 'code,product_name,product_name_en,brands,image_front_url,countries_tags',
  });
  try {
    const response = await fetch(`https://${host}/cgi/search.pl?${query}`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(40_000) });
    if (!response.ok) return null;
    const products = (await response.json()).products ?? [];
    const brand = row.name.split(' ')[0].toLowerCase();
    let best = null;
    let bestScore = -1;
    for (const p of products) {
      const name = (p.product_name_en || p.product_name || '').toLowerCase();
      if (!p.image_front_url || !name.includes(row.must)) continue;
      const score = ((p.countries_tags ?? []).includes('en:india') ? 3 : 0) + ((name + ' ' + (p.brands ?? '').toLowerCase()).includes(brand) ? 2 : 0);
      if (score > bestScore) { best = p; bestScore = score; }
    }
    return best ? { image: best.image_front_url, barcode: best.code } : null;
  } catch {
    return null;
  }
}

/** The product's picture: the real photo when one can be found and downloaded, otherwise the drawn one. */
async function pictureFor(row) {
  let found = row.image ? { image: row.image, barcode: row.barcode } : null;
  if (!found && row.db !== 'none' && row.db !== 'food') found = await lookUp(row);
  if (found) {
    const bytes = await download(found.image);
    if (bytes) return { bytes, name: 'photo.jpg', credit: CREDITS[row.db], barcode: found.barcode };
  }
  return { bytes: readFileSync(join(here, 'fallback', `${slug(row.name)}.webp`)), name: 'picture.webp', credit: null, barcode: row.barcode ?? null };
}

const typeOf = (bytes) => (bytes[0] === 0xff ? 'image/jpeg' : bytes[0] === 0x89 ? 'image/png' : 'image/webp');
const formWith = (bytes, name) => {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: typeOf(bytes) }), name);
  return form;
};

// ---------------------------------------------------------------- the steps
async function main() {
  console.log(`Seeding ${API}`);
  const admin = await signIn(ADMIN.email, ADMIN.password);

  try {
    await call('POST', '/admin/users/shop-owners', { token: admin, body: { email: OWNER.email, fullName: OWNER.name, password: OWNER.password } });
    console.log(`Created the shop owner ${OWNER.email}`);
  } catch (e) {
    if (e.code !== 'email_taken') throw e;
    console.log(`The shop owner ${OWNER.email} already exists`);
  }
  const owner = await signIn(OWNER.email, OWNER.password);

  const shops = await call('GET', '/shops/mine', { token: owner });
  let shop = shops.find((s) => s.name === SHOP.name);
  if (!shop) {
    shop = await call('POST', '/shops', { token: owner, body: SHOP });
    console.log(`Created the shop "${SHOP.name}"`);
  } else {
    console.log(`The shop "${SHOP.name}" already exists`);
  }
  if (!shop.logoUrl) shop = await call('POST', `/shops/${shop.id}/logo`, { token: owner, form: formWith(readFileSync(join(here, 'images/shop-logo.png')), 'logo.png') });
  if (!shop.coverUrl) shop = await call('POST', `/shops/${shop.id}/cover`, { token: owner, form: formWith(readFileSync(join(here, 'images/shop-cover.jpg')), 'cover.jpg') });

  const categories = new Map((await call('GET', `/shops/${shop.id}/categories`, { token: owner })).map((c) => [c.name, c.id]));
  let order = 0;
  for (const name of Object.keys(catalog)) {
    order++;
    if (!categories.has(name)) {
      const created = await call('POST', `/shops/${shop.id}/categories`, { token: owner, body: { name, sortOrder: order } });
      categories.set(name, created.id);
    }
  }

  const existing = new Set();
  for (let skip = 0; ; skip += 200) {
    const page = await call('GET', `/shops/${shop.id}/items?skip=${skip}&take=200`, { token: owner });
    page.forEach((i) => existing.add(i.name));
    if (page.length < 200) break;
  }

  let added = 0, skipped = 0, photos = 0, failed = 0;
  for (const [category, rows] of Object.entries(catalog)) {
    for (const row of rows) {
      if (existing.has(row.name)) { skipped++; continue; }
      try {
        const picture = await pictureFor(row);
        const staged = await call('POST', `/shops/${shop.id}/items/images`, { token: owner, form: formWith(picture.bytes, picture.name) });
        const description = [`${row.name}, ${row.unit}. ${BLURBS[category] ?? ''}`.trim(), picture.credit].filter(Boolean).join('\n\n');
        const item = {
          name: row.name, description, categoryId: categories.get(category),
          price: row.price, mrp: row.mrp > row.price ? row.mrp : null, unit: row.unit,
          barcode: picture.barcode && /^\d{8,14}$/.test(picture.barcode) ? picture.barcode : null,
          isActive: true, trackStock: true, lowStockThreshold: 5, openingStock: row.stock, imageIds: [staged.id],
        };
        try {
          await call('POST', `/shops/${shop.id}/items`, { token: owner, body: item });
        } catch (e) {
          if (!item.barcode || e.status !== 400) throw e;
          await call('POST', `/shops/${shop.id}/items`, { token: owner, body: { ...item, barcode: null } });
        }
        added++;
        if (picture.credit) photos++;
        console.log(`  + ${row.name} (${picture.credit ? 'photo' : 'drawn picture'})`);
      } catch (e) {
        failed++;
        console.log(`::warning::Could not add ${row.name}: ${e.message}`);
      }
    }
  }

  const total = Object.values(catalog).reduce((n, rows) => n + rows.length, 0);
  console.log(`\nDone: ${added} added (${photos} with real photos), ${skipped} already there, ${failed} failed, ${total} in the list.`);
  console.log(`Shop owner login: ${OWNER.email}`);
  if (failed > total / 10) {
    console.log('::error::More than one in ten products failed. Read the warnings above, then run the workflow again: it continues where it stopped.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.log(`::error::${e.message}`);
  process.exit(1);
});
