# Trap House Society — Online Catalogue

Your shop website: **https://rossylndawi-gif.github.io/traphouse/**

Customers browse the products, add them to a cart, and send you the order on WhatsApp (+250 791 449 915).

There are two places you manage the shop:

| What you want to change | Where |
|---|---|
| Prices, sizes, sold out, adding or removing products | **Your Google Sheet** |
| Product photos | **The `public/images` folder on github.com** |

**Changes show on the website within about 5 minutes.** If you don't see a change, wait a few minutes and refresh the page.

---

## Your Google Sheet

The website reads every product from your Google Sheet. Each row is one product. The columns are:

| Column | What to write | Example |
|---|---|---|
| **Name** | The product name | `Fear Zip Hoodie` |
| **Category** | One of the categories below | `Hoodies & Jackets` |
| **Price (RWF)** | The price in francs. Leave it **empty** to show "Price on request" | `40,000` |
| **Size** | The size you have | `L` |
| **Sold Out** | `YES` or `NO` | `NO` |
| **Colours** | The colours, separated by commas | `green, red` |
| **Colour Photos** | One photo per colour, in the **same order** as Colours. Leave empty if there's only one colour | `tee-green.jpg, tee-red.jpg` |
| **Main Photo** | The photo shown in the product list | `hoodie-fear-front.jpg` |
| **Extra Photos** | More photos (back view, someone wearing it), separated by commas. Can be empty | `hoodie-fear-back.jpg` |

**Categories:** `Shirts`, `T-Shirts`, `Polos & Knits`, `Tanks`, `Hoodies & Jackets`, `Bottoms`, `Boxers`, `Accessories`.
If you type a new category name, the website adds a button for it automatically.

### Change a price

Change the number in **Price (RWF)**. The website shows `40,000` as **40,000 RWF**.

### Mark a product as sold out

Type `YES` in **Sold Out**. The product stays on the website, but it turns grey, gets a **SOLD OUT** badge and a crossed-out price, and customers can't add it to the cart. Change it back to `NO` when it's back in stock.

### Change a size

Change the text in **Size**, for example `M`, `L`, `32` or `One Size`. The size is shown on the product and included in the customer's WhatsApp order.

### Add a product

1. Upload the photo(s) first (see below).
2. Add a new row to the sheet and fill in the columns.
3. The photo names must match the uploaded files **exactly**, including `.jpg`.

The product shows up in the shop within about 5 minutes. Its own shareable link (with the photo preview in WhatsApp) is ready within about an hour.

### Remove a product

Delete its row. If you might sell it again, set **Sold Out** to `YES` instead.

### If a row has a mistake

If a row is filled in wrongly, the website **skips only that row** and shows everything else. For example, this happens when the price isn't a number, the main photo is empty, Sold Out isn't YES or NO, or there aren't the same number of colours and colour photos. Fix the row and it comes back within about 5 minutes.

> Keep the first row (the column names) exactly as it is. The website uses those names to find each column.

---

## Upload photos (on github.com)

1. Go to **github.com/rossylndawi-gif/traphouse** and sign in.
2. Open the **`public`** folder, then the **`images`** folder.
3. Tap **Add file → Upload files**.
4. Choose your photos and tap **Commit changes**.

Tips:
- Name photos in **small letters with dashes**, no spaces. Example: `hoodie-zip-black-front.jpg`
- Photos on a plain white background look best.
- Keep photos under about 1 MB. Photos you've sent through WhatsApp are already small enough.
- After uploading, wait about 5 minutes before using the photo name in the sheet.

If a photo name in the sheet doesn't match any uploaded file, the product shows a grey box instead of the photo. Check the spelling.

---

## Good to know

- **Sharing products:** every product has its own link, for example
  `https://rossylndawi-gif.github.io/traphouse/product/fear-zip-hoodie/`.
  When you share it on WhatsApp or Instagram, it shows the product photo and name.
- **Backup:** if Google Sheets is ever down, the website shows a backup copy of your products from up to an hour before. You don't need to do anything.
- **The website rebuilds itself every hour** to keep product links and the backup up to date. GitHub pauses hourly jobs if nothing in the repository changes for 60 days. If product links ever stop updating, open the **Actions** tab → **Deploy to GitHub Pages** → **Enable workflow** / **Run workflow**.
- **WhatsApp number, address or sheet link:** these are in `lib/config.ts`. Ask your developer to change them.

---

## For developers

Next.js (App Router) + Tailwind, exported as a static site (`output: 'export'`, `basePath: '/traphouse'`) and deployed by `.github/workflows/deploy.yml` on every push and hourly.

- The browser fetches the published sheet CSV on page load (`lib/load.ts`). It falls back to `/products.yml` if the sheet can't be reached, has missing columns, or has no usable rows. Bad rows are skipped and logged to the console with their row and column (`lib/products.ts`).
- `npm run build` first runs `scripts/snapshot.mjs`, which saves the sheet as `public/products.yml`. That file is used for the backup and for the product pages' titles and preview images. If the sheet is unreachable at build time, the repo's `products.yml` is used. Refresh that file with `node scripts/snapshot.mjs products.yml`.
- Products added to the sheet after the last build are still reachable at `/product/<slug>/`: GitHub Pages serves `404.html`, which renders the product from the live sheet.

```bash
npm install
npm run dev     # http://localhost:3000/traphouse/
npm run build   # static site in out/
```
