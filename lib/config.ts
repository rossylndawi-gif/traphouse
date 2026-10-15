/**
 * Shop settings — edit these if your number or address changes.
 */

/** Supabase project (set in .env.local and in the GitHub Actions secrets). */
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
/** Publishable key: safe in the browser, it only allows what the database policies allow. */
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** Most of one item, and items in total, a customer can order at once (also enforced in place_order). */
export const MAX_PER_ITEM = 5;
export const MAX_PER_ORDER = 15;

/** WhatsApp number orders go to: country code + number, no "+" or spaces. */
export const WHATSAPP_NUMBER = "250791449915";
export const WHATSAPP_DISPLAY = "+250 791 449 915";

export const SHOP_NAME = "Trap House Society";
export const ADDRESS = "Remera Kisimenti, behind Ecobank, KG 18, Kigali, Rwanda";
export const MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=Ecobank+Remera+Kisimenti+KG+18+Kigali";

/** Order of the category buttons. Other categories appear at the end. */
export const CATEGORY_ORDER = [
  "Shirts",
  "T-Shirts",
  "Polos & Knits",
  "Tanks",
  "Hoodies & Jackets",
  "Bottoms",
  "Boxers",
  "Accessories",
];

/** Set in next.config.ts: "" on Vercel, "/traphouse" on GitHub Pages. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "/traphouse";
/** Full public address of the site (used for link previews). */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://rossylndawi-gif.github.io/traphouse";

/** Public file URL, e.g. asset("images/x.jpg") → "/traphouse/images/x.jpg". */
export const asset = (path: string) => `${BASE_PATH}/${path.replace(/^\/+/, "")}`;

/** Product photo URL from its path in the "products" Storage bucket. */
export const photo = (file: string) =>
  /^https?:\/\//.test(file) ? file : `${SUPABASE_URL}/storage/v1/object/public/products/${file.split("/").map(encodeURIComponent).join("/")}`;
/** Copy kept in the repo for photos imported from the old site (used if Storage can't be reached). */
export const localPhoto = (file: string) => (file.includes("/") ? null : asset("images/" + file));
