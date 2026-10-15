/**
 * Turns the shop catalogue (Supabase shop_catalog(), or the products.yml
 * backup in the same format) into products.
 * Runs in the browser (live data) and at build time (page titles/previews).
 */

import { NEW_DAYS } from "./config";

export type Variant = {
  id: string;
  size: string;
  /** "" = this size is the same stock for every colour */
  colour: string;
  /** How many can still be ordered (stock minus open reservations). */
  available: number;
};

export type Product = {
  /** URL slug, e.g. "fear-zip-hoodie" */
  id: string;
  name: string;
  category: string;
  /** Whole Rwandan francs; null = price on request. */
  price: number | null;
  colors: string[];
  /** Photo for each colour, same order as colors (null when not given). */
  colorImages: (string | null)[];
  image: string;
  gallery: string[];
  variants: Variant[];
  /** Every size is at 0. */
  soldOut: boolean;
  /** Added in the admin within the last NEW_DAYS days. */
  isNew: boolean;
};

/** One product as shop_catalog() returns it. */
export type CatalogItem = {
  slug: string;
  name: string;
  category: string;
  price_rwf: number | null;
  colours: string[];
  colour_photos: string[];
  main_photo: string;
  extra_photos: string[];
  created_at?: string;
  variants: { id: string; size: string; colour: string; available: number }[];
};

/* ── Helpers ──────────────────────────────────────────── */

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const formatRWF = (n: number) => n.toLocaleString("en-US") + " RWF";
export const priceText = (p: Pick<Product, "price">) =>
  p.price == null ? "Price on request" : formatRWF(p.price);

const strings = (v: unknown) => (Array.isArray(v) ? v.map((x) => (x == null ? "" : String(x).trim())) : []);

/** Sizes that apply to a colour ("" = product without colours). */
export const sizesFor = (p: Product, color: string) =>
  p.variants.filter((v) => !v.colour || !color || v.colour === color);

/** Distinct size names, in the shop's order. */
export const sizeNames = (p: Product) => [...new Set(p.variants.map((v) => v.size))];

export const colorSoldOut = (p: Product, color: string) => sizesFor(p, color).every((v) => v.available <= 0);

/* ── Catalogue → products ─────────────────────────────── */

export function fromCatalog(data: unknown, now = Date.now()): Product[] {
  if (!Array.isArray(data)) throw new Error("catalogue should be a list of products");
  const newSince = now - NEW_DAYS * 86400_000;
  return data.flatMap((d): Product[] => {
    const o = (d ?? {}) as Partial<CatalogItem>;
    if (!o.slug || !o.name) return [];
    const colors = strings(o.colours).filter(Boolean);
    const colourPhotos = strings(o.colour_photos);
    const variants = (Array.isArray(o.variants) ? o.variants : []).flatMap((v) =>
      v && typeof v.id === "string"
        ? [{ id: v.id, size: String(v.size ?? ""), colour: String(v.colour ?? ""), available: Math.max(0, Number(v.available) || 0) }]
        : [],
    );
    const price = o.price_rwf == null || o.price_rwf === ("" as unknown) ? null : Number(o.price_rwf);
    return [
      {
        id: o.slug,
        name: o.name,
        category: o.category || "Other",
        price: price != null && Number.isFinite(price) ? price : null,
        colors,
        colorImages: colors.map((_, k) => colourPhotos[k] || null),
        image: o.main_photo || colourPhotos.find(Boolean) || "",
        gallery: strings(o.extra_photos).filter(Boolean),
        variants,
        soldOut: variants.every((v) => v.available <= 0),
        isNew: !!o.created_at && new Date(o.created_at).getTime() > newSince,
      },
    ];
  });
}

export function categoriesOf(products: Product[], order: string[]) {
  const present = [...new Set(products.map((p) => p.category))];
  return [...order.filter((c) => present.includes(c)), ...present.filter((c) => !order.includes(c))];
}
