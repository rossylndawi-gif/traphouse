# Trap House Society — Online Shop

Your shop website: **https://rossylndawi-gif.github.io/traphouse/**
Your shop admin: **https://rossylndawi-gif.github.io/traphouse/admin/**

Customers browse the products, pick a size, and send their order to you on WhatsApp (+250 791 449 915). When they send an order, the items are **held for them for 24 hours** so nobody else can buy them, and the WhatsApp message carries an order code like **TH-1042**.

Everything else — products, photos, stock, orders and sales — you manage from the **shop admin** on your phone. The Google Sheet is no longer used.

---

## Log in

1. Open **…/traphouse/admin/** on your phone. Tip: add it to your home screen (browser menu → *Add to Home screen*).
2. Enter your email and password and tap **Log in**.

You stay logged in on that phone. To log out, go to **Home** and tap **Log out** at the bottom.

At the bottom of every admin screen there are five tabs:

| Tab | What it's for |
|---|---|
| **Home** | Today's numbers: items in stock, waiting orders, sales, and sizes that are running low |
| **Stock** | Every product and size with how many you have — tap one to restock or edit it |
| **Orders** | Website orders waiting for you to confirm or cancel |
| **Sell** | Record a sale made on WhatsApp or in the shop |
| **Sales** | Sales history, with a download for Excel |

---

## How stock works

Each size of a product has its own count. The admin shows four numbers for every size:

| | Meaning |
|---|---|
| **On hand** | How many you physically have |
| **Held** | How many are held by website orders that are still waiting (up to 24 hours) |
| **Avail.** | How many customers can still order: on hand minus held |
| **Sold** | How many have been sold, ever |

- When every size of a product has 0 available, the shop shows it as **Sold out** by itself. You never need to mark anything sold out.
- When 3 or fewer of a size are left, the shop shows **"Only 2 left"**.
- A customer can order at most 5 of the same item and 15 items in total.

---

## Add a product

1. Tap **+ Product** (on Home or Stock).
2. Fill in:
   - **Name**, e.g. `Fear Zip Hoodie`
   - **Category** — choose one, or **+ New category…** to type a new one (it gets its own button in the shop)
   - **Price (RWF)** — just the number, e.g. `40000`. Leave it empty to show "Price on request".
3. **Photos:** tap **+ Main photo** and take a photo or choose one from your gallery. Add more (back view, someone wearing it) with **+ More photos**. Photos are made smaller on your phone before uploading, so this works fine on mobile data.
4. **Colours** (optional): tap **+ Add colour**, type the colour, and add a photo of that colour if you have one.
5. **Sizes & stock:** for each size, type the size (`M`, `32`, `One Size`…) and use **−** / **+** to set how many you have. Tap **+ Add size** for more sizes.
   If a product comes in several colours and you want to count each colour separately, add one row per size and colour, and pick the colour in each row.
6. Tap **Add product**. It's in the shop straight away.

Photos look best on a plain white background.

## Restock (new delivery)

1. Tap **Stock**, find the product (search or filters at the top) and tap the size.
2. Use **+** to set how many arrived, add a note if you like ("new delivery"), and tap **Add … to stock**.

## Change a product

**Stock** → tap the product → **Edit product**. Change anything and tap **Save changes**.

- Changing a size's number here counts as a correction (e.g. after counting your stock). For new deliveries use **Restock** instead, so your records stay clear.
- Removing a size hides it; its history is kept.

## Hide a product (instead of deleting)

Open the product and tap the **Visible in the shop** switch at the top. It changes to **Hidden from the shop** straight away: customers can't see or order it, but nothing is deleted. Tap it again to bring the product back.

---

## Orders from the website

When a customer taps **Order on WhatsApp**, you get a WhatsApp message like *"I'd like to order (order TH-1042)…"* and the order appears under **Orders → Waiting**, with the customer's name and phone, the items, and how much time is left.

- **Confirm** — once you've agreed with the customer (paid, or delivery arranged). The items are counted as sold and leave your stock.
- **Cancel** — if the customer changes their mind or doesn't answer. Tap **Cancel**, then **Tap to cancel** to be sure. The items go back on sale.

**If you do nothing for 24 hours,** the hold ends by itself and the items go back on sale. The order moves to **Orders → Expired**. If the customer still wants it, you can still **Confirm** it as long as the items haven't been bought by someone else; otherwise **Cancel** it to tidy up.

**Returns:** under **Orders → Done**, open the order and tap **Cancel / return**. The items go back into your stock.

## Record a sale (WhatsApp or in the shop)

For sales that didn't come through the website:

1. Tap **Sell**.
2. Choose the **Product**, the **Size** (it shows how many are available) and, if needed, the **Colour**.
3. Set the **Quantity**. The **price** is filled in from the shop — change it if you gave a discount.
4. Tap **+ Add another item** for more items in the same sale.
5. Customer name, phone and a note (e.g. "paid with MoMo") are optional.
6. Tap **Record sale**. The stock goes down and the sale appears in your sales.

## Sales history

Tap **Sales**. Choose **Today**, **This week**, **This month** or **Last 30 days**, or pick your own dates. You see the number of sales, items and revenue, and every sale. **Export CSV** downloads the list (one line per item) to open in Excel or Google Sheets.

---

## Good to know

- **Sharing products:** every product has its own link, e.g. `…/traphouse/product/fear-zip-hoodie/`. On WhatsApp or Instagram it shows the photo and name. A brand-new product's link works straight away; its preview picture appears within about an hour.
- **Backup:** if the database can't be reached, the website shows a backup copy of your products from up to an hour before, and customers can still send orders on WhatsApp (without holding the items).
- **The website rebuilds itself every hour.** This also keeps your free database awake (it pauses after a week with no visits). GitHub pauses hourly jobs if nothing in the repository changes for 60 days. If product links stop updating, open the **Actions** tab on github.com → **Deploy to GitHub Pages** → **Enable workflow** / **Run workflow**.
- **Add someone to the admin** (e.g. staff): in Supabase go to **Authentication → Users → Add user → Create new user** (tick *Auto Confirm User*), then in **SQL Editor** run:
  `insert into public.admins (user_id) select id from auth.users where email = 'their@email.com';`
  To remove them, delete the user under **Authentication → Users**.
- **Forgot your password:** in Supabase, **Authentication → Users**, delete your user and create it again with a new password, then run the line above again with your email. Your products and sales are not affected.
- **WhatsApp number or address:** these are in `lib/config.ts`. Ask your developer to change them.

---

## For developers

Next.js (App Router) + Tailwind, exported as a static site (`output: 'export'`, `basePath: '/traphouse'`, root on Vercel) and deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push and hourly. There is no server code: all logic lives in Supabase (Postgres functions + RLS, Auth, Storage).

**Data** — `supabase/migrations/` (run in order in the SQL Editor, or `npx supabase db push`):
- `products`, `variants` (one per size [+ colour], holds `on_hand`), `orders`, `order_items` (snapshot of name/size/colour/price), `stock_movements` (audit log), `admins`.
- Reserved = qty in `pending` orders with `expires_at > now()`; available = on_hand − reserved. Expiry needs no job. View `inventory` (admins) has on_hand/reserved/available/sold per variant.
- All stock changes go through `SECURITY DEFINER` functions that lock variant rows and log a movement: `place_order` (public), `confirm_order`, `cancel_order`, `restock`, `record_sale`, `save_product`, `admin_stats` (admins, checked with `is_admin()`). Clients can't write `variants`, `orders`, `order_items` or `stock_movements` at all; admins may update product details directly. `shop_catalog()` is the shop's single read.
- Storage bucket `products` is public-read, admin-write. Imported photos sit at the bucket root (copies remain in `public/images` as fallback); new uploads go to `<slug>/<random>.jpg`, compressed in the browser (`lib/image.ts`).

**Front end** — the shop calls `shop_catalog` / `place_order` with plain `fetch` (`lib/shop-api.ts`); the admin (`app/admin`, `components/admin`) uses `@supabase/supabase-js`. `npm run build` runs `scripts/snapshot.mjs` first (saves the catalogue to `public/products.yml`: offline fallback, page titles and previews; falls back to the repo's `products.yml`) and `scripts/flatten-rsc.mjs` after (the static export writes nested RSC payloads into folders the client requests as flat `__next.a.b.__PAGE__.txt` files; this copies them). Unknown `/product/<slug>/` paths render from live data via `404.html`.

**Keys** — `.env.local` (git-ignored): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` (only for `scripts/migrate-from-sheet.mjs`; never in the site or CI). GitHub Actions needs the two `NEXT_PUBLIC_…` values as repository secrets.

```bash
npm install
npm run dev                          # http://localhost:3000/traphouse/
npm run build                        # static site in out/
npm run test:db                      # stock/permission tests on the migrations (in-memory Postgres)
node scripts/check-supabase.mjs      # checks the live project's public permissions
node scripts/snapshot.mjs products.yml   # refresh the repo's fallback catalogue
node scripts/migrate-from-sheet.mjs --dry-run   # one-time import from the old Google Sheet
```
