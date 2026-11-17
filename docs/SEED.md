# Demo data: "Sharma General Store"

The **Seed demo data** workflow fills the live app with one realistic shop so it does not look empty:

- a shop-owner login (the email and password you choose),
- **Sharma General Store**, Malviya Nagar, Jaipur, with a logo and a cover picture, open for orders, ₹20 delivery,
  ₹99 minimum order, cash on delivery (UPI only if you set `SHOP_UPI_ID`),
- 12 categories and about 130 products with demo prices, MRPs and opening stock.

**Pictures:** most packaged products get their real pack photo from Open Food Facts, Open Beauty Facts or Open Products
Facts (free databases; their photos are CC BY-SA, so each product's description carries a one-line credit). A photo is
only used when the database's product clearly is the same brand. Fresh fruit and vegetables, and any product without a
good photo, get a clean drawn picture instead.

**Prices are demo prices** picked to look realistic, not checked against today's market. Shop owners can change them.

## Run it

1. GitHub, **Settings**, **Secrets and variables**, **Actions**, add two secrets:
   | Secret | Value |
   |---|---|
   | `SEED_OWNER_EMAIL` | the demo shop owner's login, a real address you can read (for password resets) |
   | `SEED_OWNER_PASSWORD` | 8+ characters with a digit |

   It also uses the secrets you already have: `API_URL`, `API_ADMIN_EMAIL`, `API_ADMIN_PASSWORD`.
2. **Actions**, **Seed demo data**, **Run workflow**. It takes about 10 to 20 minutes (the photo databases allow only
   about 10 searches a minute).
3. Sign in on the website with the owner login to see the shop from the owner's side, or as a customer to shop in it.

It is safe to run again: anything that already exists is kept, and only missing products are added. If it stopped
part-way, run it again to finish.

## Removing the demo shop

As the platform admin, open the shop in the admin section and **deactivate** it. Customers no longer see it.

## Changing the products

The list is in `tools/seed/catalog.py` (names, sizes, prices, stock, search words). After changing it:

```bash
cd tools/seed
python3 catalog.py          # writes catalog.base.json
python3 resolve_food.py     # finds Open Food Facts photos for food (slow: about 10 a minute)
python3 finalize.py         # keeps only correct matches, writes catalog.json
node draw.js                # redraws the fallback pictures (needs app/node_modules)
```
