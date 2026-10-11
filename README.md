# Trap House Society — Online Catalogue

Your shop website: **https://rossylndawi-gif.github.io/traphouse/**

Customers browse the products, add them to a cart, and send you the order on WhatsApp (+250 791 449 915).

Everything on the website comes from **one file: `products.yml`**. You can change it from your phone or computer on github.com. No computer skills or extra programs needed.

**After every change, the website updates in about 1 minute.** If you don't see it, refresh the page.

---

## How to edit a file on github.com

1. Go to **github.com/rossylndawi-gif/traphouse** and sign in.
2. Tap the file **`products.yml`**.
3. Tap the **pencil icon ✏️** (top right of the file) to edit.
4. Make your change.
5. Tap the green **Commit changes…** button, then **Commit changes** again.

That's it. The website updates itself.

---

## Change a price

Find the product in `products.yml` and change its `price:` line:

```yaml
  price: 45000
```

The website shows this as **45,000 FRW**. You can also write `price: 45,000 FRW`; that works too.

If you don't want to show a price yet, write `price: TBD`. The website then shows **"Price on request"**.

---

## Mark a product as sold out

Change `sold_out: false` to `sold_out: true`:

```yaml
  sold_out: true
```

The product stays on the website, but it turns grey, gets a **SOLD OUT** badge, and customers can't add it to the cart.

When it's back in stock, change it back to `sold_out: false`.

---

## Upload new photos

1. On github.com, open the **`images`** folder.
2. Tap **Add file → Upload files**.
3. Choose your photos and tap **Commit changes**.

Tips:
- Name photos in **small letters with dashes**, no spaces. Example: `hoodie-zip-black-front.jpg`
- Photos on a plain white background look best.
- Keep photos under about 1 MB. Photos you've sent through WhatsApp are already small enough.
- The name in `products.yml` must match the photo's file name **exactly**.

---

## Add a new product

1. Upload the photo(s) first (see above).
2. Open `products.yml` and tap the pencil ✏️.
3. Copy an existing product block and paste it **at the very end** of the file.
4. Change the details:

```yaml
- name: Black Logo Hoodie
  category: Hoodies & Jackets
  price: 55000
  colors: [black]
  image: hoodie-logo-black.jpg
  sold_out: false
```

**Rules that matter:**
- Every product starts with `- name:` (dash, space, name).
- The lines under it start with **two spaces**.
- There must be a **space after every colon** (`price: 55000`, not `price:55000`).
- Leave an empty line between products (this just keeps it tidy).

**Categories you can use:**
`Shirts`, `T-Shirts`, `Polos & Knits`, `Tanks`, `Hoodies & Jackets`, `Bottoms`, `Boxers`, `Accessories`

(If you type a new category name, the website makes a new filter button for it automatically.)

---

## A product with several colours

List the colours, then list one photo for each colour **in the same order**. When a customer taps a colour, the photo changes.

```yaml
- name: AMI Heart Raglan Tee
  category: T-Shirts
  price: 35000
  colors: [green, red]
  images: [tee-ami-raglan-green.jpg, tee-ami-raglan-red.jpg]
  image: tee-ami-raglan-green.jpg
  sold_out: false
```

`image:` is the main photo shown in the product list.

## Extra photos (back view, someone wearing it)

Add a `gallery:` line. Customers can swipe through these on the product page:

```yaml
  gallery: [hoodie-zip-fear-grey-back.jpg]
```

## Sizes (optional)

If you add sizes, customers must pick one before adding to the cart:

```yaml
  sizes: [S, M, L, XL]
```

If you leave sizes out, customers tell you their size on WhatsApp.

## Description (optional)

```yaml
  description: Heavy 400gsm cotton, oversized fit.
```

## Remove a product

Delete its whole block (from `- name:` down to `sold_out:`). If you might sell it again, mark it `sold_out: true` instead.

---

## If something goes wrong

If there's a typing mistake in `products.yml`, the website shows a message saying **which line** has the problem. Open the file, look at that line, fix it, and commit again.

The usual mistakes are:
- A missing space after `:`
- Using the **Tab** key instead of spaces
- A missing `-` before `name:`
- A photo name that doesn't match the uploaded file (that product then shows a grey box instead of the photo)

You can always undo: on github.com, open the file → **History** → pick the last version that worked.

---

## Change the WhatsApp number or address

Open `assets/app.js` and edit the **SHOP SETTINGS** block at the very top. Change only the text between the quotes.
