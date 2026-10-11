/**
 * Turns the Google Sheet (CSV) or the products.yml backup into products.
 * Runs in the browser (live data) and at build time (page titles/previews).
 * A row with bad or missing data is skipped and reported; it never stops the page.
 */

export type Product = {
  id: string;
  /** Sheet row number (or list position in products.yml), for error messages. */
  row: number;
  name: string;
  category: string;
  /** Whole Rwandan francs; null = price on request. */
  price: number | null;
  size: string;
  soldOut: boolean;
  colors: string[];
  /** Photo for each colour, same order as colors (null when not given). */
  colorImages: (string | null)[];
  image: string;
  gallery: string[];
};

export type Problem = { row: number; column: string; message: string };

/** One product row before checking, with the sheet's column names. */
type RawRow = {
  row: number;
  Name: string;
  Category: string;
  "Price (RWF)": string;
  Size: string;
  "Sold Out": string;
  Colours: string;
  "Colour Photos": string;
  "Main Photo": string;
  "Extra Photos": string;
};

export const COLUMNS = [
  "Name",
  "Category",
  "Price (RWF)",
  "Size",
  "Sold Out",
  "Colours",
  "Colour Photos",
  "Main Photo",
  "Extra Photos",
] as const;

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

const splitList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const PHOTO = /^[^\s/\\]+\.(jpe?g|png|webp|gif|avif)$/i;

/** RFC 4180 CSV: quoted fields, "" escapes, commas and newlines inside quotes. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(f);
      f = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f);
      rows.push(row);
      row = [];
      f = "";
    } else f += c;
  }
  if (f || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows;
}

/* ── Sources → raw rows ───────────────────────────────── */

/** Throws if the header is missing a column (then the whole sheet is unusable). */
export function rowsFromCSV(text: string): RawRow[] {
  const [head = [], ...rows] = parseCSV(text.replace(/^﻿/, ""));
  const index = (name: string) => head.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const missing = COLUMNS.filter((c) => index(c) < 0);
  if (missing.length) throw new Error(`Sheet is missing column(s): ${missing.join(", ")}`);
  const at = Object.fromEntries(COLUMNS.map((c) => [c, index(c)]));
  return rows.flatMap((r, i) => {
    if (!r.some((x) => x.trim())) return []; // blank line
    const raw = { row: i + 2 } as RawRow; // +2: header is row 1
    for (const c of COLUMNS) raw[c] = (r[at[c]] ?? "").trim();
    return [raw];
  });
}

/** products.yml backup (same fields, older key names). */
export function rowsFromYAML(data: unknown): RawRow[] {
  if (!Array.isArray(data)) throw new Error("products.yml should be a list of products");
  const str = (v: unknown) => (v == null ? "" : String(v).trim());
  const lst = (v: unknown) => (Array.isArray(v) ? v.map(str).join(", ") : str(v));
  return data.map((d, i) => {
    const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
    const sold = o.sold_out;
    return {
      row: i + 1,
      Name: str(o.name),
      Category: str(o.category),
      "Price (RWF)": /^tbd$/i.test(str(o.price)) ? "" : str(o.price),
      Size: str(o.size),
      "Sold Out": sold === true ? "YES" : sold === false || sold == null ? "NO" : str(sold),
      Colours: lst(o.colors),
      "Colour Photos": lst(o.images),
      "Main Photo": str(o.image),
      "Extra Photos": lst(o.gallery),
    };
  });
}

/* ── Raw rows → products (row-by-row checks) ──────────── */

export function toProducts(rows: RawRow[]): { products: Product[]; problems: Problem[] } {
  const products: Product[] = [];
  const problems: Problem[] = [];
  const ids = new Map<string, number>();

  for (const r of rows) {
    const bad: Problem[] = [];
    const fail = (column: string, message: string) => bad.push({ row: r.row, column, message });

    if (!r.Name) fail("Name", "is empty");
    if (!r.Category) fail("Category", "is empty");

    let price: number | null = null;
    const pr = r["Price (RWF)"].replace(/\s*(rwf|frw)\s*/gi, "");
    if (pr) {
      if (/^\d{1,3}(,\d{3})+$|^\d+$/.test(pr)) price = Number(pr.replace(/,/g, ""));
      else fail("Price (RWF)", `"${r["Price (RWF)"]}" is not a number (use e.g. 20,000 or leave empty)`);
    }

    const sold = r["Sold Out"].toUpperCase();
    if (sold && sold !== "YES" && sold !== "NO") fail("Sold Out", `"${r["Sold Out"]}" should be YES, NO or empty`);

    const colors = splitList(r.Colours);
    const colorPhotos = splitList(r["Colour Photos"]);
    const extra = splitList(r["Extra Photos"]);
    if (colorPhotos.length && colorPhotos.length !== colors.length)
      fail("Colour Photos", `has ${colorPhotos.length} photo(s) but Colours has ${colors.length}`);

    const main = r["Main Photo"] || colorPhotos[0] || "";
    if (!main) fail("Main Photo", "is empty");
    for (const [col, files] of [
      ["Main Photo", r["Main Photo"] ? [r["Main Photo"]] : []],
      ["Colour Photos", colorPhotos],
      ["Extra Photos", extra],
    ] as const)
      for (const f of files) if (!PHOTO.test(f)) fail(col, `"${f}" is not a photo file name (e.g. tee-black.jpg)`);

    if (bad.length) {
      problems.push(...bad);
      continue;
    }

    let id = slugify(r.Name) || "item";
    const n = (ids.get(id) ?? 0) + 1;
    ids.set(id, n);
    if (n > 1) id += "-" + n;

    products.push({
      id,
      row: r.row,
      name: r.Name,
      category: r.Category,
      price,
      size: r.Size,
      soldOut: sold === "YES",
      colors,
      colorImages: colors.map((_, k) => colorPhotos[k] ?? null),
      image: main,
      gallery: extra,
    });
  }
  return { products, problems };
}

export function categoriesOf(products: Product[], order: string[]) {
  const present = [...new Set(products.map((p) => p.category))];
  return [...order.filter((c) => present.includes(c)), ...present.filter((c) => !order.includes(c))];
}

export function describeProblem(p: Problem, source: string) {
  return `[products] ${source} row ${p.row}, column "${p.column}": ${p.message} — row skipped`;
}
