/**
 * Shop settings — edit these if your number, address or sheet link changes.
 */

/** Published Google Sheet (File → Share → Publish to web → CSV). */
export const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_2TF_pMLV_dfSMFkT3zxjmROTHfStT3QTFT7TeUH3hKKJpIlGcsp07kextK5pkg/pub?gid=1915751725&single=true&output=csv";

/** WhatsApp number orders go to: country code + number, no "+" or spaces. */
export const WHATSAPP_NUMBER = "250791449915";
export const WHATSAPP_DISPLAY = "+250 791 449 915";

export const SHOP_NAME = "Trap House Society";
export const ADDRESS = "Remera Kisimenti, behind Ecobank, KG 18, Kigali, Rwanda";
export const MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=Ecobank+Remera+Kisimenti+KG+18+Kigali";

/** Order of the category buttons. Categories in the sheet but not listed here appear at the end. */
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
export const photo = (file: string) => asset("images/" + file);
